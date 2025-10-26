# Permission Cache Cleanup Job - Implementation Complete

## Overview

The Permission Cache Cleanup job is a scheduled maintenance task that ensures the health and efficiency of the Redis-based permission caching system. It runs multiple times daily to clean up stale keys, monitor performance, and provide optimization recommendations.

## Features Implemented

### 1. **Stale Key Cleanup**
- **Production-safe scanning**: Uses Redis SCAN command (not KEYS) to avoid blocking operations
- **TTL verification**: Identifies and removes keys without proper TTL settings
- **Batch processing**: Processes keys in configurable batches to prevent Redis overload
- **Issue detection**: Flags keys with missing TTL as potential bugs

### 2. **Cache Hit Rate Monitoring**
- **Real-time metrics**: Tracks hits, misses, and error rates
- **Performance analysis**: Calculates hit rate percentages and trends
- **Health checks**: Integrates with Redis monitoring for comprehensive health status
- **Alerting**: Logs warnings when hit rates fall below thresholds

### 3. **TTL Optimization Based on Usage Patterns**
- **Average TTL tracking**: Monitors average TTL of active keys
- **Usage pattern analysis**: Identifies frequently accessed vs. inactive user caches
- **Intelligent recommendations**: Suggests TTL adjustments based on hit rates and access patterns
- **Aggressive cleanup mode**: Optional removal of inactive user caches to save memory

## Job Configuration

### Environment Variables

```bash
# Cron schedule for cleanup job (default: every 6 hours)
PERMISSION_CACHE_CLEANUP_CRON="0 */6 * * *"

# Enable aggressive cleanup of inactive user caches
AGGRESSIVE_CACHE_CLEANUP=false

# Days of inactivity before considering a cache stale
CACHE_INACTIVITY_THRESHOLD_DAYS=30
```

### Job Options

```typescript
interface CacheCleanupJobData {
  scanBatchSize?: number;           // Default: 100
  aggressiveCleanup?: boolean;      // Default: false
  inactivityThresholdDays?: number; // Default: 30
  generateReport?: boolean;         // Default: true
}
```

## Execution Schedule

- **Default**: Every 6 hours (0 */6 * * *)
- **Configurable**: Set via `PERMISSION_CACHE_CLEANUP_CRON` environment variable
- **Manual trigger**: Can be run manually via `runCleanupNow()` function

## Cleanup Process

### Step 1: Key Scanning
```typescript
// Uses SCAN for production-safe iteration
const [cursor, keys] = await redis.scan(
  cursor,
  'MATCH',
  'permissions:*',
  'COUNT',
  100
);
```

### Step 2: TTL Verification
- Checks each key's TTL
- TTL = -1: Key without expiry (BUG - will be deleted)
- TTL = -2: Key already deleted (race condition - skip)
- TTL >= 0: Normal key (track for metrics)

### Step 3: Aggressive Cleanup (Optional)
- Identifies recently active users from warming set
- Removes caches for inactive users with high remaining TTL
- Lets near-expiration caches expire naturally

### Step 4: Batch Deletion
- Deletes problematic keys in batches of 100
- Prevents Redis blocking during large cleanups

### Step 5: Metrics & Recommendations
- Calculates cache performance metrics
- Generates optimization recommendations
- Logs issues requiring attention

## Monitoring & Metrics

### Job Statistics

```typescript
const stats = await getCleanupStatistics();
// Returns:
// {
//   jobQueue: { waiting, active, completed, failed },
//   cacheHealth: { hitRate, totalKeys, hits, misses, errors },
//   redisHealth: { status, latency, memoryUsagePercent }
// }
```

### Cleanup Results

```typescript
interface CacheCleanupResult {
  scannedKeys: number;          // Total keys scanned
  cleanedKeys: number;          // Keys deleted
  staleTTLKeys: number;         // Keys without TTL (bug)
  inactiveUserCaches: number;   // Inactive user caches removed
  currentMetrics: {
    hitRate: number;
    totalKeys: number;
    avgTTL: number;
  };
  recommendations: string[];     // Optimization suggestions
  issues: string[];             // Problems detected
}
```

## Optimization Recommendations

The job automatically generates recommendations based on metrics:

### Hit Rate Analysis
- **< 50%**: CRITICAL - Suggest doubling TTL (15min → 30min)
- **50-70%**: Low - Review permission check patterns
- **70-90%**: Good - Current config working well
- **> 90%**: Excellent - TTL is optimal

### TTL Analysis
- Low average TTL suggests high invalidation rate
- Keys accessed late in lifecycle may need longer TTL

### Key Count Analysis
- \> 10,000 keys: Recommend aggressive cleanup
- High growth rate: Review caching strategy

### Error Rate Analysis
- Errors > 1% of hits: Investigate Redis connection stability

### Memory Analysis
- \> 80% Redis memory: Enable aggressive cleanup or reduce TTL

## Integration with Existing Systems

### Permission Cache Service
- Uses `permissionCacheService.getMetrics()` for cache statistics
- Integrates with `permissionCacheService.getFrequentUsers()` for identifying active users

### Redis Monitoring
- Uses `redisMonitor.getHealthStatus()` for Redis health checks
- Leverages existing Redis connection pooling

### Audit Trail
- All cleanup operations are logged with detailed metrics
- Recommendations and issues are preserved in job logs

## Worker Management

### Initialization

```typescript
// Called during application startup in workers.ts
await initializePermissionCacheCleanupJobs();
```

### Shutdown

```typescript
// Graceful shutdown on SIGTERM/SIGINT
await shutdownCleanupWorker();
```

## Manual Operations

### Run Cleanup Now

```typescript
import { runCleanupNow } from '@/jobs/permission-cache-cleanup.job';

// Run with default options
await runCleanupNow();

// Run with aggressive cleanup
await runCleanupNow({
  aggressiveCleanup: true,
  generateReport: true
});
```

### Get Statistics

```typescript
import { getCleanupStatistics } from '@/jobs/permission-cache-cleanup.job';

const stats = await getCleanupStatistics();
console.log(stats);
```

## Logging

### Standard Logs
```
[PermissionCacheCleanup] Starting cleanup process...
[PermissionCacheCleanup] Scan batch size: 100
[PermissionCacheCleanup] Aggressive cleanup: false
[PermissionCacheCleanup] Total permission keys found: 1234
[PermissionCacheCleanup] Deleting 5 keys...
[PermissionCacheCleanup] Cleanup complete: { scanned: 1234, cleaned: 5, hitRate: '78.5%', avgTTL: '450s' }
```

### Recommendations
```
[PermissionCacheCleanupWorker] Recommendations:
  1. Good cache hit rate (78.5%). Current configuration is working well.
  2. Most caches are near expiration (avg TTL: 450s). This suggests high invalidation rate.
```

### Issues
```
[PermissionCacheCleanupWorker] Issues detected:
  1. Found 3 keys without TTL - this indicates a caching bug
  2. High cache error rate: 12 errors vs 1000 hits
```

## Error Handling

- **Non-blocking errors**: Cache read/write errors don't stop the cleanup
- **Retry logic**: BullMQ handles job retries (2 attempts with exponential backoff)
- **Graceful degradation**: If cleanup fails, Redis TTL expiration continues normally

## Performance Considerations

- **Non-blocking**: Uses SCAN instead of KEYS
- **Batch processing**: Deletes keys in batches of 100
- **Concurrency**: Runs one cleanup job at a time
- **Memory efficient**: Processes keys incrementally
- **Low impact**: Default 6-hour interval minimizes overhead

## Related Jobs

### Permission Cache Warming
- **File**: `permission-cache-warming.job.ts`
- **Purpose**: Proactively load permissions for frequently accessed users
- **Runs**: On-demand or after deployment

### Cache Maintenance
- **File**: `cache-maintenance.job.ts`
- **Purpose**: General cache warming and health monitoring
- **Runs**: Hourly metrics collection, weekly reports

## Files Modified

### New Files
- ✅ `src/jobs/permission-cache-cleanup.job.ts` - Main cleanup job implementation

### Updated Files
- ✅ `src/jobs/workers.ts` - Added cleanup worker initialization and shutdown

## Testing

### Manual Test

```bash
# Start the application with workers
npm run dev

# Check logs for initialization
# Should see: "[PermissionCacheCleanup] ✓ Scheduled cleanup job (cron: 0 */6 * * *)"

# Manually trigger cleanup
# Create a script or use Node REPL:
node
> const { runCleanupNow } = require('./src/jobs/permission-cache-cleanup.job');
> await runCleanupNow({ generateReport: true });
```

### Check Statistics

```bash
# Via Node REPL
node
> const { getCleanupStatistics } = require('./src/jobs/permission-cache-cleanup.job');
> console.log(await getCleanupStatistics());
```

## Maintenance

### Regular Checks
- Monitor cleanup job success rate (should be > 99%)
- Review recommendations weekly
- Act on critical issues immediately
- Adjust cleanup schedule if needed

### Alerting Thresholds
- Job failures: Alert after 2 consecutive failures
- Stale TTL keys: Alert if > 10 found in one run
- Hit rate: Alert if < 50% for 24 hours
- Error rate: Alert if > 1% of hits

## Future Enhancements

### Potential Improvements
1. **Predictive TTL optimization**: Machine learning to predict optimal TTL
2. **Auto-scaling cleanup**: Adjust frequency based on key growth rate
3. **Notification integration**: Send alerts to ops team for critical issues
4. **Dashboard**: Real-time visualization of cache health
5. **A/B testing**: Test different TTL values for optimization

## Related Documentation

- [Permission System Implementation](../docs/infrastructure/permissions/README.md)
- [Redis Configuration](../docs/infrastructure/redis/implementation.md)
- [Cache Performance Service](../src/lib/redis/cache-performance.service.ts)
- [Permission Cache Service](../src/lib/services/permission-cache.service.ts)
- [Background Jobs Overview](./README.md)

## Completion Status

✅ **All requirements implemented:**
- ✅ Clean up stale Redis keys (keys with no TTL)
- ✅ Monitor cache hit rates (integrated with permissionCacheService)
- ✅ Optimize cache TTLs based on usage patterns (recommendations engine)
- ✅ Production-safe SCAN implementation
- ✅ Aggressive cleanup mode for inactive users
- ✅ Comprehensive logging and metrics
- ✅ Integration with existing workers system
- ✅ Graceful shutdown support
- ✅ Manual trigger capability
- ✅ Health monitoring and statistics

The Permission Cache Cleanup job is now fully operational and integrated into the YesGoddess backend infrastructure.
