using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    // ---- Invoices ----

    public class InvoiceLineDto
    {
        public int LineId { get; set; }
        public string LineType { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public decimal UnitRate { get; set; }
        public decimal Amount { get; set; }
    }

    public class InvoicePaymentDto
    {
        public int PaymentId { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public decimal ExchangeRate { get; set; }
        public decimal AmountPkr { get; set; }
        public DateTime PaidAt { get; set; }
        public string? Method { get; set; }
        public string? Reference { get; set; }
        public string? Notes { get; set; }
        public string? RecordedBy { get; set; }
        /// <summary>When the organization manager verified this payment, and who.</summary>
        public DateTime? VerifiedAt { get; set; }
        public string? VerifiedBy { get; set; }
    }

    public class InvoiceListItemDto
    {
        public int InvoiceId { get; set; }
        public string? InvoiceNumber { get; set; }
        public int OrgId { get; set; }
        public string? OrgName { get; set; }
        public string Currency { get; set; } = string.Empty;
        public DateOnly PeriodStart { get; set; }
        public DateOnly PeriodEnd { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal PaidAmount { get; set; }
        public decimal Balance { get; set; }
        /// <summary>Stored status: Draft / Issued / Paid / Cancelled.</summary>
        public string Status { get; set; } = string.Empty;
        /// <summary>Draft / Issued / PartiallyPaid / Overdue / Paid / Cancelled (worked out from dates and payments).</summary>
        public string DisplayStatus { get; set; } = string.Empty;
        public DateOnly? IssueDate { get; set; }
        public DateOnly? DueDate { get; set; }
    }

    public class InvoiceDetailDto : InvoiceListItemDto
    {
        public int? ContractId { get; set; }
        public string? ContractNumber { get; set; }
        public string? Notes { get; set; }
        public string? CancelReason { get; set; }
        public DateTime CreatedAt { get; set; }
        /// <summary>When the organization manager verified the invoice, and who.</summary>
        public DateTime? VerifiedAt { get; set; }
        public string? VerifiedBy { get; set; }
        public List<InvoiceLineDto> Lines { get; set; } = new();
        public List<InvoicePaymentDto> Payments { get; set; } = new();
    }

    public class InvoicePreviewDto
    {
        public int OrgId { get; set; }
        public string? OrgName { get; set; }
        public int? ContractId { get; set; }
        public string? ContractNumber { get; set; }
        public string Currency { get; set; } = string.Empty;
        public DateOnly PeriodStart { get; set; }
        public DateOnly PeriodEnd { get; set; }
        /// <summary>Employees paid at the base rate (the contract minimum); above this the extra rate applies.</summary>
        public int? BaseEmployees { get; set; }
        public decimal BaseHours { get; set; }
        public decimal ExtraHours { get; set; }
        public int AllocationCount { get; set; }
        public decimal Total { get; set; }
        public List<InvoiceLineDto> Lines { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    public class InvoicePreviewRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int OrgId { get; set; }

        [Required] public DateOnly? PeriodStart { get; set; }
        [Required] public DateOnly? PeriodEnd { get; set; }
    }

    public class CreateInvoiceRequest : InvoicePreviewRequest
    {
        [StringLength(500)] public string? Notes { get; set; }
    }

    public class AdjustmentLineRequest
    {
        [Required, StringLength(255), MinTrimmedLength(3)] public string Description { get; set; } = string.Empty;
        [Range(-1000000, 1000000)] public decimal Quantity { get; set; } = 1;
        [Range(-1000000, 1000000)] public decimal UnitRate { get; set; }
    }

    public class RecordPaymentRequest
    {
        [Range(0.01, 1000000000)] public decimal Amount { get; set; }
        public DateTime? PaidAt { get; set; }
        [StringLength(30)] public string? Method { get; set; }
        [StringLength(100)] public string? Reference { get; set; }
        [StringLength(255)] public string? Notes { get; set; }

        /// <summary>Currency -> PKR rate. Needed only when no exchange rate is stored for the invoice currency.</summary>
        [Range(0.000001, 1000000)] public decimal? ExchangeRate { get; set; }
    }

    public class CancelInvoiceRequest
    {
        [Required, StringLength(255), MinTrimmedLength(3)] public string Reason { get; set; } = string.Empty;
    }

    public class CurrencyAmountDto
    {
        public string Currency { get; set; } = string.Empty;
        public decimal Amount { get; set; }
    }

    public class FinanceSummaryDto
    {
        public string Month { get; set; } = string.Empty;
        public List<CurrencyAmountDto> Outstanding { get; set; } = new();
        public List<CurrencyAmountDto> Overdue { get; set; } = new();
        public int OverdueInvoices { get; set; }
        public int DraftInvoices { get; set; }
        /// <summary>Payments received this month, in PKR (each payment converted at the rate stored with it).</summary>
        public decimal CollectedThisMonthPkr { get; set; }
        /// <summary>Payroll runs of this month that are approved or paid, in PKR.</summary>
        public decimal PayrollThisMonthPkr { get; set; }
        /// <summary>Calculated, never stored: collected - payroll.</summary>
        public decimal ProfitThisMonthPkr { get; set; }
        public bool HasExchangeRate { get; set; }
    }

    public class OrgPaymentStatusDto
    {
        public int OrgId { get; set; }
        public string? OrgName { get; set; }
        public string Currency { get; set; } = string.Empty;
        public int InvoiceCount { get; set; }
        public decimal Invoiced { get; set; }
        public decimal Paid { get; set; }
        public decimal Outstanding { get; set; }
        public decimal Overdue { get; set; }
        public DateTime? LastPaymentAt { get; set; }
    }

    // ---- Salaries ----

    public class SalaryListItemDto
    {
        public int? UserId { get; set; }
        public bool HasPicture { get; set; }
        public int EmployeeId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? OrganizationName { get; set; }
        public int? StructureId { get; set; }
        public decimal? MonthlySalary { get; set; }
        public string? Currency { get; set; }
        /// <summary>The fixed overtime rate, when one is set.</summary>
        public decimal? OvertimeRate { get; set; }
        /// <summary>The rate that is actually used: the fixed one, or salary / working hours x multiplier.</summary>
        public decimal? EffectiveOvertimeRate { get; set; }
        public DateOnly? EffectiveFrom { get; set; }
    }

    public class SalaryStructureDto
    {
        public int StructureId { get; set; }
        public decimal MonthlySalary { get; set; }
        public string Currency { get; set; } = string.Empty;
        public decimal? OvertimeRate { get; set; }
        public decimal EffectiveOvertimeRate { get; set; }
        public DateOnly EffectiveFrom { get; set; }
        public DateOnly? EffectiveTo { get; set; }
        public string? Notes { get; set; }
        public string? CreatedBy { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class SaveSalaryRequest
    {
        [Range(0, 1000000000)] public decimal MonthlySalary { get; set; }
        [Required, StringLength(10, MinimumLength = 3), RegularExpression(@"^[A-Za-z]{3}$", ErrorMessage = "Currency must be a 3-letter code such as PKR.")] public string Currency { get; set; } = "PKR";
        [Range(0, 1000000)] public decimal? OvertimeRate { get; set; }
        public DateOnly? EffectiveFrom { get; set; }
        [StringLength(255)] public string? Notes { get; set; }
    }

    // ---- Payroll ----

    public class PayrollRunListItemDto
    {
        public int PayrollId { get; set; }
        public int PeriodYear { get; set; }
        public int PeriodMonth { get; set; }
        public string Status { get; set; } = string.Empty;
        public int EmployeeCount { get; set; }
        public decimal TotalPkr { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ApprovedAt { get; set; }
        public DateTime? PaidAt { get; set; }
    }

    public class PayrollItemDto
    {
        public int ItemId { get; set; }
        public int EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public string Currency { get; set; } = string.Empty;
        public decimal ExchangeRate { get; set; }
        public decimal BaseSalary { get; set; }
        public decimal OvertimeHours { get; set; }
        public decimal OvertimeAmount { get; set; }
        public decimal Adjustment { get; set; }
        public string? AdjustmentNote { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal TotalPkr { get; set; }
    }

    public class PayrollDetailDto : PayrollRunListItemDto
    {
        public string? Notes { get; set; }
        public List<PayrollItemDto> Items { get; set; } = new();
    }

    public class CreatePayrollRequest
    {
        [Range(2000, 2100)] public int Year { get; set; }
        [Range(1, 12)] public int Month { get; set; }
        [StringLength(255)] public string? Notes { get; set; }
    }

    public class UpdatePayrollItemRequest
    {
        [Range(-1000000000, 1000000000)] public decimal Adjustment { get; set; }
        [StringLength(255)] public string? AdjustmentNote { get; set; }
    }

    // ---- Overtime ----

    public class OvertimeListItemDto
    {
        public int OvertimeId { get; set; }
        public int? EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public string? OrganizationName { get; set; }
        public DateOnly? WorkDate { get; set; }
        public decimal? TotalHours { get; set; }
        public decimal? HourlyRate { get; set; }
        public decimal? Amount { get; set; }
        public string? Currency { get; set; }
        public string? Status { get; set; }
    }

    public class CreateOvertimeRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an employee.")]
        public int EmployeeId { get; set; }

        public int? OrganizationId { get; set; }

        [Required] public DateOnly? WorkDate { get; set; }

        [Range(0.25, 24)] public decimal TotalHours { get; set; }
    }

    // ---- Payment rules and exchange rates ----

    public class PaymentRuleDto
    {
        public int RuleId { get; set; }
        public string RuleKey { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public decimal Value { get; set; }
        public string? Unit { get; set; }
        public string? Description { get; set; }
        public bool IsSystem { get; set; }
        public bool IsActive { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SavePaymentRuleRequest
    {
        /// <summary>Required when creating; ignored when editing (keys never change).</summary>
        [StringLength(50), RegularExpression(@"^[A-Z][A-Z0-9_]{2,49}$", ErrorMessage = "Use 3 to 50 capital letters, digits or _ , starting with a letter.")] public string? RuleKey { get; set; }
        [Required, StringLength(150)] public string Title { get; set; } = string.Empty;
        [Range(0, 1000000000)] public decimal Value { get; set; }
        [StringLength(30)] public string? Unit { get; set; }
        [StringLength(255)] public string? Description { get; set; }
    }

    public class ExchangeRateDto
    {
        public int RateId { get; set; }
        public string FromCurrency { get; set; } = string.Empty;
        public string ToCurrency { get; set; } = string.Empty;
        public decimal Rate { get; set; }
        public DateOnly EffectiveDate { get; set; }
        public string? CreatedBy { get; set; }
    }

    public class SaveExchangeRateRequest
    {
        [Required, StringLength(10, MinimumLength = 3), RegularExpression(@"^[A-Za-z]{3}$", ErrorMessage = "Currency must be a 3-letter code such as PKR.")] public string FromCurrency { get; set; } = string.Empty;
        [Required, StringLength(10, MinimumLength = 3), RegularExpression(@"^[A-Za-z]{3}$", ErrorMessage = "Currency must be a 3-letter code such as PKR.")] public string ToCurrency { get; set; } = "PKR";
        [Range(0.000001, 1000000)] public decimal Rate { get; set; }
        [Required] public DateOnly? EffectiveDate { get; set; }
    }
}
