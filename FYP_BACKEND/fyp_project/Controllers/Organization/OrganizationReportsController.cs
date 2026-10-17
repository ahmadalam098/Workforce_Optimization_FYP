using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>
    /// Organization portal: the organization's own report for a period - the employee-hours it used, day by day and employee by employee, its
    /// staff requests, what it was invoiced and paid month by month, and the reviews it gave. Only its own data; nothing about payroll or the
    /// company's profit. Dates are inclusive days (yyyy-MM-dd); the default is the last 30 days (the money part: the last 6 months).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/reports")]
    public class OrganizationReportsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public OrganizationReportsController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        // GET api/organization/reports/usage?from=&to=
        [HttpGet("usage")]
        public async Task<IActionResult> Usage(DateOnly? from, DateOnly? to)
        {
            var end = to ?? Money.Today;
            var start = from ?? end.AddDays(-29);
            if (start > end) return BadRequest(new { message = "The start date cannot be after the end date.", errors = new Dictionary<string, string[]> { ["from"] = new[] { "The start date cannot be after the end date." } } });
            if (end.DayNumber - start.DayNumber > 366) return BadRequest(new { message = "Choose a period of at most 366 days.", errors = new Dictionary<string, string[]> { ["to"] = new[] { "Choose a period of at most 366 days." } } });

            var orgId = OrgId;
            var windowStart = start.ToDateTime(TimeOnly.MinValue);
            var windowEnd = end.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var now = DateTime.UtcNow;
            if (windowEnd > now) windowEnd = now > windowStart ? now : windowStart;
            var periodHours = windowEnd > windowStart ? (decimal)(windowEnd - windowStart).TotalHours : 0m;

            var rows = await _db.EmployeeAllocations.AsNoTracking()
                .Where(a => a.AssignOrgId == orgId && a.EmployeeId != null && a.StartDatetime != null && a.StartDatetime < windowEnd
                            && (a.ActualEndDatetime == null || a.ActualEndDatetime > windowStart) && a.Status != "Cancelled")
                .Select(a => new { EmployeeId = a.EmployeeId!.Value, Start = a.StartDatetime!.Value, a.ActualEndDatetime, Name = a.Employee!.User!.Name })
                .ToListAsync();
            var intervals = rows.Select(r => new
            {
                r.EmployeeId, r.Name,
                Start = r.Start > windowStart ? r.Start : windowStart,
                End = r.ActualEndDatetime.HasValue && r.ActualEndDatetime.Value < windowEnd ? r.ActualEndDatetime.Value : windowEnd,
            }).Where(i => i.End > i.Start).ToList();

            var (hours, peak) = ReportService.Summarize(intervals.Select(i => new UsageInterval(i.Start, i.End)));
            var contract = await _db.Contracts.AsNoTracking().Where(c => c.OrgId == orgId && (c.Status == "Active" || c.Status == "Approved")).OrderByDescending(c => c.ContractId).FirstOrDefaultAsync();
            var average = periodHours > 0 ? Math.Round(hours / periodHours, 2) : 0m;

            var daily = new List<object>();
            for (var day = start; day <= end; day = day.AddDays(1))
            {
                var d0 = day.ToDateTime(TimeOnly.MinValue);
                var d1 = d0.AddDays(1);
                decimal h = 0;
                foreach (var i in intervals)
                {
                    var s = i.Start > d0 ? i.Start : d0;
                    var e = i.End < d1 ? i.End : d1;
                    if (e > s) h += (decimal)(e - s).TotalHours;
                }
                daily.Add(new { date = day, hours = Math.Round(h, 2) });
            }

            var ratings = await _db.OrganizationReviews.AsNoTracking().Where(r => r.OrgId == orgId).Select(r => new { r.EmpId, r.Ratings, r.ReviewDate }).ToListAsync();
            var employees = intervals.GroupBy(i => i.EmployeeId).Select(g => new
            {
                employeeId = g.Key,
                name = g.First().Name,
                hours = Math.Round(g.Sum(i => (decimal)(i.End - i.Start).TotalHours), 2),
                days = g.Select(i => i.Start.Date).Distinct().Count(),
                myRating = ratings.Where(r => r.EmpId == g.Key).OrderByDescending(r => r.ReviewDate).Select(r => r.Ratings).FirstOrDefault(),
            }).OrderByDescending(e => e.hours).ToList();

            var requests = await _db.WorkforceRequests.AsNoTracking()
                .Where(r => r.OrgId == orgId && r.CreatedAt >= windowStart && r.CreatedAt < start.AddDays(1 + (end.DayNumber - start.DayNumber)).ToDateTime(TimeOnly.MinValue))
                .Select(r => new { r.Status, Required = r.RequiredEmployees ?? 0 }).ToListAsync();
            var inPeriod = ratings.Where(r => r.ReviewDate >= windowStart && r.ReviewDate < end.AddDays(1).ToDateTime(TimeOnly.MinValue)).ToList();

            return Ok(new
            {
                from = start, to = end,
                staffing = new
                {
                    employeeHours = hours, periodHours = Math.Round(periodHours, 2), avgConcurrent = average, peakConcurrent = peak,
                    employeesWorked = employees.Count,
                    contractMin = contract?.MinEmployees, contractMax = contract?.MaxEmployees,
                    utilizationPct = contract?.MaxEmployees is > 0 ? Math.Round(average / contract.MaxEmployees.Value * 100, 1, MidpointRounding.AwayFromZero) : (decimal?)null,
                },
                daily,
                employees,
                requests = new
                {
                    total = requests.Count,
                    approved = requests.Count(r => r.Status == "Approved"),
                    rejected = requests.Count(r => r.Status == "Rejected"),
                    pending = requests.Count(r => r.Status == "Pending"),
                    cancelled = requests.Count(r => r.Status == "Cancelled"),
                    employeesAsked = requests.Sum(r => r.Required),
                },
                reviews = new { count = inPeriod.Count, average = inPeriod.Count == 0 ? (decimal?)null : Math.Round(inPeriod.Where(r => r.Ratings != null).Average(r => r.Ratings!.Value), 2), bad = inPeriod.Count(r => EmployeeReviewLogic.IsBad(r.Ratings)) },
            });
        }

        // GET api/organization/reports/financial?from=&to=   (month by month; default = the last 6 months)
        [HttpGet("financial")]
        public async Task<IActionResult> Financial(DateOnly? from, DateOnly? to)
        {
            var end = to ?? Money.Today;
            var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-5);
            if (start > end) return BadRequest(new { message = "The start date cannot be after the end date.", errors = new Dictionary<string, string[]> { ["from"] = new[] { "The start date cannot be after the end date." } } });
            if ((end.Year - start.Year) * 12 + end.Month - start.Month >= 24) return BadRequest(new { message = "Choose a period of at most 24 months.", errors = new Dictionary<string, string[]> { ["to"] = new[] { "Choose a period of at most 24 months." } } });

            var orgId = OrgId;
            var firstMonth = new DateOnly(start.Year, start.Month, 1);
            var lastMonth = new DateOnly(end.Year, end.Month, 1);
            var rangeStart = firstMonth.ToDateTime(TimeOnly.MinValue);
            var rangeEnd = lastMonth.AddMonths(1).ToDateTime(TimeOnly.MinValue);
            var today = Money.Today;

            var invoices = await _db.Invoices.AsNoTracking()
                .Where(i => i.OrgId == orgId && (i.Status == "Issued" || i.Status == "Paid") && i.IssueDate != null && i.IssueDate >= firstMonth && i.IssueDate < lastMonth.AddMonths(1))
                .Select(i => new { IssueDate = i.IssueDate!.Value, i.Currency, i.TotalAmount }).ToListAsync();
            var payments = await _db.InvoicePayments.AsNoTracking()
                .Where(p => p.PaidAt >= rangeStart && p.PaidAt < rangeEnd && _db.Invoices.Any(i => i.InvoiceId == p.InvoiceId && i.OrgId == orgId && i.Status != "Draft"))
                .Select(p => new { p.PaidAt, p.Currency, p.Amount }).ToListAsync();

            var months = new List<object>();
            for (var m = firstMonth; m <= lastMonth; m = m.AddMonths(1))
            {
                months.Add(new
                {
                    year = m.Year, month = m.Month,
                    invoiced = invoices.Where(i => i.IssueDate.Year == m.Year && i.IssueDate.Month == m.Month).GroupBy(i => i.Currency).Select(g => new { currency = g.Key, amount = g.Sum(i => i.TotalAmount) }).ToList(),
                    paid = payments.Where(p => p.PaidAt.Year == m.Year && p.PaidAt.Month == m.Month).GroupBy(p => p.Currency).Select(g => new { currency = g.Key, amount = g.Sum(p => p.Amount) }).ToList(),
                });
            }

            var open = await _db.Invoices.AsNoTracking().Where(i => i.OrgId == orgId && i.Status == "Issued" && i.PaidAmount < i.TotalAmount)
                .Select(i => new { i.Currency, i.TotalAmount, i.PaidAmount, i.DueDate }).ToListAsync();
            return Ok(new
            {
                from = start, to = end,
                totalInvoiced = invoices.GroupBy(i => i.Currency).Select(g => new { currency = g.Key, amount = g.Sum(i => i.TotalAmount) }).ToList(),
                totalPaid = payments.GroupBy(p => p.Currency).Select(g => new { currency = g.Key, amount = g.Sum(p => p.Amount) }).ToList(),
                outstanding = open.GroupBy(i => i.Currency).Select(g => new { currency = g.Key, amount = g.Sum(i => i.TotalAmount - i.PaidAmount) }).ToList(),
                overdue = open.Where(i => i.DueDate != null && i.DueDate < today).GroupBy(i => i.Currency).Select(g => new { currency = g.Key, amount = g.Sum(i => i.TotalAmount - i.PaidAmount) }).ToList(),
                months,
            });
        }
    }
}
