using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public static class SettingKind
    {
        public const string Int = "int";
        public const string Bool = "bool";
        public const string Text = "text";
        public const string Choice = "choice";
    }

    /// <summary>
    /// One admin-editable setting. Every value is stored as text in System_Setting; <paramref name="Kind"/> says how it is read.
    /// For int settings Min/Max are the allowed numbers, for text settings they are the allowed length, for choices the value must be one of Options.
    /// </summary>
    public record SettingDefinition(
        string Key, string Section, string Group, string Label, string Description, string Kind, string Default,
        string Unit = "", int Min = 0, int Max = 0, (string Value, string Label)[]? Options = null)
    {
        /// <summary>Returns a readable problem with <paramref name="raw"/>, or null when it is allowed. <paramref name="clean"/> is the value to store.</summary>
        public string? Check(string? raw, out string clean)
        {
            var text = (raw ?? string.Empty).Trim();
            clean = text;
            switch (Kind)
            {
                case SettingKind.Int:
                    if (!int.TryParse(text, out var number)) return $"{Label} must be a whole number.";
                    if (number < Min || number > Max) return $"{Label} must be between {Min} and {Max} {Unit}.".Replace("  ", " ").Trim();
                    clean = number.ToString();
                    return null;
                case SettingKind.Bool:
                    if (text is not ("true" or "false")) return $"{Label} must be on or off.";
                    return null;
                case SettingKind.Choice:
                    if (Options == null || !Options.Any(o => o.Value == text)) return $"Choose one of the listed options for {Label}.";
                    return null;
                default:
                    if (text.Length < Min || text.Length > Max) return $"{Label} must have {Min} to {Max} characters.";
                    return null;
            }
        }
    }

    /// <summary>Admin-editable system settings, shown in the Settings page tabs.</summary>
    public static class SettingsCatalog
    {

        public const string Timezone = "TIMEZONE";
        public const string DateFormat = "DATE_FORMAT";
        public const string TimeFormat = "TIME_FORMAT";
        public const string Language = "LANGUAGE";

        public const string NotifyEmail = "NOTIFY_EMAIL";
        public const string NotifyInApp = "NOTIFY_INAPP";
        public const string NotifyWorkforce = "NOTIFY_WORKFORCE";
        public const string NotifyContractExpiryDays = "NOTIFY_CONTRACT_EXPIRY_DAYS";




        public const string General = "General";
        public const string Notifications = "Notifications";

        public static readonly SettingDefinition[] All =
        {
            // ---- General
            new(Timezone, General, "Date and time", "Timezone", "The timezone that dates and times are shown in. \"This computer\" uses each person's own timezone.", SettingKind.Choice, "auto", Options: new[]
            {
                ("auto", "This computer's timezone"), ("UTC", "UTC"), ("Asia/Karachi", "Pakistan (Karachi)"), ("Asia/Dubai", "UAE (Dubai)"),
                ("Asia/Riyadh", "Saudi Arabia (Riyadh)"), ("Europe/London", "United Kingdom (London)"), ("America/New_York", "USA (New York)"),
            }),
            new(DateFormat, General, "Date and time", "Date format", "How dates are written.", SettingKind.Choice, "dmy-short", Options: new[]
            {
                ("dmy-short", "15 Oct 2026"), ("dmy", "15/10/2026"), ("mdy", "10/15/2026"), ("iso", "2026-10-15"),
            }),
            new(TimeFormat, General, "Date and time", "Time format", "12-hour (3:30 PM) or 24-hour (15:30) clock.", SettingKind.Choice, "12h", Options: new[] { ("12h", "12-hour"), ("24h", "24-hour") }),
            new(Language, General, "Language", "Language", "The language of the portal and how month names are written. The portal text is currently available in English only.", SettingKind.Choice, "en-GB", Options: new[]
            {
                ("en-GB", "English (UK)"), ("en-US", "English (US)"),
            }),

            // ---- Notifications
            new(NotifyEmail, Notifications, "Channels", "Email notifications", "Emails to people and organizations when an account, organization or query changes. Switching this off stops these emails (password-reset codes are still sent).", SettingKind.Bool, "true"),
            new(NotifyInApp, Notifications, "Channels", "In-app notifications", "The bell in the top bar.", SettingKind.Bool, "true"),
            new(NotifyWorkforce, Notifications, "Alerts", "Workforce alerts", "Show employee, shift, skill, allocation and staff request activity in the bell.", SettingKind.Bool, "true"),
            new(NotifyContractExpiryDays, Notifications, "Alerts", "Contract expiry alert", "Warn in the bell when an active contract ends within this many days. 0 switches the alert off.", SettingKind.Int, "30", "days", 0, 365),



        };

        public static SettingDefinition? Find(string key) => All.FirstOrDefault(s => s.Key == key);
    }

    public static class SettingsReader
    {
        /// <summary>The stored text of a setting that passes its checks, or its built-in default (also when the table is not created yet).</summary>
        public static async Task<string> GetAsync(WorkforceManagementDbContext db, string key)
        {
            var definition = SettingsCatalog.Find(key) ?? throw new ArgumentException("Unknown setting.", nameof(key));
            var stored = await SafeQuery.IfSchemaMissing(
                () => db.SystemSettings.AsNoTracking().Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(),
                null);
            return stored != null && definition.Check(stored, out var clean) == null ? clean : definition.Default;
        }

        public static async Task<int> GetIntAsync(WorkforceManagementDbContext db, string key) =>
            int.TryParse(await GetAsync(db, key), out var value) ? value : int.Parse(SettingsCatalog.Find(key)!.Default);

        public static async Task<bool> GetBoolAsync(WorkforceManagementDbContext db, string key) => await GetAsync(db, key) == "true";
    }

    /// <summary>The password rules for every new password.</summary>
    public static class PasswordPolicy
    {
        public const int MinLength = 8;

        /// <summary>A readable problem with the password, or null when it follows the rules.</summary>
        public static string? Problem(string? password)
        {
            if (string.IsNullOrEmpty(password) || password.Length < MinLength) return $"Password must be at least {MinLength} characters.";
            if (password.Length > 100) return "Password must be at most 100 characters.";
            if (password.Any(char.IsWhiteSpace)) return "Password cannot contain spaces.";
            if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit)) return "Password must contain at least one letter and one number.";
            return null;
        }
    }
}
