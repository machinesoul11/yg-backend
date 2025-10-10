import { DistributedLock } from '@/lib/redis/distributed-lock';
import { getRedisClient } from '@/lib/redis/client';

// Mock Redis client
jest.mock('@/lib/redis/client');

describe('DistributedLock', () => {
  let lock: DistributedLock;
  let mockRedis: jest.Mocked<any>;

  beforeEach(() => {
    mockRedis = {
      set: jest.fn(),
      eval: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      del: jest.fn(),
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    lock = new DistributedLock();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('acquire', () => {
    it('should acquire lock successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await lock.acquire('test:lock');

      expect(result.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:lock',
        expect.any(String),
        'EX',
        30,
        'NX'
      );
    });

    it('should fail to acquire if lock already held', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await lock.acquire('test:lock');

      expect(result.acquired).toBe(false);
    });

    it('should retry acquisition if maxRetries specified', async () => {
      mockRedis.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');

      const result = await lock.acquire('test:lock', { maxRetries: 1, retryDelayMs: 10 });

      expect(result.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('should use custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await lock.acquire('test:lock', { ttlSeconds: 60 });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:lock',
        expect.any(String),
        'EX',
        60,
        'NX'
      );
    });
  });

  describe('release', () => {
    it('should release lock only if we own it', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const result = await lock.acquire('test:lock');
      await result.release();

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("del"'),
        1,
        'test:lock',
        expect.any(String)
      );
    });
  });

  describe('extend', () => {
    it('should extend lock TTL only if we own it', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const result = await lock.acquire('test:lock');
      const extended = await result.extend(30);

      expect(extended).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("expire"'),
        1,
        'test:lock',
        expect.any(String),
        30
      );
    });
  });

  describe('isLocked', () => {
    it('should return true if lock exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await lock.isLocked('test:lock');

      expect(result).toBe(true);
    });

    it('should return false if lock does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await lock.isLocked('test:lock');

      expect(result).toBe(false);
    });
  });

  describe('getTTL', () => {
    it('should return remaining TTL', async () => {
      mockRedis.ttl.mockResolvedValue(25);

      const ttl = await lock.getTTL('test:lock');

      expect(ttl).toBe(25);
    });

    it('should return -2 when lock does not exist', async () => {
      mockRedis.ttl.mockResolvedValue(-2);

      const ttl = await lock.getTTL('test:lock');

      expect(ttl).toBe(-2);
    });
  });

  describe('forceRelease', () => {
    it('should delete lock without checking ownership', async () => {
      mockRedis.del.mockResolvedValue(1);

      await lock.forceRelease('test:lock');

      expect(mockRedis.del).toHaveBeenCalledWith('test:lock');
    });
  });

  describe('withLock', () => {
    it('should execute function with lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fn = jest.fn().mockResolvedValue('result');
      const result = await lock.withLock('test:lock', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalled(); // Lock released
    });

    it('should release lock even if function throws', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fn = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(lock.withLock('test:lock', fn)).rejects.toThrow('Test error');
      expect(mockRedis.eval).toHaveBeenCalled(); // Lock released
    });

    it('should throw if lock cannot be acquired', async () => {
      mockRedis.set.mockResolvedValue(null);

      const fn = jest.fn();

      await expect(lock.withLock('test:lock', fn)).rejects.toThrow(
        'Failed to acquire lock'
      );
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
