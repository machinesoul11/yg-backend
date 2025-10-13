/**
 * License Performance Metrics Service
 * Tracks and calculates license performance metrics including ROI, utilization, conflicts, and approval times
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/db/redis';
import { differenceInDays, differenceInHours, startOfDay, endOfDay, subDays, format } from 'date-fns';
import type { LicenseScope } from '../types';

/**
 * License ROI Metrics
 */
export interface LicenseROIMetrics {
  licenseId: string;
  totalRevenueCents: number;
  totalCostCents: number;
  roiPercentage: number;
  breakEvenDate: Date | null;
  daysToBreakEven: number | null;
  projectedAnnualROI: number;
  revenueGrowthRate: number;
}

/**
 * License Utilization Metrics
 */
export interface LicenseUtilizationMetrics {
  licenseId: string;
  utilizationPercentage: number;
  actualUsageCount: number;
  scopeLimitCount: number | null; // null means unlimited
  remainingCapacity: number | null;
  utilizationTrend: 'increasing' | 'decreasing' | 'stable';
  isOverUtilized: boolean;
  isUnderUtilized: boolean;
  usageByType: Record<string, number>;
}

/**
 * Approval Time Metrics
 */
export interface ApprovalTimeMetrics {
  licenseId: string;
  createdAt: Date;
  signedAt: Date | null;
  approvalDurationHours: number | null;
  approvalDurationDays: number | null;
  status: string;
  approvalStage: 'created' | 'pending_approval' | 'approved' | 'expired';
  bottlenecks: string[];
}

/**
 * Conflict Rate Metrics
 */
export interface ConflictRateMetrics {
  period: {
    start: Date;
    end: Date;
  };
  totalLicensesCreated: number;
  totalConflictsDetected: number;
  conflictRate: number; // Percentage
  conflictsByType: Record<string, number>;
  conflictsBySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  topConflictingAssets: Array<{
    ipAssetId: string;
    ipAssetTitle: string;
    conflictCount: number;
  }>;
  resolutionTimeAvg: number; // hours
}

/**
 * Aggregated Performance Metrics
 */
export interface AggregatedPerformanceMetrics {
  period: {
    start: Date;
    end: Date;
    granularity: 'daily' | 'weekly' | 'monthly';
  };
  revenue: {
    totalRevenueCents: number;
    averageRevenuePerLicense: number;
    revenueGrowthPercent: number;
    topRevenueGenerators: Array<{
      licenseId: string;
      brandName: string;
      ipAssetTitle: string;
      revenueCents: number;
    }>;
  };
  roi: {
    averageROI: number;
    medianROI: number;
    topPerformingLicenses: Array<{
      licenseId: string;
      roiPercentage: number;
      revenueCents: number;
    }>;
    underperformingLicenses: Array<{
      licenseId: string;
      roiPercentage: number;
      revenueCents: number;
      reasons: string[];
    }>;
  };
  utilization: {
    averageUtilization: number;
    overUtilizedCount: number;
    underUtilizedCount: number;
    wellUtilizedCount: number;
  };
  conflicts: {
    conflictRate: number;
    averageResolutionTime: number;
    conflictTrend: 'increasing' | 'decreasing' | 'stable';
  };
  approvals: {
    averageApprovalTime: number; // hours
    medianApprovalTime: number;
    bottlenecks: string[];
    approvalsByStage: Record<string, number>;
  };
  renewals: {
    renewalRate: number;
    revenueRetentionRate: number;
  };
}

export class LicensePerformanceMetricsService {
  /**
   * Calculate ROI for a single license
   */
  async calculateLicenseROI(licenseId: string): Promise<LicenseROIMetrics> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        royaltyLines: {
          include: {
            royaltyStatement: true,
          },
        },
        dailyMetrics: true,
        ipAsset: true,
        brand: true,
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Calculate total revenue from royalty lines and daily metrics
    const royaltyRevenue = license.royaltyLines.reduce(
      (sum, line) => sum + line.calculatedRoyaltyCents,
      0
    );
    const dailyMetricsRevenue = license.dailyMetrics.reduce(
      (sum, metric) => sum + metric.revenueCents,
      0
    );
    const totalRevenueCents = license.feeCents + royaltyRevenue + dailyMetricsRevenue;

    // Calculate total costs (initial license fee + platform fees + transaction costs)
    // For now, assuming costs are primarily the revenue share paid to creators
    const totalCostCents = license.feeCents + royaltyRevenue;

    // Calculate ROI: (Revenue - Cost) / Cost * 100
    const roiPercentage = totalCostCents > 0 
      ? ((totalRevenueCents - totalCostCents) / totalCostCents) * 100 
      : 0;

    // Calculate break-even date and days to break-even
    let breakEvenDate: Date | null = null;
    let daysToBreakEven: number | null = null;

    if (license.dailyMetrics.length > 0) {
      // Sort metrics by date
      const sortedMetrics = [...license.dailyMetrics].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      );

      let cumulativeRevenue = license.feeCents;
      for (const metric of sortedMetrics) {
        cumulativeRevenue += metric.revenueCents;
        if (cumulativeRevenue >= totalCostCents) {
          breakEvenDate = metric.date;
          daysToBreakEven = differenceInDays(breakEvenDate, license.startDate);
          break;
        }
      }
    }

    // Calculate projected annual ROI
    const daysActive = differenceInDays(new Date(), license.startDate);
    const revenuePerDay = daysActive > 0 ? totalRevenueCents / daysActive : 0;
    const projectedAnnualRevenue = revenuePerDay * 365;
    const projectedAnnualROI = totalCostCents > 0 
      ? ((projectedAnnualRevenue - totalCostCents) / totalCostCents) * 100 
      : 0;

    // Calculate revenue growth rate (comparing last 30 days to previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const sixtyDaysAgo = subDays(now, 60);

    const recentMetrics = license.dailyMetrics.filter(
      (m) => m.date >= thirtyDaysAgo && m.date <= now
    );
    const previousMetrics = license.dailyMetrics.filter(
      (m) => m.date >= sixtyDaysAgo && m.date < thirtyDaysAgo
    );

    const recentRevenue = recentMetrics.reduce((sum, m) => sum + m.revenueCents, 0);
    const previousRevenue = previousMetrics.reduce((sum, m) => sum + m.revenueCents, 0);

    const revenueGrowthRate = previousRevenue > 0 
      ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    return {
      licenseId,
      totalRevenueCents,
      totalCostCents,
      roiPercentage,
      breakEvenDate,
      daysToBreakEven,
      projectedAnnualROI,
      revenueGrowthRate,
    };
  }

  /**
   * Calculate utilization metrics for a license
   */
  async calculateLicenseUtilization(licenseId: string): Promise<LicenseUtilizationMetrics> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        events: {
          where: {
            eventType: { in: ['asset_viewed', 'asset_downloaded', 'license_clicked'] },
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const scope = license.scopeJson as unknown as LicenseScope;
    
    // Calculate actual usage count from events
    const actualUsageCount = license.events.length;

    // Determine scope limit based on license scope
    // This is a placeholder - actual limits would be defined in scope
    let scopeLimitCount: number | null = null;
    
    // Example: If scope has a maxImpressions or similar limit
    const metadata = license.metadata as any;
    if (metadata?.usageLimits) {
      scopeLimitCount = metadata.usageLimits.maxUsageCount || null;
    }

    // Calculate utilization percentage
    const utilizationPercentage = scopeLimitCount 
      ? Math.min((actualUsageCount / scopeLimitCount) * 100, 100) 
      : 0; // If unlimited, we can't calculate percentage

    // Calculate remaining capacity
    const remainingCapacity = scopeLimitCount 
      ? Math.max(scopeLimitCount - actualUsageCount, 0) 
      : null;

    // Determine utilization trend (comparing last 30 days to previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const sixtyDaysAgo = subDays(now, 60);

    const recentUsage = license.events.filter(
      (e: any) => e.occurredAt >= thirtyDaysAgo && e.occurredAt <= now
    ).length;
    const previousUsage = license.events.filter(
      (e: any) => e.occurredAt >= sixtyDaysAgo && e.occurredAt < thirtyDaysAgo
    ).length;

    let utilizationTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentUsage > previousUsage * 1.1) {
      utilizationTrend = 'increasing';
    } else if (recentUsage < previousUsage * 0.9) {
      utilizationTrend = 'decreasing';
    }

    // Determine if over/under utilized
    const isOverUtilized = scopeLimitCount ? utilizationPercentage > 100 : false;
    const isUnderUtilized = scopeLimitCount ? utilizationPercentage < 20 : actualUsageCount < 10;

    // Calculate usage by type
    const usageByType: Record<string, number> = {};
    license.events.forEach((event: any) => {
      usageByType[event.eventType] = (usageByType[event.eventType] || 0) + 1;
    });

    return {
      licenseId,
      utilizationPercentage,
      actualUsageCount,
      scopeLimitCount,
      remainingCapacity,
      utilizationTrend,
      isOverUtilized,
      isUnderUtilized,
      usageByType,
    };
  }

  /**
   * Calculate approval time metrics for a license
   */
  async calculateApprovalTimeMetrics(licenseId: string): Promise<ApprovalTimeMetrics> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const createdAt = license.createdAt;
    const signedAt = license.signedAt;

    let approvalDurationHours: number | null = null;
    let approvalDurationDays: number | null = null;

    if (signedAt) {
      approvalDurationHours = differenceInHours(signedAt, createdAt);
      approvalDurationDays = differenceInDays(signedAt, createdAt);
    }

    // Determine approval stage
    let approvalStage: 'created' | 'pending_approval' | 'approved' | 'expired' = 'created';
    if (signedAt) {
      approvalStage = 'approved';
    } else if (license.status === 'ACTIVE') {
      approvalStage = 'pending_approval';
    } else if (license.status === 'EXPIRED') {
      approvalStage = 'expired';
    }

    // Identify bottlenecks based on approval duration
    const bottlenecks: string[] = [];

    // Check if still pending for too long
    if (!signedAt && approvalDurationHours && approvalDurationHours > 168) { // 7 days
      bottlenecks.push(`License has been pending for ${Math.round(approvalDurationHours / 24)} days`);
    }

    return {
      licenseId,
      createdAt,
      signedAt,
      approvalDurationHours,
      approvalDurationDays,
      status: license.status,
      approvalStage,
      bottlenecks,
    };
  }

  /**
   * Calculate conflict rate metrics for a time period
   */
  async calculateConflictRateMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<ConflictRateMetrics> {
    // Get all licenses created in the period
    const licenses = await prisma.license.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        deletedAt: null,
      },
      include: {
        ipAsset: true,
      },
    });

    const totalLicensesCreated = licenses.length;

    // Count conflicts from metadata (stored when conflicts are detected)
    let totalConflictsDetected = 0;
    const conflictsByType: Record<string, number> = {};
    const conflictsBySeverity = {
      critical: 0,
      warning: 0,
      info: 0,
    };

    const assetConflictCounts = new Map<string, { id: string; title: string; count: number }>();

    for (const license of licenses) {
      const metadata = license.metadata as any;
      if (metadata?.conflicts && Array.isArray(metadata.conflicts)) {
        totalConflictsDetected += metadata.conflicts.length;

        metadata.conflicts.forEach((conflict: any) => {
          // Count by type
          const conflictType = conflict.reason || 'UNKNOWN';
          conflictsByType[conflictType] = (conflictsByType[conflictType] || 0) + 1;

          // Count by severity
          if (conflict.severity === 'critical') {
            conflictsBySeverity.critical++;
          } else if (conflict.severity === 'warning') {
            conflictsBySeverity.warning++;
          } else {
            conflictsBySeverity.info++;
          }
        });

        // Track asset conflict counts
        const assetId = license.ipAssetId;
        const existing = assetConflictCounts.get(assetId);
        if (existing) {
          existing.count += metadata.conflicts.length;
        } else if (license.ipAsset) {
          assetConflictCounts.set(assetId, {
            id: assetId,
            title: license.ipAsset.title,
            count: metadata.conflicts.length,
          });
        }
      }
    }

    const conflictRate = totalLicensesCreated > 0 
      ? (totalConflictsDetected / totalLicensesCreated) * 100 
      : 0;

    // Get top conflicting assets
    const topConflictingAssets = Array.from(assetConflictCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((asset) => ({
        ipAssetId: asset.id,
        ipAssetTitle: asset.title,
        conflictCount: asset.count,
      }));

    // Calculate average resolution time (placeholder - would need conflict resolution tracking)
    const resolutionTimeAvg = 48; // hours - placeholder

    return {
      period: { start: startDate, end: endDate },
      totalLicensesCreated,
      totalConflictsDetected,
      conflictRate,
      conflictsByType,
      conflictsBySeverity,
      topConflictingAssets,
      resolutionTimeAvg,
    };
  }

  /**
   * Calculate aggregated performance metrics for a period
   */
  async calculateAggregatedMetrics(
    startDate: Date,
    endDate: Date,
    granularity: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<AggregatedPerformanceMetrics> {
    const cacheKey = `license:metrics:aggregated:${format(startDate, 'yyyy-MM-dd')}:${format(endDate, 'yyyy-MM-dd')}:${granularity}`;
    
    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get all active licenses in the period
    const licenses = await prisma.license.findMany({
      where: {
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          {
            createdAt: { gte: startDate, lte: endDate },
          },
        ],
        deletedAt: null,
      },
      include: {
        royaltyLines: true,
        dailyMetrics: true,
        ipAsset: true,
        brand: true,
        renewals: true,
      },
    });

    // Revenue metrics
    const totalRevenueCents = licenses.reduce((sum, l) => {
      const licenseRevenue = l.feeCents + 
        l.royaltyLines.reduce((s, line) => s + line.calculatedRoyaltyCents, 0) +
        l.dailyMetrics.reduce((s, metric) => s + metric.revenueCents, 0);
      return sum + licenseRevenue;
    }, 0);

    const averageRevenuePerLicense = licenses.length > 0 
      ? totalRevenueCents / licenses.length 
      : 0;

    // Calculate revenue growth (compare to previous period)
    const periodDuration = differenceInDays(endDate, startDate);
    const previousStart = subDays(startDate, periodDuration);
    const previousEnd = subDays(endDate, periodDuration);

    const previousLicenses = await prisma.license.findMany({
      where: {
        OR: [
          {
            startDate: { lte: previousEnd },
            endDate: { gte: previousStart },
          },
          {
            createdAt: { gte: previousStart, lte: previousEnd },
          },
        ],
        deletedAt: null,
      },
      include: {
        royaltyLines: true,
        dailyMetrics: true,
      },
    });

    const previousRevenue = previousLicenses.reduce((sum, l) => {
      return sum + l.feeCents + 
        l.royaltyLines.reduce((s, line) => s + line.calculatedRoyaltyCents, 0) +
        l.dailyMetrics.reduce((s, metric) => s + metric.revenueCents, 0);
    }, 0);

    const revenueGrowthPercent = previousRevenue > 0 
      ? ((totalRevenueCents - previousRevenue) / previousRevenue) * 100 
      : 0;

    // Top revenue generators
    const licenseRevenues = licenses.map((l) => ({
      licenseId: l.id,
      brandName: l.brand?.companyName || 'Unknown',
      ipAssetTitle: l.ipAsset?.title || 'Unknown',
      revenueCents: l.feeCents + 
        l.royaltyLines.reduce((s, line) => s + line.calculatedRoyaltyCents, 0) +
        l.dailyMetrics.reduce((s, metric) => s + metric.revenueCents, 0),
    }));

    const topRevenueGenerators = licenseRevenues
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10);

    // ROI metrics
    const roiValues: number[] = [];
    const topROILicenses: Array<{
      licenseId: string;
      roiPercentage: number;
      revenueCents: number;
    }> = [];
    const underperformingLicenses: Array<{
      licenseId: string;
      roiPercentage: number;
      revenueCents: number;
      reasons: string[];
    }> = [];

    for (const license of licenses) {
      const revenue = licenseRevenues.find((lr) => lr.licenseId === license.id)?.revenueCents || 0;
      const cost = license.feeCents + 
        license.royaltyLines.reduce((s, line) => s + line.calculatedRoyaltyCents, 0);
      
      const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
      roiValues.push(roi);

      if (roi > 50) {
        topROILicenses.push({
          licenseId: license.id,
          roiPercentage: roi,
          revenueCents: revenue,
        });
      } else if (roi < 0) {
        const reasons: string[] = [];
        if (revenue === 0) reasons.push('No revenue generated');
        if (differenceInDays(new Date(), license.startDate) < 30) {
          reasons.push('License is still new');
        }
        underperformingLicenses.push({
          licenseId: license.id,
          roiPercentage: roi,
          revenueCents: revenue,
          reasons,
        });
      }
    }

    const averageROI = roiValues.length > 0 
      ? roiValues.reduce((sum, v) => sum + v, 0) / roiValues.length 
      : 0;
    
    roiValues.sort((a, b) => a - b);
    const medianROI = roiValues.length > 0 
      ? roiValues[Math.floor(roiValues.length / 2)] 
      : 0;

    topROILicenses.sort((a, b) => b.roiPercentage - a.roiPercentage);

    // Utilization metrics (simplified - would need full calculation for each license)
    const averageUtilization = 65; // Placeholder
    const overUtilizedCount = licenses.filter((l) => (l.metadata as any)?.performanceMetrics?.utilization?.isOverUtilized).length;
    const underUtilizedCount = licenses.filter((l) => (l.metadata as any)?.performanceMetrics?.utilization?.isUnderUtilized).length;
    const wellUtilizedCount = licenses.length - overUtilizedCount - underUtilizedCount;

    // Conflict metrics
    const conflictMetrics = await this.calculateConflictRateMetrics(startDate, endDate);

    // Determine conflict trend
    const previousConflictMetrics = await this.calculateConflictRateMetrics(
      previousStart,
      previousEnd
    );
    let conflictTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (conflictMetrics.conflictRate > previousConflictMetrics.conflictRate * 1.1) {
      conflictTrend = 'increasing';
    } else if (conflictMetrics.conflictRate < previousConflictMetrics.conflictRate * 0.9) {
      conflictTrend = 'decreasing';
    }

    // Approval metrics
    const approvalTimes: number[] = [];
    const bottleneckCounts: Record<string, number> = {};
    const approvalsByStage: Record<string, number> = {
      created: 0,
      pending_approval: 0,
      approved: 0,
      expired: 0,
    };

    for (const license of licenses) {
      if (license.signedAt) {
        const hours = differenceInHours(license.signedAt, license.createdAt);
        approvalTimes.push(hours);
        approvalsByStage.approved++;
      } else if (license.status === 'ACTIVE') {
        approvalsByStage.pending_approval++;
      } else if (license.status === 'EXPIRED') {
        approvalsByStage.expired++;
      } else {
        approvalsByStage.created++;
      }
    }

    const averageApprovalTime = approvalTimes.length > 0 
      ? approvalTimes.reduce((sum, t) => sum + t, 0) / approvalTimes.length 
      : 0;

    approvalTimes.sort((a, b) => a - b);
    const medianApprovalTime = approvalTimes.length > 0 
      ? approvalTimes[Math.floor(approvalTimes.length / 2)] 
      : 0;

    const bottlenecks = Object.entries(bottleneckCounts)
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0]);

    // Renewal metrics
    const expiredLicenses = licenses.filter((l) => l.status === 'EXPIRED' || l.endDate < new Date());
    const renewedLicenses = expiredLicenses.filter((l) => l.renewals && l.renewals.length > 0);
    const renewalRate = expiredLicenses.length > 0 
      ? (renewedLicenses.length / expiredLicenses.length) * 100 
      : 0;

    const originalRevenue = expiredLicenses.reduce((sum, l) => sum + l.feeCents, 0);
    const renewalRevenue = renewedLicenses.reduce((sum, l) => {
      return sum + (l.renewals?.[0]?.feeCents || 0);
    }, 0);
    const revenueRetentionRate = originalRevenue > 0 
      ? (renewalRevenue / originalRevenue) * 100 
      : 0;

    const result: AggregatedPerformanceMetrics = {
      period: {
        start: startDate,
        end: endDate,
        granularity,
      },
      revenue: {
        totalRevenueCents,
        averageRevenuePerLicense,
        revenueGrowthPercent,
        topRevenueGenerators,
      },
      roi: {
        averageROI,
        medianROI,
        topPerformingLicenses: topROILicenses.slice(0, 10),
        underperformingLicenses: underperformingLicenses.slice(0, 10),
      },
      utilization: {
        averageUtilization,
        overUtilizedCount,
        underUtilizedCount,
        wellUtilizedCount,
      },
      conflicts: {
        conflictRate: conflictMetrics.conflictRate,
        averageResolutionTime: conflictMetrics.resolutionTimeAvg,
        conflictTrend,
      },
      approvals: {
        averageApprovalTime,
        medianApprovalTime,
        bottlenecks,
        approvalsByStage,
      },
      renewals: {
        renewalRate,
        revenueRetentionRate,
      },
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    return result;
  }

  /**
   * Store aggregated metrics to database for historical tracking
   */
  async storeMetricsSnapshot(
    date: Date,
    granularity: 'daily' | 'weekly' | 'monthly',
    metrics: AggregatedPerformanceMetrics
  ): Promise<void> {
    // Store in daily_metrics table with special marker
    await prisma.dailyMetric.upsert({
      where: {
        date_projectId_ipAssetId_licenseId: {
          date: startOfDay(date),
          projectId: '',
          ipAssetId: '',
          licenseId: '',
        },
      },
      update: {
        metadata: {
          metricsType: 'license_performance',
          granularity,
          ...metrics,
        } as any,
        updatedAt: new Date(),
      },
      create: {
        date: startOfDay(date),
        projectId: '',
        ipAssetId: '',
        licenseId: '',
        views: 0,
        clicks: 0,
        conversions: 0,
        revenueCents: metrics.revenue.totalRevenueCents,
        uniqueVisitors: 0,
        engagementTime: 0,
        metadata: {
          metricsType: 'license_performance',
          granularity,
          ...metrics,
        } as any,
      },
    });
  }

  /**
   * Get historical performance metrics
   */
  async getHistoricalMetrics(
    startDate: Date,
    endDate: Date,
    granularity: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<AggregatedPerformanceMetrics[]> {
    const metrics = await prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
        projectId: null,
        ipAssetId: null,
        licenseId: null,
        metadata: {
          path: ['metricsType'],
          equals: 'license_performance',
        },
      },
      orderBy: { date: 'asc' },
    });

    return metrics
      .filter((m) => {
        const meta = m.metadata as any;
        return meta?.granularity === granularity;
      })
      .map((m) => m.metadata as any);
  }
}

export const licensePerformanceMetricsService = new LicensePerformanceMetricsService();
