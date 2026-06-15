const grpc =
    require("@grpc/grpc-js");

const protoLoader =
    require("@grpc/proto-loader");

const path =
    require("path");

const PROTO_PATH =
    path.join(
        __dirname,
        "../proto/rate_limiter.proto"
    );

const packageDefinition =
    protoLoader.loadSync(
        PROTO_PATH
    );

const proto =
    grpc.loadPackageDefinition(
        packageDefinition
    ).rate_limiter;

const client =
    new proto.RateLimiter(
        "localhost:50051",
        grpc.credentials.createInsecure()
    );


client.Evaluate(

    {
        dimensions: [

        {

            key: "ip",

            value: "1.2.3.4"
        },


],
        dry_run: true
    },

    (error, response) => {
        if (error) {
            console.error(error);
            return;
        }
        console.log(response);
    }
);