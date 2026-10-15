using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class Overtime
{
    public int OvertimeId { get; set; }

    public int? EmpId { get; set; }

    public int? OrgId { get; set; }

    public DateOnly? WorkDate { get; set; }

    public TimeOnly? StartTime { get; set; }

    public TimeOnly? EndTime { get; set; }

    public decimal? TotalHours { get; set; }

    public decimal? HourlyRate { get; set; }

    public decimal? Amount { get; set; }

    public string? Status { get; set; }

    public int? ApprovedBy { get; set; }

    public virtual OrganizationManager? ApprovedByNavigation { get; set; }

    public virtual Employee? Emp { get; set; }

    public virtual Organization? Org { get; set; }
}
