/**
 * Integration tests for Redis
 * These tests require a running Redis instance
 * Run with: REDIS_URL=redis://localhost:6379 npm test
 */

import { getRedisClient, closeRedisClient } from '@/lib/redis/client';
import { cacheService } from '@/lib/redis/cache.service';
import { rateLimiter } from '@/lib/redis/rate-limiter';
import { distributedLock } from '@/lib/redis/distributed-lock';
import { RedisKeys, RedisTTL } from '@/lib/redis/keys';

describe('Redis Integration Tests', () => {
  let redis: ReturnType<typeof getRedisClient>;

  beforeAll(async () => {
    redis = getRedisClient();
  });

  afterAll(async () => {
    await closeRedisClient();
  });

  afterEach(async () => {
    // Clean up test keys
    const keys = await redis.keys('test:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Cache Service Integration', () => {
    it('should set and get data with TTL', async () => {
      const testData = { userId: '123', name: 'Test User', email: 'test@example.com' };

      await cacheService.set('test:user:123', testData, 10);
      const result = await cacheService.get('test:user:123');

      expect(result).toEqual(testData);

      // Verify TTL
      const ttl = await redis.ttl('test:user:123');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });

    it('should expire data after TTL', async () => {
      await cacheService.set('test:temp', { value: 'test' }, 1);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await cacheService.get('test:temp');
      expect(result).toBeNull();
    }, 3000);

    it('should invalidate pattern correctly', async () => {
      await cacheService.set('test:user:1', { name: 'User 1' }, 60);
      await cacheService.set('test:user:2', { name: 'User 2' }, 60);
      await cacheService.set('test:other:1', { name: 'Other' }, 60);

      const deleted = await cacheService.deletePattern('test:user:*');

      expect(deleted).toBe(2);
      expect(await cacheService.get('test:user:1')).toBeNull();
      expect(await cacheService.get('test:user:2')).toBeNull();
      expect(await cacheService.get('test:other:1')).not.toBeNull();
    });

    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) =>
        cacheService.set(`test:concurrent:${i}`, { index: i }, 60)
      );

      await Promise.all(operations);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => cacheService.get(`test:concurrent:${i}`))
      );

      results.forEach((result, i) => {
        expect(result).toEqual({ index: i });
      });
    });

    it('should warm cache correctly', async () => {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return { data: 'fresh' };
      };

      // First call should fetch
      const result1 = await cacheService.warmCache('test:warm', fetcher, 60);
      expect(result1).toEqual({ data: 'fresh' });
      expect(fetchCount).toBe(1);

      // Second call should use cache
      const result2 = await cacheService.warmCache('test:warm', fetcher, 60);
      expect(result2).toEqual({ data: 'fresh' });
      expect(fetchCount).toBe(1); // Not called again
    });
  });

  describe('Rate Limiter Integration', () => {
    it('should enforce rate limits', async () => {
      const limit = 5;
      const results = [];

      for (let i = 0; i < 7; i++) {
        const result = await rateLimiter.checkLimit('test-user', 'api', {
          limit,
          windowSeconds: 60,
        });
        results.push(result);
      }

      // First 5 should be allowed
      expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
      // Last 2 should be denied
      expect(results.slice(5).every((r) => !r.allowed)).toBe(true);
    });

    it('should reset rate limit correctly', async () => {
      await rateLimiter.checkLimit('test-user', 'api', { limit: 1, windowSeconds: 60 });
      await rateLimiter.checkLimit('test-user', 'api', { limit: 1, windowSeconds: 60 });

      let result = await rateLimiter.checkLimit('test-user', 'api', { limit: 1, windowSeconds: 60 });
      expect(result.allowed).toBe(false);

      await rateLimiter.reset('test-user', 'api');

      result = await rateLimiter.checkLimit('test-user', 'api', { limit: 1, windowSeconds: 60 });
      expect(result.allowed).toBe(true);
    });

    it('should track remaining count correctly', async () => {
      const limit = 10;

      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit('test-user', 'upload', {
          limit,
          windowSeconds: 60,
        });
        expect(result.remaining).toBe(limit - (i + 1));
      }
    });
  });

  describe('Distributed Lock Integration', () => {
    it('should acquire and release lock', async () => {
      const lockKey = 'test:lock:operation';

      const lock = await distributedLock.acquire(lockKey, { ttlSeconds: 10 });

      expect(lock.acquired).toBe(true);
      expect(await distributedLock.isLocked(lockKey)).toBe(true);

      await lock.release();

      expect(await distributedLock.isLocked(lockKey)).toBe(false);
    });

    it('should prevent concurrent access', async () => {
      const lockKey = 'test:lock:concurrent';
      let sharedCounter = 0;

      const increment = async () => {
        const lock = await distributedLock.acquire(lockKey, {
          ttlSeconds: 1,
          maxRetries: 5,
          retryDelayMs: 50,
        });

        if (!lock.acquired) {
          throw new Error('Failed to acquire lock');
        }

        try {
          // Simulate some work
          const current = sharedCounter;
          await new Promise((resolve) => setTimeout(resolve, 10));
          sharedCounter = current + 1;
        } finally {
          await lock.release();
        }
      };

      // Run 5 concurrent increments
      await Promise.all([increment(), increment(), increment(), increment(), increment()]);

      expect(sharedCounter).toBe(5);
    }, 10000);

    it('should execute function with lock', async () => {
      const lockKey = 'test:lock:function';
      let executed = false;

      const result = await distributedLock.withLock(
        lockKey,
        async () => {
          executed = true;
          return 'success';
        },
        { ttlSeconds: 5 }
      );

      expect(executed).toBe(true);
      expect(result).toBe('success');
      expect(await distributedLock.isLocked(lockKey)).toBe(false);
    });

    it('should release lock even if function throws', async () => {
      const lockKey = 'test:lock:error';

      await expect(
        distributedLock.withLock(
          lockKey,
          async () => {
            throw new Error('Test error');
          },
          { ttlSeconds: 5 }
        )
      ).rejects.toThrow('Test error');

      expect(await distributedLock.isLocked(lockKey)).toBe(false);
    });

    it('should extend lock TTL', async () => {
      const lockKey = 'test:lock:extend';

      const lock = await distributedLock.acquire(lockKey, { ttlSeconds: 5 });

      expect(lock.acquired).toBe(true);

      const extended = await lock.extend(10);
      expect(extended).toBe(true);

      const ttl = await distributedLock.getTTL(lockKey);
      expect(ttl).toBeGreaterThan(5);

      await lock.release();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle upload session workflow', async () => {
      const sessionId = 'test-session-123';
      const session = {
        userId: 'user-456',
        fileName: 'test.jpg',
        fileSize: 1024000,
        storageKey: 'uploads/test.jpg',
        createdAt: new Date().toISOString(),
      };

      // Store session
      await cacheService.set(RedisKeys.session.upload(sessionId), session, RedisTTL.UPLOAD_SESSION);

      // Retrieve session
      const retrieved = await cacheService.get(RedisKeys.session.upload(sessionId));
      expect(retrieved).toEqual(session);

      // Clean up session
      await cacheService.delete(RedisKeys.session.upload(sessionId));
      expect(await cacheService.get(RedisKeys.session.upload(sessionId))).toBeNull();
    });

    it('should handle creator profile caching', async () => {
      const creatorId = 'creator-789';
      const profile = {
        id: creatorId,
        stageName: 'Test Creator',
        bio: 'Test bio',
        assetCount: 25,
        licenseCount: 10,
      };

      // Cache profile
      await cacheService.set(RedisKeys.cache.creator(creatorId), profile, RedisTTL.CREATOR_PROFILE);

      // Retrieve from cache
      const cached = await cacheService.get(RedisKeys.cache.creator(creatorId));
      expect(cached).toEqual(profile);

      // Invalidate on update
      await cacheService.invalidateCreator(creatorId);
      expect(await cacheService.get(RedisKeys.cache.creator(creatorId))).toBeNull();
    });

    it('should handle royalty calculation with lock', async () => {
      const runId = 'royalty-run-123';
      let calculationStarted = false;
      let calculationCompleted = false;

      const calculateRoyalties = async () => {
        return await distributedLock.withLock(
          RedisKeys.lock.royaltyRun(runId),
          async () => {
            calculationStarted = true;
            // Simulate calculation
            await new Promise((resolve) => setTimeout(resolve, 50));
            calculationCompleted = true;
            return { totalRoyalties: 10000 };
          },
          { ttlSeconds: 60 }
        );
      };

      const result = await calculateRoyalties();

      expect(calculationStarted).toBe(true);
      expect(calculationCompleted).toBe(true);
      expect(result.totalRoyalties).toBe(10000);
      expect(await distributedLock.isLocked(RedisKeys.lock.royaltyRun(runId))).toBe(false);
    });
  });
});
