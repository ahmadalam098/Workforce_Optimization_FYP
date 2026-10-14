-- Migration 003: Skill catalog, employee skills, employee shift assignments
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- Existing tables (Skills, Shift, Employee, ...) are NOT changed. The old Skills table keeps working
-- (Workforce_Request still points at it); its rows are copied into the new tables below.

USE WorkforceManagementDB;
GO

-- One row per skill that exists in the system (English, German, Customer Support ...).
IF OBJECT_ID('dbo.Skill_Master', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Skill_Master
    (
        skill_master_id INT IDENTITY(1,1) PRIMARY KEY,
        name            VARCHAR(100) NOT NULL,
        category        VARCHAR(100) NULL,
        description     VARCHAR(255) NULL,
        is_active       BIT          NOT NULL CONSTRAINT DF_Skill_Master_active DEFAULT (1),
        created_at      DATETIME     NOT NULL CONSTRAINT DF_Skill_Master_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT UQ_Skill_Master_name UNIQUE (name)
    );
END
GO

-- Which employee has which skill, and how good they are (Beginner / Intermediate / Advanced / Expert).
IF OBJECT_ID('dbo.Employee_Skill', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employee_Skill
    (
        employee_skill_id   INT IDENTITY(1,1) PRIMARY KEY,
        emp_id              INT         NOT NULL,
        skill_master_id     INT         NOT NULL,
        proficiency         VARCHAR(30) NOT NULL,
        years_of_experience INT         NULL,
        created_at          DATETIME    NOT NULL CONSTRAINT DF_Employee_Skill_created_at DEFAULT (GETUTCDATE()),
        updated_at          DATETIME    NULL,
        CONSTRAINT FK_Employee_Skill_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee(emp_id),
        CONSTRAINT FK_Employee_Skill_Skill FOREIGN KEY (skill_master_id) REFERENCES dbo.Skill_Master(skill_master_id),
        CONSTRAINT UQ_Employee_Skill UNIQUE (emp_id, skill_master_id)
    );
    CREATE INDEX IX_Employee_Skill_skill ON dbo.Employee_Skill (skill_master_id);
END
GO

-- Which shift an employee works. end_date IS NULL means the current assignment; ended rows are the history.
IF OBJECT_ID('dbo.Employee_Shift', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employee_Shift
    (
        assignment_id INT IDENTITY(1,1) PRIMARY KEY,
        emp_id        INT          NOT NULL,
        shift_id      INT          NOT NULL,
        start_date    DATE         NOT NULL,
        end_date      DATE         NULL,
        assigned_by   INT          NULL,
        notes         VARCHAR(255) NULL,
        created_at    DATETIME     NOT NULL CONSTRAINT DF_Employee_Shift_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Employee_Shift_Employee FOREIGN KEY (emp_id) REFERENCES dbo.Employee(emp_id),
        CONSTRAINT FK_Employee_Shift_Shift FOREIGN KEY (shift_id) REFERENCES dbo.Shift(shift_id),
        CONSTRAINT FK_Employee_Shift_User FOREIGN KEY (assigned_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Employee_Shift_emp ON dbo.Employee_Shift (emp_id, end_date);
    CREATE INDEX IX_Employee_Shift_shift ON dbo.Employee_Shift (shift_id, end_date);
END
GO

-- Copy the skills that already exist in the old Skills table (one skill per employee row) into the new tables.
INSERT INTO dbo.Skill_Master (name, category, description)
SELECT s.skill_name, MAX(s.skill_category), MAX(s.description)
FROM dbo.Skills s
WHERE s.skill_name IS NOT NULL
  AND LTRIM(RTRIM(s.skill_name)) <> ''
  AND NOT EXISTS (SELECT 1 FROM dbo.Skill_Master m WHERE m.name = s.skill_name)
GROUP BY s.skill_name;
GO

;WITH src AS
(
    SELECT s.emp_id,
           m.skill_master_id,
           s.efficiency_level,
           s.years_of_experience,
           ROW_NUMBER() OVER (PARTITION BY s.emp_id, m.skill_master_id ORDER BY s.skill_id) AS rn
    FROM dbo.Skills s
    JOIN dbo.Skill_Master m ON m.name = s.skill_name
    WHERE s.emp_id IS NOT NULL
)
INSERT INTO dbo.Employee_Skill (emp_id, skill_master_id, proficiency, years_of_experience)
SELECT src.emp_id,
       src.skill_master_id,
       CASE LOWER(LTRIM(RTRIM(ISNULL(src.efficiency_level, ''))))
            WHEN 'expert'       THEN 'Expert'
            WHEN 'advanced'     THEN 'Advanced'
            WHEN 'high'         THEN 'Advanced'
            WHEN 'beginner'     THEN 'Beginner'
            WHEN 'basic'        THEN 'Beginner'
            WHEN 'low'          THEN 'Beginner'
            ELSE 'Intermediate'
       END,
       src.years_of_experience
FROM src
WHERE src.rn = 1
  AND NOT EXISTS (SELECT 1 FROM dbo.Employee_Skill es WHERE es.emp_id = src.emp_id AND es.skill_master_id = src.skill_master_id);
GO
