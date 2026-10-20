using System.Collections.Concurrent;
using StackExchange.Redis;

namespace fyp_project.Services
{
    /// <summary>
    /// Short-lived values (OTP codes, reset permissions) kept in Redis. When Redis cannot be reached (no internet, the cloud database is
    /// asleep) the values are kept in this server's memory instead, so sign-in, forgot password and OTP keep working; they are lost when the
    /// backend restarts, which is fine for codes that live a few minutes.
    /// </summary>
    public class RedisService
    {
        private readonly IConnectionMultiplexer _redis;
        private readonly ILogger<RedisService> _log;
        private static readonly ConcurrentDictionary<string, (string Value, DateTime ExpiresAt)> Memory = new();

        public RedisService(IConnectionMultiplexer redis, ILogger<RedisService> log)
        {
            _redis = redis;
            _log = log;
        }

        private bool Online => _redis.IsConnected;

        // SAVE
        public async Task SaveAsync(
            string key,
            string value,
            int minutes)
        {
            if (Online)
            {
                try
                {
                    await _redis.GetDatabase().StringSetAsync(key, value, TimeSpan.FromMinutes(minutes));
                    return;
                }
                catch (RedisException ex)
                {
                    _log.LogWarning(ex, "Redis save failed, keeping {Key} in memory.", key);
                }
            }
            Memory[key] = (value, DateTime.UtcNow.AddMinutes(minutes));
        }


        // GET
        public async Task<string?> GetAsync(string key)
        {
            if (Memory.TryGetValue(key, out var kept))
            {
                if (kept.ExpiresAt > DateTime.UtcNow) return kept.Value;
                Memory.TryRemove(key, out _);
            }

            if (!Online) return null;
            try
            {
                var value = await _redis.GetDatabase().StringGetAsync(key);
                return value.HasValue ? value.ToString() : null;
            }
            catch (RedisException ex)
            {
                _log.LogWarning(ex, "Redis read failed for {Key}.", key);
                return null;
            }
        }


        // DELETE
        public async Task DeleteAsync(string key)
        {
            Memory.TryRemove(key, out _);
            if (!Online) return;
            try
            {
                await _redis.GetDatabase().KeyDeleteAsync(key);
            }
            catch (RedisException ex)
            {
                _log.LogWarning(ex, "Redis delete failed for {Key}.", key);
            }
        }
    }
}
