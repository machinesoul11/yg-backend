# Frontend Integration Guide: Authenticator 2FA (Part 3)

**🌐 SHARED** - Used by both public-facing website and admin backend  
**Module:** Authenticator 2FA Setup & Management (Continued)  
**Last Updated:** October 19, 2025

---

## Table of Contents (Part 3)

9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [React Query Integration Examples](#react-query-integration-examples)
11. [Edge Cases & Error Scenarios](#edge-cases--error-scenarios)
12. [Testing Checklist](#testing-checklist)
13. [Accessibility Guidelines](#accessibility-guidelines)

---

## Frontend Implementation Checklist

### Phase 1: Core Setup Flow ✅

- [ ] **API Client Setup**
  - [ ] Create typed API client with proper error handling
  - [ ] Implement retry logic for network failures
  - [ ] Add request/response interceptors for auth headers
  - [ ] Configure timeout settings (30s recommended)

- [ ] **Type Definitions**
  - [ ] Copy all TypeScript interfaces from Part 1
  - [ ] Create Zod validation schemas
  - [ ] Export types for use across components
  - [ ] Add JSDoc comments for developer guidance

- [ ] **Enable TOTP Endpoint**
  - [ ] Implement API call to `POST /api/auth/2fa/totp/enable`
  - [ ] Handle success response with QR code data
  - [ ] Handle error cases (already enabled, unauthorized)
  - [ ] Add loading states

- [ ] **Verify TOTP Endpoint**
  - [ ] Implement API call to `POST /api/auth/2fa/totp/verify`
  - [ ] Handle success with backup codes display
  - [ ] Handle invalid code errors with retry
  - [ ] Implement rate limit detection and display

### Phase 2: UI Components ✅

- [ ] **QR Code Display Page**
  - [ ] Display QR code image from base64 data URL
  - [ ] Show manual entry key with copy button
  - [ ] List recommended authenticator apps with download links
  - [ ] Add "Next" button to proceed to verification
  - [ ] Implement auto-clear of QR code data after timeout

- [ ] **Code Verification Form**
  - [ ] Create 6-digit OTP input component with:
    - [ ] Auto-focus on first input
    - [ ] Auto-advance to next input
    - [ ] Paste support for full code
    - [ ] Backspace to previous input
    - [ ] Numeric keyboard on mobile (inputMode="numeric")
  - [ ] Display real-time validation errors
  - [ ] Show remaining attempts/rate limit warnings
  - [ ] Add "Back" button to re-display QR code
  - [ ] Disable submit during API call

- [ ] **Backup Codes Display**
  - [ ] Display all 10 backup codes in grid layout
  - [ ] Add prominent warning banner about saving codes
  - [ ] Implement download as .txt file
  - [ ] Add copy-all-to-clipboard functionality
  - [ ] Add print functionality with print-specific styles
  - [ ] Require user acknowledgment before proceeding:
    - [ ] "I have saved these codes securely"
    - [ ] "I understand they are one-time use"
  - [ ] Clear codes from memory after user leaves page

- [ ] **Progress Indicator**
  - [ ] Show multi-step progress (Step 1 of 3, etc.)
  - [ ] Highlight current step
  - [ ] Show completion status for completed steps

### Phase 3: Management Features ✅

- [ ] **Settings Integration**
  - [ ] Add 2FA section to user settings page
  - [ ] Display current 2FA status (enabled/disabled)
  - [ ] Show "Enable 2FA" button if disabled
  - [ ] Show management options if enabled:
    - [ ] "Regenerate Backup Codes" button
    - [ ] "Disable 2FA" button

- [ ] **Disable TOTP Dialog**
  - [ ] Create modal/dialog component
  - [ ] Add security warning about disabling 2FA
  - [ ] Require password input
  - [ ] Optional TOTP code input (recommended)
  - [ ] Implement confirmation step
  - [ ] Handle API call to `POST /api/auth/2fa/totp/disable`
  - [ ] Show success/error messages
  - [ ] Update user state after successful disable

- [ ] **Regenerate Backup Codes Dialog**
  - [ ] Create modal/dialog component
  - [ ] Require password input for security
  - [ ] Explain that old codes will be invalidated
  - [ ] Handle API call to `POST /api/auth/2fa/totp/backup-codes/regenerate`
  - [ ] Display new backup codes with same security measures
  - [ ] Require acknowledgment before closing

### Phase 4: Error Handling & UX ✅

- [ ] **Error Display**
  - [ ] Create error alert components
  - [ ] Map API error codes to user-friendly messages
  - [ ] Show field-specific validation errors
  - [ ] Display rate limit warnings prominently
  - [ ] Add error recovery actions (retry, contact support)

- [ ] **Loading States**
  - [ ] Add loading spinners during API calls
  - [ ] Disable buttons during loading
  - [ ] Show skeleton screens for async data
  - [ ] Prevent duplicate submissions

- [ ] **Success Feedback**
  - [ ] Show success messages after setup completion
  - [ ] Display toast notifications for actions
  - [ ] Send user to appropriate next page
  - [ ] Update navigation/UI to reflect 2FA status

- [ ] **Empty States**
  - [ ] Design empty state for 2FA not setup
  - [ ] Add call-to-action to enable 2FA
  - [ ] Explain benefits of 2FA

### Phase 5: Security & Polish ✅

- [ ] **Security Measures**
  - [ ] Implement client-side rate limiting (2s between attempts)
  - [ ] Clear sensitive data from memory after use
  - [ ] Don't persist QR codes or backup codes in storage
  - [ ] Use secure session token storage
  - [ ] Add CSRF protection if needed

- [ ] **Accessibility**
  - [ ] Add ARIA labels to all interactive elements
  - [ ] Ensure keyboard navigation works properly
  - [ ] Test with screen readers
  - [ ] Use semantic HTML elements
  - [ ] Ensure sufficient color contrast
  - [ ] Add focus indicators

- [ ] **Responsive Design**
  - [ ] Test on mobile devices (iOS/Android)
  - [ ] Test on tablets
  - [ ] Test on desktop (various screen sizes)
  - [ ] Ensure QR code is scannable on all devices
  - [ ] Optimize touch targets for mobile (min 44x44px)

- [ ] **Performance**
  - [ ] Lazy load QR code generation library
  - [ ] Optimize image assets
  - [ ] Minimize bundle size
  - [ ] Test loading times on slow connections

### Phase 6: Integration & Testing ✅

- [ ] **Authentication Flow Integration**
  - [ ] Update login flow to check 2FA status
  - [ ] Redirect to 2FA challenge when needed
  - [ ] Handle "trust this device" functionality
  - [ ] Test complete login flow with 2FA enabled

- [ ] **Email Notifications**
  - [ ] Verify email sent when 2FA enabled
  - [ ] Verify email sent when 2FA disabled
  - [ ] Verify email sent when backup codes regenerated
  - [ ] Test email templates render correctly

- [ ] **Testing**
  - [ ] Unit tests for API client functions
  - [ ] Unit tests for validation functions
  - [ ] Component tests for all UI components
  - [ ] Integration tests for complete flows
  - [ ] E2E tests for critical user paths
  - [ ] Test error scenarios
  - [ ] Test with real authenticator apps

---

## React Query Integration Examples

### API Client Setup

```typescript
// lib/api/totp.ts
import { ApiResponse, TotpEnableResponse, TotpVerifyResponse, TotpDisableResponse, BackupCodesRegenerateResponse } from '@/types/totp';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';

class TotpApiClient {
  private async fetchWithAuth<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getSessionToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });
    
    const data: ApiResponse<T> = await response.json();
    
    if (!response.ok || !data.success) {
      throw new ApiError(data.error?.code || 'UNKNOWN_ERROR', data.error?.message || 'An error occurred', response.status);
    }
    
    return data.data!;
  }
  
  private async getSessionToken(): Promise<string> {
    // Get token from your auth provider (NextAuth, etc.)
    const session = await getSession();
    if (!session?.accessToken) {
      throw new ApiError('UNAUTHORIZED', 'Not authenticated', 401);
    }
    return session.accessToken;
  }
  
  async enableTotp(): Promise<TotpEnableResponse> {
    return this.fetchWithAuth<TotpEnableResponse>('/api/auth/2fa/totp/enable', {
      method: 'POST',
    });
  }
  
  async verifyTotp(code: string): Promise<TotpVerifyResponse> {
    return this.fetchWithAuth<TotpVerifyResponse>('/api/auth/2fa/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }
  
  async disableTotp(password: string, code?: string): Promise<TotpDisableResponse> {
    return this.fetchWithAuth<TotpDisableResponse>('/api/auth/2fa/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  }
  
  async regenerateBackupCodes(password: string): Promise<BackupCodesRegenerateResponse> {
    return this.fetchWithAuth<BackupCodesRegenerateResponse>('/api/auth/2fa/totp/backup-codes/regenerate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }
}

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const totpApi = new TotpApiClient();
export { ApiError };
```

### React Query Hooks

```typescript
// hooks/useTotp.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { totpApi, ApiError } from '@/lib/api/totp';
import { toast } from '@/components/ui/toast';

/**
 * Hook to enable TOTP (initiate setup)
 */
export function useEnableTotp() {
  return useMutation({
    mutationFn: () => totpApi.enableTotp(),
    onSuccess: (data) => {
      console.log('TOTP setup initiated', data);
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code));
    },
  });
}

/**
 * Hook to verify TOTP code and complete setup
 */
export function useVerifyTotp() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (code: string) => totpApi.verifyTotp(code),
    onSuccess: (data) => {
      // Invalidate user query to refresh 2FA status
      queryClient.invalidateQueries({ queryKey: ['user'] });
      
      toast.success('Two-factor authentication enabled successfully!');
    },
    onError: (error: ApiError) => {
      if (error.code === 'TOTP_INVALID') {
        toast.error('Invalid code. Please check your authenticator app and try again.');
      } else {
        toast.error(getErrorMessage(error.code));
      }
    },
  });
}

/**
 * Hook to disable TOTP
 */
export function useDisableTotp() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ password, code }: { password: string; code?: string }) => 
      totpApi.disableTotp(password, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Two-factor authentication disabled');
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code));
    },
  });
}

/**
 * Hook to regenerate backup codes
 */
export function useRegenerateBackupCodes() {
  return useMutation({
    mutationFn: (password: string) => totpApi.regenerateBackupCodes(password),
    onSuccess: () => {
      toast.success('New backup codes generated');
    },
    onError: (error: ApiError) => {
      toast.error(getErrorMessage(error.code));
    },
  });
}

function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    UNAUTHORIZED: 'Your session has expired. Please log in again.',
    TOTP_ALREADY_ENABLED: 'Two-factor authentication is already enabled.',
    TOTP_NOT_ENABLED: 'Two-factor authentication is not enabled.',
    TOTP_INVALID: 'Invalid authentication code.',
    INVALID_CURRENT_PASSWORD: 'Incorrect password.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again later.',
  };
  
  return messages[code] || 'An unexpected error occurred.';
}
```

### Complete Setup Flow Component

```typescript
// components/2fa/TotpSetupFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEnableTotp, useVerifyTotp } from '@/hooks/useTotp';
import { QRCodeDisplay } from './QRCodeDisplay';
import { CodeVerification } from './CodeVerification';
import { BackupCodesDisplay } from './BackupCodesDisplay';

type SetupStep = 'qr' | 'verify' | 'backup' | 'complete';

export function TotpSetupFlow() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<SetupStep>('qr');
  const [qrData, setQrData] = useState<any>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  
  const enableMutation = useEnableTotp();
  const verifyMutation = useVerifyTotp();
  
  // Step 1: Initialize and show QR code
  const handleStart = async () => {
    try {
      const data = await enableMutation.mutateAsync();
      setQrData(data);
      setCurrentStep('qr');
    } catch (error) {
      console.error('Failed to start setup:', error);
    }
  };
  
  // Step 2: Verify TOTP code
  const handleVerify = async (code: string) => {
    try {
      const data = await verifyMutation.mutateAsync(code);
      setBackupCodes(data.backupCodes);
      setCurrentStep('backup');
    } catch (error) {
      // Error handled by mutation onError
      throw error;
    }
  };
  
  // Step 3: Complete setup
  const handleComplete = () => {
    setCurrentStep('complete');
    // Redirect to settings or dashboard
    setTimeout(() => {
      router.push('/settings/security');
    }, 2000);
  };
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['Scan QR Code', 'Verify Code', 'Save Backup Codes'].map((label, idx) => {
            const stepNumber = idx + 1;
            const isActive = 
              (currentStep === 'qr' && stepNumber === 1) ||
              (currentStep === 'verify' && stepNumber === 2) ||
              (currentStep === 'backup' && stepNumber === 3);
            const isComplete = 
              (currentStep === 'verify' && stepNumber === 1) ||
              (currentStep === 'backup' && stepNumber <= 2) ||
              (currentStep === 'complete' && stepNumber <= 3);
            
            return (
              <div key={label} className="flex-1 flex flex-col items-center">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center mb-2
                  ${isActive ? 'bg-blue-600 text-white' : ''}
                  ${isComplete ? 'bg-green-600 text-white' : ''}
                  ${!isActive && !isComplete ? 'bg-gray-200 text-gray-600' : ''}
                `}>
                  {isComplete ? '✓' : stepNumber}
                </div>
                <span className="text-sm text-gray-600">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Step Content */}
      {!qrData && (
        <div className="text-center">
          <button
            onClick={handleStart}
            disabled={enableMutation.isPending}
            className="btn-primary"
          >
            {enableMutation.isPending ? 'Loading...' : 'Start Setup'}
          </button>
        </div>
      )}
      
      {currentStep === 'qr' && qrData && (
        <QRCodeDisplay
          qrCodeDataUrl={qrData.qrCodeDataUrl}
          manualEntryKey={qrData.manualEntryKey}
          authenticatorApps={qrData.authenticatorApps}
          onNext={() => setCurrentStep('verify')}
        />
      )}
      
      {currentStep === 'verify' && (
        <CodeVerification
          onVerify={handleVerify}
          onBack={() => setCurrentStep('qr')}
          isLoading={verifyMutation.isPending}
          error={verifyMutation.error?.message}
        />
      )}
      
      {currentStep === 'backup' && (
        <BackupCodesDisplay
          codes={backupCodes}
          onComplete={handleComplete}
        />
      )}
      
      {currentStep === 'complete' && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
          <p className="text-gray-600">
            Two-factor authentication has been enabled for your account.
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Edge Cases & Error Scenarios

### 1. Network Failures

```typescript
/**
 * Handle network timeouts and connection issues
 */
export async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout. Please check your connection and try again.');
    }
    
    throw new Error('Network error. Please check your connection.');
  }
}
```

### 2. Time Sync Issues

```typescript
/**
 * Detect and warn about time sync issues
 * TOTP codes are time-based, so device time must be accurate
 */
export function checkTimeSyncWarning(): { showWarning: boolean; message?: string } {
  // Check if multiple consecutive codes have failed
  const failureCount = getRecentFailureCount();
  
  if (failureCount >= 3) {
    return {
      showWarning: true,
      message: 'If codes keep failing, check that your device time is set to automatic. TOTP codes are time-sensitive.'
    };
  }
  
  return { showWarning: false };
}
```

### 3. QR Code Scanning Issues

```typescript
/**
 * Handle QR code scanning problems
 */
export function QRCodeTroubleshooting() {
  return (
    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 className="font-semibold mb-2">Having trouble scanning?</h4>
      <ul className="text-sm space-y-2 text-blue-900">
        <li>• Increase your screen brightness</li>
        <li>• Hold your phone steady about 6 inches from the screen</li>
        <li>• Try the manual entry method instead</li>
        <li>• Ensure your camera has permission to scan QR codes</li>
        <li>• Make sure the QR code is fully visible</li>
      </ul>
    </div>
  );
}
```

### 4. Backup Code Usage

```typescript
/**
 * Handle backup code display when running low
 */
export function BackupCodeWarning({ remainingCodes }: { remainingCodes: number }) {
  if (remainingCodes > 3) return null;
  
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Low on Backup Codes</AlertTitle>
      <AlertDescription>
        You only have {remainingCodes} backup code{remainingCodes === 1 ? '' : 's'} remaining. 
        <Link href="/settings/2fa/regenerate-codes" className="underline ml-1">
          Generate new codes
        </Link>
      </AlertDescription>
    </Alert>
  );
}
```

### 5. Session Expiration During Setup

```typescript
/**
 * Handle session expiration mid-setup
 */
export function useSetupWithSessionCheck() {
  const { data: session } = useSession();
  const router = useRouter();
  
  useEffect(() => {
    if (!session) {
      // Session expired during setup
      toast.error('Your session expired. Please log in and try again.');
      router.push('/login?callbackUrl=/settings/2fa/setup');
    }
  }, [session, router]);
}
```

### 6. Already Enabled 2FA

```typescript
/**
 * Redirect if 2FA is already enabled
 */
export function TotpSetupGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useUser();
  const router = useRouter();
  
  useEffect(() => {
    if (!isLoading && user?.twoFactorEnabled) {
      toast.info('Two-factor authentication is already enabled');
      router.push('/settings/security');
    }
  }, [user, isLoading, router]);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (user?.twoFactorEnabled) {
    return null;
  }
  
  return <>{children}</>;
}
```

### 7. Concurrent Setup Attempts

```typescript
/**
 * Prevent multiple concurrent setup processes
 */
export function useSingleSetupAttempt() {
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  
  const startSetup = useCallback(() => {
    if (isSetupInProgress) {
      toast.warning('A setup process is already in progress');
      return false;
    }
    setIsSetupInProgress(true);
    return true;
  }, [isSetupInProgress]);
  
  const completeSetup = useCallback(() => {
    setIsSetupInProgress(false);
  }, []);
  
  return { startSetup, completeSetup, isSetupInProgress };
}
```

---

Continue to **[Part 4: Testing & Accessibility](./FRONTEND_INTEGRATION_AUTHENTICATOR_2FA_PART4.md)** (if needed)

---

## Quick Reference: API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/2fa/totp/enable` | POST | ✅ Required | Generate QR code, start setup |
| `/api/auth/2fa/totp/verify` | POST | ✅ Required | Verify code, complete setup |
| `/api/auth/2fa/totp/disable` | POST | ✅ Required | Disable 2FA with password |
| `/api/auth/2fa/totp/backup-codes/regenerate` | POST | ✅ Required | Generate new backup codes |

## Quick Reference: Common Error Codes

| Code | Status | User Message |
|------|--------|--------------|
| `UNAUTHORIZED` | 401 | Please log in to continue |
| `TOTP_ALREADY_ENABLED` | 400 | 2FA is already enabled |
| `TOTP_NOT_ENABLED` | 400 | 2FA is not enabled |
| `TOTP_INVALID` | 401 | Invalid code. Try again |
| `INVALID_CURRENT_PASSWORD` | 401 | Incorrect password |
| `VALIDATION_ERROR` | 400 | Check your input |

---

**Need Help?** Contact the backend team or refer to the complete API documentation at `/docs/AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md`
