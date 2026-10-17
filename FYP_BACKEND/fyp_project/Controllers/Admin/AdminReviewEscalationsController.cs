using System.ComponentModel.DataAnnotations;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    public class EscalationDecisionRequest
    {
        /// <summary>Deactivate | Warn | Dismiss</summary>
        [Required(ErrorMessage = "Choose what to do.")] public string Action { get; set; } = string.Empty;

        [Required(ErrorMessage = "Write your comment for the manager."), StringLength(500), MinTrimmedLength(5)] public string Response { get; set; } = string.Empty;
    }

    /// <summary>
    /// Admin portal: serious reviews that an organization manager sent to the admin. The admin decides: dismiss it, warn the employee, or deactivate
    /// the employee - which also releases them from every organization, and they cannot sign in again until the admin activates them.
    /// </summary>
    [Route("api/admin/review-escalations")]
    public class AdminReviewEscalationsController : AdminControllerBase
    {
        private static readonly string[] Actions = { "Deactivate", "Warn", "Dismiss" };

        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly EmployeeStatusService _status;
        private readonly IdGenerator _ids;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminReviewEscalationsController(WorkforceManagementDbContext db, AllocationService allocations, EmployeeStatusService status, IdGenerator ids, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _allocations = allocations;
            _status = status;
            _ids = ids;
            _audit = audit;
            _mailer = mailer;
        }

        // GET api/admin/review-escalations?status=Pending|Decided|all  (default Pending)
        [HttpGet]
        public async Task<IActionResult> List(string? status)
        {
            var query = _db.ReviewEscalations.AsNoTracking().AsQueryable();
            if (status != "all") query = query.Where(x => x.Status == (status ?? ReviewEscalation.Pending));
            var rows = await (from x in query
                              join r in _db.OrganizationReviews.AsNoTracking() on x.ReviewId equals r.ReviewId
                              orderby x.EscalationId descending
                              select new
                              {
                                  escalationId = x.EscalationId,
                                  reviewId = x.ReviewId,
                                  employeeId = x.EmpId,
                                  employeeName = r.Emp!.User!.Name,
                                  employeeActive = r.Emp.User.IsActive == true,
                                  organizationName = r.Org != null ? r.Org.OrgName : null,
                                  rating = r.Ratings,
                                  comment = r.Comments,
                                  managerNote = x.Note,
                                  status = x.Status,
                                  adminAction = x.AdminAction,
                                  adminResponse = x.AdminResponse,
                                  createdAt = x.CreatedAt,
                                  decidedAt = x.DecidedAt,
                              }).Take(200).ToListAsync();
            return Ok(rows);
        }

        // GET api/admin/review-escalations/pending-count
        [HttpGet("pending-count")]
        public async Task<IActionResult> PendingCount() => Ok(new { count = await _db.ReviewEscalations.CountAsync(x => x.Status == ReviewEscalation.Pending) });

        // GET api/admin/review-escalations/3
        [HttpGet("{escalationId:int}")]
        public async Task<IActionResult> Get(int escalationId)
        {
            var x = await _db.ReviewEscalations.AsNoTracking().FirstOrDefaultAsync(e => e.EscalationId == escalationId);
            if (x == null) return NotFoundMessage("Request not found.");
            var review = await _db.OrganizationReviews.AsNoTracking().Include(r => r.Org).FirstOrDefaultAsync(r => r.ReviewId == x.ReviewId);
            var employee = await _db.Employees.AsNoTracking().Where(e => e.EmpId == x.EmpId)
                .Select(e => new { e.EmpId, Name = e.User!.Name, e.Rating, Active = e.User.IsActive == true, Home = e.Org != null ? e.Org.OrgName : null }).FirstOrDefaultAsync();
            var manager = await _db.Users.AsNoTracking().Where(u => u.UserId == x.RequestedByUserId).Select(u => u.Name).FirstOrDefaultAsync();
            var reviews = await _db.OrganizationReviews.AsNoTracking().Where(r => r.EmpId == x.EmpId).OrderByDescending(r => r.ReviewDate).Take(10)
                .Select(r => new { reviewId = r.ReviewId, organizationName = r.Org != null ? r.Org.OrgName : null, rating = r.Ratings, comment = r.Comments, date = r.ReviewDate }).ToListAsync();
            var warnings = await _db.EmployeeWarnings.AsNoTracking().Where(w => w.EmpId == x.EmpId).OrderByDescending(w => w.WarningId).Take(10)
                .Select(w => new { w.Message, w.IssuedByRole, w.CreatedAt }).ToListAsync();

            return Ok(new
            {
                escalationId, reviewId = x.ReviewId, status = x.Status, managerName = manager, managerNote = x.Note, createdAt = x.CreatedAt,
                adminAction = x.AdminAction, adminResponse = x.AdminResponse, decidedAt = x.DecidedAt,
                employee, organizationName = review?.Org?.OrgName, rating = review?.Ratings, comment = review?.Comments, reviewDate = review?.ReviewDate,
                reviews, warnings,
            });
        }

        // POST api/admin/review-escalations/3/decide   { action: Deactivate|Warn|Dismiss, response }
        [HttpPost("{escalationId:int}/decide")]
        public async Task<IActionResult> Decide(int escalationId, [FromBody] EscalationDecisionRequest request)
        {
            if (!Actions.Contains(request.Action)) return FieldError("action", "Choose Deactivate, Warn or Dismiss.");
            var response = request.Response.Trim();

            var x = await _db.ReviewEscalations.FirstOrDefaultAsync(e => e.EscalationId == escalationId);
            if (x == null) return NotFoundMessage("Request not found.");
            if (x.Status != ReviewEscalation.Pending) return ConflictMessage("This request was already decided.");

            var employee = await _db.Employees.Include(e => e.User).FirstOrDefaultAsync(e => e.EmpId == x.EmpId);
            if (employee?.User == null) return NotFoundMessage("Employee not found.");
            var review = await _db.OrganizationReviews.FirstOrDefaultAsync(r => r.ReviewId == x.ReviewId);

            var released = 0;
            string outcome;
            if (request.Action == "Deactivate")
            {
                // The employee leaves every organization they work for, then cannot sign in until the admin activates them again.
                var open = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen).Where(a => a.EmployeeId == employee.EmpId).Select(a => a.AllocationId).ToListAsync();
                foreach (var allocationId in open)
                {
                    var released_ = await _allocations.ReleaseAsync(allocationId, "Deactivated after a bad review", CurrentUserId);
                    if (!released_.Success) return ConflictMessage($"The employee could not be released from an organization: {released_.Message}");
                    released++;
                }
                using (await _ids.LockAsync())
                {
                    employee = await _db.Employees.Include(e => e.User).FirstAsync(e => e.EmpId == x.EmpId);
                    employee.User!.IsActive = false;
                    await _status.ChangeAsync(employee, "Offline", "Deactivated after a bad review", CurrentUserId);
                    await _db.SaveChangesAsync();
                }
                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_DEACTIVATED", "Employee", employee.EmpId, $"After a bad review: {response}");
                await _mailer.SendPersonEventAsync(CurrentUserId, employee.User!.UserId, PersonEvent.Deactivated, response);
                outcome = $"deactivated and removed from {(released == 0 ? "the organizations" : $"{released} allocation(s)")}";
            }
            else if (request.Action == "Warn")
            {
                _db.EmployeeWarnings.Add(new EmployeeWarning { EmpId = employee.EmpId, ReviewId = x.ReviewId, IssuedByUserId = CurrentUserId, IssuedByRole = "Admin", Message = response, CreatedAt = DateTime.UtcNow });
                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_WARNED", "Employee", employee.EmpId, $"Warning from the admin: {response}");
                await _mailer.SendPersonEventAsync(CurrentUserId, employee.User.UserId, PersonEvent.Warned, response);
                outcome = "warned";
            }
            else
            {
                outcome = "dismissed (no action)";
            }

            x.Status = ReviewEscalation.Decided;
            x.AdminAction = request.Action;
            x.AdminResponse = response;
            x.DecidedByUserId = CurrentUserId;
            x.DecidedAt = DateTime.UtcNow;
            if (review != null)
            {
                review.Status = EmployeeReviewLogic.StatusResolved;
                review.HandledNote = response;
                review.HandledAt = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync();

            // The manager's bell shows it (it belongs to their organization's review).
            await _audit.LogAsync(CurrentUserId, "REVIEW_ESCALATION_DECIDED", "EmployeeReview", x.ReviewId, $"The admin decided about {employee.User!.Name}: {outcome}. {response}");
            return Ok(new { message = $"Done: the employee is {outcome}.", action = request.Action });
        }
    }
}
