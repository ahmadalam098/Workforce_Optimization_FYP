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

    // Migration 017: how the organization manager handled a bad review (New, Warned, Escalated, Dismissed, Resolved).
    [System.ComponentModel.DataAnnotations.Schema.Column("status")] public string? Status { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.Column("handled_by_user_id")] public int? HandledByUserId { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.Column("handled_at")] public DateTime? HandledAt { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.Column("handled_note")] public string? HandledNote { get; set; }

    public virtual EmployeeAllocation? Allocation { get; set; }

    public virtual Employee? Emp { get; set; }

    public virtual Organization? Org { get; set; }
}
