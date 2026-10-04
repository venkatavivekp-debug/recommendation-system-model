import tempfile
import unittest
from unittest.mock import patch

import torch

from amazon_replication import ROOT, load_model, read_json
from checkpoint_selection import summarize
from multidomain_data import DOMAINS, prepare_multidomain
from multidomain_experiment import evaluate_domains, run, select_ranking_checkpoint, validation_view
from test_multidomain import fixture


def domain_metrics(values):
    return {d: {'metrics': {'ndcg': v, 'precision': v, 'recall': v}, 'evaluated_users': n}
            for d, v, n in zip(DOMAINS, values, (100, 2, 1))}


class CheckpointSelectionTests(unittest.TestCase):
    def test_unweighted_macro_and_earliest_tie_exact_state(self):
        model = torch.nn.Linear(1, 1)
        selected = select_ranking_checkpoint(model, domain_metrics((0, 0, .6)), 1, None)
        self.assertAlmostEqual(selected['score'], .2)
        original = model.weight.detach().clone()
        with torch.no_grad():
            model.weight.add_(10)
        tied = select_ranking_checkpoint(model, domain_metrics((0, 0, .6)), 2, selected)
        self.assertIs(tied, selected)
        self.assertEqual(tied['epoch'], 1)
        self.assertTrue(torch.equal(tied['state']['weight'], original))
        improved = select_ranking_checkpoint(model, domain_metrics((.3, .3, .3)), 3, tied)
        self.assertEqual(improved['epoch'], 3)
        model.load_state_dict(selected['state'])
        self.assertTrue(torch.equal(model.weight, original))

    def test_both_rules_keep_trajectory_and_use_validation_only(self):
        dataset = prepare_multidomain(fixture())
        view = validation_view(dataset)
        config = read_json(ROOT / 'research/multidomain_config.json')
        observed = []
        def inspect(model, data, k):
            observed.append(data)
            return evaluate_domains(model, data, k)
        with tempfile.TemporaryDirectory() as directory:
            config = {**config, 'output': directory, 'epochs': 2, 'model_variant': 'shared',
                      'batch_size': 16, 'negative_samples': 2, 'k': 3, 'test_only': True}
            baseline, _ = run(dataset, config)
            with patch('multidomain_experiment.evaluate_domains', side_effect=inspect):
                ranked, result = run(dataset, {**config, 'checkpoint_metric': 'macro_validation_ndcg'})
            for data in observed[:2]:
                self.assertEqual(data['pairs']['test'], view['pairs']['test'])
                self.assertEqual(data['pairs']['validation'], view['pairs']['validation'])
            self.assertEqual(read_json(baseline / 'history.json'), read_json(ranked / 'history.json'))
            _, original = load_model(baseline)
            _, actual = load_model(ranked)
            self.assertTrue(all(torch.equal(v, actual['state_dict'][k]) for k, v in original['state_dict'].items()))
            repeated, again = run(dataset, {**config, 'checkpoint_metric': 'macro_validation_ndcg'})
            self.assertEqual(result['checkpoint_comparison'], again['checkpoint_comparison'])
            saved = torch.load(ranked / 'ranking_best.pt', weights_only=True)
            other = torch.load(repeated / 'ranking_best.pt', weights_only=True)
            self.assertTrue(all(torch.equal(v, other['state_dict'][k]) for k, v in saved['state_dict'].items()))
            model, _ = load_model(ranked)
            model.load_state_dict(saved['state_dict'])
            self.assertEqual(evaluate_domains(model, dataset, 3)[0], result['domains'])

    def test_aggregation_and_composite_epoch_distances(self):
        runs = []
        for mode in ('natural', 'balanced'):
            for variant in ('independent', 'shared', 'shared_domain_specific'):
                for seed, value in zip((42, 43, 44), (.1, .2, .3)):
                    policies = {p: {'domains': domain_metrics((v, v, v)),
                                   'macro': dict.fromkeys(('precision', 'recall', 'ndcg'), v),
                                   'validation_macro': {'ndcg': v}} for p, v in (('bce', value), ('ranking', value + .1))}
                    policies['bce']['epochs'] = {'food': 1, 'fitness': 2, 'media': 3} if variant == 'independent' else {'shared': 1}
                    policies['ranking']['epoch'] = 2
                    policies['validation_history'] = [{'epoch': 2, 'domains': domain_metrics((.3, .3, .3))}]
                    runs.append({'mode': mode, 'variant': variant, 'seed': seed, 'comparison': policies})
        result = summarize(runs)
        self.assertAlmostEqual(result['three_seed_summary']['natural']['shared']['bce']['domains']['food']['ndcg']['sd'], .1)
        self.assertEqual(result['validation_test_agreement'], {'improved': 18, 'unchanged': 0, 'worsened': 0})
        self.assertEqual(result['disagreement_analysis']['different_epoch_runs'], 18)
        self.assertAlmostEqual(result['disagreement_analysis']['mean_epoch_distance'], 8 / 9)


if __name__ == '__main__':
    unittest.main()
