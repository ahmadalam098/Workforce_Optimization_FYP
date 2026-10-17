using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    public class UpdateEmployeeProfileRequest
    {
        [StringLength(20), PhoneNumber]
        public string? Phone { get; set; }
    }

    public class ChangeEmployeePasswordRequest
    {
        [Required, StringLength(100)]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required, StringLength(100)]
        public string NewPassword { get; set; } = string.Empty;
    }

    public class EmployeeNotificationPrefRequest
    {
        public bool InApp { get; set; } = true;
    }

    /// <summary>
    /// Employee portal: Settings. The employee changes only their phone (and picture); their name, email, organization and skills are the
    /// admin's records and are shown read only. Also the password, the sign-in times and the notification bell on / off.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/settings")]
    public class EmployeeSettingsController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public EmployeeSettingsController(WorkforceManagementDbContext db, AuditService audit)
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

        // GET api/employee/settings/profile
        [HttpGet("profile")]
        public async Task<IActionResult> Profile()
        {
            var me = CurrentUserId;
            var user = await _db.Users.AsNoTracking().Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == me && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            var employee = await _db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.UserId == me);
            string? home = null, working = null;
            object skills = Array.Empty<object>();
            if (employee != null)
            {
                home = employee.OrgId == null ? null : await _db.Organizations.AsNoTracking().Where(o => o.OrgId == employee.OrgId).Select(o => o.OrgName).FirstOrDefaultAsync();
                working = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                    .Where(a => a.EmployeeId == employee.EmpId && a.AssignOrgId != null)
                    .Select(a => a.AssignOrg!.OrgName).FirstOrDefaultAsync();
                skills = await (from s in _db.EmployeeSkills.AsNoTracking()
                                join m in _db.SkillMasters.AsNoTracking() on s.SkillId equals m.SkillId
                                where s.EmpId == employee.EmpId
                                orderby m.Name
                                select new { name = m.Name, proficiency = s.Proficiency }).ToListAsync();
            }

            return Ok(new
            {
                userId = user.UserId,
                fullName = user.Name,
                email = user.Email,
                phone = user.PhoneNo,
                roleName = user.Role?.RoleType ?? string.Empty,
                employeeId = employee?.EmpId,
                joiningDate = employee?.JoiningDate,
                homeOrganization = home,
                workingOrganization = working,
                skills,
            });
        }

        // PUT api/employee/settings/profile   { phone }
        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateEmployeeProfileRequest request)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == CurrentUserId && u.IsActive == true);
            if (user == null) return Unauthorized(new { message = "Account is inactive or no longer exists." });

            user.PhoneNo = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            await _db.SaveChangesAsync();
            await _audit.LogAsync(user.UserId, "USER_UPDATED", "User", user.UserId, $"{user.Name} updated their own phone number");
            return Ok(new { message = "Your phone number was saved." });
        }

        // POST api/employee/settings/password   { currentPassword, newPassword }
        [HttpPost("password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeEmployeePasswordRequest request)
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

        // GET api/employee/settings/security
        [HttpGet("security")]
        public async Task<IActionResult> Security()
        {
            var me = CurrentUserId;
            // Optional data: before migration 014 there is simply nothing to show.
            var login = await SafeQuery.IfSchemaMissing(() => _db.UserLogins.AsNoTracking().FirstOrDefaultAsync(l => l.UserId == me), null);
            return Ok(new { signedInAt = login?.LastLoginAt, previousSignInAt = login?.PreviousLoginAt });
        }

        // GET api/employee/settings/notifications
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

        // PUT api/employee/settings/notifications   { inApp }
        [HttpPut("notifications")]
        public async Task<IActionResult> SaveNotifications([FromBody] EmployeeNotificationPrefRequest request)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized(new { message = "Invalid session." });

            // The table (Manager_Notification_Pref, migration 014) holds one row per person; an employee only uses the bell on / off.
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
