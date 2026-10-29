import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch

import controlled_extension as extension
from final_study import evaluate, ranking_metrics
from multidomain_data import DOMAINS, batch_indices
from training import PROTOCOL, sample_examples


class BPRTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)
        torch.manual_seed(42)
        self.args = dict(user_count=3, item_counts=[7] * 3, domain_users=[[0, 1, 2]] * 3,
                         embedding_dim=2)
        self.model = extension.IndependentBPR(**self.args)
        self.users = torch.tensor([0, 1, 2])
        self.positive = torch.tensor([0, 1, 2])
        self.negative = torch.tensor([3, 4, 5])
        self.domains = torch.tensor([0, 1, 2])

    def test_objective_matches_hand_computed_pairwise_loss_and_sampled_l2(self):
        with torch.no_grad():
            for users, items in zip(self.model.users, self.model.items):
                users.weight.fill_(.25)
                items.weight.copy_(torch.arange(14).reshape(7, 2) / 10.)
        p = torch.full((3, 2), .25)
        qi = torch.stack([self.model.items[d].weight[i] for d, i in enumerate(self.positive)])
        qj = torch.stack([self.model.items[d].weight[i] for d, i in enumerate(self.negative)])
        margin = (p * (qi - qj)).sum(1)
        penalty = (p.square().sum(1) + qi.square().sum(1) + qj.square().sum(1)).mean()
        expected = torch.nn.functional.softplus(-margin).mean() + .5 * .01 * penalty
        actual = self.model.loss(self.users, self.positive, self.negative, self.domains, .01)
        torch.testing.assert_close(actual, expected)
        torch.testing.assert_close(self.model(self.users, self.positive, self.domains), (p * qi).sum(1))
        for regularization in (-1., float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                self.model.loss(self.users, self.positive, self.negative, self.domains, regularization)

    def test_finite_gradients_improve_margin_and_are_domain_private(self):
        inputs = (self.users[:1], self.positive[:1], self.negative[:1], self.domains[:1])
        before = {k: v.clone() for k, v in self.model.state_dict().items()}
        optimizer = torch.optim.Adam(self.model.parameters(), lr=.001)
        initial = self.model.loss(*inputs, .0001).item()
        self.model.loss(*inputs, .0001).backward()
        for domain in range(3):
            for table in (self.model.users[domain], self.model.items[domain]):
                if domain == 0:
                    self.assertTrue(torch.isfinite(table.weight.grad).all())
                    self.assertGreater(table.weight.grad.abs().sum().item(), 0)
                else:
                    self.assertIsNone(table.weight.grad)
        optimizer.step()
        self.assertLess(self.model.loss(*inputs, .0001).item(), initial)
        for name, value in self.model.state_dict().items():
            if name.startswith(('users.1', 'users.2', 'items.1', 'items.2')):
                self.assertTrue(torch.equal(value, before[name]))

    def test_seed_determinism_checkpoint_roundtrip_and_input_rejection(self):
        torch.manual_seed(42)
        repeat = extension.IndependentBPR(**self.args)
        self.assertTrue(all(torch.equal(v, repeat.state_dict()[k]) for k, v in self.model.state_dict().items()))
        buffer = io.BytesIO()
        torch.save(self.model.state_dict(), buffer)
        buffer.seek(0)
        torch.manual_seed(43)
        restored = extension.IndependentBPR(**self.args)
        self.assertFalse(torch.equal(restored.users[0].weight, self.model.users[0].weight))
        restored.load_state_dict(torch.load(buffer, weights_only=True))
        torch.testing.assert_close(restored(self.users, self.positive, self.domains),
                                   self.model(self.users, self.positive, self.domains), rtol=0, atol=0)
        for users, items, domains in ((torch.tensor([-1]), torch.tensor([0]), torch.tensor([0])),
                                      (torch.tensor([0]), torch.tensor([7]), torch.tensor([0])),
                                      (torch.tensor([0]), torch.tensor([0]), torch.tensor([3]))):
            with self.assertRaises(ValueError):
                self.model(users, items, domains)
        restricted = extension.IndependentBPR(3, [7] * 3, [[2, 0], [1], [2]])
        with self.assertRaises(ValueError):
            restricted(torch.tensor([1]), torch.tensor([0]), torch.tensor([0]))
        with self.assertRaises(ValueError):
            extension.IndependentBPR(3, [7] * 3, [[0, 0], [1], [2]])

    def test_expanded_capacity_matches_preregistered_count(self):
        spec, _, protocol = extension.load_spec('BPR', 42)
        model = extension.IndependentBPR(7016, [44311, 49261, 68471], [list(range(7016))] * 3,
                                        embedding_dim=protocol.embedding_dim)
        self.assertEqual(sum(p.numel() for p in model.parameters()), spec['bpr']['parameter_count'])
        self.assertEqual(len(list(model.parameters())), 6)

    def test_grouped_sampler_matches_canonical_draws_and_balanced_exposure(self):
        positives, known = [(0, 0), (1, 2)], {0: {0, 1}, 1: {2}}
        for seed in (42, 43, 44):
            groups = list(extension.sample_groups(positives, known, 7, 4, seed))
            expected = list(sample_examples(positives, known, 7, 4, seed))
            self.assertEqual(groups, list(extension.sample_groups(positives, known, 7, 4, seed)))
            for index, (u, i, *negatives) in enumerate(groups):
                self.assertEqual((u, i, 1.), expected[index * 5])
                self.assertEqual(negatives, [r[1] for r in expected[index * 5 + 1:index * 5 + 5]])
                self.assertEqual(len(set(negatives)), 4)
                self.assertFalse(set(negatives) & known[u])
        examples = {d: [(*g, index) for g in groups] for index, d in enumerate(DOMAINS)}
        values = torch.tensor([r for d in DOMAINS for r in examples[d]])
        batch = values[batch_indices(examples, 102, 'balanced', 43, 1)[0]]
        u, i, j, d = extension.bpr_batch(batch)
        self.assertEqual(len(u), 408)
        self.assertEqual(torch.bincount(d).tolist(), [136, 136, 136])
        self.assertTrue(all(int(negative) not in known[int(user)] for user, negative in zip(u, j)))
        with self.assertRaises(ValueError):
            list(extension.sample_groups([(0, 0)], {0: {0, 1, 2, 3}}, 7, 4, 42))

    def test_existing_evaluator_preserves_full_catalog_ties_exclusions_and_user_macro(self):
        for parameter in self.model.parameters():
            parameter.data.zero_()
        dataset = dict(item_mapping={d: {str(i): i for i in range(7)} for d in DOMAINS},
                       pairs={'train': {d: [(0, 0), (1, 0)] for d in DOMAINS}})
        queries = {d: [dict(user=0, excluded=[0], targets=[1, 2], context=[0.]),
                       dict(user=0, excluded=[0, 1, 2], targets=[3], context=[0.]),
                       dict(user=1, excluded=[0], targets=[6], context=[0.])] for d in DOMAINS}
        domains, macro = evaluate(self.model, dataset, queries, k=2)
        first = ranking_metrics([1, 2], [1, 2], 2)
        second = ranking_metrics([3, 4], [3], 2)
        for metric in ('precision', 'recall', 'ndcg'):
            self.assertAlmostEqual(macro[metric], (first[metric] + second[metric]) / 4)
            self.assertAlmostEqual(domains['food']['per_user']['0'][metric],
                                   (first[metric] + second[metric]) / 2)
        self.assertEqual(domains['food']['evaluated_users'], 2)

    def test_synthetic_fit_schedule_earliest_tie_train_only_and_no_test_access(self):
        dataset = dict(user_mapping={'u': 0}, item_mapping={d: {str(i): i for i in range(6)} for d in DOMAINS},
            domain_users={d: [0] for d in DOMAINS}, pairs={'train': {d: [(0, 0)] for d in DOMAINS}})
        protocol = PROTOCOL._replace(max_optimizer_steps=3, validation_steps=(1, 3), batch_size=3, embedding_dim=2)
        validation = object()
        domains = {d: {'metrics': {'precision': .1, 'recall': .2, 'ndcg': .3}} for d in DOMAINS}
        settings = {'initialization_std': .01, 'regularization': .0001}
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(extension, 'evaluate', return_value=(domains, {'ndcg': .3})) as evaluator, \
                patch.object(extension.training, 'sample_examples', wraps=sample_examples) as sampler:
            records = []
            for name in ('first', 'repeat'):
                directory = Path(tmp) / name
                records.append(extension.fit_bpr(42, dataset, validation, protocol, settings, directory,
                                                {'configuration': protocol._asdict()}))
                checkpoint = torch.load(directory / 'selected.pt', weights_only=True)
                restored = extension.IndependentBPR(**checkpoint['architecture'])
                restored.load_state_dict(checkpoint['state_dict'])
            with self.assertRaises(FileExistsError):
                extension.fit_bpr(42, dataset, validation, protocol, settings, directory, {})
        self.assertEqual(evaluator.call_count, 4)
        self.assertTrue(all(call.args[2] is validation for call in evaluator.call_args_list))
        self.assertTrue(all(call.args[:3] == ([(0, 0)], {0: {0}}, 6) for call in sampler.call_args_list))
        self.assertEqual(records[0]['selected_step'], 1)
        self.assertEqual([r['step'] for r in records[0]['history']], [1, 3])
        self.assertEqual(records[0]['positive_anchor_draws'], 9)
        self.assertEqual(records[0]['triple_draws'], 36)
        self.assertEqual(records[0]['sampling_sha256'], records[1]['sampling_sha256'])
        self.assertNotIn('test', records[0])


class ExtensionGateTests(unittest.TestCase):
    def test_only_nine_fits_and_exact_original_replication_configuration(self):
        for model, seed in extension.AUTHORIZED_RUNS:
            spec, original, protocol = extension.load_spec(model, seed)
            actual = json.loads(json.dumps(protocol._asdict()))
            expected = dict(original['configuration'], seeds=[42, 43, 44])
            if model == 'BPR':
                expected['batch_size'] = 102
                self.assertEqual(spec['bpr']['embedding_dim'], actual['embedding_dim'])
                self.assertEqual(spec['bpr']['learning_rate'], actual['learning_rate'])
                self.assertEqual(spec['bpr']['max_optimizer_steps'], actual['max_optimizer_steps'])
                self.assertEqual(spec['bpr']['negative_samples_per_anchor'], actual['negative_samples'])
                self.assertEqual(spec['bpr']['positive_anchor_draws'], 102 * 12486)
                self.assertEqual(spec['bpr']['triple_draws'], 408 * 12486)
            self.assertEqual(actual, expected)
            self.assertEqual(list(extension.training.validation_schedule(protocol)), spec['validation_steps'])
        for model, seed in (('A', 42), ('B', 42), ('C', 42), ('D', 42), ('D_FIXED', 42), ('BPR', 45)):
            with self.assertRaises(ValueError):
                extension.load_spec(model, seed)

    def test_default_is_read_only_and_abc_delegates_to_original_trainer_without_test(self):
        spec, original, protocol = extension.load_spec('A', 43)
        queries = {'validation': object(), 'test': object()}
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(extension, 'load_spec', return_value=(spec, original, protocol)), \
                patch.object(extension, 'load_benchmark', return_value=({}, queries, original['cutoffs'], {})), \
                patch.object(extension.training, 'provenance', return_value=dict(cohort_hash='c',
                    split_fingerprint='s', candidate_fingerprint='q')), \
                patch.object(extension.training, 'run', return_value={'selected_step': 2497}) as trainer, \
                patch.object(extension, 'fit_bpr') as bpr:
            path = Path(tmp) / 'protocol.json'
            path.write_text('{}')
            source = Path(tmp) / 'research/controlled_extension.py'
            source.parent.mkdir()
            source.write_bytes(Path(extension.__file__).read_bytes())
            before = set(Path(tmp).rglob('*'))
            with patch.object(extension, 'ROOT', Path(tmp)), \
                    patch.object(extension, 'SPEC_PATH', path), \
                    patch.object(extension.subprocess, 'check_output', return_value=''):
                result = extension.execute_run('A', 43)
                self.assertIn('no model constructed', result['preflight'])
                self.assertEqual(set(Path(tmp).rglob('*')), before)
                trainer.assert_not_called()
                bpr.assert_not_called()
                result = extension.execute_run('A', 43, execute=True)
                self.assertFalse(trainer.call_args.kwargs['evaluate_test'])
                self.assertIs(trainer.call_args.kwargs['protocol'], protocol)
                self.assertIs(trainer.call_args.args[3], queries)
                self.assertFalse(result['test_evaluated'])
                output = Path(tmp) / 'A_training_seed43.json'
                saved = output.read_bytes()
                with self.assertRaises(FileExistsError):
                    extension.execute_run('A', 43, execute=True)
                self.assertEqual(output.read_bytes(), saved)
                # Exercise the run-directory guard without an output-file guard.
                output.unlink()
                directory = Path(tmp) / 'research/runs/controlled_extension/A_seed43'
                directory.mkdir(parents=True)
                checkpoint = directory / 'selected.pt'
                checkpoint.write_bytes(b'isolated checkpoint fixture')
                with self.assertRaises(FileExistsError):
                    extension.execute_run('A', 43, execute=True)
                self.assertEqual(checkpoint.read_bytes(), b'isolated checkpoint fixture')
                self.assertFalse(output.exists())
                trainer.assert_called_once()
                bpr.assert_not_called()

    def test_prepared_hash_mismatch_stops_before_loading_or_scoring(self):
        with tempfile.TemporaryDirectory() as tmp:
            prepared, cohort = Path(tmp) / 'prepared.pt', Path(tmp) / 'cohort.json'
            prepared.write_bytes(b'corrupted')
            cohort.write_text('{}')
            with patch.object(extension, 'ROOT', Path(tmp)), patch.object(extension.torch, 'load') as load:
                with self.assertRaisesRegex(ValueError, 'Frozen prepared'):
                    extension.load_benchmark(dict(prepared_path='prepared.pt', prepared_sha256='wrong',
                        cohort_manifest='cohort.json'), {'cohort_hash': 'wrong'})
                load.assert_not_called()


if __name__ == '__main__':
    unittest.main()
