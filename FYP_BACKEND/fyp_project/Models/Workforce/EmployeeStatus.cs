using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class EmployeeStatus
{
    public int StatusHistoryId { get; set; }

    public int? EmpId { get; set; }

    public string? OldStatus { get; set; }

    public string? NewStatus { get; set; }

    public DateTime? ChangedAt { get; set; }

    public string? Reason { get; set; }

    public int? ChangedBy { get; set; }

    public virtual User? ChangedByNavigation { get; set; }

    public virtual Employee? Emp { get; set; }

    public virtual ICollection<Employee> Employees { get; set; } = new List<Employee>();

    public virtual ICollection<Shift> Shifts { get; set; } = new List<Shift>();
}
