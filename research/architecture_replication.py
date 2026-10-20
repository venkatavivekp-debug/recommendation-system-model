"""Fresh seeds 43/44 for the frozen global-time A/B/C architecture control."""
import argparse
import csv
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

from amazon_data import file_digest, write_json
from amazon_diagnostics import digest
from architecture_control import check_coverage, comparisons, peak_rss, preflight
from final_study import METRICS, OUTPUT, ROOT, evaluate, train_model
from multidomain_model import MultiDomainNeuMF, VARIANTS
from multidomain_data import DOMAINS

SEEDS = (43, 44)
PARAMETERS = dict(A=2123571, B=1972157, C=2207741)
PROTOCOL = OUTPUT / 'architecture_control_replication_protocol_seeds43_44.json'
SUMMARY = OUTPUT / 'architecture_control_three_seed_summary.json'


def run_config(frozen, seed, model):
    if seed not in SEEDS or model not in PARAMETERS:
        raise ValueError('Only A/B/C at seeds 43 and 44 are authorized')
    return {**frozen, 'seed': seed, 'model_variant': dict(zip('ABC', VARIANTS))[model]}


def load_control():
    frozen, pilot, config, dataset, training, queries, coverage, _ = preflight()
    reference = json.loads((OUTPUT / 'architecture_control_seed42.json').read_text())
    registered = json.loads((OUTPUT / 'architecture_control_protocol_seed42.json').read_text())
    if reference['protocol_sha256'] != file_digest(OUTPUT / 'architecture_control_protocol_seed42.json'):
        raise ValueError('Seed42 registration hash changed')
    for name, checksum in registered['code_sha256'].items():
        if file_digest(ROOT / 'research' / name) != checksum:
            raise ValueError(f'Frozen architecture-control source changed: {name}')
    split = digest({'pairs': dataset['pairs'], 'cutoffs': frozen['cutoffs'],
                    'user_mapping': dataset['user_mapping'], 'item_mapping': dataset['item_mapping'],
                    'domain_users': dataset['domain_users']})
    if (config != registered['config'] or config != reference['hyperparameters'] or
            coverage != reference['coverage'] or split != registered['split_sha256'] or
            digest(queries) != registered['candidate_query_sha256'] or
            file_digest(OUTPUT / 'pilot_seed42.json') != registered['frozen_pilot_sha256']):
        raise ValueError('Frozen dataset, split, config, coverage or candidate protocol differs')
    return registered, reference, config, dataset, training, queries, coverage


def verify_training(result, config, name, reference):
    history = result['history']
    best = max(history, key=lambda row: row['macro']['ndcg'])
    if (result['parameter_count'] != PARAMETERS[name] or
            result['domain_draws'] != reference['domain_draws'] or
            sum(result['domain_draws'].values()) != 1638400 or
            [r['step'] for r in history] != list(range(320, 3201, 320)) or
            result['selected_step'] != best['step'] or
            result['selected_validation_ndcg'] != best['macro']['ndcg'] or
            config['batch_size'] != 512 or config['max_optimizer_steps'] != 3200):
        raise ValueError(f'Training budget, parameters or selection differs for {name}')


def worker(seed, name, directory):
    _, reference, frozen, dataset, training, queries, _ = load_control()
    config = run_config(frozen, seed, name)
    _, result = train_model(name, dataset, training, queries['validation'], config, directory)
    verify_training(result, config, name, reference['models'][name])
    result.update(seed=seed, model=name, hyperparameters=config, reused=False,
                  status='Fresh global-time architecture replication', training_examples=1638400,
                  peak_training_process_rss_bytes=peak_rss())
    write_json(directory / f'{name}_training.json', result)


def stats(values):
    values = np.asarray(values, dtype=float)
    if len(values) != 3 or not np.isfinite(values).all():
        raise ValueError('Summary requires exactly three finite seed measurements')
    return dict(mean=float(values.mean()), sample_sd=float(values.std(ddof=1)), values=values.tolist())


def metric(model, domain, name):
    return (model['macro'] if domain == 'macro' else model['domains'][domain]['metrics'])[name]


def aggregate(runs):
    if set(runs) != {42, 43, 44}:
        raise ValueError('Exactly seeds 42,43,44 are required')
    for seed, run in runs.items():
        if run['seed'] != seed or run['coverage'] != runs[42]['coverage']:
            raise ValueError('Seed or coverage mismatch')
        for model in 'ABC':
            check_coverage(run['models'][model]['domains'], runs[42]['models']['A']['domains'])
    rows, deltas = [], []
    for model in 'ABC':
        for domain in (*DOMAINS, 'macro'):
            for name in METRICS:
                values = [metric(runs[s]['models'][model], domain, name) for s in (42, 43, 44)]
                rows.append(dict(model=model, domain=domain, metric=name, **stats(values)))
    for left, right in (('B', 'A'), ('C', 'A'), ('C', 'B')):
        for domain in (*DOMAINS, 'macro'):
            for name in METRICS:
                values = [metric(runs[s]['models'][left], domain, name) -
                          metric(runs[s]['models'][right], domain, name) for s in (42, 43, 44)]
                deltas.append(dict(comparison=f'{left}-{right}', domain=domain, metric=name,
                    **stats(values), positive_seeds=sum(v > 0 for v in values),
                    negative_seeds=sum(v < 0 for v in values), zero_seeds=sum(v == 0 for v in values)))
    return rows, deltas


def export_csv(path, rows):
    flattened = [{**{k: v for k, v in row.items() if k != 'values'},
                  **{f'seed{s}': value for s, value in zip((42, 43, 44), row['values'])}} for row in rows]
    with path.open('x', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(flattened[0]))
        writer.writeheader()
        writer.writerows(flattened)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--train', action='store_true')
    parser.add_argument('--worker', choices=tuple('ABC'))
    parser.add_argument('--seed', type=int, choices=SEEDS)
    parser.add_argument('--run-directory', type=Path)
    args = parser.parse_args()
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    if args.worker:
        if (args.seed is None or args.run_directory is None or
                not args.run_directory.resolve().is_relative_to(ROOT / 'research/runs')):
            raise ValueError('Worker requires an authorized seed and isolated run directory')
        worker(args.seed, args.worker, args.run_directory)
        return
    paths = [PROTOCOL, SUMMARY, *(OUTPUT / f'architecture_control_seed{s}.json' for s in SEEDS),
             OUTPUT / 'architecture_control_three_seed_summary.csv',
             OUTPUT / 'architecture_control_three_seed_deltas.csv']
    if any(p.exists() for p in paths):
        raise FileExistsError('Replication artifacts already exist; refusing overwrite or repeated evaluation')
    started = time.perf_counter()
    registered, reference, config, dataset, training, queries, coverage = load_control()
    print(json.dumps({'preflight': 'passed', 'seeds': SEEDS, 'training_requested': args.train}), flush=True)
    if not args.train:
        return
    protected = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard',
                                         'README.md', 'backend', 'frontend', 'research'], cwd=ROOT, text=True).splitlines()
    protocol = dict(generated_at=datetime.now(timezone.utc).isoformat(),
        git_sha=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        seeds=list(SEEDS), frozen_seed42_sha256=file_digest(OUTPUT / 'architecture_control_seed42.json'),
        frozen_registration_sha256=file_digest(OUTPUT / 'architecture_control_protocol_seed42.json'),
        cohort_manifest_sha256=registered['cohort_manifest_sha256'], split_sha256=registered['split_sha256'],
        candidate_query_sha256=registered['candidate_query_sha256'], config=config, optimizer='Adam',
        models=dict(zip('ABC', VARIANTS)), parameter_counts=PARAMETERS, coverage=coverage,
        versions=registered['versions'], selection=registered['selection'],
        training_examples_per_model=1638400,
        bootstrap='Within each fitted seed: unchanged 2000 paired-user draws, bootstrap RNG seed42; macro joint reviewer clusters. Never pool seeds.',
        aggregation='Mean and sample SD (ddof=1) of seeds42/43/44; compute paired architecture deltas within each seed before aggregation.',
        protected_sha256={p: file_digest(ROOT / p) for p in sorted(protected) if p != 'research/FINAL_STUDY.md'},
        code_sha256={p.name: file_digest(p) for p in sorted((ROOT / 'research').glob('*.py'))})
    write_json(PROTOCOL, protocol)
    directory = ROOT / 'research/runs' / datetime.now(timezone.utc).strftime('architecture-replication-%Y%m%dT%H%M%S%fZ')
    directory.mkdir(parents=True, exist_ok=False)
    runs = {42: reference}
    for seed in SEEDS:
        folder = directory / f'seed{seed}'
        folder.mkdir()
        models = {}
        for name in 'ABC':
            subprocess.run([sys.executable, '-B', str(Path(__file__).resolve()), '--worker', name,
                            '--seed', str(seed), '--run-directory', str(folder)], check=True)
            models[name] = json.loads((folder / f'{name}_training.json').read_text())
        if len({m['sampling_sha256'] for m in models.values()}) != 1:
            raise ValueError(f'Sampling differs across architectures at seed{seed}')
        runs[seed] = dict(generated_at=None, git_sha=protocol['git_sha'], seed=seed,
            protocol_sha256=file_digest(PROTOCOL), hyperparameters={**config, 'seed': seed},
            optimizer='Adam', sampling_mode='balanced',
            cohort_manifest_sha256=protocol['cohort_manifest_sha256'], split_sha256=protocol['split_sha256'],
            models=models, coverage=coverage,
            test_coverage={d: dict(total_test_positives=c['positives'], warm_test_positives=c['warm_positives'],
                warm_percent=100 * c['warm_positives'] / c['positives'], evaluation_users=c['evaluated_users'])
                for d, c in coverage['test'].items()},
            provenance='Fresh runs; unchanged seed42 training/evaluation code')
    if len({runs[s]['models']['A']['sampling_sha256'] for s in (42, 43, 44)}) != 3:
        raise ValueError('Training sample streams unexpectedly identical across seeds')
    # Freeze all six validation-selected checkpoints before any new test evaluation.
    for seed in SEEDS:
        for name, result in runs[seed]['models'].items():
            saved = torch.load(ROOT / result['checkpoint'], weights_only=True)
            if (saved['config'] != run_config(config, seed, name) or
                    saved['user_mapping'] != dataset['user_mapping'] or saved['item_mapping'] != dataset['item_mapping']):
                raise ValueError('Checkpoint configuration or mappings changed')
            model = MultiDomainNeuMF(**saved['architecture'])
            model.load_state_dict(saved['state_dict'])
            tick = time.perf_counter()
            domains, macro = evaluate(model, dataset, queries['test'], config['k'])
            check_coverage(domains, reference['models']['A']['domains'])
            result.update(domains=domains, macro=macro, test_seconds=time.perf_counter() - tick)
            print(json.dumps({'seed': seed, 'model': name, 'test_macro': macro}), flush=True)
        runs[seed].update(generated_at=datetime.now(timezone.utc).isoformat(), comparisons=comparisons(runs[seed]['models']))
        write_json(OUTPUT / f'architecture_control_seed{seed}.json', runs[seed])
    rows, deltas = aggregate(runs)
    summary = dict(generated_at=datetime.now(timezone.utc).isoformat(), git_sha=protocol['git_sha'], seeds=[42, 43, 44],
        protocol_sha256=file_digest(PROTOCOL), cohort_manifest_sha256=protocol['cohort_manifest_sha256'],
        split_sha256=protocol['split_sha256'], coverage=coverage, metrics=rows, deltas=deltas,
        source_sha256={f'architecture_control_seed{s}.json': file_digest(OUTPUT / f'architecture_control_seed{s}.json') for s in runs},
        most_popular=reference['models']['MostPopular'],
        uncertainty='Sample SD across three training seeds; paired-user CIs are conditional within-fit intervals, not across-seed inference.',
        wall_seconds=time.perf_counter() - started, parent_peak_process_rss_bytes=peak_rss(),
        memory_note='Model RSS is isolated training-worker peak; parent evaluation RSS measured separately. No simultaneous combined peak measured.',
        additional_experiments_started=False)
    write_json(SUMMARY, summary)
    export_csv(OUTPUT / 'architecture_control_three_seed_summary.csv', rows)
    export_csv(OUTPUT / 'architecture_control_three_seed_deltas.csv', deltas)
    print(json.dumps({'completed_seeds': SEEDS, 'wall_seconds': summary['wall_seconds']}), flush=True)


if __name__ == '__main__':
    main()
