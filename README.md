# recommendation-system-model

This is a local full-stack recommendation system built with a React frontend and a Node.js backend. It recommends food, fitness, and media options, stores user feedback, and uses that feedback to adjust future food recommendations.

The project is intentionally lightweight. It does not train a large ML model during runtime. Instead, it uses practical scoring, feedback history, fallback data, and simple cross-domain signals so the app can run reliably on a laptop.

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

## Research-Backed Components

The project includes small, practical versions of ideas from recommender-system research:

- Impatient Bandits: feedback signals adjust ranking through immediate and delayed reward scores.
- Cross-domain sequential recommendation: fitness activity can influence meal scoring, and food intake can influence fitness context.
- TimeMCL-style multiple outcomes: recommendation selection keeps a small diverse set instead of returning many near-duplicates.
- Microsoft Recommenders: the backend follows a candidate generation, scoring, ranking, and evaluation-style flow.
- CRSLab: user interactions are stored in a structured way and reused for feedback profiles.

These are simplified implementations for a Master's project demo, not full research reproductions.

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

## Known Limitations

- The adaptive logic is lightweight and heuristic-based.
- No heavy ML training pipeline is included.
- MongoDB is optional; local file storage is the easiest demo mode.
- Restaurant data uses fallback sample data unless a Google API key is configured.
- The backend has useful API tests, but the frontend does not yet have automated UI tests.

## Future Work

- Add real model evaluation dashboards using saved interaction data.
- Add frontend UI tests for the main demo flow.
- Improve cross-domain learning with more user history.
- Add optional MongoDB deployment notes.
- Add screenshot assets directly into the final report after the demo UI is captured.
