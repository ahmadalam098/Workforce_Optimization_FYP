using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: Organization Managers and the organizations they handle (one or as many as the admin gives).</summary>
    [Route("api/admin/managers")]
    public class AdminManagersController : AdminControllerBase
    {

        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly RoleService _roles;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminManagersController(
            WorkforceManagementDbContext db,
            IdGenerator ids,
            RoleService roles,
            AuditService audit,
            AccountMailer mailer)
        {
            _db = db;
            _ids = ids;
            _roles = roles;
            _audit = audit;
            _mailer = mailer;
        }

        // GET api/admin/managers?search=&active=&page=1&pageSize=10
        [HttpGet]
        public async Task<IActionResult> List(string? search, bool? active, int page = 1, int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var roleIds = await _roles.FindRoleIdsAsync(RoleNames.OrganizationManager);
            var query = _db.Users.AsNoTracking()
                .Where(u => u.RoleId != null && roleIds.Contains(u.RoleId.Value));

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(u =>
                    (u.Name != null && u.Name.Contains(term)) ||
                    (u.Email != null && u.Email.Contains(term)) ||
                    (u.Cnic != null && u.Cnic.Contains(term)));
            }

            if (active == true) query = query.Where(u => u.IsActive == true);
            else if (active == false) query = query.Where(u => u.IsActive != true);

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(u => u.Name)
                .ThenBy(u => u.UserId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new ManagerListItemDto
                {
                    HasPicture = u.ProfilePicturePath != null,
                    UserId = u.UserId,
                    FullName = u.Name,
                    Email = u.Email,
                    Phone = u.PhoneNo,
                    Cnic = u.Cnic,
                    Country = u.Country,
                    Age = u.Age,
                    RoleName = u.Role != null ? u.Role.RoleType : null,
                    IsActive = u.IsActive == true,
                    CreatedAt = u.CreatedAt,
                    Organizations = u.OrganizationManagers
                        .Select(m => new ManagerOrganizationDto
                        {
                            ManagerId = m.ManagerId,
                            OrganizationId = m.OrgId,
                            OrganizationName = m.Org != null ? m.Org.OrgName : null,
                        })
                        .ToList(),
                })
                .ToListAsync();

            return Ok(new PagedResult<ManagerListItemDto> { Items = items, Total = total, Page = page, PageSize = pageSize });
        }

        // POST api/admin/managers
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateManagerRequest request)
        {
            var email = request.Email.Trim();
            var cnic = NormalizeCnic(request.Cnic);
            var organizationIds = request.OrganizationIds.Distinct().ToList();

            if (PasswordProblem(request.Password) is { } passwordError) return FieldError("password", passwordError);
            if (CnicProblem(cnic) is { } cnicError) return FieldError("cnic", cnicError);

            var existingOrgs = await _db.Organizations.CountAsync(o => organizationIds.Contains(o.OrgId));
            if (existingOrgs != organizationIds.Count)
                return FieldError("organizationIds", "One or more selected organizations do not exist.");

            using var _ = await _ids.LockAsync();

            if (await _db.Users.AnyAsync(u => u.Email == email))
                return ConflictMessage("A user with this email already exists.");
            if (await _db.Users.AnyAsync(u => u.Cnic == cnic))
                return ConflictMessage("A user with this CNIC already exists.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var role = await _roles.GetOrCreateAsync(RoleNames.OrganizationManager);
                var user = new User
                {
                    UserId = await _ids.NextAsync(_db, "User", "user_id"),
                    Name = request.FullName.Trim(),
                    Email = email,
                    PhoneNo = request.Phone?.Trim(),
                    Cnic = cnic,
                    Age = request.Age,
                    Country = request.Country?.Trim(),
                    Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
                    RoleId = role.RoleId,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                };
                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                await AddAssignmentsAsync(user.UserId, organizationIds);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                await _audit.LogAsync(CurrentUserId, "MANAGER_CREATED", "User", user.UserId,
                    $"Created organization manager {user.Name} with {organizationIds.Count} organization(s)");

                var orgNames = await _db.Organizations.AsNoTracking().Where(o => organizationIds.Contains(o.OrgId)).Select(o => o.OrgName).ToListAsync();
                var emailNote = await _mailer.SendWelcomeAsync(CurrentUserId, user.UserId, user.Name ?? "there", user.Email ?? string.Empty, "Organization Manager", string.Join(", ", orgNames));
                return Ok(new { message = "Organization manager created." + emailNote, userId = user.UserId });
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "An error occurred while creating the manager." });
            }
        }

        // PUT api/admin/managers/5/organizations   (replaces the full assignment list)
        [HttpPut("{userId:int}/organizations")]
        public async Task<IActionResult> SetOrganizations(int userId, [FromBody] AssignOrganizationsRequest request)
        {
            var organizationIds = request.OrganizationIds.Distinct().ToList();


            var roleIds = await _roles.FindRoleIdsAsync(RoleNames.OrganizationManager);
            var isManager = await _db.Users.AnyAsync(u => u.UserId == userId && u.RoleId != null && roleIds.Contains(u.RoleId.Value));
            if (!isManager) return NotFoundMessage("Organization manager not found.");

            var existingOrgs = await _db.Organizations.CountAsync(o => organizationIds.Contains(o.OrgId));
            if (existingOrgs != organizationIds.Count)
                return FieldError("organizationIds", "One or more selected organizations do not exist.");

            using var _ = await _ids.LockAsync();

            var current = await _db.OrganizationManagers.Where(m => m.UserId == userId).ToListAsync();
            var toRemove = current.Where(m => m.OrgId == null || !organizationIds.Contains(m.OrgId.Value)).ToList();

            foreach (var assignment in toRemove)
            {
                if (await _db.Overtimes.AnyAsync(o => o.ApprovedBy == assignment.ManagerId))
                    return ConflictMessage("An assignment cannot be removed because overtime records were approved under it.");
            }

            var currentOrgIds = current.Where(m => m.OrgId != null).Select(m => m.OrgId!.Value).ToHashSet();
            var toAdd = organizationIds.Where(id => !currentOrgIds.Contains(id)).ToList();

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                _db.OrganizationManagers.RemoveRange(toRemove);
                await AddAssignmentsAsync(userId, toAdd);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "An error occurred while updating the assignments." });
            }

            await _audit.LogAsync(CurrentUserId, "MANAGER_ORGANIZATIONS_UPDATED", "User", userId,
                $"Now handling {organizationIds.Count} organization(s)");

            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, userId, PersonEvent.OrganizationsChanged);
            return Ok(new { message = "Organizations updated." + emailNote, userId, count = organizationIds.Count });
        }

        /// <summary>Adds Organization_Manager rows with sequential ids. Caller holds the id lock.</summary>
        private async Task AddAssignmentsAsync(int userId, List<int> organizationIds)
        {
            if (organizationIds.Count == 0) return;

            var nextId = await _ids.NextAsync(_db, "Organization_Manager", "manager_id");
            foreach (var organizationId in organizationIds)
            {
                _db.OrganizationManagers.Add(new OrganizationManager
                {
                    ManagerId = nextId++,
                    UserId = userId,
                    OrgId = organizationId,
                });
            }
        }
    }
}
