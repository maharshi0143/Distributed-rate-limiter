const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const path = require("path");
const Redis = require("ioredis");

async function main() {
    // Direct Redis test
    const redis = new Redis("redis://localhost:6379", { lazyConnect: true });
    await redis.connect();

    console.log("=== Redis eval latency ===");
    const evalTimes = [];
    for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await redis.eval("return 1", 0);
        evalTimes.push(Date.now() - start);
    }
    evalTimes.sort((a, b) => a - b);
    console.log("  Avg:", (evalTimes.reduce((a, b) => a + b, 0) / evalTimes.length).toFixed(3) + "ms");
    console.log("  p50:", evalTimes[50] + "ms");
    console.log("  p90:", evalTimes[90] + "ms");
    console.log("  p99:", evalTimes[99] + "ms");

    // Lua eval with fixed window script
    console.log("\n=== Fixed window Lua eval ===");
    const fwTimes = [];
    const SCRIPT = `
        local key = KEYS[1]; local limit = tonumber(ARGV[1]); local dur = tonumber(ARGV[2]);
        local dry = tonumber(ARGV[3]); local count; 
        if dry == 0 then count = redis.call('incr', key); if count == 1 then redis.call('expire', key, dur) end
        else count = redis.call('get', key); if not count then count = 0 end end
        return {count <= limit and 1 or 0, count}
    `;
    for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await redis.eval(SCRIPT, 1, "perf:fw:" + i, "100000", "60", "0");
        fwTimes.push(Date.now() - start);
    }
    fwTimes.sort((a, b) => a - b);
    console.log("  Avg:", (fwTimes.reduce((a, b) => a + b, 0) / fwTimes.length).toFixed(3) + "ms");
    console.log("  p50:", fwTimes[50] + "ms");
    console.log("  p90:", fwTimes[90] + "ms");
    console.log("  p99:", fwTimes[99] + "ms");

    // gRPC test
    console.log("\n=== gRPC Evaluate (warm cache) ===");
    const pkgDef = loader.loadSync(path.join(__dirname, "..", "src", "proto", "rate_limiter.proto"));
    const proto = grpc.loadPackageDefinition(pkgDef).rate_limiter;
    const c = new proto.RateLimiter("localhost:50051", grpc.credentials.createInsecure());

    const grpcTimes = [];
    for (let i = 0; i < 100; i++) {
        await new Promise((resolve, reject) => {
            const start = Date.now();
            c.Evaluate({ dimensions: [{ key: "user_id", value: "load-test" }], dry_run: false }, (err, res) => {
                grpcTimes.push(Date.now() - start);
                if (err) reject(err);
                else resolve(res);
            });
        });
    }
    c.close();
    grpcTimes.sort((a, b) => a - b);
    console.log("  Avg:", (grpcTimes.reduce((a, b) => a + b, 0) / grpcTimes.length).toFixed(3) + "ms");
    console.log("  p50:", grpcTimes[50] + "ms");
    console.log("  p90:", grpcTimes[90] + "ms");
    console.log("  p99:", grpcTimes[99] + "ms");

    await redis.quit();
}

main().catch(console.error);
