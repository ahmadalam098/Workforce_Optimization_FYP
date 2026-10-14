using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: the complete allocation history (never overwritten) with filters.</summary>
    [Route("api/admin/allocation-history")]
    public class AdminAllocationHistoryController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public AdminAllocationHistoryController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        // GET api/admin/allocation-history?search=&organizationId=&action=&source=ai|manual&from=&to=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(
            string? search,
            int? organizationId,
            string? action,
            string? source,
            DateTime? from,
            DateTime? to,
            int page = 1,
            int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.AllocationHistories.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(h => h.Emp!.User!.Name != null && h.Emp.User.Name.Contains(term));
            }

            if (organizationId.HasValue)
                query = query.Where(h => h.FromOrgId == organizationId.Value || h.ToOrgId == organizationId.Value);

            if (!string.IsNullOrWhiteSpace(action)) query = query.Where(h => h.ActionType == action);

            if (string.Equals(source, "ai", StringComparison.OrdinalIgnoreCase)) query = query.Where(h => h.IsAllocatedByAi == true);
            else if (string.Equals(source, "manual", StringComparison.OrdinalIgnoreCase)) query = query.Where(h => h.IsAllocatedByAi != true);

            if (from.HasValue) query = query.Where(h => h.ActionTime >= from.Value);
            if (to.HasValue) query = query.Where(h => h.ActionTime < to.Value);

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(h => h.ActionTime)
                .ThenByDescending(h => h.AllocationHistoryId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
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

            return Ok(new PagedResult<HistoryItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/allocation-history/action-types
        [HttpGet("action-types")]
        public async Task<IActionResult> ActionTypes()
        {
            var types = await _db.AllocationHistories
                .AsNoTracking()
                .Where(h => h.ActionType != null && h.ActionType != "")
                .Select(h => h.ActionType!)
                .Distinct()
                .OrderBy(t => t)
                .ToListAsync();

            return Ok(types);
        }
    }
}
