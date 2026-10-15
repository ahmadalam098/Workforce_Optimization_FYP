
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using fyp_project.Models;
using fyp_project.DTO;
using fyp_project.Services;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UserLoginController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;
        private readonly TokenService _tokenService;
        private readonly EmailService _emailService;
        private readonly ILogger<UserLoginController> _logger;

        public UserLoginController(
            WorkforceManagementDbContext context,
            TokenService tokenService,
            EmailService emailService,
            ILogger<UserLoginController> logger)
        {
            _context = context;
            _tokenService = tokenService;
            _emailService = emailService;
            _logger = logger;
        }

        private static readonly string[] AllowedRoles = { "Admin", "Organization Manager" };

        [HttpPost("loginUser")]
        public async Task<IActionResult> Login([FromBody] Login obj)
        {
            try
            {
                // 1. Validate request
                if (obj == null ||
                    string.IsNullOrWhiteSpace(obj.Email) ||
                    string.IsNullOrWhiteSpace(obj.Password) ||
                    string.IsNullOrWhiteSpace(obj.RoleName))
                {
                    return BadRequest(new
                    {
                        message = "Email, password, and role are required."
                    });
                }

                // 2. Find user by email
                var email = obj.Email.Trim();

                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Email == email);

                if (user == null)
                {
                    return Unauthorized(new
                    {
                        message = "Invalid email or password."
                    });
                }

                // 3. Check account status
                if (user.IsActive != true)
                {
                    return Unauthorized(new
                    {
                        message = "Account is inactive."
                    });
                }

                // 4. Verify password hash
                if (string.IsNullOrWhiteSpace(user.PasswordHash))
                {
                    _logger.LogError(
                        "User {UserId} has no password hash.",
                        user.UserId);

                    return Unauthorized(new
                    {
                        message = "Invalid email or password."
                    });
                }

                bool passwordVerified;

                try
                {
                    passwordVerified = BCrypt.Net.BCrypt.Verify(
                        obj.Password,
                        user.PasswordHash);
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Password verification failed for user {UserId}.",
                        user.UserId);

                    return StatusCode(500, new
                    {
                        message = "Unable to verify credentials."
                    });
                }

                if (!passwordVerified)
                {
                    return Unauthorized(new
                    {
                        message = "Invalid email or password."
                    });
                }

                // 5. Retrieve actual role from database
                var role = await _context.Roles
                    .FirstOrDefaultAsync(r => r.RoleId == user.RoleId);

                if (role == null ||
                    string.IsNullOrWhiteSpace(role.RoleName))
                {
                    _logger.LogError(
                        "Role not found for user {UserId}.",
                        user.UserId);

                    return StatusCode(500, new
                    {
                        message = "User role is not configured correctly."
                    });
                }

                string actualRole = role.RoleName;

                // 6. Validate supplied role
                if (!string.Equals(
                    obj.RoleName.Trim(),
                    actualRole,
                    StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(403, new
                    {
                        message = "The supplied role does not match your account."
                    });
                }

                // 7. Only the roles that have a portal can sign in (Admin and Organization Manager)
                if (!AllowedRoles.Contains(actualRole, StringComparer.OrdinalIgnoreCase))
                {
                    return StatusCode(403, new
                    {
                        message = "Access denied. The portal for your role is not available yet."
                    });
                }

                // 8. Generate JWT
                var token = _tokenService.CreateToken(
                    user.UserId,
                    user.Email,
                    actualRole);

                if (string.IsNullOrWhiteSpace(token))
                {
                    _logger.LogError(
                        "JWT generation returned an empty token for user {UserId}.",
                        user.UserId);

                    return StatusCode(500, new
                    {
                        message = "Unable to create authentication token."
                    });
                }

                // 9. Update last login before issuing the cookie
                user.LastLogin = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Remember when this person signed in (shown in Settings > Security). Optional: never blocks a sign-in.
                try
                {
                    var now = DateTime.UtcNow;
                    var seen = await _context.UserLogins.FirstOrDefaultAsync(l => l.UserId == user.UserId);
                    if (seen == null)
                        _context.UserLogins.Add(new UserLogin { UserId = user.UserId, LastLoginAt = now });
                    else
                    {
                        seen.PreviousLoginAt = seen.LastLoginAt;
                        seen.LastLoginAt = now;
                    }
                    await _context.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not store the last sign-in time of user {UserId}.", user.UserId);
                }

                // 10. Store JWT in HttpOnly cookie
                Response.Cookies.Append(
                    "accessToken",
                    token,
                    new CookieOptions
                    {
                        HttpOnly = true,

                        // Secure cookies require HTTPS.
                        Secure = true,

                        SameSite = SameSiteMode.Strict,

                        // The cookie lives exactly as long as the token inside it.
                        Expires = DateTimeOffset.UtcNow.AddMinutes(_tokenService.ExpiryMinutes),

                        IsEssential = true,

                        Path = "/"
                    });

                // 11. Create response DTO
                var userDTO = new UserDTO
                {
                    UserId = user.UserId,
                    FullName = user.FullName,
                    Email = user.Email,
                    RoleName = actualRole
                };

                // 12. Send login notification separately.
                // Email failure should not invalidate successful login.
                try
                {
                    await _emailService.SendEmailAsync(
                        user.Email,
                        "Login Notification",
                        $"Hello {user.FullName},\n\n" +
                        $"You successfully logged in at " +
                        $"{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC.\n\n" +
                        "If this wasn't you, please contact support."
                    );
                }
                catch (Exception emailEx)
                {
                    _logger.LogError(
                        emailEx,
                        "Login notification email failed for user {UserId}.",
                        user.UserId);
                }

                // 13. Return success response
                return Ok(new
                {
                    message = "Login successful.",
                    user = userDTO
                });
            }
            catch (Exception ex)
            {
                // Log the complete exception on the server.
                _logger.LogError(
                    ex,
                    "Unexpected error occurred during login.");

                // Do not expose internal exception details to clients.
                return StatusCode(500, new
                {
                    message = "An error occurred while logging in."
                });
            }
        }
    }
}