using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class ReviewActionRequest
    {
        [Required(ErrorMessage = "Write a message."), StringLength(500), MinTrimmedLength(5)] public string Message { get; set; } = string.Empty;
    }

    public class ReviewDismissRequest
    {
        [StringLength(500)] public string? Note { get; set; }
    }

    /// <summary>
    /// Organization Manager portal: the reviews the manager's organizations gave to the employees who work for them. A bad review needs action:
    /// the manager warns the employee, or - when it is serious - asks the admin to act (the admin may even deactivate the employee). The manager
    /// judges which one; a review that needs nothing is dismissed.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/reviews")]
    public class ManagerReviewsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public ManagerReviewsController(WorkforceManagementDbContext db, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _audit = audit;
            _mailer = mailer;
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
        }

        private IActionResult Problem(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        private async Task<IQueryable<OrganizationReview>> MineAsync()
        {
            var orgIds = await MyOrganizationIdsAsync();
            return _db.OrganizationReviews.Where(r => r.OrgId != null && orgIds.Contains(r.OrgId.Value));
        }

        // GET api/manager/reviews/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var rows = await (await MineAsync()).AsNoTracking().Select(r => new { r.Ratings, r.Status }).ToListAsync();
            bool Open(string? s) => string.IsNullOrWhiteSpace(s) || s == EmployeeReviewLogic.StatusNew;
            return Ok(new
            {
                total = rows.Count,
                badToHandle = rows.Count(r => EmployeeReviewLogic.IsBad(r.Ratings) && Open(r.Status)),
                warned = rows.Count(r => r.Status == EmployeeReviewLogic.StatusWarned),
                escalated = rows.Count(r => r.Status == EmployeeReviewLogic.StatusEscalated),
                average = rows.Count == 0 ? (decimal?)null : Math.Round(rows.Where(r => r.Ratings != null).Average(r => r.Ratings!.Value), 2),
            });
        }

        // GET api/manager/reviews?status=New|Warned|Escalated|Dismissed|Resolved&bad=true&orgId=&search=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? status, bool? bad, int? orgId, string? search, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var query = (await MineAsync()).AsNoTracking();
            if (orgId.HasValue) query = query.Where(r => r.OrgId == orgId);
            if (bad == true) query = query.Where(r => r.Ratings <= EmployeeReviewLogic.BadRatingMax);
            if (status == EmployeeReviewLogic.StatusNew) query = query.Where(r => r.Status == null || r.Status == EmployeeReviewLogic.StatusNew);
            else if (!string.IsNullOrWhiteSpace(status)) query = query.Where(r => r.Status == status);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(r => (r.Emp != null && r.Emp.User!.Name != null && r.Emp.User.Name.Contains(term)) || (r.Comments != null && r.Comments.Contains(term)));
            }

            var total = await query.CountAsync();
            var items = await query
                .OrderBy(r => r.Ratings <= EmployeeReviewLogic.BadRatingMax && (r.Status == null || r.Status == EmployeeReviewLogic.StatusNew) ? 0 : 1)
                .ThenByDescending(r => r.ReviewDate)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(r => new
                {
                    reviewId = r.ReviewId,
                    employeeId = r.EmpId,
                    userId = r.Emp != null ? r.Emp.UserId : null,
                    hasPicture = r.Emp != null && r.Emp.User!.ProfilePicturePath != null,
                    employeeName = r.Emp != null ? r.Emp.User!.Name : null,
                    orgId = r.OrgId,
                    orgName = r.Org != null ? r.Org.OrgName : null,
                    rating = r.Ratings,
                    comment = r.Comments,
                    date = r.ReviewDate,
                    status = r.Status,
                })
                .ToListAsync();
            return Ok(new
            {
                items = items.Select(r => new { r.reviewId, r.employeeId, r.userId, r.hasPicture, r.employeeName, r.orgId, r.orgName, r.rating, r.comment, r.date, status = string.IsNullOrWhiteSpace(r.status) ? EmployeeReviewLogic.StatusNew : r.status, isBad = EmployeeReviewLogic.IsBad(r.rating) }),
                total, page, pageSize,
            });
        }

        // GET api/manager/reviews/5
        [HttpGet("{reviewId:int}")]
        public async Task<IActionResult> Get(int reviewId)
        {
            var review = await (await MineAsync()).AsNoTracking().Include(r => r.Org).Include(r => r.Emp).ThenInclude(e => e!.User).FirstOrDefaultAsync(r => r.ReviewId == reviewId);
            if (review?.EmpId == null) return NotFound(new { message = "Review not found." });
            var empId = review.EmpId.Value;

            var others = await _db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId == empId && r.ReviewId != reviewId).OrderByDescending(r => r.ReviewDate).Take(10)
                .Select(r => new { reviewId = r.ReviewId, organizationName = r.Org != null ? r.Org.OrgName : null, rating = r.Ratings, comment = r.Comments, date = r.ReviewDate }).ToListAsync();
            var warnings = await _db.EmployeeWarnings.AsNoTracking().Where(w => w.EmpId == empId).OrderByDescending(w => w.WarningId).Take(10)
                .Select(w => new { w.WarningId, w.Message, w.IssuedByRole, w.ReviewId, w.CreatedAt }).ToListAsync();
            var escalation = await _db.ReviewEscalations.AsNoTracking().Where(x => x.ReviewId == reviewId).OrderByDescending(x => x.EscalationId).FirstOrDefaultAsync();
            var status = EmployeeReviewLogic.StatusOf(review);

            return Ok(new
            {
                reviewId,
                employeeId = empId,
                userId = review.Emp?.UserId,
                employeeName = review.Emp?.User?.Name,
                employeeRating = review.Emp?.Rating,
                employeeActive = review.Emp?.User?.IsActive == true,
                orgId = review.OrgId,
                orgName = review.Org?.OrgName,
                rating = review.Ratings,
                comment = review.Comments,
                date = review.ReviewDate,
                status,
                isBad = EmployeeReviewLogic.IsBad(review.Ratings),
                handledNote = review.HandledNote,
                handledAt = review.HandledAt,
                canAct = status is EmployeeReviewLogic.StatusNew or EmployeeReviewLogic.StatusWarned,
                escalation = escalation == null ? null : new { note = escalation.Note, status = escalation.Status, adminAction = escalation.AdminAction, adminResponse = escalation.AdminResponse, createdAt = escalation.CreatedAt, decidedAt = escalation.DecidedAt },
                otherReviews = others,
                warnings,
            });
        }

        private async Task<(OrganizationReview? Review, IActionResult? Error)> ActableAsync(int reviewId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var review = await _db.OrganizationReviews.FirstOrDefaultAsync(r => r.ReviewId == reviewId && r.OrgId != null && orgIds.Contains(r.OrgId.Value));
            if (review?.EmpId == null) return (null, NotFound(new { message = "Review not found." }));
            var status = EmployeeReviewLogic.StatusOf(review);
            if (status is not (EmployeeReviewLogic.StatusNew or EmployeeReviewLogic.StatusWarned))
                return (null, Conflict(new { message = $"This review is already {status.ToLower()}." }));
            return (review, null);
        }

        // POST api/manager/reviews/5/warn   { message }   (the employee is told; it stays on their record)
        [HttpPost("{reviewId:int}/warn")]
        public async Task<IActionResult> Warn(int reviewId, [FromBody] ReviewActionRequest body)
        {
            var (review, error) = await ActableAsync(reviewId);
            if (review == null) return error!;
            var empId = review.EmpId!.Value;
            var userId = await _db.Employees.AsNoTracking().Where(e => e.EmpId == empId).Select(e => e.UserId).FirstOrDefaultAsync();

            _db.EmployeeWarnings.Add(new EmployeeWarning { EmpId = empId, ReviewId = reviewId, IssuedByUserId = CurrentUserId, IssuedByRole = "Manager", Message = body.Message.Trim(), CreatedAt = DateTime.UtcNow });
            review.Status = EmployeeReviewLogic.StatusWarned;
            review.HandledByUserId = CurrentUserId;
            review.HandledAt = DateTime.UtcNow;
            review.HandledNote = body.Message.Trim();
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_WARNED", "Employee", empId, $"Warning from the organization manager: {body.Message.Trim()}");
            var emailNote = userId == null ? string.Empty : await _mailer.SendPersonEventAsync(CurrentUserId, userId.Value, PersonEvent.Warned, body.Message.Trim());
            return Ok(new { message = "Warning sent to the employee." + emailNote });
        }

        // POST api/manager/reviews/5/dismiss   { note? }   (no action is needed)
        [HttpPost("{reviewId:int}/dismiss")]
        public async Task<IActionResult> Dismiss(int reviewId, [FromBody] ReviewDismissRequest? body)
        {
            var (review, error) = await ActableAsync(reviewId);
            if (review == null) return error!;
            review.Status = EmployeeReviewLogic.StatusDismissed;
            review.HandledByUserId = CurrentUserId;
            review.HandledAt = DateTime.UtcNow;
            review.HandledNote = ContractLogic.Clean(body?.Note);
            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_REVIEW_DISMISSED", "EmployeeReview", reviewId, review.HandledNote ?? "No action needed.");
            return Ok(new { message = "Review marked as handled. No action taken." });
        }

        // POST api/manager/reviews/5/escalate   { message }   (the manager asks the admin to act; the admin decides)
        [HttpPost("{reviewId:int}/escalate")]
        public async Task<IActionResult> Escalate(int reviewId, [FromBody] ReviewActionRequest body)
        {
            var (review, error) = await ActableAsync(reviewId);
            if (review == null) return error!;

            _db.ReviewEscalations.Add(new ReviewEscalation { ReviewId = reviewId, EmpId = review.EmpId!.Value, RequestedByUserId = CurrentUserId, Note = body.Message.Trim(), CreatedAt = DateTime.UtcNow });
            review.Status = EmployeeReviewLogic.StatusEscalated;
            review.HandledByUserId = CurrentUserId;
            review.HandledAt = DateTime.UtcNow;
            review.HandledNote = body.Message.Trim();
            await _db.SaveChangesAsync();

            var name = await _db.Employees.AsNoTracking().Where(e => e.EmpId == review.EmpId).Select(e => e.User!.Name).FirstOrDefaultAsync();
            await _audit.LogAsync(CurrentUserId, "REVIEW_ESCALATED", "EmployeeReview", reviewId, $"The organization manager asks the admin to act about {name} ({review.Ratings}/5): {body.Message.Trim()}");
            return Ok(new { message = "Sent to the admin. They will decide and you will be told." });
        }
    }
}
