/**
 * All Workers Initialization
 * 
 * Starts all background workers for the application:
 * - Email workers: Scheduled emails, retries, campaigns, deliverability
 * - Blog workers: Scheduled publishing
 * - Other background jobs
 */

import { initializeEmailWorkers, shutdownEmailWorkers, getEmailWorkersHealth } from './email-workers';
import { scheduledBlogPublishingWorker, setupScheduledPublishingJob, getScheduledPublishingStats } from './scheduled-blog-publishing.job';

/**
 * Initialize all workers
 * Call this function when the application starts
 */
export async function initializeAllWorkers(): Promise<void> {
  console.log('[Workers] Initializing all background workers...');

  try {
    // Initialize email workers
    initializeEmailWorkers();

    // Set up scheduled blog publishing job
    await setupScheduledPublishingJob();

    // Set up analytics aggregation jobs
    const { initializeMetricsAggregationJobs } = await import('./metrics-aggregation.job');
    await initializeMetricsAggregationJobs();

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

  const shutdownPromises = [
    shutdownEmailWorkers(),
    scheduledBlogPublishingWorker?.close(),
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

  const [emailHealth, blogPublishingStats] = await Promise.all([
    getEmailWorkersHealth(),
    getScheduledPublishingStats(),
  ]);

  return {
    healthy: emailHealth.healthy && blogPublishingStats.isHealthy,
    email: emailHealth,
    blog: {
      scheduledPublishing: blogPublishingStats,
    },
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
