-- Migration 016: changes to an approved contract, asked for by the organization
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 015).
-- Contract_Modification_Request (migration 002) is extended so an ORGANIZATION (not a user) can ask for a change of its approved contract:
-- the new daily times and billing cycle, the organization that asked, the date the change should start, and when it was applied.
-- The hourly rates are never part of a request: they are fixed.

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Contract_Modification_Request', 'requested_by_org_id') IS NULL
    ALTER TABLE dbo.Contract_Modification_Request ADD requested_by_org_id INT NULL;
GO
IF COL_LENGTH('dbo.Contract_Modification_Request', 'proposed_start_time') IS NULL
    ALTER TABLE dbo.Contract_Modification_Request ADD proposed_start_time TIME NULL;
GO
IF COL_LENGTH('dbo.Contract_Modification_Request', 'proposed_end_time') IS NULL
    ALTER TABLE dbo.Contract_Modification_Request ADD proposed_end_time TIME NULL;
GO
IF COL_LENGTH('dbo.Contract_Modification_Request', 'proposed_billing_cycle') IS NULL
    ALTER TABLE dbo.Contract_Modification_Request ADD proposed_billing_cycle VARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.Contract_Modification_Request', 'effective_date') IS NULL
    ALTER TABLE dbo.Contract_Modification_Request ADD effective_date DATE NULL;      -- the change starts on this day (NULL = as soon as the admin approves)
GO
IF COL_LENGTH('dbo.Contract_Modification_Request', 'applied_at') IS NULL
    ALTER TABLE dbo.Contract_Modification_Request ADD applied_at DATETIME NULL;      -- when the new version was put in force
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Contract_Mod_Organization')
    ALTER TABLE dbo.Contract_Modification_Request
        ADD CONSTRAINT FK_Contract_Mod_Organization FOREIGN KEY (requested_by_org_id) REFERENCES dbo.Organization (org_id);
GO
