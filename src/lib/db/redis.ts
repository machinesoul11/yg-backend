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
      maxRetriesPerRequest: 10, // Increased from 3 to allow more retries before timeout
      retryStrategy(times) {
        if (times > 10) {
          console.error('[Redis] Max retries reached, giving up');
          return null;
        }
        const delay = Math.min(times * 100, 3000); // Max 3 second delay
        console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      enableReadyCheck: true,
      enableOfflineQueue: true, // ✅ CRITICAL: Queue commands during brief disconnects
      lazyConnect: false, // Connect immediately to avoid INSUFFICIENT_RESOURCES errors
      connectTimeout: 30000, // Increased to 30 seconds for unstable connections
      commandTimeout: 15000, // Increased to 15 seconds per command
      keepAlive: 30000, // Keep connection alive
      family: 4,
      // Allow reconnection on errors
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true; // Reconnect on READONLY errors
        }
        return false;
      },
    });

    // Log all errors for debugging
    redisInstance.on('error', (error) => {
      console.error('[Redis] Connection error:', error.message);
    });

    // Log when connected
    redisInstance.on('connect', () => {
      console.info('[Redis] Connected successfully');
    });

    // Log when ready
    redisInstance.on('ready', () => {
      console.info('[Redis] Ready to accept commands');
    });

    // Log when connection closes
    redisInstance.on('close', () => {
      console.warn('[Redis] Connection closed');
    });

    // Log when reconnecting
    redisInstance.on('reconnecting', () => {
      console.warn('[Redis] Reconnecting...');
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
      maxRetriesPerRequest: null, // BullMQ requires null for unlimited retries
      retryStrategy(times) {
        if (times > 10) {
          console.error('[Redis BullMQ] Max retries reached, giving up');
          return null;
        }
        const delay = Math.min(times * 200, 3000); // Max 3 second delay
        console.log(`[Redis BullMQ] Retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      enableReadyCheck: true,
      enableOfflineQueue: true, // Enable offline queue for BullMQ
      lazyConnect: false, // Connect immediately to avoid INSUFFICIENT_RESOURCES errors
      connectTimeout: 10000, // Increased to 10 seconds
      commandTimeout: 10000, // Increased to 10 seconds per command (was 5s)
      keepAlive: 30000, // Keep connection alive
      family: 4,
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    // Log all errors for debugging
    redisConnectionInstance.on('error', (error) => {
      console.error('[Redis BullMQ] Connection error:', error.message);
    });

    // Log when connected
    redisConnectionInstance.on('connect', () => {
      console.info('[Redis BullMQ] Connected successfully');
    });

    // Log when ready
    redisConnectionInstance.on('ready', () => {
      console.info('[Redis BullMQ] Ready to accept commands');
    });

    // Log when connection closes
    redisConnectionInstance.on('close', () => {
      console.warn('[Redis BullMQ] Connection closed');
    });

    // Log when reconnecting
    redisConnectionInstance.on('reconnecting', () => {
      console.warn('[Redis BullMQ] Reconnecting...');
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
