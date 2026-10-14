using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

public partial class Employee
{
    public int EmpId { get; set; }

    [NotMapped]
    public int EmployeeId { get => EmpId; set => EmpId = value; }

    public int? UserId { get; set; }

    public int? RoleId { get; set; }

    public DateOnly? JoiningDate { get; set; }

    public int? OrgId { get; set; }

    [NotMapped]
    public int? CurrentOrganizationId { get => OrgId; set => OrgId = value; }

    public string? AvailabilityStatus { get; set; }

    public decimal? HourlyRate { get; set; }

    public decimal? Rating { get; set; }

    public int? StatusHistoryId { get; set; }

    [NotMapped]
    public string? EmployeeType { get; set; }

    [NotMapped]
    public string? PersonaType { get; set; }

    [NotMapped]
    public bool? IsInSharedPool { get; set; }

    [NotMapped]
    public int? ProficiencyLevel { get; set; }

    [NotMapped]
    public byte[]? Picture { get; set; }

    [NotMapped]
    public DateTime? CreatedAt { get; set; }

    public virtual ICollection<AllocationHistory> AllocationHistories { get; set; } = new List<AllocationHistory>();

    public virtual ICollection<EmployeeAllocation> EmployeeAllocations { get; set; } = new List<EmployeeAllocation>();

    public virtual ICollection<EmployeeStatus> EmployeeStatuses { get; set; } = new List<EmployeeStatus>();

    public virtual Organization? Org { get; set; }

    public virtual ICollection<OrganizationReview> OrganizationReviews { get; set; } = new List<OrganizationReview>();

    public virtual ICollection<Overtime> Overtimes { get; set; } = new List<Overtime>();

    public virtual Role? Role { get; set; }

    public virtual ICollection<Skill> Skills { get; set; } = new List<Skill>();

    public virtual EmployeeStatus? StatusHistory { get; set; }

    public virtual User? User { get; set; }
}
