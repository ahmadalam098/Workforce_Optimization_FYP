using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Manager;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    public class ApprovePaymentRequest
    {
        /// <summary>Currency -> PKR rate. Needed only when no exchange rate is stored for the invoice currency.</summary>
        [Range(0.000001, 1000000)] public decimal? ExchangeRate { get; set; }
        [StringLength(255)] public string? Note { get; set; }
    }

    /// <summary>Admin portal: the payments the organizations announced (approve or reject them) and the ledger of every payment received.</summary>
    [Route("api/admin")]
    public class AdminPaymentsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly PaymentSubmissionService _submissions;

        public AdminPaymentsController(WorkforceManagementDbContext db, PaymentSubmissionService submissions)
        {
            _db = db;
            _submissions = submissions;
        }

        // ---------------------------------------------------------------- announced payments

        // GET api/admin/payment-submissions?status=Pending|Verified|Open|Approved|Rejected|Withdrawn   (Open = Pending + Verified, the default)
        [HttpGet("payment-submissions")]
        public async Task<IActionResult> Submissions(string? status)
        {
            var query = _db.PaymentSubmissions.AsNoTracking().AsQueryable();
            if (string.IsNullOrWhiteSpace(status) || status == "Open") query = query.Where(s => s.Status == PaymentSubmission.Pending || s.Status == PaymentSubmission.Verified);
            else if (status != "all") query = query.Where(s => s.Status == status);
            return Ok(await _submissions.RowsAsync(query));
        }

        // GET api/admin/payment-submissions/pending-count
        [HttpGet("payment-submissions/pending-count")]
        public async Task<IActionResult> PendingCount() =>
            Ok(new { count = await _db.PaymentSubmissions.CountAsync(s => s.Status == PaymentSubmission.Pending || s.Status == PaymentSubmission.Verified), toApprove = await _db.PaymentSubmissions.CountAsync(s => s.Status == PaymentSubmission.Verified) });

        // POST api/admin/payment-submissions/5/approve   { exchangeRate?, note? }
        [HttpPost("payment-submissions/{submissionId:int}/approve")]
        public async Task<IActionResult> Approve(int submissionId, [FromBody] ApprovePaymentRequest? request)
        {
            var (status, message, field, payment) = await _submissions.ApproveAsync(submissionId, CurrentUserId ?? 0, request?.ExchangeRate, request?.Note);
            if (payment != null) return Ok(new { message, paymentId = payment.PaymentId, receiptNumber = DocumentCodes.ReceiptNumber(payment) });
            return field != null ? FieldError(field, message) : StatusCode(status, new { message });
        }

        // POST api/admin/payment-submissions/5/reject   { reason }
        [HttpPost("payment-submissions/{submissionId:int}/reject")]
        public async Task<IActionResult> Reject(int submissionId, [FromBody] RejectPaymentRequest request)
        {
            var (status, message) = await _submissions.RejectAsync(submissionId, CurrentUserId ?? 0, true, request.Reason.Trim());
            return StatusCode(status, new { message });
        }

        // ---------------------------------------------------------------- the ledger

        private IQueryable<InvoicePayment> Filtered(string? search, int? organizationId, DateOnly? from, DateOnly? to, string? method, bool? verified)
        {
            var query = _db.InvoicePayments.AsNoTracking().AsQueryable();
            if (organizationId.HasValue) query = query.Where(p => _db.Invoices.Any(i => i.InvoiceId == p.InvoiceId && i.OrgId == organizationId));
            if (from.HasValue) { var f = from.Value.ToDateTime(TimeOnly.MinValue); query = query.Where(p => p.PaidAt >= f); }
            if (to.HasValue) { var t = to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue); query = query.Where(p => p.PaidAt < t); }
            if (!string.IsNullOrWhiteSpace(method)) query = query.Where(p => p.Method == method);
            if (verified.HasValue) query = verified.Value ? query.Where(p => p.VerifiedAt != null) : query.Where(p => p.VerifiedAt == null);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(p => (p.Reference != null && p.Reference.Contains(term)) ||
                    _db.Invoices.Any(i => i.InvoiceId == p.InvoiceId && ((i.InvoiceNumber != null && i.InvoiceNumber.Contains(term)) || (i.Org != null && i.Org.OrgName != null && i.Org.OrgName.Contains(term)))));
            }
            return query;
        }

        private async Task<List<object>> LedgerRowsAsync(List<InvoicePayment> payments)
        {
            var invoiceIds = payments.Select(p => p.InvoiceId).Distinct().ToList();
            var invoices = await _db.Invoices.AsNoTracking().Where(i => invoiceIds.Contains(i.InvoiceId)).Select(i => new { i.InvoiceId, i.InvoiceNumber, i.OrgId, OrgName = i.Org != null ? i.Org.OrgName : null }).ToDictionaryAsync(i => i.InvoiceId);
            var userIds = payments.SelectMany(p => new[] { p.RecordedBy, p.VerifiedBy }).Where(i => i != null).Select(i => i!.Value).Distinct().ToList();
            var users = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);
            return payments.Select(p => (object)new
            {
                paymentId = p.PaymentId,
                receiptNumber = DocumentCodes.ReceiptNumber(p),
                invoiceId = p.InvoiceId,
                invoiceNumber = invoices.GetValueOrDefault(p.InvoiceId)?.InvoiceNumber,
                orgId = invoices.GetValueOrDefault(p.InvoiceId)?.OrgId,
                orgName = invoices.GetValueOrDefault(p.InvoiceId)?.OrgName,
                amount = p.Amount,
                currency = p.Currency,
                exchangeRate = p.ExchangeRate,
                amountPkr = p.AmountPkr,
                paidAt = p.PaidAt,
                method = p.Method,
                reference = p.Reference,
                recordedBy = p.RecordedBy == null ? null : users.GetValueOrDefault(p.RecordedBy.Value),
                verifiedAt = p.VerifiedAt,
                verifiedBy = p.VerifiedBy == null ? null : users.GetValueOrDefault(p.VerifiedBy.Value),
            }).ToList();
        }

        // GET api/admin/payments?search=&organizationId=&from=&to=&method=&verified=&page=1&pageSize=15
        [HttpGet("payments")]
        public async Task<IActionResult> Payments(string? search, int? organizationId, DateOnly? from, DateOnly? to, string? method, bool? verified, int page = 1, int pageSize = 15)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);
            var query = Filtered(search, organizationId, from, to, method, verified);
            var total = await query.CountAsync();
            var rows = await query.OrderByDescending(p => p.PaidAt).ThenByDescending(p => p.PaymentId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            // Totals of everything that matches (all pages), per currency, so the page can show them above the table.
            var totals = await query.GroupBy(p => p.Currency).Select(g => new { currency = g.Key, amount = g.Sum(p => p.Amount), amountPkr = g.Sum(p => p.AmountPkr), count = g.Count() }).ToListAsync();
            return Ok(new { items = await LedgerRowsAsync(rows), total, page, pageSize, totals });
        }

        // GET api/admin/payments/export?...   (every matching payment, up to 5000, for a CSV)
        [HttpGet("payments/export")]
        public async Task<IActionResult> Export(string? search, int? organizationId, DateOnly? from, DateOnly? to, string? method, bool? verified)
        {
            var rows = await Filtered(search, organizationId, from, to, method, verified).OrderByDescending(p => p.PaidAt).Take(5000).ToListAsync();
            return Ok(await LedgerRowsAsync(rows));
        }
    }
}
