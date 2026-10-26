using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    public class EmployeeListItemDto
    {
        public bool HasPicture { get; set; }
        public int EmployeeId { get; set; }
        public int? UserId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Cnic { get; set; }
        public string? Country { get; set; }
        public int? Age { get; set; }
        public int? OrganizationId { get; set; }
        public string? OrganizationName { get; set; }

        /// <summary>The organization the employee works for right now (open allocation). Null when not allocated.</summary>
        public int? WorkingOrgId { get; set; }
        public string? WorkingOrgName { get; set; }

        /// <summary>True when the employee works for an organization other than their home organization (or the central pool).</summary>
        public bool IsWorkingElsewhere { get; set; }
        public DateOnly? JoiningDate { get; set; }
        public string? AvailabilityStatus { get; set; }
        public decimal? Rating { get; set; }
        public bool IsActive { get; set; }
        public List<string?> Skills { get; set; } = new();
        public string? ShiftName { get; set; }
    }

    public class EmployeeSkillDto
    {
        public int SkillId { get; set; }
        public string? SkillName { get; set; }
        public string? SkillCategory { get; set; }
        public string? EfficiencyLevel { get; set; }
        public int? YearsOfExperience { get; set; }
    }

    public class EmployeeStatusEventDto
    {
        public int StatusHistoryId { get; set; }
        public string? OldStatus { get; set; }
        public string? NewStatus { get; set; }
        public DateTime? ChangedAt { get; set; }
        public string? Reason { get; set; }
        public string? ChangedBy { get; set; }
    }

    public class EmployeeAllocationEventDto
    {
        public int AllocationHistoryId { get; set; }
        public string? ActionType { get; set; }
        public string? ActionReason { get; set; }
        public DateTime? ActionTime { get; set; }
        public string? FromOrganization { get; set; }
        public string? ToOrganization { get; set; }
        public bool? IsAllocatedByAi { get; set; }
    }

    public class EmployeeDetailDto : EmployeeListItemDto
    {
        public DateTime? CreatedAt { get; set; }
        public List<EmployeeSkillDto> SkillDetails { get; set; } = new();
        public EmployeeShiftDto? CurrentShift { get; set; }
        public List<EmployeeShiftDto> ShiftHistory { get; set; } = new();
        public List<EmployeeStatusEventDto> StatusHistory { get; set; } = new();
        public List<EmployeeAllocationEventDto> AllocationHistory { get; set; } = new();
    }

    /// <summary>A skill given to an employee while the employee is being added or edited.</summary>
    public class EmployeeSkillInput
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select a skill.")]
        public int SkillId { get; set; }

        [Required, StringLength(30)]
        public string Proficiency { get; set; } = string.Empty;

        [Range(0, 60)]
        public int? YearsOfExperience { get; set; }
    }

    public class CreateEmployeeRequest
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

        public int? OrganizationId { get; set; }

        public DateOnly? JoiningDate { get; set; }

        [StringLength(50)]
        public string? AvailabilityStatus { get; set; }

        /// <summary>Skills the employee has (each with a level), saved together with the employee.</summary>
        public List<EmployeeSkillInput>? Skills { get; set; }

        /// <summary>The shift the employee works, saved together with the employee.</summary>
        public int? ShiftId { get; set; }
    }

    public class UpdateEmployeeRequest
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

        /// <summary>Set to move the employee to another organization.</summary>
        public int? OrganizationId { get; set; }

        /// <summary>Set true to remove the employee from their organization (back to the central pool).</summary>
        public bool? ClearOrganization { get; set; }

        public DateOnly? JoiningDate { get; set; }

        [StringLength(50)]
        public string? AvailabilityStatus { get; set; }

        [StringLength(255)]
        public string? StatusReason { get; set; }

        /// <summary>When sent, this is the complete list of the employee's skills: new ones are added, listed ones updated, others removed.</summary>
        public List<EmployeeSkillInput>? Skills { get; set; }

        /// <summary>Move the employee to this shift.</summary>
        public int? ShiftId { get; set; }

        /// <summary>Set true to take the employee off their current shift.</summary>
        public bool? ClearShift { get; set; }
    }
}
