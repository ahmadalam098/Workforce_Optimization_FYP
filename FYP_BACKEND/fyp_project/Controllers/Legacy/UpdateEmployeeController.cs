using fyp_project.DTOs;
using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    // Controller ka route: api/UpdateEmployee
    [Route("api/[controller]")]
    [ApiController]
    public class UpdateEmployeeController : ControllerBase
    {
        // Database ko access karne ke liye context field
        private readonly WorkforceManagementDbContext _context;

        // Constructor injection ke zariye database context receive karte hain
        public UpdateEmployeeController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        // Sirf Admin role wala authenticated user employee update kar sakta hai
        [Authorize(Roles = "Admin")]

        // PUT request ke zariye employee ID ke according record update karte hain
        // Example: PUT /api/UpdateEmployee/5
        [HttpPut("{employeeId}")]
        public async Task<IActionResult> UpdateEmployee(int employeeId, [FromBody] UpdateEmployeeDto dto)
        {
            // Check karte hain ke route ID aur DTO ki ID agar dono di gayi hain
            // to unki values same honi chahiye
            if (dto.EmployeeId != 0 && dto.EmployeeId != employeeId)
            {
                // Agar dono IDs match nahi kartin to Bad Request return karte hain
                return BadRequest(new
                {
                    message = "Route employee id and request employee id do not match."
                });
            }

            // Employee ko database se find karte hain
            // Include(e => e.User) related User record bhi load karta hai
            var employee = await _context.Employees
                .Include(e => e.User)
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            // Agar employee nahi milta to 404 Not Found return karte hain
            if (employee == null)
            {
                return NotFound(new
                {
                    message = "Employee not found."
                });
            }

            // Check karte hain ke request mein organization ID di gayi hai ya nahi
            if (dto.CurrentOrganizationId.HasValue)
            {
                // Organization ID zero ya negative nahi honi chahiye
                if (dto.CurrentOrganizationId.Value <= 0)
                {
                    return BadRequest(new
                    {
                        message = "The selected organization id is invalid."
                    });
                }

                // Check karte hain ke selected organization database mein exist karti hai
                var organizationExists = await _context.Organizations
                    .AnyAsync(o => o.OrganizationId == dto.CurrentOrganizationId.Value);

                // Agar organization nahi milti to Bad Request return karte hain
                if (!organizationExists)
                {
                    return BadRequest(new
                    {
                        message = "The selected organization does not exist."
                    });
                }

                // Employee ki current organization update karte hain
                employee.CurrentOrganizationId = dto.CurrentOrganizationId.Value;
            }

            // Agar Email ya CNIC diya gaya hai to duplicate check karte hain
            if (!string.IsNullOrWhiteSpace(dto.Email) || !string.IsNullOrWhiteSpace(dto.Cnic))
            {
                // Check karte hain ke kisi doosre user ke paas ye Email ya CNIC to nahi
                // Current employee ke apne UserId ko check se exclude karte hain
                var duplicateUser = await _context.Users
                    .AnyAsync(u =>
                        u.UserId != employee.UserId &&
                        (
                            (!string.IsNullOrWhiteSpace(dto.Email) && u.Email == dto.Email) ||
                            (!string.IsNullOrWhiteSpace(dto.Cnic) && u.Cnic == dto.Cnic)
                        ));

                // Agar duplicate user mil jaye to Conflict response return karte hain
                if (duplicateUser)
                {
                    return Conflict(new
                    {
                        message = "Another user already exists with the same email or CNIC."
                    });
                }
            }

            // Agar FullName diya gaya hai to User ka naam update karte hain
            if (!string.IsNullOrWhiteSpace(dto.FullName))
            {
                employee.User.FullName = dto.FullName;
            }

            // Agar Email diya gaya hai to User ka email update karte hain
            if (!string.IsNullOrWhiteSpace(dto.Email))
            {
                employee.User.Email = dto.Email;
            }

            // Agar Phone diya gaya hai to User ka phone number update karte hain
            if (!string.IsNullOrWhiteSpace(dto.Phone))
            {
                employee.User.Phone = dto.Phone;
            }

            // Agar CNIC diya gaya hai to User ka CNIC update karte hain
            if (!string.IsNullOrWhiteSpace(dto.Cnic))
            {
                employee.User.Cnic = dto.Cnic;
            }

            // Agar EmployeeType diya gaya hai to employee type update karte hain
            if (!string.IsNullOrWhiteSpace(dto.EmployeeType))
            {
                employee.EmployeeType = dto.EmployeeType;
            }

            // Agar PersonaType diya gaya hai to persona type update karte hain
            if (!string.IsNullOrWhiteSpace(dto.PersonaType))
            {
                employee.PersonaType = dto.PersonaType;
            }

            // Agar AvailabilityStatus diya gaya hai to availability update karte hain
            if (!string.IsNullOrWhiteSpace(dto.AvailabilityStatus))
            {
                employee.AvailabilityStatus = dto.AvailabilityStatus;
            }

            // Check karte hain ke HourlyRate ki value di gayi hai ya nahi
            if (dto.HourlyRate.HasValue)
            {
                // Di gayi HourlyRate value employee ke record mein set karte hain
                employee.HourlyRate = dto.HourlyRate.Value;
            }

            // Check karte hain ke IsInSharedPool ki value di gayi hai ya nahi
            if (dto.IsInSharedPool.HasValue)
            {
                // Employee ka shared pool status update karte hain
                employee.IsInSharedPool = dto.IsInSharedPool.Value;
            }

            // Agar Rating di gayi hai to employee ki rating update karte hain
            if (dto.Rating.HasValue)
            {
                employee.Rating = dto.Rating;
            }

            // Agar ProficiencyLevel di gayi hai to proficiency level update karte hain
            if (dto.ProficiencyLevel.HasValue)
            {
                employee.ProficiencyLevel = dto.ProficiencyLevel;
            }

            // Agar Picture null nahi hai to employee ki picture update karte hain
            if (dto.Picture != null)
            {
                employee.Picture = dto.Picture;
            }

            // Tamam tracked changes database mein save karte hain
            await _context.SaveChangesAsync();

            // Client ko success message aur updated employee ki IDs return karte hain
            return Ok(new
            {
                message = "Employee updated successfully.",
                employeeId = employee.EmployeeId,
                userId = employee.UserId
            });
        }
    }
}