/**
 * Royalty Statement Service
 * Handles statement generation, PDFs, notifications, and disputes
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';
import {
  RoyaltyStatementNotFoundError,
  RoyaltyStatementDisputeError,
  RoyaltyStatementAlreadyReviewedError,
  RoyaltyStatementAlreadyDisputedError,
  UnauthorizedStatementAccessError,
} from '../errors/royalty.errors';

export class RoyaltyStatementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Send statement notification email
   */
  async notifyStatementReady(statementId: string): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        royaltyRun: true,
        creator: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!statement) return;

    // Check email preferences
    const preferences = await this.prisma.emailPreferences.findUnique({
      where: { userId: statement.creator.userId },
    });

    if (preferences && !preferences.royaltyStatements) {
      console.log(
        `[RoyaltyStatement] Skipping notification for ${statement.creator.userId} - preferences disabled`
      );
      return;
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/creator/royalties/${statementId}`;

    await this.emailService.sendTransactional({
      userId: statement.creator.userId,
      email: statement.creator.user.email,
      subject: `Your Royalty Statement is Ready`,
      template: 'royalty-statement-ready',
      variables: {
        creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
        periodStart: statement.royaltyRun.periodStart.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        periodEnd: statement.royaltyRun.periodEnd.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        totalEarnings: (statement.totalEarningsCents / 100).toFixed(2),
        dashboardUrl,
      },
    });
  }

  /**
   * Handle statement review
   */
  async reviewStatement(
    statementId: string,
    creatorId: string
  ): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findFirst({
      where: {
        id: statementId,
        creatorId: creatorId,
      },
    });

    if (!statement) {
      throw new RoyaltyStatementNotFoundError(statementId);
    }

    if (statement.status !== 'PENDING') {
      throw new RoyaltyStatementAlreadyReviewedError(statementId);
    }

    await this.prisma.royaltyStatement.update({
      where: { id: statementId },
      data: {
        status: 'REVIEWED',
        reviewedAt: new Date(),
      },
    });

    await this.auditService.log({
      userId: statement.creatorId,
      action: 'royalty.statement.reviewed',
      metadata: { statementId },
    });
  }

  /**
   * Handle statement dispute
   */
  async disputeStatement(
    statementId: string,
    reason: string,
    creatorId: string
  ): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findFirst({
      where: {
        id: statementId,
        creatorId: creatorId,
      },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!statement) {
      throw new RoyaltyStatementNotFoundError(statementId);
    }

    if (statement.status === 'DISPUTED') {
      throw new RoyaltyStatementAlreadyDisputedError(statementId);
    }

    if (statement.status !== 'PENDING' && statement.status !== 'REVIEWED') {
      throw new RoyaltyStatementDisputeError(
        'Statement can only be disputed when in PENDING or REVIEWED status'
      );
    }

    await this.prisma.royaltyStatement.update({
      where: { id: statementId },
      data: {
        status: 'DISPUTED',
        disputedAt: new Date(),
        disputeReason: reason,
      },
    });

    // Notify admin team
    await this.emailService.sendTransactional({
      email: process.env.ADMIN_EMAIL!,
      subject: 'Royalty Statement Disputed',
      template: 'royalty-dispute-admin',
      variables: {
        statementId,
        creatorName: statement.creator.stageName,
        creatorEmail: statement.creator.user.email,
        reason,
        statementUrl: `${process.env.ADMIN_URL}/royalties/statements/${statementId}`,
      },
    });

    // Confirm to creator
    await this.emailService.sendTransactional({
      userId: statement.creator.userId,
      email: statement.creator.user.email,
      subject: 'Dispute Submitted Successfully',
      template: 'royalty-dispute-confirmation',
      variables: {
        creatorName: statement.creator.stageName,
        statementId,
      },
    });

    await this.auditService.log({
      userId: statement.creator.userId,
      action: 'royalty.statement.disputed',
      metadata: { statementId, reason },
    });
  }

  /**
   * Resolve dispute with optional adjustment
   */
  async resolveDispute(
    statementId: string,
    resolution: string,
    adjustmentCents: number | null,
    userId: string
  ): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        creator: {
          include: { user: true },
        },
      },
    });

    if (!statement) {
      throw new RoyaltyStatementNotFoundError(statementId);
    }

    if (statement.status !== 'DISPUTED') {
      throw new RoyaltyStatementDisputeError(
        'Statement must be in DISPUTED status'
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Apply adjustment if provided
      if (adjustmentCents !== null) {
        await tx.royaltyLine.create({
          data: {
            royaltyStatementId: statementId,
            licenseId: 'DISPUTE_RESOLUTION',
            ipAssetId: 'DISPUTE_RESOLUTION',
            revenueCents: 0,
            shareBps: 0,
            calculatedRoyaltyCents: adjustmentCents,
            periodStart: new Date(),
            periodEnd: new Date(),
            metadata: {
              type: 'dispute_resolution',
              resolution,
              appliedBy: userId,
              appliedAt: new Date().toISOString(),
            },
          },
        });

        await tx.royaltyStatement.update({
          where: { id: statementId },
          data: {
            totalEarningsCents: statement.totalEarningsCents + adjustmentCents,
          },
        });
      }

      // Update status
      await tx.royaltyStatement.update({
        where: { id: statementId },
        data: {
          status: 'RESOLVED',
        },
      });
    });

    // Email creator
    await this.emailService.sendTransactional({
      userId: statement.creator.userId,
      email: statement.creator.user.email,
      subject: 'Your Dispute Has Been Resolved',
      template: 'royalty-dispute-resolved',
      variables: {
        creatorName: statement.creator.stageName,
        resolution,
        adjustmentAmount: adjustmentCents
          ? (adjustmentCents / 100).toFixed(2)
          : null,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/creator/royalties/${statementId}`,
      },
    });

    await this.auditService.log({
      userId,
      action: 'royalty.statement.dispute_resolved',
      metadata: { statementId, resolution, adjustmentCents },
    });
  }

  /**
   * Verify statement belongs to creator
   */
  async verifyStatementOwnership(
    statementId: string,
    creatorId: string
  ): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findFirst({
      where: {
        id: statementId,
        creatorId: creatorId,
      },
    });

    if (!statement) {
      throw new UnauthorizedStatementAccessError(statementId);
    }
  }
}
