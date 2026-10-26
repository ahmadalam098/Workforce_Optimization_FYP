using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    public class StartOnlinePaymentRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "Choose the invoice you want to pay.")] public int InvoiceId { get; set; }

        /// <summary>Not used any more: an invoice is always paid in full online (kept so older pages still work).</summary>
        [Range(0.01, 1000000000)] public decimal? Amount { get; set; }
    }

    /// <summary>Organization portal: pay an invoice online. Start a checkout here, pay at the gateway's page, and the receipt appears when the gateway confirms.</summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/payments/online")]
    public class OrganizationOnlinePaymentsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly OnlinePaymentService _online;

        public OrganizationOnlinePaymentsController(WorkforceManagementDbContext db, OnlinePaymentService online)
        {
            _db = db;
            _online = online;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        // GET api/organization/payments/online/options
        [HttpGet("options")]
        public async Task<IActionResult> Options() => Ok(new { enabled = await _online.EnabledAsync(), gateway = _online.Gateway.Name, demo = _online.Gateway.IsDemo });

        // POST api/organization/payments/online   { invoiceId, amount? }
        [HttpPost]
        public async Task<IActionResult> Start([FromBody] StartOnlinePaymentRequest request)
        {
            var result = await _online.StartAsync(OrgId, request.InvoiceId, request.Amount);
            if (!result.Ok)
                return result.Field != null
                    ? BadRequest(new { message = result.Message, errors = new Dictionary<string, string[]> { [result.Field] = new[] { result.Message! } } })
                    : StatusCode(result.Status, new { message = result.Message });
            return Ok(new { message = "Opening the payment page...", token = result.Token, checkoutPath = result.CheckoutPath });
        }

        // GET api/organization/payments/online/5e0c...   (the state of one of my checkouts, for the page after the gateway sends me back)
        [HttpGet("{token}")]
        public async Task<IActionResult> Get(string token)
        {
            var online = await _online.FindAsync(token);
            if (online == null || online.OrgId != OrgId) return NotFound(new { message = "Payment not found." });
            return Ok(await _online.CheckoutAsync(token));
        }

        // POST api/organization/payments/online/5e0c.../confirm?cancelled=false
        // The organization came back from the gateway's page: ask the gateway (never the browser) how it ended, then show the result.
        [HttpPost("{token}/confirm")]
        public async Task<IActionResult> Confirm(string token, bool cancelled = false)
        {
            var online = await _db.OnlinePayments.FirstOrDefaultAsync(o => o.Token == token && o.OrgId == OrgId);
            if (online == null) return NotFound(new { message = "Payment not found." });
            var (outcome, detail) = await _online.RefreshAsync(online, cancelled);
            return Ok(new { outcome, detail, checkout = await _online.CheckoutAsync(token) });
        }

        // GET api/organization/payments/online
        [HttpGet]
        public async Task<IActionResult> List()
        {
            await _online.ExpireAsync();
            var rows = await (from o in _db.OnlinePayments.AsNoTracking()
                              join i in _db.Invoices.AsNoTracking() on o.InvoiceId equals i.InvoiceId
                              where o.OrgId == OrgId
                              orderby o.OnlinePaymentId descending
                              select new { o.OnlinePaymentId, o.Token, invoiceId = o.InvoiceId, invoiceNumber = i.InvoiceNumber, o.Amount, o.Currency, o.Status, o.FailureReason, o.CreatedAt, o.CompletedAt, o.PaymentId }).Take(50).ToListAsync();
            return Ok(rows);
        }
    }

    /// <summary>
    /// The demo payment gateway's own side: the fake checkout page asks what to show and reports what the person pressed (Pay / Fail / Cancel). It
    /// plays the part of the gateway's webhook. The secret token is the only key; it exists only while the demo gateway is the configured one.
    /// A real gateway has its own signed webhook instead and this controller answers 404.
    /// </summary>
    [ApiController]
    [AllowAnonymous]
    [MissingMigrationFilter]
    [Route("api/gateway/demo")]
    public class DemoGatewayController : ControllerBase
    {
        private readonly OnlinePaymentService _online;

        public DemoGatewayController(OnlinePaymentService online)
        {
            _online = online;
        }

        // GET api/gateway/demo/5e0c...
        [HttpGet("{token}")]
        public async Task<IActionResult> Checkout(string token)
        {
            if (!_online.Gateway.IsDemo) return NotFound();
            var checkout = await _online.CheckoutAsync(token);
            return checkout == null ? NotFound(new { message = "This payment page does not exist." }) : Ok(checkout);
        }

        // POST api/gateway/demo/5e0c.../pay | fail | cancel
        [HttpPost("{token}/{outcome}")]
        public async Task<IActionResult> Result(string token, string outcome)
        {
            if (!_online.Gateway.IsDemo) return NotFound();
            var mapped = outcome switch { "pay" => "paid", "fail" => "failed", "cancel" => "cancelled", _ => null };
            if (mapped == null) return BadRequest(new { message = "Unknown result." });
            var (status, message) = await _online.CompleteAsync(token, mapped);
            var checkout = await _online.CheckoutAsync(token);
            return StatusCode(status, new { message, checkout });
        }
    }
}
