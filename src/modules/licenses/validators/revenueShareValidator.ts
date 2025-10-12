/**
 * Revenue Share Validator
 * Validates revenue sharing arrangements for licenses
 */

import { prisma } from '@/lib/db';

/**
 * Revenue share validation result
 */
export interface RevenueShareValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Ownership share distribution
 */
export interface OwnershipShareDistribution {
  creatorId: string;
  creatorName: string;
  shareBps: number;
  expectedRevShareBps: number;
}

/**
 * Revenue Share Validator Service
 */
export class RevenueShareValidator {
  /**
   * Validate revenue share configuration
   */
  async validateRevenueShare(
    revShareBps: number,
    feeCents: number,
    ipAssetId: string,
    billingFrequency?: string | null
  ): Promise<RevenueShareValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basis points range
    const basisPointsValidation = this.validateBasisPoints(revShareBps);
    errors.push(...basisPointsValidation.errors);
    warnings.push(...basisPointsValidation.warnings);

    // Validate hybrid model (fixed fee + revenue share)
    const hybridValidation = this.validateHybridModel(revShareBps, feeCents);
    errors.push(...hybridValidation.errors);
    warnings.push(...hybridValidation.warnings);

    // Validate ownership correlation
    const ownershipValidation = await this.validateOwnershipCorrelation(
      ipAssetId,
      revShareBps
    );
    errors.push(...ownershipValidation.errors);
    warnings.push(...ownershipValidation.warnings);

    // Validate billing frequency compatibility
    if (revShareBps > 0 && billingFrequency) {
      const billingValidation = this.validateBillingFrequency(
        billingFrequency,
        revShareBps
      );
      errors.push(...billingValidation.errors);
      warnings.push(...billingValidation.warnings);
    }

    // Validate minimum guarantees
    const guaranteeValidation = this.validateMinimumGuarantee(revShareBps, feeCents);
    warnings.push(...guaranteeValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate basis points are in valid range
   */
  private validateBasisPoints(revShareBps: number): RevenueShareValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check range
    if (revShareBps < 0) {
      errors.push('Revenue share cannot be negative');
    }

    if (revShareBps > 10000) {
      errors.push('Revenue share cannot exceed 10000 basis points (100%)');
    }

    // Check for common input errors (percentages entered as if they were basis points)
    if (revShareBps > 100 && revShareBps <= 10000) {
      // This is valid, but check if it might be a mistake
      const asPercent = revShareBps / 100;
      if (asPercent % 1 === 0 && asPercent <= 100) {
        warnings.push(
          `Revenue share is ${asPercent}%. Ensure this is correct (${revShareBps} basis points)`
        );
      }
    }

    // Warn about very high revenue shares
    if (revShareBps >= 5000) {
      warnings.push(
        `Revenue share is ${revShareBps / 100}%, which is exceptionally high. Ensure this is intentional.`
      );
    }

    // Warn about zero revenue share with zero fee
    if (revShareBps === 0) {
      warnings.push(
        'Revenue share is 0%. If this is a revenue-only deal, ensure a fixed fee is set.'
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate hybrid licensing model (fixed fee + revenue share)
   */
  private validateHybridModel(
    revShareBps: number,
    feeCents: number
  ): RevenueShareValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Both zero
    if (revShareBps === 0 && feeCents === 0) {
      errors.push(
        'License must have either a fixed fee, revenue share, or both. Current configuration has neither.'
      );
    }

    // Hybrid model
    if (revShareBps > 0 && feeCents > 0) {
      warnings.push(
        `Hybrid licensing model detected: $${(feeCents / 100).toFixed(2)} fixed fee + ${(revShareBps / 100).toFixed(2)}% revenue share. Ensure terms clearly define how both components work together.`
      );

      // Check if fixed fee is substantial
      if (feeCents >= 100000) {
        // $1000+
        warnings.push(
          'High fixed fee combined with revenue share may be excessive. Consider if this arrangement is fair and competitive.'
        );
      }
    }

    // Revenue share only
    if (revShareBps > 0 && feeCents === 0) {
      warnings.push(
        'Revenue share only model. Ensure tracking and reporting requirements are clearly defined in license terms.'
      );
    }

    // Fixed fee only
    if (feeCents > 0 && revShareBps === 0) {
      // This is fine, just informational
      if (feeCents < 10000) {
        // Less than $100
        warnings.push(
          'Low fixed fee with no revenue share. Consider if this adequately compensates the creator.'
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate revenue share correlates with IP ownership structure
   */
  private async validateOwnershipCorrelation(
    ipAssetId: string,
    revShareBps: number
  ): Promise<RevenueShareValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get ownership structure
      const ownerships = await prisma.ipOwnership.findMany({
        where: {
          ipAssetId,
        },
        include: {
          creator: {
            select: {
              id: true,
              stageName: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (ownerships.length === 0) {
        errors.push('No ownership records found for this IP asset. Cannot create license.');
        return { valid: false, errors, warnings };
      }

      // Calculate total ownership
      const totalOwnershipBps = ownerships.reduce(
        (sum, o) => sum + o.shareBps,
        0
      );

      if (totalOwnershipBps !== 10000) {
        errors.push(
          `Ownership shares do not sum to 100% (currently ${totalOwnershipBps / 100}%). Ownership structure must be corrected before licensing.`
        );
      }

      // Multiple owners require clear distribution
      if (ownerships.length > 1 && revShareBps > 0) {
        warnings.push(
          `Multiple owners (${ownerships.length}) detected. Revenue share payments will be distributed according to ownership percentages: ${ownerships
            .map(
              (o) =>
                `${o.creator.stageName || o.creator.user.name} (${(o.shareBps / 100).toFixed(2)}%)`
            )
            .join(', ')}`
        );
      }

      // Calculate distribution
      if (revShareBps > 0) {
        const distribution = this.calculateRevenueDistribution(
          ownerships as any,
          revShareBps
        );
        
        // Verify distribution sums correctly
        const totalDistributed = distribution.reduce(
          (sum, d) => sum + d.expectedRevShareBps,
          0
        );
        
        if (Math.abs(totalDistributed - revShareBps) > 1) {
          // Allow 1 basis point rounding error
          warnings.push(
            'Revenue distribution calculation has rounding discrepancies. Review distribution carefully.'
          );
        }
      }
    } catch (error) {
      errors.push('Failed to validate ownership correlation: ' + (error as Error).message);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Calculate how revenue share will be distributed among owners
   */
  private calculateRevenueDistribution(
    ownerships: Array<{
      creatorId: string;
      shareBps: number;
      creator: {
        id: string;
        stageName: string;
        user: { name: string | null };
      };
    }>,
    totalRevShareBps: number
  ): OwnershipShareDistribution[] {
    return ownerships.map((ownership) => {
      const expectedRevShareBps = Math.round(
        (totalRevShareBps * ownership.shareBps) / 10000
      );

      return {
        creatorId: ownership.creatorId,
        creatorName:
          ownership.creator.stageName || ownership.creator.user.name || 'Unknown',
        shareBps: ownership.shareBps,
        expectedRevShareBps,
      };
    });
  }

  /**
   * Validate billing frequency for revenue share
   */
  private validateBillingFrequency(
    billingFrequency: string,
    revShareBps: number
  ): RevenueShareValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (revShareBps > 0) {
      if (billingFrequency === 'ONE_TIME') {
        warnings.push(
          'One-time billing with revenue share is unusual. Ensure license terms specify how revenue will be calculated and paid.'
        );
      }

      if (!['MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'].includes(billingFrequency)) {
        errors.push(`Invalid billing frequency: ${billingFrequency}`);
      }

      // Recommend appropriate frequencies
      if (billingFrequency === 'ANNUALLY' && revShareBps > 2000) {
        warnings.push(
          'Annual billing with high revenue share (>20%) may cause cash flow issues for creators. Consider more frequent billing.'
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate minimum guarantee (if using revenue share)
   */
  private validateMinimumGuarantee(
    revShareBps: number,
    feeCents: number
  ): RevenueShareValidationResult {
    const warnings: string[] = [];

    // If revenue share only with no fixed fee minimum
    if (revShareBps > 0 && feeCents === 0) {
      warnings.push(
        'Revenue share with no minimum guarantee (fixed fee). Creator compensation depends entirely on brand performance. Consider adding a minimum guarantee.'
      );
    }

    // If there's both, the fixed fee acts as a minimum guarantee
    if (revShareBps > 0 && feeCents > 0) {
      const minGuarantee = feeCents / 100;
      warnings.push(
        `Fixed fee of $${minGuarantee.toFixed(2)} acts as minimum guarantee regardless of revenue share performance.`
      );
    }

    return { valid: true, errors: [], warnings };
  }

  /**
   * Calculate expected revenue share payment for a given revenue amount
   */
  calculateRevSharePayment(
    revShareBps: number,
    revenueCents: number
  ): {
    totalPaymentCents: number;
    platformCommissionCents: number;
    creatorPaymentCents: number;
  } {
    // Calculate gross revenue share
    const grossRevShareCents = Math.round((revenueCents * revShareBps) / 10000);

    // Platform commission (assuming 10% platform fee - should be configurable)
    const platformCommissionRate = 0.1;
    const platformCommissionCents = Math.round(
      grossRevShareCents * platformCommissionRate
    );

    // Net to creator
    const creatorPaymentCents = grossRevShareCents - platformCommissionCents;

    return {
      totalPaymentCents: grossRevShareCents,
      platformCommissionCents,
      creatorPaymentCents,
    };
  }

  /**
   * Validate revenue share cap (if specified)
   */
  validateRevShareCap(
    revShareBps: number,
    capCents?: number
  ): RevenueShareValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (capCents !== undefined) {
      if (capCents <= 0) {
        errors.push('Revenue share cap must be positive');
      }

      if (capCents < 100000) {
        // Less than $1000
        warnings.push(
          'Revenue share cap is very low. This may not be attractive to creators.'
        );
      }

      warnings.push(
        `Revenue share is capped at $${(capCents / 100).toFixed(2)}. Ensure this cap is clearly communicated in license terms.`
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

export const revenueShareValidator = new RevenueShareValidator();
