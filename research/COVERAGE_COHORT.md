# Amazon Coverage Cohort Audit

## Why coverage matters

NeuMF assigns an item an embedding learned from training interactions. It cannot rank a held-out item that has no training embedding. We therefore keep all validation and test positives in their original denominators, report warm coverage separately, and never build item mappings from future events.

## V1 findings

The frozen V1 cohort contains 1,000 shared reviewers. Training-item support is very sparse:

| Domain | Train items with 1 event | 2 | 3-4 | 5-9 | 10-19 | 20+ | Warm test coverage | Test users with 0 / 1 / 2+ warm positives |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Food | 7,029 | 774 | 275 | 84 | 6 | 1 | 22.66% (804/3,548) | 434 / 273 / 182 |
| Fitness | 6,525 | 451 | 138 | 20 | 1 | 0 | 12.01% (270/2,248) | 577 / 176 / 45 |
| Media | 10,436 | 1,183 | 348 | 81 | 11 | 2 | 19.78% (354/1,790) | 305 / 145 / 67 |

Median item frequency is one in all domains. The top 10% of training items account for 23.9% of Food, 20.0% of Fitness, and 22.8% of Media training interactions. The remaining mass is spread over many low-support items.

Across V1 test events, the taxonomy is 1,428 warm, 5,989 cold-item, 129 cold-user-and-item, and 40 cold-user events. There are 678 users with at least one warm test positive in any domain, 188 in at least two domains, and 22 in all three. So V1 supports per-domain warm evaluation, but the strict same-user three-domain warm subset is small.

The raw-source temporal check is event-based and overlapping. Among cold-item test events, an item had an earlier positive rating outside V1 for 59.9% of Food, 46.2% of Fitness, and 54.8% of Media events. Its first source observation was after that user's training cutoff for 39.4%, 53.2%, and 44.5%, respectively. Items seen only in V1 validation account for 5.8%, 2.3%, and 3.8%. Some events meet multiple conditions. “Supported in the 5,000-user training pool” is a separate reference, not proof that an item was available to a V1 model. Per-user temporal splitting has no single shared cutoff date.

## Candidate strategies

The audit compares cohorts without fitting a model. Held-out events remain in the denominator even when a training item-frequency filter removes their item from the training vocabulary.

| Cohort | Users | Three-domain train retention | Food warm | Fitness warm | Media warm |
| --- | ---: | ---: | ---: | ---: | ---: |
| V1 hash sample | 1,000 | 956 (95.6%) | 22.66% | 12.01% | 19.78% |
| At least 10 positives/domain | 2,044 | 2,022 (98.9%) | 42.93% | 24.87% | 35.55% |
| Hash expansion | 2,500 | 2,413 (96.5%) | 35.07% | 21.25% | 31.98% |
| Hash expansion | 5,000 | 4,820 (96.4%) | 44.75% | 29.55% | 41.32% |
| Train-support-ranked from hash-5,000 | 2,500 | 2,500 (100%) | 40.15% | 23.87% | 32.98% |
| Hash-2,500, train item support >=2 | 2,500 | 1,719 (68.8%) | 19.79% | 9.08% | 16.70% |
| Hash-2,500, train item support >=3 | 2,500 | 1,070 (42.8%) | 12.94% | 4.26% | 9.77% |

The high-activity strategy is conditioned on full-history positive counts, not test ranking results; it describes a different, more active population. The support-ranked strategy uses only training-side item counts, but intentionally favors users with denser supported histories. Item-minimum filters reduce coverage because they remove training support, not because test events are discarded.

## Selected V2 cohort

V2 is the first 2,500 reviewers under the existing deterministic `SHA256("42:" + reviewer_id)` order among users with at least five positive ratings in each domain. This nested expansion retains all V1 users, uses no item/test filter, and is selected without test outcomes. Compared with V1, warm coverage rises by 12.41 percentage points in Food, 9.24 in Fitness, and 12.21 in Media. It yields 2,413 users with training history in all three domains and 152 with at least one warm test positive in all three.

The model shape remains practical: roughly 2.02M-2.26M parameters across A/B/C and about 32-36 MB for parameters, gradients, and Adam state by a simple 16-byte-per-parameter estimate. A fixed 3,200-step run processes 1,638,400 examples. V1 seed-45-to-47 artifacts show a median adjacent run-start gap of about 88 seconds; V2 validation ranking work was estimated at 7.24 times V1 per validation window. The later seed-42 feasibility run took 768.4 seconds (12m 48s) for training, validation and test work, plus about 15 seconds of data preflight. Ranking/evaluation dominated this run, so this measured time is more useful than the earlier extrapolation, but still only describes this machine and configuration.

V2 keeps the same per-user cross-domain timeline split and tie policy. The training-only item mapping excludes future-only items, and all held-out positives remain recorded. No model was trained as part of the coverage audit itself. See [`results/amazon_coverage_audit.json`](results/amazon_coverage_audit.json) for the complete cohort, frequency, temporal, parameter, and work estimates, and [`results/amazon_cohort_v2_manifest.json`](results/amazon_cohort_v2_manifest.json) for the selected user hash and prepared-file fingerprints.

## V2 feasibility pilot

After the coverage audit, one predeclared run trained Model C (`shared_domain_specific`) with Balanced sampling and seed 42 for 3,200 optimizer steps. Validation selected epoch 2 (step 640) by unweighted macro validation nDCG, with the earliest exact tie retained. Reloading the saved ranking checkpoint reproduced its selected validation result. The source, cohort, split, and candidate fingerprints were checked before training. No V2 replication or other model configuration was run.

| Domain | Precision@10 | Recall@10 | nDCG@10 |
| --- | ---: | ---: | ---: |
| Food | 0.003252 | 0.014932 | 0.008543 |
| Fitness | 0.002497 | 0.016932 | 0.010662 |
| Media | 0.001491 | 0.008582 | 0.004675 |
| Macro | 0.002413 | 0.013482 | 0.007960 |

Warm test coverage is 3,181/9,071 Food positives (35.07%), 1,247/5,868 Fitness positives (21.25%), and 1,444/4,515 Media positives (31.98%). These scores are low and leave most held-out positives outside the train-item vocabulary. The V1 seed-42 reference used a different, 1,000-user cohort: **DIFFERENT COHORTS — NOT A CONTROLLED PERFORMANCE IMPROVEMENT.** The results cannot show that expanding the cohort improved the model. Full metrics, coverage, diagnostics, fingerprints and timing are in [`results/amazon_v2_pilot_seed42.json`](results/amazon_v2_pilot_seed42.json); the run directory and checkpoint remain local and Git-ignored.

The six-seed V1 results remain frozen and unchanged. The next step is to review whether this V2 coverage and runtime justify a separately declared replication; this pilot alone does not establish a winner or support claims of reliable cross-domain transfer.
