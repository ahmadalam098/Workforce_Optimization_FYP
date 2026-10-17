using fyp_project.Services;
using Microsoft.AspNetCore.Mvc;

namespace fyp_project.Controllers.Admin
{
    /// <summary>
    /// Admin portal: daily contracts. Shows where each daily contract stands today and lets the admin appoint the missing minimum employees
    /// right now (the background worker does the same by itself every few minutes once a contract's daily window has started).
    /// </summary>
    [Route("api/admin/daily-staffing")]
    public class AdminDailyStaffingController : AdminControllerBase
    {
        private readonly DailyStaffingService _daily;

        public AdminDailyStaffingController(DailyStaffingService daily)
        {
            _daily = daily;
        }

        // GET api/admin/daily-staffing?contractId=
        [HttpGet]
        public async Task<IActionResult> Status(int? contractId) => Ok(await _daily.StatusAsync(contractId));

        // POST api/admin/daily-staffing/run   (every daily contract)
        [HttpPost("run")]
        public async Task<IActionResult> RunAll() => Ok(Summarize(await _daily.RunAsync(null, CurrentUserId, automatic: false)));

        // POST api/admin/daily-staffing/run/5   (one contract)
        [HttpPost("run/{contractId:int}")]
        public async Task<IActionResult> RunOne(int contractId)
        {
            var run = await _daily.RunAsync(contractId, CurrentUserId, automatic: false);
            if (run.Contracts.Count == 0) return NotFoundMessage("This is not an active daily contract.");
            return Ok(Summarize(run));
        }

        private static object Summarize(DailyStaffingRun run)
        {
            var appointed = run.Contracts.Sum(c => c.NewlyAppointed);
            var short_ = run.Contracts.Sum(c => c.StillShort);
            var message = run.Contracts.Count == 0
                ? "There is no active daily contract."
                : appointed > 0
                    ? $"{appointed} employee(s) appointed." + (short_ > 0 ? $" {short_} more are still needed." : string.Empty)
                    : short_ > 0 ? $"Nobody could be appointed; {short_} more are needed (no free employee)." : "Every daily contract already has its minimum.";
            return new { message, day = run.Day, released = run.Released, contracts = run.Contracts };
        }
    }
}
