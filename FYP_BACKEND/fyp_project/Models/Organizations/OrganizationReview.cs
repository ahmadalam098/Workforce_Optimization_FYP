using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class OrganizationReview
{
    public int ReviewId { get; set; }

    public int? OrgId { get; set; }

    public int? EmpId { get; set; }

    public int? AllocationId { get; set; }

    public decimal? Ratings { get; set; }

    public string? Comments { get; set; }

    public DateTime? ReviewDate { get; set; }

    public virtual EmployeeAllocation? Allocation { get; set; }

    public virtual Employee? Emp { get; set; }

    public virtual Organization? Org { get; set; }
}
