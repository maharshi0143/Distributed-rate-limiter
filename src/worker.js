const redisClient = require("./redis/redisClient");
const pubSub = require("./redis/pubSub");
const startGrpcServer = require("./grpc/grpcServer");
const ruleService = require("./services/ruleServices");
const overrideService = require("./services/overrideService");

async function startWorker() {
    try {
        await redisClient.connect();
        await pubSub.connect();

        // Pre-warm caches
        await ruleService.getAllRules();
        await overrideService.getAllOverrides();
        console.log(`Worker ${process.pid} caches warmed`);

        startGrpcServer();
    } catch (error) {
        console.error(`Worker ${process.pid} failed:`, error);
        process.exit(1);
    }
}

startWorker();
