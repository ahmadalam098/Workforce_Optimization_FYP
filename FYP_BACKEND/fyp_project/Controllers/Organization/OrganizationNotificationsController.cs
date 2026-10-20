using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>
    /// Organization portal: the notification bell. What concerns the signed-in organization: the admin's decisions about the organization, its
    /// contracts and contract changes, its staff requests (the manager's decision), the employees who start or stop working for it, its invoices
    /// and payments. Alerts: unread messages from its managers, contracts ending soon, overdue invoices. The read marker has its own table
    /// (an organization is not a user).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/notifications")]
    public class OrganizationNotificationsController : ControllerBase
    {
        private static readonly string[] OrganizationActions = { "ORGANIZATION_APPROVED", "ORGANIZATION_REJECTED", "ORGANIZATION_SUSPENDED", "ORGANIZATION_UPDATED" };
        private static readonly string[] ContractActions =
        {
            "CONTRACT_APPROVED", "CONTRACT_REJECTED", "CONTRACT_TERMINATED", "CONTRACT_UPDATED",
            "CONTRACT_MODIFICATION_APPROVED", "CONTRACT_MODIFICATION_APPLIED", "CONTRACT_MODIFICATION_REJECTED",
        };
        private static readonly string[] RequestActions = { "WORKFORCE_REQUEST_APPROVED", "WORKFORCE_REQUEST_REJECTED" };
        private static readonly string[] AllocationActions = { "EMPLOYEE_ALLOCATED", "EMPLOYEE_REALLOCATED", "EMPLOYEE_RELEASED", "ALLOCATION_OVERRIDE" };
        private static readonly string[] InvoiceActions =
        {
            "INVOICE_ISSUED", "INVOICE_CANCELLED", "INVOICE_PAYMENT_RECORDED", "INVOICE_REMINDER_SENT",
            "PAYMENT_SUBMISSION_VERIFIED", "PAYMENT_SUBMISSION_REJECTED", "PAYMENT_SUBMISSION_APPROVED", "ONLINE_PAYMENT_FAILED",
        };

        private static readonly Dictionary<string, string> Titles = new()
        {
            ["ORGANIZATION_APPROVED"] = "Your organization was approved",
            ["ORGANIZATION_REJECTED"] = "Your organization was rejected",
            ["ORGANIZATION_SUSPENDED"] = "Your organization was suspended",
            ["ORGANIZATION_UPDATED"] = "Your organization details were updated",
            ["CONTRACT_APPROVED"] = "Your contract was approved",
            ["CONTRACT_REJECTED"] = "Your contract was rejected",
            ["CONTRACT_TERMINATED"] = "Your contract was terminated",
            ["CONTRACT_UPDATED"] = "Your contract was updated",
            ["CONTRACT_MODIFICATION_APPROVED"] = "Your contract change was approved",
            ["CONTRACT_MODIFICATION_APPLIED"] = "Your contract change is now in force",
            ["CONTRACT_MODIFICATION_REJECTED"] = "Your contract change was not approved",
            ["WORKFORCE_REQUEST_APPROVED"] = "Your staff request was approved",
            ["WORKFORCE_REQUEST_REJECTED"] = "Your staff request was rejected",
            ["EMPLOYEE_ALLOCATED"] = "An employee started working for you",
            ["ALLOCATION_OVERRIDE"] = "An employee started working for you",
            ["EMPLOYEE_REALLOCATED"] = "An employee was moved",
            ["EMPLOYEE_RELEASED"] = "An employee stopped working for you",
            ["INVOICE_ISSUED"] = "A new invoice was issued",
            ["INVOICE_CANCELLED"] = "An invoice was cancelled",
            ["INVOICE_PAYMENT_RECORDED"] = "A payment was recorded",
            ["INVOICE_REMINDER_SENT"] = "Payment reminder",
            ["PAYMENT_SUBMISSION_VERIFIED"] = "Your manager verified your payment",
            ["PAYMENT_SUBMISSION_REJECTED"] = "Your payment notice was not accepted",
            ["PAYMENT_SUBMISSION_APPROVED"] = "Your payment was approved",
            ["ONLINE_PAYMENT_FAILED"] = "Your online payment did not go through",
        };

        private readonly WorkforceManagementDbContext _db;

        public OrganizationNotificationsController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private static string TitleOf(string action)
        {
            if (Titles.TryGetValue(action, out var title)) return title;
            var text = action.Replace('_', ' ').ToLowerInvariant();
            return text.Length == 0 ? action : char.ToUpperInvariant(text[0]) + text[1..];
        }

        private async Task<OrganizationSettings> PrefAsync(int orgId) =>
            await SafeQuery.IfSchemaMissing(() => _db.OrganizationSettings.AsNoTracking().FirstOrDefaultAsync(s => s.OrgId == orgId), null) ?? new OrganizationSettings();

        private async Task<IQueryable<AuditLog>> RelevantAsync(int orgId, OrganizationSettings pref)
        {
            var orgKey = orgId.ToString();
            var contractKeys = (await _db.Contracts.AsNoTracking().Where(c => c.OrgId == orgId).Select(c => c.ContractId).ToListAsync()).Select(i => i.ToString()).ToList();
            var requestKeys = (await _db.WorkforceRequests.AsNoTracking().Where(r => r.OrgId == orgId).Select(r => r.WorkforceRequestId).ToListAsync()).Select(i => i.ToString()).ToList();
            var allocationKeys = (await _db.EmployeeAllocations.AsNoTracking().Where(a => a.AssignOrgId == orgId).Select(a => a.AllocationId).ToListAsync()).Select(i => i.ToString()).ToList();
            // Drafts are not the organization's business yet: the issue entry is what tells it about an invoice.
            var invoiceKeys = (await _db.Invoices.AsNoTracking().Where(i => i.OrgId == orgId && i.Status != InvoiceService.Draft).Select(i => i.InvoiceId).ToListAsync()).Select(i => i.ToString()).ToList();

            // Categories the organization switched off in Settings > Notifications.
            var contracts = pref.Contracts;
            var requests = pref.Requests;
            var employees = pref.Employees;
            var invoices = pref.Invoices;
            return _db.AuditLogs.AsNoTracking().Where(a =>
                (contracts && a.EntityType == "Organization" && a.EntityId == orgKey && OrganizationActions.Contains(a.Action)) ||
                (contracts && a.EntityType == "Contract" && contractKeys.Contains(a.EntityId!) && ContractActions.Contains(a.Action)) ||
                (requests && a.EntityType == "WorkforceRequest" && requestKeys.Contains(a.EntityId!) && RequestActions.Contains(a.Action)) ||
                (employees && a.EntityType == "Allocation" && allocationKeys.Contains(a.EntityId!) && AllocationActions.Contains(a.Action)) ||
                (invoices && a.EntityType == "Invoice" && invoiceKeys.Contains(a.EntityId!) && InvoiceActions.Contains(a.Action)));
        }

        private async Task<List<NotificationAlertDto>> AlertsAsync(int orgId, OrganizationSettings pref)
        {
            var alerts = new List<NotificationAlertDto>();

            var unread = await _db.ChatMessages.AsNoTracking()
                .Where(m => m.OrgId == orgId && m.SenderType == ChatMessage.FromManager && m.ReadAt == null)
                .OrderByDescending(m => m.MessageId).ToListAsync();
            if (pref.Chat && unread.Count > 0)
            {
                var names = await _db.Users.AsNoTracking().Where(u => unread.Select(m => m.ManagerUserId).Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);
                foreach (var group in unread.GroupBy(m => m.ManagerUserId))
                {
                    var latest = group.First().Body;
                    if (latest.Length > 90) latest = latest[..90] + "...";
                    alerts.Add(new NotificationAlertDto
                    {
                        Key = $"chat-{group.Key}-{group.First().MessageId}",
                        Title = $"{names.GetValueOrDefault(group.Key) ?? "Your manager"}: {group.Count()} new message{(group.Count() == 1 ? string.Empty : "s")}",
                        Message = latest,
                        Link = "/organization/chat",
                    });
                }
            }

            var today = Money.Today;
            var overdue = await _db.Invoices.AsNoTracking()
                .Where(i => i.OrgId == orgId && i.Status == InvoiceService.Issued && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today)
                .Select(i => new { i.InvoiceId, i.InvoiceNumber, i.Currency, i.TotalAmount, i.PaidAmount, i.DueDate }).ToListAsync();
            foreach (var invoice in pref.Invoices ? overdue : new())
            {
                alerts.Add(new NotificationAlertDto
                {
                    Key = $"overdue-{invoice.InvoiceId}-{today:yyyyMMdd}",
                    Title = $"Invoice {invoice.InvoiceNumber} is overdue",
                    Message = $"{invoice.TotalAmount - invoice.PaidAmount:0.00} {invoice.Currency} was due on {invoice.DueDate:yyyy-MM-dd}.",
                    Link = $"/organization/invoices/{invoice.InvoiceId}",
                });
            }

            var days = pref.Expiry ? pref.ExpiryDays ?? await SettingsReader.GetIntAsync(_db, SettingsCatalog.NotifyContractExpiryDays) : 0;
            if (days > 0)
            {
                var limit = today.AddDays(days);
                var contracts = await _db.Contracts.AsNoTracking().Where(c => c.OrgId == orgId && (c.Status == "Active" || c.Status == "Approved")).Select(c => new { c.ContractId, c.ContractNumber }).ToListAsync();
                var ids = contracts.Select(c => c.ContractId).ToList();
                var versions = await _db.ContractVersions.AsNoTracking().Where(v => ids.Contains(v.ContractId)).ToListAsync();
                foreach (var contract in contracts)
                {
                    var end = versions.Where(v => v.ContractId == contract.ContractId).OrderByDescending(v => v.VersionNo).FirstOrDefault()?.EndDate;
                    if (end == null || end < today || end > limit) continue;
                    var left = end.Value.DayNumber - today.DayNumber;
                    alerts.Add(new NotificationAlertDto
                    {
                        Key = $"expiry-{contract.ContractId}-{end:yyyyMMdd}",
                        Title = $"Contract {contract.ContractNumber} ending soon",
                        Message = $"It ends {end:yyyy-MM-dd} ({(left == 0 ? "today" : left == 1 ? "tomorrow" : $"in {left} days")}). Ask for a change if you want to continue.",
                        Link = $"/organization/contracts/{contract.ContractId}",
                    });
                }
            }
            return alerts;
        }

        // GET api/organization/notifications?limit=20
        [HttpGet]
        public async Task<IActionResult> Feed(int limit = 20)
        {
            limit = Math.Clamp(limit, 1, 50);
            var orgId = OrgId;

            // Switched off in Settings > Notifications.
            if (!await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp))
                return Ok(new NotificationFeedDto { Enabled = false });

            var pref = await PrefAsync(orgId);
            if (!pref.InApp) return Ok(new NotificationFeedDto { Enabled = false });

            var state = await _db.OrganizationNotificationStates.FirstOrDefaultAsync(s => s.OrgId == orgId);
            if (state == null)
            {
                // First time: what happened before now counts as already seen.
                var newest = await _db.AuditLogs.AsNoTracking().MaxAsync(a => (int?)a.AuditId) ?? 0;
                state = new OrganizationNotificationState { OrgId = orgId, LastReadAuditId = newest, UpdatedAt = DateTime.UtcNow };
                _db.OrganizationNotificationStates.Add(state);
                await _db.SaveChangesAsync();
            }

            var lastRead = state.LastReadAuditId;
            var relevant = await RelevantAsync(orgId, pref);
            var unread = await relevant.CountAsync(a => a.AuditId > lastRead);
            var rows = await relevant.OrderByDescending(a => a.AuditId).Take(limit).ToListAsync();
            var alerts = await AlertsAsync(orgId, pref);

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

        // POST api/organization/notifications/read-all
        [HttpPost("read-all")]
        public async Task<IActionResult> ReadAll()
        {
            var orgId = OrgId;
            var newest = await _db.AuditLogs.AsNoTracking().MaxAsync(a => (int?)a.AuditId) ?? 0;
            var state = await _db.OrganizationNotificationStates.FirstOrDefaultAsync(s => s.OrgId == orgId);
            if (state == null)
                _db.OrganizationNotificationStates.Add(new OrganizationNotificationState { OrgId = orgId, LastReadAuditId = newest, UpdatedAt = DateTime.UtcNow });
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
