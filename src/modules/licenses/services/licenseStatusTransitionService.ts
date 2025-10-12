/**
 * License Status Transition Service
 * Manages license status changes with state machine validation and audit trails
 */

import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';
import type { LicenseStatus } from '@prisma/client';

const auditService = new AuditService(prisma);
const emailService = new EmailService();

export interface TransitionContext {
  userId?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  automated?: boolean;
}

/**
 * Valid status transitions map
 * Defines which status transitions are allowed
 */
const VALID_TRANSITIONS: Record<LicenseStatus, LicenseStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELED'],
  PENDING_APPROVAL: ['PENDING_SIGNATURE', 'DRAFT', 'REJECTED', 'CANCELED'],
  PENDING_SIGNATURE: ['ACTIVE', 'PENDING_APPROVAL', 'CANCELED'],
  ACTIVE: ['EXPIRING_SOON', 'TERMINATED', 'DISPUTED', 'SUSPENDED'],
  EXPIRING_SOON: ['EXPIRED', 'RENEWED', 'TERMINATED', 'ACTIVE', 'SUSPENDED'],
  EXPIRED: ['RENEWED'],
  RENEWED: [], // Terminal state
  TERMINATED: [], // Terminal state (admin can override)
  DISPUTED: ['ACTIVE', 'TERMINATED', 'SUSPENDED'],
  CANCELED: [], // Terminal state
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
};

/**
 * Status transition requirements
 * Additional checks before allowing transition
 */
interface TransitionRequirement {
  check: (license: any) => Promise<boolean>;
  errorMessage: string;
}

export class LicenseStatusTransitionService {
  /**
   * Transition license to new status with validation
   */
  async transition(
    licenseId: string,
    toStatus: LicenseStatus,
    context: TransitionContext
  ): Promise<void> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        brand: { include: { user: true } },
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: { include: { user: true } },
              },
            },
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const fromStatus = license.status;

    // Check if transition is valid
    if (!this.isValidTransition(fromStatus, toStatus, context)) {
      throw new Error(
        `Invalid status transition from ${fromStatus} to ${toStatus}`
      );
    }

    // Check transition requirements
    await this.checkTransitionRequirements(license, toStatus);

    // Perform transition in transaction
    await prisma.$transaction(async (tx) => {
      // Update license status
      await tx.license.update({
        where: { id: licenseId },
        data: {
          status: toStatus,
          ...(toStatus === 'ACTIVE' && !license.signedAt && { signedAt: new Date() }),
          updatedBy: context.userId,
        },
      });

      // Record in status history
      await tx.licenseStatusHistory.create({
        data: {
          licenseId,
          fromStatus,
          toStatus,
          transitionedBy: context.userId,
          reason: context.reason,
          metadata: {
            automated: context.automated || false,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        },
      });

      // Log audit event
      await auditService.log({
        action: 'status_transition',
        entityType: 'license',
        entityId: licenseId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        before: { status: fromStatus },
        after: { status: toStatus, reason: context.reason },
      });
    });

    // Handle side effects
    await this.handleTransitionSideEffects(license, fromStatus, toStatus, context);
  }

  /**
   * Check if transition is valid
   */
  private isValidTransition(
    fromStatus: LicenseStatus,
    toStatus: LicenseStatus,
    context: TransitionContext
  ): boolean {
    // Same status is a no-op
    if (fromStatus === toStatus) {
      return false;
    }

    const validTransitions = VALID_TRANSITIONS[fromStatus] || [];

    // Admin can force certain transitions (emergency override)
    if (context.userId) {
      // Would need to check if user is admin
      // For now, check if coming from terminal state
      if (['TERMINATED', 'RENEWED', 'CANCELED'].includes(fromStatus)) {
        // Only admins should be able to override terminal states
        // This should be validated at the router level
      }
    }

    return validTransitions.includes(toStatus);
  }

  /**
   * Check additional requirements for transition
   */
  private async checkTransitionRequirements(
    license: any,
    toStatus: LicenseStatus
  ): Promise<void> {
    const requirements: Record<LicenseStatus, TransitionRequirement | null> = {
      DRAFT: null,
      PENDING_APPROVAL: null,
      PENDING_SIGNATURE: {
        check: async (lic) => {
          // All creators must have approved
          const allApproved = await prisma.license.findFirst({
            where: {
              id: lic.id,
              // Check approval logic here
            },
          });
          return true; // Simplified for now
        },
        errorMessage: 'All IP owners must approve before signature',
      },
      ACTIVE: {
        check: async (lic) => {
          // Must have signature proof or payment confirmation
          return true; // Simplified
        },
        errorMessage: 'License must be signed and payment terms established',
      },
      EXPIRING_SOON: null,
      EXPIRED: null,
      RENEWED: {
        check: async (lic) => {
          // Must have a renewal license
          const hasRenewal = await prisma.license.count({
            where: { parentLicenseId: lic.id },
          });
          return hasRenewal > 0;
        },
        errorMessage: 'Cannot mark as renewed without a renewal license',
      },
      TERMINATED: null,
      DISPUTED: null,
      CANCELED: null,
      SUSPENDED: null,
    };

    const requirement = requirements[toStatus];
    if (requirement) {
      const passed = await requirement.check(license);
      if (!passed) {
        throw new Error(requirement.errorMessage);
      }
    }
  }

  /**
   * Handle side effects of status transitions
   */
  private async handleTransitionSideEffects(
    license: any,
    fromStatus: LicenseStatus,
    toStatus: LicenseStatus,
    context: TransitionContext
  ): Promise<void> {
    // Send notifications based on transition
    switch (toStatus) {
      case 'PENDING_APPROVAL':
        await this.notifyCreatorsApprovalNeeded(license);
        break;

      case 'ACTIVE':
        await this.notifyLicenseActivated(license);
        break;

      case 'EXPIRING_SOON':
        await this.notifyLicenseExpiringSoon(license);
        break;

      case 'EXPIRED':
        await this.notifyLicenseExpired(license);
        break;

      case 'TERMINATED':
        await this.notifyLicenseTerminated(license, context.reason);
        break;

      case 'SUSPENDED':
        await this.notifyLicenseSuspended(license, context.reason);
        break;

      case 'DISPUTED':
        await this.notifyLicenseDisputed(license, context.reason);
        break;

      case 'RENEWED':
        await this.notifyLicenseRenewed(license);
        break;
    }

    // Schedule jobs based on new status
    if (toStatus === 'ACTIVE') {
      // Schedule expiry monitoring
      // This would integrate with job queue system
    }
  }

  /**
   * Automated status transitions based on dates and conditions
   * Called by background job
   */
  async processAutomatedTransitions(): Promise<{
    processed: number;
    errors: string[];
  }> {
    let processed = 0;
    const errors: string[] = [];
    const now = new Date();

    try {
      // ACTIVE -> EXPIRING_SOON (30 days before end)
      const activeLicenses = await prisma.license.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            gte: now,
          },
          deletedAt: null,
        },
      });

      for (const license of activeLicenses) {
        try {
          await this.transition(license.id, 'EXPIRING_SOON', {
            automated: true,
            reason: 'License approaching expiry date (30 days)',
          });
          processed++;
        } catch (error: any) {
          errors.push(`License ${license.id}: ${error.message}`);
        }
      }

      // EXPIRING_SOON -> EXPIRED (past end date)
      const expiringSoonLicenses = await prisma.license.findMany({
        where: {
          status: 'EXPIRING_SOON',
          endDate: {
            lt: now,
          },
          deletedAt: null,
        },
      });

      for (const license of expiringSoonLicenses) {
        try {
          await this.transition(license.id, 'EXPIRED', {
            automated: true,
            reason: 'License end date reached',
          });
          processed++;
        } catch (error: any) {
          errors.push(`License ${license.id}: ${error.message}`);
        }
      }

      // ACTIVE -> EXPIRED (missed EXPIRING_SOON window)
      const pastDueLicenses = await prisma.license.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            lt: now,
          },
          deletedAt: null,
        },
      });

      for (const license of pastDueLicenses) {
        try {
          // First transition to EXPIRING_SOON
          await this.transition(license.id, 'EXPIRING_SOON', {
            automated: true,
            reason: 'License past end date',
          });
          // Then to EXPIRED
          await this.transition(license.id, 'EXPIRED', {
            automated: true,
            reason: 'License past end date',
          });
          processed++;
        } catch (error: any) {
          errors.push(`License ${license.id}: ${error.message}`);
        }
      }

      // DRAFT -> CANCELED (abandoned for >90 days)
      const abandonedDrafts = await prisma.license.findMany({
        where: {
          status: 'DRAFT',
          createdAt: {
            lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          },
          deletedAt: null,
        },
      });

      for (const license of abandonedDrafts) {
        try {
          await this.transition(license.id, 'CANCELED', {
            automated: true,
            reason: 'Draft abandoned for more than 90 days',
          });
          processed++;
        } catch (error: any) {
          errors.push(`License ${license.id}: ${error.message}`);
        }
      }

      return { processed, errors };
    } catch (error: any) {
      console.error('Automated transition processing failed:', error);
      throw error;
    }
  }

  /**
   * Get status history for a license
   */
  async getStatusHistory(licenseId: string) {
    return prisma.licenseStatusHistory.findMany({
      where: { licenseId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { transitionedAt: 'desc' },
    });
  }

  /**
   * Get status distribution analytics
   */
  async getStatusDistribution(brandId?: string) {
    const where: any = { deletedAt: null };
    if (brandId) {
      where.brandId = brandId;
    }

    const distribution = await prisma.license.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    return distribution.map((d) => ({
      status: d.status,
      count: d._count,
    }));
  }

  // Notification methods
  private async notifyCreatorsApprovalNeeded(license: any): Promise<void> {
    // Implementation would send emails to all IP owners
  }

  private async notifyLicenseActivated(license: any): Promise<void> {
    // Notify brand and creators that license is now active
  }

  private async notifyLicenseExpiringSoon(license: any): Promise<void> {
    // Notify brand and creators about upcoming expiry
  }

  private async notifyLicenseExpired(license: any): Promise<void> {
    // Notify all parties that license has expired
  }

  private async notifyLicenseTerminated(license: any, reason?: string): Promise<void> {
    // Notify about termination with reason
  }

  private async notifyLicenseSuspended(license: any, reason?: string): Promise<void> {
    // Notify about suspension
  }

  private async notifyLicenseDisputed(license: any, reason?: string): Promise<void> {
    // Notify about dispute
  }

  private async notifyLicenseRenewed(license: any): Promise<void> {
    // Notify about successful renewal
  }
}

export const licenseStatusTransitionService = new LicenseStatusTransitionService();
