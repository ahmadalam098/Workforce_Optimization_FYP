using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public class AllocationOutcome
    {
        public bool Success { get; init; }
        public int StatusCode { get; init; } = 200;
        public string Message { get; init; } = string.Empty;
        public int? AllocationId { get; init; }
        public List<AllocationViolation> Violations { get; init; } = new();
        public bool CanOverride { get; init; }
        public bool WasOverride { get; init; }

        public static AllocationOutcome Ok(string message, int? allocationId = null, bool overridden = false) =>
            new() { Success = true, Message = message, AllocationId = allocationId, WasOverride = overridden };

        public static AllocationOutcome Fail(int statusCode, string message, List<AllocationViolation>? violations = null, bool canOverride = false) =>
            new() { Success = false, StatusCode = statusCode, Message = message, Violations = violations ?? new(), CanOverride = canOverride };
    }

    /// <summary>
    /// Manual (admin) allocation workflow: allocate, reallocate and release employees.
    /// Hard rules can never be overridden; contract rules can be overridden by an admin on purpose
    /// (Force = true) and the override is stored in the allocation history and the audit log.
    /// Every method takes the IdGenerator lock first because the tables have no IDENTITY columns.
    /// </summary>
    public class AllocationService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly EmployeeStatusService _status;

        public AllocationService(WorkforceManagementDbContext db, IdGenerator ids, EmployeeStatusService status)
        {
            _db = db;
            _ids = ids;
            _status = status;
        }

        // ---------------------------------------------------------------- rules

        private async Task<Contract?> ActiveContractAsync(int? organizationId)
        {
            if (organizationId == null) return null;
            return await _db.Contracts
                .AsNoTracking()
                .Where(c => c.OrgId == organizationId && (c.Status == "Active" || c.Status == "Approved"))
                .OrderByDescending(c => c.ContractId)
                .FirstOrDefaultAsync();
        }

        private async Task<List<AllocationViolation>> CheckAsync(
            Employee employee, Organization assignOrg, bool temporary, bool checkAvailability, int? excludeAllocationId)
        {
            var violations = new List<AllocationViolation>();

            if (employee.User?.IsActive != true)
                violations.Add(new("EMPLOYEE_INACTIVE", "The employee account is inactive.", false));

            if (!ContractLogic.IsActiveStatus(assignOrg.Status))
                violations.Add(new("ORG_NOT_ACTIVE", $"{assignOrg.OrgName} is not an approved (active) organization.", false));

            var contract = await ActiveContractAsync(assignOrg.OrgId);
            if (contract == null)
                violations.Add(new("NO_ACTIVE_CONTRACT", $"{assignOrg.OrgName} has no active contract.", false));

            if (checkAvailability && !AllocationLogic.AvailableStatuses.Contains(employee.AvailabilityStatus ?? string.Empty))
                violations.Add(new("EMPLOYEE_NOT_AVAILABLE", $"The employee is currently {employee.AvailabilityStatus ?? "unknown"}, not available.", true));

            if (contract?.MaxEmployees != null)
            {
                var current = await _db.EmployeeAllocations
                    .Where(AllocationLogic.IsOpen)
                    .CountAsync(a => a.AssignOrgId == assignOrg.OrgId && (excludeAllocationId == null || a.AllocationId != excludeAllocationId));

                if (current >= contract.MaxEmployees)
                    violations.Add(new("CAPACITY_EXCEEDED",
                        $"{assignOrg.OrgName} already has {current} of {contract.MaxEmployees} employees allowed by its contract.", true));
            }

            if (temporary && contract != null && contract.BorrowingAllowed != true)
                violations.Add(new("BORROWING_NOT_ALLOWED",
                    $"The contract of {assignOrg.OrgName} does not allow borrowing employees from other organizations.", true));

            return violations;
        }

        /// <summary>Hard rules block always; overridable rules block unless the admin forces the action.</summary>
        private static AllocationOutcome? Gate(List<AllocationViolation> violations, bool force)
        {
            var hard = violations.FirstOrDefault(v => !v.Overridable);
            if (hard != null) return AllocationOutcome.Fail(409, hard.Message, violations, canOverride: false);

            if (violations.Count > 0 && !force)
            {
                var message = violations.Count == 1 ? violations[0].Message : $"This breaks {violations.Count} contract rules.";
                return AllocationOutcome.Fail(409, message, violations, canOverride: true);
            }

            return null;
        }

        // ---------------------------------------------------------------- helpers

        private async Task<AllocationOutcome> InTransactionAsync(Func<Task<AllocationOutcome>> work)
        {
            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var result = await work();
                if (result.Success) await transaction.CommitAsync();
                else await transaction.RollbackAsync();
                return result;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        private async Task AddHistoryAsync(int allocationId, int employeeId, int? fromOrgId, int? toOrgId, string action, string reason, int? actorUserId)
        {
            _db.AllocationHistories.Add(new AllocationHistory
            {
                AllocationHistoryId = await _ids.NextAsync(_db, "Allocation_History", "allocation_history_id"),
                AllocationId = allocationId,
                EmpId = employeeId,
                FromOrgId = fromOrgId,
                ToOrgId = toOrgId,
                ActionType = action,
                ActionReason = AllocationLogic.Trim(reason, 255),
                ActionTime = DateTime.UtcNow,
                PerformedByUserId = actorUserId,
                IsAllocatedByAi = false,
            });
            await _db.SaveChangesAsync();
        }

        private async Task<EmployeeAllocation> NewAllocationAsync(
            int employeeId, int ownerOrgId, int assignOrgId, DateTime? expectedEnd, int? workforceRequestId)
        {
            var now = DateTime.UtcNow;
            var allocation = new EmployeeAllocation
            {
                AllocationId = await _ids.NextAsync(_db, "Employee_Allocation", "allocation_id"),
                EmployeeId = employeeId,
                OwnerOrgId = ownerOrgId,
                AssignOrgId = assignOrgId,
                WorkforceRequestId = workforceRequestId,
                AllocationType = ownerOrgId == assignOrgId ? AllocationLogic.Normal : AllocationLogic.Temporary,
                StartDatetime = now,
                ExpectedEndDatetime = expectedEnd,
                Status = "Active",
                CreatedAt = now,
            };
            _db.EmployeeAllocations.Add(allocation);
            await _db.SaveChangesAsync();
            return allocation;
        }

        private IQueryable<EmployeeAllocation> OpenAllocations() =>
            _db.EmployeeAllocations
                .Include(a => a.Employee).ThenInclude(e => e!.User)
                .Include(a => a.AssignOrg)
                .Include(a => a.OwnerOrg)
                .Where(AllocationLogic.IsOpen);

        // ---------------------------------------------------------------- allocate

        public async Task<AllocationOutcome> AllocateAsync(AllocateRequest request, int? actorUserId)
        {
            using var _ = await _ids.LockAsync();

            return await InTransactionAsync(async () =>
            {
                var employee = await _db.Employees.Include(e => e.User).FirstOrDefaultAsync(e => e.EmpId == request.EmployeeId);
                if (employee?.User == null) return AllocationOutcome.Fail(404, "Employee not found.");

                var assignOrg = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == request.AssignOrgId);
                if (assignOrg == null) return AllocationOutcome.Fail(400, "The selected organization does not exist.");

                if (request.ExpectedEnd.HasValue && request.ExpectedEnd.Value <= DateTime.UtcNow)
                    return AllocationOutcome.Fail(400, "The expected end must be in the future.");

                if (request.WorkforceRequestId.HasValue)
                {
                    var staffRequest = await _db.WorkforceRequests.AsNoTracking()
                        .FirstOrDefaultAsync(r => r.WorkforceRequestId == request.WorkforceRequestId.Value);
                    if (staffRequest == null) return AllocationOutcome.Fail(400, "The selected workforce request does not exist.");
                    if (staffRequest.Status != "Approved")
                        return AllocationOutcome.Fail(409, $"Only an approved staff request can be staffed. This one is {staffRequest.Status?.ToLower()}.");
                    if (staffRequest.OrgId != request.AssignOrgId)
                        return AllocationOutcome.Fail(400, "This staff request is for a different organization.");
                    var staffed = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen)
                        .CountAsync(a => a.WorkforceRequestId == staffRequest.WorkforceRequestId);
                    if (staffed >= (staffRequest.RequiredEmployees ?? 0))
                        return AllocationOutcome.Fail(409, "This staff request already has all the employees it asked for.");
                }

                var existing = await OpenAllocations().FirstOrDefaultAsync(a => a.EmployeeId == request.EmployeeId);
                if (existing != null)
                    return AllocationOutcome.Fail(409,
                        $"{employee.User.Name} is already allocated to {existing.AssignOrg?.OrgName ?? "another organization"}. Use reallocate to move them.");

                var ownerOrgId = employee.OrgId ?? request.AssignOrgId;
                var temporary = ownerOrgId != request.AssignOrgId;

                var violations = await CheckAsync(employee, assignOrg, temporary, checkAvailability: true, excludeAllocationId: null);
                var blocked = Gate(violations, request.Force == true);
                if (blocked != null) return blocked;

                var overridden = violations.Count > 0;
                var reason = (overridden ? "[OVERRIDE] " : string.Empty) + request.Reason.Trim();
                var allocation = await NewAllocationAsync(
                    employee.EmpId, ownerOrgId, request.AssignOrgId, request.ExpectedEnd, request.WorkforceRequestId);

                await AddHistoryAsync(allocation.AllocationId, employee.EmpId, employee.OrgId, request.AssignOrgId,
                    AllocationLogic.ActionAllocated, reason, actorUserId);

                await _status.ChangeAsync(employee, "Assigned", $"Allocated to {assignOrg.OrgName}", actorUserId);
                await _db.SaveChangesAsync();

                var message = $"{employee.User.Name} allocated to {assignOrg.OrgName}" + (temporary ? " (borrowed)." : ".");
                return AllocationOutcome.Ok(message, allocation.AllocationId, overridden);
            });
        }

        // ---------------------------------------------------------------- reallocate

        public async Task<AllocationOutcome> ReallocateAsync(int allocationId, ReallocateRequest request, int? actorUserId)
        {
            using var _ = await _ids.LockAsync();

            return await InTransactionAsync(async () =>
            {
                var current = await OpenAllocations().FirstOrDefaultAsync(a => a.AllocationId == allocationId);
                if (current?.Employee?.User == null) return AllocationOutcome.Fail(404, "Open allocation not found.");

                if (current.AssignOrgId == request.AssignOrgId)
                    return AllocationOutcome.Fail(400, "The employee already works for that organization.");

                var newOrg = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == request.AssignOrgId);
                if (newOrg == null) return AllocationOutcome.Fail(400, "The selected organization does not exist.");

                if (request.ExpectedEnd.HasValue && request.ExpectedEnd.Value <= DateTime.UtcNow)
                    return AllocationOutcome.Fail(400, "The expected end must be in the future.");

                var employee = current.Employee;
                var ownerOrgId = current.OwnerOrgId ?? employee.OrgId ?? request.AssignOrgId;
                var temporary = ownerOrgId != request.AssignOrgId;

                var violations = await CheckAsync(employee, newOrg, temporary, checkAvailability: false, excludeAllocationId: allocationId);
                if (employee.AvailabilityStatus == "Busy")
                    violations.Add(new("EMPLOYEE_BUSY", "The employee is busy with a customer right now. Moving them now may interrupt a call.", true));

                var blocked = Gate(violations, request.Force == true);
                if (blocked != null) return blocked;

                var overridden = violations.Count > 0;
                var reason = (overridden ? "[OVERRIDE] " : string.Empty) + request.Reason.Trim();
                var fromOrgId = current.AssignOrgId;

                current.ActualEndDatetime = DateTime.UtcNow;
                current.Status = "Reallocated";
                await _db.SaveChangesAsync();

                var created = await NewAllocationAsync(employee.EmpId, ownerOrgId, request.AssignOrgId, request.ExpectedEnd, current.WorkforceRequestId);

                await AddHistoryAsync(created.AllocationId, employee.EmpId, fromOrgId, request.AssignOrgId,
                    AllocationLogic.ActionReallocated, reason, actorUserId);

                await _status.ChangeAsync(employee, employee.AvailabilityStatus == "Busy" ? "Busy" : "Assigned",
                    $"Reallocated to {newOrg.OrgName}", actorUserId);
                await _db.SaveChangesAsync();

                return AllocationOutcome.Ok($"{employee.User!.Name} moved to {newOrg.OrgName}.", created.AllocationId, overridden);
            });
        }

        // ---------------------------------------------------------------- release

        public async Task<AllocationOutcome> ReleaseAsync(int allocationId, string reason, int? actorUserId)
        {
            using var _ = await _ids.LockAsync();

            return await InTransactionAsync(async () =>
            {
                var allocation = await OpenAllocations().FirstOrDefaultAsync(a => a.AllocationId == allocationId);
                if (allocation?.Employee?.User == null) return AllocationOutcome.Fail(404, "Open allocation not found.");

                var employee = allocation.Employee;
                allocation.ActualEndDatetime = DateTime.UtcNow;
                allocation.Status = "Completed";
                await _db.SaveChangesAsync();

                await AddHistoryAsync(allocationId, employee.EmpId, allocation.AssignOrgId, employee.OrgId,
                    AllocationLogic.ActionReleased, reason.Trim(), actorUserId);

                await _status.ChangeAsync(employee, "Available", $"Released from {allocation.AssignOrg?.OrgName}", actorUserId);
                await _db.SaveChangesAsync();

                return AllocationOutcome.Ok($"{employee.User!.Name} released and is available again.", allocationId);
            });
        }
    }
}
