-- Migration 011: Organization Manager verification of invoices and payments
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after migration 005).
-- An Organization Manager checks the invoices and payments of the organizations they manage and marks them as verified.
-- Nothing existing is changed: only nullable columns are added.

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Invoice', 'verified_at') IS NULL
BEGIN
    ALTER TABLE dbo.Invoice ADD verified_at DATETIME NULL, verified_by INT NULL;
    EXEC('ALTER TABLE dbo.Invoice ADD CONSTRAINT FK_Invoice_verified_by FOREIGN KEY (verified_by) REFERENCES dbo.[User](user_id)');
END
GO

IF COL_LENGTH('dbo.Invoice_Payment', 'verified_at') IS NULL
BEGIN
    ALTER TABLE dbo.Invoice_Payment ADD verified_at DATETIME NULL, verified_by INT NULL;
    EXEC('ALTER TABLE dbo.Invoice_Payment ADD CONSTRAINT FK_Invoice_Payment_verified_by FOREIGN KEY (verified_by) REFERENCES dbo.[User](user_id)');
END
GO
