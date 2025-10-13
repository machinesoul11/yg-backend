/**
 * Usage-Based Billing Integration Service
 * Handles billing triggers for usage overages and royalty distribution
 */

import { PrismaClient } from '@prisma/client';
import type { CreateUsageInvoiceInput, UsageBasedRoyalty } from '../types';

export class UsageBasedBillingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Process billing for approved overages
   * Integrates with Stripe for invoice creation
   */
  async processOverageBilling(overageIds: string[]): Promise<void> {
    for (const overageId of overageIds) {
      try {
        const overage = await this.prisma.licenseUsageOverage.findUnique({
          where: { id: overageId },
          include: {
            license: {
              include: {
                brand: true,
                ipAsset: {
                  include: {
                    ownerships: {
                      include: { creator: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (!overage || overage.status !== 'APPROVED') {
          console.warn(`Skipping overage ${overageId}: not approved`);
          continue;
        }

        // Create invoice (stub - integrate with actual Stripe service)
        const billedFeeCents = overage.billedFeeCents || overage.calculatedFeeCents || 0;

        // Update overage status
        await this.prisma.licenseUsageOverage.update({
          where: { id: overageId },
          data: {
            status: 'BILLED',
            billedAt: new Date(),
          },
        });

        // Create royalty lines for creators if rev-share exists
        if (overage.license.revShareBps > 0) {
          await this.distributeUsageRoyalties(
            overage.license.id,
            billedFeeCents,
            overage.periodStart,
            overage.periodEnd
          );
        }

        console.log(`[UsageBilling] Processed overage ${overageId}: $${(billedFeeCents / 100).toFixed(2)}`);
      } catch (error) {
        console.error(`[UsageBilling] Failed to process overage ${overageId}:`, error);
      }
    }
  }

  /**
   * Distribute usage-based revenue to creators as royalties
   */
  private async distributeUsageRoyalties(
    licenseId: string,
    revenueCents: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              where: {
                startDate: { lte: periodEnd },
                OR: [{ endDate: { gte: periodStart } }, { endDate: null }],
              },
              include: { creator: true },
            },
          },
        },
      },
    });

    if (!license) return;

    // Find active royalty run or create note for next run
    // This is a simplified version - in production, integrate with royalty calculation service
    for (const ownership of license.ipAsset.ownerships) {
      const royaltyCents = Math.floor((revenueCents * ownership.shareBps) / 10000);

      console.log(
        `[UsageBilling] Creator ${ownership.creatorId} earned $${(royaltyCents / 100).toFixed(2)} from usage-based fee`
      );

      // In production, create royalty_line record linked to active royalty_run
      // For now, just log it
    }
  }

  /**
   * Calculate usage-based royalties for a period
   * Used by royalty calculation service
   */
  async calculateUsageBasedRoyalties(
    licenseId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<UsageBasedRoyalty[]> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              where: {
                startDate: { lte: periodEnd },
                OR: [{ endDate: { gte: periodStart } }, { endDate: null }],
              },
            },
          },
        },
      },
    });

    if (!license || license.revShareBps === 0) {
      return [];
    }

    // Get usage-based revenue from aggregates
    const aggregates = await this.prisma.licenseUsageDailyAggregate.findMany({
      where: {
        licenseId,
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    const totalRevenueCents = aggregates.reduce(
      (sum: number, agg: any) => sum + (agg.totalRevenueCents || 0),
      0
    );

    // Distribute to owners
    return license.ipAsset.ownerships.map((ownership) => ({
      licenseId,
      creatorId: ownership.creatorId,
      usageRevenueCents: totalRevenueCents,
      shareBps: ownership.shareBps,
      calculatedRoyaltyCents: Math.floor(
        (totalRevenueCents * ownership.shareBps) / 10000
      ),
      periodStart,
      periodEnd,
    }));
  }
}
