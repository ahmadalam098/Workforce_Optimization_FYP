using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// Payment submissions: an organization says "we paid this invoice" (with the reference and a proof file); the organization manager checks it
    /// (verify or reject) and the admin approves it - only then the payment is really recorded and the receipt exists. Everyone sees the same rows.
    /// </summary>
    public class PaymentSubmissionService
    {
        public static readonly string[] Methods = { "Bank transfer", "Cash", "Cheque", "Online payment", "Other" };
        public const long MaxProofBytes = 5 * 1024 * 1024;

        private readonly WorkforceManagementDbContext _db;
        private readonly PaymentService _payments;
        private readonly AuditService _audit;

        public PaymentSubmissionService(WorkforceManagementDbContext db, PaymentService payments, AuditService audit)
        {
            _db = db;
            _payments = payments;
            _audit = audit;
        }

        /// <summary>Submissions as the portals show them (invoice and organization names, who decided, the receipt once approved).</summary>
        public async Task<List<object>> RowsAsync(IQueryable<PaymentSubmission> query, int take = 200)
        {
            var rows = await query.OrderByDescending(s => s.SubmissionId).Take(take).ToListAsync();
            var invoiceIds = rows.Select(r => r.InvoiceId).Distinct().ToList();
            var orgIds = rows.Select(r => r.OrgId).Distinct().ToList();
            var userIds = rows.SelectMany(r => new[] { r.VerifiedBy, r.DecidedBy }).Where(i => i != null).Select(i => i!.Value).Distinct().ToList();
            var paymentIds = rows.Where(r => r.PaymentId != null).Select(r => r.PaymentId!.Value).ToList();

            var invoices = await _db.Invoices.AsNoTracking().Where(i => invoiceIds.Contains(i.InvoiceId)).ToDictionaryAsync(i => i.InvoiceId);
            var orgs = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);
            var users = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => paymentIds.Contains(p.PaymentId)).ToDictionaryAsync(p => p.PaymentId);

            return rows.Select(r => (object)new
            {
                submissionId = r.SubmissionId,
                invoiceId = r.InvoiceId,
                invoiceNumber = invoices.GetValueOrDefault(r.InvoiceId)?.InvoiceNumber,
                invoiceBalance = invoices.TryGetValue(r.InvoiceId, out var inv) ? inv.TotalAmount - inv.PaidAmount : (decimal?)null,
                orgId = r.OrgId,
                orgName = orgs.GetValueOrDefault(r.OrgId),
                amount = r.Amount,
                currency = r.Currency,
                method = r.Method,
                reference = r.Reference,
                paidOn = r.PaidOn,
                note = r.Note,
                hasProof = r.ProofPath != null,
                proofName = r.ProofName,
                status = r.Status,
                submittedAt = r.SubmittedAt,
                verifiedBy = r.VerifiedBy == null ? null : users.GetValueOrDefault(r.VerifiedBy.Value),
                verifiedAt = r.VerifiedAt,
                decidedBy = r.DecidedBy == null ? null : users.GetValueOrDefault(r.DecidedBy.Value),
                decidedAt = r.DecidedAt,
                decisionNote = r.DecisionNote,
                paymentId = r.PaymentId,
                receiptNumber = r.PaymentId != null && payments.TryGetValue(r.PaymentId.Value, out var pay) ? DocumentCodes.ReceiptNumber(pay) : null,
            }).ToList();
        }

        /// <summary>
        /// What an organization may still pay for an invoice: the balance minus the submissions that are still waiting. countOnline = false leaves out
        /// unfinished online checkouts (a new online attempt replaces them, so the organization can always pay the whole balance online).
        /// </summary>
        public async Task<decimal> PayableAsync(Invoice invoice, bool countOnline = true)
        {
            var open = await _db.PaymentSubmissions.Where(s => s.InvoiceId == invoice.InvoiceId && (s.Status == PaymentSubmission.Pending || s.Status == PaymentSubmission.Verified)).SumAsync(s => (decimal?)s.Amount) ?? 0m;
            // Checkouts that are still open at the payment gateway also reserve their amount.
            var limit = DateTime.UtcNow - OnlinePaymentService.CheckoutLifetime;
            var online = !countOnline ? 0m : await _db.OnlinePayments.Where(o => o.InvoiceId == invoice.InvoiceId && o.Status == OnlinePayment.Created && o.CreatedAt >= limit).SumAsync(o => (decimal?)o.Amount) ?? 0m;
            return Math.Max(0, invoice.TotalAmount - invoice.PaidAmount - open - online);
        }

        // ---------------------------------------------------------------- the manager

        public async Task<(int Status, string Message)> VerifyAsync(int submissionId, int managerUserId)
        {
            var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == managerUserId && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            var s = await _db.PaymentSubmissions.FirstOrDefaultAsync(x => x.SubmissionId == submissionId && orgIds.Contains(x.OrgId));
            if (s == null) return (404, "Payment not found.");
            if (s.Status != PaymentSubmission.Pending) return (409, $"This payment is already {s.Status.ToLower()}.");
            s.Status = PaymentSubmission.Verified;
            s.VerifiedBy = managerUserId;
            s.VerifiedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(managerUserId, "PAYMENT_SUBMISSION_VERIFIED", "Invoice", s.InvoiceId, $"The organization manager verified a payment of {s.Amount:0.00} {s.Currency} ({s.Method}). The admin will approve it.");
            return (200, "Payment verified. The admin will approve it.");
        }

        public async Task<(int Status, string Message)> RejectAsync(int submissionId, int userId, bool asAdmin, string reason)
        {
            var query = _db.PaymentSubmissions.AsQueryable();
            if (!asAdmin)
            {
                var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == userId && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
                query = query.Where(x => orgIds.Contains(x.OrgId));
            }
            var s = await query.FirstOrDefaultAsync(x => x.SubmissionId == submissionId);
            if (s == null) return (404, "Payment not found.");
            if (!s.IsOpen) return (409, $"This payment is already {s.Status.ToLower()}.");
            s.Status = PaymentSubmission.Rejected;
            s.DecidedBy = userId;
            s.DecidedAt = DateTime.UtcNow;
            s.DecisionNote = reason.Length > 255 ? reason[..255] : reason;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(userId, "PAYMENT_SUBMISSION_REJECTED", "Invoice", s.InvoiceId, $"The payment of {s.Amount:0.00} {s.Currency} was not accepted: {s.DecisionNote}");
            return (200, "Payment rejected. The organization is told your reason.");
        }

        // ---------------------------------------------------------------- the admin

        /// <summary>The admin approves: the payment is recorded on the invoice (so the receipt exists) and the submission is closed.</summary>
        public async Task<(int Status, string Message, string? Field, InvoicePayment? Payment)> ApproveAsync(int submissionId, int adminUserId, decimal? exchangeRate, string? note)
        {
            var s = await _db.PaymentSubmissions.FirstOrDefaultAsync(x => x.SubmissionId == submissionId);
            if (s == null) return (404, "Payment not found.", null, null);
            if (!s.IsOpen) return (409, $"This payment is already {s.Status.ToLower()}.", null, null);

            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == s.InvoiceId);
            if (invoice == null) return (404, "Invoice not found.", null, null);

            var paidAt = s.PaidOn.ToDateTime(new TimeOnly(12, 0));
            var result = await _payments.RecordAsync(invoice, s.Amount, paidAt, s.Method, s.Reference, s.Note, exchangeRate, adminUserId, s.VerifiedBy, s.VerifiedAt);
            if (!result.Ok) return (result.Field == null ? 409 : 400, result.Error!, result.Field, null);

            s.Status = PaymentSubmission.Approved;
            s.DecidedBy = adminUserId;
            s.DecidedAt = DateTime.UtcNow;
            s.DecisionNote = ContractLogic.Clean(note);
            s.PaymentId = result.Payment!.PaymentId;
            await _db.SaveChangesAsync();

            var receipt = DocumentCodes.ReceiptNumber(result.Payment);
            await _audit.LogAsync(adminUserId, "INVOICE_PAYMENT_RECORDED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: {s.Amount:0.00} {invoice.Currency} approved from the organization's payment notice, receipt {receipt}");
            await _audit.LogAsync(adminUserId, "PAYMENT_SUBMISSION_APPROVED", "Invoice", invoice.InvoiceId, $"Your payment of {s.Amount:0.00} {s.Currency} was approved. Receipt {receipt}.");
            return (200, $"Payment approved and recorded. Receipt {receipt}.", null, result.Payment);
        }
    }
}
