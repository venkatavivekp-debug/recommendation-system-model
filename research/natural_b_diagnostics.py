"""Observe Natural B without changing its optimizer or checkpoint selection."""
import hashlib
from datetime import datetime, timezone

import numpy as np
import torch
from torch.nn.functional import normalize

from amazon_data import file_digest, write_json
from amazon_diagnostics import candidate_fingerprints, digest
from amazon_replication import RESULTS, ROOT, load_model, read_json
from data import known_items
from multidomain_data import DOMAINS, load_inputs, prepare_multidomain
from multidomain_experiment import evaluate_domains, run, validation_view


def stats(values):
    values = np.asarray(values, dtype=np.float64)
    return {'mean': float(values.mean()), 'sd': float(values.std()), 'median': float(np.median(values)),
            'min': float(values.min()), 'max': float(values.max())}


def rank_summary(ranks):
    values = np.asarray(ranks)
    return {**stats(values), 'count': len(ranks), 'q25': float(np.quantile(values, .25)),
            'q75': float(np.quantile(values, .75)),
            **{f'top_{k}_percent': float(100 * (values <= k).mean()) for k in (10, 20, 50)},
            'outside_top_50_percent': float(100 * (values > 50).mean())}


def score_separation(positive, negative, margins):
    return {'positive_scores': stats(positive), 'negative_candidate_scores': stats(negative),
            'positive_minus_user_mean_negative': stats(margins),
            'fraction_positive_above_user_mean_negative': float((np.asarray(margins) > 0).mean())}


def inspect_scores(model, dataset, k):
    targets = {d: known_items(dataset['pairs']['test'][d]) for d in DOMAINS}
    observed = {d: {'ranks': [], 'positive': [], 'negative': [], 'margins': [], 'all': [], 'signatures': []} for d in DOMAINS}

    def observe(module, inputs, output):
        users, items, domains = inputs
        domain, user = DOMAINS[int(domains[0])], int(users[0])
        ids, scores = items.tolist(), output.detach().numpy().copy()
        relevant = targets[domain][user].intersection(ids)
        ranked = sorted(zip(ids, scores), key=lambda pair: (-pair[1], pair[0]))
        positions = {item: index + 1 for index, (item, _) in enumerate(ranked)}
        mask = np.array([i in relevant for i in ids])
        positives, negatives = scores[mask], scores[~mask]
        row = observed[domain]
        row['ranks'].extend(positions[i] for i in sorted(relevant))
        row['positive'].extend(positives.tolist())
        row['negative'].append(negatives)
        row['margins'].extend((positives.astype(np.float64) - negatives.astype(np.float64).mean()).tolist())
        row['all'].append(scores)
        row['signatures'].append(digest([user, ids, sorted(relevant)]))

    hook = model.register_forward_hook(observe)
    try:
        metrics, macro = evaluate_domains(model, dataset, k)
    finally:
        hook.remove()
    expected = candidate_fingerprints(dataset)
    summaries = {}
    for domain, row in observed.items():
        assert digest(row['signatures']) == expected[domain], 'Candidate policy changed'
        summaries[domain] = {'positive_ranks': rank_summary(row['ranks']),
                             **score_separation(row['positive'], np.concatenate(row['negative']), row['margins']),
                             'all_candidate_scores': stats(np.concatenate(row['all']))}
    return {'domains': metrics, 'macro': macro, 'diagnostics': summaries, 'candidate_sha256': expected}


def vector_summary(vectors):
    values = vectors.detach().double()
    cosines = normalize(values, dim=1) @ normalize(values, dim=1).T
    pairs = torch.triu_indices(len(values), len(values), offset=1)
    return {'norms': values.norm(dim=1).tolist(),
            'pairwise_cosine': stats(cosines[pairs[0], pairs[1]].numpy())}


def representations(model, dataset):
    users = sorted(set.intersection(*(set(dataset['domain_users'][d]) for d in DOMAINS)))[:16]
    domain_vectors = model.domain_embedding.weight.detach().double()
    unit = normalize(domain_vectors, dim=1)
    result = {'sample_user_indices': users, 'domain_norms': domain_vectors.norm(dim=1).tolist(),
              'domain_cosine_matrix': (unit @ unit.T).tolist(),
              'shared_users': {branch: vector_summary(getattr(model.core, branch).weight[users])
                               for branch in ('gmf_user', 'mlp_user')},
              'prediction_probe': {}}
    model.eval()
    with torch.no_grad():
        for index, domain in enumerate(DOMAINS):
            items = list(range(min(16, len(dataset['item_mapping'][domain]))))
            scores = model(torch.tensor(users).repeat_interleave(len(items)), torch.tensor(items).repeat(len(users)),
                           torch.full((len(users) * len(items),), index)).reshape(len(users), len(items)).double().numpy()
            result['prediction_probe'][domain] = {'item_indices': items, 'scores': stats(scores),
                'same_item_across_users_sd': stats(scores.std(axis=0)),
                'same_user_across_items_sd': stats(scores.std(axis=1))}
    return result


def checkpoint_comparison(epochs, selected):
    output = {}
    for domain in DOMAINS:
        values = [row['validation']['domains'][domain]['metrics']['ndcg'] for row in epochs]
        best = max(values)
        peaks = [row['epoch'] for row, value in zip(epochs, values) if value == best]
        selected_value = next(row['validation']['domains'][domain]['metrics']['ndcg'] for row in epochs if row['epoch'] == selected)
        output[domain] = {'selected_epoch': selected, 'best_ranking_epochs': peaks, 'best_ndcg': best,
                          'selected_ndcg': selected_value, 'ndcg_gap': best - selected_value,
                          'first_best_epoch_minus_selected': peaks[0] - selected}
    return output


def main():
    output = RESULTS / 'natural_b_diagnostics.json'
    if output.exists():
        raise ValueError('Diagnostics already exist; do not overwrite or retrain')
    frozen = read_json(RESULTS / 'amazon_multidomain_freeze.json')
    # The only core edit permitted for this diagnostic is the optional observer.
    core = (ROOT / 'research/multidomain_experiment.py').read_text().replace(
        'def run(dataset, config, sources=None, epoch_observer=None):', 'def run(dataset, config, sources=None):').replace(
        '        if epoch_observer is not None:\n            epoch_observer(model, history[-1])\n', '')
    for name, expected in frozen['frozen_code_sha256'].items():
        actual = hashlib.sha256(core.encode()).hexdigest() if name.endswith('multidomain_experiment.py') else file_digest(ROOT / name)
        assert actual == expected, name
    artifacts = {p: file_digest(p) for p in RESULTS.glob('amazon_multidomain_*.json')}
    config = frozen['config']
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    assert {d: s['sha256'] for d, s in sources.items()} == frozen['prepared_sha256']
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'], config['user_min'], config['item_min'])
    assert digest({key: dataset[key] for key in ('user_mapping', 'item_mapping', 'domain_users', 'pairs', 'coverage')}) == frozen['dataset_sha256']
    report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'dataset_sha256': frozen['dataset_sha256'],
              'notes': ['Population SD; quartiles use linear interpolation.',
                        'Negative candidates are unobserved warm items, not confirmed dislikes.',
                        'Margins weight each warm positive equally; negative scores pool candidate occurrences.',
                        'No historical gradients retained; gradient attribution skipped to keep training instrumentation minimal.',
                        'Balanced epoch ranking curves unavailable: only selected checkpoints retained; not retrained.'],
              'seeds': {}, 'natural_vs_balanced': {}, 'checkpoint_analysis': {}}
    validation = validation_view(dataset)
    for seed in (42, 43, 44):
        saved = read_json(RESULTS / f'amazon_multidomain_{"seed42_diagnostics" if seed == 42 else "seed" + str(seed)}.json')
        original = saved['modes']['natural']['models']['shared']
        settings = read_json(ROOT / original['run'] / 'config.json')
        epochs = []

        def observe_epoch(model, history):
            ranking = evaluate_domains(model, validation, settings['k'])
            epochs.append({**history, 'validation': {'domains': ranking[0], 'macro': ranking[1]}})
            print(seed, 'epoch', history['epoch'], {d: ranking[0][d]['metrics']['ndcg'] for d in DOMAINS}, flush=True)

        path, result = run(dataset, settings, sources, epoch_observer=observe_epoch)
        assert read_json(path / 'history.json') == read_json(ROOT / original['run'] / 'history.json')
        model, checkpoint = load_model(path)
        _, previous = load_model(ROOT / original['run'])
        assert all(torch.equal(value, previous['state_dict'][key]) for key, value in checkpoint['state_dict'].items())
        assert result['domains'] == original['domains']
        selected = result['training']['best_epochs']['shared']
        natural = {'epochs': epochs, 'selected_epoch': selected, 'stopping_epoch': len(epochs),
                   'diagnostic_run': str(path.relative_to(ROOT)), 'history_and_checkpoint_exact': True,
                   'test': inspect_scores(model, dataset, settings['k']), 'representations': representations(model, dataset)}
        balanced_saved = saved['modes']['balanced']['models']['shared']
        balanced_model, _ = load_model(ROOT / balanced_saved['run'])
        balanced = {'history': read_json(ROOT / balanced_saved['run'] / 'history.json'),
                    'training': balanced_saved['training'], 'test': inspect_scores(balanced_model, dataset, settings['k']),
                    'validation': evaluate_domains(balanced_model, validation, settings['k'])[0],
                    'representations': representations(balanced_model, dataset)}
        assert natural['test']['domains'] == original['domains']
        assert balanced['test']['domains'] == balanced_saved['domains']
        report['seeds'][str(seed)] = {'natural': natural, 'balanced': balanced}
        report['checkpoint_analysis'][str(seed)] = checkpoint_comparison(epochs, selected)
        budgets = {mode: saved['modes'][mode]['models']['shared']['budget'] for mode in ('natural', 'balanced')}
        report['natural_vs_balanced'][str(seed)] = {**budgets,
            'step_ratio': budgets['balanced']['total_optimizer_steps'] / budgets['natural']['total_optimizer_steps'],
            'example_ratio': sum(budgets['balanced']['total_examples'].values()) / sum(budgets['natural']['total_examples'].values())}
    report['warm_population'] = {split: {d: len(dataset['pairs'][split][d]) for d in DOMAINS} for split in ('train', 'validation', 'test')}
    report['cold_coverage_reference'] = 'amazon_multidomain_coverage.json; unchanged and excluded from these rankings'
    for path, expected in artifacts.items():
        assert file_digest(path) == expected, path
    write_json(output, report)
    print('Saved', output, flush=True)


if __name__ == '__main__':
    main()
