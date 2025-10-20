# Frontend Integration Guide: SMS 2FA Flow - Part 3

## 📋 Classification: 🌐 SHARED
**Module:** SMS Two-Factor Authentication (Implementation Guide)  
**Part:** 3 of 3

---

## 📦 TypeScript Type Definitions

### Complete Type Library

Copy these types into your frontend project:

```typescript
// ============================================================================
// SMS 2FA Types
// ============================================================================

/**
 * Two-factor authentication methods
 */
export type TwoFactorMethod = 'SMS' | 'AUTHENTICATOR' | 'BOTH';

/**
 * Phone number in E.164 format
 * Example: +12025551234
 */
export type E164PhoneNumber = `+${string}`;

// ============================================================================
// API Request Types
// ============================================================================

export interface SetupSmsRequest {
  phoneNumber: E164PhoneNumber;
}

export interface VerifySetupRequest {
  code: string;
  method?: TwoFactorMethod;
}

export interface VerifySmsLoginRequest {
  challengeToken: string;
  code: string;
}

export interface ResendSmsRequest {
  challengeToken: string;
}

export interface DisableTwoFactorRequest {
  password: string;
  code?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      code: string;
      message: string;
      path: string[];
    }>;
    // Rate limit specific fields
    resetAt?: string;
    remainingAttempts?: number;
    // Account lockout specific fields
    lockedUntil?: string;
    attemptsRemaining?: number;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// SMS 2FA Setup Responses
// ============================================================================

export interface SetupSmsData {
  method: 'SMS';
  maskedPhoneNumber: string;
  message: string;
  nextStep: string;
  codeExpiry: string;
  maxAttempts: number;
  canResend: boolean;
}

export interface VerifySetupSmsData {
  enabled: true;
  method: 'SMS';
  phoneNumber: string;
  message: string;
  note: string;
}

export interface VerifySetupTotpData {
  enabled: true;
  method: 'TOTP';
  backupCodes: string[];
  message: string;
  warning: string;
  backupCodesInfo: {
    count: number;
    oneTimeUse: boolean;
    usage: string;
  };
}

export type VerifySetupData = VerifySetupSmsData | VerifySetupTotpData;

// ============================================================================
// SMS 2FA Login Responses
// ============================================================================

export interface LoginWithChallengeData {
  requires2FA: true;
  challengeToken: string;
  method: TwoFactorMethod;
  maskedPhone?: string;
  message: string;
  expiresIn: number;
}

export interface VerifySmsLoginData {
  message: string;
}

export interface ResendSmsData {
  message: string;
  remainingAttempts: number;
}

// ============================================================================
// 2FA Status Response
// ============================================================================

export interface TwoFactorStatusData {
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

// ============================================================================
// Disable 2FA Response
// ============================================================================

export interface DisableTwoFactorData {
  enabled: false;
  message: string;
  warning: string;
  securityNote: string;
  details: {
    totpDisabled: boolean;
    smsDisabled: boolean;
    backupCodesRemoved: boolean;
  };
}

// ============================================================================
// Error Code Enums
// ============================================================================

export enum AuthErrorCode {
  // Authentication
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // User
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // Phone
  PHONE_IN_USE = 'PHONE_IN_USE',
  
  // SMS
  SMS_SEND_FAILED = 'SMS_SEND_FAILED',
  
  // 2FA
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  NO_PENDING_SETUP = 'NO_PENDING_SETUP',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Resend
  RESEND_FAILED = 'RESEND_FAILED',
  
  // Password
  INVALID_CURRENT_PASSWORD = 'INVALID_CURRENT_PASSWORD',
  
  // Server
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

import { z } from 'zod';

export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g., +12345678901)');

export const smsCodeSchema = z
  .string()
  .length(6, 'Code must be 6 digits')
  .regex(/^\d{6}$/, 'Code must contain only numbers');

export const setupSmsSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const verifySmsLoginSchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
  code: smsCodeSchema,
});

export const verifySetupSchema = z.object({
  code: smsCodeSchema,
  method: z.enum(['SMS', 'TOTP']).optional(),
});

export const resendSmsSchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required'),
});

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: smsCodeSchema.optional(),
});

// ============================================================================
// Helper Types
// ============================================================================

export interface RateLimitState {
  isLimited: boolean;
  resetAt: Date | null;
  remainingAttempts: number;
}

export interface ResendState {
  canResend: boolean;
  waitSeconds: number;
  attemptsRemaining: number;
}

export interface ChallengeState {
  token: string;
  method: TwoFactorMethod;
  maskedPhone?: string;
  expiresAt: Date;
  attemptsRemaining: number;
}
```

---

## 🎨 React Implementation Examples

### 1. SMS 2FA Setup Component

```typescript
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setupSmsSchema, verifySetupSchema } from '@/lib/schemas/auth';
import type { SetupSmsRequest, VerifySetupRequest } from '@/types/auth';

interface SetupSmsFormData {
  phoneNumber: string;
}

interface VerifyCodeFormData {
  code: string;
}

export function EnableSms2FA() {
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [maskedPhone, setMaskedPhone] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Phone number form
  const phoneForm = useForm<SetupSmsFormData>({
    resolver: zodResolver(setupSmsSchema),
  });

  // Verification code form
  const verifyForm = useForm<VerifyCodeFormData>({
    resolver: zodResolver(verifySetupSchema),
  });

  const handlePhoneSubmit = async (data: SetupSmsFormData) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/2fa/setup-sms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to send verification code');
      }

      setMaskedPhone(result.data.maskedPhoneNumber);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySubmit = async (data: VerifyCodeFormData) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/2fa/verify-setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data.code, method: 'SMS' }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Invalid verification code');
      }

      // Success! Redirect or show success message
      window.location.href = '/settings/security';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'phone') {
    return (
      <form onSubmit={phoneForm.handleSubmit(handlePhoneSubmit)}>
        <div className="space-y-4">
          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium">
              Phone Number
            </label>
            <input
              id="phoneNumber"
              type="tel"
              placeholder="+12025551234"
              {...phoneForm.register('phoneNumber')}
              className="mt-1 block w-full rounded-md border p-2"
            />
            {phoneForm.formState.errors.phoneNumber && (
              <p className="mt-1 text-sm text-red-600">
                {phoneForm.formState.errors.phoneNumber.message}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Enter your phone number in international format (e.g., +1 for US)
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send Verification Code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={verifyForm.handleSubmit(handleVerifySubmit)}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-700 mb-4">
            We've sent a 6-digit verification code to {maskedPhone}
          </p>

          <label htmlFor="code" className="block text-sm font-medium">
            Verification Code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            {...verifyForm.register('code')}
            className="mt-1 block w-full rounded-md border p-2 text-center text-2xl tracking-widest"
          />
          {verifyForm.formState.errors.code && (
            <p className="mt-1 text-sm text-red-600">
              {verifyForm.formState.errors.code.message}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Verifying...' : 'Verify Code'}
        </button>

        <button
          type="button"
          onClick={() => setStep('phone')}
          className="w-full text-sm text-gray-600 hover:text-gray-800"
        >
          Use a different phone number
        </button>
      </div>
    </form>
  );
}
```

### 2. SMS 2FA Login Component

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { verifySmsLoginSchema } from '@/lib/schemas/auth';

interface VerifySmsFormData {
  code: string;
}

interface Props {
  challengeToken: string;
  maskedPhone: string;
  onSuccess: () => void;
}

export function VerifySmsLogin({ challengeToken, maskedPhone, onSuccess }: Props) {
  const [error, setError] = useState<string>('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendWaitSeconds, setResendWaitSeconds] = useState(30);

  const form = useForm<VerifySmsFormData>({
    resolver: zodResolver(verifySmsLoginSchema.pick({ code: true })),
  });

  // Countdown timer for resend button
  useEffect(() => {
    if (resendWaitSeconds > 0) {
      const timer = setTimeout(() => {
        setResendWaitSeconds((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendWaitSeconds]);

  const handleSubmit = async (data: VerifySmsFormData) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/2fa/verify-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken,
          code: data.code,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error?.attemptsRemaining !== undefined) {
          setAttemptsRemaining(result.error.attemptsRemaining);
        }
        throw new Error(result.error?.message || 'Invalid verification code');
      }

      // Success - session is set, redirect
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      form.reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/2fa/resend-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to resend code');
      }

      // Reset countdown
      setCanResend(false);
      setResendWaitSeconds(60); // Longer wait for second resend
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Verify Your Identity</h2>
        <p className="mt-2 text-sm text-gray-600">
          We've sent a verification code to {maskedPhone}
        </p>
      </div>

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium">
              Verification Code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoFocus
              {...form.register('code')}
              className="mt-1 block w-full rounded-md border p-3 text-center text-2xl tracking-widest"
            />
            {form.formState.errors.code && (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
              {attemptsRemaining > 0 && (
                <p className="mt-1 text-xs text-red-700">
                  {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </form>

      <div className="text-center">
        {canResend ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={isLoading}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            Resend code
          </button>
        ) : (
          <p className="text-sm text-gray-500">
            Resend code in {resendWaitSeconds} seconds
          </p>
        )}
      </div>
    </div>
  );
}
```

### 3. API Client Helper Functions

```typescript
// lib/api/sms2fa.ts

import type {
  SetupSmsRequest,
  SetupSmsData,
  VerifySetupRequest,
  VerifySetupData,
  VerifySmsLoginRequest,
  VerifySmsLoginData,
  ResendSmsRequest,
  ResendSmsData,
  DisableTwoFactorRequest,
  DisableTwoFactorData,
  TwoFactorStatusData,
  ApiResponse,
} from '@/types/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

class Sms2FAClient {
  /**
   * Setup SMS 2FA by sending verification code to phone
   */
  async setupSms(data: SetupSmsRequest): Promise<ApiResponse<SetupSmsData>> {
    const response = await fetch(`${API_BASE_URL}/api/auth/2fa/setup-sms`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    return response.json();
  }

  /**
   * Verify setup code and complete SMS 2FA enablement
   */
  async verifySetup(data: VerifySetupRequest): Promise<ApiResponse<VerifySetupData>> {
    const response = await fetch(`${API_BASE_URL}/api/auth/2fa/verify-setup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    return response.json();
  }

  /**
   * Verify SMS code during login challenge
   */
  async verifySmsLogin(data: VerifySmsLoginRequest): Promise<ApiResponse<VerifySmsLoginData>> {
    const response = await fetch(`${API_BASE_URL}/api/auth/2fa/verify-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    return response.json();
  }

  /**
   * Resend SMS verification code
   */
  async resendSms(data: ResendSmsRequest): Promise<ApiResponse<ResendSmsData>> {
    const response = await fetch(`${API_BASE_URL}/api/auth/2fa/resend-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    return response.json();
  }

  /**
   * Get current 2FA status
   */
  async getStatus(): Promise<ApiResponse<TwoFactorStatusData>> {
    const response = await fetch(`${API_BASE_URL}/api/auth/2fa/status`, {
      method: 'GET',
      credentials: 'include',
    });

    return response.json();
  }

  /**
   * Disable all 2FA methods
   */
  async disable(data: DisableTwoFactorRequest): Promise<ApiResponse<DisableTwoFactorData>> {
    const response = await fetch(`${API_BASE_URL}/api/auth/2fa/disable`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    return response.json();
  }
}

export const sms2faClient = new Sms2FAClient();
```

### 4. React Query Hooks

```typescript
// hooks/use-sms-2fa.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sms2faClient } from '@/lib/api/sms2fa';
import type {
  SetupSmsRequest,
  VerifySetupRequest,
  VerifySmsLoginRequest,
  ResendSmsRequest,
  DisableTwoFactorRequest,
} from '@/types/auth';

export function use2FAStatus() {
  return useQuery({
    queryKey: ['2fa-status'],
    queryFn: async () => {
      const response = await sms2faClient.getStatus();
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    },
  });
}

export function useSetupSms() {
  return useMutation({
    mutationFn: async (data: SetupSmsRequest) => {
      const response = await sms2faClient.setupSms(data);
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    },
  });
}

export function useVerifySetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: VerifySetupRequest) => {
      const response = await sms2faClient.verifySetup(data);
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate 2FA status to refetch
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
    },
  });
}

export function useVerifySmsLogin() {
  return useMutation({
    mutationFn: async (data: VerifySmsLoginRequest) => {
      const response = await sms2faClient.verifySmsLogin(data);
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    },
  });
}

export function useResendSms() {
  return useMutation({
    mutationFn: async (data: ResendSmsRequest) => {
      const response = await sms2faClient.resendSms(data);
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    },
  });
}

export function useDisable2FA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: DisableTwoFactorRequest) => {
      const response = await sms2faClient.disable(data);
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
    },
  });
}
```

---

## 🚨 Error Handling Strategy

### Error Handling Utility

```typescript
// lib/utils/error-handler.ts

import { AuthErrorCode } from '@/types/auth';

export interface ErrorDisplayConfig {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  action?: {
    label: string;
    handler: () => void;
  };
}

export function handleSms2FAError(
  errorCode: string,
  errorMessage: string,
  context?: {
    attemptsRemaining?: number;
    lockedUntil?: string;
    resetAt?: string;
  }
): ErrorDisplayConfig {
  switch (errorCode) {
    case AuthErrorCode.VALIDATION_ERROR:
      return {
        title: 'Invalid Input',
        message: errorMessage || 'Please check your input and try again.',
        type: 'error',
      };

    case AuthErrorCode.PHONE_IN_USE:
      return {
        title: 'Phone Number Already Registered',
        message: 'This phone number is already associated with another account. Please use a different number.',
        type: 'error',
      };

    case AuthErrorCode.SMS_SEND_FAILED:
      return {
        title: 'SMS Send Failed',
        message: 'We could not send an SMS to this number. Please verify the number is correct and try again.',
        type: 'error',
      };

    case AuthErrorCode.VERIFICATION_FAILED:
      if (context?.attemptsRemaining !== undefined) {
        const remaining = context.attemptsRemaining;
        if (remaining === 0) {
          return {
            title: 'Maximum Attempts Exceeded',
            message: 'You have used all verification attempts. Please request a new code.',
            type: 'error',
          };
        }
        return {
          title: 'Invalid Code',
          message: `Incorrect verification code. You have ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`,
          type: 'warning',
        };
      }
      return {
        title: 'Verification Failed',
        message: errorMessage || 'The verification code is incorrect or has expired.',
        type: 'error',
      };

    case AuthErrorCode.RATE_LIMIT_EXCEEDED:
      const resetTime = context?.resetAt ? new Date(context.resetAt) : null;
      const minutesRemaining = resetTime
        ? Math.ceil((resetTime.getTime() - Date.now()) / 60000)
        : 15;
      return {
        title: 'Too Many Attempts',
        message: `You've made too many attempts. Please try again in ${minutesRemaining} minutes.`,
        type: 'error',
      };

    case AuthErrorCode.NO_PENDING_SETUP:
      return {
        title: 'No Pending Setup',
        message: 'No pending 2FA setup found. Please start the setup process again.',
        type: 'info',
      };

    case AuthErrorCode.INVALID_CURRENT_PASSWORD:
      return {
        title: 'Incorrect Password',
        message: 'The password you entered is incorrect.',
        type: 'error',
      };

    case AuthErrorCode.UNAUTHORIZED:
      return {
        title: 'Authentication Required',
        message: 'You must be logged in to perform this action.',
        type: 'error',
        action: {
          label: 'Log In',
          handler: () => {
            window.location.href = '/login';
          },
        },
      };

    default:
      return {
        title: 'An Error Occurred',
        message: errorMessage || 'Something went wrong. Please try again.',
        type: 'error',
      };
  }
}
```

### Usage in Components

```typescript
import { handleSms2FAError } from '@/lib/utils/error-handler';

// In your component
const handleError = (error: ApiErrorResponse) => {
  const config = handleSms2FAError(
    error.error.code,
    error.error.message,
    {
      attemptsRemaining: error.error.attemptsRemaining,
      lockedUntil: error.error.lockedUntil,
      resetAt: error.error.resetAt,
    }
  );

  // Display error using your toast/alert system
  toast.error(config.title, {
    description: config.message,
  });

  // Execute action if present
  if (config.action) {
    // Show action button in toast or execute automatically
  }
};
```

---

## ✅ Frontend Implementation Checklist

### Phase 1: Setup & Configuration
- [ ] Copy TypeScript types to project (`types/auth.ts`)
- [ ] Install required dependencies (`zod`, `react-hook-form`, `@tanstack/react-query`)
- [ ] Create API client module (`lib/api/sms2fa.ts`)
- [ ] Set up environment variables (`NEXT_PUBLIC_API_URL`)
- [ ] Configure React Query provider (if not already done)

### Phase 2: Enable SMS 2FA Flow
- [ ] Create phone number input component with E.164 validation
- [ ] Implement phone number format helper (add country code automatically)
- [ ] Create SMS code verification input component
- [ ] Add real-time code validation (6 digits, numeric only)
- [ ] Implement error handling for phone number already in use
- [ ] Add loading states during SMS send and verification
- [ ] Show masked phone number after successful code send
- [ ] Display "code expires in X minutes" countdown
- [ ] Implement "use different phone number" option
- [ ] Add success confirmation with security recommendations

### Phase 3: Login Challenge Flow
- [ ] Detect 2FA challenge in login response
- [ ] Store challenge token securely (memory, not localStorage)
- [ ] Create SMS verification screen for login
- [ ] Implement code input with auto-focus
- [ ] Add resend code button with countdown timer
- [ ] Show attempts remaining counter
- [ ] Handle rate limit errors gracefully
- [ ] Redirect to dashboard on successful verification
- [ ] Clear challenge token on success or error

### Phase 4: 2FA Status & Management
- [ ] Create 2FA settings page
- [ ] Fetch and display current 2FA status
- [ ] Show masked phone number if SMS enabled
- [ ] Display available methods (SMS, TOTP)
- [ ] Show backup codes count (if applicable)
- [ ] Implement toggle/enable/disable UI
- [ ] Add confirmation modal for disabling 2FA
- [ ] Show security warnings when disabling

### Phase 5: Error Handling & UX
- [ ] Implement comprehensive error handler utility
- [ ] Create user-friendly error messages for all error codes
- [ ] Add toast/alert system for errors and success messages
- [ ] Handle rate limiting with clear user feedback
- [ ] Show countdown timers for rate limit resets
- [ ] Display account lockout information
- [ ] Provide "contact support" option for locked accounts
- [ ] Log errors to monitoring service (Sentry, etc.)

### Phase 6: Accessibility & Polish
- [ ] Add ARIA labels to all form inputs
- [ ] Implement keyboard navigation
- [ ] Test with screen readers
- [ ] Add loading skeletons for async operations
- [ ] Implement auto-submit when 6 digits entered
- [ ] Add input masking for code field
- [ ] Create mobile-optimized layouts
- [ ] Test on various screen sizes and devices

### Phase 7: Testing
- [ ] Unit test API client functions
- [ ] Test form validation rules
- [ ] Test error handling scenarios
- [ ] Test rate limiting behavior
- [ ] Integration test complete setup flow
- [ ] Integration test complete login flow
- [ ] Test edge cases (expired codes, invalid formats)
- [ ] E2E test with real Twilio test numbers

### Phase 8: Security & Performance
- [ ] Never store SMS codes in localStorage
- [ ] Clear sensitive data from memory after use
- [ ] Implement CSP headers for added security
- [ ] Add request timeout handling
- [ ] Optimize bundle size (code split if needed)
- [ ] Implement retry logic for network failures
- [ ] Add request cancellation on component unmount

---

## 🎯 UX Considerations

### Best Practices

1. **Code Input UX**
   - Use `inputMode="numeric"` for mobile keyboards
   - Add `autoComplete="one-time-code"` for iOS autofill
   - Implement auto-submit when 6 digits entered
   - Clear input on error for easy retry

2. **Progressive Disclosure**
   - Start with phone input only
   - Show code input only after SMS sent
   - Display contextual help at each step

3. **Clear Feedback**
   - Show masked phone for verification
   - Display countdown timers
   - Indicate attempts remaining
   - Provide actionable error messages

4. **Accessibility**
   - Use semantic HTML
   - Add proper ARIA labels
   - Ensure keyboard navigation works
   - Test with screen readers

5. **Mobile Optimization**
   - Large touch targets
   - Numeric keyboard for code input
   - Single-column layouts
   - Easy-to-tap resend button

### Sample User Messages

```typescript
const USER_MESSAGES = {
  setupSuccess: 'SMS two-factor authentication is now enabled. You'll receive a code when logging in.',
  setupError: 'We couldn't set up SMS authentication. Please try again or contact support.',
  codeExpired: 'Your verification code has expired. We've sent you a new one.',
  rateLimitWarning: 'Too many attempts. Please wait a few minutes and try again.',
  accountLocked: 'Your account has been temporarily locked for security. Check your email for instructions.',
  disableWarning: 'Disabling two-factor authentication makes your account less secure. Are you sure?',
  disableSuccess: 'Two-factor authentication has been disabled. We recommend re-enabling it for security.',
};
```

---

## 📚 Additional Resources

### Related Backend Documentation
- `UNIFIED_2FA_API_IMPLEMENTATION.md` - Complete 2FA system (SMS + TOTP)
- `AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md` - TOTP authenticator flow
- `2FA_CHALLENGE_ENDPOINTS_IMPLEMENTATION.md` - Challenge/verification flow details

### External Resources
- [Twilio SMS Best Practices](https://www.twilio.com/docs/sms/best-practices)
- [E.164 Phone Number Format](https://en.wikipedia.org/wiki/E.164)
- [OWASP 2FA Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

---

## 🆘 Troubleshooting

### Common Issues

**Issue**: SMS not received
- **Solutions**:
  - Verify phone number is in E.164 format
  - Check Twilio account balance/status
  - Verify phone number can receive SMS
  - Check spam/blocked messages

**Issue**: "Phone number already in use"
- **Solutions**:
  - User may have multiple accounts
  - Previous setup not completed
  - Contact support to unlink phone

**Issue**: Rate limit errors
- **Solutions**:
  - Wait for rate limit window to reset
  - Display clear countdown timer
  - Suggest using backup method (TOTP)

**Issue**: Verification always fails
- **Solutions**:
  - Check time sync on device
  - Verify code hasn't expired (5 minutes)
  - Confirm code matches exactly
  - Check for typos in masked phone display

---

**End of Frontend Integration Guide - SMS 2FA Flow**

For questions or issues, contact the backend team or open an issue in the repository.
