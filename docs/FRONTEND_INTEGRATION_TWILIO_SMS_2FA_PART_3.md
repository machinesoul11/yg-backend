# Frontend Integration Guide: Twilio SMS 2FA - Part 3
## Implementation Guide, API Client, UX Patterns, and Testing

🔒 **Classification: HYBRID** - Implementation details for both user-facing and admin features

---

## Table of Contents
- [API Client Implementation](#api-client-implementation)
- [React Query Integration](#react-query-integration)
- [Complete User Flows](#complete-user-flows)
- [UX Considerations](#ux-considerations)
- [Real-time Updates](#real-time-updates)
- [Admin Cost Monitoring](#admin-cost-monitoring)
- [Frontend Implementation Checklist](#frontend-implementation-checklist)
- [Testing Guide](#testing-guide)

---

## API Client Implementation

### Base API Client

```typescript
// lib/api/sms-2fa-client.ts

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';

class Sms2FAClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Add auth token interceptor
    this.client.interceptors.request.use((config) => {
      const token = this.getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    
    // Add error interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('SMS 2FA API Error:', error.response?.data || error);
        return Promise.reject(error);
      }
    );
  }
  
  private getAuthToken(): string | null {
    // Get from NextAuth session, localStorage, or cookie
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('jwt_token'); // Adjust based on your auth system
  }
  
  /**
   * Setup SMS 2FA - Send verification code
   */
  async setupSms(phoneNumber: string): Promise<SetupSmsResponse> {
    const { data } = await this.client.post('/api/auth/2fa/setup-sms', {
      phoneNumber,
    });
    return data;
  }
  
  /**
   * Verify SMS code to complete setup
   */
  async verifySetup(code: string, method: 'SMS' = 'SMS'): Promise<any> {
    const { data } = await this.client.post('/api/auth/2fa/verify-setup', {
      method,
      code,
    });
    return data;
  }
  
  /**
   * Verify SMS during login challenge
   */
  async verifySmsChallenge(
    challengeToken: string,
    code: string
  ): Promise<VerifySmsResponse> {
    const { data } = await this.client.post('/api/auth/2fa/verify-sms', {
      challengeToken,
      code,
    });
    return data;
  }
  
  /**
   * Resend SMS code
   */
  async resendSms(challengeToken: string): Promise<ResendSmsResponse> {
    const { data } = await this.client.post('/api/auth/2fa/resend-sms', {
      challengeToken,
    });
    return data;
  }
  
  /**
   * Set preferred 2FA method
   */
  async setPreferredMethod(
    method: 'SMS' | 'AUTHENTICATOR',
    verificationCode: string
  ): Promise<any> {
    const { data } = await this.client.post('/api/auth/2fa/set-preferred-method', {
      method,
      verificationCode,
    });
    return data;
  }
}

export const sms2FAClient = new Sms2FAClient();
```

### tRPC Client Setup

```typescript
// lib/trpc/client.ts

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/lib/api/root';

export const trpc = createTRPCReact<AppRouter>();

// hooks/useTrpcProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`,
          headers() {
            const token = localStorage.getItem('jwt_token');
            return {
              Authorization: token ? `Bearer ${token}` : '',
            };
          },
        }),
      ],
    })
  );
  
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

// Usage in components
const { data: smsStatus } = trpc.sms2FA.getStatus.useQuery();
const disableMutation = trpc.sms2FA.disable.useMutation();
```

---

## React Query Integration

### Custom Hooks

```typescript
// hooks/useSms2FA.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sms2FAClient } from '@/lib/api/sms-2fa-client';
import { showSmsError, showSmsSuccess } from '@/lib/utils/error-handling';

/**
 * Setup SMS 2FA
 */
export function useSetupSms() {
  return useMutation({
    mutationFn: (phoneNumber: string) => sms2FAClient.setupSms(phoneNumber),
    onSuccess: (data) => {
      showSmsSuccess(data.data.message);
    },
    onError: (error) => {
      showSmsError(error);
    },
  });
}

/**
 * Verify SMS code
 */
export function useVerifySmsSetup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (code: string) => sms2FAClient.verifySetup(code),
    onSuccess: (data) => {
      showSmsSuccess('SMS 2FA enabled successfully!');
      // Invalidate user data to refresh 2FA status
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['sms-status'] });
    },
    onError: (error) => {
      showSmsError(error);
    },
  });
}

/**
 * Verify SMS challenge during login
 */
export function useVerifySmsChallenge() {
  return useMutation({
    mutationFn: ({ challengeToken, code }: { challengeToken: string; code: string }) =>
      sms2FAClient.verifySmsChallenge(challengeToken, code),
    onError: (error) => {
      showSmsError(error);
    },
  });
}

/**
 * Resend SMS code
 */
export function useResendSms() {
  return useMutation({
    mutationFn: (challengeToken: string) => sms2FAClient.resendSms(challengeToken),
    onSuccess: () => {
      showSmsSuccess('Code sent!');
    },
    onError: (error) => {
      showSmsError(error);
    },
  });
}

/**
 * Get SMS status (tRPC)
 */
export function useSmsStatus() {
  return trpc.sms2FA.getStatus.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30s to update rate limits
  });
}

/**
 * Disable SMS 2FA (tRPC)
 */
export function useDisableSms() {
  const queryClient = useQueryClient();
  
  return trpc.sms2FA.disable.useMutation({
    onSuccess: () => {
      showSmsSuccess('SMS 2FA disabled');
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['sms-status'] });
    },
    onError: (error) => {
      showSmsError(error);
    },
  });
}

/**
 * Update phone number (tRPC)
 */
export function useUpdatePhoneNumber() {
  return trpc.sms2FA.updatePhoneNumber.useMutation({
    onSuccess: (data) => {
      showSmsSuccess(data.message);
    },
    onError: (error) => {
      showSmsError(error);
    },
  });
}
```

---

## Complete User Flows

### Flow 1: Enable SMS 2FA (First-Time Setup)

```typescript
// components/Sms2FASetup.tsx

import { useState } from 'react';
import { useSetupSms, useVerifySmsSetup } from '@/hooks/useSms2FA';

export function Sms2FASetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [codeSentAt, setCodeSentAt] = useState<Date | null>(null);
  
  const setupMutation = useSetupSms();
  const verifyMutation = useVerifySmsSetup();
  
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    // Send code
    const result = await setupMutation.mutateAsync(phoneNumber);
    if (result.success) {
      setCodeSentAt(new Date());
      setStep('verify');
    }
  };
  
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate code
    const validation = validateVerificationCode(code);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    // Verify code
    const result = await verifyMutation.mutateAsync(code);
    if (result.success) {
      onComplete();
    }
  };
  
  if (step === 'phone') {
    return (
      <form onSubmit={handleSendCode} className="space-y-4">
        <h2 className="text-xl font-bold">Enable SMS 2FA</h2>
        
        <div>
          <label className="block text-sm font-medium mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(formatToE164(e.target.value))}
            placeholder="+1 (555) 123-4567"
            className="w-full px-3 py-2 border rounded"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter your phone number in international format
          </p>
        </div>
        
        <button
          type="submit"
          disabled={setupMutation.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {setupMutation.isPending ? 'Sending...' : 'Send verification code'}
        </button>
      </form>
    );
  }
  
  return (
    <form onSubmit={handleVerifyCode} className="space-y-4">
      <h2 className="text-xl font-bold">Verify your phone</h2>
      
      <p className="text-sm text-gray-600">
        We sent a 6-digit code to {formatPhoneDisplay(phoneNumber)}
      </p>
      
      {codeSentAt && <CodeExpiryTimer codeSentAt={codeSentAt} />}
      
      <div>
        <label className="block text-sm font-medium mb-1">
          Verification Code
        </label>
        <CodeInput onComplete={setCode} />
      </div>
      
      <button
        type="submit"
        disabled={verifyMutation.isPending || code.length !== 6}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
      </button>
      
      <button
        type="button"
        onClick={() => setStep('phone')}
        className="w-full text-gray-600 hover:text-gray-800"
      >
        Change phone number
      </button>
    </form>
  );
}
```

### Flow 2: SMS Challenge During Login

```typescript
// components/SmsChallengeForm.tsx

import { useState, useEffect } from 'react';
import { useVerifySmsChallenge, useResendSms } from '@/hooks/useSms2FA';

export function SmsChallengeForm({
  challengeToken,
  maskedPhone,
  onSuccess,
}: {
  challengeToken: string;
  maskedPhone: string;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [codeSentAt, setCodeSentAt] = useState(new Date());
  const [resendCount, setResendCount] = useState(0);
  
  const verifyMutation = useVerifySmsChallenge();
  const resendMutation = useResendSms();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await verifyMutation.mutateAsync({ challengeToken, code });
      if (result.success) {
        onSuccess();
      }
    } catch (error: any) {
      // Update attempts from error response
      if (error.response?.data?.error?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(error.response.data.error.attemptsRemaining);
      }
      
      // Clear code on failure
      setCode('');
    }
  };
  
  const handleResend = async () => {
    const result = await resendMutation.mutateAsync(challengeToken);
    if (result.success) {
      setCodeSentAt(new Date());
      setResendCount((prev) => prev + 1);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Two-Factor Authentication</h2>
        <p className="text-gray-600">
          Enter the verification code sent to {maskedPhone}
        </p>
      </div>
      
      <CodeExpiryTimer codeSentAt={codeSentAt} />
      
      <CodeInput onComplete={setCode} />
      
      <AttemptsDisplay attemptsRemaining={attemptsRemaining} />
      
      <button
        type="submit"
        disabled={verifyMutation.isPending || code.length !== 6 || attemptsRemaining === 0}
        className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
      >
        {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
      </button>
      
      <div className="text-center">
        <ResendButton
          onResend={handleResend}
          lastSentAt={codeSentAt}
          attemptNumber={resendCount}
        />
      </div>
      
      <div className="text-center">
        <button
          type="button"
          onClick={() => window.location.href = '/login'}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          Back to login
        </button>
      </div>
    </form>
  );
}
```

### Flow 3: Manage SMS 2FA Settings

```typescript
// components/Sms2FASettings.tsx

import { useState } from 'react';
import { useSmsStatus, useDisableSms, useUpdatePhoneNumber } from '@/hooks/useSms2FA';

export function Sms2FASettings() {
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showUpdatePhoneModal, setShowUpdatePhoneModal] = useState(false);
  
  const { data: status, isLoading } = useSmsStatus();
  const disableMutation = useDisableSms();
  
  if (isLoading) return <div>Loading...</div>;
  
  if (!status?.enabled) {
    return (
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">SMS Two-Factor Authentication</h3>
        <p className="text-gray-600 mb-4">
          Secure your account with SMS verification codes
        </p>
        <Sms2FASetup onComplete={() => window.location.reload()} />
      </div>
    );
  }
  
  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">SMS Two-Factor Authentication</h3>
          <p className="text-sm text-gray-600">
            Phone: {formatPhoneDisplay(status.phoneNumber || '')}
          </p>
          {status.preferredMethod === 'SMS' && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
              Preferred method
            </span>
          )}
        </div>
        
        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
          Enabled
        </span>
      </div>
      
      {status.rateLimit && (
        <RateLimitIndicator rateLimit={status.rateLimit} />
      )}
      
      <div className="flex gap-2">
        <button
          onClick={() => setShowUpdatePhoneModal(true)}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          Update phone number
        </button>
        
        <button
          onClick={() => setShowDisableModal(true)}
          className="px-4 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50"
        >
          Disable SMS 2FA
        </button>
      </div>
      
      {showDisableModal && (
        <DisableSmsModal
          onClose={() => setShowDisableModal(false)}
          onConfirm={(password) => {
            disableMutation.mutate({ password });
            setShowDisableModal(false);
          }}
        />
      )}
      
      {showUpdatePhoneModal && (
        <UpdatePhoneModal
          currentPhone={status.phoneNumber || ''}
          onClose={() => setShowUpdatePhoneModal(false)}
        />
      )}
    </div>
  );
}

// Disable confirmation modal
function DisableSmsModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-2">Disable SMS 2FA</h3>
        <p className="text-gray-600 mb-4">
          Enter your password to confirm. This will reduce your account security.
        </p>
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 border rounded mb-4"
        />
        
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={!password}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
          >
            Disable
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## UX Considerations

### Progressive Disclosure

```typescript
/**
 * Show 2FA options progressively based on user's current state
 */
function TwoFactorAuthOptions({ user }: { user: User2FAFields }) {
  const state = get2FAState(user);
  
  // User has no 2FA - show both options
  if (state === 'DISABLED') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Enable Two-Factor Authentication</h3>
        <p className="text-gray-600">Choose a method to secure your account:</p>
        
        <div className="grid grid-cols-2 gap-4">
          <MethodCard
            icon="📱"
            title="SMS"
            description="Receive codes via text message"
            recommended={false}
            onClick={() => setShowSmsSetup(true)}
          />
          <MethodCard
            icon="🔐"
            title="Authenticator App"
            description="Use Google Authenticator or similar"
            recommended={true}
            onClick={() => setShowTotpSetup(true)}
          />
        </div>
      </div>
    );
  }
  
  // User has one method - show option to add second
  if (state === 'SMS_ONLY') {
    return (
      <div className="space-y-4">
        <Sms2FASettings />
        
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">Add Additional Security</h4>
          <p className="text-sm text-gray-600 mb-3">
            Enable authenticator app as a backup method
          </p>
          <button
            onClick={() => setShowTotpSetup(true)}
            className="px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
          >
            Add Authenticator
          </button>
        </div>
      </div>
    );
  }
  
  // User has both methods - show preference selector
  return (
    <div className="space-y-4">
      <Sms2FASettings />
      <TotpSettings />
      <PreferredMethodSelector currentMethod={user.preferred_2fa_method} />
    </div>
  );
}
```

### Loading States

```typescript
/**
 * Loading skeleton for SMS status
 */
function SmsStatusSkeleton() {
  return (
    <div className="border rounded-lg p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

/**
 * Button loading state
 */
function LoadingButton({
  isLoading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading: boolean }) {
  return (
    <button {...props} disabled={isLoading || props.disabled}>
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
```

### Empty States

```typescript
/**
 * No SMS 2FA configured
 */
function NoSms2FAEmptyState({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="text-center py-12 border-2 border-dashed rounded-lg">
      <div className="text-6xl mb-4">📱</div>
      <h3 className="text-lg font-semibold mb-2">SMS 2FA Not Enabled</h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Add an extra layer of security by enabling SMS two-factor authentication.
        You'll receive verification codes via text message.
      </p>
      <button
        onClick={onSetup}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Enable SMS 2FA
      </button>
    </div>
  );
}
```

### Accessibility

```typescript
/**
 * Accessible code input with screen reader support
 */
function AccessibleCodeInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  
  return (
    <div
      role="group"
      aria-label="6-digit verification code input"
      className="flex gap-2"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          aria-label={`Digit ${i + 1}`}
          className="w-12 h-12 text-center text-2xl border rounded focus:ring-2 focus:ring-blue-500"
        />
      ))}
    </div>
  );
}

/**
 * Announce status changes to screen readers
 */
function LiveRegionAnnouncer({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
```

---

## Real-time Updates

### Webhook Integration (Optional)

If implementing real-time delivery status updates:

```typescript
// hooks/useSmsDeliveryStatus.ts

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSmsDeliveryStatus(messageId: string | null) {
  const [status, setStatus] = useState<SmsDeliveryStatus | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  useEffect(() => {
    if (!messageId) return;
    
    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || '', {
      auth: {
        token: localStorage.getItem('jwt_token'),
      },
    });
    
    newSocket.on('sms:status', (data: { messageId: string; status: SmsDeliveryStatus }) => {
      if (data.messageId === messageId) {
        setStatus(data.status);
      }
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, [messageId]);
  
  return status;
}

// Usage in component
function SmsDeliveryIndicator({ messageId }: { messageId: string }) {
  const status = useSmsDeliveryStatus(messageId);
  
  const statusConfig = {
    queued: { icon: '⏳', label: 'Queued', color: 'gray' },
    sending: { icon: '📤', label: 'Sending', color: 'blue' },
    sent: { icon: '✉️', label: 'Sent', color: 'blue' },
    delivered: { icon: '✅', label: 'Delivered', color: 'green' },
    undelivered: { icon: '❌', label: 'Undelivered', color: 'red' },
    failed: { icon: '⚠️', label: 'Failed', color: 'red' },
  };
  
  if (!status) return null;
  
  const config = statusConfig[status];
  
  return (
    <div className={`text-${config.color}-600 text-sm flex items-center gap-1`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
```

### Polling for Status Updates

```typescript
/**
 * Poll for SMS status updates (alternative to WebSockets)
 */
export function useSmsStatusPolling(enabled: boolean) {
  return trpc.sms2FA.getStatus.useQuery(undefined, {
    enabled,
    refetchInterval: enabled ? 10000 : false, // Poll every 10s when enabled
    refetchOnWindowFocus: true,
  });
}

// Usage during setup flow
function Sms2FASetupWithPolling() {
  const [setupComplete, setSetupComplete] = useState(false);
  const { data: status } = useSmsStatusPolling(setupComplete);
  
  useEffect(() => {
    if (status?.phoneVerified) {
      // Phone was verified, show success
      toast.success('Phone verified successfully!');
      setSetupComplete(true);
    }
  }, [status?.phoneVerified]);
  
  // ...rest of component
}
```

---

## Admin Cost Monitoring

### Cost Dashboard

```typescript
// pages/admin/sms-costs.tsx

import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';

export default function AdminSmsCostDashboard() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date(),
  });
  
  const { data: costs, isLoading } = trpc.sms2FA.getAggregateCosts.useQuery(dateRange);
  const { data: alerts } = trpc.sms2FA.checkCostAlerts.useQuery();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">SMS Cost Monitoring</h1>
      
      {/* Cost alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`p-4 rounded border ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-800'
              }`}
            >
              <strong>[{alert.severity.toUpperCase()}]</strong> {alert.details}
            </div>
          ))}
        </div>
      )}
      
      {/* Cost summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Total Cost"
          value={`$${costs?.totalCost.toFixed(2)}`}
          icon="💰"
        />
        <MetricCard
          title="Total Sent"
          value={costs?.totalSent.toLocaleString()}
          icon="📤"
        />
        <MetricCard
          title="Unique Users"
          value={costs?.uniqueUsers.toLocaleString()}
          icon="👥"
        />
        <MetricCard
          title="Avg Cost/SMS"
          value={`$${costs?.averageCostPerSms.toFixed(4)}`}
          icon="📊"
        />
      </div>
      
      {/* Delivery stats */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Delivery Statistics</h3>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(costs?.deliveryStats || {}).map(([status, count]) => (
            <div key={status} className="border rounded p-3">
              <div className="text-sm text-gray-600">{status}</div>
              <div className="text-2xl font-bold">{count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Core Setup (Week 1)

- [ ] **API Client Setup**
  - [ ] Create `sms-2fa-client.ts` with all endpoint methods
  - [ ] Set up axios interceptors for auth and error handling
  - [ ] Configure tRPC client for protected endpoints
  - [ ] Add TypeScript types for all requests/responses

- [ ] **Custom Hooks**
  - [ ] Create `useSms2FA.ts` with React Query hooks
  - [ ] Implement `useSetupSms()`, `useVerifySmsSetup()`
  - [ ] Implement `useVerifySmsChallenge()`, `useResendSms()`
  - [ ] Implement `useSmsStatus()`, `useDisableSms()`
  - [ ] Add proper error handling and cache invalidation

- [ ] **Validation Utilities**
  - [ ] Phone number validation (`validatePhoneNumber`)
  - [ ] Code validation (`validateVerificationCode`)
  - [ ] E.164 formatter (`formatToE164`)
  - [ ] Display formatter (`formatPhoneDisplay`)

### Phase 2: User-Facing Components (Week 2)

- [ ] **Setup Flow**
  - [ ] `<Sms2FASetup>` component with phone input
  - [ ] Phone number validation and formatting
  - [ ] Code verification step
  - [ ] Success state with backup codes display

- [ ] **Login Challenge**
  - [ ] `<SmsChallengeForm>` component
  - [ ] 6-digit code input with auto-focus
  - [ ] Resend button with progressive backoff
  - [ ] Attempt tracking display
  - [ ] Code expiry timer

- [ ] **Settings Management**
  - [ ] `<Sms2FASettings>` component
  - [ ] Enable/disable toggle
  - [ ] Phone number update flow
  - [ ] Disable confirmation modal
  - [ ] Rate limit indicator

- [ ] **Reusable Components**
  - [ ] `<CodeInput>` - 6-digit split input
  - [ ] `<CodeExpiryTimer>` - countdown timer
  - [ ] `<AttemptsDisplay>` - remaining attempts
  - [ ] `<ResendButton>` - with backoff timer
  - [ ] `<RateLimitIndicator>` - SMS quota display

### Phase 3: Error Handling & UX (Week 3)

- [ ] **Error Handling**
  - [ ] Error code mapping (`SMS_ERROR_MESSAGES`)
  - [ ] Error handler utility (`handleSmsError`)
  - [ ] Toast notifications (`showSmsError`, `showSmsSuccess`)
  - [ ] Retry logic for transient failures

- [ ] **UX Enhancements**
  - [ ] Loading states and skeletons
  - [ ] Empty states
  - [ ] Progressive disclosure
  - [ ] Accessibility improvements (ARIA labels, focus management)
  - [ ] Mobile-responsive design

### Phase 4: Admin Features (Week 4)

- [ ] **Cost Monitoring Dashboard**
  - [ ] Cost summary cards
  - [ ] Delivery statistics charts
  - [ ] Alert notifications
  - [ ] Date range selector
  - [ ] Export cost reports

- [ ] **Admin Tools**
  - [ ] View all users' SMS status
  - [ ] Reset user 2FA
  - [ ] Cost threshold configuration
  - [ ] Anomaly detection alerts

### Phase 5: Testing & Polish (Week 5)

- [ ] **Unit Tests**
  - [ ] Validation functions
  - [ ] Error handling utilities
  - [ ] Custom hooks (with React Testing Library)

- [ ] **Integration Tests**
  - [ ] Complete setup flow
  - [ ] Login challenge flow
  - [ ] Settings management flow

- [ ] **E2E Tests**
  - [ ] Full user journey (setup → login → disable)
  - [ ] Error scenarios (rate limit, invalid code, etc.)
  - [ ] Admin cost monitoring

### Edge Cases to Handle

- [ ] User closes browser during setup (resume from where they left off)
- [ ] Code expires while user is entering it (show clear message)
- [ ] User hits rate limit (show countdown and helpful message)
- [ ] User enters wrong code 3 times (force new code request)
- [ ] Phone number changes between setup and verification (handle gracefully)
- [ ] Network failures during SMS send (retry logic)
- [ ] User tries to disable SMS when it's the only 2FA method (prevent with clear message)
- [ ] Account lockout during verification (show locked until time)
- [ ] SMS delivery failure (show clear error, suggest retry)
- [ ] User has no phone signal (suggest using backup codes)

---

## Testing Guide

### Unit Tests

```typescript
// __tests__/utils/phone-validation.test.ts

import { validatePhoneNumber, formatToE164 } from '@/lib/utils/phone-validation';

describe('Phone Number Validation', () => {
  it('accepts valid E.164 format', () => {
    expect(validatePhoneNumber('+12345678901')).toEqual({ valid: true });
    expect(validatePhoneNumber('+447911123456')).toEqual({ valid: true });
  });
  
  it('rejects invalid formats', () => {
    expect(validatePhoneNumber('555-1234')).toMatchObject({ valid: false });
    expect(validatePhoneNumber('123456789012345678')).toMatchObject({ valid: false });
    expect(validatePhoneNumber('')).toMatchObject({ valid: false });
  });
  
  it('formats to E.164', () => {
    expect(formatToE164('(555) 123-4567', '1')).toBe('+15551234567');
    expect(formatToE164('555 123 4567', '1')).toBe('+15551234567');
  });
});
```

### Hook Tests

```typescript
// __tests__/hooks/useSms2FA.test.tsx

import { renderHook, waitFor } from '@testing-library/react';
import { useSetupSms } from '@/hooks/useSms2FA';
import { sms2FAClient } from '@/lib/api/sms-2fa-client';

jest.mock('@/lib/api/sms-2fa-client');

describe('useSetupSms', () => {
  it('sends SMS and handles success', async () => {
    const mockSetupSms = jest.spyOn(sms2FAClient, 'setupSms').mockResolvedValue({
      success: true,
      data: { message: 'Code sent', maskedPhoneNumber: '***8901' },
    });
    
    const { result } = renderHook(() => useSetupSms());
    
    result.current.mutate('+12345678901');
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSetupSms).toHaveBeenCalledWith('+12345678901');
  });
  
  it('handles rate limit error', async () => {
    jest.spyOn(sms2FAClient, 'setupSms').mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many SMS requests',
          },
        },
      },
    });
    
    const { result } = renderHook(() => useSetupSms());
    
    result.current.mutate('+12345678901');
    
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/sms-setup-flow.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sms2FASetup } from '@/components/Sms2FASetup';
import { sms2FAClient } from '@/lib/api/sms-2fa-client';

jest.mock('@/lib/api/sms-2fa-client');

describe('SMS 2FA Setup Flow', () => {
  it('completes full setup flow', async () => {
    const mockSetupSms = jest.spyOn(sms2FAClient, 'setupSms').mockResolvedValue({
      success: true,
      data: { message: 'Code sent', maskedPhoneNumber: '***8901' },
    });
    
    const mockVerifySetup = jest.spyOn(sms2FAClient, 'verifySetup').mockResolvedValue({
      success: true,
      data: { message: 'Verified', enabled: true },
    });
    
    const onComplete = jest.fn();
    
    render(<Sms2FASetup onComplete={onComplete} />);
    
    // Enter phone number
    const phoneInput = screen.getByPlaceholderText(/phone number/i);
    fireEvent.change(phoneInput, { target: { value: '+12345678901' } });
    
    // Submit
    const sendButton = screen.getByText(/send verification code/i);
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(mockSetupSms).toHaveBeenCalledWith('+12345678901');
    });
    
    // Enter verification code
    await waitFor(() => {
      expect(screen.getByText(/verify your phone/i)).toBeInTheDocument();
    });
    
    const codeInputs = screen.getAllByRole('textbox');
    codeInputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: i.toString() } });
    });
    
    // Verify
    const verifyButton = screen.getByText(/verify/i);
    fireEvent.click(verifyButton);
    
    await waitFor(() => {
      expect(mockVerifySetup).toHaveBeenCalledWith('012345');
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/sms-2fa.spec.ts

import { test, expect } from '@playwright/test';

test.describe('SMS 2FA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Login as test user
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });
  
  test('enables SMS 2FA successfully', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings/security');
    
    // Click enable SMS 2FA
    await page.click('text=Enable SMS 2FA');
    
    // Enter phone number
    await page.fill('input[type="tel"]', '+12345678901');
    await page.click('text=Send verification code');
    
    // Wait for code input
    await expect(page.locator('text=Verify your phone')).toBeVisible();
    
    // Enter code (in test environment, use known test code)
    const codeInputs = page.locator('input[maxlength="1"]');
    await codeInputs.nth(0).fill('1');
    await codeInputs.nth(1).fill('2');
    await codeInputs.nth(2).fill('3');
    await codeInputs.nth(3).fill('4');
    await codeInputs.nth(4).fill('5');
    await codeInputs.nth(5).fill('6');
    
    // Click verify
    await page.click('text=Verify');
    
    // Check success
    await expect(page.locator('text=SMS 2FA enabled successfully')).toBeVisible();
    await expect(page.locator('text=Enabled')).toBeVisible();
  });
  
  test('handles rate limit error', async ({ page }) => {
    await page.goto('/settings/security');
    await page.click('text=Enable SMS 2FA');
    
    // Send 4 requests rapidly to trigger rate limit
    for (let i = 0; i < 4; i++) {
      await page.fill('input[type="tel"]', '+12345678901');
      await page.click('text=Send verification code');
      await page.waitForTimeout(100);
    }
    
    // Should show rate limit error
    await expect(page.locator('text=Rate limit exceeded')).toBeVisible();
    await expect(page.locator('text=Try again in')).toBeVisible();
  });
});
```

---

## Summary

This comprehensive guide covers:

✅ **API Client** - Fully typed axios and tRPC clients
✅ **React Query Hooks** - All mutations and queries with proper caching
✅ **Complete User Flows** - Setup, challenge, and settings management
✅ **Error Handling** - Comprehensive error mapping and user-friendly messages
✅ **Rate Limiting** - Visual indicators and countdown timers
✅ **UX Best Practices** - Loading states, empty states, accessibility
✅ **Admin Features** - Cost monitoring dashboard and alerts
✅ **Testing** - Unit, integration, and E2E test examples
✅ **Implementation Checklist** - 5-week phased rollout plan

### Additional Resources

- [Part 1: API Endpoints & Types](./FRONTEND_INTEGRATION_TWILIO_SMS_2FA_PART_1.md)
- [Part 2: Business Logic & Error Handling](./FRONTEND_INTEGRATION_TWILIO_SMS_2FA_PART_2.md)
- [Backend Implementation: TWILIO_SMS_2FA_QUICK_REFERENCE.md](./TWILIO_SMS_2FA_QUICK_REFERENCE.md)
- [2FA Challenge Flow: 2FA_CHALLENGE_ENDPOINTS_IMPLEMENTATION.md](./2FA_CHALLENGE_ENDPOINTS_IMPLEMENTATION.md)
- [Unified 2FA API: UNIFIED_2FA_API_IMPLEMENTATION.md](./UNIFIED_2FA_API_IMPLEMENTATION.md)

### Support

For questions or issues:
1. Check error messages in browser console
2. Verify API endpoint URLs and authentication tokens
3. Review rate limit headers and status
4. Contact backend team if persistent server errors occur
