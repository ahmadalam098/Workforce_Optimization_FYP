using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.RegularExpressions;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.EmployeePortal
{
    public class SaveBankRequest
    {
        [Required(ErrorMessage = "Enter the bank name."), StringLength(100, MinimumLength = 2), MinTrimmedLength(2)] public string BankName { get; set; } = string.Empty;
        [Required(ErrorMessage = "Enter the account title (the name on the account)."), StringLength(100, MinimumLength = 2), MinTrimmedLength(2)] public string AccountTitle { get; set; } = string.Empty;
        [Required(ErrorMessage = "Enter the account number or IBAN."), StringLength(60)] public string AccountNumber { get; set; } = string.Empty;
    }

    public static class BankRules
    {
        private static readonly Regex Account = new(@"^[A-Za-z0-9\-]{6,34}$", RegexOptions.Compiled);

        /// <summary>Spaces are removed; returns a problem text or null.</summary>
        public static string? Check(string accountNumber, out string clean)
        {
            clean = new string(accountNumber.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
            return Account.IsMatch(clean) ? null : "The account number or IBAN must have 6 to 34 letters, digits or dashes.";
        }

        public static object Show(EmployeeBank? bank) => bank == null
            ? new { hasBank = false, bankName = (string?)null, accountTitle = (string?)null, accountNumber = (string?)null, updatedAt = (DateTime?)null }
            : new { hasBank = true, bankName = (string?)bank.BankName, accountTitle = (string?)bank.AccountTitle, accountNumber = (string?)bank.AccountNumber, updatedAt = (DateTime?)bank.UpdatedAt };
    }

    /// <summary>Employee portal: where my salary is paid. The payroll sheet uses it; I fill it in once and change it when my bank changes.</summary>
    [ApiController]
    [Authorize(Policy = "EmployeeOnly")]
    [MissingMigrationFilter]
    [Route("api/employee/bank")]
    public class EmployeeBankController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public EmployeeBankController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // GET api/employee/bank
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var empId = await _db.Employees.AsNoTracking().Where(e => e.UserId == Me).Select(e => (int?)e.EmpId).FirstOrDefaultAsync();
            if (empId == null) return Ok(new { hasEmployeeRecord = false });
            var bank = await _db.EmployeeBanks.AsNoTracking().FirstOrDefaultAsync(b => b.EmpId == empId);
            return Ok(new { hasEmployeeRecord = true, bank = BankRules.Show(bank) });
        }

        // PUT api/employee/bank   { bankName, accountTitle, accountNumber }
        [HttpPut]
        public async Task<IActionResult> Save([FromBody] SaveBankRequest request)
        {
            var empId = await _db.Employees.AsNoTracking().Where(e => e.UserId == Me).Select(e => (int?)e.EmpId).FirstOrDefaultAsync();
            if (empId == null) return NotFound(new { message = "Your employee profile is not set up yet." });
            if (BankRules.Check(request.AccountNumber, out var account) is { } problem)
                return BadRequest(new { message = problem, errors = new Dictionary<string, string[]> { ["accountNumber"] = new[] { problem } } });

            var bank = await _db.EmployeeBanks.FirstOrDefaultAsync(b => b.EmpId == empId);
            if (bank == null) _db.EmployeeBanks.Add(bank = new EmployeeBank { EmpId = empId.Value });
            bank.BankName = request.BankName.Trim();
            bank.AccountTitle = request.AccountTitle.Trim();
            bank.AccountNumber = account;
            bank.UpdatedBy = Me;
            bank.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(Me, "EMPLOYEE_BANK_UPDATED", "Employee", empId, "The employee updated their salary bank details");
            return Ok(new { message = "Your bank details were saved." });
        }
    }

    /// <summary>Admin portal: an employee's bank details (read, and correct them if the employee asks).</summary>
    [Route("api/admin/employees/{employeeId:int}/bank")]
    public class AdminEmployeeBankController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public AdminEmployeeBankController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        [HttpGet]
        public async Task<IActionResult> Get(int employeeId)
        {
            if (!await _db.Employees.AnyAsync(e => e.EmpId == employeeId)) return NotFoundMessage("Employee not found.");
            return Ok(BankRules.Show(await _db.EmployeeBanks.AsNoTracking().FirstOrDefaultAsync(b => b.EmpId == employeeId)));
        }

        [HttpPut]
        public async Task<IActionResult> Save(int employeeId, [FromBody] SaveBankRequest request)
        {
            if (!await _db.Employees.AnyAsync(e => e.EmpId == employeeId)) return NotFoundMessage("Employee not found.");
            if (BankRules.Check(request.AccountNumber, out var account) is { } problem) return FieldError("accountNumber", problem);

            var bank = await _db.EmployeeBanks.FirstOrDefaultAsync(b => b.EmpId == employeeId);
            if (bank == null) _db.EmployeeBanks.Add(bank = new EmployeeBank { EmpId = employeeId });
            bank.BankName = request.BankName.Trim();
            bank.AccountTitle = request.AccountTitle.Trim();
            bank.AccountNumber = account;
            bank.UpdatedBy = CurrentUserId;
            bank.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.LogAsync(CurrentUserId, "EMPLOYEE_BANK_UPDATED", "Employee", employeeId, "Salary bank details updated by the admin");
            return Ok(new { message = "Bank details saved." });
        }
    }
}
