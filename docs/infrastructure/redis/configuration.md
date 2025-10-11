# Redis Configuration Documentation

## Overview

This document provides comprehensive information about the Redis configuration for the YesGoddess backend system.

## Upstash Redis Instance

### Production Setup

1. **Create Upstash Account:**
   - Sign up at [upstash.com](https://upstash.com)
   - Choose region closest to your Vercel deployment (e.g., us-east-1)
   - Create a new Redis database

2. **Get Connection Details:**
   - Redis Protocol URL: `redis://default:password@endpoint.upstash.io:6379`
   - REST API URL: `https://endpoint.upstash.io`
   - REST API Token: Available in the dashboard

3. **Update Environment Variables:**
   ```bash
   REDIS_URL=redis://default:password@endpoint.upstash.io:6379
   REDIS_REST_URL=https://endpoint.upstash.io
   REDIS_REST_TOKEN=your-upstash-rest-token
   ```

### Development Setup

For local development, you can use a local Redis instance:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Using Homebrew (macOS)
brew install redis
brew services start redis

# Environment variable for local dev
REDIS_URL=redis://localhost:6379
```

## Connection Pooling

The Redis client is configured with:

- **Max Retries:** 3 attempts per request
- **Retry Strategy:** Exponential backoff (50ms * attempt, max 2000ms)
- **Reconnect on Errors:** READONLY, ETIMEDOUT, ECONNRESET
- **Connection Timeout:** 10 seconds
- **Command Timeout:** 5 seconds
- **Keep-Alive:** 30 seconds

### Singleton Pattern

The application uses a singleton pattern to reuse Redis connections across requests:

```typescript
import { getRedisClient } from '@/lib/redis';

const redis = getRedisClient(); // Same instance across the app
```

## Key Naming Conventions

All Redis keys follow a hierarchical structure:

```
{namespace}:{entity}:{identifier}:{subkey}
```

### Namespaces

- **cache:** Cached data from database
- **session:** Temporary session data
- **jobs:** BullMQ job queues
- **ratelimit:** Rate limiting counters
- **idempotency:** Idempotency keys
- **lock:** Distributed locks
- **verification:** Verification codes
- **counter:** Metrics counters

### Examples

```typescript
cache:user:123                   // User profile cache
cache:creator:456:assets         // Creator's assets cache
session:upload:abc-def-123       // Upload session
ratelimit:api:user123           // API rate limit for user
lock:royalty-run:run-789        // Distributed lock for royalty run
```

## TTL Strategy

### Cache TTLs

- User/Creator/Brand profiles: **1 hour** (3600s)
- Projects/Assets: **30 minutes** (1800s)
- Licenses: **15 minutes** (900s)
- Analytics: **5 minutes** (300s)

### Session TTLs

- Upload sessions: **15 minutes** (900s)
- Onboarding: **24 hours** (86400s)
- Payment sessions: **30 minutes** (1800s)
- Verification: **1 hour** (3600s)

### Rate Limit Windows

- API requests: **1 hour** (3600s)
- Uploads: **1 hour** (3600s)
- Messages: **1 minute** (60s)
- Login attempts: **15 minutes** (900s)
- Password resets: **1 hour** (3600s)

### Lock TTLs

- Royalty calculation: **5 minutes** (300s)
- Payout processing: **5 minutes** (300s)
- Asset processing: **10 minutes** (600s)
- License activation: **1 minute** (60s)

## Cache Invalidation Strategy

### Principles

1. **Invalidate on Write:** Delete cached data when underlying data changes
2. **Time-Based Expiry:** All cache entries have TTLs as backup
3. **Cascade Invalidation:** Parent entity changes invalidate related entities

### Entity-Specific Invalidation

```typescript
import { cacheService } from '@/lib/redis';

// Invalidate user and all related data
await cacheService.invalidateUser(userId);

// Invalidate creator profile and assets
await cacheService.invalidateCreator(creatorId);

// Invalidate project and related assets/licenses
await cacheService.invalidateProject(projectId);

// Invalidate brand and licenses
await cacheService.invalidateBrand(brandId);

// Invalidate analytics cache
await cacheService.invalidateAnalytics();
```

## Usage Patterns

### 1. Caching Frequently Accessed Data

```typescript
import { cacheService, RedisKeys, RedisTTL } from '@/lib/redis';

// Try cache first, fallback to database
const creator = await cacheService.warmCache(
  RedisKeys.cache.creator(creatorId),
  async () => {
    // Fetch from database if not cached
    return await prisma.creator.findUnique({ where: { id: creatorId } });
  },
  RedisTTL.CREATOR_PROFILE
);
```

### 2. Rate Limiting

```typescript
import { rateLimiter } from '@/lib/redis';

// Check rate limit
const result = await rateLimiter.checkLimit('user123', 'api');

if (!result.allowed) {
  throw new Error(`Rate limit exceeded. Resets at ${result.resetAt}`);
}

// Or use checkLimitOrThrow
await rateLimiter.checkLimitOrThrow('user123', 'upload', {
  limit: 10,
  windowSeconds: 3600,
});
```

### 3. Distributed Locking

```typescript
import { distributedLock, RedisKeys } from '@/lib/redis';

// Execute critical operation with lock
await distributedLock.withLock(
  RedisKeys.lock.royaltyRun(runId),
  async () => {
    // Perform royalty calculation
    await calculateRoyalties(runId);
  },
  { ttlSeconds: 300 }
);
```

### 4. Session Management

```typescript
import { cacheService, RedisKeys, RedisTTL } from '@/lib/redis';

// Store upload session
const session = {
  userId,
  fileName,
  storageKey,
  createdAt: new Date().toISOString(),
};

await cacheService.set(
  RedisKeys.session.upload(sessionId),
  session,
  RedisTTL.UPLOAD_SESSION
);

// Retrieve session
const session = await cacheService.get(RedisKeys.session.upload(sessionId));
```

## Monitoring and Health Checks

### Health Check Endpoint

```bash
GET /api/admin/redis/health
```

Response:
```json
{
  "status": "healthy",
  "latency": 5,
  "memoryUsagePercent": 45.2,
  "hitRate": 87.5,
  "details": {
    "memory": "125M",
    "connections": 15,
    "keyspace": 2543
  },
  "issues": []
}
```

### Metrics Endpoint

```bash
GET /api/admin/redis/metrics
```

Response includes:
- Memory usage and fragmentation
- Operations per second
- Cache hit rate
- Key distribution by namespace
- Connection pool status

### Cache Statistics

```bash
GET /api/admin/redis/cache/stats
```

### Cache Invalidation

```bash
DELETE /api/admin/redis/cache?pattern=cache:user:*
```

## Persistence Settings

### Upstash Configuration (Production)

- **RDB Snapshots:** Every 300 seconds if 1+ keys changed
- **AOF (Append-Only File):** Enabled with `everysec` policy
- **Max Memory Policy:** `allkeys-lru` (evict least recently used)
- **Durability:** RDB + AOF for maximum reliability

### Data Classification

- **Job Queue Data:** Must persist (critical for BullMQ)
- **Cache Data:** Can be lost (regenerated from database)
- **Session Data:** Should persist (avoid user disruption)
- **Rate Limit Counters:** Can be lost (conservative approach)

## Alerting Thresholds

Set up monitoring alerts for:

1. **Memory Usage > 85%** → Scale Redis instance
2. **Hit Rate < 70%** → Review caching strategy
3. **Latency P99 > 100ms** → Performance degradation
4. **Error Rate > 1%** → Connection issues
5. **Connection Errors > 5/min** → Network problems

## Performance Optimization

### Best Practices

1. **Use Pipelining:** Batch multiple commands
2. **Avoid KEYS Command:** Use specific key patterns
3. **Set Appropriate TTLs:** Balance freshness vs. load
4. **Monitor Memory:** Track fragmentation and usage
5. **Use Compression:** For large values (>1KB)

### Key Distribution

Monitor key distribution to ensure even usage:

```typescript
import { redisMonitor } from '@/lib/redis';

const distribution = await redisMonitor.getKeyDistribution();
// { cache: 1200, session: 45, jobs: 15, ratelimit: 320, ... }
```

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify REDIS_URL is correct
   - Check Upstash dashboard for outages

2. **High Memory Usage**
   - Review TTL strategy
   - Check for memory leaks
   - Consider eviction policy

3. **Low Hit Rate**
   - Analyze cache miss patterns
   - Adjust TTLs
   - Review invalidation strategy

4. **Slow Commands**
   - Check slow log: `redisMonitor.getSlowLog()`
   - Avoid expensive operations (KEYS, SCAN)
   - Use pipelining for batch operations

### Debug Mode

Enable Redis command logging:

```typescript
import redis from '@/lib/redis/client';

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));
redis.monitor((err, monitor) => {
  monitor.on('monitor', (time, args) => {
    console.log(`${time}: ${args.join(' ')}`);
  });
});
```

## Security

### Best Practices

1. **Use TLS:** Always use `rediss://` protocol in production
2. **Strong Passwords:** Generate secure passwords for Redis
3. **Network Isolation:** Use VPC/private networks
4. **Minimal Permissions:** Use read-only users where possible
5. **Rotate Credentials:** Regularly update passwords

### Upstash Security Features

- Built-in TLS encryption
- IP allowlisting
- API token authentication
- VPC peering (Enterprise)

## Backup and Recovery

### Upstash Automated Backups

- Daily automated backups
- Point-in-time recovery
- Manual backup on demand

### Manual Backup

```bash
# Export all keys to JSON
redis-cli --scan --pattern '*' | xargs redis-cli DUMP > redis_backup.json
```

## Migration Guide

### From Local Redis to Upstash

1. Update environment variables
2. Test connection: `GET /api/admin/redis/health`
3. Warm cache with production data
4. Monitor metrics for 24 hours
5. Adjust TTLs based on usage patterns

### Scaling Considerations

- Monitor memory usage trends
- Plan for 2x growth headroom
- Consider read replicas for high-traffic
- Use Redis Cluster for >100GB datasets

## Integration with Other Services

### BullMQ Job Queues

Redis is used as the backing store for BullMQ:

```typescript
import { Queue } from 'bullmq';
import { getRedisClient } from '@/lib/redis';

const emailQueue = new Queue('email', {
  connection: getRedisClient(),
});
```

### Session Storage

NextAuth can use Redis for session storage:

```typescript
import { getRedisClient } from '@/lib/redis';

export const authOptions = {
  adapter: RedisAdapter(getRedisClient()),
  // ...
};
```

## Cost Optimization

### Upstash Pricing

- Pay per request model
- Free tier: 10,000 commands/day
- Production: ~$0.2 per 100k requests

### Optimization Tips

1. **Batch Operations:** Use pipelines to reduce request count
2. **Appropriate TTLs:** Don't cache data longer than needed
3. **Compression:** Reduce storage costs for large values
4. **Monitor Usage:** Track daily request patterns
5. **Cache Wisely:** Only cache frequently accessed data

## Additional Resources

- [Upstash Documentation](https://docs.upstash.com)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [BullMQ Documentation](https://docs.bullmq.io)
