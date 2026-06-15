const fc = require("fast-check");
const { v4: uuidv4 } = require("uuid");
const redisClient = require("../src/redis/redisClient");
const tokenBucketStrategy = require("../src/algorithms/tokenBucketStrategy");

beforeAll(async () => {
    await redisClient.connect();
});

afterAll(async () => {
    await redisClient.quit();
});

describe("Token Bucket", () => {
    test("token bucket never allows more than burst capacity", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 20 }),
                fc.integer({ min: 1, max: 50 }),
                async (burst, refillRate, numRequests) => {
                    const rule = {
                        id: uuidv4(),
                        algorithm: "token_bucket",
                        limit: refillRate,
                        duration: 60,
                        burst: burst
                    };
                    const dims = [{ key: "test", value: uuidv4() }];

                    let allowed = 0;
                    for (let i = 0; i < numRequests; i++) {
                        const result = await tokenBucketStrategy.evaluate(rule, dims, false);
                        if (result.allowed) allowed++;
                    }

                    expect(allowed).toBeLessThanOrEqual(burst);
                }
            ),
            { numRuns: 10 }
        );
    });

    test("token bucket allows requests after refill", async () => {
        const ruleId = uuidv4();
        const dims = [{ key: "test", value: uuidv4() }];
        const rule = {
            id: ruleId,
            algorithm: "token_bucket",
            limit: 60,
            duration: 60,
            burst: 1
        };

        expect((await tokenBucketStrategy.evaluate(rule, dims, false)).allowed).toBe(true);
        expect((await tokenBucketStrategy.evaluate(rule, dims, false)).allowed).toBe(false);

        await new Promise(r => setTimeout(r, 1100));

        expect((await tokenBucketStrategy.evaluate(rule, dims, false)).allowed).toBe(true);
    });
});
