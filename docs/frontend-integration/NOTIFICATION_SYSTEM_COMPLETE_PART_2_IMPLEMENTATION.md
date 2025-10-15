# 🌐 Notification System - Frontend Integration Guide (Part 2: Business Logic & Implementation)

**Classification:** 🌐 SHARED  
**Module:** Notifications System  
**Version:** 1.0  
**Last Updated:** October 14, 2025

> **Context:** This is Part 2 of 3 in the Notification System integration documentation. This document covers business logic, validation rules, polling strategies, and implementation patterns.

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Email Delivery Logic](#email-delivery-logic)
3. [Authorization & Permissions](#authorization--permissions)
4. [Rate Limiting & Quotas](#rate-limiting--quotas)
5. [Real-time Updates (Polling Strategy)](#real-time-updates-polling-strategy)
6. [Pagination & Filtering](#pagination--filtering)
7. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Business Logic & Validation Rules

### Notification Types & Priorities

Each notification belongs to one of six types with associated behaviors:

| Type | Description | Default Priority | Typical Use Cases |
|------|-------------|------------------|-------------------|
| `LICENSE` | License-related events | MEDIUM | Expiring licenses, renewals, approvals, rejections |
| `PAYOUT` | Payment and payout events | HIGH | Payment processed, payout failed, payment pending |
| `ROYALTY` | Royalty statements | MEDIUM | New royalty statement available |
| `PROJECT` | Project invitations | MEDIUM | Brand invites creator to project, status changes |
| `SYSTEM` | Platform announcements | LOW | Maintenance notices, new features, tips |
| `MESSAGE` | Direct messages | MEDIUM | New message received in a thread |

### Priority Levels & Behavior

| Priority | Email Behavior | UI Treatment | Use Cases |
|----------|---------------|--------------|-----------|
| `URGENT` | **Always immediate email** | Red badge, toast notification, sound | Critical failures, security alerts, account issues |
| `HIGH` | **Always immediate email** | Orange badge, prominent display | Approvals needed, payment issues, important deadlines |
| `MEDIUM` | **Respects user preference** | Blue badge, standard display | General notifications |
| `LOW` | **Digest only** (never immediate) | Gray badge, subtle display | Tips, info messages, optional updates |

**Key Rules:**
1. URGENT and HIGH **always** send immediate emails, regardless of user's digest preference
2. MEDIUM follows user preference (immediate, daily, weekly, or never)
3. LOW only appears in digest emails, never sent immediately
4. In-app notifications are created for **all** priorities (unless type is disabled)

---

### Field Validation Requirements

#### Title
- **Required:** Yes
- **Min Length:** 1 character
- **Max Length:** 255 characters
- **Sanitization:** HTML tags are stripped by backend
- **Frontend Validation:** Show character counter, prevent submission if empty or > 255 chars

#### Message
- **Required:** Yes
- **Min Length:** 1 character
- **Max Length:** 1000 characters
- **Sanitization:** HTML tags are stripped by backend
- **Frontend Validation:** Show character counter, prevent submission if empty or > 1000 chars

#### Action URL
- **Required:** No
- **Format:** Must be either:
  - Full URL: `https://example.com/path`
  - Relative path: `/dashboard/licenses/123`
- **Validation:** Must match regex: `/^\/[a-z0-9\/-]*$/` or be valid URL
- **Frontend Validation:** Validate format before submission

#### Metadata
- **Required:** No
- **Type:** JSON object (key-value pairs)
- **Max Size:** No hard limit, but keep under 5KB for performance
- **Use Cases:** Store notification-specific data (IDs, names, dates, etc.)

---

### Derived Values & Calculations

The frontend should **not** calculate these values—they are provided by the backend:

1. **readAt timestamp** - Set by backend when marking as read
2. **createdAt timestamp** - Set by backend at creation time
3. **Unread count** - Calculated and cached by backend
4. **Total notification count** - Calculated during pagination
5. **suggestedPollInterval** - Determined by backend (typically 10 seconds)

---

## Email Delivery Logic

### Decision Flow

When a notification is created, the backend determines email delivery:

```
1. Check if notification type is enabled in user preferences
   ├─ If disabled → No email
   └─ If enabled → Continue

2. Check user's emailEnabled preference
   ├─ If false → No email
   └─ If true → Continue

3. Check user's email_verified status
   ├─ If false → No email (show warning in UI)
   └─ If true → Continue

4. Check priority level
   ├─ If URGENT or HIGH → Send immediate email (overrides digest)
   ├─ If LOW → Queue for digest only
   └─ If MEDIUM → Check digestFrequency
       ├─ IMMEDIATE → Send immediate email
       ├─ DAILY → Queue for daily digest (9 AM)
       ├─ WEEKLY → Queue for weekly digest (Monday 9 AM)
       └─ NEVER → No email
```

### Immediate Email Behavior

- **Delivery Time:** Within 30 seconds of notification creation
- **Template:** Type-specific email template with branding
- **Cooldown:** 5-minute cooldown per thread (MESSAGE type only)
- **Retry:** Up to 3 attempts if delivery fails

### Digest Email Behavior

**Schedule:**
- **DAILY:** Every day at 9:00 AM (user's timezone or UTC)
- **WEEKLY:** Every Monday at 9:00 AM (user's timezone or UTC)

**Content:**
- All unread notifications since last digest
- Grouped by notification type
- Summary counts per type
- Links to view each notification in app

**Sending Rules:**
- Only sent if unread notifications exist (no empty digests)
- Only includes MEDIUM and LOW priority (HIGH/URGENT sent immediately)
- Marks digest timestamp to prevent duplicates
- Respects `enabledTypes` preference

### Frontend Implications

**Show email verification warning:**
```typescript
if (preferences.emailEnabled && !user.emailVerified) {
  return (
    <Alert variant="warning">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Email notifications disabled</AlertTitle>
      <AlertDescription>
        Please verify your email address to receive email notifications.
        <Button onClick={sendVerificationEmail}>Verify Email</Button>
      </AlertDescription>
    </Alert>
  );
}
```

**Explain priority override:**
```typescript
<Checkbox
  id="digestFrequency"
  checked={digestFrequency === 'NEVER'}
  onCheckedChange={(checked) => setDigestFrequency(checked ? 'NEVER' : 'IMMEDIATE')}
/>
<Label htmlFor="digestFrequency">
  Never send email notifications
  <span className="text-sm text-muted-foreground">
    (URGENT and HIGH priority notifications will still be sent)
  </span>
</Label>
```

---

## Authorization & Permissions

### User Access Levels

| Role | Can View Notifications | Can Create Notifications | Can View Others' Notifications |
|------|------------------------|-------------------------|-------------------------------|
| **ADMIN** | ✅ Own notifications | ✅ For any user/role | ✅ Via admin panel (future) |
| **CREATOR** | ✅ Own notifications | ❌ No | ❌ No |
| **BRAND** | ✅ Own notifications | ❌ No | ❌ No |
| **VIEWER** | ✅ Own notifications | ❌ No | ❌ No |

### Resource Ownership Rules

**Core Rule:** Users can only access their own notifications.

**Enforcement:**
- Backend validates `userId` matches authenticated session
- 404 error if notification doesn't belong to user
- 401 error if not authenticated

**Frontend Behavior:**
```typescript
// Good - Let backend enforce ownership
try {
  await markAsRead(notificationId);
} catch (error) {
  if (error.status === 404) {
    // Notification doesn't exist or doesn't belong to user
    toast.error('Notification not found');
  }
}

// Don't do this - backend handles ownership
if (notification.userId === currentUser.id) {
  await markAsRead(notificationId);
}
```

### Field-Level Permissions

**All users can:**
- Read all fields of their own notifications
- Mark their own notifications as read
- Delete their own notifications
- Update their own preferences

**Only admins can:**
- Create notifications for other users
- Create bulk notifications by role
- (Future) View notification analytics

---

## Rate Limiting & Quotas

### Polling Endpoint Rate Limits

**Limit:** 1 request per 10 seconds per user

**Headers to Check:**
```typescript
interface RateLimitResponse {
  status: 429;
  headers: {
    'Retry-After': '8'; // Seconds to wait
  };
  body: {
    success: false;
    error: 'Rate limit exceeded';
    retryAfter: 8;
  };
}
```

**Frontend Handling:**
```typescript
async function pollNotifications(lastSeen?: string) {
  try {
    const response = await fetch(
      `/api/notifications/poll${lastSeen ? `?lastSeen=${lastSeen}` : ''}`
    );
    
    if (response.status === 429) {
      const data = await response.json();
      const retryAfter = data.retryAfter || 10;
      
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return pollNotifications(lastSeen);
    }
    
    if (!response.ok) {
      throw new Error('Failed to poll notifications');
    }
    
    return response.json();
  } catch (error) {
    console.error('Polling error:', error);
    // Implement exponential backoff
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
    return pollNotifications(lastSeen);
  }
}
```

### Other Endpoint Limits

**No rate limits on:**
- List notifications
- Get unread count
- Mark as read
- Delete notification
- Get/update preferences

**Best Practices:**
- Use polling endpoint for real-time updates
- Cache unread count locally
- Debounce preference updates
- Use optimistic UI updates

---

## Real-time Updates (Polling Strategy)

### Overview

The notification system uses **polling** for real-time updates (WebSocket/SSE not currently implemented).

**Recommended Poll Interval:** 10 seconds (use `suggestedPollInterval` from response)

### Implementation Pattern

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useNotificationPolling() {
  const queryClient = useQueryClient();
  const [lastSeen, setLastSeen] = useState<string | undefined>();
  const intervalRef = useRef<NodeJS.Timeout>();
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/notifications/poll${lastSeen ? `?lastSeen=${lastSeen}` : ''}`
        );
        
        if (response.status === 429) {
          const data = await response.json();
          // Wait and retry
          setTimeout(poll, (data.retryAfter || 10) * 1000);
          return;
        }

        const { data } = await response.json();
        
        // Update lastSeen for next poll
        setLastSeen(data.lastSeen);

        // If new notifications, invalidate cache and show toast
        if (data.newCount > 0) {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          
          // Show toast for HIGH/URGENT priority
          data.notifications.forEach((notification) => {
            if (['HIGH', 'URGENT'].includes(notification.priority)) {
              toast.info(notification.title, {
                description: notification.message,
                action: notification.actionUrl ? {
                  label: 'View',
                  onClick: () => router.push(notification.actionUrl),
                } : undefined,
              });
            }
          });
        }

        // Schedule next poll using suggested interval
        intervalRef.current = setTimeout(poll, data.suggestedPollInterval * 1000);
      } catch (error) {
        console.error('Polling error:', error);
        // Retry after 30 seconds on error
        intervalRef.current = setTimeout(poll, 30000);
      }
    };

    // Start polling
    poll();

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [lastSeen, isPolling, queryClient]);

  return {
    isPolling,
    setIsPolling,
  };
}
```

### Visibility-Aware Polling

Pause polling when tab is not visible to save resources:

```typescript
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

// Usage
export function useNotificationPolling() {
  const isVisible = useVisibilityAwarePolling();
  const [isPolling, setIsPolling] = useState(true);
  
  const shouldPoll = isVisible && isPolling;
  
  useEffect(() => {
    if (!shouldPoll) return;
    // ... polling logic
  }, [shouldPoll]);
}
```

### Polling Best Practices

1. **Start with suggested interval** (typically 10 seconds)
2. **Respect rate limits** - Handle 429 responses gracefully
3. **Pause when tab is hidden** - Use Page Visibility API
4. **Implement exponential backoff** - On errors, wait longer before retrying
5. **Show toast for urgent notifications** - Only for HIGH/URGENT priority
6. **Invalidate React Query cache** - When new notifications arrive
7. **Use lastSeen timestamp** - For incremental updates
8. **Stop polling on error threshold** - After 5 consecutive failures

---

## Pagination & Filtering

### Pagination Format

**Type:** Offset-based pagination

**Parameters:**
- `page` - Page number (1-indexed)
- `pageSize` - Items per page (1-100)

**Response:**
```typescript
interface PaginationMeta {
  page: number;        // Current page
  pageSize: number;    // Items per page
  total: number;       // Total items
  totalPages: number;  // Total pages
}
```

**Frontend Implementation:**
```typescript
function NotificationList() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = trpc.system.notifications.list.useQuery({
    page,
    pageSize,
    read: false,
  });

  const totalPages = data?.meta.pagination.totalPages || 1;

  return (
    <div>
      {/* Notification items */}
      
      {/* Pagination */}
      <Pagination>
        <PaginationPrevious
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        />
        <PaginationContent>
          Page {page} of {totalPages}
        </PaginationContent>
        <PaginationNext
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        />
      </Pagination>
    </div>
  );
}
```

### Available Filters

| Filter | Type | Options | Description |
|--------|------|---------|-------------|
| `read` | boolean | `true`, `false` | Filter by read status |
| `type` | string | See below | Filter by notification type |
| `priority` | string | See below | Filter by priority level |

**Type Options:**
- `LICENSE` - License events
- `PAYOUT` - Payment events
- `ROYALTY` - Royalty statements
- `PROJECT` - Project invitations
- `SYSTEM` - System announcements
- `MESSAGE` - Direct messages

**Priority Options:**
- `LOW` - Low priority
- `MEDIUM` - Medium priority
- `HIGH` - High priority
- `URGENT` - Urgent priority

**Frontend Filter UI:**
```typescript
function NotificationFilters() {
  const [filters, setFilters] = useState({
    read: undefined,
    type: undefined,
    priority: undefined,
  });

  const { data } = trpc.system.notifications.list.useQuery({
    ...filters,
    page: 1,
    pageSize: 20,
  });

  return (
    <div className="flex gap-4">
      <Select
        value={filters.read?.toString() || 'all'}
        onValueChange={(value) =>
          setFilters({
            ...filters,
            read: value === 'all' ? undefined : value === 'true',
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All notifications" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All notifications</SelectItem>
          <SelectItem value="false">Unread only</SelectItem>
          <SelectItem value="true">Read only</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.type || 'all'}
        onValueChange={(value) =>
          setFilters({
            ...filters,
            type: value === 'all' ? undefined : value,
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="LICENSE">Licenses</SelectItem>
          <SelectItem value="PAYOUT">Payouts</SelectItem>
          <SelectItem value="ROYALTY">Royalties</SelectItem>
          <SelectItem value="PROJECT">Projects</SelectItem>
          <SelectItem value="SYSTEM">System</SelectItem>
          <SelectItem value="MESSAGE">Messages</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.priority || 'all'}
        onValueChange={(value) =>
          setFilters({
            ...filters,
            priority: value === 'all' ? undefined : value,
          })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="URGENT">Urgent</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Sorting

**Current Implementation:** Notifications are sorted by `createdAt DESC` (newest first).

**Not Configurable:** Sorting order cannot be changed via API.

**Future Enhancement:** If custom sorting is needed, request backend team to add `sortBy` and `sortOrder` parameters.

---

## Frontend Implementation Checklist

### Phase 1: Setup
- [ ] Install dependencies (@tanstack/react-query, date-fns, sonner for toasts)
- [ ] Add TypeScript type definitions from Part 1
- [ ] Set up tRPC client (if not already configured)
- [ ] Configure React Query provider

### Phase 2: Core Features
- [ ] **Notification Badge:**
  - [ ] Display unread count in header/sidebar
  - [ ] Update count when notifications are read
  - [ ] Show loading state while fetching
  - [ ] Handle zero unread notifications
  
- [ ] **Notification List:**
  - [ ] Display paginated list of notifications
  - [ ] Show read/unread status
  - [ ] Apply type-specific icons and colors
  - [ ] Display priority badges
  - [ ] Format timestamps (e.g., "2 hours ago")
  - [ ] Handle empty state
  
- [ ] **Mark as Read:**
  - [ ] Click notification to mark as read
  - [ ] Update UI optimistically
  - [ ] Invalidate unread count cache
  - [ ] Handle errors gracefully
  
- [ ] **Delete Notification:**
  - [ ] Add delete button (trash icon)
  - [ ] Show confirmation dialog
  - [ ] Remove from UI optimistically
  - [ ] Handle errors gracefully
  
- [ ] **Mark All as Read:**
  - [ ] Add "Mark all as read" button
  - [ ] Disable when no unread notifications
  - [ ] Show loading state
  - [ ] Invalidate all notification queries

### Phase 3: Preferences
- [ ] **Preferences Form:**
  - [ ] Toggle email notifications on/off
  - [ ] Select digest frequency (IMMEDIATE, DAILY, WEEKLY, NEVER)
  - [ ] Enable/disable notification types
  - [ ] Show email verification warning if needed
  - [ ] Save preferences with loading state
  - [ ] Show success toast on save
  
- [ ] **Email Verification Check:**
  - [ ] Disable email toggle if email not verified
  - [ ] Show verification CTA
  - [ ] Resend verification email button

### Phase 4: Real-time Updates
- [ ] **Polling Hook:**
  - [ ] Implement useNotificationPolling hook
  - [ ] Track lastSeen timestamp
  - [ ] Handle rate limits (429 responses)
  - [ ] Implement exponential backoff on errors
  - [ ] Pause polling when tab is hidden
  
- [ ] **Toast Notifications:**
  - [ ] Show toast for HIGH/URGENT priority notifications
  - [ ] Include action button if actionUrl exists
  - [ ] Play sound for URGENT priority (optional)
  - [ ] Don't show toast for notifications already visible in list
  
- [ ] **Cache Invalidation:**
  - [ ] Invalidate notification list on new notifications
  - [ ] Invalidate unread count on new notifications
  - [ ] Invalidate on mark as read
  - [ ] Invalidate on delete

### Phase 5: UX Enhancements
- [ ] **Filtering:**
  - [ ] Add read/unread filter
  - [ ] Add type filter (LICENSE, PAYOUT, etc.)
  - [ ] Add priority filter
  - [ ] Clear all filters button
  
- [ ] **Empty States:**
  - [ ] "No notifications" for empty list
  - [ ] "No unread notifications" for unread filter
  - [ ] "No results" for active filters
  
- [ ] **Loading States:**
  - [ ] Skeleton loaders for initial load
  - [ ] Spinner for pagination
  - [ ] Disabled state for actions during mutations
  
- [ ] **Error Handling:**
  - [ ] Show error toast on API failures
  - [ ] Retry button for failed requests
  - [ ] Graceful degradation (show cached data if available)

### Phase 6: Accessibility
- [ ] Keyboard navigation for notification list
- [ ] Screen reader announcements for new notifications
- [ ] Focus management for modals/dialogs
- [ ] ARIA labels for icons and buttons
- [ ] High contrast mode support

### Phase 7: Testing
- [ ] Unit tests for hooks and utilities
- [ ] Integration tests for notification list
- [ ] E2E tests for mark as read flow
- [ ] E2E tests for preferences update
- [ ] Test polling behavior
- [ ] Test error scenarios

---

## Edge Cases to Handle

### 1. No Unread Notifications
```typescript
if (unreadCount === 0) {
  return (
    <div className="text-center py-8">
      <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 className="mt-2 text-sm font-semibold">No unread notifications</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        You're all caught up!
      </p>
    </div>
  );
}
```

### 2. Email Not Verified
```typescript
if (preferences.emailEnabled && !user.emailVerified) {
  return (
    <Alert variant="warning">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Action Required</AlertTitle>
      <AlertDescription>
        Verify your email address to receive email notifications.
        <Button variant="link" onClick={sendVerificationEmail}>
          Send verification email
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

### 3. Rate Limit Exceeded
```typescript
try {
  const result = await pollNotifications(lastSeen);
} catch (error) {
  if (error.status === 429) {
    // Wait for retry period
    const retryAfter = error.retryAfter || 10;
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    // Retry
    return pollNotifications(lastSeen);
  }
  throw error;
}
```

### 4. Notification Doesn't Belong to User
```typescript
try {
  await markAsRead(notificationId);
} catch (error) {
  if (error.status === 404) {
    // Remove from UI (stale data)
    removeNotificationFromCache(notificationId);
    toast.error('This notification no longer exists');
  }
}
```

### 5. Polling Fails Multiple Times
```typescript
let failureCount = 0;
const MAX_FAILURES = 5;

async function pollWithRetry() {
  try {
    await poll();
    failureCount = 0; // Reset on success
  } catch (error) {
    failureCount++;
    if (failureCount >= MAX_FAILURES) {
      // Stop polling and show error
      setIsPolling(false);
      toast.error('Unable to check for new notifications. Please refresh the page.');
      return;
    }
    // Exponential backoff
    const delay = Math.min(30000, 1000 * Math.pow(2, failureCount));
    setTimeout(pollWithRetry, delay);
  }
}
```

---

## UX Considerations

### 1. Show Context
Display metadata to give users context:

```typescript
<NotificationItem notification={notification}>
  <NotificationIcon type={notification.type} priority={notification.priority} />
  <div>
    <h4>{notification.title}</h4>
    <p>{notification.message}</p>
    
    {/* Show type-specific metadata */}
    {notification.type === 'LICENSE' && notification.metadata && (
      <Badge variant="outline">
        Expires: {format(new Date(notification.metadata.expiryDate), 'MMM d, yyyy')}
      </Badge>
    )}
    
    {notification.type === 'PAYOUT' && notification.metadata && (
      <Badge variant="success">
        ${notification.metadata.amount.toFixed(2)}
      </Badge>
    )}
    
    <time className="text-xs text-muted-foreground">
      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
    </time>
  </div>
</NotificationItem>
```

### 2. Actionable Notifications
Make notifications clickable if they have an actionUrl:

```typescript
function NotificationItem({ notification }) {
  const handleClick = () => {
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
    
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full text-left p-4 hover:bg-accent',
        !notification.read && 'bg-muted'
      )}
    >
      {/* Notification content */}
    </button>
  );
}
```

### 3. Group by Type
Group notifications by type for better organization:

```typescript
function GroupedNotificationList({ notifications }) {
  const groupedByType = notifications.reduce((acc, notification) => {
    if (!acc[notification.type]) {
      acc[notification.type] = [];
    }
    acc[notification.type].push(notification);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(groupedByType).map(([type, notifs]) => (
        <div key={type}>
          <h3 className="font-semibold">{type}</h3>
          {notifs.map(notification => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### 4. Optimistic UI Updates
Update UI immediately before waiting for server confirmation:

```typescript
const markAsReadMutation = trpc.system.notifications.markAsRead.useMutation({
  onMutate: async ({ notificationId }) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['notifications'] });

    // Snapshot previous value
    const previousNotifications = queryClient.getQueryData(['notifications']);

    // Optimistically update
    queryClient.setQueryData(['notifications'], (old) =>
      old.map((n) =>
        n.id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
      )
    );

    return { previousNotifications };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['notifications'], context.previousNotifications);
    toast.error('Failed to mark as read');
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  },
});
```

---

## Next Steps

- **Part 1:** [API Endpoints & Types](./NOTIFICATION_SYSTEM_COMPLETE_PART_1_API.md)
- **Part 3:** [Advanced Features & Examples](./NOTIFICATION_SYSTEM_COMPLETE_PART_3_ADVANCED.md)

---

**Need Help?**
- Review existing notification docs in `/docs/frontend-integration/`
- Check backend implementation in `/src/modules/system/`
- Reach out to backend team with questions
