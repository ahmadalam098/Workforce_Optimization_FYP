using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    // ---------------- Queries (tickets) ----------------

    public class TicketListItemDto
    {
        public int TicketId { get; set; }
        public string? TicketNumber { get; set; }
        public string Subject { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;

        /// <summary>Open or Resolved.</summary>
        public string Status { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public int? OrgId { get; set; }
        public string? OrgName { get; set; }
        public string? RaisedBy { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ResolvedAt { get; set; }

        /// <summary>When the organization manager sent this to the admin, who did, and their note.</summary>
        public DateTime? ForwardedAt { get; set; }
        public string? ForwardedBy { get; set; }
        public string? ForwardNote { get; set; }
    }

    public class TicketMessageDto
    {
        public int MessageId { get; set; }
        public string MessageType { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public string? Author { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class TicketDetailDto : TicketListItemDto
    {
        public string Description { get; set; } = string.Empty;
        public List<TicketMessageDto> Messages { get; set; } = new();
    }

    /// <summary>
    /// Logs a query for an organization, or for an employee (used for testing until the organization and employee sides send their own).
    /// With <see cref="EmployeeId"/> it is an employee's query and the organization is worked out from where the employee works.
    /// </summary>
    public class CreateTicketRequest
    {
        public int OrganizationId { get; set; }

        /// <summary>Set to log a query that an employee asked.</summary>
        public int? EmployeeId { get; set; }

        [Required, StringLength(150), MinTrimmedLength(5)] public string Subject { get; set; } = string.Empty;
        [Required, StringLength(2000), MinTrimmedLength(10)] public string Description { get; set; } = string.Empty;
        [StringLength(30)] public string? Category { get; set; }
        [StringLength(10)] public string? Priority { get; set; }
    }

    public class ResolveTicketRequest
    {
        /// <summary>How the query was resolved. It is emailed to the organization and its managers.</summary>
        [Required, StringLength(2000), MinTrimmedLength(5)] public string Comment { get; set; } = string.Empty;
    }

    public class TicketSummaryDto
    {
        public int Open { get; set; }
        public int Resolved { get; set; }
        public double AverageResolutionHours { get; set; }
    }

    // ---------------- Audit log ----------------

    public class AuditLogItemDto
    {
        public int AuditId { get; set; }
        public int? ActorUserId { get; set; }
        public string? ActorName { get; set; }
        public string Action { get; set; } = string.Empty;
        public string? EntityType { get; set; }
        public string? EntityId { get; set; }
        public string? Details { get; set; }
        public string? IpAddress { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class AuditActorDto
    {
        public int UserId { get; set; }
        public string? Name { get; set; }
    }

    public class AuditFacetsDto
    {
        public List<string> Actions { get; set; } = new();
        public List<string> EntityTypes { get; set; } = new();
        public List<AuditActorDto> Actors { get; set; } = new();
    }

    // ---------------- Reports ----------------

    public class UtilizationOrgDto
    {
        public int OrgId { get; set; }
        public string? OrgName { get; set; }
        public int Employees { get; set; }
        public decimal EmployeeHours { get; set; }
        public int PeakConcurrent { get; set; }
        public decimal AvgConcurrent { get; set; }
        public int? ContractMin { get; set; }
        public int? ContractMax { get; set; }
        /// <summary>Average employees working / contract maximum. Null when the organization has no active contract maximum.</summary>
        public decimal? UtilizationPct { get; set; }
    }

    public class WorkforceSnapshotDto
    {
        public int ActiveEmployees { get; set; }
        public int AllocatedNow { get; set; }
        public int AvailableNow { get; set; }
        public decimal AllocationRatePct { get; set; }
        public List<StatusCountDto> ByStatus { get; set; } = new();
    }

    public class UtilizationReportDto
    {
        public DateOnly From { get; set; }
        public DateOnly To { get; set; }
        public decimal PeriodHours { get; set; }
        public decimal TotalEmployeeHours { get; set; }
        public WorkforceSnapshotDto Snapshot { get; set; } = new();
        public List<UtilizationOrgDto> Organizations { get; set; } = new();
    }

    public class ActionCountDto
    {
        public string Action { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public class AllocationOrgDto
    {
        public int OrgId { get; set; }
        public string? OrgName { get; set; }
        public int Received { get; set; }
        public int Lost { get; set; }
    }

    public class DailyCountDto
    {
        public DateOnly Date { get; set; }
        public int Count { get; set; }
    }

    public class AllocationReportDto
    {
        public DateOnly From { get; set; }
        public DateOnly To { get; set; }
        public int TotalEvents { get; set; }
        public int AiCount { get; set; }
        public int ManualCount { get; set; }
        public int Overrides { get; set; }
        public int StartedNormal { get; set; }
        public int StartedTemporary { get; set; }
        public List<ActionCountDto> ByAction { get; set; } = new();
        public List<AllocationOrgDto> ByOrganization { get; set; } = new();
        public List<DailyCountDto> Daily { get; set; } = new();
    }

    public class FinancialMonthDto
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public List<CurrencyAmountDto> Invoiced { get; set; } = new();
        public decimal CollectedPkr { get; set; }
        public decimal PayrollPkr { get; set; }
        public decimal ProfitPkr { get; set; }
    }

    public class FinancialOrgDto
    {
        public int OrgId { get; set; }
        public string? OrgName { get; set; }
        public decimal CollectedPkr { get; set; }
        public int InvoicesIssued { get; set; }
    }

    public class FinancialReportDto
    {
        public DateOnly From { get; set; }
        public DateOnly To { get; set; }
        public decimal TotalCollectedPkr { get; set; }
        public decimal TotalPayrollPkr { get; set; }
        /// <summary>Calculated: collected - payroll. Never stored.</summary>
        public decimal TotalProfitPkr { get; set; }
        public List<CurrencyAmountDto> Outstanding { get; set; } = new();
        public List<CurrencyAmountDto> Overdue { get; set; } = new();
        public List<FinancialMonthDto> Months { get; set; } = new();
        public List<FinancialOrgDto> ByOrganization { get; set; } = new();
    }
}
