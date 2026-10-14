-- Migration 005: Billing - exchange rates, payment rules, salary structures, payroll, invoices and payments
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- Existing tables (Overtime, Contract, Employee_Allocation, ...) are NOT changed.

USE WorkforceManagementDB;
GO

-- Required for the filtered unique index on invoice numbers (SSMS has these ON by default; sqlcmd does not).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Money is always stored with its currency. Rates convert one currency to another (e.g. USD -> PKR).
IF OBJECT_ID('dbo.Exchange_Rate', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Exchange_Rate
    (
        rate_id        INT IDENTITY(1,1) PRIMARY KEY,
        from_currency  VARCHAR(10)    NOT NULL,
        to_currency    VARCHAR(10)    NOT NULL,
        rate           DECIMAL(18,6)  NOT NULL,
        effective_date DATE           NOT NULL,
        created_by     INT            NULL,
        created_at     DATETIME       NOT NULL CONSTRAINT DF_Exchange_Rate_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT CK_Exchange_Rate_positive CHECK (rate > 0),
        CONSTRAINT UQ_Exchange_Rate UNIQUE (from_currency, to_currency, effective_date),
        CONSTRAINT FK_Exchange_Rate_User FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id)
    );
END
GO

-- System-wide payment rules (invoice due days, overtime multiplier, ...). The seeded ones are marked is_system.
IF OBJECT_ID('dbo.Payment_Rule', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Payment_Rule
    (
        rule_id     INT IDENTITY(1,1) PRIMARY KEY,
        rule_key    VARCHAR(50)    NOT NULL,
        title       VARCHAR(150)   NOT NULL,
        rule_value  DECIMAL(18,4)  NOT NULL,
        unit        VARCHAR(30)    NULL,
        description VARCHAR(255)   NULL,
        is_system   BIT            NOT NULL CONSTRAINT DF_Payment_Rule_system DEFAULT (0),
        is_active   BIT            NOT NULL CONSTRAINT DF_Payment_Rule_active DEFAULT (1),
        updated_by  INT            NULL,
        updated_at  DATETIME       NULL,
        CONSTRAINT UQ_Payment_Rule_key UNIQUE (rule_key),
        CONSTRAINT FK_Payment_Rule_User FOREIGN KEY (updated_by) REFERENCES dbo.[User](user_id)
    );
END
GO

INSERT INTO dbo.Payment_Rule (rule_key, title, rule_value, unit, description, is_system)
SELECT v.rule_key, v.title, v.rule_value, v.unit, v.description, 1
FROM (VALUES
    ('INVOICE_DUE_DAYS',        'Invoice due after',           15,   'days',          'Days between issuing an invoice and its due date.'),
    ('LATE_FEE_PERCENT',        'Late payment fee',            2,    '%',             'Information for organizations: fee on overdue invoices.'),
    ('OVERTIME_MULTIPLIER',     'Overtime pay multiplier',     1.5,  'x',             'Overtime hour = hourly salary x this multiplier (when no fixed overtime rate is set).'),
    ('WORKING_HOURS_PER_MONTH', 'Working hours per month',     208,  'hours',         'Used to turn a monthly salary into an hourly salary.'),
    ('PAYROLL_PAY_DAY',         'Salary pay day',              28,   'day of month',  'Day of the month salaries are paid.')
) AS v(rule_key, title, rule_value, unit, description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Payment_Rule r WHERE r.rule_key = v.rule_key);
GO

-- What the company pays an employee: monthly salary (+ optional fixed overtime rate). Dated, so history is kept.
IF OBJECT_ID('dbo.Salary_Structure', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Salary_Structure
    (
        structure_id   INT IDENTITY(1,1) PRIMARY KEY,
        emp_id         INT            NOT NULL,
        monthly_salary DECIMAL(12,2)  NOT NULL,
        currency       VARCHAR(10)    NOT NULL CONSTRAINT DF_Salary_Structure_currency DEFAULT ('PKR'),
        overtime_rate  DECIMAL(10,2)  NULL,      -- per hour; NULL = salary / working hours x overtime multiplier
        effective_from DATE           NOT NULL,
        effective_to   DATE           NULL,      -- NULL = current
        notes          VARCHAR(255)   NULL,
        created_by     INT            NULL,
        created_at     DATETIME       NOT NULL CONSTRAINT DF_Salary_Structure_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT CK_Salary_Structure_salary CHECK (monthly_salary >= 0),
        CONSTRAINT FK_Salary_Structure_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee(emp_id),
        CONSTRAINT FK_Salary_Structure_User FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Salary_Structure_emp ON dbo.Salary_Structure (emp_id, effective_to);
END
GO

-- One payroll run per month: Draft -> Approved -> Paid.
IF OBJECT_ID('dbo.Payroll_Run', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Payroll_Run
    (
        payroll_id   INT IDENTITY(1,1) PRIMARY KEY,
        period_year  INT            NOT NULL,
        period_month INT            NOT NULL,
        status       VARCHAR(20)    NOT NULL CONSTRAINT DF_Payroll_Run_status DEFAULT ('Draft'),
        total_pkr    DECIMAL(14,2)  NOT NULL CONSTRAINT DF_Payroll_Run_total DEFAULT (0),
        notes        VARCHAR(255)   NULL,
        created_by   INT            NULL,
        created_at   DATETIME       NOT NULL CONSTRAINT DF_Payroll_Run_created_at DEFAULT (GETUTCDATE()),
        approved_by  INT            NULL,
        approved_at  DATETIME       NULL,
        paid_by      INT            NULL,
        paid_at      DATETIME       NULL,
        CONSTRAINT UQ_Payroll_Run_period UNIQUE (period_year, period_month),
        CONSTRAINT CK_Payroll_Run_month CHECK (period_month BETWEEN 1 AND 12),
        CONSTRAINT FK_Payroll_Run_CreatedBy FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id),
        CONSTRAINT FK_Payroll_Run_ApprovedBy FOREIGN KEY (approved_by) REFERENCES dbo.[User](user_id),
        CONSTRAINT FK_Payroll_Run_PaidBy FOREIGN KEY (paid_by) REFERENCES dbo.[User](user_id)
    );
END
GO

IF OBJECT_ID('dbo.Payroll_Item', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Payroll_Item
    (
        item_id         INT IDENTITY(1,1) PRIMARY KEY,
        payroll_id      INT            NOT NULL,
        emp_id          INT            NOT NULL,
        currency        VARCHAR(10)    NOT NULL,
        exchange_rate   DECIMAL(18,6)  NOT NULL CONSTRAINT DF_Payroll_Item_rate DEFAULT (1),   -- currency -> PKR
        base_salary     DECIMAL(12,2)  NOT NULL,
        overtime_hours  DECIMAL(8,2)   NOT NULL CONSTRAINT DF_Payroll_Item_ot_hours DEFAULT (0),
        overtime_amount DECIMAL(12,2)  NOT NULL CONSTRAINT DF_Payroll_Item_ot_amount DEFAULT (0),
        adjustment      DECIMAL(12,2)  NOT NULL CONSTRAINT DF_Payroll_Item_adjustment DEFAULT (0),
        adjustment_note VARCHAR(255)   NULL,
        total_amount    DECIMAL(12,2)  NOT NULL,
        total_pkr       DECIMAL(14,2)  NOT NULL,
        CONSTRAINT FK_Payroll_Item_Run FOREIGN KEY (payroll_id) REFERENCES dbo.Payroll_Run(payroll_id),
        CONSTRAINT FK_Payroll_Item_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee(emp_id),
        CONSTRAINT UQ_Payroll_Item UNIQUE (payroll_id, emp_id)
    );
END
GO

-- What an organization pays the company. Draft -> Issued -> Paid (or Cancelled). Overdue / partly paid are worked out when reading.
IF OBJECT_ID('dbo.Invoice', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Invoice
    (
        invoice_id     INT IDENTITY(1,1) PRIMARY KEY,
        invoice_number VARCHAR(30)    NULL,
        org_id         INT            NOT NULL,
        contract_id    INT            NULL,
        period_start   DATE           NOT NULL,
        period_end     DATE           NOT NULL,
        currency       VARCHAR(10)    NOT NULL,
        total_amount   DECIMAL(14,2)  NOT NULL CONSTRAINT DF_Invoice_total DEFAULT (0),
        paid_amount    DECIMAL(14,2)  NOT NULL CONSTRAINT DF_Invoice_paid DEFAULT (0),
        status         VARCHAR(20)    NOT NULL CONSTRAINT DF_Invoice_status DEFAULT ('Draft'),
        issue_date     DATE           NULL,
        due_date       DATE           NULL,
        notes          VARCHAR(500)   NULL,
        cancel_reason  VARCHAR(255)   NULL,
        created_by     INT            NULL,
        created_at     DATETIME       NOT NULL CONSTRAINT DF_Invoice_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT CK_Invoice_period CHECK (period_end >= period_start),
        CONSTRAINT FK_Invoice_Organization FOREIGN KEY (org_id) REFERENCES dbo.Organization(org_id),
        CONSTRAINT FK_Invoice_Contract FOREIGN KEY (contract_id) REFERENCES dbo.Contract(contract_id),
        CONSTRAINT FK_Invoice_User FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Invoice_org ON dbo.Invoice (org_id, period_start);
    CREATE INDEX IX_Invoice_status ON dbo.Invoice (status, due_date);
END
GO

-- Invoice numbers are unique once assigned (separate step so a missing index is repaired by running the script again).
IF OBJECT_ID('dbo.Invoice', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Invoice_number' AND object_id = OBJECT_ID('dbo.Invoice'))
BEGIN
    CREATE UNIQUE INDEX UX_Invoice_number ON dbo.Invoice (invoice_number) WHERE invoice_number IS NOT NULL;
END
GO

IF OBJECT_ID('dbo.Invoice_Line', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Invoice_Line
    (
        line_id     INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id  INT            NOT NULL,
        line_type   VARCHAR(20)    NOT NULL,   -- Base / Extra / Adjustment
        description VARCHAR(255)   NOT NULL,
        quantity    DECIMAL(12,2)  NOT NULL,   -- employee-hours
        unit_rate   DECIMAL(10,2)  NOT NULL,
        amount      DECIMAL(14,2)  NOT NULL,
        CONSTRAINT FK_Invoice_Line_Invoice FOREIGN KEY (invoice_id) REFERENCES dbo.Invoice(invoice_id)
    );
    CREATE INDEX IX_Invoice_Line_invoice ON dbo.Invoice_Line (invoice_id);
END
GO

-- Money received for an invoice. exchange_rate converts the payment currency to PKR at the time of payment.
IF OBJECT_ID('dbo.Invoice_Payment', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Invoice_Payment
    (
        payment_id    INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id    INT            NOT NULL,
        amount        DECIMAL(14,2)  NOT NULL,
        currency      VARCHAR(10)    NOT NULL,
        exchange_rate DECIMAL(18,6)  NOT NULL CONSTRAINT DF_Invoice_Payment_rate DEFAULT (1),
        amount_pkr    DECIMAL(14,2)  NOT NULL,
        paid_at       DATETIME       NOT NULL,
        method        VARCHAR(30)    NULL,
        reference     VARCHAR(100)   NULL,
        notes         VARCHAR(255)   NULL,
        recorded_by   INT            NULL,
        created_at    DATETIME       NOT NULL CONSTRAINT DF_Invoice_Payment_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT CK_Invoice_Payment_amount CHECK (amount > 0),
        CONSTRAINT FK_Invoice_Payment_Invoice FOREIGN KEY (invoice_id) REFERENCES dbo.Invoice(invoice_id),
        CONSTRAINT FK_Invoice_Payment_User FOREIGN KEY (recorded_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Invoice_Payment_invoice ON dbo.Invoice_Payment (invoice_id);
    CREATE INDEX IX_Invoice_Payment_paid_at ON dbo.Invoice_Payment (paid_at);
END
GO
