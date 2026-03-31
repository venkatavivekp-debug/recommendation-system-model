# Calorie Compass: Intelligent Food + Fitness Platform

Production-style full-stack capstone project that combines food discovery, nutrition intelligence, route planning, and activity analytics.

## Overview

Calorie Compass helps users:
- search nearby restaurants by food keyword and radius
- view nutrition estimates and recommendation explanations
- plan walking/running/driving routes to selected restaurants
- compare calories consumed vs calories burned
- manage profile goals, preferences, favorites, and payment cards
- track historical sessions and dashboard trends

The project is designed with clean backend/frontend separation, strong validation, secure data handling, and modular architecture.

## Final Feature Set

### Authentication + Account
- registration with `INACTIVE` default status
- email verification flow (mock email token in development)
- JWT login/logout
- forgot password + token reset
- change password with current password validation

### Profile + Preferences
- immutable email field
- single address field
- preferences:
  - `dailyCalorieGoal`
  - `preferredDiet`
  - `macroPreference`
  - `preferredCuisine`
  - `fitnessGoal`
- favorites:
  - general favorites
  - favorite restaurants
  - favorite foods
- payment cards:
  - encrypted card storage
  - add / update / delete
  - strict max 3 cards backend enforcement

### Food Search + Enrichment
- `POST /api/search` standardized endpoint
- nearby restaurants via Google Places (with fallback mocks)
- distance-aware and preference-aware ranking
- media-rich results:
  - restaurant image
  - food image
  - rating
  - review count
  - review snippet (when available)
  - cuisine type
  - nutrition + ingredients
- filters:
  - calories min/max
  - macro focus
  - preferred diet

### Route + Fitness Intelligence
- Google Directions integration (fallback mode supported)
- transport modes:
  - walking
  - running
  - driving
- route output:
  - distance
  - duration
  - calories burned
  - calorie balance
  - meal offset suggestion (walk/run miles needed)

### Dashboard + Activity History
- activity tracking persisted for every completed route
- dashboard summary:
  - today consumed
  - today burned
  - net intake
  - goal progress
  - weekly trend
  - recent food selections
  - recent routes
  - recommendation summary
- full history page with filter/search

## Architecture

## Backend (`backend/src`)
- `routes/` API route definitions
- `controllers/` request handlers
- `services/` business logic and integrations
- `models/` persistence layer (Mongo + file fallback)
- `middleware/` auth, validation, logging, error handling
- `utils/` crypto, tokens, geo, logging, response helpers
- `config/` env + database bootstrapping

## Frontend (`frontend/src`)
- `pages/` route-level views
- `components/` reusable UI building blocks
- `services/api/` axios API clients
- `hooks/` custom hooks
- `context/` auth state
- `utils/` client-side validators

## Tech Stack

- Backend: Node.js, Express, Mongoose, bcryptjs, jsonwebtoken, axios
- Frontend: React, Vite, React Router, axios
- Database:
  - primary: MongoDB (Atlas-ready)
  - fallback: local JSON datastore for offline demo continuity
- APIs: Google Places API, Google Directions API

## Security + Data Integrity

- bcrypt password hashing
- JWT auth for protected endpoints
- AES-256-GCM payment card encryption
- centralized validation middleware for all critical payloads
- immutable email in profile update API
- hard backend limit of max 3 payment cards
- strict lat/lng/radius validation (`radius <= 20 miles`)
- centralized error handling + request logging

## Setup

## 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

### Backend Environment Variables

```env
PORT=5050
NODE_ENV=development
GOOGLE_API_KEY=your_google_api_key
MONGODB_URI=your_mongodb_atlas_uri
MONGODB_DB_NAME=food_fitness_app
JWT_SECRET=replace_me
JWT_EXPIRES_IN=2h
CARD_ENCRYPTION_SECRET=replace_me
RESET_TOKEN_EXPIRES_MINUTES=30
ENABLE_GOOGLE_FALLBACK_MOCKS=true
```

Notes:
- If `MONGODB_URI` is empty/unavailable, backend automatically uses file datastore fallback.
- If `GOOGLE_API_KEY` fails or is missing, fallback mock data keeps demo flows functional when `ENABLE_GOOGLE_FALLBACK_MOCKS=true`.

## 2. Frontend

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

## 3. Seed Data

Initial seed runs automatically when users are absent.

Force reseed:

```bash
cd backend
npm run seed
```

Demo accounts:
- Admin
  - `admin@foodfitness.local` / `Admin123!`
- Verified user with 3 cards
  - `priya.verified@foodfitness.local` / `Demo123!`
- Verified user with favorites
  - `marcus.favorite@foodfitness.local` / `Demo123!`

## API Overview

Base path: `/api`

### Health
- `GET /health`

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
- `POST /profile/me/cards`
- `PUT /profile/me/cards/:cardId`
- `DELETE /profile/me/cards/:cardId`

### Search
- `POST /search`

Example request:

```json
{
  "keyword": "brownie",
  "lat": 40.7484,
  "lng": -73.9857,
  "radius": 5,
  "minCalories": 250,
  "maxCalories": 700,
  "macroFocus": "protein",
  "preferredDiet": "high-protein"
}
```

### Route + Fitness
- `POST /routes`

### Activities
- `GET /activities?limit=30`
- `POST /activities`

### Dashboard
- `GET /dashboard`

## Demo Flow

1. Register a user and verify email.
2. Login and open dashboard.
3. Update profile goals/preferences/favorites.
4. Search a food keyword with filters.
5. Review ranked restaurants with nutrition/media details.
6. Select a result and calculate route (walk/run/drive).
7. Observe calories consumed vs burned and offset suggestion.
8. Confirm activity saved to dashboard and history.
9. Manage payment cards (add/update/remove, max 3 enforced).

## Quality Checks

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend syntax check:

```bash
cd backend
find src -name '*.js' -print0 | xargs -0 -n1 node --check
```

## Future Improvements

- richer nutrition integration from real food databases
- optional meal logging with barcode scanning
- social sharing and challenge modes
- admin analytics panel
- CI test suites (unit + integration + e2e)
