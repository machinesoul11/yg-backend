/**
 * Platform Licenses Analytics Service
 * Provides license analytics including active counts and renewal rates for admin users
 */

import { PrismaClient, LicenseStatus, LicenseType } from '@prisma/client';
import type { Redis } from 'ioredis';

/**
 * Date Range Interface
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Granularity Type
 */
export type Granularity = 'daily' | 'weekly' | 'monthly';

/**
 * License Count by Status
 */
interface LicenseStatusCount {
  status: LicenseStatus;
  count: number;
  percentage: number;
}

/**
 * Renewal Rate Data Point
 */
interface RenewalRatePoint {
  date: string;
  totalExpired: number;
  renewed: number;
  renewalRate: number;
  earlyRenewals: number;
  lateRenewals: number;
}

/**
 * Expiration Forecast
 */
interface ExpirationForecast {
  period: string;
  daysFromNow: number;
  expiringCount: number;
  licenses: Array<{
    id: string;
    endDate: string;
    type: LicenseType;
    feeCents: number;
    autoRenew: boolean;
  }>;
}

/**
 * Revenue Metrics
 */
interface RevenueMetrics {
  totalRevenueCents: number;
  averageLicenseValueCents: number;
  medianLicenseValueCents: number;
  revenueByType: Record<string, number>;
  projectedAnnualRevenueCents: number;
}

/**
 * License Analytics Response
 */
export interface LicenseAnalytics {
  dateRange: {
    start: string;
    end: string;
  };
  granularity: Granularity;
  activeCount: number;
  statusBreakdown: LicenseStatusCount[];
  renewalRates: RenewalRatePoint[];
  expirationForecast: ExpirationForecast[];
  revenueMetrics: RevenueMetrics;
  summary: {
    totalLicenses: number;
    activePercentage: number;
    averageRenewalRate: number;
    averageLicenseDurationDays: number;
    autoRenewPercentage: number;
    comparisonToPreviousPeriod: {
      activeLicensesChange: number;
      renewalRateChange: number;
      revenueChange: number;
    };
  };
  metadata: {
    cached: boolean;
    cacheTimestamp?: string;
    queryExecutionTimeMs?: number;
  };
}

/**
 * Filter Options
 */
export interface LicenseAnalyticsFilters {
  licenseType?: LicenseType;
  brandId?: string;
  projectId?: string;
}

export class PlatformLicensesAnalyticsService {
  private readonly CACHE_PREFIX = 'analytics:platform:licenses';
  private readonly CACHE_TTL = 600; // 10 minutes
  private readonly RENEWAL_GRACE_PERIOD_DAYS = 30;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get comprehensive license analytics
   */
  async getLicenseAnalytics(
    dateRange: DateRange,
    granularity: Granularity = 'daily',
    filters: LicenseAnalyticsFilters = {}
  ): Promise<LicenseAnalytics> {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(dateRange, granularity, filters);
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return {
        ...data,
        metadata: {
          ...data.metadata,
          cached: true,
          cacheTimestamp: new Date().toISOString(),
        },
      };
    }

    // Calculate previous period for comparison
    const previousRange = this.getPreviousPeriod(dateRange);

    // Execute queries in parallel
    const [
      activeCount,
      statusBreakdown,
      renewalRates,
      expirationForecast,
      revenueMetrics,
      currentPeriodStats,
      previousPeriodStats,
    ] = await Promise.all([
      this.getActiveLicenseCount(filters),
      this.getStatusBreakdown(filters),
      this.getRenewalRates(dateRange, granularity, filters),
      this.getExpirationForecast(filters),
      this.getRevenueMetrics(dateRange, filters),
      this.getPeriodStatistics(dateRange, filters),
      this.getPeriodStatistics(previousRange, filters),
    ]);

    // Calculate changes from previous period
    const activeLicensesChange = previousPeriodStats.activeLicenses > 0
      ? ((activeCount - previousPeriodStats.activeLicenses) / previousPeriodStats.activeLicenses) * 100
      : 0;

    const renewalRateChange = previousPeriodStats.averageRenewalRate > 0
      ? currentPeriodStats.averageRenewalRate - previousPeriodStats.averageRenewalRate
      : 0;

    const revenueChange = previousPeriodStats.totalRevenueCents > 0
      ? ((revenueMetrics.totalRevenueCents - previousPeriodStats.totalRevenueCents) / previousPeriodStats.totalRevenueCents) * 100
      : 0;

    const totalLicenses = statusBreakdown.reduce((sum, item) => sum + item.count, 0);
    const activePercentage = totalLicenses > 0 ? (activeCount / totalLicenses) * 100 : 0;

    const result: LicenseAnalytics = {
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      granularity,
      activeCount,
      statusBreakdown,
      renewalRates,
      expirationForecast,
      revenueMetrics,
      summary: {
        totalLicenses,
        activePercentage: Math.round(activePercentage * 100) / 100,
        averageRenewalRate: currentPeriodStats.averageRenewalRate,
        averageLicenseDurationDays: currentPeriodStats.averageDurationDays,
        autoRenewPercentage: currentPeriodStats.autoRenewPercentage,
        comparisonToPreviousPeriod: {
          activeLicensesChange: Math.round(activeLicensesChange * 100) / 100,
          renewalRateChange: Math.round(renewalRateChange * 100) / 100,
          revenueChange: Math.round(revenueChange * 100) / 100,
        },
      },
      metadata: {
        cached: false,
        queryExecutionTimeMs: Date.now() - startTime,
      },
    };

    // Cache the result
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Get current active license count
   */
  private async getActiveLicenseCount(filters: LicenseAnalyticsFilters): Promise<number> {
    const whereConditions: any = {
      status: {
        in: ['ACTIVE', 'EXPIRING_SOON'],
      },
      deletedAt: null,
    };

    if (filters.licenseType) {
      whereConditions.licenseType = filters.licenseType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    if (filters.projectId) {
      whereConditions.projectId = filters.projectId;
    }

    return await this.prisma.license.count({
      where: whereConditions,
    });
  }

  /**
   * Get license status breakdown
   */
  private async getStatusBreakdown(filters: LicenseAnalyticsFilters): Promise<LicenseStatusCount[]> {
    const whereConditions: any = {
      deletedAt: null,
    };

    if (filters.licenseType) {
      whereConditions.licenseType = filters.licenseType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    if (filters.projectId) {
      whereConditions.projectId = filters.projectId;
    }

    const statusCounts = await this.prisma.license.groupBy({
      by: ['status'],
      where: whereConditions,
      _count: true,
    });

    const totalCount = statusCounts.reduce((sum, item) => {
      const count = typeof item._count === 'object' && item._count !== null && '_all' in item._count 
        ? (item._count as any)._all 
        : (typeof item._count === 'number' ? item._count : 0);
      return sum + count;
    }, 0);

    return statusCounts.map((item) => {
      const count = typeof item._count === 'object' && item._count !== null && '_all' in item._count 
        ? (item._count as any)._all 
        : (typeof item._count === 'number' ? item._count : 0);
      
      return {
        status: item.status,
        count,
        percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
      };
    });
  }

  /**
   * Get renewal rates over time
   */
  private async getRenewalRates(
    dateRange: DateRange,
    granularity: Granularity,
    filters: LicenseAnalyticsFilters
  ): Promise<RenewalRatePoint[]> {
    const sqlGranularity = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month';

    // Get licenses that expired during the period
    const expiredLicenses: any[] = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${sqlGranularity}, end_date) as date,
        id,
        end_date,
        deleted_at
      FROM licenses
      WHERE end_date >= ${dateRange.start}
        AND end_date <= ${dateRange.end}
        ${filters.licenseType ? this.prisma.$queryRawUnsafe(`AND license_type = '${filters.licenseType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
      ORDER BY end_date
    `;

    // Get renewed licenses (those with parent_license_id)
    const renewedLicenses: any[] = await this.prisma.$queryRaw`
      SELECT 
        l.id,
        l.parent_license_id,
        l.start_date,
        p.end_date as parent_end_date
      FROM licenses l
      INNER JOIN licenses p ON l.parent_license_id = p.id
      WHERE p.end_date >= ${dateRange.start}
        AND p.end_date <= ${dateRange.end}
        AND l.deleted_at IS NULL
        ${filters.licenseType ? this.prisma.$queryRawUnsafe(`AND l.license_type = '${filters.licenseType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND l.brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND l.project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Create renewal map
    const renewalMap = new Map<string, { early: boolean; late: boolean }>();
    renewedLicenses.forEach((renewal) => {
      const parentEndDate = new Date(renewal.parent_end_date);
      const renewalStartDate = new Date(renewal.start_date);
      const daysDiff = Math.floor((renewalStartDate.getTime() - parentEndDate.getTime()) / (1000 * 60 * 60 * 24));

      renewalMap.set(renewal.parent_license_id, {
        early: daysDiff < 0,
        late: daysDiff > this.RENEWAL_GRACE_PERIOD_DAYS,
      });
    });

    // Group by date period
    const dateMap = new Map<string, {
      totalExpired: number;
      renewed: number;
      earlyRenewals: number;
      lateRenewals: number;
    }>();

    expiredLicenses.forEach((license) => {
      const dateKey = license.date.toISOString().split('T')[0];
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          totalExpired: 0,
          renewed: 0,
          earlyRenewals: 0,
          lateRenewals: 0,
        });
      }

      const point = dateMap.get(dateKey)!;
      point.totalExpired += 1;

      const renewalInfo = renewalMap.get(license.id);
      if (renewalInfo) {
        point.renewed += 1;
        if (renewalInfo.early) point.earlyRenewals += 1;
        if (renewalInfo.late) point.lateRenewals += 1;
      }
    });

    return Array.from(dateMap.entries()).map(([date, data]) => ({
      date,
      totalExpired: data.totalExpired,
      renewed: data.renewed,
      renewalRate: data.totalExpired > 0 ? (data.renewed / data.totalExpired) * 100 : 0,
      earlyRenewals: data.earlyRenewals,
      lateRenewals: data.lateRenewals,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get expiration forecast for upcoming periods
   */
  private async getExpirationForecast(filters: LicenseAnalyticsFilters): Promise<ExpirationForecast[]> {
    const now = new Date();
    const forecasts: ExpirationForecast[] = [];

    // Define forecast periods: 30, 60, 90 days
    const periods = [
      { label: '30 days', days: 30 },
      { label: '60 days', days: 60 },
      { label: '90 days', days: 90 },
    ];

    for (const period of periods) {
      const forecastDate = new Date(now);
      forecastDate.setDate(forecastDate.getDate() + period.days);

      const whereConditions: any = {
        endDate: {
          gte: now,
          lte: forecastDate,
        },
        status: {
          in: ['ACTIVE', 'EXPIRING_SOON'],
        },
        deletedAt: null,
      };

      if (filters.licenseType) {
        whereConditions.licenseType = filters.licenseType;
      }

      if (filters.brandId) {
        whereConditions.brandId = filters.brandId;
      }

      if (filters.projectId) {
        whereConditions.projectId = filters.projectId;
      }

      const expiringLicenses = await this.prisma.license.findMany({
        where: whereConditions,
        select: {
          id: true,
          endDate: true,
          licenseType: true,
          feeCents: true,
          autoRenew: true,
        },
        orderBy: {
          endDate: 'asc',
        },
      });

      forecasts.push({
        period: period.label,
        daysFromNow: period.days,
        expiringCount: expiringLicenses.length,
        licenses: expiringLicenses.map((license) => ({
          id: license.id,
          endDate: license.endDate.toISOString(),
          type: license.licenseType,
          feeCents: license.feeCents,
          autoRenew: license.autoRenew,
        })),
      });
    }

    return forecasts;
  }

  /**
   * Get revenue metrics
   */
  private async getRevenueMetrics(
    dateRange: DateRange,
    filters: LicenseAnalyticsFilters
  ): Promise<RevenueMetrics> {
    const whereConditions: any = {
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      status: {
        not: 'DRAFT',
      },
      deletedAt: null,
    };

    if (filters.licenseType) {
      whereConditions.licenseType = filters.licenseType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    if (filters.projectId) {
      whereConditions.projectId = filters.projectId;
    }

    // Get aggregate revenue
    const revenueStats = await this.prisma.license.aggregate({
      where: whereConditions,
      _sum: {
        feeCents: true,
      },
      _avg: {
        feeCents: true,
      },
    });

    // Get median using raw query
    const medianResult: any[] = await this.prisma.$queryRaw`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fee_cents)::bigint as median_fee
      FROM licenses
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND status != 'DRAFT'
        AND deleted_at IS NULL
        ${filters.licenseType ? this.prisma.$queryRawUnsafe(`AND license_type = '${filters.licenseType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Get revenue by type
    const revenueByType = await this.prisma.license.groupBy({
      by: ['licenseType'],
      where: whereConditions,
      _sum: {
        feeCents: true,
      },
    });

    const revenueByTypeMap: Record<string, number> = {};
    revenueByType.forEach((item) => {
      const sum = item._sum.feeCents || 0;
      revenueByTypeMap[item.licenseType] = Number(sum);
    });

    // Calculate projected annual revenue (extrapolate from current period)
    const totalRevenueCents = Number(revenueStats._sum.feeCents || 0);
    const periodDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const projectedAnnualRevenueCents = periodDays > 0 ? (totalRevenueCents / periodDays) * 365 : 0;

    return {
      totalRevenueCents,
      averageLicenseValueCents: Number(revenueStats._avg.feeCents || 0),
      medianLicenseValueCents: Number(medianResult[0]?.median_fee || 0),
      revenueByType: revenueByTypeMap,
      projectedAnnualRevenueCents: Math.round(projectedAnnualRevenueCents),
    };
  }

  /**
   * Get period statistics
   */
  private async getPeriodStatistics(
    dateRange: DateRange,
    filters: LicenseAnalyticsFilters
  ): Promise<{
    activeLicenses: number;
    averageRenewalRate: number;
    averageDurationDays: number;
    autoRenewPercentage: number;
    totalRevenueCents: number;
  }> {
    const whereConditions: any = {
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      deletedAt: null,
    };

    if (filters.licenseType) {
      whereConditions.licenseType = filters.licenseType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    if (filters.projectId) {
      whereConditions.projectId = filters.projectId;
    }

    // Get active licenses at end of period
    const activeLicenses = await this.prisma.license.count({
      where: {
        ...whereConditions,
        status: {
          in: ['ACTIVE', 'EXPIRING_SOON'],
        },
      },
    });

    // Calculate average renewal rate
    const renewalRates = await this.getRenewalRates(dateRange, 'monthly', filters);
    const averageRenewalRate = renewalRates.length > 0
      ? renewalRates.reduce((sum, point) => sum + point.renewalRate, 0) / renewalRates.length
      : 0;

    // Calculate average license duration
    const durationResult: any[] = await this.prisma.$queryRaw`
      SELECT AVG(EXTRACT(DAY FROM (end_date - start_date)))::int as avg_duration
      FROM licenses
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND deleted_at IS NULL
        ${filters.licenseType ? this.prisma.$queryRawUnsafe(`AND license_type = '${filters.licenseType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.projectId ? this.prisma.$queryRawUnsafe(`AND project_id = '${filters.projectId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Get auto-renew percentage
    const totalLicenses = await this.prisma.license.count({
      where: whereConditions,
    });

    const autoRenewCount = await this.prisma.license.count({
      where: {
        ...whereConditions,
        autoRenew: true,
      },
    });

    const autoRenewPercentage = totalLicenses > 0 ? (autoRenewCount / totalLicenses) * 100 : 0;

    // Get total revenue
    const revenueStats = await this.prisma.license.aggregate({
      where: {
        ...whereConditions,
        status: {
          not: 'DRAFT',
        },
      },
      _sum: {
        feeCents: true,
      },
    });

    return {
      activeLicenses,
      averageRenewalRate: Math.round(averageRenewalRate * 100) / 100,
      averageDurationDays: durationResult[0]?.avg_duration || 0,
      autoRenewPercentage: Math.round(autoRenewPercentage * 100) / 100,
      totalRevenueCents: Number(revenueStats._sum.feeCents || 0),
    };
  }

  /**
   * Get previous period for comparison
   */
  private getPreviousPeriod(dateRange: DateRange): DateRange {
    const duration = dateRange.end.getTime() - dateRange.start.getTime();
    
    const end = new Date(dateRange.start);
    end.setMilliseconds(-1);
    
    const start = new Date(end);
    start.setMilliseconds(-duration);

    return { start, end };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(
    dateRange: DateRange,
    granularity: Granularity,
    filters: LicenseAnalyticsFilters
  ): string {
    const parts = [
      this.CACHE_PREFIX,
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0],
      granularity,
    ];

    if (filters.licenseType) parts.push(`type:${filters.licenseType}`);
    if (filters.brandId) parts.push(`brand:${filters.brandId}`);
    if (filters.projectId) parts.push(`project:${filters.projectId}`);

    return parts.join(':');
  }

  /**
   * Invalidate cache
   */
  async invalidateCache(pattern?: string): Promise<void> {
    const searchPattern = pattern || `${this.CACHE_PREFIX}:*`;
    const keys = await this.redis.keys(searchPattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
