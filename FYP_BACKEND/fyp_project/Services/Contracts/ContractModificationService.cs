using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>One term of a contract: what it is now and what the organization asks for.</summary>
    public record ContractChange(string Key, object? Current, object? Proposed);

    public record ApplyResult(bool Ok, string Message);

    /// <summary>
    /// Changes to an approved contract. The organization asks (never for the hourly rates: they are fixed); the admin approves or rejects.
    /// Approved: a new contract version is put in force, so every part of the system that reads the contract (allocation limits, billing, daily
    /// staffing, reports) uses the new terms from then on. Rejected: nothing changes and the current contract keeps running. An approved change
    /// that should start on a later day waits and is put in force on that day.
    /// </summary>
    public class ContractModificationService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly DailyStaffingService _daily;

        public ContractModificationService(WorkforceManagementDbContext db, AuditService audit, DailyStaffingService daily)
        {
            _db = db;
            _audit = audit;
            _daily = daily;
        }

        public const string Pending = "Pending";
        public const string Approved = "Approved";
        public const string Rejected = "Rejected";
        public const string Withdrawn = "Withdrawn";

        /// <summary>The terms an organization may ask to change on an approved contract.</summary>
        public static ContractTermsDto Overlay(ContractTermsDto current, ContractModificationRequest m) => new()
        {
            StartDate = current.StartDate,
            EndDate = m.ProposedEndDate ?? current.EndDate,
            StartTime = m.ProposedStartTime ?? current.StartTime,
            EndTime = m.ProposedEndTime ?? current.EndTime,
            MinEmployees = m.ProposedMinEmployees ?? current.MinEmployees,
            MaxEmployees = m.ProposedMaxEmployees ?? current.MaxEmployees,
            BorrowingAllowed = m.ProposedBorrowingAllowed ?? current.BorrowingAllowed,
            MaxBorrowedEmployees = m.ProposedMaxBorrowed ?? current.MaxBorrowedEmployees,
            BillingCycle = m.ProposedBillingCycle ?? current.BillingCycle,
            // fixed: never changed by an organization
            PriorityLevel = current.PriorityLevel,
            BillingCurrency = current.BillingCurrency,
            BaseHourlyRate = current.BaseHourlyRate,
            ExtraHourlyRate = current.ExtraHourlyRate,
        };

        /// <summary>The terms the request changes, with what they are now (the keys are the ones the contract screens use).</summary>
        public static List<ContractChange> ChangesOf(ContractTermsDto current, ContractModificationRequest m)
        {
            var list = new List<ContractChange>();
            void Add(string key, object? now, object? proposed) { if (proposed != null) list.Add(new ContractChange(key, now, proposed)); }
            Add("endDate", current.EndDate, m.ProposedEndDate);
            Add("startTime", current.StartTime, m.ProposedStartTime);
            Add("endTime", current.EndTime, m.ProposedEndTime);
            Add("minEmployees", current.MinEmployees, m.ProposedMinEmployees);
            Add("maxEmployees", current.MaxEmployees, m.ProposedMaxEmployees);
            Add("borrowingAllowed", current.BorrowingAllowed, m.ProposedBorrowingAllowed);
            Add("maxBorrowedEmployees", current.MaxBorrowedEmployees, m.ProposedMaxBorrowed);
            Add("billingCycle", current.BillingCycle, m.ProposedBillingCycle);
            return list;
        }

        /// <summary>Why this change cannot be put in force, or null. The staff limit cannot drop below the employees working there now.</summary>
        public async Task<string?> ProblemAsync(Contract contract, ContractTermsDto next)
        {
            var errors = ContractLogic.Validate(next);
            if (errors.Count > 0) return errors.Values.First();

            if (next.MaxEmployees.HasValue && contract.OrgId.HasValue)
            {
                var working = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).CountAsync(a => a.AssignOrgId == contract.OrgId);
                if (next.MaxEmployees.Value < working)
                    return $"{working} employee(s) are working for this organization right now, so the maximum cannot be below {working}. Release some first.";
            }
            return null;
        }

        /// <summary>Puts the approved change in force as a new contract version.</summary>
        public async Task<ApplyResult> ApplyAsync(ContractModificationRequest m, int? actorUserId)
        {
            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.ContractId == m.ContractId);
            if (contract == null) return new(false, "The contract no longer exists.");
            if (!ContractLogic.IsActiveStatus(contract.Status) && !ContractLogic.IsStatus(contract.Status, ContractLogic.Suspended))
                return new(false, "The contract is not active any more, so the change cannot be applied.");

            var (current, versionNo) = await ContractLogic.GetCurrentTermsAsync(_db, contract);
            var next = Overlay(current, m);
            var problem = await ProblemAsync(contract, next);
            if (problem != null) return new(false, problem);

            var now = DateTime.UtcNow;
            // A contract that existed before versioning gets its current terms saved as version 1 first.
            if (!await _db.ContractVersions.AnyAsync(v => v.ContractId == contract.ContractId))
            {
                var original = new ContractVersion { ContractId = contract.ContractId, VersionNo = 1, ChangeSummary = "Original contract", CreatedAt = contract.CreatedAt ?? now };
                ContractLogic.CopyToVersion(current, original);
                _db.ContractVersions.Add(original);
            }

            var summary = $"Change asked by the organization: {m.Reason}";
            var version = new ContractVersion
            {
                ContractId = contract.ContractId,
                VersionNo = versionNo + 1,
                ChangeSummary = summary.Length <= 500 ? summary : summary[..500],
                CreatedBy = actorUserId,
                CreatedAt = now,
            };
            ContractLogic.CopyToVersion(next, version);
            _db.ContractVersions.Add(version);
            ContractLogic.MirrorToContract(next, contract);

            m.ResultVersionNo = version.VersionNo;
            m.AppliedAt = now;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(actorUserId, "CONTRACT_MODIFICATION_APPLIED", "Contract", contract.ContractId,
                $"{contract.ContractNumber}: version {version.VersionNo} is now in force");

            // A daily contract may need more (or different) employees today: do it now instead of waiting for the next round.
            if (string.Equals(next.BillingCycle, DailyStaffingService.Cycle, StringComparison.OrdinalIgnoreCase))
            {
                try { await _daily.RunAsync(contract.ContractId, actorUserId, automatic: false); }
                catch (Exception) { /* the worker will do it within minutes */ }
            }

            return new(true, $"Version {version.VersionNo} of the contract is now in force.");
        }

        /// <summary>Puts in force the approved changes whose day has come. Run by the background worker every few minutes.</summary>
        public async Task<int> ApplyDueAsync()
        {
            var today = Money.Today;
            var due = await _db.ContractModificationRequests
                .Where(m => m.Status == Approved && m.AppliedAt == null && m.EffectiveDate != null && m.EffectiveDate <= today)
                .OrderBy(m => m.ModificationId)
                .ToListAsync();

            var applied = 0;
            foreach (var m in due)
            {
                var result = await ApplyAsync(m, m.ReviewedBy);
                if (result.Ok) { applied++; continue; }

                // Say it once a day instead of every few minutes.
                var dayStart = DateTime.UtcNow.Date;
                var already = await _db.AuditLogs.AsNoTracking().AnyAsync(a => a.Action == "CONTRACT_MODIFICATION_BLOCKED" && a.EntityType == "Contract" && a.EntityId == m.ContractId.ToString() && a.CreatedAt >= dayStart);
                if (!already) await _audit.LogAsync(m.ReviewedBy, "CONTRACT_MODIFICATION_BLOCKED", "Contract", m.ContractId, $"The approved change could not start today: {result.Message}");
            }
            return applied;
        }
    }
}
