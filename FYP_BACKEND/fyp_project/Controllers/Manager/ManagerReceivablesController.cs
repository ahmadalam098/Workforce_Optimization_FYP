using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>Organization Manager portal: what the manager's organizations still owe, by how late it is (the same report the admin has, for their organizations only).</summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/billing/receivables")]
    public class ManagerReceivablesController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly ReportService _reports;

        public ManagerReceivablesController(WorkforceManagementDbContext db, ReportService reports)
        {
            _db = db;
            _reports = reports;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // GET api/manager/billing/receivables?asOf=
        [HttpGet]
        public async Task<IActionResult> Get(DateOnly? asOf)
        {
            var orgs = await _db.OrganizationManagers.AsNoTracking().Where(m => m.UserId == Me && m.OrgId != null).Select(m => m.OrgId!.Value).ToListAsync();
            return Ok(await _reports.ReceivablesAsync(asOf ?? Money.Today, orgs));
        }
    }
}
