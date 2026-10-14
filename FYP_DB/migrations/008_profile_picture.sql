-- Migration 008: Profile pictures
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- The picture file is saved in the backend's uploads folder; only its location is stored here.
-- (Adds one optional column to [User]. Nothing existing is changed or removed.)

USE WorkforceManagementDB;
GO

IF COL_LENGTH('dbo.[User]', 'profile_picture_path') IS NULL
    ALTER TABLE dbo.[User] ADD profile_picture_path VARCHAR(255) NULL;   -- e.g. profile-pictures/5-3f2a.jpg (inside the uploads folder)
GO

-- An earlier draft kept the picture itself in this table. It is no longer used; drop it only when it holds nothing.
IF OBJECT_ID('dbo.User_Profile_Picture', 'U') IS NOT NULL
    EXEC('IF NOT EXISTS (SELECT 1 FROM dbo.User_Profile_Picture) DROP TABLE dbo.User_Profile_Picture');
GO
