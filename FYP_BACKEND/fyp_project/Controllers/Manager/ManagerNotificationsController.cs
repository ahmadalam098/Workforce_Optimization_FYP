using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>
    /// Organization Manager portal: the notification bell. Every audited action that concerns the manager's own organizations or employees
    /// (staff requests, allocations, queries, invoices and payments, contracts, the organization itself, their employees, payroll that
    /// includes their employees) or the manager's own account is a notification, except what the manager did themselves. Alerts on top:
    /// unread chat messages and contracts that end soon. Each manager has their own read marker (the same table the admin bell uses).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/notifications")]
    public class ManagerNotificationsController : ControllerBase
    {
        private static readonly string[] EmployeeActions =
        {
            "EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_ACTIVATED", "EMPLOYEE_DEACTIVATED", "EMPLOYEE_SKILL_ADDED", "EMPLOYEE_SKILL_UPDATED",
            "EMPLOYEE_SKILL_REMOVED", "SHIFT_ASSIGNED", "SHIFT_UNASSIGNED", "OVERTIME_RECORDED",
        };
        private static readonly string[] InvoiceActions =
        {
            "INVOICE_ISSUED", "INVOICE_CANCELLED", "INVOICE_PAYMENT_RECORDED",
            "PAYMENT_SUBMITTED", "PAYMENT_SUBMISSION_APPROVED", "PAYMENT_SUBMISSION_REJECTED", "PAYMENT_SUBMISSION_WITHDRAWN",
        };
        private static readonly string[] TicketActions = { "TICKET_CREATED", "TICKET_RESOLVED", "TICKET_FORWARDED" };
        private static readonly string[] PayrollActions = { "PAYROLL_APPROVED", "PAYROLL_PAID" };

        private readonly WorkforceManagementDbContext _db;

        public ManagerNotificationsController(WorkforceManagementDbContext db)
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

        private static readonly Dictionary<string, string> Titles = new()
        {
            ["TICKET_CREATED"] = "New query or complaint",
            ["TICKET_RESOLVED"] = "Query or complaint resolved",
            ["TICKET_FORWARDED"] = "Query sent to the admin",
            ["OFFER_ACCEPTED"] = "An employee accepted an assignment",
            ["OFFER_DECLINED"] = "An employee declined an assignment",
            ["OFFER_FAILED"] = "An accepted assignment could not be made",
            ["PAYMENT_SUBMITTED"] = "An organization says it paid",
            ["PAYMENT_SUBMISSION_APPROVED"] = "A payment was approved",
            ["PAYMENT_SUBMISSION_REJECTED"] = "A payment notice was rejected",
            ["PAYMENT_SUBMISSION_WITHDRAWN"] = "A payment notice was withdrawn",
            ["EMPLOYEE_REVIEW_SUBMITTED"] = "New review of an employee",
            ["EMPLOYEE_REVIEW_DISMISSED"] = "Review handled",
            ["REVIEW_ESCALATED"] = "Review sent to the admin",
            ["REVIEW_ESCALATION_DECIDED"] = "The admin decided about a review",
            ["WORKFORCE_REQUEST_CREATED"] = "New staff request",
            ["WORKFORCE_REQUEST_APPROVED"] = "Staff request approved",
            ["WORKFORCE_REQUEST_REJECTED"] = "Staff request rejected",
            ["WORKFORCE_REQUEST_CANCELLED"] = "Staff request cancelled",
        };

        private static string TitleOf(string action)
        {
            if (Titles.TryGetValue(action, out var friendly)) return friendly;
            var text = action.Replace('_', ' ').ToLowerInvariant();
            return text.Length == 0 ? action : char.ToUpperInvariant(text[0]) + text[1..];
        }

        /// <summary>The audit entries that concern this manager, newest first.</summary>
        private async Task<IQueryable<AuditLog>> RelevantAsync(int me, ManagerNotificationPref pref)
        {
            var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            var orgKeys = orgIds.Select(i => i.ToString()).ToList();

            var contractKeys = (await _db.Contracts.AsNoTracking().Where(c => c.OrgId != null && orgIds.Contains(c.OrgId.Value)).Select(c => c.ContractId).ToListAsync()).Select(i => i.ToString()).ToList();
            var requestKeys = (await _db.WorkforceRequests.AsNoTracking().Where(r => r.OrgId != null && orgIds.Contains(r.OrgId.Value)).Select(r => r.WorkforceRequestId).ToListAsync()).Select(i => i.ToString()).ToList();
            var allocationKeys = (await _db.EmployeeAllocations.AsNoTracking()
                .Where(a => (a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value)) || (a.OwnerOrgId != null && orgIds.Contains(a.OwnerOrgId.Value)))
                .Select(a => a.AllocationId).ToListAsync()).Select(i => i.ToString()).ToList();
            var invoiceKeys = (await _db.Invoices.AsNoTracking().Where(i => orgIds.Contains(i.OrgId)).Select(i => i.InvoiceId).ToListAsync()).Select(i => i.ToString()).ToList();
            var reviewKeys = (await _db.OrganizationReviews.AsNoTracking().Where(r => r.OrgId != null && orgIds.Contains(r.OrgId.Value)).Select(r => r.ReviewId).ToListAsync()).Select(i => i.ToString()).ToList();
            var offerKeys = (await _db.AssignmentOffers.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).Select(o => o.OfferId).ToListAsync()).Select(i => i.ToString()).ToList();
            var ticketKeys = (await _db.Tickets.AsNoTracking().Where(t => t.OrgId != null && orgIds.Contains(t.OrgId.Value)).Select(t => t.TicketId).ToListAsync()).Select(i => i.ToString()).ToList();

            // The manager's own employees: working for one of the organizations now, or (when free) belonging to one.
            var open = _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);
            var employeeIds = await _db.Employees.AsNoTracking()
                .Where(e => open.Any(a => a.EmployeeId == e.EmpId && a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value)) ||
                            (e.OrgId != null && orgIds.Contains(e.OrgId.Value) && !open.Any(a => a.EmployeeId == e.EmpId)))
                .Select(e => e.EmpId).ToListAsync();
            var employeeKeys = employeeIds.Select(i => i.ToString()).ToList();
            var payrollKeys = (await _db.PayrollItems.AsNoTracking().Where(i => employeeIds.Contains(i.EmpId)).Select(i => i.PayrollId).Distinct().ToListAsync()).Select(i => i.ToString()).ToList();
            var myKey = me.ToString();

            // Categories the manager switched off in Settings > Notifications.
            var hidden = new List<string>();
            if (!pref.Requests) hidden.AddRange(new[] { "WorkforceRequest", "AssignmentOffer" });
            if (!pref.Queries) hidden.Add("Ticket");
            if (!pref.Invoices) hidden.Add("Invoice");
            if (!pref.Employees) hidden.AddRange(new[] { "Employee", "EmployeeReview", "Allocation", "Payroll" });

            return _db.AuditLogs.AsNoTracking().Where(a => a.ActorUserId != me && !hidden.Contains(a.EntityType!) && (
                (a.EntityType == "Organization" && orgKeys.Contains(a.EntityId!) && !a.Action.StartsWith("ORGANIZATION_EMAIL")) ||
                (a.EntityType == "Contract" && contractKeys.Contains(a.EntityId!)) ||
                (a.EntityType == "WorkforceRequest" && requestKeys.Contains(a.EntityId!)) ||
                (a.EntityType == "EmployeeReview" && reviewKeys.Contains(a.EntityId!)) ||
                (a.EntityType == "AssignmentOffer" && offerKeys.Contains(a.EntityId!) && a.Action != "OFFER_SENT_TO_EMPLOYEE") ||
                (a.EntityType == "Allocation" && allocationKeys.Contains(a.EntityId!)) ||
                (a.EntityType == "Invoice" && invoiceKeys.Contains(a.EntityId!) && InvoiceActions.Contains(a.Action)) ||
                (a.EntityType == "Ticket" && ticketKeys.Contains(a.EntityId!) && TicketActions.Contains(a.Action)) ||
                (a.EntityType == "Employee" && employeeKeys.Contains(a.EntityId!) && EmployeeActions.Contains(a.Action)) ||
                (a.EntityType == "Payroll" && payrollKeys.Contains(a.EntityId!) && PayrollActions.Contains(a.Action)) ||
                (a.EntityType == "User" && a.EntityId == myKey && a.Action != "PROFILE_PICTURE_CHANGED" && a.Action != "PROFILE_PICTURE_REMOVED")));
        }

        private async Task<List<NotificationAlertDto>> AlertsAsync(int me, ManagerNotificationPref pref)
        {
            var alerts = new List<NotificationAlertDto>();

            // One alert per organization that wrote to the manager and has not been read yet, with the latest message.
            var unread = await _db.ChatMessages.AsNoTracking()
                .Where(m => m.ManagerUserId == me && m.SenderType == ChatMessage.FromOrganization && m.ReadAt == null)
                .OrderByDescending(m => m.MessageId).ToListAsync();
            if (pref.Chat && unread.Count > 0)
            {
                var orgNames = await _db.Organizations.AsNoTracking().Where(o => unread.Select(m => m.OrgId).Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);
                foreach (var group in unread.GroupBy(m => m.OrgId))
                {
                    var latest = group.First().Body;
                    if (latest.Length > 90) latest = latest[..90] + "...";
                    alerts.Add(new NotificationAlertDto
                    {
                        Key = $"chat-{group.Key}-{group.First().MessageId}",
                        Title = $"{orgNames.GetValueOrDefault(group.Key) ?? "An organization"}: {group.Count()} new message{(group.Count() == 1 ? string.Empty : "s")}",
                        Message = latest,
                        Link = "/manager/chat",
                    });
                }
            }

            if (pref.Invoices)
            {
                var myOrgs = await _db.OrganizationManagers.AsNoTracking().Where(x => x.UserId == me && x.OrgId != null).Select(x => x.OrgId!.Value).ToListAsync();
                var toVerify = await SafeQuery.IfSchemaMissing(() => _db.PaymentSubmissions.AsNoTracking().Where(s => myOrgs.Contains(s.OrgId) && s.Status == PaymentSubmission.Pending).Select(s => s.SubmissionId).ToListAsync(), null);
                if (toVerify is { Count: > 0 })
                    alerts.Add(new NotificationAlertDto
                    {
                        Key = $"payment-verify-{toVerify.Count}-{toVerify.Max()}",
                        Title = $"{toVerify.Count} payment{(toVerify.Count == 1 ? string.Empty : "s")} to verify",
                        Message = "Your organizations say they paid. Check the reference and the proof, then verify.",
                        Link = "/manager/payment-submissions",
                    });
            }

            var days = pref.Expiry ? pref.ExpiryDays ?? await SettingsReader.GetIntAsync(_db, SettingsCatalog.NotifyContractExpiryDays) : 0;
            if (days > 0)
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                var limit = today.AddDays(days);
                var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
                var contracts = await _db.Contracts.AsNoTracking()
                    .Where(c => c.OrgId != null && orgIds.Contains(c.OrgId.Value) && (c.Status == "Active" || c.Status == "Approved"))
                    .Select(c => new { c.ContractId, c.ContractNumber, c.OrgId, OrgName = c.Org != null ? c.Org.OrgName : null }).ToListAsync();
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
                        Message = $"{contract.OrgName}: ends {end:yyyy-MM-dd} ({(left == 0 ? "today" : left == 1 ? "tomorrow" : $"in {left} days")}).",
                        Link = $"/manager/organizations/{contract.OrgId}",
                    });
                }
            }
            return alerts;
        }

        // GET api/manager/notifications?limit=20
        [HttpGet]
        public async Task<IActionResult> Feed(int limit = 20)
        {
            limit = Math.Clamp(limit, 1, 50);
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            // Switched off in Settings > Notifications.
            if (!await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp))
                return Ok(new NotificationFeedDto { Enabled = false });

            var pref = await SafeQuery.IfSchemaMissing(() => _db.ManagerNotificationPrefs.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == me), null) ?? new ManagerNotificationPref();
            if (!pref.InApp) return Ok(new NotificationFeedDto { Enabled = false });

            var state = await _db.NotificationStates.FirstOrDefaultAsync(s => s.UserId == me);
            if (state == null)
            {
                // First time: what happened before now counts as already seen, so a new manager is not shown a backlog as unread.
                var newest = await _db.AuditLogs.AsNoTracking().MaxAsync(a => (int?)a.AuditId) ?? 0;
                state = new NotificationState { UserId = me.Value, LastReadAuditId = newest, UpdatedAt = DateTime.UtcNow };
                _db.NotificationStates.Add(state);
                await _db.SaveChangesAsync();
            }

            var lastRead = state.LastReadAuditId;
            var relevant = await RelevantAsync(me.Value, pref);
            var unread = await relevant.CountAsync(a => a.AuditId > lastRead);
            var rows = await relevant.OrderByDescending(a => a.AuditId).Take(limit).ToListAsync();
            var alerts = await AlertsAsync(me.Value, pref);

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

        // POST api/manager/notifications/read-all
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
