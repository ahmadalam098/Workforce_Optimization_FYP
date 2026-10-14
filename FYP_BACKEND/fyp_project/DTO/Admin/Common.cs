using System.ComponentModel.DataAnnotations;

namespace fyp_project.DTOs.Admin
{
    public class PagedResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
    }

    public class SetActiveRequest
    {
        [Required]
        public bool? IsActive { get; set; }

        [StringLength(255)]
        public string? Reason { get; set; }
    }

    public class ResetPasswordRequest
    {
        [Required]
        [StringLength(100, MinimumLength = 8)]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class OrganizationLookupDto
    {
        public int OrganizationId { get; set; }
        public string? Name { get; set; }
        public string? Status { get; set; }
        public string? Country { get; set; }
    }
}
