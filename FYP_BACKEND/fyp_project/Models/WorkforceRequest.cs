using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class WorkforceRequest
{
    public int WorkforceRequestId { get; set; }

    public int? OrgId { get; set; }

    public int? RequestByOrgId { get; set; }

    public int? ContractId { get; set; }

    public int? RequiredEmployees { get; set; }

    public int? RequiredSkillId { get; set; }

    public string? Priority { get; set; }

    public DateTime? StartDatetime { get; set; }

    public DateTime? EndDatetime { get; set; }

    public string? Reason { get; set; }

    public string? Status { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual Contract? Contract { get; set; }

    public virtual ICollection<EmployeeAllocation> EmployeeAllocations { get; set; } = new List<EmployeeAllocation>();

    public virtual Organization? Org { get; set; }

    public virtual Organization? RequestByOrg { get; set; }

    public virtual Skill? RequiredSkill { get; set; }
}
