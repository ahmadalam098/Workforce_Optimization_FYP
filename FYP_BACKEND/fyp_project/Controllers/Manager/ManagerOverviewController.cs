using System.Security.Claims;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>Organization Manager portal: the signed-in manager and the organizations the admin assigned to them.</summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [Route("api/manager")]
    public class ManagerOverviewController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public ManagerOverviewController(WorkforceManagementDbContext db)
        {
            _db = db;
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

        // GET api/manager/overview
        [HttpGet("overview")]
        public async Task<IActionResult> Overview()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var organizations = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.Org != null)
                .Select(m => new
                {
                    organizationId = m.OrgId,
                    name = m.Org!.OrgName,
                    email = m.Org.Email,
                    status = m.Org.Status,
                })
                .OrderBy(o => o.name)
                .ToListAsync();

            return Ok(new { fullName = user.Name, email = user.Email, organizations });
        }

        // GET api/manager/dashboard   (numbers for the dashboard, only about the manager's own organizations)
        [HttpGet("dashboard")]
        public async Task<IActionResult> Dashboard()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var mine = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.Org != null)
                .Select(m => new { OrgId = m.OrgId!.Value, m.Org!.OrgName, m.Org.Status })
                .ToListAsync();
            var orgIds = mine.Select(o => o.OrgId).ToList();

            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);
            var working = await open
                .Where(a => a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value))
                .Select(a => new { OrgId = a.AssignOrgId!.Value, Status = a.Employee != null ? a.Employee.AvailabilityStatus : null })
                .ToListAsync();

            var freeEmployees = await _db.Employees.CountAsync(e => e.User!.IsActive == true && !open.Any(a => a.EmployeeId == e.EmpId));
            var activeContracts = await _db.Contracts.CountAsync(c => c.OrgId != null && orgIds.Contains(c.OrgId.Value) && (c.Status == "Active" || c.Status == "Approved"));
            var pendingRequests = await _db.WorkforceRequests.CountAsync(r => r.OrgId != null && orgIds.Contains(r.OrgId.Value) && r.Status == "Pending");
            var openQueries = await _db.Tickets.CountAsync(t => t.OrgId != null && orgIds.Contains(t.OrgId.Value) && t.Status != "Resolved" && t.Status != "Closed");

            var recentActivity = await _db.AllocationHistories.AsNoTracking()
                .Where(h => (h.FromOrgId != null && orgIds.Contains(h.FromOrgId.Value)) || (h.ToOrgId != null && orgIds.Contains(h.ToOrgId.Value)))
                .OrderByDescending(h => h.ActionTime)
                .Take(8)
                .Select(h => new
                {
                    h.AllocationHistoryId,
                    h.ActionType,
                    h.ActionTime,
                    Employee = h.Emp != null && h.Emp.User != null ? h.Emp.User.Name : null,
                    From = h.FromOrg != null ? h.FromOrg.OrgName : null,
                    To = h.ToOrg != null ? h.ToOrg.OrgName : null,
                    h.IsAllocatedByAi,
                })
                .ToListAsync();

            return Ok(new
            {
                fullName = user.Name,
                organizations = mine.Count,
                activeOrganizations = mine.Count(o => ContractLogic.IsActiveStatus(o.Status)),
                pendingOrganizations = mine.Count(o => ContractLogic.IsStatus(o.Status, ContractLogic.Pending)),
                employeesWorking = working.Count,
                freeEmployees,
                activeContracts,
                pendingRequests,
                openQueries,
                availability = working.GroupBy(w => w.Status ?? "Unknown").Select(g => new { status = g.Key, count = g.Count() }).OrderByDescending(x => x.count),
                employeesByOrganization = mine.Select(o => new { organizationId = o.OrgId, name = o.OrgName, count = working.Count(w => w.OrgId == o.OrgId) }).OrderByDescending(x => x.count).ThenBy(x => x.name),
                recentActivity,
            });
        }
    }
}
