const fc = require("fast-check");
const { v4: uuidv4 } = require("uuid");
const redisClient = require("../src/redis/redisClient");
const rateLimiterService = require("../src/services/rateLimiterService");

beforeAll(async () => {
    await redisClient.connect();
});

afterAll(async () => {
    await redisClient.quit();
});

describe("Composite Limits", () => {
    test("composite limits are always the most restrictive", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 2, max: 10 }),
                fc.integer({ min: 1, max: 5 }),
                async (ruleALimit, ruleBLimit) => {
                    const userId = uuidv4();
                    const endpoint = uuidv4();

                    const ruleA = {
                        id: uuidv4(),
                        dimensions: [{ key: "user_id", value: userId }],
                        algorithm: "fixed_window",
                        limit: Math.max(ruleALimit, ruleBLimit),
                        duration: 60
                    };

                    const ruleB = {
                        id: uuidv4(),
                        dimensions: [{ key: "endpoint", value: endpoint }],
                        algorithm: "fixed_window",
                        limit: Math.min(ruleALimit, ruleBLimit),
                        duration: 60
                    };

                    const expectedLimit = Math.min(ruleA.limit, ruleB.limit);

                    let allowed = 0;
                    for (let i = 0; i < expectedLimit + 5; i++) {
                        const resultA = await rateLimiterService.evaluate(ruleA, [{ key: "user_id", value: userId }], false);
                        const resultB = await rateLimiterService.evaluate(ruleB, [{ key: "endpoint", value: endpoint }], false);

                        const result = { allowed: resultA.allowed && resultB.allowed };
                        if (result.allowed) allowed++;
                    }

                    expect(allowed).toBe(expectedLimit);
                }
            ),
            { numRuns: 5 }
        );
    });
});
