/**
 * Payment Threshold Service
 * Service for tracking creator payment thresholds for tax reporting
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  PaymentThresholdData,
  CreatePaymentThresholdInput,
  UpdatePaymentThresholdInput,
  ThresholdStatus,
} from '../types';

export class PaymentThresholdService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  // US tax thresholds (configurable)
  private readonly TAX_THRESHOLDS = {
    US: {
      FORM_1099_NEC: 60000, // $600 in cents
      FORM_1099_MISC: 60000, // $600 in cents
    },
    // Add other jurisdictions as needed
  };

  /**
   * Create or update payment threshold for a creator
   */
  async createOrUpdateThreshold(input: CreatePaymentThresholdInput): Promise<PaymentThresholdData> {
    const thresholdAmountCents = input.thresholdAmountCents || 
      this.getDefaultThreshold(input.jurisdiction || 'US');

    const threshold = await this.prisma.paymentThreshold.upsert({
      where: {
        creatorId_taxYear_jurisdiction: {
          creatorId: input.creatorId,
          taxYear: input.taxYear,
          jurisdiction: input.jurisdiction || 'US',
        },
      },
      update: {
        thresholdAmountCents,
        lastUpdated: new Date(),
      },
      create: {
        creatorId: input.creatorId,
        taxYear: input.taxYear,
        jurisdiction: input.jurisdiction || 'US',
        thresholdAmountCents,
        totalPaymentsCents: 0,
        thresholdMet: false,
        lastUpdated: new Date(),
        metadata: {},
      },
    });

    return this.mapToPaymentThresholdData(threshold);
  }

  /**
   * Update payment amounts and check threshold status
   */
  async updatePaymentAmount(
    creatorId: string,
    taxYear: number,
    additionalAmountCents: number,
    jurisdiction: string = 'US'
  ): Promise<PaymentThresholdData> {
    const threshold = await this.prisma.paymentThreshold.findUnique({
      where: {
        creatorId_taxYear_jurisdiction: {
          creatorId,
          taxYear,
          jurisdiction,
        },
      },
    });

    if (!threshold) {
      // Create threshold if it doesn't exist
      await this.createOrUpdateThreshold({
        creatorId,
        taxYear,
        jurisdiction,
        thresholdAmountCents: this.getDefaultThreshold(jurisdiction),
      });
      
      return this.updatePaymentAmount(creatorId, taxYear, additionalAmountCents, jurisdiction);
    }

    const newTotalPaymentsCents = threshold.totalPaymentsCents + additionalAmountCents;
    const thresholdMet = newTotalPaymentsCents >= threshold.thresholdAmountCents;
    const wasAlreadyMet = threshold.thresholdMet;

    const updatedThreshold = await this.prisma.paymentThreshold.update({
      where: { id: threshold.id },
      data: {
        totalPaymentsCents: newTotalPaymentsCents,
        thresholdMet,
        thresholdMetAt: thresholdMet && !wasAlreadyMet ? new Date() : threshold.thresholdMetAt,
        lastUpdated: new Date(),
      },
    });

    // If threshold was just met, trigger notification
    if (thresholdMet && !wasAlreadyMet) {
      await this.handleThresholdMet(creatorId, taxYear, jurisdiction, newTotalPaymentsCents);
    }

    return this.mapToPaymentThresholdData(updatedThreshold);
  }

  /**
   * Get threshold status for a creator
   */
  async getThresholdStatus(
    creatorId: string,
    taxYear: number,
    jurisdiction: string = 'US'
  ): Promise<ThresholdStatus> {
    let threshold = await this.prisma.paymentThreshold.findUnique({
      where: {
        creatorId_taxYear_jurisdiction: {
          creatorId,
          taxYear,
          jurisdiction,
        },
      },
    });

    // Create threshold if it doesn't exist
    if (!threshold) {
      const thresholdData = await this.createOrUpdateThreshold({
        creatorId,
        taxYear,
        jurisdiction,
        thresholdAmountCents: this.getDefaultThreshold(jurisdiction),
      });
      threshold = {
        ...thresholdData,
        id: thresholdData.id,
        createdAt: thresholdData.lastUpdated,
        updatedAt: thresholdData.lastUpdated,
      };
    }

    const currentYear = new Date().getFullYear();
    const yearEnd = new Date(taxYear, 11, 31);
    const now = new Date();
    const daysUntilYearEnd = taxYear === currentYear 
      ? Math.max(0, Math.ceil((yearEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const remainingCents = Math.max(0, threshold.thresholdAmountCents - threshold.totalPaymentsCents);
    const percentageReached = threshold.thresholdAmountCents > 0 
      ? (threshold.totalPaymentsCents / threshold.thresholdAmountCents) * 100 
      : 0;

    // Simple projection based on current rate
    let projectedTotal: number | undefined;
    if (taxYear === currentYear && daysUntilYearEnd > 0) {
      const daysPassed = Math.ceil((now.getTime() - new Date(taxYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
      if (daysPassed > 0) {
        const dailyAverage = threshold.totalPaymentsCents / daysPassed;
        projectedTotal = threshold.totalPaymentsCents + (dailyAverage * daysUntilYearEnd);
      }
    }

    return {
      creatorId,
      taxYear,
      jurisdiction,
      currentAmountCents: threshold.totalPaymentsCents,
      thresholdAmountCents: threshold.thresholdAmountCents,
      remainingCents,
      percentageReached,
      thresholdMet: threshold.thresholdMet,
      daysUntilYearEnd,
      projectedTotal,
    };
  }

  /**
   * Get all thresholds with filtering
   */
  async getPaymentThresholds(filters: {
    creatorId?: string;
    taxYear?: number;
    jurisdiction?: string;
    thresholdMet?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ thresholds: PaymentThresholdData[]; total: number }> {
    const where: any = {};

    if (filters.creatorId) where.creatorId = filters.creatorId;
    if (filters.taxYear) where.taxYear = filters.taxYear;
    if (filters.jurisdiction) where.jurisdiction = filters.jurisdiction;
    if (filters.thresholdMet !== undefined) where.thresholdMet = filters.thresholdMet;

    const [thresholds, total] = await Promise.all([
      this.prisma.paymentThreshold.findMany({
        where,
        orderBy: { lastUpdated: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.paymentThreshold.count({ where }),
    ]);

    return {
      thresholds: thresholds.map(this.mapToPaymentThresholdData),
      total,
    };
  }

  /**
   * Check all creators for threshold crossings in a given year
   */
  async checkAllThresholds(taxYear: number): Promise<{
    checked: number;
    newlyMet: number;
    errors: Array<{ creatorId: string; error: string }>;
  }> {
    // Get all creators with payments in the tax year
    const creatorsWithPayments = await this.prisma.royaltyStatement.groupBy({
      by: ['creatorId'],
      where: {
        paidAt: {
          gte: new Date(taxYear, 0, 1),
          lte: new Date(taxYear, 11, 31, 23, 59, 59),
        },
        status: 'PAID',
      },
      _sum: {
        totalEarningsCents: true,
      },
    });

    let checked = 0;
    let newlyMet = 0;
    const errors: Array<{ creatorId: string; error: string }> = [];

    for (const creatorData of creatorsWithPayments) {
      try {
        const totalPaymentsCents = creatorData._sum.totalEarningsCents || 0;
        
        // Update the threshold with current total
        const currentThreshold = await this.prisma.paymentThreshold.findUnique({
          where: {
            creatorId_taxYear_jurisdiction: {
              creatorId: creatorData.creatorId,
              taxYear,
              jurisdiction: 'US',
            },
          },
        });

        const wasAlreadyMet = currentThreshold?.thresholdMet || false;
        
        await this.prisma.paymentThreshold.upsert({
          where: {
            creatorId_taxYear_jurisdiction: {
              creatorId: creatorData.creatorId,
              taxYear,
              jurisdiction: 'US',
            },
          },
          update: {
            totalPaymentsCents,
            thresholdMet: totalPaymentsCents >= this.getDefaultThreshold('US'),
            thresholdMetAt: totalPaymentsCents >= this.getDefaultThreshold('US') && !wasAlreadyMet 
              ? new Date() 
              : currentThreshold?.thresholdMetAt,
            lastUpdated: new Date(),
          },
          create: {
            creatorId: creatorData.creatorId,
            taxYear,
            jurisdiction: 'US',
            totalPaymentsCents,
            thresholdAmountCents: this.getDefaultThreshold('US'),
            thresholdMet: totalPaymentsCents >= this.getDefaultThreshold('US'),
            thresholdMetAt: totalPaymentsCents >= this.getDefaultThreshold('US') ? new Date() : null,
            lastUpdated: new Date(),
            metadata: {},
          },
        });

        if (totalPaymentsCents >= this.getDefaultThreshold('US') && !wasAlreadyMet) {
          newlyMet++;
          await this.handleThresholdMet(creatorData.creatorId, taxYear, 'US', totalPaymentsCents);
        }

        checked++;
      } catch (error) {
        errors.push({
          creatorId: creatorData.creatorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { checked, newlyMet, errors };
  }

  /**
   * Get creators approaching threshold (within 90% of threshold)
   */
  async getCreatorsApproachingThreshold(
    taxYear: number,
    percentageThreshold: number = 90
  ): Promise<ThresholdStatus[]> {
    const thresholds = await this.prisma.paymentThreshold.findMany({
      where: {
        taxYear,
        thresholdMet: false,
      },
    });

    const approaching: ThresholdStatus[] = [];

    for (const threshold of thresholds) {
      const percentageReached = (threshold.totalPaymentsCents / threshold.thresholdAmountCents) * 100;
      
      if (percentageReached >= percentageThreshold) {
        const status = await this.getThresholdStatus(
          threshold.creatorId,
          taxYear,
          threshold.jurisdiction
        );
        approaching.push(status);
      }
    }

    return approaching.sort((a, b) => b.percentageReached - a.percentageReached);
  }

  /**
   * Get statistics for a tax year
   */
  async getThresholdStatistics(taxYear: number): Promise<{
    totalCreators: number;
    thresholdMet: number;
    totalPaymentsCents: number;
    averagePaymentsCents: number;
    byJurisdiction: Record<string, {
      creators: number;
      thresholdMet: number;
      totalPaymentsCents: number;
    }>;
  }> {
    const thresholds = await this.prisma.paymentThreshold.findMany({
      where: { taxYear },
    });

    const stats = {
      totalCreators: thresholds.length,
      thresholdMet: thresholds.filter(t => t.thresholdMet).length,
      totalPaymentsCents: thresholds.reduce((sum, t) => sum + t.totalPaymentsCents, 0),
      averagePaymentsCents: 0,
      byJurisdiction: {} as Record<string, any>,
    };

    stats.averagePaymentsCents = stats.totalCreators > 0 
      ? stats.totalPaymentsCents / stats.totalCreators 
      : 0;

    // Group by jurisdiction
    thresholds.forEach(threshold => {
      if (!stats.byJurisdiction[threshold.jurisdiction]) {
        stats.byJurisdiction[threshold.jurisdiction] = {
          creators: 0,
          thresholdMet: 0,
          totalPaymentsCents: 0,
        };
      }

      const jurisdictionStats = stats.byJurisdiction[threshold.jurisdiction];
      jurisdictionStats.creators++;
      if (threshold.thresholdMet) jurisdictionStats.thresholdMet++;
      jurisdictionStats.totalPaymentsCents += threshold.totalPaymentsCents;
    });

    return stats;
  }

  /**
   * Handle threshold met event (trigger notifications, etc.)
   */
  private async handleThresholdMet(
    creatorId: string,
    taxYear: number,
    jurisdiction: string,
    amountCents: number
  ): Promise<void> {
    // Cache the event for fast lookup
    const cacheKey = `threshold_met:${creatorId}:${taxYear}:${jurisdiction}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify({
      creatorId,
      taxYear,
      jurisdiction,
      amountCents,
      metAt: new Date(),
    }));

    // TODO: Trigger notification to creator
    // TODO: Add to tax document generation queue
    console.log(`[PaymentThreshold] Creator ${creatorId} met threshold for ${taxYear} in ${jurisdiction}: $${amountCents / 100}`);
  }

  /**
   * Get default threshold amount for jurisdiction
   */
  private getDefaultThreshold(jurisdiction: string): number {
    return this.TAX_THRESHOLDS[jurisdiction as keyof typeof this.TAX_THRESHOLDS]?.FORM_1099_NEC || 60000;
  }

  /**
   * Helper method to map Prisma model to our data type
   */
  private mapToPaymentThresholdData(threshold: any): PaymentThresholdData {
    return {
      id: threshold.id,
      creatorId: threshold.creatorId,
      taxYear: threshold.taxYear,
      jurisdiction: threshold.jurisdiction,
      totalPaymentsCents: threshold.totalPaymentsCents,
      thresholdAmountCents: threshold.thresholdAmountCents,
      thresholdMet: threshold.thresholdMet,
      thresholdMetAt: threshold.thresholdMetAt,
      lastUpdated: threshold.lastUpdated,
      metadata: threshold.metadata,
    };
  }
}
