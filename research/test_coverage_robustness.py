import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

import torch

import coverage_robustness as audit
from amazon_data import file_digest
from coverage_cohort import select_hash_users
from final_study import evaluate
from multidomain_model import MultiDomainNeuMF


class CoverageRobustnessTests(unittest.TestCase):
    def test_support_uses_train_only_and_separates_positive_ratings(self):
        rows=[('a','i',5,1),('b','i',2,2),('c','i',5,11),('a','j',4,3)]
        all_counts,positive,users=audit.support(rows,10)
        self.assertEqual(dict(all_counts),{'i':2,'j':1})
        self.assertEqual(dict(positive),{'i':1,'j':1})
        self.assertEqual(users['i'],{'a','b'})

    def test_future_history_cannot_make_user_eligible(self):
        rows={d:[('past',str(i),5,i) for i in range(5)]+[('future',str(i),5,20+i) for i in range(20)] for d in audit.DOMAINS}
        self.assertEqual(audit.train_eligible(rows,10),{'past'})
        rows['food'].append(('future','other',5,5))
        self.assertEqual(audit.train_eligible(rows,10),{'past'})
        rows['media'][0]=('past','0',2,0)
        self.assertEqual(audit.train_eligible(rows,10),set())

    def test_hash_prefixes_are_deterministic_and_nested(self):
        users=[str(i) for i in range(40)]
        small=select_hash_users(users,10)
        self.assertEqual(small,select_hash_users(reversed(users),10))
        self.assertEqual(small,select_hash_users(users,20)[:10])
        self.assertEqual(audit.prefix_sizes(6000),[2500,5000,6000])

    def test_coverage_partition_and_numerator(self):
        rows=[('a','old',5,1),('a','new',5,12),('a','old',5,21),('a','new',5,22),('b','old',5,23)]
        result,users=audit.cohort_coverage(rows,{'a','b'},10,20)
        self.assertEqual(result['validation_positives'],1)
        self.assertEqual((result['test_positives'],result['warm_test_positives'],result['cold_test_positives']),(3,1,2))
        self.assertEqual(users,set())
        self.assertEqual(result['excluded_repeat_positives'],1)
        self.assertAlmostEqual(result['warm_percent'],100/3)

    def test_true_new_versus_cohort_missing_classification(self):
        self.assertEqual(audit.cold_category(1,2,10,20),'observed_before_train_but_missing_cohort_positive')
        self.assertEqual(audit.cold_category(1,12,10,20),'old_item_without_global_train_positive')
        self.assertEqual(audit.cold_category(12,13,10,20),'first_observed_validation')
        self.assertEqual(audit.cold_category(21,21,10,20),'first_observed_test')

    def test_support_boundaries_cover_every_positive_count_once(self):
        self.assertEqual([audit.bucket(n) for n in (1,2,4,5,9,10,19,20,49,50)],['1','2-4','2-4','5-9','5-9','10-19','10-19','20-49','20-49','50+'])
        self.assertEqual([audit.band(n) for n in (1,4,5,19,20)],['tail_1-4','tail_1-4','mid_5-19','mid_5-19','head_20+'])
        with self.assertRaises(ValueError):audit.band(0)

    def test_train_quantiles_and_subgroup_accounting(self):
        values=list(range(1,101));lo=audit.quantile(values,.33);hi=audit.quantile(values,.67)
        self.assertEqual((lo,hi),(33,67))
        self.assertEqual(Counter(audit.history_group(v,lo,hi) for v in values),dict(low=33,medium=34,high=33))
        self.assertTrue(audit.opportunity(3,20,3,20))
        self.assertFalse(audit.opportunity(4,20,3,20))
        self.assertFalse(audit.opportunity(3,19,3,20))

    def test_small_group_is_not_scored_or_summarized(self):
        rows=[({'user':i%30},dict(precision=.1,recall=1.,ndcg=1.),'x') for i in range(49)]
        r=audit.group_metrics(rows,('x',))['x']
        self.assertIsNone(r['ndcg'])
        rows.append(({'user':0},dict(precision=.1,recall=1.,ndcg=1.),'x'))
        r=audit.group_metrics(rows,('x',))['x']
        self.assertEqual((r['evaluation_positives'],r['evaluation_users'],r['ndcg']),(50,30,1.))
        small=[dict(seed=s,model=n,domain='food',group='empty',evaluation_positives=0,evaluation_users=0,status='too_small_no_interpretation',precision=None,recall=None,ndcg=None) for s in (42,43,44) for n in 'ABC']
        for row in audit.with_seed_summary(small):self.assertIsNone(row['ndcg'])

    def test_inference_matches_frozen_evaluator_without_parameter_updates(self):
        architecture=dict(variant='shared',user_count=1,item_counts=[12]*3,domain_users=[[0]]*3,embedding_dim=2,hidden_sizes=[4,2],domain_dim=2)
        model=MultiDomainNeuMF(**architecture)
        dataset=dict(user_mapping={'a':0},item_mapping={d:{str(i):i for i in range(12)} for d in audit.DOMAINS},pairs={'train':{d:[(0,i) for i in range(12)] for d in audit.DOMAINS}})
        queries={d:[dict(user=0,targets=[1],excluded=[0],context=[])] for d in audit.DOMAINS}
        domains,_=evaluate(model,dataset,queries)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); checkpoint=root/'model.pt'
            torch.save(dict(architecture=architecture,state_dict=model.state_dict(),user_mapping=dataset['user_mapping'],item_mapping=dataset['item_mapping']),checkpoint)
            before=file_digest(checkpoint)
            with patch.object(audit,'ROOT',root):
                tables=audit.frozen_inference(dataset,queries,[(42,'B',dict(checkpoint='model.pt',domains=domains))],
                    {d:Counter({i:1 for i in range(12)}) for d in audit.DOMAINS},
                    {d:Counter({0:12}) for d in audit.DOMAINS},
                    dict(total_history=[10,40],opportunity={d:[12,24] for d in audit.DOMAINS}),root)
            self.assertEqual(file_digest(checkpoint),before)
            self.assertEqual(sum(r['evaluation_positives'] for r in tables['support_band_metrics']),3)


if __name__=='__main__':
    unittest.main()
