using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// Creates the AI tables and columns (migrations 025 and 026) when the backend starts, if they are missing. Every statement checks first,
    /// so it changes nothing on a database that already has them. Without this, a database where nobody ran 025 would break every allocation
    /// screen, because Employee_Allocation is read with its new columns (source, locked).
    /// </summary>
    public static class AiSchema
    {
        private static readonly string[] Statements =
        {
            @"IF OBJECT_ID('dbo.Autopilot_Setting', 'U') IS NULL
              CREATE TABLE dbo.Autopilot_Setting (
                org_id INT NOT NULL PRIMARY KEY,
                enabled BIT NOT NULL DEFAULT 0,
                last_run_at DATETIME NULL,
                last_message NVARCHAR(500) NULL,
                updated_by INT NULL,
                updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
                CONSTRAINT FK_Autopilot_Setting_org FOREIGN KEY (org_id) REFERENCES dbo.Organization(org_id))",
            @"IF OBJECT_ID('dbo.AI_Decision', 'U') IS NULL
              CREATE TABLE dbo.AI_Decision (
                decision_id INT IDENTITY(1,1) PRIMARY KEY,
                org_id INT NOT NULL, kind VARCHAR(12) NOT NULL, contract_id INT NULL, workforce_request_id INT NULL, emp_id INT NOT NULL,
                from_org_id INT NULL, score DECIMAL(5,2) NOT NULL, reason NVARCHAR(500) NOT NULL, breakdown NVARCHAR(1000) NULL,
                alternatives NVARCHAR(1000) NULL, status VARCHAR(12) NOT NULL, planner VARCHAR(20) NOT NULL, trigger_by VARCHAR(12) NOT NULL,
                allocation_id INT NULL, loan_id INT NULL, note NVARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
                decided_at DATETIME NULL, decided_by INT NULL)",
            @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AI_Decision_org')
              CREATE INDEX IX_AI_Decision_org ON dbo.AI_Decision (org_id, created_at DESC)",
            @"IF OBJECT_ID('dbo.Employee_Loan', 'U') IS NULL
              CREATE TABLE dbo.Employee_Loan (
                loan_id INT IDENTITY(1,1) PRIMARY KEY,
                emp_id INT NOT NULL, lender_org_id INT NOT NULL, borrower_org_id INT NOT NULL, borrower_allocation_id INT NULL,
                status VARCHAR(16) NOT NULL, lent_at DATETIME NOT NULL DEFAULT GETUTCDATE(), expected_return_at DATETIME NULL,
                recall_requested_at DATETIME NULL, recall_deadline DATETIME NULL, recall_reason NVARCHAR(255) NULL,
                substitute_emp_id INT NULL, returned_at DATETIME NULL, decision_id INT NULL)",
            @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Employee_Loan_status')
              CREATE INDEX IX_Employee_Loan_status ON dbo.Employee_Loan (status, recall_deadline)",
            @"IF COL_LENGTH('dbo.Employee_Allocation', 'source') IS NULL ALTER TABLE dbo.Employee_Allocation ADD source VARCHAR(10) NULL",
            @"IF COL_LENGTH('dbo.Employee_Allocation', 'locked') IS NULL
              ALTER TABLE dbo.Employee_Allocation ADD locked BIT NOT NULL CONSTRAINT DF_Employee_Allocation_locked DEFAULT 0",
            @"IF COL_LENGTH('dbo.Autopilot_Setting', 'ask_employees') IS NULL
              ALTER TABLE dbo.Autopilot_Setting ADD ask_employees BIT NOT NULL CONSTRAINT DF_Autopilot_Setting_ask DEFAULT 1",
            @"IF COL_LENGTH('dbo.AI_Decision', 'offer_id') IS NULL ALTER TABLE dbo.AI_Decision ADD offer_id INT NULL",
        };

        public static async Task EnsureAsync(WorkforceManagementDbContext db, ILogger logger)
        {
            try
            {
                foreach (var sql in Statements) await db.Database.ExecuteSqlRawAsync(sql);
            }
            catch (Exception ex)
            {
                // Not fatal: run FYP_DB/migrations/025 and 026 by hand. The AI screens say what is missing.
                logger.LogWarning(ex, "Could not create the AI tables by itself. Run FYP_DB/migrations/025_ai_autopilot.sql and 026_ai_employee_consent.sql.");
            }
        }
    }
}
