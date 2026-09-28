import argparse
import json
import math
import platform
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from data import ROOT, known_items, prepare, sample_examples
from context import CONTEXT_FEATURES, temporal_context, warm_rows
from evaluate import evaluate
from model import NeuMF


def make_loader(examples, batch_size, seed, shuffle=False):
    values = torch.tensor(examples)
    features = [values[:, 0].long(), values[:, 1].long()]
    if values.shape[1] > 3:
        features.append(values[:, 3:])
    dataset = TensorDataset(*features, values[:, 2])
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle,
                      generator=torch.Generator().manual_seed(seed))


def run(config):
    if config.get('negative_scope', 'all') not in ('all', 'train'):
        raise ValueError('Negative scope must be all or train')
    if any(config[key] < 1 for key in ('epochs', 'batch_size', 'embedding_dim', 'negatives', 'k')):
        raise ValueError('Epochs, batch size, embedding size, negatives and K must be positive')
    if not math.isfinite(config['learning_rate']) or config['learning_rate'] <= 0:
        raise ValueError('Learning rate must be positive and finite')
    if not config['hidden_sizes'] or any(size < 1 for size in config['hidden_sizes']):
        raise ValueError('Use positive MLP hidden sizes')
    seed = config['seed']
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    dataset = prepare(config['ratings'], config['threshold'], config['train_ratio'], config['validation_ratio'])
    directory = Path(config['output']) / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    directory.mkdir(parents=True, exist_ok=False)
    (directory / 'data.json').write_text(json.dumps(dataset))
    architecture = {
        'user_count': len(dataset['user_mapping']), 'item_count': len(dataset['item_mapping']),
        'embedding_dim': config['embedding_dim'], 'hidden_sizes': config['hidden_sizes'],
    }
    use_context = config.get('context', False)
    contexts = {}
    if use_context:
        architecture['context_dim'] = len(CONTEXT_FEATURES)
        contexts = {split: [temporal_context(row['timestamp']) for row in warm_rows(dataset, split)]
                    for split in ('train', 'validation')}
    model = NeuMF(**architecture)
    optimizer = torch.optim.Adam(model.parameters(), lr=config['learning_rate'])
    loss_fn = nn.BCEWithLogitsLoss()
    train_only = config.get('negative_scope', 'all') == 'train'
    known = known_items(dataset['pairs']['train'] if train_only else
                        [pair for group in dataset['pairs'].values() for pair in group])
    validation_known = known_items(dataset['pairs']['train'] + dataset['pairs']['validation']) if train_only else known
    validation = make_loader(sample_examples(
        dataset['pairs']['validation'], validation_known, architecture['item_count'], config['negatives'], seed + 1,
        contexts=contexts.get('validation'),
    ), config['batch_size'], seed)
    history = []
    best_loss = float('inf')
    started = time.perf_counter()
    for epoch in range(1, config['epochs'] + 1):
        loader = make_loader(sample_examples(
            dataset['pairs']['train'], known, architecture['item_count'], config['negatives'], seed + epoch,
            contexts=contexts.get('train'),
        ), config['batch_size'], seed + epoch, shuffle=True)
        model.train()
        train_total = 0.0
        for *features, labels in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(*features), labels)
            loss.backward()
            optimizer.step()
            train_total += loss.item() * len(labels)
        model.eval()
        validation_total = 0.0
        with torch.no_grad():
            for *features, labels in validation:
                validation_total += loss_fn(model(*features), labels).item() * len(labels)
        record = {'epoch': epoch, 'train_loss': train_total / len(loader.dataset),
                  'validation_loss': validation_total / len(validation.dataset)}
        if not all(math.isfinite(record[key]) for key in ('train_loss', 'validation_loss')):
            raise ValueError('Training produced a non-finite loss')
        history.append(record)
        print(json.dumps(record), flush=True)
        if record['validation_loss'] < best_loss:
            best_loss = record['validation_loss']
            torch.save({
                'state_dict': model.state_dict(), 'architecture': architecture, 'epoch': epoch,
                'config': config, 'user_mapping': dataset['user_mapping'],
                'item_mapping': dataset['item_mapping'], 'source_sha256': dataset['source_sha256'],
            }, directory / 'best.pt')
    training_seconds = time.perf_counter() - started
    checkpoint = torch.load(directory / 'best.pt', map_location='cpu', weights_only=True)
    model.load_state_dict(checkpoint['state_dict'])
    result = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'dataset': dataset['dataset'], 'source_sha256': dataset['source_sha256'],
        'model': 'NeuMF + Context' if use_context else 'NeuMF',
        'context_features': CONTEXT_FEATURES if use_context else [],
        'config': config, 'architecture': architecture,
        'versions': {'python': platform.python_version(), 'torch': str(torch.__version__),
                     'numpy': np.__version__, 'platform': platform.platform(), 'device': 'cpu', 'threads': 1},
        'protocol': {
            'split': 'global temporal 70/15/15 by default; boundary timestamp ties kept together',
            'negative_exclusion': ('train positives for training; train/validation positives for validation; no test identities'
                                   if train_only else 'all known positives, including held-out identities (offline exclusion mask)'),
            'checkpoint_selection': 'lowest sampled validation BCE',
            'aggregation': 'macro average over warm test users',
        },
        'coverage': dataset['coverage'], 'best_epoch': checkpoint['epoch'],
        'training_seconds': training_seconds,
        'parameter_count': sum(p.numel() for p in model.parameters()), 'history': history,
        **(evaluate(model, dataset, config['k']) if config.get('evaluate_test', True) else {}),
    }
    (directory / 'result.json').write_text(json.dumps(result, indent=2))
    print(f'Run saved to {directory}', flush=True)
    if 'metrics' in result:
        print(json.dumps(result['metrics'], indent=2), flush=True)
    return directory, result


def arguments():
    parser = argparse.ArgumentParser(description='Train an offline MovieLens NeuMF baseline on CPU')
    parser.add_argument('--ratings', default=str(ROOT / 'data/raw/ml-100k/u.data'))
    parser.add_argument('--output', default=str(ROOT / 'research/runs'))
    parser.add_argument('--threshold', type=int, default=4)
    parser.add_argument('--train-ratio', type=float, default=0.7)
    parser.add_argument('--validation-ratio', type=float, default=0.15)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=512)
    parser.add_argument('--learning-rate', type=float, default=0.001)
    parser.add_argument('--embedding-dim', type=int, default=16)
    parser.add_argument('--hidden-sizes', type=int, nargs='+', default=[32, 16])
    parser.add_argument('--negatives', type=int, default=4)
    parser.add_argument('--k', type=int, default=10)
    parser.add_argument('--context', action='store_true', help='Add four cyclic UTC temporal features')
    return vars(parser.parse_args())


if __name__ == '__main__':
    run(arguments())
