/**
 * Permission Cache Cleanup Job
 * 
 * Scheduled maintenance for permission cache health:
 * 1. Clean up stale Redis keys (keys with no TTL or expired)
 * 2. Monitor cache hit rates and performance
 * 3. Optimize cache TTLs based on usage patterns
 * 4. Report on cache efficiency and recommendations
 * 
 * Runs: Multiple times daily (configurable, default: every 6 hours)
 */

import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { permissionCacheService } from '@/lib/services/permission-cache.service';
import { redisMonitor } from '@/lib/redis/monitoring';
import { RedisTTL } from '@/lib/redis/keys';

const CLEANUP_QUEUE_NAME = 'permission-cache-cleanup';

export interface CacheCleanupJobData {
  scanBatchSize?: number; // Default: 100
  aggressiveCleanup?: boolean; // Default: false - if true, removes inactive user caches
  inactivityThresholdDays?: number; // Default: 30 - days to consider a cache stale
  generateReport?: boolean; // Default: true
}

export interface CacheCleanupResult {
  scannedKeys: number;
  cleanedKeys: number;
  staleTTLKeys: number;
  inactiveUserCaches: number;
  currentMetrics: {
    hitRate: number;
    totalKeys: number;
    avgTTL: number;
  };
  recommendations: string[];
  issues: string[];
}

/**
 * Get or create cleanup queue
 */
export function getCleanupQueue(): Queue<CacheCleanupJobData> {
  return new Queue<CacheCleanupJobData>(CLEANUP_QUEUE_NAME, {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 30000, // 30 seconds
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // Keep for 7 days
        count: 100,
      },
      removeOnFail: {
        age: 30 * 24 * 3600, // Keep failures for 30 days
        count: 500,
      },
    },
  });
}

/**
 * Clean up permission cache keys
 */
async function cleanupPermissionCache(options: CacheCleanupJobData): Promise<CacheCleanupResult> {
  const {
    scanBatchSize = 100,
    aggressiveCleanup = false,
    inactivityThresholdDays = 30,
    generateReport = true,
  } = options;

  const result: CacheCleanupResult = {
    scannedKeys: 0,
    cleanedKeys: 0,
    staleTTLKeys: 0,
    inactiveUserCaches: 0,
    currentMetrics: {
      hitRate: 0,
      totalKeys: 0,
      avgTTL: 0,
    },
    recommendations: [],
    issues: [],
  };

  console.log('[PermissionCacheCleanup] Starting cleanup process...');
  console.log('[PermissionCacheCleanup] Scan batch size:', scanBatchSize);
  console.log('[PermissionCacheCleanup] Aggressive cleanup:', aggressiveCleanup);

  const redis = getBullMQRedisClient();

  try {
    // Step 1: Scan all permission cache keys using SCAN (production-safe)
    const permissionKeys: string[] = [];
    let cursor = '0';
    
    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'permissions:*',
        'COUNT',
        scanBatchSize
      );
      
      cursor = newCursor;
      permissionKeys.push(...keys);
      result.scannedKeys += keys.length;
      
      // Progress logging every 1000 keys
      if (result.scannedKeys % 1000 === 0) {
        console.log(`[PermissionCacheCleanup] Scanned ${result.scannedKeys} keys...`);
      }
    } while (cursor !== '0');

    console.log(`[PermissionCacheCleanup] Total permission keys found: ${permissionKeys.length}`);
    result.currentMetrics.totalKeys = permissionKeys.length;

    // Step 2: Check each key for TTL issues
    const ttlChecks: number[] = [];
    const keysToDelete: string[] = [];
    
    for (const key of permissionKeys) {
      try {
        const ttl = await redis.ttl(key);
        
        // TTL = -1 means key exists but has no expiry (BUG!)
        // TTL = -2 means key doesn't exist (race condition)
        // TTL >= 0 is normal
        
        if (ttl === -1) {
          // Key exists but has no TTL - this is a bug, should never happen
          console.warn(`[PermissionCacheCleanup] Found key with no TTL: ${key}`);
          result.staleTTLKeys++;
          keysToDelete.push(key);
          result.issues.push(`Key without TTL detected: ${key}`);
        } else if (ttl === -2) {
          // Key was deleted between scan and check (race condition - ok)
          continue;
        } else if (ttl >= 0) {
          // Normal key with TTL
          ttlChecks.push(ttl);
        }
      } catch (error) {
        console.error(`[PermissionCacheCleanup] Error checking TTL for ${key}:`, error);
      }
    }

    // Step 3: Aggressive cleanup - remove caches for inactive users
    if (aggressiveCleanup) {
      console.log('[PermissionCacheCleanup] Running aggressive cleanup for inactive users...');
      
      // Get warming set to identify recently active users
      const recentlyActiveUsers = await permissionCacheService.getFrequentUsers(1000);
      const activeUserSet = new Set(recentlyActiveUsers);
      
      for (const key of permissionKeys) {
        // Extract userId from key (format: "permissions:userId")
        const userId = key.replace('permissions:', '');
        
        // If user is not in recently active set and key is old
        if (!activeUserSet.has(userId)) {
          const ttl = await redis.ttl(key);
          
          // If TTL is low (less than 5 minutes), let it expire naturally
          // If TTL is high but user is inactive, consider removal
          const thresholdSeconds = RedisTTL.PERMISSIONS - (60 * 5); // 10 minutes into the 15min TTL
          
          if (ttl > thresholdSeconds) {
            keysToDelete.push(key);
            result.inactiveUserCaches++;
          }
        }
      }
      
      console.log(`[PermissionCacheCleanup] Identified ${result.inactiveUserCaches} inactive user caches`);
    }

    // Step 4: Delete problematic keys
    if (keysToDelete.length > 0) {
      console.log(`[PermissionCacheCleanup] Deleting ${keysToDelete.length} keys...`);
      
      // Delete in batches to avoid blocking Redis
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        await redis.del(...batch);
        result.cleanedKeys += batch.length;
      }
      
      console.log(`[PermissionCacheCleanup] Deleted ${result.cleanedKeys} keys`);
    }

    // Step 5: Calculate metrics
    if (ttlChecks.length > 0) {
      const avgTTL = ttlChecks.reduce((sum, ttl) => sum + ttl, 0) / ttlChecks.length;
      result.currentMetrics.avgTTL = Math.round(avgTTL);
    }

    // Get cache performance metrics
    const cacheMetrics = await permissionCacheService.getMetrics();
    result.currentMetrics.hitRate = cacheMetrics.hitRate;

    // Step 6: Generate recommendations
    if (generateReport) {
      await generateOptimizationRecommendations(result, cacheMetrics);
    }

    console.log('[PermissionCacheCleanup] Cleanup complete:', {
      scanned: result.scannedKeys,
      cleaned: result.cleanedKeys,
      hitRate: `${result.currentMetrics.hitRate}%`,
      avgTTL: `${result.currentMetrics.avgTTL}s`,
    });

    return result;
  } catch (error) {
    console.error('[PermissionCacheCleanup] Fatal error during cleanup:', error);
    throw error;
  }
}

/**
 * Generate optimization recommendations based on metrics
 */
async function generateOptimizationRecommendations(
  result: CacheCleanupResult,
  cacheMetrics: Awaited<ReturnType<typeof permissionCacheService.getMetrics>>
): Promise<void> {
  const recommendations: string[] = [];
  const issues: string[] = [];

  // Check hit rate
  if (cacheMetrics.hitRate < 50) {
    recommendations.push(
      `CRITICAL: Very low cache hit rate (${cacheMetrics.hitRate}%). Consider increasing TTL from ${RedisTTL.PERMISSIONS}s to ${RedisTTL.PERMISSIONS * 2}s (30 minutes).`
    );
    issues.push('Hit rate below 50% - cache not effective');
  } else if (cacheMetrics.hitRate < 70) {
    recommendations.push(
      `Low cache hit rate (${cacheMetrics.hitRate}%). Review permission check patterns and consider extending TTL.`
    );
  } else if (cacheMetrics.hitRate >= 90) {
    recommendations.push(
      `Excellent cache hit rate (${cacheMetrics.hitRate}%)! Current TTL (${RedisTTL.PERMISSIONS}s) is optimal.`
    );
  } else {
    recommendations.push(
      `Good cache hit rate (${cacheMetrics.hitRate}%). Current configuration is working well.`
    );
  }

  // Check average TTL
  const expectedTTL = RedisTTL.PERMISSIONS;
  const avgTTL = result.currentMetrics.avgTTL;
  
  if (avgTTL < expectedTTL * 0.3) {
    recommendations.push(
      `Most caches are near expiration (avg TTL: ${avgTTL}s). This suggests high invalidation rate or keys are being accessed late in their lifecycle.`
    );
  }

  // Check key count vs active users
  const totalKeys = result.currentMetrics.totalKeys;
  
  if (totalKeys > 10000) {
    recommendations.push(
      `High permission cache key count (${totalKeys}). Consider enabling aggressive cleanup to remove inactive user caches.`
    );
  }

  // Check error rate
  if (cacheMetrics.errors > cacheMetrics.hits * 0.01) {
    issues.push(`High cache error rate: ${cacheMetrics.errors} errors vs ${cacheMetrics.hits} hits`);
    recommendations.push(
      'Investigate Redis connection stability - error rate is elevated.'
    );
  }

  // Check for stale TTL keys (critical issue)
  if (result.staleTTLKeys > 0) {
    issues.push(`Found ${result.staleTTLKeys} keys without TTL - this indicates a caching bug`);
    recommendations.push(
      'URGENT: Investigate why permission cache keys are being created without TTL. This can lead to memory leaks.'
    );
  }

  // Memory optimization
  const redisHealth = await redisMonitor.getHealthStatus();
  if (redisHealth.memoryUsagePercent && redisHealth.memoryUsagePercent > 80) {
    recommendations.push(
      `Redis memory usage is high (${redisHealth.memoryUsagePercent.toFixed(1)}%). Consider enabling aggressive cleanup or reducing TTL.`
    );
  }

  // Add all recommendations and issues to result
  result.recommendations = recommendations;
  result.issues.push(...issues);
}

/**
 * Create cleanup worker
 */
export function createCleanupWorker(): Worker<CacheCleanupJobData, CacheCleanupResult> {
  const worker = new Worker<CacheCleanupJobData, CacheCleanupResult>(
    CLEANUP_QUEUE_NAME,
    async (job: Job<CacheCleanupJobData>) => {
      console.log(`[PermissionCacheCleanupWorker] Processing job ${job.id}`);
      return await cleanupPermissionCache(job.data);
    },
    {
      connection: getBullMQRedisClient(),
      concurrency: 1, // Run one at a time
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[PermissionCacheCleanupWorker] Job ${job.id} completed:`, {
      scanned: result.scannedKeys,
      cleaned: result.cleanedKeys,
      hitRate: `${result.currentMetrics.hitRate}%`,
      recommendations: result.recommendations.length,
      issues: result.issues.length,
    });

    // Log recommendations
    if (result.recommendations.length > 0) {
      console.log('[PermissionCacheCleanupWorker] Recommendations:');
      result.recommendations.forEach((rec, idx) => {
        console.log(`  ${idx + 1}. ${rec}`);
      });
    }

    // Log issues
    if (result.issues.length > 0) {
      console.warn('[PermissionCacheCleanupWorker] Issues detected:');
      result.issues.forEach((issue, idx) => {
        console.warn(`  ${idx + 1}. ${issue}`);
      });
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[PermissionCacheCleanupWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}

/**
 * Schedule recurring cleanup job
 */
export async function schedulePermissionCacheCleanup(): Promise<void> {
  const queue = getCleanupQueue();

  // Remove any existing repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'cleanup-permission-cache') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule cleanup job
  const cronPattern = process.env.PERMISSION_CACHE_CLEANUP_CRON || '0 */6 * * *'; // Every 6 hours by default

  await queue.add(
    'cleanup-permission-cache',
    {
      scanBatchSize: 100,
      aggressiveCleanup: process.env.AGGRESSIVE_CACHE_CLEANUP === 'true',
      inactivityThresholdDays: parseInt(process.env.CACHE_INACTIVITY_THRESHOLD_DAYS || '30'),
      generateReport: true,
    },
    {
      repeat: {
        pattern: cronPattern,
      },
      jobId: 'scheduled-permission-cache-cleanup',
    }
  );

  console.log(`[PermissionCacheCleanup] ✓ Scheduled cleanup job (cron: ${cronPattern})`);
}

/**
 * Run cleanup manually
 */
export async function runCleanupNow(options: CacheCleanupJobData = {}): Promise<void> {
  const queue = getCleanupQueue();

  await queue.add('manual-cleanup', options, {
    priority: 1, // High priority for manual runs
  });

  console.log('[PermissionCacheCleanup] Manual cleanup job queued');
}

/**
 * Get cleanup statistics
 */
export async function getCleanupStatistics() {
  const queue = getCleanupQueue();
  
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  const cacheMetrics = await permissionCacheService.getMetrics();
  const redisHealth = await redisMonitor.getHealthStatus();

  return {
    jobQueue: {
      waiting,
      active,
      completed,
      failed,
    },
    cacheHealth: {
      hitRate: cacheMetrics.hitRate,
      totalKeys: cacheMetrics.totalKeys,
      hits: cacheMetrics.hits,
      misses: cacheMetrics.misses,
      errors: cacheMetrics.errors,
    },
    redisHealth: {
      status: redisHealth.status,
      latency: redisHealth.latency,
      memoryUsagePercent: redisHealth.memoryUsagePercent,
    },
  };
}

// Singleton worker instance
let cleanupWorker: Worker<CacheCleanupJobData, CacheCleanupResult> | null = null;

/**
 * Initialize the cleanup worker
 */
export function initializeCleanupWorker(): void {
  if (cleanupWorker) {
    console.log('[PermissionCacheCleanupWorker] Worker already initialized');
    return;
  }

  console.log('[PermissionCacheCleanupWorker] Initializing cleanup worker...');
  cleanupWorker = createCleanupWorker();
  console.log('[PermissionCacheCleanupWorker] ✓ Cleanup worker initialized');
}

/**
 * Shutdown the cleanup worker
 */
export async function shutdownCleanupWorker(): Promise<void> {
  if (!cleanupWorker) {
    return;
  }

  console.log('[PermissionCacheCleanupWorker] Shutting down cleanup worker...');
  await cleanupWorker.close();
  cleanupWorker = null;
  console.log('[PermissionCacheCleanupWorker] ✓ Cleanup worker shut down');
}

/**
 * Initialize all permission cache cleanup jobs
 */
export async function initializePermissionCacheCleanupJobs(): Promise<void> {
  initializeCleanupWorker();
  await schedulePermissionCacheCleanup();
  
  console.log('[PermissionCacheCleanup] All permission cache cleanup jobs initialized');
}
