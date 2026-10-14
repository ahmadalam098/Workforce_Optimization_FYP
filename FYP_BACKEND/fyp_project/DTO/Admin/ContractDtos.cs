using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    /// <summary>The negotiable terms of a contract. Used for input, and as the base of version output.</summary>
    public class ContractTermsDto
    {
        public DateOnly? StartDate { get; set; }
        public DateOnly? EndDate { get; set; }
        public TimeOnly? StartTime { get; set; }
        public TimeOnly? EndTime { get; set; }

        [Range(0, 100000)] public int? MinEmployees { get; set; }
        [Range(0, 100000)] public int? MaxEmployees { get; set; }

        public bool? BorrowingAllowed { get; set; }

        [Range(0, 100000)] public int? MaxBorrowedEmployees { get; set; }

        [StringLength(50)] public string? PriorityLevel { get; set; }
        [StringLength(10)] public string? BillingCurrency { get; set; }
        [StringLength(30)] public string? BillingCycle { get; set; }

        [Range(0, 100000)] public decimal? BaseHourlyRate { get; set; }
        [Range(0, 100000)] public decimal? ExtraHourlyRate { get; set; }
    }

    public class CreateContractRequest : ContractTermsDto
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int OrganizationId { get; set; }

        [StringLength(100)] public string? ContractNumber { get; set; }
    }

    public class UpdateContractRequest : ContractTermsDto
    {
        [StringLength(100)] public string? ContractNumber { get; set; }

        /// <summary>What changed and why. Required when an approved (live) contract is edited; it becomes the note of the new version.</summary>
        [StringLength(500)] public string? ChangeSummary { get; set; }
    }

    public class DecisionRequest
    {
        [StringLength(500)] public string? Reason { get; set; }
    }

    public class ContractListItemDto
    {
        public int ContractId { get; set; }
        public string? ContractNumber { get; set; }
        public int? OrganizationId { get; set; }
        public string? OrganizationName { get; set; }
        public string? Status { get; set; }
        public int VersionNo { get; set; }
        public DateOnly? StartDate { get; set; }
        public DateOnly? EndDate { get; set; }
        public int? MinEmployees { get; set; }
        public int? MaxEmployees { get; set; }
        public decimal? BaseHourlyRate { get; set; }
        public decimal? ExtraHourlyRate { get; set; }
        public string? BillingCurrency { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class ContractVersionDto : ContractTermsDto
    {
        public int VersionNo { get; set; }
        public string? ChangeSummary { get; set; }
        public string? CreatedBy { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class ContractRuleDto
    {
        public int RuleId { get; set; }
        public string Category { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? RuleValue { get; set; }
        public string? Description { get; set; }
        public bool IsActive { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class DecisionDto
    {
        public string? Decision { get; set; }
        public string? Reason { get; set; }
        public string? DecidedBy { get; set; }
        public DateTime? DecidedAt { get; set; }
    }

    public class ContractDetailDto
    {
        public int ContractId { get; set; }
        public string? ContractNumber { get; set; }
        public int? OrganizationId { get; set; }
        public string? OrganizationName { get; set; }
        public string? OrganizationStatus { get; set; }
        public string? Status { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? ApprovedAt { get; set; }
        public int VersionNo { get; set; }
        public ContractTermsDto Terms { get; set; } = new();
        public List<ContractVersionDto> Versions { get; set; } = new();
        public List<ContractRuleDto> Rules { get; set; } = new();
        public List<DecisionDto> Decisions { get; set; } = new();
    }

    public class RuleRequest
    {
        [Required, StringLength(30)] public string Category { get; set; } = string.Empty;
        [Required, StringLength(150)] public string Title { get; set; } = string.Empty;
        [StringLength(255)] public string? RuleValue { get; set; }
        [StringLength(500)] public string? Description { get; set; }
        public bool? IsActive { get; set; }
    }

    // ---- Organizations ----

    public class OrganizationListItemDto
    {
        public int OrganizationId { get; set; }
        public string? Name { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Country { get; set; }
        public string? Status { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? ApprovedAt { get; set; }
        public int EmployeeCount { get; set; }
        public int ContractCount { get; set; }
        public int ActiveContractCount { get; set; }
    }

    public class OrganizationContractSummaryDto
    {
        public int ContractId { get; set; }
        public string? ContractNumber { get; set; }
        public string? Status { get; set; }
        public int? MinEmployees { get; set; }
        public int? MaxEmployees { get; set; }
        public DateOnly? StartDate { get; set; }
        public DateOnly? EndDate { get; set; }
    }

    public class OrganizationManagerSummaryDto
    {
        public int UserId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public bool IsActive { get; set; }
    }

    public class OrganizationDetailDto : OrganizationListItemDto
    {
        public string? Address { get; set; }
        public int AvailableEmployeeCount { get; set; }
        public List<OrganizationContractSummaryDto> Contracts { get; set; } = new();
        public List<OrganizationManagerSummaryDto> Managers { get; set; } = new();
        public List<DecisionDto> Decisions { get; set; } = new();
    }

    public class SaveOrganizationRequest
    {
        [Required, StringLength(150), OrganizationName] public string Name { get; set; } = string.Empty;
        [Required, EmailAddress, StringLength(150)] public string Email { get; set; } = string.Empty;
        [Required, StringLength(20), PhoneNumber] public string? Phone { get; set; }
        [Required, StringLength(255, MinimumLength = 5)] public string? Address { get; set; }
        [Required, StringLength(100), CountryName] public string? Country { get; set; }

        /// <summary>Create only: mark the organization as Active right away instead of Pending.</summary>
        public bool? ApproveImmediately { get; set; }
    }
}
