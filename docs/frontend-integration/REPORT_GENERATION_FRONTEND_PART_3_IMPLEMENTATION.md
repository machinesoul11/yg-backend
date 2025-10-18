# 🔒 Report Generation Module - Frontend Integration Guide (Part 3: Business Logic & Implementation)

**Module:** Report Generation Service  
**Classification:** 🔒 ADMIN ONLY (with limited creator/brand access)  
**Last Updated:** October 17, 2025

---

## Table of Contents
- [Business Logic & Validation Rules](#business-logic--validation-rules)
- [Error Handling](#error-handling)
- [Authorization & Permissions](#authorization--permissions)
- [State Management](#state-management)
- [Frontend Implementation Checklist](#frontend-implementation-checklist)
- [React Query Integration Examples](#react-query-integration-examples)
- [UI/UX Considerations](#uiux-considerations)
- [Testing Recommendations](#testing-recommendations)

---

## Business Logic & Validation Rules

### Date Range Validation

**Rules:**
1. `startDate` must be before `endDate`
2. Maximum date range: **730 days** (2 years)
3. Minimum date range: **1 day**
4. Future dates are allowed for scheduled reports only
5. Historical data available from: **January 1, 2024**

**Frontend Validation:**

```typescript
export function validateDateRange(startDate: Date, endDate: Date) {
  const errors: string[] = [];
  
  // Check start before end
  if (startDate >= endDate) {
    errors.push('Start date must be before end date');
  }
  
  // Check max range
  const daysDiff = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 730) {
    errors.push('Date range cannot exceed 2 years (730 days)');
  }
  
  // Check min range
  if (daysDiff < 1) {
    errors.push('Date range must be at least 1 day');
  }
  
  // Check historical limit
  const historicalLimit = new Date('2024-01-01');
  if (startDate < historicalLimit) {
    errors.push('Historical data only available from January 1, 2024');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    daysDiff
  };
}
```

### Granularity Auto-Calculation

The backend automatically selects appropriate granularity based on date range:

| Date Range | Auto-Selected Granularity |
|------------|--------------------------|
| ≤ 31 days | `daily` |
| 32-92 days | `weekly` |
| > 92 days | `monthly` |

**Frontend Helper:**

```typescript
export function suggestGranularity(startDate: Date, endDate: Date): 'daily' | 'weekly' | 'monthly' {
  const daysDiff = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysDiff <= 31) return 'daily';
  if (daysDiff <= 92) return 'weekly';
  return 'monthly';
}
```

### Custom Report Validation

**Field Compatibility Rules:**

```typescript
export interface FieldCompatibility {
  aggregatable: boolean; // Can be used in metrics
  groupable: boolean;    // Can be used in groupBy
  filterable: boolean;   // Can be used in filters
}

export function validateCustomReportConfig(config: CustomReportConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate metrics
  config.metrics.forEach(metric => {
    // Check if field is aggregatable
    if (!isFieldAggregatable(config.dataSource.primaryEntity, metric.field)) {
      errors.push(`Field "${metric.field}" cannot be aggregated`);
    }
  });
  
  // Validate groupBy
  config.groupBy?.forEach(group => {
    if (!isFieldGroupable(config.dataSource.primaryEntity, group.field)) {
      errors.push(`Field "${group.field}" cannot be used for grouping`);
    }
  });
  
  // Check date range
  const dateValidation = validateDateRange(
    config.dataSource.dateRange.startDate,
    config.dataSource.dateRange.endDate
  );
  errors.push(...dateValidation.errors);
  
  // Warn on large date ranges
  if (dateValidation.daysDiff > 365) {
    warnings.push('Date range exceeds 1 year. Report generation may take longer.');
  }
  
  // Validate recipient count
  if (config.deliveryOptions?.emailRecipients) {
    if (config.deliveryOptions.emailRecipients.length > 20) {
      errors.push('Maximum 20 email recipients allowed');
    }
    if (config.deliveryOptions.emailRecipients.length > 10) {
      warnings.push('Large recipient list. Email delivery may be throttled.');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

### Scheduled Report Validation

**Schedule Configuration Rules:**

```typescript
export function validateScheduleConfig(
  frequency: ReportFrequency,
  schedule: ScheduledReportConfig['schedule']
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  switch (frequency) {
    case 'DAILY':
      // Only hour and minute required
      break;
      
    case 'WEEKLY':
      if (schedule.dayOfWeek === undefined) {
        errors.push('Day of week is required for weekly reports');
      }
      if (schedule.dayOfWeek !== undefined && (schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6)) {
        errors.push('Day of week must be between 0 (Sunday) and 6 (Saturday)');
      }
      break;
      
    case 'MONTHLY':
      if (schedule.dayOfMonth === undefined) {
        errors.push('Day of month is required for monthly reports');
      }
      if (schedule.dayOfMonth !== undefined && (schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)) {
        errors.push('Day of month must be between 1 and 31');
      }
      break;
      
    case 'QUARTERLY':
      if (schedule.monthOfQuarter === undefined) {
        errors.push('Month of quarter is required for quarterly reports');
      }
      if (schedule.dayOfMonth === undefined) {
        errors.push('Day of month is required for quarterly reports');
      }
      if (schedule.monthOfQuarter !== undefined && (schedule.monthOfQuarter < 1 || schedule.monthOfQuarter > 3)) {
        errors.push('Month of quarter must be between 1 and 3');
      }
      break;
      
    case 'ANNUALLY':
      if (schedule.monthOfYear === undefined) {
        errors.push('Month of year is required for annual reports');
      }
      if (schedule.dayOfMonth === undefined) {
        errors.push('Day of month is required for annual reports');
      }
      if (schedule.monthOfYear !== undefined && (schedule.monthOfYear < 1 || schedule.monthOfYear > 12)) {
        errors.push('Month of year must be between 1 and 12');
      }
      break;
  }
  
  // Validate time
  if (schedule.hour < 0 || schedule.hour > 23) {
    errors.push('Hour must be between 0 and 23');
  }
  if (schedule.minute < 0 || schedule.minute > 59) {
    errors.push('Minute must be between 0 and 59');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
```

---

## Error Handling

### Error Code Mapping

**Complete error code reference:**

```typescript
export enum ReportErrorCode {
  // Validation Errors (400)
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  REPORT_NOT_READY = 'REPORT_NOT_READY',
  REPORT_VALIDATION_FAILED = 'REPORT_VALIDATION_FAILED',
  INVALID_SCHEDULE_CONFIG = 'INVALID_SCHEDULE_CONFIG',
  
  // Authentication Errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Authorization Errors (403)
  ACCESS_DENIED = 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  REPORT_ACCESS_DENIED = 'REPORT_ACCESS_DENIED',
  
  // Not Found Errors (404)
  REPORT_NOT_FOUND = 'REPORT_NOT_FOUND',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  SCHEDULED_REPORT_NOT_FOUND = 'SCHEDULED_REPORT_NOT_FOUND',
  
  // Gone Errors (410)
  REPORT_EXPIRED = 'REPORT_EXPIRED',
  
  // Rate Limiting Errors (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  
  // Server Errors (500)
  REPORT_GENERATION_FAILED = 'REPORT_GENERATION_FAILED',
  REPORT_EXPORT_FAILED = 'REPORT_EXPORT_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export interface ReportError {
  code: ReportErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: Date;
}
```

### User-Friendly Error Messages

**Map backend errors to user-friendly messages:**

```typescript
export function getUserFriendlyErrorMessage(error: ReportError): {
  title: string;
  message: string;
  action?: string;
} {
  const errorMessages: Record<ReportErrorCode, { title: string; message: string; action?: string }> = {
    // Validation Errors
    [ReportErrorCode.INVALID_DATE_RANGE]: {
      title: 'Invalid Date Range',
      message: 'The selected date range is not valid. Please check your dates and try again.',
      action: 'Adjust dates'
    },
    [ReportErrorCode.INVALID_PARAMETERS]: {
      title: 'Invalid Parameters',
      message: 'Some report parameters are invalid. Please review your configuration.',
      action: 'Review parameters'
    },
    [ReportErrorCode.REPORT_NOT_READY]: {
      title: 'Report Not Ready',
      message: 'Your report is still being generated. Please check back in a few moments.',
      action: 'Refresh status'
    },
    [ReportErrorCode.REPORT_VALIDATION_FAILED]: {
      title: 'Configuration Error',
      message: 'The report configuration has validation errors. Please review and correct them.',
      action: 'Review configuration'
    },
    
    // Authentication Errors
    [ReportErrorCode.UNAUTHORIZED]: {
      title: 'Authentication Required',
      message: 'You need to be logged in to access reports.',
      action: 'Log in'
    },
    [ReportErrorCode.SESSION_EXPIRED]: {
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      action: 'Log in again'
    },
    
    // Authorization Errors
    [ReportErrorCode.ACCESS_DENIED]: {
      title: 'Access Denied',
      message: 'You do not have permission to access this report.',
      action: 'Contact administrator'
    },
    [ReportErrorCode.INSUFFICIENT_PERMISSIONS]: {
      title: 'Insufficient Permissions',
      message: 'Your account does not have the required permissions for this action.',
      action: 'Contact administrator'
    },
    [ReportErrorCode.REPORT_ACCESS_DENIED]: {
      title: 'Cannot Access Report',
      message: 'You do not have permission to view this report.',
      action: undefined
    },
    
    // Not Found Errors
    [ReportErrorCode.REPORT_NOT_FOUND]: {
      title: 'Report Not Found',
      message: 'The requested report could not be found. It may have been deleted.',
      action: 'View all reports'
    },
    [ReportErrorCode.TEMPLATE_NOT_FOUND]: {
      title: 'Template Not Found',
      message: 'The requested report template could not be found.',
      action: 'View available templates'
    },
    
    // Expiration Errors
    [ReportErrorCode.REPORT_EXPIRED]: {
      title: 'Report Expired',
      message: 'This report has expired and is no longer available. Reports are retained for 30 days.',
      action: 'Generate new report'
    },
    
    // Rate Limiting Errors
    [ReportErrorCode.RATE_LIMIT_EXCEEDED]: {
      title: 'Too Many Requests',
      message: 'You have exceeded the rate limit for report generation. Please try again later.',
      action: 'Try again later'
    },
    [ReportErrorCode.TOO_MANY_REQUESTS]: {
      title: 'Request Limit Reached',
      message: 'You have made too many requests. Please wait before trying again.',
      action: 'Wait and retry'
    },
    
    // Server Errors
    [ReportErrorCode.REPORT_GENERATION_FAILED]: {
      title: 'Generation Failed',
      message: 'The report could not be generated due to a server error. Please try again.',
      action: 'Try again'
    },
    [ReportErrorCode.REPORT_EXPORT_FAILED]: {
      title: 'Export Failed',
      message: 'The report could not be exported in the requested format. Please try a different format.',
      action: 'Try different format'
    },
    [ReportErrorCode.INTERNAL_SERVER_ERROR]: {
      title: 'Server Error',
      message: 'An unexpected error occurred. Our team has been notified. Please try again later.',
      action: 'Try again later'
    },
  };
  
  return errorMessages[error.code] || {
    title: 'Error',
    message: 'An unexpected error occurred.',
    action: 'Try again'
  };
}
```

### Error Display Component

```typescript
import { AlertCircle, Info, XCircle } from 'lucide-react';

interface ErrorDisplayProps {
  error: ReportError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  const { title, message, action } = getUserFriendlyErrorMessage(error);
  
  const severity = error.statusCode >= 500 ? 'error' : 
                   error.statusCode >= 400 ? 'warning' : 'info';
  
  const Icon = severity === 'error' ? XCircle : 
               severity === 'warning' ? AlertCircle : Info;
  
  return (
    <div className={`error-display error-display--${severity}`}>
      <div className="error-display__icon">
        <Icon size={24} />
      </div>
      <div className="error-display__content">
        <h3 className="error-display__title">{title}</h3>
        <p className="error-display__message">{message}</p>
        {error.details && (
          <details className="error-display__details">
            <summary>Technical Details</summary>
            <pre>{JSON.stringify(error.details, null, 2)}</pre>
          </details>
        )}
      </div>
      <div className="error-display__actions">
        {action && onRetry && (
          <button onClick={onRetry}>{action}</button>
        )}
        {onDismiss && (
          <button onClick={onDismiss}>Dismiss</button>
        )}
      </div>
    </div>
  );
}
```

---

## Authorization & Permissions

### Role-Based Access Control

**Permission Matrix:**

```typescript
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER'
}

export interface ReportPermissions {
  canGenerate: boolean;
  canDownload: boolean;
  canSchedule: boolean;
  canViewAll: boolean;
  canViewOwn: boolean;
  availableTemplates: string[];
  maxScheduledReports: number;
}

export function getReportPermissions(role: UserRole): ReportPermissions {
  switch (role) {
    case UserRole.ADMIN:
      return {
        canGenerate: true,
        canDownload: true,
        canSchedule: true,
        canViewAll: true,
        canViewOwn: true,
        availableTemplates: [
          'monthly_operational',
          'quarterly_strategic',
          'annual_comprehensive',
          'creator_earnings',
          'brand_campaign',
          'tax_compliance',
          'asset_portfolio'
        ],
        maxScheduledReports: 100
      };
      
    case UserRole.CREATOR:
      return {
        canGenerate: true,
        canDownload: true,
        canSchedule: true,
        canViewAll: false,
        canViewOwn: true,
        availableTemplates: [
          'creator_earnings',
          'asset_portfolio'
        ],
        maxScheduledReports: 10
      };
      
    case UserRole.BRAND:
      return {
        canGenerate: true,
        canDownload: true,
        canSchedule: true,
        canViewAll: false,
        canViewOwn: true,
        availableTemplates: [
          'brand_campaign'
        ],
        maxScheduledReports: 20
      };
      
    case UserRole.VIEWER:
    default:
      return {
        canGenerate: false,
        canDownload: false,
        canSchedule: false,
        canViewAll: false,
        canViewOwn: false,
        availableTemplates: [],
        maxScheduledReports: 0
      };
  }
}
```

### Row-Level Security

**Automatic Filtering by Role:**

```typescript
export function applyRowLevelSecurity(
  userId: string,
  role: UserRole,
  creatorId?: string,
  brandId?: string
): ReportFilters {
  const filters: ReportFilters = {};
  
  switch (role) {
    case UserRole.ADMIN:
      // No filtering - full access
      break;
      
    case UserRole.CREATOR:
      // Only show creator's own data
      if (creatorId) {
        filters.creatorIds = [creatorId];
      }
      break;
      
    case UserRole.BRAND:
      // Only show brand's own data
      if (brandId) {
        filters.brandIds = [brandId];
      }
      break;
      
    case UserRole.VIEWER:
      // No data access
      throw new Error('Viewers do not have report access');
  }
  
  return filters;
}
```

### Permission Checking Hook

```typescript
import { useSession } from 'next-auth/react';
import { useMemo } from 'react';

export function useReportPermissions() {
  const { data: session } = useSession();
  
  const permissions = useMemo(() => {
    if (!session?.user?.role) {
      return getReportPermissions(UserRole.VIEWER);
    }
    return getReportPermissions(session.user.role as UserRole);
  }, [session?.user?.role]);
  
  const can = useMemo(() => ({
    generate: permissions.canGenerate,
    download: permissions.canDownload,
    schedule: permissions.canSchedule,
    viewAll: permissions.canViewAll,
    viewTemplate: (templateId: string) => 
      permissions.availableTemplates.includes(templateId),
    scheduleMore: (currentCount: number) => 
      currentCount < permissions.maxScheduledReports,
  }), [permissions]);
  
  return { permissions, can };
}
```

---

## State Management

### Report Generation State Machine

```typescript
export enum ReportGenerationState {
  IDLE = 'idle',
  VALIDATING = 'validating',
  QUEUED = 'queued',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface ReportGenerationContext {
  state: ReportGenerationState;
  config?: CustomReportConfig;
  reportId?: string;
  jobId?: string;
  progress?: number;
  error?: ReportError;
  downloadUrl?: string;
  expiresAt?: Date;
}

// State machine transitions
export const reportGenerationMachine = {
  [ReportGenerationState.IDLE]: {
    SUBMIT: ReportGenerationState.VALIDATING
  },
  [ReportGenerationState.VALIDATING]: {
    VALID: ReportGenerationState.QUEUED,
    INVALID: ReportGenerationState.IDLE,
    ERROR: ReportGenerationState.FAILED
  },
  [ReportGenerationState.QUEUED]: {
    START: ReportGenerationState.GENERATING,
    CANCEL: ReportGenerationState.CANCELLED,
    ERROR: ReportGenerationState.FAILED
  },
  [ReportGenerationState.GENERATING]: {
    COMPLETE: ReportGenerationState.COMPLETED,
    FAIL: ReportGenerationState.FAILED,
    CANCEL: ReportGenerationState.CANCELLED
  },
  [ReportGenerationState.COMPLETED]: {
    RESET: ReportGenerationState.IDLE
  },
  [ReportGenerationState.FAILED]: {
    RETRY: ReportGenerationState.VALIDATING,
    RESET: ReportGenerationState.IDLE
  },
  [ReportGenerationState.CANCELLED]: {
    RESET: ReportGenerationState.IDLE
  }
};
```

### React State Management

```typescript
import { useReducer, useCallback } from 'react';

type ReportAction =
  | { type: 'SUBMIT'; config: CustomReportConfig }
  | { type: 'VALID'; reportId: string; jobId: string }
  | { type: 'INVALID'; errors: string[] }
  | { type: 'START' }
  | { type: 'PROGRESS'; progress: number }
  | { type: 'COMPLETE'; downloadUrl: string; expiresAt: Date }
  | { type: 'FAIL'; error: ReportError }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

function reportGenerationReducer(
  state: ReportGenerationContext,
  action: ReportAction
): ReportGenerationContext {
  switch (action.type) {
    case 'SUBMIT':
      return {
        ...state,
        state: ReportGenerationState.VALIDATING,
        config: action.config,
        error: undefined
      };
      
    case 'VALID':
      return {
        ...state,
        state: ReportGenerationState.QUEUED,
        reportId: action.reportId,
        jobId: action.jobId
      };
      
    case 'INVALID':
      return {
        ...state,
        state: ReportGenerationState.IDLE,
        error: {
          code: ReportErrorCode.REPORT_VALIDATION_FAILED,
          message: action.errors.join(', '),
          statusCode: 400,
          timestamp: new Date()
        }
      };
      
    case 'START':
      return {
        ...state,
        state: ReportGenerationState.GENERATING,
        progress: 0
      };
      
    case 'PROGRESS':
      return {
        ...state,
        progress: action.progress
      };
      
    case 'COMPLETE':
      return {
        ...state,
        state: ReportGenerationState.COMPLETED,
        downloadUrl: action.downloadUrl,
        expiresAt: action.expiresAt,
        progress: 100
      };
      
    case 'FAIL':
      return {
        ...state,
        state: ReportGenerationState.FAILED,
        error: action.error
      };
      
    case 'CANCEL':
      return {
        ...state,
        state: ReportGenerationState.CANCELLED
      };
      
    case 'RESET':
      return {
        state: ReportGenerationState.IDLE
      };
      
    default:
      return state;
  }
}

export function useReportGeneration() {
  const [context, dispatch] = useReducer(reportGenerationReducer, {
    state: ReportGenerationState.IDLE
  });
  
  const submit = useCallback((config: CustomReportConfig) => {
    dispatch({ type: 'SUBMIT', config });
  }, []);
  
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);
  
  return {
    context,
    dispatch,
    submit,
    reset,
    isIdle: context.state === ReportGenerationState.IDLE,
    isValidating: context.state === ReportGenerationState.VALIDATING,
    isQueued: context.state === ReportGenerationState.QUEUED,
    isGenerating: context.state === ReportGenerationState.GENERATING,
    isCompleted: context.state === ReportGenerationState.COMPLETED,
    isFailed: context.state === ReportGenerationState.FAILED,
    isCancelled: context.state === ReportGenerationState.CANCELLED
  };
}
```

---

## Frontend Implementation Checklist

### Phase 1: Core Infrastructure ✅

- [ ] **Setup tRPC Client**
  ```typescript
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '@backend/src/lib/trpc';
  
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] **Configure React Query**
  ```typescript
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1
      }
    }
  });
  ```

- [ ] **Setup Authentication Context**
  - Import session from NextAuth
  - Create permission hooks
  - Implement role-based guards

### Phase 2: Type Definitions ✅

- [ ] **Copy Type Definitions**
  - Copy all types from Part 2 document
  - Place in `/types/reports.ts`
  - Export from barrel file

- [ ] **Setup Zod Schemas**
  - Import validation schemas
  - Create validation utilities
  - Add error message mappings

### Phase 3: API Integration Layer 🔄

- [ ] **Create API Hooks**
  ```typescript
  // hooks/useReportGeneration.ts
  export function useGenerateReport() {
    return trpc.reports.generate.useMutation({
      onSuccess: (data) => {
        console.log('Report queued:', data.reportId);
      },
      onError: (error) => {
        console.error('Generation failed:', error);
      }
    });
  }
  ```

- [ ] **Create Query Hooks**
  ```typescript
  // hooks/useReportDownload.ts
  export function useReportDownload(reportId: string) {
    return trpc.reports.download.useQuery(
      { reportId },
      { enabled: !!reportId }
    );
  }
  ```

- [ ] **Polling for Status**
  ```typescript
  export function useReportStatus(reportId: string) {
    return trpc.reports.download.useQuery(
      { reportId },
      {
        enabled: !!reportId,
        refetchInterval: (data) => {
          // Stop polling when complete or failed
          if (data?.reportInfo) return false;
          return 5000; // Poll every 5 seconds
        },
        retry: 3
      }
    );
  }
  ```

### Phase 4: UI Components 🎨

- [ ] **Report List Component**
  - Display available templates
  - Filter by category/access
  - Show generation status
  - Download buttons

- [ ] **Report Generation Form**
  - Date range picker
  - Filter selection
  - Format selector
  - Email delivery options
  - Real-time validation

- [ ] **Custom Report Builder**
  - Data source selector
  - Field picker with categories
  - Metric configurator
  - Group by builder
  - Sorting options
  - Live preview (optional)

- [ ] **Scheduled Report Manager**
  - List scheduled reports
  - Create/edit schedules
  - Enable/disable toggle
  - Next run display
  - Execution history

- [ ] **Report Status Tracker**
  - Progress indicator
  - Generation status
  - Error display
  - Download button (when ready)
  - Expiration countdown

- [ ] **Report Download Modal**
  - Format selector
  - Download button
  - Expiration notice
  - Share options (admin)

### Phase 5: Advanced Features ⭐

- [ ] **Report Templates Gallery**
  - Template cards with descriptions
  - Preview images
  - Parameter configuration
  - Quick generate

- [ ] **Saved Report Configurations**
  - Save custom configs
  - Reuse saved configs
  - Tag system
  - Public/private toggle

- [ ] **Report History**
  - Recently generated reports
  - Status indicators
  - Re-download links
  - Delete/archive options

- [ ] **Bulk Operations**
  - Select multiple reports
  - Bulk download
  - Bulk delete
  - Export list

### Phase 6: Error Handling & Edge Cases 🛡️

- [ ] **Error Boundaries**
  ```typescript
  <ErrorBoundary fallback={<ReportErrorFallback />}>
    <ReportGenerationFlow />
  </ErrorBoundary>
  ```

- [ ] **Loading States**
  - Skeleton loaders
  - Progress indicators
  - Optimistic updates

- [ ] **Empty States**
  - No reports message
  - First-time user guide
  - Template suggestions

- [ ] **Network Resilience**
  - Offline detection
  - Retry logic
  - Queue failed requests

### Phase 7: Testing 🧪

- [ ] **Unit Tests**
  - Validation functions
  - State management
  - Utility functions

- [ ] **Integration Tests**
  - API hook behavior
  - Form submission
  - Error handling

- [ ] **E2E Tests**
  - Full report generation flow
  - Download workflow
  - Scheduling workflow

---

## React Query Integration Examples

### Basic Report Generation

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function ReportGenerator() {
  const [config, setConfig] = useState<CustomReportConfig | null>(null);
  
  const generateMutation = trpc.reports.generate.useMutation({
    onSuccess: (data) => {
      console.log('Report queued:', data.reportId);
      // Start polling for completion
      pollForCompletion(data.reportId);
    },
    onError: (error) => {
      const friendlyError = getUserFriendlyErrorMessage(error as ReportError);
      toast.error(friendlyError.title, {
        description: friendlyError.message
      });
    }
  });
  
  const handleSubmit = () => {
    if (!config) return;
    
    generateMutation.mutate({
      reportType: 'custom',
      parameters: config,
      format: config.outputFormat || 'pdf'
    });
  };
  
  return (
    <div>
      {/* Report configuration UI */}
      <button 
        onClick={handleSubmit}
        disabled={generateMutation.isLoading || !config}
      >
        {generateMutation.isLoading ? 'Generating...' : 'Generate Report'}
      </button>
    </div>
  );
}
```

### Polling for Report Status

```typescript
export function useReportPolling(reportId: string | null) {
  const [isComplete, setIsComplete] = useState(false);
  
  const { data, error, isLoading } = trpc.reports.download.useQuery(
    { reportId: reportId! },
    {
      enabled: !!reportId && !isComplete,
      refetchInterval: (data, query) => {
        // Stop polling if complete or error
        if (data || query.state.error) {
          setIsComplete(true);
          return false;
        }
        // Poll every 5 seconds
        return 5000;
      },
      retry: (failureCount, error: any) => {
        // Don't retry if report not ready yet (expected)
        if (error?.data?.code === 'BAD_REQUEST') {
          return failureCount < 60; // Max 5 minutes of polling
        }
        // Retry other errors
        return failureCount < 3;
      },
      onSuccess: (data) => {
        console.log('Report ready!', data.downloadUrl);
        setIsComplete(true);
      }
    }
  );
  
  return {
    data,
    error,
    isLoading,
    isPolling: !!reportId && !isComplete,
    isComplete
  };
}
```

### List Templates with Caching

```typescript
export function useReportTemplates() {
  return trpc.reports.getTemplates.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    select: (data) => {
      // Transform and filter templates
      return data.templates.filter(t => 
        t.accessLevel.includes(currentUserRole)
      );
    }
  });
}
```

### Optimistic Updates for Scheduled Reports

```typescript
export function useScheduleReport() {
  const utils = trpc.useContext();
  
  return trpc.reports.scheduleReport.useMutation({
    onMutate: async (newReport) => {
      // Cancel outgoing refetches
      await utils.reports.getScheduled.cancel();
      
      // Snapshot previous value
      const previous = utils.reports.getScheduled.getData();
      
      // Optimistically update
      utils.reports.getScheduled.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          scheduledReports: [
            ...old.scheduledReports,
            {
              ...newReport,
              id: 'temp-' + Date.now(),
              createdAt: new Date(),
              isActive: true
            } as any
          ]
        };
      });
      
      return { previous };
    },
    onError: (err, newReport, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.reports.getScheduled.setData(undefined, context.previous);
      }
    },
    onSettled: () => {
      // Refetch after mutation
      utils.reports.getScheduled.invalidate();
    }
  });
}
```

---

## UI/UX Considerations

### Date Range Picker

**Recommendations:**
- Use a date range component (e.g., `react-day-picker`)
- Highlight date validation errors inline
- Show suggested granularity
- Display data availability notice
- Preset ranges: "Last 7 days", "Last 30 days", "This month", "Last quarter"

```typescript
<DateRangePicker
  startDate={startDate}
  endDate={endDate}
  onChange={(range) => {
    setDateRange(range);
    // Validate and show warnings
    const validation = validateDateRange(range.startDate, range.endDate);
    if (!validation.isValid) {
      setErrors(validation.errors);
    }
  }}
  minDate={new Date('2024-01-01')}
  maxDate={new Date()}
  presets={[
    { label: 'Last 7 days', range: getLast7Days() },
    { label: 'Last 30 days', range: getLast30Days() },
    { label: 'This month', range: getThisMonth() },
    { label: 'Last quarter', range: getLastQuarter() }
  ]}
/>
```

### Progress Indicators

**Best Practices:**
- Show estimated completion time
- Display progress percentage
- Animate progress bar smoothly
- Show current processing step
- Allow cancellation (if supported)

```typescript
<ReportProgress
  status={reportStatus}
  progress={progress}
  estimatedTime={estimatedCompletionTime}
  onCancel={() => cancelReport()}
/>
```

### Download UX

**Considerations:**
- Auto-download on completion
- Show expiration countdown
- Display file size
- Offer multiple formats
- Allow re-download

```typescript
<DownloadCard
  report={report}
  onDownload={(format) => {
    window.open(report.downloadUrl, '_blank');
    trackDownload(report.id, format);
  }}
  expiresAt={report.expiresAt}
  formats={['pdf', 'csv', 'excel']}
/>
```

### Error Messages

**Display Strategy:**
- Use toast notifications for quick feedback
- Show inline errors for validation
- Use modal for critical errors
- Provide actionable error messages
- Include "Contact Support" option for server errors

### Loading States

**Skeleton Loaders:**
```typescript
<Skeleton className="h-48 w-full" /> // Report card
<Skeleton className="h-8 w-64 mb-4" /> // Title
<Skeleton className="h-64 w-full" /> // Chart placeholder
```

### Empty States

**No Reports:**
```typescript
<EmptyState
  icon={<FileText size={48} />}
  title="No reports yet"
  description="Generate your first report to get started"
  action={
    <Button onClick={() => navigate('/reports/new')}>
      Generate Report
    </Button>
  }
/>
```

---

## Testing Recommendations

### Unit Tests

**Validation Functions:**
```typescript
describe('validateDateRange', () => {
  it('should reject end date before start date', () => {
    const result = validateDateRange(
      new Date('2025-12-31'),
      new Date('2025-01-01')
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Start date must be before end date');
  });
  
  it('should reject date range > 2 years', () => {
    const result = validateDateRange(
      new Date('2023-01-01'),
      new Date('2025-12-31')
    );
    expect(result.isValid).toBe(false);
  });
});
```

### Integration Tests

**API Hook Tests:**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { trpc } from '@/lib/trpc';

describe('useGenerateReport', () => {
  it('should generate report successfully', async () => {
    const { result } = renderHook(() => trpc.reports.generate.useMutation());
    
    result.current.mutate({
      reportType: 'revenue',
      parameters: { /* ... */ },
      format: 'pdf'
    });
    
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data?.reportId).toBeDefined();
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
test('complete report generation flow', async ({ page }) => {
  await page.goto('/reports/new');
  
  // Select template
  await page.click('[data-testid="template-monthly"]');
  
  // Configure date range
  await page.fill('[data-testid="start-date"]', '2025-01-01');
  await page.fill('[data-testid="end-date"]', '2025-01-31');
  
  // Select format
  await page.selectOption('[data-testid="format"]', 'pdf');
  
  // Submit
  await page.click('[data-testid="generate-button"]');
  
  // Wait for completion
  await page.waitForSelector('[data-testid="download-button"]', {
    timeout: 60000
  });
  
  // Verify download link
  const downloadLink = await page.getAttribute(
    '[data-testid="download-button"]',
    'href'
  );
  expect(downloadLink).toBeTruthy();
});
```

---

## Performance Optimization

### Caching Strategy

```typescript
// Cache templates for 5 minutes
const templates = trpc.reports.getTemplates.useQuery(undefined, {
  staleTime: 5 * 60 * 1000
});

// Cache report data for 1 hour
const report = trpc.reports.download.useQuery(
  { reportId },
  {
    staleTime: 60 * 60 * 1000,
    enabled: !!reportId
  }
);
```

### Pagination

```typescript
const { data, fetchNextPage, hasNextPage } = trpc.reports.getScheduled.useInfiniteQuery(
  { limit: 20 },
  {
    getNextPageParam: (lastPage) => 
      lastPage.pagination.hasMore ? lastPage.pagination.offset + 20 : undefined
  }
);
```

### Debouncing

```typescript
import { useDebouncedCallback } from 'use-debounce';

const validateConfig = useDebouncedCallback(
  async (config: CustomReportConfig) => {
    const result = await trpc.reports.validateCustomReport.mutate({ config });
    setValidation(result);
  },
  500
);
```

---

## Security Considerations

### Input Sanitization

```typescript
// Sanitize user input before sending to API
function sanitizeReportName(name: string): string {
  return name
    .trim()
    .substring(0, 255)
    .replace(/[<>]/g, ''); // Remove HTML tags
}
```

### Download Security

```typescript
// Never store download URLs in localStorage
// Always fetch fresh signed URLs
const handleDownload = async (reportId: string) => {
  const { downloadUrl } = await trpc.reports.download.query({ reportId });
  window.open(downloadUrl, '_blank');
};
```

### Permission Checks

```typescript
// Always verify permissions before showing UI
const { can } = useReportPermissions();

if (!can.generate) {
  return <AccessDenied message="You don't have permission to generate reports" />;
}
```

---

## Next Steps

**Related Documentation:**
- **[Part 1: API Endpoints](./REPORT_GENERATION_FRONTEND_PART_1_API_ENDPOINTS.md)** - Complete API reference
- **[Part 2: TypeScript Types](./REPORT_GENERATION_FRONTEND_PART_2_TYPES.md)** - Type definitions and schemas

**Support:**
- Backend documentation: `/docs/REPORT_GENERATION_IMPLEMENTATION_COMPLETE.md`
- API endpoint reference: `/docs/REPORT_API_ENDPOINTS_IMPLEMENTATION.md`
- Contact backend team for clarifications

---

**You now have everything needed to build a complete, production-ready Report Generation UI!** 🎉
