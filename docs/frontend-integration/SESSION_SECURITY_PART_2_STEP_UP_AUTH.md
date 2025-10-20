# 🔒 Session Security Module - Part 2: Step-Up Authentication & 2FA Enforcement
## Frontend Integration Guide

**Classification:** ⚡ HYBRID - Core security used by both admin and public-facing  
**Backend Module:** Session Security  
**Last Updated:** October 20, 2025  
**Related Docs:** Part 1 (Session Management), Part 3 (Quick Reference)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [2FA Enforcement for Sensitive Actions](#2fa-enforcement-for-sensitive-actions)
3. [Step-Up Authentication](#step-up-authentication)
4. [Sensitive Action Logging](#sensitive-action-logging)
5. [TypeScript Type Definitions](#typescript-type-definitions)
6. [Error Handling](#error-handling)
7. [Complete Flow Examples](#complete-flow-examples)

---

## Overview

### What is Step-Up Authentication?

Step-up authentication requires users to **re-verify their identity** before performing sensitive actions, even if they're already logged in. This provides an additional layer of security for critical operations.

### What Actions Require Additional Verification?

| Action Type | Requires 2FA? | Requires Step-Up? | Grace Period |
|-------------|---------------|-------------------|--------------|
| **Password Change** | ✅ If 2FA enabled | ✅ Yes | 15 minutes |
| **Email Change** | ✅ If 2FA enabled | ✅ Yes | 15 minutes |
| **Security Settings** | ✅ If 2FA enabled | ✅ Yes | 15 minutes |
| **Account Deletion** | ✅ If 2FA enabled | ✅ Yes | 15 minutes |
| **Role Change** (Admin) | ❌ No | ✅ Yes | 10 minutes |
| **Admin Action** | ❌ No | ✅ Yes | 10 minutes |
| **Payment Settings** | ❌ No | ⚠️ Optional | None |

### Grace Periods

**2FA Grace Period (15 minutes):**
- After successful 2FA verification, user can perform multiple sensitive actions
- Grace period resets on each new verification
- Applies to: password change, email change, security settings, account deletion

**Step-Up Token Lifetime (10 minutes):**
- Temporary elevated permission token
- Single-use only
- Applies to: admin actions, role changes

---

## 2FA Enforcement for Sensitive Actions

### How It Works

1. **User attempts sensitive action** (e.g., change password)
2. **Backend checks:**
   - Is 2FA enabled for this user?
   - Has user verified 2FA in the last 15 minutes?
3. **If no recent 2FA:**
   - Backend returns `2FA_REQUIRED` error
   - Frontend shows 2FA challenge modal
   - User enters TOTP code
   - Action proceeds after verification

### Error Response Format

When 2FA is required but missing:

```typescript
{
  error: {
    code: "FORBIDDEN",
    message: "2FA_REQUIRED",
    data: {
      cause: {
        errorCode: "2FA_REQUIRED",
        message: "This action requires two-factor authentication verification",
        action: "password_change"  // The action that was attempted
      }
    }
  }
}
```

---

### Frontend Flow

#### Step 1: Attempt Sensitive Action

```typescript
const changePassword = async (currentPassword: string, newPassword: string) => {
  try {
    // Attempt password change
    await trpc.auth.changePassword.mutate({
      currentPassword,
      newPassword,
      keepCurrentSession: true,
    });
    
    toast.success('Password changed successfully');
    
  } catch (error) {
    if (error.data?.cause?.errorCode === '2FA_REQUIRED') {
      // Show 2FA challenge modal
      await handle2FAChallenge('password_change', () => {
        // Retry after successful 2FA
        return trpc.auth.changePassword.mutate({
          currentPassword,
          newPassword,
          keepCurrentSession: true,
        });
      });
    } else {
      toast.error(error.message || 'Failed to change password');
    }
  }
};
```

#### Step 2: Handle 2FA Challenge

```typescript
const handle2FAChallenge = async (
  actionType: SensitiveActionType,
  retryAction: () => Promise<any>
) => {
  // Open modal asking for 2FA code
  const modal = open2FAModal({
    title: 'Verify Your Identity',
    message: 'Enter your 2FA code to continue',
    actionType,
  });
  
  modal.onSubmit = async (code: string) => {
    try {
      // Create challenge
      const challenge = await trpc.auth.create2FAChallenge.mutate({
        actionType,
      });
      
      // Verify the code
      await trpc.auth.verify2FAChallenge.mutate({
        challengeId: challenge.data.challengeId,
        code,
      });
      
      // Retry the original action
      await retryAction();
      
      modal.close();
      toast.success('Action completed successfully');
      
    } catch (error) {
      if (error.data?.cause?.errorCode === 'INVALID_2FA_CODE') {
        modal.showError('Invalid code. Please try again.');
      } else if (error.data?.cause?.errorCode === 'CHALLENGE_EXPIRED') {
        modal.showError('Challenge expired. Please start over.');
        modal.close();
      } else {
        toast.error('Verification failed');
        modal.close();
      }
    }
  };
};
```

---

### TypeScript Types for 2FA Challenge

```typescript
/**
 * Sensitive action types that may require 2FA
 */
export type SensitiveActionType =
  | 'password_change'
  | 'email_change'
  | 'admin_action'
  | 'role_change'
  | 'security_settings'
  | 'payment_settings'
  | 'account_deletion';

/**
 * Request to create 2FA challenge
 */
export interface Create2FAChallengeRequest {
  actionType: SensitiveActionType;
}

/**
 * Response from creating 2FA challenge
 */
export interface Create2FAChallengeResponse {
  success: true;
  data: {
    challengeId: string;    // Temporary token ID
    expiresAt: Date;        // Challenge expires at (5 minutes)
    method: '2FA_TOTP' | '2FA_SMS';  // Which 2FA method to use
  };
}

/**
 * Request to verify 2FA challenge
 */
export interface Verify2FAChallengeRequest {
  challengeId: string;      // From create2FAChallenge
  code: string;             // 6-digit TOTP code
}

/**
 * Response from verifying 2FA challenge
 */
export interface Verify2FAChallengeResponse {
  success: true;
  data: {
    userId: string;
    verified: boolean;
    gracePeriodUntil: Date;  // Can skip 2FA until this time
  };
}
```

---

### Endpoints

These endpoints are part of the auth module but are used for session security:

#### Create 2FA Challenge

**Endpoint:** `auth.create2FAChallenge`  
**Method:** `mutation` (POST)  
**Access:** 🌐 Authenticated user

```typescript
const { mutate } = trpc.auth.create2FAChallenge.useMutation();

const challenge = await mutate({
  actionType: 'password_change'
});

// Returns:
// {
//   success: true,
//   data: {
//     challengeId: "tmp_abc123",
//     expiresAt: "2025-10-20T15:35:00Z",
//     method: "2FA_TOTP"
//   }
// }
```

#### Verify 2FA Challenge

**Endpoint:** `auth.verify2FAChallenge`  
**Method:** `mutation` (POST)  
**Access:** 🌐 Authenticated user

```typescript
const { mutate } = trpc.auth.verify2FAChallenge.useMutation();

const result = await mutate({
  challengeId: "tmp_abc123",
  code: "123456"
});

// Returns:
// {
//   success: true,
//   data: {
//     userId: "user_123",
//     verified: true,
//     gracePeriodUntil: "2025-10-20T15:50:00Z"
//   }
// }
```

---

## Step-Up Authentication

### When Step-Up is Required

Step-up authentication is required when:
- User with 2FA enabled performs sensitive action WITHOUT recent 2FA
- Admin performs privileged operations (role changes, admin actions)
- User attempts security-critical operations

### Step-Up Token Flow

Unlike 2FA challenges (which verify codes), step-up tokens are granted AFTER verification.

```
┌─────────────────────────────────────────────────────────────┐
│  1. User attempts admin action                              │
│  2. Backend: "Step-up required"                             │
│  3. Frontend: Redirect to re-authentication page            │
│  4. User enters password again                              │
│  5. Backend: Creates step-up token                          │
│  6. Frontend: Include token in original request             │
│  7. Backend: Verifies token and completes action            │
│  8. Token is consumed (single-use)                          │
└─────────────────────────────────────────────────────────────┘
```

### Error Response Format

When step-up is required:

```typescript
{
  error: {
    code: "FORBIDDEN",
    message: "STEP_UP_REQUIRED",
    data: {
      cause: {
        errorCode: "STEP_UP_REQUIRED",
        message: "This action requires re-authentication",
        action: "role_change",
        reason: "admin_action"
      }
    }
  }
}
```

---

### Frontend Implementation

#### Step 1: Detect Step-Up Requirement

```typescript
const changeUserRole = async (userId: string, newRole: UserRole) => {
  try {
    await trpc.admin.changeUserRole.mutate({
      userId,
      newRole,
    });
    
    toast.success('Role changed successfully');
    
  } catch (error) {
    if (error.data?.cause?.errorCode === 'STEP_UP_REQUIRED') {
      // Redirect to step-up authentication page
      router.push({
        pathname: '/auth/step-up',
        query: {
          action: 'role_change',
          returnTo: router.asPath,
          context: JSON.stringify({ userId, newRole }),
        },
      });
    } else {
      toast.error('Failed to change role');
    }
  }
};
```

#### Step 2: Step-Up Authentication Page

```typescript
// /pages/auth/step-up.tsx
const StepUpAuthPage = () => {
  const router = useRouter();
  const { action, returnTo, context } = router.query;
  
  const [password, setPassword] = useState('');
  
  const handleStepUp = async () => {
    try {
      // Create step-up token by re-verifying password
      const result = await trpc.auth.createStepUpToken.mutate({
        password,
        actionType: action as SensitiveActionType,
      });
      
      // Store token temporarily (sessionStorage, not localStorage)
      sessionStorage.setItem('stepUpToken', result.data.token);
      sessionStorage.setItem('stepUpTokenExpiry', result.data.expiresAt.toString());
      
      // Redirect back to original page
      router.push(returnTo as string);
      
    } catch (error) {
      toast.error('Invalid password');
    }
  };
  
  return (
    <div>
      <h1>Re-authenticate</h1>
      <p>For security, please enter your password to continue.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button onClick={handleStepUp}>Verify</button>
    </div>
  );
};
```

#### Step 3: Retry Action with Token

```typescript
// After returning from step-up page
useEffect(() => {
  const stepUpToken = sessionStorage.getItem('stepUpToken');
  const context = JSON.parse(router.query.context as string);
  
  if (stepUpToken && context) {
    // Retry the original action with token
    retryWithStepUpToken(context, stepUpToken);
    
    // Clear token (single-use)
    sessionStorage.removeItem('stepUpToken');
    sessionStorage.removeItem('stepUpTokenExpiry');
  }
}, []);

const retryWithStepUpToken = async (context: any, token: string) => {
  try {
    await trpc.admin.changeUserRole.mutate({
      userId: context.userId,
      newRole: context.newRole,
      stepUpToken: token,  // Include token
    });
    
    toast.success('Role changed successfully');
    
  } catch (error) {
    if (error.data?.cause?.errorCode === 'STEP_UP_TOKEN_EXPIRED') {
      toast.error('Token expired. Please try again.');
      // Redirect back to step-up page
    } else if (error.data?.cause?.errorCode === 'STEP_UP_TOKEN_INVALID') {
      toast.error('Invalid token. Please try again.');
    } else {
      toast.error('Failed to change role');
    }
  }
};
```

---

### TypeScript Types for Step-Up

```typescript
/**
 * Request to create step-up token
 */
export interface CreateStepUpTokenRequest {
  password: string;                     // User's current password
  actionType: SensitiveActionType;      // What action needs elevation
  elevatedPermissions?: string[];       // Specific permissions needed
}

/**
 * Response from creating step-up token
 */
export interface CreateStepUpTokenResponse {
  success: true;
  data: {
    token: string;          // One-time use token (64 characters)
    expiresAt: Date;        // Token expires at (10 minutes)
    actionType: SensitiveActionType;
  };
}

/**
 * Step-up token should be included in subsequent requests
 */
export interface WithStepUpToken {
  stepUpToken?: string;   // Optional, only if step-up was required
}
```

---

## Sensitive Action Logging

All sensitive actions are automatically logged by the backend for audit purposes.

### What Gets Logged

Every sensitive action attempt records:
- User ID
- Action type (`password_change`, `role_change`, etc.)
- Whether 2FA was required
- Whether step-up was required
- Verification method used (`2fa_totp`, `password`, `authenticated`)
- Success/failure status
- Failure reason (if failed)
- IP address
- User agent
- Timestamp

### Frontend Display

You can query these logs for security auditing:

```typescript
/**
 * Get sensitive action history for current user
 */
const { data } = trpc.security.getSensitiveActionLogs.useQuery({
  limit: 20,
  offset: 0,
});

// Returns:
// {
//   success: true,
//   data: {
//     logs: [
//       {
//         id: "log_123",
//         actionType: "password_change",
//         required2fa: true,
//         requiredStepUp: false,
//         verificationMethod: "2fa_totp",
//         success: true,
//         ipAddress: "192.168.1.100",
//         createdAt: "2025-10-20T14:30:00Z"
//       },
//       // ...
//     ],
//     totalCount: 45
//   }
// }
```

### Display Security Timeline

```tsx
const SecurityTimelinePage = () => {
  const { data } = trpc.security.getSensitiveActionLogs.useQuery({
    limit: 20,
    offset: 0,
  });
  
  return (
    <div>
      <h2>Security Activity</h2>
      <p>Recent sensitive actions on your account</p>
      
      {data?.data.logs.map(log => (
        <div key={log.id} className="timeline-item">
          <div className="icon">
            {log.success ? '✅' : '❌'}
          </div>
          <div className="details">
            <strong>{formatActionType(log.actionType)}</strong>
            <span>{formatDate(log.createdAt)}</span>
            <span>{log.ipAddress}</span>
            {!log.success && (
              <span className="error">{log.failureReason}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
```

---

## TypeScript Type Definitions

Complete type definitions for this module:

```typescript
// ==============================================
// SENSITIVE ACTION TYPES
// ==============================================

/**
 * Types of sensitive actions requiring additional authentication
 */
export type SensitiveActionType =
  | 'password_change'
  | 'email_change'
  | 'admin_action'
  | 'role_change'
  | 'security_settings'
  | 'payment_settings'
  | 'account_deletion';

/**
 * Verification methods for sensitive actions
 */
export type VerificationMethod =
  | '2fa_totp'          // TOTP authenticator app
  | '2fa_sms'           // SMS code
  | 'password'          // Password re-entry
  | 'authenticated'     // Already authenticated (no additional verification)
  | 'backup_code';      // Backup code

/**
 * Sensitive action log entry
 */
export interface SensitiveActionLog {
  id: string;
  actionType: SensitiveActionType;
  actionDetails?: Record<string, any>;    // Action-specific metadata
  required2fa: boolean;                   // Was 2FA required?
  requiredStepUp: boolean;                // Was step-up required?
  verificationMethod: VerificationMethod | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  failureReason: string | null;
  createdAt: Date;
}

/**
 * Response from getSensitiveActionLogs
 */
export interface GetSensitiveActionLogsResponse {
  success: true;
  data: {
    logs: SensitiveActionLog[];
    totalCount: number;
  };
}

// ==============================================
// ERROR TYPES
// ==============================================

/**
 * Error codes specific to session security
 */
export enum SessionSecurityErrorCode {
  // 2FA Errors
  TWO_FA_REQUIRED = '2FA_REQUIRED',
  INVALID_2FA_CODE = 'INVALID_2FA_CODE',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  CHALLENGE_NOT_FOUND = 'CHALLENGE_NOT_FOUND',
  
  // Step-Up Errors
  STEP_UP_REQUIRED = 'STEP_UP_REQUIRED',
  STEP_UP_TOKEN_INVALID = 'STEP_UP_TOKEN_INVALID',
  STEP_UP_TOKEN_EXPIRED = 'STEP_UP_TOKEN_EXPIRED',
  STEP_UP_TOKEN_ALREADY_USED = 'STEP_UP_TOKEN_ALREADY_USED',
  STEP_UP_TOKEN_ACTION_MISMATCH = 'STEP_UP_TOKEN_ACTION_MISMATCH',
  
  // Session Errors
  SESSION_LIMIT_REACHED = 'SESSION_LIMIT_REACHED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
}

/**
 * Structured error data for session security errors
 */
export interface SessionSecurityError {
  errorCode: SessionSecurityErrorCode;
  message: string;
  action?: SensitiveActionType;
  reason?: string;
  retryAfter?: number;  // Seconds until retry allowed
}
```

---

## Error Handling

### Complete Error Reference

| Error Code | HTTP Status | Cause | User Message | Suggested Action |
|------------|-------------|-------|--------------|------------------|
| `2FA_REQUIRED` | 403 | Action needs 2FA verification | "Please verify your identity with 2FA" | Show 2FA challenge modal |
| `INVALID_2FA_CODE` | 400 | Wrong TOTP code entered | "Invalid code. Please try again." | Allow retry (track attempts) |
| `CHALLENGE_EXPIRED` | 400 | 2FA challenge expired (>5 min) | "Challenge expired. Please start over." | Close modal, retry action |
| `CHALLENGE_NOT_FOUND` | 404 | Challenge ID doesn't exist | "Invalid challenge. Please try again." | Close modal, retry action |
| `STEP_UP_REQUIRED` | 403 | Action needs re-authentication | "For security, please re-enter your password" | Redirect to step-up page |
| `STEP_UP_TOKEN_INVALID` | 400 | Token doesn't exist or wrong format | "Invalid authentication token" | Retry step-up flow |
| `STEP_UP_TOKEN_EXPIRED` | 400 | Token expired (>10 min) | "Token expired. Please authenticate again." | Redirect to step-up page |
| `STEP_UP_TOKEN_ALREADY_USED` | 400 | Token was already consumed | "Token already used. Please authenticate again." | Retry step-up flow |
| `STEP_UP_TOKEN_ACTION_MISMATCH` | 400 | Token for different action | "Invalid token for this action" | Retry step-up flow |
| `SESSION_LIMIT_REACHED` | 429 | Max concurrent sessions reached | "Session limit reached. Oldest session will be replaced." | Show warning, allow login |
| `SESSION_NOT_FOUND` | 404 | Session ID doesn't exist | "Session not found" | Refetch session list |
| `SESSION_REVOKED` | 401 | Session was manually revoked | "Your session was ended. Please log in again." | Redirect to login |
| `SESSION_EXPIRED` | 401 | Session expired (hard expiration or timeout) | "Your session has expired. Please log in again." | Redirect to login |

---

### Global Error Handler

```typescript
/**
 * Centralized handler for session security errors
 */
export const handleSessionSecurityError = (
  error: TRPCError,
  context: {
    actionType?: SensitiveActionType;
    onRetry?: () => Promise<void>;
    router: NextRouter;
  }
): void => {
  const errorCode = error.data?.cause?.errorCode as SessionSecurityErrorCode;
  
  switch (errorCode) {
    // 2FA Required
    case SessionSecurityErrorCode.TWO_FA_REQUIRED:
      show2FAModal(context.actionType!, context.onRetry!);
      break;
      
    case SessionSecurityErrorCode.INVALID_2FA_CODE:
      toast.error('Invalid code. Please try again.');
      break;
      
    case SessionSecurityErrorCode.CHALLENGE_EXPIRED:
      toast.error('Challenge expired. Please start over.');
      if (context.onRetry) context.onRetry();
      break;
      
    // Step-Up Required
    case SessionSecurityErrorCode.STEP_UP_REQUIRED:
      context.router.push({
        pathname: '/auth/step-up',
        query: {
          action: context.actionType,
          returnTo: context.router.asPath,
        },
      });
      break;
      
    case SessionSecurityErrorCode.STEP_UP_TOKEN_EXPIRED:
      toast.error('Authentication expired. Please try again.');
      context.router.push('/auth/step-up');
      break;
      
    case SessionSecurityErrorCode.STEP_UP_TOKEN_ALREADY_USED:
      toast.error('Token already used. Please authenticate again.');
      context.router.push('/auth/step-up');
      break;
      
    // Session Errors
    case SessionSecurityErrorCode.SESSION_EXPIRED:
    case SessionSecurityErrorCode.SESSION_REVOKED:
      toast.error('Your session has expired. Please log in again.');
      signOut({ callbackUrl: '/login' });
      break;
      
    case SessionSecurityErrorCode.SESSION_LIMIT_REACHED:
      toast.warning('Session limit reached. Your oldest session will be replaced.');
      break;
      
    default:
      toast.error('An error occurred. Please try again.');
      console.error('Unhandled session security error:', error);
  }
};
```

---

## Complete Flow Examples

### Example 1: Password Change with 2FA

```typescript
const ChangePasswordForm = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  
  const changePasswordMutation = trpc.auth.changePassword.useMutation();
  
  const handleSubmit = async () => {
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
        keepCurrentSession: true,
      });
      
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      
    } catch (error) {
      const errorCode = error.data?.cause?.errorCode;
      
      if (errorCode === '2FA_REQUIRED') {
        setShow2FA(true);  // Show 2FA modal
      } else {
        toast.error(error.message || 'Failed to change password');
      }
    }
  };
  
  const handle2FAVerification = async (code: string) => {
    try {
      // Create challenge
      const challenge = await trpc.auth.create2FAChallenge.mutate({
        actionType: 'password_change',
      });
      
      // Verify code
      await trpc.auth.verify2FAChallenge.mutate({
        challengeId: challenge.data.challengeId,
        code,
      });
      
      // Retry password change (now within grace period)
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
        keepCurrentSession: true,
      });
      
      setShow2FA(false);
      toast.success('Password changed successfully');
      
    } catch (error) {
      if (error.data?.cause?.errorCode === 'INVALID_2FA_CODE') {
        toast.error('Invalid code. Please try again.');
      } else {
        toast.error('Verification failed');
        setShow2FA(false);
      }
    }
  };
  
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <input
          type="password"
          placeholder="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button type="submit">Change Password</button>
      </form>
      
      {show2FA && (
        <TwoFactorModal
          onVerify={handle2FAVerification}
          onCancel={() => setShow2FA(false)}
        />
      )}
    </>
  );
};
```

### Example 2: Admin Role Change with Step-Up

```typescript
const AdminUserManagementPage = () => {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  const changeRoleMutation = trpc.admin.changeUserRole.useMutation();
  
  // Check if returning from step-up page
  useEffect(() => {
    const stepUpToken = sessionStorage.getItem('stepUpToken');
    const pendingAction = sessionStorage.getItem('pendingRoleChange');
    
    if (stepUpToken && pendingAction) {
      const { userId, newRole } = JSON.parse(pendingAction);
      completeRoleChange(userId, newRole, stepUpToken);
      
      // Clear stored data
      sessionStorage.removeItem('stepUpToken');
      sessionStorage.removeItem('pendingRoleChange');
    }
  }, []);
  
  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await changeRoleMutation.mutateAsync({
        userId,
        newRole,
      });
      
      toast.success('Role changed successfully');
      
    } catch (error) {
      const errorCode = error.data?.cause?.errorCode;
      
      if (errorCode === 'STEP_UP_REQUIRED') {
        // Store pending action
        sessionStorage.setItem(
          'pendingRoleChange',
          JSON.stringify({ userId, newRole })
        );
        
        // Redirect to step-up page
        router.push({
          pathname: '/auth/step-up',
          query: {
            action: 'role_change',
            returnTo: router.asPath,
          },
        });
      } else {
        toast.error('Failed to change role');
      }
    }
  };
  
  const completeRoleChange = async (
    userId: string,
    newRole: UserRole,
    stepUpToken: string
  ) => {
    try {
      await changeRoleMutation.mutateAsync({
        userId,
        newRole,
        stepUpToken,
      });
      
      toast.success('Role changed successfully');
      
    } catch (error) {
      const errorCode = error.data?.cause?.errorCode;
      
      if (errorCode === 'STEP_UP_TOKEN_EXPIRED') {
        toast.error('Token expired. Please try again.');
        router.push('/auth/step-up');
      } else {
        toast.error('Failed to change role');
      }
    }
  };
  
  return (
    <div>
      {/* User list and role change UI */}
    </div>
  );
};
```

### Example 3: Combined 2FA + Session Revocation

```typescript
const SecuritySettingsPage = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [show2FA, setShow2FA] = useState(false);
  const [pendingRevocation, setPendingRevocation] = useState<string | null>(null);
  
  const { data: sessionsData, refetch } = trpc.session.getSessions.useQuery();
  const revokeSessionMutation = trpc.session.revokeSession.useMutation();
  
  useEffect(() => {
    if (sessionsData?.data.sessions) {
      setSessions(sessionsData.data.sessions);
    }
  }, [sessionsData]);
  
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSessionMutation.mutateAsync({ sessionId });
      toast.success('Session revoked successfully');
      refetch();
      
    } catch (error) {
      const errorCode = error.data?.cause?.errorCode;
      
      if (errorCode === '2FA_REQUIRED') {
        setPendingRevocation(sessionId);
        setShow2FA(true);
      } else {
        toast.error('Failed to revoke session');
      }
    }
  };
  
  const complete2FAAndRevoke = async (code: string) => {
    try {
      // Verify 2FA
      const challenge = await trpc.auth.create2FAChallenge.mutate({
        actionType: 'security_settings',
      });
      
      await trpc.auth.verify2FAChallenge.mutate({
        challengeId: challenge.data.challengeId,
        code,
      });
      
      // Retry revocation
      if (pendingRevocation) {
        await revokeSessionMutation.mutateAsync({
          sessionId: pendingRevocation,
        });
        
        toast.success('Session revoked successfully');
        refetch();
      }
      
      setShow2FA(false);
      setPendingRevocation(null);
      
    } catch (error) {
      toast.error('Verification failed');
    }
  };
  
  return (
    <div>
      <h2>Active Sessions</h2>
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          onRevoke={() => handleRevokeSession(session.id)}
        />
      ))}
      
      {show2FA && (
        <TwoFactorModal
          onVerify={complete2FAAndRevoke}
          onCancel={() => {
            setShow2FA(false);
            setPendingRevocation(null);
          }}
        />
      )}
    </div>
  );
};
```

---

## 📚 Next Steps

Continue to **Part 3: Quick Reference** for:
- Implementation checklist
- Common patterns and utilities
- Testing scenarios
- Troubleshooting guide

Or go back to **Part 1: Session Management** for:
- Session tracking and device management
- Concurrent session limits
- Inactivity timeouts

---

**Questions or Issues?**  
Contact the backend team or refer to the backend implementation docs at:  
`/docs/SESSION_SECURITY_IMPLEMENTATION_COMPLETE.md`
