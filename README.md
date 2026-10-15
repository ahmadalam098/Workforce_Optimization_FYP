# WorkForce Nexus

Smart Workforce Optimization and Resource Sharing System for Multi-Organization Call Centers (Final Year Project).

## Folders

| Folder | What it holds |
|---|---|
| `FYP_FRONTEND/` | React 19 + Vite web app (Admin portal built; other portals to come) |
| `FYP_BACKEND/` | ASP.NET Core (.NET 10) API, EF Core + SQL Server, JWT in an HttpOnly cookie |
| `FYP_CHAT/` | Node.js + Socket.IO real-time chat server (organization manager <-> organizations); see its README |
| `FYP_DB/` | `WorkforceManagementDB_Complete.sql` (base schema) and `migrations/` (run after the base script, in number order) |
| `docs/` | `BACKEND_API_REFERENCE.md` (every API endpoint), `FYP_REQUIREMENTS.md` (scope), `UI_AND_DB_REVIEW.md` (design review) |

## Code layout

**Frontend** (`FYP_FRONTEND/src`)
```
components/   shared UI (ui/, brand/, profile/)
constants/ context/ hooks/ utils/ styles/ config/   shared code
services/     apiClient, authService, profileService, admin/, manager/   (one file per portal)
layouts/      AuthLayout (login pages)
routes/       AppRouter, ProtectedRoute, GuestRoute
portals/
  auth/       login, forgot password, OTP, reset
  admin/      layout/, shared/ and one folder per feature: dashboard, organizations, contracts, employees,
              skills, shifts, team, allocations, finance, requests, queries, reports, audit, settings,
              notifications, new-item
  manager/    layout/, dashboard/   (Organization Manager portal, in progress)
  common/     NotFoundPage
```

**Backend** (`FYP_BACKEND/fyp_project`)
```
Controllers/  Auth/  Admin/  Manager/  Common/  Legacy/ (older endpoints that no portal uses)
DTO/          Auth/  Admin/  Legacy/
Models/       Accounts/ Organizations/ Contracts/ Workforce/ Finance/ Support/ System/
Data/         WorkforceManagementDbContext
Services/     Auth/ Email/ Workforce/ Contracts/ Finance/ System/
Validation/   shared validation attributes
```

## Run it locally

1. **Database** - in SQL Server / LocalDB run `FYP_DB/WorkforceManagementDB_Complete.sql`, then every file in `FYP_DB/migrations/` in order (001, 002, 003, 005 ... 012).
2. **Backend** - copy `FYP_BACKEND/fyp_project/appsettings.example.json` to `appsettings.json`, fill in your own values (database, Redis, JWT key, Gmail app password), then `dotnet run` inside `FYP_BACKEND/fyp_project`.
3. **Chat server (optional)** - inside `FYP_CHAT`: `npm install`, `npm run init-env`, `npm start` (needs migration 012 and `Chat:ServiceKey` in appsettings.json).
4. **Frontend** - inside `FYP_FRONTEND`: copy `.env.example` to `.env`, then `npm install` and `npm run dev`.

Secrets (`appsettings.json`, `.env`) are git-ignored and must never be committed.
