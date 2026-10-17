using System.ComponentModel.DataAnnotations;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    public class UpdateOrganizationProfileRequest
    {
        [Required, StringLength(20), PhoneNumber] public string? Phone { get; set; }
        [Required, StringLength(100), CountryName] public string? Country { get; set; }
        [Required, StringLength(255, MinimumLength = 5)] public string? Address { get; set; }
    }

    public class ChangeOrganizationPasswordRequest
    {
        [Required, StringLength(100)] public string CurrentPassword { get; set; } = string.Empty;
        [Required, StringLength(100)] public string NewPassword { get; set; } = string.Empty;
    }

    public class OrganizationNotificationPrefRequest
    {
        public bool InApp { get; set; } = true;
        public bool Contracts { get; set; } = true;
        public bool Requests { get; set; } = true;
        public bool Employees { get; set; } = true;
        public bool Invoices { get; set; } = true;
        public bool Chat { get; set; } = true;
        public bool Expiry { get; set; } = true;

        /// <summary>Days before a contract ends to warn; null = use the system setting chosen by the admin.</summary>
        [Range(1, 365)] public int? ExpiryDays { get; set; }
    }

    /// <summary>
    /// Organization portal: Settings. The company's contact details (phone, country, address - the name, email and status are fixed and only the
    /// admin changes them), security (password, last sign-in) and what it wants in its notification bell.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/settings")]
    public class OrganizationSettingsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public OrganizationSettingsController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        private int OrgId => OrganizationOverviewController.OrganizationIdOf(User) ?? 0;

        private IActionResult FieldError(string field, string message) =>
            BadRequest(new { message, errors = new Dictionary<string, string[]> { [field] = new[] { message } } });

        private static bool Usable(Organization? org) =>
            org != null && !string.Equals(org.Status, "Rejected", StringComparison.OrdinalIgnoreCase) && !string.Equals(org.Status, "Suspended", StringComparison.OrdinalIgnoreCase);

        // GET api/organization/settings/profile
        [HttpGet("profile")]
        public async Task<IActionResult> Profile()
        {
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == OrgId);
            if (!Usable(org)) return Unauthorized(new { message = "This organization can no longer sign in." });
            return Ok(new
            {
                organizationId = org!.OrgId,
                name = org.OrgName,
                email = org.Email,
                status = org.Status,
                phone = org.Phone,
                country = org.Country,
                address = org.Address,
                registeredAt = org.CreatedAt,
                approvedAt = org.ApprovedAt,
            });
        }

        // PUT api/organization/settings/profile   { phone, country, address }
        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateOrganizationProfileRequest request)
        {
            var org = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == OrgId);
            if (!Usable(org)) return Unauthorized(new { message = "This organization can no longer sign in." });

            org!.Phone = request.Phone!.Trim();
            org.Country = request.Country!.Trim();
            org.Address = request.Address!.Trim();
            await _db.SaveChangesAsync();
            await _audit.LogAsync(null, "ORGANIZATION_PROFILE_UPDATED", "Organization", org.OrgId, $"{org.OrgName} updated its own contact details");
            return Ok(new { message = "Your details were saved." });
        }

        // POST api/organization/settings/password   { currentPassword, newPassword }
        [HttpPost("password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeOrganizationPasswordRequest request)
        {
            var org = await _db.Organizations.FirstOrDefaultAsync(o => o.OrgId == OrgId);
            if (!Usable(org)) return Unauthorized(new { message = "This organization can no longer sign in." });

            bool correct;
            try { correct = !string.IsNullOrEmpty(org!.Password) && BCrypt.Net.BCrypt.Verify(request.CurrentPassword, org.Password); }
            catch (Exception) { correct = false; }
            if (!correct) return FieldError("currentPassword", "The current password is not correct.");

            if (PasswordPolicy.Problem(request.NewPassword) is { } problem) return FieldError("newPassword", problem);
            if (request.NewPassword == request.CurrentPassword) return FieldError("newPassword", "The new password must be different from the current one.");

            org.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _db.SaveChangesAsync();
            await _audit.LogAsync(null, "ORGANIZATION_PASSWORD_CHANGED", "Organization", org.OrgId, $"{org.OrgName} changed its own password");
            return Ok(new { message = "Your password was changed." });
        }

        // GET api/organization/settings/security
        [HttpGet("security")]
        public async Task<IActionResult> Security()
        {
            var settings = await SafeQuery.IfSchemaMissing(() => _db.OrganizationSettings.AsNoTracking().FirstOrDefaultAsync(s => s.OrgId == OrgId), null);
            return Ok(new { signedInAt = settings?.LastLoginAt, previousSignInAt = settings?.PreviousLoginAt });
        }

        // GET api/organization/settings/notifications
        [HttpGet("notifications")]
        public async Task<IActionResult> GetNotifications()
        {
            var pref = await _db.OrganizationSettings.AsNoTracking().FirstOrDefaultAsync(s => s.OrgId == OrgId) ?? new OrganizationSettings();
            return Ok(new
            {
                inApp = pref.InApp,
                contracts = pref.Contracts,
                requests = pref.Requests,
                employees = pref.Employees,
                invoices = pref.Invoices,
                chat = pref.Chat,
                expiry = pref.Expiry,
                expiryDays = pref.ExpiryDays,
                systemExpiryDays = await SettingsReader.GetIntAsync(_db, SettingsCatalog.NotifyContractExpiryDays),
                systemInAppEnabled = await SettingsReader.GetBoolAsync(_db, SettingsCatalog.NotifyInApp),
            });
        }

        // PUT api/organization/settings/notifications
        [HttpPut("notifications")]
        public async Task<IActionResult> SaveNotifications([FromBody] OrganizationNotificationPrefRequest request)
        {
            var orgId = OrgId;
            var pref = await _db.OrganizationSettings.FirstOrDefaultAsync(s => s.OrgId == orgId);
            if (pref == null)
            {
                pref = new OrganizationSettings { OrgId = orgId };
                _db.OrganizationSettings.Add(pref);
            }
            pref.InApp = request.InApp;
            pref.Contracts = request.Contracts;
            pref.Requests = request.Requests;
            pref.Employees = request.Employees;
            pref.Invoices = request.Invoices;
            pref.Chat = request.Chat;
            pref.Expiry = request.Expiry;
            pref.ExpiryDays = request.ExpiryDays;
            pref.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(new { message = "Your notification settings were saved." });
        }
    }
}
