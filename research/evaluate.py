import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import torch

from data import foundation, known_items
from model import NeuMF
from context import query_contexts


def evaluate(model, dataset, k=10):
    if k < 1:
        raise ValueError('K must be positive')
    train = dataset['pairs']['train']
    history = known_items(train + dataset['pairs']['validation'])
    relevant = known_items(dataset['pairs']['test'])
    popularity = Counter(item for _, item in train)
    catalog = list(range(len(dataset['item_mapping'])))
    contexts = query_contexts(dataset) if model.context_dim else {}
    requests = []
    model.eval()
    with torch.no_grad():
        for user in sorted(relevant):
            candidates = [item for item in catalog if item not in history[user]]
            items = torch.tensor(candidates, dtype=torch.long)
            query = torch.tensor(contexts[user]).expand(len(items), -1) if model.context_dim else None
            scores = model(torch.full_like(items, user), items, query).tolist()
            ncf = sorted(zip(candidates, scores), key=lambda pair: (-pair[1], pair[0]))
            popular = sorted(candidates, key=lambda item: (-popularity[item], item))
            for ranking in (popular[:k], [item for item, _ in ncf[:k]]):
                requests.append({
                    'rankedItems': [str(i) for i in ranking],
                    'relevantItems': [str(i) for i in sorted(relevant[user])], 'k': k,
                })
    # Use the existing JS definitions; do not maintain a second metric implementation.
    metrics = foundation('metrics', requests)
    return {
        'k': k, 'evaluated_users': len(relevant),
        'candidate_protocol': 'all train-catalog items except train/validation positives',
        'query_context': 'first warm test timestamp per user; all test positives are horizon targets'
                         if model.context_dim else 'none',
        'metrics': {
            name: {key + '_at_k': sum(m[key] for m in metrics[offset::2]) / len(relevant)
                   for key in ('precision', 'recall', 'ndcg')}
            for offset, name in enumerate(('most_popular', 'ncf'))
        },
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Evaluate a saved offline NeuMF run')
    parser.add_argument('run', type=Path)
    parser.add_argument('--k', type=int, default=10)
    args = parser.parse_args()
    dataset = json.loads((args.run / 'data.json').read_text())
    checkpoint = torch.load(args.run / 'best.pt', map_location='cpu', weights_only=True)
    model = NeuMF(**checkpoint['architecture'])
    model.load_state_dict(checkpoint['state_dict'])
    torch.set_num_threads(1)
    result = evaluate(model, dataset, args.k)
    result['generated_at'] = datetime.now(timezone.utc).isoformat()
    output = args.run / ('evaluation-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    with output.open('x') as target:
        json.dump(result, target, indent=2)
    print(json.dumps(result, indent=2))
