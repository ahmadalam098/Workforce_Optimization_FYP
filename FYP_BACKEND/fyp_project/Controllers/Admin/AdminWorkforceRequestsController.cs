using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: staff (workforce) requests from organizations.
    /// Pending -> Approved or Rejected; Pending or Approved -> Cancelled. Approved requests are staffed by allocating
    /// employees to them (POST api/admin/allocations with workforceRequestId).
    /// </summary>
    [Route("api/admin/workforce-requests")]
    public class AdminWorkforceRequestsController : AdminControllerBase
    {
        public const string Pending = "Pending";
        public const string Approved = "Approved";
        public const string Rejected = "Rejected";
        public const string Cancelled = "Cancelled";

        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminWorkforceRequestsController(WorkforceManagementDbContext db, IdGenerator ids, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _ids = ids;
            _audit = audit;
            _mailer = mailer;
        }

        private IQueryable<EmployeeAllocation> OpenAllocations() => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

        // GET api/admin/workforce-requests?search=&status=&priority=&orgId=&page=1&pageSize=10
        // status: Pending / Approved / Rejected / Cancelled / Unstaffed (approved but still short of employees)
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, string? priority, int? orgId, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.WorkforceRequests.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(r => (r.Org != null && r.Org.OrgName != null && r.Org.OrgName.Contains(term)) ||
                                         (r.Reason != null && r.Reason.Contains(term)));
            }

            if (orgId.HasValue) query = query.Where(r => r.OrgId == orgId);
            if (!string.IsNullOrWhiteSpace(priority)) query = query.Where(r => r.Priority == priority);

            if (status == "Unstaffed")
            {
                query = query.Where(r => r.Status == Approved &&
                                         OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId) < (r.RequiredEmployees ?? 0));
            }
            else if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(r => r.Status == status);
            }

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(r => r.Status == Pending ? 0 : 1)
                .ThenBy(r => r.Priority == "Critical" ? 0 : r.Priority == "High" ? 1 : r.Priority == "Medium" ? 2 : 3)
                .ThenByDescending(r => r.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(r => new WorkforceRequestListItemDto
                {
                    RequestId = r.WorkforceRequestId,
                    OrgId = r.OrgId,
                    OrgName = r.Org != null ? r.Org.OrgName : null,
                    RequiredEmployees = r.RequiredEmployees,
                    StaffedNow = OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId),
                    SkillName = _db.WorkforceRequestSkills
                        .Where(s => s.WorkforceRequestId == r.WorkforceRequestId)
                        .Join(_db.SkillMasters, s => s.SkillId, k => k.SkillId, (s, k) => k.Name)
                        .FirstOrDefault(),
                    Priority = r.Priority,
                    StartDatetime = r.StartDatetime,
                    EndDatetime = r.EndDatetime,
                    Reason = r.Reason,
                    Status = r.Status,
                    CreatedAt = r.CreatedAt,
                })
                .ToListAsync();

            return Ok(new PagedResult<WorkforceRequestListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/workforce-requests/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var requests = await _db.WorkforceRequests.AsNoTracking()
                .Select(r => new
                {
                    r.Status,
                    r.Priority,
                    Required = r.RequiredEmployees ?? 0,
                    Staffed = OpenAllocations().Count(a => a.WorkforceRequestId == r.WorkforceRequestId),
                })
                .ToListAsync();

            return Ok(new WorkforceRequestSummaryDto
            {
                Pending = requests.Count(r => r.Status == Pending),
                UrgentPending = requests.Count(r => r.Status == Pending && (r.Priority == "High" || r.Priority == "Critical")),
                ApprovedUnstaffed = requests.Count(r => r.Status == Approved && r.Staffed < r.Required),
                ApprovedStaffed = requests.Count(r => r.Status == Approved && r.Staffed >= r.Required),
                Rejected = requests.Count(r => r.Status == Rejected),
            });
        }

        // GET api/admin/workforce-requests/5
        [HttpGet("{requestId:int}")]
        public async Task<IActionResult> Get(int requestId)
        {
            var dto = await BuildDetailAsync(requestId);
            return dto == null ? NotFoundMessage("Workforce request not found.") : Ok(dto);
        }

        // POST api/admin/workforce-requests   (the admin logs a request on behalf of an organization)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateWorkforceRequest request)
        {
            if (!ContractLogic.Priorities.Contains(request.Priority))
                return FieldError("priority", "Priority must be Low, Medium, High or Critical.");

            const int maxEmployees = 100;
            const int maxDays = 90;

            if (request.RequiredEmployees > maxEmployees)
                return FieldError("requiredEmployees", $"A request can ask for at most {maxEmployees} employees.");

            var start = request.StartDatetime;
            var end = request.EndDatetime;
            if (start == default) return FieldError("startDatetime", "Choose when the staff are needed from.");
            if (end == default) return FieldError("endDatetime", "Choose when the staff are needed until.");
            if (end <= start) return FieldError("endDatetime", "The end must be after the start.");
            if (end <= DateTime.UtcNow) return FieldError("endDatetime", "The end must be in the future.");
            if ((end - start).TotalDays > maxDays) return FieldError("endDatetime", $"A request can last at most {maxDays} days.");

            var organization = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == request.OrganizationId);
            if (organization == null) return FieldError("organizationId", "The selected organization does not exist.");
            if (organization.Status != "Active" && organization.Status != "Approved")
                return FieldError("organizationId", "Only approved organizations can request staff.");

            var contract = await _db.Contracts.AsNoTracking()
                .Where(c => c.OrgId == organization.OrgId && (c.Status == "Active" || c.Status == "Approved"))
                .OrderByDescending(c => c.ContractId)
                .FirstOrDefaultAsync();
            if (contract == null)
                return FieldError("organizationId", $"{organization.OrgName} has no active contract. Staff can only be requested under a contract.");

            if (request.SkillId.HasValue &&
                !await _db.SkillMasters.AnyAsync(s => s.SkillId == request.SkillId.Value && s.IsActive))
                return FieldError("skillId", "The selected skill does not exist or is inactive.");

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
                if (request.SkillId.HasValue)
                    _db.WorkforceRequestSkills.Add(new WorkforceRequestSkill { WorkforceRequestId = requestId, SkillId = request.SkillId.Value });
                await _db.SaveChangesAsync();
            }

            await _audit.LogAsync(CurrentUserId, "WORKFORCE_REQUEST_CREATED", "WorkforceRequest", requestId,
                $"{organization.OrgName}: {request.RequiredEmployees} employee(s), {request.Priority}");

            var warnings = await WarningsAsync(organization.OrgId, contract, request.RequiredEmployees);
            return Ok(new { message = "Staff request logged. It is waiting for your decision.", requestId, warnings });
        }

        // POST api/admin/workforce-requests/5/approve
        [HttpPost("{requestId:int}/approve")]
        public Task<IActionResult> Approve(int requestId, [FromBody] RequestDecisionRequest? request) =>
            DecideAsync(requestId, Approved, request?.Note, requireNote: false, "WORKFORCE_REQUEST_APPROVED", "Request approved. Allocate employees to staff it.");

        // POST api/admin/workforce-requests/5/reject
        [HttpPost("{requestId:int}/reject")]
        public Task<IActionResult> Reject(int requestId, [FromBody] RequestDecisionRequest? request) =>
            DecideAsync(requestId, Rejected, request?.Note, requireNote: true, "WORKFORCE_REQUEST_REJECTED", "Request rejected.");

        // POST api/admin/workforce-requests/5/cancel
        [HttpPost("{requestId:int}/cancel")]
        public Task<IActionResult> Cancel(int requestId, [FromBody] RequestDecisionRequest? request) =>
            DecideAsync(requestId, Cancelled, request?.Note, requireNote: false, "WORKFORCE_REQUEST_CANCELLED", "Request cancelled.");

        private async Task<IActionResult> DecideAsync(int requestId, string decision, string? note, bool requireNote, string auditAction, string message)
        {
            note = ContractLogic.Clean(note);
            if (requireNote && note == null) return FieldError("note", "Give a reason. The organization will see it.");

            var request = await _db.WorkforceRequests.FirstOrDefaultAsync(r => r.WorkforceRequestId == requestId);
            if (request == null) return NotFoundMessage("Workforce request not found.");

            if (decision == Cancelled)
            {
                if (request.Status != Pending && request.Status != Approved)
                    return ConflictMessage($"A {request.Status?.ToLower()} request cannot be cancelled.");
                if (await OpenAllocations().AnyAsync(a => a.WorkforceRequestId == requestId))
                    return ConflictMessage("Employees are still allocated to this request. Release them first.");
            }
            else if (request.Status != Pending)
            {
                return ConflictMessage($"This request is already {request.Status?.ToLower()}.");
            }

            request.Status = decision;
            _db.WorkforceRequestReviews.Add(new WorkforceRequestReview
            {
                WorkforceRequestId = requestId,
                Decision = decision,
                Note = note,
                ReviewedBy = CurrentUserId,
                ReviewedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, auditAction, "WorkforceRequest", requestId, note);
            var kind = decision switch { Approved => OrganizationEvent.StaffRequestApproved, Rejected => OrganizationEvent.StaffRequestRejected, _ => OrganizationEvent.StaffRequestCancelled };
            var emailNote = request.OrgId.HasValue ? await _mailer.SendOrganizationEventAsync(CurrentUserId, request.OrgId.Value, kind, note) : string.Empty;
            return Ok(new { message = message + emailNote });
        }

        // ---------------------------------------------------------------- helpers

        private async Task<List<string>> WarningsAsync(int? orgId, Contract? contract, int required)
        {
            var warnings = new List<string>();
            if (contract?.MaxEmployees == null || orgId == null) return warnings;

            var allocated = await OpenAllocations().CountAsync(a => a.AssignOrgId == orgId);
            if (allocated + required > contract.MaxEmployees)
                warnings.Add($"The contract allows {contract.MaxEmployees} employees. The organization has {allocated} now, so {allocated + required} would be over the limit. Allocating more needs an override.");
            return warnings;
        }

        private async Task<WorkforceRequestDetailDto?> BuildDetailAsync(int requestId)
        {
            var request = await _db.WorkforceRequests.AsNoTracking()
                .Include(r => r.Org)
                .FirstOrDefaultAsync(r => r.WorkforceRequestId == requestId);
            if (request == null) return null;

            var skill = await _db.WorkforceRequestSkills.AsNoTracking()
                .Where(s => s.WorkforceRequestId == requestId)
                .Join(_db.SkillMasters, s => s.SkillId, k => k.SkillId, (s, k) => new { k.SkillId, k.Name })
                .FirstOrDefaultAsync();

            var allocations = await _db.EmployeeAllocations.AsNoTracking()
                .Where(a => a.WorkforceRequestId == requestId)
                .OrderByDescending(a => a.AllocationId)
                .Select(a => new RequestAllocationDto
                {
                    AllocationId = a.AllocationId,
                    EmployeeId = a.EmployeeId,
                    EmployeeName = a.Employee != null && a.Employee.User != null ? a.Employee.User.Name : null,
                    AllocationType = a.AllocationType,
                    Status = a.Status,
                    StartDatetime = a.StartDatetime,
                    ExpectedEndDatetime = a.ExpectedEndDatetime,
                })
                .ToListAsync();

            var openIds = await OpenAllocations().Where(a => a.WorkforceRequestId == requestId).Select(a => a.AllocationId).ToListAsync();
            foreach (var allocation in allocations) allocation.IsOpen = openIds.Contains(allocation.AllocationId);

            var reviews = await _db.WorkforceRequestReviews.AsNoTracking()
                .Where(r => r.WorkforceRequestId == requestId)
                .OrderBy(r => r.ReviewId)
                .Join(_db.Users, r => r.ReviewedBy, u => u.UserId, (r, u) => new RequestReviewDto
                {
                    Decision = r.Decision,
                    Note = r.Note,
                    ReviewedBy = u.Name,
                    ReviewedAt = r.ReviewedAt,
                })
                .ToListAsync();

            var contract = request.ContractId == null
                ? null
                : await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == request.ContractId);

            var required = request.RequiredEmployees ?? 0;
            var staffed = openIds.Count;
            var stillNeeded = Math.Max(0, required - staffed);

            var detail = new WorkforceRequestDetailDto
            {
                RequestId = request.WorkforceRequestId,
                OrgId = request.OrgId,
                OrgName = request.Org?.OrgName,
                RequiredEmployees = request.RequiredEmployees,
                StaffedNow = staffed,
                SkillName = skill?.Name,
                SkillId = skill?.SkillId,
                Priority = request.Priority,
                StartDatetime = request.StartDatetime,
                EndDatetime = request.EndDatetime,
                Reason = request.Reason,
                Status = request.Status,
                CreatedAt = request.CreatedAt,
                ContractId = request.ContractId,
                StillNeeded = stillNeeded,
                Allocations = allocations,
                Reviews = reviews,
            };

            if (contract != null)
            {
                detail.Contract = new RequestContractDto
                {
                    ContractId = contract.ContractId,
                    MinEmployees = contract.MinEmployees,
                    MaxEmployees = contract.MaxEmployees,
                    AllocatedToOrganizationNow = await OpenAllocations().CountAsync(a => a.AssignOrgId == request.OrgId),
                };
                if (request.Status == Pending || (request.Status == Approved && stillNeeded > 0))
                    detail.Warnings = await WarningsAsync(request.OrgId, contract, stillNeeded);
            }

            // Available employees that fit the request (the skill, if one was asked for), best rated first.
            if (request.Status == Approved && stillNeeded > 0)
            {
                var candidates = _db.Employees.AsNoTracking()
                    .Where(e => e.User!.IsActive == true)
                    .Where(e => AllocationLogic.AvailableStatuses.Contains(e.AvailabilityStatus!))
                    .Where(e => !OpenAllocations().Any(a => a.EmployeeId == e.EmpId));

                if (skill != null)
                    candidates = candidates.Where(e => _db.EmployeeSkills.Any(s => s.EmpId == e.EmpId && s.SkillId == skill.SkillId));

                detail.Candidates = await candidates
                    .OrderByDescending(e => e.OrgId == request.OrgId)
                    .ThenByDescending(e => e.Rating)
                    .ThenBy(e => e.User!.Name)
                    .Take(8)
                    .Select(e => new RequestCandidateDto
                    {
                        EmployeeId = e.EmpId,
                        FullName = e.User!.Name,
                        Email = e.User.Email,
                        HomeOrgId = e.OrgId,
                        HomeOrgName = e.Org != null ? e.Org.OrgName : null,
                        AvailabilityStatus = e.AvailabilityStatus,
                        Rating = e.Rating,
                        SameOrganization = e.OrgId == request.OrgId,
                    })
                    .ToListAsync();
            }

            return detail;
        }
    }
}
