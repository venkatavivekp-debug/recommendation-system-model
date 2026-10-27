# ContextFit Frontend

React/Vite client for Food, Fitness and Media recommendations, explicit feedback, activity context, history and profile state. Recommendation scoring and persistence live in the Node/Express backend. No Amazon research checkpoint is loaded by the client.

## Local Setup

Use Node 22.12 or newer (validated with 22.23.2). From this directory:

```bash
npm ci
npm run dev
```

Run the backend separately with `npm start` in `backend/`. Default URLs are `http://localhost:5173` for the client and `http://localhost:5001` for the API. `VITE_API_BASE_URL` can override the API origin; do not put private provider credentials in frontend environment variables.

## Validation

```bash
npm test
npm run lint
npm run build
```

See [ContextFit Verification](../docs/VERIFICATION.md) for system-behavior evidence and limitations, and the [root README](../README.md) for architecture, policy and research boundaries. Feedback controls send the original recommendation event ID; score disclosures use the backend trace rather than reconstructing a score.
