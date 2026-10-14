using StackExchange.Redis;

namespace fyp_project.Services
{
    public class RedisService
    {
        private readonly IConnectionMultiplexer _redis;

        public RedisService(IConnectionMultiplexer redis)
        {
            _redis = redis;
        }

        // SAVE
        public async Task SaveAsync(
            string key,
            string value,
            int minutes)
        {
            IDatabase db = _redis.GetDatabase();

            await db.StringSetAsync(
                key,
                value,
                TimeSpan.FromMinutes(minutes)
            );
        }


        // GET
        public async Task<string?> GetAsync(string key)
        {
            IDatabase db = _redis.GetDatabase();

            var value =
                await db.StringGetAsync(key);

            if (!value.HasValue)
            {
                return null;
            }

            return value.ToString();
        }


        // DELETE
        public async Task DeleteAsync(string key)
        {
            IDatabase db = _redis.GetDatabase();

            await db.KeyDeleteAsync(key);
        }
    }
}