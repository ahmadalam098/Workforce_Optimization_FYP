using System.Net.Http.Json;

namespace fyp_project.Services
{
    /// <summary>
    /// Asks the FYP_AI service (Python / FastAPI) for a plan when Ai:PlannerUrl is set. If it is not set, or the service does not answer,
    /// the built-in planner decides instead, so the autopilot keeps working. The answer is always only advice: the backend checks it.
    /// </summary>
    public class PlannerGateway
    {
        public const string ServiceName = "AI service";

        private readonly HttpClient _http;
        private readonly IConfiguration _config;
        private readonly ILogger<PlannerGateway> _logger;
        private static DateTime _checkedAt = DateTime.MinValue;
        private static bool _lastReachable;

        public PlannerGateway(HttpClient http, IConfiguration config, ILogger<PlannerGateway> logger)
        {
            _http = http;
            _config = config;
            _logger = logger;
        }

        private string? Url => _config["Ai:PlannerUrl"]?.Trim().TrimEnd('/');

        public bool IsConfigured => !string.IsNullOrWhiteSpace(Url);

        public PlanWeights Weights => new(
            _config.GetValue("Ai:Weights:Skill", PlanWeights.Default.Skill),
            _config.GetValue("Ai:Weights:Rating", PlanWeights.Default.Rating),
            _config.GetValue("Ai:Weights:Ownership", PlanWeights.Default.Ownership),
            _config.GetValue("Ai:Weights:Returning", PlanWeights.Default.Returning),
            _config.GetValue("Ai:Weights:Idle", PlanWeights.Default.Idle));

        private HttpRequestMessage Message(HttpMethod method, string path)
        {
            var message = new HttpRequestMessage(method, $"{Url}{path}");
            var key = _config["Ai:ServiceKey"];
            if (!string.IsNullOrWhiteSpace(key)) message.Headers.Add("X-AI-Key", key);
            return message;
        }

        /// <summary>Is the AI service answering? Checked at most every 15 seconds.</summary>
        public async Task<bool> IsReachableAsync(CancellationToken ct = default)
        {
            if (!IsConfigured) return false;
            if (DateTime.UtcNow - _checkedAt < TimeSpan.FromSeconds(15)) return _lastReachable;
            try
            {
                using var response = await _http.SendAsync(Message(HttpMethod.Get, "/health"), ct);
                _lastReachable = response.IsSuccessStatusCode;
            }
            catch (Exception)
            {
                _lastReachable = false;
            }
            _checkedAt = DateTime.UtcNow;
            return _lastReachable;
        }

        /// <summary>Returns the plan and the name of the planner that made it ("AI service" or "Built-in").</summary>
        public async Task<(PlanResponse Plan, string Planner)> PlanAsync(PlanRequest request, CancellationToken ct = default)
        {
            if (IsConfigured)
            {
                try
                {
                    using var message = Message(HttpMethod.Post, "/plan");
                    message.Content = JsonContent.Create(request);
                    using var response = await _http.SendAsync(message, ct);
                    response.EnsureSuccessStatusCode();
                    var plan = await response.Content.ReadFromJsonAsync<PlanResponse>(cancellationToken: ct);
                    if (plan != null)
                    {
                        _lastReachable = true;
                        _checkedAt = DateTime.UtcNow;
                        return (plan, ServiceName);
                    }
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    _lastReachable = false;
                    _checkedAt = DateTime.UtcNow;
                    _logger.LogWarning("The AI service did not answer ({Reason}); the built-in planner is used.", ex.Message);
                }
            }
            return (LocalPlanner.Plan(request), LocalPlanner.Name);
        }
    }
}
