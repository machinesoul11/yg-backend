# License Expiry Management System - Frontend Integration Guide (Part 2: Notifications & Communications)

**Classification:** ⚡ HYBRID  
*Expiry notifications are sent to both brands (website users) and creators. Email delivery is automated; frontend manages user preferences and in-app notification display.*

---

## Table of Contents

1. [Email Notification System](#email-notification-system)
2. [Email Templates](#email-templates)
3. [In-App Notifications](#in-app-notifications)
4. [Notification Preferences](#notification-preferences)
5. [Error Handling](#error-handling)
6. [Real-time Updates](#real-time-updates)

---

## Email Notification System

### Overview

All expiry notifications are sent via the **transactional email service** using React Email templates. The backend handles sending; the frontend should:

1. Display email delivery status (if needed)
2. Manage user email preferences
3. Show notification history

### Email Service Integration

**Backend Service:** `EmailService` (`src/lib/services/email/email.service.ts`)

**Delivery Method:**
```typescript
await emailService.sendTransactional({
  userId: string;
  email: string;
  subject: string;
  template: 'license-expiry-90-day' | 'license-expiry-60-day' | 'license-expiry-30-day';
  variables: {
    userName: string;
    licenseName: string;
    brandName: string;
    expiryDate: string;
    daysRemaining: string;
    renewalUrl: string;
    licenseUrl: string;
    autoRenewEnabled?: boolean;
    recipientRole?: 'brand' | 'creator';
    gracePeriodActive?: boolean;
    expired?: boolean;
  };
});
```

### Email Templates Used

| Template | When Sent | Recipients |
|----------|-----------|------------|
| `license-expiry-90-day` | 90 days before expiry | Brand + Creators |
| `license-expiry-60-day` | 60 days before expiry | Brand + Creators |
| `license-expiry-30-day` | 30 days before expiry, grace period, and expiry confirmation | Brand + Creators |

**Note:** The `license-expiry-30-day` template is reused for:
- 30-day advance notice
- Grace period notification (with `gracePeriodActive: true`)
- Expiry confirmation (with `expired: true`)

---

## Email Templates

All email templates follow **YES GODDESS brand guidelines**:

- **Aesthetic**: Monastic, minimalist
- **Colors**: VOID (#0A0A0A), BONE (#F8F6F3), SANCTUM (#C4C0B8), ALTAR (#B8A888)
- **Typography**: Extended letter tracking
- **Tone**: Authoritative yet invitational, never aggressive or urgent

### Template Structure

Each template includes:

1. **Preview Text** - Summarizes the email content
2. **Heading** - Clear statement of purpose
3. **Personalized Greeting** - `Dear {userName}`
4. **License Details**:
   - License name
   - Brand name (for creators) / Asset name (for brands)
   - Expiry date
   - Days remaining
5. **Status Indicators**:
   - Auto-renewal badge (if enabled)
   - Grace period status (if active)
   - Urgency level visualization
6. **Call-to-Action Buttons**:
   - "Review License" - Links to `{licenseUrl}`
   - "Renew License" - Links to `{renewalUrl}` (brands only)
7. **Footer** - Standard YES GODDESS footer with support links

---

### 90-Day Notice Template

**File:** `emails/templates/LicenseExpiry90DayNotice.tsx`  
**Subject:** `License Expiry Notice: {assetTitle}`  
**Tone:** Informational  
**Preview:** `License expiry notice: {licenseName} — {daysRemaining} days remaining`

**Key Content:**

**For Brands:**
```
This notice confirms that the license for {licenseName} will expire on {expiryDate}.

You have 90 days to review your licensing arrangement and determine whether 
renewal is appropriate for your ongoing needs.
```

**For Creators:**
```
The license for {licenseName} with {brandName} will expire on {expiryDate}.

This is an informational notice. No action is required from you at this time.
```

**Auto-Renewal Display:**
```
[Info Box]
Auto-Renewal Enabled: This license is configured for automatic renewal. 
No action is required unless you wish to modify terms or disable auto-renewal.
```

**CTA Buttons:**
- Primary: "Review License Details" → `{licenseUrl}`
- Secondary (brands only): "Start Renewal Process" → `{renewalUrl}`

---

### 60-Day Reminder Template

**File:** `emails/templates/LicenseExpiry60DayNotice.tsx`  
**Subject:** `License Expires in 60 Days: {assetTitle}`  
**Tone:** Reminder  
**Preview:** `License expires in {daysRemaining} days: {licenseName}`

**Key Content:**

**For Brands:**
```
Your license for {licenseName} will expire in 60 days on {expiryDate}.

[Alert Box showing days remaining]

If you wish to maintain access beyond the expiry date, now is the time to 
initiate the renewal process.
```

**For Creators:**
```
The license for {licenseName} with {brandName} will expire in 60 days.

You will receive notification if {brandName} initiates renewal.
```

**Auto-Renewal Display:**
```
[Note Box]
Auto-Renewal Active: This license will automatically renew unless you choose 
to modify terms or cancel. Review your renewal settings to confirm your preferences.
```

**CTA Buttons:**
- Primary (brands): "Renew License Now" → `{renewalUrl}`
- Secondary: "View License Details" → `{licenseUrl}`

---

### 30-Day Final Notice / Expiry Confirmation Template

**File:** `emails/templates/LicenseExpiry30DayNotice.tsx`  
**Subject:** Varies based on state:
- 30-day notice: `Action Required: License Expires in 30 Days`
- Grace period: `Grace Period Active: {assetTitle}`
- Expired: `License Expired: {assetTitle}`

**Tone:** Urgent / Final  
**Preview:** Varies based on state

#### State 1: 30-Day Advance Notice

**For Brands:**
```
[Urgent Box showing days remaining in large text]

The license for {licenseName} will expire on {expiryDate}.

⚠️ This is your final advance notice. After the expiry date, access to the 
asset will cease unless renewal is completed.
```

**CTA:**
- Primary: "Renew License Now" → `{renewalUrl}` (prominent, urgent styling)

---

#### State 2: Grace Period Active

**For Brands:**
```
[Urgent Box showing grace period days remaining]

The original license for {licenseName} has reached its end date. A grace period 
is currently active, providing continued access until {gracePeriodEndDate}.

To maintain uninterrupted access beyond the grace period, renewal action is 
required immediately.
```

**CTA:**
- Primary: "Renew License Now" → `{renewalUrl}` (urgent, critical styling)

---

#### State 3: Expired (Post-Expiry Confirmation)

**For Brands:**
```
The license for {licenseName} has expired.

Access to this asset is no longer authorized. If you wish to relicense this 
asset, please contact the creator or initiate a new license request through 
the platform.
```

**For Creators:**
```
This license has concluded. No further royalty payments will be processed for 
this arrangement. If {brandName} wishes to relicense, you will be notified 
accordingly.
```

**CTA:**
- Primary (brands): "Request New License" → New licensing workflow
- Secondary: "View Expired License" → `{licenseUrl}`

---

### Template Variables Reference

Complete list of variables passed to email templates:

```typescript
interface ExpiryEmailVariables {
  // Required for all templates
  userName: string;              // Recipient's display name
  licenseName: string;           // IP asset title
  brandName: string;             // Brand company name
  expiryDate: string;            // Formatted date (e.g., "December 15, 2025")
  daysRemaining: string;         // String number (e.g., "90", "60", "30")
  licenseUrl: string;            // Deep link to license details
  
  // Optional / conditional
  renewalUrl?: string;           // Deep link to renewal workflow (brands only)
  autoRenewEnabled?: boolean;    // Whether auto-renewal is active
  recipientRole?: 'brand' | 'creator';  // Determines content variations
  gracePeriodActive?: boolean;   // True during grace period
  expired?: boolean;             // True for expiry confirmation
}
```

---

## In-App Notifications

### Notification Creation

**When Created:**
- 30-day advance notice
- Final expiry confirmation

**Backend Service:**
```typescript
await prisma.notification.create({
  data: {
    userId: string;
    type: 'LICENSE';
    priority: 'HIGH' | 'MEDIUM';
    title: string;
    message: string;
    actionUrl: string;
    metadata: {
      licenseId: string;
      daysUntilExpiry?: number;
      notificationType: 'expiry' | 'expired';
    };
  },
});
```

### Notification Types

#### Type 1: 30-Day Expiry Warning

```typescript
{
  type: 'LICENSE',
  priority: 'HIGH',
  title: 'License Expiring in 30 Days',
  message: 'Your license for "{ipAssetTitle}" expires on {expiryDate}. Review renewal options.',
  actionUrl: '/licenses/{licenseId}',
  metadata: {
    licenseId: string,
    daysUntilExpiry: number,
    notificationType: 'expiry'
  }
}
```

#### Type 2: License Expired

```typescript
{
  type: 'LICENSE',
  priority: 'HIGH',
  title: 'License Expired',
  message: 'Your license for "{ipAssetTitle}" has expired.',
  actionUrl: '/licenses/{licenseId}',
  metadata: {
    licenseId: string,
    notificationType: 'expired'
  }
}
```

---

### Polling for Notifications

**Endpoint:** `notifications.poll`  
**Frequency:** Every 30-60 seconds (recommended)  
**Rate Limit:** 120 requests per minute per user

**Request:**
```typescript
const { data } = trpc.notifications.poll.useQuery({
  lastSeen: lastPollTimestamp?.toISOString()
});
```

**Response:**
```typescript
{
  data: {
    notifications: Array<{
      id: string;
      type: 'LICENSE' | 'MESSAGE' | 'PAYMENT' | 'DISPUTE';
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      message: string;
      actionUrl: string;
      metadata: object;
      read: boolean;
      createdAt: string;
    }>;
    unreadCount: number;
    hasNewNotifications: boolean;
  };
}
```

---

### Frontend Notification Display

#### Notification Bell Badge

```tsx
import { trpc } from '@/lib/trpc';

function NotificationBell() {
  const { data } = trpc.notifications.poll.useQuery(
    { lastSeen: lastPollTime },
    { refetchInterval: 30000 } // Poll every 30 seconds
  );

  return (
    <Badge badgeContent={data?.unreadCount || 0} color="error">
      <NotificationsIcon />
    </Badge>
  );
}
```

#### Notification List

```tsx
function NotificationList() {
  const { data } = trpc.notifications.poll.useQuery();

  const expiryNotifications = data?.data.notifications.filter(
    n => n.type === 'LICENSE' && 
         (n.metadata.notificationType === 'expiry' || 
          n.metadata.notificationType === 'expired')
  );

  return (
    <List>
      {expiryNotifications?.map(notification => (
        <ListItem
          key={notification.id}
          button
          onClick={() => navigate(notification.actionUrl)}
          sx={{
            bgcolor: !notification.read ? 'action.hover' : 'transparent',
            borderLeft: notification.priority === 'HIGH' ? '4px solid #d32f2f' : 'none'
          }}
        >
          <ListItemIcon>
            <WarningIcon color={notification.priority === 'HIGH' ? 'error' : 'warning'} />
          </ListItemIcon>
          <ListItemText
            primary={notification.title}
            secondary={notification.message}
            primaryTypographyProps={{ fontWeight: !notification.read ? 'bold' : 'normal' }}
          />
          <ListItemSecondaryAction>
            <Typography variant="caption" color="text.secondary">
              {formatDistanceToNow(new Date(notification.createdAt))}
            </Typography>
          </ListItemSecondaryAction>
        </ListItem>
      ))}
    </List>
  );
}
```

#### Urgent Expiry Alert Banner

```tsx
function ExpiryAlertBanner() {
  const { data: stats } = trpc.licenses.stats.useQuery();
  const { data: notifications } = trpc.notifications.poll.useQuery();

  const urgentExpiryCount = notifications?.data.notifications.filter(
    n => n.type === 'LICENSE' && 
         n.priority === 'HIGH' && 
         n.metadata.notificationType === 'expiry'
  ).length || 0;

  if (urgentExpiryCount === 0) return null;

  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" href="/licenses?expiring=true">
          Review Now
        </Button>
      }
    >
      <AlertTitle>Action Required</AlertTitle>
      You have {urgentExpiryCount} license{urgentExpiryCount > 1 ? 's' : ''} expiring within 30 days.
    </Alert>
  );
}
```

---

## Notification Preferences

Users can control whether they receive expiry notifications.

### Get Preferences

**Endpoint:** `notifications.getPreferences`  
**Type:** Query  
**Auth:** Required

**Request:**
```typescript
// No parameters - returns current user's preferences
```

**Response:**
```typescript
{
  data: {
    userId: string;
    emailNotifications: boolean;
    pushNotifications: boolean;
    smsNotifications: boolean;
    notificationTypes: {
      messages: boolean;
      payments: boolean;
      licenseExpiry: boolean;    // ← Controls expiry notifications
      ownershipDisputes: boolean;
      systemUpdates: boolean;
    };
    emailFrequency: 'REALTIME' | 'DAILY_DIGEST' | 'WEEKLY_DIGEST';
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;  // "22:00"
    quietHoursEnd: string | null;    // "08:00"
    createdAt: string;
    updatedAt: string;
  };
}
```

**Example:**
```typescript
const { data: preferences } = trpc.notifications.getPreferences.useQuery();

const expiryNotificationsEnabled = 
  preferences.emailNotifications && 
  preferences.notificationTypes.licenseExpiry;
```

---

### Update Preferences

**Endpoint:** `notifications.updatePreferences`  
**Type:** Mutation  
**Auth:** Required

**Request:**
```typescript
{
  emailNotifications?: boolean;
  notificationTypes?: {
    licenseExpiry?: boolean;
    // ... other types
  };
  emailFrequency?: 'REALTIME' | 'DAILY_DIGEST' | 'WEEKLY_DIGEST';
}
```

**Response:**
```typescript
{
  data: {
    // Updated preferences object (same structure as getPreferences)
  };
}
```

**Example:**
```tsx
function NotificationPreferencesForm() {
  const { data: preferences } = trpc.notifications.getPreferences.useQuery();
  const updatePreferences = trpc.notifications.updatePreferences.useMutation();

  const handleToggleExpiryNotifications = async (enabled: boolean) => {
    await updatePreferences.mutateAsync({
      notificationTypes: {
        licenseExpiry: enabled
      }
    });
  };

  return (
    <FormControlLabel
      control={
        <Switch
          checked={preferences?.notificationTypes.licenseExpiry || false}
          onChange={(e) => handleToggleExpiryNotifications(e.target.checked)}
        />
      }
      label="License Expiry Notifications"
    />
  );
}
```

---

### Email Frequency Options

Users can control how they receive expiry emails:

| Option | Behavior | Expiry Notifications |
|--------|----------|----------------------|
| `REALTIME` | Emails sent immediately | Sent at each stage (90/60/30 days) |
| `DAILY_DIGEST` | Bundled daily summary | Included in daily digest |
| `WEEKLY_DIGEST` | Bundled weekly summary | Included in weekly digest |

**Important:** Critical expiry notifications (30-day, grace period, expired) **always send in real-time** regardless of digest settings.

---

## Error Handling

### Email Delivery Failures

The backend handles email delivery failures gracefully:

1. **Individual failures don't block batch processing**
2. **Errors logged** with license ID and details
3. **Failed notifications can be retried** manually by admins
4. **Notification timestamps only updated after successful delivery**

### Frontend Error States

**Email Not Received:**

```tsx
function EmailDeliveryStatus({ license }: { license: License }) {
  const daysSinceNotice = license.thirtyDayNoticeSentAt
    ? differenceInDays(new Date(), new Date(license.thirtyDayNoticeSentAt))
    : null;

  if (daysSinceNotice && daysSinceNotice > 2) {
    return (
      <Alert severity="warning">
        Email notification was sent {daysSinceNotice} days ago. 
        If you haven't received it, please check your spam folder or{' '}
        <Link href="/support">contact support</Link>.
      </Alert>
    );
  }

  return null;
}
```

**Notification Preferences Disabled:**

```tsx
if (!preferences?.notificationTypes.licenseExpiry) {
  return (
    <Alert severity="info" action={
      <Button href="/settings/notifications">Enable</Button>
    }>
      License expiry notifications are currently disabled in your settings.
    </Alert>
  );
}
```

---

### Possible Error Codes

| Error Code | Cause | User Message |
|------------|-------|--------------|
| `EMAIL_DELIVERY_FAILED` | Email service error | "We couldn't send the notification email. Our team has been notified." |
| `INVALID_EMAIL` | User email is invalid | "Your email address appears to be invalid. Please update it in your profile." |
| `NOTIFICATION_PREFERENCES_DISABLED` | User opted out | "You have license notifications disabled. Enable them in settings." |
| `RATE_LIMIT_EXCEEDED` | Too many poll requests | "You're checking too frequently. Please wait a moment." |

---

## Real-time Updates

### Polling Strategy

**Recommended Implementation:**

```typescript
const POLL_INTERVAL = 30000; // 30 seconds
const POLL_INTERVAL_ACTIVE = 10000; // 10 seconds when tab is active
const POLL_INTERVAL_BACKGROUND = 60000; // 60 seconds when tab is backgrounded

function useNotificationPolling() {
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsActive(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const { data } = trpc.notifications.poll.useQuery(
    { lastSeen: lastPollTime },
    {
      refetchInterval: isActive ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_BACKGROUND,
      refetchOnWindowFocus: true,
    }
  );

  return data;
}
```

---

### WebSocket / SSE Support

**Status:** Not currently implemented

The expiry system does not currently support WebSocket or Server-Sent Events for real-time push notifications. All updates are delivered via:

1. **Polling** for in-app notifications
2. **Email** for critical notifications

**Future Enhancement Recommendation:**
Consider implementing WebSocket support for real-time notification delivery to reduce polling overhead and improve user experience.

---

## Communication Flow Examples

### Example 1: 90-Day Notice Flow

```
Day -90:
  1. Backend job finds license expiring in 90 days
  2. Email sent to brand: "License Expiry Notice: {asset}"
  3. Email sent to creator(s): "License Expiry Notice: {asset}"
  4. Timestamp updated: ninetyDayNoticeSentAt
  5. Event logged: license.expiry_notification_sent

Frontend Display:
  • License card shows "Renewal notice sent" badge
  • Days until expiry: 90
  • Auto-renewal badge (if enabled)
```

---

### Example 2: 30-Day Urgent Notice Flow

```
Day -30:
  1. Backend job finds license expiring in 30 days
  2. Email sent to brand: "Action Required: License Expires in 30 Days"
  3. Email sent to creator(s): Same
  4. In-app notification created for brand (priority: HIGH)
  5. In-app notification created for each creator (priority: HIGH)
  6. Timestamp updated: thirtyDayNoticeSentAt
  7. License status changed to EXPIRING_SOON
  8. Event logged: license.expiry_notification_sent

Frontend Display:
  • Red alert banner: "Action Required: License expires in 30 days"
  • Notification bell shows badge
  • Notification list shows HIGH priority item
  • License card shows urgent status
  • "Renew Now" CTA prominent
```

---

### Example 3: Grace Period Flow

```
Day 0 (End Date Reached):
  1. Backend job detects license end date reached
  2. Grace period applied: gracePeriodEndDate = endDate + 7 days
  3. Email sent: "Grace Period Active: {asset}"
  4. License status: EXPIRING_SOON
  5. Event logged: license.grace_period_started

Frontend Display:
  • Alert: "Grace Period Active: 7 days remaining"
  • Countdown timer showing days left
  • Urgent "Renew Now" CTA
  • Grace period badge on license card

Day +7 (Grace Period Ended):
  1. Backend job detects grace period ended
  2. License status changed to EXPIRED
  3. expiredAt timestamp set
  4. Email sent: "License Expired: {asset}"
  5. In-app notification created
  6. Post-expiry actions executed
  7. Event logged: license.expired

Frontend Display:
  • Status: "EXPIRED"
  • Message: "License expired on {date}"
  • "Request New License" CTA
  • Historical data view only
```

---

## Frontend Implementation Checklist

### Email Integration
- [ ] Trust backend to send all emails - no frontend email triggers
- [ ] Display "email sent" indicators based on timestamp fields
- [ ] Show email preferences toggle in user settings
- [ ] Handle "email not received" support flow
- [ ] Display email frequency preferences

### In-App Notifications
- [ ] Implement notification polling (30-60 second intervals)
- [ ] Display unread count badge on notification bell
- [ ] Show notification list with priority indicators
- [ ] Filter license expiry notifications separately
- [ ] Mark notifications as read on view
- [ ] Deep link to license details from notifications
- [ ] Display urgent expiry alert banner

### Notification Preferences
- [ ] Fetch user notification preferences
- [ ] Toggle license expiry notifications on/off
- [ ] Set email frequency (realtime/daily/weekly digest)
- [ ] Show current preferences in settings
- [ ] Persist preference changes via API

### Error Handling
- [ ] Handle email delivery failure states
- [ ] Display "check spam folder" message if needed
- [ ] Show "notifications disabled" alert
- [ ] Handle rate limit errors gracefully
- [ ] Provide support contact for notification issues

---

## Next Steps

Continue to:
- **[Part 3: Admin Operations & Troubleshooting](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_3_ADMIN.md)** - Admin controls, manual triggers, testing, and operational procedures

Return to:
- **[Part 1: Overview & Monitoring](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_1_OVERVIEW.md)** - System architecture and monitoring APIs

---

## Support & Contact

**For notification delivery issues:**
- Email: engineering@yesgoddess.com
- Slack: #ops-alerts (emergency escalation)

**For email template updates:**
- Review: `emails/templates/LicenseExpiry*.tsx`
- Test fixtures: `emails/fixtures/`
- Documentation: `emails/README.md`
