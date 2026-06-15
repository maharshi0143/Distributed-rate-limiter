const redisClient = require("../redis/redisClient");
const { dimensionSignature } = require("../utils/dimensions");

const LEAKY_BUCKET_SCRIPT = `
local queue_key = KEYS[1]
local last_leak_key = KEYS[2]
local capacity = tonumber(ARGV[1])
local leak_interval = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local dry_run = tonumber(ARGV[4])

local queue = redis.call('get', queue_key)
local last_leak = redis.call('get', last_leak_key)

if not queue then
    queue = 0
    last_leak = now
else
    queue = tonumber(queue)
    last_leak = tonumber(last_leak)
    local elapsed = now - last_leak
    local units_to_leak = math.floor(elapsed / leak_interval)
    if units_to_leak > 0 then
        queue = math.max(0, queue - units_to_leak)
        last_leak = last_leak + (units_to_leak * leak_interval)
    end
end

if queue >= capacity then
    if dry_run == 0 then
        redis.call('set', last_leak_key, last_leak)
        redis.call('set', queue_key, queue)
    end
    return {0, queue}
end

if dry_run == 0 then
    queue = queue + 1
    redis.call('set', queue_key, queue)
    redis.call('set', last_leak_key, last_leak)
end

return {1, capacity - queue}
`;

class LeakyBucketStrategy {
    async evaluate(rule, dimensions, dryRun) {
        const dimensionKey = dimensionSignature(dimensions);
        const queueKey = `ratelimit:${rule.id}:${dimensionKey}:queue`;
        const lastLeakKey = `ratelimit:${rule.id}:${dimensionKey}:last_leak`;
        const capacity = rule.burst;
        const leakInterval = rule.duration / rule.limit;
        const now = Date.now() / 1000;

        const result = await redisClient.eval(LEAKY_BUCKET_SCRIPT, {
            keys: [queueKey, lastLeakKey],
            arguments: [
                String(capacity),
                String(leakInterval),
                String(now),
                dryRun ? "1" : "0"
            ]
        });

        return { allowed: result[0] === 1 };
    }
}

module.exports = new LeakyBucketStrategy();
