using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class ManagerCreateRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select an organization.")]
        public int OrganizationId { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Enter how many employees are needed.")]
        public int RequiredEmployees { get; set; }

        public int? SkillId { get; set; }

        [Required(ErrorMessage = "Select a priority.")] public string Priority { get; set; } = "Medium";

        public DateTime StartDatetime { get; set; }
        public DateTime EndDatetime { get; set; }

        [Required(ErrorMessage = "Give a reason."), StringLength(255), MinTrimmedLength(5)] public string Reason { get; set; } = string.Empty;
    }

    public class ManagerStaffRequest
    {
        [Required, MinLength(1, ErrorMessage = "Choose at least one employee.")]
        public List<int> EmployeeIds { get; set; } = new();
    }

    /// <summary>
    /// Organization Manager portal: the staff requests of the manager's organizations, and manual staffing of them from the employee pool.
    /// This is the fallback for when the AI allocation does not work: the manager looks at the free employees and allocates them to the
    /// request, with the same rules as the admin (approved organization, active contract, capacity, borrowing ...).
    /// Allocating employees to a request that still waits for the admin approves it (the manager is the one handling the organization);
    /// the admin sees who approved it. The manager can also log a new request (for example one more employee for a specific time).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/requests")]
    public class ManagerRequestsController : ControllerBase
    {
        private const string Pending = "Pending";
        private const string Approved = "Approved";
        private const string Rejected = "Rejected";
        private const int MaxEmployees = 100;
        private const int MaxDays = 90;

        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly AuditService _audit;
        private readonly IdGenerator _ids;
        private readonly AccountMailer _mailer;

        public ManagerRequestsController(WorkforceManagementDbContext db, AllocationService allocations, AuditService audit, IdGenerator ids, AccountMailer mailer)
        {
            _mailer = mailer;
            _db = db;
            _allocations = allocations;
            _audit = audit;
            _ids = ids;
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

        private IQueryable<EmployeeAllocation> OpenAllocations() => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

        private IActionResult Problem(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        // GET api/manager/requests/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var requests = await _db.WorkforceRequests.AsNoTracking().Where(r => r.OrgId != null && orgIds.Contains(r.OrgId.Value))
                .Select(r => new { r.Status, Required = r.RequiredEmployees ?? 0, Staffed = OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId) })
                .ToListAsync();
            return Ok(new
            {
                waitingForAdmin = requests.Count(r => r.Status == Pending),
                approvedShort = requests.Count(r => r.Status == Approved && r.Staffed < r.Required),
                fullyStaffed = requests.Count(r => r.Status == Approved && r.Staffed >= r.Required),
                rejected = requests.Count(r => r.Status == Rejected),
            });
        }

        // GET api/manager/requests?search=&status=Pending|Approved|Rejected|Cancelled|Unstaffed&priority=&orgId=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, string? priority, int? orgId, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var orgIds = await MyOrganizationIdsAsync();
            if (orgId.HasValue && !orgIds.Contains(orgId.Value)) return StatusCode(403, new { message = "You can only see the organizations you manage." });

            var query = _db.WorkforceRequests.AsNoTracking().Where(r => r.OrgId != null && orgIds.Contains(r.OrgId.Value));
            if (orgId.HasValue) query = query.Where(r => r.OrgId == orgId);
            if (!string.IsNullOrWhiteSpace(priority)) query = query.Where(r => r.Priority == priority);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(r => (r.Org != null && r.Org.OrgName != null && r.Org.OrgName.Contains(term)) || (r.Reason != null && r.Reason.Contains(term)));
            }
            if (status == "Unstaffed")
                query = query.Where(r => r.Status == Approved && OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId) < (r.RequiredEmployees ?? 0));
            else if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(r => r.Status == status);

            var total = await query.CountAsync();
            var items = await query
                .OrderBy(r => r.Status == Approved && OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId) < (r.RequiredEmployees ?? 0) ? 0 : r.Status == Pending ? 1 : 2)
                .ThenBy(r => r.Priority == "Critical" ? 0 : r.Priority == "High" ? 1 : r.Priority == "Medium" ? 2 : 3)
                .ThenByDescending(r => r.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(r => new
                {
                    requestId = r.WorkforceRequestId,
                    orgId = r.OrgId,
                    orgName = r.Org != null ? r.Org.OrgName : null,
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
            var rows = items.Select(r => new
            {
                r.requestId, r.orgId, r.orgName, r.requiredEmployees, r.staffedNow, r.skillName, r.priority, r.startDatetime, r.endDatetime, r.reason, r.status, r.createdAt,
                canStaff = (r.status == Pending || r.status == Approved) && r.staffedNow < (r.requiredEmployees ?? 0),
            }).ToList();
            return Ok(new { items = rows, total, page, pageSize });
        }

        private async Task<WorkforceRequest?> MineAsync(int requestId, bool track = false)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var query = track ? _db.WorkforceRequests.AsQueryable() : _db.WorkforceRequests.AsNoTracking();
            return await query.Include(r => r.Org).FirstOrDefaultAsync(r => r.WorkforceRequestId == requestId && r.OrgId != null && orgIds.Contains(r.OrgId.Value));
        }

        // GET api/manager/requests/5
        [HttpGet("{requestId:int}")]
        public async Task<IActionResult> Get(int requestId)
        {
            var request = await MineAsync(requestId);
            if (request == null) return NotFound(new { message = "Staff request not found." });

            var skill = await _db.WorkforceRequestSkills.AsNoTracking().Where(s => s.WorkforceRequestId == requestId)
                .Join(_db.SkillMasters, s => s.SkillId, k => k.SkillId, (s, k) => new { k.SkillId, k.Name }).FirstOrDefaultAsync();

            var allocations = await _db.EmployeeAllocations.AsNoTracking().Where(a => a.WorkforceRequestId == requestId)
                .OrderByDescending(a => a.AllocationId)
                .Select(a => new
                {
                    allocationId = a.AllocationId,
                    employeeId = a.EmployeeId,
                    userId = a.Employee != null ? a.Employee.UserId : null,
                    employeeName = a.Employee != null && a.Employee.User != null ? a.Employee.User.Name : null,
                    allocationType = a.AllocationType,
                    status = a.Status,
                    startDatetime = a.StartDatetime,
                    expectedEndDatetime = a.ExpectedEndDatetime,
                    actualEndDatetime = a.ActualEndDatetime,
                })
                .ToListAsync();
            var openIds = await OpenAllocations().Where(a => a.WorkforceRequestId == requestId).Select(a => a.AllocationId).ToListAsync();

            var reviews = await _db.WorkforceRequestReviews.AsNoTracking().Where(r => r.WorkforceRequestId == requestId).OrderBy(r => r.ReviewId)
                .Join(_db.Users, r => r.ReviewedBy, u => u.UserId, (r, u) => new { r.Decision, r.Note, reviewedBy = u.Name, r.ReviewedAt })
                .ToListAsync();

            var contract = request.ContractId == null ? null : await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == request.ContractId);
            var allocatedToOrg = await OpenAllocations().CountAsync(a => a.AssignOrgId == request.OrgId);
            var required = request.RequiredEmployees ?? 0;
            var stillNeeded = Math.Max(0, required - openIds.Count);

            var warnings = new List<string>();
            if (contract?.MaxEmployees != null && request.Status is Pending or Approved && stillNeeded > 0 && allocatedToOrg + stillNeeded > contract.MaxEmployees)
                warnings.Add($"The contract allows {contract.MaxEmployees} employees. The organization has {allocatedToOrg} now, so {allocatedToOrg + stillNeeded} would be over the limit.");

            return Ok(new
            {
                requestId = request.WorkforceRequestId,
                orgId = request.OrgId,
                orgName = request.Org?.OrgName,
                requiredEmployees = required,
                staffedNow = openIds.Count,
                stillNeeded,
                skillId = skill?.SkillId,
                skillName = skill?.Name,
                priority = request.Priority,
                startDatetime = request.StartDatetime,
                endDatetime = request.EndDatetime,
                reason = request.Reason,
                status = request.Status,
                createdAt = request.CreatedAt,
                contract = contract == null ? null : new { contractNumber = contract.ContractNumber, minEmployees = contract.MinEmployees, maxEmployees = contract.MaxEmployees, borrowingAllowed = contract.BorrowingAllowed, allocatedToOrganizationNow = allocatedToOrg },
                warnings,
                canStaff = (request.Status == Pending || request.Status == Approved) && stillNeeded > 0,
                // Allocating to a request that still waits for the admin approves it.
                willApprove = request.Status == Pending,
                allocations = allocations.Select(a => new { a.allocationId, a.employeeId, a.userId, a.employeeName, a.allocationType, a.status, a.startDatetime, a.expectedEndDatetime, a.actualEndDatetime, isOpen = openIds.Contains(a.allocationId) }),
                reviews,
            });
        }

        // GET api/manager/requests/5/candidates?search=   (the free employees in the pool, best fit first)
        [HttpGet("{requestId:int}/candidates")]
        public async Task<IActionResult> Candidates(int requestId, string? search)
        {
            var request = await MineAsync(requestId);
            if (request == null) return NotFound(new { message = "Staff request not found." });

            var skillId = await _db.WorkforceRequestSkills.AsNoTracking().Where(s => s.WorkforceRequestId == requestId).Select(s => (int?)s.SkillId).FirstOrDefaultAsync();

            var query = _db.Employees.AsNoTracking().Where(e => e.User!.IsActive == true && !OpenAllocations().Any(a => a.EmployeeId == e.EmpId));
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e => e.User!.Name != null && e.User.Name.Contains(term));
            }

            var rows = await query
                .OrderByDescending(e => skillId != null && _db.EmployeeSkills.Any(s => s.EmpId == e.EmpId && s.SkillId == skillId))
                .ThenByDescending(e => e.AvailabilityStatus == "Available")
                .ThenByDescending(e => e.OrgId == request.OrgId)
                .ThenByDescending(e => e.Rating)
                .ThenBy(e => e.User!.Name)
                .Take(40)
                .Select(e => new
                {
                    employeeId = e.EmpId,
                    userId = e.UserId,
                    hasPicture = e.User!.ProfilePicturePath != null,
                    fullName = e.User.Name,
                    availabilityStatus = e.AvailabilityStatus,
                    rating = e.Rating,
                    homeOrgName = e.Org != null ? e.Org.OrgName : null,
                    isBorrowed = e.OrgId != request.OrgId,
                    matchesSkill = skillId != null && _db.EmployeeSkills.Any(s => s.EmpId == e.EmpId && s.SkillId == skillId),
                })
                .ToListAsync();

            var ids = rows.Select(r => r.employeeId).ToList();
            var skills = (await _db.EmployeeSkills.AsNoTracking().Where(s => ids.Contains(s.EmpId))
                .Select(s => new { s.EmpId, Name = s.Skill != null ? s.Skill.Name : null }).ToListAsync())
                .GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.Select(s => s.Name).Where(n => n != null).ToList());

            return Ok(rows.Select(r => new { r.employeeId, r.userId, r.hasPicture, r.fullName, r.availabilityStatus, r.rating, r.homeOrgName, r.isBorrowed, r.matchesSkill, skills = skills.GetValueOrDefault(r.employeeId) ?? new List<string?>() }));
        }

        // POST api/manager/requests/5/staff   { employeeIds: [..] }   (manual allocation to an approved request)
        [HttpPost("{requestId:int}/staff")]
        public async Task<IActionResult> Staff(int requestId, [FromBody] ManagerStaffRequest body)
        {
            var request = await MineAsync(requestId);
            if (request == null) return NotFound(new { message = "Staff request not found." });
            if (request.Status != Approved && request.Status != Pending) return Conflict(new { message = $"This request is {request.Status?.ToLower()}, so employees cannot be allocated to it." });

            // A request that still waits for the admin is approved by the manager when they staff it (undone below if nobody could be allocated).
            var wasPending = request.Status == Pending;
            WorkforceRequestReview? review = null;
            if (wasPending)
            {
                var tracked = await _db.WorkforceRequests.FirstAsync(r => r.WorkforceRequestId == requestId);
                tracked.Status = Approved;
                review = new WorkforceRequestReview { WorkforceRequestId = requestId, Decision = Approved, Note = "Approved by the organization manager when staffing it.", ReviewedBy = CurrentUserId, ReviewedAt = DateTime.UtcNow };
                _db.WorkforceRequestReviews.Add(review);
                await _db.SaveChangesAsync();
            }

            var results = new List<object>();
            var done = 0;
            foreach (var employeeId in body.EmployeeIds.Distinct())
            {
                var name = await _db.Employees.AsNoTracking().Where(e => e.EmpId == employeeId).Select(e => e.User!.Name).FirstOrDefaultAsync();
                var outcome = await _allocations.AllocateAsync(new AllocateRequest
                {
                    EmployeeId = employeeId,
                    AssignOrgId = request.OrgId!.Value,
                    WorkforceRequestId = requestId,
                    ExpectedEnd = request.EndDatetime > DateTime.UtcNow ? request.EndDatetime : null,
                    Reason = $"Staff request #{requestId} (by the organization manager)",
                    Force = false,
                }, CurrentUserId);

                if (outcome.Success)
                {
                    done++;
                    await _audit.LogAsync(CurrentUserId, "EMPLOYEE_ALLOCATED", "Allocation", outcome.AllocationId, $"By organization manager, for staff request #{requestId}. {outcome.Message}");
                }
                results.Add(new { employeeId, name, ok = outcome.Success, message = outcome.Message, violations = outcome.Violations.Select(v => v.Message) });
            }

            if (wasPending)
            {
                if (done == 0)
                {
                    var tracked = await _db.WorkforceRequests.FirstAsync(r => r.WorkforceRequestId == requestId);
                    tracked.Status = Pending;
                    _db.WorkforceRequestReviews.Remove(review!);
                    await _db.SaveChangesAsync();
                }
                else
                {
                    await _audit.LogAsync(CurrentUserId, "WORKFORCE_REQUEST_APPROVED", "WorkforceRequest", requestId, "Approved by the organization manager when staffing it.");
                    if (request.OrgId.HasValue) await _mailer.SendOrganizationEventAsync(CurrentUserId, request.OrgId.Value, OrganizationEvent.StaffRequestApproved, "Approved by the organization manager.");
                }
            }

            var message = done == body.EmployeeIds.Distinct().Count() ? $"{done} employee(s) allocated to the request." : $"{done} of {body.EmployeeIds.Distinct().Count()} employee(s) allocated. See the list for the others.";
            return Ok(new { message, allocated = done, results });
        }

        // POST api/manager/requests   (log a staff request for one of my organizations; the admin decides on it)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] ManagerCreateRequest request)
        {
            var orgIds = await MyOrganizationIdsAsync();
            if (!orgIds.Contains(request.OrganizationId)) return StatusCode(403, new { message = "You can only request staff for an organization you manage." });
            if (!ContractLogic.Priorities.Contains(request.Priority)) return Problem("priority", "Priority must be Low, Medium, High or Critical.");
            if (request.RequiredEmployees > MaxEmployees) return Problem("requiredEmployees", $"A request can ask for at most {MaxEmployees} employees.");

            var start = request.StartDatetime;
            var end = request.EndDatetime;
            if (start == default) return Problem("startDatetime", "Choose when the staff are needed from.");
            if (end == default) return Problem("endDatetime", "Choose when the staff are needed until.");
            if (end <= start) return Problem("endDatetime", "The end must be after the start.");
            if (end <= DateTime.UtcNow) return Problem("endDatetime", "The end must be in the future.");
            if ((end - start).TotalDays > MaxDays) return Problem("endDatetime", $"A request can last at most {MaxDays} days.");

            var organization = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == request.OrganizationId);
            if (organization == null || (organization.Status != "Active" && organization.Status != "Approved")) return Problem("organizationId", "Only approved organizations can request staff.");

            var contract = await _db.Contracts.AsNoTracking().Where(c => c.OrgId == organization.OrgId && (c.Status == "Active" || c.Status == "Approved")).OrderByDescending(c => c.ContractId).FirstOrDefaultAsync();
            if (contract == null) return Problem("organizationId", $"{organization.OrgName} has no active contract. Staff can only be requested under a contract.");
            if (request.SkillId.HasValue && !await _db.SkillMasters.AnyAsync(s => s.SkillId == request.SkillId.Value && s.IsActive)) return Problem("skillId", "The selected skill does not exist or is inactive.");

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

            await _audit.LogAsync(CurrentUserId, "WORKFORCE_REQUEST_CREATED", "WorkforceRequest", requestId,
                $"{organization.OrgName}: {request.RequiredEmployees} employee(s), {request.Priority} (logged by the organization manager)");
            return Ok(new { message = "Staff request logged. It is waiting for the admin's decision.", requestId });
        }
    }
}
