# Analytics & Metrics Aggregation - Frontend Integration Guide (Part 3: Implementation)

## Classification: 🔒 ADMIN ONLY / ⚡ HYBRID

**Last Updated:** October 17, 2025  
**API Version:** 1.0  
**Module:** Analytics Data Collection & Metrics Aggregation

---

## Table of Contents

1. [Error Handling](#error-handling)
2. [Frontend Implementation Examples](#frontend-implementation-examples)
3. [React Components](#react-components)
4. [React Query Integration](#react-query-integration)
5. [Testing Strategy](#testing-strategy)
6. [Performance Optimization](#performance-optimization)
7. [Implementation Checklist](#implementation-checklist)

---

## Error Handling

### Error Response Format

All tRPC endpoints return errors in a consistent format:

```typescript
interface TRPCError {
  code: string;
  message: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    zodError?: {
      fieldErrors: Record<string, string[]>;
    };
  };
}
```

### Error Codes

| HTTP Status | tRPC Code | Description | User Message |
|------------|-----------|-------------|--------------|
| 400 | `BAD_REQUEST` | Invalid input data | "Please check your input and try again" |
| 401 | `UNAUTHORIZED` | Not authenticated | "Please sign in to continue" |
| 403 | `FORBIDDEN` | Insufficient permissions | "You don't have permission to access this resource" |
| 404 | `NOT_FOUND` | Resource not found | "The requested resource was not found" |
| 409 | `CONFLICT` | Duplicate or conflicting data | "This operation conflicts with existing data" |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded | "Too many requests. Please try again later" |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | "Something went wrong. Please try again" |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable | "Service temporarily unavailable. Please try again later" |

### Common Error Scenarios

#### 1. Validation Errors

```typescript
try {
  await trpc.analytics.eventIngestion.track.mutate({
    eventType: 'asset_viewed',
    entityId: 'invalid-id', // Invalid CUID
  });
} catch (error) {
  if (error.data?.code === 'BAD_REQUEST') {
    // Zod validation error
    const fieldErrors = error.data.zodError?.fieldErrors;
    console.error('Validation errors:', fieldErrors);
    
    // Show user-friendly message
    toast.error('Invalid event data. Please check your input.');
  }
}
```

#### 2. Authorization Errors

```typescript
try {
  const dashboard = await trpc.analytics.dashboard.getCreatorDashboard.query({
    creatorId: 'clx123other_creator', // Not the current user's creator
    period: '30d',
  });
} catch (error) {
  if (error.data?.code === 'FORBIDDEN') {
    // User trying to access another creator's dashboard
    toast.error('You can only view your own dashboard');
    router.push('/dashboard'); // Redirect to own dashboard
  }
}
```

#### 3. Rate Limiting

```typescript
try {
  // Batch event tracking
  await trpc.analytics.eventIngestion.trackBatch.mutate({ events });
} catch (error) {
  if (error.data?.code === 'TOO_MANY_REQUESTS') {
    // Rate limit exceeded
    const retryAfter = error.data?.retryAfter || 60; // seconds
    
    toast.error(`Too many requests. Please try again in ${retryAfter} seconds`);
    
    // Optionally queue events for retry
    queueEventsForRetry(events, retryAfter);
  }
}
```

#### 4. Network Errors

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const metrics = await trpc.analytics.dashboard.getPlatformMetrics.query({
    period: '30d',
  });
} catch (error) {
  if (error instanceof TRPCClientError) {
    // Network or connection error
    toast.error('Connection error. Please check your internet connection.');
    
    // Optionally retry
    setTimeout(() => {
      // Retry logic
    }, 5000);
  }
}
```

### Error Handling Utility

```typescript
/**
 * Centralized error handler for analytics API errors
 */
export const handleAnalyticsError = (
  error: any,
  options?: {
    onValidationError?: (errors: Record<string, string[]>) => void;
    onAuthError?: () => void;
    onRateLimit?: (retryAfter: number) => void;
    fallbackMessage?: string;
  }
) => {
  const code = error.data?.code;
  
  switch (code) {
    case 'BAD_REQUEST':
      const fieldErrors = error.data?.zodError?.fieldErrors;
      if (options?.onValidationError && fieldErrors) {
        options.onValidationError(fieldErrors);
      } else {
        toast.error('Invalid input. Please check your data.');
      }
      break;
      
    case 'UNAUTHORIZED':
      toast.error('Please sign in to continue');
      if (options?.onAuthError) {
        options.onAuthError();
      } else {
        window.location.href = '/login';
      }
      break;
      
    case 'FORBIDDEN':
      toast.error('You don\'t have permission to perform this action');
      break;
      
    case 'TOO_MANY_REQUESTS':
      const retryAfter = error.data?.retryAfter || 60;
      if (options?.onRateLimit) {
        options.onRateLimit(retryAfter);
      }
      toast.error(`Too many requests. Please wait ${retryAfter} seconds.`);
      break;
      
    case 'NOT_FOUND':
      toast.error('Resource not found');
      break;
      
    case 'INTERNAL_SERVER_ERROR':
    default:
      toast.error(options?.fallbackMessage || 'Something went wrong. Please try again.');
      console.error('Analytics API error:', error);
      break;
  }
};
```

---

## Frontend Implementation Examples

### Event Tracking Implementation

#### Basic Page View Tracking

```typescript
'use client';

import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { generateSessionId } from '@/lib/analytics-utils';

export function usePageViewTracking() {
  const trackEvent = trpc.analytics.eventIngestion.track.useMutation();
  
  useEffect(() => {
    // Get or create session ID
    const sessionId = generateSessionId();
    
    // Track page view
    trackEvent.mutate({
      eventType: 'page_view',
      source: 'web',
      sessionId,
      props: {
        pathname: window.location.pathname,
        referrer: document.referrer,
      },
    });
  }, []);
}

// Usage in a page component
export default function AssetDetailPage({ assetId }: { assetId: string }) {
  usePageViewTracking();
  
  return <div>{/* Page content */}</div>;
}
```

#### Asset View Tracking with Attribution

```typescript
'use client';

import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { getAttributionData, generateSessionId } from '@/lib/analytics-utils';

interface AssetViewTrackerProps {
  assetId: string;
  assetTitle: string;
}

export function AssetViewTracker({ assetId, assetTitle }: AssetViewTrackerProps) {
  const trackEvent = trpc.analytics.eventIngestion.track.useMutation();
  
  useEffect(() => {
    const sessionId = generateSessionId();
    const attribution = getAttributionData();
    
    trackEvent.mutate({
      eventType: 'asset_viewed',
      source: 'web',
      entityId: assetId,
      entityType: 'ASSET',
      sessionId,
      attribution,
      props: {
        assetTitle,
        viewedAt: new Date().toISOString(),
      },
    });
  }, [assetId]);
  
  return null; // This is a tracking component, no UI
}

// Utility functions
export const generateSessionId = (): string => {
  // Check if session ID exists in sessionStorage
  let sessionId = sessionStorage.getItem('analytics_session_id');
  
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  
  return sessionId;
};

export const getAttributionData = () => {
  const params = new URLSearchParams(window.location.search);
  
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmTerm: params.get('utm_term') || undefined,
    utmContent: params.get('utm_content') || undefined,
    referrer: document.referrer || undefined,
    landingPage: window.location.href,
  };
};
```

#### Button Click Tracking

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { generateSessionId } from '@/lib/analytics-utils';

interface TrackableButtonProps {
  eventType: string;
  entityId?: string;
  entityType?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function TrackableButton({
  eventType,
  entityId,
  entityType,
  onClick,
  children,
  className,
}: TrackableButtonProps) {
  const trackEvent = trpc.analytics.eventIngestion.track.useMutation();
  
  const handleClick = () => {
    // Track the click event
    trackEvent.mutate({
      eventType,
      source: 'web',
      entityId,
      entityType,
      sessionId: generateSessionId(),
      props: {
        clickedAt: new Date().toISOString(),
        buttonText: typeof children === 'string' ? children : 'Button',
      },
    });
    
    // Execute original onClick handler
    onClick?.();
  };
  
  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}

// Usage
<TrackableButton
  eventType="license_clicked"
  entityId={assetId}
  entityType="ASSET"
  onClick={() => router.push(`/license/${assetId}`)}
  className="btn-primary"
>
  Get License
</TrackableButton>
```

#### Batch Event Tracking (Offline Support)

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

interface QueuedEvent {
  eventType: string;
  entityId?: string;
  entityType?: string;
  props?: Record<string, any>;
  timestamp: number;
}

export function useOfflineEventTracking() {
  const queueRef = useRef<QueuedEvent[]>([]);
  const trackBatch = trpc.analytics.eventIngestion.trackBatch.useMutation();
  
  // Load queued events from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('analytics_event_queue');
    if (stored) {
      queueRef.current = JSON.parse(stored);
    }
  }, []);
  
  // Flush queue when online
  useEffect(() => {
    const flushQueue = async () => {
      if (queueRef.current.length === 0) return;
      
      const sessionId = generateSessionId();
      
      try {
        await trackBatch.mutateAsync({
          events: queueRef.current.map((event) => ({
            ...event,
            sessionId,
            source: 'web' as const,
          })),
        });
        
        // Clear queue on success
        queueRef.current = [];
        localStorage.removeItem('analytics_event_queue');
      } catch (error) {
        console.error('Failed to flush event queue:', error);
      }
    };
    
    // Flush on online event
    window.addEventListener('online', flushQueue);
    
    // Flush periodically if online
    const interval = setInterval(() => {
      if (navigator.onLine) {
        flushQueue();
      }
    }, 30000); // Every 30 seconds
    
    return () => {
      window.removeEventListener('online', flushQueue);
      clearInterval(interval);
    };
  }, []);
  
  const queueEvent = (event: Omit<QueuedEvent, 'timestamp'>) => {
    const queuedEvent = {
      ...event,
      timestamp: Date.now(),
    };
    
    queueRef.current.push(queuedEvent);
    localStorage.setItem('analytics_event_queue', JSON.stringify(queueRef.current));
  };
  
  return { queueEvent };
}
```

---

### Dashboard Implementation

#### Creator Dashboard Component

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, BarChart } from '@/components/charts';

interface CreatorDashboardProps {
  creatorId: string;
}

export function CreatorDashboard({ creatorId }: CreatorDashboardProps) {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  
  const { data, isLoading, error } = trpc.analytics.dashboard.getCreatorDashboard.useQuery(
    { creatorId, period },
    {
      staleTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
    }
  );
  
  if (isLoading) {
    return <DashboardSkeleton />;
  }
  
  if (error) {
    return <DashboardError error={error} />;
  }
  
  if (!data) {
    return <div>No data available</div>;
  }
  
  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-end">
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.summary.totalViews.toLocaleString()}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Total Licenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.summary.totalLicenses}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatCurrency(data.summary.totalRevenueCents)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {data.summary.avgConversionRate.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Revenue Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            data={data.revenueTimeline}
            xKey="date"
            yKey="revenueCents"
            formatY={(value) => formatCurrency(value)}
          />
        </CardContent>
      </Card>
      
      {/* Top Assets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <TopAssetsTable assets={data.topAssets} />
        </CardContent>
      </Card>
      
      {/* Traffic Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <TrafficSourcesChart sources={data.trafficSources} />
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Platform Metrics Dashboard (Admin)

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

export function PlatformMetricsDashboard() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  
  // Check admin permission
  if (session?.user?.role !== 'ADMIN') {
    redirect('/dashboard');
  }
  
  const { data, isLoading } = trpc.analytics.dashboard.getPlatformMetrics.useQuery(
    { period },
    {
      staleTime: 60 * 60 * 1000, // 1 hour
      refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    }
  );
  
  if (isLoading) {
    return <PlatformDashboardSkeleton />;
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Platform Analytics</h1>
      
      {/* Period Selector */}
      <PeriodSelector value={period} onChange={setPeriod} />
      
      {/* User Metrics */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">User Metrics</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Total Users"
            value={data.users.total}
            icon={UsersIcon}
          />
          <MetricCard
            label="New Users"
            value={data.users.new}
            icon={UserPlusIcon}
            trend="up"
          />
          <MetricCard
            label="Active Users"
            value={data.users.active}
            icon={ActivityIcon}
          />
        </div>
      </section>
      
      {/* Creator Metrics */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Creator Metrics</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Total Creators"
            value={data.creators.total}
          />
          <MetricCard
            label="Active Creators"
            value={data.creators.active}
          />
          <MetricCard
            label="Avg Revenue/Creator"
            value={formatCurrency(data.creators.avgRevenuePerCreator)}
          />
        </div>
      </section>
      
      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Timeline</CardTitle>
          <div className="text-sm text-gray-500">
            Total: {formatCurrency(data.revenue.totalCents)}
            {' '}
            <span className="text-green-600">
              (+{data.revenue.growth.toFixed(1)}%)
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <LineChart
            data={data.revenue.timeline}
            xKey="date"
            yKey="revenueCents"
            formatY={formatCurrency}
          />
        </CardContent>
      </Card>
      
      {/* Additional sections for brands, assets, licenses */}
    </div>
  );
}
```

---

## React Components

### Reusable Analytics Components

#### MetricCard Component

```typescript
interface MetricCardProps {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down';
  trendValue?: number;
  formatValue?: (value: number) => string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendValue,
  formatValue,
}: MetricCardProps) {
  const displayValue = typeof value === 'number' && formatValue
    ? formatValue(value)
    : value;
    
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold mt-2">{displayValue}</p>
          {trend && trendValue && (
            <p className={`text-sm mt-2 ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? '↑' : '↓'} {Math.abs(trendValue).toFixed(1)}%
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-3 bg-blue-100 rounded-full">
            <Icon className="w-6 h-6 text-blue-600" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### PeriodSelector Component

```typescript
interface PeriodSelectorProps {
  value: string;
  onChange: (period: string) => void;
  options?: Array<{ value: string; label: string }>;
}

export function PeriodSelector({
  value,
  onChange,
  options = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
  ],
}: PeriodSelectorProps) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-4 py-2 rounded-md ${
            value === option.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

#### TopAssetsTable Component

```typescript
import { TopAsset } from '@/types/analytics';
import { formatCurrency } from '@/lib/utils';

interface TopAssetsTableProps {
  assets: TopAsset[];
}

export function TopAssetsTable({ assets }: TopAssetsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Asset
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Views
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Licenses
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Revenue
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Conversion
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {assets.map((asset) => {
            const conversionRate = asset.views > 0
              ? (asset.licenses / asset.views) * 100
              : 0;
              
            return (
              <tr key={asset.assetId} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {asset.assetTitle}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  {asset.views.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  {asset.licenses}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                  {formatCurrency(asset.revenueCents)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  {conversionRate.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

---

## React Query Integration

### Custom Hooks

#### useCreatorDashboard Hook

```typescript
import { trpc } from '@/lib/trpc';
import { useSession } from 'next-auth/react';

export function useCreatorDashboard(period: '7d' | '30d' | '90d' | '1y' | 'all' = '30d') {
  const { data: session } = useSession();
  const creatorId = session?.user?.creator?.id;
  
  return trpc.analytics.dashboard.getCreatorDashboard.useQuery(
    { creatorId: creatorId!, period },
    {
      enabled: !!creatorId,
      staleTime: 10 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      retry: 2,
      onError: (error) => {
        handleAnalyticsError(error);
      },
    }
  );
}

// Usage
function MyDashboard() {
  const { data, isLoading, error, refetch } = useCreatorDashboard('30d');
  
  return (
    <div>
      {isLoading && <Skeleton />}
      {error && <ErrorMessage />}
      {data && <DashboardContent data={data} onRefresh={refetch} />}
    </div>
  );
}
```

#### useEventTracker Hook

```typescript
import { trpc } from '@/lib/trpc';
import { generateSessionId } from '@/lib/analytics-utils';

export function useEventTracker() {
  const trackEvent = trpc.analytics.eventIngestion.track.useMutation();
  
  const track = async (
    eventType: string,
    options?: {
      entityId?: string;
      entityType?: string;
      props?: Record<string, any>;
      attribution?: Attribution;
    }
  ) => {
    try {
      await trackEvent.mutateAsync({
        eventType,
        source: 'web',
        sessionId: generateSessionId(),
        ...options,
      });
    } catch (error) {
      // Silent fail for analytics - don't disrupt user experience
      console.warn('Failed to track event:', eventType, error);
    }
  };
  
  return { track, isTracking: trackEvent.isLoading };
}

// Usage
function AssetCard({ asset }: { asset: Asset }) {
  const { track } = useEventTracker();
  
  const handleClick = () => {
    track('asset_clicked', {
      entityId: asset.id,
      entityType: 'ASSET',
      props: {
        assetTitle: asset.title,
        category: asset.category,
      },
    });
    
    router.push(`/assets/${asset.id}`);
  };
  
  return <div onClick={handleClick}>{/* Asset card content */}</div>;
}
```

### Prefetching & Cache Management

```typescript
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';

export function useDashboardPrefetch() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  
  // Prefetch creator dashboard
  const prefetchCreatorDashboard = async (creatorId: string, period: string) => {
    await utils.analytics.dashboard.getCreatorDashboard.prefetch({
      creatorId,
      period,
    });
  };
  
  // Invalidate dashboard cache
  const invalidateDashboard = (creatorId?: string) => {
    if (creatorId) {
      utils.analytics.dashboard.getCreatorDashboard.invalidate({ creatorId });
    } else {
      queryClient.invalidateQueries(['analytics']);
    }
  };
  
  return {
    prefetchCreatorDashboard,
    invalidateDashboard,
  };
}
```

---

## Testing Strategy

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEventTracker } from '@/hooks/useEventTracker';

describe('useEventTracker', () => {
  it('should track event successfully', async () => {
    const { result } = renderHook(() => useEventTracker());
    
    await result.current.track('test_event', {
      entityId: 'clx123',
      entityType: 'ASSET',
      props: { test: true },
    });
    
    await waitFor(() => {
      expect(result.current.isTracking).toBe(false);
    });
  });
  
  it('should handle tracking errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    const { result } = renderHook(() => useEventTracker());
    
    // Mock API error
    vi.mocked(trpc.analytics.eventIngestion.track.mutate).mockRejectedValueOnce(
      new Error('Network error')
    );
    
    await result.current.track('test_event');
    
    expect(consoleSpy).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CreatorDashboard } from '@/components/CreatorDashboard';

describe('CreatorDashboard', () => {
  it('should render dashboard with data', async () => {
    render(<CreatorDashboard creatorId="clx123" />);
    
    await waitFor(() => {
      expect(screen.getByText(/Total Views/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Revenue/i)).toBeInTheDocument();
    });
  });
  
  it('should handle loading state', () => {
    render(<CreatorDashboard creatorId="clx123" />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });
  
  it('should handle error state', async () => {
    // Mock API error
    render(<CreatorDashboard creatorId="invalid" />);
    
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

---

## Performance Optimization

### Lazy Loading

```typescript
import dynamic from 'next/dynamic';

// Lazy load heavy chart components
const LineChart = dynamic(() => import('@/components/charts/LineChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});

const BarChart = dynamic(() => import('@/components/charts/BarChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});
```

### Memoization

```typescript
import { useMemo } from 'react';

export function DashboardMetrics({ data }: { data: CreatorDashboard }) {
  // Memoize expensive calculations
  const topAssetsByRevenue = useMemo(() => {
    return data.topAssets
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);
  }, [data.topAssets]);
  
  const totalConversions = useMemo(() => {
    return data.topAssets.reduce((sum, asset) => sum + asset.licenses, 0);
  }, [data.topAssets]);
  
  return (
    <div>
      {/* Render memoized data */}
    </div>
  );
}
```

### Virtualization for Large Lists

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

export function LargeAssetList({ assets }: { assets: TopAsset[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Row height in pixels
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const asset = assets[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <AssetRow asset={asset} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Implementation Checklist

### Phase 1: Event Tracking Setup

- [ ] Install required dependencies (tRPC client, React Query)
- [ ] Set up tRPC client configuration
- [ ] Implement session ID generation utility
- [ ] Implement attribution data extraction utility
- [ ] Create `useEventTracker` custom hook
- [ ] Add page view tracking to layout/pages
- [ ] Add button click tracking to CTA buttons
- [ ] Test event tracking in development
- [ ] Verify events appear in database

### Phase 2: Dashboard Implementation

#### Creator Dashboard
- [ ] Create `useCreatorDashboard` hook
- [ ] Implement dashboard layout component
- [ ] Create metric summary cards
- [ ] Implement revenue timeline chart
- [ ] Create top assets table
- [ ] Add traffic sources visualization
- [ ] Implement period selector
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test with real data

#### Brand Dashboard  
- [ ] Create `useBrandCampaignMetrics` hook
- [ ] Implement campaign metrics cards
- [ ] Create asset performance table
- [ ] Add ROI calculations
- [ ] Implement date range picker
- [ ] Test authorization (brands can only see own data)

#### Admin Dashboard
- [ ] Verify admin role check
- [ ] Create `usePlatformMetrics` hook
- [ ] Implement platform-wide metric cards
- [ ] Add user/creator/brand sections
- [ ] Create revenue growth chart
- [ ] Implement auto-refresh every 5 minutes
- [ ] Test with production-like data volume

### Phase 3: Error Handling & UX

- [ ] Implement centralized error handler
- [ ] Add toast notifications for errors
- [ ] Handle rate limiting gracefully
- [ ] Implement offline event queueing
- [ ] Add retry logic for failed requests
- [ ] Create user-friendly error messages
- [ ] Test error scenarios (401, 403, 429, 500)

### Phase 4: Performance Optimization

- [ ] Implement React Query caching strategy
- [ ] Add prefetching for common queries
- [ ] Lazy load chart components
- [ ] Memoize expensive calculations
- [ ] Virtualize large lists (if needed)
- [ ] Optimize bundle size
- [ ] Test performance with large datasets

### Phase 5: Testing

- [ ] Write unit tests for hooks
- [ ] Write integration tests for components
- [ ] Test event tracking flow end-to-end
- [ ] Test dashboard data loading
- [ ] Test authorization rules
- [ ] Test error handling
- [ ] Performance testing
- [ ] Cross-browser testing

### Phase 6: Documentation & Training

- [ ] Document component usage
- [ ] Create examples for common patterns
- [ ] Document error codes and handling
- [ ] Create runbook for debugging
- [ ] Train team on analytics implementation

---

## Edge Cases to Handle

### 1. Missing Creator/Brand Profile
```typescript
// User is authenticated but doesn't have creator/brand profile
const { data: session } = useSession();
if (!session?.user?.creator) {
  return <EmptyState message="Complete your creator profile to access analytics" />;
}
```

### 2. No Data Available
```typescript
// No metrics data for selected period
if (data && data.summary.totalViews === 0) {
  return <EmptyState message="No analytics data for this period" />;
}
```

### 3. Stale Data Warning
```typescript
// Warn if data is stale
const lastUpdated = data?.lastAggregationRun;
const isStale = lastUpdated && Date.now() - lastUpdated.getTime() > 24 * 60 * 60 * 1000;

if (isStale) {
  return (
    <Alert variant="warning">
      Analytics data is older than 24 hours. Aggregation may be delayed.
    </Alert>
  );
}
```

### 4. Large Date Ranges
```typescript
// Warn about performance for large date ranges
const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
if (daysDiff > 180) {
  toast.warning('Large date ranges may take longer to load');
}
```

---

## Support & Resources

### Quick Links

- **Backend Documentation:** `/docs/METRICS_AGGREGATION_SYSTEM_COMPLETE.md`
- **API Reference:** [Part 1: API Reference](./ANALYTICS_METRICS_AGGREGATION_PART_1_API.md)
- **Business Logic:** [Part 2: Business Logic](./ANALYTICS_METRICS_AGGREGATION_PART_2_LOGIC.md)

### Common Issues & Solutions

**Issue:** Events not appearing in dashboard  
**Solution:** Events are aggregated nightly. Check if daily aggregation job has run.

**Issue:** "Forbidden" error when accessing dashboard  
**Solution:** Verify user has correct role and is accessing own data.

**Issue:** Dashboard loading very slowly  
**Solution:** Check date range size, enable caching, implement pagination.

**Issue:** Stale cache data  
**Solution:** Invalidate cache manually or reduce `staleTime` in React Query config.

### Getting Help

1. Check error logs in browser console
2. Verify API response in Network tab
3. Check backend logs for server errors
4. Contact backend team for data issues
5. File bug report with reproduction steps

---

**End of Implementation Guide**

This completes the comprehensive frontend integration documentation for the Analytics & Metrics Aggregation module.
