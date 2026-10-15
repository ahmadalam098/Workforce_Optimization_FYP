using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.DTOs.Admin;
using fyp_project.DTOs.Manager;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>
    /// Organization Manager portal: manual allocations. The manager sees the employee pool and assigns employees to, moves them between,
    /// and removes them from the organizations the admin gave them. The same allocation rules as the Admin portal apply (approved
    /// organization, active contract, capacity, borrowing); a manager cannot override a broken rule - only the admin can.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/allocations")]
    public class ManagerAllocationsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly AuditService _audit;

        public ManagerAllocationsController(WorkforceManagementDbContext db, AllocationService allocations, AuditService audit)
        {
            _db = db;
            _allocations = allocations;
            _audit = audit;
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                            ?? User.FindFirst("nameid")?.Value
                            ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.OrgId != null)
                .Select(m => m.OrgId!.Value)
                .ToListAsync();
        }

        private IActionResult Forbidden(string message) => StatusCode(403, new { message });

        private IActionResult ToResult(AllocationOutcome outcome)
        {
            if (outcome.Success)
                return Ok(new { message = outcome.Message, allocationId = outcome.AllocationId });

            // A manager is never offered the override: only the admin can break a contract rule.
            return StatusCode(outcome.StatusCode, new
            {
                message = outcome.Message,
                violations = outcome.Violations.Select(v => new ViolationInfoDto { Code = v.Code, Message = v.Message, Overridable = false }),
            });
        }

        // GET api/manager/allocations/skills   (the skills to filter the pool by)
        [HttpGet("skills")]
        public async Task<IActionResult> Skills()
        {
            var skills = await _db.SkillMasters.AsNoTracking().Where(s => s.IsActive).OrderBy(s => s.Name)
                .Select(s => new { skillId = s.SkillId, name = s.Name }).ToListAsync();
            return Ok(skills);
        }

        // GET api/manager/allocations/pool?search=&availability=&skillId=&view=all|free|mine&organizationId=&page=1&pageSize=10   (organizationId: only employees working for that one of my organizations)
        [HttpGet("pool")]
        public async Task<IActionResult> Pool(string? search, string? availability, int? skillId, string? view, int? organizationId = null, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var mine = await MyOrganizationIdsAsync();

            var query = _db.Employees.AsNoTracking().Where(e => e.User!.IsActive == true);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e => (e.User!.Name != null && e.User.Name.Contains(term)) || (e.User.Email != null && e.User.Email.Contains(term)));
            }
            if (!string.IsNullOrWhiteSpace(availability)) query = query.Where(e => e.AvailabilityStatus == availability);
            if (skillId.HasValue) query = query.Where(e => _db.EmployeeSkills.Any(s => s.EmpId == e.EmpId && s.SkillId == skillId.Value));

            if (string.Equals(view, "free", StringComparison.OrdinalIgnoreCase))
                query = query.Where(e => !_db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId));
            else if (string.Equals(view, "mine", StringComparison.OrdinalIgnoreCase))
                query = query.Where(e => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId && a.AssignOrgId != null && mine.Contains(a.AssignOrgId.Value)));

            if (organizationId.HasValue)
            {
                if (!mine.Contains(organizationId.Value)) return Forbidden("You can only filter by the organizations you manage.");
                var filterOrg = organizationId.Value;
                query = query.Where(e => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId && a.AssignOrgId == filterOrg));
            }

            var total = await query.CountAsync();

            var employees = await query
                .OrderBy(e => e.User!.Name)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(e => new
                {
                    employeeId = e.EmpId,
                    userId = e.UserId,
                    hasPicture = e.User!.ProfilePicturePath != null,
                    fullName = e.User.Name,
                    email = e.User.Email,
                    availabilityStatus = e.AvailabilityStatus,
                    rating = e.Rating,
                    homeOrgId = e.OrgId,
                    homeOrgName = e.Org != null ? e.Org.OrgName : null,
                })
                .ToListAsync();

            var ids = employees.Select(e => e.employeeId).ToList();

            var working = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.EmployeeId != null && ids.Contains(a.EmployeeId.Value))
                .Select(a => new { employeeId = a.EmployeeId!.Value, a.AllocationId, a.AssignOrgId, OrgName = a.AssignOrg != null ? a.AssignOrg.OrgName : null })
                .ToListAsync();

            var skills = (await _db.EmployeeSkills.AsNoTracking().Where(s => ids.Contains(s.EmpId))
                .Select(s => new { s.EmpId, Name = _db.SkillMasters.Where(k => k.SkillId == s.SkillId).Select(k => k.Name).FirstOrDefault() })
                .ToListAsync()).GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.Select(s => s.Name).Where(n => n != null).ToList());

            var shifts = (await _db.EmployeeShifts.AsNoTracking().Where(s => ids.Contains(s.EmpId) && s.EndDate == null)
                .Select(s => new { s.EmpId, Name = s.Shift != null ? s.Shift.ShiftName : null }).ToListAsync())
                .GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.First().Name);

            var items = employees.Select(e =>
            {
                var open = working.Where(w => w.employeeId == e.employeeId).OrderByDescending(w => w.AllocationId).FirstOrDefault();
                return new
                {
                    e.employeeId, e.userId, e.hasPicture, e.fullName, e.email, e.availabilityStatus, e.rating, e.homeOrgId, e.homeOrgName,
                    skills = skills.GetValueOrDefault(e.employeeId) ?? new List<string?>(),
                    shiftName = shifts.GetValueOrDefault(e.employeeId),
                    isAllocated = open != null,
                    allocationId = open?.AllocationId,
                    workingOrgId = open?.AssignOrgId,
                    workingOrgName = open?.OrgName,
                    // true when the employee works for one of this manager's organizations, so the manager may move or remove them
                    canManage = open != null && open.AssignOrgId != null && mine.Contains(open.AssignOrgId.Value),
                };
            }).ToList();

            return Ok(new PagedResult<object> { Items = items.Cast<object>().ToList(), Total = total, Page = page, PageSize = pageSize });
        }

        // POST api/manager/allocations   { employeeId, organizationId, reason, expectedEnd? }
        [HttpPost]
        public async Task<IActionResult> Assign([FromBody] ManagerAssignRequest request)
        {
            var mine = await MyOrganizationIdsAsync();
            if (!mine.Contains(request.OrganizationId)) return Forbidden("You can only assign employees to the organizations you manage.");

            var outcome = await _allocations.AllocateAsync(
                new AllocateRequest { EmployeeId = request.EmployeeId, AssignOrgId = request.OrganizationId, ExpectedEnd = request.ExpectedEnd, Reason = request.Reason, Force = false },
                CurrentUserId);
            if (outcome.Success)
                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_ALLOCATED", "Allocation", outcome.AllocationId, $"By organization manager. {outcome.Message} Reason: {request.Reason}");
            return ToResult(outcome);
        }

        // POST api/manager/allocations/5/move   { organizationId, reason, expectedEnd? }
        [HttpPost("{allocationId:int}/move")]
        public async Task<IActionResult> Move(int allocationId, [FromBody] ManagerMoveRequest request)
        {
            var mine = await MyOrganizationIdsAsync();
            var current = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen).FirstOrDefaultAsync(a => a.AllocationId == allocationId);
            if (current == null) return NotFound(new { message = "Open allocation not found." });
            if (current.AssignOrgId == null || !mine.Contains(current.AssignOrgId.Value)) return Forbidden("This employee does not work for one of your organizations.");
            if (!mine.Contains(request.OrganizationId)) return Forbidden("You can only move employees to the organizations you manage.");

            var outcome = await _allocations.ReallocateAsync(allocationId, new ReallocateRequest { AssignOrgId = request.OrganizationId, ExpectedEnd = request.ExpectedEnd, Reason = request.Reason, Force = false }, CurrentUserId);
            if (outcome.Success)
                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_REALLOCATED", "Allocation", outcome.AllocationId, $"By organization manager. {outcome.Message} Reason: {request.Reason}");
            return ToResult(outcome);
        }

        // POST api/manager/allocations/5/release   { reason }
        [HttpPost("{allocationId:int}/release")]
        public async Task<IActionResult> Release(int allocationId, [FromBody] ManagerReleaseRequest request)
        {
            var mine = await MyOrganizationIdsAsync();
            var current = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen).FirstOrDefaultAsync(a => a.AllocationId == allocationId);
            if (current == null) return NotFound(new { message = "Open allocation not found." });
            if (current.AssignOrgId == null || !mine.Contains(current.AssignOrgId.Value)) return Forbidden("This employee does not work for one of your organizations.");

            var outcome = await _allocations.ReleaseAsync(allocationId, request.Reason, CurrentUserId);
            if (outcome.Success)
                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_RELEASED", "Allocation", allocationId, $"By organization manager. {outcome.Message} Reason: {request.Reason}");
            return ToResult(outcome);
        }
    }
}
