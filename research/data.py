import argparse
import csv
import hashlib
import json
import random
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def foundation(command, payload):
    result = subprocess.run(
        ['node', str(ROOT / 'research/foundation.cjs'), command],
        input=json.dumps(payload), text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


def prepare(path, threshold=4, train_ratio=0.7, validation_ratio=0.15):
    if not 1 <= threshold <= 5:
        raise ValueError('Rating threshold must be between 1 and 5')
    if not (0 < train_ratio < 1 and 0 < validation_ratio < 1 - train_ratio):
        raise ValueError('Split ratios must leave nonempty train, validation and test fractions')
    rows = []
    seen = set()
    with Path(path).open() as source:
        for user, item, rating, timestamp in csv.reader(source, delimiter='\t'):
            if (user, item) in seen:
                raise ValueError('Expected one rating per user/movie pair')
            seen.add((user, item))
            if int(rating) >= threshold:
                rows.append({
                    'userId': user, 'itemId': item, 'domain': 'media',
                    'action': 'selected',
                    'timestamp': datetime.fromtimestamp(int(timestamp), timezone.utc).isoformat(),
                })
    if len(rows) < 10:
        raise ValueError('Need at least 10 positive interactions for temporal splitting')
    splits = foundation('prepare', {
        'rows': rows, 'trainRatio': train_ratio, 'validationRatio': validation_ratio,
    })
    users = {key: i for i, key in enumerate(sorted({r['userId'] for r in splits['train']}))}
    items = {key: i for i, key in enumerate(sorted({r['itemId'] for r in splits['train']}))}
    pairs = {}
    coverage = {}
    for name, group in splits.items():
        pairs[name] = [(users[r['userId']], items[r['itemId']]) for r in group
                       if r['userId'] in users and r['itemId'] in items]
        coverage[name] = {
            'positives': len(group), 'warm_positives': len(pairs[name]),
            'excluded_cold_positives': len(group) - len(pairs[name]),
            'users': len({r['userId'] for r in group}),
            'warm_users': len({u for u, _ in pairs[name]}),
            'first_timestamp': group[0]['timestamp'] if group else None,
            'last_timestamp': group[-1]['timestamp'] if group else None,
        }
        if not pairs[name]:
            raise ValueError(f'No warm interactions in {name}; use a larger dataset or different split')
    return {
        'dataset': 'MovieLens 100K', 'source_sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        'threshold': threshold, 'train_ratio': train_ratio, 'validation_ratio': validation_ratio,
        'user_mapping': users, 'item_mapping': items, 'splits': splits,
        'pairs': pairs, 'coverage': coverage,
    }


def known_items(pairs):
    known = defaultdict(set)
    for user, item in pairs:
        known[user].add(item)
    return known


def sample_examples(positives, known, item_count, negatives_per_positive=4, seed=42, contexts=None):
    if negatives_per_positive < 1:
        raise ValueError('Use at least one negative per positive')
    rng = random.Random(seed)
    if contexts is not None and len(contexts) != len(positives):
        raise ValueError('Each positive must have one query context')
    examples = []
    eligible = {}
    for index, (user, item) in enumerate(positives):
        if user not in eligible:
            eligible[user] = [i for i in range(item_count) if i not in known[user]]
        pool = eligible[user]
        context = tuple(contexts[index]) if contexts is not None else ()
        examples.append((user, item, 1.0, *context))
        examples.extend((user, negative, 0.0, *context) for negative in
                        rng.sample(pool, min(negatives_per_positive, len(pool))))
    if not any(example[2] == 0 for example in examples):
        raise ValueError('No eligible negatives in this catalog')
    return examples


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Inspect MovieLens preprocessing without training')
    parser.add_argument('--ratings', type=Path, default=ROOT / 'data/raw/ml-100k/u.data')
    parser.add_argument('--threshold', type=int, default=4)
    args = parser.parse_args()
    dataset = prepare(args.ratings, args.threshold)
    print(json.dumps(dataset['coverage'], indent=2))
