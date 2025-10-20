# 🔒 Session Security Module - Part 1: Session Management & Device Tracking
## Frontend Integration Guide

**Classification:** ⚡ HYBRID - Core security used by both admin and public-facing  
**Backend Module:** Session Security  
**Last Updated:** October 20, 2025  
**Related Docs:** Part 2 (Step-Up Auth), Part 3 (Quick Reference)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints - Session Management](#api-endpoints---session-management)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting](#rate-limiting)

---

## Overview

The Session Security module provides enterprise-grade session management with:
- **Multi-device session tracking** - View all active sessions with device details
- **Concurrent session limits** - Configurable per-user (default: 5 devices)
- **Automatic inactivity timeout** - Configurable per-user (default: 24 hours)
- **Session revocation** - Users can logout from specific devices or all at once
- **Device fingerprinting** - Track browser, OS, IP address, and last activity
- **Password change protection** - All sessions revoked on password change

### Key Features
- ✅ Real-time session tracking across devices
- ✅ Automatic enforcement of session limits (oldest session revoked when exceeded)
- ✅ Activity-based timeout (any interaction resets timer)
- ✅ Session warnings (approaching timeout, limit reached)
- ✅ Device identification (iPhone, Mac, Chrome Browser, etc.)
- ✅ Background cleanup jobs (every 6 hours)

---

## API Endpoints - Session Management

All session management endpoints use **tRPC** and require authentication.

### Base Path
```
/api/trpc/session.[endpoint]
```

### Authentication
All endpoints require a valid JWT session token sent via HTTP-only cookie (`next-auth.session-token`).

---

### 1. Get All Active Sessions

**Endpoint:** `session.getSessions`  
**Method:** `query` (GET)  
**Access:** 🌐 Any authenticated user

#### Request
```typescript
// No input required
const { data } = await trpc.session.getSessions.useQuery();
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    sessions: SessionInfo[],
    totalCount: number
  }
}

interface SessionInfo {
  id: string;                    // Unique session ID
  sessionToken: string;          // Session token (for internal use)
  deviceName: string | null;     // "iPhone", "Mac", "Chrome Browser", etc.
  deviceFingerprint: string | null;
  ipAddress: string | null;      // Last known IP address
  userAgent: string | null;      // Full user agent string
  lastActivityAt: Date;          // Last interaction timestamp
  createdAt: Date;               // Session creation timestamp
  expires: Date;                 // Hard expiration date
  isCurrent: boolean;            // Is this the current session?
}
```

#### Example Response
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "clxyz123",
        "sessionToken": "hidden",
        "deviceName": "iPhone",
        "deviceFingerprint": "abc123def456",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)...",
        "lastActivityAt": "2025-10-20T14:30:00.000Z",
        "createdAt": "2025-10-19T09:00:00.000Z",
        "expires": "2025-11-19T09:00:00.000Z",
        "isCurrent": true
      },
      {
        "id": "clxyz456",
        "deviceName": "Mac",
        "deviceFingerprint": "def789ghi012",
        "ipAddress": "192.168.1.101",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
        "lastActivityAt": "2025-10-19T18:45:00.000Z",
        "createdAt": "2025-10-18T10:30:00.000Z",
        "expires": "2025-11-18T10:30:00.000Z",
        "isCurrent": false
      }
    ],
    "totalCount": 2
  }
}
```

#### Use Cases
- Display "Active Sessions" page showing all logged-in devices
- Show warning when approaching session limit
- Allow users to review where they're logged in

---

### 2. Get Session Warnings

**Endpoint:** `session.getSessionWarnings`  
**Method:** `query` (GET)  
**Access:** 🌐 Any authenticated user

#### Request
```typescript
const { data } = await trpc.session.getSessionWarnings.useQuery();
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    warnings: SessionWarning[]
  }
}

interface SessionWarning {
  warningType: 'approaching_timeout' | 'session_limit_reached';
  message: string;
  expiresAt?: Date;  // Only for approaching_timeout
}
```

#### Example Response
```json
{
  "success": true,
  "data": {
    "warnings": [
      {
        "warningType": "approaching_timeout",
        "message": "Your session will expire soon due to inactivity. Any activity will extend your session.",
        "expiresAt": "2025-10-20T15:30:00.000Z"
      },
      {
        "warningType": "session_limit_reached",
        "message": "You have reached your maximum of 5 concurrent sessions. New logins will revoke the oldest session."
      }
    ]
  }
}
```

#### When Warnings Are Triggered
- **approaching_timeout**: Less than 1 hour until inactivity logout
- **session_limit_reached**: User has max number of active sessions

#### Use Cases
- Display banner/toast notification warning user
- Show countdown timer for session expiration
- Prompt user to click "Stay Logged In" button

---

### 3. Revoke Specific Session

**Endpoint:** `session.revokeSession`  
**Method:** `mutation` (POST)  
**Access:** 🌐 Any authenticated user (can only revoke own sessions)

#### Request Schema
```typescript
const { mutate } = trpc.session.revokeSession.useMutation();

mutate({
  sessionId: string  // Required: ID of session to revoke
});
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    message: string  // "Session revoked successfully"
  }
}
```

#### Example Usage
```typescript
const revokeSession = async (sessionId: string) => {
  try {
    await trpc.session.revokeSession.mutate({ sessionId });
    // Refresh session list
    refetch();
    toast.success('Session logged out successfully');
  } catch (error) {
    toast.error('Failed to logout session');
  }
};
```

#### Use Cases
- "Logout" button next to each session in device list
- Remote logout from specific device
- Security: User saw unfamiliar device and wants to revoke access

---

### 4. Revoke All Other Sessions

**Endpoint:** `session.revokeAllOtherSessions`  
**Method:** `mutation` (POST)  
**Access:** 🌐 Any authenticated user

#### Request
```typescript
// No input required
const { mutate } = trpc.session.revokeAllOtherSessions.useMutation();
mutate();
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    message: string,  // "Successfully logged out of 3 other session(s)"
    revokedCount: number
  }
}
```

#### Example Usage
```typescript
const logoutOtherDevices = async () => {
  const confirmed = await confirm(
    'This will log you out from all other devices. Continue?'
  );
  
  if (confirmed) {
    const result = await trpc.session.revokeAllOtherSessions.mutate();
    toast.success(result.data.message);
  }
};
```

#### Use Cases
- "Logout from all other devices" button in security settings
- After password change: "Keep this device, logout others"
- Security incident: User wants to ensure only current device is logged in

---

### 5. Revoke All Sessions

**Endpoint:** `session.revokeAllSessions`  
**Method:** `mutation` (POST)  
**Access:** 🌐 Any authenticated user

#### Request
```typescript
const { mutate } = trpc.session.revokeAllSessions.useMutation();
mutate();
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    message: string,  // "Successfully logged out of all sessions"
    revokedCount: number
  }
}
```

#### Example Usage
```typescript
const logoutEverywhere = async () => {
  const confirmed = await confirm(
    'This will log you out from ALL devices including this one. Continue?'
  );
  
  if (confirmed) {
    await trpc.session.revokeAllSessions.mutate();
    // Redirect to login
    await signOut({ callbackUrl: '/login' });
  }
};
```

#### Important Notes
> ⚠️ **This endpoint logs out the current device too!**  
> Always redirect to login page after calling this endpoint.

#### Use Cases
- "Nuclear option" - logout everywhere including current device
- User suspects account compromise
- After password change: full re-authentication required

---

### 6. Get Sessions by Device Type

**Endpoint:** `session.getSessionsByDevice`  
**Method:** `query` (GET)  
**Access:** 🌐 Any authenticated user

#### Request
```typescript
const { data } = await trpc.session.getSessionsByDevice.useQuery();
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    deviceStats: Array<{
      deviceName: string;  // "iPhone", "Mac", "Chrome Browser", etc.
      count: number;       // Number of active sessions for this device type
    }>
  }
}
```

#### Example Response
```json
{
  "success": true,
  "data": {
    "deviceStats": [
      { "deviceName": "iPhone", "count": 2 },
      { "deviceName": "Mac", "count": 1 },
      { "deviceName": "Chrome Browser", "count": 1 }
    ]
  }
}
```

#### Use Cases
- Display pie chart or statistics of device types
- Analytics: "You're logged in on 2 iPhones, 1 Mac, and 1 Chrome browser"
- Quick overview of session distribution

---

### 7. Update Session Activity (Heartbeat)

**Endpoint:** `session.updateActivity`  
**Method:** `mutation` (POST)  
**Access:** 🌐 Any authenticated user

#### Request
```typescript
const { mutate } = trpc.session.updateActivity.useMutation();
mutate();
```

#### Response Schema
```typescript
{
  success: true,
  data: {
    message: string  // "Activity updated"
  }
}
```

#### Example Usage
```typescript
// Update activity every 5 minutes if user is active
useEffect(() => {
  let lastActivity = Date.now();
  
  const trackActivity = () => {
    lastActivity = Date.now();
  };
  
  // Track user interactions
  window.addEventListener('mousemove', trackActivity);
  window.addEventListener('keydown', trackActivity);
  window.addEventListener('click', trackActivity);
  
  const interval = setInterval(() => {
    // Only send heartbeat if user was active in last 5 minutes
    const isActive = Date.now() - lastActivity < 5 * 60 * 1000;
    
    if (isActive) {
      trpc.session.updateActivity.mutate();
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  return () => {
    clearInterval(interval);
    window.removeEventListener('mousemove', trackActivity);
    window.removeEventListener('keydown', trackActivity);
    window.removeEventListener('click', trackActivity);
  };
}, []);
```

#### Important Notes
> 💡 **Best Practice:** Only call this when user is actually active  
> Don't spam the endpoint - 5-10 minute intervals are sufficient

#### Use Cases
- Prevent inactivity timeout for active users
- Update "last seen" timestamp
- Keep session alive during long reading sessions

---

## TypeScript Type Definitions

Copy these types into your frontend codebase:

```typescript
// ==============================================
// SESSION MANAGEMENT TYPES
// ==============================================

/**
 * Detailed session information for a user's device
 */
export interface SessionInfo {
  /** Unique session identifier */
  id: string;
  
  /** Session token (should not be displayed to user) */
  sessionToken: string;
  
  /** Human-readable device name (e.g., "iPhone", "Mac", "Chrome Browser") */
  deviceName: string | null;
  
  /** Unique fingerprint for this device */
  deviceFingerprint: string | null;
  
  /** IP address of last activity */
  ipAddress: string | null;
  
  /** Full user agent string */
  userAgent: string | null;
  
  /** Timestamp of last user interaction */
  lastActivityAt: Date;
  
  /** Timestamp when session was created */
  createdAt: Date;
  
  /** Hard expiration date (typically 30 days) */
  expires: Date;
  
  /** Whether this is the current device's session */
  isCurrent: boolean;
}

/**
 * Warning types for session security alerts
 */
export type SessionWarningType = 
  | 'approaching_timeout'      // Session will expire soon due to inactivity
  | 'session_limit_reached';   // User at max concurrent sessions

/**
 * Session warning details
 */
export interface SessionWarning {
  /** Type of warning */
  warningType: SessionWarningType;
  
  /** User-friendly message to display */
  message: string;
  
  /** When session will expire (only for approaching_timeout) */
  expiresAt?: Date;
}

/**
 * Device statistics for session overview
 */
export interface DeviceStats {
  /** Device type name */
  deviceName: string;
  
  /** Number of active sessions for this device type */
  count: number;
}

/**
 * Response from getSessions endpoint
 */
export interface GetSessionsResponse {
  success: true;
  data: {
    sessions: SessionInfo[];
    totalCount: number;
  };
}

/**
 * Response from getSessionWarnings endpoint
 */
export interface GetSessionWarningsResponse {
  success: true;
  data: {
    warnings: SessionWarning[];
  };
}

/**
 * Response from revokeSession endpoint
 */
export interface RevokeSessionResponse {
  success: true;
  data: {
    message: string;
  };
}

/**
 * Response from revokeAllOtherSessions endpoint
 */
export interface RevokeAllOtherSessionsResponse {
  success: true;
  data: {
    message: string;
    revokedCount: number;
  };
}

/**
 * Response from revokeAllSessions endpoint
 */
export interface RevokeAllSessionsResponse {
  success: true;
  data: {
    message: string;
    revokedCount: number;
  };
}

/**
 * Response from getSessionsByDevice endpoint
 */
export interface GetSessionsByDeviceResponse {
  success: true;
  data: {
    deviceStats: DeviceStats[];
  };
}

/**
 * Response from updateActivity endpoint
 */
export interface UpdateActivityResponse {
  success: true;
  data: {
    message: string;
  };
}
```

---

## Business Logic & Validation Rules

### Session Limits

| Parameter | Default | Configurable | Range |
|-----------|---------|--------------|-------|
| Max Concurrent Sessions | 5 | Per-user | 1-20 |
| Inactivity Timeout | 24 hours | Per-user | 1-168 hours (7 days) |
| Hard Expiration | 30 days | System-wide | Not configurable by user |
| Cleanup Job Frequency | 6 hours | System-wide | Not user-facing |

### Session Limit Enforcement

1. **When limit is reached:**
   - User sees warning: "You have reached your maximum of 5 concurrent sessions"
   - New login will automatically revoke the **oldest** session (by `lastActivityAt`)
   - Database trigger enforces this automatically

2. **Device fingerprinting:**
   - Generated from User-Agent header
   - Used to identify unique devices
   - Not cryptographically secure (informational only)

3. **Device name extraction:**
   - Parsed from User-Agent string
   - Priority: Mobile devices → Desktop OS → Browsers
   - Falls back to "Unknown Device" if unparseable

**Device Name Examples:**
- `"iPhone"` - iOS mobile device
- `"iPad"` - iOS tablet
- `"Android Phone"` - Android mobile device
- `"Mac"` - macOS desktop
- `"Windows PC"` - Windows desktop
- `"Chrome Browser"` - Desktop Chrome (OS unknown)
- `"Unknown Device"` - Unparseable user agent

### Inactivity Timeout Rules

1. **Activity definition:**
   - Any API call extends session
   - Manual `updateActivity` heartbeat
   - Does NOT include background polling (use discretion)

2. **Timeout calculation:**
   - Based on `lastActivityAt` timestamp
   - Configurable per-user via `autoLogoutAfterHours` field
   - Background job runs every 6 hours to enforce

3. **Warning threshold:**
   - Shows warning when < 1 hour remaining
   - Calculated as: `autoLogoutAfterHours - hoursSinceActivity < 1`

4. **Revocation:**
   - Session marked as revoked with `revokedReason: 'inactivity_timeout'`
   - User must login again
   - Previous session data retained for audit

### Password Change Behavior

When user changes password:

1. **Option A: Keep current session**
   ```typescript
   changePassword({
     currentPassword: "old",
     newPassword: "new",
     keepCurrentSession: true
   });
   ```
   - All other sessions revoked
   - Current device stays logged in
   - Recommended for convenience

2. **Option B: Logout everywhere**
   ```typescript
   changePassword({
     currentPassword: "old",
     newPassword: "new",
     keepCurrentSession: false  // or omit
   });
   ```
   - All sessions revoked (including current)
   - User must login again
   - Recommended for security

### Session Token Security

- Session tokens stored in **HTTP-only cookies**
- `Secure` flag in production (HTTPS only)
- `SameSite=Lax` for CSRF protection
- Frontend **cannot** read session token via JavaScript
- Automatically sent with every API request

---

## Error Handling

### Error Response Format

All errors follow tRPC error format:

```typescript
{
  error: {
    code: string;           // TRPC error code
    message: string;        // Error message
    data?: {
      code?: string;        // Application error code
      cause?: any;          // Original error
    }
  }
}
```

### Error Codes

| HTTP Status | tRPC Code | Scenario | User Message |
|-------------|-----------|----------|--------------|
| 401 | `UNAUTHORIZED` | Not logged in | "Please log in to continue" |
| 401 | `UNAUTHORIZED` | Session expired | "Your session has expired. Please log in again." |
| 401 | `UNAUTHORIZED` | Session revoked | "Your session was ended. Please log in again." |
| 403 | `FORBIDDEN` | Revoking another user's session | "You don't have permission to revoke this session" |
| 404 | `NOT_FOUND` | Session ID doesn't exist | "Session not found" |
| 500 | `INTERNAL_SERVER_ERROR` | Database error | "Something went wrong. Please try again." |

### Frontend Error Handling Examples

```typescript
// Handle session errors globally
const handleSessionError = (error: TRPCError) => {
  if (error.code === 'UNAUTHORIZED') {
    // Session expired or revoked
    toast.error('Your session has expired. Redirecting to login...');
    setTimeout(() => {
      signOut({ callbackUrl: '/login' });
    }, 2000);
    return;
  }
  
  // Generic error
  toast.error('An error occurred. Please try again.');
};

// Revoke session with error handling
const revokeSession = async (sessionId: string) => {
  try {
    await trpc.session.revokeSession.mutate({ sessionId });
    toast.success('Session logged out successfully');
    refetch();
  } catch (error) {
    if (error instanceof TRPCError) {
      handleSessionError(error);
    }
  }
};
```

### Retry Logic

**Recommended retry behavior:**

| Endpoint | Retry on Failure? | Max Retries | Backoff |
|----------|-------------------|-------------|---------|
| `getSessions` | ✅ Yes | 3 | Exponential |
| `getSessionWarnings` | ✅ Yes | 3 | Exponential |
| `revokeSession` | ❌ No | - | - |
| `revokeAllOtherSessions` | ❌ No | - | - |
| `revokeAllSessions` | ❌ No | - | - |
| `getSessionsByDevice` | ✅ Yes | 3 | Exponential |
| `updateActivity` | ❌ No (fail silently) | - | - |

**Rationale:**
- **Queries** can be retried safely (idempotent)
- **Mutations** should not auto-retry (could cause duplicate actions)
- **Activity heartbeat** should fail silently (not critical)

---

## Authorization & Permissions

### Access Control

| Endpoint | Access Level | Notes |
|----------|--------------|-------|
| `getSessions` | 🌐 Own sessions only | User can only see their own sessions |
| `getSessionWarnings` | 🌐 Own warnings only | User can only see their own warnings |
| `revokeSession` | 🌐 Own sessions only | User can only revoke their own sessions |
| `revokeAllOtherSessions` | 🌐 Own sessions only | User can only revoke their own sessions |
| `revokeAllSessions` | 🌐 Own sessions only | User can only revoke their own sessions |
| `getSessionsByDevice` | 🌐 Own devices only | User can only see their own device stats |
| `updateActivity` | 🌐 Own session only | Automatically uses current session |

### Admin Override

**There is NO admin override for these endpoints.**

- Admins cannot view or revoke other users' sessions via these endpoints
- For admin session management, see separate admin endpoints (if implemented)
- Security rationale: Session management is user-privacy-sensitive

### Cross-User Access Prevention

The backend automatically filters sessions by `userId` from the authenticated session. Attempts to access another user's sessions will return empty results, not an error.

---

## Rate Limiting

### Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `getSessions` | 60 requests | 1 minute | Per user |
| `getSessionWarnings` | 60 requests | 1 minute | Per user |
| `revokeSession` | 10 requests | 1 minute | Per user |
| `revokeAllOtherSessions` | 5 requests | 5 minutes | Per user |
| `revokeAllSessions` | 5 requests | 5 minutes | Per user |
| `getSessionsByDevice` | 60 requests | 1 minute | Per user |
| `updateActivity` | 30 requests | 1 minute | Per user |

### Rate Limit Headers

Currently **not implemented**. If rate limiting is added in the future, these headers will be included:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1698765432
```

### Rate Limit Error Handling

```typescript
if (error.code === 'TOO_MANY_REQUESTS') {
  toast.error('Too many requests. Please wait a moment and try again.');
  
  // Optionally, parse retry-after header
  const retryAfter = error.data?.retryAfter; // seconds
  if (retryAfter) {
    toast.info(`Please try again in ${retryAfter} seconds`);
  }
}
```

### Best Practices to Avoid Rate Limits

1. **Polling frequency:**
   - Session warnings: Poll every 60 seconds (when user active)
   - Active sessions list: Only fetch on page load or explicit refresh

2. **Debounce user actions:**
   ```typescript
   const debouncedUpdateActivity = debounce(
     () => trpc.session.updateActivity.mutate(),
     5000 // 5 seconds
   );
   ```

3. **Cache responses:**
   ```typescript
   const { data } = trpc.session.getSessions.useQuery(undefined, {
     staleTime: 30_000,  // 30 seconds
     cacheTime: 60_000,  // 60 seconds
   });
   ```

---

## 📚 Next Steps

Continue to **Part 2: Step-Up Authentication & 2FA Enforcement** for:
- Sensitive action middleware
- 2FA challenges for password/email changes
- Step-up authentication for admin actions
- Audit logging

Or jump to **Part 3: Quick Reference** for:
- Implementation checklist
- Code examples
- Common pitfalls
- Testing scenarios

---

**Questions or Issues?**  
Contact the backend team or refer to the backend implementation docs at:  
`/docs/SESSION_SECURITY_IMPLEMENTATION_COMPLETE.md`
