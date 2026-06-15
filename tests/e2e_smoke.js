const http = require("http");

const BASE_URL = "http://localhost:3000";

function httpRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: "localhost",
            port: 3000,
            path: path,
            method: method,
            headers: { "Content-Type": "application/json" }
        };
        const req = http.request(opts, (res) => {
            let data = "";
            res.on("data", (c) => data += c);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function grpcEvaluate(dimensions, dryRun) {
    return new Promise((resolve, reject) => {
        const grpc = require("@grpc/grpc-js");
        const loader = require("@grpc/proto-loader");
        const path = require("path");
        const pkgDef = loader.loadSync(path.join(__dirname, "..", "src", "proto", "rate_limiter.proto"));
        const proto = grpc.loadPackageDefinition(pkgDef).rate_limiter;
        const c = new proto.RateLimiter("localhost:50051", grpc.credentials.createInsecure());

        const timeout = setTimeout(() => { c.close(); reject(new Error("timeout")); }, 5000);
        c.Evaluate({ dimensions, dry_run: dryRun }, (err, res) => {
            clearTimeout(timeout);
            c.close();
            if (err) reject(err);
            else resolve(res);
        });
    });
}

function assert(condition, msg) {
    if (!condition) { console.error("FAIL:", msg); process.exit(1); }
    console.log("  PASS:", msg);
}

async function main() {
    console.log("=== E2E Smoke Test ===\n");

    // 1. Create Rule
    console.log("1. REST API - Create Rule");
    const createRes = await httpRequest("POST", "/rules", {
        dimensions: [{ key: "ip", value: "1.2.3.4" }],
        algorithm: "fixed_window",
        limit: 3,
        duration: 10
    });
    assert(createRes.status === 201, "POST /rules returns 201");
    const ruleId = createRes.body.rule.id;
    assert(ruleId, "Rule has an id");

    // 2. Get Rule
    console.log("\n2. REST API - Get Rule");
    const getRes = await httpRequest("GET", `/rules/${ruleId}`);
    assert(getRes.status === 200, "GET /rules/:id returns 200");
    assert(getRes.body.id === ruleId, "Rule id matches");

    // 3. Fixed Window - 3 ALLOWED
    console.log("\n3. Fixed Window - 3 calls ALLOWED");
    for (let i = 0; i < 3; i++) {
        const r = await grpcEvaluate([{ key: "ip", value: "1.2.3.4" }], false);
        assert(r.decision === 1, `Call ${i + 1} ALLOWED (got ${r.decision})`);
    }

    // 4. Fixed Window - 4th DENIED
    console.log("\n4. Fixed Window - 4th call DENIED");
    const denied = await grpcEvaluate([{ key: "ip", value: "1.2.3.4" }], false);
    assert(denied.decision === 2, `4th call DENIED (got ${denied.decision})`);

    // 5. Delete Rule
    console.log("\n5. REST API - Delete Rule");
    const delRes = await httpRequest("DELETE", `/rules/${ruleId}`);
    assert(delRes.status === 204, "DELETE /rules/:id returns 204");

    // 6. Get Deleted Rule
    console.log("\n6. REST API - Get Deleted Rule");
    const getDelRes = await httpRequest("GET", `/rules/${ruleId}`);
    assert(getDelRes.status === 404, "GET deleted rule returns 404");

    // 7. Create Override
    console.log("\n7. REST API - Create Override");
    const ovrRes = await httpRequest("POST", "/overrides", {
        dimensions: [{ key: "user_id", value: "test-user" }],
        limit: 5000,
        ttl: 15
    });
    assert(ovrRes.status === 201, "POST /overrides returns 201");
    assert(ovrRes.body.id, "Override has an id");

    // 8. Token Bucket
    console.log("\n8. Token Bucket - 2 ALLOWED, 3rd DENIED, wait refill, ALLOWED");
    const tbRule = await httpRequest("POST", "/rules", {
        dimensions: [{ key: "api_key", value: "key-abc" }],
        algorithm: "token_bucket",
        limit: 5,
        duration: 60,
        burst: 2
    });
    const tbRuleId = tbRule.body.rule.id;

    const r1 = await grpcEvaluate([{ key: "api_key", value: "key-abc" }], false);
    assert(r1.decision === 1, "Token Bucket call 1 ALLOWED");
    const r2 = await grpcEvaluate([{ key: "api_key", value: "key-abc" }], false);
    assert(r2.decision === 1, "Token Bucket call 2 ALLOWED");
    const r3 = await grpcEvaluate([{ key: "api_key", value: "key-abc" }], false);
    assert(r3.decision === 2, "Token Bucket call 3 DENIED");

    console.log("  Waiting 12s for token refill...");
    await new Promise(r => setTimeout(r, 12000));

    const r4 = await grpcEvaluate([{ key: "api_key", value: "key-abc" }], false);
    assert(r4.decision === 1, "Token Bucket call after refill ALLOWED");

    // Cleanup token bucket rule
    await httpRequest("DELETE", `/rules/${tbRuleId}`);

    console.log("\n=== ALL E2E TESTS PASSED ===");
    process.exit(0);
}

main().catch(err => {
    console.error("E2E test failed:", err);
    process.exit(1);
});
