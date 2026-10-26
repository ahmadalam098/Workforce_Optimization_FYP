using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using fyp_project.Models;
using Microsoft.Extensions.Options;

namespace fyp_project.Services
{
    /// <summary>
    /// appsettings.json -> "Safepay". The keys come from the Safepay dashboard (Developer > API); WebhookSecret is the separate "shared secret" of the
    /// webhook endpoint (Developer > Endpoints > View shared secret). Keep all of them only in appsettings.json (it is not committed).
    /// </summary>
    public class SafepayOptions
    {
        /// <summary>"sandbox" (test money) or "production" (real money).</summary>
        public string Environment { get; set; } = "sandbox";
        /// <summary>The public key ("sec_...") - Safepay calls it merchant_api_key.</summary>
        public string PublicKey { get; set; } = string.Empty;
        /// <summary>The secret key: signs every server call (header X-SFPY-MERCHANT-SECRET). Never sent to a browser.</summary>
        public string SecretKey { get; set; } = string.Empty;
        /// <summary>Optional: the webhook shared secret. When set, every webhook must carry a valid X-SFPY-SIGNATURE.</summary>
        public string? WebhookSecret { get; set; }
        /// <summary>Where the organization's browser comes back after paying (the React portal).</summary>
        public string ReturnBaseUrl { get; set; } = "http://localhost:5173";

        public bool IsProduction => string.Equals(Environment, "production", StringComparison.OrdinalIgnoreCase);
        public string ApiBase => IsProduction ? "https://api.getsafepay.com" : "https://sandbox.api.getsafepay.com";
        public string CheckoutBase => IsProduction ? "https://getsafepay.com" : "https://sandbox.api.getsafepay.com";
        public bool Configured => !string.IsNullOrWhiteSpace(PublicKey) && !string.IsNullOrWhiteSpace(SecretKey);
    }

    /// <summary>What Safepay says about one payment session (tracker).</summary>
    public record SafepayTracker(string Token, string State, long? Amount, string? Currency, string? OrderId);

    /// <summary>
    /// The three Safepay calls we need (checked against the sandbox):
    ///   POST /order/payments/v3/              create the payment session (tracker) for an amount in minor units (paisa / cents)
    ///   POST /client/passport/v1/token        a short-lived token (1 hour) the hosted checkout page needs ("tbt")
    ///   GET  /reporter/api/v1/payments/{t}    the state of a tracker: TRACKER_ENDED = paid
    /// Every call carries the secret key in X-SFPY-MERCHANT-SECRET.
    /// </summary>
    public class SafepayClient
    {
        private readonly HttpClient _http;
        private readonly SafepayOptions _options;

        public SafepayClient(HttpClient http, IOptions<SafepayOptions> options)
        {
            _http = http;
            _options = options.Value;
            _http.BaseAddress = new Uri(_options.ApiBase);
            _http.Timeout = TimeSpan.FromSeconds(20);
        }

        public SafepayOptions Options => _options;

        private HttpRequestMessage Request(HttpMethod method, string path, object? body = null)
        {
            var request = new HttpRequestMessage(method, path);
            request.Headers.Add("X-SFPY-MERCHANT-SECRET", _options.SecretKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            request.Content = new StringContent(body == null ? string.Empty : JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            return request;
        }

        private async Task<JsonElement> SendAsync(HttpRequestMessage request)
        {
            using var response = await _http.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                throw new SafepayException($"Safepay answered {(int)response.StatusCode}: {Shorten(text)}");
            try { return JsonDocument.Parse(text).RootElement.Clone(); }
            catch (JsonException) { throw new SafepayException($"Safepay sent something that is not JSON: {Shorten(text)}"); }
        }

        private static string Shorten(string text) => text.Length > 300 ? text[..300] + "..." : text;

        /// <summary>The amount in the currency's smallest unit, as Safepay wants it (PKR 1,500.00 -> 150000).</summary>
        public static long ToMinor(decimal amount) => (long)Math.Round(amount * 100m, 0, MidpointRounding.AwayFromZero);

        public async Task<string> CreateTrackerAsync(decimal amount, string currency, string orderId)
        {
            var root = await SendAsync(Request(HttpMethod.Post, "/order/payments/v3/", new
            {
                merchant_api_key = _options.PublicKey,
                intent = "CYBERSOURCE",
                mode = "payment",
                currency,
                amount = ToMinor(amount),
                metadata = new { order_id = orderId },
            }));
            if (root.TryGetProperty("data", out var data) && data.TryGetProperty("tracker", out var tracker) && tracker.TryGetProperty("token", out var token) && token.GetString() is { Length: > 0 } value)
                return value;
            throw new SafepayException("Safepay did not return a payment session.");
        }

        public async Task<string> PassportAsync()
        {
            var root = await SendAsync(Request(HttpMethod.Post, "/client/passport/v1/token"));
            if (root.TryGetProperty("data", out var data))
            {
                if (data.ValueKind == JsonValueKind.String && data.GetString() is { Length: > 0 } text) return text;
                if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty("token", out var token) && token.GetString() is { Length: > 0 } inner) return inner;
            }
            throw new SafepayException("Safepay did not return a checkout token.");
        }

        public async Task<SafepayTracker> GetTrackerAsync(string tracker)
        {
            var root = await SendAsync(Request(HttpMethod.Get, $"/reporter/api/v1/payments/{Uri.EscapeDataString(tracker)}"));
            if (!root.TryGetProperty("data", out var data)) throw new SafepayException("Safepay did not return the payment.");
            // Two shapes appear in Safepay's documentation: data.state and data.tracker.state.
            var node = data.TryGetProperty("tracker", out var inner) && inner.ValueKind == JsonValueKind.Object ? inner : data;
            var state = node.TryGetProperty("state", out var s) ? s.GetString() ?? string.Empty : string.Empty;

            long? amount = null;
            string? currency = null;
            if (node.TryGetProperty("purchase_totals", out var totals) && totals.TryGetProperty("quote_amount", out var quote))
            {
                if (quote.TryGetProperty("amount", out var a) && a.TryGetInt64(out var minor)) amount = minor;
                currency = quote.TryGetProperty("currency", out var c) ? c.GetString() : null;
            }
            string? orderId = null;
            if (node.TryGetProperty("metadata", out var meta) && meta.ValueKind == JsonValueKind.Object && meta.TryGetProperty("order_id", out var order))
                orderId = order.ValueKind == JsonValueKind.Object && order.TryGetProperty("value", out var v) ? v.GetString() : order.ValueKind == JsonValueKind.String ? order.GetString() : null;
            return new SafepayTracker(tracker, state, amount, currency, orderId);
        }

        /// <summary>The hosted checkout page. Safepay appends ?tracker=... to the return address, so our own key is in the path.</summary>
        public string CheckoutUrl(string tracker, string passport, string returnUrl, string cancelUrl)
        {
            var query = new Dictionary<string, string>
            {
                ["environment"] = _options.IsProduction ? "production" : "sandbox",
                ["tracker"] = tracker,
                ["source"] = "hosted",
                ["tbt"] = passport,
                ["redirect_url"] = returnUrl,
                ["cancel_url"] = cancelUrl,
            };
            return $"{_options.CheckoutBase}/embedded?" + string.Join("&", query.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));
        }

        /// <summary>X-SFPY-SIGNATURE = hex(HMAC-SHA512(webhook shared secret, raw request body)). Compared without caring about letter case.</summary>
        public static bool SignatureMatches(byte[] body, string? signature, string secret)
        {
            if (string.IsNullOrWhiteSpace(signature)) return false;
            using var hmac = new HMACSHA512(Encoding.UTF8.GetBytes(secret));
            var expected = Convert.ToHexString(hmac.ComputeHash(body));
            var given = signature.Trim();
            return given.Length == expected.Length && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(given.ToUpperInvariant()));
        }
    }

    public class SafepayException : Exception
    {
        public SafepayException(string message) : base(message) { }
    }

    /// <summary>
    /// Safepay behind "Pay online". The organization is sent to Safepay's hosted page; the result is never taken from the browser: we always ask
    /// Safepay's server for the state of the tracker (after the organization comes back, when the webhook arrives, or when the admin checks it).
    /// </summary>
    public class SafepayGateway : IPaymentGateway
    {
        public static readonly string[] Currencies = { "PKR", "USD", "GBP", "EUR", "CAD", "AED", "SAR" };

        private readonly SafepayClient _client;

        public SafepayGateway(SafepayClient client)
        {
            _client = client;
        }

        public string Name => "Safepay";
        public bool IsDemo => false;
        public string MethodLabel => "Online - Safepay";

        public async Task<GatewayCheckout> CreateCheckoutAsync(OnlinePayment online, string? invoiceNumber)
        {
            if (!_client.Options.Configured) return GatewayCheckout.Fail("Safepay is not set up on the server (keys missing). Ask the admin.");
            if (!Currencies.Contains(online.Currency)) return GatewayCheckout.Fail($"Safepay does not take {online.Currency}. Pay by bank transfer and tell us about the payment instead.");
            try
            {
                var tracker = await _client.CreateTrackerAsync(online.Amount, online.Currency, invoiceNumber ?? $"OP-{online.OnlinePaymentId}");
                var passport = await _client.PassportAsync();
                var back = _client.Options.ReturnBaseUrl.TrimEnd('/');
                var url = _client.CheckoutUrl(tracker, passport, $"{back}/pay/safepay/return/{online.Token}", $"{back}/pay/safepay/cancel/{online.Token}");
                return new GatewayCheckout(true, url, tracker, null);
            }
            catch (Exception ex) when (ex is SafepayException or HttpRequestException or TaskCanceledException)
            {
                return GatewayCheckout.Fail($"Safepay could not be reached right now. Try again in a moment. ({ex.Message})");
            }
        }

        public async Task<GatewayStatus> CheckAsync(OnlinePayment online)
        {
            if (string.IsNullOrEmpty(online.GatewayReference)) return new GatewayStatus(GatewayStatus.Pending, null, "No Safepay session.");
            SafepayTracker tracker;
            try { tracker = await _client.GetTrackerAsync(online.GatewayReference); }
            catch (Exception ex) when (ex is SafepayException or HttpRequestException or TaskCanceledException)
            {
                return new GatewayStatus(GatewayStatus.Unknown, online.GatewayReference, ex.Message);
            }

            switch (tracker.State)
            {
                case "TRACKER_ENDED":
                    // Paid. The money must be exactly what this checkout asked for.
                    if (tracker.Amount != null && (tracker.Amount != SafepayClient.ToMinor(online.Amount) || !string.Equals(tracker.Currency, online.Currency, StringComparison.OrdinalIgnoreCase)))
                        return new GatewayStatus(GatewayStatus.Failed, tracker.Token, $"Safepay reports {(tracker.Amount / 100m)?.ToString("0.00", CultureInfo.InvariantCulture)} {tracker.Currency}, not {online.Amount:0.00} {online.Currency}. The admin will check it.");
                    return new GatewayStatus(GatewayStatus.Paid, tracker.Token, null);
                case "TRACKER_CANCELLED":
                case "TRACKER_EXPIRED":
                case "TRACKER_VOIDED":
                    return new GatewayStatus(GatewayStatus.Cancelled, tracker.Token, $"Safepay: {tracker.State}");
                case "TRACKER_REVERSED":
                case "TRACKER_REFUNDED":
                case "TRACKER_DISPUTED":
                    return new GatewayStatus(GatewayStatus.Failed, tracker.Token, $"Safepay: {tracker.State}");
                default:
                    return new GatewayStatus(GatewayStatus.Pending, tracker.Token, $"Safepay: {tracker.State}");
            }
        }
    }
}
