/**
 * Blog Event Tracking Service
 * 
 * Handles event tracking specifically for blog posts including:
 * - Post view events with session tracking
 * - Scroll depth tracking
 * - Engagement time measurement
 * - Social share event logging
 * - Email capture event tracking
 * - Bounce detection
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { redis } from '@/lib/redis';
import { EVENT_TYPES, EVENT_SOURCES, ACTOR_TYPES } from '@/lib/constants/event-types';

export interface PostViewEvent {
  postId: string;
  sessionId: string;
  userId?: string;
  referrer?: string;
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  deviceInfo?: {
    type: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
  };
  ipAddress?: string;
}

export interface EngagementEvent {
  postId: string;
  sessionId: string;
  engagementTimeSeconds: number;
  scrollDepthPercentage?: number;
  userId?: string;
}

export interface SocialShareEvent {
  postId: string;
  platform: 'twitter' | 'facebook' | 'linkedin' | 'pinterest' | 'reddit' | 'email' | 'copy_link';
  sessionId: string;
  userId?: string;
}

export interface EmailCaptureEvent {
  postId: string;
  sessionId: string;
  email: string;
  captureLocation: 'sidebar' | 'inline' | 'popup' | 'footer' | 'header';
  userId?: string;
}

export interface ScrollDepthEvent {
  postId: string;
  sessionId: string;
  depthPercentage: number;
  timeToReachMs: number;
  userId?: string;
}

export class BlogEventTrackingService {
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Track a post view event
   */
  async trackPostView(eventData: PostViewEvent): Promise<void> {
    try {
      // Check if this is a unique visitor for today
      const today = new Date().toISOString().split('T')[0];
      const uniqueVisitorKey = `unique_visitor:${eventData.postId}:${today}:${eventData.sessionId}`;
      const isUniqueToday = !(await this.redis.exists(uniqueVisitorKey));

      // Create the view event
      const event = await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_VIEWED,
          source: EVENT_SOURCES.WEB,
          actorType: eventData.userId ? ACTOR_TYPES.USER : undefined,
          actorId: eventData.userId,
          postId: eventData.postId,
          sessionId: eventData.sessionId,
          propsJson: {
            isUniqueToday,
            userAgent: eventData.deviceInfo,
            ipAddress: eventData.ipAddress,
          },
        },
      });

      // Create attribution data if referrer or UTM params exist
      if (eventData.referrer || eventData.utmParams) {
        await this.prisma.attribution.create({
          data: {
            eventId: event.id,
            referrer: eventData.referrer,
            utmSource: eventData.utmParams?.source,
            utmMedium: eventData.utmParams?.medium,
            utmCampaign: eventData.utmParams?.campaign,
            utmTerm: eventData.utmParams?.term,
            utmContent: eventData.utmParams?.content,
            deviceType: eventData.deviceInfo?.type,
            browser: eventData.deviceInfo?.browser,
            os: eventData.deviceInfo?.os,
          },
        });
      }

      // Mark as unique visitor for today (expires after 25 hours)
      if (isUniqueToday) {
        await this.redis.setex(uniqueVisitorKey, 25 * 60 * 60, '1');
        
        // Increment post view count
        await this.prisma.post.update({
          where: { id: eventData.postId },
          data: { 
            viewCount: { increment: 1 },
          },
        });
      }

      // Track session start if this is the first event in the session
      await this.trackSessionStart(eventData.postId, eventData.sessionId, eventData.userId);

    } catch (error) {
      console.error('Error tracking post view:', error);
      throw error;
    }
  }

  /**
   * Track engagement time and scroll depth
   */
  async trackEngagement(eventData: EngagementEvent): Promise<void> {
    try {
      await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_ENGAGEMENT_TIME,
          source: EVENT_SOURCES.WEB,
          actorType: eventData.userId ? ACTOR_TYPES.USER : undefined,
          actorId: eventData.userId,
          postId: eventData.postId,
          sessionId: eventData.sessionId,
          propsJson: {
            engagementTimeSeconds: eventData.engagementTimeSeconds,
            scrollDepthPercentage: eventData.scrollDepthPercentage,
          },
        },
      });

      // Update session tracking
      await this.updateSessionActivity(eventData.sessionId);

    } catch (error) {
      console.error('Error tracking engagement:', error);
      throw error;
    }
  }

  /**
   * Track scroll depth milestones
   */
  async trackScrollDepth(eventData: ScrollDepthEvent): Promise<void> {
    try {
      // Check if this milestone was already tracked for this session
      const milestoneKey = `scroll_milestone:${eventData.sessionId}:${eventData.postId}:${eventData.depthPercentage}`;
      const alreadyTracked = await this.redis.exists(milestoneKey);

      if (!alreadyTracked) {
        await this.prisma.event.create({
          data: {
            eventType: EVENT_TYPES.POST_SCROLL_DEPTH,
            source: EVENT_SOURCES.WEB,
            actorType: eventData.userId ? ACTOR_TYPES.USER : undefined,
            actorId: eventData.userId,
            postId: eventData.postId,
            sessionId: eventData.sessionId,
            propsJson: {
              depthPercentage: eventData.depthPercentage,
              timeToReachMs: eventData.timeToReachMs,
            },
          },
        });

        // Mark this milestone as tracked (expires after 1 hour)
        await this.redis.setex(milestoneKey, 60 * 60, '1');

        // Track read completion milestone
        if (eventData.depthPercentage >= 90) {
          await this.trackReadCompletion(eventData.postId, eventData.sessionId, eventData.userId);
        }
      }
    } catch (error) {
      console.error('Error tracking scroll depth:', error);
      throw error;
    }
  }

  /**
   * Track social media shares
   */
  async trackSocialShare(eventData: SocialShareEvent): Promise<void> {
    try {
      // Create the share event
      await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED,
          source: EVENT_SOURCES.WEB,
          actorType: eventData.userId ? ACTOR_TYPES.USER : undefined,
          actorId: eventData.userId,
          postId: eventData.postId,
          sessionId: eventData.sessionId,
          propsJson: {
            platform: eventData.platform,
          },
        },
      });

      // Update or create social share record
      await this.prisma.postSocialShare.upsert({
        where: {
          postId_platform: {
            postId: eventData.postId,
            platform: eventData.platform,
          },
        },
        create: {
          postId: eventData.postId,
          platform: eventData.platform,
          shareCount: 1,
          lastSharedAt: new Date(),
        },
        update: {
          shareCount: { increment: 1 },
          lastSharedAt: new Date(),
        },
      });

      // Update post total share count
      const totalShares = await this.prisma.postSocialShare.aggregate({
        where: { postId: eventData.postId },
        _sum: { shareCount: true },
      });

      await this.prisma.post.update({
        where: { id: eventData.postId },
        data: { socialSharesCount: totalShares._sum.shareCount || 0 },
      });

    } catch (error) {
      console.error('Error tracking social share:', error);
      throw error;
    }
  }

  /**
   * Track email capture events
   */
  async trackEmailCapture(eventData: EmailCaptureEvent): Promise<void> {
    try {
      await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_EMAIL_CAPTURE,
          source: EVENT_SOURCES.WEB,
          actorType: eventData.userId ? ACTOR_TYPES.USER : undefined,
          actorId: eventData.userId,
          postId: eventData.postId,
          sessionId: eventData.sessionId,
          propsJson: {
            email: eventData.email,
            captureLocation: eventData.captureLocation,
          },
        },
      });

      // Update post email capture count
      await this.prisma.post.update({
        where: { id: eventData.postId },
        data: { emailCaptureCount: { increment: 1 } },
      });

    } catch (error) {
      console.error('Error tracking email capture:', error);
      throw error;
    }
  }

  /**
   * Track session start
   */
  private async trackSessionStart(postId: string, sessionId: string, userId?: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;
    const sessionExists = await this.redis.exists(sessionKey);

    if (!sessionExists) {
      await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_SESSION_START,
          source: EVENT_SOURCES.WEB,
          actorType: userId ? ACTOR_TYPES.USER : undefined,
          actorId: userId,
          postId,
          sessionId,
          propsJson: {
            sessionStart: true,
          },
        },
      });

      // Set session expiry
      await this.redis.setex(sessionKey, this.SESSION_TIMEOUT_MS / 1000, JSON.stringify({
        startTime: Date.now(),
        postId,
        userId,
      }));
    }
  }

  /**
   * Track read completion (90%+ scroll depth)
   */
  private async trackReadCompletion(postId: string, sessionId: string, userId?: string): Promise<void> {
    const completionKey = `read_complete:${sessionId}:${postId}`;
    const alreadyCompleted = await this.redis.exists(completionKey);

    if (!alreadyCompleted) {
      await this.prisma.event.create({
        data: {
          eventType: EVENT_TYPES.POST_READ_COMPLETE,
          source: EVENT_SOURCES.WEB,
          actorType: userId ? ACTOR_TYPES.USER : undefined,
          actorId: userId,
          postId,
          sessionId,
          propsJson: {
            readComplete: true,
          },
        },
      });

      // Mark as completed (expires after 1 hour)
      await this.redis.setex(completionKey, 60 * 60, '1');
    }
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;
    const sessionData = await this.redis.get(sessionKey);

    if (sessionData) {
      const session = JSON.parse(sessionData);
      session.lastActivity = Date.now();
      
      // Extend session TTL
      await this.redis.setex(sessionKey, this.SESSION_TIMEOUT_MS / 1000, JSON.stringify(session));
    }
  }

  /**
   * Track session end (called when user leaves page or session times out)
   */
  async trackSessionEnd(postId: string, sessionId: string, userId?: string): Promise<void> {
    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.redis.get(sessionKey);

      if (sessionData) {
        const session = JSON.parse(sessionData);
        const sessionDuration = (Date.now() - session.startTime) / 1000;

        await this.prisma.event.create({
          data: {
            eventType: EVENT_TYPES.POST_SESSION_END,
            source: EVENT_SOURCES.WEB,
            actorType: userId ? ACTOR_TYPES.USER : undefined,
            actorId: userId,
            postId,
            sessionId,
            propsJson: {
              sessionDurationSeconds: sessionDuration,
              sessionEnd: true,
            },
          },
        });

        // Check if this qualifies as a bounce
        if (sessionDuration <= 15 && session.postId === postId) {
          await this.trackBounce(postId, sessionId, userId);
        }

        // Remove session from Redis
        await this.redis.del(sessionKey);
      }
    } catch (error) {
      console.error('Error tracking session end:', error);
      throw error;
    }
  }

  /**
   * Track bounce event
   */
  private async trackBounce(postId: string, sessionId: string, userId?: string): Promise<void> {
    await this.prisma.event.create({
      data: {
        eventType: EVENT_TYPES.POST_BOUNCE,
        source: EVENT_SOURCES.WEB,
        actorType: userId ? ACTOR_TYPES.USER : undefined,
        actorId: userId,
        postId,
        sessionId,
        propsJson: {
          bounce: true,
        },
      },
    });
  }

  /**
   * Batch process events for performance metrics aggregation
   */
  async batchProcessEvents(since: Date): Promise<void> {
    try {
      // Get all posts that had events since the specified date
      const postsWithEvents = await this.prisma.event.findMany({
        where: {
          occurredAt: { gte: since },
          postId: { not: null },
        },
        select: { postId: true },
        distinct: ['postId'],
      });

      // Process each post's events
      for (const { postId } of postsWithEvents) {
        if (postId) {
          await this.aggregatePostMetrics(postId, since);
        }
      }
    } catch (error) {
      console.error('Error batch processing events:', error);
      throw error;
    }
  }

  /**
   * Aggregate daily metrics for a specific post
   */
  private async aggregatePostMetrics(postId: string, since: Date): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all events for this post today
    const events = await this.prisma.event.findMany({
      where: {
        postId,
        occurredAt: {
          gte: new Date(today),
          lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: {
        attribution: true,
      },
    });

    if (events.length === 0) return;

    // Calculate metrics
    const views = events.filter(e => e.eventType === EVENT_TYPES.POST_VIEWED).length;
    const uniqueVisitors = new Set(events.map(e => e.sessionId).filter(Boolean)).size;
    
    const engagementEvents = events.filter(e => e.eventType === EVENT_TYPES.POST_ENGAGEMENT_TIME);
    const totalEngagementTime = engagementEvents.reduce((sum, e) => {
      const props = e.propsJson as any;
      return sum + (props?.engagementTimeSeconds || 0);
    }, 0);
    const avgEngagementTime = engagementEvents.length > 0 ? totalEngagementTime / engagementEvents.length : 0;

    const shares = events.filter(e => e.eventType === EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED).length;
    const emailCaptures = events.filter(e => e.eventType === EVENT_TYPES.POST_EMAIL_CAPTURE).length;
    const bounces = events.filter(e => e.eventType === EVENT_TYPES.POST_BOUNCE).length;
    const bounceRate = uniqueVisitors > 0 ? (bounces / uniqueVisitors) * 100 : 0;
    const emailCaptureRate = uniqueVisitors > 0 ? (emailCaptures / uniqueVisitors) * 100 : 0;

    // Aggregate referrer and device data
    const referrers = events
      .filter(e => e.attribution?.referrer)
      .map(e => e.attribution!.referrer!)
      .reduce((acc: Record<string, number>, referrer) => {
        acc[referrer] = (acc[referrer] || 0) + 1;
        return acc;
      }, {});

    const devices = events
      .filter(e => e.attribution?.deviceType)
      .map(e => e.attribution!.deviceType!)
      .reduce((acc: Record<string, number>, device) => {
        acc[device] = (acc[device] || 0) + 1;
        return acc;
      }, {});

    // Update or create daily metrics
    await this.prisma.postDailyMetrics.upsert({
      where: {
        date_postId: {
          date: new Date(today),
          postId,
        },
      },
      create: {
        date: new Date(today),
        postId,
        views,
        uniqueVisitors,
        totalEngagementTimeSeconds: totalEngagementTime,
        avgEngagementTimeSeconds: avgEngagementTime,
        shares,
        bounceRate,
        emailCaptures,
        emailCaptureRate,
        topReferrers: Object.entries(referrers)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([referrer, count]) => ({ referrer, count })),
        deviceBreakdown: devices,
        sourceBreakdown: this.categorizeReferrers(referrers),
      },
      update: {
        views,
        uniqueVisitors,
        totalEngagementTimeSeconds: totalEngagementTime,
        avgEngagementTimeSeconds: avgEngagementTime,
        shares,
        bounceRate,
        emailCaptures,
        emailCaptureRate,
        topReferrers: Object.entries(referrers)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([referrer, count]) => ({ referrer, count })),
        deviceBreakdown: devices,
        sourceBreakdown: this.categorizeReferrers(referrers),
      },
    });
  }

  /**
   * Categorize referrers into source types
   */
  private categorizeReferrers(referrers: Record<string, number>): Record<string, number> {
    const sources: Record<string, number> = {
      direct: 0,
      organic: 0,
      social: 0,
      email: 0,
      referral: 0,
    };

    Object.entries(referrers).forEach(([referrer, count]) => {
      const lower = referrer.toLowerCase();
      
      if (lower.includes('google') || lower.includes('bing') || lower.includes('search')) {
        sources.organic += count;
      } else if (lower.includes('facebook') || lower.includes('twitter') || lower.includes('social')) {
        sources.social += count;
      } else if (lower.includes('email') || lower.includes('newsletter')) {
        sources.email += count;
      } else if (referrer === 'direct') {
        sources.direct += count;
      } else {
        sources.referral += count;
      }
    });

    return sources;
  }
}
