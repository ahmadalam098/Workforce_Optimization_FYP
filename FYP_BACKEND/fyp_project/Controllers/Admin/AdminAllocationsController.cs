using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: current and past allocations, and the manual (override) workflow:
    /// allocate, reallocate and release.
    /// </summary>
    [Route("api/admin/allocations")]
    public class AdminAllocationsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly AuditService _audit;

        public AdminAllocationsController(WorkforceManagementDbContext db, AllocationService allocations, AuditService audit)
        {
            _db = db;
            _allocations = allocations;
            _audit = audit;
        }

        private static bool IsOpenRow(DateTime? actualEnd, string? status) =>
            actualEnd == null && (status == null || !AllocationLogic.ClosedStatuses.Contains(status));

        // GET api/admin/allocations?state=open|closed|all&search=&organizationId=&type=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? state, string? search, int? organizationId, string? type, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.EmployeeAllocations.AsNoTracking().AsQueryable();

            if (string.Equals(state, "closed", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.ActualEndDatetime != null || (a.Status != null && AllocationLogic.ClosedStatuses.Contains(a.Status)));
            else if (!string.Equals(state, "all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(AllocationLogic.IsOpen);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(a => a.Employee!.User!.Name != null && a.Employee.User.Name.Contains(term));
            }

            if (organizationId.HasValue)
                query = query.Where(a => a.AssignOrgId == organizationId.Value || a.OwnerOrgId == organizationId.Value);

            if (!string.IsNullOrWhiteSpace(type)) query = query.Where(a => a.AllocationType == type);

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(a => a.StartDatetime)
                .ThenByDescending(a => a.AllocationId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new AllocationListItemDto
                {
                    UserId = a.Employee != null ? a.Employee.UserId : null,
                    HasPicture = a.Employee != null && a.Employee.User != null && a.Employee.User.ProfilePicturePath != null,
                    AllocationId = a.AllocationId,
                    EmployeeId = a.EmployeeId,
                    EmployeeName = a.Employee != null && a.Employee.User != null ? a.Employee.User.Name : null,
                    OwnerOrgId = a.OwnerOrgId,
                    OwnerOrgName = a.OwnerOrg != null ? a.OwnerOrg.OrgName : null,
                    AssignOrgId = a.AssignOrgId,
                    AssignOrgName = a.AssignOrg != null ? a.AssignOrg.OrgName : null,
                    AllocationType = a.AllocationType,
                    Status = a.Status,
                    StartDatetime = a.StartDatetime,
                    ExpectedEndDatetime = a.ExpectedEndDatetime,
                    ActualEndDatetime = a.ActualEndDatetime,
                    IsShared = a.OwnerOrgId != null && a.OwnerOrgId != a.AssignOrgId,
                })
                .ToListAsync();

            MarkOpen(items);

            return Ok(new PagedResult<AllocationListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        private static void MarkOpen(List<AllocationListItemDto> items)
        {
            foreach (var item in items) item.IsOpen = IsOpenRow(item.ActualEndDatetime, item.Status);
        }

        // GET api/admin/allocations/5
        [HttpGet("{allocationId:int}")]
        public async Task<IActionResult> Get(int allocationId)
        {
            var detail = await _db.EmployeeAllocations
                .AsNoTracking()
                .Where(a => a.AllocationId == allocationId)
                .Select(a => new AllocationDetailDto
                {
                    AllocationId = a.AllocationId,
                    EmployeeId = a.EmployeeId,
                    EmployeeName = a.Employee != null && a.Employee.User != null ? a.Employee.User.Name : null,
                    OwnerOrgId = a.OwnerOrgId,
                    OwnerOrgName = a.OwnerOrg != null ? a.OwnerOrg.OrgName : null,
                    AssignOrgId = a.AssignOrgId,
                    AssignOrgName = a.AssignOrg != null ? a.AssignOrg.OrgName : null,
                    AllocationType = a.AllocationType,
                    Status = a.Status,
                    StartDatetime = a.StartDatetime,
                    ExpectedEndDatetime = a.ExpectedEndDatetime,
                    ActualEndDatetime = a.ActualEndDatetime,
                    WorkforceRequestId = a.WorkforceRequestId,
                    IsShared = a.OwnerOrgId != null && a.OwnerOrgId != a.AssignOrgId,
                })
                .FirstOrDefaultAsync();

            if (detail == null) return NotFoundMessage("Allocation not found.");

            detail.IsOpen = IsOpenRow(detail.ActualEndDatetime, detail.Status);
            MarkOpen(new List<AllocationListItemDto> { detail });

            detail.History = await _db.AllocationHistories
                .AsNoTracking()
                .Where(h => h.AllocationId == allocationId)
                .OrderByDescending(h => h.ActionTime)
                .Select(h => new HistoryItemDto
                {
                    AllocationHistoryId = h.AllocationHistoryId,
                    AllocationId = h.AllocationId,
                    EmployeeId = h.EmpId,
                    EmployeeName = h.Emp != null && h.Emp.User != null ? h.Emp.User.Name : null,
                    ActionType = h.ActionType,
                    ActionReason = h.ActionReason,
                    ActionTime = h.ActionTime,
                    FromOrgId = h.FromOrgId,
                    FromOrgName = h.FromOrg != null ? h.FromOrg.OrgName : null,
                    ToOrgId = h.ToOrgId,
                    ToOrgName = h.ToOrg != null ? h.ToOrg.OrgName : null,
                    PerformedBy = h.PerformedByUser != null ? h.PerformedByUser.Name : null,
                    IsAllocatedByAi = h.IsAllocatedByAi == true,
                })
                .ToListAsync();

            return Ok(detail);
        }

        // GET api/admin/allocations/eligible-employees?search=   (active employees without an open allocation)
        [HttpGet("eligible-employees")]
        public async Task<IActionResult> EligibleEmployees(string? search)
        {
            var query = _db.Employees
                .AsNoTracking()
                .Where(e => e.User!.IsActive == true)
                .Where(e => !_db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId));

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e =>
                    (e.User!.Name != null && e.User.Name.Contains(term)) ||
                    (e.User.Email != null && e.User.Email.Contains(term)));
            }

            var items = await query
                .OrderBy(e => e.User!.Name)
                .Take(20)
                .Select(e => new EligibleEmployeeDto
                {
                    EmployeeId = e.EmpId,
                    FullName = e.User!.Name,
                    Email = e.User.Email,
                    HomeOrgId = e.OrgId,
                    HomeOrgName = e.Org != null ? e.Org.OrgName : null,
                    AvailabilityStatus = e.AvailabilityStatus,
                })
                .ToListAsync();

            return Ok(items);
        }

        // POST api/admin/allocations   (manual allocation / override)
        [HttpPost]
        public async Task<IActionResult> Allocate([FromBody] AllocateRequest request)
        {
            var outcome = await _allocations.AllocateAsync(request, CurrentUserId);
            if (outcome.Success)
                await AuditAsync(outcome, "EMPLOYEE_ALLOCATED", request.Reason);
            return ToResult(outcome);
        }

        // POST api/admin/allocations/5/reallocate
        [HttpPost("{allocationId:int}/reallocate")]
        public async Task<IActionResult> Reallocate(int allocationId, [FromBody] ReallocateRequest request)
        {
            var outcome = await _allocations.ReallocateAsync(allocationId, request, CurrentUserId);
            if (outcome.Success)
                await AuditAsync(outcome, "EMPLOYEE_REALLOCATED", request.Reason);
            return ToResult(outcome);
        }

        // POST api/admin/allocations/5/release
        [HttpPost("{allocationId:int}/release")]
        public async Task<IActionResult> Release(int allocationId, [FromBody] AllocationReasonRequest request)
        {
            var outcome = await _allocations.ReleaseAsync(allocationId, request.Reason, CurrentUserId);
            if (outcome.Success)
                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_RELEASED", "Allocation", allocationId, $"{outcome.Message} {request.Reason}");
            return ToResult(outcome);
        }

        private Task AuditAsync(AllocationOutcome outcome, string action, string reason) =>
            _audit.LogAsync(
                CurrentUserId,
                outcome.WasOverride ? "ALLOCATION_OVERRIDE" : action,
                "Allocation",
                outcome.AllocationId,
                $"{(outcome.WasOverride ? "OVERRIDE of contract rules. " : string.Empty)}{outcome.Message} Reason: {reason}");

        private IActionResult ToResult(AllocationOutcome outcome)
        {
            if (outcome.Success)
                return Ok(new { message = outcome.Message, allocationId = outcome.AllocationId, overridden = outcome.WasOverride });

            return StatusCode(outcome.StatusCode, new
            {
                message = outcome.Message,
                canOverride = outcome.CanOverride,
                violations = outcome.Violations.Select(v => new ViolationInfoDto { Code = v.Code, Message = v.Message, Overridable = v.Overridable }),
            });
        }
    }
}
