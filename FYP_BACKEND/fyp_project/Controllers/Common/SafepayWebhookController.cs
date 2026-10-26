using System.Text.Json;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace fyp_project.Controllers.Common
{
    /// <summary>
    /// Safepay's server calls this when a payment succeeds or fails (set it in the Safepay dashboard: Developer > Endpoints, for example
    /// https://YOUR-NGROK-ADDRESS/api/gateway/safepay/webhook). It is not reachable through https redirection on purpose (see Program.cs).
    ///
    /// The webhook is only a nudge: when "Safepay:WebhookSecret" is set the X-SFPY-SIGNATURE must match, and in every case the payment is applied only
    /// after our server asks Safepay itself for the tracker's state (with the secret key). A forged call can therefore never mark an invoice paid.
    /// </summary>
    [ApiController]
    [AllowAnonymous]
    [MissingMigrationFilter]
    [Route("api/gateway/safepay")]
    public class SafepayWebhookController : ControllerBase
    {
        private readonly OnlinePaymentService _online;
        private readonly SafepayOptions _options;
        private readonly ILogger<SafepayWebhookController> _log;

        public SafepayWebhookController(OnlinePaymentService online, IOptions<SafepayOptions> options, ILogger<SafepayWebhookController> log)
        {
            _online = online;
            _options = options.Value;
            _log = log;
        }

        // POST api/gateway/safepay/webhook   (Safepay -> us)
        [HttpPost("webhook")]
        public async Task<IActionResult> Webhook()
        {
            using var buffer = new MemoryStream();
            await Request.Body.CopyToAsync(buffer);
            var body = buffer.ToArray();

            if (!string.IsNullOrWhiteSpace(_options.WebhookSecret) && !SafepayClient.SignatureMatches(body, Request.Headers["X-SFPY-SIGNATURE"], _options.WebhookSecret))
            {
                _log.LogWarning("Safepay webhook refused: the signature does not match.");
                return Unauthorized(new { message = "Bad signature." });
            }

            string? tracker = null;
            string? type = null;
            try
            {
                var root = JsonDocument.Parse(body).RootElement;
                type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
                // version 2.0.0: data.tracker; the old format: data.notification.tracker / notification.tracker
                if (root.TryGetProperty("data", out var data))
                {
                    if (data.TryGetProperty("tracker", out var tr) && tr.ValueKind == JsonValueKind.String) tracker = tr.GetString();
                    else if (data.TryGetProperty("notification", out var n) && n.TryGetProperty("tracker", out var nt)) tracker = nt.GetString();
                }
                if (tracker == null && root.TryGetProperty("notification", out var note) && note.TryGetProperty("tracker", out var nt2)) tracker = nt2.GetString();
            }
            catch (JsonException)
            {
                return BadRequest(new { message = "Not JSON." });
            }

            if (string.IsNullOrEmpty(tracker)) return Ok(new { message = "Ignored (no tracker)." });
            var online = await _online.FindByReferenceAsync("Safepay", tracker);
            // 200 even for an unknown tracker: Safepay retries anything else for days, and a payment of another system is not ours to fix.
            if (online == null) return Ok(new { message = "Ignored (not one of our checkouts)." });

            var (outcome, _) = await _online.RefreshAsync(online);
            _log.LogInformation("Safepay webhook {Type} for {Tracker}: checkout {Token} is now {Outcome}.", type, tracker, online.Token, outcome);
            return Ok(new { message = "Received.", outcome });
        }
    }
}
