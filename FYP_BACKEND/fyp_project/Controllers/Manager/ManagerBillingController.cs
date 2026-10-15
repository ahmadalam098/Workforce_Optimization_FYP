using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>
    /// Organization Manager portal: the invoices and payments of the organizations the manager handles. The manager can read them and mark
    /// an invoice (or a payment) as verified after checking it. A draft invoice is shown (read only, marked Draft) but cannot be verified
    /// until the admin issues it.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/billing")]
    public class ManagerBillingController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public ManagerBillingController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
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

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.OrgId != null)
                .Select(m => m.OrgId!.Value)
                .ToListAsync();
        }

        /// <summary>The manager's invoices (drafts included).</summary>
        private IQueryable<Invoice> MyInvoices(List<int> orgIds) =>
            _db.Invoices.AsNoTracking().Where(i => orgIds.Contains(i.OrgId));

        // GET api/manager/billing/summary   -> one row per currency
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var today = Money.Today;

            var invoices = await MyInvoices(orgIds).Where(i => i.Status != InvoiceService.Cancelled && i.Status != InvoiceService.Draft)
                .Select(i => new { i.Currency, i.TotalAmount, i.PaidAmount, i.Status, i.DueDate, i.VerifiedAt })
                .ToListAsync();

            var unverifiedPayments = await _db.InvoicePayments.AsNoTracking()
                .CountAsync(p => p.VerifiedAt == null && _db.Invoices.Any(i => i.InvoiceId == p.InvoiceId && orgIds.Contains(i.OrgId) && i.Status != InvoiceService.Draft && i.Status != InvoiceService.Cancelled));

            var perCurrency = invoices.GroupBy(i => i.Currency).Select(g => new
            {
                currency = g.Key,
                invoiced = g.Sum(i => i.TotalAmount),
                paid = g.Sum(i => i.PaidAmount),
                outstanding = g.Sum(i => i.TotalAmount - i.PaidAmount),
                overdueInvoices = g.Count(i => i.Status == InvoiceService.Issued && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today),
            }).OrderBy(x => x.currency).ToList();

            return Ok(new
            {
                currencies = perCurrency,
                invoiceCount = invoices.Count,
                unverifiedInvoices = invoices.Count(i => i.VerifiedAt == null),
                unverifiedPayments,
            });
        }

        // GET api/manager/billing/invoices?search=&status=&organizationId=&verified=&page=1&pageSize=10
        [HttpGet("invoices")]
        public async Task<IActionResult> Invoices(string? search, string? status, int? organizationId, bool? verified, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var orgIds = await MyOrganizationIdsAsync();
            var today = Money.Today;

            if (organizationId.HasValue && !orgIds.Contains(organizationId.Value))
                return StatusCode(403, new { message = "You can only see the organizations you manage." });

            var query = MyInvoices(orgIds);
            if (organizationId.HasValue) query = query.Where(i => i.OrgId == organizationId.Value);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(i => (i.InvoiceNumber != null && i.InvoiceNumber.Contains(term)) || (i.Org != null && i.Org.OrgName != null && i.Org.OrgName.Contains(term)));
            }
            if (verified.HasValue) query = verified.Value ? query.Where(i => i.VerifiedAt != null) : query.Where(i => i.VerifiedAt == null && i.Status != InvoiceService.Cancelled && i.Status != InvoiceService.Draft);

            query = status switch
            {
                "Draft" or "Paid" or "Cancelled" => query.Where(i => i.Status == status),
                "Overdue" => query.Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today),
                "PartiallyPaid" => query.Where(i => i.Status == "Issued" && i.PaidAmount > 0 && i.PaidAmount < i.TotalAmount && (i.DueDate == null || i.DueDate >= today)),
                "Issued" => query.Where(i => i.Status == "Issued" && i.PaidAmount == 0 && (i.DueDate == null || i.DueDate >= today)),
                _ => query,
            };

            var total = await query.CountAsync();

            var rows = await query.OrderByDescending(i => i.InvoiceId).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(i => new
                {
                    invoiceId = i.InvoiceId,
                    invoiceNumber = i.InvoiceNumber,
                    orgId = i.OrgId,
                    orgName = i.Org != null ? i.Org.OrgName : null,
                    currency = i.Currency,
                    periodStart = i.PeriodStart,
                    periodEnd = i.PeriodEnd,
                    totalAmount = i.TotalAmount,
                    paidAmount = i.PaidAmount,
                    status = i.Status,
                    issueDate = i.IssueDate,
                    dueDate = i.DueDate,
                    verifiedAt = i.VerifiedAt,
                    verifiedBy = _db.Users.Where(u => u.UserId == i.VerifiedBy).Select(u => u.Name).FirstOrDefault(),
                    unverifiedPayments = _db.InvoicePayments.Count(p => p.InvoiceId == i.InvoiceId && p.VerifiedAt == null),
                })
                .ToListAsync();

            var items = rows.Select(i => new
            {
                i.invoiceId, i.invoiceNumber, i.orgId, i.orgName, i.currency, i.periodStart, i.periodEnd, i.totalAmount, i.paidAmount,
                balance = i.status == InvoiceService.Cancelled ? 0 : i.totalAmount - i.paidAmount,
                i.status,
                displayStatus = InvoiceService.DisplayStatus(i.status, i.totalAmount, i.paidAmount, i.dueDate, today),
                i.issueDate, i.dueDate, i.verifiedAt, i.verifiedBy, i.unverifiedPayments,
            }).ToList();

            return Ok(new { items, total, page, pageSize });
        }

        // GET api/manager/billing/invoices/5
        [HttpGet("invoices/{invoiceId:int}")]
        public async Task<IActionResult> Invoice(int invoiceId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var invoice = await MyInvoices(orgIds).Include(i => i.Org).FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFound(new { message = "Invoice not found." });

            var today = Money.Today;
            var contractNumber = invoice.ContractId == null
                ? null
                : await _db.Contracts.AsNoTracking().Where(c => c.ContractId == invoice.ContractId).Select(c => c.ContractNumber).FirstOrDefaultAsync();
            var lines = await _db.InvoiceLines.AsNoTracking().Where(l => l.InvoiceId == invoiceId).OrderBy(l => l.LineId).ToListAsync();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => p.InvoiceId == invoiceId).OrderByDescending(p => p.PaidAt).ToListAsync();

            var userIds = payments.Where(p => p.VerifiedBy.HasValue).Select(p => p.VerifiedBy!.Value)
                .Concat(invoice.VerifiedBy.HasValue ? new[] { invoice.VerifiedBy.Value } : Array.Empty<int>()).Distinct().ToList();
            var names = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);

            return Ok(new
            {
                invoiceId = invoice.InvoiceId,
                invoiceNumber = invoice.InvoiceNumber,
                orgId = invoice.OrgId,
                orgName = invoice.Org?.OrgName,
                contractNumber,
                currency = invoice.Currency,
                periodStart = invoice.PeriodStart,
                periodEnd = invoice.PeriodEnd,
                totalAmount = invoice.TotalAmount,
                paidAmount = invoice.PaidAmount,
                balance = invoice.Status == InvoiceService.Cancelled ? 0 : invoice.TotalAmount - invoice.PaidAmount,
                status = invoice.Status,
                displayStatus = InvoiceService.DisplayStatus(invoice.Status, invoice.TotalAmount, invoice.PaidAmount, invoice.DueDate, today),
                issueDate = invoice.IssueDate,
                dueDate = invoice.DueDate,
                notes = invoice.Notes,
                cancelReason = invoice.CancelReason,
                canVerify = invoice.VerifiedAt == null && invoice.Status != InvoiceService.Cancelled && invoice.Status != InvoiceService.Draft,
                verifiedAt = invoice.VerifiedAt,
                verifiedBy = invoice.VerifiedBy.HasValue ? names.GetValueOrDefault(invoice.VerifiedBy.Value) : null,
                lines = lines.Select(l => new { l.LineId, l.LineType, l.Description, l.Quantity, l.UnitRate, l.Amount }),
                payments = payments.Select(p => new
                {
                    p.PaymentId, p.Amount, p.Currency, p.AmountPkr, p.PaidAt, p.Method, p.Reference, p.Notes,
                    verifiedAt = p.VerifiedAt,
                    verifiedBy = p.VerifiedBy.HasValue ? names.GetValueOrDefault(p.VerifiedBy.Value) : null,
                }),
            });
        }

        // POST api/manager/billing/invoices/5/verify
        [HttpPost("invoices/{invoiceId:int}/verify")]
        public async Task<IActionResult> VerifyInvoice(int invoiceId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId && orgIds.Contains(i.OrgId));
            if (invoice == null) return NotFound(new { message = "Invoice not found." });
            if (invoice.Status == InvoiceService.Draft) return Conflict(new { message = "This invoice is still a draft. It can be verified after the administrator issues it." });
            if (invoice.Status == InvoiceService.Cancelled) return Conflict(new { message = "A cancelled invoice cannot be verified." });
            if (invoice.VerifiedAt != null) return Conflict(new { message = "This invoice is already verified." });

            invoice.VerifiedAt = DateTime.UtcNow;
            invoice.VerifiedBy = CurrentUserId;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "INVOICE_VERIFIED", "Invoice", invoiceId, $"Organization manager verified invoice {invoice.InvoiceNumber}");
            return Ok(new { message = $"Invoice {invoice.InvoiceNumber} verified." });
        }

        // GET api/manager/billing/payments?search=&organizationId=&verified=&page=1&pageSize=10
        [HttpGet("payments")]
        public async Task<IActionResult> Payments(string? search, int? organizationId, bool? verified, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var orgIds = await MyOrganizationIdsAsync();

            if (organizationId.HasValue && !orgIds.Contains(organizationId.Value))
                return StatusCode(403, new { message = "You can only see the organizations you manage." });

            var scope = organizationId.HasValue ? new List<int> { organizationId.Value } : orgIds;
            var query = _db.InvoicePayments.AsNoTracking()
                .Where(p => _db.Invoices.Any(i => i.InvoiceId == p.InvoiceId && scope.Contains(i.OrgId) && i.Status != InvoiceService.Draft));

            if (verified.HasValue) query = verified.Value ? query.Where(p => p.VerifiedAt != null) : query.Where(p => p.VerifiedAt == null);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(p => (p.Reference != null && p.Reference.Contains(term)) ||
                    _db.Invoices.Any(i => i.InvoiceId == p.InvoiceId && ((i.InvoiceNumber != null && i.InvoiceNumber.Contains(term)) || (i.Org != null && i.Org.OrgName != null && i.Org.OrgName.Contains(term)))));
            }

            var total = await query.CountAsync();
            var items = await query.OrderByDescending(p => p.PaidAt).ThenByDescending(p => p.PaymentId).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(p => new
                {
                    paymentId = p.PaymentId,
                    invoiceId = p.InvoiceId,
                    invoiceNumber = _db.Invoices.Where(i => i.InvoiceId == p.InvoiceId).Select(i => i.InvoiceNumber).FirstOrDefault(),
                    orgName = _db.Invoices.Where(i => i.InvoiceId == p.InvoiceId).Select(i => i.Org != null ? i.Org.OrgName : null).FirstOrDefault(),
                    amount = p.Amount,
                    currency = p.Currency,
                    paidAt = p.PaidAt,
                    method = p.Method,
                    reference = p.Reference,
                    verifiedAt = p.VerifiedAt,
                    verifiedBy = _db.Users.Where(u => u.UserId == p.VerifiedBy).Select(u => u.Name).FirstOrDefault(),
                })
                .ToListAsync();

            return Ok(new { items, total, page, pageSize });
        }

        // POST api/manager/billing/payments/5/verify
        [HttpPost("payments/{paymentId:int}/verify")]
        public async Task<IActionResult> VerifyPayment(int paymentId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var payment = await _db.InvoicePayments.FirstOrDefaultAsync(p => p.PaymentId == paymentId);
            var invoice = payment == null ? null : await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == payment.InvoiceId && orgIds.Contains(i.OrgId) && i.Status != InvoiceService.Draft);
            if (payment == null || invoice == null) return NotFound(new { message = "Payment not found." });
            if (payment.VerifiedAt != null) return Conflict(new { message = "This payment is already verified." });

            payment.VerifiedAt = DateTime.UtcNow;
            payment.VerifiedBy = CurrentUserId;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "PAYMENT_VERIFIED", "Invoice", invoice.InvoiceId, $"Organization manager verified a payment of {payment.Amount:0.00} {payment.Currency} on invoice {invoice.InvoiceNumber}");
            return Ok(new { message = $"Payment of {payment.Amount:0.00} {payment.Currency} verified." });
        }
    }
}
