using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    public class OrganizationStaffRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Enter how many extra employees you need.")]
        public int RequiredEmployees { get; set; }

        public int? SkillId { get; set; }

        [Required(ErrorMessage = "Select a priority.")] public string Priority { get; set; } = "Medium";

        public DateTime StartDatetime { get; set; }
        public DateTime EndDatetime { get; set; }

        [Required(ErrorMessage = "Give a reason."), StringLength(255), MinTrimmedLength(5)] public string Reason { get; set; } = string.Empty;
    }

    /// <summary>
    /// Organization portal: requests for extra employees (on top of the contract's minimum). They go to the organization's manager, who approves
    /// or rejects them and allocates the employees (the Manager portal's Staff Requests page); the admin only watches. The contract's maximum
    /// still limits the total, which the allocation rules check when the manager allocates.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/requests")]
    public class OrganizationRequestsController : ControllerBase
    {
        private const string Pending = "Pending";
        private const string Approved = "Approved";
        private const string Rejected = "Rejected";
        private const string Cancelled = "Cancelled";
        private const int MaxEmployees = 100;
        private const int MaxDays = 90;

        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly IdGenerator _ids;

        public OrganizationRequestsController(WorkforceManagementDbContext db, AuditService audit, IdGenerator ids)
        {
            _db = db;
            _audit = audit;
            _ids = ids;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private IQueryable<EmployeeAllocation> OpenAllocations() => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

        private IActionResult Problem(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        // GET api/organization/requests/skills   (for the optional skill of a request)
        [HttpGet("skills")]
        public async Task<IActionResult> Skills() =>
            Ok(await _db.SkillMasters.AsNoTracking().Where(s => s.IsActive).OrderBy(s => s.Name).Select(s => new { skillId = s.SkillId, name = s.Name }).ToListAsync());

        // GET api/organization/requests?status=Pending|Approved|Rejected|Cancelled|Unstaffed
        [HttpGet]
        public async Task<IActionResult> List(string? status)
        {
            var orgId = OrgId;
            var query = _db.WorkforceRequests.AsNoTracking().Where(r => r.OrgId == orgId);
            if (status == "Unstaffed")
                query = query.Where(r => r.Status == Approved && OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId) < (r.RequiredEmployees ?? 0));
            else if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(r => r.Status == status);

            var items = await query.OrderByDescending(r => r.CreatedAt).Take(200)
                .Select(r => new
                {
                    requestId = r.WorkforceRequestId,
                    requiredEmployees = r.RequiredEmployees,
                    staffedNow = OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId),
                    skillName = _db.WorkforceRequestSkills.Where(s => s.WorkforceRequestId == r.WorkforceRequestId).Join(_db.SkillMasters, s => s.SkillId, k => k.SkillId, (s, k) => k.Name).FirstOrDefault(),
                    priority = r.Priority,
                    startDatetime = r.StartDatetime,
                    endDatetime = r.EndDatetime,
                    reason = r.Reason,
                    status = r.Status,
                    createdAt = r.CreatedAt,
                })
                .ToListAsync();
            return Ok(items);
        }

        // GET api/organization/requests/5
        [HttpGet("{requestId:int}")]
        public async Task<IActionResult> Get(int requestId)
        {
            var orgId = OrgId;
            var request = await _db.WorkforceRequests.AsNoTracking().FirstOrDefaultAsync(r => r.WorkforceRequestId == requestId && r.OrgId == orgId);
            if (request == null) return NotFound(new { message = "Staff request not found." });

            var skillName = await _db.WorkforceRequestSkills.AsNoTracking().Where(s => s.WorkforceRequestId == requestId)
                .Join(_db.SkillMasters, s => s.SkillId, k => k.SkillId, (s, k) => k.Name).FirstOrDefaultAsync();
            var staff = await OpenAllocations().Where(a => a.WorkforceRequestId == requestId)
                .Select(a => new { name = a.Employee!.User!.Name, since = a.StartDatetime, until = a.ExpectedEndDatetime }).ToListAsync();
            var reviews = await _db.WorkforceRequestReviews.AsNoTracking().Where(r => r.WorkforceRequestId == requestId).OrderBy(r => r.ReviewId)
                .Join(_db.Users, r => r.ReviewedBy, u => u.UserId, (r, u) => new { r.Decision, r.Note, reviewedBy = u.Name, r.ReviewedAt })
                .ToListAsync();

            return Ok(new
            {
                requestId,
                requiredEmployees = request.RequiredEmployees ?? 0,
                staffedNow = staff.Count,
                skillName,
                priority = request.Priority,
                startDatetime = request.StartDatetime,
                endDatetime = request.EndDatetime,
                reason = request.Reason,
                status = request.Status,
                createdAt = request.CreatedAt,
                canCancel = (request.Status == Pending || request.Status == Approved) && staff.Count == 0,
                staff,
                decisions = reviews,
            });
        }

        // POST api/organization/requests
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] OrganizationStaffRequest request)
        {
            if (!ContractLogic.Priorities.Contains(request.Priority)) return Problem("priority", "Priority must be Low, Medium, High or Critical.");
            if (request.RequiredEmployees > MaxEmployees) return Problem("requiredEmployees", $"A request can ask for at most {MaxEmployees} employees.");

            var start = request.StartDatetime;
            var end = request.EndDatetime;
            if (start == default) return Problem("startDatetime", "Choose when the staff are needed from.");
            if (end == default) return Problem("endDatetime", "Choose when the staff are needed until.");
            if (end <= start) return Problem("endDatetime", "The end must be after the start.");
            if (end <= DateTime.UtcNow) return Problem("endDatetime", "The end must be in the future.");
            if ((end - start).TotalDays > MaxDays) return Problem("endDatetime", $"A request can last at most {MaxDays} days.");

            var organization = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == OrgId);
            if (organization == null || (organization.Status != "Active" && organization.Status != "Approved")) return Problem("requiredEmployees", "Only an approved organization can request staff.");

            var contract = await _db.Contracts.AsNoTracking().Where(c => c.OrgId == organization.OrgId && (c.Status == "Active" || c.Status == "Approved")).OrderByDescending(c => c.ContractId).FirstOrDefaultAsync();
            if (contract == null) return Problem("requiredEmployees", "You have no active contract. Staff can only be requested under a contract.");
            if (request.SkillId.HasValue && !await _db.SkillMasters.AnyAsync(s => s.SkillId == request.SkillId.Value && s.IsActive)) return Problem("skillId", "The selected skill does not exist or is inactive.");

            // The contract's maximum is the ceiling for minimum + extra: say so now instead of at allocation time.
            if (contract.MaxEmployees != null)
            {
                var now = await OpenAllocations().CountAsync(a => a.AssignOrgId == organization.OrgId);
                var approved = await _db.WorkforceRequests.Where(r => r.OrgId == organization.OrgId && r.Status == Approved)
                    .Select(r => new { Required = r.RequiredEmployees ?? 0, Staffed = OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId) }).ToListAsync();
                var unstaffed = approved.Sum(r => Math.Max(0, r.Required - r.Staffed));
                // The minimum is always counted, even before the manager has appointed it, because the extras come on top of it.
                var taken = Math.Max(contract.MinEmployees ?? 0, now) + unstaffed;
                if (taken + request.RequiredEmployees > contract.MaxEmployees)
                    return Problem("requiredEmployees", $"Your contract allows at most {contract.MaxEmployees} employees. {taken} are already counted (the minimum, employees working and approved requests), so {request.RequiredEmployees} more is too many.");
            }

            int requestId;
            using (await _ids.LockAsync())
            {
                requestId = await _ids.NextAsync(_db, "Workforce_Request", "workforce_request_id");
                _db.WorkforceRequests.Add(new WorkforceRequest
                {
                    WorkforceRequestId = requestId,
                    OrgId = organization.OrgId,
                    RequestByOrgId = organization.OrgId,
                    ContractId = contract.ContractId,
                    RequiredEmployees = request.RequiredEmployees,
                    Priority = request.Priority,
                    StartDatetime = start,
                    EndDatetime = end,
                    Reason = request.Reason.Trim(),
                    Status = Pending,
                    CreatedAt = DateTime.UtcNow,
                });
                if (request.SkillId.HasValue) _db.WorkforceRequestSkills.Add(new WorkforceRequestSkill { WorkforceRequestId = requestId, SkillId = request.SkillId.Value });
                await _db.SaveChangesAsync();
            }

            // No user is behind it (the organization is not a user): the manager's bell shows it, because the request belongs to their organization.
            await _audit.LogAsync(null, "WORKFORCE_REQUEST_CREATED", "WorkforceRequest", requestId,
                $"{organization.OrgName}: {request.RequiredEmployees} extra employee(s), {request.Priority} (asked by the organization)");
            return Ok(new { message = "Your request was sent to your organization manager.", requestId });
        }

        // POST api/organization/requests/5/cancel
        [HttpPost("{requestId:int}/cancel")]
        public async Task<IActionResult> Cancel(int requestId)
        {
            var orgId = OrgId;
            var request = await _db.WorkforceRequests.FirstOrDefaultAsync(r => r.WorkforceRequestId == requestId && r.OrgId == orgId);
            if (request == null) return NotFound(new { message = "Staff request not found." });
            if (request.Status != Pending && request.Status != Approved) return Conflict(new { message = $"A {request.Status?.ToLower()} request cannot be cancelled." });
            if (await OpenAllocations().AnyAsync(a => a.WorkforceRequestId == requestId))
                return Conflict(new { message = "Employees are already working on this request. Ask your manager to release them first." });

            request.Status = Cancelled;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(null, "WORKFORCE_REQUEST_CANCELLED", "WorkforceRequest", requestId, "Cancelled by the organization.");
            return Ok(new { message = "Request cancelled." });
        }
    }
}
