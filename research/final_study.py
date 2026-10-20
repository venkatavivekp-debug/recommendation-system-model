"""One-seed global-time C/context pilot. Frozen experiments are read-only inputs."""
import argparse
import hashlib
import json
import math
import resource
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np
import torch
from torch.nn.functional import binary_cross_entropy_with_logits

from amazon_data import file_digest, write_json
from data import ROOT, known_items, sample_examples
from multidomain_context import CONTEXT_DIM, ContextNeuMF, contextual_groups, global_splits
from multidomain_data import DOMAINS, batch_indices, load_inputs, prepare_multidomain
from multidomain_experiment import architecture, select_ranking_checkpoint
from multidomain_model import MultiDomainNeuMF

OUTPUT = ROOT / 'research/results/final_study'
CONFIG_PATH = ROOT / 'data/processed/amazon2023/amazon_shared_coverage_v2/config.json'
MANIFEST_PATH = ROOT / 'research/results/amazon_cohort_v2_manifest.json'
METRICS = ('precision', 'recall', 'ndcg')


def load_study():
    config = json.loads(CONFIG_PATH.read_text())
    manifest = json.loads(MANIFEST_PATH.read_text())
    if file_digest(CONFIG_PATH) != manifest['config_sha256']:
        raise ValueError('Frozen V2 configuration changed')
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    if any(sources[d]['sha256'] != manifest['prepared_files'][d]['sha256'] for d in DOMAINS):
        raise ValueError('Frozen V2 prepared data changed')
    if sorted({r['userId'] for r in rows}) != manifest['selected_users'] or any(r['value'] < 4 for r in rows):
        raise ValueError('Unexpected cohort or positive definition')
    config.update(split_scope='global', domain_balancing='balanced', seed=42,
                  model_variant='shared_domain_specific', max_optimizer_steps=3200,
                  validation_interval_steps=320, checkpoint_metric='macro_validation_ndcg')
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], 'global')
    splits, cutoffs = global_splits(rows, config['train_ratio'], config['validation_ratio'])
    return config, rows, dataset, splits, cutoffs, sources


def build_stream(rows, dataset, cutoffs):
    training = {d: [] for d in DOMAINS}
    queries = {s: {d: [] for d in DOMAINS} for s in ('validation', 'test')}
    repeats = {s: Counter() for s in queries}
    domain_users = {d: set(dataset['domain_users'][d]) for d in DOMAINS}
    seen = defaultdict(set)
    for external_user, timestamp, group, context in contextual_groups(rows):
        user = dataset['user_mapping'].get(external_user)
        split = 'train' if timestamp <= cutoffs['train_end'] else 'validation' if timestamp <= cutoffs['validation_end'] else 'test'
        warm = defaultdict(list)
        for row in group:
            domain = row['domain']
            item = dataset['item_mapping'][domain].get(row['itemId'])
            if user in domain_users[domain] and item is not None:
                warm[domain].append(item)
        for domain, items in warm.items():
            history = seen[user, domain]
            if split == 'train':
                training[domain].extend((user, item, *context) for item in items)
            else:
                repeats[split][domain] += sum(item in history for item in items)
                targets = sorted(set(items) - history)
                if targets:
                    queries[split][domain].append({'user': user, 'timestamp': timestamp,
                        'targets': targets, 'excluded': sorted(history), 'context': context})
            # All tied targets are evaluated before any becomes a historical exclusion.
            history.update(items)
    for domain in DOMAINS:
        if len(training[domain]) != len(dataset['pairs']['train'][domain]):
            raise ValueError('Context examples differ from train-only mapped positives')
    return training, queries, repeats


def coverage_table(splits, dataset, queries, repeats):
    coverage = {}
    for split, rows in splits.items():
        coverage[split] = {}
        for domain in DOMAINS:
            domain_users = set(dataset['domain_users'][domain])
            buckets = Counter()
            for row in rows:
                if row['domain'] != domain:
                    continue
                warm_user = dataset['user_mapping'].get(row['userId']) in domain_users
                warm_item = row['itemId'] in dataset['item_mapping'][domain]
                buckets[f"{'warm' if warm_user else 'cold'}_user_{'warm' if warm_item else 'cold'}_item"] += 1
            coverage[split][domain] = {**dataset['coverage'][split][domain],
                'train_items': len(dataset['item_mapping'][domain]), 'cold_start_categories': dict(buckets)}
            if split in queries:
                q = queries[split][domain]
                coverage[split][domain].update(evaluated_users=len({v['user'] for v in q}),
                    evaluated_timestamp_groups=len(q), evaluated_targets=sum(len(v['targets']) for v in q),
                    excluded_repeat_events=repeats[split][domain])
    coverage['test_users_warm_all_three'] = len(set.intersection(*[
        {q['user'] for q in queries['test'][d]} for d in DOMAINS]))
    return coverage


def ranking_metrics(top, targets, k=10):
    targets = set(targets)
    hits = [i for i, item in enumerate(top) if item in targets]
    ideal = sum(1 / math.log2(i + 2) for i in range(min(k, len(targets))))
    return dict(precision=len(hits) / k, recall=len(hits) / len(targets),
                ndcg=sum(1 / math.log2(i + 2) for i in hits) / ideal)


def logits(model, users, items, domains, contexts):
    return model(users, items, domains, contexts) if isinstance(model, ContextNeuMF) else model(users, items, domains)


def evaluate(model, dataset, queries, k=10):
    """Average tied-event queries within user, then users within each domain."""
    output = {}
    if model is not None:
        model.eval()
    for index, domain in enumerate(DOMAINS):
        catalog = torch.arange(len(dataset['item_mapping'][domain]))
        popularity = Counter(i for _, i in dataset['pairs']['train'][domain])
        popular_scores = np.array([popularity[i] for i in catalog.tolist()])
        metrics = defaultdict(list)
        for query in queries[domain]:
            if model is None:
                scores = popular_scores.copy().astype(float)
            else:
                with torch.no_grad():
                    context = torch.tensor(query['context']).expand(len(catalog), -1)
                    scores = logits(model, torch.full_like(catalog, query['user']), catalog,
                                    torch.full_like(catalog, index), context).numpy().copy()
                if not np.isfinite(scores).all():
                    raise ValueError('Non-finite recommendation scores')
            scores[query['excluded']] = -np.inf
            order = np.lexsort((np.arange(len(scores)), -scores))
            top = [int(i) for i in order[:k] if np.isfinite(scores[i])]
            metrics[query['user']].append(ranking_metrics(top, query['targets'], k))
        users = {str(u): {m: float(np.mean([r[m] for r in values])) for m in METRICS}
                 for u, values in sorted(metrics.items())}
        if not users:
            raise ValueError(f'No evaluable users in {domain}')
        output[domain] = {'metrics': {m: float(np.mean([v[m] for v in users.values()])) for m in METRICS},
                          'evaluated_users': len(users), 'queries': len(queries[domain]), 'per_user': users}
    macro = {m: float(np.mean([output[d]['metrics'][m] for d in DOMAINS])) for m in METRICS}
    return output, macro


def sampled_training(training, dataset, config, seed):
    examples = {}
    for index, domain in enumerate(DOMAINS):
        rows = training[domain]
        sampled = sample_examples([(r[0], r[1]) for r in rows], known_items(dataset['pairs']['train'][domain]),
            len(dataset['item_mapping'][domain]), config['negative_samples'], seed + index,
            contexts=[r[2:] for r in rows])
        examples[domain] = [(u, item, index, label, *context) for u, item, label, *context in sampled]
    return examples


def train_model(name, dataset, training, validation, config, run_directory):
    started = time.perf_counter()
    torch.manual_seed(config['seed'])
    cls = ContextNeuMF if name == 'C_context' else MultiDomainNeuMF
    model = cls(**architecture(dataset, config))
    optimizer = torch.optim.Adam(model.parameters(), lr=config['learning_rate'])
    best, history = None, []
    sample_hash = hashlib.sha256()
    draws = Counter()
    interval = config['validation_interval_steps']
    for epoch in range(1, config['max_optimizer_steps'] // interval + 1):
        examples = sampled_training(training, dataset, config, config['seed'] + epoch)
        values = torch.tensor([r for d in DOMAINS for r in examples[d]])
        model.train()
        loss_sum = 0.0
        for indices in batch_indices(examples, config['batch_size'], 'balanced', config['seed'] + epoch, interval):
            batch = values[indices]
            sample_hash.update(batch.numpy().tobytes())
            optimizer.zero_grad(set_to_none=True)
            predictions = logits(model, batch[:, 0].long(), batch[:, 1].long(), batch[:, 2].long(), batch[:, 4:])
            loss = binary_cross_entropy_with_logits(predictions, batch[:, 3])
            if not torch.isfinite(loss):
                raise ValueError('Non-finite training loss')
            loss.backward()
            optimizer.step()
            loss_sum += loss.item()
            draws.update(batch[:, 2].long().tolist())
        domains, macro = evaluate(model, dataset, validation, config['k'])
        best = select_ranking_checkpoint(model, domains, epoch, best)
        history.append({'step': epoch * interval, 'train_bce': loss_sum / interval,
                        'validation': {d: domains[d]['metrics'] for d in DOMAINS}, 'macro': macro})
        print(json.dumps({'model': name, **history[-1], 'elapsed_seconds': time.perf_counter() - started}), flush=True)
    model.load_state_dict(best['state'])
    checkpoint = run_directory / f'{name}.pt'
    torch.save({'architecture': architecture(dataset, config), 'state_dict': model.state_dict(),
                'config': config, 'user_mapping': dataset['user_mapping'],
                'item_mapping': dataset['item_mapping']}, checkpoint)
    return model, {'selected_step': best['epoch'] * interval, 'selected_validation_ndcg': best['score'],
        'history': history, 'sampling_sha256': sample_hash.hexdigest(),
        'domain_draws': {d: draws[i] for i, d in enumerate(DOMAINS)},
        'parameter_count': sum(p.numel() for p in model.parameters()),
        'checkpoint': str(checkpoint.relative_to(ROOT)), 'training_validation_seconds': time.perf_counter() - started}


def paired_bootstrap(before, after, seed=42, samples=2000):
    if set(before) != set(after) or not before:
        raise ValueError('Paired comparison requires identical nonempty user sets')
    users = sorted(before)
    delta = np.array([[after[u][m] - before[u][m] for m in METRICS] for u in users])
    rng = np.random.default_rng(seed)
    means = np.array([delta[rng.integers(len(users), size=len(users))].mean(axis=0) for _ in range(samples)])
    return {m: {'mean_paired_delta': float(delta[:, i].mean()),
                'ci95': np.quantile(means[:, i], [.025, .975]).tolist(), 'users': len(users)}
            for i, m in enumerate(METRICS)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--train', action='store_true', help='Run the predeclared C/context seed-42 pair')
    args = parser.parse_args()
    if (OUTPUT / 'protocol.json').exists():
        raise FileExistsError('Final-study protocol already exists; do not overwrite or silently repeat test evaluation')
    started = time.perf_counter()
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    config, rows, dataset, splits, cutoffs, sources = load_study()
    training, queries, repeats = build_stream(rows, dataset, cutoffs)
    coverage = coverage_table(splits, dataset, queries, repeats)
    stamp = datetime.now(timezone.utc).isoformat()
    protocol = {'generated_at': stamp, 'git_sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'cohort': config['cohort_id'], 'manifest_sha256': file_digest(MANIFEST_PATH), 'sources': sources,
        'code_sha256': {p.name: file_digest(p) for p in sorted((ROOT / 'research').glob('*.py'))},
        'config': config, 'cutoffs': cutoffs, 'coverage': coverage, 'leakage_audit': dataset['leakage_audit'],
        'models_this_pilot': ['MostPopular', 'C', 'C_context'], 'seed_sd': None,
        'context': {'dimension': CONTEXT_DIM, 'history': 'Five prior timestamp groups, latest first; domain proportions per tied group',
                    'time_gap_seconds': [3600, 86400, 604800, 2592000], 'no_history': 'All zeros',
                    'architecture': 'Zero-initialized linear shifts to GMF and MLP user vectors; 640 extra weights'},
        'evaluation': 'Full train catalog, previously observed positives excluded; tied targets predicted together before reveal. Average queries within user, then users; unweighted domain macro.',
        'observations': 'Only earlier positive events supply context/history, including earlier validation/test events; static parameters stay frozen.',
        'selection': 'Macro validation nDCG@10; earliest exact tie; ten fixed windows; test once after both checkpoints frozen',
        'negatives': 'Four unobserved train-catalog items per train positive, excluding all train positives; no validation/test mask',
        'uncertainty': '2000 paired user bootstrap draws, seed42; conditional on this trained seed, not training-seed uncertainty',
        'compute_estimate': {'runs': 2, 'expected_wall_minutes': [15, 25],
                             'validation_probe_queries': 90, 'validation_probe_seconds': 0.394346417,
                             'pair_ranking_seconds_estimate': 392.663872,
                             'C_parameter_gradient_adam_bytes': 35323856,
                             'memory_note': 'Existing eligible-negative pools may peak at a few GB; parameter estimate excludes data and framework memory'},
        'limitations': ['Retrospective cohort eligibility uses full-history activity counts, not model performance',
                       'Food/Fitness/Media are product-preference proxies', 'Not directly comparable to historical per-user/aggregate-target protocol',
                       'Item metadata for category diversity absent', 'No observed delayed rewards/exposures'],
        'versions': {'torch': str(torch.__version__), 'numpy': np.__version__, 'device': 'cpu', 'threads': 1}}
    print(json.dumps({'coverage': coverage, 'cutoffs': cutoffs, 'train_requested': args.train}), flush=True)
    if not args.train:
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_json(OUTPUT / 'protocol.json', protocol)
    run_directory = ROOT / 'research/runs' / datetime.now(timezone.utc).strftime('final-study-%Y%m%dT%H%M%S%fZ')
    run_directory.mkdir(parents=True, exist_ok=False)
    models, results = {}, {}
    # Freeze both validation-selected checkpoints before either sees test metrics.
    for name in ('C', 'C_context'):
        models[name], results[name] = train_model(name, dataset, training, queries['validation'], config, run_directory)
    if results['C']['sampling_sha256'] != results['C_context']['sampling_sha256']:
        raise ValueError('Controlled models received different training examples')
    for name, model in [('MostPopular', None), *models.items()]:
        tick = time.perf_counter()
        domains, macro = evaluate(model, dataset, queries['test'], config['k'])
        results.setdefault(name, {}).update(domains=domains, macro=macro, test_seconds=time.perf_counter() - tick)
        print(json.dumps({'model': name, 'test_macro': macro}), flush=True)
    paired = {d: paired_bootstrap(results['C']['domains'][d]['per_user'], results['C_context']['domains'][d]['per_user']) for d in DOMAINS}
    result = {'generated_at': datetime.now(timezone.utc).isoformat(), 'protocol_sha256': file_digest(OUTPUT / 'protocol.json'),
              'models': results, 'context_minus_C': paired, 'wall_seconds': time.perf_counter() - started,
              'peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024),
              'replication_started': False, 'adaptive_replay_started': False}
    write_json(OUTPUT / 'pilot_seed42.json', result)
    print(json.dumps({'output': str(OUTPUT), 'wall_seconds': result['wall_seconds'], 'paired': paired}), flush=True)


if __name__ == '__main__':
    main()
