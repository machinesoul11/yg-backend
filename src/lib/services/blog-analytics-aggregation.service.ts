/**
 * Blog Analytics Aggregation Job
 * 
 * This job processes raw events to calculate performance metrics:
 * - Average read time
 * - Bounce rate
 * - Social share counts
 * - Email capture rates
 * - Daily metrics rollups
 */

import { PrismaClient } from '@prisma/client';
import { redis } from '@/lib/redis';
import { EVENT_TYPES } from '@/lib/constants/event-types';

export class BlogAnalyticsAggregationJob {
  private readonly BOUNCE_THRESHOLD_SECONDS = 15;

  constructor(private prisma: PrismaClient) {}

  /**
   * Run full aggregation for all posts
   */
  async runFullAggregation(): Promise<void> {
    console.log('Starting blog analytics aggregation...');

    try {
      // Get all published posts
      const posts = await this.prisma.post.findMany({
        where: { 
          status: 'PUBLISHED',
          deletedAt: null,
        },
        select: { id: true, title: true },
      });

      console.log(`Processing ${posts.length} posts...`);

      for (const post of posts) {
        await this.aggregatePostMetrics(post.id);
        
        // Add small delay to prevent database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Blog analytics aggregation completed successfully');

    } catch (error) {
      console.error('Error during blog analytics aggregation:', error);
      throw error;
    }
  }

  /**
   * Aggregate metrics for a specific post
   */
  async aggregatePostMetrics(postId: string): Promise<void> {
    try {
      // Get all events for this post from propsJson where postId is stored
      const events = await this.prisma.event.findMany({
        where: {
          propsJson: {
            path: ['postId'],
            equals: postId,
          },
        },
        include: {
          attribution: true,
        },
        orderBy: {
          occurredAt: 'asc',
        },
      });

      if (events.length === 0) {
        return;
      }

      // Calculate metrics
      const metrics = await this.calculateMetrics(postId, events);

      // For now, we'll store the calculated metrics in a JSON field
      // Once the schema is fully updated, we can store in dedicated columns
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          // Store metrics in tags field as JSON for now
          tags: metrics,
        },
      });

      console.log(`Updated metrics for post ${postId}`);

    } catch (error) {
      console.error(`Error aggregating metrics for post ${postId}:`, error);
    }
  }

  /**
   * Calculate comprehensive metrics from events
   */
  private async calculateMetrics(postId: string, events: any[]): Promise<any> {
    // Group events by session
    const sessionEvents = new Map<string, any[]>();
    events.forEach(event => {
      if (event.sessionId) {
        if (!sessionEvents.has(event.sessionId)) {
          sessionEvents.set(event.sessionId, []);
        }
        sessionEvents.get(event.sessionId)!.push(event);
      }
    });

    // Calculate unique visitors
    const uniqueVisitors = sessionEvents.size;

    // Calculate average read time
    const engagementEvents = events.filter(e => e.eventType === EVENT_TYPES.POST_ENGAGEMENT_TIME);
    const engagementTimes = engagementEvents
      .map(event => {
        const props = event.propsJson as any;
        return props?.engagementTimeSeconds || 0;
      })
      .filter(time => time > 0 && time < 1800); // Filter outliers

    const avgReadTimeSeconds = engagementTimes.length > 0 
      ? engagementTimes.reduce((sum, time) => sum + time, 0) / engagementTimes.length
      : 0;

    // Calculate bounce rate
    let bounces = 0;
    for (const [sessionId, sessionEventList] of sessionEvents) {
      if (sessionEventList.length === 0) continue;

      const firstEvent = sessionEventList[0];
      const lastEvent = sessionEventList[sessionEventList.length - 1];
      
      // Calculate session duration
      const sessionDuration = (lastEvent.occurredAt.getTime() - firstEvent.occurredAt.getTime()) / 1000;
      
      // Check if it's a bounce (short session with minimal engagement)
      const hasEngagement = sessionEventList.some(event => 
        event.eventType === EVENT_TYPES.POST_SCROLL_DEPTH ||
        event.eventType === EVENT_TYPES.POST_CTA_CLICKED ||
        event.eventType === EVENT_TYPES.POST_SHARED ||
        event.eventType === EVENT_TYPES.POST_EMAIL_CAPTURE
      );

      if (sessionDuration <= this.BOUNCE_THRESHOLD_SECONDS && !hasEngagement) {
        bounces++;
      }
    }

    const bounceRate = uniqueVisitors > 0 ? (bounces / uniqueVisitors) * 100 : 0;

    // Calculate social shares
    const socialShareEvents = events.filter(e => e.eventType === EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED);
    const socialSharesCount = socialShareEvents.length;
    
    // Group by platform
    const socialShareBreakdown: Record<string, number> = {};
    socialShareEvents.forEach(event => {
      const props = event.propsJson as any;
      const platform = props?.platform || 'unknown';
      socialShareBreakdown[platform] = (socialShareBreakdown[platform] || 0) + 1;
    });

    // Calculate email captures
    const emailCaptureEvents = events.filter(e => e.eventType === EVENT_TYPES.POST_EMAIL_CAPTURE);
    const emailCaptureCount = emailCaptureEvents.length;
    const emailCaptureRate = uniqueVisitors > 0 ? (emailCaptureCount / uniqueVisitors) * 100 : 0;

    // Analyze referrer sources
    const referrerSources: Record<string, number> = {};
    events.forEach(event => {
      if (event.attribution?.referrer) {
        const referrer = this.categorizeReferrer(event.attribution.referrer);
        referrerSources[referrer] = (referrerSources[referrer] || 0) + 1;
      } else {
        referrerSources['direct'] = (referrerSources['direct'] || 0) + 1;
      }
    });

    // Calculate scroll depth metrics
    const scrollEvents = events.filter(e => e.eventType === EVENT_TYPES.POST_SCROLL_DEPTH);
    const maxScrollDepths = new Map<string, number>();
    
    scrollEvents.forEach(event => {
      const props = event.propsJson as any;
      const sessionId = event.sessionId;
      const depth = props?.depthPercentage || 0;
      
      if (sessionId && (!maxScrollDepths.has(sessionId) || maxScrollDepths.get(sessionId)! < depth)) {
        maxScrollDepths.set(sessionId, depth);
      }
    });

    const avgScrollDepth = maxScrollDepths.size > 0 
      ? Array.from(maxScrollDepths.values()).reduce((sum, depth) => sum + depth, 0) / maxScrollDepths.size
      : 0;

    return {
      performanceMetrics: {
        uniqueVisitors,
        avgReadTimeSeconds: Math.round(avgReadTimeSeconds),
        bounceRate: Math.round(bounceRate * 100) / 100,
        socialSharesCount,
        emailCaptureCount,
        emailCaptureRate: Math.round(emailCaptureRate * 100) / 100,
        avgScrollDepth: Math.round(avgScrollDepth * 100) / 100,
        lastCalculatedAt: new Date().toISOString(),
      },
      socialShareBreakdown,
      referrerSources,
      totalEvents: events.length,
    };
  }

  /**
   * Categorize referrer into source type
   */
  private categorizeReferrer(referrer: string): string {
    const lower = referrer.toLowerCase();
    
    if (lower.includes('google') || lower.includes('bing') || lower.includes('yahoo') || lower.includes('search')) {
      return 'organic_search';
    }
    
    if (lower.includes('facebook') || lower.includes('twitter') || lower.includes('linkedin') || 
        lower.includes('instagram') || lower.includes('tiktok') || lower.includes('social')) {
      return 'social_media';
    }
    
    if (lower.includes('email') || lower.includes('newsletter') || lower.includes('mail')) {
      return 'email';
    }
    
    if (lower === 'direct' || lower === '') {
      return 'direct';
    }
    
    return 'referral';
  }

  /**
   * Aggregate daily metrics for a specific date
   */
  async aggregateDailyMetrics(date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      // Get all events for the specified date
      const events = await this.prisma.event.findMany({
        where: {
          occurredAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          propsJson: {
            path: ['postId'],
            not: undefined,
          },
        },
        include: {
          attribution: true,
        },
      });

      // Group events by post
      const postEvents = new Map<string, any[]>();
      events.forEach(event => {
        const props = event.propsJson as any;
        const postId = props?.postId;
        if (postId) {
          if (!postEvents.has(postId)) {
            postEvents.set(postId, []);
          }
          postEvents.get(postId)!.push(event);
        }
      });

      // Process each post's daily metrics
      for (const [postId, postEventList] of postEvents) {
        await this.processDailyPostMetrics(postId, date, postEventList);
      }

      console.log(`Aggregated daily metrics for ${date.toISOString().split('T')[0]}`);

    } catch (error) {
      console.error(`Error aggregating daily metrics for ${date.toISOString()}:`, error);
    }
  }

  /**
   * Process daily metrics for a specific post
   */
  private async processDailyPostMetrics(postId: string, date: Date, events: any[]): Promise<void> {
    if (events.length === 0) return;

    // Calculate daily metrics similar to full aggregation but for single day
    const sessionIds = new Set(events.map(e => e.sessionId).filter(Boolean));
    const uniqueVisitors = sessionIds.size;
    
    const views = events.filter(e => e.eventType === EVENT_TYPES.POST_VIEWED).length;
    const shares = events.filter(e => e.eventType === EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED).length;
    const emailCaptures = events.filter(e => e.eventType === EVENT_TYPES.POST_EMAIL_CAPTURE).length;
    
    const engagementEvents = events.filter(e => e.eventType === EVENT_TYPES.POST_ENGAGEMENT_TIME);
    const totalEngagementTime = engagementEvents.reduce((sum, e) => {
      const props = e.propsJson as any;
      return sum + (props?.engagementTimeSeconds || 0);
    }, 0);
    
    const avgEngagementTime = engagementEvents.length > 0 ? totalEngagementTime / engagementEvents.length : 0;

    // Store in a cache or log for now (would normally update PostDailyMetrics table)
    const dailyMetrics = {
      postId,
      date: date.toISOString().split('T')[0],
      views,
      uniqueVisitors,
      totalEngagementTimeSeconds: totalEngagementTime,
      avgEngagementTimeSeconds: avgEngagementTime,
      shares,
      emailCaptures,
      emailCaptureRate: uniqueVisitors > 0 ? (emailCaptures / uniqueVisitors) * 100 : 0,
    };

    // Cache the daily metrics
    const cacheKey = `daily_metrics:${postId}:${date.toISOString().split('T')[0]}`;
    await redis.setex(cacheKey, 24 * 60 * 60, JSON.stringify(dailyMetrics)); // Cache for 24 hours
  }

  /**
   * Clean up old events (optional maintenance)
   */
  async cleanupOldEvents(retentionDays: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const deletedCount = await this.prisma.event.deleteMany({
        where: {
          occurredAt: {
            lt: cutoffDate,
          },
          eventType: {
            in: [
              EVENT_TYPES.POST_VIEWED,
              EVENT_TYPES.POST_SCROLL_DEPTH,
              EVENT_TYPES.POST_ENGAGEMENT_TIME,
            ],
          },
        },
      });

      console.log(`Cleaned up ${deletedCount.count} old analytics events`);

    } catch (error) {
      console.error('Error cleaning up old events:', error);
    }
  }
}

// Export a function to run the job
export async function runBlogAnalyticsAggregation(prisma: PrismaClient): Promise<void> {
  const job = new BlogAnalyticsAggregationJob(prisma);
  await job.runFullAggregation();
}

// Export a function to run daily aggregation
export async function runDailyAggregation(prisma: PrismaClient, date?: Date): Promise<void> {
  const job = new BlogAnalyticsAggregationJob(prisma);
  const targetDate = date || new Date();
  await job.aggregateDailyMetrics(targetDate);
}
