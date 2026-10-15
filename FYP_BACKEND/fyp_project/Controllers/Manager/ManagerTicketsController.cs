using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class ManagerCreateTicketRequest
    {
        /// <summary>The organization it is about. Not needed (and ignored) when <see cref="EmployeeId"/> is given.</summary>
        public int OrganizationId { get; set; }

        /// <summary>Set to log a query of an employee who works for one of the manager's organizations.</summary>
        public int? EmployeeId { get; set; }

        /// <summary>Query or Complaint.</summary>
        [Required, StringLength(30)] public string Category { get; set; } = "Query";

        [Required, StringLength(150), MinTrimmedLength(5)] public string Subject { get; set; } = string.Empty;
        [Required, StringLength(2000), MinTrimmedLength(10)] public string Description { get; set; } = string.Empty;
        [StringLength(10)] public string? Priority { get; set; }

        /// <summary>Send it to the admin straight away.</summary>
        public bool SendToAdmin { get; set; }
        [StringLength(500)] public string? Note { get; set; }
    }

    public class ForwardTicketRequest
    {
        [StringLength(500)] public string? Note { get; set; }

        /// <summary>How severe the manager judges it (Low, Medium, High, Critical). Left out = unchanged.</summary>
        [StringLength(10)] public string? Priority { get; set; }
    }

    public class ManagerResolveTicketRequest
    {
        [Required(ErrorMessage = "Write the answer."), StringLength(2000), MinTrimmedLength(5)] public string Comment { get; set; } = string.Empty;
    }

    /// <summary>
    /// Organization Manager portal: the queries and complaints of the manager's organizations and of the employees who work for them.
    /// The manager answers (resolves) an employee's query when it is not severe; a severe one (High or Critical) is sent to the admin,
    /// and so is anything else that needs the admin. The admin sees what was sent marked "forwarded" and is notified through the bell.
    /// The manager can also log a query or complaint that an organization or an employee told them about.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/tickets")]
    public class ManagerTicketsController : ControllerBase
    {
        private static readonly string[] Categories = { "Query", "Complaint" };
        public const string EmployeeSource = "Employee";

        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public ManagerTicketsController(WorkforceManagementDbContext db, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _audit = audit;
            _mailer = mailer;
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                            ?? User.FindFirst("nameid")?.Value
                            ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.OrgId != null)
                .Select(m => m.OrgId!.Value)
                .ToListAsync();
        }

        private static bool IsResolved(string status) => status is "Resolved" or "Closed";

        /// <summary>High and Critical are severe: only the admin resolves those.</summary>
        private static bool IsSevere(string priority) => priority is "High" or "Critical";

        private static bool CanResolve(Ticket t) => !IsResolved(t.Status) && t.Source == EmployeeSource && !IsSevere(t.Priority) && t.ForwardedAt == null;

        /// <summary>
        /// What belongs to the manager: the queries and complaints of the organizations, and every query of an employee who works for them.
        /// Other categories raised by an organization (payment, technical ...) stay with the admin.
        /// </summary>
        private IQueryable<Ticket> Mine(List<int> orgIds) =>
            _db.Tickets.AsNoTracking().Where(t => t.OrgId != null && orgIds.Contains(t.OrgId.Value) && (Categories.Contains(t.Category) || t.Source == EmployeeSource));

        /// <summary>The organization an employee is in: where they work now (open allocation), otherwise their home organization.</summary>
        private IQueryable<Employee> EmployeesOf(List<int> orgIds)
        {
            var open = _db.EmployeeAllocations.Where(AllocationLogic.IsOpen);
            return _db.Employees.AsNoTracking().Where(e => e.User!.IsActive == true &&
                (open.Any(a => a.EmployeeId == e.EmpId && a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value)) ||
                 (e.OrgId != null && orgIds.Contains(e.OrgId.Value) && !open.Any(a => a.EmployeeId == e.EmpId))));
        }

        // GET api/manager/tickets/employees   (the employees a query can be logged for)
        [HttpGet("employees")]
        public async Task<IActionResult> Employees()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var rows = await EmployeesOf(orgIds).OrderBy(e => e.User!.Name)
                .Select(e => new
                {
                    employeeId = e.EmpId,
                    fullName = e.User!.Name,
                    orgId = _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Where(a => a.EmployeeId == e.EmpId).Select(a => a.AssignOrgId).FirstOrDefault() ?? e.OrgId,
                })
                .ToListAsync();
            var names = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);
            return Ok(rows.Select(r => new { r.employeeId, r.fullName, r.orgId, orgName = r.orgId.HasValue ? names.GetValueOrDefault(r.orgId.Value) : null }));
        }

        // GET api/manager/tickets/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var rows = await Mine(orgIds).Select(t => new { t.Category, t.Status, t.Source, t.Priority, t.ForwardedAt }).ToListAsync();
            var open = rows.Where(r => !IsResolved(r.Status)).ToList();
            return Ok(new
            {
                openQueries = open.Count(r => r.Source != EmployeeSource && r.Category == "Query"),
                openComplaints = open.Count(r => r.Source != EmployeeSource && r.Category == "Complaint"),
                openEmployeeQueries = open.Count(r => r.Source == EmployeeSource),
                severeToSend = open.Count(r => IsSevere(r.Priority) && r.ForwardedAt == null),
                notSentToAdmin = open.Count(r => r.ForwardedAt == null),
                sentToAdmin = open.Count(r => r.ForwardedAt != null),
                resolved = rows.Count(r => IsResolved(r.Status)),
            });
        }

        // GET api/manager/tickets?search=&category=&source=Employee|Organization&status=Open|Resolved&organizationId=&forwarded=&severe=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? category, string? source, string? status, int? organizationId, bool? forwarded, bool? severe, int page = 1, int pageSize = 10)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 50);
            var orgIds = await MyOrganizationIdsAsync();
            if (organizationId.HasValue && !orgIds.Contains(organizationId.Value))
                return StatusCode(403, new { message = "You can only see the organizations you manage." });

            var query = Mine(orgIds);
            if (organizationId.HasValue) query = query.Where(t => t.OrgId == organizationId.Value);
            if (Categories.Contains(category)) query = query.Where(t => t.Category == category);
            if (string.Equals(source, EmployeeSource, StringComparison.OrdinalIgnoreCase)) query = query.Where(t => t.Source == EmployeeSource);
            else if (string.Equals(source, "Organization", StringComparison.OrdinalIgnoreCase)) query = query.Where(t => t.Source != EmployeeSource);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(t => (t.TicketNumber != null && t.TicketNumber.Contains(term)) || t.Subject.Contains(term) || (t.Org != null && t.Org.OrgName != null && t.Org.OrgName.Contains(term)));
            }
            if (string.Equals(status, "Open", StringComparison.OrdinalIgnoreCase)) query = query.Where(t => t.Status != "Resolved" && t.Status != "Closed");
            else if (string.Equals(status, "Resolved", StringComparison.OrdinalIgnoreCase)) query = query.Where(t => t.Status == "Resolved" || t.Status == "Closed");
            if (forwarded.HasValue) query = forwarded.Value ? query.Where(t => t.ForwardedAt != null) : query.Where(t => t.ForwardedAt == null);
            if (severe == true) query = query.Where(t => t.Priority == "High" || t.Priority == "Critical");

            var total = await query.CountAsync();
            var rows = await query
                .OrderBy(t => t.Status == "Resolved" || t.Status == "Closed" ? 1 : 0)
                .ThenBy(t => t.Priority == "Critical" ? 0 : t.Priority == "High" ? 1 : t.Priority == "Medium" ? 2 : 3)
                .ThenByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(t => new
                {
                    ticket = t,
                    orgName = t.Org != null ? t.Org.OrgName : null,
                    raisedBy = _db.Users.Where(u => u.UserId == t.RaisedByUserId).Select(u => u.Name).FirstOrDefault(),
                    forwardedBy = _db.Users.Where(u => u.UserId == t.ForwardedBy).Select(u => u.Name).FirstOrDefault(),
                })
                .ToListAsync();

            var items = rows.Select(r => new
            {
                ticketId = r.ticket.TicketId,
                ticketNumber = r.ticket.TicketNumber,
                subject = r.ticket.Subject,
                category = r.ticket.Category,
                priority = r.ticket.Priority,
                isSevere = IsSevere(r.ticket.Priority),
                status = IsResolved(r.ticket.Status) ? "Resolved" : "Open",
                source = r.ticket.Source == EmployeeSource ? EmployeeSource : "Organization",
                orgId = r.ticket.OrgId,
                r.orgName,
                raisedBy = r.ticket.Source == EmployeeSource ? r.raisedBy : null,
                createdAt = r.ticket.CreatedAt,
                resolvedAt = r.ticket.ResolvedAt,
                forwardedAt = r.ticket.ForwardedAt,
                r.forwardedBy,
                canResolve = CanResolve(r.ticket),
                canForward = !IsResolved(r.ticket.Status) && r.ticket.ForwardedAt == null,
            }).ToList();

            return Ok(new { items, total, page, pageSize });
        }

        // GET api/manager/tickets/5
        [HttpGet("{ticketId:int}")]
        public async Task<IActionResult> Get(int ticketId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var ticket = await Mine(orgIds).Include(t => t.Org).FirstOrDefaultAsync(t => t.TicketId == ticketId);
            if (ticket == null) return NotFound(new { message = "Not found." });

            var messages = await _db.TicketMessages.AsNoTracking()
                .Where(m => m.TicketId == ticketId && !m.IsInternal)
                .OrderBy(m => m.CreatedAt).ThenBy(m => m.MessageId)
                .Select(m => new { m.MessageId, m.MessageType, m.Body, m.CreatedAt, author = _db.Users.Where(u => u.UserId == m.AuthorUserId).Select(u => u.Name).FirstOrDefault() })
                .ToListAsync();
            var forwardedBy = ticket.ForwardedBy == null ? null : await _db.Users.AsNoTracking().Where(u => u.UserId == ticket.ForwardedBy).Select(u => u.Name).FirstOrDefaultAsync();
            var raisedBy = ticket.RaisedByUserId == null ? null : await _db.Users.AsNoTracking().Where(u => u.UserId == ticket.RaisedByUserId).Select(u => u.Name).FirstOrDefaultAsync();
            var resolved = IsResolved(ticket.Status);

            return Ok(new
            {
                ticketId = ticket.TicketId,
                ticketNumber = ticket.TicketNumber,
                subject = ticket.Subject,
                description = ticket.Description,
                category = ticket.Category,
                priority = ticket.Priority,
                isSevere = IsSevere(ticket.Priority),
                status = resolved ? "Resolved" : "Open",
                source = ticket.Source == EmployeeSource ? EmployeeSource : "Organization",
                orgId = ticket.OrgId,
                orgName = ticket.Org?.OrgName,
                raisedBy,
                createdAt = ticket.CreatedAt,
                resolvedAt = ticket.ResolvedAt,
                canResolve = CanResolve(ticket),
                canForward = !resolved && ticket.ForwardedAt == null,
                forwardedAt = ticket.ForwardedAt,
                forwardedBy,
                forwardNote = ticket.ForwardNote,
                messages,
            });
        }

        private IActionResult? PriorityProblem(string? priority) =>
            !string.IsNullOrWhiteSpace(priority) && !AdminTicketsController.Priorities.Contains(priority.Trim())
                ? BadRequest(new { message = "Priority must be Low, Medium, High or Critical.", errors = new Dictionary<string, string[]> { ["priority"] = new[] { "Priority must be Low, Medium, High or Critical." } } })
                : null;

        private async Task<IActionResult> ForwardAsync(Ticket ticket, string? note, string? priority)
        {
            var severityChange = string.Empty;
            if (!string.IsNullOrWhiteSpace(priority) && priority.Trim() != ticket.Priority)
            {
                severityChange = $" Severity changed from {ticket.Priority} to {priority.Trim()}.";
                ticket.Priority = priority.Trim();
            }

            ticket.ForwardedAt = DateTime.UtcNow;
            ticket.ForwardedBy = CurrentUserId;
            ticket.ForwardNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
            ticket.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            var org = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == ticket.OrgId).Select(o => o.OrgName).FirstOrDefaultAsync();
            var from = ticket.Source == EmployeeSource ? "an employee query" : ticket.Category.ToLowerInvariant();
            await _audit.LogAsync(CurrentUserId, "TICKET_FORWARDED", "Ticket", ticket.TicketId,
                $"{ticket.TicketNumber} ({from}, {ticket.Priority}) of {org} was sent to the admin by the organization manager: {ticket.Subject}{severityChange}" + (ticket.ForwardNote != null ? $" - Note: {ticket.ForwardNote}" : string.Empty));
            return Ok(new { message = $"{ticket.TicketNumber} was sent to the admin.", ticketId = ticket.TicketId });
        }

        // POST api/manager/tickets/5/forward   { note?, priority? }
        [HttpPost("{ticketId:int}/forward")]
        public async Task<IActionResult> Forward(int ticketId, [FromBody] ForwardTicketRequest request)
        {
            if (PriorityProblem(request.Priority) is { } bad) return bad;
            var orgIds = await MyOrganizationIdsAsync();
            var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.TicketId == ticketId && t.OrgId != null && orgIds.Contains(t.OrgId.Value) && (Categories.Contains(t.Category) || t.Source == EmployeeSource));
            if (ticket == null) return NotFound(new { message = "Not found." });
            if (IsResolved(ticket.Status)) return Conflict(new { message = "This one is already resolved." });
            if (ticket.ForwardedAt != null) return Conflict(new { message = "This was already sent to the admin." });
            return await ForwardAsync(ticket, request.Note, request.Priority);
        }

        // POST api/manager/tickets/5/resolve   { comment }   (an employee's query that is not severe)
        [HttpPost("{ticketId:int}/resolve")]
        public async Task<IActionResult> Resolve(int ticketId, [FromBody] ManagerResolveTicketRequest request)
        {
            var comment = ContractLogic.Clean(request.Comment);
            if (comment == null || comment.Length < 5) return BadRequest(new { message = "Write the answer (at least 5 characters).", errors = new Dictionary<string, string[]> { ["comment"] = new[] { "Write the answer (at least 5 characters)." } } });

            var orgIds = await MyOrganizationIdsAsync();
            var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.TicketId == ticketId && t.OrgId != null && orgIds.Contains(t.OrgId.Value) && t.Source == EmployeeSource);
            if (ticket == null) return NotFound(new { message = "Not found." });
            if (IsResolved(ticket.Status)) return Conflict(new { message = "This query is already resolved." });
            if (ticket.ForwardedAt != null) return Conflict(new { message = "This was sent to the admin, who will answer it." });
            if (IsSevere(ticket.Priority)) return Conflict(new { message = $"This query is {ticket.Priority.ToLowerInvariant()} severity. Send it to the admin; only the admin resolves severe queries." });

            var now = DateTime.UtcNow;
            ticket.Status = AdminTicketsController.Resolved;
            ticket.ResolvedAt = now;
            ticket.UpdatedAt = now;
            ticket.AssignedToUserId = CurrentUserId;
            _db.TicketMessages.Add(new TicketMessage { TicketId = ticketId, AuthorUserId = CurrentUserId, MessageType = "Resolution", Body = comment, IsInternal = false, CreatedAt = now });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "TICKET_RESOLVED", "Ticket", ticketId, $"{ticket.TicketNumber} resolved by the organization manager: {comment}");

            var emailNote = string.Empty;
            if (ticket.RaisedByUserId.HasValue)
            {
                var manager = await _db.Users.AsNoTracking().Where(u => u.UserId == CurrentUserId).Select(u => u.Name).FirstOrDefaultAsync();
                emailNote = await _mailer.SendEmployeeQueryResolvedAsync(CurrentUserId, ticketId, ticket.TicketNumber ?? $"#{ticketId}", ticket.Subject, ticket.RaisedByUserId.Value, comment, manager, now);
            }
            return Ok(new { message = "Query resolved." + emailNote, ticketId, status = AdminTicketsController.Resolved });
        }

        // POST api/manager/tickets   (log a query or complaint of one of my organizations, or of one of my employees)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] ManagerCreateTicketRequest request)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var category = request.Category.Trim();
            if (!Categories.Contains(category)) return BadRequest(new { message = "Choose Query or Complaint.", errors = new Dictionary<string, string[]> { ["category"] = new[] { "Choose Query or Complaint." } } });
            if (PriorityProblem(request.Priority) is { } bad) return bad;
            var priority = string.IsNullOrWhiteSpace(request.Priority) ? "Medium" : request.Priority.Trim();

            int orgId;
            int? employeeUserId = null;
            var source = "Manager";
            if (request.EmployeeId.HasValue)
            {
                var employee = await EmployeesOf(orgIds).Where(e => e.EmpId == request.EmployeeId.Value)
                    .Select(e => new { e.UserId, OrgId = _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Where(a => a.EmployeeId == e.EmpId).Select(a => a.AssignOrgId).FirstOrDefault() ?? e.OrgId })
                    .FirstOrDefaultAsync();
                if (employee?.OrgId == null) return StatusCode(403, new { message = "This employee does not work for one of your organizations." });
                orgId = employee.OrgId.Value;
                employeeUserId = employee.UserId;
                source = EmployeeSource;
            }
            else
            {
                if (!orgIds.Contains(request.OrganizationId)) return StatusCode(403, new { message = "You can only log it for an organization you manage." });
                orgId = request.OrganizationId;
            }

            var ticket = new Ticket
            {
                Subject = request.Subject.Trim(),
                Description = request.Description.Trim(),
                Category = category,
                Priority = priority,
                Status = AdminTicketsController.Open,
                Source = source,
                OrgId = orgId,
                RaisedByUserId = employeeUserId ?? CurrentUserId,
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Tickets.Add(ticket);
            await _db.SaveChangesAsync();
            ticket.TicketNumber = $"TCK-{ticket.TicketId:0000}";
            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "TICKET_CREATED", "Ticket", ticket.TicketId, $"{ticket.TicketNumber} [{priority}] {category}{(employeeUserId != null ? " of an employee" : string.Empty)} logged by the organization manager: {ticket.Subject}");

            if (request.SendToAdmin) return await ForwardAsync(ticket, request.Note, null);
            return Ok(new { message = $"{ticket.TicketNumber} was added.", ticketId = ticket.TicketId });
        }
    }
}
