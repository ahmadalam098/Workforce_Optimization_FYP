using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public record WorkflowResult(bool Ok, int Status, string Message, string? Field = null, object? Data = null);
    public record CreatedInvoice(int InvoiceId, string? InvoiceNumber);

    /// <summary>
    /// The life of an invoice (since migration 023):
    ///   1. The ORGANIZATION MANAGER creates a Draft from the contract rates and the allocated hours, can recalculate it, add or remove adjustment
    ///      lines (a discount, a minimum guarantee ...), and then SENDS it to the admin (SubmittedAt).
    ///   2. The ADMIN verifies it (and thereby issues it: Draft -> Issued, VerifiedAt / VerifiedBy = the admin, the due date comes from the
    ///      INVOICE_DUE_DAYS payment rule) - or sends it back to the manager with a reason (ReturnedReason), or cancels it.
    ///   3. The organization sees and pays an Issued invoice (online with Safepay).
    /// A draft can be edited only by the manager and only until it is sent to the admin.
    /// </summary>
    public class InvoiceWorkflowService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly InvoiceService _invoices;
        private readonly PaymentRuleService _rules;
        private readonly AuditService _audit;

        public InvoiceWorkflowService(WorkforceManagementDbContext db, InvoiceService invoices, PaymentRuleService rules, AuditService audit)
        {
            _db = db;
            _invoices = invoices;
            _rules = rules;
            _audit = audit;
        }

        public static bool IsEditable(Invoice invoice) => invoice.Status == InvoiceService.Draft && invoice.SubmittedAt == null;
        public static bool IsWaitingForAdmin(Invoice invoice) => invoice.Status == InvoiceService.Draft && invoice.SubmittedAt != null;

        /// <summary>What the screens show for a draft: "Draft" (the manager is preparing it) or "PendingVerification" (waiting for the admin).</summary>
        public static string StageOf(Invoice invoice) => IsWaitingForAdmin(invoice) ? "PendingVerification" : invoice.Status;

        private async Task RecomputeTotalAsync(Invoice invoice)
        {
            invoice.TotalAmount = await _db.InvoiceLines.Where(l => l.InvoiceId == invoice.InvoiceId).SumAsync(l => l.Amount);
            await _db.SaveChangesAsync();
        }

        // ---------------------------------------------------------------- the manager

        public async Task<WorkflowResult> CreateAsync(int orgId, DateOnly start, DateOnly end, string? notes, int? userId)
        {
            var (preview, error) = await _invoices.BuildPreviewAsync(orgId, start, end);
            if (preview == null) return new WorkflowResult(false, 400, error!, "orgId");

            var overlapping = await _db.Invoices.AsNoTracking()
                .Where(i => i.OrgId == orgId && i.Status != InvoiceService.Cancelled && i.PeriodStart <= end && i.PeriodEnd >= start)
                .Select(i => i.InvoiceNumber ?? ("#" + i.InvoiceId))
                .FirstOrDefaultAsync();
            if (overlapping != null)
                return new WorkflowResult(false, 409, $"Invoice {overlapping} already covers part of this period. Cancel it first or choose another period.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var invoice = new Invoice
            {
                OrgId = orgId,
                ContractId = preview.ContractId,
                PeriodStart = start,
                PeriodEnd = end,
                Currency = preview.Currency,
                TotalAmount = preview.Total,
                Status = InvoiceService.Draft,
                Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
                CreatedBy = userId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Invoices.Add(invoice);
            await _db.SaveChangesAsync();

            invoice.InvoiceNumber = $"INV-{DateTime.UtcNow.Year}-{invoice.InvoiceId:0000}";
            foreach (var line in preview.Lines)
                _db.InvoiceLines.Add(new InvoiceLine { InvoiceId = invoice.InvoiceId, LineType = line.LineType, Description = line.Description, Quantity = line.Quantity, UnitRate = line.UnitRate, Amount = line.Amount });
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            await _audit.LogAsync(userId, "INVOICE_CREATED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber} for {preview.OrgName}: {preview.Total:0.00} {preview.Currency} (draft, prepared by the organization manager)");
            return new WorkflowResult(true, 200, "Draft invoice created. Check it, then send it to the admin for verification.", Data: new CreatedInvoice(invoice.InvoiceId, invoice.InvoiceNumber));
        }

        public async Task<WorkflowResult> RecalculateAsync(Invoice invoice, int? userId)
        {
            if (!IsEditable(invoice)) return new WorkflowResult(false, 409, "Only a draft that has not been sent to the admin can be recalculated.");
            var (preview, error) = await _invoices.BuildPreviewAsync(invoice.OrgId, invoice.PeriodStart, invoice.PeriodEnd);
            if (preview == null) return new WorkflowResult(false, 409, error!);

            _db.InvoiceLines.RemoveRange(await _db.InvoiceLines.Where(l => l.InvoiceId == invoice.InvoiceId && l.LineType != "Adjustment").ToListAsync());
            foreach (var line in preview.Lines)
                _db.InvoiceLines.Add(new InvoiceLine { InvoiceId = invoice.InvoiceId, LineType = line.LineType, Description = line.Description, Quantity = line.Quantity, UnitRate = line.UnitRate, Amount = line.Amount });
            await _db.SaveChangesAsync();

            invoice.Currency = preview.Currency;
            invoice.ContractId = preview.ContractId;
            await RecomputeTotalAsync(invoice);
            await _audit.LogAsync(userId, "INVOICE_RECALCULATED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: {invoice.TotalAmount:0.00} {invoice.Currency}");
            return new WorkflowResult(true, 200, "Invoice recalculated from the latest allocations.");
        }

        public async Task<WorkflowResult> AddAdjustmentAsync(Invoice invoice, string description, decimal quantity, decimal unitRate, int? userId)
        {
            if (!IsEditable(invoice)) return new WorkflowResult(false, 409, "Lines can only be changed while the invoice is a draft that has not been sent to the admin.");
            _db.InvoiceLines.Add(new InvoiceLine { InvoiceId = invoice.InvoiceId, LineType = "Adjustment", Description = description.Trim(), Quantity = quantity, UnitRate = unitRate, Amount = Money.Round(quantity * unitRate) });
            await _db.SaveChangesAsync();
            await RecomputeTotalAsync(invoice);
            await _audit.LogAsync(userId, "INVOICE_LINE_ADDED", "Invoice", invoice.InvoiceId, description.Trim());
            return new WorkflowResult(true, 200, "Line added.");
        }

        public async Task<WorkflowResult> RemoveAdjustmentAsync(Invoice invoice, int lineId, int? userId)
        {
            if (!IsEditable(invoice)) return new WorkflowResult(false, 409, "Lines can only be changed while the invoice is a draft that has not been sent to the admin.");
            var line = await _db.InvoiceLines.FirstOrDefaultAsync(l => l.LineId == lineId && l.InvoiceId == invoice.InvoiceId);
            if (line == null) return new WorkflowResult(false, 404, "Line not found.");
            if (line.LineType != "Adjustment") return new WorkflowResult(false, 409, "Only adjustment lines can be removed. Use recalculate to rebuild the other lines.");
            _db.InvoiceLines.Remove(line);
            await _db.SaveChangesAsync();
            await RecomputeTotalAsync(invoice);
            await _audit.LogAsync(userId, "INVOICE_LINE_REMOVED", "Invoice", invoice.InvoiceId, line.Description);
            return new WorkflowResult(true, 200, "Line removed.");
        }

        /// <summary>The manager sends the finished draft to the admin.</summary>
        public async Task<WorkflowResult> SubmitAsync(Invoice invoice, int? userId)
        {
            if (invoice.Status != InvoiceService.Draft) return new WorkflowResult(false, 409, "Only a draft can be sent to the admin.");
            if (invoice.SubmittedAt != null) return new WorkflowResult(false, 409, "This invoice is already with the admin.");
            if (invoice.TotalAmount <= 0) return new WorkflowResult(false, 409, "The invoice total must be above zero before it can be sent.");

            invoice.SubmittedAt = DateTime.UtcNow;
            invoice.SubmittedBy = userId;
            invoice.ReturnedReason = null;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(userId, "INVOICE_SUBMITTED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: {invoice.TotalAmount:0.00} {invoice.Currency} sent to the admin for verification");
            return new WorkflowResult(true, 200, "Sent to the admin for verification.");
        }

        /// <summary>The manager throws away a draft that was never sent (it is cancelled, with a reason, and keeps its number).</summary>
        public async Task<WorkflowResult> DiscardAsync(Invoice invoice, string reason, int? userId)
        {
            if (!IsEditable(invoice)) return new WorkflowResult(false, 409, "Only a draft that has not been sent to the admin can be discarded.");
            invoice.Status = InvoiceService.Cancelled;
            invoice.CancelReason = reason.Trim();
            await _db.SaveChangesAsync();
            await _audit.LogAsync(userId, "INVOICE_CANCELLED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: draft discarded by the organization manager - {invoice.CancelReason}");
            return new WorkflowResult(true, 200, "Draft discarded.");
        }

        // ---------------------------------------------------------------- the admin

        /// <summary>The admin checks the invoice the manager sent and verifies it: it is issued to the organization.</summary>
        public async Task<WorkflowResult> VerifyAndIssueAsync(Invoice invoice, int? adminUserId)
        {
            if (invoice.Status != InvoiceService.Draft) return new WorkflowResult(false, 409, "Only an invoice sent by the organization manager can be verified.");
            if (invoice.SubmittedAt == null) return new WorkflowResult(false, 409, "The organization manager has not sent this invoice yet.");
            if (invoice.TotalAmount <= 0) return new WorkflowResult(false, 409, "The invoice total must be above zero before it can be issued.");

            var dueDays = (int)await _rules.GetAsync(PaymentRuleService.InvoiceDueDays, 15);
            invoice.Status = InvoiceService.Issued;
            invoice.IssueDate = Money.Today;
            invoice.DueDate = Money.Today.AddDays(Math.Max(0, dueDays));
            invoice.VerifiedAt = DateTime.UtcNow;
            invoice.VerifiedBy = adminUserId;
            invoice.ReturnedReason = null;
            await _db.SaveChangesAsync();

            // INVOICE_ISSUED is what the organization's and the manager's bells and emails already listen to.
            await _audit.LogAsync(adminUserId, "INVOICE_ISSUED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: {invoice.TotalAmount:0.00} {invoice.Currency}, verified by the admin, due {invoice.DueDate:yyyy-MM-dd}");
            return new WorkflowResult(true, 200, $"Invoice verified and issued. Due on {invoice.DueDate:yyyy-MM-dd}.", Data: new { dueDate = invoice.DueDate });
        }

        /// <summary>The admin is not satisfied: the draft goes back to the manager with the reason.</summary>
        public async Task<WorkflowResult> ReturnAsync(Invoice invoice, string reason, int? adminUserId)
        {
            if (!IsWaitingForAdmin(invoice)) return new WorkflowResult(false, 409, "Only an invoice that is waiting for verification can be sent back.");
            invoice.SubmittedAt = null;
            invoice.SubmittedBy = null;
            invoice.ReturnedReason = reason.Trim();
            await _db.SaveChangesAsync();
            await _audit.LogAsync(adminUserId, "INVOICE_RETURNED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: sent back to the organization manager - {invoice.ReturnedReason}");
            return new WorkflowResult(true, 200, "Sent back to the organization manager.");
        }
    }
}
