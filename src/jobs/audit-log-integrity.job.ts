/**
 * Audit Log Integrity Verification Job
 * 
 * Periodically verifies the integrity of the audit log chain.
 * Detects tampering by checking hash chains and generates compliance reports.
 */

import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { prisma } from '@/lib/db';
import {
  verifyAuditChainIntegrity,
  getIntegrityStatistics,
  IntegrityCheckResult,
} from '@/lib/services/audit-integrity.service';

const INTEGRITY_QUEUE_NAME = 'audit-log-integrity';

export interface IntegrityCheckJobData {
  startDate?: Date;
  endDate?: Date;
  batchSize?: number;
}

/**
 * Get or create integrity check queue
 */
export function getIntegrityCheckQueue(): Queue<IntegrityCheckJobData> {
  return new Queue<IntegrityCheckJobData>(INTEGRITY_QUEUE_NAME, {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 30000,
      },
      removeOnComplete: {
        age: 90 * 24 * 3600, // Keep for 90 days for compliance
        count: 1000,
      },
      removeOnFail: {
        age: 180 * 24 * 3600, // Keep failures for 180 days
        count: 500,
      },
    },
  });
}

/**
 * Run integrity check
 */
async function runIntegrityCheck(options: IntegrityCheckJobData): Promise<IntegrityCheckResult> {
  console.log('[IntegrityCheck] Starting audit log integrity verification...');

  const result = await verifyAuditChainIntegrity(prisma, {
    startDate: options.startDate,
    endDate: options.endDate,
    batchSize: options.batchSize || 1000,
  });

  console.log(`[IntegrityCheck] Verification complete:`, result);

  if (!result.isValid) {
    console.error('[IntegrityCheck] ⚠️ INTEGRITY VIOLATION DETECTED!', result.firstInvalidEntry);
    
    // TODO: Send alert to administrators
    // This is a critical security event that requires immediate attention
  }

  return result;
}

/**
 * Create integrity check worker
 */
export function createIntegrityCheckWorker(): Worker<IntegrityCheckJobData, IntegrityCheckResult> {
  const worker = new Worker<IntegrityCheckJobData, IntegrityCheckResult>(
    INTEGRITY_QUEUE_NAME,
    async (job: Job<IntegrityCheckJobData>) => {
      console.log(`[IntegrityCheckWorker] Processing job ${job.id}`);
      return await runIntegrityCheck(job.data);
    },
    {
      connection: getBullMQRedisClient(),
      concurrency: 1, // Run one at a time
    }
  );

  worker.on('completed', (job, result) => {
    if (!result.isValid) {
      console.error(`[IntegrityCheckWorker] ⚠️ Job ${job.id} detected integrity violation!`);
    } else {
      console.log(`[IntegrityCheckWorker] Job ${job.id} completed successfully`, {
        totalChecked: result.totalChecked,
        isValid: result.isValid,
      });
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[IntegrityCheckWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}

/**
 * Schedule weekly integrity checks
 */
export async function scheduleWeeklyIntegrityCheck(): Promise<void> {
  const queue = getIntegrityCheckQueue();

  // Add repeatable job - runs weekly on Sunday at 3 AM
  await queue.add(
    'weekly-integrity-check',
    {
      batchSize: 1000,
    },
    {
      repeat: {
        pattern: '0 3 * * 0', // Cron: 3 AM on Sundays
      },
      jobId: 'weekly-audit-integrity-check',
    }
  );

  console.log('[IntegrityCheck] ✓ Weekly integrity check scheduled');
}

/**
 * Run integrity check manually
 */
export async function runIntegrityCheckNow(options: IntegrityCheckJobData = {}): Promise<void> {
  const queue = getIntegrityCheckQueue();

  await queue.add('manual-integrity-check', options, {
    priority: 1,
  });

  console.log('[IntegrityCheck] Manual integrity check queued');
}

/**
 * Get integrity check statistics
 */
export async function getIntegrityCheckStatistics() {
  return await getIntegrityStatistics(prisma);
}

// Singleton worker instance
let integrityCheckWorker: Worker<IntegrityCheckJobData, IntegrityCheckResult> | null = null;

/**
 * Initialize the integrity check worker
 */
export function initializeIntegrityCheckWorker(): void {
  if (integrityCheckWorker) {
    console.log('[IntegrityCheckWorker] Worker already initialized');
    return;
  }

  console.log('[IntegrityCheckWorker] Initializing integrity check worker...');
  integrityCheckWorker = createIntegrityCheckWorker();
  console.log('[IntegrityCheckWorker] ✓ Integrity check worker initialized');
}

/**
 * Shutdown the integrity check worker
 */
export async function shutdownIntegrityCheckWorker(): Promise<void> {
  if (!integrityCheckWorker) {
    return;
  }

  console.log('[IntegrityCheckWorker] Shutting down integrity check worker...');
  await integrityCheckWorker.close();
  integrityCheckWorker = null;
  console.log('[IntegrityCheckWorker] ✓ Integrity check worker shut down');
}
