# License Usage Tracking - Frontend Integration Guide (Part 3: Implementation Checklist)

**Classification:** ⚡ HYBRID  

---

## Table of Contents

1. [Frontend Implementation Checklist](#frontend-implementation-checklist)
2. [Component Examples](#component-examples)
3. [API Client Setup](#api-client-setup)
4. [State Management Patterns](#state-management-patterns)
5. [Real-time Updates](#real-time-updates)
6. [Testing Considerations](#testing-considerations)
7. [UX Recommendations](#ux-recommendations)

---

## Frontend Implementation Checklist

### Phase 1: Setup & Types (1-2 days)

- [ ] **Install dependencies**
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query zod date-fns
  ```

- [ ] **Copy type definitions** from Part 2 to `@/types/usage-tracking.ts`

- [ ] **Configure tRPC client** (if not already done)
  ```typescript
  // lib/trpc.ts
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '@/server/routers/_app'; // Backend router type
  
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] **Wrap app with tRPC provider**
  ```typescript
  // app/layout.tsx or _app.tsx
  import { trpc } from '@/lib/trpc';
  
  function App({ Component, pageProps }) {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() =>
      trpc.createClient({
        url: process.env.NEXT_PUBLIC_API_URL + '/api/trpc',
        headers: () => ({
          authorization: `Bearer ${getToken()}`,
        }),
      })
    );
  
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Component {...pageProps} />
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  ```

- [ ] **Create usage tracking service** (abstraction layer)
  ```typescript
  // services/usage-tracking.service.ts
  import { trpc } from '@/lib/trpc';
  
  export class UsageTrackingService {
    static async trackEvent(input: TrackUsageEventInput) {
      try {
        const result = await trpc.usage.trackEvent.mutate(input);
        return result;
      } catch (error) {
        console.error('Failed to track usage:', error);
        return { eventId: null, tracked: false, error: 'Network error' };
      }
    }
  }
  ```

---

### Phase 2: Basic Usage Tracking (2-3 days)

#### 2.1 Track Asset Views

- [ ] **Create view tracking hook**
  ```typescript
  // hooks/useTrackView.ts
  import { useEffect, useRef } from 'react';
  import { trpc } from '@/lib/trpc';
  
  export function useTrackView(licenseId: string | undefined) {
    const tracked = useRef(false);
    const trackEvent = trpc.usage.trackEvent.useMutation();
  
    useEffect(() => {
      if (!licenseId || tracked.current) return;
  
      tracked.current = true;
      trackEvent.mutate({
        licenseId,
        usageType: 'view',
        quantity: 1,
        platform: 'web',
        deviceType: getDeviceType(),
        geographicLocation: getUserLocation(),
        sessionId: getSessionId(),
      });
    }, [licenseId]);
  }
  
  function getDeviceType(): DeviceType {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }
  
  function getSessionId(): string {
    let sessionId = sessionStorage.getItem('usage-session-id');
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36)}`;
      sessionStorage.setItem('usage-session-id', sessionId);
    }
    return sessionId;
  }
  
  function getUserLocation(): string | undefined {
    // Implement geo-detection (from IP, browser API, etc.)
    // For privacy, consider opt-in
    return undefined;
  }
  ```

- [ ] **Use in asset detail page**
  ```typescript
  // pages/assets/[assetId].tsx
  export default function AssetDetailPage({ asset, license }) {
    useTrackView(license?.id);
  
    return (
      <div>
        <h1>{asset.title}</h1>
        {/* ... */}
      </div>
    );
  }
  ```

#### 2.2 Track Downloads

- [ ] **Implement download tracking**
  ```typescript
  // components/DownloadButton.tsx
  export function DownloadButton({ assetUrl, licenseId }) {
    const trackEvent = trpc.usage.trackEvent.useMutation();
  
    const handleDownload = async () => {
      // Track event (non-blocking)
      trackEvent.mutate({
        licenseId,
        usageType: 'download',
        quantity: 1,
        platform: 'web',
      });
  
      // Trigger download
      window.open(assetUrl, '_blank');
    };
  
    return (
      <button onClick={handleDownload} className="btn-primary">
        Download Asset
      </button>
    );
  }
  ```

#### 2.3 Track Video Plays

- [ ] **Implement video play tracking**
  ```typescript
  // components/VideoPlayer.tsx
  import { useRef, useState } from 'react';
  
  export function VideoPlayer({ videoUrl, licenseId }) {
    const trackEvent = trpc.usage.trackEvent.useMutation();
    const [tracked, setTracked] = useState(false);
  
    const handlePlay = () => {
      if (tracked) return;
      setTracked(true);
  
      trackEvent.mutate({
        licenseId,
        usageType: 'play',
        quantity: 1,
        platform: 'web',
      });
    };
  
    return (
      <video src={videoUrl} onPlay={handlePlay} controls>
        Your browser does not support video.
      </video>
    );
  }
  ```

---

### Phase 3: Usage Analytics Dashboard (3-5 days)

#### 3.1 License Usage Overview

- [ ] **Create usage metrics card component**
  ```typescript
  // components/UsageMetricsCard.tsx
  import { formatNumber } from '@/lib/utils';
  
  export function UsageMetricsCard({ metrics }: { metrics: UsageMetrics }) {
    return (
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Total Views"
          value={formatNumber(metrics.totalViews)}
          icon="👁️"
        />
        <MetricCard
          label="Downloads"
          value={formatNumber(metrics.totalDownloads)}
          icon="📥"
        />
        <MetricCard
          label="Impressions"
          value={formatNumber(metrics.totalImpressions)}
          icon="👤"
        />
        <MetricCard
          label="Clicks"
          value={formatNumber(metrics.totalClicks)}
          icon="🖱️"
        />
        <MetricCard
          label="Sessions"
          value={formatNumber(metrics.uniqueSessions)}
          icon="🔗"
        />
        <MetricCard
          label="Revenue"
          value={`$${(metrics.totalRevenueCents / 100).toFixed(2)}`}
          icon="💰"
        />
      </div>
    );
  }
  ```

- [ ] **Create usage analytics page**
  ```typescript
  // pages/licenses/[licenseId]/usage.tsx
  import { useState } from 'react';
  import { startOfMonth, endOfDay } from 'date-fns';
  
  export default function LicenseUsagePage({ licenseId }) {
    const [dateRange, setDateRange] = useState({
      start: startOfMonth(new Date()),
      end: endOfDay(new Date()),
    });
  
    const { data: analytics, isLoading } = trpc.usage.getAnalytics.useQuery({
      licenseId,
      startDate: dateRange.start,
      endDate: dateRange.end,
      granularity: 'daily',
      compareWithPreviousPeriod: true,
    });
  
    if (isLoading) return <LoadingSpinner />;
  
    return (
      <div className="space-y-6">
        <h1>Usage Analytics</h1>
        
        <DateRangePicker value={dateRange} onChange={setDateRange} />
  
        <UsageMetricsCard metrics={analytics.currentPeriod} />
  
        {analytics.percentageChange && (
          <PercentageChangeIndicator changes={analytics.percentageChange} />
        )}
  
        <UsageTrendsChart trends={analytics.trends} />
  
        <div className="grid grid-cols-2 gap-4">
          <TopSourcesCard sources={analytics.topSources} />
          <TopPlatformsCard platforms={analytics.topPlatforms} />
        </div>
  
        <GeographicMapCard distribution={analytics.geographicDistribution} />
      </div>
    );
  }
  ```

#### 3.2 Usage Trends Chart

- [ ] **Install charting library**
  ```bash
  npm install recharts
  # or
  npm install chart.js react-chartjs-2
  ```

- [ ] **Create trends chart component**
  ```typescript
  // components/UsageTrendsChart.tsx
  import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
  import { format } from 'date-fns';
  
  export function UsageTrendsChart({ trends }: { trends: UsageTrend[] }) {
    const chartData = trends.map((t) => ({
      date: format(new Date(t.date), 'MMM dd'),
      views: t.metrics.totalViews,
      downloads: t.metrics.totalDownloads,
      impressions: t.metrics.totalImpressions,
    }));
  
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Usage Trends</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="views" stroke="#B8A888" strokeWidth={2} />
            <Line type="monotone" dataKey="downloads" stroke="#8884d8" strokeWidth={2} />
            <Line type="monotone" dataKey="impressions" stroke="#82ca9d" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```

#### 3.3 Top Sources & Platforms

- [ ] **Create top sources component**
  ```typescript
  // components/TopSourcesCard.tsx
  export function TopSourcesCard({ sources }: { sources: UsageSource[] }) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Top Traffic Sources</h3>
        <ul className="space-y-2">
          {sources?.map((source, i) => (
            <li key={i} className="flex justify-between items-center">
              <span className="truncate">{source.referrer || 'Direct'}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{source.count}</span>
                <span className="text-xs text-gray-400">
                  ({source.percentage.toFixed(1)}%)
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  ```

---

### Phase 4: Threshold Management (2-3 days)

#### 4.1 Threshold Configuration Form

- [ ] **Create threshold form component**
  ```typescript
  // components/ThresholdConfigForm.tsx
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { createThresholdSchema } from '@/lib/validation';
  
  export function ThresholdConfigForm({ licenseId, onSuccess }) {
    const createThreshold = trpc.usage.createThreshold.useMutation({
      onSuccess,
    });
  
    const { register, handleSubmit, formState: { errors } } = useForm({
      resolver: zodResolver(createThresholdSchema),
      defaultValues: {
        licenseId,
        warningAt50: true,
        warningAt75: true,
        warningAt90: true,
        warningAt100: true,
        allowOverage: false,
        gracePercentage: 0,
      },
    });
  
    const onSubmit = (data) => {
      createThreshold.mutate(data);
    };
  
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="usageType">Usage Type</label>
          <select {...register('usageType')} id="usageType">
            <option value="view">Views</option>
            <option value="download">Downloads</option>
            <option value="impression">Impressions</option>
            <option value="click">Clicks</option>
            <option value="play">Plays</option>
            <option value="stream">Streams</option>
          </select>
          {errors.usageType && <p className="text-red-600">{errors.usageType.message}</p>}
        </div>
  
        <div>
          <label htmlFor="limitQuantity">Usage Limit</label>
          <input
            {...register('limitQuantity', { valueAsNumber: true })}
            type="number"
            id="limitQuantity"
            min="1"
          />
          {errors.limitQuantity && <p className="text-red-600">{errors.limitQuantity.message}</p>}
        </div>
  
        <div>
          <label htmlFor="periodType">Period</label>
          <select {...register('periodType')} id="periodType">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="total">Total (Lifetime)</option>
          </select>
        </div>
  
        <div>
          <label htmlFor="gracePercentage">Grace Percentage (0-100%)</label>
          <input
            {...register('gracePercentage', { valueAsNumber: true })}
            type="number"
            id="gracePercentage"
            min="0"
            max="100"
          />
          <p className="text-xs text-gray-500">
            Soft limit before hard overage (e.g., 10% = 10,000 limit becomes 11,000)
          </p>
        </div>
  
        <fieldset>
          <legend>Warning Levels</legend>
          <label>
            <input type="checkbox" {...register('warningAt50')} />
            50% Warning
          </label>
          <label>
            <input type="checkbox" {...register('warningAt75')} />
            75% Warning
          </label>
          <label>
            <input type="checkbox" {...register('warningAt90')} />
            90% Warning
          </label>
          <label>
            <input type="checkbox" {...register('warningAt100')} />
            100% Warning
          </label>
        </fieldset>
  
        <div>
          <label>
            <input type="checkbox" {...register('allowOverage')} />
            Allow usage beyond limit (overage fees apply)
          </label>
        </div>
  
        <div>
          <label htmlFor="overageRateCents">Overage Fee (per unit, in cents)</label>
          <input
            {...register('overageRateCents', { valueAsNumber: true })}
            type="number"
            id="overageRateCents"
            min="0"
            placeholder="e.g., 50 = $0.50 per unit"
          />
        </div>
  
        <button type="submit" className="btn-primary" disabled={createThreshold.isLoading}>
          {createThreshold.isLoading ? 'Creating...' : 'Create Threshold'}
        </button>
      </form>
    );
  }
  ```

#### 4.2 Threshold Status Display

- [ ] **Create threshold status component**
  ```typescript
  // components/ThresholdStatusCard.tsx
  export function ThresholdStatusCard({ licenseId }) {
    const { data: statuses } = trpc.usage.getThresholdStatus.useQuery({ licenseId });
  
    return (
      <div className="space-y-4">
        <h2>Usage Thresholds</h2>
        {statuses?.map((status) => (
          <ThresholdStatusItem key={status.threshold.id} status={status} />
        ))}
      </div>
    );
  }
  
  function ThresholdStatusItem({ status }: { status: ThresholdStatus }) {
    const getStatusColor = () => {
      if (status.isOverLimit) return 'bg-red-100 border-red-400 text-red-800';
      if (status.percentageUsed >= 90) return 'bg-orange-100 border-orange-400 text-orange-800';
      if (status.percentageUsed >= 75) return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      return 'bg-green-100 border-green-400 text-green-800';
    };
  
    return (
      <div className={`p-4 border-l-4 rounded ${getStatusColor()}`}>
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-semibold capitalize">{status.threshold.usageType}</h3>
            <p className="text-sm">
              {status.currentUsage.toLocaleString()} / {status.limit.toLocaleString()} 
              ({status.threshold.periodType})
            </p>
          </div>
          <span className="text-lg font-bold">{status.percentageUsed.toFixed(1)}%</span>
        </div>
  
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full ${
              status.isOverLimit ? 'bg-red-600' :
              status.percentageUsed >= 90 ? 'bg-orange-500' :
              status.percentageUsed >= 75 ? 'bg-yellow-500' :
              'bg-green-500'
            }`}
            style={{ width: `${Math.min(status.percentageUsed, 100)}%` }}
          />
        </div>
  
        {status.isOverLimit && (
          <p className="text-sm font-semibold">
            ⚠️ Overage: {(status.currentUsage - status.limitWithGrace).toLocaleString()} units
          </p>
        )}
  
        {status.projectedExceededDate && !status.isOverLimit && (
          <p className="text-sm">
            📈 Projected to exceed on {format(new Date(status.projectedExceededDate), 'MMM dd, yyyy')}
          </p>
        )}
  
        {status.remaining > 0 && (
          <p className="text-sm">
            Remaining: {status.remaining.toLocaleString()} units
          </p>
        )}
      </div>
    );
  }
  ```

---

### Phase 5: Overage Management (2-3 days)

#### 5.1 Overage List (Brand View)

- [ ] **Create overage list component**
  ```typescript
  // components/OverageList.tsx
  export function OverageList({ licenseId }) {
    const { data: overages } = trpc.usage.getOverages.useQuery({
      licenseId,
      limit: 50,
    });
  
    return (
      <div>
        <h2>Usage Overages</h2>
        <table className="w-full">
          <thead>
            <tr>
              <th>Detected</th>
              <th>Type</th>
              <th>Limit</th>
              <th>Actual</th>
              <th>Overage</th>
              <th>Fee</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {overages?.map((overage) => (
              <OverageRow key={overage.id} overage={overage} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  
  function OverageRow({ overage }) {
    const getStatusBadge = (status: OverageStatus) => {
      const colors = {
        DETECTED: 'bg-gray-100 text-gray-800',
        PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
        APPROVED: 'bg-blue-100 text-blue-800',
        BILLED: 'bg-green-100 text-green-800',
        DISPUTED: 'bg-red-100 text-red-800',
      };
      return (
        <span className={`px-2 py-1 rounded text-xs ${colors[status]}`}>
          {status.replace('_', ' ')}
        </span>
      );
    };
  
    return (
      <tr>
        <td>{format(new Date(overage.detectedAt), 'MMM dd, yyyy')}</td>
        <td className="capitalize">{overage.usageType}</td>
        <td>{overage.limitQuantity.toLocaleString()}</td>
        <td>{overage.actualQuantity.toLocaleString()}</td>
        <td>{overage.overageQuantity.toLocaleString()}</td>
        <td>${(overage.calculatedFeeCents / 100).toFixed(2)}</td>
        <td>{getStatusBadge(overage.status)}</td>
        <td>
          {(overage.status === 'APPROVED' || overage.status === 'BILLED') && (
            <button className="text-sm text-blue-600 hover:underline">
              Dispute
            </button>
          )}
        </td>
      </tr>
    );
  }
  ```

#### 5.2 Overage Approval (Admin Only)

- [ ] **Create admin overage approval component**
  ```typescript
  // components/admin/OverageApprovalPanel.tsx
  export function OverageApprovalPanel({ overageId, onApproved }) {
    const approveOverage = trpc.usage.approveOverage.useMutation({
      onSuccess: onApproved,
    });
  
    const { register, handleSubmit } = useForm();
  
    const onSubmit = (data) => {
      approveOverage.mutate({
        overageId,
        billedFeeCents: data.billedFeeCents ? parseInt(data.billedFeeCents) : undefined,
        notes: data.notes,
      });
    };
  
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label>Billed Fee (override, in cents)</label>
          <input {...register('billedFeeCents')} type="number" min="0" />
          <p className="text-xs text-gray-500">
            Leave empty to use calculated fee
          </p>
        </div>
  
        <div>
          <label>Notes</label>
          <textarea {...register('notes')} rows={3} maxLength={1000} />
        </div>
  
        <button type="submit" className="btn-primary" disabled={approveOverage.isLoading}>
          Approve Overage
        </button>
      </form>
    );
  }
  ```

---

### Phase 6: Forecasting (2-3 days)

#### 6.1 Generate Forecast

- [ ] **Create forecast generator component**
  ```typescript
  // components/ForecastGenerator.tsx
  export function ForecastGenerator({ licenseId, usageType }) {
    const generateForecast = trpc.usage.generateForecast.useMutation();
  
    const handleGenerate = () => {
      const now = new Date();
      generateForecast.mutate({
        licenseId,
        usageType,
        periodStart: now,
        periodEnd: addDays(now, 30), // Forecast next 30 days
        forecastingMethod: 'LINEAR_REGRESSION',
        historicalDays: 30,
        confidenceLevel: 0.95,
      });
    };
  
    return (
      <div>
        <button onClick={handleGenerate} disabled={generateForecast.isLoading}>
          {generateForecast.isLoading ? 'Generating...' : 'Generate Forecast'}
        </button>
  
        {generateForecast.data && (
          <ForecastResultCard result={generateForecast.data} />
        )}
      </div>
    );
  }
  ```

#### 6.2 Forecast Display

- [ ] **Create forecast display component**
  ```typescript
  // components/ForecastResultCard.tsx
  export function ForecastResultCard({ result }: { result: ForecastResult }) {
    const { forecast, thresholdBreach } = result;
  
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Usage Forecast</h3>
  
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Period</p>
            <p className="font-semibold">
              {format(new Date(forecast.periodStart), 'MMM dd')} - 
              {format(new Date(forecast.periodEnd), 'MMM dd, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Predicted Usage</p>
            <p className="font-semibold text-2xl">
              {forecast.predictedQuantity.toLocaleString()}
            </p>
          </div>
        </div>
  
        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="text-sm text-gray-600 mb-1">
            Confidence Range ({(forecast.confidenceLevel * 100).toFixed(0)}%)
          </p>
          <p className="font-semibold">
            {forecast.lowerBound.toLocaleString()} - {forecast.upperBound.toLocaleString()}
          </p>
        </div>
  
        {thresholdBreach && (
          <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
            <h4 className="font-semibold text-orange-800 mb-2">
              ⚠️ Threshold Breach Predicted
            </h4>
            <p className="text-sm text-orange-700">
              Usage is projected to exceed the limit on{' '}
              <strong>
                {format(new Date(thresholdBreach.predictedBreachDate), 'MMMM dd, yyyy')}
              </strong>
              {' '}({thresholdBreach.daysUntilBreach} days from now)
            </p>
            <p className="text-xs text-orange-600 mt-2">
              Probability: {(thresholdBreach.breachProbability * 100).toFixed(0)}%
            </p>
          </div>
        )}
      </div>
    );
  }
  ```

---

### Phase 7: Notifications & Alerts (1-2 days)

- [ ] **Create usage alert component**
  ```typescript
  // components/UsageAlerts.tsx
  export function UsageAlerts({ licenseId }) {
    const { data: statuses } = trpc.usage.getThresholdStatus.useQuery({ licenseId });
  
    const alerts = statuses?.filter(s => s.isWarningLevel || s.isOverLimit) || [];
  
    if (alerts.length === 0) return null;
  
    return (
      <div className="space-y-2">
        {alerts.map((status) => (
          <UsageAlertBanner key={status.threshold.id} status={status} />
        ))}
      </div>
    );
  }
  
  function UsageAlertBanner({ status }: { status: ThresholdStatus }) {
    const getSeverity = () => {
      if (status.isOverLimit) return 'critical';
      if (status.percentageUsed >= 90) return 'warning';
      return 'info';
    };
  
    const severity = getSeverity();
    const colors = {
      critical: 'bg-red-50 border-red-400 text-red-800',
      warning: 'bg-orange-50 border-orange-400 text-orange-800',
      info: 'bg-blue-50 border-blue-400 text-blue-800',
    };
  
    return (
      <div className={`p-4 border-l-4 rounded ${colors[severity]}`}>
        <h4 className="font-semibold">
          {status.isOverLimit ? '🚨 Usage Limit Exceeded' : '⚠️ Approaching Usage Limit'}
        </h4>
        <p className="text-sm mt-1">
          {status.threshold.usageType} usage is at {status.percentageUsed.toFixed(1)}%
          ({status.currentUsage.toLocaleString()} / {status.limit.toLocaleString()})
        </p>
        {status.isOverLimit && status.threshold.allowOverage && (
          <p className="text-sm mt-1">
            Overage fees apply: ${((status.threshold.overageRateCents || 0) / 100).toFixed(2)} per unit
          </p>
        )}
      </div>
    );
  }
  ```

---

### Phase 8: Testing & Edge Cases (2-3 days)

- [ ] **Test usage tracking**
  - [ ] Verify events are tracked correctly
  - [ ] Test idempotency (duplicate prevention)
  - [ ] Test with network failures (non-blocking)
  - [ ] Test batch tracking (> 10 events)

- [ ] **Test analytics**
  - [ ] Verify metrics calculations
  - [ ] Test period comparisons
  - [ ] Test date range edge cases (same day, empty data)

- [ ] **Test thresholds**
  - [ ] Create threshold with various settings
  - [ ] Update threshold
  - [ ] Verify status updates in real-time
  - [ ] Test warning levels

- [ ] **Test overages**
  - [ ] Verify overage detection
  - [ ] Test approval workflow (admin)
  - [ ] Test dispute flow (brand)

- [ ] **Test forecasting**
  - [ ] Generate forecast with sufficient data
  - [ ] Test with insufficient data (< 7 days)
  - [ ] Verify threshold breach predictions

---

## Component Examples

### Example: Complete License Usage Dashboard

```typescript
// pages/licenses/[licenseId]/usage-dashboard.tsx
import { useState } from 'react';
import { startOfMonth, endOfDay } from 'date-fns';
import { trpc } from '@/lib/trpc';

export default function LicenseUsageDashboard({ licenseId }: { licenseId: string }) {
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfDay(new Date()),
  });

  const { data: analytics, isLoading: analyticsLoading } = trpc.usage.getAnalytics.useQuery({
    licenseId,
    startDate: dateRange.start,
    endDate: dateRange.end,
    granularity: 'daily',
    compareWithPreviousPeriod: true,
  });

  const { data: thresholdStatuses } = trpc.usage.getThresholdStatus.useQuery({ licenseId });
  const { data: forecasts } = trpc.usage.getForecasts.useQuery({ licenseId, limit: 5 });
  const { data: overages } = trpc.usage.getOverages.useQuery({ licenseId, limit: 10 });

  if (analyticsLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Usage Analytics</h1>
        <p className="text-gray-600">Monitor and manage license usage</p>
      </header>

      {/* Alerts */}
      <UsageAlerts licenseId={licenseId} />

      {/* Date Range Picker */}
      <DateRangePicker value={dateRange} onChange={setDateRange} />

      {/* Metrics Overview */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Usage Metrics</h2>
        <UsageMetricsCard metrics={analytics.currentPeriod} />
        {analytics.percentageChange && (
          <PercentageChangeIndicator changes={analytics.percentageChange} />
        )}
      </section>

      {/* Threshold Status */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Usage Thresholds</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {thresholdStatuses?.map((status) => (
            <ThresholdStatusItem key={status.threshold.id} status={status} />
          ))}
        </div>
      </section>

      {/* Trends Chart */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Usage Trends</h2>
        <UsageTrendsChart trends={analytics.trends} />
      </section>

      {/* Top Sources & Platforms */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopSourcesCard sources={analytics.topSources} />
        <TopPlatformsCard platforms={analytics.topPlatforms} />
      </section>

      {/* Forecasts */}
      {forecasts && forecasts.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Usage Forecasts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forecasts.map((forecast) => (
              <ForecastCard key={forecast.id} forecast={forecast} />
            ))}
          </div>
        </section>
      )}

      {/* Overages */}
      {overages && overages.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Usage Overages</h2>
          <OverageList overages={overages} />
        </section>
      )}
    </div>
  );
}
```

---

## API Client Setup

### tRPC Configuration

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../yg-backend/src/lib/trpc'; // Backend router type

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`,
        headers: () => {
          const token = getAuthToken(); // Your auth logic
          return {
            authorization: token ? `Bearer ${token}` : undefined,
          };
        },
      }),
    ],
  });
}
```

---

## State Management Patterns

### React Query Integration

```typescript
// hooks/useUsageTracking.ts
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';

export function useUsageTracking() {
  const queryClient = useQueryClient();
  const trackEvent = trpc.usage.trackEvent.useMutation({
    onSuccess: () => {
      // Invalidate analytics queries to refetch
      queryClient.invalidateQueries(['usage', 'getAnalytics']);
      queryClient.invalidateQueries(['usage', 'getCurrentUsage']);
    },
  });

  return { trackEvent };
}
```

### Optimistic Updates

```typescript
// Example: Optimistic threshold creation
const createThreshold = trpc.usage.createThreshold.useMutation({
  onMutate: async (newThreshold) => {
    // Cancel ongoing queries
    await queryClient.cancelQueries(['usage', 'getThresholdStatus']);

    // Snapshot previous value
    const previousStatuses = queryClient.getQueryData(['usage', 'getThresholdStatus', { licenseId }]);

    // Optimistically update
    queryClient.setQueryData(['usage', 'getThresholdStatus', { licenseId }], (old: any) => [
      ...(old || []),
      { threshold: newThreshold, currentUsage: 0, /* ... */ },
    ]);

    return { previousStatuses };
  },
  onError: (err, newThreshold, context) => {
    // Rollback on error
    queryClient.setQueryData(
      ['usage', 'getThresholdStatus', { licenseId }],
      context?.previousStatuses
    );
  },
  onSettled: () => {
    // Refetch after mutation
    queryClient.invalidateQueries(['usage', 'getThresholdStatus']);
  },
});
```

---

## Real-time Updates

### Polling Strategy

For near-real-time updates without WebSockets:

```typescript
const { data: thresholdStatus } = trpc.usage.getThresholdStatus.useQuery(
  { licenseId },
  {
    refetchInterval: 60000, // Poll every 60 seconds
    refetchIntervalInBackground: false, // Only when tab is active
  }
);
```

### Future: WebSocket Integration

When backend adds WebSocket support:

```typescript
// hooks/useUsageWebSocket.ts
import { useEffect } from 'react';
import { io } from 'socket.io-client';

export function useUsageWebSocket(licenseId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL);

    socket.emit('subscribe', { topic: `usage:${licenseId}` });

    socket.on('usage:updated', (data) => {
      queryClient.invalidateQueries(['usage', 'getAnalytics', { licenseId }]);
      queryClient.invalidateQueries(['usage', 'getThresholdStatus', { licenseId }]);
    });

    return () => {
      socket.emit('unsubscribe', { topic: `usage:${licenseId}` });
      socket.disconnect();
    };
  }, [licenseId]);
}
```

---

## Testing Considerations

### Unit Tests

```typescript
// __tests__/components/ThresholdStatusCard.test.tsx
import { render, screen } from '@testing-library/react';
import { ThresholdStatusCard } from '@/components/ThresholdStatusCard';

const mockStatus: ThresholdStatus = {
  threshold: { /* ... */ },
  currentUsage: 9200,
  limit: 10000,
  limitWithGrace: 11000,
  percentageUsed: 92.0,
  remaining: 800,
  isWarningLevel: true,
  isOverLimit: false,
};

test('displays threshold status correctly', () => {
  render(<ThresholdStatusCard status={mockStatus} />);
  
  expect(screen.getByText('92.0%')).toBeInTheDocument();
  expect(screen.getByText(/9,200 \/ 10,000/)).toBeInTheDocument();
  expect(screen.getByText(/Remaining: 800 units/)).toBeInTheDocument();
});
```

### Integration Tests

```typescript
// __tests__/integration/usage-tracking.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { trpc } from '@/lib/trpc';
import { wrapper } from '@/test-utils';

test('tracks usage event', async () => {
  const { result } = renderHook(() => trpc.usage.trackEvent.useMutation(), { wrapper });

  result.current.mutate({
    licenseId: 'test-license-id',
    usageType: 'view',
    quantity: 1,
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.tracked).toBe(true);
});
```

---

## UX Recommendations

### 1. **Non-Intrusive Tracking**
- Never block user actions due to tracking failures
- Show subtle success/error toasts only when necessary
- Track in background without UI feedback for routine events

### 2. **Progressive Disclosure**
- Show summary metrics by default
- Expand to detailed analytics on user request
- Use tabs or accordions for different data views

### 3. **Visual Hierarchy**
- Use color-coded alerts:
  - 🟢 Green: < 75% usage (safe)
  - 🟡 Yellow: 75-90% (warning)
  - 🟠 Orange: 90-100% (caution)
  - 🔴 Red: > 100% (critical)

### 4. **Actionable Insights**
- Don't just show data, provide recommendations:
  - "Usage is high. Consider increasing your limit."
  - "Threshold will be exceeded in 5 days. Take action now."
  - "Download usage is low. Promote your asset more."

### 5. **Mobile-Friendly**
- Ensure charts are responsive
- Use horizontal scrolling for tables on mobile
- Prioritize key metrics on small screens

### 6. **Loading States**
- Show skeletons for cards while loading
- Use spinners for chart data
- Never show blank screens

### 7. **Empty States**
- "No usage data yet. Start using your license to see analytics."
- "No thresholds configured. Set up limits to track usage."
- Provide clear calls-to-action

### 8. **Error Recovery**
- Show retry buttons for failed queries
- Provide helpful error messages
- Offer support contact for persistent issues

---

**End of Implementation Guide**

For questions or issues, refer to:
- [Part 1: API Endpoints](./USAGE_TRACKING_INTEGRATION_GUIDE_PART_1_API_ENDPOINTS.md)
- [Part 2: Types & Business Logic](./USAGE_TRACKING_INTEGRATION_GUIDE_PART_2_TYPES_AND_LOGIC.md)
- Backend documentation: `/src/modules/licenses/usage/README.md`
