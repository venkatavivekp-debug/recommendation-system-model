# Offline Recommendation Experiments

This experiment trains a small NeuMF model and compares it with Most Popular on MovieLens 100K. NCF is the baseline model for later experiments. The React/Node application continues to use its existing heuristic scorer.

The separate [three-domain experiment](MULTIDOMAIN.md) adds independent, shared and domain-specific-offset NeuMF variants and an Amazon category-overlap audit. It studies product preferences using shared reviewer IDs. Its data and evaluation protocol do not replace, or directly compare with, the MovieLens experiments below. The later [V2 coverage audit and single feasibility pilot](COVERAGE_COHORT.md) use an expanded cohort; the pilot is not a controlled comparison with V1.

## Setup

Run these commands from the repository root. Python 3.9 or newer and Node.js are required. The tested environment uses Python 3.9.6, PyTorch 2.8.0, and NumPy 2.0.2 on CPU. Direct dependencies are pinned in `requirements.txt`.

```sh
python3 -m venv research/.venv
research/.venv/bin/python -m pip install -r research/requirements.txt
mkdir -p data/raw
curl --fail --location --output data/raw/ml-100k.zip https://files.grouplens.org/datasets/movielens/ml-100k.zip
unzip -n data/raw/ml-100k.zip 'ml-100k/u.data' 'ml-100k/README' -d data/raw
```

MovieLens 100K has 100,000 ratings from 943 users on 1,682 movies. Use the official [GroupLens release and terms](https://files.grouplens.org/datasets/movielens/ml-100k-README.txt). Cite Harper and Konstan, *The MovieLens Datasets: History and Context* (2015) in the report. Do not redistribute the downloaded data. Raw data, virtual environments, and generated run artifacts are ignored by Git.

## Data And Evaluation Protocol

- `rating >= 4` is positive by default: four and five stars are a clear liking signal. Change it with `--threshold`. Lower ratings are not explicit negative labels; their items remain eligible as unobserved negatives for that user.
- Canonical rows retain the external user ID, `media:<movieId>`, UTC timestamp, domain, action, and context. `selected` is a positive-label adapter here, not a claim that a MovieLens user clicked the application. The raw file and its SHA-256 preserve the original ratings.
- We reuse `recommendationData.js` in global temporal mode (`perUser: false`), with 70% train, 15% validation, and 15% test. Equal timestamps at a boundary go into the earlier partition, so the actual fractions can differ slightly. All training events precede validation, which precedes test. This differs intentionally from the foundation's per-user default to avoid cross-user future events in training.
- Contiguous user/item mappings are fitted on training positives only. Validation/test rows with an unseen user or item are excluded from this warm-start experiment and counted in `coverage`. Training is not refitted on validation data.
- Sample up to four distinct negatives per positive, without replacement within that example, from the training media catalog. Sampling is user-aware and deterministic, and refreshed each epoch. The single-domain catalog makes cross-domain negatives impossible. Python uses its seeded sampler for efficient tensor preparation; its samples need not be bit-for-bit identical to JavaScript's PRNG.
- All known positive items, including held-out positives, are excluded from negative sampling. This is an offline exclusion mask, so training does consult future item identities to avoid false negatives. No held-out positive is used as a training target or feature. This meets the known-positive exclusion rule but is not a strictly history-only online simulation.
- Validation BCE uses a fixed sampled set. The lowest validation loss selects the checkpoint; test scores are not used to select epochs. This selection criterion need not maximize ranking quality.
- Test ranking scores **every item in the training catalog**, excluding that user's training and validation positives. Test positives are retained as targets. Most Popular counts only training positives and uses exactly the same candidates. Ties use the integer item index, which comes from sorted external IDs.
- Precision@K, Recall@K, and binary nDCG@K are macro-averaged over warm test users. Precision divides by K even for shorter lists. Metrics call the existing `rankingMetrics.js` in one batch; there is no separate Python metric implementation.

The strict global split has substantial cold-start exclusion in this dataset. Read the coverage counts alongside the metrics; results are not an evaluation of all MovieLens users or items.

## Model And Training

Each user and item has separate 16-dimensional embeddings for two branches:

1. GMF: elementwise user/item embedding multiplication gives 16 features.
2. MLP: concatenate user/item embeddings, then Linear(32,32), ReLU, Linear(32,16), ReLU.
3. Concatenate both branches (32 features), then Linear(32,1) to produce a preference logit.

This follows the GMF/MLP combination from [Neural Collaborative Filtering](https://arxiv.org/abs/1708.05031). It is trained jointly from scratch, without branch pretraining. The logit ranks candidates; its sigmoid should not be reported as calibrated recommendation confidence.

`BCEWithLogitsLoss` fits binary observed-positive versus sampled-unobserved labels and combines the sigmoid with the loss for numerical stability. This is appropriate for an implicit baseline; it does not predict star ratings. Unobserved items are not confirmed dislikes.

Defaults: Adam, learning rate 0.001, 10 epochs, batch size 512, 4 negatives per positive, seed 42, and K=10. Embedding size, hidden sizes, threshold, split ratios, and these training parameters are CLI options. Python, NumPy, and PyTorch seeds are set. CPU uses one thread and deterministic algorithms. Exact reproducibility across PyTorch versions and platforms is not guaranteed; see [PyTorch's reproducibility notes](https://docs.pytorch.org/docs/stable/notes/randomness.html).

```sh
# Preprocessing dry run; prints split counts and coverage.
research/.venv/bin/python research/data.py

# Run the small tests, including a synthetic training/reload check.
research/.venv/bin/python -m unittest discover -s research -p 'test_*.py'

# Train and evaluate both baselines.
research/.venv/bin/python research/train.py --epochs 10 --seed 42

# Replace RUN_DIRECTORY with the directory printed by training.
research/.venv/bin/python research/evaluate.py research/runs/RUN_DIRECTORY --k 10
```

Each run creates a new UTC-timestamped directory in `research/runs/`:

- `data.json`: canonical split rows, indexed pairs, mappings, coverage, and source checksum
- `best.pt`: best model weights, epoch, architecture, mappings, configuration, and source checksum
- `result.json`: both baselines' metrics, loss history, parameters, runtime, package versions, protocol, and coverage
- `evaluation-<timestamp>.json`: a separate result from an explicit evaluation command

Runs never silently overwrite an earlier run. Only load locally generated, trusted checkpoints. `--output` changes the run directory; keep generated weights and data out of Git.

## Experiment 1: Most Popular Vs NCF

The first run (2026-09-27, default settings, seed 42) trained 65,425 parameters in 9.39 seconds on CPU. Epoch 4 had the lowest validation BCE. It used 38,762 training positives from 666 users and 1,328 movies. Evaluation covered 864 of 8,307 test positives from 50 of 205 test users; the other positives had an unseen user or item.

| Model | Precision@10 | Recall@10 | nDCG@10 |
| --- | ---: | ---: | ---: |
| Most Popular | 0.112000 | 0.070971 | 0.128546 |
| NeuMF | 0.120000 | 0.086811 | 0.155563 |

NeuMF scored higher in this run. These numbers describe the eligible warm subset under this protocol, not a general claim of superiority. The full run is in `research/runs/20260927T203458035652Z/result.json` locally; a fresh clone must generate its own artifacts.

A second run with the same configuration reproduced every epoch's losses, the selected checkpoint epoch, and all ranking metrics exactly. Reloading the first checkpoint in the standalone evaluator also reproduced the reported metrics. This checks repeatability on the tested machine; it is not a second independent seed experiment.

Experiment 1 implements Most Popular and NCF. Its original weights, data, and results remain frozen. The separate context experiment below extends the same pipeline; it does not replace the original control.

## Experiment 2: NCF Vs Temporal Context

The research question is whether query-time temporal features improve the frozen NCF baseline. MovieLens provides a rating timestamp in UTC. We derive hour (0-23) and weekday (Monday=0), each encoded as sine and cosine: four values total. These values describe when the recommendation is requested. There is no fitted scaler or category vocabulary, so test data cannot influence an encoder. Weekend is omitted because weekday already supplies that information. Movie genres are item attributes, not query context, and are not included.

These are rating submission times, not verified viewing times. UTC is used because user time zones are unavailable. There are no food, fitness, mood, or device features in this experiment.

The context model keeps both collaborative branches. It appends four values to the MLP input, giving `36 -> 32 -> 16` with ReLU. GMF and the final output layer are unchanged. At the same seed, all shared weights start exactly as in NCF; the four added columns start at zero and are trainable. This avoids changing every initial weight merely because the input shape changed. Parameter counts are 65,425 for NCF and 65,553 for context: 128 additional parameters (about 0.20%).

Each training/validation positive and its sampled negatives receive that positive event's context. Sampling and shuffle seeds are shared with the baseline. At test time, the frozen evaluation produces one ranking per user, targeting all that user's eligible test positives. We use the **first eligible test timestamp** as that user's query time and broadcast the same context across every candidate. Later targets' timestamps are not passed to the scorer. This preserves the exact frozen candidates, relevance sets, metrics, and macro-user aggregation. It is a test-period ranking task, not an event-by-event or next-item evaluation; a single initial context may be a weak predictor over a long test period.

### Protocol And Cold-Start Audit

Protocol A remains the global chronological 70/15/15 split. The disjoint positive-interaction counts are:

| Partition | Unseen user only | Unseen item only | Both unseen | Warm |
| --- | ---: | ---: | ---: | ---: |
| Validation | 6,853 | 64 | 103 | 1,286 |
| Test | 7,209 | 50 | 184 | 864 |

There are 149 distinct unseen test users and 81 distinct unseen test items. Most excluded positives belong to users whose positive history starts after the training cutoff. Of 205 test users, only 50 have eligible warm test positives. Six additional users have training identities but only unseen items in their test positives.

No Protocol B was added. The current filtered evaluation already measures the warm subset of a global temporal holdout. Moving late users' interactions into training would break the fixed cutoff; a per-user split would change the control and permit cross-user temporal overlap. A separate deployment question could justify a later rolling-cutoff experiment, but increasing coverage is not a reason to alter this context comparison.

The original negative-sampling limitation still applies: all known positives, including held-out identities, form an exclusion mask. They are not training targets or input features, but this is not fully history-only sampling. The context experiment inherits this choice so the control remains comparable.

### Run The Comparison

```sh
# Optional single context run, using the same defaults as the baseline.
research/.venv/bin/python research/train.py --context --seed 42

# Six runs: unchanged NCF and context, each at seeds 42, 43, and 44.
research/.venv/bin/python research/compare_context.py research/runs/20260927T203458035652Z
```

On a fresh clone, generate a baseline first and supply its run directory. The comparison reads the frozen configuration, reproduces its checkpoint evaluation, checks seed-42 baseline loss history and metrics, and checks that every new dataset matches the original splits and mappings exactly. Each model uses Adam, lr=0.001, 10 epochs, batch size 512, four negatives, threshold 4, and K=10. Each run selects its own best checkpoint using the same validation BCE rule; test results do not select checkpoints.

Runs are saved below a new `research/runs/context-<timestamp>/` directory. `comparison.json` records each seed, checkpoint epoch, parameter count, training time, coverage audit, and mean/sample standard deviation (`ddof=1`). Checkpoints and data use the existing run format. `evaluate.py` reloads either model using its saved architecture. All generated datasets, weights, and runs remain Git-ignored.

### Observed Context Results

The comparison is saved locally at `research/runs/context-20260927T204448123967Z/comparison.json`. Each timing below covers all ten training epochs, validation, sampling, and checkpoint writes; it excludes preprocessing and final ranking evaluation.

| Seed | Model | Precision@10 | Recall@10 | nDCG@10 | Best epoch | Training seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 42 | NCF | 0.120000 | 0.086811 | 0.155563 | 4 | 9.45 |
| 42 | NCF + Context | 0.120000 | 0.079080 | 0.153958 | 4 | 11.72 |
| 43 | NCF | 0.116000 | 0.077300 | 0.152300 | 3 | 9.34 |
| 43 | NCF + Context | 0.118000 | 0.078447 | 0.155734 | 3 | 11.76 |
| 44 | NCF | 0.112000 | 0.072063 | 0.140914 | 3 | 9.47 |
| 44 | NCF + Context | 0.116000 | 0.074669 | 0.145283 | 4 | 11.87 |

Mean +/- sample standard deviation across the three seeds:

| Model | Precision@10 | Recall@10 | nDCG@10 |
| --- | ---: | ---: | ---: |
| NCF | 0.116000 +/- 0.004000 | 0.078725 +/- 0.007477 | 0.149593 +/- 0.007691 |
| NCF + Context | 0.118000 +/- 0.002000 | 0.077399 +/- 0.002385 | 0.151658 +/- 0.005592 |

The outcome is mixed. Temporal context slightly increased mean precision and nDCG, but reduced mean recall. Seed 42 tied on precision and worsened on recall/nDCG, while seeds 43 and 44 improved. Three seeds on the same 50 users do not establish statistical significance or a general improvement. UTC rating times, the long test horizon, cold-start exclusions, and the inherited held-out exclusion mask limit the conclusion. We did not tune after seeing the test results or add more variants to find a win.

All 12 Python tests pass, including shared positive/negative context, candidate-wide query context, baseline initialization, timestamp conversion, unchanged mappings, and deterministic training/checkpoint reload for both models. Frozen baseline evaluation and seed-42 training reproduce exactly; SHA-256 checks confirm its original data, weights, and results are unchanged. The standalone context evaluator reproduces the saved metrics. Backend syntax, 14 backend tests, adaptive validation (3 users / 18 interactions), frontend lint, and frontend build pass. The build retains the existing Node/Vite version warning.

Cross-domain learning still needs a defensible dataset with linked users across domains. MovieLens alone does not supply that evidence, and unrelated dataset user IDs must not be treated as shared people. Learned cross-domain transfer, delayed-reward learning, and live Python inference remain unimplemented. The following experiment adds offline user-embedding adaptation, separate from the application's heuristic feedback system.

## Experiment 3: Static Vs Adaptive NCF Replay

**Question:** Can a trained NCF model improve subsequent rankings by updating its user representation from newly observed ratings, compared with the same frozen model?

This is real gradient-based adaptation, not a score bonus. It runs only in Python. It does not call the application's feedback, bandit, food, or cross-domain services. Earlier checkpoints, splits, and results are unchanged.

### Feedback And Paired Control

The replay reads original MovieLens ratings: 4-5 are positive preference, 1-2 are explicit low preference, and 3 is neutral. These are ratings, not clicks, saves, or ignored recommendations. Neutral ratings advance history and remove the rated item from subsequent candidates, but contribute no gradient.

The old checkpoints used future-positive identities in their negative exclusion masks. Reusing those weights would undermine a causal comparison. Instead, we train three separate plain NeuMF checkpoints with the same splits, mappings, architecture, and training settings, at seeds 42, 43, and 44. Training negatives exclude **training positives only**. Validation negatives exclude training and validation positives, never test positives. Each checkpoint is selected by validation BCE; all three selected epoch 2. There is no refit on validation ratings. These new controls must not replace the frozen NCF results above.

Each pair starts from the exact same new checkpoint. Both arms see the same chronological ratings, catalog, and already-rated-item history. The static arm always uses the checkpoint's original user vectors. The adaptive arm keeps two local copies of the current user's 16-dimensional vectors, used in the same NeuMF forward pass through `torch.func.functional_call`.

Only the local copies of `gmf_user.weight[user]` and `mlp_user.weight[user]` receive gradients: **32 values per user**. Item embeddings, MLP weights, output weights, and all other users remain fixed. The original checkpoint object is never modified. Local vector changes persist through that user's replay, then are discarded; this is not a deployed online-training service.

### Replay Protocol

- The fixed test cutoff is `1998-03-27T22:36:24Z`, inherited from the frozen validation boundary. The catalog contains the same 1,328 training movies. Users need a training identity and at least five actual ratings by that cutoff. Eligibility does not depend on whether adaptation helps them.
- Pre-cutoff ratings of every star value initialize the seen-item history, but do not update the vectors. At each subsequent timestamp, candidates are all training-catalog items minus this user's previously rated items. Future-rated items remain candidates. The current group is not excluded before prediction.
- Both arms rank the entire candidate set **before** the timestamp group's ratings are revealed. All tied events share that pre-update prediction. Then one update uses the group's nonneutral, warm-catalog ratings, and the entire group enters the history. Cold items have no learned embedding and are counted but not adapted.
- Updates use mean binary cross-entropy on the group's observed ratings, with labels 1 for positive and 0 for low preference. No new negative samples are invented during replay. There is **one SGD step per nonneutral timestamp group**, not one per event within a tie. Learning rate is **0.05**, combined gradient-norm clipping is **1.0**, and the combined vector displacement is bounded by **0.05** per group. There is no momentum or weight decay.
- These conservative adaptation settings were fixed before the first replay, not selected using test metrics. They were not tuned on validation either. `protocol.json` is written before training starts. The frozen training configuration remains unchanged apart from the documented negative masks and omission of the old test-horizon evaluation.
- Predictive metrics use only the group's positive ratings as relevant targets. Compute Precision/Recall/nDCG@10 per positive group, average within each user, then average users equally. Low-preference-only and neutral-only groups contribute history and diagnostics, not positive-relevance metrics. Metrics reuse the existing JavaScript definitions.
- The script also reranks the same candidates immediately after feedback. Those rank/score changes explain the update; they are **not** predictive improvement, since their labels have just been revealed. Positive rank gain means moving upward. Recommendation coverage is the share of training-catalog items appearing in pre-feedback top-10 lists over groups with warm ratings.
- At depths 5, 10, and 20, select the first positive group after at least that many warm test ratings have been observed. Ties and nonpositive groups can overshoot the threshold. Each depth reports counts and actual history lengths. A 12-user matched intersection is reported separately; different future items and candidate histories still prevent treating depth as a causal treatment.

Training sees no test identities in its negative mask. Candidate construction uses only prior observations. Prefix-invariance tests confirm that adding future events does not change earlier replay predictions, and changing tied feedback does not change that group's pre-reveal scores. The split boundaries themselves are the fixed, retrospective boundaries from the original dataset experiment, not a prospective deployment study.

### Run And Artifacts

```sh
research/.venv/bin/python -m unittest discover -s research -p 'test_*.py'
research/.venv/bin/python research/compare_adaptive.py research/runs/20260927T203458035652Z
```

On a fresh clone, first train a default baseline and supply that run directory. The runner creates `research/runs/adaptive-<timestamp>/` containing the predeclared `protocol.json`, three new training directories, `replay-42.json`, `replay-43.json`, `replay-44.json`, and `comparison.json`. Replay files contain per-group traces, original ratings, candidate hashes, top-10 lists, embedding deltas, user-level paired metrics, depth results, examples, and timings. They preserve raw rating values and canonical `media:<movieId>` identities. Generated artifacts remain Git-ignored.

The run reported here is `research/runs/adaptive-20260928T024120557869Z/`. Seed 42 replay was repeated exactly, excluding timing. A separate repeat of train-only seed-42 training also reproduced its losses and checkpoint weights exactly. The runner checks that no checkpoint tensor changed.

### Coverage

Of 943 MovieLens users, 666 satisfy pre-test eligibility; 277 lack a training identity and none of the training users fail the five-rating minimum. Of those 666, 597 have no test ratings. The remaining 69 have test events, 67 have warm events, and **50 have positive warm groups for ranking metrics**. Eligibility at the cutoff is not the same as evaluable coverage.

Of 14,720 actual test ratings, 13,250 belong to ineligible users and 100 to cold items for otherwise eligible users. Replay therefore observes **1,370 warm ratings (9.31%)**: 864 positive, 198 low preference, and 308 neutral. There are 795 timestamp groups including cold-only groups, 419 positive evaluation groups, and 560 nonneutral update groups. These counts are identical across seeds. The 50 evaluated users are only 5.30% of the full dataset; results do not represent all 943 users.

### Predictive Results: Replay Protocol Only

These event-group metrics are **not comparable** to the test-period relevance metrics in Experiments 1 and 2. The new checkpoint sampling masks and history exclusions differ as well. Keep the earlier tables and this table separate in the report.

| Seed | Arm | Precision@10 | Recall@10 | nDCG@10 |
| --- | --- | ---: | ---: | ---: |
| 42 | Static | 0.016859 | 0.100150 | 0.051642 |
| 42 | Adaptive | 0.016416 | 0.095234 | 0.053040 |
| 43 | Static | 0.015781 | 0.093321 | 0.056345 |
| 43 | Adaptive | 0.015853 | 0.091440 | 0.056220 |
| 44 | Static | 0.015659 | 0.091330 | 0.054119 |
| 44 | Adaptive | 0.015628 | 0.091938 | 0.053505 |
| Mean +/- sample SD | Static | 0.016100 +/- 0.000661 | 0.094934 +/- 0.004626 | 0.054035 +/- 0.002352 |
| Mean +/- sample SD | Adaptive | 0.015965 +/- 0.000406 | 0.092871 +/- 0.002062 | 0.054255 +/- 0.001718 |

Mean nDCG increases by 0.000220, while precision decreases by 0.000134 and recall by 0.002063. Seed 42 improves nDCG; seeds 43 and 44 worsen it. User-level nDCG improves/ties/worsens for 10/34/6 users at seed 42, 6/37/7 at seed 43, and 5/40/5 at seed 44. The outcome is **mixed and close to static**, not evidence of a reliable ranking improvement. No settings were changed to chase a better outcome.

### History Depths

Each entry below is a three-seed mean. Complete per-seed values are in `comparison.json`; all metrics refer to the first eligible positive group, not all remaining events.

| Prior warm ratings | Users / 666 eligible | Positive events | Actual history range | Static P / R / nDCG | Adaptive P / R / nDCG |
| --- | --- | ---: | --- | --- | --- |
| >=5 | 22 (3.30%) | 36 | 5-10 | 0.024242 / 0.158369 / 0.067374 | 0.025758 / 0.163420 / 0.068430 |
| >=10 | 17 (2.55%) | 37 | 10-13 | 0.013725 / 0.056209 / 0.022698 | 0.015686 / 0.062745 / 0.025308 |
| >=20 | 12 (1.80%) | 20 | 20-24 | 0.041667 / 0.166667 / 0.092872 | 0.041667 / 0.166667 / 0.096733 |

For the **same 12 users** at every depth:

| Prior warm ratings | Static P / R / nDCG | Adaptive P / R / nDCG |
| --- | --- | --- |
| >=5 | 0.030556 / 0.188492 / 0.086538 | 0.030556 / 0.188492 / 0.084817 |
| >=10 | 0.013889 / 0.061111 / 0.022768 | 0.013889 / 0.061111 / 0.022399 |
| >=20 | 0.041667 / 0.166667 / 0.092872 | 0.041667 / 0.166667 / 0.096733 |

These small, changing target groups do not show a monotonic learning curve. The two tables must not be used to claim that simply collecting more feedback causes better rankings.

### Update Diagnostics And Examples

These are immediate, same-group changes after revealing feedback, not held-out performance:

| Seed | Mean rank gain, all ratings | Positive | Low preference | Events with changed full ranking | Changed top 10 | Mean update ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 42 | +1.241 | +2.104 | -0.778 | 86.50% | 47.45% | 0.176 |
| 43 | +1.467 | +2.497 | -1.116 | 86.50% | 43.43% | 0.178 |
| 44 | +1.040 | +1.722 | -0.621 | 86.50% | 38.32% | 0.184 |

The percentages weight groups by their number of warm rating events, including neutral peers. Grouped gradients can also move neutral items or move an individual low-rated item upward. Only the average low-preference response moves down; there is no per-item guarantee. Total update time for 560 groups was 0.099/0.100/0.103 seconds. These local CPU timings cover gradient updates only, not ranking, preprocessing, or training, and are not production latency measurements. Pre-feedback catalog coverage was 9.04/9.86/8.96% for static and 10.54/10.62/10.92% for adaptive.

Example selection was defined before replay: seed 42's largest paired nDCG gain, closest-to-zero change, and largest loss, with deterministic user-ID tie breaking. These are deliberately outcome-selected illustrations, not a random representative sample. Each shows the first nonneutral update for that user, not a handpicked favorable update. Full recent ratings, top-10 lists, vector deltas, and scores are in `replay-42.json`.

| User | Overall static -> adaptive nDCG | First update illustration |
| --- | --- | --- |
| 699, largest gain | 0.210310 -> 0.333333 | Movie 340, rating 4: rank 35 -> 28, logit -0.09442 -> -0.04980; combined vector change 0.03418. Top three 300/269/302 -> 269/300/302. |
| 102, nearest zero | 0 -> 0 | Movie 269, rating 2: rank 49 -> 52, logit 0.08267 -> 0.04269; vector change 0.03226. Top three 100/64/12 -> 100/64/69, but no positive top-10 hits in either arm. |
| 186, largest loss | 0.055556 -> 0 | Tied ratings: movie 306 rated 4 moves 302 -> 294; movie 754 rated 2 moves 535 -> 532 despite low preference. Vector change 0.02108. The shared update replaces top-10 movie 28 with 222; subsequent positive ranking quality worsens. |

### Verification And Interpretation

Six new tests check bounded local-vector changes, unchanged item/network/other-user parameters, opposite single-item positive/negative update directions, neutral no-op, timestamp safety, future-prefix invariance, deterministic replay, static ranking immutability, history depths, raw ratings, empty coverage, and training-only negative masks. All 18 Python tests pass. Frozen checkpoint evaluation reproduces all seven original/context models, and fresh seed-42 NCF/context training reproduces losses, metrics, and weights exactly. A SHA-256 audit confirms the earlier artifacts remain untouched.

Backend syntax and all 14 backend tests pass. Application adaptive validation still passes for three synthetic users and 18 interactions, using an isolated temporary datastore without rewriting application results. This is an application regression check, not research evidence. Frontend lint/build pass; the existing Node 20.12.2 warning remains because Vite requests 20.19+ or 22.12+. No live application code or UI changed for this experiment.

This is a defensible Master's project result about a controlled adaptation mechanism, including a mixed outcome. It is **not** evidence that adaptive NCF generally outperforms static NCF. Coverage is small, ratings are self-selected rather than randomized exposures, timestamps indicate rating submission rather than viewing, and three seeds on one cohort do not establish significance. Grouped pointwise BCE can raise or lower many scores together; better fitting newly revealed labels need not improve the next ranking. Unrated items are unjudged, and the base model was trained with sampled implicit negatives rather than the replay's explicit low ratings.

Experiment 3 motivated the context/adaptation comparison below, using the same replay protocol rather than changing datasets. If the dissertation's central claim is learned cross-domain transfer, a verified linked-user cross-domain dataset is still required; MovieLens results cannot support that claim.

## Experiment 4: Context And Adaptation Under The Same Replay

**Question:** Does temporal context provide useful additional information when combined with online user-embedding adaptation?

This is a 2x2 comparison: context off/on and adaptation off/on. The four arms are static NCF (A), adaptive NCF (B), static context NCF (C), and adaptive context NCF (D). They share Experiment 3's users, events, candidate sets, chronological history, feedback definitions, K=10, and seeds 42/43/44. Its settings and original artifacts remain frozen. Experiments 1 and 2 still use their separate full-period relevance protocol; their numbers are not replay baselines.

### What Changed

The existing replay now accepts the existing four context values: sine/cosine of UTC hour and weekday. Each query derives them from its **current timestamp group**, then broadcasts the same vector to every candidate and every revealed item used in that group's update. There are no candidate-specific or future timestamps, new features, or new encoders. Positive and neutral/low-preference feedback keep their original MovieLens meanings.

A and B reuse Experiment 3's frozen, train-only-negative-mask checkpoints. C and D share a new context checkpoint for each seed, trained with the same data, negative samples, shuffle seeds, optimizer, and validation-BCE selection rule. Before training, all shared parameters are identical at each seed; the first MLP layer's four extra input columns start at zero. The runner verifies the shared tensors and zero columns directly. Each architecture can then learn different weights. All plain and context checkpoints in this comparison selected epoch 2; this was not forced.

Only the active user's two local embeddings adapt: **32 values**, with learning rate **0.05**, gradient-norm clipping **1.0**, and **one mean-BCE step per nonneutral timestamp group**. Context columns, item embeddings, network/output weights, and other users remain frozen. Whole-group prediction precedes feedback and updates. The maximum vector step remains approximately 0.05, allowing float32 rounding. Neutral ratings change history but have no training label.

NCF has **65,425 parameters**; context NCF has **65,553**, adding **128 weights** (about 0.20%). The original model, training code, and context representation were not changed for this experiment. `adaptive.py` supplies both paired replays; the comparison runner does not copy the training or metric pipelines.

### Run And Coverage

```sh
research/.venv/bin/python research/compare_context_adaptive.py research/runs/adaptive-20260928T024120557869Z
```

Supply a completed Experiment 3 directory. The reported run is `research/runs/context-adaptive-20260928T025543005117Z/`. Its `protocol.json` was written before training. `comparison.json` contains all arms, paired differences, depth aggregates, diagnostics, user metrics, and examples. `ncf-<seed>.json` and `context-<seed>.json` retain complete query traces. Three new training directories contain context checkpoints. All generated artifacts remain Git-ignored; no earlier result file is rewritten.

Coverage is identical across all arms: **666 eligible users**, 69 with test events, **67 with warm replay events**, and **50 contributing ranking metrics**. Of the 943 dataset users, 277 lack training identities and 597 eligible users have no test ratings. The **1,370 warm ratings** comprise **864 positive, 198 low preference, and 308 neutral**. There are 795 timestamp groups, 419 positive evaluation groups, and 560 update groups. Warm replay covers 9.31% of the 14,720 test ratings; 13,250 ratings belong to ineligible users and 100 involve cold items for eligible users. No context-specific cohort was selected.

### Four-Arm Results

| Seed | Arm | Precision@10 | Recall@10 | nDCG@10 |
| --- | --- | ---: | ---: | ---: |
| 42 | A: static NCF | 0.016859 | 0.100150 | 0.051642 |
| 42 | B: adaptive NCF | 0.016416 | 0.095234 | 0.053040 |
| 42 | C: static context | 0.016828 | 0.100772 | 0.053585 |
| 42 | D: adaptive context | 0.016639 | 0.096611 | 0.053161 |
| 43 | A: static NCF | 0.015781 | 0.093321 | 0.056345 |
| 43 | B: adaptive NCF | 0.015853 | 0.091440 | 0.056220 |
| 43 | C: static context | 0.015958 | 0.094043 | 0.054551 |
| 43 | D: adaptive context | 0.015500 | 0.092790 | 0.053763 |
| 44 | A: static NCF | 0.015659 | 0.091330 | 0.054119 |
| 44 | B: adaptive NCF | 0.015628 | 0.091938 | 0.053505 |
| 44 | C: static context | 0.016249 | 0.095915 | 0.055842 |
| 44 | D: adaptive context | 0.016102 | 0.096970 | 0.056351 |

The factorial table below reports mean +/- sample SD across three seeds:

| Context | Adaptation | Precision@10 | Recall@10 | nDCG@10 |
| --- | --- | --- | --- | --- |
| Off (A) | Off | 0.016100 +/- 0.000661 | 0.094934 +/- 0.004626 | 0.054035 +/- 0.002352 |
| Off (B) | On | 0.015965 +/- 0.000406 | 0.092871 +/- 0.002062 | 0.054255 +/- 0.001718 |
| On (C) | Off | 0.016345 +/- 0.000443 | 0.096910 +/- 0.003473 | 0.054659 +/- 0.001133 |
| On (D) | On | 0.016080 +/- 0.000570 | 0.095457 +/- 0.002317 | 0.054425 +/- 0.001695 |

These are **controlled metric differences under this replay protocol**, not causal effects. The SDs below are calculated from within-seed differences, not by subtracting the arms' SDs.

| Comparison | Precision difference +/- SD | Recall difference +/- SD | nDCG difference +/- SD |
| --- | --- | --- | --- |
| Adaptation without context, B-A | -0.000134 +/- 0.000273 | -0.002063 +/- 0.002767 | +0.000220 +/- 0.001049 |
| Context without adaptation, C-A | +0.000246 +/- 0.000316 | +0.001976 +/- 0.002260 | +0.000624 +/- 0.002097 |
| Context with adaptation, D-B | +0.000115 +/- 0.000424 | +0.002587 +/- 0.002118 | +0.000170 +/- 0.002652 |
| Adaptation with context, D-C | -0.000265 +/- 0.000169 | -0.001453 +/- 0.002614 | -0.000234 +/- 0.000669 |

Context raises adaptive recall at all three seeds. For adaptive precision and nDCG it helps seeds 42 and 44 but hurts seed 43. Static context has the highest mean of all three metrics. Adding adaptation to context lowers all three means; precision falls at every seed, while recall and nDCG fall at seeds 42/43 and rise at 44. These results do not establish an advantage from combining both components.

### History Depths

The available cohorts remain 22/17/12 users at >=5/10/20 prior warm ratings, with 36/37/20 positive target events. The actual history ranges remain 5-10, 10-13, and 20-24. The table shows three-seed mean nDCG; all Precision/Recall/nDCG values and sample SDs are retained in `comparison.json`.

| Depth | Available users | A | B | C | D |
| --- | ---: | ---: | ---: | ---: | ---: |
| >=5 | 22 | 0.067374 | 0.068430 | 0.057492 | 0.051424 |
| >=10 | 17 | 0.022698 | 0.025308 | 0.031059 | 0.026217 |
| >=20 | 12 | 0.092872 | 0.096733 | 0.092397 | 0.096183 |

For the same **12 users at every depth**:

| Depth | A | B | C | D |
| --- | ---: | ---: | ---: | ---: |
| >=5 | 0.086538 | 0.084817 | 0.068532 | 0.057903 |
| >=10 | 0.022768 | 0.022399 | 0.034314 | 0.027854 |
| >=20 | 0.092872 | 0.096733 | 0.092397 | 0.096183 |

There is no monotonic learning pattern. Matching users does not make the future target items, candidate sets, or elapsed time identical across depths.

### Adaptation Diagnostics And Cost

Immediate rank gain means rank-before minus rank-after on the same just-revealed items. Negative gain means moving down. These are update diagnostics, **not held-out predictive improvements**.

| Seed | Adaptive arm | Positive rank gain | Low-preference rank gain | Full ranking changed | Top 10 changed | Mean vector step norm | Mean update ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 42 | B | +2.104 | -0.778 | 86.50% | 47.45% | 0.02657 | 0.191 |
| 42 | D | +1.962 | -0.843 | 86.50% | 45.33% | 0.02756 | 0.180 |
| 43 | B | +2.497 | -1.116 | 86.50% | 43.43% | 0.02712 | 0.174 |
| 43 | D | +1.881 | -0.949 | 86.50% | 39.34% | 0.02684 | 0.183 |
| 44 | B | +1.722 | -0.621 | 86.50% | 38.32% | 0.02589 | 0.174 |
| 44 | D | +2.089 | -0.793 | 86.50% | 45.84% | 0.02716 | 0.184 |

Context leaves the overall ranking-change rate unchanged and produces similar step magnitudes. Top-10 turnover decreases at two seeds and increases at one; positive rank movement follows the same mixed pattern. It changes individual responses, but does not show a consistently different or better adaptation pattern. An individual low-rated item can still move upward under a shared group gradient.

Across these runs, mean ranking time was approximately 0.39-0.44 ms for A, 0.43 ms for B, 0.40-0.49 ms for C, and 0.44-0.45 ms for D. Each arm ranked 795 queries. Total paired replay time was 1.39-1.55 seconds for A+B and 1.42-1.52 seconds for C+D, including post-feedback diagnostic rankings and metric aggregation, excluding training and file serialization. The ten-epoch context training runs took 11.50-11.54 seconds each. These are local CPU wall times, with fixed run order and no isolated timing benchmark; small timing differences should not be interpreted as speed improvements. The old timing records were not overwritten.

### User Examples

The selection rule was fixed before running: seed 42's largest gain, nearest-zero difference, and largest loss in **D minus B user-level nDCG**, with deterministic user-ID tie breaking. These are outcome-selected illustrations, not a random representative sample.

| User | A nDCG | B nDCG | C nDCG | D nDCG |
| --- | ---: | ---: | ---: | ---: |
| 624, largest gain | 0.151658 | 0.151658 | 0.204382 | 0.204382 |
| 102, nearest zero | 0 | 0 | 0 | 0 |
| 159, largest loss | 0.315465 | 0.315465 | 0.267010 | 0.267010 |

For user 624's first update, movie 242 is rated 4 and moves from rank 4 to 3 in both adaptive arms; the step norm is 0.03298 without context and 0.03482 with it. For user 102, movie 269 is rated 2 and moves 49->52 without context and 49->53 with context, but all four arms have no positive top-10 hits. For user 159, movie 333 is rated 5: its immediate rank stays 8 without context and moves 9->8 with context, yet overall context nDCG is lower. In these selected examples, context's static and adaptive metrics tie; they do not demonstrate an extra benefit from combining both mechanisms. Full recent ratings, before/after lists, and score/vector changes are stored in the comparison's `examples` section.

### Validation And Architecture Decision

All **21 Python tests** pass. The three new tests cover shared query context, paired initial tensors, context-weight and network isolation, unchanged static-context parameters/rankings, timestamp safety, future-prefix invariance, deterministic combined replay, and event/candidate equality across the two paired replays. The runner independently checks initial parameter equality for all three seeds, reproduces every frozen adaptive trace and metric apart from runtime measurements, verifies unchanged checkpoint tensors, and repeats context replay at every seed exactly. A separate seed-42 context training repeat reproduces losses and checkpoint weights exactly.

Read-only evaluation reproduces all seven original/context checkpoints. SHA-256 checks preserve earlier run artifacts and application files. Backend syntax, 14 backend tests, application adaptive validation with three users/18 synthetic interactions in an isolated datastore, frontend lint, and frontend build pass. The existing Node/Vite version warning remains. No application code, APIs, UI, or application result files changed in this phase; no commit or push was made.

**Conclusion:** context adds small average gains over adaptive NCF, but the combined model is not the strongest mean result and gains are not consistent across seeds. Static context scores higher on all three means than adaptive context. Neither this comparison nor the earlier mixed results justify claiming predictive superiority for user-embedding adaptation.

**Should both remain in the final trained architecture? Not as a required default on this evidence.** The additional context weights and update cost are small, and real adaptation is verified, but those facts do not establish ranking value. Keep the combined model as a documented experimental variant. Static context is a reasonable provisional candidate alongside the plain NCF control, not an established winner. The cohort is only 50 ranking users, ratings are self-selected and unexposed items are unjudged, UTC submission time is imperfect context, and three seeds on one split do not establish significance. There is no live Python inference or frontend integration, and no additional research variant was implemented after this comparison.
