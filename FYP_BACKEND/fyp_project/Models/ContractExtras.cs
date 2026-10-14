using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/002_contracts.sql

[Table("Contract_Version")]
public class ContractVersion
{
    [Key, Column("version_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int VersionId { get; set; }

    [Column("contract_id")] public int ContractId { get; set; }
    [Column("version_no")] public int VersionNo { get; set; }
    [Column("start_date")] public DateOnly? StartDate { get; set; }
    [Column("end_date")] public DateOnly? EndDate { get; set; }
    [Column("start_time")] public TimeOnly? StartTime { get; set; }
    [Column("end_time")] public TimeOnly? EndTime { get; set; }
    [Column("min_employees")] public int? MinEmployees { get; set; }
    [Column("max_employees")] public int? MaxEmployees { get; set; }
    [Column("borrowing_allowed")] public bool? BorrowingAllowed { get; set; }
    [Column("max_borrowed_employees")] public int? MaxBorrowedEmployees { get; set; }
    [Column("priority_level"), MaxLength(50)] public string? PriorityLevel { get; set; }
    [Column("billing_currency"), MaxLength(10)] public string? BillingCurrency { get; set; }
    [Column("billing_cycle"), MaxLength(30)] public string? BillingCycle { get; set; }
    [Column("base_hourly_rate", TypeName = "decimal(10,2)")] public decimal? BaseHourlyRate { get; set; }
    [Column("extra_hourly_rate", TypeName = "decimal(10,2)")] public decimal? ExtraHourlyRate { get; set; }
    [Column("change_summary"), MaxLength(500)] public string? ChangeSummary { get; set; }
    [Column("created_by")] public int? CreatedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

[Table("Contract_Rule")]
public class ContractRule
{
    [Key, Column("rule_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int RuleId { get; set; }

    [Column("contract_id")] public int ContractId { get; set; }
    [Column("category"), MaxLength(30)] public string Category { get; set; } = string.Empty;
    [Column("title"), MaxLength(150)] public string Title { get; set; } = string.Empty;
    [Column("rule_value"), MaxLength(255)] public string? RuleValue { get; set; }
    [Column("description"), MaxLength(500)] public string? Description { get; set; }
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("created_by")] public int? CreatedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

[Table("Contract_Modification_Request")]
public class ContractModificationRequest
{
    [Key, Column("modification_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ModificationId { get; set; }

    [Column("contract_id")] public int ContractId { get; set; }
    [Column("requested_by_user_id")] public int? RequestedByUserId { get; set; }
    [Column("proposed_min_employees")] public int? ProposedMinEmployees { get; set; }
    [Column("proposed_max_employees")] public int? ProposedMaxEmployees { get; set; }
    [Column("proposed_borrowing_allowed")] public bool? ProposedBorrowingAllowed { get; set; }
    [Column("proposed_max_borrowed")] public int? ProposedMaxBorrowed { get; set; }
    [Column("proposed_priority_level"), MaxLength(50)] public string? ProposedPriorityLevel { get; set; }
    [Column("proposed_base_hourly_rate", TypeName = "decimal(10,2)")] public decimal? ProposedBaseHourlyRate { get; set; }
    [Column("proposed_extra_hourly_rate", TypeName = "decimal(10,2)")] public decimal? ProposedExtraHourlyRate { get; set; }
    [Column("proposed_end_date")] public DateOnly? ProposedEndDate { get; set; }
    [Column("reason"), MaxLength(500)] public string? Reason { get; set; }
    [Column("status"), MaxLength(30)] public string Status { get; set; } = "Pending";
    [Column("admin_response"), MaxLength(500)] public string? AdminResponse { get; set; }
    [Column("reviewed_by")] public int? ReviewedBy { get; set; }
    [Column("reviewed_at")] public DateTime? ReviewedAt { get; set; }
    [Column("result_version_no")] public int? ResultVersionNo { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

[Table("Approval_Decision")]
public class ApprovalDecision
{
    [Key, Column("decision_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int DecisionId { get; set; }

    [Column("entity_type"), MaxLength(30)] public string EntityType { get; set; } = string.Empty;
    [Column("entity_id")] public int EntityId { get; set; }
    [Column("decision"), MaxLength(30)] public string Decision { get; set; } = string.Empty;
    [Column("reason"), MaxLength(500)] public string? Reason { get; set; }
    [Column("decided_by")] public int? DecidedBy { get; set; }
    [Column("decided_at")] public DateTime DecidedAt { get; set; }
}
