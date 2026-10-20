using fyp_project.Models;

namespace fyp_project.Services
{
    public record PaymentResult(bool Ok, string? Field = null, string? Error = null, InvoicePayment? Payment = null);

    /// <summary>
    /// Records a payment on an issued invoice: the one place that checks the balance, finds the exchange rate, saves the payment with its PKR
    /// value and closes the invoice when it is fully paid. Used when the admin records a payment and when the admin approves an organization's
    /// payment submission, so both end in exactly the same receipt.
    /// </summary>
    public class PaymentService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly ExchangeRateService _rates;

        public PaymentService(WorkforceManagementDbContext db, ExchangeRateService rates)
        {
            _db = db;
            _rates = rates;
        }

        /// <param name="verifiedBy">Set when the organization manager already verified this payment (a verified submission).</param>
        /// <param name="autoVerified">A payment confirmed by the payment gateway needs no manager check: it is marked verified (without a person).</param>
        public async Task<PaymentResult> RecordAsync(Invoice invoice, decimal rawAmount, DateTime? paidAtUtc, string? method, string? reference, string? notes, decimal? rateOverride, int? recordedBy, int? verifiedBy = null, DateTime? verifiedAt = null, bool autoVerified = false)
        {
            if (invoice.Status != InvoiceService.Issued) return new PaymentResult(false, null, "Payments can only be recorded on issued invoices that are not fully paid.");

            var amount = Money.Round(rawAmount);
            var balance = invoice.TotalAmount - invoice.PaidAmount;
            if (amount <= 0) return new PaymentResult(false, "amount", "Enter an amount above zero.");
            if (amount > balance) return new PaymentResult(false, "amount", $"The payment is more than the remaining balance ({balance:0.00} {invoice.Currency}).");

            var paidAt = paidAtUtc ?? DateTime.UtcNow;
            decimal? rate = invoice.Currency == ExchangeRateService.Pkr
                ? 1m
                : rateOverride ?? await _rates.GetRateAsync(invoice.Currency, ExchangeRateService.Pkr, DateOnly.FromDateTime(paidAt));
            if (rate == null)
                return new PaymentResult(false, "exchangeRate", $"No {invoice.Currency} to PKR exchange rate is stored. Add one under Exchange Rates, or enter the rate here.");

            var payment = new InvoicePayment
            {
                InvoiceId = invoice.InvoiceId,
                Amount = amount,
                Currency = invoice.Currency,
                ExchangeRate = rate.Value,
                AmountPkr = Money.Round(amount * rate.Value),
                PaidAt = paidAt,
                Method = ContractLogic.Clean(method),
                Reference = ContractLogic.Clean(reference),
                Notes = ContractLogic.Clean(notes),
                RecordedBy = recordedBy,
                CreatedAt = DateTime.UtcNow,
                VerifiedBy = verifiedBy,
                VerifiedAt = verifiedBy == null && !autoVerified ? null : verifiedAt ?? DateTime.UtcNow,
            };
            _db.InvoicePayments.Add(payment);

            invoice.PaidAmount += amount;
            if (invoice.PaidAmount >= invoice.TotalAmount) invoice.Status = InvoiceService.Paid;
            await _db.SaveChangesAsync();
            return new PaymentResult(true, Payment: payment);
        }
    }
}
