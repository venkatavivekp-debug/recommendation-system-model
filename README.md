# Food + Fitness App

Production-structured full-stack application with:
- `backend`: Node.js + Express (MVC, validation, auth, profile, search, route/fitness)
- `frontend`: React + Vite (page/component architecture, API layer, protected flows)

## Architecture

### Backend (`backend/src`)
- `routes/`: API route definitions
- `controllers/`: HTTP handlers
- `services/`: business logic and external integrations
- `models/`: datastore access layer
- `middleware/`: auth, validation, logging, errors
- `utils/`: security, geo, token, response helpers

### Frontend (`frontend/src`)
- `pages/`: route-level pages
- `components/`: reusable UI components
- `services/api/`: axios API clients
- `hooks/`: reusable hooks
- `context/`: auth state management

## Security + Data Integrity

- Password hashing with `bcryptjs`
- JWT authentication for protected endpoints
- Card number encryption at rest using AES-256-GCM
- Centralized backend validation for all critical inputs
- Email field is immutable at profile level
- Max 3 payment cards enforced at backend
- `POST /api/search` validation enforces keyword + lat/lng + radius constraints

## Setup

## 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Required env vars (`backend/.env.example`):
- `PORT`
- `GOOGLE_API_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CARD_ENCRYPTION_SECRET`
- `RESET_TOKEN_EXPIRES_MINUTES`
- `ENABLE_GOOGLE_FALLBACK_MOCKS`

Note: If `GOOGLE_API_KEY` is missing and `ENABLE_GOOGLE_FALLBACK_MOCKS=true`, mock place and route fallbacks are used for demo continuity.

## 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend env:
- `VITE_API_BASE_URL` (default expected: `http://localhost:5050/api`)

## Seeded Demo Data

Seed runs automatically on first backend start.

Accounts:
- Admin
  - Email: `admin@foodfitness.local`
  - Password: `Admin123!`
- Verified user with 3 cards
  - Email: `priya.verified@foodfitness.local`
  - Password: `Demo123!`
- Verified user with 1 favorite item
  - Email: `marcus.favorite@foodfitness.local`
  - Password: `Demo123!`

Force reset seed:

```bash
cd backend
npm run seed
```

## API Endpoints

### Health
- `GET /api/health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/logout` (auth required)
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password` (auth required)

### Profile (auth required)
- `GET /api/profile/me`
- `PUT /api/profile/me`
- `POST /api/profile/me/cards`
- `DELETE /api/profile/me/cards/:cardId`

### Food Search (auth required)
- `POST /api/search`

Request body:
```json
{
  "keyword": "brownie",
  "lat": 40.7484,
  "lng": -73.9857,
  "radius": 5,
  "minCalories": 250,
  "maxCalories": 700,
  "macroFocus": "carb"
}
```

### Route + Fitness (auth required)
- `POST /api/routes`

Request body:
```json
{
  "originLat": 40.7484,
  "originLng": -73.9857,
  "destinationLat": 40.758,
  "destinationLng": -73.9855,
  "mode": "walking",
  "consumedCalories": 620
}
```

## End-to-End Demo Flow

1. Register a user
2. Verify email
3. Login
4. Search food with location + radius
5. Apply nutrition filters
6. Select restaurant/item
7. Choose transport mode (`walking` / `running` / `driving`)
8. View route distance, duration, calories burned
9. View calorie balance (`consumed - burned`)
10. Manage profile address/cards (max 3 cards enforced)

## Quality Checks

Frontend:
```bash
cd frontend
npm run lint
npm run build
```

Backend syntax sanity:
```bash
cd backend
find src -name '*.js' -print0 | xargs -0 -I {} node -c {}
```
