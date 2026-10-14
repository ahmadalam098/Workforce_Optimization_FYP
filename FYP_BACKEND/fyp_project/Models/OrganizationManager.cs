using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class OrganizationManager
{
    public int ManagerId { get; set; }

    public int? UserId { get; set; }

    public int? OrgId { get; set; }

    public virtual Organization? Org { get; set; }

    public virtual ICollection<Overtime> Overtimes { get; set; } = new List<Overtime>();

    public virtual User? User { get; set; }
}
