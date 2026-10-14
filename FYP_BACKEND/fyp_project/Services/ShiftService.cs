using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// Employee shift assignments. An employee has at most one current shift (end_date IS NULL);
    /// changing shift ends the old assignment and starts a new one, so the history is kept.
    /// </summary>
    public class ShiftService
    {
        private readonly WorkforceManagementDbContext _db;

        public ShiftService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

        /// <summary>Assigns the employees to the shift. Inactive or unknown employees and those already on it are skipped.</summary>
        public async Task<(int assigned, int skipped)> AssignAsync(int shiftId, IEnumerable<int> employeeIds, int? actorUserId)
        {
            var ids = employeeIds.Distinct().ToList();

            var eligible = await _db.Employees
                .Where(e => ids.Contains(e.EmpId) && e.User != null && e.User.IsActive == true)
                .Select(e => e.EmpId)
                .ToListAsync();

            var currentAssignments = await _db.EmployeeShifts
                .Where(a => eligible.Contains(a.EmpId) && a.EndDate == null)
                .ToListAsync();

            var assigned = 0;
            foreach (var employeeId in eligible)
            {
                var current = currentAssignments.FirstOrDefault(a => a.EmpId == employeeId);
                if (current?.ShiftId == shiftId) continue;

                if (current != null) current.EndDate = Today;

                _db.EmployeeShifts.Add(new EmployeeShift
                {
                    EmpId = employeeId,
                    ShiftId = shiftId,
                    StartDate = Today,
                    AssignedBy = actorUserId,
                    CreatedAt = DateTime.UtcNow,
                });
                assigned++;
            }

            await _db.SaveChangesAsync();
            return (assigned, ids.Count - assigned);
        }

        /// <summary>Ends the current assignment of each employee (optionally only when it is on `onlyShiftId`).</summary>
        public async Task<int> UnassignAsync(IEnumerable<int> employeeIds, int? onlyShiftId)
        {
            var ids = employeeIds.Distinct().ToList();

            var current = await _db.EmployeeShifts
                .Where(a => ids.Contains(a.EmpId) && a.EndDate == null && (onlyShiftId == null || a.ShiftId == onlyShiftId))
                .ToListAsync();

            foreach (var assignment in current) assignment.EndDate = Today;

            await _db.SaveChangesAsync();
            return current.Count;
        }
    }
}
