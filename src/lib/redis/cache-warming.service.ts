/**
 * Cache Warming Service
 * 
 * Proactively populates Redis cache with frequently accessed data
 * to prevent cache misses and improve performance after deployments
 */

import { PrismaClient } from '@prisma/client';
import { cacheService } from '@/lib/redis/cache.service';
import { RedisKeys, RedisTTL } from '@/lib/redis/keys';

interface WarmingTask {
  name: string;
  priority: number;
  execute: () => Promise<void>;
}

interface WarmingResult {
  success: boolean;
  totalTasks: number;
  completed: number;
  failed: number;
  duration: number;
  errors: Array<{ task: string; error: string }>;
}

export class CacheWarmingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Warm critical cache entries
   * Run this after deployments or cache flushes
   */
  async warmCriticalCaches(): Promise<WarmingResult> {
    const startTime = Date.now();
    const errors: Array<{ task: string; error: string }> = [];

    // Define warming tasks with priorities (lower = higher priority)
    const tasks: WarmingTask[] = [
      // Priority 1: Most critical data
      {
        name: 'Active Users',
        priority: 1,
        execute: () => this.warmActiveUsers(),
      },
      {
        name: 'System Configuration',
        priority: 1,
        execute: () => this.warmSystemConfig(),
      },

      // Priority 2: Frequently accessed entities
      {
        name: 'Top Creators',
        priority: 2,
        execute: () => this.warmTopCreators(),
      },
      {
        name: 'Top Brands',
        priority: 2,
        execute: () => this.warmTopBrands(),
      },
      {
        name: 'Active Projects',
        priority: 2,
        execute: () => this.warmActiveProjects(),
      },

      // Priority 3: Analytics and aggregated data
      {
        name: 'Platform Analytics',
        priority: 3,
        execute: () => this.warmPlatformAnalytics(),
      },
      {
        name: 'Popular Assets',
        priority: 3,
        execute: () => this.warmPopularAssets(),
      },
    ];

    // Sort by priority
    tasks.sort((a, b) => a.priority - b.priority);

    let completed = 0;
    let failed = 0;

    // Execute tasks with rate limiting to avoid overwhelming the database
    for (const task of tasks) {
      try {
        await task.execute();
        completed++;
        console.log(`[Cache Warming] ✓ ${task.name}`);
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ task: task.name, error: errorMessage });
        console.error(`[Cache Warming] ✗ ${task.name}:`, errorMessage);
      }

      // Small delay between tasks to prevent database overload
      await this.delay(100);
    }

    const duration = Date.now() - startTime;

    return {
      success: failed === 0,
      totalTasks: tasks.length,
      completed,
      failed,
      duration,
      errors,
    };
  }

  /**
   * Warm cache for active users (last 7 days)
   */
  private async warmActiveUsers(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeUsers = await this.prisma.user.findMany({
      where: {
        lastLoginAt: {
          gte: sevenDaysAgo,
        },
      },
      select: {
        id: true,
      },
      take: 100, // Top 100 active users
    });

    // Warm user profile cache
    for (const user of activeUsers) {
      try {
        const profile = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: {
            creator: true,
            brand: true,
          },
        });

        if (profile) {
          await cacheService.set(
            RedisKeys.cache.user(user.id),
            profile,
            RedisTTL.USER_PROFILE
          );
        }
      } catch (error) {
        console.error(`[Cache Warming] Error warming user ${user.id}:`, error);
      }
    }
  }

  /**
   * Warm system configuration cache
   */
  private async warmSystemConfig(): Promise<void> {
    // Warm any system-wide configuration that's frequently accessed
    // This could include feature flags, system settings, etc.
    
    // Example: If you have a Settings model
    // const settings = await this.prisma.systemSetting.findMany();
    // await cacheService.set('cache:system:settings', settings, RedisTTL.STATIC);
  }

  /**
   * Warm top creators cache
   */
  private async warmTopCreators(): Promise<void> {
    const topCreators = await this.prisma.creator.findMany({
      where: {
        verificationStatus: 'verified',
        deletedAt: null,
      },
      orderBy: [
        { updatedAt: 'desc' },
      ],
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            ipOwnerships: true,
            payouts: true,
          },
        },
      },
    });

    for (const creator of topCreators) {
      await cacheService.set(
        RedisKeys.cache.creator(creator.id),
        creator,
        RedisTTL.CREATOR_PROFILE
      );
    }
  }

  /**
   * Warm top brands cache
   */
  private async warmTopBrands(): Promise<void> {
    const topBrands = await this.prisma.brand.findMany({
      where: {
        verificationStatus: 'verified',
        deletedAt: null,
      },
      orderBy: [
        { totalSpent: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            projects: true,
            licenses: true,
          },
        },
      },
    });

    for (const brand of topBrands) {
      await cacheService.set(
        RedisKeys.cache.brand(brand.id),
        brand,
        RedisTTL.BRAND_PROFILE
      );
    }
  }

  /**
   * Warm active projects cache
   */
  private async warmActiveProjects(): Promise<void> {
    const activeProjects = await this.prisma.project.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'IN_PROGRESS'],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100,
      include: {
        brand: {
          select: {
            id: true,
            companyName: true,
          },
        },
        _count: {
          select: {
            ipAssets: true,
            licenses: true,
          },
        },
      },
    });

    for (const project of activeProjects) {
      await cacheService.set(
        RedisKeys.cache.project(project.id),
        project,
        RedisTTL.PROJECT
      );
    }
  }

  /**
   * Warm platform analytics cache
   */
  private async warmPlatformAnalytics(): Promise<void> {
    const now = new Date();

    // Warm key platform metrics
    const [totalUsers, totalCreators, totalBrands, totalProjects, totalAssets, totalLicenses] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.creator.count({ where: { verificationStatus: 'verified' } }),
      this.prisma.brand.count({ where: { verificationStatus: 'verified' } }),
      this.prisma.project.count(),
      this.prisma.ipAsset.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.license.count({ where: { status: 'ACTIVE' } }),
    ]);

    const platformMetrics = {
      totalUsers,
      totalCreators,
      totalBrands,
      totalProjects,
      totalAssets,
      totalLicenses,
      timestamp: now.toISOString(),
    };

    await cacheService.set(
      RedisKeys.cache.analytics('platform:summary'),
      platformMetrics,
      RedisTTL.ANALYTICS
    );
  }

  /**
   * Warm popular assets cache
   */
  private async warmPopularAssets(): Promise<void> {
    const popularAssets = await this.prisma.ipAsset.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
      },
      orderBy: [
        { updatedAt: 'desc' },
      ],
      take: 100,
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    for (const asset of popularAssets) {
      await cacheService.set(
        RedisKeys.cache.asset(asset.id),
        asset,
        RedisTTL.ASSET
      );
    }
  }

  /**
   * Warm cache for specific user and their entities
   */
  async warmUserCache(userId: string): Promise<void> {
    try {
      // Get user with all relations
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          creator: {
            include: {
              _count: {
                select: {
                  ipOwnerships: true,
                  payouts: true,
                },
              },
            },
          },
          brand: {
            include: {
              _count: {
                select: {
                  projects: true,
                  licenses: true,
                },
              },
            },
          },
        },
      });

      if (!user) return;

      // Cache user profile (without relations to avoid type issues)
      const { creator, brand, ...userProfile } = user;
      await cacheService.set(
        RedisKeys.cache.user(userId),
        userProfile,
        RedisTTL.USER_PROFILE
      );

      // Cache creator profile if exists
      if (creator) {
        await cacheService.set(
          RedisKeys.cache.creator(creator.id),
          creator,
          RedisTTL.CREATOR_PROFILE
        );
      }

      // Cache brand profile if exists
      if (brand) {
        await cacheService.set(
          RedisKeys.cache.brand(brand.id),
          brand,
          RedisTTL.BRAND_PROFILE
        );
      }
    } catch (error) {
      console.error(`[Cache Warming] Error warming cache for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Warm cache incrementally in background
   * This is useful for large datasets that shouldn't be warmed all at once
   */
  async warmCacheIncrementally(
    options: {
      batchSize?: number;
      delayBetweenBatches?: number;
    } = {}
  ): Promise<void> {
    const { batchSize = 50, delayBetweenBatches = 1000 } = options;

    console.log('[Cache Warming] Starting incremental cache warming...');

    // Warm users in batches
    let userOffset = 0;
    let hasMoreUsers = true;

    while (hasMoreUsers) {
      const users = await this.prisma.user.findMany({
        select: { id: true },
        skip: userOffset,
        take: batchSize,
        orderBy: { lastLoginAt: 'desc' },
      });

      if (users.length === 0) {
        hasMoreUsers = false;
        break;
      }

      // Warm each user's cache
      for (const user of users) {
        try {
          await this.warmUserCache(user.id);
        } catch (error) {
          console.error(`[Cache Warming] Error warming user ${user.id}:`, error);
        }
      }

      userOffset += batchSize;
      console.log(`[Cache Warming] Warmed ${userOffset} users...`);

      // Delay between batches
      if (hasMoreUsers) {
        await this.delay(delayBetweenBatches);
      }
    }

    console.log('[Cache Warming] Incremental warming completed');
  }

  /**
   * Helper: Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export function getCacheWarmingService(prisma: PrismaClient): CacheWarmingService {
  return new CacheWarmingService(prisma);
}
