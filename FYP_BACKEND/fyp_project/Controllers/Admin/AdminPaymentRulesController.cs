using fyp_project.DTOs.Admin;
using fyp_project.Models;
using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace fyp_project.Controllers.Admin
{
    /// <summary>Admin portal: system payment rules (invoice due days, overtime multiplier, ...) and USD/PKR style exchange rates.</summary>
    public class AdminPaymentRulesController : AdminControllerBase
    {
        private readonly WorkforceManagementDbContext _db;
        private readonly AuditService _audit;

        public AdminPaymentRulesController(WorkforceManagementDbContext db, AuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        private static PaymentRuleDto ToDto(PaymentRule r) => new()
        {
            RuleId = r.RuleId, RuleKey = r.RuleKey, Title = r.Title, Value = r.Value, Unit = r.Unit,
            Description = r.Description, IsSystem = r.IsSystem, IsActive = r.IsActive, UpdatedAt = r.UpdatedAt,
        };

        // ---------------- payment rules ----------------

        // GET api/admin/payment-rules
        [HttpGet("api/admin/payment-rules")]
        public async Task<IActionResult> ListRules()
        {
            var rules = await _db.PaymentRules.AsNoTracking().OrderByDescending(r => r.IsSystem).ThenBy(r => r.Title).ToListAsync();
            return Ok(rules.Select(ToDto).ToList());
        }

        // POST api/admin/payment-rules   (custom rule)
        [HttpPost("api/admin/payment-rules")]
        public async Task<IActionResult> CreateRule([FromBody] SavePaymentRuleRequest request)
        {
            var key = (request.RuleKey ?? string.Empty).Trim().ToUpperInvariant().Replace(' ', '_');
            if (key.Length < 3 || !key.All(c => char.IsLetterOrDigit(c) || c == '_'))
                return FieldError("ruleKey", "The key needs at least 3 letters, digits or underscores (for example EARLY_PAYMENT_DISCOUNT).");

            if (await _db.PaymentRules.AnyAsync(r => r.RuleKey == key))
                return ConflictMessage("A rule with this key already exists.");

            var rule = new PaymentRule
            {
                RuleKey = key,
                Title = request.Title.Trim(),
                Value = request.Value,
                Unit = ContractLogic.Clean(request.Unit),
                Description = ContractLogic.Clean(request.Description),
                IsSystem = false,
                IsActive = true,
                UpdatedBy = CurrentUserId,
                UpdatedAt = DateTime.UtcNow,
            };
            _db.PaymentRules.Add(rule);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "PAYMENT_RULE_CREATED", "PaymentRule", rule.RuleId, $"{key} = {rule.Value}");
            return Ok(new { message = "Rule added.", ruleId = rule.RuleId });
        }

        // PUT api/admin/payment-rules/5   (keys never change)
        [HttpPut("api/admin/payment-rules/{ruleId:int}")]
        public async Task<IActionResult> UpdateRule(int ruleId, [FromBody] SavePaymentRuleRequest request)
        {
            var rule = await _db.PaymentRules.FirstOrDefaultAsync(r => r.RuleId == ruleId);
            if (rule == null) return NotFoundMessage("Rule not found.");

            var before = rule.Value;
            rule.Title = request.Title.Trim();
            rule.Value = request.Value;
            rule.Unit = ContractLogic.Clean(request.Unit);
            rule.Description = ContractLogic.Clean(request.Description);
            rule.UpdatedBy = CurrentUserId;
            rule.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "PAYMENT_RULE_UPDATED", "PaymentRule", ruleId, $"{rule.RuleKey}: {before} -> {rule.Value}");
            return Ok(new { message = "Rule updated.", ruleId });
        }

        // PATCH api/admin/payment-rules/5/active   (built-in rules cannot be switched off)
        [HttpPatch("api/admin/payment-rules/{ruleId:int}/active")]
        public async Task<IActionResult> SetRuleActive(int ruleId, [FromBody] SetActiveRequest request)
        {
            var rule = await _db.PaymentRules.FirstOrDefaultAsync(r => r.RuleId == ruleId);
            if (rule == null) return NotFoundMessage("Rule not found.");

            var makeActive = request.IsActive == true;
            if (rule.IsSystem && !makeActive) return ConflictMessage("Built-in rules cannot be deactivated. Change their value instead.");

            rule.IsActive = makeActive;
            rule.UpdatedBy = CurrentUserId;
            rule.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, makeActive ? "PAYMENT_RULE_ACTIVATED" : "PAYMENT_RULE_DEACTIVATED", "PaymentRule", ruleId, rule.RuleKey);
            return Ok(new { message = makeActive ? "Rule activated." : "Rule deactivated.", ruleId, isActive = makeActive });
        }

        // DELETE api/admin/payment-rules/5   (a deactivated rule that is not built in)
        [HttpDelete("api/admin/payment-rules/{ruleId:int}")]
        public async Task<IActionResult> DeleteRule(int ruleId, [FromServices] EntityDeletion deletion)
        {
            var result = await deletion.DeletePaymentRuleAsync(ruleId);
            if (result.Ok) await _audit.LogAsync(CurrentUserId, "PAYMENT_RULE_DELETED", "PaymentRule", ruleId, result.Name);
            return DeleteAnswer(result);
        }

        // ---------------- exchange rates ----------------

        // GET api/admin/exchange-rates
        [HttpGet("api/admin/exchange-rates")]
        public async Task<IActionResult> ListRates()
        {
            var rows = await _db.ExchangeRates
                .AsNoTracking()
                .OrderByDescending(r => r.EffectiveDate)
                .ThenByDescending(r => r.RateId)
                .Take(200)
                .Select(r => new ExchangeRateDto
                {
                    RateId = r.RateId,
                    FromCurrency = r.FromCurrency,
                    ToCurrency = r.ToCurrency,
                    Rate = r.Rate,
                    EffectiveDate = r.EffectiveDate,
                    CreatedBy = _db.Users.Where(u => u.UserId == r.CreatedBy).Select(u => u.Name).FirstOrDefault(),
                })
                .ToListAsync();

            return Ok(rows);
        }

        // POST api/admin/exchange-rates   { fromCurrency, toCurrency, rate, effectiveDate }
        [HttpPost("api/admin/exchange-rates")]
        public async Task<IActionResult> CreateRate([FromBody] SaveExchangeRateRequest request)
        {
            var from = request.FromCurrency.Trim().ToUpperInvariant();
            var to = request.ToCurrency.Trim().ToUpperInvariant();

            if (from.Length != 3 || !from.All(char.IsLetter)) return FieldError("fromCurrency", "Use a 3-letter code such as USD.");
            if (to.Length != 3 || !to.All(char.IsLetter)) return FieldError("toCurrency", "Use a 3-letter code such as PKR.");
            if (from == to) return FieldError("toCurrency", "Choose two different currencies.");

            var date = request.EffectiveDate!.Value;
            if (await _db.ExchangeRates.AnyAsync(r => r.FromCurrency == from && r.ToCurrency == to && r.EffectiveDate == date))
                return ConflictMessage($"A {from} to {to} rate already exists for {date:yyyy-MM-dd}.");

            var rate = new ExchangeRate
            {
                FromCurrency = from,
                ToCurrency = to,
                Rate = Math.Round(request.Rate, 6),
                EffectiveDate = date,
                CreatedBy = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.ExchangeRates.Add(rate);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(CurrentUserId, "EXCHANGE_RATE_ADDED", "ExchangeRate", rate.RateId, $"1 {from} = {rate.Rate} {to} from {date:yyyy-MM-dd}");
            return Ok(new { message = "Exchange rate added.", rateId = rate.RateId });
        }
    }
}
