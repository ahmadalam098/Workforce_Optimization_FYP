using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.BusinessOwnerPortal
{
    public class UpdateOwnerProfileRequest
    {
        [Required, StringLength(100), PersonName]
        public string FullName { get; set; } = string.Empty;

        [StringLength(20), PhoneNumber]
        public string? Phone { get; set; }
    }

    public class ChangeOwnerPasswordRequest
    {
        [Required, StringLength(100)]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required, StringLength(100)]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class OwnerNotificationPrefRequest
    {
        public bool InApp { get; set; } = true;
    }

    /// <summary>
    /// Business Owner portal: Settings. The owner changes their own name, phone and picture; the email and the role are fixed (the admin owns
    /// them) and shown read only. Also the password, the sign-in times and the notification bell on / off.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "BusinessOwnerOnly")]
    [MissingMigrationFilter]
    [Route("api/business-owner/settings")]
    public class BusinessOwnerSettingsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public BusinessOwnerSettingsController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
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

        private IActionResult FieldError(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        // GET api/business-owner/settings/profile
        [HttpGet("profile")]
        public async Task<IActionResult> Profile()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            return Ok(new
            {
                userId = user.UserId,
                fullName = user.Name,
                email = user.Email,
                phone = user.PhoneNo,
                roleName = user.Role?.RoleType ?? string.Empty,
                createdAt = user.CreatedAt,
            });
        }

        // PUT api/business-owner/settings/profile   { fullName, phone }
        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateOwnerProfileRequest request)
        {
            var user = await _db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == CurrentUserId && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            user.Name = request.FullName.Trim();
            user.PhoneNo = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            await _db.SaveChangesAsync();
            await _audit.LogAsync(user.UserId, "USER_UPDATED", "User", user.UserId, $"{user.Name} updated their own profile");

            return Ok(new
            {
                message = "Your profile was saved.",
                user = new { userId = user.UserId, fullName = user.Name, email = user.Email, roleName = user.Role?.RoleType ?? string.Empty },
            });
        }

        // POST api/business-owner/settings/password   { currentPassword, newPassword }
        [HttpPost("password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeOwnerPasswordRequest request)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == CurrentUserId && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            bool correct;
            try { correct = !string.IsNullOrEmpty(user.Password) && BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.Password); }
            catch (Exception) { correct = false; }
            if (!correct) return FieldError("currentPassword", "The current password is not correct.");

            if (PasswordPolicy.Problem(request.NewPassword) is { } problem) return FieldError("newPassword", problem);
            if (request.NewPassword == request.CurrentPassword) return FieldError("newPassword", "The new password must be different from the current one.");

            user.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _db.SaveChangesAsync();
            await _audit.LogAsync(user.UserId, "PASSWORD_CHANGED", "User", user.UserId, $"{user.Name} changed their own password");
            return Ok(new { message = "Your password was changed." });
        }

        // GET api/business-owner/settings/security
        [HttpGet("security")]
        public async Task<IActionResult> Security()
        {
            var me = CurrentUserId;
            // Optional data: before migration 014 there is simply nothing to show.
            var login = await SafeQuery.IfSchemaMissing(() => _db.UserLogins.AsNoTracking().FirstOrDefaultAsync(l => l.UserId == me), null);
            return Ok(new { signedInAt = login?.LastLoginAt, previousSignInAt = login?.PreviousLoginAt });
        }

        // GET api/business-owner/settings/notifications
        [HttpGet("notifications")]
        public async Task<IActionResult> GetNotifications()
        {
            var me = CurrentUserId;
            var pref = await SafeQuery.IfSchemaMissing(() => _db.ManagerNotificationPrefs.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == me), null);
            return Ok(new
            {
                inApp = pref?.InApp ?? true,
                systemInAppEnabled = await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp),
            });
        }

        // PUT api/business-owner/settings/notifications   { inApp }
        [HttpPut("notifications")]
        public async Task<IActionResult> SaveNotifications([FromBody] OwnerNotificationPrefRequest request)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            // The table (Manager_Notification_Pref, migration 014) holds one row per person; an owner only uses the bell on / off.
            var pref = await _db.ManagerNotificationPrefs.FirstOrDefaultAsync(p => p.UserId == me);
            if (pref == null)
            {
                pref = new ManagerNotificationPref { UserId = me.Value };
                _db.ManagerNotificationPrefs.Add(pref);
            }
            pref.InApp = request.InApp;
            pref.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(new { message = request.InApp ? "The notification bell is on." : "The notification bell is off." });
        }
    }
}
