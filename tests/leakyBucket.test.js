const fc = require("fast-check");
const { v4: uuidv4 } = require("uuid");
const redisClient = require("../src/redis/redisClient");
const leakyBucketStrategy = require("../src/algorithms/leakyBucketStrategy");

beforeAll(async () => {
    await redisClient.connect();
});

afterAll(async () => {
    await redisClient.quit();
});

describe("Leaky Bucket", () => {
    test("leaky bucket never allows more than burst capacity at once", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 5 }),
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 30 }),
                async (burst, leakRate, numRequests) => {
                    const rule = {
                        id: uuidv4(),
                        algorithm: "leaky_bucket",
                        limit: leakRate,
                        duration: 60,
                        burst: burst
                    };
                    const dims = [{ key: "test", value: uuidv4() }];

                    let allowed = 0;
                    for (let i = 0; i < numRequests; i++) {
                        const result = await leakyBucketStrategy.evaluate(rule, dims, false);
                        if (result.allowed) allowed++;
                    }

                    expect(allowed).toBeLessThanOrEqual(burst);
                }
            ),
            { numRuns: 10 }
        );
    });
});
