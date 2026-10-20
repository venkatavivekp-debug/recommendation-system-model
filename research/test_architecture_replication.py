import unittest

import architecture_replication as replication
from final_study import METRICS
from multidomain_data import DOMAINS
from test_architecture_control import domain_rows


class ArchitectureReplicationTests(unittest.TestCase):
    def test_config_changes_only_seed_and_variant(self):
        config = dict(seed=42, model_variant='shared_domain_specific', batch_size=512, learning_rate=.001)
        for seed in (43, 44):
            for model in 'ABC':
                actual = replication.run_config(config, seed, model)
                self.assertEqual(actual['seed'], seed)
                self.assertEqual({k: v for k, v in actual.items() if k not in ('seed', 'model_variant')},
                                 {k: v for k, v in config.items() if k not in ('seed', 'model_variant')})
        self.assertEqual(config['seed'], 42)
        for seed, model in ((42, 'A'), (45, 'B'), (43, 'C_context')):
            with self.assertRaises(ValueError):
                replication.run_config(config, seed, model)

    def test_sample_sd_not_population_sd(self):
        self.assertEqual(replication.stats([1., 2., 3.]), dict(mean=2., sample_sd=1., values=[1., 2., 3.]))
        for values in ([1., 2.], [1., 2., float('nan')]):
            with self.assertRaises(ValueError):
                replication.stats(values)

    def test_deltas_are_paired_within_seed_before_aggregation(self):
        runs = {}
        for seed, a, delta in ((42, .1, .01), (43, .5, -.02), (44, .2, .03)):
            models = {}
            for name, value in (('A', a), ('B', a + delta), ('C', a)):
                domains = domain_rows({d: {'user': value} for d in DOMAINS})
                for d in DOMAINS:
                    domains[d]['metrics'] = dict.fromkeys(METRICS, value)
                models[name] = dict(domains=domains, macro=dict.fromkeys(METRICS, value))
            runs[seed] = dict(seed=seed, models=models, coverage={})
        rows, deltas = replication.aggregate(runs)
        self.assertEqual((len(rows), len(deltas)), (36, 36))
        row = next(r for r in deltas if r['comparison']=='B-A' and r['domain']=='macro' and r['metric']=='ndcg')
        self.assertAlmostEqual(row['mean'], .02 / 3)
        self.assertEqual((row['positive_seeds'], row['negative_seeds'], row['zero_seeds']), (2, 1, 0))
        runs[44]['models']['B']['domains']['food']['per_user'] = {'other': dict.fromkeys(METRICS, .1)}
        with self.assertRaises(ValueError):
            replication.aggregate(runs)


if __name__ == '__main__':
    unittest.main()
