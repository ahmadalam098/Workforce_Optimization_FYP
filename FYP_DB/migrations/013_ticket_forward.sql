-- Migration 013: An Organization Manager can forward a query / complaint of their organization to the admin
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after migration 006).
-- Only nullable columns are added to Ticket; nothing existing changes.

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Ticket', 'forwarded_at') IS NULL
BEGIN
    ALTER TABLE dbo.Ticket ADD forwarded_at DATETIME NULL, forwarded_by INT NULL, forward_note VARCHAR(500) NULL;
    EXEC('ALTER TABLE dbo.Ticket ADD CONSTRAINT FK_Ticket_forwarded_by FOREIGN KEY (forwarded_by) REFERENCES dbo.[User](user_id)');
END
GO
