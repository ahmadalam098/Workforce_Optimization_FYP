using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: every online payment the organizations started (Safepay or demo) - who paid, which invoice, how much, the gateway's reference
    /// and how it ended - plus "Check with the gateway" for one that is still open (when the webhook could not reach us).
    /// </summary>
    [Route("api/admin/online-payments")]
    public class AdminOnlinePaymentsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly OnlinePaymentService _online;

        public AdminOnlinePaymentsController(WorkforceManagementDbContext db, OnlinePaymentService online)
        {
            _db = db;
            _online = online;
        }

        // GET api/admin/online-payments?status=&organizationId=
        //   -> { gateway, demo, items: [...], received: [{ currency, amount, count }] }
        [HttpGet]
        public async Task<IActionResult> List(string? status, int? organizationId)
        {
            await _online.ExpireAsync();
            var query = from o in _db.OnlinePayments.AsNoTracking()
                        join i in _db.Invoices.AsNoTracking() on o.InvoiceId equals i.InvoiceId
                        join g in _db.Organizations.AsNoTracking() on o.OrgId equals g.OrgId
                        select new { o, i.InvoiceNumber, g.OrgName };
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.o.Status == status);
            if (organizationId != null) query = query.Where(x => x.o.OrgId == organizationId);

            var rows = await query.OrderByDescending(x => x.o.OnlinePaymentId).Take(200).ToListAsync();
            var received = await _db.OnlinePayments.AsNoTracking().Where(o => o.Status == OnlinePayment.Paid)
                .GroupBy(o => o.Currency).Select(g => new { currency = g.Key, amount = g.Sum(o => o.Amount), count = g.Count() }).ToListAsync();

            return Ok(new
            {
                gateway = _online.Gateway.Name,
                demo = _online.Gateway.IsDemo,
                received,
                items = rows.Select(x => new
                {
                    onlinePaymentId = x.o.OnlinePaymentId,
                    token = x.o.Token,
                    provider = x.o.Provider,
                    organizationId = x.o.OrgId,
                    organization = x.OrgName,
                    invoiceId = x.o.InvoiceId,
                    invoiceNumber = x.InvoiceNumber,
                    amount = x.o.Amount,
                    currency = x.o.Currency,
                    status = x.o.Status,
                    gatewayReference = x.o.GatewayReference,
                    failureReason = x.o.FailureReason,
                    createdAt = x.o.CreatedAt,
                    completedAt = x.o.CompletedAt,
                    paymentId = x.o.PaymentId,
                }),
            });
        }

        // POST api/admin/online-payments/{token}/check   (asks the gateway now and applies its answer)
        [HttpPost("{token}/check")]
        public async Task<IActionResult> Check(string token)
        {
            var online = await _db.OnlinePayments.FirstOrDefaultAsync(o => o.Token == token);
            if (online == null) return NotFound(new { message = "Online payment not found." });
            var (outcome, detail) = await _online.RefreshAsync(online);
            var message = outcome switch
            {
                GatewayStatus.Paid => "Paid: the payment is recorded on the invoice.",
                GatewayStatus.Pending => $"Not paid yet at the gateway{(detail != null ? $" ({detail})" : "")}.",
                GatewayStatus.Unknown => $"The gateway could not be reached: {detail}",
                _ => $"{char.ToUpper(outcome[0])}{outcome[1..]}{(detail != null ? $": {detail}" : ".")}",
            };
            return Ok(new { message, outcome });
        }
    }
}
