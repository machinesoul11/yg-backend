/**
 * Enhanced License Renewal Service
 * Comprehensive renewal workflow with eligibility checks, offer generation, and acceptance
 */

import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';
import { differenceInDays, addDays, startOfDay } from 'date-fns';
import { licenseConflictDetectionService } from './licenseConflictDetectionService';

const auditService = new AuditService(prisma);
const emailService = new EmailService();

export interface RenewalEligibility {
  eligible: boolean;
  reasons: string[];
  suggestedTerms?: RenewalTerms;
}

export interface RenewalTerms {
  durationDays: number;
  feeCents: number;
  revShareBps: number;
  startDate: Date;
  endDate: Date;
  adjustments: {
    feeAdjustmentPercent: number;
    revShareAdjustmentBps: number;
    loyaltyDiscount?: number;
    performanceBonus?: number;
  };
}

export interface RenewalOffer {
  id: string;
  licenseId: string;
  terms: RenewalTerms;
  expiresAt: Date;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
}

export class EnhancedLicenseRenewalService {
  /**
   * Check if a license is eligible for renewal
   */
  async checkRenewalEligibility(licenseId: string): Promise<RenewalEligibility> {
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
        parentLicense: true,
        renewals: true,
      },
    });

    if (!license) {
      return {
        eligible: false,
        reasons: ['License not found'],
      };
    }

    const reasons: string[] = [];
    const now = new Date();
    const daysUntilExpiry = differenceInDays(license.endDate, now);

    // Check status
    if (!['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'].includes(license.status)) {
      reasons.push(`License must be active or expiring (current: ${license.status})`);
    }

    // Check if already renewed
    if (license.renewals && license.renewals.length > 0) {
      const activeRenewals = license.renewals.filter((r) => ['ACTIVE', 'PENDING_APPROVAL'].includes(r.status));
      if (activeRenewals.length > 0) {
        reasons.push('License has already been renewed');
      }
    }

    // Check renewal window (90 days before expiry)
    if (daysUntilExpiry > 90) {
      reasons.push(`Too early for renewal (${daysUntilExpiry} days remaining, window opens at 90 days)`);
    }

    // Check IP asset still exists and available
    if (license.ipAsset.deletedAt) {
      reasons.push('IP asset has been deleted');
    }

    // Check ownership is still valid
    const activeOwnerships = license.ipAsset.ownerships.filter(
      (o) => !o.endDate || o.endDate > now
    );

    if (activeOwnerships.length === 0) {
      reasons.push('No active IP ownership found');
    }

    // Check brand account is in good standing
    // Would check for payment issues, disputes, etc.

    // Check for conflicts with future licenses
    const proposedStartDate = addDays(license.endDate, 1);
    const proposedEndDate = addDays(proposedStartDate, differenceInDays(license.endDate, license.startDate));

    const conflicts = await licenseConflictDetectionService.checkConflicts({
      ipAssetId: license.ipAssetId,
      startDate: proposedStartDate,
      endDate: proposedEndDate,
      licenseType: license.licenseType as any,
      scope: license.scopeJson as any,
      excludeLicenseId: licenseId,
    });

    if (conflicts.hasConflicts) {
      reasons.push(`Renewal would conflict with other licenses: ${conflicts.conflicts.map((c) => c.details).join('; ')}`);
    }

    const eligible = reasons.length === 0;

    // Generate suggested terms if eligible
    let suggestedTerms: RenewalTerms | undefined;
    if (eligible) {
      suggestedTerms = await this.generateRenewalTerms(license);
    }

    return {
      eligible,
      reasons,
      suggestedTerms,
    };
  }

  /**
   * Generate renewal terms with pricing adjustments
   */
  private async generateRenewalTerms(license: any): Promise<RenewalTerms> {
    const originalDuration = differenceInDays(license.endDate, license.startDate);

    // Calculate adjustments based on performance and market conditions
    const adjustments = await this.calculateRenewalAdjustments(license);

    const feeAdjustment = (license.feeCents * adjustments.feeAdjustmentPercent) / 100;
    const newFeeCents = Math.round(license.feeCents + feeAdjustment);

    const newRevShareBps = Math.max(
      0,
      Math.min(10000, license.revShareBps + adjustments.revShareAdjustmentBps)
    );

    const startDate = addDays(license.endDate, 1);
    const endDate = addDays(startDate, originalDuration);

    return {
      durationDays: originalDuration,
      feeCents: newFeeCents,
      revShareBps: newRevShareBps,
      startDate,
      endDate,
      adjustments,
    };
  }

  /**
   * Calculate pricing adjustments based on various factors
   */
  private async calculateRenewalAdjustments(license: any): Promise<{
    feeAdjustmentPercent: number;
    revShareAdjustmentBps: number;
    loyaltyDiscount?: number;
    performanceBonus?: number;
  }> {
    let feeAdjustmentPercent = 0;
    let revShareAdjustmentBps = 0;
    let loyaltyDiscount = 0;
    let performanceBonus = 0;

    // Base adjustment (inflation, market rates) - 5% increase by default
    feeAdjustmentPercent = 5;

    // Loyalty discount for long-term relationships
    const licenseHistory = await prisma.license.count({
      where: {
        brandId: license.brandId,
        ipAssetId: license.ipAssetId,
        status: { in: ['ACTIVE', 'EXPIRED'] },
      },
    });

    if (licenseHistory >= 3) {
      loyaltyDiscount = 10; // 10% discount for 3+ renewals
      feeAdjustmentPercent -= loyaltyDiscount;
    }

    // Performance bonus (if license generated significant value)
    // Would check analytics, revenue attribution, etc.

    // Check for early renewal bonus
    const daysUntilExpiry = differenceInDays(license.endDate, new Date());
    if (daysUntilExpiry > 60) {
      feeAdjustmentPercent -= 5; // 5% discount for early renewal
    }

    // Ensure fee doesn't decrease dramatically
    feeAdjustmentPercent = Math.max(feeAdjustmentPercent, -20); // Max 20% decrease

    return {
      feeAdjustmentPercent,
      revShareAdjustmentBps,
      loyaltyDiscount,
      performanceBonus,
    };
  }

  /**
   * Generate a formal renewal offer
   */
  async generateRenewalOffer(licenseId: string, userId: string): Promise<string> {
    // Check eligibility
    const eligibility = await this.checkRenewalEligibility(licenseId);

    if (!eligibility.eligible) {
      throw new Error(`License not eligible for renewal: ${eligibility.reasons.join('; ')}`);
    }

    if (!eligibility.suggestedTerms) {
      throw new Error('Could not generate renewal terms');
    }

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

    // Store renewal offer in metadata
    const offerId = `renewal-offer-${Date.now()}`;
    const offerExpiresAt = addDays(new Date(), 30); // 30 days to accept

    const renewalOffer: RenewalOffer = {
      id: offerId,
      licenseId,
      terms: eligibility.suggestedTerms,
      expiresAt: offerExpiresAt,
      status: 'PENDING',
    };

    // Update license metadata with offer
    await prisma.license.update({
      where: { id: licenseId },
      data: {
        metadata: {
          ...(license.metadata as any),
          renewalOffer,
        },
      },
    });

    // Send notifications to brand and creators
    await this.notifyRenewalOfferGenerated(license, renewalOffer);

    // Log audit event
    await auditService.log({
      action: 'renewal_offer_generated',
      entityType: 'license',
      entityId: licenseId,
      userId,
      after: renewalOffer,
    });

    return offerId;
  }

  /**
   * Accept a renewal offer and create renewal license
   */
  async acceptRenewalOffer(licenseId: string, offerId: string, userId: string): Promise<any> {
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

    const metadata = license.metadata as any;
    const renewalOffer = metadata?.renewalOffer as RenewalOffer;

    if (!renewalOffer || renewalOffer.id !== offerId) {
      throw new Error('Renewal offer not found');
    }

    if (renewalOffer.status !== 'PENDING') {
      throw new Error(`Renewal offer is ${renewalOffer.status.toLowerCase()}`);
    }

    if (new Date() > renewalOffer.expiresAt) {
      throw new Error('Renewal offer has expired');
    }

    // Validate user is brand owner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { brand: true },
    });

    if (!user?.brand || user.brand.id !== license.brandId) {
      throw new Error('Only the brand owner can accept renewal offers');
    }

    // Create renewal license
    const renewal = await prisma.license.create({
      data: {
        ipAssetId: license.ipAssetId,
        brandId: license.brandId,
        projectId: license.projectId,
        licenseType: license.licenseType,
        status: 'PENDING_APPROVAL', // Needs creator approval
        startDate: renewalOffer.terms.startDate,
        endDate: renewalOffer.terms.endDate,
        feeCents: renewalOffer.terms.feeCents,
        revShareBps: renewalOffer.terms.revShareBps,
        paymentTerms: license.paymentTerms,
        billingFrequency: license.billingFrequency,
        scopeJson: license.scopeJson,
        autoRenew: license.autoRenew,
        parentLicenseId: license.id,
        createdBy: userId,
        metadata: {
          renewalFrom: licenseId,
          renewalOfferId: offerId,
          renewalAdjustments: renewalOffer.terms.adjustments,
        },
      },
    });

    // Mark offer as accepted
    await prisma.license.update({
      where: { id: licenseId },
      data: {
        metadata: {
          ...metadata,
          renewalOffer: {
            ...renewalOffer,
            status: 'ACCEPTED',
          },
        },
      },
    });

    // Notify creators for approval
    await this.notifyRenewalCreated(license, renewal);

    // Log audit event
    await auditService.log({
      action: 'renewal_accepted',
      entityType: 'license',
      entityId: licenseId,
      userId,
      after: { renewalId: renewal.id },
    });

    return renewal;
  }

  /**
   * Automatically process renewals for licenses with auto_renew enabled
   */
  async processAutoRenewals(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    const autoRenewLicenses = await prisma.license.findMany({
      where: {
        autoRenew: true,
        status: 'ACTIVE',
        endDate: {
          lte: addDays(new Date(), 60), // Auto-renew at 60 days before expiry
          gte: new Date(),
        },
        deletedAt: null,
      },
      include: {
        renewals: true,
      },
    });

    for (const license of autoRenewLicenses) {
      // Skip if already has a renewal
      if (license.renewals.length > 0) {
        continue;
      }

      try {
        // Check eligibility
        const eligibility = await this.checkRenewalEligibility(license.id);

        if (!eligibility.eligible) {
          console.log(`License ${license.id} not eligible for auto-renewal: ${eligibility.reasons.join('; ')}`);
          failed++;
          continue;
        }

        // Generate and auto-accept renewal offer
        const offerId = await this.generateRenewalOffer(license.id, 'system');
        await this.acceptRenewalOffer(license.id, offerId, 'system');

        processed++;
      } catch (error) {
        console.error(`Failed to auto-renew license ${license.id}:`, error);
        failed++;
      }
    }

    return { processed, failed };
  }

  // Notification methods
  private async notifyRenewalOfferGenerated(license: any, offer: RenewalOffer): Promise<void> {
    // Send email to brand with renewal offer details
  }

  private async notifyRenewalCreated(originalLicense: any, renewalLicense: any): Promise<void> {
    // Send email to creators for approval
  }
}

export const enhancedLicenseRenewalService = new EnhancedLicenseRenewalService();
