# 🌐 Notification System - Frontend Integration Guide
## Part 3: Frontend Implementation Checklist

**Classification:** 🌐 SHARED  
**Module:** Notification Service  
**Last Updated:** October 14, 2025

---

## Table of Contents

1. [Implementation Overview](#implementation-overview)
2. [API Client Setup](#api-client-setup)
3. [React Query / Data Fetching Setup](#react-query--data-fetching-setup)
4. [UI Components](#ui-components)
5. [Real-time Updates Strategy](#real-time-updates-strategy)
6. [State Management](#state-management)
7. [Edge Cases & Error Handling](#edge-cases--error-handling)
8. [Testing Checklist](#testing-checklist)
9. [Performance Optimization](#performance-optimization)
10. [Accessibility (a11y) Requirements](#accessibility-a11y-requirements)

---

## Implementation Overview

### Tech Stack Assumptions

- **Framework:** Next.js 15 + App Router
- **Language:** TypeScript
- **Data Fetching:** React Query (TanStack Query)
- **UI Library:** React + Tailwind CSS
- **Authentication:** NextAuth.js (session-based)

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│          Notification Bell Component            │
│  (Shows badge, dropdown, triggers polling)      │
└────────────┬────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────┐
│       React Query Hooks & API Client            │
│  (Fetching, caching, mutations)                 │
└────────────┬────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────┐
│     REST API (ops.yesgoddess.agency/api)        │
│  (JWT session authentication via cookies)       │
└─────────────────────────────────────────────────┘
```

---

## API Client Setup

### Step 1: Create Base API Client

**File:** `lib/api/notifications-client.ts`

```typescript
import type {
  Notification,
  NotificationPreferences,
  NotificationType,
  NotificationPriority,
  DigestFrequency,
} from '@/types/notifications';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency/api';

class NotificationsApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      credentials: 'include', // Important: Include cookies for session auth
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        success: false,
        error: 'Network error',
      }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // List notifications
  async list(params?: {
    page?: number;
    pageSize?: number;
    read?: boolean;
    type?: NotificationType;
    priority?: NotificationPriority;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.read !== undefined) searchParams.set('read', params.read.toString());
    if (params?.type) searchParams.set('type', params.type);
    if (params?.priority) searchParams.set('priority', params.priority);

    const query = searchParams.toString();
    return this.request<{
      success: true;
      data: Notification[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/notifications${query ? `?${query}` : ''}`);
  }

  // Get unread count
  async getUnreadCount() {
    return this.request<{
      success: true;
      data: { count: number };
    }>('/notifications/unread');
  }

  // Poll for new notifications
  async poll(lastSeen?: string) {
    const query = lastSeen ? `?lastSeen=${encodeURIComponent(lastSeen)}` : '';
    return this.request<{
      success: true;
      data: {
        hasNew: boolean;
        notifications: Notification[];
        unreadCount: number;
        lastPolled: string;
      };
    }>(`/notifications/poll${query}`);
  }

  // Mark as read
  async markAsRead(notificationId: string) {
    return this.request<{
      success: true;
      data: {
        id: string;
        read: true;
        readAt: string;
      };
    }>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  }

  // Mark all as read
  async markAllAsRead() {
    return this.request<{
      success: true;
      data: { count: number };
    }>('/notifications/read-all', {
      method: 'PATCH',
    });
  }

  // Delete notification
  async delete(notificationId: string) {
    return this.request<{
      success: true;
      data: { deleted: true };
    }>(`/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  }

  // Get preferences
  async getPreferences() {
    return this.request<{
      success: true;
      data: NotificationPreferences;
    }>('/notifications/preferences');
  }

  // Update preferences
  async updatePreferences(data: {
    enabledTypes?: NotificationType[];
    digestFrequency?: DigestFrequency;
    emailEnabled?: boolean;
    inAppEnabled?: boolean;
  }) {
    return this.request<{
      success: true;
      data: NotificationPreferences;
    }>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Admin: Create notification
  async create(data: {
    userId?: string;
    userIds?: string[];
    userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
    type: NotificationType;
    title: string;
    message: string;
    priority?: NotificationPriority;
    actionUrl?: string;
    metadata?: Record<string, any>;
  }) {
    return this.request<{
      success: true;
      data: {
        created: number;
        notificationIds: string[];
      };
    }>('/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const notificationsApi = new NotificationsApiClient();
```

---

## React Query / Data Fetching Setup

### Step 2: Create React Query Hooks

**File:** `hooks/use-notifications.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications-client';
import type { NotificationType, NotificationPriority } from '@/types/notifications';

// Query keys factory
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...notificationKeys.lists(), filters] as const,
  unreadCount: () => [...notificationKeys.all, 'unread'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
};

// List notifications hook
export function useNotifications(params?: {
  page?: number;
  pageSize?: number;
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
}) {
  return useQuery({
    queryKey: notificationKeys.list(params || {}),
    queryFn: () => notificationsApi.list(params),
    staleTime: 30000, // Consider data stale after 30 seconds
  });
}

// Unread count hook
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsApi.getUnreadCount(),
    staleTime: 15000, // 15 seconds
    refetchInterval: 20000, // Refetch every 20 seconds
  });
}

// Preferences hook
export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: () => notificationsApi.getPreferences(),
    staleTime: 300000, // 5 minutes
  });
}

// Mark as read mutation
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

// Mark all as read mutation
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

// Delete notification mutation
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationsApi.delete(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

// Update preferences mutation
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });
}
```

---

### Step 3: Polling Hook with Rate Limiting

**File:** `hooks/use-notification-polling.ts`

```typescript
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications-client';
import { notificationKeys } from './use-notifications';

const POLL_INTERVAL = 20000; // 20 seconds
const MIN_POLL_INTERVAL = 10000; // Minimum 10 seconds (rate limit)
const MAX_POLL_INTERVAL = 60000; // Maximum 60 seconds (backoff)

export function useNotificationPolling(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const [lastSeen, setLastSeen] = useState<string>(() => new Date().toISOString());
  const [currentInterval, setCurrentInterval] = useState(POLL_INTERVAL);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    async function poll() {
      try {
        const result = await notificationsApi.poll(lastSeen);

        if (result.data.hasNew) {
          // New notifications received - invalidate queries
          queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
          queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
          
          // Update lastSeen timestamp
          setLastSeen(result.data.lastPolled);
          
          // Optional: Show toast notification
          // showNotificationToast(result.data.notifications[0]);
        }

        // Reset to normal interval on success
        setCurrentInterval(POLL_INTERVAL);

        // Schedule next poll
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL);
      } catch (error: any) {
        // Handle rate limiting
        if (error.message.includes('Rate limit')) {
          console.warn('Notification polling rate limited');
          setCurrentInterval(Math.min(currentInterval * 1.5, MAX_POLL_INTERVAL));
        } else {
          // Network error - exponential backoff
          console.error('Notification polling failed:', error);
          setCurrentInterval(Math.min(currentInterval * 2, MAX_POLL_INTERVAL));
        }

        // Retry with backoff interval
        timeoutRef.current = setTimeout(poll, currentInterval);
      }
    }

    // Start polling
    poll();

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, lastSeen, currentInterval, queryClient]);
}
```

---

## UI Components

### Step 4: Notification Bell Component

**File:** `components/notifications/notification-bell.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useNotificationPolling } from '@/hooks/use-notification-polling';
import { NotificationDropdown } from './notification-dropdown';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: countData } = useUnreadCount();
  
  // Enable polling when component is mounted
  useNotificationPolling(true);

  const unreadCount = countData?.data?.count || 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-6 h-6" />
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown onClose={() => setIsOpen(false)} />
      )}
    </div>
  );
}
```

---

### Step 5: Notification Dropdown Component

**File:** `components/notifications/notification-dropdown.tsx`

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/use-notifications';
import { NotificationItem } from './notification-item';
import { Loader2 } from 'lucide-react';

interface NotificationDropdownProps {
  onClose: () => void;
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useNotifications({ page: 1, pageSize: 20 });
  const markAllAsRead = useMarkAllAsRead();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const notifications = data?.data || [];
  const hasUnread = notifications.some(n => !n.read);

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Notifications</h3>
        
        {hasUnread && (
          <button
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notification List */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center p-8 text-gray-500">
            <p>No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={onClose}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 text-center">
        <a
          href="/notifications"
          className="text-sm text-blue-600 hover:text-blue-800"
          onClick={onClose}
        >
          View all notifications
        </a>
      </div>
    </div>
  );
}
```

---

### Step 6: Notification Item Component

**File:** `components/notifications/notification-item.tsx`

```tsx
'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { X } from 'lucide-react';
import { useMarkAsRead, useDeleteNotification } from '@/hooks/use-notifications';
import type { Notification } from '@/types/notifications';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const markAsRead = useMarkAsRead();
  const deleteNotification = useDeleteNotification();

  const handleClick = () => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
    onClick?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteNotification.mutate(notification.id);
  };

  const priorityColors = {
    URGENT: 'bg-red-100 border-red-400',
    HIGH: 'bg-orange-100 border-orange-400',
    MEDIUM: 'bg-blue-100 border-blue-400',
    LOW: 'bg-gray-100 border-gray-300',
  };

  const priorityDots = {
    URGENT: 'bg-red-500',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-blue-500',
    LOW: 'bg-gray-400',
  };

  const content = (
    <div
      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors relative ${
        !notification.read ? 'bg-blue-50/30' : ''
      }`}
      onClick={handleClick}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <span className={`absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${priorityDots[notification.priority]}`} />
      )}

      <div className="flex items-start gap-3 pl-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">
            {notification.title}
          </p>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="flex-shrink-0 p-1 hover:bg-gray-200 rounded transition-colors"
          aria-label="Delete notification"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );

  // Wrap in Link if actionUrl exists
  if (notification.actionUrl) {
    return (
      <Link href={notification.actionUrl}>
        {content}
      </Link>
    );
  }

  return content;
}
```

---

### Step 7: Notification Preferences Component

**File:** `components/notifications/notification-preferences.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useNotificationPreferences, useUpdatePreferences } from '@/hooks/use-notifications';
import { Loader2 } from 'lucide-react';
import type { NotificationType, DigestFrequency } from '@/types/notifications';

const NOTIFICATION_TYPES: { value: NotificationType; label: string }[] = [
  { value: 'LICENSE', label: 'License Updates' },
  { value: 'PAYOUT', label: 'Payments & Payouts' },
  { value: 'ROYALTY', label: 'Royalty Statements' },
  { value: 'PROJECT', label: 'Project Activity' },
  { value: 'SYSTEM', label: 'System Announcements' },
  { value: 'MESSAGE', label: 'Direct Messages' },
];

const DIGEST_FREQUENCIES: { value: DigestFrequency; label: string; description: string }[] = [
  { value: 'IMMEDIATE', label: 'Immediately', description: 'Send email for every notification' },
  { value: 'DAILY', label: 'Daily Digest', description: 'Once per day at 9 AM' },
  { value: 'WEEKLY', label: 'Weekly Digest', description: 'Once per week on Monday' },
  { value: 'NEVER', label: 'Never', description: 'Only urgent notifications' },
];

export function NotificationPreferences() {
  const { data, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdatePreferences();

  const preferences = data?.data;

  const [enabledTypes, setEnabledTypes] = useState<NotificationType[]>(
    preferences?.enabledTypes || []
  );
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    preferences?.digestFrequency || 'DAILY'
  );
  const [emailEnabled, setEmailEnabled] = useState(preferences?.emailEnabled || false);

  const handleSave = () => {
    updatePreferences.mutate({
      enabledTypes,
      digestFrequency,
      emailEnabled,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Notification Preferences</h2>

      {/* Email toggle */}
      <div className="mb-8">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
            className="w-5 h-5"
          />
          <div>
            <p className="font-medium">Email Notifications</p>
            <p className="text-sm text-gray-600">Receive notifications via email</p>
          </div>
        </label>
      </div>

      {/* Digest frequency */}
      {emailEnabled && (
        <div className="mb-8">
          <h3 className="font-medium mb-3">Email Frequency</h3>
          <div className="space-y-3">
            {DIGEST_FREQUENCIES.map((freq) => (
              <label key={freq.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="digestFrequency"
                  value={freq.value}
                  checked={digestFrequency === freq.value}
                  onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium">{freq.label}</p>
                  <p className="text-sm text-gray-600">{freq.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Notification types */}
      <div className="mb-8">
        <h3 className="font-medium mb-3">Notification Types</h3>
        <div className="space-y-2">
          {NOTIFICATION_TYPES.map((type) => (
            <label key={type.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledTypes.includes(type.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEnabledTypes([...enabledTypes, type.value]);
                  } else {
                    setEnabledTypes(enabledTypes.filter((t) => t !== type.value));
                  }
                }}
                className="w-5 h-5"
              />
              <span>{type.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={updatePreferences.isPending}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {updatePreferences.isPending ? 'Saving...' : 'Save Preferences'}
      </button>

      {updatePreferences.isSuccess && (
        <p className="mt-3 text-green-600">Preferences saved successfully!</p>
      )}
    </div>
  );
}
```

---

## Real-time Updates Strategy

### Polling vs WebSockets

**Current Implementation:** Polling with 20-second intervals

**Why Polling:**
- Simpler to implement and maintain
- Works with existing REST architecture
- No persistent connection overhead
- Rate limiting prevents abuse
- Efficient caching reduces database load

**If WebSockets Needed Later:**
- Implement Server-Sent Events (SSE) for one-way updates
- Use `/api/notifications/stream` endpoint
- Fallback to polling if connection fails

---

## State Management

### React Query State

React Query handles all server state:
- Notifications list
- Unread count
- User preferences

### Local UI State

Component-level state handles:
- Dropdown open/close
- Selected filters
- Form inputs

**No need for Redux/Zustand** - React Query provides sufficient state management.

---

## Edge Cases & Error Handling

### Edge Case Checklist

#### 1. Empty States
- ✅ No notifications exist
- ✅ All notifications read
- ✅ Filtered view returns no results

#### 2. Network Errors
- ✅ Offline detection
- ✅ Retry with exponential backoff
- ✅ Show user-friendly error messages

#### 3. Authentication Issues
- ✅ Session expired during polling
- ✅ Redirect to login
- ✅ Preserve intended action after re-auth

#### 4. Rate Limiting
- ✅ Respect `Retry-After` header
- ✅ Increase polling interval on 429
- ✅ Show friendly message

#### 5. Concurrent Updates
- ✅ Optimistic updates with rollback
- ✅ React Query automatic refetch on focus
- ✅ Handle stale data scenarios

#### 6. Long Notification Messages
- ✅ Truncate with ellipsis
- ✅ Show full text on hover/click
- ✅ Line clamping in UI

#### 7. Invalid actionUrl
- ✅ Gracefully handle 404 routes
- ✅ Validate URL format before navigation
- ✅ Fallback to notifications page

---

## Testing Checklist

### Unit Tests

```typescript
// Example test file structure
describe('NotificationBell', () => {
  it('displays unread count badge', () => {});
  it('opens dropdown on click', () => {});
  it('polls for new notifications', () => {});
});

describe('NotificationItem', () => {
  it('marks as read on click', () => {});
  it('navigates to actionUrl', () => {});
  it('deletes notification', () => {});
});

describe('notificationsApi', () => {
  it('fetches notifications with filters', () => {});
  it('handles rate limit errors', () => {});
  it('includes credentials in requests', () => {});
});
```

### Integration Tests

- ✅ Full flow: Create → Display → Mark Read → Delete
- ✅ Polling updates UI automatically
- ✅ Preferences update reflected immediately
- ✅ Error states display correctly

### E2E Tests

- ✅ User sees notification bell badge
- ✅ User clicks bell and sees notifications
- ✅ User marks notification as read
- ✅ User deletes notification
- ✅ User updates preferences

---

## Performance Optimization

### 1. Code Splitting

```typescript
// Lazy load notification components
const NotificationDropdown = dynamic(
  () => import('./notification-dropdown'),
  { ssr: false }
);
```

### 2. Virtualization

For pages with 100+ notifications:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

// Render only visible notifications
const virtualizer = useVirtualizer({
  count: notifications.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 80, // Estimated row height
});
```

### 3. Debounced Actions

```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedMarkAsRead = useDebouncedCallback(
  (id: string) => markAsRead.mutate(id),
  500 // Wait 500ms before marking
);
```

### 4. Optimistic Updates

```typescript
const markAsRead = useMutation({
  mutationFn: (id: string) => notificationsApi.markAsRead(id),
  onMutate: async (id) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: notificationKeys.lists() });

    // Snapshot current value
    const previousNotifications = queryClient.getQueryData(notificationKeys.lists());

    // Optimistically update
    queryClient.setQueryData(notificationKeys.lists(), (old: any) => ({
      ...old,
      data: old.data.map((n: Notification) =>
        n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
      ),
    }));

    return { previousNotifications };
  },
  onError: (err, id, context) => {
    // Rollback on error
    if (context?.previousNotifications) {
      queryClient.setQueryData(notificationKeys.lists(), context.previousNotifications);
    }
  },
});
```

---

## Accessibility (a11y) Requirements

### ARIA Labels

```tsx
<button aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
  <Bell />
</button>
```

### Keyboard Navigation

- ✅ Tab to notification bell
- ✅ Enter/Space to open dropdown
- ✅ Arrow keys to navigate notifications
- ✅ Escape to close dropdown

### Screen Reader Support

```tsx
<div role="region" aria-label="Notifications">
  {/* Notification list */}
</div>

<div role="status" aria-live="polite" aria-atomic="true">
  {unreadCount > 0 && `${unreadCount} unread notifications`}
</div>
```

### Focus Management

```typescript
useEffect(() => {
  if (isOpen && dropdownRef.current) {
    // Focus first notification when opened
    const firstItem = dropdownRef.current.querySelector('[role="button"]');
    (firstItem as HTMLElement)?.focus();
  }
}, [isOpen]);
```

---

## Frontend Implementation Checklist

### Phase 1: Core Setup ✅

- [ ] Install dependencies: `@tanstack/react-query`, `date-fns`
- [ ] Create TypeScript type definitions
- [ ] Set up API client with session authentication
- [ ] Create React Query hooks
- [ ] Set up polling hook with rate limiting

### Phase 2: UI Components ✅

- [ ] Create NotificationBell component
- [ ] Create NotificationDropdown component
- [ ] Create NotificationItem component
- [ ] Create NotificationPreferences component
- [ ] Style components with Tailwind CSS

### Phase 3: Integration ✅

- [ ] Add notification bell to app layout/header
- [ ] Create notifications page (`/notifications`)
- [ ] Create preferences page (`/settings/notifications`)
- [ ] Test polling and real-time updates
- [ ] Test mark as read functionality

### Phase 4: Error Handling ✅

- [ ] Handle authentication errors (redirect to login)
- [ ] Handle rate limiting (show retry message)
- [ ] Handle network errors (offline detection)
- [ ] Handle empty states (no notifications)
- [ ] Handle validation errors (show field errors)

### Phase 5: Optimization ✅

- [ ] Implement optimistic updates
- [ ] Add virtualization for long lists
- [ ] Lazy load components
- [ ] Add debouncing for actions
- [ ] Test performance with 100+ notifications

### Phase 6: Accessibility ✅

- [ ] Add ARIA labels
- [ ] Implement keyboard navigation
- [ ] Add screen reader support
- [ ] Test with keyboard only
- [ ] Test with screen reader (NVDA/JAWS)

### Phase 7: Testing ✅

- [ ] Write unit tests for components
- [ ] Write integration tests for hooks
- [ ] Write E2E tests for user flows
- [ ] Test on mobile devices
- [ ] Test in all supported browsers

---

## Next Steps

Review:
- **[Part 1: API Endpoints & Schemas](./NOTIFICATION_SYSTEM_INTEGRATION_GUIDE_PART_1_API_ENDPOINTS.md)**
- **[Part 2: Business Logic & Validation](./NOTIFICATION_SYSTEM_INTEGRATION_GUIDE_PART_2_BUSINESS_LOGIC.md)**

---

## Support & Questions

If you encounter issues or have questions:

1. Check existing documentation in `/docs/modules/system-tables/NOTIFICATIONS.md`
2. Review API endpoint tests in `/src/app/api/notifications/**/route.ts`
3. Contact backend team with specific error messages or reproduction steps

**Backend Repository:** yg-backend  
**Deployed At:** ops.yesgoddess.agency
