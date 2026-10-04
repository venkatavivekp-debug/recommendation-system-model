"""Read-only diagnostics around the frozen Amazon training and ranking protocol."""
import hashlib
import json
import math
import sqlite3
import statistics
from collections import Counter, defaultdict

import torch

from data import foundation, known_items
from multidomain_data import DOMAINS
from multidomain_experiment import evaluate_domains

METRICS = ('precision', 'recall', 'ndcg')
PAIRS = {'B-A': ('shared', 'independent'), 'C-A': ('shared_domain_specific', 'independent'),
         'C-B': ('shared_domain_specific', 'shared')}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def mean_sd(values):
    return {'mean': statistics.mean(values), 'sd': statistics.stdev(values) if len(values) > 1 else 0.0}


def distribution(values):
    values = sorted(values)
    if not values:
        return {'count': 0}
    return {'count': len(values), 'min': values[0], 'median': statistics.median(values),
            'mean': statistics.mean(values), 'max': values[-1],
            'p90': values[math.ceil(0.9 * len(values)) - 1]}


def training_budget(history, batch_size):
    epochs = []
    for row in history:
        draws = row['domain_draws']
        total = sum(draws.values())
        epochs.append({**row, 'optimizer_steps': math.ceil(total / batch_size),
                       'repeated_examples': {d: draws[d] - row['available_examples'][d] for d in DOMAINS},
                       'domain_percent': {d: 100 * draws[d] / total for d in DOMAINS}})
    return {'accounting': 'One optimizer step per batch, derived from recorded draws and fixed batch size',
            'epochs': epochs, 'total_optimizer_steps': sum(r['optimizer_steps'] for r in epochs),
            'total_examples': {d: sum(r['domain_draws'][d] for r in epochs) for d in DOMAINS}}


def candidate_fingerprints(dataset):
    hashes = {}
    for domain in DOMAINS:
        history = known_items(dataset['pairs']['train'][domain] + dataset['pairs']['validation'][domain])
        targets = known_items(dataset['pairs']['test'][domain])
        signatures = []
        for user, relevant in sorted(targets.items()):
            relevant = relevant - history[user]
            if relevant:
                items = [i for i in range(len(dataset['item_mapping'][domain])) if i not in history[user]]
                signatures.append(digest([user, items, sorted(relevant)]))
        hashes[domain] = digest(signatures)
    return hashes


def observe_evaluation(model, dataset, k):
    targets = {d: known_items(dataset['pairs']['test'][d]) for d in DOMAINS}
    requests, observations, signatures = ({d: [] for d in DOMAINS} for _ in range(3))

    def observe(module, inputs, output):
        users, item_tensor, domains = inputs
        user, domain = int(users[0]), DOMAINS[int(domains[0])]
        items, scores = item_tensor.tolist(), output.detach().tolist()
        if not bool(torch.isfinite(output).all()):
            raise ValueError('Non-finite ranking scores')
        relevant = targets[domain][user].intersection(items)
        # Observe the exact items passed to the frozen evaluator, not a new candidate policy.
        ranked = [item for item, _ in sorted(zip(items, scores), key=lambda pair: (-pair[1], pair[0]))]
        positions = {item: i + 1 for i, item in enumerate(ranked)}
        ranks = [positions[item] for item in sorted(relevant)]
        requests[domain].append({'rankedItems': list(map(str, ranked[:k])),
                                 'relevantItems': list(map(str, sorted(relevant))), 'k': k})
        signatures[domain].append(digest([user, items, sorted(relevant)]))
        values = output.detach().double()
        observations[domain].append({'user': user, 'candidate_count': len(items), 'target_ranks': ranks,
                                      'score_mean': float(values.mean()), 'score_sd': float(values.std(unbiased=False)),
                                      'score_min': min(scores), 'score_max': max(scores)})

    hook = model.register_forward_hook(observe)
    try:
        primary, macro = evaluate_domains(model, dataset, k)
    finally:
        hook.remove()
    expected = candidate_fingerprints(dataset)
    per_user, diagnostics = {}, {}
    for domain in DOMAINS:
        if digest(signatures[domain]) != expected[domain]:
            raise ValueError(f'Actual evaluator candidates/targets differ for {domain}')
        metrics = foundation('metrics', requests[domain])
        per_user[domain] = {str(row['user']): metric for row, metric in zip(observations[domain], metrics)}
        for metric in METRICS:
            average = sum(row[metric] for row in metrics) / len(metrics)
            if average != primary[domain]['metrics'][metric]:
                raise ValueError('Observed per-user metrics disagree with the primary evaluator')
        rows = observations[domain]
        ranks = [rank for row in rows for rank in row['target_ranks']]
        diagnostics[domain] = {'candidate_sha256': expected[domain], 'candidate_counts': distribution([r['candidate_count'] for r in rows]),
                               'positive_ranks': distribution(ranks), 'positive_top10_hits': sum(rank <= k for rank in ranks),
                               'user_score_means': distribution([r['score_mean'] for r in rows]),
                               'within_user_score_sd': distribution([r['score_sd'] for r in rows]),
                               'score_min': min(r['score_min'] for r in rows), 'score_max': max(r['score_max'] for r in rows),
                               'near_constant_users_sd_below_1e-6': sum(r['score_sd'] < 1e-6 for r in rows)}
    return primary, macro, per_user, diagnostics


def paired_counts(left, right):
    if set(left) != set(right):
        raise ValueError('Paired comparison requires identical evaluated users')
    counts = Counter(improved=0, unchanged=0, worsened=0)
    for user in left:
        delta = left[user]['ndcg'] - right[user]['ndcg']
        counts['improved' if delta > 1e-12 else 'worsened' if delta < -1e-12 else 'unchanged'] += 1
    return dict(counts)


def transfer_deltas(models):
    return {d: {name: {metric: models[left]['domains'][d]['metrics'][metric] - models[right]['domains'][d]['metrics'][metric]
                       for metric in METRICS} for name, (left, right) in PAIRS.items()} for d in DOMAINS}


def aggregate(seeds):
    result = {}
    for mode in ('natural', 'balanced'):
        result[mode] = {'models': {}, 'deltas': {}}
        for variant in ('independent', 'shared', 'shared_domain_specific'):
            models = [s['modes'][mode]['models'][variant] for s in seeds]
            result[mode]['models'][variant] = {
                'domains': {d: {m: mean_sd([r['domains'][d]['metrics'][m] for r in models]) for m in METRICS} for d in DOMAINS},
                'macro': {m: mean_sd([r['macro'][m] for r in models]) for m in METRICS}}
        for domain in DOMAINS:
            result[mode]['deltas'][domain] = {}
            for pair in PAIRS:
                values = [s['modes'][mode]['deltas'][domain][pair]['ndcg'] for s in seeds]
                result[mode]['deltas'][domain][pair] = {**mean_sd(values), 'per_seed': dict(zip([str(s['seed']) for s in seeds], values)),
                    'positive_seeds': sum(v > 1e-12 for v in values), 'negative_seeds': sum(v < -1e-12 for v in values)}
    return result


def coverage_audit(rows, dataset, config, database=None):
    # Independent reconstruction checks the audit against the frozen warm pair output.
    users = defaultdict(list)
    for row in rows:
        users[row['userId']].append(row)
    splits = {s: [] for s in ('train', 'validation', 'test')}
    for history in users.values():
        history.sort(key=lambda r: (r['timestamp'], r['userId'], r['itemId']))
        train_end = history[max(0, int(len(history) * config['train_ratio']) - 1)]['timestamp']
        valid_end = history[max(0, int(len(history) * (config['train_ratio'] + config['validation_ratio'])) - 1)]['timestamp']
        for row in history:
            splits['train' if row['timestamp'] <= train_end else 'validation' if row['timestamp'] <= valid_end else 'test'].append(row)
    result = {}
    for domain in DOMAINS:
        test = [r for r in splits['test'] if r['domain'] == domain]
        train = [r for r in splits['train'] if r['domain'] == domain]
        items = dataset['item_mapping'][domain]
        training_users = set(dataset['domain_users'][domain])
        warm, cold, no_history = [], [], []
        counts = Counter({r['userId']: 0 for r in test})
        for row in test:
            user = dataset['user_mapping'].get(row['userId'])
            if row['itemId'] not in items:
                cold.append(row)
            elif user not in training_users:
                no_history.append(row)
            else:
                warm.append((user, items[row['itemId']]))
                counts[row['userId']] += 1
        if sorted(warm) != sorted(dataset['pairs']['test'][domain]):
            raise ValueError('Coverage reconstruction differs from frozen test pairs')
        frequencies = Counter(r['itemId'] for r in train)
        if set(frequencies) != set(items):
            raise ValueError('This diagnostic expects the frozen unpruned training graph')
        cohort_frequency = Counter(r['itemId'] for r in rows if r['domain'] == domain)
        cold_items = {r['itemId'] for r in cold}
        validation_items = {r['itemId'] for r in splits['validation'] if r['domain'] == domain}
        result[domain] = {
            'total_test_positives': len(test), 'warm_test_positives': len(warm),
            'cold_item_test_positives': len(cold), 'known_item_missing_domain_history': len(no_history),
            'warm_percent': 100 * len(warm) / len(test), 'cold_item_percent': 100 * len(cold) / len(test),
            'all_exclusions_percent': 100 * (len(test) - len(warm)) / len(test),
            'test_users': len(counts), 'users_affected_by_cold_items': len({r['userId'] for r in cold}),
            'users_by_warm_positives': {'0': sum(n == 0 for n in counts.values()), '1': sum(n == 1 for n in counts.values()),
                                      '2+': sum(n >= 2 for n in counts.values())},
            'train_users': len(training_users), 'train_items': len(items), 'train_interactions': len(train),
            'mean_train_history': len(train) / len(training_users),
            'training_item_frequency': {'1': sum(n == 1 for n in frequencies.values()), '2': sum(n == 2 for n in frequencies.values()),
                                       '3-4': sum(3 <= n <= 4 for n in frequencies.values()),
                                       '5-9': sum(5 <= n <= 9 for n in frequencies.values()), '10+': sum(n >= 10 for n in frequencies.values())},
            'cohort_item_frequency': distribution(list(cohort_frequency.values())),
            'unique_cold_test_items': len(cold_items),
            'cold_items_single_occurrence_in_cohort': sum(cohort_frequency[i] == 1 for i in cold_items),
            'cold_items_also_in_validation': len(cold_items & validation_items),
            'items_removed_by_training_filter': 0,
        }
        if database:
            with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
                source_counts = [db.execute('SELECT n FROM items WHERE domain=? AND id=?',
                                           (domain, item.split(':')[-1])).fetchone()[0] for item in sorted(cold_items)]
            result[domain]['cold_item_full_source_frequency'] = distribution(source_counts)
            result[domain]['cold_items_with_at_least_5_source_reviews'] = sum(n >= 5 for n in source_counts)
    return result
