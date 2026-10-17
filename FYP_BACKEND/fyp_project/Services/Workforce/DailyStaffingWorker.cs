namespace fyp_project.Services
{
    /// <summary>
    /// Runs the daily staffing by itself, every few minutes while the backend is running: it ends the daily appointments whose window is over
    /// and and, only when Staffing:AutoMinimum is true (the future AI allocation), appoints the missing minimum employees of every daily contract once its window has started. Until then the organization manager appoints the minimum by hand. Doing it again is harmless (only what is
    /// missing is filled), so a restart or a manual "Appoint now" never doubles anything. Nothing happens for contracts that are not daily.
    /// </summary>
    public class DailyStaffingWorker : BackgroundService
    {
        private static readonly TimeSpan FirstDelay = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

        private readonly IServiceScopeFactory _scopes;
        private readonly ILogger<DailyStaffingWorker> _logger;
        private bool _missingSchemaReported;

        public DailyStaffingWorker(IServiceScopeFactory scopes, ILogger<DailyStaffingWorker> logger)
        {
            _scopes = scopes;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                await Task.Delay(FirstDelay, stoppingToken);
                while (!stoppingToken.IsCancellationRequested)
                {
                    await RunOnceAsync(stoppingToken);
                    await Task.Delay(Interval, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                // The backend is stopping.
            }
        }

        private async Task RunOnceAsync(CancellationToken stoppingToken)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                // Approved contract changes that were waiting for their day start now (before the daily staffing, which reads the contract).
                await scope.ServiceProvider.GetRequiredService<ContractModificationService>().ApplyDueAsync();
                var service = scope.ServiceProvider.GetRequiredService<DailyStaffingService>();
                // The minimum is appointed by the organization manager for now; the AI allocation will switch this on (Staffing:AutoMinimum).
                var autoMinimum = scope.ServiceProvider.GetRequiredService<IConfiguration>().GetValue<bool>("Staffing:AutoMinimum");
                var run = await service.RunAsync(contractId: null, actorUserId: null, automatic: true, appoint: autoMinimum);
                var appointed = run.Contracts.Sum(c => c.NewlyAppointed);
                if (run.Released > 0 || appointed > 0)
                    _logger.LogInformation("Daily staffing: {Appointed} appointed, {Released} released, {Contracts} daily contract(s) checked.", appointed, run.Released, run.Contracts.Count);
            }
            catch (Exception ex) when (SafeQuery.IsMissingSchema(ex))
            {
                // Migration 015 has not been run yet: say so once instead of every few minutes.
                if (!_missingSchemaReported)
                {
                    _missingSchemaReported = true;
                    _logger.LogWarning("Daily staffing is waiting for FYP_DB/migrations/015_daily_contracts.sql to be run.");
                }
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogError(ex, "Daily staffing failed; it will try again in a few minutes.");
            }
        }
    }
}
