"""Acquire and audit the official Amazon 2023 ratings-only category files."""
import argparse
import csv
import gzip
import hashlib
import json
import math
import sqlite3
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from data import ROOT

CATEGORIES = {'food': 'Grocery_and_Gourmet_Food', 'fitness': 'Sports_and_Outdoors', 'media': 'Movies_and_TV'}
BASE_URL = 'https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/benchmark/0core/rating_only'
FIELDS = ['user_id', 'parent_asin', 'rating', 'timestamp']
THRESHOLDS = (1, 2, 3, 5, 10)


def download(domain, directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (CATEGORIES[domain] + '.csv.gz')
    if path.exists():
        with gzip.open(path, 'rt') as stream:
            if next(csv.reader(stream)) != FIELDS:
                raise ValueError(f'Unexpected CSV header in {path}')
        print(f'Keeping existing file: {path}', flush=True)
        return path
    url = f'{BASE_URL}/{path.name}'
    partial = path.with_suffix(path.suffix + '.part')
    for attempt in range(3):
        try:
            print(f'Downloading {url} (attempt {attempt + 1})', flush=True)
            with urllib.request.urlopen(url, timeout=60) as response, partial.open('wb') as target:
                expected = response.headers.get('Content-Length')
                size = 0
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
                    size += len(chunk)
            if expected and size != int(expected):
                raise OSError(f'Incomplete response: {size}/{expected} bytes')
            with gzip.open(partial, 'rt') as stream:
                if next(csv.reader(stream)) != FIELDS:
                    raise ValueError(f'Unexpected CSV header from {url}')
            partial.rename(path)
            print(f'Acquired {path.name}: {size} bytes', flush=True)
            return path
        except (OSError, urllib.error.URLError) as error:
            if attempt == 2:
                raise RuntimeError(f'Download failed for {url}: {error}') from error
            time.sleep(2 ** attempt)


def parse_row(row):
    for field in ('user_id', 'parent_asin'):
        if not isinstance(row.get(field), str) or not row[field].strip():
            raise ValueError('missing_' + field)
        if row[field] != row[field].strip():
            raise ValueError('invalid_' + field)
    try:
        rating = float(row['rating'])
        if not math.isfinite(rating) or not 1 <= rating <= 5 or not rating.is_integer():
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise ValueError('invalid_rating') from None
    try:
        timestamp = int(row['timestamp'])
        # The official pure-ID release uses Unix milliseconds, not seconds.
        if not 0 < timestamp < 1704067200000:
            raise ValueError()
        moment = datetime.fromtimestamp(timestamp / 1000, timezone.utc)
        if moment.year < 1995:
            raise ValueError()
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        raise ValueError('invalid_timestamp') from None
    return row['user_id'], row['parent_asin'], int(rating), timestamp


def records(path, counts):
    with gzip.open(path, 'rt', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != FIELDS:
            raise ValueError(f'Unexpected CSV fields in {path}: {reader.fieldnames}')
        for row in reader:
            counts['read'] += 1
            try:
                if None in row:
                    raise ValueError('wrong_column_count')
                value = parse_row(row)
            except ValueError as error:
                counts['rejected'] += 1
                counts[str(error)] += 1
                continue
            counts['accepted'] += 1
            yield value


def iso(milliseconds):
    return datetime.fromtimestamp(milliseconds / 1000, timezone.utc).isoformat(timespec='milliseconds')


def summary(histogram):
    size = sum(histogram.values())
    if not size:
        return {'count': 0}
    ordered = sorted(histogram.items())
    def at(index):
        total = 0
        for value, count in ordered:
            total += count
            if total > index:
                return value
    return {'count': size, 'min': ordered[0][0], 'max': ordered[-1][0],
            'mean': sum(value * n for value, n in ordered) / size,
            'median': (at((size - 1) // 2) + at(size // 2)) / 2,
            **{f'p{p}': at(math.ceil(size * p / 100) - 1) for p in (25, 75, 90, 95)}}


def flush_counts(db, table, domain, counts):
    db.executemany(f'INSERT INTO {table} VALUES (?, ?, ?, ?) '
                   'ON CONFLICT(domain, id) DO UPDATE SET n=n+excluded.n, p=p+excluded.p',
                   ((domain, key, n, p) for key, (n, p) in sorted(counts.items())))
    counts.clear()


def audit_category(db, domain, path):
    counts, ratings, users, items = Counter(), Counter(), {}, {}
    earliest, latest = None, None
    for user, item, rating, timestamp in records(path, counts):
        ratings[rating] += 1
        earliest = timestamp if earliest is None else min(earliest, timestamp)
        latest = timestamp if latest is None else max(latest, timestamp)
        for target, key in ((users, user), (items, item)):
            pair = target.setdefault(key, [0, 0])
            pair[0] += 1
            pair[1] += rating >= 4
        if counts['accepted'] % 100000 == 0:
            flush_counts(db, 'users', domain, users)
            flush_counts(db, 'items', domain, items)
            db.commit()
        if counts['accepted'] % 1000000 == 0:
            print(f'{domain}: {counts["accepted"]:,} accepted records', flush=True)
    flush_counts(db, 'users', domain, users)
    flush_counts(db, 'items', domain, items)
    db.commit()
    user_hist = dict(db.execute('SELECT n, count(*) FROM users WHERE domain=? GROUP BY n', (domain,)))
    item_hist = dict(db.execute('SELECT n, count(*) FROM items WHERE domain=? GROUP BY n', (domain,)))
    return {'records_read': counts['read'], 'accepted': counts['accepted'], 'rejected': counts['rejected'],
            'rejection_reasons': {k: v for k, v in counts.items() if k not in ('read', 'accepted', 'rejected')},
            'users': sum(user_hist.values()), 'items': sum(item_hist.values()), 'rating_distribution': dict(ratings),
            'positive_interactions': sum(n for rating, n in ratings.items() if rating >= 4),
            'first_timestamp': iso(earliest) if earliest else None, 'last_timestamp': iso(latest) if latest else None,
            'interactions_per_user': summary(user_hist), 'interactions_per_item': summary(item_hist),
            'users_at_least': {str(k): sum(n for value, n in user_hist.items() if value >= k) for k in THRESHOLDS}}


def overlap(db):
    result = {'all_ratings': {}, 'positive_ratings': {}}
    groups = (('food', 'fitness'), ('food', 'media'), ('fitness', 'media'), tuple(CATEGORIES))
    for group in groups:
        aliases = ['u' + str(i) for i in range(len(group))]
        joins = 'users u0 ' + ' '.join(f'JOIN users {alias} ON {alias}.id=u0.id AND {alias}.domain=?' for alias in aliases[1:])
        params = (*group[1:], group[0])
        for name, column in (('all_ratings', 'n'), ('positive_ratings', 'p')):
            expressions = ', '.join('coalesce(sum(' + ' AND '.join(f'{a}.{column}>={k}' for a in aliases) + '),0)' for k in THRESHOLDS)
            values = db.execute(f'SELECT {expressions} FROM {joins} WHERE u0.domain=?', params).fetchone()
            result[name]['_'.join(group)] = dict(zip(map(str, THRESHOLDS), values))
    histograms = {d: Counter() for d in CATEGORIES}
    ratios = Counter()
    for food, fitness, media in db.execute(
            "SELECT f.n, s.n, m.n FROM users f JOIN users s ON f.id=s.id AND s.domain='fitness' "
            "JOIN users m ON f.id=m.id AND m.domain='media' WHERE f.domain='food'"):
        for domain, value in zip(CATEGORIES, (food, fitness, media)):
            histograms[domain][value] += 1
        ratios[max(food, fitness, media) / min(food, fitness, media)] += 1
    result['three_way_history_distribution'] = {d: summary(h) for d, h in histograms.items()}
    result['largest_to_smallest_domain_ratio'] = summary(ratios)
    return result


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def audit(raw_dir, database, results):
    paths = {d: raw_dir / (category + '.csv.gz') for d, category in CATEGORIES.items()}
    if any(not path.is_file() for path in paths.values()):
        raise ValueError('All three complete category files are required before an overlap audit')
    if database.exists() or any(results.glob('amazon_multidomain_*.json')):
        raise ValueError('Audit outputs already exist; use new paths instead of overwriting')
    database.parent.mkdir(parents=True, exist_ok=True)
    raw, files = {}, {}
    with sqlite3.connect(database) as db:
        db.execute('PRAGMA cache_size=-65536')
        for table in ('users', 'items'):
            db.execute(f'CREATE TABLE {table} (domain TEXT, id TEXT, n INTEGER, p INTEGER, PRIMARY KEY(domain,id)) WITHOUT ROWID')
        for domain, path in paths.items():
            raw[domain] = audit_category(db, domain, path)
            files[domain] = {'path': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
                             'url': f'{BASE_URL}/{path.name}', 'bytes': path.stat().st_size, 'sha256': file_digest(path)}
        print('Computing exact user overlap', flush=True)
        shared = overlap(db)
    generated = datetime.now(timezone.utc).isoformat()
    write_json(results / 'amazon_multidomain_raw_audit.json', {'generated_at': generated, 'domains': raw})
    write_json(results / 'amazon_multidomain_overlap.json', {'generated_at': generated, **shared})
    write_json(results / 'amazon_multidomain_dataset_manifest.json', {
        'generated_at': generated, 'source': 'Amazon Reviews 2023, McAuley Lab, official deduplicated 0-core pure IDs',
        'source_documentation': 'https://amazon-reviews-2023.github.io/data_processing/0core.html',
        'categories': CATEGORIES, 'files': files, 'record_counts': {d: raw[d]['accepted'] for d in CATEGORIES},
        'positive_threshold': 4, 'filter_configuration': None, 'split_strategy': None, 'seed': None,
        'status': 'raw_audit_complete; filtering and training not performed',
    })
    print(json.dumps(shared, indent=2), flush=True)


def positive_record(values, domain):
    from multidomain_data import canonical
    user, item, rating, timestamp = values
    if rating < 4:
        return None
    return canonical({'userId': f'amazon:user:{user}', 'itemId': f'{domain}:amazon:{item}',
                      'domain': domain, 'action': 'selected', 'value': rating, 'timestamp': iso(timestamp),
                      'source': 'amazon_reviews_2023', 'context': {'dataset': 'amazon', 'category': CATEGORIES[domain]}})


def prepare_cohort(raw_dir, database, results, output, limit=1000):
    from multidomain_data import prepare_multidomain, statistics
    from multidomain_experiment import architecture, training_blockers
    from multidomain_model import MultiDomainNeuMF, VARIANTS

    if (limit < 1 or output.exists() or (results / 'amazon_multidomain_filter_audit.json').exists()
            or (results / 'amazon_multidomain_prepared_manifest.json').exists()):
        raise ValueError('Use a positive cohort limit and a new output directory')
    manifest = json.loads((results / 'amazon_multidomain_dataset_manifest.json').read_text())
    shared = json.loads((results / 'amazon_multidomain_overlap.json').read_text())
    eligible_count = shared['positive_ratings']['food_fitness_media']['5']
    # This is an operational pilot gate, not a claim of statistical power.
    if eligible_count < 200:
        raise ValueError('Fewer than 200 users have five positives per domain; inspect pairwise feasibility first')
    with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
        eligible = [row[0] for row in db.execute(
            "SELECT f.id FROM users f JOIN users s ON f.id=s.id AND s.domain='fitness' "
            "JOIN users m ON f.id=m.id AND m.domain='media' "
            "WHERE f.domain='food' AND f.p>=5 AND s.p>=5 AND m.p>=5")]
    if len(eligible) != eligible_count:
        raise ValueError('Audit database and overlap artifact disagree')
    selected = set(sorted(eligible, key=lambda user: hashlib.sha256(f'42:{user}'.encode()).digest())[:limit])
    rows = []
    for domain, category in CATEGORIES.items():
        path = raw_dir / (category + '.csv.gz')
        if file_digest(path) != manifest['files'][domain]['sha256']:
            raise ValueError(f'Source hash changed for {domain}')
        print(f'Extracting {domain} positive histories for {len(selected)} reviewers', flush=True)
        with gzip.open(path, 'rt', newline='') as stream:
            for row in csv.DictReader(stream):
                if row['user_id'] in selected:
                    try:
                        record = positive_record(parse_row(row), domain)
                    except ValueError:
                        continue  # Apply the same rejection rules as the full source audit.
                    if record:
                        rows.append(record)
    rows.sort(key=lambda r: (r['timestamp'], r['userId'], r['itemId']))
    comparisons = []
    datasets = []
    for user_min, item_min in ((1, 1), (2, 2), (5, 2), (5, 5)):
        dataset = prepare_multidomain(rows, split_scope='per_user', user_min=user_min, item_min=item_min)
        comparisons.append({'user_min': user_min, 'item_min': item_min, **dataset['training_filter'],
                            'coverage': dataset['coverage'], 'blockers': training_blockers(dataset)})
        datasets.append(dataset)
    # Keep the least aggressive valid training graph, without consulting model scores.
    choice = next((i for i, d in enumerate(datasets) if not training_blockers(d)
                   and all(d['coverage']['test'][domain]['warm_users'] >= 30 for domain in CATEGORIES)), None)
    if choice is None:
        write_json(results / 'amazon_multidomain_filter_audit.json', {'comparisons': comparisons, 'chosen': None})
        raise ValueError('No candidate filter has warm test coverage for 30 users per domain; do not train')
    dataset = datasets[choice]
    config = json.loads((ROOT / 'research/multidomain_config.json').read_text())
    config.update(seed=42, planned_seeds=[42], split_scope='per_user',
                  user_min=comparisons[choice]['user_min'], item_min=comparisons[choice]['item_min'])
    output.mkdir(parents=True)
    config['inputs'] = {}
    for domain in CATEGORIES:
        path = output / (domain + '.jsonl')
        with path.open('x') as stream:
            for row in rows:
                if row['domain'] == domain:
                    stream.write(json.dumps(row) + '\n')
        config['inputs'][domain] = str(path)
    counts = {d: len(dataset['pairs']['train'][d]) for d in CATEGORIES}
    max_count = max(counts.values())
    parameters = {v: sum(p.numel() for p in MultiDomainNeuMF(**architecture(dataset, {**config, 'model_variant': v})).parameters()) for v in VARIANTS}
    generated = datetime.now(timezone.utc).isoformat()
    write_json(output / 'config.json', config)
    write_json(results / 'amazon_multidomain_filter_audit.json', {
        'generated_at': generated, 'eligible_reviewers': len(eligible), 'cohort_size': len(selected),
        'selection': 'Lowest SHA256(42:reviewer_id), capped at requested limit before any model evaluation',
        'cohort_counts': statistics(rows), 'comparisons': comparisons, 'chosen': choice,
        'reason': 'Least aggressive graph with valid splits, shared items, and >=30 warm test users per domain',
        'leakage_audit': dataset['leakage_audit'], 'parameters': parameters,
        'training_balance': {d: {'interactions': n, 'percent': 100 * n / sum(counts.values()),
                                 'balanced_positive_repeats': max_count - n, 'balanced_draw_multiplier': max_count / n}
                             for d, n in counts.items()},
    })
    write_json(results / 'amazon_multidomain_prepared_manifest.json', {
        **manifest, 'generated_at': generated, 'status': 'prepared; no model scores used for selection',
        'filter_configuration': {'user_min': config['user_min'], 'item_min': config['item_min'], 'scope': 'training only'},
        'split_strategy': '70/15/15 on each reviewer timeline across all three categories; ties stay together',
        'seed': 42, 'cohort_limit': limit, 'selected_reviewers': len(selected),
        'prepared_files': {d: {'path': path, 'bytes': Path(path).stat().st_size, 'sha256': file_digest(Path(path))}
                           for d, path in config['inputs'].items()},
    })
    print(json.dumps({'cohort': statistics(rows), 'chosen_filter': choice, 'parameters': parameters,
                      'coverage': dataset['coverage'], 'leakage': dataset['leakage_audit']}, indent=2), flush=True)


def validate_artifacts(results):
    raw = json.loads((results / 'amazon_multidomain_raw_audit.json').read_text())['domains']
    manifest = json.loads((results / 'amazon_multidomain_dataset_manifest.json').read_text())
    shared = json.loads((results / 'amazon_multidomain_overlap.json').read_text())
    for domain, values in raw.items():
        if (values['records_read'] != values['accepted'] + values['rejected'] or
                sum(values['rating_distribution'].values()) != values['accepted'] or
                sum(values['rejection_reasons'].values()) != values['rejected'] or
                manifest['record_counts'][domain] != values['accepted']):
            raise ValueError(f'Inconsistent record counts for {domain}')
    for group, counts in shared['all_ratings'].items():
        if counts['1'] > min(raw[d]['users'] for d in group.split('_')):
            raise ValueError('Overlap exceeds the source user population')
        for a, b in zip(THRESHOLDS, THRESHOLDS[1:]):
            if counts[str(a)] < counts[str(b)]:
                raise ValueError('Overlap thresholds are not monotonic')
    for name in ('amazon_multidomain_dataset_manifest.json', 'amazon_multidomain_prepared_manifest.json'):
        path = results / name
        if not path.exists():
            continue
        value = json.loads(path.read_text())
        for entry in value.get('prepared_files', value['files']).values():
            source = ROOT / entry['path']
            if source.stat().st_size != entry['bytes'] or file_digest(source) != entry['sha256']:
                raise ValueError(f'Manifest hash/size mismatch: {source}')
    for path in results.glob('amazon_multidomain_*.json'):
        value = json.loads(path.read_text())
        if 'generated_at' in value and datetime.fromisoformat(value['generated_at']).tzinfo is None:
            raise ValueError(f'Missing timestamp timezone: {path}')
    print('Audit counts, JSON, source sizes/hashes and prepared manifest validated', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--audit', action='store_true')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--validate', action='store_true')
    parser.add_argument('--categories', nargs='+', choices=CATEGORIES, default=list(CATEGORIES))
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw/amazon2023')
    parser.add_argument('--database', type=Path, default=ROOT / 'data/processed/amazon2023/audit.sqlite')
    parser.add_argument('--results-dir', type=Path, default=ROOT / 'research/results')
    parser.add_argument('--prepared-dir', type=Path, default=ROOT / 'data/processed/amazon2023/pilot')
    parser.add_argument('--cohort-limit', type=int, default=1000)
    args = parser.parse_args()
    if args.download:
        for domain in args.categories:
            download(domain, args.raw_dir)
    if args.audit:
        audit(args.raw_dir, args.database, args.results_dir)
    if args.prepare:
        prepare_cohort(args.raw_dir, args.database, args.results_dir, args.prepared_dir, args.cohort_limit)
    if args.validate:
        validate_artifacts(args.results_dir)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from None
