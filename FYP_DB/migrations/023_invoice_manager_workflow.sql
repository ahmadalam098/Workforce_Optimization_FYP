-- Migration 023: invoices are prepared by the organization manager and verified (issued) by the admin
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 011).
-- The manager creates a Draft invoice, edits it and SENDS it to the admin (submitted_at). The admin verifies and issues it
-- (verified_at / verified_by now mean "verified by the admin"), or sends it back with a reason (returned_reason).
-- Only nullable columns are added; nothing existing changes.

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Invoice', 'submitted_at') IS NULL
    ALTER TABLE dbo.Invoice ADD submitted_at DATETIME NULL, submitted_by INT NULL;
GO
IF COL_LENGTH('dbo.Invoice', 'returned_reason') IS NULL
    ALTER TABLE dbo.Invoice ADD returned_reason VARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Invoice_submitted_by')
    ALTER TABLE dbo.Invoice ADD CONSTRAINT FK_Invoice_submitted_by FOREIGN KEY (submitted_by) REFERENCES dbo.[User](user_id);
GO

-- Invoices that were already issued need no submission; drafts that exist today stay drafts for the manager to send.
