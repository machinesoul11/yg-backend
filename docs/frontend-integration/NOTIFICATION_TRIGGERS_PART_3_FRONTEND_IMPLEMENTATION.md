# 🌐 Notification Triggers - Part 3: Frontend Implementation Guide

**Classification:** 🌐 SHARED - All users receive notifications (website and email)

**Last Updated:** October 14, 2025

---

## Table of Contents
- [Frontend Architecture](#frontend-architecture)
- [React Query Integration](#react-query-integration)
- [Real-time Updates](#real-time-updates)
- [UI Components by Trigger Type](#ui-components-by-trigger-type)
- [Notification Center Implementation](#notification-center-implementation)
- [Toast & Banner Notifications](#toast--banner-notifications)
- [Complete Implementation Checklist](#complete-implementation-checklist)

---

## Frontend Architecture

### Recommended Stack

```typescript
// Dependencies
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",    // Data fetching & caching
    "react-hot-toast": "^2.4.1",          // Toast notifications
    "date-fns": "^3.0.0",                 // Date formatting
    "lucide-react": "^0.300.0"            // Icons
  }
}
```

### Directory Structure

```
src/
├── features/
│   └── notifications/
│       ├── api/
│       │   ├── notificationApi.ts        # API client
│       │   └── notificationQueries.ts    # React Query hooks
│       ├── components/
│       │   ├── NotificationBell.tsx      # Header bell icon
│       │   ├── NotificationCenter.tsx    # Dropdown panel
│       │   ├── NotificationItem.tsx      # Single notification
│       │   └── triggers/                 # Trigger-specific components
│       │       ├── LicenseExpiryNotification.tsx
│       │       ├── MessageNotification.tsx
│       │       ├── PayoutNotification.tsx
│       │       └── ProjectInvitationNotification.tsx
│       ├── hooks/
│       │   ├── useNotifications.ts       # Main hook
│       │   ├── useNotificationPolling.ts # Real-time updates
│       │   └── useNotificationActions.ts # Mark read, delete
│       ├── types/
│       │   └── notification.types.ts     # TypeScript interfaces
│       └── utils/
│           ├── formatNotification.ts     # Formatting helpers
│           └── notificationIcons.ts      # Icon mapping
```

---

## React Query Integration

### API Client Setup

**File:** `src/features/notifications/api/notificationApi.ts`

```typescript
import { Notification, NotificationType, NotificationPriority } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';

interface ListNotificationsParams {
  page?: number;
  pageSize?: number;
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
}

interface ListNotificationsResponse {
  success: boolean;
  data: Notification[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface UnreadCountResponse {
  success: boolean;
  unreadCount: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

interface PollResponse {
  success: boolean;
  hasNew: boolean;
  data: Notification[];
  unreadCount: number;
}

export const notificationApi = {
  /**
   * List notifications with pagination and filters
   */
  list: async (params: ListNotificationsParams): Promise<ListNotificationsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params.read !== undefined) searchParams.set('read', params.read.toString());
    if (params.type) searchParams.set('type', params.type);
    if (params.priority) searchParams.set('priority', params.priority);

    const response = await fetch(`${API_BASE}/api/notifications?${searchParams}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    return response.json();
  },

  /**
   * Get unread count
   */
  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    const response = await fetch(`${API_BASE}/api/notifications/unread`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch unread count');
    }

    return response.json();
  },

  /**
   * Poll for new notifications (long-polling)
   */
  poll: async (lastSeen?: Date): Promise<PollResponse> => {
    const url = lastSeen
      ? `${API_BASE}/api/notifications/poll?lastSeen=${lastSeen.toISOString()}`
      : `${API_BASE}/api/notifications/poll`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to poll notifications');
    }

    return response.json();
  },

  /**
   * Mark notification as read
   */
  markAsRead: async (notificationId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE}/api/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to mark notification as read');
    }

    return response.json();
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async (): Promise<{ success: boolean; updated: number }> => {
    const response = await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to mark all as read');
    }

    return response.json();
  },
};

// Helper to get auth token (adjust based on your auth setup)
function getAuthToken(): string {
  // Example: return token from localStorage, cookie, or auth context
  return localStorage.getItem('auth_token') || '';
}
```

### React Query Hooks

**File:** `src/features/notifications/api/notificationQueries.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from './notificationApi';
import type { NotificationType, NotificationPriority } from '@/types';

/**
 * Query key factory for notifications
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...notificationKeys.lists(), filters] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
  detail: (id: string) => [...notificationKeys.all, 'detail', id] as const,
};

/**
 * Hook to fetch notifications list
 */
export function useNotifications(params?: {
  page?: number;
  pageSize?: number;
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
}) {
  return useQuery({
    queryKey: notificationKeys.list(params || {}),
    queryFn: () => notificationApi.list(params || {}),
    staleTime: 30 * 1000, // Consider fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}

/**
 * Hook to fetch unread count
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationApi.getUnreadCount(),
    staleTime: 10 * 1000, // Refresh every 10 seconds
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
}

/**
 * Hook to mark notification as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationApi.markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

/**
 * Hook to mark all notifications as read
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      // Invalidate all notification queries
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
```

---

## Real-time Updates

### Polling Implementation

**File:** `src/features/notifications/hooks/useNotificationPolling.ts`

```typescript
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../api/notificationApi';
import { notificationKeys } from '../api/notificationQueries';
import { toast } from 'react-hot-toast';
import type { Notification } from '@/types';

interface PollingOptions {
  enabled?: boolean;
  onNewNotification?: (notification: Notification) => void;
}

/**
 * Hook for real-time notification updates using long-polling
 */
export function useNotificationPolling(options: PollingOptions = {}) {
  const { enabled = true, onNewNotification } = options;
  const queryClient = useQueryClient();
  const lastSeenRef = useRef<Date>(new Date());
  const pollingRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        // Create abort controller for this poll request
        pollingRef.current = new AbortController();

        const response = await notificationApi.poll(lastSeenRef.current);

        if (response.hasNew && response.data.length > 0) {
          // Update last seen timestamp
          lastSeenRef.current = new Date();

          // Invalidate queries to refetch
          queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
          queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });

          // Call callback for each new notification
          response.data.forEach((notification) => {
            onNewNotification?.(notification);

            // Show toast for high priority notifications
            if (notification.priority === 'HIGH' || notification.priority === 'URGENT') {
              showNotificationToast(notification);
            }
          });
        }

        // Continue polling
        setTimeout(poll, 1000); // Wait 1 second before next poll
      } catch (error) {
        // If polling fails, retry after 5 seconds
        console.error('Polling error:', error);
        setTimeout(poll, 5000);
      }
    };

    // Start polling
    poll();

    // Cleanup on unmount
    return () => {
      pollingRef.current?.abort();
    };
  }, [enabled, onNewNotification, queryClient]);
}

/**
 * Show toast notification for high-priority items
 */
function showNotificationToast(notification: Notification) {
  const icon = getNotificationIcon(notification.type);
  
  toast.custom(
    (t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
      >
        <div className="flex-1 w-0 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 pt-0.5">{icon}</div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">{notification.title}</p>
              <p className="mt-1 text-sm text-gray-500">{notification.message}</p>
            </div>
          </div>
        </div>
        <div className="flex border-l border-gray-200">
          <button
            onClick={() => {
              toast.dismiss(t.id);
              if (notification.actionUrl) {
                window.location.href = notification.actionUrl;
              }
            }}
            className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none"
          >
            View
          </button>
        </div>
      </div>
    ),
    {
      duration: 5000,
      position: 'top-right',
    }
  );
}

function getNotificationIcon(type: string) {
  // Icon mapping (use your icon library)
  const icons: Record<string, JSX.Element> = {
    LICENSE: <span>📄</span>,
    MESSAGE: <span>💬</span>,
    ROYALTY: <span>💎</span>,
    PAYOUT: <span>💰</span>,
    PROJECT: <span>📋</span>,
    SYSTEM: <span>⚙️</span>,
  };
  return icons[type] || <span>🔔</span>;
}
```

---

## UI Components by Trigger Type

### License Expiry Notification Component

**File:** `src/features/notifications/components/triggers/LicenseExpiryNotification.tsx`

```typescript
import { formatDistanceToNow } from 'date-fns';
import { Clock, AlertTriangle } from 'lucide-react';
import type { Notification } from '@/types';

interface LicenseExpiryNotificationProps {
  notification: Notification;
  onRead: () => void;
}

export function LicenseExpiryNotification({ notification, onRead }: LicenseExpiryNotificationProps) {
  const metadata = notification.metadata as {
    licenseId: string;
    licenseName: string;
    expiryDate: string;
    daysUntilExpiry: number;
    autoRenewEnabled?: boolean;
  };

  const isUrgent = metadata.daysUntilExpiry <= 30;

  return (
    <div
      className={`p-4 border-l-4 ${
        isUrgent ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'
      } cursor-pointer hover:bg-opacity-75 transition`}
      onClick={() => {
        onRead();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
      }}
    >
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${isUrgent ? 'text-red-600' : 'text-yellow-600'}`}>
          {isUrgent ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">{notification.title}</p>
            <p className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </p>
          </div>
          <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
          <div className="mt-2 flex items-center space-x-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {metadata.daysUntilExpiry} days remaining
            </span>
            {metadata.autoRenewEnabled && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Auto-renewal enabled
              </span>
            )}
          </div>
          <div className="mt-3">
            <button className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
              View License Details →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Message Notification Component

```typescript
import { MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '@/types';

interface MessageNotificationProps {
  notification: Notification;
  onRead: () => void;
}

export function MessageNotification({ notification, onRead }: MessageNotificationProps) {
  const metadata = notification.metadata as {
    threadId: string;
    senderId: string;
    senderName: string;
    messagePreview: string;
    messageCount?: number;
  };

  const isBundled = metadata.messageCount && metadata.messageCount > 1;

  return (
    <div
      className="p-4 hover:bg-gray-50 cursor-pointer transition border-b border-gray-200"
      onClick={() => {
        onRead();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
      }}
    >
      <div className="flex items-start">
        <div className="flex-shrink-0 text-blue-600">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {isBundled
                ? `${metadata.messageCount} new messages from ${metadata.senderName}`
                : `New message from ${metadata.senderName}`}
            </p>
            {!notification.read && (
              <span className="h-2 w-2 bg-blue-600 rounded-full"></span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{metadata.messagePreview}</p>
          <p className="mt-1 text-xs text-gray-500">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Payout Notification Component

```typescript
import { DollarSign, XCircle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '@/types';

interface PayoutNotificationProps {
  notification: Notification;
  onRead: () => void;
}

export function PayoutNotification({ notification, onRead }: PayoutNotificationProps) {
  const metadata = notification.metadata as {
    payoutId: string;
    amount: number;
    currency: string;
    status: 'completed' | 'failed';
    failureReason?: string;
  };

  const isFailed = metadata.status === 'failed';
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: metadata.currency,
  }).format(metadata.amount / 100);

  return (
    <div
      className={`p-4 border-l-4 ${
        isFailed ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-50'
      } cursor-pointer hover:bg-opacity-75 transition`}
      onClick={() => {
        onRead();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
      }}
    >
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${isFailed ? 'text-red-600' : 'text-green-600'}`}>
          {isFailed ? <XCircle className="h-6 w-6" /> : <CheckCircle className="h-6 w-6" />}
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">{notification.title}</p>
            <p className="text-sm font-bold text-gray-900">{formattedAmount}</p>
          </div>
          <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
          {isFailed && metadata.failureReason && (
            <div className="mt-2 p-2 bg-white rounded border border-red-200">
              <p className="text-xs text-red-800">
                <strong>Reason:</strong> {metadata.failureReason}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
          {isFailed && (
            <div className="mt-3">
              <button className="text-sm font-medium text-red-600 hover:text-red-500">
                Update Payment Method →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Notification Center Implementation

### Main Notification Center Component

**File:** `src/features/notifications/components/NotificationCenter.tsx`

```typescript
import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '../api/notificationQueries';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import { LicenseExpiryNotification } from './triggers/LicenseExpiryNotification';
import { MessageNotification } from './triggers/MessageNotification';
import { PayoutNotification } from './triggers/PayoutNotification';
import type { Notification } from '@/types';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: unreadData } = useUnreadCount();
  const { data: notificationsData, isLoading } = useNotifications({
    read: filter === 'unread' ? false : undefined,
    pageSize: 20,
  });

  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  // Enable real-time polling
  useNotificationPolling({
    enabled: true,
    onNewNotification: (notification) => {
      console.log('New notification:', notification);
    },
  });

  const handleMarkAsRead = (notificationId: string) => {
    markAsRead.mutate(notificationId);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  const unreadCount = unreadData?.unreadCount || 0;
  const notifications = notificationsData?.data || [];

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl z-50 border border-gray-200">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-indigo-600 hover:text-indigo-500 flex items-center"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="mt-3 flex space-x-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-sm rounded ${
                  filter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 text-sm rounded ${
                  filter === 'unread'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="p-8 text-center text-gray-500">
                <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-indigo-600 rounded-full mx-auto"></div>
                <p className="mt-2">Loading notifications...</p>
              </div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <Bell className="h-12 w-12 mx-auto text-gray-400" />
                <p className="mt-2">No notifications</p>
              </div>
            )}

            {!isLoading &&
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={() => handleMarkAsRead(notification.id)}
                />
              ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 text-center">
              <a
                href="/notifications"
                className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
              >
                View all notifications →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Router component to render correct notification type
 */
function NotificationItem({ notification, onRead }: { notification: Notification; onRead: () => void }) {
  // Route to appropriate component based on type
  switch (notification.type) {
    case 'LICENSE':
      if ((notification.metadata as any).notificationType === 'expiry') {
        return <LicenseExpiryNotification notification={notification} onRead={onRead} />;
      }
      // Handle other LICENSE types (approval, etc.)
      return <DefaultNotification notification={notification} onRead={onRead} />;

    case 'MESSAGE':
      return <MessageNotification notification={notification} onRead={onRead} />;

    case 'PAYOUT':
      return <PayoutNotification notification={notification} onRead={onRead} />;

    // Add other cases as needed
    default:
      return <DefaultNotification notification={notification} onRead={onRead} />;
  }
}

/**
 * Generic fallback notification component
 */
function DefaultNotification({ notification, onRead }: { notification: Notification; onRead: () => void }) {
  return (
    <div
      className="p-4 hover:bg-gray-50 cursor-pointer transition border-b border-gray-200"
      onClick={() => {
        onRead();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
      }}
    >
      <div className="flex items-start">
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium text-gray-900">{notification.title}</p>
          <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
        </div>
        {!notification.read && <span className="h-2 w-2 bg-blue-600 rounded-full"></span>}
      </div>
    </div>
  );
}
```

---

## Toast & Banner Notifications

### High-Priority Toast Notifications

For urgent notifications (URGENT priority), show a prominent toast:

```typescript
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export function showUrgentNotificationToast(notification: Notification) {
  const isPayout = notification.type === 'PAYOUT';
  const isFailed = (notification.metadata as any).status === 'failed';

  toast.custom(
    (t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-md w-full bg-white shadow-xl rounded-lg pointer-events-auto border-l-4 ${
          isFailed ? 'border-red-600' : 'border-green-600'
        }`}
      >
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {isFailed ? (
                <XCircle className="h-6 w-6 text-red-600" />
              ) : (
                <CheckCircle className="h-6 w-6 text-green-600" />
              )}
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-bold text-gray-900">{notification.title}</p>
              <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
              <div className="mt-3 flex space-x-2">
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    if (notification.actionUrl) {
                      window.location.href = notification.actionUrl;
                    }
                  }}
                  className="px-3 py-1 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
                >
                  View Details
                </button>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      duration: 10000, // 10 seconds for urgent
      position: 'top-right',
    }
  );
}
```

---

## Complete Implementation Checklist

### Phase 1: Setup (Week 1)

- [ ] Install dependencies (`@tanstack/react-query`, `react-hot-toast`, `date-fns`)
- [ ] Create notification types file with all interfaces
- [ ] Set up API client (`notificationApi.ts`)
- [ ] Configure React Query provider in app root
- [ ] Test API connection with `/api/notifications` endpoint

### Phase 2: Core Components (Week 1-2)

- [ ] Implement `useNotifications` hook
- [ ] Implement `useUnreadCount` hook
- [ ] Build `NotificationBell` component (header icon with badge)
- [ ] Build `NotificationCenter` dropdown panel
- [ ] Add mark as read functionality
- [ ] Add mark all as read functionality

### Phase 3: Trigger-Specific Components (Week 2)

- [ ] Create `LicenseExpiryNotification` component
- [ ] Create `MessageNotification` component
- [ ] Create `PayoutNotification` component (completed & failed)
- [ ] Create `RoyaltyStatementNotification` component
- [ ] Create `ProjectInvitationNotification` component
- [ ] Create `AssetApprovalNotification` component

### Phase 4: Real-time Updates (Week 3)

- [ ] Implement `useNotificationPolling` hook
- [ ] Test long-polling connection
- [ ] Add toast notifications for high-priority items
- [ ] Handle WebSocket/SSE fallback (future enhancement)
- [ ] Add error handling for network failures

### Phase 5: Full Page View (Week 3)

- [ ] Create `/notifications` page route
- [ ] Add pagination to notification list
- [ ] Add filter by type (LICENSE, MESSAGE, etc.)
- [ ] Add filter by priority
- [ ] Add search/filter functionality
- [ ] Add bulk actions (select all, delete, mark read)

### Phase 6: User Experience (Week 4)

- [ ] Add loading states and skeletons
- [ ] Add empty states
- [ ] Add error states (API failures)
- [ ] Implement notification sound (optional)
- [ ] Add browser notifications permission request
- [ ] Test accessibility (keyboard navigation, screen readers)
- [ ] Mobile responsive design

### Phase 7: Testing & Polish (Week 4)

- [ ] Unit tests for hooks
- [ ] Integration tests for components
- [ ] E2E tests for notification flow
- [ ] Performance testing (1000+ notifications)
- [ ] Cross-browser testing
- [ ] User acceptance testing

---

## Best Practices

### Performance Optimization

**Virtualized Lists:**
For users with hundreds of notifications, use virtual scrolling:

```bash
npm install react-window
```

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={notifications.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <NotificationItem notification={notifications[index]} />
    </div>
  )}
</FixedSizeList>
```

**Memoization:**
Prevent unnecessary re-renders:

```typescript
import { memo } from 'react';

export const NotificationItem = memo(({ notification, onRead }) => {
  // Component code
});
```

### Accessibility

- Add `aria-label` to bell icon: `aria-label="Notifications"`
- Add `aria-live="polite"` to unread count badge
- Ensure keyboard navigation works (Tab, Enter, Escape)
- Use semantic HTML (`<button>`, `<nav>`, etc.)

### Error Handling

```typescript
const { data, error, isError } = useNotifications();

if (isError) {
  return (
    <div className="p-4 bg-red-50 text-red-800 rounded">
      <p>Failed to load notifications. Please try again.</p>
      <button onClick={() => refetch()}>Retry</button>
    </div>
  );
}
```

---

## Troubleshooting

### Issue: Notifications Not Updating in Real-time

**Solution:**
1. Check polling is enabled: `useNotificationPolling({ enabled: true })`
2. Verify auth token is valid
3. Check network tab for polling requests
4. Ensure React Query cache is not stale

### Issue: Unread Count Not Decreasing

**Solution:**
1. Verify `markAsRead` mutation is successful
2. Check query invalidation is working
3. Ensure backend is updating `read` field

### Issue: Memory Leaks

**Solution:**
1. Cancel polling on unmount
2. Use AbortController for fetch requests
3. Clear timeouts/intervals in useEffect cleanup

---

**Document Version:** 1.0.0  
**Frontend Compatibility:** Next.js 15, React 18+  
**Last Updated:** October 14, 2025
