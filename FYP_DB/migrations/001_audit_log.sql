-- Migration 001: Audit_Log
-- Records every important admin action (who / what / when). Safe to run more than once.
-- Run in SQL Server Management Studio against the WorkforceManagementDB database.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Audit_Log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Audit_Log
    (
        audit_id       INT IDENTITY(1,1) PRIMARY KEY,
        actor_user_id  INT          NULL,
        actor_name     VARCHAR(100) NULL,
        action         VARCHAR(100) NOT NULL,
        entity_type    VARCHAR(100) NULL,
        entity_id      VARCHAR(50)  NULL,
        details        VARCHAR(1000) NULL,
        ip_address     VARCHAR(50)  NULL,
        created_at     DATETIME     NOT NULL CONSTRAINT DF_Audit_Log_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Audit_Log_User FOREIGN KEY (actor_user_id) REFERENCES [User](user_id)
    );

    CREATE INDEX IX_Audit_Log_created_at ON dbo.Audit_Log (created_at DESC);
    CREATE INDEX IX_Audit_Log_actor ON dbo.Audit_Log (actor_user_id);
END
GO
