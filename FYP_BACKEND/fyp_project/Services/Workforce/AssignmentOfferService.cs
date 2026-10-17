using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public record OfferSendResult(int EmployeeId, string? Name, bool Ok, string Message);

    /// <summary>
    /// Until the AI allocation exists, the organization manager forwards an organization's requirement (extra employees of a staff request, or the
    /// minimum staff of a contract) to employees of the pool. The employee gets an offer and accepts or declines it; accepting allocates them
    /// with the usual rules, and they then appear online on the organization's screen. Offers that nobody answers expire after a day.
    /// </summary>
    public class AssignmentOfferService
    {
        public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

        private readonly WorkforceManagementDbContext _db;
        private readonly AllocationService _allocations;
        private readonly DailyStaffingService _daily;
        private readonly AuditService _audit;

        public AssignmentOfferService(WorkforceManagementDbContext db, AllocationService allocations, DailyStaffingService daily, AuditService audit)
        {
            _db = db;
            _allocations = allocations;
            _daily = daily;
            _audit = audit;
        }

        private IQueryable<EmployeeAllocation> Open() => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

        public async Task ExpireAsync()
        {
            var limit = DateTime.UtcNow - Lifetime;
            var old = await _db.AssignmentOffers.Where(o => o.Status == AssignmentOffer.Pending && o.CreatedAt < limit).ToListAsync();
            foreach (var offer in old)
            {
                offer.Status = AssignmentOffer.Expired;
                offer.RespondedAt = DateTime.UtcNow;
            }
            if (old.Count > 0) await _db.SaveChangesAsync();
        }

        private async Task<bool> IsDailyAsync(int contractId) =>
            string.Equals(await _db.ContractVersions.AsNoTracking().Where(v => v.ContractId == contractId).OrderByDescending(v => v.VersionNo).Select(v => v.BillingCycle).FirstOrDefaultAsync(), DailyStaffingService.Cycle, StringComparison.OrdinalIgnoreCase);

        /// <summary>The open allocations that count as the contract's minimum staff.</summary>
        private async Task<int> MinimumCountAsync(Contract contract)
        {
            var isDaily = await IsDailyAsync(contract.ContractId);
            return isDaily
                ? await Open().CountAsync(a => a.DailyContractId == contract.ContractId)
                : await Open().CountAsync(a => a.AssignOrgId == contract.OrgId && a.WorkforceRequestId == null && a.DailyContractId == null);
        }

        // ---------------------------------------------------------------- sending

        /// <summary>Sends offers for a staff request (kind Request, targetId = request id) or a contract's minimum (kind Minimum, targetId = contract id).</summary>
        public async Task<(int Status, string? Error, List<OfferSendResult> Results)> SendAsync(int managerUserId, string kind, int targetId, IEnumerable<int> employeeIds)
        {
            await ExpireAsync();
            var ids = employeeIds.Distinct().ToList();
            if (ids.Count == 0) return (400, "Choose at least one employee.", new());

            var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == managerUserId && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            int orgId;
            int stillNeeded;
            int? requestId = null, contractId = null;

            if (kind == AssignmentOffer.ForRequest)
            {
                var request = await _db.WorkforceRequests.AsNoTracking().FirstOrDefaultAsync(r => r.WorkforceRequestId == targetId && r.OrgId != null && orgIds.Contains(r.OrgId.Value));
                if (request == null) return (404, "Staff request not found.", new());
                if (request.Status != "Approved") return (409, "Approve the request first, then send it to employees.", new());
                orgId = request.OrgId!.Value;
                requestId = request.WorkforceRequestId;
                var staffed = await Open().CountAsync(a => a.WorkforceRequestId == targetId);
                var pending = await _db.AssignmentOffers.CountAsync(o => o.WorkforceRequestId == targetId && o.Status == AssignmentOffer.Pending);
                stillNeeded = (request.RequiredEmployees ?? 0) - staffed - pending;
            }
            else
            {
                var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == targetId && c.OrgId != null && orgIds.Contains(c.OrgId.Value) && (c.Status == "Active" || c.Status == "Approved"));
                if (contract == null) return (404, "Active contract not found.", new());
                orgId = contract.OrgId!.Value;
                contractId = contract.ContractId;
                if (await IsDailyAsync(contract.ContractId))
                {
                    var (_, problem) = await _daily.TodayWindowEndAsync(contract);
                    if (problem != null) return (409, problem, new());
                }
                var pending = await _db.AssignmentOffers.CountAsync(o => o.ContractId == targetId && o.Kind == AssignmentOffer.ForMinimum && o.Status == AssignmentOffer.Pending);
                stillNeeded = (contract.MinEmployees ?? 0) - await MinimumCountAsync(contract) - pending;
            }

            if (stillNeeded <= 0) return (409, "Nobody more is needed (employees working and offers waiting already cover it).", new());
            if (ids.Count > stillNeeded) return (400, $"Only {stillNeeded} more employee(s) are needed. Choose fewer.", new());

            var results = new List<OfferSendResult>();
            foreach (var empId in ids)
            {
                var employee = await _db.Employees.AsNoTracking().Where(e => e.EmpId == empId).Select(e => new { e.EmpId, e.UserId, Name = e.User!.Name, Active = e.User.IsActive == true }).FirstOrDefaultAsync();
                if (employee == null || !employee.Active) { results.Add(new OfferSendResult(empId, employee?.Name, false, "This employee is not active.")); continue; }
                if (await Open().AnyAsync(a => a.EmployeeId == empId)) { results.Add(new OfferSendResult(empId, employee.Name, false, "This employee is already working for an organization.")); continue; }
                if (await _db.AssignmentOffers.AnyAsync(o => o.EmpId == empId && o.Status == AssignmentOffer.Pending)) { results.Add(new OfferSendResult(empId, employee.Name, false, "This employee already has an offer waiting.")); continue; }

                var offer = new AssignmentOffer { Kind = kind, WorkforceRequestId = requestId, ContractId = contractId, OrgId = orgId, EmpId = empId, OfferedByUserId = managerUserId, Status = AssignmentOffer.Pending, CreatedAt = DateTime.UtcNow };
                _db.AssignmentOffers.Add(offer);
                await _db.SaveChangesAsync();
                var orgName = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == orgId).Select(o => o.OrgName).FirstOrDefaultAsync();
                await _audit.LogAsync(managerUserId, "OFFER_SENT", "Employee", empId, $"You were offered to work for {orgName}. Open Assignments to accept or decline.");
                await _audit.LogAsync(managerUserId, "OFFER_SENT_TO_EMPLOYEE", "AssignmentOffer", offer.OfferId, $"Offer sent to {employee.Name} for {orgName}");
                results.Add(new OfferSendResult(empId, employee.Name, true, "Offer sent."));
            }
            return (200, null, results);
        }

        // ---------------------------------------------------------------- answering

        public async Task<(int Status, string Message, AssignmentOffer? Offer)> AcceptAsync(int offerId, int employeeUserId)
        {
            await ExpireAsync();
            var empId = await _db.Employees.AsNoTracking().Where(e => e.UserId == employeeUserId).Select(e => (int?)e.EmpId).FirstOrDefaultAsync();
            var offer = empId == null ? null : await _db.AssignmentOffers.FirstOrDefaultAsync(o => o.OfferId == offerId && o.EmpId == empId);
            if (offer == null) return (404, "Offer not found.", null);
            if (offer.Status != AssignmentOffer.Pending) return (409, $"This offer is {offer.Status.ToLower()}.", offer);

            string? failure = null;
            int? allocationId = null;
            var orgName = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == offer.OrgId).Select(o => o.OrgName).FirstOrDefaultAsync();

            if (offer.Kind == AssignmentOffer.ForRequest)
            {
                var request = await _db.WorkforceRequests.AsNoTracking().FirstOrDefaultAsync(r => r.WorkforceRequestId == offer.WorkforceRequestId);
                if (request == null || request.Status != "Approved") failure = "The request is no longer open.";
                else if (await Open().CountAsync(a => a.WorkforceRequestId == request.WorkforceRequestId) >= (request.RequiredEmployees ?? 0)) failure = "The request is already fully staffed.";
                else
                {
                    var outcome = await _allocations.AllocateAsync(new AllocateRequest
                    {
                        EmployeeId = offer.EmpId,
                        AssignOrgId = offer.OrgId,
                        WorkforceRequestId = request.WorkforceRequestId,
                        ExpectedEnd = request.EndDatetime > DateTime.UtcNow ? request.EndDatetime : null,
                        Reason = $"Staff request #{request.WorkforceRequestId} (accepted by the employee)",
                        Force = false,
                    }, employeeUserId);
                    if (outcome.Success) allocationId = outcome.AllocationId; else failure = outcome.Violations.FirstOrDefault()?.Message ?? outcome.Message;
                }
            }
            else
            {
                var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.ContractId == offer.ContractId && (c.Status == "Active" || c.Status == "Approved"));
                if (contract == null) failure = "The contract is no longer active.";
                else if (await MinimumCountAsync(contract) >= (contract.MinEmployees ?? 0)) failure = "The minimum staff is already complete.";
                else
                {
                    var isDaily = await IsDailyAsync(contract.ContractId);
                    DateTime? windowEnd = null;
                    if (isDaily)
                    {
                        var (end, problem) = await _daily.TodayWindowEndAsync(contract);
                        if (problem != null) failure = problem; else windowEnd = end;
                    }
                    if (failure == null)
                    {
                        var outcome = await _allocations.AllocateAsync(new AllocateRequest
                        {
                            EmployeeId = offer.EmpId,
                            AssignOrgId = offer.OrgId,
                            ExpectedEnd = windowEnd,
                            Reason = $"Minimum staff of contract {contract.ContractNumber} (accepted by the employee)",
                            Force = false,
                        }, employeeUserId);
                        if (outcome.Success)
                        {
                            allocationId = outcome.AllocationId;
                            if (isDaily)
                            {
                                var allocation = await _db.EmployeeAllocations.FirstAsync(a => a.AllocationId == outcome.AllocationId!.Value);
                                allocation.DailyContractId = contract.ContractId;
                                await _db.SaveChangesAsync();
                            }
                        }
                        else failure = outcome.Violations.FirstOrDefault()?.Message ?? outcome.Message;
                    }
                }
            }

            offer.RespondedAt = DateTime.UtcNow;
            if (failure != null)
            {
                offer.Status = AssignmentOffer.Failed;
                offer.Note = failure.Length > 255 ? failure[..255] : failure;
                await _db.SaveChangesAsync();
                await _audit.LogAsync(employeeUserId, "OFFER_FAILED", "AssignmentOffer", offer.OfferId, $"The employee accepted but the assignment could not be made: {failure}");
                return (409, $"The assignment could not be made: {failure}", offer);
            }

            offer.Status = AssignmentOffer.Accepted;
            offer.AllocationId = allocationId;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(employeeUserId, "EMPLOYEE_ALLOCATED", "Allocation", allocationId, $"Accepted the assignment to {orgName}");
            await _audit.LogAsync(employeeUserId, "OFFER_ACCEPTED", "AssignmentOffer", offer.OfferId, $"The employee accepted and now works for {orgName}");
            return (200, $"You now work for {orgName}.", offer);
        }

        public async Task<(int Status, string Message)> DeclineAsync(int offerId, int employeeUserId, string? note)
        {
            await ExpireAsync();
            var empId = await _db.Employees.AsNoTracking().Where(e => e.UserId == employeeUserId).Select(e => (int?)e.EmpId).FirstOrDefaultAsync();
            var offer = empId == null ? null : await _db.AssignmentOffers.FirstOrDefaultAsync(o => o.OfferId == offerId && o.EmpId == empId);
            if (offer == null) return (404, "Offer not found.");
            if (offer.Status != AssignmentOffer.Pending) return (409, $"This offer is {offer.Status.ToLower()}.");

            offer.Status = AssignmentOffer.Declined;
            offer.RespondedAt = DateTime.UtcNow;
            offer.Note = ContractLogic.Clean(note);
            await _db.SaveChangesAsync();
            await _audit.LogAsync(employeeUserId, "OFFER_DECLINED", "AssignmentOffer", offerId, offer.Note == null ? "The employee declined the offer" : $"The employee declined the offer: {offer.Note}");
            return (200, "You declined the offer.");
        }

        public async Task<(int Status, string Message)> CancelAsync(int offerId, int managerUserId)
        {
            var orgIds = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == managerUserId && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            var offer = await _db.AssignmentOffers.FirstOrDefaultAsync(o => o.OfferId == offerId && orgIds.Contains(o.OrgId));
            if (offer == null) return (404, "Offer not found.");
            if (offer.Status != AssignmentOffer.Pending) return (409, $"This offer is already {offer.Status.ToLower()}.");
            offer.Status = AssignmentOffer.Cancelled;
            offer.RespondedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(managerUserId, "OFFER_CANCELLED", "AssignmentOffer", offerId, "The manager cancelled the offer");
            return (200, "Offer cancelled.");
        }
    }
}
