using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class Contract
{
    public int ContractId { get; set; }

    public int? OrgId { get; set; }

    public string? ContractNumber { get; set; }

    public TimeOnly? StartTime { get; set; }

    public TimeOnly? EndTime { get; set; }

    public int? MinEmployees { get; set; }

    public int? MaxEmployees { get; set; }

    public bool? BorrowingAllowed { get; set; }

    public string? PriorityLevel { get; set; }

    public string? BillingCurrency { get; set; }

    public decimal? BaseHourlyRate { get; set; }

    public decimal? ExtraHourlyRate { get; set; }

    public string? Status { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public virtual Organization? Org { get; set; }

    public virtual ICollection<WorkforceRequest> WorkforceRequests { get; set; } = new List<WorkforceRequest>();
}
