using Microsoft.AspNetCore.Mvc;
using StackExchange.Redis;

namespace fyp_project.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class RedisTestingController : ControllerBase
    {
        private readonly IConnectionMultiplexer _redis;

        public RedisTestingController(IConnectionMultiplexer redis)
        {
            _redis = redis;
        }

        [HttpGet("redis")]
        public IActionResult TestRedis()
        {
            IDatabase db = _redis.GetDatabase();

            db.StringSet("foo", "bar");

            RedisValue result = db.StringGet("foo");

            return Ok(new
            {
                result = result.ToString()
            });
        }
    }
}