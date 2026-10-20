"""Finish eligibility and compute diagnostics from completed audit caches only."""
import csv
import json
from collections import Counter
from datetime import datetime, timezone

from amazon_data import file_digest, write_json
from coverage_robustness import PROTOCOL, train_eligible, write_csv
from final_study import OUTPUT, ROOT
from multidomain_data import DOMAINS


def read_csv(name):
    with (OUTPUT / name).open() as stream:
        return list(csv.DictReader(stream))


def main():
    names = ('coverage_eligibility_diagnostic.csv', 'coverage_exposure_7016.csv',
             'coverage_compute_7016.csv', 'coverage_completion.json')
    if any((OUTPUT / name).exists() for name in names):
        raise FileExistsError('Completion artifacts already exist')
    protocol = json.loads(PROTOCOL.read_text())
    audit = json.loads((OUTPUT / 'coverage_robustness_audit.json').read_text())
    directory = ROOT / audit['cache_directory']
    cutoff = round(datetime.fromisoformat(protocol['cutoffs']['train_end']).timestamp() * 1000)
    raw = {d: json.loads((directory / f'{d}_raw_scan.json').read_text())['pool_rows'] for d in DOMAINS}
    eligible = train_eligible(raw, cutoff)
    if len(eligible) != 7016:
        raise ValueError('Cached eligibility changed')
    manifest = json.loads((ROOT / 'research/results/amazon_cohort_v2_manifest.json').read_text())
    users = {u.removeprefix('amazon:user:') for u in manifest['selected_users']}
    counts = {d: Counter(u for u, _, rating, time in raw[d] if rating >= 4 and time <= cutoff) for d in DOMAINS}
    failures = Counter()
    for u in users:
        missing = [d for d in DOMAINS if counts[d][u] < 5]
        failures['eligible' if not missing else missing[0] + '_only' if len(missing) == 1 else 'multiple_domains'] += 1
    assert sum(failures.values()) == 2500 and failures['eligible'] == 1257
    write_csv(names[0], [dict(category=k, users=failures[k], percent_of_v2=100 * failures[k] / 2500)
                         for k in ('eligible', 'food_only', 'fitness_only', 'media_only', 'multiple_domains')])
    scaling = read_csv('cohort_scaling.csv')
    cohorts = {size: {r['domain']: r for r in scaling if
               (r['cohort_kind'] == 'historical_v2' if size == 2500 else r['cohort_size'] == str(size))}
               for size in (2500, 7016)}
    totals = {size: sum(int(r['train_positive_interactions']) for r in domains.values()) for size, domains in cohorts.items()}
    factor = totals[7016] / totals[2500]
    equal_steps = round(3200 * factor / 320) * 320
    reference = json.loads((OUTPUT / 'architecture_control_seed42.json').read_text())
    draws = reference['models']['A']['domain_draws']
    exposure = []
    for size, steps in ((2500, 3200), (7016, 3200), (7016, equal_steps)):
        for d in (*DOMAINS, 'total'):
            positive = totals[size] if d == 'total' else int(cohorts[size][d]['train_positive_interactions'])
            consumed = 512 * steps if d == 'total' else draws[d] * steps // 3200
            exposure.append(dict(users=size, optimizer_steps=steps, domain=d, train_positives=positive,
                available_examples_per_sampling_pass=positive * 5, sampled_draws=consumed,
                draw_to_available_ratio=consumed / (positive * 5),
                interpretation='draw exposure, NOT fraction of distinct examples visited'))
    write_csv(names[1], exposure)
    pool_entries = {size: max(int(r['train_users']) * int(r['train_items']) for r in rows.values()) for size, rows in cohorts.items()}
    pool_ratio = pool_entries[7016] / pool_entries[2500]
    previous = read_csv('coverage_compute_estimates.csv')
    estimates = []
    for row in previous:
        observed = float(row['observed_minutes'])
        for steps in (3200, equal_steps):
            # Illustrative sensitivity, not a measured timing decomposition or confidence bound.
            estimates.append(dict(model=row['model'], users=7016, steps=steps,
                observed_v2_minutes=observed, update_only_scaled_minutes=observed * steps / 3200,
                illustrative_minutes_overhead25pct=observed * steps / 3200 * (.75 + .25 * pool_ratio),
                illustrative_minutes_overhead50pct=observed * steps / 3200 * (.5 + .5 * pool_ratio),
                overhead_size_proxy=pool_ratio,
                caveat='Unprofiled: assumes 25% or 50% baseline overhead scales with largest negative pool; not a forecast or bound. RAM may prevent execution.'))
    write_csv(names[2], estimates)
    write_json(OUTPUT / names[3], dict(generated_at=datetime.now(timezone.utc).isoformat(),
        audit_protocol_sha256=file_digest(PROTOCOL), source_sha256=file_digest(ROOT / 'research/coverage_completion.py'),
        raw_cache_sha256={d: file_digest(directory / f'{d}_raw_scan.json') for d in DOMAINS},
        eligible_users=len(eligible), historical_eligibility_exclusive=dict(failures),
        train_positives=totals, equal_exposure_step_ratio=factor, exact_equal_exposure_steps=3200 * factor,
        approximate_equal_exposure_steps=equal_steps,
        exposure_caveat='Balanced domain allocation differs from natural dataset proportions; aggregate equal exposure cannot exactly preserve each domain exposure. Negatives are resampled, draws are not unique examples.',
        largest_negative_pool_entries=pool_entries, pool_entry_ratio=pool_ratio,
        approximate_pool_bytes_36bytes_per_entry=pool_entries[7016] * 36,
        memory_caveat='Approximate Python list-plus-int footprint before known-item exclusions; not measured RSS. About 16 GiB for the pool alone on a 16 GiB machine is unsafe.',
        runtime_caveat='Update count does not scale with users under fixed steps. Components were not profiled; illustrative overhead scenarios are not bounds. Supersedes earlier 5000-user planning table, which remains preserved.',
        model_updates=0, raw_rescans=0, outputs_sha256={n: file_digest(OUTPUT / n) for n in names[:3]}))
    print(json.dumps(dict(eligibility=dict(failures), train_positives=totals, equal_steps=equal_steps, pool_ratio=pool_ratio)))


if __name__ == '__main__':
    main()
