using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    public class OrganizationRegisterRequest
    {
        [Required, StringLength(150), OrganizationName] public string Name { get; set; } = string.Empty;
        [Required, EmailAddress, StringLength(150)] public string Email { get; set; } = string.Empty;
        [Required, StringLength(20), PhoneNumber] public string? Phone { get; set; }
        [Required, StringLength(100), CountryName] public string? Country { get; set; }
        [Required, StringLength(255, MinimumLength = 5)] public string? Address { get; set; }
        [Required, StringLength(100)] public string Password { get; set; } = string.Empty;
        [Required, StringLength(100)] public string ConfirmPassword { get; set; } = string.Empty;
    }

    public class OrganizationLoginRequest
    {
        [Required, StringLength(150)] public string Email { get; set; } = string.Empty;
        [Required, StringLength(100)] public string Password { get; set; } = string.Empty;
    }

    public class OrganizationEmailRequest
    {
        [Required, StringLength(150)] public string Email { get; set; } = string.Empty;
    }

    public class OrganizationVerifyOtpRequest
    {
        [Required, StringLength(150)] public string Email { get; set; } = string.Empty;
        [Required, StringLength(10)] public string Otp { get; set; } = string.Empty;
    }

    public class OrganizationResetPasswordRequest
    {
        [Required, StringLength(150)] public string Email { get; set; } = string.Empty;
        [Required, StringLength(100)] public string NewPassword { get; set; } = string.Empty;
        [Required, StringLength(100)] public string ConfirmPassword { get; set; } = string.Empty;
    }

    /// <summary>
    /// Organization portal: its own register, login and forgot password. This is separate from the staff accounts (User): an organization
    /// registers itself, signs in with its email and password, and its JWT (kept in the HttpOnly accessToken cookie) carries the role
    /// "Organization" and the organization id. A newly registered organization is Pending until the admin approves it (the admin's
    /// Organizations page shows it and the admin bell announces it). The OTP and the permission to reset are kept in Redis under their own
    /// keys (org-otp / org-reset), apart from the staff flow.
    /// </summary>
    [ApiController]
    [Route("api/organization/auth")]
    public class OrganizationAuthController : ControllerBase
    {
        private const int OtpMinutes = 5;
        private const int ResetMinutes = 10;

        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly AuditService _audit;
        private readonly TokenService _tokens;
        private readonly EmailService _email;
        private readonly RedisService _redis;

        public OrganizationAuthController(WorkforceManagementDbContext db, IdGenerator ids, AuditService audit, TokenService tokens, EmailService email, RedisService redis)
        {
            _db = db;
            _ids = ids;
            _audit = audit;
            _tokens = tokens;
            _email = email;
            _redis = redis;
        }

        private IActionResult FieldError(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        private static string Clean(string? text) => (text ?? string.Empty).Trim();

        /// <summary>What the frontend keeps about the signed-in organization (the same shape as a staff user, so one session code serves both).</summary>
        public static object ProfileOf(Organization org) => new
        {
            userId = (int?)null,   // an organization is not a User: nothing may look up a person or a picture by this id
            organizationId = org.OrgId,
            fullName = org.OrgName ?? string.Empty,
            email = org.Email ?? string.Empty,
            roleName = "Organization",
            status = org.Status,
        };

        // POST api/organization/auth/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] OrganizationRegisterRequest request)
        {
            var email = Clean(request.Email);
            if (PasswordPolicy.Problem(request.Password) is { } problem) return FieldError("password", problem);
            if (request.Password != request.ConfirmPassword) return FieldError("confirmPassword", "The passwords do not match.");

            using var _ = await _ids.LockAsync();

            var existing = await _db.Organizations.FirstOrDefaultAsync(o => o.Email == email);
            if (existing != null)
            {
                return Conflict(new
                {
                    message = string.IsNullOrEmpty(existing.Password)
                        ? "An organization with this email already exists. Use \"Forgot password\" on the login page to set a password for it."
                        : "An organization with this email is already registered. Please sign in.",
                    errors = new Dictionary<string, string[]> { ["email"] = new[] { "This email is already registered." } },
                });
            }

            var now = DateTime.UtcNow;
            var organization = new Organization
            {
                OrgId = await _ids.NextAsync(_db, "Organization", "org_id"),
                OrgName = Clean(request.Name),
                Email = email,
                Phone = Clean(request.Phone),
                Country = Clean(request.Country),
                Address = Clean(request.Address),
                Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Status = ContractLogic.Pending,
                CreatedAt = now,
            };
            _db.Organizations.Add(organization);
            await _db.SaveChangesAsync();

            // The admin sees it in the audit log and in the bell, and decides on the Organizations page.
            await _audit.LogAsync(null, "ORGANIZATION_REGISTERED", "Organization", organization.OrgId, $"{organization.OrgName} registered itself and is waiting for approval");

            // The confirmation email must never undo the registration.
            try
            {
                if (await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyEmail))
                {
                    var (subject, html) = OrganizationEmails.Registered(organization.OrgName ?? "your organization", email, approved: false, now, selfRegistered: true);
                    await _email.SendEmailAsync(email, subject, html, isHtml: true);
                }
            }
            catch (Exception)
            {
                // The organization can still sign in; the admin sees the registration.
            }

            return Ok(new { message = "Your organization was registered. Please sign in. It becomes fully active when the admin approves it.", organizationId = organization.OrgId });
        }

        // POST api/organization/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] OrganizationLoginRequest request)
        {
            var email = Clean(request.Email);
            var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Email == email);

            if (org == null) return Unauthorized(new { message = "Invalid email or password." });
            if (string.IsNullOrEmpty(org.Password))
                return Unauthorized(new { message = "This organization has no password yet. Use \"Forgot password\" to set one." });

            bool correct;
            try { correct = BCrypt.Net.BCrypt.Verify(request.Password, org.Password); }
            catch (Exception) { correct = false; }
            if (!correct) return Unauthorized(new { message = "Invalid email or password." });

            // A pending organization may sign in (to see that it waits for approval); a rejected or suspended one may not.
            if (string.Equals(org.Status, "Rejected", StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { message = "This organization was not approved. Please contact the administrator." });
            if (string.Equals(org.Status, "Suspended", StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { message = "This organization is suspended. Please contact the administrator." });

            // Remember when it signed in (shown in Settings > Security). Before migration 019 this is simply skipped.
            try
            {
                var settings = await _db.OrganizationSettings.FirstOrDefaultAsync(s => s.OrgId == org.OrgId);
                if (settings == null) _db.OrganizationSettings.Add(settings = new OrganizationSettings { OrgId = org.OrgId });
                settings.PreviousLoginAt = settings.LastLoginAt;
                settings.LastLoginAt = DateTime.UtcNow;
                settings.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
            catch (Exception ex) when (SafeQuery.IsMissingSchema(ex))
            {
                _db.ChangeTracker.Clear();
            }

            var token = _tokens.CreateOrganizationToken(org.OrgId, org.Email ?? email);
            Response.Cookies.Append("accessToken", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = DateTimeOffset.UtcNow.AddMinutes(_tokens.ExpiryMinutes),
                IsEssential = true,
                Path = "/",
            });

            return Ok(new { message = "Login successful.", user = ProfileOf(org) });
        }

        // ---------------------------------------------------------------- forgot password (OTP + Redis)

        // POST api/organization/auth/send-otp
        [HttpPost("send-otp")]
        public async Task<IActionResult> SendOtp([FromBody] OrganizationEmailRequest request)
        {
            var email = Clean(request.Email);
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Email == email);
            if (org == null) return NotFound(new { message = "No organization is registered with this email." });

            var otp = new OtpService().GenerateOtp();
            await _redis.SaveAsync($"org-otp:{email.ToLowerInvariant()}", otp, OtpMinutes);

            try
            {
                await _email.SendEmailAsync(email, "OTP for Organization Password Reset", $"Your OTP is: {otp}. It is valid for {OtpMinutes} minutes.");
            }
            catch (Exception)
            {
                return StatusCode(502, new { message = "The code could not be emailed. Please try again in a moment." });
            }

            return Ok(new { message = "OTP sent successfully" });
        }

        // POST api/organization/auth/verify-otp
        [HttpPost("verify-otp")]
        public async Task<IActionResult> VerifyOtp([FromBody] OrganizationVerifyOtpRequest request)
        {
            var key = request.Email.Trim().ToLowerInvariant();
            var stored = await _redis.GetAsync($"org-otp:{key}");
            if (stored == null) return BadRequest(new { message = "OTP has expired or is invalid." });
            if (stored != request.Otp.Trim()) return BadRequest(new { message = "Invalid OTP." });

            await _redis.DeleteAsync($"org-otp:{key}");
            await _redis.SaveAsync($"org-reset:{key}", "verified", ResetMinutes);
            return Ok(new { message = "OTP verified successfully." });
        }

        // POST api/organization/auth/reset-password
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] OrganizationResetPasswordRequest request)
        {
            var email = Clean(request.Email);
            var key = email.ToLowerInvariant();
            if (await _redis.GetAsync($"org-reset:{key}") == null) return BadRequest(new { message = "OTP verification required." });
            if (request.NewPassword != request.ConfirmPassword) return BadRequest(new { message = "Passwords do not match." });
            if (PasswordPolicy.Problem(request.NewPassword) is { } problem) return FieldError("newPassword", problem);

            var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Email == email);
            if (org == null) return NotFound(new { message = "No organization is registered with this email." });

            org.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _db.SaveChangesAsync();
            await _redis.DeleteAsync($"org-reset:{key}");
            await _audit.LogAsync(null, "ORGANIZATION_PASSWORD_RESET", "Organization", org.OrgId, $"{org.OrgName} reset its own password");

            return Ok(new { message = "Password has been reset successfully." });
        }
    }
}
