# Password Authentication Module - Frontend Integration Guide

**Version:** 1.0.0  
**Last Updated:** October 12, 2025  
**Module:** Password Authentication with Security Features

---

## Table of Contents

1. [Authentication Endpoints](#1-authentication-endpoints)
2. [Request/Response Schemas](#2-requestresponse-schemas)
3. [Authentication Flow](#3-authentication-flow)
4. [Password Requirements](#4-password-requirements)
5. [Rate Limiting Details](#5-rate-limiting-details)
6. [Remember Me Implementation](#6-remember-me-implementation)
7. [Password Reset Flow](#7-password-reset-flow)
8. [Error Codes](#8-error-codes)
9. [Security Headers Required](#9-security-headers-required)
10. [Testing Scenarios](#10-testing-scenarios)

---

## 1. Authentication Endpoints

### Base URL
```
Development: http://localhost:3000
Production: https://api.yesgoddess.com
```

All authentication endpoints use **tRPC** for type-safe API calls. Alternatively, you can use Auth.js endpoints directly.

---

### 1.1 Register User

**Endpoint:** `trpc.auth.register`  
**Method:** `mutation`  
**Auth Required:** No

**Request Body:**
```typescript
{
  email: string;         // Valid email address
  password: string;      // Must meet password requirements (see section 4)
  name?: string;         // Optional user name (1-255 chars)
  role: 'CREATOR' | 'BRAND';  // User cannot self-register as ADMIN
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    userId: string;      // CUID format
    email: string;
    emailVerified: false;
  };
  meta: {
    message: "Verification email sent to {email}"
  };
}
```

**Error Response (409 - Email Exists):**
```typescript
{
  code: 'CONFLICT';
  message: 'An account with this email already exists';
  cause: {
    code: 'EMAIL_EXISTS';
    statusCode: 409;
  };
}
```

---

### 1.2 Login User

**Endpoint:** `trpc.auth.login`  
**Method:** `mutation`  
**Auth Required:** No

**Request Body:**
```typescript
{
  email: string;
  password: string;
  rememberMe?: boolean;  // Optional, defaults to false
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
      emailVerified: boolean;
    };
  };
}
```

**Error Response (401 - Invalid Credentials):**
```typescript
{
  code: 'UNAUTHORIZED';
  message: 'Invalid email or password';
  cause: {
    code: 'INVALID_CREDENTIALS';
    statusCode: 401;
  };
}
```

**Error Response (423 - Account Locked):**
```typescript
{
  code: 'BAD_REQUEST';
  message: 'Account has been locked due to too many failed login attempts';
  cause: {
    code: 'ACCOUNT_LOCKED';
    statusCode: 423;
  };
}
```

---

### 1.3 Logout User

**Auth.js Endpoint:** `POST /api/auth/signout`  
**Method:** `POST`  
**Auth Required:** Yes (Session)

**Request Body:**
```json
{
  "csrfToken": "string"  // Get from /api/auth/csrf
}
```

**Success Response (200):**
```json
{
  "url": "/"
}
```

---

### 1.4 Token Refresh (Session Check)

**Auth.js Endpoint:** `GET /api/auth/session`  
**Method:** `GET`  
**Auth Required:** No (but returns null if not authenticated)

**Success Response (200):**
```typescript
{
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
    emailVerified: boolean;
    // Role-specific fields
    creatorId?: string;
    brandId?: string;
    creatorVerificationStatus?: string;
    brandVerificationStatus?: string;
  };
  expires: string;  // ISO 8601 datetime
}
```

**No Session Response (200):**
```typescript
null
```

---

### 1.5 Request Password Reset

**Endpoint:** `trpc.auth.requestPasswordReset`  
**Method:** `mutation`  
**Auth Required:** No

**Request Body:**
```typescript
{
  email: string;
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    message: "If an account exists with this email, a password reset link has been sent"
  };
}
```

**Note:** Always returns success to prevent user enumeration attacks.

---

### 1.6 Reset Password (Confirm)

**Endpoint:** `trpc.auth.resetPassword`  
**Method:** `mutation`  
**Auth Required:** No

**Request Body:**
```typescript
{
  token: string;        // 64-character hex token from email
  newPassword: string;  // Must meet password requirements
}
```

**Success Response (200):**
```typescript
{
  success: true;
  data: {
    message: "Password reset successfully"
  };
}
```

**Error Response (400 - Invalid Token):**
```typescript
{
  code: 'BAD_REQUEST';
  message: 'Invalid or expired token';
  cause: {
    code: 'TOKEN_INVALID';
    statusCode: 401;
  };
}
```

---

### 1.7 Session Validation (Get Current User)

**Endpoint:** `trpc.auth.getSession`  
**Method:** `query`  
**Auth Required:** Yes

**Success Response (200):**
```typescript
{
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  email_verified: Date | null;
  createdAt: Date;
  updatedAt: Date;
  creator?: {
    id: string;
    verificationStatus: string;
    onboardingStatus: string;
  };
  brand?: {
    id: string;
    verificationStatus: string;
    isVerified: boolean;
  };
}
```

**Error Response (401):**
```typescript
{
  code: 'UNAUTHORIZED';
  message: 'Not authenticated';
}
```

---

## 2. Request/Response Schemas

### 2.1 TypeScript Interfaces for Requests

```typescript
// Registration
interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  role: 'CREATOR' | 'BRAND';
}

// Login
interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// Password Reset Request
interface PasswordResetRequest {
  email: string;
}

// Password Reset Confirmation
interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

// Change Password (Authenticated)
interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Email Verification
interface VerifyEmailRequest {
  token: string;
}
```

---

### 2.2 TypeScript Interfaces for Responses

```typescript
// User Object
interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  emailVerified: boolean;
  creatorId?: string;
  brandId?: string;
}

// Registration Response
interface RegisterResponse {
  success: true;
  data: {
    userId: string;
    email: string;
    emailVerified: false;
  };
  meta: {
    message: string;
  };
}

// Login Response
interface LoginResponse {
  success: true;
  data: {
    user: User;
  };
}

// Session Response
interface SessionResponse {
  user: User & {
    image: string | null;
    creatorVerificationStatus?: string;
    brandVerificationStatus?: string;
    isBrandVerified?: boolean;
  };
  expires: string;
}
```

---

### 2.3 Error Response Format

All errors follow this structure:

```typescript
interface ErrorResponse {
  code: 'UNAUTHORIZED' | 'BAD_REQUEST' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR';
  message: string;
  cause?: {
    code: string;        // Specific error code (see section 8)
    statusCode: number;
  };
}
```

---

## 3. Authentication Flow

### 3.1 JWT Token Structure

Auth.js uses JWT tokens stored in secure HTTP-only cookies.

**Token Claims:**
```typescript
{
  // Standard claims
  sub: string;           // User ID
  iat: number;           // Issued at (timestamp)
  exp: number;           // Expires at (timestamp)
  
  // Custom claims
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
  
  // Role-specific
  creatorId?: string;
  creatorVerificationStatus?: string;
  creatorOnboardingStatus?: string;
  brandId?: string;
  brandVerificationStatus?: string;
  isBrandVerified?: boolean;
}
```

**Token Lifetime:**
- **Default Session:** 30 days
- **With "Remember Me":** 30 days (extended via remember-me token)
- **Update Interval:** 24 hours (token refreshed if older than 24h)

---

### 3.2 Where to Store Tokens

**✅ RECOMMENDED: Let Auth.js handle it**

Auth.js automatically manages session tokens in secure HTTP-only cookies:
- Cookie name: `next-auth.session-token` (production) or `__Secure-next-auth.session-token`
- HttpOnly: `true` (prevents XSS)
- Secure: `true` (HTTPS only in production)
- SameSite: `lax` (CSRF protection)

**❌ DO NOT:**
- Store tokens in localStorage (vulnerable to XSS)
- Store tokens in sessionStorage
- Store tokens in regular cookies without HttpOnly flag

---

### 3.3 How to Attach Tokens to Requests

#### Using tRPC (Recommended)

Tokens are automatically attached by the tRPC client if using session provider:

```typescript
import { api } from '@/lib/trpc/client';

// In your component
const { data } = api.auth.getSession.useQuery();
```

#### Using Fetch API

For custom API calls:

```typescript
const response = await fetch('/api/your-endpoint', {
  method: 'POST',
  credentials: 'include',  // Important: sends cookies
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```

#### Using Bearer Token (Alternative)

For non-browser clients or API integrations:

```typescript
const response = await fetch('/api/your-endpoint', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  },
});
```

---

### 3.4 Token Expiration Handling

**Automatic Refresh:**
- Auth.js automatically refreshes tokens older than 24 hours
- No manual intervention needed
- Silent refresh on any API call

**Session Expiration:**
- After 30 days of inactivity, user must log in again
- Frontend should listen for session changes:

```typescript
import { useSession } from 'next-auth/react';

function YourComponent() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      // Redirect to login
      router.push('/login');
    },
  });
  
  if (status === 'loading') return <Loading />;
  if (!session) return <Unauthorized />;
  
  return <YourContent />;
}
```

---

### 3.5 Refresh Token Rotation Logic

Auth.js doesn't use explicit refresh tokens. Instead:

1. **Session tokens are stateless JWT**
2. **Tokens are refreshed server-side** when older than 24 hours
3. **Database lookup happens** on each request to ensure user still exists
4. **Remember-me tokens** (if implemented) provide extended sessions

**Remember-Me Token Flow:**
```
1. User logs in with rememberMe=true
2. Server creates remember-me token (30-day lifetime)
3. Token stored in secure cookie: remember_me
4. On session expiry, remember-me token validates user
5. New session created automatically
6. Optional: Token rotated for enhanced security
```

---

## 4. Password Requirements

### 4.1 Validation Rules

**Minimum Requirements:**
- **Length:** 12-100 characters (enhanced from standard 8)
- **Uppercase:** At least 1 uppercase letter (A-Z)
- **Lowercase:** At least 1 lowercase letter (a-z)
- **Number:** At least 1 digit (0-9)
- **Special Character:** At least 1 special character (!@#$%^&*()_+-=[]{}|;:,.<>?)

**Additional Security Checks:**
- ❌ Not a common weak password (password123, qwerty, etc.)
- ❌ No sequential characters (123456, abcdef)
- ❌ No excessive repeated characters (aaaa, 1111)
- ❌ Not similar to email address
- ❌ Not similar to user name

---

### 4.2 Validation Regex

```typescript
// Basic character requirements
const hasUppercase = /[A-Z]/;
const hasLowercase = /[a-z]/;
const hasNumber = /[0-9]/;
const hasSpecial = /[^A-Za-z0-9]/;

// Validation function
function validatePassword(password: string): boolean {
  return (
    password.length >= 12 &&
    password.length <= 100 &&
    hasUppercase.test(password) &&
    hasLowercase.test(password) &&
    hasNumber.test(password) &&
    hasSpecial.test(password)
  );
}
```

---

### 4.3 Strength Indicator Logic

Implement a client-side password strength meter:

```typescript
interface PasswordStrength {
  score: number;  // 0-4
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;
}

function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  
  // Length scoring
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  
  // Character variety
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  // Penalize common patterns
  if (/(.)\1{3,}/.test(password)) score--; // Repeated chars
  if (/(?:012|123|234|345|456|567|678|789|890)/.test(password)) score--; // Sequential
  
  score = Math.max(0, Math.min(4, score));
  
  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'] as const;
  const colors = ['#f44336', '#ff9800', '#ffc107', '#8bc34a', '#4caf50'];
  
  return {
    score,
    label: labels[score],
    color: colors[score],
  };
}
```

**UI Example:**
```tsx
<div className="password-strength">
  <div 
    className="strength-bar"
    style={{ 
      width: `${(strength.score / 4) * 100}%`,
      backgroundColor: strength.color 
    }}
  />
  <span className="strength-label">{strength.label}</span>
</div>
```

---

### 4.4 Real-time Validation Errors

Show validation errors as user types:

```typescript
const errors: string[] = [];

if (password.length > 0 && password.length < 12) {
  errors.push('At least 12 characters');
}
if (!/[A-Z]/.test(password)) {
  errors.push('One uppercase letter');
}
if (!/[a-z]/.test(password)) {
  errors.push('One lowercase letter');
}
if (!/[0-9]/.test(password)) {
  errors.push('One number');
}
if (!/[^A-Za-z0-9]/.test(password)) {
  errors.push('One special character');
}

// Display as checklist
```

---

## 5. Rate Limiting Details

### 5.1 Login Attempts Limits

**Configuration:**
- **Threshold:** 5 failed login attempts
- **Window:** 15 minutes
- **Lockout Duration:** Progressive
  - First lockout (5-9 attempts): 30 minutes
  - Second lockout (10-14 attempts): 1 hour
  - Third lockout (15+ attempts): 24 hours

**Tracking Method:** Per user account (not per IP)

---

### 5.2 Lockout State Handling

When account is locked, the API returns a 423 status:

```typescript
interface LockoutError {
  code: 'BAD_REQUEST';
  message: 'Account has been locked due to too many failed login attempts';
  cause: {
    code: 'ACCOUNT_LOCKED';
    statusCode: 423;
  };
}
```

**Frontend Handling:**

```typescript
try {
  await loginMutation.mutateAsync({ email, password });
} catch (error) {
  if (error.data?.cause?.code === 'ACCOUNT_LOCKED') {
    // Show lockout message
    setError('Your account has been locked due to too many failed login attempts. Please try again in 30 minutes or reset your password.');
    
    // Optionally, disable login form
    setLoginDisabled(true);
    
    // Suggest password reset
    showPasswordResetOption();
  } else if (error.code === 'UNAUTHORIZED') {
    // Generic invalid credentials
    setError('Invalid email or password');
    
    // Track attempts client-side for UX
    setFailedAttempts(prev => prev + 1);
    
    if (failedAttempts >= 3) {
      showWarning('After 5 failed attempts, your account will be temporarily locked');
    }
  }
}
```

---

### 5.3 Rate Limit Headers

Currently, rate limiting is handled server-side without specific headers. However, you can implement client-side tracking:

**Standard Headers (Future Implementation):**
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1697123456
```

**Check Response Status:**
- `429 Too Many Requests` - Rate limit exceeded
- `423 Locked` - Account locked

---

### 5.4 Displaying Lockout State

**Recommended UI:**

```tsx
{error?.cause?.code === 'ACCOUNT_LOCKED' && (
  <Alert severity="error">
    <AlertTitle>Account Locked</AlertTitle>
    Your account has been temporarily locked due to multiple failed login attempts.
    
    <div className="mt-2">
      <strong>What you can do:</strong>
      <ul>
        <li>Wait 30 minutes and try again</li>
        <li>
          <Link href="/forgot-password">Reset your password</Link> to unlock immediately
        </li>
        <li>Contact support if you need assistance</li>
      </ul>
    </div>
  </Alert>
)}

{failedAttempts > 0 && failedAttempts < 5 && (
  <Alert severity="warning">
    Invalid credentials. You have {5 - failedAttempts} attempts remaining before your account is locked.
  </Alert>
)}
```

---

### 5.5 Password Reset Rate Limiting

**Configuration:**
- **Limit:** 3 password reset requests per hour per email
- **Window:** 1 hour
- **Response:** Always success (prevents user enumeration)

**Implementation Note:** Rate limiting happens server-side. The frontend always receives a success message, so you cannot detect if rate limit was hit.

---

## 6. Remember Me Implementation

### 6.1 Token Lifetime Differences

**Without Remember Me:**
- Session expires after 30 days of inactivity
- Cookie lifetime: Session (browser close) or 30 days

**With Remember Me:**
- Extended session via remember-me token
- Remember-me token lifetime: 30 days
- Auto-login on session expiry if remember-me token valid
- Inactivity timeout: 7 days (token expires if unused)

---

### 6.2 Cookie Settings

**Session Cookie:**
```
Name: next-auth.session-token
HttpOnly: true
Secure: true (production)
SameSite: lax
Path: /
Max-Age: 2592000 (30 days)
```

**Remember-Me Cookie (if implemented):**
```
Name: remember_me
HttpOnly: true
Secure: true
SameSite: lax
Path: /
Max-Age: 2592000 (30 days)
```

---

### 6.3 Security Considerations

**Best Practices:**
1. **Always use HttpOnly cookies** - Prevents JavaScript access
2. **Enable Secure flag** - HTTPS only in production
3. **Set SameSite=lax** - CSRF protection
4. **Limit active tokens** - Maximum 5 sessions per user
5. **Rotate tokens** - Optional periodic rotation for enhanced security
6. **Track device info** - Store device/IP for security monitoring

**User Options:**
```tsx
<Checkbox
  checked={rememberMe}
  onChange={(e) => setRememberMe(e.target.checked)}
  label="Remember me for 30 days"
/>

<Text size="sm" color="gray">
  Only select this on your personal device
</Text>
```

---

### 6.4 Session Management UI

Provide users with visibility into active sessions:

```tsx
interface ActiveSession {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  lastUsedAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

// Display active sessions
<List>
  {sessions.map(session => (
    <ListItem key={session.id}>
      <DeviceIcon /> {session.deviceInfo}
      {session.isCurrent && <Badge>Current Session</Badge>}
      <Text>Last active: {formatRelative(session.lastUsedAt)}</Text>
      <Button onClick={() => revokeSession(session.id)}>
        Revoke
      </Button>
    </ListItem>
  ))}
</List>
```

---

## 7. Password Reset Flow

### 7.1 Step-by-Step User Journey

**Frontend Flow:**

```mermaid
graph TD
    A[User clicks "Forgot Password"] --> B[Enter email address]
    B --> C[Submit form]
    C --> D[Show success message]
    D --> E[User checks email]
    E --> F[Click reset link in email]
    F --> G[Redirected to reset page with token]
    G --> H[Enter new password]
    H --> I[Submit new password]
    I --> J{Valid token?}
    J -->|Yes| K[Password updated]
    J -->|No| L[Show error]
    K --> M[Redirect to login]
```

**Implementation:**

```typescript
// Step 1: Request reset
const requestReset = async (email: string) => {
  try {
    await api.auth.requestPasswordReset.mutate({ email });
    
    // Always show success (security)
    showSuccessMessage(
      'If an account exists with this email, we\'ve sent a password reset link.'
    );
    
    // Optionally, redirect to check email page
    router.push('/check-email');
  } catch (error) {
    // Still show success (prevent user enumeration)
    showSuccessMessage(
      'If an account exists with this email, we\'ve sent a password reset link.'
    );
  }
};

// Step 2: Confirm reset (on /reset-password?token=...)
const resetPassword = async (token: string, newPassword: string) => {
  try {
    await api.auth.resetPassword.mutate({ token, newPassword });
    
    showSuccessMessage('Password reset successfully!');
    router.push('/login');
  } catch (error) {
    if (error.data?.cause?.code === 'TOKEN_INVALID') {
      showError('This reset link is invalid or has expired. Please request a new one.');
    } else if (error.data?.cause?.code === 'PASSWORD_RECENTLY_USED') {
      showError('You cannot reuse a recent password. Please choose a different one.');
    } else {
      showError('Password reset failed. Please try again.');
    }
  }
};
```

---

### 7.2 Email Template Triggers

**Email Sent When:**
- User requests password reset via `requestPasswordReset` endpoint
- Email contains:
  - Reset link with 64-character token
  - Expiration time (1 hour)
  - Security notice (didn't request? ignore this email)

**Email Template Variables:**
```typescript
{
  userName: string;
  resetUrl: string;          // e.g., https://app.com/reset-password?token=...
  expirationTime: string;    // "1 hour"
}
```

---

### 7.3 Reset Token Expiration Time

**Token Lifetime:** 1 hour

**Backend Constants:**
```typescript
const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;
```

**Frontend Handling:**

```typescript
const [tokenValid, setTokenValid] = useState(true);

useEffect(() => {
  // Optional: Verify token before showing form
  const verifyToken = async () => {
    try {
      // Attempt to validate (backend checks expiry)
      await api.auth.validateResetToken.query({ token });
      setTokenValid(true);
    } catch (error) {
      setTokenValid(false);
    }
  };
  
  verifyToken();
}, [token]);

if (!tokenValid) {
  return (
    <Alert severity="error">
      <AlertTitle>Reset Link Expired</AlertTitle>
      This password reset link has expired or is invalid.
      <Button onClick={() => router.push('/forgot-password')}>
        Request New Link
      </Button>
    </Alert>
  );
}
```

---

### 7.4 Invalid/Expired Token Handling

**Error Codes:**
- `TOKEN_INVALID` - Token doesn't exist or malformed
- `TOKEN_EXPIRED` - Token expired (>1 hour old)
- `TOKEN_USED` - Token already used

**UI Examples:**

```tsx
// Expired token
<Alert severity="error">
  <AlertTitle>Link Expired</AlertTitle>
  <p>This password reset link has expired. Reset links are only valid for 1 hour.</p>
  <Button onClick={() => router.push('/forgot-password')}>
    Request New Link
  </Button>
</Alert>

// Invalid token
<Alert severity="error">
  <AlertTitle>Invalid Link</AlertTitle>
  <p>This password reset link is invalid or has already been used.</p>
  <Button onClick={() => router.push('/forgot-password')}>
    Request New Link
  </Button>
</Alert>

// Used token
<Alert severity="info">
  <AlertTitle>Link Already Used</AlertTitle>
  <p>This password reset link has already been used. If you didn't reset your password, please contact support immediately.</p>
  <div className="mt-2">
    <Button onClick={() => router.push('/login')}>
      Go to Login
    </Button>
    <Button variant="outline" onClick={() => router.push('/forgot-password')}>
      Request New Link
    </Button>
  </div>
</Alert>
```

---

## 8. Error Codes

### 8.1 Complete Error Code Reference

| Error Code | Status | User-Friendly Message | When to Show |
|------------|--------|----------------------|--------------|
| `EMAIL_EXISTS` | 409 | "An account with this email already exists. Try logging in instead." | Registration |
| `WEAK_PASSWORD` | 400 | "Password does not meet security requirements. Please choose a stronger password." | Registration, Password Change |
| `INVALID_CREDENTIALS` | 401 | "Invalid email or password. Please try again." | Login |
| `ACCOUNT_LOCKED` | 423 | "Your account has been locked due to multiple failed login attempts. Please try again in 30 minutes or reset your password." | Login |
| `ACCOUNT_DELETED` | 410 | "This account has been deleted. Contact support to restore your account." | Login |
| `EMAIL_NOT_VERIFIED` | 403 | "Please verify your email address before logging in. Check your inbox for the verification link." | Login (if enforced) |
| `TOKEN_INVALID` | 401 | "This link is invalid or has expired. Please request a new one." | Password Reset, Email Verification |
| `TOKEN_EXPIRED` | 401 | "This link has expired. Links are only valid for 1 hour." | Password Reset |
| `TOKEN_USED` | 400 | "This link has already been used." | Password Reset |
| `ALREADY_VERIFIED` | 400 | "Your email is already verified. You can log in now." | Email Verification |
| `RATE_LIMIT_EXCEEDED` | 429 | "Too many requests. Please try again later." | Any endpoint |
| `PASSWORD_RECENTLY_USED` | 400 | "You cannot reuse a recent password. Please choose a different one." | Password Change, Password Reset |
| `UNAUTHORIZED` | 401 | "You must be logged in to access this resource." | Protected endpoints |
| `FORBIDDEN` | 403 | "You don't have permission to access this resource." | Authorization |

---

### 8.2 Error Handling Strategy

**Generic vs Specific Errors:**

```typescript
// ✅ Show specific errors for user actions
if (error.code === 'EMAIL_EXISTS') {
  setError('email', { 
    message: 'This email is already registered. Try logging in instead.' 
  });
}

// ✅ Show generic error for security
if (error.code === 'INVALID_CREDENTIALS') {
  setError('form', { 
    message: 'Invalid email or password' // Don't reveal which is wrong
  });
}

// ❌ Don't expose internal errors
if (error.code === 'INTERNAL_SERVER_ERROR') {
  setError('form', { 
    message: 'Something went wrong. Please try again.' // Generic
  });
}
```

---

### 8.3 User-Friendly Error Messages

**Best Practices:**

1. **Be Helpful:** Provide actionable next steps
   ```
   ❌ "Error: TOKEN_INVALID"
   ✅ "This reset link has expired. Request a new one."
   ```

2. **Be Secure:** Don't leak information
   ```
   ❌ "No user found with this email"
   ✅ "Invalid email or password"
   ```

3. **Be Clear:** Use plain language
   ```
   ❌ "Authentication failed: 401 Unauthorized"
   ✅ "You need to log in to access this page"
   ```

---

## 9. Security Headers Required

### 9.1 CSRF Token Handling

**For Auth.js Endpoints:**

CSRF protection is built-in. Get token from:

```typescript
const getCsrfToken = async () => {
  const response = await fetch('/api/auth/csrf');
  const { csrfToken } = await response.json();
  return csrfToken;
};

// Use in forms
<input type="hidden" name="csrfToken" value={csrfToken} />
```

**For tRPC Endpoints:**

CSRF handled automatically by tRPC client.

---

### 9.2 Content-Type Requirements

**Always include:**
```typescript
headers: {
  'Content-Type': 'application/json'
}
```

**For tRPC:**
Content-Type is set automatically.

---

### 9.3 Custom Headers

**No custom auth headers required** when using session cookies.

**Optional - Bearer Token Authentication:**
```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

**Optional - Request ID (for debugging):**
```typescript
headers: {
  'X-Request-ID': uuidv4()
}
```

---

### 9.4 CORS Configuration

**Allowed Origins:**
```
Development: http://localhost:3000
Production: https://app.yesgoddess.com
```

**Credentials:** Must include credentials for session cookies
```typescript
fetch(url, {
  credentials: 'include'  // Important!
})
```

---

## 10. Testing Scenarios

### 10.1 Happy Path Examples

#### Registration → Verification → Login

```bash
# 1. Register user
curl -X POST http://localhost:3000/api/trpc/auth.register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com",
    "password": "MySecureP@ss2024!",
    "name": "Creative Artist",
    "role": "CREATOR"
  }'

# Response: { success: true, data: { userId: "...", email: "creator@example.com", emailVerified: false } }

# 2. Verify email (get token from email)
curl -X POST http://localhost:3000/api/trpc/auth.verifyEmail \
  -H "Content-Type: application/json" \
  -d '{
    "token": "64-character-hex-token-from-email"
  }'

# Response: { success: true }

# 3. Login
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "creator@example.com",
    "password": "MySecureP@ss2024!"
  }'

# Response: { success: true, data: { user: { ... } } }
# Session cookie saved to cookies.txt

# 4. Access protected endpoint
curl -X GET http://localhost:3000/api/trpc/auth.getSession \
  -H "Content-Type: application/json" \
  -b cookies.txt

# Response: { id: "...", email: "creator@example.com", ... }
```

---

#### Password Reset Flow

```bash
# 1. Request password reset
curl -X POST http://localhost:3000/api/trpc/auth.requestPasswordReset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com"
  }'

# Response: { success: true, data: { message: "If an account exists..." } }

# 2. Reset password (get token from email)
curl -X POST http://localhost:3000/api/trpc/auth.resetPassword \
  -H "Content-Type: application/json" \
  -d '{
    "token": "64-character-hex-token-from-email",
    "newPassword": "MyNewP@ssword2024!"
  }'

# Response: { success: true, data: { message: "Password reset successfully" } }

# 3. Login with new password
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "creator@example.com",
    "password": "MyNewP@ssword2024!"
  }'

# Response: { success: true, data: { user: { ... } } }
```

---

### 10.2 Error Scenario Examples

#### Invalid Credentials

```bash
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com",
    "password": "WrongPassword123!"
  }'

# Response: 401
# {
#   "code": "UNAUTHORIZED",
#   "message": "Invalid email or password",
#   "cause": { "code": "INVALID_CREDENTIALS", "statusCode": 401 }
# }
```

---

#### Account Locked (After 5 Failed Attempts)

```bash
# Attempt 1-5: Wrong password
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/trpc/auth.login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "creator@example.com",
      "password": "WrongPassword!"
    }'
done

# Attempt 6: Account locked
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com",
    "password": "CorrectPassword!"
  }'

# Response: 423
# {
#   "code": "BAD_REQUEST",
#   "message": "Account has been locked due to too many failed login attempts",
#   "cause": { "code": "ACCOUNT_LOCKED", "statusCode": 423 }
# }
```

---

#### Expired Reset Token

```bash
# Use a token older than 1 hour
curl -X POST http://localhost:3000/api/trpc/auth.resetPassword \
  -H "Content-Type: application/json" \
  -d '{
    "token": "expired-token-from-2-hours-ago",
    "newPassword": "NewP@ssword2024!"
  }'

# Response: 400
# {
#   "code": "BAD_REQUEST",
#   "message": "Invalid or expired token",
#   "cause": { "code": "TOKEN_INVALID", "statusCode": 401 }
# }
```

---

#### Weak Password

```bash
curl -X POST http://localhost:3000/api/trpc/auth.register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "weak",
    "role": "CREATOR"
  }'

# Response: 400
# {
#   "code": "BAD_REQUEST",
#   "message": "Password must be at least 12 characters",
#   "issues": [...]
# }
```

---

#### Email Already Exists

```bash
curl -X POST http://localhost:3000/api/trpc/auth.register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@example.com",
    "password": "MySecureP@ss2024!",
    "role": "CREATOR"
  }'

# Response: 409
# {
#   "code": "CONFLICT",
#   "message": "An account with this email already exists",
#   "cause": { "code": "EMAIL_EXISTS", "statusCode": 409 }
# }
```

---

### 10.3 Edge Cases to Handle

#### 1. Session Expired During Form Submission

```typescript
const handleSubmit = async (data) => {
  try {
    await api.protectedAction.mutate(data);
  } catch (error) {
    if (error.code === 'UNAUTHORIZED') {
      // Session expired mid-action
      showMessage('Your session has expired. Please log in again.');
      
      // Save form data to resume later
      sessionStorage.setItem('pendingAction', JSON.stringify(data));
      
      // Redirect to login
      router.push('/login?redirect=' + encodeURIComponent(router.asPath));
    }
  }
};

// After login, resume action
useEffect(() => {
  const pendingAction = sessionStorage.getItem('pendingAction');
  if (pendingAction && session) {
    const data = JSON.parse(pendingAction);
    resumeAction(data);
    sessionStorage.removeItem('pendingAction');
  }
}, [session]);
```

---

#### 2. Concurrent Login from Multiple Devices

**Backend:** Limited to 5 active sessions per user

**Frontend:** Show active sessions and allow revocation

```typescript
const { data: sessions } = api.auth.getActiveSessions.useQuery();

<Alert severity="info">
  You have {sessions.length} active sessions.
  {sessions.length >= 5 && ' Maximum limit reached. New logins will revoke the oldest session.'}
</Alert>
```

---

#### 3. Password Reset While User is Logged In

```typescript
// Check if user is logged in
const { data: session } = useSession();

if (session) {
  // Redirect to change password instead
  router.push('/settings/security');
}
```

---

#### 4. Token in URL Exposed (Reset Link Shared)

**Backend:** Tokens are single-use and expire in 1 hour

**Frontend:** Show security notice

```tsx
<Alert severity="warning">
  <AlertTitle>Security Notice</AlertTitle>
  Never share password reset links. This link will expire in 1 hour and can only be used once.
</Alert>
```

---

#### 5. Network Failure During Login

```typescript
const handleLogin = async (credentials) => {
  try {
    setLoading(true);
    await loginMutation.mutateAsync(credentials);
  } catch (error) {
    if (error.message === 'Network request failed') {
      showError('Network error. Please check your connection and try again.');
      
      // Optionally retry
      setRetryable(true);
    } else {
      showError(error.message);
    }
  } finally {
    setLoading(false);
  }
};
```

---

#### 6. Remember Me Conflicts with Logout

```typescript
const handleLogout = async () => {
  // Clear remember-me cookie
  document.cookie = 'remember_me=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  
  // Sign out via Auth.js
  await signOut({ callbackUrl: '/' });
};
```

---

## Appendix A: Complete Integration Example

### React Component with All Features

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/trpc/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [failedAttempts, setFailedAttempts] = useState(0);
  
  const { register, handleSubmit, formState: { errors }, setError } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  
  const loginMutation = api.auth.login.useMutation({
    onSuccess: () => {
      router.push('/dashboard');
    },
    onError: (error) => {
      if (error.data?.cause?.code === 'ACCOUNT_LOCKED') {
        setError('root', {
          message: 'Your account has been locked due to multiple failed login attempts. Please try again in 30 minutes or reset your password.',
        });
      } else if (error.code === 'UNAUTHORIZED') {
        setError('root', {
          message: 'Invalid email or password',
        });
        setFailedAttempts(prev => prev + 1);
      } else {
        setError('root', {
          message: 'Login failed. Please try again.',
        });
      }
    },
  });
  
  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        {errors.email && <span role="alert">{errors.email.message}</span>}
      </div>
      
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          {...register('password')}
          aria-invalid={!!errors.password}
        />
        {errors.password && <span role="alert">{errors.password.message}</span>}
      </div>
      
      <div>
        <label>
          <input type="checkbox" {...register('rememberMe')} />
          Remember me for 30 days
        </label>
      </div>
      
      {errors.root && (
        <div role="alert" className="error">
          {errors.root.message}
        </div>
      )}
      
      {failedAttempts > 0 && failedAttempts < 5 && (
        <div role="alert" className="warning">
          You have {5 - failedAttempts} attempts remaining before your account is locked.
        </div>
      )}
      
      <button type="submit" disabled={loginMutation.isLoading}>
        {loginMutation.isLoading ? 'Logging in...' : 'Log In'}
      </button>
      
      <a href="/forgot-password">Forgot password?</a>
    </form>
  );
}
```

---

## Appendix B: Auth.js Provider Setup

```tsx
// app/providers.tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import { TRPCReactProvider } from '@/lib/trpc/client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TRPCReactProvider>
        {children}
      </TRPCReactProvider>
    </SessionProvider>
  );
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

## Appendix C: Environment Variables

```bash
# Authentication
NEXTAUTH_SECRET=your-256-bit-secret-key
NEXTAUTH_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/yg_backend

# Email
POSTMARK_TOKEN=your-postmark-token
POSTMARK_SENDER_EMAIL=noreply@yesgoddess.com

# Redis (Rate Limiting)
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Support & Resources

- **Documentation:** `/docs/modules/authentication/`
- **API Reference:** `/docs/AUTH_IMPLEMENTATION.md`
- **Password Features:** `/docs/modules/authentication/password-features.md`
- **Quick Reference:** `/docs/modules/authentication/quick-reference.md`

---

**Last Updated:** October 12, 2025  
**Version:** 1.0.0  
**Maintained by:** YES GODDESS Engineering Team
