using fyp_project.Controllers.Admin;
using fyp_project.Controllers.Manager;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>
    /// Organization portal: chat with the manager(s) of the organization. An organization can only talk to the managers the admin linked to it,
    /// and a manager only to the organizations linked to them (ChatService checks both ways). The Node.js chat server carries the live messages.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/chat")]
    public class OrganizationChatController : ControllerBase
    {
        private readonly ChatService _chat;

        public OrganizationChatController(ChatService chat)
        {
            _chat = chat;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private IActionResult NotYourManager() => StatusCode(403, new { message = "This manager is not linked to your organization." });

        // GET api/organization/chat/conversations
        [HttpGet("conversations")]
        public async Task<IActionResult> Conversations() => Ok(await _chat.ConversationsOfOrganizationAsync(OrgId));

        // GET api/organization/chat/conversations/2/messages?before=&limit=30
        [HttpGet("conversations/{managerUserId:int}/messages")]
        public async Task<IActionResult> Messages(int managerUserId, long? before, int limit = 30)
        {
            if (!await _chat.IsAssignedAsync(managerUserId, OrgId)) return NotYourManager();
            return Ok(await _chat.MessagesAsync(managerUserId, OrgId, before, limit));
        }

        // POST api/organization/chat/conversations/2/messages   { body }
        [HttpPost("conversations/{managerUserId:int}/messages")]
        public async Task<IActionResult> Send(int managerUserId, [FromBody] SendChatMessageRequest request)
        {
            var saved = await _chat.SendAsync(managerUserId, OrgId, ChatMessage.FromOrganization, request.Body);
            return saved == null ? NotYourManager() : Ok(saved);
        }

        // POST api/organization/chat/conversations/2/read
        [HttpPost("conversations/{managerUserId:int}/read")]
        public async Task<IActionResult> Read(int managerUserId)
        {
            if (!await _chat.IsAssignedAsync(managerUserId, OrgId)) return NotYourManager();
            return Ok(new { marked = await _chat.MarkReadAsync(managerUserId, OrgId, ChatMessage.FromOrganization) });
        }
    }
}
