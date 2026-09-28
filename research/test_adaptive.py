import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch

from adaptive import rank, read_ratings, replay, scores, update, user_vectors
from compare_context_adaptive import assert_matched, verify_initialization
from context import temporal_context
from data import known_items, prepare, sample_examples
from model import NeuMF
from train import run


class AdaptiveTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        torch.set_num_threads(1)
        torch.use_deterministic_algorithms(True)
        self.model = NeuMF(2, 30).eval().requires_grad_(False)
        self.data = {'user_mapping': {'u': 0, 'v': 1},
                     'item_mapping': {f'media:{i}': i for i in range(30)},
                     'coverage': {'validation': {'last_timestamp': '1970-01-01T00:01:40Z'}}}
        self.ratings = [{'user': 'u', 'item': f'media:{i}', 'rating': 4, 'timestamp': i + 1}
                        for i in range(5)]
        self.ratings += [{'user': 'u', 'item': f'media:{i}', 'rating': [5, 1, 3][i % 3],
                          'timestamp': 101 + (i - 5) // 2} for i in range(5, 30)]

    def test_only_local_user_vectors_change_with_bounded_step(self):
        before = copy.deepcopy(self.model.state_dict())
        vectors = user_vectors(self.model, 0)
        other_before = scores(self.model, 1, [2, 3]).detach().clone()
        updated, delta, _ = update(self.model, 0, vectors, [(2, 5)], gradient_clip=0.001)
        self.assertGreater(delta, 0)
        self.assertLessEqual(delta, 0.05 * 0.001 + 1e-8)
        for old, new in zip(vectors, updated):
            self.assertFalse(torch.equal(old, new))
        for name, value in self.model.state_dict().items():
            self.assertTrue(torch.equal(value, before[name]), name)
        self.assertTrue(all(p.grad is None for p in self.model.parameters()))
        torch.testing.assert_close(other_before, scores(self.model, 1, [2, 3]), rtol=0, atol=0)
        self.assertFalse(torch.equal(scores(self.model, 0, [2], vectors), scores(self.model, 0, [2], updated)))

    def test_positive_and_low_preference_updates_have_opposite_directions(self):
        vectors = user_vectors(self.model, 0)
        positive, _, _ = update(self.model, 0, vectors, [(2, 5)])
        negative, _, _ = update(self.model, 0, vectors, [(2, 1)])
        neutral, delta, _ = update(self.model, 0, vectors, [(2, 3)])
        baseline = scores(self.model, 0, [2], vectors).item()
        self.assertGreater(scores(self.model, 0, [2], positive).item(), baseline)
        self.assertLess(scores(self.model, 0, [2], negative).item(), baseline)
        self.assertLess(torch.dot(torch.cat([a - b for a, b in zip(positive, vectors)]),
                                  torch.cat([a - b for a, b in zip(negative, vectors)])).item(), 0)
        self.assertIs(neutral, vectors)
        self.assertEqual(delta, 0)

    def test_timestamp_group_predicted_before_update_and_future_does_not_change_prefix(self):
        calls = []
        def observed_rank(*args, **kwargs):
            calls.append('predict')
            return rank(*args, **kwargs)
        def observed_update(*args, **kwargs):
            calls.append('update')
            return update(*args, **kwargs)
        with patch('adaptive.rank', side_effect=observed_rank), patch('adaptive.update', side_effect=observed_update):
            first = replay(self.model, self.data, self.ratings[:7])
        self.assertEqual(calls, ['predict', 'predict', 'update', 'predict'])
        full = replay(self.model, self.data, self.ratings)
        self.assertEqual(first['groups'], full['groups'][:1])
        self.assertEqual(full['groups'][0]['candidate_count'], 25)
        self.assertEqual(full['groups'][1]['candidate_count'], 23)
        changed = copy.deepcopy(self.ratings)
        changed[5]['rating'], changed[6]['rating'] = 1, 5
        modified = replay(self.model, self.data, changed)
        self.assertEqual(full['groups'][0]['adaptive_top_before'], modified['groups'][0]['adaptive_top_before'])
        self.assertEqual([r['score_before'] for r in full['groups'][0]['feedback']],
                         [r['score_before'] for r in modified['groups'][0]['feedback']])

    def test_static_control_and_deterministic_replay(self):
        before = copy.deepcopy(self.model.state_dict())
        first = replay(self.model, self.data, self.ratings)
        second = replay(self.model, self.data, self.ratings)
        self.assertEqual({k: v for k, v in first.items() if k != 'timing'},
                         {k: v for k, v in second.items() if k != 'timing'})
        seen = set(range(5))
        for group in first['groups']:
            static, _ = rank(self.model, 0, [i for i in range(30) if i not in seen])
            self.assertEqual(group['static_top'], [f'media:{i}' for i in static[:10]])
            seen.update(int(row['item'].split(':')[1]) for row in group['feedback'])
        for name, value in self.model.state_dict().items():
            self.assertTrue(torch.equal(value, before[name]), name)
        self.assertEqual(first['coverage']['warm_events'], 25)
        for depth, result in first['history_depths'].items():
            self.assertEqual(result['users'], 1)
            self.assertGreaterEqual(result['actual_history_counts']['u'], int(depth))
            self.assertEqual(result['matched_users'], 1)

    def test_raw_feedback_and_empty_coverage(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ratings'
            path.write_text('1\t2\t1\t10\n1\t3\t3\t11\n1\t4\t5\t12\n')
            rows = read_ratings(path)
            self.assertEqual([row['rating'] for row in rows], [1, 3, 5])
            self.assertEqual(rows[0]['item'], 'media:2')
        result = replay(self.model, self.data, [])
        self.assertEqual(result['coverage']['warm_events'], 0)
        self.assertIsNone(result['metrics']['adaptive']['ndcg'])

    def test_replay_training_masks_never_use_test_positives(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ratings'
            path.write_text(''.join(f'{u}\t{(u * 2 + s) % 12}\t4\t{100000 + s * 10}\n'
                                    for s in range(8) for u in range(4)))
            data = prepare(path)
            calls = []
            def capture(positives, known, *args, **kwargs):
                calls.append((positives, copy.deepcopy(known)))
                return sample_examples(positives, known, *args, **kwargs)
            config = {'ratings': str(path), 'output': directory, 'threshold': 4, 'train_ratio': 0.7,
                      'validation_ratio': 0.15, 'seed': 42, 'epochs': 1, 'batch_size': 16,
                      'learning_rate': 0.001, 'embedding_dim': 4, 'hidden_sizes': [8, 4],
                      'negatives': 2, 'k': 3, 'negative_scope': 'train', 'evaluate_test': False}
            with patch('train.sample_examples', side_effect=capture):
                run(config)
            self.assertEqual(calls[0][1], known_items(data['pairs']['train'] + data['pairs']['validation']))
            self.assertEqual(calls[1][1], known_items(data['pairs']['train']))
            examples = sample_examples([(0, 0)], known_items([(0, 0)]), 3, 2)
            self.assertIn((0, 2, 0.0), examples)  # A later positive is still eligible now.

    def context_model(self):
        torch.manual_seed(42)
        model = NeuMF(2, 30, context_dim=4).eval().requires_grad_(False)
        # Exercise nonzero context weights, as in a trained checkpoint.
        with torch.no_grad():
            model.mlp[0].weight[:, -4:].fill_(0.1)
        return model

    def test_context_initialization_and_parameter_isolation(self):
        verify_initialization({'user_count': 2, 'item_count': 30}, 42)
        model = self.context_model()
        original = copy.deepcopy(model.state_dict())
        vectors = user_vectors(model, 0)
        context = temporal_context('1998-04-01T06:00:00Z')
        other = scores(model, 1, [2, 3], context=context).detach().clone()
        updated, delta, _ = update(model, 0, vectors, [(2, 5)], context=context)
        self.assertGreater(delta, 0)
        self.assertLessEqual(delta, 0.05 + 1e-8)
        self.assertTrue(all(not torch.equal(a, b) for a, b in zip(vectors, updated)))
        self.assertTrue(all(p.grad is None for p in model.parameters()))
        for name, value in model.state_dict().items():
            self.assertTrue(torch.equal(value, original[name]), name)
        torch.testing.assert_close(other, scores(model, 1, [2, 3], context=context), rtol=0, atol=0)
        self.assertFalse(torch.equal(scores(model, 0, [2], vectors, context),
                                     scores(model, 0, [2], updated, context)))

    def test_context_query_broadcast_causality_and_static_determinism(self):
        model = self.context_model()
        original = copy.deepcopy(model.state_dict())
        ratings = copy.deepcopy(self.ratings)
        for row in ratings[5:]:
            row['timestamp'] = 101 + (row['timestamp'] - 101) * 90000
        queries = []
        def capture(module, args):
            users, items, context = args
            self.assertEqual(context.shape, (len(items), 4))
            torch.testing.assert_close(context, context[:1].expand(len(items), -1), rtol=0, atol=0)
            queries.append(context[0].tolist())
        hook = model.register_forward_pre_hook(capture)
        first = replay(model, self.data, ratings)
        hook.remove()
        expected = []
        seen = set(range(5))
        for group in first['groups']:
            context = temporal_context(group['timestamp'])
            expected.extend([torch.tensor(context).tolist()] *
                            (3 + int(any(row['rating'] != 3 for row in group['feedback']))))
            static, _ = rank(model, 0, [i for i in range(30) if i not in seen], context=context)
            self.assertEqual(group['static_top'], [f'media:{i}' for i in static[:10]])
            seen.update(int(row['item'].split(':')[1]) for row in group['feedback'])
        self.assertEqual(queries, expected)
        second = replay(model, self.data, ratings)
        self.assertEqual({k: v for k, v in first.items() if k != 'timing'},
                         {k: v for k, v in second.items() if k != 'timing'})
        prefix = replay(model, self.data, ratings[:7])
        self.assertEqual(prefix['groups'], first['groups'][:1])
        changed = copy.deepcopy(ratings)
        changed[5]['rating'], changed[6]['rating'] = 1, 5
        altered = replay(model, self.data, changed)
        self.assertEqual(first['groups'][0]['adaptive_top_before'], altered['groups'][0]['adaptive_top_before'])
        self.assertEqual([r['score_before'] for r in first['groups'][0]['feedback']],
                         [r['score_before'] for r in altered['groups'][0]['feedback']])
        self.assertTrue(all(torch.equal(v, original[k]) for k, v in model.state_dict().items()))

    def test_four_arms_share_candidates_events_and_evaluation_groups(self):
        plain = replay(self.model, self.data, self.ratings)
        context = replay(self.context_model(), self.data, self.ratings)
        assert_matched(plain, context)
        self.assertEqual([('metrics' in r, r['positive_targets']) for r in plain['groups']],
                         [('metrics' in r, r['positive_targets']) for r in context['groups']])
        for result in (plain, context):
            first = result['groups'][0]
            self.assertEqual(first['static_top'], first['adaptive_top_before'])
        changed = copy.deepcopy(context)
        changed['groups'][0]['candidate_sha256'] = 'different'
        with self.assertRaises(AssertionError):
            assert_matched(plain, changed)
        changed = copy.deepcopy(context)
        changed['groups'][0]['feedback'][0]['rating'] = 1
        with self.assertRaises(AssertionError):
            assert_matched(plain, changed)


if __name__ == '__main__':
    unittest.main()
