# 🔒 Backup Code Generation - Frontend Integration Guide (Part 3 of 3)

**Module Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

---

## Table of Contents

### This Document (Part 3)
7. [Frontend Implementation Checklist](#frontend-implementation-checklist)
8. [UX Considerations & Best Practices](#ux-considerations--best-practices)
9. [Security Guidelines](#security-guidelines)
10. [Example React Components](#example-react-components)
11. [Testing Recommendations](#testing-recommendations)

---

## Frontend Implementation Checklist

### Phase 1: Core Display Components

- [ ] **Backup Code Status Display**
  - [ ] Show remaining backup code count
  - [ ] Color-coded status indicator (green/amber/red)
  - [ ] Warning badge when < 3 codes
  - [ ] Tooltip explaining what backup codes are
  
- [ ] **2FA Settings Dashboard**
  - [ ] Integrate backup code status into 2FA settings page
  - [ ] Display recommendations from API response
  - [ ] Show last regeneration date (if available)
  - [ ] Link to regenerate codes modal

- [ ] **Low Codes Warning Banner**
  - [ ] Dismissible banner on dashboard when < 3 codes
  - [ ] Clear call-to-action to regenerate
  - [ ] Explain consequences of running out

### Phase 2: Regeneration Flow

- [ ] **Password Confirmation Modal**
  - [ ] Password input with show/hide toggle
  - [ ] Clear explanation of why password is needed
  - [ ] Error handling for incorrect password
  - [ ] Loading state during API call

- [ ] **Backup Codes Display Modal**
  - [ ] Display all 10 codes in grid layout
  - [ ] Copy all codes button
  - [ ] Copy individual code buttons
  - [ ] Download as text file option
  - [ ] Print button
  - [ ] Prominent warning: "You won't see these again"
  - [ ] Checkbox: "I have saved these codes securely"
  - [ ] Cannot close modal until checkbox confirmed

- [ ] **Success Confirmation**
  - [ ] Confirmation message after codes saved
  - [ ] Updated backup code count display
  - [ ] Audit log entry (if showing activity)

### Phase 3: Login Flow Integration

- [ ] **Backup Code Login Option**
  - [ ] Link on 2FA verification page: "Use backup code instead"
  - [ ] Toggle between TOTP/SMS and backup code input
  - [ ] Clear instructions for backup code use

- [ ] **Backup Code Input Form**
  - [ ] Auto-format input (add dash automatically)
  - [ ] Remove whitespace and convert to uppercase
  - [ ] Visual validation feedback
  - [ ] Error messages for invalid codes
  - [ ] Remaining attempts indicator

- [ ] **Trust Device Option**
  - [ ] Checkbox to trust device for 30 days
  - [ ] Warning if device appears shared
  - [ ] Explanation of what trusting means

- [ ] **Post-Login Warning**
  - [ ] Show remaining backup codes after successful login
  - [ ] Prompt to regenerate if < 3 remaining
  - [ ] Link directly to regeneration flow

### Phase 4: API Client Layer

- [ ] **API Client Methods**
  - [ ] `getTwoFactorStatus()` - GET /api/auth/2fa/status
  - [ ] `regenerateBackupCodes(password)` - POST /api/auth/2fa/totp/backup-codes/regenerate
  - [ ] `verifyBackupCode(token, code, trustDevice)` - POST /api/auth/2fa/verify-backup-code

- [ ] **React Query Hooks**
  - [ ] `useTwoFactorStatus()` - Query hook with polling option
  - [ ] `useRegenerateBackupCodes()` - Mutation hook
  - [ ] `useVerifyBackupCode()` - Mutation hook for login

- [ ] **Error Handling**
  - [ ] Centralized error handler for backup code errors
  - [ ] User-friendly error messages
  - [ ] Retry logic for transient failures
  - [ ] Toast notifications for errors

- [ ] **Loading States**
  - [ ] Skeleton loaders for status
  - [ ] Button loading states
  - [ ] Disabled states during API calls

### Phase 5: Edge Cases

- [ ] **No 2FA Enabled**
  - [ ] Hide backup code section if 2FA not enabled
  - [ ] Show setup prompt instead

- [ ] **Zero Codes Remaining**
  - [ ] Critical alert styling
  - [ ] Cannot use backup code login (disable option)
  - [ ] Show support contact information

- [ ] **Network Errors**
  - [ ] Offline detection
  - [ ] Retry button
  - [ ] Clear error messages

- [ ] **Session Expiry**
  - [ ] Detect expired sessions during regeneration
  - [ ] Redirect to login
  - [ ] Preserve intent to regenerate codes

### Phase 6: Accessibility

- [ ] **Screen Reader Support**
  - [ ] ARIA labels on all interactive elements
  - [ ] Status announcements for backup code count changes
  - [ ] Error announcements

- [ ] **Keyboard Navigation**
  - [ ] Tab order logical throughout flows
  - [ ] Enter key submits forms
  - [ ] Escape key closes modals
  - [ ] Focus management when modals open/close

- [ ] **Visual Accessibility**
  - [ ] High contrast mode support
  - [ ] Color not sole indicator of status
  - [ ] Minimum text size 14px
  - [ ] Touch targets minimum 44x44px

---

## UX Considerations & Best Practices

### Initial Setup Flow

When user enables 2FA, automatically generate backup codes:

```typescript
// After TOTP setup completes
async function completeTotpSetup(totpCode: string) {
  const response = await api.verifyTotpSetup(totpCode);
  
  if (response.success) {
    // Backend automatically generates backup codes
    // Show them immediately
    showBackupCodesModal({
      codes: response.data.backupCodes,
      isInitialSetup: true,
      onConfirm: () => {
        // User confirms they've saved codes
        navigateToSecuritySettings();
      },
    });
  }
}
```

**Best Practices:**
- ✅ Force user to acknowledge codes before proceeding
- ✅ Provide multiple save options (download, print, copy)
- ✅ Emphasize one-time display
- ✅ Don't allow closing modal without confirmation

---

### Regeneration Flow

**User Journey:**
1. User clicks "Regenerate Backup Codes" button
2. Modal opens requesting password
3. User enters password and submits
4. Loading state while backend processes
5. New codes displayed prominently
6. User must confirm they've saved codes
7. Success message and updated status

**Example Wireframe Flow:**

```
┌─────────────────────────────────────┐
│  Security Settings                  │
│                                     │
│  Two-Factor Authentication          │
│  ✓ Enabled via Authenticator App    │
│                                     │
│  Backup Codes                       │
│  ⚠️ 2 codes remaining               │
│  ┌─────────────────────────────┐   │
│  │  Regenerate Backup Codes    │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
              ↓ Click
┌─────────────────────────────────────┐
│  Confirm Your Password              │
│                                     │
│  Enter your password to generate    │
│  new backup codes:                  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ••••••••••                  │   │
│  └─────────────────────────────┘   │
│                                     │
│  ⚠️ This will invalidate all        │
│     existing unused codes.          │
│                                     │
│  [ Cancel ]      [ Continue ]       │
└─────────────────────────────────────┘
              ↓ Submit
┌─────────────────────────────────────┐
│  Your New Backup Codes              │
│                                     │
│  ⚠️ IMPORTANT: Save these codes     │
│     in a secure location. You will  │
│     not be able to view them again. │
│                                     │
│  ┌─────┬─────┬─────┬─────┬─────┐   │
│  │ABCD-│EFGH-│IJKL-│MNOP-│QRST-│   │
│  │1234 │5678 │9012 │3456 │7890 │   │
│  ├─────┼─────┼─────┼─────┼─────┤   │
│  │UVWX-│YZAB-│CDEF-│GHIJ-│KLMN-│   │
│  │1234 │5678 │9012 │3456 │7890 │   │
│  └─────┴─────┴─────┴─────┴─────┘   │
│                                     │
│  [ Copy All ] [ Download ] [ Print ]│
│                                     │
│  ☐ I have saved these codes securely│
│                                     │
│  [ Done ] (disabled until checked)  │
└─────────────────────────────────────┘
```

---

### Login with Backup Code

**User Journey:**
1. User attempts login (Step 1) → Prompted for 2FA
2. User clicks "Use backup code instead"
3. Input switches to backup code entry
4. User enters backup code
5. Optional: Trust this device checkbox
6. Submit → Authenticated

**Best Practices:**
- ✅ Make backup code option easy to find
- ✅ Show remaining codes after successful login
- ✅ Prompt to regenerate if low
- ✅ Clear instructions on format

**Example Implementation:**

```typescript
function TwoFactorVerification({ temporaryToken, onSuccess }) {
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  
  return (
    <div>
      {mode === 'totp' ? (
        <>
          <TotpInput onSubmit={handleTotpSubmit} />
          <button onClick={() => setMode('backup')}>
            Lost access to your authenticator? Use a backup code
          </button>
        </>
      ) : (
        <>
          <BackupCodeInput 
            onSubmit={handleBackupCodeSubmit}
            temporaryToken={temporaryToken}
          />
          <button onClick={() => setMode('totp')}>
            Back to authenticator code
          </button>
        </>
      )}
    </div>
  );
}
```

---

### Status Indicators

**Visual Hierarchy:**

```typescript
// Status indicator component
function BackupCodeStatusBadge({ remaining }: { remaining: number }) {
  if (remaining >= 3) {
    return (
      <Badge variant="success">
        <Check className="w-4 h-4" />
        {remaining} backup codes
      </Badge>
    );
  }
  
  if (remaining > 0) {
    return (
      <Badge variant="warning">
        <AlertTriangle className="w-4 h-4" />
        Only {remaining} backup codes remaining
      </Badge>
    );
  }
  
  return (
    <Badge variant="danger">
      <XCircle className="w-4 h-4" />
      No backup codes remaining
    </Badge>
  );
}
```

---

### Copy and Download Utilities

```typescript
// Copy all codes to clipboard
async function copyBackupCodes(codes: string[]): Promise<void> {
  const text = codes.join('\n');
  
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Backup codes copied to clipboard');
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    toast.success('Backup codes copied to clipboard');
  }
}

// Download codes as text file
function downloadBackupCodes(codes: string[]): void {
  const text = `YesGoddess Backup Codes
Generated: ${new Date().toLocaleString()}

IMPORTANT: Store these codes in a secure location.
Each code can only be used once.

${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

---
If you lose access to your authenticator app, use one of these
codes to log in and regenerate new codes.
`;

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yesgoddess-backup-codes-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  toast.success('Backup codes downloaded');
}

// Print codes
function printBackupCodes(codes: string[]): void {
  const printWindow = window.open('', '', 'width=800,height=600');
  
  if (!printWindow) {
    toast.error('Please allow popups to print backup codes');
    return;
  }
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>YesGoddess Backup Codes</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          padding: 40px;
          max-width: 600px;
          margin: 0 auto;
        }
        h1 { font-size: 24px; margin-bottom: 20px; }
        .warning {
          background: #fef3c7;
          padding: 15px;
          border-left: 4px solid #f59e0b;
          margin: 20px 0;
        }
        .codes {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin: 20px 0;
        }
        .code {
          font-family: monospace;
          font-size: 16px;
          padding: 10px;
          border: 1px solid #ccc;
          text-align: center;
        }
        .footer {
          margin-top: 40px;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <h1>YesGoddess Backup Codes</h1>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      
      <div class="warning">
        <strong>⚠️ IMPORTANT:</strong> Store these codes in a secure location.
        Each code can only be used once.
      </div>
      
      <div class="codes">
        ${codes.map((code, i) => `
          <div class="code">${i + 1}. ${code}</div>
        `).join('')}
      </div>
      
      <div class="footer">
        <p>If you lose access to your authenticator app, use one of these
        codes to log in and regenerate new codes.</p>
        <p>Keep these codes secure and do not share them with anyone.</p>
      </div>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  printWindow.focus();
  
  // Wait for content to load before printing
  printWindow.onload = () => {
    printWindow.print();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };
}
```

---

## Security Guidelines

### Client-Side Security

**DO:**
- ✅ Clear backup codes from memory after display
- ✅ Warn users about insecure storage (screenshots, notes apps)
- ✅ Implement client-side rate limiting as a backup
- ✅ Use HTTPS exclusively for all API calls
- ✅ Validate input format before sending to backend
- ✅ Log security events to analytics (anonymized)

**DON'T:**
- ❌ Store backup codes in localStorage/sessionStorage
- ❌ Log backup codes to console
- ❌ Send codes in URL parameters or query strings
- ❌ Auto-fill backup code inputs
- ❌ Cache API responses containing codes
- ❌ Allow code selection in password managers

### Secure Code Display

```typescript
// Secure backup codes display component
function SecureBackupCodesDisplay({ 
  codes, 
  onConfirmSaved 
}: { 
  codes: string[]; 
  onConfirmSaved: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [visible, setVisible] = useState(true);
  
  // Clear codes from memory when component unmounts
  useEffect(() => {
    return () => {
      // Overwrite codes in memory
      codes.fill('XXXX-XXXX');
    };
  }, []);
  
  // Warn on page unload if not confirmed
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!confirmed) {
        e.preventDefault();
        e.returnValue = 'You have not confirmed saving your backup codes. Are you sure you want to leave?';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [confirmed]);
  
  return (
    <div className="secure-codes-container">
      {visible && (
        <div className="codes-grid">
          {codes.map((code, index) => (
            <CodeDisplay key={index} code={code} />
          ))}
        </div>
      )}
      
      <div className="actions">
        <button onClick={() => copyBackupCodes(codes)}>
          Copy All
        </button>
        <button onClick={() => downloadBackupCodes(codes)}>
          Download
        </button>
        <button onClick={() => printBackupCodes(codes)}>
          Print
        </button>
      </div>
      
      <Checkbox
        checked={confirmed}
        onCheckedChange={setConfirmed}
        label="I have saved these codes in a secure location"
      />
      
      <button
        disabled={!confirmed}
        onClick={() => {
          setVisible(false);
          onConfirmSaved();
        }}
      >
        Done
      </button>
    </div>
  );
}
```

---

### Password Input Security

```typescript
// Secure password input for regeneration
function PasswordConfirmationInput({ 
  onSubmit 
}: { 
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) return;
    
    setIsSubmitting(true);
    
    try {
      await onSubmit(password);
    } finally {
      // Clear password from memory
      setPassword('');
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} autoComplete="off">
      <div className="password-input-group">
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          autoFocus
          disabled={isSubmitting}
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </button>
      </div>
      
      <button type="submit" disabled={!password || isSubmitting}>
        {isSubmitting ? 'Generating...' : 'Generate New Codes'}
      </button>
    </form>
  );
}
```

---

## Example React Components

### Complete Backup Codes Management Component

```typescript
'use client';

import { useState } from 'react';
import { useTwoFactorStatus, useRegenerateBackupCodes } from '@/hooks/use-backup-codes';

export function BackupCodesSection() {
  const { data: status, isLoading } = useTwoFactorStatus();
  const regenerate = useRegenerateBackupCodes();
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCodesModal, setShowCodesModal] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  
  if (isLoading) {
    return <SkeletonLoader />;
  }
  
  if (!status?.data.enabled) {
    return (
      <div className="info-box">
        <p>Enable two-factor authentication to access backup codes.</p>
      </div>
    );
  }
  
  const { backupCodes } = status.data;
  const state = getBackupCodeState(backupCodes.remaining);
  
  const handleRegenerate = async (password: string) => {
    try {
      const result = await regenerate.mutateAsync({ password });
      setNewCodes(result.data.backupCodes);
      setShowPasswordModal(false);
      setShowCodesModal(true);
    } catch (error) {
      // Error handled by mutation
    }
  };
  
  return (
    <div className="backup-codes-section">
      <div className="section-header">
        <h3>Backup Codes</h3>
        <BackupCodeStatusBadge remaining={backupCodes.remaining} />
      </div>
      
      <p className="description">
        Backup codes allow you to access your account if you lose your
        authenticator device. Each code can only be used once.
      </p>
      
      {state.status !== 'healthy' && (
        <Alert variant={state.status === 'depleted' ? 'error' : 'warning'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {state.status === 'depleted' 
              ? 'No backup codes remaining' 
              : 'Low backup codes'}
          </AlertTitle>
          <AlertDescription>
            {state.status === 'depleted'
              ? 'Generate new backup codes immediately to prevent account lockout.'
              : `You have ${backupCodes.remaining} backup codes remaining. Consider regenerating them.`}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="actions">
        <button
          onClick={() => setShowPasswordModal(true)}
          className="btn-primary"
        >
          Regenerate Backup Codes
        </button>
      </div>
      
      {/* Password Confirmation Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Confirm Your Password"
      >
        <PasswordConfirmationInput
          onSubmit={handleRegenerate}
          onCancel={() => setShowPasswordModal(false)}
          isLoading={regenerate.isPending}
        />
      </Modal>
      
      {/* Backup Codes Display Modal */}
      <Modal
        isOpen={showCodesModal}
        onClose={() => {}} // Prevent closing without confirmation
        title="Your New Backup Codes"
        size="large"
      >
        <SecureBackupCodesDisplay
          codes={newCodes}
          onConfirmSaved={() => {
            setShowCodesModal(false);
            setNewCodes([]);
          }}
        />
      </Modal>
    </div>
  );
}
```

---

### Backup Code Login Component

```typescript
'use client';

import { useState } from 'react';
import { useVerifyBackupCode } from '@/hooks/use-backup-codes';

export function BackupCodeLoginForm({ 
  temporaryToken,
  onSuccess 
}: {
  temporaryToken: string;
  onSuccess: (session: SessionData) => void;
}) {
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const verify = useVerifyBackupCode();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await verify.mutateAsync({
        temporaryToken,
        code,
        trustDevice,
      });
      
      // Show warning if low codes
      if (result.data.warning) {
        toast.warning(result.data.warning, {
          duration: 10000,
          action: {
            label: 'Regenerate Now',
            onClick: () => {
              // Navigate to security settings
              window.location.href = '/dashboard/security';
            },
          },
        });
      }
      
      onSuccess(result.data.session);
    } catch (error) {
      // Error handled by mutation
    }
  };
  
  const formatBackupCode = (input: string): string => {
    // Remove all non-alphanumeric characters
    const cleaned = input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    
    // Add dash after 4 characters
    if (cleaned.length > 4) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
    }
    
    return cleaned;
  };
  
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatBackupCode(e.target.value);
    setCode(formatted);
  };
  
  return (
    <form onSubmit={handleSubmit} className="backup-code-login-form">
      <div className="form-group">
        <label htmlFor="backup-code">Backup Code</label>
        <input
          id="backup-code"
          type="text"
          value={code}
          onChange={handleCodeChange}
          placeholder="XXXX-XXXX"
          maxLength={9}
          autoComplete="off"
          autoFocus
          disabled={verify.isPending}
          className="backup-code-input"
        />
        <p className="help-text">
          Enter one of your backup codes (format: XXXX-XXXX)
        </p>
      </div>
      
      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            disabled={verify.isPending}
          />
          <span>Trust this device for 30 days</span>
        </label>
        <p className="help-text">
          Skip 2FA on this device until{' '}
          {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
        </p>
      </div>
      
      {verify.isError && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {verify.error.error.code === 'BACKUP_CODE_INVALID'
              ? 'Invalid backup code. Please check and try again.'
              : verify.error.error.message}
          </AlertDescription>
        </Alert>
      )}
      
      <button
        type="submit"
        disabled={code.length !== 9 || verify.isPending}
        className="btn-primary w-full"
      >
        {verify.isPending ? 'Verifying...' : 'Verify Backup Code'}
      </button>
      
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-600">
          Each backup code can only be used once.
        </p>
      </div>
    </form>
  );
}
```

---

## Testing Recommendations

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeBackupCode, validateBackupCode } from '@/lib/backup-codes';

describe('Backup Code Utilities', () => {
  describe('normalizeBackupCode', () => {
    it('should convert lowercase to uppercase', () => {
      expect(normalizeBackupCode('abcd-1234')).toBe('ABCD-1234');
    });
    
    it('should remove whitespace', () => {
      expect(normalizeBackupCode('ABCD 1234')).toBe('ABCD-1234');
    });
    
    it('should add dash if missing', () => {
      expect(normalizeBackupCode('ABCD1234')).toBe('ABCD-1234');
    });
    
    it('should handle already formatted codes', () => {
      expect(normalizeBackupCode('ABCD-1234')).toBe('ABCD-1234');
    });
  });
  
  describe('validateBackupCode', () => {
    it('should accept valid codes', () => {
      const result = validateBackupCode('ABCD-1234');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
    
    it('should reject codes that are too short', () => {
      const result = validateBackupCode('ABC-123');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('8 characters');
    });
    
    it('should reject codes with invalid characters', () => {
      const result = validateBackupCode('ABCD-123@');
      expect(result.isValid).toBe(false);
    });
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupCodesSection } from '@/components/backup-codes-section';

describe('BackupCodesSection', () => {
  beforeEach(() => {
    // Mock API responses
  });
  
  it('should display backup code count', async () => {
    render(<BackupCodesSection />);
    
    await waitFor(() => {
      expect(screen.getByText(/2 backup codes remaining/i)).toBeInTheDocument();
    });
  });
  
  it('should show warning when codes are low', async () => {
    render(<BackupCodesSection />);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/low backup codes/i)).toBeInTheDocument();
    });
  });
  
  it('should regenerate codes with password', async () => {
    const user = userEvent.setup();
    render(<BackupCodesSection />);
    
    // Click regenerate button
    await user.click(screen.getByText(/regenerate backup codes/i));
    
    // Enter password
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    await user.type(passwordInput, 'MyPassword123!');
    
    // Submit
    await user.click(screen.getByText(/generate new codes/i));
    
    // Verify codes displayed
    await waitFor(() => {
      expect(screen.getByText(/your new backup codes/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('Backup Code Generation Flow', () => {
  test('should regenerate backup codes successfully', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    
    // Navigate to security settings
    await page.goto('/dashboard/security');
    
    // Click regenerate
    await page.click('text=Regenerate Backup Codes');
    
    // Enter password
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('text=Generate New Codes');
    
    // Verify codes displayed
    await expect(page.locator('text=Your New Backup Codes')).toBeVisible();
    
    // Count codes
    const codes = await page.locator('.backup-code').count();
    expect(codes).toBe(10);
    
    // Confirm saved
    await page.check('text=I have saved these codes securely');
    await page.click('text=Done');
    
    // Verify success
    await expect(page.locator('text=10 backup codes')).toBeVisible();
  });
  
  test('should login with backup code', async ({ page }) => {
    // Initiate login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    
    // Switch to backup code
    await page.click('text=Use backup code instead');
    
    // Enter backup code
    await page.fill('input[placeholder="XXXX-XXXX"]', 'ABCD-1234');
    await page.click('button[type="submit"]');
    
    // Verify logged in
    await expect(page).toHaveURL('/dashboard');
  });
});
```

---

## Summary

This completes the comprehensive frontend integration guide for the Backup Code Generation module. The implementation includes:

✅ **Complete API documentation** with TypeScript types  
✅ **Business logic and validation rules** for all scenarios  
✅ **Comprehensive error handling** with user-friendly messages  
✅ **Security best practices** for sensitive data handling  
✅ **Production-ready React components** with accessibility  
✅ **Testing strategies** at unit, integration, and E2E levels  

### Quick Reference Links

- **Part 1:** API Endpoints & Type Definitions
- **Part 2:** Business Logic, Errors, Authorization, Rate Limits
- **Part 3:** Implementation Checklist, UX, Security, Examples

### Support

For questions or clarifications about this integration:
- Review backend implementation in `src/app/api/auth/2fa/`
- Check audit logs for debugging: `BACKUP_CODE_*` actions
- Consult related docs: `BACKUP_CODE_ALERT_IMPLEMENTATION.md`

---

**Last Updated:** October 19, 2025  
**API Version:** v1.0  
**Frontend Framework:** React 18+ / Next.js 15+  
**Type Safety:** TypeScript 5.0+

