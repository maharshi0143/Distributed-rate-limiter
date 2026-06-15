const Redis = require("ioredis");

const CHANNEL = "ratelimit:invalidate";

class PubSub {
    constructor() {
        this.pub = null;
        this.sub = null;
        this.callbacks = [];
    }

    async connect() {
        this.pub = new Redis(process.env.REDIS_URL, { lazyConnect: true });
        this.sub = new Redis(process.env.REDIS_URL, { lazyConnect: true });
        await this.pub.connect();
        await this.sub.connect();

        await this.sub.subscribe(CHANNEL);
        this.sub.on("message", (channel, message) => {
            for (const cb of this.callbacks) {
                try { cb(message); } catch (e) { /* ignore */ }
            }
        });
    }

    onInvalidate(callback) {
        this.callbacks.push(callback);
    }

    async publish(type) {
        if (this.pub) {
            await this.pub.publish(CHANNEL, type);
        }
    }

    async disconnect() {
        if (this.pub) await this.pub.quit();
        if (this.sub) await this.sub.quit();
    }
}

module.exports = new PubSub();
