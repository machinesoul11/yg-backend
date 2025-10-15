# 🌐 Notification System - Frontend Integration Guide (Part 3: Advanced Features & Examples)

**Classification:** 🌐 SHARED  
**Module:** Notifications System  
**Version:** 1.0  
**Last Updated:** October 14, 2025

> **Context:** This is Part 3 of 3 in the Notification System integration documentation. This document covers React implementation examples, error handling patterns, utility functions, and complete code samples.

---

## Table of Contents

1. [Complete React Components](#complete-react-components)
2. [React Query Hooks](#react-query-hooks)
3. [Utility Functions](#utility-functions)
4. [Error Handling Patterns](#error-handling-patterns)
5. [Testing Examples](#testing-examples)
6. [Performance Optimization](#performance-optimization)

---

## Complete React Components

### 1. Notification Badge (Header)

```typescript
'use client';

import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

export function NotificationBadge() {
  const { data: unreadData, isLoading } = trpc.system.notifications.getUnreadCount.useQuery(
    undefined,
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      refetchOnWindowFocus: true,
    }
  );

  const unreadCount = unreadData?.data.count || 0;

  return (
    <Button variant="ghost" size="icon" className="relative">
      <Bell className="h-5 w-5" />
      {!isLoading && unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
      <span className="sr-only">{unreadCount} unread notifications</span>
    </Button>
  );
}
```

---

### 2. Notification List Component

```typescript
'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import {
  NotificationType,
  NotificationPriority,
  type Notification,
} from '@/types/notifications';
import { getNotificationConfig } from '@/lib/notifications/config';
import { cn } from '@/lib/utils';

export function NotificationList() {
  const router = useRouter();
  const utils = trpc.useContext();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    read: undefined as boolean | undefined,
    type: undefined as NotificationType | undefined,
    priority: undefined as NotificationPriority | undefined,
  });

  // Fetch notifications
  const { data, isLoading, error } = trpc.system.notifications.list.useQuery({
    ...filters,
    page,
    pageSize: 20,
  });

  // Mark as read mutation
  const markAsReadMutation = trpc.system.notifications.markAsRead.useMutation({
    onMutate: async ({ notificationId }) => {
      await utils.system.notifications.list.cancel();
      const previous = utils.system.notifications.list.getData();

      utils.system.notifications.list.setData({ ...filters, page, pageSize: 20 }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((n) =>
            n.id === notificationId
              ? { ...n, read: true, readAt: new Date().toISOString() }
              : n
          ),
        };
      });

      return { previous };
    },
    onError: (err, variables, context) => {
      utils.system.notifications.list.setData(
        { ...filters, page, pageSize: 20 },
        context?.previous
      );
      toast.error('Failed to mark as read');
    },
    onSettled: () => {
      utils.system.notifications.list.invalidate();
      utils.system.notifications.getUnreadCount.invalidate();
    },
  });

  // Delete mutation
  const deleteMutation = trpc.system.notifications.delete.useMutation({
    onMutate: async ({ notificationId }) => {
      await utils.system.notifications.list.cancel();
      const previous = utils.system.notifications.list.getData();

      utils.system.notifications.list.setData({ ...filters, page, pageSize: 20 }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((n) => n.id !== notificationId),
        };
      });

      return { previous };
    },
    onSuccess: () => {
      toast.success('Notification deleted');
    },
    onError: (err, variables, context) => {
      utils.system.notifications.list.setData(
        { ...filters, page, pageSize: 20 },
        context?.previous
      );
      toast.error('Failed to delete notification');
    },
    onSettled: () => {
      utils.system.notifications.list.invalidate();
      utils.system.notifications.getUnreadCount.invalidate();
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = trpc.system.notifications.markAllAsRead.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.data.count} notifications marked as read`);
      utils.system.notifications.list.invalidate();
      utils.system.notifications.getUnreadCount.invalidate();
    },
    onError: () => {
      toast.error('Failed to mark all as read');
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate({ notificationId: notification.id });
    }

    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  const handleDelete = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    deleteMutation.mutate({ notificationId });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-destructive">Failed to load notifications</p>
        <Button
          variant="outline"
          onClick={() => utils.system.notifications.list.refetch()}
          className="mt-4"
        >
          Retry
        </Button>
      </Card>
    );
  }

  const notifications = data?.data || [];
  const totalPages = data?.meta.pagination.totalPages || 1;
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Bell className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No notifications</h3>
        <p className="text-muted-foreground">
          {filters.read === false
            ? "You're all caught up!"
            : 'You have no notifications yet.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Notifications</h2>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isLoading}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filters.read === undefined ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters({ ...filters, read: undefined })}
        >
          All
        </Button>
        <Button
          variant={filters.read === false ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters({ ...filters, read: false })}
        >
          Unread ({unreadCount})
        </Button>
        <Button
          variant={filters.read === true ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters({ ...filters, read: true })}
        >
          Read
        </Button>
      </div>

      {/* Notification List */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-2">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClick={() => handleNotificationClick(notification)}
              onDelete={(e) => handleDelete(e, notification.id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onClick,
  onDelete,
}: {
  notification: Notification;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const config = getNotificationConfig(notification.type, notification.priority);

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-colors hover:bg-accent',
        !notification.read && 'bg-muted border-l-4',
        notification.priority === 'URGENT' && 'border-l-destructive',
        notification.priority === 'HIGH' && 'border-l-orange-500',
        notification.priority === 'MEDIUM' && 'border-l-blue-500',
        notification.priority === 'LOW' && 'border-l-gray-500'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-1', config.iconColor)}>{config.icon}</div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold truncate">{notification.title}</h4>
            {!notification.read && (
              <Badge variant="secondary" className="text-xs">
                New
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {notification.priority}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <time>
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
              })}
            </time>
            {notification.readAt && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Read {format(new Date(notification.readAt), 'MMM d, h:mm a')}
                </span>
              </>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete notification</span>
        </Button>
      </div>
    </Card>
  );
}
```

---

### 3. Notification Preferences Form

```typescript
'use client';

import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { DigestFrequency, NotificationType } from '@/types/notifications';
import { useSession } from 'next-auth/react';

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  LICENSE: 'License Updates',
  PAYOUT: 'Payment & Payouts',
  ROYALTY: 'Royalty Statements',
  PROJECT: 'Project Invitations',
  SYSTEM: 'System Announcements',
  MESSAGE: 'Direct Messages',
};

const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
  LICENSE: 'Expiring licenses, renewals, and approvals',
  PAYOUT: 'Payment processing and payout notifications',
  ROYALTY: 'New royalty statements available',
  PROJECT: 'Project invitations and collaboration requests',
  SYSTEM: 'Platform maintenance and new features',
  MESSAGE: 'New messages in your inbox',
};

export function NotificationPreferences() {
  const { data: session } = useSession();
  const utils = trpc.useContext();

  const { data: prefsData, isLoading } = trpc.system.notifications.getPreferences.useQuery();
  const preferences = prefsData?.data;

  const [enabledTypes, setEnabledTypes] = useState<NotificationType[]>(
    preferences?.enabledTypes || []
  );
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    preferences?.digestFrequency || DigestFrequency.IMMEDIATE
  );
  const [emailEnabled, setEmailEnabled] = useState(preferences?.emailEnabled || false);

  const updateMutation = trpc.system.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success('Preferences saved successfully');
      utils.system.notifications.getPreferences.invalidate();
    },
    onError: (error) => {
      if (error.message.includes('email')) {
        toast.error('Please verify your email address first');
      } else {
        toast.error('Failed to save preferences');
      }
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      enabledTypes,
      digestFrequency,
      emailEnabled,
    });
  };

  const handleTypeToggle = (type: NotificationType, checked: boolean) => {
    setEnabledTypes((prev) =>
      checked ? [...prev, type] : prev.filter((t) => t !== type)
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading preferences...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const emailVerified = session?.user?.emailVerified;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>
            Control when and how you receive email notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!emailVerified && emailEnabled && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Email not verified</AlertTitle>
              <AlertDescription>
                Please verify your email address to receive email notifications.
                <Button variant="link" className="p-0 h-auto" onClick={() => {}}>
                  Resend verification email
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="emailEnabled"
              checked={emailEnabled}
              onCheckedChange={(checked) => setEmailEnabled(checked as boolean)}
              disabled={!emailVerified}
            />
            <Label htmlFor="emailEnabled" className="text-sm font-medium">
              Enable email notifications
            </Label>
          </div>

          {emailEnabled && (
            <>
              <div className="space-y-2">
                <Label>Email frequency</Label>
                <RadioGroup
                  value={digestFrequency}
                  onValueChange={(value) => setDigestFrequency(value as DigestFrequency)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={DigestFrequency.IMMEDIATE} id="immediate" />
                    <Label htmlFor="immediate" className="font-normal">
                      Immediate
                      <span className="block text-xs text-muted-foreground">
                        Send emails as notifications arrive
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={DigestFrequency.DAILY} id="daily" />
                    <Label htmlFor="daily" className="font-normal">
                      Daily
                      <span className="block text-xs text-muted-foreground">
                        One email per day at 9:00 AM
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={DigestFrequency.WEEKLY} id="weekly" />
                    <Label htmlFor="weekly" className="font-normal">
                      Weekly
                      <span className="block text-xs text-muted-foreground">
                        One email per week on Monday at 9:00 AM
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={DigestFrequency.NEVER} id="never" />
                    <Label htmlFor="never" className="font-normal">
                      Never
                      <span className="block text-xs text-muted-foreground">
                        URGENT and HIGH priority notifications will still be sent
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Note: URGENT and HIGH priority notifications always send immediate emails,
                  regardless of your frequency setting.
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification Types</CardTitle>
          <CardDescription>
            Choose which types of notifications you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(NOTIFICATION_TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-start space-x-2">
                <Checkbox
                  id={type}
                  checked={enabledTypes.includes(type as NotificationType)}
                  onCheckedChange={(checked) =>
                    handleTypeToggle(type as NotificationType, checked as boolean)
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor={type} className="text-sm font-medium">
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {NOTIFICATION_TYPE_DESCRIPTIONS[type as NotificationType]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isLoading}>
          {updateMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
```

---

## React Query Hooks

### 1. Notification Polling Hook

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { NotificationPriority } from '@/types/notifications';

export function useNotificationPolling() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [lastSeen, setLastSeen] = useState<string | undefined>();
  const [isPolling, setIsPolling] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout>();
  const failureCountRef = useRef(0);
  const MAX_FAILURES = 5;

  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/notifications/poll${lastSeen ? `?lastSeen=${lastSeen}` : ''}`
        );

        // Handle rate limiting
        if (response.status === 429) {
          const data = await response.json();
          const retryAfter = data.retryAfter || 10;
          intervalRef.current = setTimeout(poll, retryAfter * 1000);
          return;
        }

        if (!response.ok) {
          throw new Error('Polling failed');
        }

        const { data } = await response.json();
        
        // Update lastSeen for next poll
        setLastSeen(data.lastSeen);

        // Reset failure count on success
        failureCountRef.current = 0;

        // If new notifications exist
        if (data.newCount > 0) {
          // Invalidate notification queries
          queryClient.invalidateQueries({ queryKey: ['notifications'] });

          // Show toast for HIGH/URGENT priority
          data.notifications.forEach((notification: any) => {
            if (['HIGH', 'URGENT'].includes(notification.priority)) {
              toast.info(notification.title, {
                description: notification.message,
                action: notification.actionUrl
                  ? {
                      label: 'View',
                      onClick: () => router.push(notification.actionUrl),
                    }
                  : undefined,
              });
            }
          });
        }

        // Schedule next poll
        intervalRef.current = setTimeout(poll, data.suggestedPollInterval * 1000);
      } catch (error) {
        console.error('Polling error:', error);
        failureCountRef.current++;

        if (failureCountRef.current >= MAX_FAILURES) {
          setIsPolling(false);
          toast.error('Unable to check for new notifications. Please refresh the page.');
          return;
        }

        // Exponential backoff
        const delay = Math.min(30000, 1000 * Math.pow(2, failureCountRef.current));
        intervalRef.current = setTimeout(poll, delay);
      }
    };

    // Start polling
    poll();

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [lastSeen, isPolling, queryClient, router]);

  return {
    isPolling,
    setIsPolling,
  };
}
```

---

### 2. Visibility-Aware Polling Hook

```typescript
'use client';

import { useEffect, useState } from 'react';

export function useVisibilityAwarePolling() {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
```

---

## Utility Functions

### 1. Notification Config Helper

```typescript
import {
  Bell,
  DollarSign,
  FileText,
  Users,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import type { NotificationType, NotificationPriority } from '@/types/notifications';

const TYPE_ICONS = {
  LICENSE: FileText,
  PAYOUT: DollarSign,
  ROYALTY: FileText,
  PROJECT: Users,
  SYSTEM: AlertCircle,
  MESSAGE: MessageSquare,
};

const PRIORITY_COLORS = {
  URGENT: 'text-red-600',
  HIGH: 'text-orange-600',
  MEDIUM: 'text-blue-600',
  LOW: 'text-gray-600',
};

const TYPE_COLORS = {
  LICENSE: 'text-purple-600',
  PAYOUT: 'text-green-600',
  ROYALTY: 'text-blue-600',
  PROJECT: 'text-orange-600',
  SYSTEM: 'text-gray-600',
  MESSAGE: 'text-blue-600',
};

export function getNotificationConfig(
  type: NotificationType,
  priority: NotificationPriority
) {
  const IconComponent = TYPE_ICONS[type];
  const iconColor = PRIORITY_COLORS[priority];
  const borderColor = PRIORITY_COLORS[priority];

  return {
    icon: <IconComponent className="h-5 w-5" />,
    iconColor,
    borderColor,
  };
}
```

---

### 2. Notification Formatter

```typescript
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString);

  if (isToday(date)) {
    return `Today at ${format(date, 'h:mm a')}`;
  }

  if (isYesterday(date)) {
    return `Yesterday at ${format(date, 'h:mm a')}`;
  }

  const daysAgo = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysAgo < 7) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  return format(date, 'MMM d, yyyy');
}

export function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}
```

---

## Error Handling Patterns

### 1. Retry with Exponential Backoff

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// Usage
const notifications = await retryWithBackoff(
  () => trpc.system.notifications.list.query({ page: 1, pageSize: 20 }),
  3,
  1000
);
```

---

### 2. Error Boundary for Notifications

```typescript
'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class NotificationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Notification error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
          <p className="text-muted-foreground mb-4">
            Failed to load notifications. Please try again.
          </p>
          <Button onClick={() => this.setState({ hasError: false })}>
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## Testing Examples

### 1. Unit Test for Polling Hook

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useNotificationPolling } from '@/hooks/useNotificationPolling';

// Mock fetch
global.fetch = jest.fn();

describe('useNotificationPolling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should poll for notifications', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          notifications: [],
          newCount: 0,
          unreadCount: 0,
          lastSeen: new Date().toISOString(),
          suggestedPollInterval: 10,
        },
      }),
    });

    const { result } = renderHook(() => useNotificationPolling());

    expect(result.current.isPolling).toBe(true);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications/poll');
    });
  });

  it('should handle rate limiting', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 429,
      json: async () => ({ retryAfter: 10 }),
    });

    renderHook(() => useNotificationPolling());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should stop polling after max failures', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNotificationPolling());

    await waitFor(
      () => {
        expect(result.current.isPolling).toBe(false);
      },
      { timeout: 10000 }
    );
  });
});
```

---

### 2. Integration Test for Notification List

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationList } from '@/components/notifications/NotificationList';
import { trpc } from '@/lib/trpc';

jest.mock('@/lib/trpc');

describe('NotificationList', () => {
  const mockNotifications = [
    {
      id: '1',
      type: 'LICENSE',
      title: 'License Expiring',
      message: 'Your license expires in 7 days',
      actionUrl: '/licenses/123',
      priority: 'HIGH',
      read: false,
      readAt: null,
      metadata: {},
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    (trpc.system.notifications.list.useQuery as jest.Mock).mockReturnValue({
      data: {
        data: mockNotifications,
        meta: {
          pagination: {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          },
        },
      },
      isLoading: false,
      error: null,
    });
  });

  it('should render notifications', () => {
    render(<NotificationList />);
    
    expect(screen.getByText('License Expiring')).toBeInTheDocument();
    expect(screen.getByText('Your license expires in 7 days')).toBeInTheDocument();
  });

  it('should mark notification as read on click', async () => {
    const markAsReadMock = jest.fn();
    (trpc.system.notifications.markAsRead.useMutation as jest.Mock).mockReturnValue({
      mutate: markAsReadMock,
    });

    render(<NotificationList />);
    
    fireEvent.click(screen.getByText('License Expiring'));

    await waitFor(() => {
      expect(markAsReadMock).toHaveBeenCalledWith({ notificationId: '1' });
    });
  });

  it('should show empty state when no notifications', () => {
    (trpc.system.notifications.list.useQuery as jest.Mock).mockReturnValue({
      data: {
        data: [],
        meta: { pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      },
      isLoading: false,
      error: null,
    });

    render(<NotificationList />);
    
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });
});
```

---

## Performance Optimization

### 1. Memo-ized Notification Item

```typescript
import { memo } from 'react';

export const NotificationItem = memo(
  function NotificationItem({ notification, onClick, onDelete }) {
    // Component implementation
  },
  (prevProps, nextProps) => {
    return (
      prevProps.notification.id === nextProps.notification.id &&
      prevProps.notification.read === nextProps.notification.read
    );
  }
);
```

---

### 2. Virtual Scrolling for Large Lists

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function VirtualNotificationList({ notifications }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: notifications.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated height of each item
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const notification = notifications[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <NotificationItem notification={notification} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### 3. Debounced Preference Updates

```typescript
import { useDebounce } from '@/hooks/useDebounce';

export function NotificationPreferences() {
  const [enabledTypes, setEnabledTypes] = useState<NotificationType[]>([]);
  const debouncedEnabledTypes = useDebounce(enabledTypes, 500);

  const updateMutation = trpc.system.notifications.updatePreferences.useMutation();

  useEffect(() => {
    if (debouncedEnabledTypes.length > 0) {
      updateMutation.mutate({ enabledTypes: debouncedEnabledTypes });
    }
  }, [debouncedEnabledTypes]);

  return (
    // Form UI
  );
}
```

---

## Complete Application Setup

### 1. Provider Setup

```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useNotificationPolling } from '@/hooks/useNotificationPolling';

function NotificationPollingProvider({ children }: { children: React.ReactNode }) {
  useNotificationPolling();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NotificationPollingProvider>
          {children}
        </NotificationPollingProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

---

### 2. Root Layout

```typescript
// app/layout.tsx
import { Providers } from './providers';
import { Toaster } from 'sonner';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
```

---

## Summary

You now have:

✅ Complete React components for notification UI  
✅ Polling hooks with error handling  
✅ Utility functions for formatting and config  
✅ Error boundary for graceful failures  
✅ Testing examples  
✅ Performance optimizations  
✅ Complete application setup  

**All Parts:**
- [Part 1: API Endpoints & Types](./NOTIFICATION_SYSTEM_COMPLETE_PART_1_API.md)
- [Part 2: Business Logic & Implementation](./NOTIFICATION_SYSTEM_COMPLETE_PART_2_IMPLEMENTATION.md)
- Part 3: Advanced Features & Examples (You are here)

---

**Need Help?**
- Review existing notification docs in `/docs/frontend-integration/`
- Check backend implementation in `/src/modules/system/`
- Reach out to backend team with questions
