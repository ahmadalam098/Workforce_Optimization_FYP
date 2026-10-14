-- Migration 010: Remove the SLA module from the database
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- Drops the tables Recall_Request and SLA_Violation and every "recall SLA" / "response SLA" column.
-- Databases that never had them are left as they are.

USE WorkforceManagementDB;
GO

IF OBJECT_ID('dbo.SLA_Violation', 'U') IS NOT NULL DROP TABLE dbo.SLA_Violation;   -- first: it points at Recall_Request
IF OBJECT_ID('dbo.Recall_Request', 'U') IS NOT NULL DROP TABLE dbo.Recall_Request;
GO

DECLARE @columns TABLE (table_name sysname, column_name sysname);
INSERT INTO @columns VALUES
    ('Contract', 'recall_SLA_min'),
    ('Employee_Allocation', 'recall_SLA_min'),
    ('Contract_Version', 'recall_sla_min'),
    ('Contract_Version', 'response_sla_min'),
    ('Contract_Modification_Request', 'proposed_recall_sla_min'),
    ('Contract_Modification_Request', 'proposed_response_sla_min');

DECLARE @table sysname, @column sysname, @sql nvarchar(max);
DECLARE column_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT table_name, column_name FROM @columns;
OPEN column_cursor;
FETCH NEXT FROM column_cursor INTO @table, @column;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH('dbo.' + @table, @column) IS NOT NULL
    BEGIN
        -- a column that has a default value cannot be dropped until that default is dropped
        SET @sql = NULL;
        SELECT @sql = STRING_AGG('ALTER TABLE dbo.' + QUOTENAME(@table) + ' DROP CONSTRAINT ' + QUOTENAME(dc.name), '; ')
        FROM sys.default_constraints dc
        JOIN sys.columns col ON col.object_id = dc.parent_object_id AND col.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID('dbo.' + @table) AND col.name = @column;
        IF @sql IS NOT NULL EXEC (@sql);

        SET @sql = 'ALTER TABLE dbo.' + QUOTENAME(@table) + ' DROP COLUMN ' + QUOTENAME(@column);
        EXEC (@sql);
    END
    FETCH NEXT FROM column_cursor INTO @table, @column;
END
CLOSE column_cursor;
DEALLOCATE column_cursor;
GO
