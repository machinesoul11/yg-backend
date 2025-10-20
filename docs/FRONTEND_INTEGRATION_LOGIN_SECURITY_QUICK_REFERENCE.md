# Frontend Integration: Login Security Quick Reference

## 🌐 Classification: SHARED
Quick reference guide for common tasks and API usage patterns.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Common Code Patterns](#common-code-patterns)
3. [API Request/Response Examples](#api-request-response-examples)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Environment Variables](#environment-variables)
6. [Testing Checklist](#testing-checklist)

---

## Quick Start

### Minimal Working Login Form (Next.js 15 + tRPC)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if ('requiresTwoFactor' in data.data) {
        // Redirect to 2FA page
        router.push('/auth/verify-2fa');
      } else {
        // Redirect to dashboard
        router.push('/dashboard');
      }
    },
    onError: (error) => {
      setError(error.message);
    },
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    await loginMutation.mutateAsync({ email, password });
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
        autoComplete="email"
      />
      
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
        autoComplete="current-password"
      />
      
      {error && (
        <div className="text-red-600">{error}</div>
      )}
      
      <button
        type="submit"
        disabled={loginMutation.isLoading}
      >
        {loginMutation.isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

---

## Common Code Patterns

### Pattern 1: Login with CAPTCHA Support

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Script from 'next/script';
import { trpc } from '@/lib/trpc';

export function LoginFormWithCaptcha() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      // Handle success
      window.location.href = '/dashboard';
    },
    onError: (error) => {
      if (error.data?.code === 'CAPTCHA_REQUIRED') {
        setShowCaptcha(true);
      } else if (error.data?.code === 'CAPTCHA_FAILED') {
        // Reset CAPTCHA widget
        if (window.grecaptcha) {
          window.grecaptcha.reset();
          setCaptchaToken(null);
        }
      }
    },
  });
  
  // Initialize reCAPTCHA when shown
  useEffect(() => {
    if (showCaptcha && window.grecaptcha && captchaRef.current) {
      if (!captchaRef.current.hasChildNodes()) {
        window.grecaptcha.render(captchaRef.current, {
          sitekey: process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY!,
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(null),
        });
      }
    }
  }, [showCaptcha]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await loginMutation.mutateAsync({
      ...formData,
      captchaToken: captchaToken || undefined,
    });
  };
  
  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/api.js"
        strategy="lazyOnload"
      />
      
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          required
        />
        
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
          required
        />
        
        {showCaptcha && (
          <div ref={captchaRef} className="my-4" />
        )}
        
        <button
          type="submit"
          disabled={loginMutation.isLoading || (showCaptcha && !captchaToken)}
        >
          Sign In
        </button>
      </form>
    </>
  );
}
```

---

### Pattern 2: Login with Device Fingerprinting

```tsx
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { trpc } from '@/lib/trpc';

// Initialize once
let fpPromise: Promise<any> | null = null;

async function getDeviceFingerprint(): Promise<string> {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  
  const fp = await fpPromise;
  const result = await fp.get();
  return result.visitorId;
}

export function LoginFormWithFingerprinting() {
  const loginMutation = trpc.auth.login.useMutation();
  
  const handleSubmit = async (email: string, password: string) => {
    // Generate fingerprint only when user submits
    const deviceFingerprint = await getDeviceFingerprint();
    
    await loginMutation.mutateAsync({
      email,
      password,
      deviceFingerprint,
    });
  };
  
  return (
    // Your form JSX
    <form onSubmit={(e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      handleSubmit(
        formData.get('email') as string,
        formData.get('password') as string
      );
    }}>
      {/* Form fields */}
    </form>
  );
}
```

---

### Pattern 3: Protected Route with Session Check

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isLoading } = trpc.auth.getSession.useQuery();
  
  useEffect(() => {
    if (!isLoading && !session?.data?.user) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.push(`/login?returnUrl=${returnUrl}`);
    }
  }, [isLoading, session, router]);
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!session?.data?.user) {
    return null;
  }
  
  return <>{children}</>;
}

// Usage in layout or page
export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
```

---

### Pattern 4: Admin-Only Route Guard

```tsx
import { useSession } from '@/hooks/useSession';
import { UserRole } from '@/types/auth';
import { redirect } from 'next/navigation';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    redirect('/login');
  }
  
  if (user.role !== UserRole.ADMIN) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="mt-2">You do not have permission to access this page.</p>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

---

### Pattern 5: Login History Display

```tsx
import { trpc } from '@/lib/trpc';
import { formatDistanceToNow } from 'date-fns';

export function LoginHistoryTable() {
  const { data, isLoading } = trpc.auth.getLoginHistory.useQuery({
    limit: 50,
    includeSuccessful: true,
    includeAnomalous: true,
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th>Time</th>
          <th>Status</th>
          <th>Location</th>
          <th>IP Address</th>
          <th>Alerts</th>
        </tr>
      </thead>
      <tbody>
        {data?.data?.attempts.map((attempt) => (
          <tr
            key={attempt.id}
            className={attempt.isAnomalous ? 'bg-yellow-50' : ''}
          >
            <td>
              {formatDistanceToNow(new Date(attempt.timestamp), {
                addSuffix: true,
              })}
            </td>
            <td>
              {attempt.success ? (
                <span className="text-green-600">✓ Success</span>
              ) : (
                <span className="text-red-600">✗ Failed</span>
              )}
            </td>
            <td>
              {[
                attempt.locationCity,
                attempt.locationRegion,
                attempt.locationCountry,
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </td>
            <td>
              <code className="text-xs">{attempt.ipAddress || '—'}</code>
            </td>
            <td>
              {attempt.isAnomalous && (
                <div className="flex items-center gap-1 text-orange-600">
                  ⚠️
                  <span className="text-xs">
                    {attempt.anomalyReasons.join(', ')}
                  </span>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

### Pattern 6: Admin Unlock Account

```tsx
import { trpc } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';

export function UnlockAccountButton({ userId }: { userId: string }) {
  const utils = trpc.useContext();
  
  const unlockMutation = trpc.admin.unlockAccount.useMutation({
    onSuccess: () => {
      toast.success('Account unlocked successfully');
      utils.admin.getUserDetails.invalidate({ userId });
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });
  
  const handleUnlock = () => {
    if (confirm('Are you sure you want to unlock this account?')) {
      unlockMutation.mutate({ userId });
    }
  };
  
  return (
    <button
      onClick={handleUnlock}
      disabled={unlockMutation.isLoading}
      className="btn-danger"
    >
      {unlockMutation.isLoading ? 'Unlocking...' : 'Unlock Account'}
    </button>
  );
}
```

---

## API Request/Response Examples

### Example 1: Successful Login (No 2FA)

**Request**:
```typescript
await trpc.auth.login.mutate({
  email: "user@yesgoddess.agency",
  password: "SecurePassword123!",
  rememberMe: true
});
```

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clxyz123456789",
      "email": "user@yesgoddess.agency",
      "name": "Jane Doe",
      "role": "BRAND",
      "emailVerified": true,
      "avatar": "https://cdn.yesgoddess.agency/avatars/user123.jpg"
    }
  }
}
```

---

### Example 2: Login Requiring 2FA

**Request**:
```typescript
await trpc.auth.login.mutate({
  email: "admin@yesgoddess.agency",
  password: "AdminPassword123!"
});
```

**Response**:
```json
{
  "success": true,
  "requiresTwoFactor": true,
  "data": {
    "temporaryToken": "temp_clxyz123456789abcdef",
    "challengeType": "TOTP",
    "expiresAt": "2024-10-20T12:15:00.000Z"
  }
}
```

---

### Example 3: Failed Login (Invalid Credentials)

**Request**:
```typescript
await trpc.auth.login.mutate({
  email: "user@yesgoddess.agency",
  password: "WrongPassword"
});
```

**Response** (throws `TRPCClientError`):
```json
{
  "error": {
    "message": "Invalid email or password",
    "data": {
      "code": "INVALID_CREDENTIALS",
      "statusCode": 401,
      "httpStatus": 401
    }
  }
}
```

---

### Example 4: CAPTCHA Required

**Request** (after 3 failed attempts):
```typescript
await trpc.auth.login.mutate({
  email: "user@yesgoddess.agency",
  password: "WrongPassword"
});
```

**Response** (throws `TRPCClientError`):
```json
{
  "error": {
    "message": "CAPTCHA verification is required after multiple failed login attempts.",
    "data": {
      "code": "CAPTCHA_REQUIRED",
      "statusCode": 429,
      "requiresCaptcha": true
    }
  }
}
```

**Next Request** (with CAPTCHA):
```typescript
await trpc.auth.login.mutate({
  email: "user@yesgoddess.agency",
  password: "CorrectPassword",
  captchaToken: "03AGdBq27X..."  // From reCAPTCHA widget
});
```

---

### Example 5: Account Locked

**Request** (after 10 failed attempts):
```typescript
await trpc.auth.login.mutate({
  email: "user@yesgoddess.agency",
  password: "AnyPassword"
});
```

**Response** (throws `TRPCClientError`):
```json
{
  "error": {
    "message": "Account is locked due to too many failed login attempts. Please try again later or reset your password.",
    "data": {
      "code": "ACCOUNT_LOCKED",
      "statusCode": 423
    }
  }
}
```

---

### Example 6: Get Login History

**Request**:
```typescript
const history = await trpc.auth.getLoginHistory.query({
  limit: 20,
  includeSuccessful: true,
  includeAnomalous: true
});
```

**Response**:
```json
{
  "success": true,
  "data": {
    "attempts": [
      {
        "id": "cla1b2c3d4e5f6",
        "timestamp": "2024-10-20T10:30:00.000Z",
        "success": true,
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "deviceFingerprint": "abc123def456",
        "locationCountry": "United States",
        "locationRegion": "California",
        "locationCity": "San Francisco",
        "isAnomalous": false,
        "anomalyReasons": [],
        "failureReason": null
      },
      {
        "id": "cla1b2c3d4e5f7",
        "timestamp": "2024-10-19T15:22:00.000Z",
        "success": true,
        "ipAddress": "203.0.113.45",
        "userAgent": "Mozilla/5.0...",
        "deviceFingerprint": "xyz789ghi012",
        "locationCountry": "Japan",
        "locationRegion": "Tokyo",
        "locationCity": "Tokyo",
        "isAnomalous": true,
        "anomalyReasons": ["NEW_COUNTRY", "NEW_DEVICE"],
        "failureReason": null
      }
    ]
  }
}
```

---

### Example 7: Admin Unlock Account

**Request**:
```typescript
await trpc.admin.unlockAccount.mutate({
  userId: "clxyz123456789"
});
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Account unlocked successfully"
  }
}
```

---

## Troubleshooting Guide

### Issue: CAPTCHA Widget Not Showing

**Symptoms**: After 3 failed login attempts, no CAPTCHA appears

**Possible Causes**:
1. Frontend not detecting `CAPTCHA_REQUIRED` error
2. reCAPTCHA script not loaded
3. Invalid site key

**Solutions**:
```typescript
// 1. Check error handling
onError: (error) => {
  console.log('Error code:', error.data?.code); // Should be 'CAPTCHA_REQUIRED'
  if (error.data?.code === 'CAPTCHA_REQUIRED') {
    setShowCaptcha(true);
  }
}

// 2. Verify script is loaded
useEffect(() => {
  console.log('grecaptcha available:', !!window.grecaptcha);
}, []);

// 3. Check environment variable
console.log('Site key:', process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY);
```

---

### Issue: Progressive Delays Not Working

**Symptoms**: Login requests return immediately after multiple failures

**Cause**: Progressive delays are **server-side only**. The backend applies the delay before responding.

**Expected Behavior**:
- 1st failure: ~1s response time
- 2nd failure: ~2s response time
- 3rd failure: ~4s response time
- etc.

**Verification**:
```typescript
const startTime = Date.now();
await trpc.auth.login.mutate({ email, password });
const elapsedTime = Date.now() - startTime;
console.log(`Request took ${elapsedTime}ms`);
```

---

### Issue: Account Locked but User Can Still Login

**Symptom**: User successfully logs in despite lockout

**Possible Causes**:
1. Lockout expired (30 minutes passed)
2. Admin manually unlocked account
3. User used password reset (resets lockout)

**Check Backend**:
```sql
-- Check user's lockout status
SELECT 
  email,
  locked_until,
  failed_login_count,
  last_failed_login
FROM users
WHERE email = 'user@example.com';
```

---

### Issue: Device Fingerprinting Not Detecting New Devices

**Symptoms**: All logins show as same device, no anomaly detection

**Possible Causes**:
1. `deviceFingerprint` not being sent in request
2. FingerprintJS not initialized
3. Browser blocking fingerprinting

**Solutions**:
```typescript
// 1. Verify fingerprint is sent
console.log('Sending fingerprint:', deviceFingerprint);

// 2. Check FingerprintJS
const fp = await FingerprintJS.load();
console.log('FingerprintJS loaded:', fp);

// 3. Test in different browsers/incognito
// Expected: Different fingerprints in different browsers
```

---

### Issue: tRPC Errors Not Being Caught

**Symptom**: Errors crash the app instead of being handled

**Cause**: Missing error handling in mutation

**Solution**:
```typescript
// ❌ BAD: No error handling
const loginMutation = trpc.auth.login.useMutation();
await loginMutation.mutateAsync({ email, password }); // Throws unhandled error

// ✅ GOOD: Proper error handling
const loginMutation = trpc.auth.login.useMutation({
  onError: (error) => {
    console.error('Login error:', error);
    setErrorMessage(error.message);
  }
});

// OR use try/catch
try {
  await loginMutation.mutateAsync({ email, password });
} catch (error) {
  console.error('Login error:', error);
}
```

---

### Issue: Session Not Persisting After Login

**Symptom**: User redirected to login after page refresh

**Possible Causes**:
1. JWT cookie not being set (httpOnly)
2. Cookie domain mismatch
3. CORS issues

**Verification**:
```typescript
// Check if cookie is set
console.log('Cookies:', document.cookie);

// Check session endpoint
const session = await trpc.auth.getSession.query();
console.log('Session:', session);
```

**Check DevTools**:
- Open Application/Storage tab
- Look for `token` or `session` cookie
- Verify Domain, Path, and HttpOnly settings

---

### Issue: Admin Endpoints Returning 403

**Symptom**: Admin user gets "Access Denied" on admin routes

**Possible Causes**:
1. User role is not `ADMIN`
2. JWT token expired
3. Session not being sent with request

**Verification**:
```typescript
const { data: session } = trpc.auth.getSession.useQuery();
console.log('User role:', session?.data?.user?.role);
// Should be 'ADMIN'
```

---

## Environment Variables

### Frontend (.env.local)

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency

# CAPTCHA Configuration (choose one provider)
NEXT_PUBLIC_CAPTCHA_PROVIDER=recaptcha  # or hcaptcha, turnstile, none
NEXT_PUBLIC_CAPTCHA_SITE_KEY=your_site_key_here

# Optional: Analytics
NEXT_PUBLIC_ANALYTICS_ID=your_analytics_id
```

### Backend (.env) - For Reference Only

**⚠️ DO NOT copy these to frontend!**

```bash
# Database
DATABASE_URL=postgresql://...
DATABASE_URL_POOLED=postgresql://...

# CAPTCHA (backend verification)
CAPTCHA_PROVIDER=recaptcha
CAPTCHA_SECRET_KEY=your_secret_key  # NEVER expose this!

# Email
EMAIL_FROM=noreply@yesgoddess.agency
RESEND_API_KEY=re_...

# JWT
JWT_SECRET=your_jwt_secret  # NEVER expose this!
JWT_EXPIRES_IN=7d

# IP Geolocation (optional)
IPSTACK_API_KEY=your_ipstack_key  # For location detection
```

---

## Testing Checklist

### Before Deploying to Production

- [ ] **Functional Tests**
  - [ ] Normal login flow works
  - [ ] Invalid credentials show generic error
  - [ ] CAPTCHA appears after 3 failures
  - [ ] Account locks after 10 failures
  - [ ] Lockout email is sent
  - [ ] 2FA flow works (if applicable)
  - [ ] Device fingerprinting sends data
  - [ ] Login history displays correctly
  - [ ] Admin unlock works

- [ ] **Security Tests**
  - [ ] JWT stored in httpOnly cookie
  - [ ] HTTPS enforced in production
  - [ ] CAPTCHA cannot be bypassed
  - [ ] No sensitive data logged to console
  - [ ] Password fields use `type="password"`
  - [ ] autocomplete attributes set correctly
  - [ ] CSP headers configured

- [ ] **UX Tests**
  - [ ] Loading states display properly
  - [ ] Error messages are user-friendly
  - [ ] Progressive hints appear after failures
  - [ ] "Forgot Password" link is prominent
  - [ ] Form validation works (client-side)
  - [ ] Keyboard navigation works

- [ ] **Accessibility Tests**
  - [ ] ARIA labels on inputs
  - [ ] Error messages have role="alert"
  - [ ] CAPTCHA is keyboard accessible
  - [ ] Color contrast meets WCAG AA
  - [ ] Screen reader announces errors
  - [ ] Focus management works

- [ ] **Performance Tests**
  - [ ] Login completes in <2s (without delays)
  - [ ] CAPTCHA script loads lazily
  - [ ] FingerprintJS doesn't block render
  - [ ] No unnecessary re-renders

- [ ] **Cross-Browser Tests**
  - [ ] Chrome/Edge (Chromium)
  - [ ] Firefox
  - [ ] Safari (macOS and iOS)
  - [ ] Mobile browsers

---

## Common Pitfalls to Avoid

### ❌ DON'T

```typescript
// 1. DON'T store password in state longer than needed
const [password, setPassword] = useState('');
// After login, clear it:
setPassword('');

// 2. DON'T implement client-side delays
if (failedAttempts > 3) {
  await sleep(5000); // Backend handles this!
}

// 3. DON'T reveal user existence
if (error.code === 'USER_NOT_FOUND') {
  setError('Email not found'); // Enables user enumeration
}

// 4. DON'T store JWT in localStorage
localStorage.setItem('token', jwt); // XSS risk!

// 5. DON'T log sensitive data
console.log('Password:', password); // Never!
console.log('JWT:', token); // Never!
```

### ✅ DO

```typescript
// 1. DO clear password after use
setPassword('');

// 2. DO trust backend delays
// Just show loading spinner

// 3. DO use generic error messages
setError('Invalid email or password');

// 4. DO use httpOnly cookies (backend sets this)
// No action needed on frontend

// 5. DO log helpful debugging info
console.log('Login attempt for email:', email.substring(0, 3) + '***');
console.log('Error code:', error.code);
```

---

## Quick Lookup: HTTP Status Codes

| Status | Code | Meaning | Action |
|--------|------|---------|--------|
| 200 | — | Login successful | Redirect to dashboard |
| 401 | `INVALID_CREDENTIALS` | Wrong password | Show generic error |
| 403 | `EMAIL_NOT_VERIFIED` | Email unverified | Show resend button |
| 410 | `ACCOUNT_DELETED` | Account deleted | Suggest recovery |
| 423 | `ACCOUNT_LOCKED` | Too many failures | Show reset link |
| 429 | `CAPTCHA_REQUIRED` | Need CAPTCHA | Show widget |

---

## Need Help?

### Common Questions

**Q: How do I test CAPTCHA in development?**  
A: Set `CAPTCHA_PROVIDER=none` in backend `.env` to disable CAPTCHA verification.

**Q: Can I show a countdown timer during account lockout?**  
A: Not recommended. The `lockedUntil` timestamp is not returned to clients to prevent timing attacks. Show a generic "30 minutes" message.

**Q: How do I test anomaly detection?**  
A: Login from a VPN in a different country, or use a different browser/device.

**Q: Can users reset failed login attempts themselves?**  
A: No. Attempts reset automatically after 15 minutes of inactivity or after successful login.

**Q: What happens if user has 2FA enabled?**  
A: After password verification, backend returns `requiresTwoFactor: true`. Redirect to 2FA page with `temporaryToken`.

---

**Document Version**: 1.0  
**Last Updated**: October 20, 2024  
**Maintained By**: Backend Development Team
