const fc = require("fast-check");
const { v4: uuidv4 } = require("uuid");
const redisClient = require("../src/redis/redisClient");
const slidingWindowLogStrategy = require("../src/algorithms/slidingWindowLogStrategy");

beforeAll(async () => {
    await redisClient.connect();
});

afterAll(async () => {
    await redisClient.quit();
});

describe("Sliding Window Log", () => {
    test("sliding window log is strictly accurate", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 5 }),
                fc.integer({ min: 5, max: 30 }),
                async (limit, numRequests) => {
                    const rule = {
                        id: uuidv4(),
                        algorithm: "sliding_window_log",
                        limit: limit,
                        duration: 10
                    };
                    const dims = [{ key: "test", value: uuidv4() }];

                    let allowed = 0;
                    for (let i = 0; i < numRequests; i++) {
                        const result = await slidingWindowLogStrategy.evaluate(rule, dims, false);
                        if (result.allowed) allowed++;
                    }

                    expect(allowed).toBeLessThanOrEqual(limit);
                }
            ),
            { numRuns: 10 }
        );
    });
});
