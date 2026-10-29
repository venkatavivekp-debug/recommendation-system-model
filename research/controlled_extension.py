"""Additive BPR comparison and A/B/C replication; no changes to frozen runners."""
import argparse
import hashlib
import json
import platform
import resource
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from itertools import islice

import numpy as np
import torch
from torch import nn
from torch.nn.functional import logsigmoid

from amazon_data import file_digest, write_json
from amazon_diagnostics import digest
from data import ROOT, known_items
from final_study import evaluate
from multidomain_data import DOMAINS, batch_indices
from multidomain_experiment import select_ranking_checkpoint
import training

SPEC_PATH = ROOT / 'research/results/controlled_extension/protocol.json'
ORIGINAL = ROOT / 'research/results/final_study/expanded7016/protocol.json'
AUTHORIZED_RUNS = (('BPR', 42), ('BPR', 43), ('BPR', 44),
                   ('A', 43), ('B', 43), ('C', 43), ('A', 44), ('B', 44), ('C', 44))


class IndependentBPR(nn.Module):
    """Domain-private user/item factors; scores are untransformed dot products."""
    def __init__(self, user_count, item_counts, domain_users, embedding_dim=16, init_std=.01):
        super().__init__()
        if user_count < 1 or embedding_dim < 1 or init_std <= 0:
            raise ValueError('Positive user count, factor dimension and initialization scale required')
        if len(item_counts) != 3 or len(domain_users) != 3 or any(n < 1 for n in item_counts):
            raise ValueError('Three nonempty domain catalogs are required')
        lookup = torch.full((3, user_count), -1, dtype=torch.long)
        for domain, users in enumerate(domain_users):
            if not users or len(set(users)) != len(users) or any(u < 0 or u >= user_count for u in users):
                raise ValueError('Each domain requires unique mapped TRAIN users')
            lookup[domain, users] = torch.arange(len(users))
        self.register_buffer('user_lookup', lookup)
        self.register_buffer('item_counts', torch.tensor(item_counts))
        self.users = nn.ModuleList([nn.Embedding(len(users), embedding_dim) for users in domain_users])
        self.items = nn.ModuleList([nn.Embedding(n, embedding_dim) for n in item_counts])
        for parameter in self.parameters():
            nn.init.normal_(parameter, mean=0., std=init_std)

    def factors(self, users, items, domains):
        if users.ndim != 1 or items.shape != users.shape or domains.shape != users.shape:
            raise ValueError('Matching one-dimensional indices required')
        if ((users < 0) | (users >= self.user_lookup.shape[1]) | (domains < 0) | (domains >= 3)).any():
            raise ValueError('Unknown user or domain')
        if ((items < 0) | (items >= self.item_counts[domains])).any():
            raise ValueError('Unknown item in requested domain')
        local = self.user_lookup[domains, users]
        if (local < 0).any():
            raise ValueError('User has no TRAIN history in requested domain')
        shape = (len(users), self.users[0].embedding_dim)
        p = self.users[0].weight.new_empty(shape)
        q = self.items[0].weight.new_empty(shape)
        for domain in range(3):
            mask = domains == domain
            if mask.any():
                p[mask] = self.users[domain](local[mask])
                q[mask] = self.items[domain](items[mask])
        return p, q

    def forward(self, users, items, domains):
        p, q = self.factors(users, items, domains)
        return (p * q).sum(dim=1)

    def loss(self, users, positives, negatives, domains, regularization):
        if not np.isfinite(regularization) or regularization < 0:
            raise ValueError('Regularization must be finite and nonnegative')
        p, qi = self.factors(users, positives, domains)
        _, qj = self.factors(users, negatives, domains)
        margin = (p * (qi - qj)).sum(dim=1)
        penalty = (p.square().sum(1) + qi.square().sum(1) + qj.square().sum(1)).mean()
        return -logsigmoid(margin).mean() + .5 * regularization * penalty


def sample_groups(positives, known, item_count, negatives, seed):
    """Keep each TRAIN positive with its canonical complement-sampled negatives."""
    stream = iter(training.sample_examples(positives, known, item_count, negatives, seed))
    for user, item, label in stream:
        if label != 1.:
            raise ValueError('Expected a positive anchor from the canonical sampler')
        group = list(islice(stream, negatives))
        if len(group) != negatives or any(u != user or y != 0. for u, _, y in group):
            raise ValueError('Incomplete negative group')
        yield (user, item, *(i for _, i, _ in group))


def bpr_batch(batch):
    """Columns: user, positive, negative items, domain. Expand anchors into triples."""
    count = batch.shape[1] - 3
    return (batch[:, 0].repeat_interleave(count), batch[:, 1].repeat_interleave(count),
            batch[:, 2:-1].reshape(-1), batch[:, -1].repeat_interleave(count))


def fit_bpr(seed, dataset, validation, protocol, settings, directory, record, progress=None):
    """Validation-only fit; the function receives no TEST queries or outcomes."""
    schedule = training.validation_schedule(protocol)
    directory.mkdir(parents=True, exist_ok=False)
    write_json(directory / 'protocol.json', record)
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    args = dict(user_count=len(dataset['user_mapping']),
                item_counts=[len(dataset['item_mapping'][d]) for d in DOMAINS],
                domain_users=[dataset['domain_users'][d] for d in DOMAINS],
                embedding_dim=protocol.embedding_dim, init_std=settings['initialization_std'])
    model = IndependentBPR(**args)
    optimizer = torch.optim.Adam(model.parameters(), lr=protocol.learning_rate, weight_decay=0.)
    known = {d: known_items(dataset['pairs']['train'][d]) for d in DOMAINS}
    best, history, sampling_hash = None, [], hashlib.sha256()
    anchors = Counter()
    started, previous = time.perf_counter(), 0
    for window, target in enumerate(schedule, 1):
        examples = {d: [(*group, index) for group in sample_groups(
            dataset['pairs']['train'][d], known[d], len(dataset['item_mapping'][d]),
            protocol.negative_samples, seed + window + index)] for index, d in enumerate(DOMAINS)}
        values = torch.tensor([row for d in DOMAINS for row in examples[d]], dtype=torch.long)
        model.train()
        for step, indices in enumerate(batch_indices(examples, protocol.batch_size,
                protocol.domain_balancing, seed + window, target - previous), previous + 1):
            batch = values[indices]
            triples = bpr_batch(batch)
            sampling_hash.update(torch.stack(triples, dim=1).numpy().astype('<i8').tobytes())
            anchors.update(batch[:, -1].tolist())
            optimizer.zero_grad(set_to_none=True)
            loss = model.loss(*triples, settings['regularization'])
            if not torch.isfinite(loss):
                raise ValueError('Nonfinite BPR loss')
            loss.backward()
            if any(p.grad is not None and not torch.isfinite(p.grad).all() for p in model.parameters()):
                raise ValueError('Nonfinite BPR gradient')
            optimizer.step()
            if any(not torch.isfinite(p).all() for p in model.parameters()):
                raise ValueError('Nonfinite BPR parameter')
            if progress and step % 32 == 0:
                progress('training', step)
        if progress:
            progress('validation', target)
        domains, macro = evaluate(model, dataset, validation, protocol.k)
        best = select_ranking_checkpoint(model, domains, target, best)
        history.append(dict(step=target, macro=macro, domains={d: domains[d]['metrics'] for d in DOMAINS}))
        print(json.dumps(dict(model='BPR', seed=seed, step=target, validation=macro)), flush=True)
        previous = target
    torch.save(dict(model='BPR', architecture=args, state_dict=best['state'],
        config=record['configuration'], user_mapping=dataset['user_mapping'],
        item_mapping=dataset['item_mapping']), directory / 'selected.pt')
    result = dict(record, runtime_seconds=time.perf_counter() - started, history=history,
        selected_step=best['epoch'], selected_validation_ndcg=best['score'],
        parameter_count=sum(p.numel() for p in model.parameters()),
        positive_anchor_draws=sum(anchors.values()),
        triple_draws=sum(anchors.values()) * protocol.negative_samples,
        domain_anchor_draws={d: anchors[i] for i, d in enumerate(DOMAINS)},
        sampling_sha256=sampling_hash.hexdigest(), checkpoint_sha256=file_digest(directory / 'selected.pt'))
    write_json(directory / 'result.json', result)
    return result


def load_spec(model, seed):
    if (model, seed) not in AUTHORIZED_RUNS:
        raise ValueError('Only the nine predeclared BPR/A/B/C fits are allowed; no A/B/C seed 42 rerun')
    spec = json.loads(SPEC_PATH.read_text())
    if tuple(map(tuple, spec['runs'])) != AUTHORIZED_RUNS:
        raise ValueError('Authorized run list changed')
    if file_digest(ORIGINAL) != spec['original_protocol_sha256']:
        raise ValueError('Original expanded protocol changed')
    original = json.loads(ORIGINAL.read_text())
    protocol = training.Protocol(**original['configuration'])._replace(seeds=(42, 43, 44))
    if model == 'BPR':
        protocol = protocol._replace(batch_size=spec['bpr']['positive_anchors_per_batch'])
    return spec, original, protocol


def load_benchmark(spec, original):
    prepared = ROOT / spec['prepared_path']
    cohort = ROOT / spec['cohort_manifest']
    if file_digest(prepared) != spec['prepared_sha256'] or file_digest(cohort) != original['cohort_hash']:
        raise ValueError('Frozen prepared data or cohort manifest changed')
    payload = torch.load(prepared, map_location='cpu', weights_only=True)
    dataset, queries, cutoffs = (payload[k] for k in ('dataset', 'queries', 'cutoffs'))
    if cutoffs != original['cutoffs'] or dataset['split_scope'] != 'global' or dataset['leakage_audit']['violations']:
        raise ValueError('Expected original leakage-safe global-time cutoffs')
    fingerprint = digest(dict(pairs=dataset['pairs'], users=dataset['user_mapping'],
        items=dataset['item_mapping'], domain_users=dataset['domain_users'], cutoffs=cutoffs))
    if fingerprint != original['split_fingerprint'] or digest(queries) != original['candidate_fingerprint']:
        raise ValueError('Original split/mappings or evaluation candidates changed')
    if len(dataset['user_mapping']) != 7016:
        raise ValueError('Expected 7016 TRAIN-eligible users')
    for d in DOMAINS:
        expected = original['coverage'][d]
        if (len(dataset['pairs']['train'][d]) != expected['train_positive_interactions']
                or len(dataset['item_mapping'][d]) != expected['train_items']
                or len(dataset['domain_users'][d]) != 7016):
            raise ValueError(f'Original TRAIN counts changed: {d}')
    sources = spec['sources']
    if {d: file_digest(ROOT / sources[d]) for d in DOMAINS} != original['source_hashes']:
        raise ValueError('Original source cache changed')
    return dataset, queries, cutoffs, sources


def execute_run(model, seed, *, execute=False):
    spec, original, protocol = load_spec(model, seed)
    dataset, queries, cutoffs, sources = load_benchmark(spec, original)
    directory = ROOT / 'research/runs/controlled_extension' / f'{model}_seed{seed}'
    output = SPEC_PATH.parent / f'{model}_training_seed{seed}.json'
    if execute and (directory.exists() or output.exists()):
        raise FileExistsError('An attempted/completed fit already exists; do not rerun or overwrite')
    record = training.provenance(model, seed, dataset, queries, sources, spec['cohort_manifest'], cutoffs)
    record.update(configuration=protocol._asdict(), validation_steps=training.validation_schedule(protocol),
        extension_protocol_sha256=file_digest(SPEC_PATH), prepared_sha256=spec['prepared_sha256'],
        original_protocol_sha256=spec['original_protocol_sha256'],
        checkpoint_path=str((directory / 'selected.pt').relative_to(ROOT)),
        test_evaluated=False, environment=dict(python=platform.python_version(), torch=str(torch.__version__),
            numpy=np.__version__, platform=platform.platform(), device='cpu', threads=1),
        working_tree_status=subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True),
        extension_code_sha256=file_digest(ROOT / 'research/controlled_extension.py'))
    if model == 'BPR':
        record.update(bpr=spec['bpr'], sampler='complement-position-v1 grouped anchors; int64 triples')
    if not execute:
        return dict(model=model, seed=seed, preflight='passed; no model constructed or evaluated',
                    configuration=record['configuration'], bpr=record.get('bpr'),
                    cohort_hash=record['cohort_hash'], split_fingerprint=record['split_fingerprint'],
                    candidate_fingerprint=record['candidate_fingerprint'],
                    planned_checkpoint=record['checkpoint_path'])
    cpu_start, started = time.process_time(), time.perf_counter()

    def memory_guard(phase, step):
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        gib = peak / (1024 ** 3 if sys.platform == 'darwin' else 1024 ** 2)
        if gib > 10:
            raise MemoryError('Memory safety limit exceeded; stop without retrying the fit')
        if gib > 6 and phase == 'validation':
            print(f'RSS warning: {gib:.2f} GiB at {step}', file=sys.stderr, flush=True)

    memory_guard('startup', 0)
    if model == 'BPR':
        result = fit_bpr(seed, dataset, queries['validation'], protocol, spec['bpr'], directory, record, memory_guard)
    else:
        result = training.run(model, seed, dataset, queries, sources, spec['cohort_manifest'], cutoffs,
            directory, execute=True, protocol=protocol, evaluate_test=False, progress=memory_guard)
    result = dict(record, **{k: v for k, v in result.items() if k not in record})
    result.update(runtime_seconds=time.perf_counter() - started, process_cpu_seconds=time.process_time() - cpu_start,
        peak_rss_mib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if sys.platform == 'darwin' else 1024),
        completed_at=datetime.now(timezone.utc).isoformat(), optimizer_steps=protocol.max_optimizer_steps)
    write_json(output, result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, choices=('A', 'B', 'C', 'BPR'))
    parser.add_argument('--seed', required=True, type=int, choices=(42, 43, 44))
    parser.add_argument('--execute', action='store_true', help='Fit only after explicit second-gate approval; never score TEST')
    args = parser.parse_args()
    result = execute_run(args.model, args.seed, execute=args.execute)
    print(json.dumps(result if not args.execute else dict(model=args.model, seed=args.seed,
        selected_step=result['selected_step'], test_evaluated=False), indent=2))


if __name__ == '__main__':
    main()
