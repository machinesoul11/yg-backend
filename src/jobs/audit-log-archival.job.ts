/**
 * Audit Log Archival Job
 * 
 * Archives audit logs older than 1 year to the audit_events_archive table.
 * This maintains query performance on the main audit_events table while
 * preserving historical data for compliance.
 * 
 * Archival Process:
 * 1. Mark entries older than 1 year as archived
 * 2. Copy to audit_events_archive table
 * 3. Wait 30 days (grace period)
 * 4. Delete from main table (allowed because archived flag is true)
 */

import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { prisma } from '@/lib/db';

const ARCHIVE_QUEUE_NAME = 'audit-log-archival';

export interface ArchivalJobData {
  olderThanDays?: number; // Default: 365 (1 year)
  batchSize?: number; // Default: 1000
  gracePeriodDays?: number; // Default: 30
  dryRun?: boolean; // Default: false
}

export interface ArchivalResult {
  totalProcessed: number;
  markedForArchival: number;
  archived: number;
  deleted: number;
  errors: number;
}

/**
 * Get or create archival queue
 */
export function getArchivalQueue(): Queue<ArchivalJobData> {
  return new Queue<ArchivalJobData>(ARCHIVE_QUEUE_NAME, {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
      removeOnComplete: {
        age: 30 * 24 * 3600, // Keep for 30 days
        count: 100,
      },
      removeOnFail: {
        age: 90 * 24 * 3600, // Keep failures for 90 days
        count: 500,
      },
    },
  });
}

/**
 * Archive old audit logs
 */
async function archiveAuditLogs(options: ArchivalJobData): Promise<ArchivalResult> {
  const {
    olderThanDays = 365,
    batchSize = 1000,
    gracePeriodDays = 30,
    dryRun = false,
  } = options;

  const result: ArchivalResult = {
    totalProcessed: 0,
    markedForArchival: 0,
    archived: 0,
    deleted: 0,
    errors: 0,
  };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const deleteGraceDate = new Date();
  deleteGraceDate.setDate(deleteGraceDate.getDate() - gracePeriodDays);

  console.log(`[AuditArchival] Starting archival process...`);
  console.log(`[AuditArchival] Cutoff date: ${cutoffDate.toISOString()}`);
  console.log(`[AuditArchival] Grace period: ${gracePeriodDays} days`);
  console.log(`[AuditArchival] Dry run: ${dryRun}`);

  try {
    // Step 1: Find entries to archive (not already archived, older than cutoff)
    const entriesToArchive = await prisma.auditEvent.findMany({
      where: {
        timestamp: { lt: cutoffDate },
        archived: false,
      },
      take: batchSize,
      orderBy: { timestamp: 'asc' },
    });

    console.log(`[AuditArchival] Found ${entriesToArchive.length} entries to archive`);

    for (const entry of entriesToArchive) {
      try {
        if (!dryRun) {
          // Mark as archived
          await prisma.auditEvent.update({
            where: { id: entry.id },
            data: {
              archived: true,
              archivedAt: new Date(),
            },
          });

          // Copy to archive table
          await prisma.auditEventArchive.create({
            data: {
              id: entry.id, // Keep same ID for reference
              timestamp: entry.timestamp,
              userId: entry.userId,
              email: entry.email,
              action: entry.action,
              permission: entry.permission,
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              entityType: entry.entityType,
              entityId: entry.entityId,
              beforeState: entry.beforeState,
              afterState: entry.afterState,
              beforeJson: entry.beforeJson,
              afterJson: entry.afterJson,
              ipAddress: entry.ipAddress,
              userAgent: entry.userAgent,
              sessionId: entry.sessionId,
              requestId: entry.requestId,
              metadata: entry.metadata,
              encryptedMetadata: entry.encryptedMetadata,
              previousLogHash: entry.previousLogHash,
              entryHash: entry.entryHash,
              originalId: entry.id,
            },
          });

          result.archived++;
        }

        result.markedForArchival++;
        result.totalProcessed++;
      } catch (error) {
        console.error(`[AuditArchival] Error archiving entry ${entry.id}:`, error);
        result.errors++;
      }
    }

    // Step 2: Delete entries that have been archived for more than grace period
    if (!dryRun) {
      const entriesToDelete = await prisma.auditEvent.findMany({
        where: {
          archived: true,
          archivedAt: {
            lt: deleteGraceDate,
          },
        },
        select: { id: true },
        take: batchSize,
      });

      console.log(`[AuditArchival] Found ${entriesToDelete.length} entries past grace period`);

      for (const entry of entriesToDelete) {
        try {
          // Delete is allowed because archived flag is true (see migration trigger)
          await prisma.auditEvent.delete({
            where: { id: entry.id },
          });

          result.deleted++;
        } catch (error) {
          console.error(`[AuditArchival] Error deleting entry ${entry.id}:`, error);
          result.errors++;
        }
      }
    }

    console.log(`[AuditArchival] Archival complete:`, result);
    return result;
  } catch (error) {
    console.error('[AuditArchival] Fatal error during archival:', error);
    throw error;
  }
}

/**
 * Create archival worker
 */
export function createArchivalWorker(): Worker<ArchivalJobData, ArchivalResult> {
  const worker = new Worker<ArchivalJobData, ArchivalResult>(
    ARCHIVE_QUEUE_NAME,
    async (job: Job<ArchivalJobData>) => {
      console.log(`[ArchivalWorker] Processing job ${job.id}`);
      return await archiveAuditLogs(job.data);
    },
    {
      connection: getBullMQRedisClient(),
      concurrency: 1, // Run one at a time to avoid conflicts
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[ArchivalWorker] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ArchivalWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}

/**
 * Schedule monthly archival job
 */
export async function scheduleMonthlyArchival(): Promise<void> {
  const queue = getArchivalQueue();

  // Add repeatable job - runs monthly on the 1st at 2 AM
  await queue.add(
    'monthly-archival',
    {
      olderThanDays: 365,
      batchSize: 1000,
      gracePeriodDays: 30,
      dryRun: false,
    },
    {
      repeat: {
        pattern: '0 2 1 * *', // Cron: 2 AM on the 1st of each month
      },
      jobId: 'monthly-audit-archival',
    }
  );

  console.log('[AuditArchival] ✓ Monthly archival job scheduled');
}

/**
 * Run archival manually
 */
export async function runArchivalNow(options: ArchivalJobData = {}): Promise<void> {
  const queue = getArchivalQueue();

  await queue.add('manual-archival', options, {
    priority: 1, // High priority for manual runs
  });

  console.log('[AuditArchival] Manual archival job queued');
}

/**
 * Get archival statistics
 */
export async function getArchivalStatistics() {
  const [
    totalAuditLogs,
    archivedLogs,
    archiveTableCount,
    oldestUnarchived,
    newestArchived,
  ] = await Promise.all([
    prisma.auditEvent.count(),
    prisma.auditEvent.count({ where: { archived: true } }),
    prisma.auditEventArchive.count(),
    prisma.auditEvent.findFirst({
      where: { archived: false },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true },
    }),
    prisma.auditEvent.findFirst({
      where: { archived: true },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true, archivedAt: true },
    }),
  ]);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 365);

  const eligibleForArchival = await prisma.auditEvent.count({
    where: {
      timestamp: { lt: cutoffDate },
      archived: false,
    },
  });

  return {
    totalAuditLogs,
    archivedInMainTable: archivedLogs,
    inArchiveTable: archiveTableCount,
    eligibleForArchival,
    oldestUnarchived: oldestUnarchived?.timestamp || null,
    newestArchived: newestArchived?.timestamp || null,
    lastArchivedAt: newestArchived?.archivedAt || null,
  };
}

// Singleton worker instance
let archivalWorker: Worker<ArchivalJobData, ArchivalResult> | null = null;

/**
 * Initialize the archival worker
 */
export function initializeArchivalWorker(): void {
  if (archivalWorker) {
    console.log('[ArchivalWorker] Worker already initialized');
    return;
  }

  console.log('[ArchivalWorker] Initializing archival worker...');
  archivalWorker = createArchivalWorker();
  console.log('[ArchivalWorker] ✓ Archival worker initialized');
}

/**
 * Shutdown the archival worker
 */
export async function shutdownArchivalWorker(): Promise<void> {
  if (!archivalWorker) {
    return;
  }

  console.log('[ArchivalWorker] Shutting down archival worker...');
  await archivalWorker.close();
  archivalWorker = null;
  console.log('[ArchivalWorker] ✓ Archival worker shut down');
}
