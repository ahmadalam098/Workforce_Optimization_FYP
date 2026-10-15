using fyp_project.DTOs;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class RolesController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;

        public RolesController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("add")]
        public async Task<IActionResult> AddRole([FromBody] CreateRoleDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.RoleName))
            {
                return BadRequest(new { message = "RoleName is required." });
            }

            var exists = await _context.Roles
                .AnyAsync(r => r.RoleName == dto.RoleName);

            if (exists)
            {
                return Conflict(new { message = "Role with the same name already exists." });
            }

            var role = new Role
            {
                RoleName = dto.RoleName,
                Description = dto.Description,
                CreatedAt = DateTime.UtcNow
            };

            _context.Roles.Add(role);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Role created.", roleId = role.RoleId });
        }
    }
}
