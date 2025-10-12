/**
 * Rate Limiter Utility
 * Used for API rate limiting and email throttling
 */
import { redis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

export async function rateLimiter(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  try {
    // Use sorted set for sliding window
    const pipeline = redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Add current request
    pipeline.zadd(key, now, `${now}`);
    
    // Count requests in window
    pipeline.zcard(key);
    
    // Set expiry
    pipeline.expire(key, windowSeconds);
    
    const results = await pipeline.exec();
    
    // Get count from zcard result
    const count = results?.[2]?.[1] as number || 0;
    
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(now + windowMs),
      limit,
    };
  } catch (error) {
    console.error('Rate limiter error:', error);
    // Fail open on Redis errors
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(now + windowMs),
      limit,
    };
  }
}
