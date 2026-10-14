using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: system-wide reports. Dates are inclusive days (yyyy-MM-dd); the default is the last 30 days.</summary>
    [Route("api/admin/reports")]
    public class AdminReportsController : AdminControllerBase
    {
        private readonly ReportService _reports;

        public AdminReportsController(ReportService reports)
        {
            _reports = reports;
        }

        private bool TryRange(DateOnly? from, DateOnly? to, int maxDays, out DateOnly start, out DateOnly end, out IActionResult? error)
        {
            end = to ?? Money.Today;
            start = from ?? end.AddDays(-29);
            error = null;

            if (start > end)
            {
                error = FieldError("from", "The start date cannot be after the end date.");
                return false;
            }

            if (end.DayNumber - start.DayNumber > maxDays)
            {
                error = FieldError("to", $"Choose a period of at most {maxDays} days.");
                return false;
            }

            return true;
        }

        // GET api/admin/reports/utilization?from=&to=
        [HttpGet("utilization")]
        public async Task<IActionResult> Utilization(DateOnly? from, DateOnly? to)
        {
            if (!TryRange(from, to, 366, out var start, out var end, out var error)) return error!;
            return Ok(await _reports.UtilizationAsync(start, end));
        }

        // GET api/admin/reports/allocations?from=&to=
        [HttpGet("allocations")]
        public async Task<IActionResult> Allocations(DateOnly? from, DateOnly? to)
        {
            if (!TryRange(from, to, 366, out var start, out var end, out var error)) return error!;
            return Ok(await _reports.AllocationAsync(start, end));
        }

        // GET api/admin/reports/financial?from=&to=   (month by month; default = the last 6 months)
        [HttpGet("financial")]
        public async Task<IActionResult> Financial(DateOnly? from, DateOnly? to)
        {
            var end = to ?? Money.Today;
            var start = from ?? new DateOnly(end.Year, end.Month, 1).AddMonths(-5);

            if (start > end) return FieldError("from", "The start date cannot be after the end date.");
            if ((end.Year - start.Year) * 12 + end.Month - start.Month >= 24) return FieldError("to", "Choose a period of at most 24 months.");

            return Ok(await _reports.FinancialAsync(start, end));
        }
    }
}
