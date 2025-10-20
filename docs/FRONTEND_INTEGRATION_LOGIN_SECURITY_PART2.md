# Frontend Integration Guide: Login Security Module (Part 2)

## 🌐 Classification: SHARED + 🔒 ADMIN ONLY
Part 2 covers authorization, admin features, and implementation guide.

---

## Table of Contents

8. [Authorization & Permissions](#authorization--permissions)
9. [Rate Limiting & Quotas](#rate-limiting--quotas)
10. [Admin Features](#admin-features)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)
12. [Testing Guide](#testing-guide)
13. [Security Best Practices](#security-best-practices)

---

## Authorization & Permissions

### Endpoint Access Control

| Endpoint | Authentication | Authorization | Notes |
|----------|---------------|---------------|-------|
| `auth.login` | None (Public) | Public | No token required |
| `auth.getLoginHistory` | Required | Self or Admin | Users can only view their own history |
| `auth.getUserDevices` | Required | Self or Admin | Users can only view their own devices |
| `admin.unlockAccount` | Required | Admin only | Requires `ADMIN` role |
| `security.getSecurityStats` | Required | Admin only | Requires `ADMIN` role |

### Role-Based Access

```typescript
/**
 * User roles (from least to most privileged)
 */
export enum UserRole {
  VIEWER = 'VIEWER',     // Read-only access
  CREATOR = 'CREATOR',   // Creator portal access
  BRAND = 'BRAND',       // Brand portal access
  ADMIN = 'ADMIN',       // Full system access
}

/**
 * Check if user has admin access
 */
function isAdmin(user: { role: UserRole }): boolean {
  return user.role === UserRole.ADMIN;
}

/**
 * Check if user can access resource
 */
function canAccessLoginHistory(
  requestingUserId: string,
  targetUserId: string,
  userRole: UserRole
): boolean {
  // Users can view their own history
  if (requestingUserId === targetUserId) return true;
  
  // Admins can view any user's history
  if (userRole === UserRole.ADMIN) return true;
  
  return false;
}
```

### Frontend Authorization Patterns

```typescript
import { useSession } from '@/hooks/useSession';
import { UserRole } from '@/types/auth';

export function LoginHistoryPage() {
  const { user } = useSession();
  const router = useRouter();
  const { userId } = router.query;
  
  // Check authorization
  const canView = 
    user?.id === userId || 
    user?.role === UserRole.ADMIN;
  
  if (!canView) {
    return <AccessDenied />;
  }
  
  // Fetch login history
  const { data } = trpc.auth.getLoginHistory.useQuery({
    userId: userId as string,
    limit: 50,
  });
  
  return <LoginHistoryTable data={data} />;
}
```

### Session Management

**JWT Token Storage**:
```typescript
// Store in httpOnly cookie (set by backend)
// DO NOT store JWT in localStorage (XSS risk)

// Session check
export function useSession() {
  const { data: session, isLoading } = trpc.auth.getSession.useQuery();
  
  return {
    user: session?.data?.user,
    isAuthenticated: !!session?.data?.user,
    isLoading,
  };
}

// Protected route wrapper
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useSession();
  const router = useRouter();
  
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login?returnUrl=' + router.asPath);
    }
  }, [isAuthenticated, isLoading]);
  
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return null;
  
  return <>{children}</>;
}
```

---

## Rate Limiting & Quotas

### Current Status

**⚠️ Login Endpoint**: Currently **NOT** rate limited at the network/API gateway level.

**Security Controls in Place**:
- ✅ Progressive delays (exponential backoff)
- ✅ Account lockout after 10 attempts
- ✅ CAPTCHA after 3 attempts
- ✅ 15-minute reset window

**Why No Explicit Rate Limit?**:
The progressive delay + lockout system **is** the rate limiting mechanism. It's more sophisticated than a simple "X requests per minute" limit because:
- Slows down attackers exponentially
- Doesn't affect legitimate users who mistype password once or twice
- Self-healing (resets after 15 minutes)

### Recommended Frontend Rate Limiting

While the backend handles security, implement client-side throttling for UX:

```typescript
import { useState, useRef } from 'react';

export function useLoginThrottle() {
  const [canSubmit, setCanSubmit] = useState(true);
  const lastAttemptRef = useRef<number>(0);
  
  const throttleLogin = async (loginFn: () => Promise<void>) => {
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptRef.current;
    
    // Prevent rapid-fire clicking (client-side only)
    if (timeSinceLastAttempt < 1000) {
      console.log('Please wait before trying again');
      return;
    }
    
    setCanSubmit(false);
    lastAttemptRef.current = now;
    
    try {
      await loginFn();
    } finally {
      // Re-enable after 1 second
      setTimeout(() => setCanSubmit(true), 1000);
    }
  };
  
  return { canSubmit, throttleLogin };
}

// Usage
const { canSubmit, throttleLogin } = useLoginThrottle();

<button
  type="submit"
  disabled={!canSubmit || isLoading}
  onClick={() => throttleLogin(handleLogin)}
>
  Sign In
</button>
```

### Quota Monitoring (Admin)

Admins can monitor login attempt patterns:

```typescript
export function SecurityDashboard() {
  const { data } = trpc.security.getSecurityStats.useQuery();
  
  return (
    <div>
      <MetricCard
        title="Failed Login Attempts (24h)"
        value={data?.recentActivity.failedAttempts24h}
        trend="up"
        isAlert={data?.recentActivity.failedAttempts24h > 100}
      />
      
      <MetricCard
        title="Locked Accounts"
        value={data?.overview.lockedAccounts}
        isAlert={data?.overview.lockedAccounts > 5}
      />
      
      <MetricCard
        title="Anomalous Logins (7d)"
        value={data?.trends.anomalousLogins7d}
        trend="stable"
      />
    </div>
  );
}
```

---

## Admin Features

### 1. Manual Account Unlock

**Endpoint**: `admin.unlockAccount`

**Use Case**: Legitimate user locked out, wants immediate access

**Frontend Implementation**:

```tsx
'use client';

import { trpc } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';

export function UnlockAccountButton({ userId }: { userId: string }) {
  const utils = trpc.useContext();
  
  const unlockMutation = trpc.admin.unlockAccount.useMutation({
    onSuccess: () => {
      toast.success('Account unlocked successfully');
      // Invalidate queries to refresh data
      utils.admin.getUserDetails.invalidate({ userId });
    },
    onError: (error) => {
      toast.error(`Failed to unlock account: ${error.message}`);
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

### 2. View User Login History (Admin)

```tsx
export function UserLoginHistory({ userId }: { userId: string }) {
  const { data, isLoading } = trpc.auth.getLoginHistory.useQuery({
    userId,
    limit: 100,
    includeAnomalous: true,
  });
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Status</th>
          <th>IP Address</th>
          <th>Location</th>
          <th>Device</th>
          <th>Anomaly</th>
        </tr>
      </thead>
      <tbody>
        {data?.attempts.map((attempt) => (
          <tr key={attempt.id} className={attempt.isAnomalous ? 'bg-red-50' : ''}>
            <td>{new Date(attempt.timestamp).toLocaleString()}</td>
            <td>
              {attempt.success ? (
                <Badge variant="success">Success</Badge>
              ) : (
                <Badge variant="danger">{attempt.failureReason}</Badge>
              )}
            </td>
            <td>
              <code>{attempt.ipAddress || 'Unknown'}</code>
            </td>
            <td>
              {[
                attempt.locationCity,
                attempt.locationRegion,
                attempt.locationCountry,
              ]
                .filter(Boolean)
                .join(', ') || 'Unknown'}
            </td>
            <td>
              <Tooltip content={attempt.userAgent}>
                <span className="text-sm text-gray-600">
                  {parseUserAgent(attempt.userAgent).browser}
                </span>
              </Tooltip>
            </td>
            <td>
              {attempt.isAnomalous && (
                <Tooltip content={attempt.anomalyReasons.join(', ')}>
                  <Badge variant="warning">
                    ⚠️ {attempt.anomalyReasons.length} alerts
                  </Badge>
                </Tooltip>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 3. Security Dashboard (Admin)

```tsx
export function SecurityDashboard() {
  const { data, isLoading } = trpc.security.getSecurityStats.useQuery();
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Overview Cards */}
      <MetricCard
        title="Total Users"
        value={data?.overview.totalUsers}
        icon={<UsersIcon />}
      />
      
      <MetricCard
        title="2FA Adoption Rate"
        value={data?.overview.adoptionRate}
        icon={<ShieldIcon />}
        trend={data?.overview.adoptionRate > '50%' ? 'up' : 'down'}
      />
      
      <MetricCard
        title="Failed Logins (24h)"
        value={data?.recentActivity.failedAttempts24h}
        icon={<AlertIcon />}
        isAlert={data?.recentActivity.failedAttempts24h > 100}
      />
      
      <MetricCard
        title="Security Alerts (24h)"
        value={data?.recentActivity.securityAlerts24h}
        icon={<WarningIcon />}
        isAlert={data?.recentActivity.securityAlerts24h > 10}
      />
      
      {/* Charts */}
      <div className="col-span-2">
        <LoginAttemptsChart data={data?.trends} />
      </div>
      
      <div className="col-span-2">
        <AnomalyDetectionChart data={data?.trends} />
      </div>
      
      {/* Recent Activity */}
      <div className="col-span-4">
        <RecentSecurityEvents limit={20} />
      </div>
    </div>
  );
}
```

### 4. Bulk Account Operations (Future Enhancement)

**Not Yet Implemented** - Add to roadmap:

```typescript
// Future API
trpc.admin.bulkUnlockAccounts.mutate({
  userIds: ['user1', 'user2', 'user3'],
});

trpc.admin.resetLoginAttempts.mutate({
  userId: 'user123',
});

trpc.admin.setAccountLockoutOverride.mutate({
  userId: 'user123',
  disableLockout: true, // Exempt from lockout (e.g., for testing)
});
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Login Flow

- [ ] **1.1** Create login form component with email/password fields
- [ ] **1.2** Integrate tRPC mutation for `auth.login`
- [ ] **1.3** Handle loading states (show spinner during submission)
- [ ] **1.4** Display generic error message on `INVALID_CREDENTIALS`
- [ ] **1.5** Redirect to dashboard on successful login (no 2FA)
- [ ] **1.6** Store JWT token in httpOnly cookie (handled by backend)
- [ ] **1.7** Implement session check with `auth.getSession`

### Phase 2: Security Features

- [ ] **2.1** Add CAPTCHA script loading (Next.js `<Script>` component)
- [ ] **2.2** Detect `CAPTCHA_REQUIRED` error and show widget
- [ ] **2.3** Implement CAPTCHA reset after each attempt
- [ ] **2.4** Pass `captchaToken` in login request when CAPTCHA is completed
- [ ] **2.5** Handle `ACCOUNT_LOCKED` error with user-friendly message
- [ ] **2.6** Display "Forgot Password" link prominently on lockout
- [ ] **2.7** Implement client-side failed attempt counter (for progressive hints)
- [ ] **2.8** Show helpful tips after 2-3 failed attempts

### Phase 3: Device Fingerprinting

- [ ] **3.1** Install FingerprintJS library (`npm install @fingerprintjs/fingerprintjs`)
- [ ] **3.2** Create `getDeviceFingerprint()` utility function
- [ ] **3.3** Generate fingerprint on login attempt (not page load)
- [ ] **3.4** Pass `deviceFingerprint` in login request
- [ ] **3.5** Add privacy policy disclosure for device fingerprinting
- [ ] **3.6** Clear fingerprints on logout (session storage)

### Phase 4: 2FA Flow (if applicable)

- [ ] **4.1** Detect `requiresTwoFactor: true` in login response
- [ ] **4.2** Store `temporaryToken` in session storage (not localStorage)
- [ ] **4.3** Redirect to 2FA verification page
- [ ] **4.4** Pass `temporaryToken` to 2FA verification endpoint
- [ ] **4.5** Handle 2FA verification success/failure
- [ ] **4.6** Clear `temporaryToken` after successful verification

### Phase 5: User Profile & History

- [ ] **5.1** Create "Login History" page for users
- [ ] **5.2** Fetch login attempts with `auth.getLoginHistory`
- [ ] **5.3** Display table with timestamp, IP, location, device
- [ ] **5.4** Highlight anomalous logins with warning badge
- [ ] **5.5** Create "Trusted Devices" page
- [ ] **5.6** Fetch devices with `auth.getUserDevices`
- [ ] **5.7** Allow users to remove trusted devices (if backend supports)

### Phase 6: Admin Features

- [ ] **6.1** Create admin route guard (check for `ADMIN` role)
- [ ] **6.2** Build Security Dashboard with metrics
- [ ] **6.3** Fetch stats with `security.getSecurityStats`
- [ ] **6.4** Display charts for login trends and anomalies
- [ ] **6.5** Build User Login History viewer (admin)
- [ ] **6.6** Add "Unlock Account" button with confirmation
- [ ] **6.7** Implement search/filter for security events
- [ ] **6.8** Add export functionality for security logs

### Phase 7: UX Enhancements

- [ ] **7.1** Add loading spinner during progressive delays
- [ ] **7.2** Implement "Remember Me" checkbox (extends JWT expiry)
- [ ] **7.3** Add "Show/Hide Password" toggle
- [ ] **7.4** Implement password strength meter on registration
- [ ] **7.5** Add "Forgot Password" link on login form
- [ ] **7.6** Display success notification on password reset
- [ ] **7.7** Show countdown timer on account lockout (optional)
- [ ] **7.8** Add breadcrumbs for admin pages

### Phase 8: Accessibility

- [ ] **8.1** Add ARIA labels to form inputs
- [ ] **8.2** Ensure CAPTCHA widget is keyboard accessible
- [ ] **8.3** Add screen reader announcements for errors
- [ ] **8.4** Test with NVDA/JAWS screen readers
- [ ] **8.5** Ensure color contrast meets WCAG AA standards
- [ ] **8.6** Add focus indicators for keyboard navigation
- [ ] **8.7** Test with keyboard only (no mouse)

### Phase 9: Error Tracking & Monitoring

- [ ] **9.1** Integrate Sentry or similar error tracking
- [ ] **9.2** Track `CAPTCHA_REQUIRED` events in analytics
- [ ] **9.3** Track `ACCOUNT_LOCKED` events in analytics
- [ ] **9.4** Monitor login success/failure rates
- [ ] **9.5** Set up alerts for anomalous login spikes
- [ ] **9.6** Track CAPTCHA completion rates
- [ ] **9.7** Monitor device fingerprint collection success rate

### Phase 10: Testing

- [ ] **10.1** Write unit tests for login form component
- [ ] **10.2** Write integration tests for login flow
- [ ] **10.3** Test progressive delay behavior (mock timers)
- [ ] **10.4** Test CAPTCHA flow (success + failure)
- [ ] **10.5** Test account lockout flow
- [ ] **10.6** Test 2FA flow (if applicable)
- [ ] **10.7** Test admin unlock functionality
- [ ] **10.8** Perform accessibility audit
- [ ] **10.9** Conduct penetration testing
- [ ] **10.10** Load test login endpoint (simulate 1000 concurrent users)

---

## Testing Guide

### Manual Testing Scenarios

#### Scenario 1: Normal Login Flow

**Steps**:
1. Navigate to `/login`
2. Enter valid email and password
3. Click "Sign In"
4. Verify redirect to dashboard
5. Check that session is established (`auth.getSession` returns user)

**Expected**:
- ✅ Login succeeds immediately
- ✅ JWT cookie is set
- ✅ User is redirected to dashboard
- ✅ No CAPTCHA shown
- ✅ No lockout message

---

#### Scenario 2: Progressive Delays

**Steps**:
1. Navigate to `/login`
2. Enter valid email, wrong password
3. Click "Sign In" (1st attempt)
4. Note time to response (~1 second)
5. Enter wrong password again (2nd attempt)
6. Note time to response (~2 seconds)
7. Repeat for 3rd, 4th, 5th attempts

**Expected**:
- ✅ 1st attempt: ~1 second delay
- ✅ 2nd attempt: ~2 second delay
- ✅ 3rd attempt: ~4 seconds + CAPTCHA appears
- ✅ 4th attempt: ~8 seconds
- ✅ 5th+ attempts: ~16 seconds (capped)
- ✅ Generic error message each time

---

#### Scenario 3: CAPTCHA Requirement

**Steps**:
1. Make 3 failed login attempts (any email)
2. Verify CAPTCHA widget appears
3. Do NOT complete CAPTCHA, attempt to submit
4. Complete CAPTCHA, submit with wrong password
5. Complete CAPTCHA, submit with correct password

**Expected**:
- ✅ CAPTCHA appears after 3rd failure
- ✅ Cannot submit without CAPTCHA token
- ✅ Wrong password + valid CAPTCHA = `INVALID_CREDENTIALS` (CAPTCHA still shown)
- ✅ Correct password + valid CAPTCHA = Login success

---

#### Scenario 4: Account Lockout

**Steps**:
1. Make 10 failed login attempts with valid email
2. Verify lockout message appears
3. Try to login with correct password
4. Wait 30 minutes (or have admin unlock)
5. Try to login again

**Expected**:
- ✅ After 10th failure: `ACCOUNT_LOCKED` error (423)
- ✅ Lockout message displayed with password reset link
- ✅ User receives lockout email notification
- ✅ Cannot login even with correct password during lockout
- ✅ Can login after 30 minutes or manual unlock

---

#### Scenario 5: Anomaly Detection

**Prerequisites**: User must have existing login history

**Steps**:
1. Login from usual location/device (success)
2. Login from VPN in different country (success)
3. Check email for "unusual login" alert
4. View login history, verify anomaly is flagged

**Expected**:
- ✅ Login succeeds despite anomaly
- ✅ Email alert sent to user
- ✅ Login history shows `isAnomalous: true`
- ✅ Anomaly reasons include "NEW_COUNTRY" or "NEW_LOCATION"

---

#### Scenario 6: Admin Unlock

**Prerequisites**: User account is locked

**Steps**:
1. Login as admin
2. Navigate to user management
3. Find locked user account
4. Click "Unlock Account" button
5. Confirm action
6. Verify user can now login

**Expected**:
- ✅ Admin sees locked account indicator
- ✅ Unlock button is available
- ✅ Confirmation dialog appears
- ✅ Success message shown
- ✅ User's failed attempt counters reset
- ✅ User can login immediately
- ✅ Audit log records admin unlock action

---

### Automated Testing

#### Unit Test: Login Form Component

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '@/components/auth/LoginForm';
import { trpc } from '@/lib/trpc';

// Mock tRPC
jest.mock('@/lib/trpc');

describe('LoginForm', () => {
  it('renders email and password inputs', () => {
    render(<LoginForm />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
  
  it('displays error on invalid credentials', async () => {
    const mockLogin = jest.fn().mockRejectedValue({
      data: { code: 'INVALID_CREDENTIALS' },
      message: 'Invalid email or password',
    });
    
    (trpc.auth.login.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockLogin,
      isLoading: false,
    });
    
    render(<LoginForm />);
    
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });
  
  it('shows CAPTCHA after CAPTCHA_REQUIRED error', async () => {
    const mockLogin = jest.fn().mockRejectedValue({
      data: { code: 'CAPTCHA_REQUIRED' },
      message: 'CAPTCHA verification required',
    });
    
    (trpc.auth.login.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockLogin,
      isLoading: false,
    });
    
    render(<LoginForm />);
    
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(screen.getByTestId('captcha-widget')).toBeInTheDocument();
    });
  });
});
```

#### Integration Test: Login Flow with CAPTCHA

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should show CAPTCHA after 3 failed attempts', async ({ page }) => {
    await page.goto('/login');
    
    // Make 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForSelector('[role="alert"]'); // Error message
    }
    
    // CAPTCHA should now be visible
    await expect(page.locator('.g-recaptcha')).toBeVisible();
  });
  
  test('should lock account after 10 failed attempts', async ({ page }) => {
    await page.goto('/login');
    
    // Make 10 failed attempts
    for (let i = 0; i < 10; i++) {
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      
      // Complete CAPTCHA if shown (after 3rd attempt)
      if (await page.locator('.g-recaptcha').isVisible()) {
        // Note: Can't automate real CAPTCHA, use test keys in dev
        await page.evaluate(() => {
          (window as any).grecaptcha.getResponse = () => 'test-token';
        });
      }
      
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000); // Wait for progressive delay
    }
    
    // Lockout message should appear
    await expect(page.locator('text=Account is locked')).toBeVisible();
    await expect(page.locator('a[href*="reset-password"]')).toBeVisible();
  });
});
```

---

## Security Best Practices

### Frontend Security Checklist

- ✅ **DO** use HTTPS for all requests (enforce in production)
- ✅ **DO** store JWT in httpOnly cookies (prevents XSS)
- ✅ **DO** sanitize user inputs (email, password fields)
- ✅ **DO** use CSP headers to prevent XSS attacks
- ✅ **DON'T** store passwords in state longer than necessary
- ✅ **DON'T** log sensitive data (passwords, tokens) to console
- ✅ **DON'T** reveal user existence ("Invalid email or password", not "Email not found")
- ✅ **DON'T** implement client-side authentication logic (trust backend only)

### Password Handling

```typescript
// ✅ GOOD: Clear password after submission
const handleLogin = async () => {
  try {
    await trpc.auth.login.mutate({ email, password });
    setPassword(''); // Clear from state
  } catch (error) {
    setPassword(''); // Also clear on error
    handleError(error);
  }
};

// ❌ BAD: Storing password in localStorage
localStorage.setItem('password', password); // NEVER DO THIS

// ❌ BAD: Logging password
console.log('User password:', password); // NEVER DO THIS
```

### CAPTCHA Security

```typescript
// ✅ GOOD: Verify CAPTCHA on backend
await trpc.auth.login.mutate({
  email,
  password,
  captchaToken, // Backend verifies with CAPTCHA provider
});

// ❌ BAD: Trusting client-side CAPTCHA "completion"
if (captchaCompleted) {
  // This can be bypassed! Always verify server-side
}
```

### Device Fingerprinting Privacy

```typescript
// ✅ GOOD: Only collect on login attempt
const handleLogin = async () => {
  const fingerprint = await getDeviceFingerprint();
  await trpc.auth.login.mutate({ email, password, deviceFingerprint: fingerprint });
};

// ❌ BAD: Collecting on page load (tracking behavior)
useEffect(() => {
  getDeviceFingerprint().then(fp => {
    // Tracking user before they attempt login
  });
}, []);
```

### Error Handling Security

```typescript
// ✅ GOOD: Generic error messages
if (error.code === 'INVALID_CREDENTIALS') {
  setErrorMessage('Invalid email or password');
}

// ❌ BAD: Revealing user existence
if (error.code === 'USER_NOT_FOUND') {
  setErrorMessage('No account found with this email'); // Enables user enumeration
}
```

### Session Security

```typescript
// ✅ GOOD: Check session on protected routes
export function ProtectedPage() {
  const { user, isLoading } = useSession();
  
  if (isLoading) return <Loading />;
  if (!user) return <Redirect to="/login" />;
  
  return <DashboardContent />;
}

// ✅ GOOD: Logout on session expiry
useEffect(() => {
  const handleSessionExpiry = () => {
    toast.error('Your session has expired. Please login again.');
    router.push('/login');
  };
  
  // Listen for 401 errors
  trpc.client.onError((error) => {
    if (error.data?.statusCode === 401) {
      handleSessionExpiry();
    }
  });
}, []);
```

---

## Quick Reference: Error Codes

| Code | HTTP Status | Meaning | Frontend Action |
|------|------------|---------|-----------------|
| `INVALID_CREDENTIALS` | 401 | Wrong email/password | Show generic error |
| `ACCOUNT_LOCKED` | 423 | Too many failures | Show lockout message + reset link |
| `CAPTCHA_REQUIRED` | 429 | Need CAPTCHA | Show CAPTCHA widget |
| `CAPTCHA_FAILED` | 400 | CAPTCHA invalid | Reset widget, try again |
| `ACCOUNT_DELETED` | 410 | Account deleted | Suggest account recovery |
| `EMAIL_NOT_VERIFIED` | 403 | Email unverified | Show resend verification button |

---

## Support & Resources

### Backend Documentation
- [Login Security Implementation](./LOGIN_SECURITY_IMPLEMENTATION.md) - Complete backend docs
- [Authentication Implementation](./AUTH_IMPLEMENTATION.md) - Core auth system
- [2FA Integration Guide](./FRONTEND_INTEGRATION_2FA_SETUP_MANAGEMENT.md) - Two-factor auth

### External Resources
- [FingerprintJS Documentation](https://github.com/fingerprintjs/fingerprintjs)
- [Google reCAPTCHA](https://developers.google.com/recaptcha)
- [hCaptcha](https://docs.hcaptcha.com/)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Questions?
Contact the backend team for:
- API clarifications
- Environment variable setup
- Admin access for testing
- Production deployment coordination

---

**Document Version**: 1.0  
**Last Updated**: October 20, 2024  
**Maintained By**: Backend Development Team
