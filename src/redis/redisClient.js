const Redis = require("ioredis");

const POOL_SIZE = Math.max(
    1,
    Number(process.env.REDIS_POOL_SIZE || 8)
);

class RedisPool {
    constructor() {
        this.clients = [];
        this.index = 0;
        this.connected = false;
    }

    async connect() {
        for (let i = 0; i < POOL_SIZE; i++) {
            const client = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 10) return null;
                    return Math.min(times * 100, 3000);
                },
                connectTimeout: 10000,
                lazyConnect: true,
                enableReadyCheck: true,
                enableAutoPipelining: true
            });

            client.on("error", (err) => {
                if (!err.message?.includes("Connection closed") &&
                    !err.message?.includes("connect")) {
                    console.error("Redis Client Error", err);
                }
            });

            await client.connect();
            this.clients.push(client);
        }
        this.connected = true;
        console.log(`Connected ${POOL_SIZE} Redis clients`);
    }

    getClient() {
        const client = this.clients[this.index];
        this.index = (this.index + 1) % POOL_SIZE;
        return client;
    }

    async disconnect() {
        for (const client of this.clients) {
            await client.quit();
        }
        this.clients = [];
        this.connected = false;
    }

    async eval(script, opts) {
        const client = this.getClient();
        const keys = opts.keys || [];
        const args = opts.arguments || [];
        return client.eval(script, keys.length, ...keys, ...args);
    }
}

const pool = new RedisPool();

const handler = {
    get(target, prop) {
        if (prop === "connect") return target.connect.bind(target);
        if (prop === "disconnect") return target.disconnect.bind(target);
        if (prop === "connected") return target.connected;
        if (prop === "clients") return target.clients;
        if (prop === "eval") return target.eval.bind(target);
        return function (...args) {
            const client = target.getClient();
            return client[prop](...args);
        };
    }
};

module.exports = new Proxy(pool, handler);
