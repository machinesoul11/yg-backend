/**
 * Custom Report Builder Service
 * 
 * Empowers users to create ad-hoc reports without developer intervention.
 * Provides step-by-step workflow with intelligent defaults and validation.
 */

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auditService } from '@/lib/services/audit.service';

/**
 * Custom Report Configuration Schema
 */
export const CustomReportConfigSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  reportCategory: z.enum([
    'financial',
    'operational',
    'creator_performance',
    'brand_campaign',
    'asset_portfolio',
    'license_analytics'
  ]),
  dataSource: z.object({
    primaryEntity: z.enum(['transactions', 'royalties', 'licenses', 'assets', 'creators', 'brands']),
    dateRange: z.object({
      startDate: z.coerce.date(),
      endDate: z.coerce.date()
    }),
    filters: z.object({
      creatorIds: z.array(z.string()).optional(),
      brandIds: z.array(z.string()).optional(),
      assetTypes: z.array(z.string()).optional(),
      licenseTypes: z.array(z.string()).optional(),
      statuses: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      amountRange: z.object({
        minCents: z.number().optional(),
        maxCents: z.number().optional()
      }).optional()
    }).optional()
  }),
  metrics: z.array(z.object({
    field: z.string(),
    aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'distinct_count']),
    label: z.string().optional(),
    format: z.enum(['currency', 'number', 'percentage']).optional()
  })),
  groupBy: z.array(z.object({
    field: z.string(),
    granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
    label: z.string().optional()
  })).optional(),
  sorting: z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc'])
  }).optional(),
  limit: z.number().min(1).max(10000).optional(),
  outputFormat: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  deliveryOptions: z.object({
    emailRecipients: z.array(z.string().email()).optional(),
    downloadLink: z.boolean().default(true)
  }).optional()
});

export type CustomReportConfig = z.infer<typeof CustomReportConfigSchema>;

/**
 * Saved Report Configuration (for reuse)
 */
export interface SavedReportConfig {
  id: string;
  userId: string;
  name: string;
  description?: string;
  config: CustomReportConfig;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

/**
 * Report Field Definition
 */
export interface ReportFieldDefinition {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  category: string;
  aggregatable: boolean;
  groupable: boolean;
  filterable: boolean;
  description?: string;
}

export class CustomReportBuilderService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get available fields for a data source
   */
  getAvailableFields(dataSource: string): ReportFieldDefinition[] {
    const fieldDefinitions: Record<string, ReportFieldDefinition[]> = {
      transactions: [
        { field: 'id', label: 'Transaction ID', type: 'string', category: 'identifier', aggregatable: false, groupable: false, filterable: true },
        { field: 'amountCents', label: 'Amount', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true },
        { field: 'type', label: 'Transaction Type', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'status', label: 'Status', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'createdAt', label: 'Date', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'brandId', label: 'Brand', type: 'string', category: 'relationship', aggregatable: false, groupable: true, filterable: true },
        { field: 'platformFeeCents', label: 'Platform Fee', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true }
      ],
      royalties: [
        { field: 'id', label: 'Royalty ID', type: 'string', category: 'identifier', aggregatable: false, groupable: false, filterable: true },
        { field: 'totalEarningsCents', label: 'Total Earnings', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true },
        { field: 'netPayoutCents', label: 'Net Payout', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true },
        { field: 'creatorId', label: 'Creator', type: 'string', category: 'relationship', aggregatable: false, groupable: true, filterable: true },
        { field: 'periodStart', label: 'Period Start', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'status', label: 'Status', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'lineItemCount', label: 'Line Items', type: 'number', category: 'metric', aggregatable: true, groupable: false, filterable: true }
      ],
      licenses: [
        { field: 'id', label: 'License ID', type: 'string', category: 'identifier', aggregatable: false, groupable: false, filterable: true },
        { field: 'licenseFeeCents', label: 'License Fee', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true },
        { field: 'type', label: 'License Type', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'status', label: 'Status', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'startDate', label: 'Start Date', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'expiryDate', label: 'Expiry Date', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'brandId', label: 'Brand', type: 'string', category: 'relationship', aggregatable: false, groupable: true, filterable: true },
        { field: 'assetId', label: 'Asset', type: 'string', category: 'relationship', aggregatable: false, groupable: true, filterable: true }
      ],
      assets: [
        { field: 'id', label: 'Asset ID', type: 'string', category: 'identifier', aggregatable: false, groupable: false, filterable: true },
        { field: 'type', label: 'Asset Type', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'status', label: 'Status', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'createdAt', label: 'Upload Date', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'licenseCount', label: 'Active Licenses', type: 'number', category: 'metric', aggregatable: true, groupable: false, filterable: true },
        { field: 'totalRevenueCents', label: 'Total Revenue', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true }
      ],
      creators: [
        { field: 'id', label: 'Creator ID', type: 'string', category: 'identifier', aggregatable: false, groupable: false, filterable: true },
        { field: 'stageName', label: 'Stage Name', type: 'string', category: 'profile', aggregatable: false, groupable: true, filterable: true },
        { field: 'verificationStatus', label: 'Verification Status', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'createdAt', label: 'Join Date', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'totalEarnings', label: 'Total Earnings', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true },
        { field: 'assetCount', label: 'Asset Count', type: 'number', category: 'metric', aggregatable: true, groupable: false, filterable: true }
      ],
      brands: [
        { field: 'id', label: 'Brand ID', type: 'string', category: 'identifier', aggregatable: false, groupable: false, filterable: true },
        { field: 'name', label: 'Brand Name', type: 'string', category: 'profile', aggregatable: false, groupable: true, filterable: true },
        { field: 'verificationStatus', label: 'Verification Status', type: 'string', category: 'classification', aggregatable: false, groupable: true, filterable: true },
        { field: 'createdAt', label: 'Join Date', type: 'date', category: 'temporal', aggregatable: false, groupable: true, filterable: true },
        { field: 'totalSpending', label: 'Total Spending', type: 'number', category: 'financial', aggregatable: true, groupable: false, filterable: true },
        { field: 'activeLicenses', label: 'Active Licenses', type: 'number', category: 'metric', aggregatable: true, groupable: false, filterable: true }
      ]
    };

    return fieldDefinitions[dataSource] || [];
  }

  /**
   * Get intelligent defaults for a report category
   */
  getReportDefaults(category: string): Partial<CustomReportConfig> {
    const defaults: Record<string, Partial<CustomReportConfig>> = {
      financial: {
        dataSource: {
          primaryEntity: 'transactions',
          dateRange: {
            startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            endDate: new Date()
          }
        },
        metrics: [
          { field: 'amountCents', aggregation: 'sum', label: 'Total Revenue', format: 'currency' },
          { field: 'id', aggregation: 'count', label: 'Transaction Count', format: 'number' }
        ],
        groupBy: [
          { field: 'createdAt', granularity: 'month', label: 'Month' }
        ],
        sorting: {
          field: 'createdAt',
          direction: 'desc'
        }
      },
      creator_performance: {
        dataSource: {
          primaryEntity: 'royalties',
          dateRange: {
            startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1),
            endDate: new Date()
          }
        },
        metrics: [
          { field: 'totalEarningsCents', aggregation: 'sum', label: 'Total Earnings', format: 'currency' },
          { field: 'netPayoutCents', aggregation: 'sum', label: 'Net Payout', format: 'currency' }
        ],
        groupBy: [
          { field: 'creatorId', label: 'Creator' }
        ],
        sorting: {
          field: 'totalEarningsCents',
          direction: 'desc'
        },
        limit: 100
      },
      brand_campaign: {
        dataSource: {
          primaryEntity: 'licenses',
          dateRange: {
            startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
            endDate: new Date()
          }
        },
        metrics: [
          { field: 'licenseFeeCents', aggregation: 'sum', label: 'Total Spending', format: 'currency' },
          { field: 'id', aggregation: 'count', label: 'License Count', format: 'number' }
        ],
        groupBy: [
          { field: 'brandId', label: 'Brand' },
          { field: 'type', label: 'License Type' }
        ]
      },
      asset_portfolio: {
        dataSource: {
          primaryEntity: 'assets',
          dateRange: {
            startDate: new Date(new Date().getFullYear(), 0, 1),
            endDate: new Date()
          }
        },
        metrics: [
          { field: 'totalRevenueCents', aggregation: 'sum', label: 'Total Revenue', format: 'currency' },
          { field: 'licenseCount', aggregation: 'sum', label: 'Active Licenses', format: 'number' }
        ],
        groupBy: [
          { field: 'type', label: 'Asset Type' }
        ],
        sorting: {
          field: 'totalRevenueCents',
          direction: 'desc'
        }
      }
    };

    return defaults[category] || {};
  }

  /**
   * Validate custom report configuration
   */
  async validateReportConfig(config: CustomReportConfig): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    estimatedSize?: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate date range
    if (config.dataSource.dateRange.startDate >= config.dataSource.dateRange.endDate) {
      errors.push('Start date must be before end date');
    }

    const daysDiff = Math.ceil(
      (config.dataSource.dateRange.endDate.getTime() - config.dataSource.dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff > 730) {
      warnings.push('Date range exceeds 2 years. Report generation may take longer.');
    }

    // Validate metrics
    const availableFields = this.getAvailableFields(config.dataSource.primaryEntity);
    
    for (const metric of config.metrics) {
      const fieldDef = availableFields.find(f => f.field === metric.field);
      if (!fieldDef) {
        errors.push(`Invalid metric field: ${metric.field}`);
      } else if (!fieldDef.aggregatable) {
        errors.push(`Field ${metric.field} cannot be aggregated`);
      }
    }

    // Validate groupBy fields
    if (config.groupBy) {
      for (const group of config.groupBy) {
        const fieldDef = availableFields.find(f => f.field === group.field);
        if (!fieldDef) {
          errors.push(`Invalid groupBy field: ${group.field}`);
        } else if (!fieldDef.groupable) {
          errors.push(`Field ${group.field} cannot be used for grouping`);
        }
      }
    }

    // Estimate result size
    let estimatedRows = 1000; // Default estimate
    if (config.groupBy && config.groupBy.length > 0) {
      // Rough estimation based on grouping
      estimatedRows = daysDiff * 10; // Heuristic
    }

    const estimatedSize = estimatedRows * 500; // Rough bytes per row

    if (estimatedSize > 50 * 1024 * 1024 && config.outputFormat === 'pdf') {
      warnings.push('Estimated output exceeds 50MB. Consider using CSV format or adding filters.');
    }

    if (config.outputFormat === 'pdf' && estimatedRows > 10000) {
      warnings.push('Large result set may not render well in PDF. Consider using CSV or Excel format.');
    }

    // Validate delivery options
    if (config.deliveryOptions?.emailRecipients && config.deliveryOptions.emailRecipients.length > 50) {
      warnings.push('Large recipient list. Email delivery may be throttled.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedSize
    };
  }

  /**
   * Build query for custom report
   */
  async buildReportQuery(config: CustomReportConfig): Promise<any> {
    const { dataSource, metrics, groupBy, sorting, limit } = config;

    // This would construct the actual Prisma query
    // Simplified example structure:
    const query: any = {
      where: {
        createdAt: {
          gte: dataSource.dateRange.startDate,
          lte: dataSource.dateRange.endDate
        }
      }
    };

    // Apply filters
    if (dataSource.filters) {
      if (dataSource.filters.creatorIds && dataSource.filters.creatorIds.length > 0) {
        query.where.creatorId = { in: dataSource.filters.creatorIds };
      }
      if (dataSource.filters.brandIds && dataSource.filters.brandIds.length > 0) {
        query.where.brandId = { in: dataSource.filters.brandIds };
      }
      if (dataSource.filters.statuses && dataSource.filters.statuses.length > 0) {
        query.where.status = { in: dataSource.filters.statuses };
      }
      if (dataSource.filters.amountRange) {
        query.where.amountCents = {};
        if (dataSource.filters.amountRange.minCents !== undefined) {
          query.where.amountCents.gte = dataSource.filters.amountRange.minCents;
        }
        if (dataSource.filters.amountRange.maxCents !== undefined) {
          query.where.amountCents.lte = dataSource.filters.amountRange.maxCents;
        }
      }
    }

    // Add sorting
    if (sorting) {
      query.orderBy = { [sorting.field]: sorting.direction };
    }

    // Add limit
    if (limit) {
      query.take = limit;
    }

    return query;
  }

  /**
   * Generate custom report
   */
  async generateCustomReport(
    config: CustomReportConfig,
    userId: string,
    userRole: string
  ): Promise<string> {
    // Validate configuration
    const validation = await this.validateReportConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid report configuration: ${validation.errors.join(', ')}`);
    }

    // Apply security filters based on user role
    const securedConfig = this.applySecurityFilters(config, userId, userRole);

    // Create report record
    const report = await this.prisma.financialReport.create({
      data: {
        reportType: 'CUSTOM',
        period: {
          startDate: securedConfig.dataSource.dateRange.startDate.toISOString(),
          endDate: securedConfig.dataSource.dateRange.endDate.toISOString()
        },
        generatedBy: userId,
        status: 'GENERATING',
        metadata: {
          customConfig: securedConfig,
          validation: {
            warnings: validation.warnings,
            estimatedSize: validation.estimatedSize
          }
        }
      }
    });

    // Queue for background processing
    // (This would integrate with the existing reportGenerationQueue)

    // Log audit event
    await auditService.log({
      action: 'CUSTOM_REPORT_CREATED',
      entityType: 'financial_report',
      entityId: report.id,
      userId,
      after: {
        reportName: config.name,
        category: config.reportCategory,
        dataSource: config.dataSource.primaryEntity
      }
    });

    return report.id;
  }

  /**
   * Apply security filters based on user role
   */
  private applySecurityFilters(
    config: CustomReportConfig,
    userId: string,
    userRole: string
  ): CustomReportConfig {
    const securedConfig = { ...config };

    // If user is a creator, automatically filter to their data
    if (userRole === 'CREATOR') {
      if (!securedConfig.dataSource.filters) {
        securedConfig.dataSource.filters = {};
      }
      securedConfig.dataSource.filters.creatorIds = [userId];
    }

    // If user is a brand, automatically filter to their data
    if (userRole === 'BRAND') {
      if (!securedConfig.dataSource.filters) {
        securedConfig.dataSource.filters = {};
      }
      securedConfig.dataSource.filters.brandIds = [userId];
    }

    // Admins get unrestricted access
    return securedConfig;
  }

  /**
   * Save report configuration for reuse
   */
  async saveReportConfig(
    config: CustomReportConfig,
    userId: string,
    options: {
      isPublic?: boolean;
      tags?: string[];
    } = {}
  ): Promise<SavedReportConfig> {
    // Store in metadata JSON for now (could be separate table)
    const saved = {
      id: `saved_${Date.now()}`,
      userId,
      name: config.name,
      description: config.description,
      config,
      isPublic: options.isPublic || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0
    };

    // Would persist to database here
    
    await auditService.log({
      action: 'REPORT_CONFIG_SAVED',
      entityType: 'saved_report_config',
      entityId: saved.id,
      userId,
      after: { name: config.name, isPublic: saved.isPublic }
    });

    return saved;
  }

  /**
   * Load saved report configuration
   */
  async loadSavedReportConfig(
    configId: string,
    userId: string,
    userRole: string
  ): Promise<CustomReportConfig> {
    // Would retrieve from database
    // Check permissions (public or owned by user)
    
    throw new Error('Not implemented - would retrieve from database');
  }

  /**
   * List saved report configurations for user
   */
  async listSavedConfigs(userId: string, userRole: string): Promise<SavedReportConfig[]> {
    // Would query database for saved configs
    // Include public configs and user's own configs
    
    return [];
  }

  /**
   * Delete saved report configuration
   */
  async deleteSavedConfig(configId: string, userId: string): Promise<void> {
    // Would delete from database after checking ownership
    
    await auditService.log({
      action: 'REPORT_CONFIG_DELETED',
      entityType: 'saved_report_config',
      entityId: configId,
      userId
    });
  }
}
