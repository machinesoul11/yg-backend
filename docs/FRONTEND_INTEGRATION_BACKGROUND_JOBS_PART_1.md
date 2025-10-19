# Frontend Integration Guide: Background Jobs - Part 1

**Module:** Phase 9 - Background Jobs  
**Classification:** 🔒 ADMIN ONLY (Monitoring & Management) + ⚡ HYBRID (Notification delivery to all users)  
**Last Updated:** October 18, 2025  
**Version:** 1.0

---

## Table of Contents (Part 1)

1. [Overview](#overview)
2. [Architecture & Flow](#architecture--flow)
3. [Notification Delivery System](#notification-delivery-system)
4. [Notification Digest System](#notification-digest-system)
5. [TypeScript Type Definitions](#typescript-type-definitions)

---

## Overview

The Background Jobs module provides asynchronous job processing for critical platform operations:

1. **Notification Delivery** ⚡ HYBRID - Delivers in-app and email notifications to all users
2. **Notification Digests** 🌐 SHARED - Daily/weekly email digests for users who prefer batched notifications
3. **Analytics Aggregation** 🔒 ADMIN ONLY - Hourly, daily, weekly, monthly metrics rollups
4. **Search Index Updates** ⚡ HYBRID - Real-time search index maintenance (transparent to users, admin monitoring)
5. **File Preview Generation** 🔒 ADMIN ONLY - Video/audio preview clip generation

### Key Technologies

- **Job Queue:** BullMQ + Redis
- **Scheduling:** Cron patterns for recurring jobs
- **Retry Logic:** Exponential backoff with configurable attempts
- **Monitoring:** Queue stats, job logs, health checks

---

## Architecture & Flow

### Job Processing Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Backend    │─────▶│   BullMQ     │─────▶│   Workers    │
│  Enqueues    │      │   Queue      │      │  Process     │
│   Job        │      │  (Redis)     │      │   Jobs       │
└──────────────┘      └──────────────┘      └──────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │   Job Log    │
                      │  (Database)  │
                      └──────────────┘
```

### Integration Points

The frontend interacts with background jobs in the following ways:

1. **Passive Consumption** - Notifications appear in UI after background delivery
2. **User Preferences** - Users configure notification digest frequency
3. **Admin Monitoring** 🔒 - Admins view job queue health and statistics
4. **Transparent Operations** - Search indexing and analytics happen automatically

---

## Notification Delivery System

### Classification: ⚡ HYBRID

- **In-app notifications:** Available to all users (brands and creators)
- **Job monitoring:** Admin-only

### How It Works

1. Backend creates a notification record in the database
2. Backend enqueues a delivery job with notification ID
3. Worker processes job:
   - In-app notification is already visible (record exists)
   - Email sent if user preferences allow
4. User sees notification in real-time or on next poll

### API Endpoints

#### 1. List Notifications

```http
GET /api/notifications
```

**Query Parameters:**

```typescript
{
  page?: number;          // Default: 1
  pageSize?: number;      // Default: 20, Max: 100
  read?: 'true' | 'false'; // Filter by read status
  type?: NotificationType; // Filter by notification type
  priority?: NotificationPriority; // Filter by priority
}
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: Array<{
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl: string | null;
    priority: NotificationPriority;
    read: boolean;
    readAt: string | null; // ISO 8601
    metadata: Record<string, any> | null;
    createdAt: string; // ISO 8601
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 400 | `Invalid query parameters` | Invalid query parameter values |
| 500 | `Internal server error` | Server error |

**Example Request:**

```typescript
// Using fetch
const response = await fetch('/api/notifications?page=1&pageSize=20&read=false', {
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Include cookies for session
});

const data = await response.json();
```

**Example with React Query:**

```typescript
import { useQuery } from '@tanstack/react-query';

interface NotificationFilters {
  page?: number;
  pageSize?: number;
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
}

function useNotifications(filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.pageSize) params.append('pageSize', filters.pageSize.toString());
      if (filters.read !== undefined) params.append('read', filters.read.toString());
      if (filters.type) params.append('type', filters.type);
      if (filters.priority) params.append('priority', filters.priority);

      const response = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      return response.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });
}
```

#### 2. Mark Notification as Read

```http
POST /api/notifications/:id/read
```

**Path Parameters:**

```typescript
{
  id: string; // Notification ID
}
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: {
    id: string;
    read: boolean; // true
    readAt: string; // ISO 8601
  };
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 404 | `Notification not found` | Notification doesn't exist or doesn't belong to user |
| 500 | `Internal server error` | Server error |

**Example with React Query Mutation:**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate notifications query to refetch
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });
}

// Usage in component
function NotificationItem({ notification }: { notification: Notification }) {
  const markRead = useMarkNotificationRead();

  const handleClick = () => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }
  };

  return (
    <div onClick={handleClick} className={notification.read ? 'read' : 'unread'}>
      <h4>{notification.title}</h4>
      <p>{notification.message}</p>
    </div>
  );
}
```

#### 3. Mark All Notifications as Read

```http
POST /api/notifications/read-all
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: {
    count: number; // Number of notifications marked as read
  };
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 500 | `Internal server error` | Server error |

#### 4. Get Unread Count

```http
GET /api/notifications/unread-count
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: {
    count: number;
  };
}
```

**Example with React Query:**

```typescript
function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      const response = await fetch('/api/notifications/unread-count', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      return response.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

// Usage in header/navbar
function NotificationBadge() {
  const { data } = useUnreadNotificationCount();

  if (!data?.data?.count) return null;

  return (
    <span className="badge">
      {data.data.count > 99 ? '99+' : data.data.count}
    </span>
  );
}
```

#### 5. Delete Notification

```http
DELETE /api/notifications/:id
```

**Path Parameters:**

```typescript
{
  id: string; // Notification ID
}
```

**Response (200 OK):**

```typescript
{
  success: true;
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 404 | `Notification not found` | Notification doesn't exist or doesn't belong to user |
| 500 | `Internal server error` | Server error |

---

## Notification Digest System

### Classification: 🌐 SHARED

Users can configure how they receive notifications:

- **IMMEDIATE** - Real-time email for each notification (default)
- **DAILY** - One email per day at 9 AM UTC with all unread notifications
- **WEEKLY** - One email per week on Monday at 9 AM UTC
- **NEVER** - In-app only, no emails

### API Endpoints

#### 1. Get Notification Preferences

```http
GET /api/notifications/preferences
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: {
    userId: string;
    enabledTypes: NotificationType[]; // Notification types user wants to receive
    digestFrequency: DigestFrequency; // IMMEDIATE | DAILY | WEEKLY | NEVER
    emailEnabled: boolean; // Global email toggle
    inAppEnabled: boolean; // Always true
    lastDigestSentAt?: string; // ISO 8601, when last digest was sent
  };
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 500 | `Internal server error` | Server error |

#### 2. Update Notification Preferences

```http
PATCH /api/notifications/preferences
```

**Request Body:**

```typescript
{
  enabledTypes?: NotificationType[]; // Optional: Types to enable
  digestFrequency?: DigestFrequency; // Optional: Digest frequency
  emailEnabled?: boolean; // Optional: Global email toggle
}
```

**Response (200 OK):**

```typescript
{
  success: true;
  data: {
    userId: string;
    enabledTypes: NotificationType[];
    digestFrequency: DigestFrequency;
    emailEnabled: boolean;
    inAppEnabled: boolean;
    lastDigestSentAt?: string;
  };
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `Unauthorized` | User not authenticated |
| 400 | `Invalid request body` | Request body validation failed |
| 500 | `Internal server error` | Server error |

**Example with React Query:**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Fetch preferences
function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await fetch('/api/notifications/preferences', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }

      return response.json();
    },
  });
}

// Update preferences
function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: {
      enabledTypes?: NotificationType[];
      digestFrequency?: DigestFrequency;
      emailEnabled?: boolean;
    }) => {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}

// Usage in settings component
function NotificationSettings() {
  const { data, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  if (isLoading) return <div>Loading...</div>;

  const handleDigestChange = (frequency: DigestFrequency) => {
    updatePrefs.mutate({ digestFrequency: frequency });
  };

  const handleEmailToggle = (enabled: boolean) => {
    updatePrefs.mutate({ emailEnabled: enabled });
  };

  return (
    <div>
      <h2>Notification Preferences</h2>
      
      <label>
        <input
          type="checkbox"
          checked={data?.data?.emailEnabled}
          onChange={(e) => handleEmailToggle(e.target.checked)}
        />
        Enable email notifications
      </label>

      <select
        value={data?.data?.digestFrequency}
        onChange={(e) => handleDigestChange(e.target.value as DigestFrequency)}
      >
        <option value="IMMEDIATE">Immediate (real-time)</option>
        <option value="DAILY">Daily digest (9 AM)</option>
        <option value="WEEKLY">Weekly digest (Monday 9 AM)</option>
        <option value="NEVER">In-app only</option>
      </select>
    </div>
  );
}
```

---

## TypeScript Type Definitions

### Notification Types

```typescript
/**
 * Notification type enumeration
 */
export enum NotificationType {
  LICENSE = 'LICENSE',           // License-related notifications
  PAYOUT = 'PAYOUT',            // Payout notifications for creators
  ROYALTY = 'ROYALTY',          // Royalty statement notifications
  PROJECT = 'PROJECT',          // Project invitations and updates
  SYSTEM = 'SYSTEM',            // System announcements
  MESSAGE = 'MESSAGE',          // Direct message notifications
  POST_ASSIGNED = 'POST_ASSIGNED',      // Blog post assigned to user
  POST_STATUS_CHANGED = 'POST_STATUS_CHANGED', // Blog post status changed
  BLOG = 'BLOG',                // Blog-related notifications
}

/**
 * Notification priority levels
 */
export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/**
 * Digest frequency options
 */
export enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',  // Real-time email delivery
  DAILY = 'DAILY',          // Daily digest at 9 AM UTC
  WEEKLY = 'WEEKLY',        // Weekly digest Monday 9 AM UTC
  NEVER = 'NEVER',          // In-app only, no emails
}

/**
 * Single notification object
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null; // ISO 8601 timestamp
  metadata: Record<string, any> | null;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Notification list response
 */
export interface NotificationListResponse {
  success: boolean;
  data: Notification[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Unread count response
 */
export interface UnreadCountResponse {
  success: boolean;
  data: {
    count: number;
  };
}

/**
 * Mark as read response
 */
export interface MarkReadResponse {
  success: boolean;
  data: {
    id: string;
    read: boolean;
    readAt: string;
  };
}

/**
 * Mark all as read response
 */
export interface MarkAllReadResponse {
  success: boolean;
  data: {
    count: number; // Number of notifications marked as read
  };
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;
  inAppEnabled: boolean; // Always true
  lastDigestSentAt?: string; // ISO 8601 timestamp
}

/**
 * Notification preferences response
 */
export interface NotificationPreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}

/**
 * Update notification preferences request
 */
export interface UpdateNotificationPreferencesRequest {
  enabledTypes?: NotificationType[];
  digestFrequency?: DigestFrequency;
  emailEnabled?: boolean;
}
```

### Helper Functions

```typescript
/**
 * Format notification timestamp as relative time
 */
export function formatNotificationTime(timestamp: string): string {
  const now = new Date();
  const notifDate = new Date(timestamp);
  const diffMs = now.getTime() - notifDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return notifDate.toLocaleDateString();
}

/**
 * Get priority badge color
 */
export function getPriorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case NotificationPriority.URGENT:
      return 'red';
    case NotificationPriority.HIGH:
      return 'orange';
    case NotificationPriority.MEDIUM:
      return 'blue';
    case NotificationPriority.LOW:
      return 'gray';
    default:
      return 'gray';
  }
}

/**
 * Get notification icon based on type
 */
export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case NotificationType.LICENSE:
      return '📄';
    case NotificationType.PAYOUT:
      return '💰';
    case NotificationType.ROYALTY:
      return '💵';
    case NotificationType.PROJECT:
      return '🎯';
    case NotificationType.SYSTEM:
      return '🔔';
    case NotificationType.MESSAGE:
      return '💬';
    case NotificationType.POST_ASSIGNED:
      return '📝';
    case NotificationType.POST_STATUS_CHANGED:
      return '📋';
    case NotificationType.BLOG:
      return '📰';
    default:
      return '🔔';
  }
}
```

---

## Business Logic & Validation Rules

### Notification Display Rules

1. **Unread First**: Always display unread notifications before read ones
2. **Sort by Priority**: Within unread/read groups, sort by priority (URGENT > HIGH > MEDIUM > LOW)
3. **Then by Time**: Within same priority, sort by most recent first
4. **Auto-mark Read**: Optionally mark as read when user clicks on notification
5. **Badge Display**: Show badge on notifications icon when unread count > 0

### Digest Frequency Rules

1. **IMMEDIATE**: User receives email for each notification immediately
2. **DAILY**: User receives one email at 9 AM UTC containing all unread notifications from past 24 hours
3. **WEEKLY**: User receives one email on Monday at 9 AM UTC containing all unread notifications from past 7 days
4. **NEVER**: User only sees notifications in-app, no emails sent

### Email Preferences Rules

1. If `emailEnabled = false`, no emails are sent regardless of `digestFrequency`
2. If `emailEnabled = true` and `digestFrequency = NEVER`, no emails are sent
3. Users can disable specific notification types via `enabledTypes` array
4. System administrators can override preferences for critical security notifications (not exposed to users)

### Pagination Rules

- **Default page size**: 20
- **Maximum page size**: 100
- **Minimum page**: 1
- **Empty results**: Return empty array with pagination metadata, not 404

---

**Continue to [Part 2](./FRONTEND_INTEGRATION_BACKGROUND_JOBS_PART_2.md) for Analytics Aggregation, Search Index Updates, and Admin Monitoring.**
