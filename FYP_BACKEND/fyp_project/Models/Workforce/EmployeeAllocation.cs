using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class EmployeeAllocation
{
    public int AllocationId { get; set; }

    public int? EmployeeId { get; set; }

    public int? OwnerOrgId { get; set; }

    public int? AssignOrgId { get; set; }

    public int? WorkforceRequestId { get; set; }

    public string? AllocationType { get; set; }

    public DateTime? StartDatetime { get; set; }

    public DateTime? ExpectedEndDatetime { get; set; }

    public DateTime? ActualEndDatetime { get; set; }

    public string? Status { get; set; }

    public DateTime? CreatedAt { get; set; }

    /// <summary>Set when the system appointed this employee as the daily minimum of a daily contract (migration 015). It ends with the day's window.</summary>
    [System.ComponentModel.DataAnnotations.Schema.Column("daily_contract_id")]
    public int? DailyContractId { get; set; }

    public virtual ICollection<AllocationHistory> AllocationHistories { get; set; } = new List<AllocationHistory>();

    public virtual Organization? AssignOrg { get; set; }

    public virtual Employee? Employee { get; set; }

    public virtual ICollection<OrganizationReview> OrganizationReviews { get; set; } = new List<OrganizationReview>();

    public virtual Organization? OwnerOrg { get; set; }

    public virtual WorkforceRequest? WorkforceRequest { get; set; }
}
