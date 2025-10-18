/**
 * Metrics Aggregation Jobs
 * Background jobs for daily, weekly, and monthly metrics aggregation
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { WeeklyMetricsRollupService } from '@/modules/analytics/services/weekly-metrics-rollup.service';
import { MonthlyMetricsRollupService } from '@/modules/analytics/services/monthly-metrics-rollup.service';
import { subDays, subWeeks, subMonths, format, startOfWeek, startOfMonth } from 'date-fns';

interface MetricsAggregationJobData {
  date: string; // YYYY-MM-DD format
  jobType: 'daily' | 'weekly' | 'monthly';
}

/**
 * Queue: Weekly Metrics Rollup
 */
export const weeklyMetricsRollupQueue = new Queue<MetricsAggregationJobData>(
  'weekly-metrics-rollup',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 120000, // 2 minutes
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

/**
 * Worker: Weekly Metrics Rollup
 * Runs every Monday at 4 AM UTC to aggregate the previous week
 */
export const weeklyMetricsRollupWorker = new Worker<MetricsAggregationJobData>(
  'weekly-metrics-rollup',
  async (job: Job<MetricsAggregationJobData>) => {
    const { date } = job.data;
    
    const logEntry = await prisma.metricsAggregationJobsLog.create({
      data: {
        jobType: 'weekly',
        periodStartDate: new Date(date),
        periodEndDate: new Date(date),
        startedAt: new Date(),
        status: 'RUNNING',
      },
    });

    console.log(`[WeeklyMetricsJob] Starting weekly rollup for week of ${date}`);

    try {
      const weeklyService = new WeeklyMetricsRollupService(prisma);
      const weekStart = startOfWeek(new Date(date), { weekStartsOn: 1 });

      await weeklyService.aggregateWeeklyMetrics(weekStart);

      const completedAt = new Date();
      const durationSeconds = (completedAt.getTime() - logEntry.startedAt.getTime()) / 1000;

      await prisma.metricsAggregationJobsLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'COMPLETED',
          completedAt,
          durationSeconds,
          recordsProcessed: 1, // Number of weeks processed
        },
      });

      console.log(`[WeeklyMetricsJob] Completed weekly rollup for ${date} in ${durationSeconds}s`);
    } catch (error) {
      console.error(`[WeeklyMetricsJob] Failed for ${date}:`, error);

      await prisma.metricsAggregationJobsLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorsCount: 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });

      if (job.attemptsMade >= 3) {
        console.error(`[WeeklyMetricsJob] All retries exhausted for ${date}`);
        // TODO: Send alert to ops team
      }

      throw error;
    }
  },
  { connection: redisConnection }
);

/**
 * Queue: Monthly Metrics Rollup
 */
export const monthlyMetricsRollupQueue = new Queue<MetricsAggregationJobData>(
  'monthly-metrics-rollup',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 180000, // 3 minutes
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

/**
 * Worker: Monthly Metrics Rollup
 * Runs on the 2nd of each month at 5 AM UTC to aggregate the previous month
 */
export const monthlyMetricsRollupWorker = new Worker<MetricsAggregationJobData>(
  'monthly-metrics-rollup',
  async (job: Job<MetricsAggregationJobData>) => {
    const { date } = job.data;
    
    const logEntry = await prisma.metricsAggregationJobsLog.create({
      data: {
        jobType: 'monthly',
        periodStartDate: new Date(date),
        periodEndDate: new Date(date),
        startedAt: new Date(),
        status: 'RUNNING',
      },
    });

    console.log(`[MonthlyMetricsJob] Starting monthly rollup for month of ${date}`);

    try {
      const monthlyService = new MonthlyMetricsRollupService(prisma);
      const monthStart = startOfMonth(new Date(date));

      await monthlyService.aggregateMonthlyMetrics(monthStart);

      const completedAt = new Date();
      const durationSeconds = (completedAt.getTime() - logEntry.startedAt.getTime()) / 1000;

      await prisma.metricsAggregationJobsLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'COMPLETED',
          completedAt,
          durationSeconds,
          recordsProcessed: 1, // Number of months processed
        },
      });

      console.log(`[MonthlyMetricsJob] Completed monthly rollup for ${date} in ${durationSeconds}s`);
    } catch (error) {
      console.error(`[MonthlyMetricsJob] Failed for ${date}:`, error);

      await prisma.metricsAggregationJobsLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorsCount: 1,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });

      if (job.attemptsMade >= 3) {
        console.error(`[MonthlyMetricsJob] All retries exhausted for ${date}`);
        // TODO: Send alert to ops team
      }

      throw error;
    }
  },
  { connection: redisConnection }
);

/**
 * Schedule weekly metrics rollup job
 * Runs every Monday at 4 AM UTC
 */
export async function scheduleWeeklyMetricsRollup(): Promise<void> {
  const lastWeek = subWeeks(new Date(), 1);
  const weekStart = startOfWeek(lastWeek, { weekStartsOn: 1 });
  const dateStr = format(weekStart, 'yyyy-MM-dd');

  await weeklyMetricsRollupQueue.add(
    'weekly-metrics-rollup',
    { date: dateStr, jobType: 'weekly' },
    {
      repeat: {
        pattern: '0 4 * * 1', // Cron: 4 AM every Monday
        tz: 'UTC',
      },
    }
  );

  console.log('[MetricsJobs] Scheduled weekly metrics rollup at 4 AM UTC every Monday');
}

/**
 * Schedule monthly metrics rollup job
 * Runs on the 2nd of each month at 5 AM UTC
 */
export async function scheduleMonthlyMetricsRollup(): Promise<void> {
  const lastMonth = subMonths(new Date(), 1);
  const monthStart = startOfMonth(lastMonth);
  const dateStr = format(monthStart, 'yyyy-MM-dd');

  await monthlyMetricsRollupQueue.add(
    'monthly-metrics-rollup',
    { date: dateStr, jobType: 'monthly' },
    {
      repeat: {
        pattern: '0 5 2 * *', // Cron: 5 AM on the 2nd of every month
        tz: 'UTC',
      },
    }
  );

  console.log('[MetricsJobs] Scheduled monthly metrics rollup at 5 AM UTC on the 2nd of each month');
}

/**
 * Initialize all metrics aggregation jobs
 */
export async function initializeMetricsAggregationJobs(): Promise<void> {
  console.log('[MetricsJobs] Initializing metrics aggregation jobs...');

  try {
    await scheduleWeeklyMetricsRollup();
    await scheduleMonthlyMetricsRollup();

    console.log('[MetricsJobs] All metrics aggregation jobs initialized successfully');
  } catch (error) {
    console.error('[MetricsJobs] Error initializing metrics aggregation jobs:', error);
    throw error;
  }
}

/**
 * Error handlers
 */
weeklyMetricsRollupWorker.on('failed', (job, error) => {
  if (job) {
    console.error(
      `[WeeklyMetricsJob] Job ${job.id} failed after ${job.attemptsMade} attempts:`,
      error
    );
  }
});

monthlyMetricsRollupWorker.on('failed', (job, error) => {
  if (job) {
    console.error(
      `[MonthlyMetricsJob] Job ${job.id} failed after ${job.attemptsMade} attempts:`,
      error
    );
  }
});

/**
 * Success handlers
 */
weeklyMetricsRollupWorker.on('completed', (job) => {
  console.log(`[WeeklyMetricsJob] Job ${job.id} completed successfully`);
});

monthlyMetricsRollupWorker.on('completed', (job) => {
  console.log(`[MonthlyMetricsJob] Job ${job.id} completed successfully`);
});
