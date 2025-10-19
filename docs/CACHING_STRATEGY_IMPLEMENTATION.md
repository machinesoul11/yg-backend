# Comprehensive Caching Strategy Implementation

## Overview

This document describes the complete caching strategy implementation for the YesGoddess backend platform. The strategy encompasses Redis caching for database queries, CDN caching for static assets, API response caching, cache warming, monitoring, and performance metrics.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│  API Routes  │  tRPC Routers  │  Background Jobs  │  Scripts │
└──────┬────────────────┬────────────────┬─────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                   Caching Middleware                         │
├─────────────────────────────────────────────────────────────┤
│  API Cache   │  Entity Cache  │  Analytics Cache  │  CDN     │
└──────┬────────────────┬────────────────┬─────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis (Upstash)                           │
├─────────────────────────────────────────────────────────────┤
│  Cache Storage  │  Performance Metrics  │  Health Monitoring │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Redis Infrastructure (`src/lib/redis/`)

#### Client Configuration (`client.ts`)
- **Purpose**: Centralized Redis connection management
- **Features**:
  - Serverless-optimized configuration
  - Separate connections for general use and BullMQ
  - Automatic reconnection with exponential backoff
  - Health check capabilities
  - Graceful shutdown handling

#### Cache Service (`cache.service.ts`)
- **Purpose**: Core caching operations with type safety
- **Key Methods**:
  - `get<T>()`: Retrieve cached values with type safety
  - `set()`: Store values with TTL
  - `delete()`: Remove single keys
  - `deletePattern()`: Bulk invalidation by pattern
  - `getMany()`, `setMany()`: Batch operations
  - Entity-specific invalidation methods
  - `warmCache()`: Cache-aside pattern implementation

#### Cache Keys (`keys.ts`)
- **Purpose**: Hierarchical key naming and TTL management
- **Structure**: `{namespace}:{entity}:{identifier}:{subkey}`
- **TTL Strategy**:
  - User/Creator/Brand profiles: 1 hour (3600s)
  - Projects/Assets: 30 minutes (1800s)
  - Licenses: 15 minutes (900s)
  - Analytics: 5 minutes (300s)
  - Session data: 24 hours (86400s)

### 2. API Response Caching (`src/lib/middleware/api-cache.middleware.ts`)

#### Features
- Automatic cache key generation from URL and query parameters
- ETag support for conditional requests (304 Not Modified)
- User-scoped caching for personalized content
- Public/private cache control headers
- Stale-while-revalidate support
- Request collapsing to prevent thundering herd

#### Usage Example

```typescript
import { withCache, CachePresets } from '@/lib/middleware/api-cache.middleware';

// Apply caching to GET endpoint
export const GET = withCache(
  async (req: NextRequest) => {
    const data = await fetchData();
    return NextResponse.json(data);
  },
  CachePresets.MEDIUM // 15 minutes cache
);

// Custom cache configuration
export const GET = withCache(
  handler,
  {
    ttl: 600, // 10 minutes
    variesByUser: true,
    public: false,
    staleWhileRevalidate: 3600,
  }
);
```

#### Cache Presets
- **SHORT**: 5 minutes, user-scoped
- **MEDIUM**: 15 minutes, user-scoped
- **LONG**: 1 hour, user-scoped
- **PUBLIC**: 10 minutes, public (CDN cacheable)
- **ANALYTICS**: 5 minutes with 1-hour stale-while-revalidate
- **STATIC**: 24 hours, public

### 3. Cache Warming (`src/lib/redis/cache-warming.service.ts`)

#### Warming Strategies

**Critical Cache Warming** (After Deployments)
- Active users (last 7 days)
- System configuration
- Top 50 creators and brands
- Active projects
- Platform analytics
- Popular assets

**Incremental Warming** (Background)
- Batch processing with configurable batch size
- Delay between batches to prevent database overload
- Progress tracking and error handling

**User-Specific Warming**
- On-demand warming for specific users
- Includes all user-related entities (creator/brand profiles)

#### Usage

```typescript
import { getCacheWarmingService } from '@/lib/redis/cache-warming.service';

const service = getCacheWarmingService(prisma);

// Warm critical caches
const result = await service.warmCriticalCaches();

// Warm specific user
await service.warmUserCache(userId);

// Incremental warming
await service.warmCacheIncrementally({
  batchSize: 50,
  delayBetweenBatches: 1000
});
```

### 4. CDN Caching

#### Next.js Configuration (`next.config.ts`)

**Static Asset Caching**
- Logo files: 1 year immutable cache
- Images/fonts: 1 year immutable cache
- Next.js static files: 1 year immutable cache
- HTML pages: 1 hour with must-revalidate

**Security Headers**
- Strict-Transport-Security
- X-Frame-Options
- X-Content-Type-Options
- CSP (Content Security Policy)

**Image Optimization**
- AVIF and WebP format support
- Multiple device sizes (640px - 3840px)
- 1-year minimum cache TTL

#### CDN Management (`src/lib/storage/cdn-cache.ts`)

**Cache Purging**
```typescript
import { purgeCDNCache, purgeAssetCache } from '@/lib/storage/cdn-cache';

// Purge specific files
await purgeCDNCache({
  files: ['https://cdn.example.com/asset.jpg']
});

// Purge all asset variants
await purgeAssetCache(assetId);
```

**Cache Warming**
```typescript
import { warmCDNCache, warmAssetCache } from '@/lib/storage/cdn-cache';

// Warm specific URLs
await warmCDNCache([
  'https://cdn.example.com/asset1.jpg',
  'https://cdn.example.com/asset2.jpg'
]);

// Warm asset thumbnails
await warmAssetCache(assetId);
```

### 5. Cache Monitoring (`src/lib/redis/monitoring.ts`)

#### Metrics Collection
- Memory usage (used, peak, fragmentation, RSS)
- Performance stats (connections, commands, ops/sec)
- Hit/miss rates
- Keyspace statistics
- CPU usage
- Server uptime

#### Health Monitoring
```typescript
import { redisMonitor } from '@/lib/redis/monitoring';

const health = await redisMonitor.getHealthStatus();

// Returns:
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   latency: number,
//   memoryUsagePercent?: number,
//   hitRate?: number,
//   details: { ... },
//   issues: string[]
// }
```

#### Health Thresholds
- **Latency**: >100ms triggers warning
- **Hit Rate**: <70% triggers warning
- **Memory Usage**: >85% triggers warning
- **Fragmentation**: >1.5 triggers warning

### 6. Performance Metrics (`src/lib/redis/cache-performance.service.ts`)

#### Current Metrics
```typescript
import { cachePerformanceService } from '@/lib/redis/cache-performance.service';

const metrics = await cachePerformanceService.getCurrentMetrics();

// Returns hit rate, latency, memory usage, key count, etc.
```

#### Historical Analysis
```typescript
const historicalMetrics = await cachePerformanceService.getHistoricalMetrics(
  startDate,
  endDate
);
```

#### Efficiency Reports
```typescript
const report = await cachePerformanceService.generateEfficiencyReport(7); // Last 7 days

// Returns:
// - Overall hit rate and latency
// - Metrics by namespace
// - Optimization recommendations
// - Health status
```

### 7. Background Jobs (`src/jobs/cache-maintenance.job.ts`)

#### Scheduled Tasks

**Metrics Collection** (Hourly)
- Records performance snapshots
- Stores in time-series format
- Enables historical analysis

**Health Checks** (Every 15 minutes)
- Monitors Redis health
- Alerts on degradation
- Tracks uptime and availability

**Weekly Reports** (Mondays at midnight)
- Generates efficiency reports
- Provides optimization recommendations
- Tracks performance trends

**Post-Deployment Warmup** (On-Demand)
- Warms critical caches after deployments
- Prevents cold start cache misses
- Ensures consistent performance

## Cache Invalidation Strategy

### Event-Based Invalidation

When data is modified, corresponding cache entries are immediately invalidated:

```typescript
import { cacheService } from '@/lib/redis';

// After updating user
await cacheService.invalidateUser(userId);

// After updating creator profile
await cacheService.invalidateCreator(creatorId);

// After updating brand
await cacheService.invalidateBrand(brandId);

// After updating project
await cacheService.invalidateProject(projectId);

// After updating analytics
await cacheService.invalidateAnalytics(key);
```

### Pattern-Based Invalidation

For bulk invalidation:

```typescript
// Invalidate all creator-related caches
await cacheService.deletePattern('cache:creator:*');

// Invalidate all analytics
await cacheService.deletePattern('cache:analytics:*');
```

### API Cache Invalidation

```typescript
import { invalidateApiCache } from '@/lib/middleware/api-cache.middleware';

// Invalidate specific API endpoint
await invalidateApiCache('/api/analytics/*');
```

## API Endpoints

### Admin Cache Metrics
**GET** `/api/admin/cache/metrics`

Query Parameters:
- `view`: `current` | `historical` | `report`
- `periodDays`: Number of days for historical/report view

Returns cache performance metrics, health status, and analytics.

### Admin Cache Warming
**POST** `/api/admin/cache/warm`

Request Body:
```json
{
  "type": "critical" | "user" | "incremental",
  "userId": "string (optional, for user type)",
  "batchSize": "number (optional, for incremental type)"
}
```

Triggers cache warming operations.

## Scripts

### Initialize Cache
```bash
npm run cache:init
```
Warms critical caches and collects initial metrics. Run after deployment.

### Cache Health Check
```bash
npm run cache:health
```
Displays current Redis health status.

### Cache Metrics
```bash
npm run cache:metrics
```
Shows current cache performance metrics.

## Best Practices

### 1. Cache Key Design
- Use hierarchical naming: `namespace:entity:id:subkey`
- Include all parameters that affect the result
- Keep keys short but descriptive
- Use consistent separators (`:`)

### 2. TTL Selection
- **Frequently changing data**: 5-15 minutes
- **Moderately stable data**: 30-60 minutes
- **Rarely changing data**: 1-24 hours
- **Static reference data**: Days to weeks

### 3. Cache Invalidation
- Prefer explicit invalidation over short TTLs
- Use pattern-based invalidation carefully (performance impact)
- Invalidate related caches together
- Consider cascading effects

### 4. Performance Optimization
- Use batch operations for multiple keys
- Implement request collapsing for popular queries
- Monitor hit rates and adjust strategy
- Profile cache operations in production

### 5. Error Handling
- Always have fallback to direct database queries
- Log cache errors but don't fail requests
- Monitor error rates
- Implement circuit breakers for cache failures

## Monitoring & Alerting

### Key Metrics to Monitor
1. **Cache Hit Rate**: Should be >70% for optimal performance
2. **Cache Latency**: Should be <100ms
3. **Memory Usage**: Keep below 85%
4. **Eviction Rate**: Minimize evictions
5. **Error Rate**: Monitor for connection issues

### Alert Thresholds
- Hit rate drops below 50%
- Latency exceeds 200ms
- Memory usage exceeds 90%
- Eviction rate increases significantly
- Redis becomes unhealthy

## Performance Impact

### Expected Improvements
- **API Response Time**: 50-80% reduction for cached endpoints
- **Database Load**: 60-90% reduction in query volume
- **Throughput**: 2-5x increase in requests per second
- **Cost Savings**: Reduced database instance requirements

### Baseline Metrics
Establish baselines before optimization:
- Average query time: X ms
- Database queries per minute: Y
- API response time (p95): Z ms

Track improvements over time and adjust caching strategy accordingly.

## Troubleshooting

### Low Hit Rate
1. Check TTL values (too short?)
2. Review invalidation frequency (too aggressive?)
3. Analyze query patterns (cacheable?)
4. Monitor key generation (consistent?)

### High Latency
1. Check Redis server load
2. Review network connectivity
3. Analyze serialization overhead
4. Consider Redis instance upgrade

### High Memory Usage
1. Review TTLs (too long?)
2. Check for memory leaks
3. Analyze key distribution
4. Consider implementing LRU eviction

### Cache Misses
1. Ensure cache warming runs after deployment
2. Check invalidation patterns
3. Review query patterns
4. Monitor cache key generation

## Future Enhancements

1. **Per-Namespace Metrics**: Track hit rates by cache namespace
2. **Automated Cache Tuning**: ML-based TTL optimization
3. **Distributed Caching**: Multi-region cache deployment
4. **Cache Preloading**: Predictive cache warming based on usage patterns
5. **Advanced Monitoring**: Real-time dashboards and anomaly detection
