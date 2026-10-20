import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

import architecture_control as control
import final_study
from multidomain_context import CONTEXT_DIM
from multidomain_data import DOMAINS
from multidomain_model import VARIANTS


def domain_rows(values):
    return {d: {'per_user': {u: dict.fromkeys(final_study.METRICS, value) for u, value in group.items()},
                'evaluated_users': len(group), 'queries': len(group)} for d, group in values.items()}


class ArchitectureControlTests(unittest.TestCase):
    def test_coverage_mismatch_stops(self):
        before = domain_rows({d: {'a': 0.0} for d in DOMAINS})
        after = domain_rows({d: {'b': 0.0} for d in DOMAINS})
        with self.assertRaises(ValueError):
            control.check_coverage(after, before)

    def test_macro_averages_domains_not_pooled_users(self):
        before = domain_rows({'food': {'a': 0., 'b': 0.}, 'fitness': {'a': 0.}, 'media': {'c': 0.}})
        after = domain_rows({'food': {'a': .6, 'b': .6}, 'fitness': {'a': .3}, 'media': {'c': 0.}})
        result = control.macro_bootstrap(before, after, samples=100)
        self.assertEqual(result, control.macro_bootstrap(before, after, samples=100))
        for row in result.values():
            self.assertAlmostEqual(row['mean_paired_delta'], .3)
            np.testing.assert_allclose(row['ci95'], [.3, .3])
            self.assertEqual(row['reviewer_clusters'], 3)

    def test_macro_joint_user_resampling_preserves_cross_domain_cancellation(self):
        before = domain_rows({d: {'a': .2, 'b': .4} for d in DOMAINS})
        after = domain_rows({'food': {'a': .4, 'b': .2},
                             'fitness': {'a': .2, 'b': .4}, 'media': {'a': 0., 'b': .6}})
        row = control.macro_bootstrap(before, after, samples=100)['ndcg']
        np.testing.assert_allclose(row['ci95'], [0., 0.], atol=1e-15)

    def test_direction_does_not_call_positive_mean_significant(self):
        result = control.direction({'mean_paired_delta': .01, 'ci95': [-.02, .03]})
        self.assertEqual(result['interpretation'], 'positive direction, uncertain')
        result = control.direction({'mean_paired_delta': -.01, 'ci95': [-.03, .02]})
        self.assertEqual(result['interpretation'], 'negative direction, uncertain')

    def test_comparisons_have_expected_signs_and_macro(self):
        models = {name: {'domains': domain_rows({d: {'a': value, 'b': value} for d in DOMAINS})}
                  for name, value in (('A', .1), ('B', .2), ('C', .15))}
        paired = control.comparisons(models)
        for name, delta in (('B-A', .1), ('C-A', .05), ('C-B', -.05)):
            for domain in (*DOMAINS, 'macro'):
                self.assertAlmostEqual(paired[name][domain]['ndcg']['mean_paired_delta'], delta)

    def test_existing_runner_uses_same_samples_for_all_architectures(self):
        dataset = {'user_mapping': {'a': 0}, 'item_mapping': {d: {str(i): i for i in range(6)} for d in DOMAINS},
                   'domain_users': {d: [0] for d in DOMAINS},
                   'pairs': {'train': {d: [(0, 0)] for d in DOMAINS}}}
        training = {d: [(0, 0, *([0.] * CONTEXT_DIM))] for d in DOMAINS}
        validation = {d: [{'user': 0, 'targets': [1], 'excluded': [0], 'context': [0.] * CONTEXT_DIM}] for d in DOMAINS}
        config = dict(seed=42, embedding_dim=2, mlp_layers=[4, 2], domain_dim=2,
                      learning_rate=.001, batch_size=3, max_optimizer_steps=4,
                      validation_interval_steps=2, negative_samples=2, k=10)
        results = []
        with tempfile.TemporaryDirectory() as directory, patch.object(final_study, 'ROOT', Path(directory)):
            for name, variant in zip('ABC', VARIANTS):
                model, result = final_study.train_model(name, dataset, training, validation,
                    {**config, 'model_variant': variant}, Path(directory))
                self.assertEqual(model.variant, variant)
                self.assertEqual(sum(result['domain_draws'].values()), 12)
                self.assertIn(result['selected_step'], [2, 4])
                results.append(result)
        self.assertEqual(len({r['sampling_sha256'] for r in results}), 1)


if __name__ == '__main__':
    unittest.main()
