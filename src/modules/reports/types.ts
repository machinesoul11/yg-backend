/**
 * Report Generation Module Types
 * 
 * Comprehensive type definitions for financial and operational reporting
 */

export interface ReportModuleTypes {}

/**
 * Base Report Configuration
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
 * Base Report Response
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

/**
 * Report Filters
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
 * Financial Statement Report
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

/**
 * Revenue Reconciliation Report
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
  reconciliationAccuracy: number;
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

/**
 * Transaction Ledger Report Types
 */
export interface TransactionLedgerConfig extends BaseReportConfig {
  type: 'transaction_ledger';
  sortBy?: 'createdAt' | 'amountCents' | 'type';
  sortOrder?: 'asc' | 'desc';
  filters?: {
    transactionTypes?: TransactionType[];
    entityTypes?: EntityType[];
    brandIds?: string[];
    creatorIds?: string[];
    statuses?: TransactionStatus[];
    amountRange?: {
      minCents?: number;
      maxCents?: number;
    };
  };
}

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

/**
 * Platform Fee Calculation Report Types
 */
export interface PlatformFeeReportConfig extends BaseReportConfig {
  type: 'platform_fee';
  includeFeeBreakdown?: boolean;
  calculationMethod?: 'percentage' | 'fixed' | 'tiered';
}

export interface PlatformFeeCalculationReport extends BaseReportConfig {
  type: 'platform_fee';
  data: {
    summary: PlatformFeeSummary;
    feeBreakdown: FeeBreakdownItem[];
    brandAnalysis: BrandFeeAnalysis[];
    projections: FeeProjection[];
  };
}

export interface PlatformFeeSummary {
  totalFeesCollectedCents: number;
  averageFeePercentage: number;
  totalTransactions: number;
  feesByType: Record<string, number>;
}

export interface FeeBreakdownItem {
  transactionId: string;
  brandId: string;
  brandName: string;
  licenseType: string;
  baseFeeAmount: number;
  feePercentage: number;
  calculatedFeeCents: number;
  collectedAt: Date;
}

export interface BrandFeeAnalysis {
  brandId: string;
  brandName: string;
  totalTransactions: number;
  totalFeesCollectedCents: number;
  averageFeePercentage: number;
  feesByLicenseType: Record<string, number>;
}

export interface FeeProjection {
  period: string;
  projectedFeesC: number;
  confidence: number;
  factors: string[];
}

/**
 * Creator Earnings Summary Report Types
 */
export interface CreatorEarningsConfig extends BaseReportConfig {
  type: 'creator_earnings';
  includeProjectBreakdown?: boolean;
  includePaymentHistory?: boolean;
}

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

export interface AccountBalances {
  cash: number;
  pendingPayouts: number;
  royaltiesPayable: number;
  platformFees: number;
  suspense: number;
}

/**
 * Platform Fee Report
 */
export interface PlatformFeeReport extends BaseReportConfig {
  type: 'platform_fee';
  data: {
    summary: PlatformFeeSummary;
    breakdown: PlatformFeeBreakdown;
    trends: PlatformFeeTrends;
    comparisons: PlatformFeeComparisons;
  };
}

export interface PlatformFeeSummary {
  totalFeesCents: number;
  averageFeePercent: number;
  totalTransactions: number;
  averageFeePerTransaction: number;
  highestFeeTransaction: number;
  lowestFeeTransaction: number;
}

export interface PlatformFeeBreakdown {
  byLicenseType: Array<{
    type: string;
    totalFeesCents: number;
    averagePercent: number;
    transactionCount: number;
  }>;
  byAssetType: Array<{
    type: string;
    totalFeesCents: number;
    averagePercent: number;
    transactionCount: number;
  }>;
  byCreator: Array<{
    creatorId: string;
    creatorName: string;
    totalFeesCents: number;
    transactionCount: number;
  }>;
  byBrand: Array<{
    brandId: string;
    brandName: string;
    totalFeesCents: number;
    transactionCount: number;
  }>;
}

export interface PlatformFeeTrends {
  monthly: Array<{
    month: string;
    totalFeesCents: number;
    averagePercent: number;
    growth: number;
  }>;
  weekly: Array<{
    week: string;
    totalFeesCents: number;
    averagePercent: number;
    growth: number;
  }>;
}

export interface PlatformFeeComparisons {
  previousPeriod: {
    totalFeesCents: number;
    growth: number;
    averagePercent: number;
  };
  yearOverYear: {
    totalFeesCents: number;
    growth: number;
    averagePercent: number;
  };
}

/**
 * Brand Spend Analysis Report Types
 */
export interface BrandSpendAnalysisConfig extends BaseReportConfig {
  type: 'brand_spend';
  includeROIAnalysis?: boolean;
  compareWithPreviousPeriod?: boolean;
}

export interface BrandSpendAnalysisReport extends BaseReportConfig {
  type: 'brand_spend';
  data: {
    summary: BrandSpendSummary;
    brandBreakdown: BrandSpendBreakdown[];
    categoryAnalysis: CategorySpendAnalysis[];
    roiAnalysis: ROIAnalysis[];
    trends: SpendTrends;
  };
}

export interface TopCreatorEarners {
  creatorId: string;
  creatorName: string;
  totalEarningsCents: number;
  licensesCount: number;
  averagePerLicense: number;
  topAssetRevenue: number;
  growthPercent: number;
}

export interface CreatorEarningsBreakdown {
  creatorId: string;
  creatorName: string;
  grossEarningsCents: number;
  platformFeesCents: number;
  netEarningsCents: number;
  pendingCents: number;
  paidCents: number;
  licensesCount: number;
  assetsCount: number;
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

export interface CreatorEarningsTrends {
  monthly: Array<{
    month: string;
    totalEarningsCents: number;
    averagePerCreator: number;
    activeCreators: number;
    growth: number;
  }>;
  topGrowing: Array<{
    creatorId: string;
    creatorName: string;
    growthPercent: number;
    currentEarnings: number;
    previousEarnings: number;
  }>;
}

export interface CreatorEarningsProjections {
  nextMonthEstimate: number;
  nextQuarterEstimate: number;
  annualEstimate: number;
  confidence: number;
  factors: string[];
}

/**
 * Brand Spend Analysis Report
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

/**
 * Period Comparison Report
 */
export interface PeriodComparisonReport extends BaseReportConfig {
  type: 'period_comparison';
  data: {
    summary: ComparisonSummary;
    metrics: ComparisonMetrics;
    trends: ComparisonTrends;
    analysis: ComparisonAnalysis;
  };
}

export interface ComparisonSummary {
  currentPeriod: PeriodMetrics;
  comparisonPeriod: PeriodMetrics;
  variance: VarianceAnalysis;
}

export interface PeriodMetrics {
  startDate: Date;
  endDate: Date;
  totalRevenueCents: number;
  totalTransactions: number;
  averageTransactionValue: number;
  activeUsers: number;
  newUsers: number;
  conversionRate: number;
}

export interface VarianceAnalysis {
  revenueChange: number;
  revenueChangePercent: number;
  transactionChange: number;
  transactionChangePercent: number;
  userChange: number;
  userChangePercent: number;
  significance: 'positive' | 'negative' | 'neutral';
}

export interface ComparisonMetrics {
  revenue: MetricComparison;
  transactions: MetricComparison;
  users: MetricComparison;
  engagement: MetricComparison;
}

export interface MetricComparison {
  name: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  significance: 'high' | 'medium' | 'low';
}

export interface ComparisonTrends {
  daily: Array<{
    date: Date;
    currentValue: number;
    previousValue: number;
    difference: number;
  }>;
  weekly: Array<{
    week: string;
    currentValue: number;
    previousValue: number;
    difference: number;
  }>;
}

export interface ComparisonAnalysis {
  insights: Array<{
    type: 'growth' | 'decline' | 'anomaly' | 'opportunity';
    metric: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    recommendations: string[];
  }>;
  forecasting: {
    nextPeriodEstimate: number;
    confidence: number;
    factors: string[];
  };
}

/**
 * Report Export Configuration
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
 * Scheduled Report Configuration
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
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdBy: string;
  createdAt?: Date;
}

/**
 * Report Template Definition
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
 * Report Generation Job
 */
export interface ReportGenerationJob {
  id: string;
  reportType: string;
  config: BaseReportConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
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
 * Report Cache Entry
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

/**
 * Report Access Control
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
 * Paginated Response
 */
export interface PaginatedReportResponse<T> {
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
 * Report Error Types
 */
export interface ReportError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  userId?: string;
  requestId?: string;
}

/**
 * Report Audit Log Entry
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
