using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class Shift
{
    public int ShiftId { get; set; }

    public string? ShiftName { get; set; }

    public TimeOnly? StartTime { get; set; }

    public TimeOnly? EndTime { get; set; }

    public int? StatusHistoryId { get; set; }

    public virtual EmployeeStatus? StatusHistory { get; set; }
}
