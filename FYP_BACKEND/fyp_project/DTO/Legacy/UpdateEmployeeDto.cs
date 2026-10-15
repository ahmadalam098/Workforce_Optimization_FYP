namespace fyp_project.DTOs
{
    public class UpdateEmployeeDto
    {
        public int EmployeeId { get; set; }

        public string? FullName { get; set; }

        public string? Email { get; set; }

        public string? Phone { get; set; }

        public string? Cnic { get; set; }

        public int? CurrentOrganizationId { get; set; }

        public string? EmployeeType { get; set; }

        public string? PersonaType { get; set; }

        public string? AvailabilityStatus { get; set; }

        public decimal? HourlyRate { get; set; }

        public bool? IsInSharedPool { get; set; }

        public decimal? Rating { get; set; }

        public byte? ProficiencyLevel { get; set; }

        public byte[]? Picture { get; set; }
    }
}
