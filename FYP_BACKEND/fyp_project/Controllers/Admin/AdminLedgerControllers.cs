using System.ComponentModel.DataAnnotations;
using fyp_project.Models;
using fyp_project.Services;
using fyp_project.Validation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    public class AddExpenseRequest
    {
        [Range(0.01, 100000000000, ErrorMessage = "Enter an amount above zero.")] public decimal Amount { get; set; }
        /// <summary>Empty = today.</summary>
        public DateOnly? ExpenseDate { get; set; }
        /// <summary>Optional: what the money was spent on.</summary>
        [StringLength(255)] public string? Description { get; set; }
    }

    public class VoidExpenseRequest
    {
        [Required, StringLength(255), MinTrimmedLength(3)] public string Reason { get; set; } = string.Empty;
    }

    public class SendToOwnersRequest
    {
        [StringLength(255)] public string? Note { get; set; }
    }

    /// <summary>
    /// Admin portal: the company's expenses. The admin writes down an amount (PKR) and, if wanted, what it was for. Every expense is taken off the
    /// money that is left to share with the business owners. There is no salary or payroll in the system: this is the only money going out.
    /// </summary>
    [Route("api/admin/expenses")]
    public class AdminExpensesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly CompanyLedgerService _ledger;

        public AdminExpensesController(WorkforceManagementDbContext db, CompanyLedgerService ledger)
        {
            _db = db;
            _ledger = ledger;
        }

        // GET api/admin/expenses?from=&to=&includeVoided=false&page=1&pageSize=15
        //   -> { items, total, page, pageSize, totalPkr, balance: { received, expenses, sent, available } }
        [HttpGet]
        public async Task<IActionResult> List(DateOnly? from, DateOnly? to, bool includeVoided = false, int page = 1, int pageSize = 15)
        {
            (page, pageSize) = NormalizePaging(page, pageSize);
            var query = _db.CompanyExpenses.AsNoTracking().AsQueryable();
            if (!includeVoided) query = query.Where(e => e.VoidedAt == null);
            if (from.HasValue) query = query.Where(e => e.ExpenseDate >= from.Value);
            if (to.HasValue) query = query.Where(e => e.ExpenseDate <= to.Value);

            var total = await query.CountAsync();
            var totalPkr = await query.Where(e => e.VoidedAt == null).SumAsync(e => (decimal?)e.AmountPkr) ?? 0m;
            var rows = await query.OrderByDescending(e => e.ExpenseDate).ThenByDescending(e => e.ExpenseId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            var userIds = rows.Where(r => r.CreatedBy.HasValue).Select(r => r.CreatedBy!.Value).Concat(rows.Where(r => r.VoidedBy.HasValue).Select(r => r.VoidedBy!.Value)).Distinct().ToList();
            var names = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.Name);
            var lastSettlement = await _db.OwnerSettlements.AsNoTracking().MaxAsync(s => (DateTime?)s.SettledAt);
            var balance = await _ledger.BalanceAsync();

            return Ok(new
            {
                items = rows.Select(e => new
                {
                    expenseId = e.ExpenseId,
                    expenseDate = e.ExpenseDate,
                    amountPkr = e.AmountPkr,
                    description = e.Description,
                    createdAt = e.CreatedAt,
                    createdBy = e.CreatedBy.HasValue ? names.GetValueOrDefault(e.CreatedBy.Value) : null,
                    voided = e.VoidedAt != null,
                    voidedAt = e.VoidedAt,
                    voidedBy = e.VoidedBy.HasValue ? names.GetValueOrDefault(e.VoidedBy.Value) : null,
                    voidReason = e.VoidReason,
                    canVoid = e.VoidedAt == null && (lastSettlement == null || e.CreatedAt > lastSettlement),
                }),
                total,
                page,
                pageSize,
                totalPkr,
                balance = new { received = balance.Received, expenses = balance.Expenses, sent = balance.Sent, available = balance.Available },
            });
        }

        // POST api/admin/expenses   { amount, expenseDate?, description? }
        [HttpPost]
        public async Task<IActionResult> Add([FromBody] AddExpenseRequest request)
        {
            var result = await _ledger.AddExpenseAsync(request.Amount, request.ExpenseDate ?? Money.Today, request.Description, CurrentUserId);
            return Reply(result);
        }

        // POST api/admin/expenses/5/void   { reason }
        [HttpPost("{expenseId:int}/void")]
        public async Task<IActionResult> Void(int expenseId, [FromBody] VoidExpenseRequest request) =>
            Reply(await _ledger.VoidExpenseAsync(expenseId, request.Reason, CurrentUserId));

        private IActionResult Reply(LedgerResult result) =>
            result.Ok
                ? Ok(new { message = result.Message, data = result.Data })
                : result.Field != null
                    ? FieldError(result.Field, result.Message)
                    : StatusCode(result.Status, new { message = result.Message });
    }

    /// <summary>
    /// Admin portal: the balance sheet of the company and the button that sends the profit to the business owners. Received money comes from the
    /// organizations' payments, expenses from the admin, and what is left is shared equally between the active business owners.
    /// </summary>
    [Route("api/admin/balance-sheet")]
    public class AdminBalanceSheetController : AdminControllerBase
    {
        private readonly CompanyLedgerService _ledger;

        public AdminBalanceSheetController(CompanyLedgerService ledger)
        {
            _ledger = ledger;
        }

        // GET api/admin/balance-sheet?year=2026&month=10
        //   -> { balance, preview, sheet: { year, years, openingPkr, months: [...], totals, closingPkr }, settlements: [...] }
        [HttpGet]
        public async Task<IActionResult> Get(int? year, int? month)
        {
            var now = Money.Today;
            var shownYear = Math.Clamp(year ?? now.Year, 2000, 2100);
            var balance = await _ledger.BalanceAsync();
            return Ok(new
            {
                balance = new { received = balance.Received, expenses = balance.Expenses, sent = balance.Sent, available = balance.Available, lastSettlementAt = balance.LastSettlementAt },
                preview = await _ledger.PreviewAsync(),
                sheet = await _ledger.SheetAsync(shownYear),
                month = await _ledger.ReceivedInMonthAsync(shownYear, month ?? (shownYear == now.Year ? now.Month : 12)),
                settlements = await _ledger.SettlementsAsync(),
            });
        }

        // GET api/admin/balance-sheet/transactions?page=1&pageSize=20   (every money movement, newest first)
        [HttpGet("transactions")]
        public async Task<IActionResult> Transactions(int page = 1, int pageSize = 20) => Ok(await _ledger.TransactionsAsync(page, pageSize));

        // POST api/admin/balance-sheet/send   { note? }   (shares everything that is left equally between the business owners)
        [HttpPost("send")]
        public async Task<IActionResult> Send([FromBody] SendToOwnersRequest? request)
        {
            var result = await _ledger.SettleAsync(request?.Note, CurrentUserId);
            if (result.Ok) return Ok(new { message = result.Message, data = result.Data });
            return result.Field != null ? FieldError(result.Field, result.Message) : StatusCode(result.Status, new { message = result.Message });
        }
    }
}
