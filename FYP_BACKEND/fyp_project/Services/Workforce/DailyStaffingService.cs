using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// Appointed = how many employees are appointed as today's minimum right now; NewlyAppointed = how many were added by this run.
    /// </summary>
    public record DailyContractStatus(
        int ContractId, string? ContractNumber, int OrgId, string? OrgName, int Min, int? Max, string Window, string State,
        int Appointed, int AtOrganizationNow, int Extra, int StillShort, List<string> Employees, string Message, int NewlyAppointed = 0);

    public record DailyStaffingRun(DateOnly Day, int Released, List<DailyContractStatus> Contracts);

    /// <summary>
    /// Daily contracts: a contract whose billing cycle is "Daily" has its minimum number of employees appointed every day, inside the daily
    /// start and end time of the contract. At the end of the window those employees are released, and the next day the minimum is appointed
    /// again (employees who worked there before are preferred). Employees added through staff requests are the extra ones: they are not marked
    /// as daily, they come on top of the minimum, and the contract's maximum still limits the total (the allocation rules check it).
    /// The contract times are read in the time zone chosen in Settings, or in the server's own time zone when it is "this computer".
    /// </summary>
    public class DailyStaffingService
    {
        public const string Cycle = "Daily";
        private const int MaxCandidates = 300;

        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly AuditService _audit;

        public DailyStaffingService(WorkforceManagementDbContext db, AllocationService allocations, AuditService audit)
        {
            _db = db;
            _allocations = allocations;
            _audit = audit;
        }

        private async Task<TimeZoneInfo> ZoneAsync()
        {
            var id = await SettingsReader.GetAsync(_db, SettingsCatalog.Timezone);
            if (!string.IsNullOrWhiteSpace(id) && id != "auto")
            {
                try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
                catch (TimeZoneNotFoundException) { }
                catch (InvalidTimeZoneException) { }
            }
            return TimeZoneInfo.Local;
        }

        /// <summary>The window of a day in UTC. A window that ends at or before it starts runs through the night.</summary>
        public static (DateTime StartUtc, DateTime EndUtc) WindowOf(DateOnly day, TimeOnly start, TimeOnly end, TimeZoneInfo zone)
        {
            var from = day.ToDateTime(start);
            var to = day.ToDateTime(end);
            if (to <= from) to = to.AddDays(1);
            return (TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(from, DateTimeKind.Unspecified), zone),
                    TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(to, DateTimeKind.Unspecified), zone));
        }

        private record DailyContract(Contract Contract, string? OrgName, string? OrgStatus, DateOnly? StartDate, DateOnly? EndDate);

        /// <summary>The active contracts whose latest version is a daily one (optionally just one of them).</summary>
        private async Task<List<DailyContract>> DailyContractsAsync(int? contractId)
        {
            var contracts = await _db.Contracts.AsNoTracking()
                .Where(c => (c.Status == "Active" || c.Status == "Approved") && (contractId == null || c.ContractId == contractId))
                .Select(c => new { Contract = c, OrgName = c.Org != null ? c.Org.OrgName : null, OrgStatus = c.Org != null ? c.Org.Status : null })
                .ToListAsync();
            if (contracts.Count == 0) return new();

            var ids = contracts.Select(c => c.Contract.ContractId).ToList();
            var versions = (await _db.ContractVersions.AsNoTracking().Where(v => ids.Contains(v.ContractId)).ToListAsync())
                .GroupBy(v => v.ContractId).ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.VersionNo).First());

            return contracts
                .Where(c => versions.TryGetValue(c.Contract.ContractId, out var v) && string.Equals(v.BillingCycle, Cycle, StringComparison.OrdinalIgnoreCase))
                .Select(c => new DailyContract(c.Contract, c.OrgName, c.OrgStatus, versions[c.Contract.ContractId].StartDate, versions[c.Contract.ContractId].EndDate))
                .OrderBy(c => c.OrgName).ThenBy(c => c.Contract.ContractId)
                .ToList();
        }

        private static string WindowText(Contract c) =>
            c.StartTime != null && c.EndTime != null ? $"{c.StartTime:HH\\:mm} - {c.EndTime:HH\\:mm}" : "no daily time set";

        // ---------------------------------------------------------------- status (changes nothing)

        /// <summary>Where every daily contract stands today: the minimum, who is appointed, who came on top, and what is missing.</summary>
        public async Task<List<DailyContractStatus>> StatusAsync(int? contractId = null)
        {
            var zone = await ZoneAsync();
            var nowUtc = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(nowUtc, zone));
            var result = new List<DailyContractStatus>();

            foreach (var item in await DailyContractsAsync(contractId))
                result.Add(await StatusOfAsync(item, today, nowUtc, zone, appointedNow: 0, note: null));
            return result;
        }

        private async Task<DailyContractStatus> StatusOfAsync(DailyContract item, DateOnly today, DateTime nowUtc, TimeZoneInfo zone, int appointedNow, string? note)
        {
            var c = item.Contract;
            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);
            var daily = await open.Where(a => a.DailyContractId == c.ContractId)
                .Select(a => a.Employee!.User!.Name).ToListAsync();
            var atOrg = await open.CountAsync(a => a.AssignOrgId == c.OrgId);
            var min = c.MinEmployees ?? 0;

            string state;
            if (item.StartDate != null && today < item.StartDate) state = "NotStarted";
            else if (item.EndDate != null && today > item.EndDate) state = "Finished";
            else if (!ContractLogic.IsActiveStatus(item.OrgStatus)) state = "OrganizationInactive";
            else if (c.StartTime == null || c.EndTime == null) state = "NoWindow";
            else
            {
                var (start, end) = WindowOf(today, c.StartTime.Value, c.EndTime.Value, zone);
                state = nowUtc >= end ? "WindowEnded" : daily.Count >= min ? "Complete" : nowUtc < start ? "Waiting" : "Short";
            }

            var short_ = state is "Short" or "Waiting" ? Math.Max(0, min - daily.Count) : 0;
            return new DailyContractStatus(c.ContractId, c.ContractNumber, c.OrgId ?? 0, item.OrgName, min, c.MaxEmployees, WindowText(c), state,
                daily.Count, atOrg, Math.Max(0, atOrg - daily.Count), short_, daily.Where(n => n != null).Select(n => n!).OrderBy(n => n).ToList(), note ?? string.Empty);
        }

        // ---------------------------------------------------------------- run

        /// <summary>
        /// Ends the daily appointments whose window is over, then appoints the missing minimum employees for today.
        /// <paramref name="automatic"/> (the background worker) appoints only once the day's window has started; a person pressing the button
        /// may appoint before it starts. Safe to run again and again: it only fills what is missing.
        /// </summary>
        public async Task<DailyStaffingRun> RunAsync(int? contractId, int? actorUserId, bool automatic, bool appoint = true)
        {
            var zone = await ZoneAsync();
            var nowUtc = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(nowUtc, zone));

            // 1. yesterday's (and any finished) daily appointments end
            var expired = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.DailyContractId != null && a.ExpectedEndDatetime != null && a.ExpectedEndDatetime <= nowUtc)
                .Select(a => a.AllocationId).ToListAsync();
            var released = 0;
            foreach (var allocationId in expired)
            {
                var outcome = await _allocations.ReleaseAsync(allocationId, "Daily shift ended", actorUserId);
                if (outcome.Success) released++;
            }

            // 2. appoint the minimum for every daily contract
            var statuses = new List<DailyContractStatus>();
            foreach (var item in await DailyContractsAsync(contractId))
            {
                var c = item.Contract;
                string? note = null;
                var appointed = 0;

                var blockedState = (await StatusOfAsync(item, today, nowUtc, zone, 0, null)).State;
                if (blockedState is "NotStarted" or "Finished" or "OrganizationInactive" or "NoWindow" or "WindowEnded")
                {
                    note = blockedState switch
                    {
                        "NotStarted" => "The contract has not started yet.",
                        "Finished" => "The contract has ended.",
                        "OrganizationInactive" => "The organization is not active.",
                        "NoWindow" => "The contract has no daily start and end time.",
                        _ => "Today's window is over; the minimum is appointed again tomorrow.",
                    };
                }
                else
                {
                    var (start, end) = WindowOf(today, c.StartTime!.Value, c.EndTime!.Value, zone);
                    if (!appoint)
                    {
                        note = "The organization manager appoints the minimum employees.";
                    }
                    else if (automatic && nowUtc < start)
                    {
                        note = $"Today's window starts at {c.StartTime:HH\\:mm}.";
                    }
                    else
                    {
                        appointed = await FillAsync(c, item, today, end, actorUserId);
                    }
                }

                var status = await StatusOfAsync(item, today, nowUtc, zone, appointed, note);
                statuses.Add(status with { Message = note ?? DescribeFill(status, appointed), NewlyAppointed = appointed });

                await LogAsync(c, status, appointed, automatic, actorUserId, today);
            }

            return new DailyStaffingRun(today, released, statuses);
        }

        /// <summary>The end of today's daily window (UTC) of a daily contract, or why there is none (no window, or it is already over).</summary>
        public async Task<(DateTime? EndUtc, string? Problem)> TodayWindowEndAsync(Contract contract)
        {
            if (contract.StartTime == null || contract.EndTime == null) return (null, "This contract has no daily start and end time.");
            var zone = await ZoneAsync();
            var nowUtc = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(nowUtc, zone));
            var (_, end) = WindowOf(today, contract.StartTime.Value, contract.EndTime.Value, zone);
            if (nowUtc >= end) return (null, "Today's daily window is over. Appoint the employees again tomorrow.");
            return (end, null);
        }

        private static string DescribeFill(DailyContractStatus s, int appointed)
        {
            if (appointed > 0 && s.StillShort == 0) return $"{appointed} employee(s) appointed; the minimum of {s.Min} is complete.";
            if (appointed > 0) return $"{appointed} employee(s) appointed, but {s.StillShort} more are needed and no other free employee could be appointed.";
            if (s.StillShort > 0) return $"{s.StillShort} more employee(s) are needed, but no free employee could be appointed.";
            return $"The minimum of {s.Min} is already complete.";
        }

        /// <summary>Appoints the missing employees of one contract. Returns how many were appointed.</summary>
        private async Task<int> FillAsync(Contract contract, DailyContract item, DateOnly today, DateTime windowEndUtc, int? actorUserId)
        {
            var min = contract.MinEmployees ?? 0;
            var orgId = contract.OrgId ?? 0;
            var open = _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen);

            var have = await open.CountAsync(a => a.DailyContractId == contract.ContractId);
            var needed = min - have;
            if (needed <= 0 || orgId == 0) return 0;

            // Free employees: active, no open allocation, available. People who worked this contract's days before come first, then the
            // organization's own employees, then (only when the contract allows borrowing) the rest; the best rated first.
            var recent = DateTime.UtcNow.AddDays(-3);
            var returning = (await _db.EmployeeAllocations.AsNoTracking()
                    .Where(a => a.DailyContractId == contract.ContractId && a.EmployeeId != null && a.CreatedAt >= recent)
                    .Select(a => a.EmployeeId!.Value).Distinct().ToListAsync()).ToHashSet();

            var candidates = await _db.Employees.AsNoTracking()
                .Where(e => e.User!.IsActive == true && !open.Any(a => a.EmployeeId == e.EmpId) && AllocationLogic.AvailableStatuses.Contains(e.AvailabilityStatus ?? string.Empty))
                .Select(e => new { e.EmpId, e.OrgId, e.Rating })
                .ToListAsync();

            var ordered = candidates
                .Where(e => e.OrgId == orgId || contract.BorrowingAllowed == true)
                .OrderBy(e => returning.Contains(e.EmpId) ? 0 : 1)
                .ThenBy(e => e.OrgId == orgId ? 0 : 1)
                .ThenByDescending(e => e.Rating ?? 0)
                .ThenBy(e => e.EmpId)
                .Take(MaxCandidates)
                .ToList();

            var appointed = 0;
            foreach (var candidate in ordered)
            {
                if (appointed >= needed) break;

                var outcome = await _allocations.AllocateAsync(new AllocateRequest
                {
                    EmployeeId = candidate.EmpId,
                    AssignOrgId = orgId,
                    ExpectedEnd = windowEndUtc,
                    Reason = $"Daily minimum for contract {contract.ContractNumber} ({today:yyyy-MM-dd})",
                }, actorUserId);

                if (!outcome.Success)
                {
                    // The contract's maximum (or the contract / organization itself) stops everyone: no point trying the others.
                    if (outcome.Violations.Any(v => v.Code is "CAPACITY_EXCEEDED" or "NO_ACTIVE_CONTRACT" or "ORG_NOT_ACTIVE")) break;
                    continue;
                }

                // Mark it as a daily appointment, so it ends with the day's window.
                var allocation = await _db.EmployeeAllocations.FirstAsync(a => a.AllocationId == outcome.AllocationId!.Value);
                allocation.DailyContractId = contract.ContractId;
                await _db.SaveChangesAsync();

                // The audit entry is what the employee's, the manager's and the admin's bells show.
                await _audit.LogAsync(actorUserId, "EMPLOYEE_ALLOCATED", "Allocation", allocation.AllocationId,
                    $"Daily minimum for contract {contract.ContractNumber} until {windowEndUtc:HH:mm} UTC. {outcome.Message}");
                appointed++;
            }

            return appointed;
        }

        private async Task LogAsync(Contract contract, DailyContractStatus status, int appointed, bool automatic, int? actorUserId, DateOnly today)
        {
            if (appointed > 0)
            {
                await _audit.LogAsync(actorUserId, "DAILY_STAFFING_APPOINTED", "Contract", contract.ContractId,
                    $"{status.OrgName}: {appointed} employee(s) appointed for today's minimum of {status.Min}" + (automatic ? " (automatic)" : string.Empty));
            }

            // A shortage is written once a day for each contract (the worker looks every few minutes), or every time a person asks.
            if (status.State == "Short" && status.StillShort > 0)
            {
                var dayStart = DateTime.UtcNow.Date;
                var already = automatic && await _db.AuditLogs.AsNoTracking()
                    .AnyAsync(a => a.Action == "DAILY_STAFFING_SHORT" && a.EntityType == "Contract" && a.EntityId == contract.ContractId.ToString() && a.CreatedAt >= dayStart);
                if (!already)
                {
                    await _audit.LogAsync(actorUserId, "DAILY_STAFFING_SHORT", "Contract", contract.ContractId,
                        $"{status.OrgName}: {status.StillShort} of the {status.Min} minimum employees are not appointed yet today (the organization manager has to appoint them)");
                }
            }
        }
    }
}
