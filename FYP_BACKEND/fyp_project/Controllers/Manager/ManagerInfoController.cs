using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Manager
{
    /// <summary>
    /// Organization Manager portal: the information of the manager's organizations and of employees.
    /// An organization page shows the organization, its contract, its managers and the employees working for it.
    /// An employee page shows skills, shift, where they work and their allocation history. An employee who works for (or belongs to) one of
    /// the manager's organizations is shown with their contact details; any other pool employee only with what is needed to choose them.
    /// No CNIC or password is ever shown, and pay is only shown on the Salary status pages (ManagerSalariesController).
    /// </summary>
    [ApiController]
    [Authorize(Policy = "ManagerOnly")]
    [MissingMigrationFilter]
    [Route("api/manager")]
    public class ManagerInfoController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public ManagerInfoController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        private int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                            ?? User.FindFirst("nameid")?.Value
                            ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        private async Task<List<int>> MyOrganizationIdsAsync()
        {
            var me = CurrentUserId;
            return await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.UserId == me && m.OrgId != null)
                .Select(m => m.OrgId!.Value)
                .ToListAsync();
        }

        private async Task<object?> ActiveContractAsync(int orgId)
        {
            var contract = await _db.Contracts.AsNoTracking()
                .Where(c => c.OrgId == orgId && (c.Status == "Active" || c.Status == "Approved"))
                .OrderByDescending(c => c.ContractId)
                .FirstOrDefaultAsync();
            if (contract == null) return null;

            var version = await _db.ContractVersions.AsNoTracking().Where(v => v.ContractId == contract.ContractId).OrderByDescending(v => v.VersionNo).FirstOrDefaultAsync();
            return new
            {
                contractId = contract.ContractId,
                contractNumber = contract.ContractNumber,
                status = contract.Status,
                startDate = version?.StartDate,
                endDate = version?.EndDate,
                startTime = version?.StartTime,
                endTime = version?.EndTime,
                minEmployees = version?.MinEmployees ?? contract.MinEmployees,
                maxEmployees = version?.MaxEmployees ?? contract.MaxEmployees,
                borrowingAllowed = version?.BorrowingAllowed ?? contract.BorrowingAllowed,
                maxBorrowedEmployees = version?.MaxBorrowedEmployees,
                priorityLevel = version?.PriorityLevel ?? contract.PriorityLevel,
                billingCurrency = version?.BillingCurrency ?? contract.BillingCurrency,
                billingCycle = version?.BillingCycle,
            };
        }

        // GET api/manager/organizations
        [HttpGet("organizations")]
        public async Task<IActionResult> Organizations()
        {
            var orgIds = await MyOrganizationIdsAsync();
            var orgs = await _db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.OrgId)).OrderBy(o => o.OrgName).ToListAsync();

            var working = (await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.AssignOrgId != null && orgIds.Contains(a.AssignOrgId.Value))
                .GroupBy(a => a.AssignOrgId!.Value).Select(g => new { OrgId = g.Key, Count = g.Count() }).ToListAsync()).ToDictionary(x => x.OrgId, x => x.Count);
            var openTickets = (await _db.Tickets.AsNoTracking().Where(t => t.OrgId != null && orgIds.Contains(t.OrgId.Value) && t.Status != "Resolved" && t.Status != "Closed")
                .GroupBy(t => t.OrgId!.Value).Select(g => new { OrgId = g.Key, Count = g.Count() }).ToListAsync()).ToDictionary(x => x.OrgId, x => x.Count);

            var items = new List<object>();
            foreach (var org in orgs)
            {
                var contract = await ActiveContractAsync(org.OrgId);
                items.Add(new
                {
                    organizationId = org.OrgId,
                    name = org.OrgName,
                    email = org.Email,
                    phone = org.Phone,
                    country = org.Country,
                    status = org.Status,
                    employeesWorking = working.GetValueOrDefault(org.OrgId),
                    openTickets = openTickets.GetValueOrDefault(org.OrgId),
                    contract,
                });
            }
            return Ok(items);
        }

        // GET api/manager/organizations/5
        [HttpGet("organizations/{orgId:int}")]
        public async Task<IActionResult> Organization(int orgId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            if (!orgIds.Contains(orgId)) return NotFound(new { message = "Organization not found." });
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.OrgId == orgId);
            if (org == null) return NotFound(new { message = "Organization not found." });

            var managers = await _db.OrganizationManagers.AsNoTracking()
                .Where(m => m.OrgId == orgId && m.User != null)
                .Select(m => new { userId = m.UserId, fullName = m.User!.Name, email = m.User.Email, isActive = m.User.IsActive == true, isMe = m.UserId == CurrentUserId })
                .OrderBy(m => m.fullName)
                .ToListAsync();

            var employees = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen)
                .Where(a => a.AssignOrgId == orgId && a.Employee != null && a.Employee.User != null)
                .OrderBy(a => a.Employee!.User!.Name)
                .Select(a => new
                {
                    employeeId = a.EmployeeId,
                    userId = a.Employee!.UserId,
                    hasPicture = a.Employee.User!.ProfilePicturePath != null,
                    fullName = a.Employee.User.Name,
                    availabilityStatus = a.Employee.AvailabilityStatus,
                    homeOrgName = a.Employee.Org != null ? a.Employee.Org.OrgName : null,
                    isBorrowed = a.OwnerOrgId != null && a.OwnerOrgId != orgId,
                    since = a.StartDatetime,
                })
                .Take(200)
                .ToListAsync();

            var tickets = await _db.Tickets.AsNoTracking().Where(t => t.OrgId == orgId).Select(t => new { t.Status, t.Source, t.Category }).ToListAsync();
            var open = tickets.Where(t => t.Status != "Resolved" && t.Status != "Closed").ToList();

            return Ok(new
            {
                organizationId = org.OrgId,
                name = org.OrgName,
                email = org.Email,
                phone = org.Phone,
                address = org.Address,
                country = org.Country,
                status = org.Status,
                createdAt = org.CreatedAt,
                approvedAt = org.ApprovedAt,
                contract = await ActiveContractAsync(orgId),
                managers,
                employees,
                openQueries = open.Count(t => t.Source != "Employee" && t.Category == "Query"),
                openComplaints = open.Count(t => t.Source != "Employee" && t.Category == "Complaint"),
                openEmployeeQueries = open.Count(t => t.Source == "Employee"),
            });
        }

        // GET api/manager/employees/5
        [HttpGet("employees/{employeeId:int}")]
        public async Task<IActionResult> Employee(int employeeId)
        {
            var orgIds = await MyOrganizationIdsAsync();
            var employee = await _db.Employees.AsNoTracking().Include(e => e.User).Include(e => e.Org).FirstOrDefaultAsync(e => e.EmpId == employeeId && e.User != null && e.User.IsActive == true);
            if (employee == null) return NotFound(new { message = "Employee not found." });

            var open = await _db.EmployeeAllocations.AsNoTracking().Where(AllocationLogic.IsOpen).Where(a => a.EmployeeId == employeeId)
                .Select(a => new { a.AllocationId, a.AssignOrgId, OrgName = a.AssignOrg != null ? a.AssignOrg.OrgName : null, a.OwnerOrgId, a.StartDatetime, a.ExpectedEndDatetime })
                .OrderByDescending(a => a.AllocationId).FirstOrDefaultAsync();

            // "Mine": works for one of my organizations now, or (when free) belongs to one.
            var isMine = open != null ? open.AssignOrgId != null && orgIds.Contains(open.AssignOrgId.Value) : employee.OrgId != null && orgIds.Contains(employee.OrgId.Value);

            var skills = await _db.EmployeeSkills.AsNoTracking().Where(s => s.EmpId == employeeId)
                .Select(s => new { name = s.Skill != null ? s.Skill.Name : null, proficiency = s.Proficiency, years = s.YearsOfExperience })
                .OrderBy(s => s.name).ToListAsync();
            var shift = await _db.EmployeeShifts.AsNoTracking().Where(s => s.EmpId == employeeId && s.EndDate == null)
                .Select(s => s.Shift != null ? new { name = s.Shift.ShiftName, start = s.Shift.StartTime, end = s.Shift.EndTime } : null).FirstOrDefaultAsync();

            // What happened with this employee in the manager's own organizations.
            var history = await _db.AllocationHistories.AsNoTracking()
                .Where(h => h.EmpId == employeeId && ((h.FromOrgId != null && orgIds.Contains(h.FromOrgId.Value)) || (h.ToOrgId != null && orgIds.Contains(h.ToOrgId.Value))))
                .OrderByDescending(h => h.ActionTime).Take(15)
                .Select(h => new
                {
                    h.AllocationHistoryId,
                    h.ActionType,
                    h.ActionReason,
                    h.ActionTime,
                    from = h.FromOrg != null ? h.FromOrg.OrgName : null,
                    to = h.ToOrg != null ? h.ToOrg.OrgName : null,
                    isAi = h.IsAllocatedByAi,
                })
                .ToListAsync();

            var queries = employee.UserId == null ? new List<object>() : (await _db.Tickets.AsNoTracking()
                .Where(t => t.Source == "Employee" && t.RaisedByUserId == employee.UserId && t.OrgId != null && orgIds.Contains(t.OrgId.Value))
                .OrderByDescending(t => t.CreatedAt).Take(10)
                .Select(t => new { t.TicketId, t.TicketNumber, t.Subject, t.Priority, status = t.Status == "Closed" ? "Resolved" : t.Status, t.CreatedAt })
                .ToListAsync()).Cast<object>().ToList();

            return Ok(new
            {
                employeeId = employee.EmpId,
                userId = employee.UserId,
                hasPicture = employee.User!.ProfilePicturePath != null,
                fullName = employee.User.Name,
                isMine,
                // Contact details only for the manager's own employees.
                email = isMine ? employee.User.Email : null,
                phone = isMine ? employee.User.PhoneNo : null,
                country = isMine ? employee.User.Country : null,
                availabilityStatus = employee.AvailabilityStatus,
                rating = employee.Rating,
                joiningDate = employee.JoiningDate,
                homeOrgName = employee.Org?.OrgName,
                isAllocated = open != null,
                allocationId = open?.AllocationId,
                workingOrgId = open?.AssignOrgId,
                workingOrgName = open?.OrgName,
                isBorrowed = open != null && open.OwnerOrgId != null && open.OwnerOrgId != open.AssignOrgId,
                workingSince = open?.StartDatetime,
                expectedEnd = open?.ExpectedEndDatetime,
                canManage = open != null && open.AssignOrgId != null && orgIds.Contains(open.AssignOrgId.Value),
                shift,
                skills,
                history,
                queries,
            });
        }
    }
}
