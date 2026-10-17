using System.ComponentModel.DataAnnotations;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    public class ContractChangeDecisionRequest
    {
        /// <summary>What the admin tells the organization. Required when rejecting.</summary>
        [StringLength(500)] public string? Note { get; set; }
    }

    /// <summary>
    /// Admin portal: the changes organizations ask for in their approved contracts. Approve: a new contract version is put in force (from the
    /// day the organization asked for, or right away) and every part of the system uses the new terms. Reject (with a reason): nothing changes and
    /// the current contract keeps running. The organization sees the decision and the reason, and is emailed.
    /// </summary>
    [Route("api/admin/contract-changes")]
    public class AdminContractChangesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly ContractModificationService _changes;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminContractChangesController(WorkforceManagementDbContext db, ContractModificationService changes, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _changes = changes;
            _audit = audit;
            _mailer = mailer;
        }

        // GET api/admin/contract-changes?contractId=&status=Pending|Approved|Rejected|Withdrawn|all   (default: waiting ones)
        [HttpGet]
        public async Task<IActionResult> List(int? contractId, string? status)
        {
            var query = _db.ContractModificationRequests.AsNoTracking().Where(m => m.RequestedByOrgId != null);
            if (contractId.HasValue) query = query.Where(m => m.ContractId == contractId.Value);
            if (!string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
            {
                var wanted = string.IsNullOrWhiteSpace(status) ? ContractModificationService.Pending : status.Trim();
                query = query.Where(m => m.Status == wanted);
            }

            var rows = await query.OrderBy(m => m.Status == ContractModificationService.Pending ? 0 : 1).ThenByDescending(m => m.ModificationId).Take(100).ToListAsync();
            var contractIds = rows.Select(m => m.ContractId).Distinct().ToList();
            var contracts = await _db.Contracts.AsNoTracking().Where(c => contractIds.Contains(c.ContractId))
                .Select(c => new { c.ContractId, c.ContractNumber, OrgName = c.Org != null ? c.Org.OrgName : null }).ToDictionaryAsync(c => c.ContractId);

            var items = new List<object>();
            foreach (var m in rows)
            {
                // What each term is now, only for a change that is still waiting (a decided one is shown with what was asked).
                var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == m.ContractId);
                var current = contract != null && m.Status == ContractModificationService.Pending
                    ? (await ContractLogic.GetCurrentTermsAsync(_db, contract)).terms
                    : new DTOs.Admin.ContractTermsDto();
                contracts.TryGetValue(m.ContractId, out var info);
                items.Add(new
                {
                    modificationId = m.ModificationId,
                    contractId = m.ContractId,
                    contractNumber = info?.ContractNumber,
                    organizationName = info?.OrgName,
                    status = m.Status,
                    comment = m.Reason,
                    adminResponse = m.AdminResponse,
                    effectiveDate = m.EffectiveDate,
                    createdAt = m.CreatedAt,
                    reviewedAt = m.ReviewedAt,
                    appliedAt = m.AppliedAt,
                    scheduled = m.Status == ContractModificationService.Approved && m.AppliedAt == null,
                    changes = ContractModificationService.ChangesOf(current, m),
                });
            }
            return Ok(items);
        }

        // POST api/admin/contract-changes/7/approve   { note? }
        [HttpPost("{modificationId:int}/approve")]
        public async Task<IActionResult> Approve(int modificationId, [FromBody] ContractChangeDecisionRequest request)
        {
            var m = await _db.ContractModificationRequests.FirstOrDefaultAsync(x => x.ModificationId == modificationId && x.RequestedByOrgId != null);
            if (m == null) return NotFoundMessage("Change request not found.");
            if (m.Status != ContractModificationService.Pending) return ConflictMessage($"This change was already {m.Status.ToLowerInvariant()}.");

            var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == m.ContractId);
            if (contract == null) return NotFoundMessage("The contract no longer exists.");

            var today = Money.Today;
            var startsNow = m.EffectiveDate == null || m.EffectiveDate <= today;
            var note = ContractLogic.Clean(request.Note);

            m.Status = ContractModificationService.Approved;
            m.ReviewedBy = CurrentUserId;
            m.ReviewedAt = DateTime.UtcNow;
            m.AdminResponse = note;
            _db.ApprovalDecisions.Add(new ApprovalDecision { EntityType = "ContractModification", EntityId = m.ModificationId, Decision = "Approved", Reason = note, DecidedBy = CurrentUserId, DecidedAt = DateTime.UtcNow });

            if (startsNow)
            {
                // Put the new version in force now. If it cannot be (for example more employees work there than the new maximum), nothing is saved.
                var result = await _changes.ApplyAsync(m, CurrentUserId);
                if (!result.Ok) return ConflictMessage(result.Message);
            }
            else
            {
                await _db.SaveChangesAsync();
            }

            await _audit.LogAsync(CurrentUserId, "CONTRACT_MODIFICATION_APPROVED", "Contract", m.ContractId,
                $"{contract.ContractNumber}: the organization's change was approved" + (startsNow ? string.Empty : $" and starts on {m.EffectiveDate:yyyy-MM-dd}"));

            var emailNote = contract.OrgId.HasValue
                ? await _mailer.SendOrganizationEventAsync(CurrentUserId, contract.OrgId.Value, OrganizationEvent.ContractChangeApproved, note, contract.ContractNumber)
                : string.Empty;
            return Ok(new
            {
                message = (startsNow ? "Change approved and put in force as a new version of the contract." : $"Change approved. It starts on {m.EffectiveDate:dd MMM yyyy}; until then the current contract keeps running.") + emailNote,
                modificationId,
                applied = startsNow,
            });
        }

        // POST api/admin/contract-changes/7/reject   { note }   (the reason is required)
        [HttpPost("{modificationId:int}/reject")]
        public async Task<IActionResult> Reject(int modificationId, [FromBody] ContractChangeDecisionRequest request)
        {
            var note = ContractLogic.Clean(request.Note);
            if (note == null || note.Length < 5) return FieldError("note", "Tell the organization why the change is not approved (at least 5 characters).");

            var m = await _db.ContractModificationRequests.FirstOrDefaultAsync(x => x.ModificationId == modificationId && x.RequestedByOrgId != null);
            if (m == null) return NotFoundMessage("Change request not found.");
            if (m.Status != ContractModificationService.Pending) return ConflictMessage($"This change was already {m.Status.ToLowerInvariant()}.");

            var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == m.ContractId);

            m.Status = ContractModificationService.Rejected;
            m.ReviewedBy = CurrentUserId;
            m.ReviewedAt = DateTime.UtcNow;
            m.AdminResponse = note;
            _db.ApprovalDecisions.Add(new ApprovalDecision { EntityType = "ContractModification", EntityId = m.ModificationId, Decision = "Rejected", Reason = note, DecidedBy = CurrentUserId, DecidedAt = DateTime.UtcNow });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "CONTRACT_MODIFICATION_REJECTED", "Contract", m.ContractId,
                $"{contract?.ContractNumber}: the organization's change was not approved: {note}");

            var emailNote = contract?.OrgId != null
                ? await _mailer.SendOrganizationEventAsync(CurrentUserId, contract.OrgId.Value, OrganizationEvent.ContractChangeRejected, note, contract.ContractNumber)
                : string.Empty;
            return Ok(new { message = "Change rejected. The current contract keeps running." + emailNote, modificationId });
        }
    }
}
