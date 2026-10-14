using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace fyp_project.Validation
{
    // Field rules shared by the Admin APIs. They match the checks in the website (FYP_FRONTEND/src/utils/validators.js),
    // because the website alone can never be trusted. An empty value passes here: add [Required] to make a field mandatory.

    public abstract class TextRuleAttribute : ValidationAttribute
    {
        protected abstract bool IsValid(string text);

        protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
        {
            if (value is not string text || string.IsNullOrWhiteSpace(text)) return ValidationResult.Success;
            return IsValid(text.Trim()) ? ValidationResult.Success : new ValidationResult(ErrorMessage);
        }
    }

    /// <summary>Letters, spaces and . ' - only, 2 to 100 characters.</summary>
    public sealed class PersonNameAttribute : TextRuleAttribute
    {
        private static readonly Regex Pattern = new(@"^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$", RegexOptions.Compiled);

        public PersonNameAttribute() => ErrorMessage = "Name can only contain letters, spaces and . ' - and must have at least 2 characters.";

        protected override bool IsValid(string text) => text.Length is >= 2 and <= 100 && Pattern.IsMatch(text);
    }

    /// <summary>Letters, numbers, spaces and & . , ' ( ) / - only, 2 to 150 characters.</summary>
    public sealed class OrganizationNameAttribute : TextRuleAttribute
    {
        private static readonly Regex Pattern = new(@"^[\p{L}\p{N}][\p{L}\p{N}\s&.,'’()/-]*$", RegexOptions.Compiled);

        public OrganizationNameAttribute() => ErrorMessage = "Organization name can only contain letters, numbers, spaces and & . , ' ( ) / - and must have at least 2 characters.";

        protected override bool IsValid(string text) => text.Length is >= 2 and <= 150 && Pattern.IsMatch(text);
    }

    /// <summary>Letters and spaces, 2 to 100 characters.</summary>
    public sealed class CountryNameAttribute : TextRuleAttribute
    {
        private static readonly Regex Pattern = new(@"^[\p{L}\p{M}][\p{L}\p{M}\s.'’()-]*$", RegexOptions.Compiled);

        public CountryNameAttribute() => ErrorMessage = "Country can only contain letters and spaces.";

        protected override bool IsValid(string text) => text.Length is >= 2 and <= 100 && Pattern.IsMatch(text);
    }

    /// <summary>Digits, spaces and + - ( ) only; 7 to 15 digits.</summary>
    public sealed class PhoneNumberAttribute : TextRuleAttribute
    {
        private static readonly Regex Pattern = new(@"^\+?[\d\s()-]+$", RegexOptions.Compiled);

        public PhoneNumberAttribute() => ErrorMessage = "Phone must have 7 to 15 digits and can only contain digits, spaces and + - ( ).";

        protected override bool IsValid(string text)
        {
            if (text.Length > 20 || !Pattern.IsMatch(text)) return false;
            var digits = text.Count(char.IsDigit);
            return digits is >= 7 and <= 15;
        }
    }

    /// <summary>Pakistani CNIC: 13 digits, written 12345-1234567-1 (dashes optional).</summary>
    public sealed class CnicAttribute : TextRuleAttribute
    {
        private static readonly Regex Pattern = new(@"^\d{5}-?\d{7}-?\d$", RegexOptions.Compiled);

        public CnicAttribute() => ErrorMessage = "CNIC must have 13 digits, like 12345-1234567-1.";

        protected override bool IsValid(string text) => Pattern.IsMatch(text);
    }

    /// <summary>8 to 100 characters, at least one letter and one number, no spaces.</summary>
    public sealed class StrongPasswordAttribute : ValidationAttribute
    {
        public StrongPasswordAttribute() => ErrorMessage = "Password must be 8 to 100 characters with at least one letter and one number, and no spaces.";

        public static bool Check(string? password) => fyp_project.Services.PasswordPolicy.Problem(password) == null;

        // The message states the rules currently chosen in Settings (shortest length, capital letter, symbol).
        protected override ValidationResult? IsValid(object? value, ValidationContext validationContext) =>
            value is string text && fyp_project.Services.PasswordPolicy.Problem(text) is { } problem ? new ValidationResult(problem) : ValidationResult.Success;
    }

    /// <summary>Text with at least a minimum number of characters once the spaces at both ends are removed.</summary>
    public sealed class MinTrimmedLengthAttribute : ValidationAttribute
    {
        private readonly int _min;

        public MinTrimmedLengthAttribute(int min)
        {
            _min = min;
            ErrorMessage = $"Must have at least {min} characters.";
        }

        protected override ValidationResult? IsValid(object? value, ValidationContext validationContext) =>
            value is string text && text.Trim().Length > 0 && text.Trim().Length < _min ? new ValidationResult(ErrorMessage) : ValidationResult.Success;
    }
}
