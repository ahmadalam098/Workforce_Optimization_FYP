using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Security.Cryptography;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Models
{
    // Created by FYP_DB/migrations/022_online_payments.sql
    /// <summary>One attempt of an organization to pay an invoice through the payment gateway.</summary>
    [Table("Online_Payment")]
    public class OnlinePayment
    {
        public const string Created = "Created";
        public const string Paid = "Paid";
        public const string Failed = "Failed";
        public const string Cancelled = "Cancelled";
        public const string Expired = "Expired";

        [Key, Column("online_payment_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int OnlinePaymentId { get; set; }
        [Column("token"), MaxLength(40)] public string Token { get; set; } = string.Empty;
        [Column("invoice_id")] public int InvoiceId { get; set; }
        [Column("org_id")] public int OrgId { get; set; }
        [Column("amount", TypeName = "decimal(14,2)")] public decimal Amount { get; set; }
        [Column("currency"), MaxLength(10)] public string Currency { get; set; } = "USD";
        [Column("provider"), MaxLength(20)] public string Provider { get; set; } = "Demo";
        [Column("status"), MaxLength(12)] public string Status { get; set; } = Created;
        [Column("gateway_reference"), MaxLength(60)] public string? GatewayReference { get; set; }
        [Column("failure_reason"), MaxLength(255)] public string? FailureReason { get; set; }
        [Column("created_at")] public DateTime CreatedAt { get; set; }
        [Column("completed_at")] public DateTime? CompletedAt { get; set; }
        [Column("payment_id")] public int? PaymentId { get; set; }
    }
}

namespace fyp_project.Services
{
    /// <summary>
    /// The payment gateway behind "Pay online". Only the demo gateway exists for now: it shows a fake checkout page and no real money moves. A real
    /// gateway (JazzCash, Easypaisa, PayFast, Stripe ...) is another implementation of this interface plus its signed webhook; the table, the flow,
    /// the receipt, the bells and the screens stay as they are.
    /// </summary>
    public interface IPaymentGateway
    {
        string Name { get; }
        /// <summary>True for the demo gateway: its checkout page is ours and its "webhook" is the page's own buttons.</summary>
        bool IsDemo { get; }
        /// <summary>Where the organization is sent to pay (a page of the portal for the demo, the gateway's hosted page for a real one).</summary>
        string CheckoutPath(string token);
    }

    public class DemoPaymentGateway : IPaymentGateway
    {
        public string Name => "Demo";
        public bool IsDemo => true;
        public string CheckoutPath(string token) => $"/pay/demo/{token}";
    }

    public record OnlineStart(bool Ok, int Status, string? Message, string? Field = null, string? Token = null, string? CheckoutPath = null);

    /// <summary>
    /// Pay an invoice online. The organization starts a checkout (a secret token); the gateway tells us the result; a successful result records the
    /// payment on the invoice with the same code as every other payment (PaymentService), so the receipt, the bells, the ledger, the statement and the
    /// owner's profit all follow. A payment made through the gateway needs no manager check: the bank already confirmed it.
    /// </summary>
    public class OnlinePaymentService
    {
        public static readonly TimeSpan CheckoutLifetime = TimeSpan.FromMinutes(30);

        private readonly WorkforceManagementDbContext _db;
        private readonly IPaymentGateway _gateway;
        private readonly PaymentService _payments;
        private readonly ExchangeRateService _rates;
        private readonly PaymentSubmissionService _submissions;
        private readonly BillingMailService _mail;
        private readonly AuditService _audit;

        public OnlinePaymentService(WorkforceManagementDbContext db, IPaymentGateway gateway, PaymentService payments, ExchangeRateService rates, PaymentSubmissionService submissions, BillingMailService mail, AuditService audit)
        {
            _db = db;
            _gateway = gateway;
            _payments = payments;
            _rates = rates;
            _submissions = submissions;
            _mail = mail;
            _audit = audit;
        }

        public IPaymentGateway Gateway => _gateway;

        public Task<bool> EnabledAsync() => SettingsReader.GetBoolAsync(_db, SettingsCatalog.OnlinePayments);

        /// <summary>Checkouts nobody finished in time are closed, so they stop reserving the balance.</summary>
        public async Task ExpireAsync()
        {
            var limit = DateTime.UtcNow - CheckoutLifetime;
            var old = await _db.OnlinePayments.Where(o => o.Status == OnlinePayment.Created && o.CreatedAt < limit).ToListAsync();
            foreach (var o in old)
            {
                o.Status = OnlinePayment.Expired;
                o.CompletedAt = DateTime.UtcNow;
            }
            if (old.Count > 0) await _db.SaveChangesAsync();
        }

        public async Task<OnlineStart> StartAsync(int orgId, int invoiceId, decimal? requested)
        {
            if (!await EnabledAsync()) return new OnlineStart(false, 409, "Online payment is switched off. Pay by bank transfer and tell us about the payment instead.");
            await ExpireAsync();

            var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == invoiceId && i.OrgId == orgId);
            if (invoice == null || invoice.Status == InvoiceService.Draft) return new OnlineStart(false, 404, "Invoice not found.");
            if (invoice.Status != InvoiceService.Issued) return new OnlineStart(false, 409, "Only an issued invoice that is not fully paid can be paid.");

            // The money must be convertible to PKR before it moves: a payment that cannot be recorded afterwards would be a mess to undo.
            if (invoice.Currency != ExchangeRateService.Pkr && await _rates.GetRateAsync(invoice.Currency, ExchangeRateService.Pkr, Money.Today) == null)
                return new OnlineStart(false, 409, $"Online payment is not available for {invoice.Currency} invoices yet (no exchange rate is stored). Pay by bank transfer and tell us about the payment instead.");

            var payable = await _submissions.PayableAsync(invoice);
            var amount = Money.Round(requested ?? payable);
            if (amount <= 0) return new OnlineStart(false, 400, "Enter an amount above zero.", "amount");
            if (amount > payable) return new OnlineStart(false, 400, payable <= 0 ? "The whole balance of this invoice is already being paid (a notice or an online payment is waiting)." : $"You can pay at most {payable:0.00} {invoice.Currency} now (the balance minus payments already waiting).", "amount");

            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
            _db.OnlinePayments.Add(new OnlinePayment { Token = token, InvoiceId = invoice.InvoiceId, OrgId = orgId, Amount = amount, Currency = invoice.Currency, Provider = _gateway.Name, Status = OnlinePayment.Created, CreatedAt = DateTime.UtcNow });
            await _db.SaveChangesAsync();
            return new OnlineStart(true, 200, null, Token: token, CheckoutPath: _gateway.CheckoutPath(token));
        }

        public async Task<OnlinePayment?> FindAsync(string token)
        {
            await ExpireAsync();
            return await _db.OnlinePayments.FirstOrDefaultAsync(o => o.Token == token);
        }

        /// <summary>What a checkout page shows (organization, invoice, amount) - by the secret token only.</summary>
        public async Task<object?> CheckoutAsync(string token)
        {
            var online = await FindAsync(token);
            if (online == null) return null;
            var invoice = await _db.Invoices.AsNoTracking().Include(i => i.Org).FirstOrDefaultAsync(i => i.InvoiceId == online.InvoiceId);
            var payment = online.PaymentId == null ? null : await _db.InvoicePayments.AsNoTracking().FirstOrDefaultAsync(p => p.PaymentId == online.PaymentId);
            return new
            {
                token = online.Token,
                provider = online.Provider,
                demo = _gateway.IsDemo,
                status = online.Status,
                amount = online.Amount,
                currency = online.Currency,
                organization = invoice?.Org?.OrgName,
                invoiceNumber = invoice?.InvoiceNumber,
                failureReason = online.FailureReason,
                paymentId = online.PaymentId,
                receiptNumber = payment == null ? null : DocumentCodes.ReceiptNumber(payment),
                createdAt = online.CreatedAt,
            };
        }

        /// <summary>
        /// The gateway's answer: "paid", "failed" or "cancelled". Safe to receive twice (a real gateway repeats its webhook): a finished checkout is not
        /// changed again. A paid answer records the payment on the invoice.
        /// </summary>
        public async Task<(int Status, string Message)> CompleteAsync(string token, string outcome, string? gatewayReference = null)
        {
            var online = await FindAsync(token);
            if (online == null) return (404, "Checkout not found.");
            if (online.Status != OnlinePayment.Created) return (200, $"This checkout is already {online.Status.ToLower()}.");

            if (outcome == "cancelled" || outcome == "failed")
            {
                online.Status = outcome == "cancelled" ? OnlinePayment.Cancelled : OnlinePayment.Failed;
                online.FailureReason = outcome == "cancelled" ? "The payment was cancelled." : "The payment did not go through (declined).";
                online.CompletedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                if (outcome == "failed")
                    await _audit.LogAsync(null, "ONLINE_PAYMENT_FAILED", "Invoice", online.InvoiceId, $"The online payment of {online.Amount:0.00} {online.Currency} did not go through. You can try again.");
                return (200, outcome == "cancelled" ? "Payment cancelled." : "Payment failed.");
            }
            if (outcome != "paid") return (400, "Unknown result.");

            var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceId == online.InvoiceId);
            if (invoice == null) return (404, "Invoice not found.");

            var reference = gatewayReference ?? $"DEMO-{online.OnlinePaymentId:D6}";
            var result = await _payments.RecordAsync(invoice, online.Amount, DateTime.UtcNow, "Online payment", reference, $"Paid through the {online.Provider} gateway", null, null, autoVerified: true);
            online.GatewayReference = reference;
            online.CompletedAt = DateTime.UtcNow;
            if (!result.Ok)
            {
                // The money reached the gateway but the invoice cannot take it (for example it was paid another way meanwhile). Kept visible for the admin.
                online.Status = OnlinePayment.Failed;
                online.FailureReason = result.Error;
                await _db.SaveChangesAsync();
                await _audit.LogAsync(null, "ONLINE_PAYMENT_FAILED", "Invoice", invoice.InvoiceId, $"An online payment of {online.Amount:0.00} {online.Currency} (ref {reference}) could not be applied: {result.Error} The admin will check it.");
                return (409, $"The payment could not be applied to the invoice: {result.Error}");
            }

            online.Status = OnlinePayment.Paid;
            online.PaymentId = result.Payment!.PaymentId;
            await _db.SaveChangesAsync();

            var receipt = DocumentCodes.ReceiptNumber(result.Payment);
            await _audit.LogAsync(null, "INVOICE_PAYMENT_RECORDED", "Invoice", invoice.InvoiceId, $"{invoice.InvoiceNumber}: {online.Amount:0.00} {invoice.Currency} paid online (ref {reference}), receipt {receipt}");
            try { await _mail.ReceiptAsync(result.Payment, invoice, null); } catch { /* the receipt email is a courtesy; the payment is already recorded */ }
            return (200, $"Payment received. Receipt {receipt}.");
        }
    }
}
