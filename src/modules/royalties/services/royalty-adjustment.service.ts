/**
 * Royalty Adjustment Service
 * Advanced adjustment handling with approval workflows, reversals, and audit trails
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AuditService } from '@/lib/services/audit.service';
import { ADJUSTMENT_TYPES, adjustmentRequiresApproval } from '../config/calculation.config';
import { RoyaltyCalculationError } from '../errors/royalty.errors';

export interface AdjustmentRequest {
  statementId: string;
  adjustmentCents: number;
  reason: string;
  adjustmentType: keyof typeof ADJUSTMENT_TYPES;
  requestedBy: string;
  approvedBy?: string;
  metadata?: any;
}

export interface AdjustmentApproval {
  adjustmentId: string;
  approvedBy: string;
  approvalNotes?: string;
}

export interface AdjustmentReversal {
  adjustmentId: string;
  reversedBy: string;
  reversalReason: string;
}

export interface AdjustmentSummary {
  adjustmentId: string;
  statementId: string;
  creatorId: string;
  adjustmentCents: number;
  adjustmentType: string;
  reason: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'APPLIED' | 'REVERSED' | 'REJECTED';
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  appliedAt?: Date;
  reversedAt?: Date;
  requiresApproval: boolean;
  canBeReversed: boolean;
}

/**
 * Advanced Royalty Adjustment Service
 * Provides approval workflows, batch adjustments, and reversal capabilities
 */
export class RoyaltyAdjustmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly auditService: AuditService
  ) {}

  /**
   * Request an adjustment (may require approval)
   */
  async requestAdjustment(request: AdjustmentRequest): Promise<{
    adjustmentId: string;
    requiresApproval: boolean;
    status: string;
  }> {
    // Validate adjustment type
    if (!Object.values(ADJUSTMENT_TYPES).includes(request.adjustmentType as any)) {
      throw new RoyaltyCalculationError(
        `Invalid adjustment type: ${request.adjustmentType}`
      );
    }

    // Check if statement exists and is adjustable
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: request.statementId },
      include: {
        royaltyRun: true,
      },
    });

    if (!statement) {
      throw new RoyaltyCalculationError('Statement not found');
    }

    if (statement.royaltyRun.status === 'LOCKED') {
      throw new RoyaltyCalculationError(
        'Cannot adjust statements in locked royalty runs'
      );
    }

    // Determine if approval is required
    const requiresApproval = adjustmentRequiresApproval(request.adjustmentCents);

    // Create adjustment metadata
    const adjustmentMetadata = {
      type: 'adjustment_request',
      adjustmentType: request.adjustmentType,
      reason: request.reason,
      requestedBy: request.requestedBy,
      requestedAt: new Date().toISOString(),
      requiresApproval,
      originalMetadata: request.metadata,
    };

    // If no approval required, apply immediately
    if (!requiresApproval) {
      const adjustmentLine = await this.prisma.royaltyLine.create({
        data: {
          royaltyStatementId: request.statementId,
          licenseId: 'MANUAL_ADJUSTMENT',
          ipAssetId: 'MANUAL_ADJUSTMENT',
          revenueCents: 0,
          shareBps: 0,
          calculatedRoyaltyCents: request.adjustmentCents,
          periodStart: statement.createdAt,
          periodEnd: statement.createdAt,
          metadata: {
            ...adjustmentMetadata,
            status: 'APPLIED',
            appliedAt: new Date().toISOString(),
          },
        },
      });

      // Update statement total
      await this.prisma.royaltyStatement.update({
        where: { id: request.statementId },
        data: {
          totalEarningsCents: {
            increment: request.adjustmentCents,
          },
        },
      });

      // Update run totals
      await this.prisma.royaltyRun.update({
        where: { id: statement.royaltyRunId },
        data: {
          totalRoyaltiesCents: {
            increment: request.adjustmentCents,
          },
        },
      });

      await this.auditService.log({
        userId: request.requestedBy,
        action: 'royalty.adjustment.applied',
        entityType: 'royalty_line',
        entityId: adjustmentLine.id,
        after: { adjustmentCents: request.adjustmentCents, reason: request.reason },
      });

      // Invalidate cache
      await this.redis.del(`royalty_statement:${request.statementId}`);

      return {
        adjustmentId: adjustmentLine.id,
        requiresApproval: false,
        status: 'APPLIED',
      };
    }

    // Create pending adjustment for approval
    const adjustmentLine = await this.prisma.royaltyLine.create({
      data: {
        royaltyStatementId: request.statementId,
        licenseId: 'PENDING_ADJUSTMENT',
        ipAssetId: 'PENDING_ADJUSTMENT',
        revenueCents: 0,
        shareBps: 0,
        calculatedRoyaltyCents: 0, // Not applied yet
        periodStart: statement.createdAt,
        periodEnd: statement.createdAt,
        metadata: {
          ...adjustmentMetadata,
          status: 'PENDING_APPROVAL',
          pendingAdjustmentCents: request.adjustmentCents,
        },
      },
    });

    await this.auditService.log({
      userId: request.requestedBy,
      action: 'royalty.adjustment.requested',
      entityType: 'royalty_line',
      entityId: adjustmentLine.id,
      after: { adjustmentCents: request.adjustmentCents, reason: request.reason },
    });

    return {
      adjustmentId: adjustmentLine.id,
      requiresApproval: true,
      status: 'PENDING_APPROVAL',
    };
  }

  /**
   * Approve a pending adjustment
   */
  async approveAdjustment(approval: AdjustmentApproval): Promise<void> {
    const adjustmentLine = await this.prisma.royaltyLine.findUnique({
      where: { id: approval.adjustmentId },
      include: {
        royaltyStatement: {
          include: {
            royaltyRun: true,
          },
        },
      },
    });

    if (!adjustmentLine) {
      throw new RoyaltyCalculationError('Adjustment not found');
    }

    const metadata = adjustmentLine.metadata as any;

    if (metadata.status !== 'PENDING_APPROVAL') {
      throw new RoyaltyCalculationError(
        `Adjustment is in ${metadata.status} status and cannot be approved`
      );
    }

    if (adjustmentLine.royaltyStatement.royaltyRun.status === 'LOCKED') {
      throw new RoyaltyCalculationError(
        'Cannot approve adjustments in locked royalty runs'
      );
    }

    const pendingAdjustmentCents = metadata.pendingAdjustmentCents || 0;

    // Apply the adjustment
    await this.prisma.$transaction(async (tx) => {
      // Update adjustment line
      await tx.royaltyLine.update({
        where: { id: approval.adjustmentId },
        data: {
          calculatedRoyaltyCents: pendingAdjustmentCents,
          metadata: {
            ...metadata,
            status: 'APPROVED',
            approvedBy: approval.approvedBy,
            approvedAt: new Date().toISOString(),
            approvalNotes: approval.approvalNotes,
            appliedAt: new Date().toISOString(),
          },
        },
      });

      // Update statement total
      await tx.royaltyStatement.update({
        where: { id: adjustmentLine.royaltyStatementId },
        data: {
          totalEarningsCents: {
            increment: pendingAdjustmentCents,
          },
        },
      });

      // Update run totals
      await tx.royaltyRun.update({
        where: { id: adjustmentLine.royaltyStatement.royaltyRunId },
        data: {
          totalRoyaltiesCents: {
            increment: pendingAdjustmentCents,
          },
        },
      });
    });

    await this.auditService.log({
      userId: approval.approvedBy,
      action: 'royalty.adjustment.approved',
      entityType: 'royalty_line',
      entityId: approval.adjustmentId,
      after: { adjustmentCents: pendingAdjustmentCents, approvalNotes: approval.approvalNotes },
    });

    // Invalidate cache
    await this.redis.del(`royalty_statement:${adjustmentLine.royaltyStatementId}`);
  }

  /**
   * Reject a pending adjustment
   */
  async rejectAdjustment(
    adjustmentId: string,
    rejectedBy: string,
    rejectionReason: string
  ): Promise<void> {
    const adjustmentLine = await this.prisma.royaltyLine.findUnique({
      where: { id: adjustmentId },
    });

    if (!adjustmentLine) {
      throw new RoyaltyCalculationError('Adjustment not found');
    }

    const metadata = adjustmentLine.metadata as any;

    if (metadata.status !== 'PENDING_APPROVAL') {
      throw new RoyaltyCalculationError(
        `Adjustment is in ${metadata.status} status and cannot be rejected`
      );
    }

    // Update adjustment to rejected status
    await this.prisma.royaltyLine.update({
      where: { id: adjustmentId },
      data: {
        metadata: {
          ...metadata,
          status: 'REJECTED',
          rejectedBy,
          rejectedAt: new Date().toISOString(),
          rejectionReason,
        },
      },
    });

    await this.auditService.log({
      userId: rejectedBy,
      action: 'royalty.adjustment.rejected',
      entityType: 'royalty_line',
      entityId: adjustmentId,
      after: { rejectionReason },
    });

    // Invalidate cache
    await this.redis.del(`royalty_statement:${adjustmentLine.royaltyStatementId}`);
  }

  /**
   * Reverse an applied adjustment
   */
  async reverseAdjustment(reversal: AdjustmentReversal): Promise<string> {
    const originalAdjustment = await this.prisma.royaltyLine.findUnique({
      where: { id: reversal.adjustmentId },
      include: {
        royaltyStatement: {
          include: {
            royaltyRun: true,
          },
        },
      },
    });

    if (!originalAdjustment) {
      throw new RoyaltyCalculationError('Adjustment not found');
    }

    const metadata = originalAdjustment.metadata as any;

    if (metadata.status !== 'APPROVED' && metadata.status !== 'APPLIED') {
      throw new RoyaltyCalculationError(
        `Cannot reverse adjustment in ${metadata.status} status`
      );
    }

    if (metadata.status === 'REVERSED') {
      throw new RoyaltyCalculationError('Adjustment has already been reversed');
    }

    if (originalAdjustment.royaltyStatement.royaltyRun.status === 'LOCKED') {
      throw new RoyaltyCalculationError(
        'Cannot reverse adjustments in locked royalty runs'
      );
    }

    const reversalAdjustmentCents = -originalAdjustment.calculatedRoyaltyCents;

    // Create reversal entry
    const reversalLine = await this.prisma.$transaction(async (tx) => {
      // Mark original as reversed
      await tx.royaltyLine.update({
        where: { id: reversal.adjustmentId },
        data: {
          metadata: {
            ...metadata,
            status: 'REVERSED',
            reversedBy: reversal.reversedBy,
            reversedAt: new Date().toISOString(),
            reversalReason: reversal.reversalReason,
          },
        },
      });

      // Create reversal line
      const reversalLine = await tx.royaltyLine.create({
        data: {
          royaltyStatementId: originalAdjustment.royaltyStatementId,
          licenseId: 'ADJUSTMENT_REVERSAL',
          ipAssetId: 'ADJUSTMENT_REVERSAL',
          revenueCents: 0,
          shareBps: 0,
          calculatedRoyaltyCents: reversalAdjustmentCents,
          periodStart: originalAdjustment.periodStart,
          periodEnd: originalAdjustment.periodEnd,
          metadata: {
            type: 'adjustment_reversal',
            originalAdjustmentId: reversal.adjustmentId,
            reversedBy: reversal.reversedBy,
            reversedAt: new Date().toISOString(),
            reversalReason: reversal.reversalReason,
            originalAdjustmentType: metadata.adjustmentType,
            originalReason: metadata.reason,
          },
        },
      });

      // Update statement total
      await tx.royaltyStatement.update({
        where: { id: originalAdjustment.royaltyStatementId },
        data: {
          totalEarningsCents: {
            increment: reversalAdjustmentCents,
          },
        },
      });

      // Update run totals
      await tx.royaltyRun.update({
        where: { id: originalAdjustment.royaltyStatement.royaltyRunId },
        data: {
          totalRoyaltiesCents: {
            increment: reversalAdjustmentCents,
          },
        },
      });

      return reversalLine;
    });

    await this.auditService.log({
      userId: reversal.reversedBy,
      action: 'royalty.adjustment.reversed',
      entityType: 'royalty_line',
      entityId: reversal.adjustmentId,
      after: { reversalReason: reversal.reversalReason, reversalLineId: reversalLine.id },
    });

    // Invalidate cache
    await this.redis.del(`royalty_statement:${originalAdjustment.royaltyStatementId}`);

    return reversalLine.id;
  }

  /**
   * Batch apply adjustments to multiple statements
   */
  async batchApplyAdjustments(
    adjustments: AdjustmentRequest[]
  ): Promise<Array<{ statementId: string; adjustmentId: string; status: string }>> {
    const results: Array<{ statementId: string; adjustmentId: string; status: string }> = [];

    for (const adjustment of adjustments) {
      try {
        const result = await this.requestAdjustment(adjustment);
        results.push({
          statementId: adjustment.statementId,
          adjustmentId: result.adjustmentId,
          status: result.status,
        });
      } catch (error) {
        results.push({
          statementId: adjustment.statementId,
          adjustmentId: '',
          status: `FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    return results;
  }

  /**
   * Get all adjustments for a statement
   */
  async getStatementAdjustments(statementId: string): Promise<AdjustmentSummary[]> {
    const adjustmentLines = await this.prisma.royaltyLine.findMany({
      where: {
        royaltyStatementId: statementId,
        licenseId: {
          in: ['MANUAL_ADJUSTMENT', 'PENDING_ADJUSTMENT', 'ADJUSTMENT_REVERSAL'],
        },
      },
      include: {
        royaltyStatement: {
          select: {
            creatorId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return adjustmentLines.map(line => {
      const metadata = line.metadata as any;
      const status = metadata.status || 'APPLIED';

      return {
        adjustmentId: line.id,
        statementId: line.royaltyStatementId,
        creatorId: line.royaltyStatement.creatorId,
        adjustmentCents: line.calculatedRoyaltyCents || metadata.pendingAdjustmentCents || 0,
        adjustmentType: metadata.adjustmentType || metadata.type || 'UNKNOWN',
        reason: metadata.reason || metadata.reversalReason || '',
        status,
        requestedBy: metadata.requestedBy || metadata.reversedBy || 'SYSTEM',
        requestedAt: new Date(metadata.requestedAt || line.createdAt),
        approvedBy: metadata.approvedBy,
        approvedAt: metadata.approvedAt ? new Date(metadata.approvedAt) : undefined,
        appliedAt: metadata.appliedAt ? new Date(metadata.appliedAt) : undefined,
        reversedAt: metadata.reversedAt ? new Date(metadata.reversedAt) : undefined,
        requiresApproval: metadata.requiresApproval || false,
        canBeReversed: status === 'APPLIED' || status === 'APPROVED',
      };
    });
  }

  /**
   * Get pending adjustments requiring approval
   */
  async getPendingAdjustments(limit: number = 50): Promise<AdjustmentSummary[]> {
    const pendingLines = await this.prisma.royaltyLine.findMany({
      where: {
        licenseId: 'PENDING_ADJUSTMENT',
      },
      include: {
        royaltyStatement: {
          select: {
            creatorId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    const results: AdjustmentSummary[] = [];

    for (const line of pendingLines) {
      const metadata = line.metadata as any;
      if (metadata.status !== 'PENDING_APPROVAL') continue;

      results.push({
        adjustmentId: line.id,
        statementId: line.royaltyStatementId,
        creatorId: line.royaltyStatement.creatorId,
        adjustmentCents: metadata.pendingAdjustmentCents || 0,
        adjustmentType: metadata.adjustmentType || 'UNKNOWN',
        reason: metadata.reason || '',
        status: 'PENDING_APPROVAL',
        requestedBy: metadata.requestedBy || 'UNKNOWN',
        requestedAt: new Date(metadata.requestedAt || line.createdAt),
        requiresApproval: true,
        canBeReversed: false,
      });
    }

    return results;
  }
}
