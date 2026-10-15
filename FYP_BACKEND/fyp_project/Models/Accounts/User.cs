using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

public partial class User
{
    public int UserId { get; set; }

    public string? Name { get; set; }

    public int? Age { get; set; }

    public string? PhoneNo { get; set; }

    public string? Email { get; set; }

    public string? Country { get; set; }

    public string? Password { get; set; }

    public int? RoleId { get; set; }

    public string? Cnic { get; set; }

    public bool? IsActive { get; set; }

    public DateTime? CreatedAt { get; set; }

    /// <summary>Where the profile picture file is, inside the uploads folder (migration 008). Null = no picture.</summary>
    [Column("profile_picture_path")]
    public string? ProfilePicturePath { get; set; }

    [NotMapped]
    public string? FullName { get => Name; set => Name = value; }

    [NotMapped]
    public string? Phone { get => PhoneNo; set => PhoneNo = value; }

    [NotMapped]
    public string? PasswordHash { get => Password; set => Password = value; }

    [NotMapped]
    public DateTime? LastLogin { get; set; }

    public virtual ICollection<AllocationHistory> AllocationHistories { get; set; } = new List<AllocationHistory>();

    public virtual ICollection<EmployeeStatus> EmployeeStatuses { get; set; } = new List<EmployeeStatus>();

    public virtual ICollection<Employee> Employees { get; set; } = new List<Employee>();

    public virtual ICollection<OrganizationManager> OrganizationManagers { get; set; } = new List<OrganizationManager>();

    public virtual Role? Role { get; set; }
}
