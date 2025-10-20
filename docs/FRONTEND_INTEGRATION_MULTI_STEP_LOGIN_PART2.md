# 🔐 Frontend Integration Guide: Multi-Step Login with 2FA (Part 2)

**Classification:** ⚡ HYBRID - Core authentication used by both public website and admin backend

**Last Updated:** October 19, 2025  
**Backend Version:** 2.0  
**Frontend Target:** yesgoddess-web (Next.js 15 + App Router)

---

## 📋 Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Frontend Implementation Patterns](#frontend-implementation-patterns)
3. [Error Handling Strategies](#error-handling-strategies)
4. [React Component Examples](#react-component-examples)
5. [State Management](#state-management)
6. [Security Best Practices](#security-best-practices)

---

## Business Logic & Validation Rules

### Field Validation

#### Email Validation
```typescript
// Frontend validation (pre-submit)
const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

// Example validation function
function validateEmail(email: string): string | null {
  try {
    emailSchema.parse(email);
    return null; // No error
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues[0].message;
    }
    return 'Invalid email';
  }
}
```

**Rules:**
- Must be valid email format (RFC 5322)
- Maximum 255 characters
- Automatically converted to lowercase
- Whitespace trimmed

#### Password Validation (Login)
```typescript
// For login, only require non-empty
const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required');
```

**Rules:**
- Minimum 1 character (login does NOT enforce password strength)
- Password strength is only enforced during registration/reset

#### TOTP Code Validation
```typescript
const totpCodeSchema = z
  .string()
  .min(6, 'TOTP code must be 6 digits')
  .max(10, 'TOTP code is too long') // Allow spaces
  .regex(/^[0-9\s]+$/, 'TOTP code must contain only digits')
  .transform((code) => code.replace(/\s/g, '')) // Remove whitespace
  .refine((code) => code.length === 6, {
    message: 'TOTP code must be exactly 6 digits',
  });
```

**Rules:**
- Exactly 6 digits
- Only numeric characters (0-9)
- Spaces are allowed but stripped before submission
- Examples of valid input: `123456`, `123 456`, `12 34 56`

#### Backup Code Validation
```typescript
const backupCodeSchema = z
  .string()
  .min(8, 'Backup code must be at least 8 characters')
  .max(20, 'Backup code is too long')
  .transform((code) => code.replace(/\s/g, '').toUpperCase());
```

**Rules:**
- 8-20 characters
- Case-insensitive (converted to uppercase)
- Hyphens and spaces are allowed but stripped
- Examples: `ABCD-1234-EFGH-5678`, `abcd1234efgh5678`

---

### Business Rules

#### Login Attempt Limits

| Condition | Action | Duration |
|-----------|--------|----------|
| 3 failed attempts | Progressive delay (2s, 4s, 8s, etc.) | Per attempt |
| 3 failed attempts | CAPTCHA required | Until successful login |
| 5 failed attempts | Account temporarily locked | 15 minutes |
| 10 failed attempts | Extended account lockout | 1 hour |
| 15 failed attempts | Long-term lockout | 24 hours |

**Frontend Implementation:**
```typescript
interface LoginSecurityState {
  failedAttempts: number;
  requiresCaptcha: boolean;
  isLocked: boolean;
  lockedUntil?: Date;
  progressiveDelay: number; // milliseconds
}

function calculateProgressiveDelay(attempts: number): number {
  // 2^attempts seconds (capped at 32 seconds)
  return Math.min(Math.pow(2, attempts) * 1000, 32000);
}
```

#### 2FA Verification Limits

| Resource | Limit | Window | Reset Condition |
|----------|-------|--------|-----------------|
| Verification attempts | 5 per challenge | Per temporary token | New login attempt |
| Rate limit | 5 attempts | 15 minutes | Time-based expiry |
| Challenge expiry | N/A | 5 minutes | Must restart login |
| SMS resend | 3 times | 15 minutes | Time-based expiry |

**Frontend Considerations:**
- Show countdown timer for temporary token expiry
- Display attempts remaining after failed verification
- Show cooldown timer when rate limited

#### Temporary Token Lifecycle

```typescript
interface TemporaryToken {
  token: string;
  challengeType: 'TOTP' | 'SMS';
  expiresAt: Date;
  createdAt: Date;
}

// Check if token is expired
function isTokenExpired(token: TemporaryToken): boolean {
  return new Date() >= token.expiresAt;
}

// Get remaining time in seconds
function getRemainingTime(token: TemporaryToken): number {
  const now = new Date().getTime();
  const expiry = token.expiresAt.getTime();
  return Math.max(0, Math.floor((expiry - now) / 1000));
}
```

**Rules:**
- Valid for exactly 5 minutes after creation
- Single-use only (marked as used after successful verification)
- Cannot be refreshed or extended
- Expired tokens require restarting login from Step 1

#### Trusted Device Management

```typescript
interface TrustedDevice {
  id: string;
  deviceName: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
}
```

**Rules:**
- Trusted devices are valid for 30 days
- User can trust a device during 2FA verification
- Maximum of 5 trusted devices per user (soft limit, not enforced)
- User can revoke devices individually or all at once
- Trusted device tokens are not exposed to frontend (stored in cookies)

---

## Frontend Implementation Patterns

### React Query Integration

```typescript
import { useMutation, useQuery } from '@tanstack/react-query';
import { LoginRequest, LoginResponse, VerifyTotpRequest } from '@/types/auth';

// Login mutation
export function useLogin() {
  return useMutation<LoginResponse, Error, LoginRequest>({
    mutationFn: async (credentials) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important for cookies
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (requires2FA(data)) {
        // Store temporary token in state
        // Navigate to 2FA verification screen
      } else {
        // Login complete - invalidate user query to refetch
        queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    },
  });
}

// 2FA verification mutation
export function useVerify2FA() {
  return useMutation<Verify2FASuccessResponse, Error, VerifyTotpRequest>({
    mutationFn: async (verificationData) => {
      const response = await fetch('/api/auth/2fa/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(verificationData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Verification failed');
      }

      return response.json();
    },
    onSuccess: () => {
      // Authentication complete
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}
```

### API Client Pattern

```typescript
// api/auth.client.ts
import { API_BASE_URL } from '@/config/constants';
import type { 
  LoginRequest, 
  LoginResponse, 
  VerifyTotpRequest,
  Verify2FASuccessResponse 
} from '@/types/auth';

class AuthApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
      throw this.handleError(response, data);
    }

    return data;
  }

  async verify2FA(
    verificationData: VerifyTotpRequest
  ): Promise<Verify2FASuccessResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/2fa/verify-totp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(verificationData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw this.handleError(response, data);
    }

    return data;
  }

  async verifyBackupCode(
    verificationData: VerifyBackupCodeRequest
  ): Promise<Verify2FASuccessResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/2fa/verify-backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(verificationData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw this.handleError(response, data);
    }

    return data;
  }

  private handleError(response: Response, data: any): Error {
    // Map HTTP status codes to user-friendly errors
    if (response.status === 401) {
      return new AuthError(
        data.code || 'UNAUTHORIZED',
        data.message || 'Invalid credentials'
      );
    }

    if (response.status === 423) {
      return new AccountLockedError(
        data.message || 'Account is temporarily locked',
        data.lockedUntil
      );
    }

    if (response.status === 429) {
      return new RateLimitError(
        data.message || 'Too many requests',
        data.requiresCaptcha
      );
    }

    return new Error(data.message || 'An unexpected error occurred');
  }
}

// Custom error classes
export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AccountLockedError extends Error {
  constructor(message: string, public lockedUntil?: string) {
    super(message);
    this.name = 'AccountLockedError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public requiresCaptcha: boolean = false) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export const authApi = new AuthApiClient(API_BASE_URL);
```

---

## Error Handling Strategies

### Error Classification

```typescript
enum ErrorSeverity {
  INFO = 'info',       // User can retry immediately
  WARNING = 'warning', // User should be cautious
  ERROR = 'error',     // User cannot proceed without action
  CRITICAL = 'critical' // System-level issue
}

interface ErrorMetadata {
  code: ErrorCode;
  severity: ErrorSeverity;
  retryable: boolean;
  userMessage: string;
  actionRequired?: string;
}

const errorMap: Record<ErrorCode, ErrorMetadata> = {
  [ErrorCode.INVALID_CREDENTIALS]: {
    code: ErrorCode.INVALID_CREDENTIALS,
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userMessage: 'The email or password you entered is incorrect.',
    actionRequired: 'Check your credentials and try again.',
  },
  [ErrorCode.ACCOUNT_LOCKED]: {
    code: ErrorCode.ACCOUNT_LOCKED,
    severity: ErrorSeverity.ERROR,
    retryable: false,
    userMessage: 'Your account is temporarily locked due to multiple failed login attempts.',
    actionRequired: 'Try again later or reset your password.',
  },
  [ErrorCode.CAPTCHA_REQUIRED]: {
    code: ErrorCode.CAPTCHA_REQUIRED,
    severity: ErrorSeverity.WARNING,
    retryable: true,
    userMessage: 'Please complete the security verification.',
    actionRequired: 'Complete the CAPTCHA and try again.',
  },
  [ErrorCode.TEMP_TOKEN_EXPIRED]: {
    code: ErrorCode.TEMP_TOKEN_EXPIRED,
    severity: ErrorSeverity.INFO,
    retryable: true,
    userMessage: 'Your verification session has expired.',
    actionRequired: 'Please log in again.',
  },
  [ErrorCode.BACKUP_CODE_INVALID]: {
    code: ErrorCode.BACKUP_CODE_INVALID,
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userMessage: 'The backup code you entered is invalid.',
    actionRequired: 'Check the code and try again, or use your authenticator app.',
  },
  // ... add other error codes
};
```

### Error Display Component

```typescript
interface ErrorAlertProps {
  error: Error | null;
  attemptsRemaining?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function ErrorAlert({ error, attemptsRemaining, onRetry, onDismiss }: ErrorAlertProps) {
  if (!error) return null;

  const metadata = getErrorMetadata(error);

  return (
    <div 
      role="alert" 
      className={`alert alert-${metadata.severity}`}
      aria-live="assertive"
    >
      <div className="alert-icon">
        {getIconForSeverity(metadata.severity)}
      </div>
      <div className="alert-content">
        <h4 className="alert-title">{metadata.userMessage}</h4>
        {metadata.actionRequired && (
          <p className="alert-description">{metadata.actionRequired}</p>
        )}
        {attemptsRemaining !== undefined && attemptsRemaining > 0 && (
          <p className="alert-attempts">
            {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
          </p>
        )}
      </div>
      <div className="alert-actions">
        {metadata.retryable && onRetry && (
          <button onClick={onRetry} className="btn btn-sm">
            Try Again
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="btn-icon" aria-label="Dismiss">
            <XIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function getErrorMetadata(error: Error): ErrorMetadata {
  if (error instanceof AuthError) {
    return errorMap[error.code] || {
      code: 'UNKNOWN_ERROR',
      severity: ErrorSeverity.ERROR,
      retryable: true,
      userMessage: error.message,
    };
  }

  // Default fallback
  return {
    code: 'UNKNOWN_ERROR',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userMessage: 'An unexpected error occurred. Please try again.',
  };
}
```

---

## React Component Examples

### Login Form Component

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin } from '@/hooks/useAuth';
import { requires2FA } from '@/types/auth';
import { ReCaptcha } from '@/components/captcha/ReCaptcha';

export function LoginForm() {
  const router = useRouter();
  const loginMutation = useLogin();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showCaptcha, setShowCaptcha] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await loginMutation.mutateAsync({
        ...formData,
        captchaToken: captchaToken || undefined,
      });

      if (requires2FA(response)) {
        // Navigate to 2FA verification screen with temporary token
        router.push(`/auth/verify-2fa?token=${response.data.temporaryToken}&type=${response.data.challengeType}`);
      } else {
        // Login successful - redirect to dashboard
        router.push('/dashboard');
      }
    } catch (error) {
      if (error instanceof RateLimitError && error.requiresCaptcha) {
        setShowCaptcha(true);
      }
      // Error is handled by ErrorAlert component
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorAlert 
        error={loginMutation.error} 
        onRetry={() => loginMutation.reset()}
      />

      <div>
        <label htmlFor="email" className="label">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="input"
          required
          autoComplete="email"
          disabled={loginMutation.isPending}
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="input"
          required
          autoComplete="current-password"
          disabled={loginMutation.isPending}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.rememberMe}
            onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
            className="checkbox"
            disabled={loginMutation.isPending}
          />
          <span className="text-sm">Remember me</span>
        </label>

        <a href="/auth/forgot-password" className="text-sm link">
          Forgot password?
        </a>
      </div>

      {showCaptcha && (
        <ReCaptcha
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />
      )}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={loginMutation.isPending || (showCaptcha && !captchaToken)}
      >
        {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

### 2FA Verification Component

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVerify2FA } from '@/hooks/useAuth';
import { ChallengeType } from '@/types/auth';

export function TwoFactorVerification() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verify2FAMutation = useVerify2FA();

  const temporaryToken = searchParams.get('token');
  const challengeType = searchParams.get('type') as ChallengeType;

  const [code, setCode] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes
  const [showBackupCodeInput, setShowBackupCodeInput] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.replace(/\s/g, '').length === 6 && !showBackupCodeInput) {
      handleVerify();
    }
  }, [code]);

  const handleVerify = async () => {
    if (!temporaryToken) {
      router.push('/auth/login');
      return;
    }

    try {
      await verify2FAMutation.mutateAsync({
        challengeToken: temporaryToken,
        code: code.replace(/\s/g, ''),
      });

      // Success - redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      // Error handled by component
      setCode(''); // Clear code on error
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (!/^\d*$/.test(value)) return;

    const newCode = code.split('');
    newCode[index] = value;
    setCode(newCode.join(''));

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (timeRemaining === 0) {
    return (
      <div className="card">
        <h2>Session Expired</h2>
        <p>Your verification session has expired. Please log in again.</p>
        <button onClick={() => router.push('/auth/login')} className="btn btn-primary">
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="card max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Two-Factor Authentication</h2>
      <p className="text-gray-600 mb-6">
        {challengeType === 'TOTP'
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Enter the 6-digit code sent to your phone.'}
      </p>

      <ErrorAlert
        error={verify2FAMutation.error}
        attemptsRemaining={verify2FAMutation.error?.attemptsRemaining}
        onRetry={() => {
          verify2FAMutation.reset();
          setCode('');
        }}
      />

      <div className="mb-4">
        <div className="flex justify-center gap-2 mb-4">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code[index] || ''}
              onChange={(e) => handleCodeChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="input w-12 h-12 text-center text-xl"
              disabled={verify2FAMutation.isPending || showBackupCodeInput}
              autoFocus={index === 0}
            />
          ))}
        </div>

        <div className="text-center text-sm text-gray-500">
          Time remaining: {formatTime(timeRemaining)}
        </div>
      </div>

      <div className="space-y-2">
        {!showBackupCodeInput && (
          <button
            type="button"
            onClick={() => setShowBackupCodeInput(true)}
            className="btn btn-link w-full"
          >
            Use a backup code instead
          </button>
        )}

        {showBackupCodeInput && (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Enter backup code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input w-full"
              disabled={verify2FAMutation.isPending}
            />
            <button
              onClick={handleVerify}
              className="btn btn-primary w-full"
              disabled={verify2FAMutation.isPending || code.length < 8}
            >
              Verify Backup Code
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBackupCodeInput(false);
                setCode('');
              }}
              className="btn btn-link w-full"
            >
              Use authenticator code instead
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <a href="/auth/login" className="text-sm link">
          Cancel and return to login
        </a>
      </div>
    </div>
  );
}
```

---

## State Management

### Zustand Store Example

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LoginState {
  // Step 1: Credentials
  email: string;
  password: string;
  rememberMe: boolean;

  // Step 2: 2FA Challenge
  temporaryToken: string | null;
  challengeType: ChallengeType | null;
  expiresAt: Date | null;
  attemptsRemaining: number;

  // Security state
  requiresCaptcha: boolean;
  captchaToken: string | null;
  isLocked: boolean;
  lockedUntil: Date | null;

  // Actions
  setCredentials: (email: string, password: string, rememberMe: boolean) => void;
  set2FAChallenge: (token: string, type: ChallengeType, expiresAt: Date) => void;
  setCaptchaRequired: (required: boolean) => void;
  setCaptchaToken: (token: string | null) => void;
  setAccountLocked: (lockedUntil: Date | null) => void;
  decrementAttempts: () => void;
  reset: () => void;
}

export const useLoginStore = create<LoginState>()(
  persist(
    (set) => ({
      // Initial state
      email: '',
      password: '',
      rememberMe: false,
      temporaryToken: null,
      challengeType: null,
      expiresAt: null,
      attemptsRemaining: 5,
      requiresCaptcha: false,
      captchaToken: null,
      isLocked: false,
      lockedUntil: null,

      // Actions
      setCredentials: (email, password, rememberMe) =>
        set({ email, password, rememberMe }),

      set2FAChallenge: (token, type, expiresAt) =>
        set({
          temporaryToken: token,
          challengeType: type,
          expiresAt,
          attemptsRemaining: 5, // Reset attempts
        }),

      setCaptchaRequired: (required) =>
        set({ requiresCaptcha: required }),

      setCaptchaToken: (token) =>
        set({ captchaToken: token }),

      setAccountLocked: (lockedUntil) =>
        set({ isLocked: !!lockedUntil, lockedUntil }),

      decrementAttempts: () =>
        set((state) => ({
          attemptsRemaining: Math.max(0, state.attemptsRemaining - 1),
        })),

      reset: () =>
        set({
          email: '',
          password: '',
          rememberMe: false,
          temporaryToken: null,
          challengeType: null,
          expiresAt: null,
          attemptsRemaining: 5,
          requiresCaptcha: false,
          captchaToken: null,
          isLocked: false,
          lockedUntil: null,
        }),
    }),
    {
      name: 'login-state',
      partialize: (state) => ({
        // Only persist necessary fields
        temporaryToken: state.temporaryToken,
        challengeType: state.challengeType,
        expiresAt: state.expiresAt,
      }),
    }
  )
);
```

---

## Security Best Practices

### 1. Cookie Configuration

Ensure your HTTP client accepts cookies:

```typescript
// For fetch API
const response = await fetch('/api/auth/login', {
  credentials: 'include', // Required for cookies
});

// For axios
const axiosInstance = axios.create({
  withCredentials: true, // Required for cookies
});
```

### 2. HTTPS Only in Production

```typescript
// config/constants.ts
export const API_BASE_URL = 
  process.env.NODE_ENV === 'production'
    ? 'https://ops.yesgoddess.agency'
    : 'http://localhost:3000';

// Verify HTTPS in production
if (process.env.NODE_ENV === 'production' && !API_BASE_URL.startsWith('https')) {
  throw new Error('API_BASE_URL must use HTTPS in production');
}
```

### 3. Never Log Sensitive Data

```typescript
// ❌ BAD
console.log('Login data:', { email, password, code });

// ✅ GOOD
console.log('Login attempt for:', email.split('@')[0] + '@***');
```

### 4. Clear Sensitive Data on Unmount

```typescript
useEffect(() => {
  return () => {
    // Clear sensitive data when component unmounts
    setPassword('');
    setCode('');
  };
}, []);
```

### 5. Implement Timeout for Long Operations

```typescript
const loginWithTimeout = async (credentials: LoginRequest) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify(credentials),
    });
    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
```

---

## Next Steps

Continue to [Part 3: Advanced Features & Testing](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART3.md) for:
- Trusted device management UI
- Rate limiting indicators
- Progressive enhancement strategies
- Testing examples
- Accessibility guidelines

---

**Document Status:** ✅ Complete - Ready for Frontend Implementation  
**Previous Document:** [Part 1: API Reference](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART1.md)  
**Next Document:** [Part 3: Advanced Features](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART3.md)
