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
        private readonly CallService _scope;
        private readonly string _root;

        public DocumentsController(WorkforceManagementDbContext db, DocumentService documents, CallService scope, IWebHostEnvironment environment)
        {
            _db = db;
            _documents = documents;
            _scope = scope;
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
            if (draft) return false;
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
            // A draft is still being prepared: only the admin sees it.
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

        // GET api/documents/payslip/7
        [HttpGet("payslip/{itemId:int}")]
        public async Task<IActionResult> Payslip(int itemId)
        {
            var item = await _db.PayrollItems.AsNoTracking().FirstOrDefaultAsync(i => i.ItemId == itemId);
            var run = item == null ? null : await _db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.PayrollId == item.PayrollId);
            if (item == null || run == null) return NotFoundDocument();

            if (!Is("Admin"))
            {
                // Everybody else sees it only once the admin approved the payroll (a draft can still change).
                if (run.Status != "Approved" && run.Status != "Paid") return NotFoundDocument();
                var employee = await _db.Employees.AsNoTracking().Where(e => e.EmpId == item.EmpId).Select(e => new { e.UserId }).FirstOrDefaultAsync();
                if (employee?.UserId == null) return NotFoundDocument();
                var allowed = Is("Employee") ? employee.UserId == UserId : Is("Organization Manager") && await _scope.EmployeeInManagerScopeAsync(employee.UserId.Value, UserId);
                if (!allowed) return NotFoundDocument();
            }
            return Ok(await _documents.PayslipAsync(run, item));
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

        // GET api/documents/payroll/3   (the payroll sheet / bank sheet: admin only)
        [HttpGet("payroll/{payrollId:int}")]
        public async Task<IActionResult> Payroll(int payrollId)
        {
            if (!Is("Admin")) return NotFoundDocument();
            var run = await _db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            return run == null ? NotFoundDocument() : Ok(await _documents.PayrollSheetAsync(run));
        }

        // GET api/documents/profit?from=2026-01-01&to=2026-10-17   (owners and admin)
        [HttpGet("profit")]
        public async Task<IActionResult> Profit(DateOnly? from, DateOnly? to)
        {
            if (!Is("Admin") && !Is("Business Owner")) return NotFoundDocument();
            var end = to ?? Money.Today;
            var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-5);
            if (start > end) return BadRequest(new { message = "The start date cannot be after the end date.", errors = new Dictionary<string, string[]> { ["from"] = new[] { "The start date cannot be after the end date." } } });
            if ((end.Year - start.Year) * 12 + end.Month - start.Month >= 24) return BadRequest(new { message = "Choose a period of at most 24 months.", errors = new Dictionary<string, string[]> { ["to"] = new[] { "Choose a period of at most 24 months." } } });
            return Ok(await _documents.ProfitAsync(start, end));
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
            else if (kind == DocumentCodes.Payslip && number.StartsWith("SLP-") && int.TryParse(number.Split('-').Last(), out var itemId))
            {
                // A payslip is private: only the fact that it is genuine, and its month, are shown.
                var item = await _db.PayrollItems.AsNoTracking().FirstOrDefaultAsync(i => i.ItemId == itemId);
                var run = item == null ? null : await _db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.PayrollId == item.PayrollId);
                if (item != null && run != null && run.Status != "Draft" && DocumentCodes.PayslipNumber(run, item) == number)
                {
                    expected = _documents.CodeFor(kind, item.ItemId, item.TotalAmount);
                    answer = new { number, kind, period = $"{run.PeriodYear}-{run.PeriodMonth:D2}", status = run.Status };
                }
            }

            var valid = answer != null && expected != null && code.Length > 0 && string.Equals(code, expected, StringComparison.OrdinalIgnoreCase);
            return Ok(new { valid, document = valid ? answer : null });
        }
    }
}
