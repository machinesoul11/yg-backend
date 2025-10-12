/**
 * Redis Client Configuration
 * Centralized Redis connection for caching, rate limiting, and job queues
 */
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not defined');
}

// Create Redis client for general use
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableReadyCheck: true,
  enableOfflineQueue: true,
});

// Create separate Redis connection for BullMQ
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // BullMQ handles retries
  enableReadyCheck: false,
  enableOfflineQueue: false,
});

// Handle connection events
redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redisConnection.on('error', (error) => {
  console.error('Redis (BullMQ) connection error:', error);
});

/**
 * Rate Limiter Utility
 */
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
