using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Created by FYP_DB/migrations/021_payments_documents.sql
/// <summary>An organization says it paid an invoice. The manager verifies, the admin approves; only then the real payment (and receipt) exists.</summary>
[Table("Payment_Submission")]
public class PaymentSubmission
{
    public const string Pending = "Pending";
    public const string Verified = "Verified";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string Withdrawn = "Withdrawn";

    [Key, Column("submission_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int SubmissionId { get; set; }
    [Column("invoice_id")] public int InvoiceId { get; set; }
    [Column("org_id")] public int OrgId { get; set; }
    [Column("amount", TypeName = "decimal(14,2)")] public decimal Amount { get; set; }
    [Column("currency"), MaxLength(10)] public string Currency { get; set; } = "USD";
    [Column("method"), MaxLength(30)] public string Method { get; set; } = string.Empty;
    [Column("reference"), MaxLength(100)] public string? Reference { get; set; }
    [Column("paid_on")] public DateOnly PaidOn { get; set; }
    [Column("note"), MaxLength(255)] public string? Note { get; set; }
    [Column("proof_path"), MaxLength(260)] public string? ProofPath { get; set; }
    [Column("proof_name"), MaxLength(150)] public string? ProofName { get; set; }
    [Column("status"), MaxLength(12)] public string Status { get; set; } = Pending;
    [Column("submitted_at")] public DateTime SubmittedAt { get; set; }
    [Column("verified_by")] public int? VerifiedBy { get; set; }
    [Column("verified_at")] public DateTime? VerifiedAt { get; set; }
    [Column("decided_by")] public int? DecidedBy { get; set; }
    [Column("decided_at")] public DateTime? DecidedAt { get; set; }
    [Column("decision_note"), MaxLength(255)] public string? DecisionNote { get; set; }
    [Column("payment_id")] public int? PaymentId { get; set; }

    public bool IsOpen => Status is Pending or Verified;
}

/// <summary>Where an employee's salary is paid. Shown on the payroll sheet; the employee fills it in, the admin can correct it.</summary>
[Table("Employee_Bank")]
public class EmployeeBank
{
    [Key, Column("emp_id"), DatabaseGenerated(DatabaseGeneratedOption.None)] public int EmpId { get; set; }
    [Column("bank_name"), MaxLength(100)] public string BankName { get; set; } = string.Empty;
    [Column("account_title"), MaxLength(100)] public string AccountTitle { get; set; } = string.Empty;
    [Column("account_number"), MaxLength(40)] public string AccountNumber { get; set; } = string.Empty;
    [Column("updated_by")] public int? UpdatedBy { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}
