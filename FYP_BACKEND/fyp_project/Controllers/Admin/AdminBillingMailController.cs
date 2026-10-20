using System.Security.Claims;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: email a bill to the organization - the invoice, a payment reminder, a receipt, or the statement of account.</summary>
    [Route("api/admin")]
    public class AdminBillingMailController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly BillingMailService _mail;
        private readonly DocumentService _documents;

        public AdminBillingMailController(WorkforceManagementDbContext db, BillingMailService mail, DocumentService documents)
        {
            _db = db;
            _mail = mail;
            _documents = documents;
        }

        // POST api/admin/invoices/5/email
        [HttpPost("invoices/{invoiceId:int}/email")]
        public async Task<IActionResult> Invoice(int invoiceId) => await SendInvoice(invoiceId, false);

        // POST api/admin/invoices/5/reminder
        [HttpPost("invoices/{invoiceId:int}/reminder")]
        public async Task<IActionResult> Reminder(int invoiceId) => await SendInvoice(invoiceId, true);

        private async Task<IActionResult> SendInvoice(int invoiceId, bool reminder)
        {
            var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == invoiceId);
            if (invoice == null) return NotFoundMessage("Invoice not found.");
            var (ok, message) = await _mail.InvoiceAsync(invoice, CurrentUserId, reminder);
            return ok ? Ok(new { message }) : ConflictMessage(message);
        }

        // POST api/admin/payments/12/email
        [HttpPost("payments/{paymentId:int}/email")]
        public async Task<IActionResult> Receipt(int paymentId)
        {
            var payment = await _db.InvoicePayments.AsNoTracking().FirstOrDefaultAsync(p => p.PaymentId == paymentId);
            var invoice = payment == null ? null : await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == payment.InvoiceId);
            if (payment == null || invoice == null) return NotFoundMessage("Payment not found.");
            var (_, message) = await _mail.ReceiptAsync(payment, invoice, CurrentUserId);
            return Ok(new { message });
        }

        // POST api/admin/statements/email?orgId=5&from=&to=
        [HttpPost("statements/email")]
        public async Task<IActionResult> Statement(int orgId, DateOnly? from, DateOnly? to)
        {
            if (!await _db.Organizations.AnyAsync(o => o.OrgId == orgId)) return NotFoundMessage("Organization not found.");
            var end = to ?? Money.Today;
            var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-3);
            if (start > end) return FieldError("from", "The start date cannot be after the end date.");
            var (_, message) = await _mail.StatementAsync(orgId, start, end, _documents, CurrentUserId);
            return Ok(new { message });
        }
    }
}
