-- Makes the demo staff requests (from ai_demo_data.sql) current again, for a new demo day.
-- The requests of the 10 demo organizations whose time is over (and that nobody staffed, rejected or cancelled) get a new time window:
-- from 30 minutes ago until 4 to 8 hours from now (UTC, like the backend), and wait for a decision again (Pending).
-- Only the demo requests are touched (demo organizations, demo reasons). Safe to run again and again.

USE WorkforceManagementDB;
GO

SET NOCOUNT ON;

UPDATE r
SET start_datetime = DATEADD(MINUTE, -30, GETUTCDATE()),
    end_datetime   = DATEADD(HOUR, 4 + r.workforce_request_id % 5, GETUTCDATE()),
    status         = 'Pending',
    created_at     = GETUTCDATE()
FROM dbo.Workforce_Request r
JOIN dbo.Organization o ON o.org_id = r.org_id
WHERE o.email LIKE '%@demo.workforce.com'
  AND r.reason IN ('Sudden rise in calls after an outage', 'Two agents on leave today', 'New campaign launched this morning', 'Peak hours need extra agents')
  AND r.end_datetime <= GETUTCDATE()
  AND r.status IN ('Pending', 'Approved')
  AND NOT EXISTS (SELECT 1 FROM dbo.Employee_Allocation a WHERE a.workforce_request_id = r.workforce_request_id AND a.actual_end_datetime IS NULL);

PRINT CONCAT('Demo requests made current again: ', @@ROWCOUNT);
GO
