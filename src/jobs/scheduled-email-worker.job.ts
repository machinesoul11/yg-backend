/**
 * Scheduled Email Worker
 * 
 * Processes scheduled emails from the queue and sends them at the appropriate time.
 * Integrates with the EmailSchedulingService to handle:
 * - One-time scheduled sends
 * - Recurring emails
 * - Send time optimization
 * - Frequency capping
 */

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { emailSchedulingService } from '@/lib/services/email/scheduling.service';

interface ScheduledEmailJobData {
  scheduledEmailId: string;
}

export const scheduledEmailWorker = new Worker<ScheduledEmailJobData>(
  'scheduled-emails',
  async (job: Job<ScheduledEmailJobData>) => {
    const { scheduledEmailId } = job.data;

    try {
      job.log(`Processing scheduled email: ${scheduledEmailId}`);

      await emailSchedulingService.processScheduledEmail(scheduledEmailId);

      job.log(`Successfully sent scheduled email: ${scheduledEmailId}`);
    } catch (error) {
      const err = error as Error;
      job.log(`Error processing scheduled email ${scheduledEmailId}: ${err.message}`);
      
      // Rethrow to let BullMQ handle retries
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 10, // Process up to 10 scheduled emails concurrently
    limiter: {
      max: 100, // Process max 100 jobs
      duration: 60000, // per minute (rate limiting)
    },
  }
);

// Handle worker events
scheduledEmailWorker.on('completed', (job) => {
  console.log(`[ScheduledEmailWorker] Job ${job.id} completed`);
});

scheduledEmailWorker.on('failed', (job, err) => {
  console.error(`[ScheduledEmailWorker] Job ${job?.id} failed:`, err.message);
});

scheduledEmailWorker.on('error', (err) => {
  console.error('[ScheduledEmailWorker] Worker error:', err);
});

console.log('[ScheduledEmailWorker] Worker started and listening for scheduled emails');
