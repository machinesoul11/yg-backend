/**
 * Analytics Background Jobs
 * Handles event enrichment and daily metrics aggregation
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';;
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
    connection: redisConnection,
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
  { connection: redisConnection }
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
