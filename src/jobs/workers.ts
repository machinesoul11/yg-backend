/**
 * All Workers Initialization
 * 
 * Starts all background workers for the application:
 * - Email workers: Scheduled emails, retries, campaigns, deliverability
 * - Blog workers: Scheduled publishing
 * - Other background jobs
 * - Queue scaling and monitoring system
 */

import { initializeEmailWorkers, shutdownEmailWorkers, getEmailWorkersHealth } from './email-workers';
import { scheduledBlogPublishingWorker, setupScheduledPublishingJob, getScheduledPublishingStats } from './scheduled-blog-publishing.job';
import { scheduleNotificationDigests } from './notification-digest.job';
import { schedulePeriodicReindex } from './search-index-update.job';
import { initializeQueueSystem, getQueueSystemHealth } from '@/lib/queue';

/**
 * Initialize all workers
 * Call this function when the application starts
 */
export async function initializeAllWorkers(): Promise<void> {
  console.log('[Workers] Initializing all background workers...');

  try {
    // Initialize queue scaling and monitoring system
    await initializeQueueSystem({
      enableAutoScaling: process.env.ENABLE_AUTO_SCALING !== 'false',
      enableMonitoring: process.env.ENABLE_QUEUE_MONITORING !== 'false',
      autoScalingIntervalMs: parseInt(process.env.AUTO_SCALING_INTERVAL || '30000'),
      monitoringIntervalMs: parseInt(process.env.MONITORING_INTERVAL || '60000'),
    });

    // Initialize email workers
    initializeEmailWorkers();

    // Set up scheduled blog publishing job
    await setupScheduledPublishingJob();

    // Set up analytics aggregation jobs
    const { initializeMetricsAggregationJobs } = await import('./metrics-aggregation.job');
    await initializeMetricsAggregationJobs();

    // Set up notification digest jobs (daily & weekly)
    await scheduleNotificationDigests();

    // Set up periodic search reindex (weekly)
    await schedulePeriodicReindex();

    // Set up graceful shutdown handlers
    process.on('SIGTERM', async () => {
      console.log('[Workers] SIGTERM received, shutting down all workers...');
      await shutdownAllWorkers();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('[Workers] SIGINT received, shutting down all workers...');
      await shutdownAllWorkers();
      process.exit(0);
    });

    console.log('[Workers] All background workers initialized successfully');
  } catch (error) {
    console.error('[Workers] Error initializing workers:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown all workers
 */
export async function shutdownAllWorkers(): Promise<void> {
  console.log('[Workers] Shutting down all workers...');

  // Import workers dynamically to avoid circular dependencies
  const { notificationDeliveryWorker } = await import('./notification-delivery.job');
  const { notificationDigestWorker } = await import('./notification-digest.job');
  const { searchIndexWorker, bulkSearchIndexWorker, reindexWorker } = await import('./search-index-update.job');
  const { weeklyMetricsRollupWorker, monthlyMetricsRollupWorker } = await import('./metrics-aggregation.job');

  const shutdownPromises = [
    shutdownEmailWorkers(),
    scheduledBlogPublishingWorker?.close(),
    notificationDeliveryWorker?.close(),
    notificationDigestWorker?.close(),
    searchIndexWorker?.close(),
    bulkSearchIndexWorker?.close(),
    reindexWorker?.close(),
    weeklyMetricsRollupWorker?.close(),
    monthlyMetricsRollupWorker?.close(),
  ];

  await Promise.allSettled(shutdownPromises);

  console.log('[Workers] All workers shut down');
}

/**
 * Get health status of all workers
 */
export async function getAllWorkersHealth(): Promise<{
  healthy: boolean;
  email: Awaited<ReturnType<typeof getEmailWorkersHealth>>;
  blog: {
    scheduledPublishing: Awaited<ReturnType<typeof getScheduledPublishingStats>>;
  };
  queueSystem?: Awaited<ReturnType<typeof getQueueSystemHealth>>;
}> {
  // Check if we're in serverless - if so, workers don't exist
  const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
  
  if (isServerless) {
    return {
      healthy: true, // Consider healthy in serverless (workers not needed)
      email: await getEmailWorkersHealth(),
      blog: {
        scheduledPublishing: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          isHealthy: true,
        },
      },
    };
  }

  const [emailHealth, blogPublishingStats, queueSystemHealth] = await Promise.all([
    getEmailWorkersHealth(),
    getScheduledPublishingStats(),
    getQueueSystemHealth().catch(err => {
      console.error('[Workers] Error getting queue system health:', err);
      return null;
    }),
  ]);

  return {
    healthy: emailHealth.healthy && blogPublishingStats.isHealthy && (queueSystemHealth?.healthy ?? true),
    email: emailHealth,
    blog: {
      scheduledPublishing: blogPublishingStats,
    },
    queueSystem: queueSystemHealth || undefined,
  };
}

// Export for direct access if needed
export {
  // Email workers
  initializeEmailWorkers,
  shutdownEmailWorkers,
  getEmailWorkersHealth,
  
  // Blog workers
  scheduledBlogPublishingWorker,
  setupScheduledPublishingJob,
  getScheduledPublishingStats,
};
