using System.Security.Cryptography;
using System.Text;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>
    /// Used only by the Node.js chat server, never by a browser: it carries the messages that the ORGANIZATION side sends.
    /// Every call must send the shared secret from appsettings (Chat:ServiceKey) in the X-Chat-Key header; without a configured key the
    /// endpoints answer 404. (The organization side has no login yet; the chat server decides who the organization is.)
    /// </summary>
    [ApiController]
    [AllowAnonymous]
    [MissingMigrationFilter]
    [Route("api/internal/chat")]
    public class InternalChatController : ControllerBase
    {
        private readonly ChatService _chat;
        private readonly WorkforceManagementDbContext _db;
        private readonly IConfiguration _config;

        public InternalChatController(ChatService chat, WorkforceManagementDbContext db, IConfiguration config)
        {
            _chat = chat;
            _db = db;
            _config = config;
        }

        private bool KeyIsValid()
        {
            var expected = _config["Chat:ServiceKey"];
            if (string.IsNullOrWhiteSpace(expected)) return false;
            var sent = Request.Headers["X-Chat-Key"].ToString();
            return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(sent), Encoding.UTF8.GetBytes(expected));
        }

        private IActionResult? Guard()
        {
            if (string.IsNullOrWhiteSpace(_config["Chat:ServiceKey"])) return NotFound();
            return KeyIsValid() ? null : StatusCode(401, new { message = "Invalid chat service key." });
        }

        // GET api/internal/chat/organizations   (the organizations that have a manager, with their managers - for the chat test page)
        [HttpGet("organizations")]
        public async Task<IActionResult> Organizations()
        {
            if (Guard() is { } denied) return denied;
            var rows = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.Org != null && m.User != null && m.User.IsActive == true)
                .Select(m => new { organizationId = m.OrgId!.Value, name = m.Org!.OrgName, managerUserId = m.UserId!.Value, managerName = m.User!.Name })
                .OrderBy(r => r.name)
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/internal/chat/organizations/5/managers/2/messages?before=&limit=30
        [HttpGet("organizations/{orgId:int}/managers/{managerUserId:int}/messages")]
        public async Task<IActionResult> Messages(int orgId, int managerUserId, long? before, int limit = 30)
        {
            if (Guard() is { } denied) return denied;
            if (!await _chat.IsAssignedAsync(managerUserId, orgId)) return StatusCode(403, new { message = "This manager is not assigned to the organization." });
            return Ok(await _chat.MessagesAsync(managerUserId, orgId, before, limit));
        }

        // POST api/internal/chat/organizations/5/managers/2/messages   { body }   (a message FROM the organization)
        [HttpPost("organizations/{orgId:int}/managers/{managerUserId:int}/messages")]
        public async Task<IActionResult> Send(int orgId, int managerUserId, [FromBody] SendChatMessageRequest request)
        {
            if (Guard() is { } denied) return denied;
            var saved = await _chat.SendAsync(managerUserId, orgId, ChatMessage.FromOrganization, request.Body);
            return saved == null ? StatusCode(403, new { message = "This manager is not assigned to the organization." }) : Ok(saved);
        }

        // POST api/internal/chat/organizations/5/managers/2/read   (the organization opened the conversation)
        [HttpPost("organizations/{orgId:int}/managers/{managerUserId:int}/read")]
        public async Task<IActionResult> Read(int orgId, int managerUserId)
        {
            if (Guard() is { } denied) return denied;
            if (!await _chat.IsAssignedAsync(managerUserId, orgId)) return StatusCode(403, new { message = "This manager is not assigned to the organization." });
            return Ok(new { marked = await _chat.MarkReadAsync(managerUserId, orgId, ChatMessage.FromOrganization) });
        }
    }
}
