# 🔐 Frontend Integration Guide: Multi-Step Login with 2FA (Part 3)

**Classification:** ⚡ HYBRID - Core authentication used by both public website and admin backend

**Last Updated:** October 19, 2025  
**Backend Version:** 2.0  
**Frontend Target:** yesgoddess-web (Next.js 15 + App Router)

---

## 📋 Table of Contents

1. [Trusted Device Management](#trusted-device-management)
2. [Rate Limiting & User Feedback](#rate-limiting--user-feedback)
3. [Progressive Enhancement](#progressive-enhancement)
4. [Accessibility Guidelines](#accessibility-guidelines)
5. [Testing Strategies](#testing-strategies)
6. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Trusted Device Management

### Overview

Trusted devices allow users to bypass 2FA on recognized devices for 30 days. This improves UX without significantly compromising security.

### Backend Support

The backend supports trusted devices, but the REST API endpoints are not yet implemented. Use tRPC instead:

```typescript
// Available tRPC procedures (backend)
- auth.getTrustedDevices (query)
- auth.revokeTrustedDevice (mutation)
- auth.revokeAllTrustedDevices (mutation)
```

### Frontend Implementation

#### Trust Device Checkbox (During 2FA Verification)

```typescript
'use client';

import { useState } from 'react';

export function TwoFactorVerificationWithTrust() {
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  const handleVerify = async () => {
    try {
      // Note: trustDevice is handled by backend automatically
      // when verification is successful
      await verify2FAMutation.mutateAsync({
        challengeToken: temporaryToken,
        code,
        // Backend will create trusted device based on
        // deviceFingerprint from login request
      });

      if (trustDevice) {
        // Show confirmation message
        toast.success('This device has been trusted for 30 days');
      }

      router.push('/dashboard');
    } catch (error) {
      // Handle error
    }
  };

  return (
    <div className="space-y-4">
      {/* Code input */}
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="input"
        placeholder="Enter 6-digit code"
      />

      {/* Trust device checkbox */}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={(e) => setTrustDevice(e.target.checked)}
          className="checkbox mt-1"
        />
        <div className="text-sm">
          <div className="font-medium">Trust this device</div>
          <div className="text-gray-600">
            Don't ask for codes on this device for 30 days.
            Don't check this on shared or public computers.
          </div>
        </div>
      </label>

      <button
        onClick={handleVerify}
        className="btn btn-primary w-full"
        disabled={code.length !== 6}
      >
        Verify
      </button>
    </div>
  );
}
```

#### Trusted Devices Management Page

> **Note:** This requires tRPC client integration. REST endpoints are not available yet.

```typescript
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { format } from 'date-fns';

export function TrustedDevicesPage() {
  const utils = trpc.useContext();

  // Fetch trusted devices
  const { data: devices, isLoading } = trpc.auth.getTrustedDevices.useQuery();

  // Revoke single device
  const revokeMutation = trpc.auth.revokeTrustedDevice.useMutation({
    onSuccess: () => {
      utils.auth.getTrustedDevices.invalidate();
      toast.success('Device revoked successfully');
    },
  });

  // Revoke all devices
  const revokeAllMutation = trpc.auth.revokeAllTrustedDevices.useMutation({
    onSuccess: (count) => {
      utils.auth.getTrustedDevices.invalidate();
      toast.success(`${count} device(s) revoked successfully`);
    },
  });

  const handleRevokeDevice = async (deviceId: string) => {
    if (confirm('Are you sure you want to revoke this trusted device?')) {
      await revokeMutation.mutateAsync({ deviceId });
    }
  };

  const handleRevokeAll = async () => {
    if (
      confirm(
        'Are you sure you want to revoke all trusted devices? ' +
        'You will need to complete 2FA on all devices next time you log in.'
      )
    ) {
      await revokeAllMutation.mutateAsync();
    }
  };

  if (isLoading) {
    return <div>Loading trusted devices...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Trusted Devices</h2>
          <p className="text-gray-600">
            Manage devices that are trusted for 30 days
          </p>
        </div>
        {devices && devices.length > 0 && (
          <button
            onClick={handleRevokeAll}
            className="btn btn-danger"
            disabled={revokeAllMutation.isPending}
          >
            Revoke All Devices
          </button>
        )}
      </div>

      {!devices || devices.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-600">No trusted devices yet</p>
          <p className="text-sm text-gray-500 mt-2">
            Check "Trust this device" during login to add a device
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {devices.map((device) => (
            <div key={device.id} className="card">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-semibold">
                    {device.deviceName || 'Unknown Device'}
                  </h3>
                  {device.lastUsedAt && (
                    <p className="text-sm text-gray-600">
                      Last used: {format(new Date(device.lastUsedAt), 'PPpp')}
                    </p>
                  )}
                  {device.ipAddress && (
                    <p className="text-sm text-gray-500">IP: {device.ipAddress}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Expires: {format(new Date(device.expiresAt), 'PP')}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeDevice(device.id)}
                  className="btn btn-sm btn-danger"
                  disabled={revokeMutation.isPending}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Security Considerations

- **Never trust device on public/shared computers**
- **Implement device fingerprinting** for additional security
- **Show notification** when a new device is trusted
- **Limit to 5 devices** (soft limit on frontend)

---

## Rate Limiting & User Feedback

### Rate Limit Indicators

#### Login Attempt Counter

```typescript
'use client';

import { useState, useEffect } from 'react';

interface LoginRateLimitProps {
  failedAttempts: number;
  maxAttempts: number;
  requiresCaptcha: boolean;
}

export function LoginRateLimitIndicator({
  failedAttempts,
  maxAttempts,
  requiresCaptcha,
}: LoginRateLimitProps) {
  const attemptsRemaining = maxAttempts - failedAttempts;
  const warningThreshold = 2;

  if (failedAttempts === 0) return null;

  return (
    <div
      className={`alert ${
        attemptsRemaining <= warningThreshold ? 'alert-warning' : 'alert-info'
      }`}
      role="alert"
    >
      <div className="alert-content">
        {attemptsRemaining > 0 ? (
          <>
            <p className="font-medium">
              {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
            </p>
            {attemptsRemaining <= warningThreshold && (
              <p className="text-sm">
                Your account will be temporarily locked after {attemptsRemaining} more failed{' '}
                {attemptsRemaining === 1 ? 'attempt' : 'attempts'}.
              </p>
            )}
          </>
        ) : (
          <p className="font-medium text-red-600">
            Account temporarily locked. Please try again later or reset your password.
          </p>
        )}

        {requiresCaptcha && (
          <p className="text-sm mt-2">
            ⚠️ CAPTCHA verification is now required
          </p>
        )}
      </div>
    </div>
  );
}
```

#### Countdown Timer for Lockout

```typescript
'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface AccountLockedProps {
  lockedUntil: Date;
  onUnlock?: () => void;
}

export function AccountLockedMessage({ lockedUntil, onUnlock }: AccountLockedProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      if (now >= lockedUntil) {
        setTimeRemaining('unlocked');
        onUnlock?.();
        return;
      }

      setTimeRemaining(
        formatDistanceToNow(lockedUntil, { addSuffix: true })
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [lockedUntil, onUnlock]);

  if (timeRemaining === 'unlocked') {
    return (
      <div className="alert alert-success">
        <p>Your account has been unlocked. You can try logging in again.</p>
        <button onClick={onUnlock} className="btn btn-sm">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="alert alert-error">
      <div className="alert-icon">
        <LockIcon className="w-6 h-6" />
      </div>
      <div className="alert-content">
        <h3 className="font-semibold">Account Temporarily Locked</h3>
        <p className="text-sm">
          Your account is locked due to multiple failed login attempts.
        </p>
        <p className="text-sm font-medium mt-2">
          You can try again {timeRemaining}
        </p>
        <div className="mt-3">
          <a href="/auth/forgot-password" className="link text-sm">
            Reset your password instead
          </a>
        </div>
      </div>
    </div>
  );
}
```

#### Progressive Delay Indicator

```typescript
'use client';

import { useState, useEffect } from 'react';

interface ProgressiveDelayProps {
  delayMs: number;
  onComplete: () => void;
}

export function ProgressiveDelayIndicator({ delayMs, onComplete }: ProgressiveDelayProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (delayMs === 0) {
      onComplete();
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / delayMs) * 100, 100);
      
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
        onComplete();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [delayMs, onComplete]);

  if (delayMs === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 text-center">
        Please wait {Math.ceil(delayMs / 1000)} seconds before trying again...
      </p>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-50"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

---

## Progressive Enhancement

### JavaScript Disabled Fallback

```typescript
// app/auth/login/page.tsx
export default function LoginPage() {
  return (
    <>
      <noscript>
        <div className="alert alert-warning">
          <p>
            JavaScript is required for the full authentication experience.
            Please enable JavaScript or use the{' '}
            <a href="/auth/login/basic" className="link">
              basic login form
            </a>.
          </p>
        </div>
      </noscript>

      <LoginForm />
    </>
  );
}
```

### Loading States

```typescript
interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

export function LoginLoadingOverlay({ isLoading, message, progress }: LoadingState) {
  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="status"
      aria-live="polite"
    >
      <div className="card max-w-md">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="w-12 h-12" />
          <p className="text-lg font-medium">
            {message || 'Authenticating...'}
          </p>
          {progress !== undefined && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Offline Detection

```typescript
'use client';

import { useEffect, useState } from 'react';

export function OfflineDetector() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="alert alert-warning fixed bottom-4 right-4 max-w-sm z-50">
      <div className="alert-icon">
        <WifiOffIcon />
      </div>
      <div className="alert-content">
        <p className="font-medium">No internet connection</p>
        <p className="text-sm">Please check your connection and try again.</p>
      </div>
    </div>
  );
}
```

---

## Accessibility Guidelines

### ARIA Labels and Roles

```typescript
// Example: Accessible login form
export function AccessibleLoginForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form onSubmit={handleSubmit} aria-label="Login form">
      {/* Email field */}
      <div className="form-group">
        <label htmlFor="email" className="label">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-invalid={!!emailError}
          aria-describedby={emailError ? 'email-error' : undefined}
          className="input"
        />
        {emailError && (
          <p id="email-error" role="alert" className="text-error text-sm mt-1">
            {emailError}
          </p>
        )}
      </div>

      {/* Password field with show/hide */}
      <div className="form-group">
        <label htmlFor="password" className="label">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
            aria-required="true"
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? 'password-error' : undefined}
            className="input pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {passwordError && (
          <p id="password-error" role="alert" className="text-error text-sm mt-1">
            {passwordError}
          </p>
        )}
      </div>

      {/* Submit button with loading state */}
      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <Spinner className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Signing in...</span>
            <span className="sr-only">Loading</span>
          </>
        ) : (
          'Sign In'
        )}
      </button>
    </form>
  );
}
```

### Keyboard Navigation

```typescript
// 6-digit code input with keyboard navigation
export function CodeInput({ length = 6, onChange }: CodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    const input = inputRefs.current[index];
    
    if (e.key === 'Backspace') {
      if (!input?.value && index > 0) {
        // Focus previous input on backspace if current is empty
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Home') {
      inputRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      inputRefs.current[length - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').replace(/\D/g, '');
    
    if (pastedData.length === length) {
      onChange(pastedData);
      // Focus last input
      inputRefs.current[length - 1]?.focus();
    }
  };

  return (
    <div 
      className="flex gap-2 justify-center"
      role="group"
      aria-label="Verification code input"
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          className="input w-12 h-12 text-center text-xl"
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          aria-label={`Digit ${index + 1}`}
          autoFocus={index === 0}
        />
      ))}
    </div>
  );
}
```

### Screen Reader Announcements

```typescript
'use client';

import { useEffect, useRef } from 'react';

/**
 * Announce messages to screen readers
 */
export function useScreenReaderAnnouncement() {
  const announceRef = useRef<HTMLDivElement>(null);

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announceRef.current) {
      announceRef.current.textContent = message;
      announceRef.current.setAttribute('aria-live', priority);
    }
  };

  return {
    announce,
    AnnouncementContainer: () => (
      <div
        ref={announceRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    ),
  };
}

// Usage in component
export function LoginFormWithAnnouncements() {
  const { announce, AnnouncementContainer } = useScreenReaderAnnouncement();

  const handleLoginSuccess = () => {
    announce('Login successful. Redirecting to dashboard.', 'assertive');
  };

  const handleLoginError = (error: string) => {
    announce(`Login failed. ${error}`, 'assertive');
  };

  return (
    <>
      <LoginForm onSuccess={handleLoginSuccess} onError={handleLoginError} />
      <AnnouncementContainer />
    </>
  );
}
```

---

## Testing Strategies

### Unit Tests (Validation)

```typescript
// __tests__/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateEmail, validateTotpCode, validateBackupCode } from '@/lib/validation';

describe('Authentication Validation', () => {
  describe('validateEmail', () => {
    it('should accept valid email', () => {
      expect(validateEmail('user@example.com')).toBeNull();
    });

    it('should reject invalid email format', () => {
      expect(validateEmail('invalid-email')).toBe('Invalid email format');
    });

    it('should reject email over 255 characters', () => {
      const longEmail = 'a'.repeat(256) + '@example.com';
      expect(validateEmail(longEmail)).toBe('Email is too long');
    });

    it('should normalize email to lowercase', () => {
      const email = 'User@Example.COM';
      expect(normalizeEmail(email)).toBe('user@example.com');
    });
  });

  describe('validateTotpCode', () => {
    it('should accept 6-digit code', () => {
      expect(validateTotpCode('123456')).toBeNull();
    });

    it('should accept code with spaces', () => {
      expect(normalizeCode('123 456')).toBe('123456');
    });

    it('should reject non-numeric code', () => {
      expect(validateTotpCode('12345a')).toBe('TOTP code must contain only digits');
    });

    it('should reject code with wrong length', () => {
      expect(validateTotpCode('12345')).toBe('TOTP code must be exactly 6 digits');
    });
  });

  describe('validateBackupCode', () => {
    it('should accept valid backup code', () => {
      expect(validateBackupCode('ABCD-1234-EFGH-5678')).toBeNull();
    });

    it('should normalize to uppercase', () => {
      expect(normalizeBackupCode('abcd-1234')).toBe('ABCD1234');
    });

    it('should remove hyphens and spaces', () => {
      expect(normalizeBackupCode('AB CD-12 34')).toBe('ABCD1234');
    });
  });
});
```

### Integration Tests (API)

```typescript
// __tests__/auth-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { authApi } from '@/lib/api/auth.client';

describe('Multi-Step Login Flow', () => {
  beforeEach(() => {
    // Reset any state between tests
  });

  it('should complete login without 2FA', async () => {
    const response = await authApi.login({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: false,
    });

    expect(response.success).toBe(true);
    expect(response.data.user).toBeDefined();
    expect(response.data.user.email).toBe('test@example.com');
  });

  it('should return temporary token when 2FA is enabled', async () => {
    const response = await authApi.login({
      email: 'user-with-2fa@example.com',
      password: 'password123',
      rememberMe: false,
    });

    expect(response.success).toBe(true);
    expect(response.requiresTwoFactor).toBe(true);
    expect(response.data.temporaryToken).toBeDefined();
    expect(response.data.challengeType).toMatch(/TOTP|SMS/);
  });

  it('should verify TOTP code successfully', async () => {
    // First, login to get temporary token
    const loginResponse = await authApi.login({
      email: 'user-with-2fa@example.com',
      password: 'password123',
    });

    // Then verify 2FA
    const verifyResponse = await authApi.verify2FA({
      challengeToken: loginResponse.data.temporaryToken,
      code: '123456', // Mock code for testing
    });

    expect(verifyResponse.success).toBe(true);
  });

  it('should handle invalid credentials', async () => {
    await expect(
      authApi.login({
        email: 'test@example.com',
        password: 'wrong-password',
      })
    ).rejects.toThrow('Invalid email or password');
  });

  it('should handle expired temporary token', async () => {
    await expect(
      authApi.verify2FA({
        challengeToken: 'expired-token',
        code: '123456',
      })
    ).rejects.toThrow(/expired/i);
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/auth/multi-step-login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Multi-Step Login', () => {
  test('should complete login flow without 2FA', async ({ page }) => {
    await page.goto('/auth/login');

    // Fill in credentials
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    // Submit form
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Welcome')).toBeVisible();
  });

  test('should show 2FA verification screen', async ({ page }) => {
    await page.goto('/auth/login');

    // Fill in credentials for user with 2FA
    await page.fill('input[name="email"]', 'user-with-2fa@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    // Submit form
    await page.click('button[type="submit"]');

    // Should show 2FA screen
    await expect(page).toHaveURL(/\/auth\/verify-2fa/);
    await expect(page.locator('text=Enter the 6-digit code')).toBeVisible();
  });

  test('should handle failed 2FA verification', async ({ page }) => {
    // Navigate to 2FA screen (assuming we have a temporary token)
    await page.goto('/auth/verify-2fa?token=test-token&type=TOTP');

    // Enter invalid code
    await page.fill('input[inputmode="numeric"]', '000000');

    // Should show error
    await expect(page.locator('text=Invalid verification code')).toBeVisible();
    await expect(page.locator('text=attempts remaining')).toBeVisible();
  });

  test('should show countdown timer', async ({ page }) => {
    await page.goto('/auth/verify-2fa?token=test-token&type=TOTP');

    // Timer should be visible
    await expect(page.locator('text=Time remaining:')).toBeVisible();
    await expect(page.locator('text=/[0-9]:[0-9]{2}/')).toBeVisible();
  });
});
```

---

## Frontend Implementation Checklist

### Step 1: Setup

- [ ] Install dependencies (React Query, Zod, date-fns, etc.)
- [ ] Configure API client with credentials support
- [ ] Set up environment variables (API_BASE_URL, CAPTCHA keys)
- [ ] Create TypeScript type definitions from Part 1
- [ ] Set up error handling utilities

### Step 2: Core Components

- [ ] Create login form component
  - [ ] Email and password inputs with validation
  - [ ] Remember me checkbox
  - [ ] CAPTCHA integration
  - [ ] Progressive delay handling
  - [ ] Error display
- [ ] Create 2FA verification component
  - [ ] 6-digit code input (auto-focus, auto-submit)
  - [ ] Countdown timer display
  - [ ] Backup code option
  - [ ] Error handling with attempts remaining
- [ ] Create backup code verification component
  - [ ] Text input for backup codes
  - [ ] Format normalization (remove spaces/hyphens)
  - [ ] Warning about code consumption

### Step 3: State Management

- [ ] Set up authentication context or store
- [ ] Implement login state machine
- [ ] Handle temporary token storage
- [ ] Manage security state (lockout, CAPTCHA, rate limits)
- [ ] Clear sensitive data on navigation/unmount

### Step 4: API Integration

- [ ] Implement login API call
- [ ] Implement 2FA verification API call
- [ ] Implement backup code verification API call
- [ ] Handle API errors and map to user-friendly messages
- [ ] Configure cookie handling (credentials: 'include')

### Step 5: UX Enhancements

- [ ] Add loading states and spinners
- [ ] Implement rate limit indicators
- [ ] Show account lockout countdown
- [ ] Add progressive delay indicators
- [ ] Display attempts remaining
- [ ] Show temporary token expiry timer
- [ ] Implement offline detection

### Step 6: Security

- [ ] Never log sensitive data (passwords, codes, tokens)
- [ ] Clear sensitive form data on unmount
- [ ] Implement request timeouts
- [ ] Validate all user input client-side
- [ ] Use HTTPS in production
- [ ] Configure secure cookie settings

### Step 7: Accessibility

- [ ] Add proper ARIA labels and roles
- [ ] Implement keyboard navigation
- [ ] Add screen reader announcements
- [ ] Test with screen reader
- [ ] Ensure sufficient color contrast
- [ ] Add focus indicators
- [ ] Support prefers-reduced-motion

### Step 8: Testing

- [ ] Write unit tests for validation functions
- [ ] Write integration tests for API client
- [ ] Write E2E tests for login flow
- [ ] Test 2FA verification flow
- [ ] Test error handling scenarios
- [ ] Test accessibility with automated tools

### Step 9: Documentation

- [ ] Document component APIs
- [ ] Add code examples
- [ ] Document error handling patterns
- [ ] Create user-facing help documentation
- [ ] Document trusted device management

### Step 10: Edge Cases

- [ ] Handle expired temporary tokens
- [ ] Handle network errors
- [ ] Handle account lockout
- [ ] Handle CAPTCHA failures
- [ ] Handle session expiry during 2FA
- [ ] Test with slow network connections
- [ ] Test browser back/forward navigation

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting Cookie Credentials

**Problem:** Session cookies not being sent/received.

**Solution:**
```typescript
// Always include credentials
fetch('/api/auth/login', {
  credentials: 'include', // Required!
});
```

### Pitfall 2: Not Handling Token Expiry

**Problem:** Users getting stuck on expired 2FA screen.

**Solution:**
```typescript
// Check expiry before verification
if (isTokenExpired(temporaryToken)) {
  showMessage('Your session has expired. Please log in again.');
  router.push('/auth/login');
  return;
}
```

### Pitfall 3: Logging Sensitive Data

**Problem:** Passwords/codes appearing in browser console.

**Solution:**
```typescript
// Never do this:
console.log('Login data:', { email, password }); // ❌

// Do this instead:
console.log('Login attempt for:', email); // ✅
```

### Pitfall 4: Not Clearing Sensitive State

**Problem:** Sensitive data persisting in memory.

**Solution:**
```typescript
useEffect(() => {
  return () => {
    // Cleanup on unmount
    setPassword('');
    setCode('');
    setTemporaryToken(null);
  };
}, []);
```

### Pitfall 5: Poor Error Messages

**Problem:** Generic errors confusing users.

**Solution:**
```typescript
// Map backend error codes to user-friendly messages
const errorMessages = {
  INVALID_CREDENTIALS: 'The email or password you entered is incorrect.',
  ACCOUNT_LOCKED: 'Your account is temporarily locked. Try again in 15 minutes.',
  // ... etc
};
```

---

## Support & Resources

### Backend API Documentation
- Part 1: [API Reference](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART1.md)
- Part 2: [Business Logic](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART2.md)

### Related Modules
- [2FA Setup](./AUTHENTICATOR_2FA_REST_API_QUICK_REFERENCE.md)
- [Admin 2FA Management](./ADMIN_2FA_MANAGEMENT_QUICK_REFERENCE.md)
- [Account Lockout](./AUTH_IMPLEMENTATION.md)

### External Resources
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Web Authentication API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-10-19 | Initial multi-step login documentation |

---

**Document Status:** ✅ Complete - Ready for Frontend Implementation  
**Previous Document:** [Part 2: Business Logic](./FRONTEND_INTEGRATION_MULTI_STEP_LOGIN_PART2.md)  
**Series Complete:** All 3 parts published

---

## Quick Contact

For questions or clarifications:
- **Backend Team:** Check #backend-dev channel
- **API Issues:** Create ticket in JIRA
- **Security Concerns:** Contact security team immediately

**Happy coding! 🚀**
