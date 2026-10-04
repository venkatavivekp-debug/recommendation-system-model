import unittest

from amazon_diagnostics import DOMAINS, METRICS
from equal_step_replication import VARIANTS, paired_summary, summarize


class EqualStepReplicationTests(unittest.TestCase):
    def test_paired_summary_reports_median_and_directions(self):
        seeds = tuple(range(42, 48))
        result = paired_summary(dict(zip(seeds, (1, 2, 3, 4, 5, 6))),
                                dict(zip(seeds, (2, 2, 1, 6, 5, 9))), seeds)
        self.assertAlmostEqual(result['mean'], 2 / 3)
        self.assertEqual(result['median'], 0.5)
        self.assertEqual((result['positive'], result['equal'], result['negative']), (3, 2, 1))

    def test_six_seed_summaries_include_sampling_and_architecture_pairs(self):
        runs = []
        base = {'shared': 0.1, 'independent': 0.2, 'shared_domain_specific': 0.3}
        for variant in VARIANTS:
            for mode in ('natural', 'balanced'):
                for seed in range(42, 48):
                    value = base[variant] + (0.01 if mode == 'balanced' else 0) + (seed - 42) * 0.001
                    metrics = {name: value for name in METRICS}
                    runs.append({'variant': variant, 'mode': mode, 'seed': seed,
                                 'result': {'macro': metrics,
                                            'domains': {domain: {'metrics': metrics} for domain in DOMAINS}}})
        summary = summarize(runs)
        paired = summary['balanced_minus_natural']['shared']['food']['ndcg']
        self.assertAlmostEqual(paired['mean'], 0.01)
        self.assertEqual((paired['balanced_better'], paired['equal'], paired['balanced_worse']), (6, 0, 0))
        architecture = summary['architecture_by_sampling_method']['natural']['food']['ndcg']['paired_deltas']
        self.assertAlmostEqual(architecture['B_minus_A']['mean'], -0.1)
        self.assertAlmostEqual(architecture['C_minus_A']['mean'], 0.1)
        self.assertAlmostEqual(architecture['C_minus_B']['mean'], 0.2)


if __name__ == '__main__':
    unittest.main()
