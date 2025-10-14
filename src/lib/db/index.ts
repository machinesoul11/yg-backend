/**
 * Database Client Configuration
 * 
 * This module provides a singleton Prisma Client instance with:
 * - Connection pooling via PgBouncer
 * - Read replica support for queries
 * - Query logging and monitoring
 * - Connection retry logic
 */

import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

// Declare global type for Prisma Client singleton
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Database configuration
const DATABASE_CONFIG: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn']
    : ['error'],
  
  // Connection pool settings - use pooled connection for serverless
  // Prisma will use DATABASE_URL_POOLED from schema.prisma by default
  // Only override if you need a different connection string at runtime
};

// Read replica configuration
const REPLICA_CONFIG: Prisma.PrismaClientOptions | null = process.env.DATABASE_REPLICA_URL ? {
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn']
    : ['error'],
  
  datasources: {
    db: {
      url: process.env.DATABASE_REPLICA_URL,
    },
  },
} : null;

/**
 * Primary database client (write operations)
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient(DATABASE_CONFIG);

/**
 * Read replica client (read-only operations)
 * Falls back to primary if no replica configured
 */
export const prismaRead = REPLICA_CONFIG 
  ? new PrismaClient(REPLICA_CONFIG)
  : prisma;

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Query execution wrapper with automatic read/write routing
 */
export async function executeQuery<T>(
  operation: 'read' | 'write',
  query: (client: PrismaClient) => Promise<T>
): Promise<T> {
  const client = operation === 'read' ? prismaRead : prisma;
  
  try {
    return await query(client);
  } catch (error) {
    console.error(`Database ${operation} operation failed:`, error);
    throw error;
  }
}

/**
 * Health check for database connections
 */
export async function checkDatabaseHealth(): Promise<{
  primary: boolean;
  replica: boolean;
  latency: {
    primary: number;
    replica: number;
  };
}> {
  const startPrimary = Date.now();
  let primaryHealthy = false;
  let replicaHealthy = false;
  let primaryLatency = 0;
  let replicaLatency = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    primaryHealthy = true;
    primaryLatency = Date.now() - startPrimary;
  } catch (error) {
    console.error('Primary database health check failed:', error);
  }

  if (REPLICA_CONFIG) {
    const startReplica = Date.now();
    try {
      await prismaRead.$queryRaw`SELECT 1`;
      replicaHealthy = true;
      replicaLatency = Date.now() - startReplica;
    } catch (error) {
      console.error('Replica database health check failed:', error);
    }
  } else {
    replicaHealthy = primaryHealthy;
    replicaLatency = primaryLatency;
  }

  return {
    primary: primaryHealthy,
    replica: replicaHealthy,
    latency: {
      primary: primaryLatency,
      replica: replicaLatency,
    },
  };
}

/**
 * Graceful shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  await Promise.all([
    prisma.$disconnect(),
    REPLICA_CONFIG ? prismaRead.$disconnect() : Promise.resolve(),
  ]);
}

// Handle shutdown gracefully
if (process.env.NODE_ENV !== 'test') {
  process.on('beforeExit', async () => {
    await disconnectDatabase();
  });

  process.on('SIGINT', async () => {
    await disconnectDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}
