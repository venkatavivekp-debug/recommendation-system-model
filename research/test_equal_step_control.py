import json
import tempfile
import unittest

import torch

from amazon_diagnostics import DOMAINS
from equal_step_control import assert_equal_budget
from multidomain_data import batch_indices, prepare_multidomain
from multidomain_experiment import run
from test_multidomain import fixture


class EqualStepTests(unittest.TestCase):
    def test_balanced_sampler_equalizes_full_batch_exposure(self):
        examples = {d: list(range(n)) for d, n in zip(DOMAINS, (5, 7, 9))}
        batches = batch_indices(examples, 12, 'balanced', 42, steps=3)
        sizes = [len(examples[d]) for d in DOMAINS]
        counts = {d: 0 for d in DOMAINS}
        for batch in batches:
            for index in batch:
                offset = 0
                for domain, size in zip(DOMAINS, sizes):
                    if index < offset + size:
                        counts[domain] += 1
                        break
                    offset += size
        self.assertEqual(counts, dict.fromkeys(DOMAINS, 12))

    def test_equal_budget_and_natural_replay(self):
        dataset = prepare_multidomain(fixture())
        with tempfile.TemporaryDirectory() as directory:
            base = {'domains': list(DOMAINS), 'seed': 42, 'embedding_dim': 16, 'domain_dim': 4,
                    'mlp_layers': [32, 16], 'learning_rate': 0.001, 'batch_size': 16,
                    'epochs': 2, 'patience': 3, 'negative_samples': 2, 'positive_threshold': 4,
                    'train_ratio': .7, 'validation_ratio': .15, 'split_scope': 'per_domain',
                    'model_variant': 'shared', 'k': 3, 'output': directory, 'test_only': True,
                    'max_optimizer_steps': 3, 'validation_interval_steps': 2,
                    'checkpoint_metric': 'macro_validation_ndcg'}
            results = {}
            paths = {}
            for mode in ('natural', 'balanced'):
                config = {**base, 'domain_balancing': mode}
                paths[mode], results[mode] = run(dataset, config)
            assert_equal_budget(results['natural'], results['balanced'], 3, 16)
            for mode in ('natural', 'balanced'):
                training = results[mode]['training']
                self.assertEqual(training['optimizer_steps'], 3)
                self.assertEqual(sum(v['sampled_examples'] for v in training['exposure'].values()), 48)
                self.assertEqual([v['optimizer_steps'] for v in json.loads((paths[mode] / 'history.json').read_text())], [2, 3])
            repeat_path, repeat = run(dataset, {**base, 'domain_balancing': 'natural'})
            self.assertEqual(results['natural']['training'], repeat['training'])
            self.assertEqual(results['natural']['domains'], repeat['domains'])
            first = torch.load(paths['natural'] / 'ranking_best.pt', weights_only=True)
            second = torch.load(repeat_path / 'ranking_best.pt', weights_only=True)
            self.assertTrue(all(torch.equal(value, second['state_dict'][key])
                                for key, value in first['state_dict'].items()))


if __name__ == '__main__':
    unittest.main()
