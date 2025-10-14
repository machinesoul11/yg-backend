# 🌐 Notifications System - Business Logic & Validation Rules

**Classification:** 🌐 SHARED  
**Module:** Notifications Integration  
**Last Updated:** October 13, 2025

> **Context:** This document outlines business rules, validation requirements, email delivery logic, and notification behavior that frontend developers must understand to build proper UI/UX.

---

## Table of Contents

1. [Notification Types & Priorities](#notification-types--priorities)
2. [Email Delivery Logic](#email-delivery-logic)
3. [Digest Email Behavior](#digest-email-behavior)
4. [Validation Rules](#validation-rules)
5. [State Transitions](#state-transitions)
6. [Business Rules](#business-rules)
7. [Metadata Schema by Type](#metadata-schema-by-type)

---

## Notification Types & Priorities

### Notification Types

Each notification belongs to one of six types:

| Type | Description | Typical Priority | Example Use Cases |
|------|-------------|------------------|-------------------|
| `LICENSE` | License-related events | HIGH/MEDIUM | Expiring licenses, renewals, approvals |
| `PAYOUT` | Payment and payout events | HIGH | Payment processed, payout failed |
| `ROYALTY` | Royalty statements | MEDIUM | New royalty statement available |
| `PROJECT` | Project invitations | MEDIUM | Brand invites creator to project |
| `SYSTEM` | Platform announcements | LOW/MEDIUM | Maintenance, new features |
| `MESSAGE` | Direct messages | MEDIUM | New message received |

### Priority Levels

| Priority | Email Behavior | UI Treatment | Use Cases |
|----------|---------------|--------------|-----------|
| `URGENT` | **Always immediate** | Red badge, toast notification | Critical failures, security alerts |
| `HIGH` | **Always immediate** | Orange badge, prominent display | Approvals needed, important deadlines |
| `MEDIUM` | Respects user preference | Blue badge, standard display | General notifications |
| `LOW` | Digest only (never immediate) | Gray badge, subtle display | Tips, info messages |

### Priority Rules

1. **URGENT and HIGH always send immediate emails**, regardless of user's digest preference
2. **MEDIUM follows user preference** (immediate or digest)
3. **LOW only appears in digest emails**, never sent immediately
4. **In-app notifications are created for all priorities** (unless type is disabled)

---

## Email Delivery Logic

### Decision Flow

When a notification is created, the system decides whether to send an immediate email:

```
1. Check if notification type is enabled in user preferences
   ├─ If disabled → No email
   └─ If enabled → Continue

2. Check user's emailEnabled preference
   ├─ If false → No email
   └─ If true → Continue

3. Check user's email_verified status
   ├─ If false → No email
   └─ If true → Continue

4. Check priority level
   ├─ If URGENT or HIGH → Send immediate email
   ├─ If LOW → Queue for digest
   └─ If MEDIUM → Check digestFrequency
       ├─ IMMEDIATE → Send immediate email
       ├─ DAILY → Queue for daily digest
       ├─ WEEKLY → Queue for weekly digest
       └─ NEVER → No email
```

### Immediate Email Behavior

- **Delivery Time:** Within 30 seconds of notification creation
- **Template:** Type-specific email template
- **Cooldown:** 5-minute cooldown per thread (for MESSAGE type only)
- **Retry:** Up to 3 attempts if delivery fails

### Example Scenarios

| Scenario | digestFrequency | Priority | Result |
|----------|----------------|----------|---------|
| License expiring | DAILY | HIGH | Immediate email (overrides digest) |
| New message | IMMEDIATE | MEDIUM | Immediate email |
| New message | DAILY | MEDIUM | Queued for daily digest |
| Platform tip | WEEKLY | LOW | Queued for weekly digest |
| Security alert | NEVER | URGENT | Immediate email (overrides NEVER) |

---

## Digest Email Behavior

### Digest Schedule

| Frequency | Schedule | Timezone Handling |
|-----------|----------|-------------------|
| `DAILY` | Every day at 9:00 AM | User's timezone (if set) or UTC |
| `WEEKLY` | Every Monday at 9:00 AM | User's timezone (if set) or UTC |

### Digest Content

Digest emails include:
- **All unread notifications** since the last digest was sent
- **Grouped by notification type** (LICENSE, PAYOUT, etc.)
- **Summary counts** per type
- **Links to view each notification** in the app

### Digest Sending Rules

1. **Only sent if there are unread notifications** (no empty digests)
2. **Only includes MEDIUM and LOW priority** (HIGH/URGENT are sent immediately)
3. **Marks digest timestamp** to prevent duplicate sends
4. **Respects enabledTypes preference** (only includes enabled types)

### Digest Suppression

A digest will NOT be sent if:
- User has `emailEnabled: false`
- User's email is not verified
- User has `digestFrequency: NEVER`
- No unread notifications exist
- All unread notifications are HIGH/URGENT (already sent)

---

## Validation Rules

### Creating Notifications

#### Title Validation
- **Required:** Yes
- **Min Length:** 1 character
- **Max Length:** 255 characters
- **Sanitization:** HTML tags stripped

#### Message Validation
- **Required:** Yes
- **Min Length:** 1 character
- **Max Length:** 1000 characters
- **Sanitization:** HTML tags stripped (but line breaks preserved)

#### Action URL Validation
- **Required:** No (optional)
- **Format:** Must be valid URL or path starting with `/`
- **Examples:**
  - ✅ `https://yesgoddess.agency/dashboard`
  - ✅ `/dashboard/licenses/123`
  - ❌ `javascript:alert('xss')`

#### Target Validation
- **Must provide ONE of:** `userId`, `userIds`, or `userRole`
- **userId:** Must be valid CUID
- **userIds:** Array of valid CUIDs, max 1000 users
- **userRole:** One of `ADMIN`, `CREATOR`, `BRAND`, `VIEWER`

#### Metadata Validation
- **Type:** JSON object
- **Max Size:** 16KB
- **Structure:** Flat or nested allowed

### Updating Preferences

#### Email Enabled Validation
```typescript
// Cannot enable email notifications without verified email
if (emailEnabled === true && !user.email_verified) {
  throw new Error('Cannot enable email notifications without verified email address');
}
```

#### Enabled Types Validation
- **Type:** Array of `NotificationType`
- **Valid Values:** `LICENSE`, `PAYOUT`, `ROYALTY`, `PROJECT`, `SYSTEM`, `MESSAGE`
- **Empty Array:** Disables all notification types
- **Duplicates:** Automatically removed

#### Digest Frequency Validation
- **Valid Values:** `IMMEDIATE`, `DAILY`, `WEEKLY`, `NEVER`
- **Default:** `IMMEDIATE`
- **Note:** URGENT/HIGH priority always send immediately regardless of this setting

---

## State Transitions

### Notification Lifecycle

```
┌─────────┐
│ Created │ (read: false, readAt: null)
└────┬────┘
     │
     ├─► User clicks notification
     │   └─► Mark as Read (read: true, readAt: timestamp)
     │
     ├─► User clicks "Mark All as Read"
     │   └─► Mark as Read (read: true, readAt: timestamp)
     │
     └─► User deletes notification
         └─► Deleted (hard delete from database)
```

### Read State Rules

1. **Once marked as read, cannot be marked as unread**
2. **readAt timestamp is immutable** (set once when first marked as read)
3. **Marking as read does not delete** the notification
4. **Read notifications still appear in list** (unless filtered)

### Deletion Rules

1. **Users can only delete their own notifications**
2. **Deletion is permanent** (no soft delete)
3. **Cannot delete admin-created system notifications** (optional business rule)

---

## Business Rules

### Message Notifications

#### Cooldown Protection
- **Purpose:** Prevent email spam during active conversations
- **Duration:** 5 minutes per thread
- **Behavior:** After sending an immediate email for a message, no more emails for that thread for 5 minutes
- **Does Not Affect:** In-app notifications (always created)
- **Storage:** Redis key `message-email-cooldown:{userId}:{threadId}`

#### Thread Muting
- **User Control:** Users can mute specific message threads
- **Effect:** No notifications (email OR in-app) for muted threads
- **Storage:** `email_preferences.categoryPreferences.mutedThreads` array
- **Unmuting:** User can unmute at any time to resume notifications

### License Notifications

#### Expiry Warnings
- **30 days before:** MEDIUM priority
- **14 days before:** HIGH priority
- **7 days before:** HIGH priority
- **3 days before:** URGENT priority
- **Day of expiry:** URGENT priority

### Payout Notifications

- **Payout processed:** HIGH priority
- **Payout failed:** URGENT priority
- **Payout scheduled:** MEDIUM priority

### System Notifications

- **Maintenance:** LOW priority (informational)
- **New features:** LOW priority
- **Security alerts:** URGENT priority
- **Terms update:** HIGH priority

---

## Metadata Schema by Type

Each notification type has a specific metadata structure:

### LICENSE Notifications

```typescript
interface LicenseNotificationMetadata {
  licenseId: string;          // CUID
  licenseName: string;        // License display name
  expiryDate?: string;        // ISO 8601 (for expiry warnings)
  creatorId?: string;         // Creator who owns the license
  brandId?: string;           // Brand licensing the IP
  action?: 'expiring' | 'renewed' | 'cancelled' | 'approved';
}
```

### PAYOUT Notifications

```typescript
interface PayoutNotificationMetadata {
  payoutId: string;           // CUID
  amount: number;             // Amount in cents (e.g., 50000 = $500.00)
  currency: string;           // ISO currency code (e.g., "USD")
  status: 'processed' | 'failed' | 'pending';
  failureReason?: string;     // Only if status = 'failed'
  expectedDate?: string;      // ISO 8601 (for pending payouts)
}
```

### ROYALTY Notifications

```typescript
interface RoyaltyNotificationMetadata {
  statementId: string;        // CUID
  period: string;             // E.g., "Q3 2025" or "September 2025"
  totalEarnings: number;      // Amount in cents
  currency: string;           // ISO currency code
  creatorId: string;          // Creator receiving royalties
  downloadUrl?: string;       // Direct link to PDF statement
}
```

### PROJECT Notifications

```typescript
interface ProjectNotificationMetadata {
  projectId: string;          // CUID
  projectName: string;        // Project display name
  inviterId: string;          // User who sent invitation
  inviterName: string;        // Display name
  inviterRole: 'BRAND' | 'CREATOR'; // Who is inviting
  action: 'invited' | 'accepted' | 'declined' | 'removed';
}
```

### SYSTEM Notifications

```typescript
interface SystemNotificationMetadata {
  category: 'maintenance' | 'feature' | 'security' | 'terms' | 'announcement';
  affectedServices?: string[]; // E.g., ["messaging", "uploads"]
  scheduledTime?: string;      // ISO 8601 (for maintenance)
  documentUrl?: string;        // Link to terms, docs, etc.
}
```

### MESSAGE Notifications

```typescript
interface MessageNotificationMetadata {
  threadId: string;           // CUID
  threadSubject?: string;     // Thread subject line
  senderId: string;           // User who sent the message
  senderName: string;         // Display name
  messagePreview: string;     // First 100 characters of message
  messageId: string;          // CUID of the message
}
```

---

## Calculated Fields

### Unread Count
- **Calculation:** Count of notifications where `read = false`
- **Cached:** Yes (Redis, TTL: 5 minutes)
- **Invalidated:** When any notification is marked as read or created

### Notification Badge Display
```typescript
function getBadgeColor(priority: NotificationPriority): string {
  switch (priority) {
    case 'URGENT': return 'red';
    case 'HIGH': return 'orange';
    case 'MEDIUM': return 'blue';
    case 'LOW': return 'gray';
  }
}
```

---

## Error Scenarios

### Common Validation Errors

#### 1. Invalid Target
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Must provide userId, userIds, or userRole"
  }
}
```

#### 2. Email Not Verified
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cannot enable email notifications without verified email address"
  }
}
```

#### 3. Unauthorized Access
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this notification"
  }
}
```

#### 4. Notification Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Notification not found"
  }
}
```

---

## UX Considerations

### When to Show Notifications

1. **Immediate Toast:** URGENT and HIGH priority only
2. **Badge Count:** All unread notifications
3. **Notification Center:** All notifications (read and unread)
4. **Sound/Vibration:** URGENT only

### Grouping Recommendations

```typescript
// Group by type in UI
const grouped = notifications.reduce((acc, notif) => {
  if (!acc[notif.type]) acc[notif.type] = [];
  acc[notif.type].push(notif);
  return acc;
}, {} as Record<NotificationType, NotificationItem[]>);
```

### Auto-dismiss Behavior

| Priority | Auto-dismiss Toast | Dismiss Timeout |
|----------|-------------------|-----------------|
| URGENT | No | User must dismiss |
| HIGH | No | User must dismiss |
| MEDIUM | Yes | 5 seconds |
| LOW | Yes | 3 seconds |

---

## Next Steps

- **Part 1:** [API Endpoints Reference](./NOTIFICATIONS_API_ENDPOINTS.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATIONS_IMPLEMENTATION_GUIDE.md)
