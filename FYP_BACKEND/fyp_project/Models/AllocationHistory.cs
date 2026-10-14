using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class AllocationHistory
{
    public int AllocationHistoryId { get; set; }

    public int? AllocationId { get; set; }

    public int? EmpId { get; set; }

    public int? FromOrgId { get; set; }

    public int? ToOrgId { get; set; }

    public string? ActionType { get; set; }

    public string? ActionReason { get; set; }

    public DateTime? ActionTime { get; set; }

    public int? PerformedByUserId { get; set; }

    public bool? IsAllocatedByAi { get; set; }

    public virtual EmployeeAllocation? Allocation { get; set; }

    public virtual Employee? Emp { get; set; }

    public virtual Organization? FromOrg { get; set; }

    public virtual User? PerformedByUser { get; set; }

    public virtual Organization? ToOrg { get; set; }
}
