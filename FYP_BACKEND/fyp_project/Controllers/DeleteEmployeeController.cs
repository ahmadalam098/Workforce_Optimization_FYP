using fyp_project.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers
{
    // Controller ka route: api/DeleteEmployee
    [Route("api/[controller]")]
    [ApiController]
    public class DeleteEmployeeController : ControllerBase
    {
        // Database context ko access karne ke liye field
        private readonly WorkforceManagementDbContext _context;

        // Constructor injection ke zariye database context receive karte hain
        public DeleteEmployeeController(WorkforceManagementDbContext context)
        {
            _context = context;
        }

        // Sirf Admin role wala authenticated user employee delete kar sakta hai
        [Authorize(Roles = "Admin")]

        // HTTP DELETE request accept karta hai
        // employeeId URL ke route parameter se receive hoti hai
        // Example: DELETE /api/DeleteEmployee/5
        [HttpDelete("{employeeId}")]
        public async Task<IActionResult> DeleteEmployee(int employeeId)
        {
            // EmployeeId ke zariye database mein employee find karte hain
            var employee = await _context.Employees
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            // Agar employee nahi milta to 404 Not Found return karte hain
            if (employee == null)
            {
                return NotFound(new
                {
                    message = "Employee not found."
                });
            }

            // Check karte hain ke employee ki allocations maujood hain ya nahi
            var hasAllocations = await _context.EmployeeAllocations
                .AnyAsync(a => a.EmployeeId == employeeId);

            // Agar employee se related koi bhi record exist karta hai,
            // to deletion rok dete hain
            if (hasAllocations)
            {
                // 409 Conflict response return karte hain
                return Conflict(new
                {
                    message = "Employee cannot be deleted because related records already exist."
                });
            }

            // Database transaction start karte hain
            // User aur Employee records ko ek operation ke taur par delete karne ke liye
            await using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                // Employee ki UserId se Users table mein related user find karte hain
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == employee.UserId);

                // Employees table se employee record delete karne ke liye mark karte hain
                _context.Employees.Remove(employee);

                // Agar related user exist karta hai to usay bhi delete karne ke liye mark karte hain
                if (user != null)
                {
                    _context.Users.Remove(user);
                }

                // Dono deletion operations database mein save karte hain
                await _context.SaveChangesAsync();

                // Agar operations successful hon to transaction commit karte hain
                await transaction.CommitAsync();

                // Client ko successful deletion ka response return karte hain
                return Ok(new
                {
                    message = "Employee deleted successfully.",
                    employeeId = employeeId
                });
            }
            catch
            {
                // Agar error aaye to transaction rollback karte hain
                await transaction.RollbackAsync();

                // Client ko 500 Internal Server Error return karte hain
                return StatusCode(500, new
                {
                    message = "An error occurred while deleting the employee."
                });
            }
        }
    }
}
