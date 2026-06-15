const fixedWindowStrategy = require("../algorithms/fixedWindowStrategy");

const tokenBucketStrategy = require("../algorithms/tokenBucketStrategy");

const slidingWindowLogStrategy = require("../algorithms/slidingWindowLogStrategy");

const leakyBucketStrategy = require("../algorithms/leakyBucketStrategy");

class RateLimiterService {

    getStrategy(algorithm) {

        switch (algorithm) {

            case "fixed_window":
                return fixedWindowStrategy;

            case "token_bucket":
                return tokenBucketStrategy;

            case "sliding_window_log":
                return slidingWindowLogStrategy;

            case "leaky_bucket":
                return leakyBucketStrategy;

            default:
                throw new Error(
                    "Invalid algorithm"
                );
        }
    }

    async evaluate(
        rule,
        dimensions,
        dryRun
    ) {

        const strategy =
            this.getStrategy(
                rule.algorithm
            );

        return strategy.evaluate(
            rule,
            dimensions,
            dryRun
        );

    }

}

module.exports = new RateLimiterService();