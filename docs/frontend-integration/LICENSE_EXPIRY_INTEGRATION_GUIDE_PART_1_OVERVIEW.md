# License Expiry Management System - Frontend Integration Guide (Part 1: Overview & Monitoring)

**Classification:** ⚡ HYBRID  
*License expiry management is automated via backend jobs. Brands and creators receive notifications through email and in-app notifications. Admins have additional monitoring and override capabilities.*

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Monitoring APIs](#monitoring-apis)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Rules](#business-logic--rules)
6. [Notification Stages](#notification-stages)
7. [Grace Period Handling](#grace-period-handling)

---

## System Overview

The License Expiry Management System is a **fully automated background service** that monitors license expiration dates and manages the complete lifecycle from advance notice through final expiry.

### Key Features

- **Multi-Stage Notifications**: 90-day, 60-day, and 30-day advance notices
- **Automated Grace Periods**: Configurable grace periods (default 7 days)
- **Email + In-App Notifications**: Dual notification channels
- **Stakeholder Communication**: Notifies both brands and creators
- **Post-Expiry Actions**: Automatic project status updates and re-engagement scheduling
- **Comprehensive Audit Trail**: All actions logged to events table

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    LICENSE LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ACTIVE LICENSE                                                  │
│       ↓                                                           │
│  90 Days Before Expiry → 90-Day Notice (Email)                  │
│       ↓                                                           │
│  60 Days Before Expiry → 60-Day Reminder (Email)                │
│       ↓                                                           │
│  30 Days Before Expiry → 30-Day Final Notice (Email + In-App)   │
│       ↓                                                           │
│  End Date Reached → Grace Period Applied (if configured)        │
│       ↓                                                           │
│  Grace Period End → License EXPIRED                              │
│       ↓                                                           │
│  Post-Expiry Actions:                                            │
│    • Expiry confirmation emails                                  │
│    • Project status update (if all licenses expired)             │
│    • Re-engagement email scheduled (30 days post-expiry)        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Frontend Responsibilities

The frontend **does not trigger** expiry processing. Instead, it should:

1. **Display expiry status** from license data
2. **Show notification counts** for expiring licenses
3. **Provide renewal workflows** for brands
4. **Display grace period information** when active
5. **Alert users** to in-app expiry notifications

---

## Architecture

### Backend Components

```
src/
├── jobs/
│   ├── license-expiry-monitor.job.ts    # Daily comprehensive monitoring (09:00 UTC)
│   └── license-auto-expiry.job.ts       # Hourly grace period finalization
│
├── modules/licenses/services/
│   └── license-expiry-monitor.service.ts # Core expiry logic & notifications
│
└── emails/templates/
    ├── LicenseExpiry90DayNotice.tsx     # Informational notice
    ├── LicenseExpiry60DayNotice.tsx     # Reminder notice
    └── LicenseExpiry30DayNotice.tsx     # Urgent/expiry confirmation
```

### Job Schedules

| Job | Schedule | Purpose | Duration |
|-----|----------|---------|----------|
| `license-expiry-monitor` | Daily at 09:00 UTC | Find and notify expiring licenses (90/60/30 days), apply grace periods | 2-5 minutes |
| `license-auto-expiry` | Every hour | Finalize licenses with expired grace periods | 30-60 seconds |

### Database Schema Additions

**New fields on `licenses` table:**

```typescript
interface License {
  // ... existing fields
  
  // Expiry tracking timestamps
  ninetyDayNoticeSentAt: Date | null;  // When 90-day notice was sent
  sixtyDayNoticeSentAt: Date | null;   // When 60-day notice was sent
  thirtyDayNoticeSentAt: Date | null;  // When 30-day notice was sent
  
  // Grace period management
  gracePeriodDays: number;              // Grace period length (0 = none)
  gracePeriodEndDate: Date | null;      // When grace period ends
  
  // Final expiry
  expiredAt: Date | null;               // Timestamp when marked EXPIRED
}
```

---

## Monitoring APIs

While expiry processing is automated, the frontend can monitor license expiry status using existing license APIs.

### 1. List Expiring Licenses

**Endpoint:** `licenses.list`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** Get licenses expiring within a specific timeframe.

**Request:**
```typescript
{
  status?: 'ACTIVE' | 'EXPIRING_SOON';
  expiringBefore?: string;  // ISO 8601 date
  brandId?: string;         // Filter by brand
  page?: number;
  pageSize?: number;
}
```

**Response:**
```typescript
{
  data: Array<{
    id: string;
    ipAssetId: string;
    brandId: string;
    status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
    startDate: string;                    // ISO 8601
    endDate: string;                      // ISO 8601
    gracePeriodDays: number;
    gracePeriodEndDate: string | null;    // ISO 8601 or null
    ninetyDayNoticeSentAt: string | null;
    sixtyDayNoticeSentAt: string | null;
    thirtyDayNoticeSentAt: string | null;
    expiredAt: string | null;
    autoRenew: boolean;
    // ... other license fields
  }>;
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}
```

**Example:**
```typescript
// Get all licenses expiring in next 30 days
const { data: expiringLicenses } = trpc.licenses.list.useQuery({
  status: 'ACTIVE',
  expiringBefore: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  page: 1,
  pageSize: 50
});
```

---

### 2. Get License Details

**Endpoint:** `licenses.getById`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** Get full expiry status for a single license.

**Request:**
```typescript
{
  id: string;  // License CUID
}
```

**Response:**
```typescript
{
  data: {
    id: string;
    status: string;
    endDate: string;
    gracePeriodDays: number;
    gracePeriodEndDate: string | null;
    ninetyDayNoticeSentAt: string | null;
    sixtyDayNoticeSentAt: string | null;
    thirtyDayNoticeSentAt: string | null;
    expiredAt: string | null;
    autoRenew: boolean;
    // ... full license object
  };
}
```

**Example:**
```typescript
const { data: license } = trpc.licenses.getById.useQuery({ id: licenseId });

// Calculate days until expiry
const daysUntilExpiry = differenceInDays(
  new Date(license.endDate),
  new Date()
);

// Check if in grace period
const inGracePeriod = license.gracePeriodEndDate && 
  new Date(license.gracePeriodEndDate) > new Date();
```

---

### 3. Get License Statistics

**Endpoint:** `licenses.stats`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** Get aggregated expiry statistics for dashboard displays.

**Request:**
```typescript
{
  brandId?: string;  // Optional - filter by specific brand
}
```

**Response:**
```typescript
{
  data: {
    totalActive: number;
    totalRevenueCents: number;
    expiringIn30Days: number;      // Count of licenses expiring soon
    expiringIn60Days: number;
    expiringIn90Days: number;
    averageLicenseDurationDays: number;
    exclusiveLicenses: number;
    nonExclusiveLicenses: number;
    renewalRate: number;           // Percentage (0-100)
  };
}
```

**Example:**
```typescript
const { data: stats } = trpc.licenses.stats.useQuery({
  brandId: currentBrand.id
});

// Display expiry warnings
if (stats.expiringIn30Days > 0) {
  showWarning(`${stats.expiringIn30Days} licenses expiring within 30 days`);
}
```

---

### 4. Check In-App Notifications

**Endpoint:** `notifications.poll`  
**Type:** Query  
**Auth:** Required (JWT)

**Purpose:** Poll for new in-app notifications including expiry alerts.

**Request:**
```typescript
{
  lastSeen?: string;  // ISO 8601 timestamp of last poll
}
```

**Response:**
```typescript
{
  data: {
    notifications: Array<{
      id: string;
      type: 'LICENSE';
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      message: string;
      actionUrl: string;
      metadata: {
        licenseId: string;
        daysUntilExpiry?: number;
        notificationType: 'expiry' | 'expired';
      };
      read: boolean;
      createdAt: string;
    }>;
    unreadCount: number;
    hasNewNotifications: boolean;
  };
}
```

**Example:**
```typescript
const { data: notifications } = trpc.notifications.poll.useQuery({
  lastSeen: lastPollTime
});

// Filter license expiry notifications
const expiryNotifications = notifications.data.notifications.filter(
  n => n.type === 'LICENSE' && n.metadata.notificationType === 'expiry'
);
```

---

## TypeScript Type Definitions

Copy these interfaces to your frontend codebase:

```typescript
/**
 * License expiry notification stages
 */
export type ExpiryNotificationStage = 'ninety_day' | 'sixty_day' | 'thirty_day';

/**
 * Urgency level for expiry notifications
 */
export type ExpiryUrgencyLevel = 'informational' | 'reminder' | 'urgent';

/**
 * License expiry status helper
 */
export interface LicenseExpiryStatus {
  isExpiringSoon: boolean;        // True if within 90 days
  isUrgent: boolean;              // True if within 30 days
  inGracePeriod: boolean;
  isExpired: boolean;
  daysUntilExpiry: number;        // Negative if past end date
  daysRemainingInGracePeriod: number | null;
  effectiveExpiryDate: Date;      // Grace period end if active, else end date
  lastNotificationStage: ExpiryNotificationStage | null;
}

/**
 * Expiry notification metadata (from in-app notifications)
 */
export interface ExpiryNotificationMetadata {
  licenseId: string;
  daysUntilExpiry?: number;
  notificationType: 'expiry' | 'expired' | 'grace_period';
  urgencyLevel?: ExpiryUrgencyLevel;
}

/**
 * License fields related to expiry
 */
export interface LicenseExpiryFields {
  endDate: string;                      // ISO 8601
  gracePeriodDays: number;
  gracePeriodEndDate: string | null;    // ISO 8601
  ninetyDayNoticeSentAt: string | null; // ISO 8601
  sixtyDayNoticeSentAt: string | null;  // ISO 8601
  thirtyDayNoticeSentAt: string | null; // ISO 8601
  expiredAt: string | null;             // ISO 8601
  autoRenew: boolean;
}
```

---

## Business Logic & Rules

### Expiry Detection Windows

The backend uses **±1 day buffer windows** for notification detection to account for job scheduling variations:

```typescript
// 90-day notice window: 89-91 days before expiry
// 60-day notice window: 59-61 days before expiry
// 30-day notice window: 29-31 days before expiry
```

**Frontend should not replicate this logic** - use the presence of `ninetyDayNoticeSentAt` etc. fields to determine which notices have been sent.

---

### Status Transitions

```
ACTIVE
  ↓
EXPIRING_SOON (when 30-day notice sent, or grace period applied)
  ↓
EXPIRED (when grace period ends or immediately if no grace period)
```

---

### Grace Period Rules

1. **Default**: 7 days (configurable per license via `gracePeriodDays`)
2. **Can be disabled**: Set `gracePeriodDays` to `0`
3. **During grace period**:
   - License remains functionally active
   - Status changes to `EXPIRING_SOON`
   - Brand can still use the asset
   - Auto-renewal can still process
4. **After grace period**:
   - Status changes to `EXPIRED`
   - `expiredAt` timestamp set
   - Post-expiry actions executed

---

### Auto-Renewal Behavior

If `autoRenew` is `true`:
- System still sends all expiry notices
- Notices inform user that auto-renewal is enabled
- No urgent action required from brand
- Frontend should display "Auto-renewal active" badge

---

### Notification Duplicate Prevention

The backend uses timestamp fields to prevent duplicate notifications:

- `ninetyDayNoticeSentAt` - Set after 90-day notice sent
- `sixtyDayNoticeSentAt` - Set after 60-day notice sent  
- `thirtyDayNoticeSentAt` - Set after 30-day notice sent

**Frontend logic**: If a timestamp exists, that notification stage has been sent.

---

## Notification Stages

### Stage 1: 90-Day Advance Notice

**Timing:** 90 days before `endDate` (±1 day window)  
**Tone:** Informational  
**Urgency:** Low

**Recipients:**
- Brand primary contact (userId from brand record)
- All IP asset creators

**Content Highlights:**
- Informational notice of upcoming expiry
- 90 days to review licensing arrangement
- Auto-renewal status displayed (if enabled)
- Link to renewal workflow

**Backend Actions:**
- Email sent via transactional email service
- `ninetyDayNoticeSentAt` timestamp updated
- Event logged: `license.expiry_notification_sent`

**Frontend Display:**
```typescript
if (license.ninetyDayNoticeSentAt && !license.sixtyDayNoticeSentAt) {
  // Show "90-day notice sent" indicator
  return <Badge variant="info">Renewal Notice Sent</Badge>;
}
```

---

### Stage 2: 60-Day Reminder

**Timing:** 60 days before `endDate` (±1 day window)  
**Tone:** Reminder  
**Urgency:** Medium

**Recipients:**
- Brand primary contact
- All IP asset creators

**Content Highlights:**
- Reminder that license expires in 60 days
- Encouragement to review renewal options
- Auto-renewal status reminder
- Link to renewal workflow

**Backend Actions:**
- Email sent via transactional email service
- `sixtyDayNoticeSentAt` timestamp updated
- Event logged: `license.expiry_notification_sent`

**Frontend Display:**
```typescript
const daysUntilExpiry = differenceInDays(new Date(license.endDate), new Date());

if (daysUntilExpiry <= 60 && daysUntilExpiry > 30) {
  return <Alert severity="warning">License expires in {daysUntilExpiry} days</Alert>;
}
```

---

### Stage 3: 30-Day Final Notice

**Timing:** 30 days before `endDate` (±1 day window)  
**Tone:** Urgent  
**Urgency:** High

**Recipients:**
- Brand primary contact (email + in-app notification)
- All IP asset creators (email + in-app notification)

**Content Highlights:**
- Urgent notice that license expires in 30 days
- Final opportunity to renew
- Clear CTA to renewal workflow
- Grace period information (if applicable)

**Backend Actions:**
- Email sent via transactional email service
- **In-app notification created** (priority: HIGH)
- `thirtyDayNoticeSentAt` timestamp updated
- Event logged: `license.expiry_notification_sent`

**Frontend Display:**
```typescript
if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
  return (
    <Alert severity="error" action={
      <Button href={`/licenses/${license.id}/renew`}>
        Renew Now
      </Button>
    }>
      Action Required: License expires in {daysUntilExpiry} days
    </Alert>
  );
}
```

---

### Stage 4: Expiry Processing (End Date Reached)

**Timing:** When `endDate` is reached  
**Tone:** Varies based on grace period  
**Urgency:** Critical

**Two Scenarios:**

#### Scenario A: Grace Period Configured (`gracePeriodDays` > 0)

**Backend Actions:**
1. Calculate `gracePeriodEndDate` = `endDate` + `gracePeriodDays`
2. Update license status to `EXPIRING_SOON`
3. Send grace period notification email
4. Event logged: `license.grace_period_started`

**Frontend Display:**
```typescript
if (license.gracePeriodEndDate && new Date(license.gracePeriodEndDate) > new Date()) {
  const daysInGracePeriod = differenceInDays(
    new Date(license.gracePeriodEndDate),
    new Date()
  );
  
  return (
    <Alert severity="error">
      Grace Period Active: {daysInGracePeriod} days remaining to renew
    </Alert>
  );
}
```

#### Scenario B: No Grace Period (`gracePeriodDays` = 0)

**Backend Actions:**
1. Update license status to `EXPIRED`
2. Set `expiredAt` timestamp
3. Send expiry confirmation emails
4. Execute post-expiry actions
5. Event logged: `license.expired`

**Frontend Display:**
```typescript
if (license.status === 'EXPIRED') {
  return (
    <Alert severity="error">
      License Expired on {formatDate(license.expiredAt)}
    </Alert>
  );
}
```

---

### Stage 5: Grace Period Completion

**Timing:** When `gracePeriodEndDate` is reached  
**Tone:** Final  
**Urgency:** Critical

**Backend Actions:**
1. Update license status to `EXPIRED`
2. Set `expiredAt` timestamp
3. Send final expiry confirmation emails
4. Create in-app notifications
5. Execute post-expiry actions
6. Event logged: `license.expired`

**Frontend Display:**
```typescript
if (license.status === 'EXPIRED' && license.gracePeriodEndDate) {
  return (
    <Alert severity="error">
      License expired after grace period on {formatDate(license.expiredAt)}
      <Button onClick={() => navigate(`/licenses/${license.id}/relicense`)}>
        Request New License
      </Button>
    </Alert>
  );
}
```

---

## Grace Period Handling

### Configuration

Grace periods are **configurable per license**:

```typescript
interface License {
  gracePeriodDays: number;  // 0 = disabled, 7 = default, can be custom
}
```

### Frontend Display Logic

```typescript
function getEffectiveExpiryDate(license: LicenseExpiryFields): Date {
  if (license.gracePeriodEndDate) {
    return new Date(license.gracePeriodEndDate);
  }
  return new Date(license.endDate);
}

function isInGracePeriod(license: LicenseExpiryFields): boolean {
  if (!license.gracePeriodEndDate) return false;
  
  const now = new Date();
  const endDate = new Date(license.endDate);
  const gracePeriodEnd = new Date(license.gracePeriodEndDate);
  
  return now > endDate && now < gracePeriodEnd;
}

function getGracePeriodDaysRemaining(license: LicenseExpiryFields): number | null {
  if (!isInGracePeriod(license)) return null;
  
  return differenceInDays(
    new Date(license.gracePeriodEndDate!),
    new Date()
  );
}
```

### Grace Period UI Examples

```tsx
// Grace period badge
{isInGracePeriod(license) && (
  <Badge color="warning">
    Grace Period: {getGracePeriodDaysRemaining(license)} days left
  </Badge>
)}

// Grace period alert
{isInGracePeriod(license) && (
  <Alert severity="warning">
    <AlertTitle>Grace Period Active</AlertTitle>
    Your license expired on {formatDate(license.endDate)}, but you have{' '}
    {getGracePeriodDaysRemaining(license)} days remaining to renew before 
    final expiration on {formatDate(license.gracePeriodEndDate)}.
    <Button href={`/licenses/${license.id}/renew`}>Renew Now</Button>
  </Alert>
)}
```

---

## Next Steps

Continue to:
- **[Part 2: Email Integration & Notifications](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_2_NOTIFICATIONS.md)** - Email templates, notification preferences, and communication flows
- **[Part 3: Admin Operations & Troubleshooting](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_3_ADMIN.md)** - Admin controls, manual triggers, testing, and troubleshooting

---

## Quick Reference

### Key Timestamps to Monitor

| Field | Purpose | Display Logic |
|-------|---------|---------------|
| `endDate` | Original license expiration | Always display |
| `ninetyDayNoticeSentAt` | 90-day notice sent | Show "First notice sent" badge |
| `sixtyDayNoticeSentAt` | 60-day notice sent | Show "Reminder sent" badge |
| `thirtyDayNoticeSentAt` | 30-day notice sent | Show "Final notice sent" badge |
| `gracePeriodEndDate` | Grace period ends | Display as effective expiry date |
| `expiredAt` | License marked expired | Show "Expired" status |

### Status Meanings

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| `ACTIVE` | License is valid and active | None (unless expiring soon) |
| `EXPIRING_SOON` | 30-day notice sent OR in grace period | Encourage renewal |
| `EXPIRED` | License has expired | Cannot be renewed - must relicense |

### Frontend Implementation Checklist

- [ ] Display days until expiry on license cards
- [ ] Show expiry warnings at 90, 60, 30 days
- [ ] Highlight licenses in grace period
- [ ] Badge auto-renewal status
- [ ] Link to renewal workflow from expiry warnings
- [ ] Poll for in-app expiry notifications
- [ ] Show grace period countdown
- [ ] Display "Expired" state clearly
- [ ] Provide relicensing workflow for expired licenses
- [ ] Dashboard widget for expiring licenses count
