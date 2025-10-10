import { randomUUID } from 'crypto';
import { getRedisClient } from './client';

export interface LockOptions {
  ttlSeconds?: number;
  retryDelayMs?: number;
  maxRetries?: number;
}

export interface LockResult {
  acquired: boolean;
  release: () => Promise<void>;
  extend: (additionalSeconds: number) => Promise<boolean>;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttlSeconds: 30,
  retryDelayMs: 100,
  maxRetries: 0,
};

export class DistributedLock {
  private redis = getRedisClient();

  /**
   * Acquire a distributed lock
   */
  async acquire(lockKey: string, options: LockOptions = {}): Promise<LockResult> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const lockValue = randomUUID(); // Unique token for this lock instance

    let attempts = 0;
    let acquired = false;

    while (attempts <= config.maxRetries && !acquired) {
      acquired = await this.tryAcquire(lockKey, lockValue, config.ttlSeconds);

      if (!acquired && attempts < config.maxRetries) {
        await this.sleep(config.retryDelayMs);
      }

      attempts++;
    }

    if (!acquired) {
      return {
        acquired: false,
        release: async () => {},
        extend: async () => false,
      };
    }

    // Return lock with release and extend functions
    return {
      acquired: true,
      release: () => this.release(lockKey, lockValue),
      extend: (additionalSeconds: number) => this.extend(lockKey, lockValue, additionalSeconds),
    };
  }

  /**
   * Try to acquire lock once
   */
  private async tryAcquire(lockKey: string, lockValue: string, ttlSeconds: number): Promise<boolean> {
    try {
      // SET key value NX EX ttl
      // NX = only set if not exists
      // EX = expiry in seconds
      const result = await this.redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

      return result === 'OK';
    } catch (error) {
      console.error(`[DistributedLock] Error acquiring lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Release a lock (only if we own it)
   */
  private async release(lockKey: string, lockValue: string): Promise<void> {
    try {
      // Lua script ensures atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redis.eval(script, 1, lockKey, lockValue);
    } catch (error) {
      console.error(`[DistributedLock] Error releasing lock ${lockKey}:`, error);
    }
  }

  /**
   * Extend lock TTL (only if we own it)
   */
  private async extend(lockKey: string, lockValue: string, additionalSeconds: number): Promise<boolean> {
    try {
      // Lua script ensures atomic check-and-extend
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, lockKey, lockValue, additionalSeconds);

      return result === 1;
    } catch (error) {
      console.error(`[DistributedLock] Error extending lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Check if lock is currently held
   */
  async isLocked(lockKey: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      console.error(`[DistributedLock] Error checking lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Get lock TTL
   */
  async getTTL(lockKey: string): Promise<number> {
    try {
      const ttl = await this.redis.ttl(lockKey);
      return ttl;
    } catch (error) {
      console.error(`[DistributedLock] Error getting TTL for lock ${lockKey}:`, error);
      return -2; // Key doesn't exist
    }
  }

  /**
   * Force release lock (use with caution)
   */
  async forceRelease(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
    } catch (error) {
      console.error(`[DistributedLock] Error force releasing lock ${lockKey}:`, error);
    }
  }

  /**
   * Acquire lock with automatic retry
   */
  async acquireWithRetry(
    lockKey: string,
    options: LockOptions & { maxRetries: number }
  ): Promise<LockResult> {
    return this.acquire(lockKey, options);
  }

  /**
   * Execute function with lock
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lock = await this.acquire(lockKey, options);

    if (!lock.acquired) {
      throw new Error(`Failed to acquire lock: ${lockKey}`);
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * Execute function with lock and retry
   */
  async withLockRetry<T>(
    lockKey: string,
    fn: () => Promise<T>,
    options: LockOptions & { maxRetries: number }
  ): Promise<T> {
    const lock = await this.acquireWithRetry(lockKey, options);

    if (!lock.acquired) {
      throw new Error(`Failed to acquire lock after ${options.maxRetries} retries: ${lockKey}`);
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * Helper to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const distributedLock = new DistributedLock();
