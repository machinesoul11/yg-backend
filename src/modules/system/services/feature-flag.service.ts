/**
 * Feature Flag Service
 * 
 * Manages feature toggles with targeting and rollout capabilities
 */

import { PrismaClient, FeatureFlag } from '@prisma/client';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { FeatureFlagError } from '../errors';
import type {
  FeatureFlagContext,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
  FeatureFlagConditions,
} from '../types';

export class FeatureFlagService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Check if feature is enabled for user
   * Uses Redis cache + targeting rules
   */
  async isEnabled(flagName: string, context: FeatureFlagContext): Promise<boolean> {
    // Check cache first
    const cacheKey = `feature:${flagName}`;
    const cached = await this.redis.get(cacheKey);

    let flag: FeatureFlag;
    if (cached) {
      flag = JSON.parse(cached);
    } else {
      const dbFlag = await this.prisma.featureFlag.findUnique({
        where: { name: flagName },
      });

      if (!dbFlag) return false;

      flag = dbFlag;
      await this.redis.set(cacheKey, JSON.stringify(flag), 'EX', 300); // 5min TTL
    }

    if (!flag.enabled) return false;

    // Check targeting conditions
    if (flag.conditions) {
      const conditions = flag.conditions as FeatureFlagConditions;

      // Check user role
      if (conditions.userRoles && !conditions.userRoles.includes(context.userRole)) {
        return false;
      }

      // Check brand ID
      if (conditions.brandIds && context.brandId && !conditions.brandIds.includes(context.brandId)) {
        return false;
      }

      // Check creator ID
      if (conditions.creatorIds && context.creatorId && !conditions.creatorIds.includes(context.creatorId)) {
        return false;
      }
    }

    // Check rollout percentage (deterministic hashing)
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashUserId(context.userId, flagName);
      if (hash > flag.rolloutPercentage) {
        return false;
      }
    }

    return true;
  }

  /**
   * Deterministic hash for rollout (0-100)
   */
  private hashUserId(userId: string, flagName: string): number {
    const hash = createHash('md5').update(userId + flagName).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  /**
   * List all flags (admin)
   */
  async listFlags(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Create flag (admin)
   */
  async createFlag(data: CreateFeatureFlagInput, createdBy: string): Promise<FeatureFlag> {
    // Check for duplicate name
    const existing = await this.prisma.featureFlag.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new FeatureFlagError('DUPLICATE', `Feature flag '${data.name}' already exists`);
    }

    const flag = await this.prisma.featureFlag.create({
      data: {
        name: data.name,
        description: data.description,
        enabled: data.enabled ?? false,
        rolloutPercentage: data.rolloutPercentage ?? 0,
        conditions: data.conditions as any,
        createdBy,
      },
    });

    // Invalidate cache
    await this.redis.del(`feature:${flag.name}`);

    return flag;
  }

  /**
   * Update flag (admin)
   */
  async updateFlag(id: string, data: UpdateFeatureFlagInput, updatedBy: string): Promise<FeatureFlag> {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new FeatureFlagError('NOT_FOUND', 'Feature flag not found');
    }

    const flag = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        enabled: data.enabled,
        description: data.description,
        rolloutPercentage: data.rolloutPercentage,
        conditions: data.conditions as any,
        updatedBy,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.redis.del(`feature:${flag.name}`);

    return flag;
  }

  /**
   * Delete flag (admin)
   */
  async deleteFlag(id: string): Promise<void> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      throw new FeatureFlagError('NOT_FOUND', 'Feature flag not found');
    }

    await this.prisma.featureFlag.delete({ where: { id } });

    // Invalidate cache
    await this.redis.del(`feature:${flag.name}`);
  }
}
