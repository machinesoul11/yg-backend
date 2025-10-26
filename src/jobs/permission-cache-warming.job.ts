/**
 * Permission Cache Warming Job
 * Proactively loads permissions for frequently accessed users
 * Runs periodically to maintain cache warm state
 */

import { PrismaClient } from '@prisma/client';
import { permissionCacheService } from '@/lib/services/permission-cache.service';
import { PermissionService } from '@/lib/services/permission.service';
import { AuditService } from '@/lib/services/audit.service';

const prisma = new PrismaClient();
const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

/**
 * Warm permission cache for frequently accessed users
 * @param targetCount - Number of users to warm (default: 100)
 */
export async function warmPermissionCache(targetCount: number = 100): Promise<void> {
  const startTime = Date.now();
  console.log(`[CacheWarming] Starting permission cache warming for up to ${targetCount} users...`);

  try {
    // Get frequently accessed users from Redis sorted set
    const frequentUsers = await permissionCacheService.getFrequentUsers(targetCount);
    
    if (frequentUsers.length === 0) {
      console.log('[CacheWarming] No frequent users found, warming recent active users...');
      // Fallback: warm recently active users
      await warmRecentActiveUsers(targetCount);
      return;
    }

    console.log(`[CacheWarming] Found ${frequentUsers.length} frequent users to warm`);

    // Warm cache for these users
    const warmedCount = await permissionService.warmPermissionCache(frequentUsers);

    const duration = Date.now() - startTime;
    console.log(`[CacheWarming] Successfully warmed ${warmedCount}/${frequentUsers.length} users in ${duration}ms`);

    // Log metrics
    const metrics = await permissionCacheService.getMetrics();
    console.log('[CacheWarming] Current cache metrics:', {
      hitRate: `${metrics.hitRate.toFixed(2)}%`,
      totalKeys: metrics.totalKeys,
      hits: metrics.hits,
      misses: metrics.misses,
      errors: metrics.errors
    });
  } catch (error) {
    console.error('[CacheWarming] Error during cache warming:', error);
    throw error;
  }
}

/**
 * Warm cache for recently active users
 * Fallback strategy when no frequent users are tracked
 */
async function warmRecentActiveUsers(limit: number = 100): Promise<void> {
  try {
    // Get users with recent login activity
    const recentUsers = await prisma.user.findMany({
      where: {
        lastLoginAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        },
        deleted_at: null
      },
      select: {
        id: true
      },
      orderBy: {
        lastLoginAt: 'desc'
      },
      take: limit
    });

    const userIds = recentUsers.map(u => u.id);
    
    if (userIds.length === 0) {
      console.log('[CacheWarming] No recently active users found');
      return;
    }

    console.log(`[CacheWarming] Warming ${userIds.length} recently active users`);
    const warmedCount = await permissionService.warmPermissionCache(userIds);
    
    console.log(`[CacheWarming] Warmed ${warmedCount}/${userIds.length} recently active users`);
  } catch (error) {
    console.error('[CacheWarming] Error warming recent users:', error);
  }
}

/**
 * Warm cache for admin users
 * Admins are high-value targets for caching due to frequent permission checks
 */
export async function warmAdminPermissions(): Promise<void> {
  console.log('[CacheWarming] Warming admin user permissions...');
  
  try {
    const adminUsers = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        deleted_at: null,
        isActive: true
      },
      select: {
        id: true
      }
    });

    const userIds = adminUsers.map(u => u.id);
    
    if (userIds.length === 0) {
      console.log('[CacheWarming] No active admin users found');
      return;
    }

    console.log(`[CacheWarming] Found ${userIds.length} admin users`);
    const warmedCount = await permissionService.warmPermissionCache(userIds);
    
    console.log(`[CacheWarming] Warmed ${warmedCount}/${userIds.length} admin users`);
  } catch (error) {
    console.error('[CacheWarming] Error warming admin permissions:', error);
  }
}

/**
 * Clean up expired cache entries
 * Removes permission cache entries that have expired
 */
export async function cleanupExpiredPermissions(): Promise<void> {
  console.log('[CacheWarming] Cleaning up expired permission cache entries...');
  
  try {
    const metrics = await permissionCacheService.getMetrics();
    const beforeCount = metrics.totalKeys;

    // Note: Redis automatically removes expired keys
    // This is mainly for logging/monitoring
    console.log(`[CacheWarming] Current permission cache size: ${beforeCount} keys`);
    
    // Optionally, we could implement aggressive cleanup here
    // For now, rely on Redis TTL expiration
  } catch (error) {
    console.error('[CacheWarming] Error during cleanup:', error);
  }
}

/**
 * Run full cache warming cycle
 * - Warm frequently accessed users
 * - Warm all admin users
 * - Clean up expired entries
 */
export async function runCacheWarmingCycle(): Promise<void> {
  const startTime = Date.now();
  console.log('[CacheWarming] ========== Starting Cache Warming Cycle ==========');

  try {
    // 1. Warm admin users first (high priority)
    await warmAdminPermissions();

    // 2. Warm frequently accessed users
    await warmPermissionCache(150);

    // 3. Cleanup
    await cleanupExpiredPermissions();

    const duration = Date.now() - startTime;
    console.log(`[CacheWarming] ========== Cycle Complete in ${duration}ms ==========`);
  } catch (error) {
    console.error('[CacheWarming] Cache warming cycle failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// If run directly
if (require.main === module) {
  runCacheWarmingCycle()
    .then(() => {
      console.log('[CacheWarming] Job completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[CacheWarming] Job failed:', error);
      process.exit(1);
    });
}
