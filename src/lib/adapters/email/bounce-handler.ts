import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import type {
  IBounceHandler,
  BounceInfo,
  BounceStats,
  BounceType,
} from './types';

/**
 * Bounce handler implementation for managing email bounces
 * and suppression list updates.
 * 
 * Handles:
 * - Hard bounces: Immediate suppression
 * - Soft bounces: Track count, suppress after threshold
 * - Technical bounces: Log and monitor
 * - Bounce statistics and reporting
 * 
 * @class BounceHandler
 * @implements {IBounceHandler}
 */
export class BounceHandler implements IBounceHandler {
  private readonly SOFT_BOUNCE_THRESHOLD = 5;
  private readonly BOUNCE_STATS_TTL = 86400 * 30; // 30 days cache

  /**
   * Process a bounce event
   * - Hard bounces: Add to suppression list immediately
   * - Soft bounces: Increment counter, suppress after threshold
   * - Technical bounces: Log for monitoring
   */
  async handleBounce(bounce: BounceInfo & { email: string }): Promise<void> {
    try {
      // Log bounce event
      await prisma.emailEvent.create({
        data: {
          messageId: `bounce-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          email: bounce.email,
          eventType: 'BOUNCED',
          bouncedAt: bounce.timestamp,
          bounceReason: bounce.reason,
          metadata: {
            bounceType: bounce.type,
            bounceSubType: bounce.subType,
            diagnosticCode: bounce.diagnosticCode,
            suppressionRecommended: bounce.suppressionRecommended,
          },
        },
      });

      // Handle based on bounce type
      switch (bounce.type) {
        case 'hard':
          // Hard bounces: immediate suppression
          await this.addToSuppressionList(bounce.email, bounce);
          break;

        case 'soft':
          // Soft bounces: track count and suppress if threshold exceeded
          const bounceCount = await this.incrementSoftBounceCount(bounce.email);
          if (bounceCount >= this.SOFT_BOUNCE_THRESHOLD) {
            await this.addToSuppressionList(bounce.email, bounce);
          }
          break;

        case 'technical':
          // Technical bounces: log but don't suppress immediately
          // These may be temporary issues (message too large, etc.)
          console.warn(`[BounceHandler] Technical bounce for ${bounce.email}:`, {
            reason: bounce.reason,
            diagnosticCode: bounce.diagnosticCode,
          });
          break;

        default:
          // Undetermined: log for investigation
          console.warn(`[BounceHandler] Undetermined bounce type for ${bounce.email}:`, bounce);
      }

      // Invalidate cached bounce stats
      await redis.del(`bounce-stats:${bounce.email}`);

      // Update bounce statistics
      await this.updateBounceStats(bounce.email);
    } catch (error) {
      console.error(`[BounceHandler] Error processing bounce for ${bounce.email}:`, error);
      throw error;
    }
  }

  /**
   * Check if an email should be suppressed based on bounce history
   */
  async shouldSuppress(email: string): Promise<boolean> {
    // Check if already suppressed
    const suppressed = await prisma.emailSuppression.findUnique({
      where: { email },
    });

    if (suppressed) {
      return true;
    }

    // Check soft bounce count
    const stats = await this.getBounceStats(email);
    if (stats && stats.softBounces >= this.SOFT_BOUNCE_THRESHOLD) {
      return true;
    }

    // Check recent hard bounces
    if (stats && stats.hardBounces > 0) {
      return true;
    }

    return false;
  }

  /**
   * Get bounce statistics for an email address
   */
  async getBounceStats(email: string): Promise<BounceStats | null> {
    try {
      // Check cache first
      const cached = await redis.get(`bounce-stats:${email}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query bounce events from database
      const bounceEvents = await prisma.emailEvent.findMany({
        where: {
          email,
          eventType: 'BOUNCED',
        },
        orderBy: {
          bouncedAt: 'desc',
        },
      });

      if (bounceEvents.length === 0) {
        return null;
      }

      // Calculate statistics
      const hardBounces = bounceEvents.filter(
        e => (e.metadata as any)?.bounceType === 'hard'
      ).length;
      const softBounces = bounceEvents.filter(
        e => (e.metadata as any)?.bounceType === 'soft'
      ).length;
      const lastBounce = bounceEvents[0];

      // Check if suppressed
      const suppression = await prisma.emailSuppression.findUnique({
        where: { email },
      });

      const stats: BounceStats = {
        email,
        totalBounces: bounceEvents.length,
        hardBounces,
        softBounces,
        lastBounceAt: lastBounce.bouncedAt || lastBounce.createdAt,
        lastBounceType: ((lastBounce.metadata as any)?.bounceType as BounceType) || 'undetermined',
        isSuppressed: !!suppression,
      };

      // Cache for 30 days
      await redis.set(
        `bounce-stats:${email}`,
        JSON.stringify(stats),
        'EX',
        this.BOUNCE_STATS_TTL
      );

      return stats;
    } catch (error) {
      console.error(`[BounceHandler] Error getting bounce stats for ${email}:`, error);
      return null;
    }
  }

  /**
   * Get bounce rate for a time period
   */
  async getBounceRate(params: {
    startDate: Date;
    endDate: Date;
    tags?: Record<string, string>;
  }): Promise<number> {
    try {
      // Get total emails sent
      const totalSent = await prisma.emailEvent.count({
        where: {
          eventType: 'SENT',
          sentAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
          ...(params.tags && {
            metadata: {
              path: ['tags'],
              equals: params.tags,
            },
          }),
        },
      });

      if (totalSent === 0) {
        return 0;
      }

      // Get bounced emails
      const totalBounced = await prisma.emailEvent.count({
        where: {
          eventType: 'BOUNCED',
          bouncedAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
          ...(params.tags && {
            metadata: {
              path: ['tags'],
              equals: params.tags,
            },
          }),
        },
      });

      return (totalBounced / totalSent) * 100;
    } catch (error) {
      console.error('[BounceHandler] Error calculating bounce rate:', error);
      return 0;
    }
  }

  // --- Private Helper Methods ---

  /**
   * Add email to suppression list
   */
  private async addToSuppressionList(
    email: string,
    bounce: BounceInfo
  ): Promise<void> {
    await prisma.emailSuppression.upsert({
      where: { email },
      update: {
        reason: 'BOUNCE',
        bounceType: bounce.type,
        bounceReason: bounce.reason,
        suppressedAt: new Date(),
      },
      create: {
        email,
        reason: 'BOUNCE',
        bounceType: bounce.type,
        bounceReason: bounce.reason,
      },
    });

    // Invalidate suppression cache
    await redis.del(`email-suppressed:${email}`);

    console.info(`[BounceHandler] Added ${email} to suppression list (${bounce.type} bounce)`);
  }

  /**
   * Increment soft bounce counter in Redis
   */
  private async incrementSoftBounceCount(email: string): Promise<number> {
    const key = `soft-bounce-count:${email}`;
    const count = await redis.incr(key);
    
    // Set expiry to 30 days if this is the first increment
    if (count === 1) {
      await redis.expire(key, 86400 * 30);
    }

    return count;
  }

  /**
   * Update bounce statistics cache
   */
  private async updateBounceStats(email: string): Promise<void> {
    // Invalidate cache to force refresh on next getBounceStats call
    await redis.del(`bounce-stats:${email}`);
  }

  /**
   * Get suppression list with pagination
   */
  async getSuppressionList(params?: {
    limit?: number;
    offset?: number;
    bounceType?: BounceType;
  }): Promise<Array<{
    email: string;
    bounceType: string;
    bounceReason: string;
    suppressedAt: Date;
  }>> {
    const suppressions = await prisma.emailSuppression.findMany({
      where: {
        reason: 'BOUNCE',
        ...(params?.bounceType && {
          bounceType: params.bounceType,
        }),
      },
      take: params?.limit || 100,
      skip: params?.offset || 0,
      orderBy: {
        suppressedAt: 'desc',
      },
    });

    return suppressions.map(s => ({
      email: s.email,
      bounceType: s.bounceType || 'unknown',
      bounceReason: s.bounceReason || 'Unknown reason',
      suppressedAt: s.suppressedAt,
    }));
  }

  /**
   * Remove email from suppression list (for manual intervention)
   */
  async removeFromSuppressionList(email: string): Promise<void> {
    await prisma.emailSuppression.delete({
      where: { email },
    });

    // Invalidate caches
    await redis.del(`email-suppressed:${email}`);
    await redis.del(`bounce-stats:${email}`);
    await redis.del(`soft-bounce-count:${email}`);

    console.info(`[BounceHandler] Removed ${email} from suppression list`);
  }
}
