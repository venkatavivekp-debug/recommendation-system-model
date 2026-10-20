# Research Code Audit

This pass changes no scientific result. Every Python source was read through an AST inventory of functions/imports and reverse dependencies; call sites and provenance checks were then inspected. Result files were inspected by schema and digest. Ignored datasets, environments, caches and checkpoints are not source cleanup candidates.

## File Decisions

KEEP means an existing library/test remains in use. HISTORICAL means a frozen reproduction entry point, not the starting point for new work. Shared libraries below also remain byte-for-byte frozen because historical protocols hash their sources. A CLI with no Python importer is not dead code.

| File | Purpose | Used by | Decision |
|---|---|---|---|
| `adaptive.py` | MovieLens local-user replay | `compare_adaptive`, `compare_context_adaptive`, `test_adaptive` | HISTORICAL |
| `amazon_data.py` | Amazon ingestion, source hashes and cohort preparation | `amazon_pilot`, `amazon_replication`, `architecture_control`, `architecture_replication`, `checkpoint_selection`, `coverage_cohort`, `coverage_completion`, `coverage_robustness`, `coverage_tail_verification`, `equal_step_control`, `equal_step_replication`, `final_study`, `final_study_report`, `natural_b_diagnostics`, `test_amazon`, `test_amazon_replication`, `test_coverage_cohort`, `test_coverage_robustness`, `v2_pilot` | KEEP, frozen library |
| `amazon_diagnostics.py` | Historical diagnostics and deterministic fingerprints | `amazon_replication`, `architecture_control`, `architecture_replication`, `checkpoint_selection`, `coverage_cohort`, `equal_step_control`, `equal_step_replication`, `natural_b_diagnostics`, `test_amazon_replication`, `test_equal_step_control`, `test_equal_step_replication`, `v2_pilot` | KEEP, frozen library |
| `amazon_pilot.py` | First Amazon pilot | documented CLI / artifact reproduction | HISTORICAL |
| `amazon_replication.py` | Historical replication and freeze checks | `checkpoint_selection`, `coverage_cohort`, `equal_step_control`, `equal_step_replication`, `natural_b_diagnostics`, `test_checkpoint_selection`, `test_coverage_cohort`, `test_natural_b_diagnostics`, `v2_pilot` | HISTORICAL |
| `architecture_control.py` | Frozen seed42 architecture comparison | `architecture_replication`, `test_architecture_control` | HISTORICAL |
| `architecture_replication.py` | Frozen seeds43/44 comparison and aggregation | `coverage_robustness`, `coverage_tail_verification`, `test_architecture_replication` | HISTORICAL |
| `checkpoint_selection.py` | Historical BCE vs ranking checkpoint comparison | `test_checkpoint_selection` | HISTORICAL |
| `compare_adaptive.py` | MovieLens adaptive comparison | documented CLI / artifact reproduction | HISTORICAL |
| `compare_context.py` | MovieLens context comparison | documented CLI / artifact reproduction | HISTORICAL |
| `compare_context_adaptive.py` | MovieLens four-arm comparison | `test_adaptive` | HISTORICAL |
| `context.py` | MovieLens temporal features | `adaptive`, `compare_context`, `compare_context_adaptive`, `evaluate`, `test_adaptive`, `test_ncf`, `train` | KEEP, frozen library |
| `coverage_cohort.py` | Historical eligibility/scaling; shared hash ordering | `coverage_robustness`, `test_coverage_cohort`, `test_coverage_robustness`, `v2_pilot` | KEEP, frozen library |
| `coverage_completion.py` | Provenance-hashed cached audit completion | documented CLI / artifact reproduction | HISTORICAL |
| `coverage_robustness.py` | Frozen coverage audit; shared support/history/eligibility functions | `coverage_completion`, `coverage_tail_verification`, `test_coverage_robustness` | KEEP, frozen library |
| `coverage_tail_verification.py` | Provenance-hashed Tail inference audit | `test_coverage_tail_verification` | HISTORICAL |
| `data.py` | MovieLens data; shared train history; historical sampler | `adaptive`, `amazon_data`, `amazon_diagnostics`, `amazon_pilot`, `amazon_replication`, `compare_adaptive`, `compare_context`, `compare_context_adaptive`, `evaluate`, `final_study`, `multidomain_data`, `multidomain_experiment`, `natural_b_diagnostics`, `test_adaptive`, `test_coverage_tail_verification`, `test_final_study`, `test_multidomain`, `test_ncf`, `train` | KEEP, frozen library |
| `equal_step_control.py` | Historical equal-step control | `equal_step_replication`, `test_equal_step_control` | HISTORICAL |
| `equal_step_replication.py` | Historical six-seed equal-step study | `test_equal_step_replication` | HISTORICAL |
| `evaluate.py` | Historical MovieLens evaluator | `compare_context`, `test_ncf`, `train` | HISTORICAL |
| `final_study.py` | Frozen context pilot; final query/evaluation/bootstrap functions | `architecture_control`, `architecture_replication`, `coverage_completion`, `coverage_robustness`, `coverage_tail_verification`, `final_study_report`, `test_architecture_control`, `test_architecture_replication`, `test_coverage_robustness`, `test_coverage_tail_verification`, `test_final_study` | KEEP, frozen library |
| `final_study_report.py` | Frozen context pilot tables/figures | documented CLI / artifact reproduction | HISTORICAL |
| `model.py` | Base NeuMF definition | `compare_adaptive`, `compare_context`, `compare_context_adaptive`, `evaluate`, `multidomain_model`, `test_adaptive`, `test_ncf`, `train` | KEEP, frozen library |
| `multidomain_context.py` | Frozen context model and global cutoffs | `final_study`, `test_architecture_control`, `test_final_study` | KEEP, frozen library |
| `multidomain_data.py` | Canonical interactions, mappings, splits and balanced batching | `amazon_data`, `amazon_diagnostics`, `amazon_pilot`, `amazon_replication`, `architecture_control`, `architecture_replication`, `checkpoint_selection`, `coverage_cohort`, `coverage_completion`, `coverage_robustness`, `coverage_tail_verification`, `equal_step_control`, `equal_step_replication`, `final_study`, `final_study_report`, `multidomain_context`, `multidomain_experiment`, `natural_b_diagnostics`, `test_amazon`, `test_amazon_replication`, `test_architecture_control`, `test_architecture_replication`, `test_checkpoint_selection`, `test_coverage_cohort`, `test_equal_step_control`, `test_final_study`, `test_multidomain`, `test_natural_b_diagnostics`, `v2_pilot` | KEEP, frozen library |
| `multidomain_experiment.py` | Historical training/evaluation; shared architecture and checkpoint selector | `amazon_data`, `amazon_diagnostics`, `amazon_pilot`, `amazon_replication`, `architecture_control`, `checkpoint_selection`, `coverage_cohort`, `equal_step_control`, `equal_step_replication`, `final_study`, `natural_b_diagnostics`, `test_amazon_replication`, `test_checkpoint_selection`, `test_equal_step_control`, `test_multidomain`, `test_natural_b_diagnostics`, `v2_pilot` | KEEP, frozen library |
| `multidomain_model.py` | Unchanged A/B/C definitions | `amazon_data`, `amazon_pilot`, `amazon_replication`, `architecture_control`, `architecture_replication`, `coverage_cohort`, `coverage_robustness`, `coverage_tail_verification`, `final_study`, `multidomain_context`, `multidomain_experiment`, `test_amazon_replication`, `test_architecture_control`, `test_coverage_robustness`, `test_final_study`, `test_multidomain`, `v2_pilot` | KEEP, frozen library |
| `natural_b_diagnostics.py` | Historical natural-sampling diagnostics | `test_natural_b_diagnostics` | HISTORICAL |
| `test_adaptive.py` | Integrity tests for adaptive | unittest discovery | KEEP |
| `test_amazon.py` | Integrity tests for amazon | unittest discovery | KEEP |
| `test_amazon_replication.py` | Integrity tests for amazon replication | unittest discovery | KEEP |
| `test_architecture_control.py` | Integrity tests for architecture control | `test_architecture_replication` | KEEP |
| `test_architecture_replication.py` | Integrity tests for architecture replication | unittest discovery | KEEP |
| `test_checkpoint_selection.py` | Integrity tests for checkpoint selection | unittest discovery | KEEP |
| `test_coverage_cohort.py` | Integrity tests for coverage cohort | unittest discovery | KEEP |
| `test_coverage_robustness.py` | Integrity tests for coverage robustness | unittest discovery | KEEP |
| `test_coverage_tail_verification.py` | Integrity tests for coverage tail verification | unittest discovery | MERGE into test_research_foundation; old filename removed |
| `test_equal_step_control.py` | Integrity tests for equal step control | unittest discovery | KEEP |
| `test_equal_step_replication.py` | Integrity tests for equal step replication | unittest discovery | KEEP |
| `test_final_study.py` | Integrity tests for final study | unittest discovery | KEEP |
| `test_multidomain.py` | Integrity tests for multidomain | `test_amazon_replication`, `test_checkpoint_selection`, `test_equal_step_control`, `test_natural_b_diagnostics` | KEEP |
| `test_natural_b_diagnostics.py` | Integrity tests for natural b diagnostics | unittest discovery | KEEP |
| `test_ncf.py` | Integrity tests for ncf | unittest discovery | KEEP |
| `train.py` | Historical MovieLens training | `compare_adaptive`, `compare_context`, `compare_context_adaptive`, `test_adaptive`, `test_ncf` | HISTORICAL |
| `v2_pilot.py` | Historical V2 pilot and diagnostics | documented CLI / artifact reproduction | HISTORICAL |

New code: `training.py` supplies the future compact sampler, immutable protocol, one provenance helper and one A/B/C entry point. `test_research_foundation.py` retains both Tail unit checks and tests the sampler/preflight directly. No duplicate wrapper test remains under the old filename.

## Duplication and Boundaries

Non-Python files are retained too: `foundation.cjs` is the historical JS metric/split bridge used by MovieLens tests and older Amazon evaluators; `requirements.txt` and `multidomain_config.json` define their environment/default configuration. `README.md`, `MULTIDOMAIN.md`, `CHECKPOINT_SELECTION.md`, `EQUAL_STEP_CONTROL.md` and `COVERAGE_COHORT.md` document distinct historical protocols. `multidomain_audit.json` and earlier `results/` artifacts are frozen evidence, not scratch output. No configuration or historical document was rewritten.

- `multidomain_data.prepare_multidomain` and `multidomain_context.global_splits` repeat calendar cutoff logic. Both are source-hashed by frozen runs; leave them intact. Future data preparation uses the former for mappings and `final_study.build_stream` for requests. An expanded cohort must retain registered absolute cutoffs rather than silently recomputing percentiles.
- Ranking formulas exist in the JS foundation, MovieLens replay and final-study evaluator. Their aggregation/query protocols differ. Future global-time work uses `final_study.ranking_metrics/evaluate`, not a copied implementation.
- `final_study.paired_bootstrap` handles matched users within one domain. `architecture_control.macro_bootstrap` resamples overlapping reviewer clusters across domains. They estimate different quantities and must not be collapsed into one flat bootstrap.
- `multidomain_experiment.select_ranking_checkpoint` is already shared by the final-study runners. Future training reuses it, including earliest exact ties.
- `coverage_robustness` owns train-only eligibility, coldness and subgroup assignment. `coverage_cohort.select_hash_users` owns deterministic reviewer ordering. No new copies were added.
- Old runners assemble provenance separately. They remain historical; future results use `training.provenance`. Its code hashes supplement Git SHA because the working tree may be dirty.
- `coverage_completion.py` and `coverage_tail_verification.py` are one-time utilities, but their source hashes are explicitly recorded in frozen audit JSON. Retain them for reproduction, not as future pipeline stages. No 270-case loop was added to ordinary tests or future training.
- Historical tests protect different split/evaluation/sampling contracts. No identical redundant test was established safe to remove. Only the standalone Tail test wrapper was merged.

This is intentionally not a claim that all historical duplication has disappeared. Changing every frozen importer/hash would require an explicit versioned archival migration. This pass avoids that risk; the Python file count grows by one for the requested future training/sampler path rather than pretending source deletion is safe.

## Validation and Size

Counts include research-owned Python source/tests, excluding environments and ignored runs. Before: 45 Python files, 7,042 physical lines; 15 test files, 1,499 test lines. After: 46 Python files, 7,246 lines; 15 test files, 1,551 test lines. The increase is the future training/sampler implementation and focused tests, not ten new abstraction modules. No existing algorithm implementation was relocated or rewritten; the only merge is the Tail test file.

All 102 research tests passed. Existing tests include short synthetic optimizer fixtures in temporary directories; no research experiment was trained. Syntax checks passed for all 46 Python files. All 34 result JSON files parsed. Architecture summary/delta CSV values recomputed exactly from frozen seeds; support/history/opportunity summaries and coverage arithmetic also matched. The future entry point passed a read-only preflight on the declared V2 data without constructing a model or creating an output directory.

The before/after snapshot matched 359 preserved files, including application code, historical results/sources and nine final-study A/B/C checkpoints. The only permitted pre-existing differences were the appended `FINAL_STUDY.md` organization section and merged Tail test. No scientific artifact was generated or overwritten. `git diff --check` passed. Future full-training execution and expanded-cohort memory profiling remain unvalidated and unauthorized.

## Final-Study Artifact Inventory

All 45 pre-existing files are retained. No byte-identical exports were found. Summary tables, long-form rows, figures and verification cases serve different purposes even when derived from the same fits. JSON parses and CSV arithmetic are verified without rewriting exports. The old 5,000-user compute estimate remains historical and is superseded by the documented 7,016-user estimate.

| File | Role |
|---|---|
| `architecture_control_checkpoint_freeze_seeds43_44.csv` | verification artifact |
| `architecture_control_protocol_seed42.json` | protocol |
| `architecture_control_replication_protocol_seeds43_44.json` | protocol |
| `architecture_control_seed42.csv` | derived table / summary |
| `architecture_control_seed42.json` | raw model result |
| `architecture_control_seed42_deltas.csv` | derived table / summary |
| `architecture_control_seed43.json` | raw model result |
| `architecture_control_seed44.json` | raw model result |
| `architecture_control_three_seed_deltas.csv` | derived table / summary |
| `architecture_control_three_seed_ndcg.svg` | figure |
| `architecture_control_three_seed_summary.csv` | derived table / summary |
| `architecture_control_three_seed_summary.json` | derived table / summary |
| `cohort_scaling.csv` | derived table / summary |
| `cold_item_analysis.csv` | derived table / summary |
| `cold_item_summary.csv` | derived table / summary |
| `context_delta.svg` | figure |
| `context_deltas.csv` | derived table / summary |
| `coverage.csv` | derived table / summary |
| `coverage_completion.json` | verification artifact |
| `coverage_completion_validation.json` | verification artifact |
| `coverage_compute_7016.csv` | derived table / summary |
| `coverage_compute_estimates.csv` | derived table / summary |
| `coverage_eligibility_diagnostic.csv` | derived table / summary |
| `coverage_exposure_7016.csv` | derived table / summary |
| `coverage_robustness_audit.json` | verification artifact |
| `coverage_robustness_protocol.json` | protocol |
| `coverage_summary.csv` | derived table / summary |
| `coverage_vs_cohort_size.svg` | figure |
| `cross_domain_opportunity_deltas.csv` | derived table / summary |
| `cross_domain_opportunity_metrics.csv` | derived table / summary |
| `domain_sparsity.csv` | derived table / summary |
| `evaluation_users_vs_cohort_size.svg` | figure |
| `global_vs_cohort_coldness.csv` | derived table / summary |
| `item_support_distribution.csv` | derived table / summary |
| `metrics.csv` | derived table / summary |
| `pilot_seed42.json` | raw model result |
| `protocol.json` | protocol |
| `support_band_metrics.csv` | derived table / summary |
| `tail_metric_hand_checks.csv` | verification artifact |
| `tail_verification_cases.csv` | verification artifact |
| `tail_verification_protocol.json` | protocol |
| `tail_verification_result.json` | verification artifact |
| `tail_verification_summary.csv` | verification artifact |
| `train_item_support.csv` | derived table / summary |
| `user_history_metrics.csv` | derived table / summary |

## Active Foundation Freeze and Gradient Diagnostic

October 18, 2026. No Python source changed, no architecture was added, and no research fit or ranking evaluation was run. The active path was inspected before diagnostic execution. Frozen conclusions remain: no reliable naive-sharing advantage, D did not beat D_FIXED, scalar-gating replication criteria failed, and Media has a verified Top-10 floor.

### Canonical execution path

| Stage | Canonical code for expanded/future runs | Historical alternatives retained |
|---|---|---|
| Source preparation | `amazon_data.records`, `positive_record`; `multidomain_data.load_inputs` for prepared canonical rows | Original `prepare_cohort`, MovieLens `data.prepare` |
| Train eligibility and ordering | `coverage_robustness.train_eligible` (>=5 TRAIN positives/domain), `coverage_cohort.select_hash_users` / `hash_order` | V2 full-history eligibility is historical, not the new-cohort rule |
| Split and mappings | `multidomain_data.prepare_multidomain(..., split_scope='global')`; frozen calendar boundaries checked against `multidomain_context.global_splits` and saved manifest | Per-user/per-domain splits remain historical options, not interchangeable protocols |
| Current prepared data | Hash-verified `research/runs/expanded7016-20261013T224116Z/prepared.pt`; mappings are reused | Rebuild through the source/cohort functions only when needed, not every fit |
| Negative sampling | `training.sample_examples` / `eligible_item`, `data.known_items` | `data.sample_examples` materializes complements and stays frozen for old studies |
| Balanced draws | `multidomain_data.batch_indices` | Natural sampling retained for historical comparisons |
| Models | `multidomain_model.MultiDomainNeuMF` (A/B/C), `SelectiveNeuMF` (D/D_FIXED), `model.NeuMF` | `multidomain_context.ContextNeuMF` remains frozen |
| Fit and configuration | `training.Protocol`, `training.validation_schedule`, `training.run` with an explicit registered protocol | `multidomain_experiment.run`, `final_study.train_model`, equal-step/checkpoint/architecture runners reproduce older artifacts |
| Validation and queries | `final_study.build_stream`, `final_study.evaluate`, `ranking_metrics`, `logits` | Original `evaluate_domains` and MovieLens evaluator remain tied to their protocols |
| Checkpoint selection | `multidomain_experiment.select_ranking_checkpoint`, maximum macro validation nDCG, earliest exact tie | Historical BCE checkpoint experiment is not the current selection rule |
| Test gate | Separate scoring only after all compared checkpoints are frozen; `training.run` rejects immediate D/D_FIXED test scoring | Earlier historical runners may evaluate directly; do not reuse their orchestration for new work |
| Analysis and provenance | `final_study.paired_bootstrap`, `architecture_control.macro_bootstrap` / `check_coverage`, coverage helpers, `training.provenance` | Historical reports and coverage completion/tail diagnostics are reproducibility records |

Data preparation is deliberately outside `training.run`. Temporary execution recipes supply the registered prepared data and enforce multi-model freeze gates; there is no claim of a new permanent unified command. This boundary needs care in future authorized execution but does not justify another runner now. The two existing global-cutoff/mapping paths are checked against saved boundaries; consolidating them would touch frozen provenance, so they were retained rather than cosmetically merged.

### Run-cost and hygiene audit

- No repeated raw parsing or mapping reconstruction occurs inside the active training loop. Source files are hashed for provenance at fit startup; this is intentional I/O, not a hot-loop scan.
- The memory-safe sampler avoids per-user full catalog complements. The historical complement sampler remains a real O(users * items) risk if selected accidentally; it is not used by `training.run` or this diagnostic.
- Each validation window constructs 1,664,190 labeled sample tuples and a float32 four-column tensor (26,627,040 tensor bytes), while Python tuples and batch-index lists coexist. This O(samples) memory cost is real. Window seeds differ deliberately, so caching one sample window across the whole fit would change the experiment. The measured full-fit peak was below 1 GiB; no replacement sampler or stream change is made here.
- Full-catalog validation is the dominant visible cost. For example, D's first optimizer window reached validation after about 69 seconds; validation completed around elapsed 261 seconds. Repeated scoring is necessary because weights change. Query exclusions are prepared once. Catalog indices and unused popularity arrays are rebuilt by the generic evaluator, but that small avoidable work has not been isolated in a profile; the frozen evaluator was retained instead of changing a hashed scientific dependency for an unmeasured gain.
- `select_ranking_checkpoint` deep-copies only an improved best state, which is necessary to freeze it while training continues. There is one selected checkpoint per fit, not a checkpoint per validation step. Validation per-user dictionaries survive until replacement but are not accumulated in history; history retains small aggregate metrics only.
- There are no per-step JSON/CSV writes. Validation progress prints ten times per fit; the external progress callback is bounded. Finite gradient/parameter scans are deliberate safety checks, not debug waste.
- No unused active-path wrapper/import/function was established as safe to remove. Historical CLIs without importers are not dead code. All existing source and artifact files were retained; no cache/data cleanup was needed.

The 104 visible untracked files at entry were classified individually in the diagnostic JSON: 20 required source files, 3 documents, and 81 scientific artifacts. The largest are intentional coverage/support CSVs, not raw datasets. No temporary file, checkpoint, or cache was among those visible untracked files. `git check-ignore` confirmed raw data, `research/runs/`, and the Python environment remain ignored; existing `__pycache__/`, `*.pyc`, `*.pt`, and `*.pth` rules also remain. Local datasets/checkpoints were not deleted.

Before/after: 46 research Python files and 7,551 physical lines; the 11 inspected canonical library modules total 2,791 physical lines, including their historical helpers. Both counts are unchanged. No runtime or memory improvement is claimed because no code cleanup was performed. The useful outcome is a documented, hash-verified foundation, not an artificial reduction in file count.

### Frozen diagnostic protocol

Use the existing D_FIXED validation-selected step-2,497 checkpoint, not learned D gates and not a new initialization. The diagnostic has no new validation or test scoring, although the frozen checkpoint was originally selected using validation; this limits claims of purely train-selected provenance. The saved preparation container includes held-out fields, which were discarded without accessing their queries or interactions.

Exactly 150 mixed batches of 512 examples were selected before observing gradients: the first window of the canonical seed-42 Balanced stream, four negatives per positive, sampler sub-seeds 43/44/45 and batch sub-seed 43. These are deterministic stream offsets, not additional experiment seeds. The first batch matches the prior technical preflight hash. No batch was chosen using ranking outcomes. Each domain has 170 or 171 examples per batch.

For each batch compute mean BCE-with-logits separately for each domain, then `autograd.grad` only with respect to shared GMF and MLP user tables (224,512 shared parameters). Private paths remain part of forward computation but their gradients are not included in the measurements. Equal domain means are used; there is no loss reweighting, optimizer construction, parameter update, checkpoint save, or accumulated `.grad` state.

Cosine is dot(g1,g2)/(norm(g1)*norm(g2)), using float64 reductions of the float32 autograd gradients. Predeclared descriptive thresholds are <0, <-0.1 and >0.1. Undefined zero-norm cases are counted separately; none occurred. Combined vectors concatenate GMF and MLP, not the entire model. Overlapping-user counts expose the sparse row-support limitation; no post-hoc subgroup/batch selection was performed.

The result JSON and 1,350-row CSV are `results/final_study/gradient_conflict_seed42.json` and `.csv`, in the existing final-study analysis location. The JSON retains protocol, source/checkpoint/state hashes, input-stream hash, full untracked inventory, aggregate norms/ratios, and protected-file hashes. The script remains outside the repository at `/private/tmp/gradient_conflict42.py`. Diagnostic runtime was 11.025 seconds, peak process RSS 645.266 MiB. Model state hashes are identical before/after and all parameters' `.grad` remained unset.

### Gradient results

| Branch | Pair | Mean cosine | Median | P25 | P75 | Fraction <0 | Fraction <-0.1 | Fraction >0.1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| gmf | food-fitness | 0.000158972 | 0.000281836 | -0.001339857 | 0.001592492 | 0.433333 | 0 | 0 |
| gmf | food-media | 0.000337221 | 0.000025894 | -0.001281717 | 0.001732095 | 0.493333 | 0 | 0 |
| gmf | fitness-media | -0.000258843 | -0.000132133 | -0.001517789 | 0.000634270 | 0.520000 | 0 | 0 |
| mlp | food-fitness | -0.002968543 | -0.001185598 | -0.003963669 | 0.001509339 | 0.586667 | 0 | 0 |
| mlp | food-media | -0.000054547 | 0.000047527 | -0.003270858 | 0.002872419 | 0.493333 | 0 | 0 |
| mlp | fitness-media | 0.000139202 | -0.000013156 | -0.001171331 | 0.001467460 | 0.513333 | 0 | 0 |
| combined | food-fitness | -0.002690566 | -0.001034384 | -0.003490809 | 0.001467017 | 0.586667 | 0 | 0 |
| combined | food-media | -0.000038472 | -0.000011745 | -0.003152964 | 0.002851566 | 0.500000 | 0 | 0 |
| combined | fitness-media | 0.000116656 | 0.000000000 | -0.001079195 | 0.001244677 | 0.493333 | 0 | 0 |

| Branch | Domain | Mean norm | Median norm |
|---|---|---:|---:|
| gmf | food | 0.003039018 | 0.003050025 |
| gmf | fitness | 0.004239036 | 0.004239096 |
| gmf | media | 0.002385062 | 0.002378688 |
| mlp | food | 0.012945903 | 0.012959632 |
| mlp | fitness | 0.011203860 | 0.011181285 |
| mlp | media | 0.013527747 | 0.013590380 |
| combined | food | 0.013298427 | 0.013333435 |
| combined | fitness | 0.011984746 | 0.011960932 |
| combined | media | 0.013737226 | 0.013795131 |

| Branch | Food/Fitness mean-norm ratio | Food/Media | Fitness/Media |
|---|---:|---:|---:|
| gmf | 0.716913 | 1.274188 | 1.777327 |
| mlp | 1.155486 | 0.956989 | 0.828213 |
| combined | 1.109613 | 0.968058 | 0.872428 |

Exact dot products and both domain norms for every batch/pair/branch are in the CSV; JSON also retains exact aggregate values and mean/median per-batch norm ratios. Combined mean dot products are Food-Fitness -4.4644379072279386e-7, Food-Media -3.0093265636743764e-9, Fitness-Media +1.9963369851149494e-8.

### Interpretation and decision

**C. NEITHER IS STRONGLY JUSTIFIED.** Do not implement PCGrad, CAGrad, loss balancing, another gate, or another model on the basis of this diagnostic.

Negative signs are frequent (49.3-58.7% for combined gradients), but aggregate vectors are nearly orthogonal, not strongly opposed. No cosine is below -0.1 or above +0.1 in any measured branch. This is not evidence of strong positive alignment either. Only about 5.51, 5.69 and 4.61 users overlap across the respective domain pairs in a batch. Food-Fitness and Fitness-Media each have two zero-overlap batches. Disjoint embedding rows dilute global cosine, so these results do not establish that conflict is absent for overlapping users or throughout training.

Food-Fitness shows the clearest negative mean in MLP/combined gradients, while GMF has a slightly positive mean. Fitness-Media GMF is slightly negative, but combined gradients are slightly positive. This is compatible with some local competition, but does not show substantial global Fitness conflict or explain B's Fitness degradation causally. D_FIXED is a different architecture from B, and these measurements use one late/frozen parameter state, not the trajectory that produced B's outcome.

No domain strongly dominates combined magnitude: Media/Fitness is about 1.146, Food/Fitness about 1.110. Fitness's GMF norm is 1.777 times Media's, but MLP dominates the combined norm and the imbalance does not persist at the whole-shared-parameter level. Media has a slightly larger combined norm, not an unusually weak signal; its Top-10 floor cannot be explained simply by absent TRAIN gradients. Magnitude alone does not identify harmful transfer.

The next recommended method is **TRAIN-only representation/support diagnosis using the frozen model**, with a separately predeclared analysis of overlapping-user contributions if authorized. Do not search batches or thresholds until conflict appears. This recommendation is analysis, not an optimization intervention or authorization to run anything else.

If later evidence justifies PCGrad, the controlled comparison should keep D_FIXED unchanged: zero new model classes/files, one small shared-gradient projection helper in the existing training path, ordinary private-domain gradients, focused synthetic tests, and the same runner. A rough footprint is 40-80 helper/training lines plus 40-80 test lines, subject to exact loss normalization and sparse-gradient handling. It must preserve the mixed-batch/private loss scaling rather than silently changing mean-loss weights. No such helper was implemented here.

Limitations: one checkpoint, one deterministic 150-batch prefix, sparse user overlap, no gradient trajectory, no momentum/Adam-preconditioned direction analysis, no causal link to test ranking, and no statistical generalization from correlated batches. The diagnostic supports restraint, not a proof that gradient-conflict methods cannot work.

### Validation

All 113 research tests passed, including their existing synthetic fit fixtures; no research model was trained. All 46 Python sources passed syntax parsing and 63 result JSON files parsed. The 1,350 diagnostic rows independently reproduced cosine, quantile, fraction and norm aggregates. All 573 protected hashes matched, except the permitted appended audit document whose original 16,813-byte prefix matched exactly. Frozen checkpoint files and the in-memory D_FIXED state were unchanged. `git diff --check` passed. Branch remains `main`; 44 modified tracked files and 106 untracked files include preserved prior work. Nothing was staged, committed or pushed.

## Final Scope-Freeze Update — 2026-10-18

No model, dataset, category screen, or benchmark is authorized beyond the completed records in this repository. The exact working-tree inclusion proposal is maintained in [`docs/COMMIT_MANIFEST.md`](../docs/COMMIT_MANIFEST.md); the earlier untracked-file and size counts in this audit are historical snapshots from their stated audit runs, not current status totals.

For future inspection of the frozen expanded-study components, the dependency chain is:

1. Amazon source-row parsing/cohort preparation and fingerprints: `amazon_data.records`, `amazon_data.prepare_cohort`, and `multidomain_data.load_inputs`.
2. TRAIN-only eligibility and coverage facts: `coverage_robustness.train_eligible`, with deterministic cohort ordering in `coverage_cohort.select_hash_users`.
3. Global-time split, train-only mappings and domain records: `multidomain_data.prepare_multidomain`; final study query/history assembly and ranking evaluator: `final_study.build_stream` and `final_study.evaluate`.
4. Future-only deterministic sampler and immutable protocol/provenance entry point: `training.sample_examples`, `training.PROTOCOL`, `training.provenance`, and `training.run`.
5. Frozen A/B/C/D/D_FIXED definitions: `multidomain_model.MultiDomainNeuMF` and `multidomain_model.SelectiveNeuMF`; validation selection: `multidomain_experiment.select_ranking_checkpoint`.
6. Paired uncertainty and fixed coverage/subgroup diagnostics: `final_study.paired_bootstrap`, `architecture_control.macro_bootstrap`, and `coverage_robustness` helpers. The detailed TRAIN-only transferability audit is a frozen result artifact, not an active training stage.

This is a component map, not a claim that every historical fit was executed by one unified command. Frozen MovieLens, V1/V2, context, architecture, and coverage entry points remain historical reproducibility paths. No historical script, model, or valid scientific artifact was removed during final consolidation.


## TRAIN-Only Cross-Domain Transferability Audit

October 18, 2026. **Decision C: CURRENT DOMAIN TRIO HAS WEAK TRANSFERABILITY. Stop architecture development on this trio for now.** No model was constructed, trained, updated, or used for ranking inference. This audit concerns Amazon product-preference proxies: Grocery & Gourmet Food, Sports & Outdoors, and Movies & TV. They are not observations of nutrition, workouts, or streaming.

### Recovery and identity gate

The interrupted JSON was truncated at a NumPy boolean in group accounting. Its completed activity/transition fields were recovered unchanged. Missing representation tables were computed after the explicit identity check; the invalid partial file is preserved in /private/tmp, not committed as a scientific result. The final JSON was serialized fully before atomic replacement. No valid frozen result was overwritten.

Canonical conversion is exactly `amazon:user:` + raw reviewer ID. Raw eligible IDs, canonical IDs, unique canonical IDs and Model A mapped users all equal **7,016**; missing/extra/duplicate counts are zero. Sorted raw-ID order matches checkpoint indices exactly; each domain lookup is checked separately. Mapping fingerprint: `5ca4f5c9c6a6238c3aa9d2c255e25a4093164ac18fdd3add6b75fa57d9a1d2ee`. It hashes UTF-8 lines `rawID TAB canonicalID TAB index NEWLINE`.

The fixed 1,000-user subset uses existing SHA256(42:raw reviewer ID) ordering. Its ordered raw-ID fingerprint, recorded before calculations, is `2fd036f05987d3ace0fda6a08515fb382e1039b6c4f4101426a5d2e4cf0e1063`. It yields 499,500 unordered distinct user pairs. No users were dropped or resampled.

### Frozen calculations

Activity, chronology and group membership use only rating >=4 TRAIN events before 2019-09-29T04:42:29.728000+00:00. TRAIN counts reproduce 106,973 Food, 85,990 Fitness and 139,875 Media positives. Each user has >=5 per domain: no zero denominators.

Chronology uses consecutive distinct timestamp groups. A group is an unordered empirical distribution over domains. For adjacent groups x,y, add the outer product x*y to the transition matrix, with weight one total per group pair. There are 332815 groups, 23 tied groups and 325799 group boundaries. No within-timestamp transition is invented. Destination marginals use the same boundary population. Gap quantiles are weighted inverse empirical CDFs in days.

Representations are frozen Model A's independent private user tables at step 2,497. The checkpoint was historically validation-selected; this is not a claim of train-only checkpoint selection. No new held-out rows/outcomes are accessed. GMF and MLP matrices are 7016 x 16; concatenation is 7016 x 32. All diagnostic arithmetic is float64 from stored float32 weights.

For column-centered Xc,Yc, linear CKA = ||Xc^T Yc||_F^2 / (||Xc^T Xc||_F ||Yc^T Yc||_F). Concatenation centers each branch and divides it by its full-cohort Frobenius norm before joining, giving branches equal aggregate energy. Subgroup CKA recenters the selected rows. Temporary-code checks verify identity/permuted-coordinate CKA; independent numerical checks also verified orthogonal rotation/translation invariance and equality to the Gram-matrix formulation.

CKA is invariant to orthogonal changes of basis and isotropic scale, not all invertible transformations or arbitrary per-coordinate rescaling. Independently fitted factor models have additional non-identifiability, so low CKA alone does not establish unrelated underlying preferences.

Neighborhoods use full-cohort column centering, row normalization, within-domain cosine and self-exclusion. Stable sorting breaks ties by ascending canonical user ID. All 7,016 users are included. Computation uses 128 x 7016 chunks, never simultaneous full NxN matrices. Primary overlap is |N_k^a(u) intersect N_k^b(u)|/k. Jaccard is also retained separately in JSON, not mixed with overlap. Subgroups restrict focal users, not the neighbor universe. Similarity-structure Spearman uses average tied ranks on the fixed 499,500 user pairs.

### Activity

| Pair | Pearson | Spearman | Either >=2x | Either >=5x |
| --- | --- | --- | --- | --- |
| food-fitness | 0.226643 | 0.144010 | 0.388968 | 0.069983 |
| food-media | 0.200793 | 0.138996 | 0.465935 | 0.102908 |
| fitness-media | 0.097595 | 0.098143 | 0.448831 | 0.106471 |

Median [P25,P75] counts: Food 9 [6,16], Fitness 8 [6,13], Media 10 [7,20]. Activity correlation is weak and is not evidence of shared taste. Directional >=2x fractions are retained in JSON.

### Timestamp-group transitions

| Source -> destination | Weighted count | P(next | source) | Destination marginal | Lift | Gap days P25 / median / P75 |
| --- | --- | --- | --- | --- | --- |
| food -> food | 60724 | 0.583814 | 0.322885 | 1.808121 | 0.001516 / 0.170289 / 25.006713 |
| food -> fitness | 22082.5 | 0.212306 | 0.257578 | 0.824242 | 0.005718 / 10.258356 / 63.314259 |
| food -> media | 21206 | 0.203879 | 0.419538 | 0.485962 | 0.004155 / 7.016748 / 48.945922 |
| fitness -> food | 22219 | 0.266321 | 0.322885 | 0.824817 | 0.005231 / 10.874550 / 66.480868 |
| fitness -> fitness | 42663 | 0.511366 | 0.257578 | 1.985289 | 0.001875 / 0.922029 / 31.154896 |
| fitness -> media | 18547.5 | 0.222313 | 0.419538 | 0.529901 | 0.003952 / 8.222963 / 58.327708 |
| media -> food | 22252.5 | 0.160834 | 0.322885 | 0.498116 | 0.005513 / 12.591275 / 71.100617 |
| media -> fitness | 19173 | 0.138576 | 0.257578 | 0.537998 | 0.005382 / 15.660174 / 81.357037 |
| media -> media | 96931.5 | 0.700590 | 0.419538 | 1.669909 | 0.000961 / 0.109525 / 16.100521 |

All six cross-domain lifts are below one; same-domain persistence is enriched. Cross-domain user-lift medians are also below one, and only 20.6-41.9% of users have cross-domain lift >1. Frozen descriptive convention: STRONG requires at least 4/6 cross lifts >=1.2 and majority-user enrichment; MODERATE requires at least 2/6 >=1.1 and majority-user enrichment; otherwise WEAK. Result: **WEAK**. These are declared practical labels, not inferential cutoffs. Same-domain review bursts and user activity differences can affect transitions; lift does not establish causal influence or rule out every sequential signal.

### Representation and similarity structure

| Branch | Pair | CKA | Permuted-row mean CKA | 1000-user similarity Spearman |
| --- | --- | --- | --- | --- |
| gmf | food-fitness | 0.002450 | 0.002193 | 0.001151 |
| gmf | food-media | 0.002250 | 0.002247 | -0.003165 |
| gmf | fitness-media | 0.002067 | 0.002249 | 0.001202 |
| mlp | food-fitness | 0.003752 | 0.000363 | 0.006485 |
| mlp | food-media | 0.000361 | 0.000296 | -0.000404 |
| mlp | fitness-media | 0.000808 | 0.000340 | -0.000140 |
| concat | food-fitness | 0.004473 | 0.001268 | 0.004912 |
| concat | food-media | 0.001359 | 0.001023 | -0.000076 |
| concat | fitness-media | 0.002004 | 0.001253 | -0.000420 |

The 20 deterministic row permutations are descriptive reference values, not p-values. Food-Fitness MLP CKA exceeds its small permutation reference but remains only 0.003752; no broad preference alignment follows. Pairwise similarity correlations are essentially zero.

### Nearest-user overlap

| Branch | Pair | k | Users | Mean | Median | P25 | P75 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gmf | food-fitness | 10 | 7016 | 0.001653 | 0.000000 | 0.000000 | 0.000000 |
| gmf | food-fitness | 25 | 7016 | 0.003609 | 0.000000 | 0.000000 | 0.000000 |
| gmf | food-fitness | 50 | 7016 | 0.007380 | 0.000000 | 0.000000 | 0.020000 |
| gmf | food-media | 10 | 7016 | 0.001668 | 0.000000 | 0.000000 | 0.000000 |
| gmf | food-media | 25 | 7016 | 0.003751 | 0.000000 | 0.000000 | 0.000000 |
| gmf | food-media | 50 | 7016 | 0.007357 | 0.000000 | 0.000000 | 0.020000 |
| gmf | fitness-media | 10 | 7016 | 0.001340 | 0.000000 | 0.000000 | 0.000000 |
| gmf | fitness-media | 25 | 7016 | 0.003119 | 0.000000 | 0.000000 | 0.000000 |
| gmf | fitness-media | 50 | 7016 | 0.006782 | 0.000000 | 0.000000 | 0.020000 |
| mlp | food-fitness | 10 | 7016 | 0.001668 | 0.000000 | 0.000000 | 0.000000 |
| mlp | food-fitness | 25 | 7016 | 0.003706 | 0.000000 | 0.000000 | 0.000000 |
| mlp | food-fitness | 50 | 7016 | 0.007437 | 0.000000 | 0.000000 | 0.020000 |
| mlp | food-media | 10 | 7016 | 0.001454 | 0.000000 | 0.000000 | 0.000000 |
| mlp | food-media | 25 | 7016 | 0.003341 | 0.000000 | 0.000000 | 0.000000 |
| mlp | food-media | 50 | 7016 | 0.006836 | 0.000000 | 0.000000 | 0.020000 |
| mlp | fitness-media | 10 | 7016 | 0.001468 | 0.000000 | 0.000000 | 0.000000 |
| mlp | fitness-media | 25 | 7016 | 0.003569 | 0.000000 | 0.000000 | 0.000000 |
| mlp | fitness-media | 50 | 7016 | 0.007081 | 0.000000 | 0.000000 | 0.020000 |
| concat | food-fitness | 10 | 7016 | 0.001582 | 0.000000 | 0.000000 | 0.000000 |
| concat | food-fitness | 25 | 7016 | 0.003409 | 0.000000 | 0.000000 | 0.000000 |
| concat | food-fitness | 50 | 7016 | 0.006961 | 0.000000 | 0.000000 | 0.020000 |
| concat | food-media | 10 | 7016 | 0.001297 | 0.000000 | 0.000000 | 0.000000 |
| concat | food-media | 25 | 7016 | 0.003712 | 0.000000 | 0.000000 | 0.000000 |
| concat | food-media | 50 | 7016 | 0.007104 | 0.000000 | 0.000000 | 0.020000 |
| concat | fitness-media | 10 | 7016 | 0.001497 | 0.000000 | 0.000000 | 0.000000 |
| concat | fitness-media | 25 | 7016 | 0.003586 | 0.000000 | 0.000000 | 0.000000 |
| concat | fitness-media | 50 | 7016 | 0.007335 | 0.000000 | 0.000000 | 0.020000 |

Independent uniformly random k-neighbor sets have expected overlap coefficient k/(7016-1): 0.001426, 0.003564 and 0.007127 for k=10/25/50. This is a reference, not a fitted null or significance test. Observed overlap is near that reference. Every overall median is zero. There is no consistent pair advantage across neighborhood choices.

### Frozen support and opportunity groups

History thresholds remain LOW <=20, MEDIUM 21-34, HIGH >34 total TRAIN positives. Opportunity thresholds remain Food <=5/other >=24, Fitness <=5/other >=24, Media <=6/other >=18. Interpretability here requires at least 30 TRAIN users and 50 target TRAIN positives, not the old held-out group size.

| Group | Users | TRAIN positives Food / Fitness / Media |
| --- | --- | --- |
| low | 838 | 5107 / 5023 / 5153 |
| medium | 2819 | 24952 / 23654 / 27189 |
| high | 3359 | 76914 / 57313 / 107533 |
| opportunity_food | 377 | 1885 / 6042 / 9498 |
| opportunity_fitness | 556 | 10843 / 2780 / 15795 |
| opportunity_media | 854 | 14866 / 12591 / 4631 |

| Group | Pair | GMF CKA | MLP CKA | Concat CKA | Concat overlap@25 mean | Activity Pearson / Spearman |
| --- | --- | --- | --- | --- | --- | --- |
| low | food-fitness | 0.017048 | 0.003462 | 0.009971 | 0.003532 | -0.254675 / -0.226597 |
| low | food-media | 0.017897 | 0.005806 | 0.010026 | 0.003628 | -0.293603 / -0.263827 |
| low | fitness-media | 0.018289 | 0.001987 | 0.008253 | 0.003675 | -0.274152 / -0.243722 |
| medium | food-fitness | 0.006425 | 0.000829 | 0.003490 | 0.003278 | -0.250917 / -0.234698 |
| medium | food-media | 0.005368 | 0.000329 | 0.002031 | 0.003519 | -0.360226 / -0.364839 |
| medium | fitness-media | 0.005665 | 0.001334 | 0.004529 | 0.003661 | -0.320278 / -0.310818 |
| high | food-fitness | 0.005729 | 0.008444 | 0.009668 | 0.003489 | 0.138300 / -0.066486 |
| high | food-media | 0.004930 | 0.002564 | 0.004088 | 0.003894 | 0.120444 / -0.209300 |
| high | fitness-media | 0.004998 | 0.001270 | 0.003464 | 0.003501 | 0.004271 / -0.224542 |
| opportunity_food | food-fitness | 0.039946 | 0.004287 | 0.019907 | 0.004350 | undefined / undefined |
| opportunity_food | food-media | 0.034602 | 0.017533 | 0.028505 | 0.004562 | undefined / undefined |
| opportunity_food | fitness-media | 0.042095 | 0.006171 | 0.026346 | 0.002546 | -0.261710 / -0.510100 |
| opportunity_fitness | food-fitness | 0.026461 | 0.005797 | 0.015521 | 0.003813 | undefined / undefined |
| opportunity_fitness | food-media | 0.031496 | 0.008369 | 0.019794 | 0.003669 | 0.094444 / -0.404282 |
| opportunity_fitness | fitness-media | 0.026060 | 0.004018 | 0.016501 | 0.003094 | undefined / undefined |
| opportunity_media | food-fitness | 0.017714 | 0.006558 | 0.014472 | 0.003560 | 0.114882 / -0.336109 |
| opportunity_media | food-media | 0.019548 | 0.003839 | 0.009894 | 0.003419 | -0.040645 / -0.041968 |
| opportunity_media | fitness-media | 0.015985 | 0.002320 | 0.009888 | 0.003841 | 0.034778 / 0.055027 |


All groups meet the declared TRAIN diagnostic minimum. Media's 854 users are not its earlier 17-user TEST subgroup. Food/Fitness opportunity targets have exactly five positives by eligibility plus threshold, so target activity correlations are undefined rather than zero. Negative correlations induced by conditioning on total/auxiliary counts must not be interpreted as preference opposition. Smaller-sample biased CKA tends to increase; subgroup CKA cannot be compared naively with full-population CKA without size-matched controls. No subgroup has convincing neighborhood overlap. Exact mean/median/quartiles for every branch/k/group are retained in the JSON.

### Decision and literature boundary

**C. CURRENT DOMAIN TRIO HAS WEAK TRANSFERABILITY. No new model is justified by this audit.** Stop adding cross-domain architectures on this benchmark. Relatively stronger: Food-Fitness (activity, temporal cross lift and MLP/concat CKA); relatively weaker representation/temporal pair: Food-Media. Fitness-Media is intermediate on representation/temporal evidence but weakest on activity. These are descriptive qualifications, not an overall score or a stable ranking of every diagnostic.

Retain the frozen benchmark as a negative-result study: the tested simple sharing/selective-gating approaches did not establish reliable transfer on these product proxies. Do not claim that these diagnostics prove all possible methods must fail. An optional future secondary benchmark would require separately predeclared TRAIN-only domain-relatedness, cohort and coverage criteria, with untouched validation/test outcomes; no new domains were selected here.

[SyNCRec](https://arxiv.org/abs/2407.11245) motivates diagnosing weak relationships and sparsity before cooperative sequential transfer. [H3Trans](https://arxiv.org/abs/2211.11191) cautions against losing domain-specific preferences in a globally shared user representation. [CUT](https://arxiv.org/abs/2403.20296) motivates filtering source information against target structure, and [COAST](https://arxiv.org/abs/2301.11467) motivates user-interest alignment. None supplies evidence that this particular trio has transferable signal. [Kornblith et al.](https://proceedings.mlr.press/v97/kornblith19a.html) supplies the CKA diagnostic, not a ranking metric. This audit reproduces none of those recommendation methods.

Limitations: one independently trained checkpoint, weak underlying recommendation models, embedding scale non-identifiability, product-review rather than consumption timestamps, eligibility conditioning, biased subgroup CKA, no inferential significance tests, and no test of richer semantic item features. Weak measured structure is evidence against another immediate model, not proof of intrinsically unrelated domains.

Only the repaired `results/final_study/transferability_seed42.json` and this appended section are permanent outputs. No CSV is needed because the JSON retains all detailed tables. The diagnostic remains at `/private/tmp/transferability42.py`; there is no repository Python script to remove. No historical file or cache was deleted. Research Python file/LOC change is zero.

Validation: 113 research tests passed (existing synthetic fixtures), 46 Python files passed syntax checks, and 64 result JSON files parsed. Exact identity, subset hash, transition marginals/lifts, group accounting, weighted subgroup neighborhood means and overlap-count arithmetic passed. All 575 protected files retained their hashes, except this permitted append whose original 31,436-byte prefix matched exactly. Completed activity/temporal values and the frozen analysis protocol are unchanged. `git diff --check` passed. Git remains main with 44 modified tracked files, 107 untracked files and nothing staged. No commit or push occurred.

## Secondary Benchmark Selection: Local Availability Gate

The Food/Fitness/Media benchmark and completed K=10 results remain primary and frozen. This is a separate proposed contrast study, not a replacement or a search for a model-winning dataset.

Only three complete Amazon category archives are present under `data/raw/amazon2023/`: Grocery_and_Gourmet_Food, Sports_and_Outdoors, and Movies_and_TV. Processed pilot/V2 files are subsets of these sources, not additional categories. Existing full-source audit counts are respectively 14,081,169 / 19,349,403 / 17,158,519 accepted ratings and 7,034,393 / 10,331,141 / 6,503,429 users. These are inventory counts, NOT TRAIN-only screening results. No raw scan, pair screening, download, validation/test inspection or training was performed in this pass. Discovery is scoped to repository data; unrelated external disks were not searched.

**Stop at the local-availability gate. No secondary pair is selected or rejected on structural statistics.** Missing evidence is not a failed pair. Further acquisition requires separate approval.

### Predeclared candidate and download plan

Eight categories, seven within-family pairs only:

- Media: Movies_and_TV, CDs_and_Vinyl, Digital_Music (three pairs).
- Consumer technology: Electronics, Cell_Phones_and_Accessories (one pair).
- Wellness/lifestyle: Sports_and_Outdoors, Health_and_Household, Beauty_and_Personal_Care (three pairs).

These are semantic hypotheses about product preferences, not demonstrated relationships. Grocery remains in the frozen primary study but is not a new screening candidate. Six missing archives would be needed. Acquire the two missing media categories first for lower initial volume, then the technology and wellness files, only after approval. This acquisition order gives no selection priority: complete all seven pairs before selection. Do not expand to cross-family pairs after viewing outcomes.

Use the official [Amazon 2023 pre-split 0-core rating-only files](https://amazon-reviews-2023.github.io/data_processing/0core.html), not full-history 5-core filtering or supplied leave-last-out splits. Exact sources, local SHA256 identities and a proposed file-by-file Git manifest are in `results/final_study/secondary_benchmark_screening_plan.json`. No CSV is needed while screening has not run.

### Frozen proposed screen

Use rating >=4 and timestamp <=2019-09-29T04:42:29.728000+00:00. Eligibility is pair-specific: >=5 TRAIN positives in each domain, not membership in the original three-domain cohort. First require >=2,500 eligible shared users. Then require BOTH directional chronological transition lifts strictly >1. Among survivors prefer greater TRAIN activity Spearman. Exact ties use lower worst-domain fraction of items with support <=5, then higher minimum-domain median support, then lexical pair order. Undefined lifts fail; undefined correlations cannot win the correlation comparison. No relaxed thresholds if no pair survives, and no composite score.

Report shared users before/after eligibility, positives/items, support median/P75/P90 and fractions =1/<=5/>=20, Pearson/Spearman, activity medians/quartiles and >=2x/>=5x imbalance. Report both full-domain TRAIN support and pair-eligible support; selection tie-breaks use the latter. Eligible counts must all be >=5. Equal timestamps remain unordered groups. Count only consecutive-group transitions using fractional outer products of domain proportions, with destination marginals from the same transitions; publish counts and all four probabilities/lifts. Do not inspect validation/test outcomes or recommendation performance.

If a pair qualifies, propose one seed-42 independent versus shared-user comparison under the same global calendar cutoffs, train-only mappings, warm-item evaluation and canonical memory-safe sampler. Match streams, batch512, four negatives and Adam0.001; freeze an exposure budget and ten validation opportunities from TRAIN counts before fitting. Select by macro validation nDCG@10, earliest tie; evaluate P/R/nDCG@10 only after both checkpoints freeze. No model run is authorized by this plan. If no pair qualifies, stop and retain the primary negative-result study.

### Footprint and recovery milestone

The six missing categories total approximately 117.83 million all-time source ratings from rounded official catalog counts. Compressed bytes, TRAIN overlap and runtime are not yet known; this is not a download-size estimate. Use streamed decompression and disk-backed TRAIN aggregation/order rather than holding all sources in RAM. Measure throughput and storage before scheduling screening. Model compute cannot be estimated responsibly before TRAIN populations and vocabularies exist.

The JSON's proposed milestone manifest classifies every existing modified/untracked file as source/test, scientific artifact or documentation, with sizes and hashes. All are retained. Raw/processed data, checkpoints, environments, logs and caches stay ignored; temporary analysis code stays outside the repository. The manifest is an inclusion proposal, not a completed semantic/security sign-off. Before committing, review full diffs/content and provenance, rerun applicable tests and inspect explicitly staged paths. Nothing is staged, committed or pushed here; no historical code or artifacts are removed.

### Authorized Movies and CDs Pair Screen

Only the requested `Movies_and_TV` / `CDs_and_Vinyl` pair was screened. The official `CDs_and_Vinyl.csv.gz` archive is 94,386,995 bytes, SHA256 `1bade4e428efcffb549b6b7cb1f62a8cde9644e19a981a210b11a4c9c1561e75`, from the 0-core rating-only source URL recorded in the screening JSON. Streamed parsing through the frozen global cutoff found 14,518,868 Movies and 4,159,126 CDs TRAIN ratings, including 11,805,515 and 3,643,164 positives (rating >=4); no malformed records were encountered. Pair eligibility was 38,142 users with at least five TRAIN positives in both domains, passing the 2,500-user gate.

Among those eligible users, activity Pearson/Spearman were 0.287517/0.200696. Median (P25–P75) positive counts were Movies 11 (7–21), CDs 9 (6–17); 46.42% had >=2x imbalance and 11.52% >=5x. Timestamp-group transition probabilities and lifts were Movies→Movies 0.750798 / 1.432013, Movies→CDs 0.249202 / **0.523859**, CDs→Movies 0.276979 / **0.528288**, CDs→CDs 0.723021 / 1.519895. Cross-domain enrichment fails in both directions. **Decision: FAIL. No secondary benchmark is justified by this pair; do not fetch the next category automatically.** The positive activity correlation does not override the required transition gate.

Full-domain TRAIN item support (median/P75/P90; support=1, <=5, >=20 fractions) was Movies 3/9/34; 0.3521/0.6684/0.1496, and CDs 2/4/11; 0.4679/0.8110/0.0562. Within eligible users it was Movies 2/4/9; 0.4999/0.8267/0.0378, and CDs 1/2/5; 0.5963/0.9012/0.0172. The CSV archive was processed with temporary SQLite disk storage: peak process RSS 132.55 MiB and screen processing time 200.0 seconds (download time excluded). The archive remains under ignored `data/raw/`; temporary SQLite was removed. Exact values and status are in `results/final_study/secondary_benchmark_screening_plan.json`.

### Final Authorized Sports and Health Pair Screen

The only additional pair screened was `Sports_and_Outdoors` / `Health_and_Household`. The official Health archive is 602,047,991 bytes (SHA256 `0a8982f9915bd18ea61caf4341db95c3fe1478abee907e6a61fec838374d2dca`). It contained 25,269,798 accepted records; 11,243,826 fell on or before the frozen TRAIN cutoff, with 9,091,758 positive records. The existing Sports archive contained 19,349,403 accepted records; 10,744,568 TRAIN records, including 8,730,126 positives. No malformed records were found. Eligible shared users numbered 48,561, passing the 2,500 gate.

Eligible-user activity Pearson/Spearman were 0.288290/0.144252. Timestamp-group transition probabilities and lifts: Sports→Sports 0.605264 / 1.250865; Sports→Health 0.394736 / **0.764809**; Health→Sports 0.368303 / **0.761150**; Health→Health 0.631697 / 1.223927. Since both required cross-domain lifts exceed neither 1, the exact decision is **FAIL**. Activity correlation does not override this gate. Median positive counts were 8 in each domain; >=2x and >=5x activity imbalance fractions were 0.317498 and 0.035749.

Full-domain TRAIN item support (median/P75/P90; fractions support=1/<=5/>=20) was Sports 2/4/13; 0.4752/0.7940/0.0713, Health 3/9/32; 0.3588/0.6713/0.1438. Among eligible users it was Sports 1/2/5; 0.6268/0.9003/0.0180, Health 1/4/9; 0.5095/0.8269/0.0406. Streamed disk-backed processing took 284.1 seconds with peak RSS 123.05 MiB; archive download took about 55 seconds. The temporary database was removed and the raw archive remains gitignored. This pair also fails the predeclared structural gate. **Terminate secondary Amazon-domain screening; do not screen Sports/Beauty, Electronics/Cell Phones, or download any more categories.** The plan JSON retains both pair results and detailed transition gap/support statistics.
