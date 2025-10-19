/**
 * 2FA Compliance Metrics Aggregation Job
 * 
 * Scheduled background job that aggregates 2FA compliance metrics.
 * Runs daily to collect metrics and periodically runs security checks.
 * 
 * Schedule:
 * - Daily metrics aggregation: 2 AM
 * - Security checks: Every 15 minutes
 * - Monthly report generation: 1st of month at 3 AM
 */

import { Queue, Worker } from 'bullmq';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { TwoFactorComplianceService } from '@/lib/services/2fa-compliance.service';
import { TwoFactorSecurityAlertsService } from '@/lib/services/2fa-security-alerts.service';
import { TwoFactorReportingService } from '@/lib/services/2fa-reporting.service';

const QUEUE_NAME = '2fa-compliance-metrics';

// Create queue
export const twoFactorComplianceQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 100,
      age: 7 * 24 * 3600, // Keep for 7 days
    },
    removeOnFail: {
      count: 500,
      age: 30 * 24 * 3600, // Keep failures for 30 days
    },
  },
});

// Job types
export enum ComplianceJobType {
  DAILY_METRICS = 'daily_metrics',
  WEEKLY_METRICS = 'weekly_metrics',
  MONTHLY_METRICS = 'monthly_metrics',
  SECURITY_CHECKS = 'security_checks',
  GENERATE_MONTHLY_REPORT = 'generate_monthly_report',
}

interface ComplianceJobData {
  type: ComplianceJobType;
  date?: Date;
  year?: number;
  month?: number;
}

/**
 * Add job to queue
 */
export async function addComplianceJob(
  type: ComplianceJobType,
  data?: Partial<ComplianceJobData>
): Promise<void> {
  await twoFactorComplianceQueue.add(
    type,
    {
      type,
      ...data,
    },
    {
      jobId: `${type}-${Date.now()}`,
    }
  );
}

/**
 * Schedule recurring jobs
 */
export async function scheduleComplianceJobs(): Promise<void> {
  console.log('[ComplianceJobs] Scheduling recurring compliance jobs...');

  // Daily metrics aggregation at 2 AM
  await twoFactorComplianceQueue.add(
    ComplianceJobType.DAILY_METRICS,
    { type: ComplianceJobType.DAILY_METRICS },
    {
      repeat: {
        pattern: '0 2 * * *', // 2 AM daily
      },
      jobId: 'daily-metrics-recurring',
    }
  );

  // Weekly metrics aggregation on Monday at 3 AM
  await twoFactorComplianceQueue.add(
    ComplianceJobType.WEEKLY_METRICS,
    { type: ComplianceJobType.WEEKLY_METRICS },
    {
      repeat: {
        pattern: '0 3 * * 1', // Monday 3 AM
      },
      jobId: 'weekly-metrics-recurring',
    }
  );

  // Monthly metrics on 1st of month at 4 AM
  await twoFactorComplianceQueue.add(
    ComplianceJobType.MONTHLY_METRICS,
    { type: ComplianceJobType.MONTHLY_METRICS },
    {
      repeat: {
        pattern: '0 4 1 * *', // 1st of month, 4 AM
      },
      jobId: 'monthly-metrics-recurring',
    }
  );

  // Security checks every 15 minutes
  await twoFactorComplianceQueue.add(
    ComplianceJobType.SECURITY_CHECKS,
    { type: ComplianceJobType.SECURITY_CHECKS },
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes
      },
      jobId: 'security-checks-recurring',
    }
  );

  // Monthly report generation on 1st at 5 AM
  await twoFactorComplianceQueue.add(
    ComplianceJobType.GENERATE_MONTHLY_REPORT,
    { type: ComplianceJobType.GENERATE_MONTHLY_REPORT },
    {
      repeat: {
        pattern: '0 5 1 * *', // 1st of month, 5 AM
      },
      jobId: 'monthly-report-recurring',
    }
  );

  console.log('[ComplianceJobs] ✓ Compliance jobs scheduled');
}

/**
 * Worker to process compliance jobs
 */
export const twoFactorComplianceWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { type, date, year, month } = job.data as ComplianceJobData;

    console.log(`[ComplianceWorker] Processing job: ${type}`);

    const complianceService = new TwoFactorComplianceService(prisma);
    const alertsService = new TwoFactorSecurityAlertsService(prisma);
    const reportingService = new TwoFactorReportingService(prisma);

    try {
      switch (type) {
        case ComplianceJobType.DAILY_METRICS: {
          const targetDate = date ? new Date(date) : new Date();
          const startOfDay = new Date(targetDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(targetDate);
          endOfDay.setHours(23, 59, 59, 999);

          await complianceService.aggregateComplianceMetrics(
            startOfDay,
            endOfDay,
            'daily'
          );
          break;
        }

        case ComplianceJobType.WEEKLY_METRICS: {
          const targetDate = date ? new Date(date) : new Date();
          const startOfWeek = new Date(targetDate);
          startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);

          await complianceService.aggregateComplianceMetrics(
            startOfWeek,
            endOfWeek,
            'weekly'
          );
          break;
        }

        case ComplianceJobType.MONTHLY_METRICS: {
          const targetDate = date ? new Date(date) : new Date();
          const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

          await complianceService.aggregateComplianceMetrics(
            startOfMonth,
            endOfMonth,
            'monthly'
          );
          break;
        }

        case ComplianceJobType.SECURITY_CHECKS: {
          await alertsService.runAllChecks();
          break;
        }

        case ComplianceJobType.GENERATE_MONTHLY_REPORT: {
          const targetDate = date ? new Date(date) : new Date();
          const reportYear = year || targetDate.getFullYear();
          const reportMonth = month || (targetDate.getMonth() === 0 ? 12 : targetDate.getMonth());

          await reportingService.generateMonthlySecurityReport(
            reportMonth === 12 ? reportYear - 1 : reportYear,
            reportMonth,
            'system'
          );
          break;
        }

        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      console.log(`[ComplianceWorker] ✓ Job completed: ${type}`);
    } catch (error) {
      console.error(`[ComplianceWorker] Job failed: ${type}`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute
    },
  }
);

// Worker event handlers
twoFactorComplianceWorker.on('completed', (job) => {
  console.log(`[ComplianceWorker] Job ${job.id} completed successfully`);
});

twoFactorComplianceWorker.on('failed', (job, err) => {
  console.error(`[ComplianceWorker] Job ${job?.id} failed:`, err);
});

twoFactorComplianceWorker.on('error', (err) => {
  console.error('[ComplianceWorker] Worker error:', err);
});

/**
 * Initialize compliance job system
 */
export async function initializeComplianceJobs(): Promise<void> {
  try {
    console.log('[ComplianceJobs] Initializing 2FA compliance job system...');

    // Schedule recurring jobs
    await scheduleComplianceJobs();

    // Run initial daily metrics aggregation if not done today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingMetrics = await prisma.twoFactorComplianceMetrics.findFirst({
      where: {
        periodStart: today,
        periodType: 'daily',
      },
    });

    if (!existingMetrics) {
      console.log('[ComplianceJobs] Running initial daily metrics aggregation...');
      await addComplianceJob(ComplianceJobType.DAILY_METRICS);
    }

    console.log('[ComplianceJobs] ✓ Compliance job system initialized');
  } catch (error) {
    console.error('[ComplianceJobs] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Shutdown compliance job system
 */
export async function shutdownComplianceJobs(): Promise<void> {
  console.log('[ComplianceJobs] Shutting down...');
  await twoFactorComplianceWorker.close();
  await twoFactorComplianceQueue.close();
  console.log('[ComplianceJobs] ✓ Shutdown complete');
}
