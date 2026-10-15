using System.ComponentModel.DataAnnotations;

namespace fyp_project.DTOs
{
    public class AddEmployeeDto
    {
        [Required]
        public string FullName { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        public string? Phone { get; set; }

        [Required]
        public string Cnic { get; set; } = string.Empty;

        [Required]
        public string Password { get; set; } = string.Empty;

        [Range(1, int.MaxValue)]
        public int CurrentOrganizationId { get; set; }

        [Required]
        public string EmployeeType { get; set; } = string.Empty;

        [Required]
        public string PersonaType { get; set; } = string.Empty;

        [Required]
        public string AvailabilityStatus { get; set; } = string.Empty;

        public decimal HourlyRate { get; set; }

        public bool IsInSharedPool { get; set; }

        public decimal? Rating { get; set; }

        public byte? ProficiencyLevel { get; set; }

        public byte[]? Picture { get; set; }
    }
}
