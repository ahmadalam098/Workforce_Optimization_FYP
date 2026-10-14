using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: shifts (Morning / Evening / Night ...) and which employees work them.</summary>
    [Route("api/admin/shifts")]
    public class AdminShiftsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly ShiftService _shifts;
        private readonly AuditService _audit;

        public AdminShiftsController(WorkforceManagementDbContext db, IdGenerator ids, ShiftService shifts, AuditService audit)
        {
            _db = db;
            _ids = ids;
            _shifts = shifts;
            _audit = audit;
        }

        private static ShiftListItemDto ToDto(Shift shift, int assignedCount)
        {
            var start = shift.StartTime;
            var end = shift.EndTime;
            var overnight = start.HasValue && end.HasValue && end.Value <= start.Value;

            var minutes = 0;
            if (start.HasValue && end.HasValue)
            {
                minutes = (int)(end.Value.ToTimeSpan() - start.Value.ToTimeSpan()).TotalMinutes;
                if (minutes <= 0) minutes += 24 * 60;
            }

            return new ShiftListItemDto
            {
                ShiftId = shift.ShiftId,
                Name = shift.ShiftName ?? $"Shift #{shift.ShiftId}",
                StartTime = start,
                EndTime = end,
                IsOvernight = overnight,
                DurationMinutes = minutes,
                AssignedCount = assignedCount,
            };
        }

        // GET api/admin/shifts
        [HttpGet]
        public async Task<IActionResult> List()
        {
            var shifts = await _db.Shifts.AsNoTracking().OrderBy(s => s.StartTime).ThenBy(s => s.ShiftId).ToListAsync();

            var counts = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeShifts
                    .AsNoTracking()
                    .Where(a => a.EndDate == null)
                    .GroupBy(a => a.ShiftId)
                    .Select(g => new { ShiftId = g.Key, Count = g.Count() })
                    .ToDictionaryAsync(x => x.ShiftId, x => x.Count),
                new Dictionary<int, int>());

            return Ok(shifts.Select(s => ToDto(s, counts.GetValueOrDefault(s.ShiftId))).ToList());
        }

        // GET api/admin/shifts/3
        [HttpGet("{shiftId:int}")]
        public async Task<IActionResult> Get(int shiftId)
        {
            var shift = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.ShiftId == shiftId);
            if (shift == null) return NotFoundMessage("Shift not found.");

            var assignments = await _db.EmployeeShifts
                .AsNoTracking()
                .Where(a => a.ShiftId == shiftId && a.EndDate == null)
                .OrderBy(a => a.Employee!.User!.Name)
                .Select(a => new ShiftAssignmentDto
                {
                    UserId = a.Employee!.UserId,
                    HasPicture = a.Employee.User!.ProfilePicturePath != null,
                    AssignmentId = a.AssignmentId,
                    EmployeeId = a.EmpId,
                    FullName = a.Employee!.User!.Name,
                    Email = a.Employee.User.Email,
                    OrganizationName = a.Employee.Org != null ? a.Employee.Org.OrgName : null,
                    AvailabilityStatus = a.Employee.AvailabilityStatus,
                    StartDate = a.StartDate,
                    IsActive = a.Employee.User.IsActive == true,
                })
                .ToListAsync();

            var dto = new ShiftDetailDto { Assignments = assignments };
            var basic = ToDto(shift, assignments.Count);
            dto.ShiftId = basic.ShiftId;
            dto.Name = basic.Name;
            dto.StartTime = basic.StartTime;
            dto.EndTime = basic.EndTime;
            dto.IsOvernight = basic.IsOvernight;
            dto.DurationMinutes = basic.DurationMinutes;
            dto.AssignedCount = basic.AssignedCount;

            return Ok(dto);
        }

        // POST api/admin/shifts
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] SaveShiftRequest request)
        {
            if (request.StartTime == request.EndTime)
                return FieldError("endTime", "End time must be different from the start time.");

            var name = request.Name.Trim();

            using var _ = await _ids.LockAsync();

            if (await _db.Shifts.AnyAsync(s => s.ShiftName == name))
                return ConflictMessage("A shift with this name already exists.");

            var shift = new Shift
            {
                ShiftId = await _ids.NextAsync(_db, "Shift", "shift_id"),
                ShiftName = name,
                StartTime = request.StartTime,
                EndTime = request.EndTime,
            };
            _db.Shifts.Add(shift);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "SHIFT_CREATED", "Shift", shift.ShiftId, $"{name} {request.StartTime:HH\\:mm}-{request.EndTime:HH\\:mm}");
            return CreatedAtAction(nameof(Get), new { shiftId = shift.ShiftId }, new { message = "Shift created.", shiftId = shift.ShiftId });
        }

        // PUT api/admin/shifts/3
        [HttpPut("{shiftId:int}")]
        public async Task<IActionResult> Update(int shiftId, [FromBody] SaveShiftRequest request)
        {
            if (request.StartTime == request.EndTime)
                return FieldError("endTime", "End time must be different from the start time.");

            var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.ShiftId == shiftId);
            if (shift == null) return NotFoundMessage("Shift not found.");

            var name = request.Name.Trim();
            if (await _db.Shifts.AnyAsync(s => s.ShiftId != shiftId && s.ShiftName == name))
                return ConflictMessage("Another shift already has this name.");

            shift.ShiftName = name;
            shift.StartTime = request.StartTime;
            shift.EndTime = request.EndTime;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "SHIFT_UPDATED", "Shift", shiftId, name);
            return Ok(new { message = "Shift updated.", shiftId });
        }

        // DELETE api/admin/shifts/3   (only when nobody has ever been assigned to it)
        [HttpDelete("{shiftId:int}")]
        public async Task<IActionResult> Delete(int shiftId)
        {
            var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.ShiftId == shiftId);
            if (shift == null) return NotFoundMessage("Shift not found.");

            var used = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeShifts.AnyAsync(a => a.ShiftId == shiftId),
                false);
            if (used)
                return ConflictMessage("This shift has assignment history and cannot be deleted. Rename it or move its employees to another shift.");

            _db.Shifts.Remove(shift);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "SHIFT_DELETED", "Shift", shiftId, shift.ShiftName);
            return Ok(new { message = "Shift deleted.", shiftId });
        }

        // POST api/admin/shifts/3/assign   { employeeIds: [1,2] }
        [HttpPost("{shiftId:int}/assign")]
        public async Task<IActionResult> Assign(int shiftId, [FromBody] EmployeeIdsRequest request)
        {
            var shift = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.ShiftId == shiftId);
            if (shift == null) return NotFoundMessage("Shift not found.");

            var (assigned, skipped) = await _shifts.AssignAsync(shiftId, request.EmployeeIds, CurrentUserId);

            if (assigned > 0)
                await _audit.LogAsync(CurrentUserId, "SHIFT_ASSIGNED", "Shift", shiftId, $"{assigned} employee(s) -> {shift.ShiftName}");

            var message = assigned == 0
                ? "No changes: the selected employees are already on this shift or are inactive."
                : $"{assigned} employee(s) assigned to {shift.ShiftName}." + (skipped > 0 ? $" {skipped} skipped." : "");
            return Ok(new { message, assigned, skipped });
        }

        // POST api/admin/shifts/3/unassign   { employeeIds: [1,2] }
        [HttpPost("{shiftId:int}/unassign")]
        public async Task<IActionResult> Unassign(int shiftId, [FromBody] EmployeeIdsRequest request)
        {
            var shift = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.ShiftId == shiftId);
            if (shift == null) return NotFoundMessage("Shift not found.");

            var removed = await _shifts.UnassignAsync(request.EmployeeIds, shiftId);

            if (removed > 0)
                await _audit.LogAsync(CurrentUserId, "SHIFT_UNASSIGNED", "Shift", shiftId, $"{removed} employee(s) removed from {shift.ShiftName}");

            return Ok(new { message = $"{removed} employee(s) removed from {shift.ShiftName}.", removed });
        }
    }
}
