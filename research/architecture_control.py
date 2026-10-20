"""Seed-42 architecture control using the frozen global-time pilot functions."""
import argparse
import csv
import json
import resource
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

from amazon_data import file_digest, write_json
from amazon_diagnostics import digest
from final_study import (MANIFEST_PATH, METRICS, OUTPUT, ROOT, build_stream, coverage_table, evaluate,
                         load_study, paired_bootstrap, train_model)
from multidomain_experiment import architecture
from multidomain_model import MultiDomainNeuMF, VARIANTS
from multidomain_data import DOMAINS

STEM = 'architecture_control_seed42'
PROTOCOL = OUTPUT / 'architecture_control_protocol_seed42.json'


def check_coverage(domains, reference):
    for domain in DOMAINS:
        actual, expected = domains[domain], reference[domain]
        if (actual['evaluated_users'] != expected['evaluated_users'] or
                actual['queries'] != expected['queries'] or
                set(actual['per_user']) != set(expected['per_user'])):
            raise ValueError(f'Evaluation population changed: {domain}')


def macro_bootstrap(before, after, seed=42, samples=2000):
    """Resample reviewer clusters jointly, keeping overlapping domain membership."""
    check_coverage(after, before)
    users = sorted(set().union(*(set(before[d]['per_user']) for d in DOMAINS)))
    positions = {user: i for i, user in enumerate(users)}
    delta = np.zeros((len(users), len(DOMAINS), len(METRICS)))
    present = np.zeros((len(users), len(DOMAINS)), dtype=bool)
    for j, domain in enumerate(DOMAINS):
        for user, values in before[domain]['per_user'].items():
            i = positions[user]
            present[i, j] = True
            delta[i, j] = [after[domain]['per_user'][user][m] - values[m] for m in METRICS]
    counts = present.sum(axis=0)
    if np.any(counts == 0):
        raise ValueError('Macro inference requires evaluable users in every domain')
    point = (delta.sum(axis=0) / counts[:, None]).mean(axis=0)
    rng, draws = np.random.default_rng(seed), []
    while len(draws) < samples:
        indices = rng.integers(len(users), size=len(users))
        counts = present[indices].sum(axis=0)
        if np.all(counts):
            draws.append((delta[indices].sum(axis=0) / counts[:, None]).mean(axis=0))
    intervals = np.quantile(draws, [.025, .975], axis=0)
    return {m: {'mean_paired_delta': float(point[i]), 'ci95': intervals[:, i].tolist(),
                'reviewer_clusters': len(users)} for i, m in enumerate(METRICS)}


def comparisons(models):
    output = {}
    for left, right in (('B', 'A'), ('C', 'A'), ('C', 'B')):
        before, after = models[right]['domains'], models[left]['domains']
        check_coverage(after, before)
        paired = {d: paired_bootstrap(before[d]['per_user'], after[d]['per_user']) for d in DOMAINS}
        paired['macro'] = macro_bootstrap(before, after)
        output[f'{left}-{right}'] = paired
    return output


def direction(effect):
    delta = effect['mean_paired_delta']
    low, high = effect['ci95']
    sign = 'positive direction' if delta > 0 else 'negative direction' if delta < 0 else 'uncertain'
    return {'direction': sign, 'ci_includes_zero': low <= 0 <= high,
            'interpretation': f'{sign}, uncertain' if low <= 0 <= high else f'{sign}, provisional single-seed evidence'}


def export_csv(result):
    rows = []
    for name, model in result['models'].items():
        for domain in (*DOMAINS, 'macro'):
            coverage = result['coverage']['test']
            total = sum(v['positives'] for v in coverage.values()) if domain == 'macro' else coverage[domain]['positives']
            warm = sum(v['warm_positives'] for v in coverage.values()) if domain == 'macro' else coverage[domain]['warm_positives']
            rows.append(dict(model=name, domain=domain, seed=42, status=model['status'],
                **(model['macro'] if domain == 'macro' else model['domains'][domain]['metrics']),
                warm_test_positives=warm, total_test_positives=total, warm_percent=100 * warm / total,
                warm_evaluation_users='' if domain == 'macro' else model['domains'][domain]['evaluated_users'],
                selected_step=model.get('selected_step', ''), seed_sd='not_available'))
    delta_rows = [dict(comparison=name, domain=domain, metric=metric,
                      mean_delta=effect['mean_paired_delta'], ci95_low=effect['ci95'][0], ci95_high=effect['ci95'][1])
                  for name, groups in result['comparisons'].items()
                  for domain, metrics in groups.items() for metric, effect in metrics.items()]
    for suffix, values in (('', rows), ('_deltas', delta_rows)):
        with (OUTPUT / f'{STEM}{suffix}.csv').open('x', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(values[0]))
            writer.writeheader()
            writer.writerows(values)


def preflight():
    frozen = json.loads((OUTPUT / 'protocol.json').read_text())
    pilot = json.loads((OUTPUT / 'pilot_seed42.json').read_text())
    if pilot['protocol_sha256'] != file_digest(OUTPUT / 'protocol.json'):
        raise ValueError('Frozen pilot/protocol fingerprint mismatch')
    if file_digest(MANIFEST_PATH) != frozen['manifest_sha256']:
        raise ValueError('Frozen V2 manifest changed')
    if str(torch.__version__) != frozen['versions']['torch'] or np.__version__ != frozen['versions']['numpy']:
        raise ValueError('Use the frozen pilot Torch/NumPy environment')
    for name, digest in frozen['code_sha256'].items():
        if file_digest(ROOT / 'research' / name) != digest:
            raise ValueError(f'Frozen pilot source changed: {name}')
    config, rows, dataset, splits, cutoffs, sources = load_study()
    training, queries, repeats = build_stream(rows, dataset, cutoffs)
    coverage = coverage_table(splits, dataset, queries, repeats)
    if (config != frozen['config'] or sources != frozen['sources'] or
            cutoffs != frozen['cutoffs'] or coverage != frozen['coverage']):
        raise ValueError('Cannot reproduce the frozen global-time protocol')
    if config['seed'] != 42 or config['domain_balancing'] != 'balanced':
        raise ValueError('Only frozen Balanced seed42 is authorized')
    checkpoint = ROOT / pilot['models']['C']['checkpoint']
    saved = torch.load(checkpoint, weights_only=True)
    if saved['user_mapping'] != dataset['user_mapping'] or saved['item_mapping'] != dataset['item_mapping']:
        raise ValueError('Train-only mappings differ from frozen Model C')
    if saved['config'] != config or saved['architecture'] != architecture(dataset, config):
        raise ValueError('Frozen C checkpoint hyperparameters differ')
    history = pilot['models']['C']['history']
    expected_steps = list(range(config['validation_interval_steps'], config['max_optimizer_steps'] + 1,
                                config['validation_interval_steps']))
    selected = max(history, key=lambda row: row['macro']['ndcg'])
    if ([row['step'] for row in history] != expected_steps or
            selected['step'] != pilot['models']['C']['selected_step'] or
            selected['macro']['ndcg'] != pilot['models']['C']['selected_validation_ndcg']):
        raise ValueError('Frozen C checkpoint selection or training schedule differs')
    if sum(pilot['models']['C']['domain_draws'].values()) != config['batch_size'] * config['max_optimizer_steps']:
        raise ValueError('Frozen C training-example budget differs')
    return frozen, pilot, config, dataset, training, queries, coverage, saved


def peak_rss():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024)


def train_worker(name, directory):
    _, pilot, config, dataset, training, queries, _, _ = preflight()
    variant = dict(zip('ABC', VARIANTS))[name]
    _, result = train_model(name, dataset, training, queries['validation'],
                           {**config, 'model_variant': variant}, directory)
    if (result['sampling_sha256'] != pilot['models']['C']['sampling_sha256'] or
            result['domain_draws'] != pilot['models']['C']['domain_draws']):
        raise ValueError(f'{name}: sampling differs from the frozen control')
    result.update(variant=variant, status='Seed42 architecture control', reused=False,
                  peak_training_process_rss_bytes=peak_rss())
    write_json(directory / f'{name}_training.json', result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--train', action='store_true')
    parser.add_argument('--worker', choices=('A', 'B'))
    parser.add_argument('--run-directory', type=Path)
    args = parser.parse_args()
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    if args.worker:
        if args.run_directory is None or not args.run_directory.resolve().is_relative_to(ROOT / 'research/runs'):
            raise ValueError('Workers require an isolated research/runs directory')
        train_worker(args.worker, args.run_directory)
        return
    paths = [PROTOCOL, OUTPUT / f'{STEM}.json', OUTPUT / f'{STEM}.csv', OUTPUT / f'{STEM}_deltas.csv']
    if any(path.exists() for path in paths):
        raise FileExistsError('Architecture artifacts already exist; refusing overwrite/repeated test evaluation')
    started = time.perf_counter()
    frozen, pilot, config, dataset, training, queries, coverage, saved = preflight()
    frozen_C = pilot['models']['C']
    validation_started = time.perf_counter()
    model_C = MultiDomainNeuMF(**saved['architecture'])
    model_C.load_state_dict(saved['state_dict'])
    validation, macro = evaluate(model_C, dataset, queries['validation'], config['k'])
    selected = next(row for row in frozen_C['history'] if row['step'] == frozen_C['selected_step'])
    if macro != selected['macro'] or {d: validation[d]['metrics'] for d in DOMAINS} != selected['validation']:
        raise ValueError('Frozen C checkpoint fails to reproduce its selected validation metrics')
    validation_seconds = time.perf_counter() - validation_started
    split_hash = digest({'pairs': dataset['pairs'], 'cutoffs': frozen['cutoffs'],
                         'user_mapping': dataset['user_mapping'], 'item_mapping': dataset['item_mapping'],
                         'domain_users': dataset['domain_users']})
    print(json.dumps({'preflight': 'passed', 'mode': config['domain_balancing'],
                      'coverage': coverage['test'], 'C_selected_step': frozen_C['selected_step'],
                      'C_validation_reproduced': True, 'split_sha256': split_hash,
                      'training_requested': args.train}), flush=True)
    if not args.train:
        return
    protocol = {'generated_at': datetime.now(timezone.utc).isoformat(),
        'git_sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'frozen_protocol_sha256': file_digest(OUTPUT / 'protocol.json'),
        'frozen_pilot_sha256': file_digest(OUTPUT / 'pilot_seed42.json'),
        'frozen_C_checkpoint_sha256': file_digest(ROOT / frozen_C['checkpoint']),
        'cohort_manifest_sha256': frozen['manifest_sha256'], 'split_sha256': split_hash,
        'candidate_query_sha256': digest(queries), 'seed': 42, 'optimizer': 'Adam',
        'code_sha256': {p.name: file_digest(p) for p in sorted((ROOT / 'research').glob('*.py'))},
        'config': config, 'models': dict(zip('ABC', VARIANTS)), 'coverage': coverage, 'versions': frozen['versions'],
        'expected_sampling_sha256': frozen_C['sampling_sha256'],
        'selection': frozen['selection'].replace('both', 'all three'),
        'C_test_reuse': 'reused from frozen final-study pilot; not re-evaluated',
        'C_provenance': {'config_and_hyperparameters_match': True, 'train_only_mappings_match': True,
            'cohort_split_sources_and_code_match': True, 'selected_step': frozen_C['selected_step'],
            'max_validation_earliest_tie_verified': True, 'selected_validation_reproduced': True,
            'validation_check_seconds': validation_seconds,
            'split_hash_note': 'Reconstructed from frozen, hash-verified inputs and unchanged splitter; original protocol has no standalone split-hash field'},
        'references': 'Most Popular and C+Context copied from frozen pilot, not recalculated or used for architecture selection',
        'bootstrap': {'replicates': 2000, 'seed': 42, 'domain': 'Paired within-domain users, unchanged pilot bootstrap',
            'macro': 'Resample union of reviewers jointly; keep domain membership and pairing, recompute each domain mean then unweighted macro. Reject resamples missing a domain.',
            'caution': 'Conditional on seed42 and observed warm coverage; descriptive intervals, no multiplicity adjustment or training-seed uncertainty'},
        'compute_estimate': {'training_runs': 2, 'minutes': [12, 20], 'peak_memory_gb_per_worker': 3.5},
        'protected_snapshot': {'files': 304, 'sha256': 'b2af03fd4a93593e06c87d2f3d1a43b3979ad72076a3322b41b0811e469923ab'}}
    write_json(PROTOCOL, protocol)
    directory = ROOT / 'research/runs' / datetime.now(timezone.utc).strftime('architecture-control-%Y%m%dT%H%M%S%fZ')
    directory.mkdir(parents=True, exist_ok=False)
    results = {}
    for name in 'AB':
        subprocess.run([sys.executable, '-B', str(Path(__file__).resolve()), '--worker', name,
                        '--run-directory', str(directory)], check=True)
        results[name] = json.loads((directory / f'{name}_training.json').read_text())
    # All selectors are frozen before A or B test metrics are exposed.
    for name in 'AB':
        checkpoint = torch.load(ROOT / results[name]['checkpoint'], weights_only=True)
        model = MultiDomainNeuMF(**checkpoint['architecture'])
        model.load_state_dict(checkpoint['state_dict'])
        tick = time.perf_counter()
        domains, macro = evaluate(model, dataset, queries['test'], config['k'])
        check_coverage(domains, frozen_C['domains'])
        results[name].update(domains=domains, macro=macro, test_seconds=time.perf_counter() - tick)
        print(json.dumps({'model': name, 'test_macro': macro}), flush=True)
    results['C'] = {**frozen_C, 'variant': VARIANTS[2], 'reused': True,
        'status': 'reused from frozen final-study pilot; not re-evaluated',
        'new_training_test_seconds': 0, 'peak_training_process_rss_bytes': None,
        'frozen_pair_peak_process_rss_bytes': pilot['peak_rss_bytes'],
        'memory_note': 'Frozen pilot measured a combined C/context process peak, not an isolated C peak'}
    paired = comparisons(results)
    for name, label in (('MostPopular', 'Frozen reference, not recomputed'),
                        ('C_context', 'Context feasibility result - no demonstrated improvement')):
        reference = pilot['models'][name]
        results[name] = {'status': label, 'reused': True, 'macro': reference['macro'], 'selected_step': reference.get('selected_step'),
            'domains': {d: {k: v for k, v in reference['domains'][d].items() if k != 'per_user'} for d in DOMAINS}}
    result = {'generated_at': datetime.now(timezone.utc).isoformat(), 'protocol_sha256': file_digest(PROTOCOL),
        'git_sha': protocol['git_sha'], 'cohort_manifest_sha256': protocol['cohort_manifest_sha256'],
        'split_sha256': split_hash, 'seed': 42, 'optimizer': 'Adam', 'hyperparameters': config,
        'provenance': protocol['C_provenance'],
        'models': results, 'coverage': coverage, 'comparisons': paired,
        'negative_transfer_screen': {name: {d: direction(paired[name][d]['ndcg']) for d in DOMAINS}
                                     for name in ('B-A', 'C-A')},
        'wall_seconds': time.perf_counter() - started,
        'parent_peak_process_rss_bytes': peak_rss(),
        'memory_note': 'A/B peaks are isolated training-worker RSS; parent evaluation peak reported separately. Concurrent combined RSS was not measured.',
        'additional_seeds_started': False}
    write_json(OUTPUT / f'{STEM}.json', result)
    export_csv(result)
    print(json.dumps({'output': STEM, 'wall_seconds': result['wall_seconds'],
                      'paired': paired, 'screen': result['negative_transfer_screen']}), flush=True)


if __name__ == '__main__':
    main()
