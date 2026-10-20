"""Train-only coverage diagnostics and frozen-checkpoint subgroup inference."""
import csv
import hashlib
import json
import math
import subprocess
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import groupby
from pathlib import Path

import numpy as np
import torch

from amazon_data import CATEGORIES, file_digest, iso, records, write_json
from architecture_replication import load_control
from coverage_cohort import eligible_users, select_hash_users
from final_study import METRICS, OUTPUT, ROOT, ranking_metrics
from multidomain_data import DOMAINS
from multidomain_model import MultiDomainNeuMF

PROTOCOL = OUTPUT / 'coverage_robustness_protocol.json'
MIN_POSITIVES, MIN_USERS = 50, 30
ITEM_BUCKETS = ('1', '2-4', '5-9', '10-19', '20-49', '50+')
SUPPORT_BANDS = ('tail_1-4', 'mid_5-19', 'head_20+')


def bucket(n):
    if n < 1:
        raise ValueError('Warm support must be positive')
    return next(label for cap, label in zip((1, 4, 9, 19, 49, math.inf), ITEM_BUCKETS) if n <= cap)


def band(n):
    if n < 1:
        raise ValueError('Warm support must be positive')
    return SUPPORT_BANDS[0 if n <= 4 else 1 if n <= 19 else 2]


def quantile(values, q):
    values = sorted(values)
    return values[max(0, math.ceil(q * len(values)) - 1)]


def support(rows, cutoff):
    all_counts, positives, users = Counter(), Counter(), defaultdict(set)
    for user, item, rating, timestamp in rows:
        if timestamp <= cutoff:
            all_counts[item] += 1
            if rating >= 4:
                positives[item] += 1
            users[item].add(user)
    return all_counts, positives, users


def train_eligible(domains, cutoff, minimum=5):
    counts = {d: Counter(u for u, _, r, t in rows if t <= cutoff and r >= 4) for d, rows in domains.items()}
    return set.intersection(*[{u for u, n in counts[d].items() if n >= minimum} for d in DOMAINS])


def prefix_sizes(n):
    return sorted({k for k in (2500, 5000, 7500, 10000, n) if 0 < k <= n})


def cohort_coverage(rows, selected, train_end, validation_end):
    train = [(u, i) for u, i, r, t in rows if u in selected and r >= 4 and t <= train_end]
    test = [(u, i) for u, i, r, t in rows if u in selected and r >= 4 and t > validation_end]
    items = Counter(i for _, i in train)
    train_users = {u for u, _ in train}
    warm = [(u, i) for u, i in test if i in items and u in train_users]
    seen = defaultdict(set)
    for u,i,r,t in rows:
        if u in selected and r>=4 and t<=validation_end:
            seen[u].add(i)
    novel=[]
    ordered=sorted((t,u,i) for u,i,r,t in rows if u in selected and r>=4 and t>validation_end)
    for (_,u), group in groupby(ordered,key=lambda x:(x[0],x[1])):
        targets={i for _,_,i in group}
        if u in train_users:
            novel.extend((u,i) for i in targets-seen[u] if i in items)
        seen[u].update(targets)
    user_counts = Counter(u for u, _ in train)
    return dict(train_positive_interactions=len(train), train_items=len(items),
        train_users=len(train_users), test_positives=len(test), warm_test_positives=len(warm),
        validation_positives=sum(u in selected and r >= 4 and train_end < t <= validation_end for u,_,r,t in rows),
        cold_test_positives=len(test)-len(warm),
        warm_percent=100 * len(warm) / len(test) if test else 0., evaluation_users=len({u for u, _ in novel}),
        evaluated_novel_positives=len(novel), excluded_repeat_positives=len(warm)-len(novel),
        median_train_positives_per_user=quantile([user_counts[u] for u in selected],.5),
        median_item_support=quantile(list(items.values()), .5) if items else 0,
        fraction_items_support1=sum(n==1 for n in items.values())/len(items) if items else 0.,
        fraction_items_support_le5=sum(n<=5 for n in items.values())/len(items) if items else 0.), {u for u, _ in novel}


def history_group(n, low, high):
    return 'low' if n <= low else 'medium' if n <= high else 'high'


def opportunity(target, other, low, high):
    return target <= low and other >= high


def cold_category(first, first_positive, train_end, validation_end):
    if first_positive <= train_end:
        return 'observed_before_train_but_missing_cohort_positive'
    if first <= train_end:
        return 'old_item_without_global_train_positive'
    return 'first_observed_validation' if first <= validation_end else 'first_observed_test'


def write_csv(name, rows):
    with (OUTPUT / name).open('x', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def scan_sources(pool, v2_users, wanted, train_end, directory, manifest):
    """One raw-file pass per domain; global item counts never set subgroup thresholds."""
    raw_audit = json.loads((ROOT / 'research/results/amazon_multidomain_raw_audit.json').read_text())['domains']
    pool_rows, globals_, v2_train, introductions = {}, {}, {}, {}
    for d in DOMAINS:
        path = ROOT / 'data/raw/amazon2023' / f'{CATEGORIES[d]}.csv.gz'
        if file_digest(path) != manifest['source_sha256'][d]:
            raise ValueError(f'Raw source changed: {d}')
        counts, selected, local_train = Counter(), [], []
        first = {}
        stats = {item: dict(first=None, first_positive=None, interactions=0, positives=0, users=set()) for item in wanted[d]}
        for user, item, rating, timestamp in records(path, counts):
            first[item] = min(timestamp, first.get(item, timestamp))
            if user in pool:
                selected.append((user, item, rating, timestamp))
            if user in v2_users and timestamp <= train_end:
                local_train.append((user, item, rating, timestamp))
            if item in stats:
                s = stats[item]
                s['first'] = timestamp if s['first'] is None else min(s['first'], timestamp)
                s['interactions'] += 1
                s['users'].add(user)
                if rating >= 4:
                    s['positives'] += 1
                    s['first_positive'] = timestamp if s['first_positive'] is None else min(s['first_positive'], timestamp)
            if counts['accepted'] % 2000000 == 0:
                print(json.dumps(dict(stage='raw_scan', domain=d, accepted=counts['accepted'])), flush=True)
        expected = raw_audit[d]
        if counts['accepted'] != expected['accepted'] or counts['rejected'] != expected['rejected']:
            raise ValueError(f'Raw record accounting changed: {d}')
        for s in stats.values():
            s['unique_users'] = len(s.pop('users'))
        introductions[d] = dict(source_items=len(first), source_items_first_observed_after_train=sum(t > train_end for t in first.values()))
        pool_rows[d], globals_[d], v2_train[d] = selected, stats, local_train
        write_json(directory / f'{d}_raw_scan.json', dict(pool_rows=selected, globals=stats, v2_train=local_train, introductions=introductions[d]))
    return pool_rows, globals_, v2_train, introductions


def group_metrics(query_rows, labels):
    groups = {}
    for label in labels:
        grouped = defaultdict(list)
        for query, metrics, group in query_rows:
            if group == label:
                grouped[query['user']].append(metrics)
        n = sum(len(v) for v in grouped.values())
        enough = n >= MIN_POSITIVES and len(grouped) >= MIN_USERS
        groups[label] = dict(evaluation_positives=n, evaluation_users=len(grouped),
            status='sufficient_for_descriptive_analysis' if enough else 'too_small_no_interpretation',
            **{m: float(np.mean([np.mean([r[m] for r in values]) for values in grouped.values()]))
               if enough else None for m in METRICS})
    return groups


def with_seed_summary(rows):
    output = [{**r, **{m+'_sample_sd': None for m in METRICS}} for r in rows]
    for name in 'ABC':
        keys = sorted({(r['domain'],r['group']) for r in rows if r['model']==name})
        for domain, group in keys:
            selected = [r for r in rows if r['model']==name and r['domain']==domain and r['group']==group]
            if {r['seed'] for r in selected}!={42,43,44}:
                raise ValueError('Subgroup summary needs three distinct fitted seeds')
            for r in selected:
                if any(r[k]!=selected[0][k] for k in ('evaluation_positives','evaluation_users','status')):
                    raise ValueError('Subgroup population changed across seeds')
            summary = {**selected[0], 'seed':'mean_42_44'}
            for m in METRICS:
                values=[r[m] for r in selected]
                summary[m]=float(np.mean(values)) if None not in values else None
                summary[m+'_sample_sd']=float(np.std(values,ddof=1)) if None not in values else None
            output.append(summary)
    return output


def frozen_inference(dataset, queries, fits, item_counts, user_counts, thresholds, directory):
    outputs = {'item_support_distribution': [], 'support_band_metrics': [], 'user_history_metrics': [], 'cross_domain_opportunity_metrics': []}
    for seed, name, entry in fits:
        model = None
        if name != 'MostPopular':
            saved = torch.load(ROOT / entry['checkpoint'], weights_only=True)
            if saved['user_mapping'] != dataset['user_mapping'] or saved['item_mapping'] != dataset['item_mapping']:
                raise ValueError('Frozen checkpoint mappings changed')
            model = MultiDomainNeuMF(**saved['architecture'])
            model.load_state_dict(saved['state_dict'])
            model.eval()
            for p in model.parameters():
                p.requires_grad_(False)
        with (directory / f'query_metrics_{seed}_{name}.jsonl').open('x') as cache:
            for index, d in enumerate(DOMAINS):
                catalog = torch.arange(len(dataset['item_mapping'][d]))
                counts = item_counts[d]
                popular = np.array([counts[i] for i in catalog.tolist()], dtype=float)
                by_user, evaluated = defaultdict(list), []
                for q in queries[d]:
                    if len(q['targets']) != 1:
                        raise ValueError('This frozen audit expects single-target queries; do not silently redefine tied-event metrics')
                    if model is None:
                        scores = popular.copy()
                    else:
                        with torch.inference_mode():
                            scores = model(torch.full_like(catalog, q['user']), catalog, torch.full_like(catalog, index)).numpy().copy()
                    if not np.isfinite(scores).all():
                        raise ValueError('Nonfinite inference scores')
                    scores[q['excluded']] = -np.inf
                    top = [int(i) for i in np.lexsort((np.arange(len(scores)), -scores))[:10] if np.isfinite(scores[i])]
                    metrics = ranking_metrics(top, q['targets'])
                    by_user[str(q['user'])].append(metrics)
                    evaluated.append((q, metrics))
                    cache.write(json.dumps(dict(domain=d, user=q['user'], item=q['targets'][0], top=top, metrics=metrics)) + '\n')
                actual = {u: {m: float(np.mean([r[m] for r in values])) for m in METRICS} for u, values in by_user.items()}
                if 'per_user' in entry['domains'][d] and actual != entry['domains'][d]['per_user']:
                    raise ValueError(f'Frozen per-user prediction mismatch: {seed}/{name}/{d}')
                for m in METRICS:
                    if not math.isclose(np.mean([v[m] for v in actual.values()]), entry['domains'][d]['metrics'][m], abs_tol=1e-15):
                        raise ValueError('Frozen metric mismatch')
                low, high = thresholds['total_history']
                target_low, other_high = thresholds['opportunity'][d]
                classifications = {
                    'item_support_distribution': (ITEM_BUCKETS, lambda q: bucket(counts[q['targets'][0]])),
                    'support_band_metrics': (SUPPORT_BANDS, lambda q: band(counts[q['targets'][0]])),
                    'user_history_metrics': (('low','medium','high'), lambda q: history_group(sum(user_counts[x][q['user']] for x in DOMAINS), low, high)),
                    'cross_domain_opportunity_metrics': (('low_target_high_other','complement'), lambda q: 'low_target_high_other' if opportunity(user_counts[d][q['user']], sum(user_counts[x][q['user']] for x in DOMAINS if x != d), target_low, other_high) else 'complement')}
                for table, (labels, classify) in classifications.items():
                    for label, values in group_metrics([(q,m,classify(q)) for q,m in evaluated], labels).items():
                        outputs[table].append(dict(seed=seed, model=name, domain=d, group=label,
                            fraction_of_warm_evaluation=values['evaluation_positives']/len(queries[d]), **values))
        print(json.dumps(dict(stage='frozen_inference', seed=seed, model=name, verified_original_metrics=True)), flush=True)
    return outputs


def main():
    if PROTOCOL.exists():
        raise FileExistsError('Coverage audit already registered; do not overwrite or silently repeat subgroup evaluation')
    started = time.perf_counter()
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    registered, reference, config, dataset, _, queries, coverage = load_control()
    frozen = json.loads((OUTPUT / 'protocol.json').read_text())
    manifest = json.loads((ROOT / 'research/results/amazon_cohort_v2_manifest.json').read_text())
    train_end, validation_end = [round(datetime.fromisoformat(frozen['cutoffs'][k]).timestamp()*1000) for k in ('train_end','validation_end')]
    item_counts = {d: Counter(i for _,i in dataset['pairs']['train'][d]) for d in DOMAINS}
    user_counts = {d: Counter(u for u,_ in dataset['pairs']['train'][d]) for d in DOMAINS}
    totals = [sum(user_counts[d][u] for d in DOMAINS) for u in dataset['user_mapping'].values()]
    thresholds = dict(total_history=[quantile(totals,.33),quantile(totals,.67)], opportunity={
        d: [quantile(list(user_counts[d].values()),.33), quantile([sum(user_counts[x][u] for x in DOMAINS if x!=d) for u in user_counts[d]],.67)] for d in DOMAINS})
    source_rows = {d:[json.loads(line) for line in (ROOT/config['inputs'][d]).read_text().splitlines() if line] for d in DOMAINS}
    def raw_time(r): return round(datetime.fromisoformat(r['timestamp']).timestamp()*1000)
    v2_test={d:[r for r in rows if raw_time(r)>validation_end] for d,rows in source_rows.items()}
    files = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','README.md','backend','frontend','research'],cwd=ROOT,text=True).splitlines()
    fits = []
    for seed in (42,43,44):
        run = json.loads((OUTPUT / f'architecture_control_seed{seed}.json').read_text())
        fits.extend((seed,n,run['models'][n]) for n in 'ABC')
    fits.append(('reference','MostPopular',reference['models']['MostPopular']))
    protocol = dict(generated_at=datetime.now(timezone.utc).isoformat(), git_sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        frozen_protocol_sha256=file_digest(OUTPUT/'protocol.json'), split_sha256=registered['split_sha256'],
        candidate_query_sha256=registered['candidate_query_sha256'], cutoffs=frozen['cutoffs'],
        positive_threshold=4, warm_item_definition='Item appears in selected cohort positive TRAIN vocabulary; evaluation also requires target-domain train-warm user and unseen target.',
        intervals=dict(train='timestamp <= train_end',validation='train_end < timestamp <= validation_end',test='timestamp > validation_end',
            observed_test_bounds={d:dict(first=min(r['timestamp'] for r in rows),last=max(r['timestamp'] for r in rows)) for d,rows in v2_test.items()}),
        subgroup_definitions=dict(item_support='TRAIN positive interaction counts only', buckets=ITEM_BUCKETS, bands=SUPPORT_BANDS,
            total_history='low <= train-user Q33; medium >Q33 and <=Q67; high >Q67; nearest-rank quantiles ceil(q*n), q=.33/.67, across mapped train users',
            opportunity='target count <= target-positive-user Q33 AND other-domain total >= same population Q67; equality included; target-positive train users define both distributions',
            thresholds=thresholds, minimum_positives=MIN_POSITIVES, minimum_users=MIN_USERS,
            small_groups='No adaptive merging; retain counts, blank metrics below threshold; no interpretation',
            metric='unchanged full-catalog ranking; average eligible queries within user then users; no restricted candidate reranking'),
        scaling=dict(eligibility='>=5 positive TRAIN interactions in EACH domain; fixed original calendar cutoffs',
            prefilter='Full-history >=5/domain is only a computational superset: every train-eligible user must belong. Final eligibility uses TRAIN only.',
            order='SHA256("42:" + raw reviewer ID), then reviewer ID; deterministic nested prefixes', sizes=[2500,5000,7500,10000,'all eligible'],
            no_training=True, selection='Coverage-only audit; no candidate training cohort is exported'),
        cold_definition='Absent from V2 positive train vocabulary; separate warm-item/cold-user events. Global first means first observed rating in these source files, not product launch.',
        protected_sha256={p:file_digest(ROOT/p) for p in sorted(files) if p!='research/FINAL_STUDY.md'},
        checkpoint_sha256={e['checkpoint']:file_digest(ROOT/e['checkpoint']) for _,n,e in fits if n!='MostPopular'},
        source_sha256=manifest['source_sha256'],
        computational_prefilter_database_sha256=file_digest(ROOT/'data/processed/amazon2023/audit.sqlite'),
        scaling_evaluation='Warm-positive coverage counts warm user/item events; evaluation users additionally exclude previously observed positives exactly as the frozen protocol. Repeats reported separately.',
        training_authorized=False)
    write_json(PROTOCOL,protocol)
    directory=ROOT/'research/runs'/datetime.now(timezone.utc).strftime('coverage-audit-%Y%m%dT%H%M%S%fZ')
    directory.mkdir(parents=True,exist_ok=False)
    wanted={d:{r['itemId'].removeprefix(f'{d}:amazon:') for r in source_rows[d] if r['itemId'] not in dataset['item_mapping'][d]} for d in DOMAINS}
    pool=set(eligible_users(5));v2_users={u.removeprefix('amazon:user:') for u in manifest['selected_users']}
    raw,global_stats,raw_train,introductions=scan_sources(pool,v2_users,wanted,train_end,directory,manifest)
    eligible=train_eligible(raw,train_end); ordered=select_hash_users(eligible,len(eligible))
    eligibility_counts={d:Counter(u for u,_,r,t in raw[d] if r>=4 and t<=train_end) for d in DOMAINS}
    eligibility_report=dict(total_train_eligible=len(eligible),historical_v2_eligible=len(v2_users&eligible),
        historical_v2_ineligible=len(v2_users-eligible),
        failure_counts_overlap={d:sum(eligibility_counts[d][u]<5 for u in v2_users) for d in DOMAINS})
    eligible_items={d:{i for u,i,r,t in raw[d] if u in eligible and r>=4 and t<=train_end} for d in DOMAINS}
    scaling=[];global_coldness=[]
    cohorts=[('historical_v2',v2_users)]+[('train_eligible_prefix',set(ordered[:size])) for size in prefix_sizes(len(eligible))]
    for kind,selected in cohorts:
        size=len(selected);groups=[]; rows=[]
        for d in DOMAINS:
            row,users=cohort_coverage(raw[d],selected,train_end,validation_end)
            row.update(cohort_kind=kind,cohort_size=size,domain=d,selection_sha256=hashlib.sha256('\n'.join(sorted(selected)).encode()).hexdigest())
            rows.append(row);groups.append(users)
            train_items={i for u,i,r,t in raw[d] if u in selected and r>=4 and t<=train_end}
            test=[(u,i) for u,i,r,t in raw[d] if u in selected and r>=4 and t>validation_end]
            for cw in (True,False):
                for gw in (True,False):
                    values=[(u,i) for u,i in test if (i in train_items)==cw and (i in eligible_items[d])==gw]
                    global_coldness.append(dict(cohort_kind=kind,cohort_size=size,domain=d,cohort_warm=cw,eligible_population_warm=gw,
                        test_positives=len(values),percent_of_test=100*len(values)/len(test) if test else 0.,unique_items=len({i for _,i in values}),unique_users=len({u for u,_ in values})))
        for row in rows:row['all_three_warm_evaluation_users']=len(set.intersection(*groups))
        scaling.extend(rows)
    write_csv('cohort_scaling.csv',scaling)
    write_csv('global_vs_cohort_coldness.csv',global_coldness)
    summaries,cold_rows,item_rows,sparsity,cold_summary=[],[],[],[],[]
    for d in DOMAINS:
        mapped=dataset['item_mapping'][d];domain_users=set(dataset['domain_users'][d])
        tests=v2_test[d];warm_item=[r for r in tests if r['itemId'] in mapped]
        cold=[r for r in tests if r['itemId'] not in mapped]
        evaluable=[r for r in warm_item if dataset['user_mapping'].get(r['userId']) in domain_users]
        if len(evaluable)!=coverage['test'][d]['warm_positives']:raise ValueError('Frozen coverage changed')
        summaries.append(dict(domain=d,test_positives=len(tests),warm_item_positives=len(warm_item),cold_item_positives=len(cold),
            warm_item_percent=100*len(warm_item)/len(tests),cold_item_percent=100*len(cold)/len(tests),
            warm_item_cold_user_positives=len(warm_item)-len(evaluable),evaluable_positives=len(evaluable),
            evaluable_percent=100*len(evaluable)/len(tests),evaluation_users=coverage['test'][d]['evaluated_users'],
            test_first_timestamp=min(r['timestamp'] for r in tests),test_last_timestamp=max(r['timestamp'] for r in tests),**introductions[d]))
        all_support,positive_support,users=support(raw_train[d],train_end)
        assert {f'{d}:amazon:{i}':n for i,n in positive_support.items()}=={i:item_counts[d][index] for i,index in mapped.items()}
        for item,index in mapped.items():
            raw_item=item.removeprefix(f'{d}:amazon:')
            item_rows.append(dict(domain=d,item_id=item,train_interactions=all_support[raw_item],train_positive_interactions=positive_support[raw_item],
                unique_train_users=len(users[raw_item]),support_bucket=bucket(item_counts[d][index])))
        test_counts=Counter(r['itemId'].removeprefix(f'{d}:amazon:') for r in cold)
        first_cohort={}
        for r in source_rows[d]:
            item=r['itemId'].removeprefix(f'{d}:amazon:');t=raw_time(r)
            first_cohort[item]=min(t,first_cohort.get(item,t))
        for item,n in test_counts.items():
            s=global_stats[d][item]
            first=s['first'];fp=s['first_positive']
            category=cold_category(first,fp,train_end,validation_end)
            cold_rows.append(dict(domain=d,item_id=f'{d}:amazon:{item}',category=category,test_positives=n,
                first_global_interaction=iso(first),first_global_positive=iso(fp),global_interactions=s['interactions'],
                global_unique_users=s['unique_users'],global_positive_interactions=s['positives'],
                first_cohort_positive=iso(first_cohort[item]),eligible_population_warm=item in eligible_items[d],
                percent_of_cold_test_positives=100*n/len(cold)))
        categories={r['item_id']:r['category'] for r in cold_rows if r['domain']==d}
        for category in ('warm_item','observed_before_train_but_missing_cohort_positive','old_item_without_global_train_positive','first_observed_validation','first_observed_test'):
            values=[r for r in tests if ('warm_item' if r['itemId'] in mapped else categories[r['itemId']])==category]
            cold_summary.append(dict(domain=d,category=category,test_positives=len(values),percent_of_test=100*len(values)/len(tests),
                unique_items=len({r['itemId'] for r in values}),unique_users=len({r['userId'] for r in values})))
        values=list(item_counts[d].values());train_n=sum(values)
        sparsity.append(dict(domain=d,train_users=len(user_counts[d]),train_items=len(values),train_positive_interactions=train_n,
            interactions_per_user=train_n/len(user_counts[d]),interactions_per_item=train_n/len(values),
            median_item_support=quantile(values,.5),p75_item_support=quantile(values,.75),p90_item_support=quantile(values,.9),
            median_positives_per_user=quantile(list(user_counts[d].values()),.5),
            fraction_items_support1=sum(n==1 for n in values)/len(values),fraction_items_support_le5=sum(n<=5 for n in values)/len(values),
            fraction_items_support_ge20=sum(n>=20 for n in values)/len(values)))
    write_csv('coverage_summary.csv',summaries);write_csv('cold_item_analysis.csv',cold_rows)
    write_csv('cold_item_summary.csv',cold_summary)
    write_csv('train_item_support.csv',item_rows);write_csv('domain_sparsity.csv',sparsity)
    outputs=frozen_inference(dataset,queries['test'],fits,item_counts,user_counts,thresholds,directory)
    for name,rows in outputs.items():write_csv(name+'.csv',with_seed_summary(rows))
    write_json(OUTPUT/'coverage_robustness_audit.json',dict(generated_at=datetime.now(timezone.utc).isoformat(),
        protocol_sha256=file_digest(PROTOCOL),train_eligible_users=len(eligible),prefilter_users=len(pool),
        selected_order_sha256=hashlib.sha256('\n'.join(ordered).encode()).hexdigest(),thresholds=thresholds,eligibility=eligibility_report,
        wall_seconds=time.perf_counter()-started,cache_directory=str(directory.relative_to(ROOT)),model_updates=0,
        frozen_predictions_reproduced=True))
    print(json.dumps(dict(completed=True,eligible_users=len(eligible),wall_seconds=time.perf_counter()-started)),flush=True)


if __name__=='__main__':
    main()
