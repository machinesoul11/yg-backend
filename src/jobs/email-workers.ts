/**
 * Email Workers Initialization
 * 
 * Starts all background workers for email processing:
 * - Scheduled email worker: Processes scheduled emails at the right time
 * - Email retry worker: Handles failed email retries with exponential backoff
 * - Campaign worker: Processes bulk email campaigns with rate limiting
 * - Deliverability monitoring: Tracks and alerts on email health metrics
 * 
 * This file should be imported and initialized when the application starts.
 */

import { scheduledEmailWorker } from './scheduled-email-worker.job';
import { emailRetryWorker } from './email-retry-worker.job';
import { campaignWorker } from './email-campaign-worker.job';
import { deliverabilityMonitoringWorker } from './deliverability-monitoring.job';
import { emailEventsWorker } from './email-events-processor.job';

/**
 * Initialize all email workers
 * Call this function when the application starts
 */
export function initializeEmailWorkers(): void {
  console.log('[EmailWorkers] Initializing email workers...');

  // Workers are initialized by importing them
  // They automatically start listening for jobs

  // Set up graceful shutdown handlers
  process.on('SIGTERM', async () => {
    console.log('[EmailWorkers] SIGTERM received, shutting down workers...');
    await shutdownEmailWorkers();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[EmailWorkers] SIGINT received, shutting down workers...');
    await shutdownEmailWorkers();
    process.exit(0);
  });

  console.log('[EmailWorkers] All email workers initialized successfully');
}

/**
 * Gracefully shutdown all email workers
 */
export async function shutdownEmailWorkers(): Promise<void> {
  console.log('[EmailWorkers] Shutting down email workers...');

  const shutdownPromises = [
    scheduledEmailWorker.close(),
    emailRetryWorker.close(),
    campaignWorker.close(),
    deliverabilityMonitoringWorker.close(),
    emailEventsWorker.close(),
  ];

  await Promise.allSettled(shutdownPromises);

  console.log('[EmailWorkers] All email workers shut down');
}

/**
 * Get health status of all email workers
 */
export async function getEmailWorkersHealth(): Promise<{
  healthy: boolean;
  workers: Record<string, { running: boolean; isPaused: boolean }>;
}> {
  const workers = {
    'scheduled-emails': {
      running: await scheduledEmailWorker.isRunning(),
      isPaused: await scheduledEmailWorker.isPaused(),
    },
    'email-retry': {
      running: await emailRetryWorker.isRunning(),
      isPaused: await emailRetryWorker.isPaused(),
    },
    'email-campaigns': {
      running: await campaignWorker.isRunning(),
      isPaused: await campaignWorker.isPaused(),
    },
    'deliverability-monitoring': {
      running: await deliverabilityMonitoringWorker.isRunning(),
      isPaused: await deliverabilityMonitoringWorker.isPaused(),
    },
    'email-events-processor': {
      running: await emailEventsWorker.isRunning(),
      isPaused: await emailEventsWorker.isPaused(),
    },
  };

  const allRunning = Object.values(workers).every(w => w.running && !w.isPaused);

  return {
    healthy: allRunning,
    workers,
  };
}

// Export individual workers for direct access if needed
export {
  scheduledEmailWorker,
  emailRetryWorker,
  campaignWorker,
  deliverabilityMonitoringWorker,
  emailEventsWorker,
};
