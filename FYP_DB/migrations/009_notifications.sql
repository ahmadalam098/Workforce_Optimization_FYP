-- Migration 009: Notifications (the bell in the portal header)
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- The notifications themselves are the entries of Audit_Log (every important action already writes one).
-- This table only remembers, for each signed-in person, how far they have read.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Notification_State', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Notification_State
    (
        user_id            INT      NOT NULL PRIMARY KEY,
        last_read_audit_id INT      NOT NULL,     -- everything up to this Audit_Log entry has been read
        updated_at         DATETIME NOT NULL CONSTRAINT DF_Notification_State_updated_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Notification_State_user FOREIGN KEY (user_id) REFERENCES dbo.[User] (user_id)
    );
END
GO
