# 🌐 Notifications System - Frontend Implementation Guide

**Classification:** 🌐 SHARED  
**Module:** Notifications Integration  
**Last Updated:** October 13, 2025

> **Context:** Complete frontend implementation guide with TypeScript, React Query, and UI examples. This guide assumes you're building with Next.js 15, App Router, and TypeScript.

---

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [API Client Layer](#api-client-layer)
4. [React Query Hooks](#react-query-hooks)
5. [UI Components](#ui-components)
6. [Polling Strategy](#polling-strategy)
7. [Error Handling](#error-handling)
8. [Testing Considerations](#testing-considerations)
9. [Implementation Checklist](#implementation-checklist)

---

## Setup & Configuration

### Install Dependencies

```bash
npm install @tanstack/react-query@^5.0.0 date-fns
```

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency/api/trpc
```

---

## TypeScript Type Definitions

Create a new file: `src/types/notifications.ts`

```typescript
// ========================================
// Enums
// ========================================

export enum NotificationType {
  LICENSE = 'LICENSE',
  PAYOUT = 'PAYOUT',
  ROYALTY = 'ROYALTY',
  PROJECT = 'PROJECT',
  SYSTEM = 'SYSTEM',
  MESSAGE = 'MESSAGE'
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  NEVER = 'NEVER'
}

// ========================================
// Core Types
// ========================================

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  lastDigestSentAt?: string;
}

// ========================================
// Request Types
// ========================================

export interface ListNotificationsParams {
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  page?: number;
  pageSize?: number;
}

export interface UpdatePreferencesParams {
  enabledTypes?: NotificationType[];
  digestFrequency?: DigestFrequency;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}

export interface PollNotificationsParams {
  lastSeen?: string;
}

// ========================================
// Response Types
// ========================================

export interface ListNotificationsResponse {
  data: Notification[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface UnreadCountResponse {
  data: {
    count: number;
  };
}

export interface PollNotificationsResponse {
  data: {
    notifications: Notification[];
    newCount: number;
    unreadCount: number;
    lastSeen: string;
    suggestedPollInterval: number;
  };
}

export interface MarkAsReadResponse {
  data: {
    id: string;
    read: boolean;
    readAt: string;
  };
}

export interface MarkAllAsReadResponse {
  data: {
    count: number;
  };
}

export interface NotificationPreferencesResponse {
  data: NotificationPreferences;
}

// ========================================
// Metadata Types (type-specific)
// ========================================

export interface LicenseNotificationMetadata {
  licenseId: string;
  licenseName: string;
  expiryDate?: string;
  creatorId?: string;
  brandId?: string;
  action?: 'expiring' | 'renewed' | 'cancelled' | 'approved';
}

export interface PayoutNotificationMetadata {
  payoutId: string;
  amount: number;
  currency: string;
  status: 'processed' | 'failed' | 'pending';
  failureReason?: string;
  expectedDate?: string;
}

export interface MessageNotificationMetadata {
  threadId: string;
  threadSubject?: string;
  senderId: string;
  senderName: string;
  messagePreview: string;
  messageId: string;
}

// ========================================
// UI Helper Types
// ========================================

export interface NotificationGroup {
  type: NotificationType;
  notifications: Notification[];
  unreadCount: number;
}

export interface NotificationBadgeConfig {
  color: string;
  icon: string;
  label: string;
}
```

---

## API Client Layer

Create `src/lib/api/notifications.ts`:

```typescript
import { trpc } from '@/lib/trpc';
import type {
  ListNotificationsParams,
  UpdatePreferencesParams,
  PollNotificationsParams,
} from '@/types/notifications';

export const notificationsApi = {
  // List notifications
  list: (params: ListNotificationsParams) => {
    return trpc.system.notifications.list.query(params);
  },

  // Get unread count
  getUnreadCount: () => {
    return trpc.system.notifications.getUnreadCount.query();
  },

  // Mark as read
  markAsRead: (notificationId: string) => {
    return trpc.system.notifications.markAsRead.mutate({ notificationId });
  },

  // Mark all as read
  markAllAsRead: () => {
    return trpc.system.notifications.markAllAsRead.mutate();
  },

  // Delete notification
  delete: (notificationId: string) => {
    return trpc.system.notifications.delete.mutate({ notificationId });
  },

  // Get preferences
  getPreferences: () => {
    return trpc.system.notifications.getPreferences.query();
  },

  // Update preferences
  updatePreferences: (params: UpdatePreferencesParams) => {
    return trpc.system.notifications.updatePreferences.mutate(params);
  },

  // Poll for new notifications
  poll: (params: PollNotificationsParams) => {
    return trpc.system.notifications.poll.query(params);
  },
};
```

---

## React Query Hooks

Create `src/hooks/useNotifications.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications';
import type {
  ListNotificationsParams,
  UpdatePreferencesParams,
} from '@/types/notifications';

// ========================================
// Query Keys
// ========================================

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: ListNotificationsParams) => 
    [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
  poll: () => [...notificationKeys.all, 'poll'] as const,
};

// ========================================
// List Notifications
// ========================================

export function useNotifications(params: ListNotificationsParams = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationsApi.list(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ========================================
// Unread Count
// ========================================

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsApi.getUnreadCount(),
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
}

// ========================================
// Mark as Read
// ========================================

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => 
      notificationsApi.markAsRead(notificationId),
    onSuccess: (data) => {
      // Optimistically update the notification in all lists
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((n: any) =>
              n.id === data.data.id
                ? { ...n, read: true, readAt: data.data.readAt }
                : n
            ),
          };
        }
      );

      // Invalidate unread count
      queryClient.invalidateQueries({ 
        queryKey: notificationKeys.unreadCount() 
      });
    },
  });
}

// ========================================
// Mark All as Read
// ========================================

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      // Invalidate all notification queries
      queryClient.invalidateQueries({ 
        queryKey: notificationKeys.all 
      });
    },
  });
}

// ========================================
// Delete Notification
// ========================================

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => 
      notificationsApi.delete(notificationId),
    onSuccess: (_, notificationId) => {
      // Remove from cache
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.filter((n: any) => n.id !== notificationId),
            meta: {
              ...old.meta,
              pagination: {
                ...old.meta.pagination,
                total: old.meta.pagination.total - 1,
              },
            },
          };
        }
      );

      // Invalidate unread count
      queryClient.invalidateQueries({ 
        queryKey: notificationKeys.unreadCount() 
      });
    },
  });
}

// ========================================
// Preferences
// ========================================

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: () => notificationsApi.getPreferences(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdatePreferencesParams) => 
      notificationsApi.updatePreferences(params),
    onSuccess: (data) => {
      // Update cache with new preferences
      queryClient.setQueryData(
        notificationKeys.preferences(),
        { data: data.data }
      );
    },
  });
}
```

---

## UI Components

### 1. Notification Badge (Unread Count)

`src/components/notifications/NotificationBadge.tsx`:

```typescript
'use client';

import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/hooks/useNotifications';

export function NotificationBadge() {
  const { data, isLoading } = useUnreadCount();
  const count = data?.data.count ?? 0;

  return (
    <button
      className="relative p-2 text-gray-600 hover:text-gray-900"
      aria-label={`${count} unread notifications`}
    >
      <Bell className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
```

---

### 2. Notification List

`src/components/notifications/NotificationList.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  useNotifications, 
  useMarkAsRead, 
  useDeleteNotification 
} from '@/hooks/useNotifications';
import { NotificationItem } from './NotificationItem';
import type { NotificationType } from '@/types/notifications';

interface NotificationListProps {
  filterType?: NotificationType;
  showOnlyUnread?: boolean;
}

export function NotificationList({ 
  filterType, 
  showOnlyUnread = false 
}: NotificationListProps) {
  const [page, setPage] = useState(1);
  
  const { data, isLoading, error } = useNotifications({
    read: showOnlyUnread ? false : undefined,
    type: filterType,
    page,
    pageSize: 20,
  });

  const markAsRead = useMarkAsRead();
  const deleteNotification = useDeleteNotification();

  if (isLoading) {
    return <NotificationListSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Failed to load notifications. Please try again.
      </div>
    );
  }

  const notifications = data?.data ?? [];
  const pagination = data?.meta.pagination;

  if (notifications.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Bell className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-2">No notifications</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onMarkAsRead={() => markAsRead.mutate(notification.id)}
          onDelete={() => deleteNotification.mutate(notification.id)}
        />
      ))}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-between p-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationListSkeleton() {
  return (
    <div className="divide-y divide-gray-200">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="mt-2 h-3 w-1/2 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
```

---

### 3. Single Notification Item

`src/components/notifications/NotificationItem.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { X, Check } from 'lucide-react';
import type { Notification } from '@/types/notifications';
import { getNotificationConfig } from '@/lib/notifications/config';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: () => void;
  onDelete: () => void;
}

export function NotificationItem({ 
  notification, 
  onMarkAsRead, 
  onDelete 
}: NotificationItemProps) {
  const router = useRouter();
  const config = getNotificationConfig(notification.type, notification.priority);

  const handleClick = () => {
    // Mark as read
    if (!notification.read) {
      onMarkAsRead();
    }

    // Navigate to action URL
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  return (
    <div
      className={`
        group relative p-4 hover:bg-gray-50 cursor-pointer
        ${!notification.read ? 'bg-blue-50' : ''}
      `}
      onClick={handleClick}
    >
      {/* Priority indicator */}
      <div 
        className={`absolute left-0 top-0 bottom-0 w-1 ${config.borderColor}`}
      />

      <div className="flex items-start gap-3 pl-2">
        {/* Icon */}
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {notification.title}
          </p>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {notification.message}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {formatDistanceToNow(new Date(notification.createdAt), { 
              addSuffix: true 
            })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead();
              }}
              className="p-1 text-gray-400 hover:text-blue-600"
              title="Mark as read"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-600"
            title="Delete"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### 4. Notification Preferences Form

`src/components/notifications/NotificationPreferencesForm.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { 
  useNotificationPreferences, 
  useUpdateNotificationPreferences 
} from '@/hooks/useNotifications';
import { NotificationType, DigestFrequency } from '@/types/notifications';

export function NotificationPreferencesForm() {
  const { data, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  const [enabledTypes, setEnabledTypes] = useState<NotificationType[]>([]);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    DigestFrequency.IMMEDIATE
  );
  const [emailEnabled, setEmailEnabled] = useState(true);

  // Initialize form with current preferences
  useEffect(() => {
    if (data?.data) {
      setEnabledTypes(data.data.enabledTypes);
      setDigestFrequency(data.data.digestFrequency);
      setEmailEnabled(data.data.emailEnabled);
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await updatePreferences.mutateAsync({
      enabledTypes,
      digestFrequency,
      emailEnabled,
    });

    alert('Preferences saved successfully!');
  };

  const toggleType = (type: NotificationType) => {
    setEnabledTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  if (isLoading) {
    return <div>Loading preferences...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Email Enabled */}
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
            className="h-4 w-4 text-blue-600"
          />
          <span className="font-medium">Enable email notifications</span>
        </label>
        <p className="mt-1 text-sm text-gray-500">
          Receive notifications via email (requires verified email address)
        </p>
      </div>

      {/* Digest Frequency */}
      {emailEnabled && (
        <div>
          <label className="block font-medium mb-2">
            Email Frequency
          </label>
          <select
            value={digestFrequency}
            onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
            className="block w-full rounded-md border-gray-300 shadow-sm"
          >
            <option value={DigestFrequency.IMMEDIATE}>
              Immediate (send right away)
            </option>
            <option value={DigestFrequency.DAILY}>
              Daily Digest (9 AM)
            </option>
            <option value={DigestFrequency.WEEKLY}>
              Weekly Digest (Monday 9 AM)
            </option>
            <option value={DigestFrequency.NEVER}>
              Never (no emails)
            </option>
          </select>
          <p className="mt-1 text-sm text-gray-500">
            Note: Urgent and high priority notifications always send immediately
          </p>
        </div>
      )}

      {/* Notification Types */}
      <div>
        <label className="block font-medium mb-2">
          Notification Types
        </label>
        <div className="space-y-2">
          {Object.values(NotificationType).map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabledTypes.includes(type)}
                onChange={() => toggleType(type)}
                className="h-4 w-4 text-blue-600"
              />
              <span className="capitalize">{type.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={updatePreferences.isPending}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {updatePreferences.isPending ? 'Saving...' : 'Save Preferences'}
      </button>

      {/* Error Message */}
      {updatePreferences.isError && (
        <p className="text-sm text-red-600">
          Failed to save preferences. Please try again.
        </p>
      )}
    </form>
  );
}
```

---

## Polling Strategy

Create `src/hooks/useNotificationPolling.ts`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications';
import { notificationKeys } from '@/hooks/useNotifications';
import { toast } from 'sonner'; // Or your toast library

export function useNotificationPolling() {
  const queryClient = useQueryClient();
  const [lastSeen, setLastSeen] = useState<string | undefined>();
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const poll = async () => {
      try {
        const result = await notificationsApi.poll({ lastSeen });
        
        // Update lastSeen for next poll
        setLastSeen(result.data.lastSeen);

        // If new notifications, invalidate queries
        if (result.data.newCount > 0) {
          queryClient.invalidateQueries({ 
            queryKey: notificationKeys.all 
          });

          // Show toast for urgent/high priority notifications
          result.data.notifications.forEach((notif) => {
            if (notif.priority === 'URGENT' || notif.priority === 'HIGH') {
              toast(notif.title, {
                description: notif.message,
                action: notif.actionUrl
                  ? {
                      label: 'View',
                      onClick: () => window.location.href = notif.actionUrl!,
                    }
                  : undefined,
              });
            }
          });
        }

        // Schedule next poll
        const interval = result.data.suggestedPollInterval * 1000;
        intervalRef.current = setTimeout(poll, interval);
      } catch (error) {
        console.error('Polling failed:', error);
        // Retry after 30 seconds on error
        intervalRef.current = setTimeout(poll, 30000);
      }
    };

    // Start polling
    poll();

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [lastSeen, queryClient]);
}
```

**Usage in App:**

```typescript
// app/layout.tsx or app/providers.tsx
'use client';

import { useNotificationPolling } from '@/hooks/useNotificationPolling';

export function NotificationProvider({ children }) {
  useNotificationPolling(); // Start polling when app loads

  return <>{children}</>;
}
```

---

## Error Handling

### Global Error Handler

Create `src/lib/notifications/errors.ts`:

```typescript
export function getNotificationErrorMessage(error: any): string {
  const code = error?.data?.code;
  const message = error?.message;

  switch (code) {
    case 'BAD_REQUEST':
      if (message?.includes('verified email')) {
        return 'You must verify your email address before enabling email notifications.';
      }
      return 'Invalid request. Please check your input.';
    
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    
    case 'NOT_FOUND':
      return 'The notification could not be found. It may have been deleted.';
    
    case 'CONFLICT':
      return 'There was a conflict processing your request. Please try again.';
    
    default:
      return 'An unexpected error occurred. Please try again later.';
  }
}
```

**Usage:**

```typescript
import { getNotificationErrorMessage } from '@/lib/notifications/errors';

// In your component
const markAsRead = useMarkAsRead();

const handleMarkAsRead = async (id: string) => {
  try {
    await markAsRead.mutateAsync(id);
  } catch (error) {
    const message = getNotificationErrorMessage(error);
    toast.error(message);
  }
};
```

---

## Testing Considerations

### Unit Tests

```typescript
// __tests__/hooks/useNotifications.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotifications } from '@/hooks/useNotifications';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useNotifications', () => {
  it('fetches notifications successfully', async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data?.data)).toBe(true);
  });

  it('handles errors gracefully', async () => {
    // Mock API to return error
    // ... test error handling
  });
});
```

### Integration Tests

Test the full notification flow:
1. Poll for new notification
2. Display in UI
3. Mark as read
4. Verify badge count updates

---

## Implementation Checklist

### Phase 1: Setup ✅
- [ ] Install dependencies (@tanstack/react-query, date-fns)
- [ ] Add TypeScript type definitions
- [ ] Set up API client layer
- [ ] Configure React Query provider

### Phase 2: Core Features ✅
- [ ] Implement notification badge with unread count
- [ ] Create notification list component
- [ ] Add mark as read functionality
- [ ] Add delete notification functionality
- [ ] Implement mark all as read

### Phase 3: Preferences ✅
- [ ] Create preferences form component
- [ ] Implement digest frequency selection
- [ ] Add notification type toggles
- [ ] Handle email verification requirement

### Phase 4: Real-time Updates ✅
- [ ] Implement polling hook
- [ ] Set up automatic cache invalidation
- [ ] Add toast notifications for URGENT/HIGH priority
- [ ] Handle background tab visibility

### Phase 5: UX Enhancements ✅
- [ ] Add loading skeletons
- [ ] Implement error boundaries
- [ ] Add empty states
- [ ] Implement pagination
- [ ] Add filtering by type/priority
- [ ] Group notifications by type

### Phase 6: Polish ✅
- [ ] Add animations/transitions
- [ ] Implement keyboard navigation
- [ ] Add accessibility labels (ARIA)
- [ ] Test on mobile devices
- [ ] Add dark mode support

### Phase 7: Testing ✅
- [ ] Write unit tests for hooks
- [ ] Write component tests
- [ ] Write integration tests
- [ ] Test error scenarios
- [ ] Test polling behavior

---

## Additional Resources

- **Part 1:** [API Endpoints Reference](./NOTIFICATIONS_API_ENDPOINTS.md)
- **Part 2:** [Business Logic & Validation Rules](./NOTIFICATIONS_BUSINESS_LOGIC.md)
- **React Query Docs:** https://tanstack.com/query/latest
- **tRPC Docs:** https://trpc.io

---

## Support & Questions

For questions or issues:
1. Check the API endpoint documentation first
2. Review business logic rules
3. Consult the backend team if integration issues persist

**Backend Contact:** backend-team@yesgoddess.agency
