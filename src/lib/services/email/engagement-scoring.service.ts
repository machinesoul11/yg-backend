/**
 * Email Engagement Scoring Service
 * 
 * Calculates and manages email engagement scores for recipients.
 * Scores range from 0-100 based on:
 * - Opens (weighted 5 points each)
 * - Clicks (weighted 15 points each)
 * - Recency of engagement (decay over 180 days)
 * - Send frequency (avoid penalizing newly added recipients)
 * 
 * Engagement segments:
 * - Highly engaged: 80-100
 * - Moderately engaged: 40-79
 * - Low engagement: 10-39
 * - Disengaged: 0-9
 * 
 * Used for:
 * - Optimizing send frequency
 * - Identifying re-engagement candidates
 * - Filtering promotional emails
 * - Campaign targeting
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

export interface EngagementScore {
  email: string;
  userId?: string;
  score: number;
  segment: 'highly-engaged' | 'moderately-engaged' | 'low-engagement' | 'disengaged';
  totalEmailsSent: number;
  totalOpens: number;
  totalClicks: number;
  uniqueOpens: number;
  lastEngagedAt?: Date;
  daysSinceLastEngagement?: number;
  calculatedAt: Date;
}

export interface EngagementUpdate {
  email: string;
  action: 'open' | 'click';
  timestamp: Date;
  messageId?: string;
}

export interface SegmentStatistics {
  segment: string;
  count: number;
  percentage: number;
  averageScore: number;
  totalOpens: number;
  totalClicks: number;
}

export class EmailEngagementScoringService {
  private readonly SCORE_WEIGHTS = {
    OPEN: 5,
    CLICK: 15,
  };

  private readonly DECAY_DAYS = 180; // Engagement decays over 6 months
  private readonly BASE_SCORE = 50; // Starting score for new recipients

  /**
   * Calculate engagement score for a specific email address
   */
  async calculateScore(email: string): Promise<EngagementScore> {
    // Get all email events for this recipient
    const events = await prisma.emailEvent.findMany({
      where: {
        email,
        eventType: {
          in: ['SENT', 'OPENED', 'CLICKED'],
        },
      },
      select: {
        id: true,
        email: true,
        eventType: true,
        messageId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalEmailsSent = events.filter(e => e.eventType === 'SENT').length;
    const opens = events.filter(e => e.eventType === 'OPENED');
    const clicks = events.filter(e => e.eventType === 'CLICKED');
    
    const totalOpens = opens.length;
    // Count unique opens by messageId (one unique open per email)
    const uniqueMessageIds = new Set(opens.map(e => e.messageId));
    const uniqueOpens = uniqueMessageIds.size;
    const totalClicks = clicks.length;

    // Find last engagement
    const lastEngagement = [...opens, ...clicks].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];

    const lastEngagedAt = lastEngagement?.createdAt;
    const daysSinceLastEngagement = lastEngagedAt 
      ? Math.floor((Date.now() - lastEngagedAt.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    // Calculate base engagement points
    let engagementPoints = 0;
    engagementPoints += uniqueOpens * this.SCORE_WEIGHTS.OPEN;
    engagementPoints += totalClicks * this.SCORE_WEIGHTS.CLICK;

    // Apply recency decay
    let score = this.BASE_SCORE;
    
    if (daysSinceLastEngagement !== undefined) {
      const decayFactor = Math.max(0, 1 - (daysSinceLastEngagement / this.DECAY_DAYS));
      score = this.BASE_SCORE + (engagementPoints * decayFactor);
    } else {
      // No engagement yet, keep base score
      score = this.BASE_SCORE;
    }

    // Cap score at 100
    score = Math.min(100, Math.max(0, Math.round(score)));

    const segment = this.getSegment(score);

    // Get userId if this email belongs to a registered user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    const engagementScore: EngagementScore = {
      email,
      userId: user?.id,
      score,
      segment,
      totalEmailsSent,
      totalOpens,
      totalClicks,
      uniqueOpens,
      lastEngagedAt,
      daysSinceLastEngagement,
      calculatedAt: new Date(),
    };

    // Cache the score
    await this.cacheScore(email, engagementScore);

    return engagementScore;
  }

  /**
   * Update engagement score after an action
   */
  async updateScore(update: EngagementUpdate): Promise<EngagementScore> {
    // Recalculate score with the new engagement data
    return await this.calculateScore(update.email);
  }

  /**
   * Get cached engagement score
   */
  async getCachedScore(email: string): Promise<EngagementScore | null> {
    const key = `engagement:score:${email}`;
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }

  /**
   * Get or calculate engagement score (uses cache when available)
   */
  async getScore(email: string, recalculate = false): Promise<EngagementScore> {
    if (!recalculate) {
      const cached = await this.getCachedScore(email);
      if (cached) {
        return cached;
      }
    }
    
    return await this.calculateScore(email);
  }

  /**
   * Batch calculate scores for multiple emails
   */
  async batchCalculateScores(emails: string[]): Promise<EngagementScore[]> {
    const scores = await Promise.all(
      emails.map(email => this.calculateScore(email))
    );
    
    return scores;
  }

  /**
   * Get engagement statistics by segment
   */
  async getSegmentStatistics(): Promise<SegmentStatistics[]> {
    // Get all unique email addresses that have received emails
    const uniqueEmails = await prisma.emailEvent.findMany({
      where: {
        eventType: 'SENT',
      },
      select: {
        email: true,
      },
      distinct: ['email'],
    });

    console.log(`[EngagementScoring] Calculating segment statistics for ${uniqueEmails.length} recipients...`);

    // Calculate scores for all recipients
    const scores = await this.batchCalculateScores(
      uniqueEmails.map(e => e.email)
    );

    // Group by segment
    const segments = {
      'highly-engaged': scores.filter(s => s.segment === 'highly-engaged'),
      'moderately-engaged': scores.filter(s => s.segment === 'moderately-engaged'),
      'low-engagement': scores.filter(s => s.segment === 'low-engagement'),
      'disengaged': scores.filter(s => s.segment === 'disengaged'),
    };

    const totalRecipients = scores.length;

    const statistics: SegmentStatistics[] = Object.entries(segments).map(([segment, segmentScores]) => ({
      segment,
      count: segmentScores.length,
      percentage: totalRecipients > 0 ? (segmentScores.length / totalRecipients) * 100 : 0,
      averageScore: segmentScores.length > 0
        ? segmentScores.reduce((sum, s) => sum + s.score, 0) / segmentScores.length
        : 0,
      totalOpens: segmentScores.reduce((sum, s) => sum + s.totalOpens, 0),
      totalClicks: segmentScores.reduce((sum, s) => sum + s.totalClicks, 0),
    }));

    return statistics;
  }

  /**
   * Get recipients by engagement segment
   */
  async getRecipientsBySegment(
    segment: 'highly-engaged' | 'moderately-engaged' | 'low-engagement' | 'disengaged',
    limit = 100
  ): Promise<EngagementScore[]> {
    // Get unique email addresses
    const uniqueEmails = await prisma.emailEvent.findMany({
      where: {
        eventType: 'SENT',
      },
      select: {
        email: true,
      },
      distinct: ['email'],
      take: limit * 2, // Get more than needed to account for filtering
    });

    // Calculate scores
    const scores = await this.batchCalculateScores(
      uniqueEmails.map(e => e.email)
    );

    // Filter by segment and limit
    return scores
      .filter(s => s.segment === segment)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Identify disengaged recipients who may need re-engagement
   */
  async getReEngagementCandidates(daysInactive = 90): Promise<EngagementScore[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    // Find emails with engagement history but no recent activity
    const events = await prisma.emailEvent.findMany({
      where: {
        eventType: {
          in: ['OPENED', 'CLICKED'],
        },
        createdAt: {
          lt: cutoffDate,
        },
      },
      select: {
        email: true,
      },
      distinct: ['email'],
    });

    const scores = await this.batchCalculateScores(
      events.map(e => e.email)
    );

    // Return those with low scores but previous engagement
    return scores.filter(s => 
      s.score < 40 && 
      (s.totalOpens > 0 || s.totalClicks > 0) &&
      s.daysSinceLastEngagement && 
      s.daysSinceLastEngagement >= daysInactive
    ).sort((a, b) => (b.daysSinceLastEngagement || 0) - (a.daysSinceLastEngagement || 0));
  }

  /**
   * Check if an email should receive promotional content based on engagement
   */
  async shouldReceivePromotional(email: string, minimumScore = 30): Promise<boolean> {
    const score = await this.getScore(email);
    return score.score >= minimumScore;
  }

  /**
   * Determine engagement segment from score
   */
  private getSegment(score: number): 'highly-engaged' | 'moderately-engaged' | 'low-engagement' | 'disengaged' {
    if (score >= 80) return 'highly-engaged';
    if (score >= 40) return 'moderately-engaged';
    if (score >= 10) return 'low-engagement';
    return 'disengaged';
  }

  /**
   * Cache engagement score in Redis
   */
  private async cacheScore(email: string, score: EngagementScore): Promise<void> {
    const key = `engagement:score:${email}`;
    
    // Cache for 24 hours
    await redis.set(
      key,
      JSON.stringify(score),
      'EX',
      24 * 3600
    );
  }

  /**
   * Clear cached score for an email
   */
  async clearCache(email: string): Promise<void> {
    const key = `engagement:score:${email}`;
    await redis.del(key);
  }

  /**
   * Recalculate scores for all recipients (use sparingly - resource intensive)
   */
  async recalculateAllScores(): Promise<{ processed: number; duration: number }> {
    const startTime = Date.now();

    console.log('[EngagementScoring] Starting full score recalculation...');

    // Get all unique email addresses
    const uniqueEmails = await prisma.emailEvent.findMany({
      where: {
        eventType: 'SENT',
      },
      select: {
        email: true,
      },
      distinct: ['email'],
    });

    console.log(`[EngagementScoring] Found ${uniqueEmails.length} unique recipients`);

    // Process in batches to avoid overwhelming the system
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < uniqueEmails.length; i += batchSize) {
      const batch = uniqueEmails.slice(i, i + batchSize);
      await this.batchCalculateScores(batch.map(e => e.email));
      processed += batch.length;

      if (processed % 1000 === 0) {
        console.log(`[EngagementScoring] Processed ${processed}/${uniqueEmails.length} recipients...`);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[EngagementScoring] Completed recalculation: ${processed} recipients in ${duration}ms`);

    return {
      processed,
      duration,
    };
  }
}

export const emailEngagementScoringService = new EmailEngagementScoringService();
