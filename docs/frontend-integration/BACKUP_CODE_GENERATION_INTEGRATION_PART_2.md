# 🔒 Backup Code Generation - Frontend Integration Guide (Part 2 of 3)

**Module Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

---

## Table of Contents

### This Document (Part 2)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)

---

## Business Logic & Validation Rules

### Backup Code Format

**Format:** `XXXX-XXXX`
- **Length:** 8 alphanumeric characters + 1 dash separator (9 total)
- **Character Set:** A-Z and 0-9 (uppercase only)
- **Example:** `ABCD-1234`, `XY7Z-9A2B`

**Frontend Input Handling:**
```typescript
// Normalize user input
function normalizeBackupCode(input: string): string {
  // Remove all whitespace
  const cleaned = input.replace(/\s/g, '');
  
  // Convert to uppercase
  const uppercase = cleaned.toUpperCase();
  
  // Remove existing dashes (user might type it)
  const noDashes = uppercase.replace(/-/g, '');
  
  // Add dash in the middle if not present
  if (noDashes.length === 8) {
    return `${noDashes.slice(0, 4)}-${noDashes.slice(4)}`;
  }
  
  return uppercase;
}

// Example usage
normalizeBackupCode('abcd 1234');    // → "ABCD-1234"
normalizeBackupCode('ABCD-1234');    // → "ABCD-1234"
normalizeBackupCode('abcd1234');     // → "ABCD-1234"
```

**Validation Rules:**
```typescript
function validateBackupCode(code: string): {
  isValid: boolean;
  error?: string;
} {
  const normalized = normalizeBackupCode(code);
  
  // Check length
  if (normalized.length !== 9) {
    return {
      isValid: false,
      error: 'Backup code must be 8 characters (format: XXXX-XXXX)',
    };
  }
  
  // Check format (4 chars - dash - 4 chars)
  const formatRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!formatRegex.test(normalized)) {
    return {
      isValid: false,
      error: 'Invalid backup code format',
    };
  }
  
  return { isValid: true };
}
```

---

### Password Verification Rules

When regenerating backup codes, password verification is required:

**Requirements:**
- ✅ Must match user's current password exactly
- ✅ Case-sensitive
- ✅ No password strength requirements (current password accepted as-is)
- ✅ Failed attempts logged in audit trail
- ❌ Does NOT trigger account lockout (use rate limiting instead)

**Frontend Validation:**
```typescript
function validatePasswordForRegeneration(password: string): {
  isValid: boolean;
  error?: string;
} {
  // Minimum validation - just check not empty
  if (!password || password.trim().length === 0) {
    return {
      isValid: false,
      error: 'Password is required',
    };
  }
  
  // No max length client-side (backend handles this)
  return { isValid: true };
}
```

---

### Backup Code Count Logic

**State Machine:**

```typescript
type BackupCodeState = 
  | { status: 'healthy'; remaining: 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 }
  | { status: 'low'; remaining: 2 | 1 }
  | { status: 'depleted'; remaining: 0 };

function getBackupCodeState(remaining: number): BackupCodeState {
  if (remaining >= 3) {
    return { status: 'healthy', remaining: remaining as any };
  } else if (remaining > 0) {
    return { status: 'low', remaining: remaining as any };
  } else {
    return { status: 'depleted', remaining: 0 };
  }
}
```

**UI Display Logic:**

```typescript
interface BackupCodeDisplay {
  color: string;
  icon: string;
  message: string;
  showRegenerate: boolean;
  urgency: 'none' | 'warning' | 'critical';
}

function getBackupCodeDisplay(remaining: number): BackupCodeDisplay {
  if (remaining >= 3) {
    return {
      color: 'green',
      icon: '✅',
      message: `${remaining} backup codes available`,
      showRegenerate: false,
      urgency: 'none',
    };
  } else if (remaining === 2) {
    return {
      color: 'amber',
      icon: '⚠️',
      message: `Only ${remaining} backup codes remaining`,
      showRegenerate: true,
      urgency: 'warning',
    };
  } else if (remaining === 1) {
    return {
      color: 'orange',
      icon: '⚠️',
      message: `Only 1 backup code remaining!`,
      showRegenerate: true,
      urgency: 'warning',
    };
  } else {
    return {
      color: 'red',
      icon: '❌',
      message: 'No backup codes remaining - regenerate immediately',
      showRegenerate: true,
      urgency: 'critical',
    };
  }
}
```

---

### Temporary Token Rules

Used during multi-step login flow:

**Properties:**
- Generated during initial login (Step 1)
- Valid for 10 minutes
- Single-use only (consumed when used)
- Stored server-side (not in JWT)
- Cannot be refreshed or extended

**Frontend Handling:**
```typescript
interface TemporaryTokenData {
  token: string;
  expiresAt: string;  // ISO timestamp
  createdAt: Date;
}

function isTemporaryTokenExpired(tokenData: TemporaryTokenData): boolean {
  const expiresAt = new Date(tokenData.expiresAt);
  const now = new Date();
  return now >= expiresAt;
}

function getTemporaryTokenTimeRemaining(tokenData: TemporaryTokenData): number {
  const expiresAt = new Date(tokenData.expiresAt);
  const now = new Date();
  const remaining = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(remaining / 1000)); // seconds
}
```

---

### Trust Device Logic

**Rules:**
- Only available during login with backup code
- Creates a device token valid for 30 days
- Bypasses 2FA for trusted devices
- User can revoke trusted devices anytime
- Maximum 5 trusted devices per user

**UI Considerations:**
```typescript
interface TrustDeviceOption {
  enabled: boolean;
  label: string;
  description: string;
  warning?: string;
}

function getTrustDeviceOption(
  isMobileDevice: boolean,
  isSharedDevice: boolean
): TrustDeviceOption {
  if (isSharedDevice) {
    return {
      enabled: false,
      label: 'Trust this device',
      description: 'Not recommended on shared devices',
      warning: '⚠️ This appears to be a shared device',
    };
  }
  
  return {
    enabled: true,
    label: 'Trust this device for 30 days',
    description: 'Skip 2FA on this device until ' + 
                 new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  };
}
```

---

## Error Handling

### Error Response Structure

All errors follow this structure:

```typescript
interface BackupCodeError {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
  };
}
```

---

### Error Codes Reference

#### Authentication Errors

| Error Code | HTTP Status | Message | User-Friendly Message | When It Occurs |
|------------|-------------|---------|----------------------|----------------|
| `UNAUTHORIZED` | 401 | Authentication required | Please log in to continue | No valid session/JWT |
| `INVALID_CREDENTIALS` | 401 | Invalid email or password | Incorrect password | Password verification failed |
| `INVALID_CURRENT_PASSWORD` | 401 | Current password is incorrect | The password you entered is incorrect | Wrong password for regeneration |
| `INVALID_SESSION` | 401 | Session expired | Your session has expired. Please log in again | JWT/session expired |

#### Backup Code Specific Errors

| Error Code | HTTP Status | Message | User-Friendly Message | When It Occurs |
|------------|-------------|---------|----------------------|----------------|
| `BACKUP_CODE_INVALID` | 401 | Invalid backup code | This backup code is not valid. Please try another code. | Code doesn't match any stored codes |
| `BACKUP_CODE_ALREADY_USED` | 400 | This backup code has already been used | This backup code has already been used. Please try a different code. | Code was already marked as used |
| `NO_BACKUP_CODES_REMAINING` | 400 | No backup codes remaining. Please contact support. | You have no backup codes left. Please contact support to regain access. | All codes used, cannot verify |
| `TOTP_NOT_ENABLED` | 400 | Two-factor authentication is not enabled | Two-factor authentication is not set up for your account | Trying to regenerate without 2FA enabled |

#### Token Errors

| Error Code | HTTP Status | Message | User-Friendly Message | When It Occurs |
|------------|-------------|---------|----------------------|----------------|
| `TEMP_TOKEN_INVALID` | 401 | Invalid temporary authentication token | Invalid authentication token. Please start login again. | Token doesn't exist or malformed |
| `TEMP_TOKEN_EXPIRED` | 401 | Temporary authentication token has expired | Your authentication session expired. Please log in again. | Token older than 10 minutes |
| `TEMP_TOKEN_ALREADY_USED` | 401 | Temporary authentication token has already been used | This authentication token was already used. Please log in again. | Token already consumed |

#### Validation Errors

| Error Code | HTTP Status | Message | User-Friendly Message | When It Occurs |
|------------|-------------|---------|----------------------|----------------|
| `VALIDATION_ERROR` | 400 | Invalid request data | Please check your input and try again | Zod validation failed |

#### Rate Limiting

| Error Code | HTTP Status | Message | User-Friendly Message | When It Occurs |
|------------|-------------|---------|----------------------|----------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests. Try again later | You've made too many attempts. Please wait before trying again. | Rate limit exceeded |

#### Server Errors

| Error Code | HTTP Status | Message | User-Friendly Message | When It Occurs |
|------------|-------------|---------|----------------------|----------------|
| `INTERNAL_SERVER_ERROR` | 500 | Failed to [operation] | Something went wrong. Please try again later. | Unexpected server error |

---

### Error Handling Strategy

```typescript
// Error handler helper
function handleBackupCodeError(error: BackupCodeError): {
  title: string;
  message: string;
  action?: string;
  severity: 'error' | 'warning';
} {
  switch (error.error.code) {
    case 'BACKUP_CODE_INVALID':
      return {
        title: 'Invalid Backup Code',
        message: 'This backup code is not valid. Please check and try again.',
        action: 'Try another backup code',
        severity: 'error',
      };
      
    case 'BACKUP_CODE_ALREADY_USED':
      return {
        title: 'Code Already Used',
        message: 'This backup code was already used. Each code can only be used once.',
        action: 'Use a different backup code',
        severity: 'error',
      };
      
    case 'NO_BACKUP_CODES_REMAINING':
      return {
        title: 'No Backup Codes Left',
        message: 'You have used all your backup codes. Please contact support for help accessing your account.',
        action: 'Contact Support',
        severity: 'error',
      };
      
    case 'TEMP_TOKEN_EXPIRED':
      return {
        title: 'Session Expired',
        message: 'Your authentication session has timed out.',
        action: 'Start login again',
        severity: 'warning',
      };
      
    case 'INVALID_CURRENT_PASSWORD':
      return {
        title: 'Incorrect Password',
        message: 'The password you entered is incorrect.',
        action: 'Try again',
        severity: 'error',
      };
      
    case 'RATE_LIMIT_EXCEEDED':
      return {
        title: 'Too Many Attempts',
        message: 'You\'ve made too many attempts. Please wait a few minutes before trying again.',
        severity: 'warning',
      };
      
    default:
      return {
        title: 'Something Went Wrong',
        message: error.error.message || 'An unexpected error occurred. Please try again.',
        severity: 'error',
      };
  }
}
```

---

### Error Display Recommendations

**Toast Notifications:**
```typescript
// For transient errors during actions
function showBackupCodeErrorToast(error: BackupCodeError) {
  const handled = handleBackupCodeError(error);
  
  toast({
    title: handled.title,
    description: handled.message,
    variant: handled.severity === 'error' ? 'destructive' : 'warning',
    duration: 5000,
  });
}
```

**Inline Form Errors:**
```typescript
// For validation errors on inputs
function getInlineError(error: BackupCodeError): string | null {
  if (error.error.code === 'VALIDATION_ERROR' && error.error.details) {
    // Extract Zod validation errors
    const zodErrors = error.error.details as Array<{
      path: string[];
      message: string;
    }>;
    
    return zodErrors[0]?.message || null;
  }
  
  return null;
}
```

---

## Authorization & Permissions

### Role-Based Access Control

**All Users (Authenticated):**
- ✅ View their own backup code status
- ✅ Regenerate their own backup codes
- ✅ Use backup codes for login
- ❌ View or manage other users' backup codes

**Admin Role:**
- ✅ All user permissions above
- ✅ View backup code statistics (aggregate only)
- ✅ View security events related to backup codes
- ❌ View or regenerate codes for other users (security policy)

### Permission Matrix

| Action | Endpoint | ADMIN | CREATOR | BRAND | VIEWER | Unauthenticated |
|--------|----------|-------|---------|-------|--------|-----------------|
| View own backup code count | GET `/api/auth/2fa/status` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Regenerate own codes | POST `/api/auth/2fa/totp/backup-codes/regenerate` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Use backup code during login | POST `/api/auth/2fa/verify-backup-code` | ✅ | ✅ | ✅ | ✅ | ⚠️ Partial* |

*Partial: Unauthenticated users can use backup codes during the login flow (with temporary token from Step 1).

---

### Resource Ownership

**Rules:**
- Users can ONLY manage their own backup codes
- No mechanism for admins to view/regenerate codes for other users
- Backend enforces userId from session (cannot be spoofed)

**Frontend Implementation:**
```typescript
// Always use authenticated user's ID from session
function RegenerateBackupCodesButton() {
  const { user } = useAuth();  // Get from session
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  const handleRegenerate = async (password: string) => {
    setIsRegenerating(true);
    
    try {
      // Backend automatically uses session userId
      const response = await fetch('/api/auth/2fa/totp/backup-codes/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ password }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      
      const data = await response.json();
      // Handle success - display codes
      handleRegenerateSuccess(data.data.backupCodes);
      
    } catch (error) {
      handleBackupCodeError(error);
    } finally {
      setIsRegenerating(false);
    }
  };
  
  return (
    <button onClick={() => promptForPassword(handleRegenerate)}>
      Regenerate Backup Codes
    </button>
  );
}
```

---

## Rate Limiting & Quotas

### Rate Limits Per Endpoint

#### GET `/api/auth/2fa/status`
- **Limit:** 60 requests per minute per user
- **Scope:** Per authenticated user
- **Headers:** None specific
- **On Exceed:** HTTP 429, standard error response

#### POST `/api/auth/2fa/totp/backup-codes/regenerate`
- **Limit:** 3 requests per 15 minutes per user
- **Scope:** Per authenticated user
- **Reason:** Prevent abuse/automation
- **Headers:** None specific
- **On Exceed:** HTTP 429 with retry-after suggestion

#### POST `/api/auth/2fa/verify-backup-code`
- **Limit:** 10 requests per 15 minutes per IP
- **Scope:** Per IP address (not user, since pre-auth)
- **Reason:** Prevent brute force attacks
- **Additional Protection:** Failed attempts logged for monitoring
- **On Exceed:** HTTP 429, temporary lockout

---

### Rate Limit Headers

When rate limits are active, check these response headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Maximum requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining
  'X-RateLimit-Reset': string;      // Unix timestamp when limit resets
  'Retry-After'?: string;           // Seconds to wait (on 429 only)
}

// Usage example
function handleRateLimitHeaders(response: Response) {
  const limit = response.headers.get('X-RateLimit-Limit');
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');
  
  if (remaining && parseInt(remaining) < 3) {
    // Warn user they're approaching limit
    showWarning(`You have ${remaining} attempts remaining`);
  }
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const seconds = retryAfter ? parseInt(retryAfter) : 60;
    
    // Disable submit button with countdown
    disableFormFor(seconds);
  }
}
```

---

### Frontend Rate Limit Handling

```typescript
// Client-side rate limit tracking (backup to server enforcement)
class BackupCodeRateLimiter {
  private attempts: Map<string, number[]> = new Map();
  
  canAttempt(action: 'regenerate' | 'verify'): boolean {
    const key = action;
    const now = Date.now();
    const windowMs = action === 'regenerate' ? 15 * 60 * 1000 : 15 * 60 * 1000;
    const maxAttempts = action === 'regenerate' ? 3 : 10;
    
    const timestamps = this.attempts.get(key) || [];
    const recentAttempts = timestamps.filter(ts => now - ts < windowMs);
    
    return recentAttempts.length < maxAttempts;
  }
  
  recordAttempt(action: 'regenerate' | 'verify'): void {
    const key = action;
    const timestamps = this.attempts.get(key) || [];
    timestamps.push(Date.now());
    this.attempts.set(key, timestamps);
  }
  
  getTimeUntilNextAttempt(action: 'regenerate' | 'verify'): number {
    const key = action;
    const now = Date.now();
    const windowMs = action === 'regenerate' ? 15 * 60 * 1000 : 15 * 60 * 1000;
    
    const timestamps = this.attempts.get(key) || [];
    const oldestRelevantAttempt = timestamps.find(ts => now - ts < windowMs);
    
    if (oldestRelevantAttempt) {
      return Math.max(0, windowMs - (now - oldestRelevantAttempt));
    }
    
    return 0;
  }
}

// Usage
const rateLimiter = new BackupCodeRateLimiter();

function handleRegenerateClick() {
  if (!rateLimiter.canAttempt('regenerate')) {
    const waitTime = Math.ceil(rateLimiter.getTimeUntilNextAttempt('regenerate') / 1000);
    toast.error(`Please wait ${waitTime} seconds before trying again`);
    return;
  }
  
  rateLimiter.recordAttempt('regenerate');
  // Proceed with regeneration
}
```

---

## Next Steps

Continue to **Part 3** for:
- Complete frontend implementation checklist
- UX considerations and best practices
- Security guidelines
- Example React components
- Testing recommendations

