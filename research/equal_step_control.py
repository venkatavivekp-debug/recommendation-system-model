"""Compare domain sampling at a predeclared, equal optimizer-step budget."""
import math
from datetime import datetime, timezone

import torch

from amazon_data import file_digest, validate_artifacts, write_json
from amazon_diagnostics import DOMAINS, METRICS, candidate_fingerprints, digest, mean_sd
from amazon_replication import RESULTS, ROOT, load_model, read_json
from multidomain_data import examples_by_domain, load_inputs, prepare_multidomain
from multidomain_experiment import evaluate_domains, run, validation_view


def assert_equal_budget(natural, balanced, budget, batch_size):
    for result in (natural, balanced):
        assert result['training']['optimizer_steps'] == budget, 'Unequal optimizer steps'
        assert sum(v['sampled_examples'] for v in result['training']['exposure'].values()) == budget * batch_size, 'Unequal examples'


def aggregate(runs):
    summary = {}
    for variant in ('shared', 'independent', 'shared_domain_specific'):
        groups = {mode: [r for r in runs if r['variant'] == variant and r['mode'] == mode] for mode in ('natural', 'balanced')}
        values = {}
        for domain in (*DOMAINS, 'macro'):
            values[domain] = {}
            for metric in METRICS:
                samples = {mode: {r['seed']: r['result']['macro'][metric] if domain == 'macro' else
                                 r['result']['domains'][domain]['metrics'][metric] for r in rows}
                           for mode, rows in groups.items()}
                assert set(samples['natural']) == set(samples['balanced']) == {42, 43, 44}
                deltas = [samples['balanced'][s] - samples['natural'][s] for s in (42, 43, 44)]
                values[domain][metric] = {mode: mean_sd(list(v.values())) for mode, v in samples.items()}
                values[domain][metric]['balanced_minus_natural'] = {**mean_sd(deltas),
                    'per_seed': dict(zip(('42', '43', '44'), deltas)),
                    'positive_seeds': sum(v > 1e-12 for v in deltas), 'negative_seeds': sum(v < -1e-12 for v in deltas)}
        summary[variant] = values
    return summary


def main():
    target = RESULTS / 'equal_step_balance_control.json'
    if target.exists():
        raise ValueError('Equal-step results already exist; do not overwrite')
    original_hashes = {p: file_digest(p) for p in RESULTS.glob('*.json')}
    validate_artifacts(RESULTS)
    frozen = read_json(RESULTS / 'amazon_multidomain_freeze.json')
    config = frozen['config']
    for name, expected in frozen['frozen_code_sha256'].items():
        if name not in ('research/multidomain_data.py', 'research/multidomain_experiment.py'):
            assert file_digest(ROOT / name) == expected, name
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'], config['user_min'], config['item_min'])
    assert {d: v['sha256'] for d, v in sources.items()} == frozen['prepared_sha256']
    assert digest({k: dataset[k] for k in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')}) == frozen['dataset_sha256']
    candidates = candidate_fingerprints(dataset)
    assert candidates == frozen['candidate_sha256']
    available = {d: len(v) for d, v in examples_by_domain(dataset, 'train', config['negative_samples'], 43).items()}
    interval = math.ceil(sum(available.values()) / config['batch_size'])
    budget = config['epochs'] * interval
    settings = {**config, 'max_optimizer_steps': budget, 'validation_interval_steps': interval,
                'checkpoint_metric': 'macro_validation_ndcg'}
    declaration = {'generated_at': datetime.now(timezone.utc).isoformat(), 'configuration': settings,
        'budget_reason': 'Original maximum epochs times ceil(natural example pool / original batch size)',
        'max_optimizer_steps': budget, 'examples_per_run': budget * config['batch_size'],
        'selection': 'Primary: maximum unweighted macro validation nDCG@10; earliest exact tie. BCE secondary only.',
        'termination': 'No early termination; exactly the fixed step budget in both modes',
        'validation_cadence': interval, 'negative_refresh': 'Same seed+window in both modes; existing negative sampler unchanged',
        'batch_completion': 'Use existing ordered sampler; truncate or cycle indices to fill full batches in each common window',
        'exposure_definition': 'Unique examples are (user,item,binary label) within domain; sampled-minus-unique counts repetitions, including ordinary later-window reuse',
        'dataset_sha256': frozen['dataset_sha256'], 'candidate_sha256': candidates,
        'available_examples': available,
        'source_code_sha256': {name: file_digest(ROOT / name) for name in ('research/multidomain_experiment.py', 'research/multidomain_data.py', 'research/multidomain_model.py')},
        'model_a': 'Existing A already uses one mixed-domain loader and optimizer; balance reallocates domain exposure without shared representations'}
    declaration_path = ROOT / 'research/runs/equal_step_declaration.json'
    write_json(declaration_path, declaration)
    print('PREDECLARED', declaration, flush=True)
    runs, repeat_evidence = [], None

    def execute(variant, mode, seed):
        print(f'Equal-step {variant}/{mode}/seed{seed}', flush=True)
        run_config = {**settings, 'model_variant': variant, 'domain_balancing': mode, 'seed': seed}
        path, result = run(dataset, run_config, sources)
        assert result['training']['optimizer_steps'] == budget
        checkpoint = torch.load(path / 'ranking_best.pt', weights_only=True)
        model, _ = load_model(path)
        model.load_state_dict(checkpoint['state_dict'])
        validation, macro = evaluate_domains(model, validation_view(dataset), config['k'])
        selected = result['checkpoint_comparison']['ranking']
        assert validation == selected['validation'] and macro == selected['validation_macro']
        assert checkpoint['selected_epoch'] == selected['epoch']
        history = read_json(path / 'history.json')
        assert [r['optimizer_steps'] for r in history] == list(range(interval, budget + 1, interval))
        assert sum(r['window_optimizer_steps'] for r in history) == budget
        print('COMPLETE', variant, mode, seed, 'selected step', selected['epoch'] * interval,
              'test nDCG', {d: result['domains'][d]['metrics']['ndcg'] for d in DOMAINS}, flush=True)
        return {'variant': variant, 'mode': mode, 'seed': seed, 'run': str(path.relative_to(ROOT)),
                'result': result, 'history': history, 'ranking_reload_validated': True}

    for variant in ('shared', 'independent', 'shared_domain_specific'):
        for seed in (42, 43, 44):
            natural = execute(variant, 'natural', seed)
            balanced = execute(variant, 'balanced', seed)
            assert_equal_budget(natural['result'], balanced['result'], budget, config['batch_size'])
            runs.extend((natural, balanced))
            if variant == 'shared' and seed == 42:
                repeated = execute(variant, 'balanced', seed)
                for key in ('history',):
                    assert repeated[key] == balanced[key]
                for key in ('training', 'domains', 'macro', 'checkpoint_comparison'):
                    assert repeated['result'][key] == balanced['result'][key]
                first = torch.load(ROOT / balanced['run'] / 'ranking_best.pt', weights_only=True)
                second = torch.load(ROOT / repeated['run'] / 'ranking_best.pt', weights_only=True)
                assert all(torch.equal(v, second['state_dict'][k]) for k, v in first['state_dict'].items())
                repeat_evidence = {'run': repeated['run'], 'identical_history_order_checkpoint_and_metrics': True}
        if variant == 'shared':
            print('B CONTROL VALIDATED: all three seeds equal steps/examples, deterministic repeat passed; proceeding to A/C', flush=True)
    old = read_json(RESULTS / 'checkpoint_selection_comparison.json')
    old_comparison = [{'variant': r['variant'], 'mode': r['mode'], 'seed': r['seed'],
        'original_bce_macro': r['comparison']['bce']['macro'], 'original_ranking_macro': r['comparison']['ranking']['macro'],
        'original_domains': {p: r['comparison'][p]['domains'] for p in ('bce', 'ranking')},
        'original_optimizer_steps': read_json(RESULTS / f'amazon_multidomain_{"seed42_diagnostics" if r["seed"] == 42 else "seed" + str(r["seed"])}.json')['modes'][r['mode']]['models'][r['variant']]['budget']['total_optimizer_steps']}
        for r in old['runs']]
    for path, expected in original_hashes.items():
        assert file_digest(path) == expected, path
    for name, expected in declaration['source_code_sha256'].items():
        assert file_digest(ROOT / name) == expected, name
    write_json(target, {'generated_at': datetime.now(timezone.utc).isoformat(), 'predeclaration': declaration,
                       'runs': runs, 'determinism_check': repeat_evidence, 'three_seed_summary': aggregate(runs),
                       'original_comparison': old_comparison,
                       'limitations': ['Warm coverage unchanged', '1000-reviewer cohort', 'Three seeds only',
                                       'Selected checkpoints may occur at different steps despite equal maximum budgets',
                                       'Old versus new also changes termination and validation cadence; not a causal decomposition of old results']})
    print('Saved', target, flush=True)


if __name__ == '__main__':
    main()
