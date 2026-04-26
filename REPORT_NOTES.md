# Report Notes

## Screenshots To Capture

1. Dashboard View
   - Capture the main dashboard after logging in.
   - It should show the calorie summary, activity summary, recommendation summary, and media recommendation sections.
   - This screenshot represents the main user-facing view of the system.

2. Recommendation Interaction View
   - Capture the food recommendation or search results screen.
   - It should show several meal or restaurant options with ranking/recommendation details.
   - If possible, include the feedback buttons because they show how the user can influence later recommendations.

## Current Implementation

The system is a working React and Node.js recommendation app. The backend provides dashboard, search, food recommendation, feedback, and media recommendation APIs. The frontend connects to those APIs and shows the main recommendation flow without needing a separate ML server.

## Research-Backed Backend Upgrade

The backend now uses practical versions of research ideas. Feedback changes ranking through a lightweight bandit-style score. Fitness activity can influence food recommendations, and food intake can influence fitness context. The recommendation output also tries to keep results diverse instead of returning repeated versions of the same kind of item.

## Validation Summary

Final validation should include:

- Backend syntax check
- Backend API tests
- Frontend lint
- Frontend production build
- Live checks for dashboard, search, food recommendations, feedback, content recommendations, invalid input, and malformed JSON

The project is ready for a demo when both servers are running and the dashboard loads at `http://localhost:5173`.
