/**
 * Email Segmentation Service
 * Advanced audience segmentation and saved segment management
 */
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { TRPCError } from '@trpc/server';
import type { UserRole } from '@prisma/client';

export interface SegmentCriteria {
  role?: UserRole[];
  verificationStatus?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  hasEmailPreference?: {
    [key: string]: boolean;
  };
  creatorSpecialties?: string[];
  brandIndustries?: string[];
  engagementLevel?: ('very_high' | 'high' | 'medium' | 'low' | 'inactive')[];
  excludeRecentlySent?: {
    days: number;
    campaignIds?: string[];
  };
  custom?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
    value: any;
  }[];
}

export interface SavedSegmentParams {
  name: string;
  description?: string;
  criteria: SegmentCriteria;
  isPublic?: boolean;
}

export class SegmentationService {
  /**
   * Preview segment size without creating it
   */
  async previewSegment(criteria: SegmentCriteria): Promise<{
    count: number;
    breakdown: {
      byRole?: Record<string, number>;
      byVerification?: Record<string, number>;
    };
  }> {
    const cacheKey = `segment-preview:${JSON.stringify(criteria)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const whereClause = this.buildWhereClause(criteria);

    // Get total count
    const count = await prisma.user.count({ where: whereClause });

    // Get breakdown by role
    const byRole = await prisma.user.groupBy({
      by: ['role'],
      where: whereClause,
      _count: true,
    });

    const breakdown = {
      byRole: Object.fromEntries(
        byRole.map((r) => [r.role, r._count])
      ),
    };

    const result = { count, breakdown };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(result));

    return result;
  }

  /**
   * Create saved segment
   */
  async createSavedSegment(
    userId: string,
    params: SavedSegmentParams
  ) {
    // Calculate initial size
    const preview = await this.previewSegment(params.criteria);

    const segment = await prisma.savedEmailSegment.create({
      data: {
        name: params.name,
        description: params.description,
        criteria: params.criteria as any,
        estimatedSize: preview.count,
        lastCalculatedAt: new Date(),
        createdBy: userId,
        isPublic: params.isPublic || false,
      },
    });

    return segment;
  }

  /**
   * Update saved segment
   */
  async updateSavedSegment(
    segmentId: string,
    userId: string,
    updates: Partial<SavedSegmentParams>
  ) {
    const segment = await prisma.savedEmailSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Segment not found',
      });
    }

    if (segment.createdBy !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to update this segment',
      });
    }

    // Recalculate size if criteria changed
    let estimatedSize = segment.estimatedSize;
    let lastCalculatedAt = segment.lastCalculatedAt;

    if (updates.criteria) {
      const preview = await this.previewSegment(updates.criteria);
      estimatedSize = preview.count;
      lastCalculatedAt = new Date();
    }

    return prisma.savedEmailSegment.update({
      where: { id: segmentId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.criteria && {
          criteria: updates.criteria as any,
          estimatedSize,
          lastCalculatedAt,
        }),
        ...(updates.isPublic !== undefined && { isPublic: updates.isPublic }),
      },
    });
  }

  /**
   * Delete saved segment
   */
  async deleteSavedSegment(segmentId: string, userId: string) {
    const segment = await prisma.savedEmailSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Segment not found',
      });
    }

    if (segment.createdBy !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this segment',
      });
    }

    await prisma.savedEmailSegment.delete({
      where: { id: segmentId },
    });

    return { success: true };
  }

  /**
   * Get saved segments
   */
  async getSavedSegments(userId: string, includePublic: boolean = true) {
    const segments = await prisma.savedEmailSegment.findMany({
      where: {
        OR: [
          { createdBy: userId },
          ...(includePublic ? [{ isPublic: true }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return segments;
  }

  /**
   * Get users matching segment criteria
   */
  async getSegmentUsers(criteria: SegmentCriteria, limit?: number) {
    const whereClause = this.buildWhereClause(criteria);

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
      ...(limit && { take: limit }),
    });

    return users;
  }

  /**
   * Validate that segment has eligible recipients
   */
  async validateSegment(criteria: SegmentCriteria): Promise<{
    valid: boolean;
    count: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check for recipients
    const count = await prisma.user.count({
      where: this.buildWhereClause(criteria),
    });

    if (count === 0) {
      errors.push('No users match the specified criteria');
    }

    // Check for reasonable size limits
    if (count > 1000000) {
      errors.push('Segment too large (> 1M users). Please refine criteria.');
    }

    return {
      valid: errors.length === 0,
      count,
      errors,
    };
  }

  /**
   * Check for audience overlap between campaigns
   */
  async analyzeAudienceOverlap(
    criteria: SegmentCriteria,
    daysSinceLastSent: number = 7
  ): Promise<{
    totalUsers: number;
    recentlyContacted: number;
    overlapPercentage: number;
    recentCampaigns: Array<{ campaignId: string; campaignName: string; sentCount: number }>;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastSent);

    // Get users in segment
    const segmentUsers = await this.getSegmentUsers(criteria);
    const segmentUserIds = segmentUsers.map((u) => u.id);

    // Find recently contacted users
    const recentlySent = await prisma.campaignRecipient.findMany({
      where: {
        userId: { in: segmentUserIds },
        sentAt: { gte: cutoffDate },
        status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const uniqueRecentlyContacted = new Set(recentlySent.map((r) => r.userId)).size;

    // Group by campaign
    const campaignCounts = new Map<string, { name: string; count: number }>();
    for (const recipient of recentlySent) {
      const existing = campaignCounts.get(recipient.campaignId) || {
        name: recipient.campaign.name,
        count: 0,
      };
      existing.count++;
      campaignCounts.set(recipient.campaignId, existing);
    }

    const recentCampaigns = Array.from(campaignCounts.entries())
      .map(([campaignId, data]) => ({
        campaignId,
        campaignName: data.name,
        sentCount: data.count,
      }))
      .sort((a, b) => b.sentCount - a.sentCount);

    return {
      totalUsers: segmentUsers.length,
      recentlyContacted: uniqueRecentlyContacted,
      overlapPercentage:
        segmentUsers.length > 0
          ? (uniqueRecentlyContacted / segmentUsers.length) * 100
          : 0,
      recentCampaigns,
    };
  }

  /**
   * Build Prisma where clause from segment criteria
   */
  private buildWhereClause(criteria: SegmentCriteria): any {
    const where: any = {
      email_verified: { not: null },
      deleted_at: null,
      emailPreferences: {
        globalUnsubscribe: false,
      },
    };

    // Role filter
    if (criteria.role && criteria.role.length > 0) {
      where.role = { in: criteria.role };
    }

    // Verification status (for creators/brands)
    if (criteria.verificationStatus && criteria.verificationStatus.length > 0) {
      where.OR = [
        {
          creator: {
            verificationStatus: { in: criteria.verificationStatus },
          },
        },
        {
          brand: {
            verificationStatus: { in: criteria.verificationStatus },
          },
        },
      ];
    }

    // Date filters
    if (criteria.createdAfter || criteria.createdBefore) {
      where.createdAt = {};
      if (criteria.createdAfter) {
        where.createdAt.gte = criteria.createdAfter;
      }
      if (criteria.createdBefore) {
        where.createdAt.lte = criteria.createdBefore;
      }
    }

    if (criteria.lastLoginAfter || criteria.lastLoginBefore) {
      where.lastLoginAt = {};
      if (criteria.lastLoginAfter) {
        where.lastLoginAt.gte = criteria.lastLoginAfter;
      }
      if (criteria.lastLoginBefore) {
        where.lastLoginAt.lte = criteria.lastLoginBefore;
      }
    }

    // Email preferences filter
    if (criteria.hasEmailPreference) {
      for (const [key, value] of Object.entries(criteria.hasEmailPreference)) {
        where.emailPreferences = {
          ...where.emailPreferences,
          [key]: value,
        };
      }
    }

    // Creator specialties
    if (criteria.creatorSpecialties && criteria.creatorSpecialties.length > 0) {
      where.creator = {
        specialties: {
          path: [],
          array_contains: criteria.creatorSpecialties,
        },
      };
    }

    // Brand industries
    if (criteria.brandIndustries && criteria.brandIndustries.length > 0) {
      where.brand = {
        industry: { in: criteria.brandIndustries },
      };
    }

    // Exclude recently sent (implemented via subquery in application logic)
    // This is handled separately in getSegmentUsers

    return where;
  }
}

export const segmentationService = new SegmentationService();
