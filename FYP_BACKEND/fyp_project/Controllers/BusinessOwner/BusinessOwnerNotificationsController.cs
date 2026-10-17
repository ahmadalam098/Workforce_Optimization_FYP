using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.BusinessOwnerPortal
{
    /// <summary>
    /// Business Owner portal: the notification bell. Only what changes the money figures: revenue added (a payment from an organization was
    /// recorded) and expense added (a payroll was approved), each with what it does to the profit. Every owner has their own read marker
    /// (the same table the other bells use). Revenue and expense can only grow in the system today (a payment or an approved payroll is never
    /// taken back); when a removal exists, add its audit action to <see cref="RevenueRemoved"/> or <see cref="ExpenseRemoved"/>.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "BusinessOwnerOnly")]
    [MissingMigrationFilter]
    [Route("api/business-owner/notifications")]
    public class BusinessOwnerNotificationsController : ControllerBase
    {
        private static readonly string[] RevenueAdded = { "INVOICE_PAYMENT_RECORDED" };
        private static readonly string[] RevenueRemoved = Array.Empty<string>();
        private static readonly string[] ExpenseAdded = { "PAYROLL_APPROVED" };
        private static readonly string[] ExpenseRemoved = Array.Empty<string>();

        private readonly WorkforceManagementDbContext _db;

        public BusinessOwnerNotificationsController(WorkforceManagementDbContext db)
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

        private static string Pkr(decimal amount) => $"PKR {amount:N0}";

        private static string ProfitSentence(decimal delta) =>
            delta >= 0 ? $"Profit increased by {Pkr(delta)}." : $"Profit decreased by {Pkr(-delta)}.";

        /// <summary>Title and text of one entry, with the amount worked out from the payment or payroll it is about.</summary>
        private async Task<(string Title, string Message)> DescribeAsync(AuditLog entry)
        {
            var id = int.TryParse(entry.EntityId, out var parsed) ? parsed : 0;

            if (entry.EntityType == "Invoice")
            {
                var invoice = await _db.Invoices.AsNoTracking().Where(i => i.InvoiceId == id).Select(i => new { i.InvoiceNumber, Org = i.Org != null ? i.Org.OrgName : null }).FirstOrDefaultAsync();
                // The payment that was recorded with this entry: the one created closest to it.
                var payment = (await _db.InvoicePayments.AsNoTracking().Where(p => p.InvoiceId == id).ToListAsync())
                    .OrderBy(p => Math.Abs((p.CreatedAt - entry.CreatedAt).TotalSeconds)).FirstOrDefault();
                var who = invoice?.Org ?? "An organization";
                if (payment == null) return ("Revenue added", $"{who} paid {invoice?.InvoiceNumber}.");
                var sign = RevenueRemoved.Contains(entry.Action) ? -1 : 1;
                return (sign > 0 ? "Revenue added" : "Revenue removed", $"{who} paid {Pkr(payment.AmountPkr)} for {invoice?.InvoiceNumber}. {ProfitSentence(sign * payment.AmountPkr)}");
            }

            var run = await _db.PayrollRuns.AsNoTracking().Where(r => r.PayrollId == id).Select(r => new { r.PeriodMonth, r.PeriodYear, r.TotalPkr }).FirstOrDefaultAsync();
            if (run == null) return ("Expense added", "A payroll was approved.");
            var direction = ExpenseRemoved.Contains(entry.Action) ? -1 : 1;
            return (direction > 0 ? "Expense added" : "Expense removed", $"Payroll {run.PeriodMonth:00}/{run.PeriodYear} approved: {Pkr(run.TotalPkr)}. {ProfitSentence(-direction * run.TotalPkr)}");
        }

        private IQueryable<AuditLog> Relevant() =>
            _db.AuditLogs.AsNoTracking().Where(a =>
                (a.EntityType == "Invoice" && (RevenueAdded.Contains(a.Action) || RevenueRemoved.Contains(a.Action))) ||
                (a.EntityType == "Payroll" && (ExpenseAdded.Contains(a.Action) || ExpenseRemoved.Contains(a.Action))));

        // GET api/business-owner/notifications?limit=20
        [HttpGet]
        public async Task<IActionResult> Feed(int limit = 20)
        {
            limit = Math.Clamp(limit, 1, 50);
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            // Switched off in Settings > Notifications.
            if (!await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp))
                return Ok(new NotificationFeedDto { Enabled = false });

            // Switched off by the owner in their own Settings.
            var pref = await SafeQuery.IfSchemaMissing(() => _db.ManagerNotificationPrefs.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == me), null);
            if (pref is { InApp: false }) return Ok(new NotificationFeedDto { Enabled = false });

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
            var relevant = Relevant();
            var unread = await relevant.CountAsync(a => a.AuditId > lastRead);
            var rows = await relevant.OrderByDescending(a => a.AuditId).Take(limit).ToListAsync();

            var items = new List<NotificationItemDto>();
            foreach (var a in rows)
            {
                var (title, message) = await DescribeAsync(a);
                items.Add(new NotificationItemDto
                {
                    Id = a.AuditId,
                    Action = a.Action,
                    Title = title,
                    Message = message,
                    ActorName = a.ActorName,
                    ActorUserId = a.ActorUserId,
                    EntityType = a.EntityType,
                    EntityId = a.EntityId,
                    CreatedAt = a.CreatedAt,
                    IsUnread = a.AuditId > lastRead,
                });
            }

            return Ok(new NotificationFeedDto { UnreadCount = unread, Items = items });
        }

        // POST api/business-owner/notifications/read-all
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
