import io
import json
import random
import tempfile
import tracemalloc
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

from coverage_tail_verification import hand_metrics, target_rank
from final_study import ranking_metrics
from data import sample_examples as historical_samples
from training import PROTOCOL, sample_examples
from multidomain_model import SelectiveNeuMF
import training


class FoundationTests(unittest.TestCase):
    def test_exact_rank_uses_frozen_index_tie_break(self):
        scores = np.array([.5, .7, .5, -np.inf, .2])
        self.assertEqual(target_rank(scores, 0), 2)
        self.assertEqual(target_rank(scores, 2), 3)
        self.assertEqual(target_rank(scores, 4), 4)
        with self.assertRaises(ValueError):
            target_rank(scores, 3)

    def test_independent_metric_formula_for_hits_and_misses(self):
        for rank in (1, 2, 5, 10, 11, 100):
            self.assertEqual(hand_metrics(rank), ranking_metrics(list(range(10)), [rank - 1]))

    def test_sampler_matches_historical_draws_without_complements(self):
        rng = random.Random(2)
        for size in (10, 40, 1000):
            known = {u: set(rng.sample(range(size), size // 2)) for u in range(4)}
            positives = [(u, i) for u, items in known.items() for i in sorted(items)]
            for seed in (42, 43, 44):
                actual = list(sample_examples(positives, known, size, seed=seed))
                self.assertEqual(actual, list(sample_examples(positives, known, size, seed=seed)))
                self.assertEqual(actual, historical_samples(positives, known, size, seed=seed))
                self.assertEqual(len(actual), len(positives) * 5)
                self.assertTrue(all(0 <= i < size and (label or i not in known[u]) for u, i, label in actual))

    def test_distribution_and_sparse_memory(self):
        counts = Counter(i for _, i, label in sample_examples([(0, 0)] * 5000, {0: {0}}, 11) if not label)
        self.assertEqual(set(counts), set(range(1, 11)))
        self.assertTrue(all(1800 < n < 2200 for n in counts.values()))
        tracemalloc.start()
        try:
            rows = list(sample_examples([(0, 0)], {0: {0}}, 10_000_000))
            self.assertEqual(len(rows), 5)
            self.assertLess(tracemalloc.get_traced_memory()[1], 1_000_000)
        finally:
            tracemalloc.stop()

    def test_dense_catalog_fails_instead_of_changing_negative_count(self):
        with self.assertRaises(ValueError):
            list(sample_examples([(0, 0)], {0: {0, 1}}, 5))
        with self.assertRaises(AttributeError):
            PROTOCOL.batch_size = 1

    def test_future_entry_is_read_only_unless_explicitly_executed(self):
        frozen = json.loads((training.ROOT / 'research/results/final_study/protocol.json').read_text())
        for field in ('batch_size', 'learning_rate', 'negative_samples', 'positive_threshold',
                      'max_optimizer_steps', 'validation_interval_steps'):
            self.assertEqual(getattr(PROTOCOL, field), frozen['config'][field])
        dataset = dict(split_scope='global', leakage_audit=dict(violations=0))
        with patch.object(training, 'provenance', return_value={'seed': 42}) as record, \
                patch.object(training, 'MultiDomainNeuMF') as model:
            self.assertEqual(training.run('A', 42, dataset, {}, {}, 'unused', frozen['cutoffs'], 'unused')['seed'], 42)
            model.assert_not_called()
            record.assert_called_once()
        with self.assertRaises(ValueError):
            training.run('A', 45, dataset, {}, {}, 'unused', frozen['cutoffs'], 'unused')

    def test_explicit_validation_schedule_requires_final_step(self):
        self.assertEqual(training.validation_schedule(PROTOCOL), tuple(range(320, 3201, 320)))
        for steps in ((2, 5), [2, 5]):
            self.assertEqual(training.validation_schedule(PROTOCOL._replace(
                max_optimizer_steps=5, validation_steps=steps)), (2, 5))
        for steps in ((2, 4), (5, 2), (2, 2, 5), (0, 5), (2.5, 5)):
            with self.assertRaises(ValueError):
                training.validation_schedule(PROTOCOL._replace(max_optimizer_steps=5, validation_steps=steps))

    def test_only_declared_steps_validate_and_test_is_deferred(self):
        frozen = json.loads((training.ROOT / 'research/results/final_study/protocol.json').read_text())
        dataset = dict(split_scope='global', leakage_audit=dict(violations=0),
            user_mapping={'a': 0}, item_mapping={d: {str(i): i for i in range(6)} for d in training.DOMAINS},
            domain_users={d: [0] for d in training.DOMAINS},
            pairs={'train': {d: [(0, 0)] for d in training.DOMAINS}})
        protocol = PROTOCOL._replace(max_optimizer_steps=5, validation_steps=(2, 5), batch_size=3,
                                     embedding_dim=2, domain_dim=2, mlp_layers=(4, 2))
        validation, test = object(), object()
        scores = {d: {'metrics': {'ndcg': .2}} for d in training.DOMAINS}
        events = []
        with tempfile.TemporaryDirectory() as tmp, patch.object(training, 'ROOT', Path(tmp).resolve()), \
                patch.object(training, 'provenance', return_value={}), \
                patch.object(training, 'evaluate', return_value=(scores, {'ndcg': .2})) as evaluate:
            target = Path(tmp) / 'research/results/final_study/protocol.json'
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps(frozen))
            result = training.run('A', 42, dataset, {'validation': validation, 'test': test}, {},
                'unused', frozen['cutoffs'], Path(tmp) / 'research/runs/fixture', execute=True,
                protocol=protocol, evaluate_test=False, progress=lambda phase, step: events.append((phase, step)))
        self.assertEqual([step for phase, step in events if phase == 'validation'], [2, 5])
        self.assertEqual(evaluate.call_count, 2)
        self.assertTrue(all(call.args[2] is validation for call in evaluate.call_args_list))
        self.assertEqual(result['selected_step'], 2)
        self.assertEqual(result['training_examples'], 15)
        self.assertNotIn('domains', result)
        self.assertEqual([r['step'] for r in result['history']], [2, 5])


class SelectiveTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)
        self.args = dict(user_count=4, item_counts=[12] * 3, domain_users=[list(range(4))] * 3)
        self.users = torch.tensor([0, 1, 2, 3] * 3)
        self.items = torch.arange(12)
        self.domains = torch.arange(3).repeat_interleave(4)
        self.labels = torch.tensor([1., 0., 1., 0.] * 3)

    def model(self, variant='D', **args):
        torch.manual_seed(42)
        return SelectiveNeuMF(**(args or self.args), variant=variant)

    def step(self, model):
        optimizer = torch.optim.Adam(model.parameters(), lr=.001)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(
            model(self.users, self.items, self.domains), self.labels)
        self.assertTrue(torch.isfinite(loss))
        loss.backward()
        self.assertTrue(all(p.grad is None or torch.isfinite(p.grad).all() for p in model.parameters()))
        optimizer.step()

    def test_expanded_parameter_counts_and_fixed_capacity(self):
        args = dict(user_count=7016, item_counts=[44311, 49261, 68471],
                    domain_users=[list(range(7016))] * 3)
        for variant, expected in (('D', 6088278), ('D_FIXED', 6088275)):
            model = self.model(variant, **args)
            self.assertEqual(sum(p.numel() for p in model.parameters()), 6088278)
            self.assertEqual(sum(p.numel() for p in model.parameters() if p.requires_grad), expected)
            self.assertTrue(torch.equal(model.gate_logits.sigmoid(), torch.full((3,), .5)))

    def test_initial_state_and_seed_determinism(self):
        learned, fixed = self.model(), self.model('D_FIXED')
        for name, value in learned.state_dict().items():
            self.assertTrue(torch.equal(value, fixed.state_dict()[name]), name)
        first = learned(self.users, self.items, self.domains)
        self.assertTrue(torch.equal(first, fixed(self.users, self.items, self.domains)))
        repeat = self.model()
        self.step(learned)
        self.step(repeat)
        self.assertTrue(all(torch.equal(v, repeat.state_dict()[k]) for k, v in learned.state_dict().items()))

    def test_gates_and_all_prediction_paths_learn(self):
        for variant in ('D', 'D_FIXED'):
            model = self.model(variant)
            shared_before = model.shared_gmf_user.weight.detach().clone()
            self.step(model)
            for name, parameter in model.named_parameters():
                if name == 'gate_logits' and variant == 'D_FIXED':
                    self.assertIsNone(parameter.grad)
                    continue
                self.assertIsNotNone(parameter.grad, name)
                self.assertGreater(parameter.grad.abs().sum().item(), 0, name)
            self.assertFalse(torch.equal(shared_before, model.shared_gmf_user.weight))
            if variant == 'D':
                self.assertFalse(torch.equal(model.gate_logits, torch.zeros(3)))
            else:
                self.assertTrue(torch.equal(model.gate_logits.sigmoid(), torch.full((3,), .5)))

    def test_residual_limits_and_fixed_half_path(self):
        model = self.model()
        for logit, gate in ((-100., 0.), (0., .5), (100., 1.)):
            with torch.no_grad():
                model.gate_logits.fill_(logit)
                expected = []
                private_scores = []
                for domain, private in enumerate(model.models):
                    mask = self.domains == domain
                    u, i = self.users[mask], self.items[mask]
                    private_scores.append(private(u, i))
                    gmf = (private.gmf_user(u) + gate * model.shared_gmf_user(u)) * private.gmf_item(i)
                    mlp = private.mlp(torch.cat([private.mlp_user(u) + gate * model.shared_mlp_user(u),
                                                private.mlp_item(i)], dim=-1))
                    expected.append(private.output(torch.cat([gmf, mlp], dim=-1)).squeeze(-1))
                actual = model(self.users, self.items, self.domains)
                self.assertTrue(torch.equal(actual, torch.cat(expected)))
                self.assertEqual(torch.equal(actual, torch.cat(private_scores)), gate == 0.)
                diagnostics = model.gate_diagnostics()
                for record in diagnostics:
                    for branch in ('gmf', 'mlp'):
                        self.assertAlmostEqual(record[branch]['effective_shared_norm']['mean'],
                                               gate * record[branch]['shared_norm']['mean'], places=7)

    def test_other_domains_do_not_update_private_parameters(self):
        model = self.model()
        model(self.users[:4], self.items[:4], self.domains[:4]).sum().backward()
        self.assertTrue(all(p.grad is None for private in model.models[1:] for p in private.parameters()))
        self.assertGreater(model.shared_mlp_user.weight.grad.abs().sum().item(), 0)
        self.assertTrue(torch.equal(model.gate_logits.grad[1:], torch.zeros(2)))

    def test_diagnostics_use_only_mapped_train_users(self):
        model = self.model(user_count=4, item_counts=[12] * 3, domain_users=[[2, 0], [1], [3]])
        with torch.no_grad():
            model.shared_gmf_user.weight[2].fill_(2.)
            model.shared_gmf_user.weight[0].fill_(1.)
        report = model.gate_diagnostics()
        self.assertEqual([r['train_users'] for r in report], [2, 1, 1])
        self.assertEqual(report[0]['gmf']['shared_norm'], {'mean': 6., 'median': 6.})
        self.assertEqual(report[0]['gmf']['effective_shared_norm'], {'mean': 3., 'median': 3.})
        with self.assertRaises(ValueError):
            model(torch.tensor([1]), torch.tensor([0]), torch.tensor([0]))

    def test_state_roundtrip_preserves_gates_and_control_trainability(self):
        for variant in ('D', 'D_FIXED'):
            model = self.model(variant)
            self.step(model)
            buffer = io.BytesIO()
            torch.save(model.state_dict(), buffer)
            buffer.seek(0)
            restored = self.model(variant)
            restored.load_state_dict(torch.load(buffer, weights_only=True))
            self.assertTrue(torch.equal(model.gate_logits, restored.gate_logits))
            self.assertEqual(restored.gate_logits.requires_grad, variant == 'D')
            self.assertTrue(torch.equal(model(self.users, self.items, self.domains),
                                        restored(self.users, self.items, self.domains)))

    def test_entry_defers_test_and_accepts_selective_identifiers(self):
        frozen = json.loads((training.ROOT / 'research/results/final_study/protocol.json').read_text())
        dataset = dict(split_scope='global', leakage_audit=dict(violations=0))
        for name in ('D', 'D_FIXED'):
            with patch.object(training, 'provenance', return_value={'model': name}), \
                    patch.object(training, 'SelectiveNeuMF') as constructor:
                record = training.run(name, 42, dataset, {}, {}, 'unused', frozen['cutoffs'], 'unused')
                self.assertEqual(record['model'], name)
                constructor.assert_not_called()
                with self.assertRaisesRegex(ValueError, 'Freeze both'):
                    training.run(name, 42, dataset, {}, {}, 'unused', frozen['cutoffs'], 'unused', execute=True)

    def test_selective_training_uses_train_only_pairs_and_same_stream(self):
        frozen = json.loads((training.ROOT / 'research/results/final_study/protocol.json').read_text())
        dataset = dict(split_scope='global', leakage_audit=dict(violations=0),
            user_mapping={'a': 0}, item_mapping={d: {str(i): i for i in range(6)} for d in training.DOMAINS},
            domain_users={d: [0] for d in training.DOMAINS},
            pairs={'train': {d: [(0, 0)] for d in training.DOMAINS}})
        protocol = PROTOCOL._replace(max_optimizer_steps=1, validation_steps=(1,), batch_size=15)
        scores = {d: {'metrics': {'ndcg': .2}} for d in training.DOMAINS}
        records = []
        with tempfile.TemporaryDirectory() as tmp, patch.object(training, 'ROOT', Path(tmp).resolve()), \
                patch.object(training, 'provenance', return_value={}), \
                patch.object(training, 'evaluate', return_value=(scores, {'ndcg': .2})) as evaluate, \
                patch.object(training, 'sample_examples', wraps=sample_examples) as sampler:
            target = Path(tmp) / 'research/results/final_study/protocol.json'
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps(frozen))
            validation = object()
            for name in ('D', 'D_FIXED'):
                result = training.run(name, 42, dataset, {'validation': validation}, {}, 'unused',
                    frozen['cutoffs'], Path(tmp) / 'research/runs' / name, execute=True,
                    protocol=protocol, evaluate_test=False)
                self.assertNotIn('domains', result)
                self.assertEqual(result['training_examples'], 15)
                records.append(result)
            self.assertEqual(evaluate.call_count, 2)
            self.assertTrue(all(call.args[2] is validation for call in evaluate.call_args_list))
            self.assertTrue(all(call.args[:3] == ([(0, 0)], {0: {0}}, 6) for call in sampler.call_args_list))
        self.assertEqual(records[0]['sampling_sha256'], records[1]['sampling_sha256'])
        self.assertEqual(records[0]['parameter_count'], records[1]['parameter_count'])
        self.assertEqual(records[0]['trainable_parameter_count'] - records[1]['trainable_parameter_count'], 3)


if __name__ == '__main__':
    unittest.main()
