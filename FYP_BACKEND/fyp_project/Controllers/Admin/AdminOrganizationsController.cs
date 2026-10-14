using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: organizations (list, details, create, edit) and the verification workflow
    /// Pending -> Active (approve) / Rejected (reject), Active -> Suspended (suspend).
    /// </summary>
    [Route("api/admin/organizations")]
    public class AdminOrganizationsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly AuditService _audit;
        private readonly EmailService _email;
        private readonly AccountMailer _mailer;

        public AdminOrganizationsController(WorkforceManagementDbContext db, IdGenerator ids, AuditService audit, EmailService email, AccountMailer mailer)
        {
            _db = db;
            _ids = ids;
            _audit = audit;
            _email = email;
            _mailer = mailer;
        }

        // GET api/admin/organizations/lookup  (small list for dropdowns)
        [HttpGet("lookup")]
        public async Task<IActionResult> Lookup()
        {
            var items = await _db.Organizations
                .AsNoTracking()
                .OrderBy(o => o.OrgName)
                .Select(o => new OrganizationLookupDto
                {
                    OrganizationId = o.OrgId,
                    Name = o.OrgName,
                    Status = o.Status,
                    Country = o.Country,
                })
                .ToListAsync();

            return Ok(items);
        }

        // GET api/admin/organizations?search=&status=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Organizations.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(o =>
                    (o.OrgName != null && o.OrgName.Contains(term)) ||
                    (o.Email != null && o.Email.Contains(term)) ||
                    (o.Country != null && o.Country.Contains(term)));
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = ContractLogic.IsStatus(status, ContractLogic.Active)
                    ? query.Where(o => o.Status == "Active" || o.Status == "Approved")
                    : query.Where(o => o.Status == status);
            }

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(o => o.Status == "Pending")
                .ThenBy(o => o.OrgName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(o => new OrganizationListItemDto
                {
                    OrganizationId = o.OrgId,
                    Name = o.OrgName,
                    Email = o.Email,
                    Phone = o.Phone,
                    Country = o.Country,
                    Status = o.Status,
                    CreatedAt = o.CreatedAt,
                    ApprovedAt = o.ApprovedAt,
                    EmployeeCount = o.Employees.Count(),
                    ContractCount = o.Contracts.Count(),
                    ActiveContractCount = o.Contracts.Count(c => c.Status == "Active" || c.Status == "Approved"),
                })
                .ToListAsync();

            return Ok(new PagedResult<OrganizationListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/organizations/5
        [HttpGet("{organizationId:int}")]
        public async Task<IActionResult> Get(int organizationId)
        {
            var detail = await _db.Organizations
                .AsNoTracking()
                .Where(o => o.OrgId == organizationId)
                .Select(o => new OrganizationDetailDto
                {
                    OrganizationId = o.OrgId,
                    Name = o.OrgName,
                    Email = o.Email,
                    Phone = o.Phone,
                    Address = o.Address,
                    Country = o.Country,
                    Status = o.Status,
                    CreatedAt = o.CreatedAt,
                    ApprovedAt = o.ApprovedAt,
                    EmployeeCount = o.Employees.Count(),
                    AvailableEmployeeCount = o.Employees.Count(e => e.AvailabilityStatus == "Available"),
                    ContractCount = o.Contracts.Count(),
                    ActiveContractCount = o.Contracts.Count(c => c.Status == "Active" || c.Status == "Approved"),
                })
                .FirstOrDefaultAsync();

            if (detail == null) return NotFoundMessage("Organization not found.");

            var contracts = await _db.Contracts
                .AsNoTracking()
                .Where(c => c.OrgId == organizationId)
                .OrderByDescending(c => c.ContractId)
                .ToListAsync();

            var contractIds = contracts.Select(c => c.ContractId).ToList();
            var latestVersions = (await _db.ContractVersions
                    .AsNoTracking()
                    .Where(v => contractIds.Contains(v.ContractId))
                    .ToListAsync())
                .GroupBy(v => v.ContractId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.VersionNo).First());

            detail.Contracts = contracts.Select(c =>
            {
                latestVersions.TryGetValue(c.ContractId, out var version);
                return new OrganizationContractSummaryDto
                {
                    ContractId = c.ContractId,
                    ContractNumber = c.ContractNumber,
                    Status = c.Status,
                    MinEmployees = c.MinEmployees,
                    MaxEmployees = c.MaxEmployees,
                    StartDate = version?.StartDate,
                    EndDate = version?.EndDate,
                };
            }).ToList();

            detail.Managers = await _db.OrganizationManagers
                .AsNoTracking()
                .Where(m => m.OrgId == organizationId && m.User != null)
                .Select(m => new OrganizationManagerSummaryDto
                {
                    UserId = m.User!.UserId,
                    FullName = m.User.Name,
                    Email = m.User.Email,
                    IsActive = m.User.IsActive == true,
                })
                .ToListAsync();

            detail.Decisions = await _db.ApprovalDecisions
                .AsNoTracking()
                .Where(d => d.EntityType == "Organization" && d.EntityId == organizationId)
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

        // POST api/admin/organizations
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] SaveOrganizationRequest request)
        {
            var email = request.Email.Trim();

            using var _ = await _ids.LockAsync();

            if (await _db.Organizations.AnyAsync(o => o.Email == email))
                return ConflictMessage("An organization with this email already exists.");

            var now = DateTime.UtcNow;
            var approveNow = request.ApproveImmediately == true;

            var organization = new Organization
            {
                OrgId = await _ids.NextAsync(_db, "Organization", "org_id"),
                OrgName = request.Name.Trim(),
                Email = email,
                Phone = ContractLogic.Clean(request.Phone),
                Address = ContractLogic.Clean(request.Address),
                Country = ContractLogic.Clean(request.Country),
                Status = approveNow ? ContractLogic.Active : ContractLogic.Pending,
                CreatedAt = now,
                ApprovedAt = approveNow ? now : null,
            };
            _db.Organizations.Add(organization);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "ORGANIZATION_CREATED", "Organization", organization.OrgId,
                $"Created {organization.OrgName} ({organization.Status})");

            var emailNote = await SendRegistrationEmailAsync(organization, approveNow);

            return CreatedAtAction(nameof(Get), new { organizationId = organization.OrgId }, new
            {
                message = (approveNow ? "Organization created and approved." : "Organization created and waiting for approval.") + emailNote,
                organizationId = organization.OrgId,
            });
        }

        /// <summary>
        /// Tells the organization, at the email it was registered with, that it is now registered with WorkForce Nexus.
        /// A mail problem never undoes the registration; the admin is told in the response instead.
        /// </summary>
        private async Task<string> SendRegistrationEmailAsync(Organization organization, bool approved)
        {
            try
            {
                var (subject, html) = OrganizationEmails.Registered(organization.OrgName ?? "your organization", organization.Email ?? string.Empty, approved, organization.CreatedAt ?? DateTime.UtcNow);
                await _email.SendEmailAsync(organization.Email!, subject, html, isHtml: true);
                await _audit.LogAsync(CurrentUserId, "ORGANIZATION_EMAIL_SENT", "Organization", organization.OrgId, $"Registration email sent to {organization.Email}");
                return $" A confirmation email was sent to {organization.Email}.";
            }
            catch (Exception ex)
            {
                await _audit.LogAsync(CurrentUserId, "ORGANIZATION_EMAIL_FAILED", "Organization", organization.OrgId, $"Registration email to {organization.Email} could not be sent: {EmailDiagnostics.Explain(ex, null)}");
                return $" The confirmation email to {organization.Email} could not be sent. {EmailDiagnostics.Explain(ex, _email.SenderAddress)}";
            }
        }

        // DELETE api/admin/organizations/5
        // Only an organization with no working history can be deleted. Its manager links and any contract that was never
        // approved (pending or rejected, with its versions, rules and change requests) are removed with it.
        // Anything that would erase real records (employees, allocations, invoices, tickets, approved contracts ...) blocks it.
        [HttpDelete("{organizationId:int}")]
        public async Task<IActionResult> Delete(int organizationId)
        {
            var organization = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (organization == null) return NotFoundMessage("Organization not found.");

            var removable = new[] { ContractLogic.Pending, ContractLogic.Rejected };
            var blockers = new List<string>();

            void Add(int count, string singular, string plural)
            {
                if (count > 0) blockers.Add($"{count} {(count == 1 ? singular : plural)}");
            }

            Add(await _db.Employees.CountAsync(e => e.OrgId == organizationId), "employee", "employees");
            Add(await _db.Contracts.CountAsync(c => c.OrgId == organizationId && (c.Status == null || !removable.Contains(c.Status))), "approved or past contract", "approved or past contracts");
            Add(await _db.EmployeeAllocations.CountAsync(a => a.OwnerOrgId == organizationId || a.AssignOrgId == organizationId), "allocation", "allocations");
            Add(await _db.AllocationHistories.CountAsync(h => h.FromOrgId == organizationId || h.ToOrgId == organizationId), "allocation history entry", "allocation history entries");
            Add(await _db.WorkforceRequests.CountAsync(r => r.OrgId == organizationId || r.RequestByOrgId == organizationId), "staff request", "staff requests");
            Add(await _db.Invoices.CountAsync(i => i.OrgId == organizationId), "invoice", "invoices");
            Add(await _db.Overtimes.CountAsync(o => o.OrgId == organizationId), "overtime record", "overtime records");
            Add(await _db.Tickets.CountAsync(t => t.OrgId == organizationId), "ticket", "tickets");
            Add(await _db.Complaints.CountAsync(c => c.OrgId == organizationId), "complaint", "complaints");
            Add(await _db.Reports.CountAsync(r => r.OrgId == organizationId), "report", "reports");
            Add(await _db.OrganizationReviews.CountAsync(r => r.OrgId == organizationId), "employee review", "employee reviews");

            if (blockers.Count > 0)
            {
                return Conflict(new
                {
                    message = $"{organization.OrgName} cannot be deleted because it still has {string.Join(", ", blockers)}. These records must be kept. You can suspend the organization instead.",
                    blockers,
                });
            }

            var name = organization.OrgName;
            var email = organization.Email;
            var status = organization.Status;

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var contractIds = await _db.Contracts.Where(c => c.OrgId == organizationId).Select(c => c.ContractId).ToListAsync();
                var modificationIds = await _db.ContractModificationRequests.Where(m => contractIds.Contains(m.ContractId)).Select(m => m.ModificationId).ToListAsync();

                // Children first: the foreign keys do not allow a contract to go before its versions and rules.
                await _db.ApprovalDecisions.Where(d =>
                    (d.EntityType == "Organization" && d.EntityId == organizationId) ||
                    (d.EntityType == "Contract" && contractIds.Contains(d.EntityId)) ||
                    (d.EntityType == "ContractModification" && modificationIds.Contains(d.EntityId))).ExecuteDeleteAsync();
                await _db.ContractModificationRequests.Where(m => contractIds.Contains(m.ContractId)).ExecuteDeleteAsync();
                await _db.ContractRules.Where(r => contractIds.Contains(r.ContractId)).ExecuteDeleteAsync();
                await _db.ContractVersions.Where(v => contractIds.Contains(v.ContractId)).ExecuteDeleteAsync();
                await _db.Contracts.Where(c => c.OrgId == organizationId).ExecuteDeleteAsync();
                await _db.OrganizationManagers.Where(m => m.OrgId == organizationId).ExecuteDeleteAsync();
                await _db.Organizations.Where(o => o.OrgId == organizationId).ExecuteDeleteAsync();

                await transaction.CommitAsync();
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "The organization could not be deleted. Nothing was changed." });
            }

            await _audit.LogAsync(CurrentUserId, "ORGANIZATION_DELETED", "Organization", organizationId, $"Deleted {name} ({email}, was {status})");
            var emailNote = await _mailer.SendOrganizationDeletedAsync(CurrentUserId, organizationId, name ?? "your organization", email ?? string.Empty);
            return Ok(new { message = $"{name} was deleted.{emailNote}" });
        }

        // PUT api/admin/organizations/5
        [HttpPut("{organizationId:int}")]
        public async Task<IActionResult> Update(int organizationId, [FromBody] SaveOrganizationRequest request)
        {
            var organization = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (organization == null) return NotFoundMessage("Organization not found.");

            var email = request.Email.Trim();
            if (await _db.Organizations.AnyAsync(o => o.OrgId != organizationId && o.Email == email))
                return ConflictMessage("Another organization already uses this email.");

            organization.OrgName = request.Name.Trim();
            organization.Email = email;
            organization.Phone = ContractLogic.Clean(request.Phone);
            organization.Address = ContractLogic.Clean(request.Address);
            organization.Country = ContractLogic.Clean(request.Country);

            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "ORGANIZATION_UPDATED", "Organization", organizationId, organization.OrgName);

            var emailNote = await _mailer.SendOrganizationEventAsync(CurrentUserId, organizationId, OrganizationEvent.Updated);
            return Ok(new { message = "Organization updated." + emailNote, organizationId });
        }

        // POST api/admin/organizations/5/approve   (Pending, Rejected or Suspended -> Active)
        [HttpPost("{organizationId:int}/approve")]
        public async Task<IActionResult> Approve(int organizationId, [FromBody] DecisionRequest request)
        {
            var organization = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (organization == null) return NotFoundMessage("Organization not found.");

            if (ContractLogic.IsActiveStatus(organization.Status))
                return ConflictMessage("This organization is already active.");

            organization.Status = ContractLogic.Active;
            organization.ApprovedAt = DateTime.UtcNow;

            return await SaveDecisionAsync(organization, "Approved", request.Reason, "ORGANIZATION_APPROVED", "Organization approved.");
        }

        // POST api/admin/organizations/5/reject   (Pending -> Rejected, reason required)
        [HttpPost("{organizationId:int}/reject")]
        public async Task<IActionResult> Reject(int organizationId, [FromBody] DecisionRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Reason)) return FieldError("reason", "A reason is required when rejecting.");

            var organization = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (organization == null) return NotFoundMessage("Organization not found.");

            if (!ContractLogic.IsStatus(organization.Status, ContractLogic.Pending))
                return ConflictMessage("Only organizations waiting for approval can be rejected. Use Suspend for active organizations.");

            organization.Status = ContractLogic.Rejected;

            return await SaveDecisionAsync(organization, "Rejected", request.Reason, "ORGANIZATION_REJECTED", "Organization rejected.");
        }

        // POST api/admin/organizations/5/suspend   (Active -> Suspended, reason required)
        [HttpPost("{organizationId:int}/suspend")]
        public async Task<IActionResult> Suspend(int organizationId, [FromBody] DecisionRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Reason)) return FieldError("reason", "A reason is required when suspending.");

            var organization = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == organizationId);
            if (organization == null) return NotFoundMessage("Organization not found.");

            if (!ContractLogic.IsActiveStatus(organization.Status))
                return ConflictMessage("Only active organizations can be suspended.");

            organization.Status = ContractLogic.Suspended;

            return await SaveDecisionAsync(organization, "Suspended", request.Reason, "ORGANIZATION_SUSPENDED", "Organization suspended.");
        }

        private async Task<IActionResult> SaveDecisionAsync(
            Organization organization, string decision, string? reason, string auditAction, string message)
        {
            _db.ApprovalDecisions.Add(new ApprovalDecision
            {
                EntityType = "Organization",
                EntityId = organization.OrgId,
                Decision = decision,
                Reason = ContractLogic.Clean(reason),
                DecidedBy = CurrentUserId,
                DecidedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, auditAction, "Organization", organization.OrgId,
                $"{organization.OrgName}: {ContractLogic.Clean(reason) ?? decision}");

            var kind = decision switch { "Approved" => OrganizationEvent.Approved, "Rejected" => OrganizationEvent.Rejected, _ => OrganizationEvent.Suspended };
            var emailNote = await _mailer.SendOrganizationEventAsync(CurrentUserId, organization.OrgId, kind, ContractLogic.Clean(reason));

            return Ok(new { message = message + emailNote, organizationId = organization.OrgId, status = organization.Status });
        }
    }
}
