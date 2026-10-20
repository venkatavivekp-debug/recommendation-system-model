"""Controlled NeuMF entry point. Historical runners and their sampler stay frozen."""
import hashlib
import json
import random
import subprocess
import time
from bisect import bisect_right
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

import torch
from torch.nn.functional import binary_cross_entropy_with_logits

from amazon_data import file_digest, write_json
from amazon_diagnostics import digest
from data import ROOT, known_items
from final_study import evaluate
from multidomain_data import DOMAINS, batch_indices
from multidomain_experiment import architecture, select_ranking_checkpoint
from multidomain_model import MultiDomainNeuMF, SelectiveNeuMF, VARIANTS


class Protocol(NamedTuple):
    positive_threshold: int = 4
    batch_size: int = 512
    learning_rate: float = .001
    negative_samples: int = 4
    max_optimizer_steps: int = 3200
    validation_interval_steps: int = 320
    validation_steps: tuple = ()
    seeds: tuple = (42, 43, 44)
    embedding_dim: int = 16
    domain_dim: int = 4
    mlp_layers: tuple = (32, 16)
    k: int = 10
    domain_balancing: str = 'balanced'
    history_thresholds: tuple = (20, 34)
    support_boundaries: tuple = (4, 19)
    opportunity_thresholds: tuple = ((5, 24), (5, 24), (6, 18))


PROTOCOL = Protocol()


def validation_schedule(protocol):
    steps = tuple(protocol.validation_steps) or tuple(range(
        protocol.validation_interval_steps, protocol.max_optimizer_steps + 1,
        protocol.validation_interval_steps))
    if (not steps or any(type(step) is not int or step <= 0 for step in steps)
            or tuple(sorted(set(steps))) != steps or steps[-1] != protocol.max_optimizer_steps):
        raise ValueError('Validation steps must increase strictly and include the final optimizer step')
    return steps


def eligible_item(position, blocked):
    """Select from a complement without allocating that complement."""
    low, high = position, position + len(blocked)
    while low < high:
        middle = (low + high) // 2
        if middle - bisect_right(blocked, middle) < position:
            low = middle + 1
        else:
            high = middle
    return low


def sample_examples(positives, known, item_count, negatives_per_positive=4, seed=42):
    """Same uniform sampling without replacement; O(train positives), not O(users*items)."""
    if item_count < 1 or negatives_per_positive < 1:
        raise ValueError('A train vocabulary and positive negative count are required')
    rng, blocked = random.Random(seed), {}
    for user, item in positives:
        if user not in blocked:
            blocked[user] = sorted(known[user])
            if any(i < 0 or i >= item_count for i in blocked[user]):
                raise ValueError('Known positives must use train item indices')
        excluded = blocked[user]
        if item not in known[user]:
            raise ValueError('Positive interaction missing from train history')
        available = item_count - len(excluded)
        if available < negatives_per_positive:
            raise ValueError('Train catalog cannot supply the declared negatives per positive')
        yield user, item, 1.
        for position in rng.sample(range(available), negatives_per_positive):
            yield user, eligible_item(position, excluded), 0.


def provenance(model, seed, dataset, queries, sources, cohort_manifest, cutoffs, runtime=0.):
    return dict(git_sha=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        generated_at=datetime.now(timezone.utc).isoformat(), model=model, seed=seed,
        source_hashes={name: file_digest(ROOT / path) for name, path in sources.items()},
        cohort_hash=file_digest(ROOT / cohort_manifest), split_fingerprint=digest(dict(
            pairs=dataset['pairs'], users=dataset['user_mapping'], items=dataset['item_mapping'],
            domain_users=dataset['domain_users'], cutoffs=cutoffs)),
        candidate_fingerprint=digest(queries), configuration=PROTOCOL._asdict(),
        checkpoint_rule='maximum macro validation nDCG@10; earliest exact tie',
        sampler='complement-position-v1; future runs only', coverage=dataset['coverage'], runtime_seconds=runtime,
        code_hashes={name: file_digest(ROOT / 'research' / name) for name in (
            'training.py', 'data.py', 'multidomain_data.py', 'multidomain_model.py', 'model.py',
            'multidomain_experiment.py', 'multidomain_context.py', 'final_study.py', 'amazon_diagnostics.py', 'amazon_data.py')})


def run(model_name, seed, dataset, queries, sources, cohort_manifest, cutoffs, directory, *, execute=False,
        protocol=PROTOCOL, evaluate_test=True, progress=None):
    """Consume an already registered cohort/split; default is a read-only preflight.

    Prepare data with existing loaders/mappings and final_study.build_stream.
    This function does not choose users, cutoffs, or a winning protocol.
    """
    schedule = validation_schedule(protocol)
    selective = model_name in ('D', 'D_FIXED')
    if model_name not in ('A', 'B', 'C', 'D', 'D_FIXED') or seed not in protocol.seeds:
        raise ValueError('Use A/B/C/D/D_FIXED and a declared seed')
    if selective and execute and evaluate_test:
        raise ValueError('Freeze both D checkpoints before separate test evaluation; use evaluate_test=False')
    if dataset['split_scope'] != 'global' or dataset['leakage_audit']['violations']:
        raise ValueError('A registered leakage-safe global-time dataset is required')
    frozen = json.loads((ROOT / 'research/results/final_study/protocol.json').read_text())
    if cutoffs != frozen['cutoffs']:
        raise ValueError('Do not change the frozen calendar cutoffs')
    record = provenance(model_name, seed, dataset, queries, sources, cohort_manifest, cutoffs)
    record.update(configuration=protocol._asdict(), validation_steps=schedule)
    if not execute:
        return record
    directory = Path(directory).resolve()
    if not directory.is_relative_to(ROOT / 'research/runs'):
        raise ValueError('Future training outputs belong in a new research/runs directory')
    directory.mkdir(parents=True, exist_ok=False)
    write_json(directory / 'protocol.json', record)
    config = dict(protocol._asdict(), seed=seed,
                  model_variant=model_name if selective else VARIANTS['ABC'.index(model_name)])
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    model_class = SelectiveNeuMF if selective else MultiDomainNeuMF
    model = model_class(**architecture(dataset, config))
    initial_gates = model.gate_diagnostics() if selective else None
    optimizer = torch.optim.Adam(model.parameters(), lr=protocol.learning_rate)
    known = {d: known_items(dataset['pairs']['train'][d]) for d in DOMAINS}
    best, history, sampling_hash = None, [], hashlib.sha256()
    started = time.perf_counter()
    previous_step = 0
    for window, target_step in enumerate(schedule, 1):
        if progress:
            progress('training', previous_step)
        examples = {d: [(u, i, index, label) for u, i, label in sample_examples(
            dataset['pairs']['train'][d], known[d], len(dataset['item_mapping'][d]),
            protocol.negative_samples, seed + window + index)] for index, d in enumerate(DOMAINS)}
        values = torch.tensor([r for d in DOMAINS for r in examples[d]])
        model.train()
        for step, indices in enumerate(batch_indices(examples, protocol.batch_size, protocol.domain_balancing,
                                                    seed + window, target_step - previous_step), previous_step + 1):
            batch = values[indices]
            sampling_hash.update(batch.numpy().tobytes())
            optimizer.zero_grad(set_to_none=True)
            loss = binary_cross_entropy_with_logits(model(batch[:, 0].long(), batch[:, 1].long(), batch[:, 2].long()), batch[:, 3])
            if not torch.isfinite(loss):
                raise ValueError('Nonfinite training loss')
            loss.backward()
            if any(p.grad is not None and not torch.isfinite(p.grad).all() for p in model.parameters()):
                raise ValueError('Nonfinite training gradients')
            optimizer.step()
            if any(not torch.isfinite(p).all() for p in model.parameters()):
                raise ValueError('Nonfinite model parameters')
            if progress and step % 32 == 0:
                progress('training', step)
        if progress:
            progress('validation', target_step)
        domains, macro = evaluate(model, dataset, queries['validation'], protocol.k)
        best = select_ranking_checkpoint(model, domains, target_step, best)
        history.append(dict(step=target_step, macro=macro, domains={d: domains[d]['metrics'] for d in DOMAINS}))
        print(json.dumps(dict(model=model_name, step=target_step, validation=macro,
                              elapsed_seconds=time.perf_counter() - started)), flush=True)
        previous_step = target_step
    model.load_state_dict(best['state'])
    torch.save(dict(architecture=architecture(dataset, config), state_dict=best['state'],
        user_mapping=dataset['user_mapping'], item_mapping=dataset['item_mapping'], config=config), directory / 'selected.pt')
    result = dict(record, runtime_seconds=time.perf_counter() - started,
        history=history, selected_step=best['epoch'], selected_validation_ndcg=best['score'],
        parameter_count=sum(p.numel() for p in model.parameters()),
        training_examples=protocol.batch_size * protocol.max_optimizer_steps,
        checkpoint_sha256=file_digest(directory / 'selected.pt'), sampling_sha256=sampling_hash.hexdigest())
    if selective:
        result.update(trainable_parameter_count=sum(p.numel() for p in model.parameters() if p.requires_grad),
                      initial_gate_diagnostics=initial_gates, selected_gate_diagnostics=model.gate_diagnostics())
    if evaluate_test:
        result['domains'], result['macro'] = evaluate(model, dataset, queries['test'], protocol.k)
        result['runtime_seconds'] = time.perf_counter() - started
    if progress:
        progress('complete', previous_step)
    write_json(directory / 'result.json', result)
    return result
