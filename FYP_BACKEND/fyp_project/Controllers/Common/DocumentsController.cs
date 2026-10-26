using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Controllers.OrganizationPortal;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Common
{
    /// <summary>
    /// The printable documents of every portal: invoice, payment receipt, statement of account, payslip, payroll sheet and profit statement.
    /// One place builds them (DocumentService), so the admin, the organization manager, the organization, the employee and the owner always see the
    /// same document. Each caller gets only their own: an organization its own invoices (never a draft), a manager the invoices of the organizations
    /// they manage, an employee their own approved payslips, the owners the profit statement, the admin everything.
    /// </summary>
    [ApiController]
    [Authorize]
    [MissingMigrationFilter]
    [Route("api/documents")]
    public class DocumentsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly DocumentService _documents;
        private readonly string _root;

        public DocumentsController(WorkforceManagementDbContext db, DocumentService documents, IWebHostEnvironment environment)
        {
            _db = db;
            _documents = documents;
            _root = Path.Combine(environment.ContentRootPath, "uploads");
        }

        private string Role => User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role || c.Type == "role")?.Value ?? string.Empty;
        private bool Is(string role) => string.Equals(Role, role, StringComparison.OrdinalIgnoreCase);
        private int UserId => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;
        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private async Task<List<int>> ManagedOrgsAsync() =>
            await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == UserId && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();

        /// <summary>Whether this caller may see this organization's money documents.</summary>
        private async Task<bool> CanSeeOrganizationAsync(int orgId, bool draft)
        {
            if (Is("Admin")) return true;
            // A draft is seen by the admin and by the organization manager who prepares it, never by the organization.
            if (draft && !Is("Organization Manager")) return false;
            if (Is("Organization")) return OrgId == orgId;
            if (Is("Organization Manager")) return (await ManagedOrgsAsync()).Contains(orgId);
            return false;
        }

        private IActionResult NotFoundDocument() => NotFound(new { message = "Document not found." });

        // GET api/documents/invoice/5
        [HttpGet("invoice/{invoiceId:int}")]
        public async Task<IActionResult> Invoice(int invoiceId)
        {
            var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            // A draft is still being prepared: only the admin and the organization manager of that organization see it.
            if (invoice == null || !await CanSeeOrganizationAsync(invoice.OrgId, invoice.Status == InvoiceService.Draft)) return NotFoundDocument();
            return Ok(await _documents.InvoiceAsync(invoice));
        }

        // GET api/documents/receipt/12
        [HttpGet("receipt/{paymentId:int}")]
        public async Task<IActionResult> Receipt(int paymentId)
        {
            var payment = await _db.InvoicePayments.AsNoTracking().FirstOrDefaultAsync(p => p.PaymentId == paymentId);
            var invoice = payment == null ? null : await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == payment.InvoiceId);
            if (payment == null || invoice == null || !await CanSeeOrganizationAsync(invoice.OrgId, invoice.Status == InvoiceService.Draft)) return NotFoundDocument();
            return Ok(await _documents.ReceiptAsync(payment, invoice));
        }

        // GET api/documents/statement?orgId=5&from=2026-07-01&to=2026-10-17
        [HttpGet("statement")]
        public async Task<IActionResult> Statement(int? orgId, DateOnly? from, DateOnly? to)
        {
            var id = Is("Organization") ? OrgId : orgId ?? 0;
            if (id == 0 || !await CanSeeOrganizationAsync(id, false)) return NotFoundDocument();

            var end = to ?? Money.Today;
            var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-3);
            if (start > end) return BadRequest(new { message = "The start date cannot be after the end date.", errors = new Dictionary<string, string[]> { ["from"] = new[] { "The start date cannot be after the end date." } } });
            if (end.DayNumber - start.DayNumber > 731) return BadRequest(new { message = "Choose a period of at most 24 months.", errors = new Dictionary<string, string[]> { ["to"] = new[] { "Choose a period of at most 24 months." } } });
            return Ok(await _documents.StatementAsync(id, start, end));
        }

        // GET api/documents/payout/12   (the receipt of a business owner's profit share: that owner, and the admin)
        [HttpGet("payout/{payoutId:int}")]
        public async Task<IActionResult> Payout(int payoutId)
        {
            var payout = await _db.OwnerPayouts.AsNoTracking().FirstOrDefaultAsync(p => p.PayoutId == payoutId);
            if (payout == null) return NotFoundDocument();
            var allowed = Is("Admin") || (Is("Business Owner") && payout.OwnerUserId == UserId);
            return allowed ? Ok(await _documents.PayoutAsync(payout)) : NotFoundDocument();
        }

        // GET api/documents/proof/5   (the file an organization attached to a payment notice: the organization, its manager and the admin only)
        [HttpGet("proof/{submissionId:int}")]
        public async Task<IActionResult> Proof(int submissionId)
        {
            var s = await _db.PaymentSubmissions.AsNoTracking().FirstOrDefaultAsync(x => x.SubmissionId == submissionId);
            if (s?.ProofPath == null || !await CanSeeOrganizationAsync(s.OrgId, false)) return NotFoundDocument();
            var full = Path.GetFullPath(Path.Combine(_root, s.ProofPath));
            if (!full.StartsWith(Path.GetFullPath(_root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(full)) return NotFoundDocument();
            var type = Path.GetExtension(full).ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", ".pdf" => "application/pdf", _ => "image/jpeg" };
            return PhysicalFile(full, type);
        }

    }

    /// <summary>Public check of a document (the QR on it opens this): says whether the number and code are genuine, without showing anything private.</summary>
    [ApiController]
    [AllowAnonymous]
    [MissingMigrationFilter]
    [Route("api/verify")]
    public class VerifyController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly DocumentService _documents;

        public VerifyController(WorkforceManagementDbContext db, DocumentService documents)
        {
            _db = db;
            _documents = documents;
        }

        // GET api/verify/invoice/INV-2026-0003?c=ABCDEF1234
        [HttpGet("{kind}/{number}")]
        public async Task<IActionResult> Check(string kind, string number, [FromQuery(Name = "c")] string? code)
        {
            code = (code ?? string.Empty).Trim().ToUpperInvariant();
            object? answer = null;
            string? expected = null;

            if (kind == DocumentCodes.Invoice)
            {
                var invoice = await _db.Invoices.AsNoTracking().Include(i => i.Org).FirstOrDefaultAsync(i => i.InvoiceNumber == number && i.Status != InvoiceService.Draft);
                if (invoice != null)
                {
                    expected = _documents.CodeFor(kind, invoice.InvoiceId, invoice.TotalAmount);
                    answer = new { number, kind, organization = invoice.Org?.OrgName, amount = invoice.TotalAmount, currency = invoice.Currency, date = invoice.IssueDate, status = invoice.Status == InvoiceService.Cancelled ? "Cancelled" : invoice.Status };
                }
            }
            else if (kind == DocumentCodes.Receipt && number.StartsWith("RCP-") && int.TryParse(number.Split('-').Last(), out var paymentId))
            {
                var payment = await _db.InvoicePayments.AsNoTracking().FirstOrDefaultAsync(p => p.PaymentId == paymentId);
                var invoice = payment == null ? null : await _db.Invoices.AsNoTracking().Include(i => i.Org).FirstOrDefaultAsync(i => i.InvoiceId == payment.InvoiceId);
                if (payment != null && invoice != null && DocumentCodes.ReceiptNumber(payment) == number)
                {
                    expected = _documents.CodeFor(kind, payment.PaymentId, payment.Amount);
                    answer = new { number, kind, organization = invoice.Org?.OrgName, amount = payment.Amount, currency = payment.Currency, date = DateOnly.FromDateTime(payment.PaidAt), status = "Received" };
                }
            }
            else if (kind == DocumentCodes.Payout && number.StartsWith("PYT-") && int.TryParse(number.Split('-').Last(), out var payoutId))
            {
                // A profit share is private: only the fact that it is genuine, and its month, are shown (no name, no amount).
                var payout = await _db.OwnerPayouts.AsNoTracking().Include(p => p.Settlement).FirstOrDefaultAsync(p => p.PayoutId == payoutId);
                if (payout?.Settlement != null && DocumentCodes.PayoutNumber(payout.Settlement.PeriodYear, payout.Settlement.PeriodMonth, payout.PayoutId) == number)
                {
                    expected = _documents.CodeFor(kind, payout.PayoutId, payout.AmountPkr);
                    answer = new { number, kind, period = CompanyLedgerService.MonthLabel(payout.Settlement.PeriodYear, payout.Settlement.PeriodMonth), status = "Sent" };
                }
            }

            var valid = answer != null && expected != null && code.Length > 0 && string.Equals(code, expected, StringComparison.OrdinalIgnoreCase);
            return Ok(new { valid, document = valid ? answer : null });
        }
    }
}
