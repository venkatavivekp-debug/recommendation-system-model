# Calorie Compass: Intelligent Diet Planning Platform

Calorie Compass is a production-grade Food + Fitness application that now acts as an intelligent daily nutrition assistant.

It combines:
- nearby food discovery
- macro-aware recommendations
- daily meal tracking
- calorie burn tracking
- remaining nutrition planning
- real-world actions (order, navigate, view, grocery buy links)

## What Changed In This Final Upgrade

## Product Direction
- removed internal payment workflow from user-facing app flow
- replaced with external real-world actions:
  - Uber Eats ordering links
  - DoorDash ordering links
  - Google Maps directions
  - restaurant view/search links

## New Core Capabilities
- advanced nutrition goals in profile:
  - daily calories, protein, carbs, fats, fiber
  - preferred diet (`veg`, `non-veg`, `vegan`)
  - preferred cuisine
  - fitness goal (`lose-weight`, `maintain`, `gain-muscle`)
- daily meal logging module
- remaining nutrition engine
- intelligent suggestions for:
  - nearby restaurant meals
  - raw food macro completion
  - grocery completion (Walmart/Target links with price/rating estimates)
- dashboard now shows remaining macros and recommended remaining-day plan

## Architecture

## Backend (`backend/src`)
- `routes/`: modular endpoint groups (`auth`, `profile`, `search`, `routes`, `activities`, `dashboard`, `meals`, `nutrition`)
- `controllers/`: request handlers
- `services/`: business logic, recommendation and nutrition engines
- `models/`: persistence layer with Mongo + file fallback
- `middleware/`: auth, validation, request logging, centralized error handling
- `utils/`: crypto, token, geo, response, logger helpers

## Frontend (`frontend/src`)
- `pages/`: login, register, search, results, route summary, profile, dashboard, history
- `components/`: reusable UI cards/charts/form utilities
- `services/api/`: axios API layer
- `context/` + `hooks/`: auth state and reusable logic

## Tech Stack
- Node.js, Express, Mongoose
- React, Vite, React Router, Axios
- bcrypt password hashing, JWT auth, AES card encryption utilities
- Google Places + Directions integration (with fallback mocks for demos)

## Setup

## 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Backend environment:

```env
PORT=5050
NODE_ENV=development
GOOGLE_API_KEY=your_google_api_key
MONGODB_URI=your_mongodb_uri
MONGODB_DB_NAME=food_fitness_app
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=2h
CARD_ENCRYPTION_SECRET=your_card_secret
RESET_TOKEN_EXPIRES_MINUTES=30
ENABLE_GOOGLE_FALLBACK_MOCKS=true
```

Notes:
- If `MONGODB_URI` is not set, app uses local file datastore fallback.
- If Google APIs are unavailable, fallback mock mode keeps demo flow functional.

## 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend environment:

```env
VITE_API_BASE_URL=http://localhost:5050/api
```

## 3. Seed Demo Data

```bash
cd backend
npm run seed
```

Demo accounts:
- `admin@foodfitness.local` / `Admin123!`
- `priya.verified@foodfitness.local` / `Demo123!`
- `marcus.favorite@foodfitness.local` / `Demo123!`

## API Overview

Base URL: `/api`

### Auth
- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`

### Profile
- `GET /profile/me`
- `PUT /profile/me`

### Search + Route + Activity
- `POST /search`
- `POST /routes`
- `GET /activities`
- `POST /activities`

### Meal Tracking
- `POST /meals`
- `GET /meals/today`
- `GET /meals/history`

### Nutrition Engine
- `GET /nutrition/remaining`
  - computes consumed vs goals
  - returns remaining calories/macros/fiber
  - includes recommended remaining-day suggestions

### Dashboard
- `GET /dashboard`
  - today summary
  - remaining metrics
  - trend
  - recommendation bundles

## Demo Flow

1. Register and verify account.
2. Login and open Profile.
3. Configure nutrition goals and preferences.
4. Search for food nearby.
5. In results, use:
   - order links (Uber Eats / DoorDash)
   - maps/restaurant view links
   - `Add to Meal`
6. Select a result and calculate route burn.
7. Open Dashboard to see:
   - consumed vs remaining
   - macro gaps
   - recommended foods/grocery options
8. Open History for meal + activity timelines.

## Quality Commands

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend syntax:

```bash
cd backend
find src -name '*.js' -print0 | xargs -0 -n1 node --check
```

## Future Improvements
- connect live grocery/catalog APIs for real-time pricing
- richer food-nutrition API integration (brand-level nutrition)
- personalized recommendation feedback loop
- CI + automated integration tests
