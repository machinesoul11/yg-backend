import { CacheService } from '@/lib/redis/cache.service';
import { getRedisClient } from '@/lib/redis/client';

// Mock Redis client
jest.mock('@/lib/redis/client');

describe('CacheService', () => {
  let cache: CacheService;
  let mockRedis: jest.Mocked<any>;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      incrby: jest.fn(),
      decrby: jest.fn(),
      mget: jest.fn(),
      pipeline: jest.fn(),
      info: jest.fn(),
      dbsize: jest.fn(),
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    cache = new CacheService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return parsed JSON when key exists', async () => {
      const data = { id: '123', name: 'Test User' };
      mockRedis.get.mockResolvedValue(JSON.stringify(data));

      const result = await cache.get('test:key');

      expect(result).toEqual(data);
      expect(mockRedis.get).toHaveBeenCalledWith('test:key');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get('test:key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('test:key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should stringify value and set with TTL', async () => {
      const data = { id: '123', name: 'Test User' };
      mockRedis.setex.mockResolvedValue('OK');

      await cache.set('test:key', data, 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith('test:key', 3600, JSON.stringify(data));
    });

    it('should throw on error', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(cache.set('test:key', { data: 'test' }, 3600)).rejects.toThrow('Redis error');
    });
  });

  describe('delete', () => {
    it('should delete key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cache.delete('test:key');

      expect(mockRedis.del).toHaveBeenCalledWith('test:key');
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple keys', async () => {
      mockRedis.del.mockResolvedValue(3);

      await cache.deleteMany(['key1', 'key2', 'key3']);

      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should not call del if keys array is empty', async () => {
      await cache.deleteMany([]);

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('deletePattern', () => {
    it('should delete all keys matching pattern', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedis.del.mockResolvedValue(3);

      const deleted = await cache.deletePattern('test:*');

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
      expect(deleted).toBe(3);
    });

    it('should return 0 if no keys match', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const deleted = await cache.deletePattern('test:*');

      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(deleted).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cache.exists('test:key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cache.exists('test:key');

      expect(result).toBe(false);
    });
  });

  describe('getTTL', () => {
    it('should return TTL in seconds', async () => {
      mockRedis.ttl.mockResolvedValue(3600);

      const ttl = await cache.getTTL('test:key');

      expect(ttl).toBe(3600);
    });

    it('should return -2 when key does not exist', async () => {
      mockRedis.ttl.mockResolvedValue(-2);

      const ttl = await cache.getTTL('test:key');

      expect(ttl).toBe(-2);
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      mockRedis.incrby.mockResolvedValue(5);

      const result = await cache.increment('test:counter', 5);

      expect(mockRedis.incrby).toHaveBeenCalledWith('test:counter', 5);
      expect(result).toBe(5);
    });

    it('should increment by 1 when amount not specified', async () => {
      mockRedis.incrby.mockResolvedValue(1);

      const result = await cache.increment('test:counter');

      expect(mockRedis.incrby).toHaveBeenCalledWith('test:counter', 1);
      expect(result).toBe(1);
    });
  });

  describe('getMany', () => {
    it('should return array of values', async () => {
      const values = [JSON.stringify({ id: '1' }), JSON.stringify({ id: '2' }), null];
      mockRedis.mget.mockResolvedValue(values);

      const result = await cache.getMany(['key1', 'key2', 'key3']);

      expect(result).toEqual([{ id: '1' }, { id: '2' }, null]);
    });

    it('should return empty array when no keys provided', async () => {
      const result = await cache.getMany([]);

      expect(result).toEqual([]);
      expect(mockRedis.mget).not.toHaveBeenCalled();
    });
  });

  describe('setMany', () => {
    it('should set multiple keys with pipeline', async () => {
      const mockPipeline = {
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const entries = [
        { key: 'key1', value: { id: '1' }, ttl: 60 },
        { key: 'key2', value: { id: '2' }, ttl: 120 },
      ];

      await cache.setMany(entries);

      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('warmCache', () => {
    it('should return cached value if exists', async () => {
      const cached = { id: '123', name: 'Cached' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const fetcher = jest.fn().mockResolvedValue({ id: '123', name: 'Fresh' });
      const result = await cache.warmCache('test:key', fetcher, 3600);

      expect(result).toEqual(cached);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const fresh = { id: '123', name: 'Fresh' };
      const fetcher = jest.fn().mockResolvedValue(fresh);
      const result = await cache.warmCache('test:key', fetcher, 3600);

      expect(result).toEqual(fresh);
      expect(fetcher).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedis.info.mockResolvedValue(`
# Stats
keyspace_hits:1000
keyspace_misses:200

# Memory
used_memory_human:10M
      `);
      mockRedis.dbsize.mockResolvedValue(500);

      const stats = await cache.getStats();

      expect(stats.totalKeys).toBe(500);
      expect(stats.memoryUsed).toBe('10M');
      expect(stats.hitRate).toBeCloseTo(83.33, 2);
    });
  });
});
