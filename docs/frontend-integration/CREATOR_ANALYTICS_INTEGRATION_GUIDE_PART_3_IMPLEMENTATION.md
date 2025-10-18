# Creator Analytics & Revenue - Frontend Integration Guide (Part 3: Implementation)

> **Classification: ⚡ HYBRID** - Core functionality used by both admin backend (view all creators) and public-facing website (creators view their own data)

This document provides React Query examples, implementation patterns, and a complete frontend implementation checklist for the Creator Analytics module.

---

## 📋 Table of Contents

1. [React Query Implementation](#react-query-implementation)
2. [API Client Setup](#api-client-setup)
3. [Component Examples](#component-examples)
4. [State Management](#state-management)
5. [Real-time Updates](#real-time-updates)
6. [Testing Considerations](#testing-considerations)
7. [Implementation Checklist](#implementation-checklist)
8. [UX Considerations](#ux-considerations)

---

## 1. React Query Implementation

### 1.1 Setup React Query

**Install Dependencies:**
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

**Configure Query Client:**
```typescript
// lib/react-query.ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      cacheTime: 30 * 60 * 1000,       // 30 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Provider component
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### 1.2 Custom Hooks for Analytics

**Earnings Hook:**
```typescript
// hooks/useCreatorEarnings.ts
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { EarningsQueryParams, EarningsResponse } from '@/types/creator-analytics';
import { fetchEarnings } from '@/api/creator-analytics';

export function useCreatorEarnings(
  params: EarningsQueryParams = {},
  options?: Omit<UseQueryOptions<EarningsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ['creator-earnings', params],
    queryFn: () => fetchEarnings(params),
    ...options,
  });
}

// Usage in component
function EarningsChart() {
  const { data, isLoading, error } = useCreatorEarnings({
    date_from: '2024-01-01',
    date_to: '2024-12-31',
    group_by: 'month',
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  return <Chart data={data.data.breakdown} />;
}
```

**Forecast Hook:**
```typescript
// hooks/useCreatorForecast.ts
import { useQuery } from '@tanstack/react-query';
import { ForecastQueryParams, ForecastResponse } from '@/types/creator-analytics';
import { fetchForecast } from '@/api/creator-analytics';

export function useCreatorForecast(
  params: ForecastQueryParams = {},
  options?: { enabled?: boolean }
) {
  return useQuery<ForecastResponse>({
    queryKey: ['creator-forecast', params],
    queryFn: () => fetchForecast(params),
    staleTime: 60 * 60 * 1000, // 1 hour (forecast is expensive)
    enabled: options?.enabled ?? true,
  });
}

// Usage with conditional fetching
function ForecastCard() {
  const [showForecast, setShowForecast] = useState(false);
  
  const { data, isLoading } = useCreatorForecast(
    { days: '30', confidence_level: 'moderate' },
    { enabled: showForecast } // Only fetch when user requests it
  );

  return (
    <Card>
      <Button onClick={() => setShowForecast(true)}>
        Generate Forecast
      </Button>
      {showForecast && isLoading && <LoadingSpinner />}
      {data?.data.available && <ForecastChart data={data.data.forecast} />}
    </Card>
  );
}
```

**History Hook:**
```typescript
// hooks/useCreatorHistory.ts
import { useQuery } from '@tanstack/react-query';
import { HistoryQueryParams, HistoryResponse } from '@/types/creator-analytics';
import { fetchHistory } from '@/api/creator-analytics';

export function useCreatorHistory(params: HistoryQueryParams = {}) {
  return useQuery<HistoryResponse>({
    queryKey: ['creator-history', params],
    queryFn: () => fetchHistory(params),
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

// Usage with dynamic granularity
function HistoricalDataView() {
  const [granularity, setGranularity] = useState<TimeGranularity>('monthly');
  
  const { data, isLoading, isFetching } = useCreatorHistory({
    from_date: '2023-01-01',
    to_date: new Date().toISOString(),
    granularity,
  });

  return (
    <div>
      <GranularitySelector value={granularity} onChange={setGranularity} />
      {isFetching && <ProgressBar />}
      <HistoryTable data={data?.data.periods} />
    </div>
  );
}
```

**Statements Hook (with Pagination):**
```typescript
// hooks/useCreatorStatements.ts
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { StatementsQueryParams, StatementsResponse } from '@/types/creator-analytics';
import { fetchStatements } from '@/api/creator-analytics';

export function useCreatorStatements(params: StatementsQueryParams = {}) {
  return useQuery<StatementsResponse>({
    queryKey: ['creator-statements', params],
    queryFn: () => fetchStatements(params),
    placeholderData: keepPreviousData, // Keep old data while fetching new page
  });
}

// Usage with pagination
function StatementsTable() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RoyaltyStatementStatus | undefined>();
  
  const { data, isLoading, isFetching } = useCreatorStatements({
    page: page.toString(),
    limit: '20',
    status,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  return (
    <div>
      <StatusFilter value={status} onChange={setStatus} />
      <Table
        data={data?.data.statements}
        loading={isLoading}
        updating={isFetching && !isLoading}
      />
      <Pagination
        current={page}
        total={data?.data.pagination.totalPages || 0}
        onChange={setPage}
      />
    </div>
  );
}
```

### 1.3 Query Key Management

**Centralized Query Keys:**
```typescript
// lib/query-keys.ts
export const creatorAnalyticsKeys = {
  all: ['creator-analytics'] as const,
  earnings: (params?: EarningsQueryParams) => 
    [...creatorAnalyticsKeys.all, 'earnings', params] as const,
  forecast: (params?: ForecastQueryParams) => 
    [...creatorAnalyticsKeys.all, 'forecast', params] as const,
  history: (params?: HistoryQueryParams) => 
    [...creatorAnalyticsKeys.all, 'history', params] as const,
  statements: (params?: StatementsQueryParams) => 
    [...creatorAnalyticsKeys.all, 'statements', params] as const,
};

// Usage in hooks
export function useCreatorEarnings(params: EarningsQueryParams = {}) {
  return useQuery({
    queryKey: creatorAnalyticsKeys.earnings(params),
    queryFn: () => fetchEarnings(params),
  });
}

// Invalidate all earnings queries
queryClient.invalidateQueries({ queryKey: creatorAnalyticsKeys.earnings() });

// Invalidate specific earnings query
queryClient.invalidateQueries({ 
  queryKey: creatorAnalyticsKeys.earnings({ date_from: '2024-01-01' }) 
});
```

### 1.4 Optimistic Updates

**Example: Marking statement as viewed:**
```typescript
// hooks/useMarkStatementViewed.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markStatementAsViewed } from '@/api/creator-analytics';
import { creatorAnalyticsKeys } from '@/lib/query-keys';

export function useMarkStatementViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (statementId: string) => markStatementAsViewed(statementId),
    onMutate: async (statementId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: creatorAnalyticsKeys.statements() 
      });

      // Snapshot previous value
      const previousStatements = queryClient.getQueryData(
        creatorAnalyticsKeys.statements()
      );

      // Optimistically update
      queryClient.setQueryData(
        creatorAnalyticsKeys.statements(),
        (old: StatementsResponse | undefined) => {
          if (!old) return old;
          
          return {
            ...old,
            data: {
              ...old.data,
              statements: old.data.statements.map(stmt =>
                stmt.id === statementId
                  ? { ...stmt, viewed: true }
                  : stmt
              ),
            },
          };
        }
      );

      return { previousStatements };
    },
    onError: (err, statementId, context) => {
      // Rollback on error
      if (context?.previousStatements) {
        queryClient.setQueryData(
          creatorAnalyticsKeys.statements(),
          context.previousStatements
        );
      }
      showToast('error', 'Failed to update statement');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ 
        queryKey: creatorAnalyticsKeys.statements() 
      });
    },
  });
}
```

---

## 2. API Client Setup

### 2.1 Fetch Client with Auth

```typescript
// lib/api-client.ts
import { getSession } from 'next-auth/react';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthToken(): Promise<string | null> {
  const session = await getSession();
  return session?.accessToken || null;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new ApiError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';
  const url = `${baseUrl}${endpoint}`;

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Check rate limiting
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '999');
  if (remaining < 10) {
    console.warn(`Rate limit low: ${remaining} requests remaining`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      success: false,
      error: 'Unknown error',
      message: `HTTP ${response.status}`,
    }));

    throw new ApiError(
      error.message,
      response.status,
      error.error,
      error.details
    );
  }

  return response.json();
}
```

### 2.2 API Functions

```typescript
// api/creator-analytics.ts
import { apiClient } from '@/lib/api-client';
import {
  EarningsQueryParams,
  EarningsResponse,
  ForecastQueryParams,
  ForecastResponse,
  HistoryQueryParams,
  HistoryResponse,
  StatementsQueryParams,
  StatementsResponse,
} from '@/types/creator-analytics';

function buildQueryString(params: Record<string, any>): string {
  const query = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });
  
  return query.toString();
}

export async function fetchEarnings(
  params: EarningsQueryParams
): Promise<EarningsResponse> {
  const queryString = buildQueryString(params);
  return apiClient<EarningsResponse>(
    `/api/me/royalties/earnings?${queryString}`
  );
}

export async function fetchForecast(
  params: ForecastQueryParams
): Promise<ForecastResponse> {
  const queryString = buildQueryString(params);
  return apiClient<ForecastResponse>(
    `/api/me/royalties/forecast?${queryString}`
  );
}

export async function fetchHistory(
  params: HistoryQueryParams
): Promise<HistoryResponse> {
  const queryString = buildQueryString(params);
  return apiClient<HistoryResponse>(
    `/api/me/royalties/history?${queryString}`
  );
}

export async function fetchStatements(
  params: StatementsQueryParams
): Promise<StatementsResponse> {
  const queryString = buildQueryString(params);
  return apiClient<StatementsResponse>(
    `/api/me/royalties/statements?${queryString}`
  );
}
```

---

## 3. Component Examples

### 3.1 Earnings Summary Card

```typescript
// components/EarningsSummaryCard.tsx
import { useCreatorEarnings } from '@/hooks/useCreatorEarnings';
import { formatCurrency } from '@/lib/utils';

export function EarningsSummaryCard() {
  const { data, isLoading, error } = useCreatorEarnings({
    date_from: getStartOfYear(),
    date_to: new Date().toISOString(),
    group_by: 'month',
  });

  if (isLoading) {
    return <CardSkeleton />;
  }

  if (error) {
    return <ErrorCard error={error} />;
  }

  if (!data) return null;

  const { summary, growth } = data.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Earnings Overview</CardTitle>
        <CardDescription>Year to date</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric
            label="Total Earnings"
            value={formatCurrency(summary.totalEarningsCents)}
            icon="dollar-sign"
          />
          <Metric
            label="Paid"
            value={formatCurrency(summary.totalPaidCents)}
            icon="check-circle"
            color="green"
          />
          <Metric
            label="Pending"
            value={formatCurrency(summary.totalPendingCents)}
            icon="clock"
            color="yellow"
          />
          <Metric
            label="Growth"
            value={`${growth.growthRate.toFixed(1)}%`}
            icon={growth.trend === 'up' ? 'trending-up' : 'trending-down'}
            color={growth.trend === 'up' ? 'green' : 'red'}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3.2 Earnings Chart

```typescript
// components/EarningsChart.tsx
import { useCreatorEarnings } from '@/hooks/useCreatorEarnings';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface EarningsChartProps {
  dateFrom?: string;
  dateTo?: string;
  granularity?: TimeGranularity;
}

export function EarningsChart({ dateFrom, dateTo, granularity = 'month' }: EarningsChartProps) {
  const { data, isLoading } = useCreatorEarnings({
    date_from: dateFrom,
    date_to: dateTo,
    group_by: granularity,
  });

  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.data.breakdown.length === 0) {
    return (
      <EmptyState
        icon="chart-line"
        title="No earnings data"
        description="Earnings data will appear here once you receive your first royalty payment."
      />
    );
  }

  const chartData = data.data.breakdown.map(period => ({
    period: formatPeriod(period.period, granularity),
    earnings: period.earnings / 100, // Convert to dollars
    paid: period.paid / 100,
    pending: period.pending / 100,
  }));

  return (
    <div className="w-full h-96">
      <LineChart data={chartData} width={800} height={400}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="period" />
        <YAxis 
          tickFormatter={(value) => `$${value.toFixed(0)}`}
        />
        <Tooltip 
          formatter={(value: number) => `$${value.toFixed(2)}`}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="earnings" 
          stroke="#8884d8" 
          name="Total Earnings"
        />
        <Line 
          type="monotone" 
          dataKey="paid" 
          stroke="#82ca9d" 
          name="Paid"
        />
        <Line 
          type="monotone" 
          dataKey="pending" 
          stroke="#ffc658" 
          name="Pending"
        />
      </LineChart>
    </div>
  );
}
```

### 3.3 Forecast Display

```typescript
// components/ForecastCard.tsx
import { useState } from 'react';
import { useCreatorForecast } from '@/hooks/useCreatorForecast';
import { formatCurrency } from '@/lib/utils';

export function ForecastCard() {
  const [days, setDays] = useState(30);
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>('moderate');
  const [showForecast, setShowForecast] = useState(false);

  const { data, isLoading, refetch } = useCreatorForecast(
    { 
      days: days.toString(), 
      confidence_level: confidenceLevel 
    },
    { enabled: showForecast }
  );

  const handleGenerate = () => {
    setShowForecast(true);
    refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Earnings Forecast</CardTitle>
        <CardDescription>
          Project your future earnings based on historical data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-4">
            <Select value={days.toString()} onChange={(e) => setDays(parseInt(e.target.value))}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </Select>
            <Select value={confidenceLevel} onChange={(e) => setConfidenceLevel(e.target.value as ConfidenceLevel)}>
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="optimistic">Optimistic</option>
            </Select>
            <Button onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? 'Generating...' : 'Generate Forecast'}
            </Button>
          </div>

          {data && !data.data.available && (
            <Alert variant="info">
              <AlertTitle>Insufficient Data</AlertTitle>
              <AlertDescription>{data.data.message}</AlertDescription>
            </Alert>
          )}

          {data?.data.available && data.data.forecast && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold">
                  {formatCurrency(data.data.forecast.projectedEarningsCents)}
                </div>
                <div className="text-sm text-gray-500">
                  Projected earnings for next {days} days
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Conservative</div>
                  <div className="text-xl font-semibold">
                    {formatCurrency(data.data.forecast.range.lowCents)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Optimistic</div>
                  <div className="text-xl font-semibold">
                    {formatCurrency(data.data.forecast.range.highCents)}
                  </div>
                </div>
              </div>

              {data.data.insights && data.data.insights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Insights</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {data.data.insights.map((insight, idx) => (
                      <li key={idx} className="text-sm text-gray-600">
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3.4 Top Assets List

```typescript
// components/TopAssetsList.tsx
import { useCreatorEarnings } from '@/hooks/useCreatorEarnings';
import { formatCurrency } from '@/lib/utils';

export function TopAssetsList() {
  const { data, isLoading } = useCreatorEarnings({
    date_from: getStartOfYear(),
    date_to: new Date().toISOString(),
  });

  if (isLoading) {
    return <ListSkeleton count={5} />;
  }

  if (!data || data.data.topAssets.length === 0) {
    return (
      <EmptyState
        icon="image"
        title="No asset data"
        description="Asset earnings will appear once you have licensed content."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Earning Assets</CardTitle>
        <CardDescription>Your highest performing content</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.data.topAssets.map((asset, index) => (
            <div 
              key={asset.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-gray-400">
                  #{index + 1}
                </div>
                <div>
                  <div className="font-semibold">{asset.title}</div>
                  <div className="text-sm text-gray-500">
                    {asset.licenseCount} {asset.licenseCount === 1 ? 'license' : 'licenses'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">
                  {formatCurrency(asset.totalEarningsCents)}
                </div>
                <Badge variant="secondary">{asset.type}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3.5 Statements Table with Pagination

```typescript
// components/StatementsTable.tsx
import { useState } from 'react';
import { useCreatorStatements } from '@/hooks/useCreatorStatements';
import { formatCurrency, formatDate } from '@/lib/utils';

export function StatementsTable() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RoyaltyStatementStatus | undefined>();

  const { data, isLoading, isFetching } = useCreatorStatements({
    page: page.toString(),
    limit: '20',
    status,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  if (isLoading) {
    return <TableSkeleton rows={5} />;
  }

  if (!data || data.data.statements.length === 0) {
    return (
      <EmptyState
        icon="file-text"
        title="No statements"
        description="Your royalty statements will appear here."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Royalty Statements</CardTitle>
          <Select 
            value={status || 'all'} 
            onChange={(e) => {
              setStatus(e.target.value === 'all' ? undefined : e.target.value as RoyaltyStatementStatus);
              setPage(1); // Reset to page 1 when filtering
            }}
          >
            <option value="all">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="PAID">Paid</option>
            <option value="DISPUTED">Disputed</option>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.statements.map((statement) => (
              <TableRow key={statement.id} className={isFetching ? 'opacity-50' : ''}>
                <TableCell>
                  {formatDate(statement.royaltyRun.periodStart)} -{' '}
                  {formatDate(statement.royaltyRun.periodEnd)}
                </TableCell>
                <TableCell className="font-semibold">
                  {formatCurrency(statement.totalEarningsCents)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={statement.status} />
                </TableCell>
                <TableCell>
                  {statement.paidAt ? formatDate(statement.paidAt) : '-'}
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => router.push(`/statements/${statement.id}`)}
                  >
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Pagination
          currentPage={page}
          totalPages={data.data.pagination.totalPages}
          onPageChange={setPage}
          hasMore={data.data.pagination.hasMore}
        />
      </CardContent>
    </Card>
  );
}
```

---

## 4. State Management

### 4.1 Date Range State

```typescript
// hooks/useDateRangeState.ts
import { useState, useMemo } from 'react';
import { format, subMonths, startOfYear, endOfYear } from 'date-fns';

export function useDateRangeState(defaultRange: 'month' | 'year' | 'all' = 'year') {
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    if (defaultRange === 'month') return subMonths(new Date(), 1);
    if (defaultRange === 'year') return startOfYear(new Date());
    return subMonths(new Date(), 24); // 2 years for 'all'
  });

  const [dateTo, setDateTo] = useState<Date>(new Date());

  const formattedDates = useMemo(() => ({
    from: format(dateFrom, 'yyyy-MM-dd'),
    to: format(dateTo, 'yyyy-MM-dd'),
  }), [dateFrom, dateTo]);

  const setPreset = (preset: 'week' | 'month' | 'quarter' | 'year' | 'ytd') => {
    const today = new Date();
    const presets = {
      week: subMonths(today, 0.25),
      month: subMonths(today, 1),
      quarter: subMonths(today, 3),
      year: subMonths(today, 12),
      ytd: startOfYear(today),
    };
    
    setDateFrom(presets[preset]);
    setDateTo(today);
  };

  return {
    dateFrom,
    dateTo,
    formattedDates,
    setDateFrom,
    setDateTo,
    setPreset,
  };
}

// Usage
function EarningsView() {
  const { formattedDates, setPreset } = useDateRangeState('year');
  
  const { data } = useCreatorEarnings({
    date_from: formattedDates.from,
    date_to: formattedDates.to,
    group_by: 'month',
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button onClick={() => setPreset('month')}>Last Month</Button>
        <Button onClick={() => setPreset('quarter')}>Last Quarter</Button>
        <Button onClick={() => setPreset('year')}>Last Year</Button>
        <Button onClick={() => setPreset('ytd')}>Year to Date</Button>
      </div>
      <EarningsChart data={data} />
    </div>
  );
}
```

### 4.2 Filter State Management

```typescript
// hooks/useTableFilters.ts
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export function useTableFilters<T extends Record<string, any>>(
  initialFilters: T,
  syncToUrl = true
) {
  const router = useRouter();
  const [filters, setFilters] = useState<T>(initialFilters);

  const updateFilter = useCallback(<K extends keyof T>(
    key: K,
    value: T[K]
  ) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      
      if (syncToUrl) {
        const params = new URLSearchParams();
        Object.entries(newFilters).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            params.set(k, String(v));
          }
        });
        router.push(`?${params.toString()}`, { scroll: false });
      }
      
      return newFilters;
    });
  }, [router, syncToUrl]);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    if (syncToUrl) {
      router.push('?', { scroll: false });
    }
  }, [initialFilters, router, syncToUrl]);

  return { filters, updateFilter, resetFilters };
}

// Usage
function StatementsPage() {
  const { filters, updateFilter, resetFilters } = useTableFilters({
    page: 1,
    status: undefined as RoyaltyStatementStatus | undefined,
    sortBy: 'createdAt' as const,
  });

  const { data } = useCreatorStatements(filters);

  return (
    <div>
      <Filters
        status={filters.status}
        onStatusChange={(status) => updateFilter('status', status)}
        onReset={resetFilters}
      />
      <StatementsTable data={data} />
    </div>
  );
}
```

---

## 5. Real-time Updates

### 5.1 Polling Strategy

```typescript
// hooks/useCreatorEarnings.ts (with polling)
export function useCreatorEarningsWithPolling(
  params: EarningsQueryParams = {},
  enablePolling = false
) {
  return useQuery({
    queryKey: creatorAnalyticsKeys.earnings(params),
    queryFn: () => fetchEarnings(params),
    refetchInterval: enablePolling ? 60000 : false, // Poll every 60s if enabled
    refetchIntervalInBackground: false,
  });
}

// Usage
function LiveEarningsCard() {
  const [isLive, setIsLive] = useState(false);
  
  const { data } = useCreatorEarningsWithPolling({}, isLive);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Earnings</CardTitle>
          <Switch 
            checked={isLive}
            onChange={setIsLive}
            label="Live Updates"
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Display earnings */}
      </CardContent>
    </Card>
  );
}
```

### 5.2 WebSocket Integration (Future Enhancement)

```typescript
// hooks/useRealtimeEarnings.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { creatorAnalyticsKeys } from '@/lib/query-keys';

export function useRealtimeEarnings() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // WebSocket connection (when implemented)
    const ws = new WebSocket('wss://ops.yesgoddess.agency/ws/earnings');

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      
      if (update.type === 'NEW_STATEMENT') {
        // Invalidate queries to refetch
        queryClient.invalidateQueries({ 
          queryKey: creatorAnalyticsKeys.earnings() 
        });
        queryClient.invalidateQueries({ 
          queryKey: creatorAnalyticsKeys.statements() 
        });
        
        // Show notification
        showToast('info', 'New royalty statement available');
      }
    };

    return () => ws.close();
  }, [queryClient]);
}
```

---

## 6. Testing Considerations

### 6.1 Mock Data Setup

```typescript
// test/mocks/creator-analytics.ts
import { EarningsResponse, ForecastResponse } from '@/types/creator-analytics';

export const mockEarningsResponse: EarningsResponse = {
  success: true,
  data: {
    summary: {
      totalEarningsCents: 450000,
      totalPaidCents: 350000,
      totalPendingCents: 100000,
      avgEarningsPerPeriodCents: 37500,
      highestEarningPeriod: {
        period: '2024-06',
        earningsCents: 75000,
      },
      statementCount: 12,
    },
    breakdown: [
      { period: '2024-01', earnings: 35000, paid: 35000, pending: 0 },
      { period: '2024-02', earnings: 42000, paid: 42000, pending: 0 },
    ],
    topAssets: [
      {
        id: 'asset_1',
        title: 'Fashion Collection',
        type: 'IMAGE',
        totalEarningsCents: 125000,
        licenseCount: 15,
      },
    ],
    growth: {
      currentPeriodCents: 42000,
      previousPeriodCents: 35000,
      growthRate: 20.0,
      trend: 'up',
    },
    period: {
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-12-31T23:59:59.999Z',
      groupBy: 'month',
    },
  },
};

export const mockForecastResponse: ForecastResponse = {
  success: true,
  data: {
    available: true,
    forecast: {
      periodDays: 30,
      projectedEarningsCents: 45000,
      confidenceLevel: 'moderate',
      range: {
        lowCents: 35000,
        highCents: 55000,
      },
    },
    methodology: {
      approach: 'Moving Average with Linear Trend',
      historicalPeriodMonths: 12,
      dataPointsUsed: 12,
      confidenceNote: 'Moderate forecast based on historical average with linear trend adjustment.',
    },
    comparison: {
      recentAvgMonthlyEarningsCents: 42000,
      projectedVsRecentDiff: 3000,
      projectedVsRecentPct: 7,
    },
    insights: ['Your earnings show positive growth trend.'],
  },
};
```

### 6.2 Component Testing

```typescript
// components/__tests__/EarningsSummaryCard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EarningsSummaryCard } from '../EarningsSummaryCard';
import { mockEarningsResponse } from '@/test/mocks/creator-analytics';

// Mock API
jest.mock('@/api/creator-analytics', () => ({
  fetchEarnings: jest.fn(() => Promise.resolve(mockEarningsResponse)),
}));

describe('EarningsSummaryCard', () => {
  it('displays earnings summary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EarningsSummaryCard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('$4,500.00')).toBeInTheDocument();
      expect(screen.getByText('$3,500.00')).toBeInTheDocument();
      expect(screen.getByText('$1,000.00')).toBeInTheDocument();
      expect(screen.getByText('20.0%')).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    const queryClient = new QueryClient();
    
    render(
      <QueryClientProvider client={queryClient}>
        <EarningsSummaryCard />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });
});
```

---

## 7. Implementation Checklist

### Phase 1: Core Setup ✅
- [ ] Install React Query and configure query client
- [ ] Set up API client with authentication
- [ ] Create TypeScript type definitions
- [ ] Implement error handling utilities
- [ ] Set up rate limiting monitoring

### Phase 2: Data Fetching ✅
- [ ] Create custom hooks for each endpoint
  - [ ] `useCreatorEarnings`
  - [ ] `useCreatorForecast`
  - [ ] `useCreatorHistory`
  - [ ] `useCreatorStatements`
- [ ] Implement query key management
- [ ] Add loading and error states
- [ ] Configure caching strategies

### Phase 3: UI Components ✅
- [ ] Build earnings summary card
- [ ] Create earnings chart component
- [ ] Implement forecast display
- [ ] Build top assets list
- [ ] Create statements table with pagination
- [ ] Add date range picker
- [ ] Implement filter controls

### Phase 4: State Management ✅
- [ ] Implement date range state hook
- [ ] Create filter state management
- [ ] Add URL sync for filters
- [ ] Implement preset date ranges

### Phase 5: Error Handling ✅
- [ ] Handle authentication errors (401)
- [ ] Handle not found errors (404)
- [ ] Handle rate limiting (429)
- [ ] Handle validation errors (400)
- [ ] Implement error toast notifications
- [ ] Add error boundary for components

### Phase 6: Performance ✅
- [ ] Implement query caching
- [ ] Add pagination for large data sets
- [ ] Optimize re-renders
- [ ] Add loading skeletons
- [ ] Implement debouncing for filters

### Phase 7: Testing ✅
- [ ] Write unit tests for hooks
- [ ] Test component rendering
- [ ] Test error scenarios
- [ ] Test loading states
- [ ] Test pagination
- [ ] Test filtering

### Phase 8: Polish ✅
- [ ] Add empty states
- [ ] Implement accessibility features
- [ ] Add keyboard navigation
- [ ] Optimize mobile responsiveness
- [ ] Add animations and transitions
- [ ] Implement print styles (for statements)

---

## 8. UX Considerations

### 8.1 Loading States

**Best Practices:**
- Show skeleton loaders for initial load
- Show subtle progress indicators for subsequent loads
- Disable interactive elements during mutations
- Provide optimistic updates where appropriate

```typescript
function EarningsCard() {
  const { data, isLoading, isFetching } = useCreatorEarnings();

  if (isLoading) {
    return <CardSkeleton />; // Full skeleton on initial load
  }

  return (
    <Card className={isFetching ? 'opacity-70' : ''}>
      {isFetching && <ProgressBar />}
      {/* Card content */}
    </Card>
  );
}
```

### 8.2 Empty States

**Guidelines:**
- Always provide clear messaging
- Offer actionable next steps when possible
- Use appropriate icons
- Link to help documentation

```typescript
<EmptyState
  icon="chart-line"
  title="No earnings data yet"
  description="You haven't received any royalty statements. Check back after your first earnings period."
  action={{
    label: "Learn about earnings",
    href: "/help/earnings"
  }}
/>
```

### 8.3 Error Messages

**User-Friendly Error Messages:**

| Error Type | Technical Message | User-Friendly Message |
|-----------|------------------|----------------------|
| 401 | "Unauthorized" | "Your session has expired. Please log in again." |
| 404 | "Creator profile not found" | "You need to create a creator profile to access analytics." |
| 429 | "Rate limit exceeded" | "You're making requests too quickly. Please wait a moment." |
| 500 | "Internal server error" | "Something went wrong on our end. Please try again later." |

### 8.4 Data Visualization

**Chart Guidelines:**
- Use consistent color schemes
- Show currency with proper formatting
- Include legends and axis labels
- Make charts responsive
- Support dark mode
- Add tooltips for details

### 8.5 Mobile Responsiveness

**Considerations:**
- Stack cards vertically on mobile
- Use horizontal scrolling for tables
- Simplify charts for small screens
- Make touch targets large enough (min 44x44px)
- Use bottom sheets for filters

### 8.6 Accessibility

**WCAG 2.1 Compliance:**
- Proper heading hierarchy
- Color contrast ratio ≥ 4.5:1
- Keyboard navigation support
- Screen reader labels
- Focus indicators
- Skip to content links

```typescript
<Card role="region" aria-labelledby="earnings-title">
  <CardTitle id="earnings-title">Earnings Summary</CardTitle>
  {/* Content */}
</Card>
```

### 8.7 Performance Tips

**Optimization Strategies:**
- Virtualize long lists (use `react-window`)
- Lazy load chart libraries
- Debounce filter inputs (300ms)
- Use `React.memo` for expensive components
- Implement code splitting
- Monitor bundle size

---

## Quick Reference

### Common Use Cases

**Display earnings for current year:**
```typescript
const { data } = useCreatorEarnings({
  date_from: new Date(new Date().getFullYear(), 0, 1).toISOString(),
  date_to: new Date().toISOString(),
  group_by: 'month',
});
```

**Show 30-day forecast:**
```typescript
const { data } = useCreatorForecast({
  days: '30',
  confidence_level: 'moderate',
});
```

**Paginate statements:**
```typescript
const [page, setPage] = useState(1);
const { data } = useCreatorStatements({
  page: page.toString(),
  limit: '20',
});
```

---

## Support Resources

- **API Documentation:** [Part 1: API Reference](./CREATOR_ANALYTICS_INTEGRATION_GUIDE_PART_1_API_REFERENCE.md)
- **Business Logic:** [Part 2: Business Logic](./CREATOR_ANALYTICS_INTEGRATION_GUIDE_PART_2_BUSINESS_LOGIC.md)
- **React Query Docs:** https://tanstack.com/query/latest
- **Backend Team:** Contact for API clarification

**Last Updated:** October 17, 2025
