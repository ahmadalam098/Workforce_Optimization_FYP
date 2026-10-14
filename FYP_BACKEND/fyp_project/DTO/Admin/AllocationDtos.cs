using System.ComponentModel.DataAnnotations;

namespace fyp_project.DTOs.Admin
{
    // ---- Allocations ----

    public class AllocationListItemDto
    {
        public int? UserId { get; set; }
        public bool HasPicture { get; set; }
        public int AllocationId { get; set; }
        public int? EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public int? OwnerOrgId { get; set; }
        public string? OwnerOrgName { get; set; }
        public int? AssignOrgId { get; set; }
        public string? AssignOrgName { get; set; }
        public string? AllocationType { get; set; }
        public string? Status { get; set; }
        public DateTime? StartDatetime { get; set; }
        public DateTime? ExpectedEndDatetime { get; set; }
        public DateTime? ActualEndDatetime { get; set; }
        public bool IsOpen { get; set; }
        /// <summary>True when the employee works for an organization other than their owner.</summary>
        public bool IsShared { get; set; }
    }

    public class HistoryItemDto
    {
        public int AllocationHistoryId { get; set; }
        public int? AllocationId { get; set; }
        public int? EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public string? ActionType { get; set; }
        public string? ActionReason { get; set; }
        public DateTime? ActionTime { get; set; }
        public int? FromOrgId { get; set; }
        public string? FromOrgName { get; set; }
        public int? ToOrgId { get; set; }
        public string? ToOrgName { get; set; }
        public string? PerformedBy { get; set; }
        public bool IsAllocatedByAi { get; set; }
    }

    public class AllocationDetailDto : AllocationListItemDto
    {
        public int? WorkforceRequestId { get; set; }
        public List<HistoryItemDto> History { get; set; } = new();
    }

    public class AllocateRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an employee.")]
        public int EmployeeId { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int AssignOrgId { get; set; }

        public DateTime? ExpectedEnd { get; set; }

        [Required, StringLength(200)] public string Reason { get; set; } = string.Empty;

        public int? WorkforceRequestId { get; set; }

        /// <summary>Continue even though overridable rules are broken (the override is written to the audit log).</summary>
        public bool? Force { get; set; }
    }

    public class ReallocateRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int AssignOrgId { get; set; }

        public DateTime? ExpectedEnd { get; set; }

        [Required, StringLength(200)] public string Reason { get; set; } = string.Empty;

        public bool? Force { get; set; }
    }

    public class AllocationReasonRequest
    {
        [Required, StringLength(200)] public string Reason { get; set; } = string.Empty;
    }

    public class ViolationInfoDto
    {
        public string Code { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public bool Overridable { get; set; }
    }

    public class EligibleEmployeeDto
    {
        public int EmployeeId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public int? HomeOrgId { get; set; }
        public string? HomeOrgName { get; set; }
        public string? AvailabilityStatus { get; set; }
    }

    // ---- Availability ----

    public class StatusCountDto
    {
        public string Status { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public class AvailabilityItemDto
    {
        public int? UserId { get; set; }
        public bool HasPicture { get; set; }
        public int EmployeeId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? AvailabilityStatus { get; set; }
        public DateTime? StatusSince { get; set; }
        public int? HomeOrgId { get; set; }
        public string? HomeOrgName { get; set; }
        public int? AllocationId { get; set; }
        public int? WorkingOrgId { get; set; }
        public string? WorkingOrgName { get; set; }
        public bool IsBorrowed { get; set; }
        public string? ShiftName { get; set; }
    }

    public class AvailabilitySummaryDto
    {
        public int Total { get; set; }
        public int Borrowed { get; set; }
        public List<StatusCountDto> ByStatus { get; set; } = new();
    }

    public class AvailabilityResult
    {
        public AvailabilitySummaryDto Summary { get; set; } = new();
        public List<AvailabilityItemDto> Items { get; set; } = new();
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public DateTime RefreshedAt { get; set; }
    }

    public class ViolationNoteRequest
    {
        [StringLength(500)] public string? Note { get; set; }
    }
}
