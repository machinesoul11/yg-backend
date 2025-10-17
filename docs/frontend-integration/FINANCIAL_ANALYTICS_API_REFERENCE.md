# Financial Analytics Reports - API Reference & Data Schemas

> **Classification: 🔒 ADMIN ONLY** - Internal operations and admin interface only

This document provides detailed API reference and complete data schemas for the Financial Analytics Reports module. Use this as a comprehensive reference when implementing the frontend integration.

## 📋 Table of Contents

1. [Complete API Endpoint Reference](#complete-api-endpoint-reference)
2. [Detailed Response Schemas](#detailed-response-schemas)  
3. [Report-Specific Data Structures](#report-specific-data-structures)
4. [File Upload & Storage Integration](#file-upload--storage-integration)
5. [Real-time Updates & WebSockets](#real-time-updates--websockets)
6. [Advanced Filtering & Sorting](#advanced-filtering--sorting)

---

## 1. Complete API Endpoint Reference

### Core Report Generation Endpoints

#### Generate Financial Analytics Report
```typescript
POST /api/trpc/reports.generateFinancialAnalyticsReport

// Request
interface GenerateReportRequest {
  reportType: ReportType;
  config: FinancialAnalyticsConfig;
  generatedBy: string;
  deliveryOptions?: DeliveryOptions;
}

// Response  
interface GenerateReportResponse {
  success: boolean;
  data: FinancialReportResult;
  message: string;
}
```

#### Generate Dashboard Report
```typescript
POST /api/trpc/reports.generateDashboardReport

// Request
interface DashboardReportRequest {
  period: DateRange;
  generatedBy: string;
}

// Response
interface DashboardReportResponse {
  success: boolean;
  data: FinancialReportResult & {
    executiveSummary: ExecutiveSummary;
    reportBreakdown: ReportBreakdown;
  };
  message: string;
}
```

### Report Management Endpoints

#### Get Report History
```typescript
GET /api/trpc/reports.getReportHistory

// Query Parameters
interface ReportHistoryQuery {
  limit?: number;           // 1-100, default: 20
  offset?: number;          // default: 0  
  reportType?: string;      // filter by report type
  startDate?: Date;         // filter by generation date
  endDate?: Date;           // filter by generation date
  status?: ReportStatus;    // filter by status
  generatedBy?: string;     // filter by creator
  sortBy?: 'createdAt' | 'reportType' | 'status'; // default: 'createdAt'
  sortOrder?: 'asc' | 'desc'; // default: 'desc'
}

// Response
interface ReportHistoryResponse {
  success: boolean;
  data: {
    reports: ReportHistoryItem[];
    pagination: PaginationInfo;
    filters: ActiveFilters;
  };
}
```

#### Get Report Details
```typescript
GET /api/trpc/reports.getReportDetails

// Query Parameters  
interface ReportDetailsQuery {
  reportId: string;
}

// Response
interface ReportDetailsResponse {
  success: boolean;
  data: {
    report: DetailedReportInfo;
    metadata: ReportMetadata;
    downloadOptions: DownloadOption[];
  };
}
```

#### Download Report
```typescript
GET /api/trpc/reports.downloadReport

// Query Parameters
interface DownloadReportQuery {
  reportId: string;
  format?: 'pdf' | 'csv' | 'json'; // override original format
}

// Response: Binary file or structured data based on format
```

#### Delete Report
```typescript
DELETE /api/trpc/reports.deleteReport

// Request
interface DeleteReportRequest {
  reportId: string;
}

// Response
interface DeleteReportResponse {
  success: boolean;
  message: string;
}
```

### Utility Endpoints

#### Validate Report Configuration
```typescript
POST /api/trpc/reports.validateReportConfig

// Request
interface ValidateConfigRequest {
  reportType: ReportType;
  config: FinancialAnalyticsConfig;
}

// Response
interface ValidateConfigResponse {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  estimatedRecords?: number;
  estimatedGenerationTime?: number; // seconds
}
```

#### Get Report Types
```typescript
GET /api/trpc/reports.getReportTypes

// Response
interface ReportTypesResponse {
  success: boolean;
  data: {
    reportTypes: ReportTypeInfo[];
  };
}
```

#### Get Available Filters
```typescript
GET /api/trpc/reports.getAvailableFilters

// Query Parameters
interface FilterOptionsQuery {
  reportType?: ReportType;
}

// Response  
interface FilterOptionsResponse {
  success: boolean;
  data: {
    brands: FilterOption[];
    creators: FilterOption[];
    regions: FilterOption[];
    assetTypes: FilterOption[];
    licenseTypes: FilterOption[];
  };
}
```

## 2. Detailed Response Schemas

### Base Response Types
```typescript
interface BaseResponse {
  success: boolean;
  message?: string;
  timestamp: Date;
  requestId: string;
}

interface ErrorResponse extends BaseResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, any>;
    stack?: string; // Only in development
  };
}

interface SuccessResponse<T> extends BaseResponse {
  success: true;
  data: T;
}
```

### Pagination Types
```typescript
interface PaginationInfo {
  total: number;           // Total number of records
  limit: number;           // Records per page
  offset: number;          // Current offset
  page: number;            // Current page (calculated)
  totalPages: number;      // Total pages (calculated)
  hasMore: boolean;        // Whether there are more records
  hasPrevious: boolean;    // Whether there are previous records
}

interface PaginationRequest {
  limit?: number;          // 1-100, default: 20
  offset?: number;         // default: 0
  page?: number;           // alternative to offset
}
```

### Report Metadata
```typescript
interface ReportMetadata {
  id: string;
  reportType: ReportType;
  generatedAt: Date;
  generatedBy: string;
  generatedByUser?: {
    id: string;
    name: string;
    email: string;
  };
  status: ReportStatus;
  format: ReportFormat;
  fileSize?: number;       // in bytes
  recordCount: number;
  period: DateRange;
  filters?: ReportFilters;
  processingTimeMs: number;
  version: string;         // Report schema version
  tags?: string[];         // Optional categorization tags
}

interface ReportHistoryItem {
  id: string;
  reportType: ReportType;
  name?: string;           // Custom name if provided
  generatedAt: Date;
  generatedBy: string;
  status: ReportStatus;
  format: ReportFormat;
  fileSize?: number;
  recordCount: number;
  period: DateRange;
  downloadUrl?: string;    // Present if status is COMPLETED
  errorMessage?: string;   // Present if status is FAILED
}
```

### Filter and Sort Types
```typescript
interface FilterOption {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  metadata?: Record<string, any>;
}

interface ActiveFilters {
  reportType?: string;
  dateRange?: DateRange;
  status?: ReportStatus;
  generatedBy?: string;
  brands?: string[];
  creators?: string[];
  regions?: string[];
}

interface SortOption {
  field: string;
  label: string;
  direction: 'asc' | 'desc';
}
```

## 3. Report-Specific Data Structures

### Monthly Revenue Report Data
```typescript
interface MonthlyRevenueReportData {
  summary: {
    totalRevenueCents: number;
    paymentRevenueCents: number;
    licenseRevenueCents: number;
    transactionCount: number;
    averageTransactionCents: number;
    growthRate?: number;     // Month-over-month %
  };
  revenueBySource: {
    payments: RevenueSourceBreakdown;
    licenses: RevenueSourceBreakdown;
  };
  dailyBreakdown: Array<{
    date: Date;
    revenueCents: number;
    transactionCount: number;
  }>;
  topBrands: Array<{
    brandId: string;
    brandName: string;
    revenueCents: number;
    transactionCount: number;
    percentage: number;
  }>;
  topCreators: Array<{
    creatorId: string;
    creatorName: string;
    revenueCents: number;
    transactionCount: number;
    percentage: number;
  }>;
  comparison?: {
    previousPeriod: MonthlyRevenueSummary;
    yearOverYear: MonthlyRevenueSummary;
  };
}

interface RevenueSourceBreakdown {
  totalCents: number;
  count: number;
  averageCents: number;
  percentage: number;
  breakdown: Array<{
    category: string;
    amountCents: number;
    count: number;
    percentage: number;
  }>;
}
```

### Cash Flow Analysis Data
```typescript
interface CashFlowAnalysisData {
  period: DateRange;
  cashFlowSummary: {
    totalInflowCents: number;
    totalOutflowCents: number;
    netCashFlowCents: number;
    cashFlowPositive: boolean;
  };
  operatingCashFlow: {
    brandPaymentsCents: number;
    subscriptionFeesCents: number;
    otherRevenueCents: number;
    creatorPayoutsCents: number;
    operationalExpensesCents: number;
    netOperatingCashFlowCents: number;
  };
  investingCashFlow: {
    technologyInvestmentsCents: number;
    assetAcquisitionsCents: number;
    netInvestingCashFlowCents: number;
  };
  financingCashFlow: {
    capitalRaisesCents: number;
    debtPaymentsCents: number;
    netFinancingCashFlowCents: number;
  };
  cashPositionAnalysis: {
    currentCashBalanceCents: number;
    projectedCashNeedsCents: number;
    cashReservesCents: number;
    burnRateCents: number;
    runwayDays: number;
  };
  forecasting: {
    next30Days: CashFlowProjection;
    next90Days: CashFlowProjection;
    next12Months: CashFlowProjection[];
  };
  scenarios: {
    conservative: ScenarioAnalysis;
    realistic: ScenarioAnalysis;
    optimistic: ScenarioAnalysis;
  };
}

interface CashFlowProjection {
  period: DateRange;
  projectedInflowCents: number;
  projectedOutflowCents: number;
  projectedNetCashFlowCents: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  assumptions: string[];
}
```

### Accounts Receivable Aging Data
```typescript
interface AccountsReceivableAgingData {
  asOfDate: Date;
  summary: {
    totalOutstandingCents: number;
    totalInvoiceCount: number;
    averageInvoiceAgeDays: number;
    collectionEfficiencyRate: number;
  };
  agingBuckets: {
    current: AgingBucket;        // 0-30 days
    bucket31To60: AgingBucket;   // 31-60 days  
    bucket61To90: AgingBucket;   // 61-90 days
    bucket90Plus: AgingBucket;   // 90+ days
  };
  topOutstandingInvoices: Array<{
    invoiceId: string;
    brandId: string;
    brandName: string;
    amountCents: number;
    invoiceDate: Date;
    dueDate: Date;
    daysOutstanding: number;
    status: 'SENT' | 'VIEWED' | 'OVERDUE' | 'DISPUTED';
  }>;
  collectionMetrics: {
    averageCollectionDays: number;
    collectionSuccessRate: number;
    disputeRate: number;
  };
  riskAnalysis: {
    highRiskInvoices: RiskAssessment[];
    recommendedActions: string[];
  };
}

interface AgingBucket {
  amountCents: number;
  invoiceCount: number;
  percentage: number;
  averageDaysOutstanding: number;
}

interface RiskAssessment {
  invoiceId: string;
  brandName: string;
  amountCents: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: string[];
  recommendedAction: string;
}
```

### Commission Tracking Data
```typescript
interface CommissionTrackingData {
  period: DateRange;
  summary: {
    totalCommissionsCents: number;
    averageCommissionRate: number;
    transactionCount: number;
    totalRevenueCents: number;
  };
  commissionsByType: Array<{
    type: CommissionType;
    totalCents: number;
    averageRate: number;
    transactionCount: number;
    percentage: number;
  }>;
  commissionsByBrand: Array<{
    brandId: string;
    brandName: string;
    totalCommissionsCents: number;
    averageRate: number;
    transactionCount: number;
  }>;
  commissionsByCreator: Array<{
    creatorId: string;
    creatorName: string;
    totalCommissionsCents: number;
    averageRate: number;
    transactionCount: number;
  }>;
  trends: {
    monthlyTrends: Array<{
      month: string;
      totalCommissionsCents: number;
      averageRate: number;
      growthRate: number;
    }>;
    rateAnalysis: {
      minimumRate: number;
      maximumRate: number;
      averageRate: number;
      standardDeviation: number;
    };
  };
}

type CommissionType = 
  | 'PLATFORM_FEE'
  | 'TRANSACTION_FEE' 
  | 'SUCCESS_FEE'
  | 'SUBSCRIPTION_FEE'
  | 'PREMIUM_FEATURE_FEE';
```

## 4. File Upload & Storage Integration

### PDF Report Generation
```typescript
interface PDFGenerationConfig {
  template?: string;           // Template ID or 'default'
  branding: boolean;           // Include YesGoddess branding
  watermark?: string;          // Optional watermark text
  password?: string;           // Optional PDF password protection
  compression: boolean;        // Compress PDF file size
  metadata: {
    title: string;
    author: string;
    subject: string;
    keywords: string[];
  };
}

interface PDFGenerationResult {
  fileId: string;
  fileName: string;
  fileSize: number;
  downloadUrl: string;
  expiresAt: Date;            // Download URL expiration
  pageCount: number;
  generatedAt: Date;
}
```

### File Storage Integration
```typescript
interface FileStorageConfig {
  provider: 'cloudflare_r2' | 'aws_s3';
  bucket: string;
  region: string;
  encryptionEnabled: boolean;
  retentionPolicyDays: number;  // Auto-delete after X days
}

interface StoredFile {
  id: string;
  originalName: string;
  storedName: string;
  contentType: string;
  size: number;
  checksum: string;           // File integrity verification
  uploadedAt: Date;
  expiresAt?: Date;
  metadata: Record<string, any>;
}

interface DownloadToken {
  token: string;
  fileId: string;
  expiresAt: Date;
  downloadCount: number;
  maxDownloads?: number;
}
```

### Secure Download URLs
```typescript
// Generate signed download URL
POST /api/trpc/reports.generateDownloadUrl

interface DownloadUrlRequest {
  reportId: string;
  expirationMinutes?: number;  // Default: 60 minutes
  maxDownloads?: number;       // Default: unlimited
}

interface DownloadUrlResponse {
  success: boolean;
  data: {
    downloadUrl: string;
    expiresAt: Date;
    token: string;
    remainingDownloads?: number;
  };
}
```

## 5. Real-time Updates & WebSockets

### Report Generation Status Updates
```typescript
// WebSocket connection for real-time updates
const wsUrl = 'wss://ops.yesgoddess.agency/ws/reports';

interface WebSocketMessage {
  type: 'REPORT_STATUS_UPDATE' | 'GENERATION_PROGRESS' | 'ERROR';
  reportId: string;
  timestamp: Date;
  data: ReportStatusUpdate | GenerationProgress | ErrorUpdate;
}

interface ReportStatusUpdate {
  status: ReportStatus;
  message?: string;
  downloadUrl?: string;
  errorDetails?: ErrorDetails;
}

interface GenerationProgress {
  progress: number;           // 0-100 percentage
  currentStep: string;        // Human-readable current step
  estimatedCompletionSec: number;
  recordsProcessed: number;
  totalRecords: number;
}

interface ErrorUpdate {
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  retryAfterSec?: number;
}
```

### WebSocket Implementation Example
```typescript
// Frontend WebSocket hook
function useReportStatusUpdates(reportId: string) {
  const [status, setStatus] = useState<ReportStatus>('GENERATING');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const ws = new WebSocket(`${wsUrl}?reportId=${reportId}`);
    
    ws.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'REPORT_STATUS_UPDATE':
          setStatus(message.data.status);
          if (message.data.status === 'FAILED') {
            setError(message.data.errorDetails?.message || 'Generation failed');
          }
          break;
          
        case 'GENERATION_PROGRESS':
          setProgress(message.data.progress);
          break;
          
        case 'ERROR':
          setError(message.data.errorMessage);
          break;
      }
    };
    
    ws.onerror = () => {
      setError('Connection lost. Please refresh to check status.');
    };
    
    return () => ws.close();
  }, [reportId]);
  
  return { status, progress, error };
}
```

### Polling Fallback
```typescript
// Fallback polling for environments without WebSocket support
function useReportStatusPolling(reportId: string, enabled: boolean) {
  return trpc.reports.getReportStatus.useQuery(
    { reportId },
    {
      enabled: enabled,
      refetchInterval: (data) => {
        // Stop polling when completed or failed
        if (data?.status === 'COMPLETED' || data?.status === 'FAILED') {
          return false;
        }
        return 3000; // Poll every 3 seconds
      },
      retry: (failureCount, error) => {
        // Retry up to 3 times for network errors
        return failureCount < 3 && !error.data?.code?.includes('NOT_FOUND');
      },
    }
  );
}
```

## 6. Advanced Filtering & Sorting

### Complex Filter Combinations
```typescript
interface AdvancedReportFilters extends ReportFilters {
  dateRangeComparison?: {
    enabled: boolean;
    comparisonPeriod: DateRange;
    comparisonType: 'PREVIOUS_PERIOD' | 'YEAR_OVER_YEAR' | 'CUSTOM';
  };
  amountRange?: {
    minCents?: number;
    maxCents?: number;
  };
  transactionTypes?: TransactionType[];
  paymentMethods?: PaymentMethod[];
  currencies?: CurrencyCode[];
  excludeRefunds?: boolean;
  excludeChargebacks?: boolean;
  minimumTransactionCount?: number;
  customFields?: Record<string, FilterValue>;
}

type FilterValue = string | number | boolean | Date | string[] | number[];

interface FilterGroup {
  operator: 'AND' | 'OR';
  conditions: FilterCondition[];
}

interface FilterCondition {
  field: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS' | 'IN' | 'NOT_IN';
  value: FilterValue;
}
```

### Advanced Sorting Options
```typescript
interface SortConfiguration {
  primary: SortField;
  secondary?: SortField;
  tertiary?: SortField;
}

interface SortField {
  field: string;
  direction: 'ASC' | 'DESC';
  nullsHandling: 'FIRST' | 'LAST';
}

// Available sort fields by report type
interface ReportTypeSortFields {
  monthly_revenue: [
    'date', 'revenueCents', 'transactionCount', 'brandName', 'creatorName'
  ];
  cash_flow: [
    'date', 'inflowCents', 'outflowCents', 'netCashFlowCents'
  ];
  accounts_receivable: [
    'invoiceDate', 'dueDate', 'amountCents', 'daysOutstanding', 'brandName'
  ];
  commission_tracking: [
    'date', 'commissionCents', 'commissionRate', 'brandName', 'creatorName'
  ];
}
```

### Search and Text Filtering
```typescript
interface SearchConfiguration {
  query?: string;              // Free text search
  searchFields?: string[];     // Fields to search in
  caseSensitive?: boolean;     // Default: false
  exactMatch?: boolean;        // Default: false (partial match)
  searchOperator?: 'AND' | 'OR'; // Multiple terms operator
}

// Search implementation
interface SearchableFields {
  brandName: boolean;
  creatorName: boolean;
  transactionId: boolean;
  description: boolean;
  tags: boolean;
  customFields: boolean;
}
```

This completes the comprehensive API reference and data schemas documentation. The frontend team now has detailed specifications for every data structure and endpoint in the Financial Analytics Reports module.
