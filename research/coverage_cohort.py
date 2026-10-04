"""Audit train-supported item coverage and prepare a deterministic V2 cohort."""
import hashlib
import json
import math
import sqlite3
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from amazon_data import CATEGORIES, file_digest, records, write_json
from amazon_diagnostics import candidate_fingerprints, digest
from amazon_replication import RESULTS, ROOT, read_json
from multidomain_data import (DOMAINS, examples_by_domain, iterative_core, load_inputs,
                              prepare_multidomain)
from multidomain_experiment import architecture, training_blockers
from multidomain_model import MultiDomainNeuMF, VARIANTS

RAW = ROOT / 'data/raw/amazon2023'
DATABASE = ROOT / 'data/processed/amazon2023/audit.sqlite'
V1_DIR = ROOT / 'data/processed/amazon2023/pilot'
V2_DIR = ROOT / 'data/processed/amazon2023/amazon_shared_coverage_v2'
AUDIT_PATH = RESULTS / 'amazon_coverage_audit.json'
MANIFEST_PATH = RESULTS / 'amazon_cohort_v2_manifest.json'
COHORT_SEED = 42
V2_SIZE = 2500
LARGER_POOL_SIZE = 5000
HISTORY_GATE = 5
HIGH_ACTIVITY_GATE = 10
ITEM_SUPPORT_CANDIDATES = (2, 3)
ITEM_BINS = ((1, 1), (2, 2), (3, 4), (5, 9), (10, 19), (20, None))

DECISION_RULE = ('Select the first 2,500 reviewers ordered by SHA256("42:" + reviewer_id) '
                 'among those with at least five full-history positive ratings in every domain. '
                 'This expands the existing nested hash cohort 2.5x, keeps genuine three-domain '
                 'users, and applies no item- or held-out-outcome filter. Selection does not read test events.')


def hash_order(user):
    return hashlib.sha256(f'{COHORT_SEED}:{user}'.encode()).digest()


def select_hash_users(users, limit):
    return sorted(users, key=lambda user: (hash_order(user), user))[:limit]


def event_type(user_warm, item_warm):
    if user_warm and item_warm:
        return 'warm'
    if not user_warm and not item_warm:
        return 'both'
    return 'cold_user' if not user_warm else 'cold_item'


def raw_item_id(domain, canonical_item):
    prefix = f'{domain}:amazon:'
    if not canonical_item.startswith(prefix):
        raise ValueError(f'Unexpected canonical item ID for {domain}: {canonical_item}')
    return canonical_item.removeprefix(prefix)


def eligible_users(minimum):
    with sqlite3.connect(f'file:{DATABASE}?mode=ro', uri=True) as db:
        query = ("SELECT f.id FROM users f JOIN users s ON s.id=f.id AND s.domain='fitness' "
                 "JOIN users m ON m.id=f.id AND m.domain='media' "
                 "WHERE f.domain='food' AND f.p>=? AND s.p>=? AND m.p>=?")
        return [row[0] for row in db.execute(query, (minimum, minimum, minimum))]


def split_timelines(rows, train_ratio=0.7, validation_ratio=0.15):
    by_user = defaultdict(list)
    for row in rows:
        by_user[row['userId']].append(row)
    splits = {name: [] for name in ('train', 'validation', 'test')}
    cutoffs = {}
    for user, history in by_user.items():
        history.sort(key=lambda row: (row['timestamp'], row['userId'], row['itemId']))
        train_end = history[max(0, int(len(history) * train_ratio) - 1)]['timestamp']
        valid_end = history[max(0, int(len(history) * (train_ratio + validation_ratio)) - 1)]['timestamp']
        cutoffs[user] = {'train_end': train_end, 'validation_end': valid_end}
        for row in history:
            name = 'train' if row['timestamp'] <= train_end else 'validation' if row['timestamp'] <= valid_end else 'test'
            splits[name].append(row)
    return splits, cutoffs


def frequency_summary(frequencies):
    values = sorted(frequencies.values())
    if not values:
        return {'items': 0, 'training_interactions': 0, 'bins': {}}
    total = sum(values)
    def quantile(percent):
        return values[max(0, math.ceil(percent * len(values)) - 1)]
    bins = {f'{start}' if end == start else f'{start}-{end}' if end else f'{start}+':
            sum(start <= value and (end is None or value <= end) for value in values)
            for start, end in ITEM_BINS}
    concentration = {}
    descending = sorted(values, reverse=True)
    for percent in (1, 5, 10):
        count = math.ceil(len(values) * percent / 100)
        concentration[f'top_{percent}_percent'] = {
            'items': count, 'interactions': sum(descending[:count]), 'interaction_share': sum(descending[:count]) / total}
    return {'items': len(values), 'training_interactions': total, 'bins': bins,
            'frequency_quantiles': {f'p{p}': quantile(p / 100) for p in (25, 50, 75, 90, 95, 99)},
            'top_item_concentration': concentration}


def training_support_selection(rows, candidate_users, limit):
    splits, _ = split_timelines(rows)
    frequencies = {domain: Counter(row['itemId'] for row in splits['train'] if row['domain'] == domain)
                   for domain in DOMAINS}
    counts = {user: {domain: 0 for domain in DOMAINS} for user in candidate_users}
    for row in splits['train']:
        if frequencies[row['domain']][row['itemId']] >= 2:
            counts[row['userId'].removeprefix('amazon:user:')][row['domain']] += 1
    ranked = sorted(candidate_users, key=lambda user: (
        -min(counts[user].values()), -sum(counts[user].values()), hash_order(user), user))
    return ranked[:limit], {'basis': 'train positives only; item support is measured in the 5,000-user hash pool',
                            'support_cutoff': 2,
                            'selected_user_support_summary': {
                                domain: {'mean_supported_train_positives': statistics.mean(counts[user][domain] for user in ranked[:limit]),
                                         'median_supported_train_positives': statistics.median(counts[user][domain] for user in ranked[:limit])}
                                for domain in DOMAINS}}


def load_selected_rows(cohorts, source_paths, expected_rejections):
    users = set().union(*cohorts.values())
    rows = []
    for domain in DOMAINS:
        counts = Counter()
        for user, item, rating, timestamp in records(source_paths[domain], counts):
            if rating >= 4 and user in users:
                from amazon_data import positive_record
                rows.append(positive_record((user, item, rating, timestamp), domain))
        rejected = {key: value for key, value in counts.items()
                    if key not in ('read', 'accepted', 'rejected')}
        if counts['rejected'] != expected_rejections[domain]['rejected'] or rejected != expected_rejections[domain]['rejection_reasons']:
            raise ValueError(f'Raw record rejections changed for {domain}: {rejected}')
        print(f'Loaded {domain}: selected positive records for {len(users)} candidate users', flush=True)
    rows.sort(key=lambda row: (row['timestamp'], row['userId'], row['itemId']))
    return rows


def user_coverage(test_rows, warm_rows, cohort_users):
    warm_counts = {user: Counter() for user in cohort_users}
    for row in warm_rows:
        warm_counts[row['userId']][row['domain']] += 1
    per_domain, user_rows = {}, {}
    for domain in DOMAINS:
        users = {row['userId'] for row in test_rows if row['domain'] == domain}
        counts = Counter(warm_counts[user][domain] for user in users)
        per_domain[domain] = {'test_users': len(users),
                              'users_by_warm_positives': {'0': counts[0], '1': counts[1],
                                                          '2+': sum(value for n, value in counts.items() if n >= 2)}}
    for minimum_domains in (1, 2, 3):
        user_rows[f'at_least_{minimum_domains}_domains'] = sum(
            sum(warm_counts[user][domain] > 0 for domain in DOMAINS) >= minimum_domains for user in cohort_users)
    return per_domain, user_rows


def temporal_type_summary(test_rows, dataset, splits, cutoffs, first_any=None, first_positive=None,
                           first_external_positive=None, v1_validation_items=None, larger_train_items=None):
    v1_train_items = dataset['item_mapping']
    domain_users = {domain: {row['userId'] for row in splits['train'] if row['domain'] == domain}
                    for domain in DOMAINS}
    classes = Counter()
    cold_reasons = {domain: Counter() for domain in DOMAINS}
    for row in test_rows:
        domain, user, item = row['domain'], row['userId'], row['itemId']
        item_warm = item in v1_train_items[domain]
        user_warm = user in domain_users[domain]
        label = event_type(user_warm, item_warm)
        classes[label] += 1
        if label in ('cold_item', 'both'):
            flags = []
            if v1_validation_items and item in v1_validation_items[domain]:
                flags.append('seen_in_v1_validation_not_v1_train')
            if larger_train_items and item in larger_train_items[domain]:
                flags.append('supported_in_5000_user_training_pool')
            cutoff = cutoffs[user]['train_end']
            if first_external_positive and first_external_positive[domain].get(item, float('inf')) <= _epoch(cutoff):
                flags.append('positive_history_outside_v1_before_user_train_cutoff')
            if first_any and first_any[domain].get(item, float('inf')) > _epoch(cutoff):
                flags.append('first_source_observation_after_user_train_cutoff')
            if first_positive and first_positive[domain].get(item, float('inf')) > _epoch(cutoff):
                flags.append('no_positive_source_event_before_user_train_cutoff')
            cold_reasons[domain]['|'.join(flags) if flags else 'no_v1_train_support_other_reason'] += 1
    return classes, {domain: dict(counts) for domain, counts in cold_reasons.items()}


def _epoch(iso_timestamp):
    return round(datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00')).timestamp() * 1000)


def source_temporal_support(cold_items, cohort_users, source_paths, expected_rejections):
    first_any = {domain: {} for domain in DOMAINS}
    first_positive = {domain: {} for domain in DOMAINS}
    first_external_positive = {domain: {} for domain in DOMAINS}
    source_counts = {domain: Counter() for domain in DOMAINS}
    for domain in DOMAINS:
        targets = {raw_item_id(domain, item): item for item in cold_items[domain]}
        counts = Counter()
        for user, item, rating, timestamp in records(source_paths[domain], counts):
            canonical_item = targets.get(item)
            if canonical_item is None:
                continue
            source_counts[domain][canonical_item] += 1
            first_any[domain][canonical_item] = min(first_any[domain].get(canonical_item, timestamp), timestamp)
            if rating >= 4:
                first_positive[domain][canonical_item] = min(first_positive[domain].get(canonical_item, timestamp), timestamp)
                if user not in cohort_users:
                    first_external_positive[domain][canonical_item] = min(first_external_positive[domain].get(canonical_item, timestamp), timestamp)
        rejected = {key: value for key, value in counts.items()
                    if key not in ('read', 'accepted', 'rejected')}
        if counts['rejected'] != expected_rejections[domain]['rejected'] or rejected != expected_rejections[domain]['rejection_reasons']:
            raise ValueError(f'Raw record rejections changed during temporal scan for {domain}: {rejected}')
        print(f'Temporal source scan {domain}: {len(targets)} held-out cold items', flush=True)
    return first_any, first_positive, first_external_positive, source_counts


def summarize_cohort(name, description, cohort_users, cohort_rows, item_min, config, support_meta=None):
    splits, cutoffs = split_timelines(cohort_rows, config['train_ratio'], config['validation_ratio'])
    dataset = prepare_multidomain(cohort_rows, config['train_ratio'], config['validation_ratio'], 'per_user', 1, item_min)
    filtered_train = iterative_core(splits['train'], 1, item_min)
    train_items = {domain: {row['itemId'] for row in filtered_train if row['domain'] == domain} for domain in DOMAINS}
    train_users = {domain: {row['userId'] for row in filtered_train if row['domain'] == domain} for domain in DOMAINS}
    training_freq = {domain: Counter(row['itemId'] for row in filtered_train if row['domain'] == domain) for domain in DOMAINS}
    test_rows = splits['test']
    warm_rows = [row for row in test_rows if row['itemId'] in train_items[row['domain']] and row['userId'] in train_users[row['domain']]]
    class_counts = Counter()
    for row in test_rows:
        item_warm = row['itemId'] in train_items[row['domain']]
        user_warm = row['userId'] in train_users[row['domain']]
        class_counts[event_type(user_warm, item_warm)] += 1
    canonical_users = {f'amazon:user:{user}' for user in cohort_users}
    per_domain_users, cross_domain_users = user_coverage(test_rows, warm_rows, canonical_users)
    examples = examples_by_domain(dataset, 'train', config['negative_samples'], 43)
    examples_by_mode = {
        'natural': sum(map(len, examples.values())),
        'balanced': 3 * max(map(len, examples.values())),
    }
    parameters = {}
    for variant in VARIANTS:
        model = MultiDomainNeuMF(**architecture(dataset, {**config, 'model_variant': variant}))
        parameters[variant] = sum(parameter.numel() for parameter in model.parameters())
    domains = {}
    for domain in DOMAINS:
        domain_train = [row for row in filtered_train if row['domain'] == domain]
        domain_validation = [row for row in splits['validation'] if row['domain'] == domain]
        domain_test = [row for row in splits['test'] if row['domain'] == domain]
        warm_test = [row for row in domain_test if row['itemId'] in train_items[domain] and row['userId'] in train_users[domain]]
        cold_items = [row for row in domain_test if row['itemId'] not in train_items[domain]]
        history = Counter(row['userId'] for row in domain_train)
        domains[domain] = {
            'training_positives': len(domain_train), 'training_share_percent': 100 * len(domain_train) / max(1, len(filtered_train)),
            'validation_positives': len(domain_validation), 'test_positives': len(domain_test),
            'items_in_training_vocabulary': len(train_items[domain]),
            'test_warm_positives': len(warm_test), 'test_cold_positives': len(domain_test) - len(warm_test),
            'warm_coverage_percent': 100 * len(warm_test) / max(1, len(domain_test)),
            'cold_item_test_positives': len(cold_items),
            'test_users': len({row['userId'] for row in domain_test}),
            'users_affected_by_cold_items': len({row['userId'] for row in cold_items}),
            'user_warm_coverage': per_domain_users[domain]['users_by_warm_positives'],
            'train_history': {'users': len(history), 'mean': statistics.mean(history.values()) if history else 0,
                              'median': statistics.median(history.values()) if history else 0},
            'training_item_frequency': frequency_summary(training_freq[domain]),
        }
    elapsed_steps = {mode: math.ceil(count / config['batch_size']) for mode, count in examples_by_mode.items()}
    validation_work = sum(dataset['coverage']['validation'][domain]['warm_users'] * len(train_items[domain]) for domain in DOMAINS)
    test_work = sum(dataset['coverage']['test'][domain]['warm_users'] * len(train_items[domain]) for domain in DOMAINS)
    ranking_pairs_per_run = 10 * validation_work + 2 * test_work
    parameter_bytes = {variant: count * 16 for variant, count in parameters.items()}
    return {'name': name, 'description': description, 'selection_count': len(cohort_users),
            'users_with_train_history_in_three_domains': len(set.intersection(*(train_users[d] for d in DOMAINS))),
            'user_retention_all_three_train_percent': 100 * len(set.intersection(*(train_users[d] for d in DOMAINS))) / max(1, len(cohort_users)),
            'heldout_event_types': dict(class_counts), 'warm_users_across_domains': cross_domain_users,
            'domains': domains, 'model_parameters': parameters,
            'estimated_training': {'sampled_train_examples_per_epoch': examples_by_mode,
                                   'optimizer_steps_per_epoch_batch512': elapsed_steps,
                                   'optimizer_steps_for_10_epochs': {mode: steps * 10 for mode, steps in elapsed_steps.items()},
                                   'natural_fixed_3200_step_examples': 3200 * config['batch_size'],
                                   'validation_plus_test_candidate_score_pairs_10_windows': ranking_pairs_per_run,
                                   'ranking_candidate_work_per_validation_window': validation_work,
                                   'approx_parameter_gradient_adam_bytes': parameter_bytes},
            'leakage_audit': dataset['leakage_audit'], 'training_blockers': training_blockers(dataset),
            'item_min_training_only': item_min, 'training_support_selection': support_meta or {},
            '_dataset': dataset, '_splits': splits, '_cutoffs': cutoffs, '_train_items': train_items,
            '_train_users': train_users, '_train_freq': training_freq, '_warm_rows': warm_rows,
            '_cohort_rows': cohort_rows, '_cohort_users': cohort_users}


def main():
    if AUDIT_PATH.exists():
        raise FileExistsError('Coverage audit already exists; refusing to overwrite')
    if MANIFEST_PATH.exists() != V2_DIR.exists():
        raise FileExistsError('V2 manifest and prepared cohort must either both exist or both be absent')
    raw_audit = read_json(RESULTS / 'amazon_multidomain_raw_audit.json')
    source_manifest = read_json(RESULTS / 'amazon_multidomain_dataset_manifest.json')
    source_paths = {domain: ROOT / source_manifest['files'][domain]['path'] for domain in DOMAINS}
    source_hashes = {domain: file_digest(path) for domain, path in source_paths.items()}
    assert source_hashes == {domain: source_manifest['files'][domain]['sha256'] for domain in DOMAINS}
    all_eligible = eligible_users(HISTORY_GATE)
    all_high_activity = eligible_users(HIGH_ACTIVITY_GATE)
    ordered = select_hash_users(all_eligible, len(all_eligible))
    if len(ordered) != 14226 or len(all_high_activity) != 2044:
        raise ValueError('Source eligible-user counts differ from the frozen overlap audit')
    hash_1000, hash_2500, hash_5000 = ordered[:1000], ordered[:V2_SIZE], ordered[:LARGER_POOL_SIZE]
    v1_rows, _ = load_inputs(read_json(V1_DIR / 'config.json')['inputs'], 4)
    v1_users = {row['userId'].removeprefix('amazon:user:') for row in v1_rows}
    if set(hash_1000) != v1_users:
        raise ValueError('V1 cohort is not the frozen first 1,000 users under the documented hash order')
    cohort_ids = {'v1_hash_1000': set(hash_1000), 'high_activity_10_each': set(all_high_activity),
                  'hash_2500': set(hash_2500), 'hash_5000': set(hash_5000)}
    expected_rejections = {
        domain: {'rejected': raw_audit['domains'][domain]['rejected'],
                 'rejection_reasons': raw_audit['domains'][domain]['rejection_reasons']}
        for domain in DOMAINS}
    all_rows = load_selected_rows(cohort_ids, source_paths, expected_rejections)
    rows_by_user = defaultdict(list)
    for row in all_rows:
        rows_by_user[row['userId'].removeprefix('amazon:user:')].append(row)
    pool_5000_rows = [row for user in hash_5000 for row in rows_by_user[user]]
    support_users, support_selection = training_support_selection(pool_5000_rows, hash_5000, V2_SIZE)
    cohort_ids['training_support_2500'] = set(support_users)
    support_meta = support_selection
    cohorts = {
        'v1_original_1000': {'users': set(hash_1000), 'description': 'Frozen V1 hash-selected cohort, re-read from the full source.'},
        'higher_activity_10_each': {'users': set(all_high_activity), 'description': 'All reviewers with at least 10 full-history positive interactions per domain.'},
        'hash_2500': {'users': set(hash_2500), 'description': 'First 2,500 under the V1 SHA-256 order among users with >=5 positives in every domain.'},
        'hash_5000': {'users': set(hash_5000), 'description': 'First 5,000 under the same SHA-256 order.'},
        'training_support_2500': {'users': set(support_users), 'description': 'Top 2,500 of the hash-ordered 5,000 by minimum then total count of train positives on items with pool train frequency >=2; hash breaks ties.'},
        'hash_2500_train_item_min_2': {'users': set(hash_2500), 'item_min': 2, 'description': 'Hash-2500 users; only training rows on items with cohort train frequency >=2 are retained.'},
        'hash_2500_train_item_min_3': {'users': set(hash_2500), 'item_min': 3, 'description': 'Hash-2500 users; only training rows on items with cohort train frequency >=3 are retained.'},
    }
    config = read_json(V1_DIR / 'config.json')
    comparison = {}
    for name, details in cohorts.items():
        users = details['users']
        cohort_rows = [row for user in users for row in rows_by_user[user]]
        comparison[name] = summarize_cohort(name, details['description'], users, cohort_rows,
                                            details.get('item_min', 1), config,
                                            support_meta if name == 'training_support_2500' else None)
        print(f"Summarized {name}: {len(users)} users; warm coverage "
              f"{ {d: round(comparison[name]['domains'][d]['warm_coverage_percent'], 2) for d in DOMAINS} }", flush=True)

    v1 = comparison['v1_original_1000']
    frozen_artifact = read_json(RESULTS / 'equal_step_balance_control_6seed.json')
    frozen_paths = set(RESULTS.glob('amazon_multidomain_*.json')) | {
        RESULTS / 'equal_step_balance_control.json', RESULTS / 'equal_step_balance_control_6seed.json',
        V1_DIR / 'config.json'}
    frozen_paths.update(Path(value['path']) for value in read_json(RESULTS / 'amazon_multidomain_prepared_manifest.json')['prepared_files'].values())
    old_hashes = {path: file_digest(path) for path in frozen_paths}
    assert digest({key: v1['_dataset'][key] for key in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')}) == frozen_artifact['protocol']['dataset_sha256']
    assert candidate_fingerprints(v1['_dataset']) == frozen_artifact['protocol']['candidate_sha256']
    if len(v1_rows) != (sum(row['training_item_frequency']['training_interactions'] for row in v1['domains'].values()) +
                        sum(v1['domains'][d]['validation_positives'] + v1['domains'][d]['test_positives'] for d in DOMAINS)):
        raise ValueError('V1 recomputed split counts do not match the stored source interactions')

    # The V2 user rule was fixed above before evaluating any test-side coverage.
    v2_name = 'hash_2500'
    v2 = comparison[v2_name]
    v1_cold_items = {d: {row['itemId'] for row in v1['_splits']['test'] if row['domain'] == d and row['itemId'] not in v1['_train_items'][d]}
                      for d in DOMAINS}
    first_any, first_positive, first_external_positive, source_counts = source_temporal_support(
        v1_cold_items, v1_users, source_paths, expected_rejections)
    v1_validation_items = {d: {row['itemId'] for row in v1['_splits']['validation'] if row['domain'] == d} for d in DOMAINS}
    larger_train_items = comparison['hash_5000']['_train_items']
    cold_classes, cold_reasons = temporal_type_summary(
        v1['_splits']['test'], v1['_dataset'], v1['_splits'], v1['_cutoffs'],
        first_any, first_positive, first_external_positive, v1_validation_items, larger_train_items)
    source_freq = {}
    for domain in DOMAINS:
        counts = [source_counts[domain][item] for item in v1_cold_items[domain]]
        counts.sort()
        source_freq[domain] = {'cold_unique_items': len(counts), 'median_all_rating_source_frequency': statistics.median(counts),
                               'p90_all_rating_source_frequency': counts[math.ceil(.9 * len(counts)) - 1]}
    temporal_reason = {'event_reason_counts': cold_reasons, 'cold_event_taxonomy': dict(cold_classes),
                       'cold_unique_item_source_frequency': source_freq,
                       'event_flag_counts': {
                           domain: {
                               flag: {'events': sum(count for reason, count in cold_reasons[domain].items()
                                                    if flag in reason.split('|')),
                                      'percent_of_cold_item_events': 100 * sum(
                                          count for reason, count in cold_reasons[domain].items()
                                          if flag in reason.split('|')) / max(1, sum(cold_reasons[domain].values()))}
                               for flag in ('seen_in_v1_validation_not_v1_train',
                                            'supported_in_5000_user_training_pool',
                                            'positive_history_outside_v1_before_user_train_cutoff',
                                            'first_source_observation_after_user_train_cutoff',
                                            'no_positive_source_event_before_user_train_cutoff')
                           } for domain in DOMAINS},
                       'cold_item_or_both_event_denominators': {
                           domain: sum(cold_reasons[domain].values()) for domain in DOMAINS},
                       'definitions': {'globally_late': 'The item’s first raw-source rating timestamp is after this reviewer’s V1 train cutoff.',
                                       'external_prior': 'At least one >=4 source rating by a reviewer outside V1 occurred before this reviewer’s train cutoff; this is point-in-time history, not the full-source per-user train split.',
                                       'larger_pool_train': 'The item has a positive training event in the nested 5,000-user hash cohort but none in V1.',
                                       'validation_only': 'The item occurs in V1 validation but not in V1 training.'}}

    v2_users = sorted(v2['_cohort_users'])
    v2_user_ids = sorted(f'amazon:user:{user}' for user in v2_users)
    v2_user_hash = digest(v2_user_ids)
    if len(set(v2_users) & v1_users) != 1000:
        raise ValueError('V2 hash cohort should retain all V1 users exactly')
    candidate_outputs = {}
    for name, summary in comparison.items():
        candidate_outputs[name] = {key: value for key, value in summary.items() if not key.startswith('_')}
    v1_metrics_hash = {str(path.relative_to(ROOT)): value for path, value in old_hashes.items()}
    audit = {'generated_at': datetime.now(timezone.utc).isoformat(),
             'scope': 'Data-only cohort and coverage analysis; no new model training or ranking metrics.',
             'source_sha256': source_hashes, 'v1_dataset_sha256': frozen_artifact['protocol']['dataset_sha256'],
             'v1_source_artifact_sha256': v1_metrics_hash,
             'selection_rule_declared_before_heldout_coverage_analysis': DECISION_RULE,
             'eligible_users': {'at_least_5_positive_ratings_each_domain': len(all_eligible),
                                'at_least_10_positive_ratings_each_domain': len(all_high_activity)},
             'current_v1_cold_temporal_analysis': temporal_reason,
             'cohort_strategies': candidate_outputs,
             'runtime_reference': runtime_reference(frozen_artifact, v1, v2),
             'selected_v2': {'strategy': v2_name, 'decision_reason': 'Predeclared mid-sized hash expansion: 2.5x V1 population, no item/test filtering, and a nested sample that preserves all V1 users.',
                             'coverage_is_reported_as_auditing_outcome_not_as_selection_score': True}}
    if V2_DIR.exists():
        verify_existing_v2(v2, v2_users, source_hashes, v2_user_hash)
    else:
        write_v2_cohort(v2, v2_users, config, source_hashes, v2_user_hash)
    write_json(AUDIT_PATH, audit)
    for path, before in old_hashes.items():
        assert file_digest(path) == before, f'Frozen V1 artifact changed: {path}'
    print('Saved V2 cohort and audit. No model training was run.', flush=True)


def verify_existing_v2(summary, users, source_hashes, user_hash):
    manifest = read_json(MANIFEST_PATH)
    data = summary['_dataset']
    config_path = V2_DIR / 'config.json'
    expected_dataset_hash = digest({key: data[key] for key in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')})
    if (manifest['selected_users_sha256'] != user_hash or manifest['source_sha256'] != source_hashes or
            manifest['dataset_sha256'] != expected_dataset_hash or manifest['selected_user_count'] != len(users)):
        raise ValueError('Existing V2 cohort does not match the declared deterministic selection')
    if manifest.get('config_sha256') and file_digest(config_path) != manifest['config_sha256']:
        raise ValueError('Existing V2 config changed')
    for domain, entry in manifest['prepared_files'].items():
        path = ROOT / entry['path']
        if file_digest(path) != entry['sha256']:
            raise ValueError(f'Existing V2 prepared file changed: {path}')


def runtime_reference(frozen_artifact, v1, v2):
    starts = []
    for run in frozen_artifact['runs']:
        if run['seed'] not in (45, 46, 47):
            continue
        stamp = Path(run['run']).name.removeprefix('multidomain-')
        starts.append(datetime.strptime(stamp, '%Y%m%dT%H%M%S%fZ'))
    gaps = [(right - left).total_seconds() for left, right in zip(sorted(starts), sorted(starts)[1:])
            if 0 < (right - left).total_seconds() < 300]
    v1_work = v1['estimated_training']['ranking_candidate_work_per_validation_window']
    v2_work = v2['estimated_training']['ranking_candidate_work_per_validation_window']
    return {'v1_equal_step_run_start_gap_seconds': {
                'count': len(gaps), 'median': statistics.median(gaps),
                'min': min(gaps), 'max': max(gaps),
                'note': 'Empirical adjacent run-start gaps from seeds 45-47; approximate end-to-end run time, not isolated training time.'},
            'v2_to_v1_validation_candidate_score_work_ratio': v2_work / v1_work,
            'note': 'A fixed-step V2 training run processes the same 1,638,400 examples as V1, but validation ranking work is estimated to be larger; wall time is not extrapolated from that ratio.'}


def write_v2_cohort(summary, users, base_config, source_hashes, user_hash):
    V2_DIR.parent.mkdir(parents=True, exist_ok=True)
    V2_DIR.mkdir(exist_ok=False)
    config = {key: value for key, value in base_config.items() if key not in ('inputs', 'seed', 'planned_seeds')}
    config.update(cohort_id='amazon_shared_coverage_v2', seed=42, planned_seeds=[42],
                  selection='First 2,500 under SHA256(42:reviewer_id) among users with >=5 full-history positives/domain')
    config['inputs'] = {}
    file_hashes = {}
    rows = summary['_cohort_rows']
    for domain in DOMAINS:
        path = V2_DIR / f'{domain}.jsonl'
        selected = [row for row in rows if row['domain'] == domain]
        with path.open('x') as stream:
            for row in selected:
                stream.write(json.dumps(row, separators=(',', ':')) + '\n')
        config['inputs'][domain] = str(path.relative_to(ROOT))
        file_hashes[domain] = {'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': file_digest(path)}
    write_json(V2_DIR / 'config.json', config)
    config_hash = file_digest(V2_DIR / 'config.json')
    v2_data = summary['_dataset']
    manifest = {'generated_at': datetime.now(timezone.utc).isoformat(),
                'cohort_id': 'amazon_shared_coverage_v2', 'selected_user_count': len(users),
                'selected_users': [f'amazon:user:{user}' for user in users], 'selected_users_sha256': user_hash,
                'dataset_sha256': digest({key: v2_data[key] for key in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')}),
                'source_sha256': source_hashes, 'prepared_files': file_hashes,
                'config_sha256': config_hash,
                'selection_rule': DECISION_RULE,
                'filtering': {'eligibility_uses_full_history_positive_rating_count': 5,
                              'training_user_min': 1, 'training_item_min': 1,
                              'heldout_events_removed': 0, 'training_vocabulary_uses_training_events_only': True},
                'split': {'scope': 'per-user cross-domain timeline', 'train_ratio': .70,
                          'validation_ratio': .15, 'test_ratio': .15,
                          'same_timestamp_ties': 'Kept in the earlier split; no user timeline crosses a boundary.'},
                'v1_retained_user_count': 1000,
                'coverage_summary': {domain: {'test_positives': summary['domains'][domain]['test_positives'],
                                               'warm_test_positives': summary['domains'][domain]['test_warm_positives'],
                                               'coverage_percent': summary['domains'][domain]['warm_coverage_percent']}
                                     for domain in DOMAINS},
                'model_training_performed': False}
    write_json(MANIFEST_PATH, manifest)


if __name__ == '__main__':
    main()
