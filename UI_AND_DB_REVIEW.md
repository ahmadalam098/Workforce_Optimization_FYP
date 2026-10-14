# UI Design & ERD Review (2026-10-13)

## UI Design Reference ("WorkForceNexus")
Brand: **WorkForceNexus** — "Smarter Workforce • Better Tomorrow". Deep navy sidebar/header, gold/yellow primary buttons & active nav item, warm off-white content, white cards, colored status pills (green Active/Available, yellow Pending, blue Assigned/Info, red Expired/High/On Leave).
Auth pages: split layout — navy left panel with illustration + tagline, white form on right.
App layout: navy left sidebar (logo, nav), top bar (search, notifications, user menu), page title + gold "+ Add" button top-right, search bar, data table with status pills and "..." action menu.

Sidebar nav: Dashboard, Organizations, Employee Pool, Contracts, Live Monitoring, Staff Requests, Team, Shifts, Reports, Settings.

| # | Screen | Content |
|---|---|---|
| 1 | Login | Email, password, remember me, forgot password, link to register |
| 2 | Register | Full name, email, password, confirm password |
| 3 | Forgot Password | Email → "Send Reset Link" |
| 4 | Reset Password | New + confirm password |
| 5 | Admin Dashboard | KPI cards (Total Employees, Active Orgs, Shared Pool Available, Pending Requests), Live Activity table, Workforce Utilization donut + trend |
| 6 | Organizations | Table: name, status, contracts, employees, actions |
| 7 | Organization Details | Tabs: Overview, Employees, Contracts, Allocations, Payments, Reviews; org info + contract summary |
| 8 | Employee Pool | Table: ID, name, skills, status, organization |
| 9 | Employee Details | Profile header; tabs Profile, Skills, Shift, Allocation History, Overtime, Reviews; skills w/ level, employment info (joining date, type, salary, status) |
| 10 | Contracts | Table: contract #, org, start/end date, status |
| 11 | Contract Details | Tabs Overview, Rules, Modifications; min/max, sharing, borrowing, priority, rates, currency |
| 12 | Workforce Requests | Table: org, required, skill, priority, status |
| 13 | Allocation Center | AI recommendation card (skill match, availability, priority match) + "Allocate Employee"; allocation overview with shortage per org |
| 14 | Customer Service | Live requests: customer, service type, priority, skill, status |
| 15 | WebRTC Call | Video call + customer details + chat |
| 18 | Reports & Analytics | Utilization, org workload chart, top skills demand |
| 19 | Notifications | List with priority pills |
| 20 | Shifts | Name, time, required, net salary, status |
| 21 | Team | Admin/Manager/HR/Support/Finance members |
| 22 | Settings | Tabs General, Security, Notifications, Integrations; timezone, language, theme |
(Screens 16, 17 not shown.)

## UI ↔ Backend mismatches
- Login UI has no role selector, but API requires `roleName` (and only Admin can log in).
- Register UI exists, but no register API (Organization table has its own password column).
- Forgot password UI says "Send Reset Link"; backend uses 6-digit **OTP** → need extra Verify OTP screen.
- Almost every list/detail screen needs GET APIs that don't exist yet.

## ERD review (matches FYP_DB SQL + current models)
Tables: User, Role, Employee, Employee_Status, Skills, Shift, Overtime, Organization, Organization_Manager, Contract, Workforce_Request, Employee_Allocation, Allocation_History, Organization_Reviews, Complaints, Reports.

Good: Allocation + Allocation_History (owner_org vs assign_org, is_allocated_by_AI, performed_by), Employee_Status history, Manager–Org junction, contract min/max/rates/currency, reviews linked to allocation.

Design issues:
1. **Skills has emp_id** → a skill row belongs to one employee; Workforce_Request.required_skill_id then points to one employee's skill. Needs Skill master + Employee_Skill (emp_id, skill_id, level, years) junction — critical for AI matching.
2. **Shift → status_history_id** is wrong; no employee↔shift assignment table.
3. Employee.status_history_id ↔ Employee_Status.emp_id is circular; Employee.role_id duplicates User.role_id.
4. **Organization.password** → second login system outside User/Role/JWT. Better: org account = User with "Organization" role linked to org.
5. Contract has start_time/end_time (TIME) but no contract **start/end date**, no sharing_allowed (only borrowing), no version, no rules table, no modification requests.
6. Complaints only has org_id + text — no sender, subject, priority, status, response, dates. Reports.level_of_query holds severity.
7. Employee lacks salary / employment type / joining info shown in UI (salary $/month, Full Time); several API fields are NotMapped.

Missing tables (needed by UI/requirements): Business Owner, Attendance, Leave, Employee_Shift, Invoices/Billing, Payments, Salary/Payroll, Notifications, Audit Log, Customer Service Requests, Calls/Sessions (WebRTC), Contract Modification/Versions, Contract Rules, Settings.
Note: previously committed backend models included AuditLog, Notification, OrganizationInvoice, CustomerPayment, ServiceSession, BusinessOwner, Attendance, AgreementRule, OrganizationContract — friend deleted them locally (uncommitted).
