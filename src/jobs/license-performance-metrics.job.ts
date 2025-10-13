/**
 * License Performance Metrics Job
 * Calculates and stores license performance metrics including ROI, utilization, conflicts, and approval times
 * Runs daily at 2 AM
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { licensePerformanceMetricsService } from '@/modules/licenses/services/license-performance-metrics.service';
import { subDays, startOfDay, endOfDay, subWeeks, subMonths, startOfWeek, startOfMonth } from 'date-fns';

export interface LicensePerformanceMetricsJobData {
  date?: string; // ISO date string
  recalculateHistorical?: boolean;
}

export interface JobResult {
  success: boolean;
  date: string;
  stats: {
    dailyMetricsCalculated: boolean;
    weeklyMetricsCalculated: boolean;
    monthlyMetricsCalculated: boolean;
    individualLicensesProcessed: number;
    errors: number;
  };
  errors: string[];
}

/**
 * Job Queue: License Performance Metrics Calculation
 */
export const licensePerformanceMetricsQueue = new Queue<LicensePerformanceMetricsJobData>(
  'license-performance-metrics',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000, // 30 seconds
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

/**
 * Worker: License Performance Metrics Calculation
 */
export const licensePerformanceMetricsWorker = new Worker<LicensePerformanceMetricsJobData>(
  'license-performance-metrics',
  async (job: Job<LicensePerformanceMetricsJobData>) => {
    console.log('[Job] Starting license performance metrics calculation');

    const targetDate = job.data.date ? new Date(job.data.date) : subDays(new Date(), 1);
    
    const result: JobResult = {
      success: false,
      date: targetDate.toISOString(),
      stats: {
        dailyMetricsCalculated: false,
        weeklyMetricsCalculated: false,
        monthlyMetricsCalculated: false,
        individualLicensesProcessed: 0,
        errors: 0,
      },
      errors: [],
    };

    try {
      // Update progress
      await job.updateProgress(10);

      // Calculate and store daily metrics
      await calculateDailyMetrics(targetDate, result);
      await job.updateProgress(40);

      // Calculate and store weekly metrics (if it's the start of a week)
      if (targetDate.getDay() === 1) { // Monday
        await calculateWeeklyMetrics(targetDate, result);
      }
      await job.updateProgress(60);

      // Calculate and store monthly metrics (if it's the first of the month)
      if (targetDate.getDate() === 1) {
        await calculateMonthlyMetrics(targetDate, result);
      }
      await job.updateProgress(80);

      // Calculate metrics for individual high-value licenses
      await calculateIndividualLicenseMetrics(targetDate, result);
      await job.updateProgress(100);

      result.success = result.errors.length === 0;
      
      console.log('[Job] License performance metrics calculation completed', {
        success: result.success,
        stats: result.stats,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error: any) {
      console.error('[Job] License performance metrics calculation failed:', error);
      result.errors.push(`Job failed: ${error.message}`);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Only one at a time to prevent conflicts
  }
);

/**
 * Calculate and store daily performance metrics
 */
async function calculateDailyMetrics(date: Date, result: JobResult): Promise<void> {
  try {
    console.log('[Job] Calculating daily metrics for', date.toISOString().split('T')[0]);

    const startDate = startOfDay(date);
    const endDate = endOfDay(date);

    const metrics = await licensePerformanceMetricsService.calculateAggregatedMetrics(
      startDate,
      endDate,
      'daily'
    );

    await licensePerformanceMetricsService.storeMetricsSnapshot(
      date,
      'daily',
      metrics
    );

    result.stats.dailyMetricsCalculated = true;
    
    console.log('[Job] Daily metrics calculated successfully:', {
      totalRevenue: metrics.revenue.totalRevenueCents,
      averageROI: metrics.roi.averageROI,
      conflictRate: metrics.conflicts.conflictRate,
      approvalTime: metrics.approvals.averageApprovalTime,
    });
  } catch (error: any) {
    result.errors.push(`Daily metrics calculation failed: ${error.message}`);
    result.stats.errors++;
    console.error('[Job] Daily metrics calculation error:', error);
  }
}

/**
 * Calculate and store weekly performance metrics
 */
async function calculateWeeklyMetrics(date: Date, result: JobResult): Promise<void> {
  try {
    console.log('[Job] Calculating weekly metrics for week ending', date.toISOString().split('T')[0]);

    const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfDay(date);

    const metrics = await licensePerformanceMetricsService.calculateAggregatedMetrics(
      weekStart,
      weekEnd,
      'weekly'
    );

    await licensePerformanceMetricsService.storeMetricsSnapshot(
      date,
      'weekly',
      metrics
    );

    result.stats.weeklyMetricsCalculated = true;
    
    console.log('[Job] Weekly metrics calculated successfully');
  } catch (error: any) {
    result.errors.push(`Weekly metrics calculation failed: ${error.message}`);
    result.stats.errors++;
    console.error('[Job] Weekly metrics calculation error:', error);
  }
}

/**
 * Calculate and store monthly performance metrics
 */
async function calculateMonthlyMetrics(date: Date, result: JobResult): Promise<void> {
  try {
    console.log('[Job] Calculating monthly metrics for month ending', date.toISOString().split('T')[0]);

    const monthStart = startOfMonth(date);
    const monthEnd = endOfDay(date);

    const metrics = await licensePerformanceMetricsService.calculateAggregatedMetrics(
      monthStart,
      monthEnd,
      'monthly'
    );

    await licensePerformanceMetricsService.storeMetricsSnapshot(
      date,
      'monthly',
      metrics
    );

    result.stats.monthlyMetricsCalculated = true;
    
    console.log('[Job] Monthly metrics calculated successfully');
  } catch (error: any) {
    result.errors.push(`Monthly metrics calculation failed: ${error.message}`);
    result.stats.errors++;
    console.error('[Job] Monthly metrics calculation error:', error);
  }
}

/**
 * Calculate metrics for individual high-value licenses
 */
async function calculateIndividualLicenseMetrics(date: Date, result: JobResult): Promise<void> {
  try {
    console.log('[Job] Calculating individual license metrics');

    // Get active licenses with significant value or usage
    const licenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] as any },
        deletedAt: null,
        feeCents: { gte: 100000 }, // $1000+
      },
      select: { id: true },
      take: 100, // Limit to top 100 to avoid overwhelming the system
    });

    console.log(`[Job] Processing ${licenses.length} individual licenses`);

    let processedCount = 0;
    let errorCount = 0;

    for (const license of licenses) {
      try {
        // Calculate ROI
        const roiMetrics = await licensePerformanceMetricsService.calculateLicenseROI(license.id);
        
        // Calculate utilization
        const utilizationMetrics = await licensePerformanceMetricsService.calculateLicenseUtilization(license.id);
        
        // Calculate approval time
        const approvalMetrics = await licensePerformanceMetricsService.calculateApprovalTimeMetrics(license.id);

        // Store individual metrics in license metadata
        await prisma.license.update({
          where: { id: license.id },
          data: {
            metadata: {
              ...(await prisma.license.findUnique({ where: { id: license.id }, select: { metadata: true } }))?.metadata as any,
              performanceMetrics: {
                lastCalculated: new Date().toISOString(),
                roi: {
                  percentage: roiMetrics.roiPercentage,
                  totalRevenue: roiMetrics.totalRevenueCents,
                  projectedAnnualROI: roiMetrics.projectedAnnualROI,
                  revenueGrowthRate: roiMetrics.revenueGrowthRate,
                },
                utilization: {
                  percentage: utilizationMetrics.utilizationPercentage,
                  actualUsage: utilizationMetrics.actualUsageCount,
                  trend: utilizationMetrics.utilizationTrend,
                  isOverUtilized: utilizationMetrics.isOverUtilized,
                  isUnderUtilized: utilizationMetrics.isUnderUtilized,
                },
                approval: {
                  durationHours: approvalMetrics.approvalDurationHours,
                  stage: approvalMetrics.approvalStage,
                  bottlenecks: approvalMetrics.bottlenecks,
                },
              },
            },
          },
        });

        processedCount++;
      } catch (error: any) {
        errorCount++;
        console.error(`[Job] Error processing license ${license.id}:`, error.message);
      }
    }

    result.stats.individualLicensesProcessed = processedCount;
    result.stats.errors += errorCount;

    if (errorCount > 0) {
      result.errors.push(`Failed to process ${errorCount} individual licenses`);
    }

    console.log(`[Job] Individual license metrics processed: ${processedCount} successful, ${errorCount} errors`);
  } catch (error: any) {
    result.errors.push(`Individual license metrics calculation failed: ${error.message}`);
    result.stats.errors++;
    console.error('[Job] Individual license metrics calculation error:', error);
  }
}

// Event listeners
licensePerformanceMetricsWorker.on('completed', (job) => {
  console.log(`[Job] License performance metrics job ${job.id} completed successfully`);
});

licensePerformanceMetricsWorker.on('failed', (job, err) => {
  console.error(`[Job] License performance metrics job ${job?.id} failed:`, err);
});

licensePerformanceMetricsWorker.on('error', (err) => {
  console.error('[Job] License performance metrics worker error:', err);
});

/**
 * Schedule daily job execution
 */
export async function scheduleDailyMetricsCalculation(): Promise<void> {
  // Add recurring job for daily metrics calculation at 2 AM
  await licensePerformanceMetricsQueue.add(
    'daily-metrics-calculation',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // 2 AM every day
        tz: 'UTC',
      },
      jobId: 'license-performance-metrics-daily',
    }
  );

  console.log('[Job] Scheduled daily license performance metrics calculation');
}
