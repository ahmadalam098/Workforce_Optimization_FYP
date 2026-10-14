using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>The outcome of a permanent delete. <see cref="Status"/> is the HTTP status to answer with.</summary>
    public record DeleteResult(bool Ok, int Status, string Message, List<string>? Blockers = null, string? Name = null, string? Email = null, string? Role = null)
    {
        public static DeleteResult NotFound(string message) => new(false, 404, message);
        public static DeleteResult Refused(string message, List<string>? blockers = null) => new(false, 409, message, blockers);
    }

    /// <summary>
    /// Permanent ("delete completely") removal of things that were first deactivated. Real working history (allocations, payroll,
    /// overtime, reviews, staff requests) is never erased: when it exists the delete is refused and the item stays deactivated.
    /// What is removed together with the item is only its own set-up (skills, shifts, status history, salary set-up, manager links).
    /// </summary>
    public class EntityDeletion
    {
        // Columns that remember which user did something. Deleting the user leaves the record in place and clears the link
        // (the audit log keeps the person's name as text).
        private static readonly (string Table, string Column)[] UserLinks =
        {
            ("Allocation_History", "performed_by_user_id"), ("Approval_Decision", "decided_by"), ("Audit_Log", "actor_user_id"),
            ("Contract_Modification_Request", "requested_by_user_id"), ("Contract_Modification_Request", "reviewed_by"),
            ("Contract_Rule", "created_by"), ("Contract_Version", "created_by"), ("Employee_Shift", "assigned_by"),
            ("Employee_Status", "changed_by"), ("Exchange_Rate", "created_by"), ("Invoice", "created_by"), ("Invoice_Payment", "recorded_by"),
            ("Payment_Rule", "updated_by"), ("Payroll_Run", "approved_by"), ("Payroll_Run", "created_by"), ("Payroll_Run", "paid_by"),
            ("Salary_Structure", "created_by"), ("Ticket", "assigned_to_user_id"), ("Ticket", "created_by"), ("Ticket", "raised_by_user_id"),
            ("Ticket_Message", "author_user_id"), ("System_Setting", "updated_by"),
        };

        private readonly WorkforceManagementDbContext _db;

        public EntityDeletion(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private static void Add(List<string> blockers, int count, string singular, string plural)
        {
            if (count > 0) blockers.Add($"{count} {(count == 1 ? singular : plural)}");
        }

        private async Task RemoveUserAsync(int userId)
        {
            foreach (var (table, column) in UserLinks)
                await _db.Database.ExecuteSqlRawAsync($"UPDATE [{table}] SET [{column}] = NULL WHERE [{column}] = {{0}}", userId);
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM Notification_State WHERE user_id = {0}", userId);
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM Organization_Manager WHERE user_id = {0}", userId);
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM [User] WHERE user_id = {0}", userId);
        }

        /// <summary>An admin, business owner or organization manager account that is deactivated.</summary>
        public async Task<DeleteResult> DeleteUserAsync(int userId, int? actorId)
        {
            var user = await _db.Users.AsNoTracking().Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null) return DeleteResult.NotFound("User not found.");
            if (userId == actorId) return DeleteResult.Refused("You cannot delete your own account.");
            if (user.IsActive == true) return DeleteResult.Refused("Deactivate this account first. Only deactivated accounts can be deleted.");
            if (await _db.Employees.AnyAsync(e => e.UserId == userId))
                return DeleteResult.Refused("This is an employee account. Delete it from the Employees page.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            await RemoveUserAsync(userId);
            await transaction.CommitAsync();

            return new DeleteResult(true, 200, $"{user.Name} was deleted.", Name: user.Name, Email: user.Email, Role: user.Role?.RoleType);
        }

        /// <summary>A deactivated employee, together with their sign-in account.</summary>
        public async Task<DeleteResult> DeleteEmployeeAsync(int employeeId)
        {
            var employee = await _db.Employees.AsNoTracking().Include(e => e.User).ThenInclude(u => u!.Role).FirstOrDefaultAsync(e => e.EmpId == employeeId);
            if (employee == null) return DeleteResult.NotFound("Employee not found.");
            if (employee.User?.IsActive == true) return DeleteResult.Refused("Deactivate this employee first. Only deactivated employees can be deleted.");

            var blockers = new List<string>();
            Add(blockers, await _db.EmployeeAllocations.CountAsync(a => a.EmployeeId == employeeId), "allocation", "allocations");
            Add(blockers, await _db.AllocationHistories.CountAsync(h => h.EmpId == employeeId), "allocation history entry", "allocation history entries");
            Add(blockers, await CountAsync("Payroll_Item", "emp_id", employeeId), "payroll record", "payroll records");
            Add(blockers, await CountAsync("Overtime", "emp_id", employeeId), "overtime record", "overtime records");
            Add(blockers, await CountAsync("Organization_Reviews", "emp_id", employeeId), "review", "reviews");
            if (blockers.Count > 0)
            {
                return DeleteResult.Refused(
                    $"{employee.User?.Name} cannot be deleted because they still have {string.Join(", ", blockers)}. These records must be kept, so the employee stays deactivated.",
                    blockers);
            }

            await using var transaction = await _db.Database.BeginTransactionAsync();
            foreach (var table in new[] { "Employee_Status", "Employee_Shift", "Employee_Skill", "Salary_Structure", "Skills" })
                await _db.Database.ExecuteSqlRawAsync($"DELETE FROM [{table}] WHERE emp_id = {{0}}", employeeId);
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM Employee WHERE emp_id = {0}", employeeId);
            if (employee.UserId != null) await RemoveUserAsync(employee.UserId.Value);
            await transaction.CommitAsync();

            return new DeleteResult(true, 200, $"{employee.User?.Name} was deleted.", Name: employee.User?.Name, Email: employee.User?.Email, Role: "Employee");
        }

        /// <summary>A deactivated skill. Employees lose it from their skill list; a staff request that asks for it keeps it deleted-proof.</summary>
        public async Task<DeleteResult> DeleteSkillAsync(int skillId)
        {
            var skill = await _db.SkillMasters.AsNoTracking().FirstOrDefaultAsync(s => s.SkillId == skillId);
            if (skill == null) return DeleteResult.NotFound("Skill not found.");
            if (skill.IsActive) return DeleteResult.Refused("Deactivate this skill first. Only deactivated skills can be deleted.");

            var requests = await CountAsync("Workforce_Request_Skill", "skill_master_id", skillId);
            if (requests > 0)
            {
                return DeleteResult.Refused(
                    $"{skill.Name} cannot be deleted because {requests} staff {(requests == 1 ? "request asks" : "requests ask")} for it. These records must be kept, so the skill stays deactivated.",
                    new List<string> { $"{requests} staff request{(requests == 1 ? string.Empty : "s")}" });
            }

            await using var transaction = await _db.Database.BeginTransactionAsync();
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM Employee_Skill WHERE skill_master_id = {0}", skillId);
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM Skill_Master WHERE skill_master_id = {0}", skillId);
            await transaction.CommitAsync();

            return new DeleteResult(true, 200, $"{skill.Name} was deleted.", Name: skill.Name);
        }

        /// <summary>A deactivated payment rule that is not built in.</summary>
        public async Task<DeleteResult> DeletePaymentRuleAsync(int ruleId)
        {
            var rule = await _db.PaymentRules.FirstOrDefaultAsync(r => r.RuleId == ruleId);
            if (rule == null) return DeleteResult.NotFound("Rule not found.");
            if (rule.IsSystem) return DeleteResult.Refused("Built-in rules cannot be deleted.");
            if (rule.IsActive) return DeleteResult.Refused("Deactivate this rule first. Only deactivated rules can be deleted.");

            _db.PaymentRules.Remove(rule);
            await _db.SaveChangesAsync();
            return new DeleteResult(true, 200, $"{rule.Title} was deleted.", Name: rule.Title);
        }

        private async Task<int> CountAsync(string table, string column, int id) =>
            await _db.Database.SqlQueryRaw<int>($"SELECT COUNT(*) AS Value FROM [{table}] WHERE [{column}] = {{0}}", id).SingleAsync();
    }
}
