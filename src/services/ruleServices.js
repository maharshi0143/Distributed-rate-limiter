const redisClient = require("../redis/redisClient");
const pubSub = require("../redis/pubSub");

class RuleService {
    constructor() {
        this.cache = null;
        this.cacheTimestamp = 0;
        this.cacheTTL = 3600000;

        pubSub.onInvalidate((msg) => {
            if (msg === "rules" || msg === "all") {
                this.cache = null;
                this.cacheTimestamp = 0;
            }
        });
    }

    async createRule(rule) {
        const key = `rule:${rule.id}`;
        await redisClient.set(key, JSON.stringify(rule));
        this.cache = null;
        this.cacheTimestamp = 0;
        await pubSub.publish("rules");
        return rule;
    }

    async getRule(id) {
        const key = `rule:${id}`;
        const rule = await redisClient.get(key);
        if (!rule) return null;
        return JSON.parse(rule);
    }

    async getAllRules() {
        const now = Date.now();
        if (this.cache && (now - this.cacheTimestamp) < this.cacheTTL) {
            return this.cache;
        }

        const keys = await redisClient.keys("rule:*");
        const rules = [];
        for (const key of keys) {
            const rule = await redisClient.get(key);
            if (rule) {
                rules.push(JSON.parse(rule));
            }
        }

        this.cache = rules;
        this.cacheTimestamp = now;
        return rules;
    }

    async updateRule(id, updatedRule) {
        const key = `rule:${id}`;
        await redisClient.set(key, JSON.stringify(updatedRule));
        this.cache = null;
        this.cacheTimestamp = 0;
        await pubSub.publish("rules");
        return updatedRule;
    }

    async deleteRule(id) {
        const key = `rule:${id}`;
        await redisClient.del(key);
        this.cache = null;
        this.cacheTimestamp = 0;
        await pubSub.publish("rules");
    }

    forceRefresh() {
        this.cache = null;
        this.cacheTimestamp = 0;
    }
}

module.exports = new RuleService();
