namespace fyp_project.Services
{
    /// <summary>
    /// Runs the AI autopilot by itself while the backend is running: every few seconds it ends what is over (AI assignments whose time ended,
    /// loans that finished, recalls whose 3 minutes are up) and plans again every organization whose autopilot is on. When an organization
    /// still cannot fill its own minimum, the employees it lent out are recalled. Doing it again is harmless: only what is missing is filled.
    /// </summary>
    public class AutopilotWorker : BackgroundService
    {
        private readonly IServiceScopeFactory _scopes;
        private readonly IConfiguration _config;
        private readonly ILogger<AutopilotWorker> _logger;
        private bool _missingSchemaReported;

        public AutopilotWorker(IServiceScopeFactory scopes, IConfiguration config, ILogger<AutopilotWorker> logger)
        {
            _scopes = scopes;
            _config = config;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
                var interval = TimeSpan.FromSeconds(Math.Max(5, _config.GetValue("Ai:TickSeconds", 15)));
                while (!stoppingToken.IsCancellationRequested)
                {
                    await TickAsync(stoppingToken);
                    await Task.Delay(interval, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                // The backend is stopping.
            }
        }

        private async Task TickAsync(CancellationToken stoppingToken)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var autopilot = scope.ServiceProvider.GetRequiredService<AutopilotService>();

                var touched = await autopilot.MaintainAsync();
                var enabled = await autopilot.EnabledOrgIdsAsync();
                foreach (var orgId in enabled)
                {
                    if (stoppingToken.IsCancellationRequested) break;
                    var result = await autopilot.RunOrgAsync(orgId, apply: true, "Autopilot", null, stoppingToken);
                    if (result.Applied > 0) _logger.LogInformation("Autopilot: {Message}", result.Message);
                    touched.Remove(orgId);
                    await autopilot.RecallIfNeededAsync(orgId);
                }
                // Organizations changed by a finished loan or a recall (and not planned above) are planned again.
                await autopilot.RefreshAsync(touched);
            }
            catch (Exception ex) when (SafeQuery.IsMissingSchema(ex))
            {
                if (!_missingSchemaReported)
                {
                    _missingSchemaReported = true;
                    _logger.LogWarning("The AI autopilot is waiting for FYP_DB/migrations/025_ai_autopilot.sql to be run.");
                }
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogError(ex, "The AI autopilot failed; it will try again.");
            }
        }
    }
}
