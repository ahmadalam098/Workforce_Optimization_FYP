using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Created by FYP_DB/migrations/017_employee_reviews.sql
/// <summary>A warning for an employee, given by the organization manager (for a bad review) or by the admin.</summary>
[Table("Employee_Warning")]
public class EmployeeWarning
{
    [Key, Column("warning_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int WarningId { get; set; }
    [Column("emp_id")] public int EmpId { get; set; }
    [Column("review_id")] public int? ReviewId { get; set; }
    [Column("issued_by_user_id")] public int? IssuedByUserId { get; set; }
    [Column("issued_by_role"), MaxLength(20)] public string IssuedByRole { get; set; } = "Manager";
    [Column("message"), MaxLength(500)] public string Message { get; set; } = string.Empty;
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

/// <summary>The manager's request to the admin to take action about an employee because of a review. The admin decides.</summary>
[Table("Review_Escalation")]
public class ReviewEscalation
{
    public const string Pending = "Pending";
    public const string Decided = "Decided";

    [Key, Column("escalation_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int EscalationId { get; set; }
    [Column("review_id")] public int ReviewId { get; set; }
    [Column("emp_id")] public int EmpId { get; set; }
    [Column("requested_by_user_id")] public int? RequestedByUserId { get; set; }
    [Column("note"), MaxLength(500)] public string Note { get; set; } = string.Empty;
    [Column("status"), MaxLength(20)] public string Status { get; set; } = Pending;
    [Column("admin_action"), MaxLength(20)] public string? AdminAction { get; set; }
    [Column("admin_response"), MaxLength(500)] public string? AdminResponse { get; set; }
    [Column("decided_by_user_id")] public int? DecidedByUserId { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("decided_at")] public DateTime? DecidedAt { get; set; }
}

// Created by FYP_DB/migrations/018_organization_notifications.sql
/// <summary>How far an organization has read its notification bell (the bell is built from the audit log).</summary>
[Table("Organization_Notification_State")]
public class OrganizationNotificationState
{
    [Key, Column("org_id"), DatabaseGenerated(DatabaseGeneratedOption.None)] public int OrgId { get; set; }
    [Column("last_read_audit_id")] public int LastReadAuditId { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}

// Created by FYP_DB/migrations/019_organization_settings.sql
/// <summary>An organization's own Settings: what it wants in its bell, and when it signed in.</summary>
[Table("Organization_Settings")]
public class OrganizationSettings
{
    [Key, Column("org_id"), DatabaseGenerated(DatabaseGeneratedOption.None)] public int OrgId { get; set; }
    [Column("in_app")] public bool InApp { get; set; } = true;
    [Column("notify_contracts")] public bool Contracts { get; set; } = true;
    [Column("notify_requests")] public bool Requests { get; set; } = true;
    [Column("notify_employees")] public bool Employees { get; set; } = true;
    [Column("notify_invoices")] public bool Invoices { get; set; } = true;
    [Column("notify_chat")] public bool Chat { get; set; } = true;
    [Column("notify_expiry")] public bool Expiry { get; set; } = true;
    [Column("expiry_days")] public int? ExpiryDays { get; set; }
    [Column("last_login_at")] public DateTime? LastLoginAt { get; set; }
    [Column("previous_login_at")] public DateTime? PreviousLoginAt { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
}
