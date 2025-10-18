/**
 * Platform Analytics Service
 * Provides platform-wide analytics for admin users including user metrics,
 * engagement analytics, and cohort analysis
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { TRPCError } from '@trpc/server';

/**
 * Date Range Interface
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Period Type
 */
export type PeriodType = 'daily' | 'weekly' | 'monthly';

/**
 * User Analytics Response
 */
export interface UserAnalytics {
  period: string;
  granularity: PeriodType;
  dateRange: {
    start: string;
    end: string;
  };
  acquisition: {
    newUsers: number;
    newUsersGrowth: number;
    timeline: Array<{
      date: string;
      count: number;
      cumulative: number;
    }>;
  };
  retention: {
    overall: number;
    cohorts: Array<{
      cohortPeriod: string;
      cohortSize: number;
      retentionRates: Array<{
        period: number;
        rate: number;
        retained: number;
      }>;
    }>;
  };
  churn: {
    churnedUsers: number;
    churnRate: number;
    timeline: Array<{
      date: string;
      churned: number;
      rate: number;
    }>;
  };
}

/**
 * Engagement Analytics Response
 */
export interface EngagementAnalytics {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  dailyActiveUsers: {
    average: number;
    peak: number;
    timeline: Array<{
      date: string;
      count: number;
    }>;
  };
  monthlyActiveUsers: {
    current: number;
    previous: number;
    growth: number;
  };
  sessionMetrics: {
    totalSessions: number;
    averageDuration: number;
    medianDuration: number;
    sessionsPerUser: number;
    timeline: Array<{
      date: string;
      sessions: number;
      avgDuration: number;
    }>;
  };
  engagement: {
    dauToMauRatio: number;
    userStickiness: number;
    avgEventsPerUser: number;
  };
}

/**
 * Cohort Analysis Response
 */
export interface CohortAnalysis {
  cohortType: 'weekly' | 'monthly';
  metric: 'retention' | 'revenue' | 'engagement';
  dateRange: {
    start: string;
    end: string;
  };
  cohorts: Array<{
    cohortPeriod: string;
    cohortSize: number;
    periods: Array<{
      period: number;
      value: number;
      percentage: number;
    }>;
  }>;
}

export class PlatformAnalyticsService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get User Analytics (Acquisition, Retention, Churn)
   */
  async getUserAnalytics(
    period: string,
    granularity: PeriodType = 'daily'
  ): Promise<UserAnalytics> {
    const cacheKey = `analytics:platform:users:${period}:${granularity}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateRange = this.getPeriodDateRange(period);
    const previousRange = this.getPreviousPeriodDateRange(period);

    // Acquisition Metrics
    const newUsers = await this.prisma.user.count({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        deleted_at: null,
      },
    });

    const previousNewUsers = await this.prisma.user.count({
      where: {
        createdAt: { gte: previousRange.start, lte: previousRange.end },
        deleted_at: null,
      },
    });

    const newUsersGrowth = previousNewUsers > 0
      ? ((newUsers - previousNewUsers) / previousNewUsers) * 100
      : 0;

    // Acquisition Timeline
    const acquisitionTimeline = await this.getAcquisitionTimeline(
      dateRange,
      granularity
    );

    // Retention Metrics
    const retentionData = await this.getRetentionMetrics(dateRange, granularity);

    // Churn Metrics
    const churnData = await this.getChurnMetrics(dateRange, granularity);

    const result: UserAnalytics = {
      period,
      granularity,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      acquisition: {
        newUsers,
        newUsersGrowth,
        timeline: acquisitionTimeline,
      },
      retention: retentionData,
      churn: churnData,
    };

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

    return result;
  }

  /**
   * Get Engagement Analytics (DAU, MAU, Sessions)
   */
  async getEngagementAnalytics(period: string): Promise<EngagementAnalytics> {
    const cacheKey = `analytics:platform:engagement:${period}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateRange = this.getPeriodDateRange(period);

    // Daily Active Users
    const dauData = await this.getDailyActiveUsers(dateRange);

    // Monthly Active Users
    const mauData = await this.getMonthlyActiveUsers(dateRange);

    // Session Metrics
    const sessionData = await this.getSessionMetrics(dateRange);

    // Engagement Metrics
    const dauToMauRatio = mauData.current > 0
      ? (dauData.average / mauData.current) * 100
      : 0;

    const totalEvents = await this.prisma.event.count({
      where: {
        occurredAt: { gte: dateRange.start, lte: dateRange.end },
        actorId: { not: null },
      },
    });

    const uniqueActiveUsers = await this.prisma.event.findMany({
      where: {
        occurredAt: { gte: dateRange.start, lte: dateRange.end },
        actorId: { not: null },
      },
      select: { actorId: true },
      distinct: ['actorId'],
    });

    const avgEventsPerUser = uniqueActiveUsers.length > 0
      ? totalEvents / uniqueActiveUsers.length
      : 0;

    const result: EngagementAnalytics = {
      period,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      dailyActiveUsers: dauData,
      monthlyActiveUsers: mauData,
      sessionMetrics: sessionData,
      engagement: {
        dauToMauRatio,
        userStickiness: dauToMauRatio,
        avgEventsPerUser,
      },
    };

    // Cache for 30 minutes
    await this.redis.setex(cacheKey, 1800, JSON.stringify(result));

    return result;
  }

  /**
   * Get Cohort Analysis
   */
  async getCohortAnalysis(
    cohortType: 'weekly' | 'monthly',
    metric: 'retention' | 'revenue' | 'engagement',
    period: string
  ): Promise<CohortAnalysis> {
    const cacheKey = `analytics:platform:cohorts:${cohortType}:${metric}:${period}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateRange = this.getPeriodDateRange(period);

    let cohorts: Array<{
      cohortPeriod: string;
      cohortSize: number;
      periods: Array<{
        period: number;
        value: number;
        percentage: number;
      }>;
    }> = [];

    switch (metric) {
      case 'retention':
        cohorts = await this.getCohortRetention(dateRange, cohortType);
        break;
      case 'revenue':
        cohorts = await this.getCohortRevenue(dateRange, cohortType);
        break;
      case 'engagement':
        cohorts = await this.getCohortEngagement(dateRange, cohortType);
        break;
    }

    const result: CohortAnalysis = {
      cohortType,
      metric,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      cohorts,
    };

    // Cache for 2 hours
    await this.redis.setex(cacheKey, 7200, JSON.stringify(result));

    return result;
  }

  /**
   * Get Acquisition Timeline
   */
  private async getAcquisitionTimeline(
    dateRange: DateRange,
    granularity: PeriodType
  ) {
    const groupByFormat = this.getDateGroupFormat(granularity);

    const results: any[] = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${granularity}, "createdAt") as date,
        COUNT(*)::int as count
      FROM users
      WHERE "createdAt" >= ${dateRange.start}
        AND "createdAt" <= ${dateRange.end}
        AND deleted_at IS NULL
      GROUP BY DATE_TRUNC(${granularity}, "createdAt")
      ORDER BY date ASC
    `;

    let cumulative = 0;
    return results.map((r) => {
      cumulative += r.count;
      return {
        date: r.date.toISOString().split('T')[0],
        count: r.count,
        cumulative,
      };
    });
  }

  /**
   * Get Retention Metrics
   */
  private async getRetentionMetrics(
    dateRange: DateRange,
    granularity: PeriodType
  ) {
    // Define activity threshold (users who logged in or created events)
    const activityThresholdDays = granularity === 'daily' ? 1 : granularity === 'weekly' ? 7 : 30;

    // Get cohorts based on signup date
    const cohortPeriod = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month';
    
    const cohorts: any[] = await this.prisma.$queryRaw`
      WITH cohorts AS (
        SELECT 
          DATE_TRUNC(${cohortPeriod}, "createdAt") as cohort_period,
          id as user_id,
          "createdAt"
        FROM users
        WHERE "createdAt" >= ${dateRange.start}
          AND "createdAt" <= ${dateRange.end}
          AND deleted_at IS NULL
      ),
      user_activity AS (
        SELECT DISTINCT
          actor_id as user_id,
          DATE_TRUNC(${cohortPeriod}, occurred_at) as activity_period
        FROM events
        WHERE occurred_at >= ${dateRange.start}
          AND actor_id IS NOT NULL
      )
      SELECT 
        c.cohort_period,
        COUNT(DISTINCT c.user_id)::int as cohort_size,
        EXTRACT(EPOCH FROM (ua.activity_period - c.cohort_period))::int / 86400 / ${activityThresholdDays} as period_number,
        COUNT(DISTINCT ua.user_id)::int as retained_users
      FROM cohorts c
      LEFT JOIN user_activity ua ON c.user_id = ua.user_id
      WHERE ua.activity_period >= c.cohort_period
      GROUP BY c.cohort_period, ua.activity_period
      ORDER BY c.cohort_period, period_number
    `;

    // Group by cohort and calculate retention rates
    const cohortMap = new Map<string, any>();

    cohorts.forEach((row) => {
      const cohortKey = row.cohort_period.toISOString().split('T')[0];
      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, {
          cohortPeriod: cohortKey,
          cohortSize: row.cohort_size,
          retentionRates: [],
        });
      }

      const cohort = cohortMap.get(cohortKey);
      const period = row.period_number || 0;
      const retained = row.retained_users || 0;
      const rate = cohort.cohortSize > 0 ? (retained / cohort.cohortSize) * 100 : 0;

      cohort.retentionRates.push({
        period,
        rate,
        retained,
      });
    });

    const cohortArray = Array.from(cohortMap.values());

    // Calculate overall retention (average of all cohorts at period 1)
    const period1Rates = cohortArray
      .map(c => c.retentionRates.find((r: any) => r.period === 1))
      .filter(Boolean)
      .map((r: any) => r.rate);

    const overall = period1Rates.length > 0
      ? period1Rates.reduce((sum, rate) => sum + rate, 0) / period1Rates.length
      : 0;

    return {
      overall,
      cohorts: cohortArray.slice(0, 10), // Return last 10 cohorts
    };
  }

  /**
   * Get Churn Metrics
   */
  private async getChurnMetrics(
    dateRange: DateRange,
    granularity: PeriodType
  ) {
    // Define churn as users who were active before the period but not during
    const churnThresholdDays = granularity === 'daily' ? 7 : granularity === 'weekly' ? 14 : 30;
    const churnDate = new Date(dateRange.start);
    churnDate.setDate(churnDate.getDate() - churnThresholdDays);

    // Get users who were active before but not during the period
    const churnedUsers: any[] = await this.prisma.$queryRaw`
      WITH active_before AS (
        SELECT DISTINCT actor_id as user_id
        FROM events
        WHERE occurred_at < ${dateRange.start}
          AND occurred_at >= ${churnDate}
          AND actor_id IS NOT NULL
      ),
      active_during AS (
        SELECT DISTINCT actor_id as user_id
        FROM events
        WHERE occurred_at >= ${dateRange.start}
          AND occurred_at <= ${dateRange.end}
          AND actor_id IS NOT NULL
      )
      SELECT COUNT(*)::int as churned_count
      FROM active_before ab
      WHERE NOT EXISTS (
        SELECT 1 FROM active_during ad WHERE ad.user_id = ab.user_id
      )
    `;

    const churnedCount = churnedUsers[0]?.churned_count || 0;

    // Get total active users at start of period
    const activeUsersAtStart: any[] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT actor_id)::int as count
      FROM events
      WHERE occurred_at < ${dateRange.start}
        AND occurred_at >= ${churnDate}
        AND actor_id IS NOT NULL
    `;

    const activeCount = activeUsersAtStart[0]?.count || 0;
    const churnRate = activeCount > 0 ? (churnedCount / activeCount) * 100 : 0;

    // Churn timeline
    const timeline: any[] = await this.prisma.$queryRaw`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC(${granularity}, ${dateRange.start}::timestamp),
          DATE_TRUNC(${granularity}, ${dateRange.end}::timestamp),
          ('1 ' || ${granularity})::interval
        ) as period_date
      ),
      period_activity AS (
        SELECT 
          DATE_TRUNC(${granularity}, occurred_at) as period,
          actor_id as user_id
        FROM events
        WHERE occurred_at >= ${churnDate}
          AND occurred_at <= ${dateRange.end}
          AND actor_id IS NOT NULL
      )
      SELECT 
        ds.period_date as date,
        0 as churned,
        0.0 as rate
      FROM date_series ds
      ORDER BY ds.period_date
    `;

    return {
      churnedUsers: churnedCount,
      churnRate,
      timeline: timeline.map((t) => ({
        date: t.date.toISOString().split('T')[0],
        churned: t.churned,
        rate: t.rate,
      })),
    };
  }

  /**
   * Get Daily Active Users
   */
  private async getDailyActiveUsers(dateRange: DateRange) {
    const dauByDate: any[] = await this.prisma.$queryRaw`
      SELECT 
        DATE(occurred_at) as date,
        COUNT(DISTINCT actor_id)::int as count
      FROM events
      WHERE occurred_at >= ${dateRange.start}
        AND occurred_at <= ${dateRange.end}
        AND actor_id IS NOT NULL
      GROUP BY DATE(occurred_at)
      ORDER BY date
    `;

    const counts = dauByDate.map(d => d.count);
    const average = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    const peak = counts.length > 0 ? Math.max(...counts) : 0;

    return {
      average: Math.round(average),
      peak,
      timeline: dauByDate.map(d => ({
        date: d.date.toISOString().split('T')[0],
        count: d.count,
      })),
    };
  }

  /**
   * Get Monthly Active Users
   */
  private async getMonthlyActiveUsers(dateRange: DateRange) {
    // Current MAU (last 30 days)
    const currentEnd = dateRange.end;
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - 30);

    const currentMAU: any[] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT actor_id)::int as count
      FROM events
      WHERE occurred_at >= ${currentStart}
        AND occurred_at <= ${currentEnd}
        AND actor_id IS NOT NULL
    `;

    // Previous MAU (30 days before current)
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - 30);

    const previousMAU: any[] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT actor_id)::int as count
      FROM events
      WHERE occurred_at >= ${previousStart}
        AND occurred_at <= ${previousEnd}
        AND actor_id IS NOT NULL
    `;

    const current = currentMAU[0]?.count || 0;
    const previous = previousMAU[0]?.count || 0;
    const growth = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    return {
      current,
      previous,
      growth,
    };
  }

  /**
   * Get Session Metrics
   */
  private async getSessionMetrics(dateRange: DateRange) {
    // Get session statistics
    const sessionStats: any[] = await this.prisma.$queryRaw`
      WITH session_durations AS (
        SELECT 
          session_id,
          COUNT(*)::int as event_count,
          EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at)))::int as duration_seconds
        FROM events
        WHERE occurred_at >= ${dateRange.start}
          AND occurred_at <= ${dateRange.end}
          AND session_id IS NOT NULL
        GROUP BY session_id
      )
      SELECT 
        COUNT(*)::int as total_sessions,
        AVG(duration_seconds)::int as avg_duration,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds)::int as median_duration
      FROM session_durations
      WHERE duration_seconds > 0
    `;

    const stats = sessionStats[0] || { total_sessions: 0, avg_duration: 0, median_duration: 0 };

    // Sessions per user
    const uniqueUsers: any[] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT actor_id)::int as count
      FROM events
      WHERE occurred_at >= ${dateRange.start}
        AND occurred_at <= ${dateRange.end}
        AND actor_id IS NOT NULL
    `;

    const userCount = uniqueUsers[0]?.count || 0;
    const sessionsPerUser = userCount > 0 ? stats.total_sessions / userCount : 0;

    // Timeline
    const timeline: any[] = await this.prisma.$queryRaw`
      WITH daily_sessions AS (
        SELECT 
          DATE(occurred_at) as date,
          session_id,
          EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at)))::int as duration_seconds
        FROM events
        WHERE occurred_at >= ${dateRange.start}
          AND occurred_at <= ${dateRange.end}
          AND session_id IS NOT NULL
        GROUP BY DATE(occurred_at), session_id
      )
      SELECT 
        date,
        COUNT(DISTINCT session_id)::int as sessions,
        AVG(duration_seconds)::int as avg_duration
      FROM daily_sessions
      WHERE duration_seconds > 0
      GROUP BY date
      ORDER BY date
    `;

    return {
      totalSessions: stats.total_sessions,
      averageDuration: stats.avg_duration,
      medianDuration: stats.median_duration,
      sessionsPerUser: Math.round(sessionsPerUser * 10) / 10,
      timeline: timeline.map(t => ({
        date: t.date.toISOString().split('T')[0],
        sessions: t.sessions,
        avgDuration: t.avg_duration,
      })),
    };
  }

  /**
   * Get Cohort Retention
   */
  private async getCohortRetention(
    dateRange: DateRange,
    cohortType: 'weekly' | 'monthly'
  ) {
    const periodType = cohortType === 'weekly' ? 'week' : 'month';
    const periodDays = cohortType === 'weekly' ? 7 : 30;

    const cohorts: any[] = await this.prisma.$queryRaw`
      WITH cohorts AS (
        SELECT 
          DATE_TRUNC(${periodType}, "createdAt") as cohort_period,
          id as user_id,
          "createdAt"
        FROM users
        WHERE "createdAt" >= ${dateRange.start}
          AND "createdAt" <= ${dateRange.end}
          AND deleted_at IS NULL
      ),
      user_activity AS (
        SELECT DISTINCT
          actor_id as user_id,
          DATE_TRUNC(${periodType}, occurred_at) as activity_period
        FROM events
        WHERE occurred_at >= ${dateRange.start}
          AND actor_id IS NOT NULL
      )
      SELECT 
        c.cohort_period,
        COUNT(DISTINCT c.user_id)::int as cohort_size,
        EXTRACT(EPOCH FROM (ua.activity_period - c.cohort_period))::int / 86400 / ${periodDays} as period_number,
        COUNT(DISTINCT ua.user_id)::int as active_users
      FROM cohorts c
      LEFT JOIN user_activity ua ON c.user_id = ua.user_id
        AND ua.activity_period >= c.cohort_period
      GROUP BY c.cohort_period, ua.activity_period
      HAVING COUNT(DISTINCT c.user_id) >= 10
      ORDER BY c.cohort_period DESC, period_number
      LIMIT 500
    `;

    return this.groupCohortData(cohorts);
  }

  /**
   * Get Cohort Revenue
   */
  private async getCohortRevenue(
    dateRange: DateRange,
    cohortType: 'weekly' | 'monthly'
  ) {
    const periodType = cohortType === 'weekly' ? 'week' : 'month';
    const periodDays = cohortType === 'weekly' ? 7 : 30;

    const cohorts: any[] = await this.prisma.$queryRaw`
      WITH cohorts AS (
        SELECT 
          DATE_TRUNC(${periodType}, "createdAt") as cohort_period,
          id as user_id
        FROM users
        WHERE "createdAt" >= ${dateRange.start}
          AND "createdAt" <= ${dateRange.end}
          AND deleted_at IS NULL
      ),
      user_revenue AS (
        SELECT 
          c.user_id,
          DATE_TRUNC(${periodType}, l."createdAt") as revenue_period,
          SUM(l."feeCents")::bigint as revenue
        FROM cohorts c
        JOIN creators cr ON cr."userId" = c.user_id
        JOIN ip_ownerships io ON io."creatorId" = cr.id
        JOIN licenses l ON l."ipAssetId" = io."ipAssetId"
        WHERE l."createdAt" >= ${dateRange.start}
        GROUP BY c.user_id, DATE_TRUNC(${periodType}, l."createdAt")
      )
      SELECT 
        c.cohort_period,
        COUNT(DISTINCT c.user_id)::int as cohort_size,
        EXTRACT(EPOCH FROM (ur.revenue_period - c.cohort_period))::int / 86400 / ${periodDays} as period_number,
        SUM(ur.revenue)::bigint as total_revenue
      FROM cohorts c
      LEFT JOIN user_revenue ur ON c.user_id = ur.user_id
        AND ur.revenue_period >= c.cohort_period
      GROUP BY c.cohort_period, ur.revenue_period
      HAVING COUNT(DISTINCT c.user_id) >= 10
      ORDER BY c.cohort_period DESC, period_number
      LIMIT 500
    `;

    return this.groupCohortData(cohorts, 'total_revenue');
  }

  /**
   * Get Cohort Engagement
   */
  private async getCohortEngagement(
    dateRange: DateRange,
    cohortType: 'weekly' | 'monthly'
  ) {
    const periodType = cohortType === 'weekly' ? 'week' : 'month';
    const periodDays = cohortType === 'weekly' ? 7 : 30;

    const cohorts: any[] = await this.prisma.$queryRaw`
      WITH cohorts AS (
        SELECT 
          DATE_TRUNC(${periodType}, "createdAt") as cohort_period,
          id as user_id
        FROM users
        WHERE "createdAt" >= ${dateRange.start}
          AND "createdAt" <= ${dateRange.end}
          AND deleted_at IS NULL
      ),
      user_engagement AS (
        SELECT 
          actor_id as user_id,
          DATE_TRUNC(${periodType}, occurred_at) as engagement_period,
          COUNT(*)::int as event_count
        FROM events
        WHERE occurred_at >= ${dateRange.start}
          AND actor_id IS NOT NULL
        GROUP BY actor_id, DATE_TRUNC(${periodType}, occurred_at)
      )
      SELECT 
        c.cohort_period,
        COUNT(DISTINCT c.user_id)::int as cohort_size,
        EXTRACT(EPOCH FROM (ue.engagement_period - c.cohort_period))::int / 86400 / ${periodDays} as period_number,
        AVG(ue.event_count)::numeric as avg_events
      FROM cohorts c
      LEFT JOIN user_engagement ue ON c.user_id = ue.user_id
        AND ue.engagement_period >= c.cohort_period
      GROUP BY c.cohort_period, ue.engagement_period
      HAVING COUNT(DISTINCT c.user_id) >= 10
      ORDER BY c.cohort_period DESC, period_number
      LIMIT 500
    `;

    return this.groupCohortData(cohorts, 'avg_events');
  }

  /**
   * Group cohort data by cohort period
   */
  private groupCohortData(
    cohorts: any[],
    valueField: string = 'active_users'
  ) {
    const cohortMap = new Map<string, any>();

    cohorts.forEach((row) => {
      const cohortKey = row.cohort_period.toISOString().split('T')[0];
      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, {
          cohortPeriod: cohortKey,
          cohortSize: row.cohort_size,
          periods: [],
        });
      }

      const cohort = cohortMap.get(cohortKey);
      const period = row.period_number || 0;
      const value = parseInt(row[valueField] || 0);
      const percentage = cohort.cohortSize > 0 ? (value / cohort.cohortSize) * 100 : 0;

      cohort.periods.push({
        period,
        value,
        percentage: Math.round(percentage * 100) / 100,
      });
    });

    return Array.from(cohortMap.values()).slice(0, 10);
  }

  /**
   * Helper: Get date group format for SQL
   */
  private getDateGroupFormat(granularity: PeriodType): string {
    switch (granularity) {
      case 'daily':
        return 'day';
      case 'weekly':
        return 'week';
      case 'monthly':
        return 'month';
      default:
        return 'day';
    }
  }

  /**
   * Helper: Get date range for period
   */
  private getPeriodDateRange(period: string): DateRange {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case '1y':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'all':
        start.setFullYear(2020, 0, 1);
        break;
      default:
        start.setDate(start.getDate() - 30);
    }

    return { start, end };
  }

  /**
   * Helper: Get previous period date range for comparison
   */
  private getPreviousPeriodDateRange(period: string): DateRange {
    const current = this.getPeriodDateRange(period);
    const duration = current.end.getTime() - current.start.getTime();

    const end = new Date(current.start);
    end.setMilliseconds(end.getMilliseconds() - 1);

    const start = new Date(end);
    start.setMilliseconds(start.getMilliseconds() - duration);

    return { start, end };
  }

  /**
   * Invalidate platform analytics cache
   */
  async invalidateCache(scope: 'users' | 'engagement' | 'cohorts' | 'all'): Promise<void> {
    let pattern: string;
    
    switch (scope) {
      case 'users':
        pattern = 'analytics:platform:users:*';
        break;
      case 'engagement':
        pattern = 'analytics:platform:engagement:*';
        break;
      case 'cohorts':
        pattern = 'analytics:platform:cohorts:*';
        break;
      case 'all':
        pattern = 'analytics:platform:*';
        break;
      default:
        return;
    }

    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
