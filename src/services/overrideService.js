const redisClient = require("../redis/redisClient");
const pubSub = require("../redis/pubSub");
const { dimensionsMatch } = require("../utils/dimensions");

class OverrideService {
    constructor() {
        this.cache = null;
        this.cacheTimestamp = 0;
        this.cacheTTL = 3600000;

        pubSub.onInvalidate((msg) => {
            if (msg === "overrides" || msg === "all") {
                this.cache = null;
                this.cacheTimestamp = 0;
            }
        });
    }

    async createOverride(override) {
        const key = `override:${override.id}`;
        await redisClient.set(key, JSON.stringify(override));
        await redisClient.expire(key, override.ttl);
        this.cache = null;
        this.cacheTimestamp = 0;
        await pubSub.publish("overrides");
        return override;
    }

    async getOverride(id) {
        const key = `override:${id}`;
        const data = await redisClient.get(key);
        if (!data) return null;
        return JSON.parse(data);
    }

    async getAllOverrides() {
        const now = Date.now();
        if (this.cache && (now - this.cacheTimestamp) < this.cacheTTL) {
            return this.cache;
        }

        const keys = await redisClient.keys("override:*");
        const overrides = [];
        for (const key of keys) {
            const data = await redisClient.get(key);
            if (data) {
                overrides.push(JSON.parse(data));
            }
        }

        this.cache = overrides;
        this.cacheTimestamp = now;
        return overrides;
    }

    async deleteOverride(id) {
        const key = `override:${id}`;
        await redisClient.del(key);
        this.cache = null;
        this.cacheTimestamp = 0;
        await pubSub.publish("overrides");
    }

    async findMatchingOverrides(dimensions) {
        const overrides = await this.getAllOverrides();
        return overrides.filter(override =>
            dimensionsMatch(override.dimensions, dimensions)
        );
    }
}

module.exports = new OverrideService();
