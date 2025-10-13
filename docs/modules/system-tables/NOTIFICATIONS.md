# Notification System - Implementation Documentation

## Overview

The notification system provides comprehensive in-app notification management with support for:
- **Bulk notification creation** for efficient multi-user messaging
- **Priority handling** for urgent vs. low-priority notifications
- **Notification categorization** by type (LICENSE, PAYOUT, ROYALTY, PROJECT, SYSTEM, MESSAGE)
- **Intelligent bundling/grouping** to prevent notification spam
- **Automatic expiry and cleanup** based on configurable rules

## Architecture

### Database Schema

**Table: `notifications`**
```sql
- id: TEXT (Primary Key)
- user_id: TEXT (Foreign Key -> users.id)
- type: NotificationType ENUM
- title: VARCHAR(255)
- message: TEXT
- action_url: TEXT (optional)
- priority: NotificationPriority ENUM (default: MEDIUM)
- read: BOOLEAN (default: false)
- read_at: TIMESTAMP (nullable)
- metadata: JSONB (nullable)
- created_at: TIMESTAMP (default: NOW)
```

**Indexes:**
- `(user_id, read, created_at DESC)` - Optimized for unread queries
- `(user_id, type)` - Optimized for type filtering
- `(created_at DESC)` - Optimized for date-based queries

**Enums:**
```typescript
NotificationType: LICENSE | PAYOUT | ROYALTY | PROJECT | SYSTEM | MESSAGE
NotificationPriority: LOW | MEDIUM | HIGH | URGENT
```

### Service Layer

**Location:** `src/modules/system/services/notification.service.ts`

**Core Methods:**

#### 1. Basic Operations

```typescript
// Create single or bulk notifications
create(params: CreateNotificationInput): Promise<CreateNotificationResult>

// List user notifications with filtering
listForUser(params: ListNotificationsInput & { userId: string }): Promise<{
  notifications: Notification[];
  total: number;
}>

// Get unread count (cached in Redis)
getUnreadCount(userId: string): Promise<number>

// Mark as read
markAsRead(notificationId: string, userId: string): Promise<Notification>
markAllAsRead(userId: string): Promise<number>

// Delete notifications
delete(notificationId: string, userId: string): Promise<void>
deleteAllForUser(userId: string): Promise<number> // GDPR compliance
```

#### 2. Advanced Features

```typescript
// Create with bundling support (prevents spam)
createWithBundling(params: CreateNotificationInput & {
  bundleKey?: string;
  bundleWindow?: number; // in minutes
}): Promise<CreateNotificationResult>

// Get notifications by category
getByType(
  userId: string,
  types: NotificationType[],
  options?: { read?: boolean; limit?: number }
): Promise<Notification[]>

// Get counts by category
getCountsByCategory(userId: string): Promise<Record<NotificationType, number>>

// Bulk create for large user sets
bulkCreate(
  userIds: string[],
  notification: BulkNotificationInput
): Promise<CreateNotificationResult>

// Cleanup expired notifications
cleanupExpired(): Promise<{ deleted: number }>
```

#### 3. Priority & Email Handling

```typescript
// Check if priority requires immediate email
shouldSendImmediateEmail(priority: NotificationPriority): boolean

// Get notifications for digest email
getDigestNotifications(userId: string, since: Date): Promise<Notification[]>
```

## Notification Categorization

### Types & Use Cases

| Type | Description | Default Priority | Example Use Cases |
|------|-------------|-----------------|-------------------|
| **LICENSE** | License-related events | MEDIUM | Approvals, rejections, expirations |
| **PAYOUT** | Payment & payout events | HIGH | Completed payouts, failed transfers |
| **ROYALTY** | Royalty statements | MEDIUM | New statements available |
| **PROJECT** | Project activities | MEDIUM | Invitations, status changes |
| **SYSTEM** | System-wide announcements | HIGH | Maintenance, new features |
| **MESSAGE** | Direct messages | MEDIUM | New messages received |

### Categorization Methods

```typescript
// Get all license notifications
const licenseNotifications = await notificationService.getByType(
  userId,
  ['LICENSE'],
  { read: false, limit: 10 }
);

// Get category counts
const counts = await notificationService.getCountsByCategory(userId);
// Returns: { LICENSE: 5, PAYOUT: 2, ROYALTY: 1, ... }
```

## Notification Bundling

### Purpose
Prevents notification spam by combining similar notifications within a time window.

### Configuration

```typescript
// From notification.constants.ts
NOTIFICATION_BUNDLING_CONFIG = {
  LICENSE: { canBundle: true, windowMinutes: 15 },
  MESSAGE: { canBundle: true, windowMinutes: 5 },
  PAYOUT: { canBundle: false, windowMinutes: 0 }, // Financial = no bundling
  // ...
}
```

### Usage

```typescript
// Without bundling (creates separate notifications)
await notificationService.create({
  userId: 'user123',
  type: 'MESSAGE',
  title: 'New Message',
  message: 'You have 1 new message'
});

// With bundling (updates existing if within window)
await notificationService.createWithBundling({
  userId: 'user123',
  type: 'MESSAGE',
  title: 'New Messages',
  message: 'You have 2 new messages', // Will update count
  bundleKey: 'thread_abc123', // Groups by thread
  bundleWindow: 5 // 5 minute window
});
```

### Bundling Rules
- **URGENT/HIGH priority:** Never bundled
- **Bundle key:** Used to identify related notifications
- **Time window:** Only bundles within specified minutes
- **Metadata tracking:** `bundleCount` tracks total bundled items

## Priority Handling

### Priority Levels

| Priority | Email Behavior | UI Treatment | Use Cases |
|----------|---------------|--------------|-----------|
| **URGENT** | Immediate email | Red badge, toast | Critical failures, security issues |
| **HIGH** | Immediate email | Orange badge | Approvals, important updates |
| **MEDIUM** | Digest email | Blue badge | General notifications |
| **LOW** | Digest email | Gray badge | Info, tips |

### Email Integration

```typescript
// Check if should send immediate email
if (notificationService.shouldSendImmediateEmail(priority)) {
  await sendImmediateEmail(notification);
} else {
  // Queue for daily/weekly digest
  await queueForDigest(notification);
}

// Get notifications for digest
const digestNotifications = await notificationService.getDigestNotifications(
  userId,
  lastDigestSent
);
```

## Notification Expiry & Cleanup

### Expiry Rules

| Condition | Age Threshold | Action |
|-----------|--------------|--------|
| Read (general) | 30 days | Delete |
| Read (SYSTEM type) | 7 days | Delete |
| Unread (LOW/MEDIUM) | 90 days | Delete |
| Unread (HIGH/URGENT) | Never | Keep |

### Cleanup Job

**Location:** `src/jobs/notification-cleanup.job.ts`

**Schedule:** Daily at 3 AM

```typescript
// Manual cleanup trigger
const result = await notificationService.cleanupExpired();
console.log(`Deleted ${result.deleted} notifications`);
```

## Notification Templates

### Using Templates

```typescript
import { formatNotificationTemplate } from '@/modules/system';

// Use predefined template
const notification = formatNotificationTemplate('LICENSE_APPROVED', {
  assetName: 'Nike Campaign Video',
});

await notificationService.create({
  userId: 'user123',
  ...notification,
  actionUrl: '/licenses/lic123'
});
```

### Available Templates

**License Templates:**
- `LICENSE_APPROVED` - Asset approved
- `LICENSE_REJECTED` - Asset rejected
- `LICENSE_EXPIRING` - Expiring soon warning
- `LICENSE_EXPIRED` - Already expired

**Payout Templates:**
- `PAYOUT_COMPLETED` - Successful payout
- `PAYOUT_FAILED` - Failed payout

**Royalty Templates:**
- `ROYALTY_STATEMENT_AVAILABLE` - New statement ready

**Project Templates:**
- `PROJECT_INVITATION` - Invited to project
- `PROJECT_STATUS_CHANGE` - Status updated

**System Templates:**
- `SYSTEM_MAINTENANCE` - Scheduled maintenance
- `SYSTEM_UPDATE` - New features

**Message Templates:**
- `MESSAGE_RECEIVED` - Single message
- `MESSAGES_RECEIVED_BUNDLED` - Multiple messages

## API Endpoints (tRPC)

### Protected Procedures (User Access)

```typescript
// List notifications
trpc.system.notifications.list.useQuery({
  read: false,
  type: 'LICENSE',
  priority: 'HIGH',
  page: 1,
  pageSize: 20
});

// Get unread count
trpc.system.notifications.getUnreadCount.useQuery();

// Mark as read
trpc.system.notifications.markAsRead.useMutation({
  notificationId: 'notif123'
});

// Mark all as read
trpc.system.notifications.markAllAsRead.useMutation();

// Delete notification
trpc.system.notifications.delete.useMutation({
  notificationId: 'notif123'
});
```

### Admin Procedures

```typescript
// Create notification(s)
trpc.system.notifications.create.useMutation({
  // Single user
  userId: 'user123',
  // OR multiple users
  userIds: ['user1', 'user2'],
  // OR all users with role
  userRole: 'BRAND',
  
  type: 'SYSTEM',
  title: 'Maintenance Alert',
  message: 'Scheduled maintenance tonight',
  priority: 'HIGH',
  actionUrl: '/system-status'
});
```

## Integration Examples

### 1. License Expiry Notifications

```typescript
// In license expiry check job
import { NotificationService, formatNotificationTemplate } from '@/modules/system';

async function checkExpiringLicenses() {
  const expiringLicenses = await getExpiringLicenses(30); // 30 days
  
  for (const license of expiringLicenses) {
    const notification = formatNotificationTemplate('LICENSE_EXPIRING', {
      assetName: license.asset.title,
      days: license.daysUntilExpiry,
    });
    
    await notificationService.create({
      userId: license.brand.userId,
      ...notification,
      actionUrl: `/licenses/${license.id}`,
      metadata: {
        licenseId: license.id,
        expiryDate: license.endDate,
      },
    });
  }
}
```

### 2. Payout Completion

```typescript
// In payout processing service
async function handlePayoutComplete(payout: Payout) {
  const notification = formatNotificationTemplate('PAYOUT_COMPLETED', {
    amount: `$${(payout.amountCents / 100).toFixed(2)}`,
  });
  
  await notificationService.create({
    userId: payout.creator.userId,
    ...notification,
    actionUrl: `/payouts/${payout.id}`,
    metadata: {
      payoutId: payout.id,
      amountCents: payout.amountCents,
      stripeTransferId: payout.stripeTransferId,
    },
  });
}
```

### 3. Message Notifications with Bundling

```typescript
// In message service
async function handleNewMessage(message: Message) {
  await notificationService.createWithBundling({
    userId: message.recipientId,
    type: 'MESSAGE',
    title: 'New Message',
    message: `${message.sender.name} sent you a message`,
    priority: 'MEDIUM',
    actionUrl: `/messages/${message.threadId}`,
    bundleKey: `thread_${message.threadId}`,
    bundleWindow: 5, // 5 minutes
    metadata: {
      messageId: message.id,
      threadId: message.threadId,
      senderId: message.senderId,
    },
  });
}
```

### 4. System-wide Announcement

```typescript
// Admin creates announcement for all brands
await notificationService.create({
  userRole: 'BRAND',
  type: 'SYSTEM',
  title: 'New Analytics Dashboard',
  message: 'Check out our enhanced analytics with real-time insights!',
  priority: 'MEDIUM',
  actionUrl: '/analytics',
  metadata: {
    featureName: 'Advanced Analytics',
    releaseDate: new Date().toISOString(),
  },
});
```

## Performance Considerations

### Caching Strategy
- **Unread counts:** Cached in Redis with 60-second TTL
- **Cache invalidation:** Automatic on create, read, delete operations

### Bulk Operations
- **< 200 users:** Transaction-based (returns notification IDs)
- **> 200 users:** `createMany` for efficiency (no IDs returned)

### Query Optimization
- Composite indexes for common query patterns
- Pagination required for list operations (max 100 per page)

### Background Processing
- Cleanup job runs off-peak hours (3 AM)
- Digest email generation runs separately from creation

## Testing

### Unit Tests

```typescript
describe('NotificationService', () => {
  it('should create notification with bundling', async () => {
    // First notification
    await service.createWithBundling({
      userId: 'user1',
      type: 'MESSAGE',
      title: 'New Message',
      message: 'You have 1 new message',
      bundleKey: 'thread_123',
    });
    
    // Second notification (should bundle)
    await service.createWithBundling({
      userId: 'user1',
      type: 'MESSAGE',
      title: 'New Messages',
      message: 'You have 2 new messages',
      bundleKey: 'thread_123',
    });
    
    // Should only have 1 notification
    const notifications = await service.listForUser({
      userId: 'user1',
    });
    expect(notifications.total).toBe(1);
    expect(notifications.notifications[0].metadata.bundleCount).toBe(2);
  });
  
  it('should respect priority-based bundling rules', async () => {
    // URGENT should not bundle
    const result = await service.createWithBundling({
      userId: 'user1',
      type: 'PAYOUT',
      title: 'Payout Failed',
      message: 'Your payout could not be processed',
      priority: 'URGENT',
      bundleKey: 'payout_fail',
    });
    
    // Should create new notification even with same bundle key
    expect(result.created).toBe(1);
  });
});
```

## Troubleshooting

### Issue: Unread count not updating
**Solution:** Check Redis connection and cache invalidation logic

### Issue: Too many notifications for user
**Solution:** Implement bundling for the notification type

### Issue: Old notifications not being cleaned up
**Solution:** Verify cleanup job is running and check logs

### Issue: Notifications not being created
**Solution:** Check Prisma client generation and enum values

## Future Enhancements

1. **Web Push Notifications:** Browser push notification support
2. **Mobile Push:** Integration with FCM/APNS
3. **Notification Preferences:** User-level control over types/priorities
4. **Notification Actions:** Quick actions directly from notification
5. **Read Receipts:** Track when notifications are viewed
6. **Notification Analytics:** Track engagement metrics

## Related Documentation

- [System Tables Overview](./overview.md)
- [Email Integration Guide](../../docs/frontend-integration/EMAIL_VERIFICATION_INTEGRATION_GUIDE.md)
- [Message Notifications](../../docs/modules/messages/NOTIFICATIONS.md)
