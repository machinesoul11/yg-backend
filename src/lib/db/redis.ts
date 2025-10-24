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
  maxRetriesPerRequest: 3, // Reduced from 5 for faster failover
  retryStrategy(times) {
    if (times > 3) return null; // Stop retrying after 3 attempts
    const delay = Math.min(times * 50, 2000); // Faster initial retries
    return delay;
  },
  enableReadyCheck: false, // Disable for serverless
  enableOfflineQueue: true,
  lazyConnect: true,
  connectTimeout: 5000, // Reduced from 10000
  commandTimeout: 3000, // Reduced from 5000
  keepAlive: 30000,
  family: 4, // Force IPv4
  reconnectOnError(err) {
    // Reconnect on specific errors
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(targetError => err.message.includes(targetError));
  },
});

// Create separate Redis connection for BullMQ with fallback handling
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // BullMQ requires this to be null
  retryStrategy(times) {
    if (times > 5) return null; // Stop retrying after 5 attempts
    const delay = Math.min(times * 100, 2000); // Faster retries
    return delay;
  },
  enableReadyCheck: false,
  enableOfflineQueue: false,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  keepAlive: 30000,
  family: 4, // Force IPv4
  reconnectOnError(err) {
    // Reconnect on specific errors
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
    return targetErrors.some(targetError => err.message.includes(targetError));
  },
});

// Handle connection events with better logging
redis.on('error', (error) => {
  // Filter out noisy errors during startup
  if (!error.message.includes('ECONNRESET') || redis.status === 'ready') {
    console.error('[Redis] Connection error:', error.message);
  }
  // Don't crash on Redis errors - authentication should still work
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('ready', () => {
  console.log('[Redis] Ready to accept commands');
});

redis.on('reconnecting', (delay: number) => {
  console.log(`[Redis] Reconnecting in ${delay}ms...`);
});

redis.on('close', () => {
  console.log('[Redis] Connection closed');
});

redisConnection.on('error', (error) => {
  // Filter out noisy errors
  if (!error.message.includes('ECONNRESET') || redisConnection.status === 'ready') {
    console.error('[Redis BullMQ] Connection error:', error.message);
  }
});

redisConnection.on('connect', () => {
  console.log('[Redis BullMQ] Connected successfully');
});

redisConnection.on('reconnecting', (delay: number) => {
  console.log(`[Redis BullMQ] Reconnecting in ${delay}ms...`);
});

// Attempt initial connection with error handling
(async () => {
  try {
    await redis.connect();
  } catch (error) {
    console.warn('[Redis] Initial connection failed, will retry on first use:', 
      error instanceof Error ? error.message : 'Unknown error');
  }
  
  try {
    await redisConnection.connect();
  } catch (error) {
    console.warn('[Redis BullMQ] Initial connection failed, will retry on first use:', 
      error instanceof Error ? error.message : 'Unknown error');
  }
})();

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
