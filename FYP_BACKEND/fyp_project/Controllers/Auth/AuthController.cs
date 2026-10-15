using System.Security.Claims;
using fyp_project.DTO;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    [ApiController]
    [Route("api/Auth")]
    public class AuthController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;

        public AuthController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        /// <summary>Returns the signed-in user (used by the frontend to restore a session).</summary>
        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                        ?? User.FindFirst("nameid")?.Value
                        ?? User.FindFirst("sub")?.Value;

            if (!int.TryParse(value, out var userId)) return Unauthorized(new { message = "Invalid session." });

            var user = await _context.Users
                .AsNoTracking()
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.UserId == userId);

            if (user == null || user.IsActive != true)
                return Unauthorized(new { message = "Account is inactive or no longer exists." });

            return Ok(new
            {
                user = new UserDTO
                {
                    UserId = user.UserId,
                    FullName = user.Name ?? string.Empty,
                    Email = user.Email ?? string.Empty,
                    RoleName = user.Role?.RoleType ?? string.Empty,
                },
            });
        }

        /// <summary>Clears the HttpOnly auth cookie.</summary>
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            Response.Cookies.Delete("accessToken", new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Path = "/",
            });
            return Ok(new { message = "Logged out." });
        }
    }
}
