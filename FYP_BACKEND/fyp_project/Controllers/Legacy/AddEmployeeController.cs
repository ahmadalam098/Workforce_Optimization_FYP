
using fyp_project.DTOs;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    // Controller ka route: api/AddEmployee
    [Route("api/[controller]")]
    [ApiController]
    public class AddEmployeeController : ControllerBase
    {
        // Database aur email service ko access karne ke liye fields
        private readonly WorkforceManagementDbContext _context;
        private readonly EmailService _emailService;

        // Constructor injection: database context aur EmailService receive karte hain
        public AddEmployeeController(
            WorkforceManagementDbContext context,
            EmailService emailService)
        {
            _context = context;
            _emailService = emailService;
        }

        // Sirf Admin role wala authenticated user is endpoint ko access kar sakta hai
        [Authorize(Roles = "Admin")]

        // POST request ke zariye naya employee add karne ka endpoint
        [HttpPost]
        public async Task<IActionResult> AddEmployee([FromBody] AddEmployeeDto dto)
        {
            // Check karte hain ke required fields empty ya invalid to nahi hain
            if (string.IsNullOrWhiteSpace(dto.FullName) ||
                string.IsNullOrWhiteSpace(dto.Email) ||
                string.IsNullOrWhiteSpace(dto.Cnic) ||
                string.IsNullOrWhiteSpace(dto.Password) ||
                string.IsNullOrWhiteSpace(dto.EmployeeType) ||
                string.IsNullOrWhiteSpace(dto.PersonaType) ||
                string.IsNullOrWhiteSpace(dto.AvailabilityStatus) ||
                dto.CurrentOrganizationId <= 0 ||
                dto.HourlyRate <= 0)
            {
                // Agar required data valid nahi hai to Bad Request return karte hain
                return BadRequest(new
                {
                    message = "Please provide all required employee details."
                });
            }

            // Database se Employee role find karte hain
            // Naye employee ko ye role assign kiya jayega
            var employeeRole = await _context.Roles
                .FirstOrDefaultAsync(r => r.RoleType == "Employee");

            // Agar Employee role database mein nahi milta to server error return karte hain
            if (employeeRole == null)
            {
                return StatusCode(500, new
                {
                    message = "Employee role is not configured in the system."
                });
            }

            // Check karte hain ke selected organization database mein exist karti hai
            var organizationExists = await _context.Organizations
                .AnyAsync(o => o.OrganizationId == dto.CurrentOrganizationId);

            // Agar organization exist nahi karti to Bad Request return karte hain
            if (!organizationExists)
            {
                return BadRequest(new
                {
                    message = "The selected organization does not exist."
                });
            }

            // Check karte hain ke same Email ya CNIC se pehle se koi user registered to nahi
            var existingUser = await _context.Users
                .FirstOrDefaultAsync(u =>
                    u.Email == dto.Email ||
                    u.Cnic == dto.Cnic);

            // Agar duplicate user mil jaye to Conflict response return karte hain
            if (existingUser != null)
            {
                return Conflict(new
                {
                    message = "A user with the same email or CNIC already exists."
                });
            }

            // Database transaction start karte hain
            // Is se user aur employee records ko ek operation ki tarah manage kar sakte hain
            await using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                // User table ke liye naya User object banate hain
                var user = new User
                {
                    Name = dto.FullName,
                    Email = dto.Email,
                    Phone = dto.Phone,
                    Cnic = dto.Cnic,

                    // Password ko plain text mein save nahi karte
                    // BCrypt password ka hash generate karta hai
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),

                    // Naye user ko Employee role assign karte hain
                    RoleId = employeeRole.RoleId,

                    // Account ko active set karte hain
                    IsActive = true,

                    // User creation ka current UTC time save karte hain
                    CreatedAt = DateTime.UtcNow
                };

                // User object ko Users table mein add karte hain
                _context.Users.Add(user);

                // Changes database mein save karte hain
                // Is se user ki generated UserId available ho jati hai
                await _context.SaveChangesAsync();

                // Employee table ke liye naya Employee object banate hain
                var employee = new Employee
                {
                    // User table ki generated ID employee ke saath link karte hain
                    UserId = user.UserId,

                    // DTO se employee ki details assign karte hain
                    CurrentOrganizationId = dto.CurrentOrganizationId,
                    EmployeeType = dto.EmployeeType,
                    PersonaType = dto.PersonaType,
                    AvailabilityStatus = dto.AvailabilityStatus,
                    HourlyRate = dto.HourlyRate,
                    IsInSharedPool = dto.IsInSharedPool,
                    Rating = dto.Rating,
                    ProficiencyLevel = dto.ProficiencyLevel,
                    Picture = dto.Picture,

                    // Employee creation ka current UTC time save karte hain
                    CreatedAt = DateTime.UtcNow
                };

                // Employee object ko Employees table mein add karte hain
                _context.Employees.Add(employee);

                // Employee record database mein save karte hain
                await _context.SaveChangesAsync();

                // Employee ko account credentials bhejne ke liye email body prepare karte hain
                var emailBody =
                    $"Hello {dto.FullName},\n\n" +
                    "Your employee account has been created successfully.\n\n" +
                    $"Username: {dto.Email}\n" +
                    $"Password: {dto.Password}\n\n" +
                    "Please change your password after your first login.";

                // Employee ke email address par account details send karte hain
                await _emailService.SendEmailAsync(
                    dto.Email,
                    "Employee Account Credentials",
                    emailBody);

                // Agar sab operations successful hon to transaction commit karte hain
                await transaction.CommitAsync();

                // Client ko success message aur generated IDs return karte hain
                return Ok(new
                {
                    message = "Employee created successfully.",
                    userId = user.UserId,
                    employeeId = employee.EmployeeId
                });
            }
            catch
            {
                // Agar operation fail ho jaye to transaction rollback karte hain
                await transaction.RollbackAsync();

                // Client ko server error response return karte hain
                return StatusCode(500, new
                {
                    message = "An error occurred while creating the employee."
                });
            }
        }
    }
}
