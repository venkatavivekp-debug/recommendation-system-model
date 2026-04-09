# recommendation-system-model

`recommendation-system-model` is a backend-driven, cross-domain adaptive recommendation platform with active domains in food, fitness, and media (movies + music).  
The architecture is domain-agnostic so additional domains can be added without redesigning the core engine.

## System Positioning

- Adaptive recommendation system model
- Cross-domain sequential recommendation engine
- Context-aware recommendation platform
- Explainable optimization layer for recommendation decisions

## Implementation Foundations

The implementation extends ideas and engineering patterns from:

- Microsoft Recommenders: ranking pipeline, evaluation workflow, and scalable recommender structure
- CRSLab: interaction-oriented modular architecture for recommendation systems

Research inspirations integrated into this codebase:

- Impatient Bandits (KDD 2023): adaptive decision updates with exploration/exploitation and delayed reward proxy
- Pacer and Runner / SyNCRec (SIGIR 2024): sequence-aware cross-domain influence
- TimeMCL (ICML 2025 concept): multi-candidate generation before final winner selection

## What Is Implemented Directly

- Domain-agnostic core services:
  - `domainRegistryService`
  - `featureService`
  - `candidateGenerationService`
  - `multiCandidateService`
  - `crossDomainSequenceService`
  - `banditDecisionService`
  - `rewardModelService`
  - `feedbackLearningService`
  - `recommendationService`
  - `explanationService`
  - `evaluationService`
  - `fallbackReliabilityService`
  - `seededDataService`
- Adaptive feedback loop with persisted actions:
  - `selected`
  - `helpful`
  - `save`
  - `not_interested`
  - `ignored`
- Normalized explainability factors (shares sum to approximately 100%)
- Fallback-safe API behavior and timeout-safe frontend rendering

## Core Architecture

1. Context/Input Layer

- user profile and goals
- time context
- activity/steps/calories-burned signals
- recent interaction history
- cross-domain event history

2. Candidate Generation Layer

- generates large candidate pools per domain
- supports diversified candidate modes before final ranking

3. Cross-Domain Sequence Layer

- models transition effects across domains, e.g.:
  - workout -> meal preference shift
  - meal context -> media preference shift
  - walking/activity state -> music preference shift

4. Adaptive Decision Layer

- bandit-style scoring with immediate + delayed reward proxy
- exploration vs exploitation
- feedback-driven re-ranking over time

5. Explanation Layer

- confidence
- top factors
- short recommendation reason
- normalized contribution percentages

## Active Domain Plug-ins

- Food: meals, recipes, restaurants
- Fitness: activity/recovery suggestions
- Media: movies, shows, songs

The core engine remains domain-agnostic; each domain contributes candidate metadata and domain features.

## Reliability Guarantees

- Request timeout handling in frontend and backend
- Fallback-first initial rendering for critical screens
- Retry-safe API behavior
- Controllers return valid JSON even when upstream dependencies degrade
- Safe local datastore fallback when MongoDB is unavailable

## Seeded Accounts

These users are inserted or upserted at startup:

- `pangulurivenkatavivek@gmail.com` / `App@2026` (admin)
- `admin@bfit.com` / `admin123` (admin)
- `user@bfit.com` / `user123` (baseline user)
- `fitness_user@recommendation-model.local` / `fitness123`
- `weekend_spike_user@recommendation-model.local` / `weekend123`
- `irregular_user@recommendation-model.local` / `irregular123`
- `sedentary_user@recommendation-model.local` / `sedentary123`

Seeded histories include workouts, meals, media interactions, and cross-domain transitions.

## Run Instructions

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables (Backend)

Use `backend/.env.example` as a template.

- `PORT=5001`
- `NODE_ENV=development`
- `FALLBACK_MODE=true|false`
- `GOOGLE_API_KEY=...`
- `MONGODB_URI=...` (optional)
- `JWT_SECRET=...`

When `MONGODB_URI` is empty, the backend uses file datastore mode under `runtime-data/`.

## Supported Evaluation Signals

- Accuracy / Precision / Recall / AUC
- Precision@K / Recall@K / NDCG
- Selection and acceptance rates
- Repeat-selection proxy
- Delayed reward proxy
- Cross-domain transition examples

## Validation Commands

### Backend syntax checks

```bash
cd backend
find src -name "*.js" -print0 | xargs -0 -n1 node --check
```

### Frontend checks

```bash
cd frontend
npm run lint
npm run build
```

## Health Endpoint

- `GET /api/health`

Response includes service status, database mode, and timestamp.

