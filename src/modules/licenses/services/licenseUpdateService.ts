/**
 * License Update Service
 * Handles license modifications with comprehensive validation and audit trails
 */

import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import type { License, LicenseStatus, Prisma } from '@prisma/client';
import type { UpdateLicenseInput } from '../types';

const auditService = new AuditService(prisma);

export interface UpdateContext {
  userId: string;
  userRole: 'brand' | 'creator' | 'admin';
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export class LicenseUpdateService {
  /**
   * Update a license with full validation and audit trail
   */
  async updateLicense(
    licenseId: string,
    input: UpdateLicenseInput,
    context: UpdateContext
  ): Promise<License> {
    // Fetch current license with all relations
    const currentLicense = await prisma.license.findUnique({
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

    if (!currentLicense) {
      throw new Error('License not found');
    }

    if (currentLicense.deletedAt) {
      throw new Error('Cannot update a deleted license');
    }

    // Validate permissions
    await this.validateUpdatePermissions(currentLicense, input, context);

    // Validate the update
    await this.validateUpdate(currentLicense, input);

    // Capture before state for audit
    const beforeState = this.captureLicenseState(currentLicense);

    // Perform the update in a transaction
    const updatedLicense = await prisma.$transaction(async (tx) => {
      const updated = await tx.license.update({
        where: { id: licenseId },
        data: {
          ...(input.status && { status: input.status }),
          ...(input.endDate && { endDate: new Date(input.endDate) }),
          ...(input.feeCents !== undefined && { feeCents: input.feeCents }),
          ...(input.revShareBps !== undefined && { revShareBps: input.revShareBps }),
          ...(input.paymentTerms && { paymentTerms: input.paymentTerms }),
          ...(input.billingFrequency && { billingFrequency: input.billingFrequency }),
          ...(input.scope && { scopeJson: input.scope as any }),
          ...(input.autoRenew !== undefined && { autoRenew: input.autoRenew }),
          ...(input.metadata && {
            metadata: {
              ...(currentLicense.metadata as any),
              ...(input.metadata as any),
            },
          }),
          updatedBy: context.userId,
        },
      });

      // Log audit event
      await auditService.log({
        action: 'update',
        entityType: 'license',
        entityId: licenseId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        before: beforeState,
        after: this.captureLicenseState(updated),
      });

      return updated;
    });

    return updatedLicense;
  }

  /**
   * Validate user has permission to update the license
   */
  private async validateUpdatePermissions(
    license: any,
    input: UpdateLicenseInput,
    context: UpdateContext
  ): Promise<void> {
    // Admins can update anything
    if (context.userRole === 'admin') {
      return;
    }

    // Get user's brand or creator ID
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      include: {
        brand: true,
        creator: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Status changes based on current status
    const currentStatus = license.status;

    // DRAFT - only brand can modify
    if (currentStatus === 'DRAFT') {
      if (context.userRole !== 'brand' || user.brand?.id !== license.brandId) {
        throw new Error('Only the brand owner can update draft licenses');
      }
      return;
    }

    // PENDING_APPROVAL - limited modifications
    if (currentStatus === 'PENDING_APPROVAL') {
      // Brands can modify some fields
      if (context.userRole === 'brand' && user.brand?.id === license.brandId) {
        // Can only modify non-critical fields or withdraw
        if (input.status && !['DRAFT', 'CANCELED'].includes(input.status)) {
          throw new Error('Brands can only withdraw pending licenses');
        }
        if (input.feeCents || input.revShareBps || input.scope) {
          throw new Error('Cannot modify terms while pending approval. Cancel and create new license.');
        }
        return;
      }

      // Creators cannot modify, only approve/reject through different endpoint
      if (context.userRole === 'creator') {
        throw new Error('Creators must use approval workflow to respond to licenses');
      }
    }

    // ACTIVE - very restricted updates
    if (currentStatus === 'ACTIVE') {
      // Only amendments or extensions allowed, not direct updates
      if (input.feeCents || input.revShareBps || input.scope || input.endDate) {
        throw new Error('Active licenses cannot be directly modified. Use amendments or extensions.');
      }

      // Brands can update metadata and auto-renew settings
      if (context.userRole === 'brand' && user.brand?.id === license.brandId) {
        if (input.autoRenew !== undefined || input.metadata) {
          return;
        }
      }

      throw new Error('Active licenses have restricted update permissions');
    }

    // TERMINATED, EXPIRED, SUSPENDED - no updates except by admin
    if (['TERMINATED', 'EXPIRED', 'SUSPENDED'].includes(currentStatus)) {
      throw new Error(`Cannot update ${currentStatus.toLowerCase()} licenses`);
    }
  }

  /**
   * Validate the update against business rules
   */
  private async validateUpdate(
    currentLicense: License,
    input: UpdateLicenseInput
  ): Promise<void> {
    // Date validation
    if (input.endDate) {
      const newEndDate = new Date(input.endDate);
      if (newEndDate <= currentLicense.startDate) {
        throw new Error('End date must be after start date');
      }

      // Check if extending would conflict with other licenses
      if (newEndDate > currentLicense.endDate) {
        // This should use extension workflow instead
        throw new Error('Use extension workflow to extend license end date');
      }
    }

    // Financial validation
    if (input.feeCents !== undefined) {
      if (input.feeCents < 0) {
        throw new Error('Fee cannot be negative');
      }

      // Major fee changes (>20%) on active licenses should use amendments
      if (currentLicense.status === 'ACTIVE') {
        const percentChange = Math.abs(input.feeCents - currentLicense.feeCents) / currentLicense.feeCents;
        if (percentChange > 0.2) {
          throw new Error('Fee changes exceeding 20% require amendment workflow');
        }
      }
    }

    if (input.revShareBps !== undefined) {
      if (input.revShareBps < 0 || input.revShareBps > 10000) {
        throw new Error('Revenue share must be between 0 and 10000 basis points');
      }

      // Major rev share changes on active licenses should use amendments
      if (currentLicense.status === 'ACTIVE' && currentLicense.revShareBps > 0) {
        const percentChange = Math.abs(input.revShareBps - currentLicense.revShareBps) / currentLicense.revShareBps;
        if (percentChange > 0.2) {
          throw new Error('Revenue share changes exceeding 20% require amendment workflow');
        }
      }
    }

    // Scope validation
    if (input.scope) {
      // Scope changes on active licenses should use amendments
      if (currentLicense.status === 'ACTIVE') {
        throw new Error('Scope changes on active licenses require amendment workflow');
      }
    }
  }

  /**
   * Capture current state of license for audit trail
   */
  private captureLicenseState(license: any): any {
    return {
      id: license.id,
      status: license.status,
      startDate: license.startDate.toISOString(),
      endDate: license.endDate.toISOString(),
      feeCents: license.feeCents,
      revShareBps: license.revShareBps,
      paymentTerms: license.paymentTerms,
      billingFrequency: license.billingFrequency,
      scope: license.scopeJson,
      autoRenew: license.autoRenew,
      metadata: license.metadata,
      updatedAt: license.updatedAt.toISOString(),
    };
  }

  /**
   * Bulk update licenses (admin only)
   */
  async bulkUpdate(
    licenseIds: string[],
    update: Partial<Prisma.LicenseUpdateInput>,
    context: UpdateContext
  ): Promise<{ updated: number; failed: number }> {
    if (context.userRole !== 'admin') {
      throw new Error('Bulk updates require admin permission');
    }

    let updated = 0;
    let failed = 0;

    for (const licenseId of licenseIds) {
      try {
        await prisma.license.update({
          where: { id: licenseId },
          data: {
            ...update,
            updatedBy: context.userId,
          },
        });

        await auditService.log({
          action: 'bulk_update',
          entityType: 'license',
          entityId: licenseId,
          userId: context.userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          after: update,
        });

        updated++;
      } catch (error) {
        console.error(`Failed to update license ${licenseId}:`, error);
        failed++;
      }
    }

    return { updated, failed };
  }
}

export const licenseUpdateService = new LicenseUpdateService();
