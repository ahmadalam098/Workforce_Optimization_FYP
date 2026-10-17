using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class MinimumStaffRequest
    {
        public List<int> EmployeeIds { get; set; } = new();
    }

    /// <summary>
    /// Organization Manager portal: the MINIMUM employees of each active contract. The AI allocation will appoint them by itself later; until
    /// then the manager chooses them from the free employees here. Extra employees on top of the minimum come from staff requests instead.
    /// For a daily contract the employees are appointed for today's daily window (they end with it and are chosen again the next day); for
    /// any other contract they stay until they are released. The same rules as everywhere apply (contract maximum, borrowing, availability).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/minimum-staffing")]
    public class ManagerMinimumStaffingController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly DailyStaffingService _daily;
        private readonly AuditService _audit;

        public ManagerMinimumStaffingController(WorkforceManagementDbContext db, AllocationService allocations, DailyStaffingService daily, AuditService audit)
        {
            _db = db;
            _allocations = allocations;
            _daily = daily;
            _audit = audit;
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
        }

        private IQueryable<EmployeeAllocation> OpenAllocations() => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

        private async Task<(Contract? Contract, bool IsDaily)> MineAsync(int contractId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == contractId && c.OrgId != null && orgIds.Contains(c.OrgId.Value) && (c.Status == "Active" || c.Status == "Approved"));
            if (contract == null) return (null, false);
            var cycle = await _db.ContractVersions.AsNoTracking().Where(v => v.ContractId == contractId).OrderByDescending(v => v.VersionNo).Select(v => v.BillingCycle).FirstOrDefaultAsync();
            return (contract, string.Equals(cycle, DailyStaffingService.Cycle, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>The open allocations that count as this contract's minimum staff.</summary>
        private IQueryable<EmployeeAllocation> MinimumStaff(Contract contract, bool isDaily) =>
            isDaily
                ? OpenAllocations().Where(a => a.DailyContractId == contract.ContractId)
                : OpenAllocations().Where(a => a.AssignOrgId == contract.OrgId && a.WorkforceRequestId == null && a.DailyContractId == null);

        // GET api/manager/minimum-staffing
        [HttpGet]
        public async Task<IActionResult> List()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var contracts = await _db.Contracts.AsNoTracking()
                .Where(c => c.OrgId != null && orgIds.Contains(c.OrgId.Value) && (c.Status == "Active" || c.Status == "Approved"))
                .Select(c => new { Contract = c, OrgName = c.Org != null ? c.Org.OrgName : null })
                .OrderBy(c => c.OrgName).ThenBy(c => c.Contract.ContractId).ToListAsync();

            var result = new List<object>();
            foreach (var item in contracts)
            {
                var c = item.Contract;
                var (_, isDaily) = await MineAsync(c.ContractId);
                var staff = await MinimumStaff(c, isDaily)
                    .Select(a => new { allocationId = a.AllocationId, employeeId = a.EmployeeId, name = a.Employee!.User!.Name, since = a.StartDatetime, until = a.ExpectedEndDatetime }).ToListAsync();
                var atOrg = await OpenAllocations().CountAsync(a => a.AssignOrgId == c.OrgId);
                var min = c.MinEmployees ?? 0;
                string? hint = null;
                var canStaff = staff.Count < min;
                if (isDaily && canStaff)
                {
                    var (_, problem) = await _daily.TodayWindowEndAsync(c);
                    if (problem != null) { hint = problem; canStaff = false; }
                }
                result.Add(new
                {
                    contractId = c.ContractId,
                    contractNumber = c.ContractNumber,
                    orgId = c.OrgId,
                    orgName = item.OrgName,
                    isDaily,
                    window = c.StartTime != null && c.EndTime != null ? $"{c.StartTime:HH\\:mm} - {c.EndTime:HH\\:mm}" : null,
                    min,
                    max = c.MaxEmployees,
                    appointed = staff.Count,
                    missing = Math.Max(0, min - staff.Count),
                    extraNow = Math.Max(0, atOrg - staff.Count),
                    borrowingAllowed = c.BorrowingAllowed,
                    canStaff,
                    hint,
                    staff,
                });
            }
            return Ok(result);
        }

        // GET api/manager/minimum-staffing/5/candidates?search=
        [HttpGet("{contractId:int}/candidates")]
        public async Task<IActionResult> Candidates(int contractId, string? search)
        {
            var (contract, _) = await MineAsync(contractId);
            if (contract == null) return NotFound(new { message = "Active contract not found." });

            var query = _db.Employees.AsNoTracking().Where(e => e.User!.IsActive == true && !OpenAllocations().Any(a => a.EmployeeId == e.EmpId));
            if (contract.BorrowingAllowed != true) query = query.Where(e => e.OrgId == contract.OrgId);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e => e.User!.Name != null && e.User.Name.Contains(term));
            }

            var rows = await query
                .OrderByDescending(e => e.AvailabilityStatus == "Available")
                .ThenByDescending(e => e.OrgId == contract.OrgId)
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
                    isBorrowed = e.OrgId != contract.OrgId,
                })
                .ToListAsync();

            var ids = rows.Select(r => r.employeeId).ToList();
            var skills = (await _db.EmployeeSkills.AsNoTracking().Where(s => ids.Contains(s.EmpId))
                .Select(s => new { s.EmpId, Name = s.Skill != null ? s.Skill.Name : null }).ToListAsync())
                .GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.Select(s => s.Name).Where(n => n != null).ToList());
            return Ok(rows.Select(r => new { r.employeeId, r.userId, r.hasPicture, r.fullName, r.availabilityStatus, r.rating, r.homeOrgName, r.isBorrowed, skills = skills.GetValueOrDefault(r.employeeId) ?? new List<string?>() }));
        }

        // POST api/manager/minimum-staffing/5/staff   { employeeIds: [..] }
        [HttpPost("{contractId:int}/staff")]
        public async Task<IActionResult> Staff(int contractId, [FromBody] MinimumStaffRequest body)
        {
            var (contract, isDaily) = await MineAsync(contractId);
            if (contract == null) return NotFound(new { message = "Active contract not found." });
            var ids = body.EmployeeIds.Distinct().ToList();
            if (ids.Count == 0) return BadRequest(new { message = "Choose at least one employee." });

            var min = contract.MinEmployees ?? 0;
            var have = await MinimumStaff(contract, isDaily).CountAsync();
            if (have >= min) return Conflict(new { message = $"The minimum of {min} employees is already complete. More employees come through a staff request." });
            if (ids.Count > min - have) return BadRequest(new { message = $"Only {min - have} more employee(s) are needed for the minimum. Choose fewer." });

            DateTime? windowEnd = null;
            if (isDaily)
            {
                var (end, problem) = await _daily.TodayWindowEndAsync(contract);
                if (problem != null) return Conflict(new { message = problem });
                windowEnd = end;
            }

            var results = new List<object>();
            var done = 0;
            foreach (var employeeId in ids)
            {
                var name = await _db.Employees.AsNoTracking().Where(e => e.EmpId == employeeId).Select(e => e.User!.Name).FirstOrDefaultAsync();
                var outcome = await _allocations.AllocateAsync(new AllocateRequest
                {
                    EmployeeId = employeeId,
                    AssignOrgId = contract.OrgId!.Value,
                    ExpectedEnd = windowEnd,
                    Reason = $"Minimum staff of contract {contract.ContractNumber} (by the organization manager)",
                    Force = false,
                }, CurrentUserId);

                if (outcome.Success)
                {
                    done++;
                    if (isDaily)
                    {
                        var allocation = await _db.EmployeeAllocations.FirstAsync(a => a.AllocationId == outcome.AllocationId!.Value);
                        allocation.DailyContractId = contract.ContractId;
                        await _db.SaveChangesAsync();
                    }
                    await _audit.LogAsync(CurrentUserId, "EMPLOYEE_ALLOCATED", "Allocation", outcome.AllocationId, $"Minimum staff of contract {contract.ContractNumber}, by the organization manager. {outcome.Message}");
                }
                results.Add(new { employeeId, name, ok = outcome.Success, message = outcome.Message, violations = outcome.Violations.Select(v => v.Message) });
            }

            if (done > 0)
                await _audit.LogAsync(CurrentUserId, "MINIMUM_STAFF_APPOINTED", "Contract", contract.ContractId, $"{done} employee(s) appointed as the minimum staff (now {have + done} of {min}), by the organization manager");

            var message = done == ids.Count ? $"{done} employee(s) appointed." : $"{done} of {ids.Count} employee(s) appointed. See the list for the others.";
            return Ok(new { message, appointed = done, results });
        }

        // POST api/manager/minimum-staffing/release/12
        [HttpPost("release/{allocationId:int}")]
        public async Task<IActionResult> Release(int allocationId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var allocation = await OpenAllocations().AsNoTracking().FirstOrDefaultAsync(a => a.AllocationId == allocationId && a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value));
            if (allocation == null) return NotFound(new { message = "Allocation not found." });
            if (allocation.WorkforceRequestId != null) return Conflict(new { message = "This employee works on a staff request. Release them from that request." });

            var outcome = await _allocations.ReleaseAsync(allocationId, "Released by the organization manager", CurrentUserId);
            if (!outcome.Success) return Conflict(new { message = outcome.Message });
            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_RELEASED", "Allocation", allocationId, "Minimum staff released by the organization manager.");
            return Ok(new { message = "Employee released." });
        }
    }
}
