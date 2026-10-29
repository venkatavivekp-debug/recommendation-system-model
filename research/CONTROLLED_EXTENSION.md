# Controlled Baseline and Seed Extension

This preregistered extension asks whether an established pairwise personalized
baseline changes the comparison, and whether the A/B/C findings persist across
training randomness. It does not replace the original expanded seed-42 study.
The live ContextFit application, LinUCB, historical V2, and D/D_FIXED are unchanged.
The nine authorized fits and their frozen-checkpoint TEST evaluations are
complete. No further fitting, checkpoint selection, tuning or rescoring is
part of this extension. The design below records the preregistered protocol.

## Frozen Design

The machine-readable declaration is
`research/results/controlled_extension/protocol.json`. It references the original
expanded protocol and its SHA-256. A/B/C reuse the existing trainer, models,
12,486 updates, 512-example batches, Adam at 0.001, four unobserved negatives per
positive, balanced domains, and all ten validation steps. Only seeds 43 and 44
are new. Seed 42 is reused from saved results; historical V2 seeds are not pooled.

All fits use the same 7,016 users, positive threshold (rating >= 4), TRAIN-only
mappings, global calendar cutoffs, and warm-item full-catalog evaluation. The
prepared data cache is loaded only after verifying its frozen hash. Mapping,
split, candidate, source-cache and cohort fingerprints must match the original
study. This checks query identity without scoring any TEST query. Missing or
mismatched artifacts stop execution rather than rebuilding the benchmark.

## BPR-MF

For each domain independently, learn a 16-dimensional user table and item table:
`s(u,i,d) = p(u,d)^T q(i,d)`. There are no shared parameters, biases, neural layers,
graph propagation or gates. The expanded parameter count is 2,929,456.

For a minibatch of triples `(u,i,j,d)`, minimize:

```text
mean(-log sigmoid(s(u,i,d) - s(u,j,d)))
+ (0.0001 / 2) * mean(||p(u,d)||^2 + ||q(i,d)||^2 + ||q(j,d)||^2)
```

L2 applies to sampled factors, counting occurrences, not the entire tables.
Factors start independently Normal(0, 0.01). Adam uses lr=0.001, betas=(0.9,0.999),
epsilon=1e-8 and zero optimizer weight decay. CPU float32, one Torch thread and
deterministic algorithms are used. Each fit resets the Torch seed.

Each update draws 102 positive anchors (34/domain), with four uniform unobserved
negatives per anchor: 408 triples. Sampling reuses `training.sample_examples`
and `multidomain_data.batch_indices`. TRAIN positives alone are excluded; future
positives are not consulted. Four negatives are distinct within an anchor group.
Pools refresh at the same ten training windows as A/B/C, using `seed + window +
domain_index`; batch shuffling uses `seed + window`. Smaller domain pools cycle
as in the original balanced sampler. Anchors are interactions, not uniform users.

This yields 1,273,572 anchor draws and 5,094,288 triples over 12,486 updates.
NeuMF has approximately 102.4 positive examples per 512-example BCE batch, so
102 anchors approximately match positive exposure (0.39% lower in expectation).
The grouped BPR and mixed-label BCE streams are **not identical**, nor are their
compute or model capacity. Report actual exposures, runtime and parameter counts.
Unobserved negatives can be relevant; no negative-sampling sensitivity is included.

The objective follows [Rendle et al., BPR, UAI 2009](https://arxiv.org/abs/1205.2618).
Adam, minibatching, sampled L2 and this benchmark are declared adaptations, not a
reproduction of the paper's experiments. Dimension 16 and lr 0.001 match the
existing foundation; initialization and L2 are fixed engineering choices, not
validation-selected or TEST-tuned. There is one configuration and no search.

## Selection and Evaluation

Validate only at 1249, 2497, 3746, 4994, 6243, 7492, 8740, 9989, 11237, 12486.
Use the unchanged `final_study.evaluate` and `select_ranking_checkpoint`:
maximum macro validation nDCG@10, earliest exact tie, no early stopping.
All domains in a fit share this checkpoint-selection step.

The evaluator ranks the full TRAIN catalog, excludes prior positive history,
evaluates equal-timestamp targets together and breaks score ties by frozen item
index. It averages queries within user, users within domain, then the three
domains equally. Cold coverage is reported separately, not silently treated as
rankable. Evaluation changes no learned parameters.

The entry point performs no TEST scoring, including during fitting. Before later
once-per-selected-checkpoint TEST evaluation, all nine fits must finish and a
freeze record must identify checkpoint hashes, selected steps, all validation
metrics, runtime, peak RSS, configuration and environment. For each new seed,
A/B/C sampling hashes must match. BPR hashes record ordered int64 triples and
are not comparable to the BCE stream fingerprint. Existing seed-42 TEST outputs
and Most Popular are read, not regenerated. No K=100 extension is proposed.

## Commands and Outputs

Read-only preflight (no model constructed, no evaluation, no output files):

```sh
research/.venv/bin/python -B research/controlled_extension.py --model BPR --seed 42
```

The approved execution sequence was the following, one process at a time.
These commands are retained for reproducibility, not authorization to repeat
completed fits. Existing run/output paths must remain protected.

```sh
research/.venv/bin/python -B research/controlled_extension.py --model BPR --seed 42 --execute
research/.venv/bin/python -B research/controlled_extension.py --model BPR --seed 43 --execute
research/.venv/bin/python -B research/controlled_extension.py --model BPR --seed 44 --execute
research/.venv/bin/python -B research/controlled_extension.py --model A --seed 43 --execute
research/.venv/bin/python -B research/controlled_extension.py --model B --seed 43 --execute
research/.venv/bin/python -B research/controlled_extension.py --model C --seed 43 --execute
research/.venv/bin/python -B research/controlled_extension.py --model A --seed 44 --execute
research/.venv/bin/python -B research/controlled_extension.py --model B --seed 44 --execute
research/.venv/bin/python -B research/controlled_extension.py --model C --seed 44 --execute
```

The entry point rejects other model/seed pairs and refuses existing run/output
paths. A failed fit preserves its partial directory; there are no automatic
retries or replacement seeds. Warn above 6 GiB and stop above 10 GiB sampled peak
RSS, including during training. Interrupted hardware/memory failures require
review before any recovery; they do not authorize extra fits.

Checkpoints and per-fit snapshots go to ignored
`research/runs/controlled_extension/<model>_seed<seed>/`. Training records,
freeze/test records and summary tables are stored only under
`research/results/controlled_extension/`. Records retain original identities,
extension configuration/code hashes, Git/working-state provenance, package
versions, runtime/CPU time, timestamps, peak RSS and sampling fingerprints.

Report every seed's domain/macro P@10, R@10 and nDCG@10, three-seed mean and sample
standard deviation (ddof=1), seed-matched B-A/C-A, and BPR versus A/Most Popular.
Use the existing paired bootstrap for within-fit intervals where reported;
those intervals are not seed uncertainty. Three seeds are not conclusive
significance evidence. D/D_FIXED remain seed-42-only feasibility evidence.
Paper metrics from different protocols are contextual, not direct comparisons.
The extension may support or complicate the original conclusion; no outcome is
required. Existing TEST results are already known, not a newly blinded holdout.

The pre-training estimate for the six additional A/B/C fits was 223 minutes
(3.72 hours), plus three then-unmeasured BPR fits and evaluation overhead.
Actual recorded runtime for all nine fits was 16,957.847638 seconds; TEST
evaluation totaled 798.177824 seconds. Their sum, 17,756.025462 seconds, excludes
orchestration and interruptions. Per-run times are retained in `validation.json`.
No tuning, extra seeds, D runs, new data, budget extension or other model family
is part of this declaration.

## Historical Pre-Training Verification

The research suite passes 123 tests: the existing 113 plus ten focused extension
tests. Coverage includes the loss formula and L2 convention, private-domain
gradients, deterministic sampling/initialization, checkpoint round trips,
full-catalog evaluator semantics, earliest validation ties, deferred TEST access,
the nine-run allowlist, overwrite refusal and unchanged A/B/C configuration.
Only synthetic fixtures received optimizer updates.

The real-data read-only preflight matched the original 7,016-user mappings,
TRAIN counts, cohort/split/candidate fingerprints and source/prepared hashes.
It constructed no model and performed no validation or TEST scoring. TEST query
contents were hashed solely to establish identity, not used for tuning.
All 664 previously protected files remain byte-identical to the approved
baseline, including the already-approved transferability SVG rendering.
No original file, live application file or Git history was changed.

The pre-training gate passed before approval of the nine fits. These checks
established implementation readiness, not recommendation accuracy.

## Completed Controlled Extension

The original [seed-42 study](FINAL_STUDY.md), its A/B/C/D/D_FIXED results,
paired-user intervals and transferability diagnostics remain unchanged.
This extension adds BPR seeds 42/43/44 and A/B/C seeds 43/44, reusing the original
A/B/C seed-42 results without rescoring. Historical V2 is a different cohort
and protocol and is not pooled here. D and D_FIXED were not replicated.

All nine new checkpoints were selected by validation macro nDCG@10 and frozen
before the first extension TEST evaluation. Each has one saved TEST result from
the unchanged canonical evaluator. The A/B/C sampling streams match within
seed 43 and within seed 44. No configurations, budgets or candidates were tuned
using TEST results; no additional experiment was run.

### Matched Comparison

The table reports macro nDCG@10 across training seeds 42, 43 and 44. SD is the
sample standard deviation (ddof=1), not a confidence interval. Most Popular is
the same deterministic reference, not three independently trained models.
Display rounding does not replace the exact saved CSV/JSON values.

| Model | Macro nDCG@10 mean | Sample SD | Role |
| --- | ---: | ---: | --- |
| Most Popular | 0.001744330 | N/A | Nonpersonalized baseline |
| BPR-MF | 0.001778438 | 0.000321414 | Established personalized-ranking baseline |
| A | 0.001955462 | 0.000077521 | Independent NeuMF |
| B | 0.001853153 | 0.000264326 | Naive shared-user NeuMF |
| C | 0.002337345 | 0.000230701 | Shared + domain-specific offsets |

All values above were produced under the same ContextFit benchmark. Published
NeuMF, BPR, SyNCRec, and LightGCN values use different datasets and/or evaluation
protocols and are therefore contextual literature comparisons, not direct
numerical benchmarks.

Relative mean nDCG@10 improvements over Most Popular are BPR-MF +1.96%,
A +12.10%, B +6.24% and C +34.00%. These are descriptive, not significance claims.

| Model | Mean macro P@10 | Mean macro R@10 | Mean macro nDCG@10 |
| --- | ---: | ---: | ---: |
| BPR-MF | 0.000317115 | 0.003171151 | 0.001778438 |
| A | 0.000419673 | 0.004196732 | 0.001955462 |

Independent NeuMF A exceeds BPR's three-seed mean on all three macro ranking
metrics under the matched ContextFit benchmark. This does not establish
statistical inferiority of BPR or superiority over the original BPR paper;
BPR exceeds A's macro nDCG@10 on seed 44. BPR is a matched external baseline,
with the objective, implementation adaptations and exposure differences
declared above, not a reproduction of published paper scores.

### Seed-Matched Differences

| Seed | B - A macro nDCG@10 | C - A macro nDCG@10 |
| --- | ---: | ---: |
| 42 | -0.000177834 | +0.000133135 |
| 43 | +0.000178065 | +0.000667327 |
| 44 | -0.000307158 | +0.000345188 |
| Mean | -0.000102309 | +0.000381883 |

Naive sharing B is inconsistent and is below A on two of three seeds. C is
directionally above A in all three seeds, but the per-seed macro C-A paired-user
bootstrap intervals include zero. The three-seed extension strengthens
directional evidence for shared representations with domain-specific offsets,
but does not establish definitive statistical superiority.

The saved 95% paired intervals quantify within-fit user uncertainty, not
training-seed variability. Macro intervals use reviewer clusters across domains;
seed-42 B-A/C-A intervals are reused from the original study. Three training
seeds and one fixed configuration do not establish definitive statistical
superiority, generalization to other datasets, or a causal explanation of
transfer. The original seed-42 conclusion remains historical evidence; the
extension adds directional evidence rather than retroactively changing it.

### Coverage and Media

Media remains near a Top-10 retrieval floor, with only rare hits across seeds.
A seed 43, B seed 43 and BPR seed 44 have nonzero Media retrieval (respectively
2, 1 and 4 users with nonzero nDCG@10). C is zero across all three seeds. The
original seed-42 A/B/C/D/D_FIXED zero result remains unchanged; it must not be
generalized to all extension seeds.

| Domain | Warm-item TEST coverage | Evaluated users |
| --- | ---: | ---: |
| Food | 23.4867% | 1,822 |
| Fitness | 14.1802% | 900 |
| Media | 26.9314% | 541 |

These unchanged coverage restrictions contextualize low absolute scores. They
do not indicate a broken Media evaluator. Full-catalog temporal ranking,
sparse item support and unobserved-negative ambiguity limit interpretation.
The categories remain Amazon product-preference proxies. No result here
measures the live application's recommendation quality.

### Evidence and Validation

All paths below are relative to `research/results/controlled_extension/`:

- `protocol.json`: preregistered configuration and original protocol identity.
- `execution_baseline.json`: original protected/live/source integrity baseline.
- `checkpoint_freeze.json`: nine checkpoint hashes and validation selections.
- `<model>_training_seed<seed>.json`: fit histories, sampling and runtime records.
- `<model>_test_started_seed<seed>.json` and `<model>_test_seed<seed>.json`:
  one start receipt and one completed evaluation per newly fitted checkpoint,
  including saved per-user metrics.
- `metrics_by_seed.csv`, `metrics_mean_sd.csv`, `summary.json`: all domain and
  macro results, including unfavorable seeds, with exact means and sample SDs.
- `paired_user_comparisons.csv` and `.json`: matched within-fit comparisons.
- `validation.json`: immutable completion-time reconciliation and test record.

The completion-time record reconciled 144 metric cells against saved per-user
records. It also recorded 122 passing research tests and one fixture-isolation
error: a delegation test used a temporary output file but still resolved run
directories under the real repository. Production overwrite protection
correctly rejected the already-completed run. This was not a fit/evaluator
failure and did not require retraining, rescoring or checkpoint replacement.

The fixture now isolates both the result and run roots, with local provenance
fixtures and a mocked Git-status lookup. It checks read-only preflight, refusal
to overwrite an existing output, and refusal to overwrite an existing run
directory/checkpoint independently. Production overwrite protection and all
experimental code remain unchanged. The historical `validation.json` is retained
unchanged; the final post-fix validation is recorded below.

Final closure validation: **123/123 research tests pass**, including the isolated
delegation test and both overwrite-refusal cases; **48 Python files pass syntax
checks**. The original **664/664 protected research files**, **232/232 live-app
files**, all **nine selected checkpoints**, and all **36 extension result
artifacts** remain byte-for-byte unchanged. Validation-selected steps, saved
per-user records, summaries and metric CSVs are preserved. The experimental
source and preregistered protocol hashes are unchanged. Only the test fixture
and documentation differ from the pre-training implementation baseline; the
baseline itself is retained, not rewritten. No scientific protocol deviation,
new fit, TEST rescoring or live-application change occurred during closure.

`git diff --check` passed. The ordinary staged check reports CRLF terminators
as trailing whitespace on lines 1-49 of `metrics_by_seed.csv` and
`metrics_mean_sd.csv`. Every warning was verified to be CR-at-EOL only;
`git -c core.whitespace=cr-at-eol diff --cached --check` passed. Index blobs
match the approved artifact bytes exactly; no line-ending normalization or
scientific artifact hash change was made.

NeuMF remains the GMF/MLP model foundation; BPR is the matched external ranking
baseline. SyNCRec / Pacer and Runner motivates cross-domain cooperation and
negative-transfer questions only. Impatient Bandits motivates live adaptation
and exploration; TimeMCL motivates diverse plausible outputs; CRSLab provides
interaction-architecture context; Microsoft Recommenders informs evaluation
workflow. None of these roles implies an unclaimed faithful reproduction.
