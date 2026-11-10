using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>
    /// The employee's consent. When an organization asks its employees first (Autopilot_Setting.ask_employees, the default), the AI sends the
    /// chosen employee an assignment offer (the same offers the manager sends from the Offers page). The employee accepts or declines in their
    /// portal: accepting places them with the usual rules, declining makes the AI choose somebody else. An offer nobody answers expires after
    /// Ai:OfferMinutes (10 by default) and the AI moves on.
    /// </summary>
    public partial class AutopilotService
    {
        public const string AiOfferNote = "Sent by the AI autopilot";

        public int OfferMinutes => Math.Max(1, _config.GetValue("Ai:OfferMinutes", 10));

        public async Task<bool> AskEmployeesAsync(int orgId) => (await SettingAsync(orgId))?.AskEmployees ?? true;

        public async Task SetAskEmployeesAsync(int orgId, bool ask, int? actorUserId)
        {
            var setting = await SettingAsync(orgId);
            if (setting == null)
            {
                setting = new AutopilotSetting { OrgId = orgId, Enabled = false };
                _db.AutopilotSettings.Add(setting);
            }
            setting.AskEmployees = ask;
            setting.UpdatedBy = actorUserId;
            setting.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(actorUserId, ask ? "AUTOPILOT_ASKS_EMPLOYEES" : "AUTOPILOT_PLACES_DIRECTLY", "Organization", orgId,
                ask ? "The AI now asks each employee first (an offer to accept or decline)." : "The AI now places employees at once.");
        }

        private async Task<(bool, string)> SendOfferAsync(AiDecision decision, Employee employee, Organization org, int? actorUserId)
        {
            if (await _db.AssignmentOffers.AnyAsync(o => o.EmpId == employee.EmpId && o.Status == AssignmentOffer.Pending))
                return await FailAsync(decision, "The employee already has an offer waiting.");

            var offer = new AssignmentOffer
            {
                Kind = decision.WorkforceRequestId != null ? AssignmentOffer.ForRequest : AssignmentOffer.ForMinimum,
                WorkforceRequestId = decision.WorkforceRequestId,
                ContractId = decision.ContractId,
                OrgId = decision.OrgId,
                EmpId = employee.EmpId,
                OfferedByUserId = actorUserId,
                Status = AssignmentOffer.Pending,
                Note = AiOfferNote,
                CreatedAt = DateTime.UtcNow,
            };
            _db.AssignmentOffers.Add(offer);
            await _db.SaveChangesAsync();

            decision.Status = AiDecision.Offered;
            decision.OfferId = offer.OfferId;
            decision.DecidedAt = DateTime.UtcNow;
            decision.DecidedBy = actorUserId;
            await _db.SaveChangesAsync();

            var borrowed = employee.OrgId != null && employee.OrgId != decision.OrgId;
            await _audit.LogAsync(actorUserId, "OFFER_SENT", "Employee", employee.EmpId,
                $"You were offered to work for {org.OrgName}{(borrowed ? " (your organization can spare you for a while)" : string.Empty)}. Open Assignments to accept or decline within {OfferMinutes} minutes.");
            await _audit.LogAsync(actorUserId, "OFFER_SENT_TO_EMPLOYEE", "AssignmentOffer", offer.OfferId, $"The AI offered {employee.User?.Name} to {org.OrgName}");
            return (true, $"Offer sent to {employee.User?.Name}.");
        }

        public Task<AiDecision?> DecisionOfOfferAsync(int offerId) => _db.AiDecisions.FirstOrDefaultAsync(d => d.OfferId == offerId);

        /// <summary>The employee accepted an offer of the AI: the placement is made now, with every rule checked again.</summary>
        public async Task<(int Status, string Message)> AcceptOfferAsync(AssignmentOffer offer, AiDecision decision, int employeeUserId)
        {
            var orgName = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == offer.OrgId).Select(o => o.OrgName).FirstOrDefaultAsync();
            var (ok, message) = await ApplyAsync(decision, employeeUserId, direct: true);
            offer.RespondedAt = DateTime.UtcNow;
            if (!ok)
            {
                offer.Status = AssignmentOffer.Failed;
                offer.Note = Cut(message, 255);
                await _db.SaveChangesAsync();
                await _audit.LogAsync(employeeUserId, "OFFER_FAILED", "AssignmentOffer", offer.OfferId, $"The employee accepted but the assignment could not be made: {message}");
                return (409, $"The assignment could not be made: {message}");
            }
            offer.Status = AssignmentOffer.Accepted;
            offer.AllocationId = decision.AllocationId;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(employeeUserId, "OFFER_ACCEPTED", "AssignmentOffer", offer.OfferId, $"The employee accepted the AI's offer and now works for {orgName}");
            return (200, $"You now work for {orgName}.");
        }

        /// <summary>The offer of a decision was declined, cancelled or expired: the decision ends, and the AI chooses somebody else.</summary>
        public async Task OfferEndedAsync(int offerId, string status, string? note)
        {
            var decision = await DecisionOfOfferAsync(offerId);
            if (decision == null || decision.Status != AiDecision.Offered) return;
            decision.Status = status;
            decision.Note = Cut(note, 255);
            decision.DecidedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        /// <summary>AI offers that nobody answered in time expire, so the AI can ask somebody else.</summary>
        private async Task<HashSet<int>> ExpireAiOffersAsync()
        {
            var touched = new HashSet<int>();
            var limit = DateTime.UtcNow.AddMinutes(-OfferMinutes);
            var old = await _db.AssignmentOffers.Where(o => o.Status == AssignmentOffer.Pending && o.Note == AiOfferNote && o.CreatedAt < limit).ToListAsync();
            foreach (var offer in old)
            {
                offer.Status = AssignmentOffer.Expired;
                offer.RespondedAt = DateTime.UtcNow;
                touched.Add(offer.OrgId);
            }
            if (old.Count > 0) await _db.SaveChangesAsync();
            foreach (var offer in old) await OfferEndedAsync(offer.OfferId, AiDecision.Expired, $"The employee did not answer within {OfferMinutes} minutes.");
            return touched;
        }
    }
}
