"""Audit first; real three-domain training requires three usable interaction sources."""
import argparse
import copy
import hashlib
import json
import math
import random
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.nn.functional import binary_cross_entropy_with_logits

from data import ROOT, foundation, known_items
from multidomain_data import DOMAINS, batch_indices, examples_by_domain, exposure_summary, link_users, load_inputs, prepare_multidomain
from multidomain_model import MultiDomainNeuMF


def architecture(dataset, config):
    return dict(user_count=len(dataset['user_mapping']),
                item_counts=[len(dataset['item_mapping'][d]) for d in DOMAINS],
                domain_users=[dataset['domain_users'][d] for d in DOMAINS],
                variant=config['model_variant'], embedding_dim=config['embedding_dim'],
                hidden_sizes=config['mlp_layers'], domain_dim=config['domain_dim'])


def training_blockers(dataset):
    blockers = []
    for domain in DOMAINS:
        for split in ('train', 'validation', 'test'):
            if not dataset['pairs'][split][domain]:
                blockers.append(f'{domain}: no warm {split} interactions')
        users_per_item = {}
        for user, item in dataset['pairs']['train'][domain]:
            users_per_item.setdefault(item, set()).add(user)
        if sum(len(users) > 1 for users in users_per_item.values()) < 2:
            blockers.append(f'{domain}: fewer than two items shared by multiple training users')
        history = known_items(dataset['pairs']['train'][domain] + dataset['pairs']['validation'][domain])
        if not any(item not in history[user] for user, item in dataset['pairs']['test'][domain]):
            blockers.append(f'{domain}: no unseen warm test targets')
    return blockers


def evaluate_domains(model, dataset, k):
    output = {}
    model.eval()
    for index, domain in enumerate(DOMAINS):
        history = known_items(dataset['pairs']['train'][domain] + dataset['pairs']['validation'][domain])
        relevant = known_items(dataset['pairs']['test'][domain])
        requests, samples = [], []
        excluded_repeats = 0
        for user, targets in sorted(relevant.items()):
            excluded_repeats += len(targets & history[user])
            targets = targets - history[user]
            if not targets:
                continue
            candidates = [item for item in range(len(dataset['item_mapping'][domain])) if item not in history[user]]
            items = torch.tensor(candidates, dtype=torch.long)
            with torch.no_grad():
                scores = model(torch.full_like(items, user), items, torch.full_like(items, index)).tolist()
            ranked = [item for item, _ in sorted(zip(candidates, scores), key=lambda pair: (-pair[1], pair[0]))]
            requests.append({'rankedItems': list(map(str, ranked[:k])), 'relevantItems': list(map(str, sorted(targets))), 'k': k})
            if len(samples) < 3:
                samples.append({'user_index': user, 'target_ranks': {str(item): ranked.index(item) + 1 for item in sorted(targets)}})
        metrics = foundation('metrics', requests) if requests else []
        output[domain] = {
            'metrics': {key: sum(row[key] for row in metrics) / len(metrics) for key in ('precision', 'recall', 'ndcg')} if metrics else None,
            'evaluated_users': len(requests), 'warm_test_users': len(relevant),
            'excluded_repeat_targets': excluded_repeats, 'examples': samples,
            'coverage': dataset['coverage']['test'][domain],
        }
    valid = [row['metrics'] for row in output.values() if row['metrics']]
    return output, {key: sum(row[key] for row in valid) / len(valid) for key in ('precision', 'recall', 'ndcg')} if valid else None


def validation_view(dataset):
    return {**dataset, 'pairs': {**dataset['pairs'], 'validation': {d: [] for d in DOMAINS},
                               'test': dataset['pairs']['validation']},
            'coverage': {**dataset['coverage'], 'test': dataset['coverage']['validation']}}


def select_ranking_checkpoint(model, domains, epoch, selected):
    score = sum(domains[d]['metrics']['ndcg'] for d in DOMAINS) / len(DOMAINS)
    if not math.isfinite(score):
        raise ValueError('Non-finite validation ranking criterion')
    if selected is None or score > selected['score']:
        return {'epoch': epoch, 'score': score, 'state': copy.deepcopy(model.state_dict())}
    return selected


def run(dataset, config, sources=None, epoch_observer=None):
    step_budget = config.get('max_optimizer_steps')
    interval = config.get('validation_interval_steps')
    if step_budget is not None and any(not isinstance(v, int) or isinstance(v, bool) or v < 1 for v in (step_budget, interval)):
        raise ValueError('Fixed-step training requires positive step budget and validation interval')
    criterion = config.get('checkpoint_metric', 'validation_bce')
    if criterion not in ('validation_bce', 'macro_validation_ndcg'):
        raise ValueError('Unknown checkpoint metric')
    ranking_best, ranking_history = None, []
    if config['domains'] != list(DOMAINS):
        raise ValueError('Domain order must be food, fitness, media')
    for key in ('embedding_dim', 'domain_dim', 'batch_size', 'epochs', 'negative_samples', 'patience', 'k'):
        if not isinstance(config[key], int) or config[key] < 1:
            raise ValueError(f'{key} must be a positive integer')
    if not config['mlp_layers'] or any(not isinstance(n, int) or n < 1 for n in config['mlp_layers']):
        raise ValueError('MLP layers must be positive integers')
    if not math.isfinite(config['learning_rate']) or config['learning_rate'] <= 0:
        raise ValueError('Learning rate must be positive and finite')
    blockers = training_blockers(dataset)
    if blockers:
        raise ValueError('; '.join(blockers))
    if dataset['statistics']['synthetic'] and not config.get('test_only'):
        raise ValueError('Synthetic/linkage fixtures are restricted to test-only runs')
    seed = config['seed']
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    args = architecture(dataset, config)
    model = MultiDomainNeuMF(**args)
    optimizer = torch.optim.Adam(model.parameters(), lr=config['learning_rate'])
    validation = {d: torch.tensor(rows) for d, rows in examples_by_domain(dataset, 'validation', config['negative_samples'], seed + 1).items()}
    best, best_epochs, states, history, stale = {}, {}, {}, [], 0
    optimizer_steps, order_hash = 0, hashlib.sha256()
    seen = {d: Counter() for d in DOMAINS}
    windows = math.ceil(step_budget / interval) if step_budget is not None else config['epochs']
    for epoch in range(1, windows + 1):
        examples = examples_by_domain(dataset, 'train', config['negative_samples'], seed + epoch)
        steps = min(interval, step_budget - optimizer_steps) if step_budget is not None else None
        batches = batch_indices(examples, config['batch_size'], config['domain_balancing'], seed + epoch, steps)
        values = torch.tensor([row for d in DOMAINS for row in examples[d]])
        window_seen = {d: Counter() for d in DOMAINS}
        model.train()
        total, draws = 0.0, Counter()
        for indices in batches:
            batch = values[indices]
            optimizer.zero_grad(set_to_none=True)
            loss = binary_cross_entropy_with_logits(model(batch[:, 0].long(), batch[:, 1].long(), batch[:, 2].long()), batch[:, 3])
            loss.backward()
            optimizer.step()
            optimizer_steps += 1
            if step_budget is not None:
                order_hash.update(batch.numpy().tobytes())
                for user, item, domain, label in batch.tolist():
                    key = (int(user), int(item), int(label))
                    seen[DOMAINS[int(domain)]][key] += 1
                    window_seen[DOMAINS[int(domain)]][key] += 1
            total += loss.item() * len(batch)
            draws.update(int(d) for d in batch[:, 2])
        model.eval()
        losses = {}
        with torch.no_grad():
            for domain, values in validation.items():
                losses[domain] = sum(binary_cross_entropy_with_logits(
                    model(b[:, 0].long(), b[:, 1].long(), b[:, 2].long()), b[:, 3], reduction='sum').item()
                    for b in values.split(config['batch_size'])) / len(values)
        if not all(math.isfinite(v) for v in [total, *losses.values()]):
            raise ValueError('Non-finite training/validation loss')
        choices = losses if config['model_variant'] == 'independent' else {'shared': sum(losses.values()) / 3}
        improved = False
        for key, loss in choices.items():
            if loss < best.get(key, float('inf')):
                best[key], best_epochs[key] = loss, epoch
                selected = model.models[DOMAINS.index(key)] if key != 'shared' else model
                states[key] = copy.deepcopy(selected.state_dict())
                improved = True
        history.append({'epoch': epoch, 'train_loss': total / sum(draws.values()), 'validation_loss': losses,
                        'domain_draws': {d: draws[i] for i, d in enumerate(DOMAINS)},
                        'available_examples': {d: len(examples[d]) for d in DOMAINS}})
        if step_budget is not None:
            history[-1].update(optimizer_steps=optimizer_steps,
                               window_optimizer_steps=len(batches),
                               exposure=exposure_summary(window_seen, history[-1]['available_examples']))
        if epoch_observer is not None:
            epoch_observer(model, history[-1])
        if criterion == 'macro_validation_ndcg':
            ranking_domains, ranking_macro = evaluate_domains(model, validation_view(dataset), config['k'])
            ranking_history.append({'epoch': epoch, 'domains': ranking_domains, 'macro': ranking_macro,
                                    'validation_bce': dict(losses)})
            ranking_best = select_ranking_checkpoint(model, ranking_domains, epoch, ranking_best)
            print(f"epoch {epoch}: validation macro nDCG={ranking_macro['ndcg']:.8f}", flush=True)
        stale = 0 if improved else stale + 1
        if step_budget is None and stale >= config['patience']:
            break
    if step_budget is not None:
        assert optimizer_steps == step_budget
    for key, state in states.items():
        (model.models[DOMAINS.index(key)] if key != 'shared' else model).load_state_dict(state)
    domains, macro = evaluate_domains(model, dataset, config['k'])
    result = {
        'generated_at': datetime.now(timezone.utc).isoformat(), 'model': config['model_variant'], 'seed': seed,
        'purpose': 'synthetic_integration_test' if config.get('test_only') else 'research',
        'interpretation': 'shared-user comparison' if dataset['statistics']['users_in_two_or_more_domains'] else 'multi-domain parameter sharing; no shared users',
        'domains': domains, 'macro': macro, 'statistics': dataset['statistics'], 'coverage': dataset['coverage'],
        'parameter_count': sum(p.numel() for p in model.parameters()),
        'training': {'best_epochs': best_epochs, 'epochs_completed': len(history), 'domain_balancing': config['domain_balancing']},
        'protocol': {'split_scope': dataset['split_scope'], 'negative_mask': 'train only; train+validation for validation',
                     'ranking': 'full train catalog in target domain, excluding train/validation positives',
                     'selection': 'validation BCE per independent model; macro-domain validation BCE for shared models'},
        'versions': {'torch': str(torch.__version__), 'numpy': np.__version__, 'device': 'cpu', 'threads': 1},
        'sources': sources or {},
    }
    directory = ROOT / config['output'] / datetime.now(timezone.utc).strftime('multidomain-%Y%m%dT%H%M%S%fZ')
    if step_budget is not None:
        result['training'].update(optimizer_steps=optimizer_steps,
            validation_interval_steps=interval, epoch_definition='Common validation windows, not dataset passes',
            exposure=exposure_summary(seen, history[-1]['available_examples']), sampling_order_sha256=order_hash.hexdigest(),
            termination='Fixed optimizer-step budget; BCE early termination disabled')
    directory.mkdir(parents=True, exist_ok=False)
    torch.save({'architecture': args, 'state_dict': model.state_dict(),
                'user_mapping': dataset['user_mapping'], 'item_mapping': dataset['item_mapping'],
                'config': config, 'sources': sources or {}}, directory / 'best.pt')
    if ranking_best is not None:
        bce_validation, bce_validation_macro = evaluate_domains(model, validation_view(dataset), config['k'])
        same_state = all(torch.equal(value, ranking_best['state'][key]) for key, value in model.state_dict().items())
        model.load_state_dict(ranking_best['state'])
        selected_domains, selected_macro = evaluate_domains(model, validation_view(dataset), config['k'])
        assert selected_macro['ndcg'] == ranking_best['score']
        ranked_domains, ranked_macro = (domains, macro) if same_state else evaluate_domains(model, dataset, config['k'])
        result['checkpoint_comparison'] = {
            'bce': {'epochs': best_epochs, 'domains': domains, 'macro': macro,
                    'validation_bce': {d: history[best_epochs.get(d, best_epochs.get('shared')) - 1]['validation_loss'][d] for d in DOMAINS},
                    'validation': bce_validation, 'validation_macro': bce_validation_macro},
            'ranking': {'epoch': ranking_best['epoch'], 'domains': ranked_domains, 'macro': ranked_macro,
                        'validation_bce': history[ranking_best['epoch'] - 1]['validation_loss'],
                        'validation': selected_domains, 'validation_macro': selected_macro},
            'same_state': same_state, 'validation_history': ranking_history,
            'termination': 'Fixed optimizer-step budget' if step_budget is not None else 'Unchanged BCE early stopping; both selectors see the same epochs',
            'tie_break': 'Strict improvement at full stored float precision; earliest epoch wins ties'}
        result['domains'], result['macro'] = ranked_domains, ranked_macro
        result['protocol']['selection'] = 'Unweighted macro validation nDCG; earliest exact tie'
        result['training']['ranking_selected_epoch'] = ranking_best['epoch']
        torch.save({'architecture': args, 'state_dict': ranking_best['state'],
                    'user_mapping': dataset['user_mapping'], 'item_mapping': dataset['item_mapping'],
                    'config': config, 'sources': sources or {}, 'selected_epoch': ranking_best['epoch']}, directory / 'ranking_best.pt')
    for name, value in (('config', config), ('metrics', result), ('history', history)):
        (directory / f'{name}.json').write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    return directory, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'research/multidomain_config.json')
    parser.add_argument('--train', action='store_true', help='Run one configured real experiment after readiness checks')
    parser.add_argument('--audit-output', type=Path, help='Write a new audit file; refuses to overwrite')
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    rows, sources = load_inputs(config['inputs'], config['positive_threshold'])
    linkage = json.loads((ROOT / config['linkage']).read_text()) if config.get('linkage') else None
    rows = link_users(rows, linkage)
    dataset = prepare_multidomain(rows, config['train_ratio'], config['validation_ratio'], config['split_scope'],
                                 config.get('user_min', 1), config.get('item_min', 1))
    audit = {'generated_at': datetime.now(timezone.utc).isoformat(), 'sources': sources,
             **dataset['statistics'], 'coverage': dataset['coverage'], 'training_blockers': training_blockers(dataset)}
    if args.audit_output:
        with args.audit_output.open('x') as stream:
            json.dump(audit, stream, indent=2, allow_nan=False)
            stream.write('\n')
    print(json.dumps(audit, indent=2))
    if args.train:
        directory, result = run(dataset, config, sources)
        print(json.dumps({'run': str(directory), 'result': result}, indent=2))


if __name__ == '__main__':
    main()
