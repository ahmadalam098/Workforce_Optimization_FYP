using System.ComponentModel.DataAnnotations;
using fyp_project.Validation;

namespace fyp_project.DTOs.Admin
{
    // ---- Skills ----

    public class SkillListItemDto
    {
        public int SkillId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Category { get; set; }
        public string? Description { get; set; }
        public bool IsActive { get; set; }
        public int EmployeeCount { get; set; }
    }

    public class SkillLookupDto
    {
        public int SkillId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Category { get; set; }
    }

    public class SaveSkillRequest
    {
        [Required, StringLength(100), MinTrimmedLength(2)] public string Name { get; set; } = string.Empty;
        [StringLength(100)] public string? Category { get; set; }
        [StringLength(255)] public string? Description { get; set; }
    }

    public class EmployeeSkillRequest
    {
        /// <summary>Required when adding a skill; ignored when updating (the skill is in the URL).</summary>
        public int SkillId { get; set; }

        [Required, StringLength(30)] public string Proficiency { get; set; } = string.Empty;

        [Range(0, 60)] public int? YearsOfExperience { get; set; }
    }

    // ---- Shifts ----

    public class ShiftListItemDto
    {
        public int ShiftId { get; set; }
        public string Name { get; set; } = string.Empty;
        public TimeOnly? StartTime { get; set; }
        public TimeOnly? EndTime { get; set; }
        public bool IsOvernight { get; set; }
        public int DurationMinutes { get; set; }
        public int AssignedCount { get; set; }
    }

    public class ShiftAssignmentDto
    {
        public int? UserId { get; set; }
        public bool HasPicture { get; set; }
        public int AssignmentId { get; set; }
        public int EmployeeId { get; set; }
        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? OrganizationName { get; set; }
        public string? AvailabilityStatus { get; set; }
        public DateOnly StartDate { get; set; }
        public bool IsActive { get; set; }
    }

    public class ShiftDetailDto : ShiftListItemDto
    {
        public List<ShiftAssignmentDto> Assignments { get; set; } = new();
    }

    public class SaveShiftRequest
    {
        [Required, StringLength(100), MinTrimmedLength(2)] public string Name { get; set; } = string.Empty;
        [Required] public TimeOnly? StartTime { get; set; }
        [Required] public TimeOnly? EndTime { get; set; }
    }

    public class EmployeeIdsRequest
    {
        [Required, MinLength(1, ErrorMessage = "Select at least one employee.")]
        public List<int> EmployeeIds { get; set; } = new();
    }

    public class SetEmployeeShiftRequest
    {
        /// <summary>The shift to assign, or null to remove the employee from their current shift.</summary>
        public int? ShiftId { get; set; }
    }

    public class EmployeeShiftDto
    {
        public int AssignmentId { get; set; }
        public int ShiftId { get; set; }
        public string? ShiftName { get; set; }
        public TimeOnly? StartTime { get; set; }
        public TimeOnly? EndTime { get; set; }
        public DateOnly StartDate { get; set; }
        public DateOnly? EndDate { get; set; }
    }
}
