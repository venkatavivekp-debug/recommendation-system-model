# BFIT

**Be Fit**

**Subtitle:** _Your Intelligent Nutrition, Cooking & Fitness Companion_

BFIT is a full-stack capstone-grade nutrition intelligence platform that combines meal discovery, macro planning, allergy safety, calendar-based diet balancing, route + calorie burn tracking, and community recipes.

## Overview

BFIT helps users make practical daily food decisions through one command-center flow:

1. Track consumed calories/macros for today.
2. See remaining calories/protein/carbs/fats/fiber.
3. Choose a meal intent: **Eat Out** or **Eat In**.
4. Get intelligent suggestions aligned to goals, preferences, allergies, and plans.
5. Take real-world actions: order delivery, open maps directions, buy ingredients, or cook recipes.

## Core Features

- JWT auth with registration, email verification (mock), login/logout, forgot/reset password
- Profile management with:
  - nutrition goals (`dailyCalorieGoal`, protein/carbs/fats/fiber goals)
  - diet and cuisine preferences
  - fitness goal
  - allergies
  - favorites (foods/restaurants)
- Restaurant + meal discovery with Google Places integration
- Global food lookup engine (`/api/food/lookup`) with:
  - trusted common-food nutrition fallback DB
  - API/fallback architecture for uncommon/branded foods
- Allergy detection/warnings on searched foods and meal suggestions
- Daily meal intake tracking (`/api/meals`, `/api/meals/today`, `/api/meals/history`)
- Remaining nutrition engine (`/api/nutrition/remaining`)
- Eat-out flow with real-world links:
  - Uber Eats
  - DoorDash
  - Google Maps directions
  - Google/website view
- Eat-in flow with:
  - ingredient meal builder
  - recipe generation
  - grocery suggestions + dynamic Walmart/Target links
  - YouTube recipe links
- Route + calorie burn summary (walk/run/drive)
- Activity history and dashboard trend view
- Calendar planning engine with balancing guidance:
  - historical intake view
  - day snapshots
  - future intake planning
  - safe, conservative reduction suggestions
- Community recipes module:
  - create recipes
  - browse recipes
  - rate/review recipes
  - save/unsave recipes

## Architecture

## Backend (`backend/src`)
- `routes/`: modular route groups
- `controllers/`: request handlers only
- `services/`: business logic (nutrition, recommendation, planning, lookup)
- `models/`: persistence abstraction (Mongo + file fallback)
- `middleware/`: auth, validation, request logging, global errors
- `utils/`: crypto, token, geo, media, allergy helpers

## Frontend (`frontend/src`)
- `pages/`: dashboard, search, results, route, history, profile, community, auth
- `components/`: reusable UI blocks/cards/charts/forms
- `services/api/`: axios API layer by feature
- `hooks/`, `context/`: auth/session state

## Tech Stack

- **Backend:** Node.js, Express, Mongoose
- **Frontend:** React, Vite, React Router, Axios
- **Security:** bcrypt password hashing, JWT, encrypted card utility retained in backend
- **Integrations:** Google Places + Directions, external link-out flows (Uber Eats, DoorDash, Google Maps, Walmart/Target search)

## Setup

## 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

### Backend environment variables

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
- If `MONGODB_URI` is missing, BFIT uses file datastore fallback.
- If Google API is unavailable, fallback mock mode keeps demos operational.

## 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Frontend environment variables

```env
VITE_API_BASE_URL=http://localhost:5050/api
```

## 3. Seed Demo Data

```bash
cd backend
npm run seed
```

Demo users:
- `admin@foodfitness.local` / `Admin123!`
- `priya.verified@foodfitness.local` / `Demo123!`
- `marcus.favorite@foodfitness.local` / `Demo123!`

## API Summary

Base: `/api`

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

### Food Intelligence
- `POST /food/lookup`
- `POST /food/search`

### Restaurant Search + Routes
- `POST /search`
- `POST /routes`

### Meals + Nutrition
- `POST /meals`
- `GET /meals/today`
- `GET /meals/history`
- `GET /nutrition/remaining`

### Activities + Dashboard
- `POST /activities`
- `GET /activities`
- `GET /dashboard`

### Meal Builder + Recipes
- `POST /meal-builder`
- `POST /meal-builder/recipes`

### Calendar Planning
- `GET /calendar/history`
- `GET /calendar/day/:date`
- `POST /calendar/plan`
- `GET /calendar/upcoming`

### Community Recipes
- `GET /community/recipes`
- `GET /community/recipes/:recipeId`
- `POST /community/recipes`
- `POST /community/recipes/:recipeId/reviews`
- `POST /community/recipes/:recipeId/save`

## Demo Flow

1. Register + verify account.
2. Login to BFIT dashboard command center.
3. Set goals/preferences/allergies in Profile.
4. Search restaurants or run global food lookup.
5. Add meals to today intake.
6. Check remaining nutrition engine output.
7. Choose **Eat Out** (delivery/pickup links) or **Eat In** (meal builder/recipes).
8. Optionally save future calendar plans and follow balancing guidance.
9. Use route summary to estimate calorie burn.
10. Browse/post/review community recipes.

## Allergy Safety

- Allergy checks run at backend level for ingredient-aware features.
- Warnings are surfaced as explicit messages (for food lookup, search results, and suggestions).
- Recipe suggestions include substitution guidance where relevant.

## Calendar Planning Logic

BFIT applies conservative, explainable planning:
- Detect planned extra calories for a future day.
- Spread adjustments across upcoming days.
- Encourage protein retention while reducing calorie-dense snacks.
- Avoid extreme crash-diet recommendations.

## Quality Commands

### Backend syntax check
```bash
cd backend
find src -name '*.js' -print0 | xargs -0 -n1 node --check
```

### Frontend lint + build
```bash
cd frontend
npm run lint
npm run build
```

## Future Improvements

- Add first-class external nutrition APIs for richer branded coverage
- Add image upload storage for recipe photos (object storage)
- Add automated test suites (unit + integration + e2e)
- Add role-based moderation tools for community recipes
- Add push notifications for plan reminders and meal timing
