using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    /// <summary>Employee portal: the shifts the admin assigned to the signed-in employee. Read only.</summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/shifts")]
    public class EmployeeShiftsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public EmployeeShiftsController(WorkforceManagementDbContext db)
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

        // GET api/employee/shifts   (every shift assignment of mine, newest first; the page works out today, the week and the filters)
        [HttpGet]
        public async Task<IActionResult> Mine()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var employee = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == me);
            if (employee == null) return Ok(new { hasEmployeeRecord = false, workingOrganization = (string?)null, shifts = Array.Empty<object>() });

            var workingOrg = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.EmployeeId == employee.EmpId && a.AssignOrgId != null)
                .Select(a => a.AssignOrg!.OrgName).FirstOrDefaultAsync();

            var shifts = await _db.EmployeeShifts.AsNoTracking()
                .Where(s => s.EmpId == employee.EmpId)
                .OrderByDescending(s => s.StartDate).ThenByDescending(s => s.AssignmentId)
                .Take(200)
                .Select(s => new
                {
                    assignmentId = s.AssignmentId,
                    shiftName = s.Shift!.ShiftName,
                    startTime = s.Shift.StartTime,
                    endTime = s.Shift.EndTime,
                    startDate = s.StartDate,
                    endDate = s.EndDate,
                    assignedBy = _db.Users.Where(u => u.UserId == s.AssignedBy).Select(u => u.Name).FirstOrDefault(),
                    notes = s.Notes,
                })
                .ToListAsync();

            return Ok(new { hasEmployeeRecord = true, workingOrganization = workingOrg, shifts });
        }
    }
}
