-- Demo data for the AI allocation work: 10 organizations, managers, business owners, 60 employees with skills,
-- contracts, requests, allocations, reviews and call sessions.
--
-- ONLY ADDS rows. It never changes or deletes what is already in the database (new ids start after the biggest id in each table).
-- Every account created here has the password  Ali@12345   (emails end with @demo.workforce.com).
-- Safe to run twice: if the demo accounts already exist it does nothing.
-- Run in SQL Server Management Studio (or sqlcmd) against WorkforceManagementDB, after migrations 001-025.

USE WorkforceManagementDB;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM dbo.[User] WHERE email LIKE '%@demo.workforce.com')
BEGIN
    PRINT 'Demo data is already there. Nothing was added.';
    RETURN;
END

BEGIN TRAN;

DECLARE @hash VARCHAR(100) = '$2a$11$szKYP7iAbUc/ktI8LsGSpuv8ffY0o6Olrb52pcHZJCevdEgvMV8.O'; -- BCrypt of Ali@12345
DECLARE @now DATETIME = GETDATE();
DECLARE @today DATETIME = CAST(CAST(@now AS DATE) AS DATETIME);

DECLARE @org INT = ISNULL((SELECT MAX(org_id) FROM dbo.Organization), 0);
DECLARE @usr INT = ISNULL((SELECT MAX(user_id) FROM dbo.[User]), 0);
DECLARE @emp INT = ISNULL((SELECT MAX(emp_id) FROM dbo.Employee), 0);
DECLARE @con INT = ISNULL((SELECT MAX(contract_id) FROM dbo.Contract), 0);
DECLARE @req INT = ISNULL((SELECT MAX(workforce_request_id) FROM dbo.Workforce_Request), 0);
DECLARE @mgr INT = ISNULL((SELECT MAX(manager_id) FROM dbo.Organization_Manager), 0);
DECLARE @shf INT = ISNULL((SELECT MAX(shift_id) FROM dbo.Shift), 0);
DECLARE @est INT = ISNULL((SELECT MAX(status_history_id) FROM dbo.Employee_Status), 0);
DECLARE @alc INT = ISNULL((SELECT MAX(allocation_id) FROM dbo.Employee_Allocation), 0);
DECLARE @rev INT = ISNULL((SELECT MAX(review_id) FROM dbo.Organization_Reviews), 0);

-- ---------------------------------------------------------------- helper lists
CREATE TABLE #n (i INT PRIMARY KEY);
INSERT #n SELECT TOP 300 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects;

CREATE TABLE #org (k INT PRIMARY KEY, name VARCHAR(100), slug VARCHAR(30));
INSERT #org VALUES
 (0,'Apex Telecom Support','apex'),(1,'Crescent Bank Helpline','crescent'),(2,'Nova Insurance Services','nova'),
 (3,'Lahore E-Commerce Hub','lahore'),(4,'Indus Utilities Care','indus'),(5,'Pioneer Airlines Desk','pioneer'),
 (6,'Zenith Health Line','zenith'),(7,'Skyline Travel Assist','skyline'),(8,'Metro Retail Support','metro'),
 (9,'Orbit Tech Solutions','orbit');

-- ---------------------------------------------------------------- skills
CREATE TABLE #sk (ix INT PRIMARY KEY, name VARCHAR(100), category VARCHAR(100), id INT);
INSERT #sk (ix, name, category) VALUES
 (0,'English Speaking','Language'),(1,'Urdu Speaking','Language'),(2,'Billing Support','Support'),
 (3,'Technical Support','Support'),(4,'Sales','Sales'),(5,'Complaint Handling','Support'),
 (6,'Customer Retention','Sales'),(7,'Arabic Speaking','Language'),(8,'Data Entry','Back Office');

INSERT dbo.Skill_Master (name, category, description, is_active, created_at)
SELECT s.name, s.category, 'Demo skill', 1, @now FROM #sk s
WHERE NOT EXISTS (SELECT 1 FROM dbo.Skill_Master m WHERE m.name = s.name);

UPDATE s SET id = m.skill_master_id FROM #sk s JOIN dbo.Skill_Master m ON m.name = s.name;

-- ---------------------------------------------------------------- organizations
INSERT dbo.Organization (org_id, org_name, email, phone, address, country, status, created_at, approved_at, password)
SELECT @org + k + 1, name, slug + '@demo.workforce.com', '0300' + RIGHT('0000000' + CAST(1000000 + k * 137 AS VARCHAR), 7),
       'Main Boulevard, Block ' + CAST(k + 1 AS VARCHAR), 'Pakistan', 'Active', DATEADD(DAY, -90 + k, @now), DATEADD(DAY, -89 + k, @now), @hash
FROM #org;

-- ---------------------------------------------------------------- users: 10 managers, 2 business owners, 60 employees
CREATE TABLE #fn (ix INT PRIMARY KEY, v VARCHAR(30));
INSERT #fn VALUES (0,'Ali'),(1,'Ahmed'),(2,'Hassan'),(3,'Usman'),(4,'Bilal'),(5,'Hamza'),(6,'Zain'),(7,'Fahad'),(8,'Saad'),(9,'Omar'),
                  (10,'Ayesha'),(11,'Fatima'),(12,'Sana'),(13,'Hira'),(14,'Maryam'),(15,'Zainab'),(16,'Noor'),(17,'Iqra'),(18,'Mehwish'),(19,'Sadia');
CREATE TABLE #ln (ix INT PRIMARY KEY, v VARCHAR(30));
INSERT #ln VALUES (0,'Khan'),(1,'Malik'),(2,'Sheikh'),(3,'Butt'),(4,'Qureshi'),(5,'Raza'),(6,'Chaudhry'),(7,'Siddiqui'),(8,'Ansari'),(9,'Mirza'),(10,'Javed'),(11,'Ahmed');

-- managers: user ids @usr+1 .. @usr+10 (manager of organization k is @usr + k + 1)
INSERT dbo.[User] (user_id, name, age, phone_no, email, country, password, role_id, cnic, is_active, created_at)
SELECT @usr + o.k + 1, f.v + ' ' + l.v, 30 + o.k, '0321' + RIGHT('0000000' + CAST(2000000 + o.k * 311 AS VARCHAR), 7),
       'manager' + CAST(o.k + 1 AS VARCHAR) + '@demo.workforce.com', 'Pakistan', @hash, 4,
       '35202-' + RIGHT('0000000' + CAST(3000000 + o.k * 7919 AS VARCHAR), 7) + '-1', 1, DATEADD(DAY, -85, @now)
FROM #org o JOIN #fn f ON f.ix = (o.k * 2 + 3) % 20 JOIN #ln l ON l.ix = (o.k * 5 + 1) % 12;

INSERT dbo.Organization_Manager (manager_id, user_id, org_id)
SELECT @mgr + k + 1, @usr + k + 1, @org + k + 1 FROM #org;

-- business owners: user ids @usr+11, @usr+12
INSERT dbo.[User] (user_id, name, age, phone_no, email, country, password, role_id, cnic, is_active, created_at)
VALUES (@usr + 11, 'Tariq Mehmood', 48, '03331234501', 'owner1@demo.workforce.com', 'Pakistan', @hash, 3, '35202-4000001-1', 1, DATEADD(DAY, -95, @now)),
       (@usr + 12, 'Saima Rehman',  44, '03331234502', 'owner2@demo.workforce.com', 'Pakistan', @hash, 3, '35202-4000002-2', 1, DATEADD(DAY, -95, @now));

-- employees: n = 1..60. Employee n belongs to organization k = (n-1)%10, and is the j-th one there, j = (n-1)/10.
CREATE TABLE #e (n INT PRIMARY KEY, k INT, j INT, uid INT, eid INT, orgid INT, alloc_n INT, assigned BIT);
INSERT #e (n, k, j, uid, eid, orgid, alloc_n)
SELECT i, (i - 1) % 10, (i - 1) / 10, @usr + 12 + i, @emp + i, @org + ((i - 1) % 10) + 1, 2 + (((i - 1) % 10) % 4)
FROM #n WHERE i <= 60;
UPDATE #e SET assigned = CASE WHEN j < alloc_n OR n IN (54, 58) THEN 1 ELSE 0 END;

INSERT dbo.[User] (user_id, name, age, phone_no, email, country, password, role_id, cnic, is_active, created_at)
SELECT e.uid, f.v + ' ' + l.v, 21 + (e.n * 3) % 20, '0345' + RIGHT('0000000' + CAST(5000000 + e.n * 977 AS VARCHAR), 7),
       'employee' + CAST(e.n AS VARCHAR) + '@demo.workforce.com', 'Pakistan', @hash, 2,
       '35201-' + RIGHT('0000000' + CAST(6000000 + e.n * 4231 AS VARCHAR), 7) + '-' + CAST(e.n % 9 + 1 AS VARCHAR), 1, DATEADD(DAY, -80, @now)
FROM #e e JOIN #fn f ON f.ix = (e.n - 1) % 20 JOIN #ln l ON l.ix = (e.n * 5) % 12;

INSERT dbo.Employee (emp_id, user_id, role_id, joining_date, org_id, availability_status, hourly_rate, rating)
SELECT eid, uid, 2, CAST(DATEADD(DAY, -(60 + (n * 37) % 600), @now) AS DATE), orgid,
       CASE WHEN assigned = 1 THEN 'Assigned' ELSE 'Available' END, 2 + (n % 7) * 0.75, NULL
FROM #e;

-- status history: "created" for everybody, then "allocated" for the ones that work now
INSERT dbo.Employee_Status (status_history_id, emp_id, old_status, new_status, changed_at, reason, changed_by)
SELECT @est + n, eid, NULL, 'Available', DATEADD(DAY, -(60 + (n * 37) % 600), @now), 'Employee created', NULL FROM #e;
INSERT dbo.Employee_Status (status_history_id, emp_id, old_status, new_status, changed_at, reason, changed_by)
SELECT @est + 100 + n, eid, 'Available', 'Assigned', DATEADD(HOUR, 8, @today), 'Allocated for the day', NULL FROM #e WHERE assigned = 1;
UPDATE x SET status_history_id = CASE WHEN e.assigned = 1 THEN @est + 100 + e.n ELSE @est + e.n END
FROM dbo.Employee x JOIN #e e ON e.eid = x.emp_id;

-- ---------------------------------------------------------------- employee skills: 2 or 3 different skills each
INSERT dbo.Employee_Skill (emp_id, skill_master_id, proficiency, years_of_experience, created_at)
SELECT e.eid, s.id, CHOOSE((e.n + t.slot) % 4 + 1, 'Beginner', 'Intermediate', 'Advanced', 'Expert'),
       ((e.n * 3 + t.slot * 5) % 9) + CASE WHEN (e.n + t.slot) % 4 >= 2 THEN 2 ELSE 0 END, DATEADD(DAY, -50, @now)
FROM #e e
JOIN (VALUES (0), (1), (2)) t(slot) ON t.slot < 2 OR e.n % 2 = 0
JOIN #sk s ON s.ix = CASE t.slot WHEN 0 THEN e.n % 9
                                 WHEN 1 THEN (e.n + 1 + (e.n / 9) % 4) % 9
                                 ELSE (e.n + 5 + (e.n / 9) % 3) % 9 END;

-- ---------------------------------------------------------------- shifts
INSERT dbo.Shift (shift_id, shift_name, start_time, end_time, status_history_id)
VALUES (@shf + 1, 'Demo Morning', '08:00', '16:00', NULL), (@shf + 2, 'Demo Evening', '16:00', '00:00', NULL), (@shf + 3, 'Demo Night', '00:00', '08:00', NULL);

INSERT dbo.Employee_Shift (emp_id, shift_id, start_date, end_date, assigned_by, notes, created_at)
SELECT eid, @shf + 1 + (n % 3), CAST(DATEADD(DAY, -30, @now) AS DATE), NULL, @usr + k + 1, NULL, DATEADD(DAY, -30, @now) FROM #e;

-- ---------------------------------------------------------------- contracts: one per organization (daily window, min/max)
-- Organizations 4, 5 and 8 need more people than they have (they must borrow); organizations 3 and 7 have people to spare.
INSERT dbo.Contract (contract_id, org_id, contract_number, start_time, end_time, min_employees, max_employees, borrowing_allowed,
                     priority_level, billing_currency, base_hourly_rate, extra_hourly_rate, status, created_at, approved_at)
SELECT @con + k + 1, @org + k + 1, 'CNT-' + RIGHT('000' + CAST(@con + k + 1 AS VARCHAR), 3),
       TIMEFROMPARTS(6 + (k % 4) * 2, 0, 0, 0, 0), DATEADD(HOUR, 8, TIMEFROMPARTS(6 + (k % 4) * 2, 0, 0, 0, 0)),
       2 + (k % 3) + CASE WHEN k IN (4, 5, 8) THEN 1 ELSE 0 END, 6 + (k % 3), CASE WHEN k IN (2, 9) THEN 0 ELSE 1 END,
       CHOOSE(k % 3 + 1, 'High', 'Medium', 'Low'), 'USD', 4 + (k % 5), 6 + (k % 5), 'Active', DATEADD(DAY, -60, @now), DATEADD(DAY, -59, @now)
FROM #org;

-- ---------------------------------------------------------------- requests (the organizations that are short ask most)
CREATE TABLE #r (r INT PRIMARY KEY, k INT);
INSERT #r VALUES (1,4),(2,5),(3,8),(4,4),(5,5),(6,8),(7,0),(8,1),(9,2),(10,6),(11,9),(12,7);

INSERT dbo.Workforce_Request (workforce_request_id, org_id, request_by_org_id, contract_id, required_employees, required_skill_id,
                              priority, start_datetime, end_datetime, reason, status, created_at)
SELECT @req + r, @org + k + 1, @org + k + 1, @con + k + 1, 1 + (r % 3), NULL,
       CHOOSE(r % 4 + 1, 'Medium', 'High', 'Low', 'Critical'),
       DATEADD(MINUTE, -30, GETUTCDATE()), DATEADD(HOUR, 4 + r % 5, GETUTCDATE()),
       CHOOSE(r % 4 + 1, 'Sudden rise in calls after an outage', 'Two agents on leave today', 'New campaign launched this morning', 'Peak hours need extra agents'),
       CASE WHEN r IN (9, 10) THEN 'Approved' ELSE 'Pending' END, DATEADD(MINUTE, -r * 7, @now)
FROM #r;

INSERT dbo.Workforce_Request_Skill (workforce_request_id, skill_master_id)
SELECT @req + r, s.id FROM #r JOIN #sk s ON s.ix = r % 9; -- one skill per request (the table allows one)

-- ---------------------------------------------------------------- allocations: working today, two lent to another organization, and 2 finished ones each
CREATE TABLE #a (aid INT PRIMARY KEY, n INT, eid INT, owner_org INT, assign_org INT, a_type VARCHAR(50), st DATETIME, en DATETIME, done BIT, daily INT);

-- working today (own organization)
INSERT #a (aid, n, eid, owner_org, assign_org, a_type, st, en, done, daily)
SELECT @alc + e.n, e.n, e.eid, e.orgid, e.orgid, 'Normal', DATEADD(HOUR, 8, @today), NULL, 0, NULL
FROM #e e WHERE e.j < e.alloc_n AND e.n NOT IN (54, 58);
-- lent: employee 54 (organization 3) works for organization 4, employee 58 (organization 7) works for organization 8
INSERT #a (aid, n, eid, owner_org, assign_org, a_type, st, en, done, daily)
SELECT @alc + e.n, e.n, e.eid, e.orgid, @org + CASE e.n WHEN 54 THEN 5 ELSE 9 END, 'Temporary', GETUTCDATE(), DATEADD(HOUR, 6, GETUTCDATE()), 0, NULL
FROM #e e WHERE e.n IN (54, 58);
-- finished work in the past (2 per employee)
INSERT #a (aid, n, eid, owner_org, assign_org, a_type, st, en, done, daily)
SELECT @alc + 100 + (e.n - 1) * 2 + t.a, e.n, e.eid, e.orgid, e.orgid, 'Normal',
       DATEADD(HOUR, 8, DATEADD(DAY, -(t.a * 9 + e.n % 7), @today)), DATEADD(HOUR, 16, DATEADD(DAY, -(t.a * 9 + e.n % 7), @today)), 1, NULL
FROM #e e JOIN (VALUES (1), (2)) t(a) ON 1 = 1;

INSERT dbo.Employee_Allocation (allocation_id, employee_id, owner_org_id, assign_org_id, workforce_request_id, allocation_type,
                                start_datetime, expected_end_datetime, actual_end_datetime, status, created_at, daily_contract_id, source, locked)
SELECT aid, eid, owner_org, assign_org, NULL, a_type, st, en, CASE WHEN done = 1 THEN en END, CASE WHEN done = 1 THEN 'Completed' ELSE 'Active' END, st, daily,
       CASE WHEN owner_org <> assign_org THEN 'Loan' END, 0
FROM #a;

-- the two lent employees are loans (migration 025): the owner can recall them
INSERT dbo.Employee_Loan (emp_id, lender_org_id, borrower_org_id, borrower_allocation_id, status, lent_at, expected_return_at)
SELECT eid, owner_org, assign_org, aid, 'Lent', st, en FROM #a WHERE done = 0 AND owner_org <> assign_org;

-- ---------------------------------------------------------------- reviews: every finished allocation, and some of today's. Ratings 3 to 5.
INSERT dbo.Organization_Reviews (review_id, org_id, emp_id, allocation_id, ratings, comments, review_date, status)
SELECT @rev + ROW_NUMBER() OVER (ORDER BY a.aid), a.assign_org, a.eid, a.aid,
       CASE WHEN a.n % 5 >= 4 THEN 4 + ABS(CHECKSUM(a.aid, 'r')) % 2
            WHEN a.n % 5 <= 1 THEN 3 + ABS(CHECKSUM(a.aid, 'r')) % 2
            ELSE 3 + ABS(CHECKSUM(a.aid, 'r')) % 3 END,
       CHOOSE(a.aid % 8 + 1, 'Excellent work', 'Very polite with customers', 'Solved the problems quickly', 'Good, but a little slow',
              'Always on time', 'Needs more product knowledge', 'Great team player', 'Handled hard calls calmly'),
       CASE WHEN a.done = 1 THEN DATEADD(HOUR, 1, a.en) ELSE DATEADD(MINUTE, -30, @now) END, 'New'
FROM #a a WHERE a.done = 1 OR a.n % 3 = 0;

-- the rating of each demo employee is the average of the reviews above
UPDATE x SET rating = r.avg_rating
FROM dbo.Employee x
JOIN (SELECT emp_id, CAST(AVG(ratings) AS DECIMAL(4, 2)) avg_rating FROM dbo.Organization_Reviews WHERE review_id > @rev GROUP BY emp_id) r ON r.emp_id = x.emp_id;

-- ---------------------------------------------------------------- 300 calls in the last 14 days (employee <-> organization, employee <-> manager)
INSERT dbo.Call_Session (caller_type, caller_id, callee_type, callee_id, media, status, created_at, answered_at, ended_at, ended_by_type, ended_by_id, end_reason)
SELECT c.caller_type, c.caller_id, c.callee_type, c.callee_id, CASE WHEN c.i % 4 = 0 THEN 'video' ELSE 'audio' END, c.status, c.created_at,
       CASE WHEN c.status = 'Ended' THEN DATEADD(SECOND, 8 + c.i % 15, c.created_at) END,
       CASE WHEN c.status = 'Ended' THEN DATEADD(SECOND, 8 + c.i % 15 + 60 + ABS(CHECKSUM(c.i, 'd')) % 840, c.created_at)
            ELSE DATEADD(SECOND, 30, c.created_at) END,
       CASE WHEN c.status = 'Ended' THEN c.caller_type END, CASE WHEN c.status = 'Ended' THEN c.caller_id END,
       CASE c.status WHEN 'Ended' THEN 'Call ended' WHEN 'Missed' THEN 'Nobody answered' ELSE 'Declined' END
FROM (
    SELECT n.i,
           CASE WHEN n.i % 3 = 2 THEN 'Organization' ELSE 'Employee' END AS caller_type,
           CASE WHEN n.i % 3 = 2 THEN e.orgid ELSE e.uid END AS caller_id,
           CASE n.i % 3 WHEN 0 THEN 'Organization' WHEN 1 THEN 'Manager' ELSE 'Employee' END AS callee_type,
           CASE n.i % 3 WHEN 0 THEN e.orgid WHEN 1 THEN @usr + e.k + 1 ELSE e.uid END AS callee_id,
           CASE WHEN n.i % 10 = 0 THEN 'Missed' WHEN n.i % 10 = 5 THEN 'Declined' ELSE 'Ended' END AS status,
           DATEADD(MINUTE, -(ABS(CHECKSUM(n.i, 'c')) % (14 * 24 * 60)), @now) AS created_at
    FROM #n n JOIN #e e ON e.n = (n.i * 7) % 60 + 1
) c;

COMMIT;

PRINT 'Demo data added: 10 organizations, 10 managers, 2 business owners, 60 employees. Password of every demo account: Ali@12345';

DROP TABLE #n, #org, #sk, #fn, #ln, #e, #r, #a;
GO
