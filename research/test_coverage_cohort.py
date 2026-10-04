import unittest
import json

from coverage_cohort import (event_type, frequency_summary, raw_item_id,
                             select_hash_users, split_timelines,
                             training_support_selection, user_coverage)
from amazon_data import file_digest
from amazon_replication import ROOT
from multidomain_data import DOMAINS, canonical, prepare_multidomain


def row(user, item, domain, day):
    return canonical({'userId': f'amazon:user:{user}', 'itemId': f'{domain}:amazon:{item}',
                      'domain': domain, 'action': 'selected', 'value': 4,
                      'timestamp': f'2020-01-{day:02d}T00:00:00+00:00',
                      'context': {'dataset': 'amazon'}})


class CoverageCohortTests(unittest.TestCase):
    def test_hash_cohorts_are_deterministic_and_nested(self):
        users = [f'user-{n}' for n in range(3000)]
        self.assertEqual(select_hash_users(users, 1000), select_hash_users(reversed(users), 1000))
        self.assertEqual(select_hash_users(users, 1000), select_hash_users(users, 2500)[:1000])

    def test_frequency_bins_and_concentration(self):
        summary = frequency_summary({str(n): n for n in range(1, 21)})
        self.assertEqual(summary['bins'], {'1': 1, '2': 1, '3-4': 2, '5-9': 5,
                                           '10-19': 10, '20+': 1})
        self.assertEqual(summary['frequency_quantiles']['p50'], 10)
        self.assertGreater(summary['top_item_concentration']['top_10_percent']['interaction_share'], 0)

    def test_warm_cold_classification_and_user_coverage(self):
        self.assertEqual([event_type(user, item) for user, item in
                          ((True, True), (True, False), (False, True), (False, False))],
                         ['warm', 'cold_item', 'cold_user', 'both'])
        users = {'amazon:user:a', 'amazon:user:b', 'amazon:user:c'}
        warm = [row('a', 'i1', 'food', 1), row('a', 'i2', 'food', 2),
                row('b', 'i3', 'food', 1)]
        test = [row('a', 'i1', 'food', 3), row('b', 'i4', 'food', 3),
                row('c', 'i5', 'food', 3)]
        domains, cross_domain = user_coverage(test, warm, users)
        self.assertEqual(domains['food']['users_by_warm_positives'], {'0': 1, '1': 1, '2+': 1})
        self.assertEqual(cross_domain, {'at_least_1_domains': 2,
                                        'at_least_2_domains': 0,
                                        'at_least_3_domains': 0})

    def test_source_identity_requires_domain_canonical_item(self):
        self.assertEqual(raw_item_id('food', 'food:amazon:asin-1'), 'asin-1')
        with self.assertRaises(ValueError):
            raw_item_id('food', 'fitness:amazon:asin-1')

    def test_frozen_v1_artifact_hashes_still_match(self):
        audit = json.loads((ROOT / 'research/results/amazon_coverage_audit.json').read_text())
        for relative_path, expected_hash in audit['v1_source_artifact_sha256'].items():
            self.assertEqual(file_digest(ROOT / relative_path), expected_hash, relative_path)

    def test_timeline_split_keeps_boundary_ties_early(self):
        rows = [row('u', f'i{day}', 'food', day) for day in range(1, 11)]
        rows.append(row('u', 'tie', 'fitness', 7))
        splits, _ = split_timelines(rows)
        self.assertTrue(all(r['timestamp'] <= '2020-01-07T00:00:00+00:00' for r in splits['train']))
        self.assertIn('tie', {r['itemId'].split(':')[-1] for r in splits['train']})
        self.assertEqual(sum(map(len, splits.values())), len(rows))
        prepared = prepare_multidomain(rows, split_scope='per_user')
        self.assertEqual(prepared['leakage_audit']['violations'], 0)

    def test_support_selection_is_repeatable_and_uses_training_rows(self):
        users = [f'u{n}' for n in range(4)]
        rows = []
        for user in users:
            for domain in DOMAINS:
                for day in range(1, 11):
                    # Each user's held-out tail has unique items and cannot improve train support.
                    item = f'shared{day % 2}' if day < 8 else f'tail-{user}-{day}'
                    rows.append(row(user, item, domain, day))
        selected, _ = training_support_selection(rows, users, 2)
        selected_again, _ = training_support_selection(list(reversed(rows)), users, 2)
        self.assertEqual(selected, selected_again)
        self.assertEqual(len(selected), 2)

    def test_item_filter_changes_train_mapping_not_heldout_denominator(self):
        rows = [row('u', f'shared-{day % 2}', 'food', day) for day in range(1, 11)]
        rows += [row('u', 'tail', 'food', 10)]
        dataset = prepare_multidomain(rows, split_scope='per_user', item_min=2)
        self.assertEqual(dataset['coverage']['test']['food']['positives'], 2)
        self.assertEqual(dataset['coverage']['test']['food']['excluded_cold_positives'], 1)
        self.assertEqual(len(dataset['item_mapping']['food']), 2)


if __name__ == '__main__':
    unittest.main()
