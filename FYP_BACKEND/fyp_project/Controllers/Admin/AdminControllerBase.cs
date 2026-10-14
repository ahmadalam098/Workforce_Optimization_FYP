using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Base for every Admin portal API: requires a signed-in user with the Admin role.</summary>
    [ApiController]
    [Authorize(Policy = "AdminOnly")]
    [MissingMigrationFilter]
    public abstract class AdminControllerBase : ControllerBase
    {
        public static readonly string[] AvailabilityStatuses =
        {
            "Available", "Assigned", "Busy", "Idle", "OnBreak", "Offline", "OnLeave",
        };

        private static readonly Regex CnicPattern = new(@"^\d{5}-\d{7}-\d$", RegexOptions.Compiled);

        protected int? CurrentUserId
        {
            get
            {
                var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                            ?? User.FindFirst("nameid")?.Value
                            ?? User.FindFirst("sub")?.Value;
                return int.TryParse(value, out var id) ? id : null;
            }
        }

        protected IActionResult FieldError(string field, string message) =>
            BadRequest(new
            {
                message,
                errors = new Dictionary<string, string[]> { [field] = new[] { message } },
            });

        protected IActionResult NotFoundMessage(string message) => NotFound(new { message });

        protected IActionResult ConflictMessage(string message) => Conflict(new { message });

        /// <summary>Returns an error message for an invalid password (the rules are chosen in Settings), or null when valid.</summary>
        protected static string? PasswordProblem(string? password) => fyp_project.Services.PasswordPolicy.Problem(password);

        /// <summary>Trims a CNIC and writes a 13-digit one in the usual 12345-1234567-1 form, so the same CNIC is never stored two ways.</summary>
        protected static string NormalizeCnic(string? cnic)
        {
            var text = (cnic ?? string.Empty).Trim();
            var digits = new string(text.Where(char.IsDigit).ToArray());
            return digits.Length == 13 && text.All(c => char.IsDigit(c) || c == '-')
                ? $"{digits[..5]}-{digits[5..12]}-{digits[12..]}"
                : text;
        }

        protected static string? CnicProblem(string? cnic) =>
            string.IsNullOrWhiteSpace(cnic) || !CnicPattern.IsMatch(cnic.Trim())
                ? "CNIC must have 13 digits, like 12345-1234567-1."
                : null;

        protected static (int page, int pageSize) NormalizePaging(int page, int pageSize) =>
            (Math.Max(page, 1), Math.Clamp(pageSize, 1, 100));
    }
}
