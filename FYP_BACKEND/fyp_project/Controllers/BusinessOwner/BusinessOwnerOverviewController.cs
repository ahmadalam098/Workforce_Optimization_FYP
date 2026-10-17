using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.BusinessOwnerPortal
{
    /// <summary>
    /// Business Owner portal: the signed-in owner. Owners never register themselves: the admin creates the account (Admin &gt; Team &gt; Business
    /// Owners) and tells them their credentials; they sign in on the same login page, and "forgot password" works exactly as for the other roles
    /// (OTP by email, kept in Redis). For now this only answers "who am I", so the dashboard can show that the sign-in works.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "BusinessOwnerOnly")]
    [MissingMigrationFilter]
    [Route("api/business-owner")]
    public class BusinessOwnerOverviewController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public BusinessOwnerOverviewController(WorkforceManagementDbContext db)
        {
            _db = db;
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

        // GET api/business-owner/overview
        [HttpGet("overview")]
        public async Task<IActionResult> Overview()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            // Optional: before migration 014 there is simply no sign-in time to show.
            var login = await SafeQuery.IfSchemaMissing(() => _db.UserLogins.AsNoTracking().FirstOrDefaultAsync(l => l.UserId == me), null);

            return Ok(new
            {
                userId = user.UserId,
                fullName = user.Name,
                email = user.Email,
                phone = user.PhoneNo,
                roleName = user.Role?.RoleType ?? string.Empty,
                signedInAt = login?.LastLoginAt,
                previousSignInAt = login?.PreviousLoginAt,
            });
        }
    }
}
