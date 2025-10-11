/**
 * Creator Service
 * Core business logic for creator profile management
 */

import { PrismaClient } from '@prisma/client';
import type {
  CreateCreatorInput,
  UpdateCreatorInput,
  ListCreatorsInput,
} from '../schemas/creator.schema';
import type {
  PublicCreatorProfile,
  PrivateCreatorProfile,
  AdminCreatorProfile,
  CreatorListItem,
  PaginatedResponse,
  CreatorStatistics,
  PerformanceMetrics,
} from '../types/creator.types';
import {
  CreatorNotFoundError,
  CreatorAlreadyExistsError,
  CreatorProfileDeletedError,
  UnauthorizedProfileAccessError,
} from '../errors/creator.errors';
import { AuditService } from '@/lib/services/audit.service';
import { RoleAssignmentService } from '@/lib/services/role-assignment.service';
import { redis } from '@/lib/redis';

export class CreatorService {
  private roleAssignmentService: RoleAssignmentService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {
    this.roleAssignmentService = new RoleAssignmentService(prisma, auditService);
  }

  /**
   * Create a new creator profile
   */
  async createProfile(
    userId: string,
    input: CreateCreatorInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<PrivateCreatorProfile> {
    // Check if user already has a creator profile
    const existingCreator = await this.prisma.creator.findUnique({
      where: { userId },
    });

    if (existingCreator && !existingCreator.deletedAt) {
      throw new CreatorAlreadyExistsError(userId);
    }

    // If previously deleted, allow recreation
    if (existingCreator?.deletedAt) {
      const creator = await this.prisma.creator.update({
        where: { id: existingCreator.id },
        data: {
          stageName: input.stageName,
          bio: input.bio ?? null,
          specialties: input.specialties,
          socialLinks: input.socialLinks ?? null,
          portfolioUrl: input.portfolioUrl ?? null,
          website: input.website ?? null,
          availability: input.availability ?? null,
          preferences: input.preferences ?? null,
          verificationStatus: 'pending',
          onboardingStatus: 'pending',
          verifiedAt: null,
          deletedAt: null,
          performanceMetrics: {
            totalEarningsCents: 0,
            activeLicenses: 0,
            avgRating: 0,
          },
        },
      });

      await this.auditService.log({
        userId,
        action: 'creator.recreated',
        entityType: 'creator',
        entityId: creator.id,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });

      return this.toPrivateProfile(creator);
    }

    // Create new creator profile
    const creator = await this.prisma.creator.create({
      data: {
        userId,
        stageName: input.stageName,
        bio: input.bio ?? null,
        specialties: input.specialties,
        socialLinks: input.socialLinks ?? null,
        portfolioUrl: input.portfolioUrl ?? null,
        website: input.website ?? null,
        availability: input.availability ?? null,
        preferences: input.preferences ?? null,
        verificationStatus: 'pending',
        onboardingStatus: 'pending',
        performanceMetrics: {
          totalEarningsCents: 0,
          activeLicenses: 0,
          avgRating: 0,
        },
      },
    });

    // Log audit event
    await this.auditService.log({
      userId,
      action: 'creator.created',
      entityType: 'creator',
      entityId: creator.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.toPrivateProfile(creator);
  }

  /**
   * Update creator profile
   */
  async updateProfile(
    userId: string,
    input: UpdateCreatorInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<PrivateCreatorProfile> {
    const creator = await this.prisma.creator.findUnique({
      where: { userId },
    });

    if (!creator || creator.deletedAt) {
      throw new CreatorNotFoundError();
    }

    const updateData: any = {};
    if (input.stageName !== undefined) updateData.stageName = input.stageName;
    if (input.bio !== undefined) updateData.bio = input.bio;
    if (input.specialties !== undefined) updateData.specialties = input.specialties;
    if (input.socialLinks !== undefined) updateData.socialLinks = input.socialLinks;
    if (input.portfolioUrl !== undefined) updateData.portfolioUrl = input.portfolioUrl;
    if (input.website !== undefined) updateData.website = input.website;
    if (input.availability !== undefined) updateData.availability = input.availability;
    if (input.preferences !== undefined) updateData.preferences = input.preferences;

    const updatedCreator = await this.prisma.creator.update({
      where: { id: creator.id },
      data: updateData,
    });

    // Invalidate cache
    await this.invalidateCache(creator.id);

    // Log audit event
    await this.auditService.log({
      userId,
      action: 'creator.updated',
      entityType: 'creator',
      entityId: creator.id,
      beforeJson: creator,
      afterJson: updatedCreator,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.toPrivateProfile(updatedCreator);
  }

  /**
   * Soft delete creator profile
   */
  async deleteProfile(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { userId },
    });

    if (!creator || creator.deletedAt) {
      throw new CreatorNotFoundError();
    }

    await this.prisma.creator.update({
      where: { id: creator.id },
      data: { deletedAt: new Date() },
    });

    // Invalidate cache
    await this.invalidateCache(creator.id);

    // Log audit event
    await this.auditService.log({
      userId,
      action: 'creator.deleted',
      entityType: 'creator',
      entityId: creator.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Get creator profile by user ID
   */
  async getProfileByUserId(userId: string): Promise<PrivateCreatorProfile> {
    const creator = await this.prisma.creator.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError();
    }

    return this.toPrivateProfile(creator);
  }

  /**
   * Get creator profile by ID (with caching)
   */
  async getProfileById(
    creatorId: string,
    requestingUserId?: string
  ): Promise<PublicCreatorProfile | PrivateCreatorProfile> {
    // Try cache first
    const cacheKey = `creator:${creatorId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      const creator = JSON.parse(cached);
      // Return appropriate profile type based on requester
      if (requestingUserId && creator.userId === requestingUserId) {
        return creator as PrivateCreatorProfile;
      }
      return this.toPublicProfile(creator);
    }

    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(creator));

    // Return appropriate profile type
    if (requestingUserId && creator.userId === requestingUserId) {
      return this.toPrivateProfile(creator);
    }

    return this.toPublicProfile(creator);
  }

  /**
   * List creators with filters (admin only)
   */
  async listCreators(input: ListCreatorsInput): Promise<PaginatedResponse<CreatorListItem>> {
    const { page, pageSize, search, verificationStatus, onboardingStatus, specialties, sortBy, sortOrder } = input;

    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    if (verificationStatus) {
      where.verificationStatus = verificationStatus;
    }

    if (onboardingStatus) {
      where.onboardingStatus = onboardingStatus;
    }

    if (search) {
      where.OR = [
        { stageName: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (specialties && specialties.length > 0) {
      where.specialties = { hasSome: specialties };
    }

    const [creators, total] = await this.prisma.$transaction([
      this.prisma.creator.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.creator.count({ where }),
    ]);

    return {
      data: creators.map(c => this.toListItem(c)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Approve creator verification (admin only)
   */
  async approveCreator(
    creatorId: string,
    adminUserId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId },
    });

    if (!creator || creator.deletedAt) {
      throw new CreatorNotFoundError(creatorId);
    }

    // Update verification status and assign CREATOR role in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update creator verification status
      await tx.creator.update({
        where: { id: creatorId },
        data: {
          verificationStatus: 'approved',
          verifiedAt: new Date(),
        },
      });

      // Automatically assign CREATOR role to user
      await this.roleAssignmentService.assignCreatorRoleOnVerification(
        creator.userId,
        creatorId,
        adminUserId
      );
    });

    // Invalidate cache
    await this.invalidateCache(creatorId);

    // Log audit event
    await this.auditService.log({
      userId: adminUserId,
      action: 'creator.approved',
      entityType: 'creator',
      entityId: creatorId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Reject creator verification (admin only)
   */
  async rejectCreator(
    creatorId: string,
    reason: string,
    adminUserId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId },
    });

    if (!creator || creator.deletedAt) {
      throw new CreatorNotFoundError(creatorId);
    }

    await this.prisma.creator.update({
      where: { id: creatorId },
      data: {
        verificationStatus: 'rejected',
      },
    });

    // Invalidate cache
    await this.invalidateCache(creatorId);

    // Log audit event
    await this.auditService.log({
      userId: adminUserId,
      action: 'creator.rejected',
      entityType: 'creator',
      entityId: creatorId,
      metadata: { reason },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Update performance metrics
   */
  async updatePerformanceMetrics(creatorId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId },
    });

    if (!creator || creator.deletedAt) {
      throw new CreatorNotFoundError(creatorId);
    }

    // Aggregate earnings from royalty statements (when implemented)
    // For now, we'll use placeholder logic
    const totalEarningsCents = 0; // TODO: Implement when royalties module is ready
    const activeLicenses = 0; // TODO: Implement when licenses module is ready
    const avgRating = 0; // TODO: Implement when reviews are added

    const metrics: PerformanceMetrics = {
      totalEarningsCents,
      activeLicenses,
      avgRating,
    };

    await this.prisma.creator.update({
      where: { id: creatorId },
      data: {
        performanceMetrics: metrics,
      },
    });

    // Invalidate cache
    await this.invalidateCache(creatorId);
  }

  /**
   * Get creator statistics (for dashboard)
   */
  async getStatistics(userId: string): Promise<CreatorStatistics> {
    const creator = await this.prisma.creator.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError();
    }

    const metrics = creator.performanceMetrics as PerformanceMetrics || {
      totalEarningsCents: 0,
      activeLicenses: 0,
      avgRating: 0,
    };

    // TODO: Implement actual calculations when other modules are ready
    return {
      totalEarnings: metrics.totalEarningsCents / 100,
      totalEarningsCents: metrics.totalEarningsCents,
      activeLicenses: metrics.activeLicenses,
      totalLicenses: metrics.activeLicenses,
      totalAssets: 0,
      avgRating: metrics.avgRating,
      totalReviews: 0,
      profileViews: 0,
      thisMonthEarnings: 0,
      lastMonthEarnings: 0,
      earningsGrowth: 0,
    };
  }

  /**
   * Invalidate cache
   */
  private async invalidateCache(creatorId: string): Promise<void> {
    await redis.del(`creator:${creatorId}`);
  }

  /**
   * Transform to public profile
   */
  private toPublicProfile(creator: any): PublicCreatorProfile {
    const metrics = creator.performanceMetrics as PerformanceMetrics | null;
    
    return {
      id: creator.id,
      stageName: creator.stageName,
      bio: creator.bio,
      specialties: creator.specialties as string[],
      socialLinks: creator.socialLinks,
      portfolioUrl: creator.portfolioUrl,
      website: creator.website,
      verifiedAt: creator.verifiedAt?.toISOString() ?? null,
      performanceMetrics: metrics,
      createdAt: creator.createdAt.toISOString(),
    };
  }

  /**
   * Transform to private profile
   */
  private toPrivateProfile(creator: any): PrivateCreatorProfile {
    const publicProfile = this.toPublicProfile(creator);
    
    return {
      ...publicProfile,
      availability: creator.availability,
      preferences: creator.preferences,
      verificationStatus: creator.verificationStatus,
      onboardingStatus: creator.onboardingStatus,
      stripeAccountId: creator.stripeAccountId,
      updatedAt: creator.updatedAt.toISOString(),
    };
  }

  /**
   * Transform to admin profile
   */
  toAdminProfile(creator: any): AdminCreatorProfile {
    const privateProfile = this.toPrivateProfile(creator);
    
    return {
      ...privateProfile,
      userId: creator.userId,
      deletedAt: creator.deletedAt?.toISOString() ?? null,
    };
  }

  /**
   * Transform to list item
   */
  private toListItem(creator: any): CreatorListItem {
    const metrics = creator.performanceMetrics as PerformanceMetrics | null;
    
    return {
      id: creator.id,
      userId: creator.userId,
      stageName: creator.stageName,
      specialties: creator.specialties as string[],
      verificationStatus: creator.verificationStatus,
      onboardingStatus: creator.onboardingStatus,
      verifiedAt: creator.verifiedAt?.toISOString() ?? null,
      createdAt: creator.createdAt.toISOString(),
      totalEarningsCents: metrics?.totalEarningsCents ?? 0,
      activeLicenses: metrics?.activeLicenses ?? 0,
    };
  }
}
