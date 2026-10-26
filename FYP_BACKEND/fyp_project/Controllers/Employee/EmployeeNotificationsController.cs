using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    /// <summary>The employee's feed: the usual notification feed plus the shifts around today (the page works out "your shift starts at ...").</summary>
    public class EmployeeNotificationFeedDto : NotificationFeedDto
    {
        public List<object> Shifts { get; set; } = new();
    }

    /// <summary>
    /// Employee portal: the notification bell. What concerns the signed-in employee only: the answers to their queries, their shifts, salary and
    /// payroll, where they are allocated, and changes to their account. Whatever they did themselves is not shown. Each employee has their own
    /// read marker (the same table the other bells use).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/notifications")]
    public class EmployeeNotificationsController : ControllerBase
    {
        private static readonly string[] TicketActions = { "TICKET_RESOLVED", "TICKET_FORWARDED" };
        private static readonly string[] EmployeeActions =
        {
            "SHIFT_ASSIGNED", "SHIFT_UNASSIGNED",
            "EMPLOYEE_UPDATED", "EMPLOYEE_SKILL_ADDED", "EMPLOYEE_SKILL_UPDATED", "EMPLOYEE_SKILL_REMOVED",
            "EMPLOYEE_ACTIVATED", "EMPLOYEE_DEACTIVATED", "EMPLOYEE_PASSWORD_RESET", "EMPLOYEE_WARNED", "CALL_CUT_BY_MANAGER", "OFFER_SENT",
        };
        private static readonly string[] UserActions = { "USER_UPDATED", "USER_ACTIVATED", "USER_DEACTIVATED", "USER_PASSWORD_RESET" };

        private static readonly Dictionary<string, string> Titles = new()
        {
            ["TICKET_RESOLVED"] = "Your query was answered",
            ["TICKET_FORWARDED"] = "Your query was sent to the admin",
            ["SHIFT_ASSIGNED"] = "You have a new shift",
            ["SHIFT_UNASSIGNED"] = "Your shift was removed",
            ["EMPLOYEE_ALLOCATED"] = "You were allocated to an organization",
            ["EMPLOYEE_REALLOCATED"] = "You were moved to another organization",
            ["EMPLOYEE_RELEASED"] = "You were released from an organization",
            ["ALLOCATION_OVERRIDE"] = "You were allocated to an organization",
            ["EMPLOYEE_UPDATED"] = "Your details were updated",
            ["USER_UPDATED"] = "Your details were updated",
            ["EMPLOYEE_SKILL_ADDED"] = "A skill was added to your profile",
            ["EMPLOYEE_SKILL_UPDATED"] = "A skill of yours was updated",
            ["EMPLOYEE_SKILL_REMOVED"] = "A skill was removed from your profile",
            ["EMPLOYEE_ACTIVATED"] = "Your account was activated",
            ["USER_ACTIVATED"] = "Your account was activated",
            ["EMPLOYEE_DEACTIVATED"] = "Your account was deactivated",
            ["USER_DEACTIVATED"] = "Your account was deactivated",
            ["EMPLOYEE_PASSWORD_RESET"] = "Your password was reset by the admin",
            ["EMPLOYEE_WARNED"] = "You received a warning",
            ["CALL_CUT_BY_MANAGER"] = "Your call was ended by the manager",
            ["OFFER_SENT"] = "A new assignment for you",
            ["USER_PASSWORD_RESET"] = "Your password was reset by the admin",
        };

        private readonly WorkforceManagementDbContext _db;

        public EmployeeNotificationsController(WorkforceManagementDbContext db)
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

        private static string TitleOf(string action)
        {
            if (Titles.TryGetValue(action, out var title)) return title;
            var text = action.Replace('_', ' ').ToLowerInvariant();
            return text.Length == 0 ? action : char.ToUpperInvariant(text[0]) + text[1..];
        }

        private sealed record Mine(int? EmpId, List<string> TicketKeys, List<string> AllocationKeys, Dictionary<string, string> TicketNumbers);

        private async Task<Mine> MineAsync(int me)
        {
            var empId = await _db.Employees.AsNoTracking().Where(e => e.UserId == me).Select(e => (int?)e.EmpId).FirstOrDefaultAsync();
            if (empId == null) return new Mine(null, new(), new(), new());

            var tickets = await _db.Tickets.AsNoTracking().Where(t => t.RaisedByUserId == me && t.Source == "Employee").Select(t => new { t.TicketId, t.TicketNumber }).ToListAsync();
            var allocations = await _db.EmployeeAllocations.AsNoTracking().Where(a => a.EmployeeId == empId).Select(a => a.AllocationId).ToListAsync();

            return new Mine(
                empId,
                tickets.Select(t => t.TicketId.ToString()).ToList(),
                allocations.Select(a => a.ToString()).ToList(),
                tickets.ToDictionary(t => t.TicketId.ToString(), t => t.TicketNumber ?? $"#{t.TicketId}"));
        }

        /// <summary>The audit entries that concern this employee, newest first.</summary>
        private IQueryable<AuditLog> Relevant(int me, Mine mine)
        {
            var empKey = mine.EmpId?.ToString();
            var userKey = me.ToString();
            return _db.AuditLogs.AsNoTracking().Where(a => a.ActorUserId != me && (
                (a.EntityType == "Ticket" && mine.TicketKeys.Contains(a.EntityId!) && TicketActions.Contains(a.Action)) ||
                (a.EntityType == "Allocation" && mine.AllocationKeys.Contains(a.EntityId!)) ||
                (a.EntityType == "Employee" && empKey != null && a.EntityId == empKey && EmployeeActions.Contains(a.Action)) ||
                (a.EntityType == "User" && a.EntityId == userKey && UserActions.Contains(a.Action))));
        }

        /// <summary>The text of a notification. Some entries carry details meant for the admin (the whole payroll total, a note to the admin), so those are written here.</summary>
        private static string? MessageOf(AuditLog a, Mine mine) => a.EntityType switch
        {
            "Ticket" when a.Action == "TICKET_FORWARDED" => $"Your manager sent {mine.TicketNumbers.GetValueOrDefault(a.EntityId ?? string.Empty, "your query")} to the admin. You will be told when it is answered.",
            "Employee" when a.Action is "EMPLOYEE_PASSWORD_RESET" => "The admin set a new password for you. Use it the next time you sign in.",
            "User" when a.Action is "USER_PASSWORD_RESET" => "The admin set a new password for you. Use it the next time you sign in.",
            _ => a.Details,
        };

        // GET api/employee/notifications?limit=20
        [HttpGet]
        public async Task<IActionResult> Feed(int limit = 20)
        {
            limit = Math.Clamp(limit, 1, 50);
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            // Switched off in Settings > Notifications.
            if (!await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp))
                return Ok(new EmployeeNotificationFeedDto { Enabled = false });

            // Switched off by the employee in their own Settings.
            var pref = await SafeQuery.IfSchemaMissing(() => _db.ManagerNotificationPrefs.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == me), null);
            if (pref is { InApp: false }) return Ok(new EmployeeNotificationFeedDto { Enabled = false });

            var state = await _db.NotificationStates.FirstOrDefaultAsync(s => s.UserId == me);
            if (state == null)
            {
                // First time: what happened before now counts as already seen.
                var newest = await _db.AuditLogs.AsNoTracking().MaxAsync(a => (int?)a.AuditId) ?? 0;
                state = new NotificationState { UserId = me.Value, LastReadAuditId = newest, UpdatedAt = DateTime.UtcNow };
                _db.NotificationStates.Add(state);
                await _db.SaveChangesAsync();
            }

            var lastRead = state.LastReadAuditId;
            var mine = await MineAsync(me.Value);
            var relevant = Relevant(me.Value, mine);
            var unread = await relevant.CountAsync(a => a.AuditId > lastRead);
            var rows = await relevant.OrderByDescending(a => a.AuditId).Take(limit).ToListAsync();

            // The shifts around today: the page (which knows the employee's local date and time) tells them when today's shift starts.
            var today = Money.Today;
            var shifts = mine.EmpId == null
                ? new List<object>()
                : (await _db.EmployeeShifts.AsNoTracking()
                    .Where(s => s.EmpId == mine.EmpId && s.StartDate <= today.AddDays(1) && (s.EndDate == null || s.EndDate >= today.AddDays(-1)))
                    .Select(s => new { s.AssignmentId, s.StartDate, s.EndDate, name = s.Shift!.ShiftName, startTime = s.Shift.StartTime, endTime = s.Shift.EndTime })
                    .ToListAsync()).Cast<object>().ToList();

            return Ok(new EmployeeNotificationFeedDto
            {
                UnreadCount = unread,
                Shifts = shifts,
                Items = rows.Select(a => new NotificationItemDto
                {
                    Id = a.AuditId,
                    Action = a.Action,
                    Title = TitleOf(a.Action),
                    Message = MessageOf(a, mine),
                    ActorName = a.ActorName,
                    ActorUserId = a.ActorUserId,
                    EntityType = a.EntityType,
                    EntityId = a.EntityId,
                    CreatedAt = a.CreatedAt,
                    IsUnread = a.AuditId > lastRead,
                }).ToList(),
            });
        }

        // POST api/employee/notifications/read-all
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
