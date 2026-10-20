-- Migration 022: online payments (pay an invoice through a payment gateway)
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 021).
-- Online_Payment: one attempt of an organization to pay an invoice through the gateway. For now the gateway is a DEMO one (no real money);
-- a real gateway (JazzCash, Easypaisa, PayFast, Stripe ...) plugs in behind the same table and flow.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Online_Payment', 'U') IS NULL
CREATE TABLE dbo.Online_Payment
(
    online_payment_id INT IDENTITY(1,1) PRIMARY KEY,
    token VARCHAR(40) NOT NULL,                 -- the secret that identifies the checkout (also the gateway's order reference)
    invoice_id INT NOT NULL,
    org_id INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    provider VARCHAR(20) NOT NULL,              -- Demo | (later) the real gateway
    status VARCHAR(12) NOT NULL DEFAULT 'Created',   -- Created | Paid | Failed | Cancelled | Expired
    gateway_reference VARCHAR(60) NULL,         -- the gateway's transaction id
    failure_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    completed_at DATETIME NULL,
    payment_id INT NULL                         -- the payment recorded on the invoice when it was paid
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Online_Payment_token')
    CREATE UNIQUE INDEX UX_Online_Payment_token ON dbo.Online_Payment (token);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Online_Payment_Invoice')
    ALTER TABLE dbo.Online_Payment ADD CONSTRAINT FK_Online_Payment_Invoice FOREIGN KEY (invoice_id) REFERENCES dbo.Invoice (invoice_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Online_Payment_Organization')
    ALTER TABLE dbo.Online_Payment ADD CONSTRAINT FK_Online_Payment_Organization FOREIGN KEY (org_id) REFERENCES dbo.Organization (org_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Online_Payment_invoice')
    CREATE INDEX IX_Online_Payment_invoice ON dbo.Online_Payment (invoice_id, status);
GO
