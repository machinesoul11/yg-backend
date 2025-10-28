import Redis from 'ioredis';

// Upstash Redis configuration for serverless environments
const redisConfig = {
  maxRetriesPerRequest: 10, // Increased from 3 to allow more retries
  enableReadyCheck: true, // Enable ready check for better connection monitoring
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('[Redis] Max retries reached, stopping');
      return null;
    }
    // Exponential backoff with max delay of 3 seconds
    const delay = Math.min(times * 100, 3000);
    console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    // Reconnect on READONLY errors
    return err.message.includes('READONLY');
  },
  lazyConnect: false, // Connect immediately to avoid timeouts
  connectTimeout: 30000, // Increased to 30 seconds for unstable connections
  commandTimeout: 15000, // Increased to 15 seconds per command
  enableOfflineQueue: true, // ✅ CRITICAL: Queue commands during brief disconnects
  keepAlive: 30000, // Keep connection alive
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

  // Event handlers for better monitoring
  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.info('[Redis Client] Connected successfully');
  });

  client.on('ready', () => {
    console.info('[Redis Client] Ready to accept commands');
  });

  client.on('close', () => {
    console.warn('[Redis Client] Connection closed');
  });

  client.on('reconnecting', () => {
    console.warn('[Redis Client] Reconnecting...');
  });

  return client;
};

// BullMQ-specific Redis configuration (maxRetriesPerRequest must be null)
const bullmqRedisConfig = {
  maxRetriesPerRequest: null, // BullMQ handles retries
  enableReadyCheck: true, // Enable ready check
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('[Redis:BullMQ] Max retries reached, stopping');
      return null;
    }
    const delay = Math.min(times * 200, 3000);
    console.log(`[Redis:BullMQ] Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    return err.message.includes('READONLY');
  },
  lazyConnect: false, // Connect immediately
  connectTimeout: 10000, // Increased to 10 seconds
  commandTimeout: 10000, // Increased to 10 seconds
  enableOfflineQueue: true, // Enable queue for BullMQ
  keepAlive: 30000, // Keep connection alive
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

  // Event handlers for better monitoring
  client.on('error', (err) => {
    console.error('[Redis:BullMQ] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.info('[Redis:BullMQ Client] Connected successfully');
  });

  client.on('ready', () => {
    console.info('[Redis:BullMQ Client] Ready to accept commands');
  });

  client.on('close', () => {
    console.warn('[Redis:BullMQ Client] Connection closed');
  });

  client.on('reconnecting', () => {
    console.warn('[Redis:BullMQ Client] Reconnecting...');
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
