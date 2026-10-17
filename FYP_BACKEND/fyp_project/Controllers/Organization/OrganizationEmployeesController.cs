using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    public class OrganizationReviewRequest
    {
        [Range(1, 5, ErrorMessage = "Give 1 to 5 stars.")] public int Rating { get; set; }

        [Required(ErrorMessage = "Write a comment."), StringLength(500), MinTrimmedLength(5)] public string Comment { get; set; } = string.Empty;

        /// <summary>The period of work this review is about. Empty: the latest one that was not reviewed yet.</summary>
        public int? AllocationId { get; set; }
    }

    /// <summary>
    /// Organization portal: the employees who work (or worked) for the organization, their information, the reviews the organizations gave them, and the
    /// organization's own review of each. Only employees who were allocated to this organization can be seen and reviewed. The reviews go to the
    /// organization's manager, who warns the employee or asks the admin to act on a bad one.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/employees")]
    public class OrganizationEmployeesController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly IdGenerator _ids;

        public OrganizationEmployeesController(WorkforceManagementDbContext db, AuditService audit, IdGenerator ids)
        {
            _db = db;
            _audit = audit;
            _ids = ids;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private IActionResult Problem(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        // GET api/organization/employees?search=&status=working|former|toReview
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status)
        {
            var orgId = OrgId;
            var allocations = await _db.EmployeeAllocations.AsNoTracking().Where(a => a.AssignOrgId == orgId && a.EmployeeId != null)
                .Select(a => new { a.AllocationId, EmployeeId = a.EmployeeId!.Value, Open = a.ActualEndDatetime == null && (a.Status == "Active" || a.Status == "Assigned") })
                .ToListAsync();
            var empIds = allocations.Select(a => a.EmployeeId).Distinct().ToList();

            var query = _db.Employees.AsNoTracking().Where(e => empIds.Contains(e.EmpId));
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e => e.User!.Name != null && e.User.Name.Contains(term));
            }
            var employees = await query.OrderBy(e => e.User!.Name).Take(300)
                .Select(e => new { e.EmpId, e.UserId, HasPicture = e.User!.ProfilePicturePath != null, Name = e.User.Name, e.Rating, Home = e.Org != null ? e.Org.OrgName : null })
                .ToListAsync();

            var allReviews = await _db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId != null && empIds.Contains(r.EmpId.Value))
                .Select(r => new { EmpId = r.EmpId!.Value, r.OrgId, r.AllocationId, r.Ratings, r.ReviewDate }).ToListAsync();
            var mine = allReviews.Where(r => r.OrgId == orgId).ToList();
            var reviewedAllocations = mine.Where(r => r.AllocationId != null).Select(r => r.AllocationId!.Value).ToHashSet();

            var rows = employees.Select(e =>
            {
                var theirs = allocations.Where(a => a.EmployeeId == e.EmpId).ToList();
                var myLast = mine.Where(r => r.EmpId == e.EmpId).OrderByDescending(r => r.ReviewDate).FirstOrDefault();
                return new
                {
                    employeeId = e.EmpId,
                    userId = e.UserId,
                    hasPicture = e.HasPicture,
                    fullName = e.Name,
                    homeOrgName = e.Home,
                    rating = e.Rating,
                    reviewCount = allReviews.Count(r => r.EmpId == e.EmpId),
                    workingNow = theirs.Any(a => a.Open),
                    canReview = theirs.Any(a => !reviewedAllocations.Contains(a.AllocationId)),
                    myRating = myLast?.Ratings,
                    myReviewDate = myLast?.ReviewDate,
                };
            });
            rows = status switch
            {
                "working" => rows.Where(r => r.workingNow),
                "former" => rows.Where(r => !r.workingNow),
                "toReview" => rows.Where(r => r.canReview),
                _ => rows,
            };
            return Ok(rows.ToList());
        }

        // GET api/organization/employees/5
        [HttpGet("{employeeId:int}")]
        public async Task<IActionResult> Get(int employeeId)
        {
            var orgId = OrgId;
            if (!await _db.EmployeeAllocations.AnyAsync(a => a.AssignOrgId == orgId && a.EmployeeId == employeeId))
                return NotFound(new { message = "This employee has not worked for your organization." });

            var e = await _db.Employees.AsNoTracking().Where(x => x.EmpId == employeeId)
                .Select(x => new { x.EmpId, x.UserId, HasPicture = x.User!.ProfilePicturePath != null, Name = x.User.Name, x.Rating, x.JoiningDate, x.AvailabilityStatus, Home = x.Org != null ? x.Org.OrgName : null, Active = x.User.IsActive == true })
                .FirstOrDefaultAsync();
            if (e == null) return NotFound(new { message = "Employee not found." });

            var skills = await _db.EmployeeSkills.AsNoTracking().Where(s => s.EmpId == employeeId && s.Skill != null).Select(s => s.Skill!.Name).ToListAsync();

            var reviews = await _db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId == employeeId)
                .OrderByDescending(r => r.ReviewDate)
                .Select(r => new { reviewId = r.ReviewId, organizationName = r.Org != null ? r.Org.OrgName : null, mine = r.OrgId == orgId, rating = r.Ratings, comment = r.Comments, date = r.ReviewDate })
                .ToListAsync();

            var reviewed = (await _db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId == employeeId && r.OrgId == orgId && r.AllocationId != null).Select(r => r.AllocationId!.Value).ToListAsync()).ToHashSet();
            var periods = (await _db.EmployeeAllocations.AsNoTracking().Where(a => a.AssignOrgId == orgId && a.EmployeeId == employeeId)
                    .OrderByDescending(a => a.AllocationId)
                    .Select(a => new { a.AllocationId, a.StartDatetime, a.ActualEndDatetime, a.Status }).Take(30).ToListAsync())
                .Select(a => new { allocationId = a.AllocationId, start = a.StartDatetime, end = a.ActualEndDatetime, working = a.ActualEndDatetime == null && (a.Status == "Active" || a.Status == "Assigned"), reviewed = reviewed.Contains(a.AllocationId) })
                .ToList();

            return Ok(new
            {
                employeeId = e.EmpId,
                userId = e.UserId,
                hasPicture = e.HasPicture,
                fullName = e.Name,
                homeOrgName = e.Home,
                joiningDate = e.JoiningDate,
                availabilityStatus = e.AvailabilityStatus,
                isActive = e.Active,
                rating = e.Rating,
                skills,
                reviewCount = reviews.Count,
                reviews,
                periods,
                canReview = periods.Any(p => !p.reviewed),
            });
        }

        // POST api/organization/employees/5/reviews   { rating, comment, allocationId? }
        [HttpPost("{employeeId:int}/reviews")]
        public async Task<IActionResult> Review(int employeeId, [FromBody] OrganizationReviewRequest request)
        {
            var orgId = OrgId;
            var organization = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == orgId);
            if (organization == null) return Unauthorized(new { message = "This organization can no longer sign in." });

            var mine = _db.EmployeeAllocations.AsNoTracking().Where(a => a.AssignOrgId == orgId && a.EmployeeId == employeeId);
            if (!await mine.AnyAsync()) return NotFound(new { message = "This employee has not worked for your organization." });

            var reviewed = (await _db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId == employeeId && r.OrgId == orgId && r.AllocationId != null).Select(r => r.AllocationId!.Value).ToListAsync()).ToHashSet();
            int allocationId;
            if (request.AllocationId.HasValue)
            {
                if (!await mine.AnyAsync(a => a.AllocationId == request.AllocationId)) return Problem("allocationId", "That period of work does not belong to your organization.");
                if (reviewed.Contains(request.AllocationId.Value)) return Conflict(new { message = "You already reviewed this period of work." });
                allocationId = request.AllocationId.Value;
            }
            else
            {
                var open = (await mine.OrderByDescending(a => a.AllocationId).Select(a => a.AllocationId).ToListAsync()).Where(id => !reviewed.Contains(id)).ToList();
                if (open.Count == 0) return Conflict(new { message = "You already reviewed every period this employee worked for you. You can review again after they work for you next time." });
                allocationId = open[0];
            }

            var name = await _db.Employees.AsNoTracking().Where(e => e.EmpId == employeeId).Select(e => e.User!.Name).FirstOrDefaultAsync();
            int reviewId;
            using (await _ids.LockAsync())
            {
                reviewId = await _ids.NextAsync(_db, "Organization_Reviews", "review_id");
                _db.OrganizationReviews.Add(new OrganizationReview
                {
                    ReviewId = reviewId,
                    OrgId = orgId,
                    EmpId = employeeId,
                    AllocationId = allocationId,
                    Ratings = request.Rating,
                    Comments = request.Comment.Trim(),
                    ReviewDate = DateTime.UtcNow,
                    Status = EmployeeReviewLogic.StatusNew,
                });
                await _db.SaveChangesAsync();
            }
            await EmployeeReviewLogic.RefreshRatingAsync(_db, employeeId);

            // No user is behind it: the organization manager's bell shows it (the review belongs to their organization).
            await _audit.LogAsync(null, "EMPLOYEE_REVIEW_SUBMITTED", "EmployeeReview", reviewId,
                $"{organization.OrgName} rated {name} {request.Rating}/5" + (EmployeeReviewLogic.IsBad(request.Rating) ? " (bad review - needs your attention)" : string.Empty));
            return Ok(new { message = EmployeeReviewLogic.IsBad(request.Rating) ? "Review sent. Your manager will look into it." : "Thank you, your review was sent.", reviewId });
        }
    }
}
