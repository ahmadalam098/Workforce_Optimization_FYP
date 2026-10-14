using fyp_project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: roles overview (accounts per role).</summary>
    [Route("api/admin/system")]
    public class AdminSystemController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public AdminSystemController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        // ------------------------------------------------------------------ roles

        // GET api/admin/system/roles
        [HttpGet("roles")]
        public async Task<IActionResult> Roles()
        {
            var roles = await _db.Roles.AsNoTracking()
                .OrderBy(r => r.RoleId)
                .Select(r => new
                {
                    roleId = r.RoleId,
                    name = r.RoleType,
                    description = r.Description,
                    totalUsers = r.Users.Count,
                    activeUsers = r.Users.Count(u => u.IsActive == true),
                })
                .ToListAsync();
            return Ok(roles);
        }
    }
}
