const grpc = require("@grpc/grpc-js");

const protoLoader = require("@grpc/proto-loader");

const path = require("path");

const grpcHandler = require("./grpcHandler");

const PROTO_PATH = path.join(
    __dirname,
    "../proto/rate_limiter.proto"
);

const packageDefinition = protoLoader.loadSync(
    PROTO_PATH
);

const proto =
    grpc.loadPackageDefinition(
        packageDefinition
    ).rate_limiter;

function startGrpcServer() {
    const server = new grpc.Server();
    server.addService(
        proto.RateLimiter.service,
        {
            Evaluate: grpcHandler.evaluate
        }
    );

    server.bindAsync(
        `0.0.0.0:${process.env.GRPC_PORT}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {

            if (error) {
                console.error(error);
                return;
            }
            server.start();
            console.log(
                `gRPC server running on port ${port}`
            );
        }
    );
}

module.exports = startGrpcServer;