import Redis from 'ioredis';

// Upstash Redis configuration for serverless environments
const redisConfig = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false, // Upstash doesn't support PING command
  retryStrategy: (times: number) => {
    // Exponential backoff with max delay of 1 second
    const delay = Math.min(times * 100, 1000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ETIMEDOUT'];
    return targetErrors.some((target) => err.message.includes(target));
  },
  lazyConnect: false, // Connect immediately for serverless
  connectTimeout: 5000, // Shorter timeout for serverless
  commandTimeout: 3000,
  enableOfflineQueue: false, // Don't queue commands when disconnected
  keepAlive: 0, // Disable keep-alive in serverless
  family: 6, // Use IPv6 (Upstash supports it)
  // Disable automatic reconnection in serverless - let each invocation create fresh connections
  autoResubscribe: false,
  autoResendUnfulfilledCommands: false,
};

// Create Redis client instance
const createRedisClient = () => {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  const client = new Redis(process.env.REDIS_URL, redisConfig);

  // Event listeners for monitoring (reduced logging for production)
  if (process.env.NODE_ENV === 'development') {
    client.on('connect', () => {
      console.log('[Redis] Connected');
    });
  }

  client.on('error', (err) => {
    // Only log non-connection-reset errors in production
    if (err.message && !err.message.includes('ECONNRESET')) {
      console.error('[Redis] Error:', err.message);
    }
  });

  return client;
};

// BullMQ-specific Redis configuration (maxRetriesPerRequest must be null)
const bullmqRedisConfig = {
  maxRetriesPerRequest: null, // BullMQ handles retries
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 1000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ETIMEDOUT'];
    return targetErrors.some((target) => err.message.includes(target));
  },
  lazyConnect: false,
  connectTimeout: 5000,
  commandTimeout: 3000,
  enableOfflineQueue: false,
  keepAlive: 0,
  family: 6,
  autoResubscribe: false,
  autoResendUnfulfilledCommands: false,
};

// Create BullMQ Redis client instance
const createBullMQRedisClient = () => {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  const client = new Redis(process.env.REDIS_URL, bullmqRedisConfig);

  // Event listeners for monitoring (reduced logging for production)
  if (process.env.NODE_ENV === 'development') {
    client.on('connect', () => {
      console.log('[Redis:BullMQ] Connected');
    });
  }

  client.on('error', (err) => {
    // Only log non-connection-reset errors in production
    if (err.message && !err.message.includes('ECONNRESET')) {
      console.error('[Redis:BullMQ] Error:', err.message);
    }
  });

  return client;
};

// Singleton pattern for serverless environments
let redisClient: Redis | null = null;
let bullmqRedisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

export function getBullMQRedisClient(): Redis {
  if (!bullmqRedisClient) {
    bullmqRedisClient = createBullMQRedisClient();
  }
  return bullmqRedisClient;
}

// Graceful shutdown
export async function closeRedisClient(): Promise<void> {
  const promises = [];
  
  if (redisClient) {
    promises.push(redisClient.quit());
    redisClient = null;
    console.log('[Redis] Client closed successfully');
  }
  
  if (bullmqRedisClient) {
    promises.push(bullmqRedisClient.quit());
    bullmqRedisClient = null;
    console.log('[Redis:BullMQ] Client closed successfully');
  }
  
  await Promise.all(promises);
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
