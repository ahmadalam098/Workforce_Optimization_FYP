using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: overtime entries. The pay rate comes from the employee salary structure when the entry is made.
    /// Only approved overtime is paid, in the payroll of the month it was worked.
    /// </summary>
    [Route("api/admin/overtime")]
    public class AdminOvertimeController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly PaymentRuleService _rules;
        private readonly AuditService _audit;

        public AdminOvertimeController(WorkforceManagementDbContext db, IdGenerator ids, PaymentRuleService rules, AuditService audit)
        {
            _db = db;
            _ids = ids;
            _rules = rules;
            _audit = audit;
        }

        private sealed record StructureCurrency(int EmpId, string Currency);

        // GET api/admin/overtime?status=&year=&month=&search=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? status, int? year, int? month, string? search, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Overtimes.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(o => o.Status == status);

            if (year.HasValue && month is >= 1 and <= 12)
            {
                var start = new DateOnly(year.Value, month.Value, 1);
                var end = start.AddMonths(1).AddDays(-1);
                query = query.Where(o => o.WorkDate >= start && o.WorkDate <= end);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(o => o.Emp!.User!.Name != null && o.Emp.User.Name.Contains(term));
            }

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(o => o.Status == "Pending")
                .ThenByDescending(o => o.WorkDate)
                .ThenByDescending(o => o.OvertimeId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(o => new OvertimeListItemDto
                {
                    OvertimeId = o.OvertimeId,
                    EmployeeId = o.EmpId,
                    EmployeeName = o.Emp != null && o.Emp.User != null ? o.Emp.User.Name : null,
                    OrganizationName = o.Org != null ? o.Org.OrgName : null,
                    WorkDate = o.WorkDate,
                    TotalHours = o.TotalHours,
                    HourlyRate = o.HourlyRate,
                    Amount = o.Amount,
                    Status = o.Status,
                })
                .ToListAsync();

            var employeeIds = items.Where(i => i.EmployeeId.HasValue).Select(i => i.EmployeeId!.Value).Distinct().ToList();
            var currencies = await SafeQuery.IfSchemaMissing(
                async () => await _db.SalaryStructures
                    .AsNoTracking()
                    .Where(s => employeeIds.Contains(s.EmpId) && s.EffectiveTo == null)
                    .Select(s => new StructureCurrency(s.EmpId, s.Currency))
                    .ToListAsync(),
                new List<StructureCurrency>());

            foreach (var item in items)
                item.Currency = currencies.FirstOrDefault(c => c.EmpId == item.EmployeeId)?.Currency ?? ExchangeRateService.Pkr;

            return Ok(new PagedResult<OvertimeListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // POST api/admin/overtime   (Pending; needs a salary structure so the rate is known)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateOvertimeRequest request)
        {
            var workDate = request.WorkDate!.Value;
            if (workDate > Money.Today) return FieldError("workDate", "Overtime cannot be recorded for a future date.");

            var employee = await _db.Employees.AsNoTracking().Include(e => e.User).FirstOrDefaultAsync(e => e.EmpId == request.EmployeeId);
            if (employee?.User == null) return NotFoundMessage("Employee not found.");
            if (employee.User.IsActive != true) return FieldError("employeeId", "This employee is inactive.");

            var organizationId = request.OrganizationId ?? employee.OrgId;
            if (organizationId.HasValue && !await _db.Organizations.AnyAsync(o => o.OrgId == organizationId.Value))
                return FieldError("organizationId", "The selected organization does not exist.");

            var structure = await _db.SalaryStructures
                .AsNoTracking()
                .Where(s => s.EmpId == request.EmployeeId && s.EffectiveFrom <= workDate && (s.EffectiveTo == null || s.EffectiveTo >= workDate))
                .OrderByDescending(s => s.EffectiveFrom)
                .FirstOrDefaultAsync();
            if (structure == null)
                return FieldError("employeeId", "This employee has no salary structure for that date, so the overtime rate is unknown. Set a salary first.");

            var rate = await _rules.OvertimeRateAsync(structure);

            using var _ = await _ids.LockAsync();

            var entry = new Overtime
            {
                OvertimeId = await _ids.NextAsync(_db, "Overtime", "overtime_id"),
                EmpId = request.EmployeeId,
                OrgId = organizationId,
                WorkDate = workDate,
                TotalHours = request.TotalHours,
                HourlyRate = rate,
                Amount = Money.Round(request.TotalHours * rate),
                Status = "Pending",
            };
            _db.Overtimes.Add(entry);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "OVERTIME_RECORDED", "Employee", request.EmployeeId,
                $"{employee.User.Name}: {request.TotalHours} h on {workDate:yyyy-MM-dd} at {rate:0.00} {structure.Currency}/h");

            return Ok(new { message = "Overtime recorded and waiting for approval.", overtimeId = entry.OvertimeId, amount = entry.Amount });
        }

        // POST api/admin/overtime/5/approve
        [HttpPost("{overtimeId:int}/approve")]
        public Task<IActionResult> Approve(int overtimeId) => ChangeStatusAsync(overtimeId, "Approved", "OVERTIME_APPROVED", "Overtime approved.");

        // POST api/admin/overtime/5/reject
        [HttpPost("{overtimeId:int}/reject")]
        public Task<IActionResult> Reject(int overtimeId) => ChangeStatusAsync(overtimeId, "Rejected", "OVERTIME_REJECTED", "Overtime rejected.");

        private async Task<IActionResult> ChangeStatusAsync(int overtimeId, string newStatus, string auditAction, string message)
        {
            var entry = await _db.Overtimes.FirstOrDefaultAsync(o => o.OvertimeId == overtimeId);
            if (entry == null) return NotFoundMessage("Overtime entry not found.");
            if (!string.Equals(entry.Status, "Pending", StringComparison.OrdinalIgnoreCase))
                return ConflictMessage($"This entry is already {entry.Status?.ToLowerInvariant()}.");

            entry.Status = newStatus;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, auditAction, "Overtime", overtimeId, $"Employee {entry.EmpId}: {entry.TotalHours} h on {entry.WorkDate:yyyy-MM-dd}");
            return Ok(new { message, overtimeId, status = newStatus });
        }
    }
}
