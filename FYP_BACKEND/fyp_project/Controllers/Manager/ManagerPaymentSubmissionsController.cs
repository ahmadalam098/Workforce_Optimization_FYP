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
    public class RejectPaymentRequest
    {
        [Required(ErrorMessage = "Give the reason. The organization sees it."), StringLength(255), MinTrimmedLength(5)] public string Reason { get; set; } = string.Empty;
    }

    /// <summary>
    /// Organization Manager portal: the payments your organizations say they made. Check the reference and the proof, then verify the payment (the admin
    /// approves it next) or reject it with a reason.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/billing/submissions")]
    public class ManagerPaymentSubmissionsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly PaymentSubmissionService _submissions;

        public ManagerPaymentSubmissionsController(WorkforceManagementDbContext db, PaymentSubmissionService submissions)
        {
            _db = db;
            _submissions = submissions;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        private async Task<List<int>> MyOrgsAsync() =>
            await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == Me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();

        // GET api/manager/billing/submissions?status=Pending|Verified|Approved|Rejected|Withdrawn
        [HttpGet]
        public async Task<IActionResult> List(string? status)
        {
            var orgs = await MyOrgsAsync();
            var query = _db.PaymentSubmissions.AsNoTracking().Where(s => orgs.Contains(s.OrgId));
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(s => s.Status == status);
            return Ok(await _submissions.RowsAsync(query));
        }

        // GET api/manager/billing/submissions/pending-count
        [HttpGet("pending-count")]
        public async Task<IActionResult> PendingCount()
        {
            var orgs = await MyOrgsAsync();
            return Ok(new { count = await _db.PaymentSubmissions.CountAsync(s => orgs.Contains(s.OrgId) && s.Status == PaymentSubmission.Pending) });
        }

        // POST api/manager/billing/submissions/5/verify
        [HttpPost("{submissionId:int}/verify")]
        public async Task<IActionResult> Verify(int submissionId)
        {
            var (status, message) = await _submissions.VerifyAsync(submissionId, Me);
            return StatusCode(status, new { message });
        }

        // POST api/manager/billing/submissions/5/reject   { reason }
        [HttpPost("{submissionId:int}/reject")]
        public async Task<IActionResult> Reject(int submissionId, [FromBody] RejectPaymentRequest request)
        {
            var (status, message) = await _submissions.RejectAsync(submissionId, Me, false, request.Reason.Trim());
            return StatusCode(status, new { message });
        }
    }
}
