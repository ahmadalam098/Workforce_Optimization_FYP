using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    public class UpdateManagerProfileRequest
    {
        [Required, StringLength(100), PersonName]
        public string FullName { get; set; } = string.Empty;

        [StringLength(20), PhoneNumber]
        public string? Phone { get; set; }
    }

    public class ChangeManagerPasswordRequest
    {
        [Required, StringLength(100)]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required, StringLength(100)]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class ManagerNotificationPrefRequest
    {
        public bool InApp { get; set; } = true;
        public bool Requests { get; set; } = true;
        public bool Queries { get; set; } = true;
        public bool Invoices { get; set; } = true;
        public bool Employees { get; set; } = true;
        public bool Chat { get; set; } = true;
        public bool Expiry { get; set; } = true;

        /// <summary>Days before a contract ends to warn; null = use the system setting chosen by the admin.</summary>
        [Range(1, 365)]
        public int? ExpiryDays { get; set; }
    }

    /// <summary>
    /// Organization Manager portal: Settings. Their own profile (name, phone; the email is fixed and organizations are set by the admin),
    /// security (password, last sign-in) and what they want in their notification bell.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager/settings")]
    public class ManagerSettingsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public ManagerSettingsController(WorkforceManagementDbContext db, AuditService audit)
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

        // GET api/manager/settings/profile
        [HttpGet("profile")]
        public async Task<IActionResult> Profile()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var organizations = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.OrgId != null)
                .Select(m => new { organizationId = m.OrgId!.Value, name = m.Org!.OrgName, status = m.Org.Status })
                .OrderBy(o => o.name).ToListAsync();

            return Ok(new
            {
                userId = user.UserId,
                fullName = user.Name,
                email = user.Email,
                phone = user.PhoneNo,
                roleName = user.Role?.RoleType ?? string.Empty,
                organizations,
            });
        }

        // PUT api/manager/settings/profile   { fullName, phone }
        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateManagerProfileRequest request)
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

        // POST api/manager/settings/password   { currentPassword, newPassword }
        [HttpPost("password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeManagerPasswordRequest request)
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

        // GET api/manager/settings/security
        [HttpGet("security")]
        public async Task<IActionResult> Security()
        {
            var me = CurrentUserId;
            // Optional data: before migration 014 there is simply nothing to show.
            var login = await SafeQuery.IfSchemaMissing(() => _db.UserLogins.AsNoTracking().FirstOrDefaultAsync(l => l.UserId == me), null);
            return Ok(new
            {
                signedInAt = login?.LastLoginAt,
                previousSignInAt = login?.PreviousLoginAt,
            });
        }

        // GET api/manager/settings/notifications
        [HttpGet("notifications")]
        public async Task<IActionResult> GetNotifications()
        {
            var pref = await _db.ManagerNotificationPrefs.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == CurrentUserId) ?? new ManagerNotificationPref();
            return Ok(new
            {
                inApp = pref.InApp,
                requests = pref.Requests,
                queries = pref.Queries,
                invoices = pref.Invoices,
                employees = pref.Employees,
                chat = pref.Chat,
                expiry = pref.Expiry,
                expiryDays = pref.ExpiryDays,
                systemExpiryDays = await SettingsReader.GetIntAsync(_db, SettingsCatalog.NotifyContractExpiryDays),
                systemInAppEnabled = await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp),
            });
        }

        // PUT api/manager/settings/notifications
        [HttpPut("notifications")]
        public async Task<IActionResult> SaveNotifications([FromBody] ManagerNotificationPrefRequest request)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            var pref = await _db.ManagerNotificationPrefs.FirstOrDefaultAsync(p => p.UserId == me);
            if (pref == null)
            {
                pref = new ManagerNotificationPref { UserId = me.Value };
                _db.ManagerNotificationPrefs.Add(pref);
            }

            pref.InApp = request.InApp;
            pref.Requests = request.Requests;
            pref.Queries = request.Queries;
            pref.Invoices = request.Invoices;
            pref.Employees = request.Employees;
            pref.Chat = request.Chat;
            pref.Expiry = request.Expiry;
            pref.ExpiryDays = request.ExpiryDays;
            pref.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(new { message = "Your notification settings were saved." });
        }
    }
}
