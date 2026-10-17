using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    public class EmployeeCreateTicketRequest
    {
        /// <summary>Query or Complaint.</summary>
        [Required, StringLength(30)] public string Category { get; set; } = "Query";

        [Required, StringLength(150), MinTrimmedLength(5)] public string Subject { get; set; } = string.Empty;
        [Required, StringLength(2000), MinTrimmedLength(10)] public string Description { get; set; } = string.Empty;

        /// <summary>Low, Medium or High. The manager can change it when they judge the severity.</summary>
        [StringLength(10)] public string? Priority { get; set; }
    }

    /// <summary>
    /// Employee portal: the employee sends a query or complaint to the manager of the organization they work for, and follows it.
    /// The manager is told in the notification bell and by email; the manager answers it or sends it to the admin.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/tickets")]
    public class EmployeeTicketsController : ControllerBase
    {
        private const string EmployeeSource = "Employee";
        private const int MaxPerDay = 20;
        private static readonly string[] Categories = { "Query", "Complaint" };
        private static readonly string[] Priorities = { "Low", "Medium", "High" };

        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public EmployeeTicketsController(WorkforceManagementDbContext db, AuditService audit, AccountMailer mailer)
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

        private IActionResult FieldError(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        private static string StageOf(Ticket t) =>
            t.Status is "Resolved" or "Closed" ? "Resolved" : t.ForwardedAt != null ? "With the admin" : "With your manager";

        private IQueryable<Ticket> Mine(int me) => _db.Tickets.AsNoTracking().Where(t => t.RaisedByUserId == me && t.Source == EmployeeSource);

        // GET api/employee/tickets?status=Open|Resolved
        [HttpGet]
        public async Task<IActionResult> List(string? status = null)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            var query = Mine(me.Value);
            if (status == "Open") query = query.Where(t => t.Status != "Resolved" && t.Status != "Closed");
            else if (status == "Resolved") query = query.Where(t => t.Status == "Resolved" || t.Status == "Closed");

            var rows = await query.OrderByDescending(t => t.TicketId).Take(200).ToListAsync();
            var orgNames = await _db.Organizations.AsNoTracking().Where(o => rows.Select(r => r.OrgId).Contains(o.OrgId)).ToDictionaryAsync(o => o.OrgId, o => o.OrgName);
            return Ok(rows.Select(t => new
            {
                ticketId = t.TicketId,
                ticketNumber = t.TicketNumber,
                subject = t.Subject,
                category = t.Category,
                priority = t.Priority,
                status = t.Status,
                stage = StageOf(t),
                organization = t.OrgId.HasValue ? orgNames.GetValueOrDefault(t.OrgId.Value) : null,
                createdAt = t.CreatedAt,
                resolvedAt = t.ResolvedAt,
            }));
        }

        // GET api/employee/tickets/5
        [HttpGet("{ticketId:int}")]
        public async Task<IActionResult> Get(int ticketId)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            var t = await Mine(me.Value).FirstOrDefaultAsync(x => x.TicketId == ticketId);
            if (t == null) return NotFound(new { message = "Not found." });

            var org = t.OrgId.HasValue ? await _db.Organizations.AsNoTracking().Where(o => o.OrgId == t.OrgId).Select(o => o.OrgName).FirstOrDefaultAsync() : null;

            // Only the answers meant for the employee (not the internal notes between manager and admin).
            var answers = await _db.TicketMessages.AsNoTracking()
                .Where(m => m.TicketId == ticketId && !m.IsInternal && m.MessageType != "Note")
                .OrderBy(m => m.MessageId)
                .Select(m => new
                {
                    m.MessageType,
                    m.Body,
                    m.CreatedAt,
                    author = _db.Users.Where(u => u.UserId == m.AuthorUserId).Select(u => u.Name).FirstOrDefault(),
                })
                .ToListAsync();

            return Ok(new
            {
                ticketId = t.TicketId,
                ticketNumber = t.TicketNumber,
                subject = t.Subject,
                description = t.Description,
                category = t.Category,
                priority = t.Priority,
                status = t.Status,
                stage = StageOf(t),
                organization = org,
                createdAt = t.CreatedAt,
                resolvedAt = t.ResolvedAt,
                answers,
            });
        }

        // POST api/employee/tickets   { category, subject, description, priority? }
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] EmployeeCreateTicketRequest request)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            var user = await _db.Users.AsNoTracking().Where(u => u.UserId == me && u.IsActive == true).Select(u => new { u.Name }).FirstOrDefaultAsync();
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var category = request.Category.Trim();
            if (!Categories.Contains(category)) return FieldError("category", "Choose Query or Complaint.");
            var priority = string.IsNullOrWhiteSpace(request.Priority) ? "Medium" : request.Priority.Trim();
            if (!Priorities.Contains(priority)) return FieldError("priority", "Choose Low, Medium or High.");

            var employee = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == me);
            if (employee == null) return Conflict(new { message = "Your employee profile is not set up yet. Please ask the admin." });

            // The query belongs to the organization the employee works for now, otherwise their home organization.
            var orgId = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.EmployeeId == employee.EmpId && a.AssignOrgId != null)
                .Select(a => a.AssignOrgId).FirstOrDefaultAsync() ?? employee.OrgId;
            if (orgId == null)
                return Conflict(new { message = "You are not part of an organization yet, so there is no manager to send this to. Please ask the admin." });

            var since = DateTime.UtcNow.AddDays(-1);
            if (await _db.Tickets.CountAsync(t => t.RaisedByUserId == me && t.Source == EmployeeSource && t.CreatedAt >= since) >= MaxPerDay)
                return StatusCode(429, new { message = "You have sent many queries today. Please wait for answers before sending more." });

            var ticket = new Ticket
            {
                Subject = request.Subject.Trim(),
                Description = request.Description.Trim(),
                Category = category,
                Priority = priority,
                Status = AdminTicketsController.Open,
                Source = EmployeeSource,
                OrgId = orgId,
                RaisedByUserId = me,
                CreatedBy = me,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Tickets.Add(ticket);
            await _db.SaveChangesAsync();
            ticket.TicketNumber = $"TCK-{ticket.TicketId:0000}";
            await _db.SaveChangesAsync();

            // The audit entry is what the manager's notification bell shows.
            await _audit.LogAsync(me, "TICKET_CREATED", "Ticket", ticket.TicketId, $"{ticket.TicketNumber} [{priority}] {category} of {user.Name}: {ticket.Subject}");

            // The email must never undo the query: it is already saved.
            try
            {
                await _mailer.SendNewEmployeeQueryAsync(me, ticket.TicketId, ticket.TicketNumber, category, priority, ticket.Subject, ticket.Description, user.Name ?? "An employee", orgId.Value);
            }
            catch (Exception)
            {
                // Ignored on purpose; the manager still sees it in the portal.
            }

            return Ok(new { message = $"Your {category.ToLowerInvariant()} {ticket.TicketNumber} was sent to your manager.", ticketId = ticket.TicketId, ticketNumber = ticket.TicketNumber });
        }
    }
}
