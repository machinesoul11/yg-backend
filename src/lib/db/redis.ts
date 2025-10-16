/**
 * Redis Client Configuration
 * Centralized Redis connection for caching, rate limiting, and job queues
 */
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not defined');
}

// Create Redis client for general use with Upstash-optimized settings
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 5,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 5000);
    return delay;
  },
  enableReadyCheck: false, // Disable for serverless
  enableOfflineQueue: true,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  keepAlive: 30000,
  family: 4, // Force IPv4
});

// Create separate Redis connection for BullMQ with fallback handling
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // BullMQ requires this to be null
  retryStrategy(times) {
    if (times > 10) return null; // Stop retrying after 10 attempts
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
  enableReadyCheck: false,
  enableOfflineQueue: false,
  lazyConnect: true,
  connectTimeout: 15000,
  commandTimeout: 8000,
  keepAlive: 30000,
  family: 4, // Force IPv4
});

// Handle connection events with better logging
redis.on('error', (error) => {
  console.error('Redis connection error:', error.message);
  // Don't crash on Redis errors - authentication should still work
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('ready', () => {
  console.log('Redis is ready to accept commands');
});

redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

redisConnection.on('error', (error) => {
  console.error('Redis (BullMQ) connection error:', error.message);
});

redisConnection.on('connect', () => {
  console.log('Redis (BullMQ) connected successfully');
});

// Add graceful shutdown handling
process.on('SIGINT', () => {
  redis.disconnect();
  redisConnection.disconnect();
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
    // Check Redis connection status
    if (redis.status !== 'ready') {
      console.warn('Redis not ready, failing open on rate limiter');
      return {
        allowed: true,
        remaining: limit,
        resetAt: new Date(now + windowMs),
        limit,
      };
    }

    // Use sorted set for sliding window with timeout
    const pipeline = redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Add current request
    pipeline.zadd(key, now, `${now}`);
    
    // Count requests in window
    pipeline.zcard(key);
    
    // Set expiry
    pipeline.expire(key, windowSeconds);
    
    const results = await Promise.race([
      pipeline.exec(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000))
    ]);
    
    // Get count from zcard result
    const count = Array.isArray(results) && results[2] ? results[2][1] as number : 0;
    
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(now + windowMs),
      limit,
    };
  } catch (error) {
    console.error('Rate limiter error:', error instanceof Error ? error.message : error);
    // Fail open on Redis errors - allow authentication to proceed
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(now + windowMs),
      limit,
    };
  }
}
