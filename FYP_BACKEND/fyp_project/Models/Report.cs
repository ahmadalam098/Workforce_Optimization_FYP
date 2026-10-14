using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class Report
{
    public int ReportId { get; set; }

    public int? CompId { get; set; }

    public int? OrgId { get; set; }

    public string? OrgManagerReview { get; set; }

    public string? LevelOfQuery { get; set; }

    public bool? IsSubmitted { get; set; }

    public virtual Complaint? Comp { get; set; }

    public virtual Organization? Org { get; set; }
}
