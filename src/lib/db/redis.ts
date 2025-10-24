/**
 * Redis Client Configuration
 * Centralized Redis connection for caching, rate limiting, and job queues
 * 
 * NOTE: For Upstash in serverless, we use a singleton pattern with manual connection management
 * to avoid connection storms during cold starts
 */
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not defined');
}

// Track connection state globally
let redisInstance: Redis | null = null;
let redisConnectionInstance: Redis | null = null;
let isConnecting = false;
let isConnectionConnecting = false;

/**
 * Get or create Redis client with connection pooling
 * This prevents multiple connections during serverless cold starts
 */
function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(redisUrl!, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        const delay = Math.min(times * 100, 2000);
        return delay;
      },
      enableReadyCheck: false,
      enableOfflineQueue: true,
      lazyConnect: true, // Don't connect immediately
      connectTimeout: 5000,
      commandTimeout: 3000,
      keepAlive: 0, // Disable keep-alive for serverless
      family: 4,
      // Disable automatic reconnection to prevent connection storms
      reconnectOnError: () => false,
    });

    // Only log critical errors
    redisInstance.on('error', (error) => {
      if (!error.message.includes('ECONNRESET') && !error.message.includes('EPIPE')) {
        console.error('[Redis] Critical error:', error.message);
      }
    });
  }
  
  return redisInstance;
}

/**
 * Get or create BullMQ Redis connection
 */
function getBullMQConnection(): Redis {
  if (!redisConnectionInstance) {
    redisConnectionInstance = new Redis(redisUrl!, {
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        if (times > 5) return null;
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      enableReadyCheck: false,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      keepAlive: 0, // Disable keep-alive for serverless
      family: 4,
      reconnectOnError: () => false,
    });

    // Only log critical errors
    redisConnectionInstance.on('error', (error) => {
      if (!error.message.includes('ECONNRESET') && !error.message.includes('EPIPE')) {
        console.error('[Redis BullMQ] Critical error:', error.message);
      }
    });
  }
  
  return redisConnectionInstance;
}

// Export lazy-initialized instances
export const redis = getRedisClient();
export const redisConnection = getBullMQConnection();

// DON'T automatically connect - let connections happen on-demand
// This prevents connection storms in serverless environments

// Add graceful shutdown handling
process.on('SIGINT', () => {
  if (redisInstance && redisInstance.status !== 'end') {
    redisInstance.disconnect();
  }
  if (redisConnectionInstance && redisConnectionInstance.status !== 'end') {
    redisConnectionInstance.disconnect();
  }
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
    // Check Redis connection status - if not ready, fail open
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      // Try to connect lazily
      await redis.connect().catch(() => {
        // Ignore connection errors, fail open
      });
    }
    
    // Double-check status after connection attempt
    if (redis.status !== 'ready') {
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 2000))
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
