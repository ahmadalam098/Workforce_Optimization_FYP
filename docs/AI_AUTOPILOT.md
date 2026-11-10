# AI Autopilot - design and how to run it

For the manager of an organization: one switch, **Autopilot**. When it is on, the system keeps the organization's contract staffed by itself, like cruise control, and the manager can take over at any moment.

## What the AI does

1. **Asks the employee first.** By default the chosen employee gets an **offer** in My Assignments and is placed only after accepting. If they decline, or do not answer within 10 minutes, the AI asks somebody else (a decliner is not asked again by that organization for a day). The manager can switch an organization to "Placing at once".
2. **Keeps the contract minimum.** Each contract has a minimum number of employees (for a daily contract: for the daily time window). The AI chooses the best fit for the missing places. When the end time of any assignment passes (made by the AI or by a person, unless it is locked), the employee goes back to the pool.
3. **Matches new staff requests.** A new staff request (Pending) or an approved one is filled with the employees whose skills fit best, most urgent request first. Many requests at the same time are planned together, so one employee is never used twice. A new request is approved by the AI when it places the first employee (the same as when the manager presses Allocate). A request is staffed from 60 minutes before it starts until it ends.
4. **Borrows only when needed.** Own employees always come first. If the organization has nobody suitable and the contract allows borrowing, the AI takes an employee of another organization: a free one (only above what that organization still needs for its own minimum) or a **spare** one who works at home above their organization's contract minimum, is not locked, not busy and not on a call.
5. **Recalls.** When the owner organization needs its employee back (its own minimum is short and its own free people cannot fill it), the borrower gets **3 minutes**, a replacement is suggested, then the employee goes back. An owner asks for its own lent employees back before it borrows from a third organization.
6. **A person's choice is kept.** If a manager or the admin releases minimum staff, or undoes an AI decision, that place stays empty for 60 minutes (the manager wanted fewer people) and that employee is not placed again for 60 minutes. "Place now" fills the place at once.
7. **The manager has the last word.** Suggest only (nothing changes), apply or reject each suggestion, undo what was applied, lock an employee so the AI never moves them, recall or return a loan, and use the normal allocation screens as before. Every choice shows **Why?**: the reason in words, the parts of the score and the next best choices.

## How a choice is made

Score 0-100 for every allowed (task, employee) pair:

| Part | Weight | Meaning |
|---|---|---|
| skill | 0.40 | has the needed skill, level (Beginner to Expert), years; neutral when no skill is needed. Employees with the needed skill always come first; one without it is taken only when nobody with it is free (the reason says so) |
| rating | 0.25 | average review rating out of 5 |
| ownership | 0.15 | own organization 1.0, free employee of another organization 0.5, spare employee lent by another 0.25 |
| returning | 0.10 | worked for this organization in the last 3 days |
| idle | 0.10 | free 1.0, spare 0.5 |

The pairs are taken best first, the most urgent task first. Weights are in `appsettings.json` (`Ai:Weights`). No training data is needed: this is an optimization problem, not a prediction. Later steps: OR-Tools for the optimal assignment, a demand forecast, and learning from the managers' accept / reject feedback (the `AI_Decision` table already keeps that data).

## Architecture

```
Manager portal (React)  --->  ASP.NET backend  --->  SQL Server (the truth)
   AI Autopilot page            AutopilotService            AI_Decision, Employee_Loan,
                                AutopilotWorker (ticks)     Autopilot_Setting, Employee_Allocation
                                      |
                                      v   POST /plan  (JSON, advice only)
                                FYP_AI (Python FastAPI)  - optional; the built-in planner gives the same answer
```

- The **backend** reads the facts from the database, asks the planner, **checks every answer against the contract rules** and writes to the database. The planner never touches the database.
- **`FYP_AI`** (Python / FastAPI) has no database and keeps nothing. If it is not running, or `Ai:PlannerUrl` is empty, the backend's built-in planner (`Services/Ai/LocalPlanner.cs`) is used, so the autopilot never stops.
- **Safety:** the AI never forces a rule (maximum, borrowing, availability); a borrowed employee never takes their organization below its minimum; locked, busy and on-call employees are never taken; every action is in the audit log and the bells of both managers.

## Code

| Where | What |
|---|---|
| `FYP_DB/migrations/025_ai_autopilot.sql` | the new tables and columns |
| `FYP_BACKEND/.../Models/Workforce/AiModels.cs` | `AutopilotSetting`, `AiDecision`, `EmployeeLoan` |
| `FYP_BACKEND/.../Services/Ai/AiContracts.cs` | the JSON contract with the planner |
| `FYP_BACKEND/.../Services/Ai/LocalPlanner.cs` | the built-in planner (scoring + assignment) |
| `FYP_BACKEND/.../Services/Ai/PlannerGateway.cs` | calls `FYP_AI`, falls back to the built-in planner |
| `FYP_BACKEND/.../Services/Ai/AutopilotService.cs` | what is missing, candidates, plan, apply, reject, undo, lock |
| `FYP_BACKEND/.../Services/Ai/AutopilotService.Loans.cs` | loans, recall with the 3-minute deadline, replacements, releasing at the end |
| `FYP_BACKEND/.../Services/Ai/AutopilotWorker.cs` | the background tick (every 15 seconds) |
| `FYP_BACKEND/.../Controllers/Manager/ManagerAutopilotController.cs` | the manager's API |
| `FYP_AI/app/` | `main.py` (API), `schemas.py` (contract), `planner.py` (same scoring) |
| `FYP_FRONTEND/src/portals/manager/autopilot/` | `AutopilotPage`, `OrganizationAutopilotCard`, `DecisionsPanel`, `LoansPanel` |

## JSON contract (backend -> `POST /plan`)

```json
{
  "tasks": [{ "taskId": "M", "orgId": 7, "kind": "Minimum", "needed": 2, "priority": 0, "requiredSkillIds": [], "allowBorrowed": true, "excludeEmpIds": [] }],
  "candidates": [{ "empId": 12, "ownerOrgId": 7, "pool": "Free", "rating": 4.5, "returning": true, "skills": [{ "skillId": 3, "level": 4, "years": 6 }] }],
  "weights": { "skill": 0.4, "rating": 0.25, "ownership": 0.15, "returning": 0.1, "idle": 0.1 }
}
```

Answer: `{ "assignments": [{ "taskId", "empId", "score", "reason", "breakdown": { "skill": 80, ... }, "alternatives": [{ "empId", "score" }] }], "unfilled": [{ "taskId", "missing", "why" }] }`.

## Database (migrations 025 and 026)

- `Autopilot_Setting` - the switch per organization, the last run and its message.
- `AI_Decision` - every choice: who, for what, score, reason, breakdown, alternatives, status (Suggested / Applied / Rejected / Undone / Failed), planner, who triggered it.
- `Employee_Loan` - lender, borrower, status (Lent / RecallRequested / Returned), `recall_deadline`, replacement.
- `Employee_Allocation` - two new columns: `source` (Manual / AI / Loan) and `locked`.

## Run it

1. Run `FYP_DB/migrations/025_ai_autopilot.sql`, then restart the backend (the worker starts with it).
2. (Optional) the Python service: see `FYP_AI/README.md`, then set `"Ai": { "PlannerUrl": "http://localhost:8001" }` in `appsettings.json` and restart the backend.
3. Demo data: `FYP_DB/seed/ai_demo_data.sql` (10 organizations, 60 employees). Indus Utilities, Pioneer Airlines and Metro Retail are short of staff; Lahore E-Commerce and Skyline Travel have spare employees. Log in as `manager5@demo.workforce.com` (password `Ali@12345`), open **AI Autopilot** and turn it on.
4. Settings: `Ai:RecallMinutes` (3), `Ai:TickSeconds` (15), `Ai:ServiceKey` (shared secret with `FYP_AI`).

Note: the demo contracts are not "Daily" (they have no daily billing version), so their minimum is kept until it is released, not per day.

Migration 026 adds `Autopilot_Setting.ask_employees` (default 1) and `AI_Decision.offer_id`; decisions can then also be Offered, Declined or Expired. The backend creates the tables and columns of 025 and 026 by itself when it starts (`Services/Ai/AiSchema.cs`), so an older database keeps working; running the migrations by hand is still fine.

## Tested

A full test run on a copy of the database (about 270 checks): autopilot on and off; suggest, apply, reject, undo and lock; offers accepted, declined and expired; staff requests (new and approved, priorities, start and end times, rejected and cancelled); borrowing; manual and automatic recalls with the 3-minute deadline; every portal's numbers against the database; the manager's AI Autopilot page and the employee's My Assignments page in Chrome; a database without migrations 025/026; 103 organizations with 605 employees (first round with 281 placements: 14 s, later rounds: under 1 s); and the real FYP_AI service: `python -m pytest tests` (7 tests), and the Python planner choosing exactly the same employees and scores as the built-in one in 41 decisions.

## Development settings

- `EmailSettings:PickupDirectory`: when set, emails are written as .eml files into that folder instead of being sent (for testing; nothing leaves the computer).
- `Ai:OfferMinutes` (10): how long an offer of the AI waits for the employee.
- `FYP_DB/seed/ai_demo_refresh.sql`: makes the demo staff requests current again for a new demo day (safe to run any time).
