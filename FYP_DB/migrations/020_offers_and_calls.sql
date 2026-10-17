-- Migration 020: assignment offers (manager -> employee) and audio / video call sessions
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 019).
-- Assignment_Offer: the organization manager forwards an organization's requirement to employees of the pool; the employee accepts or declines.
-- Call_Session: one audio or video call between two of {employee, organization, organization manager}. The media itself (WebRTC) is not
-- implemented yet: this table, the signalling in FYP_CHAT and the call screens are the part that stays when WebRTC is plugged in.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Assignment_Offer', 'U') IS NULL
CREATE TABLE dbo.Assignment_Offer
(
    offer_id INT IDENTITY(1,1) PRIMARY KEY,
    kind VARCHAR(10) NOT NULL,                  -- Request (extra employees for a staff request) | Minimum (minimum staff of a contract)
    workforce_request_id INT NULL,
    contract_id INT NULL,
    org_id INT NOT NULL,
    emp_id INT NOT NULL,
    offered_by_user_id INT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'Pending',   -- Pending | Accepted | Declined | Cancelled | Expired | Failed
    note VARCHAR(255) NULL,                     -- the employee's reason for declining, or why accepting failed
    allocation_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    responded_at DATETIME NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Offer_Employee')
    CREATE INDEX IX_Offer_Employee ON dbo.Assignment_Offer (emp_id, status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Offer_Org')
    CREATE INDEX IX_Offer_Org ON dbo.Assignment_Offer (org_id, status);
GO

IF OBJECT_ID('dbo.Call_Session', 'U') IS NULL
CREATE TABLE dbo.Call_Session
(
    call_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    caller_type VARCHAR(12) NOT NULL,           -- Employee | Manager | Organization
    caller_id INT NOT NULL,                     -- user id (Employee, Manager) or org id (Organization)
    callee_type VARCHAR(12) NOT NULL,
    callee_id INT NOT NULL,
    media VARCHAR(5) NOT NULL,                  -- audio | video
    status VARCHAR(12) NOT NULL DEFAULT 'Ringing',   -- Ringing | Active | Declined | Missed | Cancelled | Ended | Cut
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    answered_at DATETIME NULL,
    ended_at DATETIME NULL,
    ended_by_type VARCHAR(12) NULL,
    ended_by_id INT NULL,
    end_reason VARCHAR(255) NULL                -- for Cut: why the organization manager cut the call
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Call_Status')
    CREATE INDEX IX_Call_Status ON dbo.Call_Session (status, created_at);
GO
