-- Migration 018: the organization's notification bell remembers what it has read
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 017).
-- Notification_State belongs to users; an organization is not a user, so it gets its own small table.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Organization_Notification_State', 'U') IS NULL
CREATE TABLE dbo.Organization_Notification_State
(
    org_id INT NOT NULL PRIMARY KEY,
    last_read_audit_id INT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Org_Notification_State_Org FOREIGN KEY (org_id) REFERENCES dbo.Organization (org_id)
);
GO
