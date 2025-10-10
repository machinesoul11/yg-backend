import { RateLimiter } from '@/lib/redis/rate-limiter';
import { getRedisClient } from '@/lib/redis/client';

// Mock Redis client
jest.mock('@/lib/redis/client');

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  let mockRedis: jest.Mocked<any>;

  beforeEach(() => {
    mockRedis = {
      pipeline: jest.fn(),
      incr: jest.fn(),
      ttl: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      decr: jest.fn(),
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    limiter = new RateLimiter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLimit', () => {
    it('should allow request within limit', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        ttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 5], // incr result
          [null, 3600], // ttl result
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      mockRedis.expire.mockResolvedValue(1);

      const result = await limiter.checkLimit('user123', 'api');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.remaining).toBe(95);
      expect(result.limit).toBe(100);
    });

    it('should deny request when limit exceeded', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        ttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 101], // incr result
          [null, 3600], // ttl result
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const result = await limiter.checkLimit('user123', 'api');

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(101);
      expect(result.remaining).toBe(0);
    });

    it('should set expiry on first increment', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        ttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1], // first increment
          [null, -1], // no ttl
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      mockRedis.expire.mockResolvedValue(1);

      await limiter.checkLimit('user123', 'api');

      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should use custom config when provided', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        ttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 5],
          [null, 60],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const result = await limiter.checkLimit('user123', 'api', {
        limit: 10,
        windowSeconds: 60,
      });

      expect(result.limit).toBe(10);
    });

    it('should fail open on Redis error', async () => {
      mockRedis.pipeline.mockImplementation(() => {
        throw new Error('Redis error');
      });

      const result = await limiter.checkLimit('user123', 'api');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
    });
  });

  describe('checkLimitOrThrow', () => {
    it('should throw error when limit exceeded', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        ttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 101],
          [null, 3600],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await expect(limiter.checkLimitOrThrow('user123', 'api')).rejects.toThrow(
        /Rate limit exceeded/
      );
    });

    it('should not throw when within limit', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        ttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 5],
          [null, 3600],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await expect(limiter.checkLimitOrThrow('user123', 'api')).resolves.not.toThrow();
    });
  });

  describe('reset', () => {
    it('should delete rate limit key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await limiter.reset('user123', 'api');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('getCount', () => {
    it('should return current count', async () => {
      mockRedis.get.mockResolvedValue('42');

      const count = await limiter.getCount('user123', 'api');

      expect(count).toBe(42);
    });

    it('should return 0 when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const count = await limiter.getCount('user123', 'api');

      expect(count).toBe(0);
    });
  });

  describe('decrement', () => {
    it('should decrement count if greater than 0', async () => {
      mockRedis.get.mockResolvedValue('5');
      mockRedis.decr.mockResolvedValue(4);

      await limiter.decrement('user123', 'api');

      expect(mockRedis.decr).toHaveBeenCalled();
    });

    it('should not decrement if count is 0', async () => {
      mockRedis.get.mockResolvedValue('0');

      await limiter.decrement('user123', 'api');

      expect(mockRedis.decr).not.toHaveBeenCalled();
    });
  });
});
