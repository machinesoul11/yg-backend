import { PrismaClient } from '@prisma/client';
import { 
  RevenueReconciliationReport, 
  RevenueReconciliationConfig,
  LicenseRevenueItem,
  RoyaltyPaymentItem,
  DiscrepancyItem
} from '../types';
import { 
  ReportGenerationError,
  ReportDataSourceError,
  ReportValidationError 
} from '../errors/report.errors';

/**
 * Service for generating revenue reconciliation reports
 * Compares expected vs actual revenue flows and identifies discrepancies
 */
export class RevenueReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate comprehensive revenue reconciliation report
   */
  async generateReconciliationReport(
    config: RevenueReconciliationConfig
  ): Promise<RevenueReconciliationReport> {
    try {
      const { startDate, endDate, includeDetails = true, filters } = config;

      // Generate core reconciliation data
      const [
        licenseRevenue,
        royaltyPayments,
        discrepancies,
        summaryMetrics
      ] = await Promise.all([
        this.getLicenseRevenue(startDate, endDate, filters),
        this.getRoyaltyPayments(startDate, endDate, filters),
        this.identifyDiscrepancies(startDate, endDate, filters),
        this.generateSummaryMetrics(startDate, endDate, filters)
      ]);

      const report: RevenueReconciliationReport = {
        id: `reconciliation_${Date.now()}`,
        type: 'REVENUE_RECONCILIATION',
        config,
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        // Core reconciliation data
        licenseRevenue,
        royaltyPayments,
        discrepancies,
        
        // Summary metrics
        totalLicenseRevenueCents: summaryMetrics.totalLicenseRevenueCents,
        totalRoyaltyPaymentsCents: summaryMetrics.totalRoyaltyPaymentsCents,
        netRevenueCents: summaryMetrics.netRevenueCents,
        discrepancyCount: discrepancies.length,
        totalDiscrepancyCents: discrepancies.reduce((sum, d) => sum + Math.abs(d.amountCents), 0),
        
        // Include detailed breakdowns if requested
        ...(includeDetails && {
          monthlyBreakdown: await this.getMonthlyBreakdown(startDate, endDate, filters),
          brandBreakdown: await this.getBrandBreakdown(startDate, endDate, filters),
          creatorBreakdown: await this.getCreatorBreakdown(startDate, endDate, filters)
        })
      };

      return report;
    } catch (error) {
      throw new ReportGenerationError(
        'revenue_reconciliation',
        `Failed to generate revenue reconciliation report: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get license revenue data
   */
  private async getLicenseRevenue(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<LicenseRevenueItem[]> {
    try {
      const licenses = await this.prisma.license.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'ACTIVE',
          ...(filters?.brandIds?.length && { brandId: { in: filters.brandIds } }),
          ...(filters?.licenseTypes?.length && { licenseType: { in: filters.licenseTypes } })
        },
        include: {
          brand: { select: { id: true, name: true } },
          ipAsset: { 
            select: { 
              id: true, 
              title: true, 
              creators: { 
                select: { 
                  creator: { select: { id: true, name: true } } 
                } 
              } 
            } 
          },
          project: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return licenses.map(license => ({
        licenseId: license.id,
        brandId: license.brandId,
        brandName: license.brand.name,
        ipAssetId: license.ipAssetId,
        ipAssetTitle: license.ipAsset.title,
        projectId: license.projectId,
        projectName: license.project?.name,
        licenseType: license.licenseType,
        feeCents: license.feeCents,
        revShareBps: license.revShareBps,
        createdAt: license.createdAt,
        status: license.status,
        creators: license.ipAsset.creators.map(c => ({
          id: c.creator.id,
          name: c.creator.name
        }))
      }));
    } catch (error) {
      throw new ReportDataSourceError(
        'license_revenue',
        `Failed to fetch license revenue data: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get royalty payment data
   */
  private async getRoyaltyPayments(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<RoyaltyPaymentItem[]> {
    try {
      const royaltyStatements = await this.prisma.royaltyStatement.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filters?.creatorIds?.length && { creatorId: { in: filters.creatorIds } }),
          ...(filters?.statuses?.length && { status: { in: filters.statuses } })
        },
        include: {
          creator: { select: { id: true, name: true } },
          lines: {
            include: {
              license: {
                include: {
                  brand: { select: { id: true, name: true } },
                  ipAsset: { select: { id: true, title: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return royaltyStatements.map(statement => ({
        statementId: statement.id,
        creatorId: statement.creatorId,
        creatorName: statement.creator.name,
        totalEarningsCents: statement.totalEarningsCents,
        status: statement.status,
        createdAt: statement.createdAt,
        paidAt: statement.paidAt,
        lineItems: statement.lines.map(line => ({
          licenseId: line.licenseId,
          brandName: line.license.brand.name,
          ipAssetTitle: line.license.ipAsset.title,
          revenueCents: line.revenueCents,
          shareBps: line.shareBps,
          calculatedRoyaltyCents: line.calculatedRoyaltyCents,
          periodStart: line.periodStart,
          periodEnd: line.periodEnd
        }))
      }));
    } catch (error) {
      throw new ReportDataSourceError(
        'royalty_payments',
        `Failed to fetch royalty payment data: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Identify discrepancies between expected and actual revenue flows
   */
  private async identifyDiscrepancies(
    startDate: Date,
    endDate: Date,
    filters?: any
  ): Promise<DiscrepancyItem[]> {
    try {
      const discrepancies: DiscrepancyItem[] = [];

      // Check for licenses without corresponding royalty calculations
      const licensesWithoutRoyalties = await this.prisma.license.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'ACTIVE',
          feeCents: { gt: 0 },
          royaltyLines: { none: {} },
          ...(filters?.brandIds?.length && { brandId: { in: filters.brandIds } })
        },
        include: {
          brand: { select: { name: true } },
          ipAsset: { select: { title: true } }
        }
      });

      licensesWithoutRoyalties.forEach(license => {
        discrepancies.push({
          type: 'MISSING_ROYALTY_CALCULATION',
          entityId: license.id,
          entityType: 'LICENSE',
          description: `License ${license.id} has revenue but no royalty calculation`,
          amountCents: license.feeCents,
          details: {
            licenseId: license.id,
            brandName: license.brand.name,
            ipAssetTitle: license.ipAsset.title,
            feeCents: license.feeCents
          }
        });
      });

      // Check for royalty statements without corresponding license revenue
      const royaltiesWithoutLicenses = await this.prisma.royaltyStatement.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          lines: {
            some: {
              license: {
                OR: [
                  { status: { not: 'ACTIVE' } },
                  { feeCents: 0 }
                ]
              }
            }
          }
        },
        include: {
          creator: { select: { name: true } },
          lines: {
            include: {
              license: {
                include: {
                  brand: { select: { name: true } },
                  ipAsset: { select: { title: true } }
                }
              }
            }
          }
        }
      });

      royaltiesWithoutLicenses.forEach(statement => {
        statement.lines.forEach(line => {
          if (line.license.status !== 'ACTIVE' || line.license.feeCents === 0) {
            discrepancies.push({
              type: 'ORPHANED_ROYALTY',
              entityId: statement.id,
              entityType: 'ROYALTY_STATEMENT',
              description: `Royalty statement ${statement.id} references inactive or zero-revenue license`,
              amountCents: line.calculatedRoyaltyCents,
              details: {
                statementId: statement.id,
                creatorName: statement.creator.name,
                licenseId: line.licenseId,
                licenseStatus: line.license.status,
                licenseFeeCents: line.license.feeCents
              }
            });
          }
        });
      });

      // Check for calculation discrepancies
      const royaltyLines = await this.prisma.royaltyLine.findMany({
        where: {
          royaltyStatement: {
            createdAt: { gte: startDate, lte: endDate }
          }
        },
        include: {
          license: true,
          royaltyStatement: true
        }
      });

      royaltyLines.forEach(line => {
        const expectedRoyalty = Math.round((line.revenueCents * line.shareBps) / 10000);
        const actualRoyalty = line.calculatedRoyaltyCents;
        const difference = Math.abs(expectedRoyalty - actualRoyalty);

        if (difference > 1) { // Allow for rounding differences
          discrepancies.push({
            type: 'CALCULATION_MISMATCH',
            entityId: line.id,
            entityType: 'ROYALTY_LINE',
            description: `Royalty calculation mismatch: expected ${expectedRoyalty}, actual ${actualRoyalty}`,
            amountCents: difference,
            details: {
              royaltyLineId: line.id,
              licenseId: line.licenseId,
              revenueCents: line.revenueCents,
              shareBps: line.shareBps,
              expectedRoyalty,
              actualRoyalty,
              difference
            }
          });
        }
      });

      return discrepancies;
    } catch (error) {
      throw new ReportDataSourceError(
        'discrepancy_analysis',
        `Failed to identify discrepancies: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate summary metrics
   */
  private async generateSummaryMetrics(
    startDate: Date,
    endDate: Date,
    filters?: any
  ) {
    const [licenseRevenue, royaltyPayments] = await Promise.all([
      this.prisma.license.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'ACTIVE',
          ...(filters?.brandIds?.length && { brandId: { in: filters.brandIds } })
        },
        _sum: { feeCents: true }
      }),
      this.prisma.royaltyStatement.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filters?.creatorIds?.length && { creatorId: { in: filters.creatorIds } })
        },
        _sum: { totalEarningsCents: true }
      })
    ]);

    const totalLicenseRevenueCents = licenseRevenue._sum.feeCents || 0;
    const totalRoyaltyPaymentsCents = royaltyPayments._sum.totalEarningsCents || 0;

    return {
      totalLicenseRevenueCents,
      totalRoyaltyPaymentsCents,
      netRevenueCents: totalLicenseRevenueCents - totalRoyaltyPaymentsCents
    };
  }

  /**
   * Get monthly breakdown
   */
  private async getMonthlyBreakdown(startDate: Date, endDate: Date, filters?: any) {
    // Implementation for monthly revenue/royalty breakdown
    return [];
  }

  /**
   * Get brand breakdown
   */
  private async getBrandBreakdown(startDate: Date, endDate: Date, filters?: any) {
    // Implementation for brand-specific breakdown
    return [];
  }

  /**
   * Get creator breakdown
   */
  private async getCreatorBreakdown(startDate: Date, endDate: Date, filters?: any) {
    // Implementation for creator-specific breakdown
    return [];
  }
}
