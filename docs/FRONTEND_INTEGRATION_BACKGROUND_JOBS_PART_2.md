# Frontend Integration Guide: Background Jobs - Part 2

**Module:** Phase 9 - Background Jobs  
**Classification:** 🔒 ADMIN ONLY (Monitoring, Analytics, Job Management)  
**Last Updated:** October 18, 2025  
**Version:** 1.0

---

## Table of Contents (Part 2)

1. [Analytics Aggregation Jobs](#analytics-aggregation-jobs)
2. [Search Index Update Jobs](#search-index-update-jobs)
3. [File Preview Generation Jobs](#file-preview-generation-jobs)
4. [Admin Job Monitoring](#admin-job-monitoring)
5. [Error Handling & Status Codes](#error-handling--status-codes)

---

## Analytics Aggregation Jobs

### Classification: 🔒 ADMIN ONLY

Background jobs automatically aggregate analytics data at multiple time intervals:

- **Event Enrichment** - Real-time enrichment of analytics events
- **Daily Aggregation** - Runs automatically after hourly aggregation
- **Weekly Rollup** - Every Monday at 4 AM UTC
- **Monthly Rollup** - 2nd of each month at 5 AM UTC

### How It Works

1. Analytics events are captured throughout the day
2. Event enrichment job adds context (user info, geo data, device type)
3. Daily aggregation job summarizes events into daily metrics
4. Weekly/monthly rollup jobs aggregate daily metrics into higher-level summaries
5. All job execution is logged in `MetricsAggregationJobsLog` table

### No Direct Frontend Interaction

Analytics aggregation happens **automatically in the background**. The frontend:

- ✅ **DOES** consume aggregated metrics via Analytics API endpoints
- ❌ **DOES NOT** trigger aggregation jobs directly
- ✅ **DOES** display job logs to admins (monitoring only)

### Related API Endpoints (Consuming Aggregated Data)

These endpoints return **pre-aggregated data** from the background jobs:

```http
GET /api/analytics/platform/overview
GET /api/analytics/platform/assets
GET /api/analytics/platform/projects
GET /api/analytics/brand/:brandId
GET /api/analytics/creator/:creatorId
```

**Note:** These are separate from the Background Jobs module. See `CONTENT_ANALYTICS_API_IMPLEMENTATION.md` for details.

### TypeScript Types

```typescript
/**
 * Aggregation job status
 */
export enum AggregationJobStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL', // Completed with some errors
}

/**
 * Aggregation job log entry
 */
export interface MetricsAggregationJobLog {
  id: string;
  jobType: string; // 'daily' | 'weekly' | 'monthly' | 'hourly'
  periodStartDate: string; // ISO 8601 date
  periodEndDate: string; // ISO 8601 date
  startedAt: string; // ISO 8601 timestamp
  completedAt: string | null; // ISO 8601 timestamp
  status: AggregationJobStatus;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errorsCount: number;
  durationSeconds: number | null; // Decimal
  memoryUsedMb: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  metadata: Record<string, any>;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Aggregation job log list response
 */
export interface AggregationJobLogListResponse {
  success: boolean;
  data: MetricsAggregationJobLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

---

## Search Index Update Jobs

### Classification: ⚡ HYBRID

Search index updates happen automatically when content changes. This is **transparent to end users** but **monitored by admins**.

### How It Works

1. **Real-time Updates**: When content is created/updated/deleted, backend enqueues a search index update job
2. **Bulk Updates**: Batch operations (bulk imports) use bulk index update jobs
3. **Full Reindex**: Weekly full reindex on Sundays at 3 AM UTC ensures consistency

### Searchable Entities

- `asset` - IP Assets (title, description, tags)
- `creator` - Creator profiles (stageName, bio, specialties)
- `project` - Projects (title, description)
- `license` - Licenses
- `blog_post` - Blog posts (title, excerpt, content)

### PostgreSQL Full-Text Search

YesGoddess uses **PostgreSQL full-text search** with `tsvector` columns and GIN indexes, not external search engines like Elasticsearch. The job's role is to ensure the database triggers and indexes are up-to-date.

### No Direct Frontend Interaction

Search indexing is **completely automatic**:

- ✅ **DOES** happen when users create/update content
- ❌ **DOES NOT** require frontend to trigger anything
- ✅ **DOES** provide search API for querying indexed content

### Search API Endpoints (Frontend Uses These)

```http
GET /api/search/unified
GET /api/search/assets
GET /api/search/creators
GET /api/search/projects
```

**Note:** See `SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md` for search API details.

### Admin Monitoring Only 🔒

Admins can view search index job statistics:

```http
GET /api/admin/jobs/search-index/stats
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: {
    realtime: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    bulk: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    reindex: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
}
```

### TypeScript Types

```typescript
/**
 * Search index job statistics
 */
export interface SearchIndexStats {
  realtime: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  bulk: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  reindex: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

/**
 * Search index stats response
 */
export interface SearchIndexStatsResponse {
  success: boolean;
  data: SearchIndexStats;
}
```

---

## File Preview Generation Jobs

### Classification: 🔒 ADMIN ONLY

Automatically generates preview clips for uploaded media:

- **Video**: 10-second preview clips (1280x720, 1000k bitrate)
- **Audio**: 30-second preview clips (128k bitrate, MP3)

### How It Works

1. User uploads video/audio asset
2. After virus scan and thumbnail generation complete, preview job is enqueued
3. Worker downloads original file, generates preview, uploads to storage
4. Asset record updated with `previewUrl`

### Automatic Triggering

Preview generation is **automatically triggered** by the backend after:

1. ✅ Virus scan passes (`scanStatus = CLEAN`)
2. ✅ Thumbnail generation completes

**Frontend does not trigger this directly.**

### Asset Status Tracking

The frontend can check if preview generation is complete:

```typescript
interface IpAsset {
  id: string;
  // ... other fields
  previewUrl: string | null; // null if not generated yet
  metadata: {
    previewGenerated?: boolean;
    previewGeneratedAt?: string; // ISO 8601
    previewError?: string; // Error message if generation failed
    previewLastAttempt?: string; // ISO 8601
    previewSize?: number; // File size in bytes
    previewDuration?: number; // Duration in seconds (10 or 30)
  } | null;
}
```

### Displaying Preview Status

```typescript
function AssetPreviewStatus({ asset }: { asset: IpAsset }) {
  if (asset.type !== 'VIDEO' && asset.type !== 'AUDIO') {
    return null; // Only for video/audio
  }

  if (asset.previewUrl) {
    return (
      <div className="preview-ready">
        <span>✅ Preview ready</span>
        <video src={asset.previewUrl} controls />
      </div>
    );
  }

  if (asset.metadata?.previewError) {
    return (
      <div className="preview-error">
        <span>❌ Preview generation failed</span>
        <p>{asset.metadata.previewError}</p>
      </div>
    );
  }

  if (asset.metadata?.previewGenerated === false) {
    return (
      <div className="preview-pending">
        <span>⏳ Generating preview...</span>
      </div>
    );
  }

  return null;
}
```

### TypeScript Types

```typescript
/**
 * Asset type enum
 */
export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  THREE_D = 'THREE_D',
  OTHER = 'OTHER',
}

/**
 * Asset preview metadata
 */
export interface AssetPreviewMetadata {
  previewGenerated?: boolean;
  previewGeneratedAt?: string; // ISO 8601
  previewError?: string;
  previewLastAttempt?: string; // ISO 8601
  previewSize?: number; // Bytes
  previewDuration?: number; // Seconds
}
```

---

## Admin Job Monitoring

### Classification: 🔒 ADMIN ONLY

Admins can monitor all background job queues and view execution logs.

### API Endpoints

#### 1. Get All Workers Health

```http
GET /api/admin/jobs/health
```

**Response (200 OK):**

```typescript
{
  success: boolean;
  data: {
    healthy: boolean; // True if all workers are healthy
    email: {
      healthy: boolean;
      workers: {
        [workerName: string]: {
          isRunning: boolean;
          error?: string;
        };
      };
    };
    blog: {
      healthy: boolean;
      scheduledJobs: number;
    };
    // Add more worker groups as needed
  };
}
```

**Authorization Required:**

```typescript
// Only users with role 'ADMIN' can access
headers: {
  'Authorization': 'Bearer <JWT_TOKEN>',
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 403 | `Forbidden` | User is not an admin |
| 500 | `Internal server error` | Server error |

#### 2. Get Aggregation Job Logs

```http
GET /api/admin/jobs/aggregation/logs
```

**Query Parameters:**

```typescript
{
  page?: number;          // Default: 1
  pageSize?: number;      // Default: 50
  jobType?: string;       // Filter by job type: 'daily' | 'weekly' | 'monthly'
  status?: AggregationJobStatus; // Filter by status
  startDate?: string;     // ISO 8601 date, filter by periodStartDate >= startDate
  endDate?: string;       // ISO 8601 date, filter by periodEndDate <= endDate
}
```

**Response (200 OK):**

```typescript
{
  success: boolean;
  data: MetricsAggregationJobLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

**Example with React Query:**

```typescript
function useAggregationJobLogs(filters: {
  page?: number;
  pageSize?: number;
  jobType?: string;
  status?: AggregationJobStatus;
  startDate?: string;
  endDate?: string;
} = {}) {
  return useQuery({
    queryKey: ['aggregation-logs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.pageSize) params.append('pageSize', filters.pageSize.toString());
      if (filters.jobType) params.append('jobType', filters.jobType);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`/api/admin/jobs/aggregation/logs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch aggregation logs');
      }

      return response.json();
    },
    enabled: isAdmin(), // Only fetch if user is admin
  });
}

// Usage in admin dashboard
function AggregationJobLogsTable() {
  const [filters, setFilters] = useState({
    page: 1,
    jobType: '',
    status: '',
  });

  const { data, isLoading, error } = useAggregationJobLogs(filters);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading logs</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Job Type</th>
          <th>Period</th>
          <th>Status</th>
          <th>Records Processed</th>
          <th>Duration (s)</th>
          <th>Started At</th>
        </tr>
      </thead>
      <tbody>
        {data?.data?.map((log: MetricsAggregationJobLog) => (
          <tr key={log.id}>
            <td>{log.jobType}</td>
            <td>
              {log.periodStartDate} to {log.periodEndDate}
            </td>
            <td>
              <span className={`status-badge ${log.status.toLowerCase()}`}>
                {log.status}
              </span>
            </td>
            <td>{log.recordsProcessed}</td>
            <td>{log.durationSeconds?.toFixed(2)}</td>
            <td>{new Date(log.startedAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

#### 3. Get Search Index Job Stats

```http
GET /api/admin/jobs/search-index/stats
```

**Response (200 OK):**

See [Search Index Stats Response](#search-index-update-jobs) above.

#### 4. Get Notification Delivery Job Stats

```http
GET /api/admin/jobs/notifications/stats
```

**Response (200 OK):**

```typescript
{
  success: boolean;
  data: {
    delivery: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    digest: {
      lastDailyRun?: string; // ISO 8601 timestamp
      lastWeeklyRun?: string; // ISO 8601 timestamp
      nextDailyRun?: string; // ISO 8601 timestamp
      nextWeeklyRun?: string; // ISO 8601 timestamp
    };
  };
}
```

#### 5. Retry Failed Job

```http
POST /api/admin/jobs/:queueName/:jobId/retry
```

**Path Parameters:**

```typescript
{
  queueName: string; // e.g., 'notification-delivery', 'search-index-update'
  jobId: string;     // Job ID
}
```

**Response (200 OK):**

```typescript
{
  success: boolean;
  data: {
    jobId: string;
    status: string; // 'retried'
  };
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 403 | `Forbidden` | User is not an admin |
| 404 | `Job not found` | Job doesn't exist |
| 400 | `Cannot retry job` | Job is not in a failed state |
| 500 | `Internal server error` | Server error |

### TypeScript Types for Admin Monitoring

```typescript
/**
 * Worker health status
 */
export interface WorkerHealth {
  healthy: boolean;
  workers?: {
    [workerName: string]: {
      isRunning: boolean;
      error?: string;
    };
  };
  scheduledJobs?: number;
}

/**
 * All workers health response
 */
export interface AllWorkersHealthResponse {
  success: boolean;
  data: {
    healthy: boolean;
    email: WorkerHealth;
    blog: WorkerHealth;
    // Add more as needed
  };
}

/**
 * Notification job stats
 */
export interface NotificationJobStats {
  delivery: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  digest: {
    lastDailyRun?: string;
    lastWeeklyRun?: string;
    nextDailyRun?: string;
    nextWeeklyRun?: string;
  };
}

/**
 * Retry job response
 */
export interface RetryJobResponse {
  success: boolean;
  data: {
    jobId: string;
    status: string;
  };
}
```

---

## Error Handling & Status Codes

### Common Error Responses

All API endpoints follow this error response format:

```typescript
{
  success: false;
  error: string; // Error message
  details?: any; // Optional: Additional error details (e.g., validation errors)
}
```

### HTTP Status Codes

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| 200 | OK | Request succeeded |
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | User not authenticated |
| 403 | Forbidden | User authenticated but lacks permission |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Service temporarily unavailable (e.g., Redis down) |

### Notification API Errors

#### 400 Bad Request

```typescript
{
  success: false;
  error: 'Invalid query parameters';
  details: [
    {
      code: 'invalid_type';
      expected: 'number';
      received: 'string';
      path: ['page'];
      message: 'Expected number, received string';
    }
  ];
}
```

**Frontend Handling:**

```typescript
try {
  const response = await fetch('/api/notifications?page=invalid');
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 400) {
      // Show validation errors to user
      showValidationErrors(data.details);
    }
  }
} catch (error) {
  // Network error
  showNetworkError();
}
```

#### 401 Unauthorized

```typescript
{
  success: false;
  error: 'Unauthorized';
}
```

**Frontend Handling:**

```typescript
if (response.status === 401) {
  // Redirect to login
  redirectToLogin();
}
```

#### 404 Not Found

```typescript
{
  success: false;
  error: 'Notification not found';
}
```

**Frontend Handling:**

```typescript
if (response.status === 404) {
  // Show "notification not found" message
  showErrorMessage('This notification no longer exists');
}
```

#### 429 Too Many Requests

```typescript
{
  success: false;
  error: 'Too many requests. Please try again later.';
}
```

**Headers:**

```
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1697654400
```

**Frontend Handling:**

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  showErrorMessage(`Too many requests. Please try again in ${retryAfter} seconds.`);
  
  // Optionally, disable button and re-enable after retry period
  setTimeout(() => {
    enableButton();
  }, parseInt(retryAfter) * 1000);
}
```

#### 500 Internal Server Error

```typescript
{
  success: false;
  error: 'Internal server error';
}
```

**Frontend Handling:**

```typescript
if (response.status === 500) {
  // Show generic error message
  showErrorMessage('Something went wrong. Please try again later.');
  
  // Log error for debugging
  logError({
    endpoint: '/api/notifications',
    status: 500,
    timestamp: new Date().toISOString(),
  });
}
```

### Admin API Errors

#### 403 Forbidden

```typescript
{
  success: false;
  error: 'Forbidden: Admin access required';
}
```

**Frontend Handling:**

```typescript
if (response.status === 403) {
  // Redirect to home or show access denied message
  showAccessDeniedMessage();
}
```

### Error Handling Best Practices

1. **Always check `response.ok` before parsing JSON**

```typescript
const response = await fetch('/api/notifications');

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error);
}

const data = await response.json();
```

2. **Use React Query's error handling**

```typescript
const { data, error, isError } = useQuery({
  queryKey: ['notifications'],
  queryFn: fetchNotifications,
  retry: (failureCount, error) => {
    // Don't retry on 4xx errors
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
    // Retry up to 3 times on 5xx errors
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});

if (isError) {
  return <ErrorMessage error={error} />;
}
```

3. **Display user-friendly error messages**

```typescript
function getErrorMessage(error: any): string {
  if (error.status === 401) {
    return 'Please log in to view notifications.';
  }
  
  if (error.status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  
  if (error.status >= 500) {
    return 'Our servers are experiencing issues. Please try again later.';
  }
  
  return error.message || 'An error occurred. Please try again.';
}
```

4. **Log errors for debugging**

```typescript
async function fetchNotifications() {
  try {
    const response = await fetch('/api/notifications');
    
    if (!response.ok) {
      const error = await response.json();
      
      // Log error to monitoring service (e.g., Sentry)
      logError({
        message: error.error,
        status: response.status,
        endpoint: '/api/notifications',
        timestamp: new Date().toISOString(),
      });
      
      throw new Error(error.error);
    }
    
    return await response.json();
  } catch (error) {
    // Log network errors
    logError({
      message: error.message,
      type: 'network',
      endpoint: '/api/notifications',
      timestamp: new Date().toISOString(),
    });
    
    throw error;
  }
}
```

---

**Continue to [Part 3](./FRONTEND_INTEGRATION_BACKGROUND_JOBS_PART_3.md) for Rate Limiting, Authorization, Real-time Updates, and Implementation Checklist.**
