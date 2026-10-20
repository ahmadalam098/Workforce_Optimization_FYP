using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    public class NotificationItemDto
    {
        public int Id { get; set; }
        public string Action { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? Message { get; set; }
        public string? ActorName { get; set; }
        public int? ActorUserId { get; set; }
        public string? EntityType { get; set; }
        public string? EntityId { get; set; }
        public DateTime CreatedAt { get; set; }
        public bool IsUnread { get; set; }
    }

    public class NotificationAlertDto
    {
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? EntityType { get; set; }
        public string? EntityId { get; set; }

        /// <summary>A page to open, when the alert is not about an audited item (used by the manager bell).</summary>
        public string? Link { get; set; }

        /// <summary>Identifies this alert; "Mark all as read" remembers it, and the alert counts again only when the key changes. Empty = the title.</summary>
        public string? Key { get; set; }
    }

    public class NotificationFeedDto
    {
        /// <summary>False when in-app notifications are switched off in Settings.</summary>
        public bool Enabled { get; set; } = true;
        public List<NotificationAlertDto> Alerts { get; set; } = new();
        public int UnreadCount { get; set; }
        public List<NotificationItemDto> Items { get; set; } = new();
    }

    /// <summary>
    /// Admin portal: the notification bell. Every audited action (employees, organizations, managers, contracts,
    /// allocations, finance, tickets ...) is a notification. Each admin has their own read marker.
    /// </summary>
    [Route("api/admin/notifications")]
    public class AdminNotificationsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public AdminNotificationsController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        /// <summary>"EMPLOYEE_CREATED" -> "Employee created".</summary>
        private static string TitleOf(string action)
        {
            var text = action.Replace('_', ' ').ToLowerInvariant();
            return text.Length == 0 ? action : char.ToUpperInvariant(text[0]) + text[1..];
        }

        private static readonly string[] WorkforcePrefixes = { "EMPLOYEE_", "SHIFT_", "SKILL_", "ALLOCATION", "WORKFORCE_", "OVERTIME_" };

        /// <summary>Active contracts that end within the number of days chosen in Settings.</summary>
        private async Task<List<NotificationAlertDto>> ExpiringContractsAsync()
        {
            var days = await SettingsReader.GetIntAsync(_db, SettingsCatalog.NotifyContractExpiryDays);
            if (days <= 0) return new();

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var limit = today.AddDays(days);
            var contracts = await _db.Contracts.AsNoTracking()
                .Where(c => c.Status == "Active" || c.Status == "Approved")
                .Select(c => new { c.ContractId, c.ContractNumber, OrgName = c.Org != null ? c.Org.OrgName : null })
                .ToListAsync();
            var ids = contracts.Select(c => c.ContractId).ToList();
            var versions = await _db.ContractVersions.AsNoTracking().Where(v => ids.Contains(v.ContractId)).ToListAsync();

            var alerts = new List<(DateOnly End, NotificationAlertDto Alert)>();
            foreach (var contract in contracts)
            {
                var end = versions.Where(v => v.ContractId == contract.ContractId).OrderByDescending(v => v.VersionNo).FirstOrDefault()?.EndDate;
                if (end == null || end < today || end > limit) continue;
                var left = end.Value.DayNumber - today.DayNumber;
                alerts.Add((end.Value, new NotificationAlertDto
                {
                    Title = $"Contract {contract.ContractNumber} ending soon",
                    Message = $"{contract.OrgName ?? "An organization"}: ends {end:yyyy-MM-dd} ({(left == 0 ? "today" : left == 1 ? "tomorrow" : $"in {left} days")}).",
                    EntityType = "Contract",
                    EntityId = contract.ContractId.ToString(),
                }));
            }
            return alerts.OrderBy(a => a.End).Select(a => a.Alert).Take(10).ToList();
        }

        // GET api/admin/notifications?limit=20
        [HttpGet]
        public async Task<IActionResult> Feed(int limit = 20)
        {
            limit = Math.Clamp(limit, 1, 50);
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            if (!await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp))
                return Ok(new NotificationFeedDto { Enabled = false });
            var showWorkforce = await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyWorkforce);
            var alerts = await ExpiringContractsAsync();

            // Payments the organizations announced, waiting for the admin's approval (the manager's verification is a step before).
            var waiting = await SafeQuery.IfSchemaMissing(() => _db.PaymentSubmissions.AsNoTracking().Where(s => s.Status == PaymentSubmission.Pending || s.Status == PaymentSubmission.Verified).Select(s => new { s.SubmissionId, s.Status }).ToListAsync(), null);
            if (waiting is { Count: > 0 })
            {
                var verified = waiting.Count(s => s.Status == PaymentSubmission.Verified);
                alerts.Insert(0, new NotificationAlertDto
                {
                    Key = $"payment-submissions-{waiting.Count}-{waiting.Max(s => s.SubmissionId)}-{verified}",
                    Title = $"{waiting.Count} payment{(waiting.Count == 1 ? string.Empty : "s")} to approve",
                    Message = verified > 0 ? $"{verified} already verified by the organization manager." : "Organizations say they paid. Check and approve them.",
                    Link = "/admin/payment-submissions",
                });
            }

            var state = await _db.NotificationStates.FirstOrDefaultAsync(s => s.UserId == me);
            if (state == null)
            {
                // First time: what happened before now counts as already seen, so a new admin is not shown a huge backlog as unread.
                var newest = await _db.AuditLogs.AsNoTracking().MaxAsync(a => (int?)a.AuditId) ?? 0;
                state = new NotificationState { UserId = me.Value, LastReadAuditId = newest, UpdatedAt = DateTime.UtcNow };
                _db.NotificationStates.Add(state);
                await _db.SaveChangesAsync();
            }

            var lastRead = state.LastReadAuditId;
            var visible = _db.AuditLogs.AsNoTracking().AsQueryable();
            if (!showWorkforce)
                visible = visible.Where(a => !WorkforcePrefixes.Any(p => a.Action.StartsWith(p)));
            var unread = await visible.CountAsync(a => a.AuditId > lastRead);

            var rows = await visible
                .OrderByDescending(a => a.AuditId)
                .Take(limit)
                .ToListAsync();

            return Ok(new NotificationFeedDto
            {
                Alerts = alerts,
                UnreadCount = unread + alerts.Count,
                Items = rows.Select(a => new NotificationItemDto
                {
                    Id = a.AuditId,
                    Action = a.Action,
                    Title = TitleOf(a.Action),
                    Message = a.Details,
                    ActorName = a.ActorName,
                    ActorUserId = a.ActorUserId,
                    EntityType = a.EntityType,
                    EntityId = a.EntityId,
                    CreatedAt = a.CreatedAt,
                    IsUnread = a.AuditId > lastRead,
                }).ToList(),
            });
        }

        // POST api/admin/notifications/read-all
        [HttpPost("read-all")]
        public async Task<IActionResult> ReadAll()
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            var newest = await _db.AuditLogs.AsNoTracking().MaxAsync(a => (int?)a.AuditId) ?? 0;
            var state = await _db.NotificationStates.FirstOrDefaultAsync(s => s.UserId == me);
            if (state == null)
                _db.NotificationStates.Add(new NotificationState { UserId = me.Value, LastReadAuditId = newest, UpdatedAt = DateTime.UtcNow });
            else
            {
                state.LastReadAuditId = Math.Max(state.LastReadAuditId, newest);
                state.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            return Ok(new { message = "All notifications marked as read." });
        }
    }
}
