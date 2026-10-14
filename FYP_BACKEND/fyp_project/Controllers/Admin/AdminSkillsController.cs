using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: the skill catalog (English, German, Customer Support ...). Skills are deactivated, not deleted.</summary>
    [Route("api/admin/skills")]
    public class AdminSkillsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public AdminSkillsController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // GET api/admin/skills?search=&category=&active=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? category, bool? active, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.SkillMasters.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(s => s.Name.Contains(term) || (s.Category != null && s.Category.Contains(term)));
            }

            if (!string.IsNullOrWhiteSpace(category)) query = query.Where(s => s.Category == category);
            if (active.HasValue) query = query.Where(s => s.IsActive == active.Value);

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(s => s.Name)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(s => new SkillListItemDto
                {
                    SkillId = s.SkillId,
                    Name = s.Name,
                    Category = s.Category,
                    Description = s.Description,
                    IsActive = s.IsActive,
                    EmployeeCount = _db.EmployeeSkills.Count(es => es.SkillId == s.SkillId),
                })
                .ToListAsync();

            return Ok(new PagedResult<SkillListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/skills/lookup   (active skills for dropdowns)
        [HttpGet("lookup")]
        public async Task<IActionResult> Lookup()
        {
            var items = await _db.SkillMasters
                .AsNoTracking()
                .Where(s => s.IsActive)
                .OrderBy(s => s.Name)
                .Select(s => new SkillLookupDto { SkillId = s.SkillId, Name = s.Name, Category = s.Category })
                .ToListAsync();

            return Ok(items);
        }

        // GET api/admin/skills/categories
        [HttpGet("categories")]
        public async Task<IActionResult> Categories()
        {
            var items = await _db.SkillMasters
                .AsNoTracking()
                .Where(s => s.Category != null && s.Category != "")
                .Select(s => s.Category!)
                .Distinct()
                .OrderBy(c => c)
                .ToListAsync();

            return Ok(items);
        }

        // POST api/admin/skills
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] SaveSkillRequest request)
        {
            var name = request.Name.Trim();
            if (await _db.SkillMasters.AnyAsync(s => s.Name == name))
                return ConflictMessage("A skill with this name already exists.");

            var skill = new SkillMaster
            {
                Name = name,
                Category = ContractLogic.Clean(request.Category),
                Description = ContractLogic.Clean(request.Description),
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
            };
            _db.SkillMasters.Add(skill);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "SKILL_CREATED", "Skill", skill.SkillId, skill.Name);
            return Ok(new { message = "Skill added.", skillId = skill.SkillId });
        }

        // PUT api/admin/skills/5
        [HttpPut("{skillId:int}")]
        public async Task<IActionResult> Update(int skillId, [FromBody] SaveSkillRequest request)
        {
            var skill = await _db.SkillMasters.FirstOrDefaultAsync(s => s.SkillId == skillId);
            if (skill == null) return NotFoundMessage("Skill not found.");

            var name = request.Name.Trim();
            if (await _db.SkillMasters.AnyAsync(s => s.SkillId != skillId && s.Name == name))
                return ConflictMessage("Another skill already has this name.");

            skill.Name = name;
            skill.Category = ContractLogic.Clean(request.Category);
            skill.Description = ContractLogic.Clean(request.Description);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "SKILL_UPDATED", "Skill", skillId, skill.Name);
            return Ok(new { message = "Skill updated.", skillId });
        }

        // DELETE api/admin/skills/5   (a deactivated skill; refused while a staff request asks for it)
        [HttpDelete("{skillId:int}")]
        public async Task<IActionResult> Delete(int skillId, [FromServices] EntityDeletion deletion)
        {
            var result = await deletion.DeleteSkillAsync(skillId);
            if (result.Ok) await _audit.LogAsync(CurrentUserId, "SKILL_DELETED", "Skill", skillId, result.Name);
            return DeleteAnswer(result);
        }

        // PATCH api/admin/skills/5/active
        [HttpPatch("{skillId:int}/active")]
        public async Task<IActionResult> SetActive(int skillId, [FromBody] SetActiveRequest request)
        {
            var skill = await _db.SkillMasters.FirstOrDefaultAsync(s => s.SkillId == skillId);
            if (skill == null) return NotFoundMessage("Skill not found.");

            skill.IsActive = request.IsActive == true;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, skill.IsActive ? "SKILL_ACTIVATED" : "SKILL_DEACTIVATED", "Skill", skillId, skill.Name);
            return Ok(new { message = skill.IsActive ? "Skill activated." : "Skill deactivated.", skillId, isActive = skill.IsActive });
        }
    }
}
