import { redis } from '@/lib/redis';

export interface EmailRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check email rate limit for a user
 * Default: 50 emails per hour per user
 */
export async function checkEmailRateLimit(
  userId: string,
  limit: number = 50,
  window: number = 3600 // 1 hour in seconds
): Promise<EmailRateLimitResult> {
  const key = `email-rate-limit:${userId}`;

  try {
    const current = await redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + ttl * 1000),
      };
    }

    // Increment counter and set expiry
    await redis.multi().incr(key).expire(key, window).exec();

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: new Date(Date.now() + window * 1000),
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow the email if Redis is down
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + window * 1000),
    };
  }
}

/**
 * Check campaign rate limit (different limits for bulk sends)
 * Default: 10 campaigns per day per user
 */
export async function checkCampaignRateLimit(
  userId: string,
  limit: number = 10,
  window: number = 86400 // 24 hours
): Promise<EmailRateLimitResult> {
  const key = `campaign-rate-limit:${userId}`;

  try {
    const current = await redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + ttl * 1000),
      };
    }

    await redis.multi().incr(key).expire(key, window).exec();

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: new Date(Date.now() + window * 1000),
    };
  } catch (error) {
    console.error('Campaign rate limit check failed:', error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + window * 1000),
    };
  }
}
