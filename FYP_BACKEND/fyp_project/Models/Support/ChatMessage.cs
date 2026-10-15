using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

// Created by FYP_DB/migrations/012_chat.sql
/// <summary>One message in the conversation between an organization and one of its managers.</summary>
[Table("Chat_Message")]
public class ChatMessage
{
    public const string FromManager = "Manager";
    public const string FromOrganization = "Organization";

    [Key, Column("message_id"), DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long MessageId { get; set; }

    [Column("org_id")] public int OrgId { get; set; }
    [Column("manager_user_id")] public int ManagerUserId { get; set; }
    [Column("sender_type"), MaxLength(12)] public string SenderType { get; set; } = FromManager;
    [Column("body"), MaxLength(2000)] public string Body { get; set; } = string.Empty;
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("read_at")] public DateTime? ReadAt { get; set; }
}
