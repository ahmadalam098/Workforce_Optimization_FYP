using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: what organizations owe the company.
    /// The organization manager prepares a Draft (contract rates x allocated hours, adjustable) and sends it here; the admin verifies it, which
    /// issues it (Draft -> Issued), or sends it back to the manager with a reason, or cancels it. Issued -> Paid. The admin does not create invoices.
    /// </summary>
    [Route("api/admin/invoices")]
    public class AdminInvoicesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly InvoiceService _invoices;
        private readonly InvoiceWorkflowService _workflow;
        private readonly PaymentRuleService _rules;
        private readonly ExchangeRateService _rates;
        private readonly PaymentService _payments;
        private readonly AuditService _audit;

        public AdminInvoicesController(
            WorkforceManagementDbContext db,
            InvoiceService invoices,
            InvoiceWorkflowService workflow,
            PaymentRuleService rules,
            ExchangeRateService rates,
            PaymentService payments,
            AuditService audit)
        {
            _db = db;
            _invoices = invoices;
            _workflow = workflow;
            _rules = rules;
            _rates = rates;
            _payments = payments;
            _audit = audit;
        }

        // GET api/admin/invoices?search=&status=&organizationId=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, int? organizationId, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);
            var today = Money.Today;

            // A draft the organization manager is still preparing is not shown; the admin sees it once it is sent.
            var query = _db.Invoices.AsNoTracking().Where(i => i.Status != InvoiceService.Draft || i.SubmittedAt != null);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(i =>
                    (i.InvoiceNumber != null && i.InvoiceNumber.Contains(term)) ||
                    (i.Org != null && i.Org.OrgName != null && i.Org.OrgName.Contains(term)));
            }

            if (organizationId.HasValue) query = query.Where(i => i.OrgId == organizationId.Value);

            query = status switch
            {
                "Draft" or "PendingVerification" => query.Where(i => i.Status == "Draft"),
                "Paid" or "Cancelled" => query.Where(i => i.Status == status),
                "Overdue" => query.Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today),
                "PartiallyPaid" => query.Where(i => i.Status == "Issued" && i.PaidAmount > 0 && i.PaidAmount < i.TotalAmount && (i.DueDate == null || i.DueDate >= today)),
                "Issued" => query.Where(i => i.Status == "Issued" && i.PaidAmount == 0 && (i.DueDate == null || i.DueDate >= today)),
                _ => query,
            };

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(i => i.Status == "Draft")
                .ThenByDescending(i => i.InvoiceId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(i => new InvoiceListItemDto
                {
                    InvoiceId = i.InvoiceId,
                    InvoiceNumber = i.InvoiceNumber,
                    OrgId = i.OrgId,
                    OrgName = i.Org != null ? i.Org.OrgName : null,
                    Currency = i.Currency,
                    PeriodStart = i.PeriodStart,
                    PeriodEnd = i.PeriodEnd,
                    TotalAmount = i.TotalAmount,
                    PaidAmount = i.PaidAmount,
                    Status = i.Status,
                    IssueDate = i.IssueDate,
                    DueDate = i.DueDate,
                    SubmittedAt = i.SubmittedAt,
                })
                .ToListAsync();

            foreach (var item in items)
            {
                item.Balance = item.Status == InvoiceService.Cancelled ? 0 : item.TotalAmount - item.PaidAmount;
                item.DisplayStatus = item.Status == InvoiceService.Draft ? "PendingVerification" : InvoiceService.DisplayStatus(item.Status, item.TotalAmount, item.PaidAmount, item.DueDate, today);
            }

            return Ok(new PagedResult<InvoiceListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/invoices/5
        [HttpGet("{invoiceId:int}")]
        public async Task<IActionResult> Get(int invoiceId)
        {
            var detail = await LoadDetailAsync(invoiceId);
            return detail == null ? NotFoundMessage("Invoice not found.") : Ok(detail);
        }

        private async Task<InvoiceDetailDto?> LoadDetailAsync(int invoiceId)
        {
            var invoice = await _db.Invoices.AsNoTracking().Include(i => i.Org).FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null || (invoice.Status == InvoiceService.Draft && invoice.SubmittedAt == null)) return null;

            var today = Money.Today;
            var contractNumber = invoice.ContractId == null
                ? null
                : await _db.Contracts.AsNoTracking().Where(c => c.ContractId == invoice.ContractId).Select(c => c.ContractNumber).FirstOrDefaultAsync();

            var lines = await _db.InvoiceLines.AsNoTracking().Where(l => l.InvoiceId == invoiceId).OrderBy(l => l.LineId).ToListAsync();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => p.InvoiceId == invoiceId).OrderByDescending(p => p.PaidAt).ToListAsync();

            var userIds = payments.Where(p => p.RecordedBy.HasValue).Select(p => p.RecordedBy!.Value)
                .Concat(payments.Where(p => p.VerifiedBy.HasValue).Select(p => p.VerifiedBy!.Value))
                .Concat(invoice.VerifiedBy.HasValue ? new[] { invoice.VerifiedBy.Value } : Array.Empty<int>())
                .Concat(invoice.CreatedBy.HasValue ? new[] { invoice.CreatedBy.Value } : Array.Empty<int>())
                .Concat(invoice.SubmittedBy.HasValue ? new[] { invoice.SubmittedBy.Value } : Array.Empty<int>())
                .Distinct().ToList();
            var names = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);

            return new InvoiceDetailDto
            {
                InvoiceId = invoice.InvoiceId,
                InvoiceNumber = invoice.InvoiceNumber,
                OrgId = invoice.OrgId,
                OrgName = invoice.Org?.OrgName,
                Currency = invoice.Currency,
                PeriodStart = invoice.PeriodStart,
                PeriodEnd = invoice.PeriodEnd,
                TotalAmount = invoice.TotalAmount,
                PaidAmount = invoice.PaidAmount,
                Balance = invoice.Status == InvoiceService.Cancelled ? 0 : invoice.TotalAmount - invoice.PaidAmount,
                Status = invoice.Status,
                DisplayStatus = invoice.Status == InvoiceService.Draft ? "PendingVerification" : InvoiceService.DisplayStatus(invoice.Status, invoice.TotalAmount, invoice.PaidAmount, invoice.DueDate, today),
                IssueDate = invoice.IssueDate,
                DueDate = invoice.DueDate,
                SubmittedAt = invoice.SubmittedAt,
                PreparedBy = invoice.CreatedBy.HasValue ? names.GetValueOrDefault(invoice.CreatedBy.Value) : null,
                SubmittedBy = invoice.SubmittedBy.HasValue ? names.GetValueOrDefault(invoice.SubmittedBy.Value) : null,
                ReturnedReason = invoice.ReturnedReason,
                ContractId = invoice.ContractId,
                ContractNumber = contractNumber,
                Notes = invoice.Notes,
                CancelReason = invoice.CancelReason,
                CreatedAt = invoice.CreatedAt,
                VerifiedAt = invoice.VerifiedAt,
                VerifiedBy = invoice.VerifiedBy.HasValue ? names.GetValueOrDefault(invoice.VerifiedBy.Value) : null,
                Lines = lines.Select(l => new InvoiceLineDto
                {
                    LineId = l.LineId, LineType = l.LineType, Description = l.Description,
                    Quantity = l.Quantity, UnitRate = l.UnitRate, Amount = l.Amount,
                }).ToList(),
                Payments = payments.Select(p => new InvoicePaymentDto
                {
                    PaymentId = p.PaymentId, Amount = p.Amount, Currency = p.Currency, ExchangeRate = p.ExchangeRate,
                    AmountPkr = p.AmountPkr, PaidAt = p.PaidAt, Method = p.Method, Reference = p.Reference, Notes = p.Notes,
                    RecordedBy = p.RecordedBy.HasValue ? names.GetValueOrDefault(p.RecordedBy.Value) : null,
                    VerifiedAt = p.VerifiedAt,
                    VerifiedBy = p.VerifiedBy.HasValue ? names.GetValueOrDefault(p.VerifiedBy.Value) : null,
                }).ToList(),
            };
        }

        // POST api/admin/invoices/5/verify   (the admin verifies the invoice the manager sent: Draft -> Issued; the due date comes from the INVOICE_DUE_DAYS rule)
        [HttpPost("{invoiceId:int}/verify")]
        public async Task<IActionResult> Verify(int invoiceId)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            var result = await _workflow.VerifyAndIssueAsync(invoice, CurrentUserId);
            return result.Ok ? Ok(new { message = result.Message, invoiceId, dueDate = invoice.DueDate }) : StatusCode(result.Status, new { message = result.Message });
        }

        // POST api/admin/invoices/5/return   { reason }   (back to the organization manager)
        [HttpPost("{invoiceId:int}/return")]
        public async Task<IActionResult> Return(int invoiceId, [FromBody] ReturnInvoiceRequest request)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            var result = await _workflow.ReturnAsync(invoice, request.Reason, CurrentUserId);
            return result.Ok ? Ok(new { message = result.Message, invoiceId }) : StatusCode(result.Status, new { message = result.Message });
        }

        // POST api/admin/invoices/5/cancel   (Draft or Issued without payments; reason required)
        [HttpPost("{invoiceId:int}/cancel")]
        public async Task<IActionResult> Cancel(int invoiceId, [FromBody] CancelInvoiceRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Reason)) return FieldError("reason", "A reason is required when cancelling an invoice.");

            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");

            if (invoice.Status is InvoiceService.Cancelled or InvoiceService.Paid)
                return ConflictMessage($"A {invoice.Status.ToLowerInvariant()} invoice cannot be cancelled.");
            if (invoice.PaidAmount > 0) return ConflictMessage("This invoice already has payments and cannot be cancelled.");

            invoice.Status = InvoiceService.Cancelled;
            invoice.CancelReason = request.Reason.Trim();
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "INVOICE_CANCELLED", "Invoice", invoiceId, $"{invoice.InvoiceNumber}: {invoice.CancelReason}");
            return Ok(new { message = "Invoice cancelled.", invoiceId });
        }

        // POST api/admin/invoices/5/payments   (Issued invoices only; the payment cannot exceed the balance)
        [HttpPost("{invoiceId:int}/payments")]
        public async Task<IActionResult> RecordPayment(int invoiceId, [FromBody] RecordPaymentRequest request)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");

            var result = await _payments.RecordAsync(invoice, request.Amount, request.PaidAt, request.Method, request.Reference, request.Notes, request.ExchangeRate, CurrentUserId);
            if (!result.Ok) return result.Field == null ? ConflictMessage(result.Error!) : FieldError(result.Field, result.Error!);

            await _audit.LogAsync(CurrentUserId, "INVOICE_PAYMENT_RECORDED", "Invoice", invoiceId,
                $"{invoice.InvoiceNumber}: {result.Payment!.Amount:0.00} {invoice.Currency} (rate {result.Payment.ExchangeRate}), receipt {DocumentCodes.ReceiptNumber(result.Payment)}");

            return Ok(new
            {
                message = invoice.Status == InvoiceService.Paid ? "Payment recorded. The invoice is now fully paid." : "Payment recorded.",
                invoiceId,
                paymentId = result.Payment.PaymentId,
                receiptNumber = DocumentCodes.ReceiptNumber(result.Payment),
                status = invoice.Status,
                balance = invoice.TotalAmount - invoice.PaidAmount,
            });
        }
    }
}
