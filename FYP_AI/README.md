# FYP_AI - the planner service

A small Python (FastAPI) service. The .NET backend sends it the facts (what is missing, which employees could be placed, their skills and
ratings) and it answers **who should go where, with a score and the reason**. It is advice only: the backend checks every choice against the
contract rules, writes to the database and keeps the manager in control. The service has no database and keeps nothing.

If this service is not running (or `Ai:PlannerUrl` is empty) the backend uses its built-in planner, which gives the same answers.

## Run

```
cd FYP_AI
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001
```

Then in `FYP_BACKEND/fyp_project/appsettings.json` set `"Ai": { "PlannerUrl": "http://localhost:8001" }` and restart the backend.
Open http://localhost:8001/docs to see and try the API. The manager's Autopilot page shows which planner is in use.
Optional shared secret: put `AI_SERVICE_KEY` in `.env` here and the same value in `Ai:ServiceKey` in `appsettings.json`.

## Files

- `app/main.py` - the API: `GET /health`, `POST /plan`
- `app/schemas.py` - the JSON contract (request and response)
- `app/planner.py` - the scoring and the assignment (same as the backend's `Services/Ai/LocalPlanner.cs`)
- `tests/test_planner.py` - run with `pytest`

## How the score works (0-100)

| Part | Weight | Meaning |
|---|---|---|
| skill | 0.40 | has the needed skill, how good (Beginner to Expert) and how many years; neutral when no skill is needed. Employees with the needed skill always come first; one without it is taken only when nobody with it is free |
| rating | 0.25 | the average review rating, out of 5 |
| ownership | 0.15 | own organization 1.0, free employee of another organization 0.5, spare employee lent by another 0.25 |
| returning | 0.10 | worked for this organization in the last 3 days |
| idle | 0.10 | free 1.0, spare (currently working at home) 0.5 |

The weights can be changed in `appsettings.json` (`Ai:Weights`). The pairs are taken best first, the most urgent task first.
Later: OR-Tools for the optimal assignment, a demand forecast, learning from the managers' accept / reject feedback.
