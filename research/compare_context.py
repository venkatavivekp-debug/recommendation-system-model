import argparse
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

import torch

from context import cold_start_audit
from data import ROOT
from evaluate import evaluate
from model import NeuMF
from train import run


def compare(baseline, output):
    frozen = json.loads((baseline / 'result.json').read_text())
    data = json.loads((baseline / 'data.json').read_text())
    checkpoint = torch.load(baseline / 'best.pt', map_location='cpu', weights_only=True)
    model = NeuMF(**checkpoint['architecture'])
    model.load_state_dict(checkpoint['state_dict'])
    torch.set_num_threads(1)
    reproduced = evaluate(model, data, frozen['k'])
    if reproduced['metrics'] != frozen['metrics']:
        raise ValueError('Frozen baseline evaluation did not reproduce')
    directory = output / ('context-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    directory.mkdir(parents=True, exist_ok=False)
    records = []
    for seed in (42, 43, 44):
        for use_context in (False, True):
            config = {**frozen['config'], 'seed': seed, 'context': use_context, 'output': str(directory)}
            path, result = run(config)
            prepared = json.loads((path / 'data.json').read_text())
            if prepared != data:
                raise ValueError('Comparison dataset differs from the frozen control')
            if seed == 42 and not use_context:
                if result['metrics'] != frozen['metrics'] or result['history'] != frozen['history']:
                    raise ValueError('Seed 42 baseline training did not reproduce')
            records.append({
                'seed': seed, 'model': result['model'], 'run': str(path),
                'metrics': result['metrics']['ncf'], 'best_epoch': result['best_epoch'],
                'parameter_count': result['parameter_count'], 'training_seconds': result['training_seconds'],
            })
    aggregates = {}
    for name in ('NeuMF', 'NeuMF + Context'):
        aggregates[name] = {}
        for metric in records[0]['metrics']:
            values = [r['metrics'][metric] for r in records if r['model'] == name]
            aggregates[name][metric] = {'mean': statistics.mean(values), 'std': statistics.stdev(values)}
    summary = {
        'generated_at': datetime.now(timezone.utc).isoformat(), 'frozen_baseline': str(baseline),
        'baseline_reproduced': True, 'cold_start': cold_start_audit(data),
        'coverage': data['coverage'], 'protocol': 'A: frozen global chronological split; warm subset only',
        'second_protocol': None,
        'query_context': 'UTC timestamp of first eligible test event per user, shared across candidates',
        'target_horizon': 'all eligible positives for that user in the test period',
        'standard_deviation': 'sample standard deviation across three seeds (ddof=1)',
        'runs': records,
        'aggregate': aggregates,
    }
    (directory / 'comparison.json').write_text(json.dumps(summary, indent=2))
    print(f'Comparison saved to {directory / "comparison.json"}')
    print(json.dumps(summary['aggregate'], indent=2))
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Compare frozen NeuMF and temporal context on three seeds')
    parser.add_argument('baseline', type=Path, help='Existing frozen run directory')
    parser.add_argument('--output', type=Path, default=ROOT / 'research/runs')
    args = parser.parse_args()
    compare(args.baseline, args.output)
