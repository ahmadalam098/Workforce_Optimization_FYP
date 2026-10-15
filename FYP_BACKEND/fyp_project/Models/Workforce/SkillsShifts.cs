using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/003_skills_shifts.sql

[Table("Skill_Master")]
public class SkillMaster
{
    [Key, Column("skill_master_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int SkillId { get; set; }

    [Column("name"), MaxLength(100)] public string Name { get; set; } = string.Empty;
    [Column("category"), MaxLength(100)] public string? Category { get; set; }
    [Column("description"), MaxLength(255)] public string? Description { get; set; }
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

[Table("Employee_Skill")]
public class EmployeeSkill
{
    [Key, Column("employee_skill_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int EmployeeSkillId { get; set; }

    [Column("emp_id")] public int EmpId { get; set; }
    [Column("skill_master_id")] public int SkillId { get; set; }
    [Column("proficiency"), MaxLength(30)] public string Proficiency { get; set; } = string.Empty;
    [Column("years_of_experience")] public int? YearsOfExperience { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("updated_at")] public DateTime? UpdatedAt { get; set; }

    [ForeignKey(nameof(SkillId))] public SkillMaster? Skill { get; set; }
    [ForeignKey(nameof(EmpId))] public Employee? Employee { get; set; }
}

[Table("Employee_Shift")]
public class EmployeeShift
{
    [Key, Column("assignment_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int AssignmentId { get; set; }

    [Column("emp_id")] public int EmpId { get; set; }
    [Column("shift_id")] public int ShiftId { get; set; }
    [Column("start_date")] public DateOnly StartDate { get; set; }
    [Column("end_date")] public DateOnly? EndDate { get; set; }
    [Column("assigned_by")] public int? AssignedBy { get; set; }
    [Column("notes"), MaxLength(255)] public string? Notes { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }

    [ForeignKey(nameof(ShiftId))] public Shift? Shift { get; set; }
    [ForeignKey(nameof(EmpId))] public Employee? Employee { get; set; }
}
