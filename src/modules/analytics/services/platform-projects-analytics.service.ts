/**
 * Platform Projects Analytics Service
 * Provides project completion rates and timeline metrics for admin users
 */

import { PrismaClient, ProjectStatus, ProjectType } from '@prisma/client';
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
 * Completion Rate Data
 */
interface CompletionRateData {
  overall: number;
  onTime: number;
  late: number;
  early: number;
  byType: Record<string, number>;
  timeline: Array<{
    date: string;
    completed: number;
    onTime: number;
    late: number;
  }>;
}

/**
 * Timeline Metrics
 */
interface TimelineMetrics {
  averageDurationDays: number;
  medianDurationDays: number;
  onTimePercentage: number;
  averageDelayDays: number;
  averageEarlyCompletionDays: number;
  byStatus: Array<{
    status: ProjectStatus;
    count: number;
    averageDurationDays: number;
  }>;
}

/**
 * Active Projects Breakdown
 */
interface ActiveProjectsBreakdown {
  draft: number;
  active: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  archived: number;
  byType: Record<string, number>;
}

/**
 * Budget Metrics
 */
interface BudgetMetrics {
  averageBudgetCents: number;
  medianBudgetCents: number;
  totalBudgetCents: number;
  utilizationRate: number;
  overBudgetCount: number;
  underBudgetCount: number;
  byType: Record<string, {
    averageBudgetCents: number;
    totalBudgetCents: number;
  }>;
}

/**
 * Trend Data Point
 */
interface TrendDataPoint {
  date: string;
  created: number;
  completed: number;
  active: number;
  completionRate: number;
}

/**
 * Project Analytics Response
 */
export interface ProjectAnalytics {
  dateRange: {
    start: string;
    end: string;
  };
  granularity: Granularity;
  completionRates: CompletionRateData;
  timelineMetrics: TimelineMetrics;
  activeProjects: ActiveProjectsBreakdown;
  budgetMetrics: BudgetMetrics;
  trendData: TrendDataPoint[];
  summary: {
    totalProjects: number;
    completionRate: number;
    averageAssetsPerProject: number;
    averageLicensesPerProject: number;
    averageTeamSize: number;
    comparisonToPreviousPeriod: {
      projectsCreatedChange: number;
      completionRateChange: number;
      averageDurationChange: number;
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
export interface ProjectAnalyticsFilters {
  projectType?: ProjectType;
  brandId?: string;
  status?: ProjectStatus;
}

export class PlatformProjectsAnalyticsService {
  private readonly CACHE_PREFIX = 'analytics:platform:projects';
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get comprehensive project analytics
   */
  async getProjectAnalytics(
    dateRange: DateRange,
    granularity: Granularity = 'daily',
    filters: ProjectAnalyticsFilters = {}
  ): Promise<ProjectAnalytics> {
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
      completionRates,
      timelineMetrics,
      activeProjects,
      budgetMetrics,
      trendData,
      currentPeriodStats,
      previousPeriodStats,
    ] = await Promise.all([
      this.getCompletionRates(dateRange, granularity, filters),
      this.getTimelineMetrics(dateRange, filters),
      this.getActiveProjectsBreakdown(filters),
      this.getBudgetMetrics(dateRange, filters),
      this.getTrendData(dateRange, granularity, filters),
      this.getPeriodStatistics(dateRange, filters),
      this.getPeriodStatistics(previousRange, filters),
    ]);

    // Calculate changes from previous period
    const projectsCreatedChange = previousPeriodStats.projectsCreated > 0
      ? ((currentPeriodStats.projectsCreated - previousPeriodStats.projectsCreated) / previousPeriodStats.projectsCreated) * 100
      : 0;

    const completionRateChange = currentPeriodStats.completionRate - previousPeriodStats.completionRate;

    const averageDurationChange = previousPeriodStats.averageDuration > 0
      ? ((currentPeriodStats.averageDuration - previousPeriodStats.averageDuration) / previousPeriodStats.averageDuration) * 100
      : 0;

    const result: ProjectAnalytics = {
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      granularity,
      completionRates,
      timelineMetrics,
      activeProjects,
      budgetMetrics,
      trendData,
      summary: {
        totalProjects: currentPeriodStats.totalProjects,
        completionRate: completionRates.overall,
        averageAssetsPerProject: currentPeriodStats.averageAssetsPerProject,
        averageLicensesPerProject: currentPeriodStats.averageLicensesPerProject,
        averageTeamSize: currentPeriodStats.averageTeamSize,
        comparisonToPreviousPeriod: {
          projectsCreatedChange: Math.round(projectsCreatedChange * 100) / 100,
          completionRateChange: Math.round(completionRateChange * 100) / 100,
          averageDurationChange: Math.round(averageDurationChange * 100) / 100,
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
   * Get completion rates with timeline analysis
   */
  private async getCompletionRates(
    dateRange: DateRange,
    granularity: Granularity,
    filters: ProjectAnalyticsFilters
  ): Promise<CompletionRateData> {
    const sqlGranularity = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month';

    // Get projects that moved to completed status during the period
    const completedProjects: any[] = await this.prisma.$queryRaw`
      SELECT 
        p.id,
        p.project_type,
        p.start_date,
        p.end_date,
        p.updated_at as completion_date,
        EXTRACT(DAY FROM (p.updated_at - p.start_date))::int as actual_duration_days,
        CASE 
          WHEN p.end_date IS NULL THEN NULL
          ELSE EXTRACT(DAY FROM (p.end_date - p.start_date))::int
        END as planned_duration_days
      FROM projects p
      WHERE p.status = 'COMPLETED'
        AND p.updated_at >= ${dateRange.start}
        AND p.updated_at <= ${dateRange.end}
        AND p.deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND p.project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND p.brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Get total projects that started during the period
    const totalProjectsResult: any[] = await this.prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM projects
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND status != 'DRAFT'
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    const totalProjects = totalProjectsResult[0]?.count || 0;
    const completedCount = completedProjects.length;

    // Calculate on-time, late, early
    let onTimeCount = 0;
    let lateCount = 0;
    let earlyCount = 0;
    const byType: Record<string, number> = {};

    completedProjects.forEach((project) => {
      // Count by type
      byType[project.project_type] = (byType[project.project_type] || 0) + 1;

      // Calculate timeline performance
      if (project.planned_duration_days !== null) {
        if (project.actual_duration_days <= project.planned_duration_days) {
          if (project.actual_duration_days < project.planned_duration_days) {
            earlyCount++;
          } else {
            onTimeCount++;
          }
        } else {
          lateCount++;
        }
      }
    });

    // Get timeline data
    const timelineData: any[] = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${sqlGranularity}, updated_at) as date,
        COUNT(*)::int as completed,
        COUNT(CASE 
          WHEN end_date IS NOT NULL 
            AND EXTRACT(DAY FROM (updated_at - start_date)) <= EXTRACT(DAY FROM (end_date - start_date))
          THEN 1 
        END)::int as on_time,
        COUNT(CASE 
          WHEN end_date IS NOT NULL 
            AND EXTRACT(DAY FROM (updated_at - start_date)) > EXTRACT(DAY FROM (end_date - start_date))
          THEN 1 
        END)::int as late
      FROM projects
      WHERE status = 'COMPLETED'
        AND updated_at >= ${dateRange.start}
        AND updated_at <= ${dateRange.end}
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
      GROUP BY DATE_TRUNC(${sqlGranularity}, updated_at)
      ORDER BY date
    `;

    const timeline = timelineData.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      completed: item.completed,
      onTime: item.on_time,
      late: item.late,
    }));

    // Calculate percentages
    const overall = totalProjects > 0 ? (completedCount / totalProjects) * 100 : 0;
    const withTimeline = onTimeCount + lateCount + earlyCount;
    const onTime = withTimeline > 0 ? (onTimeCount / withTimeline) * 100 : 0;
    const late = withTimeline > 0 ? (lateCount / withTimeline) * 100 : 0;
    const early = withTimeline > 0 ? (earlyCount / withTimeline) * 100 : 0;

    // Calculate completion rate by type
    const byTypePercentage: Record<string, number> = {};
    for (const [type, count] of Object.entries(byType)) {
      byTypePercentage[type] = totalProjects > 0 ? (count / totalProjects) * 100 : 0;
    }

    return {
      overall: Math.round(overall * 100) / 100,
      onTime: Math.round(onTime * 100) / 100,
      late: Math.round(late * 100) / 100,
      early: Math.round(early * 100) / 100,
      byType: byTypePercentage,
      timeline,
    };
  }

  /**
   * Get timeline metrics
   */
  private async getTimelineMetrics(
    dateRange: DateRange,
    filters: ProjectAnalyticsFilters
  ): Promise<TimelineMetrics> {
    // Calculate average and median duration
    const durationStats: any[] = await this.prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(DAY FROM (COALESCE(updated_at, NOW()) - start_date)))::int as avg_duration,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM (COALESCE(updated_at, NOW()) - start_date)))::int as median_duration
      FROM projects
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND start_date IS NOT NULL
        AND status != 'DRAFT'
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Calculate on-time percentage
    const timelinePerformance: any[] = await this.prisma.$queryRaw`
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE 
          WHEN status = 'COMPLETED' 
            AND end_date IS NOT NULL 
            AND updated_at <= end_date 
          THEN 1 
        END)::int as on_time
      FROM projects
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND status != 'DRAFT'
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    const total = timelinePerformance[0]?.total || 0;
    const onTimeCount = timelinePerformance[0]?.on_time || 0;
    const onTimePercentage = total > 0 ? (onTimeCount / total) * 100 : 0;

    // Calculate average delay for late projects
    const delayStats: any[] = await this.prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(DAY FROM (updated_at - end_date)))::int as avg_delay
      FROM projects
      WHERE status = 'COMPLETED'
        AND created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND end_date IS NOT NULL
        AND updated_at > end_date
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Calculate average early completion for early projects
    const earlyStats: any[] = await this.prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(DAY FROM (end_date - updated_at)))::int as avg_early
      FROM projects
      WHERE status = 'COMPLETED'
        AND created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND end_date IS NOT NULL
        AND updated_at < end_date
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Get metrics by status
    const byStatusStats: any[] = await this.prisma.$queryRaw`
      SELECT 
        status,
        COUNT(*)::int as count,
        AVG(EXTRACT(DAY FROM (COALESCE(updated_at, NOW()) - start_date)))::int as avg_duration
      FROM projects
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND start_date IS NOT NULL
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
      GROUP BY status
      ORDER BY count DESC
    `;

    return {
      averageDurationDays: durationStats[0]?.avg_duration || 0,
      medianDurationDays: durationStats[0]?.median_duration || 0,
      onTimePercentage: Math.round(onTimePercentage * 100) / 100,
      averageDelayDays: delayStats[0]?.avg_delay || 0,
      averageEarlyCompletionDays: earlyStats[0]?.avg_early || 0,
      byStatus: byStatusStats.map((item) => ({
        status: item.status,
        count: item.count,
        averageDurationDays: item.avg_duration,
      })),
    };
  }

  /**
   * Get active projects breakdown
   */
  private async getActiveProjectsBreakdown(filters: ProjectAnalyticsFilters): Promise<ActiveProjectsBreakdown> {
    const whereConditions: any = {
      deletedAt: null,
    };

    if (filters.projectType) {
      whereConditions.projectType = filters.projectType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    // Get counts by status
    const statusCounts = await this.prisma.project.groupBy({
      by: ['status'],
      where: whereConditions,
      _count: true,
    });

    const breakdown: ActiveProjectsBreakdown = {
      draft: 0,
      active: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      archived: 0,
      byType: {},
    };

    statusCounts.forEach((item) => {
      const count = typeof item._count === 'object' && item._count !== null && '_all' in item._count 
        ? (item._count as any)._all 
        : (typeof item._count === 'number' ? item._count : 0);
      
      switch (item.status) {
        case 'DRAFT':
          breakdown.draft = count;
          break;
        case 'ACTIVE':
          breakdown.active = count;
          break;
        case 'IN_PROGRESS':
          breakdown.inProgress = count;
          break;
        case 'COMPLETED':
          breakdown.completed = count;
          break;
        case 'CANCELLED':
          breakdown.cancelled = count;
          break;
        case 'ARCHIVED':
          breakdown.archived = count;
          break;
      }
    });

    // Get counts by type
    const typeCounts = await this.prisma.project.groupBy({
      by: ['projectType'],
      where: whereConditions,
      _count: true,
    });

    typeCounts.forEach((item) => {
      const count = typeof item._count === 'object' && item._count !== null && '_all' in item._count 
        ? (item._count as any)._all 
        : (typeof item._count === 'number' ? item._count : 0);
      breakdown.byType[item.projectType] = count;
    });

    return breakdown;
  }

  /**
   * Get budget metrics
   */
  private async getBudgetMetrics(
    dateRange: DateRange,
    filters: ProjectAnalyticsFilters
  ): Promise<BudgetMetrics> {
    const whereConditions: any = {
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      deletedAt: null,
    };

    if (filters.projectType) {
      whereConditions.projectType = filters.projectType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    // Get budget aggregates
    const budgetStats = await this.prisma.project.aggregate({
      where: whereConditions,
      _avg: {
        budgetCents: true,
      },
      _sum: {
        budgetCents: true,
      },
    });

    // Get median budget
    const medianResult: any[] = await this.prisma.$queryRaw`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY budget_cents)::bigint as median_budget
      FROM projects
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Calculate utilization rate (actual spend vs budget)
    // This is a simplified calculation based on license fees
    const utilizationResult: any[] = await this.prisma.$queryRaw`
      SELECT 
        p.id,
        p.budget_cents,
        COALESCE(SUM(l.fee_cents), 0)::bigint as actual_spend
      FROM projects p
      LEFT JOIN licenses l ON l.project_id = p.id AND l.deleted_at IS NULL
      WHERE p.created_at >= ${dateRange.start}
        AND p.created_at <= ${dateRange.end}
        AND p.deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND p.project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND p.brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
      GROUP BY p.id, p.budget_cents
    `;

    let totalBudget = 0;
    let totalSpend = 0;
    let overBudgetCount = 0;
    let underBudgetCount = 0;

    utilizationResult.forEach((project) => {
      const budget = Number(project.budget_cents);
      const spend = Number(project.actual_spend);
      
      totalBudget += budget;
      totalSpend += spend;

      if (budget > 0) {
        if (spend > budget) {
          overBudgetCount++;
        } else if (spend < budget) {
          underBudgetCount++;
        }
      }
    });

    const utilizationRate = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

    // Get budget by type
    const byTypeStats = await this.prisma.project.groupBy({
      by: ['projectType'],
      where: whereConditions,
      _avg: {
        budgetCents: true,
      },
      _sum: {
        budgetCents: true,
      },
    });

    const byType: Record<string, { averageBudgetCents: number; totalBudgetCents: number }> = {};
    byTypeStats.forEach((item) => {
      byType[item.projectType] = {
        averageBudgetCents: Number(item._avg.budgetCents || 0),
        totalBudgetCents: Number(item._sum.budgetCents || 0),
      };
    });

    return {
      averageBudgetCents: Number(budgetStats._avg.budgetCents || 0),
      medianBudgetCents: Number(medianResult[0]?.median_budget || 0),
      totalBudgetCents: Number(budgetStats._sum.budgetCents || 0),
      utilizationRate: Math.round(utilizationRate * 100) / 100,
      overBudgetCount,
      underBudgetCount,
      byType,
    };
  }

  /**
   * Get trend data over time
   */
  private async getTrendData(
    dateRange: DateRange,
    granularity: Granularity,
    filters: ProjectAnalyticsFilters
  ): Promise<TrendDataPoint[]> {
    const sqlGranularity = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month';

    const trendData: any[] = await this.prisma.$queryRaw`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC(${sqlGranularity}, ${dateRange.start}::timestamp),
          DATE_TRUNC(${sqlGranularity}, ${dateRange.end}::timestamp),
          ('1 ' || ${sqlGranularity})::interval
        ) as period_date
      ),
      project_stats AS (
        SELECT 
          DATE_TRUNC(${sqlGranularity}, created_at) as created_date,
          DATE_TRUNC(${sqlGranularity}, updated_at) as completed_date,
          status
        FROM projects
        WHERE created_at >= ${dateRange.start}
          AND created_at <= ${dateRange.end}
          AND deleted_at IS NULL
          ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
          ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
      )
      SELECT 
        ds.period_date as date,
        COUNT(CASE WHEN ps.created_date = ds.period_date THEN 1 END)::int as created,
        COUNT(CASE WHEN ps.completed_date = ds.period_date AND ps.status = 'COMPLETED' THEN 1 END)::int as completed,
        COUNT(CASE WHEN ps.status IN ('ACTIVE', 'IN_PROGRESS') THEN 1 END)::int as active
      FROM date_series ds
      LEFT JOIN project_stats ps ON ps.created_date <= ds.period_date
      GROUP BY ds.period_date
      ORDER BY ds.period_date
    `;

    return trendData.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      created: item.created,
      completed: item.completed,
      active: item.active,
      completionRate: item.created > 0 ? (item.completed / item.created) * 100 : 0,
    }));
  }

  /**
   * Get period statistics
   */
  private async getPeriodStatistics(
    dateRange: DateRange,
    filters: ProjectAnalyticsFilters
  ): Promise<{
    totalProjects: number;
    projectsCreated: number;
    completionRate: number;
    averageDuration: number;
    averageAssetsPerProject: number;
    averageLicensesPerProject: number;
    averageTeamSize: number;
  }> {
    const whereConditions: any = {
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      deletedAt: null,
    };

    if (filters.projectType) {
      whereConditions.projectType = filters.projectType;
    }

    if (filters.brandId) {
      whereConditions.brandId = filters.brandId;
    }

    // Get project counts
    const projectsCreated = await this.prisma.project.count({
      where: whereConditions,
    });

    const totalProjects = await this.prisma.project.count({
      where: {
        deletedAt: null,
        ...(filters.projectType && { projectType: filters.projectType }),
        ...(filters.brandId && { brandId: filters.brandId }),
      },
    });

    const completedProjects = await this.prisma.project.count({
      where: {
        ...whereConditions,
        status: 'COMPLETED',
      },
    });

    const completionRate = projectsCreated > 0 ? (completedProjects / projectsCreated) * 100 : 0;

    // Get average duration
    const durationResult: any[] = await this.prisma.$queryRaw`
      SELECT AVG(EXTRACT(DAY FROM (updated_at - start_date)))::int as avg_duration
      FROM projects
      WHERE created_at >= ${dateRange.start}
        AND created_at <= ${dateRange.end}
        AND start_date IS NOT NULL
        AND status = 'COMPLETED'
        AND deleted_at IS NULL
        ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
        ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
    `;

    // Get average assets per project
    const assetsResult: any[] = await this.prisma.$queryRaw`
      SELECT AVG(asset_count)::numeric as avg_assets
      FROM (
        SELECT p.id, COUNT(a.id)::int as asset_count
        FROM projects p
        LEFT JOIN ip_assets a ON a.project_id = p.id AND a.deleted_at IS NULL
        WHERE p.created_at >= ${dateRange.start}
          AND p.created_at <= ${dateRange.end}
          AND p.deleted_at IS NULL
          ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND p.project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
          ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND p.brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
        GROUP BY p.id
      ) asset_counts
    `;

    // Get average licenses per project
    const licensesResult: any[] = await this.prisma.$queryRaw`
      SELECT AVG(license_count)::numeric as avg_licenses
      FROM (
        SELECT p.id, COUNT(l.id)::int as license_count
        FROM projects p
        LEFT JOIN licenses l ON l.project_id = p.id AND l.deleted_at IS NULL
        WHERE p.created_at >= ${dateRange.start}
          AND p.created_at <= ${dateRange.end}
          AND p.deleted_at IS NULL
          ${filters.projectType ? this.prisma.$queryRawUnsafe(`AND p.project_type = '${filters.projectType}'`) : this.prisma.$queryRawUnsafe('')}
          ${filters.brandId ? this.prisma.$queryRawUnsafe(`AND p.brand_id = '${filters.brandId}'`) : this.prisma.$queryRawUnsafe('')}
        GROUP BY p.id
      ) license_counts
    `;

    // Calculate average team size (creator + brand = 2 minimum)
    const averageTeamSize = 2; // Simplified - could be enhanced with actual team member tracking

    return {
      totalProjects,
      projectsCreated,
      completionRate: Math.round(completionRate * 100) / 100,
      averageDuration: durationResult[0]?.avg_duration || 0,
      averageAssetsPerProject: Math.round((Number(assetsResult[0]?.avg_assets || 0)) * 100) / 100,
      averageLicensesPerProject: Math.round((Number(licensesResult[0]?.avg_licenses || 0)) * 100) / 100,
      averageTeamSize,
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
    filters: ProjectAnalyticsFilters
  ): string {
    const parts = [
      this.CACHE_PREFIX,
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0],
      granularity,
    ];

    if (filters.projectType) parts.push(`type:${filters.projectType}`);
    if (filters.brandId) parts.push(`brand:${filters.brandId}`);
    if (filters.status) parts.push(`status:${filters.status}`);

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
