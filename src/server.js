require("dotenv").config();
const cluster = require("cluster");
const os = require("os");

const REST_PORT = process.env.REST_PORT || 3000;
const numWorkers = Math.max(
    1,
    Math.min(
        os.cpus().length,
        Number(process.env.WORKER_COUNT || os.cpus().length)
    )
);

if (cluster.isMaster) {
    console.log(`Master ${process.pid} starting ${numWorkers} workers...`);

    const app = require("./app");
    const redisClient = require("./redis/redisClient");
    const pubSub = require("./redis/pubSub");

    (async () => {
        await redisClient.connect();
        await pubSub.connect();

        app.listen(REST_PORT, () => {
            console.log(`REST server running on port ${REST_PORT}`);
        });
    })();

    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died (${signal || code}), restarting...`);
        cluster.fork();
    });

    process.on("SIGINT", () => {
        console.log("Master shutting down...");
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    });
} else {
    require("./worker");
}
