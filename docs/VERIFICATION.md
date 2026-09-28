# Final Application Verification

Checked on September 28, 2026. The backend used a temporary copy of the file datastore. The normal local datastore and frozen research runs were not changed by the walkthrough.

## Run And Test Results

- Backend: `npm start` in `backend`, with `DATASTORE_PATH` pointing to the temporary copy; `http://localhost:5001`.
- Frontend: `npm run dev -- --host 127.0.0.1` in `frontend`; `http://127.0.0.1:5173`.
- Demo account: `user@bfit.com` / `user123`.
- Backend `npm test`: 17/17 passed, including search feedback, UTC day boundaries and positive save/helpful training labels.
- Backend JavaScript syntax checks: passed.
- Research unittest discovery: 21/21 passed. These use temporary synthetic fixtures; the MovieLens experiments were not rerun.
- Research Python compile checks: passed.
- Frontend `npm run lint` and `npm run build`: passed.

## Browser Walkthrough

Login, dashboard, food search, results, nutrition, explanations, feedback controls, exercise, media, history and profile loaded successfully. Food feedback returned 201; saving a media suggestion returned 200. The final fresh browser session showed no console errors, failed API requests, CORS failures or React warnings. Vite debug messages and the React DevTools suggestion were informational.

The dashboard showed 560 kcal consumed, 137.1 kcal burned, 422.9 net kcal and two workouts. Selected-day details agreed, with whole-number rounding. Daily totals and calendar keys now consistently use UTC. Initial dashboard loading no longer briefly displays fallback activity as real data. Only the top recommendation carries the Best Choice label.

## Feedback Before And After

The same rice search was requested before and after selecting/saving Your Pie and marking Taqueria Tsunami Not Interested through the existing controls.

| Item | Rank before | Rank after | Item affinity before | Item affinity after | Reranking score before | Reranking score after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Your Pie | 2 | 1 | 0.5378 | 0.9026 | 0.3991 | 0.4559 |
| Taqueria Tsunami | 3 | 8 | 0.5378 | 0.4761 | 0.3981 | 0.4072 |

These were actual responses, not manually adjusted rankings. Displayed match percentages did not change. Taqueria's absolute reranking score increased slightly because shared feedback signals also changed; its item affinity and relative rank fell. This is evidence of feedback-sensitive reranking, not proof that predictive accuracy improved.

Request a new search to see updated ranking. Reloading Results alone restores its saved search snapshot. Shared food names and cuisines can transfer feedback across candidates, so the system is not learning perfectly isolated item preferences.

## Cross-Domain Checks

- Workout to food: after recording strength activity, food context changed from `daily` to `post_workout`, with high-protein/recovery guidance. Context confidence changed from 0.5 to 0.86 and calorie flexibility from 0 to 220 in this example.
- Food to fitness: the remaining-nutrition response included a 20-minute light walk suggestion tied to food context. This verifies the existing mapping, not every possible nutrition branch.
- Eating context returned shows including Brooklyn Nine-Nine, Modern Family and Ted Lasso.
- Walking and workout contexts returned music suggestions. Media saving worked; external playback was not tested.

These are application rules and contextual mappings, not neural SyNCRec learning. The UI's Model: ML label refers to the application scoring path, not offline PyTorch NCF inference.

## Safety Checks And Limits

Health and the admin adaptive summary returned 200. Invalid search and incomplete feedback returned safe 400 responses; malformed JSON returned 400 with `INVALID_JSON`. Security headers were present, and backend logs included ISO timestamps, request IDs, status and duration. The backend tests verified rate limiting. No intentional load test was run.

MongoDB and Google credentials were absent, so file storage and curated restaurant fallbacks were expected. The installed Node 20.12.2 produced a Vite version warning, although the build and dev server worked. Use Node 22.12+ for this setup. Development Strict Mode can repeat read requests; successful duplicate reads are not API failures.

Fallback images/nutrition are sample estimates. Match percentages are not calibrated probabilities. Demo authentication, in-memory rate limits and single-process JSON storage are not a production deployment baseline. This pass did not test public deployment, external checkout/playback or every possible user input.

## Screenshots

- `screenshots/01-dashboard.png`: current meal/activity totals and recommendation context.
- `screenshots/02-food-results.png`: food ranking and nutrition before the feedback example.
- `screenshots/03-explainable-ranking.png`: scoring explanation and feedback controls after feedback.
- `screenshots/05-cross-domain.png`: eating and walking media suggestions.

The captures show different points in the walkthrough, not a controlled predictive evaluation. Exact adaptive changes are recorded in the table above. Duplicate screenshots were left out.
