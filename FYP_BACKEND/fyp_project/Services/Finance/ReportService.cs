using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>System-wide reports: utilization, allocation and financial. Read-only; everything is calculated from the live tables.</summary>
    public class ReportService
    {
        private readonly WorkforceManagementDbContext _db;
        public ReportService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        /// <summary>[from 00:00, to + 1 day 00:00), cut at "now" when the period is still running.</summary>
        private static (DateTime start, DateTime endExclusive) Window(DateOnly from, DateOnly to)
        {
            var start = from.ToDateTime(TimeOnly.MinValue);
            var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var now = DateTime.UtcNow;
            return (start, end > now ? (now > start ? now : start) : end);
        }

        /// <summary>Total employee-hours and the most employees on duty at the same time.</summary>
        public static (decimal hours, int peak) Summarize(IEnumerable<UsageInterval> intervals)
        {
            var events = new List<(DateTime time, int delta)>();
            decimal hours = 0;
            foreach (var interval in intervals)
            {
                if (interval.End <= interval.Start) continue;
                hours += (decimal)(interval.End - interval.Start).TotalHours;
                events.Add((interval.Start, +1));
                events.Add((interval.End, -1));
            }

            // Ends are processed before starts at the same instant, so back-to-back shifts do not look like an overlap.
            events.Sort((a, b) => a.time != b.time ? a.time.CompareTo(b.time) : a.delta.CompareTo(b.delta));

            int current = 0, peak = 0;
            foreach (var (_, delta) in events)
            {
                current += delta;
                if (current > peak) peak = current;
            }

            return (Math.Round(hours, 2), peak);
        }

        // ---------------------------------------------------------------- utilization

        public async Task<UtilizationReportDto> UtilizationAsync(DateOnly from, DateOnly to)
        {
            var (start, end) = Window(from, to);
            var periodHours = end > start ? (decimal)(end - start).TotalHours : 0m;

            var rows = await _db.EmployeeAllocations
                .AsNoTracking()
                .Where(a => a.AssignOrgId != null && a.StartDatetime != null
                            && a.StartDatetime < end
                            && (a.ActualEndDatetime == null || a.ActualEndDatetime > start)
                            && a.Status != "Cancelled")
                .Select(a => new { OrgId = a.AssignOrgId!.Value, a.EmployeeId, Start = a.StartDatetime!.Value, a.ActualEndDatetime })
                .ToListAsync();

            var activeOrgs = await _db.Organizations
                .AsNoTracking()
                .Where(o => o.Status == "Active" || o.Status == "Approved")
                .Select(o => new { o.OrgId, o.OrgName })
                .ToListAsync();

            var orgIds = rows.Select(r => r.OrgId).Union(activeOrgs.Select(o => o.OrgId)).Distinct().ToList();
            var names = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);

            var contracts = (await _db.Contracts
                    .AsNoTracking()
                    .Where(c => c.OrgId != null && orgIds.Contains(c.OrgId.Value) && (c.Status == "Active" || c.Status == "Approved"))
                    .ToListAsync())
                .GroupBy(c => c.OrgId!.Value)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(c => c.ContractId).First());

            var organizations = new List<UtilizationOrgDto>();
            foreach (var orgId in orgIds)
            {
                var intervals = rows
                    .Where(r => r.OrgId == orgId)
                    .Select(r =>
                    {
                        var s = r.Start > start ? r.Start : start;
                        var e = r.ActualEndDatetime.HasValue && r.ActualEndDatetime.Value < end ? r.ActualEndDatetime.Value : end;
                        return new UsageInterval(s, e);
                    })
                    .Where(i => i.End > i.Start)
                    .ToList();

                var (hours, peak) = Summarize(intervals);
                var average = periodHours > 0 ? Math.Round(hours / periodHours, 2) : 0m;
                contracts.TryGetValue(orgId, out var contract);

                organizations.Add(new UtilizationOrgDto
                {
                    OrgId = orgId,
                    OrgName = names.GetValueOrDefault(orgId),
                    Employees = rows.Where(r => r.OrgId == orgId && r.EmployeeId != null).Select(r => r.EmployeeId).Distinct().Count(),
                    EmployeeHours = hours,
                    PeakConcurrent = peak,
                    AvgConcurrent = average,
                    ContractMin = contract?.MinEmployees,
                    ContractMax = contract?.MaxEmployees,
                    UtilizationPct = contract?.MaxEmployees is > 0 ? Math.Round(average / contract.MaxEmployees.Value * 100, 1, MidpointRounding.AwayFromZero) : null,
                });
            }

            var active = await _db.Employees.CountAsync(e => e.User!.IsActive == true);
            var allocatedNow = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Where(a => a.EmployeeId != null).Select(a => a.EmployeeId).Distinct().CountAsync();
            var byStatus = await _db.Employees
                .Where(e => e.User!.IsActive == true)
                .GroupBy(e => e.AvailabilityStatus)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .ToListAsync();

            return new UtilizationReportDto
            {
                From = from,
                To = to,
                PeriodHours = Math.Round(periodHours, 2),
                TotalEmployeeHours = organizations.Sum(o => o.EmployeeHours),
                Snapshot = new WorkforceSnapshotDto
                {
                    ActiveEmployees = active,
                    AllocatedNow = allocatedNow,
                    AvailableNow = byStatus.Where(s => s.Status == "Available").Sum(s => s.Count),
                    AllocationRatePct = active > 0 ? Math.Round((decimal)allocatedNow / active * 100, 1, MidpointRounding.AwayFromZero) : 0,
                    ByStatus = byStatus.Select(s => new StatusCountDto { Status = s.Status ?? "Unknown", Count = s.Count }).ToList(),
                },
                Organizations = organizations.OrderByDescending(o => o.EmployeeHours).ThenBy(o => o.OrgName).ToList(),
            };
        }

        // ---------------------------------------------------------------- allocation

        public async Task<AllocationReportDto> AllocationAsync(DateOnly from, DateOnly to)
        {
            var start = from.ToDateTime(TimeOnly.MinValue);
            var endExclusive = to.AddDays(1).ToDateTime(TimeOnly.MinValue);

            var history = _db.AllocationHistories.AsNoTracking().Where(h => h.ActionTime >= start && h.ActionTime < endExclusive);

            var byAction = await history
                .GroupBy(h => h.ActionType)
                .Select(g => new { Action = g.Key, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .ToListAsync();

            var ai = await history.CountAsync(h => h.IsAllocatedByAi == true);
            var total = byAction.Sum(a => a.Count);
            var overrides = await history.CountAsync(h => h.ActionReason != null && h.ActionReason.StartsWith("[OVERRIDE]"));

            var moves = await history
                .Where(h => h.ActionType == "Allocated" || h.ActionType == "Reallocated" || h.ActionType == "Released")
                .Select(h => new { h.ActionType, h.FromOrgId, h.ToOrgId })
                .ToListAsync();

            var orgIds = moves.SelectMany(m => new[] { m.FromOrgId, m.ToOrgId }).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();
            var names = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);

            var byOrg = orgIds
                .Select(id => new AllocationOrgDto
                {
                    OrgId = id,
                    OrgName = names.GetValueOrDefault(id),
                    Received = moves.Count(m => m.ToOrgId == id && (m.ActionType == "Allocated" || m.ActionType == "Reallocated")),
                    Lost = moves.Count(m => m.FromOrgId == id && (m.ActionType == "Reallocated" || m.ActionType == "Released")),
                })
                .OrderByDescending(o => o.Received + o.Lost)
                .ToList();

            var daily = await history
                .Where(h => h.ActionTime != null)
                .GroupBy(h => h.ActionTime!.Value.Date)
                .Select(g => new { Day = g.Key, Count = g.Count() })
                .OrderBy(x => x.Day)
                .ToListAsync();

            var started = _db.EmployeeAllocations.AsNoTracking().Where(a => a.StartDatetime >= start && a.StartDatetime < endExclusive);

            return new AllocationReportDto
            {
                From = from,
                To = to,
                TotalEvents = total,
                AiCount = ai,
                ManualCount = total - ai,
                Overrides = overrides,
                StartedNormal = await started.CountAsync(a => a.AllocationType == AllocationLogic.Normal),
                StartedTemporary = await started.CountAsync(a => a.AllocationType == AllocationLogic.Temporary),
                ByAction = byAction.Select(a => new ActionCountDto { Action = a.Action ?? "Unknown", Count = a.Count }).ToList(),
                ByOrganization = byOrg,
                Daily = daily.Select(d => new DailyCountDto { Date = DateOnly.FromDateTime(d.Day), Count = d.Count }).ToList(),
            };
        }

        // ---------------------------------------------------------------- receivables (who owes what, and for how long)

        /// <summary>
        /// What organizations still owe on issued invoices, by how late it is (from the due date): not due yet, 1-30, 31-60, 61-90 and over 90 days.
        /// One row per organization and currency, so nothing is added across currencies. <paramref name="orgIds"/> limits it to a manager's organizations.
        /// </summary>
        public async Task<object> ReceivablesAsync(DateOnly asOf, IReadOnlyCollection<int>? orgIds = null)
        {
            var query = _db.Invoices.AsNoTracking().Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount);
            if (orgIds != null) query = query.Where(i => orgIds.Contains(i.OrgId));
            var open = await query.Select(i => new { i.InvoiceId, i.InvoiceNumber, i.OrgId, OrgName = i.Org != null ? i.Org.OrgName : null, i.Currency, Balance = i.TotalAmount - i.PaidAmount, i.DueDate }).ToListAsync();

            static int Bucket(DateOnly? due, DateOnly day)
            {
                if (due == null || due >= day) return 0;
                var late = day.DayNumber - due.Value.DayNumber;
                return late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
            }

            object Row(IEnumerable<dynamic> items, string currency, int? orgId, string? orgName)
            {
                var sums = new decimal[5];
                var list = items.ToList();
                foreach (var i in list) sums[Bucket((DateOnly?)i.DueDate, asOf)] += (decimal)i.Balance;
                return new { orgId, orgName, currency, notDue = sums[0], late1to30 = sums[1], late31to60 = sums[2], late61to90 = sums[3], over90 = sums[4], total = sums.Sum(), invoices = list.Count };
            }

            var byOrg = open.GroupBy(i => new { i.OrgId, i.OrgName, i.Currency }).OrderBy(g => g.Key.OrgName).ThenBy(g => g.Key.Currency)
                .Select(g => Row(g.Cast<dynamic>(), g.Key.Currency, g.Key.OrgId, g.Key.OrgName)).ToList();
            var totals = open.GroupBy(i => i.Currency).OrderBy(g => g.Key).Select(g => Row(g.Cast<dynamic>(), g.Key, null, null)).ToList();
            var invoices = open.Where(i => Bucket(i.DueDate, asOf) > 0).OrderBy(i => i.DueDate)
                .Select(i => new { i.InvoiceId, i.InvoiceNumber, i.OrgName, i.Currency, balance = i.Balance, dueDate = i.DueDate, daysLate = asOf.DayNumber - i.DueDate!.Value.DayNumber }).Take(200).ToList();
            return new { asOf, byOrganization = byOrg, totals, overdueInvoices = invoices };
        }

        // ---------------------------------------------------------------- financial

        public async Task<FinancialReportDto> FinancialAsync(DateOnly from, DateOnly to)
        {
            var firstMonth = new DateOnly(from.Year, from.Month, 1);
            var lastMonth = new DateOnly(to.Year, to.Month, 1);
            var rangeStart = firstMonth.ToDateTime(TimeOnly.MinValue);
            var rangeEnd = lastMonth.AddMonths(1).ToDateTime(TimeOnly.MinValue);
            var today = Money.Today;

            var issued = await _db.Invoices
                .AsNoTracking()
                .Where(i => (i.Status == "Issued" || i.Status == "Paid") && i.IssueDate != null
                            && i.IssueDate >= firstMonth && i.IssueDate < lastMonth.AddMonths(1))
                .Select(i => new { i.InvoiceId, i.OrgId, IssueDate = i.IssueDate!.Value, i.Currency, i.TotalAmount })
                .ToListAsync();

            var payments = await _db.InvoicePayments
                .AsNoTracking()
                .Where(p => p.PaidAt >= rangeStart && p.PaidAt < rangeEnd)
                .Select(p => new { p.InvoiceId, p.PaidAt, p.AmountPkr })
                .ToListAsync();

            var invoiceOrg = await _db.Invoices
                .AsNoTracking()
                .Where(i => payments.Select(p => p.InvoiceId).Distinct().Contains(i.InvoiceId))
                .Select(i => new { i.InvoiceId, i.OrgId })
                .ToDictionaryAsync(i => i.InvoiceId, i => i.OrgId);

            var payroll = await _db.PayrollRuns
                .AsNoTracking()
                .Where(r => (r.Status == "Approved" || r.Status == "Paid")
                            && (r.PeriodYear * 12 + r.PeriodMonth) >= (firstMonth.Year * 12 + firstMonth.Month)
                            && (r.PeriodYear * 12 + r.PeriodMonth) <= (lastMonth.Year * 12 + lastMonth.Month))
                .Select(r => new { r.PeriodYear, r.PeriodMonth, r.TotalPkr })
                .ToListAsync();

            var months = new List<FinancialMonthDto>();
            for (var cursor = firstMonth; cursor <= lastMonth; cursor = cursor.AddMonths(1))
            {
                var collected = payments.Where(p => p.PaidAt.Year == cursor.Year && p.PaidAt.Month == cursor.Month).Sum(p => p.AmountPkr);
                var cost = payroll.Where(r => r.PeriodYear == cursor.Year && r.PeriodMonth == cursor.Month).Sum(r => r.TotalPkr);

                months.Add(new FinancialMonthDto
                {
                    Year = cursor.Year,
                    Month = cursor.Month,
                    Invoiced = issued
                        .Where(i => i.IssueDate.Year == cursor.Year && i.IssueDate.Month == cursor.Month)
                        .GroupBy(i => i.Currency)
                        .Select(g => new CurrencyAmountDto { Currency = g.Key, Amount = g.Sum(i => i.TotalAmount) })
                        .ToList(),
                    CollectedPkr = collected,
                    PayrollPkr = cost,
                    ProfitPkr = collected - cost,
                });
            }

            var orgIds = payments.Select(p => invoiceOrg.GetValueOrDefault(p.InvoiceId)).Concat(issued.Select(i => i.OrgId)).Distinct().ToList();
            var names = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);

            var byOrg = orgIds
                .Select(id => new FinancialOrgDto
                {
                    OrgId = id,
                    OrgName = names.GetValueOrDefault(id),
                    CollectedPkr = payments.Where(p => invoiceOrg.GetValueOrDefault(p.InvoiceId) == id).Sum(p => p.AmountPkr),
                    InvoicesIssued = issued.Count(i => i.OrgId == id),
                })
                .OrderByDescending(o => o.CollectedPkr)
                .ThenBy(o => o.OrgName)
                .ToList();

            var open = await _db.Invoices
                .AsNoTracking()
                .Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount)
                .Select(i => new { i.Currency, Balance = i.TotalAmount - i.PaidAmount, i.DueDate })
                .ToListAsync();

            var totalCollected = months.Sum(m => m.CollectedPkr);
            var totalPayroll = months.Sum(m => m.PayrollPkr);

            return new FinancialReportDto
            {
                From = from,
                To = to,
                TotalCollectedPkr = totalCollected,
                TotalPayrollPkr = totalPayroll,
                TotalProfitPkr = totalCollected - totalPayroll,
                Outstanding = open.GroupBy(o => o.Currency).Select(g => new CurrencyAmountDto { Currency = g.Key, Amount = g.Sum(o => o.Balance) }).ToList(),
                Overdue = open.Where(o => o.DueDate.HasValue && o.DueDate.Value < today)
                    .GroupBy(o => o.Currency).Select(g => new CurrencyAmountDto { Currency = g.Key, Amount = g.Sum(o => o.Balance) }).ToList(),
                Months = months,
                ByOrganization = byOrg,
            };
        }
    }
}
