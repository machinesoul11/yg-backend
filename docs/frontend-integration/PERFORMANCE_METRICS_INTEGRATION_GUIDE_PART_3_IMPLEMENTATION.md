# Performance Metrics Integration Guide - Part 3: Implementation

**Classification**: ⚡ HYBRID

---

## Table of Contents
- [Quick Start](#quick-start)
- [API Client Setup](#api-client-setup)
- [React Query Integration](#react-query-integration)
- [UI Component Examples](#ui-component-examples)
- [Frontend Implementation Checklist](#frontend-implementation-checklist)
- [Testing Recommendations](#testing-recommendations)
- [Performance Optimization](#performance-optimization)

---

## Quick Start

### Installation

```bash
# Install required dependencies
npm install @tanstack/react-query date-fns
npm install -D @types/node
```

### Environment Variables

Add to your `.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency/api/trpc
NEXT_PUBLIC_API_TIMEOUT=30000
```

---

## API Client Setup

### 1. Create tRPC Client

```typescript
// lib/trpc.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@your-backend/router'; // Import backend router type

const getAuthToken = () => {
  // Get JWT from your auth system
  return localStorage.getItem('auth_token') || '';
};

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency/api/trpc',
      headers() {
        return {
          Authorization: `Bearer ${getAuthToken()}`,
        };
      },
    }),
  ],
});
```

### 2. Create Performance Metrics Service

```typescript
// services/performance-metrics.service.ts
import { trpc } from '@/lib/trpc';
import type {
  LicenseROIMetrics,
  LicenseUtilizationMetrics,
  ApprovalTimeMetrics,
  ConflictRateMetrics,
  AggregatedPerformanceMetrics,
  PerformanceDashboardResponse,
} from '@/types/performance-metrics';

export class PerformanceMetricsService {
  /**
   * Get performance metrics for a single license
   */
  async getLicensePerformanceMetrics(licenseId: string) {
    return await trpc.licenses.getPerformanceMetrics.query({ licenseId });
  }

  /**
   * Get performance dashboard (Admin only)
   */
  async getPerformanceDashboard(period: '7d' | '30d' | '90d' | '1y' = '30d') {
    return await trpc.licenses.getPerformanceDashboard.query({ period });
  }

  /**
   * Get aggregated performance metrics (Admin only)
   */
  async getAggregatedMetrics(
    startDate: string,
    endDate: string,
    granularity: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ) {
    return await trpc.licenses.getAggregatedPerformanceMetrics.query({
      startDate,
      endDate,
      granularity,
    });
  }

  /**
   * Get conflict rate metrics (Admin only)
   */
  async getConflictRateMetrics(startDate: string, endDate: string) {
    return await trpc.licenses.getConflictRateMetrics.query({
      startDate,
      endDate,
    });
  }

  /**
   * Get historical performance metrics (Admin only)
   */
  async getHistoricalMetrics(
    startDate: string,
    endDate: string,
    granularity: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ) {
    return await trpc.licenses.getHistoricalPerformanceMetrics.query({
      startDate,
      endDate,
      granularity,
    });
  }
}

export const performanceMetricsService = new PerformanceMetricsService();
```

---

## React Query Integration

### 1. Setup Query Client

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
    },
  },
});
```

### 2. Create Query Hooks

```typescript
// hooks/use-performance-metrics.ts
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { performanceMetricsService } from '@/services/performance-metrics.service';

/**
 * Hook to fetch license performance metrics
 */
export function useLicensePerformanceMetrics(
  licenseId: string,
  options?: UseQueryOptions
) {
  return useQuery({
    queryKey: ['performance-metrics', licenseId],
    queryFn: () => performanceMetricsService.getLicensePerformanceMetrics(licenseId),
    enabled: !!licenseId,
    ...options,
  });
}

/**
 * Hook to fetch performance dashboard (Admin only)
 */
export function usePerformanceDashboard(
  period: '7d' | '30d' | '90d' | '1y' = '30d',
  options?: UseQueryOptions
) {
  return useQuery({
    queryKey: ['performance-dashboard', period],
    queryFn: () => performanceMetricsService.getPerformanceDashboard(period),
    staleTime: 10 * 60 * 1000, // 10 minutes (dashboard data changes less frequently)
    ...options,
  });
}

/**
 * Hook to fetch aggregated performance metrics (Admin only)
 */
export function useAggregatedPerformanceMetrics(
  startDate: string,
  endDate: string,
  granularity: 'daily' | 'weekly' | 'monthly' = 'monthly',
  options?: UseQueryOptions
) {
  return useQuery({
    queryKey: ['aggregated-performance', startDate, endDate, granularity],
    queryFn: () =>
      performanceMetricsService.getAggregatedMetrics(startDate, endDate, granularity),
    enabled: !!startDate && !!endDate,
    ...options,
  });
}

/**
 * Hook to fetch conflict rate metrics (Admin only)
 */
export function useConflictRateMetrics(
  startDate: string,
  endDate: string,
  options?: UseQueryOptions
) {
  return useQuery({
    queryKey: ['conflict-rate-metrics', startDate, endDate],
    queryFn: () => performanceMetricsService.getConflictRateMetrics(startDate, endDate),
    enabled: !!startDate && !!endDate,
    ...options,
  });
}

/**
 * Hook to fetch historical performance metrics (Admin only)
 */
export function useHistoricalPerformanceMetrics(
  startDate: string,
  endDate: string,
  granularity: 'daily' | 'weekly' | 'monthly' = 'monthly',
  options?: UseQueryOptions
) {
  return useQuery({
    queryKey: ['historical-performance', startDate, endDate, granularity],
    queryFn: () =>
      performanceMetricsService.getHistoricalMetrics(startDate, endDate, granularity),
    enabled: !!startDate && !!endDate,
    ...options,
  });
}
```

---

## UI Component Examples

### 1. License Performance Card

Display performance metrics for a single license on brand/creator dashboard:

```typescript
// components/LicensePerformanceCard.tsx
'use client';

import { useLicensePerformanceMetrics } from '@/hooks/use-performance-metrics';
import { formatCurrency, formatPercentage, getROIStatus } from '@/lib/formatters';
import { TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';

interface LicensePerformanceCardProps {
  licenseId: string;
}

export function LicensePerformanceCard({ licenseId }: LicensePerformanceCardProps) {
  const { data, isLoading, error } = useLicensePerformanceMetrics(licenseId);

  if (isLoading) {
    return <div className="animate-pulse bg-gray-100 h-64 rounded-lg" />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">Failed to load performance metrics</p>
      </div>
    );
  }

  if (!data?.data) {
    return null;
  }

  const { roi, utilization, approval } = data.data;
  const roiStatus = getROIStatus(roi.roiPercentage);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h3 className="text-lg font-semibold">Performance Metrics</h3>

      {/* ROI Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Return on Investment</span>
          <span className={`text-2xl font-bold text-${roiStatus.color}-600`}>
            {formatPercentage(roi.roiPercentage)}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Total Revenue</p>
            <p className="font-semibold">{formatCurrency(roi.totalRevenueCents)}</p>
          </div>
          <div>
            <p className="text-gray-600">Total Cost</p>
            <p className="font-semibold">{formatCurrency(roi.totalCostCents)}</p>
          </div>
        </div>

        {roi.breakEvenDate && (
          <div className="bg-green-50 border border-green-200 rounded p-2 text-sm">
            <p className="text-green-800">
              ✅ Break-even reached in {roi.daysToBreakEven} days
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          {roi.revenueGrowthRate > 0 ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600" />
          )}
          <span className={roi.revenueGrowthRate > 0 ? 'text-green-600' : 'text-red-600'}>
            {formatPercentage(Math.abs(roi.revenueGrowthRate))} revenue growth
          </span>
        </div>
      </div>

      {/* Utilization Section */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Utilization</span>
          <span className="text-2xl font-bold">
            {formatPercentage(utilization.utilizationPercentage)}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${
              utilization.isOverUtilized
                ? 'bg-red-600'
                : utilization.isUnderUtilized
                ? 'bg-orange-500'
                : 'bg-green-600'
            }`}
            style={{ width: `${Math.min(utilization.utilizationPercentage, 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Usage</p>
            <p className="font-semibold">{utilization.actualUsageCount.toLocaleString()}</p>
          </div>
          {utilization.scopeLimitCount && (
            <div>
              <p className="text-gray-600">Limit</p>
              <p className="font-semibold">{utilization.scopeLimitCount.toLocaleString()}</p>
            </div>
          )}
        </div>

        {utilization.isOverUtilized && (
          <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800">
            ⚠️ License is over-utilized. Consider upgrading.
          </div>
        )}

        {utilization.isUnderUtilized && (
          <div className="bg-orange-50 border border-orange-200 rounded p-2 text-sm text-orange-800">
            💡 License is under-utilized. Consider renegotiating terms.
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-gray-500" />
          <span className="text-gray-600">
            Trend: <span className="font-semibold capitalize">{utilization.utilizationTrend}</span>
          </span>
        </div>
      </div>

      {/* Approval Section */}
      {approval.signedAt && (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Approval Time</span>
          </div>
          <p className="text-lg font-semibold">
            {approval.approvalDurationDays} days ({approval.approvalDurationHours} hours)
          </p>
        </div>
      )}
    </div>
  );
}
```

### 2. Performance Dashboard (Admin)

```typescript
// components/admin/PerformanceDashboard.tsx
'use client';

import { useState } from 'react';
import { usePerformanceDashboard } from '@/hooks/use-performance-metrics';
import { formatCurrency, formatPercentage } from '@/lib/formatters';
import { BarChart, LineChart, PieChart } from '@/components/charts'; // Your chart library

type Period = '7d' | '30d' | '90d' | '1y';

export function PerformanceDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data, isLoading, error } = usePerformanceDashboard(period);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!data?.data) {
    return null;
  }

  const dashboard = data.data;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">License Performance Dashboard</h1>
        
        <div className="flex gap-2">
          {(['7d', '30d', '90d', '1y'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p === '1y' ? '1 Year' : p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Revenue */}
        <StatCard
          title="Total Revenue"
          value={formatCurrency(dashboard.revenue.totalRevenueCents)}
          change={dashboard.revenue.revenueGrowthPercent}
          icon="💰"
        />

        {/* Average ROI */}
        <StatCard
          title="Average ROI"
          value={formatPercentage(dashboard.roi.averageROI)}
          icon="📈"
        />

        {/* Conflict Rate */}
        <StatCard
          title="Conflict Rate"
          value={formatPercentage(dashboard.conflicts.conflictRate)}
          trend={dashboard.conflicts.conflictTrend}
          icon="⚠️"
        />

        {/* Renewal Rate */}
        <StatCard
          title="Renewal Rate"
          value={formatPercentage(dashboard.renewals.renewalRate)}
          icon="🔄"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Top Revenue Generators</h3>
          <BarChart
            data={dashboard.revenue.topRevenueGenerators.map((item) => ({
              label: item.brandName,
              value: item.revenueCents / 100,
            }))}
          />
        </div>

        {/* Utilization Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Utilization Distribution</h3>
          <PieChart
            data={[
              { label: 'Over-utilized', value: dashboard.utilization.overUtilizedCount },
              { label: 'Well-utilized', value: dashboard.utilization.wellUtilizedCount },
              { label: 'Under-utilized', value: dashboard.utilization.underUtilizedCount },
            ]}
          />
        </div>
      </div>

      {/* Conflicts Detail */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Conflict Analysis</h3>
        <ConflictAnalysisTable conflicts={dashboard.conflicts.details} />
      </div>

      {/* Top Performers */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Top Performing Licenses</h3>
        <TopPerformersTable licenses={dashboard.roi.topPerformingLicenses} />
      </div>

      {/* Underperformers */}
      {dashboard.roi.underperformingLicenses.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Underperforming Licenses</h3>
          <UnderperformersTable licenses={dashboard.roi.underperformingLicenses} />
        </div>
      )}
    </div>
  );
}

// Helper component for stat cards
function StatCard({ 
  title, 
  value, 
  change, 
  trend, 
  icon 
}: { 
  title: string; 
  value: string; 
  change?: number; 
  trend?: string; 
  icon: string; 
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold mb-2">{value}</p>
      {change !== undefined && (
        <p className={`text-sm ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? '↑' : '↓'} {formatPercentage(Math.abs(change))} from previous period
        </p>
      )}
      {trend && (
        <p className="text-sm text-gray-600">
          Trend: <span className="capitalize">{trend}</span>
        </p>
      )}
    </div>
  );
}
```

### 3. Historical Trend Chart

```typescript
// components/admin/HistoricalTrendChart.tsx
'use client';

import { useState } from 'react';
import { useHistoricalPerformanceMetrics } from '@/hooks/use-performance-metrics';
import { format, subDays, subMonths } from 'date-fns';
import { LineChart } from '@/components/charts';

export function HistoricalTrendChart() {
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  
  // Default to last 12 months
  const endDate = new Date().toISOString();
  const startDate = subMonths(new Date(), 12).toISOString();

  const { data, isLoading } = useHistoricalPerformanceMetrics(
    startDate,
    endDate,
    granularity
  );

  if (isLoading) {
    return <div className="animate-pulse bg-gray-100 h-96 rounded-lg" />;
  }

  if (!data?.data || data.data.length === 0) {
    return <div>No historical data available</div>;
  }

  const chartData = data.data.map((snapshot) => ({
    date: format(new Date(snapshot.date), 'MMM yyyy'),
    revenue: snapshot.revenue.totalRevenueCents / 100,
    avgROI: snapshot.roi.averageROI,
    conflictRate: snapshot.conflicts.conflictRate,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Performance Trends</h3>
        
        <div className="flex gap-2">
          {(['daily', 'weekly', 'monthly'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1 rounded ${
                granularity === g
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <LineChart
        data={chartData}
        xKey="date"
        lines={[
          { key: 'revenue', label: 'Revenue ($)', color: '#10b981' },
          { key: 'avgROI', label: 'Avg ROI (%)', color: '#3b82f6' },
          { key: 'conflictRate', label: 'Conflict Rate (%)', color: '#ef4444' },
        ]}
      />
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Setup & Basic Integration
- [ ] Install required dependencies (`@tanstack/react-query`, `date-fns`)
- [ ] Set up tRPC client with authentication
- [ ] Create TypeScript type definitions file
- [ ] Set up React Query client with proper defaults
- [ ] Create performance metrics service class
- [ ] Create custom React Query hooks

### Phase 2: Brand/Creator Dashboard
- [ ] Build `LicensePerformanceCard` component
- [ ] Add ROI visualization with color coding
- [ ] Add utilization progress bar with thresholds
- [ ] Display approval time metrics
- [ ] Add loading and error states
- [ ] Implement responsive design for mobile
- [ ] Add tooltips for metric explanations

### Phase 3: Admin Dashboard
- [ ] Build admin performance dashboard layout
- [ ] Add period selector (7d, 30d, 90d, 1y)
- [ ] Create summary stat cards
- [ ] Integrate revenue chart (bar/line)
- [ ] Add utilization distribution (pie chart)
- [ ] Build conflict analysis table
- [ ] Display top performers table
- [ ] Display underperformers table with reasons
- [ ] Add export to CSV functionality

### Phase 4: Historical Trends
- [ ] Build historical trend chart component
- [ ] Add granularity selector (daily/weekly/monthly)
- [ ] Implement multi-line chart for trends
- [ ] Add date range picker
- [ ] Enable zoom/pan on charts
- [ ] Add comparison views (YoY, MoM)

### Phase 5: Error Handling & UX
- [ ] Implement global error boundary
- [ ] Add retry logic for failed requests
- [ ] Display user-friendly error messages
- [ ] Handle 403 errors (redirect or show message)
- [ ] Handle 404 errors (license not found)
- [ ] Implement rate limit handling
- [ ] Add loading skeletons
- [ ] Show empty states when no data

### Phase 6: Performance Optimization
- [ ] Implement query caching strategy
- [ ] Add prefetching for likely next queries
- [ ] Lazy load charts and heavy components
- [ ] Optimize re-renders with React.memo
- [ ] Add virtual scrolling for large tables
- [ ] Implement pagination for large datasets

### Phase 7: Testing
- [ ] Unit tests for utility functions
- [ ] Integration tests for API calls
- [ ] Component tests for UI elements
- [ ] E2E tests for critical user flows
- [ ] Test error scenarios
- [ ] Test with mock data
- [ ] Performance testing

---

## Testing Recommendations

### Unit Tests

```typescript
// __tests__/formatters.test.ts
import { formatCurrency, formatPercentage, getROIStatus } from '@/lib/formatters';

describe('formatCurrency', () => {
  it('formats cents to USD currency', () => {
    expect(formatCurrency(500000)).toBe('$5,000.00');
    expect(formatCurrency(99)).toBe('$0.99');
  });
});

describe('formatPercentage', () => {
  it('formats percentage with specified decimals', () => {
    expect(formatPercentage(85.567, 1)).toBe('85.6%');
    expect(formatPercentage(85.567, 2)).toBe('85.57%');
  });
});

describe('getROIStatus', () => {
  it('returns correct status for different ROI values', () => {
    expect(getROIStatus(150).level).toBe('excellent');
    expect(getROIStatus(75).level).toBe('good');
    expect(getROIStatus(25).level).toBe('moderate');
    expect(getROIStatus(-10).level).toBe('poor');
  });
});
```

### Component Tests

```typescript
// __tests__/LicensePerformanceCard.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LicensePerformanceCard } from '@/components/LicensePerformanceCard';

const mockData = {
  data: {
    roi: {
      licenseId: 'test-123',
      totalRevenueCents: 500000,
      totalCostCents: 250000,
      roiPercentage: 100,
      breakEvenDate: new Date('2025-08-15'),
      daysToBreakEven: 45,
      projectedAnnualROI: 150.5,
      revenueGrowthRate: 15.3,
    },
    utilization: {
      licenseId: 'test-123',
      utilizationPercentage: 85.5,
      actualUsageCount: 855,
      scopeLimitCount: 1000,
      remainingCapacity: 145,
      utilizationTrend: 'increasing' as const,
      isOverUtilized: false,
      isUnderUtilized: false,
      usageByType: {},
    },
    approval: {
      licenseId: 'test-123',
      createdAt: new Date('2025-06-01'),
      signedAt: new Date('2025-06-03'),
      approvalDurationHours: 48,
      approvalDurationDays: 2,
      status: 'ACTIVE',
      approvalStage: 'approved' as const,
      bottlenecks: [],
    },
  },
};

describe('LicensePerformanceCard', () => {
  it('displays ROI percentage', () => {
    const queryClient = new QueryClient();
    
    // Mock the query hook
    jest.mock('@/hooks/use-performance-metrics', () => ({
      useLicensePerformanceMetrics: () => ({ data: mockData, isLoading: false }),
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <LicensePerformanceCard licenseId="test-123" />
      </QueryClientProvider>
    );

    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/performance-dashboard.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Performance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@yesgoddess.agency');
    await page.fill('[name="password"]', 'test-password');
    await page.click('button[type="submit"]');
    
    // Navigate to dashboard
    await page.goto('/admin/performance');
  });

  test('should display performance dashboard', async ({ page }) => {
    await expect(page.getByText('License Performance Dashboard')).toBeVisible();
  });

  test('should change period when clicking period buttons', async ({ page }) => {
    await page.click('button:has-text("7D")');
    await expect(page.getByText('7d')).toHaveClass(/bg-blue-600/);
  });

  test('should display metrics cards', async ({ page }) => {
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.getByText('Average ROI')).toBeVisible();
    await expect(page.getByText('Conflict Rate')).toBeVisible();
  });
});
```

---

## Performance Optimization

### 1. Query Caching Strategy

```typescript
// Aggressive caching for dashboard data
export function usePerformanceDashboard(period: Period) {
  return useQuery({
    queryKey: ['performance-dashboard', period],
    queryFn: () => performanceMetricsService.getPerformanceDashboard(period),
    staleTime: 10 * 60 * 1000,     // Fresh for 10 minutes
    cacheTime: 60 * 60 * 1000,     // Keep in cache for 1 hour
    refetchOnWindowFocus: false,   // Don't refetch on focus
    refetchOnReconnect: true,      // Refetch on reconnect
  });
}
```

### 2. Prefetching

```typescript
// Prefetch likely next period when user views dashboard
export function usePrefetchNextPeriod(currentPeriod: Period) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const periods: Period[] = ['7d', '30d', '90d', '1y'];
    const currentIndex = periods.indexOf(currentPeriod);
    const nextPeriod = periods[currentIndex + 1];

    if (nextPeriod) {
      queryClient.prefetchQuery({
        queryKey: ['performance-dashboard', nextPeriod],
        queryFn: () => performanceMetricsService.getPerformanceDashboard(nextPeriod),
      });
    }
  }, [currentPeriod, queryClient]);
}
```

### 3. Memoization

```typescript
// Memoize expensive calculations
export const MemoizedPerformanceCard = React.memo(
  LicensePerformanceCard,
  (prevProps, nextProps) => {
    return prevProps.licenseId === nextProps.licenseId;
  }
);
```

### 4. Lazy Loading

```typescript
// Lazy load heavy chart components
const LineChart = lazy(() => import('@/components/charts/LineChart'));
const BarChart = lazy(() => import('@/components/charts/BarChart'));

export function Dashboard() {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <LineChart data={data} />
    </Suspense>
  );
}
```

---

## Edge Cases to Handle

1. **No Data Available**
   - License has no metrics yet (newly created)
   - Display "Calculating metrics..." message
   - Explain metrics are calculated nightly

2. **Unlimited Scope**
   - When `scopeLimitCount` is `null`
   - Don't show utilization percentage
   - Show absolute usage count instead

3. **Break-Even Not Reached**
   - When `breakEvenDate` is `null`
   - Show "Not yet profitable" message
   - Display days active and current ROI

4. **Zero Revenue**
   - When `totalRevenueCents` is 0
   - Show "No revenue generated yet"
   - Hide ROI calculations (avoid division by zero)

5. **Future Dates**
   - Prevent users from selecting future dates
   - Show validation error if attempted

6. **Large Numbers**
   - Format large numbers with K, M, B suffixes
   - Example: $5,000,000 → $5.0M

---

## UX Considerations

### Loading States
- Show skeleton loaders during data fetch
- Use shimmer effects for better perceived performance
- Display progress indicators for long operations

### Error States
- Show user-friendly error messages
- Provide retry buttons
- Suggest alternative actions

### Empty States
- Display helpful illustrations
- Explain why data might be missing
- Provide next steps or CTAs

### Responsive Design
- Stack cards vertically on mobile
- Make tables horizontally scrollable
- Simplify charts on small screens

### Accessibility
- Add ARIA labels to charts and metrics
- Ensure keyboard navigation works
- Provide text alternatives for visual data
- Use sufficient color contrast

---

## Next Steps

Refer back to:
- **[Part 1: API Endpoints](./PERFORMANCE_METRICS_INTEGRATION_GUIDE_PART_1_API.md)** - Full API reference
- **[Part 2: Business Logic & Validation](./PERFORMANCE_METRICS_INTEGRATION_GUIDE_PART_2_LOGIC.md)** - Metric calculations and rules

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Backend Module**: License Performance Metrics  
**Status**: ✅ Complete & Production Ready
