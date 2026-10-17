-- Migration 019: organization Settings (notification choices and sign-in times)
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 018).
-- An organization is not a user, so it has its own settings row (like Manager_Notification_Pref + User_Login for a manager).

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Organization_Settings', 'U') IS NULL
CREATE TABLE dbo.Organization_Settings
(
    org_id INT NOT NULL PRIMARY KEY,
    in_app BIT NOT NULL DEFAULT 1,
    notify_contracts BIT NOT NULL DEFAULT 1,
    notify_requests BIT NOT NULL DEFAULT 1,
    notify_employees BIT NOT NULL DEFAULT 1,
    notify_invoices BIT NOT NULL DEFAULT 1,
    notify_chat BIT NOT NULL DEFAULT 1,
    notify_expiry BIT NOT NULL DEFAULT 1,
    expiry_days INT NULL,                         -- NULL = the admin's system value
    last_login_at DATETIME NULL,
    previous_login_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Org_Settings_Org FOREIGN KEY (org_id) REFERENCES dbo.Organization (org_id)
);
GO
