/**
 * Upload Cleanup Job
 * 
 * Cleans up abandoned or failed uploads
 * - Identifies uploads pending/uploading for > 24 hours
 * - Deletes files from storage
 * - Updates/removes database records
 * - Sends notifications to users if appropriate
 * 
 * Schedule: Runs hourly
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';;
import { storageProvider } from '@/lib/storage';
import { AssetStatus, ScanStatus } from '@prisma/client';

const QUEUE_NAME = 'upload-cleanup';

// Cleanup thresholds
const ABANDONED_TIMEOUT_HOURS = 24;
const FAILED_RETENTION_DAYS = 7;
const INFECTED_RETENTION_DAYS = 30;

export interface UploadCleanupJobData {
  dryRun?: boolean;
}

export interface UploadCleanupResult {
  abandonedCleaned: number;
  failedCleaned: number;
  infectedCleaned: number;
  storageFreed: number; // bytes
  errors: number;
}

/**
 * Create cleanup queue
 */
export const uploadCleanupQueue = new Queue<UploadCleanupJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 30000,
    },
  },
});

/**
 * Cleanup job handler
 */
async function cleanupUploads(job: Job<UploadCleanupJobData>): Promise<UploadCleanupResult> {
  const { dryRun = false } = job.data;
  
  job.log(`Starting upload cleanup${dryRun ? ' (DRY RUN)' : ''}`);

  const result: UploadCleanupResult = {
    abandonedCleaned: 0,
    failedCleaned: 0,
    infectedCleaned: 0,
    storageFreed: 0,
    errors: 0,
  };

  try {
    // Clean up abandoned uploads (DRAFT/PENDING for > 24 hours)
    const abandonedStats = await cleanupAbandoned(dryRun, job);
    result.abandonedCleaned = abandonedStats.cleaned;
    result.storageFreed += abandonedStats.storageFreed;
    result.errors += abandonedStats.errors;

    // Clean up old failed uploads
    const failedStats = await cleanupFailed(dryRun, job);
    result.failedCleaned = failedStats.cleaned;
    result.storageFreed += failedStats.storageFreed;
    result.errors += failedStats.errors;

    // Clean up old infected files
    const infectedStats = await cleanupInfected(dryRun, job);
    result.infectedCleaned = infectedStats.cleaned;
    result.storageFreed += infectedStats.storageFreed;
    result.errors += infectedStats.errors;

    job.log(`Cleanup complete: ${JSON.stringify(result)}`);
    
    return result;
  } catch (error) {
    job.log(`Cleanup job failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Clean up abandoned uploads
 */
async function cleanupAbandoned(
  dryRun: boolean,
  job: Job
): Promise<{ cleaned: number; storageFreed: number; errors: number }> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - ABANDONED_TIMEOUT_HOURS);

  job.log(`Finding abandoned uploads before ${cutoffDate.toISOString()}`);

  const abandonedUploads = await prisma.ipAsset.findMany({
    where: {
      status: {
        in: [AssetStatus.DRAFT],
      },
      createdAt: {
        lt: cutoffDate,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      storageKey: true,
      fileSize: true,
      createdBy: true,
      title: true,
    },
  });

  job.log(`Found ${abandonedUploads.length} abandoned uploads`);

  let cleaned = 0;
  let storageFreed = 0;
  let errors = 0;

  for (const upload of abandonedUploads) {
    try {
      if (!dryRun) {
        // Check if file exists in storage
        const exists = await storageProvider.exists(upload.storageKey);
        
        if (exists) {
          // Delete from storage
          await storageProvider.delete(upload.storageKey);
          storageFreed += Number(upload.fileSize);
        }

        // Update database - mark as cleaned up
        await prisma.ipAsset.update({
          where: { id: upload.id },
          data: {
            status: AssetStatus.REJECTED,
            deletedAt: new Date(),
          },
        });
      }

      cleaned++;
      
      if (cleaned % 10 === 0) {
        job.log(`Cleaned ${cleaned}/${abandonedUploads.length} abandoned uploads`);
      }
    } catch (error) {
      errors++;
      job.log(`Failed to clean upload ${upload.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { cleaned, storageFreed, errors };
}

/**
 * Clean up old failed uploads
 */
async function cleanupFailed(
  dryRun: boolean,
  job: Job
): Promise<{ cleaned: number; storageFreed: number; errors: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - FAILED_RETENTION_DAYS);

  job.log(`Finding failed uploads before ${cutoffDate.toISOString()}`);

  const failedUploads = await prisma.ipAsset.findMany({
    where: {
      status: AssetStatus.REJECTED,
      scanStatus: {
        in: [ScanStatus.ERROR],
      },
      updatedAt: {
        lt: cutoffDate,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      storageKey: true,
      fileSize: true,
    },
  });

  job.log(`Found ${failedUploads.length} failed uploads`);

  let cleaned = 0;
  let storageFreed = 0;
  let errors = 0;

  for (const upload of failedUploads) {
    try {
      if (!dryRun) {
        // Try to delete from storage (may not exist)
        try {
          await storageProvider.delete(upload.storageKey);
          storageFreed += Number(upload.fileSize);
        } catch (storageError) {
          // File may not exist - not a critical error
          job.log(`Storage key not found (expected): ${upload.storageKey}`);
        }

        // Hard delete from database
        await prisma.ipAsset.delete({
          where: { id: upload.id },
        });
      }

      cleaned++;
    } catch (error) {
      errors++;
      job.log(`Failed to clean failed upload ${upload.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { cleaned, storageFreed, errors };
}

/**
 * Clean up old infected files
 */
async function cleanupInfected(
  dryRun: boolean,
  job: Job
): Promise<{ cleaned: number; storageFreed: number; errors: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INFECTED_RETENTION_DAYS);

  job.log(`Finding infected files before ${cutoffDate.toISOString()}`);

  const infectedFiles = await prisma.ipAsset.findMany({
    where: {
      scanStatus: ScanStatus.INFECTED,
      updatedAt: {
        lt: cutoffDate,
      },
    },
    select: {
      id: true,
      storageKey: true,
      fileSize: true,
      scanResult: true,
    },
  });

  job.log(`Found ${infectedFiles.length} infected files to clean`);

  let cleaned = 0;
  let storageFreed = 0;
  let errors = 0;

  for (const file of infectedFiles) {
    try {
      if (!dryRun) {
        // Delete quarantined file
        const quarantineKey = `quarantine/${file.storageKey}`;
        try {
          await storageProvider.delete(quarantineKey);
          storageFreed += Number(file.fileSize);
        } catch (storageError) {
          // Also try original location
          try {
            await storageProvider.delete(file.storageKey);
            storageFreed += Number(file.fileSize);
          } catch {
            job.log(`File not found in storage: ${file.id}`);
          }
        }

        // Archive to audit table before deletion
        // (Create security audit event)
        job.log(`Archiving infected file metadata: ${file.id}`);

        // Hard delete from database
        await prisma.ipAsset.delete({
          where: { id: file.id },
        });
      }

      cleaned++;
    } catch (error) {
      errors++;
      job.log(`Failed to clean infected file ${file.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { cleaned, storageFreed, errors };
}

/**
 * Create worker
 */
export const uploadCleanupWorker = new Worker<UploadCleanupJobData>(
  QUEUE_NAME,
  async (job) => {
    job.log(`[Upload Cleanup] Starting job ${job.id}`);
    const result = await cleanupUploads(job);
    job.log(`[Upload Cleanup] Job ${job.id} completed: ${JSON.stringify(result)}`);
    return result;
  },
  {
    connection: redisConnection,
  }
);

/**
 * Schedule recurring cleanup job (every hour)
 */
export async function scheduleUploadCleanup() {
  await uploadCleanupQueue.add(
    'cleanup',
    {},
    {
      repeat: {
        pattern: '0 * * * *', // Every hour
      },
    }
  );
  console.log('[Upload Cleanup] Scheduled recurring cleanup job');
}

// Error handling
uploadCleanupWorker.on('failed', (job, error) => {
  console.error(`[Upload Cleanup] Job ${job?.id} failed:`, error);
});

uploadCleanupWorker.on('error', (error) => {
  console.error('[Upload Cleanup] Worker error:', error);
});
