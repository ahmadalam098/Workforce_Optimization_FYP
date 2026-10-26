using System.Security.Claims;
using fyp_project.Controllers.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.BusinessOwnerPortal
{
    /// <summary>
    /// Business Owner portal: the money. The profit shares the admin sent to this owner (each with a receipt), the balance sheet of the company
    /// and its money movements. Read only; an owner sees their own payouts and the company figures, never another owner's receipt.
    /// </summary>
    [ApiController]
    [Authorize(Policy = "BusinessOwnerOnly")]
    [MissingMigrationFilter]
    [Route("api/business-owner")]
    public class BusinessOwnerFinanceController : ControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly CompanyLedgerService _ledger;

        public BusinessOwnerFinanceController(WorkforceManagementDbContext db, CompanyLedgerService ledger)
        {
            _db = db;
            _ledger = ledger;
        }

        private int Me => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("nameid")?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // GET api/business-owner/payouts
        //   -> { totals: { allTimePkr, thisYearPkr, thisMonthPkr, count }, items: [{ payoutId, number, amountPkr, sentAt, label, owners }] }
        [HttpGet("payouts")]
        public async Task<IActionResult> Payouts()
        {
            var rows = await _db.OwnerPayouts.AsNoTracking().Where(p => p.OwnerUserId == Me)
                .OrderByDescending(p => p.PayoutId)
                .Select(p => new { p.PayoutId, p.AmountPkr, p.Settlement!.SettledAt, p.Settlement.PeriodYear, p.Settlement.PeriodMonth, p.Settlement.OwnerCount })
                .ToListAsync();
            var today = Money.Today;
            return Ok(new
            {
                totals = new
                {
                    allTimePkr = rows.Sum(r => r.AmountPkr),
                    thisYearPkr = rows.Where(r => r.PeriodYear == today.Year).Sum(r => r.AmountPkr),
                    thisMonthPkr = rows.Where(r => r.PeriodYear == today.Year && r.PeriodMonth == today.Month).Sum(r => r.AmountPkr),
                    count = rows.Count,
                },
                items = rows.Select(r => new
                {
                    payoutId = r.PayoutId,
                    number = DocumentCodes.PayoutNumber(r.PeriodYear, r.PeriodMonth, r.PayoutId),
                    amountPkr = r.AmountPkr,
                    sentAt = r.SettledAt,
                    label = CompanyLedgerService.MonthLabel(r.PeriodYear, r.PeriodMonth),
                    owners = r.OwnerCount,
                }),
            });
        }

        // GET api/business-owner/balance-sheet?year=2026   -> { balance, sheet }
        [HttpGet("balance-sheet")]
        public async Task<IActionResult> BalanceSheet(int? year, int? month)
        {
            var now = Money.Today;
            var shownYear = Math.Clamp(year ?? now.Year, 2000, 2100);
            var balance = await _ledger.BalanceAsync();
            return Ok(new
            {
                balance = new { received = balance.Received, expenses = balance.Expenses, sent = balance.Sent, available = balance.Available, lastSettlementAt = balance.LastSettlementAt },
                sheet = await _ledger.SheetAsync(shownYear),
                month = await _ledger.ReceivedInMonthAsync(shownYear, month ?? (shownYear == now.Year ? now.Month : 12)),
            });
        }

        // GET api/business-owner/transactions?page=1&pageSize=20
        [HttpGet("transactions")]
        public async Task<IActionResult> Transactions(int page = 1, int pageSize = 20) => Ok(await _ledger.TransactionsAsync(page, pageSize));
    }
}
