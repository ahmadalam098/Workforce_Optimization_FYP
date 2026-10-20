using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    public class SubmitPaymentForm
    {
        [Range(1, int.MaxValue, ErrorMessage = "Choose the invoice you paid.")] public int InvoiceId { get; set; }
        [Range(0.01, 1000000000, ErrorMessage = "Enter the amount you paid.")] public decimal Amount { get; set; }
        [Required(ErrorMessage = "Choose how you paid.")] public string Method { get; set; } = string.Empty;
        [StringLength(100)] public string? Reference { get; set; }
        public DateOnly? PaidOn { get; set; }
        [StringLength(255)] public string? Note { get; set; }
        public IFormFile? File { get; set; }
    }

    /// <summary>
    /// Organization portal: "we paid" - tell the company about a payment (amount, how, reference, proof). Your manager verifies it, the admin approves it,
    /// and then the payment is on your invoice with its receipt. You can withdraw a notice while nobody has decided on it.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/payments")]
    public class OrganizationPaymentsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly PaymentSubmissionService _submissions;
        private readonly AuditService _audit;
        private readonly string _root;

        public OrganizationPaymentsController(WorkforceManagementDbContext db, PaymentSubmissionService submissions, AuditService audit, IWebHostEnvironment environment)
        {
            _db = db;
            _submissions = submissions;
            _audit = audit;
            _root = Path.Combine(environment.ContentRootPath, "uploads");
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private IActionResult FieldError(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        /// <summary>jpg, png, webp or pdf, recognised by what is inside the file (not by its name).</summary>
        private static string? Extension(byte[] bytes)
        {
            if (bytes.Length > 4 && bytes[0] == 0xFF && bytes[1] == 0xD8) return ".jpg";
            if (bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) return ".png";
            if (bytes.Length > 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 && bytes[8] == 0x57 && bytes[9] == 0x45) return ".webp";
            if (bytes.Length > 5 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46 && bytes[4] == 0x2D) return ".pdf";
            return null;
        }

        // GET api/organization/payments/payable   (the invoices that can still be paid)
        [HttpGet("payable")]
        public async Task<IActionResult> Payable()
        {
            var today = Money.Today;
            var invoices = await _db.Invoices.AsNoTracking().Where(i => i.OrgId == OrgId && i.Status == InvoiceService.Issued && i.PaidAmount < i.TotalAmount).OrderBy(i => i.DueDate).ToListAsync();
            var rows = new List<object>();
            foreach (var invoice in invoices)
            {
                var payable = await _submissions.PayableAsync(invoice);
                if (payable <= 0) continue;
                rows.Add(new { invoiceId = invoice.InvoiceId, invoiceNumber = invoice.InvoiceNumber, currency = invoice.Currency, balance = invoice.TotalAmount - invoice.PaidAmount, payable, dueDate = invoice.DueDate, overdue = invoice.DueDate != null && invoice.DueDate < today });
            }
            return Ok(rows);
        }

        // GET api/organization/payments/submissions
        [HttpGet("submissions")]
        public async Task<IActionResult> List() => Ok(await _submissions.RowsAsync(_db.PaymentSubmissions.AsNoTracking().Where(s => s.OrgId == OrgId)));

        // POST api/organization/payments/submissions   (multipart: invoiceId, amount, method, reference, paidOn, note, file)
        [HttpPost("submissions")]
        [RequestSizeLimit(PaymentSubmissionService.MaxProofBytes + 200_000)]
        public async Task<IActionResult> Submit([FromForm] SubmitPaymentForm form)
        {
            var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == form.InvoiceId && i.OrgId == OrgId);
            if (invoice == null || invoice.Status == InvoiceService.Draft) return NotFound(new { message = "Invoice not found." });
            if (invoice.Status != InvoiceService.Issued) return Conflict(new { message = "Only an issued invoice that is not fully paid can be paid." });

            if (!PaymentSubmissionService.Methods.Contains(form.Method)) return FieldError("method", "Choose one of the listed ways of paying.");
            var amount = Money.Round(form.Amount);
            var payable = await _submissions.PayableAsync(invoice);
            if (amount > payable) return FieldError("amount", payable <= 0 ? "Payments for the whole balance of this invoice are already waiting for a decision." : $"You can announce at most {payable:0.00} {invoice.Currency} for this invoice (the balance minus payments already waiting).");

            var paidOn = form.PaidOn ?? Money.Today;
            if (paidOn > Money.Today) return FieldError("paidOn", "The payment date cannot be in the future.");
            if (paidOn < invoice.IssueDate) return FieldError("paidOn", "The payment cannot be older than the invoice.");
            var reference = ContractLogic.Clean(form.Reference);
            if (form.Method != "Cash" && reference == null) return FieldError("reference", "Enter the transaction or cheque reference, so the payment can be found.");

            string? stored = null;
            string? name = null;
            if (form.File is { Length: > 0 })
            {
                if (form.File.Length > PaymentSubmissionService.MaxProofBytes) return FieldError("file", "The proof is too big. Use a file under 5 MB.");
                using var stream = new MemoryStream();
                await form.File.CopyToAsync(stream);
                var bytes = stream.ToArray();
                var extension = Extension(bytes);
                if (extension == null) return FieldError("file", "Use a JPG, PNG, WebP or PDF file.");
                Directory.CreateDirectory(Path.Combine(_root, "payment-proofs"));
                stored = $"payment-proofs/{OrgId}-{Guid.NewGuid():N}{extension}";
                await System.IO.File.WriteAllBytesAsync(Path.Combine(_root, stored), bytes);
                name = Path.GetFileName(form.File.FileName);
                if (name.Length > 150) name = name[^150..];
            }

            var submission = new PaymentSubmission
            {
                InvoiceId = invoice.InvoiceId,
                OrgId = OrgId,
                Amount = amount,
                Currency = invoice.Currency,
                Method = form.Method,
                Reference = reference,
                PaidOn = paidOn,
                Note = ContractLogic.Clean(form.Note),
                ProofPath = stored,
                ProofName = name,
                Status = PaymentSubmission.Pending,
                SubmittedAt = DateTime.UtcNow,
            };
            _db.PaymentSubmissions.Add(submission);
            await _db.SaveChangesAsync();

            // No user is behind it: the manager's and the admin's bells show it.
            var orgName = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == OrgId).Select(o => o.OrgName).FirstOrDefaultAsync();
            await _audit.LogAsync(null, "PAYMENT_SUBMITTED", "Invoice", invoice.InvoiceId, $"{orgName} says it paid {amount:0.00} {invoice.Currency} on {invoice.InvoiceNumber} ({form.Method}{(reference == null ? string.Empty : $", ref {reference}")})");
            return Ok(new { message = "Your payment notice was sent. Your manager will verify it and the admin will approve it; you will get the receipt then.", submissionId = submission.SubmissionId });
        }

        // POST api/organization/payments/submissions/5/withdraw
        [HttpPost("submissions/{submissionId:int}/withdraw")]
        public async Task<IActionResult> Withdraw(int submissionId)
        {
            var s = await _db.PaymentSubmissions.FirstOrDefaultAsync(x => x.SubmissionId == submissionId && x.OrgId == OrgId);
            if (s == null) return NotFound(new { message = "Payment notice not found." });
            if (s.Status != PaymentSubmission.Pending) return Conflict(new { message = s.Status == PaymentSubmission.Verified ? "Your manager already verified it, so it can no longer be withdrawn. Ask them to reject it if it is wrong." : $"This notice is already {s.Status.ToLower()}." });
            s.Status = PaymentSubmission.Withdrawn;
            s.DecidedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(null, "PAYMENT_SUBMISSION_WITHDRAWN", "Invoice", s.InvoiceId, "The organization withdrew its payment notice.");
            return Ok(new { message = "Payment notice withdrawn." });
        }
    }
}
