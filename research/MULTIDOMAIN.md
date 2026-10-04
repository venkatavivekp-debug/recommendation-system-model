# Three-domain NeuMF foundation

## Question and current status

Can shared neural collaborative filtering preserve domain-specific preferences across food, fitness and media? This is a new offline experiment, not a replacement for the live application's scorer or the previous MovieLens experiments.

The Day 1 foundation was verified with synthetic fixtures. The next phase has acquired and audited real Amazon category interactions. See the Amazon section below for the shared-reviewer cohort and pilot protocol. Synthetic tests still establish code behavior, not recommendation quality.

## Original Day 1 data audit

The generated [audit](multidomain_audit.json) records the input hash, loaded counts, overlap, split coverage and training blockers.

| Source | Local raw interactions | Loaded positives | Users in positives | Items in positives |
| --- | ---: | ---: | ---: | ---: |
| MovieLens 100K | 100,000 | 55,375 | 942 | 1,447 |
| Food.com | Not available | 0 | 0 | 0 |
| Fitness interactions | Not available | 0 | 0 | 0 |

The raw MovieLens release has 943 users and 1,682 movies. Ratings >= 4 are positives; lower ratings are not explicitly trained as dislikes. Source: [GroupLens, University of Minnesota](https://grouplens.org/datasets/movielens/100k/).

Food.com is a candidate, not an imported dataset. Its dated user/recipe ratings could support a recipe ranking task. See the [recipe-personalization authors' repository](https://github.com/majumderb/recipe-personalization) and [UCSD dataset catalog](https://cseweb.ucsd.edu/~jmcauley/datasets.html). Check the release terms and define the treatment of unrated records before conversion.

FitRec/Endomondo is another candidate in the UCSD catalog. A logged workout is not automatically a recommendable item shared by users. Ranking unique workout IDs could leave almost no collaborative signal or warm test items. A defensible reusable activity catalog and positive interaction definition must be established before using this source. No fitness importer or invented activity preferences have been added.

The Day 1 audit had zero observed users shared across domains. MovieLens user 42 and Food.com user 42 remain different people. No cross-dataset identity matching has been done. Live OSM/Google restaurant discovery and the local restaurant catalog are not used as research interaction datasets. The new Amazon files use their own common reviewer namespace.

## Files and data contract

- `multidomain_data.py`: canonical records, provenance, overlap, splits, existing negative sampler and batch ordering.
- `multidomain_model.py`: one small wrapper around the existing `NeuMF`, with exactly A/B/C variants.
- `multidomain_experiment.py`: audit, readiness checks, training, existing ranking metrics and best-checkpoint output.
- `multidomain_config.json`: one reproducible run configuration; planned seeds are 42, 43 and 44.
- `test_multidomain.py`: synthetic tests only. Temporary checkpoints are removed after tests.

MovieLens can be read directly from `u.data`. Other inputs must be positive-interaction JSONL, one record per line:

```json
{"userId":"foodcom:user:42","itemId":"food:recipe:88","domain":"food","action":"selected","value":5,"timestamp":"2020-01-01T00:00:00Z","context":{"dataset":"foodcom"}}
```

`selected` is an implicit positive adapter, not evidence of an application click. The value and source context are retained; the loss uses binary labels. User prefixes retain dataset provenance. Item prefixes are `food:recipe:`, `fitness:activity:` and `media:movie:`. Timestamps need a timezone and are normalized to UTC. For a date-only source, document a UTC midnight convention and preserve same-day ties; do not invent within-day order.

Optional linkage is an explicit JSON manifest with `kind`, `evidence` and a `users` mapping from namespaced IDs to `shared:user:<id>`. `kind: verified` requires real, externally checked identity evidence; the loader cannot authenticate that claim. `kind: synthetic_test` is restricted to `test_only` runs. Overlapping users require either common global cutoffs or joint per-user cross-domain timelines. Independent per-domain splits are rejected for shared users. Amazon uses the original shared reviewer IDs directly, without a linkage manifest.

## Architectures

Each branch has its own 16-dimensional user/item embeddings, as in the existing NeuMF. No sequence encoder is added.

| Variant | User representation | Items and prediction layers |
| --- | --- | --- |
| A: `independent` | Separate GMF/MLP user tables per domain | Three independent NeuMF models, MLP 32 -> 32 -> 16 |
| B: `shared` | Global GMF/MLP user tables | Disjoint item-table blocks, learned 4D domain vector; shared MLP 36 -> 32 -> 16 |
| C: `shared_domain_specific` | B plus separate per-domain user offsets in both branches | Same item tables, domain vector and shared prediction layers as B |

```text
user ID -> shared user vectors (+ target-domain offsets in C)
target-domain item ID -> disjoint item vectors
                  |                       |
                  +---- GMF product ------+
                  +---- MLP concat(user, item, domain) -> 32 -> 16
                         |
                   concat(GMF, MLP) -> Linear(32, 1) -> logit
```

B and C share a prediction head; they do not have three independent heads. Their domain-vector columns start at zero in the first MLP layer, preserving the existing initializer. C's offsets also start at zero, so B and C start with equivalent scoring functions at the same seed. These are jointly trained small models, not pretrained branch combinations.

Concrete representation example for a genuinely shared user: Food uses `gmf_user[u] + gmf_offset[u]`, Fitness uses `gmf_user[u] + gmf_offset[U + u]`, and Media uses `gmf_user[u] + gmf_offset[2U + u]`. MLP uses its own corresponding vectors. A unit test changes only the Food offset and verifies the other two vectors stay unchanged. That is an architecture check, not a learned preference result.

Let U be global training users, Ud users in each domain, and I the sum of domain item counts. At the default dimensions, parameter counts are:

- A: `32 * (sum(Ud) + I) + 4851`
- B: `32 * (U + I) + 1757`
- C: `B + 96 * U`

For the test fixture (12 domain-only users, 4 per domain, 12 items per domain), instantiated counts are A **6,387**, B **3,293**, C **4,445**. These are not real three-domain model sizes. Actual counts are saved per run once the missing data is supplied. With disjoint users, shared user rows do not combine anyone's cross-domain history; only shared layers can transfer information. C also allocates offsets for user/domain combinations without observations, which remain untrained.

## Protocol

- Chronological 70/15/15 splits, moving boundary ties into the earlier partition. Independent domains may use per-domain splits; shared users need common global cutoffs or joint per-user timelines. The new loader preserves nested IDs and values that the original JavaScript normalizer would change; the old pipeline is untouched.
- User and item mappings use training positives only. Primary evaluation requires training history in the target domain for every variant, with cold rows reported, not silently treated as warm.
- The existing deterministic sampler draws up to four distinct unobserved items per positive from the target domain's training catalog. Training masks only training positives; validation masks train plus validation positives. No test identities enter the training mask. Future positives can consequently be sampled as unobserved negatives. This differs from the original baseline's all-known-positive mask, so results from those protocols must not be combined.
- Natural batches shuffle all examples. Balanced batches cycle each smaller pool to the largest domain's count and interleave domains. Batches of 512 have approximately equal representation; the last batch can be shorter. History records available examples and actual draws. Balanced epochs can have more optimizer steps, so this comparison is not compute-matched.
- Adam at 0.001, batch 512, d=16, MLP 32/16, up to 10 epochs, patience 3. Python/NumPy/PyTorch are seeded; CPU uses one thread and deterministic algorithms. Cross-version identity is not guaranteed.
- Fixed sampled validation BCE selects each independent model separately; shared models use mean per-domain validation BCE. For A, patience resets when any domain improves. Test rankings never select checkpoints.
- Ranking uses the full target-domain training catalog, excluding train/validation positives. Repeated test targets already in history are excluded and counted. Existing JavaScript metrics compute P@10, R@10 and nDCG@10 per domain; macro average is secondary. Ranked target positions are retained for a few diagnostic users. Scores are uncalibrated logits.
- Readiness checks reject missing warm splits, absent unseen warm test targets and catalogs with fewer than two items shared by multiple training users. These checks do not replace a scientific review of fitness item semantics.

MovieLens coverage remains limited: only 864 of 8,307 test positives are warm under this split (7,443 excluded). Validation has 1,286 warm out of 8,306. Do not present warm-subset metrics as results for the whole dataset.

## Run and verify

From the repository root, with the existing research environment:

```sh
# Audit only; no training or overwrite of existing experiments.
research/.venv/bin/python research/multidomain_experiment.py
research/.venv/bin/python -m unittest discover -s research -p 'test_*.py'

# After supplying valid data, use a separate config for each variant/balancing/seed.
research/.venv/bin/python research/multidomain_experiment.py --config PATH_TO_CONFIG --train
```

`--audit-output NEW_PATH` saves an audit and refuses to overwrite an existing file. Training also uses a new directory and saves only `best.pt`, `config.json`, `metrics.json` and `history.json`. Checkpoints include mappings and source hashes. Checkpoints, raw/processed data and `research/runs/` are already ignored. This runner executes one configuration; `amazon_replication.py` now aggregates the frozen Amazon matrix separately.

## Amazon source and interpretation

We acquired only the official [Amazon Reviews 2023 0-core ratings-only release](https://amazon-reviews-2023.github.io/data_processing/0core.html) from McAuley Lab. The four fields are `user_id`, `parent_asin`, `rating`, and millisecond `timestamp`. No review text, images or product descriptions were downloaded. The [authors' preprocessing script](https://github.com/hyp1231/AmazonReviews2023/blob/main/benchmark_scripts/kcore_filtering.py) carries original reviewer IDs through category processing without category-specific remapping. It removes repeated user/product reviews by keeping the earliest. Our counts describe that release, not the undeduplicated review corpus.

- Food = grocery/food product preference.
- Fitness = sports/outdoor product preference, not exercise behavior.
- Media = movie/TV product preference, not streaming history.

An account ID is evidence of the same source reviewer, not verified identity of a person. IDs are `amazon:user:<id>` across these three files, never joined to MovieLens or other datasets. Items are `food:amazon:<parent_asin>`, `fitness:amazon:<parent_asin>` and `media:amazon:<parent_asin>`. Positives use the existing `selected` action with the original rating in `value` and `source: amazon_reviews_2023`.

Raw files are under ignored `data/raw/amazon2023/`. The complete compressed files total 1,163,690,738 bytes. The ignored SQLite audit database stores count aggregates, not review text. Initial sandbox DNS failure was resolved by allowing the download process network access; no unofficial mirror was used.

## Amazon audit

| Domain/category | Accepted interactions | Users | Items | UTC date range |
| --- | ---: | ---: | ---: | --- |
| Grocery and Gourmet Food | 14,081,169 | 7,034,393 | 603,182 | 2000-08-09 to 2023-09-12 |
| Sports and Outdoors | 19,349,403 | 10,331,141 | 1,587,219 | 2000-05-01 to 2023-09-14 |
| Movies and TV | 17,158,519 | 6,503,429 | 747,764 | 1997-08-24 to 2023-09-12 |

One Grocery record had an invalid rating and was rejected; no other rejection occurred. Ratings must be finite whole-star values from 1 to 5. Timestamps must be integer milliseconds within the release's plausible date range. Missing IDs and malformed rows are counted, not repaired.

These counts cover all accepted ratings. Positive counts (rating >=4 in every category) are 10,681,064 / 15,307,261 / 13,754,959. Means, medians, rating distributions, timestamp endpoints and user-count thresholds are in [raw audit JSON](results/amazon_multidomain_raw_audit.json).

| Reviewer overlap | >=1 each | >=2 each | >=3 each | >=5 each | >=10 each |
| --- | ---: | ---: | ---: | ---: | ---: |
| Food / Fitness | 2,455,953 | 624,538 | 257,725 | 76,710 | 13,192 |
| Food / Media | 1,596,098 | 459,503 | 213,718 | 77,005 | 17,024 |
| Fitness / Media | 2,028,443 | 545,362 | 234,660 | 73,548 | 12,773 |
| All three | 822,562 | 196,639 | 78,196 | 21,754 | 3,277 |

With positive ratings only, three-way overlap is 606,908 / 137,853 / 52,934 / 14,226 / 2,044 at the same thresholds. Exact positive pairwise counts are also in [overlap JSON](results/amazon_multidomain_overlap.json). For all-rating three-way users, each domain's median history length is 2. The median largest/smallest domain ratio is 3; its 95th percentile is 15. Shared histories are often unbalanced.

Decision: **STRONG ENOUGH FOR THREE-DOMAIN SHARED-USER TRAINING**, specifically a limited warm-start pilot. This is a data-feasibility decision, not evidence that sharing helps.

## Fixed cohort and filtering

Before looking at model scores, we selected the lowest 1,000 SHA256 hashes of `42:<reviewer_id>` among the 14,226 users with >=5 positives in each category. This caps CPU/memory use reproducibly; it is not a search for favorable reviewers. Full positive histories give Food 16,673, Fitness 12,180 and Media 18,548 interactions. All 1,000 users occur in all three domains; 956 retain training history in all three after splitting.

We compared four iterative user/item thresholds **on training data only**, leaving held-out events in coverage accounting:

| User/item minimum | Food train | Fitness train | Media train | Three-domain train users |
| --- | ---: | ---: | ---: | ---: |
| 1/1 (no additional pruning) | 10,090 | 8,022 | 14,605 | 956 |
| 2/2 | 2,656 | 975 | 3,868 | 121 |
| 5/2 | 1,207 | 0 | 1,667 | 0 |
| 5/5 | 0 | 0 | 0 | 0 |

The 1/1 graph was retained: it is the least aggressive valid option. Calling this dataset 5-core would be wrong. Exact before/after user, item, interaction and shared-user counts are in [filter audit](results/amazon_multidomain_filter_audit.json). No model score was used in this decision.

## Time, coverage and balance

The pilot uses each reviewer's joint Food/Fitness/Media timeline, split 70/15/15 with equal timestamps kept together. Sorted reviewer IDs make training order independent of input-file order. All 1,000 users pass the strict train-before-validation/test and validation-before-test checks, with zero violations.

Independent domain timelines were rejected because they can expose future auxiliary-domain history for the same reviewer. A single absolute cutoff across all users is stricter about cross-user calendar time; that remains an option in the code. **This per-user pilot is retrospective, not a globally point-in-time deployment simulation:** other users' training events may occur after a target user's test time. Cohort eligibility also uses full-history counts. Neither limitation is hidden by the per-user leakage check.

| Domain | Train users/items | Warm test positives / all test positives | Warm test users / test users |
| --- | --- | --- | --- |
| Food | 974 / 8,169 | 804 / 3,548 | 455 / 889 |
| Fitness | 985 / 7,135 | 270 / 2,248 | 221 / 798 |
| Media | 997 / 12,061 | 354 / 1,790 | 212 / 517 |

These are substantial cold-item exclusions. All models use the same warm targets and full target-domain training catalogs. Users without target-domain training history cannot be evaluated fairly against independent Model A and are counted as excluded. No domain is empty, but these metrics do not represent every reviewer or product.

Training proportions are Food 30.84%, Fitness 24.52%, Media 44.64%. Natural and balanced modes are compared at seed 42. With four negatives per positive, natural draws are 50,450 / 40,110 / 73,025 examples per epoch. Balanced mode draws 73,025 per domain, repeating 22,575 Food and 32,915 Fitness examples. It does not introduce new interactions; it also uses more optimizer steps.

The real retained mappings yield A **975,123**, B **909,437**, C **1,005,437** parameters. The earlier fixture counts are architecture checks only.

## Seed-42 pilot results

All six fixed variant/batching configurations completed, with a second identical-seed run for each. Checkpoint reload reproduced evaluation, and the repeat runs matched training histories and domain metrics exactly. Predictions were finite, nonconstant across sampled users/items, and all domains contributed training examples. Train BCE decreased in every configuration. The table below retains the original seed-42 pilot; the three-seed replication follows it.

| Batching / model | Food nDCG@10 | Fitness nDCG@10 | Media nDCG@10 | Macro nDCG@10 |
| --- | ---: | ---: | ---: | ---: |
| Natural A | 0.004146 | 0.003120 | 0.000921 | 0.002729 |
| Natural B | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| Natural C | 0.000850 | 0.000000 | 0.001572 | 0.000808 |
| Balanced A | 0.007407 | 0.013824 | 0.000000 | 0.007077 |
| Balanced B | 0.007074 | 0.011263 | 0.001978 | 0.006772 |
| Balanced C | 0.005693 | 0.016827 | 0.001673 | 0.008064 |

The [pilot JSON](results/amazon_multidomain_pilot.json) contains unrounded Precision@10, Recall@10 and nDCG@10 for every domain, macro values, exact differences from A, target-rank examples, checkpoint paths and checks. No result was replaced with a better seed.

Natural B has no top-10 hits and underperforms A in every domain. Natural C improves Media nDCG slightly over A, but not Food or Fitness. With balanced batches, B loses Food/Fitness nDCG relative to A; C recovers Fitness (C-A = +0.003004, C-B = +0.005564) but further reduces Food (C-A = -0.001714). Both shared models get a few Media hits where balanced A gets none. Balanced C has the highest macro nDCG here, but not the highest macro precision, and its Food result is worse. It is not an overall winner established by this experiment.

Absolute ranking accuracy is low. Sparse products, cold exclusions and validation selection by sampled BCE limit what this pilot shows. Lower training loss does not establish good ranking: natural B's train BCE falls from 0.530321 to 0.363022 despite zero top-10 hits. The other first/last losses are saved alongside it. Natural A completed 8 epochs; natural B/C completed 5; balanced A/B/C completed 6. Validation selected earlier checkpoints, not the final training epoch.

An input-order test found a per-user iteration-order issue before the final runs. We fixed it, stopped that preliminary run, and restarted all reported configurations. Its earlier local checkpoint is ignored and excluded from the comparison; no frozen MovieLens result was touched. The retained cohort has no parent IDs crossing category boundaries and no duplicated reviewer/parent/timestamp events across categories.

At the pilot stage, transfer effects were mixed and unreplicated. Same-seed repetition checked reproducibility, not uncertainty. Seeds 43/44 have now completed under the unchanged protocol below.

## Frozen three-seed replication

All six configurations ran once at seed 43 and once at seed 44. Before these runs, natural A at seed 42 reproduced its saved metrics, history and checkpoint tensors exactly. Source files, cohort, mappings, splits, configuration and core code were fingerprinted. Dataset SHA256: `e737299b20e9cb40987227a88dc507cec6f3cbb0692a2886863c1d59061adc02`. An observer checked the actual evaluated candidates against the same per-user candidate hashes for every model. No architecture, sampling, filtering or checkpoint-selection rule changed.

Values below are nDCG@10 mean +/- **sample SD** across seeds 42/43/44, not confidence intervals. [Summary JSON](results/amazon_multidomain_summary_3seed.json) also retains per-domain Precision/Recall, secondary macro metrics, seed-level paired counts and transfer deltas. These are warm-subset ranking results, not whole-dataset accuracy.

| Mode/model | Food | Fitness | Media |
| --- | --- | --- | --- |
| Natural A | .004763 +/- .000613 | .007343 +/- .004706 | .003191 +/- .002587 |
| Natural B | .001214 +/- .002102 | .009413 +/- .008197 | .001804 +/- .003124 |
| Natural C | .003083 +/- .002392 | .002699 +/- .003561 | .001809 +/- .001938 |
| Balanced A | .004998 +/- .002280 | .016609 +/- .002705 | .001523 +/- .001397 |
| Balanced B | .006760 +/- .000917 | .011502 +/- .000535 | .001833 +/- .000300 |
| Balanced C | .008327 +/- .003070 | .011498 +/- .006674 | .001716 +/- .001082 |

| Mode/domain | B-A mean +/- SD | C-A mean +/- SD | C-B mean +/- SD |
| --- | --- | --- | --- |
| Natural Food | -.003549 +/- .002184 | -.001680 +/- .002209 | +.001869 +/- .000974 |
| Natural Fitness | +.002070 +/- .004962 | -.004644 +/- .001348 | -.006714 +/- .006095 |
| Natural Media | -.001388 +/- .001101 | -.001383 +/- .001779 | +.000005 +/- .001565 |
| Balanced Food | +.001762 +/- .002553 | +.003329 +/- .005284 | +.001567 +/- .002812 |
| Balanced Fitness | -.005107 +/- .002323 | -.005111 +/- .007894 | -.000004 +/- .006479 |
| Balanced Media | +.000311 +/- .001456 | +.000193 +/- .002004 | -.000118 +/- .001364 |

Natural A has the highest Food/Media means; B has the highest Fitness mean but large variation. Balanced C leads Food, A leads Fitness, and B has a small Media lead. Natural B loses to A on Food and Media in all three seeds. Balanced B loses Fitness in all three. The seed-42 balanced C Fitness gain does not repeat in seeds 43/44. **Results are mixed; there is no overall architecture winner or claim of statistical significance.**

Paired nDCG counts below are improved/unchanged/worsened, summed over three seeds. They are user-seed observations, not distinct people; unchanged nDCG does not imply an identical full ranking.

| Mode/domain | B vs A | C vs A | C vs B |
| --- | --- | --- | --- |
| Natural Food | 7/1335/23 | 14/1330/21 | 15/1345/5 |
| Natural Fitness | 10/643/10 | 3/649/11 | 2/651/10 |
| Natural Media | 3/628/5 | 2/628/6 | 2/631/3 |
| Balanced Food | 25/1320/20 | 33/1312/20 | 23/1327/15 |
| Balanced Fitness | 11/633/19 | 7/638/18 | 9/642/12 |
| Balanced Media | 3/630/3 | 4/629/3 | 4/630/2 |

### Zero results and coverage

Natural B's seed-42 best positive ranks were 19/38/11, outside top 10 in every domain. Its within-user logit SD averaged .0228/.0221/.0231: weak separation, but not constant predictions. All parameter tensors changed from initialization and training BCE decreased. The selected checkpoint also had zero validation nDCG. Other epoch checkpoints were not retained, so we cannot say validation ranking was zero at every epoch. Seed 43 gets hits in all three domains; seed 44 gets Fitness hits only. The all-zero result is not universal. Balanced B at seed 42 has wider score separation and 11/7/2 top-10 hits. Sampled BCE and ranking quality disagree; these observations do not prove imbalance caused the zeros or identify an implementation defect.

| Domain | Total / warm / cold-item positives | Warm / cold % | Cold-affected users | Users with 0 / 1 / 2+ warm positives |
| --- | --- | --- | --- | --- |
| Food | 3548 / 804 / 2713 | 22.66 / 76.47 | 820 | 434 / 273 / 182 |
| Fitness | 2248 / 270 / 1970 | 12.01 / 87.63 | 760 | 577 / 176 / 45 |
| Media | 1790 / 354 / 1435 | 19.78 / 80.17 | 465 | 305 / 145 / 67 |

Another 31/8/1 positives have known items but no target-domain training history. They are excluded, but are **not cold items**. No item was removed by the retained 1/1 filter and no whole user was held out of training.

| Domain | Training items with frequency 1 / 2 / 3-4 / 5-9 / 10+ | Median evaluation candidates | Mean training history |
| --- | --- | --- | --- |
| Food | 7029 / 774 / 275 / 84 / 7 | 8162 | 10.36 |
| Fitness | 6525 / 451 / 138 / 20 / 1 | 7129 | 8.14 |
| Media | 10436 / 1183 / 348 / 81 / 13 | 12046 | 14.65 |

Most cold test items occur only once in the retained cohort (2404/2610 Food, 1850/1925 Fitness, 1321/1388 Media). Their median full-source review counts are 73/55/56, so cohort sparsity matters: these are not generally globally unique products. Full-source counts include all ratings and do not establish product release dates. Media has the largest candidate catalog and many singleton items, but also the most training interactions and longest histories. Its weak scores cannot simply be blamed on too few training rows. [Coverage audit](results/amazon_multidomain_coverage.json) records the detailed partitions and frequencies.

### Balance, budget and next experiment

Natural epochs process 50,450/40,110/73,025 examples (30.84%/24.52%/44.64%), totalling 163,585 examples and 320 optimizer steps. Balanced epochs process 73,025 each (33.33% each), totalling 219,075 examples and 428 steps. Food repeats 22,575 examples and Fitness 32,915; Media repeats none. Balanced mode adds 33.75% more steps per epoch. Early stopping also changes the total budget:

| Mode/model | Total steps: seed 42 / 43 / 44 |
| --- | --- |
| Natural A | 2560 / 2240 / 2560 |
| Natural B | 1600 / 2240 / 1280 |
| Natural C | 1600 / 2240 / 1280 |
| Balanced A | 2568 / 2996 / 2568 |
| Balanced B | 2568 / 2568 / 2568 |
| Balanced C | 2568 / 2140 / 2140 |

[Training balance](results/amazon_multidomain_training_balance.json) records every original epoch's losses, draws, repeated examples and steps, plus total examples. Those original runs confounded balance with update budget. The later [equal-step control](EQUAL_STEP_CONTROL.md) fixes that budget while preserving these original results.

The replication recommended examining Natural B's validation ranking at every epoch without changing training or checkpoint selection. That diagnostic is now complete below; no tuning or scaling was done.

New diagnostic code is in `amazon_diagnostics.py`, replication orchestration in `amazon_replication.py`, and six focused tests in `test_amazon_replication.py`. The [freeze](results/amazon_multidomain_freeze.json), [seed-42 diagnostics](results/amazon_multidomain_seed42_diagnostics.json), [seed 43](results/amazon_multidomain_seed43.json) and [seed 44](results/amazon_multidomain_seed44.json) preserve reproduction checks, run paths and diagnostics separately from the original pilot. The replication script refuses to overwrite these outputs; do not rerun completed seeds.

## Natural B training diagnosis

The existing runs contained loss histories and only `best.pt`, not per-epoch checkpoints or rankings. We therefore reran only Natural B at seeds 42/43/44 with an optional epoch observer. All three histories, selected checkpoint tensors and test metrics reproduced exactly. Balanced B was not retrained. Its loss curves and selected-checkpoint diagnostics are available, but its per-epoch ranking curves remain unavailable. Original replication artifacts were not changed.

[natural_b_diagnostics.json](results/natural_b_diagnostics.json) stores every validation epoch, positive-rank quartiles/cutoffs, positive and unobserved-candidate score distributions, margins, embedding norms/cosines, prediction probes and budget ratios. Scores are logits; unobserved candidates are not confirmed negative preferences. Distribution SDs use the population formula. Margins compare each warm positive with its own user's mean unobserved-candidate score, not with a pooled global mean.

Validation nDCG@10 below uses warm validation targets, training-only history exclusion and the unchanged training item catalogs. No test rankings selected checkpoints.

| Seed / epoch | Food | Fitness | Media |
| --- | ---: | ---: | ---: |
| 42 / 1 | .001982 | .000000 | .000000 |
| 42 / 2 (selected) | .000000 | .000000 | .000000 |
| 42 / 3 | .000000 | .000000 | .000476 |
| 42 / 4 | .000598 | .000992 | .005409 |
| 42 / 5 | .002570 | .001283 | .007492 |
| 43 / 1 | .000000 | .000000 | .004142 |
| 43 / 2 | .000000 | .000000 | .001712 |
| 43 / 3 | .002151 | .004902 | .001844 |
| 43 / 4 (selected) | .007241 | .016577 | .003986 |
| 43 / 5 | .006126 | .016285 | .005342 |
| 43 / 6 | .006768 | .012283 | .004544 |
| 43 / 7 | .007087 | .013210 | .003623 |
| 44 / 1 (selected) | .000481 | .009987 | .001031 |
| 44 / 2 | .000000 | .000809 | .000000 |
| 44 / 3 | .001078 | .000000 | .001743 |
| 44 / 4 | .002476 | .004184 | .000369 |

Checkpoint selection minimizes the unweighted mean of the three sampled validation BCE losses, with patience 3. Seed 42 selects epoch 2, while all domains peak in ranking at epoch 5. Its training BCE falls .530321 -> .363022, while validation BCE reaches its minimum .500485 at epoch 2 and rises to .523026 by epoch 5. Better BCE does not imply better ranking. Seed 43 selects epoch 4, also the Food/Fitness ranking peak; Media peaks at 5. Seed 44 selects epoch 1, matching Fitness's peak, while Food/Media peak at 4/3. Different peaks suggest a trade-off, not proven gradient conflict. Macro validation nDCG peaks at 5/4/1: the BCE-selected epoch misses the macro peak only in seed 42, although it misses 6 of 9 domain-specific peaks.

| Natural seed | Median positive ranks Food / Fitness / Media | Mean within-user margins Food / Fitness / Media | Candidate logit SD Food / Fitness / Media |
| --- | --- | --- | --- |
| 42 | 3936 / 3659.5 / 5726.5 | -.000033 / -.001594 / .002336 | .023131 / .022333 / .023424 |
| 43 | 3064.5 / 2541 / 5594 | .158766 / .112887 / .050486 | .254638 / .227519 / .268973 |
| 44 | 4066 / 3473.5 / 6065.5 | .000427 / .002860 / .000804 | .037388 / .036892 / .037199 |

At seed 42, 99.63%/99.63%/98.31% of positive items are outside top 50. The zeros are not mainly near-misses at ranks 11-30. The fraction of positives above their user's mean unobserved score is 51.24%/48.52%/51.98%; seed 43 reaches 60.32%/60.37%/51.13%, while seed 44 remains 47.26%/50.00%/47.74%. These diagnostics use exactly the same 804/270/354 warm test positives as the primary evaluation. Cold-item coverage remains a separate limitation.

Natural B processes 50,450/40,110/73,025 examples per epoch (30.84%/24.52%/44.64%). Warm validation positives are 791/297/493; warm test positives are 804/270/354. Media contributes the most training examples, but that does not establish gradient dominance. Historical gradients were not retained; per-domain backward instrumentation was skipped to keep this diagnostic limited to an epoch observer and checkpoint inspection.

| Seed | Natural steps / examples | Balanced steps / examples | Balanced:natural steps / examples |
| --- | --- | --- | --- |
| 42 | 1600 / 817925 | 2568 / 1314450 | 1.6050 / 1.6071 |
| 43 | 2240 / 1145095 | 2568 / 1314450 | 1.1464 / 1.1479 |
| 44 | 1280 / 654340 | 2568 / 1314450 | 2.0063 / 2.0088 |

Balanced B selects epoch 3 in all three seeds and has larger mean positive margins: Food .169-.252, Fitness .081-.170, Media .033-.069. It generally separates scores more strongly, but its ranking is still weak, and its test nDCG does not beat Natural B in every seed/domain. Extra training steps and repeated examples prevent attributing the difference to balancing alone.

Natural domain-vector norms are .319-.553 and off-diagonal cosine similarities are .9940-.9999. The vectors are nearly parallel, though not identical; Balanced B also has near-parallel domain vectors. For the first 16 shared training users, mean pairwise GMF-user cosine is -.013/-.013/-.017 and MLP-user cosine is .951/.961/.914 across seeds. Thus the MLP representation is strongly aligned, but the GMF representation is not collapsed. Deterministic 16-user by 16-item probes show nonzero variation both across users and items. This small sample is not proof about every user, and cosine similarity does not establish semantic meaning or causality.

**Diagnosis:** insufficient ranking separation and seed sensitivity, with a checkpoint-selection mismatch most clearly demonstrated at seed 42. Some representations are highly aligned, but there is no complete constant-prediction collapse. Imbalance and domain conflict remain possible contributors, not established causes. No model or optimizer defect was demonstrated by these checks.

The proposed checkpoint-selection comparison is now complete. See [Checkpoint Selection](CHECKPOINT_SELECTION.md) for the separate 18-run comparison. The original replication and diagnostic results above remain unchanged. Selection mattered, but higher validation ranking did not always generalize to test ranking.

Validation: 54/54 tests pass, including four diagnostic tests for rank cutoffs, score summaries, checkpoint ties and exact observer/non-observer training equality. Python compilation and JSON/whitespace checks pass. No application files or existing result artifacts were modified.

## Amazon commands and artifacts

```sh
research/.venv/bin/python research/amazon_data.py --download
research/.venv/bin/python research/amazon_data.py --audit
research/.venv/bin/python research/amazon_data.py --prepare --cohort-limit 1000
research/.venv/bin/python research/amazon_data.py --validate
research/.venv/bin/python research/amazon_pilot.py --modes natural balanced
research/.venv/bin/python -m unittest discover -s research -p 'test_*.py'
```

Acquisition retries transient failures and retains completed files. Parsing is streaming; user/item counts are flushed in batches to SQLite. Audit/preparation refuse to overwrite prior output paths. Use explicit new `--database`, `--prepared-dir` and `--results-dir` paths for a new audit, not a reset of existing experiments.

`research/results/amazon_multidomain_*.json` contains raw statistics, overlap, filter comparisons and manifests. The original dataset manifest records the raw audit; the prepared manifest adds hashes, filter rules, cohort size and temporal protocol. Prepared interactions/config and checkpoints stay ignored. Only small aggregate results belong in Git.

Validation: 50 research tests pass, including all 44 pre-replication tests. The six new tests cover actual candidate equality, artifact isolation, mean/sample-SD and paired deltas, coverage classification, and oversampling/optimizer-step accounting. Python compilation and whitespace checks pass. Raw and prepared file sizes/hashes match their manifests.

Food.com and FitRec were not downloaded. The live restaurant application and all frozen MovieLens experiments are unchanged. The earlier MovieLens result remains the clearest trained improvement over Most Popular under its own protocol; do not compare those metrics directly with this Amazon pilot.

## Equal-step control

The completed [equal-step control](EQUAL_STEP_CONTROL.md) compares Natural and Balanced sampling for A/B/C at six seeds (42–47), with 3,200 optimizer steps per run. The six-seed result does not show a universal benefit: Balanced improves Model C Food nDCG in all six seeds and Model A Fitness in five, while other effects vary by model/domain. Warm-item coverage remains low, so cohort construction is the next research issue. The original pilot and three-seed artifacts remain unchanged.

## References and boundaries

- [He et al., Neural Collaborative Filtering, WWW 2017](https://doi.org/10.1145/3038912.3052569): GMF/MLP/NeuMF and implicit feedback.
- [Microsoft Recommenders](https://github.com/recommenders-team/recommenders): reference for data/model/evaluation workflow, not an installed dependency.
- [C2DSR](https://github.com/cjx96/C2DSR): cross-domain research and leakage considerations, not a reproduced architecture.
- [SyNCRec / Pacer and Runner](https://github.com/cpark88/SyNCRec): motivation for separating shared and domain-specific learning and examining negative transfer. No cooperative sequential architecture is implemented here.

No neural model from this phase is connected to React or Node inference.
