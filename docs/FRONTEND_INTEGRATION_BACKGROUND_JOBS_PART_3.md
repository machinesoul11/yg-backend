# Frontend Integration Guide: Background Jobs - Part 3

**Module:** Phase 9 - Background Jobs  
**Classification:** Mixed (User-facing + Admin)  
**Last Updated:** October 18, 2025  
**Version:** 1.0

---

## Table of Contents (Part 3)

1. [Rate Limiting & Quotas](#rate-limiting--quotas)
2. [Authorization & Permissions](#authorization--permissions)
3. [Real-time Updates & Polling](#real-time-updates--polling)
4. [Frontend Implementation Checklist](#frontend-implementation-checklist)
5. [Complete API Client Example](#complete-api-client-example)

---

## Rate Limiting & Quotas

### Rate Limits by Endpoint

| Endpoint | Rate Limit | Window | Scope |
|----------|------------|--------|-------|
| `GET /api/notifications` | 100 requests | 1 minute | Per user |
| `GET /api/notifications/unread-count` | 200 requests | 1 minute | Per user |
| `POST /api/notifications/:id/read` | 100 requests | 1 minute | Per user |
| `POST /api/notifications/read-all` | 10 requests | 1 minute | Per user |
| `GET /api/notifications/preferences` | 50 requests | 1 minute | Per user |
| `PATCH /api/notifications/preferences` | 10 requests | 1 minute | Per user |
| `GET /api/admin/jobs/*` | 100 requests | 1 minute | Per admin user |

### Rate Limit Headers

All responses include rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697654400
```

**TypeScript Interface:**

```typescript
interface RateLimitHeaders {
  limit: number;          // Maximum requests allowed in window
  remaining: number;      // Requests remaining in current window
  reset: number;          // Unix timestamp when window resets
}

/**
 * Parse rate limit headers from response
 */
function parseRateLimitHeaders(response: Response): RateLimitHeaders {
  return {
    limit: parseInt(response.headers.get('X-RateLimit-Limit') || '0'),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
    reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0'),
  };
}
```

### Handling Rate Limit Exceeded (429)

When rate limit is exceeded:

```typescript
{
  success: false;
  error: 'Too many requests. Please try again later.';
}
```

**Response Headers:**

```http
Retry-After: 60  // Seconds to wait before retrying
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1697654460
```

**Frontend Implementation:**

```typescript
async function fetchWithRateLimit<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);

  // Check rate limit headers
  const rateLimit = parseRateLimitHeaders(response);
  
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
    
    // Show warning to user
    showRateLimitWarning(retryAfter);
    
    // Throw error with retry info
    throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
  }

  // Warn user when approaching rate limit (< 10% remaining)
  if (rateLimit.remaining < rateLimit.limit * 0.1) {
    showRateLimitWarning(
      Math.floor((rateLimit.reset - Date.now() / 1000) / 60)
    );
  }

  if (!response.ok) {
    throw new Error('Request failed');
  }

  return await response.json();
}
```

### Display Rate Limit Info to Users

```typescript
function RateLimitWarning({ rateLimit }: { rateLimit: RateLimitHeaders }) {
  const resetDate = new Date(rateLimit.reset * 1000);
  const minutesUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 60000);

  if (rateLimit.remaining === 0) {
    return (
      <div className="alert alert-warning">
        You've reached the request limit. Try again in {minutesUntilReset} minute(s).
      </div>
    );
  }

  if (rateLimit.remaining < 10) {
    return (
      <div className="alert alert-info">
        You have {rateLimit.remaining} requests remaining. Limit resets in {minutesUntilReset} minute(s).
      </div>
    );
  }

  return null;
}
```

---

## Authorization & Permissions

### User Roles

```typescript
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}
```

### Permission Matrix

| Endpoint | ADMIN | CREATOR | BRAND | VIEWER |
|----------|-------|---------|-------|--------|
| `GET /api/notifications` | ✅ | ✅ | ✅ | ✅ |
| `POST /api/notifications/:id/read` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/notifications/preferences` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /api/notifications/preferences` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/admin/jobs/*` | ✅ | ❌ | ❌ | ❌ |
| `POST /api/admin/jobs/:queueName/:jobId/retry` | ✅ | ❌ | ❌ | ❌ |

### Authentication

All endpoints require authentication via session cookies or JWT tokens.

**Session-based (Cookie):**

```typescript
fetch('/api/notifications', {
  credentials: 'include', // Include cookies
});
```

**Token-based (JWT):**

```typescript
fetch('/api/notifications', {
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
  },
});
```

### Checking User Role

```typescript
/**
 * Get current user from session
 */
async function getCurrentUser(): Promise<User | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.user;
}

/**
 * Check if user has admin role
 */
function isAdmin(user: User | null): boolean {
  return user?.role === UserRole.ADMIN;
}

/**
 * Check if user can access admin features
 */
function canAccessAdmin(user: User | null): boolean {
  return isAdmin(user);
}
```

### Conditional Rendering Based on Role

```typescript
function NotificationSettings() {
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });

  return (
    <div>
      <h2>Notification Settings</h2>
      
      {/* All users can see this */}
      <NotificationPreferencesForm />
      
      {/* Only admins can see this */}
      {canAccessAdmin(user) && (
        <AdminJobMonitoringPanel />
      )}
    </div>
  );
}
```

### Handling 403 Forbidden Errors

```typescript
async function fetchAdminData() {
  const response = await fetch('/api/admin/jobs/health', {
    credentials: 'include',
  });

  if (response.status === 403) {
    // User is authenticated but not authorized
    throw new Error('You do not have permission to access this resource.');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch admin data');
  }

  return await response.json();
}

// In component
function AdminDashboard() {
  const { data, error, isError } = useQuery({
    queryKey: ['admin-jobs-health'],
    queryFn: fetchAdminData,
  });

  if (isError) {
    if (error.message.includes('permission')) {
      return (
        <div className="access-denied">
          <h2>Access Denied</h2>
          <p>You do not have permission to view this page.</p>
          <Link to="/">Go to Home</Link>
        </div>
      );
    }

    return <ErrorMessage error={error} />;
  }

  return <div>{/* Admin dashboard content */}</div>;
}
```

---

## Real-time Updates & Polling

Background jobs work asynchronously. The frontend needs to poll or use real-time updates to see results.

### Notification Polling Strategy

#### Recommended Approach: Polling with React Query

```typescript
import { useQuery } from '@tanstack/react-query';

function useNotificationPolling() {
  return useQuery({
    queryKey: ['notifications-poll'],
    queryFn: async () => {
      const response = await fetch('/api/notifications?page=1&pageSize=20', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      return response.json();
    },
    // Poll every 30 seconds
    refetchInterval: 30000,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
    // Refetch on window focus
    refetchOnWindowFocus: true,
    // Refetch on reconnect
    refetchOnReconnect: true,
  });
}
```

#### Optimized Polling (Only When Needed)

```typescript
function useSmartNotificationPolling() {
  const [isTabActive, setIsTabActive] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return useQuery({
    queryKey: ['notifications-poll'],
    queryFn: fetchNotifications,
    // Only poll when tab is active
    refetchInterval: isTabActive ? 30000 : false,
    // Refetch immediately when tab becomes active
    refetchOnWindowFocus: true,
  });
}
```

#### Exponential Backoff on Errors

```typescript
function useNotificationPollingWithBackoff() {
  const [retryDelay, setRetryDelay] = useState(30000); // Start at 30 seconds

  return useQuery({
    queryKey: ['notifications-poll'],
    queryFn: fetchNotifications,
    refetchInterval: retryDelay,
    onError: () => {
      // Double the delay on error, up to 5 minutes
      setRetryDelay((prev) => Math.min(prev * 2, 300000));
    },
    onSuccess: () => {
      // Reset delay on success
      setRetryDelay(30000);
    },
  });
}
```

### Unread Count Badge with Polling

```typescript
function NotificationBadge() {
  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const response = await fetch('/api/notifications/unread-count', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      return response.json();
    },
    // Poll every 30 seconds
    refetchInterval: 30000,
    // Refetch on window focus
    refetchOnWindowFocus: true,
  });

  const count = data?.data?.count || 0;

  if (count === 0) return null;

  return (
    <span className="notification-badge">
      {count > 99 ? '99+' : count}
    </span>
  );
}
```

### Manual Refresh

```typescript
function NotificationsList() {
  const queryClient = useQueryClient();
  const { data, isLoading, isRefetching } = useNotificationPolling();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-poll'] });
  };

  return (
    <div>
      <button onClick={handleRefresh} disabled={isRefetching}>
        {isRefetching ? 'Refreshing...' : 'Refresh'}
      </button>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <NotificationList notifications={data?.data || []} />
      )}
    </div>
  );
}
```

### WebSocket Alternative (Not Currently Implemented)

> **Note:** YesGoddess backend currently uses polling, not WebSockets. This is a future enhancement.

If WebSockets are implemented in the future:

```typescript
// Future implementation
function useNotificationWebSocket() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const ws = new WebSocket('wss://ops.yesgoddess.agency/ws/notifications');

    ws.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      setNotifications((prev) => [notification, ...prev]);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Fall back to polling
    };

    return () => {
      ws.close();
    };
  }, []);

  return notifications;
}
```

---

## Frontend Implementation Checklist

### Phase 1: Notification System (All Users)

- [ ] **API Client Setup**
  - [ ] Create API client service with authentication
  - [ ] Implement error handling and retry logic
  - [ ] Add rate limit detection and handling

- [ ] **Notification List**
  - [ ] Implement notification list component
  - [ ] Add pagination controls
  - [ ] Implement filtering by type, priority, read status
  - [ ] Add sorting (newest first, by priority)
  - [ ] Show loading and error states

- [ ] **Notification Display**
  - [ ] Display notification type icon
  - [ ] Show priority badge with color
  - [ ] Format timestamp as relative time
  - [ ] Show read/unread indicator
  - [ ] Make notification clickable (navigate to actionUrl)

- [ ] **Mark as Read**
  - [ ] Implement mark single notification as read
  - [ ] Implement mark all as read
  - [ ] Auto-mark as read on click (optional)
  - [ ] Update UI optimistically
  - [ ] Handle errors gracefully

- [ ] **Unread Count Badge**
  - [ ] Display badge in header/navbar
  - [ ] Update badge on new notifications
  - [ ] Poll every 30 seconds
  - [ ] Show 99+ for counts > 99

- [ ] **Notification Preferences**
  - [ ] Create preferences form
  - [ ] Enable/disable notification types
  - [ ] Select digest frequency
  - [ ] Toggle email notifications
  - [ ] Save preferences with validation
  - [ ] Show success/error messages

- [ ] **Real-time Updates**
  - [ ] Implement polling with React Query
  - [ ] Only poll when tab is active
  - [ ] Refetch on window focus
  - [ ] Handle polling errors with backoff

### Phase 2: Admin Monitoring (Admin Only)

- [ ] **Role-based Access**
  - [ ] Check user role before rendering admin UI
  - [ ] Redirect non-admins to 404 or home
  - [ ] Handle 403 Forbidden errors

- [ ] **Job Health Dashboard**
  - [ ] Display overall worker health status
  - [ ] Show individual worker statuses
  - [ ] Highlight unhealthy workers
  - [ ] Refresh button with loading state

- [ ] **Aggregation Job Logs**
  - [ ] Create job logs table
  - [ ] Filter by job type, status, date range
  - [ ] Paginate logs
  - [ ] Show job duration, records processed, errors
  - [ ] Expand row to show error details

- [ ] **Search Index Job Stats**
  - [ ] Display queue counts (waiting, active, completed, failed)
  - [ ] Show real-time, bulk, and reindex stats
  - [ ] Refresh stats automatically

- [ ] **Notification Job Stats**
  - [ ] Display delivery queue stats
  - [ ] Show last and next digest run times
  - [ ] Highlight failed jobs

- [ ] **Retry Failed Jobs**
  - [ ] Add retry button on failed jobs
  - [ ] Confirm before retrying
  - [ ] Show success/error message
  - [ ] Refresh list after retry

### Phase 3: Testing & Edge Cases

- [ ] **Error Scenarios**
  - [ ] Test 401 Unauthorized (redirect to login)
  - [ ] Test 403 Forbidden (show access denied)
  - [ ] Test 404 Not Found (show not found message)
  - [ ] Test 429 Rate Limit (show rate limit warning)
  - [ ] Test 500 Server Error (show generic error)
  - [ ] Test network errors (show offline message)

- [ ] **Edge Cases**
  - [ ] Test with 0 notifications
  - [ ] Test with 1000+ notifications (pagination)
  - [ ] Test with very long notification messages
  - [ ] Test with missing actionUrl
  - [ ] Test rapid clicking (debounce actions)
  - [ ] Test concurrent updates (optimistic UI)

- [ ] **Performance**
  - [ ] Lazy load notification list
  - [ ] Virtualize long lists (react-window)
  - [ ] Debounce filter inputs
  - [ ] Cache API responses
  - [ ] Minimize re-renders

- [ ] **Accessibility**
  - [ ] Add ARIA labels to buttons
  - [ ] Ensure keyboard navigation works
  - [ ] Add screen reader announcements for new notifications
  - [ ] Test with screen reader (NVDA, JAWS, VoiceOver)
  - [ ] Ensure color contrast meets WCAG AA

- [ ] **Mobile Responsiveness**
  - [ ] Test on mobile devices
  - [ ] Adjust layout for small screens
  - [ ] Ensure touch targets are large enough
  - [ ] Test swipe gestures (optional)

---

## Complete API Client Example

Here's a complete, production-ready API client for the Background Jobs module:

```typescript
// src/lib/api/background-jobs.ts

import { QueryClient } from '@tanstack/react-query';

/**
 * Base API URL
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Parse rate limit headers from response
 */
function parseRateLimitHeaders(response: Response) {
  return {
    limit: parseInt(response.headers.get('X-RateLimit-Limit') || '0'),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
    reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0'),
  };
}

/**
 * Fetch wrapper with error handling
 */
async function fetchApi<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include', // Include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  // Check rate limit
  const rateLimit = parseRateLimitHeaders(response);
  if (rateLimit.remaining < rateLimit.limit * 0.1) {
    console.warn('Approaching rate limit:', rateLimit);
  }

  // Handle errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'Unknown error',
    }));

    throw new ApiError(
      error.error || 'Request failed',
      response.status,
      error.details
    );
  }

  return await response.json();
}

/**
 * Notification API
 */
export const notificationApi = {
  /**
   * List notifications
   */
  list: (params: {
    page?: number;
    pageSize?: number;
    read?: boolean;
    type?: NotificationType;
    priority?: NotificationPriority;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    if (params.read !== undefined) searchParams.append('read', params.read.toString());
    if (params.type) searchParams.append('type', params.type);
    if (params.priority) searchParams.append('priority', params.priority);

    return fetchApi<NotificationListResponse>(
      `/api/notifications?${searchParams.toString()}`
    );
  },

  /**
   * Get unread count
   */
  getUnreadCount: () => {
    return fetchApi<UnreadCountResponse>('/api/notifications/unread-count');
  },

  /**
   * Mark notification as read
   */
  markAsRead: (notificationId: string) => {
    return fetchApi<MarkReadResponse>(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: () => {
    return fetchApi<MarkAllReadResponse>('/api/notifications/read-all', {
      method: 'POST',
    });
  },

  /**
   * Delete notification
   */
  delete: (notificationId: string) => {
    return fetchApi<{ success: boolean }>(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get notification preferences
   */
  getPreferences: () => {
    return fetchApi<NotificationPreferencesResponse>(
      '/api/notifications/preferences'
    );
  },

  /**
   * Update notification preferences
   */
  updatePreferences: (updates: UpdateNotificationPreferencesRequest) => {
    return fetchApi<NotificationPreferencesResponse>(
      '/api/notifications/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  },
};

/**
 * Admin API (Admin only)
 */
export const adminJobsApi = {
  /**
   * Get all workers health
   */
  getWorkersHealth: () => {
    return fetchApi<AllWorkersHealthResponse>('/api/admin/jobs/health');
  },

  /**
   * Get aggregation job logs
   */
  getAggregationLogs: (params: {
    page?: number;
    pageSize?: number;
    jobType?: string;
    status?: AggregationJobStatus;
    startDate?: string;
    endDate?: string;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    if (params.jobType) searchParams.append('jobType', params.jobType);
    if (params.status) searchParams.append('status', params.status);
    if (params.startDate) searchParams.append('startDate', params.startDate);
    if (params.endDate) searchParams.append('endDate', params.endDate);

    return fetchApi<AggregationJobLogListResponse>(
      `/api/admin/jobs/aggregation/logs?${searchParams.toString()}`
    );
  },

  /**
   * Get search index job stats
   */
  getSearchIndexStats: () => {
    return fetchApi<SearchIndexStatsResponse>(
      '/api/admin/jobs/search-index/stats'
    );
  },

  /**
   * Get notification job stats
   */
  getNotificationJobStats: () => {
    return fetchApi<{
      success: boolean;
      data: NotificationJobStats;
    }>('/api/admin/jobs/notifications/stats');
  },

  /**
   * Retry failed job
   */
  retryJob: (queueName: string, jobId: string) => {
    return fetchApi<RetryJobResponse>(
      `/api/admin/jobs/${queueName}/${jobId}/retry`,
      {
        method: 'POST',
      }
    );
  },
};

/**
 * React Query hooks
 */
export const useNotifications = (params?: Parameters<typeof notificationApi.list>[0]) => {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => notificationApi.list(params),
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds
  });
};

export const useUnreadCount = () => {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: notificationApi.getUnreadCount,
    refetchInterval: 30000,
  });
};

export const useNotificationPreferences = () => {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: notificationApi.getPreferences,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
};

export const useUpdateNotificationPreferences = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationApi.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
};

// Admin hooks
export const useWorkersHealth = () => {
  return useQuery({
    queryKey: ['admin-workers-health'],
    queryFn: adminJobsApi.getWorkersHealth,
    refetchInterval: 60000, // Poll every minute
  });
};

export const useAggregationLogs = (params?: Parameters<typeof adminJobsApi.getAggregationLogs>[0]) => {
  return useQuery({
    queryKey: ['admin-aggregation-logs', params],
    queryFn: () => adminJobsApi.getAggregationLogs(params),
  });
};

export const useRetryJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ queueName, jobId }: { queueName: string; jobId: string }) =>
      adminJobsApi.retryJob(queueName, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-aggregation-logs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-workers-health'] });
    },
  });
};
```

---

## Summary

This comprehensive guide covers:

✅ **Part 1**: Notification Delivery & Digest Systems  
✅ **Part 2**: Analytics, Search Index, File Previews, Admin Monitoring  
✅ **Part 3**: Rate Limiting, Authorization, Real-time Updates, Implementation Checklist

### Quick Links

- [Part 1: Notifications & Digests](./FRONTEND_INTEGRATION_BACKGROUND_JOBS_PART_1.md)
- [Part 2: Analytics & Admin Monitoring](./FRONTEND_INTEGRATION_BACKGROUND_JOBS_PART_2.md)
- Part 3: This document

### Next Steps for Frontend Team

1. Review all three parts of this guide
2. Set up API client with authentication
3. Implement notification system first (Phase 1)
4. Add admin monitoring features (Phase 2)
5. Test thoroughly with all edge cases
6. Deploy and monitor in production

### Questions?

Contact the backend team for clarification on:

- API endpoint behavior
- Authentication flow
- Error handling specifics
- Rate limits and quotas
- WebSocket implementation (future)

---

**End of Frontend Integration Guide**
