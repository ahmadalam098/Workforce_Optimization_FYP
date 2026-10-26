-- Migration 024: company expenses, profit sent to the business owners, and the balance sheet
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 023).
--
-- Salaries and payroll are no longer part of the system. The only money going out is an EXPENSE the admin writes down (an amount and, if wanted,
-- a description). What the organizations paid, minus the expenses, is the profit; the admin sends it to the business owners, shared equally.
--   Company_Expense  - one expense (PKR). Written once; it can be voided only until the next settlement.
--   Owner_Settlement - one "send to the owners" action: how much was sent, for which balance.
--   Owner_Payout     - one owner's share of a settlement (this is what the owner gets a receipt and a notification for).
-- The balance sheet is calculated from Invoice_Payment (received, in PKR), Company_Expense and Owner_Payout. Nothing here is stored twice.
-- The old tables (Salary_Structure, Payroll_Run, Payroll_Item, Employee_Bank) are left in the database untouched; the application no longer reads them.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Company_Expense', 'U') IS NULL
CREATE TABLE dbo.Company_Expense
(
    expense_id INT IDENTITY(1,1) PRIMARY KEY,
    expense_date DATE NOT NULL,
    amount_pkr DECIMAL(14,2) NOT NULL CHECK (amount_pkr > 0),
    description NVARCHAR(255) NULL,                 -- optional: what the money was spent on
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    voided_at DATETIME NULL,
    voided_by INT NULL,
    void_reason NVARCHAR(255) NULL
);
GO

IF OBJECT_ID('dbo.Owner_Settlement', 'U') IS NULL
CREATE TABLE dbo.Owner_Settlement
(
    settlement_id INT IDENTITY(1,1) PRIMARY KEY,
    settled_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    period_year INT NOT NULL,                       -- the month it was sent in (for the receipt: "Profit share, October 2026")
    period_month INT NOT NULL,
    amount_pkr DECIMAL(14,2) NOT NULL CHECK (amount_pkr > 0),   -- everything that was sent, to all owners together
    received_pkr DECIMAL(14,2) NOT NULL,            -- what the organizations had paid in total at that moment
    expenses_pkr DECIMAL(14,2) NOT NULL,            -- what the expenses were in total at that moment
    previously_sent_pkr DECIMAL(14,2) NOT NULL,     -- what had been sent to the owners before
    owner_count INT NOT NULL,
    note NVARCHAR(255) NULL,
    settled_by INT NULL
);
GO

IF OBJECT_ID('dbo.Owner_Payout', 'U') IS NULL
CREATE TABLE dbo.Owner_Payout
(
    payout_id INT IDENTITY(1,1) PRIMARY KEY,
    settlement_id INT NOT NULL,
    owner_user_id INT NOT NULL,
    amount_pkr DECIMAL(14,2) NOT NULL CHECK (amount_pkr > 0),
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Owner_Payout_Settlement')
    ALTER TABLE dbo.Owner_Payout ADD CONSTRAINT FK_Owner_Payout_Settlement FOREIGN KEY (settlement_id) REFERENCES dbo.Owner_Settlement (settlement_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Owner_Payout_Owner')
    ALTER TABLE dbo.Owner_Payout ADD CONSTRAINT FK_Owner_Payout_Owner FOREIGN KEY (owner_user_id) REFERENCES dbo.[User] (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Owner_Payout_owner')
    CREATE INDEX IX_Owner_Payout_owner ON dbo.Owner_Payout (owner_user_id, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Company_Expense_date')
    CREATE INDEX IX_Company_Expense_date ON dbo.Company_Expense (expense_date);
GO
