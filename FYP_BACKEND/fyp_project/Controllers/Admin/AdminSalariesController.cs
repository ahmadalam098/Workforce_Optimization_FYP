using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: what each employee is paid (monthly salary) and which months were paid or are still to be paid. Changes are dated, history is kept.</summary>
    [Route("api/admin/salaries")]
    public class AdminSalariesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly SalaryReportService _report;
        private readonly AuditService _audit;

        public AdminSalariesController(WorkforceManagementDbContext db, SalaryReportService report, AuditService audit)
        {
            _db = db;
            _report = report;
            _audit = audit;
        }

        // GET api/admin/salaries?search=&organizationId=&hasSalary=&year=&page=1&pageSize=10   (active employees, with the months paid and unpaid in the year)
        [HttpGet]
        public async Task<IActionResult> List(string? search, int? organizationId, bool? hasSalary, int? year, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Employees.AsNoTracking().Where(e => e.User!.IsActive == true);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e =>
                    (e.User!.Name != null && e.User.Name.Contains(term)) ||
                    (e.User.Email != null && e.User.Email.Contains(term)));
            }

            if (organizationId.HasValue) query = query.Where(e => e.OrgId == organizationId.Value);

            if (hasSalary == true)
                query = query.Where(e => _db.SalaryStructures.Any(s => s.EmpId == e.EmpId && s.EffectiveTo == null));
            else if (hasSalary == false)
                query = query.Where(e => !_db.SalaryStructures.Any(s => s.EmpId == e.EmpId && s.EffectiveTo == null));

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(e => e.User!.Name)
                .ThenBy(e => e.EmpId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(e => new SalaryListItemDto
                {
                    UserId = e.UserId,
                    HasPicture = e.User!.ProfilePicturePath != null,
                    EmployeeId = e.EmpId,
                    FullName = e.User!.Name,
                    Email = e.User.Email,
                    OrganizationName = e.Org != null ? e.Org.OrgName : null,
                })
                .ToListAsync();

            var ids = items.Select(i => i.EmployeeId).ToList();
            var current = await _db.SalaryStructures
                .AsNoTracking()
                .Where(s => ids.Contains(s.EmpId) && s.EffectiveTo == null)
                .ToListAsync();

            foreach (var item in items)
            {
                var structure = current.Where(s => s.EmpId == item.EmployeeId).OrderByDescending(s => s.EffectiveFrom).FirstOrDefault();
                if (structure == null) continue;

                item.StructureId = structure.StructureId;
                item.MonthlySalary = structure.MonthlySalary;
                item.Currency = structure.Currency;
                item.EffectiveFrom = structure.EffectiveFrom;
            }

            var counts = await _report.CountsAsync(ids, year);
            foreach (var item in items)
            {
                if (item.MonthlySalary == null || !counts.TryGetValue(item.EmployeeId, out var c)) continue;
                item.PaidMonths = c.Paid;
                item.PendingMonths = c.Pending;
            }

            return Ok(new PagedResult<SalaryListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/salaries/5/history
        [HttpGet("{employeeId:int}/history")]
        public async Task<IActionResult> History(int employeeId)
        {
            if (!await _db.Employees.AnyAsync(e => e.EmpId == employeeId)) return NotFoundMessage("Employee not found.");

            var rows = await _db.SalaryStructures
                .AsNoTracking()
                .Where(s => s.EmpId == employeeId)
                .OrderByDescending(s => s.EffectiveFrom)
                .ThenByDescending(s => s.StructureId)
                .ToListAsync();

            var userIds = rows.Where(r => r.CreatedBy.HasValue).Select(r => r.CreatedBy!.Value).Distinct().ToList();
            var names = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);

            var result = new List<SalaryStructureDto>();
            foreach (var row in rows)
            {
                result.Add(new SalaryStructureDto
                {
                    StructureId = row.StructureId,
                    MonthlySalary = row.MonthlySalary,
                    Currency = row.Currency,
                    EffectiveFrom = row.EffectiveFrom,
                    EffectiveTo = row.EffectiveTo,
                    Notes = row.Notes,
                    CreatedBy = row.CreatedBy.HasValue ? names.GetValueOrDefault(row.CreatedBy.Value) : null,
                    CreatedAt = row.CreatedAt,
                });
            }

            return Ok(result);
        }

        // GET api/admin/salaries/5/months?year=   (month by month: paid, approved, being prepared, not processed - what is left to pay)
        [HttpGet("{employeeId:int}/months")]
        public async Task<IActionResult> Months(int employeeId, int? year)
        {
            var name = await _db.Employees.AsNoTracking().Where(e => e.EmpId == employeeId).Select(e => e.User!.Name).FirstOrDefaultAsync();
            if (name == null && !await _db.Employees.AnyAsync(e => e.EmpId == employeeId)) return NotFoundMessage("Employee not found.");

            var r = await _report.BuildAsync(employeeId, year, showDraftAmounts: true);
            return Ok(new { employeeId, fullName = name, r.Year, r.Years, r.CurrentSalary, r.History, r.Months, r.Summary });
        }

        // POST api/admin/salaries/5   (sets a new salary; the current one ends the day before)
        [HttpPost("{employeeId:int}")]
        public async Task<IActionResult> Set(int employeeId, [FromBody] SaveSalaryRequest request)
        {
            var currency = request.Currency.Trim().ToUpperInvariant();
            if (currency.Length != 3 || !currency.All(char.IsLetter))
                return FieldError("currency", "Currency must be a 3-letter code such as PKR or USD.");

            var employeeName = await _db.Employees.Where(e => e.EmpId == employeeId).Select(e => e.User!.Name).FirstOrDefaultAsync();
            if (employeeName == null && !await _db.Employees.AnyAsync(e => e.EmpId == employeeId))
                return NotFoundMessage("Employee not found.");

            var effectiveFrom = request.EffectiveFrom ?? Money.Today;

            var current = await _db.SalaryStructures
                .Where(s => s.EmpId == employeeId && s.EffectiveTo == null)
                .OrderByDescending(s => s.EffectiveFrom)
                .FirstOrDefaultAsync();

            if (current != null)
            {
                if (effectiveFrom <= current.EffectiveFrom)
                    return FieldError("effectiveFrom", $"The new salary must start after the current one began ({current.EffectiveFrom:yyyy-MM-dd}).");
                current.EffectiveTo = effectiveFrom.AddDays(-1);
            }

            _db.SalaryStructures.Add(new SalaryStructure
            {
                EmpId = employeeId,
                MonthlySalary = Money.Round(request.MonthlySalary),
                Currency = currency,
                EffectiveFrom = effectiveFrom,
                Notes = ContractLogic.Clean(request.Notes),
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, current == null ? "SALARY_SET" : "SALARY_CHANGED", "Employee", employeeId,
                $"{employeeName}: {request.MonthlySalary:0.00} {currency} from {effectiveFrom:yyyy-MM-dd}" + (current != null ? $" (was {current.MonthlySalary:0.00} {current.Currency})" : string.Empty));

            return Ok(new { message = "Salary saved.", employeeId });
        }
    }
}
