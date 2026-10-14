using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>Writes admin actions to Audit_Log. Never throws: auditing must not break the action itself.</summary>
    public class AuditService
    {
        private readonly WorkforceManagementDbContext _context;
        private readonly IHttpContextAccessor _http;
        private readonly ILogger<AuditService> _logger;

        public AuditService(
            WorkforceManagementDbContext context,
            IHttpContextAccessor http,
            ILogger<AuditService> logger)
        {
            _context = context;
            _http = http;
            _logger = logger;
        }

        public async Task LogAsync(int? actorUserId, string action, string entityType, object? entityId, string? details = null)
        {
            var entry = new AuditLog
            {
                ActorUserId = actorUserId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId?.ToString(),
                Details = details is { Length: > 1000 } ? details[..1000] : details,
                IpAddress = _http.HttpContext?.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow,
            };

            try
            {
                if (actorUserId.HasValue)
                {
                    entry.ActorName = await _context.Users
                        .AsNoTracking()
                        .Where(u => u.UserId == actorUserId.Value)
                        .Select(u => u.Name)
                        .FirstOrDefaultAsync();
                }

                _context.AuditLogs.Add(entry);
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _context.Entry(entry).State = EntityState.Detached;
                _logger.LogWarning(ex, "Could not write audit log entry for action {Action}.", action);
            }
        }
    }
}
