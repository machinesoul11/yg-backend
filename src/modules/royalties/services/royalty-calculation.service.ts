/**
 * Royalty Calculation Service
 * Core business logic for calculating creator royalties from license revenue
 */

import { PrismaClient, type License, type IpAsset } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AuditService } from '@/lib/services/audit.service';
import {
  RoyaltyRunNotFoundError,
  RoyaltyRunInvalidStateError,
  RoyaltyCalculationError,
  UnresolvedDisputesError,
} from '../errors/royalty.errors';

export class RoyaltyCalculationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly auditService: AuditService
  ) {}

  /**
   * Calculate royalties for a specific run
   * This is the core calculation engine
   */
  async calculateRun(runId: string, userId: string): Promise<void> {
    const run = await this.prisma.royaltyRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new RoyaltyRunNotFoundError(runId);
    }

    if (run.status !== 'DRAFT') {
      throw new RoyaltyRunInvalidStateError(run.status, 'DRAFT');
    }

    try {
      // Begin transaction for atomicity
      await this.prisma.$transaction(
        async (tx) => {
          // 1. Fetch all licenses with revenue in period
          const licenses = await tx.license.findMany({
            where: {
              startDate: { lte: run.periodEnd },
              endDate: { gte: run.periodStart },
              status: 'ACTIVE',
              deletedAt: null,
            },
            include: {
              ipAsset: {
                include: {
                  ownerships: {
                    where: {
                      startDate: { lte: run.periodEnd },
                      OR: [
                        { endDate: { gte: run.periodStart } },
                        { endDate: null },
                      ],
                    },
                    include: {
                      creator: true,
                    },
                  },
                },
              },
              brand: true,
            },
          });

          let totalRevenue = 0;
          let totalRoyalties = 0;

          // 2. Group by creator to build statements
          const creatorEarnings = new Map<
            string,
            {
              totalCents: number;
              lines: Array<{
                licenseId: string;
                ipAssetId: string;
                revenueCents: number;
                shareBps: number;
                calculatedRoyaltyCents: number;
                periodStart: Date;
                periodEnd: Date;
              }>;
            }
          >();

          for (const license of licenses) {
            // Calculate revenue for this license in the period
            const revenueCents = await this.calculateLicenseRevenue(
              license,
              run.periodStart,
              run.periodEnd
            );

            totalRevenue += revenueCents;

            // Distribute to owners
            for (const ownership of license.ipAsset.ownerships) {
              const royaltyCents = Math.floor(
                (revenueCents * ownership.shareBps) / 10000
              );

              totalRoyalties += royaltyCents;

              // Aggregate by creator
              const creatorData = creatorEarnings.get(ownership.creatorId) || {
                totalCents: 0,
                lines: [],
              };

              creatorData.totalCents += royaltyCents;
              creatorData.lines.push({
                licenseId: license.id,
                ipAssetId: license.ipAssetId,
                revenueCents,
                shareBps: ownership.shareBps,
                calculatedRoyaltyCents: royaltyCents,
                periodStart: run.periodStart,
                periodEnd: run.periodEnd,
              });

              creatorEarnings.set(ownership.creatorId, creatorData);
            }
          }

          // 3. Create statements and lines
          for (const [creatorId, earnings] of creatorEarnings.entries()) {
            const statement = await tx.royaltyStatement.create({
              data: {
                royaltyRunId: runId,
                creatorId: creatorId,
                totalEarningsCents: earnings.totalCents,
                status: 'PENDING',
              },
            });

            // Create line items
            await tx.royaltyLine.createMany({
              data: earnings.lines.map((line) => ({
                royaltyStatementId: statement.id,
                licenseId: line.licenseId,
                ipAssetId: line.ipAssetId,
                revenueCents: line.revenueCents,
                shareBps: line.shareBps,
                calculatedRoyaltyCents: line.calculatedRoyaltyCents,
                periodStart: line.periodStart,
                periodEnd: line.periodEnd,
              })),
            });
          }

          // 4. Update run totals and status
          await tx.royaltyRun.update({
            where: { id: runId },
            data: {
              totalRevenueCents: totalRevenue,
              totalRoyaltiesCents: totalRoyalties,
              status: 'CALCULATED',
              processedAt: new Date(),
            },
          });
        },
        {
          timeout: 300000, // 5 minutes timeout for large calculations
        }
      );

      // Log audit event
      await this.auditService.log({
        userId,
        action: 'royalty.run.calculated',
        entityType: 'royalty_run',
        entityId: runId,
        metadata: { runId },
      });

      // Invalidate cache
      await this.redis.del(`royalty_run:${runId}`);
    } catch (error) {
      // Update run status to FAILED
      await this.prisma.royaltyRun.update({
        where: { id: runId },
        data: { status: 'FAILED' },
      });

      if (error instanceof RoyaltyRunNotFoundError || error instanceof RoyaltyRunInvalidStateError) {
        throw error;
      }

      throw new RoyaltyCalculationError(
        error instanceof Error ? error.message : 'Unknown error',
        error
      );
    }
  }

  /**
   * Calculate revenue for a specific license in a period
   * This could be extended to handle usage-based billing
   */
  private async calculateLicenseRevenue(
    license: License & { ipAsset: IpAsset },
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    // For flat-fee licenses, prorate if license started/ended mid-period
    if (license.feeCents > 0) {
      const licenseStart =
        license.startDate > periodStart ? license.startDate : periodStart;
      const licenseEnd = license.endDate < periodEnd ? license.endDate : periodEnd;

      const daysActive = Math.ceil(
        (licenseEnd.getTime() - licenseStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalDays = Math.ceil(
        (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
      );

      return Math.floor((license.feeCents * daysActive) / totalDays);
    }

    // For rev-share licenses, aggregate actual revenue from events table
    if (license.revShareBps > 0) {
      const events = await this.prisma.event.aggregate({
        where: {
          eventType: 'LICENSE_USAGE',
          propsJson: {
            path: ['licenseId'],
            equals: license.id,
          },
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        _sum: {
          // Assuming revenue is stored in propsJson
          // This would need to be adapted based on actual Event schema
        },
      });

      // For now, return 0 for rev-share as we need to implement usage tracking
      // TODO: Implement usage-based revenue tracking
      return 0;
    }

    return 0;
  }

  /**
   * Validate run can be locked
   */
  async validateLockRun(runId: string): Promise<void> {
    const run = await this.prisma.royaltyRun.findUnique({
      where: { id: runId },
      include: {
        statements: {
          where: {
            status: 'DISPUTED',
          },
        },
      },
    });

    if (!run) {
      throw new RoyaltyRunNotFoundError(runId);
    }

    if (run.status !== 'CALCULATED') {
      throw new RoyaltyRunInvalidStateError(run.status, 'CALCULATED');
    }

    if (run.statements.length > 0) {
      throw new UnresolvedDisputesError(run.statements.length);
    }
  }

  /**
   * Apply manual adjustment to a statement
   */
  async applyAdjustment(
    statementId: string,
    adjustmentCents: number,
    reason: string,
    userId: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const statement = await tx.royaltyStatement.findUnique({
        where: { id: statementId },
      });

      if (!statement) {
        throw new RoyaltyCalculationError('Statement not found');
      }

      // Create adjustment line
      await tx.royaltyLine.create({
        data: {
          royaltyStatementId: statementId,
          licenseId: 'MANUAL_ADJUSTMENT', // Special marker
          ipAssetId: 'MANUAL_ADJUSTMENT',
          revenueCents: 0,
          shareBps: 0,
          calculatedRoyaltyCents: adjustmentCents,
          periodStart: statement.createdAt,
          periodEnd: statement.createdAt,
          metadata: {
            type: 'manual_adjustment',
            reason,
            appliedBy: userId,
            appliedAt: new Date().toISOString(),
          },
        },
      });

      // Update statement total
      await tx.royaltyStatement.update({
        where: { id: statementId },
        data: {
          totalEarningsCents: statement.totalEarningsCents + adjustmentCents,
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'royalty.statement.adjusted',
      entityType: 'royalty_statement',
      entityId: statementId,
      metadata: { adjustmentCents, reason },
    });
  }
}
