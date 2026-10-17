using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>Shared rules of the employee reviews (organization -> manager -> admin).</summary>
    public static class EmployeeReviewLogic
    {
        public const string StatusNew = "New";
        public const string StatusWarned = "Warned";
        public const string StatusEscalated = "Escalated";
        public const string StatusDismissed = "Dismissed";
        public const string StatusResolved = "Resolved";

        /// <summary>A review with this rating or lower is a bad review: the manager is asked to act on it.</summary>
        public const decimal BadRatingMax = 2m;

        public static bool IsBad(decimal? rating) => rating != null && rating <= BadRatingMax;

        public static string StatusOf(OrganizationReview review) => string.IsNullOrWhiteSpace(review.Status) ? StatusNew : review.Status!;

        /// <summary>The employee's rating is the average of every review the organizations gave (so allocation and reports use it).</summary>
        public static async Task RefreshRatingAsync(WorkforceManagementDbContext db, int empId)
        {
            var ratings = await db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId == empId && r.Ratings != null).Select(r => r.Ratings!.Value).ToListAsync();
            if (ratings.Count == 0) return;
            var employee = await db.Employees.FirstOrDefaultAsync(e => e.EmpId == empId);
            if (employee == null) return;
            employee.Rating = Math.Round(ratings.Average(), 2);
            await db.SaveChangesAsync();
        }
    }
}
