CREATE DATABASE WorkforceManagementDB;
GO

USE WorkforceManagementDB;
GO

-- TABLE 01: User
CREATE TABLE [User]
(
    user_id INT PRIMARY KEY,
    name VARCHAR(100),
    age INT,
    phone_no VARCHAR(20),
    email VARCHAR(150),
    country VARCHAR(100),
    password VARCHAR(255),
    role_id INT,
    cnic VARCHAR(20),
    is_active BIT,
    created_at DATETIME
);
GO

-- TABLE 02: Role
CREATE TABLE Role
(
    role_id INT PRIMARY KEY,
    role_type VARCHAR(50),
    description VARCHAR(255),
    assign_at DATETIME
);
GO

-- TABLE 03: Employee
CREATE TABLE Employee
(
    emp_id INT PRIMARY KEY,
    user_id INT,
    role_id INT,
    joining_date DATE,
    org_id INT,
    availability_status VARCHAR(50),
    hourly_rate DECIMAL(10,2),
    rating DECIMAL(3,2),
    status_history_id INT
);
GO

-- TABLE 04: Employee_Status
CREATE TABLE Employee_Status
(
    status_history_id INT PRIMARY KEY,
    emp_id INT,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_at DATETIME,
    reason VARCHAR(255),
    changed_by INT
);
GO

-- TABLE 05: Skills
CREATE TABLE Skills
(
    skill_id INT PRIMARY KEY,
    emp_id INT,
    skill_name VARCHAR(100),
    description VARCHAR(255),
    skill_category VARCHAR(100),
    efficiency_level VARCHAR(50),
    years_of_experience INT
);
GO

-- TABLE 06: Shift
CREATE TABLE Shift
(
    shift_id INT PRIMARY KEY,
    shift_name VARCHAR(100),
    start_time TIME,
    end_time TIME,
    status_history_id INT
);
GO

-- TABLE 07: Overtime
CREATE TABLE Overtime
(
    overtime_id INT PRIMARY KEY,
    emp_id INT,
    org_id INT,
    work_date DATE,
    start_time TIME,
    end_time TIME,
    total_hours DECIMAL(5,2),
    hourly_rate DECIMAL(10,2),
    amount DECIMAL(12,2),
    status VARCHAR(50),
    approved_by INT
);
GO

-- TABLE 08: Organization
CREATE TABLE Organization
(
    org_id INT PRIMARY KEY,
    org_name VARCHAR(150),
    email VARCHAR(150),
    phone VARCHAR(20),
    address VARCHAR(255),
    country VARCHAR(100),
    status VARCHAR(50),
    created_at DATETIME,
    approved_at DATETIME,
    password VARCHAR(255)
);
GO

-- TABLE 09: Organization_Manager
CREATE TABLE Organization_Manager
(
    manager_id INT PRIMARY KEY,
    user_id INT,
    org_id INT
);
GO

-- TABLE 10: Contract
CREATE TABLE Contract
(
    contract_id INT PRIMARY KEY,
    org_id INT,
    contract_number VARCHAR(100),
    start_time TIME,
    end_time TIME,
    min_employees INT,
    max_employees INT,
    borrowing_allowed BIT,
    priority_level VARCHAR(50),
    billing_currency VARCHAR(10),
    base_hourly_rate DECIMAL(10,2),
    extra_hourly_rate DECIMAL(10,2),
    status VARCHAR(50),
    created_at DATETIME,
    approved_at DATETIME
);
GO

-- TABLE 11: Workforce_Request
CREATE TABLE Workforce_Request
(
    workforce_request_id INT PRIMARY KEY,
    org_id INT,
    request_by_org_id INT,
    contract_id INT,
    required_employees INT,
    required_skill_id INT,
    priority VARCHAR(50),
    start_datetime DATETIME,
    end_datetime DATETIME,
    reason VARCHAR(255),
    status VARCHAR(50),
    created_at DATETIME
);
GO

-- TABLE 12: Employee_Allocation
CREATE TABLE Employee_Allocation
(
    allocation_id INT PRIMARY KEY,
    employee_id INT,
    owner_org_id INT,
    assign_org_id INT,
    workforce_request_id INT,
    allocation_type VARCHAR(50),
    start_datetime DATETIME,
    expected_end_datetime DATETIME,
    actual_end_datetime DATETIME,
    status VARCHAR(50),
    created_at DATETIME
);
GO

-- TABLE 13: Allocation_History
CREATE TABLE Allocation_History
(
    allocation_history_id INT PRIMARY KEY,
    allocation_id INT,
    emp_id INT,
    from_org_id INT,
    to_org_id INT,
    action_type VARCHAR(50),
    action_reason VARCHAR(255),
    action_time DATETIME,
    performed_by_user_id INT NULL,
    is_allocated_by_AI BIT
);
GO

-- TABLE 14: Organization_Reviews
CREATE TABLE Organization_Reviews
(
    review_id INT PRIMARY KEY,
    org_id INT,
    emp_id INT,
    allocation_id INT,
    ratings DECIMAL(3,2),
    comments VARCHAR(500),
    review_date DATETIME
);
GO

-- TABLE 15: Complaints
CREATE TABLE Complaints
(
    comp_id INT PRIMARY KEY,
    org_id INT,
    complaints VARCHAR(1000)
);
GO

-- TABLE 16: Reports
CREATE TABLE Reports
(
    report_id INT PRIMARY KEY,
    comp_id INT,
    org_id INT,
    org_manager_review VARCHAR(1000),
    level_of_query VARCHAR(100),
    is_submitted BIT
);
GO


-- =========================================================
-- FOREIGN KEYS
-- =========================================================

-- User -> Role
ALTER TABLE [User]
ADD CONSTRAINT FK_User_Role
FOREIGN KEY (role_id)
REFERENCES Role(role_id);
GO

-- Employee -> User
ALTER TABLE Employee
ADD CONSTRAINT FK_Employee_User
FOREIGN KEY (user_id)
REFERENCES [User](user_id);
GO

-- Employee -> Role
ALTER TABLE Employee
ADD CONSTRAINT FK_Employee_Role
FOREIGN KEY (role_id)
REFERENCES Role(role_id);
GO

-- Employee -> Organization
ALTER TABLE Employee
ADD CONSTRAINT FK_Employee_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Employee -> Employee_Status
ALTER TABLE Employee
ADD CONSTRAINT FK_Employee_StatusHistory
FOREIGN KEY (status_history_id)
REFERENCES Employee_Status(status_history_id);
GO

-- Employee_Status -> Employee
ALTER TABLE Employee_Status
ADD CONSTRAINT FK_EmployeeStatus_Employee
FOREIGN KEY (emp_id)
REFERENCES Employee(emp_id);
GO

-- Employee_Status -> User
ALTER TABLE Employee_Status
ADD CONSTRAINT FK_EmployeeStatus_User
FOREIGN KEY (changed_by)
REFERENCES [User](user_id);
GO

-- Skills -> Employee
ALTER TABLE Skills
ADD CONSTRAINT FK_Skills_Employee
FOREIGN KEY (emp_id)
REFERENCES Employee(emp_id);
GO

-- Shift -> Employee_Status
ALTER TABLE Shift
ADD CONSTRAINT FK_Shift_StatusHistory
FOREIGN KEY (status_history_id)
REFERENCES Employee_Status(status_history_id);
GO

-- Overtime -> Employee
ALTER TABLE Overtime
ADD CONSTRAINT FK_Overtime_Employee
FOREIGN KEY (emp_id)
REFERENCES Employee(emp_id);
GO

-- Overtime -> Organization
ALTER TABLE Overtime
ADD CONSTRAINT FK_Overtime_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Overtime -> Organization_Manager
ALTER TABLE Overtime
ADD CONSTRAINT FK_Overtime_Manager
FOREIGN KEY (approved_by)
REFERENCES Organization_Manager(manager_id);
GO

-- Organization_Manager -> User
ALTER TABLE Organization_Manager
ADD CONSTRAINT FK_Manager_User
FOREIGN KEY (user_id)
REFERENCES [User](user_id);
GO

-- Organization_Manager -> Organization
ALTER TABLE Organization_Manager
ADD CONSTRAINT FK_Manager_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Contract -> Organization
ALTER TABLE Contract
ADD CONSTRAINT FK_Contract_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Workforce_Request -> Organization
ALTER TABLE Workforce_Request
ADD CONSTRAINT FK_WorkforceRequest_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Workforce_Request -> Requesting Organization
ALTER TABLE Workforce_Request
ADD CONSTRAINT FK_WorkforceRequest_RequestByOrganization
FOREIGN KEY (request_by_org_id)
REFERENCES Organization(org_id);
GO

-- Workforce_Request -> Contract
ALTER TABLE Workforce_Request
ADD CONSTRAINT FK_WorkforceRequest_Contract
FOREIGN KEY (contract_id)
REFERENCES Contract(contract_id);
GO

-- Workforce_Request -> Skills
ALTER TABLE Workforce_Request
ADD CONSTRAINT FK_WorkforceRequest_Skill
FOREIGN KEY (required_skill_id)
REFERENCES Skills(skill_id);
GO

-- Employee_Allocation -> Employee
ALTER TABLE Employee_Allocation
ADD CONSTRAINT FK_Allocation_Employee
FOREIGN KEY (employee_id)
REFERENCES Employee(emp_id);
GO

-- Employee_Allocation -> Owner Organization
ALTER TABLE Employee_Allocation
ADD CONSTRAINT FK_Allocation_OwnerOrganization
FOREIGN KEY (owner_org_id)
REFERENCES Organization(org_id);
GO

-- Employee_Allocation -> Assigned Organization
ALTER TABLE Employee_Allocation
ADD CONSTRAINT FK_Allocation_AssignedOrganization
FOREIGN KEY (assign_org_id)
REFERENCES Organization(org_id);
GO

-- Employee_Allocation -> Workforce_Request
ALTER TABLE Employee_Allocation
ADD CONSTRAINT FK_Allocation_WorkforceRequest
FOREIGN KEY (workforce_request_id)
REFERENCES Workforce_Request(workforce_request_id);
GO

-- Allocation_History -> Employee_Allocation
ALTER TABLE Allocation_History
ADD CONSTRAINT FK_AllocationHistory_Allocation
FOREIGN KEY (allocation_id)
REFERENCES Employee_Allocation(allocation_id);
GO

-- Allocation_History -> Employee
ALTER TABLE Allocation_History
ADD CONSTRAINT FK_AllocationHistory_Employee
FOREIGN KEY (emp_id)
REFERENCES Employee(emp_id);
GO

-- Allocation_History -> From Organization
ALTER TABLE Allocation_History
ADD CONSTRAINT FK_AllocationHistory_FromOrganization
FOREIGN KEY (from_org_id)
REFERENCES Organization(org_id);
GO

-- Allocation_History -> To Organization
ALTER TABLE Allocation_History
ADD CONSTRAINT FK_AllocationHistory_ToOrganization
FOREIGN KEY (to_org_id)
REFERENCES Organization(org_id);
GO

-- Allocation_History -> Performed By User
ALTER TABLE Allocation_History
ADD CONSTRAINT FK_AllocationHistory_PerformedByUser
FOREIGN KEY (performed_by_user_id)
REFERENCES [User](user_id);
GO

-- Organization_Reviews -> Organization
ALTER TABLE Organization_Reviews
ADD CONSTRAINT FK_Reviews_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Organization_Reviews -> Employee
ALTER TABLE Organization_Reviews
ADD CONSTRAINT FK_Reviews_Employee
FOREIGN KEY (emp_id)
REFERENCES Employee(emp_id);
GO

-- Organization_Reviews -> Employee_Allocation
ALTER TABLE Organization_Reviews
ADD CONSTRAINT FK_Reviews_Allocation
FOREIGN KEY (allocation_id)
REFERENCES Employee_Allocation(allocation_id);
GO

-- Complaints -> Organization
ALTER TABLE Complaints
ADD CONSTRAINT FK_Complaints_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO

-- Reports -> Complaints
ALTER TABLE Reports
ADD CONSTRAINT FK_Reports_Complaints
FOREIGN KEY (comp_id)
REFERENCES Complaints(comp_id);
GO

-- Reports -> Organization
ALTER TABLE Reports
ADD CONSTRAINT FK_Reports_Organization
FOREIGN KEY (org_id)
REFERENCES Organization(org_id);
GO


-- =========================================================
-- OPTIONAL VERIFICATION
-- =========================================================

SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE';
GO

SELECT
    fk.name AS Foreign_Key_Name,
    OBJECT_NAME(fk.parent_object_id) AS Table_Name,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS Column_Name,
    OBJECT_NAME(fk.referenced_object_id) AS Referenced_Table,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS Referenced_Column
FROM sys.foreign_keys AS fk
INNER JOIN sys.foreign_key_columns AS fkc
    ON fk.object_id = fkc.constraint_object_id
ORDER BY Table_Name;
GO
