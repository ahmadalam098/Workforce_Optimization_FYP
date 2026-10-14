using System;
using System.Collections.Generic;

namespace fyp_project.Models;

public partial class Skill
{
    public int SkillId { get; set; }

    public int? EmpId { get; set; }

    public string? SkillName { get; set; }

    public string? Description { get; set; }

    public string? SkillCategory { get; set; }

    public string? EfficiencyLevel { get; set; }

    public int? YearsOfExperience { get; set; }

    public virtual Employee? Emp { get; set; }

    public virtual ICollection<WorkforceRequest> WorkforceRequests { get; set; } = new List<WorkforceRequest>();
}
