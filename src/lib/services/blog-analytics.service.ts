/**
 * Blog Analytics Service
 * 
 * Provides comprehensive analytics for blog posts including:
 * - Average read time calculation
 * - Bounce rate tracking
 * - Social share aggregation
 * - Email capture rate monitoring
 * - Performance dashboard data
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { redis } from '@/lib/redis';
import { EVENT_TYPES } from '@/lib/constants/event-types';

export interface PostPerformanceMetrics {
  postId: string;
  title: string;
  slug: string;
  publishedAt: Date | null;
  totalViews: number;
  uniqueVisitors: number;
  avgReadTimeSeconds: number;
  bounceRate: number;
  socialSharesCount: number;
  emailCaptureCount: number;
  emailCaptureRate: number;
  lastCalculatedAt: Date;
}

export interface SocialShareBreakdown {
  platform: string;
  shareCount: number;
  lastSharedAt: Date | null;
}

export interface ReferrerSource {
  source: string;
  category: 'direct' | 'organic' | 'social' | 'email' | 'referral';
  visitors: number;
  percentage: number;
}

export interface PostAnalyticsDetail extends PostPerformanceMetrics {
  socialShareBreakdown: SocialShareBreakdown[];
  referrerSources: ReferrerSource[];
  dailyTrend: {
    date: string;
    views: number;
    uniqueVisitors: number;
    engagementTime: number;
    bounceRate: number;
    emailCaptures: number;
  }[];
}

export interface BlogPerformanceDashboard {
  totalPosts: number;
  totalViews: number;
  totalUniqueVisitors: number;
  avgBounceRate: number;
  avgEmailCaptureRate: number;
  topPerformingPosts: PostPerformanceMetrics[];
  recentPosts: PostPerformanceMetrics[];
  performanceComparison: {
    thisMonth: {
      views: number;
      uniqueVisitors: number;
      avgReadTime: number;
      emailCaptures: number;
    };
    lastMonth: {
      views: number;
      uniqueVisitors: number;
      avgReadTime: number;
      emailCaptures: number;
    };
  };
}

export class BlogAnalyticsService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BOUNCE_THRESHOLD_SECONDS = 15;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Calculate and update performance metrics for a specific post
   */
  async calculatePostMetrics(postId: string): Promise<PostPerformanceMetrics> {
    const cacheKey = `post_metrics:${postId}`;
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get post basic info
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          title: true,
          slug: true,
          publishedAt: true,
          viewCount: true,
          uniqueVisitors: true,
          avgReadTimeSeconds: true,
          bounceRate: true,
          socialSharesCount: true,
          emailCaptureCount: true,
          emailCaptureRate: true,
          updatedAt: true,
        },
      });

      if (!post) {
        throw new Error(`Post with ID ${postId} not found`);
      }

      // Calculate average read time
      const avgReadTime = await this.calculateAverageReadTime(postId);
      
      // Calculate bounce rate
      const bounceRate = await this.calculateBounceRate(postId);
      
      // Calculate social shares
      const socialShares = await this.calculateSocialShares(postId);
      
      // Calculate email capture metrics
      const emailMetrics = await this.calculateEmailCaptureMetrics(postId);

      const metrics: PostPerformanceMetrics = {
        postId: post.id,
        title: post.title,
        slug: post.slug,
        publishedAt: post.publishedAt,
        totalViews: post.viewCount,
        uniqueVisitors: post.uniqueVisitors,
        avgReadTimeSeconds: avgReadTime,
        bounceRate: bounceRate,
        socialSharesCount: socialShares.total,
        emailCaptureCount: emailMetrics.count,
        emailCaptureRate: emailMetrics.rate,
        lastCalculatedAt: new Date(),
      };

      // Update post table with calculated metrics
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          avgReadTimeSeconds: avgReadTime,
          bounceRate: bounceRate,
          socialSharesCount: socialShares.total,
          emailCaptureCount: emailMetrics.count,
          emailCaptureRate: emailMetrics.rate,
        },
      });

      // Cache the result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      console.error(`Error calculating metrics for post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate average read time from engagement events
   */
  private async calculateAverageReadTime(postId: string): Promise<number> {
    const engagementEvents = await this.prisma.event.findMany({
      where: {
        postId,
        eventType: EVENT_TYPES.POST_ENGAGEMENT_TIME,
      },
      select: {
        propsJson: true,
      },
    });

    if (engagementEvents.length === 0) {
      return 0;
    }

    const engagementTimes = engagementEvents
      .map((event) => {
        const props = event.propsJson as any;
        return props?.engagementTimeSeconds || 0;
      })
      .filter((time) => time > 0 && time < 1800); // Filter outliers (0 to 30 minutes)

    if (engagementTimes.length === 0) {
      return 0;
    }

    return engagementTimes.reduce((sum, time) => sum + time, 0) / engagementTimes.length;
  }

  /**
   * Calculate bounce rate based on session data
   */
  private async calculateBounceRate(postId: string): Promise<number> {
    // Get all sessions that viewed this post
    const postViews = await this.prisma.event.findMany({
      where: {
        postId,
        eventType: EVENT_TYPES.POST_VIEWED,
      },
      select: {
        sessionId: true,
        occurredAt: true,
      },
    });

    if (postViews.length === 0) {
      return 0;
    }

    const sessionIds = [...new Set(postViews.map(view => view.sessionId).filter(Boolean))];
    
    let bounces = 0;

    for (const sessionId of sessionIds) {
      if (!sessionId) continue;

      // Get all events in this session for this post
      const sessionEvents = await this.prisma.event.findMany({
        where: {
          sessionId,
          postId,
        },
        orderBy: {
          occurredAt: 'asc',
        },
        select: {
          eventType: true,
          occurredAt: true,
          propsJson: true,
        },
      });

      if (sessionEvents.length === 0) continue;

      const firstEvent = sessionEvents[0];
      const lastEvent = sessionEvents[sessionEvents.length - 1];
      
      // Calculate session duration
      const sessionDuration = (lastEvent.occurredAt.getTime() - firstEvent.occurredAt.getTime()) / 1000;
      
      // Check if it's a bounce (short session with minimal engagement)
      const hasEngagement = sessionEvents.some(event => 
        event.eventType === EVENT_TYPES.POST_SCROLL_DEPTH ||
        event.eventType === EVENT_TYPES.POST_CTA_CLICKED ||
        event.eventType === EVENT_TYPES.POST_SHARED
      );

      if (sessionDuration <= this.BOUNCE_THRESHOLD_SECONDS && !hasEngagement) {
        bounces++;
      }
    }

    return sessionIds.length > 0 ? (bounces / sessionIds.length) * 100 : 0;
  }

  /**
   * Calculate social share totals and breakdown
   */
  private async calculateSocialShares(postId: string): Promise<{ total: number; breakdown: SocialShareBreakdown[] }> {
    const socialShares = await this.prisma.postSocialShare.findMany({
      where: { postId },
      select: {
        platform: true,
        shareCount: true,
        lastSharedAt: true,
      },
    });

    const total = socialShares.reduce((sum, share) => sum + share.shareCount, 0);
    const breakdown: SocialShareBreakdown[] = socialShares.map(share => ({
      platform: share.platform,
      shareCount: share.shareCount,
      lastSharedAt: share.lastSharedAt,
    }));

    return { total, breakdown };
  }

  /**
   * Calculate email capture metrics
   */
  private async calculateEmailCaptureMetrics(postId: string): Promise<{ count: number; rate: number }> {
    const emailCaptureEvents = await this.prisma.event.findMany({
      where: {
        postId,
        eventType: EVENT_TYPES.POST_EMAIL_CAPTURE,
      },
    });

    const postViews = await this.prisma.event.groupBy({
      by: ['sessionId'],
      where: {
        postId,
        eventType: EVENT_TYPES.POST_VIEWED,
        sessionId: { not: null },
      },
    });

    const count = emailCaptureEvents.length;
    const uniqueVisitors = postViews.length;
    const rate = uniqueVisitors > 0 ? (count / uniqueVisitors) * 100 : 0;

    return { count, rate };
  }

  /**
   * Get detailed analytics for a specific post
   */
  async getPostAnalyticsDetail(postId: string, dateRange?: { start: Date; end: Date }): Promise<PostAnalyticsDetail> {
    const baseMetrics = await this.calculatePostMetrics(postId);
    
    // Get social share breakdown
    const socialShareData = await this.calculateSocialShares(postId);
    
    // Get referrer sources
    const referrerSources = await this.getReferrerSources(postId, dateRange);
    
    // Get daily trend data
    const dailyTrend = await this.getDailyTrend(postId, dateRange);

    return {
      ...baseMetrics,
      socialShareBreakdown: socialShareData.breakdown,
      referrerSources,
      dailyTrend,
    };
  }

  /**
   * Get referrer source breakdown
   */
  private async getReferrerSources(postId: string, dateRange?: { start: Date; end: Date }): Promise<ReferrerSource[]> {
    const whereCondition: any = {
      postId,
      eventType: EVENT_TYPES.POST_VIEWED,
    };

    if (dateRange) {
      whereCondition.occurredAt = {
        gte: dateRange.start,
        lte: dateRange.end,
      };
    }

    const events = await this.prisma.event.findMany({
      where: whereCondition,
      include: {
        attribution: true,
      },
    });

    const referrerMap = new Map<string, number>();
    let totalVisitors = 0;

    events.forEach(event => {
      totalVisitors++;
      
      let source = 'direct';
      let category: ReferrerSource['category'] = 'direct';

      if (event.attribution?.referrer) {
        const referrer = event.attribution.referrer.toLowerCase();
        
        if (referrer.includes('google') || referrer.includes('bing') || referrer.includes('yahoo')) {
          source = 'organic search';
          category = 'organic';
        } else if (referrer.includes('facebook') || referrer.includes('twitter') || referrer.includes('linkedin')) {
          source = 'social media';
          category = 'social';
        } else if (event.attribution.utmMedium === 'email') {
          source = 'email';
          category = 'email';
        } else {
          source = new URL(referrer).hostname;
          category = 'referral';
        }
      }

      referrerMap.set(source, (referrerMap.get(source) || 0) + 1);
    });

    return Array.from(referrerMap.entries()).map(([source, visitors]) => ({
      source,
      category: this.categorizeSource(source),
      visitors,
      percentage: totalVisitors > 0 ? (visitors / totalVisitors) * 100 : 0,
    })).sort((a, b) => b.visitors - a.visitors);
  }

  /**
   * Categorize traffic source
   */
  private categorizeSource(source: string): ReferrerSource['category'] {
    const lowerSource = source.toLowerCase();
    
    if (lowerSource.includes('google') || lowerSource.includes('bing') || lowerSource.includes('search')) {
      return 'organic';
    }
    if (lowerSource.includes('facebook') || lowerSource.includes('twitter') || lowerSource.includes('social')) {
      return 'social';
    }
    if (lowerSource.includes('email') || lowerSource.includes('newsletter')) {
      return 'email';
    }
    if (lowerSource === 'direct') {
      return 'direct';
    }
    
    return 'referral';
  }

  /**
   * Get daily trend data for a post
   */
  private async getDailyTrend(
    postId: string, 
    dateRange?: { start: Date; end: Date }
  ): Promise<PostAnalyticsDetail['dailyTrend']> {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30); // Last 30 days
    
    const start = dateRange?.start || defaultStart;
    const end = dateRange?.end || new Date();

    const dailyMetrics = await this.prisma.postDailyMetrics.findMany({
      where: {
        postId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        date: 'asc',
      },
      select: {
        date: true,
        views: true,
        uniqueVisitors: true,
        avgEngagementTimeSeconds: true,
        bounceRate: true,
        emailCaptures: true,
      },
    });

    return dailyMetrics.map(metric => ({
      date: metric.date.toISOString().split('T')[0],
      views: metric.views,
      uniqueVisitors: metric.uniqueVisitors,
      engagementTime: metric.avgEngagementTimeSeconds,
      bounceRate: metric.bounceRate,
      emailCaptures: metric.emailCaptures,
    }));
  }

  /**
   * Get blog performance dashboard data
   */
  async getBlogPerformanceDashboard(): Promise<BlogPerformanceDashboard> {
    const cacheKey = 'blog_dashboard';
    
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get basic stats
      const totalPosts = await this.prisma.post.count({
        where: { status: 'PUBLISHED', deletedAt: null },
      });

      // Get aggregate metrics
      const aggregateMetrics = await this.prisma.post.aggregate({
        where: { status: 'PUBLISHED', deletedAt: null },
        _sum: {
          viewCount: true,
          uniqueVisitors: true,
          emailCaptureCount: true,
        },
        _avg: {
          bounceRate: true,
          emailCaptureRate: true,
        },
      });

      // Get top performing posts
      const topPerformingPosts = await this.prisma.post.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        orderBy: [
          { viewCount: 'desc' },
          { socialSharesCount: 'desc' },
        ],
        take: 10,
        select: {
          id: true,
          title: true,
          slug: true,
          publishedAt: true,
          viewCount: true,
          uniqueVisitors: true,
          avgReadTimeSeconds: true,
          bounceRate: true,
          socialSharesCount: true,
          emailCaptureCount: true,
          emailCaptureRate: true,
          updatedAt: true,
        },
      });

      // Get recent posts
      const recentPosts = await this.prisma.post.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          slug: true,
          publishedAt: true,
          viewCount: true,
          uniqueVisitors: true,
          avgReadTimeSeconds: true,
          bounceRate: true,
          socialSharesCount: true,
          emailCaptureCount: true,
          emailCaptureRate: true,
          updatedAt: true,
        },
      });

      // Get performance comparison data
      const thisMonth = new Date();
      thisMonth.setDate(1);
      const lastMonth = new Date(thisMonth);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const [thisMonthMetrics, lastMonthMetrics] = await Promise.all([
        this.getMonthlyMetrics(thisMonth),
        this.getMonthlyMetrics(lastMonth),
      ]);

      const dashboard: BlogPerformanceDashboard = {
        totalPosts,
        totalViews: aggregateMetrics._sum.viewCount || 0,
        totalUniqueVisitors: aggregateMetrics._sum.uniqueVisitors || 0,
        avgBounceRate: aggregateMetrics._avg.bounceRate || 0,
        avgEmailCaptureRate: aggregateMetrics._avg.emailCaptureRate || 0,
        topPerformingPosts: topPerformingPosts.map(post => ({
          postId: post.id,
          title: post.title,
          slug: post.slug,
          publishedAt: post.publishedAt,
          totalViews: post.viewCount,
          uniqueVisitors: post.uniqueVisitors,
          avgReadTimeSeconds: post.avgReadTimeSeconds,
          bounceRate: post.bounceRate,
          socialSharesCount: post.socialSharesCount,
          emailCaptureCount: post.emailCaptureCount,
          emailCaptureRate: post.emailCaptureRate,
          lastCalculatedAt: post.updatedAt,
        })),
        recentPosts: recentPosts.map(post => ({
          postId: post.id,
          title: post.title,
          slug: post.slug,
          publishedAt: post.publishedAt,
          totalViews: post.viewCount,
          uniqueVisitors: post.uniqueVisitors,
          avgReadTimeSeconds: post.avgReadTimeSeconds,
          bounceRate: post.bounceRate,
          socialSharesCount: post.socialSharesCount,
          emailCaptureCount: post.emailCaptureCount,
          emailCaptureRate: post.emailCaptureRate,
          lastCalculatedAt: post.updatedAt,
        })),
        performanceComparison: {
          thisMonth: thisMonthMetrics,
          lastMonth: lastMonthMetrics,
        },
      };

      // Cache for 10 minutes
      await this.redis.setex(cacheKey, 600, JSON.stringify(dashboard));

      return dashboard;
    } catch (error) {
      console.error('Error generating blog dashboard:', error);
      throw error;
    }
  }

  /**
   * Get monthly metrics for comparison
   */
  private async getMonthlyMetrics(startOfMonth: Date) {
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const monthlyData = await this.prisma.postDailyMetrics.aggregate({
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      _sum: {
        views: true,
        uniqueVisitors: true,
        emailCaptures: true,
      },
      _avg: {
        avgEngagementTimeSeconds: true,
      },
    });

    return {
      views: monthlyData._sum.views || 0,
      uniqueVisitors: monthlyData._sum.uniqueVisitors || 0,
      avgReadTime: monthlyData._avg.avgEngagementTimeSeconds || 0,
      emailCaptures: monthlyData._sum.emailCaptures || 0,
    };
  }

  /**
   * Recalculate metrics for all posts (for batch processing)
   */
  async recalculateAllMetrics(): Promise<void> {
    const posts = await this.prisma.post.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: { id: true },
    });

    for (const post of posts) {
      try {
        await this.calculatePostMetrics(post.id);
        // Add small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to recalculate metrics for post ${post.id}:`, error);
      }
    }
  }

  /**
   * Invalidate cache for a specific post
   */
  async invalidatePostCache(postId: string): Promise<void> {
    const cacheKey = `post_metrics:${postId}`;
    await this.redis.del(cacheKey);
    await this.redis.del('blog_dashboard');
  }
}
