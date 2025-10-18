/**
 * Custom Metrics Service
 * Allows users to define and calculate custom metrics
 */

import { PrismaClient } from '@prisma/client';
import { format, parse } from 'date-fns';

interface CustomMetricDefinitionInput {
  name: string;
  description?: string;
  metricType: 'COUNT' | 'SUM' | 'AVERAGE' | 'DISTINCT_COUNT' | 'PERCENTILE' | 'RATIO' | 'MAX' | 'MIN';
  dataSource: string;
  calculationFormula: string;
  dimensions?: string[];
  filters?: Record<string, any>;
  aggregationMethod: 'sum' | 'avg' | 'max' | 'min' | 'count';
  visibility?: 'PRIVATE' | 'TEAM' | 'ORGANIZATION' | 'PUBLIC';
  allowedRoles?: string[];
  queryTimeoutSeconds?: number;
}

interface CalculateMetricOptions {
  periodType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  periodStartDate: Date;
  periodEndDate: Date;
  dimensions?: Record<string, string>;
}

export class CustomMetricsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new custom metric definition
   */
  async createMetricDefinition(
    userId: string,
    input: CustomMetricDefinitionInput
  ) {
    // Validate the formula syntax
    const validation = await this.validateMetricFormula(input);

    if (!validation.isValid) {
      throw new Error(`Invalid metric formula: ${validation.errors.join(', ')}`);
    }

    const metricDefinition = await this.prisma.customMetricDefinition.create({
      data: {
        name: input.name,
        description: input.description,
        metricType: input.metricType,
        dataSource: input.dataSource,
        calculationFormula: input.calculationFormula,
        dimensions: input.dimensions || [],
        filters: input.filters || {},
        aggregationMethod: input.aggregationMethod,
        createdBy: userId,
        visibility: input.visibility || 'PRIVATE',
        allowedRoles: input.allowedRoles || ['ADMIN'],
        isValidated: validation.isValid,
        validationErrors: validation.isValid ? null : validation.errors,
        estimatedCost: validation.estimatedCost,
        queryTimeoutSeconds: input.queryTimeoutSeconds || 30,
      },
    });

    console.log(`[CustomMetrics] Created metric definition: ${metricDefinition.name}`);

    return metricDefinition;
  }

  /**
   * Update an existing metric definition
   */
  async updateMetricDefinition(
    metricId: string,
    userId: string,
    updates: Partial<CustomMetricDefinitionInput>
  ) {
    const existing = await this.prisma.customMetricDefinition.findUnique({
      where: { id: metricId },
    });

    if (!existing) {
      throw new Error('Metric definition not found');
    }

    if (existing.createdBy !== userId) {
      throw new Error('Unauthorized to update this metric');
    }

    // If formula is being updated, validate it
    let validation = { isValid: true, errors: [], estimatedCost: existing.estimatedCost };
    if (updates.calculationFormula) {
      validation = await this.validateMetricFormula({
        ...existing,
        ...updates,
      } as CustomMetricDefinitionInput);

      if (!validation.isValid) {
        throw new Error(`Invalid metric formula: ${validation.errors.join(', ')}`);
      }
    }

    // Create new version by linking to parent
    const updated = await this.prisma.customMetricDefinition.create({
      data: {
        name: updates.name || existing.name,
        description: updates.description ?? existing.description,
        metricType: (updates.metricType as any) || existing.metricType,
        dataSource: updates.dataSource || existing.dataSource,
        calculationFormula: updates.calculationFormula || existing.calculationFormula,
        dimensions: updates.dimensions || existing.dimensions,
        filters: updates.filters || existing.filters,
        aggregationMethod: updates.aggregationMethod || existing.aggregationMethod,
        createdBy: userId,
        visibility: (updates.visibility as any) || existing.visibility,
        allowedRoles: updates.allowedRoles || existing.allowedRoles,
        isValidated: validation.isValid,
        validationErrors: validation.isValid ? null : validation.errors,
        estimatedCost: validation.estimatedCost,
        queryTimeoutSeconds: updates.queryTimeoutSeconds || existing.queryTimeoutSeconds,
        version: existing.version + 1,
        parentMetricId: existing.id,
      },
    });

    // Deactivate old version
    await this.prisma.customMetricDefinition.update({
      where: { id: metricId },
      data: { isActive: false },
    });

    console.log(`[CustomMetrics] Updated metric definition: ${updated.name} (v${updated.version})`);

    return updated;
  }

  /**
   * Calculate a custom metric value
   */
  async calculateMetric(
    metricDefinitionId: string,
    options: CalculateMetricOptions
  ) {
    const startTime = Date.now();

    const definition = await this.prisma.customMetricDefinition.findUnique({
      where: { id: metricDefinitionId },
    });

    if (!definition) {
      throw new Error('Metric definition not found');
    }

    if (!definition.isValidated) {
      throw new Error('Metric definition is not validated');
    }

    if (!definition.isActive) {
      throw new Error('Metric definition is not active');
    }

    console.log(`[CustomMetrics] Calculating metric: ${definition.name}`);

    try {
      // Execute the metric calculation based on data source and formula
      const result = await this.executeMetricCalculation(definition, options);

      const duration = Date.now() - startTime;

      // Store the calculated value
      await this.prisma.customMetricValue.create({
        data: {
          metricDefinitionId: definition.id,
          periodType: options.periodType,
          periodStartDate: options.periodStartDate,
          periodEndDate: options.periodEndDate,
          dimensionValues: options.dimensions || {},
          metricValue: result.value,
          metricValueString: result.stringValue,
          calculationDurationMs: duration,
          recordCount: result.recordCount,
        },
      });

      // Update usage tracking
      await this.prisma.customMetricDefinition.update({
        where: { id: definition.id },
        data: {
          usageCount: { increment: 1 },
          lastCalculatedAt: new Date(),
        },
      });

      console.log(`[CustomMetrics] Calculated ${definition.name}: ${result.value} (${duration}ms)`);

      return {
        metricDefinition: definition,
        value: result.value,
        stringValue: result.stringValue,
        recordCount: result.recordCount,
        calculationDurationMs: duration,
      };
    } catch (error) {
      console.error(`[CustomMetrics] Error calculating metric ${definition.name}:`, error);
      throw error;
    }
  }

  /**
   * Get calculated metric values for a period
   */
  async getMetricValues(
    metricDefinitionId: string,
    startDate: Date,
    endDate: Date,
    dimensions?: Record<string, string>
  ) {
    const values = await this.prisma.customMetricValue.findMany({
      where: {
        metricDefinitionId,
        periodStartDate: { gte: startDate },
        periodEndDate: { lte: endDate },
        ...(dimensions && { dimensionValues: dimensions }),
      },
      orderBy: {
        periodStartDate: 'asc',
      },
      include: {
        metricDefinition: {
          select: {
            name: true,
            metricType: true,
            aggregationMethod: true,
          },
        },
      },
    });

    return values;
  }

  /**
   * List all custom metric definitions for a user
   */
  async listMetricDefinitions(
    userId: string,
    filters?: {
      isActive?: boolean;
      visibility?: string[];
      metricType?: string[];
    }
  ) {
    const metrics = await this.prisma.customMetricDefinition.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { visibility: { in: ['PUBLIC', 'ORGANIZATION'] } },
        ],
        deletedAt: null,
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters?.visibility && { visibility: { in: filters.visibility as any[] } }),
        ...(filters?.metricType && { metricType: { in: filters.metricType as any[] } }),
      },
      orderBy: [
        { usageCount: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return metrics;
  }

  /**
   * Delete (soft delete) a custom metric definition
   */
  async deleteMetricDefinition(metricId: string, userId: string) {
    const metric = await this.prisma.customMetricDefinition.findUnique({
      where: { id: metricId },
    });

    if (!metric) {
      throw new Error('Metric definition not found');
    }

    if (metric.createdBy !== userId) {
      throw new Error('Unauthorized to delete this metric');
    }

    await this.prisma.customMetricDefinition.update({
      where: { id: metricId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    console.log(`[CustomMetrics] Deleted metric definition: ${metric.name}`);
  }

  /**
   * Backfill metric values for a date range
   */
  async backfillMetric(
    metricDefinitionId: string,
    startDate: Date,
    endDate: Date,
    periodType: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY'
  ) {
    console.log(`[CustomMetrics] Backfilling metric ${metricDefinitionId} from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);

    const periods = this.generatePeriods(startDate, endDate, periodType);

    for (const period of periods) {
      try {
        await this.calculateMetric(metricDefinitionId, {
          periodType,
          periodStartDate: period.start,
          periodEndDate: period.end,
        });
      } catch (error) {
        console.error(`[CustomMetrics] Error backfilling period ${format(period.start, 'yyyy-MM-dd')}:`, error);
      }
    }

    console.log(`[CustomMetrics] Backfill completed for ${periods.length} periods`);
  }

  /**
   * Private: Validate metric formula
   */
  private async validateMetricFormula(input: CustomMetricDefinitionInput) {
    const errors: string[] = [];
    let estimatedCost = 'low';

    // Basic validation
    if (!input.calculationFormula || input.calculationFormula.trim().length === 0) {
      errors.push('Calculation formula is required');
    }

    // Check data source exists
    const validDataSources = ['events', 'daily_metrics', 'weekly_metrics', 'monthly_metrics', 'licenses', 'projects'];
    if (!validDataSources.includes(input.dataSource)) {
      errors.push(`Invalid data source. Must be one of: ${validDataSources.join(', ')}`);
    }

    // Check for potentially expensive operations
    if (input.calculationFormula.includes('DISTINCT') || input.metricType === 'DISTINCT_COUNT') {
      estimatedCost = 'medium';
    }

    if (input.calculationFormula.includes('JOIN') || input.calculationFormula.length > 500) {
      estimatedCost = 'high';
    }

    // TODO: More sophisticated validation (SQL injection checks, syntax validation, etc.)

    return {
      isValid: errors.length === 0,
      errors,
      estimatedCost,
    };
  }

  /**
   * Private: Execute the actual metric calculation
   */
  private async executeMetricCalculation(
    definition: any,
    options: CalculateMetricOptions
  ) {
    const { periodStartDate, periodEndDate } = options;

    // This is a simplified implementation
    // In production, this would parse the calculation formula and execute it safely

    switch (definition.dataSource) {
      case 'events':
        return await this.calculateFromEvents(definition, periodStartDate, periodEndDate);
      
      case 'daily_metrics':
        return await this.calculateFromDailyMetrics(definition, periodStartDate, periodEndDate);
      
      default:
        throw new Error(`Unsupported data source: ${definition.dataSource}`);
    }
  }

  /**
   * Private: Calculate metric from events table
   */
  private async calculateFromEvents(
    definition: any,
    startDate: Date,
    endDate: Date
  ) {
    // Apply filters from definition
    const where: any = {
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Apply custom filters from definition
    if (definition.filters) {
      Object.assign(where, definition.filters);
    }

    switch (definition.metricType) {
      case 'COUNT': {
        const count = await this.prisma.event.count({ where });
        return { value: count, recordCount: count };
      }

      case 'DISTINCT_COUNT': {
        // Count distinct actors
        const events = await this.prisma.event.findMany({
          where,
          select: { actorId: true },
          distinct: ['actorId'],
        });
        return { value: events.length, recordCount: events.length };
      }

      default:
        throw new Error(`Unsupported metric type for events: ${definition.metricType}`);
    }
  }

  /**
   * Private: Calculate metric from daily_metrics table
   */
  private async calculateFromDailyMetrics(
    definition: any,
    startDate: Date,
    endDate: Date
  ) {
    const metrics = await this.prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    if (metrics.length === 0) {
      return { value: 0, recordCount: 0 };
    }

    // Apply aggregation method
    switch (definition.aggregationMethod) {
      case 'sum': {
        const sum = metrics.reduce((acc: number, m: any) => acc + (m.views || 0), 0);
        return { value: sum, recordCount: metrics.length };
      }

      case 'avg': {
        const sum = metrics.reduce((acc: number, m: any) => acc + (m.views || 0), 0);
        return { value: sum / metrics.length, recordCount: metrics.length };
      }

      case 'max': {
        const max = Math.max(...metrics.map((m: any) => m.views || 0));
        return { value: max, recordCount: metrics.length };
      }

      case 'min': {
        const min = Math.min(...metrics.map((m: any) => m.views || 0));
        return { value: min, recordCount: metrics.length };
      }

      default:
        throw new Error(`Unsupported aggregation method: ${definition.aggregationMethod}`);
    }
  }

  /**
   * Private: Generate date periods
   */
  private generatePeriods(
    startDate: Date,
    endDate: Date,
    periodType: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  ): Array<{ start: Date; end: Date }> {
    const periods: Array<{ start: Date; end: Date }> = [];
    let current = new Date(startDate);

    while (current <= endDate) {
      let periodEnd: Date;

      switch (periodType) {
        case 'DAILY':
          periodEnd = new Date(current);
          periodEnd.setHours(23, 59, 59, 999);
          break;

        case 'WEEKLY':
          periodEnd = new Date(current);
          periodEnd.setDate(periodEnd.getDate() + 6);
          break;

        case 'MONTHLY':
          periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
          break;

        default:
          throw new Error(`Unsupported period type: ${periodType}`);
      }

      periods.push({
        start: new Date(current),
        end: periodEnd > endDate ? endDate : periodEnd,
      });

      // Move to next period
      switch (periodType) {
        case 'DAILY':
          current.setDate(current.getDate() + 1);
          break;
        case 'WEEKLY':
          current.setDate(current.getDate() + 7);
          break;
        case 'MONTHLY':
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }

    return periods;
  }
}
