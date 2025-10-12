/**
 * Email Tracking Service
 * 
 * Processes and stores detailed email tracking events:
 * - Opens (unique and repeat)
 * - Clicks (with link position and URL)
 * - Geographic data
 * - Device and email client information
 * - Real-time analytics aggregation
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import type { EmailEventType } from '@prisma/client';

export interface EmailTrackingEvent {
  messageId: string;
  eventType: EmailEventType;
  email: string;
  userId?: string;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
  clickedUrl?: string;
  metadata?: Record<string, any>;
}

export interface EnrichedTrackingData {
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  emailClient?: string;
  browser?: string;
  os?: string;
  geographic?: {
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

export class EmailTrackingService {
  /**
   * Process an email tracking event from webhook
   */
  async processTrackingEvent(event: EmailTrackingEvent): Promise<void> {
    const enrichedData = this.enrichTrackingData(event);

    // Check if this is a unique open
    const isUniqueOpen = event.eventType === 'OPENED' 
      ? await this.isUniqueOpen(event.messageId, event.email)
      : undefined;

    // Determine link position for clicks
    const linkPosition = event.clickedUrl 
      ? await this.getLinkPosition(event.messageId, event.clickedUrl)
      : undefined;

    // Store event
    await prisma.emailEvent.create({
      data: {
        userId: event.userId,
        email: event.email,
        eventType: event.eventType,
        messageId: event.messageId,
        subject: event.metadata?.subject,
        templateName: event.metadata?.template,
        metadata: event.metadata,
        userAgent: event.userAgent,
        ipAddress: event.ipAddress,
        clickedUrl: event.clickedUrl,
        uniqueOpen: isUniqueOpen,
        linkPosition,
        deviceType: enrichedData.deviceType,
        emailClient: enrichedData.emailClient,
        geographicData: enrichedData.geographic,
        ...(event.eventType === 'SENT' && { sentAt: event.timestamp }),
        ...(event.eventType === 'DELIVERED' && { deliveredAt: event.timestamp }),
        ...(event.eventType === 'OPENED' && { openedAt: event.timestamp }),
        ...(event.eventType === 'CLICKED' && { clickedAt: event.timestamp }),
        ...(event.eventType === 'BOUNCED' && { bouncedAt: event.timestamp }),
        ...(event.eventType === 'COMPLAINED' && { complainedAt: event.timestamp }),
      },
    });

    // Update campaign analytics if this is part of a campaign
    const campaignId = event.metadata?.campaignId as string | undefined;
    if (campaignId) {
      await this.updateCampaignAnalytics(campaignId, event.eventType, enrichedData);
    }

    // Update A/B test metrics if this is part of a test
    const testId = event.metadata?.testId as string | undefined;
    if (testId) {
      await this.updateTestMetrics(testId, event.email, event.eventType);
    }

    // Cache real-time metrics
    await this.cacheRealTimeMetrics(event);
  }

  /**
   * Check if this is a unique open for this message/email combination
   */
  private async isUniqueOpen(messageId: string, email: string): Promise<boolean> {
    const cacheKey = `email:open:${messageId}:${email}`;
    const exists = await redis.exists(cacheKey);

    if (!exists) {
      // Store for 30 days
      await redis.set(cacheKey, '1', 'EX', 30 * 24 * 60 * 60);
      return true;
    }

    return false;
  }

  /**
   * Get link position within email (0-indexed)
   */
  private async getLinkPosition(messageId: string, url: string): Promise<number | undefined> {
    // In production, this would look up the email template
    // and determine which link position this URL corresponds to
    // For now, we'll return undefined
    return undefined;
  }

  /**
   * Enrich tracking data with device, browser, and geographic info
   */
  private enrichTrackingData(event: EmailTrackingEvent): EnrichedTrackingData {
    const enriched: EnrichedTrackingData = {};

    // Parse user agent
    if (event.userAgent) {
      const ua = event.userAgent.toLowerCase();
      
      // Detect device type
      if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        enriched.deviceType = 'mobile';
      } else if (ua.includes('tablet') || ua.includes('ipad')) {
        enriched.deviceType = 'tablet';
      } else if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) {
        enriched.deviceType = 'desktop';
      } else {
        enriched.deviceType = 'unknown';
      }

      // Detect email client
      if (ua.includes('outlook')) {
        enriched.emailClient = 'Outlook';
      } else if (ua.includes('gmail')) {
        enriched.emailClient = 'Gmail';
      } else if (ua.includes('yahoo')) {
        enriched.emailClient = 'Yahoo Mail';
      } else if (ua.includes('apple mail') || ua.includes('mail.app')) {
        enriched.emailClient = 'Apple Mail';
      } else if (ua.includes('thunderbird')) {
        enriched.emailClient = 'Thunderbird';
      }

      // Detect browser (for webmail clients)
      if (ua.includes('chrome')) {
        enriched.browser = 'Chrome';
      } else if (ua.includes('firefox')) {
        enriched.browser = 'Firefox';
      } else if (ua.includes('safari') && !ua.includes('chrome')) {
        enriched.browser = 'Safari';
      } else if (ua.includes('edge')) {
        enriched.browser = 'Edge';
      }
    }

    // Geographic lookup (would integrate with IP geolocation service in production)
    if (event.ipAddress) {
      enriched.geographic = {
        // Placeholder - integrate with service like MaxMind or IPStack
        country: undefined,
        region: undefined,
        city: undefined,
      };
    }

    return enriched;
  }

  /**
   * Update campaign analytics with new event
   */
  private async updateCampaignAnalytics(
    campaignId: string,
    eventType: EmailEventType,
    enrichedData: EnrichedTrackingData
  ): Promise<void> {
    const analytics = await prisma.emailCampaignAnalytics.findUnique({
      where: { campaignId },
    });

    if (!analytics) return;

    const updates: any = { updatedAt: new Date() };

    switch (eventType) {
      case 'SENT':
        updates.sentCount = { increment: 1 };
        break;
      case 'DELIVERED':
        updates.deliveredCount = { increment: 1 };
        break;
      case 'OPENED':
        updates.openedCount = { increment: 1 };
        // Unique opens tracked separately via uniqueOpen flag
        break;
      case 'CLICKED':
        updates.clickedCount = { increment: 1 };
        break;
      case 'BOUNCED':
        updates.bouncedCount = { increment: 1 };
        break;
      case 'COMPLAINED':
        updates.complainedCount = { increment: 1 };
        break;
    }

    // Update device breakdown
    if (enrichedData.deviceType && (eventType === 'OPENED' || eventType === 'CLICKED')) {
      const deviceBreakdown = analytics.deviceBreakdown as Record<string, number> || {};
      deviceBreakdown[enrichedData.deviceType] = (deviceBreakdown[enrichedData.deviceType] || 0) + 1;
      updates.deviceBreakdown = deviceBreakdown;
    }

    await prisma.emailCampaignAnalytics.update({
      where: { campaignId },
      data: updates,
    });

    // Recalculate rates
    await this.recalculateCampaignRates(campaignId);
  }

  /**
   * Recalculate campaign performance rates
   */
  private async recalculateCampaignRates(campaignId: string): Promise<void> {
    const analytics = await prisma.emailCampaignAnalytics.findUnique({
      where: { campaignId },
    });

    if (!analytics) return;

    const deliveryRate = analytics.sentCount > 0 
      ? analytics.deliveredCount / analytics.sentCount 
      : 0;

    const openRate = analytics.deliveredCount > 0 
      ? analytics.uniqueOpenedCount / analytics.deliveredCount 
      : 0;

    const clickRate = analytics.deliveredCount > 0 
      ? analytics.uniqueClickedCount / analytics.deliveredCount 
      : 0;

    const clickToOpenRate = analytics.uniqueOpenedCount > 0 
      ? analytics.uniqueClickedCount / analytics.uniqueOpenedCount 
      : 0;

    const unsubscribeRate = analytics.sentCount > 0 
      ? analytics.unsubscribedCount / analytics.sentCount 
      : 0;

    const complaintRate = analytics.sentCount > 0 
      ? analytics.complainedCount / analytics.sentCount 
      : 0;

    await prisma.emailCampaignAnalytics.update({
      where: { campaignId },
      data: {
        deliveryRate,
        openRate,
        clickRate,
        clickToOpenRate,
        unsubscribeRate,
        complaintRate,
      },
    });
  }

  /**
   * Update A/B test metrics
   */
  private async updateTestMetrics(
    testId: string,
    email: string,
    eventType: EmailEventType
  ): Promise<void> {
    const assignment = await prisma.emailTestAssignment.findFirst({
      where: { testId, email },
    });

    if (!assignment) return;

    const updates: any = {};

    if (eventType === 'OPENED' && !assignment.opened) {
      updates.opened = true;
    }

    if (eventType === 'CLICKED' && !assignment.clicked) {
      updates.clicked = true;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.emailTestAssignment.update({
        where: { id: assignment.id },
        data: updates,
      });
    }
  }

  /**
   * Cache real-time metrics for dashboard
   */
  private async cacheRealTimeMetrics(event: EmailTrackingEvent): Promise<void> {
    const hourKey = `email:metrics:hour:${new Date().toISOString().slice(0, 13)}`;
    const dayKey = `email:metrics:day:${new Date().toISOString().slice(0, 10)}`;

    const field = `${event.eventType.toLowerCase()}_count`;

    await Promise.all([
      redis.hincrby(hourKey, field, 1),
      redis.expire(hourKey, 3600), // 1 hour
      redis.hincrby(dayKey, field, 1),
      redis.expire(dayKey, 86400), // 24 hours
    ]);
  }

  /**
   * Get real-time metrics for dashboard
   */
  async getRealTimeMetrics(timeframe: 'hour' | 'day' = 'hour'): Promise<Record<string, number>> {
    const now = new Date();
    const key = timeframe === 'hour'
      ? `email:metrics:hour:${now.toISOString().slice(0, 13)}`
      : `email:metrics:day:${now.toISOString().slice(0, 10)}`;

    const metrics = await redis.hgetall(key);
    
    return {
      sent: parseInt(metrics.sent_count || '0'),
      delivered: parseInt(metrics.delivered_count || '0'),
      opened: parseInt(metrics.opened_count || '0'),
      clicked: parseInt(metrics.clicked_count || '0'),
      bounced: parseInt(metrics.bounced_count || '0'),
      complained: parseInt(metrics.complained_count || '0'),
    };
  }

  /**
   * Get link performance for a campaign
   */
  async getLinkPerformance(campaignId: string): Promise<Array<{
    url: string;
    clicks: number;
    uniqueClicks: number;
    clickRate: number;
  }>> {
    const clicks = await prisma.emailEvent.groupBy({
      by: ['clickedUrl'],
      where: {
        metadata: {
          path: ['campaignId'],
          equals: campaignId,
        },
        eventType: 'CLICKED',
        clickedUrl: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    const totalDelivered = await prisma.emailEvent.count({
      where: {
        metadata: {
          path: ['campaignId'],
          equals: campaignId,
        },
        eventType: 'DELIVERED',
      },
    });

    return clicks.map((click) => ({
      url: click.clickedUrl!,
      clicks: click._count.id,
      uniqueClicks: click._count.id, // Would need separate tracking for unique
      clickRate: totalDelivered > 0 ? click._count.id / totalDelivered : 0,
    }));
  }

  /**
   * Calculate engagement score for a recipient
   * 
   * Scoring algorithm:
   * - Open: 1 point
   * - Click: 3 points
   * - Recent activity (last 30 days): 2x multiplier
   * - Decay: 50% after 90 days
   */
  async getEngagementScore(email: string): Promise<{
    score: number;
    level: 'very_high' | 'high' | 'medium' | 'low' | 'inactive';
    recentOpens: number;
    recentClicks: number;
    lastActivity: Date | null;
    totalEvents: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get all engagement events for this email
    const allEvents = await prisma.emailEvent.findMany({
      where: {
        email,
        eventType: {
          in: ['OPENED', 'CLICKED'],
        },
      },
      select: {
        eventType: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let score = 0;
    let recentOpens = 0;
    let recentClicks = 0;
    const lastActivity = allEvents[0]?.createdAt || null;

    allEvents.forEach(event => {
      const eventAge = now.getTime() - event.createdAt.getTime();
      const daysSinceEvent = eventAge / (1000 * 60 * 60 * 24);

      // Base points
      let points = event.eventType === 'OPENED' ? 1 : 3;

      // Recent activity multiplier (last 30 days)
      if (event.createdAt >= thirtyDaysAgo) {
        points *= 2;
        if (event.eventType === 'OPENED') recentOpens++;
        if (event.eventType === 'CLICKED') recentClicks++;
      }

      // Decay for older events (50% after 90 days)
      if (event.createdAt < ninetyDaysAgo) {
        points *= 0.5;
      }

      score += points;
    });

    // Determine engagement level
    let level: 'very_high' | 'high' | 'medium' | 'low' | 'inactive';
    if (score >= 50) {
      level = 'very_high';
    } else if (score >= 20) {
      level = 'high';
    } else if (score >= 5) {
      level = 'medium';
    } else if (score > 0) {
      level = 'low';
    } else {
      level = 'inactive';
    }

    return {
      score: Math.round(score),
      level,
      recentOpens,
      recentClicks,
      lastActivity,
      totalEvents: allEvents.length,
    };
  }

  /**
   * Get engagement scores for multiple recipients (bulk operation)
   */
  async getBulkEngagementScores(emails: string[]): Promise<Map<string, {
    score: number;
    level: 'very_high' | 'high' | 'medium' | 'low' | 'inactive';
  }>> {
    const scores = new Map<string, {
      score: number;
      level: 'very_high' | 'high' | 'medium' | 'low' | 'inactive';
    }>();

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(email => this.getEngagementScore(email))
      );

      batch.forEach((email, index) => {
        const result = results[index];
        scores.set(email, {
          score: result.score,
          level: result.level,
        });
      });
    }

    return scores;
  }

  /**
   * Get top engaged users for targeting
   */
  async getTopEngagedUsers(limit: number = 100): Promise<Array<{
    email: string;
    userId?: string;
    score: number;
    recentOpens: number;
    recentClicks: number;
    lastActivity: Date;
  }>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get users with recent activity
    const activeUsers = await prisma.emailEvent.groupBy({
      by: ['email', 'userId'],
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
        eventType: {
          in: ['OPENED', 'CLICKED'],
        },
      },
      _count: {
        id: true,
      },
      _max: {
        createdAt: true,
      },
    });

    // Calculate engagement scores
    const userScores = await Promise.all(
      activeUsers.map(async (user) => {
        const engagement = await this.getEngagementScore(user.email);
        return {
          email: user.email,
          userId: user.userId || undefined,
          score: engagement.score,
          recentOpens: engagement.recentOpens,
          recentClicks: engagement.recentClicks,
          lastActivity: user._max.createdAt!,
        };
      })
    );

    // Sort by score and limit
    return userScores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get inactive users who need re-engagement
   */
  async getInactiveUsers(daysSinceLastActivity: number = 90): Promise<Array<{
    email: string;
    userId?: string;
    lastActivity: Date;
    daysSinceActivity: number;
  }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastActivity);

    // Get users with no recent activity
    const lastActivities = await prisma.emailEvent.groupBy({
      by: ['email', 'userId'],
      where: {
        eventType: {
          in: ['OPENED', 'CLICKED'],
        },
      },
      _max: {
        createdAt: true,
      },
    });

    const now = new Date();
    const inactiveUsers = lastActivities
      .filter(user => user._max.createdAt && user._max.createdAt < cutoffDate)
      .map(user => ({
        email: user.email,
        userId: user.userId || undefined,
        lastActivity: user._max.createdAt!,
        daysSinceActivity: Math.floor(
          (now.getTime() - user._max.createdAt!.getTime()) / (1000 * 60 * 60 * 24)
        ),
      }))
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

    return inactiveUsers;
  }
}

export const emailTrackingService = new EmailTrackingService();
