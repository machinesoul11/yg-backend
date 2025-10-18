# Report Generation Module - Frontend Integration Guide
## Part 3: Implementation Guide & Best Practices

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only

**Last Updated:** October 17, 2025  
**Module:** Report Generation Service  
**Backend Repo:** yg-backend  
**Frontend Repo:** yesgoddess-web

---

## Table of Contents

1. [React Query Integration](#react-query-integration)
2. [Report Generation Flow](#report-generation-flow)
3. [Polling & Real-Time Updates](#polling--real-time-updates)
4. [File Downloads](#file-downloads)
5. [Pagination Implementation](#pagination-implementation)
6. [Form Implementation Examples](#form-implementation-examples)
7. [UX Considerations](#ux-considerations)
8. [Performance Optimization](#performance-optimization)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [Troubleshooting](#troubleshooting)

---

## React Query Integration

### Setup tRPC Client

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { ReportsRouter } from '@/server/routers/reports';

export const trpc = createTRPCReact<ReportsRouter>();

// Provider setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`,
      headers: () => ({
        // Will automatically include cookies for auth
      }),
    }),
  ],
});

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

---

### Query Hooks

```typescript
// hooks/useReports.ts
import { trpc } from '@/lib/trpc';

/**
 * Fetch revenue report
 */
export function useRevenueReport(params: {
  startDate: Date;
  endDate: Date;
  granularity?: 'daily' | 'weekly' | 'monthly';
  filters?: {
    brandIds?: string[];
    licenseTypes?: string[];
    regions?: string[];
  };
}) {
  return trpc.reports.getRevenue.useQuery(params, {
    enabled: Boolean(params.startDate && params.endDate),
    staleTime: 10 * 60 * 1000, // 10 minutes - financial data doesn't change rapidly
  });
}

/**
 * Fetch payout summary
 */
export function usePayouts(params: {
  startDate: Date;
  endDate: Date;
  status?: 'all' | 'pending' | 'completed' | 'failed';
  creatorId?: string;
  limit?: number;
  offset?: number;
}) {
  return trpc.reports.getPayouts.useQuery(params, {
    keepPreviousData: true, // For smooth pagination
  });
}

/**
 * Fetch scheduled reports
 */
export function useScheduledReports(params?: {
  isActive?: boolean;
  reportType?: string;
  limit?: number;
  offset?: number;
}) {
  return trpc.reports.getScheduled.useQuery(params || {}, {
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Fetch report templates
 */
export function useReportTemplates() {
  return trpc.reports.getTemplates.useQuery(undefined, {
    staleTime: Infinity, // Templates rarely change
    cacheTime: 24 * 60 * 60 * 1000, // Cache for 24 hours
  });
}

/**
 * Fetch saved report configurations
 */
export function useSavedConfigs() {
  return trpc.reports.getSavedConfigs.useQuery();
}
```

---

### Mutation Hooks

```typescript
// hooks/useReportMutations.ts
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/ui/use-toast';

/**
 * Generate report mutation
 */
export function useGenerateReport() {
  const { toast } = useToast();
  const utils = trpc.useContext();

  return trpc.reports.generate.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Report Queued',
        description: `Report ${data.reportId} is being generated. You'll be notified when it's ready.`,
      });
      
      // Invalidate related queries
      utils.reports.getReportStatus.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Generate from template mutation
 */
export function useGenerateFromTemplate() {
  const { toast } = useToast();

  return trpc.reports.generateFromTemplate.useMutation({
    onSuccess: () => {
      toast({
        title: 'Report Queued',
        description: 'Your report is being generated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Generate custom report mutation
 */
export function useGenerateCustomReport() {
  const { toast } = useToast();
  const validateMutation = trpc.reports.validateCustomReport.useMutation();

  const generateMutation = trpc.reports.generateCustomReport.useMutation({
    onSuccess: () => {
      toast({
        title: 'Report Queued',
        description: 'Your custom report is being generated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const generateWithValidation = async (config: any) => {
    // Validate first
    const validation = await validateMutation.mutateAsync({ config });
    
    if (!validation.valid) {
      toast({
        title: 'Validation Failed',
        description: validation.errors?.[0]?.message || 'Invalid configuration',
        variant: 'destructive',
      });
      return;
    }
    
    // Generate if valid
    return generateMutation.mutateAsync({ config });
  };

  return {
    generate: generateWithValidation,
    validate: validateMutation,
    isLoading: generateMutation.isLoading || validateMutation.isLoading,
    isError: generateMutation.isError || validateMutation.isError,
    error: generateMutation.error || validateMutation.error,
  };
}

/**
 * Save report configuration mutation
 */
export function useSaveReportConfig() {
  const { toast } = useToast();
  const utils = trpc.useContext();

  return trpc.reports.saveCustomReportConfig.useMutation({
    onSuccess: () => {
      toast({
        title: 'Configuration Saved',
        description: 'Report configuration saved successfully.',
      });
      
      // Refresh saved configs list
      utils.reports.getSavedConfigs.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
```

---

## Report Generation Flow

### Complete Report Generation Example

```typescript
// components/reports/ReportGenerator.tsx
'use client';

import { useState } from 'react';
import { useGenerateReport, useReportStatus } from '@/hooks/useReports';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export function ReportGenerator() {
  const [reportId, setReportId] = useState<string | null>(null);
  const generateMutation = useGenerateReport();
  
  // Poll for status when report is generating
  const { data: status } = useReportStatus(reportId, {
    enabled: Boolean(reportId),
    refetchInterval: (data) => {
      // Stop polling when completed or failed
      if (data?.status === 'COMPLETED' || data?.status === 'FAILED') {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });

  const handleGenerate = async () => {
    const result = await generateMutation.mutateAsync({
      reportType: 'revenue',
      parameters: {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-03-31'),
        granularity: 'monthly',
      },
      format: 'pdf',
      name: 'Q1 2025 Revenue Report',
    });
    
    setReportId(result.reportId);
  };

  const handleDownload = async () => {
    if (!reportId) return;
    
    const download = await trpc.reports.download.useQuery({ reportId });
    
    // Trigger browser download
    const link = document.createElement('a');
    link.href = download.downloadUrl;
    link.download = download.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <Button 
        onClick={handleGenerate}
        disabled={generateMutation.isLoading || status?.status === 'GENERATING'}
      >
        {generateMutation.isLoading ? 'Queueing...' : 'Generate Report'}
      </Button>

      {status && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status: {status.status}</span>
            {status.status === 'GENERATING' && (
              <span className="text-sm text-muted-foreground">
                Estimated: {status.metadata?.estimatedCompletionTime || '5 minutes'}
              </span>
            )}
          </div>

          {status.status === 'GENERATING' && (
            <Progress value={75} className="w-full" />
          )}

          {status.status === 'COMPLETED' && (
            <Button onClick={handleDownload} variant="outline">
              Download Report
            </Button>
          )}

          {status.status === 'FAILED' && (
            <div className="text-sm text-destructive">
              {status.metadata?.error || 'Generation failed'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Custom hook for polling report status
 */
function useReportStatus(
  reportId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | ((data?: any) => false | number) }
) {
  return trpc.reports.getReportStatus.useQuery(
    { reportId: reportId! },
    {
      enabled: Boolean(reportId) && options?.enabled !== false,
      refetchInterval: options?.refetchInterval,
    }
  );
}
```

---

## Polling & Real-Time Updates

### Polling Pattern for Report Status

```typescript
// hooks/useReportPolling.ts
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

export function useReportPolling(reportId: string | null) {
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const maxPolls = 60; // Stop after 60 polls (5 minutes at 5s intervals)

  const { data: status, refetch } = trpc.reports.getReportStatus.useQuery(
    { reportId: reportId! },
    {
      enabled: Boolean(reportId) && isPolling,
      refetchInterval: false, // Manual polling
    }
  );

  useEffect(() => {
    if (!reportId || !isPolling) return;

    const interval = setInterval(async () => {
      setPollCount((count) => count + 1);
      
      const result = await refetch();
      const currentStatus = result.data?.status;

      // Stop polling on completion, failure, or max attempts
      if (
        currentStatus === 'COMPLETED' ||
        currentStatus === 'FAILED' ||
        pollCount >= maxPolls
      ) {
        setIsPolling(false);
        clearInterval(interval);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [reportId, isPolling, pollCount, refetch]);

  const startPolling = () => {
    setIsPolling(true);
    setPollCount(0);
  };

  const stopPolling = () => {
    setIsPolling(false);
  };

  return {
    status,
    isPolling,
    startPolling,
    stopPolling,
    pollCount,
    estimatedTimeRemaining: Math.max(0, (maxPolls - pollCount) * 5), // seconds
  };
}
```

---

### Progressive Enhancement with Notifications

```typescript
// hooks/useReportNotifications.ts
import { useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';

export function useReportNotifications(reportId: string | null) {
  const { toast } = useToast();
  const { status } = useReportPolling(reportId);

  useEffect(() => {
    if (!status) return;

    if (status.status === 'COMPLETED') {
      toast({
        title: 'Report Ready',
        description: `${status.metadata?.name || 'Your report'} is ready for download.`,
        action: (
          <Button onClick={() => downloadReport(status.id)}>
            Download
          </Button>
        ),
      });
      
      // Browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Report Ready', {
          body: `${status.metadata?.name || 'Your report'} is ready for download.`,
          icon: '/logo.png',
        });
      }
    }

    if (status.status === 'FAILED') {
      toast({
        title: 'Report Generation Failed',
        description: status.metadata?.error || 'An error occurred while generating your report.',
        variant: 'destructive',
      });
    }
  }, [status, toast]);
}
```

---

## File Downloads

### Secure Download Implementation

```typescript
// utils/reportDownload.ts
import { trpc } from '@/lib/trpc';

/**
 * Download report file
 */
export async function downloadReport(reportId: string) {
  try {
    // Get secure download URL
    const downloadInfo = await trpc.reports.download.query({ reportId });
    
    // Fetch the file
    const response = await fetch(downloadInfo.downloadUrl);
    
    if (!response.ok) {
      throw new Error('Download failed');
    }
    
    // Get blob
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadInfo.filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Download error:', error);
    return false;
  }
}

/**
 * Download with progress tracking
 */
export async function downloadReportWithProgress(
  reportId: string,
  onProgress: (progress: number) => void
) {
  const downloadInfo = await trpc.reports.download.query({ reportId });
  
  const response = await fetch(downloadInfo.downloadUrl);
  
  if (!response.ok) {
    throw new Error('Download failed');
  }
  
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  let loaded = 0;
  
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  
  if (!reader) {
    throw new Error('No response body');
  }
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    chunks.push(value);
    loaded += value.length;
    
    if (total > 0) {
      onProgress((loaded / total) * 100);
    }
  }
  
  // Combine chunks into blob
  const blob = new Blob(chunks);
  
  // Trigger download
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadInfo.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * React component for download with progress
 */
export function DownloadButton({ reportId }: { reportId: string }) {
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    setProgress(0);
    
    try {
      await downloadReportWithProgress(reportId, setProgress);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-2">
      <Button 
        onClick={handleDownload}
        disabled={isDownloading}
      >
        {isDownloading ? `Downloading... ${Math.round(progress)}%` : 'Download Report'}
      </Button>
      
      {isDownloading && (
        <Progress value={progress} className="w-full" />
      )}
    </div>
  );
}
```

---

## Pagination Implementation

### Cursor-Based Pagination Hook

```typescript
// hooks/usePaginatedReports.ts
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function usePaginatedPayouts(params: {
  startDate: Date;
  endDate: Date;
  status?: 'all' | 'pending' | 'completed' | 'failed';
  creatorId?: string;
}) {
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const query = trpc.reports.getPayouts.useQuery(
    {
      ...params,
      limit,
      offset,
    },
    {
      keepPreviousData: true, // Prevent flash of loading state
    }
  );

  const totalPages = query.data ? Math.ceil(query.data.pagination.total / limit) : 0;

  return {
    ...query,
    page,
    totalPages,
    hasNextPage: query.data?.pagination.hasMore ?? false,
    hasPreviousPage: page > 1,
    nextPage: () => setPage((p) => p + 1),
    previousPage: () => setPage((p) => Math.max(1, p - 1)),
    goToPage: (newPage: number) => setPage(Math.max(1, Math.min(newPage, totalPages))),
  };
}

/**
 * Pagination component
 */
export function PayoutsPagination() {
  const {
    data,
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage,
    goToPage,
    isLoading,
  } = usePaginatedPayouts({
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Data display */}
      <div className="space-y-2">
        {data?.payouts.map((payout) => (
          <div key={payout.id} className="p-4 border rounded">
            <div>{payout.creator.name}</div>
            <div>${(payout.amountCents / 100).toFixed(2)}</div>
            <div>{payout.status}</div>
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between">
        <Button 
          onClick={previousPage} 
          disabled={!hasPreviousPage}
        >
          Previous
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          
          {/* Page number buttons */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
            .map((p) => (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="sm"
                onClick={() => goToPage(p)}
              >
                {p}
              </Button>
            ))}
        </div>

        <Button 
          onClick={nextPage} 
          disabled={!hasNextPage}
        >
          Next
        </Button>
      </div>

      {/* Results summary */}
      <div className="text-sm text-muted-foreground text-center">
        Showing {data?.payouts.length || 0} of {data?.pagination.total || 0} results
      </div>
    </div>
  );
}
```

---

## Form Implementation Examples

### Revenue Report Form

```typescript
// components/reports/RevenueReportForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGenerateReport } from '@/hooks/useReportMutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

const revenueReportSchema = z.object({
  name: z.string().min(1, 'Report name is required').max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  granularity: z.enum(['daily', 'weekly', 'monthly']),
  format: z.enum(['pdf', 'csv', 'excel']),
  filters: z.object({
    brandIds: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
  }).optional(),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

type RevenueReportForm = z.infer<typeof revenueReportSchema>;

export function RevenueReportForm() {
  const generateMutation = useGenerateReport();
  
  const form = useForm<RevenueReportForm>({
    resolver: zodResolver(revenueReportSchema),
    defaultValues: {
      name: '',
      startDate: new Date(new Date().getFullYear(), 0, 1), // Jan 1 of current year
      endDate: new Date(),
      granularity: 'monthly',
      format: 'pdf',
    },
  });

  const onSubmit = async (data: RevenueReportForm) => {
    await generateMutation.mutateAsync({
      reportType: 'revenue',
      name: data.name,
      parameters: {
        startDate: data.startDate,
        endDate: data.endDate,
        granularity: data.granularity,
        filters: data.filters,
      },
      format: data.format,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="name">Report Name</label>
        <Input
          id="name"
          {...form.register('name')}
          placeholder="Q1 2025 Revenue Report"
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate">Start Date</label>
          <DatePicker
            date={form.watch('startDate')}
            onDateChange={(date) => form.setValue('startDate', date)}
          />
          {form.formState.errors.startDate && (
            <p className="text-sm text-destructive">
              {form.formState.errors.startDate.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="endDate">End Date</label>
          <DatePicker
            date={form.watch('endDate')}
            onDateChange={(date) => form.setValue('endDate', date)}
          />
          {form.formState.errors.endDate && (
            <p className="text-sm text-destructive">
              {form.formState.errors.endDate.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="granularity">Granularity</label>
          <Select {...form.register('granularity')}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>

        <div>
          <label htmlFor="format">Format</label>
          <Select {...form.register('format')}>
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
            <option value="excel">Excel</option>
          </Select>
        </div>
      </div>

      <Button 
        type="submit" 
        disabled={generateMutation.isLoading}
      >
        {generateMutation.isLoading ? 'Generating...' : 'Generate Report'}
      </Button>
    </form>
  );
}
```

---

### Custom Report Builder Form

```typescript
// components/reports/CustomReportBuilder.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customReportConfigSchema } from '@/lib/validation/report-schemas';
import { useGenerateCustomReport } from '@/hooks/useReportMutations';
import { trpc } from '@/lib/trpc';

export function CustomReportBuilder() {
  const [dataSource, setDataSource] = useState<string>('transactions');
  const [category, setCategory] = useState<string>('financial');
  
  // Fetch available fields for selected data source
  const { data: fields } = trpc.reports.getCustomBuilderFields.useQuery(
    { dataSource: dataSource as any },
    { enabled: Boolean(dataSource) }
  );

  // Fetch intelligent defaults for selected category
  const { data: defaults } = trpc.reports.getCustomBuilderDefaults.useQuery(
    { category: category as any },
    { enabled: Boolean(category) }
  );

  const { generate, validate, isLoading } = useGenerateCustomReport();

  const form = useForm({
    resolver: zodResolver(customReportConfigSchema),
    defaultValues: defaults?.defaults,
  });

  // Update form when defaults change
  useEffect(() => {
    if (defaults?.defaults) {
      form.reset(defaults.defaults);
    }
  }, [defaults, form]);

  const onSubmit = async (data: any) => {
    await generate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Step 1: Basic Info */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">1. Basic Information</h3>
        
        <div>
          <label>Report Name</label>
          <Input {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label>Category</label>
          <Select 
            value={category}
            onValueChange={setCategory}
          >
            <option value="financial">Financial</option>
            <option value="operational">Operational</option>
            <option value="creator_performance">Creator Performance</option>
            <option value="brand_campaign">Brand Campaign</option>
            <option value="asset_portfolio">Asset Portfolio</option>
            <option value="license_analytics">License Analytics</option>
          </Select>
        </div>
      </section>

      {/* Step 2: Data Source */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">2. Data Source</h3>
        
        <div>
          <label>Primary Entity</label>
          <Select 
            value={dataSource}
            onValueChange={setDataSource}
            {...form.register('dataSource.primaryEntity')}
          >
            <option value="transactions">Transactions</option>
            <option value="royalties">Royalties</option>
            <option value="licenses">Licenses</option>
            <option value="assets">Assets</option>
            <option value="creators">Creators</option>
            <option value="brands">Brands</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label>Start Date</label>
            <DatePicker
              date={form.watch('dataSource.dateRange.startDate')}
              onDateChange={(date) => 
                form.setValue('dataSource.dateRange.startDate', date)
              }
            />
          </div>

          <div>
            <label>End Date</label>
            <DatePicker
              date={form.watch('dataSource.dateRange.endDate')}
              onDateChange={(date) => 
                form.setValue('dataSource.dateRange.endDate', date)
              }
            />
          </div>
        </div>
      </section>

      {/* Step 3: Metrics */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">3. Metrics</h3>
        
        <div className="space-y-2">
          {form.watch('metrics')?.map((metric: any, index: number) => (
            <div key={index} className="flex gap-2">
              <Select {...form.register(`metrics.${index}.field`)}>
                {fields?.fields
                  .filter((f) => f.aggregatable)
                  .map((field) => (
                    <option key={field.field} value={field.field}>
                      {field.label}
                    </option>
                  ))}
              </Select>

              <Select {...form.register(`metrics.${index}.aggregation`)}>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
              </Select>

              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  const metrics = form.getValues('metrics');
                  metrics.splice(index, 1);
                  form.setValue('metrics', metrics);
                }}
              >
                Remove
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const metrics = form.getValues('metrics') || [];
              metrics.push({
                field: '',
                aggregation: 'sum',
                format: 'number',
              });
              form.setValue('metrics', metrics);
            }}
          >
            Add Metric
          </Button>
        </div>
      </section>

      {/* Step 4: Group By (Optional) */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">4. Group By (Optional)</h3>
        
        {/* Similar implementation to metrics */}
      </section>

      {/* Submit */}
      <div className="flex gap-2">
        <Button 
          type="button"
          variant="outline"
          onClick={async () => {
            const config = form.getValues();
            const validation = await validate.mutateAsync({ config });
            
            if (validation.valid) {
              alert('Configuration is valid!');
            } else {
              alert('Validation errors: ' + JSON.stringify(validation.errors));
            }
          }}
        >
          Validate
        </Button>

        <Button 
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? 'Generating...' : 'Generate Report'}
        </Button>
      </div>
    </form>
  );
}
```

---

## UX Considerations

### Loading States

```typescript
// components/reports/ReportLoadingState.tsx
export function ReportLoadingState({ status }: { status: string }) {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-center">
        <Spinner size="lg" />
      </div>

      <div className="text-center space-y-2">
        <h3 className="font-semibold">
          {status === 'validating' && 'Validating Report Configuration...'}
          {status === 'queued' && 'Report Queued for Generation...'}
          {status === 'generating' && 'Generating Your Report...'}
        </h3>

        <p className="text-sm text-muted-foreground">
          {status === 'validating' && 'Checking configuration and permissions'}
          {status === 'queued' && 'Your report is in the queue and will begin shortly'}
          {status === 'generating' && 'This may take a few minutes depending on data volume'}
        </p>
      </div>

      {status === 'generating' && (
        <div className="space-y-2">
          <Progress value={75} className="w-full" />
          <p className="text-xs text-center text-muted-foreground">
            Estimated time remaining: 2 minutes
          </p>
        </div>
      )}
    </div>
  );
}
```

---

### Error States

```typescript
// components/reports/ReportErrorState.tsx
export function ReportErrorState({ 
  error, 
  onRetry 
}: { 
  error: string; 
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4 p-6 border border-destructive rounded-lg">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <h3 className="font-semibold">Report Generation Failed</h3>
      </div>

      <p className="text-sm">{error}</p>

      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          Try Again
        </Button>
      )}
    </div>
  );
}
```

---

### Empty States

```typescript
// components/reports/ReportEmptyState.tsx
export function ReportEmptyState({ 
  title = 'No Reports Yet',
  description = 'Generate your first report to get started',
  action
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
      <FileText className="h-12 w-12 text-muted-foreground" />
      
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      </div>

      {action}
    </div>
  );
}
```

---

## Performance Optimization

### Query Caching Strategy

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Global defaults
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Query-specific overrides
      onError: (error) => {
        console.error('Query error:', error);
      },
    },
    mutations: {
      retry: 1,
      onError: (error) => {
        console.error('Mutation error:', error);
      },
    },
  },
});

// Prefetch templates on app load
export async function prefetchReportData() {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['reports', 'templates'],
      queryFn: () => trpc.reports.getTemplates.query(),
      staleTime: Infinity, // Templates rarely change
    }),
    queryClient.prefetchQuery({
      queryKey: ['reports', 'types'],
      queryFn: () => trpc.reports.getReportTypes.query(),
      staleTime: Infinity,
    }),
  ]);
}
```

---

### Debounced Filters

```typescript
// hooks/useDebouncedReports.ts
import { useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { trpc } from '@/lib/trpc';

export function useDebouncedPayouts(filters: {
  startDate: Date;
  endDate: Date;
  creatorId?: string;
  status?: string;
}) {
  // Debounce filter changes by 500ms
  const debouncedFilters = useDebounce(filters, 500);

  const query = trpc.reports.getPayouts.useQuery(debouncedFilters, {
    keepPreviousData: true,
  });

  return query;
}

// useDebounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

---

### Optimistic Updates

```typescript
// hooks/useOptimisticReportMutations.ts
export function useOptimisticSaveConfig() {
  const utils = trpc.useContext();

  return trpc.reports.saveCustomReportConfig.useMutation({
    onMutate: async (newConfig) => {
      // Cancel outgoing refetches
      await utils.reports.getSavedConfigs.cancel();

      // Snapshot previous value
      const previousConfigs = utils.reports.getSavedConfigs.getData();

      // Optimistically update to new value
      utils.reports.getSavedConfigs.setData(undefined, (old) => {
        if (!old) return old;
        
        return {
          ...old,
          configs: [
            ...old.configs,
            {
              ...newConfig,
              id: 'temp-' + Date.now(),
              createdAt: new Date(),
              updatedAt: new Date(),
              usageCount: 0,
            },
          ],
        };
      });

      return { previousConfigs };
    },
    
    onError: (err, newConfig, context) => {
      // Rollback on error
      if (context?.previousConfigs) {
        utils.reports.getSavedConfigs.setData(undefined, context.previousConfigs);
      }
    },
    
    onSettled: () => {
      // Refetch after mutation
      utils.reports.getSavedConfigs.invalidate();
    },
  });
}
```

---

## Frontend Implementation Checklist

### Phase 1: Core Functionality

- [ ] **Setup tRPC Client**
  - [ ] Configure tRPC provider with authentication
  - [ ] Setup React Query client with proper defaults
  - [ ] Test connection to backend API

- [ ] **Implement Report List View**
  - [ ] Display available report templates
  - [ ] Show recent reports with status
  - [ ] Implement pagination for large lists
  - [ ] Add loading and empty states

- [ ] **Implement Report Generation**
  - [ ] Create form for revenue reports
  - [ ] Create form for payout summaries
  - [ ] Implement validation before submission
  - [ ] Handle generation errors gracefully

- [ ] **Implement Status Polling**
  - [ ] Poll report status after generation
  - [ ] Show progress indicator
  - [ ] Display estimated completion time
  - [ ] Stop polling on completion or failure

- [ ] **Implement Download**
  - [ ] Generate secure download URL
  - [ ] Trigger browser download
  - [ ] Show download progress
  - [ ] Handle expired URLs

### Phase 2: Advanced Features

- [ ] **Custom Report Builder**
  - [ ] Step-by-step wizard UI
  - [ ] Dynamic field selection based on data source
  - [ ] Intelligent defaults by category
  - [ ] Real-time validation
  - [ ] Configuration preview

- [ ] **Scheduled Reports**
  - [ ] Create scheduled report form
  - [ ] Display scheduled reports list
  - [ ] Edit/delete scheduled reports
  - [ ] Show next execution time
  - [ ] Manual trigger functionality

- [ ] **Report Templates**
  - [ ] Display available templates
  - [ ] Template preview/details
  - [ ] Generate from template
  - [ ] Template-specific parameter forms

- [ ] **Saved Configurations**
  - [ ] Save custom report configs
  - [ ] List saved configs
  - [ ] Load saved config into builder
  - [ ] Delete saved configs
  - [ ] Share configs (if public)

### Phase 3: UX Enhancements

- [ ] **Notifications**
  - [ ] Toast notifications for generation events
  - [ ] Browser notifications when ready
  - [ ] Email notification preferences

- [ ] **Filters & Search**
  - [ ] Filter reports by type
  - [ ] Filter by date range
  - [ ] Search by name
  - [ ] Save filter presets

- [ ] **Visualization**
  - [ ] Preview charts in UI (if JSON format)
  - [ ] Summary cards with key metrics
  - [ ] Comparison views

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] Screen reader support
  - [ ] Focus management
  - [ ] ARIA labels

### Phase 4: Performance & Polish

- [ ] **Optimization**
  - [ ] Implement query caching
  - [ ] Prefetch common data
  - [ ] Debounce filter inputs
  - [ ] Lazy load components

- [ ] **Error Handling**
  - [ ] Comprehensive error messages
  - [ ] Retry logic for transient errors
  - [ ] Fallback UI states
  - [ ] Error boundary implementation

- [ ] **Testing**
  - [ ] Unit tests for validation logic
  - [ ] Integration tests for forms
  - [ ] E2E tests for critical flows
  - [ ] Accessibility testing

- [ ] **Documentation**
  - [ ] Component documentation
  - [ ] User guide for report generation
  - [ ] Admin documentation

---

## Troubleshooting

### Common Issues

#### Issue: Reports Stuck in "GENERATING" Status

**Symptoms:**
- Report status remains "GENERATING" for > 10 minutes
- No error messages

**Possible Causes:**
1. Backend job queue is down
2. Large data volume causing timeout
3. Database connection issues

**Solutions:**
```typescript
// Implement timeout detection
const { status, pollCount } = useReportPolling(reportId);

if (pollCount > 60 && status?.status === 'GENERATING') {
  // Show timeout message
  toast({
    title: 'Generation Taking Longer Than Expected',
    description: 'Your report is still processing. We\'ll notify you when it\'s ready.',
  });
  
  // Stop polling, rely on notifications
  stopPolling();
}
```

---

#### Issue: Download URLs Expired

**Symptoms:**
- 403 or 410 errors when clicking download
- "URL expired" messages

**Possible Causes:**
1. URLs expire after 1 hour
2. Report itself expired (30 days retention)

**Solutions:**
```typescript
// Regenerate download URL
const handleExpiredDownload = async (reportId: string) => {
  try {
    // Try to get fresh download URL
    const download = await trpc.reports.download.query({ reportId });
    
    // Trigger download
    window.location.href = download.downloadUrl;
  } catch (error) {
    if (error.code === 'NOT_FOUND' || error.code === 'BAD_REQUEST') {
      // Report expired, offer to regenerate
      toast({
        title: 'Report Expired',
        description: 'This report has expired. Would you like to generate it again?',
        action: (
          <Button onClick={() => regenerateReport(reportId)}>
            Regenerate
          </Button>
        ),
      });
    }
  }
};
```

---

#### Issue: Validation Errors Not Clear

**Symptoms:**
- Generic "validation failed" messages
- No specific field errors

**Solutions:**
```typescript
// Parse Zod validation errors
const handleValidationError = (error: any) => {
  if (error instanceof z.ZodError) {
    const fieldErrors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    
    // Display field-specific errors
    fieldErrors.forEach(({ field, message }) => {
      form.setError(field as any, { message });
    });
  }
};
```

---

#### Issue: Slow Report Generation

**Symptoms:**
- Reports take > 5 minutes to generate
- Timeout errors

**Solutions:**
1. **Reduce Date Range**
   ```typescript
   // Suggest smaller ranges for large reports
   if (daysDiff > 365) {
     toast({
       title: 'Large Date Range',
       description: 'Reports with date ranges > 1 year may take longer to generate. Consider splitting into multiple reports.',
       variant: 'warning',
     });
   }
   ```

2. **Use Filters**
   ```typescript
   // Encourage filtering
   if (!filters || Object.keys(filters).length === 0) {
     toast({
       title: 'Tip: Use Filters',
       description: 'Adding filters can significantly speed up report generation.',
     });
   }
   ```

3. **Choose Appropriate Format**
   ```typescript
   // Recommend CSV for large datasets
   if (recordCount > 10000 && format === 'pdf') {
     toast({
       title: 'Large Dataset',
       description: 'Consider using CSV format for faster generation of large reports.',
     });
   }
   ```

---

### Debug Mode

```typescript
// Enable debug logging
const DEBUG = process.env.NODE_ENV === 'development';

export function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.log(`[Reports Debug] ${message}`, data || '');
  }
}

// Use in hooks
export function useReportGeneration() {
  const mutation = useGenerateReport();
  
  useEffect(() => {
    debugLog('Report generation mutation state:', {
      isLoading: mutation.isLoading,
      isError: mutation.isError,
      isSuccess: mutation.isSuccess,
    });
  }, [mutation.isLoading, mutation.isError, mutation.isSuccess]);
  
  return mutation;
}
```

---

## Next Steps

Review related documentation:
- **[← Part 1: API Endpoints & Request/Response Schemas](./REPORT_GENERATION_INTEGRATION_PART_1_API_ENDPOINTS.md)**
- **[← Part 2: TypeScript Types, Business Logic & Error Handling](./REPORT_GENERATION_INTEGRATION_PART_2_TYPES_AND_LOGIC.md)**

---

## Support

For questions or issues:
- Backend Developer: Review backend implementation
- Frontend Integration: Review this guide and example code
- React Query: See [React Query docs](https://tanstack.com/query/latest)
- tRPC: See [tRPC docs](https://trpc.io/docs)

---

## Appendix: Complete Example

### Full Feature Implementation

```typescript
// pages/admin/reports/index.tsx
'use client';

import { useState } from 'react';
import { ReportList } from '@/components/reports/ReportList';
import { ReportGenerator } from '@/components/reports/ReportGenerator';
import { ScheduledReports } from '@/components/reports/ScheduledReports';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ReportsPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Reports</h1>

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="recent">Recent Reports</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <ReportGenerator />
        </TabsContent>

        <TabsContent value="recent">
          <ReportList />
        </TabsContent>

        <TabsContent value="scheduled">
          <ScheduledReports />
        </TabsContent>

        <TabsContent value="templates">
          <ReportTemplates />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

This completes the comprehensive frontend integration guide for the Report Generation module.
