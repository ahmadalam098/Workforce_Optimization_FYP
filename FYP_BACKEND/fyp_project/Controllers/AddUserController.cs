using fyp_project.DTOs;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AddUserController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;

        public AddUserController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("add")]
        public async Task<IActionResult> AddUser([FromBody] CreateUserDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { message = "Request body is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.FullName) || string.IsNullOrWhiteSpace(dto.Email) ||
                string.IsNullOrWhiteSpace(dto.Cnic) || string.IsNullOrWhiteSpace(dto.Password))
            {
                return BadRequest(new { message = "FullName, Email, CNIC and Password are required." });
            }

            var duplicate = await _context.Users
                .AnyAsync(u => u.Email == dto.Email || u.Cnic == dto.Cnic);

            if (duplicate)
            {
                return Conflict(new { message = "A user with the same email or CNIC already exists." });
            }

            var role = await _context.Roles.FirstOrDefaultAsync(r => r.RoleId == dto.RoleId);
            if (role == null)
            {
                return BadRequest(new { message = "Specified role does not exist." });
            }

            var user = new User
            {
                FullName = dto.FullName,
                Email = dto.Email,
                Phone = dto.Phone,
                Cnic = dto.Cnic,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                RoleId = dto.RoleId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return Ok(new { message = "User added successfully.", userId = user.UserId });
        }
    }
}
