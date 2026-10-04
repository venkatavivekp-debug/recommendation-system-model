import copy
import json
import tempfile
import unittest
from collections import Counter

import torch

from data import ROOT, known_items
from multidomain_data import (DOMAINS, ITEM_TYPES, batch_indices, canonical,
                              examples_by_domain, link_users, prepare_multidomain, statistics)
from multidomain_experiment import architecture, evaluate_domains, run, training_blockers
from multidomain_model import MultiDomainNeuMF, VARIANTS


def fixture():
    return [canonical({
        'userId': f'{source}:user:{user}',
        'itemId': f'{domain}:{ITEM_TYPES[domain]}:{(user * 2 + step) % 12}',
        'domain': domain, 'action': 'selected', 'value': 4,
        'timestamp': f'2020-01-{step + 1:02d}T00:00:00Z',
        'context': {'dataset': source, 'synthetic': True},
    }) for domain, source in zip(DOMAINS, ('foodcom', 'fitrec', 'movielens'))
        for step in range(8) for user in range(4)]


class MultiDomainTests(unittest.TestCase):
    def setUp(self):
        self.rows = fixture()
        self.dataset = prepare_multidomain(self.rows)
        self.config = json.loads((ROOT / 'research/multidomain_config.json').read_text())

    def test_namespaces_and_canonical_fields(self):
        self.assertEqual(len({r['userId'] for r in self.rows}), 12)
        self.assertEqual(statistics(self.rows)['users_in_two_or_more_domains'], 0)
        self.assertEqual(self.rows[0]['itemId'], 'food:recipe:0')
        self.assertEqual(self.rows[0]['value'], 4)
        self.assertEqual(self.rows[0]['timestamp'], '2020-01-01T00:00:00+00:00')
        for change in ({'context': None}, {'userId': '0'}, {'itemId': 'media:movie:0'},
                       {'timestamp': '2020-01-01'}, {'value': float('nan')}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                canonical({**self.rows[0], **change})

    def test_linkage_requires_evidence_and_common_cutoffs(self):
        with self.assertRaises(ValueError):
            link_users(self.rows, {'users': {}})
        links = {r['userId']: 'shared:user:' + r['userId'].split(':')[-1] for r in self.rows}
        rows = link_users(self.rows, {'kind': 'synthetic_test', 'evidence': 'unit fixture only', 'users': links})
        self.assertEqual(statistics(rows)['users_in_all_three_domains'], 4)
        with self.assertRaises(ValueError):
            prepare_multidomain(rows)
        self.assertEqual(len(prepare_multidomain(rows, split_scope='global')['user_mapping']), 4)

    def test_ties_and_train_only_mappings(self):
        rows = self.rows + [{**self.rows[0], 'userId': 'foodcom:user:cold',
                            'itemId': 'food:recipe:cold', 'timestamp': '2021-01-01T00:00:00+00:00'}]
        dataset = prepare_multidomain(rows)
        self.assertNotIn('foodcom:user:cold', dataset['user_mapping'])
        self.assertNotIn('food:recipe:cold', dataset['item_mapping']['food'])
        self.assertEqual(dataset['coverage']['test']['food']['excluded_cold_positives'], 1)
        # Boundary ties move into the earlier split: 6/1/1 whole days.
        self.assertEqual([self.dataset['coverage'][s]['food']['positives']
                          for s in ('train', 'validation', 'test')], [24, 4, 4])

    def test_negatives_stay_in_domain_without_mutating_splits(self):
        before = copy.deepcopy(self.dataset)
        for split in ('train', 'validation'):
            examples = examples_by_domain(self.dataset, split, 2, 42)
            self.assertEqual(examples, examples_by_domain(self.dataset, split, 2, 42))
            for index, domain in enumerate(DOMAINS):
                history = self.dataset['pairs']['train'][domain]
                if split == 'validation':
                    history = history + self.dataset['pairs']['validation'][domain]
                known = known_items(history)
                for user, item, actual_domain, label in examples[domain]:
                    self.assertEqual(actual_domain, index)
                    self.assertLess(item, len(self.dataset['item_mapping'][domain]))
                    if not label:
                        self.assertNotIn(item, known[user])
        self.assertEqual(self.dataset, before)
        # Future positives remain eligible: training must not consult test identities.
        examples = examples_by_domain(self.dataset, 'train', 100, 42)
        for domain in DOMAINS:
            negatives = {(u, item) for u, item, _, label in examples[domain] if not label}
            train = set(self.dataset['pairs']['train'][domain])
            self.assertTrue(set(self.dataset['pairs']['test'][domain]) - train <= negatives)

    def test_balancing_and_seed(self):
        examples = {d: list(range(n)) for d, n in zip(DOMAINS, (2, 4, 6))}
        natural = batch_indices(examples, 3, 'natural', 42)
        self.assertEqual(sorted(sum(natural, [])), list(range(12)))
        balanced = batch_indices(examples, 3, 'balanced', 42)
        self.assertEqual(balanced, batch_indices(examples, 3, 'balanced', 42))
        self.assertNotEqual(balanced, batch_indices(examples, 3, 'balanced', 43))
        for batch in balanced:
            self.assertEqual(Counter(0 if i < 2 else 1 if i < 6 else 2 for i in batch), {0: 1, 1: 1, 2: 1})

    def test_three_variants_forward_gradients_and_parameter_counts(self):
        users = torch.tensor([self.dataset['domain_users'][d][0] for d in DOMAINS])
        for variant in VARIANTS:
            model = MultiDomainNeuMF(**architecture(self.dataset, {**self.config, 'model_variant': variant}))
            scores = model(users, torch.zeros(3, dtype=torch.long), torch.arange(3))
            self.assertEqual(scores.shape, (3,))
            scores.sum().backward()
            self.assertTrue(all(p.grad is not None for p in model.parameters()))
            u = len(self.dataset['user_mapping'])
            items = sum(len(v) for v in self.dataset['item_mapping'].values())
            expected = 32 * (u + items) + (4851 if variant == 'independent' else 1757)
            if variant == 'shared_domain_specific':
                expected += 96 * u
            self.assertEqual(sum(p.numel() for p in model.parameters()), expected)

    def test_domain_offsets_are_separate(self):
        model = MultiDomainNeuMF(4, [12] * 3, [list(range(4))] * 3, 'shared_domain_specific')
        self.assertEqual(model.gmf_offset.weight.shape, (12, 16))
        self.assertEqual(model.mlp_offset.weight.shape, (12, 16))
        with torch.no_grad():
            model.gmf_offset.weight[0].fill_(1)
        base = model.core.gmf_user(torch.tensor([0, 0, 0]))
        effective = base + model.gmf_offset(torch.tensor([0, 4, 8]))
        torch.testing.assert_close(effective[1], base[1])
        torch.testing.assert_close(effective[2], base[2])
        torch.testing.assert_close(effective[0], base[0] + 1)

    def test_unknown_indices(self):
        for variant in VARIANTS:
            model = MultiDomainNeuMF(4, [12] * 3, [list(range(4))] * 3, variant)
            for user, item, domain in ((4, 0, 0), (0, 12, 0), (0, 0, 3), (-1, 0, 0)):
                with self.assertRaises(ValueError):
                    model(torch.tensor([user]), torch.tensor([item]), torch.tensor([domain]))

    def test_shared_user_training_is_explicitly_test_only(self):
        links = {r['userId']: 'shared:user:' + r['userId'].split(':')[-1] for r in self.rows}
        rows = link_users(self.rows, {'kind': 'synthetic_test', 'evidence': 'unit fixture only', 'users': links})
        dataset = prepare_multidomain(rows, split_scope='global')
        with tempfile.TemporaryDirectory() as directory:
            _, result = run(dataset, {**self.config, 'output': directory, 'epochs': 1, 'test_only': True})
        self.assertEqual(result['statistics']['users_in_all_three_domains'], 4)
        self.assertEqual(result['purpose'], 'synthetic_integration_test')

    def test_missing_domains_and_synthetic_research_are_blocked(self):
        missing = prepare_multidomain([r for r in self.rows if r['domain'] == 'media'])
        self.assertTrue(training_blockers(missing))
        for dataset in (missing, self.dataset):
            with self.assertRaises(ValueError):
                run(dataset, self.config)

    def test_training_checkpoint_and_repeatability(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {**self.config, 'output': directory, 'epochs': 2, 'batch_size': 16,
                      'negative_samples': 2, 'test_only': True, 'k': 3}
            for variant in VARIANTS:
                for balancing in ('natural', 'balanced'):
                    config.update(model_variant=variant, domain_balancing=balancing)
                    path, result = run(self.dataset, config)
                    checkpoint = torch.load(path / 'best.pt', weights_only=True)
                    model = MultiDomainNeuMF(**checkpoint['architecture'])
                    model.load_state_dict(checkpoint['state_dict'])
                    self.assertEqual(evaluate_domains(model, self.dataset, 3)[0], result['domains'])
                    self.assertEqual(result['purpose'], 'synthetic_integration_test')
                    other, repeated = run(self.dataset, config)
                    self.assertEqual(result['domains'], repeated['domains'])
                    self.assertEqual((path / 'history.json').read_text(), (other / 'history.json').read_text())
                    self.assertEqual(set(p.name for p in path.iterdir()), {'best.pt', 'config.json', 'metrics.json', 'history.json'})


if __name__ == '__main__':
    unittest.main()
