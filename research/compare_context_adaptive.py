"""Four-arm comparison using frozen replay controls and newly trained context models."""
import argparse
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

import torch

from adaptive import SETTINGS, read_ratings, replay
from context import CONTEXT_FEATURES
from data import ROOT
from model import NeuMF
from train import run


def verify_initialization(architecture, seed):
    torch.manual_seed(seed)
    plain = NeuMF(**architecture)
    torch.manual_seed(seed)
    context = NeuMF(**architecture, context_dim=len(CONTEXT_FEATURES))
    for name, value in plain.state_dict().items():
        other = context.state_dict()[name]
        if name == 'mlp.0.weight':
            assert torch.count_nonzero(other[:, value.shape[1]:]).item() == 0
            other = other[:, :value.shape[1]]
        assert torch.equal(value, other), f'Unpaired initial parameter: {name}'


def assert_matched(plain, context):
    """Compare query identity, candidates and revealed ratings, not model-dependent scores."""
    keys = ('user', 'timestamp', 'candidate_count', 'candidate_sha256', 'observed_ratings_before',
            'positive_targets', 'cold_events', 'recent_ratings')
    assert len(plain['groups']) == len(context['groups']), 'Different replay group counts'
    for left, right in zip(plain['groups'], context['groups']):
        assert all(left[key] == right[key] for key in keys), 'Different replay queries or candidates'
        feedback = lambda row: [(r['user'], r['item'], r['rating'], r['timestamp']) for r in row['feedback']]
        assert feedback(left) == feedback(right), 'Different revealed ratings'
    for key, value in plain['coverage'].items():
        if key != 'catalog_coverage':
            assert value == context['coverage'][key], f'Different coverage: {key}'
    for depth, value in plain['history_depths'].items():
        assert value['actual_history_counts'] == context['history_depths'][depth]['actual_history_counts']


def four_metrics(plain, context):
    return {f'{arm}_{model}': result[arm] for model, result in (('ncf', plain), ('context', context))
            for arm in ('static', 'adaptive')}


def aggregate(rows):
    return {arm: {metric: {'mean': statistics.mean(r[arm][metric] for r in rows),
                           'std': statistics.stdev(r[arm][metric] for r in rows)}
                  for metric in rows[0][arm]} for arm in rows[0]}


def compare(frozen_directory, output):
    directory = output / ('context-adaptive-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    directory.mkdir(parents=True, exist_ok=False)
    protocol = {
        'settings': SETTINGS, 'seeds': [42, 43, 44], 'context_features': CONTEXT_FEATURES,
        'frozen_replay': str(frozen_directory),
        'query_context': 'current timestamp group in UTC; shared by every ranked and updated item',
        'initialization': 'same seed, identical shared initial parameters; four extra MLP columns start at zero',
        'training': 'frozen train-only negative protocol; same samples/shuffles; independent minimum validation BCE checkpoints',
        'updates': 'only local current-user GMF/MLP vectors; context columns and all checkpoint weights frozen',
        'cohort': 'unchanged eligibility, events, candidates, history depths and positive-group macro-user metrics',
        'differences': 'controlled metric differences, not causal effects',
        'examples': 'seed42 largest/nearest-zero/smallest user nDCG difference: adaptive context minus adaptive NCF; first update group',
        'timing': 'CPU wall time; ranking includes scoring/sort, replay includes both arms and diagnostics, excludes serialization/training',
    }
    (directory / 'protocol.json').write_text(json.dumps(protocol, indent=2))
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    records, examples = [], []
    for seed in protocol['seeds']:
        frozen = json.loads((frozen_directory / f'replay-{seed}.json').read_text())
        path = Path(frozen['run'])
        training = json.loads((path / 'result.json').read_text())
        data = json.loads((path / 'data.json').read_text())
        config = training['config']
        if frozen['settings'] != SETTINGS or config['negative_scope'] != 'train' or config.get('context'):
            raise ValueError('Frozen control is incompatible with the fixed combined protocol')
        checkpoint = torch.load(path / 'best.pt', map_location='cpu', weights_only=True)
        verify_initialization(checkpoint['architecture'], seed)
        model = NeuMF(**checkpoint['architecture'])
        model.load_state_dict(checkpoint['state_dict'])
        ratings = read_ratings(config['ratings'])
        plain = replay(model, data, ratings)
        for key, value in plain.items():
            if key != 'timing':
                assert value == frozen[key], f'Frozen adaptive result changed: {seed} {key}'
        assert all(torch.equal(v, checkpoint['state_dict'][k]) for k, v in model.state_dict().items())
        context_path, context_training = run({**config, 'context': True, 'output': str(directory)})
        assert json.loads((context_path / 'data.json').read_text()) == data, 'Split/mapping mismatch'
        context_checkpoint = torch.load(context_path / 'best.pt', map_location='cpu', weights_only=True)
        context_model = NeuMF(**context_checkpoint['architecture'])
        context_model.load_state_dict(context_checkpoint['state_dict'])
        context = replay(context_model, data, ratings)
        assert_matched(plain, context)
        repeated = replay(context_model, data, ratings)
        assert all(v == repeated[k] for k, v in context.items() if k != 'timing'), 'Non-deterministic context replay'
        assert all(torch.equal(v, context_checkpoint['state_dict'][k]) for k, v in context_model.state_dict().items())
        for name, result in (('ncf', plain), ('context', context)):
            (directory / f'{name}-{seed}.json').write_text(json.dumps({
                'generated_at': datetime.now(timezone.utc).isoformat(), 'seed': seed, **result}, indent=2))
        metrics = four_metrics(plain['metrics'], context['metrics'])
        differences = {}
        for name, first, second in (
            ('adaptation_without_context', 'adaptive_ncf', 'static_ncf'),
            ('context_without_adaptation', 'static_context', 'static_ncf'),
            ('context_with_adaptation', 'adaptive_context', 'adaptive_ncf'),
            ('adaptation_with_context', 'adaptive_context', 'static_context'),
        ):
            differences[name] = {key: metrics[first][key] - metrics[second][key] for key in metrics[first]}
        depths = {depth: {**{k: v for k, v in values.items() if k not in ('metrics', 'matched_metrics')},
                          **{key: four_metrics(values[key], context['history_depths'][depth][key])
                             for key in ('metrics', 'matched_metrics')}}
                  for depth, values in plain['history_depths'].items()}
        diagnostics = {}
        for name, result in (('ncf', plain), ('context', context)):
            magnitudes = [row['embedding_delta_norm'] for row in result['groups']
                          if any(r['rating'] != 3 for r in row['feedback'])]
            diagnostics[name] = {**result['rank_diagnostics'], 'mean_embedding_update_norm': statistics.mean(magnitudes),
                                 'max_embedding_update_norm': max(magnitudes), 'timing': result['timing'],
                                 'catalog_coverage': result['coverage']['catalog_coverage']}
        user_rows = {model_name: {row['user']: row for row in result['users']}
                     for model_name, result in (('ncf', plain), ('context', context))}
        users = [{'user': user, 'metrics': four_metrics(row['metrics'], user_rows['context'][user]['metrics']),
                  'context_adaptive_ndcg_delta': user_rows['context'][user]['metrics']['adaptive']['ndcg'] - row['metrics']['adaptive']['ndcg']}
                 for user, row in user_rows['ncf'].items()]
        if seed == 42:
            ordered = sorted(users, key=lambda r: (r['context_adaptive_ndcg_delta'], r['user']))
            for label, user in (('largest_gain', ordered[-1]),
                                ('nearest_zero', min(ordered, key=lambda r: (abs(r['context_adaptive_ndcg_delta']), r['user']))),
                                ('largest_loss', ordered[0])):
                index = next(i for i, row in enumerate(context['groups'])
                             if row['user'] == user['user'] and row['embedding_delta_norm'] > 0)
                examples.append({'selection': label, **user,
                                 'first_update': {'ncf': plain['groups'][index], 'context': context['groups'][index]}})
        records.append({'seed': seed, 'ncf_run': str(path), 'context_run': str(context_path),
                        'parameter_counts': {'ncf': training['parameter_count'], 'context': context_training['parameter_count'],
                                             'adaptive_per_user': 2 * config['embedding_dim']},
                        'best_epochs': {'ncf': training['best_epoch'], 'context': context_training['best_epoch']},
                        'context_training_seconds': context_training['training_seconds'],
                        'metrics': metrics, 'differences': differences, 'coverage': plain['coverage'],
                        'history_depths': depths, 'diagnostics': diagnostics, 'users': users})
        print(json.dumps({'seed': seed, 'metrics': metrics}), flush=True)
    summary = {'generated_at': datetime.now(timezone.utc).isoformat(), 'protocol': protocol,
               'verification': {'frozen_replays_reproduced': True, 'initialization_paired': True,
                                'events_candidates_matched': True, 'context_replays_deterministic': True,
                                'checkpoint_parameters_unchanged': True},
               'runs': records, 'aggregate': aggregate([row['metrics'] for row in records]),
               'controlled_differences': aggregate([row['differences'] for row in records]),
               'history_depths': {depth: {key: aggregate([row['history_depths'][depth][key] for row in records])
                                         for key in ('metrics', 'matched_metrics')}
                                  for depth in records[0]['history_depths']}, 'examples': examples}
    (directory / 'comparison.json').write_text(json.dumps(summary, indent=2))
    print(f'Combined comparison saved to {directory}', flush=True)
    print(json.dumps(summary['aggregate'], indent=2), flush=True)
    return directory, summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Paired 2x2 context/adaptation replay comparison')
    parser.add_argument('frozen_replay', type=Path, help='Completed three-seed adaptive experiment directory')
    parser.add_argument('--output', type=Path, default=ROOT / 'research/runs')
    args = parser.parse_args()
    compare(args.frozen_replay, args.output)
