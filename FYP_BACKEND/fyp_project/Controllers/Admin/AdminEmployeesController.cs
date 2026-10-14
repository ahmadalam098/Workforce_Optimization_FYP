using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: employee management (list, details, create, update, activate/deactivate).</summary>
    [Route("api/admin/employees")]
    public class AdminEmployeesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly IdGenerator _ids;
        private readonly RoleService _roles;
        private readonly AuditService _audit;
        private readonly AccountMailer _mailer;

        public AdminEmployeesController(
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

        // GET api/admin/employees?search=&status=&organizationId=&active=&page=1&pageSize=10   (organizationId=0 means the central pool: employees without a home organization)
        [HttpGet]
        public async Task<IActionResult> List(
            string? search,
            string? status,
            int? organizationId,
            bool? active,
            int? skillId,
            int? shiftId,
            int page = 1,
            int pageSize = 10)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);

            var query = _db.Employees.AsNoTracking().AsQueryable();

            if (skillId.HasValue)
                query = query.Where(e => _db.EmployeeSkills.Any(s => s.EmpId == e.EmpId && s.SkillId == skillId.Value));

            if (shiftId.HasValue)
                query = query.Where(e => _db.EmployeeShifts.Any(a => a.EmpId == e.EmpId && a.ShiftId == shiftId.Value && a.EndDate == null));

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(e =>
                    (e.User!.Name != null && e.User.Name.Contains(term)) ||
                    (e.User.Email != null && e.User.Email.Contains(term)) ||
                    (e.User.Cnic != null && e.User.Cnic.Contains(term)) ||
                    (e.User.PhoneNo != null && e.User.PhoneNo.Contains(term)));
            }

            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(e => e.AvailabilityStatus == status);

            // The organization an employee "is in" is where they work right now (open allocation), otherwise their home organization.
            if (organizationId == 0)
                query = query.Where(e => e.OrgId == null && !_db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId));
            else if (organizationId.HasValue)
            {
                var orgId = organizationId.Value;
                query = query.Where(e =>
                    _db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId && a.AssignOrgId == orgId) ||
                    (e.OrgId == orgId && !_db.EmployeeAllocations.Where(AllocationLogic.IsOpen).Any(a => a.EmployeeId == e.EmpId)));
            }

            if (active == true)
                query = query.Where(e => e.User!.IsActive == true);
            else if (active == false)
                query = query.Where(e => e.User!.IsActive != true);

            var total = await query.CountAsync();

            var items = await query
                .OrderBy(e => e.User!.Name)
                .ThenBy(e => e.EmpId)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(e => new EmployeeListItemDto
                {
                    HasPicture = e.User!.ProfilePicturePath != null,
                    EmployeeId = e.EmpId,
                    UserId = e.UserId,
                    FullName = e.User!.Name,
                    Email = e.User.Email,
                    Phone = e.User.PhoneNo,
                    Cnic = e.User.Cnic,
                    Country = e.User.Country,
                    Age = e.User.Age,
                    OrganizationId = e.OrgId,
                    OrganizationName = e.Org != null ? e.Org.OrgName : null,
                    JoiningDate = e.JoiningDate,
                    AvailabilityStatus = e.AvailabilityStatus,
                    HourlyRate = e.HourlyRate,
                    Rating = e.Rating,
                    IsActive = e.User.IsActive == true,
                })
                .ToListAsync();

            await AttachSkillsAndShiftAsync(items);
            await AttachWorkingOrgAsync(items);

            return Ok(new PagedResult<EmployeeListItemDto>
            {
                Items = items,
                Total = total,
                Page = page,
                PageSize = pageSize,
            });
        }

        /// <summary>Adds where each employee works right now, so a pool employee who is allocated still shows where.</summary>
        private async Task AttachWorkingOrgAsync(List<EmployeeListItemDto> items)
        {
            if (items.Count == 0) return;
            var ids = items.Select(i => i.EmployeeId).ToList();

            var working = await _db.EmployeeAllocations
                .AsNoTracking()
                .Where(AllocationLogic.IsOpen)
                .Where(a => a.EmployeeId != null && ids.Contains(a.EmployeeId.Value))
                .Select(a => new { EmployeeId = a.EmployeeId!.Value, a.AssignOrgId, a.AllocationId, OrgName = a.AssignOrg != null ? a.AssignOrg.OrgName : null })
                .ToListAsync();

            foreach (var item in items)
            {
                var allocation = working.Where(w => w.EmployeeId == item.EmployeeId).OrderByDescending(w => w.AllocationId).FirstOrDefault();
                if (allocation == null) continue;
                item.WorkingOrgId = allocation.AssignOrgId;
                item.WorkingOrgName = allocation.OrgName;
                item.IsWorkingElsewhere = allocation.AssignOrgId != item.OrganizationId;
            }
        }

        private sealed record EmployeeSkillName(int EmpId, string Name);

        private sealed record EmployeeShiftName(int EmpId, string? Name);

        /// <summary>Adds the first 3 skills and the current shift to each list row (two small queries for the whole page).</summary>
        private async Task AttachSkillsAndShiftAsync(List<EmployeeListItemDto> items)
        {
            if (items.Count == 0) return;
            var ids = items.Select(i => i.EmployeeId).ToList();

            var skills = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeSkills
                    .AsNoTracking()
                    .Where(s => ids.Contains(s.EmpId))
                    .OrderBy(s => s.Skill!.Name)
                    .Select(s => new EmployeeSkillName(s.EmpId, s.Skill!.Name))
                    .ToListAsync(),
                new List<EmployeeSkillName>());

            var shifts = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeShifts
                    .AsNoTracking()
                    .Where(a => ids.Contains(a.EmpId) && a.EndDate == null)
                    .Select(a => new EmployeeShiftName(a.EmpId, a.Shift != null ? a.Shift.ShiftName : null))
                    .ToListAsync(),
                new List<EmployeeShiftName>());

            foreach (var item in items)
            {
                item.Skills = skills.Where(s => s.EmpId == item.EmployeeId).Select(s => (string?)s.Name).Take(3).ToList();
                item.ShiftName = shifts.FirstOrDefault(s => s.EmpId == item.EmployeeId)?.Name;
            }
        }

        // GET api/admin/employees/5
        [HttpGet("{employeeId:int}")]
        public async Task<IActionResult> Get(int employeeId)
        {
            var detail = await _db.Employees
                .AsNoTracking()
                .Where(e => e.EmpId == employeeId)
                .Select(e => new EmployeeDetailDto
                {
                    EmployeeId = e.EmpId,
                    UserId = e.UserId,
                    FullName = e.User!.Name,
                    Email = e.User.Email,
                    Phone = e.User.PhoneNo,
                    Cnic = e.User.Cnic,
                    Country = e.User.Country,
                    Age = e.User.Age,
                    OrganizationId = e.OrgId,
                    OrganizationName = e.Org != null ? e.Org.OrgName : null,
                    JoiningDate = e.JoiningDate,
                    AvailabilityStatus = e.AvailabilityStatus,
                    HourlyRate = e.HourlyRate,
                    Rating = e.Rating,
                    IsActive = e.User.IsActive == true,
                    CreatedAt = e.User.CreatedAt,
                })
                .FirstOrDefaultAsync();

            if (detail == null) return NotFoundMessage("Employee not found.");

            var one = new List<EmployeeListItemDto> { detail };
            await AttachWorkingOrgAsync(one);

            // Skills and shifts come from tables added by migration 003; show empty until it has been run.
            detail.SkillDetails = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeSkills
                    .AsNoTracking()
                    .Where(s => s.EmpId == employeeId)
                    .OrderBy(s => s.Skill!.Name)
                    .Select(s => new EmployeeSkillDto
                    {
                        SkillId = s.SkillId,
                        SkillName = s.Skill!.Name,
                        SkillCategory = s.Skill.Category,
                        EfficiencyLevel = s.Proficiency,
                        YearsOfExperience = s.YearsOfExperience,
                    })
                    .ToListAsync(),
                new List<EmployeeSkillDto>());
            detail.Skills = detail.SkillDetails.Select(s => s.SkillName).Take(3).ToList();

            detail.ShiftHistory = await SafeQuery.IfSchemaMissing(
                async () => await _db.EmployeeShifts
                    .AsNoTracking()
                    .Where(a => a.EmpId == employeeId)
                    .OrderByDescending(a => a.StartDate)
                    .ThenByDescending(a => a.AssignmentId)
                    .Take(10)
                    .Select(a => new EmployeeShiftDto
                    {
                        AssignmentId = a.AssignmentId,
                        ShiftId = a.ShiftId,
                        ShiftName = a.Shift != null ? a.Shift.ShiftName : null,
                        StartTime = a.Shift != null ? a.Shift.StartTime : null,
                        EndTime = a.Shift != null ? a.Shift.EndTime : null,
                        StartDate = a.StartDate,
                        EndDate = a.EndDate,
                    })
                    .ToListAsync(),
                new List<EmployeeShiftDto>());
            detail.CurrentShift = detail.ShiftHistory.FirstOrDefault(s => s.EndDate == null);
            detail.ShiftName = detail.CurrentShift?.ShiftName;

            detail.StatusHistory = await _db.EmployeeStatuses
                .AsNoTracking()
                .Where(s => s.EmpId == employeeId)
                .OrderByDescending(s => s.ChangedAt)
                .ThenByDescending(s => s.StatusHistoryId)
                .Take(20)
                .Select(s => new EmployeeStatusEventDto
                {
                    StatusHistoryId = s.StatusHistoryId,
                    OldStatus = s.OldStatus,
                    NewStatus = s.NewStatus,
                    ChangedAt = s.ChangedAt,
                    Reason = s.Reason,
                    ChangedBy = s.ChangedByNavigation != null ? s.ChangedByNavigation.Name : null,
                })
                .ToListAsync();

            detail.AllocationHistory = await _db.AllocationHistories
                .AsNoTracking()
                .Where(h => h.EmpId == employeeId)
                .OrderByDescending(h => h.ActionTime)
                .Take(20)
                .Select(h => new EmployeeAllocationEventDto
                {
                    AllocationHistoryId = h.AllocationHistoryId,
                    ActionType = h.ActionType,
                    ActionReason = h.ActionReason,
                    ActionTime = h.ActionTime,
                    FromOrganization = h.FromOrg != null ? h.FromOrg.OrgName : null,
                    ToOrganization = h.ToOrg != null ? h.ToOrg.OrgName : null,
                    IsAllocatedByAi = h.IsAllocatedByAi,
                })
                .ToListAsync();

            return Ok(detail);
        }

        /// <summary>Checks the skills and the shift sent with an employee. Returns an error result, or null when all is well.</summary>
        private async Task<IActionResult?> CheckSkillsAndShiftAsync(List<EmployeeSkillInput>? skills, int? shiftId)
        {
            if (skills != null)
            {
                if (skills.Count > 30) return FieldError("skills", "An employee can have at most 30 skills.");
                if (skills.Select(s => s.SkillId).Distinct().Count() != skills.Count) return FieldError("skills", "The same skill is listed twice.");
                if (skills.Any(s => !AdminEmployeeSkillsController.Proficiencies.Contains(s.Proficiency)))
                    return FieldError("skills", "Proficiency must be Beginner, Intermediate, Advanced or Expert.");

                var ids = skills.Select(s => s.SkillId).ToList();
                var found = await _db.SkillMasters.AsNoTracking().CountAsync(k => ids.Contains(k.SkillId));
                if (found != ids.Count) return FieldError("skills", "One or more of the selected skills do not exist.");
            }

            if (shiftId.HasValue && !await _db.Shifts.AnyAsync(sh => sh.ShiftId == shiftId.Value))
                return FieldError("shiftId", "The selected shift does not exist.");

            return null;
        }

        /// <summary>Makes the employee's skills exactly the list sent: adds new ones, updates listed ones, removes the rest.</summary>
        private async Task<List<string>> SyncSkillsAsync(int employeeId, List<EmployeeSkillInput> wanted)
        {
            var changes = new List<string>();
            var existing = await _db.EmployeeSkills.Include(e => e.Skill).Where(e => e.EmpId == employeeId).ToListAsync();
            var catalog = await _db.SkillMasters.AsNoTracking().ToDictionaryAsync(k => k.SkillId);
            var now = DateTime.UtcNow;

            foreach (var item in wanted)
            {
                var current = existing.FirstOrDefault(e => e.SkillId == item.SkillId);
                if (current == null)
                {
                    if (!catalog[item.SkillId].IsActive) continue; // a deactivated skill cannot be newly given
                    _db.EmployeeSkills.Add(new EmployeeSkill { EmpId = employeeId, SkillId = item.SkillId, Proficiency = item.Proficiency, YearsOfExperience = item.YearsOfExperience, CreatedAt = now });
                    changes.Add($"skill added: {catalog[item.SkillId].Name} ({item.Proficiency})");
                }
                else if (current.Proficiency != item.Proficiency || current.YearsOfExperience != item.YearsOfExperience)
                {
                    current.Proficiency = item.Proficiency;
                    current.YearsOfExperience = item.YearsOfExperience;
                    current.UpdatedAt = now;
                    changes.Add($"skill updated: {current.Skill?.Name} ({item.Proficiency})");
                }
            }

            var keep = wanted.Select(w => w.SkillId).ToHashSet();
            foreach (var gone in existing.Where(e => !keep.Contains(e.SkillId)))
            {
                _db.EmployeeSkills.Remove(gone);
                changes.Add($"skill removed: {gone.Skill?.Name}");
            }

            return changes;
        }

        /// <summary>Puts the employee on a shift (ending the old assignment, which stays in the history), or takes them off it.</summary>
        private async Task<string?> ApplyShiftAsync(int employeeId, int? shiftId, bool clear)
        {
            var current = await _db.EmployeeShifts.FirstOrDefaultAsync(a => a.EmpId == employeeId && a.EndDate == null);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);

            if (shiftId.HasValue)
            {
                if (current?.ShiftId == shiftId.Value) return null;
                if (current != null) current.EndDate = today;
                _db.EmployeeShifts.Add(new EmployeeShift { EmpId = employeeId, ShiftId = shiftId.Value, StartDate = today, AssignedBy = CurrentUserId, CreatedAt = DateTime.UtcNow });
                var name = await _db.Shifts.AsNoTracking().Where(sh => sh.ShiftId == shiftId.Value).Select(sh => sh.ShiftName).FirstOrDefaultAsync();
                return $"shift: {name}";
            }

            if (clear && current != null)
            {
                current.EndDate = today;
                return "shift removed";
            }

            return null;
        }

        // POST api/admin/employees
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateEmployeeRequest request)
        {
            var email = request.Email.Trim();
            var cnic = NormalizeCnic(request.Cnic);
            var status = string.IsNullOrWhiteSpace(request.AvailabilityStatus) ? "Available" : request.AvailabilityStatus.Trim();

            if (PasswordProblem(request.Password) is { } passwordError) return FieldError("password", passwordError);
            if (CnicProblem(cnic) is { } cnicError) return FieldError("cnic", cnicError);
            if (!AvailabilityStatuses.Contains(status)) return FieldError("availabilityStatus", "Unknown availability status.");

            if (request.OrganizationId.HasValue &&
                !await _db.Organizations.AnyAsync(o => o.OrgId == request.OrganizationId.Value))
                return FieldError("organizationId", "The selected organization does not exist.");

            if (await CheckSkillsAndShiftAsync(request.Skills, request.ShiftId) is { } skillProblem) return skillProblem;

            using var _ = await _ids.LockAsync();

            if (await _db.Users.AnyAsync(u => u.Email == email))
                return ConflictMessage("A user with this email already exists.");
            if (await _db.Users.AnyAsync(u => u.Cnic == cnic))
                return ConflictMessage("A user with this CNIC already exists.");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var role = await _roles.GetOrCreateAsync(RoleNames.Employee);
                var now = DateTime.UtcNow;

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
                    CreatedAt = now,
                };
                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                var employee = new Employee
                {
                    EmpId = await _ids.NextAsync(_db, "Employee", "emp_id"),
                    UserId = user.UserId,
                    RoleId = role.RoleId,
                    OrgId = request.OrganizationId,
                    JoiningDate = request.JoiningDate ?? DateOnly.FromDateTime(now),
                    AvailabilityStatus = status,
                    HourlyRate = request.HourlyRate,
                };
                _db.Employees.Add(employee);
                await _db.SaveChangesAsync();

                var statusEvent = new EmployeeStatus
                {
                    StatusHistoryId = await _ids.NextAsync(_db, "Employee_Status", "status_history_id"),
                    EmpId = employee.EmpId,
                    OldStatus = null,
                    NewStatus = status,
                    ChangedAt = now,
                    Reason = "Employee created",
                    ChangedBy = CurrentUserId,
                };
                _db.EmployeeStatuses.Add(statusEvent);
                await _db.SaveChangesAsync();

                employee.StatusHistoryId = statusEvent.StatusHistoryId;
                await _db.SaveChangesAsync();

                var setup = new List<string>();
                if (request.Skills is { Count: > 0 })
                {
                    setup.AddRange(await SyncSkillsAsync(employee.EmpId, request.Skills));
                }
                if (await ApplyShiftAsync(employee.EmpId, request.ShiftId, false) is { } shiftChange) setup.Add(shiftChange);
                await _db.SaveChangesAsync();

                await transaction.CommitAsync();

                await _audit.LogAsync(CurrentUserId, "EMPLOYEE_CREATED", "Employee", employee.EmpId,
                    $"Created employee {user.Name} ({user.Email})" + (setup.Count > 0 ? $" with {string.Join(", ", setup)}" : string.Empty));

                // The welcome email tells the employee what was set up for them.
                var details = new List<(string, string)>();
                if (request.OrganizationId.HasValue)
                {
                    var orgName = await _db.Organizations.AsNoTracking().Where(o => o.OrgId == request.OrganizationId.Value).Select(o => o.OrgName).FirstOrDefaultAsync();
                    if (orgName != null) details.Add(("Organization", orgName));
                }
                if (request.ShiftId.HasValue)
                {
                    var shift = await _db.Shifts.AsNoTracking().Where(sh => sh.ShiftId == request.ShiftId.Value).FirstOrDefaultAsync();
                    if (shift != null) details.Add(("Shift", $"{shift.ShiftName} ({shift.StartTime:HH\\:mm} - {shift.EndTime:HH\\:mm})"));
                }
                if (request.Skills is { Count: > 0 })
                {
                    var ids = request.Skills.Select(k => k.SkillId).ToList();
                    var names = await _db.SkillMasters.AsNoTracking().Where(k => ids.Contains(k.SkillId)).ToDictionaryAsync(k => k.SkillId, k => k.Name);
                    details.Add(("Skills", string.Join(", ", request.Skills.Select(k => $"{names.GetValueOrDefault(k.SkillId)} ({k.Proficiency})"))));
                }

                var emailNote = await _mailer.SendWelcomeAsync(CurrentUserId, user.UserId, user.Name ?? "there", user.Email ?? string.Empty, "Employee", null, details);

                return CreatedAtAction(nameof(Get), new { employeeId = employee.EmpId }, new
                {
                    message = "Employee created successfully." + emailNote,
                    employeeId = employee.EmpId,
                    userId = user.UserId,
                });
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "An error occurred while creating the employee." });
            }
        }

        // PUT api/admin/employees/5
        [HttpPut("{employeeId:int}")]
        public async Task<IActionResult> Update(int employeeId, [FromBody] UpdateEmployeeRequest request)
        {
            using var _ = await _ids.LockAsync();

            var employee = await _db.Employees
                .Include(e => e.User)
                .FirstOrDefaultAsync(e => e.EmpId == employeeId);

            if (employee?.User == null) return NotFoundMessage("Employee not found.");

            var user = employee.User;

            if (await CheckSkillsAndShiftAsync(request.Skills, request.ShiftId) is { } skillProblem) return skillProblem;

            var oldEmail = user.Email ?? string.Empty;
            var oldName = user.Name;
            var oldPhone = user.PhoneNo;
            var oldCountry = user.Country;
            var oldAge = user.Age;
            var oldOrgId = employee.OrgId;
            var emailChanged = false;

            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                var email = request.Email.Trim();
                if (await _db.Users.AnyAsync(u => u.UserId != user.UserId && u.Email == email))
                    return ConflictMessage("Another user already has this email.");
                emailChanged = !string.Equals(email, oldEmail, StringComparison.OrdinalIgnoreCase);
                user.Email = email;
            }

            if (!string.IsNullOrWhiteSpace(request.Cnic))
            {
                var cnic = NormalizeCnic(request.Cnic);
                if (CnicProblem(cnic) is { } cnicError) return FieldError("cnic", cnicError);
                if (await _db.Users.AnyAsync(u => u.UserId != user.UserId && u.Cnic == cnic))
                    return ConflictMessage("Another user already has this CNIC.");
                user.Cnic = cnic;
            }

            if (!string.IsNullOrWhiteSpace(request.FullName)) user.Name = request.FullName.Trim();
            if (request.Phone != null) user.PhoneNo = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            if (request.Country != null) user.Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim();
            if (request.Age.HasValue) user.Age = request.Age;

            if (request.ClearOrganization == true)
            {
                employee.OrgId = null;
            }
            else if (request.OrganizationId.HasValue)
            {
                if (!await _db.Organizations.AnyAsync(o => o.OrgId == request.OrganizationId.Value))
                    return FieldError("organizationId", "The selected organization does not exist.");
                employee.OrgId = request.OrganizationId;
            }

            if (request.JoiningDate.HasValue) employee.JoiningDate = request.JoiningDate;
            if (request.HourlyRate.HasValue) employee.HourlyRate = request.HourlyRate;

            var newStatus = request.AvailabilityStatus?.Trim();
            var statusChanged = !string.IsNullOrEmpty(newStatus) && newStatus != employee.AvailabilityStatus;
            if (statusChanged && !AvailabilityStatuses.Contains(newStatus!))
                return FieldError("availabilityStatus", "Unknown availability status.");

            var changes = new List<string>();
            if (user.Name != oldName) changes.Add($"name: {user.Name}");
            if (emailChanged) changes.Add($"sign-in email: {user.Email}");
            if (user.PhoneNo != oldPhone) changes.Add("phone number");
            if (user.Country != oldCountry) changes.Add($"country: {user.Country}");
            if (user.Age != oldAge) changes.Add($"age: {user.Age}");
            if (employee.OrgId != oldOrgId)
            {
                var orgName = employee.OrgId.HasValue ? await _db.Organizations.AsNoTracking().Where(o => o.OrgId == employee.OrgId.Value).Select(o => o.OrgName).FirstOrDefaultAsync() : null;
                changes.Add($"organization: {orgName ?? "central pool"}");
            }
            if (statusChanged) changes.Add($"availability: {newStatus}");

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                if (statusChanged)
                    await RecordStatusChangeAsync(employee, newStatus!, request.StatusReason ?? "Updated by admin");

                if (request.Skills != null) changes.AddRange(await SyncSkillsAsync(employeeId, request.Skills));
                if (await ApplyShiftAsync(employeeId, request.ShiftId, request.ClearShift == true) is { } shiftChange) changes.Add(shiftChange);

                await _db.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "An error occurred while updating the employee." });
            }

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_UPDATED", "Employee", employeeId,
                $"Updated employee {user.Name}" + (changes.Count > 0 ? $" ({string.Join(", ", changes)})" : string.Empty));

            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, user.UserId, PersonEvent.Updated, null, changes);
            if (emailChanged) emailNote += await _mailer.SendEmailChangedAsync(CurrentUserId, user.UserId, oldEmail);
            return Ok(new { message = "Employee updated successfully." + emailNote, employeeId, userId = user.UserId });
        }

        // DELETE api/admin/employees/5   (a deactivated employee and their account; refused while allocations, payroll, overtime or reviews exist)
        [HttpDelete("{employeeId:int}")]
        public async Task<IActionResult> Delete(int employeeId, [FromServices] EntityDeletion deletion)
        {
            var result = await deletion.DeleteEmployeeAsync(employeeId);
            if (!result.Ok) return DeleteAnswer(result);

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_DELETED", "Employee", employeeId, $"Deleted {result.Name} ({result.Email})");
            var emailNote = await _mailer.SendPersonDeletedAsync(CurrentUserId, 0, result.Name, result.Email, result.Role);
            return DeleteAnswer(result, emailNote);
        }

        // PATCH api/admin/employees/5/active   (deactivate first; a deactivated employee can then be deleted with DELETE)
        [HttpPatch("{employeeId:int}/active")]
        public async Task<IActionResult> SetActive(int employeeId, [FromBody] SetActiveRequest request)
        {
            using var _ = await _ids.LockAsync();

            var employee = await _db.Employees
                .Include(e => e.User)
                .FirstOrDefaultAsync(e => e.EmpId == employeeId);

            if (employee?.User == null) return NotFoundMessage("Employee not found.");

            var makeActive = request.IsActive == true;

            if (!makeActive)
            {
                var hasActiveAllocation = await _db.EmployeeAllocations.AnyAsync(a =>
                    a.EmployeeId == employeeId &&
                    a.ActualEndDatetime == null &&
                    (a.Status == "Active" || a.Status == "Assigned"));

                if (hasActiveAllocation)
                    return ConflictMessage("This employee has an active allocation. End or reassign it before deactivating.");
            }

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                employee.User.IsActive = makeActive;

                if (!makeActive && employee.AvailabilityStatus != "Offline")
                    await RecordStatusChangeAsync(employee, "Offline", request.Reason ?? "Employee deactivated");

                await _db.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { message = "An error occurred while updating the employee." });
            }

            await _audit.LogAsync(CurrentUserId, makeActive ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED",
                "Employee", employeeId, request.Reason ?? employee.User.Name);

            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, employee.User.UserId, makeActive ? PersonEvent.Activated : PersonEvent.Deactivated, request.Reason);

            return Ok(new
            {
                message = (makeActive ? "Employee activated." : "Employee deactivated.") + emailNote,
                employeeId,
                isActive = makeActive,
            });
        }

        // POST api/admin/employees/5/reset-password
        [HttpPost("{employeeId:int}/reset-password")]
        public async Task<IActionResult> ResetPassword(int employeeId, [FromBody] ResetPasswordRequest request)
        {
            if (PasswordProblem(request.NewPassword) is { } passwordError) return FieldError("newPassword", passwordError);

            var user = await _db.Employees
                .Where(e => e.EmpId == employeeId)
                .Select(e => e.User)
                .FirstOrDefaultAsync();

            if (user == null) return NotFoundMessage("Employee not found.");

            user.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_PASSWORD_RESET", "Employee", employeeId, user.Name);
            var emailNote = await _mailer.SendPersonEventAsync(CurrentUserId, user.UserId, PersonEvent.PasswordReset);
            return Ok(new { message = "Password has been reset." + emailNote });
        }

        // GET api/admin/employees/statuses
        [HttpGet("statuses")]
        public IActionResult Statuses() => Ok(AvailabilityStatuses);

        /// <summary>Adds an Employee_Status row and points the employee at it. Caller holds the id lock + transaction.</summary>
        private async Task RecordStatusChangeAsync(Employee employee, string newStatus, string reason)
        {
            var statusEvent = new EmployeeStatus
            {
                StatusHistoryId = await _ids.NextAsync(_db, "Employee_Status", "status_history_id"),
                EmpId = employee.EmpId,
                OldStatus = employee.AvailabilityStatus,
                NewStatus = newStatus,
                ChangedAt = DateTime.UtcNow,
                Reason = reason.Length > 255 ? reason[..255] : reason,
                ChangedBy = CurrentUserId,
            };
            _db.EmployeeStatuses.Add(statusEvent);
            await _db.SaveChangesAsync();

            employee.AvailabilityStatus = newStatus;
            employee.StatusHistoryId = statusEvent.StatusHistoryId;
        }
    }
}
