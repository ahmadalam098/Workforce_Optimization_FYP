using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: contracts (list, details, create, edit while pending), the approval workflow
    /// Pending -> Active / Rejected, Active -> Terminated, and the rules attached to a contract.
    /// </summary>
    [Route("api/admin/contracts")]
    public class AdminContractsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminContractsController(
            WorkforceManagementDbContext db,
            IdGenerator ids,
            AuditService audit,
            AccountMailer mailer)
        {
            _db = db;
            _ids = ids;
            _audit = audit;
            _mailer = mailer;
        }

        // GET api/admin/contracts?search=&status=&organizationId=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, int? organizationId, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Contracts.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(c =>
                    (c.ContractNumber != null && c.ContractNumber.Contains(term)) ||
                    (c.Org != null && c.Org.OrgName != null && c.Org.OrgName.Contains(term)));
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = ContractLogic.IsStatus(status, ContractLogic.Active)
                    ? query.Where(c => c.Status == "Active" || c.Status == "Approved")
                    : query.Where(c => c.Status == status);
            }

            if (organizationId.HasValue) query = query.Where(c => c.OrgId == organizationId.Value);

            var total = await query.CountAsync();

            var rows = await query
                .OrderByDescending(c => c.Status == "Pending")
                .ThenByDescending(c => c.ContractId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(c => new ContractListItemDto
                {
                    ContractId = c.ContractId,
                    ContractNumber = c.ContractNumber,
                    OrganizationId = c.OrgId,
                    OrganizationName = c.Org != null ? c.Org.OrgName : null,
                    Status = c.Status,
                    MinEmployees = c.MinEmployees,
                    MaxEmployees = c.MaxEmployees,
                    BaseHourlyRate = c.BaseHourlyRate,
                    ExtraHourlyRate = c.ExtraHourlyRate,
                    BillingCurrency = c.BillingCurrency,
                    CreatedAt = c.CreatedAt,
                    VersionNo = 1,
                })
                .ToListAsync();

            var ids = rows.Select(r => r.ContractId).ToList();

            var latestVersions = (await _db.ContractVersions.AsNoTracking().Where(v => ids.Contains(v.ContractId)).ToListAsync())
                .GroupBy(v => v.ContractId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.VersionNo).First());

            foreach (var row in rows)
            {
                if (latestVersions.TryGetValue(row.ContractId, out var version))
                {
                    row.VersionNo = version.VersionNo;
                    row.StartDate = version.StartDate;
                    row.EndDate = version.EndDate;
                }
            }

            return Ok(new PagedResult<ContractListItemDto> { Items = rows, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/contracts/5
        [HttpGet("{contractId:int}")]
        public async Task<IActionResult> Get(int contractId)
        {
            var contract = await _db.Contracts.AsNoTracking().Include(c => c.Org).FirstOrDefaultAsync(c => c.ContractId == contractId);
            if (contract == null) return NotFoundMessage("Contract not found.");

            var versions = await _db.ContractVersions
                .AsNoTracking()
                .Where(v => v.ContractId == contractId)
                .OrderByDescending(v => v.VersionNo)
                .ToListAsync();

            var creatorIds = versions.Where(v => v.CreatedBy.HasValue).Select(v => v.CreatedBy!.Value).Distinct().ToList();
            var creatorNames = await _db.Users.AsNoTracking()
                .Where(u => creatorIds.Contains(u.UserId))
                .ToDictionaryAsync(u => u.UserId, u => u.Name);

            var detail = new ContractDetailDto
            {
                ContractId = contract.ContractId,
                ContractNumber = contract.ContractNumber,
                OrganizationId = contract.OrgId,
                OrganizationName = contract.Org?.OrgName,
                OrganizationStatus = contract.Org?.Status,
                Status = contract.Status,
                CreatedAt = contract.CreatedAt,
                ApprovedAt = contract.ApprovedAt,
            };

            if (versions.Count > 0)
            {
                detail.VersionNo = versions[0].VersionNo;
                detail.Terms = ContractLogic.FromVersion<ContractTermsDto>(versions[0]);
                detail.Versions = versions.Select(v =>
                {
                    var dto = ContractLogic.FromVersion<ContractVersionDto>(v);
                    dto.VersionNo = v.VersionNo;
                    dto.ChangeSummary = v.ChangeSummary;
                    dto.CreatedAt = v.CreatedAt;
                    dto.CreatedBy = v.CreatedBy.HasValue ? creatorNames.GetValueOrDefault(v.CreatedBy.Value) : null;
                    return dto;
                }).ToList();
            }
            else
            {
                // Contract created before versioning existed: show it as version 1.
                detail.VersionNo = 1;
                detail.Terms = ContractLogic.FromContract(contract);
                var legacy = ContractLogic.FromContract(contract);
                detail.Versions.Add(new ContractVersionDto
                {
                    VersionNo = 1,
                    ChangeSummary = "Original contract",
                    CreatedAt = contract.CreatedAt,
                    StartTime = legacy.StartTime, EndTime = legacy.EndTime, MinEmployees = legacy.MinEmployees,
                    MaxEmployees = legacy.MaxEmployees, BorrowingAllowed = legacy.BorrowingAllowed,
                    PriorityLevel = legacy.PriorityLevel,
                    BillingCurrency = legacy.BillingCurrency, BaseHourlyRate = legacy.BaseHourlyRate,
                    ExtraHourlyRate = legacy.ExtraHourlyRate,
                });
            }

            detail.Rules = await _db.ContractRules
                .AsNoTracking()
                .Where(r => r.ContractId == contractId)
                .OrderBy(r => r.Category).ThenBy(r => r.RuleId)
                .Select(r => new ContractRuleDto
                {
                    RuleId = r.RuleId, Category = r.Category, Title = r.Title, RuleValue = r.RuleValue,
                    Description = r.Description, IsActive = r.IsActive, CreatedAt = r.CreatedAt,
                })
                .ToListAsync();

            detail.Decisions = await _db.ApprovalDecisions
                .AsNoTracking()
                .Where(d => d.EntityType == "Contract" && d.EntityId == contractId)
                .OrderByDescending(d => d.DecidedAt)
                .Select(d => new DecisionDto
                {
                    Decision = d.Decision,
                    Reason = d.Reason,
                    DecidedAt = d.DecidedAt,
                    DecidedBy = _db.Users.Where(u => u.UserId == d.DecidedBy).Select(u => u.Name).FirstOrDefault(),
                })
                .ToListAsync();

            return Ok(detail);
        }

        // POST api/admin/contracts   (creates a Pending contract, version 1)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateContractRequest request)
        {
            var errors = ContractLogic.Validate(request);
            if (errors.Count > 0) return ValidationErrors(errors);

            var organization = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == request.OrganizationId);
            if (organization == null) return FieldError("organizationId", "The selected organization does not exist.");
            if (!ContractLogic.IsActiveStatus(organization.Status))
                return FieldError("organizationId", "Contracts can only be created for approved (active) organizations.");

            using var _ = await _ids.LockAsync();

            var number = ContractLogic.Clean(request.ContractNumber);
            if (number != null && await _db.Contracts.AnyAsync(c => c.ContractNumber == number))
                return FieldError("contractNumber", "This contract number is already used.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var contract = new Contract
                {
                    ContractId = await _ids.NextAsync(_db, "Contract", "contract_id"),
                    OrgId = request.OrganizationId,
                    Status = ContractLogic.Pending,
                    CreatedAt = DateTime.UtcNow,
                };
                contract.ContractNumber = number ?? $"CNT-{contract.ContractId:000}";
                ContractLogic.MirrorToContract(request, contract);
                _db.Contracts.Add(contract);
                await _db.SaveChangesAsync();

                var version = new ContractVersion
                {
                    ContractId = contract.ContractId,
                    VersionNo = 1,
                    ChangeSummary = "Original contract",
                    CreatedBy = CurrentUserId,
                    CreatedAt = DateTime.UtcNow,
                };
                ContractLogic.CopyToVersion(request, version);
                _db.ContractVersions.Add(version);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                await _audit.LogAsync(CurrentUserId, "CONTRACT_CREATED", "Contract", contract.ContractId,
                    $"{contract.ContractNumber} for {organization.OrgName}");

                return CreatedAtAction(nameof(Get), new { contractId = contract.ContractId }, new
                {
                    message = "Contract created and waiting for approval.",
                    contractId = contract.ContractId,
                    contractNumber = contract.ContractNumber,
                });
            }
            catch (DbUpdateException)
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        // PUT api/admin/contracts/5   (Pending: edited in place. Active or Suspended: saved as a new version, the old one stays in the history)
        [HttpPut("{contractId:int}")]
        public async Task<IActionResult> Update(int contractId, [FromBody] UpdateContractRequest request)
        {
            var errors = ContractLogic.Validate(request);
            if (errors.Count > 0) return ValidationErrors(errors);

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.ContractId == contractId);
            if (contract == null) return NotFoundMessage("Contract not found.");

            var isPending = ContractLogic.IsStatus(contract.Status, ContractLogic.Pending);
            var isLive = ContractLogic.IsActiveStatus(contract.Status) || ContractLogic.IsStatus(contract.Status, ContractLogic.Suspended);
            if (!isPending && !isLive)
                return ConflictMessage("Rejected and terminated contracts cannot be edited.");

            var summary = ContractLogic.Clean(request.ChangeSummary);
            if (isLive && (summary == null || summary.Length < 5))
                return FieldError("changeSummary", "Write what changed and why (at least 5 characters). It is kept with the new version.");

            // The staff limit cannot drop below the number of employees the organization is working with right now.
            if (isLive && request.MaxEmployees.HasValue && contract.OrgId.HasValue)
            {
                var working = await _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).CountAsync(a => a.AssignOrgId == contract.OrgId);
                if (request.MaxEmployees.Value < working)
                    return FieldError("maxEmployees", $"{working} employee(s) are working for this organization right now, so the maximum cannot be below {working}. Release some first.");
            }

            var number = ContractLogic.Clean(request.ContractNumber);
            if (number != null && await _db.Contracts.AnyAsync(c => c.ContractId != contractId && c.ContractNumber == number))
                return FieldError("contractNumber", "This contract number is already used.");

            if (number != null) contract.ContractNumber = number;

            if (isPending)
            {
                ContractLogic.MirrorToContract(request, contract);

                var version = await _db.ContractVersions
                    .Where(v => v.ContractId == contractId)
                    .OrderByDescending(v => v.VersionNo)
                    .FirstOrDefaultAsync();

                if (version == null)
                {
                    version = new ContractVersion
                    {
                        ContractId = contractId, VersionNo = 1, ChangeSummary = "Original contract",
                        CreatedBy = CurrentUserId, CreatedAt = DateTime.UtcNow,
                    };
                    _db.ContractVersions.Add(version);
                }
                ContractLogic.CopyToVersion(request, version);
            }
            else
            {
                var now = DateTime.UtcNow;
                var (current, versionNo) = await ContractLogic.GetCurrentTermsAsync(_db, contract);

                // Contracts that existed before versioning get their current terms saved as version 1 first.
                if (!await _db.ContractVersions.AnyAsync(v => v.ContractId == contractId))
                {
                    var original = new ContractVersion { ContractId = contractId, VersionNo = 1, ChangeSummary = "Original contract", CreatedAt = contract.CreatedAt ?? now };
                    ContractLogic.CopyToVersion(current, original);
                    _db.ContractVersions.Add(original);
                }

                var next = new ContractVersion { ContractId = contractId, VersionNo = versionNo + 1, ChangeSummary = summary, CreatedBy = CurrentUserId, CreatedAt = now };
                ContractLogic.CopyToVersion(request, next);
                _db.ContractVersions.Add(next);
                ContractLogic.MirrorToContract(request, contract);
            }

            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "CONTRACT_UPDATED", "Contract", contractId, contract.ContractNumber);

            var emailNote = contract.OrgId.HasValue
                ? await _mailer.SendOrganizationEventAsync(CurrentUserId, contract.OrgId.Value, OrganizationEvent.ContractUpdated, null, contract.ContractNumber)
                : string.Empty;
            return Ok(new { message = "Contract updated." + emailNote, contractId });
        }

        // POST api/admin/contracts/5/approve   (Pending -> Active)
        [HttpPost("{contractId:int}/approve")]
        public async Task<IActionResult> Approve(int contractId, [FromBody] DecisionRequest request)
        {
            var contract = await _db.Contracts.Include(c => c.Org).FirstOrDefaultAsync(c => c.ContractId == contractId);
            if (contract == null) return NotFoundMessage("Contract not found.");

            if (!ContractLogic.IsStatus(contract.Status, ContractLogic.Pending))
                return ConflictMessage("Only contracts waiting for approval can be approved.");

            if (contract.Org == null || !ContractLogic.IsActiveStatus(contract.Org.Status))
                return ConflictMessage("The organization must be approved (active) before its contract can be approved.");

            contract.Status = ContractLogic.Active;
            contract.ApprovedAt = DateTime.UtcNow;

            return await SaveDecisionAsync(contract, "Approved", request.Reason, "CONTRACT_APPROVED", "Contract approved and now active.");
        }

        // POST api/admin/contracts/5/reject   (Pending -> Rejected, reason required)
        [HttpPost("{contractId:int}/reject")]
        public async Task<IActionResult> Reject(int contractId, [FromBody] DecisionRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Reason)) return FieldError("reason", "A reason is required when rejecting.");

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.ContractId == contractId);
            if (contract == null) return NotFoundMessage("Contract not found.");

            if (!ContractLogic.IsStatus(contract.Status, ContractLogic.Pending))
                return ConflictMessage("Only contracts waiting for approval can be rejected.");

            contract.Status = ContractLogic.Rejected;

            return await SaveDecisionAsync(contract, "Rejected", request.Reason, "CONTRACT_REJECTED", "Contract rejected.");
        }

        // POST api/admin/contracts/5/terminate   (Active -> Terminated, reason required)
        [HttpPost("{contractId:int}/terminate")]
        public async Task<IActionResult> Terminate(int contractId, [FromBody] DecisionRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Reason)) return FieldError("reason", "A reason is required when terminating.");

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.ContractId == contractId);
            if (contract == null) return NotFoundMessage("Contract not found.");

            if (!ContractLogic.IsActiveStatus(contract.Status))
                return ConflictMessage("Only active contracts can be terminated.");

            contract.Status = ContractLogic.Terminated;

            return await SaveDecisionAsync(contract, "Terminated", request.Reason, "CONTRACT_TERMINATED", "Contract terminated.");
        }

        // ---- Rules ----

        // POST api/admin/contracts/5/rules
        [HttpPost("{contractId:int}/rules")]
        public async Task<IActionResult> AddRule(int contractId, [FromBody] RuleRequest request)
        {
            if (!ContractLogic.RuleCategories.Contains(request.Category))
                return FieldError("category", "Category must be Staffing, Borrowing, Payment or Operational.");

            var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == contractId);
            if (contract == null) return NotFoundMessage("Contract not found.");

            var rule = new ContractRule
            {
                ContractId = contractId,
                Category = request.Category,
                Title = request.Title.Trim(),
                RuleValue = ContractLogic.Clean(request.RuleValue),
                Description = ContractLogic.Clean(request.Description),
                IsActive = request.IsActive ?? true,
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.ContractRules.Add(rule);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "CONTRACT_RULE_ADDED", "Contract", contractId, $"{rule.Category}: {rule.Title}");
            return Ok(new { message = "Rule added.", ruleId = rule.RuleId });
        }

        // PUT api/admin/contracts/5/rules/3
        [HttpPut("{contractId:int}/rules/{ruleId:int}")]
        public async Task<IActionResult> UpdateRule(int contractId, int ruleId, [FromBody] RuleRequest request)
        {
            if (!ContractLogic.RuleCategories.Contains(request.Category))
                return FieldError("category", "Category must be Staffing, Borrowing, Payment or Operational.");

            var rule = await _db.ContractRules.FirstOrDefaultAsync(r => r.RuleId == ruleId && r.ContractId == contractId);
            if (rule == null) return NotFoundMessage("Rule not found.");

            rule.Category = request.Category;
            rule.Title = request.Title.Trim();
            rule.RuleValue = ContractLogic.Clean(request.RuleValue);
            rule.Description = ContractLogic.Clean(request.Description);
            if (request.IsActive.HasValue) rule.IsActive = request.IsActive.Value;

            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "CONTRACT_RULE_UPDATED", "Contract", contractId, $"{rule.Category}: {rule.Title}");
            return Ok(new { message = "Rule updated.", ruleId });
        }

        // DELETE api/admin/contracts/5/rules/3
        [HttpDelete("{contractId:int}/rules/{ruleId:int}")]
        public async Task<IActionResult> DeleteRule(int contractId, int ruleId)
        {
            var rule = await _db.ContractRules.FirstOrDefaultAsync(r => r.RuleId == ruleId && r.ContractId == contractId);
            if (rule == null) return NotFoundMessage("Rule not found.");

            _db.ContractRules.Remove(rule);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "CONTRACT_RULE_DELETED", "Contract", contractId, $"{rule.Category}: {rule.Title}");
            return Ok(new { message = "Rule deleted.", ruleId });
        }

        private IActionResult ValidationErrors(Dictionary<string, string> errors) =>
            BadRequest(new
            {
                message = errors.Values.First(),
                errors = errors.ToDictionary(e => e.Key, e => new[] { e.Value }),
            });

        private async Task<IActionResult> SaveDecisionAsync(
            Contract contract, string decision, string? reason, string auditAction, string message)
        {
            _db.ApprovalDecisions.Add(new ApprovalDecision
            {
                EntityType = "Contract",
                EntityId = contract.ContractId,
                Decision = decision,
                Reason = ContractLogic.Clean(reason),
                DecidedBy = CurrentUserId,
                DecidedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, auditAction, "Contract", contract.ContractId,
                $"{contract.ContractNumber}: {ContractLogic.Clean(reason) ?? decision}");

            var kind = decision switch { "Approved" => OrganizationEvent.ContractApproved, "Rejected" => OrganizationEvent.ContractRejected, _ => OrganizationEvent.ContractTerminated };
            var emailNote = contract.OrgId.HasValue
                ? await _mailer.SendOrganizationEventAsync(CurrentUserId, contract.OrgId.Value, kind, ContractLogic.Clean(reason), contract.ContractNumber)
                : string.Empty;

            return Ok(new { message = message + emailNote, contractId = contract.ContractId, status = contract.Status });
        }
    }
}
