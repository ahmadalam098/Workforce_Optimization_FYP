# FYP Requirements — Smart Workforce Optimization & Resource Sharing System for Multi-Organization Call Centers

Centralized platform: multiple organizations share a common employee pool based on contracts, skills, availability, workload, SLAs and priorities.
**Team split:** Frontend (React) = me | Backend (ASP.NET Core Web API) + SQL Server DB = friend.
**Theme:** warm off-white, gold/yellow, deep navy. Readable, accessible, comfortable for long working hours.

## Core Flow
Business Owner → Admin → (Organizations, Org Managers, Employees) → Contract → Workforce Request → AI/Optimization Engine → Allocation (Normal | Temporary Borrowing → Reallocation) → Attendance→Salary, Payment→Revenue, Reviews→Performance → Reports/Analytics

## Roles
1. **Business Owner** — views business performance, orgs, employees, revenue, expenses, salaries, profit, payment status, contracts, utilization, allocation stats, reports. **Profit is calculated** (Revenue − Expenses), never stored manually.
2. **Admin** (full access, operational controller) — add Business Owner, add/remove employees & org managers, allocation, handle queries, approve/reject orgs, contracts, manage skills, shifts, salary structures, payment rules, system rules, roles/permissions; override AI; monitor availability, org payments; allocation history; system reports; **audit logs** (who/what/from/to/when/reason).
3. **Organization** (client) — self-registers (info, contact, country, services, workforce needs) → Admin verification → Approved → Contract. Requests modifications, extra employees, reviews employees, raises queries.
4. **Organization Manager** — handles **one or more organizations** (as many as the admin assigns) (Manager–Organization assignment table). Login, handle org/employee queries, set query severity, report to Admin, manual allocation, monitor allocated employees & calls/audio/video, verify org payments, review performance, assign/unassign / restrict / mark unavailable for future allocation (**no deletion** — deactivation is Admin only), view employee info & salary status, manage attendance.
5. **Employee** — created by Admin (no self-registration). Fields: ID, name, email, phone, address, country, joining date, employment status, skills+proficiency, salary, bank info, emergency contact.

## Modules (30)
| # | Module | Priority | Key points |
|---|---|---|---|
| 1 | Auth & Authorization | Essential | Login, org registration, role-based access |
| 2 | Business Owner | Essential | Dashboard, financials, analytics |
| 3 | Admin | Essential | See roles above |
| 4 | Organization | Essential | Register → verify → approve |
| 5 | Organization Manager | Essential | ≤5 orgs each |
| 6 | Employee | Essential | Admin-created |
| 7 | Contract / Agreement | Core | Staffing (min/max, skills, shifts, hours); Borrowing (allowed, max borrowed); Payment (base rate, extra rate, currency, billing cycle, overtime); Period (start/end/renewal). Rules split: Staffing / Borrowing / Payment / Operational |
| 8 | Contract Modification | Core | Request → Admin review → Approved/Rejected/Negotiation → **new contract version** (never overwrite) |
| 9 | Workforce Request | Core | Check contract max → find employees → availability → skills → workload → allocate |
| 10 | Employee Allocation | Core | Primary/base vs current vs temporary-borrowed assignment; protected / shareable |
| 11 | Resource Sharing | Core | Extra employees above org minimum become shareable to other orgs |
| 12 | Reallocation | Core | Move an employee to another organization (or back to the owner) when they are idle; a busy employee is moved only after a warning |
| 13 | AI / Optimization | Core FYP | Inputs: demand (current+predicted), availability, skills, workload, min/max, contract rules, borrowing permissions, performance, fairness. Output: employee, org, quantity, priority, reason/score. **Hard contract constraints first → feasible set → AI**. Admin can override |
| 14 | Employee Skills | Essential | Employee ↔ EmployeeSkill (proficiency) ↔ Skill |
| 15 | Shift Management | Essential | Shift with start/end time (Morning 08–16, Evening 16–00, Night 00–08) |
| 16 | Attendance | Essential | Date, login/logout, shift, late, early leave, breaks, total hours, overtime |
| 17 | Leave Management | Recommended | On-leave employees excluded from allocation |
| 18 | Customer/Service Workload | Important | Customer requests → workload → demand source for AI |
| 19 | Call/Task Management | Important | Call ID, employee, org, session, start/end, duration, status |
| 20 | Audio/Video Monitoring | Required | Metadata in DB, files in secure storage (recording reference) |
| 21 | Organization Billing | Essential | Org → company, e.g. base $5/h, extra $7/h; invoices |
| 22 | Employee Salary/Payroll | Essential | Company → employee, fixed monthly salary (PKR) |
| 23 | Overtime | Essential | Separate from salary (hours × rate) |
| 24 | Reviews/Feedback | Recommended | Rating, comment, date, type, reviewer, employee, org, related allocation |
| 25 | Queries/Tickets | Essential | One common module: Org→Manager, Employee→Manager, Manager→Admin, Org→Admin. Priority LOW/MEDIUM/HIGH/CRITICAL; status, response, resolution date |
| 26 | Reports/Analytics | Essential | Utilization, allocation, financial |
| 27 | Notifications | Recommended | Requests, approvals, contract changes, payments due/received, shift start/end, query responses |
| 28 | Audit Logs | Essential | Every sensitive action |
| 30 | System Settings/Rules | Recommended | Configurable rules |

## Key Business Rules
- **Demand > supply** (e.g. 17 requested, 15 available): satisfy contractual minimums first → optimize rest → unfulfilled requests queued/escalated/notified.
- **Employee status:** AVAILABLE, ASSIGNED, BUSY, IDLE, ON_BREAK, OFFLINE, ON_LEAVE.
- **Allocation history** is never overwritten (used for reports, AI, billing, audit, fairness).
- **Multi-currency:** amount + currency (+ exchange rate). Billing USD, salary PKR.
- Never delete employees with history — deactivate instead.

## Frontend Development Rules
1. Inspect existing project first (framework, structure, packages).
2. Only touch React frontend (`FYP_FRONTEND`); never modify `FYP_BACKEND` / `FYP_DB`.
3. Never invent API endpoints/fields/auth rules — use friend's actual API docs; ask when missing.
4. Reusable components, pages, layouts, services, role-based dashboards.
5. Configurable API base URL; handle loading, validation, errors, empty states, success.
6. One module at a time; no unrelated changes without approval.
7. Explain plan before big changes; after implementing, run checks and summarize changed files + results.
8. Never expose/commit secrets or `.env`.
9. Git/GitHub: show changes and wait for explicit approval before stage/commit/push; never force-push.
10. Explain in beginner-friendly language (user prefers Roman Urdu/English mix).
