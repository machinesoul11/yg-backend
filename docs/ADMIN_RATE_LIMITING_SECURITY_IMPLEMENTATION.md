# Admin Rate Limiting & Security Enhancements - Implementation Complete

## Overview

Comprehensive security enhancements for administrative operations including distributed rate limiting, security monitoring, session security, and re-authentication for sensitive operations.

---

## 1. Admin Endpoint Rate Limiting

### Implementation

**Service:** `src/lib/services/admin-rate-limit.service.ts`

Uses Redis-backed sliding window algorithm for distributed rate limiting across multiple server instances.

### Rate Limit Tiers

| Tier | Limit | Window | Use Case |
|------|-------|--------|----------|
| `role_management` | 10 requests | 1 hour | Role changes, permission grants |
| `approval_actions` | 50 requests | 1 hour | Approving creators, brands, content |
| `read_operations` | 500 requests | 1 hour | Viewing lists, reading data |

### Usage in tRPC Routers

```typescript
import { withRoleManagementRateLimit, withApprovalActionRateLimit, withReadOperationRateLimit } from '@/lib/middleware';

// Role management endpoint (10/hour)
createAdminRole: protectedProcedure
  .use(withRoleManagementRateLimit)
  .input(createAdminRoleSchema)
  .mutation(async ({ input, ctx }) => {
    // ...
  }),

// Approval action endpoint (50/hour)
approveCreator: adminProcedure
  .use(withApprovalActionRateLimit)
  .input(z.object({ creatorId: z.string() }))
  .mutation(async ({ input }) => {
    // ...
  }),

// Read operation endpoint (500/hour)
listUsers: adminProcedure
  .use(withReadOperationRateLimit)
  .input(listUsersSchema)
  .query(async ({ input }) => {
    // ...
  }),
```

### API Methods

```typescript
// Check rate limit
const result = await adminRateLimitService.checkLimit(userId, 'role_management');

// Check and throw if exceeded
await adminRateLimitService.checkLimitOrThrow(userId, 'approval_actions');

// Get current count
const count = await adminRateLimitService.getCurrentCount(userId, 'read_operations');

// Reset for user
await adminRateLimitService.reset(userId, 'role_management');

// Get all tier status
const status = await adminRateLimitService.getAllTierStatus(userId);
```

### Error Response

When rate limit is exceeded:

```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Admin rate limit exceeded for role_management. Limit: 10/hour. Resets at 2025-10-25T15:00:00Z",
    "data": {
      "cause": {
        "rateLimitInfo": {
          "tier": "role_management",
          "limit": 10,
          "current": 11,
          "remaining": 0,
          "resetAt": "2025-10-25T15:00:00.000Z"
        }
      }
    }
  }
}
```

---

## 2. Security Monitoring

### Implementation

**Service:** `src/lib/services/admin-security-monitoring.service.ts`

Comprehensive security event tracking and anomaly detection.

### Features

#### Failed Permission Checks

Automatically logs all permission violations:

```typescript
await securityMonitoringService.logPermissionViolation({
  userId: 'user_123',
  email: 'user@example.com',
  attemptedPermission: 'users.delete',
  resourceType: 'user',
  resourceId: 'user_456',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  timestamp: new Date(),
});
```

**Alerts:**
- 5+ violations in 24 hours → Medium alert
- 10+ violations in 1 hour → High alert

#### Approval Pattern Monitoring

Tracks approval actions and detects anomalies:

```typescript
await securityMonitoringService.trackApprovalAction(
  'admin_123',
  'creator',
  'creator_456',
  { metadata: 'optional' }
);
```

**Anomaly Detection:**
- 20+ approvals in 1 hour → Unusual activity alert
- 5+ off-hours approvals (outside 9 AM - 6 PM UTC) → Low alert
- 10 rapid approvals in <2 minutes → High alert (possible automation)

#### Permission Escalation Tracking

Detects attempts to gain elevated permissions:

```typescript
await securityMonitoringService.trackPermissionEscalation({
  userId: 'user_123',
  currentRole: 'CREATOR',
  attemptedRole: 'ADMIN',
  attemptedPermissions: ['admin.roles', 'users.delete'],
  timestamp: new Date(),
  context: 'Attempted to modify own role',
});
```

**Always Critical Alert:** Any escalation attempt triggers immediate alert.

### Security Alerts

Alert Severity Levels:
- **LOW:** Off-hours activity, minor patterns
- **MEDIUM:** Repeated violations, unusual approval rates
- **HIGH:** Rapid violations, mass approvals
- **CRITICAL:** Escalation attempts, suspected compromise

Alerts are stored in Redis with 7-day retention and logged to audit trail.

### Security Dashboard

Get comprehensive security metrics:

```typescript
const dashboard = await securityMonitoringService.getDashboardMetrics();

// Returns:
{
  permissionViolations: {
    last24Hours: 15,
    last7Days: 42,
    byUser: [{ userId, email, count }],
    byPermission: [{ permission, count }],
  },
  approvalPatterns: {
    totalApprovals: 234,
    anomalousApprovals: 12,
    byAdmin: [{ adminId, email, count, anomalous }],
  },
  escalationAttempts: {
    last24Hours: 2,
    last7Days: 5,
    byUser: [{ userId, email, count }],
  },
  activeAlerts: {
    critical: 1,
    high: 3,
    medium: 8,
    low: 12,
  },
}
```

### Acknowledge Alerts

```typescript
await securityMonitoringService.acknowledgeAlert(alertId, acknowledgedBy);
```

---

## 3. Session Security for Admins

### Implementation

**Service:** `src/lib/services/admin-session-security.service.ts`

Enhanced session security specifically for administrative users.

### Features

#### 30-Minute Session Timeout

Admin sessions expire after 30 minutes of inactivity (vs standard user sessions).

```typescript
// Check admin session
const status = await adminSessionService.checkAdminSession(userId, sessionToken);

// Returns:
{
  isActive: true,
  lastActivityAt: Date,
  expiresAt: Date,
  timeUntilTimeout: 1200000, // milliseconds
  requiresReauth: false,
}
```

**Automatic Cleanup:** Background job runs every 5 minutes to revoke expired sessions.

#### Session Timeout Middleware

Apply to all admin procedures:

```typescript
import { checkAdminSessionTimeout } from '@/lib/middleware';

const adminEndpoint = adminProcedure
  .use(checkAdminSessionTimeout)
  .query(async ({ ctx }) => {
    // ctx.adminSession contains session status
  });
```

**Timeout Error:**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Admin session has expired due to inactivity",
    "data": {
      "cause": {
        "errorCode": "SESSION_TIMEOUT",
        "reason": "Admin session timed out after 30 minutes of inactivity",
        "requiresLogin": true
      }
    }
  }
}
```

---

## 4. Re-Authentication for Sensitive Operations

### Implementation

Sensitive operations require password re-entry to get elevated session token.

### Sensitive Operation Types

- `role_change` - Changing user roles
- `permission_grant` - Granting permissions
- `user_deletion` - Deleting users
- `data_export` - Exporting sensitive data
- `system_config` - Changing system configuration
- `security_settings` - Modifying security settings

### Workflow

#### Step 1: Request Elevated Token

```typescript
const result = await adminSessionService.requireReauthentication(
  userId,
  password,
  'role_change'
);

// Returns:
{
  success: true,
  elevatedToken: 'abc123...',
  expiresAt: Date, // 5 minutes from now
}
```

#### Step 2: Verify Token Before Sensitive Operation

```typescript
const isValid = await adminSessionService.verifyElevatedToken(
  token,
  userId,
  'role_change'
);

if (!isValid) {
  throw new Error('Re-authentication required');
}
```

#### Step 3: Consume Token (Single Use)

```typescript
await adminSessionService.consumeElevatedToken(token);
```

### tRPC Example

```typescript
assignAdminRole: adminProcedure
  .input(z.object({
    userId: z.string(),
    roleId: z.string(),
    elevatedToken: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Verify elevated token
    const isValid = await adminSessionService.verifyElevatedToken(
      input.elevatedToken,
      ctx.session.user.id,
      'role_change'
    );

    if (!isValid) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Re-authentication required for role changes',
      });
    }

    // Consume token
    await adminSessionService.consumeElevatedToken(input.elevatedToken);

    // Perform sensitive operation
    await assignRole(input.userId, input.roleId);

    return { success: true };
  }),
```

---

## 5. 2FA Enforcement for Admin Actions

### Implementation

All admin actions require 2FA verification if user has 2FA enabled.

### Grace Period

After successful 2FA verification, there's a 15-minute grace period where additional verifications aren't required.

```typescript
// Check if recent 2FA verification exists
const hasRecent = await adminSessionService.hasRecent2FAVerification(userId);

// Mark 2FA as verified (after successful verification)
await adminSessionService.mark2FAVerified(userId);
```

### Middleware Usage

```typescript
import { requireRecent2FA } from '@/lib/middleware';

sensitiveEndpoint: adminProcedure
  .use(requireRecent2FA)
  .mutation(async ({ ctx }) => {
    // Will throw if 2FA required but not recently verified
  });
```

**2FA Required Error:**

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "2FA verification required",
    "data": {
      "cause": {
        "errorCode": "2FA_REQUIRED",
        "reason": "This sensitive operation requires recent 2FA verification",
        "requiresVerification": true
      }
    }
  }
}
```

---

## 6. Background Jobs

### Admin Session Cleanup

**File:** `src/lib/jobs/admin-session-cleanup.job.ts`

Automatically cleans up expired admin sessions every 5 minutes.

```typescript
import { scheduleAdminSessionCleanup } from '@/lib/jobs/admin-session-cleanup.job';

// Schedule on app startup
await scheduleAdminSessionCleanup();

// Manual trigger
await triggerAdminSessionCleanup();
```

---

## 7. Admin Security Router

### tRPC Endpoints

**Router:** `src/lib/api/routers/admin-security.router.ts`

```typescript
// Get security dashboard
const dashboard = await trpc.adminSecurity.getDashboardMetrics.query();

// Get rate limit status
const limits = await trpc.adminSecurity.getRateLimitStatus.query();

// Get session status
const session = await trpc.adminSecurity.getSessionStatus.query();

// Get active sessions
const sessions = await trpc.adminSecurity.getActiveSessions.query();

// Revoke session
await trpc.adminSecurity.revokeSession.mutate({ sessionToken });

// Request elevated token
const { elevatedToken } = await trpc.adminSecurity.requestElevatedToken.mutate({
  password: 'current-password',
  operationType: 'role_change',
});

// Verify elevated token
const { valid } = await trpc.adminSecurity.verifyElevatedToken.query({
  token: elevatedToken,
  operationType: 'role_change',
});

// Consume token
await trpc.adminSecurity.consumeElevatedToken.mutate({ token: elevatedToken });

// Check 2FA requirement
const { requires2FA, hasRecent2FA } = await trpc.adminSecurity.check2FARequirement.query();

// Mark 2FA verified
await trpc.adminSecurity.mark2FAVerified.mutate();

// Acknowledge alert
await trpc.adminSecurity.acknowledgeAlert.mutate({ alertId });
```

---

## 8. Integration with Existing Systems

### Audit Logging

All security events are logged to the existing audit system:
- Permission violations
- Approval actions
- Escalation attempts
- Session timeouts
- Re-authentication requests
- Alert acknowledgements

### Permission System

Integrates with existing permission service for violation logging.

### 2FA System

Leverages existing 2FA implementation (TOTP, SMS, backup codes).

### Session Management

Extends existing session management with admin-specific timeouts.

---

## 9. Security Best Practices

### Defense in Depth

Multiple layers of security:
1. Rate limiting prevents abuse
2. Security monitoring detects anomalies
3. Session timeouts limit exposure
4. Re-authentication protects critical operations
5. 2FA adds additional verification
6. Audit logging provides accountability

### Fail Securely

All services fail safely:
- If Redis is down, rate limiting logs error but allows request
- If monitoring fails, operation continues but logs error
- If session check fails, user is logged out (secure default)

### Graceful Degradation

Services degrade gracefully:
- Rate limiting: Fail open with logging
- Monitoring: Continue operation, log failure
- Session timeout: Strict enforcement
- 2FA: Required if enabled, no bypasses

---

## 10. Configuration

### Environment Variables

No additional environment variables required - uses existing:
- `REDIS_URL` - For rate limiting and session management
- Existing database configuration
- Existing Auth.js configuration

### Redis Keys

```
ratelimit:admin:role_management:{userId}
ratelimit:admin:approval_actions:{userId}
ratelimit:admin:read_operations:{userId}
security:violations:{userId}:{date}
security:approvals:{adminId}:{date}
security:escalation:{userId}:{date}
security:alerts:{severity}:{alertId}
session:admin:elevated:{token}
session:admin:2fa-verified:{userId}
session:admin:update:{sessionToken}
```

### TTLs

- Rate limit windows: 1 hour (3600s)
- Security violation tracking: 24 hours (86400s)
- Security alerts: 7 days (604800s)
- Elevated tokens: 5 minutes (300s)
- 2FA grace period: 15 minutes (900s)
- Activity update throttle: 1 minute (60s)

---

## 11. Monitoring & Alerts

### Console Logging

All services log to console:
- Rate limit violations
- Security alerts (WARNING level)
- Session timeouts
- Permission violations
- Approval anomalies

### Future Enhancements

Ready for integration with:
- Email notifications
- Slack alerts
- Sentry error tracking
- Custom alerting webhooks

---

## 12. Testing

### Manual Testing

```typescript
// Test rate limiting
for (let i = 0; i < 12; i++) {
  await trpc.roles.createAdminRole.mutate({ ... });
}
// Should fail on 11th attempt

// Test session timeout
// 1. Log in as admin
// 2. Wait 30 minutes
// 3. Make any admin request
// Should receive SESSION_TIMEOUT error

// Test re-authentication
const { elevatedToken } = await trpc.adminSecurity.requestElevatedToken.mutate({
  password: 'wrong-password',
  operationType: 'role_change',
});
// Should fail

// Test 2FA enforcement
// 1. Enable 2FA
// 2. Attempt sensitive operation without recent verification
// Should receive 2FA_REQUIRED error
```

---

## 13. Maintenance

### Background Jobs

Schedule on app startup:

```typescript
import { scheduleAdminSessionCleanup } from '@/lib/jobs/admin-session-cleanup.job';

// In your app initialization
await scheduleAdminSessionCleanup();
```

### Periodic Reviews

- Review security alerts weekly
- Analyze permission violation patterns monthly
- Audit rate limit configurations quarterly
- Review session timeout policies semi-annually

---

## 14. Summary

✅ **Admin Rate Limiting**
- Role management: 10/hour
- Approval actions: 50/hour
- Read operations: 500/hour
- Redis-backed distributed limiting

✅ **Security Monitoring**
- Permission violation logging
- Automated alert generation
- Approval pattern analysis
- Escalation attempt detection

✅ **Session Security**
- 30-minute admin timeouts
- Automatic session cleanup
- Activity-based expiration
- Multi-device management

✅ **Re-Authentication**
- Password confirmation for critical actions
- 5-minute elevated session tokens
- Single-use token consumption
- Operation-specific scoping

✅ **2FA Enforcement**
- Required for all admin actions
- 15-minute grace period
- Integration with existing 2FA
- Recent verification tracking

All features are production-ready, fully integrated with existing systems, and follow security best practices.
