# Message Notifications Implementation

## Overview

The message notification system provides comprehensive notification and email delivery for the messaging feature, including immediate notifications and digest emails.

## Components

### 1. MessageNotificationService

Located at: `src/modules/messages/services/notification.service.ts`

**Responsibilities:**
- Trigger in-app notifications when messages are sent
- Queue email notifications with cooldown protection
- Manage notification preferences
- Support thread muting/unmuting
- Generate message digest data

**Key Methods:**

#### `notifyNewMessage(payload)`
Triggers notifications when a new message is sent. Creates in-app notification and queues email (if enabled and cooldown allows).

**Parameters:**
```typescript
{
  messageId: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  messageBody: string;
}
```

#### `updateNotificationPreferences(userId, preferences)`
Updates user's message notification preferences.

**Preferences:**
- `emailNotifications`: 'immediate' | 'digest' | 'off'
- `inAppNotifications`: boolean
- `digestFrequency`: 'daily' | 'weekly' (if digest enabled)

#### `muteThread(userId, threadId)` / `unmuteThread(userId, threadId)`
Mute or unmute notifications for a specific thread.

### 2. Email Templates

#### NewMessage Template
**Path:** `emails/templates/NewMessage.tsx`

Sent immediately when a user receives a new message (if immediate notifications enabled).

**Variables:**
```typescript
{
  recipientName?: string;
  senderName: string;
  threadSubject?: string;
  messagePreview: string;
  threadUrl: string;
}
```

#### MessageDigest Template
**Path:** `emails/templates/MessageDigest.tsx`

Sent on schedule (daily/weekly) with summary of unread messages.

**Variables:**
```typescript
{
  recipientName?: string;
  frequency: 'daily' | 'weekly';
  threads: Array<{
    threadId: string;
    threadSubject: string | null;
    messageCount: number;
    senders: string[];
    latestMessage: {
      senderName: string;
      body: string;
      createdAt: Date;
    };
  }>;
  totalUnreadCount: number;
  inboxUrl: string;
}
```

### 3. Background Jobs

#### Message Notification Worker
**Path:** `src/jobs/message-notification.job.ts`

Processes the `message-notifications` queue to send immediate email notifications.

**Configuration:**
- Concurrency: 5
- Rate limit: 100 emails per minute
- Retry: 3 attempts with exponential backoff

#### Message Digest Job
**Path:** `src/jobs/message-digest.job.ts`

Scheduled job that sends digest emails to users who opted for batched notifications.

**Schedule:**
- Daily: Every day at 9 AM (`0 9 * * *`)
- Weekly: Every Monday at 9 AM (`0 9 * * 1`)

**Process:**
1. Query users with digest preferences matching frequency
2. Get unread messages since last digest
3. Group messages by thread
4. Send digest email if user has unread messages

### 4. Router Integration

**Path:** `src/modules/messages/router.ts`

Added endpoints for notification preferences:

```typescript
// Mute/unmute threads
messages.muteThread({ threadId })
messages.unmuteThread({ threadId })

// Update preferences
messages.updateNotificationPreferences({
  emailNotifications?: 'immediate' | 'digest' | 'off',
  inAppNotifications?: boolean,
  digestFrequency?: 'daily' | 'weekly'
})
```

## Notification Flow

### Immediate Notifications

1. User sends message via `messages.sendMessage()`
2. Router calls `notificationService.notifyNewMessage()`
3. Service creates in-app notification (if not muted)
4. Service checks user preferences:
   - If `emailNotifications === 'immediate'`:
     - Check cooldown (5 minutes per thread)
     - If cooldown passed, queue email notification job
     - Set new cooldown
5. Worker processes job and sends email

### Digest Notifications

1. Scheduled job runs (daily at 9 AM or weekly Monday 9 AM)
2. Query users with `digestFrequency` matching job frequency
3. For each user:
   - Get unread messages since last digest
   - Group by thread
   - Send digest email if messages exist
4. Track sent digests to avoid duplicates

## Email Cooldown

To prevent inbox spam during rapid message exchanges:

**Cooldown Period:** 5 minutes per thread per user

**Implementation:**
```
Redis Key: message:email_cooldown:{userId}:{threadId}
TTL: 300 seconds (5 minutes)
```

**Logic:**
- Check if cooldown key exists before queueing email
- If exists, skip email (notification still created in-app)
- If not exists, queue email and set cooldown

## Notification Preferences

### Storage

Preferences are stored in `email_preferences.categoryPreferences` JSON field:

```json
{
  "messages": {
    "emailNotifications": "immediate",
    "inAppNotifications": true,
    "digestFrequency": "daily"
  },
  "mutedThreads": ["thread-id-1", "thread-id-2"]
}
```

### Defaults

New users receive:
- Email notifications: immediate
- In-app notifications: enabled
- Digest frequency: daily (if switched to digest)

### Checking Preferences

The service checks preferences in this order:

1. Check if `email_preferences.messages` is enabled (boolean field)
2. Check `categoryPreferences.messages.emailNotifications`
3. If thread is in `mutedThreads`, skip notifications
4. Apply cooldown for immediate emails

## Database Changes

### NotificationType Enum

Added `MESSAGE` to the `NotificationType` enum:

```sql
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MESSAGE';
```

**Migration:** `migrations/add_message_notification_type.sql`

### No Schema Changes

The implementation reuses existing structures:
- `notifications` table (MESSAGE type)
- `email_preferences` table (categoryPreferences JSON)
- No new tables required

## BullMQ Queue

### Queue: `message-notifications`

**Connection:** Redis (same instance as other queues)

**Job Data:**
```typescript
{
  recipientId: string;
  recipientEmail: string;
  recipientName: string | null;
  senderId: string;
  senderName: string | null;
  threadId: string;
  threadSubject: string | null;
  messagePreview: string;
  messageId: string;
}
```

**Retry Strategy:**
- Max attempts: 3
- Backoff: exponential (2s, 4s, 8s)

## Integration Points

### With Message Router
- `sendMessage` mutation triggers notification automatically
- No manual intervention needed

### With Email Service
- Uses existing `EmailService.sendTransactional()`
- Respects email preferences and suppression lists
- Integrates with Resend adapter

### With Notification Service
- Creates in-app notifications via `NotificationService`
- Follows same patterns as other notification types

## Testing Considerations

### Manual Testing

1. **Immediate Notifications:**
   - Send message between two users
   - Verify in-app notification created
   - Verify email sent (check Resend dashboard)
   - Send rapid messages, verify cooldown works

2. **Digest Notifications:**
   - Set user preference to digest (daily)
   - Send multiple unread messages
   - Trigger digest job manually
   - Verify digest email contains all threads

3. **Muting:**
   - Mute a thread
   - Send message in that thread
   - Verify no notification sent
   - Unmute and verify notifications resume

4. **Preferences:**
   - Test each combination:
     - Immediate, digest, off
     - With/without in-app
     - Daily vs weekly digest

### Job Testing

**Run message notification worker:**
```bash
npm run worker:message-notifications
```

**Trigger digest job manually:**
```bash
npm run job:message-digest -- --frequency daily
```

## Environment Variables

Required:
- `NEXT_PUBLIC_APP_URL`: Base URL for message thread links
- `RESEND_API_KEY`: Resend email service API key
- `RESEND_SENDER_EMAIL`: From email address

## Future Enhancements

1. **Push Notifications:** Mobile push notifications via FCM/APNS
2. **Desktop Notifications:** Browser push notifications
3. **Smart Digests:** ML-based grouping and prioritization
4. **Read Receipts:** Track when notifications are viewed
5. **Delivery Tracking:** Track email opens and clicks
6. **A/B Testing:** Test different digest formats

## Troubleshooting

### Emails Not Sending

1. Check user has `messages: true` in email preferences
2. Verify not in global unsubscribe
3. Check email not in suppression list
4. Verify worker is running
5. Check Redis connection for queue
6. Review worker logs for errors

### Duplicate Emails

1. Verify cooldown is working (check Redis)
2. Check if multiple workers running
3. Review job deduplication settings

### Missing Digest Emails

1. Verify user has `digestFrequency` set
2. Check user has unread messages in time period
3. Verify scheduled job is running
4. Check user not globally unsubscribed

## Performance Considerations

### Optimizations Implemented

1. **Cooldown Cache:** Redis-based, prevents DB hits
2. **Async Processing:** Email sending via BullMQ queue
3. **Batch Queries:** Digest job uses efficient queries
4. **Rate Limiting:** Worker has concurrency and rate limits

### Monitoring

Monitor these metrics:
- Queue depth for `message-notifications`
- Email send success rate
- Average processing time per job
- Failed job count and reasons
- Cooldown hit rate
