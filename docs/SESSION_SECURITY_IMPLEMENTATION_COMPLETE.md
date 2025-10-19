# Session Security Implementation - Complete

**Implementation Date:** October 19, 2025  
**Status:** ✅ Complete

## Overview

Comprehensive session security system that implements concurrent session limits, automatic timeout, session management UI, step-up authentication for sensitive actions, and mandatory 2FA enforcement for critical operations.

## Features Implemented

### 1. ✅ Session Tracking & Management

- **Enhanced Session Model** with metadata tracking:
  - IP address and geolocation
  - User agent and device fingerprinting
  - Device name extraction (iPhone, Mac, Chrome, etc.)
  - Last activity timestamp
  - Creation timestamp
  - Revocation tracking (timestamp and reason)

- **Session Activity Monitoring:**
  - Automatic last activity updates on user interaction
  - Inactivity detection and timeout enforcement
  - Session expiration warnings

### 2. ✅ Concurrent Session Limits

- **Configurable per-user limits** (default: 5 devices)
- **Automatic enforcement** via database trigger
- **Oldest session revocation** when limit exceeded
- **User-configurable** maximum sessions

### 3. ✅ Session Management API

**tRPC Endpoints:**
- `session.getSessions` - List all active sessions with details
- `session.getSessionWarnings` - Get warnings (timeout, limit reached)
- `session.revokeSession` - Revoke a specific session
- `session.revokeAllOtherSessions` - Logout from all other devices
- `session.revokeAllSessions` - Logout from all devices (including current)
- `session.getSessionsByDevice` - Statistics by device type
- `session.updateActivity` - Manual activity heartbeat

### 4. ✅ Automatic Session Timeout

- **Configurable per-user timeout** (default: 24 hours)
- **Activity-based timeout** - any user interaction resets timer
- **Background job** (`session-cleanup.job.ts`) runs every 6 hours:
  - Deletes expired sessions
  - Revokes inactive sessions based on user settings
  - Archives old revoked sessions (30+ days)

### 5. ✅ Session Invalidation on Password Change

- **Automatic revocation** of all sessions on password change
- **User choice** to keep current session active or logout completely
- **Remember-me token revocation** for enhanced security
- **Trusted device revocation** to require re-authentication
- **Email notification** sent to user about password change

### 6. ✅ Two-Factor Authentication Enforcement

**Mandatory 2FA for sensitive actions:**
- Password changes
- Email address changes
- Security settings modifications
- Account deletion

**Implementation:**
- Checks if user has 2FA enabled
- Requires recent 2FA verification (within 15 minutes)
- If no recent verification, requires new 2FA challenge
- Logs all sensitive action attempts

**2FA Challenge Flow:**
1. Action requested → Check 2FA requirement
2. If needed → Create temporary auth token
3. User verifies with TOTP/SMS code
4. Token consumed → Action proceeds
5. Grace period active for 15 minutes

### 7. ✅ Step-Up Authentication for Admin Actions

**Step-up required for:**
- Admin operations
- Role changes
- Payment settings modifications
- Other elevated privilege actions

**Features:**
- Temporary elevated permission tokens (10-minute lifetime)
- Action-specific authorization
- One-time use tokens
- Comprehensive audit logging

**Step-Up Token Model:**
- Token hash (SHA-256)
- Action type restriction
- Elevated permissions array
- Expiration enforcement
- Usage tracking

### 8. ✅ Sensitive Action Logging

**Comprehensive audit trail:**
- Action type and details
- Whether 2FA was required
- Whether step-up was required
- Verification method used
- Success/failure with reasons
- IP address and user agent
- Timestamp

**Query capabilities:**
- By user and date range
- By action type
- By success/failure
- Recent verification checking

## Database Schema

### Session Table Extensions

```sql
ALTER TABLE sessions ADD COLUMN:
- ip_address VARCHAR(45)
- user_agent TEXT
- device_name VARCHAR(255)
- device_fingerprint VARCHAR(255)
- last_activity_at TIMESTAMPTZ
- created_at TIMESTAMPTZ
- revoked_at TIMESTAMPTZ
- revoked_reason VARCHAR(100)
```

### New Tables

#### step_up_tokens
```sql
CREATE TABLE step_up_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  token_hash TEXT UNIQUE,
  action_type VARCHAR(50),
  elevated_permissions TEXT[],
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### sensitive_action_logs
```sql
CREATE TABLE sensitive_action_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action_type VARCHAR(50),
  action_details JSONB,
  required_2fa BOOLEAN,
  required_step_up BOOLEAN,
  verification_method VARCHAR(20),
  ip_address VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN,
  failure_reason VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### User Table Extensions

```sql
ALTER TABLE users ADD COLUMN:
- max_concurrent_sessions INT DEFAULT 5
- auto_logout_after_hours INT DEFAULT 24
```

## Database Functions

### cleanup_inactive_sessions()
Marks sessions as revoked if inactive beyond user's configured timeout.

### enforce_session_limit()
Trigger function that automatically revokes oldest session when limit exceeded.

### revoke_all_user_sessions(user_id, reason, except_session_id)
Bulk revoke all sessions for a user with optional exception.

## Services Implemented

### 1. SessionManagementService
`src/lib/services/session-management.service.ts`

**Methods:**
- `getUserSessions()` - Get all active sessions
- `updateSessionActivity()` - Update last activity
- `revokeSession()` - Revoke specific session
- `revokeAllUserSessions()` - Bulk revoke
- `revokeSessionsOnPasswordChange()` - Password change revocation
- `checkSessionLimit()` - Check if at limit
- `cleanupInactiveSessions()` - Cleanup for user
- `cleanupAllInactiveSessions()` - Cleanup all users
- `getSessionWarnings()` - Get timeout/limit warnings
- `enrichSessionMetadata()` - Add tracking data
- `extractDeviceName()` - Parse device from UA
- `getSessionsByDevice()` - Device statistics
- `validateSession()` - Check if still active
- `getSessionDetails()` - Get session info

### 2. StepUpAuthService
`src/lib/services/step-up-auth.service.ts`

**Methods:**
- `createStepUpToken()` - Create elevated permission token
- `verifyStepUpToken()` - Verify and consume token
- `hasRecent2FA()` - Check for recent 2FA verification
- `requiresStepUp()` - Determine if step-up needed
- `logSensitiveAction()` - Audit log entry
- `cleanupExpiredTokens()` - Remove expired tokens
- `getActiveStepUpTokens()` - List active tokens
- `revokeAllUserTokens()` - Revoke all for user

### 3. Sensitive Action Middleware
`src/lib/middleware/sensitive-action.middleware.ts`

**Functions:**
- `requireSensitiveAction()` - Enforce authentication requirements
- `check2FARequirement()` - Determine if 2FA needed
- `create2FAChallenge()` - Initiate 2FA for action
- `verify2FAChallenge()` - Verify 2FA code for action

## Background Jobs

### session-cleanup.job.ts
**Schedule:** Every 6 hours
**Tasks:**
1. Delete expired sessions (past `expires` date)
2. Revoke inactive sessions (past user's timeout)
3. Delete old revoked sessions (30+ days old)

### step-up-token-cleanup.job.ts
**Schedule:** Every hour
**Tasks:**
1. Delete expired step-up tokens

## Usage Examples

### 1. Enforce 2FA on Password Change

```typescript
import { requireSensitiveAction } from '@/lib/middleware/sensitive-action.middleware';

async function changePassword(userId: string, newPassword: string, ctx: Context) {
  // This will throw if 2FA verification is required but missing
  await requireSensitiveAction(
    {
      userId,
      email: ctx.user.email,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      sessionToken: ctx.sessionToken,
    },
    {
      actionType: 'password_change',
      requires2FA: true,
    }
  );

  // Proceed with password change
  await authService.changePassword(userId, {
    currentPassword,
    newPassword,
    keepCurrentSession: true, // Optional
    currentSessionToken: ctx.sessionToken,
  });
}
```

### 2. List User Sessions

```typescript
// Frontend call
const { data } = await trpc.session.getSessions.query();

console.log(data.sessions);
// [
//   {
//     id: "session_123",
//     deviceName: "iPhone",
//     ipAddress: "192.168.1.1",
//     lastActivityAt: "2025-10-19T10:30:00Z",
//     isCurrent: true
//   },
//   ...
// ]
```

### 3. Revoke All Other Sessions

```typescript
// User wants to logout from all other devices
const { data } = await trpc.session.revokeAllOtherSessions.mutate();

console.log(data.message);
// "Successfully logged out of 3 other session(s)"
```

### 4. Create Step-Up Token for Admin Action

```typescript
import { stepUpAuthService } from '@/lib/services/step-up-auth.service';

// Create token for role change
const { token, expiresAt } = await stepUpAuthService.createStepUpToken(
  userId,
  'role_change',
  ['manage_users', 'assign_roles'],
  { ipAddress, userAgent }
);

// Return token to user, they must re-authenticate
return { stepUpToken: token, expiresAt };
```

### 5. Verify Step-Up Token

```typescript
// User re-authenticated and provided token
const verification = await stepUpAuthService.verifyStepUpToken(
  stepUpToken,
  'role_change'
);

// Token is valid, proceed with admin action
await assignRole(userId, newRole);
```

## Frontend Integration

### Session Management UI

**Display Active Sessions:**
```typescript
const SessionsPage = () => {
  const { data } = trpc.session.getSessions.useQuery();

  return (
    <div>
      <h2>Active Sessions ({data?.totalCount})</h2>
      {data?.sessions.map(session => (
        <SessionCard
          key={session.id}
          deviceName={session.deviceName}
          ipAddress={session.ipAddress}
          lastActive={session.lastActivityAt}
          isCurrent={session.isCurrent}
          onRevoke={() => revokeSession(session.id)}
        />
      ))}
      <Button onClick={() => revokeAllOthers()}>
        Logout From All Other Devices
      </Button>
    </div>
  );
};
```

### Session Activity Heartbeat

```typescript
// Update activity every 5 minutes if user is active
useEffect(() => {
  const interval = setInterval(() => {
    if (isUserActive()) {
      trpc.session.updateActivity.mutate();
    }
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, []);
```

### Session Timeout Warning

```typescript
const { data: warnings } = trpc.session.getSessionWarnings.useQuery();

{warnings?.warnings.map(warning => (
  warning.warningType === 'approaching_timeout' && (
    <Alert>
      {warning.message}
      <Button onClick={() => updateActivity()}>
        Stay Logged In
      </Button>
    </Alert>
  )
))}
```

### 2FA Challenge for Sensitive Action

```typescript
const changePassword = async (currentPassword: string, newPassword: string) => {
  try {
    // Attempt password change
    await trpc.auth.changePassword.mutate({
      currentPassword,
      newPassword,
    });
  } catch (error) {
    if (error.cause?.errorCode === '2FA_REQUIRED') {
      // Show 2FA modal
      const code = await prompt2FA();
      
      // Create challenge
      const { challengeId } = await trpc.auth.create2FAChallenge.mutate({
        actionType: 'password_change',
      });
      
      // Verify challenge
      await trpc.auth.verify2FAChallenge.mutate({
        challengeId,
        code,
      });
      
      // Retry password change
      await trpc.auth.changePassword.mutate({
        currentPassword,
        newPassword,
      });
    }
  }
};
```

## Security Considerations

### 1. Session Token Security
- Session tokens stored in HTTP-only cookies
- Secure flag enforced in production
- SameSite=Lax for CSRF protection

### 2. Device Fingerprinting
- Browser and OS detection from User-Agent
- IP address tracking for anomaly detection
- Optional client-side fingerprinting for enhanced security

### 3. Revocation Tracking
- All revocations logged with reason
- Audit trail maintained for 30 days
- User notified of security-related revocations

### 4. Step-Up Tokens
- Cryptographically secure (32 bytes)
- SHA-256 hashing for storage
- Single-use enforcement
- Short expiration (10 minutes)

### 5. 2FA Grace Period
- 15-minute window for multiple sensitive actions
- Resets on new verification
- Configurable per-action type

## Testing

### Session Limit Enforcement

```bash
# Login from 6 devices - should revoke oldest
for i in {1..6}; do
  curl -X POST /api/auth/signin \
    -H "User-Agent: Device-$i" \
    -d '{"email":"test@example.com","password":"password"}'
done

# Check sessions - should only have 5
curl /api/trpc/session.getSessions
```

### Inactivity Timeout

```sql
-- Manually set last activity to 25 hours ago
UPDATE sessions 
SET last_activity_at = NOW() - INTERVAL '25 hours'
WHERE user_id = 'test_user_id';

-- Run cleanup job
-- Session should be revoked

SELECT * FROM sessions WHERE user_id = 'test_user_id';
-- revoked_at should be set
-- revoked_reason should be 'inactivity_timeout'
```

### Password Change Session Revocation

```bash
# Login from 3 devices
# Change password from device 1, keep current session
curl -X POST /api/trpc/auth.changePassword \
  -d '{"currentPassword":"old","newPassword":"new123!@#ABC","keepCurrentSession":true}'

# Check sessions - device 1 should still be active
# Devices 2 and 3 should be revoked
```

### 2FA Enforcement

```bash
# User with 2FA enabled attempts password change without recent verification
curl -X POST /api/trpc/auth.changePassword \
  -d '{"currentPassword":"old","newPassword":"new"}'

# Should return error:
# { "errorCode": "2FA_REQUIRED", "message": "..." }

# Create challenge
curl -X POST /api/trpc/auth.create2FAChallenge \
  -d '{"actionType":"password_change"}'

# Verify with TOTP
curl -X POST /api/trpc/auth.verify2FAChallenge \
  -d '{"challengeId":"...","code":"123456"}'

# Retry password change - should succeed
```

## Configuration

### Environment Variables

```env
# Session Configuration (optional - defaults applied)
MAX_CONCURRENT_SESSIONS=5
AUTO_LOGOUT_HOURS=24
STEP_UP_TOKEN_EXPIRY_MINUTES=10
TWO_FA_GRACE_PERIOD_MINUTES=15
```

### Per-User Configuration

```sql
-- Increase session limit for specific user
UPDATE users 
SET max_concurrent_sessions = 10
WHERE id = 'user_id';

-- Change inactivity timeout
UPDATE users 
SET auto_logout_after_hours = 48
WHERE id = 'user_id';
```

## Migration

To apply to existing database:

```bash
# Apply migration
psql $DATABASE_URL -f prisma/migrations/020_session_security_enhancements.sql

# Generate Prisma client
npx prisma generate

# Restart application
```

## Monitoring

### Key Metrics

```sql
-- Active sessions per user
SELECT user_id, COUNT(*) as session_count
FROM sessions
WHERE revoked_at IS NULL AND expires > NOW()
GROUP BY user_id
ORDER BY session_count DESC;

-- Session revocation reasons
SELECT revoked_reason, COUNT(*) as count
FROM sessions
WHERE revoked_at IS NOT NULL
GROUP BY revoked_reason;

-- Sensitive actions requiring 2FA
SELECT action_type, COUNT(*) as count
FROM sensitive_action_logs
WHERE required_2fa = true
GROUP BY action_type;

-- Failed sensitive actions
SELECT action_type, failure_reason, COUNT(*) as count
FROM sensitive_action_logs
WHERE success = false
GROUP BY action_type, failure_reason;
```

## Future Enhancements

### Potential Improvements

1. **Geo-based Alerts** - Notify users of logins from new countries
2. **Device Trust Levels** - Different security for trusted vs. unknown devices
3. **Adaptive Timeouts** - Adjust timeout based on user behavior patterns
4. **Session Pause** - Allow users to pause inactive sessions
5. **Push Notifications** - Real-time alerts for new sessions
6. **Browser Extensions** - Enhanced device fingerprinting
7. **WebAuthn Support** - Hardware security keys for step-up auth
8. **Risk-Based Authentication** - Dynamic security requirements

## Troubleshooting

### Session Cleanup Not Working

```bash
# Check if job is running
# Look for session-cleanup in job logs

# Manually trigger cleanup
npx ts-node -e "
import { processSessionCleanup } from './src/jobs/session-cleanup.job';
processSessionCleanup({ log: console.log } as any);
"
```

### User Can't Login (Session Limit)

```sql
-- Check current sessions
SELECT * FROM sessions 
WHERE user_id = 'user_id' AND revoked_at IS NULL;

-- Manually revoke oldest
UPDATE sessions 
SET revoked_at = NOW(), revoked_reason = 'manual_admin_revoke'
WHERE id = 'oldest_session_id';
```

### 2FA Bypass Not Working

```sql
-- Check recent 2FA verifications
SELECT * FROM sensitive_action_logs
WHERE user_id = 'user_id'
  AND required_2fa = true
  AND success = true
  AND created_at > NOW() - INTERVAL '15 minutes';
```

## Complete Implementation Checklist

- [x] Extended Session table with tracking metadata
- [x] Added session limit fields to User table
- [x] Created StepUpToken table
- [x] Created SensitiveActionLog table
- [x] Implemented database functions and triggers
- [x] Created SessionManagementService
- [x] Created StepUpAuthService
- [x] Created sensitive action middleware
- [x] Updated AuthService.changePassword with session revocation
- [x] Created session management tRPC router
- [x] Updated session cleanup job
- [x] Created step-up token cleanup job
- [x] Applied database migration
- [x] Generated Prisma client
- [x] Added comprehensive documentation

## Summary

This implementation provides enterprise-grade session security with:
- Multi-device session tracking and management
- Automatic enforcement of concurrent session limits
- Configurable inactivity timeouts
- Complete session revocation on password change
- Mandatory 2FA for sensitive actions
- Step-up authentication for admin operations
- Comprehensive audit logging
- User-friendly session management UI

All security best practices followed with proper token handling, cryptographic security, and comprehensive audit trails.
