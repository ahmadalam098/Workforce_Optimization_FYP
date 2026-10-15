using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class Complaint
{
    public int CompId { get; set; }

    public int? OrgId { get; set; }

    public string? Complaints { get; set; }

    public virtual Organization? Org { get; set; }

    public virtual ICollection<Report> Reports { get; set; } = new List<Report>();
}
