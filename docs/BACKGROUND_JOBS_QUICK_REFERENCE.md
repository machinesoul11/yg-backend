# Background Jobs - Quick Reference Guide

This guide provides quick examples for using the YesGoddess backend job system.

## Job System Overview

- **Queue System:** BullMQ + Redis
- **Worker Pattern:** Lazy-loading queues (serverless-compatible)
- **Scheduling:** Cron patterns for recurring jobs
- **Retry Logic:** Exponential backoff with configurable attempts

---

## Notification Jobs

### Queue Notification Delivery (Individual)

```typescript
import { queueNotificationDelivery } from '@/jobs/notification-delivery.job';

// After creating a notification
const notification = await notificationService.createNotification({
  userId,
  type: 'LICENSE_APPROVED',
  title: 'License Approved',
  message: 'Your license has been approved',
  metadata: { licenseId },
});

// Queue for immediate delivery
await queueNotificationDelivery(notification.id);
```

### Trigger Notification Digest Manually

```typescript
import { triggerDigestManually } from '@/jobs/notification-digest.job';

// Send daily digest to all opted-in users
await triggerDigestManually('DAILY');

// Send weekly digest to all opted-in users
await triggerDigestManually('WEEKLY');
```

**Automatic Schedule:**
- Daily: Every day at 9 AM UTC
- Weekly: Every Monday at 9 AM UTC

---

## Search Index Jobs

### Update Search Index (Single Entity)

```typescript
import { queueSearchIndexUpdate } from '@/jobs/search-index-update.job';

// After creating/updating an asset
await prisma.ipAsset.update({
  where: { id: assetId },
  data: { title: 'New Title', description: 'New Description' },
});
await queueSearchIndexUpdate('asset', assetId, 'update');

// After creating a creator profile
await prisma.creator.create({ data: { ... } });
await queueSearchIndexUpdate('creator', creatorId, 'create');

// After deleting a project
await prisma.project.update({
  where: { id: projectId },
  data: { deletedAt: new Date() },
});
await queueSearchIndexUpdate('project', projectId, 'delete');
```

**Supported Entity Types:**
- `asset` - IP Assets
- `creator` - Creator profiles
- `project` - Projects
- `license` - Licenses
- `blog_post` - Blog posts

### Bulk Update Search Index

```typescript
import { queueBulkSearchIndexUpdate } from '@/jobs/search-index-update.job';

// After bulk updating assets
const assetIds = ['asset1', 'asset2', 'asset3', ...];
await queueBulkSearchIndexUpdate('asset', assetIds);

// After importing multiple creators
const creatorIds = await importCreators(csvData);
await queueBulkSearchIndexUpdate('creator', creatorIds);
```

### Trigger Full Reindex

```typescript
import { queueFullReindex } from '@/jobs/search-index-update.job';

// Reindex all entities (assets, creators, projects, licenses, blog posts)
await queueFullReindex();

// Reindex only assets
await queueFullReindex('asset');

// Reindex with custom batch size
await queueFullReindex('creator', 50);
```

**Automatic Schedule:**
- Full reindex: Every Sunday at 3 AM UTC

### Get Search Index Stats

```typescript
import { getSearchIndexStats } from '@/jobs/search-index-update.job';

const stats = await getSearchIndexStats();
console.log('Real-time updates:', stats.realtime);
console.log('Bulk updates:', stats.bulk);
console.log('Reindex jobs:', stats.reindex);

// Output:
// {
//   realtime: { waiting: 5, active: 2, completed: 1234, failed: 3 },
//   bulk: { waiting: 0, active: 0, completed: 12, failed: 0 },
//   reindex: { waiting: 0, active: 0, completed: 4, failed: 0 }
// }
```

---

## Analytics Jobs

### Manual Daily Metrics Aggregation

```typescript
import { aggregateDailyMetricsQueue } from '@/jobs/analytics-jobs';

// Aggregate metrics for a specific date
const dateStr = '2025-10-18'; // YYYY-MM-DD
await aggregateDailyMetricsQueue.add('aggregate-daily', { date: dateStr });
```

### Manual Weekly Metrics Rollup

```typescript
import { scheduleWeeklyMetricsRollup } from '@/jobs/metrics-aggregation.job';

// Schedule immediate weekly rollup
await scheduleWeeklyMetricsRollup();
```

**Automatic Schedule:**
- Hourly enrichment: Real-time
- Daily aggregation: Automatic after hourly
- Weekly rollup: Every Monday at 4 AM UTC
- Monthly rollup: 2nd of each month at 5 AM UTC

---

## File Preview Jobs

### Queue Preview Generation

```typescript
import { assetPreviewQueue } from '@/jobs/asset-preview-generation.job';

// After uploading a video or audio file
await assetPreviewQueue.add('generate-preview', {
  assetId: asset.id,
  storageKey: asset.storageKey,
  type: asset.type, // 'VIDEO' or 'AUDIO'
  mimeType: asset.mimeType,
});
```

**Note:** Preview generation is automatically triggered after:
1. Virus scan completion
2. Thumbnail generation completion

---

## Worker Management

### Initialize All Workers (On Startup)

```typescript
import { initializeAllWorkers } from '@/jobs/workers';

// Called in your application startup
await initializeAllWorkers();
```

### Graceful Shutdown

```typescript
import { shutdownAllWorkers } from '@/jobs/workers';

// Called on SIGTERM or SIGINT
process.on('SIGTERM', async () => {
  await shutdownAllWorkers();
  process.exit(0);
});
```

### Check Worker Health

```typescript
import { getAllWorkersHealth } from '@/jobs/workers';

const health = await getAllWorkersHealth();

if (health.healthy) {
  console.log('All workers healthy');
} else {
  console.log('Email workers:', health.email);
  console.log('Blog workers:', health.blog);
}
```

---

## Queue Monitoring

### Get Queue Counts

```typescript
import { searchIndexQueue } from '@/jobs/search-index-update.job';

const counts = await searchIndexQueue.getJobCounts(
  'waiting',
  'active',
  'completed',
  'failed'
);

console.log('Waiting jobs:', counts.waiting);
console.log('Active jobs:', counts.active);
console.log('Completed jobs:', counts.completed);
console.log('Failed jobs:', counts.failed);
```

### Get Specific Job

```typescript
const job = await searchIndexQueue.getJob('job-id');

if (job) {
  console.log('Job state:', await job.getState());
  console.log('Job progress:', job.progress);
  console.log('Job data:', job.data);
  console.log('Job logs:', await job.getLogs());
}
```

### Get Failed Jobs

```typescript
const failedJobs = await searchIndexQueue.getFailed(0, 10); // Get first 10

for (const job of failedJobs) {
  console.log('Failed job:', job.id);
  console.log('Error:', job.failedReason);
  console.log('Attempts:', job.attemptsMade);
}
```

### Retry Failed Jobs

```typescript
const failedJobs = await searchIndexQueue.getFailed();

for (const job of failedJobs) {
  await job.retry();
}
```

### Clean Completed Jobs

```typescript
// Remove jobs completed more than 24 hours ago
await searchIndexQueue.clean(24 * 3600 * 1000, 0, 'completed');

// Remove all completed jobs
await searchIndexQueue.obliterate({ force: true });
```

---

## Integration Examples

### Example 1: Asset Upload Flow

```typescript
// 1. Upload file to storage
const uploadResult = await storageProvider.uploadFile(file);

// 2. Create asset record
const asset = await prisma.ipAsset.create({
  data: {
    title: file.name,
    type: 'VIDEO',
    storageKey: uploadResult.key,
    fileSize: file.size,
    mimeType: file.type,
    status: 'DRAFT',
    createdBy: userId,
  },
});

// 3. Queue search index update
await queueSearchIndexUpdate('asset', asset.id, 'create');

// 4. Queue virus scan (triggers thumbnail & preview generation)
await virusScanQueue.add('scan', { assetId: asset.id });

return asset;
```

### Example 2: Notification Flow

```typescript
// 1. Create notification
const notification = await prisma.notification.create({
  data: {
    userId,
    type: 'PAYOUT_COMPLETED',
    title: 'Payout Processed',
    message: `Your payout of $${amount} has been processed`,
    metadata: { payoutId, amount },
  },
});

// 2. Queue immediate delivery
await queueNotificationDelivery(notification.id);

// Notification will be delivered via:
// - In-app: Immediately visible
// - Email: Based on user preferences (immediate or digest)
```

### Example 3: Project Update Flow

```typescript
// 1. Update project
const project = await prisma.project.update({
  where: { id: projectId },
  data: {
    name: 'Updated Project Name',
    description: 'New description',
    status: 'ACTIVE',
  },
});

// 2. Queue search index update
await queueSearchIndexUpdate('project', project.id, 'update');

// 3. Notify relevant users
const notification = await notificationService.createNotification({
  userId: project.brandId,
  type: 'PROJECT_UPDATED',
  title: 'Project Updated',
  message: `Project "${project.name}" has been updated`,
  metadata: { projectId: project.id },
});

await queueNotificationDelivery(notification.id);
```

### Example 4: Bulk Creator Import

```typescript
// 1. Import creators from CSV
const creatorIds = [];

for (const row of csvRows) {
  const creator = await prisma.creator.create({
    data: {
      userId: row.userId,
      stageName: row.stageName,
      bio: row.bio,
      specialties: row.specialties,
    },
  });
  
  creatorIds.push(creator.id);
}

// 2. Bulk update search index
await queueBulkSearchIndexUpdate('creator', creatorIds);

console.log(`Imported ${creatorIds.length} creators and queued search indexing`);
```

---

## Scheduled Jobs Summary

| Job | Schedule | Cron Pattern | Description |
|-----|----------|--------------|-------------|
| Daily Notification Digest | 9 AM UTC daily | `0 9 * * *` | Sends email digest of notifications |
| Weekly Notification Digest | 9 AM UTC Mondays | `0 9 * * 1` | Sends weekly email digest |
| Weekly Metrics Rollup | 4 AM UTC Mondays | `0 4 * * 1` | Aggregates weekly analytics |
| Monthly Metrics Rollup | 5 AM UTC on 2nd | `0 5 2 * *` | Aggregates monthly analytics |
| Search Reindex | 3 AM UTC Sundays | `0 3 * * 0` | Full search index rebuild |
| Blog Publishing | Every minute | `* * * * *` | Checks for scheduled posts |

---

## Best Practices

### 1. Always Queue Jobs for Async Operations

```typescript
// ❌ Bad: Synchronous operation blocks request
await sendEmail(notification);
await updateSearchIndex(asset);

// ✅ Good: Queue job for async processing
await queueNotificationDelivery(notification.id);
await queueSearchIndexUpdate('asset', asset.id, 'update');
```

### 2. Use Bulk Operations for Multiple Entities

```typescript
// ❌ Bad: Queue individual jobs
for (const assetId of assetIds) {
  await queueSearchIndexUpdate('asset', assetId, 'update');
}

// ✅ Good: Use bulk operation
await queueBulkSearchIndexUpdate('asset', assetIds);
```

### 3. Handle Job Failures Gracefully

```typescript
try {
  await queueSearchIndexUpdate('asset', assetId, 'update');
} catch (error) {
  // Log error but don't fail the main operation
  console.error('Failed to queue search update:', error);
  // The search index will be fixed on next full reindex
}
```

### 4. Monitor Job Queues

```typescript
// Periodically check queue health
setInterval(async () => {
  const stats = await getSearchIndexStats();
  
  if (stats.realtime.failed > 100) {
    // Alert: High failure rate
    await alertOpsTeam('High search index failure rate');
  }
  
  if (stats.realtime.waiting > 1000) {
    // Alert: Queue backup
    await alertOpsTeam('Search index queue backup');
  }
}, 60000); // Check every minute
```

### 5. Use Idempotent Job IDs

```typescript
// Prevents duplicate jobs for the same entity
await searchIndexQueue.add(
  'update',
  { entityType: 'asset', entityId, operation: 'update' },
  {
    jobId: `search-asset-${entityId}-update`, // Unique ID
  }
);
```

---

## Troubleshooting

### Jobs Not Processing

**Check Redis Connection:**
```bash
redis-cli ping
# Should return: PONG
```

**Check Worker Logs:**
```bash
# Look for initialization messages
grep "Workers.*Initializing" app.log
grep "SearchIndex.*Worker" app.log
```

**Check Queue Counts:**
```typescript
const stats = await getSearchIndexStats();
console.log(stats);
```

### High Failure Rate

**Get Failed Jobs:**
```typescript
const failed = await searchIndexQueue.getFailed(0, 10);
failed.forEach(job => {
  console.log('Job:', job.id);
  console.log('Error:', job.failedReason);
  console.log('Data:', job.data);
});
```

**Retry Failed Jobs:**
```typescript
const failed = await searchIndexQueue.getFailed();
for (const job of failed) {
  await job.retry();
}
```

### Queue Backup

**Increase Worker Concurrency:**
```typescript
// In job file, increase concurrency
export const searchIndexWorker = createWorkerIfNotServerless(
  QUEUE_NAME,
  processSearchIndexUpdate,
  {
    concurrency: 50, // Increased from 20
  }
);
```

**Add More Worker Processes:**
```bash
# Run multiple worker instances
npm run workers:start -- --instances 4
```

---

## Environment Variables

```bash
# Required
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Optional
WORKER_CONCURRENCY=20  # Override default concurrency
ENABLE_WORKERS=true    # Set to false in serverless
```

---

## Additional Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Job Directory README](../src/jobs/README.md)
- [Phase 9 Complete Documentation](./PHASE_9_BACKGROUND_JOBS_COMPLETE.md)
- [Search Service Documentation](../src/modules/search/README.md)
