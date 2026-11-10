using System.Text.Json;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// The loan side of the autopilot: an employee lent to another organization goes back when the work ends, or when the owner needs them
    /// (a recall: the owner asks, the borrower has RecallMinutes - 3 by default - to prepare, a replacement is suggested, then the employee goes
    /// back). Also ends the AI allocations whose time is over. The background worker calls <see cref="MaintainAsync"/> every few seconds.
    /// </summary>
    public partial class AutopilotService
    {
        public int RecallMinutes => Math.Max(1, _config.GetValue("Ai:RecallMinutes", 3));

        /// <summary>Ends what is over. Returns the organizations whose staffing changed (they should be planned again).</summary>
        public async Task<HashSet<int>> MaintainAsync()
        {
            var touched = new HashSet<int>();
            var now = DateTime.UtcNow;
            var open = _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

            // 0. offers of the AI that nobody answered in time
            touched.UnionWith(await ExpireAiOffersAsync());

            // 1. the end time of an assignment is over (whoever made it: the AI or a person), unless it is locked: the employee goes back to the pool
            var expired = await open.Where(a => !a.Locked && a.ExpectedEndDatetime != null && a.ExpectedEndDatetime <= now)
                .Select(a => new { a.AllocationId, a.AssignOrgId, a.Source }).ToListAsync();
            foreach (var item in expired)
            {
                var byAi = item.Source == "AI" || item.Source == "Loan";
                var outcome = await _allocations.ReleaseAsync(item.AllocationId, "The end time passed", null, byAi: true);
                if (!outcome.Success) continue;
                await _audit.LogAsync(null, byAi ? "AI_RELEASED" : "EMPLOYEE_RELEASED", "Allocation", item.AllocationId,
                    "The end time of the assignment passed, so the employee went back to the pool.");
                if (item.AssignOrgId != null) touched.Add(item.AssignOrgId.Value);
            }

            // 2. loans whose work is over are returned
            var loans = await _db.EmployeeLoans.Where(l => l.Status != EmployeeLoan.Returned).ToListAsync();
            var allocationIds = loans.Where(l => l.BorrowerAllocationId != null).Select(l => l.BorrowerAllocationId!.Value).ToList();
            var stillOpen = (await open.Where(a => allocationIds.Contains(a.AllocationId)).Select(a => a.AllocationId).ToListAsync()).ToHashSet();
            foreach (var loan in loans.Where(l => l.BorrowerAllocationId == null || !stillOpen.Contains(l.BorrowerAllocationId.Value)))
            {
                loan.Status = EmployeeLoan.Returned;
                loan.ReturnedAt = now;
                touched.Add(loan.LenderOrgId);
                touched.Add(loan.BorrowerOrgId);
            }
            await _db.SaveChangesAsync();

            // 3. recalls whose time is up: the employee goes back now
            foreach (var loan in loans.Where(l => l.Status == EmployeeLoan.RecallRequested && l.RecallDeadline != null && l.RecallDeadline <= now))
            {
                await CompleteRecallAsync(loan, null);
                touched.Add(loan.LenderOrgId);
                touched.Add(loan.BorrowerOrgId);
            }
            return touched;
        }

        /// <summary>Plans again the organizations in <paramref name="orgIds"/> whose autopilot is on.</summary>
        public async Task RefreshAsync(IEnumerable<int> orgIds)
        {
            var enabled = (await EnabledOrgIdsAsync()).ToHashSet();
            foreach (var id in orgIds.Where(enabled.Contains).Distinct())
                await RunOrgAsync(id, apply: true, "Autopilot", null);
        }

        // ---------------------------------------------------------------- recall

        /// <summary>The owner organization wants its employee back. Starts the countdown and suggests a replacement for the borrower.</summary>
        public async Task<(bool Ok, string Message)> RequestRecallAsync(int loanId, int? actorUserId, string reason)
        {
            var loan = await _db.EmployeeLoans.FirstOrDefaultAsync(l => l.LoanId == loanId);
            if (loan == null) return (false, "Loan not found.");
            if (loan.Status != EmployeeLoan.Lent) return (false, loan.Status == EmployeeLoan.RecallRequested ? "The recall has already started." : "This employee is already back.");

            var now = DateTime.UtcNow;
            loan.Status = EmployeeLoan.RecallRequested;
            loan.RecallRequestedAt = now;
            loan.RecallDeadline = now.AddMinutes(RecallMinutes);
            loan.RecallReason = Cut(reason, 255);
            await _db.SaveChangesAsync();

            var names = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == loan.LenderOrgId || o.OrgId == loan.BorrowerOrgId).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);
            var employee = await _db.Employees.AsNoTracking().Where(e => e.EmpId == loan.EmpId).Select(e => e.User!.Name).FirstOrDefaultAsync();

            string substitute = string.Empty;
            try { substitute = await SuggestSubstituteAsync(loan); }
            catch (Exception ex) { _logger.LogWarning(ex, "Could not suggest a substitute for loan {Loan}.", loan.LoanId); }

            if (loan.BorrowerAllocationId != null)
                await _audit.LogAsync(actorUserId, "AI_RECALL_REQUESTED", "Allocation", loan.BorrowerAllocationId,
                    $"{names.GetValueOrDefault(loan.LenderOrgId)} needs {employee} back. {names.GetValueOrDefault(loan.BorrowerOrgId)} has {RecallMinutes} minutes." + substitute);
            return (true, $"Recall started. {employee} goes back to {names.GetValueOrDefault(loan.LenderOrgId)} in {RecallMinutes} minutes.{substitute}");
        }

        /// <summary>The recalled employee leaves now. The organizations that changed are planned again by the caller.</summary>
        public async Task<(bool Ok, string Message)> ReturnNowAsync(int loanId, int? actorUserId)
        {
            var loan = await _db.EmployeeLoans.FirstOrDefaultAsync(l => l.LoanId == loanId);
            if (loan == null) return (false, "Loan not found.");
            if (loan.Status == EmployeeLoan.Returned) return (false, "This employee is already back.");
            await CompleteRecallAsync(loan, actorUserId);
            return (true, "The employee went back to their organization.");
        }

        private async Task CompleteRecallAsync(EmployeeLoan loan, int? actorUserId)
        {
            if (loan.BorrowerAllocationId != null)
            {
                var isOpen = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).AnyAsync(a => a.AllocationId == loan.BorrowerAllocationId);
                if (isOpen)
                {
                    var outcome = await _allocations.ReleaseAsync(loan.BorrowerAllocationId.Value, "Returned to the owner organization", actorUserId, byAi: actorUserId == null);
                    if (!outcome.Success) _logger.LogWarning("Could not release the loaned employee of loan {Loan}: {Message}", loan.LoanId, outcome.Message);
                }
            }
            loan.Status = EmployeeLoan.Returned;
            loan.ReturnedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(actorUserId, "AI_RECALL_COMPLETED", "Allocation", loan.BorrowerAllocationId, "The employee went back to their own organization.");
        }

        /// <summary>
        /// Writes a suggestion for who can replace the recalled employee at the borrower. When the borrower's autopilot is on, the next plan
        /// fills the gap by itself after the employee left; otherwise the manager applies the suggestion.
        /// </summary>
        private async Task<string> SuggestSubstituteAsync(EmployeeLoan loan)
        {
            var allocation = loan.BorrowerAllocationId == null ? null : await _db.EmployeeAllocations.AsNoTracking().FirstOrDefaultAsync(a => a.AllocationId == loan.BorrowerAllocationId);
            var contract = await ActiveContractAsync(loan.BorrowerOrgId);
            if (allocation == null || contract == null) return string.Empty;

            var skillIds = allocation.WorkforceRequestId == null ? new List<int>()
                : await _db.WorkforceRequestSkills.AsNoTracking().Where(s => s.WorkforceRequestId == allocation.WorkforceRequestId).Select(s => s.SkillId).ToListAsync();

            var (candidates, meta) = await LoadCandidatesAsync(loan.BorrowerOrgId, contract.BorrowingAllowed == true);
            var task = new PlanTask("S", loan.BorrowerOrgId, AiDecision.KindSubstitute, 1, 0, skillIds, contract.BorrowingAllowed == true, new List<int> { loan.EmpId });
            var (plan, plannerName) = await _planner.PlanAsync(new PlanRequest(new List<PlanTask> { task }, candidates, _planner.Weights));

            var best = plan.Assignments.FirstOrDefault();
            if (best == null || !meta.TryGetValue(best.EmpId, out var who)) return " No replacement is free right now.";

            _db.AiDecisions.Add(new AiDecision
            {
                OrgId = loan.BorrowerOrgId,
                Kind = AiDecision.KindSubstitute,
                ContractId = contract.ContractId,
                WorkforceRequestId = allocation.WorkforceRequestId,
                EmpId = best.EmpId,
                FromOrgId = who.HomeOrgId,
                Score = (decimal)best.Score,
                Reason = Cut(best.Reason, 500),
                Breakdown = Cut(JsonSerializer.Serialize(best.Breakdown), 1000),
                Alternatives = Cut(JsonSerializer.Serialize(best.Alternatives.Select(x => new { empId = x.EmpId, name = meta.TryGetValue(x.EmpId, out var m) ? m.Name : $"Employee {x.EmpId}", score = x.Score })), 1000),
                Status = AiDecision.Suggested,
                Planner = plannerName,
                TriggerBy = "Autopilot",
                Note = Cut($"Replacement for the recalled employee (loan {loan.LoanId}).", 255),
                CreatedAt = DateTime.UtcNow,
            });
            loan.SubstituteEmpId = best.EmpId;
            await _db.SaveChangesAsync();
            return $" Replacement ready: {who.Name}.";
        }

        /// <summary>
        /// The autopilot of <paramref name="orgId"/> could not fill its own minimum: its lent employees are recalled, as many as are missing
        /// (a recall already running counts). Returns how many recalls were started.
        /// </summary>
        public async Task<int> RecallIfNeededAsync(int orgId)
        {
            var state = await MinimumStateAsync(orgId);
            if (state.Contract == null || state.Problem != null) return 0;
            var missing = state.Min - state.Have;
            if (missing <= 0) return 0;

            var pending = await _db.EmployeeLoans.CountAsync(l => l.LenderOrgId == orgId && l.Status == EmployeeLoan.RecallRequested);
            // The organization's own free employees fill the minimum first; only what they cannot fill is recalled.
            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);
            var ownFree = await _db.Employees.AsNoTracking().CountAsync(e => e.OrgId == orgId && e.User!.IsActive == true && !open.Any(a => a.EmployeeId == e.EmpId)
                && AllocationLogic.AvailableStatuses.Contains(e.AvailabilityStatus ?? string.Empty));
            var need = missing - pending - ownFree;
            if (need <= 0) return 0;

            var lockedIds = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Where(a => a.Locked).Select(a => a.AllocationId).ToListAsync();
            var loans = (await _db.EmployeeLoans.Where(l => l.LenderOrgId == orgId && l.Status == EmployeeLoan.Lent).OrderBy(l => l.LentAt).ToListAsync())
                .Where(l => l.BorrowerAllocationId == null || !lockedIds.Contains(l.BorrowerAllocationId.Value)).Take(need).ToList();

            var started = 0;
            foreach (var loan in loans)
            {
                var (ok, _) = await RequestRecallAsync(loan.LoanId, null, "The owner organization needs the employee for its contract minimum");
                if (ok) started++;
            }
            return started;
        }
    }
}
