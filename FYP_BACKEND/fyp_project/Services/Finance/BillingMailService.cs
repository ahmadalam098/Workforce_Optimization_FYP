using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>Emails about money to an organization: the invoice, a payment reminder, a receipt and the statement. Each has the key numbers; the full document is in the organization's portal.</summary>
    public class BillingMailService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AccountMailer _mailer;
        private readonly AuditService _audit;

        public BillingMailService(WorkforceManagementDbContext db, AccountMailer mailer, AuditService audit)
        {
            _db = db;
            _mailer = mailer;
            _audit = audit;
        }

        private async Task<(string Company, string Bank, string Terms, string Email)> CompanyAsync() => (
            await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyName),
            await SettingsReader.GetAsync(_db, SettingsCatalog.BankDetails),
            await SettingsReader.GetAsync(_db, SettingsCatalog.InvoiceTerms),
            await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyEmail));

        /// <summary>The invoice, or a reminder when it is already late or the sender asked for one. Draft and cancelled invoices are never sent.</summary>
        public async Task<(bool Ok, string Message)> InvoiceAsync(Invoice invoice, int? actorUserId, bool reminder)
        {
            if (invoice.Status == InvoiceService.Draft) return (false, "A draft invoice cannot be emailed. Issue it first.");
            if (invoice.Status == InvoiceService.Cancelled) return (false, "A cancelled invoice cannot be emailed.");
            if (reminder && invoice.Status == InvoiceService.Paid) return (false, "This invoice is fully paid, so there is nothing to remind.");

            var (company, bank, terms, email) = await CompanyAsync();
            var balance = invoice.TotalAmount - invoice.PaidAmount;
            var late = invoice.DueDate != null && invoice.DueDate < Money.Today && balance > 0;
            var number = invoice.InvoiceNumber ?? $"#{invoice.InvoiceId}";

            var subject = reminder ? (late ? $"Payment reminder: invoice {number} is overdue" : $"Payment reminder: invoice {number}") : $"Invoice {number} from {company}";
            var intro = reminder
                ? $"This is a friendly reminder that invoice <strong>{number}</strong> still has <strong>{balance:0.00} {invoice.Currency}</strong> to pay" + (late ? $" and was due on {invoice.DueDate:yyyy-MM-dd}." : $", due on {invoice.DueDate:yyyy-MM-dd}.")
                : $"Invoice <strong>{number}</strong> for the employees who worked for you from {invoice.PeriodStart:yyyy-MM-dd} to {invoice.PeriodEnd:yyyy-MM-dd} is ready.";
            var paragraphs = new List<string> { intro, "You can open, print and pay it from <strong>Invoices</strong> in your organization portal. After you pay, use <strong>Payments</strong> there to tell us, and you will get the receipt." };
            if (!string.IsNullOrWhiteSpace(terms)) paragraphs.Add(System.Net.WebUtility.HtmlEncode(terms));

            var note = await _mailer.SendOrganizationDocumentAsync(actorUserId, invoice.OrgId, reminder ? "Payment reminder" : "Invoice", subject, paragraphs, new[]
            {
                ("Invoice", number),
                ("Total", $"{invoice.TotalAmount:0.00} {invoice.Currency}"),
                ("Still to pay", $"{balance:0.00} {invoice.Currency}"),
                ("Due date", invoice.DueDate?.ToString("yyyy-MM-dd") ?? string.Empty),
                ("Pay to", bank),
                ("Questions", email),
            });
            await _audit.LogAsync(actorUserId, reminder ? "INVOICE_REMINDER_SENT" : "INVOICE_EMAILED", "Invoice", invoice.InvoiceId, $"{number}: {(reminder ? "payment reminder" : "invoice")} sent to the organization");
            return (true, (reminder ? "Reminder" : "Invoice email") + " done." + note);
        }

        public async Task<(bool Ok, string Message)> ReceiptAsync(InvoicePayment payment, Invoice invoice, int? actorUserId)
        {
            var (company, _, _, email) = await CompanyAsync();
            var number = DocumentCodes.ReceiptNumber(payment);
            var note = await _mailer.SendOrganizationDocumentAsync(actorUserId, invoice.OrgId, "Payment receipt", $"Receipt {number} from {company}",
                new[] { $"Thank you. We received your payment of <strong>{payment.Amount:0.00} {payment.Currency}</strong> for invoice {invoice.InvoiceNumber}.", "You can open and print the receipt from <strong>Invoices</strong> in your organization portal." },
                new[] { ("Receipt", number), ("Invoice", invoice.InvoiceNumber ?? string.Empty), ("Amount", $"{payment.Amount:0.00} {payment.Currency}"), ("Received on", payment.PaidAt.ToString("yyyy-MM-dd")), ("Method", payment.Method ?? string.Empty), ("Still to pay on this invoice", $"{invoice.TotalAmount - invoice.PaidAmount:0.00} {invoice.Currency}"), ("Questions", email) });
            await _audit.LogAsync(actorUserId, "RECEIPT_EMAILED", "Invoice", invoice.InvoiceId, $"Receipt {number} sent to the organization");
            return (true, "Receipt email done." + note);
        }

        public async Task<(bool Ok, string Message)> StatementAsync(int orgId, DateOnly from, DateOnly to, DocumentService documents, int? actorUserId)
        {
            var (company, bank, _, email) = await CompanyAsync();
            var rows = new List<(string, string)> { ("Period", $"{from:yyyy-MM-dd} to {to:yyyy-MM-dd}") };
            foreach (var (currency, owed) in await documents.OwedAsync(orgId, to)) rows.Add(($"You owe now ({currency})", $"{owed:0.00}"));
            rows.Add(("Pay to", bank));
            rows.Add(("Questions", email));
            var note = await _mailer.SendOrganizationDocumentAsync(actorUserId, orgId, "Statement of account", $"Statement of account from {company}",
                new[] { "Your statement of account is ready. It lists every invoice and payment of the period and what you owe now.", "Open and print it from <strong>Statements</strong> in your organization portal." }, rows);
            await _audit.LogAsync(actorUserId, "STATEMENT_EMAILED", "Organization", orgId, $"Statement {from:yyyy-MM-dd} to {to:yyyy-MM-dd} sent to the organization");
            return (true, "Statement email done." + note);
        }
    }
}
