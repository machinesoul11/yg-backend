# 🔒 Report Generation Module - Frontend Integration Guide (Part 2: TypeScript Types & Validation)

**Module:** Report Generation Service  
**Classification:** 🔒 ADMIN ONLY (with limited creator/brand access)  
**Last Updated:** October 17, 2025

---

## Table of Contents
- [Core Type Definitions](#core-type-definitions)
- [Report Configuration Types](#report-configuration-types)
- [Report Data Types](#report-data-types)
- [Custom Report Builder Types](#custom-report-builder-types)
- [Scheduled Report Types](#scheduled-report-types)
- [Zod Validation Schemas](#zod-validation-schemas)
- [Enums and Constants](#enums-and-constants)
- [Helper Types](#helper-types)

---

## Core Type Definitions

### Base Report Configuration

```typescript
/**
 * Base configuration for all report types
 */
export interface BaseReportConfig {
  id?: string;
  name?: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  requestedBy?: string;
  generatedAt?: Date;
  format?: 'pdf' | 'csv' | 'excel' | 'json';
  filters?: ReportFilters;
}

/**
 * Universal report filters applicable to most report types
 */
export interface ReportFilters {
  brandIds?: string[];
  creatorIds?: string[];
  projectIds?: string[];
  assetTypes?: string[];
  licenseTypes?: string[];
  paymentStatuses?: string[];
  regions?: string[];
  currencies?: string[];
}

/**
 * Base report response
 */
export interface BaseReport {
  id: string;
  type: string;
  config: BaseReportConfig;
  generatedAt: Date;
  generatedBy: string;
  periodStart: Date;
  periodEnd: Date;
}
```

---

## Report Configuration Types

### Financial Statement Report

```typescript
/**
 * Financial statement report configuration
 */
export interface FinancialStatementReport extends BaseReportConfig {
  type: 'financial_statement';
  data: {
    summary: FinancialSummary;
    revenueBreakdown: RevenueBreakdown;
    expenseBreakdown: ExpenseBreakdown;
    netIncome: NetIncomeAnalysis;
    cashFlow: CashFlowSummary;
    balanceSheet: BalanceSheetSummary;
  };
}

export interface FinancialSummary {
  totalRevenueCents: number;
  totalPayoutsCents: number;
  totalPlatformFeesCents: number;
  netRevenueCents: number;
  grossMarginPercent: number;
  transactionCount: number;
  activeCreators: number;
  activeBrands: number;
  averageTransactionCents: number;
}

export interface RevenueBreakdown {
  byMonth: Array<{
    month: string;
    revenueCents: number;
    growth: number;
  }>;
  byLicenseType: Array<{
    type: string;
    revenueCents: number;
    percentage: number;
  }>;
  byAssetType: Array<{
    type: string;
    revenueCents: number;
    percentage: number;
  }>;
  byRegion: Array<{
    region: string;
    revenueCents: number;
    percentage: number;
  }>;
}

export interface ExpenseBreakdown {
  payoutsCents: number;
  processingFeesCents: number;
  operatingExpensesCents: number;
  totalExpensesCents: number;
}

export interface NetIncomeAnalysis {
  grossIncomeCents: number;
  totalExpensesCents: number;
  netIncomeCents: number;
  marginPercent: number;
  yearOverYearGrowth: number;
}

export interface CashFlowSummary {
  operatingCashFlowCents: number;
  investingCashFlowCents: number;
  financingCashFlowCents: number;
  netCashFlowCents: number;
  cashBeginningCents: number;
  cashEndingCents: number;
}

export interface BalanceSheetSummary {
  currentAssetsCents: number;
  totalAssetsCents: number;
  currentLiabilitiesCents: number;
  totalLiabilitiesCents: number;
  equityCents: number;
  pendingPayoutsCents: number;
}
```

### Revenue Reconciliation Report

```typescript
/**
 * Revenue reconciliation report for Stripe integration
 */
export interface RevenueReconciliationReport extends BaseReportConfig {
  type: 'revenue_reconciliation';
  data: {
    summary: ReconciliationSummary;
    discrepancies: ReconciliationDiscrepancy[];
    recommendations: string[];
    unmatched: UnmatchedTransactions;
  };
}

export interface ReconciliationSummary {
  totalRevenueCents: number;
  totalRoyaltiesCents: number;
  totalPayoutsCents: number;
  stripeRevenueCents: number;
  internalRevenueCents: number;
  reconciliationAccuracy: number; // Percentage
  discrepancyCount: number;
  unmatchedTransactionCount: number;
}

export interface ReconciliationDiscrepancy {
  id: string;
  type: 'missing_revenue' | 'missing_royalty' | 'missing_payout' | 'amount_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  expectedCents: number;
  actualCents: number;
  differenceCents: number;
  affectedTransactions: string[];
  suggestedActions: string[];
  createdAt: Date;
}

export interface UnmatchedTransactions {
  stripeTransfers: Array<{
    id: string;
    amountCents: number;
    createdAt: Date;
    reason: string;
  }>;
  internalPayouts: Array<{
    id: string;
    amountCents: number;
    createdAt: Date;
    reason: string;
  }>;
}
```

### Transaction Ledger Report

```typescript
/**
 * Transaction ledger report
 */
export interface TransactionLedgerReport extends BaseReportConfig {
  type: 'transaction_ledger';
  data: {
    transactions: TransactionEntry[];
    summary: LedgerSummary;
    balanceSnapshot: BalanceSnapshot;
    totalTransactions: number;
    dateRange: {
      start: Date;
      end: Date;
    };
  };
}

export interface TransactionEntry {
  id: string;
  type: TransactionType;
  entityType: EntityType;
  entityId: string;
  description: string;
  amountCents: number;
  direction: 'DEBIT' | 'CREDIT';
  status: TransactionStatus;
  createdAt: Date;
  processedAt?: Date;
  metadata: Record<string, any>;
  relatedEntities: RelatedEntity[];
}

export interface LedgerSummary {
  totalCreditsCents: number;
  totalDebitsCents: number;
  netBalanceCents: number;
  transactionCounts: {
    total: number;
    credits: number;
    debits: number;
  };
  periodSummary: {
    startDate: Date;
    endDate: Date;
    daysInPeriod: number;
  };
}

export interface BalanceSnapshot {
  asOfDate: Date;
  totalRevenueCents: number;
  totalRoyaltyObligationsCents: number;
  totalPayoutsCents: number;
  pendingPayoutsCents: number;
  netPositionCents: number;
  availableCashCents: number;
  outstandingLiabilitiesCents: number;
}

export type TransactionType = 
  | 'LICENSE_REVENUE'
  | 'ROYALTY_PAYMENT'
  | 'PAYOUT_TRANSFER'
  | 'PLATFORM_FEE'
  | 'REFUND'
  | 'ADJUSTMENT';

export type EntityType = 
  | 'LICENSE'
  | 'ROYALTY_STATEMENT'
  | 'PAYOUT'
  | 'BRAND'
  | 'CREATOR'
  | 'IP_ASSET'
  | 'PROJECT';

export type TransactionStatus = 
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface RelatedEntity {
  type: EntityType;
  id: string;
  name: string;
}
```

### Creator Earnings Report

```typescript
/**
 * Creator earnings summary report
 */
export interface CreatorEarningsReport extends BaseReportConfig {
  type: 'creator_earnings';
  data: {
    summary: CreatorEarningsSummary;
    creatorBreakdown: CreatorEarningsBreakdown[];
    paymentHistory: PaymentHistoryItem[];
    topPerformers: TopPerformerItem[];
  };
}

export interface CreatorEarningsSummary {
  totalCreators: number;
  totalEarningsCents: number;
  averageEarningsPerCreatorCents: number;
  totalPaymentsMade: number;
  pendingPaymentsCents: number;
}

export interface CreatorEarningsBreakdown {
  creatorId: string;
  creatorName: string;
  totalEarningsCents: number;
  paidCents: number;
  pendingCents: number;
  projectCount: number;
  licenseCount: number;
  lastPaymentDate?: Date;
  projects: ProjectEarnings[];
  byAsset: Array<{
    assetId: string;
    assetTitle: string;
    earningsCents: number;
    licensesCount: number;
  }>;
  byLicense: Array<{
    licenseId: string;
    brandName: string;
    earningsCents: number;
    startDate: Date;
    endDate: Date;
  }>;
}

export interface ProjectEarnings {
  projectId: string;
  projectName: string;
  earningsCents: number;
  licenseCount: number;
}

export interface PaymentHistoryItem {
  paymentId: string;
  creatorId: string;
  creatorName: string;
  amountCents: number;
  paymentDate: Date;
  status: string;
  method: string;
}

export interface TopPerformerItem {
  rank: number;
  creatorId: string;
  creatorName: string;
  earningsCents: number;
  growthPercentage: number;
}
```

### Brand Spend Analysis Report

```typescript
/**
 * Brand spending analysis report
 */
export interface BrandSpendAnalysisReport extends BaseReportConfig {
  type: 'brand_spend_analysis';
  data: {
    summary: BrandSpendSummary;
    topSpenders: TopBrandSpenders[];
    spendBreakdown: BrandSpendBreakdown[];
    efficiency: BrandSpendEfficiency[];
    trends: BrandSpendTrends;
    recommendations: BrandSpendRecommendations[];
  };
}

export interface BrandSpendSummary {
  totalSpendCents: number;
  totalBrands: number;
  averageSpendPerBrand: number;
  medianSpendPerBrand: number;
  topSpenderCents: number;
  activeBrands: number;
  newBrands: number;
}

export interface TopBrandSpenders {
  brandId: string;
  brandName: string;
  totalSpendCents: number;
  licensesCount: number;
  averagePerLicense: number;
  topAssetSpend: number;
  growthPercent: number;
  roi: number;
}

export interface BrandSpendBreakdown {
  brandId: string;
  brandName: string;
  totalSpendCents: number;
  licensingFeesCents: number;
  revShareCents: number;
  campaignCount: number;
  averageCampaignCost: number;
  byAssetType: Array<{
    type: string;
    spendCents: number;
    percentage: number;
    licensesCount: number;
  }>;
  byCreator: Array<{
    creatorId: string;
    creatorName: string;
    spendCents: number;
    licensesCount: number;
  }>;
  byPeriod: Array<{
    period: string;
    spendCents: number;
    licensesCount: number;
  }>;
}

export interface BrandSpendEfficiency {
  brandId: string;
  brandName: string;
  totalSpendCents: number;
  totalRevenueCents: number;
  roi: number;
  costPerLicense: number;
  costPerAsset: number;
  utilizationRate: number;
  efficiencyScore: number;
}

export interface BrandSpendTrends {
  monthly: Array<{
    month: string;
    totalSpendCents: number;
    averagePerBrand: number;
    activeBrands: number;
    growth: number;
  }>;
  seasonal: Array<{
    quarter: string;
    totalSpendCents: number;
    averagePerBrand: number;
    growth: number;
  }>;
}

export interface BrandSpendRecommendations {
  brandId: string;
  brandName: string;
  currentSpend: number;
  recommendations: Array<{
    type: 'cost_optimization' | 'spend_reallocation' | 'efficiency_improvement';
    priority: 'high' | 'medium' | 'low';
    description: string;
    potentialSavings: number;
    implementation: string[];
  }>;
}
```

---

## Custom Report Builder Types

### Custom Report Configuration

```typescript
/**
 * Custom report builder configuration
 */
export interface CustomReportConfig {
  name: string;
  description?: string;
  reportCategory: 'financial' | 'operational' | 'creator_performance' | 
                  'brand_campaign' | 'asset_portfolio' | 'license_analytics';
  dataSource: {
    primaryEntity: 'transactions' | 'royalties' | 'licenses' | 'assets' | 'creators' | 'brands';
    dateRange: {
      startDate: Date;
      endDate: Date;
    };
    filters?: {
      creatorIds?: string[];
      brandIds?: string[];
      assetTypes?: string[];
      licenseTypes?: string[];
      statuses?: string[];
      regions?: string[];
      amountRange?: {
        minCents?: number;
        maxCents?: number;
      };
    };
  };
  metrics: Array<{
    field: string;
    aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count';
    label?: string;
    format?: 'currency' | 'number' | 'percentage';
  }>;
  groupBy?: Array<{
    field: string;
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';
    label?: string;
  }>;
  sorting?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number; // 1-10000
  outputFormat?: 'pdf' | 'csv' | 'excel' | 'json';
  deliveryOptions?: {
    emailRecipients?: string[];
    downloadLink?: boolean;
  };
}

/**
 * Saved report configuration for reuse
 */
export interface SavedReportConfig {
  id: string;
  userId: string;
  name: string;
  description?: string;
  config: CustomReportConfig;
  isPublic: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

/**
 * Report field definition for builder UI
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

/**
 * Validation result for custom report configuration
 */
export interface ReportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedSize?: number;
  estimatedGenerationTime?: string;
}
```

---

## Scheduled Report Types

### Scheduled Report Configuration

```typescript
/**
 * Scheduled report configuration
 */
export interface ScheduledReportConfig {
  id?: string;
  name: string;
  description?: string;
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  schedule: {
    dayOfWeek?: number; // 0-6, Sunday = 0
    dayOfMonth?: number; // 1-31
    monthOfQuarter?: number; // 1-3
    monthOfYear?: number; // 1-12
    hour: number; // 0-23
    minute: number; // 0-59
    timezone: string;
  };
  config: BaseReportConfig;
  recipients: Array<{
    email: string;
    name: string;
    role: string;
  }>;
  formats: Array<'CSV' | 'EXCEL' | 'PDF'>;
  deliveryOptions: {
    emailDelivery: boolean;
    secureDownload: boolean;
    attachToEmail: boolean;
    downloadExpiration: number; // Hours
  };
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdBy: string;
  createdAt?: Date;
}

/**
 * Scheduled report execution history
 */
export interface ScheduledReportExecution {
  id: string;
  scheduledReportId: string;
  executedAt: Date;
  status: 'success' | 'failed' | 'cancelled';
  reportId?: string; // Generated report ID
  error?: string;
  metadata: {
    generationTimeSec: number;
    fileSizeBytes: number;
    recipientCount: number;
  };
}
```

---

## Report Template Types

### Template Definition

```typescript
/**
 * Pre-defined report template
 */
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  layout: ReportLayout;
  styling: ReportStyling;
  sections: ReportSection[];
  variables: ReportVariable[];
}

export interface ReportLayout {
  pageSize: 'A4' | 'letter' | 'legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  header: boolean;
  footer: boolean;
  pageNumbers: boolean;
}

export interface ReportStyling {
  fontFamily: string;
  fontSize: number;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
  branding: {
    logo: boolean;
    companyName: boolean;
    tagline: boolean;
  };
}

export interface ReportSection {
  id: string;
  name: string;
  type: 'header' | 'summary' | 'table' | 'chart' | 'text' | 'footer';
  order: number;
  required: boolean;
  config: Record<string, any>;
}

export interface ReportVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description: string;
}

/**
 * Report template definition for listing
 */
export interface ReportTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'temporal' | 'financial' | 'operational' | 'compliance';
  scope: 'platform' | 'creator' | 'brand';
  frequency: 'monthly' | 'quarterly' | 'annual' | 'on-demand';
  sections: TemplateSection[];
  dataRequirements: string[];
  estimatedGenerationTime: string;
  supportedFormats: ('pdf' | 'csv' | 'excel')[];
  accessLevel: ('ADMIN' | 'CREATOR' | 'BRAND')[];
}

export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  type: 'summary' | 'timeseries' | 'breakdown' | 'comparison' | 'table' | 'chart';
  required: boolean;
  dataQuery: any;
  visualization?: {
    type: 'line' | 'bar' | 'pie' | 'table' | 'metric';
    config: any;
  };
}
```

---

## Report Processing Types

### Report Generation Job

```typescript
/**
 * Background job for report generation
 */
export interface ReportGenerationJob {
  id: string;
  reportType: string;
  config: BaseReportConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: {
    reportId: string;
    downloadUrl: string;
    expiresAt: Date;
    fileSizeBytes: number;
  };
  createdBy: string;
  createdAt: Date;
}

/**
 * Report export configuration
 */
export interface ReportExportConfig {
  format: 'pdf' | 'csv' | 'excel' | 'json';
  template?: string;
  branding?: boolean;
  compression?: boolean;
  password?: string;
  metadata?: Record<string, any>;
}

/**
 * Report cache entry
 */
export interface ReportCacheEntry {
  key: string;
  reportType: string;
  config: BaseReportConfig;
  data: any;
  generatedAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}
```

### Access Control

```typescript
/**
 * Report access control
 */
export interface ReportAccessControl {
  reportId: string;
  userId: string;
  permissions: Array<'view' | 'download' | 'share' | 'delete'>;
  restrictions: {
    ipAddresses?: string[];
    timeWindow?: {
      start: Date;
      end: Date;
    };
    downloadLimit?: number;
  };
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

/**
 * Report audit log entry
 */
export interface ReportAuditLogEntry {
  id: string;
  action: 'generated' | 'viewed' | 'downloaded' | 'shared' | 'deleted' | 'scheduled' | 'modified';
  reportType: string;
  reportId?: string;
  userId: string;
  userName: string;
  timestamp: Date;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}
```

---

## Zod Validation Schemas

### Base Schemas

```typescript
import { z } from 'zod';

/**
 * Base report configuration schema
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
```

### Custom Report Builder Schema

```typescript
/**
 * Custom report configuration schema
 */
export const customReportConfigSchema = z.object({
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

export type CustomReportConfigInput = z.infer<typeof customReportConfigSchema>;
```

### Scheduled Report Schema

```typescript
/**
 * Scheduled report configuration schema
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
    monthOfQuarter: z.number().min(1).max(3).optional(),
    monthOfYear: z.number().min(1).max(12).optional(),
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
  formats: z.array(z.enum(['CSV', 'EXCEL', 'PDF'])).default(['PDF']),
  deliveryOptions: z.object({
    emailDelivery: z.boolean().default(true),
    secureDownload: z.boolean().default(true),
    attachToEmail: z.boolean().default(false),
    downloadExpiration: z.number().min(1).max(720).default(168) // Hours
  }),
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
    // Quarterly reports need monthOfQuarter
    if (data.frequency === 'quarterly' && data.schedule.monthOfQuarter === undefined) {
      return false;
    }
    // Annual reports need monthOfYear
    if (data.frequency === 'annually' && data.schedule.monthOfYear === undefined) {
      return false;
    }
    return true;
  },
  { message: 'Schedule configuration must match frequency type' }
);

export type ScheduledReportConfigInput = z.infer<typeof scheduledReportConfigSchema>;
```

---

## Enums and Constants

### Report Enums

```typescript
/**
 * Report format options
 */
export enum ReportFormat {
  PDF = 'pdf',
  CSV = 'csv',
  EXCEL = 'excel',
  JSON = 'json'
}

/**
 * Report status
 */
export enum ReportStatus {
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * Report frequency
 */
export enum ReportFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY'
}

/**
 * Report category
 */
export enum ReportCategory {
  TEMPORAL = 'temporal',
  FINANCIAL = 'financial',
  OPERATIONAL = 'operational',
  COMPLIANCE = 'compliance'
}

/**
 * Report scope
 */
export enum ReportScope {
  PLATFORM = 'platform',
  CREATOR = 'creator',
  BRAND = 'brand'
}

/**
 * Data source entity types
 */
export enum DataSourceEntity {
  TRANSACTIONS = 'transactions',
  ROYALTIES = 'royalties',
  LICENSES = 'licenses',
  ASSETS = 'assets',
  CREATORS = 'creators',
  BRANDS = 'brands'
}

/**
 * Aggregation functions
 */
export enum AggregationFunction {
  SUM = 'sum',
  AVG = 'avg',
  COUNT = 'count',
  MIN = 'min',
  MAX = 'max',
  DISTINCT_COUNT = 'distinct_count'
}

/**
 * Time granularity
 */
export enum TimeGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year'
}
```

### Constants

```typescript
/**
 * Report generation constants
 */
export const REPORT_CONSTANTS = {
  MAX_DATE_RANGE_DAYS: 730, // 2 years
  DEFAULT_REPORT_RETENTION_DAYS: 30,
  DOWNLOAD_URL_EXPIRY_HOURS: 1,
  MAX_CUSTOM_REPORTS_PER_HOUR: 10,
  MAX_TEMPLATE_REPORTS_PER_HOUR: 20,
  MAX_SCHEDULED_REPORTS_PER_USER: 50,
  MAX_RECIPIENTS_PER_REPORT: 20,
  MAX_REPORT_SIZE_MB: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * Available report template IDs
 */
export const REPORT_TEMPLATE_IDS = {
  MONTHLY_OPERATIONAL: 'monthly_operational',
  QUARTERLY_STRATEGIC: 'quarterly_strategic',
  ANNUAL_COMPREHENSIVE: 'annual_comprehensive',
  CREATOR_EARNINGS: 'creator_earnings',
  BRAND_CAMPAIGN: 'brand_campaign',
  TAX_COMPLIANCE: 'tax_compliance',
  ASSET_PORTFOLIO: 'asset_portfolio',
} as const;
```

---

## Helper Types

### Utility Types

```typescript
/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
  };
}

/**
 * Date range helper
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Period selector (for templates)
 */
export type PeriodSelector = 
  | { type: 'monthly'; month: number; year: number }
  | { type: 'quarterly'; quarter: number; year: number }
  | { type: 'annual'; year: number }
  | { type: 'custom'; startDate: Date; endDate: Date };

/**
 * Currency formatting options
 */
export interface CurrencyFormatOptions {
  currency: string;
  locale: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Report error type
 */
export interface ReportError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  userId?: string;
  requestId?: string;
}
```

### Type Guards

```typescript
/**
 * Type guard for custom report config
 */
export function isCustomReportConfig(config: any): config is CustomReportConfig {
  return config && 
         typeof config.name === 'string' &&
         config.reportCategory &&
         config.dataSource &&
         Array.isArray(config.metrics);
}

/**
 * Type guard for scheduled report config
 */
export function isScheduledReportConfig(config: any): config is ScheduledReportConfig {
  return config &&
         typeof config.name === 'string' &&
         config.frequency &&
         config.schedule &&
         Array.isArray(config.recipients);
}

/**
 * Type guard for report validation result
 */
export function isValidReport(result: ReportValidationResult): result is { isValid: true; errors: never[]; warnings: string[] } {
  return result.isValid && result.errors.length === 0;
}
```

---

## Usage Examples

### Creating Custom Report

```typescript
import { customReportConfigSchema, CustomReportConfig } from './types';

const reportConfig: CustomReportConfig = {
  name: 'Q4 2025 Revenue Analysis',
  reportCategory: 'financial',
  dataSource: {
    primaryEntity: 'transactions',
    dateRange: {
      startDate: new Date('2025-10-01'),
      endDate: new Date('2025-12-31')
    },
    filters: {
      brandIds: ['brand_123'],
      licenseTypes: ['exclusive']
    }
  },
  metrics: [
    {
      field: 'amountCents',
      aggregation: 'sum',
      label: 'Total Revenue',
      format: 'currency'
    },
    {
      field: 'id',
      aggregation: 'count',
      label: 'Transaction Count',
      format: 'number'
    }
  ],
  groupBy: [
    {
      field: 'createdAt',
      granularity: 'month',
      label: 'Month'
    }
  ],
  sorting: {
    field: 'amountCents',
    direction: 'desc'
  },
  outputFormat: 'pdf'
};

// Validate
const validation = customReportConfigSchema.safeParse(reportConfig);
if (!validation.success) {
  console.error('Validation errors:', validation.error);
}
```

### Scheduling Report

```typescript
import { scheduledReportConfigSchema, ScheduledReportConfig } from './types';

const scheduledReport: ScheduledReportConfig = {
  name: 'Monthly Creator Earnings',
  reportType: 'creator_earnings',
  frequency: 'monthly',
  schedule: {
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    timezone: 'America/New_York'
  },
  config: {
    startDate: new Date(),
    endDate: new Date(),
    format: 'pdf'
  },
  recipients: [
    {
      email: 'finance@example.com',
      name: 'Finance Team',
      role: 'ADMIN'
    }
  ],
  formats: ['PDF', 'CSV'],
  deliveryOptions: {
    emailDelivery: true,
    secureDownload: true,
    attachToEmail: false,
    downloadExpiration: 168
  },
  enabled: true,
  createdBy: 'user_123'
};

// Validate
const validation = scheduledReportConfigSchema.safeParse(scheduledReport);
if (!validation.success) {
  console.error('Validation errors:', validation.error);
}
```

---

## Next Steps

Continue to:
- **[Part 1: API Endpoints](./REPORT_GENERATION_FRONTEND_PART_1_API_ENDPOINTS.md)** - API endpoint documentation
- **[Part 3: Business Logic & Implementation Guide](./REPORT_GENERATION_FRONTEND_PART_3_IMPLEMENTATION.md)** - Business rules and implementation checklist

---

**Copy these types directly into your frontend codebase for type-safe integration with the Report Generation API.**
