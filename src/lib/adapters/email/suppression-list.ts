import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import type {
  ISuppressionList,
  SuppressionReason,
  SuppressionInfo,
  BounceType,
} from './types';

/**
 * Suppression list management implementation.
 * 
 * Manages the email suppression list to prevent sending to:
 * - Hard bounced addresses
 * - Spam complainers
 * - Unsubscribed users
 * - Manually blocked addresses
 * 
 * Features:
 * - Redis caching for fast lookups
 * - Automatic cache invalidation
 * - Bulk import/export
 * - Audit logging
 * 
 * @class SuppressionListManager
 * @implements {ISuppressionList}
 */
export class SuppressionListManager implements ISuppressionList {
  private readonly CACHE_TTL = 86400; // 24 hours

  /**
   * Add an email to the suppression list
   */
  async add(params: {
    email: string;
    reason: SuppressionReason;
    bounceType?: BounceType;
    bounceReason?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // Normalize email to lowercase
      const normalizedEmail = params.email.toLowerCase().trim();

      // Add to database
      await prisma.emailSuppression.upsert({
        where: { email: normalizedEmail },
        update: {
          reason: params.reason,
          bounceType: params.bounceType,
          bounceReason: params.bounceReason,
          suppressedAt: new Date(),
        },
        create: {
          email: normalizedEmail,
          reason: params.reason,
          bounceType: params.bounceType,
          bounceReason: params.bounceReason,
        },
      });

      // Update cache
      await redis.set(
        `email-suppressed:${normalizedEmail}`,
        'true',
        'EX',
        this.CACHE_TTL
      );

      console.info(`[SuppressionList] Added ${normalizedEmail} (${params.reason})`);
    } catch (error) {
      console.error('[SuppressionList] Error adding to suppression list:', error);
      throw error;
    }
  }

  /**
   * Remove an email from the suppression list
   */
  async remove(email: string): Promise<void> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Remove from database
      await prisma.emailSuppression.delete({
        where: { email: normalizedEmail },
      });

      // Invalidate cache
      await redis.del(`email-suppressed:${normalizedEmail}`);

      console.info(`[SuppressionList] Removed ${normalizedEmail}`);
    } catch (error) {
      if ((error as any)?.code === 'P2025') {
        // Record not found - ignore
        return;
      }
      console.error('[SuppressionList] Error removing from suppression list:', error);
      throw error;
    }
  }

  /**
   * Check if an email is suppressed
   */
  async isSuppressed(email: string): Promise<boolean> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Check cache first
      const cached = await redis.get(`email-suppressed:${normalizedEmail}`);
      if (cached !== null) {
        return cached === 'true';
      }

      // Check database
      const suppression = await prisma.emailSuppression.findUnique({
        where: { email: normalizedEmail },
      });

      const isSuppressed = !!suppression;

      // Cache result
      await redis.set(
        `email-suppressed:${normalizedEmail}`,
        isSuppressed.toString(),
        'EX',
        this.CACHE_TTL
      );

      return isSuppressed;
    } catch (error) {
      console.error('[SuppressionList] Error checking suppression status:', error);
      // Fail open - don't suppress on error
      return false;
    }
  }

  /**
   * Get suppression details for an email
   */
  async getSuppressionInfo(email: string): Promise<SuppressionInfo | null> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      const suppression = await prisma.emailSuppression.findUnique({
        where: { email: normalizedEmail },
      });

      if (!suppression) {
        return null;
      }

      return {
        email: suppression.email,
        reason: suppression.reason as SuppressionReason,
        suppressedAt: suppression.suppressedAt,
        bounceType: suppression.bounceType as BounceType | undefined,
        bounceReason: suppression.bounceReason || undefined,
        metadata: {},
      };
    } catch (error) {
      console.error('[SuppressionList] Error getting suppression info:', error);
      return null;
    }
  }

  /**
   * List suppressed emails with optional filtering
   */
  async list(params?: {
    reason?: SuppressionReason;
    limit?: number;
    offset?: number;
  }): Promise<SuppressionInfo[]> {
    try {
      const suppressions = await prisma.emailSuppression.findMany({
        where: params?.reason
          ? { reason: params.reason }
          : undefined,
        take: params?.limit || 100,
        skip: params?.offset || 0,
        orderBy: {
          suppressedAt: 'desc',
        },
      });

      return suppressions.map(s => ({
        email: s.email,
        reason: s.reason as SuppressionReason,
        suppressedAt: s.suppressedAt,
        bounceType: s.bounceType as BounceType | undefined,
        bounceReason: s.bounceReason || undefined,
        metadata: {},
      }));
    } catch (error) {
      console.error('[SuppressionList] Error listing suppressions:', error);
      return [];
    }
  }

  /**
   * Bulk check if multiple emails are suppressed
   */
  async checkBulk(emails: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Normalize all emails
    const normalizedEmails = emails.map(e => e.toLowerCase().trim());

    try {
      // Try to get from cache first
      const cacheKeys = normalizedEmails.map(e => `email-suppressed:${e}`);
      const cached = await redis.mget(...cacheKeys);

      const uncachedEmails: string[] = [];
      cached.forEach((value, index) => {
        if (value !== null) {
          results.set(normalizedEmails[index], value === 'true');
        } else {
          uncachedEmails.push(normalizedEmails[index]);
        }
      });

      // Query database for uncached emails
      if (uncachedEmails.length > 0) {
        const suppressions = await prisma.emailSuppression.findMany({
          where: {
            email: {
              in: uncachedEmails,
            },
          },
        });

        const suppressedSet = new Set(suppressions.map(s => s.email));

        // Update results and cache
        for (const email of uncachedEmails) {
          const isSuppressed = suppressedSet.has(email);
          results.set(email, isSuppressed);

          // Cache result
          await redis.set(
            `email-suppressed:${email}`,
            isSuppressed.toString(),
            'EX',
            this.CACHE_TTL
          );
        }
      }
    } catch (error) {
      console.error('[SuppressionList] Error in bulk check:', error);
      // Return what we have so far
    }

    return results;
  }

  /**
   * Get suppression statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byReason: Record<SuppressionReason, number>;
  }> {
    try {
      const [total, byReason] = await Promise.all([
        prisma.emailSuppression.count(),
        prisma.emailSuppression.groupBy({
          by: ['reason'],
          _count: true,
        }),
      ]);

      const reasonCounts = byReason.reduce((acc, item) => {
        acc[item.reason as SuppressionReason] = item._count;
        return acc;
      }, {} as Record<SuppressionReason, number>);

      return {
        total,
        byReason: reasonCounts,
      };
    } catch (error) {
      console.error('[SuppressionList] Error getting statistics:', error);
      return {
        total: 0,
        byReason: {} as Record<SuppressionReason, number>,
      };
    }
  }

  /**
   * Export suppression list for backup or migration
   */
  async export(params?: {
    reason?: SuppressionReason;
  }): Promise<Array<{
    email: string;
    reason: SuppressionReason;
    suppressedAt: string;
    bounceType?: string;
    bounceReason?: string;
  }>> {
    try {
      const suppressions = await prisma.emailSuppression.findMany({
        where: params?.reason
          ? { reason: params.reason }
          : undefined,
        orderBy: {
          suppressedAt: 'desc',
        },
      });

      return suppressions.map(s => ({
        email: s.email,
        reason: s.reason as SuppressionReason,
        suppressedAt: s.suppressedAt.toISOString(),
        bounceType: s.bounceType || undefined,
        bounceReason: s.bounceReason || undefined,
      }));
    } catch (error) {
      console.error('[SuppressionList] Error exporting:', error);
      return [];
    }
  }

  /**
   * Import suppression list from backup
   */
  async import(
    entries: Array<{
      email: string;
      reason: SuppressionReason;
      bounceType?: BounceType;
      bounceReason?: string;
    }>
  ): Promise<{
    imported: number;
    skipped: number;
    errors: number;
  }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const entry of entries) {
      try {
        const normalizedEmail = entry.email.toLowerCase().trim();

        // Check if already exists
        const existing = await prisma.emailSuppression.findUnique({
          where: { email: normalizedEmail },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Add to suppression list
        await this.add({
          email: normalizedEmail,
          reason: entry.reason,
          bounceType: entry.bounceType,
          bounceReason: entry.bounceReason,
        });

        imported++;
      } catch (error) {
        console.error(`[SuppressionList] Error importing ${entry.email}:`, error);
        errors++;
      }
    }

    console.info(`[SuppressionList] Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);

    return { imported, skipped, errors };
  }

  /**
   * Clear cache for a specific email or all emails
   */
  async clearCache(email?: string): Promise<void> {
    try {
      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        await redis.del(`email-suppressed:${normalizedEmail}`);
      } else {
        // Clear all suppression caches (use with caution)
        const keys = await redis.keys('email-suppressed:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error) {
      console.error('[SuppressionList] Error clearing cache:', error);
    }
  }

  /**
   * Clean up old suppressions (for manual unsubscribes only)
   */
  async cleanupOld(params: {
    reason: Extract<SuppressionReason, 'MANUAL' | 'UNSUBSCRIBE'>;
    olderThan: Date;
  }): Promise<number> {
    try {
      const result = await prisma.emailSuppression.deleteMany({
        where: {
          reason: params.reason,
          suppressedAt: {
            lt: params.olderThan,
          },
        },
      });

      // Clear cache for all (since we don't know which emails were deleted)
      await this.clearCache();

      console.info(`[SuppressionList] Cleaned up ${result.count} old ${params.reason} suppressions`);

      return result.count;
    } catch (error) {
      console.error('[SuppressionList] Error cleaning up old suppressions:', error);
      return 0;
    }
  }
}
