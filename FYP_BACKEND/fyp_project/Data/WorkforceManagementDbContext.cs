using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Models;

public partial class WorkforceManagementDbContext : DbContext
{
    public WorkforceManagementDbContext()
    {
    }

    public WorkforceManagementDbContext(DbContextOptions<WorkforceManagementDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AllocationHistory> AllocationHistories { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<ContractVersion> ContractVersions { get; set; }

    public virtual DbSet<ContractRule> ContractRules { get; set; }

    public virtual DbSet<ContractModificationRequest> ContractModificationRequests { get; set; }

    public virtual DbSet<ApprovalDecision> ApprovalDecisions { get; set; }

    public virtual DbSet<SkillMaster> SkillMasters { get; set; }

    public virtual DbSet<EmployeeSkill> EmployeeSkills { get; set; }

    public virtual DbSet<EmployeeShift> EmployeeShifts { get; set; }

    public virtual DbSet<ExchangeRate> ExchangeRates { get; set; }

    public virtual DbSet<PaymentRule> PaymentRules { get; set; }

    public virtual DbSet<SalaryStructure> SalaryStructures { get; set; }

    public virtual DbSet<PayrollRun> PayrollRuns { get; set; }

    public virtual DbSet<PayrollItem> PayrollItems { get; set; }

    public virtual DbSet<Invoice> Invoices { get; set; }

    public virtual DbSet<InvoiceLine> InvoiceLines { get; set; }

    public virtual DbSet<InvoicePayment> InvoicePayments { get; set; }

    public virtual DbSet<Ticket> Tickets { get; set; }

    public virtual DbSet<WorkforceRequestReview> WorkforceRequestReviews { get; set; }

    public virtual DbSet<SystemSetting> SystemSettings { get; set; }

    public virtual DbSet<ChatMessage> ChatMessages { get; set; }

    public virtual DbSet<EmployeeWarning> EmployeeWarnings { get; set; }

    public virtual DbSet<ReviewEscalation> ReviewEscalations { get; set; }

    public virtual DbSet<OrganizationNotificationState> OrganizationNotificationStates { get; set; }

    public virtual DbSet<OrganizationSettings> OrganizationSettings { get; set; }

    public virtual DbSet<AssignmentOffer> AssignmentOffers { get; set; }

    public virtual DbSet<PaymentSubmission> PaymentSubmissions { get; set; }

    public virtual DbSet<EmployeeBank> EmployeeBanks { get; set; }

    public virtual DbSet<OnlinePayment> OnlinePayments { get; set; }

    public virtual DbSet<CallSession> CallSessions { get; set; }

    public virtual DbSet<NotificationState> NotificationStates { get; set; }

    public virtual DbSet<UserLogin> UserLogins { get; set; }

    public virtual DbSet<ManagerNotificationPref> ManagerNotificationPrefs { get; set; }

    public virtual DbSet<WorkforceRequestSkill> WorkforceRequestSkills { get; set; }

    public virtual DbSet<TicketMessage> TicketMessages { get; set; }

    public virtual DbSet<Complaint> Complaints { get; set; }

    public virtual DbSet<Contract> Contracts { get; set; }

    public virtual DbSet<Employee> Employees { get; set; }

    public virtual DbSet<EmployeeAllocation> EmployeeAllocations { get; set; }

    public virtual DbSet<EmployeeStatus> EmployeeStatuses { get; set; }

    public virtual DbSet<Organization> Organizations { get; set; }

    public virtual DbSet<OrganizationManager> OrganizationManagers { get; set; }

    public virtual DbSet<OrganizationReview> OrganizationReviews { get; set; }

    public virtual DbSet<Overtime> Overtimes { get; set; }

    public virtual DbSet<Report> Reports { get; set; }

    public virtual DbSet<Role> Roles { get; set; }

    public virtual DbSet<Shift> Shifts { get; set; }

    public virtual DbSet<Skill> Skills { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<WorkforceRequest> WorkforceRequests { get; set; }

//    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
//#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
//        => optionsBuilder.UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=WorkforceManagementDB;Trusted_Connection=True;TrustServerCertificate=True;");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AllocationHistory>(entity =>
        {
            entity.HasKey(e => e.AllocationHistoryId).HasName("PK__Allocati__142FB1A300A7FDB8");

            entity.ToTable("Allocation_History");

            entity.Property(e => e.AllocationHistoryId)
                .ValueGeneratedNever()
                .HasColumnName("allocation_history_id");
            entity.Property(e => e.ActionReason)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("action_reason");
            entity.Property(e => e.ActionTime)
                .HasColumnType("datetime")
                .HasColumnName("action_time");
            entity.Property(e => e.ActionType)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("action_type");
            entity.Property(e => e.AllocationId).HasColumnName("allocation_id");
            entity.Property(e => e.EmpId).HasColumnName("emp_id");
            entity.Property(e => e.FromOrgId).HasColumnName("from_org_id");
            entity.Property(e => e.IsAllocatedByAi).HasColumnName("is_allocated_by_AI");
            entity.Property(e => e.PerformedByUserId).HasColumnName("performed_by_user_id");
            entity.Property(e => e.ToOrgId).HasColumnName("to_org_id");

            entity.HasOne(d => d.Allocation).WithMany(p => p.AllocationHistories)
                .HasForeignKey(d => d.AllocationId)
                .HasConstraintName("FK_AllocationHistory_Allocation");

            entity.HasOne(d => d.Emp).WithMany(p => p.AllocationHistories)
                .HasForeignKey(d => d.EmpId)
                .HasConstraintName("FK_AllocationHistory_Employee");

            entity.HasOne(d => d.FromOrg).WithMany(p => p.AllocationHistoryFromOrgs)
                .HasForeignKey(d => d.FromOrgId)
                .HasConstraintName("FK_AllocationHistory_FromOrganization");

            entity.HasOne(d => d.PerformedByUser).WithMany(p => p.AllocationHistories)
                .HasForeignKey(d => d.PerformedByUserId)
                .HasConstraintName("FK_AllocationHistory_PerformedByUser");

            entity.HasOne(d => d.ToOrg).WithMany(p => p.AllocationHistoryToOrgs)
                .HasForeignKey(d => d.ToOrgId)
                .HasConstraintName("FK_AllocationHistory_ToOrganization");
        });

        modelBuilder.Entity<Complaint>(entity =>
        {
            entity.HasKey(e => e.CompId).HasName("PK__Complain__531653DD44B5C8FE");

            entity.Property(e => e.CompId)
                .ValueGeneratedNever()
                .HasColumnName("comp_id");
            entity.Property(e => e.Complaints)
                .HasMaxLength(1000)
                .IsUnicode(false)
                .HasColumnName("complaints");
            entity.Property(e => e.OrgId).HasColumnName("org_id");

            entity.HasOne(d => d.Org).WithMany(p => p.Complaints)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Complaints_Organization");
        });

        modelBuilder.Entity<Contract>(entity =>
        {
            entity.HasKey(e => e.ContractId).HasName("PK__Contract__F8D6642308075506");

            entity.ToTable("Contract");

            entity.Property(e => e.ContractId)
                .ValueGeneratedNever()
                .HasColumnName("contract_id");
            entity.Property(e => e.ApprovedAt)
                .HasColumnType("datetime")
                .HasColumnName("approved_at");
            entity.Property(e => e.BaseHourlyRate)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("base_hourly_rate");
            entity.Property(e => e.BillingCurrency)
                .HasMaxLength(10)
                .IsUnicode(false)
                .HasColumnName("billing_currency");
            entity.Property(e => e.BorrowingAllowed).HasColumnName("borrowing_allowed");
            entity.Property(e => e.ContractNumber)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("contract_number");
            entity.Property(e => e.CreatedAt)
                .HasColumnType("datetime")
                .HasColumnName("created_at");
            entity.Property(e => e.EndTime).HasColumnName("end_time");
            entity.Property(e => e.ExtraHourlyRate)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("extra_hourly_rate");
            entity.Property(e => e.MaxEmployees).HasColumnName("max_employees");
            entity.Property(e => e.MinEmployees).HasColumnName("min_employees");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.PriorityLevel)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("priority_level");
            entity.Property(e => e.StartTime).HasColumnName("start_time");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.HasOne(d => d.Org).WithMany(p => p.Contracts)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Contract_Organization");
        });

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.HasKey(e => e.EmpId).HasName("PK__Employee__1299A861DB9FEB56");

            entity.ToTable("Employee");

            entity.Property(e => e.EmpId)
                .ValueGeneratedNever()
                .HasColumnName("emp_id");
            entity.Property(e => e.AvailabilityStatus)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("availability_status");
            entity.Property(e => e.HourlyRate)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("hourly_rate");
            entity.Property(e => e.JoiningDate).HasColumnName("joining_date");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.Rating)
                .HasColumnType("decimal(3, 2)")
                .HasColumnName("rating");
            entity.Property(e => e.RoleId).HasColumnName("role_id");
            entity.Property(e => e.StatusHistoryId).HasColumnName("status_history_id");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.Org).WithMany(p => p.Employees)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Employee_Organization");

            entity.HasOne(d => d.Role).WithMany(p => p.Employees)
                .HasForeignKey(d => d.RoleId)
                .HasConstraintName("FK_Employee_Role");

            entity.HasOne(d => d.StatusHistory).WithMany(p => p.Employees)
                .HasForeignKey(d => d.StatusHistoryId)
                .HasConstraintName("FK_Employee_StatusHistory");

            entity.HasOne(d => d.User).WithMany(p => p.Employees)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_Employee_User");
        });

        modelBuilder.Entity<EmployeeAllocation>(entity =>
        {
            entity.HasKey(e => e.AllocationId).HasName("PK__Employee__5DFAFF300AC6A0C4");

            entity.ToTable("Employee_Allocation");

            entity.Property(e => e.AllocationId)
                .ValueGeneratedNever()
                .HasColumnName("allocation_id");
            entity.Property(e => e.ActualEndDatetime)
                .HasColumnType("datetime")
                .HasColumnName("actual_end_datetime");
            entity.Property(e => e.AllocationType)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("allocation_type");
            entity.Property(e => e.AssignOrgId).HasColumnName("assign_org_id");
            entity.Property(e => e.CreatedAt)
                .HasColumnType("datetime")
                .HasColumnName("created_at");
            entity.Property(e => e.EmployeeId).HasColumnName("employee_id");
            entity.Property(e => e.ExpectedEndDatetime)
                .HasColumnType("datetime")
                .HasColumnName("expected_end_datetime");
            entity.Property(e => e.OwnerOrgId).HasColumnName("owner_org_id");
            entity.Property(e => e.StartDatetime)
                .HasColumnType("datetime")
                .HasColumnName("start_datetime");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("status");
            entity.Property(e => e.WorkforceRequestId).HasColumnName("workforce_request_id");

            entity.HasOne(d => d.AssignOrg).WithMany(p => p.EmployeeAllocationAssignOrgs)
                .HasForeignKey(d => d.AssignOrgId)
                .HasConstraintName("FK_Allocation_AssignedOrganization");

            entity.HasOne(d => d.Employee).WithMany(p => p.EmployeeAllocations)
                .HasForeignKey(d => d.EmployeeId)
                .HasConstraintName("FK_Allocation_Employee");

            entity.HasOne(d => d.OwnerOrg).WithMany(p => p.EmployeeAllocationOwnerOrgs)
                .HasForeignKey(d => d.OwnerOrgId)
                .HasConstraintName("FK_Allocation_OwnerOrganization");

            entity.HasOne(d => d.WorkforceRequest).WithMany(p => p.EmployeeAllocations)
                .HasForeignKey(d => d.WorkforceRequestId)
                .HasConstraintName("FK_Allocation_WorkforceRequest");
        });

        modelBuilder.Entity<EmployeeStatus>(entity =>
        {
            entity.HasKey(e => e.StatusHistoryId).HasName("PK__Employee__D79B1A25D31DC22E");

            entity.ToTable("Employee_Status");

            entity.Property(e => e.StatusHistoryId)
                .ValueGeneratedNever()
                .HasColumnName("status_history_id");
            entity.Property(e => e.ChangedAt)
                .HasColumnType("datetime")
                .HasColumnName("changed_at");
            entity.Property(e => e.ChangedBy).HasColumnName("changed_by");
            entity.Property(e => e.EmpId).HasColumnName("emp_id");
            entity.Property(e => e.NewStatus)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("new_status");
            entity.Property(e => e.OldStatus)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("old_status");
            entity.Property(e => e.Reason)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("reason");

            entity.HasOne(d => d.ChangedByNavigation).WithMany(p => p.EmployeeStatuses)
                .HasForeignKey(d => d.ChangedBy)
                .HasConstraintName("FK_EmployeeStatus_User");

            entity.HasOne(d => d.Emp).WithMany(p => p.EmployeeStatuses)
                .HasForeignKey(d => d.EmpId)
                .HasConstraintName("FK_EmployeeStatus_Employee");
        });

        modelBuilder.Entity<Organization>(entity =>
        {
            entity.HasKey(e => e.OrgId).HasName("PK__Organiza__F6AD8012A0A64F77");

            entity.ToTable("Organization");

            entity.Property(e => e.OrgId)
                .ValueGeneratedNever()
                .HasColumnName("org_id");
            entity.Property(e => e.Address)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("address");
            entity.Property(e => e.ApprovedAt)
                .HasColumnType("datetime")
                .HasColumnName("approved_at");
            entity.Property(e => e.Country)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("country");
            entity.Property(e => e.CreatedAt)
                .HasColumnType("datetime")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(150)
                .IsUnicode(false)
                .HasColumnName("email");
            entity.Property(e => e.OrgName)
                .HasMaxLength(150)
                .IsUnicode(false)
                .HasColumnName("org_name");
            entity.Property(e => e.Password)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("password");
            entity.Property(e => e.Phone)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("phone");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("status");
        });

        modelBuilder.Entity<OrganizationManager>(entity =>
        {
            entity.HasKey(e => e.ManagerId).HasName("PK__Organiza__5A6073FCC1E33638");

            entity.ToTable("Organization_Manager");

            entity.Property(e => e.ManagerId)
                .ValueGeneratedNever()
                .HasColumnName("manager_id");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.Org).WithMany(p => p.OrganizationManagers)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Manager_Organization");

            entity.HasOne(d => d.User).WithMany(p => p.OrganizationManagers)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_Manager_User");
        });

        modelBuilder.Entity<OrganizationReview>(entity =>
        {
            entity.HasKey(e => e.ReviewId).HasName("PK__Organiza__60883D90B589D83E");

            entity.ToTable("Organization_Reviews");

            entity.Property(e => e.ReviewId)
                .ValueGeneratedNever()
                .HasColumnName("review_id");
            entity.Property(e => e.AllocationId).HasColumnName("allocation_id");
            entity.Property(e => e.Comments)
                .HasMaxLength(500)
                .IsUnicode(false)
                .HasColumnName("comments");
            entity.Property(e => e.EmpId).HasColumnName("emp_id");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.Ratings)
                .HasColumnType("decimal(3, 2)")
                .HasColumnName("ratings");
            entity.Property(e => e.ReviewDate)
                .HasColumnType("datetime")
                .HasColumnName("review_date");

            entity.HasOne(d => d.Allocation).WithMany(p => p.OrganizationReviews)
                .HasForeignKey(d => d.AllocationId)
                .HasConstraintName("FK_Reviews_Allocation");

            entity.HasOne(d => d.Emp).WithMany(p => p.OrganizationReviews)
                .HasForeignKey(d => d.EmpId)
                .HasConstraintName("FK_Reviews_Employee");

            entity.HasOne(d => d.Org).WithMany(p => p.OrganizationReviews)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Reviews_Organization");
        });

        modelBuilder.Entity<Overtime>(entity =>
        {
            entity.HasKey(e => e.OvertimeId).HasName("PK__Overtime__B846E8114A5D63F5");

            entity.ToTable("Overtime");

            entity.Property(e => e.OvertimeId)
                .ValueGeneratedNever()
                .HasColumnName("overtime_id");
            entity.Property(e => e.Amount)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("amount");
            entity.Property(e => e.ApprovedBy).HasColumnName("approved_by");
            entity.Property(e => e.EmpId).HasColumnName("emp_id");
            entity.Property(e => e.EndTime).HasColumnName("end_time");
            entity.Property(e => e.HourlyRate)
                .HasColumnType("decimal(10, 2)")
                .HasColumnName("hourly_rate");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.StartTime).HasColumnName("start_time");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("status");
            entity.Property(e => e.TotalHours)
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("total_hours");
            entity.Property(e => e.WorkDate).HasColumnName("work_date");

            entity.HasOne(d => d.ApprovedByNavigation).WithMany(p => p.Overtimes)
                .HasForeignKey(d => d.ApprovedBy)
                .HasConstraintName("FK_Overtime_Manager");

            entity.HasOne(d => d.Emp).WithMany(p => p.Overtimes)
                .HasForeignKey(d => d.EmpId)
                .HasConstraintName("FK_Overtime_Employee");

            entity.HasOne(d => d.Org).WithMany(p => p.Overtimes)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Overtime_Organization");
        });

        modelBuilder.Entity<Report>(entity =>
        {
            entity.HasKey(e => e.ReportId).HasName("PK__Reports__779B7C5812AF0611");

            entity.Property(e => e.ReportId)
                .ValueGeneratedNever()
                .HasColumnName("report_id");
            entity.Property(e => e.CompId).HasColumnName("comp_id");
            entity.Property(e => e.IsSubmitted).HasColumnName("is_submitted");
            entity.Property(e => e.LevelOfQuery)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("level_of_query");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.OrgManagerReview)
                .HasMaxLength(1000)
                .IsUnicode(false)
                .HasColumnName("org_manager_review");

            entity.HasOne(d => d.Comp).WithMany(p => p.Reports)
                .HasForeignKey(d => d.CompId)
                .HasConstraintName("FK_Reports_Complaints");

            entity.HasOne(d => d.Org).WithMany(p => p.Reports)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_Reports_Organization");
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(e => e.RoleId).HasName("PK__Role__760965CCE28878E9");

            entity.ToTable("Role");

            entity.Property(e => e.RoleId)
                .ValueGeneratedNever()
                .HasColumnName("role_id");
            entity.Property(e => e.AssignAt)
                .HasColumnType("datetime")
                .HasColumnName("assign_at");
            entity.Property(e => e.Description)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("description");
            entity.Property(e => e.RoleType)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("role_type");
        });

        modelBuilder.Entity<Shift>(entity =>
        {
            entity.HasKey(e => e.ShiftId).HasName("PK__Shift__7B2672203B0C8659");

            entity.ToTable("Shift");

            entity.Property(e => e.ShiftId)
                .ValueGeneratedNever()
                .HasColumnName("shift_id");
            entity.Property(e => e.EndTime).HasColumnName("end_time");
            entity.Property(e => e.ShiftName)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("shift_name");
            entity.Property(e => e.StartTime).HasColumnName("start_time");
            entity.Property(e => e.StatusHistoryId).HasColumnName("status_history_id");

            entity.HasOne(d => d.StatusHistory).WithMany(p => p.Shifts)
                .HasForeignKey(d => d.StatusHistoryId)
                .HasConstraintName("FK_Shift_StatusHistory");
        });

        modelBuilder.Entity<Skill>(entity =>
        {
            entity.HasKey(e => e.SkillId).HasName("PK__Skills__FBBA8379D3DBB022");

            entity.Property(e => e.SkillId)
                .ValueGeneratedNever()
                .HasColumnName("skill_id");
            entity.Property(e => e.Description)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("description");
            entity.Property(e => e.EfficiencyLevel)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("efficiency_level");
            entity.Property(e => e.EmpId).HasColumnName("emp_id");
            entity.Property(e => e.SkillCategory)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("skill_category");
            entity.Property(e => e.SkillName)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("skill_name");
            entity.Property(e => e.YearsOfExperience).HasColumnName("years_of_experience");

            entity.HasOne(d => d.Emp).WithMany(p => p.Skills)
                .HasForeignKey(d => d.EmpId)
                .HasConstraintName("FK_Skills_Employee");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("PK__User__B9BE370F9F505B39");

            entity.ToTable("User");

            entity.Property(e => e.UserId)
                .ValueGeneratedNever()
                .HasColumnName("user_id");
            entity.Property(e => e.Age).HasColumnName("age");
            entity.Property(e => e.Cnic)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("cnic");
            entity.Property(e => e.Country)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("country");
            entity.Property(e => e.CreatedAt)
                .HasColumnType("datetime")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(150)
                .IsUnicode(false)
                .HasColumnName("email");
            entity.Property(e => e.IsActive).HasColumnName("is_active");
            entity.Property(e => e.Name)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("name");
            entity.Property(e => e.Password)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("password");
            entity.Property(e => e.PhoneNo)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("phone_no");
            entity.Property(e => e.RoleId).HasColumnName("role_id");

            entity.HasOne(d => d.Role).WithMany(p => p.Users)
                .HasForeignKey(d => d.RoleId)
                .HasConstraintName("FK_User_Role");
        });

        modelBuilder.Entity<WorkforceRequest>(entity =>
        {
            entity.HasKey(e => e.WorkforceRequestId).HasName("PK__Workforc__981EB22A95DF4C2D");

            entity.ToTable("Workforce_Request");

            entity.Property(e => e.WorkforceRequestId)
                .ValueGeneratedNever()
                .HasColumnName("workforce_request_id");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt)
                .HasColumnType("datetime")
                .HasColumnName("created_at");
            entity.Property(e => e.EndDatetime)
                .HasColumnType("datetime")
                .HasColumnName("end_datetime");
            entity.Property(e => e.OrgId).HasColumnName("org_id");
            entity.Property(e => e.Priority)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("priority");
            entity.Property(e => e.Reason)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("reason");
            entity.Property(e => e.RequestByOrgId).HasColumnName("request_by_org_id");
            entity.Property(e => e.RequiredEmployees).HasColumnName("required_employees");
            entity.Property(e => e.RequiredSkillId).HasColumnName("required_skill_id");
            entity.Property(e => e.StartDatetime)
                .HasColumnType("datetime")
                .HasColumnName("start_datetime");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.HasOne(d => d.Contract).WithMany(p => p.WorkforceRequests)
                .HasForeignKey(d => d.ContractId)
                .HasConstraintName("FK_WorkforceRequest_Contract");

            entity.HasOne(d => d.Org).WithMany(p => p.WorkforceRequestOrgs)
                .HasForeignKey(d => d.OrgId)
                .HasConstraintName("FK_WorkforceRequest_Organization");

            entity.HasOne(d => d.RequestByOrg).WithMany(p => p.WorkforceRequestRequestByOrgs)
                .HasForeignKey(d => d.RequestByOrgId)
                .HasConstraintName("FK_WorkforceRequest_RequestByOrganization");

            entity.HasOne(d => d.RequiredSkill).WithMany(p => p.WorkforceRequests)
                .HasForeignKey(d => d.RequiredSkillId)
                .HasConstraintName("FK_WorkforceRequest_Skill");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
