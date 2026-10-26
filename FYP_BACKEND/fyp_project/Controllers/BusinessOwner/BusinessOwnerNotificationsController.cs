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
    /// Business Owner portal: the notification bell. Only what changes the money: revenue added (a payment from an organization was recorded),
    /// an expense added or voided by the admin, and - addressed to this owner only - the profit share the admin sent (with a link to the receipt).
    /// Every owner has their own read marker (the same table the other bells use).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "BusinessOwnerOnly")]
    [MissingMigrationFilter]
    [Route("api/business-owner/notifications")]
    public class BusinessOwnerNotificationsController : ControllerBase
    {
        private static readonly string[] RevenueActions = { "INVOICE_PAYMENT_RECORDED" };
        private static readonly string[] ExpenseActions = { "EXPENSE_ADDED", "EXPENSE_VOIDED" };
        private const string PayoutAction = "OWNER_PAYOUT_SENT";

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

        /// <summary>Title and text of one entry, with the amount worked out from the payment, expense or payout it is about.</summary>
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
                return ("Revenue added", $"{who} paid {Pkr(payment.AmountPkr)} for {invoice?.InvoiceNumber}. {ProfitSentence(payment.AmountPkr)}");
            }

            if (entry.EntityType == "Expense")
            {
                var expense = await _db.CompanyExpenses.AsNoTracking().FirstOrDefaultAsync(e => e.ExpenseId == id);
                if (expense == null) return ("Expense", "An expense was written down.");
                var text = string.IsNullOrWhiteSpace(expense.Description) ? string.Empty : $" ({expense.Description})";
                return entry.Action == "EXPENSE_VOIDED"
                    ? ("Expense removed", $"An expense of {Pkr(expense.AmountPkr)}{text} was taken back. {ProfitSentence(expense.AmountPkr)}")
                    : ("Expense added", $"The admin wrote down an expense of {Pkr(expense.AmountPkr)}{text}. {ProfitSentence(-expense.AmountPkr)}");
            }

            // Payout: this owner's own share.
            var payout = await _db.OwnerPayouts.AsNoTracking().Include(p => p.Settlement).FirstOrDefaultAsync(p => p.PayoutId == id);
            if (payout?.Settlement == null) return ("Profit sent to you", entry.Details ?? "The admin sent you your share of the profit.");
            var month = CompanyLedgerService.MonthLabel(payout.Settlement.PeriodYear, payout.Settlement.PeriodMonth);
            return ("Profit sent to you", $"The admin sent you {Pkr(payout.AmountPkr)}, your share of the profit for {month} ({DocumentCodes.PayoutNumber(payout.Settlement.PeriodYear, payout.Settlement.PeriodMonth, payout.PayoutId)}). Open the receipt.");
        }

        private async Task<IQueryable<AuditLog>> RelevantAsync(int me)
        {
            var myPayouts = (await SafeQuery.IfSchemaMissing(() => _db.OwnerPayouts.AsNoTracking().Where(p => p.OwnerUserId == me).Select(p => p.PayoutId).ToListAsync(), null) ?? new())
                .Select(i => i.ToString()).ToList();
            return _db.AuditLogs.AsNoTracking().Where(a =>
                (a.EntityType == "Invoice" && RevenueActions.Contains(a.Action)) ||
                (a.EntityType == "Expense" && ExpenseActions.Contains(a.Action)) ||
                (a.EntityType == "Payout" && a.Action == PayoutAction && myPayouts.Contains(a.EntityId!)));
        }

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
            var relevant = await RelevantAsync(me.Value);
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
