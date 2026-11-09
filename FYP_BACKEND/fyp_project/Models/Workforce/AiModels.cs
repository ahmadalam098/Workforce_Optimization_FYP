using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/025_ai_autopilot.sql

/// <summary>Autopilot switch of one organization (the organization manager turns it on or off).</summary>
[Table("Autopilot_Setting")]
public class AutopilotSetting
{
    [Key, Column("org_id"), DatabaseGenerated(DatabaseGeneratedOption.None)] public int OrgId { get; set; }
    [Column("enabled")] public bool Enabled { get; set; }
    [Column("last_run_at")] public DateTime? LastRunAt { get; set; }
    [Column("last_message"), MaxLength(500)] public string? LastMessage { get; set; }
    [Column("updated_by")] public int? UpdatedBy { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}

/// <summary>One choice of the AI: who goes where, how good the fit is, why, and what happened to the choice.</summary>
[Table("AI_Decision")]
public class AiDecision
{
    public const string Suggested = "Suggested";
    public const string Applied = "Applied";
    public const string Rejected = "Rejected";
    public const string Undone = "Undone";
    public const string Failed = "Failed";

    public const string KindMinimum = "Minimum";
    public const string KindRequest = "Request";
    public const string KindSubstitute = "Substitute";

    [Key, Column("decision_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int DecisionId { get; set; }
    [Column("org_id")] public int OrgId { get; set; }
    [Column("kind"), MaxLength(12)] public string Kind { get; set; } = KindMinimum;
    [Column("contract_id")] public int? ContractId { get; set; }
    [Column("workforce_request_id")] public int? WorkforceRequestId { get; set; }
    [Column("emp_id")] public int EmpId { get; set; }
    [Column("from_org_id")] public int? FromOrgId { get; set; }
    [Column("score", TypeName = "decimal(5,2)")] public decimal Score { get; set; }
    [Column("reason"), MaxLength(500)] public string Reason { get; set; } = string.Empty;
    [Column("breakdown"), MaxLength(1000)] public string? Breakdown { get; set; }
    [Column("alternatives"), MaxLength(1000)] public string? Alternatives { get; set; }
    [Column("status"), MaxLength(12)] public string Status { get; set; } = Suggested;
    [Column("planner"), MaxLength(20)] public string Planner { get; set; } = "Built-in";
    [Column("trigger_by"), MaxLength(12)] public string TriggerBy { get; set; } = "Autopilot";
    [Column("allocation_id")] public int? AllocationId { get; set; }
    [Column("loan_id")] public int? LoanId { get; set; }
    [Column("note"), MaxLength(255)] public string? Note { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("decided_at")] public DateTime? DecidedAt { get; set; }
    [Column("decided_by")] public int? DecidedBy { get; set; }
}

/// <summary>An employee working for another organization, and the recall (3 minutes) when the owner needs them back.</summary>
[Table("Employee_Loan")]
public class EmployeeLoan
{
    public const string Lent = "Lent";
    public const string RecallRequested = "RecallRequested";
    public const string Returned = "Returned";

    [Key, Column("loan_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int LoanId { get; set; }
    [Column("emp_id")] public int EmpId { get; set; }
    [Column("lender_org_id")] public int LenderOrgId { get; set; }
    [Column("borrower_org_id")] public int BorrowerOrgId { get; set; }
    [Column("borrower_allocation_id")] public int? BorrowerAllocationId { get; set; }
    [Column("status"), MaxLength(16)] public string Status { get; set; } = Lent;
    [Column("lent_at")] public DateTime LentAt { get; set; }
    [Column("expected_return_at")] public DateTime? ExpectedReturnAt { get; set; }
    [Column("recall_requested_at")] public DateTime? RecallRequestedAt { get; set; }
    [Column("recall_deadline")] public DateTime? RecallDeadline { get; set; }
    [Column("recall_reason"), MaxLength(255)] public string? RecallReason { get; set; }
    [Column("substitute_emp_id")] public int? SubstituteEmpId { get; set; }
    [Column("returned_at")] public DateTime? ReturnedAt { get; set; }
    [Column("decision_id")] public int? DecisionId { get; set; }
}
