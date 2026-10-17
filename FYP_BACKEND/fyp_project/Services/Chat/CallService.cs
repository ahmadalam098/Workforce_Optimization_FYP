using System.Security.Claims;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>One side of a call: an Employee or a Manager (id = user id), or an Organization (id = organization id).</summary>
    public record CallParty(string Type, int Id)
    {
        public string Key => $"{Type}:{Id}";
    }

    public record CallPartyDto(string Type, int Id, string Key, string? Name);

    public record CallDto(long CallId, string Media, string Status, CallPartyDto Caller, CallPartyDto Callee, DateTime CreatedAt, DateTime? AnsweredAt, DateTime? EndedAt, string? EndedByType, string? EndReason);

    public record CallContactDto(string Type, int Id, string Key, string Name, string? Subtitle);

    public record CallResult(CallSession? Session, int Status = 200, string? Message = null)
    {
        public bool Ok => Session != null;
    }

    /// <summary>
    /// Audio / video calls between an employee, an organization and an organization manager. This service decides who may call whom and keeps the
    /// call session (ringing, active, ended, cut). The media itself (WebRTC) is not built yet: FYP_CHAT only relays the signalling and the browser
    /// shows a call screen without sound or picture, so the whole flow can be tested and WebRTC can be plugged in later without changing it.
    /// Who may call whom: an employee and the organization they work for now; an employee and a manager of that organization (or of their home
    /// organization); a manager and an organization they manage. Nobody else.
    /// </summary>
    public class CallService
    {
        public static readonly TimeSpan RingTimeout = TimeSpan.FromSeconds(45);

        private readonly WorkforceManagementDbContext _db;

        public CallService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        public static CallParty? PartyOf(ClaimsPrincipal user)
        {
            var role = user.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role || c.Type == "role")?.Value;
            if (string.Equals(role, "Organization", StringComparison.OrdinalIgnoreCase))
                return int.TryParse(user.FindFirst("org_id")?.Value, out var orgId) ? new CallParty(CallSession.Organization, orgId) : null;

            var raw = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("nameid")?.Value ?? user.FindFirst("sub")?.Value;
            if (!int.TryParse(raw, out var userId)) return null;
            if (string.Equals(role, "Employee", StringComparison.OrdinalIgnoreCase)) return new CallParty(CallSession.Employee, userId);
            if (string.Equals(role, "Organization Manager", StringComparison.OrdinalIgnoreCase)) return new CallParty(CallSession.Manager, userId);
            return null;
        }

        private static CallParty Caller(CallSession s) => new(s.CallerType, s.CallerId);
        private static CallParty Callee(CallSession s) => new(s.CalleeType, s.CalleeId);

        // ---------------------------------------------------------------- who is linked to whom

        private IQueryable<EmployeeAllocation> Open() => _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);

        private Task<bool> EmployeeAtOrgAsync(int employeeUserId, int orgId) =>
            Open().AnyAsync(a => a.AssignOrgId == orgId && a.Employee != null && a.Employee.UserId == employeeUserId);

        private Task<List<int>> ManagedOrgsAsync(int managerUserId) =>
            _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == managerUserId && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();

        /// <summary>The employee works for, or belongs to, one of the manager's organizations.</summary>
        public async Task<bool> EmployeeInManagerScopeAsync(int employeeUserId, int managerUserId)
        {
            var orgs = await ManagedOrgsAsync(managerUserId);
            if (orgs.Count == 0) return false;
            if (await Open().AnyAsync(a => a.AssignOrgId != null && orgs.Contains(a.AssignOrgId.Value) && a.Employee != null && a.Employee.UserId == employeeUserId)) return true;
            return await _db.Employees.AsNoTracking().AnyAsync(e => e.UserId == employeeUserId && e.OrgId != null && orgs.Contains(e.OrgId.Value));
        }

        public async Task<bool> LinkedAsync(CallParty a, CallParty b)
        {
            if (a.Type == b.Type) return false;
            var types = new[] { a, b }.OrderBy(p => p.Type).ToArray(); // Employee < Manager < Organization
            var (x, y) = (types[0], types[1]);
            if (x.Type == CallSession.Employee && y.Type == CallSession.Manager) return await EmployeeInManagerScopeAsync(x.Id, y.Id);
            if (x.Type == CallSession.Employee && y.Type == CallSession.Organization) return await EmployeeAtOrgAsync(x.Id, y.Id);
            if (x.Type == CallSession.Manager && y.Type == CallSession.Organization) return (await ManagedOrgsAsync(x.Id)).Contains(y.Id);
            return false;
        }

        /// <summary>Whether a manager may watch and cut this call: one side is an employee of theirs or an organization they manage.</summary>
        public async Task<bool> CanMonitorAsync(int managerUserId, CallSession s)
        {
            foreach (var p in new[] { Caller(s), Callee(s) })
            {
                if (p.Type == CallSession.Employee && await EmployeeInManagerScopeAsync(p.Id, managerUserId)) return true;
                if (p.Type == CallSession.Organization && (await ManagedOrgsAsync(managerUserId)).Contains(p.Id)) return true;
            }
            return false;
        }

        // ---------------------------------------------------------------- names / dto

        private async Task<(Dictionary<int, string?> Users, Dictionary<int, string?> Orgs)> NamesAsync(IEnumerable<CallSession> sessions)
        {
            var parties = sessions.SelectMany(s => new[] { Caller(s), Callee(s) }).ToList();
            var userIds = parties.Where(p => p.Type != CallSession.Organization).Select(p => p.Id).Distinct().ToList();
            var orgIds = parties.Where(p => p.Type == CallSession.Organization).Select(p => p.Id).Distinct().ToList();
            return (await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name),
                    await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName));
        }

        public async Task<List<CallDto>> DescribeAsync(IEnumerable<CallSession> sessions)
        {
            var list = sessions.ToList();
            var (users, orgs) = await NamesAsync(list);
            CallPartyDto Dto(CallParty p) => new(p.Type, p.Id, p.Key, p.Type == CallSession.Organization ? orgs.GetValueOrDefault(p.Id) : users.GetValueOrDefault(p.Id));
            return list.Select(s => new CallDto(s.CallId, s.Media, s.Status, Dto(Caller(s)), Dto(Callee(s)), s.CreatedAt, s.AnsweredAt, s.EndedAt, s.EndedByType, s.EndReason)).ToList();
        }

        public async Task<CallDto?> DescribeAsync(CallSession s) => (await DescribeAsync(new[] { s })).FirstOrDefault();

        // ---------------------------------------------------------------- contacts

        public async Task<List<CallContactDto>> ContactsAsync(CallParty me)
        {
            var result = new List<CallContactDto>();
            CallContactDto Contact(string type, int id, string? name, string? subtitle) => new(type, id, $"{type}:{id}", name ?? "Unknown", subtitle);

            if (me.Type == CallSession.Employee)
            {
                var orgs = await Open().Where(a => a.Employee != null && a.Employee.UserId == me.Id && a.AssignOrgId != null)
                    .Select(a => new { OrgId = a.AssignOrgId!.Value, a.AssignOrg!.OrgName }).Distinct().ToListAsync();
                var home = await _db.Employees.AsNoTracking().Where(e => e.UserId == me.Id && e.OrgId != null).Select(e => e.OrgId!.Value).FirstOrDefaultAsync();
                var scope = orgs.Select(o => o.OrgId).Append(home).Where(i => i > 0).Distinct().ToList();
                result.AddRange(orgs.Select(o => Contact(CallSession.Organization, o.OrgId, o.OrgName, "You work for them now")));
                var managers = await _db.OrganizationManagers.AsNoTracking().Where(m => m.OrgId != null && scope.Contains(m.OrgId.Value) && m.User != null && m.User.IsActive == true)
                    .Select(m => new { m.UserId, m.User!.Name, Org = m.Org!.OrgName }).ToListAsync();
                result.AddRange(managers.GroupBy(m => m.UserId).Select(g => Contact(CallSession.Manager, g.Key!.Value, g.First().Name, $"Manager of {string.Join(", ", g.Select(x => x.Org))}")));
            }
            else if (me.Type == CallSession.Organization)
            {
                var staff = await Open().Where(a => a.AssignOrgId == me.Id && a.Employee != null && a.Employee.User != null && a.Employee.User.IsActive == true)
                    .Select(a => new { a.Employee!.UserId, a.Employee.User!.Name, a.StartDatetime }).ToListAsync();
                result.AddRange(staff.GroupBy(s => s.UserId).Select(g => Contact(CallSession.Employee, g.Key!.Value, g.First().Name, "Working for you now")));
                var managers = await _db.OrganizationManagers.AsNoTracking().Where(m => m.OrgId == me.Id && m.User != null && m.User.IsActive == true).Select(m => new { m.UserId, m.User!.Name }).ToListAsync();
                result.AddRange(managers.Select(m => Contact(CallSession.Manager, m.UserId!.Value, m.Name, "Your manager")));
            }
            else
            {
                var orgs = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == me.Id && m.OrgId != null).Select(m => new { OrgId = m.OrgId!.Value, m.Org!.OrgName }).ToListAsync();
                var ids = orgs.Select(o => o.OrgId).ToList();
                result.AddRange(orgs.Select(o => Contact(CallSession.Organization, o.OrgId, o.OrgName, "Organization you manage")));
                var working = await Open().Where(a => a.AssignOrgId != null && ids.Contains(a.AssignOrgId.Value) && a.Employee != null && a.Employee.User != null && a.Employee.User.IsActive == true)
                    .Select(a => new { a.Employee!.UserId, a.Employee.User!.Name, Org = a.AssignOrg!.OrgName }).ToListAsync();
                result.AddRange(working.GroupBy(w => w.UserId).Select(g => Contact(CallSession.Employee, g.Key!.Value, g.First().Name, $"Working for {g.First().Org}")));
                var home = await _db.Employees.AsNoTracking().Where(e => e.OrgId != null && ids.Contains(e.OrgId.Value) && e.User != null && e.User.IsActive == true)
                    .Select(e => new { e.UserId, e.User!.Name, Org = e.Org!.OrgName }).ToListAsync();
                var have = result.Where(c => c.Type == CallSession.Employee).Select(c => c.Id).ToHashSet();
                result.AddRange(home.Where(h => h.UserId != null && !have.Contains(h.UserId.Value)).Select(h => Contact(CallSession.Employee, h.UserId!.Value, h.Name, $"Belongs to {h.Org}")));
            }
            return result;
        }

        // ---------------------------------------------------------------- the call itself

        /// <summary>Open calls that nobody answered for too long, or that were never ended, are closed here so they never block anyone.</summary>
        public async Task CleanupAsync()
        {
            var ringLimit = DateTime.UtcNow.AddMinutes(-2);
            var activeLimit = DateTime.UtcNow.AddHours(-6);
            var stale = await _db.CallSessions.Where(c => (c.Status == CallSession.Ringing && c.CreatedAt < ringLimit) || (c.Status == CallSession.Active && c.AnsweredAt != null && c.AnsweredAt < activeLimit)).ToListAsync();
            foreach (var call in stale)
            {
                call.Status = call.Status == CallSession.Ringing ? CallSession.Missed : CallSession.Ended;
                call.EndedAt = DateTime.UtcNow;
                call.EndReason = "Closed automatically";
            }
            if (stale.Count > 0) await _db.SaveChangesAsync();
        }

        private Task<bool> BusyAsync(CallParty p) =>
            _db.CallSessions.AnyAsync(c => (c.Status == CallSession.Ringing || c.Status == CallSession.Active)
                                           && ((c.CallerType == p.Type && c.CallerId == p.Id) || (c.CalleeType == p.Type && c.CalleeId == p.Id)));

        public async Task<CallResult> CreateAsync(CallParty caller, string calleeType, int calleeId, string media)
        {
            if (media != "audio" && media != "video") return new CallResult(null, 400, "Choose an audio or a video call.");
            if (calleeType is not (CallSession.Employee or CallSession.Manager or CallSession.Organization)) return new CallResult(null, 400, "Unknown person to call.");
            var callee = new CallParty(calleeType, calleeId);
            if (callee == caller) return new CallResult(null, 400, "You cannot call yourself.");

            await CleanupAsync();
            bool exists = callee.Type == CallSession.Organization
                ? await _db.Organizations.AsNoTracking().AnyAsync(o => o.OrgId == callee.Id && o.Status != "Rejected" && o.Status != "Suspended")
                : await _db.Users.AsNoTracking().AnyAsync(u => u.UserId == callee.Id && u.IsActive == true);
            if (!exists) return new CallResult(null, 404, "This person cannot be called.");
            if (!await LinkedAsync(caller, callee)) return new CallResult(null, 403, "You can only call the people you work with.");
            if (await BusyAsync(caller)) return new CallResult(null, 409, "You are already in a call.");
            if (await BusyAsync(callee)) return new CallResult(null, 409, "This person is busy in another call.");

            var session = new CallSession { CallerType = caller.Type, CallerId = caller.Id, CalleeType = callee.Type, CalleeId = callee.Id, Media = media, Status = CallSession.Ringing, CreatedAt = DateTime.UtcNow };
            _db.CallSessions.Add(session);
            await _db.SaveChangesAsync();
            return new CallResult(session);
        }

        public Task<CallSession?> FindAsync(long callId) => _db.CallSessions.FirstOrDefaultAsync(c => c.CallId == callId);

        public static bool IsParty(CallSession s, CallParty p) => Caller(s) == p || Callee(s) == p;

        public async Task<CallResult> AnswerAsync(long callId, CallParty me, bool accept)
        {
            var s = await FindAsync(callId);
            if (s == null || Callee(s) != me) return new CallResult(null, 404, "Call not found.");
            if (s.Status != CallSession.Ringing) return new CallResult(null, 409, "This call is no longer ringing.");
            if (accept)
            {
                s.Status = CallSession.Active;
                s.AnsweredAt = DateTime.UtcNow;
            }
            else
            {
                s.Status = CallSession.Declined;
                s.EndedAt = DateTime.UtcNow;
                s.EndedByType = me.Type;
                s.EndedById = me.Id;
            }
            await _db.SaveChangesAsync();
            return new CallResult(s);
        }

        /// <summary>Hang up. A ringing call that the caller ends is Cancelled; one that the callee ends is Declined.</summary>
        public async Task<CallResult> EndAsync(long callId, CallParty me)
        {
            var s = await FindAsync(callId);
            if (s == null || !IsParty(s, me)) return new CallResult(null, 404, "Call not found.");
            if (!s.IsOpen) return new CallResult(null, 409, "This call has already ended.");
            s.Status = s.Status == CallSession.Active ? CallSession.Ended : Caller(s) == me ? CallSession.Cancelled : CallSession.Declined;
            s.EndedAt = DateTime.UtcNow;
            s.EndedByType = me.Type;
            s.EndedById = me.Id;
            await _db.SaveChangesAsync();
            return new CallResult(s);
        }

        /// <summary>The organization manager cuts a call of their employee or organization (for example for unethical behaviour). The reason is kept.</summary>
        public async Task<CallResult> CutAsync(long callId, int managerUserId, string reason)
        {
            var s = await FindAsync(callId);
            if (s == null || !await CanMonitorAsync(managerUserId, s)) return new CallResult(null, 404, "Call not found.");
            if (!s.IsOpen) return new CallResult(null, 409, "This call has already ended.");
            s.Status = CallSession.Cut;
            s.EndedAt = DateTime.UtcNow;
            s.EndedByType = CallSession.Manager;
            s.EndedById = managerUserId;
            s.EndReason = reason.Length > 255 ? reason[..255] : reason;
            await _db.SaveChangesAsync();
            return new CallResult(s);
        }

        /// <summary>Nobody picked up in time (called by the chat server).</summary>
        public async Task<CallResult> MissAsync(long callId)
        {
            var s = await FindAsync(callId);
            if (s == null) return new CallResult(null, 404, "Call not found.");
            if (s.Status != CallSession.Ringing) return new CallResult(s);
            s.Status = CallSession.Missed;
            s.EndedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return new CallResult(s);
        }

        public async Task<List<CallDto>> HistoryAsync(CallParty me, int limit = 30)
        {
            var rows = await _db.CallSessions.AsNoTracking()
                .Where(c => (c.CallerType == me.Type && c.CallerId == me.Id) || (c.CalleeType == me.Type && c.CalleeId == me.Id))
                .OrderByDescending(c => c.CallId).Take(Math.Clamp(limit, 1, 100)).ToListAsync();
            return await DescribeAsync(rows);
        }

        /// <summary>The calls a manager may watch: the open ones first, then the latest finished ones.</summary>
        public async Task<(List<CallDto> Live, List<CallDto> Recent)> MonitoredAsync(int managerUserId)
        {
            await CleanupAsync();
            var candidates = await _db.CallSessions.AsNoTracking().OrderByDescending(c => c.CallId).Take(200).ToListAsync();
            var mine = new List<CallSession>();
            foreach (var call in candidates)
            {
                if (Caller(call) == new CallParty(CallSession.Manager, managerUserId) || Callee(call) == new CallParty(CallSession.Manager, managerUserId)) continue;
                if (await CanMonitorAsync(managerUserId, call)) mine.Add(call);
                if (mine.Count >= 60) break;
            }
            var live = await DescribeAsync(mine.Where(c => c.IsOpen));
            var recent = await DescribeAsync(mine.Where(c => !c.IsOpen).Take(25));
            return (live, recent);
        }
    }
}
