-- Migration 014: Organization Manager settings
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
--  * User_Login: when a person signed in last (and the time before), shown under Settings > Security.
--  * Manager_Notification_Pref: what the manager wants in their notification bell.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.User_Login', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.User_Login
    (
        user_id           INT      NOT NULL PRIMARY KEY,
        last_login_at     DATETIME NOT NULL,      -- the sign-in that is running now
        previous_login_at DATETIME NULL,          -- the sign-in before that
        CONSTRAINT FK_User_Login_user FOREIGN KEY (user_id) REFERENCES dbo.[User] (user_id)
    );
END
GO

IF OBJECT_ID('dbo.Manager_Notification_Pref', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Manager_Notification_Pref
    (
        user_id              INT      NOT NULL PRIMARY KEY,
        in_app               BIT      NOT NULL CONSTRAINT DF_MNP_in_app DEFAULT (1),
        notify_requests      BIT      NOT NULL CONSTRAINT DF_MNP_requests DEFAULT (1),
        notify_queries       BIT      NOT NULL CONSTRAINT DF_MNP_queries DEFAULT (1),
        notify_invoices      BIT      NOT NULL CONSTRAINT DF_MNP_invoices DEFAULT (1),
        notify_employees     BIT      NOT NULL CONSTRAINT DF_MNP_employees DEFAULT (1),
        notify_chat          BIT      NOT NULL CONSTRAINT DF_MNP_chat DEFAULT (1),
        notify_expiry        BIT      NOT NULL CONSTRAINT DF_MNP_expiry DEFAULT (1),
        expiry_days          INT      NULL,       -- NULL = use the system setting chosen by the admin
        updated_at           DATETIME NOT NULL CONSTRAINT DF_MNP_updated_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_MNP_user FOREIGN KEY (user_id) REFERENCES dbo.[User] (user_id)
    );
END
GO
