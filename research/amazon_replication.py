"""Replicate the frozen pilot at seeds 43/44; never select a new protocol."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

from amazon_data import file_digest, validate_artifacts, write_json
from amazon_diagnostics import (DOMAINS, PAIRS, aggregate, candidate_fingerprints, coverage_audit,
                                digest, observe_evaluation, paired_counts, training_budget, transfer_deltas)
from data import ROOT
from multidomain_data import load_inputs, prepare_multidomain
from multidomain_experiment import run
from multidomain_model import MultiDomainNeuMF, VARIANTS

RESULTS = ROOT / 'research/results'
MODES = ('natural', 'balanced')
FROZEN_FILES = ('research/data.py', 'research/model.py', 'research/multidomain_data.py',
                'research/multidomain_model.py', 'research/multidomain_experiment.py',
                'research/foundation.cjs', 'backend/src/research/rankingMetrics.js')


def read_json(path):
    return json.loads(path.read_text())


def load_model(path):
    checkpoint = torch.load(path / 'best.pt', weights_only=True)
    model = MultiDomainNeuMF(**checkpoint['architecture'])
    model.load_state_dict(checkpoint['state_dict'])
    return model, checkpoint


def verify_freeze(config, dataset, sources, pilot, results):
    validate_artifacts(results)
    hashes = {d: source['sha256'] for d, source in sources.items()}
    if hashes != pilot['source_hashes']:
        raise ValueError('Prepared source hashes changed since seed 42')
    checkpoints = {}
    for mode in MODES:
        for variant in VARIANTS:
            saved = pilot['modes'][mode]['models'][variant]
            path = ROOT / saved['run']
            model, checkpoint = load_model(path)
            expected = {**config, 'model_variant': variant, 'domain_balancing': mode}
            if checkpoint['config'] != expected:
                raise ValueError(f'Configuration changed: {mode}/{variant}')
            if (checkpoint['user_mapping'] != dataset['user_mapping'] or checkpoint['item_mapping'] != dataset['item_mapping']
                    or sum(p.numel() for p in model.parameters()) != saved['parameters']):
                raise ValueError('Mappings or parameter count changed')
            versions = read_json(path / 'metrics.json')['versions']
            if versions['torch'] != str(torch.__version__) or versions['numpy'] != np.__version__:
                raise ValueError('Library versions changed since seed 42')
            checkpoints[f'{mode}/{variant}'] = file_digest(path / 'best.pt')
    data = {key: dataset[key] for key in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')}
    return {'generated_at': datetime.now(timezone.utc).isoformat(), 'prepared_sha256': hashes,
            'dataset_sha256': digest(data), 'cohort_sha256': digest(sorted({r for r in dataset['user_mapping']})),
            'candidate_sha256': candidate_fingerprints(dataset), 'config': config, 'config_sha256': digest(config),
            'frozen_code_sha256': {name: file_digest(ROOT / name) for name in FROZEN_FILES},
            'seed42_checkpoint_sha256': checkpoints, 'seed42_artifact_sha256': file_digest(results / 'amazon_multidomain_pilot.json'),
            'versions': {'torch': str(torch.__version__), 'numpy': np.__version__}}


def parameter_updates(model, checkpoint, seed):
    torch.manual_seed(seed)
    initial = MultiDomainNeuMF(**checkpoint['architecture'])
    start = initial.state_dict()
    changes = {name: float(torch.linalg.vector_norm(value.detach() - start[name])) for name, value in model.named_parameters()}
    return {'l2_change_from_seeded_initialization': changes,
            'all_parameter_tensors_changed': all(v > 0 for v in changes.values()),
            'note': 'Checkpoint differences, not historical gradient measurements'}


def inspect_run(path, dataset, config, expected_domains=None):
    result = read_json(path / 'metrics.json')
    history = read_json(path / 'history.json')
    model, checkpoint = load_model(path)
    domains, macro, users, diagnostic = observe_evaluation(model, dataset, config['k'])
    if domains != result['domains'] or (expected_domains is not None and domains != expected_domains):
        raise ValueError('Checkpoint metrics changed from the saved primary evaluation')
    report = {'run': str(path.relative_to(ROOT)), 'checkpoint': str((path / 'best.pt').relative_to(ROOT)),
              'parameters': result['parameter_count'], 'domains': domains, 'macro': macro,
              'training': result['training'], 'budget': training_budget(history, config['batch_size']),
              'diagnostics': diagnostic}
    if config['model_variant'] == 'shared':
        report['parameter_updates'] = parameter_updates(model, checkpoint, config['seed'])
        # Diagnostic only: rank validation with train history, using the already selected checkpoint.
        validation = {**dataset, 'pairs': {**dataset['pairs'], 'validation': {d: [] for d in DOMAINS},
                                         'test': dataset['pairs']['validation']},
                      'coverage': {**dataset['coverage'], 'test': dataset['coverage']['validation']}}
        report['selected_checkpoint_validation_ranking'] = observe_evaluation(model, validation, config['k'])[0]
        report['validation_ranking_limit'] = 'Other epoch checkpoints were not retained; this does not describe all epochs'
    return report, users


def reproduce_seed42(dataset, config, sources, pilot):
    reference = pilot['modes']['natural']['models']['independent']
    settings = {**config, 'model_variant': 'independent', 'domain_balancing': 'natural'}
    print('Reproducing seed 42: independent/natural before replication', flush=True)
    path, result = run(dataset, settings, sources)
    original = ROOT / reference['run']
    if result['domains'] != reference['domains'] or read_json(path / 'history.json') != read_json(original / 'history.json'):
        raise ValueError('Seed-42 metrics/history no longer reproduce; replication stopped')
    _, current = load_model(path)
    _, previous = load_model(original)
    if not all(torch.equal(value, previous['state_dict'][key]) for key, value in current['state_dict'].items()):
        raise ValueError('Seed-42 checkpoint tensors no longer reproduce')
    return {'run': str(path.relative_to(ROOT)), 'metrics_equal': True, 'history_equal': True, 'checkpoint_tensors_equal': True}


def main(results):
    planned = ('freeze', 'seed42_diagnostics', 'seed43', 'seed44', 'summary_3seed', 'coverage', 'training_balance')
    if any((results / f'amazon_multidomain_{name}.json').exists() for name in planned):
        raise ValueError('Replication outputs already exist; inspect them rather than overwrite or rerun seeds')
    config = read_json(ROOT / 'data/processed/amazon2023/pilot/config.json')
    pilot = read_json(results / 'amazon_multidomain_pilot.json')
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'],
                                 config['user_min'], config['item_min'])
    freeze = verify_freeze(config, dataset, sources, pilot, results)
    freeze['seed42_reproduction'] = reproduce_seed42(dataset, config, sources, pilot)
    write_json(results / 'amazon_multidomain_freeze.json', freeze)
    print(f'Frozen dataset: {freeze["dataset_sha256"]}', flush=True)
    coverage = coverage_audit(rows, dataset, config, ROOT / 'data/processed/amazon2023/audit.sqlite')
    write_json(results / 'amazon_multidomain_coverage.json', {'generated_at': datetime.now(timezone.utc).isoformat(),
                                                          'dataset_sha256': freeze['dataset_sha256'], 'domains': coverage})
    seeds = []
    for seed in (42, 43, 44):
        report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'seed': seed,
                  'dataset_sha256': freeze['dataset_sha256'], 'candidate_sha256': freeze['candidate_sha256'], 'modes': {}}
        for mode in MODES:
            models, paired = {}, {}
            for variant in VARIANTS:
                settings = {**config, 'seed': seed, 'model_variant': variant, 'domain_balancing': mode}
                if seed == 42:
                    saved = pilot['modes'][mode]['models'][variant]
                    path = ROOT / saved['run']
                else:
                    print(f'Training seed {seed}: {variant}/{mode}', flush=True)
                    path, _ = run(dataset, settings, sources)
                models[variant], paired[variant] = inspect_run(path, dataset, settings,
                                                              saved['domains'] if seed == 42 else None)
                print(json.dumps({'seed': seed, 'mode': mode, 'model': variant,
                                  'ndcg': {d: models[variant]['domains'][d]['metrics']['ndcg'] for d in DOMAINS}}), flush=True)
            report['modes'][mode] = {'models': models, 'deltas': transfer_deltas(models),
                'paired_users': {d: {name: paired_counts(paired[left][d], paired[right][d])
                                     for name, (left, right) in PAIRS.items()} for d in DOMAINS}}
        name = 'seed42_diagnostics' if seed == 42 else f'seed{seed}'
        write_json(results / f'amazon_multidomain_{name}.json', report)
        seeds.append(report)
    for name, expected in freeze['frozen_code_sha256'].items():
        if file_digest(ROOT / name) != expected:
            raise ValueError('Frozen code changed during replication')
    summary = {'generated_at': datetime.now(timezone.utc).isoformat(), 'seeds': [42, 43, 44],
               'dataset_sha256': freeze['dataset_sha256'], 'sd_definition': 'Sample SD across three seeds (ddof=1)',
               'modes': aggregate(seeds), 'paired_users_by_seed': {str(s['seed']): {m: s['modes'][m]['paired_users'] for m in MODES} for s in seeds}}
    write_json(results / 'amazon_multidomain_summary_3seed.json', summary)
    write_json(results / 'amazon_multidomain_training_balance.json', {
        'generated_at': datetime.now(timezone.utc).isoformat(), 'confound': 'Balanced epochs have more examples and optimizer steps',
        'runs': {str(s['seed']): {mode: {v: m['budget'] for v, m in s['modes'][mode]['models'].items()} for mode in MODES} for s in seeds}})
    print('Seeds 43/44 and paired diagnostics complete; original pilot preserved', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results-dir', type=Path, default=RESULTS)
    args = parser.parse_args()
    main(args.results_dir)
