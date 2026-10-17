-- Migration 015: Daily contracts
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 014).
-- A contract whose billing cycle is "Daily" gets its minimum employees appointed every day. The employees appointed that way are
-- marked with the contract in Employee_Allocation.daily_contract_id, so the system can end them at the end of the day's window and
-- appoint the minimum again the next day. (Employees added through staff requests are not marked: they are the extra employees.)

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Employee_Allocation', 'daily_contract_id') IS NULL
BEGIN
    ALTER TABLE dbo.Employee_Allocation ADD daily_contract_id INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Employee_Allocation_DailyContract')
BEGIN
    ALTER TABLE dbo.Employee_Allocation
        ADD CONSTRAINT FK_Employee_Allocation_DailyContract FOREIGN KEY (daily_contract_id) REFERENCES dbo.Contract (contract_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Employee_Allocation_daily_contract' AND object_id = OBJECT_ID('dbo.Employee_Allocation'))
BEGIN
    CREATE INDEX IX_Employee_Allocation_daily_contract ON dbo.Employee_Allocation (daily_contract_id);
END
GO
