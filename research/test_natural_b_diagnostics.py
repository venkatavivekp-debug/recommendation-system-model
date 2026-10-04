import tempfile
import unittest

import torch

from amazon_replication import ROOT, load_model, read_json
from multidomain_data import DOMAINS, prepare_multidomain
from multidomain_experiment import evaluate_domains, run
from natural_b_diagnostics import (checkpoint_comparison, inspect_scores, rank_summary,
                                   score_separation, stats, validation_view)
from test_multidomain import fixture


class NaturalBDiagnosticsTests(unittest.TestCase):
    def test_rank_quantiles_and_cutoffs(self):
        result = rank_summary([1, 10, 20, 60])
        self.assertEqual(result['median'], 15)
        self.assertEqual(result['q25'], 7.75)
        self.assertEqual(result['q75'], 30)
        self.assertEqual(result['top_10_percent'], 50)
        self.assertEqual(result['top_20_percent'], 75)
        self.assertEqual(result['outside_top_50_percent'], 25)

    def test_scores_and_population_variance(self):
        result = score_separation([1, 3], [0, 2], [0, 2])
        self.assertEqual(result['positive_scores']['mean'], 2)
        self.assertEqual(result['positive_scores']['sd'], 1)
        self.assertEqual(result['positive_minus_user_mean_negative']['mean'], 1)
        self.assertEqual(result['fraction_positive_above_user_mean_negative'], .5)
        self.assertEqual(stats([2, 2])['sd'], 0)

    def test_checkpoint_ties_remain_visible(self):
        epochs = [{'epoch': index, 'validation': {'domains': {d: {'metrics': {'ndcg': value}} for d in DOMAINS}}}
                  for index, value in enumerate((.2, .1, .2), 1)]
        result = checkpoint_comparison(epochs, 2)['food']
        self.assertEqual(result['best_ranking_epochs'], [1, 3])
        self.assertAlmostEqual(result['ndcg_gap'], .1)
        self.assertEqual(result['first_best_epoch_minus_selected'], -1)

    def test_observer_preserves_training_and_candidates(self):
        dataset = prepare_multidomain(fixture())
        validation = validation_view(dataset)
        config = read_json(ROOT / 'research/multidomain_config.json')
        epochs = []

        def observer(model, history):
            epochs.append(history['epoch'])
            evaluate_domains(model, validation, 3)

        with tempfile.TemporaryDirectory() as directory:
            config = {**config, 'output': directory, 'model_variant': 'shared', 'epochs': 2,
                      'batch_size': 16, 'negative_samples': 2, 'test_only': True, 'k': 3}
            baseline, result = run(dataset, config)
            observed, actual = run(dataset, config, epoch_observer=observer)
            self.assertEqual(read_json(baseline / 'history.json'), read_json(observed / 'history.json'))
            self.assertEqual(result['domains'], actual['domains'])
            self.assertEqual(epochs, [1, 2])
            model, checkpoint = load_model(observed)
            _, original = load_model(baseline)
            self.assertTrue(all(torch.equal(value, original['state_dict'][key])
                                for key, value in checkpoint['state_dict'].items()))
            self.assertEqual(inspect_scores(model, dataset, 3)['domains'], result['domains'])
            self.assertEqual(validation['pairs']['test'], dataset['pairs']['validation'])
            self.assertTrue(all(not values for values in validation['pairs']['validation'].values()))


if __name__ == '__main__':
    unittest.main()
