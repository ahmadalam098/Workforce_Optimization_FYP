-- Migration 021: payment submissions (organization -> manager -> admin) and employee bank details
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 020).
-- Payment_Submission: an organization tells the company that it paid an invoice (amount, method, reference, proof file). The organization
-- manager verifies it, the admin approves it - only then a real Invoice_Payment (and its receipt) is created.
-- Employee_Bank: where an employee's salary is paid (used by the payroll sheet).
-- Receipt, payslip and statement numbers are derived from existing ids, so they need no table.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Payment_Submission', 'U') IS NULL
CREATE TABLE dbo.Payment_Submission
(
    submission_id INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id INT NOT NULL,
    org_id INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    method VARCHAR(30) NOT NULL,
    reference VARCHAR(100) NULL,
    paid_on DATE NOT NULL,
    note VARCHAR(255) NULL,
    proof_path VARCHAR(260) NULL,               -- the uploaded proof (image or PDF), kept outside the web folder
    proof_name VARCHAR(150) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'Pending',   -- Pending | Verified | Approved | Rejected | Withdrawn
    submitted_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    verified_by INT NULL,
    verified_at DATETIME NULL,
    decided_by INT NULL,
    decided_at DATETIME NULL,
    decision_note VARCHAR(255) NULL,
    payment_id INT NULL                         -- the payment created when the admin approved it
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Submission_Invoice')
    ALTER TABLE dbo.Payment_Submission ADD CONSTRAINT FK_Submission_Invoice FOREIGN KEY (invoice_id) REFERENCES dbo.Invoice (invoice_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Submission_Organization')
    ALTER TABLE dbo.Payment_Submission ADD CONSTRAINT FK_Submission_Organization FOREIGN KEY (org_id) REFERENCES dbo.Organization (org_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Submission_Status')
    CREATE INDEX IX_Submission_Status ON dbo.Payment_Submission (status, org_id);
GO

IF OBJECT_ID('dbo.Employee_Bank', 'U') IS NULL
CREATE TABLE dbo.Employee_Bank
(
    emp_id INT NOT NULL PRIMARY KEY,
    bank_name VARCHAR(100) NOT NULL,
    account_title VARCHAR(100) NOT NULL,
    account_number VARCHAR(40) NOT NULL,        -- account number or IBAN
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Employee_Bank_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee (emp_id)
);
GO
