using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public static class Money
    {
        public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

        public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);
    }

    /// <summary>Currency conversion using the Exchange_Rate table (latest rate on or before a date).</summary>
    public class ExchangeRateService
    {
        public const string Pkr = "PKR";

        private readonly WorkforceManagementDbContext _db;

        public ExchangeRateService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        /// <summary>Rate to convert one unit of `from` into `to`, or null when no rate is stored.</summary>
        public async Task<decimal?> GetRateAsync(string from, string to, DateOnly? on = null)
        {
            from = from.Trim().ToUpperInvariant();
            to = to.Trim().ToUpperInvariant();
            if (from == to) return 1m;

            var date = on ?? Money.Today;

            var direct = await _db.ExchangeRates
                .AsNoTracking()
                .Where(r => r.FromCurrency == from && r.ToCurrency == to && r.EffectiveDate <= date)
                .OrderByDescending(r => r.EffectiveDate)
                .Select(r => (decimal?)r.Rate)
                .FirstOrDefaultAsync();
            if (direct.HasValue) return direct;

            var reverse = await _db.ExchangeRates
                .AsNoTracking()
                .Where(r => r.FromCurrency == to && r.ToCurrency == from && r.EffectiveDate <= date)
                .OrderByDescending(r => r.EffectiveDate)
                .Select(r => (decimal?)r.Rate)
                .FirstOrDefaultAsync();

            return reverse.HasValue ? Math.Round(1m / reverse.Value, 6) : null;
        }
    }

    /// <summary>Reads the system payment rules (invoice due days, overtime multiplier, ...).</summary>
    public class PaymentRuleService
    {
        public const string InvoiceDueDays = "INVOICE_DUE_DAYS";
        public const string OvertimeMultiplier = "OVERTIME_MULTIPLIER";
        public const string WorkingHoursPerMonth = "WORKING_HOURS_PER_MONTH";

        private readonly WorkforceManagementDbContext _db;

        public PaymentRuleService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        public async Task<decimal> GetAsync(string key, decimal fallback)
        {
            var value = await _db.PaymentRules
                .AsNoTracking()
                .Where(r => r.RuleKey == key && r.IsActive)
                .Select(r => (decimal?)r.Value)
                .FirstOrDefaultAsync();
            return value ?? fallback;
        }

        /// <summary>The fixed overtime rate if there is one, otherwise (salary / working hours) x overtime multiplier.</summary>
        public async Task<decimal> OvertimeRateAsync(SalaryStructure structure)
        {
            if (structure.OvertimeRate.HasValue) return structure.OvertimeRate.Value;

            var hours = await GetAsync(WorkingHoursPerMonth, 208m);
            var multiplier = await GetAsync(OvertimeMultiplier, 1.5m);
            return hours <= 0 ? 0 : Money.Round(structure.MonthlySalary / hours * multiplier);
        }
    }

    public record UsageInterval(DateTime Start, DateTime End);

    public static class BillingCalculator
    {
        /// <summary>
        /// Splits employee-hours into base and extra hours. At any moment the first `baseEmployees`
        /// employees on duty are billed at the base rate and everyone above that at the extra rate.
        /// </summary>
        public static (decimal baseHours, decimal extraHours) Split(IEnumerable<UsageInterval> intervals, int baseEmployees)
        {
            var events = new List<(DateTime time, int delta)>();
            foreach (var interval in intervals)
            {
                if (interval.End <= interval.Start) continue;
                events.Add((interval.Start, +1));
                events.Add((interval.End, -1));
            }

            events.Sort((a, b) => a.time != b.time ? a.time.CompareTo(b.time) : a.delta.CompareTo(b.delta));

            decimal baseHours = 0, extraHours = 0;
            var onDuty = 0;
            DateTime? previous = null;

            foreach (var (time, delta) in events)
            {
                if (previous.HasValue && time > previous.Value)
                {
                    var hours = (decimal)(time - previous.Value).TotalHours;
                    baseHours += Math.Min(onDuty, baseEmployees) * hours;
                    extraHours += Math.Max(0, onDuty - baseEmployees) * hours;
                }
                onDuty += delta;
                previous = time;
            }

            return (Math.Round(baseHours, 2), Math.Round(extraHours, 2));
        }
    }

    /// <summary>Builds invoice lines from the contract rates and the hours employees were allocated to an organization.</summary>
    public class InvoiceService
    {
        public const string Draft = "Draft";
        public const string Issued = "Issued";
        public const string Paid = "Paid";
        public const string Cancelled = "Cancelled";

        private readonly WorkforceManagementDbContext _db;

        public InvoiceService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        public async Task<(InvoicePreviewDto? preview, string? error)> BuildPreviewAsync(int orgId, DateOnly start, DateOnly end)
        {
            if (end < start) return (null, "The period end cannot be before the period start.");
            if (end.DayNumber - start.DayNumber > 366) return (null, "An invoice period cannot be longer than one year.");

            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == orgId);
            if (org == null) return (null, "The selected organization does not exist.");

            var contract = await _db.Contracts
                .AsNoTracking()
                .Where(c => c.OrgId == orgId && (c.Status == "Active" || c.Status == "Approved"))
                .OrderByDescending(c => c.ContractId)
                .FirstOrDefaultAsync();
            if (contract == null) return (null, $"{org.OrgName} has no active contract, so there are no rates to bill with.");
            if (contract.BaseHourlyRate == null) return (null, $"Contract {contract.ContractNumber} has no base hourly rate.");

            var baseRate = contract.BaseHourlyRate.Value;
            var extraRate = contract.ExtraHourlyRate ?? baseRate;
            var currency = string.IsNullOrWhiteSpace(contract.BillingCurrency) ? "USD" : contract.BillingCurrency.Trim().ToUpperInvariant();

            var periodStart = start.ToDateTime(TimeOnly.MinValue);
            var periodEndExclusive = end.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var now = DateTime.UtcNow;

            var allocations = await _db.EmployeeAllocations
                .AsNoTracking()
                .Where(a => a.AssignOrgId == orgId
                            && a.StartDatetime != null
                            && a.StartDatetime < periodEndExclusive
                            && (a.ActualEndDatetime == null || a.ActualEndDatetime > periodStart)
                            && a.Status != "Cancelled")
                .Select(a => new { Start = a.StartDatetime!.Value, End = a.ActualEndDatetime })
                .ToListAsync();

            var intervals = new List<UsageInterval>();
            foreach (var allocation in allocations)
            {
                var from = allocation.Start > periodStart ? allocation.Start : periodStart;
                var openEnd = now < periodEndExclusive ? now : periodEndExclusive;
                var to = allocation.End ?? openEnd;
                if (to > periodEndExclusive) to = periodEndExclusive;
                if (to > from) intervals.Add(new UsageInterval(from, to));
            }

            var baseEmployees = contract.MinEmployees ?? int.MaxValue;
            var (baseHours, extraHours) = BillingCalculator.Split(intervals, baseEmployees);

            var preview = new InvoicePreviewDto
            {
                OrgId = orgId,
                OrgName = org.OrgName,
                ContractId = contract.ContractId,
                ContractNumber = contract.ContractNumber,
                Currency = currency,
                PeriodStart = start,
                PeriodEnd = end,
                BaseEmployees = contract.MinEmployees,
                BaseHours = baseHours,
                ExtraHours = extraHours,
                AllocationCount = intervals.Count,
            };

            if (baseHours > 0)
                preview.Lines.Add(new InvoiceLineDto
                {
                    LineType = "Base",
                    Description = contract.MinEmployees.HasValue
                        ? $"Base rate: up to {contract.MinEmployees} employee(s) at a time"
                        : "Base rate: employee-hours",
                    Quantity = baseHours,
                    UnitRate = baseRate,
                    Amount = Money.Round(baseHours * baseRate),
                });

            if (extraHours > 0)
                preview.Lines.Add(new InvoiceLineDto
                {
                    LineType = "Extra",
                    Description = "Extra employees above the contract minimum",
                    Quantity = extraHours,
                    UnitRate = extraRate,
                    Amount = Money.Round(extraHours * extraRate),
                });

            preview.Total = preview.Lines.Sum(l => l.Amount);

            if (intervals.Count == 0)
                preview.Warnings.Add("No employee-hours were allocated to this organization in this period. You can still add adjustment lines (for example a minimum guarantee).");

            return (preview, null);
        }

        /// <summary>Display status: Draft / Issued / PartiallyPaid / Overdue / Paid / Cancelled.</summary>
        public static string DisplayStatus(string status, decimal total, decimal paid, DateOnly? dueDate, DateOnly today)
        {
            if (status != Issued) return status;

            var balance = total - paid;
            if (balance > 0 && dueDate.HasValue && dueDate.Value < today) return "Overdue";
            if (paid > 0 && balance > 0) return "PartiallyPaid";
            return Issued;
        }
    }
}
