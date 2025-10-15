# 🌐 Notification Delivery System - Part 2: Business Logic & Validation

**Classification:** 🌐 SHARED  
**Module:** Notification Delivery  
**Last Updated:** October 14, 2025

> **Context:** Business rules, validation requirements, email delivery logic, and state machine behavior for the notification delivery system.

---

## Table of Contents

1. [Email Delivery Decision Flow](#email-delivery-decision-flow)
2. [Digest Email Behavior](#digest-email-behavior)
3. [Priority Handling](#priority-handling)
4. [Notification Type Metadata](#notification-type-metadata)
5. [Validation Rules](#validation-rules)
6. [Rate Limiting & Quotas](#rate-limiting--quotas)
7. [Bundling Logic](#bundling-logic)
8. [Cleanup & Retention](#cleanup--retention)

---

## Email Delivery Decision Flow

When a notification is created, the system decides whether to send an immediate email or queue it for digest based on multiple factors:

### Decision Tree

```
1. Check if notification type is enabled in user preferences
   ├─ If disabled → No email
   └─ If enabled → Continue

2. Check user's emailEnabled preference
   ├─ If false → No email
   └─ If true → Continue

3. Check user's email_verified status
   ├─ If false → No email (silently skip)
   └─ If true → Continue

4. Check priority level
   ├─ If URGENT → Send immediate email (always)
   ├─ If HIGH → Send immediate email (always)
   ├─ If LOW → Queue for digest (always)
   └─ If MEDIUM → Check digestFrequency
       ├─ IMMEDIATE → Send immediate email
       ├─ DAILY → Queue for daily digest
       ├─ WEEKLY → Queue for weekly digest
       └─ NEVER → No email
```

### Code Implementation

```typescript
// Backend logic (NotificationEmailService)
async function shouldSendImmediateEmail(
  notification: Notification,
  userPreferences: NotificationPreferences
): Promise<boolean> {
  // 1. Check if type is enabled
  if (!userPreferences.enabledTypes.includes(notification.type)) {
    return false;
  }

  // 2. Check if email is enabled
  if (!userPreferences.emailEnabled) {
    return false;
  }

  // 3. Check email verification (happens in service)
  // (Not shown here - happens at user lookup)

  // 4. Check priority
  if (['URGENT', 'HIGH'].includes(notification.priority)) {
    return true; // Always send immediate
  }

  if (notification.priority === 'LOW') {
    return false; // Always queue for digest
  }

  // MEDIUM priority - check digest frequency
  return userPreferences.digestFrequency === 'IMMEDIATE';
}
```

### Frontend Implications

**What this means for UI:**
- Show email toggle as disabled if user's email is not verified
- Display warning when trying to enable email: "Please verify your email first"
- Show different messaging for URGENT/HIGH vs MEDIUM/LOW priorities:
  - URGENT/HIGH: "You will always receive immediate emails for critical notifications"
  - MEDIUM: "Controlled by your digest frequency preference"
  - LOW: "Included only in digest emails"

---

## Digest Email Behavior

### Digest Schedule

| Frequency | Schedule | Timezone Handling |
|-----------|----------|-------------------|
| `DAILY` | Every day at 9:00 AM | User's timezone (if set) or UTC |
| `WEEKLY` | Every Monday at 9:00 AM | User's timezone (if set) or UTC |

**Cron Jobs:**
- Daily: `0 9 * * *`
- Weekly: `0 9 * * 1`

### Digest Content

Digest emails include:
- **All unread notifications** since the last digest was sent (or last 24 hours for daily, 7 days for weekly)
- **Only MEDIUM and LOW priority** notifications (HIGH/URGENT are sent immediately)
- **Grouped by notification type** (LICENSE, PAYOUT, ROYALTY, etc.)
- **Summary counts** per type
- **Links to view each notification** in the app

### Digest Sending Rules

1. **Only sent if there are unread notifications** (no empty digests)
2. **Only includes enabled notification types** (respects `enabledTypes` preference)
3. **Marks digest timestamp** to prevent duplicate sends
4. **Batch processing** - Processes users in batches of 50 to avoid overwhelming email service

### Example Digest Email Content

```
Subject: Your Daily Notification Digest - 3 Unread Notifications

Hi Alex,

You have 3 unread notifications from the last 24 hours:

LICENSE NOTIFICATIONS (2)
━━━━━━━━━━━━━━━━━━━━━━━━━━
• License Expiring Soon
  Your license for "Brand Logo" expires in 30 days
  View → /licenses/clx456def

• License Renewal Available
  Renew your license for "Product Photo Set" now
  View → /licenses/clx789ghi

PAYOUT NOTIFICATIONS (1)
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Payout Processed
  Your payout of $1,250.00 has been sent
  View → /payouts/clx012jkl

━━━━━━━━━━━━━━━━━━━━━━━━━━

View All Notifications → https://yesgoddess.agency/notifications

Update your notification preferences → https://yesgoddess.agency/settings/notifications
```

### Frontend Implementation

**What to show in settings:**

```typescript
// Digest frequency selector (only shown if emailEnabled === true)
<select disabled={!emailEnabled}>
  <option value="IMMEDIATE">Send emails immediately</option>
  <option value="DAILY">Daily digest (9 AM)</option>
  <option value="WEEKLY">Weekly digest (Monday 9 AM)</option>
  <option value="NEVER">No email notifications</option>
</select>

// Helper text
{digestFrequency === 'DAILY' && (
  <p className="text-sm text-gray-500">
    You'll receive one email per day at 9 AM with all your unread notifications.
    Critical notifications (HIGH/URGENT) are still sent immediately.
  </p>
)}
```

---

## Priority Handling

### Priority Levels

| Priority | Email Behavior | In-App Badge Color | Use Cases |
|----------|----------------|-------------------|-----------|
| **URGENT** | Immediate email (always) | Red | Critical failures, security issues, license suspended |
| **HIGH** | Immediate email (always) | Orange | License expiring soon, payment failed, approval needed |
| **MEDIUM** | Digest or immediate (based on preference) | Blue | New message, project invite, royalty statement ready |
| **LOW** | Digest only (always) | Gray | Platform tips, feature announcements, weekly summaries |

### Email Template Selection

Each priority level can use different email templates for urgency:

```typescript
// Template selection logic
function getEmailTemplate(notification: Notification): string {
  if (notification.priority === 'URGENT') {
    return 'urgent-notification'; // Red header, "Action Required" banner
  }
  if (notification.priority === 'HIGH') {
    return 'important-notification'; // Orange header
  }
  return 'standard-notification'; // Blue header
}
```

### UI Treatment by Priority

```typescript
// Badge styles
const priorityStyles = {
  URGENT: 'bg-red-100 text-red-800 ring-red-600',
  HIGH: 'bg-orange-100 text-orange-800 ring-orange-600',
  MEDIUM: 'bg-blue-100 text-blue-800 ring-blue-600',
  LOW: 'bg-gray-100 text-gray-800 ring-gray-600',
};

// Toast notification duration
const toastDurations = {
  URGENT: null, // Don't auto-dismiss
  HIGH: 10000,  // 10 seconds
  MEDIUM: 5000, // 5 seconds
  LOW: 3000,    // 3 seconds
};

// Sound/vibration
const shouldPlaySound = (priority: NotificationPriority) => {
  return ['URGENT', 'HIGH'].includes(priority);
};
```

---

## Notification Type Metadata

Each notification type includes specific metadata to help the frontend render appropriate UI and actions.

### LICENSE Notifications

```typescript
interface LicenseNotificationMetadata {
  licenseId: string;           // CUID of license
  assetId?: string;            // Related asset CUID
  expiryDate?: string;         // ISO 8601 date
  daysRemaining?: number;      // Days until expiry
  action?: 'RENEW' | 'ACTIVATE' | 'SUSPEND';
}

// Example
{
  "type": "LICENSE",
  "title": "License Expiring Soon",
  "message": "Your license for 'Brand Logo' expires in 30 days",
  "actionUrl": "/licenses/clx456def",
  "priority": "HIGH",
  "metadata": {
    "licenseId": "clx456def",
    "assetId": "clx_asset123",
    "expiryDate": "2025-11-14T00:00:00Z",
    "daysRemaining": 30,
    "action": "RENEW"
  }
}
```

### PAYOUT Notifications

```typescript
interface PayoutNotificationMetadata {
  payoutId: string;            // CUID of payout
  amount: number;              // Dollar amount (e.g., 1250.00)
  currency: string;            // ISO currency code (e.g., "USD")
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failureReason?: string;      // If status is FAILED
}

// Example
{
  "type": "PAYOUT",
  "title": "Payout Processed",
  "message": "Your payout of $1,250.00 has been sent",
  "actionUrl": "/payouts/clx_payout123",
  "priority": "MEDIUM",
  "metadata": {
    "payoutId": "clx_payout123",
    "amount": 1250.00,
    "currency": "USD",
    "status": "COMPLETED"
  }
}
```

### ROYALTY Notifications

```typescript
interface RoyaltyNotificationMetadata {
  statementId: string;         // CUID of royalty statement
  period: string;              // e.g., "2025-Q3"
  totalEarnings: number;       // Total earnings amount
  currency: string;            // ISO currency code
  downloadUrl?: string;        // PDF download link
}
```

### PROJECT Notifications

```typescript
interface ProjectNotificationMetadata {
  projectId: string;           // CUID of project
  inviterId?: string;          // User who sent invitation
  role?: string;               // Assigned role (e.g., "Collaborator")
  action?: 'INVITE' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
}
```

### SYSTEM Notifications

```typescript
interface SystemNotificationMetadata {
  category?: 'MAINTENANCE' | 'FEATURE' | 'POLICY' | 'SECURITY';
  affectedServices?: string[];  // e.g., ["uploads", "payments"]
  startTime?: string;           // ISO 8601 (for maintenance)
  endTime?: string;             // ISO 8601 (for maintenance)
}
```

### MESSAGE Notifications

```typescript
interface MessageNotificationMetadata {
  threadId: string;            // Message thread CUID
  senderId: string;            // Sender user CUID
  senderName: string;          // Display name
  messagePreview: string;      // First 100 chars
}
```

---

## Validation Rules

### Field-Level Validation

| Field | Type | Required | Min | Max | Format |
|-------|------|----------|-----|-----|--------|
| `title` | string | Yes | 1 | 255 | Plain text |
| `message` | string | Yes | 1 | 1000 | Plain text or markdown |
| `actionUrl` | string | No | - | - | Valid URL or `/path` |
| `priority` | enum | No | - | - | LOW, MEDIUM, HIGH, URGENT |
| `type` | enum | Yes | - | - | LICENSE, PAYOUT, ROYALTY, PROJECT, SYSTEM, MESSAGE |
| `metadata` | object | No | - | - | Valid JSON object |

### Frontend Validation

```typescript
import { z } from 'zod';

const NotificationTitleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(255, 'Title must be 255 characters or less');

const NotificationMessageSchema = z
  .string()
  .min(1, 'Message is required')
  .max(1000, 'Message must be 1000 characters or less');

const ActionUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .or(z.string().regex(/^\/[a-z0-9\/-]*$/, 'Must start with /'))
  .optional();

// Form validation
const createNotificationFormSchema = z.object({
  title: NotificationTitleSchema,
  message: NotificationMessageSchema,
  actionUrl: ActionUrlSchema,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  type: z.enum(['LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE']),
});
```

### Business Rule Validation

**Email Preferences:**
- Cannot enable email if `email_verified` is `false`
- `digestFrequency` is ignored if `emailEnabled` is `false`
- `enabledTypes` must be a subset of valid `NotificationType` values

**Create Notification:**
- Must provide exactly ONE of: `userId`, `userIds`, or `userRole`
- Cannot target deleted or inactive users
- `userIds` array cannot be empty

**Polling:**
- `lastSeen` timestamp cannot be more than 24 hours in the past
- `lastSeen` timestamp cannot be in the future (auto-corrected to now)
- Poll requests are rate-limited to 1 per 10 seconds (recommended, not enforced)

---

## Rate Limiting & Quotas

### Polling Rate Limits

**Recommended:** 1 request per 10 seconds  
**Enforcement:** None (client-side recommended only)  
**Caching:** 5-second cache for "no new notifications" responses

```typescript
// Frontend polling implementation
let lastPollTime = 0;
const POLL_INTERVAL = 10000; // 10 seconds

async function pollNotifications() {
  const now = Date.now();
  if (now - lastPollTime < POLL_INTERVAL) {
    return; // Skip if too soon
  }

  lastPollTime = now;
  const result = await trpc.system.notifications.poll.query({
    lastSeen: localStorage.getItem('lastSeen'),
  });

  // Process result...
}
```

### Email Sending Quotas

**Daily Digest:**
- Sent to all users with `digestFrequency: DAILY` at 9 AM
- No limit on number of recipients
- Batch processing: 50 users per batch with 1-second delay between batches

**Weekly Digest:**
- Sent to all users with `digestFrequency: WEEKLY` on Monday at 9 AM
- Same batch processing as daily

**Immediate Emails:**
- No rate limit on sending
- Automatic retry: 3 attempts with exponential backoff (2s, 4s, 8s)
- Failed emails are logged but do not block notification creation

### Admin Notification Limits

**Bulk Creation:**
- Up to 1000 notifications per request
- Uses batch insert for > 200 users
- No daily limit

---

## Bundling Logic

Notification bundling prevents spam by combining similar notifications within a time window.

### When Bundling Occurs

**Criteria:**
- Notification priority is LOW or MEDIUM (never URGENT/HIGH)
- A `bundleKey` is provided
- An existing notification with same `bundleKey` exists within the bundle window (default: 5 minutes)

### Bundle Window

Default: **5 minutes**  
Configurable per notification type

### Bundling Behavior

```typescript
// Example: 3 messages from same thread arrive within 5 minutes

// First notification
{
  "title": "New message in 'Brand Discussion'",
  "message": "You have 1 new message",
  "metadata": {
    "bundleKey": "thread:clx_thread123",
    "bundleCount": 1
  }
}

// Second message arrives 2 minutes later → Updates existing notification
{
  "title": "New messages in 'Brand Discussion'",
  "message": "You have 2 new messages",
  "metadata": {
    "bundleKey": "thread:clx_thread123",
    "bundleCount": 2,
    "lastBundledAt": "2025-10-14T14:32:00Z"
  }
}

// Third message arrives 1 minute later → Updates again
{
  "title": "New messages in 'Brand Discussion'",
  "message": "You have 3 new messages",
  "metadata": {
    "bundleKey": "thread:clx_thread123",
    "bundleCount": 3,
    "lastBundledAt": "2025-10-14T14:33:00Z"
  }
}
```

### Frontend Display

```typescript
// Show bundle count in UI
function NotificationItem({ notification }: { notification: Notification }) {
  const bundleCount = notification.metadata?.bundleCount;

  return (
    <div className="notification">
      <h3>{notification.title}</h3>
      <p>{notification.message}</p>
      
      {bundleCount && bundleCount > 1 && (
        <span className="badge">
          {bundleCount} bundled notifications
        </span>
      )}
    </div>
  );
}
```

---

## Cleanup & Retention

### Automatic Cleanup Rules

The system automatically deletes old notifications to maintain performance:

| Notification State | Retention Period |
|-------------------|------------------|
| Read notifications (non-SYSTEM) | 30 days after `readAt` |
| Read SYSTEM notifications | 7 days after `readAt` |
| Unread LOW/MEDIUM notifications | 90 days after creation |
| Unread HIGH/URGENT notifications | Never auto-deleted |

### Cleanup Schedule

**Cron:** Daily at 2 AM UTC  
**Job:** `notification-cleanup`

### GDPR Compliance

**User Data Deletion:**
- When a user is deleted, all their notifications are cascade-deleted
- No manual cleanup needed
- Happens automatically via database `ON DELETE CASCADE`

**User Data Export:**
Users can request export of their notification history:

```typescript
// API endpoint (not yet implemented - future work)
// GET /api/users/me/notifications/export
// Returns: JSON file with all notifications
```

---

## State Machine Behavior

### Notification Lifecycle

```
┌─────────┐
│ CREATED │ (in-app notification created in database)
└────┬────┘
     │
     ├──→ Priority: URGENT/HIGH
     │    └─→ Queue immediate email job
     │         └─→ Email sent within 30 seconds
     │
     ├──→ Priority: MEDIUM + digestFrequency: IMMEDIATE
     │    └─→ Queue immediate email job
     │
     ├──→ Priority: MEDIUM + digestFrequency: DAILY
     │    └─→ Added to daily digest (9 AM next day)
     │
     ├──→ Priority: MEDIUM + digestFrequency: WEEKLY
     │    └─→ Added to weekly digest (Monday 9 AM)
     │
     └──→ Priority: LOW
          └─→ Added to digest based on user preference
     
┌──────────┐
│   READ   │ (user clicks notification)
└────┬─────┘
     │
     └─→ `read: true`, `readAt: <timestamp>`
         └─→ Unread count decremented
             └─→ Cache invalidated
             
┌──────────┐
│ DELETED  │ (user dismisses notification)
└──────────┘
     │
     └─→ Removed from database
         └─→ Unread count updated
```

### Edge Cases

**Email Not Verified:**
- Notification created in-app ✓
- Email skipped silently
- No error shown to user

**Digest with No Notifications:**
- Digest job runs
- No email sent
- `lastDigestSentAt` NOT updated

**User Deletes Account:**
- All notifications cascade-deleted
- Email queue jobs cancelled (if pending)

**Notification Priority Upgraded:**
- Not supported
- Notifications are immutable after creation
- Create a new notification instead

---

## Next Steps

- **Part 1:** [API Reference](./NOTIFICATION_DELIVERY_PART_1_API_REFERENCE.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATION_DELIVERY_PART_3_IMPLEMENTATION.md)

---

**Questions or Issues?** Contact the backend team or refer to the implementation code in `src/modules/system/`.
