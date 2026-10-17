using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    /// <summary>
    /// Employee portal: the salary report of the signed-in employee. It is built by the same service the admin's Salaries page uses
    /// (Salary_Structure + Payroll_Run / Payroll_Item), so the employee, the admin and the organization manager always agree.
    /// A payroll that is still a draft is shown as "being prepared" without amounts, because the admin can still change it. Read only.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/salary")]
    public class EmployeeSalaryController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly SalaryReportService _report;

        public EmployeeSalaryController(WorkforceManagementDbContext db, SalaryReportService report)
        {
            _db = db;
            _report = report;
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

        // GET api/employee/salary?year=2026
        [HttpGet]
        public async Task<IActionResult> Report(int? year)
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var employee = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == me);
            if (employee == null) return Ok(new { hasEmployeeRecord = false });

            var r = await _report.BuildAsync(employee.EmpId, year, showDraftAmounts: false);
            return Ok(new { hasEmployeeRecord = true, fullName = user.Name, r.Year, r.Years, r.CurrentSalary, r.History, r.Months, r.Summary });
        }
    }
}
