import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch

from amazon_data import write_json
from amazon_diagnostics import (DOMAINS, aggregate, candidate_fingerprints, coverage_audit, digest,
                                mean_sd, observe_evaluation, paired_counts, training_budget, transfer_deltas)
from multidomain_data import batch_indices, prepare_multidomain
from multidomain_experiment import evaluate_domains
from multidomain_model import MultiDomainNeuMF, VARIANTS
from test_multidomain import fixture


class ReplicationTests(unittest.TestCase):
    def test_mean_sample_sd_and_paired_deltas(self):
        self.assertEqual(mean_sd([1, 2, 3]), {'mean': 2, 'sd': 1})
        seeds = []
        for seed, base in zip((42, 43, 44), (0.1, 0.2, 0.3)):
            models = {v: {'domains': {d: {'metrics': {m: base + delta for m in ('precision', 'recall', 'ndcg')}} for d in DOMAINS},
                          'macro': {m: base + delta for m in ('precision', 'recall', 'ndcg')}}
                      for v, delta in zip(VARIANTS, (0, 0.01, -0.02))}
            seeds.append({'seed': seed, 'modes': {mode: {'models': models, 'deltas': transfer_deltas(models)}
                                                for mode in ('natural', 'balanced')}})
        result = aggregate(seeds)['natural']
        self.assertAlmostEqual(result['models']['independent']['domains']['food']['ndcg']['sd'], 0.1)
        self.assertAlmostEqual(result['deltas']['food']['B-A']['mean'], 0.01)
        self.assertAlmostEqual(result['deltas']['food']['C-B']['mean'], -0.03)
        self.assertEqual(result['deltas']['food']['C-B']['negative_seeds'], 3)

    def test_paired_users_require_same_population(self):
        left = {str(i): {'ndcg': value} for i, value in enumerate((0.2, 0.5, 0.8))}
        right = {str(i): {'ndcg': 0.5} for i in range(3)}
        self.assertEqual(paired_counts(left, right), {'improved': 1, 'unchanged': 1, 'worsened': 1})
        with self.assertRaises(ValueError):
            paired_counts(left, {'0': {'ndcg': 0.5}})

    def test_actual_candidates_match_across_models(self):
        dataset = prepare_multidomain(fixture())
        expected = candidate_fingerprints(dataset)
        for variant in VARIANTS:
            model = MultiDomainNeuMF(len(dataset['user_mapping']), [len(dataset['item_mapping'][d]) for d in DOMAINS],
                                    [dataset['domain_users'][d] for d in DOMAINS], variant)
            _, _, _, observed = observe_evaluation(model, dataset, 3)
            self.assertEqual({d: observed[d]['candidate_sha256'] for d in DOMAINS}, expected)
        def altered(model, dataset, k):
            model(torch.tensor([dataset['domain_users']['food'][0]]), torch.tensor([0]), torch.tensor([0]))
            return evaluate_domains(model, dataset, k)
        with patch('amazon_diagnostics.evaluate_domains', side_effect=altered), self.assertRaisesRegex(ValueError, 'candidates'):
            observe_evaluation(model, dataset, 3)

    def test_step_and_oversampling_accounting(self):
        examples = {d: list(range(n)) for d, n in zip(DOMAINS, (2, 4, 6))}
        for mode, draws in (('natural', dict(zip(DOMAINS, (2, 4, 6)))), ('balanced', dict.fromkeys(DOMAINS, 6))):
            row = {'epoch': 1, 'domain_draws': draws, 'available_examples': {d: len(v) for d, v in examples.items()}}
            budget = training_budget([row], 5)
            self.assertEqual(budget['total_optimizer_steps'], len(batch_indices(examples, 5, mode, 42)))
            self.assertEqual(budget['epochs'][0]['repeated_examples']['food'], 4 if mode == 'balanced' else 0)
        self.assertEqual(training_budget([{'domain_draws': dict.fromkeys(DOMAINS, 73025),
                                         'available_examples': dict(zip(DOMAINS, (50450, 40110, 73025)))}], 512)['total_optimizer_steps'], 428)

    def test_coverage_distinguishes_cold_items(self):
        rows = fixture()
        rows.append({**rows[0], 'itemId': 'food:recipe:unseen', 'timestamp': '2021-01-01T00:00:00+00:00'})
        dataset = prepare_multidomain(rows, split_scope='per_user')
        result = coverage_audit(rows, dataset, {'train_ratio': 0.7, 'validation_ratio': 0.15})
        for domain, values in result.items():
            self.assertEqual(values['total_test_positives'], values['warm_test_positives'] +
                             values['cold_item_test_positives'] + values['known_item_missing_domain_history'])
            self.assertEqual(values['warm_test_positives'], dataset['coverage']['test'][domain]['warm_positives'])
            self.assertEqual(sum(values['users_by_warm_positives'].values()), values['test_users'])
            self.assertEqual(sum(values['training_item_frequency'].values()), values['train_items'])
        self.assertGreater(result['food']['cold_item_test_positives'], 0)

    def test_fingerprints_and_artifact_isolation(self):
        self.assertEqual(digest({'a': 1, 'b': 2}), digest({'b': 2, 'a': 1}))
        self.assertNotEqual(digest([1, 2]), digest([2, 1]))
        with tempfile.TemporaryDirectory() as directory:
            a, b = (Path(directory) / f'seed{seed}.json' for seed in (43, 44))
            write_json(a, {'seed': 43})
            original = a.read_bytes()
            write_json(b, {'seed': 44})
            with self.assertRaises(FileExistsError):
                write_json(a, {'seed': 44})
            self.assertEqual(a.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
