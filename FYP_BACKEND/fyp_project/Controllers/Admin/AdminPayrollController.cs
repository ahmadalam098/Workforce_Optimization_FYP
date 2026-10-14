using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: monthly payroll. A run is generated for a month from the salary structures and the approved
    /// overtime of that month, adjusted by hand if needed, then Draft -> Approved -> Paid.
    /// </summary>
    [Route("api/admin/payroll")]
    public class AdminPayrollController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly ExchangeRateService _rates;
        private readonly AuditService _audit;

        public AdminPayrollController(WorkforceManagementDbContext db, ExchangeRateService rates, AuditService audit)
        {
            _db = db;
            _rates = rates;
            _audit = audit;
        }

        // GET api/admin/payroll?page=1&pageSize=12
        [HttpGet]
        public async Task<IActionResult> List(int page = 1, int pageSize = 12)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.PayrollRuns.AsNoTracking();
            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(r => r.PeriodYear)
                .ThenByDescending(r => r.PeriodMonth)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(r => new PayrollRunListItemDto
                {
                    PayrollId = r.PayrollId,
                    PeriodYear = r.PeriodYear,
                    PeriodMonth = r.PeriodMonth,
                    Status = r.Status,
                    EmployeeCount = _db.PayrollItems.Count(i => i.PayrollId == r.PayrollId),
                    TotalPkr = r.TotalPkr,
                    CreatedAt = r.CreatedAt,
                    ApprovedAt = r.ApprovedAt,
                    PaidAt = r.PaidAt,
                })
                .ToListAsync();

            return Ok(new PagedResult<PayrollRunListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/payroll/5
        [HttpGet("{payrollId:int}")]
        public async Task<IActionResult> Get(int payrollId)
        {
            var run = await _db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            if (run == null) return NotFoundMessage("Payroll run not found.");

            var items = await _db.PayrollItems
                .AsNoTracking()
                .Where(i => i.PayrollId == payrollId)
                .OrderBy(i => i.Employee!.User!.Name)
                .Select(i => new PayrollItemDto
                {
                    ItemId = i.ItemId,
                    EmployeeId = i.EmpId,
                    EmployeeName = i.Employee != null && i.Employee.User != null ? i.Employee.User.Name : null,
                    Currency = i.Currency,
                    ExchangeRate = i.ExchangeRate,
                    BaseSalary = i.BaseSalary,
                    OvertimeHours = i.OvertimeHours,
                    OvertimeAmount = i.OvertimeAmount,
                    Adjustment = i.Adjustment,
                    AdjustmentNote = i.AdjustmentNote,
                    TotalAmount = i.TotalAmount,
                    TotalPkr = i.TotalPkr,
                })
                .ToListAsync();

            return Ok(new PayrollDetailDto
            {
                PayrollId = run.PayrollId,
                PeriodYear = run.PeriodYear,
                PeriodMonth = run.PeriodMonth,
                Status = run.Status,
                EmployeeCount = items.Count,
                TotalPkr = run.TotalPkr,
                CreatedAt = run.CreatedAt,
                ApprovedAt = run.ApprovedAt,
                PaidAt = run.PaidAt,
                Notes = run.Notes,
                Items = items,
            });
        }

        private record OvertimeSum(int EmpId, decimal Hours, decimal Amount);

        private async Task<Dictionary<int, OvertimeSum>> ApprovedOvertimeAsync(List<int> employeeIds, DateOnly start, DateOnly end)
        {
            var rows = await _db.Overtimes
                .AsNoTracking()
                .Where(o => o.Status == "Approved" && o.EmpId != null && employeeIds.Contains(o.EmpId.Value)
                            && o.WorkDate >= start && o.WorkDate <= end)
                .GroupBy(o => o.EmpId!.Value)
                .Select(g => new OvertimeSum(g.Key, g.Sum(o => o.TotalHours ?? 0), g.Sum(o => o.Amount ?? 0)))
                .ToListAsync();

            return rows.ToDictionary(r => r.EmpId);
        }

        // POST api/admin/payroll   { year, month }   (generates a Draft run)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreatePayrollRequest request)
        {
            var start = new DateOnly(request.Year, request.Month, 1);
            var end = start.AddMonths(1).AddDays(-1);

            if (await _db.PayrollRuns.AnyAsync(r => r.PeriodYear == request.Year && r.PeriodMonth == request.Month))
                return ConflictMessage($"A payroll run for {start:MMMM yyyy} already exists.");

            var structures = await _db.SalaryStructures
                .AsNoTracking()
                .Where(s => s.EffectiveFrom <= end && (s.EffectiveTo == null || s.EffectiveTo >= start))
                .Where(s => s.Employee!.User!.IsActive == true)
                .ToListAsync();

            var chosen = structures
                .GroupBy(s => s.EmpId)
                .Select(g => g.OrderByDescending(s => s.EffectiveFrom).ThenByDescending(s => s.StructureId).First())
                .ToList();

            if (chosen.Count == 0)
                return ConflictMessage($"No active employee has a salary structure for {start:MMMM yyyy}. Set salaries first.");

            var missing = new List<string>();
            var rateByCurrency = new Dictionary<string, decimal>();
            foreach (var currency in chosen.Select(s => s.Currency.ToUpperInvariant()).Distinct())
            {
                var rate = await _rates.GetRateAsync(currency, ExchangeRateService.Pkr, end);
                if (rate == null) missing.Add(currency);
                else rateByCurrency[currency] = rate.Value;
            }
            if (missing.Count > 0)
                return ConflictMessage($"Add an exchange rate to PKR for {string.Join(", ", missing)} before generating this payroll.");

            var overtime = await ApprovedOvertimeAsync(chosen.Select(s => s.EmpId).ToList(), start, end);

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var run = new PayrollRun
            {
                PeriodYear = request.Year,
                PeriodMonth = request.Month,
                Status = "Draft",
                Notes = ContractLogic.Clean(request.Notes),
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.PayrollRuns.Add(run);
            await _db.SaveChangesAsync();

            foreach (var structure in chosen)
            {
                var currency = structure.Currency.ToUpperInvariant();
                var rate = rateByCurrency[currency];
                overtime.TryGetValue(structure.EmpId, out var ot);

                var item = new PayrollItem
                {
                    PayrollId = run.PayrollId,
                    EmpId = structure.EmpId,
                    Currency = currency,
                    ExchangeRate = rate,
                    BaseSalary = structure.MonthlySalary,
                    OvertimeHours = ot?.Hours ?? 0,
                    OvertimeAmount = Money.Round(ot?.Amount ?? 0),
                };
                Recompute(item);
                _db.PayrollItems.Add(item);
            }
            await _db.SaveChangesAsync();

            await RefreshRunTotalAsync(run);
            await transaction.CommitAsync();

            await _audit.LogAsync(CurrentUserId, "PAYROLL_CREATED", "Payroll", run.PayrollId,
                $"{start:MMMM yyyy}: {chosen.Count} employee(s), {run.TotalPkr:0.00} PKR");

            return CreatedAtAction(nameof(Get), new { payrollId = run.PayrollId },
                new { message = $"Payroll for {start:MMMM yyyy} generated as a draft.", payrollId = run.PayrollId });
        }

        // PUT api/admin/payroll/5/items/3   { adjustment, adjustmentNote }   (Draft only)
        [HttpPut("{payrollId:int}/items/{itemId:int}")]
        public async Task<IActionResult> UpdateItem(int payrollId, int itemId, [FromBody] UpdatePayrollItemRequest request)
        {
            var run = await _db.PayrollRuns.FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            if (run == null) return NotFoundMessage("Payroll run not found.");
            if (run.Status != "Draft") return ConflictMessage("Only a draft payroll can be changed.");

            var item = await _db.PayrollItems.FirstOrDefaultAsync(i => i.ItemId == itemId && i.PayrollId == payrollId);
            if (item == null) return NotFoundMessage("Payroll line not found.");

            var adjustment = Money.Round(request.Adjustment);
            if (adjustment != 0 && string.IsNullOrWhiteSpace(request.AdjustmentNote))
                return FieldError("adjustmentNote", "Explain the adjustment.");

            item.Adjustment = adjustment;
            item.AdjustmentNote = adjustment == 0 ? null : ContractLogic.Clean(request.AdjustmentNote);
            Recompute(item);
            if (item.TotalAmount < 0) return FieldError("adjustment", "The adjustment cannot make the pay negative.");

            await _db.SaveChangesAsync();
            await RefreshRunTotalAsync(run);

            await _audit.LogAsync(CurrentUserId, "PAYROLL_ITEM_ADJUSTED", "Payroll", payrollId, $"Employee {item.EmpId}: {adjustment:0.00} {item.Currency} ({item.AdjustmentNote})");
            return Ok(new { message = "Line updated.", payrollId, itemId, total = item.TotalAmount });
        }

        // POST api/admin/payroll/5/refresh-overtime   (Draft only: picks up overtime approved after the run was generated)
        [HttpPost("{payrollId:int}/refresh-overtime")]
        public async Task<IActionResult> RefreshOvertime(int payrollId)
        {
            var run = await _db.PayrollRuns.FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            if (run == null) return NotFoundMessage("Payroll run not found.");
            if (run.Status != "Draft") return ConflictMessage("Only a draft payroll can be refreshed.");

            var start = new DateOnly(run.PeriodYear, run.PeriodMonth, 1);
            var end = start.AddMonths(1).AddDays(-1);

            var items = await _db.PayrollItems.Where(i => i.PayrollId == payrollId).ToListAsync();
            var overtime = await ApprovedOvertimeAsync(items.Select(i => i.EmpId).ToList(), start, end);

            foreach (var item in items)
            {
                overtime.TryGetValue(item.EmpId, out var ot);
                item.OvertimeHours = ot?.Hours ?? 0;
                item.OvertimeAmount = Money.Round(ot?.Amount ?? 0);
                Recompute(item);
            }
            await _db.SaveChangesAsync();
            await RefreshRunTotalAsync(run);

            await _audit.LogAsync(CurrentUserId, "PAYROLL_OVERTIME_REFRESHED", "Payroll", payrollId, $"{start:MMMM yyyy}");
            return Ok(new { message = "Overtime updated from the approved entries.", payrollId, total = run.TotalPkr });
        }

        // POST api/admin/payroll/5/approve   (Draft -> Approved)
        [HttpPost("{payrollId:int}/approve")]
        public async Task<IActionResult> Approve(int payrollId)
        {
            var run = await _db.PayrollRuns.FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            if (run == null) return NotFoundMessage("Payroll run not found.");
            if (run.Status != "Draft") return ConflictMessage("Only a draft payroll can be approved.");

            run.Status = "Approved";
            run.ApprovedBy = CurrentUserId;
            run.ApprovedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "PAYROLL_APPROVED", "Payroll", payrollId, $"{run.PeriodMonth}/{run.PeriodYear}: {run.TotalPkr:0.00} PKR");
            return Ok(new { message = "Payroll approved.", payrollId });
        }

        // POST api/admin/payroll/5/pay   (Approved -> Paid)
        [HttpPost("{payrollId:int}/pay")]
        public async Task<IActionResult> MarkPaid(int payrollId)
        {
            var run = await _db.PayrollRuns.FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            if (run == null) return NotFoundMessage("Payroll run not found.");
            if (run.Status != "Approved") return ConflictMessage("Only an approved payroll can be marked as paid.");

            run.Status = "Paid";
            run.PaidBy = CurrentUserId;
            run.PaidAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "PAYROLL_PAID", "Payroll", payrollId, $"{run.PeriodMonth}/{run.PeriodYear}: {run.TotalPkr:0.00} PKR");
            return Ok(new { message = "Payroll marked as paid.", payrollId });
        }

        // DELETE api/admin/payroll/5   (Draft only)
        [HttpDelete("{payrollId:int}")]
        public async Task<IActionResult> Delete(int payrollId)
        {
            var run = await _db.PayrollRuns.FirstOrDefaultAsync(r => r.PayrollId == payrollId);
            if (run == null) return NotFoundMessage("Payroll run not found.");
            if (run.Status != "Draft") return ConflictMessage("Only a draft payroll can be deleted.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            _db.PayrollItems.RemoveRange(await _db.PayrollItems.Where(i => i.PayrollId == payrollId).ToListAsync());
            _db.PayrollRuns.Remove(run);
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            await _audit.LogAsync(CurrentUserId, "PAYROLL_DELETED", "Payroll", payrollId, $"{run.PeriodMonth}/{run.PeriodYear}");
            return Ok(new { message = "Draft payroll deleted.", payrollId });
        }

        private static void Recompute(PayrollItem item)
        {
            item.TotalAmount = Money.Round(item.BaseSalary + item.OvertimeAmount + item.Adjustment);
            item.TotalPkr = Money.Round(item.TotalAmount * item.ExchangeRate);
        }

        private async Task RefreshRunTotalAsync(PayrollRun run)
        {
            run.TotalPkr = await _db.PayrollItems.Where(i => i.PayrollId == run.PayrollId).SumAsync(i => i.TotalPkr);
            await _db.SaveChangesAsync();
        }
    }
}
