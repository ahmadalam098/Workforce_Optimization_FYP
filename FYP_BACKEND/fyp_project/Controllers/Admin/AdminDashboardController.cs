using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin dashboard numbers, computed from the existing tables.</summary>
    [Route("api/admin/dashboard")]
    public class AdminDashboardController : AdminControllerBase
    {
        private static readonly string[] ActiveStatuses = { "active", "approved" };

        private readonly WorkforceManagementDbContext _db;
        private readonly RoleService _roles;

        public AdminDashboardController(WorkforceManagementDbContext db, RoleService roles)
        {
            _db = db;
            _roles = roles;
        }

        // GET api/admin/dashboard/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var totalEmployees = await _db.Employees.CountAsync();
            var activeEmployees = await _db.Employees.CountAsync(e => e.User!.IsActive == true);
            var availableEmployees = await _db.Employees.CountAsync(e => e.User!.IsActive == true && e.AvailabilityStatus == "Available");
            var unassignedEmployees = await _db.Employees.CountAsync(e => e.User!.IsActive == true && e.OrgId == null);

            var orgStatusCounts = await _db.Organizations
                .GroupBy(o => o.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToListAsync();
            var totalOrganizations = orgStatusCounts.Sum(x => x.Count);
            var activeOrganizations = orgStatusCounts
                .Where(x => x.Status != null && ActiveStatuses.Contains(x.Status.ToLowerInvariant()))
                .Sum(x => x.Count);
            var pendingOrganizations = orgStatusCounts
                .Where(x => string.Equals(x.Status, "Pending", StringComparison.OrdinalIgnoreCase))
                .Sum(x => x.Count);

            var contractStatusCounts = await _db.Contracts
                .GroupBy(c => c.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToListAsync();
            var activeContracts = contractStatusCounts
                .Where(x => x.Status != null && ActiveStatuses.Contains(x.Status.ToLowerInvariant()))
                .Sum(x => x.Count);
            var pendingContracts = contractStatusCounts
                .Where(x => string.Equals(x.Status, "Pending", StringComparison.OrdinalIgnoreCase))
                .Sum(x => x.Count);

            var activeAllocations = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).CountAsync();

            var pendingRequests = await _db.WorkforceRequests.CountAsync(r => r.Status == "Pending");
            var openComplaints = await _db.Complaints.CountAsync();

            var managerRoleIds = await _roles.FindRoleIdsAsync(RoleNames.OrganizationManager);
            var totalManagers = await _db.Users.CountAsync(u =>
                u.IsActive == true && u.RoleId != null && managerRoleIds.Contains(u.RoleId.Value));

            var availability = await _db.Employees
                .Where(e => e.User!.IsActive == true)
                .GroupBy(e => e.AvailabilityStatus)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .ToListAsync();

            var byOrganization = await _db.Employees
                .Where(e => e.User!.IsActive == true && e.OrgId != null)
                .GroupBy(e => new { e.OrgId, Name = e.Org!.OrgName })
                .Select(g => new { OrganizationId = g.Key.OrgId, g.Key.Name, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .Take(6)
                .ToListAsync();

            var recentActivity = await _db.AllocationHistories
                .AsNoTracking()
                .OrderByDescending(h => h.ActionTime)
                .Take(8)
                .Select(h => new
                {
                    h.AllocationHistoryId,
                    h.ActionType,
                    h.ActionReason,
                    h.ActionTime,
                    Employee = h.Emp != null && h.Emp.User != null ? h.Emp.User.Name : null,
                    From = h.FromOrg != null ? h.FromOrg.OrgName : null,
                    To = h.ToOrg != null ? h.ToOrg.OrgName : null,
                    h.IsAllocatedByAi,
                })
                .ToListAsync();

            return Ok(new
            {
                totalEmployees,
                activeEmployees,
                availableEmployees,
                unassignedEmployees,
                totalOrganizations,
                activeOrganizations,
                pendingOrganizations,
                activeContracts,
                pendingContracts,
                pendingRequests,
                activeAllocations,
                openComplaints,
                totalManagers,
                availability = availability.Select(x => new { status = x.Status ?? "Unknown", count = x.Count }),
                employeesByOrganization = byOrganization.Select(x => new { organizationId = x.OrganizationId, name = x.Name, count = x.Count }),
                recentActivity,
            });
        }
    }
}
