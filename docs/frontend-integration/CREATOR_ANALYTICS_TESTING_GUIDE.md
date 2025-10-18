# Creator Analytics - Testing Guide & Quick Reference

> **Classification:** ⚡ HYBRID - Testing strategies and quick reference for analytics integration

This document provides testing strategies, troubleshooting tips, and a quick reference guide for the Creator Analytics module.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Testing Strategies](#testing-strategies)
3. [Test Data Examples](#test-data-examples)
4. [Common Issues & Solutions](#common-issues--solutions)
5. [Performance Optimization](#performance-optimization)
6. [Accessibility Checklist](#accessibility-checklist)

---

## Quick Reference

### Endpoint Summary

| Endpoint | Method | Auth | Purpose | Default Range |
|----------|--------|------|---------|---------------|
| `creatorAnalytics.getEngagement` | Query | JWT | Views, clicks, conversions | 30 days |
| `creatorAnalytics.getPortfolioPerformance` | Query | JWT | Asset performance | 90 days |
| `creatorAnalytics.getLicenseMetrics` | Query | JWT | License analytics | 365 days |
| `creatorAnalytics.getBenchmarks` | Query | JWT | Industry comparisons | 90 days |
| `creatorAnalytics.getCreatorAnalyticsSummary` | Query | JWT (Admin) | All analytics | 30 days |

### Response Time Expectations

| Endpoint | Small Portfolio (<10 assets) | Medium (10-50) | Large (50+) |
|----------|------------------------------|----------------|-------------|
| Engagement | < 500ms | < 800ms | < 1.2s |
| Portfolio | < 300ms | < 600ms | < 1.5s |
| Licenses | < 400ms | < 700ms | < 1.0s |
| Benchmarks | < 800ms | < 1.0s | < 1.5s |

### Error Code Quick Reference

| Code | Status | Meaning | Action |
|------|--------|---------|--------|
| `UNAUTHORIZED` | 401 | No auth token | Redirect to login |
| `FORBIDDEN` | 403 | Not creator's data | Show access denied |
| `NOT_FOUND` | 404 | Creator doesn't exist | Show 404 page |
| `BAD_REQUEST` | 400 | Invalid input | Show validation errors |
| `TOO_MANY_REQUESTS` | 429 | Rate limit hit | Show retry countdown |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Show generic error + retry |

### Date Range Defaults

```typescript
// Engagement Analytics
startDate: now - 30 days
endDate: now

// Portfolio Performance
startDate: now - 90 days
endDate: now

// License Metrics
startDate: now - 365 days
endDate: now

// Benchmarks
startDate: now - 90 days
endDate: now
```

### Currency Conversion

```typescript
// Backend returns cents, convert to dollars
cents / 100 = dollars

// Example
458900 cents = $4,589.00
```

### Percentage Fields

All rate fields (clickThroughRate, conversionRate, etc.) are returned as 0-100, not 0-1.

```typescript
// Backend returns
clickThroughRate: 5.78

// Display as
"5.78%"
```

---

## Testing Strategies

### Unit Tests

#### Test API Client

```typescript
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatorAnalyticsClient } from '@/lib/api/creator-analytics';

describe('CreatorAnalyticsClient', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('should fetch engagement analytics', async () => {
    const { result } = renderHook(
      () => CreatorAnalyticsClient.useEngagement({ id: 'test-creator-id' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.metrics).toBeDefined();
  });

  it('should handle unauthorized error', async () => {
    // Mock unauthorized response
    const { result } = renderHook(
      () => CreatorAnalyticsClient.useEngagement({ id: 'unauthorized-id' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    
    expect(result.current.error?.data?.code).toBe('UNAUTHORIZED');
  });

  it('should validate date range', () => {
    const { result } = renderHook(
      () => CreatorAnalyticsClient.useEngagement({
        id: 'test-id',
        startDate: '2025-10-01T00:00:00Z',
        endDate: '2025-09-01T00:00:00Z', // Invalid: end before start
      }),
      { wrapper }
    );

    expect(result.current.error).toBeDefined();
  });
});
```

#### Test Custom Hooks

```typescript
import { renderHook, act } from '@testing-library/react';
import { useDateRange } from '@/hooks/useDateRange';

describe('useDateRange', () => {
  it('should initialize with default date range', () => {
    const { result } = renderHook(() => useDateRange(30));
    
    expect(result.current.startDate).toBeDefined();
    expect(result.current.endDate).toBeDefined();
  });

  it('should set last 7 days', () => {
    const { result } = renderHook(() => useDateRange(30));
    
    act(() => {
      result.current.setLast7Days();
    });

    const start = new Date(result.current.startDate);
    const end = new Date(result.current.endDate);
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    
    expect(daysDiff).toBeCloseTo(7, 0);
  });

  it('should set custom range', () => {
    const { result } = renderHook(() => useDateRange(30));
    
    const customStart = new Date('2025-09-01');
    const customEnd = new Date('2025-09-30');

    act(() => {
      result.current.setCustomRange(customStart, customEnd);
    });

    expect(new Date(result.current.startDate)).toEqual(customStart);
    expect(new Date(result.current.endDate)).toEqual(customEnd);
  });
});
```

### Integration Tests

#### Test Dashboard Component

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EngagementDashboard } from '@/components/engagement-dashboard';

describe('EngagementDashboard', () => {
  it('should render loading state', () => {
    render(<EngagementDashboard creatorId="test-id" />);
    
    expect(screen.getByTestId('engagement-skeleton')).toBeInTheDocument();
  });

  it('should render metrics after loading', async () => {
    render(<EngagementDashboard creatorId="test-id" />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Views')).toBeInTheDocument();
      expect(screen.getByText('Total Clicks')).toBeInTheDocument();
      expect(screen.getByText('Conversions')).toBeInTheDocument();
    });
  });

  it('should update when date range changes', async () => {
    render(<EngagementDashboard creatorId="test-id" />);
    
    const dateRangePicker = screen.getByRole('button', { name: /date range/i });
    await userEvent.click(dateRangePicker);

    const last7DaysOption = screen.getByText('Last 7 days');
    await userEvent.click(last7DaysOption);

    await waitFor(() => {
      // Verify data refetch occurred
      expect(screen.queryByTestId('engagement-skeleton')).toBeInTheDocument();
    });
  });

  it('should handle error state', async () => {
    // Mock error response
    render(<EngagementDashboard creatorId="invalid-id" />);
    
    await waitFor(() => {
      expect(screen.getByText(/creator not found/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Creator Analytics', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'creator@test.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should display engagement analytics', async ({ page }) => {
    await page.goto('/analytics/engagement');
    
    // Wait for data to load
    await page.waitForSelector('[data-testid="engagement-metrics"]');
    
    // Verify key metrics are displayed
    await expect(page.locator('text=Total Views')).toBeVisible();
    await expect(page.locator('text=Total Clicks')).toBeVisible();
    await expect(page.locator('text=Conversions')).toBeVisible();
    
    // Verify chart is rendered
    await expect(page.locator('[data-testid="engagement-chart"]')).toBeVisible();
  });

  test('should filter portfolio by asset type', async ({ page }) => {
    await page.goto('/analytics/portfolio');
    
    await page.waitForSelector('[data-testid="portfolio-table"]');
    
    // Select IMAGE filter
    await page.selectOption('select[name="assetType"]', 'IMAGE');
    
    // Wait for filtered results
    await page.waitForTimeout(1000);
    
    // Verify only IMAGE assets are shown
    const assetTypes = await page.locator('[data-testid="asset-type"]').allTextContents();
    expect(assetTypes.every(type => type === 'IMAGE')).toBe(true);
  });

  test('should navigate through pagination', async ({ page }) => {
    await page.goto('/analytics/portfolio');
    
    await page.waitForSelector('[data-testid="portfolio-table"]');
    
    // Click next page
    await page.click('button[aria-label="Next page"]');
    
    // Verify URL updated with offset
    await expect(page).toHaveURL(/offset=20/);
    
    // Verify page indicator updated
    await expect(page.locator('text=Page 2')).toBeVisible();
  });

  test('should show benchmark insights', async ({ page }) => {
    await page.goto('/analytics/benchmarks');
    
    await page.waitForSelector('[data-testid="benchmarks-section"]');
    
    // Verify benchmark comparisons displayed
    await expect(page.locator('text=Engagement Rate')).toBeVisible();
    await expect(page.locator('text=Conversion Rate')).toBeVisible();
    
    // Verify insights section
    await expect(page.locator('[data-testid="insights-section"]')).toBeVisible();
  });

  test('should handle rate limiting gracefully', async ({ page }) => {
    // Make 100+ rapid requests to trigger rate limit
    for (let i = 0; i < 105; i++) {
      await page.goto('/analytics/engagement', { waitUntil: 'domcontentloaded' });
    }
    
    // Verify rate limit message displayed
    await expect(page.locator('text=/too many requests/i')).toBeVisible();
  });
});
```

---

## Test Data Examples

### Mock Engagement Response

```typescript
export const mockEngagementData: EngagementAnalyticsResponse = {
  creatorId: 'clh5w8x9y0000abc123xyz',
  dateRange: {
    start: '2025-09-17T00:00:00.000Z',
    end: '2025-10-17T23:59:59.999Z',
  },
  metrics: {
    totalViews: 15432,
    totalClicks: 892,
    totalConversions: 45,
    uniqueVisitors: 12450,
    avgEngagementTime: 145,
    clickThroughRate: 5.78,
    conversionRate: 5.04,
  },
  timeSeries: [
    {
      timestamp: '2025-09-17T00:00:00.000Z',
      views: 487,
      clicks: 28,
      conversions: 2,
      uniqueVisitors: 412,
    },
    {
      timestamp: '2025-09-18T00:00:00.000Z',
      views: 523,
      clicks: 31,
      conversions: 1,
      uniqueVisitors: 445,
    },
  ],
  topAssets: [
    {
      assetId: 'clh5abc123',
      title: 'Ethereal Portrait Collection',
      type: 'IMAGE',
      views: 3245,
      conversions: 12,
    },
  ],
  comparison: {
    periodLabel: 'Previous Period',
    viewsChange: 12.5,
    clicksChange: 8.3,
    conversionsChange: 15.7,
    conversionRateChange: 6.8,
  },
};
```

### Mock Portfolio Response

```typescript
export const mockPortfolioData: PortfolioPerformanceResponse = {
  creatorId: 'clh5w8x9y0000abc123xyz',
  dateRange: {
    start: '2025-07-19T00:00:00.000Z',
    end: '2025-10-17T23:59:59.999Z',
  },
  summary: {
    totalAssets: 47,
    publishedAssets: 38,
    totalViews: 125430,
    totalRevenueCents: 458900,
    avgViewsPerAsset: 2668,
    avgRevenuePerAssetCents: 9763,
  },
  assets: [
    {
      assetId: 'clh5xyz789',
      title: 'Sunset Dreams Collection',
      type: 'IMAGE',
      status: 'PUBLISHED',
      createdAt: '2025-08-15T10:30:00.000Z',
      views: 8934,
      clicks: 456,
      conversions: 23,
      revenueCents: 89500,
      activeLicenses: 5,
      engagementRate: 5.36,
      thumbnailUrl: 'https://cdn.yesgoddess.agency/thumbnails/clh5xyz789.jpg',
    },
  ],
  pagination: {
    total: 38,
    limit: 20,
    offset: 0,
    hasMore: true,
  },
  performanceDistribution: {
    topPerformers: 10,
    goodPerformers: 9,
    averagePerformers: 9,
    underPerformers: 10,
  },
};
```

### MSW Mock Handlers

```typescript
import { rest } from 'msw';
import { mockEngagementData, mockPortfolioData } from './mock-data';

export const analyticsHandlers = [
  // Engagement analytics
  rest.get('/api/trpc/creatorAnalytics.getEngagement', (req, res, ctx) => {
    const creatorId = req.url.searchParams.get('input.id');
    
    if (creatorId === 'unauthorized-id') {
      return res(
        ctx.status(401),
        ctx.json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in',
          },
        })
      );
    }
    
    if (creatorId === 'not-found-id') {
      return res(
        ctx.status(404),
        ctx.json({
          error: {
            code: 'NOT_FOUND',
            message: 'Creator not found',
          },
        })
      );
    }
    
    return res(ctx.status(200), ctx.json({ result: { data: mockEngagementData } }));
  }),

  // Portfolio performance
  rest.get('/api/trpc/creatorAnalytics.getPortfolioPerformance', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ result: { data: mockPortfolioData } }));
  }),
];
```

---

## Common Issues & Solutions

### Issue 1: "Creator not found" for valid creator

**Symptoms:**
- API returns 404
- Creator exists in database

**Causes:**
1. Creator ID format incorrect (not CUID)
2. Creator soft-deleted (`deletedAt` not null)
3. Wrong environment (dev vs prod data)

**Solutions:**
```typescript
// Verify creator ID format
console.log('Creator ID:', creatorId);
console.log('Is valid CUID:', /^c[a-z0-9]{24}$/i.test(creatorId));

// Check if using correct environment
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);
```

---

### Issue 2: Slow response times (>3 seconds)

**Symptoms:**
- API takes 3+ seconds to respond
- Frontend times out

**Causes:**
1. Large portfolio (100+ assets)
2. Long date range (>6 months)
3. Redis cache miss
4. Database query not optimized

**Solutions:**
```typescript
// 1. Reduce date range
const { data } = CreatorAnalyticsClient.usePortfolioPerformance({
  id: creatorId,
  startDate: subDays(new Date(), 30).toISOString(), // Instead of 90 days
  endDate: new Date().toISOString(),
});

// 2. Reduce page size
const { data } = CreatorAnalyticsClient.usePortfolioPerformance({
  id: creatorId,
  limit: 10, // Instead of 20 or more
});

// 3. Show loading indicator
{isLoading && <ProgressBar />}

// 4. Implement suspense boundary
<Suspense fallback={<AnalyticsSkeleton />}>
  <EngagementDashboard creatorId={creatorId} />
</Suspense>
```

---

### Issue 3: Charts not rendering

**Symptoms:**
- Empty chart area
- Console errors about missing data

**Causes:**
1. Data format mismatch
2. Chart library not installed
3. Responsive container missing

**Solutions:**
```typescript
// 1. Verify data format
console.log('Time series data:', data?.timeSeries);

// 2. Check if data exists before rendering
{data?.timeSeries && data.timeSeries.length > 0 ? (
  <EngagementChart data={data.timeSeries} />
) : (
  <EmptyState message="No data available for the selected period" />
)}

// 3. Wrap chart in ResponsiveContainer
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={data.timeSeries}>
    {/* ... */}
  </LineChart>
</ResponsiveContainer>
```

---

### Issue 4: Rate limit hit too quickly

**Symptoms:**
- 429 error after 10-20 requests
- "Too many requests" message

**Causes:**
1. Component re-rendering causing refetch
2. Multiple tabs open
3. Auto-refetch too aggressive

**Solutions:**
```typescript
// 1. Disable refetch on window focus for development
const { data } = trpc.creatorAnalytics.getEngagement.useQuery(
  { id: creatorId },
  {
    refetchOnWindowFocus: false, // Disable in dev
    staleTime: 10 * 60 * 1000,   // 10 minutes
  }
);

// 2. Use React Query devtools to inspect queries
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// 3. Implement request deduplication
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
```

---

### Issue 5: Date timezone mismatch

**Symptoms:**
- Dates off by one day
- Data doesn't match expected range

**Causes:**
1. Not converting UTC to local timezone
2. Date picker sends local time instead of UTC

**Solutions:**
```typescript
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

// When sending to API (convert local to UTC)
const startDateUTC = zonedTimeToUtc(
  startOfDay(selectedDate),
  Intl.DateTimeFormat().resolvedOptions().timeZone
).toISOString();

// When displaying from API (convert UTC to local)
const formatTimestamp = (utcTimestamp: string) => {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDate = utcToZonedTime(utcTimestamp, userTimezone);
  return format(localDate, 'MMM d, yyyy h:mm a');
};
```

---

## Performance Optimization

### 1. Lazy Load Charts

```typescript
import dynamic from 'next/dynamic';

const EngagementChart = dynamic(() => import('@/components/charts/engagement-chart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
```

### 2. Virtual Scrolling for Large Lists

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function PortfolioTable({ assets }: { assets: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
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
            <AssetRow asset={assets[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 3. Debounce Search/Filter

```typescript
import { useDebouncedCallback } from 'use-debounce';

function PortfolioFilters({ onFilterChange }: { onFilterChange: (filters: any) => void }) {
  const [search, setSearch] = useState('');

  const debouncedFilter = useDebouncedCallback((value: string) => {
    onFilterChange({ search: value });
  }, 500);

  return (
    <input
      type="text"
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
        debouncedFilter(e.target.value);
      }}
      placeholder="Search assets..."
    />
  );
}
```

### 4. Optimize Chart Rendering

```typescript
import { memo } from 'react';

const EngagementChart = memo(({ data, granularity }: ChartProps) => {
  // Chart implementation
}, (prevProps, nextProps) => {
  // Only re-render if data or granularity changes
  return (
    prevProps.data === nextProps.data &&
    prevProps.granularity === nextProps.granularity
  );
});
```

---

## Accessibility Checklist

### ARIA Labels
- [ ] All charts have `aria-label` describing the data
- [ ] Data tables have proper table headers
- [ ] Interactive elements have descriptive labels
- [ ] Loading states announce to screen readers

### Keyboard Navigation
- [ ] All controls accessible via Tab key
- [ ] Date picker keyboard-friendly
- [ ] Table sortable with keyboard
- [ ] Modals close with Escape key

### Visual Accessibility
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] Charts don't rely solely on color
- [ ] Focus indicators visible
- [ ] Text scalable to 200%

### Screen Reader Support
```tsx
// Example: Accessible metric card
<div role="region" aria-labelledby="total-views-heading">
  <h3 id="total-views-heading">Total Views</h3>
  <p aria-live="polite">
    {metrics.totalViews.toLocaleString()} views
    {comparison && (
      <span className="sr-only">
        {comparison.viewsChange > 0 ? 'increased' : 'decreased'} by{' '}
        {Math.abs(comparison.viewsChange).toFixed(1)}% compared to previous period
      </span>
    )}
  </p>
</div>
```

---

## Troubleshooting Commands

### Check API Connectivity

```bash
# Test engagement endpoint
curl -X GET "https://ops.yesgoddess.agency/api/trpc/creatorAnalytics.getEngagement?input=%7B%22id%22%3A%22YOUR_CREATOR_ID%22%7D" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Inspect tRPC Queries

```typescript
// In browser console
// View all active queries
console.log(queryClient.getQueryCache().getAll());

// View specific query data
console.log(
  queryClient.getQueryData(['creatorAnalytics', 'getEngagement', { id: 'creator-id' }])
);

// Invalidate query
queryClient.invalidateQueries(['creatorAnalytics']);
```

### Debug Rate Limiting

```typescript
// Check rate limit headers in response
const { data, error } = trpc.creatorAnalytics.getEngagement.useQuery(
  { id: creatorId },
  {
    onSuccess: (data, response) => {
      console.log('Rate Limit:', response.headers.get('X-RateLimit-Limit'));
      console.log('Remaining:', response.headers.get('X-RateLimit-Remaining'));
      console.log('Reset:', new Date(parseInt(response.headers.get('X-RateLimit-Reset') || '0') * 1000));
    },
  }
);
```

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Method |
|--------|--------|--------|
| First Contentful Paint | < 1.5s | Lighthouse |
| Time to Interactive | < 3.0s | Lighthouse |
| API Response Time | < 1.0s | Network tab |
| Chart Render Time | < 500ms | React DevTools Profiler |
| Table Scroll FPS | 60 FPS | Browser Performance tab |

### Monitoring

```typescript
// Add performance monitoring
useEffect(() => {
  const startTime = performance.now();

  return () => {
    const endTime = performance.now();
    console.log(`Component render time: ${endTime - startTime}ms`);
    
    // Send to analytics
    analytics.track('component_performance', {
      component: 'EngagementDashboard',
      renderTime: endTime - startTime,
    });
  };
}, []);
```

---

**Document Version:** 1.0  
**Last Updated:** October 17, 2025  
**Maintained By:** Backend Development Team
