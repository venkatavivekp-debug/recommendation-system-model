import argparse
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

import torch

from adaptive import SETTINGS, read_ratings, replay
from data import ROOT
from model import NeuMF
from train import run


def compare(baseline, output):
    frozen = json.loads((baseline / 'result.json').read_text())
    frozen_data = json.loads((baseline / 'data.json').read_text())
    if frozen['config']['threshold'] != 4:
        raise ValueError('Adaptive comparison requires the fixed rating >= 4 baseline')
    directory = output / ('adaptive-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    directory.mkdir(parents=True, exist_ok=False)
    protocol = {
        'settings': SETTINGS, 'seeds': [42, 43, 44],
        'feedback': '>=4 positive; <=2 explicit low preference; 3 neutral (no gradient)',
        'eligibility': 'training user identity and at least 5 raw ratings by validation cutoff; no outcome selection',
        'selection': 'fixed adaptation settings chosen before test; checkpoint chosen by validation BCE',
        'initial_model': 'separate train-only negative-mask NeuMF; validation mask uses train+validation, never test',
        'candidates': 'training catalog minus all prior rated items; equal timestamp groups predicted before any reveal',
        'update': 'one mean-BCE clipped SGD step per revealed group on two local user vectors; no synthetic negatives',
        'depths': 'first positive group after >=5/10/20 warm test ratings; ties may overshoot; matched user intersection reported',
        'aggregation': 'mean positive-group metrics within user, then mean users; K=10',
        'examples': 'seed42 largest/nearest-zero/smallest paired user nDCG delta; first nonneutral update shown',
        'diagnostics': 'same-group after-feedback ranks are explanatory, not predictive performance',
    }
    (directory / 'protocol.json').write_text(json.dumps(protocol, indent=2))
    ratings = read_ratings(frozen['config']['ratings'])
    records = []
    for seed in protocol['seeds']:
        config = {**frozen['config'], 'seed': seed, 'context': False, 'negative_scope': 'train',
                  'evaluate_test': False, 'output': str(directory)}
        path, training = run(config)
        data = json.loads((path / 'data.json').read_text())
        if data != frozen_data:
            raise ValueError('Adaptive dataset differs from frozen splits/mappings')
        checkpoint = torch.load(path / 'best.pt', map_location='cpu', weights_only=True)
        model = NeuMF(**checkpoint['architecture'])
        model.load_state_dict(checkpoint['state_dict'])
        result = replay(model, data, ratings)
        if any(not torch.equal(value, checkpoint['state_dict'][name]) for name, value in model.state_dict().items()):
            raise AssertionError('Replay modified the frozen checkpoint')
        if seed == 42:
            repeated = replay(model, data, ratings)
            if {k: v for k, v in result.items() if k != 'timing'} != {k: v for k, v in repeated.items() if k != 'timing'}:
                raise AssertionError('Replay did not reproduce deterministically')
        result.update(seed=seed, generated_at=datetime.now(timezone.utc).isoformat(),
                      run=str(path), best_epoch=training['best_epoch'], checkpoint_unchanged=True)
        (directory / f'replay-{seed}.json').write_text(json.dumps(result, indent=2))
        records.append({key: value for key, value in result.items() if key not in ('groups', 'examples', 'users')})
        print(json.dumps({'seed': seed, 'metrics': result['metrics'], 'coverage': result['coverage']}), flush=True)
    aggregate = {arm: {metric: {'mean': statistics.mean(r['metrics'][arm][metric] for r in records),
                               'std': statistics.stdev(r['metrics'][arm][metric] for r in records)}
                        for metric in ('precision', 'recall', 'ndcg')} for arm in ('static', 'adaptive')}
    summary = {'generated_at': datetime.now(timezone.utc).isoformat(), 'protocol': protocol,
               'frozen_baseline': str(baseline), 'seed42_replay_deterministic': True,
               'runs': records, 'aggregate': aggregate}
    (directory / 'comparison.json').write_text(json.dumps(summary, indent=2))
    print(f'Adaptive comparison saved to {directory}', flush=True)
    print(json.dumps(aggregate, indent=2), flush=True)
    return directory, summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Paired static/adaptive NeuMF rating replay')
    parser.add_argument('baseline', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'research/runs')
    args = parser.parse_args()
    compare(args.baseline, args.output)
