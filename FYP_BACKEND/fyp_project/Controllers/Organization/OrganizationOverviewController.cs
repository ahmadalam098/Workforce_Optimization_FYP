using fyp_project.Controllers.Admin;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>Organization portal: the signed-in organization. For now only "who am I", so the dashboard can show that the sign-in works.</summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization")]
    public class OrganizationOverviewController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public OrganizationOverviewController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        /// <summary>The organization id inside the token (the NameIdentifier is "org-{id}" so it can never be mistaken for a user id).</summary>
        public static int? OrganizationIdOf(System.Security.Claims.ClaimsPrincipal user) =>
            int.TryParse(user.FindFirst("org_id")?.Value, out var id) ? id : null;

        // GET api/organization/overview
        [HttpGet("overview")]
        public async Task<IActionResult> Overview()
        {
            var id = OrganizationIdOf(User);
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == id);
            if (org == null || string.Equals(org.Status, "Rejected", StringComparison.OrdinalIgnoreCase) || string.Equals(org.Status, "Suspended", StringComparison.OrdinalIgnoreCase))
                return Unauthorized(new { message = "This organization can no longer sign in." });

            return Ok(new
            {
                organizationId = org.OrgId,
                name = org.OrgName,
                email = org.Email,
                phone = org.Phone,
                country = org.Country,
                address = org.Address,
                status = org.Status,
                registeredAt = org.CreatedAt,
                approvedAt = org.ApprovedAt,
            });
        }
    }
}
