# Security Notifications - Frontend Integration Guide

## 🌐 Classification: SHARED
**User-facing notifications triggered by security events across both client portal and admin backend**

---

## Overview

The YesGoddess platform automatically sends email notifications to users when critical security events occur on their accounts. These are **backend-triggered, system-generated emails** that do not require direct API calls from the frontend. However, the frontend needs to understand when these notifications are sent and provide users with visibility into their notification history and preferences.

### Key Points
- ✅ **Automatic Triggers**: Emails are sent automatically by the backend when security events occur
- ✅ **No Frontend API Calls Required**: Frontend does not need to call APIs to send these emails
- 📧 **Email Only**: All notifications are email-based (no SMS for security alerts)
- 🔍 **Frontend Responsibilities**: Display notification history, explain notification types, provide security center UI

---

## Security Notification Types

### 1. 🔐 Two-Factor Authentication Enabled
**When Triggered**: User successfully enables 2FA on their account

**Email Details**:
- **Subject**: `🔐 Two-Factor Authentication Enabled`
- **Template Key**: `two-factor-enabled`
- **Sender**: Automated by `send2FAEnabledEmail()` in auth service

**Email Content Includes**:
- Enabled timestamp
- 2FA method (e.g., "Authenticator App (TOTP)")
- IP address
- Device/browser information
- Number of backup codes generated
- Security center link

**Backend Trigger Location**:
```typescript
// src/lib/services/auth.service.ts - setupTotp()
await this.emailService.send2FAEnabledEmail({
  email: user.email,
  name: user.name || 'User',
  enabledAt: new Date(),
  method: 'Authenticator App (TOTP)',
  ipAddress: context?.ipAddress,
  device: context?.userAgent,
  backupCodesCount: backupCodes.length,
});
```

---

### 2. 🔓 Two-Factor Authentication Disabled
**When Triggered**: User disables 2FA on their account

**Email Details**:
- **Subject**: `🔓 Two-Factor Authentication Disabled`
- **Template Key**: `two-factor-disabled`
- **Sender**: Automated by `send2FADisabledEmail()` in auth service

**Email Content Includes**:
- Disabled timestamp
- 2FA method that was disabled
- IP address
- Device/browser information
- Warning about reduced security
- Re-enable instructions
- "Didn't do this?" alert

**Backend Trigger Location**:
```typescript
// src/lib/services/auth.service.ts - disableTotp()
await this.emailService.send2FADisabledEmail({
  email: user.email,
  name: user.name || 'User',
  disabledAt: new Date(),
  method: 'Authenticator App (TOTP)',
  ipAddress: context?.ipAddress,
  device: context?.userAgent,
});
```

---

### 3. 🔔 New Device Login
**When Triggered**: User successfully logs in from a new device (new IP address or device fingerprint)

**Email Details**:
- **Subject**: `🔔 New Device Sign-In Detected`
- **Template Key**: `new-device-login`
- **Sender**: Automated by `sendNewDeviceLoginEmail()` in auth service

**Email Content Includes**:
- Login timestamp
- Device name
- Device type
- Browser
- Operating system
- IP address
- Location (if available)
- Security center link

**Backend Trigger Location**:
```typescript
// src/lib/services/auth.service.ts - verify2FALogin() and verifyBackupCodeLogin()
await this.emailService.sendNewDeviceLoginEmail({
  email: user.email,
  name: user.name || 'User',
  loginTime: new Date(),
  deviceName: deviceInfo.deviceName,
  deviceType: deviceInfo.deviceType,
  browser: deviceInfo.browser,
  operatingSystem: deviceInfo.os,
  ipAddress: context?.ipAddress,
  location: context?.location,
});
```

**Detection Logic**:
- Triggered when user logs in with `rememberDevice: true` and device is not in trusted devices
- Uses IP address and device fingerprint to detect new devices
- Email is sent AFTER successful 2FA verification

---

### 4. 🔒 Account Lockout
**When Triggered**: Account is temporarily locked after 10 failed 2FA attempts

**Email Details**:
- **Subject**: `🔒 Account Security Alert - Account Locked`
- **Template Key**: `account-locked`
- **Sender**: Automated by `sendAccountLockoutEmail()` in account lockout service

**Email Content Includes**:
- Lockout duration (minutes)
- Unlock time
- IP address of failed attempts
- Number of failed attempts
- "Was this you?" section
- Recovery instructions
- Support contact info

**Backend Trigger Location**:
```typescript
// src/lib/auth/account-lockout.service.ts - recordFailedAttempt()
await this.emailService.sendAccountLockoutEmail({
  email: user.email,
  name: user.name,
  lockedUntil: lockedUntil,
  lockoutMinutes: lockoutPeriodMinutes,
  ipAddress: ipAddress,
  failedAttempts: failedAttempts,
});
```

**Lockout Tiers**:
- 5 failed attempts: 5-minute lockout
- 10 failed attempts: 15-minute lockout
- 15 failed attempts: 60-minute lockout
- 20+ failed attempts: 4-hour lockout

---

### 5. 🔑 Backup Codes Regenerated
**When Triggered**: User regenerates their backup codes

**Email Details**:
- **Subject**: `🔑 Backup Codes Regenerated`
- **Template Key**: `backup-codes-regenerated`
- **Sender**: Automated by `sendBackupCodesRegeneratedEmail()` in auth service

**Email Content Includes**:
- Regeneration timestamp
- Number of new codes generated
- IP address
- Device information
- Warning that old codes are invalidated
- Security center link

**Backend Trigger Location**:
```typescript
// src/lib/services/auth.service.ts - regenerateBackupCodes()
await this.emailService.sendBackupCodesRegeneratedEmail({
  email: user.email,
  name: user.name || 'User',
  regeneratedAt: new Date(),
  newCodesCount: backupCodes.length,
  ipAddress: context?.ipAddress,
  device: context?.userAgent,
});
```

---

### 6. ⚠️ Low Backup Codes Alert
**When Triggered**: User has fewer than 3 backup codes remaining

**Email Details**:
- **Subject**: `⚠️ Low Backup Codes Alert`
- **Template Key**: `low-backup-codes-alert`
- **Sender**: Automated by `sendLowBackupCodesAlert()` when checking backup code status

**Email Content Includes**:
- Number of remaining codes
- Regeneration instructions
- Link to regenerate codes
- Importance of backup codes

**Backend Trigger Location**:
```typescript
// Triggered automatically during backup code usage
await this.emailService.sendLowBackupCodesAlert({
  email: user.email,
  name: user.name || 'User',
  remainingCodes: remainingCount,
});
```

---

## ❌ SMS Alerts for Suspicious Activity

**Status**: ⚠️ **NOT IMPLEMENTED**

The checklist item "SMS alert on suspicious activity (optional)" is **not currently implemented**. The backend only uses SMS for:
- ✅ 2FA verification codes
- ✅ Phone number verification

The SMS service (`TwilioSmsService`) does **not** send security alerts. Only email notifications are sent for security events.

**Future Implementation Notes**:
If SMS alerts are added in the future, they would require:
1. New method in `TwilioSmsService` (e.g., `sendSecurityAlert()`)
2. User preference to opt-in to SMS alerts
3. SMS template for suspicious activity
4. Cost monitoring for alert SMS
5. Rate limiting for security SMS

---

## Frontend Implementation Guide

### 1. Security Center Dashboard

Create a security notifications section in the user's security center:

```typescript
// components/SecurityCenter/NotificationHistory.tsx
interface SecurityNotification {
  id: string;
  type: 
    | '2fa-enabled'
    | '2fa-disabled'
    | 'new-device-login'
    | 'account-locked'
    | 'backup-codes-regenerated'
    | 'low-backup-codes-alert';
  title: string;
  description: string;
  timestamp: Date;
  metadata: {
    ipAddress?: string;
    device?: string;
    location?: string;
  };
  severity: 'info' | 'warning' | 'critical';
}

export function NotificationHistory() {
  // Fetch notification history from audit logs
  const { data: notifications } = useQuery({
    queryKey: ['security-notifications'],
    queryFn: () => api.get('/api/security/notification-history')
  });

  return (
    <div className="space-y-4">
      <h2>Recent Security Notifications</h2>
      <p className="text-sm text-muted-foreground">
        These emails were automatically sent to {user.email}
      </p>
      
      {notifications?.map(notification => (
        <NotificationCard key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
```

---

### 2. Notification Type Explanations

Provide users with information about what each notification means:

```typescript
// components/SecurityCenter/NotificationGuide.tsx
export const NOTIFICATION_INFO: Record<string, NotificationInfo> = {
  '2fa-enabled': {
    icon: '🔐',
    title: '2FA Enabled',
    description: 'You receive this email when you enable two-factor authentication.',
    severity: 'info',
    actions: [
      { label: 'Manage 2FA', href: '/dashboard/security/2fa' }
    ]
  },
  '2fa-disabled': {
    icon: '🔓',
    title: '2FA Disabled',
    description: 'You receive this email when two-factor authentication is disabled.',
    severity: 'warning',
    actions: [
      { label: 'Re-enable 2FA', href: '/dashboard/security/2fa' },
      { label: 'Report Unauthorized Change', href: '/support' }
    ]
  },
  'new-device-login': {
    icon: '🔔',
    title: 'New Device Login',
    description: 'You receive this email when you log in from a new device or location.',
    severity: 'info',
    actions: [
      { label: 'View Devices', href: '/dashboard/security/devices' },
      { label: 'Change Password', href: '/dashboard/security/password' }
    ]
  },
  'account-locked': {
    icon: '🔒',
    title: 'Account Locked',
    description: 'Your account is temporarily locked after multiple failed login attempts.',
    severity: 'critical',
    actions: [
      { label: 'Security Help', href: '/support/security' }
    ]
  },
  'backup-codes-regenerated': {
    icon: '🔑',
    title: 'Backup Codes Regenerated',
    description: 'You receive this email when you generate new backup codes.',
    severity: 'info',
    actions: [
      { label: 'View Backup Codes', href: '/dashboard/security/2fa/backup-codes' }
    ]
  },
  'low-backup-codes-alert': {
    icon: '⚠️',
    title: 'Low Backup Codes',
    description: 'You receive this email when you have fewer than 3 backup codes remaining.',
    severity: 'warning',
    actions: [
      { label: 'Generate New Codes', href: '/dashboard/security/2fa/backup-codes/regenerate' }
    ]
  }
};

export function NotificationGuide() {
  return (
    <div className="space-y-6">
      <h2>Email Notifications We Send</h2>
      <p>
        YesGoddess automatically sends these security emails to protect your account.
        You cannot disable these notifications as they alert you to important security events.
      </p>
      
      {Object.entries(NOTIFICATION_INFO).map(([key, info]) => (
        <NotificationInfoCard key={key} info={info} />
      ))}
    </div>
  );
}
```

---

### 3. Real-time Notification Banner

Show an in-app banner when certain events occur:

```typescript
// components/SecurityBanner.tsx
export function SecurityBanner() {
  const [recentEvent, setRecentEvent] = React.useState<SecurityEvent | null>(null);

  // Poll for recent security events
  useQuery({
    queryKey: ['recent-security-events'],
    queryFn: () => api.get('/api/security/recent-events'),
    refetchInterval: 30000, // Check every 30 seconds
    onSuccess: (events) => {
      const latestEvent = events[0];
      if (latestEvent && !localStorage.getItem(`dismissed-${latestEvent.id}`)) {
        setRecentEvent(latestEvent);
      }
    }
  });

  if (!recentEvent) return null;

  return (
    <Alert variant="info" className="mb-4">
      <Shield className="h-4 w-4" />
      <AlertTitle>Security Alert</AlertTitle>
      <AlertDescription>
        {recentEvent.message}
        <br />
        <small>An email has been sent to your inbox with details.</small>
      </AlertDescription>
      <Button 
        variant="ghost" 
        size="sm"
        onClick={() => {
          localStorage.setItem(`dismissed-${recentEvent.id}`, 'true');
          setRecentEvent(null);
        }}
      >
        Dismiss
      </Button>
    </Alert>
  );
}
```

---

### 4. Trusted Devices Management

Display devices that won't trigger new device emails:

```typescript
// components/SecurityCenter/TrustedDevices.tsx
export function TrustedDevices() {
  const { data: devices } = useQuery({
    queryKey: ['trusted-devices'],
    queryFn: () => api.get('/api/security/trusted-devices')
  });

  const removeTrustedDevice = useMutation({
    mutationFn: (deviceId: string) => 
      api.delete(`/api/security/trusted-devices/${deviceId}`),
    onSuccess: () => {
      toast.success('Device removed. You\'ll receive an email on next login from this device.');
      queryClient.invalidateQueries(['trusted-devices']);
    }
  });

  return (
    <div>
      <h2>Trusted Devices</h2>
      <p className="text-sm text-muted-foreground">
        You won't receive new device login emails for these devices
      </p>
      
      <div className="space-y-4 mt-4">
        {devices?.map(device => (
          <Card key={device.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <DeviceIcon type={device.deviceType} />
                <div>
                  <p className="font-medium">{device.deviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {device.browser} on {device.operatingSystem}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last used: {formatDate(device.lastUsedAt)}
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTrustedDevice.mutate(device.id)}
              >
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## API Endpoints (Read-Only)

The frontend does **NOT** call APIs to send notifications (these are automatic). However, the frontend may need these endpoints for displaying notification history:

### GET /api/security/notification-history

**Purpose**: Retrieve list of security notifications sent to the user

**Request**:
```typescript
GET /api/security/notification-history?limit=20&offset=0
```

**Response**:
```typescript
{
  notifications: [
    {
      id: "notif_abc123",
      type: "new-device-login",
      subject: "New Device Sign-In Detected",
      sentAt: "2024-01-15T10:30:00Z",
      metadata: {
        ipAddress: "203.0.113.45",
        device: "Chrome on macOS",
        location: "San Francisco, CA"
      }
    }
  ],
  total: 45,
  limit: 20,
  offset: 0
}
```

**Implementation Notes**:
- This endpoint queries audit logs or email sending logs
- Filter by `category: 'system'` and `tags.type` matching notification types
- Return most recent notifications first

---

### GET /api/security/trusted-devices

**Purpose**: List all trusted devices for the current user

**Response**:
```typescript
{
  devices: [
    {
      id: "device_abc123",
      deviceName: "MacBook Pro",
      deviceType: "Desktop",
      browser: "Chrome 120",
      operatingSystem: "macOS 14.2",
      ipAddress: "203.0.113.45",
      addedAt: "2024-01-10T08:00:00Z",
      lastUsedAt: "2024-01-15T10:30:00Z",
      expiresAt: "2024-02-10T08:00:00Z"
    }
  ]
}
```

---

### DELETE /api/security/trusted-devices/:deviceId

**Purpose**: Remove a device from trusted devices list

**Response**:
```typescript
{
  success: true,
  message: "Device removed successfully"
}
```

**Side Effect**: Next login from this device will trigger "New Device Login" email

---

## TypeScript Type Definitions

```typescript
// types/security-notifications.ts

/**
 * Security notification types
 */
export type SecurityNotificationType =
  | '2fa-enabled'
  | '2fa-disabled'
  | 'new-device-login'
  | 'account-locked'
  | 'backup-codes-regenerated'
  | 'low-backup-codes-alert';

/**
 * Notification severity levels
 */
export type NotificationSeverity = 'info' | 'warning' | 'critical';

/**
 * Security notification record
 */
export interface SecurityNotification {
  id: string;
  type: SecurityNotificationType;
  subject: string;
  sentAt: string;
  metadata: {
    ipAddress?: string;
    device?: string;
    location?: string;
    method?: string;
    remainingCodes?: number;
    lockoutMinutes?: number;
    failedAttempts?: number;
  };
}

/**
 * Notification history response
 */
export interface NotificationHistoryResponse {
  notifications: SecurityNotification[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Trusted device information
 */
export interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown';
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  addedAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

/**
 * Trusted devices response
 */
export interface TrustedDevicesResponse {
  devices: TrustedDevice[];
}

/**
 * Recent security event (for in-app alerts)
 */
export interface SecurityEvent {
  id: string;
  type: SecurityNotificationType;
  message: string;
  timestamp: string;
  severity: NotificationSeverity;
  requiresAction: boolean;
  actionUrl?: string;
}
```

---

## Error Handling

### Email Delivery Failures

The backend handles email delivery failures gracefully:

```typescript
// All email sending is wrapped in try-catch
try {
  await this.emailService.send2FAEnabledEmail({...});
} catch (error) {
  // Log error but don't fail the operation
  console.error('[Auth] Failed to send 2FA enabled email:', error);
}
```

**Frontend Implications**:
- Users may not receive emails if email service is down
- Frontend should provide alternative way to see security events
- Display notification history from audit logs (not dependent on email delivery)

---

## Authorization & Permissions

| Endpoint | User | Admin | Notes |
|----------|------|-------|-------|
| GET /api/security/notification-history | ✅ Own data | ✅ All users | Users see only their own notifications |
| GET /api/security/trusted-devices | ✅ Own data | ✅ All users | Users manage only their devices |
| DELETE /api/security/trusted-devices/:id | ✅ Own device | ✅ All devices | Cannot delete other users' devices |

**Authentication**: All endpoints require valid JWT token

---

## Rate Limiting

| Endpoint | Rate Limit | Window |
|----------|-----------|--------|
| GET /api/security/notification-history | 30 requests | 1 minute |
| GET /api/security/trusted-devices | 20 requests | 1 minute |
| DELETE /api/security/trusted-devices/:id | 10 requests | 1 minute |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1705329000
```

---

## User Experience Considerations

### 1. Email Expectations
- Set user expectations that security emails are automatic
- Explain they cannot be disabled (security requirement)
- Provide examples of what emails they'll receive

### 2. False Alarm Handling
- If user sees "New Device Login" email but recognizes the login, show them how to trust devices
- Explain what to do if they see a notification they didn't initiate

### 3. Email Not Received
- Provide troubleshooting steps:
  1. Check spam folder
  2. Add noreply@yesgoddess.agency to contacts
  3. Check email in notification history
  4. Contact support if persistent

### 4. Notification Fatigue
- Trusted devices feature reduces "new device" emails
- Only critical events trigger emails (not every login)
- Balance between security and user experience

---

## Testing Checklist

### Frontend Testing

- [ ] Notification history displays all notification types correctly
- [ ] Notification icons and severity levels render properly
- [ ] Trusted devices list shows current devices
- [ ] Removing trusted device works and shows confirmation
- [ ] In-app security banner appears for recent events
- [ ] Notification guide explains each email type clearly
- [ ] "Email not received" help section is accessible
- [ ] Empty states for no notifications/devices

### Integration Testing

- [ ] After enabling 2FA, notification appears in history
- [ ] After disabling 2FA, notification appears in history
- [ ] After login from new device, notification appears
- [ ] After regenerating backup codes, notification appears
- [ ] Account lockout shows in notification history
- [ ] Low backup codes alert appears when threshold is met

---

## Edge Cases

### 1. User Has No Email
**Scenario**: User account has no email address (edge case, shouldn't happen)
**Backend Behavior**: Email send is skipped, error is logged
**Frontend Handling**: Show warning in security center that notifications cannot be sent

### 2. Email Bounces
**Scenario**: User's email address bounces (invalid, full, etc.)
**Backend Behavior**: Email marked as failed, suppression list updated
**Frontend Handling**: Show email verification required banner

### 3. Trusted Device Expired
**Scenario**: Trusted device token expired (30 days default)
**Backend Behavior**: New device email sent on next login
**Frontend Handling**: Display expiration date on trusted devices, show "renew" option

### 4. Notification History Empty
**Scenario**: New user with no security events yet
**Frontend Handling**: Show empty state with explanation:
```typescript
<EmptyState
  icon={<Shield />}
  title="No security notifications yet"
  description="You'll see a history of security emails we send you here"
/>
```

---

## Security Considerations

### 1. Notification History Privacy
- Never expose another user's notification history
- Filter by authenticated user ID on backend
- Validate user owns device before deletion

### 2. Sensitive Information
- Don't display full IP addresses in UI (show partial: `203.0.113.***`)
- Don't expose device fingerprints
- Sanitize user agent strings

### 3. Rate Limiting
- Prevent notification history API abuse
- Limit device management operations
- Track excessive security endpoint access

### 4. Audit Logging
- Log when users view notification history
- Log trusted device additions/removals
- Track notification dismissals

---

## FAQs for Frontend Developers

**Q: Do I need to call an API to send these notifications?**  
A: No. These are automatically sent by the backend when events occur.

**Q: Can users opt out of security notifications?**  
A: No. These are critical security notifications and cannot be disabled.

**Q: Is SMS supported for security alerts?**  
A: No. Only email notifications are currently implemented. SMS is only used for 2FA codes.

**Q: How do I test notifications in development?**  
A: Use a test email service like Ethereal Email or MailHog to capture emails sent by the backend.

**Q: What if a user doesn't receive an email?**  
A: Show notification history from audit logs (independent of email delivery). Provide troubleshooting help.

**Q: Can admins see notification history for all users?**  
A: Yes, but this requires admin endpoints (not covered in this guide).

**Q: How long are trusted devices remembered?**  
A: 30 days by default. Users receive "new device" email after expiration.

**Q: What happens if user logs in with VPN?**  
A: May trigger "new device" email due to IP change. User can trust device to prevent future emails.

---

## Related Documentation

- [2FA Challenge Endpoints Implementation](../2FA_CHALLENGE_ENDPOINTS_IMPLEMENTATION.md)
- [Authenticator 2FA REST API](../AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md)
- [Login Security Implementation](../LOGIN_SECURITY_IMPLEMENTATION.md)
- [Session Security Guide](./SESSION_SECURITY_PART_1_SESSION_MANAGEMENT.md)

---

## Support Contact

For frontend integration questions:
- **Backend Team**: backend@yesgoddess.agency
- **Documentation Issues**: Create GitHub issue in yg-backend repo

---

**Document Version**: 1.0  
**Last Updated**: October 20, 2025  
**Maintained By**: Backend Team
