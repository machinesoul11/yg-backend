/**
 * Renewal Pricing Calculator Service
 * Sophisticated pricing engine for license renewals with multiple strategies
 */

import { prisma } from '@/lib/db';
import { differenceInDays, subMonths } from 'date-fns';
import type { LicenseType } from '@prisma/client';

export type PricingStrategy =
  | 'FLAT_RENEWAL' // Same price as original
  | 'USAGE_BASED' // Adjust based on tracked usage
  | 'MARKET_RATE' // Align to current market rates
  | 'PERFORMANCE_BASED' // Adjust based on ROI/performance
  | 'NEGOTIATED' // Custom negotiated pricing
  | 'AUTOMATIC'; // Let system decide best strategy

export interface RenewalPricingInput {
  licenseId: string;
  strategy?: PricingStrategy;
  customAdjustmentPercent?: number; // For NEGOTIATED strategy
  forceMinimum?: boolean;
}

export interface PricingAdjustment {
  type: string;
  label: string;
  amountCents: number;
  percentChange: number;
  reason: string;
}

export interface RenewalPricingBreakdown {
  originalFeeCents: number;
  baseRenewalFeeCents: number;
  adjustments: PricingAdjustment[];
  subtotalCents: number;
  finalFeeCents: number;
  finalRevShareBps: number;
  strategy: PricingStrategy;
  confidenceScore: number; // 0-100, how confident is the pricing
  metadata: {
    loyaltyDiscountApplied: boolean;
    performanceBonusApplied: boolean;
    marketAdjustmentApplied: boolean;
    earlyRenewalDiscountApplied: boolean;
    capApplied: boolean;
    minimumEnforced: boolean;
    historicalRenewalCount: number;
    brandRelationshipMonths: number;
    expectedCreatorRevenueCents: number;
  };
  comparison: {
    percentChange: number;
    absoluteChangeCents: number;
    projectedAnnualValue: number;
  };
  reasoning: string[];
}

export interface PricingConfiguration {
  baseInflationRate: number; // Default annual inflation adjustment (e.g., 0.05 for 5%)
  loyaltyDiscountThresholds: {
    renewalCount: number;
    discountPercent: number;
  }[];
  earlyRenewalDiscount: {
    daysThreshold: number;
    discountPercent: number;
  };
  performanceMultipliers: {
    high: number; // e.g., 1.2 for 20% increase
    medium: number; // e.g., 1.0 for no change
    low: number; // e.g., 0.9 for 10% decrease
  };
  capRules: {
    maxIncreasePercent: number;
    maxDecreasePercent: number;
  };
  minimumFeeCents: number;
}

export class RenewalPricingService {
  private defaultConfig: PricingConfiguration = {
    baseInflationRate: 0.05, // 5% annual inflation
    loyaltyDiscountThresholds: [
      { renewalCount: 1, discountPercent: 0 },
      { renewalCount: 2, discountPercent: 5 },
      { renewalCount: 3, discountPercent: 10 },
      { renewalCount: 5, discountPercent: 15 },
    ],
    earlyRenewalDiscount: {
      daysThreshold: 60,
      discountPercent: 5,
    },
    performanceMultipliers: {
      high: 1.15,
      medium: 1.0,
      low: 0.95,
    },
    capRules: {
      maxIncreasePercent: 25,
      maxDecreasePercent: 20,
    },
    minimumFeeCents: 10000, // $100
  };

  /**
   * Calculate renewal pricing with detailed breakdown
   */
  async calculateRenewalPricing(
    input: RenewalPricingInput
  ): Promise<RenewalPricingBreakdown> {
    const license = await prisma.license.findUnique({
      where: { id: input.licenseId },
      include: {
        brand: {
          include: {
            licenses: {
              where: {
                status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] as any },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        ipAsset: {
          include: {
            ownerships: true,
            licenses: {
              where: {
                brandId: undefined, // Will be set below
              },
            },
          },
        },
        dailyMetrics: {
          where: {
            date: {
              gte: subMonths(new Date(), 3), // Last 3 months of data
            },
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Get historical data for this brand-asset relationship
    const historicalLicenses = await prisma.license.findMany({
      where: {
        ipAssetId: license.ipAssetId,
        brandId: license.brandId,
        status: { in: ['ACTIVE', 'EXPIRED', 'RENEWED'] as any },
      },
      orderBy: { createdAt: 'asc' },
    });

    const originalFeeCents = license.feeCents;
    const strategy = input.strategy || 'AUTOMATIC';
    const adjustments: PricingAdjustment[] = [];
    const reasoning: string[] = [];

    // Start with base renewal fee (same as original)
    let baseRenewalFeeCents = originalFeeCents;
    let finalRevShareBps = license.revShareBps;

    // Apply strategy-specific calculations
    switch (strategy) {
      case 'FLAT_RENEWAL':
        reasoning.push('Using flat renewal strategy - maintaining original pricing');
        break;

      case 'USAGE_BASED':
        const usageAdjustment = await this.calculateUsageBasedAdjustment(
          license,
          originalFeeCents
        );
        if (usageAdjustment) {
          adjustments.push(usageAdjustment);
          baseRenewalFeeCents += usageAdjustment.amountCents;
          reasoning.push(usageAdjustment.reason);
        }
        break;

      case 'MARKET_RATE':
        const marketAdjustment = await this.calculateMarketRateAdjustment(
          license,
          originalFeeCents
        );
        if (marketAdjustment) {
          adjustments.push(marketAdjustment);
          baseRenewalFeeCents += marketAdjustment.amountCents;
          reasoning.push(marketAdjustment.reason);
        }
        break;

      case 'PERFORMANCE_BASED':
        const performanceAdjustment = await this.calculatePerformanceAdjustment(
          license,
          originalFeeCents
        );
        if (performanceAdjustment) {
          adjustments.push(performanceAdjustment);
          baseRenewalFeeCents += performanceAdjustment.amountCents;
          reasoning.push(performanceAdjustment.reason);
        }
        break;

      case 'NEGOTIATED':
        if (input.customAdjustmentPercent !== undefined) {
          const negotiatedAmount = Math.round(
            originalFeeCents * (input.customAdjustmentPercent / 100)
          );
          adjustments.push({
            type: 'NEGOTIATED',
            label: 'Negotiated Adjustment',
            amountCents: negotiatedAmount,
            percentChange: input.customAdjustmentPercent,
            reason: `Custom negotiated pricing with ${input.customAdjustmentPercent}% adjustment`,
          });
          baseRenewalFeeCents += negotiatedAmount;
          reasoning.push('Using negotiated custom pricing');
        }
        break;

      case 'AUTOMATIC':
      default:
        // Automatic strategy: apply base inflation
        const inflationAdjustment = this.calculateInflationAdjustment(originalFeeCents);
        adjustments.push(inflationAdjustment);
        baseRenewalFeeCents += inflationAdjustment.amountCents;
        reasoning.push(inflationAdjustment.reason);
        break;
    }

    // Apply universal modifiers regardless of strategy
    const metadata = {
      loyaltyDiscountApplied: false,
      performanceBonusApplied: false,
      marketAdjustmentApplied: false,
      earlyRenewalDiscountApplied: false,
      capApplied: false,
      minimumEnforced: false,
      historicalRenewalCount: historicalLicenses.filter((l) => l.parentLicenseId).length,
      brandRelationshipMonths: Math.floor(
        differenceInDays(new Date(), historicalLicenses[0]?.createdAt || new Date()) / 30
      ),
      expectedCreatorRevenueCents: 0,
    };

    // 1. Loyalty discount
    const loyaltyDiscount = this.calculateLoyaltyDiscount(
      historicalLicenses,
      baseRenewalFeeCents
    );
    if (loyaltyDiscount) {
      adjustments.push(loyaltyDiscount);
      baseRenewalFeeCents += loyaltyDiscount.amountCents; // Note: amountCents is negative
      metadata.loyaltyDiscountApplied = true;
      reasoning.push(loyaltyDiscount.reason);
    }

    // 2. Early renewal discount
    const daysUntilExpiry = differenceInDays(license.endDate, new Date());
    if (daysUntilExpiry > this.defaultConfig.earlyRenewalDiscount.daysThreshold) {
      const earlyDiscountAmount = Math.round(
        baseRenewalFeeCents * -(this.defaultConfig.earlyRenewalDiscount.discountPercent / 100)
      );
      adjustments.push({
        type: 'EARLY_RENEWAL',
        label: 'Early Renewal Discount',
        amountCents: earlyDiscountAmount,
        percentChange: -this.defaultConfig.earlyRenewalDiscount.discountPercent,
        reason: `${this.defaultConfig.earlyRenewalDiscount.discountPercent}% discount for renewing ${daysUntilExpiry} days early`,
      });
      baseRenewalFeeCents += earlyDiscountAmount;
      metadata.earlyRenewalDiscountApplied = true;
      reasoning.push('Early renewal discount applied');
    }

    // 3. Apply caps
    const percentChange = ((baseRenewalFeeCents - originalFeeCents) / originalFeeCents) * 100;
    let finalFeeCents = baseRenewalFeeCents;

    if (percentChange > this.defaultConfig.capRules.maxIncreasePercent) {
      finalFeeCents = Math.round(
        originalFeeCents * (1 + this.defaultConfig.capRules.maxIncreasePercent / 100)
      );
      metadata.capApplied = true;
      reasoning.push(
        `Price increase capped at ${this.defaultConfig.capRules.maxIncreasePercent}%`
      );
    } else if (percentChange < -this.defaultConfig.capRules.maxDecreasePercent) {
      finalFeeCents = Math.round(
        originalFeeCents * (1 - this.defaultConfig.capRules.maxDecreasePercent / 100)
      );
      metadata.capApplied = true;
      reasoning.push(
        `Price decrease capped at ${this.defaultConfig.capRules.maxDecreasePercent}%`
      );
    }

    // 4. Enforce minimum
    if (input.forceMinimum !== false && finalFeeCents < this.defaultConfig.minimumFeeCents) {
      finalFeeCents = this.defaultConfig.minimumFeeCents;
      metadata.minimumEnforced = true;
      reasoning.push(
        `Minimum fee of $${this.defaultConfig.minimumFeeCents / 100} enforced`
      );
    }

    // Calculate expected creator revenue
    const platformFeeCents = Math.round(finalFeeCents * 0.1); // 10% platform fee
    const creatorNetCents = finalFeeCents - platformFeeCents;
    metadata.expectedCreatorRevenueCents = creatorNetCents;

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(
      strategy,
      license,
      historicalLicenses,
      adjustments
    );

    // Calculate comparison metrics
    const finalPercentChange = ((finalFeeCents - originalFeeCents) / originalFeeCents) * 100;
    const licenseDurationDays = differenceInDays(license.endDate, license.startDate);
    const projectedAnnualValue = Math.round((finalFeeCents * 365) / licenseDurationDays);

    return {
      originalFeeCents,
      baseRenewalFeeCents,
      adjustments,
      subtotalCents: baseRenewalFeeCents,
      finalFeeCents,
      finalRevShareBps,
      strategy,
      confidenceScore,
      metadata,
      comparison: {
        percentChange: Math.round(finalPercentChange * 100) / 100,
        absoluteChangeCents: finalFeeCents - originalFeeCents,
        projectedAnnualValue,
      },
      reasoning,
    };
  }

  /**
   * Calculate usage-based adjustment
   */
  private async calculateUsageBasedAdjustment(
    license: any,
    baseFeeCents: number
  ): Promise<PricingAdjustment | null> {
    if (!license.dailyMetrics || license.dailyMetrics.length === 0) {
      return null;
    }

    // Calculate usage metrics
    const totalViews = license.dailyMetrics.reduce((sum: number, m: any) => sum + m.views, 0);
    const totalClicks = license.dailyMetrics.reduce((sum: number, m: any) => sum + m.clicks, 0);
    const totalConversions = license.dailyMetrics.reduce(
      (sum: number, m: any) => sum + m.conversions,
      0
    );

    // Determine usage level (this is simplified - would be more sophisticated in production)
    let adjustmentPercent = 0;
    let usageLevel = 'medium';

    if (totalViews > 1000000) {
      adjustmentPercent = 10;
      usageLevel = 'high';
    } else if (totalViews < 100000) {
      adjustmentPercent = -5;
      usageLevel = 'low';
    }

    if (adjustmentPercent === 0) {
      return null;
    }

    const adjustmentAmount = Math.round(baseFeeCents * (adjustmentPercent / 100));

    return {
      type: 'USAGE_BASED',
      label: 'Usage-Based Adjustment',
      amountCents: adjustmentAmount,
      percentChange: adjustmentPercent,
      reason: `${adjustmentPercent > 0 ? 'Increased' : 'Decreased'} pricing based on ${usageLevel} usage (${totalViews.toLocaleString()} views)`,
    };
  }

  /**
   * Calculate market rate adjustment
   */
  private async calculateMarketRateAdjustment(
    license: any,
    baseFeeCents: number
  ): Promise<PricingAdjustment | null> {
    // Query similar recent licenses for market comparison
    const marketComparables = await prisma.license.findMany({
      where: {
        ipAssetId: license.ipAssetId,
        status: { in: ['ACTIVE', 'RENEWED'] as any },
        createdAt: {
          gte: subMonths(new Date(), 6), // Last 6 months
        },
        id: { not: license.id },
      },
      select: {
        feeCents: true,
        licenseType: true,
      },
    });

    if (marketComparables.length === 0) {
      return null;
    }

    // Calculate average market rate
    const avgMarketRate =
      marketComparables.reduce((sum, l) => sum + l.feeCents, 0) / marketComparables.length;

    const marketDifference = avgMarketRate - baseFeeCents;
    const adjustmentPercent = (marketDifference / baseFeeCents) * 100;

    // Only adjust if market difference is significant (> 10%)
    if (Math.abs(adjustmentPercent) < 10) {
      return null;
    }

    // Cap market adjustment at 15%
    const cappedAdjustmentPercent = Math.max(
      -15,
      Math.min(15, adjustmentPercent)
    );
    const adjustmentAmount = Math.round(baseFeeCents * (cappedAdjustmentPercent / 100));

    return {
      type: 'MARKET_RATE',
      label: 'Market Rate Alignment',
      amountCents: adjustmentAmount,
      percentChange: cappedAdjustmentPercent,
      reason: `Adjusted to align with current market rates (${marketComparables.length} comparable licenses)`,
    };
  }

  /**
   * Calculate performance-based adjustment
   */
  private async calculatePerformanceAdjustment(
    license: any,
    baseFeeCents: number
  ): Promise<PricingAdjustment | null> {
    if (!license.dailyMetrics || license.dailyMetrics.length === 0) {
      return null;
    }

    // Calculate total revenue generated
    const totalRevenueCents = license.dailyMetrics.reduce(
      (sum: number, m: any) => sum + m.revenueCents,
      0
    );

    // Calculate ROI
    const roi = totalRevenueCents / baseFeeCents;

    let performanceLevel: keyof PricingConfiguration['performanceMultipliers'] = 'medium';
    if (roi > 5) {
      performanceLevel = 'high';
    } else if (roi < 2) {
      performanceLevel = 'low';
    }

    const multiplier = this.defaultConfig.performanceMultipliers[performanceLevel];
    const adjustmentPercent = (multiplier - 1) * 100;

    if (adjustmentPercent === 0) {
      return null;
    }

    const adjustmentAmount = Math.round(baseFeeCents * (adjustmentPercent / 100));

    return {
      type: 'PERFORMANCE',
      label: 'Performance-Based Adjustment',
      amountCents: adjustmentAmount,
      percentChange: adjustmentPercent,
      reason: `${adjustmentPercent > 0 ? 'Premium' : 'Discount'} based on ${performanceLevel} ROI performance (${roi.toFixed(1)}x return)`,
    };
  }

  /**
   * Calculate base inflation adjustment
   */
  private calculateInflationAdjustment(baseFeeCents: number): PricingAdjustment {
    const adjustmentAmount = Math.round(baseFeeCents * this.defaultConfig.baseInflationRate);

    return {
      type: 'INFLATION',
      label: 'Base Rate Adjustment',
      amountCents: adjustmentAmount,
      percentChange: this.defaultConfig.baseInflationRate * 100,
      reason: `Standard ${this.defaultConfig.baseInflationRate * 100}% annual rate adjustment`,
    };
  }

  /**
   * Calculate loyalty discount
   */
  private calculateLoyaltyDiscount(
    historicalLicenses: any[],
    baseFeeCents: number
  ): PricingAdjustment | null {
    const renewalCount = historicalLicenses.filter((l) => l.parentLicenseId).length;

    // Find applicable loyalty tier
    const applicableTier = [...this.defaultConfig.loyaltyDiscountThresholds]
      .reverse()
      .find((tier) => renewalCount >= tier.renewalCount);

    if (!applicableTier || applicableTier.discountPercent === 0) {
      return null;
    }

    const discountAmount = Math.round(baseFeeCents * -(applicableTier.discountPercent / 100));

    return {
      type: 'LOYALTY',
      label: 'Loyalty Discount',
      amountCents: discountAmount,
      percentChange: -applicableTier.discountPercent,
      reason: `${applicableTier.discountPercent}% loyalty discount for ${renewalCount} previous renewal${renewalCount > 1 ? 's' : ''}`,
    };
  }

  /**
   * Calculate confidence score for pricing recommendation
   */
  private calculateConfidenceScore(
    strategy: PricingStrategy,
    license: any,
    historicalLicenses: any[],
    adjustments: PricingAdjustment[]
  ): number {
    let score = 50; // Start at medium confidence

    // Strategy-based confidence
    if (strategy === 'FLAT_RENEWAL') score += 30;
    if (strategy === 'NEGOTIATED') score += 40;

    // Historical data confidence
    if (historicalLicenses.length > 3) score += 10;
    if (historicalLicenses.length > 5) score += 10;

    // Usage data confidence
    if (license.dailyMetrics && license.dailyMetrics.length > 60) score += 15;
    if (license.dailyMetrics && license.dailyMetrics.length > 90) score += 10;

    // Multiple data points increase confidence
    if (adjustments.length > 2) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get pricing configuration (for customization)
   */
  getConfiguration(): PricingConfiguration {
    return { ...this.defaultConfig };
  }

  /**
   * Update pricing configuration
   */
  updateConfiguration(updates: Partial<PricingConfiguration>): void {
    this.defaultConfig = {
      ...this.defaultConfig,
      ...updates,
    };
  }
}

export const renewalPricingService = new RenewalPricingService();
