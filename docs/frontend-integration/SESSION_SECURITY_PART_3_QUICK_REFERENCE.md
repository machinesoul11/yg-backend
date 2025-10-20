# 🔒 Session Security Module - Part 3: Quick Reference & Implementation Guide
## Frontend Integration Guide

**Classification:** ⚡ HYBRID - Core security used by both admin and public-facing  
**Backend Module:** Session Security  
**Last Updated:** October 20, 2025  
**Related Docs:** Part 1 (Session Management), Part 2 (Step-Up Auth)

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Implementation Checklist](#implementation-checklist)
3. [Common Patterns & Utilities](#common-patterns--utilities)
4. [UI/UX Recommendations](#uiux-recommendations)
5. [Testing Scenarios](#testing-scenarios)
6. [Troubleshooting](#troubleshooting)
7. [Performance Optimization](#performance-optimization)
8. [Security Best Practices](#security-best-practices)

---

## Quick Start

### 5-Minute Integration

**Goal:** Display active sessions and allow users to revoke them.

```tsx
// pages/settings/sessions.tsx
import { trpc } from '@/lib/trpc';

const SessionsPage = () => {
  const { data, isLoading, refetch } = trpc.session.getSessions.useQuery();
  const revokeMutation = trpc.session.revokeSession.useMutation();
  const revokeAllMutation = trpc.session.revokeAllOtherSessions.useMutation();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Active Sessions</h1>
      <p className="text-gray-600 mb-6">
        You're logged in on {data?.data.totalCount} device(s)
      </p>
      
      <div className="space-y-4">
        {data?.data.sessions.map(session => (
          <div key={session.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <strong>{session.deviceName || 'Unknown Device'}</strong>
                  {session.isCurrent && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {session.ipAddress}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Last active: {new Date(session.lastActivityAt).toLocaleString()}
                </p>
              </div>
              
              {!session.isCurrent && (
                <button
                  onClick={async () => {
                    await revokeMutation.mutateAsync({ sessionId: session.id });
                    refetch();
                  }}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <button
        onClick={async () => {
          if (confirm('Logout from all other devices?')) {
            await revokeAllMutation.mutateAsync();
            refetch();
          }
        }}
        className="mt-6 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
      >
        Logout from All Other Devices
      </button>
    </div>
  );
};

export default SessionsPage;
```

**That's it!** This gives you a functional session management page.

---

## Implementation Checklist

### Phase 1: Basic Session Display (Essential)

- [ ] **Display active sessions page**
  - [ ] Show device name, IP, last activity
  - [ ] Mark current session with badge
  - [ ] Show total session count
  
- [ ] **Revoke session functionality**
  - [ ] "Logout" button per non-current session
  - [ ] Confirmation dialog before revoking
  - [ ] Refresh list after revocation
  - [ ] Show success toast
  
- [ ] **Revoke all other sessions**
  - [ ] Prominent button in settings
  - [ ] Confirmation dialog with warning
  - [ ] Handle success/error states

### Phase 2: Session Warnings (Important)

- [ ] **Approaching timeout warning**
  - [ ] Poll for warnings every 60 seconds
  - [ ] Display banner when < 1 hour remaining
  - [ ] "Stay Logged In" button to extend session
  - [ ] Auto-dismiss after user interaction
  
- [ ] **Session limit warning**
  - [ ] Show banner when at max sessions
  - [ ] Explain that oldest will be replaced
  - [ ] Link to session management page

### Phase 3: Activity Heartbeat (Recommended)

- [ ] **Implement activity tracking**
  - [ ] Track mouse, keyboard, click events
  - [ ] Send heartbeat every 5 minutes if active
  - [ ] Don't send if user idle
  - [ ] Handle failures silently (non-critical)

### Phase 4: 2FA Enforcement (Critical for Security)

- [ ] **Create 2FA challenge modal component**
  - [ ] Input for 6-digit code
  - [ ] Error messages for invalid codes
  - [ ] Loading states during verification
  - [ ] Auto-focus code input
  
- [ ] **Handle 2FA_REQUIRED errors**
  - [ ] Catch in password change flow
  - [ ] Catch in email change flow
  - [ ] Catch in security settings
  - [ ] Catch in account deletion
  
- [ ] **Implement grace period awareness**
  - [ ] Display "Recently verified" indicator
  - [ ] Show grace period expiry time
  - [ ] Auto-clear after expiry

### Phase 5: Step-Up Authentication (Admin Only)

- [ ] **Create step-up authentication page**
  - [ ] Password input field
  - [ ] Explanation of why re-auth needed
  - [ ] Handle token creation
  - [ ] Store token in sessionStorage
  
- [ ] **Handle STEP_UP_REQUIRED errors**
  - [ ] Redirect to step-up page with context
  - [ ] Return to original page after auth
  - [ ] Retry original action with token
  - [ ] Clear token after use

### Phase 6: Security Timeline (Nice to Have)

- [ ] **Display sensitive action logs**
  - [ ] Timeline view of recent actions
  - [ ] Filter by action type
  - [ ] Show success/failure status
  - [ ] Display IP and location
  - [ ] Pagination for large lists

### Phase 7: Advanced Features (Optional)

- [ ] **Device statistics**
  - [ ] Pie chart of device types
  - [ ] Bar chart of sessions over time
  - [ ] Geographic map of login locations
  
- [ ] **Security notifications**
  - [ ] Email on new device login
  - [ ] Push notifications for suspicious activity
  - [ ] In-app notification center
  
- [ ] **Trusted devices**
  - [ ] Mark devices as "trusted"
  - [ ] Skip some verifications on trusted devices
  - [ ] Manage trusted device list

---

## Common Patterns & Utilities

### Utility: Session Security Context

Create a React context for global session security state:

```typescript
// contexts/SessionSecurityContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { SessionWarning } from '@/types/session';

interface SessionSecurityContextValue {
  warnings: SessionWarning[];
  sessionCount: number;
  refreshSessions: () => void;
  dismissWarning: (type: SessionWarning['warningType']) => void;
}

const SessionSecurityContext = createContext<SessionSecurityContextValue | null>(null);

export const SessionSecurityProvider = ({ children }: { children: React.ReactNode }) => {
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  
  const { data: warningsData } = trpc.session.getSessionWarnings.useQuery(undefined, {
    refetchInterval: 60_000, // Poll every minute
    staleTime: 30_000,
  });
  
  const { data: sessionsData, refetch } = trpc.session.getSessions.useQuery(undefined, {
    staleTime: 30_000,
  });
  
  const warnings = warningsData?.data.warnings.filter(
    w => !dismissedWarnings.has(w.warningType)
  ) || [];
  
  const dismissWarning = (type: SessionWarning['warningType']) => {
    setDismissedWarnings(prev => new Set(prev).add(type));
  };
  
  return (
    <SessionSecurityContext.Provider
      value={{
        warnings,
        sessionCount: sessionsData?.data.totalCount || 0,
        refreshSessions: refetch,
        dismissWarning,
      }}
    >
      {children}
    </SessionSecurityContext.Provider>
  );
};

export const useSessionSecurity = () => {
  const context = useContext(SessionSecurityContext);
  if (!context) {
    throw new Error('useSessionSecurity must be used within SessionSecurityProvider');
  }
  return context;
};
```

### Utility: 2FA Challenge Hook

Reusable hook for handling 2FA challenges:

```typescript
// hooks/use2FAChallenge.ts
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { SensitiveActionType } from '@/types/session';

export const use2FAChallenge = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [actionType, setActionType] = useState<SensitiveActionType | null>(null);
  const [onSuccess, setOnSuccess] = useState<(() => void) | null>(null);
  
  const createChallengeMutation = trpc.auth.create2FAChallenge.useMutation();
  const verifyChallengeMutation = trpc.auth.verify2FAChallenge.useMutation();
  
  const show = (action: SensitiveActionType, callback: () => void) => {
    setActionType(action);
    setOnSuccess(() => callback);
    setIsOpen(true);
  };
  
  const verify = async (code: string) => {
    if (!actionType) return;
    
    try {
      const challenge = await createChallengeMutation.mutateAsync({ actionType });
      await verifyChallengeMutation.mutateAsync({
        challengeId: challenge.data.challengeId,
        code,
      });
      
      setIsOpen(false);
      onSuccess?.();
      
    } catch (error) {
      throw error; // Re-throw for component to handle
    }
  };
  
  const close = () => {
    setIsOpen(false);
    setActionType(null);
    setOnSuccess(null);
  };
  
  return {
    isOpen,
    actionType,
    show,
    verify,
    close,
    isLoading: createChallengeMutation.isLoading || verifyChallengeMutation.isLoading,
  };
};
```

### Utility: Activity Tracker

Automatic activity tracking:

```typescript
// hooks/useActivityTracker.ts
import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

export const useActivityTracker = (
  options: {
    interval?: number;     // Heartbeat interval (default: 5 minutes)
    idleThreshold?: number; // Idle threshold (default: 5 minutes)
    enabled?: boolean;      // Enable/disable tracking (default: true)
  } = {}
) => {
  const {
    interval = 5 * 60 * 1000,
    idleThreshold = 5 * 60 * 1000,
    enabled = true,
  } = options;
  
  const lastActivityRef = useRef(Date.now());
  const updateActivityMutation = trpc.session.updateActivity.useMutation();
  
  useEffect(() => {
    if (!enabled) return;
    
    const trackActivity = () => {
      lastActivityRef.current = Date.now();
    };
    
    // Track user interactions
    window.addEventListener('mousemove', trackActivity);
    window.addEventListener('keydown', trackActivity);
    window.addEventListener('click', trackActivity);
    window.addEventListener('scroll', trackActivity);
    
    // Send heartbeat periodically
    const heartbeat = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      
      // Only send if user was recently active
      if (timeSinceActivity < idleThreshold) {
        updateActivityMutation.mutate();
      }
    }, interval);
    
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('mousemove', trackActivity);
      window.removeEventListener('keydown', trackActivity);
      window.removeEventListener('click', trackActivity);
      window.removeEventListener('scroll', trackActivity);
    };
  }, [enabled, interval, idleThreshold]);
};
```

### Component: Session Warning Banner

Reusable warning banner:

```tsx
// components/SessionWarningBanner.tsx
import { useSessionSecurity } from '@/contexts/SessionSecurityContext';
import { trpc } from '@/lib/trpc';

export const SessionWarningBanner = () => {
  const { warnings, dismissWarning } = useSessionSecurity();
  const updateActivityMutation = trpc.session.updateActivity.useMutation();
  
  if (warnings.length === 0) return null;
  
  return (
    <div className="fixed top-0 inset-x-0 z-50">
      {warnings.map(warning => (
        <div
          key={warning.warningType}
          className={`p-4 ${
            warning.warningType === 'approaching_timeout'
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-blue-50 border-blue-200'
          } border-b`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {warning.warningType === 'approaching_timeout' ? '⏰' : 'ℹ️'}
              </span>
              <div>
                <p className="font-medium">{warning.message}</p>
                {warning.expiresAt && (
                  <p className="text-sm text-gray-600">
                    Expires at {new Date(warning.expiresAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              {warning.warningType === 'approaching_timeout' && (
                <button
                  onClick={async () => {
                    await updateActivityMutation.mutateAsync();
                    dismissWarning(warning.warningType);
                  }}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  Stay Logged In
                </button>
              )}
              
              <button
                onClick={() => dismissWarning(warning.warningType)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
```

### Component: 2FA Challenge Modal

Reusable 2FA verification modal:

```tsx
// components/TwoFactorModal.tsx
import { useState } from 'react';
import { use2FAChallenge } from '@/hooks/use2FAChallenge';

export const TwoFactorModal = () => {
  const { isOpen, actionType, verify, close, isLoading } = use2FAChallenge();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      await verify(code);
      setCode('');
    } catch (err: any) {
      if (err.data?.cause?.errorCode === 'INVALID_2FA_CODE') {
        setError('Invalid code. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Verify Your Identity</h2>
        <p className="text-gray-600 mb-6">
          Enter your 6-digit authentication code to continue.
        </p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full px-4 py-3 text-center text-2xl tracking-widest border rounded-lg mb-4"
            autoFocus
          />
          
          {error && (
            <p className="text-red-600 text-sm mb-4">{error}</p>
          )}
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

---

## UI/UX Recommendations

### Session Management Page

**Visual Hierarchy:**
1. **Header**: "Active Sessions" + count
2. **Current session** (highlighted, can't revoke)
3. **Other sessions** (sorted by last activity, newest first)
4. **Bulk action**: "Logout from all other devices" button

**Session Card Layout:**
```
┌──────────────────────────────────────────────────┐
│ [Icon] iPhone                     [Current] [✕]  │
│        192.168.1.100                              │
│        Last active: 2 minutes ago                │
└──────────────────────────────────────────────────┘
```

**Device Icons:**
- 📱 iPhone/Android Phone
- 💻 Mac/Windows PC
- 🖥️ Desktop Browser
- 📟 Tablet
- ❓ Unknown Device

### Warning Banners

**Approaching Timeout:**
- Color: Yellow/Amber
- Urgency: Medium
- Action: "Stay Logged In" button
- Auto-dismiss: After user clicks or becomes active

**Session Limit Reached:**
- Color: Blue/Info
- Urgency: Low
- Action: Link to session management
- Auto-dismiss: User dismisses manually

### 2FA Challenge Modal

**Design Principles:**
- Large, centered input for code
- Auto-focus input on open
- Auto-submit when 6 digits entered
- Show remaining attempts (if rate limited)
- Display QR code fallback link

**Error States:**
- Invalid code: Red border, keep modal open, allow retry
- Expired challenge: Show message, auto-close after 2s, retry flow
- Rate limited: Show countdown timer

### Loading States

**Fetching Sessions:**
- Skeleton cards (3-5 placeholder cards)
- Shimmer animation

**Revoking Session:**
- Disable button
- Show spinner in button
- Fade out card on success

**2FA Verification:**
- Disable submit button
- Show spinner in button
- Keep input enabled for cancellation

---

## Testing Scenarios

### Manual Testing Checklist

#### Session Management

**Test 1: View Active Sessions**
1. Login from multiple devices (phone, tablet, desktop)
2. Navigate to sessions page
3. Verify all devices shown with correct details
4. Verify current session marked as "Current"

**Test 2: Revoke Specific Session**
1. Login from Device A and Device B
2. On Device A, revoke Device B's session
3. On Device B, refresh page
4. Verify Device B is logged out

**Test 3: Session Limit Enforcement**
1. Login from 5 different devices
2. Attempt to login from 6th device
3. Verify oldest session is automatically revoked
4. Verify warning shown before 6th login

**Test 4: Inactivity Timeout**
1. Login and note the time
2. Don't interact for 24 hours (or configured timeout)
3. Attempt to use the app
4. Verify session expired, redirected to login

**Test 5: Activity Heartbeat**
1. Login and open browser dev tools (Network tab)
2. Interact with the app (move mouse, type, click)
3. Wait 5 minutes
4. Verify `updateActivity` request sent
5. Remain idle for 5 minutes
6. Verify no `updateActivity` request sent

#### 2FA Enforcement

**Test 6: Password Change with 2FA**
1. Enable 2FA for test user
2. Attempt to change password
3. Verify 2FA modal appears
4. Enter correct TOTP code
5. Verify password changed successfully
6. Immediately change password again (within 15 min)
7. Verify no 2FA required (grace period)

**Test 7: Invalid 2FA Code**
1. Attempt password change
2. Enter incorrect code
3. Verify error message shown
4. Verify modal stays open
5. Enter correct code
6. Verify success

**Test 8: Expired 2FA Challenge**
1. Attempt password change
2. Wait 6+ minutes without entering code
3. Enter code
4. Verify "Challenge expired" error
5. Verify flow restarts

#### Step-Up Authentication

**Test 9: Admin Role Change**
1. Login as admin
2. Attempt to change user role
3. Verify redirected to step-up page
4. Enter correct password
5. Verify redirected back
6. Verify role change completed

**Test 10: Expired Step-Up Token**
1. Start admin action requiring step-up
2. Complete step-up authentication
3. Wait 11+ minutes
4. Attempt to use stored token
5. Verify "Token expired" error

### Automated Testing Examples

```typescript
// __tests__/session-management.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionsPage } from '@/pages/settings/sessions';

describe('SessionsPage', () => {
  it('displays active sessions', async () => {
    render(<SessionsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    });
    
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText('Mac')).toBeInTheDocument();
  });
  
  it('revokes session when logout clicked', async () => {
    const user = userEvent.setup();
    render(<SessionsPage />);
    
    const logoutButton = screen.getByText('Logout');
    await user.click(logoutButton);
    
    await waitFor(() => {
      expect(screen.queryByText('iPhone')).not.toBeInTheDocument();
    });
  });
  
  it('shows 2FA modal for password change', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    
    const submitButton = screen.getByText('Change Password');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Verify Your Identity')).toBeInTheDocument();
    });
  });
});
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Session Not Updating Activity

**Symptoms:**
- User gets logged out despite being active
- `lastActivityAt` not updating

**Possible Causes:**
1. Activity tracker not mounted
2. Heartbeat requests failing silently
3. Session token missing from requests

**Solutions:**
```typescript
// Check if activity tracker is mounted
useEffect(() => {
  console.log('Activity tracker mounted');
}, []);

// Check heartbeat requests
const updateActivityMutation = trpc.session.updateActivity.useMutation({
  onError: (error) => {
    console.error('Activity update failed:', error);
  },
  onSuccess: () => {
    console.log('Activity updated successfully');
  },
});
```

#### Issue 2: 2FA Modal Doesn't Close After Success

**Symptoms:**
- User verifies 2FA code successfully
- Modal stays open
- Action completes but UI not updated

**Possible Causes:**
1. Modal state not cleared after success
2. Retry action not awaited
3. Error in retry logic

**Solutions:**
```typescript
const handle2FA = async (code: string) => {
  try {
    await verify(code);
    await retryAction(); // Make sure this is awaited
    setModalOpen(false); // Clear state AFTER success
  } catch (error) {
    // Handle error
  }
};
```

#### Issue 3: Step-Up Token "Already Used"

**Symptoms:**
- User completes step-up authentication
- Token marked as already used
- Action fails

**Possible Causes:**
1. Token used multiple times (not single-use aware)
2. Token not cleared from storage after use
3. React strict mode causing double render

**Solutions:**
```typescript
// Clear token immediately after use
const useStepUpToken = () => {
  const token = sessionStorage.getItem('stepUpToken');
  
  if (token) {
    sessionStorage.removeItem('stepUpToken'); // Clear immediately
    return token;
  }
  
  return null;
};

// Use ref to prevent double execution in strict mode
const hasUsedTokenRef = useRef(false);

useEffect(() => {
  if (hasUsedTokenRef.current) return;
  
  const token = sessionStorage.getItem('stepUpToken');
  if (token) {
    hasUsedTokenRef.current = true;
    sessionStorage.removeItem('stepUpToken');
    completeAction(token);
  }
}, []);
```

#### Issue 4: Session Limit Warning Never Disappears

**Symptoms:**
- User sees "Session limit reached" warning
- Warning persists after revoking sessions
- Warning shown incorrectly when under limit

**Possible Causes:**
1. Session count not refetching after revocation
2. Warning not dismissed after revocation
3. Cache not invalidated

**Solutions:**
```typescript
const revokeSession = async (sessionId: string) => {
  await revokeMutation.mutateAsync({ sessionId });
  
  // Invalidate queries to refetch fresh data
  queryClient.invalidateQueries(['session', 'getSessions']);
  queryClient.invalidateQueries(['session', 'getSessionWarnings']);
};
```

### Debug Checklist

When session security isn't working:

```typescript
// 1. Check if user is authenticated
console.log('Session:', session);

// 2. Check current session token
const token = document.cookie.split(';').find(c => c.includes('session-token'));
console.log('Session token:', token);

// 3. Check session warnings
const { data } = trpc.session.getSessionWarnings.useQuery();
console.log('Warnings:', data);

// 4. Check network requests
// Open Network tab, filter by "session", check:
// - Request headers (Cookie header present?)
// - Response status (401? 403?)
// - Response body (Error details?)

// 5. Check tRPC client configuration
// Is baseURL correct?
// Are credentials included?
```

---

## Performance Optimization

### Query Caching Strategy

```typescript
// Aggressive caching for session list (changes infrequently)
const { data } = trpc.session.getSessions.useQuery(undefined, {
  staleTime: 5 * 60 * 1000,   // 5 minutes
  cacheTime: 10 * 60 * 1000,  // 10 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
});

// Frequent polling for warnings (security-critical)
const { data: warnings } = trpc.session.getSessionWarnings.useQuery(undefined, {
  staleTime: 30 * 1000,       // 30 seconds
  cacheTime: 60 * 1000,       // 1 minute
  refetchInterval: 60 * 1000, // Poll every minute
  refetchOnWindowFocus: true,
});

// No caching for mutations
const revokeMutation = trpc.session.revokeSession.useMutation({
  onSuccess: () => {
    // Invalidate queries instead of refetching
    queryClient.invalidateQueries(['session']);
  },
});
```

### Debounce Activity Updates

```typescript
import { debounce } from 'lodash';

const updateActivity = trpc.session.updateActivity.useMutation();

const debouncedUpdate = debounce(
  () => updateActivity.mutate(),
  5000, // 5 seconds
  { leading: false, trailing: true }
);

// Call this on user interactions
window.addEventListener('mousemove', debouncedUpdate);
```

### Lazy Load Components

```typescript
// Only load session management when needed
const SessionsPage = lazy(() => import('@/pages/settings/sessions'));

// Only load 2FA modal when needed
const TwoFactorModal = lazy(() => import('@/components/TwoFactorModal'));
```

### Optimize Re-renders

```typescript
// Memoize session cards
const SessionCard = memo(({ session, onRevoke }: Props) => {
  return (
    // ...
  );
}, (prevProps, nextProps) => {
  // Only re-render if session data changed
  return prevProps.session.id === nextProps.session.id &&
         prevProps.session.lastActivityAt === nextProps.session.lastActivityAt;
});
```

---

## Security Best Practices

### ✅ Do's

1. **Always validate session before sensitive actions**
   ```typescript
   // Good
   const changePassword = async () => {
     // Session validation happens automatically
     await trpc.auth.changePassword.mutate({ ... });
   };
   ```

2. **Clear tokens immediately after use**
   ```typescript
   // Good
   const token = sessionStorage.getItem('stepUpToken');
   sessionStorage.removeItem('stepUpToken'); // Clear first
   await useToken(token);
   ```

3. **Use sessionStorage for temporary tokens, not localStorage**
   ```typescript
   // Good - cleared on tab close
   sessionStorage.setItem('stepUpToken', token);
   
   // Bad - persists indefinitely
   localStorage.setItem('stepUpToken', token);
   ```

4. **Show clear warnings before destructive actions**
   ```typescript
   // Good
   const confirmed = await confirm(
     'This will log you out from all devices. Continue?'
   );
   ```

5. **Handle errors gracefully**
   ```typescript
   // Good
   try {
     await revokeSession(id);
   } catch (error) {
     if (error.code === 'UNAUTHORIZED') {
       // Session expired, redirect to login
     } else {
       // Show user-friendly error
     }
   }
   ```

### ❌ Don'ts

1. **Don't display session tokens to users**
   ```typescript
   // Bad
   <div>Token: {session.sessionToken}</div>
   
   // Good
   <div>Device: {session.deviceName}</div>
   ```

2. **Don't store step-up tokens in URLs**
   ```typescript
   // Bad
   router.push(`/admin/action?token=${stepUpToken}`);
   
   // Good
   sessionStorage.setItem('stepUpToken', token);
   router.push('/admin/action');
   ```

3. **Don't skip 2FA checks**
   ```typescript
   // Bad
   const changePassword = async () => {
     // Skip 2FA modal, just change password
     await forceChangePassword();
   };
   
   // Good
   const changePassword = async () => {
     // Let backend enforce 2FA requirement
     await trpc.auth.changePassword.mutate();
   };
   ```

4. **Don't retry mutations automatically**
   ```typescript
   // Bad - could cause duplicate revocations
   const revokeMutation = trpc.session.revokeSession.useMutation({
     retry: 3,
   });
   
   // Good - let user retry manually
   const revokeMutation = trpc.session.revokeSession.useMutation({
     retry: false,
   });
   ```

5. **Don't cache sensitive data aggressively**
   ```typescript
   // Bad
   const { data } = trpc.session.getSessionWarnings.useQuery(undefined, {
     staleTime: Infinity, // Never refetch
   });
   
   // Good
   const { data } = trpc.session.getSessionWarnings.useQuery(undefined, {
     staleTime: 60_000, // 1 minute
   });
   ```

---

## Final Checklist

Before deploying to production:

- [ ] All session management endpoints integrated
- [ ] Session warnings displayed prominently
- [ ] Activity heartbeat implemented and tested
- [ ] 2FA challenge flow working for all sensitive actions
- [ ] Step-up authentication working for admin actions
- [ ] Error handling comprehensive and user-friendly
- [ ] Loading states shown during async operations
- [ ] Success messages shown after actions
- [ ] Confirmation dialogs before destructive actions
- [ ] Tokens cleared after use
- [ ] No session tokens displayed to users
- [ ] Queries cached appropriately
- [ ] Network requests optimized (debounced, minimal)
- [ ] Accessibility: Keyboard navigation, screen readers
- [ ] Mobile responsive design tested
- [ ] Cross-browser testing completed
- [ ] Security review passed

---

## 📚 Resources

**Backend Documentation:**
- Full implementation: `/docs/SESSION_SECURITY_IMPLEMENTATION_COMPLETE.md`
- Session Management (Part 1): `SESSION_SECURITY_PART_1_SESSION_MANAGEMENT.md`
- Step-Up Auth (Part 2): `SESSION_SECURITY_PART_2_STEP_UP_AUTH.md`

**Related Frontend Guides:**
- Authentication: `FRONTEND_INTEGRATION_AUTHENTICATION.md`
- 2FA Setup: `FRONTEND_INTEGRATION_2FA_SETUP_MANAGEMENT.md`
- Password Authentication: `FRONTEND_INTEGRATION_PASSWORD_AUTH.md`

**External Resources:**
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [NIST Authentication Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)

---

**Questions or Issues?**  
Contact the backend team or refer to the complete implementation documentation.

**Backend Deployed At:** `ops.yesgoddess.agency`  
**Frontend Repo:** `yesgoddess-web`
