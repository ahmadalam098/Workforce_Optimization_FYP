using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Tables below are created by FYP_DB/migrations/007_requests_settings.sql

[Table("Workforce_Request_Review")]
public class WorkforceRequestReview
{
    [Key, Column("review_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ReviewId { get; set; }

    [Column("workforce_request_id")] public int WorkforceRequestId { get; set; }
    [Column("decision"), MaxLength(20)] public string Decision { get; set; } = string.Empty;
    [Column("note"), MaxLength(500)] public string? Note { get; set; }
    [Column("reviewed_by")] public int? ReviewedBy { get; set; }
    [Column("reviewed_at")] public DateTime ReviewedAt { get; set; }
}

[Table("System_Setting")]
public class SystemSetting
{
    [Key, Column("setting_key"), MaxLength(60)] public string Key { get; set; } = string.Empty;
    [Column("setting_value"), MaxLength(200)] public string Value { get; set; } = string.Empty;
    [Column("updated_by")] public int? UpdatedBy { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}

[Table("Workforce_Request_Skill")]
public class WorkforceRequestSkill
{
    [Key, Column("workforce_request_id"), DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int WorkforceRequestId { get; set; }

    [Column("skill_master_id")] public int SkillId { get; set; }
}


// Created by FYP_DB/migrations/009_notifications.sql
[Table("Notification_State")]
public class NotificationState
{
    [Key, Column("user_id"), DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int UserId { get; set; }

    [Column("last_read_audit_id")] public int LastReadAuditId { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}
