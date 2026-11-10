using System.Security.Claims;
using System.Text.Json;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class AutopilotSwitchRequest
    {
        public bool Enabled { get; set; }
    }

    public class AutopilotRunRequest
    {
        /// <summary>true: place the employees now. false: only write suggestions to review.</summary>
        public bool Apply { get; set; }
    }

    public class AutopilotLockRequest
    {
        public bool Locked { get; set; }
    }

    public class AutopilotRejectRequest
    {
        public string? Note { get; set; }
    }

    public class AutopilotRecallRequest
    {
        public string? Reason { get; set; }
    }

    /// <summary>
    /// Organization Manager portal: the AI autopilot. The manager switches it on for an organization (it keeps the contract minimum and the
    /// approved staff requests filled from the best-fit employees, lends and recalls employees between organizations), reviews every choice with
    /// its reason, and keeps full control: apply / reject suggestions, undo, lock an assignment so the AI never moves it, recall a loan.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/autopilot")]
    public class ManagerAutopilotController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AutopilotService _autopilot;
        private readonly PlannerGateway _planner;

        public ManagerAutopilotController(WorkforceManagementDbContext db, AutopilotService autopilot, PlannerGateway planner)
        {
            _db = db;
            _autopilot = autopilot;
            _planner = planner;
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

        private static JsonElement? Parse(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JsonDocument.Parse(json).RootElement.Clone(); }
            catch (JsonException) { return null; }
        }

        // GET api/manager/autopilot
        [HttpGet]
        public async Task<IActionResult> Overview()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var orgs = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).OrderBy(o => o.OrgName).ToListAsync();
            var settings = await _db.AutopilotSettings.AsNoTracking().Where(s => orgIds.Contains(s.OrgId)).ToDictionaryAsync(s => s.OrgId);

            var result = new List<object>();
            foreach (var org in orgs)
            {
                var state = await _autopilot.MinimumStateAsync(org.OrgId);
                settings.TryGetValue(org.OrgId, out var setting);
                var working = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen).Where(a => a.AssignOrgId == org.OrgId)
                    .OrderByDescending(a => a.StartDatetime).Take(60)
                    .Select(a => new
                    {
                        allocationId = a.AllocationId,
                        employeeId = a.EmployeeId,
                        name = a.Employee!.User!.Name,
                        source = a.Source ?? "Manual",
                        locked = a.Locked,
                        isLoan = a.OwnerOrgId != a.AssignOrgId,
                        homeOrgName = a.OwnerOrg != null ? a.OwnerOrg.OrgName : null,
                        isMinimum = a.WorkforceRequestId == null,
                        since = a.StartDatetime,
                        until = a.ExpectedEndDatetime,
                    }).ToListAsync();

                result.Add(new
                {
                    orgId = org.OrgId,
                    orgName = org.OrgName,
                    enabled = setting?.Enabled ?? false,
                    askEmployees = setting?.AskEmployees ?? true,
                    offersWaiting = await _db.AssignmentOffers.AsNoTracking().CountAsync(o => o.OrgId == org.OrgId && o.Status == AssignmentOffer.Pending && o.Note == AutopilotService.AiOfferNote),
                    lastRunAt = setting?.LastRunAt,
                    lastMessage = setting?.LastMessage,
                    contractId = state.Contract?.ContractId,
                    contractNumber = state.Contract?.ContractNumber,
                    isDaily = state.IsDaily,
                    window = state.Contract?.StartTime != null && state.Contract?.EndTime != null ? $"{state.Contract.StartTime:HH\\:mm} - {state.Contract.EndTime:HH\\:mm}" : null,
                    min = state.Min,
                    max = state.Max,
                    have = state.Have,
                    atOrg = state.AtOrg,
                    missing = Math.Max(0, state.Min - state.Have),
                    borrowingAllowed = state.Contract?.BorrowingAllowed,
                    problem = state.Problem,
                    working,
                });
            }

            return Ok(new
            {
                planner = new { configured = _planner.IsConfigured, reachable = await _planner.IsReachableAsync(), mode = _planner.IsConfigured && await _planner.IsReachableAsync() ? PlannerGateway.ServiceName : LocalPlanner.Name },
                recallMinutes = _autopilot.RecallMinutes,
                offerMinutes = _autopilot.OfferMinutes,
                serverTime = DateTime.UtcNow,
                organizations = result,
            });
        }

        // PUT api/manager/autopilot/5/enabled   { enabled }
        [HttpPut("{orgId:int}/enabled")]
        public async Task<IActionResult> Switch(int orgId, [FromBody] AutopilotSwitchRequest body)
        {
            if (!(await MyOrganizationIdsAsync()).Contains(orgId)) return NotFound(new { message = "Organization not found." });
            await _autopilot.SetEnabledAsync(orgId, body.Enabled, CurrentUserId);
            if (!body.Enabled) return Ok(new { message = "Autopilot is off. Nothing changes by itself now." });

            var run = await _autopilot.RunOrgAsync(orgId, apply: true, "Manager", CurrentUserId);
            return Ok(new { message = "Autopilot is on. " + run.Message, run });
        }

        // PUT api/manager/autopilot/5/ask-employees   { enabled }   (true: the AI sends offers the employees accept or decline; false: it places at once)
        [HttpPut("{orgId:int}/ask-employees")]
        public async Task<IActionResult> AskEmployees(int orgId, [FromBody] AutopilotSwitchRequest body)
        {
            if (!(await MyOrganizationIdsAsync()).Contains(orgId)) return NotFound(new { message = "Organization not found." });
            await _autopilot.SetAskEmployeesAsync(orgId, body.Enabled, CurrentUserId);
            return Ok(new { message = body.Enabled ? "The AI now asks each employee first: they get an offer to accept or decline." : "The AI now places employees at once (they are told)." });
        }

        // POST api/manager/autopilot/5/run   { apply }
        [HttpPost("{orgId:int}/run")]
        public async Task<IActionResult> Run(int orgId, [FromBody] AutopilotRunRequest body)
        {
            if (!(await MyOrganizationIdsAsync()).Contains(orgId)) return NotFound(new { message = "Organization not found." });
            var run = await _autopilot.RunOrgAsync(orgId, body.Apply, "Manager", CurrentUserId);
            return Ok(new { message = run.Message, run });
        }

        // GET api/manager/autopilot/decisions?orgId=&status=&page=&pageSize=
        [HttpGet("decisions")]
        public async Task<IActionResult> Decisions(int? orgId, string? status, int page = 1, int pageSize = 12)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var query = _db.AiDecisions.AsNoTracking().Where(d => orgIds.Contains(d.OrgId));
            if (orgId != null) query = query.Where(d => d.OrgId == orgId);
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(d => d.Status == status);

            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var total = await query.CountAsync();
            var rows = await query.OrderByDescending(d => d.DecisionId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            var empIds = rows.Select(r => r.EmpId).Distinct().ToList();
            var names = await _db.Employees.AsNoTracking().Where(e => empIds.Contains(e.EmpId)).Select(e => new { e.EmpId, Name = e.User!.Name }).ToDictionaryAsync(e => e.EmpId, e => e.Name);
            var orgNames = await _db.Organizations.AsNoTracking().ToDictionaryAsync(o => o.OrgId, o => o.OrgName);
            var allocationIds = rows.Where(r => r.AllocationId != null).Select(r => r.AllocationId!.Value).ToList();
            var openAllocations = (await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Where(a => allocationIds.Contains(a.AllocationId)).Select(a => a.AllocationId).ToListAsync()).ToHashSet();

            var items = rows.Select(d => new
            {
                decisionId = d.DecisionId,
                orgId = d.OrgId,
                orgName = orgNames.GetValueOrDefault(d.OrgId),
                kind = d.Kind,
                employeeId = d.EmpId,
                employeeName = names.GetValueOrDefault(d.EmpId),
                fromOrgName = d.FromOrgId != null ? orgNames.GetValueOrDefault(d.FromOrgId.Value) : null,
                isLoan = d.FromOrgId != null && d.FromOrgId != d.OrgId,
                requestId = d.WorkforceRequestId,
                score = d.Score,
                reason = d.Reason,
                breakdown = Parse(d.Breakdown),
                alternatives = Parse(d.Alternatives),
                status = d.Status,
                planner = d.Planner,
                triggerBy = d.TriggerBy,
                note = d.Note,
                createdAt = d.CreatedAt,
                decidedAt = d.DecidedAt,
                canApply = d.Status == AiDecision.Suggested,
                canUndo = (d.Status == AiDecision.Applied && d.AllocationId != null && openAllocations.Contains(d.AllocationId.Value)) || d.Status == AiDecision.Offered,
                allocationId = d.AllocationId,
            });
            return Ok(new { items, total, page, pageSize });
        }

        private async Task<AiDecision?> MyDecisionAsync(int id)
        {
            var orgIds = await MyOrganizationIdsAsync();
            return await _db.AiDecisions.FirstOrDefaultAsync(d => d.DecisionId == id && orgIds.Contains(d.OrgId));
        }

        // POST api/manager/autopilot/decisions/7/apply
        [HttpPost("decisions/{id:int}/apply")]
        public async Task<IActionResult> Apply(int id)
        {
            var decision = await MyDecisionAsync(id);
            if (decision == null) return NotFound(new { message = "Decision not found." });
            var (ok, message) = await _autopilot.ApplyAsync(decision, CurrentUserId);
            return ok ? Ok(new { message = "Placed. " + message }) : Conflict(new { message });
        }

        // POST api/manager/autopilot/decisions/7/reject   { note }
        [HttpPost("decisions/{id:int}/reject")]
        public async Task<IActionResult> Reject(int id, [FromBody] AutopilotRejectRequest? body)
        {
            var decision = await MyDecisionAsync(id);
            if (decision == null) return NotFound(new { message = "Decision not found." });
            var (ok, message) = await _autopilot.RejectAsync(decision, CurrentUserId, body?.Note);
            return ok ? Ok(new { message }) : Conflict(new { message });
        }

        // POST api/manager/autopilot/decisions/7/undo
        [HttpPost("decisions/{id:int}/undo")]
        public async Task<IActionResult> Undo(int id)
        {
            var decision = await MyDecisionAsync(id);
            if (decision == null) return NotFound(new { message = "Decision not found." });
            var (ok, message) = await _autopilot.UndoAsync(decision, CurrentUserId);
            return ok ? Ok(new { message }) : Conflict(new { message });
        }

        // POST api/manager/autopilot/allocations/12/lock   { locked }
        [HttpPost("allocations/{allocationId:int}/lock")]
        public async Task<IActionResult> Lock(int allocationId, [FromBody] AutopilotLockRequest body)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var mine = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .AnyAsync(a => a.AllocationId == allocationId && a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value));
            if (!mine) return NotFound(new { message = "Allocation not found." });
            var (ok, message) = await _autopilot.SetLockAsync(allocationId, body.Locked, CurrentUserId);
            return ok ? Ok(new { message }) : Conflict(new { message });
        }

        // GET api/manager/autopilot/loans
        [HttpGet("loans")]
        public async Task<IActionResult> Loans()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var rows = await _db.EmployeeLoans.AsNoTracking()
                .Where(l => orgIds.Contains(l.LenderOrgId) || orgIds.Contains(l.BorrowerOrgId))
                .OrderBy(l => l.Status == EmployeeLoan.Returned ? 1 : 0).ThenByDescending(l => l.LoanId)
                .Take(60).ToListAsync();

            var empIds = rows.Select(r => r.EmpId).Concat(rows.Where(r => r.SubstituteEmpId != null).Select(r => r.SubstituteEmpId!.Value)).Distinct().ToList();
            var names = await _db.Employees.AsNoTracking().Where(e => empIds.Contains(e.EmpId)).Select(e => new { e.EmpId, Name = e.User!.Name }).ToDictionaryAsync(e => e.EmpId, e => e.Name);
            var orgNames = await _db.Organizations.AsNoTracking().ToDictionaryAsync(o => o.OrgId, o => o.OrgName);

            return Ok(new
            {
                serverTime = DateTime.UtcNow,
                items = rows.Select(l => new
                {
                    loanId = l.LoanId,
                    employeeId = l.EmpId,
                    employeeName = names.GetValueOrDefault(l.EmpId),
                    lenderOrgId = l.LenderOrgId,
                    lenderOrgName = orgNames.GetValueOrDefault(l.LenderOrgId),
                    borrowerOrgId = l.BorrowerOrgId,
                    borrowerOrgName = orgNames.GetValueOrDefault(l.BorrowerOrgId),
                    status = l.Status,
                    lentAt = l.LentAt,
                    expectedReturnAt = l.ExpectedReturnAt,
                    recallRequestedAt = l.RecallRequestedAt,
                    recallDeadline = l.RecallDeadline,
                    recallReason = l.RecallReason,
                    substituteName = l.SubstituteEmpId != null ? names.GetValueOrDefault(l.SubstituteEmpId.Value) : null,
                    returnedAt = l.ReturnedAt,
                    iAmLender = orgIds.Contains(l.LenderOrgId),
                    iAmBorrower = orgIds.Contains(l.BorrowerOrgId),
                    borrowerAllocationId = l.BorrowerAllocationId,
                }),
            });
        }

        // POST api/manager/autopilot/loans/3/recall   { reason }   (the lender asks for the employee back: 3 minutes)
        [HttpPost("loans/{loanId:int}/recall")]
        public async Task<IActionResult> Recall(int loanId, [FromBody] AutopilotRecallRequest? body)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var loan = await _db.EmployeeLoans.AsNoTracking().FirstOrDefaultAsync(l => l.LoanId == loanId && orgIds.Contains(l.LenderOrgId));
            if (loan == null) return NotFound(new { message = "Loan not found, or the employee is not one of your organizations' employees." });
            var (ok, message) = await _autopilot.RequestRecallAsync(loanId, CurrentUserId, string.IsNullOrWhiteSpace(body?.Reason) ? "The owner organization asked for the employee back" : body!.Reason!.Trim());
            return ok ? Ok(new { message }) : Conflict(new { message });
        }

        // POST api/manager/autopilot/loans/3/return   (the employee goes back now; either side can do it)
        [HttpPost("loans/{loanId:int}/return")]
        public async Task<IActionResult> Return(int loanId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var loan = await _db.EmployeeLoans.AsNoTracking().FirstOrDefaultAsync(l => l.LoanId == loanId && (orgIds.Contains(l.LenderOrgId) || orgIds.Contains(l.BorrowerOrgId)));
            if (loan == null) return NotFound(new { message = "Loan not found." });
            var (ok, message) = await _autopilot.ReturnNowAsync(loanId, CurrentUserId);
            if (!ok) return Conflict(new { message });
            await _autopilot.RefreshAsync(new[] { loan.LenderOrgId, loan.BorrowerOrgId });
            return Ok(new { message });
        }
    }
}
