/**
 * Storage Metrics Calculation Job
 * 
 * Scheduled job that calculates and stores storage metrics for:
 * - Platform-wide usage
 * - Per-user usage
 * - Per-project usage
 * - Per-brand usage
 * 
 * Runs daily at 2 AM to capture daily snapshots
 */

import { PrismaClient } from '@prisma/client';
import { StorageReportingService } from '@/lib/storage/storage-reporting';

const prisma = new PrismaClient();
const storageReportingService = new StorageReportingService(prisma);

export interface StorageMetricsJobData {
  jobId: string;
  scheduledAt: Date;
}

/**
 * Execute storage metrics calculation
 */
export async function executeStorageMetricsJob(
  data: StorageMetricsJobData
): Promise<void> {
  const startTime = Date.now();
  console.log(`[Storage Metrics Job] Starting at ${new Date().toISOString()}`);

  try {
    // Capture all storage snapshots
    await storageReportingService.captureStorageSnapshot();

    const duration = Date.now() - startTime;
    console.log(
      `[Storage Metrics Job] Completed in ${duration}ms at ${new Date().toISOString()}`
    );
  } catch (error) {
    console.error('[Storage Metrics Job] Failed:', error);
    throw error;
  }
}

/**
 * Schedule the job (to be called from job scheduler)
 */
export function scheduleStorageMetricsJob() {
  return {
    name: 'storage-metrics-calculation',
    schedule: '0 2 * * *', // Daily at 2 AM
    handler: executeStorageMetricsJob,
    options: {
      priority: 5, // Medium priority
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 60000, // 1 minute
      },
    },
  };
}

/**
 * Manual trigger for storage metrics calculation
 */
export async function triggerStorageMetricsCalculation(): Promise<void> {
  await executeStorageMetricsJob({
    jobId: `manual_${Date.now()}`,
    scheduledAt: new Date(),
  });
}
