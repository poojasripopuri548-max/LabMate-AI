# LabMate AI — Frontend

React + Vite frontend for the LabMate AI Intelligent Laboratory and Equipment
Management System (VFSTR).

## Stack

- React 18 + Vite
- React Router DOM (protected, role-aware routes)
- Axios (JWT Bearer auth, 401 auto-logout)
- Lucide React icons, Recharts analytics, React Toastify notifications

## Setup

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Environment (.env)

```
VITE_API_URL=http://localhost:5000      # Node.js backend
VITE_ML_API_URL=http://127.0.0.1:8001   # Python ML service (diagnostics)
```

All ML features are consumed through the backend proxy `/api/ml/*`
(recommendations, usage-analysis, maintenance-analysis).

## Backend routes used

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Profile | `GET /api/users/profile` |
| Equipment | `GET/POST /api/equipment`, `GET/PUT/DELETE /api/equipment/:id` |
| Laboratories | `GET /api/laboratories` |
| Bookings | `POST /api/bookings`, `GET /api/bookings/my-bookings`, `GET /api/bookings` (staff), `PATCH /api/bookings/:id/review` (staff), `PATCH /api/bookings/:id/cancel` |
| Availability | `GET /api/availability?equipmentId&startTime&endTime` |
| ML | `GET /api/ml/recommendations?q=&top_n=`, `GET /api/ml/usage-analysis`, `GET /api/ml/maintenance-analysis` |

## Notes

- Public registration creates **student** accounts only (backend-enforced).
- Faculty/admin can manage equipment and approve/reject bookings.
- Returns page reflects booking state; physical return confirmation is at the lab desk
  (no dedicated return endpoint exists in the backend).
- The AI Assistant routes questions to the real ML endpoints — it does not simulate actions.
- `backend/routes/authRoutes.js` was fixed during integration: it previously contained
  a copy of the ML routes, which broke `/api/auth/*`.
