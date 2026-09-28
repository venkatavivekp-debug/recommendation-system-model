"""Predict-then-update replay of actual MovieLens ratings; no application feedback."""
import csv
import hashlib
import json
import math
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import groupby
from statistics import mean

import torch
from torch.func import functional_call
from torch.nn.functional import binary_cross_entropy_with_logits

from data import foundation
from context import CONTEXT_FEATURES, temporal_context

USER_WEIGHTS = ('gmf_user.weight', 'mlp_user.weight')
SETTINGS = {'learning_rate': 0.05, 'gradient_clip': 1.0, 'steps_per_group': 1,
            'minimum_prior_ratings': 5, 'history_depths': [5, 10, 20], 'k': 10}


def read_ratings(path):
    with open(path) as source:
        return sorted(({'user': u, 'item': 'media:' + i, 'rating': int(r), 'timestamp': int(t)}
                       for u, i, r, t in csv.reader(source, delimiter='\t')),
                      key=lambda row: (row['timestamp'], row['user'], row['item']))


def signal(rating):
    return 'positive' if rating >= 4 else 'low_preference' if rating <= 2 else 'neutral'


def user_vectors(model, user):
    weights = dict(model.named_parameters())
    return tuple(weights[name][user].detach().clone().requires_grad_() for name in USER_WEIGHTS)


def scores(model, user, items, vectors=None, context=None):
    indices = torch.tensor(items, dtype=torch.long)
    args = (torch.full_like(indices, user), indices)
    if model.context_dim:
        if context is None:
            raise ValueError('Context replay requires the current query context')
        args += (torch.tensor(context).expand(len(indices), -1),)
    if vectors is None:
        return model(*args)
    weights = dict(model.named_parameters())
    overrides = {name: weights[name].index_copy(0, torch.tensor([user]), vector.unsqueeze(0))
                 for name, vector in zip(USER_WEIGHTS, vectors)}
    return functional_call(model, overrides, args)


def update(model, user, vectors, feedback, learning_rate=0.05, gradient_clip=1.0, context=None):
    """One mean-BCE step for the revealed group; only two local vectors have gradients."""
    eligible = [(item, float(rating >= 4)) for item, rating in feedback if rating != 3]
    if not eligible:
        return vectors, 0.0, 0.0
    started = time.perf_counter()
    items, labels = zip(*eligible)
    loss = binary_cross_entropy_with_logits(scores(model, user, items, vectors, context), torch.tensor(labels))
    gradients = torch.autograd.grad(loss, vectors)
    norm = torch.linalg.vector_norm(torch.cat(gradients))
    if not torch.isfinite(norm):
        raise ValueError('Non-finite adaptive gradient')
    scale = min(1.0, gradient_clip / max(norm.item(), 1e-12))
    updated = tuple((v - learning_rate * scale * g).detach().requires_grad_()
                    for v, g in zip(vectors, gradients))
    delta = torch.linalg.vector_norm(torch.cat([a - b for a, b in zip(updated, vectors)])).item()
    return updated, delta, time.perf_counter() - started


def rank(model, user, candidates, vectors=None, context=None):
    with torch.no_grad():
        values = scores(model, user, candidates, vectors, context).tolist()
    ranking = sorted(zip(candidates, values), key=lambda row: (-row[1], row[0]))
    return [item for item, _ in ranking], dict(ranking)


def metric_average(records):
    by_user = defaultdict(list)
    for row in records:
        if 'metrics' in row:
            by_user[row['user']].append(row['metrics'])
    return {arm: {metric: mean(mean(r[arm][metric] for r in rows) for rows in by_user.values())
                  if by_user else None for metric in ('precision', 'recall', 'ndcg')}
            for arm in ('static', 'adaptive')}


def replay(model, dataset, ratings, settings=None):
    started = time.perf_counter()
    config = {**SETTINGS, **(settings or {})}
    if model.context_dim not in (0, len(CONTEXT_FEATURES)) or config['steps_per_group'] != 1:
        raise ValueError('Replay supports zero/four context features and one step per timestamp group')
    for key in ('learning_rate', 'gradient_clip', 'minimum_prior_ratings', 'k'):
        if not math.isfinite(config[key]) or config[key] <= 0:
            raise ValueError('Replay settings must be positive and finite')
    model.eval().requires_grad_(False)
    users, items = dataset['user_mapping'], dataset['item_mapping']
    external_items = {value: key for key, value in items.items()}
    cutoff = int(datetime.fromisoformat(dataset['coverage']['validation']['last_timestamp'].replace('Z', '+00:00')).timestamp())
    histories, future = defaultdict(list), defaultdict(list)
    for row in ratings:
        (histories if row['timestamp'] <= cutoff else future)[row['user']].append(row)
    all_users = sorted({row['user'] for row in ratings})
    eligible = {user for user in all_users if user in users and
                len(histories[user]) >= config['minimum_prior_ratings']}
    requests, records, update_times = [], [], []
    ranking_seconds = {'static': 0.0, 'adaptive': 0.0, 'after_feedback': 0.0}
    catalog_coverage = {'static': set(), 'adaptive': set()}
    for external_user in sorted(eligible):
        user = users[external_user]
        vectors = user_vectors(model, user)
        seen = {items[row['item']] for row in histories[external_user] if row['item'] in items}
        recent = histories[external_user][-5:]
        observed = 0
        for timestamp, group in groupby(sorted(future[external_user], key=lambda r: (r['timestamp'], r['item'])),
                                        key=lambda r: r['timestamp']):
            group = list(group)
            query_time = datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
            context = temporal_context(query_time) if model.context_dim else None
            candidates = [item for item in range(len(items)) if item not in seen]
            # Both rankings precede feedback access; timestamp peers cannot update each other.
            ranking_started = time.perf_counter()
            static_rank, _ = rank(model, user, candidates, context=context)
            ranking_seconds['static'] += time.perf_counter() - ranking_started
            ranking_started = time.perf_counter()
            before, before_scores = rank(model, user, candidates, vectors, context)
            ranking_seconds['adaptive'] += time.perf_counter() - ranking_started
            warm = [row for row in group if row['item'] in items and items[row['item']] not in seen]
            positive = [items[row['item']] for row in warm if row['rating'] >= 4]
            previous = vectors
            vectors, delta, seconds = update(model, user, vectors,
                                             [(items[row['item']], row['rating']) for row in warm],
                                             config['learning_rate'], config['gradient_clip'], context)
            if any(row['rating'] != 3 for row in warm):
                update_times.append(seconds)
            ranking_started = time.perf_counter()
            after, after_scores = rank(model, user, candidates, vectors, context)
            ranking_seconds['after_feedback'] += time.perf_counter() - ranking_started
            before_positions = {item: index + 1 for index, item in enumerate(before)}
            after_positions = {item: index + 1 for index, item in enumerate(after)}
            feedback = [{**row, 'signal': signal(row['rating']),
                         'rank_before': before_positions[items[row['item']]],
                         'rank_after': after_positions[items[row['item']]],
                         'rank_gain': before_positions[items[row['item']]] - after_positions[items[row['item']]],
                         'score_before': before_scores[items[row['item']]],
                         'score_after': after_scores[items[row['item']]]} for row in warm]
            row = {'user': external_user, 'timestamp': query_time,
                   'observed_ratings_before': observed, 'candidate_count': len(candidates),
                   'candidate_sha256': hashlib.sha256(json.dumps(candidates).encode()).hexdigest(),
                   'recent_ratings': recent, 'feedback': feedback, 'cold_events': len(group) - len(warm),
                   'static_top': [external_items[i] for i in static_rank[:config['k']]],
                   'adaptive_top_before': [external_items[i] for i in before[:config['k']]],
                   'adaptive_top_after': [external_items[i] for i in after[:config['k']]],
                   'ranking_changed': before != after, 'top_k_changed': before[:config['k']] != after[:config['k']],
                   'embedding_delta_norm': delta,
                   'embedding_delta': {name: (a - b).detach().tolist()
                                       for name, a, b in zip(USER_WEIGHTS, vectors, previous)},
                   'positive_targets': len(positive)}
            if context is not None:
                row['query_context'] = context
            if positive:
                row['metric_index'] = len(requests)
                for ranking in (static_rank, before):
                    requests.append({'rankedItems': [str(i) for i in ranking[:config['k']]],
                                     'relevantItems': [str(i) for i in positive], 'k': config['k']})
            for arm, ranking in (('static', static_rank), ('adaptive', before)):
                if warm:
                    catalog_coverage[arm].update(ranking[:config['k']])
            records.append(row)
            observed += len(warm)
            seen.update(items[r['item']] for r in warm)
            recent = (recent + group)[-5:]
    computed = foundation('metrics', requests)
    for row in records:
        if 'metric_index' in row:
            index = row.pop('metric_index')
            row['metrics'] = dict(zip(('static', 'adaptive'), computed[index:index + 2]))
    by_user = defaultdict(list)
    for row in records:
        by_user[row['user']].append(row)
    user_results = []
    for user, rows in by_user.items():
        metrics = metric_average(rows)
        if metrics['static']['ndcg'] is not None:
            user_results.append({'user': user, 'positive_groups': sum('metrics' in r for r in rows),
                                 'metrics': metrics, 'delta': {key: metrics['adaptive'][key] - metrics['static'][key]
                                                              for key in metrics['static']}})
    depths = {}
    selected = {}
    for depth in config['history_depths']:
        selected[depth] = [next((row for row in rows if row['observed_ratings_before'] >= depth and 'metrics' in row), None)
                           for rows in by_user.values()]
        selected[depth] = [row for row in selected[depth] if row]
    matched = set.intersection(*({row['user'] for row in rows} for rows in selected.values())) if selected else set()
    for depth, rows in selected.items():
        depths[str(depth)] = {'users': len(rows), 'positive_events': sum(r['positive_targets'] for r in rows),
                              'groups': len(rows), 'user_coverage': len(rows) / len(eligible) if eligible else 0,
                              'actual_history_counts': {r['user']: r['observed_ratings_before'] for r in rows},
                              'metrics': metric_average(rows), 'matched_users': len(matched),
                              'matched_metrics': metric_average([r for r in rows if r['user'] in matched])}
    feedback = [event for row in records for event in row['feedback']]
    examples = []
    if user_results:
        ordered = sorted(user_results, key=lambda r: (r['delta']['ndcg'], r['user']))
        for label, user in [('largest_gain', ordered[-1]),
                            ('nearest_zero', min(ordered, key=lambda r: (abs(r['delta']['ndcg']), r['user']))),
                            ('largest_loss', ordered[0])]:
            first = next((r for r in by_user[user['user']] if r['embedding_delta_norm'] > 0), by_user[user['user']][0])
            examples.append({'selection': label, **user, 'first_update_group': first})
    future_count = sum(len(rows) for rows in future.values())
    return {
        'settings': config, 'test_after': datetime.fromtimestamp(cutoff, timezone.utc).isoformat(),
        'coverage': {'total_users': len(all_users), 'eligible_users_at_cutoff': len(eligible),
                     'excluded_unknown_users': sum(u not in users for u in all_users),
                     'excluded_short_history_users': sum(u in users and u not in eligible for u in all_users),
                     'eligible_without_test_events': sum(not future[u] for u in eligible),
                     'users_with_test_events': len(by_user), 'users_with_warm_events': len({r['user'] for r in records if r['feedback']}),
                     'evaluated_users': len(user_results), 'all_test_events': future_count,
                     'excluded_ineligible_events': sum(len(rows) for u, rows in future.items() if u not in eligible),
                     'excluded_cold_events': sum(r['cold_events'] for r in records),
                     'warm_events': len(feedback), 'feedback_counts': dict(Counter(r['signal'] for r in feedback)),
                     'positive_groups': sum('metrics' in r for r in records),
                     'event_coverage': len(feedback) / future_count if future_count else 0,
                     'catalog_coverage': {arm: len(values) / len(items) for arm, values in catalog_coverage.items()}},
        'metrics': metric_average(records), 'history_depths': depths, 'users': user_results,
        'rank_diagnostics': {
            'mean_rank_gain': mean(r['rank_gain'] for r in feedback) if feedback else None,
            'by_signal': {name: mean(r['rank_gain'] for r in feedback if r['signal'] == name)
                          if any(r['signal'] == name for r in feedback) else None
                          for name in ('positive', 'low_preference', 'neutral')},
            'percent_events_ranking_changed': 100 * sum(len(r['feedback']) for r in records if r['ranking_changed']) / len(feedback) if feedback else 0,
            'percent_events_top_k_changed': 100 * sum(len(r['feedback']) for r in records if r['top_k_changed']) / len(feedback) if feedback else 0},
        'timing': {'updates': len(update_times), 'update_seconds_total': sum(update_times),
                   'update_ms_mean': 1000 * mean(update_times) if update_times else 0,
                   'ranking_calls_per_arm': len(records), 'ranking_seconds': ranking_seconds,
                   'replay_seconds': time.perf_counter() - started},
        'examples': examples, 'groups': records,
    }
