-- Migration 002: Contracts, versions, rules, modification requests, approval decisions
-- Safe to run more than once. Run in SQL Server Management Studio against WorkforceManagementDB.
-- Existing tables (Contract, Organization, ...) are NOT changed.

USE WorkforceManagementDB;
GO

-- Every version of a contract (version 1 is the original, each approved modification adds one).
-- The Contract row always mirrors the latest version for the columns it already has.
IF OBJECT_ID('dbo.Contract_Version', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Contract_Version
    (
        version_id             INT IDENTITY(1,1) PRIMARY KEY,
        contract_id            INT           NOT NULL,
        version_no             INT           NOT NULL,
        start_date             DATE          NULL,
        end_date               DATE          NULL,
        start_time             TIME          NULL,
        end_time               TIME          NULL,
        min_employees          INT           NULL,
        max_employees          INT           NULL,
        sharing_allowed        BIT           NULL,
        borrowing_allowed      BIT           NULL,
        max_borrowed_employees INT           NULL,
        priority_level         VARCHAR(50)   NULL,
        billing_currency       VARCHAR(10)   NULL,
        billing_cycle          VARCHAR(30)   NULL,
        base_hourly_rate       DECIMAL(10,2) NULL,
        extra_hourly_rate      DECIMAL(10,2) NULL,
        change_summary         VARCHAR(500)  NULL,
        created_by             INT           NULL,
        created_at             DATETIME      NOT NULL CONSTRAINT DF_Contract_Version_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Contract_Version_Contract FOREIGN KEY (contract_id) REFERENCES dbo.Contract(contract_id),
        CONSTRAINT FK_Contract_Version_User FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id),
        CONSTRAINT UQ_Contract_Version UNIQUE (contract_id, version_no)
    );
END
GO

-- Rules attached to a contract (Staffing / Borrowing / Payment / Operational).
IF OBJECT_ID('dbo.Contract_Rule', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Contract_Rule
    (
        rule_id     INT IDENTITY(1,1) PRIMARY KEY,
        contract_id INT           NOT NULL,
        category    VARCHAR(30)   NOT NULL,
        title       VARCHAR(150)  NOT NULL,
        rule_value  VARCHAR(255)  NULL,
        description VARCHAR(500)  NULL,
        is_active   BIT           NOT NULL CONSTRAINT DF_Contract_Rule_active DEFAULT (1),
        created_by  INT           NULL,
        created_at  DATETIME      NOT NULL CONSTRAINT DF_Contract_Rule_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Contract_Rule_Contract FOREIGN KEY (contract_id) REFERENCES dbo.Contract(contract_id),
        CONSTRAINT FK_Contract_Rule_User FOREIGN KEY (created_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Contract_Rule_contract ON dbo.Contract_Rule (contract_id);
END
GO

-- Requests to change an active contract (Pending -> Approved / Rejected / Negotiation).
-- Only the fields being changed are filled in (proposed_*).
IF OBJECT_ID('dbo.Contract_Modification_Request', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Contract_Modification_Request
    (
        modification_id               INT IDENTITY(1,1) PRIMARY KEY,
        contract_id                   INT           NOT NULL,
        requested_by_user_id          INT           NULL,
        proposed_min_employees        INT           NULL,
        proposed_max_employees        INT           NULL,
        proposed_sharing_allowed      BIT           NULL,
        proposed_borrowing_allowed    BIT           NULL,
        proposed_max_borrowed         INT           NULL,
        proposed_priority_level       VARCHAR(50)   NULL,
        proposed_base_hourly_rate     DECIMAL(10,2) NULL,
        proposed_extra_hourly_rate    DECIMAL(10,2) NULL,
        proposed_end_date             DATE          NULL,
        reason                        VARCHAR(500)  NULL,
        status                        VARCHAR(30)   NOT NULL CONSTRAINT DF_Contract_Mod_status DEFAULT ('Pending'),
        admin_response                VARCHAR(500)  NULL,
        reviewed_by                   INT           NULL,
        reviewed_at                   DATETIME      NULL,
        result_version_no             INT           NULL,
        created_at                    DATETIME      NOT NULL CONSTRAINT DF_Contract_Mod_created_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Contract_Mod_Contract FOREIGN KEY (contract_id) REFERENCES dbo.Contract(contract_id),
        CONSTRAINT FK_Contract_Mod_Requester FOREIGN KEY (requested_by_user_id) REFERENCES dbo.[User](user_id),
        CONSTRAINT FK_Contract_Mod_Reviewer FOREIGN KEY (reviewed_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Contract_Mod_contract ON dbo.Contract_Modification_Request (contract_id);
    CREATE INDEX IX_Contract_Mod_status ON dbo.Contract_Modification_Request (status);
END
GO

-- Admin decisions (approve / reject / suspend / terminate) with the reason, for organizations and contracts.
IF OBJECT_ID('dbo.Approval_Decision', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Approval_Decision
    (
        decision_id INT IDENTITY(1,1) PRIMARY KEY,
        entity_type VARCHAR(30)  NOT NULL,   -- 'Organization' or 'Contract'
        entity_id   INT          NOT NULL,
        decision    VARCHAR(30)  NOT NULL,   -- Approved / Rejected / Suspended / Terminated
        reason      VARCHAR(500) NULL,
        decided_by  INT          NULL,
        decided_at  DATETIME     NOT NULL CONSTRAINT DF_Approval_Decision_at DEFAULT (GETUTCDATE()),
        CONSTRAINT FK_Approval_Decision_User FOREIGN KEY (decided_by) REFERENCES dbo.[User](user_id)
    );
    CREATE INDEX IX_Approval_Decision_entity ON dbo.Approval_Decision (entity_type, entity_id);
END
GO
