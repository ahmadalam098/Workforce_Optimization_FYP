using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Table is created by FYP_DB/migrations/001_audit_log.sql
[Table("Audit_Log")]
public class AuditLog
{
    [Key]
    [Column("audit_id")]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int AuditId { get; set; }

    [Column("actor_user_id")]
    public int? ActorUserId { get; set; }

    [Column("actor_name")]
    [MaxLength(100)]
    public string? ActorName { get; set; }

    [Column("action")]
    [MaxLength(100)]
    public string Action { get; set; } = string.Empty;

    [Column("entity_type")]
    [MaxLength(100)]
    public string? EntityType { get; set; }

    [Column("entity_id")]
    [MaxLength(50)]
    public string? EntityId { get; set; }

    [Column("details")]
    [MaxLength(1000)]
    public string? Details { get; set; }

    [Column("ip_address")]
    [MaxLength(50)]
    public string? IpAddress { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
