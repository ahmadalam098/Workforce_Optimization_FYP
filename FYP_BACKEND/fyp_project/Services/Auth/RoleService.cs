using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public static class RoleNames
    {
        public const string Admin = "Admin";
        public const string BusinessOwner = "Business Owner";
        public const string OrganizationManager = "Organization Manager";
        public const string Employee = "Employee";

        // "Business Owner", "business_owner" and "BusinessOwner" all mean the same role.
        public static string Normalize(string? name) =>
            new string((name ?? string.Empty).Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

        public static IReadOnlyList<string> Aliases(string canonical) => Normalize(canonical) switch
        {
            "organizationmanager" => new[] { "organizationmanager", "manager", "orgmanager" },
            "businessowner" => new[] { "businessowner", "owner" },
            var other => new[] { other },
        };
    }

    public class RoleService
    {
        private readonly WorkforceManagementDbContext _context;
        private readonly IdGenerator _ids;

        public RoleService(WorkforceManagementDbContext context, IdGenerator ids)
        {
            _context = context;
            _ids = ids;
        }

        public async Task<List<int>> FindRoleIdsAsync(string canonicalName)
        {
            var aliases = RoleNames.Aliases(canonicalName);
            var roles = await _context.Roles.AsNoTracking().ToListAsync();
            return roles
                .Where(r => aliases.Contains(RoleNames.Normalize(r.RoleType)))
                .Select(r => r.RoleId)
                .ToList();
        }

        /// <summary>Returns the role, creating it if missing. Caller must hold the IdGenerator lock.</summary>
        public async Task<Role> GetOrCreateAsync(string canonicalName)
        {
            var aliases = RoleNames.Aliases(canonicalName);
            var roles = await _context.Roles.ToListAsync();
            var existing = roles.FirstOrDefault(r => aliases.Contains(RoleNames.Normalize(r.RoleType)));
            if (existing != null) return existing;

            var role = new Role
            {
                RoleId = await _ids.NextAsync(_context, "Role", "role_id"),
                RoleType = canonicalName,
                Description = $"{canonicalName} role",
                AssignAt = DateTime.UtcNow,
            };
            _context.Roles.Add(role);
            await _context.SaveChangesAsync();
            return role;
        }
    }
}
