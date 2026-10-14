using fyp_project.DTOs;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SetUserRoleController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;

        public SetUserRoleController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("set")]
        public async Task<IActionResult> SetRole([FromBody] SetUserRoleDto dto)
        {
            if (dto == null || dto.UserId <= 0 || dto.RoleId <= 0)
            {
                return BadRequest(new { message = "UserId and RoleId are required and must be positive." });
            }

            var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == dto.UserId);
            if (user == null)
            {
                return NotFound(new { message = "User not found." });
            }

            var role = await _context.Roles.FirstOrDefaultAsync(r => r.RoleId == dto.RoleId);
            if (role == null)
            {
                return NotFound(new { message = "Role not found." });
            }

            user.RoleId = dto.RoleId;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Role updated successfully.", userId = user.UserId, roleId = dto.RoleId });
        }
    }
}
