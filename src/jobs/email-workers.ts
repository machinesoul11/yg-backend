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
    scheduledEmailWorker?.close(),
    emailRetryWorker?.close(),
    campaignWorker?.close(),
    deliverabilityMonitoringWorker?.close(),
    emailEventsWorker?.close(),
  ].filter(Boolean);

  await Promise.allSettled(shutdownPromises);

  console.log('[EmailWorkers] All email workers shut down');
}

/**
 * Get health status of all email workers
 * Returns null status for workers in serverless environments
 */
export async function getEmailWorkersHealth(): Promise<{
  healthy: boolean;
  workers: Record<string, { running: boolean; isPaused: boolean } | null>;
}> {
  // Check if we're in serverless - if so, workers don't exist
  const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
  
  if (isServerless) {
    return {
      healthy: true, // Consider healthy in serverless (workers not needed)
      workers: {
        'scheduled-emails': null,
        'email-retry': null,
        'email-campaigns': null,
        'deliverability-monitoring': null,
        'email-events-processor': null,
      },
    };
  }

  const workers = {
    'scheduled-emails': scheduledEmailWorker ? {
      running: await scheduledEmailWorker.isRunning(),
      isPaused: await scheduledEmailWorker.isPaused(),
    } : null,
    'email-retry': emailRetryWorker ? {
      running: await emailRetryWorker.isRunning(),
      isPaused: await emailRetryWorker.isPaused(),
    } : null,
    'email-campaigns': campaignWorker ? {
      running: await campaignWorker.isRunning(),
      isPaused: await campaignWorker.isPaused(),
    } : null,
    'deliverability-monitoring': deliverabilityMonitoringWorker ? {
      running: await deliverabilityMonitoringWorker.isRunning(),
      isPaused: await deliverabilityMonitoringWorker.isPaused(),
    } : null,
    'email-events-processor': emailEventsWorker ? {
      running: await emailEventsWorker.isRunning(),
      isPaused: await emailEventsWorker.isPaused(),
    } : null,
  };

  const runningWorkers = Object.values(workers).filter(w => w !== null);
  const allRunning = runningWorkers.every(w => w && w.running && !w.isPaused);

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
