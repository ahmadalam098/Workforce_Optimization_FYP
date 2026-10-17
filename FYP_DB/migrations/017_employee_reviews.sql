-- Migration 017: organizations review the employees who work for them; the organization manager acts on bad reviews
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 016).
-- Organization_Reviews (existing table) gets a handling status. Employee_Warning stores the warnings a manager gives for a review.
-- Review_Escalation is the manager's request to the admin to take action about an employee (the admin decides).

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Organization_Reviews', 'status') IS NULL
    ALTER TABLE dbo.Organization_Reviews ADD status VARCHAR(20) NULL;            -- New | Warned | Escalated | Dismissed | Resolved
GO
IF COL_LENGTH('dbo.Organization_Reviews', 'handled_by_user_id') IS NULL
    ALTER TABLE dbo.Organization_Reviews ADD handled_by_user_id INT NULL;
GO
IF COL_LENGTH('dbo.Organization_Reviews', 'handled_at') IS NULL
    ALTER TABLE dbo.Organization_Reviews ADD handled_at DATETIME NULL;
GO
IF COL_LENGTH('dbo.Organization_Reviews', 'handled_note') IS NULL
    ALTER TABLE dbo.Organization_Reviews ADD handled_note VARCHAR(500) NULL;
GO

IF OBJECT_ID('dbo.Employee_Warning', 'U') IS NULL
CREATE TABLE dbo.Employee_Warning
(
    warning_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_id INT NOT NULL,
    review_id INT NULL,
    issued_by_user_id INT NULL,
    issued_by_role VARCHAR(20) NOT NULL,        -- Manager | Admin
    message VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE()
);
GO

IF OBJECT_ID('dbo.Review_Escalation', 'U') IS NULL
CREATE TABLE dbo.Review_Escalation
(
    escalation_id INT IDENTITY(1,1) PRIMARY KEY,
    review_id INT NOT NULL,
    emp_id INT NOT NULL,
    requested_by_user_id INT NULL,
    note VARCHAR(500) NOT NULL,                 -- why the manager asks the admin to act
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',   -- Pending | Decided
    admin_action VARCHAR(20) NULL,              -- Deactivate | Warn | Dismiss
    admin_response VARCHAR(500) NULL,
    decided_by_user_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    decided_at DATETIME NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Warning_Employee')
    ALTER TABLE dbo.Employee_Warning ADD CONSTRAINT FK_Warning_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee (emp_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Escalation_Review')
    ALTER TABLE dbo.Review_Escalation ADD CONSTRAINT FK_Escalation_Review FOREIGN KEY (review_id) REFERENCES dbo.Organization_Reviews (review_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Escalation_Employee')
    ALTER TABLE dbo.Review_Escalation ADD CONSTRAINT FK_Escalation_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee (emp_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reviews_Employee')
    CREATE INDEX IX_Reviews_Employee ON dbo.Organization_Reviews (emp_id, org_id);
GO
