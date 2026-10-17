using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class StartCallRequest
    {
        [Required] public string TargetType { get; set; } = string.Empty;
        [Range(1, int.MaxValue)] public int TargetId { get; set; }
        [Required] public string Media { get; set; } = "audio";
    }

    public class CutCallRequest
    {
        [Required(ErrorMessage = "Give the reason. The people in the call are told."), StringLength(255), MinTrimmedLength(5)] public string Reason { get; set; } = string.Empty;
    }

    /// <summary>
    /// Audio / video calls for the employee, organization and organization manager portals: who can be called, starting, answering and ending a
    /// call, and the call history. The live delivery (ringing, signalling) goes through the chat server (FYP_CHAT), which calls these endpoints
    /// with the user's own cookie, so every rule is decided here.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "CallParticipant")]
    [MissingMigrationFilter]
    [Route("api/calls")]
    public class CallsController : ControllerBase
    {
        private readonly CallService _calls;

        public CallsController(CallService calls)
        {
            _calls = calls;
        }

        private CallParty? Me => CallService.PartyOf(User);

        private IActionResult Fail(CallResult result) => StatusCode(result.Status, new { message = result.Message });

        // GET api/calls/contacts   (the people I may call)
        [HttpGet("contacts")]
        public async Task<IActionResult> Contacts() => Me is { } me ? Ok(await _calls.ContactsAsync(me)) : Unauthorized();

        // GET api/calls/history
        [HttpGet("history")]
        public async Task<IActionResult> History() => Me is { } me ? Ok(await _calls.HistoryAsync(me)) : Unauthorized();

        // POST api/calls   { targetType, targetId, media: audio|video }
        [HttpPost]
        public async Task<IActionResult> Start([FromBody] StartCallRequest request)
        {
            if (Me is not { } me) return Unauthorized();
            var result = await _calls.CreateAsync(me, request.TargetType, request.TargetId, request.Media);
            return result.Ok ? Ok(await _calls.DescribeAsync(result.Session!)) : Fail(result);
        }

        // GET api/calls/5   (a call I am part of)
        [HttpGet("{callId:long}")]
        public async Task<IActionResult> Get(long callId)
        {
            if (Me is not { } me) return Unauthorized();
            var session = await _calls.FindAsync(callId);
            if (session == null || !CallService.IsParty(session, me)) return NotFound(new { message = "Call not found." });
            return Ok(await _calls.DescribeAsync(session));
        }

        // POST api/calls/5/answer?accept=true
        [HttpPost("{callId:long}/answer")]
        public async Task<IActionResult> Answer(long callId, [FromQuery] bool accept = true)
        {
            if (Me is not { } me) return Unauthorized();
            var result = await _calls.AnswerAsync(callId, me, accept);
            return result.Ok ? Ok(await _calls.DescribeAsync(result.Session!)) : Fail(result);
        }

        // POST api/calls/5/end
        [HttpPost("{callId:long}/end")]
        public async Task<IActionResult> End(long callId)
        {
            if (Me is not { } me) return Unauthorized();
            var result = await _calls.EndAsync(callId, me);
            return result.Ok ? Ok(await _calls.DescribeAsync(result.Session!)) : Fail(result);
        }
    }

    /// <summary>Organization Manager portal: watch the calls of the manager's employees and organizations, and cut one (for example for unethical behaviour).</summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/calls")]
    public class ManagerCallsController : ControllerBase
    {
        private readonly CallService _calls;
        private readonly AuditService _audit;
        private readonly WorkforceManagementDbContext _db;

        public ManagerCallsController(CallService calls, AuditService audit, WorkforceManagementDbContext db)
        {
            _calls = calls;
            _audit = audit;
            _db = db;
        }

        private int Me => CallService.PartyOf(User)?.Id ?? 0;

        // GET api/manager/calls/monitor   -> { live: [...], recent: [...] }
        [HttpGet("monitor")]
        public async Task<IActionResult> Monitor()
        {
            var (live, recent) = await _calls.MonitoredAsync(Me);
            return Ok(new { live, recent });
        }

        // POST api/manager/calls/5/cut   { reason }
        [HttpPost("{callId:long}/cut")]
        public async Task<IActionResult> Cut(long callId, [FromBody] CutCallRequest request)
        {
            var reason = request.Reason.Trim();
            var result = await _calls.CutAsync(callId, Me, reason);
            if (!result.Ok) return StatusCode(result.Status, new { message = result.Message });

            var dto = await _calls.DescribeAsync(result.Session!);
            await _audit.LogAsync(Me, "CALL_CUT", "Call", callId, $"Call between {dto!.Caller.Name} and {dto.Callee.Name} was cut by the organization manager: {reason}");
            // The employee is told on their bell too.
            foreach (var party in new[] { dto.Caller, dto.Callee }.Where(p => p.Type == CallSession.Employee))
            {
                var empId = await _db.Employees.AsNoTracking().Where(e => e.UserId == party.Id).Select(e => (int?)e.EmpId).FirstOrDefaultAsync();
                if (empId != null) await _audit.LogAsync(Me, "CALL_CUT_BY_MANAGER", "Employee", empId, $"Your call was ended by the organization manager: {reason}");
            }
            return Ok(dto);
        }
    }

    /// <summary>Used only by the Node.js chat server (shared key, like the internal chat): the call rang for too long.</summary>
    [ApiController]
    [AllowAnonymous]
    [MissingMigrationFilter]
    [Route("api/internal/calls")]
    public class InternalCallsController : ControllerBase
    {
        private readonly CallService _calls;
        private readonly IConfiguration _config;

        public InternalCallsController(CallService calls, IConfiguration config)
        {
            _calls = calls;
            _config = config;
        }

        // POST api/internal/calls/5/missed
        [HttpPost("{callId:long}/missed")]
        public async Task<IActionResult> Missed(long callId)
        {
            var expected = _config["Chat:ServiceKey"];
            if (string.IsNullOrWhiteSpace(expected)) return NotFound();
            var sent = Request.Headers["X-Chat-Key"].ToString();
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(sent), Encoding.UTF8.GetBytes(expected))) return StatusCode(401, new { message = "Invalid chat service key." });

            var result = await _calls.MissAsync(callId);
            return result.Ok ? Ok(await _calls.DescribeAsync(result.Session!)) : StatusCode(result.Status, new { message = result.Message });
        }
    }
}
