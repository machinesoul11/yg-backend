# 🌐 Notification System - Frontend Implementation Guide

**Classification:** 🌐 SHARED  
**Module:** Notifications  
**Last Updated:** October 14, 2025  
**Document:** Part 3 of 3 - Frontend Implementation, React Hooks & UI Components

> **Context:** This document provides step-by-step implementation guidance, React Query hooks, TypeScript utilities, and UI component examples for integrating the notification system into the frontend.

---

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [API Client Layer](#api-client-layer)
4. [React Query Hooks](#react-query-hooks)
5. [UI Components](#ui-components)
6. [Real-time Polling](#real-time-polling)
7. [Implementation Checklist](#implementation-checklist)
8. [Edge Cases & UX Considerations](#edge-cases--ux-considerations)

---

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install @tanstack/react-query
npm install date-fns  # For timestamp formatting
npm install lucide-react  # For icons (optional)
```

### 2. tRPC Client Setup

Ensure your tRPC client is configured to access the notification endpoints:

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

### 3. Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency
```

---

## TypeScript Type Definitions

Create a types file for notification-related types:

```typescript
// types/notifications.ts

/**
 * Notification types - matches backend enum
 */
export enum NotificationType {
  LICENSE = 'LICENSE',
  PAYOUT = 'PAYOUT',
  ROYALTY = 'ROYALTY',
  PROJECT = 'PROJECT',
  SYSTEM = 'SYSTEM',
  MESSAGE = 'MESSAGE'
}

/**
 * Priority levels - matches backend enum
 */
export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

/**
 * Digest frequency options
 */
export enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  NEVER = 'NEVER'
}

/**
 * Individual notification item
 */
export interface NotificationItem {
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

/**
 * Notification list response with pagination
 */
export interface NotificationListResponse {
  data: NotificationItem[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * Unread count response
 */
export interface UnreadCountResponse {
  data: {
    count: number;
  };
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  lastDigestSentAt?: string;
}

/**
 * Update preferences input
 */
export interface UpdatePreferencesInput {
  enabledTypes?: NotificationType[];
  digestFrequency?: DigestFrequency;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}

/**
 * Poll response
 */
export interface PollResponse {
  data: {
    notifications: NotificationItem[];
    newCount: number;
    unreadCount: number;
    lastSeen: string;
    suggestedPollInterval: number;
  };
}

/**
 * List notifications query params
 */
export interface ListNotificationsParams {
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  page?: number;
  pageSize?: number;
}

/**
 * Poll query params
 */
export interface PollParams {
  lastSeen?: string;
}
```

---

## API Client Layer

Create a centralized API client for notification operations:

```typescript
// lib/api/notifications.ts
import { trpc } from '@/lib/trpc';
import type {
  ListNotificationsParams,
  UpdatePreferencesInput,
  PollParams,
} from '@/types/notifications';

/**
 * Notification API client
 * Wraps tRPC calls for notifications
 */
export const notificationsApi = {
  /**
   * List notifications with filtering and pagination
   */
  list: (params: ListNotificationsParams) => {
    return trpc.system.notifications.list.query(params);
  },

  /**
   * Get unread notification count
   */
  getUnreadCount: () => {
    return trpc.system.notifications.getUnreadCount.query();
  },

  /**
   * Mark a notification as read
   */
  markAsRead: (notificationId: string) => {
    return trpc.system.notifications.markAsRead.mutate({ notificationId });
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: () => {
    return trpc.system.notifications.markAllAsRead.mutate();
  },

  /**
   * Delete (dismiss) a notification
   */
  delete: (notificationId: string) => {
    return trpc.system.notifications.delete.mutate({ notificationId });
  },

  /**
   * Get user preferences
   */
  getPreferences: () => {
    return trpc.system.notifications.getPreferences.query();
  },

  /**
   * Update user preferences
   */
  updatePreferences: (input: UpdatePreferencesInput) => {
    return trpc.system.notifications.updatePreferences.mutate(input);
  },

  /**
   * Poll for new notifications
   */
  poll: (params: PollParams) => {
    return trpc.system.notifications.poll.query(params);
  },

  /**
   * Create notification (admin only)
   */
  create: (input: any) => {
    return trpc.system.notifications.create.mutate(input);
  },
};
```

---

## React Query Hooks

Create reusable hooks for notification operations:

```typescript
// hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications';
import type {
  ListNotificationsParams,
  UpdatePreferencesInput,
} from '@/types/notifications';

/**
 * Query key factory for notifications
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: ListNotificationsParams) => 
    [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
  poll: (lastSeen?: string) => 
    [...notificationKeys.all, 'poll', lastSeen] as const,
};

// ========================================
// List Notifications
// ========================================

export function useNotifications(params: ListNotificationsParams = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationsApi.list(params),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes (formerly cacheTime)
  });
}

// ========================================
// Unread Count
// ========================================

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsApi.getUnreadCount(),
    staleTime: 10_000, // 10 seconds
    refetchInterval: 30_000, // Refetch every 30 seconds
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
    onMutate: async (notificationId) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ 
        queryKey: notificationKeys.lists() 
      });

      // Snapshot previous value
      const previousNotifications = queryClient.getQueriesData({ 
        queryKey: notificationKeys.lists() 
      });

      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((n: any) =>
              n.id === notificationId
                ? { ...n, read: true, readAt: new Date().toISOString() }
                : n
            ),
          };
        }
      );

      return { previousNotifications };
    },
    onError: (err, variables, context) => {
      // Revert on error
      if (context?.previousNotifications) {
        context.previousNotifications.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSuccess: () => {
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
    onMutate: async (notificationId) => {
      // Optimistically remove from UI
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
    },
    onSuccess: () => {
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
    staleTime: 5 * 60_000, // 5 minutes
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) =>
      notificationsApi.updatePreferences(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: notificationKeys.preferences() 
      });
    },
  });
}

// ========================================
// Polling
// ========================================

export function usePollNotifications(lastSeen?: string) {
  return useQuery({
    queryKey: notificationKeys.poll(lastSeen),
    queryFn: () => notificationsApi.poll({ lastSeen }),
    enabled: false, // Manual polling control
    retry: false,
    staleTime: 0,
  });
}
```

---

## UI Components

### 1. Notification Badge (Unread Count)

```typescript
// components/NotificationBadge.tsx
import { useUnreadCount } from '@/hooks/useNotifications';

export function NotificationBadge() {
  const { data, isLoading } = useUnreadCount();

  if (isLoading) {
    return (
      <div className="relative">
        <BellIcon className="h-6 w-6" />
      </div>
    );
  }

  const count = data?.data?.count || 0;

  return (
    <div className="relative">
      <BellIcon className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  );
}
```

### 2. Notification List

```typescript
// components/NotificationList.tsx
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications, useMarkAsRead } from '@/hooks/useNotifications';
import type { NotificationItem } from '@/types/notifications';

export function NotificationList() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useNotifications({ 
    page, 
    pageSize: 20 
  });
  const markAsRead = useMarkAsRead();

  if (isLoading) {
    return <NotificationListSkeleton />;
  }

  if (error) {
    return (
      <div className="text-red-600 p-4">
        Failed to load notifications. Please try again.
      </div>
    );
  }

  const notifications = data?.data || [];
  const pagination = data?.meta?.pagination;

  if (notifications.length === 0) {
    return (
      <div className="text-gray-500 text-center p-8">
        <BellIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No notifications</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={() => markAsRead.mutate(notification.id)}
        />
      ))}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 p-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

### 3. Individual Notification Item

```typescript
// components/NotificationItem.tsx
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useDeleteNotification } from '@/hooks/useNotifications';
import type { NotificationItem as NotificationItemType } from '@/types/notifications';

interface NotificationItemProps {
  notification: NotificationItemType;
  onRead: () => void;
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const router = useRouter();
  const deleteNotification = useDeleteNotification();

  const handleClick = () => {
    // Mark as read
    if (!notification.read) {
      onRead();
    }

    // Navigate if actionUrl exists
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNotification.mutate(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`
        p-4 hover:bg-gray-50 cursor-pointer transition-colors
        ${!notification.read ? 'bg-blue-50 border-l-4 border-blue-500' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Icon based on type */}
          <div className="flex items-center gap-2 mb-1">
            <NotificationIcon type={notification.type} />
            <span className={`
              text-xs font-semibold uppercase
              ${getPriorityColor(notification.priority)}
            `}>
              {notification.type}
            </span>
          </div>

          {/* Title */}
          <h4 className="font-semibold text-gray-900 mb-1">
            {notification.title}
          </h4>

          {/* Message */}
          <p className="text-sm text-gray-600 mb-2">
            {notification.message}
          </p>

          {/* Timestamp */}
          <p className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(notification.createdAt), { 
              addSuffix: true 
            })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-4">
          {!notification.read && (
            <div className="h-2 w-2 bg-blue-500 rounded-full" />
          )}
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-600 transition-colors"
            aria-label="Delete notification"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper: Get priority color
function getPriorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case 'LOW':
      return 'text-gray-500';
    case 'MEDIUM':
      return 'text-blue-600';
    case 'HIGH':
      return 'text-orange-600';
    case 'URGENT':
      return 'text-red-600';
    default:
      return 'text-gray-500';
  }
}

// Helper: Get icon for notification type
function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case 'LICENSE':
      return <FileTextIcon className="h-4 w-4 text-blue-600" />;
    case 'PAYOUT':
      return <DollarSignIcon className="h-4 w-4 text-green-600" />;
    case 'ROYALTY':
      return <TrendingUpIcon className="h-4 w-4 text-purple-600" />;
    case 'PROJECT':
      return <FolderIcon className="h-4 w-4 text-indigo-600" />;
    case 'SYSTEM':
      return <InfoIcon className="h-4 w-4 text-gray-600" />;
    case 'MESSAGE':
      return <MessageSquareIcon className="h-4 w-4 text-pink-600" />;
    default:
      return <BellIcon className="h-4 w-4 text-gray-600" />;
  }
}
```

### 4. Notification Preferences

```typescript
// components/NotificationPreferences.tsx
import { useNotificationPreferences, useUpdatePreferences } from '@/hooks/useNotifications';
import { NotificationType, DigestFrequency } from '@/types/notifications';

export function NotificationPreferences() {
  const { data, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdatePreferences();

  if (isLoading) {
    return <div>Loading preferences...</div>;
  }

  const preferences = data?.data;

  const handleToggleType = (type: NotificationType) => {
    const currentTypes = preferences?.enabledTypes || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];

    updatePreferences.mutate({ enabledTypes: newTypes });
  };

  const handleDigestChange = (frequency: DigestFrequency) => {
    updatePreferences.mutate({ digestFrequency: frequency });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Notification Types</h3>
        <div className="space-y-3">
          {Object.values(NotificationType).map((type) => (
            <label key={type} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={preferences?.enabledTypes.includes(type)}
                onChange={() => handleToggleType(type)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <div>
                <div className="font-medium">{formatTypeName(type)}</div>
                <div className="text-sm text-gray-500">
                  {getTypeDescription(type)}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Email Digest</h3>
        <select
          value={preferences?.digestFrequency}
          onChange={(e) => handleDigestChange(e.target.value as DigestFrequency)}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="IMMEDIATE">Immediate (as they happen)</option>
          <option value="DAILY">Daily digest (9 AM)</option>
          <option value="WEEKLY">Weekly digest (Mondays)</option>
          <option value="NEVER">Never (in-app only)</option>
        </select>
      </div>

      <div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preferences?.emailEnabled}
            onChange={(e) => 
              updatePreferences.mutate({ emailEnabled: e.target.checked })
            }
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="font-medium">Enable email notifications</span>
        </label>
      </div>
    </div>
  );
}

function formatTypeName(type: NotificationType): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function getTypeDescription(type: NotificationType): string {
  switch (type) {
    case 'LICENSE':
      return 'License approvals, renewals, and expiry notices';
    case 'PAYOUT':
      return 'Payment processing and payout confirmations';
    case 'ROYALTY':
      return 'Royalty statements and earnings reports';
    case 'PROJECT':
      return 'Project invitations and collaboration updates';
    case 'SYSTEM':
      return 'Platform announcements and maintenance notices';
    case 'MESSAGE':
      return 'Direct messages from other users';
    default:
      return '';
  }
}
```

---

## Real-time Polling

### Polling Hook

```typescript
// hooks/useNotificationPolling.ts
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/notifications';
import { notificationKeys } from '@/hooks/useNotifications';

export function useNotificationPolling() {
  const queryClient = useQueryClient();
  const [isPolling, setIsPolling] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const pollIntervalRef = useRef<number>(10000); // 10 seconds
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const poll = async () => {
    try {
      const { data } = await notificationsApi.poll({ 
        lastSeen: lastSeen || undefined 
      });

      // Update lastSeen
      setLastSeen(data.lastSeen);

      // Update poll interval
      pollIntervalRef.current = (data.suggestedPollInterval || 10) * 1000;

      // If new notifications, invalidate queries
      if (data.newCount > 0) {
        queryClient.invalidateQueries({ 
          queryKey: notificationKeys.lists() 
        });
        queryClient.invalidateQueries({ 
          queryKey: notificationKeys.unreadCount() 
        });

        // Optional: Show toast notification
        // toast.info(`You have ${data.newCount} new notification(s)`);
      }

    } catch (error: any) {
      if (error?.status === 429) {
        // Rate limited - use retryAfter
        const retryAfter = error.data?.retryAfter || 10;
        pollIntervalRef.current = retryAfter * 1000;
      } else {
        // Other error - exponential backoff
        pollIntervalRef.current = Math.min(
          pollIntervalRef.current * 2,
          60000 // Max 1 minute
        );
      }
    } finally {
      // Schedule next poll
      if (isPolling) {
        timerRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    }
  };

  const startPolling = () => {
    if (!isPolling) {
      setIsPolling(true);
      poll();
    }
  };

  const stopPolling = () => {
    setIsPolling(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Handle tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else if (isPolling) {
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPolling]);

  return {
    isPolling,
    startPolling,
    stopPolling,
  };
}
```

### Using the Polling Hook

```typescript
// app/layout.tsx or app/dashboard/layout.tsx
'use client';

import { useNotificationPolling } from '@/hooks/useNotificationPolling';
import { useEffect } from 'react';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { startPolling, stopPolling } = useNotificationPolling();

  useEffect(() => {
    // Start polling when component mounts
    startPolling();

    // Stop polling when component unmounts
    return () => {
      stopPolling();
    };
  }, []);

  return (
    <div>
      {/* Your layout with NotificationBadge, etc. */}
      {children}
    </div>
  );
}
```

---

## Implementation Checklist

### Phase 1: Basic Display

- [ ] Install dependencies (`@tanstack/react-query`, `date-fns`)
- [ ] Create TypeScript types (`types/notifications.ts`)
- [ ] Set up API client layer (`lib/api/notifications.ts`)
- [ ] Create React Query hooks (`hooks/useNotifications.ts`)
- [ ] Implement unread count badge in navigation
- [ ] Create notification list component
- [ ] Add click handler to navigate to `actionUrl`
- [ ] Test with sample data

### Phase 2: User Actions

- [ ] Implement mark as read (single notification)
- [ ] Add optimistic updates for mark as read
- [ ] Implement delete notification
- [ ] Add optimistic updates for delete
- [ ] Implement mark all as read
- [ ] Add confirmation dialog for destructive actions
- [ ] Test all mutations

### Phase 3: Filtering & Pagination

- [ ] Add filter by notification type
- [ ] Add filter by read/unread status
- [ ] Add filter by priority
- [ ] Implement pagination controls
- [ ] Add loading skeletons
- [ ] Test edge cases (empty states, errors)

### Phase 4: Preferences

- [ ] Create preferences UI component
- [ ] Implement toggle for notification types
- [ ] Add digest frequency selector
- [ ] Add email enable/disable toggle
- [ ] Show email verification status
- [ ] Test preference updates

### Phase 5: Real-time Updates

- [ ] Implement polling hook
- [ ] Add tab visibility handling
- [ ] Test rate limiting behavior
- [ ] Add error handling and retry logic
- [ ] Optimize poll interval based on response
- [ ] Test across multiple tabs

### Phase 6: UX Polish

- [ ] Add toast notifications for new items
- [ ] Implement sound/vibration (optional)
- [ ] Add keyboard shortcuts (optional)
- [ ] Improve loading states
- [ ] Add empty states with helpful messaging
- [ ] Add error boundaries
- [ ] Test accessibility (screen readers, keyboard nav)

### Phase 7: Admin Features (if applicable)

- [ ] Create admin notification creation form
- [ ] Add user/role selector
- [ ] Implement broadcast notification UI
- [ ] Add preview before sending
- [ ] Test admin-only access control

---

## Edge Cases & UX Considerations

### 1. Empty States

```typescript
// Show helpful message when no notifications
if (notifications.length === 0) {
  return (
    <EmptyState
      icon={<BellIcon />}
      title="No notifications"
      description={
        params.read === false
          ? "You're all caught up!"
          : "You haven't received any notifications yet"
      }
    />
  );
}
```

### 2. Error Handling

```typescript
// Graceful error display
if (error) {
  return (
    <ErrorState
      title="Failed to load notifications"
      description="Please try again or contact support if the issue persists"
      action={
        <button onClick={() => refetch()}>
          Retry
        </button>
      }
    />
  );
}
```

### 3. Optimistic Updates

```typescript
// Always implement optimistic updates for better UX
// Example: Mark as read immediately, revert if fails
onMutate: async (notificationId) => {
  // Cancel outgoing queries
  await queryClient.cancelQueries({ queryKey: notificationKeys.lists() });
  
  // Snapshot previous
  const previous = queryClient.getQueryData(notificationKeys.lists());
  
  // Optimistically update
  queryClient.setQueryData(notificationKeys.lists(), (old) => {
    // Update notification to read=true
  });
  
  return { previous };
},
onError: (err, variables, context) => {
  // Revert on error
  queryClient.setQueryData(notificationKeys.lists(), context.previous);
}
```

### 4. Rate Limiting Feedback

```typescript
// Show user-friendly message when rate limited
if (error?.status === 429) {
  const retryAfter = error.data?.retryAfter || 10;
  return (
    <div className="text-amber-600 p-4 rounded bg-amber-50">
      <p>Polling too frequently. Will retry in {retryAfter} seconds.</p>
    </div>
  );
}
```

### 5. Stale Data Handling

```typescript
// Use staleTime to balance freshness vs. performance
useQuery({
  queryKey: notificationKeys.unreadCount(),
  queryFn: () => notificationsApi.getUnreadCount(),
  staleTime: 10_000, // Consider fresh for 10 seconds
  gcTime: 5 * 60_000, // Keep in cache for 5 minutes
  refetchInterval: 30_000, // Refetch every 30 seconds
});
```

### 6. Accessibility

```typescript
// Add ARIA labels and keyboard support
<button
  onClick={handleDelete}
  aria-label={`Delete notification: ${notification.title}`}
  className="..."
>
  <XIcon className="h-5 w-5" />
</button>

// Add keyboard navigation
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  {/* Notification content */}
</div>
```

### 7. Mobile Considerations

```typescript
// Reduce poll frequency on mobile to save battery
const pollInterval = isMobile() ? 30000 : 10000;

// Use intersection observer for infinite scroll on mobile
const { ref, inView } = useInView();

useEffect(() => {
  if (inView && hasNextPage) {
    fetchNextPage();
  }
}, [inView, hasNextPage]);
```

### 8. Network Resilience

```typescript
// Handle offline/online transitions
useEffect(() => {
  const handleOnline = () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    startPolling();
  };

  const handleOffline = () => {
    stopPolling();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);
```

---

## Summary

You now have everything needed to implement the notification system:

✅ **Complete API reference** with all endpoints  
✅ **TypeScript types** for type safety  
✅ **React Query hooks** for data fetching  
✅ **UI components** with examples  
✅ **Real-time polling** implementation  
✅ **Error handling** and edge cases  
✅ **UX best practices** and optimizations

---

## Related Documents

- **Part 1:** [API Endpoints & Type Definitions](./NOTIFICATION_SYSTEM_COMPLETE_API_REFERENCE.md)
- **Part 2:** [Business Logic & Validation Rules](./NOTIFICATION_SYSTEM_COMPLETE_BUSINESS_LOGIC.md)

---

**Questions or Issues?** Contact the backend team or file an issue in the repository.
