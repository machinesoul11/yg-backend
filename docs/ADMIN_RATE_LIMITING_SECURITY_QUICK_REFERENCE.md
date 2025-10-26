# Admin Rate Limiting & Security - Quick Reference

## Import Statements

```typescript
// Services
import { adminRateLimitService } from '@/lib/services/admin-rate-limit.service';
import { AdminSessionSecurityService } from '@/lib/services/admin-session-security.service';
import { AdminSecurityMonitoringService } from '@/lib/services/admin-security-monitoring.service';

// Middleware
import {
  withRoleManagementRateLimit,
  withApprovalActionRateLimit,
  withReadOperationRateLimit,
  checkAdminSessionTimeout,
  requireRecent2FA,
  logApprovalAction,
  securityMonitoringService,
} from '@/lib/middleware';

// Router
import { adminSecurityRouter } from '@/lib/api/routers/admin-security.router';
```

---

## Rate Limiting

### Apply to tRPC Endpoints

```typescript
// Role management (10/hour)
createRole: adminProcedure
  .use(withRoleManagementRateLimit)
  .mutation(...)

// Approval actions (50/hour)  
approveCreator: adminProcedure
  .use(withApprovalActionRateLimit)
  .mutation(...)

// Read operations (500/hour)
listUsers: adminProcedure
  .use(withReadOperationRateLimit)
  .query(...)
```

### Direct Service Usage

```typescript
// Check limit
const result = await adminRateLimitService.checkLimit(userId, 'role_management');

// Get status
const status = await adminRateLimitService.getAllTierStatus(userId);

// Reset
await adminRateLimitService.reset(userId, 'approval_actions');
```

---

## Session Security

### Apply Timeout Middleware

```typescript
const endpoint = adminProcedure
  .use(checkAdminSessionTimeout)
  .query(...)
```

### Check Session Status

```typescript
const adminSessionService = new AdminSessionSecurityService(prisma);

const status = await adminSessionService.checkAdminSession(userId, sessionToken);
// { isActive, lastActivityAt, timeUntilTimeout, requiresReauth }
```

### Get Active Sessions

```typescript
const sessions = await adminSessionService.getActiveAdminSessions(userId);
```

### Revoke Session

```typescript
await adminSessionService.revokeAdminSession(sessionToken, 'reason');
```

---

## Re-Authentication

### Request Elevated Token

```typescript
const result = await adminSessionService.requireReauthentication(
  userId,
  password,
  'role_change' // operation type
);
// { success, elevatedToken, expiresAt }
```

### Verify & Use Token

```typescript
// Verify
const isValid = await adminSessionService.verifyElevatedToken(
  token,
  userId,
  'role_change'
);

// Consume (one-time use)
await adminSessionService.consumeElevatedToken(token);
```

### tRPC Endpoint Example

```typescript
sensitiveOperation: adminProcedure
  .input(z.object({
    elevatedToken: z.string(),
    // ... other inputs
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
        message: 'Re-authentication required',
      });
    }
    
    // Consume token
    await adminSessionService.consumeElevatedToken(input.elevatedToken);
    
    // Perform operation
    // ...
  }),
```

---

## 2FA Enforcement

### Check 2FA Requirement

```typescript
const requires2FA = await adminSessionService.requires2FA(userId);
const hasRecent = await adminSessionService.hasRecent2FAVerification(userId);
```

### Apply Middleware

```typescript
sensitiveEndpoint: adminProcedure
  .use(requireRecent2FA)
  .mutation(...)
```

### Mark as Verified

```typescript
// After successful 2FA verification
await adminSessionService.mark2FAVerified(userId);
```

---

## Security Monitoring

### Log Permission Violation

```typescript
await securityMonitoringService.logPermissionViolation({
  userId,
  email,
  attemptedPermission: 'users.delete',
  resourceType: 'user',
  resourceId: 'user_123',
  ipAddress,
  userAgent,
  timestamp: new Date(),
});
```

### Track Approval Action

```typescript
await securityMonitoringService.trackApprovalAction(
  adminId,
  'creator', // resource type
  creatorId,
  { metadata: 'optional' }
);
```

### Track Escalation Attempt

```typescript
await securityMonitoringService.trackPermissionEscalation({
  userId,
  currentRole: 'CREATOR',
  attemptedRole: 'ADMIN',
  attemptedPermissions: ['admin.roles'],
  timestamp: new Date(),
  context: 'Attempted to modify own role',
});
```

### Get Dashboard Metrics

```typescript
const dashboard = await securityMonitoringService.getDashboardMetrics();
```

### Acknowledge Alert

```typescript
await securityMonitoringService.acknowledgeAlert(alertId, acknowledgedBy);
```

---

## tRPC Router Endpoints

```typescript
// Get security dashboard
trpc.adminSecurity.getDashboardMetrics.query()

// Get rate limit status
trpc.adminSecurity.getRateLimitStatus.query()

// Get session status
trpc.adminSecurity.getSessionStatus.query()

// Get active sessions
trpc.adminSecurity.getActiveSessions.query()

// Revoke session
trpc.adminSecurity.revokeSession.mutate({ sessionToken })

// Request elevated token
trpc.adminSecurity.requestElevatedToken.mutate({
  password,
  operationType: 'role_change'
})

// Verify elevated token
trpc.adminSecurity.verifyElevatedToken.query({
  token,
  operationType: 'role_change'
})

// Consume elevated token
trpc.adminSecurity.consumeElevatedToken.mutate({ token })

// Check 2FA requirement
trpc.adminSecurity.check2FARequirement.query()

// Mark 2FA verified
trpc.adminSecurity.mark2FAVerified.mutate()

// Acknowledge alert
trpc.adminSecurity.acknowledgeAlert.mutate({ alertId })
```

---

## Background Jobs

### Schedule Admin Session Cleanup

```typescript
import { scheduleAdminSessionCleanup } from '@/lib/jobs/admin-session-cleanup.job';

// On app startup
await scheduleAdminSessionCleanup();
```

### Manual Trigger

```typescript
import { triggerAdminSessionCleanup } from '@/lib/jobs/admin-session-cleanup.job';

await triggerAdminSessionCleanup();
```

---

## Error Codes

### Rate Limit Exceeded

```json
{
  "code": "TOO_MANY_REQUESTS",
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
```

### Session Timeout

```json
{
  "code": "UNAUTHORIZED",
  "cause": {
    "errorCode": "SESSION_TIMEOUT",
    "requiresLogin": true
  }
}
```

### 2FA Required

```json
{
  "code": "FORBIDDEN",
  "cause": {
    "errorCode": "2FA_REQUIRED",
    "requiresVerification": true
  }
}
```

---

## Rate Limit Tiers

| Tier | Limit | Window | Applies To |
|------|-------|--------|------------|
| `role_management` | 10 | 1 hour | Role changes, permission grants |
| `approval_actions` | 50 | 1 hour | Approvals, verifications |
| `read_operations` | 500 | 1 hour | List views, data reads |

---

## Security Alert Severities

- **CRITICAL** - Escalation attempts, suspected compromise
- **HIGH** - Rapid violations, mass approvals
- **MEDIUM** - Repeated violations, unusual patterns
- **LOW** - Off-hours activity, minor anomalies

---

## Sensitive Operation Types

- `role_change` - Changing user roles
- `permission_grant` - Granting permissions
- `user_deletion` - Deleting users
- `data_export` - Exporting sensitive data
- `system_config` - System configuration
- `security_settings` - Security settings

---

## Redis Keys

```
ratelimit:admin:{tier}:{userId}
security:violations:{userId}:{date}
security:approvals:{adminId}:{date}
security:escalation:{userId}:{date}
security:alerts:{severity}:{alertId}
session:admin:elevated:{token}
session:admin:2fa-verified:{userId}
session:admin:update:{sessionToken}
```

---

## Configuration Values

- Admin session timeout: **30 minutes**
- Elevated token lifetime: **5 minutes**
- 2FA grace period: **15 minutes**
- Activity update throttle: **1 minute**
- Session cleanup interval: **5 minutes**
- Alert retention: **7 days**

---

## Common Patterns

### Secure Admin Endpoint

```typescript
secureEndpoint: adminProcedure
  .use(withRoleManagementRateLimit)
  .use(checkAdminSessionTimeout)
  .use(requireRecent2FA)
  .input(z.object({
    elevatedToken: z.string(),
    // ...
  }))
  .mutation(async ({ input, ctx }) => {
    // Verify elevated token
    const isValid = await adminSessionService.verifyElevatedToken(
      input.elevatedToken,
      ctx.session.user.id,
      'role_change'
    );
    
    if (!isValid) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    
    await adminSessionService.consumeElevatedToken(input.elevatedToken);
    
    // Perform operation
    // ...
    
    // Log action
    await logApprovalAction(ctx, 'role', roleId);
  }),
```

### Frontend Re-Auth Flow

```typescript
async function performSensitiveAction() {
  try {
    // Attempt action
    await trpc.admin.sensitiveOperation.mutate({ data });
  } catch (error) {
    if (error.cause?.errorCode === '2FA_REQUIRED') {
      // Show 2FA modal
      const code = await prompt2FA();
      await verify2FA(code);
      // Retry
      await performSensitiveAction();
    } else if (error.message.includes('Re-authentication required')) {
      // Show password prompt
      const password = await promptPassword();
      const { elevatedToken } = await trpc.adminSecurity.requestElevatedToken.mutate({
        password,
        operationType: 'role_change',
      });
      // Retry with token
      await trpc.admin.sensitiveOperation.mutate({ data, elevatedToken });
    }
  }
}
```

---

**For complete documentation, see:** `docs/ADMIN_RATE_LIMITING_SECURITY_IMPLEMENTATION.md`
