using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.OrganizationPortal
{
    /// <summary>
    /// Organization portal: the employees working for the organization right now (after they accepted the manager's offer). The page shows who
    /// is online (the chat server knows that) and lets the organization call them.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "OrganizationOnly")]
    [MissingMigrationFilter]
    [Route("api/organization/team")]
    public class OrganizationTeamController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public OrganizationTeamController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        // GET api/organization/team
        [HttpGet]
        public async Task<IActionResult> Team()
        {
            var orgId = OrganizationOverviewController.OrganizationIdOf(User) ?? 0;
            var rows = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.AssignOrgId == orgId && a.Employee != null && a.Employee.User != null && a.Employee.User.IsActive == true)
                .Select(a => new
                {
                    employeeId = a.EmployeeId,
                    userId = a.Employee!.UserId,
                    hasPicture = a.Employee.User!.ProfilePicturePath != null,
                    fullName = a.Employee.User.Name,
                    since = a.StartDatetime,
                    until = a.ExpectedEndDatetime,
                    isMinimum = a.WorkforceRequestId == null,
                    skills = _db.EmployeeSkills.Where(s => s.EmpId == a.EmployeeId && s.Skill != null).Select(s => s.Skill!.Name).ToList(),
                }).OrderBy(r => r.fullName).ToListAsync();
            return Ok(rows);
        }
    }
}
