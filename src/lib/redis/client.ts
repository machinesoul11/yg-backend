import Redis from 'ioredis';

// Upstash Redis configuration for serverless environments
const redisConfig = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false, // Upstash doesn't support PING command
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET'];
    return targetErrors.some((target) => err.message.includes(target));
  },
  lazyConnect: true, // Don't connect until first command
  connectTimeout: 10000,
  commandTimeout: 5000,
  keepAlive: 30000,
};

// Create Redis client instance
const createRedisClient = () => {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  const client = new Redis(process.env.REDIS_URL, redisConfig);

  // Event listeners for monitoring
  client.on('connect', () => {
    console.log('[Redis] Connected to Redis');
  });

  client.on('ready', () => {
    console.log('[Redis] Redis client ready');
  });

  client.on('error', (err) => {
    console.error('[Redis] Redis error:', err);
  });

  client.on('close', () => {
    console.warn('[Redis] Redis connection closed');
  });

  client.on('reconnecting', (delay) => {
    console.warn(`[Redis] Reconnecting to Redis in ${delay}ms`);
  });

  client.on('end', () => {
    console.warn('[Redis] Redis connection ended');
  });

  return client;
};

// Singleton pattern for serverless environments
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

// Graceful shutdown
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Client closed successfully');
  }
}

// Health check
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}> {
  try {
    const client = getRedisClient();
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;

    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export default client getter (lazy initialization)
export default { getClient: getRedisClient };
