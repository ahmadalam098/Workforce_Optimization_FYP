-- Migration 026: the AI asks the employee first (assignment offers), and AI decisions remember their offer
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB (after 025).
-- The backend also creates these columns by itself when it starts (Services/Ai/AiSchema.cs), so a database without this migration keeps working.
--
--   Autopilot_Setting.ask_employees - 1 (default): the AI sends the chosen employee an offer and places them only when they accept.
--                                     0: the AI places the employee at once (the employee is told).
--   AI_Decision.offer_id            - the offer the AI sent for this decision (status Offered / Declined / Expired).

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.Autopilot_Setting', 'ask_employees') IS NULL
    ALTER TABLE dbo.Autopilot_Setting ADD ask_employees BIT NOT NULL CONSTRAINT DF_Autopilot_Setting_ask DEFAULT 1;
GO
IF COL_LENGTH('dbo.AI_Decision', 'offer_id') IS NULL
    ALTER TABLE dbo.AI_Decision ADD offer_id INT NULL;
GO
