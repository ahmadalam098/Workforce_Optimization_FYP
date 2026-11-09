-- Migration 025: AI autopilot, AI decisions and employee loans (with the 3-minute recall)
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 024).
--
--   Autopilot_Setting   - one row per organization: is the autopilot ON, when it last ran and what it did.
--   AI_Decision         - every choice the AI made (or suggested): who, for what, the score, the reason in words, the other good choices,
--                         and what happened to it (Suggested / Applied / Rejected / Undone / Failed). This is the "Why?" and the audit.
--   Employee_Loan       - an employee working for another organization: who lends, who borrows, and the recall deadline (3 minutes).
--   Employee_Allocation - two new columns: source (Manual / AI / Loan) and locked (the manager told the AI not to touch this assignment).
-- Nothing existing is changed: only new tables and nullable / defaulted columns.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Autopilot_Setting', 'U') IS NULL
CREATE TABLE dbo.Autopilot_Setting
(
    org_id INT NOT NULL PRIMARY KEY,
    enabled BIT NOT NULL DEFAULT 0,
    last_run_at DATETIME NULL,
    last_message NVARCHAR(500) NULL,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Autopilot_Setting_org FOREIGN KEY (org_id) REFERENCES dbo.Organization(org_id)
);
GO

IF OBJECT_ID('dbo.AI_Decision', 'U') IS NULL
CREATE TABLE dbo.AI_Decision
(
    decision_id INT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,                              -- the organization that gets the employee
    kind VARCHAR(12) NOT NULL,                        -- Minimum (the daily minimum) / Request (a staff request) / Substitute
    contract_id INT NULL,
    workforce_request_id INT NULL,
    emp_id INT NOT NULL,
    from_org_id INT NULL,                             -- the home organization of the employee
    score DECIMAL(5,2) NOT NULL,                      -- 0 - 100
    reason NVARCHAR(500) NOT NULL,                    -- "Why?" in words
    breakdown NVARCHAR(1000) NULL,                    -- the parts of the score as JSON
    alternatives NVARCHAR(1000) NULL,                 -- the next best choices as JSON
    status VARCHAR(12) NOT NULL,                      -- Suggested / Applied / Rejected / Undone / Failed
    planner VARCHAR(20) NOT NULL,                     -- which planner decided: "AI service" or "Built-in"
    trigger_by VARCHAR(12) NOT NULL,                  -- Autopilot / Manager
    allocation_id INT NULL,
    loan_id INT NULL,
    note NVARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    decided_at DATETIME NULL,
    decided_by INT NULL
);
CREATE INDEX IX_AI_Decision_org ON dbo.AI_Decision (org_id, created_at DESC);
GO

IF OBJECT_ID('dbo.Employee_Loan', 'U') IS NULL
CREATE TABLE dbo.Employee_Loan
(
    loan_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_id INT NOT NULL,
    lender_org_id INT NOT NULL,
    borrower_org_id INT NOT NULL,
    borrower_allocation_id INT NULL,                  -- the allocation at the borrower
    status VARCHAR(16) NOT NULL,                      -- Lent / RecallRequested / Returned
    lent_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    expected_return_at DATETIME NULL,
    recall_requested_at DATETIME NULL,
    recall_deadline DATETIME NULL,                    -- recall_requested_at + 3 minutes
    recall_reason NVARCHAR(255) NULL,
    substitute_emp_id INT NULL,                       -- who replaced the employee at the borrower, if anybody
    returned_at DATETIME NULL,
    decision_id INT NULL
);
CREATE INDEX IX_Employee_Loan_status ON dbo.Employee_Loan (status, recall_deadline);
GO

IF COL_LENGTH('dbo.Employee_Allocation', 'source') IS NULL
    ALTER TABLE dbo.Employee_Allocation ADD source VARCHAR(10) NULL;           -- Manual / AI / Loan (empty = Manual)
GO
IF COL_LENGTH('dbo.Employee_Allocation', 'locked') IS NULL
    ALTER TABLE dbo.Employee_Allocation ADD locked BIT NOT NULL CONSTRAINT DF_Employee_Allocation_locked DEFAULT 0;   -- the AI must not release or move it
GO
