# Export & Distribution Module - Frontend Integration Guide (Part 2: Export Formats & Business Logic)

> **Classification: 🔒 ADMIN ONLY** - Export & Distribution functionality is exclusively for admin staff operations

## Table of Contents

1. [Export Format Specifications](#export-format-specifications)
2. [Business Logic & Validation Rules](#business-logic--validation-rules)
3. [Data Processing Pipeline](#data-processing-pipeline)
4. [File Generation & Storage](#file-generation--storage)
5. [Email Delivery System](#email-delivery-system)

---

## Export Format Specifications

### CSV Export Format

#### Configuration Options

```typescript
interface CSVExportOptions {
  delimiter: ',' | ';' | '\t'; // Default: ','
  encoding: 'utf8' | 'utf16'; // Default: 'utf8'
  includeHeaders: boolean; // Default: true
  includeTotals: boolean; // Default: false
  dateFormat: 'ISO' | 'US' | 'EU'; // Default: 'ISO'
  currencyFormat: 'cents' | 'dollars'; // Default: 'dollars'
  nullValue: string; // Default: ''
  booleanFormat: 'true/false' | '1/0' | 'yes/no'; // Default: 'true/false'
}
```

#### Column Definitions by Report Type

```typescript
// Royalty Statements CSV Columns
interface RoyaltyStatementsCSV {
  // Core identification
  statement_id: string;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  
  // Period information
  period_start: string; // ISO date
  period_end: string; // ISO date
  statement_date: string; // ISO date
  
  // Financial data
  gross_earnings_cents: number;
  platform_fee_cents: number;
  net_earnings_cents: number;
  previous_balance_cents: number;
  total_payout_cents: number;
  
  // Transaction details
  license_count: number;
  transaction_count: number;
  unique_buyers: number;
  
  // Asset breakdown
  asset_types: string; // JSON array as string
  license_types: string; // JSON array as string
  
  // Status information
  payout_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  payout_date?: string; // ISO date
  
  // Metadata
  currency: string;
  tax_year: number;
  generated_at: string; // ISO date
}

// Transaction Ledger CSV Columns
interface TransactionLedgerCSV {
  // Transaction identification
  transaction_id: string;
  reference_number: string;
  external_id?: string;
  
  // Entities involved
  creator_id: string;
  creator_name: string;
  brand_id: string;
  brand_name: string;
  asset_id: string;
  asset_title: string;
  
  // Transaction details
  transaction_type: 'PURCHASE' | 'REFUND' | 'PAYOUT' | 'FEE';
  amount_cents: number;
  currency: string;
  exchange_rate?: number;
  
  // Licensing information
  license_type: string;
  license_duration_days?: number;
  usage_rights: string;
  
  // Timing
  transaction_date: string; // ISO date
  effective_date: string; // ISO date
  created_at: string; // ISO date
  
  // Platform data
  platform_fee_cents: number;
  creator_share_cents: number;
  brand_cost_cents: number;
  
  // Payment processing
  payment_method: string;
  payment_processor: string;
  processor_fee_cents: number;
  
  // Status and reconciliation
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  reconciliation_status: 'MATCHED' | 'UNMATCHED' | 'DISPUTED';
  
  // Metadata
  region: string;
  tax_region: string;
  notes?: string;
}
```

#### CSV Generation Process

```typescript
class CSVExportService {
  async generateCSV(config: CSVExportConfig): Promise<Buffer> {
    // 1. Fetch data based on report type and filters
    const rawData = await this.fetchReportData(config);
    
    // 2. Transform data to CSV format
    const csvData = this.transformToCSVFormat(rawData, config.reportType);
    
    // 3. Apply formatting options
    const formattedData = this.applyFormatting(csvData, config);
    
    // 4. Add totals row if requested
    if (config.includeTotals) {
      const totalsRow = this.calculateTotalsRow(formattedData);
      formattedData.push(totalsRow);
    }
    
    // 5. Convert to CSV buffer
    return this.generateCSVBuffer(formattedData, config);
  }
  
  private transformToCSVFormat(data: any[], reportType: string): CSVDataRow[] {
    switch (reportType) {
      case 'royalty_statements':
        return data.map(item => ({
          statement_id: item.id,
          creator_id: item.creatorId,
          creator_name: item.creator.user.name,
          creator_email: item.creator.user.email,
          period_start: item.periodStart.toISOString(),
          period_end: item.periodEnd.toISOString(),
          gross_earnings_cents: item.grossEarningsCents,
          platform_fee_cents: item.platformFeeCents,
          net_earnings_cents: item.netEarningsCents,
          // ... additional fields
        }));
      
      case 'transaction_ledger':
        return data.map(item => ({
          transaction_id: item.id,
          reference_number: item.referenceNumber,
          creator_name: item.license.asset.creator.user.name,
          brand_name: item.license.brand.companyName,
          asset_title: item.license.asset.title,
          amount_cents: item.amountCents,
          transaction_date: item.transactionDate.toISOString(),
          // ... additional fields
        }));
      
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }
}
```

### Excel Export Format

#### Workbook Structure

```typescript
interface ExcelWorkbookStructure {
  worksheets: {
    // Main data worksheet
    data: {
      name: string; // e.g., "Royalty Statements"
      columns: ExcelColumn[];
      data: any[][];
      formatting: ExcelFormatting;
    };
    
    // Summary worksheet (optional)
    summary?: {
      name: string; // e.g., "Summary"
      charts: ExcelChart[];
      metrics: SummaryMetric[];
      formatting: ExcelFormatting;
    };
    
    // Metadata worksheet
    metadata: {
      name: string; // "Metadata"
      info: MetadataInfo;
      parameters: ExportParameters;
    };
  };
}

interface ExcelColumn {
  header: string;
  key: string;
  width: number;
  type: 'text' | 'number' | 'currency' | 'date' | 'percentage';
  format?: string;
  formula?: string;
}

interface ExcelFormatting {
  headerStyle: {
    font: { bold: boolean; color: string; size: number };
    fill: { type: 'pattern'; pattern: 'solid'; fgColor: string };
    border: { top: object; left: object; bottom: object; right: object };
    alignment: { horizontal: string; vertical: string };
  };
  dataStyle: {
    font: { color: string; size: number };
    border: { bottom: object };
    alignment: { horizontal: string };
  };
  currencyFormat: string; // '$#,##0.00'
  dateFormat: string; // 'mm/dd/yyyy'
  percentageFormat: string; // '0.00%'
}
```

#### Excel Generation Features

```typescript
interface ExcelFeatures {
  // Data visualization
  charts: {
    revenue_trend: {
      type: 'line';
      xAxis: 'date';
      yAxis: 'revenue';
      title: 'Revenue Trend Over Time';
    };
    creator_earnings: {
      type: 'bar';
      xAxis: 'creator_name';
      yAxis: 'earnings';
      title: 'Top Creator Earnings';
    };
    asset_distribution: {
      type: 'pie';
      data: 'asset_types';
      title: 'Asset Type Distribution';
    };
  };
  
  // Conditional formatting
  conditionalFormatting: {
    revenue_growth: {
      range: 'growth_rate_column';
      rules: [
        { condition: '>0', format: { fill: { color: 'green' } } },
        { condition: '<0', format: { fill: { color: 'red' } } },
      ];
    };
    payout_status: {
      range: 'status_column';
      rules: [
        { condition: '="COMPLETED"', format: { fill: { color: 'lightgreen' } } },
        { condition: '="FAILED"', format: { fill: { color: 'lightcoral' } } },
      ];
    };
  };
  
  // Formulas and calculations
  formulas: {
    totals: {
      gross_earnings: 'SUM(gross_earnings_range)';
      platform_fees: 'SUM(platform_fee_range)';
      net_earnings: 'SUM(net_earnings_range)';
    };
    averages: {
      avg_transaction: 'AVERAGE(transaction_amount_range)';
      avg_commission: 'AVERAGE(commission_rate_range)';
    };
  };
  
  // Data validation
  validation: {
    dropdown_lists: {
      asset_types: ['image', 'video', 'audio', 'document'];
      license_types: ['standard', 'extended', 'exclusive'];
      currencies: ['USD', 'EUR', 'GBP', 'CAD'];
    };
  };
}
```

### PDF Export Format

#### PDF Layout Configuration

```typescript
interface PDFLayoutConfig {
  pageSettings: {
    size: 'A4' | 'Letter' | 'Legal';
    orientation: 'portrait' | 'landscape';
    margins: {
      top: number; // in points
      right: number;
      bottom: number;
      left: number;
    };
  };
  
  branding: {
    logo: {
      enabled: boolean;
      url: string;
      width: number;
      height: number;
      position: 'header-left' | 'header-center' | 'header-right';
    };
    colors: {
      primary: string; // Hex color
      secondary: string;
      accent: string;
      text: string;
      background: string;
    };
    fonts: {
      primary: string;
      secondary: string;
      monospace: string;
    };
  };
  
  sections: {
    coverPage: boolean;
    executiveSummary: boolean;
    tableOfContents: boolean;
    dataSection: boolean;
    chartSection: boolean;
    appendix: boolean;
    footer: boolean;
  };
}
```

#### PDF Content Structure

```typescript
interface PDFContent {
  // Cover page
  coverPage: {
    title: string;
    subtitle: string;
    reportType: string;
    period: string;
    generatedBy: string;
    generatedAt: string;
    confidentialityNotice: string;
  };
  
  // Executive summary
  executiveSummary: {
    overview: string;
    keyMetrics: Array<{
      label: string;
      value: string;
      change?: string;
      trend?: 'up' | 'down' | 'stable';
    }>;
    highlights: string[];
    insights: string[];
  };
  
  // Data tables
  dataTables: Array<{
    title: string;
    columns: Array<{
      header: string;
      key: string;
      alignment: 'left' | 'center' | 'right';
      format: 'text' | 'currency' | 'date' | 'number';
    }>;
    rows: any[][];
    totals?: any[];
    pageBreakAfter?: boolean;
  }>;
  
  // Charts and visualizations
  charts: Array<{
    title: string;
    type: 'bar' | 'line' | 'pie' | 'table';
    data: any;
    options: any;
    pageBreakBefore?: boolean;
  }>;
  
  // Appendix
  appendix: {
    methodology: string;
    definitions: Array<{
      term: string;
      definition: string;
    }>;
    disclaimers: string[];
    contactInfo: {
      department: string;
      email: string;
      phone?: string;
    };
  };
}
```

---

## Business Logic & Validation Rules

### Date Range Validation

```typescript
interface DateRangeValidationRules {
  // Maximum date range constraints
  maxRangeConstraints: {
    revenue_reports: 730; // 2 years maximum
    transaction_ledger: 365; // 1 year maximum
    creator_earnings: 1095; // 3 years maximum
    payout_summary: 180; // 6 months maximum
    reconciliation: 90; // 3 months maximum
  };
  
  // Future date restrictions
  futureDataPolicy: {
    allowFutureDates: false;
    maxFutureDays: 0;
    errorMessage: 'Cannot generate reports for future dates';
  };
  
  // Historical data limits
  historicalLimits: {
    earliest_available_date: '2020-01-01'; // Platform launch date
    data_retention_years: 7; // Financial record retention
  };
  
  // Business day considerations
  businessDayRules: {
    excludeWeekends: false; // Financial data includes weekends
    excludeHolidays: false; // Platform operates on holidays
    timezone: 'UTC'; // All dates stored in UTC
  };
}

// Validation function
function validateDateRange(
  startDate: Date,
  endDate: Date,
  reportType: string
): ValidationResult {
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const maxDays = maxRangeConstraints[reportType] || 365;
  
  if (daysDiff > maxDays) {
    return {
      valid: false,
      error: `Date range too large. Maximum ${maxDays} days allowed for ${reportType}`,
      code: 'DATE_RANGE_TOO_LARGE'
    };
  }
  
  if (endDate > new Date()) {
    return {
      valid: false,
      error: 'End date cannot be in the future',
      code: 'FUTURE_DATE_NOT_ALLOWED'
    };
  }
  
  const earliestDate = new Date('2020-01-01');
  if (startDate < earliestDate) {
    return {
      valid: false,
      error: `Start date cannot be before ${earliestDate.toISOString().split('T')[0]}`,
      code: 'DATE_BEFORE_PLATFORM_LAUNCH'
    };
  }
  
  return { valid: true };
}
```

### Report Generation Limits

```typescript
interface ReportGenerationLimits {
  // Concurrent generation limits
  concurrency: {
    per_user: 3; // Max 3 concurrent reports per user
    global: 10; // Max 10 concurrent reports globally
    per_report_type: {
      revenue: 2;
      payouts: 2;
      reconciliation: 1;
      custom: 3;
    };
  };
  
  // Rate limiting
  rateLimits: {
    per_hour: 10; // Max 10 reports per hour per user
    per_day: 50; // Max 50 reports per day per user
    per_month: 500; // Max 500 reports per month per user
  };
  
  // File size limits
  fileSizeLimits: {
    csv: 50 * 1024 * 1024; // 50MB
    excel: 100 * 1024 * 1024; // 100MB
    pdf: 25 * 1024 * 1024; // 25MB
    json: 20 * 1024 * 1024; // 20MB
  };
  
  // Data volume limits
  dataVolumeLimits: {
    max_records_csv: 1000000; // 1M records
    max_records_excel: 500000; // 500K records
    max_records_pdf: 10000; // 10K records (for readability)
    max_records_json: 100000; // 100K records
  };
}
```

### Data Privacy & Security Rules

```typescript
interface DataPrivacyRules {
  // PII handling
  personallyIdentifiableInformation: {
    creator_emails: {
      mask_in_exports: false; // Admins can see full emails
      hash_for_analytics: true;
      audit_access: true;
    };
    payment_methods: {
      last_four_digits_only: true;
      full_details_admin_only: true;
      audit_access: true;
    };
    addresses: {
      include_in_exports: false; // Exclude unless specifically needed
      admin_access_only: true;
    };
  };
  
  // Data classification
  dataClassification: {
    financial_amounts: 'CONFIDENTIAL';
    creator_earnings: 'CONFIDENTIAL';
    transaction_details: 'RESTRICTED';
    platform_metrics: 'INTERNAL';
    aggregate_statistics: 'INTERNAL';
  };
  
  // Export restrictions
  exportRestrictions: {
    external_sharing: false; // No external sharing allowed
    download_tracking: true; // Track all downloads
    expiration_required: true; // All downloads must expire
    watermarking: {
      pdf: true; // Watermark PDF exports
      excel: false; // Don't watermark Excel (affects functionality)
      csv: false; // Can't watermark CSV effectively
    };
  };
}
```

### Calculation Rules

```typescript
interface FinancialCalculationRules {
  // Currency handling
  currency: {
    base_currency: 'USD';
    store_as_cents: true; // All amounts stored as integers in cents
    precision: 2; // Display precision for dollars
    rounding_method: 'round_half_up'; // Standard financial rounding
  };
  
  // Platform fees
  platformFees: {
    standard_rate: 0.15; // 15% platform fee
    minimum_fee_cents: 50; // $0.50 minimum fee
    fee_calculation_method: 'gross_amount'; // Fee calculated on gross amount
    fee_rounding: 'round_up'; // Always round fees up
  };
  
  // Creator earnings
  creatorEarnings: {
    base_rate: 0.85; // 85% of gross to creator (100% - 15% platform fee)
    minimum_payout_cents: 2500; // $25.00 minimum payout
    payout_frequency: 'monthly'; // Monthly payout schedule
    holdback_period_days: 14; // 14-day holdback for chargebacks
  };
  
  // Tax calculations
  taxCalculations: {
    track_by_tax_year: true; // Track earnings by tax year
    issue_1099_threshold_cents: 60000; // $600 threshold for 1099
    backup_withholding_rate: 0.24; // 24% backup withholding
    international_rate: 0.30; // 30% withholding for international creators
  };
  
  // Revenue recognition
  revenueRecognition: {
    recognition_method: 'immediate'; // Recognize revenue immediately on purchase
    refund_handling: 'reverse_recognition'; // Reverse revenue on refund
    chargeback_handling: 'immediate_reversal'; // Immediate reversal on chargeback
  };
}
```

---

## Data Processing Pipeline

### Data Extraction Process

```typescript
interface DataExtractionPipeline {
  // Step 1: Query building
  queryBuilder: {
    baseQuery: (reportType: string, dateRange: DateRange) => string;
    applyFilters: (query: string, filters: ReportFilters) => string;
    optimizeQuery: (query: string) => string;
    addSorting: (query: string, sortOptions: SortOptions) => string;
  };
  
  // Step 2: Data fetching
  dataFetching: {
    batchSize: 10000; // Process in batches of 10K records
    parallelBatches: 3; // Process up to 3 batches in parallel
    connectionPooling: true; // Use connection pooling for efficiency
    queryTimeout: 30000; // 30 second timeout per query
  };
  
  // Step 3: Data transformation
  dataTransformation: {
    normalizeAmounts: (record: any) => any; // Convert cents to dollars
    formatDates: (record: any) => any; // Format dates consistently
    calculateDerived: (record: any) => any; // Calculate derived fields
    validateRecord: (record: any) => boolean; // Validate each record
  };
  
  // Step 4: Aggregation
  aggregation: {
    groupBy: string[]; // Fields to group by
    metrics: AggregationMetric[]; // Metrics to calculate
    filters: AggregationFilter[]; // Post-aggregation filters
    sorting: SortOptions; // Sort aggregated results
  };
}

// Example data extraction for transaction ledger
async function extractTransactionLedgerData(
  config: ReportConfig
): Promise<TransactionLedgerRecord[]> {
  // Build optimized query
  const query = `
    SELECT 
      t.id,
      t.reference_number,
      t.amount_cents,
      t.transaction_date,
      t.status,
      t.platform_fee_cents,
      l.license_type,
      a.title as asset_title,
      c.user.name as creator_name,
      b.company_name as brand_name,
      t.created_at
    FROM transactions t
    JOIN licenses l ON t.license_id = l.id
    JOIN assets a ON l.asset_id = a.id
    JOIN creators c ON a.creator_id = c.id
    JOIN brands b ON l.brand_id = b.id
    WHERE t.transaction_date >= $1 
      AND t.transaction_date <= $2
      ${config.filters ? buildFilterClause(config.filters) : ''}
    ORDER BY t.transaction_date DESC
  `;
  
  // Execute with pagination
  const batchSize = 10000;
  let offset = 0;
  let allRecords: TransactionLedgerRecord[] = [];
  
  while (true) {
    const batchQuery = `${query} LIMIT ${batchSize} OFFSET ${offset}`;
    const batch = await prisma.$queryRaw(batchQuery, config.startDate, config.endDate);
    
    if (batch.length === 0) break;
    
    // Transform and validate batch
    const transformedBatch = batch
      .map(transformTransactionRecord)
      .filter(validateTransactionRecord);
    
    allRecords = allRecords.concat(transformedBatch);
    offset += batchSize;
    
    // Prevent infinite loops
    if (offset > 1000000) {
      throw new Error('Data set too large, please refine filters');
    }
  }
  
  return allRecords;
}
```

### Performance Optimization

```typescript
interface PerformanceOptimizations {
  // Database optimizations
  database: {
    indexes: string[]; // Required indexes for fast queries
    queryOptimization: boolean; // Use query optimization
    connectionPooling: boolean; // Use connection pooling
    readReplicas: boolean; // Use read replicas for reporting
  };
  
  // Caching strategy
  caching: {
    queryResultCache: {
      enabled: boolean;
      ttl: number; // Cache TTL in seconds
      keyPattern: string; // Cache key pattern
    };
    aggregationCache: {
      enabled: boolean;
      ttl: number;
      warmupSchedule: string; // Cron schedule for cache warmup
    };
  };
  
  // Streaming processing
  streaming: {
    enableStreaming: boolean; // Stream large datasets
    chunkSize: number; // Size of each chunk
    backpressure: boolean; // Handle backpressure
    errorHandling: 'abort' | 'skip' | 'retry'; // Error handling strategy
  };
  
  // Memory management
  memoryManagement: {
    maxMemoryUsage: number; // Max memory usage in MB
    garbageCollection: boolean; // Force GC between batches
    memoryMonitoring: boolean; // Monitor memory usage
  };
}
```

---

## File Generation & Storage

### Storage Architecture

```typescript
interface StorageArchitecture {
  // Storage providers
  providers: {
    primary: 'cloudflare-r2'; // Primary storage
    backup: 'aws-s3'; // Backup storage
    cdn: 'cloudflare-cdn'; // CDN for fast delivery
  };
  
  // Storage structure
  structure: {
    baseDir: 'financial-reports/';
    structure: '{year}/{month}/{reportType}/{reportId}/';
    filename: '{reportName}_{timestamp}.{format}';
    example: 'financial-reports/2024/10/revenue/rpt_abc123/monthly-revenue_20241015T143022Z.pdf';
  };
  
  // Storage policies
  policies: {
    encryption: 'AES-256'; // Encryption at rest
    lifecycle: {
      standard: 30; // Keep in standard storage for 30 days
      infrequent: 365; // Move to infrequent access after 1 year
      archive: 2555; // Archive after 7 years
      delete: null; // Never auto-delete (manual retention policy)
    };
    replication: {
      crossRegion: true; // Cross-region replication
      regions: ['us-east-1', 'eu-west-1']; // Replication regions
    };
  };
}
```

### File Upload Process

```typescript
interface FileUploadProcess {
  // Step 1: Pre-upload validation
  validation: {
    fileSizeCheck: (size: number, format: string) => boolean;
    formatValidation: (format: string) => boolean;
    contentValidation: (content: Buffer) => boolean;
    virusScan: boolean; // Scan for viruses
  };
  
  // Step 2: Encryption
  encryption: {
    algorithm: 'AES-256-GCM';
    keyRotation: true; // Rotate encryption keys
    keyManagement: 'aws-kms'; // Key management service
  };
  
  // Step 3: Upload to storage
  upload: {
    multipart: boolean; // Use multipart upload for large files
    checksumValidation: boolean; // Validate checksums
    retryPolicy: {
      maxRetries: 3;
      backoffMultiplier: 2;
      initialDelay: 1000; // 1 second initial delay
    };
  };
  
  // Step 4: Post-upload processing
  postProcessing: {
    thumbnailGeneration: boolean; // Generate thumbnails for PDFs
    metadataExtraction: boolean; // Extract file metadata
    indexing: boolean; // Index for search
    auditLogging: boolean; // Log upload event
  };
}

// Upload implementation
async function uploadReportFile(
  reportId: string,
  content: Buffer,
  format: string,
  metadata: FileMetadata
): Promise<UploadResult> {
  try {
    // Validate file
    const validation = validateReportFile(content, format);
    if (!validation.valid) {
      throw new Error(`File validation failed: ${validation.error}`);
    }
    
    // Generate storage key
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const storageKey = `financial-reports/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${metadata.reportType}/${reportId}/${metadata.filename}_${timestamp}.${format}`;
    
    // Encrypt content
    const encryptedContent = await encryptFile(content);
    
    // Upload to primary storage
    const uploadResult = await storageProvider.upload({
      key: storageKey,
      file: encryptedContent,
      contentType: getContentType(format),
      metadata: {
        reportId,
        reportType: metadata.reportType,
        generatedBy: metadata.generatedBy,
        originalSize: content.length,
        encryptionVersion: 'v1',
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Update database record
    await prisma.financialReport.update({
      where: { id: reportId },
      data: {
        storageKey,
        fileSize: content.length,
        status: 'COMPLETED',
        metadata: {
          filename: `${metadata.filename}_${timestamp}.${format}`,
          contentType: getContentType(format),
          encryptionKey: uploadResult.encryptionKey
        }
      }
    });
    
    return {
      success: true,
      storageKey,
      downloadUrl: await generateDownloadUrl(storageKey)
    };
    
  } catch (error) {
    // Log error and update report status
    await auditService.log({
      action: 'REPORT_UPLOAD_FAILED',
      entityType: 'financial_report',
      entityId: reportId,
      after: { error: error.message }
    });
    
    await prisma.financialReport.update({
      where: { id: reportId },
      data: { status: 'FAILED', errorMessage: error.message }
    });
    
    throw error;
  }
}
```

---

## Email Delivery System

### Email Templates

```typescript
interface EmailTemplateConfig {
  // Report ready notification
  reportReady: {
    templateId: 'financial-report-ready';
    subject: 'Financial Report Ready: {reportType}';
    variables: {
      recipientName: string;
      reportTitle: string;
      reportType: string;
      reportPeriod: string;
      generatedAt: string;
      downloadUrl: string;
      expiresAt: string;
      fileSize: string;
      reportSummary?: {
        totalRevenue?: string;
        totalTransactions?: string;
        keyMetric?: string;
      };
    };
  };
  
  // Scheduled report delivery
  scheduledDelivery: {
    templateId: 'scheduled-report-delivery';
    subject: '{reportName} - {reportPeriod}';
    variables: {
      recipientName: string;
      reportName: string;
      reportType: string;
      reportPeriod: string;
      frequency: string;
      downloadUrl: string;
      expiresAt: string;
      nextScheduledDate: string;
      attachmentCount: number;
      fileFormats: string[];
      reportSummary?: {
        keyMetrics: Array<{
          label: string;
          value: string;
          trend?: 'up' | 'down' | 'stable';
        }>;
      };
    };
  };
  
  // Error notification
  generationError: {
    templateId: 'report-generation-error';
    subject: 'Report Generation Failed: {reportType}';
    variables: {
      recipientName: string;
      reportType: string;
      errorMessage: string;
      supportContactInfo: string;
      retryUrl: string;
    };
  };
}
```

### Email Delivery Configuration

```typescript
interface EmailDeliveryConfig {
  // Delivery options
  delivery: {
    provider: 'resend'; // Email service provider
    fromAddress: 'reports@yesgoddess.com';
    fromName: 'YesGoddess Financial Reports';
    replyToAddress: 'finance@yesgoddess.com';
  };
  
  // Attachment handling
  attachments: {
    maxSize: 10 * 1024 * 1024; // 10MB max attachment size
    allowedFormats: ['pdf', 'csv', 'xlsx']; // Allowed attachment formats
    secureLinksThreshold: 5 * 1024 * 1024; // Use secure links for files > 5MB
    passwordProtection: boolean; // Password protect attachments
  };
  
  // Security settings
  security: {
    encryptEmails: boolean; // Encrypt email content
    digitalSignature: boolean; // Digitally sign emails
    confidentialityHeaders: boolean; // Add confidentiality headers
    trackingPixels: false; // Disable tracking for privacy
  };
  
  // Retry policy
  retryPolicy: {
    maxRetries: 3;
    retryDelays: [1000, 5000, 15000]; // Delays in milliseconds
    exponentialBackoff: true;
    permanentFailureThreshold: 5; // Mark as permanent failure after 5 attempts
  };
}
```

### Email Queue Processing

```typescript
interface EmailQueueProcessor {
  // Queue configuration
  queue: {
    name: 'financial-report-emails';
    concurrency: 5; // Process 5 emails concurrently
    rateLimiting: {
      perMinute: 60; // Max 60 emails per minute
      perHour: 1000; // Max 1000 emails per hour
    };
  };
  
  // Job processing
  jobProcessor: async (job: EmailJob) => {
    try {
      // Prepare email content
      const emailContent = await prepareEmailContent(job.data);
      
      // Send email
      const result = await emailService.send({
        to: job.data.recipients,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: emailContent.attachments
      });
      
      // Log successful delivery
      await auditService.log({
        action: 'REPORT_EMAIL_SENT',
        entityType: 'financial_report',
        entityId: job.data.reportId,
        after: {
          recipients: job.data.recipients,
          messageId: result.messageId
        }
      });
      
      return { success: true, messageId: result.messageId };
      
    } catch (error) {
      // Log failure
      await auditService.log({
        action: 'REPORT_EMAIL_FAILED',
        entityType: 'financial_report',
        entityId: job.data.reportId,
        after: {
          error: error.message,
          recipients: job.data.recipients
        }
      });
      
      throw error;
    }
  };
}
```

---

## Next Steps

Continue to [Part 3: Error Handling & Implementation](./EXPORT_DISTRIBUTION_INTEGRATION_GUIDE_PART_3_ERROR_HANDLING_IMPLEMENTATION.md) for comprehensive error handling, implementation checklist, and troubleshooting guidance.

For questions or clarification, contact the backend team or refer to the [complete API documentation](../api/).
