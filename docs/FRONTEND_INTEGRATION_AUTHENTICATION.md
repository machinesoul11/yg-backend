# Frontend Integration Guide: Authentication Module

**Target Audience:** Frontend developers building UI for YesGoddess  
**Backend API Base URL:** `https://ops.yesgoddess.agency`  
**Last Updated:** October 12, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Session Management](#session-management)
10. [Frontend Implementation Checklist](#frontend-implementation-checklist)
11. [Testing Scenarios](#testing-scenarios)

---

## Overview

The YesGoddess authentication system uses **Auth.js (NextAuth v4)** with JWT-based sessions. The backend is deployed separately at `ops.yesgoddess.agency` and provides both Auth.js endpoints and custom REST API endpoints.

### Authentication Strategy
- **Session Strategy:** JWT (stateless)
- **Session Duration:** 30 days
- **Session Refresh:** Every 24 hours
- **Supported Methods:** Email/Password, Google OAuth, GitHub OAuth, LinkedIn OAuth
- **Security Features:** CSRF protection, secure cookies, account lockout, password history

### Key Features
- Email verification with magic links
- Password reset via email tokens
- Account lockout after 5 failed login attempts
- Password history (last 10 passwords blocked)
- Role-based access control (ADMIN, CREATOR, BRAND, VIEWER)
- Audit logging for all authentication events

---

## API Endpoints

### Auth.js Endpoints (Handled by NextAuth)

These endpoints are automatically provided by Auth.js and should be used via the Auth.js client library:

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/signin` | GET | Display sign-in page | No |
| `/api/auth/signin` | POST | Sign in with credentials | No |
| `/api/auth/signout` | POST | Sign out current session | Yes |
| `/api/auth/session` | GET | Get current session | No |
| `/api/auth/csrf` | GET | Get CSRF token | No |
| `/api/auth/callback/:provider` | GET/POST | OAuth callback handler | No |
| `/api/auth/providers` | GET | List available providers | No |

### Custom REST API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/verify-email` | POST | Verify email with token | No |
| `/api/auth/resend-verification` | POST | Resend verification email | No |

> **Note:** Registration, password reset, and password change are handled internally by the Auth.js flow and AuthService but may not have dedicated REST endpoints exposed. Check with backend team if these need to be exposed as REST APIs.

---

## Request/Response Examples

### 1. Sign In with Credentials

**Using Auth.js Client (Recommended):**

```typescript
import { signIn } from 'next-auth/react';

// In your component
const handleSignIn = async (email: string, password: string) => {
  const result = await signIn('credentials', {
    email,
    password,
    redirect: false, // Don't redirect automatically
  });

  if (result?.error) {
    // Handle error
    console.error('Sign in failed:', result.error);
  } else {
    // Success - redirect or update UI
    window.location.href = '/dashboard';
  }
};
```

**Direct API Call (Not Recommended):**

```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/callback/credentials \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "csrfToken": "CSRF_TOKEN_HERE"
  }'
```

**Success Response:**
```json
{
  "url": "https://ops.yesgoddess.agency/dashboard",
  "ok": true
}
```

**Error Response (Invalid Credentials):**
```json
{
  "error": "CredentialsSignin",
  "ok": false
}
```

---

### 2. Get Current Session

**Using Auth.js Client (Recommended):**

```typescript
import { useSession } from 'next-auth/react';

function ProfileComponent() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return <div>Not signed in</div>;
  }

  return (
    <div>
      <p>Signed in as {session.user.email}</p>
      <p>Role: {session.user.role}</p>
      <p>Email Verified: {session.user.emailVerified ? 'Yes' : 'No'}</p>
    </div>
  );
}
```

**Direct API Call:**

```bash
curl https://ops.yesgoddess.agency/api/auth/session \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Success Response:**
```json
{
  "user": {
    "id": "clx123abc",
    "email": "creator@example.com",
    "name": "Jane Creator",
    "image": "https://example.com/avatar.jpg",
    "role": "CREATOR",
    "emailVerified": true,
    "creatorId": "clx456def",
    "creatorVerificationStatus": "VERIFIED",
    "creatorOnboardingStatus": "COMPLETE",
    "isAdmin": false,
    "isCreator": true,
    "isBrand": false
  },
  "expires": "2025-11-11T12:00:00.000Z"
}
```

**No Session Response:**
```json
{}
```

---

### 3. Verify Email

**Endpoint:** `POST /api/auth/verify-email`

**Request:**
```typescript
const verifyEmail = async (token: string) => {
  const response = await fetch('https://ops.yesgoddess.agency/api/auth/verify-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  
  return response.json();
};
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Error Response (400 - Invalid Token):**
```json
{
  "success": false,
  "message": "Invalid verification token"
}
```

**Error Response (400 - Token Expired):**
```json
{
  "success": false,
  "message": "Verification token has expired"
}
```

**Error Response (400 - Already Verified):**
```json
{
  "success": false,
  "message": "Email is already verified"
}
```

---

### 4. Resend Verification Email

**Endpoint:** `POST /api/auth/resend-verification`

**Rate Limit:** 3 requests per 10 minutes per IP/email

**Request:**
```typescript
const resendVerification = async (email: string) => {
  const response = await fetch('https://ops.yesgoddess.agency/api/auth/resend-verification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  
  return response.json();
};
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent. Please check your inbox."
}
```

**Error Response (429 - Rate Limited):**
```json
{
  "success": false,
  "message": "Too many requests. Please try again in 5 minutes."
}
```

**Error Response (400 - Already Verified):**
```json
{
  "success": false,
  "message": "Email is already verified"
}
```

**Security Note:** The endpoint returns success even if the user doesn't exist to prevent email enumeration attacks.

---

### 5. Sign Out

**Using Auth.js Client (Recommended):**

```typescript
import { signOut } from 'next-auth/react';

const handleSignOut = async () => {
  await signOut({
    redirect: true,
    callbackUrl: '/',
  });
};
```

**Direct API Call:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/auth/signout \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=CSRF_TOKEN_HERE"
```

---

### 6. OAuth Sign In (Google/GitHub/LinkedIn)

**Using Auth.js Client:**

```typescript
import { signIn } from 'next-auth/react';

// Google Sign In
const handleGoogleSignIn = () => {
  signIn('google', {
    callbackUrl: '/dashboard',
  });
};

// GitHub Sign In
const handleGitHubSignIn = () => {
  signIn('github', {
    callbackUrl: '/dashboard',
  });
};

// LinkedIn Sign In
const handleLinkedInSignIn = () => {
  signIn('linkedin', {
    callbackUrl: '/dashboard',
  });
};
```

**OAuth Flow:**
1. User clicks "Sign in with Google"
2. Redirect to Google OAuth consent screen
3. User authorizes
4. Redirect back to `/api/auth/callback/google`
5. Backend creates/updates user and establishes session
6. Frontend receives session cookie
7. Redirect to `callbackUrl`

---

## TypeScript Type Definitions

### Copy these types to your frontend project:

```typescript
// types/auth.ts

/**
 * User Roles
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}

/**
 * User object from session
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  emailVerified: boolean;
  
  // Creator-specific fields
  creatorId?: string;
  creatorVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  creatorOnboardingStatus?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  
  // Brand-specific fields
  brandId?: string;
  brandVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  isBrandVerified?: boolean;
  
  // Computed properties
  isAdmin: boolean;
  isCreator: boolean;
  isBrand: boolean;
}

/**
 * Session object
 */
export interface AuthSession {
  user: SessionUser;
  expires: string; // ISO 8601 date string
}

/**
 * Sign in credentials
 */
export interface SignInCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Registration input
 */
export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  role: 'CREATOR' | 'BRAND'; // Users cannot self-register as ADMIN
}

/**
 * Email verification input
 */
export interface VerifyEmailInput {
  token: string; // 64-character hex string
}

/**
 * Resend verification input
 */
export interface ResendVerificationInput {
  email: string;
}

/**
 * Password reset request input
 */
export interface RequestPasswordResetInput {
  email: string;
}

/**
 * Password reset input
 */
export interface ResetPasswordInput {
  token: string; // 64-character hex string
  newPassword: string;
}

/**
 * Change password input
 */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Update profile input
 */
export interface UpdateProfileInput {
  name?: string;
  avatar?: string; // URL
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

/**
 * Auth error codes
 */
export enum AuthErrorCode {
  // Registration
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
  
  // Login
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Token
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_USED = 'TOKEN_USED',
  ALREADY_VERIFIED = 'ALREADY_VERIFIED',
  
  // Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_SESSION = 'INVALID_SESSION',
  
  // Password
  INVALID_CURRENT_PASSWORD = 'INVALID_CURRENT_PASSWORD',
  PASSWORD_REUSE = 'PASSWORD_REUSE',
  WEAK_PASSWORD_STRENGTH = 'WEAK_PASSWORD_STRENGTH',
  
  // Account
  PENDING_OBLIGATIONS = 'PENDING_OBLIGATIONS',
}

/**
 * Auth error object
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  statusCode: number;
}
```

### Zod Schemas (for frontend validation)

```typescript
// lib/validation/auth.ts
import { z } from 'zod';

/**
 * Password validation
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(100, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

/**
 * Sign in validation
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Registration validation
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(255).optional(),
  role: z.enum(['CREATOR', 'BRAND']),
});

/**
 * Email verification validation
 */
export const verifyEmailSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
});

/**
 * Resend verification validation
 */
export const resendVerificationSchema = z.object({
  email: emailSchema,
});

/**
 * Password reset request validation
 */
export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

/**
 * Password reset validation
 */
export const resetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
  newPassword: passwordSchema,
});

/**
 * Change password validation
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

/**
 * Profile update validation
 */
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
});
```

---

## Business Logic & Validation Rules

### Password Requirements

The backend enforces strict password requirements:

| Requirement | Rule |
|-------------|------|
| Minimum Length | 12 characters |
| Maximum Length | 100 characters |
| Uppercase | At least 1 uppercase letter (A-Z) |
| Lowercase | At least 1 lowercase letter (a-z) |
| Numbers | At least 1 number (0-9) |
| Special Characters | At least 1 special character (!@#$%^&*) |
| Common Passwords | Blocked (e.g., "Password123!") |
| Sequential Characters | Blocked (e.g., "abcd1234") |
| Repeated Characters | Blocked (e.g., "aaaa1111") |
| Password History | Cannot reuse last 10 passwords |

**Frontend Validation:**
- Implement real-time password strength indicator
- Show requirements checklist as user types
- Highlight which requirements are met/unmet
- Block form submission if password doesn't meet requirements

### Email Validation

| Rule | Implementation |
|------|----------------|
| Format | Must be valid email format |
| Normalization | Convert to lowercase, trim whitespace |
| Max Length | 255 characters |
| Uniqueness | Backend checks (409 if exists) |

### Account Lockout Rules

| Parameter | Value |
|-----------|-------|
| Failed Attempts Threshold | 5 attempts |
| Lockout Duration | 30 minutes |
| Lockout Trigger | 5 failed login attempts within any time window |
| Reset Condition | Successful login resets counter |

**Frontend Considerations:**
- Show remaining attempts after failed login (e.g., "2 attempts remaining")
- Display lockout message with countdown timer
- Offer "Forgot Password?" link after 2-3 failed attempts
- DO NOT reveal if email exists (security)

### Email Verification

| Rule | Value |
|------|-------|
| Token Length | 64 characters (hex) |
| Token Expiry | 24 hours |
| Verification Required? | No (optional - users can login without verification) |
| Auto-send on Registration | Yes |
| Resend Limit | 3 requests per 10 minutes |

**Frontend Flow:**
1. User registers → Show "Check your email" message
2. User clicks link in email → Redirect to `/auth/verify-email?token=...`
3. Frontend calls `/api/auth/verify-email` with token
4. Show success message and redirect to dashboard
5. If expired, show "Request new link" button

### Password Reset

| Rule | Value |
|------|-------|
| Token Length | 64 characters (hex) |
| Token Expiry | 1 hour |
| Token Single Use | Yes (cannot reuse) |
| Sessions Invalidated | Yes (all user sessions) |

**Frontend Flow:**
1. User clicks "Forgot Password?"
2. User enters email → Call password reset endpoint
3. Show "Check your email" (even if email doesn't exist)
4. User clicks link in email → Redirect to reset form
5. User enters new password → Call reset password endpoint
6. Show success message → Redirect to login

### Session Behavior

| Parameter | Value |
|-----------|-------|
| Session Duration | 30 days |
| Session Refresh | Every 24 hours (automatic) |
| Sliding Window | Yes (activity extends session) |
| Concurrent Sessions | Allowed (multiple devices) |
| Remember Me | Not implemented (all sessions are 30 days) |

**Frontend Handling:**
- Monitor session expiration
- Refresh session token periodically (Auth.js handles this)
- Redirect to login on session expiry
- Show "Session expired" message
- Offer "Stay signed in" checkbox (future feature)

### Role Assignment

| Role | Self-Register? | Default Permissions |
|------|----------------|---------------------|
| ADMIN | No | Full system access |
| CREATOR | Yes | Creator dashboard, IP assets management |
| BRAND | Yes | Brand dashboard, licensing requests |
| VIEWER | No | Read-only access (future use) |

**Frontend Implications:**
- Registration form shows CREATOR/BRAND options only
- ADMIN role is assigned manually by backend
- Different dashboards per role
- Role-based navigation menus

---

## Error Handling

### HTTP Status Codes

| Status | Meaning | When Used |
|--------|---------|-----------|
| 200 | Success | Successful operation |
| 400 | Bad Request | Validation error, invalid input |
| 401 | Unauthorized | Not authenticated or invalid credentials |
| 403 | Forbidden | Authenticated but not authorized |
| 409 | Conflict | Email already exists |
| 410 | Gone | Account deleted |
| 423 | Locked | Account locked due to failed attempts |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Error Response Format

All errors follow this structure:

```typescript
{
  "success": false,
  "message": "Human-readable error message",
  "code"?: "ERROR_CODE", // Optional error code
}
```

### Auth Error Codes Reference

| Code | HTTP Status | User Message | When to Show | Action |
|------|-------------|--------------|--------------|--------|
| `EMAIL_EXISTS` | 409 | "An account with this email already exists" | Registration | Offer sign-in link |
| `WEAK_PASSWORD` | 400 | "Password does not meet security requirements" | Registration, Password Change | Show requirements |
| `INVALID_CREDENTIALS` | 401 | "Invalid email or password" | Login | Show generic error (don't specify which is wrong) |
| `ACCOUNT_LOCKED` | 423 | "Account locked due to too many failed login attempts. Try again in X minutes." | Login | Show countdown timer |
| `ACCOUNT_DELETED` | 410 | "This account has been deleted" | Login | Contact support link |
| `EMAIL_NOT_VERIFIED` | 403 | "Please verify your email address" | Login (if enforced) | Show resend link |
| `RATE_LIMIT_EXCEEDED` | 429 | "Too many requests. Please try again in X minutes." | Any | Show countdown |
| `TOKEN_INVALID` | 401 | "Invalid verification link" | Email verification | Offer resend |
| `TOKEN_EXPIRED` | 401 | "Verification link has expired" | Email verification, Password Reset | Offer resend |
| `TOKEN_USED` | 400 | "This reset link has already been used" | Password Reset | Request new link |
| `ALREADY_VERIFIED` | 400 | "Email already verified" | Resend verification | Redirect to login |
| `UNAUTHORIZED` | 401 | "Please sign in to continue" | Protected routes | Redirect to login |
| `FORBIDDEN` | 403 | "You don't have permission to access this resource" | Protected routes | Show 403 page |
| `INVALID_SESSION` | 401 | "Your session has expired" | API calls | Refresh or redirect to login |
| `INVALID_CURRENT_PASSWORD` | 401 | "Current password is incorrect" | Change Password | Allow retry |
| `PASSWORD_REUSE` | 400 | "Cannot reuse your last 10 passwords" | Change Password, Reset Password | Require new password |
| `PENDING_OBLIGATIONS` | 409 | "Cannot delete account with pending financial obligations" | Account Deletion | Show pending items |

### Frontend Error Handling Best Practices

#### 1. Generic Error Messages for Security

**❌ DON'T:**
```typescript
if (error.code === 'USER_NOT_FOUND') {
  setError('No account found with that email');
}
```

**✅ DO:**
```typescript
if (error.code === 'INVALID_CREDENTIALS') {
  setError('Invalid email or password'); // Don't reveal which is wrong
}
```

#### 2. Helpful Error Recovery

```typescript
const handleAuthError = (error: AuthError) => {
  switch (error.code) {
    case AuthErrorCode.ACCOUNT_LOCKED:
      // Show countdown and support link
      setErrorUI({
        message: error.message,
        action: <ContactSupport />,
        countdown: 30 * 60, // 30 minutes in seconds
      });
      break;
      
    case AuthErrorCode.TOKEN_EXPIRED:
      // Offer to resend
      setErrorUI({
        message: error.message,
        action: <ResendButton />,
      });
      break;
      
    case AuthErrorCode.EMAIL_EXISTS:
      // Offer sign in instead
      setErrorUI({
        message: error.message,
        action: <Link href="/auth/signin">Sign in instead</Link>,
      });
      break;
      
    default:
      // Generic error
      setErrorUI({
        message: 'Something went wrong. Please try again.',
      });
  }
};
```

#### 3. Network Error Handling

```typescript
try {
  const response = await fetch('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    handleAuthError(error);
    return;
  }
  
  const data = await response.json();
  // Handle success
} catch (error) {
  // Network error
  setError('Unable to connect. Please check your internet connection.');
}
```

#### 4. Toast Notifications vs Inline Errors

**Use Toast for:**
- Successful operations (e.g., "Email verified!")
- Non-blocking errors (e.g., "Session refreshed")
- Background operations

**Use Inline Errors for:**
- Form validation errors
- Critical errors requiring action
- Login failures

---

## Authorization & Permissions

### Role-Based Access Control

The backend enforces role-based access at multiple levels:

1. **Session Level:** Role is embedded in JWT token
2. **Route Level:** Middleware protects routes by role
3. **API Level:** Endpoints check user role before processing

### Role Capabilities Matrix

| Feature | ADMIN | CREATOR | BRAND | VIEWER |
|---------|-------|---------|-------|--------|
| View Dashboard | ✅ | ✅ | ✅ | ✅ |
| Manage Own Profile | ✅ | ✅ | ✅ | ✅ |
| Create IP Assets | ✅ | ✅ | ❌ | ❌ |
| Submit License Requests | ✅ | ❌ | ✅ | ❌ |
| Approve Licenses | ✅ | ✅ (own assets) | ❌ | ❌ |
| View Royalties | ✅ | ✅ (own) | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ |
| Access Admin Panel | ✅ | ❌ | ❌ | ❌ |

### Frontend Route Protection

**Example with Next.js Middleware:**

```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Admin routes
    if (path.startsWith('/admin') && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/403', req.url));
    }

    // Creator routes
    if (path.startsWith('/creator') && token?.role !== 'CREATOR' && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/403', req.url));
    }

    // Brand routes
    if (path.startsWith('/brand') && token?.role !== 'BRAND' && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/403', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/admin/:path*', '/creator/:path*', '/brand/:path*', '/dashboard/:path*'],
};
```

### Role-Based UI Rendering

```typescript
// components/RoleGate.tsx
import { useSession } from 'next-auth/react';
import { UserRole } from '@/types/auth';

interface RoleGateProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { data: session } = useSession();
  
  if (!session || !allowedRoles.includes(session.user.role as UserRole)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// Usage
<RoleGate allowedRoles={[UserRole.ADMIN, UserRole.CREATOR]}>
  <CreateIPAssetButton />
</RoleGate>
```

### Computed Permission Helpers

The session includes helper boolean flags:

```typescript
const { data: session } = useSession();

// Use these computed properties
if (session?.user.isAdmin) {
  // Show admin features
}

if (session?.user.isCreator) {
  // Show creator features
}

if (session?.user.isBrand) {
  // Show brand features
}
```

### Creator/Brand-Specific Data

For CREATOR role:
```typescript
session.user.creatorId // Creator record ID
session.user.creatorVerificationStatus // 'PENDING' | 'VERIFIED' | 'REJECTED'
session.user.creatorOnboardingStatus // 'PENDING' | 'IN_PROGRESS' | 'COMPLETE'
```

For BRAND role:
```typescript
session.user.brandId // Brand record ID
session.user.brandVerificationStatus // 'PENDING' | 'VERIFIED' | 'REJECTED'
session.user.isBrandVerified // boolean
```

**Use Cases:**
- Show verification banner if status is PENDING
- Block certain features if not verified
- Show onboarding steps if incomplete

---

## Rate Limiting & Quotas

### Rate Limits by Endpoint

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `/api/auth/resend-verification` | 3 requests | 10 minutes | Per IP or email |
| All API endpoints | 100 requests | 15 minutes | Per IP |

### Rate Limit Headers

The backend returns these headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699999999
```

### Frontend Rate Limit Handling

```typescript
// lib/api/client.ts
import { useRateLimit } from '@/hooks/useRateLimit';

const apiClient = {
  async post(url: string, data: any) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    // Check for rate limit
    if (response.status === 429) {
      const data = await response.json();
      const retryAfter = response.headers.get('Retry-After');
      
      throw new RateLimitError(
        data.message,
        retryAfter ? parseInt(retryAfter) : 600
      );
    }

    return response;
  },
};

// Usage in component
function ResendVerificationButton({ email }: { email: string }) {
  const { isLimited, remainingTime, recordAttempt } = useRateLimit('resend-verification');
  
  const handleResend = async () => {
    if (isLimited) {
      toast.error(`Please wait ${remainingTime} seconds before trying again`);
      return;
    }
    
    try {
      await apiClient.post('/api/auth/resend-verification', { email });
      recordAttempt();
      toast.success('Verification email sent!');
    } catch (error) {
      if (error instanceof RateLimitError) {
        toast.error(error.message);
      }
    }
  };
  
  return (
    <button onClick={handleResend} disabled={isLimited}>
      {isLimited ? `Wait ${remainingTime}s` : 'Resend Email'}
    </button>
  );
}
```

### Client-Side Rate Limiting

Implement client-side rate limiting to prevent unnecessary API calls:

```typescript
// hooks/useRateLimit.ts
import { useState, useEffect } from 'react';

export function useRateLimit(key: string, limit: number = 3, windowMs: number = 10 * 60 * 1000) {
  const [attempts, setAttempts] = useState<number[]>([]);
  
  useEffect(() => {
    // Clean up old attempts
    const now = Date.now();
    setAttempts(prev => prev.filter(timestamp => now - timestamp < windowMs));
  }, [windowMs]);
  
  const isLimited = attempts.length >= limit;
  
  const remainingTime = isLimited
    ? Math.ceil((attempts[0] + windowMs - Date.now()) / 1000)
    : 0;
  
  const recordAttempt = () => {
    setAttempts(prev => [...prev, Date.now()]);
  };
  
  return { isLimited, remainingTime, recordAttempt, attemptsRemaining: limit - attempts.length };
}
```

---

## Session Management

### Session Lifecycle

```
┌─────────────┐
│   Sign In   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Create JWT Token    │
│ (30-day expiry)     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Set Secure Cookie   │
│ (httpOnly, secure)  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ User Activity       │
│ (Every 24hrs)       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Refresh Token       │
│ (Sliding window)    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Session Expires or  │
│ User Signs Out      │
└─────────────────────┘
```

### Session State Management

**Using Auth.js Hooks:**

```typescript
import { useSession } from 'next-auth/react';

function MyComponent() {
  const { data: session, status, update } = useSession();
  
  // status: 'loading' | 'authenticated' | 'unauthenticated'
  
  if (status === 'loading') {
    return <LoadingSpinner />;
  }
  
  if (status === 'unauthenticated') {
    return <SignInPrompt />;
  }
  
  // Manually update session after profile change
  const handleProfileUpdate = async () => {
    await updateProfile(newData);
    await update(); // Refreshes session from server
  };
  
  return <div>Welcome, {session.user.name}!</div>;
}
```

### Session Refresh Strategy

Auth.js automatically refreshes the session every 24 hours (configured via `updateAge`). No manual refresh needed in most cases.

**Manual Refresh (Edge Cases):**
```typescript
import { useSession } from 'next-auth/react';

// After role change, email verification, etc.
const { update } = useSession();
await update(); // Forces session refresh
```

### Session Expiry Handling

```typescript
// app/providers/SessionProvider.tsx
'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

function SessionExpiryWatcher() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      // Session expired or user signed out
      router.push('/auth/signin?error=SessionExpired');
    }
  }, [status, router]);
  
  // Check expiry time
  useEffect(() => {
    if (!session) return;
    
    const expiryTime = new Date(session.expires).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;
    
    // Warn user 5 minutes before expiry
    if (timeUntilExpiry > 0 && timeUntilExpiry < 5 * 60 * 1000) {
      toast.warning('Your session will expire soon. Please save your work.');
    }
    
    // Set timeout to redirect on expiry
    const timeoutId = setTimeout(() => {
      router.push('/auth/signin?error=SessionExpired');
    }, timeUntilExpiry);
    
    return () => clearTimeout(timeoutId);
  }, [session, router]);
  
  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SessionExpiryWatcher />
      {children}
    </NextAuthSessionProvider>
  );
}
```

### Persistent Login (Remember Me)

Currently, all sessions are 30 days by default. Future implementation may include:
- Short sessions (24 hours) for non-remembered logins
- Long sessions (30 days) for remembered logins

**UI Implementation:**
```typescript
// Add checkbox to login form (not yet functional)
<input
  type="checkbox"
  id="rememberMe"
  {...register('rememberMe')}
/>
<label htmlFor="rememberMe">Remember me for 30 days</label>
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Authentication (Week 1)

- [ ] **Install Auth.js**
  ```bash
  npm install next-auth @auth/prisma-adapter
  ```

- [ ] **Configure Auth.js Provider**
  - [ ] Create `app/providers/SessionProvider.tsx`
  - [ ] Wrap app with SessionProvider in root layout
  - [ ] Add NEXTAUTH_SECRET and NEXTAUTH_URL to `.env.local`

- [ ] **Create Sign In Page**
  - [ ] Email/password form with validation
  - [ ] "Remember me" checkbox (UI only for now)
  - [ ] "Forgot password?" link
  - [ ] Google/GitHub/LinkedIn OAuth buttons
  - [ ] Error handling for invalid credentials
  - [ ] Link to registration page

- [ ] **Create Registration Page**
  - [ ] Email/password form with validation
  - [ ] Name field (optional)
  - [ ] Role selection (CREATOR/BRAND)
  - [ ] Password strength indicator
  - [ ] Terms of service checkbox
  - [ ] Success message with "Check your email" prompt
  - [ ] Link to sign-in page

- [ ] **Implement Session Handling**
  - [ ] Use `useSession()` hook in components
  - [ ] Create loading states for authentication status
  - [ ] Implement session refresh on profile updates
  - [ ] Handle session expiry with redirect

### Phase 2: Email Verification (Week 1)

- [ ] **Email Verification Page**
  - [ ] Create `/auth/verify-email` page
  - [ ] Extract token from URL query params
  - [ ] Call `/api/auth/verify-email` endpoint
  - [ ] Show success message and redirect to dashboard
  - [ ] Handle expired/invalid token errors
  - [ ] Offer "Resend verification email" button

- [ ] **Resend Verification Flow**
  - [ ] Create resend verification component
  - [ ] Email input with validation
  - [ ] Rate limiting UI (disable button, show countdown)
  - [ ] Success toast notification
  - [ ] Error handling

- [ ] **Verification Status Banner**
  - [ ] Show banner if `session.user.emailVerified === false`
  - [ ] "Verify your email" message with resend button
  - [ ] Dismissible or persistent based on business rules
  - [ ] Hide after verification

### Phase 3: Password Management (Week 2)

- [ ] **Forgot Password Flow**
  - [ ] Create `/auth/forgot-password` page
  - [ ] Email input form
  - [ ] Success message (even if email doesn't exist)
  - [ ] Redirect to check-email page

- [ ] **Password Reset Flow**
  - [ ] Create `/auth/reset-password` page
  - [ ] Extract token from URL query params
  - [ ] New password form with confirmation
  - [ ] Password strength indicator
  - [ ] Call password reset endpoint (if exposed)
  - [ ] Show success and redirect to login
  - [ ] Handle expired/used token errors

- [ ] **Change Password (Settings)**
  - [ ] Create change password form in settings
  - [ ] Current password field
  - [ ] New password field with confirmation
  - [ ] Password strength indicator
  - [ ] Show success toast
  - [ ] Handle "password reuse" error
  - [ ] Invalidate other sessions (notify user)

### Phase 4: Protected Routes & Authorization (Week 2)

- [ ] **Middleware Protection**
  - [ ] Configure Next.js middleware for route protection
  - [ ] Protect `/dashboard/*` routes
  - [ ] Protect `/admin/*` routes (ADMIN only)
  - [ ] Protect `/creator/*` routes (CREATOR + ADMIN)
  - [ ] Protect `/brand/*` routes (BRAND + ADMIN)
  - [ ] Redirect unauthenticated users to sign-in
  - [ ] Show 403 page for unauthorized access

- [ ] **Role-Based UI Components**
  - [ ] Create `<RoleGate>` component
  - [ ] Hide/show navigation items based on role
  - [ ] Create role-specific dashboards
  - [ ] Show verification status banners
  - [ ] Disable features if not verified

- [ ] **Server-Side Auth Checks**
  - [ ] Use `getServerSession()` in Server Components
  - [ ] Protect API routes with auth checks
  - [ ] Return 401/403 for unauthorized requests

### Phase 5: User Experience Enhancements (Week 3)

- [ ] **Account Lockout Handling**
  - [ ] Show "X attempts remaining" after failed login
  - [ ] Display lockout message with countdown timer
  - [ ] Offer "Forgot password?" after 2-3 failed attempts
  - [ ] Show support contact link when locked

- [ ] **Session Expiry Warning**
  - [ ] Show toast 5 minutes before expiry
  - [ ] Create "Extend session" dialog
  - [ ] Auto-redirect on expiry with message
  - [ ] Preserve form data in localStorage (optional)

- [ ] **OAuth Integration**
  - [ ] Add Google sign-in button with branding
  - [ ] Add GitHub sign-in button
  - [ ] Add LinkedIn sign-in button
  - [ ] Handle OAuth errors gracefully
  - [ ] Show account linking success message

- [ ] **Loading States**
  - [ ] Skeleton loaders for session loading
  - [ ] Button loading states (spinners)
  - [ ] Page transitions during authentication
  - [ ] Optimistic UI updates

- [ ] **Error Boundaries**
  - [ ] Wrap auth components in error boundaries
  - [ ] Show friendly error messages
  - [ ] Log errors to monitoring service
  - [ ] Provide fallback UI

### Phase 6: Testing & Polish (Week 3)

- [ ] **Manual Testing**
  - [ ] Test all authentication flows
  - [ ] Test on multiple browsers
  - [ ] Test on mobile devices
  - [ ] Test OAuth providers
  - [ ] Test error scenarios

- [ ] **Automated Tests**
  - [ ] Unit tests for validation functions
  - [ ] Integration tests for auth flows
  - [ ] E2E tests with Playwright/Cypress
  - [ ] Test role-based access control

- [ ] **Accessibility**
  - [ ] Keyboard navigation for all forms
  - [ ] Screen reader labels
  - [ ] Focus management
  - [ ] Error announcements
  - [ ] ARIA attributes

- [ ] **Performance**
  - [ ] Optimize session checks
  - [ ] Implement request caching
  - [ ] Lazy load auth components
  - [ ] Reduce bundle size

### Edge Cases to Handle

- [ ] User closes tab during email verification
- [ ] Token expires while user is on verification page
- [ ] User tries to register with OAuth-only email
- [ ] Multiple tabs with different sessions
- [ ] Network errors during authentication
- [ ] Session expires while user is filling a form
- [ ] User clicks verification link multiple times
- [ ] Account deleted between sign-in attempts

---

## Testing Scenarios

### Happy Path Tests

#### 1. User Registration (Email/Password)
```
1. Navigate to /auth/register
2. Enter valid email: "test@example.com"
3. Enter strong password: "SecurePass123!@#"
4. Select role: CREATOR
5. Submit form
6. Expect: Success message "Check your email for verification link"
7. Check inbox for verification email
8. Click verification link
9. Expect: Redirect to dashboard with "Email verified" message
```

**Test Data:**
```typescript
{
  email: "testuser@example.com",
  password: "MySecurePass123!",
  name: "Test User",
  role: "CREATOR"
}
```

#### 2. Email Verification
```
1. Register new account
2. Extract token from email: "abcd...1234" (64 chars)
3. Navigate to /auth/verify-email?token=abcd...1234
4. Expect: "Email verified successfully" message
5. Expect: Redirect to dashboard
6. Check session: emailVerified should be true
```

**Test Data:**
```typescript
{
  token: "a".repeat(64) // 64-character hex string
}
```

#### 3. Sign In with Credentials
```
1. Navigate to /auth/signin
2. Enter email: "test@example.com"
3. Enter password: "SecurePass123!@#"
4. Submit form
5. Expect: Redirect to dashboard
6. Check session: user should be authenticated
```

#### 4. OAuth Sign In (Google)
```
1. Navigate to /auth/signin
2. Click "Sign in with Google"
3. Authorize on Google consent screen
4. Expect: Redirect back to app
5. Expect: Session established
6. Check session: user.email should match Google email
```

#### 5. Password Reset
```
1. Navigate to /auth/forgot-password
2. Enter email: "test@example.com"
3. Submit form
4. Expect: "Check your email" message
5. Check inbox for reset email
6. Click reset link
7. Navigate to /auth/reset-password?token=xyz...
8. Enter new password: "NewSecurePass456!@#"
9. Submit form
10. Expect: "Password reset successful" message
11. Sign in with new password
12. Expect: Successful login
```

#### 6. Sign Out
```
1. Sign in
2. Click "Sign out" button
3. Expect: Redirect to homepage
4. Check session: should be null
5. Try to access /dashboard
6. Expect: Redirect to /auth/signin
```

---

### Error Scenario Tests

#### 1. Registration with Existing Email
```
Input: { email: "existing@example.com", password: "Pass123!", role: "CREATOR" }
Expected Response: 409 Conflict
Expected Message: "An account with this email already exists"
Expected UI: Show error message with "Sign in instead" link
```

#### 2. Weak Password
```
Input: { email: "new@example.com", password: "password", role: "CREATOR" }
Expected Response: 400 Bad Request
Expected Message: "Password does not meet security requirements"
Expected UI: Highlight failed password requirements
```

#### 3. Invalid Login Credentials
```
Input: { email: "test@example.com", password: "WrongPassword" }
Expected Response: 401 Unauthorized
Expected Message: "Invalid email or password"
Expected UI: Generic error message (don't reveal which is wrong)
```

#### 4. Account Lockout (5 Failed Attempts)
```
Steps:
1. Attempt login with wrong password (1st attempt)
2. Attempt login with wrong password (2nd attempt)
   - Expect: "3 attempts remaining" message
3. Attempt login with wrong password (3rd attempt)
   - Expect: "2 attempts remaining" message
4. Attempt login with wrong password (4th attempt)
   - Expect: "1 attempt remaining" message
5. Attempt login with wrong password (5th attempt)
   - Expect: 423 Locked
   - Expect: "Account locked for 30 minutes" message
6. Wait or manually unlock
7. Successful login should reset counter
```

#### 5. Expired Verification Token
```
Input: { token: "expired_token_64_chars..." }
Expected Response: 400 Bad Request
Expected Message: "Verification token has expired"
Expected UI: Show "Request new verification link" button
```

#### 6. Already Verified Email
```
Steps:
1. Verify email with token
2. Try to verify again with same token
Expected Response: 400 Bad Request
Expected Message: "Email is already verified"
Expected UI: Show "Already verified" message with "Go to dashboard" link
```

#### 7. Rate Limit Exceeded (Resend Verification)
```
Steps:
1. Request verification email (1st time)
2. Request verification email (2nd time)
3. Request verification email (3rd time)
4. Request verification email (4th time - should fail)
Expected Response: 429 Too Many Requests
Expected Message: "Too many requests. Please try again in X minutes."
Expected UI: Disable button with countdown timer
```

#### 8. Session Expired
```
Steps:
1. Sign in
2. Manually expire session (wait 30 days or delete cookie)
3. Try to access protected route
Expected Response: 401 Unauthorized
Expected UI: Redirect to /auth/signin?error=SessionExpired
Expected Message: "Your session has expired. Please sign in again."
```

#### 9. Invalid Token Format
```
Input: { token: "short_token" } // Not 64 characters
Expected Response: 400 Bad Request
Expected Message: "Invalid token format"
Expected UI: Show error with "Request new link" button
```

#### 10. Password Reuse
```
Steps:
1. Sign in
2. Navigate to /settings/security
3. Change password to one of last 10 passwords
Expected Response: 400 Bad Request
Expected Message: "Cannot reuse your last 10 passwords"
Expected UI: Show error and require different password
```

---

### Integration Test Examples

#### Using Playwright

```typescript
// tests/auth/signin.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should sign in successfully with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });
  
  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'WrongPassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email or password')).toBeVisible();
  });
  
  test('should lock account after 5 failed attempts', async ({ page }) => {
    await page.goto('/auth/signin');
    
    for (let i = 0; i < 5; i++) {
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'WrongPassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }
    
    await expect(page.locator('text=Account locked')).toBeVisible();
  });
});
```

#### Using React Testing Library

```typescript
// components/auth/__tests__/SignInForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignInForm } from '../SignInForm';
import { signIn } from 'next-auth/react';

jest.mock('next-auth/react');

describe('SignInForm', () => {
  it('should submit form with valid credentials', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true });
    
    render(<SignInForm />);
    
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'SecurePass123!' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'SecurePass123!',
        redirect: false,
      });
    });
  });
  
  it('should show error for invalid credentials', async () => {
    (signIn as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'CredentialsSignin',
    });
    
    render(<SignInForm />);
    
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'WrongPass' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });
});
```

---

## API Client Example

Here's a complete API client implementation for your frontend:

```typescript
// lib/api/auth-client.ts
import { ApiResponse, AuthErrorCode } from '@/types/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';

export class AuthApiClient {
  /**
   * Verify email with token
   */
  static async verifyEmail(token: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new AuthError(
        data.code || AuthErrorCode.TOKEN_INVALID,
        data.message || 'Verification failed',
        response.status
      );
    }
    
    return data;
  }
  
  /**
   * Resend verification email
   */
  static async resendVerification(email: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new AuthError(
        data.code || AuthErrorCode.RATE_LIMIT_EXCEEDED,
        data.message || 'Failed to resend verification email',
        response.status
      );
    }
    
    return data;
  }
}

/**
 * Custom Auth Error class
 */
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
```

---

## React Query Integration

For optimal data fetching and caching:

```typescript
// hooks/useAuth.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { AuthApiClient } from '@/lib/api/auth-client';

/**
 * Hook for email verification
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => AuthApiClient.verifyEmail(token),
    onSuccess: () => {
      // Refresh session after verification
      window.location.reload();
    },
  });
}

/**
 * Hook for resending verification email
 */
export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => AuthApiClient.resendVerification(email),
  });
}

/**
 * Hook for getting current user
 */
export function useCurrentUser() {
  const { data: session, status } = useSession();
  
  return {
    user: session?.user,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}

/**
 * Hook for role checking
 */
export function useHasRole(role: string | string[]) {
  const { user } = useCurrentUser();
  const roles = Array.isArray(role) ? role : [role];
  return user ? roles.includes(user.role) : false;
}
```

---

## Best Practices Summary

### ✅ DO

1. **Use Auth.js hooks and functions** (`useSession`, `signIn`, `signOut`)
2. **Validate on both client and server** (use Zod schemas)
3. **Show generic error messages** for login failures (don't reveal if email exists)
4. **Implement client-side rate limiting** to reduce unnecessary API calls
5. **Handle session expiry gracefully** with warnings and auto-redirect
6. **Use secure, httpOnly cookies** (handled by Auth.js)
7. **Implement loading states** for all async operations
8. **Test all authentication flows** including edge cases
9. **Show password strength** indicators during registration/password change
10. **Provide helpful error recovery** actions (resend email, contact support, etc.)

### ❌ DON'T

1. **Don't reveal if an email exists** (prevents user enumeration)
2. **Don't store passwords** in frontend state or localStorage
3. **Don't bypass backend validation** (always validate on server)
4. **Don't show technical error details** to users (log them instead)
5. **Don't allow unlimited retry attempts** (implement rate limiting)
6. **Don't ignore session expiry** (handle gracefully)
7. **Don't trust client-side checks alone** (always verify on backend)
8. **Don't hardcode API URLs** (use environment variables)
9. **Don't forget accessibility** (keyboard navigation, screen readers)
10. **Don't skip error boundaries** (prevent full-page crashes)

---

## Support & Questions

If you need clarification on any endpoint, validation rule, or integration step:

1. **Backend Documentation:** Check `/docs` folder in backend repo
2. **API Testing:** Use the provided cURL examples to test endpoints
3. **Type Definitions:** All TypeScript types are provided in this guide
4. **Example Code:** Refer to code snippets throughout this document

**Backend Team Contact:**
- Repository: `yg-backend`
- Deployment: `https://ops.yesgoddess.agency`

---

**Document Version:** 1.0  
**Last Updated:** October 12, 2025  
**Status:** ✅ Ready for Frontend Implementation
