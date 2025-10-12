/**
 * Fee Calculation Service
 * Sophisticated fee calculation logic for licenses
 */

import { prisma } from '@/lib/db';
import type { LicenseScope } from '../types';
import type { LicenseType, AssetType } from '@prisma/client';

/**
 * Fee calculation input
 */
export interface FeeCalculationInput {
  ipAssetId: string;
  licenseType: LicenseType;
  scope: LicenseScope;
  startDate: Date;
  endDate: Date;
  brandId?: string;
}

/**
 * Fee calculation breakdown
 */
export interface FeeCalculationBreakdown {
  baseFeeCents: number;
  scopeMultiplier: number;
  exclusivityPremiumCents: number;
  durationMultiplier: number;
  territoryMultiplier: number;
  marketAdjustmentCents: number;
  subtotalCents: number;
  platformFeeCents: number;
  totalFeeCents: number;
  creatorNetCents: number;
  breakdown: {
    label: string;
    amount: number;
    type: 'base' | 'multiplier' | 'adjustment' | 'fee';
  }[];
  minimumEnforced: boolean;
}

/**
 * Pricing configuration
 */
interface PricingConfig {
  baseRates: Record<string, number>;
  mediaMultipliers: Record<string, number>;
  placementMultipliers: Record<string, number>;
  exclusivityPremiums: Record<LicenseType, number>;
  territoryMultipliers: {
    global: number;
    regional: number;
    singleCountry: number;
  };
  platformCommissionRate: number;
  minimumFeeCents: number;
}

/**
 * Fee Calculation Service
 */
export class FeeCalculationService {
  private readonly config: PricingConfig = {
    // Base rates by asset type (in cents)
    baseRates: {
      PHOTO: 50000, // $500
      VIDEO: 100000, // $1000
      AUDIO: 75000, // $750
      DESIGN: 50000, // $500
      WRITTEN: 30000, // $300
      THREE_D: 75000, // $750
      OTHER: 50000, // $500
    },

    // Media type multipliers
    mediaMultipliers: {
      digital: 1.0,
      print: 1.2,
      broadcast: 2.0,
      ooh: 1.8, // Out-of-home
    },

    // Placement multipliers
    placementMultipliers: {
      social: 1.0,
      website: 1.1,
      email: 0.9,
      paid_ads: 1.5,
      packaging: 1.4,
    },

    // Exclusivity premiums (additional multiplier)
    exclusivityPremiums: {
      EXCLUSIVE: 3.0, // 3x multiplier for full exclusivity
      EXCLUSIVE_TERRITORY: 1.8, // 1.8x for territory exclusivity
      NON_EXCLUSIVE: 1.0, // No premium
    },

    // Territory multipliers
    territoryMultipliers: {
      global: 2.0,
      regional: 1.5, // 3+ countries
      singleCountry: 1.0,
    },

    // Platform commission (10%)
    platformCommissionRate: 0.1,

    // Minimum license fee
    minimumFeeCents: 10000, // $100
  };

  /**
   * Calculate license fee
   */
  async calculateFee(input: FeeCalculationInput): Promise<FeeCalculationBreakdown> {
    const breakdown: FeeCalculationBreakdown['breakdown'] = [];

    // Get asset details
    const asset = await prisma.ipAsset.findUnique({
      where: { id: input.ipAssetId },
      select: {
        type: true,
        title: true,
        metadata: true,
      },
    });

    if (!asset) {
      throw new Error('IP asset not found');
    }

    // 1. Calculate base fee
    const baseFeeCents = this.config.baseRates[asset.type] || this.config.baseRates.OTHER;
    breakdown.push({
      label: `Base fee (${asset.type})`,
      amount: baseFeeCents,
      type: 'base',
    });

    // 2. Apply scope multipliers
    const scopeMultiplier = this.calculateScopeMultiplier(input.scope);
    breakdown.push({
      label: 'Scope multiplier',
      amount: scopeMultiplier,
      type: 'multiplier',
    });

    // 3. Calculate exclusivity premium
    const exclusivityMultiplier = this.config.exclusivityPremiums[input.licenseType];
    breakdown.push({
      label: `Exclusivity (${input.licenseType})`,
      amount: exclusivityMultiplier,
      type: 'multiplier',
    });

    // 4. Apply duration multiplier
    const durationMultiplier = this.calculateDurationMultiplier(
      input.startDate,
      input.endDate
    );
    breakdown.push({
      label: 'Duration multiplier',
      amount: durationMultiplier,
      type: 'multiplier',
    });

    // 5. Apply territory multiplier
    const territoryMultiplier = this.calculateTerritoryMultiplier(input.scope);
    breakdown.push({
      label: 'Territory multiplier',
      amount: territoryMultiplier,
      type: 'multiplier',
    });

    // 6. Calculate subtotal
    let subtotalCents = Math.round(
      baseFeeCents *
        scopeMultiplier *
        exclusivityMultiplier *
        durationMultiplier *
        territoryMultiplier
    );

    // 7. Apply market adjustments (if brand history exists)
    let marketAdjustmentCents = 0;
    if (input.brandId) {
      marketAdjustmentCents = await this.calculateMarketAdjustment(
        input.brandId,
        subtotalCents
      );
      if (marketAdjustmentCents !== 0) {
        breakdown.push({
          label: marketAdjustmentCents > 0 ? 'Volume discount' : 'Premium rate',
          amount: marketAdjustmentCents,
          type: 'adjustment',
        });
      }
    }

    subtotalCents += marketAdjustmentCents;

    // 8. Enforce minimum fee
    let minimumEnforced = false;
    if (subtotalCents < this.config.minimumFeeCents) {
      minimumEnforced = true;
      subtotalCents = this.config.minimumFeeCents;
      breakdown.push({
        label: 'Minimum fee enforced',
        amount: this.config.minimumFeeCents,
        type: 'adjustment',
      });
    }

    // 9. Calculate platform fee
    const platformFeeCents = Math.round(
      subtotalCents * this.config.platformCommissionRate
    );
    breakdown.push({
      label: 'Platform fee (10%)',
      amount: platformFeeCents,
      type: 'fee',
    });

    // 10. Calculate creator net
    const creatorNetCents = subtotalCents - platformFeeCents;

    // 11. Get exclusivity premium amount for reporting
    const exclusivityPremiumCents =
      exclusivityMultiplier > 1.0
        ? Math.round(baseFeeCents * (exclusivityMultiplier - 1.0))
        : 0;

    return {
      baseFeeCents,
      scopeMultiplier,
      exclusivityPremiumCents,
      durationMultiplier,
      territoryMultiplier,
      marketAdjustmentCents,
      subtotalCents,
      platformFeeCents,
      totalFeeCents: subtotalCents,
      creatorNetCents,
      breakdown,
      minimumEnforced,
    };
  }

  /**
   * Calculate scope multiplier based on media and placement selections
   */
  private calculateScopeMultiplier(scope: LicenseScope): number {
    let multiplier = 0;

    // Media type contributions
    const mediaCount = Object.entries(scope.media).filter(([_, v]) => v).length;
    for (const [mediaType, isSelected] of Object.entries(scope.media)) {
      if (isSelected) {
        multiplier += this.config.mediaMultipliers[mediaType] || 1.0;
      }
    }

    // Average media multiplier
    const avgMediaMultiplier = mediaCount > 0 ? multiplier / mediaCount : 1.0;

    // Placement contributions
    let placementMultiplier = 0;
    const placementCount = Object.entries(scope.placement).filter(([_, v]) => v).length;
    for (const [placementType, isSelected] of Object.entries(scope.placement)) {
      if (isSelected) {
        placementMultiplier += this.config.placementMultipliers[placementType] || 1.0;
      }
    }

    // Average placement multiplier
    const avgPlacementMultiplier =
      placementCount > 0 ? placementMultiplier / placementCount : 1.0;

    // Combine media and placement (weighted average)
    const combinedMultiplier = avgMediaMultiplier * 0.6 + avgPlacementMultiplier * 0.4;

    // Breadth bonus: if using many media types and placements, apply bonus
    if (mediaCount >= 3 && placementCount >= 3) {
      return combinedMultiplier * 1.2; // 20% breadth bonus
    }

    return Math.max(combinedMultiplier, 0.5); // Minimum 0.5x multiplier
  }

  /**
   * Calculate duration multiplier
   */
  private calculateDurationMultiplier(startDate: Date, endDate: Date): number {
    const durationDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const durationMonths = durationDays / 30;

    // Pricing tiers by duration
    if (durationMonths <= 1) return 1.0; // 1 month: base rate
    if (durationMonths <= 3) return 1.8; // 3 months: 1.8x
    if (durationMonths <= 6) return 2.5; // 6 months: 2.5x
    if (durationMonths <= 12) return 4.0; // 1 year: 4x
    if (durationMonths <= 24) return 7.0; // 2 years: 7x
    if (durationMonths <= 36) return 9.5; // 3 years: 9.5x

    // Beyond 3 years: 9.5x + 0.5x per additional year
    const additionalYears = (durationMonths - 36) / 12;
    return 9.5 + additionalYears * 0.5;
  }

  /**
   * Calculate territory multiplier
   */
  private calculateTerritoryMultiplier(scope: LicenseScope): number {
    if (!scope.geographic || scope.geographic.territories.length === 0) {
      // No restrictions = global
      return this.config.territoryMultipliers.global;
    }

    const territories = scope.geographic.territories;

    if (territories.includes('GLOBAL')) {
      return this.config.territoryMultipliers.global;
    }

    if (territories.length >= 3) {
      return this.config.territoryMultipliers.regional;
    }

    return this.config.territoryMultipliers.singleCountry;
  }

  /**
   * Calculate market adjustment based on brand history
   */
  private async calculateMarketAdjustment(
    brandId: string,
    subtotalCents: number
  ): Promise<number> {
    try {
      // Get brand's total historical spending
      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: {
          totalSpent: true,
        },
      });

      if (!brand) return 0;

      const totalSpentCents = Number(brand.totalSpent) * 100;

      // Volume discounts based on total spend
      if (totalSpentCents >= 1000000) {
        // $10k+ spent: 10% discount
        return Math.round(subtotalCents * -0.1);
      } else if (totalSpentCents >= 500000) {
        // $5k+ spent: 5% discount
        return Math.round(subtotalCents * -0.05);
      } else if (totalSpentCents >= 250000) {
        // $2.5k+ spent: 3% discount
        return Math.round(subtotalCents * -0.03);
      }

      return 0;
    } catch (error) {
      console.error('Failed to calculate market adjustment:', error);
      return 0;
    }
  }

  /**
   * Calculate suggested revenue share based on fee
   */
  calculateSuggestedRevShare(feeCents: number): number {
    // Lower fixed fees suggest higher revenue share
    if (feeCents === 0) return 2000; // 20% if no fixed fee
    if (feeCents < 10000) return 1500; // 15% for low fixed fees
    if (feeCents < 50000) return 1000; // 10% for medium fixed fees
    if (feeCents < 100000) return 500; // 5% for high fixed fees

    // Very high fixed fees don't typically have revenue share
    return 0;
  }

  /**
   * Estimate total value for hybrid model (fixed + rev share)
   */
  estimateTotalValue(
    feeCents: number,
    revShareBps: number,
    estimatedRevenueCents: number
  ): {
    fixedFeeCents: number;
    estimatedRevShareCents: number;
    estimatedTotalCents: number;
  } {
    const estimatedRevShareCents = Math.round(
      (estimatedRevenueCents * revShareBps) / 10000
    );

    return {
      fixedFeeCents: feeCents,
      estimatedRevShareCents,
      estimatedTotalCents: feeCents + estimatedRevShareCents,
    };
  }

  /**
   * Get pricing configuration (for admin adjustments)
   */
  getConfig(): PricingConfig {
    return { ...this.config };
  }

  /**
   * Update pricing configuration (admin only)
   */
  updateConfig(updates: Partial<PricingConfig>): void {
    Object.assign(this.config, updates);
  }
}

export const feeCalculationService = new FeeCalculationService();
