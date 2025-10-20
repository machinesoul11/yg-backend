# 🔐 Frontend Integration Guide: TOTP Two-Factor Authentication (Part 2)

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** TOTP (Time-based One-Time Password) Authentication  
**Backend Deployment:** ops.yesgoddess.agency  
**Last Updated:** October 19, 2025

---

## 📋 Table of Contents

### Part 2 (This Document)
5. [Error Handling](#5-error-handling)
6. [Authorization & Permissions](#6-authorization--permissions)
7. [Rate Limiting & Quotas](#7-rate-limiting--quotas)
8. [Frontend Implementation Guide](#8-frontend-implementation-guide)
9. [UX Best Practices](#9-ux-best-practices)
10. [Testing Checklist](#10-testing-checklist)

### Part 1 (See FRONTEND_INTEGRATION_TOTP_PART_1.md)
1. Overview
2. API Endpoints
3. TypeScript Type Definitions
4. Business Logic & Validation Rules

---

## 5. Error Handling

### 5.1 Error Response Format

All TOTP endpoints return errors in tRPC format:

```typescript
interface TRPCError {
  code: string;           // tRPC error code
  message: string;        // User-friendly error message
  cause?: {
    code: string;         // Backend-specific error code
    statusCode: number;   // HTTP status code
  }
}
```

### 5.2 TOTP-Specific Error Codes

| Error Code | HTTP Status | Message | When It Occurs | Frontend Action |
|-----------|-------------|---------|----------------|----------------|
| `TOTP_ALREADY_ENABLED` | 400 | Two-factor authentication is already enabled | User tries to initiate setup when 2FA already active | Hide setup button, show "2FA Enabled" status |
| `TOTP_NOT_ENABLED` | 400 | Two-factor authentication is not enabled | User tries to disable/verify when 2FA not active | Redirect to settings, show error |
| `TOTP_SETUP_REQUIRED` | 400 | Two-factor authentication setup required | User tries to confirm without initiating setup | Restart setup flow from beginning |
| `TOTP_INVALID` | 401 | Invalid two-factor authentication code | User enters wrong TOTP code | Show error inline, allow retry with countdown |
| `BACKUP_CODE_INVALID` | 401 | Invalid backup code | User enters wrong backup code | Show error inline, allow retry |
| `BACKUP_CODE_ALREADY_USED` | 400 | This backup code has already been used | User tries to reuse a backup code | Show error, suggest using different code |
| `NO_BACKUP_CODES_REMAINING` | 400 | No backup codes remaining. Please contact support. | User has used all backup codes | Show support contact, disable backup code option |
| `INVALID_CURRENT_PASSWORD` | 401 | Current password is incorrect | Wrong password during disable/regenerate | Show error on password field, allow retry |
| `UNAUTHORIZED` | 401 | Authentication required | Session expired or invalid | Redirect to login |

### 5.3 Error Handling Examples

#### Setup Already Enabled

```typescript
try {
  await trpc.auth.totpSetup.mutate();
} catch (error) {
  if (error.cause?.code === 'TOTP_ALREADY_ENABLED') {
    // Show message: "Two-factor authentication is already enabled"
    // Redirect to 2FA management page
    router.push('/settings/security');
  }
}
```

#### Invalid TOTP Code

```typescript
try {
  await trpc.auth.totpConfirm.mutate({ code });
} catch (error) {
  if (error.cause?.code === 'TOTP_INVALID') {
    // Show inline error near code input
    setError('The code you entered is invalid or expired. Please try again.');
    
    // Keep form open, allow user to retry
    // Show remaining time in current window
    setCodeValue(''); // Clear input
    inputRef.current?.focus(); // Refocus input
  }
}
```

#### Invalid Password

```typescript
try {
  await trpc.auth.totpDisable.mutate({ password });
} catch (error) {
  if (error.cause?.code === 'INVALID_CURRENT_PASSWORD') {
    // Show error on password field
    setPasswordError('Incorrect password');
    passwordRef.current?.focus();
    
    // Don't close modal
    // Allow user to retry
  }
}
```

#### Backup Code Already Used

```typescript
try {
  await trpc.auth.backupCodeVerify.mutate({ code });
} catch (error) {
  if (error.cause?.code === 'BACKUP_CODE_ALREADY_USED') {
    setError('This backup code has already been used. Please try a different code.');
    
    // Suggest viewing remaining codes
    setShowRemainingCodesHint(true);
  } else if (error.cause?.code === 'NO_BACKUP_CODES_REMAINING') {
    // Critical state - user is locked out
    setError('You have no backup codes remaining. Please contact support.');
    setShowSupportContact(true);
  }
}
```

### 5.4 User-Friendly Error Messages

Don't show raw error codes to users. Map to friendly messages:

```typescript
const TOTP_ERROR_MESSAGES: Record<string, string> = {
  TOTP_ALREADY_ENABLED: "You already have two-factor authentication enabled.",
  TOTP_NOT_ENABLED: "Two-factor authentication is not currently enabled.",
  TOTP_SETUP_REQUIRED: "Please start the setup process first.",
  TOTP_INVALID: "The code you entered is incorrect or has expired. Please try again.",
  BACKUP_CODE_INVALID: "This backup code is invalid. Please check and try again.",
  BACKUP_CODE_ALREADY_USED: "This backup code has already been used.",
  NO_BACKUP_CODES_REMAINING: "You have no backup codes remaining. Please contact our support team.",
  INVALID_CURRENT_PASSWORD: "The password you entered is incorrect.",
  UNAUTHORIZED: "Your session has expired. Please log in again.",
};

function getErrorMessage(errorCode: string): string {
  return TOTP_ERROR_MESSAGES[errorCode] || "An unexpected error occurred. Please try again.";
}
```

### 5.5 Generic Error Handling

```typescript
async function handleTotpOperation(operation: () => Promise<any>) {
  try {
    return await operation();
  } catch (error) {
    // Check if it's a known error
    if (error.cause?.code) {
      const message = getErrorMessage(error.cause.code);
      toast.error(message);
      return null;
    }
    
    // Unknown error
    console.error('TOTP operation failed:', error);
    toast.error('Something went wrong. Please try again.');
    
    // Report to error tracking (Sentry, etc.)
    reportError(error);
    return null;
  }
}
```

---

## 6. Authorization & Permissions

### 6.1 Endpoint Access Control

| Endpoint | Required Auth | Required Role | Additional Requirements |
|----------|--------------|---------------|------------------------|
| `totpSetup` | ✅ Yes | Any authenticated user | 2FA must NOT be enabled |
| `totpConfirm` | ✅ Yes | Any authenticated user | Setup must be initiated first |
| `totpVerify` | ✅ Yes (partial) | Any authenticated user | Called during login flow |
| `backupCodeVerify` | ✅ Yes (partial) | Any authenticated user | Called during login flow |
| `totpDisable` | ✅ Yes | Any authenticated user | Password verification required |
| `backupCodesRegenerate` | ✅ Yes | Any authenticated user | Password verification required, 2FA must be enabled |
| `totpStatus` | ✅ Yes | Any authenticated user | None |

**Notes:**
- **"Partial Auth"**: Intermediate session state during login (after password, before 2FA)
- **Role-Independent**: All authenticated users can use TOTP regardless of role (ADMIN, CREATOR, BRAND)
- **Self-Service Only**: Users can only manage their own 2FA settings (no admin override in this module)

### 6.2 Field-Level Permissions

All TOTP operations are scoped to the authenticated user:

```typescript
// Backend automatically uses session.user.id
// No way to manage other users' 2FA through these endpoints

// ❌ WRONG - Cannot specify different user
await trpc.auth.totpSetup.mutate({ userId: 'other-user-id' });

// ✅ CORRECT - Always operates on current user
await trpc.auth.totpSetup.mutate();
```

### 6.3 Admin 2FA Management

> **Important:** For admin operations (view all users' 2FA status, force disable, etc.), use the separate Admin 2FA Management endpoints (see `ADMIN_2FA_MANAGEMENT_IMPLEMENTATION.md`).

This module provides **self-service only**:
- Users enable their own 2FA
- Users disable their own 2FA
- Users regenerate their own backup codes

---

## 7. Rate Limiting & Quotas

### 7.1 Rate Limits

| Operation | Rate Limit | Window | Scope | Headers |
|-----------|-----------|--------|-------|---------|
| TOTP Code Verification | No explicit limit* | N/A | Per user | None |
| Backup Code Verification | No explicit limit* | N/A | Per user | None |
| Setup Initiation | No explicit limit | N/A | Per user | None |
| Backup Code Regeneration | No explicit limit | N/A | Per user | None |

**\*Note on Verification Limits:**
- Backend logs all failed verification attempts
- Excessive failures trigger security alerts to admins
- Account lockout may occur at system level (handled by account lockout service)
- Frontend should implement client-side rate limiting for UX

### 7.2 Frontend-Side Rate Limiting

Even though backend doesn't enforce hard limits, implement sensible UX rate limiting:

```typescript
// Example: Debounce code verification
const [isVerifying, setIsVerifying] = useState(false);
const [cooldownSeconds, setCooldownSeconds] = useState(0);

async function verifyCode(code: string) {
  if (isVerifying) return; // Prevent double submission
  if (cooldownSeconds > 0) return; // Cooldown active
  
  setIsVerifying(true);
  
  try {
    await trpc.auth.totpConfirm.mutate({ code });
    // Success
  } catch (error) {
    // Failed - start cooldown
    setCooldownSeconds(3);
    
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  } finally {
    setIsVerifying(false);
  }
}
```

### 7.3 Quotas & Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| **Backup Codes** | 10 per user | Generated during setup/regeneration |
| **TOTP Secrets** | 1 per user | Replaced if setup restarted |
| **Concurrent Setups** | 1 per user | Previous incomplete setup is overwritten |
| **Time Window Tolerance** | ±30 seconds | 3 valid windows total (prev, current, next) |

---

## 8. Frontend Implementation Guide

### 8.1 Setup Flow Implementation

#### Step 1: Check 2FA Status

```typescript
// On settings page load
const { data: status } = trpc.auth.totpStatus.useQuery();

if (status?.data.enabled) {
  // Show "2FA Enabled" UI with disable button
  return <TwoFactorEnabled status={status.data} />;
} else {
  // Show "Enable 2FA" button
  return <EnableTwoFactorButton />;
}
```

#### Step 2: Initiate Setup

```typescript
const [setupData, setSetupData] = useState<TotpSetupData | null>(null);
const setupMutation = trpc.auth.totpSetup.useMutation();

async function handleEnableTwoFactor() {
  const result = await setupMutation.mutateAsync();
  
  if (result.success) {
    setSetupData(result.data);
    // Show QR code modal
    setShowSetupModal(true);
  }
}

return (
  <button onClick={handleEnableTwoFactor} disabled={setupMutation.isLoading}>
    {setupMutation.isLoading ? 'Preparing...' : 'Enable Two-Factor Authentication'}
  </button>
);
```

#### Step 3: Display QR Code

```tsx
function TotpSetupModal({ setupData }: { setupData: TotpSetupData }) {
  const [code, setCode] = useState('');
  const confirmMutation = trpc.auth.totpConfirm.useMutation();
  
  async function handleVerifyCode() {
    try {
      const result = await confirmMutation.mutateAsync({ code });
      
      if (result.success) {
        // Show backup codes modal
        setBackupCodes(result.data.backupCodes);
        setShowBackupCodesModal(true);
      }
    } catch (error) {
      // Handle error (see section 5.3)
    }
  }
  
  return (
    <Modal>
      <h2>Set Up Two-Factor Authentication</h2>
      
      {/* Step 1: Scan QR Code */}
      <div>
        <p>Scan this QR code with your authenticator app:</p>
        <img src={setupData.qrCodeDataUrl} alt="QR Code" />
      </div>
      
      {/* Alternative: Manual Entry */}
      <details>
        <summary>Can't scan? Enter manually</summary>
        <code>{setupData.manualEntryKey}</code>
        <button onClick={() => navigator.clipboard.writeText(setupData.manualEntryKey.replace(/\s/g, ''))}>
          Copy Code
        </button>
      </details>
      
      {/* Step 2: Verify Code */}
      <div>
        <label>Enter 6-digit code from your app:</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          pattern="[0-9]*"
          inputMode="numeric"
          placeholder="123456"
        />
        <button 
          onClick={handleVerifyCode}
          disabled={code.length !== 6 || confirmMutation.isLoading}
        >
          Verify and Enable
        </button>
      </div>
      
      {/* Show countdown timer */}
      <TotpCountdown />
    </Modal>
  );
}
```

#### Step 4: Display Backup Codes (Critical!)

```tsx
function BackupCodesModal({ codes }: { codes: string[] }) {
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  
  function handleDownload() {
    const content = codes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yesgoddess-backup-codes.txt';
    a.click();
  }
  
  function handleCopy() {
    navigator.clipboard.writeText(codes.join('\n'));
    toast.success('Backup codes copied to clipboard');
  }
  
  return (
    <Modal closable={hasAcknowledged}>
      <div className="backup-codes-modal">
        <h2>⚠️ Save Your Backup Codes</h2>
        <p className="warning">
          These codes can only be shown ONCE. Save them in a secure location.
        </p>
        
        <div className="codes-container">
          {codes.map((code, index) => (
            <code key={index}>{code}</code>
          ))}
        </div>
        
        <div className="actions">
          <button onClick={handleDownload}>
            📥 Download Codes
          </button>
          <button onClick={handleCopy}>
            📋 Copy to Clipboard
          </button>
        </div>
        
        <label className="acknowledgment">
          <input
            type="checkbox"
            checked={hasAcknowledged}
            onChange={(e) => setHasAcknowledged(e.target.checked)}
          />
          I have saved these backup codes in a secure location
        </label>
        
        <button
          onClick={() => router.push('/settings/security')}
          disabled={!hasAcknowledged}
          className="primary"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
```

### 8.2 Login Flow Implementation

#### Show 2FA Prompt After Password Success

```tsx
function LoginForm() {
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [showBackupCodeInput, setShowBackupCodeInput] = useState(false);
  
  async function handlePasswordSubmit(email: string, password: string) {
    const result = await loginMutation.mutateAsync({ email, password });
    
    if (result.data.user.two_factor_enabled) {
      // User has 2FA enabled - show TOTP prompt
      setStep('totp');
    } else {
      // No 2FA - login complete
      router.push('/dashboard');
    }
  }
  
  if (step === 'totp') {
    return (
      <TwoFactorVerification
        onUseBackupCode={() => setShowBackupCodeInput(true)}
        showBackupCode={showBackupCodeInput}
      />
    );
  }
  
  return <PasswordInput onSubmit={handlePasswordSubmit} />;
}
```

#### TOTP Verification Component

```tsx
function TwoFactorVerification({ 
  onUseBackupCode,
  showBackupCode 
}: {
  onUseBackupCode: () => void;
  showBackupCode: boolean;
}) {
  const [code, setCode] = useState('');
  const verifyMutation = trpc.auth.totpVerify.useMutation();
  const backupVerifyMutation = trpc.auth.backupCodeVerify.useMutation();
  
  async function handleVerifyTotp() {
    try {
      await verifyMutation.mutateAsync({ code });
      // Success - user is now logged in
      router.push('/dashboard');
    } catch (error) {
      // Show error (see section 5.3)
    }
  }
  
  async function handleVerifyBackupCode() {
    try {
      await backupVerifyMutation.mutateAsync({ code });
      // Success
      router.push('/dashboard');
    } catch (error) {
      // Show error
    }
  }
  
  if (showBackupCode) {
    return (
      <div>
        <h2>Enter Backup Code</h2>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          maxLength={9}
        />
        <button onClick={handleVerifyBackupCode}>
          Verify Backup Code
        </button>
        <button onClick={() => setShowBackupCode(false)}>
          Use Authenticator App Instead
        </button>
      </div>
    );
  }
  
  return (
    <div>
      <h2>Two-Factor Authentication</h2>
      <p>Enter the 6-digit code from your authenticator app</p>
      
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={6}
        pattern="[0-9]*"
        inputMode="numeric"
        placeholder="123456"
        autoFocus
      />
      
      <button 
        onClick={handleVerifyTotp}
        disabled={code.length !== 6}
      >
        Verify
      </button>
      
      <button onClick={onUseBackupCode} className="secondary">
        Lost access to authenticator?
      </button>
      
      <TotpCountdown />
    </div>
  );
}
```

### 8.3 Countdown Timer Component

```tsx
function TotpCountdown() {
  const [timeRemaining, setTimeRemaining] = useState(30);
  
  useEffect(() => {
    // Calculate remaining time in current 30s window
    function updateTime() {
      const now = Date.now();
      const step = 30000; // 30 seconds in milliseconds
      const remaining = step - (now % step);
      setTimeRemaining(Math.floor(remaining / 1000));
    }
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const percentage = (timeRemaining / 30) * 100;
  
  return (
    <div className="totp-countdown">
      <div className="countdown-bar" style={{ width: `${percentage}%` }} />
      <span>Code refreshes in {timeRemaining}s</span>
    </div>
  );
}
```

### 8.4 Disable 2FA Implementation

```tsx
function DisableTwoFactor() {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const disableMutation = trpc.auth.totpDisable.useMutation();
  
  async function handleDisable() {
    try {
      await disableMutation.mutateAsync({ 
        password,
        code: code || undefined // Optional
      });
      
      toast.success('Two-factor authentication has been disabled');
      router.push('/settings/security');
    } catch (error) {
      // Handle error
    }
  }
  
  if (!showConfirm) {
    return (
      <button onClick={() => setShowConfirm(true)} className="danger">
        Disable Two-Factor Authentication
      </button>
    );
  }
  
  return (
    <Modal onClose={() => setShowConfirm(false)}>
      <h2>⚠️ Disable Two-Factor Authentication?</h2>
      <p className="warning">
        Your account will be less secure without 2FA. Are you sure?
      </p>
      
      <div>
        <label>Confirm your password:</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      
      <div>
        <label>Current 6-digit code (optional):</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          pattern="[0-9]*"
          inputMode="numeric"
        />
      </div>
      
      <div className="actions">
        <button onClick={() => setShowConfirm(false)}>
          Cancel
        </button>
        <button 
          onClick={handleDisable}
          disabled={!password}
          className="danger"
        >
          Disable 2FA
        </button>
      </div>
    </Modal>
  );
}
```

### 8.5 Regenerate Backup Codes

```tsx
function RegenerateBackupCodes() {
  const [password, setPassword] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const regenerateMutation = trpc.auth.backupCodesRegenerate.useMutation();
  
  async function handleRegenerate() {
    try {
      const result = await regenerateMutation.mutateAsync({ password });
      setNewCodes(result.data.backupCodes);
    } catch (error) {
      // Handle error
    }
  }
  
  if (newCodes) {
    return <BackupCodesModal codes={newCodes} />;
  }
  
  return (
    <div>
      <p>Generate new backup codes. This will invalidate all existing codes.</p>
      
      <label>Confirm your password:</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      
      <button 
        onClick={handleRegenerate}
        disabled={!password}
      >
        Generate New Codes
      </button>
    </div>
  );
}
```

---

## 9. UX Best Practices

### 9.1 Setup Flow UX

✅ **Do:**
- Show clear step-by-step instructions (1. Scan QR, 2. Enter Code, 3. Save Backup Codes)
- Provide both QR code AND manual entry option
- Display countdown timer showing when code will refresh
- Disable "Continue" button until user acknowledges saving backup codes
- Allow downloading backup codes as .txt file
- Show success message after setup completes

❌ **Don't:**
- Close backup codes modal automatically
- Allow skipping backup codes step
- Auto-submit code input (user should click "Verify")
- Hide manual entry option

### 9.2 Login Flow UX

✅ **Do:**
- Auto-focus code input field
- Show "Lost access?" link prominently
- Display countdown timer
- Clear input field after failed attempt
- Show number of backup codes remaining (if <3)
- Provide "Use backup code instead" option upfront

❌ **Don't:**
- Lock user out after failed attempts (backend handles this)
- Auto-submit after 6 digits (user should click "Verify")
- Hide backup code option

### 9.3 Backup Code Warnings

Show warning badge when backup codes are low:

```tsx
function BackupCodeWarning({ remaining }: { remaining: number }) {
  if (remaining >= 3) return null;
  
  return (
    <div className="warning-banner">
      <span className="icon">⚠️</span>
      <span>
        You only have {remaining} backup code{remaining !== 1 ? 's' : ''} remaining.
        {' '}
        <button onClick={openRegenerateModal}>Generate new codes</button>
      </span>
    </div>
  );
}
```

### 9.4 Accessibility

```tsx
// ARIA labels for screen readers
<input
  type="text"
  aria-label="Six digit authentication code"
  aria-describedby="code-help"
/>
<span id="code-help" className="sr-only">
  Enter the 6-digit code from your authenticator app
</span>

// Announce errors
<div role="alert" aria-live="polite">
  {error && <span>{error}</span>}
</div>
```

### 9.5 Mobile Optimization

```tsx
// Use numeric keyboard on mobile
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  autoComplete="one-time-code"
/>

// Make QR code responsive
<img 
  src={qrCode} 
  alt="QR Code"
  style={{ 
    maxWidth: '100%', 
    height: 'auto',
    minWidth: '200px'
  }}
/>
```

---

## 10. Testing Checklist

### 10.1 Setup Flow Testing

- [ ] **Initiate Setup**
  - [ ] Button disabled when 2FA already enabled
  - [ ] QR code displays correctly
  - [ ] Manual entry key is formatted (spaces every 4 chars)
  - [ ] Copy button works for manual entry

- [ ] **Verify Code**
  - [ ] Valid code enables 2FA successfully
  - [ ] Invalid code shows error message
  - [ ] Expired code (>60s old) shows error
  - [ ] Input accepts only numeric characters
  - [ ] Input limited to 6 characters
  - [ ] Whitespace in code is stripped automatically

- [ ] **Backup Codes**
  - [ ] All 10 codes are displayed
  - [ ] Codes are in XXXX-XXXX format
  - [ ] Download button creates .txt file
  - [ ] Copy button copies all codes
  - [ ] Modal cannot be closed without acknowledgment checkbox
  - [ ] Codes are never shown again after modal closes

### 10.2 Login Flow Testing

- [ ] **TOTP Verification**
  - [ ] 2FA prompt shows after successful password login
  - [ ] Valid code completes login
  - [ ] Invalid code shows error, allows retry
  - [ ] Countdown timer displays correctly
  - [ ] "Lost access?" link is visible

- [ ] **Backup Code Verification**
  - [ ] Backup code input is accessible from main 2FA screen
  - [ ] Valid backup code completes login
  - [ ] Invalid backup code shows error
  - [ ] Used backup code shows "already used" error
  - [ ] Codes are case-insensitive
  - [ ] Whitespace and dashes are handled correctly

- [ ] **Edge Cases**
  - [ ] User with no backup codes remaining sees support message
  - [ ] Session expires during 2FA - redirects to login
  - [ ] User can switch between TOTP and backup code inputs

### 10.3 Settings Page Testing

- [ ] **Status Display**
  - [ ] Correct status shown (enabled/disabled)
  - [ ] "Enabled since" date displays correctly
  - [ ] Backup codes remaining count is accurate
  - [ ] Warning shows when <3 backup codes remain

- [ ] **Disable 2FA**
  - [ ] Confirmation modal shows warning
  - [ ] Requires password to disable
  - [ ] Optional TOTP code accepted
  - [ ] Invalid password shows error
  - [ ] Success message displays
  - [ ] Status updates immediately after disable

- [ ] **Regenerate Backup Codes**
  - [ ] Requires password confirmation
  - [ ] Invalid password shows error
  - [ ] New codes are displayed (10 codes)
  - [ ] Old codes are invalidated (test by trying to use one)
  - [ ] Success email is sent

### 10.4 Cross-Device Testing

- [ ] **Desktop**
  - [ ] QR code scanning works with phone
  - [ ] Manual entry key is copyable
  - [ ] All modals are readable

- [ ] **Mobile**
  - [ ] Numeric keyboard appears for code input
  - [ ] QR code is appropriately sized
  - [ ] Backup codes are readable
  - [ ] Download button works on mobile browsers

- [ ] **Tablet**
  - [ ] Responsive layout works
  - [ ] Touch interactions work smoothly

### 10.5 Authenticator App Compatibility

Test with multiple authenticator apps:
- [ ] Google Authenticator (iOS/Android)
- [ ] Microsoft Authenticator (iOS/Android)
- [ ] Authy (iOS/Android/Desktop)
- [ ] 1Password
- [ ] Bitwarden

**Verify:**
- [ ] QR code scans successfully
- [ ] Manual entry works
- [ ] Generated codes are valid
- [ ] Time sync is correct (±30s tolerance works)

### 10.6 Security Testing

- [ ] **Code Validation**
  - [ ] Only 6-digit numeric codes accepted
  - [ ] Special characters rejected
  - [ ] SQL injection attempts fail safely
  - [ ] XSS attempts are sanitized

- [ ] **Backup Code Security**
  - [ ] Codes cannot be reused
  - [ ] Race conditions handled (concurrent login attempts)
  - [ ] Codes are stored hashed (not visible in DB)

- [ ] **Session Security**
  - [ ] 2FA required for all new logins
  - [ ] Session invalidated on 2FA disable
  - [ ] Session persists after 2FA enable (user not logged out)

### 10.7 Error Recovery Testing

- [ ] User abandons setup midway - can restart successfully
- [ ] User closes browser during setup - can restart successfully
- [ ] Network error during verification - can retry
- [ ] User loses backup codes - can regenerate with password
- [ ] User loses authenticator app - can use backup code
- [ ] User loses both - contact support flow works

---

## 11. Frontend Implementation Checklist

### Phase 1: Setup UI
- [ ] Create 2FA settings page
- [ ] Add "Enable 2FA" button
- [ ] Build setup modal with QR code display
- [ ] Add manual entry option
- [ ] Create code verification input
- [ ] Build backup codes modal
- [ ] Add download/copy functionality
- [ ] Implement countdown timer component

### Phase 2: Login UI
- [ ] Add 2FA verification screen to login flow
- [ ] Create TOTP code input
- [ ] Add backup code input option
- [ ] Implement "Lost access?" link
- [ ] Add countdown timer to login screen

### Phase 3: Management UI
- [ ] Add 2FA status display to settings
- [ ] Create disable 2FA modal
- [ ] Build regenerate backup codes flow
- [ ] Add backup code warning banner
- [ ] Show remaining backup code count

### Phase 4: Error Handling
- [ ] Implement error message mapping
- [ ] Add toast notifications
- [ ] Create inline error displays
- [ ] Handle network errors gracefully

### Phase 5: Testing
- [ ] Unit tests for validation logic
- [ ] Integration tests for API calls
- [ ] E2E tests for complete flows
- [ ] Cross-browser testing
- [ ] Mobile responsive testing
- [ ] Accessibility testing

### Phase 6: Polish
- [ ] Add loading states to all buttons
- [ ] Implement optimistic UI updates where appropriate
- [ ] Add animations/transitions
- [ ] Ensure accessibility compliance
- [ ] Add analytics tracking
- [ ] Write user documentation

---

## 12. Code Examples: Complete Components

### 12.1 Complete Setup Flow Component

```tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';

export function TwoFactorSetup() {
  const [step, setStep] = useState<'initial' | 'scan' | 'verify' | 'backup'>('initial');
  const [setupData, setSetupData] = useState<any>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  
  const statusQuery = trpc.auth.totpStatus.useQuery();
  const setupMutation = trpc.auth.totpSetup.useMutation();
  const confirmMutation = trpc.auth.totpConfirm.useMutation();
  
  async function handleStartSetup() {
    try {
      const result = await setupMutation.mutateAsync();
      setSetupData(result.data);
      setStep('scan');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start setup');
    }
  }
  
  async function handleVerifyCode() {
    try {
      const result = await confirmMutation.mutateAsync({ code });
      setBackupCodes(result.data.backupCodes);
      setStep('backup');
    } catch (error: any) {
      if (error.cause?.code === 'TOTP_INVALID') {
        toast.error('Invalid code. Please try again.');
        setCode('');
      } else {
        toast.error('Verification failed');
      }
    }
  }
  
  function handleDownloadBackupCodes() {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yesgoddess-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  if (statusQuery.data?.data.enabled) {
    return <div>Two-factor authentication is already enabled.</div>;
  }
  
  if (step === 'initial') {
    return (
      <button onClick={handleStartSetup} disabled={setupMutation.isLoading}>
        {setupMutation.isLoading ? 'Preparing...' : 'Enable Two-Factor Authentication'}
      </button>
    );
  }
  
  if (step === 'scan' && setupData) {
    return (
      <div className="setup-modal">
        <h2>Scan QR Code</h2>
        <p>Use your authenticator app to scan this code:</p>
        <img src={setupData.qrCodeDataUrl} alt="QR Code" />
        
        <details>
          <summary>Can't scan? Enter manually</summary>
          <code>{setupData.manualEntryKey}</code>
        </details>
        
        <button onClick={() => setStep('verify')}>Next</button>
      </div>
    );
  }
  
  if (step === 'verify') {
    return (
      <div className="verify-modal">
        <h2>Enter Verification Code</h2>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          pattern="[0-9]*"
          inputMode="numeric"
          placeholder="123456"
        />
        <button 
          onClick={handleVerifyCode}
          disabled={code.length !== 6 || confirmMutation.isLoading}
        >
          Verify and Enable
        </button>
        <TotpCountdown />
      </div>
    );
  }
  
  if (step === 'backup') {
    return (
      <div className="backup-codes-modal">
        <h2>⚠️ Save Your Backup Codes</h2>
        <p className="warning">
          These codes will only be shown once. Save them securely.
        </p>
        
        <div className="codes-grid">
          {backupCodes.map((code, i) => (
            <code key={i}>{code}</code>
          ))}
        </div>
        
        <button onClick={handleDownloadBackupCodes}>Download Codes</button>
        
        <label>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          I have saved these codes securely
        </label>
        
        <button disabled={!acknowledged} onClick={() => window.location.reload()}>
          Done
        </button>
      </div>
    );
  }
  
  return null;
}
```

---

## 13. Additional Resources

### Authenticator Apps

Recommend these to users:
- **Google Authenticator**: [iOS](https://apps.apple.com/app/google-authenticator/id388497605) | [Android](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)
- **Microsoft Authenticator**: [iOS](https://apps.apple.com/app/microsoft-authenticator/id983156458) | [Android](https://play.google.com/store/apps/details?id=com.azure.authenticator)
- **Authy**: [iOS](https://apps.apple.com/app/authy/id494168017) | [Android](https://play.google.com/store/apps/details?id=com.authy.authy) | [Desktop](https://authy.com/download/)

### Security Best Practices Documentation

Link to these in your UI:
- How to secure backup codes
- What to do if you lose your device
- Contact support for account recovery

---

**End of Part 2**

For Part 1 (Overview, API Endpoints, Types, Business Logic), see `FRONTEND_INTEGRATION_TOTP_PART_1.md`.
