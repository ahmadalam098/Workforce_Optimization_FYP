using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: money overview and the payment status of every organization. Profit is calculated, never stored.</summary>
    [Route("api/admin/finance")]
    public class AdminFinanceController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;

        public AdminFinanceController(WorkforceManagementDbContext db)
        {
            _db = db;
        }

        // GET api/admin/finance/summary
        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            var today = Money.Today;
            var monthStart = new DateTime(today.Year, today.Month, 1);
            var nextMonth = monthStart.AddMonths(1);

            var outstanding = await _db.Invoices
                .AsNoTracking()
                .Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount)
                .GroupBy(i => i.Currency)
                .Select(g => new CurrencyAmountDto { Currency = g.Key, Amount = g.Sum(i => i.TotalAmount - i.PaidAmount) })
                .ToListAsync();

            var overdueRows = await _db.Invoices
                .AsNoTracking()
                .Where(i => i.Status == "Issued" && i.PaidAmount < i.TotalAmount && i.DueDate != null && i.DueDate < today)
                .Select(i => new { i.Currency, Balance = i.TotalAmount - i.PaidAmount })
                .ToListAsync();

            var collected = await _db.InvoicePayments
                .Where(p => p.PaidAt >= monthStart && p.PaidAt < nextMonth)
                .SumAsync(p => p.AmountPkr);

            var payroll = await _db.PayrollRuns
                .Where(r => r.PeriodYear == today.Year && r.PeriodMonth == today.Month && (r.Status == "Approved" || r.Status == "Paid"))
                .SumAsync(r => r.TotalPkr);

            return Ok(new FinanceSummaryDto
            {
                Month = monthStart.ToString("MMMM yyyy"),
                Outstanding = outstanding,
                Overdue = overdueRows.GroupBy(r => r.Currency).Select(g => new CurrencyAmountDto { Currency = g.Key, Amount = g.Sum(r => r.Balance) }).ToList(),
                OverdueInvoices = overdueRows.Count,
                DraftInvoices = await _db.Invoices.CountAsync(i => i.Status == "Draft"),
                CollectedThisMonthPkr = collected,
                PayrollThisMonthPkr = payroll,
                ProfitThisMonthPkr = collected - payroll,
                HasExchangeRate = await _db.ExchangeRates.AnyAsync(),
            });
        }

        // GET api/admin/finance/organizations   (payment status per organization and currency)
        [HttpGet("organizations")]
        public async Task<IActionResult> Organizations()
        {
            var today = Money.Today;

            var invoices = await _db.Invoices
                .AsNoTracking()
                .Where(i => i.Status == "Issued" || i.Status == "Paid")
                .Select(i => new
                {
                    i.InvoiceId, i.OrgId, OrgName = i.Org != null ? i.Org.OrgName : null,
                    i.Currency, i.Status, i.TotalAmount, i.PaidAmount, i.DueDate,
                })
                .ToListAsync();

            var lastPayments = await _db.InvoicePayments
                .AsNoTracking()
                .GroupBy(p => p.InvoiceId)
                .Select(g => new { InvoiceId = g.Key, Last = g.Max(p => p.PaidAt) })
                .ToDictionaryAsync(x => x.InvoiceId, x => x.Last);

            var rows = invoices
                .GroupBy(i => new { i.OrgId, i.OrgName, i.Currency })
                .Select(g => new OrgPaymentStatusDto
                {
                    OrgId = g.Key.OrgId,
                    OrgName = g.Key.OrgName,
                    Currency = g.Key.Currency,
                    InvoiceCount = g.Count(),
                    Invoiced = g.Sum(i => i.TotalAmount),
                    Paid = g.Sum(i => i.PaidAmount),
                    Outstanding = g.Where(i => i.Status == "Issued").Sum(i => i.TotalAmount - i.PaidAmount),
                    Overdue = g.Where(i => i.Status == "Issued" && i.DueDate.HasValue && i.DueDate.Value < today).Sum(i => i.TotalAmount - i.PaidAmount),
                    LastPaymentAt = g.Select(i => lastPayments.TryGetValue(i.InvoiceId, out var last) ? (DateTime?)last : null).Max(),
                })
                .OrderByDescending(r => r.Overdue)
                .ThenByDescending(r => r.Outstanding)
                .ThenBy(r => r.OrgName)
                .ToList();

            return Ok(rows);
        }
    }
}
