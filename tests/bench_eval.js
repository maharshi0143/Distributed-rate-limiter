const Redis = require("ioredis");

const SCRIPT = `
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
    if not count then count = 0 end
end
return {count <= limit and 1 or 0, count}
`;

async function main() {
    const pool = [];
    for (let i = 0; i < 50; i++) {
        const c = new Redis("redis://localhost:6379", { lazyConnect: true });
        await c.connect();
        pool.push(c);
    }

    const N = 50000;
    const start = Date.now();
    let idx = 0;
    const promises = [];
    for (let i = 0; i < N; i++) {
        const c = pool[idx];
        idx = (idx + 1) % pool.length;
        const k = "bench:" + (i % 100);
        promises.push(c.eval(SCRIPT, 1, k, "100000", "60", "0"));
    }
    await Promise.all(promises);
    const total = Date.now() - start;
    console.log(N + " evals in " + total + "ms = " + (total / N).toFixed(3) + "ms avg, " + (N / (total / 1000)).toFixed(0) + "/s");

    for (const c of pool) {
        await c.del("bench:*");
        await c.quit();
    }
}

main().catch(console.error);
