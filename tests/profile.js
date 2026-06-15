const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const path = require("path");

async function main() {
    const pkgDef = loader.loadSync(path.join(__dirname, "..", "src", "proto", "rate_limiter.proto"));
    const proto = grpc.loadPackageDefinition(pkgDef).rate_limiter;
    const c = new proto.RateLimiter("localhost:50051", grpc.credentials.createInsecure());

    const N = 100;
    const times = [];
    for (let i = 0; i < N; i++) {
        await new Promise((resolve, reject) => {
            const start = Date.now();
            c.Evaluate({ dimensions: [{ key: "user_id", value: "load-test" }], dry_run: false }, (err, res) => {
                times.push(Date.now() - start);
                if (err) reject(err);
                else resolve(res);
            });
        });
    }
    c.close();

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log("N:", N);
    console.log("Avg:", avg.toFixed(2) + "ms");
    console.log("p50:", times[Math.floor(N * 0.5)] + "ms");
    console.log("p90:", times[Math.floor(N * 0.9)] + "ms");
    console.log("p99:", times[Math.floor(N * 0.99)] + "ms");
    console.log("Min:", times[0] + "ms");
    console.log("Max:", times[times.length - 1] + "ms");
}

main().catch(console.error);
