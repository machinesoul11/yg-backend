/**
 * Analytics Background Jobs
 * Handles event enrichment, daily metrics aggregation, and real-time metrics
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection, redis } from '@/lib/db/redis';
import { MetricsAggregationService } from '@/modules/analytics/services/metrics-aggregation.service';
import { EventEnrichmentService } from '@/modules/analytics/services/event-enrichment.service';
import { RealtimeMetricsService } from '@/modules/analytics/services/realtime-metrics.service';
import { MetricsCacheService } from '@/modules/analytics/services/metrics-cache-layer.service';
import type {
  EnrichEventJobData,
  AggregateDailyMetricsJobData,
} from '@/modules/analytics/types';

/**
 * Job Queue: Enrich Event
 */
export const enrichEventQueue = new Queue<EnrichEventJobData>(
  'enrich-event',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
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
 * Uses the EventEnrichmentService for comprehensive enrichment
 */
export const enrichEventWorker = new Worker<EnrichEventJobData>(
  'enrich-event',
  async (job: Job<EnrichEventJobData>) => {
    const { eventId } = job.data;

    console.log(`[EnrichEvent] Processing event ${eventId}`);

    const enrichmentService = new EventEnrichmentService(prisma, redis);

    try {
      await enrichmentService.enrichEvent(eventId);
      console.log(`[EnrichEvent] Successfully enriched event ${eventId}`);
    } catch (error) {
      console.error(`[EnrichEvent] Error enriching event ${eventId}:`, error);
      throw error; // Will trigger retry
    }
  },
  { 
    connection: redisConnection,
    concurrency: 5, // Process up to 5 enrichment jobs concurrently
  }
);

/**
 * Job Queue: Aggregate Daily Metrics
 */
export const aggregateDailyMetricsQueue =
  new Queue<AggregateDailyMetricsJobData>('aggregate-daily-metrics', {
    connection: redisConnection,
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
    { connection: redisConnection }
  );

/**
 * Job Queue: Aggregate Post Daily Metrics
 */
export const aggregatePostDailyMetricsQueue = new Queue<AggregateDailyMetricsJobData>(
  'aggregate-post-daily-metrics',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

/**
 * Worker: Aggregate Post Daily Metrics
 */
export const aggregatePostDailyMetricsWorker = new Worker<AggregateDailyMetricsJobData>(
  'aggregate-post-daily-metrics',
  async (job: Job<AggregateDailyMetricsJobData>) => {
    const { date } = job.data;
    console.log(`[AggregatePostDailyMetrics] Processing date: ${date}`);

    try {
      const targetDate = new Date(date);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Get all published posts
      const publishedPosts = await prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
          publishedAt: { lte: targetDate },
          deletedAt: null,
        },
        select: { id: true },
      });

      const postIds = publishedPosts.map(p => p.id);

      // Process metrics for each post
      for (const postId of postIds) {
        await aggregatePostMetricsForDate(postId, targetDate, nextDay);
      }

      console.log(`[AggregatePostDailyMetrics] Completed for ${date}, processed ${postIds.length} posts`);
    } catch (error) {
      console.error(`[AggregatePostDailyMetrics] Failed for ${date}:`, error);
      
      // Send alert if final retry
      if (job.attemptsMade >= 3) {
        console.error(`[AggregatePostDailyMetrics] All retries exhausted for ${date}`);
        // TODO: Send Slack/email alert to ops team
      }
      
      throw error;
    }
  },
  { connection: redisConnection }
);

/**
 * Aggregate metrics for a specific post and date
 */
async function aggregatePostMetricsForDate(postId: string, date: Date, nextDay: Date) {
  // Get all events for this post on this date
  const events = await prisma.event.findMany({
    where: {
      postId,
      occurredAt: { gte: date, lt: nextDay },
    },
    include: {
      attribution: true,
    },
  });

  if (events.length === 0) {
    return; // No events for this post on this date
  }

  // Calculate metrics
  const viewEvents = events.filter(e => e.eventType === 'post_viewed');
  const engagementEvents = events.filter(e => e.eventType === 'post_engagement_time');
  const scrollEvents = events.filter(e => e.eventType === 'post_scroll_depth');
  const ctaEvents = events.filter(e => e.eventType === 'post_cta_clicked');

  const views = viewEvents.length;
  const uniqueVisitors = new Set(viewEvents.map(e => e.sessionId).filter(Boolean)).size;

  // Calculate engagement metrics
  const totalEngagementTimeSeconds = engagementEvents.reduce((sum, e) => {
    const props = e.propsJson as any;
    return sum + (props?.engagementTimeSeconds || 0);
  }, 0);

  const avgEngagementTimeSeconds = engagementEvents.length > 0 
    ? totalEngagementTimeSeconds / engagementEvents.length 
    : 0;

  // Calculate scroll depth
  const scrollDepths = scrollEvents.map(e => {
    const props = e.propsJson as any;
    return props?.scrollDepthPercentage || 0;
  });

  const avgScrollDepthPercentage = scrollDepths.length > 0
    ? scrollDepths.reduce((sum, depth) => sum + depth, 0) / scrollDepths.length
    : 0;

  // Calculate CTA clicks
  const ctaClicks = ctaEvents.length;

  // Calculate bounce rate (sessions with engagement time < 30 seconds)
  const shortEngagementSessions = new Set();
  engagementEvents.forEach(e => {
    const props = e.propsJson as any;
    if ((props?.engagementTimeSeconds || 0) < 30) {
      shortEngagementSessions.add(e.sessionId);
    }
  });

  const bounceRate = uniqueVisitors > 0 
    ? (shortEngagementSessions.size / uniqueVisitors) * 100 
    : 0;

  // Calculate conversion rate (CTA clicks per view)
  const conversionRate = views > 0 ? (ctaClicks / views) * 100 : 0;

  // Aggregate referrer data
  const referrerData = aggregateReferrerData(viewEvents);
  const ctaTypeData = aggregateCtaTypeData(ctaEvents);
  const deviceData = aggregateDeviceData(events);
  const sourceData = aggregateSourceData(events);

  // Upsert daily metrics
  await prisma.postDailyMetrics.upsert({
    where: {
      date_postId: {
        date,
        postId,
      },
    },
    update: {
      views,
      uniqueVisitors,
      totalEngagementTimeSeconds,
      avgEngagementTimeSeconds,
      avgScrollDepthPercentage,
      ctaClicks,
      bounceRate,
      conversionRate,
      topReferrers: referrerData,
      topCtaTypes: ctaTypeData,
      deviceBreakdown: deviceData,
      sourceBreakdown: sourceData,
      updatedAt: new Date(),
    },
    create: {
      date,
      postId,
      views,
      uniqueVisitors,
      totalEngagementTimeSeconds,
      avgEngagementTimeSeconds,
      avgScrollDepthPercentage,
      ctaClicks,
      bounceRate,
      conversionRate,
      topReferrers: referrerData,
      topCtaTypes: ctaTypeData,
      deviceBreakdown: deviceData,
      sourceBreakdown: sourceData,
    },
  });
}

/**
 * Aggregate referrer data from view events
 */
function aggregateReferrerData(viewEvents: any[]) {
  const referrerMap = new Map<string, number>();

  viewEvents.forEach(event => {
    if (event.attribution?.referrer) {
      try {
        const domain = new URL(event.attribution.referrer).hostname.replace('www.', '');
        referrerMap.set(domain, (referrerMap.get(domain) || 0) + 1);
      } catch {
        referrerMap.set('direct', (referrerMap.get('direct') || 0) + 1);
      }
    } else {
      referrerMap.set('direct', (referrerMap.get('direct') || 0) + 1);
    }
  });

  return Array.from(referrerMap.entries())
    .map(([domain, visits]) => ({ domain, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);
}

/**
 * Aggregate CTA type data from CTA events
 */
function aggregateCtaTypeData(ctaEvents: any[]) {
  const ctaMap = new Map<string, { clicks: number; conversions: number }>();

  ctaEvents.forEach(event => {
    const props = event.propsJson as any;
    const ctaType = props?.ctaType || 'unknown';
    const current = ctaMap.get(ctaType) || { clicks: 0, conversions: 0 };
    
    ctaMap.set(ctaType, {
      clicks: current.clicks + 1,
      conversions: current.conversions + (props?.conversionValue ? 1 : 0),
    });
  });

  return Array.from(ctaMap.entries())
    .map(([type, data]) => ({ type, clicks: data.clicks, conversions: data.conversions }))
    .sort((a, b) => b.clicks - a.clicks);
}

/**
 * Aggregate device data
 */
function aggregateDeviceData(events: any[]) {
  const deviceCounts = { desktop: 0, mobile: 0, tablet: 0 };

  events.forEach(event => {
    if (event.attribution?.deviceType) {
      const deviceType = event.attribution.deviceType.toLowerCase();
      if (deviceType in deviceCounts) {
        (deviceCounts as any)[deviceType]++;
      }
    }
  });

  return deviceCounts;
}

/**
 * Aggregate source data
 */
function aggregateSourceData(events: any[]) {
  const sourceCounts = { organic: 0, social: 0, direct: 0, referral: 0, email: 0 };

  events.forEach(event => {
    if (!event.attribution) {
      sourceCounts.direct++;
      return;
    }

    const { utmMedium, utmSource, referrer } = event.attribution;

    if (utmMedium?.includes('email')) {
      sourceCounts.email++;
    } else if (utmMedium?.includes('social') || utmSource?.includes('facebook') || utmSource?.includes('twitter')) {
      sourceCounts.social++;
    } else if (utmMedium?.includes('organic') || (!utmMedium && referrer?.includes('google'))) {
      sourceCounts.organic++;
    } else if (referrer && !utmMedium) {
      sourceCounts.referral++;
    } else {
      sourceCounts.direct++;
    }
  });

  return sourceCounts;
}

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
 * Get aggregation job health and statistics
 */
export async function getMetricsAggregationHealth() {
  const [dailyWaiting, dailyActive, dailyCompleted, dailyFailed, postWaiting, postActive] = await Promise.all([
    aggregateDailyMetricsQueue.getWaitingCount(),
    aggregateDailyMetricsQueue.getActiveCount(),
    aggregateDailyMetricsQueue.getCompletedCount(),
    aggregateDailyMetricsQueue.getFailedCount(),
    aggregatePostDailyMetricsQueue.getWaitingCount(),
    aggregatePostDailyMetricsQueue.getActiveCount(),
  ]);

  return {
    dailyMetrics: {
      waiting: dailyWaiting,
      active: dailyActive,
      completed: dailyCompleted,
      failed: dailyFailed,
      isHealthy: dailyFailed < 5 && dailyActive < 10,
    },
    postMetrics: {
      waiting: postWaiting,
      active: postActive,
      isHealthy: postActive < 10,
    },
    overall: {
      isHealthy: dailyFailed < 5 && dailyActive < 10 && postActive < 10,
    },
  };
}

/**
 * Schedule nightly post metrics aggregation job (runs at 3 AM UTC)
 */
export async function scheduleNightlyPostAggregation() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  await aggregatePostDailyMetricsQueue.add(
    'aggregate-post-daily-metrics',
    { date: dateStr },
    {
      repeat: {
        pattern: '0 3 * * *', // Cron: 3 AM daily (after main analytics job)
        tz: 'UTC',
      },
    }
  );

  console.log('[PostAnalytics] Scheduled nightly post metrics aggregation at 3 AM UTC');
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

aggregatePostDailyMetricsWorker.on('failed', (job, error) => {
  if (job) {
    console.error(
      `[AggregatePostDailyMetrics] Job ${job.id} failed after ${job.attemptsMade} attempts:`,
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

aggregatePostDailyMetricsWorker.on('completed', (job) => {
  console.log(
    `[AggregatePostDailyMetrics] Job ${job.id} completed successfully`
  );
});

/**
 * Initialize real-time metrics service
 */
export const realtimeMetricsService = new RealtimeMetricsService(prisma, redis);

/**
 * Initialize cache service
 */
export const metricsCacheService = new MetricsCacheService(prisma, redis);

/**
 * Reconcile real-time metrics (hourly job)
 */
export async function scheduleRealtimeMetricsReconciliation(): Promise<void> {
  setInterval(async () => {
    try {
      console.log('[RealtimeMetrics] Starting reconciliation');
      // Add metric keys to reconcile here
      const metricKeys = ['events:asset_viewed', 'events:license_created'];
      await realtimeMetricsService.reconcileMetrics(metricKeys);
      console.log('[RealtimeMetrics] Reconciliation complete');
    } catch (error) {
      console.error('[RealtimeMetrics] Reconciliation error:', error);
    }
  }, 3600000); // Every hour
}

/**
 * Cleanup expired real-time metrics (daily job)
 */
export async function scheduleRealtimeMetricsCleanup(): Promise<void> {
  setInterval(async () => {
    try {
      console.log('[RealtimeMetrics] Starting cleanup');
      await realtimeMetricsService.cleanupExpiredMetrics();
      console.log('[RealtimeMetrics] Cleanup complete');
    } catch (error) {
      console.error('[RealtimeMetrics] Cleanup error:', error);
    }
  }, 86400000); // Every 24 hours
}

/**
 * Invalidate cache after daily aggregation completes
 */
aggregateDailyMetricsWorker.on('completed', async (job) => {
  if (job?.data?.date) {
    await metricsCacheService.invalidateAfterDailyAggregation(job.data.date);
  }
});
