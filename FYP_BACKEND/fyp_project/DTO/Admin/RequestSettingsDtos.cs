using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    // ---- staff (workforce) requests

    public class WorkforceRequestListItemDto
    {
        public int RequestId { get; set; }
        public int? OrgId { get; set; }
        public string? OrgName { get; set; }
        public int? RequiredEmployees { get; set; }
        public int StaffedNow { get; set; }
        public string? SkillName { get; set; }
        public string? Priority { get; set; }
        public DateTime? StartDatetime { get; set; }
        public DateTime? EndDatetime { get; set; }
        public string? Reason { get; set; }
        public string? Status { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class WorkforceRequestSummaryDto
    {
        public int Pending { get; set; }
        public int UrgentPending { get; set; }
        public int ApprovedUnstaffed { get; set; }
        public int ApprovedStaffed { get; set; }
        public int Rejected { get; set; }
    }

    public class RequestContractDto
    {
        public int ContractId { get; set; }
        public int? MinEmployees { get; set; }
        public int? MaxEmployees { get; set; }
        public int AllocatedToOrganizationNow { get; set; }
    }

    public class RequestAllocationDto
    {
        public int AllocationId { get; set; }
        public int? EmployeeId { get; set; }
        public string? EmployeeName { get; set; }
        public string? AllocationType { get; set; }
        public string? Status { get; set; }
        public DateTime? StartDatetime { get; set; }
        public DateTime? ExpectedEndDatetime { get; set; }
        public bool IsOpen { get; set; }
    }

    public class RequestReviewDto
    {
        public string Decision { get; set; } = string.Empty;
        public string? Note { get; set; }
        public string? ReviewedBy { get; set; }
        public DateTime ReviewedAt { get; set; }
    }

    public class RequestCandidateDto
    {
        public int EmployeeId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public int? HomeOrgId { get; set; }
        public string? HomeOrgName { get; set; }
        public string? AvailabilityStatus { get; set; }
        public decimal? Rating { get; set; }
        public bool SameOrganization { get; set; }
    }

    public class WorkforceRequestDetailDto : WorkforceRequestListItemDto
    {
        public int? ContractId { get; set; }
        public int? SkillId { get; set; }
        public RequestContractDto? Contract { get; set; }
        public int StillNeeded { get; set; }
        public List<string> Warnings { get; set; } = new();
        public List<RequestAllocationDto> Allocations { get; set; } = new();
        public List<RequestReviewDto> Reviews { get; set; } = new();
        public List<RequestCandidateDto> Candidates { get; set; } = new();
    }

    public class CreateWorkforceRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int OrganizationId { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Enter how many employees are needed.")]
        public int RequiredEmployees { get; set; }

        public int? SkillId { get; set; }

        [Required(ErrorMessage = "Select a priority.")] public string Priority { get; set; } = "Medium";

        public DateTime StartDatetime { get; set; }
        public DateTime EndDatetime { get; set; }

        [Required(ErrorMessage = "Give a reason."), StringLength(255), MinTrimmedLength(5)] public string Reason { get; set; } = string.Empty;
    }

    public class RequestDecisionRequest
    {
        [StringLength(500)] public string? Note { get; set; }
    }

    // ---- settings

    public class SettingOptionDto
    {
        public string Value { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
    }

    public class SettingDto
    {
        public string Key { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string Group { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public string Unit { get; set; } = string.Empty;
        public string Value { get; set; } = string.Empty;
        public string Default { get; set; } = string.Empty;
        public int Min { get; set; }
        public int Max { get; set; }
        public List<SettingOptionDto> Options { get; set; } = new();
        public bool IsDefault { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
    }

    public class SaveSettingRequest
    {
        /// <summary>The new value as text (numbers as digits, switches as true/false). Null puts the setting back to its default.</summary>
        public string? Value { get; set; }
    }
}
