using System.Data;
using fyp_project.Models;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Services
{
    public record LedgerResult(bool Ok, int Status, string Message, string? Field = null, object? Data = null);

    /// <summary>
    /// The money of the company, in PKR (the same base currency every payment is converted to when it is received):
    ///   RECEIVED  = every payment the organizations made (Invoice_Payment.AmountPkr)
    ///   EXPENSES  = what the admin wrote down (Company_Expense), voided ones left out
    ///   SENT      = what was shared with the business owners (Owner_Payout)
    ///   AVAILABLE = received - expenses - sent: the profit that has not been sent to the owners yet
    /// Sending the profit shares the whole AVAILABLE amount equally between the active business owners (the odd paisa goes to the first owner so
    /// the shares add up exactly). The balance sheet is always calculated from those three tables; no total is stored twice.
    /// </summary>
    public class CompanyLedgerService
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly RoleService _roles;
        private readonly AuditService _audit;

        public CompanyLedgerService(WorkforceManagementDbContext db, RoleService roles, AuditService audit)
        {
            _db = db;
            _roles = roles;
            _audit = audit;
        }

        public static string MonthLabel(int year, int month) => new DateTime(year, month, 1).ToString("MMMM yyyy", System.Globalization.CultureInfo.InvariantCulture);

        // ---------------------------------------------------------------- the balance

        public record Balance(decimal Received, decimal Expenses, decimal Sent, decimal Available, DateTime? LastSettlementAt);

        public async Task<Balance> BalanceAsync()
        {
            var received = await _db.InvoicePayments.AsNoTracking().SumAsync(p => (decimal?)p.AmountPkr) ?? 0m;
            var expenses = await _db.CompanyExpenses.AsNoTracking().Where(e => e.VoidedAt == null).SumAsync(e => (decimal?)e.AmountPkr) ?? 0m;
            var sent = await _db.OwnerPayouts.AsNoTracking().SumAsync(p => (decimal?)p.AmountPkr) ?? 0m;
            var last = await _db.OwnerSettlements.AsNoTracking().MaxAsync(s => (DateTime?)s.SettledAt);
            return new Balance(received, expenses, sent, received - expenses - sent, last);
        }

        public async Task<List<(int UserId, string Name, string? Email)>> OwnersAsync()
        {
            var roleIds = await _roles.FindRoleIdsAsync(RoleNames.BusinessOwner);
            var owners = await _db.Users.AsNoTracking()
                .Where(u => u.IsActive == true && u.RoleId != null && roleIds.Contains(u.RoleId.Value))
                .OrderBy(u => u.UserId).Select(u => new { u.UserId, u.Name, u.Email }).ToListAsync();
            return owners.Select(o => (o.UserId, o.Name ?? $"Owner {o.UserId}", o.Email)).ToList();
        }

        /// <summary>Splits an amount equally: the odd paisa goes to the first owner, so the shares add up exactly.</summary>
        public static List<decimal> Split(decimal amount, int count)
        {
            if (count <= 0 || amount <= 0) return new List<decimal>();
            var each = Math.Floor(amount / count * 100m) / 100m;
            var shares = Enumerable.Repeat(each, count).ToList();
            shares[0] += amount - each * count;
            return shares;
        }

        /// <summary>What "Send to the owners" would do right now (nothing is saved).</summary>
        public async Task<object> PreviewAsync()
        {
            var balance = await BalanceAsync();
            var owners = await OwnersAsync();
            var shares = Split(balance.Available, owners.Count);
            return new
            {
                received = balance.Received,
                expenses = balance.Expenses,
                alreadySent = balance.Sent,
                available = balance.Available,
                canSend = balance.Available > 0 && owners.Count > 0,
                reason = owners.Count == 0 ? "There is no active business owner to send the profit to." : balance.Available <= 0 ? "Nothing to send: the profit that is left is zero or negative." : null,
                owners = owners.Select((o, i) => new { userId = o.UserId, name = o.Name, sharePkr = i < shares.Count ? shares[i] : 0m }),
            };
        }

        // ---------------------------------------------------------------- expenses

        public async Task<LedgerResult> AddExpenseAsync(decimal amount, DateOnly date, string? description, int? userId)
        {
            amount = Money.Round(amount);
            if (amount <= 0) return new LedgerResult(false, 400, "Enter an amount above zero.", "amount");
            if (amount > 100_000_000_000m) return new LedgerResult(false, 400, "That amount is too large.", "amount");
            if (date > Money.Today) return new LedgerResult(false, 400, "The date cannot be in the future.", "date");
            if (date < Money.Today.AddYears(-5)) return new LedgerResult(false, 400, "The date is too old.", "date");
            var text = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
            if (text != null && text.Length > 255) return new LedgerResult(false, 400, "The description can be at most 255 characters.", "description");

            // An expense can never be more than the money the company has now (received - expenses - sent to the owners).
            await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var balance = await BalanceAsync();
            if (amount > balance.Available)
                return new LedgerResult(false, 409, balance.Available <= 0
                    ? "There is no money left to spend: everything that was received has already been spent or sent to the owners."
                    : $"You only have {balance.Available:N2} PKR. An expense cannot be more than the money you have.", "amount");

            var expense = new CompanyExpense { ExpenseDate = date, AmountPkr = amount, Description = text, CreatedBy = userId, CreatedAt = DateTime.UtcNow };
            _db.CompanyExpenses.Add(expense);
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
            await _audit.LogAsync(userId, "EXPENSE_ADDED", "Expense", expense.ExpenseId, $"Expense of {amount:0.00} PKR on {date:yyyy-MM-dd}{(text == null ? string.Empty : $": {text}")}");
            return new LedgerResult(true, 200, "Expense added. It is taken off the balance.", Data: new { expenseId = expense.ExpenseId });
        }

        /// <summary>An expense can be voided (with a reason) only while its money has not been shared with the owners yet.</summary>
        public async Task<LedgerResult> VoidExpenseAsync(int expenseId, string reason, int? userId)
        {
            var expense = await _db.CompanyExpenses.FirstOrDefaultAsync(e => e.ExpenseId == expenseId);
            if (expense == null) return new LedgerResult(false, 404, "Expense not found.");
            if (expense.VoidedAt != null) return new LedgerResult(false, 409, "This expense is already voided.");
            if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 3) return new LedgerResult(false, 400, "A reason is required.", "reason");

            var lastSettlement = await _db.OwnerSettlements.AsNoTracking().MaxAsync(s => (DateTime?)s.SettledAt);
            if (lastSettlement != null && expense.CreatedAt <= lastSettlement)
                return new LedgerResult(false, 409, "This expense was already counted when the profit was sent to the owners, so it can no longer be voided.");

            expense.VoidedAt = DateTime.UtcNow;
            expense.VoidedBy = userId;
            expense.VoidReason = reason.Trim();
            await _db.SaveChangesAsync();
            await _audit.LogAsync(userId, "EXPENSE_VOIDED", "Expense", expense.ExpenseId, $"Expense of {expense.AmountPkr:0.00} PKR voided: {expense.VoidReason}");
            return new LedgerResult(true, 200, "Expense voided.");
        }

        // ---------------------------------------------------------------- sending the profit to the owners

        public async Task<LedgerResult> SettleAsync(string? note, int? adminUserId)
        {
            var text = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
            if (text != null && text.Length > 255) return new LedgerResult(false, 400, "The note can be at most 255 characters.", "note");

            // Serializable: two admins pressing the button together cannot send the same money twice.
            await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var balance = await BalanceAsync();
            var owners = await OwnersAsync();
            if (owners.Count == 0) return new LedgerResult(false, 409, "There is no active business owner to send the profit to.");
            if (balance.Available <= 0) return new LedgerResult(false, 409, balance.Available == 0 ? "Nothing to send: there is no profit left." : $"Nothing to send: the expenses are {Math.Abs(balance.Available):0.00} PKR more than what is left.");

            var now = DateTime.UtcNow;
            var today = Money.Today;
            var settlement = new OwnerSettlement
            {
                SettledAt = now, PeriodYear = today.Year, PeriodMonth = today.Month, AmountPkr = balance.Available,
                ReceivedPkr = balance.Received, ExpensesPkr = balance.Expenses, PreviouslySentPkr = balance.Sent,
                OwnerCount = owners.Count, Note = text, SettledBy = adminUserId,
            };
            _db.OwnerSettlements.Add(settlement);
            await _db.SaveChangesAsync();

            var shares = Split(balance.Available, owners.Count);
            var payouts = new List<OwnerPayout>();
            for (var i = 0; i < owners.Count; i++)
            {
                var payout = new OwnerPayout { SettlementId = settlement.SettlementId, OwnerUserId = owners[i].UserId, AmountPkr = shares[i], CreatedAt = now };
                _db.OwnerPayouts.Add(payout);
                payouts.Add(payout);
            }
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            var month = MonthLabel(settlement.PeriodYear, settlement.PeriodMonth);
            await _audit.LogAsync(adminUserId, "OWNER_SETTLEMENT_CREATED", "Settlement", settlement.SettlementId,
                $"Profit of {balance.Available:0.00} PKR sent to {owners.Count} business owner{(owners.Count == 1 ? string.Empty : "s")} for {month}");
            // One entry per owner: this is what the owner's bell shows ("your share"), with a link to the receipt.
            foreach (var payout in payouts)
                await _audit.LogAsync(adminUserId, "OWNER_PAYOUT_SENT", "Payout", payout.PayoutId, $"Your share of the profit for {month}: {payout.AmountPkr:0.00} PKR ({DocumentCodes.PayoutNumber(settlement.PeriodYear, settlement.PeriodMonth, payout.PayoutId)})");

            return new LedgerResult(true, 200, $"{balance.Available:0.00} PKR was sent to {owners.Count} business owner{(owners.Count == 1 ? string.Empty : "s")}.", Data: new { settlementId = settlement.SettlementId, amount = balance.Available, owners = owners.Count });
        }

        // ---------------------------------------------------------------- the balance sheet

        /// <summary>One row per month of the year, and the balance carried from before: received, expenses, sent to the owners, what stays.</summary>
        public async Task<object> SheetAsync(int year)
        {
            var start = new DateTime(year, 1, 1);
            var end = start.AddYears(1);

            var before = await BalanceBeforeAsync(start);
            var received = await _db.InvoicePayments.AsNoTracking().Where(p => p.PaidAt >= start && p.PaidAt < end).Select(p => new { p.PaidAt, p.AmountPkr }).ToListAsync();
            var expenses = await _db.CompanyExpenses.AsNoTracking().Where(e => e.VoidedAt == null && e.ExpenseDate >= DateOnly.FromDateTime(start) && e.ExpenseDate < DateOnly.FromDateTime(end)).Select(e => new { e.ExpenseDate, e.AmountPkr }).ToListAsync();
            var sent = await _db.OwnerSettlements.AsNoTracking().Where(s => s.SettledAt >= start && s.SettledAt < end).Select(s => new { s.SettledAt, s.AmountPkr }).ToListAsync();

            var running = before;
            var months = new List<object>();
            var today = Money.Today;
            var lastMonth = year < today.Year ? 12 : year == today.Year ? today.Month : 0;
            for (var m = 1; m <= lastMonth; m++)
            {
                var r = received.Where(p => p.PaidAt.Month == m).Sum(p => p.AmountPkr);
                var x = expenses.Where(e => e.ExpenseDate.Month == m).Sum(e => e.AmountPkr);
                var s = sent.Where(e => e.SettledAt.Month == m).Sum(e => e.AmountPkr);
                var opening = running;
                running = running + r - x - s;
                months.Add(new { month = m, label = MonthLabel(year, m), openingPkr = opening, receivedPkr = r, expensesPkr = x, netPkr = r - x, sentToOwnersPkr = s, closingPkr = running });
            }

            var totals = new
            {
                receivedPkr = received.Sum(p => p.AmountPkr),
                expensesPkr = expenses.Sum(e => e.AmountPkr),
                sentToOwnersPkr = sent.Sum(s => s.AmountPkr),
            };
            var years = await YearsAsync();
            return new { year, years, openingPkr = before, months, totals, closingPkr = running };
        }

        private async Task<decimal> BalanceBeforeAsync(DateTime before)
        {
            var received = await _db.InvoicePayments.AsNoTracking().Where(p => p.PaidAt < before).SumAsync(p => (decimal?)p.AmountPkr) ?? 0m;
            var expenses = await _db.CompanyExpenses.AsNoTracking().Where(e => e.VoidedAt == null && e.ExpenseDate < DateOnly.FromDateTime(before)).SumAsync(e => (decimal?)e.AmountPkr) ?? 0m;
            var sent = await _db.OwnerSettlements.AsNoTracking().Where(s => s.SettledAt < before).SumAsync(s => (decimal?)s.AmountPkr) ?? 0m;
            return received - expenses - sent;
        }

        private async Task<List<int>> YearsAsync()
        {
            var years = new HashSet<int> { Money.Today.Year };
            foreach (var y in await _db.InvoicePayments.AsNoTracking().Select(p => p.PaidAt.Year).Distinct().ToListAsync()) years.Add(y);
            foreach (var y in await _db.CompanyExpenses.AsNoTracking().Select(e => e.ExpenseDate.Year).Distinct().ToListAsync()) years.Add(y);
            foreach (var y in await _db.OwnerSettlements.AsNoTracking().Select(s => s.SettledAt.Year).Distinct().ToListAsync()) years.Add(y);
            return years.OrderByDescending(y => y).ToList();
        }

        /// <summary>What the organizations paid in one month, organization by organization (PKR).</summary>
        public async Task<object> ReceivedInMonthAsync(int year, int month)
        {
            month = Math.Clamp(month, 1, 12);
            var start = new DateTime(year, month, 1);
            var end = start.AddMonths(1);
            var rows = await (from p in _db.InvoicePayments.AsNoTracking()
                              join i in _db.Invoices.AsNoTracking() on p.InvoiceId equals i.InvoiceId
                              where p.PaidAt >= start && p.PaidAt < end
                              select new { i.OrgId, OrgName = i.Org != null ? i.Org.OrgName : null, p.AmountPkr, p.Amount, p.Currency }).ToListAsync();
            var byOrg = rows.GroupBy(r => new { r.OrgId, r.OrgName })
                .Select(g => new { orgId = g.Key.OrgId, orgName = g.Key.OrgName ?? $"Organization {g.Key.OrgId}", payments = g.Count(), amountPkr = g.Sum(r => r.AmountPkr) })
                .OrderByDescending(r => r.amountPkr).ThenBy(r => r.orgName).ToList();
            return new { year, month, label = MonthLabel(year, month), totalPkr = byOrg.Sum(r => r.amountPkr), payments = rows.Count, byOrganization = byOrg };
        }

        /// <summary>Every money movement of the company, newest first: a payment received, an expense, or profit sent to the owners.</summary>
        public async Task<object> TransactionsAsync(int page, int pageSize)
        {
            var payments = await (from p in _db.InvoicePayments.AsNoTracking()
                                  join i in _db.Invoices.AsNoTracking() on p.InvoiceId equals i.InvoiceId
                                  select new { when = p.PaidAt, p.AmountPkr, text = (i.Org != null ? i.Org.OrgName : "Organization") + " paid " + i.InvoiceNumber }).ToListAsync();
            var expenses = await _db.CompanyExpenses.AsNoTracking().Where(e => e.VoidedAt == null)
                .Select(e => new { when = e.ExpenseDate.ToDateTime(TimeOnly.MinValue), e.AmountPkr, text = e.Description ?? "Expense" }).ToListAsync();
            var settlements = await _db.OwnerSettlements.AsNoTracking()
                .Select(s => new { when = s.SettledAt, s.AmountPkr, text = "Profit sent to " + s.OwnerCount + " owner(s)" }).ToListAsync();

            var all = payments.Select(p => new { p.when, kind = "received", amountPkr = p.AmountPkr, p.text })
                .Concat(expenses.Select(e => new { e.when, kind = "expense", amountPkr = e.AmountPkr, e.text }))
                .Concat(settlements.Select(s => new { s.when, kind = "sentToOwners", amountPkr = s.AmountPkr, s.text }))
                .OrderByDescending(x => x.when).ToList();
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            return new { items = all.Skip((page - 1) * pageSize).Take(pageSize), total = all.Count, page, pageSize };
        }

        public async Task<List<object>> SettlementsAsync(int take = 50)
        {
            var rows = await _db.OwnerSettlements.AsNoTracking().OrderByDescending(s => s.SettlementId).Take(take).ToListAsync();
            var ids = rows.Select(r => r.SettlementId).ToList();
            var payouts = await _db.OwnerPayouts.AsNoTracking().Where(p => ids.Contains(p.SettlementId)).Select(p => new { p.PayoutId, p.SettlementId, p.OwnerUserId, p.AmountPkr, p.CreatedAt, p.Owner!.Name }).ToListAsync();
            return rows.Select(s => (object)new
            {
                settlementId = s.SettlementId,
                settledAt = s.SettledAt,
                label = MonthLabel(s.PeriodYear, s.PeriodMonth),
                amountPkr = s.AmountPkr,
                receivedPkr = s.ReceivedPkr,
                expensesPkr = s.ExpensesPkr,
                previouslySentPkr = s.PreviouslySentPkr,
                ownerCount = s.OwnerCount,
                note = s.Note,
                payouts = payouts.Where(p => p.SettlementId == s.SettlementId).OrderBy(p => p.OwnerUserId)
                    .Select(p => new { payoutId = p.PayoutId, ownerUserId = p.OwnerUserId, ownerName = p.Name, amountPkr = p.AmountPkr, number = DocumentCodes.PayoutNumber(s.PeriodYear, s.PeriodMonth, p.PayoutId) }),
            }).ToList();
        }
    }
}
