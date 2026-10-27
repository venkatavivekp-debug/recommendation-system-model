# ContextFit Verification

## Final System State

ContextFit: Context-Aware Adaptive Recommendation with Transferability-Aware Cross-Domain Learning has two separate components. The live React/Node application provides Food, Fitness and Media context, explicit feedback, per-user/per-target-domain LinUCB, diversity selection and explanations. The frozen offline NeuMF/Amazon study supplies quantitative evidence about preference transfer; its models do not serve the live app.

The observations below are the retained results of the completed Adaptive Core v1 browser verification. They are system-behavior observations, not offline recommendation-accuracy measurements or guarantees about every user's ranking. The numerical examples are transcribed from that verification record; they are not new measurements from the interface captures. Private session payloads, tokens and runtime datastores are not committed. Repeatable integrity checks are in `backend/test/api.test.js` and `frontend/test/recommendationDisplay.test.js`.

## Adaptive Core v1 Verification

### Food Feedback

| Turkey Sandwich | Before Select | After Select |
| --- | ---: | ---: |
| Rank | 2 | 2 |
| Final score | 0.69218 | 0.75927 |
| Bandit exploitation | 0 | 0.29163 |
| Food policy update count/revision | 0 | 1 |

Select supplied reward +1 and used the **original stored impression feature vector**. Fitness and Media learned policy state remained unchanged. The increased exploitation and total score show a positive adaptive effect without forcing the candidate to rank 1. Other scoring components still matter; this is not a claim that every component besides exploitation stayed fixed.

For **Last Resort Grill**, Not Interested supplied reward -1. The item was suppressed on a fresh recommendation request and remained suppressed after logout/login. The update used the original stored impression vector and advanced Food policy state once, leaving Fitness and Media unchanged. After both Food interactions, Food update count/revision was **2**. Replaying the same feedback receipt did not apply a second policy update.

### Policy Specification

The implementation is `backend/src/services/banditDecisionService.js`; reward mapping is `backend/src/utils/feedbackSignals.js`. Policy version is `contextfit-bandit-v1`, schema version is `contextfit-features-v1`, dimension is **8**, ridge **lambda = 1**, and exploration coefficient **alpha = 0.08**.

Feature order: `bias`, `baseRelevance`, `preferenceMatch`, `feedbackAffinity`, `sessionIntentFit`, `attributeFit`, `contextFit`, `crossDomainFit`. The bias is 1. Other values are clipped to [0,1], missing/nonfinite values become 0, and each vector component is divided by sqrt(8). Sources and domain-specific fallbacks are documented in [Frozen Feature Schema](../README.md#frozen-feature-schema).

```text
A = I; b = 0
theta = solve(A, b)
exploitation = theta^T x
exploration = min(0.08, 0.08 * sqrt(x^T solve(A, x)))
finalScore = baseScore + 0.25 * exploitation + exploration

A += x x^T
b += reward * x
```

Explicit rewards are Select +1, Save +1, Helpful +0.5 and Not Interested -1. Silence, views, shown impressions and ignored/unknown actions do not update this policy. No delayed reward is inferred. Cholesky solves avoid persisting an inverse; invalid state fails closed. The server binds feedback to the authenticated user, domain, candidate and stored versioned impression, not a client-supplied feature vector.

## User and Domain Isolation

The second account had independent adaptive policies and impression IDs. The first account's suppression was not inherited: Last Resort Grill remained available to the second account. Fresh login preserved the first account's Food state and suppression.

Policy state is stored as `adaptivePolicies[targetDomain]` on each user, with its own matrix, reward vector, update count, revision and feedback receipts. Food feedback did not mutate Fitness or Media state; Media feedback did not mutate Food or Fitness state. There are no hidden shared adaptive embeddings or learned cross-domain policy parameters.

## Cross-Domain Context Verification

Workout/activity context changed Food **crossDomainFit from 0 to 0.36333**. Food features changed through explicit context, while Fitness learned policy state remained unchanged. Provenance retained `sourceDomain`, `sourceEvent`, `sourceTimestamp`, `targetDomain` and the applicability `reason`, alongside source context and derived values. This is the Transferability Guard: cross-domain information changes target-domain context features, not another domain's adaptive parameters.

Fitness/activity advisory guidance remains rule-based. The existing generic ranked Fitness candidate path uses LinUCB where applicable; there is no separate ranked endpoint added solely for symmetry. Fitness can supply explicit context to Food/Media without sharing its learned state.

## Session-State Verification

Temporary intent changed **sessionIntentFit from 0 to 1** and affected recommendation context. Persistent profile/taste state remained unchanged, and removing temporary workout/session context reset the temporary features. Long-term preferences, goals, retained affinities/dislikes and learned policy state persist separately from transient intent and recent meal/activity context. Setting intent alone does not create a reward update.

## Media Adaptation Verification

For **Back In Black**, Helpful supplied **+0.5** reward. Media policy updates advanced **0 to 1**, using the original stored impression feature vector. A fresh request had exploitation **0.19143**. Food and Fitness adaptive state remained unchanged. Impression IDs reached the client and were referenced by feedback. No arbitrary rank jump was required.

## Explanation Integrity

Food and Media explanations were checked against actual `scoreTrace` and context. Relevant fields include `baseScore`, `feedbackContribution`, `banditExploitation`, `banditExploration`, `banditScore`, `finalScore`, and contextual features `contextFit` and `crossDomainFit`. The UI need not display every internal value; displayed reasons must be supported by the trace/context. Fit scores are not calibrated probabilities.

## Diversity and Exploration

Exploration is an uncertainty-driven UCB bonus, not downstream random swapping. Existing deterministic tests show that higher uncertainty can elevate a candidate with lower exploitation; no separate browser example is claimed. Diversity and near-duplicate selection follow adaptive ranking. Distinct Food/Media cards remained present; `diversityAdjustment` can remain numerically zero because diversity is enforced through selection rather than an extra score.

## Interface Quality Verification

Login, dashboard, Food results and expanded scoring details, feedback controls, Workout, Media, History and Profile were inspected in Chromium at 1440 x 1000. Food scoring details and Workout were also inspected at 390 x 844, without horizontal overflow. No blocking clipping, overlapping controls, unreadable values, raw JSON or broken artwork layout was found. Missing Media artwork uses an explicit fallback; local Food results identify their demo catalog and estimated nutrition. No application source change was required.

This interface check submitted no feedback, activity or profile changes. One expired-session Food request returned 401 and redirected to login with an explicit session-expired message. Normal demo login restored access; subsequent inspected requests completed without HTTP errors or uncaught browser exceptions. This expected authentication response is separate from the earlier adaptive verification's clean authenticated request record.

The captures show the existing demo state, not a replay of the Turkey Sandwich or Back In Black numerical examples:

| Capture | Evidence |
| --- | --- |
| [Dashboard](screenshots/contextfit-dashboard.png) | Current activity context and distinct Food/Media recommendations. |
| [Food ranking](screenshots/contextfit-food-ranking.png) | Ranked local-catalog results, estimates and visible fallback labeling. |
| [Food explanation and feedback](screenshots/contextfit-food-feedback.png) | Expanded score components and explicit feedback controls; no action submitted. |
| [Activity context](screenshots/contextfit-cross-domain-context.png) | Existing workout/session context and rule-based activity controls. |
| [Media ranking](screenshots/contextfit-media-ranking.png) | Contextual Media cards, expanded scoring details and feedback controls. |

The activity and dashboard captures show the context source and its target-domain use; the earlier controlled feature change is recorded in Cross-Domain Context Verification. Screenshots alone do not prove parameter isolation or recommendation accuracy.

## Performance Measurements

Recorded localhost measurements used local providers, the same machine and request shapes, three warmups and 30 measured requests per endpoint. These are engineering measurements, not production latency claims. The compact values below retain the recorded two-decimal summaries; the [README latency table](../README.md#verification-and-local-latency) retains three-decimal measurements.

| Request | Before median / P95 (ms) | After median / P95 (ms) |
| --- | ---: | ---: |
| Food | 5.14 / 7.65 | 10.21 / 12.68 |
| Media | 35.57 / 49.93 | 49.26 / 66.40 |
| Nutrition/Fitness context | 93.54 / 123.89 | 84.34 / 92.37 |

Policy-only calculation for 120 candidates was **0.380 ms median / 0.493 ms P95**, with 500 measured calls after 30 warmups. Durable impression provenance, serialization and storage contribute more to added request cost than the eight-dimensional solve. Food/Media latency increased; Nutrition's observed decrease is not evidence of a production speedup. No latency experiment was repeated for documentation changes.

## Automated Validation

| Check | Final validated result |
| --- | --- |
| Backend tests | 51/51 passed |
| Frontend tests | 5/5 passed |
| Frontend lint | Passed |
| Frontend production build | Passed with Node 22.23.2 |
| Research tests | 113/113 passed |
| Backend JavaScript syntax | 158 files passed |
| Research Python syntax | 46 files passed |
| Protected research set | 664 files unchanged during documentation/interface verification |

Research tests use existing synthetic fixtures; they do not retrain the frozen Amazon experiments. Commands are in [Reproducibility](../README.md#reproducibility). The protected-set comparison includes the separately approved layout-only transferability SVG correction as its baseline; source CSV bytes and scientific values were not changed by that correction.

## Known Limitations

The completed adaptive walkthrough found no uncaught frontend errors, malformed responses, repeated feedback submissions, failed expected API calls or duplicate impression-write storm. Its transient dashboard timeout fallback after restart recovered on reload. During the separate interface check, a reload remained on the explicitly labeled fallback even though the dashboard API returned normal data; navigating through Workout and back restored the live dashboard. Reload does not guarantee automatic recovery. This is a runtime availability limitation, not a research result, and timeout behavior was not changed. Local JSON-store and unavailable-provider fallback warnings were expected and were not hidden.

These checks do not establish live recommendation accuracy, production availability or causal benefit. The JSON adapter is single-process; Mongo concurrency was not exercised against a live deployment. Provider failures can return labeled local catalogs, nutrition/artwork can be illustrative, and external playback/checkout are outside the verification. Demo authentication and in-memory rate limits are not a hardened production baseline.

The offline conclusion is bounded: the tested Amazon Food/Fitness/Media product-preference domains show weak temporal/representation relatedness, and the tested sharing approaches did not show a reliable ranking advantage under those protocols. Expanded results use one training seed; historical V2 uses three under a different cohort/protocol. Paired-user intervals do not measure training-seed uncertainty. Expanded Media has a verified zero Top-10 result. See [Final Study](../research/FINAL_STUDY.md) for exact values, limitations and research references.

## Earlier System Verification

The following observations predate Adaptive Core v1. Their test counts, ranking adjustments and runtime versions are superseded by the final sections above. They remain as evidence of the earlier system, not the current policy specification. The backend used a temporary copy of the file datastore; the normal local datastore and frozen research runs were unchanged.

### Run And Test Results

- Backend: `npm start` in `backend`, with `DATASTORE_PATH` pointing to the temporary copy; `http://localhost:5001`.
- Frontend: `npm run dev -- --host 127.0.0.1` in `frontend`; `http://127.0.0.1:5173`.
- Demo account: `user@bfit.com` / `user123`.
- Backend `npm test`: 17/17 passed, including search feedback, UTC day boundaries and positive save/helpful training labels.
- Backend JavaScript syntax checks: passed.
- Research unittest discovery: 21/21 passed. These use temporary synthetic fixtures; the MovieLens experiments were not rerun.
- Research Python compile checks: passed.
- Frontend `npm run lint` and `npm run build`: passed.

### Browser Walkthrough

Login, dashboard, food search, results, nutrition, explanations, feedback controls, exercise, media, history and profile loaded successfully. Food feedback returned 201; saving a media suggestion returned 200. The final fresh browser session showed no console errors, failed API requests, CORS failures or React warnings. Vite debug messages and the React DevTools suggestion were informational.

The dashboard showed 560 kcal consumed, 137.1 kcal burned, 422.9 net kcal and two workouts. Selected-day details agreed, with whole-number rounding. Daily totals and calendar keys now consistently use UTC. Initial dashboard loading no longer briefly displays fallback activity as real data. Only the top recommendation carries the Best Choice label.

### Feedback Before And After

The same rice search was requested before and after selecting/saving Your Pie and marking Taqueria Tsunami Not Interested through the existing controls.

| Item | Rank before | Rank after | Item affinity before | Item affinity after | Reranking score before | Reranking score after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Your Pie | 2 | 1 | 0.5378 | 0.9026 | 0.3991 | 0.4559 |
| Taqueria Tsunami | 3 | 8 | 0.5378 | 0.4761 | 0.3981 | 0.4072 |

These were actual responses, not manually adjusted rankings. Displayed match percentages did not change. Taqueria's absolute reranking score increased slightly because shared feedback signals also changed; its item affinity and relative rank fell. This is evidence of feedback-sensitive reranking, not proof that predictive accuracy improved.

Request a new search to see updated ranking. Reloading Results alone restores its saved search snapshot. Shared food names and cuisines can transfer feedback across candidates, so the system is not learning perfectly isolated item preferences.

### Cross-Domain Checks

- Workout to food: after recording strength activity, food context changed from `daily` to `post_workout`, with high-protein/recovery guidance. Context confidence changed from 0.5 to 0.86 and calorie flexibility from 0 to 220 in this example.
- Food to fitness: the remaining-nutrition response included a 20-minute light walk suggestion tied to food context. This verifies the existing mapping, not every possible nutrition branch.
- Eating context returned shows including Brooklyn Nine-Nine, Modern Family and Ted Lasso.
- Walking and workout contexts returned music suggestions. Media saving worked; external playback was not tested.

These are application rules and contextual mappings, not neural SyNCRec learning. The UI's Model: ML label refers to the application scoring path, not offline PyTorch NCF inference.

### Safety Checks And Limits

Health and the admin adaptive summary returned 200. Invalid search and incomplete feedback returned safe 400 responses; malformed JSON returned 400 with `INVALID_JSON`. Security headers were present, and backend logs included ISO timestamps, request IDs, status and duration. The backend tests verified rate limiting. No intentional load test was run.

MongoDB and Google credentials were absent, so file storage and curated restaurant fallbacks were expected. The installed Node 20.12.2 produced a Vite version warning, although the build and dev server worked. Use Node 22.12+ for this setup. Development Strict Mode can repeat read requests; successful duplicate reads are not API failures.

Fallback images/nutrition are sample estimates. Match percentages are not calibrated probabilities. Demo authentication, in-memory rate limits and single-process JSON storage are not a production deployment baseline. This pass did not test public deployment, external checkout/playback or every possible user input.

### Earlier Screenshots

- `screenshots/01-dashboard.png`: current meal/activity totals and recommendation context.
- `screenshots/02-food-results.png`: food ranking and nutrition before the feedback example.
- `screenshots/03-explainable-ranking.png`: scoring explanation and feedback controls after feedback.
- `screenshots/05-cross-domain.png`: eating and walking media suggestions.

The captures show different points in the walkthrough, not a controlled predictive evaluation. Exact adaptive changes are recorded in the table above. Duplicate screenshots were left out.
