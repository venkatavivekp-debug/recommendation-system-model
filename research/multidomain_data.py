"""Strict offline interactions; application demo data is not a research source."""
import csv
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone

from data import ROOT, known_items, sample_examples

DOMAINS = ('food', 'fitness', 'media')
ITEM_TYPES = dict(zip(DOMAINS, ('recipe', 'activity', 'movie')))


def canonical(row):
    domain = row['domain']
    context = row.get('context', {})
    source = context.get('dataset', '') if isinstance(context, dict) else ''
    if domain not in DOMAINS or not isinstance(source, str) or not source:
        raise ValueError('A supported domain and context.dataset are required')
    user, item = row['userId'], row['itemId']
    if not isinstance(user, str) or not user.startswith(f'{source}:user:') or not user.removeprefix(f'{source}:user:'):
        raise ValueError('User IDs must retain their dataset namespace')
    prefix = f'{domain}:amazon:' if source == 'amazon' else f'{domain}:{ITEM_TYPES[domain]}:'
    if not isinstance(item, str) or not item.startswith(prefix) or not item.removeprefix(prefix):
        raise ValueError('Item IDs must retain their domain and item type')
    moment = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
    if moment.tzinfo is None:
        raise ValueError('Timestamp timezone is required; date-only sources need an explicit convention')
    if row['action'] != 'selected' or not math.isfinite(float(row['value'])):
        raise ValueError('This implicit baseline accepts documented positive selected interactions only')
    return {**row, 'timestamp': moment.astimezone(timezone.utc).isoformat(), 'context': dict(context)}


def load_inputs(inputs, threshold=4):
    if not 1 <= threshold <= 5:
        raise ValueError('MovieLens positive threshold must be between 1 and 5')
    rows, sources = [], {}
    for domain in DOMAINS:
        path = ROOT / inputs[domain]
        sources[domain] = {'path': inputs[domain], 'available': path.is_file()}
        if not path.is_file():
            continue
        if domain == 'media' and path.name == 'u.data':
            with path.open() as stream:
                raw = list(csv.reader(stream, delimiter='\t'))
            group = [canonical({
                'userId': f'movielens:user:{user}', 'itemId': f'media:movie:{item}',
                'domain': domain, 'action': 'selected', 'value': int(rating),
                'timestamp': datetime.fromtimestamp(int(time), timezone.utc).isoformat(),
                'context': {'dataset': 'movielens', 'positive_threshold': threshold},
            }) for user, item, rating, time in raw if int(rating) >= threshold]
            sources[domain].update(raw_interactions=len(raw), raw_users=len({r[0] for r in raw}),
                                   raw_items=len({r[1] for r in raw}))
        else:
            with path.open() as stream:
                group = [canonical(json.loads(line)) for line in stream if line.strip()]
            if any(row['domain'] != domain for row in group):
                raise ValueError(f'Wrong domain in {path}')
        sources[domain]['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        rows.extend(group)
    return rows, sources


def link_users(rows, linkage=None):
    if not linkage:
        return rows
    if not linkage.get('evidence') or linkage.get('kind') not in ('verified', 'synthetic_test'):
        raise ValueError('Explicit linkage evidence and kind are required')
    links = linkage['users']
    known = {row['userId'] for row in rows}
    if not set(links) <= known or any(not value.startswith('shared:user:') for value in links.values()):
        raise ValueError('Linkage must reference existing namespaced users and shared:user: targets')
    return [{**row, 'userId': links.get(row['userId'], row['userId']),
             'context': {**row['context'], 'sourceUserId': row['userId'],
                         'linkage_kind': linkage['kind'], 'linkage_evidence': linkage['evidence']}}
            for row in rows]


def statistics(rows):
    memberships = defaultdict(set)
    for row in rows:
        memberships[row['userId']].add(row['domain'])
    return {
        'domains': {domain: {
            'interactions': len(group), 'users': len({r['userId'] for r in group}),
            'items': len({r['itemId'] for r in group}),
        } for domain in DOMAINS for group in [[r for r in rows if r['domain'] == domain]]},
        'users_in_two_or_more_domains': sum(len(ds) >= 2 for ds in memberships.values()),
        'users_in_all_three_domains': sum(len(ds) == 3 for ds in memberships.values()),
        'synthetic': any(r['context'].get('synthetic') or
                         r['context'].get('linkage_kind') == 'synthetic_test' for r in rows),
    }


def iterative_core(rows, user_min=1, item_min=1):
    if user_min < 1 or item_min < 1:
        raise ValueError('Core thresholds must be positive')
    while True:
        users = Counter((r['domain'], r['userId']) for r in rows)
        items = Counter(r['itemId'] for r in rows)
        retained = [r for r in rows if users[r['domain'], r['userId']] >= user_min and items[r['itemId']] >= item_min]
        if len(retained) == len(rows):
            return retained
        rows = retained


def leakage_audit(splits):
    timelines = defaultdict(lambda: defaultdict(list))
    for name, rows in splits.items():
        for row in rows:
            timelines[row['userId']][name].append(row['timestamp'])
    violations = 0
    checked = 0
    for groups in timelines.values():
        future = groups['validation'] + groups['test']
        if groups['train'] and future:
            checked += 1
            violations += max(groups['train']) >= min(future)
        if groups['validation'] and groups['test']:
            violations += max(groups['validation']) >= min(groups['test'])
    return {'users_checked': checked, 'violations': violations,
            'users_without_train': sum(not g['train'] for g in timelines.values())}


def prepare_multidomain(rows, train_ratio=0.7, validation_ratio=0.15, split_scope='per_domain',
                        user_min=1, item_min=1):
    if not 0 < train_ratio < train_ratio + validation_ratio < 1:
        raise ValueError('Ratios must leave all three splits')
    if split_scope not in ('per_domain', 'global', 'per_user'):
        raise ValueError('Unknown split scope')
    if statistics(rows)['users_in_two_or_more_domains'] and split_scope == 'per_domain':
        raise ValueError('Shared users require a cross-domain timeline to prevent future auxiliary-domain leakage')
    splits = {name: [] for name in ('train', 'validation', 'test')}
    groups = [rows] if split_scope == 'global' else [[r for r in rows if r['domain'] == d] for d in DOMAINS]
    if split_scope == 'per_user':
        by_user = defaultdict(list)
        for row in rows:
            by_user[row['userId']].append(row)
        groups = [by_user[user] for user in sorted(by_user)]
    for group in groups:
        group = sorted(group, key=lambda r: (r['timestamp'], r['userId'], r['itemId']))
        if not group:
            continue
        # The existing JS splitter normalizes away nested IDs and value/context fields.
        # Apply the same chronological cutoff/tie policy without changing those records.
        train_end = group[max(0, int(len(group) * train_ratio) - 1)]['timestamp']
        valid_end = group[max(0, int(len(group) * (train_ratio + validation_ratio)) - 1)]['timestamp']
        for row in group:
            name = 'train' if row['timestamp'] <= train_end else 'validation' if row['timestamp'] <= valid_end else 'test'
            splits[name].append(row)
    temporal = leakage_audit(splits)
    if split_scope != 'per_domain' and temporal['violations']:
        raise ValueError('Cross-domain temporal leakage detected')
    train_before = statistics(splits['train'])
    splits['train'] = iterative_core(splits['train'], user_min, item_min)
    users = {user: index for index, user in enumerate(sorted({r['userId'] for r in splits['train']}))}
    items = {d: {item: index for index, item in enumerate(sorted({r['itemId'] for r in splits['train'] if r['domain'] == d}))} for d in DOMAINS}
    domain_users = {d: sorted({users[r['userId']] for r in splits['train'] if r['domain'] == d}) for d in DOMAINS}
    pairs, coverage = {}, {}
    for name, group in splits.items():
        pairs[name], coverage[name] = {}, {}
        for domain in DOMAINS:
            selected = [r for r in group if r['domain'] == domain]
            warm = [(users[r['userId']], items[domain][r['itemId']]) for r in selected
                    if r['userId'] in users and users[r['userId']] in domain_users[domain] and r['itemId'] in items[domain]]
            pairs[name][domain] = warm
            coverage[name][domain] = {'positives': len(selected), 'warm_positives': len(warm),
                                     'excluded_cold_positives': len(selected) - len(warm),
                                     'users': len({r['userId'] for r in selected}),
                                     'warm_users': len({u for u, _ in warm})}
    return {'user_mapping': users, 'item_mapping': items, 'domain_users': domain_users,
            'pairs': pairs, 'coverage': coverage, 'statistics': statistics(rows), 'split_scope': split_scope,
            'leakage_audit': temporal, 'training_filter': {'user_min': user_min, 'item_min': item_min,
                'before': train_before, 'after': statistics(splits['train'])}}


def examples_by_domain(dataset, split, negatives, seed):
    examples = {}
    for index, domain in enumerate(DOMAINS):
        history = dataset['pairs']['train'][domain]
        if split == 'validation':
            history = history + dataset['pairs']['validation'][domain]
        sampled = sample_examples(dataset['pairs'][split][domain], known_items(history),
                                  len(dataset['item_mapping'][domain]), negatives, seed + index)
        examples[domain] = [(u, item, index, label) for u, item, label in sampled]
    return examples


def batch_indices(examples, batch_size, balancing, seed, steps=None):
    if batch_size < 1 or balancing not in ('natural', 'balanced') or any(not examples[d] for d in DOMAINS):
        raise ValueError('Use a positive batch size, known balancing mode and three nonempty domains')
    rng = random.Random(seed)
    pools, offset = {}, 0
    for domain in DOMAINS:
        pools[domain] = list(range(offset, offset + len(examples[domain])))
        rng.shuffle(pools[domain])
        offset += len(examples[domain])
    if balancing == 'natural':
        order = list(range(offset))
        rng.shuffle(order)
    else:
        # Cycle smaller domains to the largest count; record these extra draws in training history.
        order = [pools[d][i % len(pools[d])] for i in range(max(map(len, pools.values()))) for d in DOMAINS]
    if steps is not None:
        if not isinstance(steps, int) or steps < 1:
            raise ValueError('Optimizer steps must be a positive integer')
        return [[order[j % len(order)] for j in range(i, i + batch_size)]
                for i in range(0, steps * batch_size, batch_size)]
    return [order[i:i + batch_size] for i in range(0, len(order), batch_size)]


def exposure_summary(counts, available):
    total = sum(sum(group.values()) for group in counts.values())
    return {d: {'sampled_examples': sum(group.values()), 'unique_examples': len(group),
                'repeated_examples': sum(group.values()) - len(group),
                'repetition_ratio': sum(group.values()) / len(group) if group else 0,
                'positive_draws': sum(n for (_, _, label), n in group.items() if label == 1),
                'unique_positive_interactions': sum(label == 1 for _, _, label in group),
                'effective_pool_passes': sum(group.values()) / available[d],
                'sampling_percent': 100 * sum(group.values()) / total if total else 0}
            for d, group in counts.items()}
