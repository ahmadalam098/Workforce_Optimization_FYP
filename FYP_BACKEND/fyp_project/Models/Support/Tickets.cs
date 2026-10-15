using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/006_tickets.sql

[Table("Ticket")]
public class Ticket
{
    [Key, Column("ticket_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int TicketId { get; set; }

    [Column("ticket_number"), MaxLength(20)] public string? TicketNumber { get; set; }
    [Column("subject"), MaxLength(150)] public string Subject { get; set; } = string.Empty;
    [Column("description"), MaxLength(2000)] public string Description { get; set; } = string.Empty;
    [Column("category"), MaxLength(30)] public string Category { get; set; } = "Query";
    [Column("priority"), MaxLength(10)] public string Priority { get; set; } = "Medium";
    [Column("status"), MaxLength(20)] public string Status { get; set; } = "Open";
    [Column("source"), MaxLength(20)] public string Source { get; set; } = "Organization";
    [Column("org_id")] public int? OrgId { get; set; }
    [Column("raised_by_user_id")] public int? RaisedByUserId { get; set; }
    [Column("assigned_to_user_id")] public int? AssignedToUserId { get; set; }
    [Column("created_by")] public int? CreatedBy { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("updated_at")] public DateTime? UpdatedAt { get; set; }
    [Column("resolved_at")] public DateTime? ResolvedAt { get; set; }
    [Column("closed_at")] public DateTime? ClosedAt { get; set; }
    [Column("source_complaint_id")] public int? SourceComplaintId { get; set; }
    /// <summary>Set when the organization's manager sent this ticket to the admin (migration 013).</summary>
    [Column("forwarded_at")] public DateTime? ForwardedAt { get; set; }
    [Column("forwarded_by")] public int? ForwardedBy { get; set; }
    [Column("forward_note"), MaxLength(500)] public string? ForwardNote { get; set; }

    [ForeignKey(nameof(OrgId))] public Organization? Org { get; set; }
}

[Table("Ticket_Message")]
public class TicketMessage
{
    [Key, Column("message_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int MessageId { get; set; }

    [Column("ticket_id")] public int TicketId { get; set; }
    [Column("author_user_id")] public int? AuthorUserId { get; set; }
    [Column("message_type"), MaxLength(20)] public string MessageType { get; set; } = "Response";
    [Column("body"), MaxLength(2000)] public string Body { get; set; } = string.Empty;
    [Column("is_internal")] public bool IsInternal { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}
