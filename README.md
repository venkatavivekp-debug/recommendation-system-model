# recommendation-system-model

This is a local full-stack recommendation system built with a React frontend and a Node.js backend. It recommends food, fitness, and media options, stores user feedback, and uses that feedback to adjust future food recommendations.

The project is intentionally lightweight. It does not include a neural recommender or a full research-model training pipeline. Instead, it uses practical scoring, feedback history, fallback data, and simple cross-domain signals so the app can run reliably on a laptop.

## System Nature

This system uses lightweight adaptive logic rather than a fully trained machine learning recommender. The main goal is to keep the behavior explainable, stable, and easy to demo while still showing how feedback can influence future recommendations.

The backend includes a few small scoring and prediction helpers, but they should be understood as practical heuristics for this project. They are not full implementations of recent research papers.

## Current Status

- React frontend is working.
- Node.js backend is working.
- Dashboard, search, food recommendations, content recommendations, and feedback APIs are connected.
- Food recommendations use rule-based scoring with adaptive feedback signals.
- Cross-domain logic is implemented in a simple form, mainly fitness-to-food and food-to-fitness signals.
- Local file storage is used when MongoDB is not configured.

## Main Features

- Dashboard summary for calories, meals, activity, recommendations, and media suggestions
- Food and restaurant search with safe fallback data
- Food recommendation endpoint with ranked results
- Feedback actions such as selected, save, helpful, ignored, and not interested
- Adaptive scoring based on recent feedback and stored interaction history
- Lightweight cross-domain mapping between food and fitness
- Media recommendations for eating, walking, and workout contexts
- Safe error responses for invalid input and malformed JSON

## Project Structure

- `backend/src/controllers`: request handlers for each API area
- `backend/src/services`: application logic for recommendations, search, dashboard data, feedback, and content
- `backend/src/models`: MongoDB/file datastore access
- `backend/src/routes`: Express route definitions
- `backend/src/middleware`: auth, validation, logging, upload, and error handling
- `backend/src/utils`: shared helpers
- `backend/src/scripts`: small project scripts, including adaptive validation generation
- `backend/src/validation`: final report validation logic
- `frontend`: React app, pages, components, hooks, and API clients
- `results`: generated validation outputs used for report support

## Research Integration (Practical Adaptation)

The project uses recent recommender-system research as guidance, but it does not reproduce those systems. The ideas were simplified into small backend services that fit the current project size:

- Impatient Bandits: used as inspiration for feedback-based reranking with immediate and delayed reward signals.
- Cross-domain sequential recommendation: simplified into rule-based fitness-to-food and food-to-fitness influence.
- TimeMCL: represented only as a practical multi-output idea, where the system returns a small diverse set of recommendations.
- Microsoft Recommenders: used as pipeline inspiration for candidate generation, scoring, ranking, and validation.
- CRSLab: used as inspiration for storing interactions and building feedback profiles.

These are lightweight adaptations for a Master's project demo. They are heuristic and explainable, not full research reproductions.

## Run The Project

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Default URLs:

- Backend: `http://localhost:5001`
- Frontend: `http://localhost:5173`

## Demo Login

Use this account for a quick demo:

- `user@bfit.com`
- `user123`

Other seeded accounts may also be available in local fallback mode:

- `admin@bfit.com` / `admin123`
- `pangulurivenkatavivek@gmail.com` / `App@2026`

## Backend Settings

Use `backend/.env.example` as a starting point if needed.

Useful local values:

- `PORT=5001`
- `FALLBACK_MODE=false`
- `MONGODB_URI=` can stay empty to use local file storage
- `GOOGLE_API_KEY=` is optional; restaurant search falls back to local sample data

## Tests And Validation

Backend syntax check:

```bash
cd backend
find src test -name "*.js" -print0 | xargs -0 -n1 node --check
```

Backend API tests:

```bash
cd backend
npm test
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

The backend tests cover dashboard, search, food recommendations, food feedback, invalid input, and malformed JSON.

## Adaptive Validation

The repo includes a small repeatable experiment for the final report. It creates three validation users, simulates feedback through the existing food feedback service, and writes before/after recommendation results.

```bash
cd backend
npm run validate:adaptive
```

Generated files:

- `results/adaptive_results.json`
- `results/cross_domain_results.json`
- `results/multi_output_results.json`
- `results/adaptive_summary.txt`

Admin users can also read the latest summary from `GET /api/admin/adaptive-summary`. This is a validation aid, not a separate recommendation model.

## Known Limitations

- The adaptive logic is lightweight and heuristic-based.
- No neural recommender or heavy ML training pipeline is included.
- The research components are practical adaptations, not complete implementations of the cited methods.
- MongoDB is optional; local file storage is the easiest demo mode.
- Restaurant data uses fallback sample data unless a Google API key is configured.
- The backend has useful API tests, but the frontend does not yet have automated UI tests.

## Future Work

- Add real model evaluation dashboards using saved interaction data.
- Add frontend UI tests for the main demo flow.
- Improve cross-domain learning with more user history.
- Add optional MongoDB deployment notes.
- Add screenshot assets directly into the final report after the demo UI is captured.
