using fyp_project.DTOs.Admin;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    /// <summary>Shared rules for contract terms, versions and statuses.</summary>
    public static class ContractLogic
    {
        public static readonly string[] Priorities = { "Low", "Medium", "High", "Critical" };
        public static readonly string[] BillingCycles = { "Weekly", "Biweekly", "Monthly", "Quarterly" };
        public static readonly string[] RuleCategories = { "Staffing", "Borrowing", "Payment", "Operational" };

        public const string Pending = "Pending";
        public const string Active = "Active";
        public const string Rejected = "Rejected";
        public const string Terminated = "Terminated";
        public const string Suspended = "Suspended";

        /// <summary>Older rows may use "Approved" for an approved organization or contract.</summary>
        public static bool IsActiveStatus(string? status) =>
            string.Equals(status, Active, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "Approved", StringComparison.OrdinalIgnoreCase);

        public static bool IsStatus(string? status, string expected) =>
            string.Equals(status, expected, StringComparison.OrdinalIgnoreCase);

        /// <summary>Returns field -> message for every invalid term (empty when valid).</summary>
        public static Dictionary<string, string> Validate(ContractTermsDto t)
        {
            var errors = new Dictionary<string, string>();

            if (t.MinEmployees.HasValue && t.MaxEmployees.HasValue && t.MaxEmployees < t.MinEmployees)
                errors["maxEmployees"] = "Maximum employees cannot be less than minimum employees.";

            if (t.StartDate.HasValue && t.EndDate.HasValue && t.EndDate < t.StartDate)
                errors["endDate"] = "End date cannot be before the start date.";

            if (!string.IsNullOrWhiteSpace(t.PriorityLevel) && !Priorities.Contains(t.PriorityLevel))
                errors["priorityLevel"] = "Priority must be Low, Medium, High or Critical.";

            if (!string.IsNullOrWhiteSpace(t.BillingCycle) && !BillingCycles.Contains(t.BillingCycle))
                errors["billingCycle"] = "Billing cycle must be Weekly, Biweekly, Monthly or Quarterly.";

            if (!string.IsNullOrWhiteSpace(t.BillingCurrency) &&
                (t.BillingCurrency.Length != 3 || !t.BillingCurrency.All(char.IsLetter)))
                errors["billingCurrency"] = "Currency must be a 3-letter code such as USD or PKR.";

            return errors;
        }

        public static ContractTermsDto FromContract(Contract c) => new()
        {
            StartTime = c.StartTime,
            EndTime = c.EndTime,
            MinEmployees = c.MinEmployees,
            MaxEmployees = c.MaxEmployees,
            BorrowingAllowed = c.BorrowingAllowed,
            PriorityLevel = c.PriorityLevel,
            BillingCurrency = c.BillingCurrency,
            BaseHourlyRate = c.BaseHourlyRate,
            ExtraHourlyRate = c.ExtraHourlyRate,
        };

        public static T FromVersion<T>(ContractVersion v) where T : ContractTermsDto, new() => new()
        {
            StartDate = v.StartDate,
            EndDate = v.EndDate,
            StartTime = v.StartTime,
            EndTime = v.EndTime,
            MinEmployees = v.MinEmployees,
            MaxEmployees = v.MaxEmployees,
            BorrowingAllowed = v.BorrowingAllowed,
            MaxBorrowedEmployees = v.MaxBorrowedEmployees,
            PriorityLevel = v.PriorityLevel,
            BillingCurrency = v.BillingCurrency,
            BillingCycle = v.BillingCycle,
            BaseHourlyRate = v.BaseHourlyRate,
            ExtraHourlyRate = v.ExtraHourlyRate,
        };

        public static void CopyToVersion(ContractTermsDto t, ContractVersion v)
        {
            v.StartDate = t.StartDate;
            v.EndDate = t.EndDate;
            v.StartTime = t.StartTime;
            v.EndTime = t.EndTime;
            v.MinEmployees = t.MinEmployees;
            v.MaxEmployees = t.MaxEmployees;
            v.BorrowingAllowed = t.BorrowingAllowed;
            v.MaxBorrowedEmployees = t.MaxBorrowedEmployees;
            v.PriorityLevel = Clean(t.PriorityLevel);
            v.BillingCurrency = Clean(t.BillingCurrency)?.ToUpperInvariant();
            v.BillingCycle = Clean(t.BillingCycle);
            v.BaseHourlyRate = t.BaseHourlyRate;
            v.ExtraHourlyRate = t.ExtraHourlyRate;
        }

        /// <summary>The Contract row keeps mirroring the columns it already had.</summary>
        public static void MirrorToContract(ContractTermsDto t, Contract c)
        {
            c.StartTime = t.StartTime;
            c.EndTime = t.EndTime;
            c.MinEmployees = t.MinEmployees;
            c.MaxEmployees = t.MaxEmployees;
            c.BorrowingAllowed = t.BorrowingAllowed;
            c.PriorityLevel = Clean(t.PriorityLevel);
            c.BillingCurrency = Clean(t.BillingCurrency)?.ToUpperInvariant();
            c.BaseHourlyRate = t.BaseHourlyRate;
            c.ExtraHourlyRate = t.ExtraHourlyRate;
        }

        public static ContractTermsDto Clone(ContractTermsDto t) => new()
        {
            StartDate = t.StartDate, EndDate = t.EndDate, StartTime = t.StartTime, EndTime = t.EndTime,
            MinEmployees = t.MinEmployees, MaxEmployees = t.MaxEmployees,
            BorrowingAllowed = t.BorrowingAllowed, MaxBorrowedEmployees = t.MaxBorrowedEmployees,
            BillingCurrency = t.BillingCurrency, BillingCycle = t.BillingCycle,
            BaseHourlyRate = t.BaseHourlyRate, ExtraHourlyRate = t.ExtraHourlyRate,
        };

        /// <summary>
        /// Current terms of a contract: the latest version when there is one, otherwise built from the
        /// Contract row (contracts that existed before versioning).
        /// </summary>
        public static async Task<(ContractTermsDto terms, int versionNo)> GetCurrentTermsAsync(
            WorkforceManagementDbContext db, Contract contract)
        {
            var latest = await db.ContractVersions
                .AsNoTracking()
                .Where(v => v.ContractId == contract.ContractId)
                .OrderByDescending(v => v.VersionNo)
                .FirstOrDefaultAsync();

            return latest != null
                ? (FromVersion<ContractTermsDto>(latest), latest.VersionNo)
                : (FromContract(contract), 1);
        }

        public static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
