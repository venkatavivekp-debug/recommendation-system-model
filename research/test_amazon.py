import csv
import gzip
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

from amazon_data import (CATEGORIES, FIELDS, audit, download, parse_row, positive_record,
                         records, summary, validate_artifacts)
from multidomain_data import canonical, examples_by_domain, iterative_core, leakage_audit, prepare_multidomain


class AmazonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.row = dict(zip(FIELDS, ('reviewer', 'B000ITEM', '4.0', '1577836800123')))

    def write_csv(self, name, rows):
        path = self.root / name
        with gzip.open(path, 'wt', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_parse_rating_and_millisecond_timestamp(self):
        self.assertEqual(parse_row(self.row), ('reviewer', 'B000ITEM', 4, 1577836800123))
        row = positive_record(parse_row(self.row), 'food')
        self.assertEqual(row['timestamp'], '2020-01-01T00:00:00.123000+00:00')
        self.assertEqual(row['source'], 'amazon_reviews_2023')
        self.assertEqual(canonical(row), row)

    def test_bad_records_are_rejected_by_reason(self):
        for field, value, reason in (
                ('user_id', '', 'missing_user_id'), ('parent_asin', None, 'missing_parent_asin'),
                ('rating', 'NaN', 'invalid_rating'), ('rating', '6', 'invalid_rating'),
                ('rating', '4.5', 'invalid_rating'), ('timestamp', 'bad', 'invalid_timestamp'),
                ('timestamp', '1577836800', 'invalid_timestamp'), ('timestamp', '-1', 'invalid_timestamp')):
            with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, reason):
                parse_row({**self.row, field: value})

    def test_shared_identity_and_domain_items(self):
        rows = [positive_record(parse_row(self.row), d) for d in CATEGORIES]
        self.assertEqual({r['userId'] for r in rows}, {'amazon:user:reviewer'})
        self.assertEqual({r['itemId'] for r in rows}, {f'{d}:amazon:B000ITEM' for d in CATEGORIES})
        self.assertNotEqual(rows[0]['userId'], 'movielens:user:reviewer')

    def test_positive_threshold_is_uniform(self):
        for domain in CATEGORIES:
            for rating in range(1, 6):
                self.assertEqual(positive_record(parse_row({**self.row, 'rating': str(rating)}), domain) is not None,
                                 rating >= 4)

    def test_streaming_counts_and_invalid_rows(self):
        path = self.write_csv('rows.csv.gz', [self.row, {**self.row, 'rating': '0'}, self.row])
        counts = Counter()
        iterator = records(path, counts)
        self.assertEqual(counts['read'], 0)
        next(iterator)
        self.assertEqual(counts['read'], 1)
        self.assertEqual(len(list(iterator)), 1)
        self.assertEqual(counts, {'read': 3, 'accepted': 2, 'rejected': 1, 'invalid_rating': 1})

    def test_download_keeps_existing_file(self):
        path = self.write_csv(CATEGORIES['food'] + '.csv.gz', [self.row])
        with patch('amazon_data.urllib.request.urlopen') as request:
            self.assertEqual(download('food', self.root), path)
            request.assert_not_called()

    def test_unexpected_schema_stops(self):
        path = self.root / 'wrong.csv.gz'
        with gzip.open(path, 'wt') as stream:
            stream.write('unrelated,columns\na,b\n')
        with self.assertRaisesRegex(ValueError, 'Unexpected CSV'):
            list(records(path, Counter()))

    def test_audit_exact_overlap_and_manifest(self):
        for domain, category in CATEGORIES.items():
            rows = [{**self.row, 'user_id': 'shared', 'parent_asin': str(i)} for i in range(5)]
            rows += [{**self.row, 'user_id': domain}]
            if domain != 'media':
                rows += [{**self.row, 'user_id': 'pair', 'rating': '2'}] * 2
            self.write_csv(category + '.csv.gz', rows)
        with patch('builtins.print'):
            audit(self.root, self.root / 'counts.sqlite', self.root / 'results')
        shared = json.loads((self.root / 'results/amazon_multidomain_overlap.json').read_text())
        self.assertEqual(shared['all_ratings']['food_fitness']['1'], 2)
        self.assertEqual(shared['all_ratings']['food_fitness']['2'], 2)
        self.assertEqual(shared['all_ratings']['food_fitness_media']['5'], 1)
        self.assertEqual(shared['all_ratings']['food_fitness_media']['10'], 0)
        self.assertEqual(shared['positive_ratings']['food_fitness']['1'], 1)
        manifest = json.loads((self.root / 'results/amazon_multidomain_dataset_manifest.json').read_text())
        self.assertEqual(manifest['positive_threshold'], 4)
        self.assertEqual(manifest['record_counts']['food'], 8)
        self.assertEqual(len(manifest['files']['food']['sha256']), 64)
        with patch('builtins.print'):
            validate_artifacts(self.root / 'results')
        with self.assertRaisesRegex(ValueError, 'already exist'):
            audit(self.root, self.root / 'counts.sqlite', self.root / 'results')

    def test_histogram_median_and_mean(self):
        result = summary({1: 2, 3: 2})
        self.assertEqual(result['median'], 2)
        self.assertEqual(result['mean'], 2)
        self.assertEqual(summary({}), {'count': 0})

    def test_iterative_core_converges(self):
        edges = [('a', 'x'), ('a', 'y'), ('b', 'x'), ('b', 'y'), ('b', 'z'), ('c', 'z'), ('c', 'w')]
        rows = [{'domain': 'food', 'userId': u, 'itemId': i} for u, i in edges]
        core = iterative_core(rows, 2, 2)
        self.assertEqual({(r['userId'], r['itemId']) for r in core}, {('a', 'x'), ('a', 'y'), ('b', 'x'), ('b', 'y')})
        self.assertEqual(iterative_core(core, 2, 2), core)
        self.assertEqual(sorted(core, key=str), sorted(iterative_core(list(reversed(rows)), 2, 2), key=str))

    def test_joint_user_timeline_and_negative_mask(self):
        rows = [positive_record(parse_row({**self.row, 'user_id': str(user),
                    'parent_asin': str((2 * user + step) % 12), 'timestamp': str(1577836800000 + step * 1000)}), domain)
                for domain in CATEGORIES for user in range(4) for step in range(8)]
        dataset = prepare_multidomain(rows, split_scope='per_user')
        self.assertEqual(dataset['leakage_audit'], {'users_checked': 4, 'violations': 0, 'users_without_train': 0})
        self.assertEqual(dataset, prepare_multidomain(list(reversed(rows)), split_scope='per_user'))
        for domain in CATEGORIES:
            self.assertEqual([dataset['coverage'][s][domain]['positives'] for s in ('train', 'validation', 'test')], [24, 4, 4])
        samples = examples_by_domain(dataset, 'train', 4, 42)
        for index, domain in enumerate(CATEGORIES):
            known = set(dataset['pairs']['train'][domain])
            for user, item, actual_domain, label in samples[domain]:
                self.assertEqual(index, actual_domain)
                if not label:
                    self.assertNotIn((user, item), known)

    def test_leakage_audit_detects_future_and_boundary_ties(self):
        base = positive_record(parse_row(self.row), 'food')
        for timestamp in (base['timestamp'], '2019-01-01T00:00:00+00:00'):
            splits = {'train': [base], 'validation': [{**base, 'domain': 'media', 'timestamp': timestamp}], 'test': []}
            self.assertEqual(leakage_audit(splits)['violations'], 1)


if __name__ == '__main__':
    unittest.main()
