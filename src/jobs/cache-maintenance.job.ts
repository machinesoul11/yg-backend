/**
 * Cache Maintenance Jobs
 * 
 * Scheduled jobs for:
 * - Cache warming
 * - Performance metrics collection
 * - Cache health monitoring
 */

import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { getCacheWarmingService } from '@/lib/redis/cache-warming.service';
import { cachePerformanceService } from '@/lib/redis/cache-performance.service';
import { redisMonitor } from '@/lib/redis/monitoring';

const redis = getBullMQRedisClient();
const prisma = new PrismaClient();

// Define queue for cache maintenance jobs
export const cacheMaintenanceQueue = new Queue('cache-maintenance', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 100,
    },
    removeOnFail: {
      age: 604800, // Keep failed jobs for 7 days
      count: 1000,
    },
  },
});

// Job types
export enum CacheMaintenanceJobType {
  WARM_CRITICAL_CACHES = 'warm-critical-caches',
  WARM_INCREMENTAL = 'warm-incremental',
  COLLECT_METRICS = 'collect-metrics',
  GENERATE_REPORT = 'generate-report',
  HEALTH_CHECK = 'health-check',
}

interface CacheMaintenanceJobData {
  type: CacheMaintenanceJobType;
  options?: {
    batchSize?: number;
    periodDays?: number;
  };
}

/**
 * Schedule cache warming after deployment
 */
export async function schedulePostDeploymentWarmup(): Promise<void> {
  await cacheMaintenanceQueue.add(
    CacheMaintenanceJobType.WARM_CRITICAL_CACHES,
    {
      type: CacheMaintenanceJobType.WARM_CRITICAL_CACHES,
    },
    {
      priority: 1, // High priority
    }
  );

  console.log('[Cache Maintenance] Scheduled post-deployment cache warmup');
}

/**
 * Schedule incremental cache warming
 */
export async function scheduleIncrementalWarmup(batchSize: number = 50): Promise<void> {
  await cacheMaintenanceQueue.add(
    CacheMaintenanceJobType.WARM_INCREMENTAL,
    {
      type: CacheMaintenanceJobType.WARM_INCREMENTAL,
      options: { batchSize },
    },
    {
      priority: 5, // Lower priority
    }
  );

  console.log('[Cache Maintenance] Scheduled incremental cache warmup');
}

/**
 * Schedule metrics collection (runs every hour)
 */
export async function scheduleMetricsCollection(): Promise<void> {
  await cacheMaintenanceQueue.add(
    CacheMaintenanceJobType.COLLECT_METRICS,
    {
      type: CacheMaintenanceJobType.COLLECT_METRICS,
    },
    {
      repeat: {
        pattern: '0 * * * *', // Every hour
      },
      priority: 3,
    }
  );

  console.log('[Cache Maintenance] Scheduled hourly metrics collection');
}

/**
 * Schedule weekly performance report
 */
export async function scheduleWeeklyReport(): Promise<void> {
  await cacheMaintenanceQueue.add(
    CacheMaintenanceJobType.GENERATE_REPORT,
    {
      type: CacheMaintenanceJobType.GENERATE_REPORT,
      options: { periodDays: 7 },
    },
    {
      repeat: {
        pattern: '0 0 * * 1', // Every Monday at midnight
      },
      priority: 7,
    }
  );

  console.log('[Cache Maintenance] Scheduled weekly performance report');
}

/**
 * Schedule cache health checks (runs every 15 minutes)
 */
export async function scheduleHealthChecks(): Promise<void> {
  await cacheMaintenanceQueue.add(
    CacheMaintenanceJobType.HEALTH_CHECK,
    {
      type: CacheMaintenanceJobType.HEALTH_CHECK,
    },
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes
      },
      priority: 2,
    }
  );

  console.log('[Cache Maintenance] Scheduled health checks');
}

/**
 * Worker to process cache maintenance jobs
 */
export const cacheMaintenanceWorker = new Worker<CacheMaintenanceJobData>(
  'cache-maintenance',
  async (job: Job<CacheMaintenanceJobData>) => {
    const { type, options } = job.data;

    console.log(`[Cache Maintenance Worker] Processing job: ${type}`);

    try {
      switch (type) {
        case CacheMaintenanceJobType.WARM_CRITICAL_CACHES:
          await handleCriticalCacheWarmup(job);
          break;

        case CacheMaintenanceJobType.WARM_INCREMENTAL:
          await handleIncrementalWarmup(job, options?.batchSize);
          break;

        case CacheMaintenanceJobType.COLLECT_METRICS:
          await handleMetricsCollection(job);
          break;

        case CacheMaintenanceJobType.GENERATE_REPORT:
          await handleReportGeneration(job, options?.periodDays);
          break;

        case CacheMaintenanceJobType.HEALTH_CHECK:
          await handleHealthCheck(job);
          break;

        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      console.log(`[Cache Maintenance Worker] Completed job: ${type}`);
    } catch (error) {
      console.error(`[Cache Maintenance Worker] Error processing ${type}:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2, // Process up to 2 jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 60000, // 1 minute
    },
  }
);

/**
 * Handle critical cache warmup
 */
async function handleCriticalCacheWarmup(job: Job): Promise<void> {
  await job.updateProgress(0);

  const warmingService = getCacheWarmingService(prisma);
  const result = await warmingService.warmCriticalCaches();

  await job.updateProgress(100);

  await job.log(`Warmed ${result.completed}/${result.totalTasks} cache groups`);

  if (result.failed > 0) {
    await job.log(`Failed to warm ${result.failed} cache groups`);
    result.errors.forEach((error) => {
      job.log(`  - ${error.task}: ${error.error}`);
    });
  }

  return result as any;
}

/**
 * Handle incremental cache warmup
 */
async function handleIncrementalWarmup(
  job: Job,
  batchSize: number = 50
): Promise<void> {
  await job.updateProgress(0);

  const warmingService = getCacheWarmingService(prisma);
  await warmingService.warmCacheIncrementally({ batchSize, delayBetweenBatches: 1000 });

  await job.updateProgress(100);
  await job.log(`Completed incremental cache warming with batch size ${batchSize}`);
}

/**
 * Handle metrics collection
 */
async function handleMetricsCollection(job: Job): Promise<void> {
  await job.updateProgress(0);

  await cachePerformanceService.recordMetricsSnapshot();

  const metrics = await cachePerformanceService.getCurrentMetrics();

  await job.updateProgress(100);
  await job.log(`Collected metrics: Hit Rate=${metrics.hitRate}%, Latency=${metrics.averageLatency}ms`);

  return metrics as any;
}

/**
 * Handle performance report generation
 */
async function handleReportGeneration(
  job: Job,
  periodDays: number = 7
): Promise<void> {
  await job.updateProgress(0);

  const report = await cachePerformanceService.generateEfficiencyReport(periodDays);

  await job.updateProgress(100);

  // Log report summary
  await job.log('=== Cache Performance Report ===');
  await job.log(`Period: ${report.period.start} to ${report.period.end}`);
  await job.log(`Overall Hit Rate: ${report.overall.hitRate}%`);
  await job.log(`Total Requests: ${report.overall.totalRequests}`);
  await job.log(`Average Latency: ${report.overall.averageLatency}ms`);
  await job.log(`Memory Saved: ${report.overall.memorySaved}`);
  await job.log('');
  await job.log('Recommendations:');
  report.recommendations.forEach((rec, idx) => {
    job.log(`  ${idx + 1}. ${rec}`);
  });

  return report as any;
}

/**
 * Handle cache health check
 */
async function handleHealthCheck(job: Job): Promise<void> {
  await job.updateProgress(0);

  const health = await redisMonitor.getHealthStatus();

  await job.updateProgress(100);

  if (health.status === 'healthy') {
    await job.log(`Cache health: ${health.status} (latency: ${health.latency}ms)`);
  } else {
    await job.log(`Cache health: ${health.status}`);
    health.issues.forEach((issue) => {
      job.log(`  - ${issue}`);
    });
  }

  // If unhealthy, could trigger alerts here
  if (health.status === 'unhealthy') {
    console.error('[Cache Health Check] ALERT: Cache is unhealthy', health);
    // TODO: Send notification to ops team
  }

  return health as any;
}

// Worker event handlers
cacheMaintenanceWorker.on('completed', (job) => {
  console.log(`[Cache Maintenance Worker] Job ${job.id} completed successfully`);
});

cacheMaintenanceWorker.on('failed', (job, error) => {
  console.error(`[Cache Maintenance Worker] Job ${job?.id} failed:`, error);
});

cacheMaintenanceWorker.on('error', (error) => {
  console.error('[Cache Maintenance Worker] Worker error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Cache Maintenance Worker] Shutting down gracefully...');
  await cacheMaintenanceWorker.close();
  await cacheMaintenanceQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Cache Maintenance Worker] Shutting down gracefully...');
  await cacheMaintenanceWorker.close();
  await cacheMaintenanceQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});
