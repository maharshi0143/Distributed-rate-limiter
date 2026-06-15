const redisClient = require("../redis/redisClient");
const { dimensionSignature } = require("../utils/dimensions");

const TOKEN_BUCKET_SCRIPT = `
local tokens_key = KEYS[1]
local last_refill_key = KEYS[2]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local dry_run = tonumber(ARGV[4])

local tokens = redis.call('get', tokens_key)
local last_refill = redis.call('get', last_refill_key)

if not tokens then
    tokens = capacity
    last_refill = now
else
    tokens = tonumber(tokens)
    last_refill = tonumber(last_refill)
    local elapsed = now - last_refill
    local new_tokens = elapsed * refill_rate
    tokens = math.min(capacity, tokens + new_tokens)
end

if tokens >= 1 then
    if dry_run == 0 then
        redis.call('set', tokens_key, tokens - 1)
        redis.call('set', last_refill_key, now)
    end
    return {1, tokens - 1}
else
    if dry_run == 0 then
        redis.call('set', last_refill_key, now)
    end
    return {0, tokens}
end
`;

class TokenBucketStrategy {
    async evaluate(rule, dimensions, dryRun) {
        const dimensionKey = dimensionSignature(dimensions);
        const tokensKey = `ratelimit:${rule.id}:${dimensionKey}:tokens`;
        const lastRefillKey = `ratelimit:${rule.id}:${dimensionKey}:last_refill`;
        const capacity = rule.burst;
        const refillRate = rule.limit / rule.duration;
        const now = Date.now() / 1000;

        const result = await redisClient.eval(TOKEN_BUCKET_SCRIPT, {
            keys: [tokensKey, lastRefillKey],
            arguments: [
                String(capacity),
                String(refillRate),
                String(now),
                dryRun ? "1" : "0"
            ]
        });

        return { allowed: result[0] === 1 };
    }
}

module.exports = new TokenBucketStrategy();
