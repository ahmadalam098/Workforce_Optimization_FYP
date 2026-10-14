using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: the skills of one employee, with proficiency and years of experience.</summary>
    [Route("api/admin/employees/{employeeId:int}/skills")]
    public class AdminEmployeeSkillsController : AdminControllerBase
    {
        public static readonly string[] Proficiencies = { "Beginner", "Intermediate", "Advanced", "Expert" };

        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public AdminEmployeeSkillsController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // GET api/admin/employees/5/skills
        [HttpGet]
        public async Task<IActionResult> List(int employeeId)
        {
            if (!await _db.Employees.AnyAsync(e => e.EmpId == employeeId)) return NotFoundMessage("Employee not found.");

            var items = await _db.EmployeeSkills
                .AsNoTracking()
                .Where(s => s.EmpId == employeeId)
                .OrderBy(s => s.Skill!.Name)
                .Select(s => new EmployeeSkillDto
                {
                    SkillId = s.SkillId,
                    SkillName = s.Skill!.Name,
                    SkillCategory = s.Skill.Category,
                    EfficiencyLevel = s.Proficiency,
                    YearsOfExperience = s.YearsOfExperience,
                })
                .ToListAsync();

            return Ok(items);
        }

        // POST api/admin/employees/5/skills   { skillId, proficiency, yearsOfExperience }
        [HttpPost]
        public async Task<IActionResult> Add(int employeeId, [FromBody] EmployeeSkillRequest request)
        {
            if (!Proficiencies.Contains(request.Proficiency))
                return FieldError("proficiency", "Proficiency must be Beginner, Intermediate, Advanced or Expert.");

            var employeeName = await _db.Employees
                .Where(e => e.EmpId == employeeId)
                .Select(e => e.User!.Name)
                .FirstOrDefaultAsync();
            if (employeeName == null && !await _db.Employees.AnyAsync(e => e.EmpId == employeeId))
                return NotFoundMessage("Employee not found.");

            var skill = await _db.SkillMasters.AsNoTracking().FirstOrDefaultAsync(s => s.SkillId == request.SkillId);
            if (skill == null) return FieldError("skillId", "The selected skill does not exist.");
            if (!skill.IsActive) return FieldError("skillId", "This skill is deactivated.");

            if (await _db.EmployeeSkills.AnyAsync(s => s.EmpId == employeeId && s.SkillId == request.SkillId))
                return ConflictMessage("The employee already has this skill. Edit it instead.");

            _db.EmployeeSkills.Add(new EmployeeSkill
            {
                EmpId = employeeId,
                SkillId = request.SkillId,
                Proficiency = request.Proficiency,
                YearsOfExperience = request.YearsOfExperience,
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_SKILL_ADDED", "Employee", employeeId,
                $"{skill.Name} ({request.Proficiency}) for {employeeName}");
            return Ok(new { message = $"{skill.Name} added.", employeeId, skillId = request.SkillId });
        }

        // PUT api/admin/employees/5/skills/3   { proficiency, yearsOfExperience }
        [HttpPut("{skillId:int}")]
        public async Task<IActionResult> Update(int employeeId, int skillId, [FromBody] EmployeeSkillRequest request)
        {
            if (!Proficiencies.Contains(request.Proficiency))
                return FieldError("proficiency", "Proficiency must be Beginner, Intermediate, Advanced or Expert.");

            var entry = await _db.EmployeeSkills.Include(s => s.Skill).FirstOrDefaultAsync(s => s.EmpId == employeeId && s.SkillId == skillId);
            if (entry == null) return NotFoundMessage("The employee does not have this skill.");

            entry.Proficiency = request.Proficiency;
            entry.YearsOfExperience = request.YearsOfExperience;
            entry.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_SKILL_UPDATED", "Employee", employeeId,
                $"{entry.Skill?.Name} -> {request.Proficiency}");
            return Ok(new { message = "Skill updated.", employeeId, skillId });
        }

        // DELETE api/admin/employees/5/skills/3
        [HttpDelete("{skillId:int}")]
        public async Task<IActionResult> Remove(int employeeId, int skillId)
        {
            var entry = await _db.EmployeeSkills.Include(s => s.Skill).FirstOrDefaultAsync(s => s.EmpId == employeeId && s.SkillId == skillId);
            if (entry == null) return NotFoundMessage("The employee does not have this skill.");

            _db.EmployeeSkills.Remove(entry);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_SKILL_REMOVED", "Employee", employeeId, entry.Skill?.Name);
            return Ok(new { message = "Skill removed.", employeeId, skillId });
        }
    }
}
