# Report Generation Module - Frontend Integration Guide
## Part 2: TypeScript Types, Business Logic & Error Handling

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only

**Last Updated:** October 17, 2025  
**Module:** Report Generation Service  
**Backend Repo:** yg-backend  
**Frontend Repo:** yesgoddess-web

---

## Table of Contents

1. [TypeScript Type Definitions](#typescript-type-definitions)
2. [Zod Validation Schemas](#zod-validation-schemas)
3. [Business Logic & Validation Rules](#business-logic--validation-rules)
4. [Error Handling](#error-handling)
5. [Authorization & Permissions](#authorization--permissions)
6. [State Management](#state-management)

---

## TypeScript Type Definitions

### Core Report Types

```typescript
/**
 * Base Report Configuration
 * Used for all report generation requests
 */
export interface BaseReportConfig {
  id?: string; // CUID, optional for new reports
  name: string; // 1-200 characters
  description?: string; // Max 1000 characters
  startDate: Date;
  endDate: Date;
  generatedBy: string; // User CUID
  generatedAt?: Date;
  format: 'pdf' | 'csv' | 'excel' | 'json'; // Default: 'pdf'
  filters?: ReportFilters;
}

export interface ReportFilters {
  brandIds?: string[]; // Array of brand CUIDs
  creatorIds?: string[]; // Array of creator CUIDs
  projectIds?: string[]; // Array of project CUIDs
  assetTypes?: string[]; // e.g., ['IMAGE', 'VIDEO']
  licenseTypes?: string[]; // e.g., ['EXCLUSIVE', 'NON_EXCLUSIVE']
  paymentStatuses?: string[]; // e.g., ['PAID', 'PENDING']
  regions?: string[]; // e.g., ['US', 'EU', 'APAC']
  currencies?: string[]; // ISO currency codes, e.g., ['USD', 'EUR']
}

/**
 * Report Generation Status
 */
export type ReportStatus = 'GENERATING' | 'COMPLETED' | 'FAILED';

/**
 * Report Type Enum
 */
export type ReportType = 
  | 'revenue'
  | 'payouts'
  | 'reconciliation'
  | 'custom'
  | 'financial_statement'
  | 'revenue_reconciliation'
  | 'transaction_ledger'
  | 'platform_fee'
  | 'creator_earnings'
  | 'brand_spend_analysis'
  | 'period_comparison';

/**
 * Export Format
 */
export type ExportFormat = 'pdf' | 'csv' | 'excel' | 'json';
```

---

### Custom Report Builder Types

```typescript
/**
 * Custom Report Configuration
 * For ad-hoc report creation
 */
export interface CustomReportConfig {
  name: string; // 1-255 characters
  description?: string;
  reportCategory: ReportCategory;
  dataSource: CustomReportDataSource;
  metrics: CustomReportMetric[];
  groupBy?: CustomReportGroupBy[];
  sorting?: CustomReportSorting;
  limit?: number; // 1-10000
  outputFormat: ExportFormat; // Default: 'pdf'
  deliveryOptions?: CustomReportDeliveryOptions;
}

export type ReportCategory = 
  | 'financial'
  | 'operational'
  | 'creator_performance'
  | 'brand_campaign'
  | 'asset_portfolio'
  | 'license_analytics';

export interface CustomReportDataSource {
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
}

export interface CustomReportMetric {
  field: string; // Field name from data source
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count';
  label?: string; // Display label
  format?: 'currency' | 'number' | 'percentage';
}

export interface CustomReportGroupBy {
  field: string;
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  label?: string;
}

export interface CustomReportSorting {
  field: string;
  direction: 'asc' | 'desc';
}

export interface CustomReportDeliveryOptions {
  emailRecipients?: string[]; // Email addresses
  downloadLink: boolean; // Default: true
}

/**
 * Report Field Definition
 * Describes available fields for custom reports
 */
export interface ReportFieldDefinition {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  category: string;
  aggregatable: boolean; // Can use SUM, AVG, etc.
  groupable: boolean; // Can use in GROUP BY
  filterable: boolean; // Can use in WHERE clause
  description?: string;
}
```

---

### Scheduled Reports Types

```typescript
/**
 * Scheduled Report Configuration
 */
export interface ScheduledReportConfig {
  id?: string; // CUID
  name: string; // 1-200 characters
  description?: string; // Max 1000 characters
  reportType: string; // Report type identifier
  frequency: ScheduledReportFrequency;
  schedule: ScheduledReportSchedule;
  config: BaseReportConfig; // The report configuration to generate
  recipients: ScheduledReportRecipient[]; // Min 1 recipient
  enabled: boolean; // Default: true
  createdBy: string; // User CUID
}

export type ScheduledReportFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface ScheduledReportSchedule {
  dayOfWeek?: number; // 0-6 (Sunday-Saturday), required for weekly
  dayOfMonth?: number; // 1-31, required for monthly/quarterly/annually
  hour: number; // 0-23
  minute: number; // 0-59
  timezone: string; // IANA timezone, e.g., 'America/New_York'
}

export interface ScheduledReportRecipient {
  email: string; // Valid email address
  name: string; // Min 1 character
  role: string; // Min 1 character
}

/**
 * Scheduled Report with Runtime Data
 */
export interface ScheduledReport extends ScheduledReportConfig {
  id: string; // Required for existing reports
  isActive: boolean;
  cronExpression: string;
  lastGeneratedAt: Date | null;
  nextScheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  recentReports: Array<{
    id: string;
    status: ReportStatus;
    generatedAt: Date;
  }>;
}
```

---

### Report Templates Types

```typescript
/**
 * Report Template Definition
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
  estimatedGenerationTime: string; // e.g., "2-3 minutes"
  supportedFormats: ExportFormat[];
  accessLevel: UserRole[]; // Who can use this template
}

export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  type: 'summary' | 'timeseries' | 'breakdown' | 'comparison' | 'table' | 'chart';
  required: boolean;
  dataQuery: any; // Backend-specific query configuration
  visualization?: {
    type: 'line' | 'bar' | 'pie' | 'table' | 'metric';
    config: Record<string, any>;
  };
}

export type UserRole = 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
```

---

### Export & Download Types

```typescript
/**
 * Report Export Configuration
 */
export interface ReportExportConfig {
  format: ExportFormat;
  template?: string; // Template ID for custom layouts
  branding: boolean; // Default: true
  compression: boolean; // Default: false
  password?: string; // Min 8 characters
  metadata?: Record<string, any>;
}

/**
 * Download Response
 */
export interface ReportDownloadResponse {
  downloadUrl: string; // Time-limited signed URL
  filename: string;
  expiresAt: Date; // URL expiration (1 hour)
  reportInfo: {
    id: string;
    type: string;
    generatedAt: Date;
    size: string; // Human-readable, e.g., "2.4 MB"
  };
}

/**
 * Report Download Record
 * For audit trail
 */
export interface ReportDownloadRecord {
  id: string;
  reportId: string;
  userId: string;
  downloadUrl: string;
  expiresAt: Date;
  downloadedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
}
```

---

### Saved Configuration Types

```typescript
/**
 * Saved Report Configuration
 * For reusing custom report configurations
 */
export interface SavedReportConfig {
  id: string;
  userId: string;
  name: string;
  description?: string;
  config: CustomReportConfig;
  isPublic: boolean; // False = private to user
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
  tags: string[];
}
```

---

## Zod Validation Schemas

### Client-Side Validation

Use these Zod schemas for form validation before sending requests to the backend.

```typescript
import { z } from 'zod';

/**
 * Base Report Config Schema
 */
export const baseReportConfigSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1, 'Report name is required').max(200, 'Report name must be 200 characters or less'),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
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
  { 
    message: 'End date must be after or equal to start date',
    path: ['endDate']
  }
);

/**
 * Custom Report Config Schema
 */
export const customReportConfigSchema = z.object({
  name: z.string().min(1, 'Report name is required').max(255),
  description: z.string().optional(),
  reportCategory: z.enum([
    'financial',
    'operational',
    'creator_performance',
    'brand_campaign',
    'asset_portfolio',
    'license_analytics'
  ], { errorMap: () => ({ message: 'Invalid report category' }) }),
  dataSource: z.object({
    primaryEntity: z.enum(['transactions', 'royalties', 'licenses', 'assets', 'creators', 'brands']),
    dateRange: z.object({
      startDate: z.coerce.date(),
      endDate: z.coerce.date()
    }).refine(
      (data) => data.endDate >= data.startDate,
      { message: 'End date must be after or equal to start date' }
    ),
    filters: z.object({
      creatorIds: z.array(z.string()).optional(),
      brandIds: z.array(z.string()).optional(),
      assetTypes: z.array(z.string()).optional(),
      licenseTypes: z.array(z.string()).optional(),
      statuses: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      amountRange: z.object({
        minCents: z.number().int().min(0).optional(),
        maxCents: z.number().int().min(0).optional()
      }).refine(
        (data) => !data.minCents || !data.maxCents || data.maxCents >= data.minCents,
        { message: 'Max amount must be greater than or equal to min amount' }
      ).optional()
    }).optional()
  }),
  metrics: z.array(z.object({
    field: z.string().min(1, 'Field is required'),
    aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'distinct_count']),
    label: z.string().optional(),
    format: z.enum(['currency', 'number', 'percentage']).optional()
  })).min(1, 'At least one metric is required'),
  groupBy: z.array(z.object({
    field: z.string().min(1),
    granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
    label: z.string().optional()
  })).optional(),
  sorting: z.object({
    field: z.string().min(1),
    direction: z.enum(['asc', 'desc'])
  }).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  outputFormat: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  deliveryOptions: z.object({
    emailRecipients: z.array(z.string().email()).optional(),
    downloadLink: z.boolean().default(true)
  }).optional()
});

/**
 * Scheduled Report Config Schema
 */
export const scheduledReportConfigSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1, 'Schedule name is required').max(200),
  description: z.string().max(1000).optional(),
  reportType: z.string().min(1, 'Report type is required'),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  schedule: z.object({
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    timezone: z.string().min(1, 'Timezone is required'),
  }),
  config: baseReportConfigSchema,
  recipients: z.array(z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(1, 'Recipient name is required'),
    role: z.string().min(1, 'Recipient role is required'),
  })).min(1, 'At least one recipient is required'),
  enabled: z.boolean().default(true),
  createdBy: z.string().cuid(),
}).refine(
  (data) => {
    // Weekly reports need dayOfWeek
    if (data.frequency === 'weekly' && data.schedule.dayOfWeek === undefined) {
      return false;
    }
    return true;
  },
  { 
    message: 'Day of week is required for weekly schedules',
    path: ['schedule', 'dayOfWeek']
  }
).refine(
  (data) => {
    // Monthly/quarterly/annual reports need dayOfMonth
    if (['monthly', 'quarterly', 'annually'].includes(data.frequency) && data.schedule.dayOfMonth === undefined) {
      return false;
    }
    return true;
  },
  { 
    message: 'Day of month is required for monthly, quarterly, and annual schedules',
    path: ['schedule', 'dayOfMonth']
  }
);

/**
 * Report Export Config Schema
 */
export const reportExportConfigSchema = z.object({
  format: z.enum(['pdf', 'csv', 'excel', 'json']),
  template: z.string().optional(),
  branding: z.boolean().default(true),
  compression: z.boolean().default(false),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
```

---

## Business Logic & Validation Rules

### Report Name Validation

```typescript
/**
 * Validate report name
 * - Length: 1-200 characters (1-255 for custom reports)
 * - No leading/trailing whitespace
 * - No special characters that could cause file system issues
 */
export function validateReportName(name: string, isCustom = false): string[] {
  const errors: string[] = [];
  const maxLength = isCustom ? 255 : 200;
  
  if (!name || name.trim().length === 0) {
    errors.push('Report name is required');
  } else if (name.length > maxLength) {
    errors.push(`Report name must be ${maxLength} characters or less`);
  }
  
  if (name !== name.trim()) {
    errors.push('Report name cannot have leading or trailing whitespace');
  }
  
  // Check for invalid file system characters
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(name)) {
    errors.push('Report name contains invalid characters');
  }
  
  return errors;
}
```

---

### Date Range Validation

```typescript
/**
 * Validate date range for reports
 * - startDate must be before endDate
 * - Maximum range: 2 years (730 days) for most reports
 * - startDate cannot be in the future
 */
export function validateDateRange(
  startDate: Date, 
  endDate: Date, 
  maxDays = 730
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check if dates are valid
  if (isNaN(startDate.getTime())) {
    errors.push('Start date is invalid');
  }
  if (isNaN(endDate.getTime())) {
    errors.push('End date is invalid');
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Check order
  if (startDate >= endDate) {
    errors.push('Start date must be before end date');
  }
  
  // Check future dates
  const now = new Date();
  if (startDate > now) {
    errors.push('Start date cannot be in the future');
  }
  
  // Check range
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > maxDays) {
    errors.push(`Date range too large. Maximum ${maxDays} days allowed.`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Suggest optimal granularity based on date range
 */
export function suggestGranularity(startDate: Date, endDate: Date): 'daily' | 'weekly' | 'monthly' {
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysDiff <= 31) {
    return 'daily';
  } else if (daysDiff <= 92) {
    return 'weekly';
  } else {
    return 'monthly';
  }
}
```

---

### Custom Report Validation

```typescript
/**
 * Validate custom report configuration
 */
export function validateCustomReportConfig(config: CustomReportConfig): {
  valid: boolean;
  errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
  warnings: Array<{ field: string; message: string }>;
  suggestions: Array<{ field: string; message: string; suggestion: any }>;
} {
  const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
  const warnings: Array<{ field: string; message: string }> = [];
  const suggestions: Array<{ field: string; message: string; suggestion: any }> = [];
  
  // Validate name
  if (!config.name || config.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Report name is required', severity: 'error' });
  }
  
  // Validate date range
  const dateValidation = validateDateRange(
    config.dataSource.dateRange.startDate,
    config.dataSource.dateRange.endDate
  );
  if (!dateValidation.valid) {
    dateValidation.errors.forEach(error => {
      errors.push({ field: 'dataSource.dateRange', message: error, severity: 'error' });
    });
  }
  
  // Validate metrics
  if (!config.metrics || config.metrics.length === 0) {
    errors.push({ field: 'metrics', message: 'At least one metric is required', severity: 'error' });
  }
  
  // Check for aggregatable fields
  config.metrics.forEach((metric, index) => {
    // This would check against the field definitions from getCustomBuilderFields
    // For now, just validate structure
    if (!metric.field || !metric.aggregation) {
      errors.push({ 
        field: `metrics[${index}]`, 
        message: 'Metric must have field and aggregation', 
        severity: 'error' 
      });
    }
  });
  
  // Warn if no groupBy for aggregated data
  if (config.metrics.length > 0 && (!config.groupBy || config.groupBy.length === 0)) {
    warnings.push({
      field: 'groupBy',
      message: 'Consider adding groupBy fields for better data aggregation'
    });
  }
  
  // Suggest sorting if not specified
  if (!config.sorting) {
    suggestions.push({
      field: 'sorting',
      message: 'Consider adding sorting for better data organization',
      suggestion: {
        field: config.groupBy?.[0]?.field || config.metrics[0].field,
        direction: 'desc'
      }
    });
  }
  
  // Warn about large date ranges
  const daysDiff = Math.abs(
    config.dataSource.dateRange.endDate.getTime() - 
    config.dataSource.dateRange.startDate.getTime()
  ) / (1000 * 60 * 60 * 24);
  
  if (daysDiff > 365) {
    warnings.push({
      field: 'dataSource.dateRange',
      message: 'Large date range may result in slow report generation'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}
```

---

### Scheduled Report Validation

```typescript
/**
 * Validate scheduled report schedule configuration
 */
export function validateSchedule(
  frequency: ScheduledReportFrequency,
  schedule: ScheduledReportSchedule
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate hour and minute
  if (schedule.hour < 0 || schedule.hour > 23) {
    errors.push('Hour must be between 0 and 23');
  }
  if (schedule.minute < 0 || schedule.minute > 59) {
    errors.push('Minute must be between 0 and 59');
  }
  
  // Validate timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: schedule.timezone });
  } catch (e) {
    errors.push('Invalid timezone');
  }
  
  // Frequency-specific validation
  switch (frequency) {
    case 'weekly':
      if (schedule.dayOfWeek === undefined) {
        errors.push('Day of week is required for weekly schedules');
      } else if (schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) {
        errors.push('Day of week must be between 0 (Sunday) and 6 (Saturday)');
      }
      break;
      
    case 'monthly':
    case 'quarterly':
    case 'annually':
      if (schedule.dayOfMonth === undefined) {
        errors.push(`Day of month is required for ${frequency} schedules`);
      } else if (schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
        errors.push('Day of month must be between 1 and 31');
      }
      break;
      
    case 'daily':
      // No additional validation needed
      break;
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Calculate next execution time for scheduled report
 */
export function calculateNextExecution(
  frequency: ScheduledReportFrequency,
  schedule: ScheduledReportSchedule,
  fromDate = new Date()
): Date {
  const nextExec = new Date(fromDate);
  
  // Set time
  nextExec.setHours(schedule.hour, schedule.minute, 0, 0);
  
  // If time has passed today, start from tomorrow
  if (nextExec <= fromDate) {
    nextExec.setDate(nextExec.getDate() + 1);
  }
  
  switch (frequency) {
    case 'daily':
      // Already handled above
      break;
      
    case 'weekly':
      // Find next occurrence of dayOfWeek
      while (nextExec.getDay() !== schedule.dayOfWeek) {
        nextExec.setDate(nextExec.getDate() + 1);
      }
      break;
      
    case 'monthly':
      // Set to specified day of month
      nextExec.setDate(schedule.dayOfMonth!);
      if (nextExec <= fromDate) {
        nextExec.setMonth(nextExec.getMonth() + 1);
        nextExec.setDate(schedule.dayOfMonth!);
      }
      break;
      
    case 'quarterly':
      // Find next quarter boundary
      const currentQuarter = Math.floor(nextExec.getMonth() / 3);
      const nextQuarterMonth = (currentQuarter + 1) * 3 % 12;
      nextExec.setMonth(nextQuarterMonth);
      nextExec.setDate(schedule.dayOfMonth!);
      if (nextExec <= fromDate) {
        nextExec.setMonth(nextExec.getMonth() + 3);
        nextExec.setDate(schedule.dayOfMonth!);
      }
      break;
      
    case 'annually':
      // Move to next year if needed
      nextExec.setMonth(0); // January
      nextExec.setDate(schedule.dayOfMonth!);
      if (nextExec <= fromDate) {
        nextExec.setFullYear(nextExec.getFullYear() + 1);
      }
      break;
  }
  
  return nextExec;
}
```

---

### Email Validation

```typescript
/**
 * Validate email recipients for scheduled reports
 */
export function validateRecipients(recipients: ScheduledReportRecipient[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (recipients.length === 0) {
    errors.push('At least one recipient is required');
  }
  
  if (recipients.length > 50) {
    errors.push('Maximum 50 recipients allowed');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  recipients.forEach((recipient, index) => {
    if (!recipient.email || !emailRegex.test(recipient.email)) {
      errors.push(`Invalid email address for recipient ${index + 1}`);
    }
    
    if (!recipient.name || recipient.name.trim().length === 0) {
      errors.push(`Name is required for recipient ${index + 1}`);
    }
    
    if (!recipient.role || recipient.role.trim().length === 0) {
      errors.push(`Role is required for recipient ${index + 1}`);
    }
  });
  
  // Check for duplicate emails
  const emails = recipients.map(r => r.email.toLowerCase());
  const uniqueEmails = new Set(emails);
  if (emails.length !== uniqueEmails.size) {
    errors.push('Duplicate email addresses are not allowed');
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

## Error Handling

### Error Types

```typescript
/**
 * Report Error Base Class
 */
export class ReportError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string = 'REPORT_ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ReportError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Report Not Found Error
 */
export class ReportNotFoundError extends ReportError {
  constructor(reportId: string) {
    super(
      `Report with ID ${reportId} not found`,
      'REPORT_NOT_FOUND',
      404,
      { reportId }
    );
    this.name = 'ReportNotFoundError';
  }
}

/**
 * Report Generation Error
 */
export class ReportGenerationError extends ReportError {
  constructor(message: string, details?: Record<string, any>) {
    super(
      `Report generation failed: ${message}`,
      'REPORT_GENERATION_FAILED',
      500,
      details
    );
    this.name = 'ReportGenerationError';
  }
}

/**
 * Report Export Error
 */
export class ReportExportError extends ReportError {
  constructor(format: string, message: string) {
    super(
      `Report export to ${format} failed: ${message}`,
      'REPORT_EXPORT_FAILED',
      500,
      { format }
    );
    this.name = 'ReportExportError';
  }
}

/**
 * Report Validation Error
 */
export class ReportValidationError extends ReportError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(
      `Report validation failed: ${message}`,
      'REPORT_VALIDATION_FAILED',
      400,
      { fieldErrors }
    );
    this.name = 'ReportValidationError';
  }
}

/**
 * Report Access Denied Error
 */
export class ReportAccessDeniedError extends ReportError {
  constructor(userId: string, reportId: string, action: string) {
    super(
      `Access denied: User ${userId} cannot ${action} report ${reportId}`,
      'REPORT_ACCESS_DENIED',
      403,
      { userId, reportId, action }
    );
    this.name = 'ReportAccessDeniedError';
  }
}
```

---

### Error Code Reference

| Error Code | HTTP Status | Description | User-Friendly Message | Action Required |
|------------|-------------|-------------|----------------------|-----------------|
| `REPORT_NOT_FOUND` | 404 | Report doesn't exist | "Report not found. It may have been deleted or expired." | Show error message, redirect to report list |
| `REPORT_GENERATION_FAILED` | 500 | Report generation encountered error | "Failed to generate report. Please try again." | Show error message, allow retry |
| `REPORT_EXPORT_FAILED` | 500 | Export to specific format failed | "Failed to export report. Try a different format." | Show error message, suggest alternative format |
| `REPORT_VALIDATION_FAILED` | 400 | Input validation failed | "Invalid report configuration. Please check your inputs." | Display field errors, allow correction |
| `REPORT_ACCESS_DENIED` | 403 | User lacks permission | "You don't have permission to access this report." | Show error message, hide access attempts |
| `REPORT_CONFIG_ERROR` | 400 | Configuration error | "Report configuration is invalid." | Display specific config errors |
| `REPORT_DATA_SOURCE_ERROR` | 500 | Data source unavailable | "Data source temporarily unavailable. Please try again later." | Show error message, allow retry |
| `REPORT_TEMPLATE_NOT_FOUND` | 404 | Template doesn't exist | "Report template not found." | Show error message, redirect |
| `REPORT_SCHEDULE_CONFLICT` | 409 | Schedule conflicts with existing | "A scheduled report with this configuration already exists." | Show error message, suggest modification |
| `REPORT_LIMIT_EXCEEDED` | 429 | Rate limit or quota exceeded | "Report generation limit exceeded. Please try again later." | Show error message with retry time |
| `REPORT_EXPIRED` | 410 | Report has expired | "This report has expired and is no longer available." | Show error message, suggest regeneration |
| `REPORT_TOO_LARGE` | 413 | Report size exceeds limits | "Report is too large. Try reducing the date range or adding filters." | Show error message, suggest optimization |

---

### Error Handling Patterns

```typescript
/**
 * Handle tRPC errors from report endpoints
 */
export function handleReportError(error: unknown): {
  userMessage: string;
  technicalMessage: string;
  canRetry: boolean;
  suggestedAction?: string;
} {
  // Default response
  const response = {
    userMessage: 'An unexpected error occurred.',
    technicalMessage: String(error),
    canRetry: false,
  };
  
  // Handle tRPC errors
  if (error && typeof error === 'object' && 'code' in error) {
    const trpcError = error as { code: string; message: string; data?: any };
    
    switch (trpcError.code) {
      case 'NOT_FOUND':
        response.userMessage = 'Report not found. It may have been deleted or expired.';
        response.canRetry = false;
        break;
        
      case 'BAD_REQUEST':
        response.userMessage = 'Invalid report configuration. Please check your inputs.';
        response.technicalMessage = trpcError.message;
        response.canRetry = false;
        break;
        
      case 'FORBIDDEN':
        response.userMessage = "You don't have permission to access this report.";
        response.canRetry = false;
        break;
        
      case 'TOO_MANY_REQUESTS':
        response.userMessage = 'Too many requests. Please try again in a few minutes.';
        response.canRetry = true;
        response.suggestedAction = 'Wait before retrying';
        break;
        
      case 'INTERNAL_SERVER_ERROR':
        response.userMessage = 'Server error. Please try again later.';
        response.canRetry = true;
        response.suggestedAction = 'Retry in a few moments';
        break;
        
      default:
        response.userMessage = trpcError.message || 'An error occurred.';
        response.canRetry = true;
    }
  }
  
  return response;
}

/**
 * Retry logic for report generation
 */
export async function retryReportGeneration<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      const errorInfo = handleReportError(error);
      
      // Don't retry if error is not retryable
      if (!errorInfo.canRetry || attempt === maxAttempts) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

---

## Authorization & Permissions

### Permission Matrix

| Endpoint | ADMIN | CREATOR | BRAND | VIEWER |
|----------|-------|---------|-------|--------|
| `getRevenue` | ✅ | ❌ | ❌ | ❌ |
| `getPayouts` | ✅ | ❌ | ❌ | ❌ |
| `getReconciliation` | ✅ | ❌ | ❌ | ❌ |
| `generate` | ✅ | ❌ | ❌ | ❌ |
| `download` | ✅ (all) / 👤 (own) | 👤 (own) | 👤 (own) | ❌ |
| `getReportStatus` | ✅ (all) / 👤 (own) | 👤 (own) | 👤 (own) | ❌ |
| `getScheduled` | ✅ | ❌ | ❌ | ❌ |
| `getTemplates` | ✅ (all) | ✅ (creator) | ✅ (brand) | ❌ |
| `generateFromTemplate` | ✅ (all) | ✅ (creator) | ✅ (brand) | ❌ |
| `getCustomBuilderFields` | ✅ | ❌ | ❌ | ❌ |
| `getCustomBuilderDefaults` | ✅ | ❌ | ❌ | ❌ |
| `validateCustomReport` | ✅ | ❌ | ❌ | ❌ |
| `generateCustomReport` | ✅ | ❌ | ❌ | ❌ |
| `saveCustomReportConfig` | ✅ | ❌ | ❌ | ❌ |
| `getSavedConfigs` | ✅ | ❌ | ❌ | ❌ |
| `getReportTypes` | ✅ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ = Full access
- 👤 = Access to own resources only
- ❌ = No access

---

### Permission Check Functions

```typescript
/**
 * Check if user can access report
 */
export function canAccessReport(
  userRole: UserRole,
  userId: string,
  report: { generatedBy: string }
): boolean {
  // Admins can access all reports
  if (userRole === 'ADMIN') {
    return true;
  }
  
  // Users can access their own reports
  return report.generatedBy === userId;
}

/**
 * Check if user can generate report of type
 */
export function canGenerateReportType(
  userRole: UserRole,
  reportType: string
): boolean {
  const adminOnlyTypes = [
    'revenue',
    'payouts',
    'reconciliation',
    'custom',
    'financial_statement',
    'revenue_reconciliation',
    'transaction_ledger',
    'platform_fee'
  ];
  
  if (adminOnlyTypes.includes(reportType)) {
    return userRole === 'ADMIN';
  }
  
  // Other report types accessible by role
  return ['ADMIN', 'CREATOR', 'BRAND'].includes(userRole);
}

/**
 * Filter templates by user role
 */
export function filterTemplatesByRole(
  templates: ReportTemplateDefinition[],
  userRole: UserRole
): ReportTemplateDefinition[] {
  return templates.filter(template => 
    template.accessLevel.includes(userRole)
  );
}
```

---

## State Management

### Report Generation State Machine

```typescript
/**
 * Report generation lifecycle states
 */
export type ReportLifecycleState = 
  | 'idle'
  | 'validating'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'expired';

/**
 * State transitions
 */
export const REPORT_STATE_TRANSITIONS: Record<ReportLifecycleState, ReportLifecycleState[]> = {
  idle: ['validating'],
  validating: ['queued', 'failed'],
  queued: ['generating', 'failed'],
  generating: ['completed', 'failed'],
  completed: ['expired'],
  failed: ['validating'], // Can retry
  expired: ['idle'], // Can regenerate
};

/**
 * Check if state transition is valid
 */
export function isValidStateTransition(
  from: ReportLifecycleState,
  to: ReportLifecycleState
): boolean {
  return REPORT_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * React state management example using Zustand
 */
import { create } from 'zustand';

interface ReportStore {
  reports: Map<string, {
    id: string;
    state: ReportLifecycleState;
    config: any;
    error?: string;
    progress?: number;
    downloadUrl?: string;
  }>;
  
  setReportState: (reportId: string, state: ReportLifecycleState) => void;
  setReportError: (reportId: string, error: string) => void;
  setReportProgress: (reportId: string, progress: number) => void;
  setReportDownloadUrl: (reportId: string, url: string) => void;
  removeReport: (reportId: string) => void;
}

export const useReportStore = create<ReportStore>((set) => ({
  reports: new Map(),
  
  setReportState: (reportId, state) => set((store) => {
    const report = store.reports.get(reportId);
    if (report && isValidStateTransition(report.state, state)) {
      const newReports = new Map(store.reports);
      newReports.set(reportId, { ...report, state });
      return { reports: newReports };
    }
    return store;
  }),
  
  setReportError: (reportId, error) => set((store) => {
    const report = store.reports.get(reportId);
    if (report) {
      const newReports = new Map(store.reports);
      newReports.set(reportId, { ...report, error, state: 'failed' });
      return { reports: newReports };
    }
    return store;
  }),
  
  setReportProgress: (reportId, progress) => set((store) => {
    const report = store.reports.get(reportId);
    if (report) {
      const newReports = new Map(store.reports);
      newReports.set(reportId, { ...report, progress });
      return { reports: newReports };
    }
    return store;
  }),
  
  setReportDownloadUrl: (reportId, downloadUrl) => set((store) => {
    const report = store.reports.get(reportId);
    if (report) {
      const newReports = new Map(store.reports);
      newReports.set(reportId, { ...report, downloadUrl, state: 'completed' });
      return { reports: newReports };
    }
    return store;
  }),
  
  removeReport: (reportId) => set((store) => {
    const newReports = new Map(store.reports);
    newReports.delete(reportId);
    return { reports: newReports };
  }),
}));
```

---

## Next Steps

Continue to:
- **[← Part 1: API Endpoints & Request/Response Schemas](./REPORT_GENERATION_INTEGRATION_PART_1_API_ENDPOINTS.md)**
- **[Part 3: Implementation Guide & Best Practices →](./REPORT_GENERATION_INTEGRATION_PART_3_IMPLEMENTATION.md)**

---

## Support

For questions or issues:
- Backend Developer: Review this documentation
- Type Definitions: See `src/modules/reports/schemas/report.schema.ts`
- Validation: Check Zod schemas and business logic functions
- Errors: Refer to error code reference table
