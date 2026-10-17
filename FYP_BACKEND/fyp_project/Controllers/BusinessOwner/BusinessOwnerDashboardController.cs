using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.BusinessOwnerPortal
{
    /// <summary>
    /// Business Owner portal: the dashboard figures and the employee list. Everything is read from what the other modules already hold, with the
    /// same meaning as in the Admin Finance page: revenue = payments received (Invoice_Payment, in PKR), expense = approved or paid payroll (in PKR),
    /// profit = revenue - expense (calculated, never stored); pending payment = issued invoices that are not fully paid. Read only.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "BusinessOwnerOnly")]
    [MissingMigrationFilter]
    [Route("api/business-owner")]
    public class BusinessOwnerDashboardController : ControllerBase
    {
        private static readonly string[] Periods = { "allTime", "thisMonth", "lastMonth", "thisYear" };
        private const int ActivityDays = 14;
        private const int MaxOrganizationsInChart = 10;

        private readonly WorkforceManagementDbContext _db;
        private readonly RoleService _roles;

        public BusinessOwnerDashboardController(WorkforceManagementDbContext db, RoleService roles)
        {
            _db = db;
            _roles = roles;
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                            ?? User.FindFirst("nameid")?.Value
                            ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        // GET api/business-owner/dashboard?period=allTime|thisMonth|lastMonth|thisYear
        [HttpGet("dashboard")]
        public async Task<IActionResult> Dashboard(string? period = null)
        {
            var me = CurrentUserId;
            if (!await _db.Users.AnyAsync(u => u.UserId == me && u.IsActive == true))
                return Unauthorized(new { message = "Account is inactive or no longer exists." });

            period = Periods.Contains(period) ? period! : "allTime";
            var today = Money.Today;

            // The period as dates (for payments) and as month numbers (year * 12 + month, for payroll).
            DateTime? from = null, to = null;
            int? monthFrom = null, monthTo = null;
            string label = "All time";
            switch (period)
            {
                case "thisMonth":
                    from = new DateTime(today.Year, today.Month, 1);
                    to = from.Value.AddMonths(1);
                    monthFrom = monthTo = today.Year * 12 + today.Month;
                    label = from.Value.ToString("MMMM yyyy");
                    break;
                case "lastMonth":
                    from = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
                    to = from.Value.AddMonths(1);
                    monthFrom = monthTo = from.Value.Year * 12 + from.Value.Month;
                    label = from.Value.ToString("MMMM yyyy");
                    break;
                case "thisYear":
                    from = new DateTime(today.Year, 1, 1);
                    to = from.Value.AddYears(1);
                    monthFrom = today.Year * 12 + 1;
                    monthTo = today.Year * 12 + 12;
                    label = today.Year.ToString();
                    break;
            }

            // ---- money
            var payments = _db.InvoicePayments.AsNoTracking().AsQueryable();
            if (from != null) payments = payments.Where(p => p.PaidAt >= from && p.PaidAt < to);
            var revenue = await payments.SumAsync(p => p.AmountPkr);

            var runs = _db.PayrollRuns.AsNoTracking().Where(r => r.Status == "Approved" || r.Status == "Paid");
            if (monthFrom != null) runs = runs.Where(r => r.PeriodYear * 12 + r.PeriodMonth >= monthFrom && r.PeriodYear * 12 + r.PeriodMonth <= monthTo);
            var expense = await runs.SumAsync(r => r.TotalPkr);
            var profit = revenue - expense;

            // ---- the owners who share the profit (equally; there is no ownership percentage in the system)
            var ownerRoleIds = await _roles.FindRoleIdsAsync(RoleNames.BusinessOwner);
            var owners = await _db.Users.AsNoTracking()
                .Where(u => u.IsActive == true && u.RoleId != null && ownerRoleIds.Contains(u.RoleId.Value))
                .OrderBy(u => u.Name).Select(u => new { u.UserId, u.Name, u.Email }).ToListAsync();
            var shares = new List<object>();
            if (owners.Count > 0)
            {
                var each = profit > 0 ? Math.Floor(profit / owners.Count * 100m) / 100m : 0m;
                var remainder = profit > 0 ? profit - each * owners.Count : 0m;   // the odd paisa goes to the first owner so the shares add up exactly
                for (var i = 0; i < owners.Count; i++)
                    shares.Add(new { userId = owners[i].UserId, fullName = owners[i].Name, email = owners[i].Email, sharePkr = each + (i == 0 ? remainder : 0m) });
            }

            // ---- pending payments (now, not tied to the period)
            var open = await _db.Invoices.AsNoTracking()
                .Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount)
                .Select(i => new { i.OrgId, OrgName = i.Org != null ? i.Org.OrgName : null, i.Currency, Balance = i.TotalAmount - i.PaidAmount, i.DueDate })
                .ToListAsync();
            var pending = open
                .GroupBy(i => new { i.OrgId, i.OrgName, i.Currency })
                .Select(g => new
                {
                    orgId = g.Key.OrgId,
                    orgName = g.Key.OrgName,
                    currency = g.Key.Currency,
                    invoices = g.Count(),
                    outstanding = g.Sum(i => i.Balance),
                    overdue = g.Where(i => i.DueDate != null && i.DueDate < today).Sum(i => i.Balance),
                })
                .OrderByDescending(r => r.overdue).ThenByDescending(r => r.outstanding).ThenBy(r => r.orgName)
                .ToList();
            var pendingTotals = open.GroupBy(i => i.Currency).Select(g => new { currency = g.Key, amount = g.Sum(i => i.Balance) }).OrderBy(x => x.currency).ToList();

            // ---- organizations and employees
            var orgStatuses = await _db.Organizations.AsNoTracking().GroupBy(o => o.Status).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync();
            var employeeTotal = await _db.Employees.CountAsync();
            var employeeActive = await _db.Employees.CountAsync(e => e.User!.IsActive == true);

            // ---- utilization and allocations now
            var openAllocations = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);
            var working = await _db.Employees.CountAsync(e => e.User!.IsActive == true && openAllocations.Any(a => a.EmployeeId == e.EmpId));
            var byOrganization = await openAllocations
                .Where(a => a.AssignOrgId != null && a.Employee!.User!.IsActive == true)
                .GroupBy(a => new { a.AssignOrgId, a.AssignOrg!.OrgName })
                .Select(g => new { orgId = g.Key.AssignOrgId, name = g.Key.OrgName, count = g.Select(a => a.EmployeeId).Distinct().Count() })
                .OrderByDescending(x => x.count).ThenBy(x => x.name)
                .ToListAsync();
            var chartOrganizations = byOrganization.Take(MaxOrganizationsInChart).ToList();
            var otherCount = byOrganization.Skip(MaxOrganizationsInChart).Sum(x => x.count);

            // ---- allocation activity of the last days (Allocation_History)
            var since = today.AddDays(-(ActivityDays - 1)).ToDateTime(TimeOnly.MinValue);
            var history = await _db.AllocationHistories.AsNoTracking()
                .Where(h => h.ActionTime != null && h.ActionTime >= since)
                .Select(h => new { Day = h.ActionTime!.Value.Date, h.ActionType })
                .ToListAsync();
            var activity = Enumerable.Range(0, ActivityDays).Select(offset =>
            {
                var day = today.AddDays(offset - (ActivityDays - 1));
                var rows = history.Where(h => DateOnly.FromDateTime(h.Day) == day).ToList();
                return new
                {
                    date = day,
                    allocated = rows.Count(h => h.ActionType == AllocationLogic.ActionAllocated),
                    reallocated = rows.Count(h => h.ActionType == AllocationLogic.ActionReallocated),
                    released = rows.Count(h => h.ActionType == AllocationLogic.ActionReleased),
                };
            }).ToList();

            return Ok(new
            {
                period,
                periodLabel = label,
                organizations = new { total = orgStatuses.Sum(s => s.count), byStatus = orgStatuses.OrderByDescending(s => s.count).Select(s => new { status = s.status ?? "Unknown", s.count }) },
                employees = new { total = employeeTotal, active = employeeActive, inactive = employeeTotal - employeeActive },
                money = new { revenuePkr = revenue, expensePkr = expense, profitPkr = profit },
                owners = new { count = owners.Count, shares },
                pendingPayments = new { totals = pendingTotals, byOrganization = pending },
                utilization = new
                {
                    activeEmployees = employeeActive,
                    working,
                    free = employeeActive - working,
                    percent = employeeActive == 0 ? 0 : Math.Round(working * 100m / employeeActive, 1),
                },
                allocationByOrganization = new { items = chartOrganizations, otherCount },
                allocationActivity = activity,
                updatedAt = DateTime.UtcNow,
            });
        }

        // GET api/business-owner/employees?status=active|inactive&search=&page=1&pageSize=10
        [HttpGet("employees")]
        public async Task<IActionResult> Employees(string? status, string? search, int page = 1, int pageSize = 10)
        {
            var me = CurrentUserId;
            if (!await _db.Users.AnyAsync(u => u.UserId == me && u.IsActive == true))
                return Unauthorized(new { message = "Account is inactive or no longer exists." });

            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);

            var query = _db.Employees.AsNoTracking().AsQueryable();
            if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase)) query = query.Where(e => e.User!.IsActive == true);
            else if (string.Equals(status, "inactive", StringComparison.OrdinalIgnoreCase)) query = query.Where(e => e.User!.IsActive != true);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e => (e.User!.Name != null && e.User.Name.Contains(term)) || (e.User.Email != null && e.User.Email.Contains(term)));
            }

            var total = await query.CountAsync();
            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);
            var items = await query.OrderBy(e => e.User!.Name).ThenBy(e => e.EmpId)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(e => new
                {
                    employeeId = e.EmpId,
                    userId = e.UserId,
                    hasPicture = e.User!.ProfilePicturePath != null,
                    fullName = e.User.Name,
                    email = e.User.Email,
                    isActive = e.User.IsActive == true,
                    availabilityStatus = e.AvailabilityStatus,
                    homeOrganization = e.Org != null ? e.Org.OrgName : null,
                    workingOrganization = open.Where(a => a.EmployeeId == e.EmpId && a.AssignOrgId != null).Select(a => a.AssignOrg!.OrgName).FirstOrDefault(),
                    joiningDate = e.JoiningDate,
                })
                .ToListAsync();

            var all = await _db.Employees.CountAsync();
            var active = await _db.Employees.CountAsync(e => e.User!.IsActive == true);
            return Ok(new { items, total, page, pageSize, counts = new { total = all, active, inactive = all - active } });
        }
    }
}
