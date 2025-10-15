/**
 * Post Analytics Service
 * Handles post-specific analytics tracking, aggregation, and reporting
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import { TRPCError } from '@trpc/server';
import { EVENT_TYPES, ENTITY_TYPES } from '@/lib/constants/event-types';
import type {
  TrackPostViewInput,
  TrackEngagementTimeInput,
  TrackScrollDepthInput,
  TrackCtaClickInput,
  GetPostAnalyticsInput,
  GetPostTimeSeriesInput,
  GetPostReferrersInput,
  ComparePostsInput,
} from '@/lib/schemas/analytics.schema';

export interface PostAnalyticsOverview {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalViews: number;
    uniqueVisitors: number;
    avgEngagementTimeSeconds: number;
    avgScrollDepthPercentage: number;
    ctaClicks: number;
    bounceRate: number;
    conversionRate: number;
    topReferrers: Array<{
      domain: string;
      visits: number;
      percentage: number;
    }>;
    topCtaTypes: Array<{
      type: string;
      clicks: number;
      conversionRate: number;
    }>;
    deviceBreakdown: {
      desktop: number;
      mobile: number;
      tablet: number;
    };
    sourceBreakdown: {
      organic: number;
      social: number;
      direct: number;
      referral: number;
      email: number;
    };
  };
  trends: {
    viewsGrowth: number;
    engagementGrowth: number;
    conversionGrowth: number;
  };
  experiments?: {
    active: boolean;
    experimentId?: string;
    variants?: Array<{
      id: string;
      name: string;
      views: number;
      conversionRate: number;
    }>;
  };
}

export interface PostTimeSeriesData {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  granularity: 'hour' | 'day' | 'week';
  data: Array<{
    timestamp: string;
    views: number;
    uniqueVisitors: number;
    engagementTime: number;
    scrollDepth: number;
    ctaClicks: number;
    bounceRate: number;
    conversionRate: number;
  }>;
}

export interface PostReferrersData {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  referrers: Array<{
    source: string;
    visits: number;
    percentage: number;
    growthRate: number;
    conversionRate: number;
  }>;
  categories: {
    organic: number;
    social: number;
    direct: number;
    referral: number;
    email: number;
  };
}

export interface RequestContext {
  session?: {
    userId?: string;
    role?: string;
  };
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class PostAnalyticsService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private jobQueue: Queue
  ) {}

  // ========================================
  // EVENT TRACKING METHODS
  // ========================================

  /**
   * Track post view event
   */
  async trackPostView(
    input: TrackPostViewInput,
    context: RequestContext
  ): Promise<{ eventId: string; tracked: boolean }> {
    try {
      // Check if post exists
      const post = await this.prisma.post.findUnique({
        where: { id: input.postId },
        select: { id: true, status: true },
      });

      if (!post || post.status !== 'PUBLISHED') {
        return { eventId: '', tracked: false };
      }

      // Create idempotency key for unique session/post combination
      const idempotencyKey = `post_view:${input.postId}:${input.sessionId}`;
      
      // Check for existing view in this session
      const existingView = await this.redis.get(idempotencyKey);
      if (existingView) {
        return JSON.parse(existingView);
      }

      // Track the event
      const event = await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_VIEWED,
          source: 'web',
          actorType: input.userId ? 'user' : null,
          actorId: input.userId || null,
          postId: input.postId,
          sessionId: input.sessionId,
          propsJson: {
            experimentId: input.experimentId,
            variantId: input.variantId,
            ...input.metadata,
          },
          occurredAt: new Date(),
        },
      });

      // Create attribution if provided
      if (input.attribution) {
        await this.prisma.attribution.create({
          data: {
            eventId: event.id,
            ...input.attribution,
            deviceType: context.deviceType,
            browser: context.browser,
            os: context.os,
          },
        });
      }

      // Cache result for 30 minutes to prevent duplicate views in same session
      const result = { eventId: event.id, tracked: true };
      await this.redis.setex(idempotencyKey, 1800, JSON.stringify(result));

      // Increment view count on post (optimistic)
      await this.prisma.post.update({
        where: { id: input.postId },
        data: { viewCount: { increment: 1 } },
      });

      return result;
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to track post view:', error);
      return { eventId: '', tracked: false };
    }
  }

  /**
   * Track engagement time
   */
  async trackEngagementTime(
    input: TrackEngagementTimeInput,
    context: RequestContext
  ): Promise<{ eventId: string; tracked: boolean }> {
    try {
      // Only track significant engagement (>5 seconds)
      if (input.engagementTimeSeconds < 5) {
        return { eventId: '', tracked: false };
      }

      const event = await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_ENGAGEMENT_TIME,
          source: 'web',
          actorType: input.userId ? 'user' : null,
          actorId: input.userId || null,
          postId: input.postId,
          sessionId: input.sessionId,
          propsJson: {
            engagementTimeSeconds: input.engagementTimeSeconds,
            cumulativeTime: input.cumulativeTime,
            isActiveTime: input.isActiveTime,
            ...input.metadata,
          },
          occurredAt: new Date(),
        },
      });

      return { eventId: event.id, tracked: true };
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to track engagement time:', error);
      return { eventId: '', tracked: false };
    }
  }

  /**
   * Track scroll depth milestones
   */
  async trackScrollDepth(
    input: TrackScrollDepthInput,
    context: RequestContext
  ): Promise<{ eventId: string; tracked: boolean }> {
    try {
      // Create idempotency key for this milestone
      const idempotencyKey = input.milestone 
        ? `scroll_${input.milestone}:${input.postId}:${input.sessionId}`
        : null;
      
      if (idempotencyKey) {
        const existing = await this.redis.get(idempotencyKey);
        if (existing) {
          return JSON.parse(existing);
        }
      }

      const event = await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_SCROLL_DEPTH,
          source: 'web',
          actorType: input.userId ? 'user' : null,
          actorId: input.userId || null,
          postId: input.postId,
          sessionId: input.sessionId,
          propsJson: {
            scrollDepthPercentage: input.scrollDepthPercentage,
            maxScrollDepth: input.maxScrollDepth,
            milestone: input.milestone,
            ...input.metadata,
          },
          occurredAt: new Date(),
        },
      });

      const result = { eventId: event.id, tracked: true };

      // Cache milestone achievement
      if (idempotencyKey) {
        await this.redis.setex(idempotencyKey, 3600, JSON.stringify(result));
      }

      return result;
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to track scroll depth:', error);
      return { eventId: '', tracked: false };
    }
  }

  /**
   * Track CTA clicks
   */
  async trackCtaClick(
    input: TrackCtaClickInput,
    context: RequestContext
  ): Promise<{ eventId: string; tracked: boolean }> {
    try {
      const event = await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_CTA_CLICKED,
          source: 'web',
          actorType: input.userId ? 'user' : null,
          actorId: input.userId || null,
          postId: input.postId,
          sessionId: input.sessionId,
          propsJson: {
            ctaId: input.ctaId,
            ctaType: input.ctaType,
            ctaText: input.ctaText,
            ctaPosition: input.ctaPosition,
            destinationUrl: input.destinationUrl,
            conversionValue: input.conversionValue,
            ...input.metadata,
          },
          occurredAt: new Date(),
        },
      });

      return { eventId: event.id, tracked: true };
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to track CTA click:', error);
      return { eventId: '', tracked: false };
    }
  }

  // ========================================
  // ANALYTICS RETRIEVAL METHODS
  // ========================================

  /**
   * Get comprehensive post analytics overview
   */
  async getPostAnalytics(
    input: GetPostAnalyticsInput
  ): Promise<PostAnalyticsOverview> {
    try {
      const { start, end } = this.getDateRange(input.dateRange);
      const cacheKey = `post_analytics:${input.postId}:${start.toISOString()}:${end.toISOString()}`;
      
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get daily metrics for the period
      const dailyMetrics = await this.prisma.postDailyMetrics.findMany({
        where: {
          postId: input.postId,
          date: { gte: start, lte: end },
        },
        orderBy: { date: 'asc' },
      });

      // Calculate aggregated metrics
      const totalViews = dailyMetrics.reduce((sum, m) => sum + m.views, 0);
      const uniqueVisitors = dailyMetrics.reduce((sum, m) => sum + m.uniqueVisitors, 0);
      const avgEngagementTimeSeconds = dailyMetrics.length > 0
        ? dailyMetrics.reduce((sum, m) => sum + m.avgEngagementTimeSeconds, 0) / dailyMetrics.length
        : 0;
      const avgScrollDepthPercentage = dailyMetrics.length > 0
        ? dailyMetrics.reduce((sum, m) => sum + m.avgScrollDepthPercentage, 0) / dailyMetrics.length
        : 0;
      const ctaClicks = dailyMetrics.reduce((sum, m) => sum + m.ctaClicks, 0);
      const bounceRate = dailyMetrics.length > 0
        ? dailyMetrics.reduce((sum, m) => sum + m.bounceRate, 0) / dailyMetrics.length
        : 0;
      const conversionRate = dailyMetrics.length > 0
        ? dailyMetrics.reduce((sum, m) => sum + m.conversionRate, 0) / dailyMetrics.length
        : 0;

      // Aggregate referrers, CTA types, and breakdowns
      const topReferrers = this.aggregateTopReferrers(dailyMetrics);
      const topCtaTypes = this.aggregateTopCtaTypes(dailyMetrics);
      const deviceBreakdown = this.aggregateDeviceBreakdown(dailyMetrics);
      const sourceBreakdown = this.aggregateSourceBreakdown(dailyMetrics);

      // Calculate growth trends (compare with previous period)
      const previousPeriod = this.getPreviousPeriod(start, end);
      const trends = await this.calculateTrends(input.postId, { start, end }, previousPeriod);

      // Check for active experiments
      const experiments = input.includeExperiments
        ? await this.getActiveExperiments(input.postId)
        : undefined;

      const result: PostAnalyticsOverview = {
        postId: input.postId,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        metrics: {
          totalViews,
          uniqueVisitors,
          avgEngagementTimeSeconds,
          avgScrollDepthPercentage,
          ctaClicks,
          bounceRate,
          conversionRate,
          topReferrers,
          topCtaTypes,
          deviceBreakdown,
          sourceBreakdown,
        },
        trends,
        experiments,
      };

      // Cache for 10 minutes
      await this.redis.setex(cacheKey, 600, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to get post analytics:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve post analytics',
      });
    }
  }

  /**
   * Get time series data for charts
   */
  async getPostTimeSeries(
    input: GetPostTimeSeriesInput
  ): Promise<PostTimeSeriesData> {
    try {
      const { start, end } = this.getDateRange(input.dateRange);
      const cacheKey = `post_timeseries:${input.postId}:${input.granularity}:${start.toISOString()}:${end.toISOString()}`;
      
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // For now, we'll use daily metrics and potentially interpolate for hourly/weekly
      const dailyMetrics = await this.prisma.postDailyMetrics.findMany({
        where: {
          postId: input.postId,
          date: { gte: start, lte: end },
        },
        orderBy: { date: 'asc' },
      });

      const data = dailyMetrics.map(metric => ({
        timestamp: metric.date.toISOString(),
        views: metric.views,
        uniqueVisitors: metric.uniqueVisitors,
        engagementTime: metric.avgEngagementTimeSeconds,
        scrollDepth: metric.avgScrollDepthPercentage,
        ctaClicks: metric.ctaClicks,
        bounceRate: metric.bounceRate,
        conversionRate: metric.conversionRate,
      }));

      const result: PostTimeSeriesData = {
        postId: input.postId,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        granularity: input.granularity,
        data,
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to get time series:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve time series data',
      });
    }
  }

  /**
   * Get referrer analysis
   */
  async getPostReferrers(
    input: GetPostReferrersInput
  ): Promise<PostReferrersData> {
    try {
      const { start, end } = this.getDateRange(input.dateRange);

      // Query attribution data for this post
      const attributionData = await this.prisma.attribution.findMany({
        where: {
          event: {
            postId: input.postId,
            eventType: EVENT_TYPES.POST_VIEWED,
            occurredAt: { gte: start, lte: end },
          },
        },
        include: {
          event: true,
        },
      });

      // Process and categorize referrers
      const referrerMap = new Map<string, { visits: number; conversions: number }>();
      const categories = { organic: 0, social: 0, direct: 0, referral: 0, email: 0 };

      attributionData.forEach(attr => {
        const source = this.categorizeReferrer(attr.referrer, attr.utmSource, attr.utmMedium);
        
        if (!referrerMap.has(source.name)) {
          referrerMap.set(source.name, { visits: 0, conversions: 0 });
        }
        
        referrerMap.get(source.name)!.visits++;
        categories[source.category as keyof typeof categories]++;
      });

      // Convert to sorted array
      const totalVisits = attributionData.length;
      const referrers = Array.from(referrerMap.entries())
        .map(([source, data]) => ({
          source,
          visits: data.visits,
          percentage: totalVisits > 0 ? (data.visits / totalVisits) * 100 : 0,
          growthRate: 0, // TODO: Calculate growth rate
          conversionRate: data.visits > 0 ? (data.conversions / data.visits) * 100 : 0,
        }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, input.limit);

      return {
        postId: input.postId,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        referrers,
        categories,
      };
    } catch (error) {
      console.error('[PostAnalyticsService] Failed to get referrers:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve referrer data',
      });
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private getDateRange(dateRange?: { start: string; end: string }) {
    if (dateRange) {
      return {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end),
      };
    }

    // Default to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private getPreviousPeriod(start: Date, end: Date) {
    const duration = end.getTime() - start.getTime();
    return {
      start: new Date(start.getTime() - duration),
      end: new Date(start.getTime() - 1),
    };
  }

  private async calculateTrends(
    postId: string,
    currentPeriod: { start: Date; end: Date },
    previousPeriod: { start: Date; end: Date }
  ) {
    // Get metrics for both periods
    const [current, previous] = await Promise.all([
      this.prisma.postDailyMetrics.aggregate({
        where: {
          postId,
          date: { gte: currentPeriod.start, lte: currentPeriod.end },
        },
        _sum: { views: true, ctaClicks: true },
        _avg: { avgEngagementTimeSeconds: true, conversionRate: true },
      }),
      this.prisma.postDailyMetrics.aggregate({
        where: {
          postId,
          date: { gte: previousPeriod.start, lte: previousPeriod.end },
        },
        _sum: { views: true, ctaClicks: true },
        _avg: { avgEngagementTimeSeconds: true, conversionRate: true },
      }),
    ]);

    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      viewsGrowth: calculateGrowth(
        current._sum.views || 0,
        previous._sum.views || 0
      ),
      engagementGrowth: calculateGrowth(
        current._avg.avgEngagementTimeSeconds || 0,
        previous._avg.avgEngagementTimeSeconds || 0
      ),
      conversionGrowth: calculateGrowth(
        current._avg.conversionRate || 0,
        previous._avg.conversionRate || 0
      ),
    };
  }

  private aggregateTopReferrers(dailyMetrics: any[]) {
    const referrerMap = new Map<string, number>();
    
    dailyMetrics.forEach(metric => {
      if (metric.topReferrers && Array.isArray(metric.topReferrers)) {
        metric.topReferrers.forEach((ref: any) => {
          const current = referrerMap.get(ref.domain) || 0;
          referrerMap.set(ref.domain, current + ref.visits);
        });
      }
    });

    const total = Array.from(referrerMap.values()).reduce((sum, count) => sum + count, 0);
    
    return Array.from(referrerMap.entries())
      .map(([domain, visits]) => ({
        domain,
        visits,
        percentage: total > 0 ? (visits / total) * 100 : 0,
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);
  }

  private aggregateTopCtaTypes(dailyMetrics: any[]) {
    const ctaMap = new Map<string, { clicks: number; conversions: number }>();
    
    dailyMetrics.forEach(metric => {
      if (metric.topCtaTypes && Array.isArray(metric.topCtaTypes)) {
        metric.topCtaTypes.forEach((cta: any) => {
          const current = ctaMap.get(cta.type) || { clicks: 0, conversions: 0 };
          ctaMap.set(cta.type, {
            clicks: current.clicks + cta.clicks,
            conversions: current.conversions + (cta.conversions || 0),
          });
        });
      }
    });

    return Array.from(ctaMap.entries())
      .map(([type, data]) => ({
        type,
        clicks: data.clicks,
        conversionRate: data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);
  }

  private aggregateDeviceBreakdown(dailyMetrics: any[]) {
    const totals = { desktop: 0, mobile: 0, tablet: 0 };
    
    dailyMetrics.forEach(metric => {
      if (metric.deviceBreakdown) {
        totals.desktop += metric.deviceBreakdown.desktop || 0;
        totals.mobile += metric.deviceBreakdown.mobile || 0;
        totals.tablet += metric.deviceBreakdown.tablet || 0;
      }
    });

    return totals;
  }

  private aggregateSourceBreakdown(dailyMetrics: any[]) {
    const totals = { organic: 0, social: 0, direct: 0, referral: 0, email: 0 };
    
    dailyMetrics.forEach(metric => {
      if (metric.sourceBreakdown) {
        totals.organic += metric.sourceBreakdown.organic || 0;
        totals.social += metric.sourceBreakdown.social || 0;
        totals.direct += metric.sourceBreakdown.direct || 0;
        totals.referral += metric.sourceBreakdown.referral || 0;
        totals.email += metric.sourceBreakdown.email || 0;
      }
    });

    return totals;
  }

  private async getActiveExperiments(postId: string) {
    const experiments = await this.prisma.postExperiment.findMany({
      where: {
        status: 'ACTIVE',
        postTargets: {
          some: { postId },
        },
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      include: {
        variants: true,
      },
    });

    if (experiments.length === 0) {
      return { active: false };
    }

    const experiment = experiments[0]; // For now, assume one experiment per post
    
    return {
      active: true,
      experimentId: experiment.id,
      variants: experiment.variants.map(variant => ({
        id: variant.id,
        name: variant.name,
        views: 0, // TODO: Calculate from daily metrics
        conversionRate: 0, // TODO: Calculate from daily metrics
      })),
    };
  }

  private categorizeReferrer(referrer?: string | null, utmSource?: string | null, utmMedium?: string | null) {
    // Default category
    let category = 'direct';
    let name = 'Direct';

    if (utmMedium) {
      if (utmMedium.includes('email')) {
        category = 'email';
        name = utmSource || 'Email';
      } else if (utmMedium.includes('social')) {
        category = 'social';
        name = utmSource || 'Social Media';
      } else if (utmMedium.includes('organic')) {
        category = 'organic';
        name = utmSource || 'Organic Search';
      }
    } else if (referrer) {
      try {
        const domain = new URL(referrer).hostname.replace('www.', '');
        
        if (domain.includes('google.') || domain.includes('bing.') || domain.includes('yahoo.')) {
          category = 'organic';
          name = domain;
        } else if (domain.includes('facebook.') || domain.includes('twitter.') || domain.includes('linkedin.') || domain.includes('instagram.')) {
          category = 'social';
          name = domain;
        } else {
          category = 'referral';
          name = domain;
        }
      } catch {
        category = 'referral';
        name = referrer;
      }
    }

    return { category, name };
  }
}
