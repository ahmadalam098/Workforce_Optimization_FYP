using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    public class UserListItemDto
    {
        public bool HasPicture { get; set; }
        public int UserId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Cnic { get; set; }
        public string? Country { get; set; }
        public int? Age { get; set; }
        public string? RoleName { get; set; }
        public bool IsActive { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    /// <summary>Creates an Admin or Business Owner account.</summary>
    public class CreateUserRequest
    {
        [Required, StringLength(100), PersonName]
        public string FullName { get; set; } = string.Empty;

        [Required, EmailAddress, StringLength(150)]
        public string Email { get; set; } = string.Empty;

        [Required, StringLength(20), PhoneNumber]
        public string? Phone { get; set; }

        [Required, StringLength(20), Cnic]
        public string Cnic { get; set; } = string.Empty;

        [Range(16, 80)]
        public int? Age { get; set; }

        [StringLength(100), CountryName]
        public string? Country { get; set; }

        [Required, StringLength(100, MinimumLength = 8), StrongPassword]
        public string Password { get; set; } = string.Empty;

        /// <summary>"Admin" or "Business Owner".</summary>
        [Required]
        public string RoleType { get; set; } = string.Empty;
    }

    public class UpdateUserRequest
    {
        [StringLength(100), PersonName]
        public string? FullName { get; set; }

        [EmailAddress, StringLength(150)]
        public string? Email { get; set; }

        [StringLength(20), PhoneNumber]
        public string? Phone { get; set; }

        [StringLength(20), Cnic]
        public string? Cnic { get; set; }

        [Range(16, 80)]
        public int? Age { get; set; }

        [StringLength(100), CountryName]
        public string? Country { get; set; }
    }

    public class ManagerOrganizationDto
    {
        public int ManagerId { get; set; }
        public int? OrganizationId { get; set; }
        public string? OrganizationName { get; set; }
    }

    public class ManagerListItemDto : UserListItemDto
    {
        public List<ManagerOrganizationDto> Organizations { get; set; } = new();
    }

    public class CreateManagerRequest : CreateUserRequest
    {
        /// <summary>Up to 5 organizations this manager will handle.</summary>
        public List<int> OrganizationIds { get; set; } = new();
    }

    public class AssignOrganizationsRequest
    {
        public List<int> OrganizationIds { get; set; } = new();
    }
}
