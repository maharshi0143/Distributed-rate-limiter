const redisClient = require("../redis/redisClient");
const { dimensionSignature } = require("../utils/dimensions");

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_duration = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]
local dry_run = tonumber(ARGV[5])

local window_start = now - (window_duration * 1000)

redis.call('zremrangebyscore', key, 0, window_start)

local count = redis.call('zcard', key)

if count >= limit then
    return {0, count}
end

if dry_run == 0 then
    redis.call('zadd', key, now, member)
    redis.call('expire', key, window_duration)
end

return {1, count + 1}
`;

class SlidingWindowLogStrategy {
    async evaluate(rule, dimensions, dryRun) {
        const redisKey = `ratelimit:${rule.id}:${dimensionSignature(dimensions)}`;
        const now = Date.now();
        const windowDurationSec = rule.duration;
        const member = `${now}-${Math.random()}`;

        const result = await redisClient.eval(SLIDING_WINDOW_SCRIPT, {
            keys: [redisKey],
            arguments: [
                String(rule.limit),
                String(windowDurationSec),
                String(now),
                member,
                dryRun ? "1" : "0"
            ]
        });

        return { allowed: result[0] === 1 };
    }
}

module.exports = new SlidingWindowLogStrategy();
