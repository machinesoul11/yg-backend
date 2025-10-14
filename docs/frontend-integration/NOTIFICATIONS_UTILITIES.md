# 🌐 Notifications System - Utility Functions & Helpers

**Classification:** 🌐 SHARED  
**Module:** Notifications Integration  
**Last Updated:** October 13, 2025

> **Context:** Reusable utility functions, helpers, and configuration for the notification system.

---

## Table of Contents

1. [Notification Config Helper](#notification-config-helper)
2. [Grouping & Sorting Utilities](#grouping--sorting-utilities)
3. [Formatting Utilities](#formatting-utilities)
4. [Priority & Type Helpers](#priority--type-helpers)
5. [Local Storage Utilities](#local-storage-utilities)

---

## Notification Config Helper

Create `src/lib/notifications/config.ts`:

```typescript
import { 
  Bell, 
  DollarSign, 
  FileText, 
  Users, 
  AlertCircle, 
  MessageSquare,
  type LucideIcon 
} from 'lucide-react';
import { NotificationType, NotificationPriority } from '@/types/notifications';

export interface NotificationConfig {
  icon: React.ReactNode;
  iconColor: string;
  borderColor: string;
  label: string;
  description: string;
}

// ========================================
// Icon Mapping by Type
// ========================================

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  [NotificationType.LICENSE]: FileText,
  [NotificationType.PAYOUT]: DollarSign,
  [NotificationType.ROYALTY]: FileText,
  [NotificationType.PROJECT]: Users,
  [NotificationType.SYSTEM]: AlertCircle,
  [NotificationType.MESSAGE]: MessageSquare,
};

// ========================================
// Priority Colors
// ========================================

const PRIORITY_COLORS: Record<NotificationPriority, {
  iconColor: string;
  borderColor: string;
  badgeColor: string;
}> = {
  [NotificationPriority.URGENT]: {
    iconColor: 'text-red-600',
    borderColor: 'bg-red-500',
    badgeColor: 'bg-red-100 text-red-800',
  },
  [NotificationPriority.HIGH]: {
    iconColor: 'text-orange-600',
    borderColor: 'bg-orange-500',
    badgeColor: 'bg-orange-100 text-orange-800',
  },
  [NotificationPriority.MEDIUM]: {
    iconColor: 'text-blue-600',
    borderColor: 'bg-blue-500',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  [NotificationPriority.LOW]: {
    iconColor: 'text-gray-600',
    borderColor: 'bg-gray-500',
    badgeColor: 'bg-gray-100 text-gray-800',
  },
};

// ========================================
// Type Labels & Descriptions
// ========================================

const TYPE_CONFIG: Record<NotificationType, {
  label: string;
  description: string;
}> = {
  [NotificationType.LICENSE]: {
    label: 'License',
    description: 'License updates, renewals, and expiry warnings',
  },
  [NotificationType.PAYOUT]: {
    label: 'Payout',
    description: 'Payment processing and payout notifications',
  },
  [NotificationType.ROYALTY]: {
    label: 'Royalty',
    description: 'Royalty statements and earnings reports',
  },
  [NotificationType.PROJECT]: {
    label: 'Project',
    description: 'Project invitations and collaborations',
  },
  [NotificationType.SYSTEM]: {
    label: 'System',
    description: 'Platform announcements and system updates',
  },
  [NotificationType.MESSAGE]: {
    label: 'Message',
    description: 'Direct messages and conversations',
  },
};

// ========================================
// Get Config Function
// ========================================

export function getNotificationConfig(
  type: NotificationType,
  priority: NotificationPriority
): NotificationConfig {
  const Icon = TYPE_ICONS[type];
  const colors = PRIORITY_COLORS[priority];
  const typeInfo = TYPE_CONFIG[type];

  return {
    icon: <Icon className="h-5 w-5" />,
    iconColor: colors.iconColor,
    borderColor: colors.borderColor,
    label: typeInfo.label,
    description: typeInfo.description,
  };
}

// ========================================
// Get Badge Color by Priority
// ========================================

export function getBadgeColor(priority: NotificationPriority): string {
  return PRIORITY_COLORS[priority].badgeColor;
}

// ========================================
// Get Type Label
// ========================================

export function getTypeLabel(type: NotificationType): string {
  return TYPE_CONFIG[type].label;
}

// ========================================
// Get Type Description
// ========================================

export function getTypeDescription(type: NotificationType): string {
  return TYPE_CONFIG[type].description;
}
```

---

## Grouping & Sorting Utilities

Create `src/lib/notifications/grouping.ts`:

```typescript
import type { Notification, NotificationGroup, NotificationType } from '@/types/notifications';

// ========================================
// Group by Type
// ========================================

export function groupNotificationsByType(
  notifications: Notification[]
): NotificationGroup[] {
  const grouped = notifications.reduce((acc, notif) => {
    if (!acc[notif.type]) {
      acc[notif.type] = [];
    }
    acc[notif.type].push(notif);
    return acc;
  }, {} as Record<NotificationType, Notification[]>);

  return Object.entries(grouped).map(([type, notifications]) => ({
    type: type as NotificationType,
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
  }));
}

// ========================================
// Group by Date
// ========================================

export interface DateGroup {
  label: string; // "Today", "Yesterday", "This Week", etc.
  notifications: Notification[];
}

export function groupNotificationsByDate(
  notifications: Notification[]
): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: DateGroup[] = [
    { label: 'Today', notifications: [] },
    { label: 'Yesterday', notifications: [] },
    { label: 'This Week', notifications: [] },
    { label: 'Older', notifications: [] },
  ];

  notifications.forEach((notif) => {
    const date = new Date(notif.createdAt);

    if (date >= today) {
      groups[0].notifications.push(notif);
    } else if (date >= yesterday) {
      groups[1].notifications.push(notif);
    } else if (date >= weekAgo) {
      groups[2].notifications.push(notif);
    } else {
      groups[3].notifications.push(notif);
    }
  });

  // Filter out empty groups
  return groups.filter((g) => g.notifications.length > 0);
}

// ========================================
// Sort by Priority then Date
// ========================================

const PRIORITY_ORDER = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function sortNotificationsByPriority(
  notifications: Notification[]
): Notification[] {
  return [...notifications].sort((a, b) => {
    // First by priority
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// ========================================
// Filter Unread
// ========================================

export function filterUnread(notifications: Notification[]): Notification[] {
  return notifications.filter((n) => !n.read);
}

// ========================================
// Filter by Type
// ========================================

export function filterByType(
  notifications: Notification[],
  type: NotificationType
): Notification[] {
  return notifications.filter((n) => n.type === type);
}
```

---

## Formatting Utilities

Create `src/lib/notifications/formatting.ts`:

```typescript
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import type { Notification } from '@/types/notifications';

// ========================================
// Format Timestamp
// ========================================

export function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString);

  if (isToday(date)) {
    return `Today at ${format(date, 'h:mm a')}`;
  }

  if (isYesterday(date)) {
    return `Yesterday at ${format(date, 'h:mm a')}`;
  }

  // Within last week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date >= weekAgo) {
    return format(date, 'EEEE'); // Day name
  }

  // Older
  return format(date, 'MMM d, yyyy');
}

// ========================================
// Format Relative Time
// ========================================

export function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

// ========================================
// Truncate Message
// ========================================

export function truncateMessage(message: string, maxLength: number = 100): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + '...';
}

// ========================================
// Format Currency (for Payout notifications)
// ========================================

export function formatCurrency(
  amountInCents: number,
  currency: string = 'USD'
): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  });

  return formatter.format(amountInCents / 100);
}

// ========================================
// Extract Action Text
// ========================================

export function getActionText(notification: Notification): string {
  if (!notification.actionUrl) return '';

  switch (notification.type) {
    case 'LICENSE':
      return 'View License';
    case 'PAYOUT':
      return 'View Payout';
    case 'ROYALTY':
      return 'View Statement';
    case 'PROJECT':
      return 'View Project';
    case 'MESSAGE':
      return 'View Message';
    case 'SYSTEM':
      return 'Learn More';
    default:
      return 'View Details';
  }
}

// ========================================
// Format Notification Summary
// ========================================

export function formatNotificationSummary(
  notifications: Notification[]
): string {
  const count = notifications.length;
  
  if (count === 0) return 'No new notifications';
  if (count === 1) return '1 new notification';
  
  return `${count} new notifications`;
}
```

---

## Priority & Type Helpers

Create `src/lib/notifications/helpers.ts`:

```typescript
import type { 
  Notification, 
  NotificationType, 
  NotificationPriority 
} from '@/types/notifications';

// ========================================
// Priority Checks
// ========================================

export function isUrgent(notification: Notification): boolean {
  return notification.priority === 'URGENT';
}

export function isHighPriority(notification: Notification): boolean {
  return notification.priority === 'HIGH' || isUrgent(notification);
}

export function shouldShowToast(notification: Notification): boolean {
  return isHighPriority(notification);
}

// ========================================
// Auto-dismiss Timeout
// ========================================

export function getToastTimeout(priority: NotificationPriority): number | false {
  switch (priority) {
    case 'URGENT':
    case 'HIGH':
      return false; // Never auto-dismiss
    case 'MEDIUM':
      return 5000; // 5 seconds
    case 'LOW':
      return 3000; // 3 seconds
  }
}

// ========================================
// Sound Notification
// ========================================

export function shouldPlaySound(notification: Notification): boolean {
  return isUrgent(notification);
}

// ========================================
// Type Checks
// ========================================

export function isMessageNotification(notification: Notification): boolean {
  return notification.type === 'MESSAGE';
}

export function isLicenseNotification(notification: Notification): boolean {
  return notification.type === 'LICENSE';
}

export function isPayoutNotification(notification: Notification): boolean {
  return notification.type === 'PAYOUT';
}

// ========================================
// Metadata Type Guards
// ========================================

import type {
  LicenseNotificationMetadata,
  PayoutNotificationMetadata,
  MessageNotificationMetadata,
} from '@/types/notifications';

export function isLicenseMetadata(
  metadata: any
): metadata is LicenseNotificationMetadata {
  return metadata && 'licenseId' in metadata;
}

export function isPayoutMetadata(
  metadata: any
): metadata is PayoutNotificationMetadata {
  return metadata && 'payoutId' in metadata && 'amount' in metadata;
}

export function isMessageMetadata(
  metadata: any
): metadata is MessageNotificationMetadata {
  return metadata && 'threadId' in metadata && 'senderId' in metadata;
}

// ========================================
// Get Category Count
// ========================================

export function getTypeCounts(
  notifications: Notification[]
): Record<NotificationType, number> {
  return notifications.reduce((acc, notif) => {
    acc[notif.type] = (acc[notif.type] || 0) + 1;
    return acc;
  }, {} as Record<NotificationType, number>);
}

// ========================================
// Get Priority Count
// ========================================

export function getPriorityCounts(
  notifications: Notification[]
): Record<NotificationPriority, number> {
  return notifications.reduce((acc, notif) => {
    acc[notif.priority] = (acc[notif.priority] || 0) + 1;
    return acc;
  }, {} as Record<NotificationPriority, number>);
}
```

---

## Local Storage Utilities

Create `src/lib/notifications/storage.ts`:

```typescript
// ========================================
// Store Last Seen Timestamp
// ========================================

const LAST_SEEN_KEY = 'notifications:lastSeen';
const MUTED_THREADS_KEY = 'notifications:mutedThreads';

export function saveLastSeen(timestamp: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, timestamp);
  } catch (error) {
    console.error('Failed to save lastSeen:', error);
  }
}

export function getLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch (error) {
    console.error('Failed to get lastSeen:', error);
    return null;
  }
}

// ========================================
// Muted Threads (Client-side cache)
// ========================================

export function getMutedThreads(): string[] {
  try {
    const stored = localStorage.getItem(MUTED_THREADS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to get muted threads:', error);
    return [];
  }
}

export function saveMutedThreads(threadIds: string[]): void {
  try {
    localStorage.setItem(MUTED_THREADS_KEY, JSON.stringify(threadIds));
  } catch (error) {
    console.error('Failed to save muted threads:', error);
  }
}

export function isThreadMuted(threadId: string): boolean {
  const muted = getMutedThreads();
  return muted.includes(threadId);
}

export function muteThread(threadId: string): void {
  const muted = getMutedThreads();
  if (!muted.includes(threadId)) {
    saveMutedThreads([...muted, threadId]);
  }
}

export function unmuteThread(threadId: string): void {
  const muted = getMutedThreads();
  saveMutedThreads(muted.filter((id) => id !== threadId));
}

// ========================================
// Notification Preferences Cache
// ========================================

const PREFS_CACHE_KEY = 'notifications:preferences';

export interface CachedPreferences {
  timestamp: number;
  preferences: any;
}

export function cachePreferences(preferences: any): void {
  try {
    const cached: CachedPreferences = {
      timestamp: Date.now(),
      preferences,
    };
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.error('Failed to cache preferences:', error);
  }
}

export function getCachedPreferences(): any | null {
  try {
    const stored = localStorage.getItem(PREFS_CACHE_KEY);
    if (!stored) return null;

    const cached: CachedPreferences = JSON.parse(stored);
    
    // Cache valid for 5 minutes
    const MAX_AGE = 5 * 60 * 1000;
    if (Date.now() - cached.timestamp > MAX_AGE) {
      return null;
    }

    return cached.preferences;
  } catch (error) {
    console.error('Failed to get cached preferences:', error);
    return null;
  }
}

export function clearPreferencesCache(): void {
  try {
    localStorage.removeItem(PREFS_CACHE_KEY);
  } catch (error) {
    console.error('Failed to clear preferences cache:', error);
  }
}
```

---

## Usage Examples

### Example 1: Using Notification Config

```typescript
import { getNotificationConfig } from '@/lib/notifications/config';

function NotificationItem({ notification }) {
  const config = getNotificationConfig(notification.type, notification.priority);

  return (
    <div className={config.iconColor}>
      {config.icon}
      <span>{notification.title}</span>
    </div>
  );
}
```

### Example 2: Grouping Notifications

```typescript
import { groupNotificationsByType } from '@/lib/notifications/grouping';

function GroupedNotifications({ notifications }) {
  const groups = groupNotificationsByType(notifications);

  return (
    <div>
      {groups.map((group) => (
        <div key={group.type}>
          <h3>{group.type} ({group.unreadCount} unread)</h3>
          {group.notifications.map(notif => (
            <NotificationItem key={notif.id} notification={notif} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### Example 3: Formatting Utilities

```typescript
import { formatNotificationDate, formatCurrency } from '@/lib/notifications/formatting';

function PayoutNotification({ notification }) {
  const metadata = notification.metadata as PayoutNotificationMetadata;

  return (
    <div>
      <h4>{notification.title}</h4>
      <p>{formatCurrency(metadata.amount, metadata.currency)}</p>
      <span>{formatNotificationDate(notification.createdAt)}</span>
    </div>
  );
}
```

### Example 4: Toast Notifications

```typescript
import { shouldShowToast, getToastTimeout } from '@/lib/notifications/helpers';
import { toast } from 'sonner';

function handleNewNotification(notification: Notification) {
  if (shouldShowToast(notification)) {
    toast(notification.title, {
      description: notification.message,
      duration: getToastTimeout(notification.priority),
    });
  }
}
```

---

## Complete File Structure

```
src/
├── lib/
│   └── notifications/
│       ├── config.ts          # Icons, colors, labels
│       ├── grouping.ts        # Grouping and sorting
│       ├── formatting.ts      # Date/time/currency formatting
│       ├── helpers.ts         # Priority checks, type guards
│       ├── storage.ts         # Local storage utilities
│       └── errors.ts          # Error handling
├── hooks/
│   ├── useNotifications.ts    # React Query hooks
│   └── useNotificationPolling.ts  # Polling logic
├── components/
│   └── notifications/
│       ├── NotificationBadge.tsx
│       ├── NotificationList.tsx
│       ├── NotificationItem.tsx
│       └── NotificationPreferencesForm.tsx
└── types/
    └── notifications.ts       # TypeScript types
```

---

## Next Steps

- **Part 1:** [API Endpoints Reference](./NOTIFICATIONS_API_ENDPOINTS.md)
- **Part 2:** [Business Logic & Validation Rules](./NOTIFICATIONS_BUSINESS_LOGIC.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATIONS_IMPLEMENTATION_GUIDE.md)
