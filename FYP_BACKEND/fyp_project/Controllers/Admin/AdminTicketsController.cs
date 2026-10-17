using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: queries from organizations. An admin can look at a query and resolve it with a comment;
    /// the organization and its managers are emailed the comment. (Queries are raised by the organization side.)
    /// Old tickets that are InProgress count as open, and Closed ones as resolved.
    /// </summary>
    [Route("api/admin/tickets")]
    public class AdminTicketsController : AdminControllerBase
    {
        public const string Open = "Open";
        public const string Resolved = "Resolved";

        public static readonly string[] Priorities = { "Low", "Medium", "High", "Critical" };
        public static readonly string[] Categories = { "Query", "Complaint", "Payment", "Technical", "Allocation", "Other" };

        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminTicketsController(WorkforceManagementDbContext db, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _audit = audit;
            _mailer = mailer;
        }

        // GET api/admin/tickets?search=&status=Open|Resolved&organizationId=&forwarded=true&source=Employee|Organization&category=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, string? status, int? organizationId, bool? forwarded, string? source, string? category, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Tickets.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(t =>
                    (t.TicketNumber != null && t.TicketNumber.Contains(term)) ||
                    t.Subject.Contains(term) ||
                    (t.Org != null && t.Org.OrgName != null && t.Org.OrgName.Contains(term)));
            }

            if (string.Equals(status, Open, StringComparison.OrdinalIgnoreCase))
                query = query.Where(t => t.Status != "Resolved" && t.Status != "Closed");
            else if (string.Equals(status, Resolved, StringComparison.OrdinalIgnoreCase))
                query = query.Where(t => t.Status == "Resolved" || t.Status == "Closed");

            if (organizationId.HasValue) query = query.Where(t => t.OrgId == organizationId.Value);
            if (forwarded == true) query = query.Where(t => t.ForwardedAt != null);
            // Employee = a query an employee asked; Organization = from an organization (also when its manager logged it for it).
            if (string.Equals(source, "Employee", StringComparison.OrdinalIgnoreCase)) query = query.Where(t => t.Source == "Employee");
            else if (string.Equals(source, "Organization", StringComparison.OrdinalIgnoreCase)) query = query.Where(t => t.Source != "Employee");
            if (!string.IsNullOrWhiteSpace(category) && Categories.Contains(category)) query = query.Where(t => t.Category == category);

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(t => t.Status == "Resolved" || t.Status == "Closed" ? 1 : 0)
                .ThenByDescending(t => t.ForwardedAt != null)
                .ThenBy(t => t.Priority == "Critical" ? 0 : t.Priority == "High" ? 1 : t.Priority == "Medium" ? 2 : 3)
                .ThenByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(t => new TicketListItemDto
                {
                    TicketId = t.TicketId,
                    TicketNumber = t.TicketNumber,
                    Subject = t.Subject,
                    Category = t.Category,
                    Priority = t.Priority,
                    Status = t.Status == "Closed" ? Resolved : t.Status == "Resolved" ? Resolved : Open,
                    Source = t.Source,
                    OrgId = t.OrgId,
                    OrgName = t.Org != null ? t.Org.OrgName : null,
                    RaisedBy = _db.Users.Where(u => u.UserId == t.RaisedByUserId).Select(u => u.Name).FirstOrDefault(),
                    CreatedAt = t.CreatedAt,
                    ResolvedAt = t.ResolvedAt,
                    ForwardedAt = t.ForwardedAt,
                    ForwardedBy = _db.Users.Where(u => u.UserId == t.ForwardedBy).Select(u => u.Name).FirstOrDefault(),
                    ForwardNote = t.ForwardNote,
                })
                .ToListAsync();

            return Ok(new PagedResult<TicketListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // GET api/admin/tickets/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var resolvedCount = await _db.Tickets.CountAsync(t => t.Status == "Resolved" || t.Status == "Closed");
            var openCount = await _db.Tickets.CountAsync(t => t.Status != "Resolved" && t.Status != "Closed");

            var since = DateTime.UtcNow.AddDays(-90);
            var resolved = await _db.Tickets.AsNoTracking()
                .Where(t => t.ResolvedAt != null && t.ResolvedAt >= since)
                .Select(t => new { t.CreatedAt, ResolvedAt = t.ResolvedAt!.Value })
                .ToListAsync();

            return Ok(new TicketSummaryDto
            {
                Open = openCount,
                Resolved = resolvedCount,
                AverageResolutionHours = resolved.Count == 0 ? 0 : Math.Round(resolved.Average(t => (t.ResolvedAt - t.CreatedAt).TotalHours), 1),
            });
        }

        // GET api/admin/tickets/5
        [HttpGet("{ticketId:int}")]
        public async Task<IActionResult> Get(int ticketId)
        {
            var ticket = await _db.Tickets.AsNoTracking().Include(t => t.Org).FirstOrDefaultAsync(t => t.TicketId == ticketId);
            if (ticket == null) return NotFoundMessage("Query not found.");

            // Only what the sender said and how it was resolved; internal notes of older tickets stay hidden.
            var messages = await _db.TicketMessages.AsNoTracking()
                .Where(m => m.TicketId == ticketId && !m.IsInternal)
                .OrderBy(m => m.CreatedAt).ThenBy(m => m.MessageId)
                .ToListAsync();

            var userIds = messages.Where(m => m.AuthorUserId.HasValue).Select(m => m.AuthorUserId!.Value)
                .Concat(new[] { ticket.RaisedByUserId, ticket.ForwardedBy }.Where(id => id.HasValue).Select(id => id!.Value))
                .Distinct().ToList();
            var names = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);

            string? Name(int? id) => id.HasValue ? names.GetValueOrDefault(id.Value) : null;

            return Ok(new TicketDetailDto
            {
                TicketId = ticket.TicketId,
                TicketNumber = ticket.TicketNumber,
                Subject = ticket.Subject,
                Description = ticket.Description,
                Category = ticket.Category,
                Priority = ticket.Priority,
                Status = ticket.Status is "Resolved" or "Closed" ? Resolved : Open,
                Source = ticket.Source,
                OrgId = ticket.OrgId,
                OrgName = ticket.Org?.OrgName,
                RaisedBy = Name(ticket.RaisedByUserId),
                CreatedAt = ticket.CreatedAt,
                ResolvedAt = ticket.ResolvedAt,
                ForwardedAt = ticket.ForwardedAt,
                ForwardedBy = ticket.ForwardedBy.HasValue ? Name(ticket.ForwardedBy) : null,
                ForwardNote = ticket.ForwardNote,
                Messages = messages.Select(m => new TicketMessageDto
                {
                    MessageId = m.MessageId, MessageType = m.MessageType, Body = m.Body,
                    Author = Name(m.AuthorUserId), CreatedAt = m.CreatedAt,
                }).ToList(),
            });
        }

        // POST api/admin/tickets   (logs a query for an organization; used for testing until the organization side exists)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateTicketRequest request)
        {
            var priority = string.IsNullOrWhiteSpace(request.Priority) ? "Medium" : request.Priority.Trim();
            var category = string.IsNullOrWhiteSpace(request.Category) ? "Query" : request.Category.Trim();
            if (!Priorities.Contains(priority)) return FieldError("priority", "Priority must be Low, Medium, High or Critical.");
            if (!Categories.Contains(category)) return FieldError("category", "Unknown category.");

            if (!await _db.Organizations.AnyAsync(o => o.OrgId == request.OrganizationId))
                return FieldError("organizationId", "Select an organization that exists.");

            var ticket = new Ticket
            {
                Subject = request.Subject.Trim(),
                Description = request.Description.Trim(),
                Category = category,
                Priority = priority,
                Status = Open,
                Source = "Organization",
                OrgId = request.OrganizationId,
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Tickets.Add(ticket);
            await _db.SaveChangesAsync();

            ticket.TicketNumber = $"TCK-{ticket.TicketId:0000}";
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "TICKET_CREATED", "Ticket", ticket.TicketId, $"{ticket.TicketNumber} [{priority}] {ticket.Subject}");
            return Ok(new { message = $"Query {ticket.TicketNumber} added.", ticketId = ticket.TicketId, ticketNumber = ticket.TicketNumber });
        }

        // POST api/admin/tickets/5/resolve   { comment }
        [HttpPost("{ticketId:int}/resolve")]
        public async Task<IActionResult> Resolve(int ticketId, [FromBody] ResolveTicketRequest request)
        {
            var comment = ContractLogic.Clean(request.Comment);
            if (comment == null || comment.Length < 5) return FieldError("comment", "Write how the query was resolved (at least 5 characters). The organization will receive it by email.");

            var ticket = await _db.Tickets.Include(t => t.Org).FirstOrDefaultAsync(t => t.TicketId == ticketId);
            if (ticket == null) return NotFoundMessage("Query not found.");
            if (ticket.Status is "Resolved" or "Closed") return ConflictMessage("This query is already resolved.");

            var now = DateTime.UtcNow;
            ticket.Status = Resolved;
            ticket.ResolvedAt = now;
            ticket.ClosedAt = null;
            ticket.UpdatedAt = now;
            ticket.AssignedToUserId = CurrentUserId;

            _db.TicketMessages.Add(new TicketMessage
            {
                TicketId = ticketId,
                AuthorUserId = CurrentUserId,
                MessageType = "Resolution",
                Body = comment,
                IsInternal = false,
                CreatedAt = now,
            });
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "TICKET_RESOLVED", "Ticket", ticketId, $"{ticket.TicketNumber}: {comment}");

            var resolver = await _db.Users.AsNoTracking().Where(u => u.UserId == CurrentUserId).Select(u => u.Name).FirstOrDefaultAsync();
            var emailNote = await _mailer.SendQueryResolvedAsync(CurrentUserId, ticket.TicketId, ticket.TicketNumber ?? $"#{ticket.TicketId}", ticket.Subject, ticket.OrgId, comment, resolver, now, ticket.Source == "Employee" ? ticket.RaisedByUserId : null);

            return Ok(new { message = "Query resolved." + emailNote, ticketId, status = Resolved });
        }
    }
}
