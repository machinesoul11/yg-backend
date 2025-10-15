# 🌐 Notification Triggers - Part 2: Business Logic & Trigger Conditions

**Classification:** 🌐 SHARED - All users receive notifications (website and email)

**Last Updated:** October 14, 2025

---

## Table of Contents
- [Trigger Conditions](#trigger-conditions)
- [Business Rules by Trigger Type](#business-rules-by-trigger-type)
- [Email Delivery Logic](#email-delivery-logic)
- [Notification Preferences](#notification-preferences)
- [Edge Cases & Error Handling](#edge-cases--error-handling)

---

## Trigger Conditions

This section defines **when** each notification is automatically created by the backend.

### 1. License Expiry Warnings

**Trigger Source:** `license-expiry-monitor.job.ts` (runs daily at 09:00 UTC)

**Conditions:**

| Stage | Days Before Expiry | Window | Notification Created When |
|-------|-------------------|--------|---------------------------|
| 90-Day Notice | 90 | ±1 day | `ninety_day_notice_sent_at IS NULL` AND license expires in 89-91 days |
| 60-Day Notice | 60 | ±1 day | `sixty_day_notice_sent_at IS NULL` AND license expires in 59-61 days |
| 30-Day Notice | 30 | ±1 day | `thirty_day_notice_sent_at IS NULL` AND license expires in 29-31 days |

**License Status Requirements:**
- License status must be `ACTIVE` or `EXPIRING_SOON`
- License must not be deleted (`deleted_at IS NULL`)
- End date must be set (`end_date IS NOT NULL`)

**Recipients:**
1. **Brand Contact:** Primary user associated with the brand
2. **All IP Creators:** Users with ownership stakes in the licensed IP asset

**Example Scenario:**

```
License Created: January 1, 2025
End Date: December 31, 2025

Timeline:
- September 2, 2025 (09:00 UTC): 90-day notice sent ✅
- November 1, 2025 (09:00 UTC): 60-day notice sent ✅
- December 1, 2025 (09:00 UTC): 30-day notice sent ✅ + In-app HIGH priority notification
- December 31, 2025: License expires
```

**Database Updates:**

After sending each notification, the system updates:
```sql
UPDATE licenses SET
  ninety_day_notice_sent_at = NOW()  -- or sixty/thirty
WHERE id = '{licenseId}';
```

**Priority Escalation:**
- 90-day: `MEDIUM` priority (informational)
- 60-day: `MEDIUM` priority (reminder)
- 30-day: `HIGH` priority (urgent) + in-app notification created

**Rate Limiting:** No rate limiting (sent once per stage)

---

### 2. New Message Received

**Trigger Source:** `MessageNotificationService.notifyNewMessage()` (called when message is created)

**Conditions:**
- User receives a new message in a thread
- Sender is not the current user (no self-notifications)
- Thread is not muted by recipient
- Recipient has not disabled message notifications

**Notification Bundling:**
If multiple messages arrive within 5 minutes from the same thread, they are bundled:
```typescript
{
  "title": "3 new messages from Sarah Chen",
  "message": "You have 3 unread messages in \"License Terms Discussion\"",
  "metadata": {
    "threadId": "clyyy456",
    "messageCount": 3,
    "senderName": "Sarah Chen"
  }
}
```

**Email Cooldown:**
To prevent email spam, the system enforces a **5-minute cooldown** per thread:
- First message → Email sent immediately (if enabled)
- Messages within 5 minutes → No additional emails, but in-app notification updates
- After 5 minutes → Next email can be sent

**Muted Threads:**
If user has muted a thread, **no notification is created** (in-app or email).

**Example Flow:**

```
10:00 AM: Message 1 from Sarah
  → In-app notification created ✅
  → Email sent (if enabled) ✅
  → Cooldown set (expires 10:05 AM)

10:02 AM: Message 2 from Sarah
  → In-app notification updated (bundled) ✅
  → Email blocked (cooldown active) ❌

10:03 AM: Message 3 from Sarah
  → In-app notification updated (count: 3) ✅
  → Email blocked (cooldown active) ❌

10:10 AM: Message 4 from Sarah
  → New in-app notification created ✅
  → Email sent (cooldown expired) ✅
```

**Priority:** `MEDIUM` (always)

---

### 3. Royalty Statement Available

**Trigger Source:** `RoyaltyStatementService.notifyStatementReady()` (called when statement status changes to APPROVED)

**Conditions:**
- Royalty statement status transitions to `APPROVED`
- Creator has not been notified about this specific statement (`notified_at IS NULL`)
- Creator has royalty statement notifications enabled in preferences

**Recipients:**
- **Creator Only:** The creator associated with the royalty statement

**Timing:**
- Notification sent immediately when statement is approved by admin
- Statement must have calculated earnings > $0 (no notifications for zero-earnings statements)

**Example Statement Data:**

```json
{
  "statementId": "clbbb222",
  "periodStart": "2025-10-01T00:00:00Z",
  "periodEnd": "2025-12-31T23:59:59Z",
  "totalEarnings": 125000,  // $1,250.00
  "currency": "USD",
  "status": "APPROVED"
}
```

**Email Template Variables:**
- Creator name
- Period (e.g., "Q4 2025" or "October - December 2025")
- Total earnings formatted ($1,250.00)
- Link to statement details

**Priority:** `MEDIUM`

**Rate Limiting:** One notification per statement (idempotent)

---

### 4. Payout Completed

**Trigger Source:** Payout processing service (when payout status = `COMPLETED`)

**Conditions:**
- Payout status changes to `COMPLETED`
- Payment successfully transferred to creator's account
- Creator has payout notifications enabled

**Notification Content:**
```typescript
{
  "type": "PAYOUT",
  "priority": "HIGH",
  "title": "Payout Completed",
  "message": "Your payout of ${formattedAmount} has been successfully processed.",
  "metadata": {
    "payoutId": "clccc333",
    "amount": 125000,  // cents
    "currency": "USD",
    "status": "completed",
    "paymentMethod": "bank_transfer",
    "referenceNumber": "TXN-2025-12345"
  }
}
```

**Email Always Sent:** Yes (financial notifications bypass digest settings)

**Priority:** `HIGH`

**Bundling:** No (each payout gets separate notification)

---

### 5. Payout Failed

**Trigger Source:** Payout processing service (when payout status = `FAILED`)

**Conditions:**
- Payout processing attempt fails
- Failure is not a temporary network error (permanent failure)
- Common reasons:
  - Invalid bank account details
  - Insufficient funds in platform account
  - Blocked/closed recipient account
  - Compliance/fraud flag

**Notification Content:**
```typescript
{
  "type": "PAYOUT",
  "priority": "URGENT",
  "title": "Payout Failed",
  "message": "Your payout of ${formattedAmount} could not be processed. Please update your payment information.",
  "actionUrl": "/settings/payment-methods",
  "metadata": {
    "payoutId": "clccc333",
    "amount": 125000,
    "currency": "USD",
    "status": "failed",
    "failureReason": "Invalid bank account number"
  }
}
```

**Email Always Sent:** Yes (critical financial notification)

**Priority:** `URGENT` (highest)

**Action Required:** User must update payment details to retry

**Retry Notification:** If admin retries payout, a new notification is created on success/failure

---

### 6. Project Invitation

**Trigger Source:** `ProjectService.inviteCreator()` or `ProjectMatchCreatorsJob` (when brand invites creator)

**Conditions:**
- Brand invites creator to collaborate on project
- Creator has not already been invited to this project
- Creator has project invitation notifications enabled
- Project status is `ACTIVE` or `DRAFT`

**Invitation Types:**

| Type | Trigger | Auto-Accept |
|------|---------|-------------|
| Manual Invitation | Brand explicitly invites creator | No (requires acceptance) |
| Brief Match | System matches creator to project brief | No (opt-in) |

**Notification Content:**
```typescript
{
  "type": "PROJECT",
  "priority": "HIGH",
  "title": "Project Invitation",
  "message": "{BrandName} invited you to join \"{ProjectName}\".",
  "actionUrl": "/projects/{projectId}/invitation",
  "metadata": {
    "projectId": "clddd444",
    "projectName": "Summer Campaign 2026",
    "invitedBy": "cleee555",
    "inviterName": "ABC Corp",
    "inviterRole": "BRAND",
    "role": "CREATOR",
    "message": "Optional personal message from inviter"
  }
}
```

**Email Sent:** Yes (important business opportunity)

**Priority:** `HIGH`

**Expiration:** Invitations may expire after 30 days (configurable per project)

---

### 7. Asset Approval/Rejection

**Trigger Source:** `IpOwnershipService` (when ownership claim is reviewed)

**Conditions - Approval:**
- Ownership claim status changes to `APPROVED`
- Creator submitted ownership documentation
- Admin or automated system approved the claim

**Conditions - Rejection:**
- Ownership claim status changes to `REJECTED`
- Rejection reason is provided
- May include link to dispute resolution

**Notification Content (Approved):**
```typescript
{
  "type": "LICENSE",
  "priority": "HIGH",
  "title": "Asset Ownership Approved",
  "message": "Your ownership claim for \"{AssetTitle}\" has been approved.",
  "actionUrl": "/assets/{assetId}",
  "metadata": {
    "assetId": "clfff666",
    "assetTitle": "Goddess Logo",
    "action": "approved",
    "reviewedBy": "clggg777",
    "reviewerName": "Platform Admin",
    "ownershipPercentage": 50
  }
}
```

**Notification Content (Rejected):**
```typescript
{
  "type": "LICENSE",
  "priority": "HIGH",
  "title": "Asset Ownership Rejected",
  "message": "Your ownership claim for \"{AssetTitle}\" has been rejected. Reason: {Reason}",
  "actionUrl": "/assets/{assetId}/dispute",
  "metadata": {
    "assetId": "clfff666",
    "assetTitle": "Goddess Logo",
    "action": "rejected",
    "reviewedBy": "clggg777",
    "reviewerName": "Platform Admin",
    "reason": "Insufficient proof of ownership"
  }
}
```

**Email Sent:** Yes (critical account event)

**Priority:** `HIGH`

**Appeal Process:** Rejected claims can be disputed via `actionUrl`

---

## Business Rules by Trigger Type

### License Expiry Rules

**Multi-Stage Notification:**
- Each license gets up to 3 automated notifications
- Notifications are sent even if previous stages were missed (e.g., if license was created 40 days before expiry, only 30-day notice is sent)
- Timestamps prevent duplicate notifications

**Auto-Renewal:**
- If `auto_renew = true`, notifications still sent as reminders
- Notification message includes "Auto-renewal is enabled" badge

**Grace Period:**
- After expiry date, license may enter grace period (default 7 days)
- Grace period notification sent with `URGENT` priority
- After grace period expires, license status → `EXPIRED`

**Recipient Logic:**
```typescript
// Brand receives notification
const brandUser = license.brand.user;

// All IP creators receive notification
const creators = license.ipAsset.ownerships.map(o => o.creator.user);

// Total recipients = 1 brand + N creators
```

### Message Notification Rules

**Thread Muting:**
Users can mute specific threads. Check `message_thread_participants.muted = true`.

**Bundling Window:**
- Time window: 5 minutes
- Same thread required
- Updates existing notification (doesn't create new)
- Counter increments in metadata

**Email vs In-App:**
- In-app: Always created (unless thread muted)
- Email: Respects cooldown + user preferences

**Self-Message Prevention:**
```typescript
// Never create notification if sender = recipient
if (senderId === recipientId) {
  return; // Skip notification
}
```

### Royalty Statement Rules

**Zero-Earnings Suppression:**
```typescript
if (statement.totalEarnings <= 0) {
  return; // Don't notify for $0 statements
}
```

**Notification Idempotency:**
```typescript
// Check if already notified
if (statement.notifiedAt !== null) {
  return; // Already sent notification
}

// After sending, update:
UPDATE royalty_statements SET notified_at = NOW() WHERE id = ?;
```

**Multi-Creator Statements:**
If a project has multiple creators with revenue share:
- Each creator gets their own statement
- Each gets separate notification
- Amounts may differ based on ownership percentage

### Payout Rules

**Immediate Email Override:**
Payout notifications always send email, even if user has:
- Digest mode enabled
- Payout notifications disabled

Rationale: Financial notifications are critical and time-sensitive.

**Failure Retry Handling:**
```typescript
// First failure
priority = 'URGENT'
actionUrl = '/settings/payment-methods'

// After user updates payment info and admin retries:
// - New notification created on success/failure
// - Previous notification remains (for audit trail)
```

**Currency Formatting:**
Always format amounts with currency symbol:
```typescript
const formattedAmount = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: metadata.currency
}).format(metadata.amount / 100);
// Example: "$1,250.00"
```

### Project Invitation Rules

**Duplicate Prevention:**
```typescript
// Check if user already invited
const existingInvite = await prisma.projectInvitation.findFirst({
  where: {
    projectId,
    invitedUserId: creatorId,
    status: { in: ['PENDING', 'ACCEPTED'] }
  }
});

if (existingInvite) {
  return; // Don't send duplicate notification
}
```

**Invitation Expiry:**
- Invitation valid for 30 days (default)
- Expired invitations marked as `EXPIRED`
- User can request re-invitation

**Brief Match Special Case:**
When system automatically matches creators to briefs:
- Lower priority (`MEDIUM` instead of `HIGH`)
- Different message tone ("You may be a good fit for...")
- Opt-in required (not auto-accepted)

### Asset Approval Rules

**Ownership Percentage Display:**
If multiple creators own IP:
```typescript
message = `Your ${ownershipPercentage}% ownership claim for "${assetTitle}" has been approved.`;
```

**Dispute Workflow:**
Rejected claims include link to dispute:
```typescript
actionUrl = `/assets/${assetId}/dispute`;
```

User can:
1. Upload additional proof
2. Request human review
3. Accept rejection

---

## Email Delivery Logic

### When Email is Sent

Each notification type has different email delivery rules:

| Trigger | Email Delivery | Bypasses Preferences | Bundling |
|---------|----------------|---------------------|----------|
| License Expiry (90d) | Yes | No | No |
| License Expiry (60d) | Yes | No | No |
| License Expiry (30d) | Yes | No | No |
| Message Received | Conditional | No | Yes (5min window) |
| Royalty Statement | Yes | **Yes** | No |
| Payout Completed | Yes | **Yes** | No |
| Payout Failed | Yes | **Yes** | No |
| Project Invitation | Yes | No | No |
| Asset Approval | Yes | No | No |

### Email Preference Check Flow

```
┌─────────────────────┐
│ Notification Created│
└──────────┬──────────┘
           │
           ▼
     ┌──────────┐
     │Financial?│ (Payout/Royalty)
     └────┬─────┘
          │
    ┌─────┴─────┐
    │           │
   YES         NO
    │           │
    │           ▼
    │    ┌──────────────┐
    │    │Check User    │
    │    │Preferences   │
    │    └──────┬───────┘
    │           │
    │      ┌────┴────┐
    │      │ Enabled?│
    │      └────┬────┘
    │           │
    │      ┌────┴────┐
    │     YES       NO
    │      │         │
    ▼      ▼         ▼
  ┌──────────┐   ┌─────────┐
  │Send Email│   │Skip Email│
  └──────────┘   └─────────┘
```

### Email Templates Used

| Trigger | Template File |
|---------|--------------|
| License Expiry (90d) | `LicenseExpiry90DayNotice.tsx` |
| License Expiry (60d) | `LicenseExpiry60DayNotice.tsx` |
| License Expiry (30d) | `LicenseExpiry30DayNotice.tsx` |
| Message Received | `NewMessageNotification.tsx` |
| Royalty Statement | `RoyaltyStatementReady.tsx` |
| Payout Completed | `PayoutCompleted.tsx` |
| Payout Failed | `PayoutFailed.tsx` |
| Project Invitation | `ProjectInvitation.tsx` |
| Asset Approved | `AssetApprovalConfirmation.tsx` |
| Asset Rejected | `AssetRejectionNotice.tsx` |

---

## Notification Preferences

Users can control which notifications they receive via `/settings/notifications`.

### Preference Schema

```typescript
interface EmailPreferences {
  userId: string;
  
  // Global toggles
  enabled: boolean;                  // Master email switch
  
  // Category-specific toggles
  licenseExpiry: boolean;            // License expiry warnings
  payouts: boolean;                  // Payout notifications (always sent even if false)
  royaltyStatements: boolean;        // Royalty statements (always sent even if false)
  projectInvitations: boolean;       // Project invites
  messages: boolean;                 // Direct messages
  announcements: boolean;            // System announcements
  
  // Digest settings
  digestEnabled: boolean;            // Receive daily/weekly digest
  digestFrequency: 'daily' | 'weekly';
  digestTime: string;                // HH:MM format (e.g., "09:00")
  
  // Advanced category preferences
  categoryPreferences: {
    messages?: {
      emailNotifications: 'immediate' | 'digest' | 'off';
      inAppNotifications: boolean;
      digestFrequency?: 'daily' | 'weekly';
    };
  };
}
```

### Preference Logic

**Default Preferences (New Users):**
```typescript
{
  enabled: true,
  licenseExpiry: true,
  payouts: true,
  royaltyStatements: true,
  projectInvitations: true,
  messages: true,
  announcements: true,
  digestEnabled: false
}
```

**Preference Hierarchy:**
```
1. Global enabled = false → NO emails sent (except critical financial)
2. Category toggle = false → Category emails disabled
3. Digest mode → Non-urgent emails bundled
```

**Critical Notifications Override:**
Even if user disables preferences, these are always sent:
- Payout completed/failed
- Royalty statement available
- Security alerts (not covered in this doc)

---

## Edge Cases & Error Handling

### Duplicate Notification Prevention

**License Expiry:**
```typescript
// Check timestamp before sending
if (license.thirtyDayNoticeSentAt !== null) {
  return; // Already sent 30-day notice
}
```

**Royalty Statements:**
```typescript
// Check notification flag
if (statement.notifiedAt !== null) {
  return; // Already notified
}
```

**Project Invitations:**
```typescript
// Check for existing pending invitation
const existing = await prisma.projectInvitation.findFirst({
  where: { projectId, invitedUserId, status: 'PENDING' }
});
if (existing) return;
```

### Deleted Entity Handling

**What if entity is deleted before notification is sent?**

```typescript
// Always check deletedAt before creating notification
where: {
  id: entityId,
  deletedAt: null  // ← Essential check
}
```

**If notification exists but entity is later deleted:**
- Notification remains in DB (for audit trail)
- `actionUrl` will return 404 if user clicks
- Frontend should handle gracefully: "This item is no longer available"

### Missing User Data

**Brand user account deleted:**
```typescript
// License expiry still notifies creators
const creators = license.ipAsset.ownerships.map(o => o.creator.user);
// Send to creators only, skip brand notification
```

**Creator user account deleted:**
```typescript
// Skip notification for deleted users
const activeCreators = creators.filter(c => c.deleted_at === null);
```

### Email Delivery Failures

**Transient Failures (Network, Provider Down):**
- Email service retries 3 times with exponential backoff
- In-app notification still created successfully
- User can still see notification even if email fails

**Permanent Failures (Invalid Email, Bounced):**
- Email marked as undeliverable
- In-app notification still created
- System may flag email for admin review

### Timezone Handling

**All timestamps stored in UTC:**
```typescript
createdAt: "2025-12-01T09:00:00Z"  // ← Always UTC
```

**Frontend displays in user's timezone:**
```typescript
// Example: User in PST
new Date("2025-12-01T09:00:00Z").toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles'
});
// Output: "12/1/2025, 1:00:00 AM"
```

**License expiry job runs at 09:00 UTC daily:**
- Ensures consistent timing globally
- Frontend shows relative time ("in 30 days")

### Rate Limiting

**Global Notification Limits:**
- Max 1000 notifications per user per day (anti-spam)
- If limit reached, critical notifications (URGENT priority) still sent
- Non-critical notifications queued for next day

**Email Rate Limits:**
- Message notifications: 5-minute cooldown per thread
- Other notifications: No per-user limit (governed by trigger frequency)

### Concurrent Updates

**Scenario:** Two jobs try to send 30-day notice simultaneously

**Solution:** Database-level uniqueness check
```sql
-- Check and update atomically
UPDATE licenses
SET thirty_day_notice_sent_at = NOW()
WHERE id = ? AND thirty_day_notice_sent_at IS NULL
RETURNING id;

-- If 0 rows updated, another process already sent it
```

---

## Validation Rules

### Metadata Validation

Each notification type validates metadata before creation:

```typescript
// License Expiry
const metadata = {
  licenseId: string,        // Required, must be valid CUID
  licenseName: string,      // Required, max 200 chars
  expiryDate: string,       // Required, ISO 8601 date
  daysUntilExpiry: number,  // Required, must be 90, 60, or 30
  notificationType: 'expiry' // Required, literal
};

// Payout
const metadata = {
  payoutId: string,         // Required
  amount: number,           // Required, positive integer (cents)
  currency: string,         // Required, ISO 4217 code
  status: 'completed' | 'failed', // Required
  failureReason: string | undefined // Required if status = failed
};
```

### Action URL Validation

**Must be relative path or full platform URL:**
```typescript
// ✅ Valid
actionUrl: "/licenses/clxxx123"
actionUrl: "/messages/clyyy456"
actionUrl: "https://yesgoddess.agency/projects/clzzz789"

// ❌ Invalid
actionUrl: "javascript:alert(1)"
actionUrl: "https://evil-site.com/phishing"
```

**Validation regex:**
```typescript
const validActionUrl = /^(\/[a-zA-Z0-9\-\/]+|https:\/\/yesgoddess\.agency\/[a-zA-Z0-9\-\/]+)$/;
```

---

## Troubleshooting Common Issues

### Issue: User Not Receiving Notifications

**Checklist:**
1. ✅ User preferences enabled? Check `email_preferences.{category} = true`
2. ✅ Global email toggle on? Check `email_preferences.enabled = true`
3. ✅ Email address valid? Check `users.email` is not bounced
4. ✅ Thread muted? (for messages) Check `message_thread_participants.muted`
5. ✅ Notification created? Query `notifications` table
6. ✅ Email sent? Check email service logs

### Issue: Duplicate Notifications

**Causes:**
- Timestamp not updated after sending
- Multiple job instances running
- Manual retry without checking existing notification

**Fix:**
Ensure atomic check-and-update:
```typescript
const result = await prisma.license.updateMany({
  where: {
    id: licenseId,
    thirtyDayNoticeSentAt: null
  },
  data: {
    thirtyDayNoticeSentAt: new Date()
  }
});

if (result.count === 0) {
  // Another process already sent it, skip
  return;
}

// Safe to send notification
await createNotification(...);
```

### Issue: Wrong Priority

**Check trigger logic:**
```typescript
// License expiry
const priority = daysUntilExpiry <= 30 ? 'HIGH' : 'MEDIUM';

// Payout
const priority = status === 'failed' ? 'URGENT' : 'HIGH';
```

---

## Next Steps

Continue to **NOTIFICATION_TRIGGERS_PART_3_IMPLEMENTATION.md** for:
- Frontend React component examples
- State management with React Query
- Real-time updates with polling
- UI/UX patterns for each trigger type
- Toast/banner notification display
- Notification center implementation

---

**Document Version:** 1.0.0  
**Backend Compatibility:** yg-backend main branch
