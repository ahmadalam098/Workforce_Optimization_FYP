using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>
    /// What an organization may put in a contract: the period, how many employees, borrowing, and how it is billed. The hourly rates and the
    /// priority belong to the admin, who sets them when reviewing the request (so they are not part of this request at all).
    /// </summary>
    public class OrganizationContractRequest
    {
        public DateOnly? StartDate { get; set; }
        public DateOnly? EndDate { get; set; }
        public TimeOnly? StartTime { get; set; }
        public TimeOnly? EndTime { get; set; }

        [Range(0, 100000)] public int? MinEmployees { get; set; }
        [Range(0, 100000)] public int? MaxEmployees { get; set; }

        public bool? BorrowingAllowed { get; set; }
        [Range(0, 100000)] public int? MaxBorrowedEmployees { get; set; }

        [StringLength(10)] public string? BillingCurrency { get; set; }
        [StringLength(30)] public string? BillingCycle { get; set; }

        /// <summary>A note for the admin who reviews the request.</summary>
        [StringLength(400)] public string? Note { get; set; }
    }

    /// <summary>
    /// A change to an approved contract. The organization sends the terms it wants (what it does not change it leaves as they are); the hourly
    /// rates are fixed and are not part of it. The comment tells the admin why.
    /// </summary>
    public class OrganizationContractChangeRequest
    {
        public DateOnly? EndDate { get; set; }
        public TimeOnly? StartTime { get; set; }
        public TimeOnly? EndTime { get; set; }
        [Range(0, 100000)] public int? MinEmployees { get; set; }
        [Range(0, 100000)] public int? MaxEmployees { get; set; }
        public bool? BorrowingAllowed { get; set; }
        [Range(0, 100000)] public int? MaxBorrowedEmployees { get; set; }
        [StringLength(30)] public string? BillingCycle { get; set; }

        /// <summary>The day the change should start. Empty: as soon as the admin approves.</summary>
        public DateOnly? EffectiveDate { get; set; }

        [Required, StringLength(500, MinimumLength = 10)] public string Comment { get; set; } = string.Empty;
    }

    /// <summary>
    /// Organization portal: the organization makes its own contract requests. A new contract is Pending: the admin reviews it, sets the hourly
    /// rates and approves or rejects it (the admin's Contracts page). The organization may change a request while it is still Pending, and
    /// follows it afterwards (terms, the admin's decision and reason, and, for a daily contract, the daily staffing).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/contracts")]
    public class OrganizationContractsController : ControllerBase
    {
        private const int MaxPending = 3;

        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly AuditService _audit;
        private readonly DailyStaffingService _daily;
        private readonly ContractModificationService _changes;

        public OrganizationContractsController(WorkforceManagementDbContext db, IdGenerator ids, AuditService audit, DailyStaffingService daily, ContractModificationService changes)
        {
            _db = db;
            _ids = ids;
            _audit = audit;
            _daily = daily;
            _changes = changes;
        }

        /// <summary>What the screens show about one change request. The current value of each term is known only while the request is waiting.</summary>
        private static object ChangeDto(ContractModificationRequest m, ContractTermsDto? current) => new
        {
            modificationId = m.ModificationId,
            status = m.Status,
            comment = m.Reason,
            adminResponse = m.AdminResponse,
            effectiveDate = m.EffectiveDate,
            createdAt = m.CreatedAt,
            reviewedAt = m.ReviewedAt,
            appliedAt = m.AppliedAt,
            resultVersionNo = m.ResultVersionNo,
            scheduled = m.Status == ContractModificationService.Approved && m.AppliedAt == null,
            changes = ContractModificationService.ChangesOf(current ?? new ContractTermsDto(), m),
        };

        private IActionResult ValidationErrors(Dictionary<string, string> errors) =>
            BadRequest(new { message = errors.Values.First(), errors = errors.ToDictionary(e => e.Key, e => new[] { e.Value }) });

        private async Task<Organization?> MyOrganizationAsync() =>
            await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == OrganizationOverviewController.OrganizationIdOf(User));

        /// <summary>The terms the organization may set, laid over the rest of the contract (the rates and the priority stay as the admin set them).</summary>
        private static ContractTermsDto Merge(ContractTermsDto current, OrganizationContractRequest request)
        {
            current.StartDate = request.StartDate;
            current.EndDate = request.EndDate;
            current.StartTime = request.StartTime;
            current.EndTime = request.EndTime;
            current.MinEmployees = request.MinEmployees;
            current.MaxEmployees = request.MaxEmployees;
            current.BorrowingAllowed = request.BorrowingAllowed;
            current.MaxBorrowedEmployees = request.MaxBorrowedEmployees;
            current.BillingCurrency = ContractLogic.Clean(request.BillingCurrency)?.ToUpperInvariant();
            current.BillingCycle = ContractLogic.Clean(request.BillingCycle);
            return current;
        }

        private static Dictionary<string, string> Check(ContractTermsDto terms)
        {
            var errors = ContractLogic.Validate(terms);
            if (terms.MinEmployees == null) errors["minEmployees"] = "Enter the minimum number of employees.";
            if (terms.MaxEmployees == null || terms.MaxEmployees < 1) errors["maxEmployees"] = "Enter the maximum number of employees.";
            if (terms.StartDate == null) errors["startDate"] = "Choose the start date.";
            if (terms.EndDate == null) errors["endDate"] = "Choose the end date.";
            if (string.IsNullOrWhiteSpace(terms.BillingCycle)) errors["billingCycle"] = "Choose the billing cycle.";
            if (string.IsNullOrWhiteSpace(terms.BillingCurrency)) errors["billingCurrency"] = "Choose the currency.";
            if (terms.BorrowingAllowed == true && terms.MaxBorrowedEmployees > terms.MaxEmployees)
                errors["maxBorrowedEmployees"] = "Cannot be more than the maximum employees.";
            return errors;
        }

        // GET api/organization/contracts
        [HttpGet]
        public async Task<IActionResult> List()
        {
            var org = await MyOrganizationAsync();
            if (org == null) return Unauthorized(new { message = "This organization can no longer sign in." });

            var contracts = await _db.Contracts.AsNoTracking().Where(c => c.OrgId == org.OrgId).OrderByDescending(c => c.ContractId).ToListAsync();
            var ids = contracts.Select(c => c.ContractId).ToList();
            var versions = (await _db.ContractVersions.AsNoTracking().Where(v => ids.Contains(v.ContractId)).ToListAsync())
                .GroupBy(v => v.ContractId).ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.VersionNo).First());

            return Ok(new
            {
                canCreate = ContractLogic.IsActiveStatus(org.Status),
                organizationStatus = org.Status,
                items = contracts.Select(c =>
                {
                    versions.TryGetValue(c.ContractId, out var v);
                    return new
                    {
                        contractId = c.ContractId,
                        contractNumber = c.ContractNumber,
                        status = c.Status,
                        createdAt = c.CreatedAt,
                        approvedAt = c.ApprovedAt,
                        minEmployees = v?.MinEmployees ?? c.MinEmployees,
                        maxEmployees = v?.MaxEmployees ?? c.MaxEmployees,
                        billingCycle = v?.BillingCycle,
                        startDate = v?.StartDate,
                        endDate = v?.EndDate,
                    };
                }),
            });
        }

        // GET api/organization/contracts/5
        [HttpGet("{contractId:int}")]
        public async Task<IActionResult> Get(int contractId)
        {
            var org = await MyOrganizationAsync();
            if (org == null) return Unauthorized(new { message = "This organization can no longer sign in." });

            var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == contractId && c.OrgId == org.OrgId);
            if (contract == null) return NotFound(new { message = "Contract not found." });

            var (terms, versionNo) = await ContractLogic.GetCurrentTermsAsync(_db, contract);
            var decisions = await _db.ApprovalDecisions.AsNoTracking()
                .Where(d => d.EntityType == "Contract" && d.EntityId == contractId)
                .OrderByDescending(d => d.DecidedAt)
                .Select(d => new { d.Decision, d.Reason, d.DecidedAt })
                .ToListAsync();

            var modifications = await _db.ContractModificationRequests.AsNoTracking()
                .Where(m => m.ContractId == contractId && m.RequestedByOrgId == org.OrgId)
                .OrderByDescending(m => m.ModificationId).Take(30).ToListAsync();
            var pendingChange = modifications.FirstOrDefault(m => m.Status == ContractModificationService.Pending);

            object? daily = null;
            if (string.Equals(terms.BillingCycle, DailyStaffingService.Cycle, StringComparison.OrdinalIgnoreCase) && ContractLogic.IsActiveStatus(contract.Status))
                daily = (await _daily.StatusAsync(contractId)).FirstOrDefault();

            return Ok(new
            {
                contractId = contract.ContractId,
                contractNumber = contract.ContractNumber,
                status = contract.Status,
                createdAt = contract.CreatedAt,
                approvedAt = contract.ApprovedAt,
                versionNo,
                canEdit = ContractLogic.IsStatus(contract.Status, ContractLogic.Pending),
                // An approved contract is changed with a request the admin decides on; the current contract keeps running meanwhile.
                canRequestChange = ContractLogic.IsActiveStatus(contract.Status) && pendingChange == null,
                pendingChange = pendingChange == null ? null : ChangeDto(pendingChange, terms),
                changeHistory = modifications.Where(m => m.Status != ContractModificationService.Pending).Select(m => ChangeDto(m, null)).ToList(),
                terms,
                decisions,
                dailyStaffing = daily,
            });
        }

        // POST api/organization/contracts
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] OrganizationContractRequest request)
        {
            var org = await MyOrganizationAsync();
            if (org == null) return Unauthorized(new { message = "This organization can no longer sign in." });
            if (!ContractLogic.IsActiveStatus(org.Status))
                return Conflict(new { message = "Your organization must be approved by the admin before you can ask for a contract." });

            var terms = Merge(new ContractTermsDto(), request);
            var errors = Check(terms);
            if (errors.Count > 0) return ValidationErrors(errors);

            using var _ = await _ids.LockAsync();

            if (await _db.Contracts.CountAsync(c => c.OrgId == org.OrgId && c.Status == ContractLogic.Pending) >= MaxPending)
                return Conflict(new { message = $"You already have {MaxPending} contract requests waiting for the admin. Please wait for a decision, or change one of them." });

            await using var transaction = await _db.Database.BeginTransactionAsync();
            Contract contract;
            try
            {
                contract = new Contract
                {
                    ContractId = await _ids.NextAsync(_db, "Contract", "contract_id"),
                    OrgId = org.OrgId,
                    Status = ContractLogic.Pending,
                    CreatedAt = DateTime.UtcNow,
                };
                contract.ContractNumber = $"CNT-{contract.ContractId:000}";
                ContractLogic.MirrorToContract(terms, contract);
                _db.Contracts.Add(contract);
                await _db.SaveChangesAsync();

                var note = ContractLogic.Clean(request.Note);
                var version = new ContractVersion
                {
                    ContractId = contract.ContractId,
                    VersionNo = 1,
                    ChangeSummary = note == null ? "Requested by the organization" : $"Requested by the organization: {note}",
                    CreatedAt = DateTime.UtcNow,
                };
                ContractLogic.CopyToVersion(terms, version);
                _db.ContractVersions.Add(version);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (DbUpdateException)
            {
                await transaction.RollbackAsync();
                throw;
            }

            // The admin (and the organization's manager) see it in their bells; the admin reviews it on the Contracts page.
            await _audit.LogAsync(null, "CONTRACT_REQUESTED", "Contract", contract.ContractId,
                $"{contract.ContractNumber}: {org.OrgName} asked for a contract ({terms.BillingCycle}, {terms.MinEmployees}-{terms.MaxEmployees} employees)");

            return Ok(new
            {
                message = "Your contract request was sent. The admin will review it, set the hourly rates and approve it.",
                contractId = contract.ContractId,
                contractNumber = contract.ContractNumber,
            });
        }

        // PUT api/organization/contracts/5   (only while it is still Pending)
        [HttpPut("{contractId:int}")]
        public async Task<IActionResult> Update(int contractId, [FromBody] OrganizationContractRequest request)
        {
            var org = await MyOrganizationAsync();
            if (org == null) return Unauthorized(new { message = "This organization can no longer sign in." });

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.ContractId == contractId && c.OrgId == org.OrgId);
            if (contract == null) return NotFound(new { message = "Contract not found." });
            if (!ContractLogic.IsStatus(contract.Status, ContractLogic.Pending))
                return Conflict(new { message = "Only a contract that is still waiting for the admin can be changed." });

            // Keep what the admin already set (the rates, the priority) and change only what the organization may.
            var (current, _) = await ContractLogic.GetCurrentTermsAsync(_db, contract);
            var terms = Merge(current, request);
            var errors = Check(terms);
            if (errors.Count > 0) return ValidationErrors(errors);

            ContractLogic.MirrorToContract(terms, contract);
            var version = await _db.ContractVersions.Where(v => v.ContractId == contractId).OrderByDescending(v => v.VersionNo).FirstOrDefaultAsync();
            if (version == null)
            {
                version = new ContractVersion { ContractId = contractId, VersionNo = 1, ChangeSummary = "Requested by the organization", CreatedAt = DateTime.UtcNow };
                _db.ContractVersions.Add(version);
            }
            ContractLogic.CopyToVersion(terms, version);
            var note = ContractLogic.Clean(request.Note);
            if (note != null) version.ChangeSummary = $"Requested by the organization: {note}";
            await _db.SaveChangesAsync();

            await _audit.LogAsync(null, "CONTRACT_UPDATED", "Contract", contractId, $"{contract.ContractNumber}: {org.OrgName} changed its contract request");
            return Ok(new { message = "Your contract request was updated.", contractId });
        }

        // POST api/organization/contracts/5/changes   (a change to an approved contract; the admin decides)
        [HttpPost("{contractId:int}/changes")]
        public async Task<IActionResult> RequestChange(int contractId, [FromBody] OrganizationContractChangeRequest request)
        {
            var org = await MyOrganizationAsync();
            if (org == null) return Unauthorized(new { message = "This organization can no longer sign in." });

            var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == contractId && c.OrgId == org.OrgId);
            if (contract == null) return NotFound(new { message = "Contract not found." });
            if (!ContractLogic.IsActiveStatus(contract.Status))
                return Conflict(new { message = ContractLogic.IsStatus(contract.Status, ContractLogic.Pending)
                    ? "This contract is still waiting for the admin: change the request itself instead."
                    : "Only an approved contract can be changed." });
            if (await _db.ContractModificationRequests.AnyAsync(m => m.ContractId == contractId && m.Status == ContractModificationService.Pending))
                return Conflict(new { message = "A change to this contract is already waiting for the admin. Wait for the decision, or withdraw it first." });

            var comment = ContractLogic.Clean(request.Comment);
            if (comment == null || comment.Length < 10)
                return BadRequest(new { message = "Write why you need the change (at least 10 characters).", errors = new Dictionary<string, string[]> { ["comment"] = new[] { "Write why you need the change (at least 10 characters)." } } });

            var today = Money.Today;
            if (request.EffectiveDate.HasValue && request.EffectiveDate.Value < today)
                return BadRequest(new { message = "The change cannot start in the past.", errors = new Dictionary<string, string[]> { ["effectiveDate"] = new[] { "The change cannot start in the past." } } });
            if (request.EndDate.HasValue && request.EndDate.Value < today)
                return BadRequest(new { message = "The end date cannot be in the past.", errors = new Dictionary<string, string[]> { ["endDate"] = new[] { "The end date cannot be in the past." } } });

            // Only what is different from the contract is stored; the hourly rates are not part of a change.
            var (current, _) = await ContractLogic.GetCurrentTermsAsync(_db, contract);
            var m = new ContractModificationRequest
            {
                ContractId = contractId,
                RequestedByOrgId = org.OrgId,
                Reason = comment,
                Status = ContractModificationService.Pending,
                EffectiveDate = request.EffectiveDate,
                CreatedAt = DateTime.UtcNow,
                ProposedEndDate = request.EndDate != null && request.EndDate != current.EndDate ? request.EndDate : null,
                ProposedStartTime = request.StartTime != null && request.StartTime != current.StartTime ? request.StartTime : null,
                ProposedEndTime = request.EndTime != null && request.EndTime != current.EndTime ? request.EndTime : null,
                ProposedMinEmployees = request.MinEmployees != null && request.MinEmployees != current.MinEmployees ? request.MinEmployees : null,
                ProposedMaxEmployees = request.MaxEmployees != null && request.MaxEmployees != current.MaxEmployees ? request.MaxEmployees : null,
                ProposedBorrowingAllowed = request.BorrowingAllowed != null && request.BorrowingAllowed != current.BorrowingAllowed ? request.BorrowingAllowed : null,
                ProposedMaxBorrowed = request.MaxBorrowedEmployees != null && request.MaxBorrowedEmployees != current.MaxBorrowedEmployees ? request.MaxBorrowedEmployees : null,
                ProposedBillingCycle = ContractLogic.Clean(request.BillingCycle) is { } cycle && !string.Equals(cycle, current.BillingCycle, StringComparison.OrdinalIgnoreCase) ? cycle : null,
            };

            var changes = ContractModificationService.ChangesOf(current, m);
            if (changes.Count == 0)
                return BadRequest(new { message = "Change at least one term of the contract." });

            var problem = await _changes.ProblemAsync(new Contract { OrgId = contract.OrgId }, ContractModificationService.Overlay(current, m));
            if (problem != null) return BadRequest(new { message = problem });

            _db.ContractModificationRequests.Add(m);
            await _db.SaveChangesAsync();

            var what = string.Join(", ", changes.Select(x => x.Key));
            var details = $"{contract.ContractNumber}: {org.OrgName} asks to change {what}. Comment: {comment}";
            await _audit.LogAsync(null, "CONTRACT_MODIFICATION_REQUESTED", "Contract", contractId, details.Length <= 1000 ? details : details[..1000]);

            return Ok(new
            {
                message = "Your change request was sent to the admin. Your current contract keeps running until the admin decides.",
                modificationId = m.ModificationId,
            });
        }

        // POST api/organization/contracts/changes/7/withdraw   (take back a change that is still waiting)
        [HttpPost("changes/{modificationId:int}/withdraw")]
        public async Task<IActionResult> WithdrawChange(int modificationId)
        {
            var org = await MyOrganizationAsync();
            if (org == null) return Unauthorized(new { message = "This organization can no longer sign in." });

            var m = await _db.ContractModificationRequests.FirstOrDefaultAsync(x => x.ModificationId == modificationId && x.RequestedByOrgId == org.OrgId);
            if (m == null) return NotFound(new { message = "Change request not found." });
            if (m.Status != ContractModificationService.Pending) return Conflict(new { message = "Only a change that is still waiting can be withdrawn." });

            m.Status = ContractModificationService.Withdrawn;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(null, "CONTRACT_MODIFICATION_WITHDRAWN", "Contract", m.ContractId, $"{org.OrgName} withdrew its change request");
            return Ok(new { message = "Your change request was withdrawn. Your contract stays as it is." });
        }
    }
}
