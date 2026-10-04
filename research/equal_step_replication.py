"""Extend the frozen equal-step control with seeds 45, 46 and 47."""
import json
import statistics
from datetime import datetime, timezone

import torch

from amazon_data import file_digest, validate_artifacts, write_json
from amazon_diagnostics import DOMAINS, METRICS, candidate_fingerprints, digest
from amazon_replication import RESULTS, ROOT, load_model, read_json
from equal_step_control import assert_equal_budget
from multidomain_data import load_inputs, prepare_multidomain
from multidomain_experiment import evaluate_domains, run, validation_view

SEEDS = (45, 46, 47)
VARIANTS = ('shared', 'independent', 'shared_domain_specific')
MODES = ('natural', 'balanced')
TARGET = RESULTS / 'equal_step_balance_control_6seed.json'
PROGRESS = ROOT / 'research/runs/equal_step_45_47_progress.json'


def describe(values):
    return {'mean': statistics.mean(values),
            'sample_sd': statistics.stdev(values) if len(values) > 1 else 0.0,
            'median': statistics.median(values), 'min': min(values), 'max': max(values),
            'coefficient_of_variation': (statistics.stdev(values) / abs(statistics.mean(values))
                                         if len(values) > 1 and abs(statistics.mean(values)) >= 1e-6 else None)}


def paired_summary(natural, balanced, seeds):
    deltas = {str(seed): balanced[seed] - natural[seed] for seed in seeds}
    values = list(deltas.values())
    return {**describe(values), 'per_seed': deltas,
            'positive': sum(value > 1e-12 for value in values),
            'equal': sum(abs(value) <= 1e-12 for value in values),
            'negative': sum(value < -1e-12 for value in values)}


def summarize(runs):
    seeds = tuple(sorted({row['seed'] for row in runs}))
    assert seeds == (42, 43, 44, 45, 46, 47)
    assert len(runs) == len(seeds) * len(VARIANTS) * len(MODES)
    by_config = {(row['variant'], row['mode'], row['seed']): row for row in runs}
    assert len(by_config) == len(runs)
    summaries, sampling_deltas, architecture = {}, {}, {}

    def metric(row, domain, name):
        return row['result']['macro'][name] if domain == 'macro' else row['result']['domains'][domain]['metrics'][name]

    for variant in VARIANTS:
        summaries[variant] = {}
        sampling_deltas[variant] = {}
        for domain in (*DOMAINS, 'macro'):
            summaries[variant][domain] = {}
            sampling_deltas[variant][domain] = {}
            for name in METRICS:
                values = {mode: [metric(by_config[(variant, mode, seed)], domain, name) for seed in seeds]
                          for mode in MODES}
                summaries[variant][domain][name] = {mode: describe(rows) for mode, rows in values.items()}
                natural = dict(zip(seeds, values['natural']))
                balanced = dict(zip(seeds, values['balanced']))
                paired = paired_summary(natural, balanced, seeds)
                paired['balanced_better'] = paired.pop('positive')
                paired['balanced_worse'] = paired.pop('negative')
                sampling_deltas[variant][domain][name] = paired

    for mode in MODES:
        architecture[mode] = {}
        for domain in (*DOMAINS, 'macro'):
            architecture[mode][domain] = {}
            for name in METRICS:
                values = {variant: {seed: metric(by_config[(variant, mode, seed)], domain, name) for seed in seeds}
                          for variant in VARIANTS}
                architecture[mode][domain][name] = {
                    'model_summary': {variant: describe(list(by_seed.values())) for variant, by_seed in values.items()},
                    'paired_deltas': {label: paired_summary(values[left], values[right], seeds)
                                      for label, left, right in (('B_minus_A', 'independent', 'shared'),
                                                                  ('C_minus_A', 'independent', 'shared_domain_specific'),
                                                                  ('C_minus_B', 'shared', 'shared_domain_specific'))}}
    return {'seeds': list(seeds), 'metrics': summaries, 'balanced_minus_natural': sampling_deltas,
            'architecture_by_sampling_method': architecture}


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def run_key(variant, mode, seed):
    return f'{variant}/{mode}/{seed}'


def load_run(path, config, dataset, budget):
    path = ROOT / path
    if read_json(path / 'config.json') != config:
        raise ValueError(f'Run configuration changed: {path}')
    result = read_json(path / 'metrics.json')
    history = read_json(path / 'history.json')
    assert result['training']['optimizer_steps'] == budget
    checkpoint = torch.load(path / 'ranking_best.pt', weights_only=True)
    model, _ = load_model(path)
    model.load_state_dict(checkpoint['state_dict'])
    validation, macro = evaluate_domains(model, validation_view(dataset), config['k'])
    selected = result['checkpoint_comparison']['ranking']
    assert validation == selected['validation'] and macro == selected['validation_macro']
    assert checkpoint['selected_epoch'] == selected['epoch']
    assert [entry['optimizer_steps'] for entry in history] == list(range(config['validation_interval_steps'], budget + 1,
                                                                          config['validation_interval_steps']))
    return {'variant': config['model_variant'], 'mode': config['domain_balancing'], 'seed': config['seed'],
            'run': str(path.relative_to(ROOT)), 'result': result, 'history': history,
            'ranking_reload_validated': True}


def main():
    if TARGET.exists():
        raise FileExistsError(f'Refusing to overwrite {TARGET}')
    previous = read_json(RESULTS / 'equal_step_balance_control.json')
    validate_artifacts(RESULTS)
    config = previous['predeclaration']['configuration']
    assert config['max_optimizer_steps'] == 3200 and config['validation_interval_steps'] == 320
    for name, expected in previous['predeclaration']['source_code_sha256'].items():
        if file_digest(ROOT / name) != expected:
            raise ValueError(f'Frozen training code changed: {name}')
    frozen = read_json(RESULTS / 'amazon_multidomain_freeze.json')
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'],
                                  config['user_min'], config['item_min'])
    assert {domain: value['sha256'] for domain, value in sources.items()} == frozen['prepared_sha256']
    data_hash = digest({key: dataset[key] for key in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')})
    candidates = candidate_fingerprints(dataset)
    assert data_hash == previous['predeclaration']['dataset_sha256'] == frozen['dataset_sha256']
    assert candidates == previous['predeclaration']['candidate_sha256'] == frozen['candidate_sha256']
    budget, batch_size = config['max_optimizer_steps'], config['batch_size']
    if PROGRESS.exists():
        progress = read_json(PROGRESS)
        if progress['dataset_sha256'] != data_hash or progress['candidate_sha256'] != candidates:
            raise ValueError('Saved run progress does not match the frozen dataset/candidates')
    else:
        progress = {'dataset_sha256': data_hash, 'candidate_sha256': candidates,
                    'completed_runs': {}, 'b_control_validated': False}
        atomic_json(PROGRESS, progress)
    new_runs = {}

    def execute(variant, mode, seed):
        key = run_key(variant, mode, seed)
        run_config = {**config, 'model_variant': variant, 'domain_balancing': mode, 'seed': seed}
        saved = progress['completed_runs'].get(key)
        if saved:
            record = load_run(saved, run_config, dataset, budget)
            print('Reusing completed run', key, record['run'], flush=True)
        else:
            matches = []
            for path in (ROOT / 'research/runs').glob('multidomain-*'):
                config_path = path / 'config.json'
                if config_path.is_file() and read_json(config_path) == run_config:
                    matches.append(path)
            if len(matches) > 1:
                raise ValueError(f'Multiple unrecorded completed runs match {key}: {matches}')
            if matches:
                path = matches[0]
                record = load_run(str(path.relative_to(ROOT)), run_config, dataset, budget)
                print('Recovered completed run', key, record['run'], flush=True)
            else:
                print('Equal-step', key, flush=True)
                path, result = run(dataset, run_config, sources)
                if result['training']['optimizer_steps'] != budget:
                    raise AssertionError(f'{key} did not complete the fixed step budget')
                record = load_run(str(path.relative_to(ROOT)), run_config, dataset, budget)
                print('COMPLETE', key, 'selected step',
                      result['training']['ranking_selected_epoch'] * run_config['validation_interval_steps'],
                      'macro nDCG', result['macro']['ndcg'], flush=True)
            progress['completed_runs'][key] = record['run']
            atomic_json(PROGRESS, progress)
        assert record['result']['training']['optimizer_steps'] == budget
        assert sum(value['sampled_examples'] for value in record['result']['training']['exposure'].values()) == budget * batch_size
        new_runs[key] = record
        return record

    for seed in SEEDS:
        natural = execute('shared', 'natural', seed)
        balanced = execute('shared', 'balanced', seed)
        assert_equal_budget(natural['result'], balanced['result'], budget, batch_size)
    if not progress['b_control_validated']:
        b_rows = [new_runs.get(run_key('shared', mode, seed)) for seed in SEEDS for mode in MODES]
        assert all(b_rows)
        progress['b_control_validated'] = True
        atomic_json(PROGRESS, progress)
        print('B control validated for seeds 45/46/47; proceeding to A/C', flush=True)

    for variant in ('independent', 'shared_domain_specific'):
        for seed in SEEDS:
            natural = execute(variant, 'natural', seed)
            balanced = execute(variant, 'balanced', seed)
            assert_equal_budget(natural['result'], balanced['result'], budget, batch_size)

    original_hashes = {path: file_digest(path) for path in RESULTS.glob('*.json')}
    old_runs = previous['runs']
    new_records = list(new_runs.values())
    all_runs = old_runs + new_records
    expected = {(variant, mode, seed) for variant in VARIANTS for mode in MODES for seed in (42, 43, 44, *SEEDS)}
    assert {(row['variant'], row['mode'], row['seed']) for row in all_runs} == expected
    for row in new_records:
        assert row['result']['training']['optimizer_steps'] == budget
    run_summary = summarize(all_runs)
    deltas = run_summary['balanced_minus_natural']
    prior_checks = {
        'shared_B_macro_balanced_lower_mean': deltas['shared']['macro']['ndcg']['mean'] < 0,
        'independent_A_fitness_balanced_better_all_six': deltas['independent']['fitness']['ndcg']['balanced_better'] == 6,
        'shared_domain_offset_C_food_balanced_better_all_six': deltas['shared_domain_specific']['food']['ndcg']['balanced_better'] == 6,
        'shared_domain_offset_C_macro_effectively_similar': abs(deltas['shared_domain_specific']['macro']['ndcg']['mean']) < 0.001,
    }
    stable_directions = []
    for variant in VARIANTS:
        for domain in (*DOMAINS, 'macro'):
            direction = deltas[variant][domain]['ndcg']
            if max(direction['balanced_better'], direction['balanced_worse']) >= 5:
                stable_directions.append({'variant': variant, 'domain': domain,
                                          'direction': 'balanced_better' if direction['balanced_better'] >= 5 else 'balanced_worse',
                                          'seeds': max(direction['balanced_better'], direction['balanced_worse'])})
    output = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'protocol': {'seeds': list(range(42, 48)), 'new_seeds': list(SEEDS), 'variants': list(VARIANTS),
                     'sampling_methods': list(MODES), 'max_optimizer_steps': budget, 'batch_size': batch_size,
                     'examples_per_run': budget * batch_size,
                     'configuration': config,
                     'selection': 'Maximum unweighted macro validation nDCG@10; earliest exact tie',
                     'dataset_sha256': data_hash, 'candidate_sha256': candidates,
                     'source_sha256': {domain: value['sha256'] for domain, value in sources.items()},
                     'training_code_sha256': previous['predeclaration']['source_code_sha256'],
                     'determinism': 'No new duplicate run; prior seed-42 Balanced B replay remains the deterministic check'},
        'coverage_reference': {'users': 1000, 'warm_test_item_percent': {'food': 22.66, 'fitness': 12.01, 'media': 19.78},
                               'details': read_json(RESULTS / 'amazon_multidomain_coverage.json')},
        'runs': all_runs,
        'six_seed_summary': run_summary,
        'prior_observation_checks': prior_checks,
        'stable_direction_at_least_5_of_6': stable_directions,
        'conclusion': 'Domain-specific effects; no universal sampling strategy advantage. Six seeds are descriptive and do not establish statistical significance.',
        'limitations': ['1000-reviewer cohort', 'Low warm-item coverage', 'Six seeds remain a small sample',
                        'No significance tests', 'Amazon categories represent product preferences, not live app behavior']}
    write_json(TARGET, output)
    for path, expected_hash in original_hashes.items():
        assert file_digest(path) == expected_hash, f'Existing result changed: {path}'
    print('Saved', TARGET, flush=True)


if __name__ == '__main__':
    main()
