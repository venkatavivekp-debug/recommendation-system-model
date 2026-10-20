# ContextFit

**Context-Aware Adaptive Recommendation with Transferability-Aware Cross-Domain Learning**

ContextFit is a master's research project and working recommendation application. Its offline study asks when user information shared across product domains helps ranking, and when it does not. A separate React and Node.js application provides context-aware food, fitness, and media recommendations with persistent feedback. The live application is not powered by the offline research models.

## Research Question

Do shared users imply transferable preferences? The study compares independent and shared-user NeuMF recommenders across Grocery & Gourmet Food, Sports & Outdoors, and Movies & TV, using Amazon Reviews 2023 and a leakage-safe global calendar-time protocol.

## Why It Matters

Cross-domain recommenders can use activity from a sparse target domain, but irrelevant source behavior can also dilute preferences. This project treats negative transfer, item cold-start, and reproducibility as first-class research questions rather than assuming that more sharing is better.

## Architecture

**LIVE CONTEXTFIT:** React feedback controls -> existing Express candidate generation and contextual scoring -> per-user/per-domain LinUCB adjustment -> existing diversity selection -> durable impression -> explicit feedback -> incremental policy update -> fresh ranking. Cross-domain influence is explicit context, not shared adaptive parameters.

**OFFLINE RESEARCH:** NeuMF's Generalized Matrix Factorization and MLP branches combine user and item embeddings. A/B/C compare independent domain learning, naive shared-user learning, and shared learning with domain-specific offsets. D and D_FIXED compare learned and fixed scalar shared residuals. This frozen Python framework supplies research evidence about transferability; its Amazon models do **not** power the live app. There is no live Python model endpoint, and Amazon test metrics do not measure live-app quality.

## Dataset

The primary frozen benchmark contains 7,016 reviewers eligible using at least five positive training interactions in each domain before the global training cutoff. A rating of 4 or higher is positive. The categories are product-preference proxies: they are not direct measures of food consumption, exercise behavior, or streaming history. Raw Amazon files and model checkpoints are not included in Git.

## Leakage-Safe Protocol

The primary expanded benchmark uses a fixed global-time split, train-only user/item mappings and eligibility, Balanced negative sampling (four negatives per positive), batch size 512, Adam at 0.001, and validation-only checkpoint selection. Each seed-42 fit used 12,486 optimizer steps and the same predeclared ten validation opportunities; test evaluation was deferred until checkpoints were frozen. The historical V2 three-seed study is a distinct cohort and protocol and is not pooled with expanded-benchmark results.

## Models

| ID | Definition |
| --- | --- |
| Most Popular | Training-only popularity reference |
| A | Independent domain NeuMF branches |
| B | Naïve shared-user NeuMF with domain-specific item tables |
| C | B plus domain-specific user offsets |
| D_FIXED | Private plus fixed 0.5 shared residual |
| D | Same residual structure with one learned scalar gate per domain |

## Key Findings

On the expanded 7,016-user seed-42 benchmark, no A/B/C model wins consistently across domains; Media has zero P/R/nDCG@10 for every listed model. Historical V2's three-seed macro nDCG@10 was A 0.004240 ± 0.000872, B 0.004139 ± 0.000317, and C 0.004138 ± 0.000289, with no stable overall sharing advantage. On expanded data, D did not beat its D_FIXED capacity control and did not preserve the Food gain; learned scalar gating therefore did not meet its predeclared replication criteria. These results are protocol-specific feasibility evidence, not proof that cross-domain recommendation generally fails.

Exact expanded seed-42 P@10, R@10, nDCG@10, checkpoint, parameter, runtime, and memory values are in the [canonical result table](research/results/final_study/final_results_seed42.csv). The experiment records and provenance are in [FINAL_STUDY.md](research/FINAL_STUDY.md).

## Final Figures

- [Study protocol](research/results/final_study/figures/contextfit_protocol.svg)
- [Expanded seed-42 nDCG@10](research/results/final_study/figures/expanded_seed42_ndcg.svg)
- [Warm-item coverage scaling](research/results/final_study/figures/warm_coverage_scaling.svg)
- [Cold-start coverage](research/results/final_study/figures/cold_start_coverage.svg)
- [Transferability diagnostics](research/results/final_study/figures/transferability_diagnostics.svg)

## Transferability Diagnostics

Train-only activity correlations were modest (Spearman 0.098–0.144), all cross-domain chronological transition lifts were below one, and same-domain transitions were enriched. Frozen independent-model representations had low linear CKA (about 0.0004–0.0045); cross-domain nearest-neighbor overlap was near its random expectation and pairwise user-similarity correlations were near zero. Two predeclared secondary category-pair screens also failed their bidirectional transition-lift gate. These are descriptive relatedness diagnostics, not tests of recommendation quality or causal transfer.

## Live Application

The React/Vite frontend and Node/Express backend support food and restaurant discovery, workout-context recommendations, media suggestions, and user-specific Select/Save/Helpful/Not Interested feedback. Feedback persists and successful actions refresh rankings. Restaurant candidates can come from live OSM/Overpass or configured Google discovery, with local fallback data; nutrition and some media attributes remain estimates or illustrative metadata.

### Adaptive Core v1

`backend/src/services/banditDecisionService.js` implements the adaptive policy and impression path. It reuses candidate filters, base relevance, context mapping, multi-output selection, and semantic deduplication. The policy is an interpretable linear contextual-bandit adjustment to that prior, not a replacement candidate generator.

Policy version: `contextfit-bandit-v1`. Feature schema: `contextfit-features-v1`. Dimension: **8**. Fixed ridge `lambda = 1`, exploration coefficient `alpha = 0.08`, learned-contribution weight `0.25`. These are engineering configuration, not coefficients tuned on behavior-test outcomes.

```text
A = lambda * I; b = 0
theta = solve(A, b)
exploitation = theta^T x
uncertainty = sqrt(x^T solve(A, x))
exploration = min(0.08, 0.08 * uncertainty)
banditScore = exploitation + exploration
finalScore = baseScore + 0.25 * exploitation + exploration

On eligible explicit feedback: A += x x^T; b += reward * x
```

Cholesky solves avoid storing a matrix inverse. Features have norm at most one, so valid ridge/outer-product state already bounds the exploration term. Malformed, asymmetric, non-positive-definite or nonfinite policy state fails closed rather than silently erasing learning. Final ranking scores are not calibrated probabilities; display confidence is bounded separately. There is no downstream random exploration, active sequence boost, or automatic content-model retraining in this path.

### Frozen Feature Schema

`candidateFeatures` is the only vector constructor. It merges candidate features, recommendation features, then recommendation factors. In the exact order below, each value is clipped to `[0,1]`; missing/nonfinite values become zero. The bias is one. **Every entry is then divided by `sqrt(8)`**. All inputs exist at recommendation time; missing metadata is not invented.

| # | Feature | Source, in priority order | Availability / domain scope / cross-domain content |
| --- | --- | --- | --- |
| 1 | `bias` | Constant 1 | All candidates; common; none |
| 2 | `baseRelevance` | `scoreTrace.baseScore`, confidence, or score / 100 | Existing domain scorer; common interface; may include explicit contextual prior |
| 3 | `preferenceMatch` | `preferenceFit`, `preferenceMatch`, `genreMatch` | Profile/candidate attributes; domain-specific; no other user's taste |
| 4 | `feedbackAffinity` | `affinityFit`, `interactionAffinity`, `learnedPreferenceFit`, `historySimilarity` | Same-user/domain history or existing neutral helper defaults; no synthetic reward labels |
| 5 | `sessionIntentFit` | `sessionIntentFit` | Optional current food/music request; target-domain only |
| 6 | `attributeFit` | `macroFit`, `proteinMatch`, `durationFit` | Available nutrition/duration metadata; Food macro fit may include explicit workout context |
| 7 | `contextFit` | `contextFit`, `mealContextFit`, `calorieFit` | Current target-domain context; may reflect explicitly mapped workout/nutrition state |
| 8 | `crossDomainFit` | `crossDomainFit`, `activityFit` | Nonzero only with an explicit cross-domain provenance object; otherwise zero |

Features can overlap in meaning with the contextual prior; their coefficients are not causal explanations. Generic Fitness candidates currently have fewer populated features than Food/Media. The schema does not promise unavailable sensors, audio features, or behavioral labels.

### Feedback, Persistence, and Provenance

Rewards are **Select +1, Save +1, Helpful +0.5, Not Interested -1**. Shown, silence, view, and ignored/unknown actions do not update v1. No delayed reward is inferred. The legacy delayed-proxy reporting field is now `null`; historical utility functions remain for compatibility, not policy learning.

State is stored on the existing user record as `adaptivePolicies[targetDomain] = {policyVersion, featureSchemaVersion, A, b, updateCount, appliedEvents, revision}`. Food, Fitness, and Media use separate matrices/vectors and receipts. There are no shared adaptive embeddings or hidden cross-domain weights. Mongo uses per-domain revision compare-and-swap; the local JSON adapter uses its existing serialized atomic temp-file/rename write path.

One returned candidate has one canonical impression ID. The existing interaction model stores `id` (returned as `recommendation.recommendationEventId`), `userId`, `createdAt` (timestamp), `domain` (target domain), `candidateId`, `candidateRank`, and `action/eventType = shown`. Its `context.adaptive` holds policy/schema versions, the normalized vector and named values, `scoreTrace`, cross-domain signals, and `explorationAffectedSelection`. The latter means UCB improved the candidate's rank versus exploitation-only ordering **before diversity selection**, not a causal attribution of a click. Context and candidate metadata accompany the snapshot. An impression is an issued recommendation, not proof of browser visibility.

Media defers persistence until the final response or timeout fallback is chosen. The API waits for persistence before returning IDs. Local versioned impressions are batch-written to `<DATASTORE_PATH>.impressions.json` through the **same DataStore class** so profile/meal reads do not clone the growing impression history. Compact JSON, reuse of an unchanged cached serialization, and removal of a redundant clone preserve synchronous persistence and atomic replacement; no queue worker, write-behind cache, or new database was introduced.

Feedback sends `recommendationEventId`, candidate ID, and explicit action to the existing feedback endpoint. The server binds the event to the authenticated user, target domain, candidate, and policy/schema version. It uses the **stored impression vector**, never a client-supplied feature vector. Feedback metadata retains `feedbackEventId`, original impression ID, versions, vector, reward, timestamp and `delayedOutcome: null`. A deterministic user/domain/impression/action receipt prevents duplicate policy updates and duplicate feedback records on retry. Different explicit actions on one impression are distinct evidence.

Old feedback without an impression ID may retain its existing long-term affinity role but cannot create a synthetic LinUCB update. New versioned feedback is excluded from the old heuristic feedback-weight/prior updates; it enters learned policy features and the new policy update instead. Long-term state survives login/request/process boundaries. Request intent is transient; stored workout intent expires with the existing 24-hour workout context or is replaced by a newer session. Typing an intent or requesting a list never rewrites the profile or trains the policy. An explicit action contributes one bounded observation, not a profile replacement.

### Domain Boundaries and Score Traces

- **Food:** the existing food controller already called the bandit service. Food scoring, restaurant/search fallback and the generic Food path now load persisted state, rank, retain existing diversity/suppression, and persist final impressions.
- **Media:** existing content candidate generation/context scoring feeds the same policy; one canonical log replaces independent per-card shown records. Select/Helpful/Save/Not Interested carries the impression ID through every existing client surface.
- **Fitness:** `nutritionPlannerService`'s `exerciseAdjustment.foodToFitness` is rule-based advice, not bandit-ranked exercise selection. The already-existing `recommendationService.getDomainRecommendations` candidate path uses LinUCB where invoked. No new Fitness endpoint or symmetric UI was invented.
- **Transferability guard:** explicit workout -> Food, timestamped activity -> Media, and existing meal-state -> Fitness rules are preserved. Each signal contains `sourceDomain`, `sourceEvent`, `sourceTimestamp`, `targetDomain`, `reason`, `sourceContext`, and `derivedValues`. A request-defined activity is labeled `explicit_session_context`, not a fabricated sensor event. Missing timestamps produce no cross-domain signal. Context is queried under the authenticated user; it changes target features, not another domain's policy state.

`scoreTrace` is authoritative: `baseScore`, `baseRelevance`, `preferenceContribution`, `contextContribution`, `feedbackContribution`, `crossDomainContextContribution`, `banditExploitation`, `adaptivePolicyContribution`, `banditExploration`/`explorationBonus`, `banditScore`, `finalScore`, `diversityAdjustment`, versions, and named learned `featureContributions`. Base components reconcile to `baseScore`, including bounds; learned feature contributions sum to `0.25 * exploitation`. `finalScore = baseScore + adaptivePolicyContribution + explorationBonus`. Diversity is a selection/deduplication constraint, so its numerical adjustment is zero. Existing card disclosures read the real trace rather than an explanation-only score or the removed `bandit.feedbackAdjustment`.

### Verification and Local Latency

Regression results: **51 backend tests, 5 frontend tests, 113 research tests passed**; frontend lint/build, 158 backend JS syntax checks, 46 research Python syntax checks, and `git diff --check` passed. The production build was verified with Node 22.23.2. All **664 protected research files** match their frozen SHA256 hashes, including results, checkpoints, diagnostics, figures and scientific documentation. Research tests use synthetic fixtures, not new research experiments.

The compact behavior inventory covers finite initial/state handling and deterministic UCB; Select/Save/Helpful/Not Interested updates; original-vector use; duplicate receipts; silence not being a label; user and Food/Fitness/Media isolation; session/profile separation; fresh process/login persistence; workout -> Food and activity -> Media context; meal -> Fitness provenance; exact suppression; semantic deduplication; additive traces; API/client IDs and persisted policy/schema versions. These are **system-behavior tests, not recommendation-accuracy evidence**. Mongo concurrency logic was inspected but not exercised against a live Mongo deployment; tests use the local JSON adapter. Browser verification covered Food and Media feedback, fresh-login persistence, user/domain isolation, and session-context reset.

Localhost measurements: same machine, local providers, fresh isolated user/store, three warmups then 30 sequential requests per endpoint. Median is the harness's lower-middle sample; P95 is the nearest-rank sample. Timings include HTTP/JSON and a growing store, not external provider/network latency.

| Endpoint | Before median / P95 ms | After median / P95 ms | Median delta ms (%) | P95 delta ms (%) |
| --- | --- | --- | --- | --- |
| Food, limit 8 | 5.144 / 7.647 | 10.215 / 12.677 | +5.070 (+98.56%) | +5.030 (+65.78%) |
| Media, 20-minute intense run | 35.566 / 49.926 | 49.262 / 66.405 | +13.696 (+38.51%) | +16.479 (+33.01%) |
| Nutrition with Fitness context | 93.540 / 123.892 | 84.337 / 92.369 | -9.203 (-9.84%) | -31.523 (-25.44%) |

Policy-only feature construction, solves, traces and sorting for 120 candidates: **0.380 ms median, 0.493 ms P95**, 500 measured calls after 30 warmups, without storage or HTTP. Food/Media latency regresses; durable provenance has a real cost. The absolute increase remains interactive locally, and correctness/replayability is preferred to asynchronous writes. Nutrition's decrease is an observed local result, not a production speedup claim. Larger stores, multiple workers, remote providers and real Mongo require separate load testing.

A separate instrumented run attributed mean impression read/write elapsed time per request to Food 1.53/3.02 ms, Media 13.20/21.99 ms, and Nutrition 25.16/39.66 ms. Food issues one impression-batch write; Media and Nutrition issue two contextual-list writes, not duplicate records for one card. These are inclusive asynchronous timings (including warmups), not additive CPU profiles or the headline latency samples. The dominant growing-store cost is serialization/cloning and durable logging, not the eight-dimensional solve.

### Adaptive v1 Change Inventory

Adaptive Core v1 changed **27 existing production files**, two existing test files and this README, with **zero new production modules**. The implementation inventory records 10,916 -> 10,754 physical lines (**-162**) across the affected production files, excluding earlier application and research changes.

| Class | Existing files | Why necessary |
| --- | --- | --- |
| A: policy | `services/banditDecisionService.js` | Canonical features, linear algebra, ranking, versioned events and updates |
| A: policy | `services/recommendationScoringService.js` | Fixed contextual prior, legacy-only feedback prior, real score decomposition |
| A: policy | `services/feedbackLearningService.js`, `utils/feedbackSignals.js` | Immediate reward mapping, prospective updates, legacy separation |
| A: policy | `services/mlService.js` | Prevent new policy feedback also changing legacy weights |
| B: persistence | `models/dataStore.js`, `models/recommendationInteractionModel.js` | Atomic batch impression storage, lookup and idempotent feedback |
| B: persistence | `models/userModel.js`, `models/mongo/userDocument.js` | Per-user/per-domain state and revision-safe mutation |
| B: persistence | `models/userContentInteractionModel.js`, `models/mongo/recommendationInteractionDocument.js` | Idempotent Media records and retained event fields in Mongo |
| B: provenance | `services/feedbackStorageService.js` | Preserve original impression ID through Food feedback |
| C: integration | `controllers/foodController.js`, `controllers/contentController.js` | Existing endpoints load policy, finalize impressions and forward event IDs |
| C: integration | `services/contentRecommendationService.js` | Single policy path, no random/sequence/logistic second learner, deferred final logging |
| C: integration | `services/recommendationService.js`, `services/searchService.js` | Existing generic/search paths use policy state and canonical events |
| C: integration | `services/crossDomainMappingService.js`, `services/nutritionPlannerService.js` | Timestamped, user-bound provenance for existing context rules |
| C: boundary | `services/evaluationService.js` | Remove immediate-feedback-derived delayed reward proxy from active reporting |
| C: client | `pages/DashboardPage.jsx`, `pages/ResultsPage.jsx`, `pages/ExerciseTrackerPage.jsx`, `components/FoodScanPanel.jsx` | Send the returned impression ID with feedback |
| C: client | `components/SearchResultCard.jsx`, `components/ContentRecommendationCard.jsx`, `utils/recommendationDisplay.js` | Read/format actual score traces in existing disclosures |
| D: tests | `backend/test/api.test.js`, `frontend/test/recommendationDisplay.test.js` | Integrity, persistence, HTTP lifecycle, trace rendering |
| E: documentation | `README.md` | Live/offline boundary, frozen schema, evidence and limitations |

Paths in the table are relative to `backend/src` or `frontend/src` unless prefixed otherwise.

Operational limits: JSON is a single-process local adapter, not a multi-worker transactional database. Policy mutation and feedback-history persistence are separate awaited writes; deterministic receipts make retries idempotent, but a failure between them needs retry to reconcile history. Existing interaction retention caps at 24,000 records; expired impressions are rejected rather than reconstructed. Receipt maps grow with explicit feedback. Full-history rebuild/migration and delayed rewards are outside v1. Legacy application evaluation panels are not calibrated v1 accuracy measurements. Exploration is deterministic uncertainty ranking, not a randomized clinical/product trial.

## Reproducibility

Python/PyTorch research dependencies are listed in [research/requirements.txt](research/requirements.txt). Raw data belongs in the ignored `data/raw/` tree; processed inputs and checkpoints remain local/ignored. Frozen small result artifacts are under [`research/results/final_study/`](research/results/final_study/). Run research tests with `python -m unittest discover -s research -p 'test_*.py'`; run backend tests with `cd backend && npm test`; run frontend checks with `cd frontend && npm test`, `npm run lint`, and `npm run build`. The canonical final-study active path and historical-script boundaries are documented in [Research Code Organization](research/FINAL_STUDY.md#research-code-organization). Reproducing a full fit requires the matching Amazon source files and is not necessary to inspect the frozen results.

The reusable final-study component path is `amazon_data.records` / `multidomain_data.load_inputs` → `coverage_robustness.train_eligible` → `multidomain_data.prepare_multidomain` → `final_study.build_stream` → `training.sample_examples` / `training.run` → validation selection via `multidomain_experiment.select_ranking_checkpoint` → `final_study.evaluate` and paired analysis. `training.run` consumes an already prepared and registered dataset; it does not select a cohort or cutoff. There is no generic one-command runner for every historical protocol. This study is frozen, so do not invoke training to reproduce or update its final result artifacts; follow each artifact's saved provenance and the focused tests instead.

## Repository Structure

- `frontend/` — React application and interaction tests
- `backend/` — Express API, persistence, ranking, and API tests
- `research/` — offline datasets/protocol code, historical runners, focused tests, and final-study documentation
- `research/results/final_study/` — frozen protocols, result artifacts, derived tables, and figures
- `docs/` — application verification and project/portfolio notes
- `data/raw/` — local-only source datasets; ignored by Git

See [Project Summary](docs/PROJECT_SUMMARY.md) for concise resume, LinkedIn, and portfolio descriptions and an evidence-bounded engineering summary.

The [milestone manifest](docs/COMMIT_MANIFEST.md) records the reviewed application, documentation, and research paths and their hashes.

## Limitations

The Amazon benchmark is sparse under global calendar-time evaluation: expanded warm-item test coverage is Food 23.49%, Fitness 14.18%, and Media 26.93%. Media has a verified Top-10 retrieval floor in the expanded seed-42 evaluation. The architecture comparison on the expanded cohort has one training seed; user-level paired bootstrap intervals quantify within-fit uncertainty and do not replace training-seed replication. Product-category co-review is not equivalent to shared real-world interests. The live app's nutrition and fallback content are not clinical or provider-verified.

## Research References

The lineage has separate roles: **Impatient Bandits** motivates adaptive learning and exploration; **SyNCRec / Pacer and Runner** motivates cross-domain cooperation and negative-transfer questions; **TimeMCL** inspires multiple plausible outputs/diversity; **Microsoft Recommenders** is an evaluation/workflow reference; **CRSLab** is an interaction/feedback architecture reference; **NeuMF** is the offline learned-personalization baseline. Adaptive v1 does not faithfully reproduce Impatient Bandits, SyNCRec, or TimeMCL training. Its LinUCB adjustment, immediate explicit feedback and existing diversity selection are narrower engineering choices.

- He et al., [*Neural Collaborative Filtering*](https://arxiv.org/abs/1708.05031), WWW 2017.
- Kornblith et al., [*Similarity of Neural Network Representations Revisited*](https://arxiv.org/abs/1905.00414), ICML 2019.
- [*Pacer and Runner: Cooperative Learning Framework between Single- and Cross-Domain Sequential Recommendation*](https://arxiv.org/abs/2407.11245), SIGIR 2024. Used as motivation and design context; this project does not claim to reproduce SyNCRec.
- [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/), McAuley Lab.

## Run the Application

Use Node 22.12 or newer. In separate terminals:

```bash
cd backend && npm ci && npm start
cd frontend && npm ci && npm run dev
```

The default local URLs are `http://localhost:5001` and `http://localhost:5173`. Optional provider credentials and fallback behavior are described in [backend/.env.example](backend/.env.example) and [Restaurant Data Notes](docs/RESTAURANT_DATA.md). Never deploy demo credentials or a development JWT secret.
