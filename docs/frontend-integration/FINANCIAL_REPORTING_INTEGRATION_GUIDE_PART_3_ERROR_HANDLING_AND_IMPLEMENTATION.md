# 🔒 Financial Reporting API - Frontend Integration Guide (Part 3: Error Handling & Implementation)

**Classification: 🔒 ADMIN ONLY**

## Error Handling

### 1. Error Types & HTTP Status Codes

```typescript
// ============================================================================
// Error Classification
// ============================================================================

export enum ErrorCodes {
  // Validation Errors (400)
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  DATE_RANGE_TOO_LARGE = 'DATE_RANGE_TOO_LARGE',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  INVALID_PAGINATION = 'INVALID_PAGINATION',
  
  // Authentication Errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  
  // Authorization Errors (403)
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  REPORT_ACCESS_DENIED = 'REPORT_ACCESS_DENIED',
  
  // Not Found Errors (404)
  REPORT_NOT_FOUND = 'REPORT_NOT_FOUND',
  CREATOR_NOT_FOUND = 'CREATOR_NOT_FOUND',
  TAX_DOCUMENT_NOT_FOUND = 'TAX_DOCUMENT_NOT_FOUND',
  
  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_CONCURRENT_REPORTS = 'TOO_MANY_CONCURRENT_REPORTS',
  
  // Server Errors (500)
  REPORT_GENERATION_FAILED = 'REPORT_GENERATION_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  STRIPE_API_ERROR = 'STRIPE_API_ERROR',
  PDF_GENERATION_FAILED = 'PDF_GENERATION_FAILED',
  
  // Service Unavailable (503)
  REPORT_SERVICE_UNAVAILABLE = 'REPORT_SERVICE_UNAVAILABLE',
  STRIPE_SERVICE_UNAVAILABLE = 'STRIPE_SERVICE_UNAVAILABLE'
}

// ============================================================================
// Error Response Interfaces
// ============================================================================

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, any>;
    timestamp: string;
    path: string;
    requestId: string;
  };
}

export interface ValidationErrorResponse extends ErrorResponse {
  error: ErrorResponse['error'] & {
    fieldErrors: Record<string, string[]>;
  };
}

export interface RateLimitErrorResponse extends ErrorResponse {
  error: ErrorResponse['error'] & {
    retryAfter: number;          // Seconds until next request allowed
    limit: number;               // Request limit
    remaining: number;           // Requests remaining
    resetTime: string;           // When limit resets
  };
}

// ============================================================================
// Specific Error Mappings
// ============================================================================

export const ERROR_MESSAGES: Record<string, string> = {
  [ErrorCodes.INVALID_DATE_RANGE]: 'End date must be after or equal to start date',
  [ErrorCodes.DATE_RANGE_TOO_LARGE]: 'Date range cannot exceed 2 years',
  [ErrorCodes.INVALID_PARAMETERS]: 'One or more request parameters are invalid',
  [ErrorCodes.INVALID_PAGINATION]: 'Invalid pagination parameters',
  
  [ErrorCodes.UNAUTHORIZED]: 'Authentication required',
  [ErrorCodes.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCodes.INVALID_TOKEN]: 'Invalid authentication token',
  
  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action',
  [ErrorCodes.ADMIN_REQUIRED]: 'Administrator privileges required',
  [ErrorCodes.REPORT_ACCESS_DENIED]: 'You do not have access to this report',
  
  [ErrorCodes.REPORT_NOT_FOUND]: 'The requested report could not be found',
  [ErrorCodes.CREATOR_NOT_FOUND]: 'Creator not found',
  [ErrorCodes.TAX_DOCUMENT_NOT_FOUND]: 'Tax document not found',
  
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',
  [ErrorCodes.TOO_MANY_CONCURRENT_REPORTS]: 'Maximum concurrent reports exceeded. Please wait for current reports to complete.',
  
  [ErrorCodes.REPORT_GENERATION_FAILED]: 'Report generation failed. Please try again.',
  [ErrorCodes.DATABASE_ERROR]: 'A database error occurred. Please try again.',
  [ErrorCodes.STRIPE_API_ERROR]: 'Error communicating with payment processor',
  [ErrorCodes.PDF_GENERATION_FAILED]: 'Failed to generate PDF report',
  
  [ErrorCodes.REPORT_SERVICE_UNAVAILABLE]: 'Report service is temporarily unavailable',
  [ErrorCodes.STRIPE_SERVICE_UNAVAILABLE]: 'Payment service is temporarily unavailable'
};

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

export const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  [ErrorCodes.INVALID_DATE_RANGE]: 'Please select a valid date range with the end date after the start date.',
  [ErrorCodes.DATE_RANGE_TOO_LARGE]: 'Please select a date range of 2 years or less.',
  [ErrorCodes.UNAUTHORIZED]: 'Please log in to access financial reports.',
  [ErrorCodes.ADMIN_REQUIRED]: 'Only administrators can access financial reports.',
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'You\'re making requests too quickly. Please wait a moment and try again.',
  [ErrorCodes.REPORT_GENERATION_FAILED]: 'We couldn\'t generate your report right now. Please try again in a few minutes.',
  [ErrorCodes.STRIPE_API_ERROR]: 'There was an issue accessing payment data. Please try again later.',
  [ErrorCodes.REPORT_SERVICE_UNAVAILABLE]: 'The reporting service is temporarily down for maintenance. Please try again later.'
};

// ============================================================================
// Error Handling Functions
// ============================================================================

export function handleReportError(error: any): {
  message: string;
  isRetryable: boolean;
  shouldShowDetails: boolean;
} {
  const errorCode = error?.code || 'UNKNOWN_ERROR';
  
  const isRetryable = [
    ErrorCodes.REPORT_GENERATION_FAILED,
    ErrorCodes.DATABASE_ERROR,
    ErrorCodes.STRIPE_API_ERROR,
    ErrorCodes.REPORT_SERVICE_UNAVAILABLE,
    ErrorCodes.STRIPE_SERVICE_UNAVAILABLE
  ].includes(errorCode);
  
  const shouldShowDetails = [
    ErrorCodes.INVALID_DATE_RANGE,
    ErrorCodes.DATE_RANGE_TOO_LARGE,
    ErrorCodes.INVALID_PARAMETERS,
    ErrorCodes.RATE_LIMIT_EXCEEDED
  ].includes(errorCode);
  
  const message = USER_FRIENDLY_MESSAGES[errorCode] || 
                 ERROR_MESSAGES[errorCode] || 
                 'An unexpected error occurred';
  
  return { message, isRetryable, shouldShowDetails };
}

export function getRetryDelay(attempt: number): number {
  // Exponential backoff: 2^attempt seconds, max 60 seconds
  return Math.min(Math.pow(2, attempt) * 1000, 60000);
}
```

### 2. Error Handling Patterns

```typescript
// ============================================================================
// React Query Error Handling
// ============================================================================

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

export function useRevenueReport(input: RevenueReportInput) {
  return useQuery({
    queryKey: ['revenue-report', input],
    queryFn: () => trpc.reports.getRevenue.query(input),
    retry: (failureCount, error) => {
      const { isRetryable } = handleReportError(error);
      return isRetryable && failureCount < 3;
    },
    retryDelay: (attemptIndex) => getRetryDelay(attemptIndex),
    onError: (error) => {
      const { message, shouldShowDetails } = handleReportError(error);
      toast.error(message);
      
      if (shouldShowDetails && error.fieldErrors) {
        console.error('Validation errors:', error.fieldErrors);
      }
    }
  });
}

export function useReportGeneration() {
  return useMutation({
    mutationFn: (input: GenerateReportInput) => 
      trpc.reports.generate.mutate(input),
    onSuccess: (data) => {
      toast.success(`Report generation started. Report ID: ${data.reportId}`);
    },
    onError: (error) => {
      const { message, isRetryable } = handleReportError(error);
      toast.error(message);
      
      if (error.code === ErrorCodes.TOO_MANY_CONCURRENT_REPORTS) {
        // Show specific guidance for this error
        toast.error('Please wait for your current reports to finish before generating new ones.');
      }
    }
  });
}

// ============================================================================
// Validation Error Handling
// ============================================================================

export function handleValidationErrors(
  fieldErrors: Record<string, string[]>
): Record<string, string> {
  const formattedErrors: Record<string, string> = {};
  
  Object.entries(fieldErrors).forEach(([field, errors]) => {
    formattedErrors[field] = errors[0]; // Take first error message
  });
  
  return formattedErrors;
}

// ============================================================================
// Rate Limit Handling
// ============================================================================

export function handleRateLimit(error: RateLimitErrorResponse): void {
  const { retryAfter, limit } = error.error;
  
  toast.error(`Rate limit exceeded. You can make ${limit} more requests in ${retryAfter} seconds.`);
  
  // Optionally implement automatic retry
  setTimeout(() => {
    window.location.reload();
  }, retryAfter * 1000);
}

// ============================================================================
// Error Boundary for Reports
// ============================================================================

import React from 'react';

interface ReportErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}

export class ReportErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ReportErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ReportErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.setState({ errorInfo });
    
    // Log error to monitoring service
    console.error('Report Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-4">
            Something went wrong with the financial reports
          </h2>
          <p className="text-gray-600 mb-4">
            We encountered an unexpected error while loading the reports. 
            Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Authentication & Permissions

### 1. Authentication Setup

```typescript
// ============================================================================
// Authentication Context
// ============================================================================

import { createContext, useContext, useEffect, useState } from 'react';

interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  permissions: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      validateToken(token);
    } else {
      setIsLoading(false);
    }
  }, []);

  const validateToken = async (token: string) => {
    try {
      const response = await fetch('/api/auth/validate', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      localStorage.removeItem('auth_token');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (token: string) => {
    localStorage.setItem('auth_token', token);
    await validateToken(token);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const hasPermission = (permission: string) => {
    return user?.permissions.includes(permission) || user?.role === 'ADMIN';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ============================================================================
// Permission Guards
// ============================================================================

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-red-600 mb-4">
          Access Denied
        </h2>
        <p className="text-gray-600">
          Administrator privileges are required to access financial reports.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export function RequirePermission({ 
  permission, 
  children,
  fallback 
}: { 
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    return fallback || (
      <div className="p-4 text-center text-gray-600">
        You don't have permission to view this content.
      </div>
    );
  }

  return <>{children}</>;
}
```

### 2. tRPC Client Setup

```typescript
// ============================================================================
// tRPC Client Configuration
// ============================================================================

import { createTRPCReact } from '@trpc/react-query';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../backend/src/app';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: 'https://ops.yesgoddess.agency/api/trpc',
        headers: () => {
          const token = localStorage.getItem('auth_token');
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: async (url, options) => {
          const response = await fetch(url, options);
          
          // Handle authentication errors globally
          if (response.status === 401) {
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
            return response;
          }
          
          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              toast.error(`Rate limited. Try again in ${retryAfter} seconds.`);
            }
          }
          
          return response;
        }
      }),
    ],
  });
}

// ============================================================================
// React Query Configuration
// ============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutes
      cacheTime: 10 * 60 * 1000,     // 10 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on auth errors
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error: any) => {
        // Don't retry on client errors
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        return failureCount < 2;
      }
    }
  }
});

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const trpcClient = createTRPCClient();

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

## Implementation Patterns

### 1. React Hooks for Financial Reports

```typescript
// ============================================================================
// Custom Hooks for Reports
// ============================================================================

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

// Revenue Report Hook
export function useRevenueReport(input: RevenueReportInput) {
  return useQuery({
    queryKey: ['reports', 'revenue', input],
    queryFn: () => trpc.reports.getRevenue.query(input),
    enabled: !!(input.startDate && input.endDate),
    staleTime: 2 * 60 * 1000, // 2 minutes - financial data changes frequently
  });
}

// Payout Summary Hook
export function usePayoutSummary(input: PayoutSummaryInput) {
  return useQuery({
    queryKey: ['reports', 'payouts', input],
    queryFn: () => trpc.reports.getPayouts.query(input),
    enabled: !!(input.startDate && input.endDate),
  });
}

// Tax Documents Hook
export function useTaxDocuments(input: TaxDocumentsInput) {
  return useQuery({
    queryKey: ['reports', 'tax-documents', input],
    queryFn: () => trpc.reports.getTaxDocuments.query(input),
  });
}

// Reconciliation Hook
export function useReconciliation(input: ReconciliationInput) {
  return useQuery({
    queryKey: ['reports', 'reconciliation', input],
    queryFn: () => trpc.reports.getReconciliation.query(input),
    enabled: !!(input.startDate && input.endDate),
    staleTime: 10 * 60 * 1000, // 10 minutes - reconciliation is expensive
  });
}

// Report Generation Hook
export function useReportGeneration() {
  const [generatingReports, setGeneratingReports] = useState<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: (input: GenerateReportInput) => trpc.reports.generate.mutate(input),
    onSuccess: (data) => {
      setGeneratingReports(prev => new Set([...prev, data.reportId]));
      
      // Start polling for completion (implement polling logic)
      pollReportStatus(data.reportId);
    },
    onError: (error) => {
      const { message } = handleReportError(error);
      toast.error(message);
    }
  });

  const pollReportStatus = useCallback(async (reportId: string) => {
    // Implement status polling - this would be a future enhancement
    // For now, just remove from generating set after estimated time
    setTimeout(() => {
      setGeneratingReports(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }, 5 * 60 * 1000); // 5 minutes
  }, []);

  return {
    generateReport: mutation.mutate,
    isGenerating: mutation.isLoading,
    generatingReports: Array.from(generatingReports),
    error: mutation.error
  };
}

// Report Download Hook
export function useReportDownload() {
  return useMutation({
    mutationFn: (reportId: string) => trpc.reports.download.query({ reportId }),
    onSuccess: (data) => {
      // Trigger download
      window.open(data.downloadUrl, '_blank');
      toast.success('Download started');
    },
    onError: (error) => {
      const { message } = handleReportError(error);
      toast.error(message);
    }
  });
}

// ============================================================================
// Form Handling Hooks
// ============================================================================

export function useReportForm<T>(
  initialValues: T,
  validationSchema: any,
  onSubmit: (values: T) => void
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name: string, value: any) => {
    try {
      validationSchema.shape[name].parse(value);
      setErrors(prev => ({ ...prev, [name]: '' }));
      return true;
    } catch (error: any) {
      const message = error.issues?.[0]?.message || 'Invalid value';
      setErrors(prev => ({ ...prev, [name]: message }));
      return false;
    }
  };

  const handleChange = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
    validateField(name, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const validatedData = validationSchema.parse(values);
      await onSubmit(validatedData);
    } catch (error: any) {
      if (error.fieldErrors) {
        setErrors(handleValidationErrors(error.fieldErrors));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    setValues
  };
}
```

### 2. Component Examples

```typescript
// ============================================================================
// Revenue Report Dashboard Component
// ============================================================================

import React, { useState } from 'react';
import { format } from 'date-fns';

export function RevenueReportDashboard() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date()
  });

  const { data, isLoading, error, refetch } = useRevenueReport(dateRange);

  if (isLoading) {
    return <ReportLoadingSkeleton />;
  }

  if (error) {
    return <ReportErrorDisplay error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Revenue Report</h1>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Revenue"
          value={formatCurrency(data?.summary.totalRevenueCents)}
          trend={data?.summary.growthRatePercent}
        />
        <SummaryCard
          title="Transactions"
          value={data?.summary.transactionCount.toLocaleString()}
          trend={null}
        />
        <SummaryCard
          title="Avg per Period"
          value={formatCurrency(data?.summary.averageRevenuePerPeriod)}
          trend={null}
        />
        <SummaryCard
          title="Growth Rate"
          value={`${data?.summary.growthRatePercent.toFixed(1)}%`}
          trend={data?.summary.growthRatePercent}
        />
      </div>

      {/* Time Series Chart */}
      <RevenueChart timeSeries={data?.timeSeries || []} />

      {/* Breakdown Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BreakdownTable
          title="By License Type"
          data={data?.breakdown.byLicenseType || []}
        />
        <BreakdownTable
          title="By Asset Type"
          data={data?.breakdown.byAssetType || []}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Payout Management Component
// ============================================================================

export function PayoutManagement() {
  const [filters, setFilters] = useState<PayoutSummaryInput>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    status: 'all',
    limit: 20,
    offset: 0
  });

  const { data, isLoading, error } = usePayoutSummary(filters);

  const handleStatusFilter = (status: string) => {
    setFilters(prev => ({ ...prev, status: status as any, offset: 0 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, offset: page * prev.limit! }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Payout Management</h1>
        <PayoutFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Status Overview */}
      <StatusBreakdownCards statusBreakdown={data?.statusBreakdown || []} />

      {/* Status Filter Tabs */}
      <StatusFilterTabs activeStatus={filters.status} onChange={handleStatusFilter} />

      {/* Payout Table */}
      <PayoutTable
        payouts={data?.payouts || []}
        isLoading={isLoading}
        error={error}
      />

      {/* Pagination */}
      <Pagination
        currentPage={Math.floor(filters.offset! / filters.limit!)}
        totalPages={data ? Math.ceil(data.pagination.total / filters.limit!) : 0}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

// ============================================================================
// Report Generation Interface
// ============================================================================

export function ReportGenerator() {
  const { generateReport, isGenerating, error } = useReportGeneration();
  
  const { values, errors, handleChange, handleSubmit } = useReportForm(
    {
      reportType: 'revenue' as ReportType,
      startDate: '',
      endDate: '',
      format: 'pdf' as ReportFormat,
      name: ''
    },
    generateReportInputSchema,
    (data) => {
      generateReport({
        ...data,
        parameters: {
          startDate: data.startDate,
          endDate: data.endDate
        }
      });
    }
  );

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Generate Custom Report</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Report Type"
          error={errors.reportType}
        >
          <select
            value={values.reportType}
            onChange={(e) => handleChange('reportType', e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="revenue">Revenue Report</option>
            <option value="payouts">Payout Summary</option>
            <option value="tax">Tax Documents</option>
            <option value="reconciliation">Reconciliation</option>
          </select>
        </FormField>

        <FormField label="Start Date" error={errors.startDate}>
          <input
            type="date"
            value={values.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>

        <FormField label="End Date" error={errors.endDate}>
          <input
            type="date"
            value={values.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>

        <FormField label="Format" error={errors.format}>
          <select
            value={values.format}
            onChange={(e) => handleChange('format', e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
            <option value="excel">Excel</option>
            <option value="json">JSON</option>
          </select>
        </FormField>

        <FormField label="Report Name (Optional)" error={errors.name}>
          <input
            type="text"
            value={values.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Custom report name"
            className="w-full p-2 border rounded"
          />
        </FormField>

        <button
          type="submit"
          disabled={isGenerating}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : 'Generate Report'}
        </button>
      </form>
    </div>
  );
}
```

### 3. Utility Functions

```typescript
// ============================================================================
// Currency Formatting
// ============================================================================

export function formatCurrency(cents: number | undefined): string {
  if (cents === undefined || cents === null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

export function formatCurrencyCompact(cents: number | undefined): string {
  if (cents === undefined || cents === null) return '$0';
  const dollars = cents / 100;
  
  if (dollars >= 1000000) {
    return `$${(dollars / 1000000).toFixed(1)}M`;
  } else if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(1)}K`;
  } else {
    return formatCurrency(cents);
  }
}

// ============================================================================
// Date Utilities
// ============================================================================

export function formatDateRange(startDate: Date, endDate: Date): string {
  const start = format(startDate, 'MMM d, yyyy');
  const end = format(endDate, 'MMM d, yyyy');
  return `${start} - ${end}`;
}

export function validateDateRange(startDate: Date, endDate: Date): string | null {
  if (startDate >= endDate) {
    return 'End date must be after start date';
  }
  
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > MAX_DATE_RANGE_DAYS) {
    return 'Date range cannot exceed 2 years';
  }
  
  return null;
}

// ============================================================================
// Status Utilities
// ============================================================================

export function getStatusColor(status: PayoutStatus | TaxFilingStatus | ReportStatus): string {
  const statusColors = {
    // Payout statuses
    PENDING: 'yellow',
    PROCESSING: 'blue',
    COMPLETED: 'green',
    FAILED: 'red',
    CANCELLED: 'gray',
    
    // Tax document statuses
    GENERATED: 'green',
    FILED: 'blue',
    AMENDED: 'orange',
    VOIDED: 'red',
    
    // Report statuses
    GENERATING: 'blue'
  };
  
  return statusColors[status] || 'gray';
}

export function getStatusIcon(status: PayoutStatus | TaxFilingStatus | ReportStatus): string {
  const statusIcons = {
    PENDING: '⏳',
    PROCESSING: '⚡',
    COMPLETED: '✅',
    FAILED: '❌',
    CANCELLED: '⏹️',
    GENERATED: '📄',
    FILED: '📤',
    AMENDED: '📝',
    VOIDED: '🗑️',
    GENERATING: '⚙️'
  };
  
  return statusIcons[status] || '❓';
}

// ============================================================================
// Export Functions
// ============================================================================

export function downloadCSV(data: any[], filename: string): void {
  const csvContent = convertToCSV(data);
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  
  window.URL.revokeObjectURL(url);
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}
```

## Frontend Implementation Checklist

### Core Setup
- [ ] Install and configure tRPC React Query
- [ ] Set up authentication context and guards  
- [ ] Create error boundary for financial reports
- [ ] Implement global error handling
- [ ] Configure rate limiting handlers

### API Integration
- [ ] Create custom hooks for each report type
- [ ] Implement report generation workflow
- [ ] Add download functionality  
- [ ] Set up polling for report status
- [ ] Handle background job processing

### UI Components
- [ ] Build revenue report dashboard
- [ ] Create payout management interface
- [ ] Implement tax document viewer
- [ ] Add reconciliation report display
- [ ] Build report generation forms

### Data Visualization
- [ ] Integrate charting library (Chart.js, Recharts, etc.)
- [ ] Create revenue time series charts
- [ ] Build breakdown pie/bar charts
- [ ] Add trend indicators
- [ ] Implement interactive filters

### User Experience
- [ ] Add loading skeletons for reports
- [ ] Implement proper error states
- [ ] Create success/failure notifications
- [ ] Add export functionality
- [ ] Build responsive layouts

### Testing & Validation
- [ ] Add form validation with Zod
- [ ] Test error scenarios
- [ ] Validate date range limits
- [ ] Test authentication flows
- [ ] Verify permission enforcement

### Performance
- [ ] Implement query caching strategies
- [ ] Add pagination for large datasets
- [ ] Optimize chart rendering
- [ ] Use React.memo for expensive components
- [ ] Implement virtual scrolling for tables

This completes the comprehensive Financial Reporting API integration documentation. The frontend team now has everything needed to implement the financial reporting interface without clarification questions.
