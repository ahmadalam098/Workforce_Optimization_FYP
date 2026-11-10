using System.Text.Json;
using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public record AutopilotRunResult(int OrgId, string? OrgName, string Message, int Planned, int Applied, int Failed, int Unfilled, string Planner);

    /// <summary>Where an organization stands against its contract minimum today.</summary>
    public record MinimumState(Contract? Contract, bool IsDaily, DateTime? WindowEndUtc, string? Problem, int Min, int? Max, int Have, int AtOrg);

    /// <summary>
    /// The AI autopilot of one organization. It looks at what is missing (the contract's minimum employees, and approved staff requests),
    /// collects the employees who could be placed (free ones, and spare ones of other organizations), asks the planner who fits best, writes
    /// every choice to AI_Decision with the reason, and (when the autopilot is on, or the manager presses Apply) makes the allocation through
    /// the normal AllocationService, so every contract rule still applies. The manager can undo, lock and override everything.
    /// </summary>
    public partial class AutopilotService
    {
        private static readonly SemaphoreSlim RunGate = new(1, 1);
        private const int MaxFree = 400;
        private const string RequestPending = "Pending";
        private const string RequestApproved = "Approved";
        /// <summary>A staff request is staffed this many minutes before it starts (and any time while it runs).</summary>
        private const int StartEarlyMinutes = 60;
        /// <summary>The AI does not place again an employee that a person released (or whose AI decision was undone) for this long.</summary>
        private const int ReleaseCooldownMinutes = 60;

        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly DailyStaffingService _daily;
        private readonly PlannerGateway _planner;
        private readonly AuditService _audit;
        private readonly IConfiguration _config;
        private readonly ILogger<AutopilotService> _logger;
        private readonly IServiceScopeFactory _scopes;

        public AutopilotService(WorkforceManagementDbContext db, AllocationService allocations, DailyStaffingService daily, PlannerGateway planner,
            AuditService audit, IConfiguration config, ILogger<AutopilotService> logger, IServiceScopeFactory scopes)
        {
            _db = db;
            _allocations = allocations;
            _daily = daily;
            _planner = planner;
            _audit = audit;
            _config = config;
            _logger = logger;
            _scopes = scopes;
        }

        private record TaskMeta(string Kind, int? ContractId, int? RequestId, DateTime? ExpectedEnd);
        private record CandidateMeta(int EmpId, int? HomeOrgId, string Name, string Pool, int? LenderAllocationId);

        // ---------------------------------------------------------------- settings

        public async Task<AutopilotSetting?> SettingAsync(int orgId) => await _db.AutopilotSettings.FirstOrDefaultAsync(s => s.OrgId == orgId);

        public async Task SetEnabledAsync(int orgId, bool enabled, int? actorUserId)
        {
            var setting = await SettingAsync(orgId);
            if (setting == null)
            {
                setting = new AutopilotSetting { OrgId = orgId };
                _db.AutopilotSettings.Add(setting);
            }
            setting.Enabled = enabled;
            setting.UpdatedBy = actorUserId;
            setting.UpdatedAt = DateTime.UtcNow;
            if (!enabled) setting.LastMessage = "The autopilot is off.";
            await _db.SaveChangesAsync();
            var orgName = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == orgId).Select(o => o.OrgName).FirstOrDefaultAsync();
            await _audit.LogAsync(actorUserId, enabled ? "AUTOPILOT_ON" : "AUTOPILOT_OFF", "Organization", orgId, $"AI autopilot switched {(enabled ? "on" : "off")} for {orgName}");
        }

        public Task<List<int>> EnabledOrgIdsAsync() => _db.AutopilotSettings.AsNoTracking().Where(s => s.Enabled).Select(s => s.OrgId).ToListAsync();

        // ---------------------------------------------------------------- what is missing

        public async Task<Contract?> ActiveContractAsync(int orgId) =>
            await _db.Contracts.AsNoTracking().Where(c => c.OrgId == orgId && (c.Status == "Active" || c.Status == "Approved")).OrderByDescending(c => c.ContractId).FirstOrDefaultAsync();

        private async Task<bool> IsDailyAsync(int contractId)
        {
            var cycle = await _db.ContractVersions.AsNoTracking().Where(v => v.ContractId == contractId).OrderByDescending(v => v.VersionNo).Select(v => v.BillingCycle).FirstOrDefaultAsync();
            return string.Equals(cycle, DailyStaffingService.Cycle, StringComparison.OrdinalIgnoreCase);
        }

        public async Task<MinimumState> MinimumStateAsync(int orgId)
        {
            var contract = await ActiveContractAsync(orgId);
            if (contract == null) return new MinimumState(null, false, null, "This organization has no active contract.", 0, null, 0, 0);

            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);
            var isDaily = await IsDailyAsync(contract.ContractId);
            DateTime? windowEnd = null;
            string? problem = null;
            if (isDaily) (windowEnd, problem) = await _daily.TodayWindowEndAsync(contract);

            var have = isDaily
                ? await open.CountAsync(a => a.DailyContractId == contract.ContractId)
                : await open.CountAsync(a => a.AssignOrgId == orgId && a.WorkforceRequestId == null && a.DailyContractId == null);
            var atOrg = await open.CountAsync(a => a.AssignOrgId == orgId);
            return new MinimumState(contract, isDaily, windowEnd, problem, contract.MinEmployees ?? 0, contract.MaxEmployees, have, atOrg);
        }

        /// <summary>Does this open allocation count as one of the organization's contract minimum (the same rule as <see cref="MinimumStateAsync"/>)?</summary>
        private static bool CountsForMinimum(MinimumState state, int? workforceRequestId, int? dailyContractId) =>
            state.IsDaily ? dailyContractId == state.Contract?.ContractId : workforceRequestId == null && dailyContractId == null;

        private static readonly MinimumState NoContract = new(null, false, null, "This organization has no active contract.", 0, null, 0, 0);

        private static MinimumState StateOf(Dictionary<int, MinimumState> states, int orgId) => states.TryGetValue(orgId, out var s) ? s : NoContract;

        /// <summary>The minimum, how many count for it and how many work there, for every organization with an active contract, in four queries.</summary>
        private async Task<Dictionary<int, MinimumState>> AllMinimumStatesAsync()
        {
            var contracts = (await _db.Contracts.AsNoTracking().Where(c => c.OrgId != null && (c.Status == "Active" || c.Status == "Approved")).ToListAsync())
                .GroupBy(c => c.OrgId!.Value).Select(g => g.OrderByDescending(c => c.ContractId).First()).ToList();
            var ids = contracts.Select(c => c.ContractId).ToList();
            var daily = (await _db.ContractVersions.AsNoTracking().Where(v => ids.Contains(v.ContractId)).Select(v => new { v.ContractId, v.VersionNo, v.BillingCycle }).ToListAsync())
                .GroupBy(v => v.ContractId)
                .Where(g => string.Equals(g.OrderByDescending(v => v.VersionNo).First().BillingCycle, DailyStaffingService.Cycle, StringComparison.OrdinalIgnoreCase))
                .Select(g => g.Key).ToHashSet();
            var open = (await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen).Where(a => a.AssignOrgId != null)
                .Select(a => new { Org = a.AssignOrgId!.Value, a.WorkforceRequestId, a.DailyContractId }).ToListAsync())
                .GroupBy(a => a.Org).ToDictionary(g => g.Key, g => g.ToList());

            var result = new Dictionary<int, MinimumState>();
            foreach (var c in contracts)
            {
                var isDaily = daily.Contains(c.ContractId);
                var rows = open.GetValueOrDefault(c.OrgId!.Value) ?? new();
                var have = isDaily ? rows.Count(a => a.DailyContractId == c.ContractId) : rows.Count(a => a.WorkforceRequestId == null && a.DailyContractId == null);
                result[c.OrgId.Value] = new MinimumState(c, isDaily, null, null, c.MinEmployees ?? 0, c.MaxEmployees, have, rows.Count);
            }
            return result;
        }

        // ---------------------------------------------------------------- the candidates

        private static int LevelOf(string? proficiency) => proficiency switch { "Beginner" => 1, "Intermediate" => 2, "Advanced" => 3, "Expert" => 4, _ => 2 };

        /// <summary>
        /// The employees who could be placed at an organization: free employees (own organization first; others only when the contract allows
        /// borrowing) and "spare" employees of other organizations, who work for their home organization above its contract minimum, are not
        /// locked, not busy and not on a call.
        /// </summary>
        private async Task<(List<PlanCandidate> Candidates, Dictionary<int, CandidateMeta> Meta)> LoadCandidatesAsync(int orgId, bool allowBorrowed)
        {
            var now = DateTime.UtcNow;
            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);

            var free = await _db.Employees.AsNoTracking()
                .Where(e => e.User!.IsActive == true && !open.Any(a => a.EmployeeId == e.EmpId)
                            && AllocationLogic.AvailableStatuses.Contains(e.AvailabilityStatus ?? string.Empty) && (allowBorrowed || e.OrgId == orgId))
                .Select(e => new { e.EmpId, e.OrgId, e.Rating, Name = e.User!.Name })
                .Take(MaxFree).ToListAsync();

            // Where every other organization stands against its minimum, read once for the whole run (a few queries, however many organizations).
            var lenderStates = allowBorrowed ? await AllMinimumStatesAsync() : new Dictionary<int, MinimumState>();
            var list = free.Where(e => e.OrgId == orgId || e.OrgId == null).Select(e => (e.EmpId, e.OrgId, e.Rating, Name: e.Name ?? $"Employee {e.EmpId}", Pool: "Free", Lender: (int?)null)).ToList();

            // A free employee of another organization can be borrowed only above what that organization still needs for its own contract
            // minimum: its free people first fill its own missing minimum. The lowest rated are lent first, so the owner keeps its best.
            foreach (var group in free.Where(e => e.OrgId != null && e.OrgId != orgId).GroupBy(e => e.OrgId!.Value))
            {
                var lenderState = StateOf(lenderStates, group.Key);
                var spare = group.Count() - (lenderState.Contract == null ? 0 : Math.Max(0, lenderState.Min - lenderState.Have));
                foreach (var e in group.OrderBy(e => e.Rating ?? 0).Take(Math.Max(0, spare)))
                    list.Add((e.EmpId, e.OrgId, e.Rating, e.Name ?? $"Employee {e.EmpId}", "Free", (int?)null));
            }

            if (allowBorrowed)
            {
                var allocations = await open.Where(a => a.AssignOrgId != null && a.EmployeeId != null)
                    .Select(a => new { a.AllocationId, EmpId = a.EmployeeId!.Value, a.OwnerOrgId, AssignOrgId = a.AssignOrgId!.Value, a.WorkforceRequestId, a.DailyContractId, a.Locked }).ToListAsync();

                var onCallUsers = (await _db.CallSessions.AsNoTracking().Where(c => c.Status == CallSession.Ringing || c.Status == CallSession.Active).ToListAsync())
                    .SelectMany(c => new[] { (c.CallerType, c.CallerId), (c.CalleeType, c.CalleeId) })
                    .Where(x => x.Item1 == CallSession.Employee).Select(x => x.Item2).ToHashSet();

                foreach (var group in allocations.GroupBy(a => a.AssignOrgId))
                {
                    var lender = group.Key;
                    if (lender == orgId) continue;
                    var lenderState = StateOf(lenderStates, lender);
                    if (lenderState.Contract == null || lenderState.Have < lenderState.Min) continue;

                    // Only the lender's own people working at home (not on a staff request, not locked). Those who count for its minimum can be
                    // lent only above the minimum; the others (extra people) can always be lent.
                    var lendable = group.Where(a => a.OwnerOrgId == lender && a.WorkforceRequestId == null && !a.Locked).ToList();
                    if (lendable.Count == 0) continue;
                    var ids = lendable.Select(a => a.EmpId).ToList();
                    var people = (await _db.Employees.AsNoTracking().Where(e => ids.Contains(e.EmpId) && e.User!.IsActive == true && e.AvailabilityStatus != "Busy")
                        .Select(e => new { e.EmpId, e.OrgId, e.Rating, e.UserId, Name = e.User!.Name }).ToListAsync())
                        .Where(p => p.UserId == null || !onCallUsers.Contains(p.UserId.Value)).ToList();

                    var countedLeft = lenderState.Have - lenderState.Min;
                    // The lowest rated spare employees are lent first: the lender keeps its best people.
                    foreach (var p in people.OrderBy(p => p.Rating ?? 0))
                    {
                        var allocation = lendable.First(a => a.EmpId == p.EmpId);
                        if (CountsForMinimum(lenderState, allocation.WorkforceRequestId, allocation.DailyContractId))
                        {
                            if (countedLeft <= 0) continue;
                            countedLeft--;
                        }
                        list.Add((p.EmpId, p.OrgId, p.Rating, p.Name ?? $"Employee {p.EmpId}", "Surplus", allocation.AllocationId));
                    }
                }
            }

            var empIds = list.Select(x => x.EmpId).ToList();
            var skills = (await _db.EmployeeSkills.AsNoTracking().Where(s => empIds.Contains(s.EmpId)).ToListAsync())
                .GroupBy(s => s.EmpId).ToDictionary(g => g.Key, g => g.Select(s => new PlanSkill(s.SkillId, LevelOf(s.Proficiency), s.YearsOfExperience ?? 0)).ToList());

            var recent = now.AddDays(-3);
            var returning = (await _db.EmployeeAllocations.AsNoTracking().Where(a => a.AssignOrgId == orgId && a.EmployeeId != null && a.CreatedAt >= recent)
                .Select(a => a.EmployeeId!.Value).Distinct().ToListAsync()).ToHashSet();

            var candidates = list.Select(x => new PlanCandidate(x.EmpId, x.OrgId ?? orgId, x.Pool, (double)(x.Rating ?? 0), returning.Contains(x.EmpId), skills.GetValueOrDefault(x.EmpId) ?? new())).ToList();
            var meta = list.ToDictionary(x => x.EmpId, x => new CandidateMeta(x.EmpId, x.OrgId, x.Name, x.Pool, x.Lender));
            return (candidates, meta);
        }

        private static int PriorityOf(string? priority) => priority switch { "Critical" => 1, "High" => 2, "Low" => 4, _ => 3 };

        // ---------------------------------------------------------------- plan (and apply)

        /// <summary>
        /// Plans the missing employees of one organization. <paramref name="apply"/> true makes the allocations now (the autopilot);
        /// false only writes the choices as suggestions for the manager to apply or reject.
        /// </summary>
        public async Task<AutopilotRunResult> RunOrgAsync(int orgId, bool apply, string trigger, int? actorUserId, CancellationToken ct = default)
        {
            await RunGate.WaitAsync(ct);
            try
            {
                var result = await RunCoreAsync(orgId, apply, trigger, actorUserId);
                var setting = await SettingAsync(orgId);
                if (setting != null)
                {
                    setting.LastRunAt = DateTime.UtcNow;
                    setting.LastMessage = Cut(result.Message, 500);
                    await _db.SaveChangesAsync();
                }
                return result;
            }
            finally
            {
                RunGate.Release();
            }
        }

        private async Task<AutopilotRunResult> RunCoreAsync(int orgId, bool apply, string trigger, int? actorUserId)
        {
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == orgId);
            if (org == null) return new AutopilotRunResult(orgId, null, "Organization not found.", 0, 0, 0, 0, LocalPlanner.Name);
            if (!ContractLogic.IsActiveStatus(org.Status)) return Done(org, "The organization is not active.");

            var state = await MinimumStateAsync(orgId);
            var contract = state.Contract;
            if (contract == null) return Done(org, "There is no active contract.");

            var now = DateTime.UtcNow;
            var tasks = new List<PlanTask>();
            var metas = new Dictionary<string, TaskMeta>();
            var room = (state.Max ?? int.MaxValue) - state.AtOrg;
            var allowBorrowed = contract.BorrowingAllowed == true;
            var notes = new List<string>();
            // A person who released an employee (or undid an AI decision) keeps that choice: the AI does not place the same employee again for an hour.
            var releasedByPerson = await _db.AllocationHistories.AsNoTracking()
                .Where(h => h.ActionType == AllocationLogic.ActionReleased && h.FromOrgId == orgId && h.PerformedByUserId != null && h.IsAllocatedByAi != true && h.ActionTime >= now.AddMinutes(-ReleaseCooldownMinutes) && h.EmpId != null)
                .Select(h => h.EmpId!.Value).Distinct().ToListAsync();
            // Offers that wait for an answer count as coming; an employee who has an offer waiting, who declined this organization today or let
            // its offer expire in the last hour is not asked again.
            var pendingOffers = await _db.AssignmentOffers.AsNoTracking().Where(o => o.Status == AssignmentOffer.Pending)
                .Select(o => new { o.EmpId, o.OrgId, o.Kind, o.WorkforceRequestId }).ToListAsync();
            var saidNo = await _db.AssignmentOffers.AsNoTracking()
                .Where(o => o.OrgId == orgId && o.RespondedAt != null && ((o.Status == AssignmentOffer.Declined && o.RespondedAt >= now.AddHours(-24)) || (o.Status == AssignmentOffer.Expired && o.RespondedAt >= now.AddMinutes(-ReleaseCooldownMinutes))))
                .Select(o => o.EmpId).Distinct().ToListAsync();
            var exclude = releasedByPerson.Concat(pendingOffers.Select(o => o.EmpId)).Concat(saidNo).Distinct().ToList();

            // 1. the contract's minimum
            var missing = state.Min - state.Have;
            var offeredMinimum = pendingOffers.Count(o => o.OrgId == orgId && o.Kind == AssignmentOffer.ForMinimum);
            if (missing > 0 && offeredMinimum > 0)
            {
                notes.Add($"{Math.Min(missing, offeredMinimum)} offer(s) wait for the employee's answer.");
                missing -= offeredMinimum;
            }
            // A person who released minimum staff in the last hour wanted fewer people: those places stay empty for an hour, unless the manager
            // presses "Place now".
            if (missing > 0 && !(apply && trigger == "Manager"))
            {
                var cut = now.AddMinutes(-ReleaseCooldownMinutes);
                var held = await (from h in _db.AllocationHistories.AsNoTracking()
                                  join a in _db.EmployeeAllocations.AsNoTracking() on h.AllocationId equals a.AllocationId
                                  where h.ActionType == AllocationLogic.ActionReleased && h.FromOrgId == orgId && h.PerformedByUserId != null
                                        && h.IsAllocatedByAi != true && h.ActionTime >= cut && a.WorkforceRequestId == null && (a.Source == null || a.Source != "Loan")
                                  select h.AllocationId).Distinct().CountAsync();
                if (held > 0)
                {
                    notes.Add($"{Math.Min(missing, held)} place(s) of the minimum are kept empty for an hour because someone released staff; press Place now to fill them.");
                    missing -= held;
                }
            }
            // Employees this organization lent out and has already recalled come back by themselves: do not borrow from a third organization for them.
            var comingBack = await _db.EmployeeLoans.CountAsync(l => l.LenderOrgId == orgId && l.Status == EmployeeLoan.RecallRequested);
            if (missing > 0 && comingBack > 0)
            {
                notes.Add($"{Math.Min(missing, comingBack)} lent employee(s) are coming back.");
                missing -= comingBack;
            }
            if (missing > 0)
            {
                if (state.Problem != null) notes.Add(state.Problem);
                else if (room <= 0) notes.Add($"The contract maximum of {state.Max} is reached.");
                else
                {
                    var needed = Math.Min(missing, room);
                    room -= needed;
                    tasks.Add(new PlanTask("M", orgId, AiDecision.KindMinimum, needed, 0, new(), allowBorrowed, exclude));
                    metas["M"] = new TaskMeta(AiDecision.KindMinimum, contract.ContractId, null, state.IsDaily ? state.WindowEndUtc : null);
                }
            }

            // 2. staff requests (new ones that wait for a decision, and approved ones) that are not fully staffed. A new request is approved by
            // the AI when it places the first employee, the same as when the manager staffs it by hand.
            var requests = await _db.WorkforceRequests.AsNoTracking()
                .Where(r => r.OrgId == orgId && (r.Status == RequestPending || r.Status == RequestApproved) && (r.EndDatetime == null || r.EndDatetime > now))
                .ToListAsync();
            foreach (var request in requests.OrderBy(r => PriorityOf(r.Priority)).ThenBy(r => r.WorkforceRequestId))
            {
                var staffed = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).CountAsync(a => a.WorkforceRequestId == request.WorkforceRequestId);
                var wanted = (request.RequiredEmployees ?? 0) - staffed - pendingOffers.Count(o => o.WorkforceRequestId == request.WorkforceRequestId);
                if (wanted <= 0) continue;
                if (request.StartDatetime != null && request.StartDatetime > now.AddMinutes(StartEarlyMinutes))
                {
                    notes.Add($"Request #{request.WorkforceRequestId} starts later; its employees are placed {StartEarlyMinutes} minutes before it starts.");
                    continue;
                }
                var needed = Math.Min(wanted, room);
                if (needed <= 0)
                {
                    notes.Add($"Request #{request.WorkforceRequestId} needs {wanted} more, but the contract maximum of {state.Max} is reached.");
                    continue;
                }
                if (needed < wanted) notes.Add($"Request #{request.WorkforceRequestId}: only {needed} of {wanted} fit under the contract maximum of {state.Max}.");
                room -= needed;
                var skillIds = await _db.WorkforceRequestSkills.AsNoTracking().Where(s => s.WorkforceRequestId == request.WorkforceRequestId).Select(s => s.SkillId).ToListAsync();
                var id = $"R{request.WorkforceRequestId}";
                tasks.Add(new PlanTask(id, orgId, AiDecision.KindRequest, needed, PriorityOf(request.Priority), skillIds, allowBorrowed, exclude));
                metas[id] = new TaskMeta(AiDecision.KindRequest, request.ContractId, request.WorkforceRequestId, request.EndDatetime);
            }

            if (tasks.Count == 0)
                return Done(org, notes.Count > 0 ? string.Join(" ", notes) : "Nothing is missing. The minimum is complete and no staff request waits for employees.");

            var (candidates, meta) = await LoadCandidatesAsync(orgId, allowBorrowed);
            var (plan, plannerName) = await _planner.PlanAsync(new PlanRequest(tasks, candidates, _planner.Weights));

            // Old suggestions of this organization are replaced by the new plan.
            var stale = await _db.AiDecisions.Where(d => d.OrgId == orgId && d.Status == AiDecision.Suggested).ToListAsync();
            foreach (var old in stale)
            {
                old.Status = AiDecision.Rejected;
                old.DecidedAt = now;
                old.Note = "Replaced by a newer plan.";
            }

            var created = new List<AiDecision>();
            foreach (var a in plan.Assignments)
            {
                if (!metas.TryGetValue(a.TaskId, out var taskMeta) || !meta.TryGetValue(a.EmpId, out var who)) continue;
                var decision = new AiDecision
                {
                    OrgId = orgId,
                    Kind = taskMeta.Kind,
                    ContractId = taskMeta.ContractId,
                    WorkforceRequestId = taskMeta.RequestId,
                    EmpId = a.EmpId,
                    FromOrgId = who.HomeOrgId,
                    Score = (decimal)a.Score,
                    Reason = Cut(a.Reason + (who.Pool == "Surplus" ? " (not busy, not on a call)" : string.Empty), 500),
                    Breakdown = Cut(JsonSerializer.Serialize(a.Breakdown), 1000),
                    Alternatives = Cut(JsonSerializer.Serialize(a.Alternatives.Select(x => new { empId = x.EmpId, name = meta.TryGetValue(x.EmpId, out var m) ? m.Name : $"Employee {x.EmpId}", score = x.Score })), 1000),
                    Status = AiDecision.Suggested,
                    Planner = plannerName,
                    TriggerBy = trigger,
                    CreatedAt = now,
                };
                _db.AiDecisions.Add(decision);
                created.Add(decision);
            }
            await _db.SaveChangesAsync();

            var applied = 0;
            var offered = 0;
            var failed = 0;
            if (apply)
            {
                foreach (var decision in created)
                {
                    var (ok, _) = await ApplyAsync(decision, actorUserId);
                    if (!ok) failed++;
                    else if (decision.Status == AiDecision.Offered) offered++;
                    else applied++;
                }
            }

            var unfilled = plan.Unfilled.Sum(u => u.Missing);
            var text = apply
                ? $"{applied} employee(s) placed" + (offered > 0 ? $", {offered} offer(s) sent to employees" : string.Empty) + (failed > 0 ? $", {failed} could not be placed" : string.Empty)
                : $"{created.Count} suggestion(s) ready";
            if (failed > 0) text += $" ({created.FirstOrDefault(d => d.Status == AiDecision.Failed)?.Note})";
            text += ".";
            foreach (var u in plan.Unfilled)
                text += $" {(u.TaskId == "M" ? "Minimum" : $"Request #{u.TaskId.TrimStart('R')}")}: {u.Missing} still missing - {u.Why}";
            if (notes.Count > 0) text += " " + string.Join(" ", notes);
            return new AutopilotRunResult(orgId, org.OrgName, text + $" (planner: {plannerName})", created.Count, applied + offered, failed, unfilled, plannerName);
        }

        private static AutopilotRunResult Done(Organization org, string message) => new(org.OrgId, org.OrgName, message, 0, 0, 0, 0, LocalPlanner.Name);

        private static string Cut(string? text, int max) => string.IsNullOrEmpty(text) ? string.Empty : text.Length <= max ? text : text[..max];

        // ---------------------------------------------------------------- apply / reject / undo

        /// <summary>
        /// Carries out a suggested decision. When the organization asks its employees first (the default), the employee gets an offer and the
        /// allocation is made only when they accept (<paramref name="direct"/> true, from <see cref="AcceptOfferAsync"/>). Otherwise the
        /// employee is placed at once. Every contract rule is checked by the AllocationService.
        /// </summary>
        public async Task<(bool Ok, string Message)> ApplyAsync(AiDecision decision, int? actorUserId, bool direct = false)
        {
            if (decision.Status != AiDecision.Suggested && !(direct && decision.Status == AiDecision.Offered)) return (false, "This decision was already handled.");

            var employee = await _db.Employees.Include(e => e.User).FirstOrDefaultAsync(e => e.EmpId == decision.EmpId);
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == decision.OrgId);
            if (employee?.User == null || org == null) return await FailAsync(decision, "The employee or the organization was not found.");

            var now = DateTime.UtcNow;
            DateTime? expectedEnd = null;
            int? dailyContractId = null;
            var needsApproval = false;

            if (decision.WorkforceRequestId != null)
            {
                var request = await _db.WorkforceRequests.AsNoTracking().FirstOrDefaultAsync(r => r.WorkforceRequestId == decision.WorkforceRequestId);
                if (request == null || (request.Status != RequestApproved && request.Status != RequestPending))
                    return await FailAsync(decision, $"The staff request is {request?.Status?.ToLower() ?? "gone"}, so nobody can be placed on it.");
                if (request.EndDatetime != null && request.EndDatetime <= now) return await FailAsync(decision, "The staff request has already ended.");
                var staffed = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).CountAsync(a => a.WorkforceRequestId == request.WorkforceRequestId);
                if (staffed >= (request.RequiredEmployees ?? 0)) return await FailAsync(decision, "The staff request already has all the employees it asked for.");
                expectedEnd = request.EndDatetime;
                needsApproval = request.Status == RequestPending;
            }
            else
            {
                var state = await MinimumStateAsync(decision.OrgId);
                if (state.Contract == null) return await FailAsync(decision, "There is no active contract.");
                if (state.Have >= state.Min) return await FailAsync(decision, "The minimum is already complete, so this employee is not needed now.");
                if (state.IsDaily)
                {
                    if (state.Problem != null) return await FailAsync(decision, state.Problem);
                    expectedEnd = state.WindowEndUtc;
                    dailyContractId = state.Contract.ContractId;
                }
            }

            // A spare employee of another organization stops working there first (their organization keeps its own minimum).
            EmployeeAllocation? lenderAllocation = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).FirstOrDefaultAsync(a => a.EmployeeId == employee.EmpId);
            DateTime? lenderEnd = null;
            int? lenderDaily = null;
            if (lenderAllocation != null)
            {
                if (lenderAllocation.Locked) return await FailAsync(decision, "The manager of this employee locked the assignment.");
                if (lenderAllocation.AssignOrgId != employee.OrgId || lenderAllocation.WorkforceRequestId != null || lenderAllocation.AssignOrgId == decision.OrgId)
                    return await FailAsync(decision, "The employee is working somewhere that cannot be changed by the AI.");
                if (employee.AvailabilityStatus == "Busy") return await FailAsync(decision, "The employee is busy with a customer right now.");

                var lenderState = await MinimumStateAsync(lenderAllocation.AssignOrgId!.Value);
                if (lenderState.Have < lenderState.Min ||
                    (CountsForMinimum(lenderState, lenderAllocation.WorkforceRequestId, lenderAllocation.DailyContractId) && lenderState.Have - 1 < lenderState.Min))
                    return await FailAsync(decision, "Their organization needs them for its own minimum.");

            }

            if (!direct && await AskEmployeesAsync(decision.OrgId)) return await SendOfferAsync(decision, employee, org, actorUserId);

            if (lenderAllocation != null)
            {
                lenderEnd = lenderAllocation.ExpectedEndDatetime;
                lenderDaily = lenderAllocation.DailyContractId;
                var released = await _allocations.ReleaseAsync(lenderAllocation.AllocationId, Cut($"Lent to {org.OrgName} (AI)", 200), actorUserId, byAi: true);
                if (!released.Success) return await FailAsync(decision, released.Message);
            }

            // A new staff request is approved when its first employee is placed (taken back below if the placement fails).
            WorkforceRequestReview? approval = null;
            if (needsApproval) approval = await SetRequestApprovedAsync(decision.WorkforceRequestId!.Value, actorUserId);

            var outcome = await _allocations.AllocateAsync(new AllocateRequest
            {
                EmployeeId = employee.EmpId,
                AssignOrgId = decision.OrgId,
                ExpectedEnd = expectedEnd,
                WorkforceRequestId = decision.WorkforceRequestId,
                Reason = Cut($"AI: {decision.Reason}", 200),
                Force = false,
            }, actorUserId, byAi: true);

            if (!outcome.Success)
            {
                if (approval != null) await UndoRequestApprovalAsync(decision.WorkforceRequestId!.Value, approval);
                if (lenderAllocation != null) await PutBackAsync(employee.EmpId, lenderAllocation.AssignOrgId!.Value, lenderEnd, lenderDaily, actorUserId);
                return await FailAsync(decision, outcome.Message);
            }

            if (approval != null)
            {
                await _audit.LogAsync(actorUserId, "WORKFORCE_REQUEST_APPROVED", "WorkforceRequest", decision.WorkforceRequestId, "Approved by the AI autopilot when it placed the first employee.");
                // The email is sent in the background: the autopilot never waits for the mail server.
                var (mailOrg, mailActor, mailRequest) = (decision.OrgId, actorUserId, decision.WorkforceRequestId);
                _ = Task.Run(async () =>
                {
                    try
                    {
                        using var scope = _scopes.CreateScope();
                        await scope.ServiceProvider.GetRequiredService<AccountMailer>().SendOrganizationEventAsync(mailActor, mailOrg, OrganizationEvent.StaffRequestApproved, "Approved by the AI autopilot.");
                    }
                    catch (Exception ex) { _logger.LogWarning(ex, "Could not email the organization about request {Request}.", mailRequest); }
                });
            }

            var allocation = await _db.EmployeeAllocations.FirstAsync(a => a.AllocationId == outcome.AllocationId!.Value);
            if (dailyContractId != null) allocation.DailyContractId = dailyContractId;
            await _db.SaveChangesAsync();

            EmployeeLoan? loan = null;
            if (employee.OrgId != null && employee.OrgId != decision.OrgId)
            {
                loan = new EmployeeLoan
                {
                    EmpId = employee.EmpId,
                    LenderOrgId = employee.OrgId.Value,
                    BorrowerOrgId = decision.OrgId,
                    BorrowerAllocationId = allocation.AllocationId,
                    Status = EmployeeLoan.Lent,
                    LentAt = now,
                    ExpectedReturnAt = expectedEnd,
                    DecisionId = decision.DecisionId,
                };
                _db.EmployeeLoans.Add(loan);
                await _db.SaveChangesAsync();
            }

            decision.Status = AiDecision.Applied;
            decision.AllocationId = allocation.AllocationId;
            decision.LoanId = loan?.LoanId;
            decision.DecidedAt = now;
            decision.DecidedBy = actorUserId;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(actorUserId, loan != null ? "AI_LOAN_STARTED" : "AI_ALLOCATED", "Allocation", allocation.AllocationId,
                loan != null
                    ? $"{employee.User.Name} was lent by their organization to {org.OrgName} by the AI. They go back when the work ends or when their organization needs them."
                    : $"{employee.User.Name} was placed at {org.OrgName} by the AI.");
            return (true, outcome.Message);
        }

        private async Task<WorkforceRequestReview> SetRequestApprovedAsync(int requestId, int? actorUserId)
        {
            var request = await _db.WorkforceRequests.FirstAsync(r => r.WorkforceRequestId == requestId);
            request.Status = RequestApproved;
            var review = new WorkforceRequestReview
            {
                WorkforceRequestId = requestId,
                Decision = RequestApproved,
                Note = "Approved by the AI autopilot when it placed the first employee.",
                ReviewedBy = actorUserId,
                ReviewedAt = DateTime.UtcNow,
            };
            _db.WorkforceRequestReviews.Add(review);
            await _db.SaveChangesAsync();
            return review;
        }

        private async Task UndoRequestApprovalAsync(int requestId, WorkforceRequestReview review)
        {
            var request = await _db.WorkforceRequests.FirstAsync(r => r.WorkforceRequestId == requestId);
            request.Status = RequestPending;
            _db.WorkforceRequestReviews.Remove(review);
            await _db.SaveChangesAsync();
        }

        /// <summary>The allocation failed after the lender's allocation was released: give the employee back to their organization.</summary>
        private async Task PutBackAsync(int employeeId, int orgId, DateTime? end, int? dailyContractId, int? actorUserId)
        {
            var back = await _allocations.AllocateAsync(new AllocateRequest
            {
                EmployeeId = employeeId,
                AssignOrgId = orgId,
                ExpectedEnd = end != null && end > DateTime.UtcNow ? end : null,
                Reason = "Put back: the AI could not place this employee elsewhere",
                Force = true,
            }, null, byAi: true);
            if (back.Success && dailyContractId != null)
            {
                var allocation = await _db.EmployeeAllocations.FirstAsync(a => a.AllocationId == back.AllocationId!.Value);
                allocation.DailyContractId = dailyContractId;
                await _db.SaveChangesAsync();
            }
            if (!back.Success) _logger.LogWarning("Could not put employee {Employee} back at organization {Org}: {Message}", employeeId, orgId, back.Message);
        }

        private async Task<(bool, string)> FailAsync(AiDecision decision, string message)
        {
            decision.Status = AiDecision.Failed;
            decision.Note = Cut(message, 255);
            decision.DecidedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return (false, message);
        }

        public async Task<(bool Ok, string Message)> RejectAsync(AiDecision decision, int? actorUserId, string? note)
        {
            if (decision.Status != AiDecision.Suggested) return (false, "This decision was already handled.");
            decision.Status = AiDecision.Rejected;
            decision.Note = Cut(note, 255);
            decision.DecidedAt = DateTime.UtcNow;
            decision.DecidedBy = actorUserId;
            await _db.SaveChangesAsync();
            return (true, "Suggestion rejected.");
        }

        /// <summary>The manager takes back an applied decision: the employee is released and free again.</summary>
        public async Task<(bool Ok, string Message)> UndoAsync(AiDecision decision, int? actorUserId)
        {
            if (decision.Status == AiDecision.Offered && decision.OfferId != null)
            {
                var offer = await _db.AssignmentOffers.FirstOrDefaultAsync(o => o.OfferId == decision.OfferId);
                if (offer != null && offer.Status == AssignmentOffer.Pending)
                {
                    offer.Status = AssignmentOffer.Cancelled;
                    offer.RespondedAt = DateTime.UtcNow;
                }
                decision.Status = AiDecision.Undone;
                decision.Note = "The offer was cancelled by the organization manager.";
                decision.DecidedAt = DateTime.UtcNow;
                decision.DecidedBy = actorUserId;
                await _db.SaveChangesAsync();
                if (offer != null) await _audit.LogAsync(actorUserId, "OFFER_CANCELLED", "AssignmentOffer", offer.OfferId, "The manager cancelled the AI's offer");
                return (true, "The offer was cancelled.");
            }
            if (decision.Status != AiDecision.Applied || decision.AllocationId == null) return (false, "Only an applied decision or a waiting offer can be undone.");
            var open = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).AnyAsync(a => a.AllocationId == decision.AllocationId);
            if (open)
            {
                var released = await _allocations.ReleaseAsync(decision.AllocationId.Value, "The AI decision was undone by the organization manager", actorUserId);
                if (!released.Success) return (false, released.Message);
            }
            if (decision.LoanId != null)
            {
                var loan = await _db.EmployeeLoans.FirstOrDefaultAsync(l => l.LoanId == decision.LoanId);
                if (loan != null && loan.Status != EmployeeLoan.Returned)
                {
                    loan.Status = EmployeeLoan.Returned;
                    loan.ReturnedAt = DateTime.UtcNow;
                }
            }
            decision.Status = AiDecision.Undone;
            decision.DecidedAt = DateTime.UtcNow;
            decision.DecidedBy = actorUserId;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(actorUserId, "AI_DECISION_UNDONE", "Allocation", decision.AllocationId, "The organization manager undid an AI decision; the employee is free again.");
            return (true, "Undone. The employee is free again.");
        }

        public async Task<(bool Ok, string Message)> SetLockAsync(int allocationId, bool locked, int? actorUserId)
        {
            var allocation = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).FirstOrDefaultAsync(a => a.AllocationId == allocationId);
            if (allocation == null) return (false, "Open allocation not found.");
            allocation.Locked = locked;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(actorUserId, locked ? "AI_ALLOCATION_LOCKED" : "AI_ALLOCATION_UNLOCKED", "Allocation", allocationId,
                locked ? "The organization manager locked this assignment: the AI will not release or move it." : "The organization manager unlocked this assignment.");
            return (true, locked ? "Locked. The AI will not touch this assignment." : "Unlocked.");
        }
    }
}
