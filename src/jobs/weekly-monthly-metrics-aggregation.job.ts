/**
 * Metrics Aggregation Jobs
 * Background jobs for weekly and monthly metrics aggregation
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { WeeklyMetricsAggregationService } from '@/modules/analytics/services/weekly-metrics-aggregation.service';
import { MonthlyMetricsAggregationService } from '@/modules/analytics/services/monthly-metrics-aggregation.service';

interface WeeklyAggregationJobData {
  weekStart: string; // YYYY-MM-DD
}

interface MonthlyAggregationJobData {
  year: number;
  month: number;
}

/**
 * Weekly Metrics Aggregation Queue
 */
export const weeklyMetricsQueue = new Queue<WeeklyAggregationJobData>(
  'weekly-metrics-aggregation',
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
 * Weekly Metrics Aggregation Worker
 */
export const weeklyMetricsWorker = new Worker<WeeklyAggregationJobData>(
  'weekly-metrics-aggregation',
  async (job: Job<WeeklyAggregationJobData>) => {
    const { weekStart } = job.data;
    const weekStartDate = new Date(weekStart);
    
    console.log(`[WeeklyMetricsJob] Starting aggregation for week: ${weekStart}`);

    const startTime = Date.now();

    const jobLog = await prisma.metricsAggregationJobsLog.create({
      data: {
        jobType: 'weekly',
        periodStartDate: weekStartDate,
        periodEndDate: new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000),
        startedAt: new Date(),
        status: 'RUNNING',
      },
    });

    try {
      const service = new WeeklyMetricsAggregationService(prisma);
      await service.aggregateWeeklyMetrics(weekStartDate);

      const duration = (Date.now() - startTime) / 1000;

      await prisma.metricsAggregationJobsLog.update({
        where: { id: jobLog.id },
        data: {
          completedAt: new Date(),
          status: 'COMPLETED',
          durationSeconds: duration,
        },
      });

      console.log(`[WeeklyMetricsJob] Completed for week: ${weekStart} in ${duration}s`);
    } catch (error) {
      console.error(`[WeeklyMetricsJob] Failed for week: ${weekStart}:`, error);

      await prisma.metricsAggregationJobsLog.update({
        where: { id: jobLog.id },
        data: {
          completedAt: new Date(),
          status: 'FAILED',
          errorsCount: 1,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });

      throw error;
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

/**
 * Monthly Metrics Aggregation Queue
 */
export const monthlyMetricsQueue = new Queue<MonthlyAggregationJobData>(
  'monthly-metrics-aggregation',
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
 * Monthly Metrics Aggregation Worker
 */
export const monthlyMetricsWorker = new Worker<MonthlyAggregationJobData>(
  'monthly-metrics-aggregation',
  async (job: Job<MonthlyAggregationJobData>) => {
    const { year, month } = job.data;
    
    console.log(`[MonthlyMetricsJob] Starting aggregation for ${year}-${month}`);

    const startTime = Date.now();
    const monthStartDate = new Date(year, month - 1, 1);
    const monthEndDate = new Date(year, month, 0);

    const jobLog = await prisma.metricsAggregationJobsLog.create({
      data: {
        jobType: 'monthly',
        periodStartDate: monthStartDate,
        periodEndDate: monthEndDate,
        startedAt: new Date(),
        status: 'RUNNING',
      },
    });

    try {
      const service = new MonthlyMetricsAggregationService(prisma);
      await service.aggregateMonthlyMetrics(year, month);

      const duration = (Date.now() - startTime) / 1000;

      await prisma.metricsAggregationJobsLog.update({
        where: { id: jobLog.id },
        data: {
          completedAt: new Date(),
          status: 'COMPLETED',
          durationSeconds: duration,
        },
      });

      console.log(`[MonthlyMetricsJob] Completed for ${year}-${month} in ${duration}s`);
    } catch (error) {
      console.error(`[MonthlyMetricsJob] Failed for ${year}-${month}:`, error);

      await prisma.metricsAggregationJobsLog.update({
        where: { id: jobLog.id },
        data: {
          completedAt: new Date(),
          status: 'FAILED',
          errorsCount: 1,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });

      throw error;
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

/**
 * Schedule weekly aggregation job (runs every Monday at 4 AM UTC)
 */
export async function scheduleWeeklyAggregation(): Promise<void> {
  // Calculate last week's Monday
  const today = new Date();
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
  lastMonday.setHours(0, 0, 0, 0);

  const weekStart = lastMonday.toISOString().split('T')[0];

  await weeklyMetricsQueue.add(
    'weekly-aggregation',
    { weekStart },
    {
      repeat: {
        pattern: '0 4 * * 1', // Cron: 4 AM every Monday
        tz: 'UTC',
      },
    }
  );

  console.log('[MetricsJobs] Scheduled weekly aggregation at 4 AM UTC every Monday');
}

/**
 * Schedule monthly aggregation job (runs on 2nd of each month at 5 AM UTC)
 */
export async function scheduleMonthlyAggregation(): Promise<void> {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth() + 1;

  await monthlyMetricsQueue.add(
    'monthly-aggregation',
    { year, month },
    {
      repeat: {
        pattern: '0 5 2 * *', // Cron: 5 AM on the 2nd of each month
        tz: 'UTC',
      },
    }
  );

  console.log('[MetricsJobs] Scheduled monthly aggregation at 5 AM UTC on 2nd of each month');
}

/**
 * Error handlers
 */
weeklyMetricsWorker.on('failed', (job, error) => {
  if (job) {
    console.error(
      `[WeeklyMetricsJob] Job ${job.id} failed after ${job.attemptsMade} attempts:`,
      error
    );
  }
});

monthlyMetricsWorker.on('failed', (job, error) => {
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
weeklyMetricsWorker.on('completed', (job) => {
  console.log(`[WeeklyMetricsJob] Job ${job.id} completed successfully`);
});

monthlyMetricsWorker.on('completed', (job) => {
  console.log(`[MonthlyMetricsJob] Job ${job.id} completed successfully`);
});

/**
 * Initialize all metrics aggregation jobs
 */
export async function initializeMetricsAggregationJobs(): Promise<void> {
  await scheduleWeeklyAggregation();
  await scheduleMonthlyAggregation();
  console.log('[MetricsJobs] All metrics aggregation jobs initialized');
}
