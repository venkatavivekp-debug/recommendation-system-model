import json
import math
import tempfile
import unittest
from pathlib import Path

import torch

from data import foundation, known_items, prepare, sample_examples
from evaluate import evaluate
from model import NeuMF
from train import make_loader, run
from context import cold_start_audit, query_contexts, temporal_context, warm_rows


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'u.data'
        self.path.write_text(''.join(
            f'{user}\t{(user * 2 + step) % 12}\t4\t{100000 + step * 10}\n'
            for step in range(8) for user in range(4)
        ))

    def test_mapping_and_temporal_split(self):
        dataset = prepare(self.path)
        self.assertEqual(sorted(dataset['user_mapping'].values()), list(range(4)))
        self.assertEqual(sorted(dataset['item_mapping'].values()), list(range(len(dataset['item_mapping']))))
        self.assertTrue(all(item.startswith('media:') for item in dataset['item_mapping']))
        train, validation, test = (dataset['splits'][name] for name in ('train', 'validation', 'test'))
        self.assertLess(max(r['timestamp'] for r in train), min(r['timestamp'] for r in validation))
        self.assertLess(max(r['timestamp'] for r in validation), min(r['timestamp'] for r in test))
        self.assertEqual(set(dataset['item_mapping']), {r['itemId'] for r in train})

    def test_threshold_and_cold_coverage(self):
        with self.path.open('a') as target:
            target.write('new-user\tnew-movie\t5\t999999\n0\tlow-rated\t2\t999999\n')
        dataset = prepare(self.path)
        self.assertNotIn('new-user', dataset['user_mapping'])
        self.assertNotIn('media:new-movie', dataset['item_mapping'])
        self.assertEqual(dataset['coverage']['test']['excluded_cold_positives'], 1)
        self.assertFalse(any(r['itemId'] == 'media:low-rated' for rows in dataset['splits'].values() for r in rows))
        with self.assertRaises(ValueError):
            prepare(self.path, threshold=6)

    def test_negative_sampling(self):
        positives = [(0, 0), (1, 1)]
        known = known_items(positives + [(0, 2)])
        examples = sample_examples(positives, known, 8, 3, seed=42)
        self.assertEqual(examples, sample_examples(positives, known, 8, 3, seed=42))
        self.assertNotEqual(examples, sample_examples(positives, known, 8, 3, seed=43))
        self.assertEqual(len(examples), 8)
        self.assertTrue(all(item not in known[user] for user, item, label in examples if label == 0))

    def test_model_shape_and_gradients(self):
        model = NeuMF(4, 12)
        logits = model(torch.tensor([0, 1, 2]), torch.tensor([3, 4, 5]))
        self.assertEqual(tuple(logits.shape), (3,))
        logits.sum().backward()
        self.assertTrue(all(p.grad is not None for p in model.parameters()))

    def test_temporal_context_uses_utc_without_fitting(self):
        features = temporal_context('2026-09-28T06:00:00Z')
        for actual, expected in zip(features, [1, 0, 0, 1]):
            self.assertAlmostEqual(actual, expected)
        self.assertEqual(features, temporal_context('2026-09-28T02:00:00-04:00'))
        with self.assertRaises(ValueError):
            temporal_context('2026-09-28T06:00:00')

    def test_positive_and_negatives_share_context_and_sampling(self):
        positives = [(0, 0), (1, 1)]
        known = known_items(positives)
        contexts = [temporal_context('2026-09-28T06:00:00Z'), temporal_context('2026-09-29T18:00:00Z')]
        examples = sample_examples(positives, known, 8, 3, 42, contexts)
        self.assertEqual([row[:3] for row in examples], sample_examples(positives, known, 8, 3, 42))
        for index, row in enumerate(examples):
            self.assertEqual(list(row[3:]), contexts[index // 4])
        users, items, context, labels = next(iter(make_loader(examples, 8, 42)))
        self.assertEqual(context.shape, (8, 4))
        self.assertEqual(users.shape, items.shape)
        self.assertEqual(labels.shape, (8,))

    def test_context_extension_preserves_initial_baseline_weights(self):
        torch.manual_seed(42)
        baseline = NeuMF(4, 12)
        torch.manual_seed(42)
        context_model = NeuMF(4, 12, context_dim=4)
        users, items = torch.tensor([0, 1]), torch.tensor([2, 3])
        context = torch.ones(2, 4)
        torch.testing.assert_close(baseline(users, items), context_model(users, items, context))
        self.assertEqual(sum(p.numel() for p in context_model.parameters()) -
                         sum(p.numel() for p in baseline.parameters()), 128)
        context_model(users, items, context).sum().backward()
        self.assertGreater(context_model.mlp[0].weight.grad[:, -4:].abs().sum().item(), 0)
        with self.assertRaises(ValueError):
            context_model(users, items)

    def test_ranking_shares_one_query_context_without_changing_mappings(self):
        dataset = prepare(self.path)
        mappings = (dict(dataset['user_mapping']), dict(dataset['item_mapping']))
        expected = query_contexts(dataset)
        model = NeuMF(len(mappings[0]), len(mappings[1]), context_dim=4)
        calls = []
        def capture(module, args):
            users, items, context = args
            calls.append(int(users[0]))
            torch.testing.assert_close(context, torch.tensor(expected[int(users[0])]).expand(len(items), -1))
        hook = model.register_forward_pre_hook(capture)
        evaluate(model, dataset)
        hook.remove()
        self.assertEqual(sorted(calls), sorted(expected))
        self.assertEqual(mappings, (dataset['user_mapping'], dataset['item_mapping']))
        for user in expected:
            first = min(r['timestamp'] for r in warm_rows(dataset, 'test')
                        if dataset['user_mapping'][r['userId']] == user)
            self.assertEqual(expected[user], temporal_context(first))

    def test_cold_start_categories_are_disjoint(self):
        dataset = {'user_mapping': {'u': 0}, 'item_mapping': {'i': 0}, 'splits': {'test': [
            {'userId': user, 'itemId': item} for user in ('u', 'cold') for item in ('i', 'cold')
        ]}}
        self.assertEqual(cold_start_audit(dataset)['test'],
                         {'unseen_user_only': 1, 'unseen_item_only': 1, 'both_unseen': 1, 'warm': 1})

    def test_existing_metrics(self):
        metrics = foundation('metrics', [
            {'rankedItems': ['b', 'a', 'd'], 'relevantItems': ['b', 'd'], 'k': 3},
            {'rankedItems': ['a'], 'relevantItems': [], 'k': 3},
        ])
        self.assertEqual(metrics[0]['precision'], 2 / 3)
        self.assertEqual(metrics[0]['recall'], 1)
        self.assertAlmostEqual(metrics[0]['ndcg'], (1 + 1 / math.log2(4)) / (1 + 1 / math.log2(3)))
        self.assertEqual(metrics[1], {'precision': 0, 'recall': 0, 'ndcg': 0})

    def test_evaluation_excludes_history_and_counts_popularity_from_train(self):
        dataset = {
            'pairs': {'train': [(0, 0), (1, 1)], 'validation': [(0, 2)], 'test': [(0, 1)]},
            'item_mapping': {'media:0': 0, 'media:1': 1, 'media:2': 2},
        }
        result = evaluate(NeuMF(2, 3), dataset, k=1)
        for metrics in result['metrics'].values():
            self.assertEqual(metrics, {'precision_at_k': 1, 'recall_at_k': 1, 'ndcg_at_k': 1})

    def test_tiny_training_checkpoint_and_repeatability(self):
        config = {
            'ratings': str(self.path), 'output': self.temp.name, 'threshold': 4,
            'train_ratio': 0.7, 'validation_ratio': 0.15, 'seed': 42, 'epochs': 2,
            'batch_size': 16, 'learning_rate': 0.001, 'embedding_dim': 4,
            'hidden_sizes': [8, 4], 'negatives': 2, 'k': 3,
        }
        for context in (False, True):
            with self.subTest(context=context):
                directory, first = run({**config, 'context': context})
                other, second = run({**config, 'context': context})
                self.assertNotEqual(directory, other)
                self.assertEqual(first['history'], second['history'])
                self.assertEqual(first['metrics'], second['metrics'])
                checkpoint = torch.load(directory / 'best.pt', weights_only=True)
                model = NeuMF(**checkpoint['architecture'])
                model.load_state_dict(checkpoint['state_dict'])
                dataset = json.loads((directory / 'data.json').read_text())
                self.assertEqual(evaluate(model, dataset, 3)['metrics'], first['metrics'])
                self.assertTrue((directory / 'result.json').exists())


if __name__ == '__main__':
    unittest.main()
