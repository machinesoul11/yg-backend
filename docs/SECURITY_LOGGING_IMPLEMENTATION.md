# Security Logging Implementation

## Overview

Comprehensive security logging system for tracking all security-sensitive events, with particular focus on two-factor authentication (2FA) operations, device tracking, and security alerts.

**Implementation Date:** October 19, 2025  
**Status:** ✅ Complete

---

## Architecture

### Core Components

1. **SecurityLoggingService** - Main service for logging security events
2. **SecurityRouter** - tRPC API endpoints for security timelines and dashboards
3. **Integration Points** - Security logging integrated into auth flows

### Database Schema

Security events are stored in the existing `AuditEvent` model with enhanced metadata:

```prisma
model AuditEvent {
  id         String   @id @default(cuid())
  timestamp  DateTime @default(now()) @db.Timestamptz(6)
  userId     String?
  email      String?
  entityType String   // Set to "user_security" for security events
  entityId   String
  action     String   // Security event type
  beforeJson Json?
  afterJson  Json?    // Contains SecurityEventMetadata
  ipAddress  String?
  userAgent  String?
  requestId  String?
  user       User?    @relation(fields: [userId], references: [id])

  @@index([userId, timestamp])
  @@index([entityType, entityId])
  @@index([action, timestamp])
  @@index([requestId])
  @@index([email])
}
```

---

## Security Event Types

### 2FA Setup Events
- `TWO_FACTOR_SETUP_INITIATED` - User starts 2FA setup
- `TWO_FACTOR_SETUP_COMPLETED` - 2FA successfully enabled
- `TOTP_SETUP_INITIATED` - Authenticator app setup started
- `TOTP_SETUP_COMPLETED` - Authenticator app enabled
- `SMS_SETUP_INITIATED` - SMS 2FA setup started
- `SMS_SETUP_COMPLETED` - SMS 2FA enabled

### 2FA Disable Events
- `TWO_FACTOR_DISABLE_INITIATED` - User requests to disable 2FA
- `TWO_FACTOR_DISABLE_COMPLETED` - 2FA successfully disabled
- `TOTP_DISABLED` - Authenticator app disabled
- `SMS_DISABLED` - SMS 2FA disabled

### 2FA Verification Events
- `TWO_FACTOR_VERIFICATION_SUCCESS` - Successful 2FA verification
- `TWO_FACTOR_VERIFICATION_FAILED` - Failed 2FA verification attempt
- `TOTP_VERIFICATION_SUCCESS` - Successful authenticator verification
- `TOTP_VERIFICATION_FAILED` - Failed authenticator verification
- `SMS_VERIFICATION_SUCCESS` - Successful SMS verification
- `SMS_VERIFICATION_FAILED` - Failed SMS verification

### Backup Code Events
- `BACKUP_CODES_GENERATED` - Initial backup codes created
- `BACKUP_CODES_REGENERATED` - Backup codes regenerated
- `BACKUP_CODE_USED` - User authenticated with backup code
- `BACKUP_CODE_VERIFICATION_FAILED` - Invalid backup code attempted
- `BACKUP_CODE_LOW_WARNING` - Less than 3 backup codes remaining
- `BACKUP_CODE_DEPLETED` - No backup codes remaining

### Phone Number Events
- `PHONE_NUMBER_ADDED` - Phone number added to account
- `PHONE_NUMBER_CHANGED` - Phone number updated
- `PHONE_NUMBER_REMOVED` - Phone number removed from account
- `PHONE_NUMBER_VERIFIED` - Phone number successfully verified
- `PHONE_NUMBER_VERIFICATION_FAILED` - Phone verification failed

### Trusted Device Events
- `TRUSTED_DEVICE_ADDED` - New trusted device registered
- `TRUSTED_DEVICE_REMOVED` - Trusted device revoked
- `TRUSTED_DEVICE_USED` - Login from trusted device
- `ALL_TRUSTED_DEVICES_REVOKED` - All trusted devices removed

### Security Alerts
- `SUSPICIOUS_LOGIN_DETECTED` - Unusual login activity detected
- `BRUTE_FORCE_DETECTED` - Brute force attack pattern detected
- `ACCOUNT_LOCKED` - Account locked due to security concerns
- `ACCOUNT_UNLOCKED` - Account unlocked
- `UNUSUAL_DEVICE_DETECTED` - Login from unfamiliar device
- `UNUSUAL_LOCATION_DETECTED` - Login from unusual location

---

## API Endpoints

### User Security Timeline

**Endpoint:** `security.getMyTimeline`  
**Authentication:** Required (User)  
**Description:** Get security event timeline for current user

```typescript
// Request
{
  limit?: number,      // Default: 50, Max: 100
  offset?: number,     // Default: 0
  startDate?: string,  // ISO 8601 datetime
  endDate?: string,    // ISO 8601 datetime
  eventTypes?: SecurityEventType[]
}

// Response
{
  success: true,
  data: {
    events: SecurityTimelineEvent[],
    pagination: {
      limit: number,
      offset: number,
      hasMore: boolean
    }
  }
}
```

### Admin Security Dashboard

**Endpoint:** `security.getDashboardMetrics`  
**Authentication:** Required (Admin)  
**Description:** Get comprehensive security metrics for admin dashboard

```typescript
// Response
{
  success: true,
  data: {
    twoFactorAdoption: {
      total: number,
      enabled: number,
      percentage: number,
      byMethod: {
        totp: number,
        sms: number,
        both: number
      }
    },
    verificationMetrics: {
      last24Hours: { total, successful, failed, successRate },
      last7Days: { total, successful, failed, successRate },
      last30Days: { total, successful, failed, successRate }
    },
    backupCodeUsage: {
      last24Hours: number,
      last7Days: number,
      last30Days: number
    },
    securityAlerts: {
      last24Hours: number,
      last7Days: number,
      last30Days: number,
      byType: {
        suspiciousLogin: number,
        bruteForce: number,
        accountLocked: number,
        unusualDevice: number,
        unusualLocation: number
      }
    },
    phoneNumberChanges: {
      last24Hours: number,
      last7Days: number,
      last30Days: number
    },
    recentActivity: {
      setupEvents: number,
      disableEvents: number,
      verificationAttempts: number
    }
  }
}
```

### Search Security Events

**Endpoint:** `security.searchEvents`  
**Authentication:** Required (Admin)  
**Description:** Search security events across all users

```typescript
// Request
{
  userId?: string,
  email?: string,
  eventTypes?: SecurityEventType[],
  startDate?: string,
  endDate?: string,
  ipAddress?: string,
  limit?: number,
  offset?: number
}

// Response
{
  success: true,
  data: {
    events: SecurityTimelineEvent[],
    pagination: { ... },
    filters: { ... }
  }
}
```

### Get User Timeline (Admin)

**Endpoint:** `security.getUserTimeline`  
**Authentication:** Required (Admin)  
**Description:** Get security timeline for specific user

```typescript
// Request
{
  userId: string,
  limit?: number,
  offset?: number,
  startDate?: string,
  endDate?: string,
  eventTypes?: SecurityEventType[]
}

// Response
{
  success: true,
  data: {
    userId: string,
    events: SecurityTimelineEvent[],
    pagination: { ... }
  }
}
```

---

## Integration Points

### Authentication Service

The `AuthService` has been enhanced with security logging for:

- **TOTP Setup**: `initiateTotpSetup()` - Logs setup initiation
- **TOTP Confirmation**: `confirmTotpSetup()` - Logs setup completion and backup code generation
- **TOTP Verification**: `verifyTotp()` - Logs successful verification
- **TOTP Verification Failures**: Logs failed verification attempts
- **TOTP Disable**: `disableTotp()` - Logs disable initiation and completion
- **Backup Code Usage**: `verifyBackupCodeForLogin()` - Logs backup code usage with remaining count
- **Backup Code Regeneration**: `regenerateBackupCodes()` - Logs regeneration events

### SMS 2FA Router

The `sms2FARouter` has been enhanced with security logging for:

- **SMS Setup**: `enable` - Logs setup initiation and phone number addition
- **SMS Verification**: `verify` - Logs phone verification and setup completion
- **SMS Disable**: `disable` - Logs disable initiation, completion, and phone removal

### Login Security Service

The existing `LoginSecurityService` continues to handle:
- Login attempt logging (success/failure)
- Anomaly detection
- Device and location tracking
- Account lockouts

---

## Security Event Metadata

Each security event includes comprehensive metadata:

```typescript
interface SecurityEventMetadata {
  method?: '2FA' | 'TOTP' | 'SMS' | 'BACKUP_CODE';
  success?: boolean;
  failureReason?: string;
  remainingBackupCodes?: number;
  phoneNumber?: string;  // Masked (***1234)
  previousPhoneNumber?: string;  // Masked
  previousMethod?: string;
  newMethod?: string;
  attemptNumber?: number;
  isAnomalous?: boolean;
  anomalyReasons?: string[];
  initiatedBy?: 'USER' | 'ADMIN' | 'SYSTEM';
  verificationDuration?: number;  // milliseconds
}
```

---

## Privacy and Compliance

### Data Masking

- **Phone Numbers**: Only last 4 digits shown (e.g., `***8901`)
- **Verification Codes**: Never logged
- **Backup Codes**: Only hash stored, never plaintext in logs

### Retention

Security events are retained in the audit log per the existing audit retention policy. Personally identifiable information is masked or excluded from logs where possible.

### GDPR Compliance

Users can request their complete security timeline via the `security.getMyTimeline` endpoint. Admin access to user security data is logged for audit purposes.

---

## Error Handling

The security logging service follows the principle: **Never break authentication flow due to logging failures**

```typescript
// All logging operations are wrapped in try-catch
try {
  await securityLoggingService.logEvent(...);
} catch (error) {
  console.error('Security logging failed', error);
  // Continue with authentication flow
}
```

---

## Performance Considerations

### Database Indexes

Security event queries are optimized with indexes on:
- `(userId, timestamp)` - User timeline queries
- `(entityType, entityId)` - Security event filtering
- `(action, timestamp)` - Event type queries
- `(ipAddress)` - IP-based searches

### Query Optimization

- **Pagination**: All endpoints support pagination with configurable limits
- **Filtering**: Event type filtering reduces query scope
- **Date Ranges**: Time-based queries use indexed timestamp field

---

## Monitoring and Alerts

### Real-Time Monitoring

The admin dashboard provides real-time metrics for:
- 2FA adoption rate trends
- Verification success rates
- Security alert patterns
- Backup code usage patterns

### Alert Thresholds

System monitors for:
- Spike in failed verification attempts (potential brute force)
- Unusual increase in account lockouts
- High volume of backup code usage
- Suspicious login patterns

---

## Testing

### Unit Tests

Test coverage includes:
- Security logging service methods
- Event type mappings
- Metadata formatting
- Privacy mask functions

### Integration Tests

Test coverage includes:
- Authentication flows with security logging
- Admin dashboard metrics calculation
- Timeline query performance
- Event search functionality

---

## Usage Examples

### Log 2FA Setup

```typescript
import { securityLoggingService } from '@/lib/services/security-logging.service';

await securityLoggingService.logTwoFactorSetupCompleted(
  {
    userId: user.id,
    email: user.email,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  },
  {
    method: 'TOTP',
    success: true,
  }
);
```

### Log Backup Code Usage

```typescript
await securityLoggingService.logBackupCodeUsed(
  {
    userId: user.id,
    email: user.email,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  },
  {
    method: 'BACKUP_CODE',
    success: true,
    remainingBackupCodes: 7,
  }
);
```

### Query User Timeline

```typescript
const timeline = await securityLoggingService.getUserSecurityTimeline(
  userId,
  {
    limit: 50,
    startDate: new Date('2025-01-01'),
    eventTypes: [
      SecurityEventType.TOTP_VERIFICATION_SUCCESS,
      SecurityEventType.TOTP_VERIFICATION_FAILED,
    ],
  }
);
```

### Get Dashboard Metrics

```typescript
const metrics = await securityLoggingService.getSecurityDashboardMetrics();

console.log(`2FA Adoption: ${metrics.twoFactorAdoption.percentage}%`);
console.log(`Success Rate (24h): ${metrics.verificationMetrics.last24Hours.successRate}%`);
```

---

## Future Enhancements

### Planned Features

1. **Anomaly ML Integration**: Machine learning-based anomaly detection
2. **Real-Time Webhooks**: Webhook notifications for critical security events
3. **Export Functionality**: CSV/JSON export of security events
4. **Advanced Analytics**: Trend analysis and predictive alerts
5. **Geolocation Enhancement**: Detailed location tracking integration
6. **Session Correlation**: Link security events to specific sessions

### Potential Integrations

1. **SIEM Integration**: Export to security information and event management systems
2. **Slack/Discord Alerts**: Real-time notifications for security teams
3. **Email Digests**: Daily/weekly security summary emails for admins
4. **Audit Report Generation**: Automated compliance reports

---

## Troubleshooting

### Common Issues

**Issue**: Events not appearing in timeline  
**Solution**: Check `entityType = 'user_security'` filter is applied

**Issue**: Masked phone numbers not displaying  
**Solution**: Use `SecurityLoggingService.maskPhoneNumber()` static method

**Issue**: Dashboard metrics slow  
**Solution**: Check database indexes, consider caching metrics

**Issue**: Duplicate events logged  
**Solution**: Ensure logging calls aren't duplicated in transaction retries

---

## Security Considerations

1. **Audit Integrity**: Security logs use separate transactions to prevent rollback
2. **Tamper Detection**: Timestamps use `@db.Timestamptz(6)` for precision
3. **Access Control**: Admin endpoints restricted with `adminProcedure`
4. **Rate Limiting**: Consider rate limiting dashboard queries for large datasets
5. **Data Retention**: Comply with data retention regulations (GDPR, CCPA, etc.)

---

## Support

For questions or issues related to security logging:
- Review existing audit logs in database
- Check security event enums for available types
- Verify user has appropriate permissions for admin endpoints
- Monitor application logs for security logging errors
