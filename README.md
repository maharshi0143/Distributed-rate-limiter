# Distributed Rate Limiter

A high-performance, multi-algorithm distributed rate limiter with gRPC and REST APIs, backed by Redis. Designed for microservice architectures that need centralized, consistent rate limiting across multiple service instances.

## Architecture

```
                        ┌──────────────────────┐
                        │    HTTP/REST Client   │
                        └──────────┬───────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────┐
│                   Master Process                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Express REST API (port 3000)          │   │
│  │  POST /rules  │  GET /rules/:id  │  DELETE ...   │   │
│  │  POST /overrides  │  GET ...     │  DELETE ...   │   │
│  └──────────────────────────────────────────────────┘   │
│                     Fork Workers                         │
└─────────────────────────────────────────────────────────┘
               │              │              │
               ▼              ▼              ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌──────────
│  Worker 1           │ │  Worker N           │ │
│  gRPC Server        │ │  gRPC Server        │ │
│  (port 50051)       │ │  (port 50051)       │ │
│                     │ │                     │ │
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │
│  │ Algorithm     │  │ │  │ Algorithm     │  │ │
│  │ Strategies    │  │ │  │ Strategies    │  │ │
│  │  • Fixed Win  │  │ │  │  • Fixed Win  │  │ │
│  │  • Token Bkt  │  │ │  │  • Token Bkt  │  │ │
│  │  • Sliding    │  │ │  │  • Sliding    │  │ │
│  │  • Leaky Bkt  │  │ │  │  • Leaky Bkt  │  │ │
│  └───────────────┘  │ │  └───────────────┘  │ │
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │
│  │ Redis Pool    │  │ │  │ Redis Pool    │  │ │
│  │ + Cache       │  │ │  │ + Cache       │  │ │
│  └───────┬───────┘  │ │  └───────┬───────┘  │ │
└──────────┼──────────┘ └──────────┼──────────┘ └──
           │                       │
           ▼                       ▼
┌──────────────────────────────────────────────────────┐
│                    Redis                              │
│  • Rate limit counters (Lua scripts)                 │
│  • Rule & Override storage                           │
│  • Pub/Sub cache invalidation                        │
└──────────────────────────────────────────────────────┘
```

- **Master process** runs the REST API and forks gRPC worker processes
- **Workers** run gRPC servers and perform rate limit evaluation using atomic Lua scripts in Redis
- **Redis** serves as the distributed state store, with connection pooling for high throughput
- **Pub/Sub** invalidates local caches across workers when rules or overrides change
- Each worker has an **in-memory cache** of rules and overrides (TTL: 1 hour), invalidated via Redis pub/sub

## Rate Limiting Algorithms

| Algorithm | Lua Script | Behavior |
|-----------|-----------|----------|
| **Fixed Window** | Atomic INCR + EXPIRE | Counts requests in a fixed time window. Resets at the end of each window. Simple, but can allow bursts at window boundaries. |
| **Sliding Window Log** | Sorted Set (ZADD/ZREMRANGEBYSCORE) | Maintains a sorted set of timestamps per key. Removes entries outside the window on each request. Provides precise, smooth rate limiting. |
| **Token Bucket** | GET/SET with refill logic | Tokens refill at a constant rate up to a burst capacity. Each request consumes one token. Allows bursts up to capacity while enforcing a sustained rate. |
| **Leaky Bucket** | GET/SET with leak logic | Requests enter a queue that leaks at a constant rate. If the queue is full, the request is denied. Smooths out traffic spikes into a steady flow. |

All algorithms use **Lua scripts** executed atomically in Redis, ensuring correctness under concurrent access from multiple workers.

## API Reference

### gRPC API (port 50051)

#### `Evaluate`

Evaluates a rate limit request and returns an ALLOWED or DENIED decision.

```protobuf
message Dimension {
    string key = 1;
    string value = 2;
}

message EvaluateRequest {
    repeated Dimension dimensions = 1;
    bool dry_run = 2;
}

message EvaluateResponse {
    enum Decision {
        UNKNOWN = 0;
        ALLOWED = 1;
        DENIED = 2;
    }
    Decision decision = 1;
    string matched_rule_id = 2;
}
```

- **dimensions**: Key-value pairs identifying the client (e.g., `ip`, `user_id`, `api_key`)
- **dry_run**: If `true`, checks state without consuming a unit
- **Returns**: Decision and the ID of the most restrictive matching rule

### REST API (port 3000)

#### Rules

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/rules` | Create a rate limit rule |
| `GET` | `/rules/:id` | Get a rule by ID |
| `PUT` | `/rules/:id` | Update a rule |
| `DELETE` | `/rules/:id` | Delete a rule |

**POST /rules**
```json
{
    "dimensions": [{ "key": "ip", "value": "1.2.3.4" }],
    "algorithm": "fixed_window",
    "limit": 100,
    "duration": 60,
    "burst": 200
}
```

- `dimensions`: Array of key-value pairs that requests must match
- `algorithm`: One of `fixed_window`, `token_bucket`, `sliding_window_log`, `leaky_bucket`
- `limit`: Maximum number of requests (or refill rate)
- `duration`: Time window in seconds
- `burst`: Maximum burst capacity (required for `token_bucket` and `leaky_bucket`)

#### Overrides

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/overrides` | Create a temporary limit override |
| `GET` | `/overrides/:id` | Get an override by ID |
| `DELETE` | `/overrides/:id` | Delete an override |

**POST /overrides**
```json
{
    "dimensions": [{ "key": "user_id", "value": "premium-user" }],
    "limit": 5000,
    "ttl": 3600
}
```

Overrides temporarily change the limit for matching dimensions without modifying the underlying rule. They auto-expire after `ttl` seconds.

### Rule Matching

Requests are matched against rules by **dimensions**. When a client sends dimensions like `[{key: "ip", value: "1.2.3.4"}, {key: "endpoint", value: "/api"}]`, the system finds all rules whose dimensions are a subset of the request dimensions. The **most restrictive** matching rule (lowest limit, then shortest duration) is applied.

Overrides follow the same matching logic. If an override matches, its limit replaces the rule's limit for that evaluation.

### Decision Flow

```
1. Client sends dimensions (e.g., ip=1.2.3.4, endpoint=/api)
2. System finds all rules whose dimensions match
3. Rules are sorted by restrictiveness (lowest limit → shortest duration)
4. Matching overrides are checked; the most restrictive override's limit is applied
5. The effective rule is evaluated using the configured algorithm
6. Returns ALLOWED (decision=1) or DENIED (decision=2)
```

If no rule matches, the request is **ALLOWED** (open access). If dimensions are empty, the request is **DENIED**.

## Getting Started

### Prerequisites

- Node.js 18+
- Redis 7+
- Docker & Docker Compose (optional)

### Quick Start (Docker Compose)

```bash
docker compose up --build
```

This starts a Redis container and the rate limiter service with 12 worker processes.

### Manual Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env if needed

# Ensure Redis is running on localhost:6379
# Start the service
npm start

# Development mode with auto-reload
npm run dev
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `GRPC_PORT` | `50051` | gRPC server port |
| `REST_PORT` | `3000` | REST API port |
| `WORKER_COUNT` | CPU count | Number of gRPC worker processes |
| `REDIS_POOL_SIZE` | `8` | Redis connection pool size per worker |

### Health Check

```bash
curl http://localhost:3000/
# {"success":true,"message":"Distributed Rate Limiter Service Running 🚀"}
```

## Testing

```bash
# Run unit and integration tests (requires Redis)
npm test

# E2E smoke test (requires running service)
node tests/e2e_smoke.js

# E2E smoke test (PowerShell)
./tests/e2e_test.ps1
```

Tests use **property-based testing** with `fast-check`, running each algorithm against random inputs to verify correctness. The composite limits test validates that when multiple rules apply, the most restrictive limit is enforced.

## Performance

### Load Test Results (1000 requests, 1 worker, 1 Redis connection)

| Metric | Value |
|--------|-------|
| Requests/sec | 655 |
| Average latency | 0.61 ms |
| p50 latency | 0.46 ms |
| p90 latency | 1.15 ms |
| p99 latency | 2.25 ms |
| Fastest | 0.22 ms |
| Slowest | 3.28 ms |

Run your own load test:

```bash
# Using ghz CLI
ghz --insecure \
    --proto ./src/proto/rate_limiter.proto \
    --call rate_limiter.RateLimiter.Evaluate \
    --data-file ./ghz-load.json \
    -c 10 -n 10000 \
    localhost:50051
```

## Project Structure

```
├── src/
│   ├── algorithms/        # Rate limiting algorithm strategies
│   │   ├── fixedWindowStrategy.js
│   │   ├── tokenBucketStrategy.js
│   │   ├── slidingWindowLogStrategy.js
│   │   └── leakyBucketStrategy.js
│   ├── grpc/              # gRPC server, client, and handler
│   │   ├── grpcServer.js
│   │   ├── grpcHandler.js
│   │   └── grpcClient.js
│   ├── models/            # Data models
│   │   ├── ruleModel.js
│   │   └── overrideModel.js
│   ├── proto/             # Protocol Buffer definitions
│   │   └── rate_limiter.proto
│   ├── redis/             # Redis client pool and pub/sub
│   │   ├── redisClient.js
│   │   └── pubSub.js
│   ├── routes/            # REST API routes
│   │   ├── ruleRoutes.js
│   │   ├── overrideRoutes.js
│   │   └── testRoutes.js
│   ├── services/          # Business logic layer
│   │   ├── ruleServices.js
│   │   ├── overrideService.js
│   │   └── rateLimiterService.js
│   ├── utils/             # Utilities (dimension matching)
│   │   └── dimensions.js
│   ├── app.js             # Express application
│   ├── server.js          # Entry point (cluster master + worker fork)
│   └── worker.js          # Worker process bootstrap
├── tests/                 # Test suite
│   ├── fixedWindow.test.js
│   ├── tokenBucket.test.js
│   ├── slidingWindowLog.test.js
│   ├── leakyBucket.test.js
│   ├── compositeLimits.test.js
│   ├── e2e_smoke.js
│   ├── e2e_test.ps1
│   ├── bench_eval.js
│   ├── profile.js
│   └── profile_detail.js
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Key Design Decisions

- **Lua scripts in Redis**: All rate limiting logic runs as atomic Lua scripts in Redis, eliminating race conditions without distributed locks.
- **Connection pooling**: Each worker maintains a pool of Redis connections with round-robin access to maximize throughput.
- **Cache invalidation**: Rule and override caches in each worker are invalidated via Redis pub/sub, ensuring near-instant consistency without polling.
- **Worker processes**: gRPC servers run in forked worker processes, utilizing all CPU cores. The master process handles REST API and worker lifecycle.
- **Dimension-based matching**: Flexible matching allows rules to target any combination of attributes (IP, user ID, endpoint, etc.) and supports overlapping rule sets.
