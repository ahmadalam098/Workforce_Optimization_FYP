using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: the signed-in admin changes their own name, email and password (the picture has its own endpoint).</summary>
    [Route("api/admin/profile")]
    public class AdminProfileController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminProfileController(WorkforceManagementDbContext db, AuditService audit, AccountMailer mailer)
        {
            _db = db;
            _audit = audit;
            _mailer = mailer;
        }

        // PUT api/admin/profile   { fullName, email }
        [HttpPut]
        public async Task<IActionResult> Update([FromBody] UpdateMyProfileRequest request)
        {
            var me = CurrentUserId;
            var user = await _db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == me);
            if (user == null) return NotFoundMessage("Your account was not found.");

            var email = request.Email.Trim();
            if (await _db.Users.AnyAsync(u => u.UserId != user.UserId && u.Email == email))
                return FieldError("email", "Another user already has this email.");

            var oldEmail = user.Email ?? string.Empty;
            user.Name = request.FullName.Trim();
            user.Email = email;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(me, "USER_UPDATED", "User", user.UserId, $"{user.Name} updated their own profile");
            var note = await _mailer.SendEmailChangedAsync(me, user.UserId, oldEmail);

            return Ok(new
            {
                message = "Your profile was saved." + note,
                user = new { userId = user.UserId, fullName = user.Name, email = user.Email, roleName = user.Role?.RoleType ?? string.Empty },
            });
        }

        // POST api/admin/profile/password   { currentPassword, newPassword }
        [HttpPost("password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeMyPasswordRequest request)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == CurrentUserId);
            if (user == null) return NotFoundMessage("Your account was not found.");

            bool correct;
            try { correct = !string.IsNullOrEmpty(user.Password) && BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.Password); }
            catch (Exception) { correct = false; }
            if (!correct) return FieldError("currentPassword", "The current password is not correct.");

            if (PasswordProblem(request.NewPassword) is { } problem) return FieldError("newPassword", problem);
            if (request.NewPassword == request.CurrentPassword) return FieldError("newPassword", "The new password must be different from the current one.");

            user.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "PASSWORD_CHANGED", "User", user.UserId, $"{user.Name} changed their own password");
            return Ok(new { message = "Your password was changed." });
        }
    }
}
