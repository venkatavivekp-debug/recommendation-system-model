# BFIT

**Be Fit**

**Subtitle:** _Your Intelligent Nutrition, Cooking & Fitness Companion_

BFIT is a production-style full-stack lifestyle intelligence platform. It combines nutrition tracking, restaurant and recipe decision support, AI food scan, and context-aware entertainment suggestions in one guided daily flow.

## Overview

BFIT is optimized for one simple command-center experience:

1. Login
2. Review today’s nutrition and activity summary
3. Choose what to do next: **Eat Out**, **Eat In**, or **Scan Food (AI)**
4. Take real actions (order, navigate, cook, or share via email)
5. Track intake, exercise, and progress over time with calendar-based planning

## Core Features

- JWT auth: register, login/logout, forgot/reset password
- Profile with editable nutrition goals, preferences, and allergies
- Dashboard with:
  - today summary (consumed, burned, net, macros, workouts, steps)
  - meal decision block (Eat Out / Eat In / Scan Food)
  - concise AI insight (best recommendation, reason, confidence)
  - calendar + selected day details
- Restaurant discovery with Athens, GA location-aware ranking
- Route-aware metrics per restaurant: distance, walk ETA, steps, estimated walk calories
- Real-world action links:
  - Uber Eats
  - DoorDash
  - Google Maps directions
  - Website / Google listing
- Food lookup and meal logging with allergy-safe warnings
- AI food scan (image/video): detect food, resolve to restaurant or recipe fallback, reset/start new scan
- Exercise tracking with MET-based calorie estimation and today-only edit enforcement
- Calendar planning, cheat-day planning, and safe balancing suggestions
- Community recipes with ratings/reviews and optional email sharing
- Unified recommendation pipeline across food, restaurants, recipes, and content:
  - features → ML score → heuristic fallback → final ranking
- Logistic regression + online learning with explainable factors
- Context-aware content recommendations (movie/show while eating, music for walking/workout)
- Simple email sharing endpoint for diet day snapshots, recipes, and plans

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

Key services:
- `recommendationService.js` (unified ranking pipeline)
- `mlModelService.js` (logistic model + online updates)
- `featureService.js` (feature vectors + normalization)
- `contentRecommendationService.js` (contextual content suggestions)
- `emailService.js` + `shareService.js` (email sharing)

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
- Integrations: Google Places/Directions, Uber Eats / DoorDash / Maps links

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Backend env (example):

```env
PORT=5050
NODE_ENV=development
GOOGLE_API_KEY=your_google_api_key
MONGODB_URI=your_mongodb_uri
MONGODB_DB_NAME=food_fitness_app
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=2h
ENABLE_GOOGLE_FALLBACK_MOCKS=true

# Optional SMTP for real email delivery
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

If SMTP is not configured, email sharing runs in safe mock mode and logs delivery events.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend env:

```env
VITE_API_BASE_URL=http://localhost:5050/api
```

### Seed Demo Data

```bash
cd backend
npm run seed
```

Demo accounts:
- `admin@bfit.com` / `admin123`
- `user@bfit.com` / `user123`

## API Overview

Base path: `/api`

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

## Future Improvements

- Optional deep integration with external streaming/music APIs
- Enhanced vendor/menu ingestion for richer nutrition precision
- Admin-facing model diagnostics UI
