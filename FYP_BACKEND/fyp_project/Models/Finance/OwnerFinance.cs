using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/024_expenses_owner_payouts.sql

/// <summary>One expense of the company (PKR), written down by the admin. The description is optional.</summary>
[Table("Company_Expense")]
public class CompanyExpense
{
    [Key, Column("expense_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int ExpenseId { get; set; }
    [Column("expense_date")] public DateOnly ExpenseDate { get; set; }
    [Column("amount_pkr", TypeName = "decimal(14,2)")] public decimal AmountPkr { get; set; }
    [Column("description"), MaxLength(255)] public string? Description { get; set; }
    [Column("created_by")] public int? CreatedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("voided_at")] public DateTime? VoidedAt { get; set; }
    [Column("voided_by")] public int? VoidedBy { get; set; }
    [Column("void_reason"), MaxLength(255)] public string? VoidReason { get; set; }

    public bool IsVoided => VoidedAt != null;
}

/// <summary>One "send the profit to the owners" action of the admin.</summary>
[Table("Owner_Settlement")]
public class OwnerSettlement
{
    [Key, Column("settlement_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int SettlementId { get; set; }
    [Column("settled_at")] public DateTime SettledAt { get; set; }
    [Column("period_year")] public int PeriodYear { get; set; }
    [Column("period_month")] public int PeriodMonth { get; set; }
    [Column("amount_pkr", TypeName = "decimal(14,2)")] public decimal AmountPkr { get; set; }
    [Column("received_pkr", TypeName = "decimal(14,2)")] public decimal ReceivedPkr { get; set; }
    [Column("expenses_pkr", TypeName = "decimal(14,2)")] public decimal ExpensesPkr { get; set; }
    [Column("previously_sent_pkr", TypeName = "decimal(14,2)")] public decimal PreviouslySentPkr { get; set; }
    [Column("owner_count")] public int OwnerCount { get; set; }
    [Column("note"), MaxLength(255)] public string? Note { get; set; }
    [Column("settled_by")] public int? SettledBy { get; set; }
}

/// <summary>One owner's share of a settlement. The owner gets a receipt and a notification for it.</summary>
[Table("Owner_Payout")]
public class OwnerPayout
{
    [Key, Column("payout_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int PayoutId { get; set; }
    [Column("settlement_id")] public int SettlementId { get; set; }
    [Column("owner_user_id")] public int OwnerUserId { get; set; }
    [Column("amount_pkr", TypeName = "decimal(14,2)")] public decimal AmountPkr { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }

    [ForeignKey(nameof(SettlementId))] public OwnerSettlement? Settlement { get; set; }
    [ForeignKey(nameof(OwnerUserId))] public User? Owner { get; set; }
}
