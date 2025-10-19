# Background Jobs

This directory contains all BullMQ background job definitions for the YesGoddess backend.

## **Job Files**

### **System Jobs**
- `idempotency-cleanup.job.ts` - Cleans up expired idempotency keys (every 6 hours)
- `notification-cleanup.job.ts` - Deletes old read notifications (daily at 3 AM)

### **Upload & Asset Jobs**
- `asset-virus-scan.job.ts` - Scans uploaded files for viruses and malware (on upload confirmation)
- `asset-thumbnail-generation.job.ts` - Generates thumbnails for images, videos, and documents (after scan)
- `asset-metadata-extraction.job.ts` - Extracts comprehensive metadata from all asset types (after scan)
- `asset-preview-generation.job.ts` - Generates preview clips for videos and audio (lower priority)
- `asset-format-conversion.job.ts` - Converts assets to web-optimized formats and generates variants (low priority)
- `asset-watermarking.job.ts` - Applies watermarks to assets when configured (on-demand)
- `asset-cleanup.job.ts` - Deletes soft-deleted assets after 30 days (daily at 2 AM)
- `upload-cleanup.job.ts` - Cleans abandoned/failed uploads (hourly)

### **Authentication Jobs**
- `token-cleanup.job.ts` - Removes expired tokens (hourly)
- `session-cleanup.job.ts` - Removes expired sessions (every 6 hours)
- `account-deletion.job.ts` - Permanently deletes soft-deleted accounts (daily at 2 AM)
- `failed-login-monitor.job.ts` - Detects suspicious login patterns (every 15 minutes)
- `password-security-cleanup.job.ts` - Cleans up remember-me tokens and unlocks accounts (every 15 minutes)

### **Brand Jobs**
- `brand-verification-reminder.job.ts` - Reminds admins of pending verifications (daily at 9 AM)
- `brand-inactivity-check.job.ts` - Re-engages inactive brands (weekly on Mondays)
- `brand-data-cleanup.job.ts` - Deletes soft-deleted brands after 90 days (monthly on 1st)

### **Creator Jobs**
- `creator-onboarding-reminder.job.ts` - Reminds creators to complete onboarding
- `creator-monthly-report.job.ts` - Sends monthly performance reports

### **Project Jobs**
- `project-match-creators.job.ts` - Matches projects with suitable creators
- `project-expiry-check.job.ts` - Checks for expired projects (daily at 2 AM)

### **License Jobs**
- `license-expiry-monitor.job.ts` - Monitors licenses nearing expiration
- `license-auto-expiry.job.ts` - Auto-expires licenses at end date
- `license-renewal-workflow.job.ts` - Automated renewal eligibility checks and offer generation
- `license-management.job.ts` - General license management tasks
- `license-usage-tracking.job.ts` - Tracks and aggregates license usage events
- `license-performance-metrics.job.ts` - Calculates ROI, utilization, conflict rates, and approval times

### **Royalty Jobs**
- `royalty-calculation.job.ts` - Calculates royalties for a royalty run
- `statement-notification.job.ts` - Notifies creators when statements are ready

### **Notification Jobs**
- `notification-delivery.job.ts` - Delivers individual notifications via email and in-app channels (on-demand)
- `notification-digest.job.ts` - Sends daily and weekly notification digests (daily at 9 AM, weekly on Mondays at 9 AM)
- `notification-cleanup.job.ts` - Deletes old read notifications (daily at 3 AM)

### **Analytics Jobs**
- `analytics-jobs.ts` - Event enrichment and daily metrics aggregation
- `metrics-aggregation.job.ts` - Weekly and monthly metrics rollup (weekly on Mondays at 4 AM, monthly on 2nd at 5 AM)
- `weekly-monthly-metrics-aggregation.job.ts` - Additional metrics aggregation tasks

### **Search Jobs**
- `search-index-update.job.ts` - Maintains PostgreSQL full-text search indexes (real-time updates + weekly full reindex on Sundays at 3 AM)

### **Email Jobs**
- `email-campaign.job.ts` - Sends bulk email campaigns
- `email-digest.job.ts` - Sends email digests
- `message-digest.job.ts` - Sends message digests
- `reputation-monitoring.job.ts` - Daily reputation checks (2 AM)

### **Blog Jobs**
- `scheduled-blog-publishing.job.ts` - Publishes scheduled blog posts (checks every minute)

### **Other Jobs**
- `ownership-verification.job.ts` - Verifies IP ownership documents
- `storage-metrics-calculation.job.ts` - Calculates storage usage metrics

### **Starting Jobs**

Jobs are automatically started when the worker processes are initialized. To manually schedule:

```typescript
import { 
  scheduleIdempotencyCleanup 
} from './jobs/idempotency-cleanup.job';
import { 
  scheduleNotificationCleanup 
} from './jobs/notification-cleanup.job';
import { 
  scheduleUploadCleanup 
} from './jobs/upload-cleanup.job';

// Schedule all recurring jobs
await scheduleIdempotencyCleanup();
await scheduleNotificationCleanup();
await scheduleUploadCleanup();
```

### **Job Queues**

**Upload & Asset Processing:**
- `asset-virus-scan` - High priority virus scanning (triggered on upload)
- `upload-cleanup` - Hourly cleanup of abandoned/failed uploads
- `asset-thumbnail-generation` - Thumbnail generation (after scan)
- `asset-metadata-extraction` - Metadata extraction (after scan)

**System Maintenance:**
- `idempotency-cleanup` - Every 6 hours
- `notification-cleanup` - Daily at 3 AM
- `asset-cleanup` - Daily at 2 AM
- `search-index-update` - Real-time updates + weekly full reindex on Sundays at 3 AM

**Notifications:**
- `notification-delivery` - On-demand (when notifications are created)
- `notification-digest` - Daily at 9 AM, weekly on Mondays at 9 AM

**Analytics:**
- `analytics-jobs` - Event enrichment (real-time), daily metrics aggregation
- `metrics-aggregation` - Weekly on Mondays at 4 AM, monthly on 2nd at 5 AM

**Authentication:**
- `token-cleanup` - Hourly
- `session-cleanup` - Every 6 hours
- `account-deletion` - Daily at 2 AM
- `failed-login-monitor` - Every 15 minutes
- `password-security-cleanup` - Every 15 minutes

**Business Logic:**
- `royalty-calculation` - On-demand
- `statement-notification` - On-demand
- `brand-verification-reminder` - Daily at 9 AM
- `brand-inactivity-check` - Weekly on Mondays
- `brand-data-cleanup` - Monthly on 1st
- `project-expiry-check` - Daily at 2 AM
- `scheduled-blog-publishing` - Checks every minute

### **Monitoring Jobs**

Use BullMQ Dashboard or Redis CLI:

```bash
# View all queues
redis-cli KEYS *bull*

# View job counts
redis-cli HGETALL bull:idempotency-cleanup:meta
```

## **Adding New Jobs**

1. Create job file: `src/jobs/my-job.job.ts`
2. Define queue and worker
3. Export schedule function
4. Add to startup script
