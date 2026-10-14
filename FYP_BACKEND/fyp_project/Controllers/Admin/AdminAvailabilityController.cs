using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: live view of employee availability. The numbers are read fresh on every request,
    /// so the screen can simply poll this endpoint.
    /// </summary>
    [Route("api/admin/availability")]
    public class AdminAvailabilityController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public AdminAvailabilityController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private sealed record ShiftOfEmployee(int EmpId, string? Name);

        // GET api/admin/availability?search=&status=&organizationId=&shiftId=&skillId=&page=1&pageSize=15
        [HttpGet]
        public async Task<IActionResult> Get(
            string? search,
            string? status,
            int? organizationId,
            int? shiftId,
            int? skillId,
            int page = 1,
            int pageSize = 15)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            // Everything except the status filter, so the summary shows the full spread.
            var scoped = _db.Employees.AsNoTracking().Where(e => e.User!.IsActive == true);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                scoped = scoped.Where(e =>
                    (e.User!.Name != null && e.User.Name.Contains(term)) ||
                    (e.User.Email != null && e.User.Email.Contains(term)));
            }

            if (organizationId.HasValue) scoped = scoped.Where(e => e.OrgId == organizationId.Value);

            if (shiftId.HasValue)
                scoped = scoped.Where(e => _db.EmployeeShifts.Any(a => a.EmpId == e.EmpId && a.ShiftId == shiftId.Value && a.EndDate == null));

            if (skillId.HasValue)
                scoped = scoped.Where(e => _db.EmployeeSkills.Any(s => s.EmpId == e.EmpId && s.SkillId == skillId.Value));

            var byStatus = await scoped
                .GroupBy(e => e.AvailabilityStatus)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .ToListAsync();

            var summary = new AvailabilitySummaryDto
            {
                Total = byStatus.Sum(x => x.Count),
                ByStatus = byStatus.Select(x => new StatusCountDto { Status = x.Status ?? "Unknown", Count = x.Count }).ToList(),
                Borrowed = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen)
                    .CountAsync(a => a.OwnerOrgId != null && a.OwnerOrgId != a.AssignOrgId),
            };

            var filtered = string.IsNullOrWhiteSpace(status) ? scoped : scoped.Where(e => e.AvailabilityStatus == status);
            var total = string.IsNullOrWhiteSpace(status) ? summary.Total : await filtered.CountAsync();

            var items = await filtered
                .OrderBy(e => e.User!.Name)
                .ThenBy(e => e.EmpId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(e => new AvailabilityItemDto
                {
                    UserId = e.UserId,
                    HasPicture = e.User!.ProfilePicturePath != null,
                    EmployeeId = e.EmpId,
                    FullName = e.User!.Name,
                    Email = e.User.Email,
                    AvailabilityStatus = e.AvailabilityStatus,
                    StatusSince = _db.EmployeeStatuses.Where(s => s.EmpId == e.EmpId).Max(s => s.ChangedAt),
                    HomeOrgId = e.OrgId,
                    HomeOrgName = e.Org != null ? e.Org.OrgName : null,
                })
                .ToListAsync();

            await AttachAllocationsAndShiftsAsync(items);

            return Ok(new AvailabilityResult
            {
                Summary = summary,
                Items = items,
                Total = total,
                Page = page,
                PageSize = pageSize,
                RefreshedAt = DateTime.UtcNow,
            });
        }

        private async Task AttachAllocationsAndShiftsAsync(List<AvailabilityItemDto> items)
        {
            if (items.Count == 0) return;
            var ids = items.Select(i => i.EmployeeId).ToList();

            var allocations = await _db.EmployeeAllocations
                .AsNoTracking()
                .Where(AllocationLogic.IsOpen)
                .Where(a => a.EmployeeId != null && ids.Contains(a.EmployeeId.Value))
                .Select(a => new
                {
                    a.AllocationId,
                    EmployeeId = a.EmployeeId!.Value,
                    a.AssignOrgId,
                    AssignName = a.AssignOrg != null ? a.AssignOrg.OrgName : null,
                    a.OwnerOrgId,
                    a.Status,
                })
                .ToListAsync();

            var shifts = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeShifts
                    .AsNoTracking()
                    .Where(a => ids.Contains(a.EmpId) && a.EndDate == null)
                    .Select(a => new ShiftOfEmployee(a.EmpId, a.Shift != null ? a.Shift.ShiftName : null))
                    .ToListAsync(),
                new List<ShiftOfEmployee>());

            foreach (var item in items)
            {
                var allocation = allocations.FirstOrDefault(a => a.EmployeeId == item.EmployeeId);
                if (allocation != null)
                {
                    item.AllocationId = allocation.AllocationId;
                    item.WorkingOrgId = allocation.AssignOrgId;
                    item.WorkingOrgName = allocation.AssignName;
                    item.IsBorrowed = allocation.OwnerOrgId != null && allocation.OwnerOrgId != allocation.AssignOrgId;
                }
                item.ShiftName = shifts.FirstOrDefault(s => s.EmpId == item.EmployeeId)?.Name;
            }
        }
    }
}
