using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    /// <summary>
    /// Employee portal: the hours of the signed-in employee, day by day. There is no clock-in system, so the hours of a day are the length of
    /// the shift the admin assigned for that day, plus the overtime that was recorded for that day (approved ones count, pending ones are shown
    /// separately). The page adds the days up into weeks and months. Read only.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/hours")]
    public class EmployeeHoursController : ControllerBase
    {
        private const int MaxDays = 62;

        private readonly WorkforceManagementDbContext _db;

        public EmployeeHoursController(WorkforceManagementDbContext db)
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

        /// <summary>Length of a shift in hours. A shift that ends before it starts runs through the night (22:00 - 06:00 = 8 h).</summary>
        public static decimal ShiftHours(TimeOnly? start, TimeOnly? end)
        {
            if (start == null || end == null) return 0;
            var minutes = (end.Value.ToTimeSpan() - start.Value.ToTimeSpan()).TotalMinutes;
            if (minutes <= 0) minutes += 24 * 60;
            return Math.Round((decimal)minutes / 60m, 2);
        }

        // GET api/employee/hours?from=2026-09-01&to=2026-09-30   (at most 62 days)
        [HttpGet]
        public async Task<IActionResult> Days(DateOnly from, DateOnly to)
        {
            if (to < from) return BadRequest(new { message = "The end date must not be before the start date." });
            if (to.DayNumber - from.DayNumber + 1 > MaxDays) return BadRequest(new { message = $"Ask for at most {MaxDays} days at a time." });

            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var employee = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == me);
            if (employee == null) return Ok(new { hasEmployeeRecord = false, days = Array.Empty<object>() });

            // The assignments that touch the period; for a day, the one that started last applies (the day a shift is changed, both touch it).
            var assignments = await _db.EmployeeShifts.AsNoTracking()
                .Where(s => s.EmpId == employee.EmpId && s.StartDate <= to && (s.EndDate == null || s.EndDate >= from))
                .Select(s => new { s.AssignmentId, s.StartDate, s.EndDate, name = s.Shift!.ShiftName, start = s.Shift.StartTime, end = s.Shift.EndTime })
                .ToListAsync();

            var overtime = await _db.Overtimes.AsNoTracking()
                .Where(o => o.EmpId == employee.EmpId && o.WorkDate != null && o.WorkDate >= from && o.WorkDate <= to)
                .Select(o => new { Date = o.WorkDate!.Value, Hours = o.TotalHours ?? 0m, o.Status })
                .ToListAsync();

            var days = new List<object>();
            for (var date = from; date <= to; date = date.AddDays(1))
            {
                var shift = assignments.Where(a => a.StartDate <= date && (a.EndDate == null || a.EndDate >= date))
                    .OrderByDescending(a => a.StartDate).ThenByDescending(a => a.AssignmentId).FirstOrDefault();
                var of = overtime.Where(o => o.Date == date).ToList();
                days.Add(new
                {
                    date,
                    shiftName = shift?.name,
                    startTime = shift?.start,
                    endTime = shift?.end,
                    scheduledHours = shift == null ? 0m : ShiftHours(shift.start, shift.end),
                    overtimeHours = of.Where(o => string.Equals(o.Status, "Approved", StringComparison.OrdinalIgnoreCase)).Sum(o => o.Hours),
                    pendingOvertimeHours = of.Where(o => string.Equals(o.Status, "Pending", StringComparison.OrdinalIgnoreCase)).Sum(o => o.Hours),
                });
            }

            return Ok(new { hasEmployeeRecord = true, days });
        }
    }
}
