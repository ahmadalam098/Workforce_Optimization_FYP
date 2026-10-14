using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

public partial class Role
{
    public int RoleId { get; set; }

    public string? RoleType { get; set; }

    public string? Description { get; set; }

    public DateTime? AssignAt { get; set; }

    [NotMapped]
    public string? RoleName { get => RoleType; set => RoleType = value; }

    [NotMapped]
    public DateTime? CreatedAt { get => AssignAt; set => AssignAt = value; }

    public virtual ICollection<Employee> Employees { get; set; } = new List<Employee>();

    public virtual ICollection<User> Users { get; set; } = new List<User>();
}
