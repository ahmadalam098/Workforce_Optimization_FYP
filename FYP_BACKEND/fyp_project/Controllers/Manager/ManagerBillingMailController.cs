using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>Organization Manager portal: remind an organization about an invoice that is not paid yet.</summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/billing/invoices")]
    public class ManagerBillingMailController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly BillingMailService _mail;

        public ManagerBillingMailController(WorkforceManagementDbContext db, BillingMailService mail)
        {
            _db = db;
            _mail = mail;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // POST api/manager/billing/invoices/5/reminder
        [HttpPost("{invoiceId:int}/reminder")]
        public async Task<IActionResult> Reminder(int invoiceId)
        {
            var orgs = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == Me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceId == invoiceId && orgs.Contains(i.OrgId));
            if (invoice == null) return NotFound(new { message = "Invoice not found." });
            var (ok, message) = await _mail.InvoiceAsync(invoice, Me, true);
            return ok ? Ok(new { message }) : Conflict(new { message });
        }
    }
}
