using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: what organizations owe the company.
    /// Draft (built from contract rates and allocated hours, adjustable) -> Issued -> Paid, or Cancelled.
    /// </summary>
    [Route("api/admin/invoices")]
    public class AdminInvoicesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly InvoiceService _invoices;
        private readonly PaymentRuleService _rules;
        private readonly ExchangeRateService _rates;
        private readonly AuditService _audit;

        public AdminInvoicesController(
            WorkforceManagementDbContext db,
            InvoiceService invoices,
            PaymentRuleService rules,
            ExchangeRateService rates,
            AuditService audit)
        {
            _db = db;
            _invoices = invoices;
            _rules = rules;
            _rates = rates;
            _audit = audit;
        }

        // GET api/admin/invoices?search=&status=&organizationId=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, int? organizationId, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);
            var today = Money.Today;

            var query = _db.Invoices.AsNoTracking().AsQueryable();

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
                "Draft" or "Paid" or "Cancelled" => query.Where(i => i.Status == status),
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
                })
                .ToListAsync();

            foreach (var item in items)
            {
                item.Balance = item.Status == InvoiceService.Cancelled ? 0 : item.TotalAmount - item.PaidAmount;
                item.DisplayStatus = InvoiceService.DisplayStatus(item.Status, item.TotalAmount, item.PaidAmount, item.DueDate, today);
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
            if (invoice == null) return null;

            var today = Money.Today;
            var contractNumber = invoice.ContractId == null
                ? null
                : await _db.Contracts.AsNoTracking().Where(c => c.ContractId == invoice.ContractId).Select(c => c.ContractNumber).FirstOrDefaultAsync();

            var lines = await _db.InvoiceLines.AsNoTracking().Where(l => l.InvoiceId == invoiceId).OrderBy(l => l.LineId).ToListAsync();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => p.InvoiceId == invoiceId).OrderByDescending(p => p.PaidAt).ToListAsync();

            var userIds = payments.Where(p => p.RecordedBy.HasValue).Select(p => p.RecordedBy!.Value)
                .Concat(payments.Where(p => p.VerifiedBy.HasValue).Select(p => p.VerifiedBy!.Value))
                .Concat(invoice.VerifiedBy.HasValue ? new[] { invoice.VerifiedBy.Value } : Array.Empty<int>())
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
                DisplayStatus = InvoiceService.DisplayStatus(invoice.Status, invoice.TotalAmount, invoice.PaidAmount, invoice.DueDate, today),
                IssueDate = invoice.IssueDate,
                DueDate = invoice.DueDate,
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

        // POST api/admin/invoices/preview   (nothing is saved)
        [HttpPost("preview")]
        public async Task<IActionResult> Preview([FromBody] InvoicePreviewRequest request)
        {
            var (preview, error) = await _invoices.BuildPreviewAsync(request.OrgId, request.PeriodStart!.Value, request.PeriodEnd!.Value);
            return preview == null ? FieldError("orgId", error!) : Ok(preview);
        }

        // POST api/admin/invoices   (creates a Draft from the same calculation as the preview)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateInvoiceRequest request)
        {
            var start = request.PeriodStart!.Value;
            var end = request.PeriodEnd!.Value;

            var (preview, error) = await _invoices.BuildPreviewAsync(request.OrgId, start, end);
            if (preview == null) return FieldError("orgId", error!);

            var overlapping = await _db.Invoices
                .AsNoTracking()
                .Where(i => i.OrgId == request.OrgId && i.Status != InvoiceService.Cancelled && i.PeriodStart <= end && i.PeriodEnd >= start)
                .Select(i => i.InvoiceNumber ?? ("#" + i.InvoiceId))
                .FirstOrDefaultAsync();
            if (overlapping != null)
                return ConflictMessage($"Invoice {overlapping} already covers part of this period. Cancel it first or choose another period.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var invoice = new Invoice
            {
                OrgId = request.OrgId,
                ContractId = preview.ContractId,
                PeriodStart = start,
                PeriodEnd = end,
                Currency = preview.Currency,
                TotalAmount = preview.Total,
                Status = InvoiceService.Draft,
                Notes = ContractLogic.Clean(request.Notes),
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Invoices.Add(invoice);
            await _db.SaveChangesAsync();

            invoice.InvoiceNumber = $"INV-{DateTime.UtcNow.Year}-{invoice.InvoiceId:0000}";
            foreach (var line in preview.Lines)
                _db.InvoiceLines.Add(new InvoiceLine
                {
                    InvoiceId = invoice.InvoiceId, LineType = line.LineType, Description = line.Description,
                    Quantity = line.Quantity, UnitRate = line.UnitRate, Amount = line.Amount,
                });
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            await _audit.LogAsync(CurrentUserId, "INVOICE_CREATED", "Invoice", invoice.InvoiceId,
                $"{invoice.InvoiceNumber} for {preview.OrgName}: {preview.Total:0.00} {preview.Currency}");

            return CreatedAtAction(nameof(Get), new { invoiceId = invoice.InvoiceId },
                new { message = "Draft invoice created.", invoiceId = invoice.InvoiceId, invoiceNumber = invoice.InvoiceNumber });
        }

        // POST api/admin/invoices/5/recalculate   (Draft only: rebuilds the Base/Extra lines, keeps adjustments)
        [HttpPost("{invoiceId:int}/recalculate")]
        public async Task<IActionResult> Recalculate(int invoiceId)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            if (invoice.Status != InvoiceService.Draft) return ConflictMessage("Only draft invoices can be recalculated.");

            var (preview, error) = await _invoices.BuildPreviewAsync(invoice.OrgId, invoice.PeriodStart, invoice.PeriodEnd);
            if (preview == null) return ConflictMessage(error!);

            var generated = await _db.InvoiceLines.Where(l => l.InvoiceId == invoiceId && l.LineType != "Adjustment").ToListAsync();
            _db.InvoiceLines.RemoveRange(generated);

            foreach (var line in preview.Lines)
                _db.InvoiceLines.Add(new InvoiceLine
                {
                    InvoiceId = invoiceId, LineType = line.LineType, Description = line.Description,
                    Quantity = line.Quantity, UnitRate = line.UnitRate, Amount = line.Amount,
                });
            await _db.SaveChangesAsync();

            invoice.Currency = preview.Currency;
            invoice.ContractId = preview.ContractId;
            await RecomputeTotalAsync(invoice);

            await _audit.LogAsync(CurrentUserId, "INVOICE_RECALCULATED", "Invoice", invoiceId, $"{invoice.InvoiceNumber}: {invoice.TotalAmount:0.00} {invoice.Currency}");
            return Ok(new { message = "Invoice recalculated from the latest allocations.", invoiceId, total = invoice.TotalAmount });
        }

        // POST api/admin/invoices/5/lines   (Draft only: adds an adjustment, e.g. a minimum guarantee or a discount)
        [HttpPost("{invoiceId:int}/lines")]
        public async Task<IActionResult> AddLine(int invoiceId, [FromBody] AdjustmentLineRequest request)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            if (invoice.Status != InvoiceService.Draft) return ConflictMessage("Lines can only be changed while the invoice is a draft.");

            _db.InvoiceLines.Add(new InvoiceLine
            {
                InvoiceId = invoiceId,
                LineType = "Adjustment",
                Description = request.Description.Trim(),
                Quantity = request.Quantity,
                UnitRate = request.UnitRate,
                Amount = Money.Round(request.Quantity * request.UnitRate),
            });
            await _db.SaveChangesAsync();
            await RecomputeTotalAsync(invoice);

            await _audit.LogAsync(CurrentUserId, "INVOICE_LINE_ADDED", "Invoice", invoiceId, request.Description);
            return Ok(new { message = "Line added.", invoiceId, total = invoice.TotalAmount });
        }

        // DELETE api/admin/invoices/5/lines/3   (Draft only, adjustment lines only)
        [HttpDelete("{invoiceId:int}/lines/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int invoiceId, int lineId)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            if (invoice.Status != InvoiceService.Draft) return ConflictMessage("Lines can only be changed while the invoice is a draft.");

            var line = await _db.InvoiceLines.FirstOrDefaultAsync(l => l.LineId == lineId && l.InvoiceId == invoiceId);
            if (line == null) return NotFoundMessage("Line not found.");
            if (line.LineType != "Adjustment") return ConflictMessage("Only adjustment lines can be removed. Use recalculate to rebuild the other lines.");

            _db.InvoiceLines.Remove(line);
            await _db.SaveChangesAsync();
            await RecomputeTotalAsync(invoice);

            await _audit.LogAsync(CurrentUserId, "INVOICE_LINE_REMOVED", "Invoice", invoiceId, line.Description);
            return Ok(new { message = "Line removed.", invoiceId, total = invoice.TotalAmount });
        }

        // POST api/admin/invoices/5/issue   (Draft -> Issued; the due date comes from the INVOICE_DUE_DAYS payment rule)
        [HttpPost("{invoiceId:int}/issue")]
        public async Task<IActionResult> Issue(int invoiceId)
        {
            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            if (invoice.Status != InvoiceService.Draft) return ConflictMessage("Only draft invoices can be issued.");
            if (invoice.TotalAmount <= 0) return ConflictMessage("The invoice total must be above zero before it can be issued.");

            var dueDays = (int)await _rules.GetAsync(PaymentRuleService.InvoiceDueDays, 15);
            invoice.Status = InvoiceService.Issued;
            invoice.IssueDate = Money.Today;
            invoice.DueDate = Money.Today.AddDays(Math.Max(0, dueDays));
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "INVOICE_ISSUED", "Invoice", invoiceId,
                $"{invoice.InvoiceNumber}: {invoice.TotalAmount:0.00} {invoice.Currency}, due {invoice.DueDate:yyyy-MM-dd}");
            return Ok(new { message = $"Invoice issued. Due on {invoice.DueDate:yyyy-MM-dd}.", invoiceId, dueDate = invoice.DueDate });
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
            if (invoice.Status != InvoiceService.Issued) return ConflictMessage("Payments can only be recorded on issued invoices that are not fully paid.");

            var amount = Money.Round(request.Amount);
            var balance = invoice.TotalAmount - invoice.PaidAmount;
            if (amount > balance) return FieldError("amount", $"The payment is more than the remaining balance ({balance:0.00} {invoice.Currency}).");

            var paidAt = request.PaidAt ?? DateTime.UtcNow;

            decimal? rate = invoice.Currency == ExchangeRateService.Pkr
                ? 1m
                : request.ExchangeRate ?? await _rates.GetRateAsync(invoice.Currency, ExchangeRateService.Pkr, DateOnly.FromDateTime(paidAt));
            if (rate == null)
                return FieldError("exchangeRate", $"No {invoice.Currency} to PKR exchange rate is stored. Add one under Exchange Rates, or enter the rate here.");

            _db.InvoicePayments.Add(new InvoicePayment
            {
                InvoiceId = invoiceId,
                Amount = amount,
                Currency = invoice.Currency,
                ExchangeRate = rate.Value,
                AmountPkr = Money.Round(amount * rate.Value),
                PaidAt = paidAt,
                Method = ContractLogic.Clean(request.Method),
                Reference = ContractLogic.Clean(request.Reference),
                Notes = ContractLogic.Clean(request.Notes),
                RecordedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            });

            invoice.PaidAmount += amount;
            if (invoice.PaidAmount >= invoice.TotalAmount) invoice.Status = InvoiceService.Paid;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "INVOICE_PAYMENT_RECORDED", "Invoice", invoiceId,
                $"{invoice.InvoiceNumber}: {amount:0.00} {invoice.Currency} (rate {rate.Value})");

            return Ok(new
            {
                message = invoice.Status == InvoiceService.Paid ? "Payment recorded. The invoice is now fully paid." : "Payment recorded.",
                invoiceId,
                status = invoice.Status,
                balance = invoice.TotalAmount - invoice.PaidAmount,
            });
        }

        private async Task RecomputeTotalAsync(Invoice invoice)
        {
            invoice.TotalAmount = await _db.InvoiceLines.Where(l => l.InvoiceId == invoice.InvoiceId).SumAsync(l => l.Amount);
            await _db.SaveChangesAsync();
        }
    }
}
