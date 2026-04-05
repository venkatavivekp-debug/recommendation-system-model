# ContextFit

**ContextFit**

**Subtitle:** _A context-aware, adaptive, explainable lifestyle intelligence system_

ContextFit is a production-style full-stack lifestyle intelligence platform centered on adaptive, explainable decision-making. It combines nutrition tracking, restaurant/recipe intelligence, food scan, behavior modeling, anomaly detection, and online-learning recommendations in one cohesive flow.

## Overview

ContextFit is optimized for one simple command-center experience:

1. Login
2. Review today’s nutrition and activity summary
3. Choose what to do next: **Eat Out**, **Eat In**, or **Scan Food (AI)**
4. Take real actions (order, navigate, cook, or share via email)
5. Track intake, exercise, and progress over time with calendar-based planning

## Core Features

- JWT auth with profile-driven personalization
- Dashboard-first guided flow:
  - today summary
  - decision block (Eat Out / Eat In / Scan Food)
  - dynamic recommendation results
  - concise AI insights
  - calendar/history
- Context-aware recommendation pipeline:
  1. feature vector construction
  2. logistic-regression scoring
  3. multi-objective optimization
  4. behavior context overlay
  5. anomaly checks
  6. final explainable ranking
- Online learning:
  - per-user weight updates after interactions
  - global fallback model for cold start
  - lightweight exploration for adaptive learning
- Reproducible synthetic ML dataset:
  - deterministic 30-day simulation for four behavioral archetypes
  - meals + macros + IoT-like activity + recommendation interactions
  - anomaly injection (calorie spikes, macro imbalance, low-activity/high-intake, behavior shifts)
  - evaluation-ready labels for ranking/classification metrics
- Behavior modeling:
  - meal-time preferences
  - weekday/weekend macro trends
  - delivery/pickup/eat-in tendencies
- Anomaly detection:
  - z-score + rolling statistics + IQR checks
  - intake/activity mismatch and acceptance-drop signals
- Multimodal food intelligence:
  - image/video food scan
  - nutrition + ingredient reasoning
  - restaurant or recipe fallback resolution
- IoT/wearable-aware inputs:
  - manual or synced steps/calories/activity level
  - signals fed into recommendation and anomaly layers

## What Was Simplified in Final Cleanup

- Removed chat system and all friend-system dependencies
- Removed friend-tied sharing paths
- Replaced sharing UX with a single **Share via Email** flow
- Reduced dashboard clutter by removing low-value model noise from user-facing sections
- Kept and strengthened the core ML recommendation pipeline

## Architecture

### Backend (`backend/src`)
- `routes/`
- `controllers/`
- `services/`
- `models/`
- `middleware/`
- `utils/`

Key ML services:
- `featureService.js`
- `mlModelService.js`
- `recommendationService.js`
- `behaviorModelService.js`
- `anomalyDetectionService.js`
- `optimizationService.js`
- `evaluationService.js`
- `iotService.js`

### Frontend (`frontend/src`)
- `pages/` (Dashboard, Profile, Search, Results, Route, Exercise, History, Community, Auth)
- `components/` (cards, forms, scan panel, calendar)
- `services/api/` (feature-scoped axios layer)
- `hooks/`, `context/`

## Tech Stack

- Backend: Node.js, Express, Mongoose
- Frontend: React, Vite, React Router, Axios
- Auth/Security: JWT, bcrypt
- Data/ML: feature normalization, logistic regression, online learning
- Integrations: Google Places/Directions, Uber Eats / DoorDash / Maps links, wearable/manual IoT signals

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend env (example):

```env
PORT=5001
NODE_ENV=development
GOOGLE_API_KEY=your_google_api_key
MONGODB_URI=your_mongodb_uri
MONGODB_DB_NAME=food_fitness_app
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=2h
ENABLE_GOOGLE_FALLBACK_MOCKS=true
CORS_ORIGIN=http://localhost:5173
DATASTORE_PATH=runtime-data/store.json

# Optional SMTP for real email delivery
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

If SMTP is not configured, email sharing runs in safe mock mode and logs delivery events.

### Backend Runtime Data + Nodemon Stability

- When `MONGODB_URI` is empty, ContextFit runs in `file-fallback` mode.
- Default backend port is `5001`.
- In dev mode, startup runs `kill-port` for `5000`, `5001`, and `5002` before nodemon boots.
- If the configured port is still busy, backend startup auto-tries the next port (`5001 -> 5002 -> 5003`).
- File-fallback data is written to `backend/runtime-data/store.json` (outside `src/`).
- `nodemon` is configured via `backend/nodemon.json` to watch source code only and ignore runtime data/log outputs.
- This prevents restart loops from datastore writes.
- Health check: `GET /api/health` returns `{ "status": "ok", "mode": "mongo" | "file-fallback" }`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend env:

```env
VITE_API_BASE_URL=http://localhost:5001
```

### Seed Demo Data

```bash
cd backend
npm run seed
```

Demo Accounts (auto-seeded):
- Admin: `pangulurivenkatavivek@gmail.com` / `App@2026`
- Demo User 1: `fitness_user@contextfit.com` / `fitness123`
- Demo User 2: `weekend_spike_user@contextfit.com` / `weekend123`

Additional seeded accounts:
- `admin@bfit.com` / `admin123`
- `user@bfit.com` / `user123`
- `irregular_user@contextfit.com` / `irregular123`
- `sedentary_user@contextfit.com` / `sedentary123`

Seeded users include realistic meal, activity, recommendation, and content interaction history for demoing personalization, behavior insights, and anomaly checks.

## API Overview

Base path: `/api`

- Health: `GET /health`
- Auth: `/auth/*`
- Profile: `GET /profile/me`, `PUT /profile/me`
- Search/Route: `POST /search`, `POST /routes`
- Food: `POST /food/lookup`, `POST /food/detect`, `POST /food/resolve`
- Meals: `POST /meals`, `PUT /meals/:id`, `DELETE /meals/:id`, `GET /meals/today`, `GET /meals/history`
- Nutrition: `GET /nutrition/remaining`
- Exercises: `POST /exercise`, `PUT /exercise/:id`, `DELETE /exercise/:id`, `GET /exercise/today`, `GET /exercise/history`
- Dashboard: `GET /dashboard`
- Calendar: `GET /calendar/history`, `GET /calendar/day/:date`, `POST /calendar/plan`, `GET /calendar/upcoming`
- Community: `GET /community/recipes`, `POST /community/recipes`, `POST /community/recipes/:recipeId/reviews`, `POST /community/recipes/:recipeId/save`
- Content recs: `GET /content/recommendations`, `POST /content/feedback`
- Email share: `POST /share/email`
- IoT context: `GET /iot/context`, `PUT /iot/preferences`, `POST /iot/sync`
- Admin model analysis: `GET /admin/model-analysis`

## Demo Flow

1. Login as `user@bfit.com`
2. Update nutrition goals in Profile
3. On Dashboard, choose Eat Out / Eat In / Scan Food
4. Add meals and optionally log exercise
5. Click calendar dates for historical or planned day details
6. Share a day snapshot or recipe via email

## Notes on Data Integrity

- Meals and exercise entries are editable for **today only**
- Past entries are locked to preserve timeline integrity
- Allergy checks are enforced in recommendation and meal suggestion flows

## Research Alignment

ContextFit demonstrates:
- feature engineering with contextual and temporal signals
- supervised logistic modeling + online adaptation
- behavior modeling with recency-weighted analytics
- anomaly detection with interpretable statistical methods
- multi-objective optimization for decision support
- explainable recommendation outputs with confidence and top factors
