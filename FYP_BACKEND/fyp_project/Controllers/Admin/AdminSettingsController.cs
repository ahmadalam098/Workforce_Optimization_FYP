using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: system settings. Every value is checked against the allowed range; resetting removes the stored value.</summary>
    [Route("api/admin/settings")]
    public class AdminSettingsController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public AdminSettingsController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // GET api/admin/settings
        [HttpGet]
        public async Task<IActionResult> List()
        {
            var stored = await _db.SystemSettings.AsNoTracking().ToListAsync();
            var editors = stored.Where(s => s.UpdatedBy != null).Select(s => s.UpdatedBy!.Value).Distinct().ToList();
            var names = await _db.Users.AsNoTracking().Where(u => editors.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);

            var items = SettingsCatalog.All.Select(def =>
            {
                var row = stored.FirstOrDefault(s => s.Key == def.Key);
                var valid = row != null && def.Check(row.Value, out _) == null;
                var value = def.Default;
                if (valid) def.Check(row!.Value, out value);
                return new SettingDto
                {
                    Key = def.Key,
                    Section = def.Section,
                    Group = def.Group,
                    Label = def.Label,
                    Description = def.Description,
                    Kind = def.Kind,
                    Unit = def.Unit,
                    Value = value,
                    Default = def.Default,
                    Min = def.Min,
                    Max = def.Max,
                    Options = (def.Options ?? Array.Empty<(string Value, string Label)>()).Select(o => new SettingOptionDto { Value = o.Value, Label = o.Label }).ToList(),
                    IsDefault = !valid || value == def.Default,
                    UpdatedAt = valid ? row!.UpdatedAt : null,
                    UpdatedBy = valid && row!.UpdatedBy != null && names.TryGetValue(row.UpdatedBy.Value, out var name) ? name : null,
                };
            });

            return Ok(items);
        }

        // PUT api/admin/settings/REQUEST_MAX_EMPLOYEES   { "value": "50" }   (value null = back to default)
        [HttpPut("{key}")]
        public async Task<IActionResult> Save(string key, [FromBody] SaveSettingRequest request)
        {
            var def = SettingsCatalog.Find(key);
            if (def == null) return NotFoundMessage("Unknown setting.");

            string? clean = null;
            if (request.Value != null)
            {
                if (def.Check(request.Value, out var cleaned) is { } problem) return FieldError("value", problem);
                clean = cleaned;
            }

            var row = await _db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key);
            var before = row?.Value ?? def.Default;

            if (clean == null)
            {
                if (row != null) _db.SystemSettings.Remove(row);
            }
            else if (row == null)
            {
                _db.SystemSettings.Add(new SystemSetting { Key = key, Value = clean, UpdatedBy = CurrentUserId, UpdatedAt = DateTime.UtcNow });
            }
            else
            {
                row.Value = clean;
                row.UpdatedBy = CurrentUserId;
                row.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();

            var after = clean ?? def.Default;
            await _audit.LogAsync(CurrentUserId, "SETTING_CHANGED", "Setting", key,
                $"{def.Label}: {before} -> {after} {def.Unit}".TrimEnd() + (clean != null ? string.Empty : " (reset to default)"));
            return Ok(new { message = clean != null ? "Setting saved." : "Setting reset to its default." });
        }
    }
}
