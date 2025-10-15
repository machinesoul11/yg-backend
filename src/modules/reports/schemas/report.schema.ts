/**
 * Report Validation Schemas
 * 
 * Zod schemas for validating report generation requests and configurations
 */

import { z } from 'zod';

/**
 * Base Report Configuration Schema
 */
export const baseReportConfigSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  generatedBy: z.string().cuid(),
  generatedAt: z.coerce.date().optional(),
  format: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  filters: z.object({
    brandIds: z.array(z.string().cuid()).optional(),
    creatorIds: z.array(z.string().cuid()).optional(),
    projectIds: z.array(z.string().cuid()).optional(),
    assetTypes: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    paymentStatuses: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    currencies: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after or equal to start date' }
);

/**
 * Financial Statement Report Schema
 */
export const financialStatementReportSchema = baseReportConfigSchema.extend({
  type: z.literal('financial_statement'),
  includeBalanceSheet: z.boolean().default(true),
  includeCashFlow: z.boolean().default(true),
  includeBreakdowns: z.boolean().default(true),
  comparisonPeriod: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).optional(),
});

/**
 * Revenue Reconciliation Report Schema
 */
export const revenueReconciliationReportSchema = baseReportConfigSchema.extend({
  type: z.literal('revenue_reconciliation'),
  includeStripeData: z.boolean().default(true),
  includeDiscrepancies: z.boolean().default(true),
  severityThreshold: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  autoResolve: z.boolean().default(false),
});

/**
 * Transaction Ledger Report Schema
 */
export const transactionLedgerReportSchema = baseReportConfigSchema.extend({
  type: z.literal('transaction_ledger'),
  includeMetadata: z.boolean().default(false),
  transactionTypes: z.array(z.string()).optional(),
  groupBy: z.enum(['date', 'type', 'user', 'reference']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Platform Fee Report Schema
 */
export const platformFeeReportSchema = baseReportConfigSchema.extend({
  type: z.literal('platform_fee'),
  includeTrends: z.boolean().default(true),
  includeComparisons: z.boolean().default(true),
  breakdownBy: z.array(z.enum(['license_type', 'asset_type', 'creator', 'brand'])).default(['license_type']),
});

/**
 * Creator Earnings Report Schema
 */
export const creatorEarningsReportSchema = baseReportConfigSchema.extend({
  type: z.literal('creator_earnings'),
  includeProjections: z.boolean().default(false),
  includeTrends: z.boolean().default(true),
  minEarningsThreshold: z.number().min(0).default(0),
  topEarnersLimit: z.number().min(1).max(100).default(10),
});

/**
 * Brand Spend Analysis Report Schema
 */
export const brandSpendAnalysisReportSchema = baseReportConfigSchema.extend({
  type: z.literal('brand_spend_analysis'),
  includeEfficiency: z.boolean().default(true),
  includeRecommendations: z.boolean().default(true),
  includeTrends: z.boolean().default(true),
  topSpendersLimit: z.number().min(1).max(100).default(10),
  roiAnalysis: z.boolean().default(false),
});

/**
 * Period Comparison Report Schema
 */
export const periodComparisonReportSchema = baseReportConfigSchema.extend({
  type: z.literal('period_comparison'),
  comparisonType: z.enum(['previous_period', 'year_over_year', 'custom']).default('previous_period'),
  comparisonPeriod: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).optional(),
  includeAnalysis: z.boolean().default(true),
  includeForecasting: z.boolean().default(false),
}).refine(
  (data) => {
    if (data.comparisonType === 'custom') {
      return data.comparisonPeriod !== undefined;
    }
    return true;
  },
  { message: 'Comparison period is required when comparison type is custom' }
);

/**
 * Report Export Configuration Schema
 */
export const reportExportConfigSchema = z.object({
  format: z.enum(['pdf', 'csv', 'excel', 'json']),
  template: z.string().optional(),
  branding: z.boolean().default(true),
  compression: z.boolean().default(false),
  password: z.string().min(8).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Scheduled Report Configuration Schema
 */
export const scheduledReportConfigSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  reportType: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  schedule: z.object({
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    hour: z.number().min(0).max(23),
    minute: z.number().min(0).max(59),
    timezone: z.string().min(1),
  }),
  config: baseReportConfigSchema,
  recipients: z.array(z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.string().min(1),
  })).min(1),
  enabled: z.boolean().default(true),
  createdBy: z.string().cuid(),
}).refine(
  (data) => {
    // Weekly reports need dayOfWeek
    if (data.frequency === 'weekly' && data.schedule.dayOfWeek === undefined) {
      return false;
    }
    // Monthly/quarterly/annual reports need dayOfMonth
    if (['monthly', 'quarterly', 'annually'].includes(data.frequency) && data.schedule.dayOfMonth === undefined) {
      return false;
    }
    return true;
  },
  { message: 'Schedule configuration must match frequency type' }
);

/**
 * Report Template Schema
 */
export const reportTemplateSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  type: z.string().min(1),
  version: z.string().min(1),
  layout: z.object({
    pageSize: z.enum(['A4', 'letter', 'legal']).default('A4'),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    margins: z.object({
      top: z.number().min(0),
      right: z.number().min(0),
      bottom: z.number().min(0),
      left: z.number().min(0),
    }),
    header: z.boolean().default(true),
    footer: z.boolean().default(true),
    pageNumbers: z.boolean().default(true),
  }),
  styling: z.object({
    fontFamily: z.string().min(1),
    fontSize: z.number().min(8).max(72),
    colors: z.object({
      primary: z.string().regex(/^#[0-9A-F]{6}$/i),
      secondary: z.string().regex(/^#[0-9A-F]{6}$/i),
      accent: z.string().regex(/^#[0-9A-F]{6}$/i),
      text: z.string().regex(/^#[0-9A-F]{6}$/i),
      background: z.string().regex(/^#[0-9A-F]{6}$/i),
    }),
    branding: z.object({
      logo: z.boolean().default(true),
      companyName: z.boolean().default(true),
      tagline: z.boolean().default(false),
    }),
  }),
  sections: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['header', 'summary', 'table', 'chart', 'text', 'footer']),
    order: z.number().min(0),
    required: z.boolean().default(false),
    config: z.record(z.string(), z.any()),
  })),
  variables: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'date', 'boolean', 'array', 'object']),
    required: z.boolean().default(false),
    defaultValue: z.any().optional(),
    description: z.string().min(1),
  })),
});

/**
 * Report Generation Job Schema
 */
export const reportGenerationJobSchema = z.object({
  id: z.string().cuid().optional(),
  reportType: z.string().min(1),
  config: baseReportConfigSchema,
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).default('pending'),
  progress: z.number().min(0).max(100).default(0),
  createdBy: z.string().cuid(),
});

/**
 * Report Access Control Schema
 */
export const reportAccessControlSchema = z.object({
  reportId: z.string().cuid(),
  userId: z.string().cuid(),
  permissions: z.array(z.enum(['view', 'download', 'share', 'delete'])).min(1),
  restrictions: z.object({
    ipAddresses: z.array(z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)).optional(),
    timeWindow: z.object({
      start: z.coerce.date(),
      end: z.coerce.date(),
    }).optional(),
    downloadLimit: z.number().min(1).optional(),
  }).optional(),
  grantedBy: z.string().cuid(),
  expiresAt: z.coerce.date().optional(),
});

/**
 * Report Filter Schema
 */
export const reportFilterSchema = z.object({
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),
  entities: z.object({
    brandIds: z.array(z.string().cuid()).optional(),
    creatorIds: z.array(z.string().cuid()).optional(),
    projectIds: z.array(z.string().cuid()).optional(),
  }).optional(),
  types: z.object({
    assetTypes: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    transactionTypes: z.array(z.string()).optional(),
  }).optional(),
  amounts: z.object({
    minAmount: z.number().min(0).optional(),
    maxAmount: z.number().min(0).optional(),
    currency: z.string().length(3).optional(),
  }).optional(),
  status: z.object({
    paymentStatuses: z.array(z.string()).optional(),
    licenseStatuses: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (data) => data.dateRange.endDate >= data.dateRange.startDate,
  { message: 'End date must be after or equal to start date' }
).refine(
  (data) => {
    if (data.amounts?.minAmount && data.amounts?.maxAmount) {
      return data.amounts.maxAmount >= data.amounts.minAmount;
    }
    return true;
  },
  { message: 'Max amount must be greater than or equal to min amount' }
);

/**
 * Report Search Schema
 */
export const reportSearchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  reportType: z.string().optional(),
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).optional(),
  createdBy: z.string().cuid().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  format: z.enum(['pdf', 'csv', 'excel', 'json']).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'reportType']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Report Analytics Schema
 */
export const reportAnalyticsSchema = z.object({
  reportId: z.string().cuid().optional(),
  reportType: z.string().optional(),
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),
  metrics: z.array(z.enum([
    'generation_count',
    'download_count',
    'average_generation_time',
    'format_distribution',
    'user_engagement',
    'error_rate'
  ])).default(['generation_count', 'download_count']),
  groupBy: z.enum(['day', 'week', 'month', 'report_type', 'user']).default('day'),
});

/**
 * Union type for all report schemas
 */
export const reportSchema = z.discriminatedUnion('type', [
  financialStatementReportSchema,
  revenueReconciliationReportSchema,
  transactionLedgerReportSchema,
  platformFeeReportSchema,
  creatorEarningsReportSchema,
  brandSpendAnalysisReportSchema,
  periodComparisonReportSchema,
]);

/**
 * Report request validation
 */
export const generateReportRequestSchema = z.object({
  reportType: z.string().min(1),
  config: baseReportConfigSchema,
  exportConfig: reportExportConfigSchema.optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  notifyOnCompletion: z.boolean().default(true),
});

/**
 * Bulk report generation schema
 */
export const bulkReportGenerationSchema = z.object({
  reports: z.array(generateReportRequestSchema).min(1).max(10),
  batchName: z.string().min(1).max(200).optional(),
  notifyOnCompletion: z.boolean().default(true),
  parallelExecution: z.boolean().default(false),
});

/**
 * Report sharing schema
 */
export const reportSharingSchema = z.object({
  reportId: z.string().cuid(),
  shareWith: z.array(z.object({
    email: z.string().email(),
    permissions: z.array(z.enum(['view', 'download'])).min(1),
    expiresAt: z.coerce.date().optional(),
  })).min(1).max(50),
  message: z.string().max(1000).optional(),
  includeData: z.boolean().default(true),
  requireLogin: z.boolean().default(true),
});

export type BaseReportConfig = z.infer<typeof baseReportConfigSchema>;
export type FinancialStatementReportConfig = z.infer<typeof financialStatementReportSchema>;
export type RevenueReconciliationReportConfig = z.infer<typeof revenueReconciliationReportSchema>;
export type TransactionLedgerReportConfig = z.infer<typeof transactionLedgerReportSchema>;
export type PlatformFeeReportConfig = z.infer<typeof platformFeeReportSchema>;
export type CreatorEarningsReportConfig = z.infer<typeof creatorEarningsReportSchema>;
export type BrandSpendAnalysisReportConfig = z.infer<typeof brandSpendAnalysisReportSchema>;
export type PeriodComparisonReportConfig = z.infer<typeof periodComparisonReportSchema>;
export type ReportExportConfig = z.infer<typeof reportExportConfigSchema>;
export type ScheduledReportConfig = z.infer<typeof scheduledReportConfigSchema>;
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;
export type ReportGenerationJob = z.infer<typeof reportGenerationJobSchema>;
export type ReportAccessControl = z.infer<typeof reportAccessControlSchema>;
export type ReportFilter = z.infer<typeof reportFilterSchema>;
export type ReportSearch = z.infer<typeof reportSearchSchema>;
export type ReportAnalytics = z.infer<typeof reportAnalyticsSchema>;
export type GenerateReportRequest = z.infer<typeof generateReportRequestSchema>;
export type BulkReportGeneration = z.infer<typeof bulkReportGenerationSchema>;
export type ReportSharing = z.infer<typeof reportSharingSchema>;
