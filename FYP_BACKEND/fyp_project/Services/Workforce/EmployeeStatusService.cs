using fyp_project.Models;

namespace fyp_project.Services
{
    /// <summary>Changes an employee availability status and records it in Employee_Status.</summary>
    public class EmployeeStatusService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;

        public EmployeeStatusService(WorkforceManagementDbContext db, IdGenerator ids)
        {
            _db = db;
            _ids = ids;
        }

        /// <summary>Caller must hold the IdGenerator lock and save the employee afterwards.</summary>
        public async Task ChangeAsync(Employee employee, string newStatus, string reason, int? actorUserId)
        {
            if (string.Equals(employee.AvailabilityStatus, newStatus, StringComparison.Ordinal)) return;

            var statusEvent = new EmployeeStatus
            {
                StatusHistoryId = await _ids.NextAsync(_db, "Employee_Status", "status_history_id"),
                EmpId = employee.EmpId,
                OldStatus = employee.AvailabilityStatus,
                NewStatus = newStatus,
                ChangedAt = DateTime.UtcNow,
                Reason = AllocationLogic.Trim(reason, 255),
                ChangedBy = actorUserId,
            };
            _db.EmployeeStatuses.Add(statusEvent);
            await _db.SaveChangesAsync();

            employee.AvailabilityStatus = newStatus;
            employee.StatusHistoryId = statusEvent.StatusHistoryId;
        }
    }
}
