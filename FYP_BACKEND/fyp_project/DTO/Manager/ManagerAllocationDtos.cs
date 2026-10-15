using System.ComponentModel.DataAnnotations;

namespace fyp_project.DTOs.Manager
{
    /// <summary>Assign an employee from the pool to one of the manager's organizations.</summary>
    public class ManagerAssignRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an employee.")]
        public int EmployeeId { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int OrganizationId { get; set; }

        public DateTime? ExpectedEnd { get; set; }

        [Required, StringLength(200, MinimumLength = 3)]
        public string Reason { get; set; } = string.Empty;
    }

    /// <summary>Move an employee from one of the manager's organizations to another of them.</summary>
    public class ManagerMoveRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int OrganizationId { get; set; }

        public DateTime? ExpectedEnd { get; set; }

        [Required, StringLength(200, MinimumLength = 3)]
        public string Reason { get; set; } = string.Empty;
    }

    public class ManagerReleaseRequest
    {
        [Required, StringLength(200, MinimumLength = 3)]
        public string Reason { get; set; } = string.Empty;
    }
}
