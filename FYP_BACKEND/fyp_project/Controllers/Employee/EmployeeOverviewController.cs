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
    /// Employee portal: the signed-in employee. Employees never register themselves: the admin creates the account and the employee
    /// signs in with those credentials (the same login and forgot-password flow as the other roles). Everything here is read only.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee")]
    public class EmployeeOverviewController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public EmployeeOverviewController(WorkforceManagementDbContext db)
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

        // GET api/employee/overview
        [HttpGet("overview")]
        public async Task<IActionResult> Overview()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var employee = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == me);
            if (employee == null)
                return Ok(new { fullName = user.Name, email = user.Email, phone = user.PhoneNo, hasEmployeeRecord = false });

            var homeOrg = employee.OrgId == null ? null : await _db.Organizations.AsNoTracking().Where(o => o.OrgId == employee.OrgId).Select(o => o.OrgName).FirstOrDefaultAsync();
            var workingOrg = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.EmployeeId == employee.EmpId && a.AssignOrgId != null)
                .Select(a => a.AssignOrg!.OrgName).FirstOrDefaultAsync();

            var skills = await (from s in _db.EmployeeSkills.AsNoTracking()
                                join m in _db.SkillMasters.AsNoTracking() on s.SkillId equals m.SkillId
                                where s.EmpId == employee.EmpId
                                orderby m.Name
                                select new { name = m.Name, proficiency = s.Proficiency }).ToListAsync();

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var shift = await _db.EmployeeShifts.AsNoTracking()
                .Where(s => s.EmpId == employee.EmpId && s.StartDate <= today && (s.EndDate == null || s.EndDate >= today))
                .OrderByDescending(s => s.StartDate)
                .Select(s => new { name = s.Shift!.ShiftName, start = s.Shift.StartTime, end = s.Shift.EndTime })
                .FirstOrDefaultAsync();

            return Ok(new
            {
                hasEmployeeRecord = true,
                fullName = user.Name,
                email = user.Email,
                phone = user.PhoneNo,
                employeeId = employee.EmpId,
                joiningDate = employee.JoiningDate,
                availabilityStatus = employee.AvailabilityStatus,
                homeOrganization = homeOrg,
                workingOrganization = workingOrg,
                skills,
                shift,
            });
        }
    }
}
