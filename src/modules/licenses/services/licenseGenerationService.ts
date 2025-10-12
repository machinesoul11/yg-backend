/**
 * License Generation Service
 * Enhanced license creation with validation and reference numbers
 */

import { prisma } from '@/lib/db';
import { scopeValidator } from '../validators/scopeValidator';
import { revenueShareValidator } from '../validators/revenueShareValidator';
import { feeCalculationService } from './feeCalculationService';
import { AuditService } from '@/lib/services/audit.service';
import type { CreateLicenseInput } from '../types';
import type { License } from '@prisma/client';

const auditService = new AuditService(prisma);

/**
 * License generation result
 */
export interface LicenseGenerationResult {
  license: License;
  referenceNumber: string;
  validationWarnings: string[];
  feeBreakdown: any;
}

/**
 * License Generation Service
 */
export class LicenseGenerationService {
  /**
   * Generate a new license with full validation and initialization
   */
  async generateLicense(
    input: CreateLicenseInput,
    userId: string,
    requestContext?: {
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    }
  ): Promise<LicenseGenerationResult> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    const validationWarnings: string[] = [];

    // Comprehensive validation
    await this.validateLicenseCreation(input, startDate, endDate, validationWarnings);

    // Calculate fees if not provided
    let feeCents = input.feeCents;
    let feeBreakdown = null;

    if (feeCents === undefined || feeCents === 0) {
      const calculated = await feeCalculationService.calculateFee({
        ipAssetId: input.ipAssetId,
        licenseType: input.licenseType,
        scope: input.scope,
        startDate,
        endDate,
        brandId: input.brandId,
      });
      feeCents = calculated.totalFeeCents;
      feeBreakdown = calculated;

      if (calculated.minimumEnforced) {
        validationWarnings.push('Minimum fee was enforced due to low calculated value');
      }
    }

    // Generate unique reference number
    const referenceNumber = await this.generateReferenceNumber();

    // Create license in transaction
    const license = await prisma.$transaction(async (tx) => {
      // Create the license
      const newLicense = await tx.license.create({
        data: {
          ipAssetId: input.ipAssetId,
          brandId: input.brandId,
          projectId: input.projectId,
          licenseType: input.licenseType,
          status: 'DRAFT',
          startDate,
          endDate,
          feeCents,
          revShareBps: input.revShareBps,
          paymentTerms: input.paymentTerms,
          billingFrequency: input.billingFrequency,
          scopeJson: input.scope as any,
          autoRenew: input.autoRenew ?? false,
          metadata: {
            ...(input.metadata || {}),
            referenceNumber,
            feeBreakdown,
            validationWarnings,
            createdVia: 'api',
          } as any,
          createdBy: userId,
        },
      });

      // Create audit trail
      await auditService.log({
        action: 'license.created',
        entityType: 'license',
        entityId: newLicense.id,
        userId,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
        requestId: requestContext?.requestId,
        after: {
          licenseId: newLicense.id,
          ipAssetId: input.ipAssetId,
          brandId: input.brandId,
          licenseType: input.licenseType,
          feeCents,
          revShareBps: input.revShareBps,
          referenceNumber,
        },
      });

      return newLicense;
    });

    return {
      license,
      referenceNumber,
      validationWarnings,
      feeBreakdown,
    };
  }

  /**
   * Validate license creation
   */
  private async validateLicenseCreation(
    input: CreateLicenseInput,
    startDate: Date,
    endDate: Date,
    warnings: string[]
  ): Promise<void> {
    const errors: string[] = [];

    // Date validation
    if (endDate <= startDate) {
      errors.push('End date must be after start date');
    }

    const now = new Date();
    if (startDate < now) {
      const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 1) {
        errors.push('Start date cannot be in the past');
      } else {
        warnings.push('Start date is today or yesterday; this may cause immediate activation issues');
      }
    }

    // Verify IP asset exists and is licensable
    const ipAsset = await prisma.ipAsset.findUnique({
      where: { id: input.ipAssetId },
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
    });

    if (!ipAsset) {
      errors.push('IP asset not found');
    } else {
      if (ipAsset.deletedAt) {
        errors.push('Cannot license a deleted asset');
      }

      if (ipAsset.status !== 'PUBLISHED' && ipAsset.status !== 'APPROVED') {
        errors.push(`Asset status is ${ipAsset.status}; must be PUBLISHED or APPROVED to license`);
      }

      // Verify ownership exists
      if (ipAsset.ownerships.length === 0) {
        errors.push('Asset has no ownership records; cannot be licensed');
      }
    }

    // Verify brand exists
    const brand = await prisma.brand.findUnique({
      where: { id: input.brandId },
    });

    if (!brand) {
      errors.push('Brand not found');
    } else if (brand.deletedAt) {
      errors.push('Cannot create license for deleted brand');
    }

    // Validate scope
    const scopeValidation = await scopeValidator.validateScope(
      input.scope,
      input.licenseType,
      input.ipAssetId,
      startDate,
      endDate
    );

    errors.push(...scopeValidation.errors);
    warnings.push(...scopeValidation.warnings);

    // Validate revenue share
    const revShareValidation = await revenueShareValidator.validateRevenueShare(
      input.revShareBps,
      input.feeCents,
      input.ipAssetId,
      input.billingFrequency
    );

    errors.push(...revShareValidation.errors);
    warnings.push(...revShareValidation.warnings);

    // If there are errors, throw
    if (errors.length > 0) {
      const error = new Error(
        `License validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
      );
      error.name = 'LicenseValidationError';
      throw error;
    }
  }

  /**
   * Generate unique license reference number
   * Format: LIC-YYYY-XXXXXXXX (e.g., LIC-2025-A3B5C7D9)
   */
  private async generateReferenceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters
    
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // Generate 8-character code
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const referenceNumber = `LIC-${year}-${code}`;

      // Check for uniqueness
      const existing = await prisma.license.findFirst({
        where: {
          metadata: {
            path: ['referenceNumber'],
            equals: referenceNumber,
          },
        },
      });

      if (!existing) {
        return referenceNumber;
      }

      attempts++;
    }

    // Fallback to timestamp-based
    const timestamp = Date.now().toString(36).toUpperCase();
    return `LIC-${year}-${timestamp}`;
  }

  /**
   * Calculate license value estimate (fixed + projected revenue share)
   */
  async estimateLicenseValue(
    licenseId: string,
    estimatedRevenueCents: number
  ): Promise<{
    fixedFeeCents: number;
    estimatedRevShareCents: number;
    estimatedTotalCents: number;
    platformFeeCents: number;
    creatorNetCents: number;
  }> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      select: {
        feeCents: true,
        revShareBps: true,
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const fixedFeeCents = license.feeCents;
    const estimatedRevShareCents = Math.round(
      (estimatedRevenueCents * license.revShareBps) / 10000
    );
    const estimatedTotalCents = fixedFeeCents + estimatedRevShareCents;

    // Platform fee (10%)
    const platformFeeCents = Math.round(estimatedTotalCents * 0.1);
    const creatorNetCents = estimatedTotalCents - platformFeeCents;

    return {
      fixedFeeCents,
      estimatedRevShareCents,
      estimatedTotalCents,
      platformFeeCents,
      creatorNetCents,
    };
  }
}

export const licenseGenerationService = new LicenseGenerationService();
