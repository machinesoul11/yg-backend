# 🌐 Notification Delivery System - Part 3: Frontend Implementation Guide

**Classification:** 🌐 SHARED  
**Module:** Notification Delivery  
**Last Updated:** October 14, 2025

> **Context:** Complete frontend implementation guide with TypeScript, React Query, UI components, and integration examples for Next.js 15 + App Router.

---

## Table of Contents

1. [Setup & Dependencies](#setup--dependencies)
2. [TypeScript Type Definitions](#typescript-type-definitions)
3. [tRPC Client Setup](#trpc-client-setup)
4. [React Query Hooks](#react-query-hooks)
5. [UI Components](#ui-components)
6. [Polling Strategy](#polling-strategy)
7. [Error Handling](#error-handling)
8. [Authorization & Permissions](#authorization--permissions)
9. [Testing Considerations](#testing-considerations)
10. [Implementation Checklist](#implementation-checklist)

---

## Setup & Dependencies

### Install Required Packages

```bash
npm install @tanstack/react-query@^5.0.0
npm install @trpc/client@^10.0.0
npm install @trpc/react-query@^10.0.0
npm install date-fns
npm install zustand  # For state management (optional)
```

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency/api/trpc
```

---

## TypeScript Type Definitions

Create `src/types/notifications.ts`:

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

export interface CreateNotificationParams {
  userId?: string;
  userIds?: string[];
  userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, any>;
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

export interface NotificationPreferencesResponse {
  data: NotificationPreferences;
}

export interface CreateNotificationResponse {
  data: {
    created: number;
    notificationIds: string[];
  };
}

// ========================================
// UI-Specific Types
// ========================================

export interface NotificationGroup {
  type: NotificationType;
  notifications: Notification[];
  unreadCount: number;
}

export interface NotificationFilter {
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  searchQuery?: string;
}
```

---

## tRPC Client Setup

### Create tRPC Client

Create `src/lib/trpc.ts`:

```typescript
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app'; // Adjust path

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.NEXT_PUBLIC_API_URL}`,
        headers: async () => {
          // Get auth token from your auth system
          const token = await getAuthToken();
          return {
            authorization: token ? `Bearer ${token}` : '',
          };
        },
      }),
    ],
  });
}

// Helper to get auth token
async function getAuthToken(): Promise<string | null> {
  // Implement based on your auth system
  // Example: NextAuth.js
  // const session = await getSession();
  // return session?.accessToken;
  
  // Example: Cookie-based
  // return document.cookie.includes('auth-token') ? getCookie('auth-token') : null;
  
  return null;
}
```

### Setup Query Client Provider

Create `src/app/providers.tsx`:

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { trpc, getTRPCClient } from '@/lib/trpc';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
      },
    },
  }));

  const [trpcClient] = useState(() => getTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

Update `src/app/layout.tsx`:

```typescript
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

## React Query Hooks

### Custom Hooks for Notifications

Create `src/hooks/useNotifications.ts`:

```typescript
import { trpc } from '@/lib/trpc';
import type {
  ListNotificationsParams,
  UpdatePreferencesParams,
  PollNotificationsParams,
} from '@/types/notifications';

// ========================================
// List Notifications
// ========================================

export function useNotifications(params: ListNotificationsParams = {}) {
  return trpc.system.notifications.list.useQuery(params, {
    keepPreviousData: true, // Smooth pagination
    refetchOnWindowFocus: true,
  });
}

// ========================================
// Unread Count
// ========================================

export function useUnreadCount() {
  return trpc.system.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnWindowFocus: true,
  });
}

// ========================================
// Mark as Read
// ========================================

export function useMarkAsRead() {
  const utils = trpc.useContext();

  return trpc.system.notifications.markAsRead.useMutation({
    onMutate: async ({ notificationId }) => {
      // Cancel outgoing refetches
      await utils.system.notifications.list.cancel();

      // Snapshot previous value
      const previousList = utils.system.notifications.list.getData();

      // Optimistically update
      utils.system.notifications.list.setData(
        {}, // Your current filter params
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((n) =>
              n.id === notificationId
                ? { ...n, read: true, readAt: new Date().toISOString() }
                : n
            ),
          };
        }
      );

      return { previousList };
    },

    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousList) {
        utils.system.notifications.list.setData({}, context.previousList);
      }
    },

    onSuccess: () => {
      // Invalidate queries
      utils.system.notifications.list.invalidate();
      utils.system.notifications.getUnreadCount.invalidate();
    },
  });
}

// ========================================
// Mark All as Read
// ========================================

export function useMarkAllAsRead() {
  const utils = trpc.useContext();

  return trpc.system.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.system.notifications.list.invalidate();
      utils.system.notifications.getUnreadCount.invalidate();
    },
  });
}

// ========================================
// Delete Notification
// ========================================

export function useDeleteNotification() {
  const utils = trpc.useContext();

  return trpc.system.notifications.delete.useMutation({
    onMutate: async ({ notificationId }) => {
      await utils.system.notifications.list.cancel();

      const previousList = utils.system.notifications.list.getData();

      // Optimistically remove
      utils.system.notifications.list.setData({}, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((n) => n.id !== notificationId),
          meta: {
            ...old.meta,
            pagination: {
              ...old.meta.pagination,
              total: old.meta.pagination.total - 1,
            },
          },
        };
      });

      return { previousList };
    },

    onError: (err, variables, context) => {
      if (context?.previousList) {
        utils.system.notifications.list.setData({}, context.previousList);
      }
    },

    onSuccess: () => {
      utils.system.notifications.list.invalidate();
      utils.system.notifications.getUnreadCount.invalidate();
    },
  });
}

// ========================================
// Preferences
// ========================================

export function useNotificationPreferences() {
  return trpc.system.notifications.getPreferences.useQuery();
}

export function useUpdatePreferences() {
  const utils = trpc.useContext();

  return trpc.system.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      utils.system.notifications.getPreferences.invalidate();
    },
  });
}

// ========================================
// Polling
// ========================================

export function usePollNotifications(params: PollNotificationsParams) {
  return trpc.system.notifications.poll.useQuery(params, {
    refetchInterval: 10000, // Poll every 10 seconds
    refetchOnWindowFocus: true,
  });
}

// ========================================
// Create Notification (Admin Only)
// ========================================

export function useCreateNotification() {
  const utils = trpc.useContext();

  return trpc.system.notifications.create.useMutation({
    onSuccess: () => {
      // Don't invalidate for admin - they're creating for other users
      // Individual users will see it when they poll
    },
  });
}
```

---

## UI Components

### 1. Notification Badge (Header)

```typescript
'use client';

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

  const count = data?.data.count ?? 0;

  return (
    <button
      className="relative p-2 rounded-full hover:bg-gray-100"
      aria-label={`${count} unread notifications`}
    >
      <BellIcon className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
```

### 2. Notification List

```typescript
'use client';

import { useNotifications, useMarkAsRead, useDeleteNotification } from '@/hooks/useNotifications';
import { NotificationItem } from './NotificationItem';
import { useState } from 'react';
import type { NotificationFilter } from '@/types/notifications';

export function NotificationList() {
  const [filter, setFilter] = useState<NotificationFilter>({
    read: false,
  });

  const [page, setPage] = useState(1);
  
  const { data, isLoading, error } = useNotifications({
    ...filter,
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
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load notifications</p>
      </div>
    );
  }

  const notifications = data?.data ?? [];
  const pagination = data?.meta.pagination;

  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <BellIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No notifications
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {filter.read === false
            ? "You're all caught up!"
            : 'No notifications to display'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setFilter({ read: false })}
            className={`${
              filter.read === false
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium`}
          >
            Unread
          </button>
          <button
            onClick={() => setFilter({})}
            className={`${
              filter.read === undefined
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium`}
          >
            All
          </button>
        </nav>
      </div>

      {/* Notification Items */}
      <ul className="divide-y divide-gray-200">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkAsRead={() => markAsRead.mutate({ notificationId: notification.id })}
            onDelete={() => deleteNotification.mutate({ notificationId: notification.id })}
          />
        ))}
      </ul>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === pagination.totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">{(page - 1) * pagination.pageSize + 1}</span>{' '}
                to{' '}
                <span className="font-medium">
                  {Math.min(page * pagination.pageSize, pagination.total)}
                </span>{' '}
                of <span className="font-medium">{pagination.total}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                {/* Page numbers */}
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(
                  (pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`${
                        pageNum === page
                          ? 'z-10 bg-blue-600 text-white'
                          : 'bg-white text-gray-900 hover:bg-gray-50'
                      } relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300`}
                    >
                      {pageNum}
                    </button>
                  )
                )}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 3. Notification Item

```typescript
'use client';

import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import type { Notification, NotificationPriority } from '@/types/notifications';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: () => void;
  onDelete: () => void;
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) {
  const priorityColors = {
    URGENT: 'bg-red-50 border-l-red-500',
    HIGH: 'bg-orange-50 border-l-orange-500',
    MEDIUM: 'bg-blue-50 border-l-blue-500',
    LOW: 'bg-gray-50 border-l-gray-500',
  };

  const priorityBadges = {
    URGENT: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-blue-100 text-blue-800',
    LOW: 'bg-gray-100 text-gray-800',
  };

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead();
    }
  };

  return (
    <li
      className={`${
        !notification.read ? 'bg-blue-50' : 'bg-white'
      } ${priorityColors[notification.priority]} border-l-4 p-4 hover:bg-gray-50 transition-colors`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0">
          <NotificationIcon type={notification.type} priority={notification.priority} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-medium text-gray-900">
                  {notification.title}
                </h4>
                {!notification.read && (
                  <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                    New
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadges[notification.priority]}`}>
                  {notification.priority}
                </span>
              </div>
              <p className="text-sm text-gray-700">{notification.message}</p>
              <p className="mt-1 text-xs text-gray-500">
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </p>
            </div>

            {/* Actions */}
            <div className="ml-4 flex-shrink-0 flex items-center gap-2">
              {!notification.read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsRead();
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  title="Mark as read"
                >
                  <CheckIcon className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-sm text-gray-400 hover:text-gray-600"
                title="Delete"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Action Button */}
          {notification.actionUrl && (
            <div className="mt-3">
              <Link
                href={notification.actionUrl}
                onClick={handleClick}
                className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                View Details
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// Helper component for notification icon
function NotificationIcon({
  type,
  priority,
}: {
  type: string;
  priority: NotificationPriority;
}) {
  const icons = {
    LICENSE: '📄',
    PAYOUT: '💰',
    ROYALTY: '📊',
    PROJECT: '🎨',
    SYSTEM: '🔔',
    MESSAGE: '💬',
  };

  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${
      priority === 'URGENT' ? 'bg-red-100' :
      priority === 'HIGH' ? 'bg-orange-100' :
      priority === 'MEDIUM' ? 'bg-blue-100' :
      'bg-gray-100'
    }`}>
      {icons[type as keyof typeof icons] || '🔔'}
    </div>
  );
}
```

### 4. Notification Preferences Form

```typescript
'use client';

import { useNotificationPreferences, useUpdatePreferences } from '@/hooks/useNotifications';
import { useState, useEffect } from 'react';
import { NotificationType, DigestFrequency } from '@/types/notifications';

export function NotificationPreferencesForm() {
  const { data, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdatePreferences();

  const [enabledTypes, setEnabledTypes] = useState<NotificationType[]>([]);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    DigestFrequency.IMMEDIATE
  );
  const [emailEnabled, setEmailEnabled] = useState(true);

  // Sync with fetched data
  useEffect(() => {
    if (data?.data) {
      setEnabledTypes(data.data.enabledTypes);
      setDigestFrequency(data.data.digestFrequency);
      setEmailEnabled(data.data.emailEnabled);
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updatePreferences.mutateAsync({
        enabledTypes,
        digestFrequency,
        emailEnabled,
      });
      alert('Preferences saved successfully!');
    } catch (error: any) {
      if (error.message.includes('verified email')) {
        alert('Please verify your email address before enabling email notifications.');
      } else {
        alert('Failed to save preferences. Please try again.');
      }
    }
  };

  const toggleType = (type: NotificationType) => {
    setEnabledTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  if (isLoading) {
    return <div>Loading preferences...</div>;
  }

  const notificationTypes = [
    { value: NotificationType.LICENSE, label: 'License Notifications', description: 'Expiry warnings, renewals' },
    { value: NotificationType.PAYOUT, label: 'Payout Notifications', description: 'Payment processing updates' },
    { value: NotificationType.ROYALTY, label: 'Royalty Statements', description: 'New statements available' },
    { value: NotificationType.PROJECT, label: 'Project Updates', description: 'Invitations, approvals' },
    { value: NotificationType.MESSAGE, label: 'Direct Messages', description: 'New messages from users' },
    { value: NotificationType.SYSTEM, label: 'System Announcements', description: 'Platform updates, maintenance' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Email Enabled */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4">Email Notifications</h3>
        
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <div>
              <span className="font-medium">Enable email notifications</span>
              <p className="text-sm text-gray-500">
                Receive notifications via email (requires verified email address)
              </p>
            </div>
          </label>

          {/* Digest Frequency */}
          {emailEnabled && (
            <div className="ml-7">
              <label className="block font-medium mb-2">Email Frequency</label>
              <select
                value={digestFrequency}
                onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                  Never send emails
                </option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {digestFrequency === DigestFrequency.IMMEDIATE && 
                  'You\'ll receive an email immediately for each notification (URGENT/HIGH priority always sent immediately)'}
                {digestFrequency === DigestFrequency.DAILY && 
                  'You\'ll receive one email per day at 9 AM with all unread notifications (URGENT/HIGH priority always sent immediately)'}
                {digestFrequency === DigestFrequency.WEEKLY && 
                  'You\'ll receive one email per week on Monday at 9 AM (URGENT/HIGH priority always sent immediately)'}
                {digestFrequency === DigestFrequency.NEVER && 
                  'No email notifications will be sent (URGENT priority may still be sent for critical issues)'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Notification Types */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4">Notification Types</h3>
        <p className="text-sm text-gray-500 mb-4">
          Choose which types of notifications you want to receive
        </p>

        <div className="space-y-3">
          {notificationTypes.map((type) => (
            <label key={type.value} className="flex items-start gap-3 p-3 rounded-md hover:bg-gray-50">
              <input
                type="checkbox"
                checked={enabledTypes.includes(type.value)}
                onChange={() => toggleType(type.value)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div>
                <span className="font-medium">{type.label}</span>
                <p className="text-sm text-gray-500">{type.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={updatePreferences.isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updatePreferences.isLoading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  );
}
```

---

## Polling Strategy

### Efficient Polling Implementation

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { usePollNotifications } from '@/hooks/useNotifications';
import { useQueryClient } from '@tanstack/react-query';

export function useNotificationPolling() {
  const queryClient = useQueryClient();
  const lastSeenRef = useRef<string | null>(null);

  const { data } = usePollNotifications({
    lastSeen: lastSeenRef.current ?? undefined,
  });

  useEffect(() => {
    if (data?.data) {
      // Update lastSeen timestamp
      lastSeenRef.current = data.data.lastSeen;

      // If new notifications, invalidate list
      if (data.data.newCount > 0) {
        queryClient.invalidateQueries(['system', 'notifications', 'list']);
        queryClient.invalidateQueries(['system', 'notifications', 'getUnreadCount']);

        // Optional: Show toast
        if (typeof window !== 'undefined' && window.Notification?.permission === 'granted') {
          new Notification('New Notification', {
            body: `You have ${data.data.newCount} new notification(s)`,
            icon: '/logo.png',
          });
        }
      }
    }
  }, [data, queryClient]);

  return {
    newCount: data?.data.newCount ?? 0,
    unreadCount: data?.data.unreadCount ?? 0,
  };
}

// Usage in layout or app wrapper
export function NotificationPoller() {
  const { newCount } = useNotificationPolling();

  // Poll runs automatically via React Query refetchInterval
  return null;
}
```

---

## Error Handling

### Comprehensive Error Handling

```typescript
import { TRPCClientError } from '@trpc/client';

export function handleNotificationError(error: unknown): string {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'NOT_FOUND':
        return 'Notification not found or already deleted';
      case 'FORBIDDEN':
        return 'You do not have permission to perform this action';
      case 'BAD_REQUEST':
        if (error.message.includes('verified email')) {
          return 'Please verify your email address first';
        }
        return error.message;
      case 'CONFLICT':
        return 'This action conflicts with an existing operation';
      case 'INTERNAL_SERVER_ERROR':
        return 'An unexpected error occurred. Please try again later.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  return 'An unexpected error occurred';
}

// Usage in component
function MyComponent() {
  const mutation = useMarkAsRead();

  const handleAction = async () => {
    try {
      await mutation.mutateAsync({ notificationId: 'xxx' });
    } catch (error) {
      const message = handleNotificationError(error);
      toast.error(message);
    }
  };
}
```

---

## Authorization & Permissions

### Role-Based Access Control

```typescript
// Notification creation is admin-only
function CreateNotificationButton() {
  const { data: session } = useSession();
  const createNotification = useCreateNotification();

  // Only show for admins
  if (session?.user?.role !== 'ADMIN') {
    return null;
  }

  return (
    <button onClick={() => {/* show modal */}}>
      Create Notification
    </button>
  );
}

// Viewing own notifications - no special permission needed
function NotificationList() {
  // All authenticated users can view their own notifications
  return <NotificationListComponent />;
}
```

---

## Testing Considerations

### Unit Tests

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useNotifications } from '@/hooks/useNotifications';

describe('useNotifications', () => {
  it('should fetch notifications', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data).toBeDefined();
  });

  it('should filter by read status', async () => {
    const { result } = renderHook(() => useNotifications({ read: false }));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const notifications = result.current.data?.data ?? [];
    expect(notifications.every(n => !n.read)).toBe(true);
  });
});
```

---

## Implementation Checklist

### Phase 1: Core Features
- [ ] Setup tRPC client and React Query
- [ ] Implement notification list component
- [ ] Implement unread count badge
- [ ] Add mark as read functionality
- [ ] Add delete notification functionality
- [ ] Implement pagination

### Phase 2: Preferences
- [ ] Create preferences form
- [ ] Implement email toggle with verification check
- [ ] Add digest frequency selector
- [ ] Implement notification type toggles
- [ ] Add save/cancel functionality

### Phase 3: Real-time Features
- [ ] Implement polling mechanism
- [ ] Add optimistic updates
- [ ] Implement browser notifications (optional)
- [ ] Add toast notifications for new items

### Phase 4: Polish
- [ ] Add loading skeletons
- [ ] Implement error boundaries
- [ ] Add accessibility features (ARIA labels)
- [ ] Optimize performance (memoization)
- [ ] Add analytics tracking

### Phase 5: Testing
- [ ] Write unit tests for hooks
- [ ] Write integration tests for components
- [ ] Test error scenarios
- [ ] Test polling behavior
- [ ] E2E tests for critical flows

---

## Next Steps

- **Part 1:** [API Reference](./NOTIFICATION_DELIVERY_PART_1_API_REFERENCE.md)
- **Part 2:** [Business Logic & Validation](./NOTIFICATION_DELIVERY_PART_2_BUSINESS_LOGIC.md)

---

**Questions or Issues?** Contact the backend team or refer to the implementation code in `src/modules/system/`.
