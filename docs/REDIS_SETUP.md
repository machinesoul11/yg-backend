# Redis Configuration - YesGoddess Backend

## Overview

Redis has been configured as a critical infrastructure component for the YesGoddess platform, serving three primary functions:

1. **Job Queue (BullMQ)** - Background task processing
2. **Caching Layer** - Performance optimization
3. **Session Storage** - Temporary data management

## Setup Status

### ✅ Completed Components

#### 1. Redis Client Configuration
- **Location**: `src/lib/redis/client.ts`
- **Features**:
  - Singleton pattern for connection reuse
  - Automatic retry logic with exponential backoff
  - Connection error handling and monitoring
  - Lazy connection initialization
  - Graceful shutdown support

#### 2. Key Naming Conventions
- **Location**: `src/lib/redis/keys.ts`
- **Structure**: Hierarchical key organization
  - `cache:*` - Cached entities (1 hour TTL)
  - `session:*` - Temporary session data (15 min - 24 hours)
  - `jobs:*` - BullMQ job queues
  - `ratelimit:*` - Rate limiting counters (1 hour)
  - `idempotency:*` - Duplicate operation prevention (24 hours)
  - `lock:*` - Distributed locks (5 minutes)
  - `counter:*` - Metrics and analytics
  - `flag:*` - Feature flags and system state

#### 3. Cache Service
- **Location**: `src/lib/redis/cache.service.ts`
- **Capabilities**:
  - Type-safe get/set operations
  - Automatic JSON serialization
  - TTL management
  - Pattern-based invalidation
  - Entity-specific invalidation methods
  - Cache statistics tracking

#### 4. Rate Limiter
- **Location**: `src/lib/redis/rate-limiter.ts`
- **Features**:
  - Sliding window rate limiting
  - Multiple action types (API, upload, message, login, export)
  - Configurable limits and windows
  - Remaining request tracking
  - Reset time calculation
  - Fail-open error handling

#### 5. Distributed Locking
- **Location**: `src/lib/redis/distributed-lock.ts`
- **Features**:
  - Race condition prevention
  - Atomic lock acquisition with NX
  - Safe release with Lua scripts
  - Lock extension for long operations
  - Helper function for lock-wrapped execution

#### 6. Monitoring & Metrics
- **Location**: `src/lib/redis/monitoring.ts`
- **Metrics Tracked**:
  - Memory usage and fragmentation
  - Hit rate statistics
  - Operations per second
  - Connected clients
  - Keyspace distribution
  - Server health and uptime

#### 7. API Endpoints
- **Health Check**: `GET /api/health/redis`
  - Returns Redis connection status and latency
- **Metrics**: `GET /api/admin/redis/metrics`
  - Comprehensive performance metrics

#### 8. Testing Script
- **Location**: `src/scripts/test-redis.ts`
- **Command**: `npm run redis:test`
- **Tests**:
  - Basic connectivity
  - SET/GET operations
  - Cache service functionality
  - Rate limiting
  - Distributed locking
  - Monitoring and metrics

## Environment Configuration

### Required Variables

```bash
# Upstash Redis (Primary)
REDIS_URL=redis://default:password@endpoint.upstash.io:6379

# Upstash REST API (Optional - for serverless edge functions)
REDIS_REST_URL=https://endpoint.upstash.io
REDIS_REST_TOKEN=your-token
```

### Upstash Dashboard Configuration

**Recommended Settings**:
- **Eviction Policy**: `allkeys-lru` (evict least recently used when memory full)
- **Persistence**: AOF with `everysec` + RDB snapshots every 300s
- **TLS**: Enabled by default
- **Region**: Same as Vercel deployment (e.g., us-east-1)

## Usage Examples

### 1. Caching User Data

```typescript
import { cacheService, RedisKeys, RedisTTL } from '@/lib/redis';

// Cache user profile
const user = await prisma.user.findUnique({ where: { id: userId } });
await cacheService.set(
  RedisKeys.cache.user(userId),
  user,
  RedisTTL.cache.user
);

// Retrieve from cache
const cachedUser = await cacheService.get(RedisKeys.cache.user(userId));

// Invalidate on update
await prisma.user.update({ where: { id: userId }, data: updates });
await cacheService.invalidateUser(userId);
```

### 2. Rate Limiting API Endpoints

```typescript
import { rateLimiter, RateLimitConfig } from '@/lib/redis';

// Check rate limit in API route
const result = await rateLimiter.checkLimit(
  userId,
  'api',
  RateLimitConfig.api.limit
);

if (!result.allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded', resetAt: result.resetAt },
    { status: 429 }
  );
}
```

### 3. Preventing Race Conditions

```typescript
import { withLock, RedisKeys } from '@/lib/redis';

// Execute royalty calculation with lock
await withLock(
  RedisKeys.lock.royaltyRun(runId),
  async () => {
    // Critical section - only one process can execute this
    await calculateRoyalties(runId);
  },
  300 // 5 minute lock TTL
);
```

### 4. Session Management

```typescript
import { cacheService, RedisKeys, RedisTTL } from '@/lib/redis';

// Store upload session
const sessionData = {
  userId,
  fileName,
  storageKey,
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
};

await cacheService.set(
  RedisKeys.session.upload(sessionId),
  sessionData,
  RedisTTL.session.upload
);

// Retrieve and validate session
const session = await cacheService.get(RedisKeys.session.upload(sessionId));
if (!session) {
  throw new Error('Session expired');
}
```

## Cache Invalidation Strategy

### Principles

1. **Invalidate on Write** - Delete cache immediately when data changes
2. **Time-Based Expiry** - All keys have TTLs as backup
3. **Cascade Invalidation** - Related entities invalidated together

### Invalidation Patterns

```typescript
// User update → invalidate user cache
await cacheService.invalidateUser(userId);

// Creator update → invalidate creator + related assets
await cacheService.invalidateCreator(creatorId);

// Asset upload → invalidate project + creator
await cacheService.invalidateProject(projectId);
await cacheService.invalidateCreator(creatorId);

// License creation → invalidate brand + asset
await cacheService.invalidateBrand(brandId);
await cacheService.invalidateAsset(assetId);
```

## Monitoring and Alerts

### Key Metrics to Track

1. **Hit Rate** - Should be >70%
   - Low hit rate indicates inefficient caching
2. **Memory Usage** - Alert at >85%
   - Risk of evictions or OOM errors
3. **Latency P99** - Should be <100ms
   - Higher latency indicates network/load issues
4. **Error Rate** - Should be <1%
   - Connection or command failures
5. **Connected Clients** - Monitor for connection leaks

### Accessing Metrics

```bash
# Via API
curl http://localhost:3000/api/admin/redis/metrics

# Via Upstash Dashboard
https://console.upstash.com
```

## Testing

### Run Comprehensive Tests

```bash
npm run redis:test
```

### Expected Output

```
🧪 Testing Redis Connection and Functionality

✅ Redis client initialized

1️⃣  Testing basic connection...
   PING response: PONG

2️⃣  Testing SET/GET operations...
   Retrieved value: Hello Redis!

3️⃣  Testing Cache Service...
   Cached data: {"id":"123","name":"Test User","email":"test@example.com"}

4️⃣  Testing Rate Limiter...
   First request: allowed=true, remaining=9
   Second request: allowed=true, remaining=8

5️⃣  Testing Distributed Lock...
   Lock acquired: true
   Simulating work...
   Lock released

6️⃣  Testing Monitoring...
   Health: ✅ Healthy
   Latency: 15ms
   Hit rate: 100.00%
   Total keys: 5
   Cache keys: 3

7️⃣  Cleaning up test data...
   Cleanup complete

✅ All tests passed! Redis is working correctly.
```

## Performance Optimization Tips

### 1. Connection Pooling
- Use singleton pattern (already implemented)
- Avoid creating multiple Redis clients

### 2. Pipeline Operations
```typescript
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.get('key3');
const results = await pipeline.exec();
```

### 3. Avoid KEYS Command in Production
```typescript
// ❌ Bad - slow with many keys
const keys = await redis.keys('cache:*');

// ✅ Good - use SCAN instead
const stream = redis.scanStream({ match: 'cache:*' });
stream.on('data', (keys) => {
  // Process keys in batches
});
```

### 4. Set Appropriate TTLs
- Short TTL for frequently changing data
- Long TTL for stable data
- Always set TTL to prevent memory leaks

## Troubleshooting

### Connection Errors

```bash
# Check Redis connectivity
npm run redis:test

# Verify environment variables
echo $REDIS_URL

# Test with Redis CLI
redis-cli -u $REDIS_URL ping
```

### Memory Issues

```bash
# Check memory usage via API
curl http://localhost:3000/api/admin/redis/metrics | jq '.data.metrics.memory'

# Clear all cache (USE WITH CAUTION)
redis-cli -u $REDIS_URL FLUSHDB
```

### Slow Performance

1. Check hit rate - should be >70%
2. Review TTL strategy - too short = many DB queries
3. Monitor network latency to Upstash
4. Consider adding read replicas for high load

## Next Steps

### Integration Tasks

1. **BullMQ Setup** - Configure job queues for background processing
2. **tRPC Middleware** - Add rate limiting to API endpoints
3. **Upload Service** - Implement session-based upload flow
4. **Royalty Service** - Add distributed locking for calculations
5. **Analytics** - Use Redis counters for real-time metrics

### Production Readiness

- [ ] Set up Upstash alerts for memory/latency
- [ ] Configure monitoring dashboards
- [ ] Document runbook for common issues
- [ ] Load test with realistic traffic patterns
- [ ] Set up automated backups (Upstash handles this)

## Resources

- **Upstash Console**: https://console.upstash.com
- **ioredis Documentation**: https://github.com/redis/ioredis
- **Redis Commands**: https://redis.io/commands
- **BullMQ Documentation**: https://docs.bullmq.io

---

**Last Updated**: October 10, 2025
**Status**: ✅ Complete and Tested
