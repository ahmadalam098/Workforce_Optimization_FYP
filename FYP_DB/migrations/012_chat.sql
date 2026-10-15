-- Migration 012: Chat between an Organization Manager and the organizations assigned to them
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- One conversation = one organization + one of its managers. The Node.js chat server (FYP_CHAT) stores nothing itself;
-- every message is saved through the ASP.NET API into this table.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.Chat_Message', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Chat_Message
    (
        message_id      BIGINT IDENTITY(1,1) PRIMARY KEY,
        org_id          INT            NOT NULL,
        manager_user_id INT            NOT NULL,
        sender_type     VARCHAR(12)    NOT NULL,     -- 'Manager' or 'Organization'
        body            NVARCHAR(2000) NOT NULL,
        created_at      DATETIME       NOT NULL CONSTRAINT DF_Chat_Message_created_at DEFAULT (GETUTCDATE()),
        read_at         DATETIME       NULL,         -- when the other side opened it
        CONSTRAINT CK_Chat_Message_sender CHECK (sender_type IN ('Manager', 'Organization')),
        CONSTRAINT FK_Chat_Message_org FOREIGN KEY (org_id) REFERENCES dbo.Organization (org_id),
        CONSTRAINT FK_Chat_Message_manager FOREIGN KEY (manager_user_id) REFERENCES dbo.[User] (user_id)
    );

    CREATE INDEX IX_Chat_Message_conversation ON dbo.Chat_Message (org_id, manager_user_id, message_id);
END
GO
