# Frontend Integration Guide: 2FA Method Switching

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** Two-Factor Authentication - Method Switching  
**Status:** ✅ Complete - Ready for Frontend Integration  
**Last Updated:** October 20, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)
8. [User Flows](#user-flows)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [Edge Cases & UX Considerations](#edge-cases--ux-considerations)

---

## Overview

The 2FA Method Switching module allows users to:

1. **Enable both SMS and Authenticator** methods simultaneously
2. **Set a preferred method** for their primary login experience
3. **Switch between methods during login** if both are enabled
4. **Remove one method** while keeping the other active

### Key Features

- ✅ Support for dual-method 2FA (SMS + TOTP)
- ✅ User preference management
- ✅ Real-time method switching during login challenges
- ✅ Secure method removal with verification
- ✅ Automatic preference fallback when removing methods
- ✅ Rate limiting and abuse protection

### Prerequisites

Users must have:
- An active account with password authentication
- At least one 2FA method already configured (SMS or TOTP)
- Verified phone number (for SMS methods)
- Valid TOTP secret (for Authenticator methods)

---

## API Endpoints

### 1. Get 2FA Status

**GET** `/api/auth/2fa/status`

Retrieves comprehensive 2FA configuration status for the authenticated user.

#### Request

**Authentication:** Required (JWT session)

```typescript
// No request body - GET request
```

#### Response

**Success (200)**

```typescript
{
  success: true,
  data: {
    enabled: boolean;                    // True if ANY method is enabled
    bothMethodsEnabled: boolean;         // True if BOTH SMS and TOTP enabled
    verifiedAt: string | null;           // ISO timestamp of last verification
    preferredMethod: "SMS" | "AUTHENTICATOR" | null;
    availableMethods: {
      totp: {
        enabled: boolean;
        configured: boolean;
        description: string;             // "Authenticator app (Google Authenticator, Authy, etc.)"
      };
      sms: {
        enabled: boolean;
        configured: boolean;
        maskedPhone: string | null;      // "***1234" format
        description: string;             // "SMS verification code sent to your phone"
      };
    };
    backupCodes: {
      available: boolean;                // True if TOTP enabled with backup codes
      remaining: number;                 // Count of unused backup codes
    };
    capabilities: {
      canSetPreference: boolean;         // True if both methods enabled
      canRemoveMethod: boolean;          // True if both methods enabled
      canSwitchDuringLogin: boolean;     // True if both methods enabled
    };
    recommendations: {
      enableTotp: string | null;         // Suggestion to enable TOTP
      enableSms: string | null;          // Suggestion to enable SMS
      regenerateBackupCodes: string | null;  // Warning if <3 backup codes
      setPreference: string | null;      // Prompt to set preference
      enableAny: string | null;          // Prompt if no 2FA enabled
    };
  }
}
```

**Example Response**

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "bothMethodsEnabled": true,
    "verifiedAt": "2025-10-20T14:23:45.123Z",
    "preferredMethod": "AUTHENTICATOR",
    "availableMethods": {
      "totp": {
        "enabled": true,
        "configured": true,
        "description": "Authenticator app (Google Authenticator, Authy, etc.)"
      },
      "sms": {
        "enabled": true,
        "configured": true,
        "maskedPhone": "***5678",
        "description": "SMS verification code sent to your phone"
      }
    },
    "backupCodes": {
      "available": true,
      "remaining": 8
    },
    "capabilities": {
      "canSetPreference": true,
      "canRemoveMethod": true,
      "canSwitchDuringLogin": true
    },
    "recommendations": {
      "enableTotp": null,
      "enableSms": null,
      "regenerateBackupCodes": null,
      "setPreference": null,
      "enableAny": null
    }
  }
}
```

---

### 2. Set Preferred 2FA Method

**POST** `/api/auth/2fa/set-preferred-method`

Allows users to set their preferred 2FA method when both SMS and Authenticator are enabled.

#### Request

**Authentication:** Required (JWT session)

```typescript
{
  preferredMethod: "SMS" | "AUTHENTICATOR";
  verificationCode: string;  // 6-digit code from CURRENT preferred method
}
```

**Example Request**

```json
{
  "preferredMethod": "SMS",
  "verificationCode": "123456"
}
```

#### Response

**Success (200)**

```typescript
{
  success: true;
  data: {
    preferredMethod: "SMS" | "AUTHENTICATOR";
    message: string;  // User-friendly confirmation message
  }
}
```

**Example Success Response**

```json
{
  "success": true,
  "data": {
    "preferredMethod": "SMS",
    "message": "Your preferred 2FA method has been changed to SMS"
  }
}
```

---

### 3. Switch Method During Login

**POST** `/api/auth/2fa/switch-method`

Allows users to switch between SMS and Authenticator during an active login challenge.

#### Request

**Authentication:** NOT Required (challenge token used instead)

```typescript
{
  challengeToken: string;                 // Challenge token from login response
  newMethod: "SMS" | "AUTHENTICATOR";     // Method to switch to
}
```

**Example Request**

```json
{
  "challengeToken": "abc123def456...",
  "newMethod": "SMS"
}
```

#### Response

**Success (200)**

```typescript
{
  success: true;
  data: {
    challengeToken: string;      // NEW challenge token (old one is invalidated)
    expiresAt: string;           // ISO timestamp
    method: "SMS" | "AUTHENTICATOR";
    maskedPhone?: string;        // Only present if method is SMS (e.g., "****5678")
    message: string;             // Context-specific message
  }
}
```

**Example Success Response (SMS)**

```json
{
  "success": true,
  "data": {
    "challengeToken": "xyz789ghi012...",
    "expiresAt": "2025-10-20T15:30:00.000Z",
    "method": "SMS",
    "maskedPhone": "****5678",
    "message": "A verification code has been sent to ****5678"
  }
}
```

**Example Success Response (TOTP)**

```json
{
  "success": true,
  "data": {
    "challengeToken": "xyz789ghi012...",
    "expiresAt": "2025-10-20T15:30:00.000Z",
    "method": "AUTHENTICATOR",
    "message": "Please enter the code from your authenticator app"
  }
}
```

---

### 4. Remove 2FA Method

**POST** `/api/auth/2fa/remove-method`

Removes one 2FA method while keeping the other active. Requires verification from the method that will remain.

#### Request

**Authentication:** Required (JWT session)

```typescript
{
  methodToRemove: "SMS" | "AUTHENTICATOR";
  verificationCode: string;  // 6-digit code from the method that will REMAIN active
}
```

**Example Request**

```json
{
  "methodToRemove": "SMS",
  "verificationCode": "654321"
}
```

#### Response

**Success (200)**

```typescript
{
  success: true;
  data: {
    removedMethod: "SMS" | "AUTHENTICATOR";
    remainingMethod: "SMS" | "AUTHENTICATOR";
    message: string;  // User-friendly confirmation
  }
}
```

**Example Success Response**

```json
{
  "success": true,
  "data": {
    "removedMethod": "SMS",
    "remainingMethod": "AUTHENTICATOR",
    "message": "SMS 2FA has been removed. Your authenticator app remains active."
  }
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * 2FA Method Enum
 * Represents the available two-factor authentication methods
 */
export type TwoFactorMethod = 'SMS' | 'AUTHENTICATOR';

/**
 * Extended method type used in database (includes BOTH for admin settings)
 * Frontend should only use SMS or AUTHENTICATOR
 */
export type TwoFactorMethodExtended = 'SMS' | 'AUTHENTICATOR' | 'BOTH';

/**
 * 2FA Status Response
 * Complete status of user's 2FA configuration
 */
export interface TwoFactorStatus {
  enabled: boolean;
  bothMethodsEnabled: boolean;
  verifiedAt: string | null;
  preferredMethod: TwoFactorMethod | null;
  availableMethods: {
    totp: {
      enabled: boolean;
      configured: boolean;
      description: string;
    };
    sms: {
      enabled: boolean;
      configured: boolean;
      maskedPhone: string | null;
      description: string;
    };
  };
  backupCodes: {
    available: boolean;
    remaining: number;
  };
  capabilities: {
    canSetPreference: boolean;
    canRemoveMethod: boolean;
    canSwitchDuringLogin: boolean;
  };
  recommendations: {
    enableTotp: string | null;
    enableSms: string | null;
    regenerateBackupCodes: string | null;
    setPreference: string | null;
    enableAny: string | null;
  };
}

/**
 * Challenge Token Data
 * Returned during login flow and method switching
 */
export interface ChallengeToken {
  challengeToken: string;
  expiresAt: string;
  method: TwoFactorMethod;
  maskedPhone?: string;
  message: string;
}

/**
 * Set Preferred Method Request
 */
export interface SetPreferredMethodRequest {
  preferredMethod: TwoFactorMethod;
  verificationCode: string;
}

/**
 * Set Preferred Method Response
 */
export interface SetPreferredMethodResponse {
  preferredMethod: TwoFactorMethod;
  message: string;
}

/**
 * Switch Method Request
 */
export interface SwitchMethodRequest {
  challengeToken: string;
  newMethod: TwoFactorMethod;
}

/**
 * Remove Method Request
 */
export interface RemoveMethodRequest {
  methodToRemove: TwoFactorMethod;
  verificationCode: string;
}

/**
 * Remove Method Response
 */
export interface RemoveMethodResponse {
  removedMethod: TwoFactorMethod;
  remainingMethod: TwoFactorMethod;
  message: string;
}
```

### API Response Wrapper Types

```typescript
/**
 * Standard API Success Response
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Standard API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Combined API Response Type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

### Zod Validation Schemas (Optional)

If your frontend uses Zod for validation:

```typescript
import { z } from 'zod';

export const twoFactorMethodSchema = z.enum(['SMS', 'AUTHENTICATOR']);

export const setPreferredMethodSchema = z.object({
  preferredMethod: twoFactorMethodSchema,
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
});

export const switchMethodSchema = z.object({
  challengeToken: z.string().min(32, 'Invalid challenge token'),
  newMethod: twoFactorMethodSchema,
});

export const removeMethodSchema = z.object({
  methodToRemove: twoFactorMethodSchema,
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
});
```

---

## Business Logic & Validation Rules

### 1. Prerequisites for Method Switching Features

| Feature | Requirement |
|---------|------------|
| Set Preferred Method | Both SMS and TOTP must be enabled |
| Switch During Login | Both SMS and TOTP must be enabled |
| Remove Method | Both methods enabled (cannot remove only method) |
| View Status | User authenticated |

### 2. Verification Code Validation

**Field:** `verificationCode`

- **Format:** Exactly 6 numeric digits
- **Source (Set Preferred):** Current preferred method (or TOTP if no preference set)
- **Source (Remove Method):** The method that will REMAIN active
- **Expiry:** SMS codes expire in 5 minutes, TOTP codes valid for ±30 seconds

**Client-side validation:**
```typescript
const isValidCode = (code: string): boolean => {
  return /^\d{6}$/.test(code);
};
```

### 3. Method Switching Rules

#### During Login (switch-method endpoint)

- Maximum 3 method switches per challenge token
- Challenge must not be expired (10-minute expiry)
- Cannot switch to the same method currently in use
- New challenge token issued with each switch (old token invalidated)
- SMS method sends a new OTP immediately

#### In Settings (set-preferred-method endpoint)

- Must verify with current preferred method
- If no preference set, defaults to AUTHENTICATOR for verification
- Both methods must remain enabled
- Change logged in audit trail

### 4. Method Removal Rules

- **Cannot remove only method:** User must have 2+ methods to remove one
- **Verification required:** Must provide code from method that will remain
- **Auto-preference update:** Preference automatically set to remaining method
- **Cleanup actions:**
  - Removing SMS: Deletes phone number, clears pending SMS codes
  - Removing TOTP: Deletes TOTP secret, deletes all backup codes

### 5. State Machine

```
┌─────────────────────────────────────────────┐
│           2FA Configuration State            │
└─────────────────────────────────────────────┘

State: NO_2FA
  ├─> Enable TOTP → STATE: TOTP_ONLY
  └─> Enable SMS → STATE: SMS_ONLY

State: TOTP_ONLY
  ├─> Enable SMS → STATE: BOTH_ENABLED
  └─> Disable TOTP → STATE: NO_2FA

State: SMS_ONLY
  ├─> Enable TOTP → STATE: BOTH_ENABLED
  └─> Disable SMS → STATE: NO_2FA

State: BOTH_ENABLED
  ├─> Remove TOTP → STATE: SMS_ONLY (auto-set preference: SMS)
  ├─> Remove SMS → STATE: TOTP_ONLY (auto-set preference: AUTHENTICATOR)
  ├─> Set Preference → STATE: BOTH_ENABLED (with preference)
  └─> During Login: Can switch methods
```

### 6. Display Logic

**Show "Set Preference" UI when:**
```typescript
status.bothMethodsEnabled === true && status.preferredMethod === null
```

**Show "Switch Method" during login when:**
```typescript
// In login flow with active challenge
challenge.method !== null && status.bothMethodsEnabled === true
```

**Show "Remove Method" UI when:**
```typescript
status.bothMethodsEnabled === true
```

**Show method labels:**
```typescript
const getMethodLabel = (method: TwoFactorMethod): string => {
  return method === 'SMS' ? 'SMS' : 'Authenticator App';
};

const getMethodDescription = (method: TwoFactorMethod): string => {
  return method === 'SMS' 
    ? 'SMS verification code sent to your phone'
    : 'Authenticator app (Google Authenticator, Authy, etc.)';
};
```

---

## Error Handling

### Error Code Reference

| Error Code | HTTP Status | Trigger | User-Friendly Message | Action |
|-----------|-------------|---------|----------------------|--------|
| `UNAUTHORIZED` | 401 | Not logged in | "Please log in to continue" | Redirect to login |
| `USER_NOT_FOUND` | 404 | User doesn't exist | "Account not found" | Contact support |
| `VALIDATION_ERROR` | 400 | Invalid request data | "Please check your input and try again" | Show field errors |
| `BOTH_METHODS_REQUIRED` | 400 | Only one method enabled | "You need to enable both SMS and authenticator methods first" | Show setup instructions |
| `SINGLE_METHOD_ACTIVE` | 400 | Trying to remove only method | "You cannot remove your only 2FA method. Enable another method first or disable 2FA completely." | Disable remove button |
| `INVALID_CODE` | 400 | Wrong verification code | "Invalid verification code. Please try again." | Clear input, show attempts remaining |
| `CHALLENGE_EXPIRED` | 400 | Challenge token expired | "Your session has expired. Please log in again." | Restart login |
| `INVALID_TOKEN` | 400 | Invalid/missing challenge token | "Invalid session. Please restart the login process." | Restart login |
| `TOO_MANY_SWITCHES` | 429 | >3 method switches | "You've switched methods too many times. Please restart the login process." | Restart login |
| `SAME_METHOD` | 400 | Switching to current method | "You're already using this verification method" | Disable switch button |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | "Something went wrong. Please try again later." | Show retry button |

### Error Response Format

All errors follow this structure:

```typescript
{
  success: false;
  error: {
    code: string;        // Machine-readable error code
    message: string;     // Human-readable error message
    details?: any;       // Optional additional context (e.g., validation errors)
  }
}
```

### Handling Specific Errors

#### 1. Validation Errors

```typescript
// Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "code": "invalid_string",
        "message": "Verification code must be 6 digits",
        "path": ["verificationCode"]
      }
    ]
  }
}

// Frontend handling
if (error.code === 'VALIDATION_ERROR' && error.details) {
  // Map Zod errors to form fields
  error.details.forEach((issue: any) => {
    const field = issue.path[0];
    setFieldError(field, issue.message);
  });
}
```

#### 2. Rate Limiting (429)

```typescript
if (error.code === 'TOO_MANY_SWITCHES') {
  // Disable switch UI
  // Show countdown timer
  // Offer "Restart Login" button
  showAlert({
    type: 'warning',
    message: error.message,
    action: 'Restart Login'
  });
}
```

#### 3. Invalid Code with Attempts Remaining

Some endpoints return attempts remaining in success=false responses:

```typescript
// Check for attemptsRemaining in error response
if (!response.success && 'attemptsRemaining' in response) {
  showError(`${response.error.message}. ${response.attemptsRemaining} attempts remaining.`);
}
```

### Error Handling Strategy

```typescript
async function handleTwoFactorAction<T>(
  apiCall: () => Promise<ApiResponse<T>>
): Promise<T> {
  try {
    const response = await apiCall();
    
    if (!response.success) {
      // Handle known error codes
      switch (response.error.code) {
        case 'UNAUTHORIZED':
          router.push('/login');
          throw new Error('Session expired');
          
        case 'VALIDATION_ERROR':
          // Handle field-level errors
          if (response.error.details) {
            handleValidationErrors(response.error.details);
          }
          throw new Error(response.error.message);
          
        case 'BOTH_METHODS_REQUIRED':
        case 'SINGLE_METHOD_ACTIVE':
          // Show informational modal
          showInfoModal(response.error.message);
          throw new Error(response.error.message);
          
        case 'INVALID_CODE':
          // Clear input, let user retry
          clearCodeInput();
          throw new Error(response.error.message);
          
        case 'CHALLENGE_EXPIRED':
        case 'INVALID_TOKEN':
          // Restart login flow
          router.push('/login');
          throw new Error(response.error.message);
          
        case 'TOO_MANY_SWITCHES':
          // Show rate limit message
          showRateLimitMessage();
          throw new Error(response.error.message);
          
        default:
          // Generic error
          throw new Error(response.error.message);
      }
    }
    
    return response.data;
  } catch (error) {
    // Network or unexpected errors
    if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('An unexpected error occurred');
    }
    throw error;
  }
}
```

---

## Authorization & Permissions

### Endpoint Access Control

| Endpoint | Authentication | User Roles | Notes |
|----------|---------------|------------|-------|
| `GET /api/auth/2fa/status` | ✅ Required | All authenticated users | Returns user's own status only |
| `POST /api/auth/2fa/set-preferred-method` | ✅ Required | All authenticated users | Modifies own account only |
| `POST /api/auth/2fa/switch-method` | ❌ Not Required | Challenge token holder | Uses challenge token for auth |
| `POST /api/auth/2fa/remove-method` | ✅ Required | All authenticated users | Modifies own account only |

### Field-Level Permissions

All endpoints return/modify data for the authenticated user only. There are no field-level restrictions.

### Resource Ownership

- Users can only manage their own 2FA settings
- Challenge tokens are single-use and user-specific
- No cross-user access possible

### Admin Access

While these endpoints are user-facing, admins have separate endpoints for managing user 2FA:

- Admin endpoints: `/api/admin/users/2fa/*` (separate from this module)
- Admins cannot impersonate users for 2FA actions
- Audit logs track all 2FA changes with IP and user agent

---

## Rate Limiting & Quotas

### Rate Limits

| Action | Limit | Window | HTTP Header |
|--------|-------|--------|-------------|
| Challenge initiation | 10 requests | 15 minutes | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| Method switches per challenge | 3 switches | Per challenge (10 min) | Enforced by business logic |
| Verification attempts | 5 attempts | 15 minutes | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| SMS resend requests | 3 requests | 15 minutes | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| Failed verifications | 5 failures | 15 minutes | Account may be locked after |

### Rate Limit Headers

Backend returns standard rate limit headers:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1729437845
```

**TypeScript helper:**

```typescript
interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  
  if (!limit || !remaining || !reset) return null;
  
  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt: new Date(parseInt(reset, 10) * 1000)
  };
}

// Usage
const rateLimitInfo = parseRateLimitHeaders(response.headers);
if (rateLimitInfo && rateLimitInfo.remaining < 2) {
  showWarning(`Only ${rateLimitInfo.remaining} attempts remaining`);
}
```

### Account Lockout

After **10 consecutive failed verification attempts**, the account is locked for **15 minutes**.

**Lockout behavior:**
- All authentication attempts fail with `ACCOUNT_LOCKED` error
- User receives email notification
- Timer displayed to user: "Account locked until [time]"
- Lockout automatically expires after 15 minutes

**Frontend handling:**

```typescript
if (error.code === 'ACCOUNT_LOCKED' && error.lockedUntil) {
  const lockedUntil = new Date(error.lockedUntil);
  showLockoutMessage(lockedUntil);
  startCountdownTimer(lockedUntil);
}
```

### Displaying Rate Limits to Users

**Best practices:**

1. **Proactive warnings:**
   ```typescript
   if (remainingAttempts <= 2) {
     showWarning(`${remainingAttempts} attempts remaining before account lockout`);
   }
   ```

2. **Switch limit indicator:**
   ```typescript
   const switchCount = getSwitchCount(); // Track locally
   if (switchCount >= 2) {
     showInfo('You can switch methods 1 more time. After that, you\'ll need to restart login.');
   }
   ```

3. **Cooldown timers:**
   ```typescript
   if (resetAt) {
     const minutes = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
     showMessage(`Rate limit resets in ${minutes} minutes`);
   }
   ```

---

## User Flows

### Flow 1: Enable Second Method

**Starting state:** User has only TOTP enabled

```
1. User navigates to Security Settings
2. Frontend calls GET /api/auth/2fa/status
3. Backend returns:
   {
     bothMethodsEnabled: false,
     availableMethods: {
       totp: { enabled: true },
       sms: { enabled: false }
     },
     capabilities: {
       canSetPreference: false,
       canRemoveMethod: false
     },
     recommendations: {
       enableSms: "Add a phone number for SMS-based 2FA as a backup method"
     }
   }
4. Show "Add SMS Backup" card with recommendation
5. User clicks "Add SMS Method"
6. Frontend shows phone number input form
7. (Separate SMS setup flow - see SMS 2FA documentation)
8. After SMS setup, call GET /api/auth/2fa/status again
9. Backend now returns:
   {
     bothMethodsEnabled: true,
     capabilities: {
       canSetPreference: true,
       canRemoveMethod: true
     },
     recommendations: {
       setPreference: "Set your preferred 2FA method..."
     }
   }
10. Show "Set Preferred Method" UI
```

**UI Components Needed:**
- 2FA Status Dashboard
- Method Card (for each method)
- Enable SMS Flow
- Preference Selection Modal

---

### Flow 2: Set Preferred Method

**Starting state:** User has both methods enabled, no preference set

```
1. User navigates to Security Settings
2. Frontend displays both methods with equal priority
3. User clicks "Set Preferred Method"
4. Frontend shows modal:
   - Radio buttons: [ ] SMS  [ ] Authenticator App
   - Info text: "Your preferred method will be used by default during login"
   - 6-digit code input field
   - Info: "Enter code from your CURRENT authenticator app to confirm"
5. User selects "SMS" and enters TOTP code
6. Frontend calls POST /api/auth/2fa/set-preferred-method
   {
     "preferredMethod": "SMS",
     "verificationCode": "123456"
   }
7. Backend validates TOTP code and updates preference
8. Backend returns:
   {
     success: true,
     data: {
       preferredMethod: "SMS",
       message: "Your preferred 2FA method has been changed to SMS"
     }
   }
9. Frontend shows success toast
10. Frontend calls GET /api/auth/2fa/status to refresh UI
11. Update UI to show SMS as "Preferred" method
```

**UI Components Needed:**
- Set Preference Modal
  - Method selection (radio buttons)
  - Verification code input
  - Help text explaining current method verification
  - Submit button
- Success toast notification
- Updated method cards showing "Preferred" badge

**Error Handling:**
- Invalid code: Clear input, show error, decrement attempts remaining
- Both methods not enabled: Disable "Set Preference" button
- Network error: Show retry option

---

### Flow 3: Login with Method Switching

**Starting state:** User has both methods enabled with preferred method = TOTP

```
[Password Authentication - Separate Flow]
1. User enters email/password
2. Backend validates credentials
3. Backend detects 2FA required
4. Backend returns challenge token

[2FA Challenge Starts]
5. Frontend receives challenge token:
   {
     challengeToken: "abc123...",
     method: "AUTHENTICATOR",  // Uses preferred method
     expiresAt: "2025-10-20T15:30:00Z",
     message: "Enter code from authenticator app"
   }
6. Frontend displays 2FA verification screen:
   - Title: "Two-Factor Authentication"
   - Current method: "Authenticator App"
   - 6-digit code input
   - [Switch to SMS] button (visible because bothMethodsEnabled)
   - Challenge expires in: [countdown timer]

[User Decides to Switch]
7. User clicks "Switch to SMS"
8. Frontend disables form and shows loading
9. Frontend calls POST /api/auth/2fa/switch-method
   {
     "challengeToken": "abc123...",
     "newMethod": "SMS"
   }
10. Backend:
    - Validates challenge token is still valid
    - Confirms both methods enabled
    - Generates SMS OTP
    - Sends SMS to user's phone
    - Creates new challenge token
    - Invalidates old challenge token
11. Backend returns:
    {
      success: true,
      data: {
        challengeToken: "xyz789...",  // NEW token
        method: "SMS",
        maskedPhone: "****5678",
        expiresAt: "2025-10-20T15:30:00Z",
        message: "A verification code has been sent to ****5678"
      }
    }
12. Frontend updates UI:
    - Store NEW challenge token
    - Clear code input
    - Show "SMS" as current method
    - Update message
    - Update countdown timer
    - Show [Switch to Authenticator App] button
    - Increment switch counter (show warning if >=2)
13. User receives SMS
14. User enters SMS code
15. Frontend submits code with NEW challenge token
16. Backend verifies SMS code
17. Login successful, session created
```

**UI Components Needed:**
- 2FA Challenge Screen
  - Method indicator (dynamic)
  - Code input (6 digits)
  - Method switch button (conditional)
  - Switch count warning (conditional)
  - Countdown timer
  - Resend code button (for SMS only)
- Method switch loading state
- Success transition to dashboard

**Edge Cases:**
- Challenge expires during switch → Show "Session expired" message
- 3rd switch attempt → Show warning: "Last switch available"
- 4th switch attempt → Return error, disable switch button, show "Restart login"
- Invalid code after switch → Clear input, show attempts remaining

---

### Flow 4: Remove a Method

**Starting state:** User has both methods enabled, wants to remove SMS

```
1. User navigates to Security Settings
2. Frontend calls GET /api/auth/2fa/status
3. Frontend displays both methods
4. Each method card shows "Remove" button (because bothMethodsEnabled)
5. User clicks "Remove" on SMS card
6. Frontend shows confirmation modal:
   - Warning icon
   - Title: "Remove SMS Two-Factor Authentication"
   - Message: "Are you sure you want to remove SMS 2FA? 
     Your authenticator app will be your only 2FA method."
   - Important: "Enter a code from your AUTHENTICATOR APP to confirm"
   - 6-digit code input
   - [Cancel] [Remove SMS] buttons
7. User enters TOTP code (from authenticator)
8. Frontend calls POST /api/auth/2fa/remove-method
   {
     "methodToRemove": "SMS",
     "verificationCode": "654321"
   }
9. Backend:
   - Validates TOTP code (the method that will remain)
   - Removes phone_number and phone_verified fields
   - Deletes pending SMS verification codes
   - Sets preferred_2fa_method to "AUTHENTICATOR" automatically
   - Logs action in audit trail
10. Backend returns:
    {
      success: true,
      data: {
        removedMethod: "SMS",
        remainingMethod: "AUTHENTICATOR",
        message: "SMS 2FA has been removed. Your authenticator app remains active."
      }
    }
11. Frontend:
    - Close modal
    - Show success toast
    - Call GET /api/auth/2fa/status to refresh
    - Update UI to show only TOTP method
    - Hide "Switch Method" and "Set Preference" options
    - Show recommendation to add backup method
```

**UI Components Needed:**
- Remove Method Confirmation Modal
  - Warning message
  - Explanation of which method will remain
  - Verification code input
  - Clear instruction on which method to use for verification
  - Cancel/Confirm buttons
- Success notification
- Updated security settings page
- Recommendation card to re-enable removed method

**Error Handling:**
- Only one method active → Hide "Remove" button entirely
- Invalid verification code → Show error, clear input
- Backend error → Show error message, keep modal open with retry option

---

### Flow 5: First-Time Setup Recommendations

**Starting state:** User has TOTP only, no SMS

```
1. User navigates to Security Settings
2. Frontend calls GET /api/auth/2fa/status
3. Backend returns recommendations object:
   {
     recommendations: {
       enableSms: "Add a phone number for SMS-based 2FA as a backup method"
     }
   }
4. Frontend displays:
   - Current methods section
     - ✅ Authenticator App (Enabled, Preferred)
     - ❌ SMS (Not configured)
   - Recommendations card:
     - 💡 Icon
     - Title: "Strengthen Your Security"
     - Message: "Add a phone number for SMS-based two-factor authentication as a backup method"
     - [Add SMS Method] button
5. If user adds SMS, display new recommendation:
   {
     recommendations: {
       setPreference: "Set your preferred 2FA method to customize your login experience"
     }
   }
6. Show "Set Preference" call-to-action
```

**UI Components Needed:**
- Recommendations Card
  - Icon (lightbulb, shield, etc.)
  - Dynamic title
  - Dynamic message
  - Action button
- Method Status List
  - Check/X icons
  - Method name
  - Status badges (Enabled, Preferred, Not Configured)

---

## Frontend Implementation Checklist

### Phase 1: API Client Setup

- [ ] Create TypeScript types file with all interfaces
- [ ] Create API client functions for all 4 endpoints
- [ ] Implement request/response interceptors
- [ ] Add authentication token injection
- [ ] Implement error handling wrapper
- [ ] Add rate limit header parsing
- [ ] Create React Query (or similar) hooks for each endpoint

**Example:**

```typescript
// hooks/use2FA.ts
export const use2FAStatus = () => {
  return useQuery({
    queryKey: ['2fa', 'status'],
    queryFn: () => api2FA.getStatus(),
    staleTime: 30000, // 30 seconds
  });
};

export const useSetPreferredMethod = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: SetPreferredMethodRequest) => 
      api2FA.setPreferredMethod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
  });
};
```

---

### Phase 2: Core Components

- [ ] **2FAStatusDashboard**
  - Displays current 2FA configuration
  - Shows both method cards
  - Conditional rendering based on capabilities
  - Displays recommendations

- [ ] **MethodCard**
  - Props: method type, enabled status, preferred badge
  - Actions: Remove button (conditional)
  - Visual indicator for preferred method

- [ ] **SetPreferenceModal**
  - Method selection (radio buttons)
  - Verification code input with validation
  - Submit handler with loading state
  - Error display

- [ ] **RemoveMethodModal**
  - Warning message
  - Explanation text
  - Verification code input
  - Confirmation buttons

- [ ] **SwitchMethodButton** (for login screen)
  - Conditional visibility (bothMethodsEnabled)
  - Disabled state after 3 switches
  - Loading state during switch

- [ ] **VerificationCodeInput**
  - 6-digit input (can be 6 separate inputs or single)
  - Auto-focus behavior
  - Auto-submit on 6th digit
  - Paste support
  - Clear button

**Example:**

```typescript
// components/VerificationCodeInput.tsx
export function VerificationCodeInput({ 
  onComplete, 
  error, 
  disabled 
}: Props) {
  const [code, setCode] = useState('');
  
  const handleChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    
    if (cleaned.length === 6) {
      onComplete(cleaned);
    }
  };
  
  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className={error ? 'border-red-500' : ''}
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
```

---

### Phase 3: Pages & Routing

- [ ] **Security Settings Page** (`/settings/security`)
  - Fetch and display 2FA status
  - Show method cards
  - Show recommendations
  - Handle set preference flow
  - Handle remove method flow

- [ ] **2FA Challenge Page** (`/auth/2fa-verify`)
  - Accept challenge token from router state/query
  - Display current method
  - Show verification input
  - Show switch method button (conditional)
  - Handle method switching
  - Submit verification code
  - Handle success → redirect to dashboard
  - Handle errors → show messages

---

### Phase 4: State Management

- [ ] Store challenge token during login flow
- [ ] Track method switch count (local state)
- [ ] Cache 2FA status (React Query or similar)
- [ ] Handle token refresh after method switch
- [ ] Clear challenge state on logout
- [ ] Persist login redirect URL across 2FA flow

**Example:**

```typescript
// stores/authStore.ts (Zustand example)
interface AuthStore {
  challengeToken: string | null;
  challengeMethod: TwoFactorMethod | null;
  methodSwitchCount: number;
  setChallengeData: (token: string, method: TwoFactorMethod) => void;
  incrementSwitchCount: () => void;
  clearChallenge: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  challengeToken: null,
  challengeMethod: null,
  methodSwitchCount: 0,
  setChallengeData: (token, method) => 
    set({ challengeToken: token, challengeMethod: method }),
  incrementSwitchCount: () => 
    set((state) => ({ methodSwitchCount: state.methodSwitchCount + 1 })),
  clearChallenge: () => 
    set({ challengeToken: null, challengeMethod: null, methodSwitchCount: 0 }),
}));
```

---

### Phase 5: Error & Edge Case Handling

- [ ] Handle network timeouts
- [ ] Handle challenge token expiration
- [ ] Display rate limit warnings
- [ ] Show countdown timers for locked accounts
- [ ] Handle account lockout state
- [ ] Show validation errors on form fields
- [ ] Handle "both methods required" state gracefully
- [ ] Implement retry logic for failed requests
- [ ] Add optimistic UI updates where appropriate

---

### Phase 6: UX Enhancements

- [ ] Add loading skeletons for async states
- [ ] Implement smooth transitions between method switches
- [ ] Add confirmation dialogs for destructive actions
- [ ] Show progress indicators during multi-step flows
- [ ] Display helpful tooltips
- [ ] Add keyboard shortcuts (Enter to submit, Esc to close modals)
- [ ] Implement auto-focus on code inputs
- [ ] Add copy/paste support for codes
- [ ] Show masked phone numbers correctly
- [ ] Display clear instructions for each method

---

### Phase 7: Testing

- [ ] Unit tests for API client functions
- [ ] Integration tests for hooks
- [ ] Component tests for all UI components
- [ ] E2E tests for complete user flows
- [ ] Test error scenarios
- [ ] Test rate limiting behavior
- [ ] Test expired challenge token handling
- [ ] Test method switching (all combinations)
- [ ] Test with both methods enabled/disabled
- [ ] Accessibility testing (screen readers, keyboard navigation)

---

### Phase 8: Documentation

- [ ] Add JSDoc comments to all functions
- [ ] Document props for all components
- [ ] Create Storybook stories for components
- [ ] Write user-facing help documentation
- [ ] Add inline help text in UI
- [ ] Create troubleshooting guide

---

## Edge Cases & UX Considerations

### 1. Challenge Token Expiration

**Scenario:** User starts 2FA challenge, leaves tab open for 15 minutes, returns and tries to submit code.

**Backend Behavior:**
- Challenge expires after 10 minutes
- Returns `CHALLENGE_EXPIRED` error

**Frontend Handling:**
```typescript
// Implement countdown timer
useEffect(() => {
  const expiresAt = new Date(challenge.expiresAt);
  const interval = setInterval(() => {
    const remaining = expiresAt.getTime() - Date.now();
    
    if (remaining <= 0) {
      clearInterval(interval);
      showExpiredMessage();
      disableForm();
    } else {
      setTimeRemaining(remaining);
    }
  }, 1000);
  
  return () => clearInterval(interval);
}, [challenge]);

// Show countdown
<p>Code expires in {formatTime(timeRemaining)}</p>
```

**UX Recommendations:**
- Show countdown timer prominently
- Warning at 2 minutes remaining
- Auto-disable form when expired
- Show "Restart Login" button
- Clear explanation: "Your session expired for security. Please log in again."

---

### 2. Maximum Method Switches Exceeded

**Scenario:** User switches methods 3 times during login (SMS → TOTP → SMS → TOTP).

**Backend Behavior:**
- 4th switch attempt returns `TOO_MANY_SWITCHES` error

**Frontend Handling:**
```typescript
const [switchCount, setSwitchCount] = useState(0);

const handleMethodSwitch = async (newMethod: TwoFactorMethod) => {
  if (switchCount >= 3) {
    showError('Maximum method switches reached. Please restart login.');
    return;
  }
  
  // Perform switch
  const result = await switchMethod(challengeToken, newMethod);
  setSwitchCount(prev => prev + 1);
  
  // Show warning after 2nd switch
  if (switchCount === 1) {
    showWarning('You can switch methods 1 more time');
  }
};
```

**UX Recommendations:**
- Track and display switch count
- Show warning after 2nd switch: "1 switch remaining"
- Disable switch button after 3rd switch
- Show clear message: "You've used all available method switches"
- Offer "Restart Login" button
- Consider adding "Why is there a limit?" help tooltip

---

### 3. User Has Only One Method

**Scenario:** User has only TOTP enabled, tries to access method switching features.

**Backend Behavior:**
- `capabilities.canSetPreference = false`
- `capabilities.canRemoveMethod = false`
- Switch method endpoint returns `BOTH_METHODS_REQUIRED`

**Frontend Handling:**
```typescript
// Disable features based on capabilities
const { data: status } = use2FAStatus();

return (
  <>
    <Button 
      onClick={openSetPreferenceModal}
      disabled={!status?.capabilities.canSetPreference}
    >
      Set Preferred Method
    </Button>
    
    {!status?.capabilities.canSetPreference && (
      <Tooltip>
        You need to enable both SMS and authenticator methods 
        to set a preference
      </Tooltip>
    )}
  </>
);
```

**UX Recommendations:**
- Hide or disable unavailable features
- Show tooltips explaining why features are disabled
- Display recommendation card: "Add SMS as backup method"
- Make it easy to enable second method
- Don't show "Switch Method" button during login

---

### 4. SMS Delivery Delays

**Scenario:** User switches to SMS, but SMS takes 30-60 seconds to arrive.

**Backend Behavior:**
- SMS sent immediately
- Code valid for 5 minutes
- User can resend after rate limit

**Frontend Handling:**
```typescript
const [smsSentAt, setSmsSentAt] = useState<Date | null>(null);
const [resendAvailable, setResendAvailable] = useState(false);

useEffect(() => {
  if (method === 'SMS' && smsSentAt) {
    const timer = setTimeout(() => {
      setResendAvailable(true);
    }, 30000); // 30 seconds
    
    return () => clearTimeout(timer);
  }
}, [method, smsSentAt]);

const handleResend = async () => {
  await resendSMSCode(challengeToken);
  setSmsSentAt(new Date());
  setResendAvailable(false);
};

return (
  <>
    <p>SMS sent to {maskedPhone}</p>
    {!resendAvailable && (
      <p className="text-gray-500">
        Didn't receive it? You can resend in {countdown} seconds
      </p>
    )}
    {resendAvailable && (
      <Button onClick={handleResend}>Resend Code</Button>
    )}
  </>
);
```

**UX Recommendations:**
- Show "SMS sent" confirmation immediately
- Display masked phone number
- Show "Resend" button after 30 seconds
- Show help text: "It may take up to 1 minute"
- Offer "Switch to Authenticator App" as alternative
- Track resend attempts (max 3 per 15 minutes)

---

### 5. User Accidentally Removes Wrong Method

**Scenario:** User meant to remove SMS but clicked remove on TOTP.

**Frontend Handling:**
```typescript
const handleRemoveMethod = (method: TwoFactorMethod) => {
  const otherMethod = method === 'SMS' ? 'Authenticator App' : 'SMS';
  
  showConfirmationDialog({
    title: `Remove ${getMethodLabel(method)}?`,
    message: `Are you sure? Your ${otherMethod} will become your only 2FA method.`,
    confirmLabel: `Yes, Remove ${getMethodLabel(method)}`,
    cancelLabel: 'Cancel',
    danger: true,
    onConfirm: () => performRemoval(method)
  });
};
```

**UX Recommendations:**
- Clear confirmation dialog with method names
- Use danger styling (red) for confirmation button
- Spell out which method will remain
- Show "Cancel" button prominently
- Consider adding "Undo" option after removal (time-limited)
- Log action in user's activity log

---

### 6. Network Interruption During Switch

**Scenario:** Network drops while switching methods.

**Frontend Handling:**
```typescript
const handleMethodSwitch = async (newMethod: TwoFactorMethod) => {
  try {
    setLoading(true);
    const result = await switchMethod(challengeToken, newMethod);
    
    // Update local state with new token
    setChallengeToken(result.challengeToken);
    setMethod(result.method);
    setLoading(false);
  } catch (error) {
    setLoading(false);
    
    if (error instanceof NetworkError) {
      // Network error - retry
      showRetryDialog({
        message: 'Network connection lost. Retry method switch?',
        onRetry: () => handleMethodSwitch(newMethod)
      });
    } else {
      // Other error - handle normally
      handleError(error);
    }
  }
};
```

**UX Recommendations:**
- Show loading state during switch
- Disable all inputs during switch
- Implement retry logic for network errors
- Don't increment switch count if request fails
- Show clear error message
- Maintain original challenge state if switch fails

---

### 7. User Forgets Which Method They're Using

**Scenario:** User has both methods enabled, starts login, forgets which device has authenticator app.

**Frontend Handling:**
```typescript
return (
  <div className="2fa-challenge">
    <h2>Two-Factor Authentication</h2>
    
    {/* Clear current method indicator */}
    <div className="current-method-badge">
      <Icon name={method === 'SMS' ? 'phone' : 'shield'} />
      <span>
        {method === 'SMS' ? 'SMS Verification' : 'Authenticator App'}
      </span>
    </div>
    
    {/* Instructions */}
    <p className="instructions">
      {method === 'SMS' 
        ? `Enter the 6-digit code sent to ${maskedPhone}`
        : 'Enter the 6-digit code from your authenticator app'}
    </p>
    
    {/* Switch option */}
    {canSwitch && (
      <button onClick={handleSwitch}>
        {method === 'SMS' 
          ? 'Use Authenticator App Instead'
          : 'Use SMS Instead'}
      </button>
    )}
  </div>
);
```

**UX Recommendations:**
- Show large, clear icon for current method
- Display method name prominently
- Include helpful description
- Show masked phone for SMS
- Make switch button clearly labeled
- Add help text: "Can't access your [method]? Switch to [other method]"

---

### 8. First-Time User Confusion

**Scenario:** User just enabled both methods, doesn't understand "preferred method" concept.

**Frontend Handling:**
```typescript
{status.bothMethodsEnabled && !status.preferredMethod && (
  <InfoCard>
    <Icon name="lightbulb" />
    <h3>Set Your Preferred Method</h3>
    <p>
      Now that you have both SMS and authenticator app 2FA enabled, 
      you can choose which one you prefer to use during login. 
      Don't worry—you can always switch to the other method if needed.
    </p>
    <Button onClick={openSetPreferenceModal}>
      Choose Preferred Method
    </Button>
  </InfoCard>
)}
```

**UX Recommendations:**
- Show educational card after enabling second method
- Use friendly, non-technical language
- Include visual illustrations
- Add "Learn More" link to help docs
- Allow user to dismiss if they don't want to set preference yet
- Re-show recommendation on next visit if not set

---

### 9. User Loses Phone (Has Both Methods)

**Scenario:** User loses phone with SMS number, but still has authenticator app.

**Frontend Handling:**
During login:
```typescript
// User initiates login, challenge uses SMS (preferred method)
// User can't access phone

<button onClick={() => switchMethod('AUTHENTICATOR')}>
  Can't access your phone? Use Authenticator App
</button>
```

In settings (after logging in with TOTP):
```typescript
// User wants to remove lost phone
<Button onClick={() => openRemoveMethodModal('SMS')}>
  Remove SMS Method
</Button>

// In modal: verify with TOTP (still accessible)
```

**UX Recommendations:**
- Make method switching very visible during login
- Add "Lost access?" help links
- In settings, add "Update Phone Number" option
- Show clear path to remove/update lost method
- Document recovery process in help center
- Consider "I lost my device" quick action

---

### 10. Backup Codes Running Low

**Scenario:** User removed SMS, only has TOTP left, backup codes down to 2.

**Frontend Handling:**
```typescript
const { data: status } = use2FAStatus();

{status.backupCodes.remaining < 3 && status.bothMethodsEnabled === false && (
  <WarningCard>
    <Icon name="alert-triangle" />
    <h3>Low on Backup Codes</h3>
    <p>
      You have only {status.backupCodes.remaining} backup codes left. 
      We recommend regenerating them or adding SMS as a backup method.
    </p>
    <div className="actions">
      <Button onClick={regenerateBackupCodes}>
        Regenerate Backup Codes
      </Button>
      <Button variant="secondary" onClick={startSMSSetup}>
        Add SMS Backup
      </Button>
    </div>
  </WarningCard>
)}
```

**UX Recommendations:**
- Show warning when backup codes < 3
- Offer two solutions: regenerate codes or add SMS
- Make it easy to take action
- Explain importance of backup access
- Don't be too alarming, but emphasize importance

---

### 11. Copy/Paste 6-Digit Codes

**Scenario:** User receives SMS code, wants to paste it instead of typing.

**Frontend Handling:**
```typescript
const handlePaste = (e: React.ClipboardEvent) => {
  e.preventDefault();
  const pastedData = e.clipboardData.getData('text');
  
  // Extract 6 digits from pasted content
  const digits = pastedData.replace(/\D/g, '').slice(0, 6);
  
  if (digits.length === 6) {
    setCode(digits);
    onComplete(digits);
  }
};

<input
  type="text"
  onPaste={handlePaste}
  // ... other props
/>
```

**UX Recommendations:**
- Support paste automatically
- Extract digits from formatted text ("Your code is: 123-456")
- Auto-submit when pasted code is valid
- Show visual feedback that paste worked
- Support autofill from SMS on iOS

---

### 12. Mobile vs Desktop Experience

**Scenario:** User on mobile can receive SMS in same device they're logging in from.

**Frontend Handling:**
```typescript
// Detect mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// iOS SMS autofill
{isMobile && method === 'SMS' && (
  <input
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"  // Enables iOS autofill
    // ... other props
  />
)}

// Android SMS autofill
{isMobile && method === 'SMS' && (
  // Use Web OTP API if available
  <button onClick={requestSMSOTP}>Auto-fill from SMS</button>
)}
```

**UX Recommendations:**
- Enable SMS autofill on mobile (iOS/Android)
- Larger touch targets for mobile
- Adjust keyboard type (numeric for codes)
- Consider device-specific instructions
- Test on various screen sizes

---

## Summary

This document provides everything needed to implement the 2FA Method Switching module on the frontend:

### What You Can Build

1. **Security Settings UI**
   - Display 2FA status
   - Show enabled methods with badges
   - Set preferred method
   - Remove methods
   - Show recommendations

2. **Login Flow Enhancement**
   - 2FA challenge screen
   - Method switching during login
   - Clear instructions per method
   - Error handling with retry

3. **User Education**
   - Help tooltips
   - Recommendation cards
   - Clear instructions
   - Progressive disclosure

### Key Takeaways

- ✅ Both methods can be enabled simultaneously
- ✅ Users can set preference but aren't required to
- ✅ During login, users can switch between methods (max 3 times)
- ✅ Removing a method requires verification from remaining method
- ✅ System automatically adjusts preference when removing methods
- ✅ Rate limits protect against abuse
- ✅ All actions are logged and audited

### Next Steps

1. Review API endpoints and test with curl/Postman
2. Implement TypeScript types
3. Build core components
4. Integrate into existing auth flow
5. Add comprehensive error handling
6. Test all user flows
7. Document for your team

---

**Questions or Issues?**

If you encounter any ambiguities or need clarification:
1. Check the Backend API directly at `ops.yesgoddess.agency`
2. Review the authentication documentation
3. Consult the complete 2FA implementation docs
4. Reach out to backend team with specific questions

**Related Documentation:**
- AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md
- 2FA_CHALLENGE_ENDPOINTS_IMPLEMENTATION.md
- FRONTEND_INTEGRATION_AUTHENTICATION.md
