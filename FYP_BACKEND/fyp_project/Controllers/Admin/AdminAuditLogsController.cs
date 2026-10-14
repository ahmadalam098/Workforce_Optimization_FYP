using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: who did what and when. Read-only; entries are written by the other admin actions.</summary>
    [Route("api/admin/audit-logs")]
    public class AdminAuditLogsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public AdminAuditLogsController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        // GET api/admin/audit-logs?search=&action=&entityType=&actorUserId=&from=&to=&page=1&pageSize=20
        [HttpGet]
        public async Task<IActionResult> List(
            string? search, string? action, string? entityType, int? actorUserId, DateTime? from, DateTime? to,
            int page = 1, int pageSize = 20)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.AuditLogs.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(a =>
                    (a.Details != null && a.Details.Contains(term)) ||
                    a.Action.Contains(term) ||
                    (a.ActorName != null && a.ActorName.Contains(term)) ||
                    (a.EntityId != null && a.EntityId == term));
            }

            if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);
            if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(a => a.EntityType == entityType);
            if (actorUserId.HasValue) query = query.Where(a => a.ActorUserId == actorUserId.Value);
            if (from.HasValue) query = query.Where(a => a.CreatedAt >= from.Value);
            if (to.HasValue) query = query.Where(a => a.CreatedAt < to.Value);

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(a => a.CreatedAt)
                .ThenByDescending(a => a.AuditId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new AuditLogItemDto
                {
                    AuditId = a.AuditId,
                    ActorUserId = a.ActorUserId,
                    ActorName = a.ActorName,
                    Action = a.Action,
                    EntityType = a.EntityType,
                    EntityId = a.EntityId,
                    Details = a.Details,
                    IpAddress = a.IpAddress,
                    CreatedAt = a.CreatedAt,
                })
                .ToListAsync();

            return Ok(new PagedResult<AuditLogItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/audit-logs/facets   (values for the filter dropdowns)
        [HttpGet("facets")]
        public async Task<IActionResult> Facets()
        {
            var actions = await _db.AuditLogs.AsNoTracking().Select(a => a.Action).Distinct().OrderBy(a => a).ToListAsync();
            var entityTypes = await _db.AuditLogs.AsNoTracking().Where(a => a.EntityType != null).Select(a => a.EntityType!).Distinct().OrderBy(a => a).ToListAsync();
            var actors = await _db.AuditLogs.AsNoTracking()
                .Where(a => a.ActorUserId != null)
                .GroupBy(a => a.ActorUserId!.Value)
                .Select(g => new AuditActorDto { UserId = g.Key, Name = g.Max(a => a.ActorName) })
                .OrderBy(a => a.Name)
                .ToListAsync();

            return Ok(new AuditFacetsDto { Actions = actions, EntityTypes = entityTypes, Actors = actors });
        }
    }
}
