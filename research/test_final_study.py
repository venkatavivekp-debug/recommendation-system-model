import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

import final_study
from data import foundation
from multidomain_context import CONTEXT_DIM, ContextNeuMF, contextual_groups, global_splits
from multidomain_data import DOMAINS, prepare_multidomain
from multidomain_model import MultiDomainNeuMF


def event(day, domain='food', user='a', item=None):
    return {'userId': user, 'itemId': item or f'{domain}:{day}', 'domain': domain,
            'timestamp': f'2020-01-{day:02d}T00:00:00+00:00', 'context': {}}


class FinalStudyTests(unittest.TestCase):
    def test_global_split_ties_and_train_only_mappings(self):
        rows = [event(day, domain) for day in range(1, 11) for domain in DOMAINS]
        splits, cutoffs = global_splits(rows)
        dataset = prepare_multidomain(rows, split_scope='global')
        self.assertEqual(cutoffs['train_end'], rows[18]['timestamp'])
        self.assertLess(max(r['timestamp'] for r in splits['train']), min(r['timestamp'] for r in splits['validation']))
        for domain in DOMAINS:
            self.assertNotIn(f'{domain}:10', dataset['item_mapping'][domain])
        self.assertEqual(dataset['leakage_audit']['violations'], 0)

    def test_context_uses_only_prior_groups_not_tied_peers(self):
        rows = [event(1), event(2, 'media'), event(2, 'fitness'), event(3)]
        groups = list(contextual_groups(rows))
        self.assertEqual(groups[0][3], [0] * CONTEXT_DIM)
        self.assertEqual(groups[1][3][:3], [1, 0, 0])
        self.assertEqual(groups[2][3][:6], [0, .5, .5, 1, 0, 0])
        self.assertEqual(groups, list(contextual_groups(list(reversed(rows)))))

    def test_context_future_and_other_user_do_not_change_prefix(self):
        rows = [event(1), event(2, 'media')]
        original = list(contextual_groups(rows))
        augmented = list(contextual_groups(rows + [event(3), event(1, user='b')]))
        self.assertEqual(original, augmented[:2])

    def test_zero_initialized_extension_matches_C(self):
        kwargs = dict(user_count=2, item_counts=[3, 3, 3], domain_users=[[0, 1]] * 3,
                      variant='shared_domain_specific', embedding_dim=4)
        torch.manual_seed(42)
        baseline = MultiDomainNeuMF(**kwargs)
        torch.manual_seed(42)
        model = ContextNeuMF(**kwargs)
        for name, value in baseline.state_dict().items():
            self.assertTrue(torch.equal(value, model.state_dict()[name]))
        users, items, domains = torch.tensor([0, 1]), torch.tensor([1, 2]), torch.tensor([0, 2])
        context = torch.randn(2, CONTEXT_DIM)
        self.assertTrue(torch.equal(baseline(users, items, domains), model(users, items, domains, context)))
        model(users, items, domains, context).sum().backward()
        self.assertGreater(model.context_shift.weight.grad.abs().sum().item(), 0)

    def test_replay_history_excludes_only_earlier_events(self):
        rows = [event(1, item='x'), event(2, item='y'), event(3, item='z'), event(4, item='x')]
        dataset = {'user_mapping': {'a': 0}, 'item_mapping': {d: {'x': 0, 'y': 1, 'z': 2} for d in DOMAINS},
                   'domain_users': {d: [0] for d in DOMAINS},
                   'pairs': {'train': {'food': [(0, 0)], 'fitness': [], 'media': []}}}
        training, queries, repeats = final_study.build_stream(rows, dataset,
            {'train_end': rows[0]['timestamp'], 'validation_end': rows[1]['timestamp']})
        self.assertEqual(len(training['food']), 1)
        self.assertEqual(queries['validation']['food'][0]['excluded'], [0])
        self.assertEqual(queries['test']['food'][0]['excluded'], [0, 1])
        self.assertEqual(queries['test']['food'][0]['targets'], [2])
        self.assertEqual(repeats['test']['food'], 1)

    def test_deterministic_negatives_keep_positive_context(self):
        training = {d: [(0, 0, *([i + .5] * CONTEXT_DIM))] for i, d in enumerate(DOMAINS)}
        dataset = {'pairs': {'train': {d: [(0, 0)] for d in DOMAINS}},
                   'item_mapping': {d: {str(i): i for i in range(6)} for d in DOMAINS}}
        result = final_study.sampled_training(training, dataset, {'negative_samples': 4}, 42)
        self.assertEqual(result, final_study.sampled_training(training, dataset, {'negative_samples': 4}, 42))
        for index, domain in enumerate(DOMAINS):
            self.assertTrue(all(row[4:] == tuple([index + .5] * CONTEXT_DIM) for row in result[domain]))
            self.assertTrue(all(row[1] != 0 for row in result[domain] if row[3] == 0))

    def test_metrics_match_existing_foundation(self):
        for top, targets in [([2, 1, 3], [1, 3]), ([], [1]), ([3, 2, 1], [4])]:
            expected = foundation('metrics', [{'rankedItems': list(map(str, top)),
                                               'relevantItems': list(map(str, targets)), 'k': 10}])[0]
            for metric, value in final_study.ranking_metrics(top, targets).items():
                self.assertAlmostEqual(value, expected[metric])

    def test_paired_bootstrap_requires_same_users(self):
        before = {str(u): dict.fromkeys(final_study.METRICS, 0.0) for u in range(3)}
        after = {str(u): dict.fromkeys(final_study.METRICS, .1) for u in range(3)}
        result = final_study.paired_bootstrap(before, after)
        self.assertEqual(result, final_study.paired_bootstrap(before, after))
        np.testing.assert_allclose(result['ndcg']['ci95'], [.1, .1])
        with self.assertRaises(ValueError):
            final_study.paired_bootstrap(before, {'other': after['0']})

    def test_training_selects_validation_and_stops_at_budget(self):
        dataset = {'user_mapping': {'a': 0}, 'item_mapping': {d: {str(i): i for i in range(6)} for d in DOMAINS},
                   'domain_users': {d: [0] for d in DOMAINS},
                   'pairs': {'train': {d: [(0, 0)] for d in DOMAINS}}}
        training = {d: [(0, 0, *([0.] * CONTEXT_DIM))] for d in DOMAINS}
        config = dict(seed=42, model_variant='shared_domain_specific', embedding_dim=2,
                      mlp_layers=[4, 2], domain_dim=2, learning_rate=.001, batch_size=3,
                      max_optimizer_steps=4, validation_interval_steps=2, negative_samples=2, k=10)
        validation = {d: [{'user': 0, 'targets': [1], 'excluded': [0], 'context': [0.] * CONTEXT_DIM}] for d in DOMAINS}
        with tempfile.TemporaryDirectory() as directory, patch.object(final_study, 'ROOT', Path(directory)):
            _, result = final_study.train_model('C', dataset, training, validation, config, Path(directory))
        self.assertEqual(sum(result['domain_draws'].values()), 12)
        self.assertEqual(len(result['history']), 2)
        self.assertIn(result['selected_step'], [2, 4])


if __name__ == '__main__':
    unittest.main()
