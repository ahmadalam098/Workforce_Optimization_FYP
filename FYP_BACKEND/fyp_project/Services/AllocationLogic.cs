using System.Linq.Expressions;
using fyp_project.Models;

namespace fyp_project.Services
{
    /// <summary>One broken rule found when checking an allocation.</summary>
    public record AllocationViolation(string Code, string Message, bool Overridable);

    public static class AllocationLogic
    {
        // Existing data may use other words, so "open" means "not ended and not in a closed status".
        public static readonly string[] ClosedStatuses = { "Completed", "Reallocated", "Cancelled", "Released", "Ended" };

        public static readonly Expression<Func<EmployeeAllocation, bool>> IsOpen =
            a => a.ActualEndDatetime == null && (a.Status == null || !ClosedStatuses.Contains(a.Status));

        public const string Normal = "Normal";
        public const string Temporary = "Temporary";

        // Allocation_History.action_type values written by this system
        public const string ActionAllocated = "Allocated";
        public const string ActionReallocated = "Reallocated";
        public const string ActionReleased = "Released";

        public static readonly string[] AvailableStatuses = { "Available", "Idle" };

        public static string Trim(string? text, int max) =>
            string.IsNullOrEmpty(text) ? string.Empty : text.Length <= max ? text : text[..max];
    }
}
