-- Migration 007: Workforce request reviews + system settings
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- The existing Workforce_Request table is not changed; decisions are kept in a new table.

USE WorkforceManagementDB;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Every decision on a workforce request (approve / reject / cancel) with the admin's note.
IF OBJECT_ID('dbo.Workforce_Request_Review', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Workforce_Request_Review
    (
        review_id            INT IDENTITY(1,1) PRIMARY KEY,
        workforce_request_id INT           NOT NULL,
        decision             VARCHAR(20)   NOT NULL,   -- Approved / Rejected / Cancelled
        note                 VARCHAR(500)  NULL,
        reviewed_by          INT           NULL,
        reviewed_at          DATETIME      NOT NULL CONSTRAINT DF_WRR_reviewed_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_WRR_request FOREIGN KEY (workforce_request_id) REFERENCES dbo.Workforce_Request (workforce_request_id),
        CONSTRAINT CK_WRR_decision CHECK (decision IN ('Approved', 'Rejected', 'Cancelled'))
    );
    CREATE INDEX IX_WRR_request ON dbo.Workforce_Request_Review (workforce_request_id);
END
GO

-- Admin-editable system settings. A key that has no row uses the default built into the system.
IF OBJECT_ID('dbo.System_Setting', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.System_Setting
    (
        setting_key   VARCHAR(60)  NOT NULL PRIMARY KEY,
        setting_value VARCHAR(200) NOT NULL,
        updated_by    INT          NULL,
        updated_at    DATETIME     NOT NULL CONSTRAINT DF_System_Setting_updated_at DEFAULT (GETUTCDATE())
    );
END
GO

-- The old required_skill_id column points at the per-employee Skills table, so it cannot hold a skill from the
-- skill catalog. The skill a request asks for is kept here instead (the old column stays empty).
IF OBJECT_ID('dbo.Workforce_Request_Skill', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Workforce_Request_Skill
    (
        workforce_request_id INT NOT NULL PRIMARY KEY,
        skill_master_id      INT NOT NULL,
        CONSTRAINT FK_WRS_request FOREIGN KEY (workforce_request_id) REFERENCES dbo.Workforce_Request (workforce_request_id),
        CONSTRAINT FK_WRS_skill   FOREIGN KEY (skill_master_id)      REFERENCES dbo.Skill_Master (skill_master_id)
    );
END
GO
