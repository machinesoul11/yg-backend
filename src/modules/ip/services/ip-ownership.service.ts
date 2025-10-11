/**
 * IP Ownership Service
 * 
 * Business logic for IP ownership management - the cornerstone of royalty calculations
 */

import { PrismaClient, IpOwnership, OwnershipType, Prisma } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  IpOwnershipResponse,
  IpOwnershipWithCreator,
  ValidationResult,
  ConflictCheck,
  OwnershipTransferResult,
  GetOwnersOptions,
  GetCreatorAssetsOptions,
  OWNERSHIP_CACHE_KEYS,
  OWNERSHIP_CONSTANTS,
  AssetOwnershipSummary,
  OwnershipHistoryEntry,
} from '../types/ownership.types';
import {
  OwnershipValidationError,
  InsufficientOwnershipError,
  UnauthorizedOwnershipError,
  OwnershipConflictError,
} from '../errors/ownership.errors';
import type { OwnershipSplitInput } from '../schemas/ownership.schema';

export class IpOwnershipService {
  constructor(
    private prisma: PrismaClient,
    private redis?: Redis
  ) {}

  // ==========================================================================
  // Core CRUD Operations
  // ==========================================================================

  /**
   * Create a single ownership record
   * Note: Prefer setAssetOwnership() for atomic multi-owner operations
   */
  async createOwnership(
    input: {
      ipAssetId: string;
      creatorId: string;
      shareBps: number;
      ownershipType?: OwnershipType;
      startDate?: Date;
      endDate?: Date;
      contractReference?: string;
      legalDocUrl?: string;
      notes?: Record<string, any>;
    },
    userId: string
  ): Promise<IpOwnershipResponse> {
    const ownership = await this.prisma.ipOwnership.create({
      data: {
        ipAssetId: input.ipAssetId,
        creatorId: input.creatorId,
        shareBps: input.shareBps,
        ownershipType: input.ownershipType || OwnershipType.PRIMARY,
        startDate: input.startDate || new Date(),
        endDate: input.endDate,
        contractReference: input.contractReference,
        legalDocUrl: input.legalDocUrl,
        notes: input.notes || Prisma.JsonNull,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        creator: true,
      },
    });

    // Invalidate cache
    await this.invalidateOwnershipCaches(input.ipAssetId, [input.creatorId]);

    return this.toResponse(ownership);
  }

  /**
   * Update an ownership record
   */
  async updateOwnership(
    id: string,
    input: {
      shareBps?: number;
      ownershipType?: OwnershipType;
      endDate?: Date;
      contractReference?: string;
      legalDocUrl?: string;
      notes?: Record<string, any>;
    },
    userId: string
  ): Promise<IpOwnershipResponse> {
    const ownership = await this.prisma.ipOwnership.update({
      where: { id },
      data: {
        ...input,
        updatedBy: userId,
      },
      include: {
        creator: true,
      },
    });

    await this.invalidateOwnershipCaches(ownership.ipAssetId, [ownership.creatorId]);

    return this.toResponse(ownership);
  }

  /**
   * Delete an ownership record (soft delete via endDate)
   */
  async deleteOwnership(id: string, userId: string): Promise<void> {
    const ownership = await this.prisma.ipOwnership.update({
      where: { id },
      data: {
        endDate: new Date(),
        updatedBy: userId,
      },
    });

    await this.invalidateOwnershipCaches(ownership.ipAssetId, [ownership.creatorId]);
  }

  // ==========================================================================
  // Atomic Ownership Operations
  // ==========================================================================

  /**
   * Set complete ownership split for an asset (atomic transaction)
   * This is the recommended way to create/update ownership
   */
  async setAssetOwnership(
    ipAssetId: string,
    ownerships: OwnershipSplitInput[],
    userId: string,
    effectiveDate?: Date
  ): Promise<IpOwnershipResponse[]> {
    const effective = effectiveDate || new Date();

    // Validate split sums to 10,000 BPS
    const totalBps = ownerships.reduce((sum, o) => sum + o.shareBps, 0);
    if (totalBps !== OWNERSHIP_CONSTANTS.TOTAL_BPS) {
      throw new OwnershipValidationError(
        `Ownership split must sum to ${OWNERSHIP_CONSTANTS.TOTAL_BPS} BPS (100%). Current sum: ${totalBps}`,
        {
          requiredBps: OWNERSHIP_CONSTANTS.TOTAL_BPS,
          providedBps: totalBps,
          missingBps: totalBps < OWNERSHIP_CONSTANTS.TOTAL_BPS ? OWNERSHIP_CONSTANTS.TOTAL_BPS - totalBps : undefined,
          excessBps: totalBps > OWNERSHIP_CONSTANTS.TOTAL_BPS ? totalBps - OWNERSHIP_CONSTANTS.TOTAL_BPS : undefined,
        }
      );
    }

    // Perform atomic transaction
    const createdOwnerships = await this.prisma.$transaction(async (tx) => {
      // End all current active ownerships
      await tx.ipOwnership.updateMany({
        where: {
          ipAssetId,
          endDate: null,
        },
        data: {
          endDate: effective,
          updatedBy: userId,
        },
      });

      // Create new ownership records
      const created = await Promise.all(
        ownerships.map((o) =>
          tx.ipOwnership.create({
            data: {
              ipAssetId,
              creatorId: o.creatorId,
              shareBps: o.shareBps,
              ownershipType: o.ownershipType,
              startDate: o.startDate || effective,
              endDate: o.endDate,
              contractReference: o.contractReference,
              legalDocUrl: o.legalDocUrl,
              notes: (o.notes as any) || Prisma.JsonNull,
              createdBy: userId,
              updatedBy: userId,
            },
            include: {
              creator: true,
            },
          })
        )
      );

      return created;
    });

    // Invalidate caches
    const creatorIds = ownerships.map((o) => o.creatorId);
    await this.invalidateOwnershipCaches(ipAssetId, creatorIds);

    return createdOwnerships.map((o) => this.toResponse(o as IpOwnershipWithCreator));
  }

  /**
   * Transfer ownership from one creator to another
   */
  async transferOwnership(
    fromCreatorId: string,
    toCreatorId: string,
    ipAssetId: string,
    shareBps: number,
    userId: string,
    options?: {
      contractReference?: string;
      legalDocUrl?: string;
      notes?: Record<string, any>;
    }
  ): Promise<OwnershipTransferResult> {
    // Get current ownerships
    const currentOwnerships = await this.getAssetOwners({ ipAssetId });
    const fromOwnership = currentOwnerships.find((o) => o.creatorId === fromCreatorId);

    if (!fromOwnership) {
      throw new InsufficientOwnershipError(shareBps, 0, fromCreatorId, ipAssetId);
    }

    if (fromOwnership.shareBps < shareBps) {
      throw new InsufficientOwnershipError(shareBps, fromOwnership.shareBps, fromCreatorId, ipAssetId);
    }

    // Perform transfer
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // End existing ownerships
      await tx.ipOwnership.updateMany({
        where: { ipAssetId, endDate: null },
        data: { endDate: now, updatedBy: userId },
      });

      // Create new ownership records
      const newOwnerships = currentOwnerships
        .filter((o) => o.creatorId !== fromCreatorId)
        .map((o) => ({
          ipAssetId,
          creatorId: o.creatorId,
          shareBps: o.shareBps,
          ownershipType: o.ownershipType,
          startDate: now,
          createdBy: userId,
          updatedBy: userId,
          notes: (o.notes as any) || Prisma.JsonNull,
        }));

      // Adjust from creator's ownership
      if (fromOwnership.shareBps > shareBps) {
        newOwnerships.push({
          ipAssetId,
          creatorId: fromCreatorId,
          shareBps: fromOwnership.shareBps - shareBps,
          ownershipType: fromOwnership.ownershipType,
          startDate: now,
          createdBy: userId,
          updatedBy: userId,
          notes: Prisma.JsonNull,
        });
      }

      // Add to creator's ownership
      const existingToOwnership = currentOwnerships.find((o) => o.creatorId === toCreatorId);
      newOwnerships.push({
        ipAssetId,
        creatorId: toCreatorId,
        shareBps: (existingToOwnership?.shareBps || 0) + shareBps,
        ownershipType: OwnershipType.TRANSFERRED,
        startDate: now,
        createdBy: userId,
        updatedBy: userId,
        notes: Prisma.JsonNull,
      });

      const created = await Promise.all(
        newOwnerships.map((data) =>
          tx.ipOwnership.create({
            data: {
              ...data,
              contractReference: options?.contractReference,
              legalDocUrl: options?.legalDocUrl,
              notes: (options?.notes as any) || data.notes,
            },
            include: { creator: true },
          })
        )
      );

      return created;
    });

    await this.invalidateOwnershipCaches(ipAssetId, [fromCreatorId, toCreatorId]);

    const fromResult = result.find((o) => o.creatorId === fromCreatorId);
    const toResult = result.find((o) => o.creatorId === toCreatorId)!;

    return {
      fromOwnership: fromResult ? this.toResponse(fromResult) : ({} as any),
      toOwnership: this.toResponse(toResult),
      transferredBps: shareBps,
    };
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get active owners of an asset at a specific date
   */
  async getAssetOwners(options: GetOwnersOptions): Promise<IpOwnershipResponse[]> {
    const { ipAssetId, atDate, includeCreatorDetails = true } = options;
    const queryDate = atDate || new Date();

    // Check cache
    const cacheKey = OWNERSHIP_CACHE_KEYS.activeByAsset(ipAssetId);
    if (this.redis && !atDate) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const ownerships = await this.prisma.ipOwnership.findMany({
      where: {
        ipAssetId,
        startDate: { lte: queryDate },
        OR: [{ endDate: null }, { endDate: { gt: queryDate } }],
      },
      include: includeCreatorDetails ? { creator: true } : undefined,
      orderBy: { shareBps: 'desc' },
    });

    const response = ownerships.map((o) => this.toResponse(o as any));

    // Cache result
    if (this.redis && !atDate) {
      await this.redis.setex(cacheKey, OWNERSHIP_CONSTANTS.CACHE_TTL_ACTIVE, JSON.stringify(response));
    }

    return response;
  }

  /**
   * Get all assets owned by a creator
   */
  async getCreatorAssets(options: GetCreatorAssetsOptions): Promise<IpOwnershipResponse[]> {
    const { creatorId, includeExpired = false, ownershipType } = options;

    const where: Prisma.IpOwnershipWhereInput = {
      creatorId,
      ...(ownershipType && { ownershipType }),
    };

    if (!includeExpired) {
      where.OR = [{ endDate: null }, { endDate: { gt: new Date() } }];
    }

    const ownerships = await this.prisma.ipOwnership.findMany({
      where,
      include: { creator: true },
      orderBy: { createdAt: 'desc' },
    });

    return ownerships.map((o) => this.toResponse(o));
  }

  /**
   * Get complete ownership history for an asset
   */
  async getOwnershipHistory(ipAssetId: string): Promise<OwnershipHistoryEntry[]> {
    const ownerships = await this.prisma.ipOwnership.findMany({
      where: { ipAssetId },
      include: { creator: true },
      orderBy: { startDate: 'asc' },
    });

    return ownerships.map((o) => ({
      ownership: this.toResponse(o),
      changeType: this.determineChangeType(o),
      changedAt: o.createdAt.toISOString(),
      changedBy: o.createdBy,
    }));
  }

  /**
   * Get ownership summary for an asset
   */
  async getAssetOwnershipSummary(ipAssetId: string): Promise<AssetOwnershipSummary> {
    const owners = await this.getAssetOwners({ ipAssetId });

    return {
      ipAssetId,
      owners: owners.map((o) => ({
        creatorId: o.creatorId,
        creatorName: o.creator?.stageName || 'Unknown',
        shareBps: o.shareBps,
        sharePercentage: o.sharePercentage,
        ownershipType: o.ownershipType,
      })),
      totalBps: owners.reduce((sum, o) => sum + o.shareBps, 0),
      ownerCount: owners.length,
      hasMultipleOwners: owners.length > 1,
    };
  }

  // ==========================================================================
  // Validation & Helper Methods
  // ==========================================================================

  /**
   * Validate ownership split
   */
  validateOwnershipSplit(splits: OwnershipSplitInput[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const totalBps = splits.reduce((sum, s) => sum + s.shareBps, 0);
    if (totalBps !== OWNERSHIP_CONSTANTS.TOTAL_BPS) {
      errors.push(`Total must equal ${OWNERSHIP_CONSTANTS.TOTAL_BPS} BPS. Current: ${totalBps}`);
    }

    splits.forEach((split, idx) => {
      if (split.shareBps < OWNERSHIP_CONSTANTS.MIN_BPS) {
        errors.push(`Split ${idx}: share must be at least ${OWNERSHIP_CONSTANTS.MIN_BPS} BPS`);
      }
      if (split.shareBps > OWNERSHIP_CONSTANTS.MAX_BPS) {
        errors.push(`Split ${idx}: share cannot exceed ${OWNERSHIP_CONSTANTS.MAX_BPS} BPS`);
      }
    });

    if (splits.length === 0) {
      errors.push('At least one ownership record required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check for ownership conflicts
   */
  async checkOwnershipConflicts(
    ipAssetId: string,
    proposed: OwnershipSplitInput[]
  ): Promise<ConflictCheck> {
    const conflicts: ConflictCheck['conflicts'] = [];

    // Check sum
    const totalBps = proposed.reduce((sum, o) => sum + o.shareBps, 0);
    if (totalBps !== OWNERSHIP_CONSTANTS.TOTAL_BPS) {
      conflicts.push({
        type: 'INVALID_SUM',
        message: `Ownership split sums to ${totalBps} BPS instead of ${OWNERSHIP_CONSTANTS.TOTAL_BPS}`,
        affectedOwnerships: [],
      });
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Check if user has ownership of an asset
   */
  async hasOwnership(userId: string, ipAssetId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { creator: true },
    });

    if (!user?.creator) return false;

    const ownership = await this.prisma.ipOwnership.findFirst({
      where: {
        ipAssetId,
        creatorId: user.creator.id,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
      },
    });

    return !!ownership;
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private toResponse(ownership: IpOwnershipWithCreator): IpOwnershipResponse {
    const now = new Date();
    const isActive = ownership.startDate <= now && (!ownership.endDate || ownership.endDate > now);

    return {
      id: ownership.id,
      ipAssetId: ownership.ipAssetId,
      creatorId: ownership.creatorId,
      shareBps: ownership.shareBps,
      sharePercentage: ownership.shareBps / OWNERSHIP_CONSTANTS.BPS_TO_PERCENTAGE,
      ownershipType: ownership.ownershipType,
      startDate: ownership.startDate.toISOString(),
      endDate: ownership.endDate?.toISOString() || null,
      contractReference: ownership.contractReference,
      legalDocUrl: ownership.legalDocUrl,
      notes: ownership.notes as Record<string, any> | null,
      createdAt: ownership.createdAt.toISOString(),
      updatedAt: ownership.updatedAt.toISOString(),
      creator: ownership.creator ? {
        id: ownership.creator.id,
        userId: ownership.creator.userId,
        stageName: ownership.creator.stageName,
        verificationStatus: ownership.creator.verificationStatus,
      } : undefined,
      isActive,
      isPerpetual: ownership.endDate === null,
    };
  }

  private determineChangeType(ownership: IpOwnership): OwnershipHistoryEntry['changeType'] {
    if (ownership.endDate && ownership.endDate < new Date()) {
      return 'ENDED';
    }
    if (ownership.ownershipType === OwnershipType.TRANSFERRED) {
      return 'TRANSFERRED';
    }
    if (ownership.createdAt === ownership.updatedAt) {
      return 'CREATED';
    }
    return 'UPDATED';
  }

  private async invalidateOwnershipCaches(ipAssetId: string, creatorIds: string[]): Promise<void> {
    if (!this.redis) return;

    const keys = [
      OWNERSHIP_CACHE_KEYS.activeByAsset(ipAssetId),
      OWNERSHIP_CACHE_KEYS.history(ipAssetId),
      ...creatorIds.map((id) => OWNERSHIP_CACHE_KEYS.byCreator(id)),
    ];

    await this.redis.del(...keys);
  }
}
