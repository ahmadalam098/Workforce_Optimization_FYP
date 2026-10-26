using System.Security.Cryptography;
using System.Text;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>The numbers printed on documents. They come from ids that already exist, so they never need a table of their own.</summary>
    public static class DocumentCodes
    {
        public const string Invoice = "invoice";
        public const string Receipt = "receipt";
        public const string Payout = "payout";

        public static string ReceiptNumber(InvoicePayment payment) => $"RCP-{payment.PaidAt:yyyy}-{payment.PaymentId:D5}";
        public static string PayoutNumber(int year, int month, int payoutId) => $"PYT-{year}{month:D2}-{payoutId:D5}";
        public static string StatementNumber(int orgId, DateOnly from, DateOnly to) => $"STM-{orgId:D4}-{from:yyyyMMdd}-{to:yyyyMMdd}";
    }

    /// <summary>An amount written in words (for receipts), for example "Four hundred dollars and fifty cents only".</summary>
    public static class AmountInWords
    {
        private static readonly string[] Small = { "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen" };
        private static readonly string[] Tens = { "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety" };
        private static readonly string[] Scales = { "", " thousand", " million", " billion", " trillion" };

        private static string Below1000(long n)
        {
            var parts = new List<string>();
            if (n >= 100) { parts.Add(Small[n / 100] + " hundred"); n %= 100; }
            if (n >= 20) parts.Add(Tens[n / 10] + (n % 10 > 0 ? "-" + Small[n % 10] : string.Empty));
            else if (n > 0 || parts.Count == 0) parts.Add(Small[n]);
            return string.Join(" ", parts);
        }

        public static string Whole(long n)
        {
            if (n == 0) return "zero";
            var parts = new List<string>();
            for (var scale = 0; n > 0 && scale < Scales.Length; scale++, n /= 1000)
                if (n % 1000 > 0) parts.Insert(0, Below1000(n % 1000) + Scales[scale]);
            return string.Join(" ", parts);
        }

        private static (string Major, string Minor) Names(string currency) => currency.ToUpperInvariant() switch
        {
            "USD" => ("dollars", "cents"),
            "PKR" => ("rupees", "paisa"),
            "EUR" => ("euros", "cents"),
            "GBP" => ("pounds", "pence"),
            "AED" => ("dirhams", "fils"),
            "SAR" => ("riyals", "halalas"),
            _ => (currency.ToUpperInvariant(), "cents"),
        };

        public static string Of(decimal amount, string currency)
        {
            var rounded = Math.Round(Math.Abs(amount), 2);
            var whole = (long)Math.Floor(rounded);
            var minor = (int)Math.Round((rounded - whole) * 100);
            var (major, small) = Names(currency);
            var text = $"{Whole(whole)} {major}" + (minor > 0 ? $" and {Whole(minor)} {small}" : string.Empty) + " only";
            return char.ToUpperInvariant(text[0]) + text[1..];
        }
    }

    /// <summary>
    /// Builds the printable documents: invoice, payment receipt, statement of account, payslip, payroll sheet and profit statement. Each one is a plain
    /// object with the company letterhead; the portals draw it (A4 or a narrow thermal slip). Who may see which document is decided by the caller.
    /// The code on a document (and in its QR) proves it is genuine: it can be checked on the public verify page without signing in.
    /// </summary>
    public class DocumentService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IConfiguration _config;

        public DocumentService(WorkforceManagementDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        // ---------------------------------------------------------------- letterhead and verification

        public async Task<object> LetterheadAsync() => new
        {
            companyName = await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyName),
            address = await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyAddress),
            phone = await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyPhone),
            email = await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyEmail),
            registrationNumber = await SettingsReader.GetAsync(_db, SettingsCatalog.CompanyRegistration),
            bankDetails = await SettingsReader.GetAsync(_db, SettingsCatalog.BankDetails),
            terms = await SettingsReader.GetAsync(_db, SettingsCatalog.InvoiceTerms),
            footer = await SettingsReader.GetAsync(_db, SettingsCatalog.DocumentFooter),
        };

        /// <summary>A short code that only the server can make for this document (so a made-up document cannot pass the check).</summary>
        public string CodeFor(string kind, int id, decimal amount)
        {
            var key = Encoding.UTF8.GetBytes(_config["Jwt:Key"] ?? "workforce-nexus-documents");
            var hash = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{kind}:{id}:{amount:0.00}"));
            return Convert.ToHexString(hash)[..10];
        }

        private object Verify(string kind, string number, int id, decimal amount) => new { kind, number, code = CodeFor(kind, id, amount), path = $"/verify/{kind}/{Uri.EscapeDataString(number)}?c={CodeFor(kind, id, amount)}" };

        // ---------------------------------------------------------------- invoice and receipt

        private async Task<object> OrganizationBlockAsync(int orgId)
        {
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == orgId);
            return new { organizationId = orgId, name = org?.OrgName, email = org?.Email, phone = org?.Phone, address = org?.Address, country = org?.Country };
        }

        public async Task<object> InvoiceAsync(Invoice invoice)
        {
            var today = Money.Today;
            var contractNumber = invoice.ContractId == null ? null : await _db.Contracts.AsNoTracking().Where(c => c.ContractId == invoice.ContractId).Select(c => c.ContractNumber).FirstOrDefaultAsync();
            var lines = await _db.InvoiceLines.AsNoTracking().Where(l => l.InvoiceId == invoice.InvoiceId).OrderBy(l => l.LineId).ToListAsync();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => p.InvoiceId == invoice.InvoiceId).OrderBy(p => p.PaidAt).ToListAsync();
            var issuer = invoice.CreatedBy == null ? null : await _db.Users.AsNoTracking().Where(u => u.UserId == invoice.CreatedBy).Select(u => u.Name).FirstOrDefaultAsync();
            var number = invoice.InvoiceNumber ?? $"#{invoice.InvoiceId}";

            return new
            {
                kind = DocumentCodes.Invoice,
                number,
                title = invoice.Status == InvoiceService.Draft ? "Draft invoice" : "Invoice",
                status = invoice.Status,
                displayStatus = InvoiceService.DisplayStatus(invoice.Status, invoice.TotalAmount, invoice.PaidAmount, invoice.DueDate, today),
                issueDate = invoice.IssueDate,
                dueDate = invoice.DueDate,
                periodStart = invoice.PeriodStart,
                periodEnd = invoice.PeriodEnd,
                currency = invoice.Currency,
                organization = await OrganizationBlockAsync(invoice.OrgId),
                contractNumber,
                issuedBy = issuer,
                lines = lines.Select(l => new { l.LineId, l.LineType, l.Description, quantity = l.Quantity, unitRate = l.UnitRate, amount = l.Amount }),
                total = invoice.TotalAmount,
                paid = invoice.PaidAmount,
                balance = invoice.Status == InvoiceService.Cancelled ? 0 : invoice.TotalAmount - invoice.PaidAmount,
                amountInWords = AmountInWords.Of(invoice.TotalAmount, invoice.Currency),
                payments = payments.Select(p => new { p.PaymentId, receiptNumber = DocumentCodes.ReceiptNumber(p), paidAt = p.PaidAt, amount = p.Amount, p.Method, p.Reference }),
                notes = invoice.Notes,
                cancelReason = invoice.CancelReason,
                letterhead = await LetterheadAsync(),
                verify = Verify(DocumentCodes.Invoice, number, invoice.InvoiceId, invoice.TotalAmount),
            };
        }

        public async Task<object> ReceiptAsync(InvoicePayment payment, Invoice invoice)
        {
            var number = DocumentCodes.ReceiptNumber(payment);
            var receivedBy = payment.RecordedBy == null ? null : await _db.Users.AsNoTracking().Where(u => u.UserId == payment.RecordedBy).Select(u => u.Name).FirstOrDefaultAsync();
            var verifiedBy = payment.VerifiedBy == null ? null : await _db.Users.AsNoTracking().Where(u => u.UserId == payment.VerifiedBy).Select(u => u.Name).FirstOrDefaultAsync();
            return new
            {
                kind = DocumentCodes.Receipt,
                number,
                title = "Payment receipt",
                paidAt = payment.PaidAt,
                amount = payment.Amount,
                currency = payment.Currency,
                amountInWords = AmountInWords.Of(payment.Amount, payment.Currency),
                method = payment.Method,
                reference = payment.Reference,
                receivedBy,
                verifiedBy,
                verifiedAt = payment.VerifiedAt,
                organization = await OrganizationBlockAsync(invoice.OrgId),
                invoice = new { number = invoice.InvoiceNumber, total = invoice.TotalAmount, paid = invoice.PaidAmount, balance = invoice.TotalAmount - invoice.PaidAmount, currency = invoice.Currency, invoice.InvoiceId },
                letterhead = await LetterheadAsync(),
                verify = Verify(DocumentCodes.Receipt, number, payment.PaymentId, payment.Amount),
            };
        }

        // ---------------------------------------------------------------- statement of account

        /// <summary>The organization's account for a period, one section per currency: what it owed at the start, every invoice and payment, and what it owes at the end.</summary>
        public async Task<object> StatementAsync(int orgId, DateOnly from, DateOnly to)
        {
            var invoices = await _db.Invoices.AsNoTracking()
                .Where(i => i.OrgId == orgId && i.IssueDate != null && (i.Status == InvoiceService.Issued || i.Status == InvoiceService.Paid))
                .Select(i => new { i.InvoiceId, i.InvoiceNumber, i.Currency, i.TotalAmount, IssueDate = i.IssueDate!.Value, i.DueDate })
                .ToListAsync();
            var ids = invoices.Select(i => i.InvoiceId).ToList();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => ids.Contains(p.InvoiceId)).ToListAsync();
            var invoiceNumbers = invoices.ToDictionary(i => i.InvoiceId, i => i.InvoiceNumber);

            var currencies = new List<object>();
            foreach (var currency in invoices.Select(i => i.Currency).Distinct().OrderBy(c => c))
            {
                var inv = invoices.Where(i => i.Currency == currency).ToList();
                var pay = payments.Where(p => p.Currency == currency).ToList();
                var opening = inv.Where(i => i.IssueDate < from).Sum(i => i.TotalAmount) - pay.Where(p => DateOnly.FromDateTime(p.PaidAt) < from).Sum(p => p.Amount);

                var events = inv.Where(i => i.IssueDate >= from && i.IssueDate <= to)
                    .Select(i => (Date: i.IssueDate.ToDateTime(TimeOnly.MinValue), Type: "Invoice", Number: i.InvoiceNumber ?? $"#{i.InvoiceId}", Description: $"Invoice issued, due {(i.DueDate.HasValue ? i.DueDate.Value.ToString("yyyy-MM-dd") : "on receipt")}", Debit: i.TotalAmount, Credit: 0m))
                    .Concat(pay.Where(p => DateOnly.FromDateTime(p.PaidAt) >= from && DateOnly.FromDateTime(p.PaidAt) <= to)
                        .Select(p => (Date: p.PaidAt, Type: "Payment", Number: DocumentCodes.ReceiptNumber(p), Description: $"Payment received ({p.Method ?? "payment"}) for {invoiceNumbers.GetValueOrDefault(p.InvoiceId)}", Debit: 0m, Credit: p.Amount)))
                    .OrderBy(e => e.Date).ThenBy(e => e.Type == "Invoice" ? 0 : 1)
                    .ToList();

                var running = opening;
                var rows = events.Select(e =>
                {
                    running += e.Debit - e.Credit;
                    return new { date = e.Date, type = e.Type, number = e.Number, description = e.Description, debit = e.Debit, credit = e.Credit, balance = running };
                }).ToList();

                currencies.Add(new { currency, opening, rows, totalDebit = events.Sum(e => e.Debit), totalCredit = events.Sum(e => e.Credit), closing = running });
            }

            var number = DocumentCodes.StatementNumber(orgId, from, to);
            return new
            {
                kind = "statement",
                number,
                title = "Statement of account",
                from,
                to,
                generatedAt = DateTime.UtcNow,
                organization = await OrganizationBlockAsync(orgId),
                currencies,
                letterhead = await LetterheadAsync(),
            };
        }

        /// <summary>What the organization owes on a day, per currency (invoices issued up to then minus the payments received up to then).</summary>
        public async Task<List<(string Currency, decimal Owed)>> OwedAsync(int orgId, DateOnly on)
        {
            var invoices = await _db.Invoices.AsNoTracking()
                .Where(i => i.OrgId == orgId && i.IssueDate != null && i.IssueDate <= on && (i.Status == InvoiceService.Issued || i.Status == InvoiceService.Paid))
                .Select(i => new { i.InvoiceId, i.Currency, i.TotalAmount }).ToListAsync();
            var ids = invoices.Select(i => i.InvoiceId).ToList();
            var payments = await _db.InvoicePayments.AsNoTracking().Where(p => ids.Contains(p.InvoiceId)).Select(p => new { p.Currency, p.Amount, p.PaidAt }).ToListAsync();
            return invoices.Select(i => i.Currency).Distinct().OrderBy(c => c)
                .Select(c => (c, invoices.Where(i => i.Currency == c).Sum(i => i.TotalAmount) - payments.Where(p => p.Currency == c && DateOnly.FromDateTime(p.PaidAt) <= on).Sum(p => p.Amount)))
                .ToList();
        }

        // ---------------------------------------------------------------- the profit sent to a business owner (receipt)

        /// <summary>The receipt of one owner's share: what the company received, what it spent, what was sent in total, and this owner's part.</summary>
        public async Task<object> PayoutAsync(OwnerPayout payout)
        {
            var settlement = await _db.OwnerSettlements.AsNoTracking().FirstAsync(s => s.SettlementId == payout.SettlementId);
            var owner = await _db.Users.AsNoTracking().Where(u => u.UserId == payout.OwnerUserId).Select(u => new { u.UserId, u.Name, u.Email }).FirstOrDefaultAsync();
            var sentBy = settlement.SettledBy == null ? null : await _db.Users.AsNoTracking().Where(u => u.UserId == settlement.SettledBy).Select(u => u.Name).FirstOrDefaultAsync();
            var number = DocumentCodes.PayoutNumber(settlement.PeriodYear, settlement.PeriodMonth, payout.PayoutId);
            return new
            {
                kind = DocumentCodes.Payout,
                number,
                title = "Profit share receipt",
                period = CompanyLedgerService.MonthLabel(settlement.PeriodYear, settlement.PeriodMonth),
                sentAt = settlement.SettledAt,
                sentBy,
                owner = new { userId = owner?.UserId, name = owner?.Name, email = owner?.Email },
                amountPkr = payout.AmountPkr,
                amountInWords = AmountInWords.Of(payout.AmountPkr, "PKR"),
                owners = settlement.OwnerCount,
                company = new
                {
                    receivedPkr = settlement.ReceivedPkr,
                    expensesPkr = settlement.ExpensesPkr,
                    alreadySentPkr = settlement.PreviouslySentPkr,
                    sharedNowPkr = settlement.AmountPkr,
                },
                note = settlement.Note,
                letterhead = await LetterheadAsync(),
                verify = Verify(DocumentCodes.Payout, number, payout.PayoutId, payout.AmountPkr),
            };
        }
    }
}
