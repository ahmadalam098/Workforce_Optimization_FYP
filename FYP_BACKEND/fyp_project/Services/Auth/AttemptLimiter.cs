using System.Collections.Concurrent;

namespace fyp_project.Services
{
    /// <summary>
    /// Small in-memory counter used to slow down password guessing, OTP guessing and OTP e-mail flooding.
    /// A key (for example "login:ali@x.com") may be hit <c>max</c> times inside <c>window</c>; after that it is blocked until the window ends.
    /// State is per server process (fine for one backend; a restart clears it).
    /// </summary>
    public sealed class AttemptLimiter
    {
        private sealed class Entry { public int Count; public DateTime Start; }
        private readonly ConcurrentDictionary<string, Entry> _entries = new();
        private DateTime _lastSweep = DateTime.UtcNow;

        /// <summary>True (and the seconds to wait) when the key already used up its attempts.</summary>
        public bool IsBlocked(string key, int max, TimeSpan window, out int retryAfterSeconds)
        {
            Sweep(window);
            retryAfterSeconds = 0;
            if (!_entries.TryGetValue(key, out var e)) return false;
            lock (e)
            {
                var end = e.Start + window;
                if (DateTime.UtcNow >= end) { _entries.TryRemove(key, out _); return false; }
                if (e.Count < max) return false;
                retryAfterSeconds = Math.Max(1, (int)Math.Ceiling((end - DateTime.UtcNow).TotalSeconds));
                return true;
            }
        }

        /// <summary>Counts one attempt (a failed login, a wrong OTP, an OTP e-mail sent...). Returns the new count.</summary>
        public int Hit(string key, TimeSpan window)
        {
            var e = _entries.GetOrAdd(key, _ => new Entry { Start = DateTime.UtcNow });
            lock (e)
            {
                if (DateTime.UtcNow >= e.Start + window) { e.Start = DateTime.UtcNow; e.Count = 0; }
                return ++e.Count;
            }
        }

        public void Reset(string key) => _entries.TryRemove(key, out _);

        private void Sweep(TimeSpan window)
        {
            if (DateTime.UtcNow - _lastSweep < TimeSpan.FromMinutes(5)) return;
            _lastSweep = DateTime.UtcNow;
            var cutoff = DateTime.UtcNow - TimeSpan.FromHours(1);
            foreach (var kv in _entries) if (kv.Value.Start < cutoff) _entries.TryRemove(kv.Key, out _);
        }

        public static string Ip(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        /// <summary>A valid BCrypt hash that matches nothing: verifying against it makes "unknown user" take as long as "wrong password".</summary>
        public static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString("N"));

        public static bool LooksLikeEmail(string? email)
        {
            if (string.IsNullOrWhiteSpace(email) || email.Length > 254) return false;
            if (email.Any(char.IsWhiteSpace)) return false;
            try { var a = new System.Net.Mail.MailAddress(email); return a.Address == email; } catch { return false; }
        }
    }
}
