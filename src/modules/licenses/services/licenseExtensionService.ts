/**
 * License Extension Service
 * Handles license extensions (adding time to current license)
 * Different from renewals which create new license records
 */

import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';
import { differenceInDays, addDays } from 'date-fns';

const auditService = new AuditService(prisma);
const emailService = new EmailService();

export interface ExtensionRequest {
  licenseId: string;
  requestedBy: string;
  extensionDays: number;
  justification: string;
}

export interface ExtensionApproval {
  extensionId: string;
  approverId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class LicenseExtensionService {
  /**
   * Request a license extension
   */
  async requestExtension(request: ExtensionRequest): Promise<any> {
    const license = await prisma.license.findUnique({
      where: { id: request.licenseId },
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

    // Validate license can be extended
    if (!['ACTIVE', 'EXPIRING_SOON'].includes(license.status)) {
      throw new Error(`Cannot extend ${license.status.toLowerCase()} licenses`);
    }

    if (license.deletedAt) {
      throw new Error('Cannot extend deleted licenses');
    }

    // Validate extension request
    if (request.extensionDays < 1) {
      throw new Error('Extension must be at least 1 day');
    }

    if (request.extensionDays > 365) {
      throw new Error('Extension cannot exceed 365 days. Use renewal for longer periods.');
    }

    // Validate requester is brand owner
    const user = await prisma.user.findUnique({
      where: { id: request.requestedBy },
      include: { brand: true },
    });

    if (!user?.brand || user.brand.id !== license.brandId) {
      throw new Error('Only the brand owner can request extensions');
    }

    // Calculate new end date
    const newEndDate = addDays(license.endDate, request.extensionDays);

    // Check for conflicts with the extension
    const conflicts = await this.checkExtensionConflicts(
      license.ipAssetId,
      license.licenseType,
      license.endDate,
      newEndDate,
      license.id
    );

    if (conflicts.length > 0) {
      throw new Error(`Extension conflicts with existing licenses: ${conflicts.join(', ')}`);
    }

    // Calculate pro-rated additional fee
    const originalDuration = differenceInDays(license.endDate, license.startDate);
    const dailyRate = license.feeCents / Math.max(originalDuration, 1);
    const additionalFeeCents = Math.round(dailyRate * request.extensionDays);

    // Determine if approval is required
    // Extensions <30 days might be auto-approved based on business rules
    const approvalRequired = request.extensionDays > 30;

    // Create extension request
    const extension = await prisma.$executeRaw`
      INSERT INTO license_extensions (
        id, license_id, requested_by, status, original_end_date,
        new_end_date, extension_days, additional_fee_cents, justification,
        approval_required, created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text,
        ${request.licenseId},
        ${request.requestedBy},
        ${approvalRequired ? 'PENDING' : 'APPROVED'},
        ${license.endDate},
        ${newEndDate},
        ${request.extensionDays},
        ${additionalFeeCents},
        ${request.justification},
        ${approvalRequired},
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    // If auto-approved, apply immediately
    if (!approvalRequired) {
      const extensionId = await this.getLastExtensionId(request.licenseId);
      await this.applyExtension(extensionId, request.licenseId, newEndDate, additionalFeeCents);
    } else {
      // Notify creators for approval
      await this.notifyExtensionRequest(license, request, additionalFeeCents);
    }

    // Log audit event
    await auditService.log({
      action: 'extension_requested',
      entityType: 'license',
      entityId: request.licenseId,
      userId: request.requestedBy,
      after: {
        extensionDays: request.extensionDays,
        newEndDate,
        additionalFeeCents,
        approvalRequired,
      },
    });

    return { success: true, approvalRequired, additionalFeeCents };
  }

  /**
   * Approve or reject an extension request
   */
  async processExtensionApproval(approval: ExtensionApproval): Promise<any> {
    const extension = await prisma.$queryRaw<
      Array<{
        id: string;
        license_id: string;
        new_end_date: Date;
        additional_fee_cents: number;
        status: string;
      }>
    >`
      SELECT * FROM license_extensions WHERE id = ${approval.extensionId} LIMIT 1
    `;

    if (!extension || extension.length === 0) {
      throw new Error('Extension request not found');
    }

    const ext = extension[0];

    if (ext.status !== 'PENDING') {
      throw new Error('Extension request is not pending');
    }

    // Validate approver is an IP owner
    const license = await prisma.license.findUnique({
      where: { id: ext.license_id },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: true,
              },
            },
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const isOwner = license.ipAsset.ownerships.some(
      (o) => o.creator.userId === approval.approverId
    );

    if (!isOwner) {
      throw new Error('Only IP owners can approve extensions');
    }

    if (approval.action === 'approve') {
      // Approve and apply extension
      await prisma.$executeRaw`
        UPDATE license_extensions
        SET 
          status = 'APPROVED',
          approved_at = NOW(),
          approved_by = ${approval.approverId},
          updated_at = NOW()
        WHERE id = ${approval.extensionId}
      `;

      await this.applyExtension(
        approval.extensionId,
        ext.license_id,
        ext.new_end_date,
        ext.additional_fee_cents
      );

      await auditService.log({
        action: 'extension_approved',
        entityType: 'license',
        entityId: ext.license_id,
        userId: approval.approverId,
      });

      return { status: 'APPROVED' };
    } else {
      // Reject extension
      await prisma.$executeRaw`
        UPDATE license_extensions
        SET 
          status = 'REJECTED',
          rejected_at = NOW(),
          rejection_reason = ${approval.rejectionReason || 'No reason provided'},
          updated_at = NOW()
        WHERE id = ${approval.extensionId}
      `;

      await this.notifyExtensionRejected(ext.license_id, approval.extensionId, approval.rejectionReason);

      await auditService.log({
        action: 'extension_rejected',
        entityType: 'license',
        entityId: ext.license_id,
        userId: approval.approverId,
        after: { reason: approval.rejectionReason },
      });

      return { status: 'REJECTED' };
    }
  }

  /**
   * Apply an approved extension to the license
   */
  private async applyExtension(
    extensionId: string,
    licenseId: string,
    newEndDate: Date,
    additionalFeeCents: number
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Update license
      await tx.license.update({
        where: { id: licenseId },
        data: {
          endDate: newEndDate,
          feeCents: { increment: additionalFeeCents },
          // extensionCount: { increment: 1 },
        },
      });

      // Mark extension as applied
      await tx.$executeRaw`
        UPDATE license_extensions
        SET status = 'APPROVED', updated_at = NOW()
        WHERE id = ${extensionId}
      `;
    });

    // Notify all parties
    await this.notifyExtensionApproved(licenseId, extensionId);

    // Log in audit
    await auditService.log({
      action: 'extension_applied',
      entityType: 'license',
      entityId: licenseId,
      after: { newEndDate, additionalFeeCents },
    });
  }

  /**
   * Check if extension would conflict with other licenses
   */
  private async checkExtensionConflicts(
    ipAssetId: string,
    licenseType: string,
    currentEndDate: Date,
    newEndDate: Date,
    currentLicenseId: string
  ): Promise<string[]> {
    // Only check for exclusive licenses
    if (licenseType !== 'EXCLUSIVE') {
      return [];
    }

    const conflictingLicenses = await prisma.license.findMany({
      where: {
        ipAssetId,
        id: { not: currentLicenseId },
        licenseType: 'EXCLUSIVE',
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'PENDING_SIGNATURE', 'EXPIRING_SOON'] },
        AND: [
          {
            startDate: {
              lte: newEndDate,
            },
          },
          {
            endDate: {
              gte: currentEndDate,
            },
          },
        ],
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
      },
    });

    return conflictingLicenses.map((l) => l.id);
  }

  /**
   * Get all extensions for a license
   */
  async getExtensions(licenseId: string) {
    return prisma.$queryRaw<Array<any>>`
      SELECT * FROM license_extensions
      WHERE license_id = ${licenseId}
      ORDER BY requested_at DESC
    `;
  }

  /**
   * Get pending extension requests for a user
   */
  async getPendingExtensionsForUser(userId: string) {
    return prisma.$queryRaw<Array<any>>`
      SELECT 
        e.*,
        l.brand_id,
        l.ip_asset_id
      FROM license_extensions e
      INNER JOIN licenses l ON l.id = e.license_id
      INNER JOIN ip_assets ia ON ia.id = l.ip_asset_id
      INNER JOIN ip_ownerships io ON io.ip_asset_id = ia.id
      INNER JOIN creators c ON c.id = io.creator_id
      WHERE c.user_id = ${userId}
        AND e.status = 'PENDING'
        AND e.approval_required = true
      ORDER BY e.requested_at DESC
    `;
  }

  /**
   * Get extension analytics
   */
  async getExtensionAnalytics(brandId?: string) {
    const where = brandId
      ? `WHERE l.brand_id = '${brandId}'`
      : '';

    const stats = await prisma.$queryRaw<
      Array<{
        total_extensions: number;
        approved: number;
        rejected: number;
        pending: number;
        avg_extension_days: number;
        total_additional_fees_cents: number;
      }>
    >`
      SELECT 
        COUNT(*) as total_extensions,
        COUNT(*) FILTER (WHERE e.status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE e.status = 'REJECTED') as rejected,
        COUNT(*) FILTER (WHERE e.status = 'PENDING') as pending,
        AVG(e.extension_days) as avg_extension_days,
        SUM(e.additional_fee_cents) FILTER (WHERE e.status = 'APPROVED') as total_additional_fees_cents
      FROM license_extensions e
      INNER JOIN licenses l ON l.id = e.license_id
      ${where}
    `;

    return stats[0] || {
      total_extensions: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      avg_extension_days: 0,
      total_additional_fees_cents: 0,
    };
  }

  // Helper to get last inserted extension ID
  private async getLastExtensionId(licenseId: string): Promise<string> {
    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM license_extensions 
      WHERE license_id = ${licenseId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result[0]?.id || '';
  }

  // Notification methods
  private async notifyExtensionRequest(
    license: any,
    request: ExtensionRequest,
    additionalFeeCents: number
  ): Promise<void> {
    // Send emails to all IP owners for approval
  }

  private async notifyExtensionApproved(licenseId: string, extensionId: string): Promise<void> {
    // Send confirmation emails
  }

  private async notifyExtensionRejected(
    licenseId: string,
    extensionId: string,
    reason?: string
  ): Promise<void> {
    // Send rejection notifications
  }
}

export const licenseExtensionService = new LicenseExtensionService();
