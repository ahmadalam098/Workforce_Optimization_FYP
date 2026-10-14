using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: change the shift of a single employee (from the employee details page).</summary>
    [Route("api/admin/employees/{employeeId:int}/shift")]
    public class AdminEmployeeShiftController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly ShiftService _shifts;
        private readonly AuditService _audit;

        public AdminEmployeeShiftController(WorkforceManagementDbContext db, ShiftService shifts, AuditService audit)
        {
            _db = db;
            _shifts = shifts;
            _audit = audit;
        }

        // PUT api/admin/employees/5/shift   { shiftId: 3 }  or  { shiftId: null } to remove the shift
        [HttpPut]
        public async Task<IActionResult> Set(int employeeId, [FromBody] SetEmployeeShiftRequest request)
        {
            var employeeName = await _db.Employees
                .Where(e => e.EmpId == employeeId)
                .Select(e => e.User!.Name)
                .FirstOrDefaultAsync();
            if (employeeName == null && !await _db.Employees.AnyAsync(e => e.EmpId == employeeId))
                return NotFoundMessage("Employee not found.");

            if (request.ShiftId == null)
            {
                var removed = await _shifts.UnassignAsync(new[] { employeeId }, onlyShiftId: null);
                if (removed > 0) await _audit.LogAsync(CurrentUserId, "SHIFT_UNASSIGNED", "Employee", employeeId, employeeName);
                return Ok(new { message = removed > 0 ? "Shift removed." : "The employee had no shift.", employeeId });
            }

            var shift = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.ShiftId == request.ShiftId.Value);
            if (shift == null) return FieldError("shiftId", "The selected shift does not exist.");

            var (assigned, _) = await _shifts.AssignAsync(shift.ShiftId, new[] { employeeId }, CurrentUserId);
            if (assigned == 0)
                return ConflictMessage("The employee is already on this shift, or the account is inactive.");

            await _audit.LogAsync(CurrentUserId, "SHIFT_ASSIGNED", "Employee", employeeId, $"{employeeName} -> {shift.ShiftName}");
            return Ok(new { message = $"Moved to {shift.ShiftName}.", employeeId, shiftId = shift.ShiftId });
        }
    }
}
