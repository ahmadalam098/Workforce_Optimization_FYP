
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using fyp_project.Models;
using fyp_project.DTOs;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TestingController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _context;

        public TestingController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        // Only the admin creates accounts: nobody can register themselves.
        [Microsoft.AspNetCore.Authorization.Authorize(Roles = "Admin")]
        [HttpPost("addUser")]
        public IActionResult AddUser([FromBody] CreateUserDto dto)
        {
            try
            {
                if (dto == null)
                {
                    return BadRequest(new
                    {
                        message = "Request body cannot be empty"
                    });
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
                    CreatedAt = DateTime.Now
                };

                _context.Users.Add(user);
                _context.SaveChanges();

                return Ok(new
                {
                    message = "User added successfully",
                    userId = user.UserId
                });
            }
            catch (DbUpdateException ex)
            {
                return BadRequest(new
                {
                    message = "Database error while adding user",
                    error = ex.InnerException?.Message ?? ex.Message
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    message = "Error adding user",
                    error = ex.Message,
                    innerException = ex.InnerException?.Message,
                    innerInnerException =
                        ex.InnerException?.InnerException?.Message
                });
            }
        }
    }
}
