-- Migration 006: Queries / tickets (extends Complaints and Reports without changing them)
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- Existing Complaints / Reports rows are copied into the new Ticket tables (once).

USE WorkforceManagementDB;
GO

-- Required for the filtered unique indexes below (SSMS has these ON by default; sqlcmd does not).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- One row per query / complaint / ticket, whoever sends it (organization, employee, manager, admin).
IF OBJECT_ID('dbo.Ticket', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ticket
    (
        ticket_id           INT IDENTITY(1,1) PRIMARY KEY,
        ticket_number       VARCHAR(20)   NULL,
        subject             VARCHAR(150)  NOT NULL,
        description         VARCHAR(2000) NOT NULL,
        category            VARCHAR(30)   NOT NULL CONSTRAINT DF_Ticket_category DEFAULT ('Query'),     -- Query / Complaint / Payment / Technical / Allocation / Other
        priority            VARCHAR(10)   NOT NULL CONSTRAINT DF_Ticket_priority DEFAULT ('Medium'),    -- Low / Medium / High / Critical
        status              VARCHAR(20)   NOT NULL CONSTRAINT DF_Ticket_status DEFAULT ('Open'),       -- Open / InProgress / Resolved / Closed
        source              VARCHAR(20)   NOT NULL CONSTRAINT DF_Ticket_source DEFAULT ('Organization'),-- who it comes from
        org_id              INT           NULL,
        raised_by_user_id   INT           NULL,    -- the employee / manager it comes from (when it is a person)
        assigned_to_user_id INT           NULL,    -- the admin / manager handling it
        created_by          INT           NULL,    -- the admin who logged it
        created_at          DATETIME      NOT NULL CONSTRAINT DF_Ticket_created_at DEFAULT (GETUTCDATE()),
        updated_at          DATETIME      NULL,
        resolved_at         DATETIME      NULL,
        closed_at           DATETIME      NULL,
        source_complaint_id INT           NULL,    -- set when copied from the old Complaints table
        CONSTRAINT CK_Ticket_priority CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
        CONSTRAINT CK_Ticket_status CHECK (status IN ('Open', 'InProgress', 'Resolved', 'Closed')),
        CONSTRAINT FK_Ticket_Organization FOREIGN KEY (org_id) REFERENCES dbo.Organization(org_id),
        CONSTRAINT FK_Ticket_RaisedBy FOREIGN KEY (raised_by_user_id) REFERENCES dbo.[User](user_id),
        CONSTRAINT FK_Ticket_AssignedTo FOREIGN KEY (assigned_to_user_id) REFERENCES dbo.[User](user_id),
        CONSTRAINT FK_Ticket_CreatedBy FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Ticket_status ON dbo.Ticket (status, priority, created_at DESC);
    CREATE INDEX IX_Ticket_org ON dbo.Ticket (org_id);
END
GO

-- The conversation on a ticket: replies to the sender, what the sender said, and internal notes.
IF OBJECT_ID('dbo.Ticket_Message', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ticket_Message
    (
        message_id     INT IDENTITY(1,1) PRIMARY KEY,
        ticket_id      INT           NOT NULL,
        author_user_id INT           NULL,
        message_type   VARCHAR(20)   NOT NULL CONSTRAINT DF_Ticket_Message_type DEFAULT ('Response'), -- Response / Customer / Note / Resolution
        body           VARCHAR(2000) NOT NULL,
        is_internal    BIT           NOT NULL CONSTRAINT DF_Ticket_Message_internal DEFAULT (0),
        created_at     DATETIME      NOT NULL CONSTRAINT DF_Ticket_Message_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Ticket_Message_Ticket FOREIGN KEY (ticket_id) REFERENCES dbo.Ticket(ticket_id),
        CONSTRAINT FK_Ticket_Message_User FOREIGN KEY (author_user_id) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Ticket_Message_ticket ON dbo.Ticket_Message (ticket_id, created_at);
END
GO

-- Ticket numbers (TCK-0001 ...) are unique once assigned. Separate step so running the script again repairs a missing index.
IF OBJECT_ID('dbo.Ticket', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Ticket_number' AND object_id = OBJECT_ID('dbo.Ticket'))
BEGIN
    CREATE UNIQUE INDEX UX_Ticket_number ON dbo.Ticket (ticket_number) WHERE ticket_number IS NOT NULL;
END
GO

-- Copy each old complaint once. Priority comes from the manager level_of_query (Low / Middle / High), the
-- manager review becomes the first response. Complaints have no date, so the copy gets today as its date.
INSERT INTO dbo.Ticket (subject, description, category, priority, status, source, org_id, created_at, source_complaint_id)
SELECT LEFT(COALESCE(NULLIF(LTRIM(RTRIM(c.complaints)), ''), 'Complaint'), 80),
       LEFT(COALESCE(NULLIF(LTRIM(RTRIM(c.complaints)), ''), 'Complaint (no text)'), 2000),
       'Complaint',
       CASE LOWER(LTRIM(RTRIM(ISNULL(r.level_of_query, ''))))
            WHEN 'low' THEN 'Low'
            WHEN 'high' THEN 'High'
            WHEN 'critical' THEN 'Critical'
            ELSE 'Medium'
       END,
       CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(r.org_manager_review, ''))), '') IS NULL THEN 'Open' ELSE 'InProgress' END,
       'Organization',
       c.org_id,
       GETUTCDATE(),
       c.comp_id
FROM dbo.Complaints c
OUTER APPLY (SELECT TOP 1 rr.level_of_query, rr.org_manager_review
             FROM dbo.Reports rr
             WHERE rr.comp_id = c.comp_id
             ORDER BY rr.report_id DESC) r
WHERE NOT EXISTS (SELECT 1 FROM dbo.Ticket t WHERE t.source_complaint_id = c.comp_id);
GO

UPDATE dbo.Ticket
SET ticket_number = 'TCK-' + RIGHT('0000' + CAST(ticket_id AS VARCHAR(10)), 4)
WHERE ticket_number IS NULL;
GO

INSERT INTO dbo.Ticket_Message (ticket_id, message_type, body, is_internal)
SELECT t.ticket_id, 'Response', LEFT(LTRIM(RTRIM(r.org_manager_review)), 2000), 0
FROM dbo.Ticket t
CROSS APPLY (SELECT TOP 1 rr.org_manager_review
             FROM dbo.Reports rr
             WHERE rr.comp_id = t.source_complaint_id
             ORDER BY rr.report_id DESC) r
WHERE t.source_complaint_id IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(ISNULL(r.org_manager_review, ''))), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.Ticket_Message m WHERE m.ticket_id = t.ticket_id);
GO
