# Frontend Integration Guide: Twilio SMS 2FA - Part 2
## Business Logic, Validation, Error Handling, and Permissions

🔒 **Classification: HYBRID** - Core functionality with different access levels

---

## Table of Contents
- [Business Logic & Validation Rules](#business-logic--validation-rules)
- [Error Handling](#error-handling)
- [Authorization & Permissions](#authorization--permissions)
- [Rate Limiting & Quotas](#rate-limiting--quotas)

---

## Business Logic & Validation Rules

### Phone Number Validation

**Format Requirements:**
- **Must be E.164 international format**: `+[country code][number]`
- Examples: `+12345678901` (US), `+447911123456` (UK)
- Regex: `/^\+[1-9]\d{1,14}$/`

**Frontend Validation:**
```typescript
function validatePhoneNumber(phoneNumber: string): { valid: boolean; error?: string } {
  // Check E.164 format
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  
  if (!phoneNumber) {
    return { valid: false, error: 'Phone number is required' };
  }
  
  if (!phoneNumber.startsWith('+')) {
    return { valid: false, error: 'Phone number must start with + (country code)' };
  }
  
  if (!e164Regex.test(phoneNumber)) {
    return { valid: false, error: 'Phone number must be in E.164 format (e.g., +12345678901)' };
  }
  
  // Check length (max 15 digits including country code)
  if (phoneNumber.length > 16) {
    return { valid: false, error: 'Phone number is too long' };
  }
  
  return { valid: true };
}
```

**Phone Number Formatter:**
```typescript
/**
 * Format user input to E.164
 * Example: "(555) 123-4567" → "+15551234567" (assuming US)
 */
function formatToE164(input: string, defaultCountryCode = '1'): string {
  // Remove all non-digit characters
  const digits = input.replace(/\D/g, '');
  
  // If doesn't start with country code, prepend default
  if (!input.startsWith('+')) {
    return `+${defaultCountryCode}${digits}`;
  }
  
  return `+${digits}`;
}

/**
 * Display formatted phone number to user
 * Example: "+15551234567" → "(555) 123-4567"
 */
function formatPhoneDisplay(e164Phone: string): string {
  if (!e164Phone.startsWith('+1')) return e164Phone;
  
  const digits = e164Phone.slice(2); // Remove +1
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  return e164Phone;
}
```

### Verification Code Validation

**Code Requirements:**
- **Length**: Exactly 6 digits
- **Format**: Numeric only (0-9)
- **Regex**: `/^\d{6}$/`
- **Expiry**: 5 minutes from generation
- **Max Attempts**: 3 per code

**Frontend Validation:**
```typescript
function validateVerificationCode(code: string): { valid: boolean; error?: string } {
  if (!code) {
    return { valid: false, error: 'Verification code is required' };
  }
  
  if (code.length !== 6) {
    return { valid: false, error: 'Code must be 6 digits' };
  }
  
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, error: 'Code must contain only numbers' };
  }
  
  return { valid: true };
}
```

**Code Input Component Pattern:**
```typescript
// Example: Split 6-digit code into individual inputs
function CodeInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;
    
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    
    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Call onComplete when all filled
    if (newDigits.every(d => d !== '')) {
      onComplete(newDigits.join(''));
    }
  };
  
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };
  
  return (
    <div className="flex gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => inputRefs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-12 h-12 text-center text-2xl border rounded"
        />
      ))}
    </div>
  );
}
```

### 2FA Method Selection Logic

**State Machine:**

```typescript
type TwoFactorState = 
  | 'DISABLED'           // No 2FA enabled
  | 'SMS_ONLY'           // Only SMS enabled
  | 'TOTP_ONLY'          // Only TOTP enabled
  | 'BOTH_SMS_PREFERRED' // Both enabled, SMS is default
  | 'BOTH_TOTP_PREFERRED'; // Both enabled, TOTP is default

function get2FAState(user: User2FAFields): TwoFactorState {
  const hasSMS = user.phone_verified;
  const hasTOTP = user.two_factor_enabled && !!user.two_factor_secret;
  
  if (!hasSMS && !hasTOTP) return 'DISABLED';
  if (hasSMS && !hasTOTP) return 'SMS_ONLY';
  if (!hasSMS && hasTOTP) return 'TOTP_ONLY';
  
  // Both enabled - check preference
  if (user.preferred_2fa_method === 'SMS') {
    return 'BOTH_SMS_PREFERRED';
  }
  return 'BOTH_TOTP_PREFERRED';
}

/**
 * Determine which 2FA challenge to show during login
 */
function get2FAChallenge(user: User2FAFields): 'SMS' | 'AUTHENTICATOR' | null {
  const state = get2FAState(user);
  
  switch (state) {
    case 'DISABLED':
      return null;
    case 'SMS_ONLY':
      return 'SMS';
    case 'TOTP_ONLY':
      return 'AUTHENTICATOR';
    case 'BOTH_SMS_PREFERRED':
      return 'SMS';
    case 'BOTH_TOTP_PREFERRED':
      return 'AUTHENTICATOR';
  }
}
```

**Business Rules:**

1. **Setup Requirements:**
   - ✅ User can enable SMS 2FA even if TOTP is already enabled
   - ✅ User can have both SMS and TOTP enabled simultaneously
   - ❌ Cannot set preferred method until BOTH methods are enabled
   - ❌ Cannot disable SMS if it's the only 2FA method and 2FA is required

2. **Method Switching:**
   - When both methods are enabled, user can switch preferred method
   - Switching requires verification with the NEW preferred method
   - This prevents unauthorized method changes

3. **Disabling Logic:**
   ```typescript
   function canDisableSMS(user: User2FAFields): { allowed: boolean; reason?: string } {
     const hasTOTP = user.two_factor_enabled && !!user.two_factor_secret;
     const hasSMS = user.phone_verified;
     
     // If 2FA is mandatory and SMS is the only method
     if (user.two_factor_required && hasSMS && !hasTOTP) {
       return {
         allowed: false,
         reason: '2FA is required for your account. Enable TOTP before disabling SMS.'
       };
     }
     
     return { allowed: true };
   }
   ```

### Code Expiry and Timing

**Expiry Calculation:**
```typescript
interface CodeTimingInfo {
  expiresAt: Date;
  remainingSeconds: number;
  isExpired: boolean;
  urgencyLevel: 'safe' | 'warning' | 'critical' | 'expired';
}

function getCodeTiming(codeSentAt: Date, expiryMinutes = 5): CodeTimingInfo {
  const expiresAt = new Date(codeSentAt.getTime() + expiryMinutes * 60000);
  const now = new Date();
  const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  
  let urgencyLevel: CodeTimingInfo['urgencyLevel'];
  if (remainingSeconds <= 0) {
    urgencyLevel = 'expired';
  } else if (remainingSeconds <= 60) {
    urgencyLevel = 'critical';
  } else if (remainingSeconds <= 120) {
    urgencyLevel = 'warning';
  } else {
    urgencyLevel = 'safe';
  }
  
  return {
    expiresAt,
    remainingSeconds: Math.max(0, remainingSeconds),
    isExpired: remainingSeconds <= 0,
    urgencyLevel,
  };
}
```

**Timer Component:**
```typescript
function CodeExpiryTimer({ codeSentAt }: { codeSentAt: Date }) {
  const [timing, setTiming] = useState(() => getCodeTiming(codeSentAt));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTiming(getCodeTiming(codeSentAt));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [codeSentAt]);
  
  if (timing.isExpired) {
    return <span className="text-red-600">Code expired. Request a new one.</span>;
  }
  
  const minutes = Math.floor(timing.remainingSeconds / 60);
  const seconds = timing.remainingSeconds % 60;
  
  const colorClass = {
    safe: 'text-gray-600',
    warning: 'text-yellow-600',
    critical: 'text-red-600',
    expired: 'text-red-600',
  }[timing.urgencyLevel];
  
  return (
    <span className={colorClass}>
      Expires in {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}
```

### Attempt Tracking

```typescript
interface AttemptTracker {
  attemptsUsed: number;
  attemptsRemaining: number;
  maxAttempts: number;
  isLocked: boolean;
}

function trackAttempts(
  currentAttempts: number,
  maxAttempts = 3
): AttemptTracker {
  const attemptsRemaining = Math.max(0, maxAttempts - currentAttempts);
  
  return {
    attemptsUsed: currentAttempts,
    attemptsRemaining,
    maxAttempts,
    isLocked: attemptsRemaining === 0,
  };
}

// Display component
function AttemptsDisplay({ attemptsRemaining }: { attemptsRemaining: number }) {
  if (attemptsRemaining === 0) {
    return (
      <div className="text-red-600 font-semibold">
        ⚠️ Maximum attempts exceeded. Request a new code.
      </div>
    );
  }
  
  if (attemptsRemaining === 1) {
    return (
      <div className="text-red-600">
        ⚠️ Last attempt remaining
      </div>
    );
  }
  
  if (attemptsRemaining === 2) {
    return (
      <div className="text-yellow-600">
        {attemptsRemaining} attempts remaining
      </div>
    );
  }
  
  return null; // Don't show until attempts are reduced
}
```

---

## Error Handling

### Error Code Mapping

```typescript
/**
 * User-friendly error messages and recommended actions
 */
export const SMS_ERROR_MESSAGES: Record<Sms2FAErrorCode, ErrorCodeMetadata> = {
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    userMessage: 'Please check your input and try again.',
    actionRequired: 'Verify phone number format or code format',
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    statusCode: 401,
    userMessage: 'Please log in to continue.',
    actionRequired: 'Redirect to login',
  },
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    statusCode: 404,
    userMessage: 'Account not found. Please contact support.',
    actionRequired: 'Contact support',
  },
  PHONE_IN_USE: {
    code: 'PHONE_IN_USE',
    statusCode: 409,
    userMessage: 'This phone number is already registered to another account.',
    actionRequired: 'Use different phone number',
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    statusCode: 429,
    userMessage: 'Too many SMS requests. Please wait before trying again.',
    actionRequired: 'Show countdown timer until resetAt',
  },
  SMS_SEND_FAILED: {
    code: 'SMS_SEND_FAILED',
    statusCode: 500,
    userMessage: 'Failed to send SMS. Please check your phone number or try again later.',
    actionRequired: 'Verify phone number or retry',
  },
  VERIFICATION_FAILED: {
    code: 'VERIFICATION_FAILED',
    statusCode: 401,
    userMessage: 'Invalid verification code. Please try again.',
    actionRequired: 'Re-enter code or request new one',
  },
  CODE_NOT_FOUND: {
    code: 'CODE_NOT_FOUND',
    statusCode: 404,
    userMessage: 'No verification code found. Please request a new code.',
    actionRequired: 'Request new code',
  },
  CODE_EXPIRED: {
    code: 'CODE_EXPIRED',
    statusCode: 410,
    userMessage: 'Verification code has expired. Please request a new one.',
    actionRequired: 'Request new code',
  },
  MAX_ATTEMPTS_EXCEEDED: {
    code: 'MAX_ATTEMPTS_EXCEEDED',
    statusCode: 429,
    userMessage: 'Too many incorrect attempts. Please request a new code.',
    actionRequired: 'Request new code',
  },
  ACCOUNT_LOCKED: {
    code: 'ACCOUNT_LOCKED',
    statusCode: 403,
    userMessage: 'Account temporarily locked due to security concerns.',
    actionRequired: 'Show locked until time, contact support',
  },
  RESEND_FAILED: {
    code: 'RESEND_FAILED',
    statusCode: 400,
    userMessage: 'Failed to resend code. Please try again.',
    actionRequired: 'Retry or contact support',
  },
  CHALLENGE_EXPIRED: {
    code: 'CHALLENGE_EXPIRED',
    statusCode: 410,
    userMessage: 'Login session expired. Please start over.',
    actionRequired: 'Redirect to login',
  },
  INVALID_METHOD: {
    code: 'INVALID_METHOD',
    statusCode: 400,
    userMessage: 'Invalid 2FA method selected.',
    actionRequired: 'Select valid method',
  },
  PRECONDITION_FAILED: {
    code: 'PRECONDITION_FAILED',
    statusCode: 412,
    userMessage: 'Prerequisites not met for this action.',
    actionRequired: 'Follow prerequisites',
  },
  CONFLICT: {
    code: 'CONFLICT',
    statusCode: 409,
    userMessage: 'Conflict with existing data.',
    actionRequired: 'Check and retry',
  },
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    statusCode: 500,
    userMessage: 'Something went wrong. Please try again later.',
    actionRequired: 'Retry or contact support',
  },
};
```

### Error Handler Utility

```typescript
/**
 * Process API error and extract user-friendly message
 */
export function handleSmsError(error: any): {
  message: string;
  code: string;
  action?: string;
  canRetry: boolean;
  retryAfter?: Date;
} {
  // Axios error format
  if (error.response?.data) {
    const apiError = error.response.data.error;
    const metadata = SMS_ERROR_MESSAGES[apiError.code as Sms2FAErrorCode];
    
    if (metadata) {
      return {
        message: apiError.message || metadata.userMessage,
        code: apiError.code,
        action: metadata.actionRequired,
        canRetry: ![401, 403, 404, 409, 410, 412].includes(metadata.statusCode),
        retryAfter: apiError.resetAt ? new Date(apiError.resetAt) : undefined,
      };
    }
  }
  
  // tRPC error format
  if (error.data?.code) {
    const metadata = SMS_ERROR_MESSAGES[error.data.code as Sms2FAErrorCode];
    return {
      message: error.message || metadata?.userMessage || 'An error occurred',
      code: error.data.code,
      action: metadata?.actionRequired,
      canRetry: true,
    };
  }
  
  // Generic error
  return {
    message: error.message || 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    canRetry: true,
  };
}
```

### Toast Notification Pattern

```typescript
import { toast } from 'react-hot-toast'; // or your toast library

/**
 * Show appropriate error notification
 */
export function showSmsError(error: any) {
  const { message, code, action, canRetry, retryAfter } = handleSmsError(error);
  
  // Rate limit error - show countdown
  if (code === 'RATE_LIMIT_EXCEEDED' && retryAfter) {
    const remainingSeconds = Math.ceil((retryAfter.getTime() - Date.now()) / 1000);
    toast.error(
      `${message} (${remainingSeconds}s remaining)`,
      { duration: remainingSeconds * 1000 }
    );
    return;
  }
  
  // Account locked - persistent notification
  if (code === 'ACCOUNT_LOCKED') {
    toast.error(message, { duration: Infinity });
    return;
  }
  
  // Critical errors - longer duration
  if (['CODE_EXPIRED', 'MAX_ATTEMPTS_EXCEEDED', 'CHALLENGE_EXPIRED'].includes(code)) {
    toast.error(message, { duration: 6000 });
    return;
  }
  
  // Standard error
  toast.error(message);
}

/**
 * Show success message
 */
export function showSmsSuccess(message: string) {
  toast.success(message, { duration: 4000 });
}
```

### Retry Logic

```typescript
/**
 * Automatic retry for transient failures
 */
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      const status = error.response?.status || error.statusCode;
      if (status >= 400 && status < 500) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        break;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
    }
  }
  
  throw lastError;
}

// Usage
const sendSmsWithRetry = () => retryApiCall(
  () => apiClient.post('/api/auth/2fa/setup-sms', { phoneNumber })
);
```

---

## Authorization & Permissions

### Role-Based Access Control

```typescript
/**
 * Check if user has required role
 */
export function hasRole(user: { role: UserRole }, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.VIEWER]: 1,
    [UserRole.CREATOR]: 2,
    [UserRole.BRAND]: 2,
    [UserRole.ADMIN]: 3,
  };
  
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

/**
 * Permission matrix for SMS 2FA features
 */
export const SMS_PERMISSIONS = {
  // User-facing features (all authenticated users)
  SETUP_SMS: (user: any) => !!user,
  VERIFY_SMS: (user: any) => !!user,
  DISABLE_SMS: (user: any) => !!user,
  UPDATE_PHONE: (user: any) => !!user,
  VIEW_STATUS: (user: any) => !!user,
  
  // Admin-only features
  VIEW_ALL_COSTS: (user: any) => hasRole(user, UserRole.ADMIN),
  GENERATE_REPORTS: (user: any) => hasRole(user, UserRole.ADMIN),
  VIEW_ALERTS: (user: any) => hasRole(user, UserRole.ADMIN),
  RESET_USER_2FA: (user: any) => hasRole(user, UserRole.ADMIN),
};

/**
 * Check permission before API call
 */
export function checkPermission(
  permission: keyof typeof SMS_PERMISSIONS,
  user: any
): { allowed: boolean; reason?: string } {
  const permissionFn = SMS_PERMISSIONS[permission];
  
  if (!permissionFn) {
    return { allowed: false, reason: 'Unknown permission' };
  }
  
  const allowed = permissionFn(user);
  
  return {
    allowed,
    reason: allowed ? undefined : 'Insufficient permissions',
  };
}
```

### Conditional UI Rendering

```typescript
/**
 * Protect admin routes
 */
function AdminCostDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  
  useEffect(() => {
    if (session && !hasRole(session.user, UserRole.ADMIN)) {
      toast.error('Access denied: Admin role required');
      router.push('/dashboard');
    }
  }, [session, router]);
  
  if (!session || !hasRole(session.user, UserRole.ADMIN)) {
    return <div>Loading...</div>; // Or redirect component
  }
  
  return <CostDashboard />;
}

/**
 * Conditionally show features based on permissions
 */
function TwoFactorSettings() {
  const { data: session } = useSession();
  const canViewCosts = session && SMS_PERMISSIONS.VIEW_ALL_COSTS(session.user);
  
  return (
    <div>
      {/* Everyone can see their own SMS status */}
      <UserSmsStatus />
      
      {/* Only admins see cost monitoring */}
      {canViewCosts && (
        <AdminCostMonitoring />
      )}
    </div>
  );
}
```

### Field-Level Permissions

```typescript
/**
 * Fields visible based on user role
 */
interface SmsStatusDisplay {
  // All users
  enabled: boolean;
  phoneVerified: boolean;
  maskedPhone: string;
  
  // Owner only
  fullPhone?: string;
  rateLimit?: RateLimitInfo;
  
  // Admin only
  userId?: string;
  cost?: number;
  deliveryStats?: Record<string, number>;
}

function formatSmsStatusForUser(
  status: SmsVerificationCode,
  viewer: { id: string; role: UserRole },
  owner: { id: string }
): SmsStatusDisplay {
  const isOwner = viewer.id === owner.id;
  const isAdmin = hasRole(viewer, UserRole.ADMIN);
  
  const display: SmsStatusDisplay = {
    enabled: status.verified,
    phoneVerified: status.verified,
    maskedPhone: maskPhone(status.phoneNumber),
  };
  
  if (isOwner) {
    display.fullPhone = status.phoneNumber;
    // Add rate limit info
  }
  
  if (isAdmin) {
    display.userId = status.userId;
    display.cost = status.cost || 0;
    // Add delivery stats
  }
  
  return display;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `***${phone.slice(-4)}`;
}
```

---

## Rate Limiting & Quotas

### Rate Limit Constants

```typescript
export const SMS_RATE_LIMITS = {
  MAX_SMS_PER_WINDOW: 3,
  WINDOW_MINUTES: 15,
  BACKOFF_INTERVALS: [0, 30, 60, 120], // seconds
  CODE_EXPIRY_MINUTES: 5,
  MAX_VERIFICATION_ATTEMPTS: 3,
} as const;
```

### Rate Limit Tracking

```typescript
interface RateLimitState {
  remaining: number;
  resetAt: Date;
  isLimited: boolean;
  canSend: boolean;
  waitSeconds?: number;
}

/**
 * Parse rate limit from API response headers or body
 */
function parseRateLimit(response: {
  headers?: any;
  data?: any;
}): RateLimitState {
  // From response body (SMS status endpoint)
  if (response.data?.rateLimit) {
    const { allowed, remaining, resetAt } = response.data.rateLimit;
    return {
      remaining,
      resetAt: new Date(resetAt),
      isLimited: !allowed,
      canSend: allowed,
    };
  }
  
  // From error response (rate limit exceeded)
  if (response.data?.error?.resetAt) {
    const resetAt = new Date(response.data.error.resetAt);
    const waitSeconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
    
    return {
      remaining: 0,
      resetAt,
      isLimited: true,
      canSend: false,
      waitSeconds: Math.max(0, waitSeconds),
    };
  }
  
  // Default: no limit info
  return {
    remaining: SMS_RATE_LIMITS.MAX_SMS_PER_WINDOW,
    resetAt: new Date(Date.now() + SMS_RATE_LIMITS.WINDOW_MINUTES * 60000),
    isLimited: false,
    canSend: true,
  };
}
```

### Rate Limit Display Component

```typescript
function RateLimitIndicator({ rateLimit }: { rateLimit: RateLimitState }) {
  const [countdown, setCountdown] = useState(0);
  
  useEffect(() => {
    if (!rateLimit.isLimited) return;
    
    const updateCountdown = () => {
      const remaining = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000);
      setCountdown(Math.max(0, remaining));
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [rateLimit.resetAt, rateLimit.isLimited]);
  
  if (!rateLimit.isLimited) {
    return (
      <div className="text-sm text-gray-600">
        {rateLimit.remaining} of {SMS_RATE_LIMITS.MAX_SMS_PER_WINDOW} SMS remaining
      </div>
    );
  }
  
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  
  return (
    <div className="text-sm text-red-600">
      ⏳ Rate limit reached. Try again in {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
}
```

### Backoff Timer

```typescript
/**
 * Calculate backoff wait time based on attempts
 */
function getBackoffSeconds(attemptNumber: number): number {
  const { BACKOFF_INTERVALS } = SMS_RATE_LIMITS;
  return BACKOFF_INTERVALS[Math.min(attemptNumber, BACKOFF_INTERVALS.length - 1)];
}

/**
 * Resend button with backoff timer
 */
function ResendButton({
  onResend,
  lastSentAt,
  attemptNumber,
}: {
  onResend: () => Promise<void>;
  lastSentAt: Date;
  attemptNumber: number;
}) {
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    const backoffSeconds = getBackoffSeconds(attemptNumber);
    const canResendAt = new Date(lastSentAt.getTime() + backoffSeconds * 1000);
    
    const updateCountdown = () => {
      const remaining = Math.ceil((canResendAt.getTime() - Date.now()) / 1000);
      setCountdown(Math.max(0, remaining));
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [lastSentAt, attemptNumber]);
  
  const handleResend = async () => {
    setIsLoading(true);
    try {
      await onResend();
      showSmsSuccess('Code sent!');
    } catch (error) {
      showSmsError(error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const isDisabled = countdown > 0 || isLoading;
  
  return (
    <button
      onClick={handleResend}
      disabled={isDisabled}
      className="text-blue-600 disabled:text-gray-400"
    >
      {isLoading ? 'Sending...' : 
       countdown > 0 ? `Resend in ${countdown}s` : 
       'Resend code'}
    </button>
  );
}
```

### Quota Warnings

```typescript
/**
 * Warn user when approaching rate limit
 */
function SmsQuotaWarning({ remaining }: { remaining: number }) {
  if (remaining > 1) return null;
  
  if (remaining === 1) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
        ⚠️ <strong>Last SMS remaining</strong> in this 15-minute window.
        Use it carefully.
      </div>
    );
  }
  
  return (
    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
      🚫 <strong>SMS quota exceeded.</strong> You've used all 3 SMS in the last 15 minutes.
      Please wait before requesting another code.
    </div>
  );
}
```

### Headers to Check

When available, check these response headers for rate limit info:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit'?: string;     // e.g., "3"
  'X-RateLimit-Remaining'?: string;  // e.g., "2"
  'X-RateLimit-Reset'?: string;      // Unix timestamp
  'Retry-After'?: string;            // Seconds until retry allowed
}

function parseRateLimitHeaders(headers: RateLimitHeaders): Partial<RateLimitState> {
  return {
    remaining: headers['X-RateLimit-Remaining'] 
      ? parseInt(headers['X-RateLimit-Remaining'])
      : undefined,
    resetAt: headers['X-RateLimit-Reset']
      ? new Date(parseInt(headers['X-RateLimit-Reset']) * 1000)
      : undefined,
    waitSeconds: headers['Retry-After']
      ? parseInt(headers['Retry-After'])
      : undefined,
  };
}
```

---

## Next Steps

Continue to [Part 3: Implementation Guide, API Client, and Testing](./FRONTEND_INTEGRATION_TWILIO_SMS_2FA_PART_3.md)
