/**
 * License Approval Workflow Service
 * State machine for license approval process
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import type { License, LicenseStatus } from '@prisma/client';

const auditService = new AuditService(prisma);

/**
 * Approval action
 */
export type ApprovalAction = 'approve' | 'reject' | 'request_changes';

/**
 * Approval context
 */
export interface ApprovalContext {
  userId: string;
  userRole: 'creator' | 'brand' | 'admin';
  action: ApprovalAction;
  comments?: string;
  requestedChanges?: string[];
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Approval result
 */
export interface ApprovalResult {
  license: License;
  newStatus: LicenseStatus;
  nextApprover?: 'creator' | 'brand' | 'admin' | null;
  message: string;
  requiresAdminReview: boolean;
}

/**
 * Workflow state transitions
 */
type StateTransition = {
  from: LicenseStatus[];
  to: LicenseStatus;
  requiredRole: 'creator' | 'brand' | 'admin';
  notification: 'creator' | 'brand' | 'both' | null;
};

/**
 * License Approval Workflow Service
 */
export class LicenseApprovalWorkflowService {
  private emailService: EmailService;

  // Define valid state transitions
  private transitions: Record<ApprovalAction, StateTransition> = {
    approve: {
      from: ['DRAFT', 'PENDING_APPROVAL'],
      to: 'ACTIVE',
      requiredRole: 'creator',
      notification: 'brand',
    },
    reject: {
      from: ['DRAFT', 'PENDING_APPROVAL'],
      to: 'DRAFT',
      requiredRole: 'creator',
      notification: 'brand',
    },
    request_changes: {
      from: ['PENDING_APPROVAL'],
      to: 'DRAFT',
      requiredRole: 'creator',
      notification: 'brand',
    },
  };

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Process approval action
   */
  async processApproval(
    licenseId: string,
    context: ApprovalContext
  ): Promise<ApprovalResult> {
    // Get license with full details
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Verify user has permission to take this action
    await this.verifyApprovalPermission(license, context);

    // Check if state transition is valid
    const transition = this.transitions[context.action];
    if (!transition.from.includes(license.status)) {
      throw new Error(
        `Cannot ${context.action} license in ${license.status} status. Must be in ${transition.from.join(' or ')}.`
      );
    }

    // Check if admin review is required
    const requiresAdminReview = await this.checkAdminReviewRequired(license);

    // Determine new status
    let newStatus: LicenseStatus;
    if (context.action === 'approve') {
      if (requiresAdminReview && context.userRole !== 'admin') {
        newStatus = 'PENDING_APPROVAL'; // Keep in pending until admin reviews
      } else {
        newStatus = 'ACTIVE';
      }
    } else if (context.action === 'reject') {
      newStatus = 'DRAFT';
    } else if (context.action === 'request_changes') {
      newStatus = 'DRAFT';
    } else {
      newStatus = license.status;
    }

    // Update license in transaction
    const updatedLicense = await prisma.$transaction(async (tx) => {
      // Update license
      const updated = await tx.license.update({
        where: { id: licenseId },
        data: {
          status: newStatus,
          ...(context.action === 'approve' &&
            newStatus === 'ACTIVE' && {
              signedAt: new Date(),
            }),
          updatedBy: context.userId,
          metadata: {
            ...(license.metadata as any),
            approvalHistory: [
              ...((license.metadata as any)?.approvalHistory || []),
              {
                action: context.action,
                userId: context.userId,
                userRole: context.userRole,
                timestamp: new Date().toISOString(),
                previousStatus: license.status,
                newStatus,
                comments: context.comments,
                requestedChanges: context.requestedChanges,
              },
            ],
          },
        },
        include: {
          ipAsset: {
            include: {
              ownerships: {
                include: {
                  creator: {
                    include: {
                      user: true,
                    },
                  },
                },
              },
            },
          },
          brand: {
            include: {
              user: true,
            },
          },
        },
      });

      // Create audit trail
      await auditService.log({
        action: `license.${context.action}`,
        entityType: 'license',
        entityId: licenseId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        before: { status: license.status },
        after: { status: newStatus, signedAt: updated.signedAt },
      });

      // Log event
      await tx.event.create({
        data: {
          source: 'api',
          eventType: `license.${context.action}`,
          actorType: context.userRole,
          actorId: context.userId,
          licenseId: license.id,
          propsJson: {
            licenseId: license.id,
            previousStatus: license.status,
            newStatus,
            comments: context.comments,
          },
        },
      });

      return updated;
    });

    // Send notifications
    await this.sendApprovalNotifications(
      updatedLicense,
      context,
      transition.notification
    );

    // Determine next approver
    let nextApprover: 'creator' | 'brand' | 'admin' | null = null;
    if (newStatus === 'PENDING_APPROVAL' && requiresAdminReview) {
      nextApprover = 'admin';
    }

    // Generate message
    const message = this.generateApprovalMessage(context.action, newStatus, requiresAdminReview);

    return {
      license: updatedLicense,
      newStatus,
      nextApprover,
      message,
      requiresAdminReview,
    };
  }

  /**
   * Verify user has permission to approve/reject
   */
  private async verifyApprovalPermission(
    license: any,
    context: ApprovalContext
  ): Promise<void> {
    if (context.userRole === 'admin') {
      // Admins can always approve/reject
      return;
    }

    if (context.userRole === 'creator') {
      // Verify user is an owner of the asset
      const isOwner = license.ipAsset.ownerships.some(
        (o: any) => o.creator.userId === context.userId
      );

      if (!isOwner) {
        throw new Error(
          'You do not have permission to approve this license. Only asset owners can approve.'
        );
      }
    } else if (context.userRole === 'brand') {
      // Verify user is associated with the brand
      if (license.brand.userId !== context.userId) {
        throw new Error(
          'You do not have permission to act on this license. Only the brand owner can take this action.'
        );
      }
    } else {
      throw new Error('Invalid user role');
    }
  }

  /**
   * Check if license requires admin review
   */
  private async checkAdminReviewRequired(license: any): Promise<boolean> {
    // High-value licenses require admin review
    if (license.feeCents >= 1000000) {
      // $10,000+
      return true;
    }

    // Long-term exclusive licenses require admin review
    if (license.licenseType === 'EXCLUSIVE') {
      const durationDays =
        (license.endDate.getTime() - license.startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (durationDays > 365) {
        // More than 1 year
        return true;
      }
    }

    // First-time brand requires review
    const existingLicenses = await prisma.license.count({
      where: {
        brandId: license.brandId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (existingLicenses === 0) {
      return true; // First license for this brand
    }

    return false;
  }

  /**
   * Send approval notifications
   */
  private async sendApprovalNotifications(
    license: any,
    context: ApprovalContext,
    notifyWho: 'creator' | 'brand' | 'both' | null
  ): Promise<void> {
    if (!notifyWho) return;

    const metadata = license.metadata as any;
    const referenceNumber = metadata?.referenceNumber || license.id;

    try {
      // Notify creators
      if (notifyWho === 'creator' || notifyWho === 'both') {
        for (const ownership of license.ipAsset.ownerships) {
          if (ownership.creator.user.email) {
            await this.emailService.sendTransactional({
              email: ownership.creator.user.email,
              subject: this.getNotificationSubject(context.action, 'creator'),
              template: 'welcome', // TODO: Create proper templates
              variables: {
                name:
                  ownership.creator.stageName || ownership.creator.user.name || 'Creator',
                brandName: license.brand.companyName,
                assetTitle: license.ipAsset.title,
              } as any,
            });
          }
        }
      }

      // Notify brand
      if ((notifyWho === 'brand' || notifyWho === 'both') && license.brand.user.email) {
        await this.emailService.sendTransactional({
          email: license.brand.user.email,
          subject: this.getNotificationSubject(context.action, 'brand'),
          template: 'welcome', // TODO: Create proper templates
          variables: {
            name: license.brand.companyName,
            assetTitle: license.ipAsset.title,
          } as any,
        });
      }
    } catch (error) {
      console.error('Failed to send approval notification:', error);
      // Don't throw - notification failure shouldn't break the workflow
    }
  }

  /**
   * Get notification subject line
   */
  private getNotificationSubject(action: ApprovalAction, recipient: 'creator' | 'brand'): string {
    if (action === 'approve') {
      return recipient === 'brand'
        ? 'License Approved - Ready to Use'
        : 'License Approved by Creator';
    } else if (action === 'reject') {
      return recipient === 'brand'
        ? 'License Request Rejected'
        : 'License Rejected';
    } else if (action === 'request_changes') {
      return 'Changes Requested on License';
    }
    return 'License Status Update';
  }

  /**
   * Generate approval message
   */
  private generateApprovalMessage(
    action: ApprovalAction,
    newStatus: LicenseStatus,
    requiresAdminReview: boolean
  ): string {
    if (action === 'approve') {
      if (newStatus === 'ACTIVE') {
        return 'License approved and activated. Brand can now use the licensed asset.';
      } else if (requiresAdminReview) {
        return 'License approved by creator. Pending administrative review before activation.';
      } else {
        return 'License approval recorded. Status updated to pending.';
      }
    } else if (action === 'reject') {
      return 'License request rejected. Brand has been notified.';
    } else if (action === 'request_changes') {
      return 'Changes requested. License reverted to draft status for brand to revise.';
    }
    return 'License status updated.';
  }

  /**
   * Get pending approvals for a user
   */
  async getPendingApprovals(
    userId: string,
    userRole: 'creator' | 'brand' | 'admin'
  ): Promise<License[]> {
    const where: any = {
      status: { in: ['DRAFT', 'PENDING_APPROVAL'] },
      deletedAt: null,
    };

    if (userRole === 'creator') {
      where.ipAsset = {
        ownerships: {
          some: {
            creator: {
              userId,
            },
          },
        },
      };
    } else if (userRole === 'brand') {
      where.brand = {
        userId,
      };
    } else if (userRole === 'admin') {
      // Admin sees licenses that require review
      where.status = 'PENDING_APPROVAL';
    }

    return prisma.license.findMany({
      where,
      include: {
        ipAsset: {
          select: {
            id: true,
            title: true,
            type: true,
            thumbnailUrl: true,
          },
        },
        brand: {
          select: {
            id: true,
            companyName: true,
            logo: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Bulk approve licenses (admin only)
   */
  async bulkApprove(
    licenseIds: string[],
    adminUserId: string,
    comments?: string
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const licenseId of licenseIds) {
      try {
        await this.processApproval(licenseId, {
          userId: adminUserId,
          userRole: 'admin',
          action: 'approve',
          comments,
        });
        succeeded.push(licenseId);
      } catch (error) {
        failed.push({
          id: licenseId,
          error: (error as Error).message,
        });
      }
    }

    return { succeeded, failed };
  }
}

export const licenseApprovalWorkflowService = new LicenseApprovalWorkflowService();
