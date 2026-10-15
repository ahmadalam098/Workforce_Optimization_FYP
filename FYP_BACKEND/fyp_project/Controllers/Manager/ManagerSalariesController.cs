using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>
    /// Organization Manager portal: the salary status of the employees who work for the manager's organizations - the monthly salary and, for
    /// a month, whether it is still being prepared, approved, or paid (from the admin's payroll). Read only. Only the manager's own employees
    /// are covered: an employee who works for one of their organizations now (open allocation), or, when free, belongs to one.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/salaries")]
    public class ManagerSalariesController : ControllerBase
    {
        public const string Paid = "Paid";
        public const string Approved = "Approved";
        public const string Draft = "Draft";
        public const string NotProcessed = "NotProcessed";

        private readonly WorkforceManagementDbContext _db;

        public ManagerSalariesController(WorkforceManagementDbContext db)
        {
            _db = db;
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

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.OrgId != null)
                .Select(m => m.OrgId!.Value)
                .ToListAsync();
        }

        /// <summary>The manager's employees with the organization each one is in (where they work now, otherwise their home organization).</summary>
        private async Task<List<(int EmployeeId, int? UserId, string? Name, bool HasPicture, int? OrgId)>> MyEmployeesAsync(List<int> orgIds)
        {
            var open = _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);
            var rows = await _db.Employees.AsNoTracking()
                .Where(e => e.User!.IsActive == true &&
                    (open.Any(a => a.EmployeeId == e.EmpId && a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value)) ||
                     (e.OrgId != null && orgIds.Contains(e.OrgId.Value) && !open.Any(a => a.EmployeeId == e.EmpId))))
                .OrderBy(e => e.User!.Name)
                .Select(e => new
                {
                    e.EmpId,
                    e.UserId,
                    e.User!.Name,
                    HasPicture = e.User.ProfilePicturePath != null,
                    OrgId = open.Where(a => a.EmployeeId == e.EmpId).Select(a => a.AssignOrgId).FirstOrDefault() ?? e.OrgId,
                })
                .ToListAsync();
            return rows.Select(r => (r.EmpId, r.UserId, r.Name, r.HasPicture, r.OrgId)).ToList();
        }

        private static string Label(string status) => status switch
        {
            Paid => "Paid",
            Approved => "Approved, waiting to be paid",
            Draft => "Being prepared",
            _ => "Not processed yet",
        };

        // GET api/manager/salaries?year=&month=&search=&organizationId=&status=Paid|Approved|Draft|NotProcessed&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(int? year, int? month, string? search, int? organizationId, string? status, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var today = Money.Today;
            var y = year ?? today.Year;
            var m = Math.Clamp(month ?? today.Month, 1, 12);

            var orgIds = await MyOrganizationIdsAsync();
            if (organizationId.HasValue && !orgIds.Contains(organizationId.Value))
                return StatusCode(403, new { message = "You can only see the organizations you manage." });

            var employees = await MyEmployeesAsync(orgIds);
            if (organizationId.HasValue) employees = employees.Where(e => e.OrgId == organizationId.Value).ToList();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                employees = employees.Where(e => e.Name != null && e.Name.Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
            }

            var ids = employees.Select(e => e.EmployeeId).ToList();
            var salaries = (await _db.SalaryStructures.AsNoTracking().Where(s => s.EffectiveTo == null && ids.Contains(s.EmpId))
                .Select(s => new { s.EmpId, s.MonthlySalary, s.Currency, s.EffectiveFrom }).ToListAsync())
                .GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.EffectiveFrom).First());
            var payroll = (await (from i in _db.PayrollItems.AsNoTracking()
                                  join r in _db.PayrollRuns.AsNoTracking() on i.PayrollId equals r.PayrollId
                                  where r.PeriodYear == y && r.PeriodMonth == m && ids.Contains(i.EmpId)
                                  select new { i.EmpId, i.Currency, i.BaseSalary, i.OvertimeAmount, i.Adjustment, i.TotalAmount, r.Status, r.PaidAt }).ToListAsync())
                .GroupBy(x => x.EmpId).ToDictionary(g => g.Key, g => g.First());
            var orgNames = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);

            var all = employees.Select(e =>
            {
                salaries.TryGetValue(e.EmployeeId, out var salary);
                payroll.TryGetValue(e.EmployeeId, out var item);
                var state = item == null ? NotProcessed : item.Status;
                return new
                {
                    employeeId = e.EmployeeId,
                    userId = e.UserId,
                    hasPicture = e.HasPicture,
                    fullName = e.Name,
                    orgId = e.OrgId,
                    orgName = e.OrgId.HasValue ? orgNames.GetValueOrDefault(e.OrgId.Value) : null,
                    monthlySalary = salary?.MonthlySalary,
                    salaryCurrency = salary?.Currency,
                    status = state,
                    statusLabel = Label(state),
                    baseSalary = item?.BaseSalary,
                    overtimeAmount = item?.OvertimeAmount,
                    adjustment = item?.Adjustment,
                    totalAmount = item?.TotalAmount,
                    payrollCurrency = item?.Currency,
                    paidAt = item?.PaidAt,
                };
            }).ToList();

            var summary = new
            {
                year = y,
                month = m,
                totalEmployees = all.Count,
                paid = all.Count(a => a.status == Paid),
                approved = all.Count(a => a.status == Approved),
                draft = all.Count(a => a.status == Draft),
                notProcessed = all.Count(a => a.status == NotProcessed),
                withoutSalary = all.Count(a => a.monthlySalary == null),
                amounts = all.Where(a => a.totalAmount != null).GroupBy(a => a.payrollCurrency).Select(g => new
                {
                    currency = g.Key,
                    paid = g.Where(a => a.status == Paid).Sum(a => a.totalAmount),
                    toPay = g.Where(a => a.status != Paid).Sum(a => a.totalAmount),
                }).OrderBy(a => a.currency).ToList(),
            };

            var filtered = string.IsNullOrWhiteSpace(status) ? all : all.Where(a => a.status == status).ToList();
            var items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Ok(new { items, total = filtered.Count, page, pageSize, summary });
        }

        // GET api/manager/salaries/employees/5   (the last 12 months of one of my employees)
        [HttpGet("employees/{employeeId:int}")]
        public async Task<IActionResult> Employee(int employeeId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var mine = (await MyEmployeesAsync(orgIds)).FirstOrDefault(e => e.EmployeeId == employeeId);
            if (mine.EmployeeId == 0) return NotFound(new { message = "Employee not found." });

            var salary = await _db.SalaryStructures.AsNoTracking().Where(s => s.EmpId == employeeId && s.EffectiveTo == null)
                .OrderByDescending(s => s.EffectiveFrom).Select(s => new { s.MonthlySalary, s.Currency, s.EffectiveFrom }).FirstOrDefaultAsync();

            var today = Money.Today;
            var firstMonth = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
            var rows = await (from i in _db.PayrollItems.AsNoTracking()
                              join r in _db.PayrollRuns.AsNoTracking() on i.PayrollId equals r.PayrollId
                              where i.EmpId == employeeId && (r.PeriodYear > firstMonth.Year || (r.PeriodYear == firstMonth.Year && r.PeriodMonth >= firstMonth.Month))
                              orderby r.PeriodYear descending, r.PeriodMonth descending
                              select new { r.PeriodYear, r.PeriodMonth, r.Status, r.PaidAt, i.Currency, i.BaseSalary, i.OvertimeAmount, i.Adjustment, i.TotalAmount })
                .ToListAsync();

            var months = Enumerable.Range(0, 12).Select(offset =>
            {
                var date = new DateOnly(today.Year, today.Month, 1).AddMonths(-offset);
                var row = rows.FirstOrDefault(r => r.PeriodYear == date.Year && r.PeriodMonth == date.Month);
                var state = row?.Status ?? NotProcessed;
                return new
                {
                    year = date.Year,
                    month = date.Month,
                    status = state,
                    statusLabel = Label(state),
                    currency = row?.Currency,
                    baseSalary = row?.BaseSalary,
                    overtimeAmount = row?.OvertimeAmount,
                    adjustment = row?.Adjustment,
                    totalAmount = row?.TotalAmount,
                    paidAt = row?.PaidAt,
                };
            }).ToList();

            return Ok(new
            {
                employeeId,
                fullName = mine.Name,
                monthlySalary = salary?.MonthlySalary,
                currency = salary?.Currency,
                since = salary?.EffectiveFrom,
                months,
            });
        }
    }
}
