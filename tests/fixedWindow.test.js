const fc = require("fast-check");
const { v4: uuidv4 } = require("uuid");
const redisClient = require("../src/redis/redisClient");
const fixedWindowStrategy = require("../src/algorithms/fixedWindowStrategy");

beforeAll(async () => {
    await redisClient.connect();
});

afterAll(async () => {
    await redisClient.quit();
});

describe("Fixed Window", () => {
    test("fixed window never allows more than limit within a window", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 30 }),
                async (limit, numRequests) => {
                    const rule = {
                        id: uuidv4(),
                        algorithm: "fixed_window",
                        limit: limit,
                        duration: 60
                    };
                    const dims = [{ key: "test", value: uuidv4() }];

                    let allowed = 0;
                    for (let i = 0; i < numRequests; i++) {
                        const result = await fixedWindowStrategy.evaluate(rule, dims, false);
                        if (result.allowed) allowed++;
                    }

                    expect(allowed).toBeLessThanOrEqual(limit);
                }
            ),
            { numRuns: 10 }
        );
    });

    test("fixed window resets after duration", async () => {
        const rule = {
            id: uuidv4(),
            algorithm: "fixed_window",
            limit: 2,
            duration: 2
        };
        const dims = [{ key: "test", value: uuidv4() }];

        expect((await fixedWindowStrategy.evaluate(rule, dims, false)).allowed).toBe(true);
        expect((await fixedWindowStrategy.evaluate(rule, dims, false)).allowed).toBe(true);
        expect((await fixedWindowStrategy.evaluate(rule, dims, false)).allowed).toBe(false);

        await new Promise(r => setTimeout(r, 2100));

        expect((await fixedWindowStrategy.evaluate(rule, dims, false)).allowed).toBe(true);
    });
});
