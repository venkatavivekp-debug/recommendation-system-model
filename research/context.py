import math
from collections import Counter
from datetime import datetime, timezone


CONTEXT_FEATURES = ['hour_sin', 'hour_cos', 'weekday_sin', 'weekday_cos']


def temporal_context(timestamp):
    moment = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    if moment.tzinfo is None:
        raise ValueError('Context timestamps must include a timezone')
    moment = moment.astimezone(timezone.utc)
    hour = 2 * math.pi * moment.hour / 24
    day = 2 * math.pi * moment.weekday() / 7
    return [math.sin(hour), math.cos(hour), math.sin(day), math.cos(day)]


def warm_rows(dataset, split):
    return [row for row in dataset['splits'][split]
            if row['userId'] in dataset['user_mapping'] and row['itemId'] in dataset['item_mapping']]


def query_contexts(dataset):
    first = {}
    for row in warm_rows(dataset, 'test'):
        user = dataset['user_mapping'][row['userId']]
        if user not in first or row['timestamp'] < first[user]:
            first[user] = row['timestamp']
    return {user: temporal_context(timestamp) for user, timestamp in first.items()}


def cold_start_audit(dataset):
    audit = {}
    for split, rows in dataset['splits'].items():
        counts = Counter()
        for row in rows:
            unseen_user = row['userId'] not in dataset['user_mapping']
            unseen_item = row['itemId'] not in dataset['item_mapping']
            category = ('both_unseen' if unseen_user and unseen_item else
                        'unseen_user_only' if unseen_user else
                        'unseen_item_only' if unseen_item else 'warm')
            counts[category] += 1
        audit[split] = {key: counts[key] for key in
                        ('unseen_user_only', 'unseen_item_only', 'both_unseen', 'warm')}
    return audit
