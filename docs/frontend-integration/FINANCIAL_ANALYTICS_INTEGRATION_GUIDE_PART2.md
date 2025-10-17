# Financial Analytics Reports - Frontend Integration Guide (Part 2)

> **Classification: 🔒 ADMIN ONLY** - Internal operations and admin interface only

This is the continuation of the Financial Analytics Reports integration guide, covering error handling, performance optimization, and implementation examples.

## 5. Error Handling

### Error Code Reference

| Error Code | HTTP Status | Description | User Action |
|------------|-------------|-------------|-------------|
| `REPORT_GENERATION_FAILED` | 500 | Report generation encountered an error | Retry with same parameters |
| `REPORT_VALIDATION_FAILED` | 400 | Invalid input parameters | Fix validation errors and retry |
| `REPORT_ACCESS_DENIED` | 403 | User doesn't have permission | Contact admin for access |
| `REPORT_NOT_FOUND` | 404 | Report ID doesn't exist | Check report ID or generate new report |
| `REPORT_TIMEOUT` | 408 | Report generation timed out | Try with smaller date range |
| `REPORT_DATA_SOURCE_ERROR` | 500 | Database or data source error | Try again later or contact support |
| `BAD_REQUEST` | 400 | Invalid request format | Check request parameters |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | Contact support with error details |

### Error Response Format
```typescript
interface ReportErrorResponse {
  error: {
    code: string;          // Error code from table above
    message: string;       // Human-readable error message
    statusCode: number;    // HTTP status code
    details?: {           // Additional error context
      field?: string;     // Field that caused validation error
      reportId?: string;  // Report ID if applicable
      userId?: string;    // User ID if access-related
      [key: string]: any;
    };
  };
}
```

### Frontend Error Handling Implementation
```typescript
// Error handling hook
function useReportError() {
  const showErrorToast = (error: TRPCError) => {
    const errorMap: Record<string, string> = {
      'REPORT_GENERATION_FAILED': 'Report generation failed. Please try again.',
      'REPORT_VALIDATION_FAILED': 'Please check your input and try again.',
      'REPORT_ACCESS_DENIED': 'You do not have permission to access this report.',
      'REPORT_NOT_FOUND': 'The requested report could not be found.',
      'REPORT_TIMEOUT': 'Report generation timed out. Please try with a smaller date range.',
      'REPORT_DATA_SOURCE_ERROR': 'There was an issue accessing the data. Please try again later.',
      'BAD_REQUEST': 'Invalid request. Please check your parameters.',
      'INTERNAL_SERVER_ERROR': 'An unexpected error occurred. Please contact support.',
    };
    
    const userMessage = errorMap[error.data?.code] || 'An unexpected error occurred.';
    toast.error(userMessage);
    
    // Log detailed error for debugging
    console.error('Report Error:', {
      code: error.data?.code,
      message: error.message,
      details: error.data?.details,
    });
  };
  
  return { showErrorToast };
}

// Usage in component
const generateReportMutation = trpc.reports.generateFinancialAnalyticsReport.useMutation({
  onError: (error) => {
    showErrorToast(error);
  },
  onSuccess: (result) => {
    toast.success('Report generated successfully!');
    // Handle success (e.g., redirect to download page)
  },
});
```

### Specific Error Scenarios

#### Validation Errors
```typescript
// Handle field-specific validation errors
function handleValidationError(error: TRPCError, form: UseFormReturn) {
  if (error.data?.code === 'REPORT_VALIDATION_FAILED') {
    const fieldErrors = error.data?.details?.fieldErrors;
    
    if (fieldErrors) {
      Object.entries(fieldErrors).forEach(([field, errors]) => {
        form.setError(field as any, {
          message: Array.isArray(errors) ? errors[0] : errors
        });
      });
    }
  }
}
```

#### Timeout Errors
```typescript
// Handle timeout with retry logic
function handleTimeoutError(error: TRPCError, retryFn: () => void) {
  if (error.data?.code === 'REPORT_TIMEOUT') {
    const shouldRetry = window.confirm(
      'Report generation timed out. Would you like to try with a smaller date range?'
    );
    
    if (shouldRetry) {
      // Suggest reducing date range by half
      retryFn();
    }
  }
}
```

## 6. Rate Limiting & Performance

### Rate Limits
```typescript
interface RateLimits {
  reportGeneration: {
    perMinute: 5;        // Maximum 5 report generations per minute
    perHour: 20;         // Maximum 20 report generations per hour
    perDay: 100;         // Maximum 100 report generations per day
  };
  reportDownload: {
    perMinute: 30;       // Maximum 30 downloads per minute
    perHour: 200;        // Maximum 200 downloads per hour
  };
  historyQueries: {
    perMinute: 60;       // Maximum 60 history queries per minute
  };
}
```

### Rate Limit Headers
The API returns rate limit information in response headers:
```typescript
interface RateLimitHeaders {
  'x-ratelimit-limit': string;      // Rate limit ceiling
  'x-ratelimit-remaining': string;  // Requests remaining in window
  'x-ratelimit-reset': string;      // UTC epoch seconds when window resets
}
```

### Caching Strategy
```typescript
// Cache configuration for React Query
const cacheConfig = {
  reportHistory: {
    staleTime: 5 * 60 * 1000,      // 5 minutes
    cacheTime: 30 * 60 * 1000,     // 30 minutes
  },
  reportTypes: {
    staleTime: 60 * 60 * 1000,     // 1 hour
    cacheTime: 24 * 60 * 60 * 1000, // 24 hours
  },
  generatedReports: {
    staleTime: 10 * 60 * 1000,     // 10 minutes
    cacheTime: 60 * 60 * 1000,     // 1 hour
  },
};

// Usage with tRPC
const { data: reports } = trpc.reports.getReportHistory.useQuery(
  { limit: 20, offset: 0 },
  {
    staleTime: cacheConfig.reportHistory.staleTime,
    cacheTime: cacheConfig.reportHistory.cacheTime,
  }
);
```

### Performance Optimization Tips
```typescript
// 1. Implement pagination for report history
const useReportHistoryPagination = (pageSize = 20) => {
  const [page, setPage] = useState(0);
  const offset = page * pageSize;
  
  const { data, isLoading, error } = trpc.reports.getReportHistory.useQuery({
    limit: pageSize,
    offset: offset,
  });
  
  return {
    reports: data?.reports || [],
    pagination: data?.pagination,
    page,
    setPage,
    isLoading,
    error,
  };
};

// 2. Implement debounced search for filters
const useDebouncedReportFilters = (delay = 300) => {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [debouncedFilters, setDebouncedFilters] = useState<ReportFilters>({});
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [filters, delay]);
  
  return {
    filters,
    setFilters,
    debouncedFilters,
  };
};

// 3. Background polling for report status
const useReportStatusPolling = (reportId: string, enabled: boolean) => {
  return trpc.reports.getReportStatus.useQuery(
    { reportId },
    {
      enabled: enabled,
      refetchInterval: (data) => {
        // Stop polling when report is completed or failed
        if (data?.status === 'COMPLETED' || data?.status === 'FAILED') {
          return false;
        }
        return 2000; // Poll every 2 seconds
      },
    }
  );
};
```

## 7. Implementation Examples

### Complete Report Generation Component
```typescript
// ReportGenerator.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trpc } from '@/utils/trpc';

interface ReportFormData {
  reportType: ReportType;
  startDate: Date;
  endDate: Date;
  includeComparisons: boolean;
  includeForecast: boolean;
  format: 'pdf' | 'csv' | 'json';
  filters: {
    brandIds: string[];
    creatorIds: string[];
    regions: string[];
  };
}

export function ReportGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { showErrorToast } = useReportError();
  
  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportConfigSchema),
    defaultValues: {
      reportType: 'monthly_revenue',
      startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
      endDate: new Date(),
      includeComparisons: false,
      includeForecast: false,
      format: 'pdf',
      filters: {
        brandIds: [],
        creatorIds: [],
        regions: [],
      },
    },
  });
  
  const generateReportMutation = trpc.reports.generateFinancialAnalyticsReport.useMutation({
    onMutate: () => {
      setIsGenerating(true);
    },
    onSuccess: (result) => {
      toast.success('Report generated successfully!');
      // Redirect to download page or show download link
      router.push(`/reports/download/${result.id}`);
    },
    onError: (error) => {
      showErrorToast(error);
      handleValidationError(error, form);
    },
    onSettled: () => {
      setIsGenerating(false);
    },
  });
  
  const onSubmit = (data: ReportFormData) => {
    const validation = validateDateRange(data.startDate, data.endDate);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    const filterValidation = validateFilters(data.filters);
    if (!filterValidation.valid) {
      toast.error(filterValidation.error);
      return;
    }
    
    generateReportMutation.mutate({
      reportType: data.reportType,
      config: {
        startDate: data.startDate,
        endDate: data.endDate,
        includeComparisons: data.includeComparisons,
        includeForecast: data.includeForecast,
        format: data.format,
        filters: data.filters,
      },
      generatedBy: user.id,
    });
  };
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Report Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Report Type</label>
        <select {...form.register('reportType')} className="w-full p-2 border rounded">
          <option value="monthly_revenue">Monthly Revenue Report</option>
          <option value="quarterly_summary">Quarterly Financial Summary</option>
          <option value="annual_statement">Annual Financial Statement</option>
          <option value="cash_flow">Cash Flow Analysis</option>
          <option value="accounts_receivable">Accounts Receivable Aging</option>
          <option value="accounts_payable">Accounts Payable Report</option>
          <option value="commission_tracking">Commission Tracking</option>
        </select>
        {form.formState.errors.reportType && (
          <p className="text-red-500 text-sm mt-1">
            {form.formState.errors.reportType.message}
          </p>
        )}
      </div>
      
      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Start Date</label>
          <input
            type="date"
            {...form.register('startDate', { valueAsDate: true })}
            className="w-full p-2 border rounded"
          />
          {form.formState.errors.startDate && (
            <p className="text-red-500 text-sm mt-1">
              {form.formState.errors.startDate.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">End Date</label>
          <input
            type="date"
            {...form.register('endDate', { valueAsDate: true })}
            className="w-full p-2 border rounded"
          />
          {form.formState.errors.endDate && (
            <p className="text-red-500 text-sm mt-1">
              {form.formState.errors.endDate.message}
            </p>
          )}
        </div>
      </div>
      
      {/* Options */}
      <div className="space-y-3">
        <label className="flex items-center">
          <input
            type="checkbox"
            {...form.register('includeComparisons')}
            className="mr-2"
          />
          Include Period Comparisons
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            {...form.register('includeForecast')}
            className="mr-2"
          />
          Include Forecasting
        </label>
      </div>
      
      {/* Format Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Output Format</label>
        <select {...form.register('format')} className="w-full p-2 border rounded">
          <option value="pdf">PDF Report</option>
          <option value="csv">CSV Data</option>
          <option value="json">JSON Data</option>
        </select>
      </div>
      
      {/* Submit Button */}
      <button
        type="submit"
        disabled={isGenerating}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isGenerating ? (
          <>
            <Spinner className="animate-spin mr-2" />
            Generating Report...
          </>
        ) : (
          'Generate Report'
        )}
      </button>
    </form>
  );
}
```

### Report History with Pagination
```typescript
// ReportHistory.tsx
import { useState } from 'react';
import { format } from 'date-fns';
import { trpc } from '@/utils/trpc';

export function ReportHistory() {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    reportType: '',
    startDate: null as Date | null,
    endDate: null as Date | null,
  });
  
  const pageSize = 20;
  const offset = page * pageSize;
  
  const { data, isLoading, error, refetch } = trpc.reports.getReportHistory.useQuery({
    limit: pageSize,
    offset: offset,
    reportType: filters.reportType || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });
  
  const downloadReportMutation = trpc.reports.downloadReport.useMutation({
    onSuccess: (blob) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      toast.error('Failed to download report');
    },
  });
  
  const handleDownload = (reportId: string) => {
    downloadReportMutation.mutate({ reportId });
  };
  
  if (isLoading) return <div>Loading reports...</div>;
  if (error) return <div>Error loading reports: {error.message}</div>;
  
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded">
        <div>
          <label className="block text-sm font-medium mb-1">Report Type</label>
          <select
            value={filters.reportType}
            onChange={(e) => setFilters(prev => ({ ...prev, reportType: e.target.value }))}
            className="w-full p-2 border rounded"
          >
            <option value="">All Types</option>
            <option value="monthly_revenue">Monthly Revenue</option>
            <option value="quarterly_summary">Quarterly Summary</option>
            <option value="annual_statement">Annual Statement</option>
            <option value="cash_flow">Cash Flow</option>
            <option value="accounts_receivable">Accounts Receivable</option>
            <option value="accounts_payable">Accounts Payable</option>
            <option value="commission_tracking">Commission Tracking</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Start Date</label>
          <input
            type="date"
            value={filters.startDate ? format(filters.startDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => setFilters(prev => ({ 
              ...prev, 
              startDate: e.target.value ? new Date(e.target.value) : null 
            }))}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End Date</label>
          <input
            type="date"
            value={filters.endDate ? format(filters.endDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => setFilters(prev => ({ 
              ...prev, 
              endDate: e.target.value ? new Date(e.target.value) : null 
            }))}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>
      
      {/* Reports Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left">Report Type</th>
              <th className="border border-gray-300 p-2 text-left">Generated</th>
              <th className="border border-gray-300 p-2 text-left">Period</th>
              <th className="border border-gray-300 p-2 text-left">Records</th>
              <th className="border border-gray-300 p-2 text-left">Status</th>
              <th className="border border-gray-300 p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.reports.map((report) => (
              <tr key={report.id}>
                <td className="border border-gray-300 p-2">
                  {formatReportType(report.reportType)}
                </td>
                <td className="border border-gray-300 p-2">
                  {format(report.generatedAt, 'MMM dd, yyyy HH:mm')}
                </td>
                <td className="border border-gray-300 p-2">
                  {format(report.metadata.period.startDate, 'MMM dd, yyyy')} - {' '}
                  {format(report.metadata.period.endDate, 'MMM dd, yyyy')}
                </td>
                <td className="border border-gray-300 p-2">
                  {report.metadata.recordCount.toLocaleString()}
                </td>
                <td className="border border-gray-300 p-2">
                  <span className={`px-2 py-1 text-xs rounded ${
                    report.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    report.status === 'GENERATING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {report.status}
                  </span>
                </td>
                <td className="border border-gray-300 p-2">
                  {report.status === 'COMPLETED' && report.downloadUrl && (
                    <button
                      onClick={() => handleDownload(report.id)}
                      disabled={downloadReportMutation.isLoading}
                      className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Download
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {data?.pagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Showing {offset + 1}-{Math.min(offset + pageSize, data.pagination.total)} of{' '}
            {data.pagination.total} reports
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage(prev => Math.max(0, prev - 1))}
              disabled={page === 0}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(prev => prev + 1)}
              disabled={!data.pagination.hasMore}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to format report type names
function formatReportType(reportType: string): string {
  const typeMap: Record<string, string> = {
    'monthly_revenue': 'Monthly Revenue',
    'quarterly_summary': 'Quarterly Summary',
    'annual_statement': 'Annual Statement',
    'cash_flow': 'Cash Flow Analysis',
    'accounts_receivable': 'Accounts Receivable',
    'accounts_payable': 'Accounts Payable',
    'commission_tracking': 'Commission Tracking',
  };
  
  return typeMap[reportType] || reportType;
}
```

## 8. Frontend Implementation Checklist

### Phase 1: Basic Integration
- [ ] Set up tRPC client for reports module
- [ ] Create TypeScript interfaces for all report types
- [ ] Implement basic report generation form
- [ ] Add error handling and user feedback
- [ ] Create report history listing page

### Phase 2: Enhanced UX
- [ ] Add form validation with Zod schemas
- [ ] Implement date range picker with validation
- [ ] Add filter selection components (brands, creators, regions)
- [ ] Create report status polling for generation progress
- [ ] Add download functionality with progress indicators

### Phase 3: Performance & Polish
- [ ] Implement pagination for report history
- [ ] Add caching strategy for frequently accessed data
- [ ] Create responsive design for mobile devices
- [ ] Add keyboard shortcuts and accessibility features
- [ ] Implement bulk operations (delete multiple reports)

### Phase 4: Advanced Features
- [ ] Add report scheduling interface
- [ ] Create report templates and saved configurations
- [ ] Implement report sharing and collaboration features
- [ ] Add data visualization for report summaries
- [ ] Create export options and batch processing

### Edge Cases to Handle
- [ ] Network timeouts during report generation
- [ ] Large date ranges that may cause performance issues
- [ ] Empty data sets (no transactions in date range)
- [ ] Permission changes during report generation
- [ ] Concurrent report generation limits
- [ ] File size limits for downloads
- [ ] Browser compatibility for file downloads

This completes the comprehensive frontend integration guide for the Financial Analytics Reports module. The frontend team now has all the necessary information to implement the UI without requiring additional backend clarification.
