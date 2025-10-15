/**
 * Royalty Statement Service
 * Manages creator earnings statements, PDF generation, disputes, and corrections
 */

import { PrismaClient, RoyaltyStatementStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { StatementPDFGeneratorService } from './statement-pdf-generator.service';
import { storageProvider } from '@/lib/storage';
import { emailService } from '@/lib/services/email/email.service';
import { auditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { TRPCError } from '@trpc/server';

interface CorrectionInput {
  reason: string;
  adjustmentCents: number;
  correctedBy: string;
  notes?: string;
}

export class RoyaltyStatementService {
  private pdfGenerator: StatementPDFGeneratorService;
  private notificationService: NotificationService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {
    this.pdfGenerator = new StatementPDFGeneratorService(prisma);
    this.notificationService = new NotificationService(prisma, redis);
  }

  /**
   * Notify creator that their statement is ready
   */
  async notifyStatementReady(statementId: string): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
        royaltyRun: true,
      },
    });

    if (!statement) {
      throw new Error('Statement not found');
    }

    // Send email notification
    await emailService.sendTransactional({
      to: statement.creator.user.email,
      template: 'royalty-statement',
      variables: {
        creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
        periodStart: statement.royaltyRun.periodStart,
        periodEnd: statement.royaltyRun.periodEnd,
        totalEarnings: `$${(statement.totalEarningsCents / 100).toFixed(2)}`,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/earnings`,
      },
    });

    // Create in-app notification
    await this.notificationService.create({
      userId: statement.creator.userId,
      type: 'ROYALTY_STATEMENT_READY',
      title: 'Your earnings statement is ready',
      message: `Your statement for ${statement.royaltyRun.periodStart.toLocaleDateString()} - ${statement.royaltyRun.periodEnd.toLocaleDateString()} is now available.`,
      metadata: {
        statementId: statement.id,
        amount: statement.totalEarningsCents,
      },
    });
  }

  /**
   * Mark statement as reviewed by creator
   */
  async reviewStatement(statementId: string, creatorId: string): Promise<void> {
    await this.verifyStatementOwnership(statementId, creatorId);

    await this.prisma.royaltyStatement.update({
      where: { id: statementId },
      data: {
        status: RoyaltyStatementStatus.REVIEWED,
        reviewedAt: new Date(),
      },
    });

    await auditService.log({
      userId: creatorId,
      action: 'royalty_statement.reviewed',
      resourceType: 'royalty_statement',
      resourceId: statementId,
      metadata: {
        action: 'statement_reviewed',
      },
    });
  }

  /**
   * Submit a dispute for a statement
   */
  async disputeStatement(
    statementId: string,
    reason: string,
    creatorId: string
  ): Promise<void> {
    await this.verifyStatementOwnership(statementId, creatorId);

    const statement = await this.prisma.royaltyStatement.update({
      where: { id: statementId },
      data: {
        status: RoyaltyStatementStatus.DISPUTED,
        disputeReason: reason,
        disputedAt: new Date(),
      },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
        royaltyRun: true,
      },
    });

    // Send confirmation email to creator
    await emailService.sendTransactional({
      to: statement.creator.user.email,
      template: 'royalty-dispute-confirmation',
      variables: {
        creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
        statementId: statement.id,
        reason: reason,
      },
    });

    // Notify admin team
    await emailService.sendTransactional({
      to: process.env.ADMIN_EMAIL || 'admin@yesgoddess.com',
      template: 'royalty-dispute-admin-notification',
      variables: {
        creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
        creatorEmail: statement.creator.user.email,
        statementId: statement.id,
        periodStart: statement.royaltyRun.periodStart,
        periodEnd: statement.royaltyRun.periodEnd,
        amount: `$${(statement.totalEarningsCents / 100).toFixed(2)}`,
        reason: reason,
      },
    });

    await auditService.log({
      userId: creatorId,
      action: 'royalty_statement.disputed',
      resourceType: 'royalty_statement',
      resourceId: statementId,
      metadata: {
        reason,
      },
    });
  }

  /**
   * Resolve a dispute (admin only)
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
          include: {
            user: true,
          },
        },
      },
    });

    if (!statement) {
      throw new Error('Statement not found');
    }

    if (statement.status !== RoyaltyStatementStatus.DISPUTED) {
      throw new Error('Statement is not disputed');
    }

    // Apply adjustment if provided
    if (adjustmentCents !== null && adjustmentCents !== 0) {
      await this.applyStatementCorrection(statementId, {
        reason: 'Dispute resolution adjustment',
        adjustmentCents,
        correctedBy: userId,
        notes: resolution,
      });
    }

    // Update statement status
    await this.prisma.royaltyStatement.update({
      where: { id: statementId },
      data: {
        status: RoyaltyStatementStatus.RESOLVED,
        disputeReason: resolution, // Store resolution in disputeReason field
        reviewedAt: new Date(),
      },
    });

    // Send email to creator using DisputeResolved template
    await emailService.sendTransactional({
      to: statement.creator.user.email,
      template: 'dispute-resolved',
      variables: {
        creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
        resolution,
        adjustmentAmount: adjustmentCents ? Math.abs(adjustmentCents / 100) : null,
        newTotal: adjustmentCents
          ? (statement.netPayableCents + adjustmentCents) / 100
          : statement.netPayableCents / 100,
        statementUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/earnings/statements/${statementId}`,
      },
    });

    await auditService.log({
      userId,
      action: 'royalty_statement.dispute_resolved',
      resourceType: 'royalty_statement',
      resourceId: statementId,
      metadata: {
        resolution,
        adjustmentCents,
      },
    });
  }

  /**
   * Generate PDF for a statement
   */
  async generateStatementPDF(statementId: string, userId: string): Promise<string> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
    });

    if (!statement) {
      throw new Error('Statement not found');
    }

    // Generate PDF
    const pdfBuffer = await this.pdfGenerator.generateStatementPDF(statementId);

    // Upload to storage
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const storageKey = `documents/statements/${year}/${month}/${statementId}.pdf`;

    await storageProvider.upload({
      key: storageKey,
      file: pdfBuffer,
      contentType: 'application/pdf',
      metadata: {
        statementId,
        creatorId: statement.creatorId,
        uploadedBy: userId,
      },
    });

    // Update statement with PDF info
    const metadata = statement.metadata as any || {};
    
    await this.prisma.royaltyStatement.update({
      where: { id: statementId },
      data: {
        pdfStorageKey: storageKey,
        pdfGeneratedAt: new Date(),
        metadata: {
          ...metadata,
          pdfGeneratedBy: userId,
          pdfGeneratedAt: new Date().toISOString(),
        },
      },
    });

    await auditService.log({
      userId,
      action: 'royalty_statement.pdf_generated',
      resourceType: 'royalty_statement',
      resourceId: statementId,
      metadata: {
        storageKey,
      },
    });

    return storageKey;
  }

  /**
   * Get download URL for statement PDF
   */
  async getStatementPDFDownloadUrl(
    statementId: string,
    creatorId: string
  ): Promise<{ url: string; expiresAt: Date }> {
    await this.verifyStatementOwnership(statementId, creatorId);

    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
    });

    if (!statement || !statement.pdfStorageKey) {
      throw new Error('PDF not available for this statement');
    }

    const url = await storageProvider.getDownloadUrl(statement.pdfStorageKey, 3600); // 1 hour expiry
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    return { url, expiresAt };
  }

  /**
   * Regenerate PDF for a statement (after corrections)
   */
  async regenerateStatementPDF(statementId: string, userId: string): Promise<string> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
    });

    if (!statement) {
      throw new Error('Statement not found');
    }

    // Delete old PDF if exists
    if (statement.pdfStorageKey) {
      try {
        await storageProvider.delete(statement.pdfStorageKey);
      } catch (error) {
        console.error('Error deleting old PDF:', error);
        // Continue anyway
      }
    }

    // Generate new PDF
    return this.generateStatementPDF(statementId, userId);
  }

  /**
   * Apply a correction to a statement
   */
  async applyStatementCorrection(
    statementId: string,
    correction: CorrectionInput
  ): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
        royaltyRun: true,
        lines: true,
      },
    });

    if (!statement) {
      throw new Error('Statement not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Create correction line item
      const firstAssetId = statement.lines?.[0]?.ipAssetId || 'CORRECTION';
      
      await tx.royaltyLine.create({
        data: {
          statementId,
          creatorId: statement.creatorId,
          ipAssetId: firstAssetId,
          licenseId: 'CORRECTION',
          periodStart: statement.royaltyRun.periodStart,
          periodEnd: statement.royaltyRun.periodEnd,
          revenueCents: 0,
          shareBps: 0,
          calculatedRoyaltyCents: correction.adjustmentCents,
          notes: `${correction.reason}${correction.notes ? ` - ${correction.notes}` : ''}`,
        },
      });

      // Update statement totals
      const newTotalEarnings = statement.totalEarningsCents + correction.adjustmentCents;
      const newPlatformFee = Math.floor(newTotalEarnings * 0.1); // 10% platform fee
      const newNetPayable = newTotalEarnings - newPlatformFee;

      const currentMetadata = (statement.metadata as any) || {};
      const correctionHistory = currentMetadata.correctionHistory || [];

      await tx.royaltyStatement.update({
        where: { id: statementId },
        data: {
          totalEarningsCents: newTotalEarnings,
          platformFeeCents: newPlatformFee,
          netPayableCents: newNetPayable,
          metadata: {
            ...currentMetadata,
            corrected: true,
            lastCorrectionAt: new Date().toISOString(),
            lastCorrectionBy: correction.correctedBy,
            correctionHistory: [
              ...correctionHistory,
              {
                adjustmentCents: correction.adjustmentCents,
                reason: correction.reason,
                notes: correction.notes,
                appliedAt: new Date().toISOString(),
                appliedBy: correction.correctedBy,
              },
            ],
          },
        },
      });
    });

    // Regenerate PDF
    await this.regenerateStatementPDF(statementId, correction.correctedBy);

    // Send email notification using StatementCorrected template
    await emailService.sendTransactional({
      to: statement.creator.user.email,
      template: 'statement-corrected',
      variables: {
        creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
        adjustmentType: correction.adjustmentCents > 0 ? 'credit' : 'debit',
        adjustmentAmount: Math.abs(correction.adjustmentCents / 100),
        reason: correction.reason,
        newTotal: (statement.netPayableCents + correction.adjustmentCents) / 100,
        statementUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/earnings/statements/${statementId}`,
      },
    });

    await auditService.log({
      userId: correction.correctedBy,
      action: 'royalty_statement.corrected',
      resourceType: 'royalty_statement',
      resourceId: statementId,
      metadata: {
        adjustmentCents: correction.adjustmentCents,
        reason: correction.reason,
        notes: correction.notes,
      },
    });
  }

  /**
   * Verify that a creator owns a statement
   */
  private async verifyStatementOwnership(
    statementId: string,
    creatorId: string
  ): Promise<void> {
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
    });

    if (!statement) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Statement not found',
      });
    }

    if (statement.creatorId !== creatorId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this statement',
      });
    }
  }
}
