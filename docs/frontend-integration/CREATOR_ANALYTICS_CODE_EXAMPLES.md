# Creator Analytics - Code Examples & Implementation Patterns

> **Classification:** ⚡ HYBRID - Implementation guide for both creator portal and admin dashboard

This document provides complete, production-ready code examples for integrating the Creator Analytics API into your Next.js 15 frontend.

---

## Table of Contents

1. [tRPC Client Setup](#trpc-client-setup)
2. [API Client Wrapper](#api-client-wrapper)
3. [React Hooks](#react-hooks)
4. [Component Examples](#component-examples)
5. [Form Validation](#form-validation)
6. [Error Handling Patterns](#error-handling-patterns)
7. [Chart Integration](#chart-integration)
8. [State Management](#state-management)

---

## tRPC Client Setup

### 1. Install Dependencies

```bash
npm install @trpc/client @trpc/react-query @trpc/server
npm install @tanstack/react-query superjson
npm install zod
```

### 2. Create tRPC Client (`lib/trpc.ts`)

```typescript
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server/routers/_app'; // Import backend router type

// Create tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();

// tRPC client configuration
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: process.env.NEXT_PUBLIC_API_URL + '/api/trpc',
      
      // Include authentication token
      headers: async () => {
        const session = await getSession();
        return {
          authorization: session?.user?.token ? `Bearer ${session.user.token}` : '',
        };
      },
      
      // Handle rate limit headers
      transformer: superjson,
    }),
  ],
});
```

### 3. Provider Setup (`app/providers.tsx`)

```typescript
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from '@/lib/trpc';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            cacheTime: 30 * 60 * 1000, // 30 minutes
            retry: 3,
            refetchOnWindowFocus: true,
          },
        },
      })
  );

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

## API Client Wrapper

Create a centralized wrapper for analytics API calls with error handling and type safety.

### `lib/api/creator-analytics.ts`

```typescript
import { trpc } from '@/lib/trpc';
import type {
  GetEngagementAnalyticsInput,
  GetPortfolioPerformanceInput,
  GetLicenseMetricsInput,
  GetBenchmarksInput,
  EngagementAnalyticsResponse,
  PortfolioPerformanceResponse,
  LicenseMetricsResponse,
  BenchmarkComparisonResponse,
} from '@/types/creator-analytics';

/**
 * Creator Analytics API Client
 * Centralized wrapper for all analytics endpoints
 */
export class CreatorAnalyticsClient {
  /**
   * Get engagement analytics
   */
  static useEngagement(input: GetEngagementAnalyticsInput) {
    return trpc.creatorAnalytics.getEngagement.useQuery(input, {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
    });
  }

  /**
   * Get portfolio performance
   */
  static usePortfolioPerformance(input: GetPortfolioPerformanceInput) {
    return trpc.creatorAnalytics.getPortfolioPerformance.useQuery(input, {
      staleTime: 15 * 60 * 1000, // 15 minutes
    });
  }

  /**
   * Get license metrics
   */
  static useLicenseMetrics(input: GetLicenseMetricsInput) {
    return trpc.creatorAnalytics.getLicenseMetrics.useQuery(input, {
      staleTime: 15 * 60 * 1000,
    });
  }

  /**
   * Get benchmarks
   */
  static useBenchmarks(input: GetBenchmarksInput) {
    return trpc.creatorAnalytics.getBenchmarks.useQuery(input, {
      staleTime: 60 * 60 * 1000, // 1 hour (benchmarks change slowly)
    });
  }

  /**
   * Admin: Get all analytics for a creator
   */
  static useCreatorAnalyticsSummary(
    creatorId: string,
    dateRange?: { start: string; end: string }
  ) {
    return trpc.creatorAnalytics.getCreatorAnalyticsSummary.useQuery(
      { creatorId, dateRange },
      {
        enabled: !!creatorId, // Only fetch if creatorId is provided
      }
    );
  }
}
```

---

## React Hooks

### Custom Hook: Date Range Selector

```typescript
import { useState, useMemo } from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export function useDateRange(defaultDays: number = 30) {
  const [startDate, setStartDate] = useState(() => 
    startOfDay(subDays(new Date(), defaultDays)).toISOString()
  );
  const [endDate, setEndDate] = useState(() => 
    endOfDay(new Date()).toISOString()
  );

  const dateRange = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  const setLast7Days = () => {
    setStartDate(startOfDay(subDays(new Date(), 7)).toISOString());
    setEndDate(endOfDay(new Date()).toISOString());
  };

  const setLast30Days = () => {
    setStartDate(startOfDay(subDays(new Date(), 30)).toISOString());
    setEndDate(endOfDay(new Date()).toISOString());
  };

  const setLast90Days = () => {
    setStartDate(startOfDay(subDays(new Date(), 90)).toISOString());
    setEndDate(endOfDay(new Date()).toISOString());
  };

  const setCustomRange = (start: Date, end: Date) => {
    setStartDate(startOfDay(start).toISOString());
    setEndDate(endOfDay(end).toISOString());
  };

  return {
    dateRange,
    setLast7Days,
    setLast30Days,
    setLast90Days,
    setCustomRange,
    startDate,
    endDate,
  };
}
```

### Custom Hook: Engagement Analytics

```typescript
import { useMemo } from 'react';
import { CreatorAnalyticsClient } from '@/lib/api/creator-analytics';

export function useEngagementAnalytics(
  creatorId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    granularity?: 'hour' | 'day' | 'week' | 'month';
    compareWithPrevious?: boolean;
  }
) {
  const { data, error, isLoading, refetch } = CreatorAnalyticsClient.useEngagement({
    id: creatorId,
    ...options,
  });

  // Compute derived metrics
  const metrics = useMemo(() => {
    if (!data) return null;

    return {
      ...data.metrics,
      // Add formatted versions
      clickThroughRateFormatted: `${data.metrics.clickThroughRate.toFixed(2)}%`,
      conversionRateFormatted: `${data.metrics.conversionRate.toFixed(2)}%`,
      avgEngagementTimeFormatted: formatEngagementTime(data.metrics.avgEngagementTime),
    };
  }, [data]);

  return {
    data,
    metrics,
    timeSeries: data?.timeSeries ?? [],
    topAssets: data?.topAssets ?? [],
    comparison: data?.comparison,
    error,
    isLoading,
    refetch,
  };
}

function formatEngagementTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
```

### Custom Hook: Portfolio Performance with Pagination

```typescript
import { useState } from 'react';
import { CreatorAnalyticsClient } from '@/lib/api/creator-analytics';

export function usePortfolioPerformance(creatorId: string) {
  const [page, setPage] = useState(0);
  const [limit] = useState(20);
  const [sortBy, setSortBy] = useState<'views' | 'conversions' | 'revenue' | 'engagementRate' | 'title'>('views');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState<{
    assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
    status?: 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  }>({});

  const { data, error, isLoading } = CreatorAnalyticsClient.usePortfolioPerformance({
    id: creatorId,
    sortBy,
    sortOrder,
    limit,
    offset: page * limit,
    ...filters,
  });

  const totalPages = data ? Math.ceil(data.pagination.total / limit) : 0;

  const nextPage = () => {
    if (data?.pagination.hasMore) {
      setPage(p => p + 1);
    }
  };

  const prevPage = () => {
    if (page > 0) {
      setPage(p => p - 1);
    }
  };

  const goToPage = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      setPage(newPage);
    }
  };

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  return {
    data,
    error,
    isLoading,
    page,
    totalPages,
    hasNextPage: data?.pagination.hasMore ?? false,
    hasPrevPage: page > 0,
    nextPage,
    prevPage,
    goToPage,
    sortBy,
    sortOrder,
    toggleSort,
    filters,
    setFilters,
  };
}
```

---

## Component Examples

### Engagement Analytics Dashboard

```tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useEngagementAnalytics } from '@/hooks/useEngagementAnalytics';
import { useDateRange } from '@/hooks/useDateRange';
import { DateRangePicker } from '@/components/date-range-picker';
import { MetricCard } from '@/components/metric-card';
import { EngagementChart } from '@/components/charts/engagement-chart';
import { TopAssetsTable } from '@/components/tables/top-assets-table';
import { ComparisonBadge } from '@/components/comparison-badge';

export function EngagementDashboard({ creatorId }: { creatorId: string }) {
  const { dateRange, setCustomRange, setLast7Days, setLast30Days, setLast90Days } = useDateRange(30);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [compareWithPrevious, setCompareWithPrevious] = useState(false);

  const {
    metrics,
    timeSeries,
    topAssets,
    comparison,
    error,
    isLoading,
  } = useEngagementAnalytics(creatorId, {
    ...dateRange,
    granularity,
    compareWithPrevious,
  });

  if (isLoading) {
    return <EngagementSkeleton />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (!metrics) {
    return <EmptyState message="No engagement data available" />;
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Engagement Analytics</h1>
        
        <div className="flex gap-4">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onRangeChange={setCustomRange}
            presets={[
              { label: 'Last 7 days', action: setLast7Days },
              { label: 'Last 30 days', action: setLast30Days },
              { label: 'Last 90 days', action: setLast90Days },
            ]}
          />
          
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as any)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={compareWithPrevious}
              onChange={(e) => setCompareWithPrevious(e.target.checked)}
            />
            Compare with previous period
          </label>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Views"
          value={metrics.totalViews.toLocaleString()}
          change={comparison?.viewsChange}
          icon="eye"
        />
        <MetricCard
          title="Total Clicks"
          value={metrics.totalClicks.toLocaleString()}
          change={comparison?.clicksChange}
          icon="cursor"
        />
        <MetricCard
          title="Conversions"
          value={metrics.totalConversions.toLocaleString()}
          change={comparison?.conversionsChange}
          icon="check-circle"
        />
        <MetricCard
          title="Click-Through Rate"
          value={metrics.clickThroughRateFormatted}
          icon="trending-up"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Unique Visitors"
          value={metrics.uniqueVisitors.toLocaleString()}
        />
        <MetricCard
          title="Avg Engagement Time"
          value={metrics.avgEngagementTimeFormatted}
        />
        <MetricCard
          title="Conversion Rate"
          value={metrics.conversionRateFormatted}
          change={comparison?.conversionRateChange}
        />
      </div>

      {/* Time Series Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <EngagementChart data={timeSeries} granularity={granularity} />
        </CardContent>
      </Card>

      {/* Top Performing Assets */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <TopAssetsTable assets={topAssets} />
        </CardContent>
      </Card>
    </div>
  );
}
```

### Portfolio Performance Component

```tsx
'use client';

import { usePortfolioPerformance } from '@/hooks/usePortfolioPerformance';
import { DataTable } from '@/components/data-table';
import { PerformanceDistributionChart } from '@/components/charts/performance-distribution';

export function PortfolioPerformance({ creatorId }: { creatorId: string }) {
  const {
    data,
    error,
    isLoading,
    page,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    toggleSort,
    sortBy,
    sortOrder,
    filters,
    setFilters,
  } = usePortfolioPerformance(creatorId);

  if (isLoading) return <PortfolioSkeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data) return <EmptyState message="No portfolio data" />;

  const columns = [
    {
      key: 'title',
      header: 'Asset',
      sortable: true,
      render: (asset: any) => (
        <div className="flex items-center gap-3">
          {asset.thumbnailUrl && (
            <img src={asset.thumbnailUrl} alt={asset.title} className="w-12 h-12 object-cover rounded" />
          )}
          <div>
            <div className="font-medium">{asset.title}</div>
            <div className="text-sm text-gray-500">{asset.type}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'views',
      header: 'Views',
      sortable: true,
      render: (asset: any) => asset.views.toLocaleString(),
    },
    {
      key: 'conversions',
      header: 'Conversions',
      sortable: true,
      render: (asset: any) => asset.conversions.toLocaleString(),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      sortable: true,
      render: (asset: any) => formatCurrency(asset.revenueCents),
    },
    {
      key: 'engagementRate',
      header: 'Engagement',
      sortable: true,
      render: (asset: any) => `${asset.engagementRate.toFixed(2)}%`,
    },
    {
      key: 'activeLicenses',
      header: 'Active Licenses',
      render: (asset: any) => asset.activeLicenses,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Portfolio Performance</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard title="Total Assets" value={data.summary.totalAssets} />
        <MetricCard title="Published" value={data.summary.publishedAssets} />
        <MetricCard title="Total Views" value={data.summary.totalViews.toLocaleString()} />
        <MetricCard title="Total Revenue" value={formatCurrency(data.summary.totalRevenueCents)} />
        <MetricCard title="Avg Views/Asset" value={data.summary.avgViewsPerAsset.toLocaleString()} />
        <MetricCard title="Avg Revenue/Asset" value={formatCurrency(data.summary.avgRevenuePerAssetCents)} />
      </div>

      {/* Performance Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceDistributionChart distribution={data.performanceDistribution} />
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filters.assetType || ''}
          onChange={(e) => setFilters({ ...filters, assetType: e.target.value as any })}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">All Types</option>
          <option value="IMAGE">Image</option>
          <option value="VIDEO">Video</option>
          <option value="AUDIO">Audio</option>
          <option value="DOCUMENT">Document</option>
          <option value="THREE_D">3D</option>
          <option value="OTHER">Other</option>
        </select>

        <select
          value={filters.status || ''}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">All Statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="REVIEW">In Review</option>
          <option value="APPROVED">Approved</option>
        </select>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data.assets}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={toggleSort}
        pagination={{
          currentPage: page,
          totalPages,
          hasNext: hasNextPage,
          hasPrev: hasPrevPage,
          onNext: nextPage,
          onPrev: prevPage,
        }}
      />
    </div>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
```

### License Metrics Component

```tsx
'use client';

import { CreatorAnalyticsClient } from '@/lib/api/creator-analytics';
import { DonutChart } from '@/components/charts/donut-chart';
import { LineChart } from '@/components/charts/line-chart';

export function LicenseMetrics({ creatorId }: { creatorId: string }) {
  const { data, error, isLoading } = CreatorAnalyticsClient.useLicenseMetrics({
    id: creatorId,
    groupBy: 'status',
    includeExpired: false,
  });

  if (isLoading) return <LicenseMetricsSkeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data) return <EmptyState message="No license data" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">License Metrics</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard
          title="Total Licenses"
          value={data.summary.totalLicenses}
          icon="file-text"
        />
        <MetricCard
          title="Active Licenses"
          value={data.summary.activeLicenses}
          icon="check-circle"
          variant="success"
        />
        <MetricCard
          title="Expiring Soon"
          value={data.summary.expiringLicenses}
          icon="alert-circle"
          variant="warning"
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(data.summary.totalRevenueCents)}
          icon="dollar-sign"
        />
        <MetricCard
          title="Avg License Value"
          value={formatCurrency(data.summary.avgLicenseValueCents)}
          icon="trending-up"
        />
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={data.byStatus.map(item => ({
                label: item.status,
                value: item.count,
                color: getStatusColor(item.status),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Type</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={data.byType.map(item => ({
                label: item.type,
                value: item.count,
                color: getTypeColor(item.type),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* Revenue Time Series */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            data={data.revenueTimeSeries.map(point => ({
              x: new Date(point.period),
              revenue: point.revenueCents / 100,
              newLicenses: point.newLicenses,
              renewals: point.renewals,
            }))}
            xKey="x"
            yKeys={['revenue', 'newLicenses', 'renewals']}
          />
        </CardContent>
      </Card>

      {/* License Velocity */}
      <Card>
        <CardHeader>
          <CardTitle>License Velocity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Avg Days to First License</div>
              <div className="text-2xl font-bold">{data.licenseVelocity.averageDaysToFirstLicense}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Avg Days to Conversion</div>
              <div className="text-2xl font-bold">{data.licenseVelocity.averageDaysToConversion}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Monthly Growth Rate</div>
              <div className="text-2xl font-bold">{data.licenseVelocity.monthlyGrowthRate.toFixed(1)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Licensed Assets */}
      <Card>
        <CardHeader>
          <CardTitle>Top Licensed Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Asset</th>
                <th className="text-right py-2">Licenses</th>
                <th className="text-right py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.topLicensedAssets.map(asset => (
                <tr key={asset.assetId} className="border-b">
                  <td className="py-3">{asset.title}</td>
                  <td className="text-right">{asset.licenseCount}</td>
                  <td className="text-right">{formatCurrency(asset.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: '#10b981',
    PENDING: '#f59e0b',
    EXPIRING_SOON: '#ef4444',
    EXPIRED: '#6b7280',
  };
  return colors[status] || '#6b7280';
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    STANDARD: '#3b82f6',
    EXCLUSIVE: '#8b5cf6',
    COMMERCIAL: '#ec4899',
  };
  return colors[type] || '#6b7280';
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
```

---

## Form Validation

### Zod Schema (Frontend Validation)

```typescript
import { z } from 'zod';

export const engagementAnalyticsSchema = z.object({
  id: z.string().cuid('Invalid creator ID'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
  compareWithPrevious: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      const daysDiff = 
        (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) 
        / (1000 * 60 * 60 * 24);
      return daysDiff <= 365;
    }
    return true;
  },
  {
    message: 'Date range cannot exceed 365 days',
    path: ['endDate'],
  }
);

export const portfolioPerformanceSchema = z.object({
  id: z.string().cuid(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['views', 'conversions', 'revenue', 'engagementRate', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  assetType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'THREE_D', 'OTHER']).optional(),
  status: z.enum(['DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});
```

### Form Validation Hook

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { engagementAnalyticsSchema } from '@/schemas/analytics';

export function useEngagementForm(creatorId: string) {
  const form = useForm({
    resolver: zodResolver(engagementAnalyticsSchema),
    defaultValues: {
      id: creatorId,
      startDate: subDays(new Date(), 30).toISOString(),
      endDate: new Date().toISOString(),
      granularity: 'day' as const,
      compareWithPrevious: false,
    },
  });

  return form;
}
```

---

## Error Handling Patterns

### Global Error Boundary

```tsx
'use client';

import { TRPCClientError } from '@trpc/client';

export function ErrorDisplay({ error }: { error: any }) {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code;

    switch (code) {
      case 'UNAUTHORIZED':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
            <p className="mb-4">You must be logged in to view analytics.</p>
            <button onClick={() => router.push('/login')}>Go to Login</button>
          </div>
        );

      case 'FORBIDDEN':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p>You don't have permission to view this creator's analytics.</p>
          </div>
        );

      case 'NOT_FOUND':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Creator Not Found</h2>
            <p className="mb-4">The creator profile you're looking for doesn't exist.</p>
            <button onClick={() => router.push('/dashboard')}>Go to Dashboard</button>
          </div>
        );

      case 'TOO_MANY_REQUESTS':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Too Many Requests</h2>
            <p>You've exceeded the rate limit. Please try again in a moment.</p>
          </div>
        );

      default:
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Something Went Wrong</h2>
            <p className="mb-4">{error.message}</p>
            <button onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        );
    }
  }

  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold mb-4">Unexpected Error</h2>
      <p>An unexpected error occurred. Please try again later.</p>
    </div>
  );
}
```

---

## Chart Integration

### Recharts Example (Time Series)

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export function EngagementChart({ 
  data, 
  granularity 
}: { 
  data: Array<{ timestamp: string; views: number; clicks: number; conversions: number }>;
  granularity: 'hour' | 'day' | 'week' | 'month';
}) {
  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp);
    switch (granularity) {
      case 'hour':
        return format(date, 'HH:mm');
      case 'day':
        return format(date, 'MMM d');
      case 'week':
        return format(date, 'MMM d');
      case 'month':
        return format(date, 'MMM yyyy');
    }
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis}
        />
        <YAxis />
        <Tooltip 
          labelFormatter={formatXAxis}
          formatter={(value: number) => value.toLocaleString()}
        />
        <Legend />
        <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} />
        <Line type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={2} />
        <Line type="monotone" dataKey="conversions" stroke="#f59e0b" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

---

## State Management

### Zustand Store for Analytics

```typescript
import create from 'zustand';
import { persist } from 'zustand/middleware';

interface AnalyticsState {
  selectedCreatorId: string | null;
  dateRange: { start: string; end: string };
  granularity: 'day' | 'week' | 'month';
  setCreatorId: (id: string) => void;
  setDateRange: (range: { start: string; end: string }) => void;
  setGranularity: (granularity: 'day' | 'week' | 'month') => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set) => ({
      selectedCreatorId: null,
      dateRange: {
        start: subDays(new Date(), 30).toISOString(),
        end: new Date().toISOString(),
      },
      granularity: 'day',
      setCreatorId: (id) => set({ selectedCreatorId: id }),
      setDateRange: (range) => set({ dateRange: range }),
      setGranularity: (granularity) => set({ granularity }),
    }),
    {
      name: 'analytics-preferences',
    }
  )
);
```

---

**Document Version:** 1.0  
**Last Updated:** October 17, 2025  
**Maintained By:** Backend Development Team
