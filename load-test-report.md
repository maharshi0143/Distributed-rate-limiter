# Load Test Report

## Command Used

```bash
docker run --rm --network distributed-rate-limiter_default -v "${PWD}:/work" -w /work ghcr.io/bojand/ghz:latest --insecure --proto ./src/proto/rate_limiter.proto --call rate_limiter.RateLimiter.Evaluate --data-file ./ghz-load.json -c 1 -n 2000 --skipFirst 1000 rate-limiter:50051
```

## Raw ghz Output

```text
Summary:
  Count:        1000
  Total:        1.53 s
  Slowest:      3.28 ms
  Fastest:      0.22 ms
  Average:      0.61 ms
  Requests/sec: 655.34

Response time histogram:
  0.225 [1]   |
  0.530 [606] |∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
  0.835 [231] |∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
  1.141 [60]  |∎∎∎∎
  1.446 [40]  |∎∎∎
  1.751 [33]  |∎∎
  2.056 [15]  |∎
  2.361 [6]   |
  2.667 [4]   |
  2.972 [3]   |
  3.277 [1]   |

Latency distribution:
  10 % in 0.32 ms 
  25 % in 0.36 ms 
  50 % in 0.46 ms 
  75 % in 0.64 ms 
  90 % in 1.15 ms 
  95 % in 1.53 ms 
  99 % in 2.25 ms 

Status code distribution:
  [OK]   1000 responses
```

## Redis Connection Pool Tuning

The gRPC workers use `ioredis` with `enableAutoPipelining: true` to reduce round trips under bursty access. For the benchmark run, the service was started with `WORKER_COUNT=1` and `REDIS_POOL_SIZE=1` to remove process contention and keep the Redis path as short as possible. The default repository configuration still supports larger values through environment variables, and the container stack exposes those knobs through `docker-compose.yml`.
