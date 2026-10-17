using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>
    /// Organization portal: the organization's own invoices and payments (read only). Draft invoices are not shown: the organization sees an
    /// invoice once the admin has issued it. Cancelled invoices stay visible, with the reason.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/billing")]
    public class OrganizationBillingController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public OrganizationBillingController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private IQueryable<Invoice> Mine() => _db.Invoices.AsNoTracking().Where(i => i.OrgId == OrgId && i.Status != InvoiceService.Draft);

        // GET api/organization/billing/summary   -> one row per currency
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var today = Money.Today;
            var invoices = await Mine().Where(i => i.Status != InvoiceService.Cancelled)
                .Select(i => new { i.Currency, i.TotalAmount, i.PaidAmount, i.Status, i.DueDate }).ToListAsync();
            var currencies = invoices.GroupBy(i => i.Currency).Select(g => new
            {
                currency = g.Key,
                invoiced = g.Sum(i => i.TotalAmount),
                paid = g.Sum(i => i.PaidAmount),
                outstanding = g.Sum(i => i.TotalAmount - i.PaidAmount),
                overdueInvoices = g.Count(i => i.Status == InvoiceService.Issued && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today),
            }).OrderBy(x => x.currency).ToList();
            return Ok(new { currencies, invoiceCount = invoices.Count });
        }

        // GET api/organization/billing/invoices?search=&status=Issued|PartiallyPaid|Overdue|Paid|Cancelled&page=1&pageSize=10
        [HttpGet("invoices")]
        public async Task<IActionResult> Invoices(string? search, string? status, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var today = Money.Today;

            var query = Mine();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(i => i.InvoiceNumber != null && i.InvoiceNumber.Contains(term));
            }
            query = status switch
            {
                "Paid" or "Cancelled" => query.Where(i => i.Status == status),
                "Overdue" => query.Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today),
                "PartiallyPaid" => query.Where(i => i.Status == "Issued" && i.PaidAmount > 0 && i.PaidAmount < i.TotalAmount && (i.DueDate == null || i.DueDate >= today)),
                "Issued" => query.Where(i => i.Status == "Issued" && i.PaidAmount == 0 && (i.DueDate == null || i.DueDate >= today)),
                _ => query,
            };

            var total = await query.CountAsync();
            var rows = await query.OrderByDescending(i => i.InvoiceId).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(i => new { i.InvoiceId, i.InvoiceNumber, i.Currency, i.PeriodStart, i.PeriodEnd, i.TotalAmount, i.PaidAmount, i.Status, i.IssueDate, i.DueDate })
                .ToListAsync();
            var items = rows.Select(i => new
            {
                invoiceId = i.InvoiceId, invoiceNumber = i.InvoiceNumber, currency = i.Currency, periodStart = i.PeriodStart, periodEnd = i.PeriodEnd,
                totalAmount = i.TotalAmount, paidAmount = i.PaidAmount,
                balance = i.Status == InvoiceService.Cancelled ? 0 : i.TotalAmount - i.PaidAmount,
                status = i.Status,
                displayStatus = InvoiceService.DisplayStatus(i.Status, i.TotalAmount, i.PaidAmount, i.DueDate, today),
                issueDate = i.IssueDate, dueDate = i.DueDate,
            }).ToList();
            return Ok(new { items, total, page, pageSize });
        }

        // GET api/organization/billing/invoices/5
        [HttpGet("invoices/{invoiceId:int}")]
        public async Task<IActionResult> Invoice(int invoiceId)
        {
            var invoice = await Mine().FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFound(new { message = "Invoice not found." });

            var today = Money.Today;
            var contractNumber = invoice.ContractId == null ? null : await _db.Contracts.AsNoTracking().Where(c => c.ContractId == invoice.ContractId).Select(c => c.ContractNumber).FirstOrDefaultAsync();
            var lines = await _db.InvoiceLines.AsNoTracking().Where(l => l.InvoiceId == invoiceId).OrderBy(l => l.LineId).ToListAsync();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => p.InvoiceId == invoiceId).OrderByDescending(p => p.PaidAt).ToListAsync();

            return Ok(new
            {
                invoiceId = invoice.InvoiceId,
                invoiceNumber = invoice.InvoiceNumber,
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
                lines = lines.Select(l => new { l.LineId, l.LineType, l.Description, l.Quantity, l.UnitRate, l.Amount }),
                payments = payments.Select(p => new { p.PaymentId, p.Amount, p.Currency, p.PaidAt, p.Method, p.Reference }),
            });
        }
    }
}
