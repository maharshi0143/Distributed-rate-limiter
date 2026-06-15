const redisClient = require('../redis/redisClient');
const { dimensionSignature } = require('../utils/dimensions');

const FIXED_WINDOW_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local duration = tonumber(ARGV[2])
local dry_run = tonumber(ARGV[3])

local count

if dry_run == 0 then
    count = redis.call('incr', key)
    if count == 1 then
        redis.call('expire', key, duration)
    end
else
    count = redis.call('get', key)
    if not count then
        count = 0
    end
end

local allowed = 0
if tonumber(count) <= limit then
    allowed = 1
end

return {allowed, count}
`;

class FixedWindowStrategy {
    async evaluate(rule, dimensions, dryRun) {
        const redisKey = `ratelimit:${rule.id}:${dimensionSignature(dimensions)}`;

        const result = await redisClient.eval(FIXED_WINDOW_SCRIPT, {
            keys: [redisKey],
            arguments: [
                String(rule.limit),
                String(rule.duration),
                dryRun ? "1" : "0"
            ]
        });

        return { allowed: result[0] === 1 };
    }
}

module.exports = new FixedWindowStrategy();
