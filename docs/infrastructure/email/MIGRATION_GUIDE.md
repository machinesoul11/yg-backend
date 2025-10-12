# Email Retry Tables - Migration Guide

## Overview

This migration adds three new tables to support the email retry queue system:
- `email_retry_queue` - Stores emails pending retry
- `email_dead_letter_queue` - Stores permanently failed emails
- `email_retry_metrics` - Tracks retry statistics

## Prerequisites

- [x] Database backup completed
- [x] PostgreSQL 12+ running
- [x] Prisma CLI installed
- [x] Environment variables configured

## Migration Steps

### Option 1: Using Prisma Migrate (Recommended)

```bash
# 1. Create migration
npm run db:migrate

# 2. Name it appropriately
# When prompted: "add-email-retry-tables"

# 3. Review the generated migration
cat prisma/migrations/[timestamp]_add_email_retry_tables/migration.sql

# 4. Apply to production
npm run db:migrate:deploy
```

### Option 2: Manual SQL Execution

If you prefer to run the SQL manually:

```bash
# 1. Connect to your production database
psql $DATABASE_URL

# 2. Copy and paste the SQL from the migration file
# (see SQL script below)

# 3. Verify tables were created
\dt email_*

# 4. Mark migration as applied in Prisma
npm run db:migrate:resolve --applied [migration_name]
```

## SQL Migration Script

```sql
-- CreateTable for Email Retry Queue
CREATE TABLE IF NOT EXISTS "email_retry_queue" (
    "id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "subject" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_variables" JSONB,
    "tags" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3) NOT NULL,
    "original_send_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_retry_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Email Dead Letter Queue
CREATE TABLE IF NOT EXISTS "email_dead_letter_queue" (
    "id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_variables" JSONB,
    "final_error" TEXT NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Email Retry Metrics
CREATE TABLE IF NOT EXISTS "email_retry_metrics" (
    "id" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_retry_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_retry_queue_recipient_email_idx" ON "email_retry_queue"("recipient_email");
CREATE INDEX IF NOT EXISTS "email_retry_queue_next_retry_at_idx" ON "email_retry_queue"("next_retry_at");
CREATE INDEX IF NOT EXISTS "email_retry_queue_attempt_count_idx" ON "email_retry_queue"("attempt_count");
CREATE UNIQUE INDEX IF NOT EXISTS "email_retry_queue_recipient_email_template_name_key" ON "email_retry_queue"("recipient_email", "template_name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_dead_letter_queue_recipient_email_idx" ON "email_dead_letter_queue"("recipient_email");
CREATE INDEX IF NOT EXISTS "email_dead_letter_queue_failed_at_idx" ON "email_dead_letter_queue"("failed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_retry_metrics_metric_type_idx" ON "email_retry_metrics"("metric_type");
CREATE INDEX IF NOT EXISTS "email_retry_metrics_created_at_idx" ON "email_retry_metrics"("created_at");
```

## Verification

After running the migration:

### 1. Check Tables Exist

```sql
-- List all email-related tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'email_%' 
ORDER BY table_name;
```

Expected output should include:
- `email_retry_queue`
- `email_dead_letter_queue`
- `email_retry_metrics`

### 2. Verify Indexes

```sql
-- Check indexes on retry queue
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'email_retry_queue';
```

Should show:
- Primary key on `id`
- Index on `recipient_email`
- Index on `next_retry_at`
- Index on `attempt_count`
- Unique index on `(recipient_email, template_name)`

### 3. Test Insert/Query

```sql
-- Test insert (will be rolled back)
BEGIN;

INSERT INTO email_retry_queue (
    id, recipient_email, subject, template_name, 
    next_retry_at, updated_at
) VALUES (
    'test_id', 'test@example.com', 'Test Subject', 
    'test-template', NOW() + INTERVAL '1 hour', NOW()
);

SELECT * FROM email_retry_queue WHERE id = 'test_id';

ROLLBACK;
```

### 4. Check Prisma Schema

```bash
# Generate Prisma client with new tables
npm run db:generate

# Verify types are available in code
grep -r "email_retry_queue" node_modules/.prisma/client/index.d.ts
```

## Post-Migration Testing

### Test Retry Queue Service

```typescript
import { emailRetryService } from '@/lib/services/email';

// Test adding to retry queue
const jobId = await emailRetryService.addToRetryQueue({
  recipientEmail: 'test@example.com',
  subject: 'Test',
  template: 'welcome-email',
  error: new Error('Test error'),
  attemptCount: 1,
});

console.log('Retry job ID:', jobId);

// Test getting stats
const stats = await emailRetryService.getRetryStats();
console.log('Retry stats:', stats);
```

### Verify Worker Processing

```bash
# Check BullMQ worker logs
# Should see emailRetryWorker initialized

# Send a test email that will fail
# Verify it's added to retry queue
# Check it gets processed after delay
```

## Rollback Plan

If you need to rollback the migration:

### Option 1: Using Prisma

```bash
# Rollback last migration
npm run db:migrate:resolve --rolled-back [migration_name]

# Then manually drop tables (if needed)
```

### Option 2: Manual SQL

```sql
-- Drop tables in reverse order (indexes drop automatically)
DROP TABLE IF EXISTS "email_retry_metrics" CASCADE;
DROP TABLE IF EXISTS "email_dead_letter_queue" CASCADE;
DROP TABLE IF EXISTS "email_retry_queue" CASCADE;
```

## Troubleshooting

### Migration Fails - Table Already Exists

If tables already exist from manual creation:

```sql
-- Mark migration as applied without running
npm run db:migrate:resolve --applied [migration_name]
```

### Permission Errors

Ensure database user has CREATE TABLE permission:

```sql
GRANT CREATE ON SCHEMA public TO your_db_user;
```

### Index Creation Fails

If concurrent operations prevent index creation:

```sql
-- Create indexes with CONCURRENTLY (won't lock table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_retry_queue_recipient_email_idx" 
ON "email_retry_queue"("recipient_email");
```

### Foreign Key Constraints

If you want to add foreign key to users table (optional):

```sql
-- Add foreign key for recipient_user_id
ALTER TABLE email_retry_queue
ADD CONSTRAINT email_retry_queue_recipient_user_id_fkey
FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL;
```

## Performance Considerations

### Expected Table Sizes

- `email_retry_queue`: Small (< 1000 rows typically)
- `email_dead_letter_queue`: Very small (< 100 rows)
- `email_retry_metrics`: Medium (grows over time, consider partitioning)

### Cleanup Jobs

Set up a cron job to clean old metrics:

```sql
-- Delete metrics older than 90 days
DELETE FROM email_retry_metrics
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Monitoring Queries

```sql
-- Check retry queue depth
SELECT COUNT(*) as pending_retries
FROM email_retry_queue
WHERE next_retry_at > NOW();

-- Check dead letter queue
SELECT COUNT(*) as permanent_failures
FROM email_dead_letter_queue
WHERE failed_at > NOW() - INTERVAL '7 days';

-- Check retry success rate
SELECT 
    metric_type,
    COUNT(*) as count
FROM email_retry_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY metric_type;
```

## Data Retention

Recommended retention policies:

- **Retry Queue**: Auto-cleanup after successful send or max attempts
- **Dead Letter Queue**: Keep for 30 days, then archive/delete
- **Retry Metrics**: Keep for 90 days, then aggregate and archive

## Security Notes

- Tables contain email addresses (PII) - ensure encryption at rest
- Limit access to these tables to email service only
- Consider anonymizing old data before archival
- Log access for compliance

## Support

If you encounter issues:

1. Check database logs: `tail -f /var/log/postgresql/postgresql.log`
2. Review Prisma logs: Set `DEBUG=prisma:*`
3. Check migration status: `npm run db:migrate:status`
4. Verify connection: `npm run db:health`

## Completion Checklist

- [ ] Database backup completed
- [ ] Migration SQL reviewed
- [ ] Migration applied successfully
- [ ] Tables created and indexed
- [ ] Prisma client regenerated
- [ ] Insert/query test passed
- [ ] Retry service tested
- [ ] Worker processing verified
- [ ] Monitoring queries tested
- [ ] Documentation updated
- [ ] Team notified

---

**Migration Created:** October 11, 2025
**Status:** Ready for deployment
**Breaking Changes:** None
**Downtime Required:** No
