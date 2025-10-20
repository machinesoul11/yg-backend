# 🔒 Frontend Integration Guide: 2FA Setup & Management (Part 2)

> **Classification:** 🌐 SHARED - Implementation Guide  
> **Module:** Two-Factor Authentication Setup & Management  
> **Part:** 2 of 2 - Implementation Details  
> **Last Updated:** October 19, 2025

---

## 📋 Table of Contents

1. [Frontend Implementation Checklist](#frontend-implementation-checklist)
2. [React Query Integration](#react-query-integration)
3. [Form Validation with Zod](#form-validation-with-zod)
4. [UI/UX Patterns & Components](#uiux-patterns--components)
5. [Complete Implementation Examples](#complete-implementation-examples)
6. [Edge Cases & Error Handling](#edge-cases--error-handling)
7. [Testing Guide](#testing-guide)
8. [Security Best Practices](#security-best-practices)

---

## Frontend Implementation Checklist

### Phase 1: Setup & Configuration

- [ ] **API Client Setup**
  - [ ] Create base API client with credentials included
  - [ ] Configure error handling and retries
  - [ ] Add TypeScript types from Part 1
  - [ ] Set up React Query or similar data-fetching library

- [ ] **Type Definitions**
  - [ ] Copy all TypeScript types from Part 1
  - [ ] Create Zod schemas for form validation
  - [ ] Define component prop types

### Phase 2: Core Components

- [ ] **Status Display**
  - [ ] Create 2FA status dashboard component
  - [ ] Show enabled methods and recommendations
  - [ ] Display backup codes remaining
  - [ ] Add refresh capability

- [ ] **TOTP Setup Flow**
  - [ ] QR code display component
  - [ ] Manual entry key display (with copy button)
  - [ ] Code verification input
  - [ ] Backup codes display with download/print options
  - [ ] Success confirmation

- [ ] **SMS Setup Flow**
  - [ ] Phone number input with country selector
  - [ ] E.164 format validation
  - [ ] SMS code input with auto-focus
  - [ ] Resend code button with cooldown
  - [ ] Success confirmation

- [ ] **Management Features**
  - [ ] View backup codes (metadata only)
  - [ ] Regenerate backup codes with password confirmation
  - [ ] Disable 2FA with password confirmation
  - [ ] Warning modals for destructive actions

### Phase 3: UX Enhancements

- [ ] **Loading States**
  - [ ] Skeleton loaders for status
  - [ ] Button loading states
  - [ ] Progress indicators for multi-step flows

- [ ] **Error Handling**
  - [ ] Toast notifications for errors
  - [ ] Inline form errors
  - [ ] Rate limit countdown timers
  - [ ] Retry mechanisms

- [ ] **Accessibility**
  - [ ] ARIA labels for all inputs
  - [ ] Keyboard navigation
  - [ ] Screen reader announcements
  - [ ] Focus management

### Phase 4: Testing & Polish

- [ ] **Unit Tests**
  - [ ] API client functions
  - [ ] Form validation
  - [ ] Component rendering

- [ ] **Integration Tests**
  - [ ] Complete setup flows
  - [ ] Error scenarios
  - [ ] Rate limiting behavior

- [ ] **E2E Tests**
  - [ ] Full user journeys
  - [ ] Cross-browser testing
  - [ ] Mobile responsiveness

---

## React Query Integration

### Setup

```typescript
// lib/api/2fa.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Base fetch function
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // Critical for session cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.error || { code: 'UNKNOWN', message: 'An error occurred' });
  }

  return data;
}

class ApiError extends Error {
  constructor(public error: { code: string; message: string; [key: string]: any }) {
    super(error.message);
    this.name = 'ApiError';
  }
}
```

### Queries (GET)

```typescript
// Get 2FA Status
export function use2FAStatus() {
  return useQuery({
    queryKey: ['2fa', 'status'],
    queryFn: () => apiFetch<TwoFactorStatusResponse>('/api/auth/2fa/status'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Only retry once for status checks
  });
}

// Get Backup Codes
export function useBackupCodes() {
  return useQuery({
    queryKey: ['2fa', 'backup-codes'],
    queryFn: () => apiFetch<BackupCodesResponse>('/api/auth/2fa/backup-codes'),
    staleTime: 0, // Always fetch fresh
    enabled: false, // Only fetch when explicitly called
  });
}
```

### Mutations (POST)

```typescript
// Setup TOTP
export function useSetupTotp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<SetupTotpResponse>('/api/auth/2fa/setup-totp', {
      method: 'POST',
    }),
    onSuccess: () => {
      // Invalidate status to reflect pending setup
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
  });
}

// Setup SMS
export function useSetupSms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SetupSmsRequest) =>
      apiFetch<SetupSmsResponse>('/api/auth/2fa/setup-sms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
  });
}

// Verify Setup
export function useVerifySetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VerifySetupRequest) =>
      apiFetch<VerifySetupTotpResponse | VerifySetupSmsResponse>(
        '/api/auth/2fa/verify-setup',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    onSuccess: () => {
      // 2FA is now enabled, refresh all related queries
      queryClient.invalidateQueries({ queryKey: ['2fa'] });
    },
  });
}

// Disable 2FA
export function useDisable2FA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Disable2FARequest) =>
      apiFetch<Disable2FAResponse>('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa'] });
    },
  });
}

// Regenerate Backup Codes
export function useRegenerateBackupCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegenerateBackupCodesRequest) =>
      apiFetch<RegenerateBackupCodesResponse>('/api/auth/2fa/regenerate-backup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['2fa', 'backup-codes'] });
      queryClient.invalidateQueries({ queryKey: ['2fa', 'status'] });
    },
  });
}
```

### Error Handling Hook

```typescript
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner'; // or your toast library

export function use2FAErrorHandler(error: ApiError | null) {
  const router = useRouter();

  useEffect(() => {
    if (!error) return;

    // Handle specific error codes
    switch (error.error.code) {
      case 'UNAUTHORIZED':
        toast.error('Session expired. Please log in again.');
        router.push('/login');
        break;

      case 'RATE_LIMIT_EXCEEDED':
        if (error.error.rateLimitResetAt) {
          const resetAt = new Date(error.error.rateLimitResetAt);
          const minutes = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
          toast.error(`${error.error.message} Try again in ${minutes} minute(s).`);
        } else {
          toast.error(error.error.message);
        }
        break;

      case 'VALIDATION_ERROR':
        // Form-level validation handled separately
        break;

      default:
        toast.error(error.error.message);
    }
  }, [error, router]);
}
```

---

## Form Validation with Zod

### Schemas

```typescript
// lib/validators/2fa.ts
import { z } from 'zod';

// Phone number validation (E.164)
export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone number must be in international format (e.g., +1234567890)',
  });

// SMS setup form
export const smsSetupSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export type SmsSetupFormData = z.infer<typeof smsSetupSchema>;

// Verification code (6 digits)
export const verificationCodeSchema = z
  .string()
  .length(6, 'Code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'Code must contain only numbers');

// Verify setup form
export const verifySetupSchema = z.object({
  code: verificationCodeSchema,
});

export type VerifySetupFormData = z.infer<typeof verifySetupSchema>;

// Password confirmation form
export const passwordConfirmSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type PasswordConfirmFormData = z.infer<typeof passwordConfirmSchema>;

// Disable 2FA form
export const disable2FASchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: z.string().optional(),
});

export type Disable2FAFormData = z.infer<typeof disable2FASchema>;
```

### React Hook Form Integration

```typescript
// components/2fa/SmsSetupForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function SmsSetupForm({ onSuccess }: { onSuccess: () => void }) {
  const setupSms = useSetupSms();

  const form = useForm<SmsSetupFormData>({
    resolver: zodResolver(smsSetupSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await setupSms.mutateAsync(data);
      onSuccess();
    } catch (error) {
      if (error instanceof ApiError) {
        // Handle API errors
        if (error.error.code === 'VALIDATION_ERROR' && error.error.details) {
          // Map API validation errors to form fields
          error.error.details.forEach((detail: ValidationErrorDetails) => {
            form.setError(detail.path.join('.') as any, {
              message: detail.message,
            });
          });
        } else {
          form.setError('root', {
            message: error.error.message,
          });
        }
      }
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <div>
        <label htmlFor="phoneNumber">Phone Number</label>
        <input
          id="phoneNumber"
          type="tel"
          placeholder="+1234567890"
          {...form.register('phoneNumber')}
          aria-invalid={!!form.formState.errors.phoneNumber}
          aria-describedby={form.formState.errors.phoneNumber ? 'phone-error' : undefined}
        />
        {form.formState.errors.phoneNumber && (
          <p id="phone-error" className="error" role="alert">
            {form.formState.errors.phoneNumber.message}
          </p>
        )}
      </div>

      {form.formState.errors.root && (
        <div className="alert alert-error" role="alert">
          {form.formState.errors.root.message}
        </div>
      )}

      <button type="submit" disabled={setupSms.isPending}>
        {setupSms.isPending ? 'Sending...' : 'Send Verification Code'}
      </button>
    </form>
  );
}
```

### Phone Number Input Component

```typescript
// components/ui/PhoneInput.tsx
import { forwardRef, useState } from 'react';
import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange: (value: string) => void;
  value: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ onChange, value, ...props }, ref) => {
    const [country, setCountry] = useState<CountryCode>('US');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let input = e.target.value;

      // Auto-add + if not present
      if (!input.startsWith('+') && input.length > 0) {
        input = '+' + input;
      }

      // Try to detect country from input
      try {
        const parsed = parsePhoneNumber(input);
        if (parsed) {
          setCountry(parsed.country as CountryCode);
          input = parsed.number; // Use formatted E.164
        }
      } catch {
        // Invalid format, let user continue typing
      }

      onChange(input);
    };

    return (
      <div className="phone-input">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value as CountryCode)}
          className="country-select"
        >
          <option value="US">🇺🇸 +1</option>
          <option value="GB">🇬🇧 +44</option>
          <option value="CA">🇨🇦 +1</option>
          <option value="AU">🇦🇺 +61</option>
          {/* Add more countries as needed */}
        </select>
        <input
          ref={ref}
          type="tel"
          value={value}
          onChange={handleChange}
          placeholder="+1234567890"
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
```

---

## UI/UX Patterns & Components

### Status Dashboard

```tsx
// components/2fa/StatusDashboard.tsx
import { use2FAStatus } from '@/lib/api/2fa';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export function TwoFactorStatusDashboard() {
  const { data, isLoading, error } = use2FAStatus();

  if (isLoading) {
    return <StatusSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load 2FA status. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  const status = data?.data;
  if (!status) return null;

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Two-Factor Authentication</h2>
          <p className="text-muted-foreground">
            {status.enabled
              ? 'Your account is secured with 2FA'
              : 'Protect your account with an extra layer of security'}
          </p>
        </div>
        <Badge variant={status.enabled ? 'success' : 'secondary'}>
          {status.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {/* Recommendations */}
      {Object.values(status.recommendations).some((rec) => rec !== null) && (
        <Alert>
          <AlertDescription>
            <ul className="space-y-1">
              {status.recommendations.enableAny && (
                <li>{status.recommendations.enableAny}</li>
              )}
              {status.recommendations.enableTotp && (
                <li>{status.recommendations.enableTotp}</li>
              )}
              {status.recommendations.enableSms && (
                <li>{status.recommendations.enableSms}</li>
              )}
              {status.recommendations.regenerateBackupCodes && (
                <li className="text-warning">{status.recommendations.regenerateBackupCodes}</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Methods */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* TOTP Card */}
        <MethodCard
          title="Authenticator App"
          description={status.availableMethods.totp.description}
          enabled={status.availableMethods.totp.enabled}
          icon="🔐"
        />

        {/* SMS Card */}
        <MethodCard
          title="SMS Verification"
          description={status.availableMethods.sms.description}
          enabled={status.availableMethods.sms.enabled}
          icon="📱"
          detail={status.availableMethods.sms.maskedPhone}
        />
      </div>

      {/* Backup Codes */}
      {status.backupCodes.available && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Backup Codes</h3>
              <p className="text-sm text-muted-foreground">
                {status.backupCodes.remaining} codes remaining
              </p>
            </div>
            <button className="btn btn-outline">View Codes</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MethodCard({
  title,
  description,
  enabled,
  icon,
  detail,
}: {
  title: string;
  description: string;
  enabled: boolean;
  icon: string;
  detail?: string | null;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{title}</h3>
            <Badge variant={enabled ? 'success' : 'secondary'}>
              {enabled ? 'Active' : 'Not Set Up'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {detail && (
            <p className="text-sm font-medium mt-2">{detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-20 bg-muted animate-pulse rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    </div>
  );
}
```

### TOTP Setup Modal

```tsx
// components/2fa/TotpSetupModal.tsx
import { useState } from 'react';
import { useSetupTotp, useVerifySetup } from '@/lib/api/2fa';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { CopyButton } from '@/components/ui/copy-button';

export function TotpSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'qr' | 'verify' | 'backup'>('qr');
  const [setupData, setSetupData] = useState<SetupTotpResponse['data'] | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const setupTotp = useSetupTotp();
  const verifySetup = useVerifySetup();

  // Step 1: Generate QR Code
  const handleStart = async () => {
    try {
      const response = await setupTotp.mutateAsync();
      setSetupData(response.data);
      setStep('verify');
    } catch (error) {
      // Error handled by error hook
    }
  };

  // Step 2: Verify Code
  const handleVerify = async (code: string) => {
    try {
      const response = await verifySetup.mutateAsync({ code });
      if (response.data.method === 'TOTP') {
        setBackupCodes(response.data.backupCodes);
        setStep('backup');
      }
    } catch (error) {
      // Error handled by error hook
    }
  };

  // Step 3: Finish
  const handleFinish = () => {
    onClose();
    // Reset state after modal close animation
    setTimeout(() => {
      setStep('qr');
      setSetupData(null);
      setBackupCodes([]);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'qr' && 'Set Up Authenticator App'}
            {step === 'verify' && 'Verify Your Setup'}
            {step === 'backup' && 'Save Your Backup Codes'}
          </DialogTitle>
        </DialogHeader>

        {step === 'qr' && !setupData && (
          <div className="space-y-4">
            <p>
              Use an authenticator app like Google Authenticator, Authy, or Microsoft
              Authenticator to scan the QR code.
            </p>
            <button onClick={handleStart} disabled={setupTotp.isPending}>
              {setupTotp.isPending ? 'Generating...' : 'Generate QR Code'}
            </button>
          </div>
        )}

        {step === 'verify' && setupData && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <QRCodeSVG value={setupData.qrCodeDataUrl} size={200} />
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Can't scan? Enter this code manually:
                </p>
                <div className="flex items-center gap-2 justify-center">
                  <code className="bg-muted px-3 py-1 rounded">
                    {setupData.manualEntryKey}
                  </code>
                  <CopyButton text={setupData.manualEntryKey} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-2">Authenticator Apps</h4>
              <div className="grid gap-2 text-sm">
                {setupData.authenticatorApps.map((app) => (
                  <div key={app.name} className="flex items-center justify-between">
                    <span>{app.name}</span>
                    <div className="flex gap-2">
                      <a href={app.ios} target="_blank" rel="noopener noreferrer">
                        iOS
                      </a>
                      <a href={app.android} target="_blank" rel="noopener noreferrer">
                        Android
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <VerifyCodeForm onSubmit={handleVerify} isLoading={verifySetup.isPending} />
          </div>
        )}

        {step === 'backup' && (
          <BackupCodesDisplay codes={backupCodes} onFinish={handleFinish} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VerifyCodeForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (code: string) => void;
  isLoading: boolean;
}) {
  const form = useForm<VerifySetupFormData>({
    resolver: zodResolver(verifySetupSchema),
  });

  return (
    <form onSubmit={form.handleSubmit((data) => onSubmit(data.code))} className="space-y-4">
      <div>
        <label htmlFor="code">Enter the 6-digit code from your app</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          {...form.register('code')}
          className="text-center text-2xl tracking-widest"
          autoComplete="off"
        />
        {form.formState.errors.code && (
          <p className="error">{form.formState.errors.code.message}</p>
        )}
      </div>
      <button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Verifying...' : 'Verify & Enable'}
      </button>
    </form>
  );
}
```

### Backup Codes Display

```tsx
// components/2fa/BackupCodesDisplay.tsx
import { useState } from 'react';
import { Download, Printer, Check } from 'lucide-react';

export function BackupCodesDisplay({
  codes,
  onFinish,
}: {
  codes: string[];
  onFinish: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const handleDownload = () => {
    const text = `YesGoddess Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\n${codes.join('\n')}\n\nIMPORTANT: Each code can only be used once. Store these in a secure location.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yesgoddess-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>YesGoddess Backup Codes</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            h1 { font-size: 20px; }
            ul { list-style: none; padding: 0; }
            li { padding: 10px; margin: 5px 0; background: #f5f5f5; }
            .warning { color: red; font-weight: bold; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>YesGoddess Backup Codes</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <ul>
            ${codes.map((code) => `<li>${code}</li>`).join('')}
          </ul>
          <p class="warning">
            IMPORTANT: Each code can only be used once. Store these in a secure location.
          </p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="font-semibold text-yellow-900">⚠️ Important: Save These Codes Now</p>
        <p className="text-sm text-yellow-800 mt-1">
          You won't be able to view these codes again. Each code can only be used once.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {codes.map((code, index) => (
          <div
            key={index}
            className="bg-muted p-3 rounded text-center font-mono text-sm"
          >
            {code}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={handleDownload} className="btn btn-outline flex-1">
          <Download className="w-4 h-4 mr-2" />
          Download
        </button>
        <button onClick={handlePrint} className="btn btn-outline flex-1">
          <Printer className="w-4 h-4 mr-2" />
          Print
        </button>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span className="text-sm">
          I have saved these backup codes in a secure location
        </span>
      </label>

      <button
        onClick={onFinish}
        disabled={!confirmed}
        className="w-full btn btn-primary"
      >
        <Check className="w-4 h-4 mr-2" />
        Finish Setup
      </button>
    </div>
  );
}
```

### SMS Setup Flow

```tsx
// components/2fa/SmsSetupModal.tsx
import { useState } from 'react';
import { useSetupSms, useVerifySetup } from '@/lib/api/2fa';

export function SmsSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const setupSms = useSetupSms();
  const verifySetup = useVerifySetup();

  const handleSubmitPhone = async (data: SmsSetupFormData) => {
    try {
      await setupSms.mutateAsync(data);
      setPhoneNumber(data.phoneNumber);
      setStep('verify');
    } catch (error) {
      if (error instanceof ApiError && error.error.rateLimitResetAt) {
        const resetAt = new Date(error.error.rateLimitResetAt);
        const seconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
        startCooldown(seconds);
      }
    }
  };

  const handleVerify = async (code: string) => {
    try {
      await verifySetup.mutateAsync({ code, method: 'SMS' });
      onClose();
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    await setupSms.mutateAsync({ phoneNumber });
  };

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'phone' ? 'Set Up SMS Verification' : 'Enter Verification Code'}
          </DialogTitle>
        </DialogHeader>

        {step === 'phone' && (
          <SmsSetupForm onSuccess={handleSubmitPhone} />
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to {phoneNumber}. Enter it below to complete setup.
            </p>

            <VerifyCodeForm onSubmit={handleVerify} isLoading={verifySetup.isPending} />

            <div className="text-center">
              <button
                onClick={handleResend}
                disabled={cooldown > 0 || setupSms.isPending}
                className="text-sm text-primary hover:underline"
              >
                {cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : setupSms.isPending
                  ? 'Sending...'
                  : 'Resend code'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### Disable 2FA Confirmation

```tsx
// components/2fa/Disable2FAModal.tsx
export function Disable2FAModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const disable2FA = useDisable2FA();

  const form = useForm<Disable2FAFormData>({
    resolver: zodResolver(disable2FASchema),
  });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await disable2FA.mutateAsync(data);
      toast.success('Two-factor authentication has been disabled');
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        form.setError('root', { message: error.error.message });
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="font-semibold text-destructive">⚠️ Warning</p>
            <p className="text-sm text-destructive/90 mt-1">
              Disabling 2FA will make your account less secure. This action will:
            </p>
            <ul className="text-sm text-destructive/90 mt-2 ml-4 list-disc">
              <li>Remove all configured 2FA methods</li>
              <li>Delete all backup codes</li>
              <li>Send a security alert to your email</li>
            </ul>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="password">Confirm your password</label>
              <input
                id="password"
                type="password"
                {...form.register('password')}
                autoComplete="current-password"
              />
              {form.formState.errors.password && (
                <p className="error">{form.formState.errors.password.message}</p>
              )}
            </div>

            {form.formState.errors.root && (
              <div className="alert alert-error">
                {form.formState.errors.root.message}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-outline flex-1">
                Cancel
              </button>
              <button
                type="submit"
                disabled={disable2FA.isPending}
                className="btn btn-destructive flex-1"
              >
                {disable2FA.isPending ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Complete Implementation Examples

### API Client Module

```typescript
// lib/api/client.ts
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(data.error || {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network or parsing errors
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      });
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const apiClient = new ApiClient(process.env.NEXT_PUBLIC_API_URL);
```

### Complete 2FA Settings Page

```tsx
// app/(dashboard)/settings/security/page.tsx
'use client';

import { useState } from 'react';
import { TwoFactorStatusDashboard } from '@/components/2fa/StatusDashboard';
import { TotpSetupModal } from '@/components/2fa/TotpSetupModal';
import { SmsSetupModal } from '@/components/2fa/SmsSetupModal';
import { Disable2FAModal } from '@/components/2fa/Disable2FAModal';
import { RegenerateBackupCodesModal } from '@/components/2fa/RegenerateBackupCodesModal';

export default function SecuritySettingsPage() {
  const [activeModal, setActiveModal] = useState<
    'totp' | 'sms' | 'disable' | 'regenerate' | null
  >(null);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <TwoFactorStatusDashboard />

      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={() => setActiveModal('totp')} className="btn btn-primary">
          Set Up Authenticator App
        </button>
        <button onClick={() => setActiveModal('sms')} className="btn btn-primary">
          Set Up SMS Verification
        </button>
        <button onClick={() => setActiveModal('regenerate')} className="btn btn-outline">
          Regenerate Backup Codes
        </button>
        <button onClick={() => setActiveModal('disable')} className="btn btn-destructive">
          Disable 2FA
        </button>
      </div>

      {/* Modals */}
      <TotpSetupModal
        open={activeModal === 'totp'}
        onClose={() => setActiveModal(null)}
      />
      <SmsSetupModal
        open={activeModal === 'sms'}
        onClose={() => setActiveModal(null)}
      />
      <Disable2FAModal
        open={activeModal === 'disable'}
        onClose={() => setActiveModal(null)}
      />
      <RegenerateBackupCodesModal
        open={activeModal === 'regenerate'}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}
```

---

## Edge Cases & Error Handling

### Edge Case Scenarios

#### 1. User Starts Setup But Doesn't Complete

**Problem:** User generates QR code but closes modal without verifying.

**Solution:**
- Backend keeps the pending secret in `two_factor_secret` field
- Next time user opens setup, backend detects existing secret
- Options:
  - Clear old secret and generate new one
  - Allow completing existing setup

**Implementation:**
```typescript
// In setup-totp endpoint
const existingSecret = user.two_factor_secret;
if (existingSecret && !user.two_factor_enabled) {
  // Clear old pending setup
  await prisma.user.update({
    where: { id: user.id },
    data: { two_factor_secret: null },
  });
}
// Continue with new setup...
```

#### 2. SMS Code Expires During Entry

**Problem:** User receives SMS but takes > 5 minutes to enter code.

**Solution:**
- Show countdown timer: "Code expires in 4:32"
- When expired, show "Code expired" error with "Request new code" button
- Backend rejects expired codes

**Implementation:**
```tsx
const [expiresAt, setExpiresAt] = useState<Date | null>(null);
const [timeRemaining, setTimeRemaining] = useState<number>(0);

useEffect(() => {
  if (!expiresAt) return;

  const interval = setInterval(() => {
    const remaining = Math.max(0, expiresAt.getTime() - Date.now());
    setTimeRemaining(remaining);

    if (remaining === 0) {
      clearInterval(interval);
      toast.error('Verification code expired. Please request a new code.');
    }
  }, 1000);

  return () => clearInterval(interval);
}, [expiresAt]);

// Display
{timeRemaining > 0 && (
  <p className="text-sm text-muted-foreground">
    Code expires in {Math.floor(timeRemaining / 60000)}:
    {String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, '0')}
  </p>
)}
```

#### 3. User Loses Backup Codes

**Problem:** User enabled 2FA but lost all backup codes and can't access authenticator.

**Solution:**
- Account recovery requires contacting support
- Support team can:
  1. Verify user identity (email, ID, etc.)
  2. Manually disable 2FA from admin panel
  3. User must re-enable 2FA immediately

**Frontend:** Show support contact info if user is locked out.

#### 4. Rate Limit During Setup

**Problem:** User requests too many SMS codes.

**Solution:**
- Display clear countdown timer
- Disable "Send Code" button during cooldown
- Show friendly message explaining limit

**Implementation:** See SMS Setup Flow example above.

#### 5. Network Error During Verification

**Problem:** User submits code but network fails.

**Solution:**
- Show retry button
- Code attempts are tracked server-side
- Don't penalize user for network failures
- Allow retrying with same code (if not expired)

```tsx
const handleVerify = async (code: string) => {
  try {
    await verifySetup.mutateAsync({ code });
  } catch (error) {
    if (error instanceof ApiError && error.error.code === 'NETWORK_ERROR') {
      // Show retry UI
      setShowRetry(true);
    }
  }
};
```

#### 6. Browser Autofill Interferes with Code Input

**Problem:** Browser tries to autofill verification code input.

**Solution:**
```tsx
<input
  type="text"
  inputMode="numeric"
  autoComplete="off" // Disable autofill
  autoCorrect="off"
  autoCapitalize="off"
  spellCheck="false"
  // Use "one-time-code" for iOS to enable SMS code autofill
  autoComplete="one-time-code"
/>
```

#### 7. User Has Multiple Tabs Open

**Problem:** User completes setup in one tab, other tab shows stale state.

**Solution:**
- React Query automatically refetches on window focus
- Show refresh button if state seems stale
- Use broadcast channel for cross-tab sync (advanced)

```typescript
// Enable refetch on window focus
queryClient.setDefaultOptions({
  queries: {
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
  },
});
```

---

## Testing Guide

### Unit Tests

```typescript
// __tests__/api/2fa.test.ts
import { describe, it, expect, vi } from 'vitest';
import { apiClient } from '@/lib/api/client';

describe('2FA API', () => {
  it('should fetch 2FA status successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { enabled: false },
      }),
    });

    const status = await apiClient.get('/api/auth/2fa/status');
    expect(status.success).toBe(true);
  });

  it('should handle unauthorized error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }),
    });

    await expect(apiClient.get('/api/auth/2fa/status')).rejects.toThrow();
  });
});
```

### Component Tests

```typescript
// __tests__/components/2fa/StatusDashboard.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TwoFactorStatusDashboard } from '@/components/2fa/StatusDashboard';

describe('TwoFactorStatusDashboard', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  it('should render loading state', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TwoFactorStatusDashboard />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('status-skeleton')).toBeInTheDocument();
  });

  it('should render enabled status', async () => {
    // Mock API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          enabled: true,
          availableMethods: {
            totp: { enabled: true },
            sms: { enabled: false },
          },
        },
      }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TwoFactorStatusDashboard />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Enabled')).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
// __tests__/flows/totp-setup.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { TotpSetupModal } from '@/components/2fa/TotpSetupModal';

const server = setupServer(
  rest.post('/api/auth/2fa/setup-totp', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        data: {
          qrCodeDataUrl: 'data:image/png;base64,ABC...',
          manualEntryKey: 'TESTKEY123',
        },
      })
    );
  }),

  rest.post('/api/auth/2fa/verify-setup', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        data: {
          enabled: true,
          method: 'TOTP',
          backupCodes: ['CODE1', 'CODE2'],
        },
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TOTP Setup Flow', () => {
  it('should complete full setup flow', async () => {
    const onClose = vi.fn();

    render(<TotpSetupModal open={true} onClose={onClose} />);

    // Step 1: Generate QR
    fireEvent.click(screen.getByText('Generate QR Code'));
    await waitFor(() => {
      expect(screen.getByText('Verify Your Setup')).toBeInTheDocument();
    });

    // Step 2: Enter code
    const codeInput = screen.getByPlaceholderText('000000');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Enable'));

    // Step 3: Backup codes
    await waitFor(() => {
      expect(screen.getByText('Save Your Backup Codes')).toBeInTheDocument();
    });

    // Confirm saved
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Finish Setup'));

    expect(onClose).toHaveBeenCalled();
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/2fa-setup.spec.ts
import { test, expect } from '@playwright/test';

test.describe('2FA Setup', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should set up TOTP successfully', async ({ page }) => {
    // Navigate to security settings
    await page.goto('/settings/security');

    // Click setup button
    await page.click('text=Set Up Authenticator App');

    // Generate QR code
    await page.click('text=Generate QR Code');
    await expect(page.locator('[alt="QR Code"]')).toBeVisible();

    // Enter verification code (use test code)
    await page.fill('[placeholder="000000"]', '123456');
    await page.click('text=Verify & Enable');

    // Save backup codes
    await expect(page.locator('text=Save Your Backup Codes')).toBeVisible();
    await page.click('text=Download');
    await page.check('text=I have saved');
    await page.click('text=Finish Setup');

    // Verify status updated
    await expect(page.locator('text=Enabled')).toBeVisible();
  });

  test('should handle invalid code', async ({ page }) => {
    await page.goto('/settings/security');
    await page.click('text=Set Up Authenticator App');
    await page.click('text=Generate QR Code');

    // Enter invalid code
    await page.fill('[placeholder="000000"]', '000000');
    await page.click('text=Verify & Enable');

    // Should show error
    await expect(page.locator('text=Invalid two-factor')).toBeVisible();
  });
});
```

---

## Security Best Practices

### 1. Never Log Sensitive Data

```typescript
// ❌ Bad
console.log('User entered code:', code);
console.log('Backup codes:', backupCodes);

// ✅ Good
console.log('Verification attempt for user');
// Don't log codes at all
```

### 2. Clear Sensitive State on Unmount

```typescript
useEffect(() => {
  return () => {
    // Clear backup codes from memory
    setBackupCodes([]);
    // Clear QR data
    setQrData(null);
  };
}, []);
```

### 3. Use HTTPS Only

```typescript
// Ensure API calls use HTTPS in production
const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://ops.yesgoddess.agency'
  : 'http://localhost:3000';
```

### 4. Validate on Client AND Server

```typescript
// Always validate client-side for UX
const isValid = phoneNumberSchema.safeParse(value).success;

// But NEVER skip server-side validation
// Server validation is the security boundary
```

### 5. Handle Password Inputs Securely

```tsx
<input
  type="password"
  autoComplete="current-password" // Help password managers
  name="password" // Unique name
  // Never set defaultValue for password
/>
```

### 6. Prevent Timing Attacks in UI

```typescript
// ❌ Bad - gives away information
if (error.code === 'TOTP_INVALID') {
  return 'Code is wrong';
}

// ✅ Good - generic message
if (error.code === 'TOTP_INVALID') {
  return 'Invalid verification code';
}
```

### 7. Rate Limit on Frontend Too

```typescript
// Prevent rapid-fire requests even before backend rejects
const [lastRequest, setLastRequest] = useState<number>(0);

const handleSubmit = () => {
  const now = Date.now();
  if (now - lastRequest < 1000) {
    toast.error('Please wait a moment before trying again');
    return;
  }
  setLastRequest(now);
  // Continue with request...
};
```

### 8. Use Content Security Policy

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: https:;",
          },
        ],
      },
    ];
  },
};
```

### 9. Sanitize Error Messages

```typescript
function sanitizeError(error: ApiError): string {
  // Never expose internal errors to users
  if (error.error.code === 'INTERNAL_SERVER_ERROR') {
    return 'Something went wrong. Please try again.';
  }
  
  // User-friendly errors are safe to show
  return error.error.message;
}
```

### 10. Implement CSP for Inline Styles

```tsx
// Avoid inline event handlers
// ❌ Bad
<button onClick="handleClick()">Click</button>

// ✅ Good
<button onClick={handleClick}>Click</button>
```

---

## Final Checklist

### Before Deploying to Production

- [ ] All API endpoints tested with real backend
- [ ] Error states handled gracefully
- [ ] Loading states prevent double-submissions
- [ ] Backup codes can be downloaded and printed
- [ ] QR codes render correctly on all devices
- [ ] Phone number validation works for international numbers
- [ ] Rate limiting UI shows accurate countdowns
- [ ] Password confirmation works
- [ ] Session expiry redirects to login
- [ ] Success/error toasts are user-friendly
- [ ] Accessibility tested with screen reader
- [ ] Mobile responsive on iOS and Android
- [ ] Works in all major browsers
- [ ] E2E tests pass
- [ ] Security review completed
- [ ] Documentation reviewed by frontend team

---

## Additional Resources

- **Backend API Docs:** [FRONTEND_INTEGRATION_2FA_SETUP_MANAGEMENT.md](./FRONTEND_INTEGRATION_2FA_SETUP_MANAGEMENT.md)
- **2FA Challenge Endpoints:** [FRONTEND_INTEGRATION_2FA_CHALLENGE_ENDPOINTS.md](./FRONTEND_INTEGRATION_2FA_CHALLENGE_ENDPOINTS.md)
- **Authentication Flow:** [FRONTEND_INTEGRATION_AUTHENTICATION.md](./FRONTEND_INTEGRATION_AUTHENTICATION.md)

---

## Support

For questions or issues:
- Backend Developer: Review implementation in `src/app/api/auth/2fa/`
- Slack: #backend-support
- Email: dev-team@yesgoddess.agency

---

**End of Part 2**
