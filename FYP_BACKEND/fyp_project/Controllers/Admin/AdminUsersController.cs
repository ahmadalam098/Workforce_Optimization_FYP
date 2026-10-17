using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: Admin and Business Owner accounts, plus activate/deactivate for any staff account.</summary>
    [Route("api/admin/users")]
    public class AdminUsersController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly RoleService _roles;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;
        private readonly string _uploadsRoot;

        public AdminUsersController(
            WorkforceManagementDbContext db,
            IdGenerator ids,
            RoleService roles,
            AuditService audit,
            AccountMailer mailer,
            IWebHostEnvironment environment)
        {
            _db = db;
            _ids = ids;
            _roles = roles;
            _audit = audit;
            _mailer = mailer;
            _uploadsRoot = Path.Combine(environment.ContentRootPath, "uploads");
        }

        // GET api/admin/users?roleType=Admin&search=&active=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(
            string? roleType,
            string? search,
            bool? active,
            int page = 1,
            int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Users.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(roleType))
            {
                var roleIds = await _roles.FindRoleIdsAsync(roleType);
                query = query.Where(u => u.RoleId != null && roleIds.Contains(u.RoleId.Value));
            }
            else
            {
                // Employees are managed on their own page.
                var employeeRoleIds = await _roles.FindRoleIdsAsync(RoleNames.Employee);
                query = query.Where(u => u.RoleId == null || !employeeRoleIds.Contains(u.RoleId.Value));
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(u =>
                    (u.Name != null && u.Name.Contains(term)) ||
                    (u.Email != null && u.Email.Contains(term)) ||
                    (u.Cnic != null && u.Cnic.Contains(term)));
            }

            if (active == true) query = query.Where(u => u.IsActive == true);
            else if (active == false) query = query.Where(u => u.IsActive != true);

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(u => u.Name)
                .ThenBy(u => u.UserId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new UserListItemDto
                {
                    HasPicture = u.ProfilePicturePath != null,
                    UserId = u.UserId,
                    FullName = u.Name,
                    Email = u.Email,
                    Phone = u.PhoneNo,
                    Cnic = u.Cnic,
                    Country = u.Country,
                    Age = u.Age,
                    RoleName = u.Role != null ? u.Role.RoleType : null,
                    IsActive = u.IsActive == true,
                    CreatedAt = u.CreatedAt,
                })
                .ToListAsync();

            return Ok(new PagedResult<UserListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // POST api/admin/users   (Admin or Business Owner)
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
        {
            var canonicalRole = RoleNames.Normalize(request.RoleType) switch
            {
                "admin" => RoleNames.Admin,
                "businessowner" or "owner" => RoleNames.BusinessOwner,
                _ => null,
            };
            if (canonicalRole == null)
                return FieldError("roleType", "Only Admin or Business Owner accounts can be created here.");

            var email = request.Email.Trim();
            var cnic = NormalizeCnic(request.Cnic);

            if (PasswordProblem(request.Password) is { } passwordError) return FieldError("password", passwordError);
            if (CnicProblem(cnic) is { } cnicError) return FieldError("cnic", cnicError);

            using var _ = await _ids.LockAsync();

            if (await _db.Users.AnyAsync(u => u.Email == email))
                return ConflictMessage("A user with this email already exists.");
            if (await _db.Users.AnyAsync(u => u.Cnic == cnic))
                return ConflictMessage("A user with this CNIC already exists.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var role = await _roles.GetOrCreateAsync(canonicalRole);
                var user = new User
                {
                    UserId = await _ids.NextAsync(_db, "User", "user_id"),
                    Name = request.FullName.Trim(),
                    Email = email,
                    PhoneNo = request.Phone?.Trim(),
                    Cnic = cnic,
                    Age = request.Age,
                    Country = request.Country?.Trim(),
                    Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
                    RoleId = role.RoleId,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                };
                _db.Users.Add(user);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                await _audit.LogAsync(CurrentUserId, "USER_CREATED", "User", user.UserId,
                    $"Created {canonicalRole} account for {user.Name} ({user.Email})");

                var emailNote = await _mailer.SendWelcomeAsync(CurrentUserId, user.UserId, user.Name ?? "there", user.Email ?? string.Empty, canonicalRole);
                return Ok(new { message = $"{canonicalRole} account created.{emailNote}", userId = user.UserId });
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "An error occurred while creating the account." });
            }
        }

        // PUT api/admin/users/5
        [HttpPut("{userId:int}")]
        public async Task<IActionResult> Update(int userId, [FromBody] UpdateUserRequest request)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null) return NotFoundMessage("User not found.");

            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                var email = request.Email.Trim();
                if (await _db.Users.AnyAsync(u => u.UserId != userId && u.Email == email))
                    return ConflictMessage("Another user already has this email.");
                user.Email = email;
            }

            if (!string.IsNullOrWhiteSpace(request.Cnic))
            {
                var cnic = NormalizeCnic(request.Cnic);
                if (CnicProblem(cnic) is { } cnicError) return FieldError("cnic", cnicError);
                if (await _db.Users.AnyAsync(u => u.UserId != userId && u.Cnic == cnic))
                    return ConflictMessage("Another user already has this CNIC.");
                user.Cnic = cnic;
            }

            if (!string.IsNullOrWhiteSpace(request.FullName)) user.Name = request.FullName.Trim();
            if (request.Phone != null) user.PhoneNo = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            if (request.Country != null) user.Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim();
            if (request.Age.HasValue) user.Age = request.Age;

            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "USER_UPDATED", "User", userId, user.Name);
            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, userId, PersonEvent.Updated);

            return Ok(new { message = "User updated." + emailNote, userId });
        }

        // PATCH api/admin/users/5/active
        [HttpPatch("{userId:int}/active")]
        public async Task<IActionResult> SetActive(int userId, [FromBody] SetActiveRequest request)
        {
            var user = await _db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null) return NotFoundMessage("User not found.");

            var makeActive = request.IsActive == true;

            if (!makeActive)
            {
                if (user.UserId == CurrentUserId)
                    return ConflictMessage("You cannot deactivate your own account.");

                if (RoleNames.Normalize(user.Role?.RoleType) == "employee")
                    return ConflictMessage("Employees are deactivated from the Employees page.");

                if (RoleNames.Normalize(user.Role?.RoleType) == "admin" && user.IsActive == true)
                {
                    var adminRoleIds = await _roles.FindRoleIdsAsync(RoleNames.Admin);
                    var otherActiveAdmins = await _db.Users.CountAsync(u =>
                        u.UserId != userId && u.IsActive == true && u.RoleId != null && adminRoleIds.Contains(u.RoleId.Value));
                    if (otherActiveAdmins == 0)
                        return ConflictMessage("At least one active Admin account must remain.");
                }
            }

            user.IsActive = makeActive;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, makeActive ? "USER_ACTIVATED" : "USER_DEACTIVATED", "User", userId,
                request.Reason ?? user.Name);

            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, userId, makeActive ? PersonEvent.Activated : PersonEvent.Deactivated, request.Reason);
            return Ok(new { message = (makeActive ? "Account activated." : "Account deactivated.") + emailNote, userId, isActive = makeActive });
        }

        // DELETE api/admin/users/5   (permanently deletes a DEACTIVATED Business Owner; the account is gone from every list)
        [HttpDelete("{userId:int}")]
        public async Task<IActionResult> Delete(int userId)
        {
            var user = await _db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null) return NotFoundMessage("User not found.");
            if (user.UserId == CurrentUserId) return ConflictMessage("You cannot delete your own account.");
            if (RoleNames.Normalize(user.Role?.RoleType) != "businessowner")
                return ConflictMessage("Only a Business Owner account can be deleted completely.");
            if (user.IsActive == true) return ConflictMessage("Deactivate the account first. Only a deactivated account can be deleted.");

            var name = user.Name;
            var email = user.Email;
            var picture = user.ProfilePicturePath;

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                // Rows that belong only to this person.
                await SafeQuery.IfSchemaMissing(async () => await _db.UserLogins.Where(l => l.UserId == userId).ExecuteDeleteAsync(), 0);
                await SafeQuery.IfSchemaMissing(async () => await _db.NotificationStates.Where(s => s.UserId == userId).ExecuteDeleteAsync(), 0);
                await SafeQuery.IfSchemaMissing(async () => await _db.ManagerNotificationPrefs.Where(p => p.UserId == userId).ExecuteDeleteAsync(), 0);
                // The audit log keeps what they did, with their name, but no longer points at the deleted account.
                await _db.AuditLogs.Where(a => a.ActorUserId == userId).ExecuteUpdateAsync(s => s.SetProperty(a => a.ActorUserId, (int?)null));

                _db.Users.Remove(user);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (DbUpdateException)
            {
                await transaction.RollbackAsync();
                return ConflictMessage($"{name} has records in the system, so the account cannot be deleted. Keep it deactivated instead.");
            }

            // The picture file is no longer referenced by anything.
            try
            {
                var full = string.IsNullOrWhiteSpace(picture) ? null : Path.GetFullPath(Path.Combine(_uploadsRoot, picture));
                if (full != null && full.StartsWith(Path.GetFullPath(_uploadsRoot) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) && System.IO.File.Exists(full))
                    System.IO.File.Delete(full);
            }
            catch (IOException)
            {
                // Harmless: nothing points at the file any more.
            }

            await _audit.LogAsync(CurrentUserId, "USER_DELETED", "User", userId, $"{name} ({email}) was deleted permanently");
            return Ok(new { message = $"{name} was deleted permanently.", userId });
        }

        // POST api/admin/users/5/reset-password
        [HttpPost("{userId:int}/reset-password")]
        public async Task<IActionResult> ResetPassword(int userId, [FromBody] ResetPasswordRequest request)
        {
            if (PasswordProblem(request.NewPassword) is { } passwordError) return FieldError("newPassword", passwordError);

            var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null) return NotFoundMessage("User not found.");

            user.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "USER_PASSWORD_RESET", "User", userId, user.Name);
            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, userId, PersonEvent.PasswordReset);
            return Ok(new { message = "Password has been reset." + emailNote });
        }
    }
}
