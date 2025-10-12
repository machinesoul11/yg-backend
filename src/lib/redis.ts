/**
 * Re-export from centralized redis configuration
 * This file maintains backward compatibility
 */
export { redis, redisConnection, rateLimiter, type RateLimitResult } from './db/redis';
