using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// The salary report of one employee: what the admin decided (Salary_Structure) and what the payroll did with it, month by month
    /// (Payroll_Run / Payroll_Item). One place for the rules, so the employee, the admin and the numbers in the lists always agree.
    /// </summary>
    public record SalaryReport(int Year, List<int> Years, object? CurrentSalary, object History, object Months, object Summary);

    public class SalaryReportService
    {
        public const string Paid = "Paid";
        public const string Approved = "Approved";
        public const string Draft = "Draft";
        public const string NotProcessed = "NotProcessed";
        public const string Upcoming = "Upcoming";
        public const string BeforeStart = "BeforeStart";

        private readonly WorkforceManagementDbContext _db;

        public SalaryReportService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        public static string Label(string status) => status switch
        {
            Paid => "Paid",
            Approved => "Approved, waiting to be paid",
            Draft => "Being prepared",
            Upcoming => "Not due yet",
            BeforeStart => "Before the salary started",
            _ => "Not processed yet",
        };

        /// <summary>The state of one month. "Start" is the first month the employee had a salary.</summary>
        public static string StateOf(DateOnly firstOfMonth, DateOnly thisMonth, DateOnly? start, string? payrollStatus) =>
            firstOfMonth > thisMonth ? Upcoming
            : start == null || firstOfMonth < start ? BeforeStart
            : payrollStatus ?? NotProcessed;

        private static DateOnly? StartOf(List<SalaryStructure> structures) =>
            structures.Count == 0 ? null : structures.Min(s => new DateOnly(s.EffectiveFrom.Year, s.EffectiveFrom.Month, 1));

        /// <summary>
        /// The report of a year. A draft payroll is "being prepared": <paramref name="showDraftAmounts"/> says whether its amounts are shown
        /// (the admin sees them, the employee does not, because the admin can still change them).
        /// </summary>
        public async Task<SalaryReport> BuildAsync(int employeeId, int? year, bool showDraftAmounts)
        {
            var structures = await _db.SalaryStructures.AsNoTracking().Where(s => s.EmpId == employeeId)
                .OrderByDescending(s => s.EffectiveFrom).ThenByDescending(s => s.StructureId).ToListAsync();
            var current = structures.FirstOrDefault(s => s.EffectiveTo == null);

            var today = Money.Today;
            var thisMonth = new DateOnly(today.Year, today.Month, 1);
            var start = StartOf(structures);

            var y = Math.Clamp(year ?? today.Year, 2000, today.Year + 1);
            var firstYear = Math.Min(start?.Year ?? today.Year, today.Year);
            var years = Enumerable.Range(firstYear, today.Year - firstYear + 1).Reverse().ToList();

            var items = await (from i in _db.PayrollItems.AsNoTracking()
                               join r in _db.PayrollRuns.AsNoTracking() on i.PayrollId equals r.PayrollId
                               where i.EmpId == employeeId && r.PeriodYear == y
                               select new
                               {
                                   r.PeriodMonth, r.Status, r.ApprovedAt, r.PaidAt,
                                   i.Currency, i.BaseSalary, i.OvertimeHours, i.OvertimeAmount, i.Adjustment, i.AdjustmentNote, i.TotalAmount,
                               }).ToListAsync();

            var months = Enumerable.Range(1, 12).Select(month =>
            {
                var first = new DateOnly(y, month, 1);
                var item = items.FirstOrDefault(x => x.PeriodMonth == month);
                var state = StateOf(first, thisMonth, start, item?.Status);
                // The salary in force during that month, for months that are not paid out yet.
                var inForce = structures.FirstOrDefault(s => s.EffectiveFrom <= first.AddMonths(1).AddDays(-1) && (s.EffectiveTo == null || s.EffectiveTo >= first));
                var showAmounts = item != null && (state == Paid || state == Approved || (state == Draft && showDraftAmounts));
                return new
                {
                    month,
                    status = state,
                    statusLabel = Label(state),
                    currency = showAmounts ? item!.Currency : inForce?.Currency,
                    baseSalary = showAmounts ? item!.BaseSalary : (decimal?)null,
                    overtimeHours = showAmounts ? item!.OvertimeHours : (decimal?)null,
                    overtimeAmount = showAmounts ? item!.OvertimeAmount : (decimal?)null,
                    adjustment = showAmounts ? item!.Adjustment : (decimal?)null,
                    adjustmentNote = showAmounts ? item!.AdjustmentNote : null,
                    totalAmount = showAmounts ? item!.TotalAmount : (decimal?)null,
                    expectedAmount = inForce?.MonthlySalary,
                    approvedAt = showAmounts ? item!.ApprovedAt : null,
                    paidAt = state == Paid ? item!.PaidAt : null,
                };
            }).ToList();

            // Received = months that were paid. Still to come = months that already started and were not paid (the payroll total when
            // known, otherwise the monthly salary the admin decided).
            var received = months.Where(m => m.status == Paid && m.totalAmount != null)
                .GroupBy(m => m.currency).Select(g => new { currency = g.Key, amount = g.Sum(m => m.totalAmount), months = g.Count() }).ToList();
            var pendingMonths = months.Where(m => m.status is Approved or Draft or NotProcessed).ToList();
            var pending = pendingMonths
                .GroupBy(m => m.currency).Select(g => new { currency = g.Key, amount = g.Sum(m => m.totalAmount ?? m.expectedAmount ?? 0m), months = g.Count() }).ToList();

            return new SalaryReport(
                y,
                years,
                current == null ? null : new { monthlySalary = current.MonthlySalary, currency = current.Currency, since = current.EffectiveFrom, notes = current.Notes },
                structures.Select(s => new { monthlySalary = s.MonthlySalary, currency = s.Currency, from = s.EffectiveFrom, to = s.EffectiveTo }).ToList(),
                months,
                new { paidMonths = months.Count(m => m.status == Paid), pendingMonths = pendingMonths.Count, received, pending });
        }

        /// <summary>For a list: how many months of the year were paid and how many are still unpaid, for several employees at once.</summary>
        public async Task<Dictionary<int, (int Paid, int Pending)>> CountsAsync(IReadOnlyCollection<int> employeeIds, int? year)
        {
            var today = Money.Today;
            var thisMonth = new DateOnly(today.Year, today.Month, 1);
            var y = Math.Clamp(year ?? today.Year, 2000, today.Year + 1);

            var starts = (await _db.SalaryStructures.AsNoTracking().Where(s => employeeIds.Contains(s.EmpId))
                    .Select(s => new { s.EmpId, s.EffectiveFrom }).ToListAsync())
                .GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.Min(s => new DateOnly(s.EffectiveFrom.Year, s.EffectiveFrom.Month, 1)));
            var statuses = (await (from i in _db.PayrollItems.AsNoTracking()
                                   join r in _db.PayrollRuns.AsNoTracking() on i.PayrollId equals r.PayrollId
                                   where r.PeriodYear == y && employeeIds.Contains(i.EmpId)
                                   select new { i.EmpId, r.PeriodMonth, r.Status }).ToListAsync())
                .ToDictionary(x => (x.EmpId, x.PeriodMonth), x => x.Status);

            var result = new Dictionary<int, (int Paid, int Pending)>();
            foreach (var id in employeeIds)
            {
                DateOnly? start = starts.TryGetValue(id, out var s) ? s : null;
                int paid = 0, pending = 0;
                for (var month = 1; month <= 12; month++)
                {
                    var state = StateOf(new DateOnly(y, month, 1), thisMonth, start, statuses.TryGetValue((id, month), out var status) ? status : null);
                    if (state == Paid) paid++;
                    else if (state is Approved or Draft or NotProcessed) pending++;
                }
                result[id] = (paid, pending);
            }
            return result;
        }
    }
}
