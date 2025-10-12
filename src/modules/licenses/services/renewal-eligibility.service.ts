/**
 * Renewal Eligibility Service
 * Comprehensive evaluation of license renewal eligibility with detailed context
 */

import { prisma } from '@/lib/db';
import { differenceInDays, addDays, isAfter, isBefore } from 'date-fns';
import { licenseConflictDetectionService } from './licenseConflictDetectionService';
import type { License, LicenseStatus } from '@prisma/client';

export interface RenewalEligibilityContext {
  eligible: boolean;
  reasons: string[];
  blockingIssues: string[];
  warnings: string[];
  metadata: {
    daysUntilExpiration: number;
    currentLicenseValue: number;
    historicalRenewalRate?: number;
    renewalLikelihood?: 'HIGH' | 'MEDIUM' | 'LOW';
    lastRenewalDate?: Date;
    renewalCount: number;
    brandRelationshipLength: number; // in days
    hasAutoRenew: boolean;
    hasPaymentIssues: boolean;
    hasActiveDisputes: boolean;
    conflictCount: number;
  };
  suggestedAction?: string;
}

export interface SingleLicenseEligibilityCheck {
  licenseId: string;
  eligibility: RenewalEligibilityContext;
}

export interface BatchEligibilityResult {
  totalChecked: number;
  eligible: number;
  ineligible: number;
  results: SingleLicenseEligibilityCheck[];
  summary: {
    autoRenewReady: number;
    requiresManualReview: number;
    blocked: number;
  };
}

export class RenewalEligibilityService {
  /**
   * Check renewal eligibility for a single license with comprehensive context
   */
  async checkEligibility(licenseId: string): Promise<RenewalEligibilityContext> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        brand: {
          include: {
            user: true,
            payments: {
              where: {
                status: 'FAILED',
                createdAt: {
                  gte: addDays(new Date(), -90), // Last 90 days
                },
              },
              take: 1,
            },
          },
        },
        ipAsset: {
          include: {
            ownerships: {
              where: {
                OR: [
                  { endDate: null },
                  { endDate: { gt: new Date() } },
                ],
              },
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
        parentLicense: true,
        renewals: {
          where: {
            status: {
              in: ['ACTIVE', 'PENDING_APPROVAL', 'DRAFT'],
            },
          },
        },
        project: true,
      },
    });

    if (!license) {
      return {
        eligible: false,
        reasons: ['License not found'],
        blockingIssues: ['License does not exist'],
        warnings: [],
        metadata: this.getDefaultMetadata(),
      };
    }

    const reasons: string[] = [];
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const now = new Date();
    const daysUntilExpiration = differenceInDays(license.endDate, now);

    // Build metadata
    const metadata = await this.buildEligibilityMetadata(license, daysUntilExpiration);

    // 1. Check renewal window (90 days before expiration)
    if (daysUntilExpiration > 90) {
      blockingIssues.push(
        `License is outside renewal window (${daysUntilExpiration} days remaining, window opens at 90 days)`
      );
      reasons.push('Too early for renewal');
    }

    // 2. Check if license has already expired (allow grace period of 30 days)
    if (daysUntilExpiration < -30) {
      blockingIssues.push(
        `License expired more than 30 days ago (${Math.abs(daysUntilExpiration)} days ago)`
      );
      reasons.push('License expired beyond grace period');
    }

    // 3. Check license status
    const eligibleStatuses = ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'];
    if (!eligibleStatuses.includes(license.status)) {
      blockingIssues.push(
        `License status is ${license.status}, must be ACTIVE, EXPIRING_SOON, or EXPIRED`
      );
      reasons.push('Invalid license status for renewal');
    }

    // 4. Check if already renewed
    if (license.renewals && license.renewals.length > 0) {
      blockingIssues.push(
        `License has ${license.renewals.length} active renewal(s) already in progress`
      );
      reasons.push('License already has active renewal');
    }

    // 5. Check if license is deleted
    if (license.deletedAt) {
      blockingIssues.push('License has been deleted');
      reasons.push('Deleted license cannot be renewed');
    }

    // 6. Check IP asset status
    if (license.ipAsset.deletedAt) {
      blockingIssues.push('IP asset has been deleted');
      reasons.push('Underlying IP asset no longer available');
    }

    if (license.ipAsset.status !== 'PUBLISHED') {
      warnings.push(
        `IP asset status is ${license.ipAsset.status}, not PUBLISHED. May require review.`
      );
    }

    // 7. Check ownership validity
    if (license.ipAsset.ownerships.length === 0) {
      blockingIssues.push('No active IP ownership found for this asset');
      reasons.push('Cannot renew without valid ownership');
    } else {
      // Check if all creators are still active
      const inactiveCreators = license.ipAsset.ownerships.filter(
        (o) => !o.creator.user.isActive || o.creator.user.deleted_at
      );

      if (inactiveCreators.length > 0) {
        warnings.push(
          `${inactiveCreators.length} creator(s) are inactive. Manual review required.`
        );
      }
    }

    // 8. Check brand account standing
    if (license.brand.deletedAt) {
      blockingIssues.push('Brand account has been deleted');
      reasons.push('Brand no longer active on platform');
    }

    if (!license.brand.user.isActive) {
      blockingIssues.push('Brand user account is inactive');
      reasons.push('Brand account suspended or deactivated');
    }

    // 9. Check payment issues
    if (metadata.hasPaymentIssues) {
      warnings.push(
        'Brand has recent payment failures. Renewal may require payment method update.'
      );
    }

    // 10. Check for active disputes (checking IpOwnership disputes related to this license's asset)
    const disputedOwnerships = await prisma.ipOwnership.count({
      where: {
        ipAssetId: license.ipAssetId,
        disputed: true,
        resolvedAt: null, // Only count unresolved disputes
      },
    });

    if (disputedOwnerships > 0) {
      blockingIssues.push(`IP asset has ${disputedOwnerships} active ownership dispute(s)`);
      reasons.push('Active ownership disputes must be resolved before renewal');
      metadata.hasActiveDisputes = true;
    }

    // 11. Check for future conflicts
    const proposedStartDate = addDays(license.endDate, 1);
    const originalDuration = differenceInDays(license.endDate, license.startDate);
    const proposedEndDate = addDays(proposedStartDate, originalDuration);

    const conflicts = await licenseConflictDetectionService.checkConflicts({
      ipAssetId: license.ipAssetId,
      startDate: proposedStartDate,
      endDate: proposedEndDate,
      licenseType: license.licenseType as any,
      scope: license.scopeJson as any,
      excludeLicenseId: licenseId,
    });

    if (conflicts.hasConflicts) {
      metadata.conflictCount = conflicts.conflicts.length;
      warnings.push(
        `Renewal would conflict with ${conflicts.conflicts.length} existing license(s). Date adjustment may be required.`
      );
      // Note: This is a warning, not a blocking issue, as conflicts may be resolvable
    }

    // 12. Check if brand has verified payment method
    // This would check Stripe or payment provider - placeholder for now
    if (!license.brand.billingInfo) {
      warnings.push('Brand has no billing information on file. Payment setup required.');
    }

    // Determine eligibility
    const eligible = blockingIssues.length === 0;

    // Generate suggested action
    let suggestedAction: string | undefined;
    if (eligible) {
      if (metadata.hasAutoRenew) {
        suggestedAction =
          'License eligible for automatic renewal. Will process at 60 days before expiration.';
      } else {
        suggestedAction = 'Generate renewal offer and notify brand for manual approval.';
      }
    } else {
      suggestedAction = `Resolve blocking issues: ${blockingIssues.slice(0, 2).join('; ')}${
        blockingIssues.length > 2 ? '...' : ''
      }`;
    }

    return {
      eligible,
      reasons: eligible ? ['License meets all renewal criteria'] : reasons,
      blockingIssues,
      warnings,
      metadata,
      suggestedAction,
    };
  }

  /**
   * Check eligibility for multiple licenses (batch processing)
   */
  async checkBatchEligibility(licenseIds: string[]): Promise<BatchEligibilityResult> {
    const results: SingleLicenseEligibilityCheck[] = [];
    let eligible = 0;
    let ineligible = 0;
    let autoRenewReady = 0;
    let requiresManualReview = 0;
    let blocked = 0;

    for (const licenseId of licenseIds) {
      try {
        const eligibility = await this.checkEligibility(licenseId);
        results.push({ licenseId, eligibility });

        if (eligibility.eligible) {
          eligible++;
          if (eligibility.metadata.hasAutoRenew) {
            autoRenewReady++;
          } else {
            requiresManualReview++;
          }
        } else {
          ineligible++;
          blocked++;
        }
      } catch (error) {
        console.error(`Failed to check eligibility for license ${licenseId}:`, error);
        ineligible++;
        blocked++;
      }
    }

    return {
      totalChecked: licenseIds.length,
      eligible,
      ineligible,
      results,
      summary: {
        autoRenewReady,
        requiresManualReview,
        blocked,
      },
    };
  }

  /**
   * Find all licenses eligible for renewal within specified days
   */
  async findEligibleLicenses(
    daysUntilExpiration: number = 90
  ): Promise<SingleLicenseEligibilityCheck[]> {
    const targetDate = addDays(new Date(), daysUntilExpiration);

    const licenses = await prisma.license.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'] as any },
        endDate: {
          lte: targetDate,
          gte: new Date(),
        },
        deletedAt: null,
      },
      select: { id: true },
    });

    const licenseIds = licenses.map((l) => l.id);
    const batchResult = await this.checkBatchEligibility(licenseIds);

    return batchResult.results.filter((r) => r.eligibility.eligible);
  }

  /**
   * Build comprehensive eligibility metadata
   */
  private async buildEligibilityMetadata(
    license: any,
    daysUntilExpiration: number
  ): Promise<RenewalEligibilityContext['metadata']> {
    const now = new Date();

    // Calculate current license value
    const currentLicenseValue = license.feeCents;

    // Get renewal history
    const allLicensesForAsset = await prisma.license.findMany({
      where: {
        ipAssetId: license.ipAssetId,
        brandId: license.brandId,
        status: { in: ['ACTIVE', 'EXPIRED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const renewalCount = allLicensesForAsset.filter((l) => l.parentLicenseId).length;

    // Calculate brand relationship length
    const firstLicense = allLicensesForAsset[0];
    const brandRelationshipLength = firstLicense
      ? differenceInDays(now, firstLicense.createdAt)
      : 0;

    // Determine renewal likelihood based on history
    let renewalLikelihood: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (renewalCount >= 2) {
      renewalLikelihood = 'HIGH';
    } else if (renewalCount === 0) {
      renewalLikelihood = 'LOW';
    }

    // Calculate historical renewal rate
    const expiredLicenses = allLicensesForAsset.filter((l) => l.status === 'EXPIRED');
    const renewedLicenses = expiredLicenses.filter((l) =>
      allLicensesForAsset.some((al) => al.parentLicenseId === l.id)
    );
    const historicalRenewalRate =
      expiredLicenses.length > 0 ? renewedLicenses.length / expiredLicenses.length : undefined;

    // Check payment issues
    const hasPaymentIssues = license.brand.payments && license.brand.payments.length > 0;

    return {
      daysUntilExpiration,
      currentLicenseValue,
      historicalRenewalRate,
      renewalLikelihood,
      lastRenewalDate: license.createdAt,
      renewalCount,
      brandRelationshipLength,
      hasAutoRenew: license.autoRenew,
      hasPaymentIssues,
      hasActiveDisputes: false, // Will be set by dispute check
      conflictCount: 0, // Will be set by conflict check
    };
  }

  /**
   * Get default metadata for error cases
   */
  private getDefaultMetadata(): RenewalEligibilityContext['metadata'] {
    return {
      daysUntilExpiration: 0,
      currentLicenseValue: 0,
      renewalCount: 0,
      brandRelationshipLength: 0,
      hasAutoRenew: false,
      hasPaymentIssues: false,
      hasActiveDisputes: false,
      conflictCount: 0,
    };
  }
}

export const renewalEligibilityService = new RenewalEligibilityService();
