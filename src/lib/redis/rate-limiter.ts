import { getRedisClient } from './client';
import { RedisKeys, RedisTTL } from './keys';

export type RateLimitAction = 'api' | 'upload' | 'message' | 'login' | 'passwordReset' | 'webhook';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
  current: number;
}

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

// Default rate limit configurations
const DEFAULT_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  api: { limit: 100, windowSeconds: RedisTTL.API_RATE_LIMIT }, // 100 requests per hour
  upload: { limit: 20, windowSeconds: RedisTTL.UPLOAD_RATE_LIMIT }, // 20 uploads per hour
  message: { limit: 10, windowSeconds: RedisTTL.MESSAGE_RATE_LIMIT }, // 10 messages per minute
  login: { limit: 5, windowSeconds: RedisTTL.LOGIN_RATE_LIMIT }, // 5 attempts per 15 minutes
  passwordReset: { limit: 3, windowSeconds: RedisTTL.PASSWORD_RESET_RATE_LIMIT }, // 3 resets per hour
  webhook: { limit: 1000, windowSeconds: 3600 }, // 1000 requests per hour
};

export class RateLimiter {
  private redis = getRedisClient();

  /**
   * Check if action is within rate limit
   */
  async checkLimit(
    identifier: string,
    action: RateLimitAction,
    customConfig?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const config = {
      ...DEFAULT_LIMITS[action],
      ...customConfig,
    };

    const key = this.getKeyForAction(action, identifier);

    try {
      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      const [[incrErr, current], [ttlErr, ttl]] = results as [[Error | null, number], [Error | null, number]];

      if (incrErr || ttlErr) {
        throw incrErr || ttlErr;
      }

      // Set expiry on first increment (when ttl is -1)
      if (ttl === -1) {
        await this.redis.expire(key, config.windowSeconds);
      }

      const actualTtl = ttl === -1 ? config.windowSeconds : ttl;
      const resetAt = new Date(Date.now() + actualTtl * 1000);

      return {
        allowed: current <= config.limit,
        remaining: Math.max(0, config.limit - current),
        resetAt,
        limit: config.limit,
        current,
      };
    } catch (error) {
      console.error(`[RateLimiter] Error checking limit for ${action}:${identifier}:`, error);

      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        remaining: config.limit,
        resetAt: new Date(Date.now() + config.windowSeconds * 1000),
        limit: config.limit,
        current: 0,
      };
    }
  }

  /**
   * Check limit and throw error if exceeded
   */
  async checkLimitOrThrow(
    identifier: string,
    action: RateLimitAction,
    customConfig?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const result = await this.checkLimit(identifier, action, customConfig);

    if (!result.allowed) {
      const error = new Error(
        `Rate limit exceeded for ${action}. Limit: ${result.limit}, Current: ${result.current}. Resets at ${result.resetAt.toISOString()}`
      );
      (error as any).code = 'RATE_LIMIT_EXCEEDED';
      (error as any).rateLimitInfo = result;
      throw error;
    }

    return result;
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string, action: RateLimitAction): Promise<void> {
    const key = this.getKeyForAction(action, identifier);

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`[RateLimiter] Error resetting limit for ${action}:${identifier}:`, error);
      throw error;
    }
  }

  /**
   * Get current count for identifier
   */
  async getCount(identifier: string, action: RateLimitAction): Promise<number> {
    const key = this.getKeyForAction(action, identifier);

    try {
      const count = await this.redis.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      console.error(`[RateLimiter] Error getting count for ${action}:${identifier}:`, error);
      return 0;
    }
  }

  /**
   * Decrement count (useful for rolling back failed operations)
   */
  async decrement(identifier: string, action: RateLimitAction): Promise<void> {
    const key = this.getKeyForAction(action, identifier);

    try {
      const count = await this.redis.get(key);
      if (count && parseInt(count, 10) > 0) {
        await this.redis.decr(key);
      }
    } catch (error) {
      console.error(`[RateLimiter] Error decrementing count for ${action}:${identifier}:`, error);
    }
  }

  /**
   * Get remaining time until reset
   */
  async getResetTime(identifier: string, action: RateLimitAction): Promise<Date | null> {
    const key = this.getKeyForAction(action, identifier);

    try {
      const ttl = await this.redis.ttl(key);

      if (ttl <= 0) {
        return null;
      }

      return new Date(Date.now() + ttl * 1000);
    } catch (error) {
      console.error(`[RateLimiter] Error getting reset time for ${action}:${identifier}:`, error);
      return null;
    }
  }

  /**
   * Batch check multiple rate limits
   */
  async checkMultipleLimits(
    checks: Array<{
      identifier: string;
      action: RateLimitAction;
      config?: Partial<RateLimitConfig>;
    }>
  ): Promise<RateLimitResult[]> {
    const results = await Promise.all(
      checks.map(({ identifier, action, config }) => this.checkLimit(identifier, action, config))
    );

    return results;
  }

  /**
   * Get appropriate Redis key for action
   */
  private getKeyForAction(action: RateLimitAction, identifier: string): string {
    switch (action) {
      case 'api':
        return RedisKeys.rateLimit.api(identifier);
      case 'upload':
        return RedisKeys.rateLimit.upload(identifier);
      case 'message':
        return RedisKeys.rateLimit.message(identifier);
      case 'login':
        return RedisKeys.rateLimit.login(identifier);
      case 'passwordReset':
        return RedisKeys.rateLimit.passwordReset(identifier);
      case 'webhook':
        return RedisKeys.rateLimit.webhook(identifier);
      default:
        throw new Error(`Unknown rate limit action: ${action}`);
    }
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
