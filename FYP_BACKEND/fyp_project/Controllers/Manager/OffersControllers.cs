using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class SendOffersRequest
    {
        [Required, MinLength(1, ErrorMessage = "Choose at least one employee.")] public List<int> EmployeeIds { get; set; } = new();
    }

    public class DeclineOfferRequest
    {
        [StringLength(255)] public string? Note { get; set; }
    }

    /// <summary>
    /// Organization Manager portal: forward an organization's requirement to employees of the pool (offers). The employee accepts or declines in
    /// their own portal; only an accepted offer allocates them (with the usual rules) and puts them online on the organization's screen.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/offers")]
    public class ManagerOffersController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AssignmentOfferService _offers;

        public ManagerOffersController(WorkforceManagementDbContext db, AssignmentOfferService offers)
        {
            _db = db;
            _offers = offers;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        private async Task<IActionResult> SendAsync(string kind, int targetId, SendOffersRequest body)
        {
            var (status, error, results) = await _offers.SendAsync(Me, kind, targetId, body.EmployeeIds);
            if (error != null) return StatusCode(status, new { message = error });
            var sent = results.Count(r => r.Ok);
            var message = sent == results.Count ? $"{sent} offer(s) sent. The employees will accept or decline." : $"{sent} of {results.Count} offer(s) sent. See the list for the others.";
            return Ok(new { message, sent, results });
        }

        // POST api/manager/offers/requests/5   { employeeIds }   (extra employees for an approved staff request)
        [HttpPost("requests/{requestId:int}")]
        public Task<IActionResult> ForRequest(int requestId, [FromBody] SendOffersRequest body) => SendAsync(AssignmentOffer.ForRequest, requestId, body);

        // POST api/manager/offers/minimum/3   { employeeIds }   (minimum staff of an active contract)
        [HttpPost("minimum/{contractId:int}")]
        public Task<IActionResult> ForMinimum(int contractId, [FromBody] SendOffersRequest body) => SendAsync(AssignmentOffer.ForMinimum, contractId, body);

        // GET api/manager/offers?status=Pending|Accepted|Declined|Cancelled|Expired|Failed
        [HttpGet]
        public async Task<IActionResult> List(string? status)
        {
            await _offers.ExpireAsync();
            var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == Me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            var query = _db.AssignmentOffers.AsNoTracking().Where(o => orgIds.Contains(o.OrgId));
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(o => o.Status == status);
            var rows = await (from o in query
                              join e in _db.Employees.AsNoTracking() on o.EmpId equals e.EmpId
                              join org in _db.Organizations.AsNoTracking() on o.OrgId equals org.OrgId
                              orderby o.OfferId descending
                              select new
                              {
                                  offerId = o.OfferId, kind = o.Kind, requestId = o.WorkforceRequestId, contractId = o.ContractId,
                                  orgName = org.OrgName, employeeId = o.EmpId, employeeName = e.User!.Name,
                                  status = o.Status, note = o.Note, createdAt = o.CreatedAt, respondedAt = o.RespondedAt,
                              }).Take(200).ToListAsync();
            return Ok(rows);
        }

        // POST api/manager/offers/5/cancel
        [HttpPost("{offerId:int}/cancel")]
        public async Task<IActionResult> Cancel(int offerId)
        {
            var (status, message) = await _offers.CancelAsync(offerId, Me);
            return StatusCode(status, new { message });
        }
    }

    /// <summary>Employee portal: the assignments the organization manager offers. Accepting allocates the employee to the organization.</summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/offers")]
    public class EmployeeOffersController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AssignmentOfferService _offers;

        public EmployeeOffersController(WorkforceManagementDbContext db, AssignmentOfferService offers)
        {
            _db = db;
            _offers = offers;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // GET api/employee/offers
        [HttpGet]
        public async Task<IActionResult> List()
        {
            await _offers.ExpireAsync();
            var rows = await (from o in _db.AssignmentOffers.AsNoTracking()
                              join e in _db.Employees.AsNoTracking() on o.EmpId equals e.EmpId
                              join org in _db.Organizations.AsNoTracking() on o.OrgId equals org.OrgId
                              where e.UserId == Me
                              orderby o.Status == AssignmentOffer.Pending ? 0 : 1, o.OfferId descending
                              select new
                              {
                                  offerId = o.OfferId, kind = o.Kind, orgName = org.OrgName, status = o.Status, note = o.Note,
                                  createdAt = o.CreatedAt, respondedAt = o.RespondedAt,
                                  requestReason = o.WorkforceRequestId == null ? null : _db.WorkforceRequests.Where(r => r.WorkforceRequestId == o.WorkforceRequestId).Select(r => r.Reason).FirstOrDefault(),
                                  startsAt = o.WorkforceRequestId == null ? null : _db.WorkforceRequests.Where(r => r.WorkforceRequestId == o.WorkforceRequestId).Select(r => r.StartDatetime).FirstOrDefault(),
                                  endsAt = o.WorkforceRequestId == null ? null : _db.WorkforceRequests.Where(r => r.WorkforceRequestId == o.WorkforceRequestId).Select(r => r.EndDatetime).FirstOrDefault(),
                                  expiresAt = o.CreatedAt.AddHours(24),
                              }).Take(100).ToListAsync();
            return Ok(rows);
        }

        // POST api/employee/offers/5/accept
        [HttpPost("{offerId:int}/accept")]
        public async Task<IActionResult> Accept(int offerId)
        {
            var (status, message, _) = await _offers.AcceptAsync(offerId, Me);
            return StatusCode(status, new { message });
        }

        // POST api/employee/offers/5/decline   { note? }
        [HttpPost("{offerId:int}/decline")]
        public async Task<IActionResult> Decline(int offerId, [FromBody] DeclineOfferRequest? body)
        {
            var (status, message) = await _offers.DeclineAsync(offerId, Me, body?.Note);
            return StatusCode(status, new { message });
        }
    }
}
