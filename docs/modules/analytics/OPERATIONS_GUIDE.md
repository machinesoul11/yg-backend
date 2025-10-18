# Analytics Event Tracking System - Operations Guide

## System Overview

The Analytics Event Tracking System consists of several interconnected components:

1. **Event Ingestion Service** - Batches events for efficient database writes
2. **Event Enrichment Service** - Adds contextual data asynchronously
3. **Event Deduplication Service** - Prevents duplicate events
4. **Background Workers** - Process enrichment and cleanup jobs
5. **tRPC API** - Type-safe API endpoints for tracking

---

## Startup Procedures

### 1. Initialize Background Workers

In your main application startup file (`src/app/api/[...path]/route.ts` or similar):

```typescript
import { initializeAllWorkers } from '@/jobs/workers';
import { scheduleNightlyDeduplication } from '@/jobs/event-deduplication.job';

// Call during app initialization
async function startApplication() {
  // Initialize all BullMQ workers
  await initializeAllWorkers();
  
  // Schedule nightly deduplication cleanup
  await scheduleNightlyDeduplication();
  
  console.log('[Analytics] Event tracking system initialized');
}
```

### 2. Add Router to tRPC

In your main tRPC router (`src/server/api/root.ts` or similar):

```typescript
import { eventIngestionRouter } from '@/modules/analytics';

export const appRouter = createTRPCRouter({
  // ... existing routers
  eventIngestion: eventIngestionRouter,
});
```

---

## Monitoring

### Health Checks

#### 1. Ingestion Buffer Status

```bash
# Via API (admin only)
curl -X POST https://your-app.com/api/trpc/eventIngestion.getStats \
  -H "Authorization: Bearer <admin-token>"

# Expected response:
{
  "bufferSize": 45,
  "isProcessing": false,
  "config": {
    "batchSize": 100,
    "batchTimeoutMs": 10000,
    "enableDeduplication": true,
    "enableEnrichment": true,
    "deduplicationTtlSeconds": 60
  }
}
```

**Alert Conditions:**
- `bufferSize > 90` for more than 5 minutes → Buffer not flushing
- `isProcessing = true` for more than 1 minute → Stuck batch

#### 2. Deduplication Rates

```typescript
import { EventDeduplicationService } from '@/modules/analytics';

const dedupService = new EventDeduplicationService(prisma, redis);
const health = await dedupService.monitorDeduplicationRates();

if (!health.isHealthy) {
  console.error('Deduplication health check failed:', health.alerts);
  // Send alert to operations team
}
```

**Alert Thresholds:**
- Deduplication rate > 10% → Warning
- Deduplication rate > 25% → Critical (possible client bug or attack)

#### 3. Enrichment Queue

```typescript
import { enrichEventQueue } from '@/jobs/analytics-jobs';

const counts = await enrichEventQueue.getJobCounts();

console.log('Enrichment Queue Stats:', {
  waiting: counts.waiting,
  active: counts.active,
  completed: counts.completed,
  failed: counts.failed,
});
```

**Alert Conditions:**
- `failed > 100` → Enrichment errors
- `waiting > 1000` → Queue backing up
- `active = 0` AND `waiting > 0` → Worker not running

#### 4. Deduplication Queue

```typescript
import { getDeduplicationStats } from '@/jobs/event-deduplication.job';

const stats = await getDeduplicationStats();

console.log('Deduplication Queue Stats:', stats);
```

---

## Common Operations

### Force Flush Event Buffer

When you need to ensure all events are written immediately (e.g., before deployment):

```bash
# Via API (admin only)
curl -X POST https://your-app.com/api/trpc/eventIngestion.forceFlush \
  -H "Authorization: Bearer <admin-token>"
```

### Run Immediate Deduplication

```typescript
import { runImmediateDeduplication } from '@/jobs/event-deduplication.job';

// Clean up last 24 hours
await runImmediateDeduplication(24);
```

### Clear Redis Fingerprints

If you need to reset deduplication (use with caution):

```bash
redis-cli --url $REDIS_URL
> KEYS event:fingerprint:*
> DEL event:fingerprint:*
```

### Query Recent Events

```sql
-- Get last 100 events
SELECT 
  id,
  event_type,
  actor_id,
  occurred_at,
  props_json
FROM events
ORDER BY occurred_at DESC
LIMIT 100;

-- Count events by type (last hour)
SELECT 
  event_type,
  COUNT(*) as count
FROM events
WHERE occurred_at >= NOW() - INTERVAL '1 hour'
GROUP BY event_type
ORDER BY count DESC;

-- Find duplicates marked by cleanup job
SELECT 
  event_type,
  actor_id,
  occurred_at,
  props_json->>'_duplicate' as is_duplicate
FROM events
WHERE props_json->>'_duplicate' = 'true'
ORDER BY occurred_at DESC
LIMIT 50;
```

---

## Troubleshooting

### Problem: Events Not Appearing in Database

**Diagnosis:**
1. Check ingestion buffer size
2. Check for validation errors in logs
3. Verify database connectivity

**Resolution:**
```typescript
// 1. Check buffer
const stats = await trpc.eventIngestion.getStats.query();
console.log('Buffer size:', stats.bufferSize);

// 2. Force flush
if (stats.bufferSize > 0) {
  await trpc.eventIngestion.forceFlush.mutate();
}

// 3. Check logs for validation errors
// Look for: [EventIngestion] Validation failed
```

### Problem: High Deduplication Rates

**Diagnosis:**
```typescript
const dedupService = new EventDeduplicationService(prisma, redis);
const stats = dedupService.getStats();

console.log('Deduplication rate:', stats.deduplicationRate + '%');
console.log('Total checks:', stats.totalChecks);
console.log('Duplicates found:', stats.duplicatesFound);
```

**Possible Causes:**
- Client sending duplicate requests on network errors
- Retry logic without idempotency keys
- Timestamp rounding issues
- User clicking rapidly

**Resolution:**
1. Add idempotency keys to client events
2. Implement client-side debouncing
3. Review client error handling
4. Check for malicious activity

### Problem: Enrichment Not Working

**Diagnosis:**
1. Check enrichment worker status
2. Verify Redis connection
3. Check user agent in props

**Resolution:**
```typescript
// 1. Check worker
const counts = await enrichEventQueue.getJobCounts();
if (counts.active === 0 && counts.waiting > 0) {
  // Worker not processing jobs
  console.error('Enrichment worker not running');
}

// 2. Check Redis
await redis.ping();

// 3. Verify event structure
const event = await prisma.event.findUnique({
  where: { id: eventId },
  include: { attribution: true },
});

console.log('User agent:', event.propsJson.userAgent);
console.log('Attribution:', event.attribution);
```

### Problem: Batch Write Failures

**Symptoms:**
- Events re-queued repeatedly
- `[EventIngestion] Error flushing batch` in logs

**Resolution:**
1. Check database connection
2. Verify database write permissions
3. Check for schema mismatches
4. Review database resource limits

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Check for locks
SELECT * FROM pg_locks WHERE NOT granted;

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('events'));
```

### Problem: Memory Leaks

**Symptoms:**
- Increasing memory usage over time
- Application slowdown

**Diagnosis:**
```typescript
// Check buffer size
const stats = ingestionService.getStats();
console.log('Buffer size:', stats.bufferSize);

// Check Redis connections
const info = await redis.info('clients');
console.log(info);
```

**Resolution:**
1. Ensure proper shutdown handlers are configured
2. Monitor buffer flush intervals
3. Check for unclosed Redis connections
4. Review BullMQ connection pool settings

---

## Performance Tuning

### Adjust Batch Size

For high-traffic applications:

```typescript
const ingestionService = new EventIngestionService(
  prisma,
  redis,
  enrichEventQueue,
  {
    batchSize: 200,        // Increase from 100
    batchTimeoutMs: 5000,  // Reduce from 10000
  }
);
```

### Adjust Enrichment Concurrency

In `src/jobs/analytics-jobs.ts`:

```typescript
export const enrichEventWorker = new Worker(
  'enrich-event',
  async (job) => { /* ... */ },
  { 
    connection: redisConnection,
    concurrency: 10, // Increase from 5 for faster processing
  }
);
```

### Optimize Database Indexes

```sql
-- Ensure indexes exist (should already be there)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_occurred_at 
  ON events (occurred_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_type_occurred 
  ON events (event_type, occurred_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_actor_occurred 
  ON events (actor_id, occurred_at);
```

---

## Backup and Recovery

### Backup Events Data

```sql
-- Export last 30 days of events
COPY (
  SELECT * FROM events 
  WHERE occurred_at >= NOW() - INTERVAL '30 days'
) TO '/tmp/events_backup.csv' WITH CSV HEADER;
```

### Restore Events

```sql
-- Import events
COPY events FROM '/tmp/events_backup.csv' WITH CSV HEADER;
```

### Lost Events Recovery

If events were lost due to buffer not flushing on crash:

1. Check application logs for `[EventIngestion] Lost X events during shutdown`
2. If client-side buffering exists, retry from client
3. For critical events, check idempotency keys to avoid duplicates

---

## Scaling Considerations

### Horizontal Scaling

- Event ingestion service maintains per-instance buffer
- Each instance flushes independently
- BullMQ handles worker distribution automatically
- Redis handles coordination

### Vertical Scaling

- Increase `batchSize` for more memory-efficient batching
- Increase enrichment `concurrency` for faster processing
- Monitor database connection pool limits

### Database Partitioning

For very high volumes (>1M events/day):

```sql
-- Partition events by date
CREATE TABLE events_partitioned (LIKE events INCLUDING ALL);

CREATE TABLE events_2024_01 PARTITION OF events_partitioned
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE events_2024_02 PARTITION OF events_partitioned
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

---

## Metrics to Monitor

Set up monitoring for:

1. **Event Ingestion Rate** - Events/second
2. **Buffer Size** - Current events in memory
3. **Batch Flush Frequency** - Flushes/minute
4. **Enrichment Queue Length** - Pending enrichment jobs
5. **Deduplication Rate** - % of events deduplicated
6. **Database Write Latency** - ms per batch write
7. **Worker Health** - Active workers count

---

## Security Considerations

### Rate Limiting

Implement rate limiting on event ingestion endpoints:

```typescript
import { rateLimiter } from '@/lib/redis';

// In API route
const rateLimit = await rateLimiter(
  `event-tracking:${userId || 'anonymous'}`,
  100, // 100 requests
  60   // per 60 seconds
);

if (!rateLimit.allowed) {
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: 'Rate limit exceeded',
  });
}
```

### Data Privacy

- User IP addresses are captured but can be anonymized
- PII should not be stored in `props_json`
- Implement data retention policies
- Support GDPR data deletion requests

```typescript
// Delete user's events
await prisma.event.deleteMany({
  where: { actorId: userId },
});
```

---

## Support Contacts

For issues with:
- **Event Ingestion** - Check application logs and buffer stats
- **Enrichment** - Check BullMQ dashboard and worker logs  
- **Deduplication** - Check Redis connectivity and stats
- **Performance** - Review batch sizes and database indexes

---

## Change Log

- **v1.0.0** - Initial implementation
  - Event ingestion with batching
  - Event enrichment with user agent parsing
  - Event deduplication with fingerprinting
  - Background workers and cleanup jobs
