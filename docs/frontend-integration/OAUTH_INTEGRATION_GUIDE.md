# OAuth Integration - Frontend Integration Guide

**Version:** 1.0  
**Last Updated:** October 12, 2025  
**Backend Version:** Next.js 15 + Auth.js + tRPC  
**Deployment:** ops.yesgoddess.agency

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
9. [File Uploads](#file-uploads)
10. [Real-time Updates](#real-time-updates)
11. [Pagination & Filtering](#pagination--filtering)
12. [Frontend Implementation Checklist](#frontend-implementation-checklist)
13. [Testing Scenarios](#testing-scenarios)

---

## Overview

The OAuth Integration module enables users to sign in and link their accounts using Google, GitHub, and LinkedIn OAuth providers. This guide covers both the **Auth.js OAuth flow** (for sign-in/sign-up) and the **tRPC OAuth management endpoints** (for account linking/unlinking).

### Key Features

✅ **Three OAuth Providers:** Google, GitHub, LinkedIn  
✅ **Automatic Account Linking:** OAuth accounts automatically link to existing users by email  
✅ **Profile Synchronization:** Avatar and name sync from OAuth providers  
✅ **Account Management:** Users can link/unlink OAuth accounts from settings  
✅ **Security:** Cannot unlink the only authentication method  
✅ **Audit Logging:** All OAuth events are logged

### Architecture

- **Authentication:** Auth.js (NextAuth) handles OAuth flows
- **API Layer:** tRPC for account management operations
- **Session Management:** JWT-based sessions (30-day expiry)
- **Storage:** Cloudflare R2 for avatar storage
- **Database:** PostgreSQL via Prisma

---

## API Endpoints

### Auth.js OAuth Endpoints (Handled by Auth.js)

These endpoints are automatically provided by Auth.js and should be used via the `signIn()` method from `next-auth/react`.

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/signin` | GET | OAuth sign-in initiation page | No |
| `/api/auth/callback/:provider` | GET/POST | OAuth callback handler (Google, GitHub, LinkedIn) | No |
| `/api/auth/signout` | POST | Sign out user | Yes |
| `/api/auth/session` | GET | Get current session | No |
| `/api/auth/csrf` | GET | Get CSRF token | No |

### tRPC OAuth Management Endpoints

These endpoints are exposed via tRPC for account management after authentication.

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `oauth.getLinkedAccounts` | Query | Get all linked OAuth accounts | Yes |
| `oauth.hasPassword` | Query | Check if user has password set | Yes |
| `oauth.disconnectProvider` | Mutation | Unlink an OAuth provider | Yes |
| `oauth.canSyncProfile` | Query | Check if profile sync is allowed | Yes |
| `oauth.syncProfile` | Mutation | Trigger manual profile sync | Yes |

---

## Request/Response Examples

### 1. Initiate OAuth Sign-In (Google)

**Frontend Implementation:**

```tsx
import { signIn } from 'next-auth/react';

// Redirect user to Google OAuth flow
await signIn('google', {
  callbackUrl: '/dashboard',
  redirect: true,
});
```

**What Happens:**

1. User is redirected to `/api/auth/signin?provider=google`
2. Auth.js redirects to Google's OAuth consent screen
3. User authorizes the application
4. Google redirects back to `/api/auth/callback/google`
5. Backend creates/links account, creates session
6. User is redirected to `callbackUrl`

**Error Handling:**

```tsx
try {
  const result = await signIn('google', {
    callbackUrl: '/dashboard',
    redirect: false, // Handle redirect manually
  });

  if (result?.error) {
    // Handle error (see Error Handling section)
    console.error('OAuth error:', result.error);
    setError(getOAuthErrorMessage(result.error));
  } else if (result?.url) {
    // Redirect to callback URL
    router.push(result.url);
  }
} catch (error) {
  console.error('Sign in failed:', error);
}
```

---

### 2. Initiate OAuth Sign-In (GitHub)

**cURL Example (Testing):**

```bash
# Step 1: Get OAuth authorization URL
curl -X GET 'https://ops.yesgoddess.agency/api/auth/signin?provider=github' \
  -H 'Accept: text/html' \
  -L

# This will redirect you to GitHub's OAuth consent page
```

**Frontend Implementation:**

```tsx
import { signIn } from 'next-auth/react';

await signIn('github', {
  callbackUrl: '/dashboard',
  redirect: true,
});
```

---

### 3. Initiate OAuth Sign-In (LinkedIn)

**Frontend Implementation:**

```tsx
import { signIn } from 'next-auth/react';

await signIn('linkedin', {
  callbackUrl: '/dashboard',
  redirect: true,
});
```

> **Note:** LinkedIn OAuth requires app review approval before production use.

---

### 4. Get Current Session

**cURL Example:**

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/auth/session' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN'
```

**Response (Authenticated):**

```json
{
  "user": {
    "id": "cm2x3y4z5a6b7c8d9e0f1g2h",
    "email": "creator@example.com",
    "name": "Jane Doe",
    "image": "https://storage.yesgoddess.agency/avatars/cm2x3y4z5a6b7c8d9e0f1g2h/google-abc123.jpg",
    "role": "CREATOR",
    "emailVerified": true,
    "creatorId": "cm2x3y4z5creator123",
    "isAdmin": false,
    "isCreator": true,
    "isBrand": false
  },
  "expires": "2025-11-11T12:00:00.000Z"
}
```

**Response (Unauthenticated):**

```json
{}
```

**Frontend Implementation:**

```tsx
import { useSession } from 'next-auth/react';

export default function Profile() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div>Loading...</div>;
  if (status === 'unauthenticated') return <div>Not signed in</div>;

  return <div>Signed in as {session.user.email}</div>;
}
```

---

### 5. Get Linked OAuth Accounts (tRPC)

**tRPC Call:**

```tsx
const { data, isLoading, error } = trpc.oauth.getLinkedAccounts.useQuery();
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "provider": "google",
      "providerAccountId": "1234567890",
      "type": "oauth"
    },
    {
      "provider": "github",
      "providerAccountId": "octocat",
      "type": "oauth"
    }
  ]
}
```

**cURL Example (Testing):**

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/oauth.getLinkedAccounts' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

---

### 6. Check if Password is Set (tRPC)

**tRPC Call:**

```tsx
const { data } = trpc.oauth.hasPassword.useQuery();
```

**Response:**

```json
{
  "success": true,
  "data": {
    "hasPassword": true
  }
}
```

**Use Case:**

Determine if user needs to set a password before unlinking their last OAuth provider.

---

### 7. Disconnect OAuth Provider (tRPC)

**tRPC Call:**

```tsx
const { mutate: disconnectProvider, isLoading } = 
  trpc.oauth.disconnectProvider.useMutation({
    onSuccess: () => {
      toast.success('Google account disconnected');
      refetchLinkedAccounts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

// Disconnect Google
disconnectProvider({ provider: 'google' });
```

**Request:**

```json
{
  "provider": "google"
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "message": "google account disconnected successfully",
    "provider": "google"
  }
}
```

**Response (Error - Only Auth Method):**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cannot disconnect the only authentication method. Please set a password first."
  }
}
```

**Response (Error - Not Linked):**

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "OAuth provider not linked to this account"
  }
}
```

**cURL Example:**

```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/oauth.disconnectProvider' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "github"
  }'
```

---

### 8. Check Profile Sync Availability (tRPC)

**tRPC Call:**

```tsx
const { data } = trpc.oauth.canSyncProfile.useQuery();
```

**Response:**

```json
{
  "success": true,
  "data": {
    "canSync": true
  }
}
```

**Business Logic:**

- Returns `true` if user is new (created < 5 minutes ago)
- Returns `true` if no manual profile changes detected
- Returns `false` if user has manually updated their profile

---

### 9. Manual Profile Sync (tRPC)

**tRPC Call:**

```tsx
const { mutate: syncProfile } = trpc.oauth.syncProfile.useMutation({
  onSuccess: (data) => {
    toast.info(data.data.message);
  },
});

syncProfile({
  provider: 'google',
  syncAvatar: true,
  syncName: true,
});
```

**Request:**

```json
{
  "provider": "google",
  "syncAvatar": true,
  "syncName": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Profile sync will occur automatically on your next sign-in with this provider",
    "provider": "google"
  }
}
```

> **Important:** Manual sync requires re-authentication through OAuth flow. The endpoint returns a message explaining this.

---

### 10. Sign Out

**Frontend Implementation:**

```tsx
import { signOut } from 'next-auth/react';

await signOut({
  callbackUrl: '/',
  redirect: true,
});
```

**cURL Example:**

```bash
curl -X POST 'https://ops.yesgoddess.agency/api/auth/signout' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'csrfToken=YOUR_CSRF_TOKEN'
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * OAuth Provider Types
 */
export type OAuthProvider = 'google' | 'github' | 'linkedin';

/**
 * OAuth Account Information
 */
export interface OAuthAccount {
  provider: OAuthProvider;
  providerAccountId: string;
  type: 'oauth';
}

/**
 * Linked Accounts Response
 */
export interface LinkedAccountsResponse {
  success: boolean;
  data: OAuthAccount[];
}

/**
 * Has Password Response
 */
export interface HasPasswordResponse {
  success: boolean;
  data: {
    hasPassword: boolean;
  };
}

/**
 * Disconnect Provider Request
 */
export interface DisconnectProviderRequest {
  provider: OAuthProvider;
}

/**
 * Disconnect Provider Response
 */
export interface DisconnectProviderResponse {
  success: boolean;
  data: {
    message: string;
    provider: OAuthProvider;
  };
}

/**
 * Can Sync Profile Response
 */
export interface CanSyncProfileResponse {
  success: boolean;
  data: {
    canSync: boolean;
  };
}

/**
 * Sync Profile Request
 */
export interface SyncProfileRequest {
  provider: OAuthProvider;
  syncAvatar?: boolean;
  syncName?: boolean;
}

/**
 * Sync Profile Response
 */
export interface SyncProfileResponse {
  success: boolean;
  data: {
    message: string;
    provider: OAuthProvider;
  };
}
```

### Next-Auth Session Types

```typescript
/**
 * Extended NextAuth Session
 */
export interface ExtendedSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: 'ADMIN' | 'CREATOR' | 'BRAND';
    emailVerified: boolean;
    
    // Role-specific fields
    creatorId?: string;
    creatorVerificationStatus?: string;
    creatorOnboardingStatus?: string;
    
    brandId?: string;
    brandVerificationStatus?: string;
    isBrandVerified?: boolean;
    
    // Computed properties
    isAdmin: boolean;
    isCreator: boolean;
    isBrand: boolean;
  };
  expires: string;
}
```

### OAuth Error Types

```typescript
/**
 * OAuth Error Codes
 */
export type OAuthErrorCode =
  | 'OAuthSignin'
  | 'OAuthCallback'
  | 'OAuthCreateAccount'
  | 'OAuthAccountNotLinked'
  | 'OAuthProviderError'
  | 'AccessDenied'
  | 'Verification'
  | 'Callback'
  | 'SessionRequired';

/**
 * OAuth Error Object
 */
export interface OAuthError {
  error: OAuthErrorCode;
  error_description?: string;
  provider?: OAuthProvider;
}
```

### Zod Schemas

```typescript
import { z } from 'zod';

/**
 * OAuth Provider Schema
 */
export const OAuthProviderSchema = z.enum(['google', 'github', 'linkedin']);

/**
 * Disconnect Provider Schema
 */
export const DisconnectProviderSchema = z.object({
  provider: OAuthProviderSchema,
});

/**
 * Sync Profile Schema
 */
export const SyncProfileSchema = z.object({
  provider: OAuthProviderSchema,
  syncAvatar: z.boolean().optional().default(true),
  syncName: z.boolean().optional().default(true),
});
```

---

## Business Logic & Validation Rules

### OAuth Provider Configuration

| Provider | Scopes Requested | Email Verification | Profile Data |
|----------|------------------|-------------------|--------------|
| **Google** | `openid profile email` | Automatic | Name, email, avatar, locale |
| **GitHub** | `user:email` | Automatic | Username, email, avatar, bio |
| **LinkedIn** | `openid profile email` | Automatic | Name, email, avatar, headline |

### Account Linking Rules

1. **Automatic Linking:**
   - OAuth sign-in with existing email automatically links account
   - Only works with verified OAuth email addresses
   - Existing user data is preserved
   - Profile sync occurs for new accounts only

2. **Manual Linking:**
   - User must be signed in to link additional OAuth accounts
   - Sign in with new OAuth provider while authenticated
   - Account is added to user's linked accounts

3. **Email Matching:**
   - OAuth email must match existing user email exactly
   - Case-insensitive matching
   - Email must be verified by OAuth provider

### Profile Synchronization Rules

#### When Profile Sync Occurs

1. **Automatic Sync (New Users):**
   - Triggers on first OAuth sign-in
   - Syncs avatar, name, and email
   - Occurs within first 5 minutes of account creation

2. **Automatic Sync (Existing Users):**
   - Only if no manual profile changes detected
   - Only updates empty fields (name, avatar)
   - Replaces OAuth CDN avatars with R2-stored versions

3. **Manual Sync:**
   - Requires re-authentication through OAuth flow
   - Respects manual changes (won't override)
   - User must click sync button and re-authorize

#### What Gets Synced

| Field | New Users | Existing Users (No Manual Changes) | Existing Users (Manual Changes) |
|-------|-----------|-----------------------------------|--------------------------------|
| **Name** | ✅ Always | ✅ If empty | ❌ Never |
| **Avatar** | ✅ Always | ✅ If empty or OAuth URL | ❌ Never |
| **Email** | ✅ Always | ❌ Never | ❌ Never |

#### Avatar Storage Rules

- Downloaded from OAuth provider
- Stored in Cloudflare R2 bucket
- Path: `avatars/{userId}/{provider}-{hash}.{ext}`
- Max size: 5MB
- Allowed types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif`
- URL format: `https://storage.yesgoddess.agency/avatars/...`

### Disconnection Rules

1. **Cannot Disconnect Only Auth Method:**
   - If user has no password AND only one OAuth account → Error
   - User must set password first
   - Error message: "Cannot disconnect the only authentication method. Please set a password first."

2. **Safe Disconnection:**
   - User has password set → Can disconnect all OAuth accounts
   - User has multiple OAuth accounts → Can disconnect any
   - User has password + OAuth → Can disconnect OAuth

3. **Audit Logging:**
   - All disconnect actions are logged
   - Includes IP address and user agent
   - Visible in admin audit log

### Security Rules

- **Account Status Checks:**
  - Deleted accounts (`deleted_at` is not null) cannot sign in
  - Inactive accounts (`isActive: false`) cannot sign in
  - OAuth sign-in respects account status

- **Session Security:**
  - JWT-based sessions (stateless)
  - 30-day expiry (configurable)
  - Session updates every 24 hours
  - Secure cookies in production (`__Secure-` prefix)
  - `httpOnly` and `sameSite: lax` flags

- **CSRF Protection:**
  - All OAuth callbacks include CSRF token validation
  - Token must be present in callback state

---

## Error Handling

### OAuth Error Codes

| Error Code | HTTP Status | User-Friendly Message | Retryable | User Action Required |
|------------|-------------|----------------------|-----------|---------------------|
| `OAuthSignin` | 400 | "Authentication could not be initiated. Please try again." | ✅ Yes | No |
| `OAuthCallback` | 400 | "Authentication could not be completed. Please try again or use another method." | ✅ Yes | No |
| `OAuthCreateAccount` | 400 | "Account creation failed. Please try another authentication method." | ✅ Yes | No |
| `OAuthAccountNotLinked` | 400 | "This account is already connected to another user. Please sign in with your original authentication method." | ❌ No | ✅ Yes |
| `OAuthProviderError` | 502 | "{Provider} authentication is temporarily unavailable. Please try again or use another method." | ✅ Yes | No |
| `AccessDenied` | 403 | "Access denied. Please grant the necessary permissions to continue." | ❌ No | ✅ Yes |
| `Verification` | 400 | "Verification token is invalid or has expired. Please request a new one." | ❌ No | ✅ Yes |
| `Callback` | 400 | "Authentication callback failed. Please try again." | ✅ Yes | No |
| `SessionRequired` | 401 | "Authentication required. Please sign in to continue." | ❌ No | ✅ Yes |

### tRPC Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | User is not authenticated |
| `BAD_REQUEST` | 400 | Invalid request (validation error, business rule violation) |
| `NOT_FOUND` | 404 | OAuth provider not linked |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

### Error Handling Utilities

```typescript
/**
 * Get user-friendly error message
 */
export function getOAuthErrorMessage(error: OAuthErrorCode | string): string {
  const errorMessages: Record<string, string> = {
    OAuthSignin: 'Authentication could not be initiated. Please try again.',
    OAuthCallback: 'Authentication could not be completed. Please try again or use another method.',
    OAuthCreateAccount: 'Account creation failed. Please try another authentication method.',
    OAuthAccountNotLinked: 'This account is already connected to another user. Please sign in with your original authentication method.',
    OAuthProviderError: 'Authentication provider is temporarily unavailable. Please try again or use another method.',
    AccessDenied: 'Access denied. Please grant the necessary permissions to continue.',
    Verification: 'Verification token is invalid or has expired. Please request a new one.',
    Callback: 'Authentication callback failed. Please try again.',
    SessionRequired: 'Authentication required. Please sign in to continue.',
  };

  return errorMessages[error] || 'Authentication failed. Please try again or contact support if the issue persists.';
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: OAuthProvider): string {
  const names: Record<OAuthProvider, string> = {
    google: 'Google',
    github: 'GitHub',
    linkedin: 'LinkedIn',
  };
  return names[provider];
}

/**
 * Check if error is retryable
 */
export function isRetryableError(errorCode: string): boolean {
  return [
    'OAuthSignin',
    'OAuthCallback',
    'Callback',
    'OAuthProviderError',
  ].includes(errorCode);
}

/**
 * Check if error requires user action
 */
export function requiresUserAction(errorCode: string): boolean {
  return [
    'AccessDenied',
    'OAuthAccountNotLinked',
    'Verification',
  ].includes(errorCode);
}
```

### Frontend Error Handling Examples

#### OAuth Sign-In Error Handling

```tsx
'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getOAuthErrorMessage, isRetryableError } from '@/lib/oauth-errors';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (errorCode) {
      setError(getOAuthErrorMessage(errorCode));
    }
  }, [searchParams]);

  const handleOAuthSignIn = async (provider: 'google' | 'github' | 'linkedin') => {
    setError(null);
    
    try {
      const result = await signIn(provider, {
        callbackUrl: '/dashboard',
        redirect: false,
      });

      if (result?.error) {
        setError(getOAuthErrorMessage(result.error));
      } else if (result?.url) {
        router.push(result.url);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div>
      {error && (
        <div className="error-banner">
          <p>{error}</p>
          {isRetryableError(error) && (
            <button onClick={() => setError(null)}>Try Again</button>
          )}
        </div>
      )}

      <button onClick={() => handleOAuthSignIn('google')}>
        Sign in with Google
      </button>
      <button onClick={() => handleOAuthSignIn('github')}>
        Sign in with GitHub
      </button>
      <button onClick={() => handleOAuthSignIn('linkedin')}>
        Sign in with LinkedIn
      </button>
    </div>
  );
}
```

#### tRPC Error Handling

```tsx
'use client';

import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function AccountSettings() {
  const { data: linkedAccounts, refetch } = trpc.oauth.getLinkedAccounts.useQuery();
  const { data: hasPasswordData } = trpc.oauth.hasPassword.useQuery();

  const { mutate: disconnectProvider, isLoading } = 
    trpc.oauth.disconnectProvider.useMutation({
      onSuccess: (data) => {
        toast.success(data.data.message);
        refetch();
      },
      onError: (error) => {
        // Handle specific error cases
        if (error.message.includes('only authentication method')) {
          toast.error(error.message, {
            action: {
              label: 'Set Password',
              onClick: () => router.push('/settings/password'),
            },
          });
        } else {
          toast.error(error.message);
        }
      },
    });

  const handleDisconnect = (provider: 'google' | 'github' | 'linkedin') => {
    // Check if safe to disconnect
    const isLastProvider = linkedAccounts?.data.length === 1;
    const hasPassword = hasPasswordData?.data.hasPassword;

    if (isLastProvider && !hasPassword) {
      toast.error('Set a password before disconnecting your last OAuth account');
      return;
    }

    // Confirm before disconnecting
    if (confirm(`Disconnect ${provider}?`)) {
      disconnectProvider({ provider });
    }
  };

  return (
    <div>
      {linkedAccounts?.data.map((account) => (
        <div key={account.provider}>
          <span>{account.provider}</span>
          <button 
            onClick={() => handleDisconnect(account.provider as any)}
            disabled={isLoading}
          >
            Disconnect
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## Authorization & Permissions

### Endpoint Access Control

| Endpoint | Anonymous | Authenticated | Admin Only |
|----------|-----------|---------------|------------|
| `/api/auth/signin` | ✅ | ✅ | ✅ |
| `/api/auth/callback/:provider` | ✅ | ✅ | ✅ |
| `/api/auth/session` | ✅ | ✅ | ✅ |
| `oauth.getLinkedAccounts` | ❌ | ✅ | ✅ |
| `oauth.hasPassword` | ❌ | ✅ | ✅ |
| `oauth.disconnectProvider` | ❌ | ✅ | ✅ |
| `oauth.canSyncProfile` | ❌ | ✅ | ✅ |
| `oauth.syncProfile` | ❌ | ✅ | ✅ |

### User Role Matrix

| Action | ADMIN | CREATOR | BRAND |
|--------|-------|---------|-------|
| Sign in with OAuth | ✅ | ✅ | ✅ |
| Link OAuth account | ✅ | ✅ | ✅ |
| Unlink OAuth account | ✅ | ✅ | ✅ |
| View linked accounts | ✅ | ✅ | ✅ |
| Sync OAuth profile | ✅ | ✅ | ✅ |

### Resource Ownership Rules

- Users can only view/manage their own OAuth accounts
- Admins cannot view/manage other users' OAuth accounts through these endpoints
- All operations are scoped to the authenticated user's session

### Authentication Flow

```typescript
/**
 * Example: Protected tRPC Route
 */
export const oauthRouter = createTRPCRouter({
  getLinkedAccounts: protectedProcedure // <- Requires authentication
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id; // Always available in protectedProcedure
      // ... fetch user's accounts
    }),
});
```

---

## Rate Limiting & Quotas

### Current Implementation

⚠️ **Rate limiting is not yet implemented** for OAuth endpoints. This is planned for a future release.

### Planned Rate Limits

| Endpoint Category | Limit | Window | Header |
|------------------|-------|--------|--------|
| OAuth Sign-In | 10 requests | 15 minutes | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| OAuth Management | 20 requests | 1 minute | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |

### Best Practices

- **Implement client-side debouncing** for disconnect/sync operations
- **Cache session data** to avoid excessive `/api/auth/session` calls
- **Use `useSession()` hook** from `next-auth/react` (includes built-in caching)

```tsx
import { useSession } from 'next-auth/react';

// Good: Uses built-in caching
const { data: session } = useSession();

// Bad: Manual fetch without caching
const session = await fetch('/api/auth/session');
```

---

## File Uploads

### Avatar Upload Flow

OAuth profile avatars are automatically handled by the backend. No direct file upload from frontend is required.

#### Automatic Avatar Download (Backend)

1. User signs in with OAuth provider
2. Backend receives OAuth profile with avatar URL
3. Backend downloads avatar from OAuth provider
4. Backend uploads avatar to Cloudflare R2
5. Backend updates user record with R2 URL
6. Frontend displays R2-hosted avatar

#### Avatar Storage Details

- **Storage Provider:** Cloudflare R2
- **Bucket:** `yesgoddess-storage`
- **Path Format:** `avatars/{userId}/{provider}-{hash}.{ext}`
- **URL Format:** `https://storage.yesgoddess.agency/avatars/...`
- **Max Size:** 5MB
- **Allowed Types:** JPEG, JPG, PNG, WebP, GIF

#### Avatar URL in Session

```typescript
const { data: session } = useSession();
const avatarUrl = session?.user?.image; // R2 URL, not OAuth CDN URL

// Example: "https://storage.yesgoddess.agency/avatars/cm2x3y4z5/google-abc123.jpg"
```

#### Manual Avatar Upload

For manual profile picture uploads (not OAuth-synced), see the **User Profile Integration Guide** (separate document).

---

## Real-time Updates

### Session Updates

Sessions are automatically updated by Next-Auth:

- **Automatic refresh:** Every 24 hours
- **Manual refresh:** Call `update()` from `useSession()`

```tsx
import { useSession } from 'next-auth/react';

export default function Component() {
  const { data: session, update } = useSession();

  const handleRefreshSession = async () => {
    await update(); // Fetches latest session data
  };

  return <button onClick={handleRefreshSession}>Refresh Session</button>;
}
```

### OAuth Account Changes

When a user links/unlinks an OAuth account:

1. **tRPC mutation completes**
2. **Frontend refetches linked accounts**
3. **Session remains valid** (no sign-out required)
4. **Avatar/name sync occurs on next OAuth sign-in**

```tsx
const { data: linkedAccounts, refetch } = trpc.oauth.getLinkedAccounts.useQuery();

const { mutate: disconnectProvider } = trpc.oauth.disconnectProvider.useMutation({
  onSuccess: () => {
    refetch(); // Refresh linked accounts list
  },
});
```

### Audit Log Events

All OAuth actions trigger audit log events (backend-only):

- `LOGIN_SUCCESS` - OAuth sign-in
- `REGISTER_SUCCESS` - New user via OAuth
- `PROFILE_UPDATED` - Avatar/name synced
- `PROFILE_UPDATED` - OAuth account linked/unlinked

These are not exposed to frontend in real-time but are available in admin audit log.

---

## Pagination & Filtering

### Linked Accounts

The `oauth.getLinkedAccounts` endpoint returns **all** linked OAuth accounts (no pagination needed).

**Reasoning:**
- Users can have max 3 OAuth accounts (Google, GitHub, LinkedIn)
- Small dataset doesn't require pagination

**Response Format:**

```json
{
  "success": true,
  "data": [
    { "provider": "google", "providerAccountId": "123", "type": "oauth" },
    { "provider": "github", "providerAccountId": "456", "type": "oauth" }
  ]
}
```

---

## Frontend Implementation Checklist

### 1. Sign-In Page

- [ ] Add "Sign in with Google" button
- [ ] Add "Sign in with GitHub" button
- [ ] Add "Sign in with LinkedIn" button
- [ ] Handle OAuth error query parameter (`?error=...`)
- [ ] Display user-friendly error messages
- [ ] Show loading state during OAuth redirect
- [ ] Test all three OAuth providers
- [ ] Implement "Try Again" functionality for retryable errors

**Example Button:**

```tsx
<button
  onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
  className="oauth-button"
>
  <GoogleIcon />
  Continue with Google
</button>
```

---

### 2. Account Settings Page

- [ ] Display list of linked OAuth accounts
- [ ] Show provider icons (Google, GitHub, LinkedIn)
- [ ] Add "Disconnect" button for each linked account
- [ ] Check if user has password before allowing disconnect
- [ ] Disable disconnect if it's the only auth method
- [ ] Show confirmation dialog before disconnecting
- [ ] Handle disconnect errors gracefully
- [ ] Refetch linked accounts after disconnect
- [ ] Add "Connect {Provider}" button for unlinked providers
- [ ] Show badge for currently active OAuth accounts

**Example Component:**

```tsx
export default function LinkedAccounts() {
  const { data: linkedAccounts } = trpc.oauth.getLinkedAccounts.useQuery();
  const { data: hasPasswordData } = trpc.oauth.hasPassword.useQuery();
  const { mutate: disconnect } = trpc.oauth.disconnectProvider.useMutation();

  const canDisconnect = (provider: OAuthProvider) => {
    const isLastProvider = linkedAccounts?.data.length === 1;
    const hasPassword = hasPasswordData?.data.hasPassword;
    return !(isLastProvider && !hasPassword);
  };

  return (
    <div>
      {linkedAccounts?.data.map((account) => (
        <div key={account.provider} className="oauth-account">
          <ProviderIcon provider={account.provider} />
          <span>{getProviderDisplayName(account.provider)}</span>
          <button
            onClick={() => disconnect({ provider: account.provider })}
            disabled={!canDisconnect(account.provider)}
          >
            Disconnect
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

### 3. Session Management

- [ ] Use `useSession()` hook from `next-auth/react`
- [ ] Display user name and avatar from session
- [ ] Handle loading state (`status === 'loading'`)
- [ ] Handle unauthenticated state (`status === 'unauthenticated'`)
- [ ] Implement sign-out functionality
- [ ] Add session refresh button (optional)
- [ ] Cache session data to avoid excessive API calls

---

### 4. Error Handling

- [ ] Create `lib/oauth-errors.ts` utility file
- [ ] Implement `getOAuthErrorMessage()` function
- [ ] Implement `isRetryableError()` function
- [ ] Implement `requiresUserAction()` function
- [ ] Display errors in toast notifications or error banners
- [ ] Add "Try Again" button for retryable errors
- [ ] Add contextual actions for user-action-required errors

---

### 5. TypeScript Types

- [ ] Copy type definitions from this guide
- [ ] Extend `next-auth` types in `next-auth.d.ts`
- [ ] Create Zod schemas for validation
- [ ] Type all tRPC queries and mutations

**Example `next-auth.d.ts`:**

```typescript
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      role: 'ADMIN' | 'CREATOR' | 'BRAND';
      emailVerified: boolean;
      creatorId?: string;
      brandId?: string;
      isAdmin: boolean;
      isCreator: boolean;
      isBrand: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: 'ADMIN' | 'CREATOR' | 'BRAND';
    emailVerified: Date | null;
  }
}
```

---

### 6. UX Considerations

- [ ] Use provider brand colors for OAuth buttons
- [ ] Show provider icons (Google, GitHub, LinkedIn logos)
- [ ] Display loading spinner during OAuth redirect
- [ ] Show success message after linking account
- [ ] Show warning before disconnecting last auth method
- [ ] Implement smooth transitions when linking/unlinking
- [ ] Add tooltip explaining why disconnect is disabled
- [ ] Show badge for "Currently signed in with {Provider}"

---

### 7. Security

- [ ] Never expose OAuth tokens in frontend
- [ ] Use secure cookies (handled by Auth.js)
- [ ] Implement CSRF protection (handled by Auth.js)
- [ ] Validate session on protected routes
- [ ] Clear sensitive data on sign-out
- [ ] Use HTTPS in production

---

### 8. Testing

- [ ] Test OAuth sign-in with all three providers
- [ ] Test account linking (sign in with OAuth while authenticated)
- [ ] Test disconnecting OAuth accounts
- [ ] Test error scenarios (user denies permission, network error)
- [ ] Test edge case: disconnect last OAuth without password
- [ ] Test session persistence across page refreshes
- [ ] Test sign-out functionality

---

## Testing Scenarios

### 1. New User Sign-Up with OAuth

**Scenario:** User signs up with Google for the first time

**Steps:**
1. Navigate to sign-in page
2. Click "Sign in with Google"
3. Authorize YES GODDESS on Google consent screen
4. Redirected back to application

**Expected Results:**
- ✅ User account created
- ✅ Email marked as verified
- ✅ Avatar downloaded and stored in R2
- ✅ Name populated from Google profile
- ✅ Session created
- ✅ Redirected to dashboard

**Test Data:**

```json
{
  "email": "test@gmail.com",
  "provider": "google",
  "providerId": "1234567890"
}
```

---

### 2. Existing User Signs In with OAuth

**Scenario:** User with email/password account signs in with Google

**Steps:**
1. Create user with email: `test@example.com`
2. Sign in with Google using same email
3. Authorize YES GODDESS

**Expected Results:**
- ✅ Google account linked to existing user
- ✅ No duplicate account created
- ✅ User signed in to original account
- ✅ Avatar synced if not manually set
- ✅ Session created

---

### 3. User Links Multiple OAuth Accounts

**Scenario:** User links Google, GitHub, and LinkedIn to one account

**Steps:**
1. Sign up with email/password
2. Go to Account Settings
3. Click "Connect Google" → Authorize → Success
4. Click "Connect GitHub" → Authorize → Success
5. Click "Connect LinkedIn" → Authorize → Success

**Expected Results:**
- ✅ All three OAuth accounts linked
- ✅ User can sign in with any method
- ✅ Only one YES GODDESS account exists

---

### 4. User Disconnects OAuth Account (Safe)

**Scenario:** User has password + multiple OAuth accounts

**Steps:**
1. Verify user has password set
2. Verify user has 2+ OAuth accounts linked
3. Click "Disconnect Google"
4. Confirm action

**Expected Results:**
- ✅ Google account unlinked
- ✅ Other OAuth accounts remain linked
- ✅ User can still sign in with password or other OAuth

---

### 5. User Attempts to Disconnect Last OAuth Account

**Scenario:** User tries to disconnect only auth method

**Steps:**
1. User has only Google account linked (no password)
2. Click "Disconnect Google"

**Expected Results:**
- ❌ Error: "Cannot disconnect the only authentication method. Please set a password first."
- ✅ Google account remains linked
- ✅ User not signed out

---

### 6. OAuth Error: User Denies Permission

**Scenario:** User clicks "Cancel" on Google consent screen

**Steps:**
1. Click "Sign in with Google"
2. Click "Cancel" on consent screen
3. Redirected back to application

**Expected Results:**
- ✅ Error message displayed: "Access denied. Please grant the necessary permissions to continue."
- ✅ User not signed in
- ✅ Can retry sign-in

---

### 7. OAuth Error: Account Already Linked

**Scenario:** User tries to sign in with OAuth account linked to different user

**Steps:**
1. User A signs up with `test@example.com` and links Google account
2. User B tries to sign in with same Google account

**Expected Results:**
- ❌ Error: "This account is already connected to another user. Please sign in with your original authentication method."
- ✅ User B not signed in
- ✅ User A's account not affected

---

### 8. Profile Sync for New User

**Scenario:** New user's profile is synced from OAuth provider

**Steps:**
1. Sign up with GitHub
2. Check user profile

**Expected Results:**
- ✅ Avatar downloaded from GitHub and stored in R2
- ✅ Name set to GitHub username
- ✅ Email verified automatically

---

### 9. Profile Sync Skipped for Existing User

**Scenario:** Existing user's manual changes are preserved

**Steps:**
1. User manually sets name to "Custom Name"
2. User manually uploads avatar
3. User links Google account
4. Check profile

**Expected Results:**
- ✅ Name remains "Custom Name" (not overwritten)
- ✅ Avatar remains manual upload (not synced from Google)

---

### 10. Session Persistence

**Scenario:** User signs in with OAuth and refreshes page

**Steps:**
1. Sign in with Google
2. Refresh page
3. Close browser and reopen
4. Navigate to application

**Expected Results:**
- ✅ User remains signed in after refresh
- ✅ User remains signed in after browser restart (within 30 days)
- ✅ Session auto-expires after 30 days

---

### Edge Cases to Test

#### 1. Deleted Account

**Scenario:** User with `deleted_at` set tries to sign in with OAuth

**Expected:** OAuth sign-in fails with error

---

#### 2. Inactive Account

**Scenario:** User with `isActive: false` tries to sign in with OAuth

**Expected:** OAuth sign-in fails with error

---

#### 3. Network Timeout

**Scenario:** OAuth provider is unreachable

**Expected:** Error displayed, user can retry

---

#### 4. Invalid Avatar URL

**Scenario:** OAuth provider returns broken avatar URL

**Expected:** Avatar sync fails gracefully, account is still created/linked

---

#### 5. Avatar Too Large

**Scenario:** OAuth provider returns avatar > 5MB

**Expected:** Avatar sync fails, account is still created/linked

---

### Integration Test Example

```typescript
import { test, expect } from '@playwright/test';

test('OAuth sign-in flow with Google', async ({ page }) => {
  // Navigate to sign-in page
  await page.goto('/auth/signin');

  // Click "Sign in with Google"
  await page.click('button:has-text("Sign in with Google")');

  // OAuth flow happens in new window (mocked in test)
  // Simulate successful authorization

  // Wait for redirect back to app
  await page.waitForURL('/dashboard');

  // Verify user is signed in
  const session = await page.evaluate(() => {
    return fetch('/api/auth/session').then(r => r.json());
  });

  expect(session.user).toBeDefined();
  expect(session.user.email).toBeTruthy();
});
```

---

## Additional Resources

### Backend Documentation

- [OAuth Setup Guide](/docs/modules/authentication/oauth-setup.md)
- [OAuth Quick Reference](/docs/modules/authentication/oauth-quick-reference.md)
- [Auth Implementation](/docs/AUTH_IMPLEMENTATION.md)
- [User Account Connections Guide](/docs/user-guides/account-connections.md)

### External Documentation

- [Auth.js Documentation](https://authjs.dev)
- [Next-Auth React Hooks](https://next-auth.js.org/getting-started/client#usesession)
- [tRPC Documentation](https://trpc.io)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [LinkedIn OAuth 2.0](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)

### Support

**For backend issues:**
- Check audit logs in admin panel
- Review backend error logs
- Contact backend team

**For frontend integration questions:**
- Review this guide
- Check [Frontend Integration Checklist](#frontend-implementation-checklist)
- Test with cURL examples provided

---

## Summary

### What You've Learned

✅ How to implement OAuth sign-in with Google, GitHub, LinkedIn  
✅ How to link/unlink OAuth accounts via tRPC  
✅ How profile synchronization works  
✅ How to handle OAuth errors gracefully  
✅ How to check if user can safely disconnect OAuth  
✅ All business rules and edge cases  

### Next Steps

1. ✅ Copy TypeScript types to your frontend codebase
2. ✅ Implement sign-in page with OAuth buttons
3. ✅ Implement account settings page with link/unlink functionality
4. ✅ Add error handling utilities
5. ✅ Test all scenarios from [Testing Scenarios](#testing-scenarios)
6. ✅ Deploy and monitor OAuth usage

---

**Document Version:** 1.0  
**Last Updated:** October 12, 2025  
**Status:** ✅ Production Ready  
**Maintainer:** YES GODDESS Backend Team

---

*YES GODDESS - Where creators are sovereign architects, not users.*
