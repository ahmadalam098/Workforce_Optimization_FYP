using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Created by FYP_DB/migrations/020_offers_and_calls.sql
/// <summary>The organization manager forwards a requirement to an employee of the pool; the employee accepts (and is allocated) or declines.</summary>
[Table("Assignment_Offer")]
public class AssignmentOffer
{
    public const string ForRequest = "Request";
    public const string ForMinimum = "Minimum";
    public const string Pending = "Pending";
    public const string Accepted = "Accepted";
    public const string Declined = "Declined";
    public const string Cancelled = "Cancelled";
    public const string Expired = "Expired";
    public const string Failed = "Failed";

    [Key, Column("offer_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public int OfferId { get; set; }
    [Column("kind"), MaxLength(10)] public string Kind { get; set; } = ForRequest;
    [Column("workforce_request_id")] public int? WorkforceRequestId { get; set; }
    [Column("contract_id")] public int? ContractId { get; set; }
    [Column("org_id")] public int OrgId { get; set; }
    [Column("emp_id")] public int EmpId { get; set; }
    [Column("offered_by_user_id")] public int? OfferedByUserId { get; set; }
    [Column("status"), MaxLength(12)] public string Status { get; set; } = Pending;
    [Column("note"), MaxLength(255)] public string? Note { get; set; }
    [Column("allocation_id")] public int? AllocationId { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("responded_at")] public DateTime? RespondedAt { get; set; }
}

/// <summary>One audio or video call between two of {employee, organization, organization manager}.</summary>
[Table("Call_Session")]
public class CallSession
{
    public const string Employee = "Employee";
    public const string Manager = "Manager";
    public const string Organization = "Organization";

    public const string Ringing = "Ringing";
    public const string Active = "Active";
    public const string Declined = "Declined";
    public const string Missed = "Missed";
    public const string Cancelled = "Cancelled";
    public const string Ended = "Ended";
    public const string Cut = "Cut";

    [Key, Column("call_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)] public long CallId { get; set; }
    [Column("caller_type"), MaxLength(12)] public string CallerType { get; set; } = Employee;
    [Column("caller_id")] public int CallerId { get; set; }
    [Column("callee_type"), MaxLength(12)] public string CalleeType { get; set; } = Employee;
    [Column("callee_id")] public int CalleeId { get; set; }
    [Column("media"), MaxLength(5)] public string Media { get; set; } = "audio";
    [Column("status"), MaxLength(12)] public string Status { get; set; } = Ringing;
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("answered_at")] public DateTime? AnsweredAt { get; set; }
    [Column("ended_at")] public DateTime? EndedAt { get; set; }
    [Column("ended_by_type"), MaxLength(12)] public string? EndedByType { get; set; }
    [Column("ended_by_id")] public int? EndedById { get; set; }
    [Column("end_reason"), MaxLength(255)] public string? EndReason { get; set; }

    public bool IsOpen => Status is Ringing or Active;
}
