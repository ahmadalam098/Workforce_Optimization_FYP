using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace fyp_project.Controllers.Manager
{
    public class SendChatMessageRequest
    {
        [Required(ErrorMessage = "Write a message."), StringLength(ChatService.MaxBodyLength, ErrorMessage = "A message can have at most 2000 characters.")]
        public string Body { get; set; } = string.Empty;
    }

    /// <summary>
    /// Organization Manager portal: chat with the organizations assigned to the manager. The browser talks to the Node.js chat server
    /// for live delivery; the history, the unread counts and the saving of messages are served here.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/chat")]
    public class ManagerChatController : ControllerBase
    {
        private readonly ChatService _chat;

        public ManagerChatController(ChatService chat)
        {
            _chat = chat;
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

        // GET api/manager/chat/conversations
        [HttpGet("conversations")]
        public async Task<IActionResult> Conversations() => Ok(await _chat.ConversationsAsync(CurrentUserId ?? 0));

        // GET api/manager/chat/conversations/5/messages?before=&limit=30
        [HttpGet("conversations/{orgId:int}/messages")]
        public async Task<IActionResult> Messages(int orgId, long? before, int limit = 30)
        {
            var me = CurrentUserId ?? 0;
            if (!await _chat.IsAssignedAsync(me, orgId)) return StatusCode(403, new { message = "This organization is not assigned to you." });
            return Ok(await _chat.MessagesAsync(me, orgId, before, limit));
        }

        // POST api/manager/chat/conversations/5/messages   { body }
        [HttpPost("conversations/{orgId:int}/messages")]
        public async Task<IActionResult> Send(int orgId, [FromBody] SendChatMessageRequest request)
        {
            var saved = await _chat.SendAsync(CurrentUserId ?? 0, orgId, ChatMessage.FromManager, request.Body);
            return saved == null ? StatusCode(403, new { message = "This organization is not assigned to you." }) : Ok(saved);
        }

        // POST api/manager/chat/conversations/5/read
        [HttpPost("conversations/{orgId:int}/read")]
        public async Task<IActionResult> Read(int orgId)
        {
            var me = CurrentUserId ?? 0;
            if (!await _chat.IsAssignedAsync(me, orgId)) return StatusCode(403, new { message = "This organization is not assigned to you." });
            return Ok(new { marked = await _chat.MarkReadAsync(me, orgId, ChatMessage.FromManager) });
        }
    }
}
