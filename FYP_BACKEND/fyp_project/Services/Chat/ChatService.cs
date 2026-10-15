using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public record ChatMessageDto(long MessageId, int OrgId, int ManagerUserId, string SenderType, string Body, DateTime CreatedAt, DateTime? ReadAt);

    /// <summary>
    /// The chat between an organization and its manager. This service decides who may talk (a manager only with the organizations
    /// the admin assigned) and saves every message; the Node.js chat server (FYP_CHAT) only carries the messages in real time.
    /// </summary>
    public class ChatService
    {
        public const int MaxBodyLength = 2000;

        private readonly WorkforceManagementDbContext _db;

        public ChatService(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private static ChatMessageDto ToDto(ChatMessage m) => new(m.MessageId, m.OrgId, m.ManagerUserId, m.SenderType, m.Body, m.CreatedAt, m.ReadAt);

        public Task<bool> IsAssignedAsync(int managerUserId, int orgId) =>
            _db.OrganizationManagers.AsNoTracking().AnyAsync(m => m.UserId == managerUserId && m.OrgId == orgId);

        /// <summary>The organizations assigned to the manager, each with the latest message and how many of the organization's messages are unread.</summary>
        public async Task<List<object>> ConversationsAsync(int managerUserId)
        {
            var orgs = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == managerUserId && m.Org != null)
                .Select(m => new { OrgId = m.OrgId!.Value, m.Org!.OrgName, m.Org.Status })
                .Distinct()
                .ToListAsync();
            var orgIds = orgs.Select(o => o.OrgId).ToList();

            var unread = (await _db.ChatMessages.AsNoTracking()
                .Where(m => m.ManagerUserId == managerUserId && orgIds.Contains(m.OrgId) && m.SenderType == ChatMessage.FromOrganization && m.ReadAt == null)
                .GroupBy(m => m.OrgId).Select(g => new { OrgId = g.Key, Count = g.Count() }).ToListAsync())
                .ToDictionary(x => x.OrgId, x => x.Count);

            var lastIds = await _db.ChatMessages.AsNoTracking()
                .Where(m => m.ManagerUserId == managerUserId && orgIds.Contains(m.OrgId))
                .GroupBy(m => m.OrgId).Select(g => g.Max(m => m.MessageId)).ToListAsync();
            var last = (await _db.ChatMessages.AsNoTracking().Where(m => lastIds.Contains(m.MessageId)).ToListAsync()).ToDictionary(m => m.OrgId);

            return orgs
                .Select(o => new
                {
                    organizationId = o.OrgId,
                    name = o.OrgName,
                    status = o.Status,
                    unread = unread.GetValueOrDefault(o.OrgId),
                    lastMessage = last.TryGetValue(o.OrgId, out var m) ? ToDto(m) : null,
                })
                .OrderByDescending(c => c.lastMessage?.CreatedAt ?? DateTime.MinValue)
                .ThenBy(c => c.name)
                .Cast<object>()
                .ToList();
        }

        /// <summary>A page of the conversation, oldest first. <paramref name="beforeId"/> loads the messages older than that one.</summary>
        public async Task<List<ChatMessageDto>> MessagesAsync(int managerUserId, int orgId, long? beforeId, int limit)
        {
            limit = Math.Clamp(limit, 1, 100);
            var query = _db.ChatMessages.AsNoTracking().Where(m => m.ManagerUserId == managerUserId && m.OrgId == orgId);
            if (beforeId.HasValue) query = query.Where(m => m.MessageId < beforeId.Value);
            var page = await query.OrderByDescending(m => m.MessageId).Take(limit).ToListAsync();
            page.Reverse();
            return page.Select(ToDto).ToList();
        }

        /// <summary>Saves a message. Returns null when the manager is not assigned to the organization.</summary>
        public async Task<ChatMessageDto?> SendAsync(int managerUserId, int orgId, string senderType, string body)
        {
            if (!await IsAssignedAsync(managerUserId, orgId)) return null;

            var message = new ChatMessage
            {
                OrgId = orgId,
                ManagerUserId = managerUserId,
                SenderType = senderType,
                Body = body.Trim(),
                CreatedAt = DateTime.UtcNow,
            };
            _db.ChatMessages.Add(message);
            await _db.SaveChangesAsync();
            return ToDto(message);
        }

        /// <summary>Marks the messages sent by the other side as read. <paramref name="readerType"/> is who opened the conversation. Returns how many changed.</summary>
        public async Task<int> MarkReadAsync(int managerUserId, int orgId, string readerType)
        {
            var otherSide = readerType == ChatMessage.FromManager ? ChatMessage.FromOrganization : ChatMessage.FromManager;
            var now = DateTime.UtcNow;
            return await _db.ChatMessages
                .Where(m => m.ManagerUserId == managerUserId && m.OrgId == orgId && m.SenderType == otherSide && m.ReadAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadAt, now));
        }
    }
}
