/**
 * Job Rate Limiter
 * 
 * Implements distributed rate limiting for background jobs using Redis
 * to prevent resource exhaustion and respect external API limits.
 */

import { Redis } from 'ioredis';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { RATE_LIMITS } from './config';

export interface RateLimitConfig {
  name: string;
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number; // How long to block after hitting limit
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

export class JobRateLimiter {
  private redis: Redis;
  
  constructor(redis?: Redis) {
    this.redis = redis || getBullMQRedisClient();
  }
  
  /**
   * Check if a job can be executed within rate limits
   */
  async checkLimit(config: RateLimitConfig): Promise<RateLimitResult> {
    const key = `rate_limit:${config.name}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Use Redis sorted set to track requests in time window
    const multi = this.redis.multi();
    
    // Remove old entries outside the window
    multi.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current requests in window
    multi.zcard(key);
    
    // Add current request timestamp
    multi.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry on the key
    multi.expire(key, Math.ceil(config.windowMs / 1000) + 60);
    
    const results = await multi.exec();
    
    if (!results) {
      throw new Error('Rate limit check failed');
    }
    
    const currentCount = results[1][1] as number;
    const allowed = currentCount < config.maxRequests;
    
    // If not allowed, remove the request we just added
    if (!allowed) {
      await this.redis.zpopmax(key);
    }
    
    const resetAt = new Date(now + config.windowMs);
    const remaining = Math.max(0, config.maxRequests - currentCount);
    
    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs: !allowed ? config.blockDurationMs || config.windowMs : undefined,
    };
  }
  
  /**
   * Check sliding window rate limit (more precise)
   */
  async checkSlidingWindowLimit(config: RateLimitConfig): Promise<RateLimitResult> {
    const key = `rate_limit:sliding:${config.name}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Lua script for atomic sliding window check
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])
      local request_id = ARGV[5]
      
      -- Remove old entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
      
      -- Count current requests
      local current_count = redis.call('ZCARD', key)
      
      -- Check if we can add a new request
      if current_count < max_requests then
        redis.call('ZADD', key, now, request_id)
        redis.call('EXPIRE', key, math.ceil(window_ms / 1000) + 60)
        return {1, max_requests - current_count - 1}
      else
        return {0, 0}
      end
    `;
    
    const requestId = `${now}-${Math.random()}`;
    const result = await this.redis.eval(
      script,
      1,
      key,
      now,
      windowStart,
      config.maxRequests,
      config.windowMs,
      requestId
    ) as [number, number];
    
    const allowed = result[0] === 1;
    const remaining = result[1];
    const resetAt = new Date(now + config.windowMs);
    
    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs: !allowed ? config.blockDurationMs || config.windowMs : undefined,
    };
  }
  
  /**
   * Token bucket rate limiter (for bursty traffic)
   */
  async checkTokenBucket(config: RateLimitConfig & { refillRate: number }): Promise<RateLimitResult> {
    const key = `rate_limit:bucket:${config.name}`;
    const now = Date.now();
    
    const script = `
      local key = KEYS[1]
      local max_tokens = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or max_tokens
      local last_refill = tonumber(bucket[2]) or now
      
      -- Calculate tokens to add based on time elapsed
      local time_elapsed = now - last_refill
      local tokens_to_add = math.floor((time_elapsed / 1000) * refill_rate)
      tokens = math.min(tokens + tokens_to_add, max_tokens)
      
      local allowed = 0
      local remaining = tokens
      
      if tokens >= 1 then
        tokens = tokens - 1
        allowed = 1
        remaining = tokens
      end
      
      -- Update bucket
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, 3600)
      
      return {allowed, remaining}
    `;
    
    const result = await this.redis.eval(
      script,
      1,
      key,
      config.maxRequests,
      config.refillRate,
      now
    ) as [number, number];
    
    const allowed = result[0] === 1;
    const remaining = result[1];
    const resetAt = new Date(now + config.windowMs);
    
    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs: !allowed ? Math.ceil((1 - remaining) / config.refillRate * 1000) : undefined,
    };
  }
  
  /**
   * Get current rate limit status without consuming
   */
  async getStatus(limitName: string): Promise<{
    count: number;
    window: string;
  }> {
    const key = `rate_limit:${limitName}`;
    const count = await this.redis.zcard(key);
    const ttl = await this.redis.ttl(key);
    
    return {
      count,
      window: ttl > 0 ? `${ttl}s` : 'expired',
    };
  }
  
  /**
   * Reset a rate limit (for emergencies or testing)
   */
  async reset(limitName: string): Promise<void> {
    const keys = await this.redis.keys(`rate_limit*:${limitName}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
  
  /**
   * Get rate limit statistics
   */
  async getStatistics(limitName: string): Promise<{
    currentCount: number;
    peakCount: number;
    avgCount: number;
    hitCount: number;
  }> {
    const statsKey = `rate_limit:stats:${limitName}`;
    const stats = await this.redis.hgetall(statsKey);
    
    return {
      currentCount: parseInt(stats.current || '0'),
      peakCount: parseInt(stats.peak || '0'),
      avgCount: parseFloat(stats.avg || '0'),
      hitCount: parseInt(stats.hits || '0'),
    };
  }
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

const rateLimiter = new JobRateLimiter();

export const emailSendingLimiter = {
  perMinute: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'email-sending-per-minute',
      maxRequests: RATE_LIMITS.EMAIL_SENDING.perMinute,
      windowMs: 60 * 1000,
      blockDurationMs: 10 * 1000, // Wait 10s before retry
    });
  },
  
  perHour: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'email-sending-per-hour',
      maxRequests: RATE_LIMITS.EMAIL_SENDING.perHour,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 60 * 1000, // Wait 1min before retry
    });
  },
  
  perDay: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'email-sending-per-day',
      maxRequests: RATE_LIMITS.EMAIL_SENDING.perDay,
      windowMs: 24 * 60 * 60 * 1000,
      blockDurationMs: 300 * 1000, // Wait 5min before retry
    });
  },
};

export const emailCampaignLimiter = {
  perMinute: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'email-campaign-per-minute',
      maxRequests: RATE_LIMITS.EMAIL_CAMPAIGN.perMinute,
      windowMs: 60 * 1000,
      blockDurationMs: 10 * 1000,
    });
  },
  
  perHour: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'email-campaign-per-hour',
      maxRequests: RATE_LIMITS.EMAIL_CAMPAIGN.perHour,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 60 * 1000,
    });
  },
};

export const stripeApiLimiter = {
  perSecond: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkTokenBucket({
      name: 'stripe-api-per-second',
      maxRequests: RATE_LIMITS.STRIPE_API.perSecond,
      windowMs: 1000,
      refillRate: RATE_LIMITS.STRIPE_API.perSecond / 10, // Refill 10 times per second
      blockDurationMs: 1000,
    });
  },
};

export const resendApiLimiter = {
  perSecond: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkTokenBucket({
      name: 'resend-api-per-second',
      maxRequests: RATE_LIMITS.RESEND_API.perSecond,
      windowMs: 1000,
      refillRate: RATE_LIMITS.RESEND_API.perSecond / 10,
      blockDurationMs: 1000,
    });
  },
};

export const searchIndexingLimiter = {
  perSecond: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'search-indexing-per-second',
      maxRequests: RATE_LIMITS.SEARCH_INDEXING.perSecond,
      windowMs: 1000,
      blockDurationMs: 1000,
    });
  },
  
  perMinute: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'search-indexing-per-minute',
      maxRequests: RATE_LIMITS.SEARCH_INDEXING.perMinute,
      windowMs: 60 * 1000,
      blockDurationMs: 5000,
    });
  },
};

export const assetProcessingLimiter = {
  perMinute: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'asset-processing-per-minute',
      maxRequests: RATE_LIMITS.ASSET_PROCESSING.perMinute,
      windowMs: 60 * 1000,
      blockDurationMs: 10 * 1000,
    });
  },
  
  perHour: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'asset-processing-per-hour',
      maxRequests: RATE_LIMITS.ASSET_PROCESSING.perHour,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 60 * 1000,
    });
  },
};

export const taxGenerationLimiter = {
  perMinute: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'tax-generation-per-minute',
      maxRequests: RATE_LIMITS.TAX_GENERATION.perMinute,
      windowMs: 60 * 1000,
      blockDurationMs: 5000,
    });
  },
  
  perHour: async (): Promise<RateLimitResult> => {
    return rateLimiter.checkSlidingWindowLimit({
      name: 'tax-generation-per-hour',
      maxRequests: RATE_LIMITS.TAX_GENERATION.perHour,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 60 * 1000,
    });
  },
};

// Export the base rate limiter for custom use cases
export { rateLimiter };
