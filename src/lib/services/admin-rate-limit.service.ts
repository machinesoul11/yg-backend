/**
 * Admin Rate Limiting Service
 * Implements strict rate limits for administrative operations
 * 
 * Rate Limit Tiers:
 * - ROLE_MANAGEMENT: 10 requests/hour (critical security operations)
 * - APPROVAL_ACTIONS: 50 requests/hour (moderate impact operations)
 * - READ_OPERATIONS: 500 requests/hour (low impact operations)
 * 
 * Uses Redis-backed sliding window algorithm for distributed rate limiting
 */

import { getRedisClient } from '../redis/client';
import { RedisKeys } from '../redis/keys';

export type AdminRateLimitTier = 'role_management' | 'approval_actions' | 'read_operations';

export interface AdminRateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface AdminRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
  current: number;
  tier: AdminRateLimitTier;
}

// Admin-specific rate limit configurations
const ADMIN_RATE_LIMITS: Record<AdminRateLimitTier, AdminRateLimitConfig> = {
  role_management: {
    limit: 10,
    windowSeconds: 3600, // 1 hour
  },
  approval_actions: {
    limit: 50,
    windowSeconds: 3600, // 1 hour
  },
  read_operations: {
    limit: 500,
    windowSeconds: 3600, // 1 hour
  },
};

export class AdminRateLimitService {
  private redis = getRedisClient();

  /**
   * Check if admin action is within rate limit using sliding window algorithm
   * 
   * @param userId - Admin user ID
   * @param tier - Rate limit tier
   * @param customConfig - Optional custom configuration
   * @returns Rate limit result with current usage and remaining quota
   */
  async checkLimit(
    userId: string,
    tier: AdminRateLimitTier,
    customConfig?: Partial<AdminRateLimitConfig>
  ): Promise<AdminRateLimitResult> {
    const config = {
      ...ADMIN_RATE_LIMITS[tier],
      ...customConfig,
    };

    const key = this.getKey(userId, tier);
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);

    try {
      // Use sliding window algorithm with sorted sets
      const pipeline = this.redis.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, '-inf', windowStart);

      // Count current entries in window
      pipeline.zcard(key);

      // Add current request with timestamp as score
      pipeline.zadd(key, now, `${now}:${Math.random()}`);

      // Set expiry on key
      pipeline.expire(key, config.windowSeconds);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      // Extract count from results (index 1 is zcard result)
      const [[, ], [countErr, count]] = results as [[any, any], [Error | null, number], [any, any], [any, any]];

      if (countErr) {
        throw countErr;
      }

      const current = (count as number) + 1; // +1 for the request we just added
      const remaining = Math.max(0, config.limit - current);
      const allowed = current <= config.limit;

      // If limit exceeded, remove the request we just added
      if (!allowed) {
        await this.redis.zrem(key, `${now}:${Math.random()}`);
      }

      return {
        allowed,
        remaining,
        resetAt: new Date(now + (config.windowSeconds * 1000)),
        limit: config.limit,
        current: allowed ? current : current - 1,
        tier,
      };
    } catch (error) {
      console.error(`[AdminRateLimit] Error checking limit for ${tier}:${userId}:`, error);

      // Fail open - allow the request if Redis is down but log the error
      return {
        allowed: true,
        remaining: config.limit,
        resetAt: new Date(now + (config.windowSeconds * 1000)),
        limit: config.limit,
        current: 0,
        tier,
      };
    }
  }

  /**
   * Check limit and throw error if exceeded
   * 
   * @param userId - Admin user ID
   * @param tier - Rate limit tier
   * @param customConfig - Optional custom configuration
   * @throws Error if rate limit exceeded
   */
  async checkLimitOrThrow(
    userId: string,
    tier: AdminRateLimitTier,
    customConfig?: Partial<AdminRateLimitConfig>
  ): Promise<AdminRateLimitResult> {
    const result = await this.checkLimit(userId, tier, customConfig);

    if (!result.allowed) {
      const error = new Error(
        `Admin rate limit exceeded for ${tier}. Limit: ${result.limit}/hour. Resets at ${result.resetAt.toISOString()}`
      );
      (error as any).code = 'ADMIN_RATE_LIMIT_EXCEEDED';
      (error as any).rateLimitInfo = result;
      throw error;
    }

    return result;
  }

  /**
   * Get current usage for a tier
   * 
   * @param userId - Admin user ID
   * @param tier - Rate limit tier
   * @returns Current count within the window
   */
  async getCurrentCount(userId: string, tier: AdminRateLimitTier): Promise<number> {
    const config = ADMIN_RATE_LIMITS[tier];
    const key = this.getKey(userId, tier);
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);

    try {
      // Remove old entries
      await this.redis.zremrangebyscore(key, '-inf', windowStart);

      // Count current entries
      const count = await this.redis.zcard(key);
      return count;
    } catch (error) {
      console.error(`[AdminRateLimit] Error getting count for ${tier}:${userId}:`, error);
      return 0;
    }
  }

  /**
   * Reset rate limit for a user and tier
   * 
   * @param userId - Admin user ID
   * @param tier - Rate limit tier
   */
  async reset(userId: string, tier: AdminRateLimitTier): Promise<void> {
    const key = this.getKey(userId, tier);

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`[AdminRateLimit] Error resetting limit for ${tier}:${userId}:`, error);
      throw error;
    }
  }

  /**
   * Reset all rate limits for a user
   * 
   * @param userId - Admin user ID
   */
  async resetAllForUser(userId: string): Promise<void> {
    const tiers: AdminRateLimitTier[] = ['role_management', 'approval_actions', 'read_operations'];

    await Promise.all(
      tiers.map(tier => this.reset(userId, tier).catch(err => {
        console.error(`Failed to reset ${tier} for user ${userId}:`, err);
      }))
    );
  }

  /**
   * Get rate limit status for all tiers
   * 
   * @param userId - Admin user ID
   * @returns Status for each tier
   */
  async getAllTierStatus(userId: string): Promise<Record<AdminRateLimitTier, {
    current: number;
    limit: number;
    remaining: number;
    resetAt: Date;
  }>> {
    const tiers: AdminRateLimitTier[] = ['role_management', 'approval_actions', 'read_operations'];
    const now = Date.now();

    const results = await Promise.all(
      tiers.map(async (tier) => {
        const config = ADMIN_RATE_LIMITS[tier];
        const current = await this.getCurrentCount(userId, tier);

        return {
          tier,
          current,
          limit: config.limit,
          remaining: Math.max(0, config.limit - current),
          resetAt: new Date(now + (config.windowSeconds * 1000)),
        };
      })
    );

    return results.reduce((acc, result) => {
      acc[result.tier] = {
        current: result.current,
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.resetAt,
      };
      return acc;
    }, {} as Record<AdminRateLimitTier, any>);
  }

  /**
   * Generate Redis key for admin rate limiting
   */
  private getKey(userId: string, tier: AdminRateLimitTier): string {
    return `ratelimit:admin:${tier}:${userId}`;
  }
}

// Export singleton instance
export const adminRateLimitService = new AdminRateLimitService();
