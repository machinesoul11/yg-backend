# Phase 9 - Background Jobs Implementation - COMPLETE

**Status:** ✅ COMPLETE  
**Date:** October 18, 2025

## Implementation Summary

All Phase 9 background jobs have been successfully implemented and integrated into the existing YesGoddess backend infrastructure using **BullMQ** with Redis for job queue management.

---

## Jobs Overview

### ✅ 1. Notification Delivery Job
**File:** `src/jobs/notification-delivery.job.ts`  
**Status:** Already Implemented

**Features:**
- Asynchronous delivery of individual notifications
- Multi-channel support: in-app + email
- Automatic retry with exponential backoff (3 attempts)
- Idempotency via unique job IDs
- Proper error handling and logging
- Graceful degradation (continues even if email fails)

**Queue Configuration:**
- **Concurrency:** 10 workers
- **Retry Strategy:** Exponential backoff starting at 2 seconds
- **Retention:** Last 1000 completed jobs (24 hours), last 5000 failed jobs (7 days)

**Usage:**
```typescript
import { queueNotificationDelivery } from '@/jobs/notification-delivery.job';

await queueNotificationDelivery(notificationId);
```

---

### ✅ 2. Notification Digest Job
**File:** `src/jobs/notification-digest.job.ts`  
**Status:** Already Implemented

**Features:**
- Daily and weekly notification digest emails
- User preference-based digest delivery
- Batch processing (50 users at a time)
- Timezone-aware scheduling
- Tracks last digest sent timestamps
- Skip users with no notifications

**Schedule:**
- **Daily Digest:** Every day at 9 AM UTC
- **Weekly Digest:** Every Monday at 9 AM UTC

**Queue Configuration:**
- **Retry Strategy:** Fixed 1-minute delay (2 attempts)
- **Retention:** Last 100 jobs

**Key Services:**
- `NotificationPreferencesService` - Manages user digest preferences
- `NotificationEmailService` - Sends digest emails

**Initialization:**
```typescript
import { scheduleNotificationDigests } from '@/jobs/notification-digest.job';

await scheduleNotificationDigests(); // Called in workers.ts
```

---

### ✅ 3. Analytics Aggregation Jobs
**Files:** 
- `src/jobs/analytics-jobs.ts` (hourly, daily)
- `src/jobs/metrics-aggregation.job.ts` (weekly, monthly)

**Status:** Already Implemented

**Features:**

#### Event Enrichment (Real-time)
- Enriches analytics events with additional context
- 5 concurrent workers
- Exponential backoff retry (5 seconds)

#### Daily Metrics Aggregation
- Aggregates metrics at daily level
- Runs automatically after hourly aggregations
- Uses `MetricsAggregationService`

#### Weekly Metrics Rollup
- Aggregates weekly metrics every Monday at 4 AM UTC
- Uses `WeeklyMetricsRollupService`
- Comprehensive logging and error tracking

#### Monthly Metrics Rollup
- Aggregates monthly metrics on the 2nd of each month at 5 AM UTC
- Uses `MonthlyMetricsRollupService`
- Tracks job duration and errors

**Queue Configuration:**
- **Hourly/Daily:** 3 attempts, exponential backoff (60 seconds)
- **Weekly:** 3 attempts, exponential backoff (2 minutes)
- **Monthly:** 3 attempts, exponential backoff (3 minutes)

**Database Tracking:**
- All aggregation jobs logged in `MetricsAggregationJobsLog` table
- Tracks: job type, start/end times, duration, records processed, errors

---

### ✅ 4. Search Index Update Job
**File:** `src/jobs/search-index-update.job.ts`  
**Status:** ✅ **NEWLY IMPLEMENTED**

**Architecture:** PostgreSQL Full-Text Search with tsvector/GIN indexes

**Features:**

#### Real-Time Index Updates
- Triggered when searchable content changes (create/update/delete)
- Supports: Assets, Creators, Projects, Licenses, Blog Posts
- 20 concurrent workers
- Exponential backoff retry (5 seconds, 3 attempts)

#### Bulk Index Updates
- Batch processing for multiple entities
- Processes 50 entities per batch
- Progress tracking
- 5 concurrent workers

#### Full Reindex
- Complete reindex of all searchable entities
- Configurable batch size (default: 100)
- Progress reporting
- Runs weekly on Sundays at 3 AM UTC
- Single worker (prevents concurrent full reindexes)

**Queue Configuration:**
- **Real-time:** 20 concurrency, 3 attempts
- **Bulk:** 5 concurrency, 3 attempts  
- **Reindex:** 1 concurrency, 2 attempts, 1-hour timeout

**Supported Entities:**
- `asset` - IP Assets (title, description, tags)
- `creator` - Creator profiles (stageName, bio, specialties)
- `project` - Projects (title, description)
- `license` - Licenses
- `blog_post` - Blog posts (title, excerpt, content)

**Usage:**
```typescript
import { 
  queueSearchIndexUpdate,
  queueBulkSearchIndexUpdate,
  queueFullReindex 
} from '@/jobs/search-index-update.job';

// Single entity update
await queueSearchIndexUpdate('asset', assetId, 'update');

// Bulk update
await queueBulkSearchIndexUpdate('creator', creatorIds);

// Full reindex (all entities)
await queueFullReindex();

// Full reindex (specific entity)
await queueFullReindex('asset');
```

**How It Works:**
1. **Database Triggers:** PostgreSQL automatically maintains tsvector columns via triggers
2. **Job Role:** Ensures records are touched/updated to trigger database indexing
3. **Soft Deletes:** Automatically excludes soft-deleted records
4. **Consistency:** Weekly full reindex corrects any inconsistencies

---

### ✅ 5. File Preview Regeneration Job
**File:** `src/jobs/asset-preview-generation.job.ts`  
**Status:** Already Implemented

**Features:**
- Generates preview clips for video and audio assets
- Video: 10-second preview clips
- Audio: 30-second preview clips
- Lower priority background processing
- Intelligent format handling
- Storage-optimized output

**Triggers:**
- Automatically after asset upload and thumbnail generation
- On-demand regeneration for format changes
- Bulk regeneration when preview specs change

**Key Services:**
- `VideoProcessorService` - Generates video previews
- `AudioProcessorService` - Generates audio previews
- `StorageProvider` - Manages file storage

---

## Infrastructure

### Job Queue System: BullMQ + Redis

**Why BullMQ?**
- Built-in retry logic with exponential backoff
- Job prioritization
- Progress tracking
- Scheduled/recurring jobs via cron patterns
- Job state persistence
- Horizontal scalability
- Event-driven architecture

**Redis Configuration:**
- Connection managed via `@/lib/db/redis`
- Lazy queue wrapper for serverless compatibility
- Workers conditionally created (skip in serverless environments)

**Lazy Queue Pattern:**
```typescript
import { createLazyQueue, createWorkerIfNotServerless } from '@/lib/queue/lazy-queue';

export const myQueue = createLazyQueue<JobData>('queue-name', options);
export const myWorker = createWorkerIfNotServerless('queue-name', processor, options);
```

---

## Worker Initialization

**File:** `src/jobs/workers.ts`

All background workers are initialized on application startup:

```typescript
export async function initializeAllWorkers(): Promise<void> {
  // Email workers
  initializeEmailWorkers();
  
  // Blog publishing
  await setupScheduledPublishingJob();
  
  // Analytics aggregation (hourly, daily, weekly, monthly)
  await initializeMetricsAggregationJobs();
  
  // Notification digests (daily, weekly)
  await scheduleNotificationDigests();
  
  // Search index maintenance (weekly full reindex)
  await schedulePeriodicReindex();
}
```

**Graceful Shutdown:**
- SIGTERM and SIGINT handlers configured
- All workers gracefully closed
- Prevents job interruption during deployment

---

## Monitoring & Observability

### Job Metrics

Each job tracks:
- **Queue Counts:** Waiting, active, completed, failed
- **Execution Time:** Start time, end time, duration
- **Success/Failure Rates:** Attempts, errors
- **Progress:** For long-running jobs (reindex, aggregation)

### Health Checks

**Get All Workers Health:**
```typescript
import { getAllWorkersHealth } from '@/jobs/workers';

const health = await getAllWorkersHealth();
// Returns: { healthy: boolean, email: {...}, blog: {...} }
```

**Get Search Index Stats:**
```typescript
import { getSearchIndexStats } from '@/jobs/search-index-update.job';

const stats = await getSearchIndexStats();
// Returns: { realtime: {...}, bulk: {...}, reindex: {...} }
```

### Logging

All jobs implement comprehensive logging:
- Job start/completion
- Progress updates
- Error details with stack traces
- Batch processing metrics
- User-specific actions

**Example:**
```
[NotificationDigest] Starting DAILY digest job
[NotificationDigest] Found 1,245 users for DAILY digest
[NotificationDigest] Sent DAILY digest to user abc123 with 15 notifications
[NotificationDigest] DAILY digest completed in 45,231ms: 1,245 sent, 3 errors
```

### Error Handling

**Retry Strategies:**
- **Exponential Backoff:** For transient errors (network, DB)
- **Fixed Delay:** For rate-limited services
- **Max Attempts:** Prevents infinite loops
- **Dead Letter Queue:** Failed jobs retained for analysis

**Circuit Breaker:**
- Notification delivery implements circuit breaker pattern
- Prevents overwhelming external services during outages

---

## Database Integration

### Job Tracking Tables

**MetricsAggregationJobsLog:**
- Tracks all analytics aggregation job executions
- Fields: jobType, periodStartDate, periodEndDate, status, startedAt, completedAt, durationSeconds, recordsProcessed, errorsCount, errorMessage

**Benefits:**
- Historical job performance analysis
- Failure pattern detection
- Audit trail for compliance
- Performance optimization insights

---

## Performance Considerations

### Concurrency Limits

| Job Type | Concurrency | Rationale |
|----------|-------------|-----------|
| Notification Delivery | 10 | Balance delivery speed with email provider limits |
| Search Index Update | 20 | High throughput for real-time updates |
| Bulk Search Index | 5 | Lower priority, prevent DB overload |
| Full Reindex | 1 | Resource-intensive, avoid conflicts |
| Event Enrichment | 5 | Moderate load, enrichment services |

### Batch Processing

All bulk operations use batching:
- **Notification Digests:** 50 users per batch
- **Search Reindex:** 100 entities per batch
- **Bulk Index Updates:** 50 entities per batch

**Benefits:**
- Prevents memory overflow
- Enables progress tracking
- Allows partial success
- Reduces DB connection pressure

### Queue Prioritization

Job priorities (high to low):
1. **Notification Delivery** (user-facing)
2. **Search Index Updates** (user-facing search)
3. **Analytics Enrichment** (near real-time)
4. **Digest Emails** (scheduled)
5. **Aggregation Jobs** (scheduled)
6. **Full Reindex** (maintenance)

---

## Scalability

### Horizontal Scaling

**Add More Workers:**
```bash
# Run multiple worker processes
npm run workers:start -- --instances 4
```

Each worker process:
- Connects to same Redis instance
- Processes jobs from shared queues
- Automatic load balancing via BullMQ

### Vertical Scaling

**Increase Concurrency:**
```typescript
// In job configuration
export const worker = new Worker('queue-name', processor, {
  concurrency: 50, // Increase from default
});
```

### Queue Sharding

For very high throughput:
- Split queues by priority
- Use separate Redis instances
- Route critical jobs to dedicated infrastructure

---

## Integration Points

### How to Trigger Jobs

#### From API Routes:
```typescript
import { queueNotificationDelivery } from '@/jobs/notification-delivery.job';

// Create notification, then queue delivery
const notification = await notificationService.create(...);
await queueNotificationDelivery(notification.id);
```

#### From Services:
```typescript
import { queueSearchIndexUpdate } from '@/jobs/search-index-update.job';

// After updating an asset
await prisma.iPAsset.update({ where: { id }, data: { ... } });
await queueSearchIndexUpdate('asset', id, 'update');
```

#### From Webhooks:
```typescript
import { queueNotificationDelivery } from '@/jobs/notification-delivery.job';

// Stripe webhook handler
const notification = await createPayoutNotification(stripeEvent);
await queueNotificationDelivery(notification.id);
```

---

## Testing

### Manual Job Triggering

**Notification Digest:**
```typescript
import { triggerDigestManually } from '@/jobs/notification-digest.job';

await triggerDigestManually('DAILY');
await triggerDigestManually('WEEKLY');
```

**Search Reindex:**
```typescript
import { queueFullReindex } from '@/jobs/search-index-update.job';

// Reindex all entities
await queueFullReindex();

// Reindex specific entity type
await queueFullReindex('asset', 50); // batch size 50
```

**Individual Jobs:**
```typescript
import { queueNotificationDelivery } from '@/jobs/notification-delivery.job';
import { queueSearchIndexUpdate } from '@/jobs/search-index-update.job';

await queueNotificationDelivery('notification-id');
await queueSearchIndexUpdate('creator', 'creator-id', 'update');
```

### Monitoring Queue State

```typescript
// Get queue stats
const stats = await searchIndexQueue.getJobCounts();
console.log('Waiting:', stats.waiting);
console.log('Active:', stats.active);
console.log('Completed:', stats.completed);
console.log('Failed:', stats.failed);

// Get specific job
const job = await searchIndexQueue.getJob('job-id');
console.log('State:', await job.getState());
console.log('Progress:', job.progress);
```

---

## Configuration

### Environment Variables

**Required:**
- `REDIS_URL` - Redis connection string
- `DATABASE_URL` - PostgreSQL connection string

**Optional:**
- `WORKER_CONCURRENCY` - Override default concurrency
- `JOB_TIMEOUT` - Global job timeout (ms)
- `ENABLE_WORKERS` - Set to 'false' to disable workers (serverless)

### Scheduled Job Patterns

| Job | Cron Pattern | Schedule |
|-----|--------------|----------|
| Daily Digest | `0 9 * * *` | 9 AM UTC daily |
| Weekly Digest | `0 9 * * 1` | 9 AM UTC every Monday |
| Weekly Metrics | `0 4 * * 1` | 4 AM UTC every Monday |
| Monthly Metrics | `0 5 2 * *` | 5 AM UTC on 2nd of month |
| Search Reindex | `0 3 * * 0` | 3 AM UTC every Sunday |
| Blog Publishing | `* * * * *` | Every minute |

---

## Migration Guide

### Existing Codebase Integration

**No Breaking Changes:**
- All jobs integrated seamlessly with existing architecture
- No modifications required to existing API routes
- Existing notification, search, and analytics systems remain unchanged
- Workers automatically initialized on app startup

**Optional Optimizations:**
1. Replace synchronous operations with job queueing:
   ```typescript
   // Before
   await sendNotificationEmail(notification);
   
   // After
   await queueNotificationDelivery(notification.id);
   ```

2. Add search index updates after content changes:
   ```typescript
   await prisma.iPAsset.update({ where: { id }, data });
   await queueSearchIndexUpdate('asset', id, 'update');
   ```

---

## Future Enhancements

### Potential Improvements

1. **Priority Queues:** Separate queues for critical vs. background jobs
2. **Rate Limiting:** Per-user or per-service rate limits
3. **Job Chaining:** Automatic dependent job triggering
4. **Advanced Monitoring:** Grafana dashboards, Prometheus metrics
5. **Job Scheduling UI:** Admin interface for managing scheduled jobs
6. **Multi-Region:** Deploy workers across regions for lower latency
7. **Job History API:** Query job execution history via API
8. **Automated Alerts:** PagerDuty/Slack alerts for job failures

### Observability Integration

**Recommended Tools:**
- **BullMQ Board:** Web UI for monitoring queues
- **Prometheus:** Metrics collection
- **Grafana:** Visualization dashboards
- **Sentry:** Error tracking and alerting

---

## Architecture Decisions

### Why PostgreSQL Full-Text Search?

**Advantages:**
- No external dependencies (Elasticsearch, Algolia)
- Lower infrastructure costs
- ACID compliance
- Consistent with existing data
- GIN indexes provide excellent performance
- Simplified deployment and maintenance

**Trade-offs:**
- Less sophisticated than dedicated search engines
- Limited language support (primarily English)
- Fewer advanced features (fuzzy matching, typo tolerance)

**When to Consider Migration:**
- 10M+ searchable documents
- Need for advanced NLP features
- Multi-language requirements
- Sub-50ms search latency requirements

### Why BullMQ over Alternatives?

**Alternatives Considered:**
- **Sidekiq:** Ruby-specific (project is TypeScript/Node)
- **Celery:** Python-specific
- **Kafka:** Over-engineered for job queue use case
- **AWS SQS:** Vendor lock-in, higher latency

**BullMQ Wins:**
- Native TypeScript support
- Built-in scheduling (cron patterns)
- Rich feature set (retry, backoff, priorities)
- Active maintenance and community
- Redis-backed (already in tech stack)

---

## Troubleshooting

### Common Issues

**Jobs Not Processing:**
1. Check Redis connection: `redis-cli ping`
2. Verify workers are running: Check logs for `[Workers] Initializing...`
3. Check queue counts: Look for growing waiting/failed counts
4. Review worker concurrency settings

**High Failure Rates:**
1. Check error logs: `await queue.getFailedJobs()`
2. Review job parameters: Ensure valid entity IDs
3. Check database connectivity
4. Verify external service availability (email provider)

**Search Index Out of Sync:**
1. Trigger manual reindex: `await queueFullReindex()`
2. Check for database trigger errors
3. Verify tsvector columns exist
4. Review GIN index definitions

**Memory Issues:**
1. Reduce worker concurrency
2. Decrease batch sizes
3. Add more worker processes (horizontal scaling)
4. Increase Redis memory limits

---

## Security Considerations

### Job Data Sanitization

- Never log sensitive data (passwords, tokens)
- Redact PII in error messages
- Use job IDs instead of full data in logs

### Access Control

- Jobs run with system-level permissions
- No user authentication required
- Be cautious with user-provided data in job parameters
- Validate all input data before processing

### Rate Limiting

- Respect external service limits (email providers)
- Implement backoff for rate-limited APIs
- Monitor for abuse patterns

---

## Compliance & Auditing

### Data Retention

- **Completed Jobs:** Retained 24 hours to 30 days (configurable)
- **Failed Jobs:** Retained 7-30 days for debugging
- **Aggregation Logs:** Retained indefinitely (small volume)

### Audit Trail

- All job executions logged with timestamps
- User actions tracked (who triggered, when, what entity)
- Metrics aggregation logs provide compliance audit trail

---

## Documentation References

**Related Documentation:**
- `src/jobs/README.md` - Job directory overview
- `src/modules/search/README.md` - Search service documentation
- `docs/NOTIFICATION_SYSTEM_IMPLEMENTATION.md` - Notification system details
- `docs/CONTENT_ANALYTICS_API_IMPLEMENTATION.md` - Analytics implementation
- `migrations/add_creator_search_indexes.sql` - Search index schema

**External Resources:**
- [BullMQ Documentation](https://docs.bullmq.io/)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [Redis Documentation](https://redis.io/docs/)

---

## Summary

Phase 9 - Background Jobs Implementation is **100% complete** with all requested functionality delivered:

✅ **Notification Delivery Job** - Real-time, multi-channel notification delivery  
✅ **Notification Digest Job** - Daily and weekly email digests  
✅ **Analytics Aggregation Jobs** - Hourly, daily, weekly, and monthly rollups  
✅ **Search Index Update Job** - Real-time updates + weekly full reindex  
✅ **File Preview Regeneration Job** - Video and audio preview generation

All jobs are production-ready, fully integrated, and automatically initialized on application startup. Comprehensive error handling, retry logic, monitoring, and logging ensure reliability and observability.

The implementation follows best practices for:
- Scalability (horizontal and vertical)
- Reliability (retries, idempotency, graceful degradation)
- Observability (logging, metrics, health checks)
- Performance (batching, concurrency, prioritization)
- Maintainability (clear structure, documentation, testing)

**No breaking changes** were introduced. All existing functionality remains intact and operational.
