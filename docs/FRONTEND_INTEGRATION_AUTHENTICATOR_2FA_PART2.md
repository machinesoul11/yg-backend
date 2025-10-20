# Frontend Integration Guide: Authenticator 2FA (Part 2)

**🌐 SHARED** - Used by both public-facing website and admin backend  
**Module:** Authenticator 2FA Setup & Management (Continued)  
**Last Updated:** October 19, 2025

---

## Table of Contents (Part 2)

7. [Rate Limiting & Security](#rate-limiting--security)
8. [User Experience Flow](#user-experience-flow)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [React Query Integration Examples](#react-query-integration-examples)
11. [Edge Cases & Error Scenarios](#edge-cases--error-scenarios)

---

## Rate Limiting & Security

### Rate Limiting Policy

The backend implements progressive rate limiting to prevent brute-force attacks:

#### Per-Endpoint Limits

| Endpoint | Rate Limit | Window | Lockout |
|----------|------------|--------|---------|
| `POST /api/auth/2fa/totp/enable` | 5 requests | 15 minutes | No |
| `POST /api/auth/2fa/totp/verify` | 10 attempts | 15 minutes | After 5 failures |
| `POST /api/auth/2fa/totp/disable` | 5 requests | 15 minutes | No |
| `POST /api/auth/2fa/totp/backup-codes/regenerate` | 5 requests | 30 minutes | No |

### Rate Limit Headers

Backend includes rate limit information in response headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;       // Maximum requests allowed
  'X-RateLimit-Remaining': string;   // Requests remaining in window
  'X-RateLimit-Reset': string;       // Unix timestamp when limit resets
}
```

### Handling Rate Limits

```typescript
/**
 * Parse rate limit headers from response
 */
export function parseRateLimitHeaders(headers: Headers): {
  limit: number;
  remaining: number;
  resetAt: Date;
} | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  
  if (!limit || !remaining || !reset) {
    return null;
  }
  
  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt: new Date(parseInt(reset, 10) * 1000),
  };
}

/**
 * Display rate limit warning to user
 */
export function getRateLimitMessage(rateLimit: { remaining: number; resetAt: Date }): string {
  if (rateLimit.remaining <= 2) {
    const minutesUntilReset = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 60000);
    return `You have ${rateLimit.remaining} attempt${rateLimit.remaining === 1 ? '' : 's'} remaining. Limit resets in ${minutesUntilReset} minute${minutesUntilReset === 1 ? '' : 's'}.`;
  }
  return '';
}
```

### Security Best Practices

#### 1. Code Entry Security

```typescript
/**
 * Implement client-side delays between verification attempts
 * Prevents rapid-fire guessing even before rate limiting
 */
export class TotpSecurityManager {
  private lastAttempt: number = 0;
  private attemptCount: number = 0;
  private readonly MIN_DELAY_MS = 2000; // 2 seconds between attempts
  
  canAttempt(): boolean {
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastAttempt;
    
    if (timeSinceLastAttempt < this.MIN_DELAY_MS) {
      return false;
    }
    
    return true;
  }
  
  recordAttempt(): void {
    this.lastAttempt = Date.now();
    this.attemptCount++;
  }
  
  getRequiredDelay(): number {
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastAttempt;
    return Math.max(0, this.MIN_DELAY_MS - timeSinceLastAttempt);
  }
  
  reset(): void {
    this.attemptCount = 0;
  }
}
```

#### 2. QR Code Security

```typescript
/**
 * QR code should never be stored persistently
 * Clear from memory after setup completion
 */
export class SecureQRCodeManager {
  private qrCodeUrl: string | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  
  setQRCode(dataUrl: string, expiryMinutes: number = 10): void {
    this.qrCodeUrl = dataUrl;
    
    // Auto-clear after expiry
    this.timeoutId = setTimeout(() => {
      this.clearQRCode();
    }, expiryMinutes * 60 * 1000);
  }
  
  getQRCode(): string | null {
    return this.qrCodeUrl;
  }
  
  clearQRCode(): void {
    this.qrCodeUrl = null;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

#### 3. Backup Code Security

```typescript
/**
 * Backup codes handling with security measures
 */
export class BackupCodeSecurityManager {
  /**
   * Display backup codes with security warnings
   */
  static displayBackupCodes(codes: string[]): void {
    // Show codes only once
    // User must explicitly acknowledge they've saved them
    // Never persist in browser storage
  }
  
  /**
   * Prevent copying codes to insecure locations
   */
  static async copyToClipboardSecurely(codes: string[]): Promise<void> {
    const text = codes.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      
      // Clear clipboard after 60 seconds
      setTimeout(async () => {
        // Note: We can't reliably clear the clipboard, so just notify user
        console.warn('[Security] Backup codes were copied 60 seconds ago. Please ensure they are saved securely.');
      }, 60000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      throw new Error('Failed to copy backup codes');
    }
  }
  
  /**
   * Validate backup code format before sending to API
   */
  static validateFormat(code: string): boolean {
    // Remove whitespace and convert to uppercase
    const cleanCode = code.replace(/\s/g, '').toUpperCase();
    
    // Check format: 8 alphanumeric characters
    // May include dash: XXXX-XXXX
    return /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(cleanCode);
  }
}
```

#### 4. Session Security

```typescript
/**
 * Ensure session tokens are handled securely
 */
export class SessionSecurityManager {
  /**
   * Store session token securely
   * - Use httpOnly cookies when possible
   * - Never store in localStorage for production
   * - Use sessionStorage for temporary storage only
   */
  static storeSessionToken(token: string, persistent: boolean = false): void {
    if (persistent) {
      // For "Remember Me" functionality
      // Prefer httpOnly cookie set by backend
      // If must use client-side storage, use secure cookie
      document.cookie = `session=${token}; Secure; SameSite=Strict; Path=/; Max-Age=2592000`; // 30 days
    } else {
      // For session-only storage
      sessionStorage.setItem('session', token);
    }
  }
  
  /**
   * Retrieve session token
   */
  static getSessionToken(): string | null {
    // Check sessionStorage first
    const sessionToken = sessionStorage.getItem('session');
    if (sessionToken) {
      return sessionToken;
    }
    
    // Check cookies
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('session='));
    if (sessionCookie) {
      return sessionCookie.split('=')[1];
    }
    
    return null;
  }
  
  /**
   * Clear session token
   */
  static clearSessionToken(): void {
    sessionStorage.removeItem('session');
    document.cookie = 'session=; Secure; SameSite=Strict; Path=/; Max-Age=0';
  }
}
```

---

## User Experience Flow

### Complete Setup Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INITIATES 2FA SETUP                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
                     ┌────────────────────┐
                     │ Check Current State │
                     └─────────┬──────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
                  ▼                       ▼
         ┌────────────────┐      ┌──────────────┐
         │ 2FA Enabled?   │      │ 2FA Disabled │
         └────────┬───────┘      └──────┬───────┘
                  │                     │
                  │ Yes                 │ No
                  │                     │
                  ▼                     ▼
      ┌──────────────────────┐  ┌─────────────────────────┐
      │ Show "Already Active"│  │ POST /totp/enable       │
      │ Redirect to Settings │  │ Generate QR Code        │
      └──────────────────────┘  └─────────┬───────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │  Display QR Code      │
                              │  + Manual Entry Key   │
                              │  + App Download Links │
                              └─────────┬─────────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │ User Scans QR Code    │
                            │ or Enters Key Manually│
                            └─────────┬─────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │ User Enters TOTP Code   │
                          │ from Authenticator App  │
                          └──────────┬──────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │ POST /totp/verify              │
                    │ Validate Code                  │
                    └───────────┬────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌─────────────────┐     ┌────────────────┐
          │ Code Invalid    │     │ Code Valid     │
          │ Show Error      │     │ Enable 2FA     │
          │ Allow Retry     │     │ Generate Codes │
          └────────┬────────┘     └────────┬───────┘
                   │                       │
                   │                       ▼
                   │          ┌────────────────────────┐
                   │          │ Display 10 Backup Codes│
                   │          │ WITH CRITICAL WARNINGS │
                   │          └──────────┬─────────────┘
                   │                     │
                   │                     ▼
                   │          ┌────────────────────────┐
                   │          │ User Acknowledges:     │
                   │          │ ☐ I've saved these     │
                   │          │ ☐ I understand they're │
                   │          │   one-time use only    │
                   │          └──────────┬─────────────┘
                   │                     │
                   │                     ▼
                   │          ┌────────────────────────┐
                   │          │ Allow Download/Copy    │
                   │          │ Print/Screenshot       │
                   │          └──────────┬─────────────┘
                   │                     │
                   │                     ▼
                   │          ┌────────────────────────┐
                   └─────────▶│ Setup Complete         │
                              │ Show Success Message   │
                              │ Email Notification Sent│
                              └────────────────────────┘
```

### Disable Flow

```
┌──────────────────────────────────────────────────┐
│           USER WANTS TO DISABLE 2FA              │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │ Show Warning Dialog  │
          │ "This makes your     │
          │  account less secure"│
          └──────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    ┌────────┐            ┌──────────┐
    │ Cancel │            │ Continue │
    └────────┘            └─────┬────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Request Password     │
                     │ (Required)           │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Request TOTP Code    │
                     │ (Optional but        │
                     │  recommended)        │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ POST /totp/disable   │
                     └──────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌─────────────────┐     ┌────────────────┐
          │ Error           │     │ Success        │
          │ - Wrong password│     │ - 2FA Disabled │
          │ - Invalid code  │     │ - Email sent   │
          └─────────────────┘     └────────┬───────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │ All backup codes │
                                 │ invalidated      │
                                 │ Secret removed   │
                                 └──────────────────┘
```

### UI/UX Recommendations

#### 1. Setup Page Layout

```typescript
interface SetupPageProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function TotpSetupPage({ onComplete, onCancel }: SetupPageProps) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Progress Indicator */}
      <ProgressSteps 
        steps={['Scan QR Code', 'Verify Code', 'Save Backup Codes']}
        currentStep={currentStep}
      />
      
      {/* Step 1: QR Code Display */}
      {currentStep === 0 && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">
              Scan QR Code
            </h2>
            
            {/* QR Code with proper sizing */}
            <div className="flex justify-center mb-4">
              <img 
                src={qrCodeDataUrl} 
                alt="TOTP QR Code"
                className="w-64 h-64 border-4 border-gray-200 rounded"
              />
            </div>
            
            {/* Manual Entry Option */}
            <Accordion>
              <AccordionItem title="Can't scan? Enter manually">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Enter this key in your authenticator app:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-100 p-3 rounded font-mono text-sm">
                      {manualEntryKey}
                    </code>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => copyToClipboard(manualEntryKey)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </AccordionItem>
            </Accordion>
            
            {/* App Recommendations */}
            <div className="mt-6">
              <h3 className="font-semibold mb-3">
                Recommended Authenticator Apps
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {authenticatorApps.map((app) => (
                  <AppCard key={app.name} app={app} />
                ))}
              </div>
            </div>
          </div>
          
          <Button 
            onClick={() => setCurrentStep(1)} 
            className="w-full"
          >
            I've Scanned the Code
          </Button>
        </div>
      )}
      
      {/* Step 2: Code Verification */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">
              Verify Your Authenticator
            </h2>
            
            <p className="text-gray-600 mb-6">
              Enter the 6-digit code from your authenticator app
            </p>
            
            {/* TOTP Input Field */}
            <OTPInput
              length={6}
              value={code}
              onChange={setCode}
              onComplete={handleVerify}
              autoFocus
            />
            
            {/* Error Display */}
            {error && (
              <Alert variant="error" className="mt-4">
                {error}
              </Alert>
            )}
            
            {/* Rate Limit Warning */}
            {rateLimitWarning && (
              <Alert variant="warning" className="mt-4">
                {rateLimitWarning}
              </Alert>
            )}
            
            {/* Helper Text */}
            <p className="text-sm text-gray-500 mt-4">
              Codes refresh every 30 seconds. If a code doesn't work, 
              wait for the next one.
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => setCurrentStep(0)}
              className="flex-1"
            >
              Back
            </Button>
            <Button 
              onClick={handleVerify} 
              loading={isVerifying}
              disabled={code.length !== 6}
              className="flex-1"
            >
              Verify & Enable
            </Button>
          </div>
        </div>
      )}
      
      {/* Step 3: Backup Codes Display */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="bg-yellow-50 border-2 border-yellow-400 p-6 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-yellow-600 mt-1" />
              <div>
                <h3 className="font-bold text-yellow-900 mb-2">
                  IMPORTANT: Save Your Backup Codes
                </h3>
                <p className="text-yellow-800 text-sm">
                  These codes are your only way to access your account if 
                  you lose your authenticator device. Each code can only 
                  be used once. Store them somewhere safe.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">
              Your Backup Codes
            </h2>
            
            {/* Backup Codes Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6 font-mono text-sm">
              {backupCodes.map((code, idx) => (
                <div 
                  key={idx}
                  className="bg-gray-50 p-3 rounded border"
                >
                  <span className="text-gray-500 mr-2">{idx + 1}.</span>
                  {code}
                </div>
              ))}
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                variant="outline"
                onClick={() => downloadBackupCodes(backupCodes)}
                icon={<Download />}
              >
                Download
              </Button>
              <Button 
                variant="outline"
                onClick={() => copyBackupCodes(backupCodes)}
                icon={<Copy />}
              >
                Copy All
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.print()}
                icon={<Printer />}
              >
                Print
              </Button>
            </div>
          </div>
          
          {/* Confirmation Checkbox */}
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={confirmed1}
                onChange={(e) => setConfirmed1(e.target.checked)}
              />
              <span className="text-sm">
                I have saved these backup codes in a secure location
              </span>
            </label>
            
            <label className="flex items-start gap-3">
              <Checkbox
                checked={confirmed2}
                onChange={(e) => setConfirmed2(e.target.checked)}
              />
              <span className="text-sm">
                I understand these codes can only be used once and 
                I won't be able to view them again
              </span>
            </label>
          </div>
          
          <Button 
            onClick={onComplete}
            disabled={!confirmed1 || !confirmed2}
            className="w-full"
          >
            Complete Setup
          </Button>
        </div>
      )}
    </div>
  );
}
```

#### 2. Inline Code Input Component

```typescript
/**
 * OTP/TOTP Input Component with UX enhancements
 */
interface OTPInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

export function OTPInput({ 
  length, 
  value, 
  onChange, 
  onComplete,
  autoFocus = false 
}: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const handleChange = (index: number, digit: string) => {
    // Only allow digits
    if (!/^\d*$/.test(digit)) return;
    
    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('');
    
    onChange(joined);
    
    // Auto-focus next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Call onComplete when all digits entered
    if (joined.length === length && onComplete) {
      onComplete(joined);
    }
  };
  
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };
  
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
    if (pastedData.length === length) {
      onChange(pastedData);
      if (onComplete) {
        onComplete(pastedData);
      }
    }
  };
  
  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          autoFocus={autoFocus && index === 0}
          className="w-12 h-14 text-center text-2xl font-mono border-2 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      ))}
    </div>
  );
}
```

#### 3. Settings Page Integration

```typescript
/**
 * 2FA Settings Section
 */
export function TwoFactorSettings({ user }: { user: User }) {
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2">
              Two-Factor Authentication
            </h3>
            <p className="text-gray-600 text-sm">
              {user.twoFactorEnabled 
                ? 'Your account is protected with authenticator-based 2FA'
                : 'Add an extra layer of security to your account'
              }
            </p>
          </div>
          
          <Badge variant={user.twoFactorEnabled ? 'success' : 'warning'}>
            {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        
        <div className="mt-6 flex gap-3">
          {!user.twoFactorEnabled ? (
            <Button onClick={() => router.push('/settings/2fa/setup')}>
              <Shield className="mr-2" />
              Enable 2FA
            </Button>
          ) : (
            <>
              <Button 
                variant="outline"
                onClick={() => setShowRegenerateDialog(true)}
              >
                <RefreshCw className="mr-2" />
                Regenerate Backup Codes
              </Button>
              <Button 
                variant="destructive-outline"
                onClick={() => setShowDisableDialog(true)}
              >
                <XCircle className="mr-2" />
                Disable 2FA
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Additional info cards */}
      {user.twoFactorEnabled && (
        <div className="grid md:grid-cols-2 gap-4">
          <InfoCard
            icon={<Key />}
            title="Backup Codes"
            description="Keep your backup codes safe. They're your only way to recover access if you lose your device."
          />
          <InfoCard
            icon={<Smartphone />}
            title="Authenticator App"
            description="Your authenticator app generates a new code every 30 seconds. Make sure your device time is accurate."
          />
        </div>
      )}
      
      {/* Disable Dialog */}
      <DisableTotpDialog 
        open={showDisableDialog}
        onClose={() => setShowDisableDialog(false)}
      />
      
      {/* Regenerate Dialog */}
      <RegenerateBackupCodesDialog
        open={showRegenerateDialog}
        onClose={() => setShowRegenerateDialog(false)}
      />
    </div>
  );
}
```

---

Continue to **[Part 3: Implementation Checklist & Examples](./FRONTEND_INTEGRATION_AUTHENTICATOR_2FA_PART3.md)**
