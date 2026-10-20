"""Check frozen Tail rankings without training or replacing audit artifacts."""
import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone

import numpy as np
import torch

from amazon_data import file_digest, write_json
from architecture_replication import load_control
from coverage_robustness import PROTOCOL, write_csv
from final_study import OUTPUT, ROOT, ranking_metrics
from multidomain_data import DOMAINS
from multidomain_model import MultiDomainNeuMF


def target_rank(scores, target):
    if not np.isfinite(scores[target]):
        raise ValueError('Target is missing or has a nonfinite score')
    return 1 + int(np.count_nonzero(scores > scores[target])) + int(
        np.count_nonzero(scores[:target] == scores[target]))


def hand_metrics(rank):
    return dict(precision=0.1 if rank <= 10 else 0., recall=float(rank <= 10),
                ndcg=1 / math.log2(rank + 1) if rank <= 10 else 0.)


def main():
    names = ('tail_verification_protocol.json', 'tail_verification_summary.csv',
             'tail_verification_cases.csv', 'tail_metric_hand_checks.csv',
             'tail_verification_result.json')
    if any((OUTPUT / name).exists() for name in names):
        raise FileExistsError('Tail verification exists; inspect it instead of overwriting')
    protocol = json.loads(PROTOCOL.read_text())
    for path, checksum in {**protocol['protected_sha256'], **protocol['checkpoint_sha256']}.items():
        if file_digest(ROOT / path) != checksum:
            raise ValueError(f'Protected file changed: {path}')
    _, _, _, dataset, _, queries, _ = load_control()
    cache = ROOT / json.loads((OUTPUT / 'coverage_robustness_audit.json').read_text())['cache_directory']
    counts = {d: Counter(i for _, i in dataset['pairs']['train'][d]) for d in DOMAINS}
    tails = {d: [q for q in queries['test'][d] if 1 <= counts[d][q['targets'][0]] <= 4] for d in DOMAINS}
    samples = {}
    for d in DOMAINS:
        keys = [(q['user'], q['targets'][0]) for q in tails[d]]
        if len(keys) != len(set(keys)):
            raise ValueError('Tail sample key is not unique')
        samples[d] = sorted(keys, key=lambda key: hashlib.sha256(f'{d}:{key[0]}:{key[1]}'.encode()).hexdigest())[:10]
    write_json(OUTPUT / names[0], dict(generated_at=datetime.now(timezone.utc).isoformat(),
        audit_protocol_sha256=file_digest(PROTOCOL), sample_order='SHA256(domain:user_index:item_index)',
        samples=samples, all_tail_queries_checked=True, training=False,
        source_sha256=file_digest(ROOT / 'research/coverage_tail_verification.py')))
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    summaries, cases, checks = [], [], []
    for seed in (42, 43, 44):
        run = json.loads((OUTPUT / f'architecture_control_seed{seed}.json').read_text())
        for name in 'ABC':
            saved = torch.load(ROOT / run['models'][name]['checkpoint'], weights_only=True)
            if saved['user_mapping'] != dataset['user_mapping'] or saved['item_mapping'] != dataset['item_mapping']:
                raise ValueError('Frozen model mapping mismatch')
            model = MultiDomainNeuMF(**saved['architecture'])
            model.load_state_dict(saved['state_dict'])
            model.eval().requires_grad_(False)
            cached = [json.loads(line) for line in (cache / f'query_metrics_{seed}_{name}.jsonl').read_text().splitlines()]
            lookup = {(r['domain'], r['user'], r['item']): r for r in cached}
            for index, d in enumerate(DOMAINS):
                catalog = torch.arange(len(dataset['item_mapping'][d]))
                mapped = set(dataset['item_mapping'][d].values())
                selected = set(map(tuple, samples[d]))
                included = finite = hits = 0
                targets = set()
                for q in tails[d]:
                    target = q['targets'][0]
                    if target not in mapped or target in q['excluded']:
                        raise ValueError('Tail target missing from mapping/candidates; stop analysis')
                    included += 1
                    targets.add(target)
                    with torch.inference_mode():
                        scores = model(torch.full_like(catalog, q['user']), catalog, torch.full_like(catalog, index)).numpy().copy()
                    if not np.isfinite(scores).all():
                        raise ValueError('Nonfinite model scores')
                    finite += 1
                    scores[q['excluded']] = -np.inf
                    rank = target_rank(scores, target)
                    top = [int(i) for i in np.lexsort((np.arange(len(scores)), -scores))[:10] if np.isfinite(scores[i])]
                    old = lookup[(d, q['user'], target)]
                    direct = hand_metrics(rank)
                    if top != old['top'] or direct != old['metrics'] or direct != ranking_metrics(top, [target]):
                        raise ValueError('Candidate/rank/metric mismatch; stop analysis')
                    hits += rank <= 10
                    if (q['user'], target) in selected:
                        row = dict(seed=seed, model=name, domain=d, user_index=q['user'], target_item_index=target,
                                   train_positive_support=counts[d][target], candidate_count=int(np.isfinite(scores).sum()),
                                   target_score=float(scores[target]), target_rank=rank, top10=rank <= 10)
                        cases.append(row)
                        checks.append({**row, **direct})
                summaries.append(dict(seed=seed, model=name, domain=d, evaluation_positives=len(tails[d]),
                    evaluation_users=len({q['user'] for q in tails[d]}), unique_target_items=len(targets),
                    mapped_target_events=included, candidate_target_events=included, finite_target_events=finite,
                    top10_target_events=hits, mapped_unique_targets=len(targets), candidate_unique_targets=len(targets),
                    finite_unique_targets=len(targets)))
            # Positive controls ensure the independent hand calculation also recognizes hits.
            for r in [r for r in cached if r['item'] in r['top']][:3]:
                rank = r['top'].index(r['item']) + 1
                if hand_metrics(rank) != r['metrics']:
                    raise ValueError('Positive metric control failed')
            print(json.dumps(dict(seed=seed, model=name, tail_targets_verified=True)), flush=True)
    write_csv(names[1], summaries)
    write_csv(names[2], cases)
    write_csv(names[3], checks)
    write_json(OUTPUT / names[4], dict(generated_at=datetime.now(timezone.utc).isoformat(),
        protocol_sha256=file_digest(OUTPUT / names[0]), checked_fits=9, sampled_cases=len(cases),
        top10_target_events=sum(r['top10_target_events'] for r in summaries),
        cache_rankings_match=True, hand_metrics_match=True, positive_controls_match=True,
        model_updates=0, outputs_sha256={n: file_digest(OUTPUT / n) for n in names[1:4]}))


if __name__ == '__main__':
    main()
