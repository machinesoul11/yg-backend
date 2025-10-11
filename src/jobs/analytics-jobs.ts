/**
 * Analytics Background Jobs
 * Handles event enrichment and daily metrics aggregation
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { MetricsAggregationService } from '@/modules/analytics/services/metrics-aggregation.service';
import type {
  EnrichEventJobData,
  AggregateDailyMetricsJobData,
  ParsedUserAgent,
} from '@/modules/analytics/types';

/**
 * Parse user agent string into device/browser/os
 */
function parseUserAgent(userAgent: string): ParsedUserAgent {
  // Basic user agent parsing (in production, use a library like ua-parser-js)
  const ua = userAgent.toLowerCase();

  // Device detection
  let deviceType = 'desktop';
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (
    /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
      userAgent
    )
  ) {
    deviceType = 'mobile';
  }

  // Browser detection
  let browser = 'Unknown';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('chrome') && !ua.includes('edge')) browser = 'Chrome';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edge')) browser = 'Edge';
  else if (ua.includes('trident') || ua.includes('msie')) browser = 'IE';

  // OS detection
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad'))
    os = 'iOS';

  return { deviceType, browser, os };
}

/**
 * Job Queue: Enrich Event
 */
export const enrichEventQueue = new Queue<EnrichEventJobData>(
  'enrich-event',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  }
);

/**
 * Worker: Enrich Event
 */
export const enrichEventWorker = new Worker<EnrichEventJobData>(
  'enrich-event',
  async (job: Job<EnrichEventJobData>) => {
    const { eventId } = job.data;

    console.log(`[EnrichEvent] Processing event ${eventId}`);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { attribution: true },
    });

    if (!event) {
      console.warn(`[EnrichEvent] Event ${eventId} not found`);
      return;
    }

    // Parse user agent from props_json
    const propsJson = event.propsJson as any;
    const userAgent = propsJson?.userAgent;

    if (userAgent && event.attribution) {
      const { deviceType, browser, os } = parseUserAgent(userAgent);

      // Update attribution with parsed data
      await (prisma as any).attribution.updateMany({
        where: { eventId: event.id },
        data: { deviceType, browser, os },
      });

      console.log(
        `[EnrichEvent] Enriched event ${eventId} with device=${deviceType}, browser=${browser}, os=${os}`
      );
    }
  },
  { connection: redis }
);

/**
 * Job Queue: Aggregate Daily Metrics
 */
export const aggregateDailyMetricsQueue =
  new Queue<AggregateDailyMetricsJobData>('aggregate-daily-metrics', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

/**
 * Worker: Aggregate Daily Metrics
 */
export const aggregateDailyMetricsWorker =
  new Worker<AggregateDailyMetricsJobData>(
    'aggregate-daily-metrics',
    async (job: Job<AggregateDailyMetricsJobData>) => {
      const { date } = job.data; // YYYY-MM-DD string

      console.log(`[AggregateDailyMetrics] Starting aggregation for ${date}`);

      const targetDate = new Date(date);
      const aggregationService = new MetricsAggregationService(prisma);

      try {
        await aggregationService.aggregateDailyMetrics(targetDate);
        console.log(
          `[AggregateDailyMetrics] Successfully completed for ${date}`
        );
      } catch (error) {
        console.error(
          `[AggregateDailyMetrics] Failed for ${date}:`,
          error
        );

        // Send alert if final retry
        if (job.attemptsMade >= 3) {
          console.error(
            `[AggregateDailyMetrics] All retries exhausted for ${date}`
          );
          // TODO: Send Slack/email alert to ops team
        }

        throw error;
      }
    },
    { connection: redis }
  );

/**
 * Schedule nightly aggregation job (runs at 2 AM UTC)
 */
export async function scheduleNightlyAggregation() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  await aggregateDailyMetricsQueue.add(
    'aggregate-daily-metrics',
    { date: dateStr },
    {
      repeat: {
        pattern: '0 2 * * *', // Cron: 2 AM daily
        tz: 'UTC',
      },
    }
  );

  console.log('[Analytics] Scheduled nightly metrics aggregation at 2 AM UTC');
}

/**
 * Error handlers
 */
enrichEventWorker.on('failed', (job, error) => {
  if (job) {
    console.error(
      `[EnrichEvent] Job ${job.id} failed after ${job.attemptsMade} attempts:`,
      error
    );
  }
});

aggregateDailyMetricsWorker.on('failed', (job, error) => {
  if (job) {
    console.error(
      `[AggregateDailyMetrics] Job ${job.id} failed after ${job.attemptsMade} attempts:`,
      error
    );
  }
});

/**
 * Success handlers
 */
enrichEventWorker.on('completed', (job) => {
  console.log(`[EnrichEvent] Job ${job.id} completed successfully`);
});

aggregateDailyMetricsWorker.on('completed', (job) => {
  console.log(
    `[AggregateDailyMetrics] Job ${job.id} completed successfully`
  );
});
