# WorkForce Nexus

Smart Workforce Optimization and Resource Sharing System for Multi-Organization Call Centers (Final Year Project).

## Folders

| Folder | What it holds |
|---|---|
| `FYP_FRONTEND/` | React 19 + Vite web app (Admin portal built; other portals to come) |
| `FYP_BACKEND/` | ASP.NET Core (.NET 10) API, EF Core + SQL Server, JWT in an HttpOnly cookie |
| `FYP_DB/` | `WorkforceManagementDB_Complete.sql` (base schema) and `migrations/` (run after the base script, in number order) |
| `BACKEND_API_REFERENCE.md` | Every API endpoint, phase by phase |
| `FYP_REQUIREMENTS.md`, `UI_AND_DB_REVIEW.md` | Project scope and design review |

## Run it locally

1. **Database** - in SQL Server / LocalDB run `FYP_DB/WorkforceManagementDB_Complete.sql`, then every file in `FYP_DB/migrations/` in order (001, 002, 003, 005 ... 010).
2. **Backend** - copy `FYP_BACKEND/fyp_project/appsettings.example.json` to `appsettings.json`, fill in your own values (database, Redis, JWT key, Gmail app password), then `dotnet run` inside `FYP_BACKEND/fyp_project`.
3. **Frontend** - inside `FYP_FRONTEND`: copy `.env.example` to `.env`, then `npm install` and `npm run dev`.

Secrets (`appsettings.json`, `.env`) are git-ignored and must never be committed.
