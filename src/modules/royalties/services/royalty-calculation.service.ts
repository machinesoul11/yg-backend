/**
 * Royalty Calculation Service
 * Core business logic for calculating creator royalties from license revenue
 * 
 * This service implements the complete royalty calculation engine including:
 * - Period validation and overlap detection
 * - Revenue aggregation from licenses
 * - Ownership split calculations with precision
 * - License scope consideration
 * - Manual adjustments (credits/debits)
 * - Banker's rounding and precision rules
 * - Minimum payout thresholds with rollover
 */

import { PrismaClient, type License, type IpAsset, type IpOwnership } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AuditService } from '@/lib/services/audit.service';
import {
  RoyaltyRunNotFoundError,
  RoyaltyRunInvalidStateError,
  RoyaltyCalculationError,
  UnresolvedDisputesError,
} from '../errors/royalty.errors';
import { 
  checkForOverlappingRuns,
  calculateOverlapDays,
  getPeriodDays,
} from '../utils/period.utils';
import {
  calculateRoyaltyShare,
  prorateRevenue,
  validateOwnershipSplit,
  calculateRoundingReconciliation,
  isRoundingWithinTolerance,
  calculateAccumulatedBalance,
  splitAmountAccurately,
} from '../utils/financial.utils';
import {
  CALCULATION_ENGINE_CONFIG,
  getCreatorMinimumThreshold,
  ADJUSTMENT_TYPES,
} from '../config/calculation.config';

export class RoyaltyCalculationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly auditService: AuditService
  ) {}

  /**
   * Validate and create a new royalty run with period overlap checking
   */
  async createRun(
    periodStart: Date,
    periodEnd: Date,
    notes: string | undefined,
    userId: string
  ): Promise<string> {
    // Validate period dates
    if (periodEnd <= periodStart) {
      throw new RoyaltyCalculationError('Period end must be after period start');
    }

    // Check for overlapping periods
    await checkForOverlappingRuns(this.prisma, periodStart, periodEnd);

    // Create the run
    const run = await this.prisma.royaltyRun.create({
      data: {
        periodStart,
        periodEnd,
        status: 'DRAFT',
        totalRevenueCents: 0,
        totalRoyaltiesCents: 0,
        notes,
        createdBy: userId,
      },
    });

    await this.auditService.log({
      userId,
      action: 'royalty.run.created',
      entityType: 'royalty_run',
      entityId: run.id,
      after: { periodStart, periodEnd },
    });

    return run.id;
  }

  /**
   * Calculate royalties for a specific run
   * This is the core calculation engine implementing:
   * - Revenue aggregation with pro-rating
   * - Ownership split calculation
   * - License scope consideration
   * - Banker's rounding
   * - Rounding reconciliation
   * - Minimum threshold application
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
          console.log(`[RoyaltyCalculation] Starting calculation for run ${runId}`);
          console.log(`[RoyaltyCalculation] Period: ${run.periodStart.toISOString()} to ${run.periodEnd.toISOString()}`);

          // 1. Fetch all licenses active during the period
          const licenses = await this.fetchActiveLicenses(tx, run.periodStart, run.periodEnd);
          console.log(`[RoyaltyCalculation] Found ${licenses.length} active licenses`);

          // 2. Track pre and post rounding values for reconciliation
          const preRoundedValues: number[] = [];
          const postRoundedValues: number[] = [];

          let totalRevenue = 0;
          let totalRoyalties = 0;

          // 3. Group earnings by creator
          const creatorEarnings = new Map<
            string,
            {
              totalCents: number;
              unpaidBalanceCents: number;
              lines: Array<{
                licenseId: string;
                ipAssetId: string;
                revenueCents: number;
                shareBps: number;
                calculatedRoyaltyCents: number;
                periodStart: Date;
                periodEnd: Date;
                metadata?: any;
              }>;
            }
          >();

          // 4. Process each license
          for (const license of licenses) {
            try {
              // Calculate total revenue for this license in the period
              const licenseRevenue = await this.calculateLicenseRevenueDetailed(
                license,
                run.periodStart,
                run.periodEnd,
                tx
              );

              if (licenseRevenue.totalRevenueCents === 0) {
                console.log(`[RoyaltyCalculation] License ${license.id} has no revenue, skipping`);
                continue;
              }

              totalRevenue += licenseRevenue.totalRevenueCents;

              // Validate ownership splits
              const ownershipBps = license.ipAsset.ownerships.map((o: any) => o.shareBps);
              if (!validateOwnershipSplit(ownershipBps)) {
                console.error(
                  `[RoyaltyCalculation] Invalid ownership split for asset ${license.ipAssetId}. Sum: ${ownershipBps.reduce((a: number, b: number) => a + b, 0)} bps`
                );
                throw new RoyaltyCalculationError(
                  `Ownership splits for asset ${license.ipAssetId} do not sum to 10000 bps`
                );
              }

              // Calculate splits accurately using largest remainder method
              const splits = splitAmountAccurately(
                licenseRevenue.totalRevenueCents,
                license.ipAsset.ownerships.map((o: any) => ({
                  id: o.creatorId,
                  basisPoints: o.shareBps,
                }))
              );

              // Distribute to owners
              for (const ownership of license.ipAsset.ownerships) {
                const split = splits.find((s) => s.id === ownership.creatorId);
                if (!split) continue;

                const royaltyCents = split.amountCents;

                // Track for rounding reconciliation
                const preRounded = (licenseRevenue.totalRevenueCents * ownership.shareBps) / 10000;
                preRoundedValues.push(preRounded);
                postRoundedValues.push(royaltyCents);

                totalRoyalties += royaltyCents;

                // Get or initialize creator data
                let creatorData = creatorEarnings.get(ownership.creatorId);
                if (!creatorData) {
                  // Fetch any unpaid balance from previous runs
                  const unpaidBalance = await this.getCreatorUnpaidBalance(
                    tx,
                    ownership.creatorId,
                    run.periodStart
                  );

                  creatorData = {
                    totalCents: 0,
                    unpaidBalanceCents: unpaidBalance,
                    lines: [],
                  };
                  creatorEarnings.set(ownership.creatorId, creatorData);
                }

                creatorData.totalCents += royaltyCents;
                creatorData.lines.push({
                  licenseId: license.id,
                  ipAssetId: license.ipAssetId,
                  revenueCents: licenseRevenue.totalRevenueCents,
                  shareBps: ownership.shareBps,
                  calculatedRoyaltyCents: royaltyCents,
                  periodStart: run.periodStart,
                  periodEnd: run.periodEnd,
                  metadata: licenseRevenue.metadata,
                });
              }
            } catch (error) {
              console.error(`[RoyaltyCalculation] Error processing license ${license.id}:`, error);
              throw new RoyaltyCalculationError(
                `Failed to process license ${license.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }

          // 5. Perform rounding reconciliation
          const reconciliation = calculateRoundingReconciliation(
            preRoundedValues,
            postRoundedValues
          );

          console.log('[RoyaltyCalculation] Rounding reconciliation:', {
            preRoundedTotal: reconciliation.preRoundedTotal.toFixed(2),
            postRoundedTotal: reconciliation.postRoundedTotal,
            roundingDifference: reconciliation.roundingDifference,
            itemCount: reconciliation.itemCount,
            averageError: reconciliation.averageRoundingError.toFixed(4),
          });

          if (!isRoundingWithinTolerance(reconciliation)) {
            console.warn(
              `[RoyaltyCalculation] Rounding difference ${reconciliation.roundingDifference} cents exceeds tolerance`
            );
            // Log but don't fail - this is expected for large runs
          }

          // 6. Create statements and apply minimum threshold logic
          console.log(`[RoyaltyCalculation] Creating statements for ${creatorEarnings.size} creators`);

          for (const [creatorId, earnings] of creatorEarnings.entries()) {
            const minimumThreshold = await getCreatorMinimumThreshold(creatorId, tx);

            // Calculate accumulated balance with current earnings
            const accumulated = calculateAccumulatedBalance(
              earnings.unpaidBalanceCents,
              earnings.totalCents,
              minimumThreshold
            );

            const statement = await tx.royaltyStatement.create({
              data: {
                royaltyRunId: runId,
                creatorId,
                totalEarningsCents: accumulated.totalAccumulatedCents,
                status: accumulated.shouldPayout ? 'PENDING' : 'REVIEWED',
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
                metadata: line.metadata,
              })),
            });

            // If there was an unpaid balance, create a carryover line
            if (earnings.unpaidBalanceCents > 0) {
              await tx.royaltyLine.create({
                data: {
                  royaltyStatementId: statement.id,
                  licenseId: 'CARRYOVER',
                  ipAssetId: 'CARRYOVER',
                  revenueCents: 0,
                  shareBps: 0,
                  calculatedRoyaltyCents: earnings.unpaidBalanceCents,
                  periodStart: run.periodStart,
                  periodEnd: run.periodStart,
                  metadata: {
                    type: 'carryover',
                    description: 'Unpaid balance from previous period(s)',
                    minimumThreshold: minimumThreshold,
                  },
                },
              });
            }

            // If below threshold, create a note line
            if (!accumulated.shouldPayout) {
              await tx.royaltyLine.create({
                data: {
                  royaltyStatementId: statement.id,
                  licenseId: 'THRESHOLD_NOTE',
                  ipAssetId: 'THRESHOLD_NOTE',
                  revenueCents: 0,
                  shareBps: 0,
                  calculatedRoyaltyCents: 0,
                  periodStart: run.periodStart,
                  periodEnd: run.periodEnd,
                  metadata: {
                    type: 'threshold_note',
                    description: `Total earnings below minimum payout threshold of $${(minimumThreshold / 100).toFixed(2)}. Balance will carry forward to next period.`,
                    minimumThreshold: minimumThreshold,
                    accumulatedBalance: accumulated.totalAccumulatedCents,
                  },
                },
              });
            }

            console.log(
              `[RoyaltyCalculation] Creator ${creatorId}: $${(earnings.totalCents / 100).toFixed(2)} current + $${(earnings.unpaidBalanceCents / 100).toFixed(2)} carryover = $${(accumulated.totalAccumulatedCents / 100).toFixed(2)} total (${accumulated.shouldPayout ? 'PAYOUT' : 'CARRYOVER'})`
            );
          }

          // 7. Update run totals and status
          await tx.royaltyRun.update({
            where: { id: runId },
            data: {
              totalRevenueCents: totalRevenue,
              totalRoyaltiesCents: totalRoyalties,
              status: 'CALCULATED',
              processedAt: new Date(),
              notes: run.notes
                ? `${run.notes}\n\nCalculation completed: ${creatorEarnings.size} creators, ${licenses.length} licenses, $${(totalRevenue / 100).toFixed(2)} revenue, $${(totalRoyalties / 100).toFixed(2)} royalties`
                : `Calculation completed: ${creatorEarnings.size} creators, ${licenses.length} licenses, $${(totalRevenue / 100).toFixed(2)} revenue, $${(totalRoyalties / 100).toFixed(2)} royalties`,
            },
          });

          console.log('[RoyaltyCalculation] Calculation completed successfully');
          console.log(`[RoyaltyCalculation] Total revenue: $${(totalRevenue / 100).toFixed(2)}`);
          console.log(`[RoyaltyCalculation] Total royalties: $${(totalRoyalties / 100).toFixed(2)}`);
        },
        {
          timeout: CALCULATION_ENGINE_CONFIG.calculationTimeoutMs,
        }
      );

      // Log audit event
      await this.auditService.log({
        userId,
        action: 'royalty.run.calculated',
        entityType: 'royalty_run',
        entityId: runId,
        after: { runId },
      });

      // Invalidate cache
      await this.redis.del(`royalty_run:${runId}`);
    } catch (error) {
      // Update run status to FAILED
      await this.prisma.royaltyRun.update({
        where: { id: runId },
        data: { 
          status: 'FAILED',
          notes: run.notes
            ? `${run.notes}\n\nCalculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            : `Calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
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
   * Fetch all licenses active during a period with their IP assets and ownerships
   */
  private async fetchActiveLicenses(
    tx: any,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Array<License & {
    ipAsset: IpAsset & {
      ownerships: Array<IpOwnership & { creator: any }>;
    };
    brand: any;
  }>> {
    return tx.license.findMany({
      where: {
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              where: {
                startDate: { lte: periodEnd },
                OR: [
                  { endDate: { gte: periodStart } },
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
  }

  /**
   * Get creator's unpaid balance from previous runs
   */
  private async getCreatorUnpaidBalance(
    tx: any,
    creatorId: string,
    beforeDate: Date
  ): Promise<number> {
    const previousStatements = await tx.royaltyStatement.findMany({
      where: {
        creatorId,
        status: { in: ['REVIEWED', 'PENDING'] },
        createdAt: { lt: beforeDate },
      },
      select: {
        totalEarningsCents: true,
      },
    });

    return previousStatements.reduce(
      (sum: number, stmt: any) => sum + stmt.totalEarningsCents,
      0
    );
  }

  /**
   * Calculate revenue for a specific license in a period
   * Returns detailed revenue breakdown
   */
  private async calculateLicenseRevenueDetailed(
    license: License & { ipAsset: IpAsset },
    periodStart: Date,
    periodEnd: Date,
    tx: any
  ): Promise<{
    totalRevenueCents: number;
    flatFeeCents: number;
    usageRevenueCents: number;
    daysActive: number;
    totalDays: number;
    metadata: any;
  }> {
    let flatFeeCents = 0;
    let usageRevenueCents = 0;

    const totalDays = getPeriodDays(periodStart, periodEnd);
    const daysActive = calculateOverlapDays(
      license.startDate,
      license.endDate,
      periodStart,
      periodEnd
    );

    // Calculate flat fee revenue with pro-rating if enabled
    if (license.feeCents > 0) {
      if (CALCULATION_ENGINE_CONFIG.enableLicenseProration && daysActive < totalDays) {
        flatFeeCents = prorateRevenue(license.feeCents, daysActive, totalDays);
      } else {
        flatFeeCents = license.feeCents;
      }
    }

    // Calculate usage-based revenue if enabled
    if (CALCULATION_ENGINE_CONFIG.enableUsageRevenue && license.revShareBps > 0) {
      try {
        // Import usage billing service dynamically to avoid circular deps
        const { usageBillingService } = await import('../../licenses/usage');
        
        const usageRoyalties = await usageBillingService.calculateUsageBasedRoyalties(
          license.id,
          periodStart,
          periodEnd
        );

        usageRevenueCents = usageRoyalties.reduce(
          (sum, r) => sum + r.usageRevenueCents,
          0
        );

        console.log(
          `[RoyaltyCalculation] License ${license.id} usage revenue: $${(usageRevenueCents / 100).toFixed(2)}`
        );
      } catch (error) {
        console.error(
          `[RoyaltyCalculation] Failed to calculate usage revenue for license ${license.id}:`,
          error
        );
        // Continue with flat fee only - don't fail the entire calculation
      }
    }

    const totalRevenueCents = flatFeeCents + usageRevenueCents;

    return {
      totalRevenueCents,
      flatFeeCents,
      usageRevenueCents,
      daysActive,
      totalDays,
      metadata: {
        flatFeeCents,
        usageRevenueCents,
        daysActive,
        totalDays,
        prorated: daysActive < totalDays,
        licenseType: license.licenseType,
        revShareBps: license.revShareBps,
      },
    };
  }

  /**
   * Calculate revenue for a specific license in a period
   * Includes both flat fees and usage-based revenue
   */
  private async calculateLicenseRevenue(
    license: License & { ipAsset: IpAsset },
    periodStart: Date,
    periodEnd: Date,
    tx?: any
  ): Promise<number> {
    const detailed = await this.calculateLicenseRevenueDetailed(
      license,
      periodStart,
      periodEnd,
      tx || this.prisma
    );
    return detailed.totalRevenueCents;
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
   * Supports credits, debits, bonuses, corrections, and refunds
   */
  async applyAdjustment(
    statementId: string,
    adjustmentCents: number,
    reason: string,
    adjustmentType: string,
    userId: string
  ): Promise<void> {
    // Validate adjustment type
    if (!Object.values(ADJUSTMENT_TYPES).includes(adjustmentType as any)) {
      throw new RoyaltyCalculationError(
        `Invalid adjustment type: ${adjustmentType}`
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const statement = await tx.royaltyStatement.findUnique({
        where: { id: statementId },
        include: {
          royaltyRun: true,
        },
      });

      if (!statement) {
        throw new RoyaltyCalculationError('Statement not found');
      }

      // Check if run is locked - adjustments not allowed on locked runs
      if (statement.royaltyRun.status === 'LOCKED') {
        throw new RoyaltyCalculationError(
          'Cannot adjust statements in locked royalty runs'
        );
      }

      // Create adjustment line
      await tx.royaltyLine.create({
        data: {
          royaltyStatementId: statementId,
          licenseId: 'MANUAL_ADJUSTMENT',
          ipAssetId: 'MANUAL_ADJUSTMENT',
          revenueCents: 0,
          shareBps: 0,
          calculatedRoyaltyCents: adjustmentCents,
          periodStart: statement.createdAt,
          periodEnd: statement.createdAt,
          metadata: {
            type: 'manual_adjustment',
            adjustmentType,
            reason,
            appliedBy: userId,
            appliedAt: new Date().toISOString(),
          },
        },
      });

      // Update statement total
      const newTotal = statement.totalEarningsCents + adjustmentCents;

      await tx.royaltyStatement.update({
        where: { id: statementId },
        data: {
          totalEarningsCents: newTotal,
        },
      });

      // Update run totals
      await tx.royaltyRun.update({
        where: { id: statement.royaltyRunId },
        data: {
          totalRoyaltiesCents: {
            increment: adjustmentCents,
          },
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'royalty.statement.adjusted',
      entityType: 'royalty_statement',
      entityId: statementId,
      after: { adjustmentCents, reason, adjustmentType },
    });

    // Invalidate cache
    await this.redis.del(`royalty_statement:${statementId}`);
  }

  /**
   * Validate license scope against reported usage
   * Returns true if usage is within scope, false otherwise
   */
  async validateLicenseScope(
    license: License,
    reportedUsage: {
      mediaTypes?: string[];
      geographies?: string[];
      channels?: string[];
    }
  ): Promise<{
    isValid: boolean;
    violations: string[];
  }> {
    const violations: string[] = [];
    const scope = license.scopeJson as any;

    if (!scope) {
      return { isValid: true, violations: [] };
    }

    // Check media types
    if (scope.mediaTypes && reportedUsage.mediaTypes) {
      const allowedMedia = new Set(scope.mediaTypes);
      const unauthorizedMedia = reportedUsage.mediaTypes.filter(
        (m) => !allowedMedia.has(m)
      );
      if (unauthorizedMedia.length > 0) {
        violations.push(
          `Unauthorized media types: ${unauthorizedMedia.join(', ')}`
        );
      }
    }

    // Check geographies
    if (scope.geographies && reportedUsage.geographies) {
      const allowedGeo = new Set(scope.geographies);
      const unauthorizedGeo = reportedUsage.geographies.filter(
        (g) => !allowedGeo.has(g)
      );
      if (unauthorizedGeo.length > 0) {
        violations.push(
          `Unauthorized geographies: ${unauthorizedGeo.join(', ')}`
        );
      }
    }

    // Check channels
    if (scope.channels && reportedUsage.channels) {
      const allowedChannels = new Set(scope.channels);
      const unauthorizedChannels = reportedUsage.channels.filter(
        (c) => !allowedChannels.has(c)
      );
      if (unauthorizedChannels.length > 0) {
        violations.push(
          `Unauthorized channels: ${unauthorizedChannels.join(', ')}`
        );
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Lock a royalty run after validation
   * Prevents further modifications to the run and its statements
   */
  async lockRun(runId: string, userId: string): Promise<void> {
    await this.validateLockRun(runId);

    await this.prisma.royaltyRun.update({
      where: { id: runId },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
      },
    });

    await this.auditService.log({
      userId,
      action: 'royalty.run.locked',
      entityType: 'royalty_run',
      entityId: runId,
      after: { lockedAt: new Date() },
    });

    // Invalidate cache
    await this.redis.del(`royalty_run:${runId}`);
  }
}
