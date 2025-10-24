import Redis from 'ioredis';

// Upstash Redis configuration for serverless environments
const redisConfig = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false, // Upstash doesn't support PING command
  retryStrategy: (times: number) => {
    if (times > 3) return null; // Stop after 3 attempts
    // Exponential backoff with max delay of 2 seconds
    const delay = Math.min(times * 100, 2000);
    return delay;
  },
  reconnectOnError: () => false, // Disable auto-reconnect to prevent storms
  lazyConnect: true, // CHANGED: Don't connect immediately - let it connect on first command
  connectTimeout: 5000,
  commandTimeout: 3000,
  enableOfflineQueue: true, // Queue commands until connected
  keepAlive: 0, // Disable keep-alive in serverless
  family: 4, // Use IPv4 for better compatibility
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

  // Minimal error logging - filter out noise
  client.on('error', (err) => {
    // Only log critical errors, not connection resets or EPIPE
    if (err.message && !err.message.includes('ECONNRESET') && !err.message.includes('EPIPE')) {
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
    if (times > 5) return null; // Stop after 5 attempts
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
  reconnectOnError: () => false, // Disable auto-reconnect
  lazyConnect: true, // CHANGED: Lazy connect for BullMQ too
  connectTimeout: 10000,
  commandTimeout: 5000,
  enableOfflineQueue: false,
  keepAlive: 0,
  family: 4,
  autoResubscribe: false,
  autoResendUnfulfilledCommands: false,
};

// Create BullMQ Redis client instance
const createBullMQRedisClient = () => {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  const client = new Redis(process.env.REDIS_URL, bullmqRedisConfig);

  // Minimal error logging
  client.on('error', (err) => {
    // Only log critical errors
    if (err.message && !err.message.includes('ECONNRESET') && !err.message.includes('EPIPE')) {
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
