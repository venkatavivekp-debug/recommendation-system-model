"""Frozen training trajectories, two validation-only checkpoint decisions."""
from datetime import datetime, timezone

import torch

from amazon_data import file_digest, write_json
from amazon_diagnostics import DOMAINS, METRICS, candidate_fingerprints, digest, mean_sd
from amazon_replication import RESULTS, ROOT, load_model, read_json
from multidomain_data import load_inputs, prepare_multidomain
from multidomain_experiment import evaluate_domains, run, validation_view

RULES = {
    'criterion': 'macro_validation_ndcg@10', 'tie_break': 'earliest_epoch',
    'domains': list(DOMAINS), 'aggregation': 'unweighted_mean',
    'precision': 'Full JSON float precision, strict greater-than; no BCE tie breaker',
    'bce': 'Shared B/C: minimum mean per-domain validation BCE; A: minimum BCE per independent domain',
    'termination': 'Original BCE early stopping, patience and epoch cap unchanged',
    'model_a': 'BCE can combine different domain epochs; ranking selects one complete model epoch',
    'scope': 'Exploratory follow-up motivated by prior diagnostics; not independent confirmatory replication',
}


def summarize(runs):
    summary, disagreements = {}, []
    agreement = dict(improved=0, unchanged=0, worsened=0)
    for mode in ('natural', 'balanced'):
        summary[mode] = {}
        for variant in ('independent', 'shared', 'shared_domain_specific'):
            selected = [r for r in runs if r['mode'] == mode and r['variant'] == variant]
            summary[mode][variant] = {policy: {
                'domains': {d: {m: mean_sd([r['comparison'][policy]['domains'][d]['metrics'][m] for r in selected])
                                for m in METRICS} for d in DOMAINS},
                'macro': {m: mean_sd([r['comparison'][policy]['macro'][m] for r in selected]) for m in METRICS}}
                for policy in ('bce', 'ranking')}
    for row in runs:
        c = row['comparison']
        distances = [abs(e - c['ranking']['epoch']) for e in c['bce']['epochs'].values()]
        if any(distances):
            delta = c['ranking']['macro']['ndcg'] - c['bce']['macro']['ndcg']
            agreement['improved' if delta > 1e-12 else 'worsened' if delta < -1e-12 else 'unchanged'] += 1
            disagreements.append({'seed': row['seed'], 'mode': row['mode'], 'variant': row['variant'],
                'epoch_distances': distances, 'mean_epoch_distance': sum(distances) / len(distances),
                'validation_macro_delta': c['ranking']['validation_macro']['ndcg'] - c['bce']['validation_macro']['ndcg'],
                'test_macro_delta': delta,
                'domain_deltas': {d: c['ranking']['domains'][d]['metrics']['ndcg'] - c['bce']['domains'][d]['metrics']['ndcg'] for d in DOMAINS},
                'validation_peaks': {d: [e['epoch'] for e in c['validation_history'] if e['domains'][d]['metrics']['ndcg'] ==
                    max(v['domains'][d]['metrics']['ndcg'] for v in c['validation_history'])] for d in DOMAINS}})
    return {'three_seed_summary': summary,
            'disagreement_analysis': {'same_epoch_runs': len(runs) - len(disagreements),
                'different_epoch_runs': len(disagreements),
                'distance_definition': 'Per-run mean absolute distance from BCE domain epochs; A may be composite',
                'mean_epoch_distance': sum(r['mean_epoch_distance'] for r in disagreements) / len(disagreements) if disagreements else 0,
                'maximum_epoch_distance': max((max(r['epoch_distances']) for r in disagreements), default=0),
                'runs': disagreements},
            'validation_test_agreement': agreement}


def main():
    target = RESULTS / 'checkpoint_selection_comparison.json'
    if target.exists():
        raise ValueError('Comparison exists; do not overwrite or rerun')
    frozen = read_json(RESULTS / 'amazon_multidomain_freeze.json')
    config = frozen['config']
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'], config['user_min'], config['item_min'])
    assert {d: v['sha256'] for d, v in sources.items()} == frozen['prepared_sha256']
    assert digest({k: dataset[k] for k in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')}) == frozen['dataset_sha256']
    assert candidate_fingerprints(dataset) == frozen['candidate_sha256']
    for name, expected in frozen['frozen_code_sha256'].items():
        if name != 'research/multidomain_experiment.py':
            assert file_digest(ROOT / name) == expected, name
    original_hashes = {p: file_digest(p) for p in RESULTS.glob('*.json')}
    # Written before reading saved test metrics or running any new test evaluation.
    declaration = ROOT / 'research/runs/checkpoint_selection_declaration.json'
    declaration.parent.mkdir(parents=True, exist_ok=True)
    write_json(declaration, {'generated_at': datetime.now(timezone.utc).isoformat(), 'selection_rules': RULES,
                            'dataset_sha256': frozen['dataset_sha256'],
                            'trainer_sha256': file_digest(ROOT / 'research/multidomain_experiment.py')})
    print(RULES, flush=True)
    runs = []
    order = [('natural', 'shared')] + [(mode, variant) for mode in ('natural', 'balanced')
              for variant in ('independent', 'shared', 'shared_domain_specific') if (mode, variant) != ('natural', 'shared')]
    for mode, variant in order:
        for seed in (42, 43, 44):
            artifact = read_json(RESULTS / f'amazon_multidomain_{"seed42_diagnostics" if seed == 42 else "seed" + str(seed)}.json')
            original = artifact['modes'][mode]['models'][variant]
            history = read_json(ROOT / original['run'] / 'history.json')
            settings = read_json(ROOT / original['run'] / 'config.json')
            assert settings == {**config, 'seed': seed, 'model_variant': variant, 'domain_balancing': mode}
            if mode == 'natural' and variant == 'shared' and seed in (43, 44):
                diagnostic = read_json(RESULTS / 'natural_b_diagnostics.json')['seeds'][str(seed)]['natural']
                curve = [{'epoch': e['epoch'], **e['validation'], 'validation_bce': e['validation_loss']} for e in diagnostic['epochs']]
                peak = max(curve, key=lambda e: e['macro']['ndcg'])
                assert peak['epoch'] == original['training']['best_epochs']['shared']
                model, _ = load_model(ROOT / original['run'])
                torch.set_num_threads(1)
                validation, macro = evaluate_domains(model, validation_view(dataset), settings['k'])
                assert validation == peak['domains'] and macro == peak['macro']
                metrics = {'domains': original['domains'], 'macro': original['macro'],
                           'validation_bce': peak['validation_bce'],
                           'validation': validation, 'validation_macro': macro}
                runs.append({'mode': mode, 'variant': variant, 'seed': seed, 'run': original['run'],
                             'reconstructed': True, 'ranking_reload_validated': True,
                             'trajectory_and_bce_tensors_exact': diagnostic['history_and_checkpoint_exact'],
                             'comparison': {'bce': {**metrics, 'epochs': original['training']['best_epochs']},
                                            'ranking': {**metrics, 'epoch': peak['epoch']},
                                            'same_state': True, 'validation_history': curve}})
                print(f'Reconstructed Natural B seed {seed}: same saved state at epoch {peak["epoch"]}', flush=True)
                continue

            def verify_epoch(model, row):
                assert row == history[row['epoch'] - 1], 'Training trajectory changed; stop before test'

            print(f'Comparing {mode}/{variant}/seed{seed}', flush=True)
            path, result = run(dataset, {**settings, 'checkpoint_metric': 'macro_validation_ndcg'}, sources, verify_epoch)
            assert read_json(path / 'history.json') == history
            model, bce = load_model(path)
            _, previous = load_model(ROOT / original['run'])
            assert all(torch.equal(value, previous['state_dict'][key]) for key, value in bce['state_dict'].items())
            comparison = result['checkpoint_comparison']
            assert comparison['bce']['domains'] == original['domains']
            ranked = torch.load(path / 'ranking_best.pt', weights_only=True)
            model.load_state_dict(ranked['state_dict'])
            validation, macro = evaluate_domains(model, validation_view(dataset), settings['k'])
            assert validation == comparison['ranking']['validation']
            assert macro == comparison['ranking']['validation_macro']
            assert ranked['selected_epoch'] == comparison['ranking']['epoch']
            # Reload verification uses validation and exact tensors, not another test sweep.
            assert all(torch.equal(value, ranked['state_dict'][key]) for key, value in model.state_dict().items())
            if mode == 'natural' and variant == 'shared':
                diagnostic = read_json(RESULTS / 'natural_b_diagnostics.json')['seeds'][str(seed)]['natural']
                assert [e['domains'] for e in comparison['validation_history']] == [e['validation']['domains'] for e in diagnostic['epochs']]
                if seed in (43, 44):
                    assert comparison['same_state'] and comparison['bce']['domains'] == comparison['ranking']['domains']
            runs.append({'mode': mode, 'variant': variant, 'seed': seed, 'run': str(path.relative_to(ROOT)),
                         'trajectory_and_bce_tensors_exact': True, 'ranking_reload_validated': True,
                         'comparison': comparison})
            print('Selected', comparison['bce']['epochs'], comparison['ranking']['epoch'], 'test macro', comparison['bce']['macro']['ndcg'], comparison['ranking']['macro']['ndcg'], flush=True)
    for path, expected in original_hashes.items():
        assert file_digest(path) == expected, path
    write_json(target, {'generated_at': datetime.now(timezone.utc).isoformat(), 'selection_rules': RULES,
                       'predeclaration': read_json(declaration), 'dataset_sha256': frozen['dataset_sha256'],
                       'candidate_sha256': frozen['candidate_sha256'], 'runs': runs, **summarize(runs)})
    print('Saved', target, flush=True)


if __name__ == '__main__':
    main()
