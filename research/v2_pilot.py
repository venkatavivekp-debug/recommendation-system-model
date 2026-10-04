"""Run the single predeclared V2 Model C, Balanced, seed-42 feasibility pilot."""
import json
import math
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np
import torch

import multidomain_experiment as experiment
from amazon_data import file_digest, write_json
from amazon_diagnostics import candidate_fingerprints, digest
from amazon_replication import RESULTS, ROOT, read_json
from coverage_cohort import eligible_users, select_hash_users, split_timelines
from multidomain_data import DOMAINS, load_inputs, prepare_multidomain
from multidomain_model import MultiDomainNeuMF

MANIFEST_PATH = RESULTS / 'amazon_cohort_v2_manifest.json'
CONFIG_PATH = ROOT / 'data/processed/amazon2023/amazon_shared_coverage_v2/config.json'
PILOT_PATH = RESULTS / 'amazon_v2_pilot_seed42.json'
V1_CONFIG = ROOT / 'data/processed/amazon2023/pilot/config.json'
V1_RESULT = RESULTS / 'equal_step_balance_control_6seed.json'


def checked_dataset():
    started = time.perf_counter()
    manifest, config = read_json(MANIFEST_PATH), read_json(CONFIG_PATH)
    source_manifest = read_json(RESULTS / 'amazon_multidomain_dataset_manifest.json')
    if file_digest(CONFIG_PATH) != manifest['config_sha256']:
        raise ValueError('V2 config fingerprint changed')
    if manifest['model_training_performed']:
        raise ValueError('V2 manifest already records model training; refusing a second pilot')

    for domain in DOMAINS:
        entry = manifest['prepared_files'][domain]
        path = ROOT / entry['path']
        if file_digest(path) != entry['sha256']:
            raise ValueError(f'V2 prepared data changed: {domain}')

    source_hashes = {domain: file_digest(ROOT / source_manifest['files'][domain]['path']) for domain in DOMAINS}
    if source_hashes != manifest['source_sha256']:
        raise ValueError('Amazon source fingerprint differs from the V2 manifest')
    if source_hashes != {d: source_manifest['files'][d]['sha256'] for d in DOMAINS}:
        raise ValueError('Amazon source files differ from the frozen source manifest')

    users = manifest['selected_users']
    if digest(users) != manifest['selected_users_sha256'] or len(users) != 2500 or len(set(users)) != 2500:
        raise ValueError('V2 user manifest hash or size is invalid')
    eligible = eligible_users(5)
    if users != sorted('amazon:user:' + user for user in select_hash_users(eligible, 2500)):
        raise ValueError('V2 users do not match the predeclared deterministic selection')
    v1_rows, _ = load_inputs(read_json(V1_CONFIG)['inputs'], 4)
    v1_users = {row['userId'] for row in v1_rows}
    if len(v1_users) != 1000 or not v1_users <= set(users):
        raise ValueError('V2 does not retain every V1 user')
    if config.get('cohort_id') != manifest['cohort_id'] or config['positive_threshold'] != 4:
        raise ValueError('Unexpected V2 cohort ID or positive-rating threshold')
    if (config['embedding_dim'] != 16 or config['mlp_layers'] != [32, 16] or
            config['batch_size'] != 512 or config['learning_rate'] != 0.001 or
            config['negative_samples'] != 4 or config['split_scope'] != 'per_user'):
        raise ValueError('V2 pilot configuration differs from the established research protocol')

    load_started = time.perf_counter()
    rows, processed_sources = load_inputs(config['inputs'], config['positive_threshold'])
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'],
                                 config['split_scope'], config['user_min'], config['item_min'])
    load_seconds = time.perf_counter() - load_started
    if any(row['value'] < 4 for row in rows):
        raise ValueError('Prepared V2 data contains an interaction below the positive threshold')
    if any(source['sha256'] != manifest['prepared_files'][d]['sha256']
           for d, source in processed_sources.items()):
        raise ValueError('Loaded V2 source fingerprints differ from the manifest')

    dataset_hash = digest({key: dataset[key] for key in
                           ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')})
    if dataset_hash != manifest['dataset_sha256']:
        raise ValueError('V2 processed-data fingerprint differs from the manifest')
    if dataset['leakage_audit']['violations'] != 0:
        raise ValueError('V2 temporal split contains leakage')
    if dataset['split_scope'] != 'per_user':
        raise ValueError('V2 does not use the shared per-user timeline')
    candidates = candidate_fingerprints(dataset)
    split_hash = digest({'pairs': dataset['pairs'], 'coverage': dataset['coverage']})
    user_hash = digest(users)
    if manifest.get('split_sha256') not in (None, split_hash) or \
            manifest.get('candidate_sha256') not in (None, candidates):
        raise ValueError('V2 split or candidate fingerprint differs from its manifest')
    manifest['split_sha256'] = split_hash
    manifest['candidate_sha256'] = candidates
    with MANIFEST_PATH.open('w') as stream:
        json.dump(manifest, stream, indent=2, allow_nan=False)
        stream.write('\n')
    if not all(dataset['pairs']['validation'][d] and dataset['pairs']['test'][d] for d in DOMAINS):
        raise ValueError('A domain has no warm validation or test candidates')
    return config, rows, dataset, {
        'source_sha256': source_hashes, 'selected_users_sha256': user_hash,
        'processed_files_sha256': {d: manifest['prepared_files'][d]['sha256'] for d in DOMAINS},
        'dataset_sha256': dataset_hash, 'split_sha256': split_hash,
        'candidate_sha256': candidates, 'leakage_audit': dataset['leakage_audit'],
        'v1_user_retention': 1000, 'loaded_rows': len(rows),
        'data_loading_seconds': load_seconds,
        'preflight_wall_seconds': time.perf_counter() - started,
    }, manifest


def rank_coverage(rows, dataset, config):
    splits, _ = split_timelines(rows, config['train_ratio'], config['validation_ratio'])
    results, warm_by_user = {}, defaultdict(Counter)
    for split in ('validation', 'test'):
        results[split] = {}
        for domain in DOMAINS:
            group = [row for row in splits[split] if row['domain'] == domain]
            train_domain_users = set(dataset['domain_users'][domain])
            warm = [row for row in group if row['userId'] in dataset['user_mapping'] and
                    dataset['user_mapping'][row['userId']] in train_domain_users and
                    row['itemId'] in dataset['item_mapping'][domain]]
            results[split][domain] = {
                'total_positives': len(group), 'warm_positives': len(warm),
                'cold_positives': len(group) - len(warm),
                'warm_percent': 100 * len(warm) / max(1, len(group)),
            }
            if split == 'test':
                for row in warm:
                    warm_by_user[row['userId']][domain] += 1
                all_users = {row['userId'] for row in group}
                bins = Counter(warm_by_user[user][domain] for user in all_users)
                results[split][domain]['users_by_warm_positives'] = {
                    '0': bins[0], '1': bins[1],
                    '2+': sum(value for count, value in bins.items() if count >= 2),
                }
    results['test']['users_with_warm_positives_all_three_domains'] = sum(
        all(warm_by_user[user][domain] > 0 for domain in DOMAINS) for user in warm_by_user)
    return results


def score_capture(dataset):
    target_rows = {domain: defaultdict(set) for domain in DOMAINS}
    history_rows = {domain: defaultdict(set) for domain in DOMAINS}
    for i, domain in enumerate(DOMAINS):
        for user, item in dataset['pairs']['train'][domain] + dataset['pairs']['validation'][domain]:
            history_rows[domain][user].add(item)
        for user, item in dataset['pairs']['test'][domain]:
            if item not in history_rows[domain][user]:
                target_rows[domain][user].add(item)
    capture = {'enabled': False, 'domains': None}

    class ObservedNeuMF(MultiDomainNeuMF):
        def forward(self, users, items, domains):
            scores = super().forward(users, items, domains)
            if not torch.isfinite(scores).all():
                raise ValueError('Non-finite model logits')
            if capture['enabled']:
                for index, domain in enumerate(DOMAINS):
                    mask = domains == index
                    if not mask.any():
                        continue
                    values = scores[mask].detach().double().cpu()
                    item_values = items[mask].detach().cpu()
                    user_values = users[mask].detach().cpu()
                    bucket = capture['domains'][domain]
                    bucket['count'] += values.numel()
                    bucket['sum'] += values.sum().item()
                    bucket['sum_squares'] += values.square().sum().item()
                    bucket['minimum'] = min(bucket['minimum'], values.min().item())
                    bucket['maximum'] = max(bucket['maximum'], values.max().item())
                    for user in torch.unique(user_values).tolist():
                        selected = user_values == user
                        candidate_items, candidate_scores = item_values[selected], values[selected]
                        positives = target_rows[domain][user]
                        positive_mask = torch.tensor([int(item) in positives for item in candidate_items], dtype=torch.bool)
                        positive_scores = candidate_scores[positive_mask]
                        negative_scores = candidate_scores[~positive_mask]
                        bucket['positive_sum'] += positive_scores.sum().item()
                        bucket['positive_count'] += positive_scores.numel()
                        bucket['negative_sum'] += negative_scores.sum().item()
                        bucket['negative_count'] += negative_scores.numel()
                        for position in torch.where(positive_mask)[0].tolist():
                            score, item = candidate_scores[position], int(candidate_items[position])
                            ahead = (candidate_scores > score) | ((candidate_scores == score) &
                                                                  (candidate_items < item))
                            rank = int(ahead.sum()) + 1
                            bucket['ranks'].append(rank)
                            bucket['rank_fractions'].append(rank / candidate_items.numel())
            return scores

    return capture, ObservedNeuMF


def new_score_buckets():
    return {domain: {'count': 0, 'sum': 0.0, 'sum_squares': 0.0,
                     'minimum': float('inf'), 'maximum': float('-inf'),
                     'positive_sum': 0.0, 'positive_count': 0,
                     'negative_sum': 0.0, 'negative_count': 0, 'ranks': [],
                     'rank_fractions': []}
            for domain in DOMAINS}


def summarize_scores(domains):
    summaries = {}
    all_scores = []
    all_ranks = []
    for domain, row in domains.items():
        mean = row['sum'] / row['count']
        sd = math.sqrt(max(0.0, row['sum_squares'] / row['count'] - mean * mean))
        ranks = row['ranks']
        rank_fractions = row['rank_fractions']
        all_ranks.extend(ranks)
        pos_mean = row['positive_sum'] / row['positive_count']
        neg_mean = row['negative_sum'] / row['negative_count']
        summaries[domain] = {
            'prediction_logits': {'count': row['count'], 'mean': mean, 'sd': sd,
                                  'min': row['minimum'], 'max': row['maximum']},
            'positive_rank': {'count': len(ranks), 'mean': float(np.mean(ranks)),
                              'median': float(np.median(ranks)),
                              'p25': float(np.percentile(ranks, 25)),
                              'p75': float(np.percentile(ranks, 75)),
                              'top_10_percent': 100 * sum(rank <= .10 for rank in rank_fractions) / len(ranks),
                              'top_20_percent': 100 * sum(rank <= .20 for rank in rank_fractions) / len(ranks),
                              'top_50_percent': 100 * sum(rank <= .50 for rank in rank_fractions) / len(ranks),
                              'outside_top_50_percent': 100 * sum(rank > .50 for rank in rank_fractions) / len(ranks)},
            'mean_positive_score': pos_mean, 'mean_negative_score': neg_mean,
            'positive_minus_negative_margin': pos_mean - neg_mean,
        }
        all_scores.append(row)
    n = sum(row['count'] for row in all_scores)
    mean = sum(row['sum'] for row in all_scores) / n
    sd = math.sqrt(max(0.0, sum(row['sum_squares'] for row in all_scores) / n - mean * mean))
    return summaries, {'mean': mean, 'sd': sd,
                       'min': min(row['minimum'] for row in all_scores),
                       'max': max(row['maximum'] for row in all_scores)}, all_ranks


def representation_summary(model, initial_model):
    shared = (model.core.gmf_user.weight.norm(dim=1).square() +
              model.core.mlp_user.weight.norm(dim=1).square()).sqrt().detach()
    initial_shared = (initial_model.core.gmf_user.weight.norm(dim=1).square() +
                      initial_model.core.mlp_user.weight.norm(dim=1).square()).sqrt().detach()
    if torch.equal(model.core.gmf_user.weight, initial_model.core.gmf_user.weight):
        raise ValueError('Shared GMF user embeddings received no updates')
    if torch.equal(model.core.mlp_user.weight, initial_model.core.mlp_user.weight):
        raise ValueError('Shared MLP user embeddings received no updates')
    offsets = {}
    for index, domain in enumerate(DOMAINS):
        current = (model.gmf_offset.weight[index * model.user_count:(index + 1) * model.user_count].norm(dim=1).square() +
                   model.mlp_offset.weight[index * model.user_count:(index + 1) * model.user_count].norm(dim=1).square()).sqrt().detach()
        if not current.any():
            raise ValueError(f'{domain} domain-specific user offsets received no updates')
        offsets[domain] = current.mean().item()
    return {'mean_shared_user_embedding_norm': shared.mean().item(),
            'mean_initial_shared_user_embedding_norm': initial_shared.mean().item(),
            'mean_domain_offset_norm': offsets}


def prediction_variation(model, dataset):
    model.eval()
    with torch.no_grad():
        domain = 0
        users = dataset['domain_users'][DOMAINS[domain]][:2]
        items = list(dataset['item_mapping'][DOMAINS[domain]].values())[:2]
        if len(users) < 2 or len(items) < 2:
            raise ValueError('Need two warm users and items to check prediction variation')
        user_scores = model(torch.tensor([users[0], users[1]]), torch.tensor([items[0], items[0]]),
                            torch.tensor([domain, domain]))
        item_scores = model(torch.tensor([users[0], users[0]]), torch.tensor([items[0], items[1]]),
                            torch.tensor([domain, domain]))
    if not torch.isfinite(user_scores).all() or not torch.isfinite(item_scores).all():
        raise ValueError('Prediction variation probe produced non-finite logits')
    if torch.isclose(user_scores[0], user_scores[1]) or torch.isclose(item_scores[0], item_scores[1]):
        raise ValueError('Predictions do not vary across users and items')
    return {'different_users': True, 'different_items': True}


def run_pilot():
    if PILOT_PATH.exists():
        raise FileExistsError(f'Result already exists; refusing another pilot: {PILOT_PATH}')
    config, rows, dataset, fingerprints, manifest = checked_dataset()
    coverage = rank_coverage(rows, dataset, config)
    score_state, observed_class = score_capture(dataset)
    original_eval = experiment.evaluate_domains
    eval_times = []
    score_captures = []
    def timed_evaluate(model, eval_dataset, k):
        is_validation = eval_dataset['pairs']['test'] is dataset['pairs']['validation']
        started = time.perf_counter()
        if not is_validation:
            score_state['domains'] = new_score_buckets()
            score_state['enabled'] = True
        try:
            result = original_eval(model, eval_dataset, k)
        finally:
            if not is_validation:
                score_state['enabled'] = False
                score_captures.append(score_state['domains'])
            eval_times.append({'kind': 'validation' if is_validation else 'test',
                               'seconds': time.perf_counter() - started})
        return result

    experiment.evaluate_domains = timed_evaluate
    experiment.MultiDomainNeuMF = observed_class
    run_config = {**config, 'model_variant': 'shared_domain_specific',
                  'domain_balancing': 'balanced', 'seed': 42,
                  'max_optimizer_steps': 3200, 'validation_interval_steps': 320,
                  'checkpoint_metric': 'macro_validation_ndcg', 'epochs': 10}
    started = time.perf_counter()
    try:
        run_path, result = experiment.run(dataset, run_config)
    finally:
        experiment.evaluate_domains = original_eval
        experiment.MultiDomainNeuMF = MultiDomainNeuMF
    run_seconds = time.perf_counter() - started

    if result['training']['optimizer_steps'] != 3200 or result['training']['domain_balancing'] != 'balanced':
        raise ValueError('Pilot did not meet its fixed-step and balanced-sampling protocol')
    if sum(v['sampled_examples'] for v in result['training']['exposure'].values()) != 3200 * 512:
        raise ValueError('Pilot sampled-example count is not 1,638,400')
    if any(result['training']['exposure'][d]['sampled_examples'] == 0 or
           result['training']['exposure'][d]['positive_draws'] == 0 for d in DOMAINS):
        raise ValueError('A domain did not receive training examples and positives')
    if result['training']['ranking_selected_epoch'] < 1 or result['protocol']['selection'] != 'Unweighted macro validation nDCG; earliest exact tie':
        raise ValueError('Unexpected checkpoint selection rule')
    if not all(math.isfinite(value) for domain in result['domains'].values()
               for value in domain['metrics'].values()) or not all(
                   math.isfinite(value) for value in result['macro'].values()):
        raise ValueError('Pilot metrics contain non-finite values')
    if any(not capture for capture in score_captures):
        raise ValueError('No test scoring outputs were captured')

    checkpoint = torch.load(run_path / 'ranking_best.pt', weights_only=True)
    model = MultiDomainNeuMF(**checkpoint['architecture'])
    model.load_state_dict(checkpoint['state_dict'])
    selected_validation, selected_macro = original_eval(model, experiment.validation_view(dataset), config['k'])
    if selected_validation != result['checkpoint_comparison']['ranking']['validation'] or \
            selected_macro != result['checkpoint_comparison']['ranking']['validation_macro']:
        raise ValueError('Reloaded ranking checkpoint does not reproduce its selected validation result')
    if checkpoint['selected_epoch'] != result['training']['ranking_selected_epoch']:
        raise ValueError('Selected epoch differs after checkpoint reload')

    torch.manual_seed(42)
    initial = MultiDomainNeuMF(**checkpoint['architecture'])
    representation = representation_summary(model, initial)
    variation = prediction_variation(model, dataset)
    diagnostics, overall_logits, ranks = summarize_scores(score_captures[-1])
    if len(ranks) != sum(result['domains'][d]['coverage']['warm_positives'] for d in DOMAINS):
        raise ValueError('Captured positive ranks do not match warm test positives')

    validation_times = [entry['seconds'] for entry in eval_times if entry['kind'] == 'validation']
    test_times = [entry['seconds'] for entry in eval_times if entry['kind'] == 'test']
    ranking_windows = run_config['epochs']
    timing = {
        'data_loading_seconds': fingerprints['data_loading_seconds'],
        'training_and_validation_bce_checkpoint_io_seconds': max(
            0.0, run_seconds - sum(entry['seconds'] for entry in eval_times)),
        'validation_ranking_seconds': sum(validation_times[:ranking_windows]),
        'checkpoint_validation_checks_seconds': sum(validation_times[ranking_windows:]),
        'test_evaluation_seconds': sum(test_times),
        'run_wall_seconds': run_seconds,
        'total_wall_seconds': fingerprints['preflight_wall_seconds'] + run_seconds,
        'note': 'Run wall time includes optimizer work, BCE validation, ranking, test passes, and persistence. The residual field is an approximate combined training/BCE/checkpoint-I/O duration.'}
    v1 = read_json(V1_RESULT)
    reference = next(row for row in v1['runs'] if row['seed'] == 42 and row['variant'] ==
                     'shared_domain_specific' and row['mode'] == 'balanced')
    pilot = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'purpose': 'Single V2 feasibility pilot; not a V1-controlled performance comparison.',
        'comparison_warning': 'DIFFERENT COHORTS — NOT A CONTROLLED PERFORMANCE IMPROVEMENT.',
        'configuration': {key: run_config[key] for key in
                          ('model_variant', 'domain_balancing', 'seed', 'embedding_dim', 'mlp_layers',
                           'domain_dim', 'learning_rate', 'batch_size', 'negative_samples',
                           'positive_threshold', 'max_optimizer_steps', 'validation_interval_steps',
                           'checkpoint_metric')},
        'fingerprints': fingerprints,
        'temporal_split': {'scope': dataset['split_scope'], 'leakage': dataset['leakage_audit'],
                           'split_sha256': fingerprints['split_sha256']},
        'coverage': coverage,
        'metrics': {'domains': result['domains'], 'macro': result['macro']},
        'diagnostics': {'ranking_and_score': diagnostics, 'all_test_logits': overall_logits,
                        'prediction_variation': variation, 'representation_norms': representation},
        'checkpoint': {'run_directory': str(run_path.relative_to(ROOT)),
                       'selected_epoch': result['training']['ranking_selected_epoch'],
                       'selected_step': result['training']['ranking_selected_epoch'] * 320,
                       'reload_reproduced_validation': True},
        'training': result['training'], 'timing': timing,
        'v1_reference': {'warning': 'DIFFERENT COHORTS — NOT A CONTROLLED PERFORMANCE IMPROVEMENT.',
                         'run': reference['run'], 'metrics': reference['result']['domains'],
                         'macro': reference['result']['macro']},
        'pilot_model_training_performed': True,
        'v2_full_replication_started': False,
    }
    write_json(PILOT_PATH, pilot)
    manifest['model_training_performed'] = True
    manifest['pilot_result'] = str(PILOT_PATH.relative_to(ROOT))
    manifest['pilot_run'] = str(run_path.relative_to(ROOT))
    with MANIFEST_PATH.open('w') as stream:
        json.dump(manifest, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'result': str(PILOT_PATH), 'run': str(run_path),
                      'steps': result['training']['optimizer_steps'],
                      'metrics': pilot['metrics'], 'timing': timing}, indent=2), flush=True)


if __name__ == '__main__':
    run_pilot()
