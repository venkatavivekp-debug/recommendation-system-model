"""Seed-42 A/B/C pilot on one frozen, audited Amazon cohort."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import torch

from amazon_data import file_digest, write_json
from data import ROOT, known_items
from multidomain_data import DOMAINS, load_inputs, prepare_multidomain
from multidomain_experiment import evaluate_domains, run, training_blockers
from multidomain_model import MultiDomainNeuMF, VARIANTS


def prediction_checks(model, dataset):
    checks = {}
    for index, domain in enumerate(DOMAINS):
        users = dataset['domain_users'][domain][:2]
        with torch.no_grad():
            scores = model(torch.tensor([users[0], users[1], users[0]]),
                           torch.tensor([0, 0, 1]), torch.full((3,), index))
        checks[domain] = {'finite': bool(torch.isfinite(scores).all()),
                          'different_users': bool(scores[0] != scores[1]),
                          'different_items': bool(scores[0] != scores[2])}
    if not all(all(values.values()) for values in checks.values()):
        raise ValueError(f'Prediction sanity check failed: {checks}')
    return checks


def pilot(config, results, modes):
    if config['seed'] != 42 or config.get('test_only'):
        raise ValueError('This pilot requires seed 42 and real data')
    manifest = json.loads((results / 'amazon_multidomain_prepared_manifest.json').read_text())
    for domain, path in config['inputs'].items():
        if file_digest(Path(path)) != manifest['prepared_files'][domain]['sha256']:
            raise ValueError('Prepared data changed since the audit')
    rows, sources = load_inputs(config['inputs'])
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'],
                                 config['user_min'], config['item_min'])
    if (dataset['statistics']['synthetic'] or not dataset['statistics']['users_in_all_three_domains']
            or dataset['leakage_audit']['violations'] or training_blockers(dataset)):
        raise ValueError('Dataset failed the real shared-user pilot gate')
    for domain in DOMAINS:
        history = known_items(dataset['pairs']['train'][domain] + dataset['pairs']['validation'][domain])
        if any(item in history[user] for user, item in dataset['pairs']['test'][domain]):
            raise ValueError('Repeated test positives need an explicit evaluation decision')
    output = {'generated_at': datetime.now(timezone.utc).isoformat(), 'seed': 42,
              'interpretation': 'Single-seed warm-start product-preference pilot, not replicated evidence',
              'split_scope': config['split_scope'], 'leakage_audit': dataset['leakage_audit'],
              'source_hashes': {d: s['sha256'] for d, s in sources.items()}, 'modes': {}}
    for mode in modes:
        comparisons = {}
        for variant in VARIANTS:
            settings = {**config, 'model_variant': variant, 'domain_balancing': mode}
            print(f'Training {variant}, {mode}', flush=True)
            directory, result = run(dataset, settings, sources)
            history = json.loads((directory / 'history.json').read_text())
            if history[-1]['train_loss'] >= history[0]['train_loss']:
                raise ValueError(f'Training loss did not decrease for {variant}/{mode}; inspect {directory}')
            checkpoint = torch.load(directory / 'best.pt', weights_only=True)
            model = MultiDomainNeuMF(**checkpoint['architecture'])
            model.load_state_dict(checkpoint['state_dict'])
            checks = prediction_checks(model, dataset)
            if evaluate_domains(model, dataset, settings['k'])[0] != result['domains']:
                raise ValueError('Checkpoint reload changed evaluation')
            repeat_path, repeated = run(dataset, settings, sources)
            if (repeated['domains'] != result['domains'] or
                    json.loads((repeat_path / 'history.json').read_text()) != history):
                raise ValueError('Same-seed repetition changed metrics or training history')
            comparisons[variant] = {'run': str(directory.relative_to(ROOT)), 'repeat_run': str(repeat_path.relative_to(ROOT)),
                                    'parameters': result['parameter_count'], 'domains': result['domains'], 'macro': result['macro'],
                                    'training': result['training'], 'first_train_loss': history[0]['train_loss'],
                                    'last_train_loss': history[-1]['train_loss'], 'prediction_checks': checks,
                                    'checkpoint_reload_equal': True, 'same_seed_repeat_equal': True,
                                    'first_epoch_draws': history[0]['domain_draws'],
                                    'available_examples': history[0]['available_examples']}
            print(json.dumps({'variant': variant, 'mode': mode, 'metrics': {d: result['domains'][d]['metrics'] for d in DOMAINS}}), flush=True)
        differences = {d: {variant: {metric: comparisons[variant]['domains'][d]['metrics'][metric] -
                                              comparisons['independent']['domains'][d]['metrics'][metric]
                                    for metric in ('precision', 'recall', 'ndcg')}
                           for variant in VARIANTS[1:]} for d in DOMAINS}
        output['modes'][mode] = {'models': comparisons, 'difference_from_independent': differences}
    write_json(results / 'amazon_multidomain_pilot.json', output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'data/processed/amazon2023/pilot/config.json')
    parser.add_argument('--results-dir', type=Path, default=ROOT / 'research/results')
    parser.add_argument('--modes', nargs='+', choices=('natural', 'balanced'), default=['natural'])
    args = parser.parse_args()
    if (args.results_dir / 'amazon_multidomain_pilot.json').exists():
        parser.error('Pilot summary exists; use a new results directory rather than overwrite')
    pilot(json.loads(args.config.read_text()), args.results_dir, args.modes)
