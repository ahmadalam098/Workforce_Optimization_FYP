using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/005_billing.sql

[Table("Exchange_Rate")]
public class ExchangeRate
{
    [Key, Column("rate_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int RateId { get; set; }

    [Column("from_currency"), MaxLength(10)] public string FromCurrency { get; set; } = string.Empty;
    [Column("to_currency"), MaxLength(10)] public string ToCurrency { get; set; } = string.Empty;
    [Column("rate", TypeName = "decimal(18,6)")] public decimal Rate { get; set; }
    [Column("effective_date")] public DateOnly EffectiveDate { get; set; }
    [Column("created_by")] public int? CreatedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

[Table("Payment_Rule")]
public class PaymentRule
{
    [Key, Column("rule_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int RuleId { get; set; }

    [Column("rule_key"), MaxLength(50)] public string RuleKey { get; set; } = string.Empty;
    [Column("title"), MaxLength(150)] public string Title { get; set; } = string.Empty;
    [Column("rule_value", TypeName = "decimal(18,4)")] public decimal Value { get; set; }
    [Column("unit"), MaxLength(30)] public string? Unit { get; set; }
    [Column("description"), MaxLength(255)] public string? Description { get; set; }
    [Column("is_system")] public bool IsSystem { get; set; }
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("updated_by")] public int? UpdatedBy { get; set; }
    [Column("updated_at")] public DateTime? UpdatedAt { get; set; }
}

[Table("Invoice")]
public class Invoice
{
    [Key, Column("invoice_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int InvoiceId { get; set; }

    [Column("invoice_number"), MaxLength(30)] public string? InvoiceNumber { get; set; }
    [Column("org_id")] public int OrgId { get; set; }
    [Column("contract_id")] public int? ContractId { get; set; }
    [Column("period_start")] public DateOnly PeriodStart { get; set; }
    [Column("period_end")] public DateOnly PeriodEnd { get; set; }
    [Column("currency"), MaxLength(10)] public string Currency { get; set; } = "USD";
    [Column("total_amount", TypeName = "decimal(14,2)")] public decimal TotalAmount { get; set; }
    [Column("paid_amount", TypeName = "decimal(14,2)")] public decimal PaidAmount { get; set; }
    [Column("status"), MaxLength(20)] public string Status { get; set; } = "Draft";
    [Column("issue_date")] public DateOnly? IssueDate { get; set; }
    [Column("due_date")] public DateOnly? DueDate { get; set; }
    [Column("notes"), MaxLength(500)] public string? Notes { get; set; }
    [Column("cancel_reason"), MaxLength(255)] public string? CancelReason { get; set; }
    [Column("created_by")] public int? CreatedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    /// <summary>Set when the ADMIN verified the invoice and issued it (migration 011 added the columns for the manager; since migration 023 the admin verifies).</summary>
    [Column("verified_at")] public DateTime? VerifiedAt { get; set; }
    [Column("verified_by")] public int? VerifiedBy { get; set; }
    /// <summary>Set when the organization manager sent the draft to the admin for verification (migration 023). Null = still being prepared.</summary>
    [Column("submitted_at")] public DateTime? SubmittedAt { get; set; }
    [Column("submitted_by")] public int? SubmittedBy { get; set; }
    /// <summary>Why the admin sent the draft back to the manager (cleared when the manager sends it again).</summary>
    [Column("returned_reason"), MaxLength(255)] public string? ReturnedReason { get; set; }

    [ForeignKey(nameof(OrgId))] public Organization? Org { get; set; }
}

[Table("Invoice_Line")]
public class InvoiceLine
{
    [Key, Column("line_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int LineId { get; set; }

    [Column("invoice_id")] public int InvoiceId { get; set; }
    [Column("line_type"), MaxLength(20)] public string LineType { get; set; } = "Adjustment";
    [Column("description"), MaxLength(255)] public string Description { get; set; } = string.Empty;
    [Column("quantity", TypeName = "decimal(12,2)")] public decimal Quantity { get; set; }
    [Column("unit_rate", TypeName = "decimal(10,2)")] public decimal UnitRate { get; set; }
    [Column("amount", TypeName = "decimal(14,2)")] public decimal Amount { get; set; }
}

[Table("Invoice_Payment")]
public class InvoicePayment
{
    [Key, Column("payment_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int PaymentId { get; set; }

    [Column("invoice_id")] public int InvoiceId { get; set; }
    [Column("amount", TypeName = "decimal(14,2)")] public decimal Amount { get; set; }
    [Column("currency"), MaxLength(10)] public string Currency { get; set; } = "USD";
    [Column("exchange_rate", TypeName = "decimal(18,6)")] public decimal ExchangeRate { get; set; } = 1;
    [Column("amount_pkr", TypeName = "decimal(14,2)")] public decimal AmountPkr { get; set; }
    [Column("paid_at")] public DateTime PaidAt { get; set; }
    [Column("method"), MaxLength(30)] public string? Method { get; set; }
    [Column("reference"), MaxLength(100)] public string? Reference { get; set; }
    [Column("notes"), MaxLength(255)] public string? Notes { get; set; }
    [Column("recorded_by")] public int? RecordedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    /// <summary>Set when the organization's manager has verified that this payment was made (migration 011).</summary>
    [Column("verified_at")] public DateTime? VerifiedAt { get; set; }
    [Column("verified_by")] public int? VerifiedBy { get; set; }
}
