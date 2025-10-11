# Auth.js Authentication Implementation

## Overview

Auth.js (NextAuth v4) has been successfully configured for the YES GODDESS platform with Prisma adapter, JWT sessions, and comprehensive security features.

## Configuration Files

### Core Files Created

1. **`src/lib/auth.ts`** - Main Auth.js configuration
   - Prisma adapter integration
   - JWT strategy with 30-day sessions
   - Credentials provider (email/password)
   - Optional OAuth providers (Google, GitHub)
   - Custom callbacks for JWT and session enrichment
   - Role-based access control
   - Comprehensive audit logging

2. **`src/types/next-auth.d.ts`** - TypeScript type definitions
   - Extended User, Session, and JWT types
   - Role-specific properties
   - Creator and Brand metadata

3. **`src/app/api/auth/[...nextauth]/route.ts`** - API route handler
   - Handles all Auth.js endpoints at `/api/auth/*`

4. **`src/components/providers/AuthProvider.tsx`** - Session provider
   - Wraps app for client-side session access

5. **`src/hooks/useAuth.ts`** - Client-side authentication hook
   - Easy access to session data
   - Authentication state helpers
   - Role checking utilities

6. **`src/middleware.ts`** - Route protection middleware
   - Protects admin, creator, and brand routes
   - Role-based access enforcement

### Auth Pages Created

- **`/auth/signin`** - Sign-in page
- **`/auth/signout`** - Sign-out confirmation
- **`/auth/error`** - Authentication error handling
- **`/auth/verify-request`** - Email verification message

## Features Implemented

### ✅ Prisma Adapter Configuration
- Configured with existing Prisma schema
- Uses User, Account, Session, VerificationToken models
- Automatic session management

### ✅ JWT Strategy
- Stateless JWT sessions
- 30-day session duration
- 24-hour session update interval
- Secure token signing with NEXTAUTH_SECRET

### ✅ Session Token Expiration
- maxAge: 30 days (configurable via AUTH_CONFIG)
- updateAge: 24 hours (periodic session refresh)
- Automatic cleanup of expired sessions

### ✅ Custom Sign-In Callbacks
- Email/password authentication via Credentials provider
- Password verification with bcrypt
- Account status checks (deleted, inactive)
- Email verification support (optional enforcement)
- OAuth sign-in validation
- Last login timestamp tracking
- Comprehensive audit logging

### ✅ JWT Callbacks for Roles
- User role embedded in JWT token
- Creator-specific data (creatorId, verification status, onboarding status)
- Brand-specific data (brandId, verification status)
- Token refresh on profile updates
- Database sync on token updates

### ✅ Session Callbacks for User Data
- Role information (isAdmin, isCreator, isBrand)
- Email verification status
- Creator/Brand profile data
- Computed properties for easy access

### ✅ CSRF Protection
- Built-in Auth.js CSRF protection
- Secure cookie configuration
- HttpOnly cookies in production
- SameSite: 'lax' for CSRF prevention
- Secure cookies in production (HTTPS only)
- Cookie prefixes for security (__Secure-, __Host-)

## Authentication Flow

### Password-Based Login
1. User submits email/password to `/api/auth/callback/credentials`
2. Credentials provider validates credentials
3. Password verified with bcrypt
4. Account status checked (active, not deleted)
5. JWT token created with user data and role
6. Session cookie set with secure flags
7. Login event logged to audit trail
8. Last login timestamp updated

### OAuth Login
1. User clicks OAuth provider button
2. Redirected to provider (Google/GitHub)
3. Provider validates and returns user data
4. signIn callback checks account status
5. New user created or existing user linked
6. JWT token created with role data
7. Session established
8. OAuth event logged to audit trail

### Session Management
1. Client requests include session cookie
2. JWT verified and decoded
3. Session data extracted from token
4. Role and permissions available in context
5. Token refreshed if older than updateAge
6. Expired sessions automatically cleaned up

## Security Features

### Password Security
- Bcrypt hashing with 12 rounds (from AuthService)
- Timing-safe password comparison
- Strong password requirements enforced
- No plaintext passwords stored

### Token Security
- Cryptographically secure NEXTAUTH_SECRET
- JWT signing and encryption
- 30-day expiration with automatic refresh
- Secure cookie transmission

### CSRF Protection
- CSRF tokens on all state-changing requests
- SameSite cookie attribute
- Origin validation
- Token validation on callbacks

### Cookie Security
- HttpOnly flag prevents XSS access
- Secure flag for HTTPS-only transmission
- SameSite=lax prevents CSRF attacks
- Proper cookie prefixes in production

### Audit Logging
- All authentication events logged
- IP address and user agent tracking
- Failed login attempt monitoring
- Account linking events
- Session creation/destruction

## API Endpoints

### Auth.js Endpoints (Automatic)
- `GET/POST /api/auth/signin` - Sign-in page/handler
- `GET/POST /api/auth/signout` - Sign-out handler
- `GET/POST /api/auth/callback/:provider` - OAuth callbacks
- `GET /api/auth/session` - Get current session
- `GET /api/auth/csrf` - Get CSRF token
- `GET /api/auth/providers` - List available providers

## Usage Examples

### Server Components
```typescript
import { getSession, requireAuth, requireRole } from '@/lib/auth';

// Get session (optional)
const session = await getSession();

// Require authentication
const session = await requireAuth();

// Require specific role
const session = await requireRole('ADMIN');
const session = await requireRole(['ADMIN', 'CREATOR']);
```

### Client Components
```typescript
'use client';

import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { session, user, isAuthenticated, isAdmin, signIn, signOut } = useAuth();
  
  if (!isAuthenticated) {
    return <button onClick={() => signIn()}>Sign In</button>;
  }
  
  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <p>Role: {user.role}</p>
      {isAdmin && <p>Admin Panel Access</p>}
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  );
}
```

### tRPC Procedures
```typescript
import { protectedProcedure, adminProcedure } from '@/lib/trpc';

// Protected procedure (requires authentication)
myProtectedQuery: protectedProcedure
  .query(({ ctx }) => {
    // ctx.session.user is guaranteed to exist
    const userId = ctx.session.user.id;
    // ...
  }),

// Admin-only procedure
myAdminMutation: adminProcedure
  .mutation(({ ctx }) => {
    // ctx.session.user.role is guaranteed to be 'ADMIN'
    // ...
  }),
```

### Middleware Protection
Routes are automatically protected by `src/middleware.ts`:
- `/admin/*` - Requires ADMIN role
- `/creator/*` - Requires CREATOR role
- `/brand/*` - Requires BRAND role
- `/api/trpc/*` - Requires authentication

## Environment Variables

Required variables (already configured in your `.env`):
```bash
NEXTAUTH_SECRET=47628ed1ef3dae1932f81c3e02094d86200d8600f0c7eb9d57236d685c0b2ef8
NEXTAUTH_URL=http://localhost:3000
```

Optional OAuth providers:
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret
```

## Integration with Existing Auth System

Auth.js works alongside your existing tRPC auth endpoints:
- `auth.register` - Creates users (tRPC)
- `auth.login` - Alternative to Auth.js credentials (tRPC)
- `auth.verifyEmail` - Email verification (tRPC)
- `auth.resetPassword` - Password reset (tRPC)
- Auth.js - Session management and OAuth

Both systems share the same:
- User model in Prisma
- Password hashing (bcrypt)
- Audit logging
- Email service

## Next Steps

### Immediate
1. ✅ Auth.js configured and integrated
2. ✅ tRPC context updated with session
3. ✅ Middleware protecting routes
4. ✅ TypeScript types defined

### Optional Enhancements
1. **OAuth Providers** - Add Google/GitHub credentials to `.env`
2. **Custom Sign-In UI** - Build branded sign-in form components
3. **Rate Limiting** - Add rate limiting to auth endpoints
4. **MFA/2FA** - Implement multi-factor authentication
5. **Magic Links** - Add passwordless email authentication
6. **Social Auth** - Add LinkedIn, Twitter, etc.

## Testing

### Manual Testing
1. Start development server: `npm run dev`
2. Navigate to `/api/auth/signin`
3. Test credential-based login
4. Test session persistence
5. Test protected routes
6. Test role-based access
7. Verify audit logs in database

### Session Testing
```typescript
// Get session in API route
import { getSession } from '@/lib/auth';
const session = await getSession();
console.log(session);

// Get session in client component
import { useSession } from 'next-auth/react';
const { data: session } = useSession();
console.log(session);
```

## Troubleshooting

### Common Issues

**Session not persisting:**
- Check NEXTAUTH_SECRET is set
- Verify cookies are enabled
- Check NEXTAUTH_URL matches your domain

**Role-based access not working:**
- Verify JWT callback is setting role
- Check session callback is passing role to session
- Confirm middleware is checking correct role

**OAuth not working:**
- Verify provider credentials in .env
- Check callback URLs match provider settings
- Confirm provider is enabled in auth.ts
- Review redirect URIs in OAuth app configuration
- Check provider-specific requirements (LinkedIn needs app review)

**Profile sync not working:**
- Verify storage provider is configured correctly
- Check R2 credentials and bucket permissions
- Review error logs for avatar download failures
- Confirm OAuth provider allows image access

**Cannot disconnect OAuth account:**
- User must have password set first
- At least one other auth method required
- Check account is active and not deleted

---

## OAuth Integration (Complete) ✅

### Providers Configured

**✅ Google OAuth**
- Provider: `GoogleProvider`
- Scopes: `openid profile email`
- Email verification: Automatic
- Account linking: Enabled

**✅ GitHub OAuth**
- Provider: `GitHubProvider`
- Scopes: `user:email`
- Email verification: Automatic
- Account linking: Enabled

**✅ LinkedIn OAuth**
- Provider: `LinkedInProvider`
- Scopes: `openid profile email`
- Email verification: Automatic
- Account linking: Enabled
- **Note:** Requires LinkedIn app review for production

### OAuth Features

**✅ Account Linking**
- Automatic linking based on verified email
- Manual unlinking from settings
- Protection against removing only auth method
- Comprehensive audit logging

**✅ Profile Synchronization**
- Automatic sync on OAuth sign-in
- Avatar download and storage in R2
- Name sync for new users
- Respects manual user changes
- Configurable sync options

**✅ Error Handling**
- User-friendly error messages
- Provider-specific error handling
- Graceful fallback to alternative methods
- Detailed error logging for debugging

**✅ Security**
- OAuth tokens stored encrypted
- CSRF protection on all flows
- Session binding to user agent
- Account status validation
- Comprehensive audit trail

### OAuth Router (tRPC)

**Available endpoints:**
- `oauth.getLinkedAccounts` - View connected OAuth providers
- `oauth.hasPassword` - Check if password is set
- `oauth.disconnectProvider` - Unlink OAuth account
- `oauth.canSyncProfile` - Check sync availability
- `oauth.syncProfile` - Manual profile sync trigger

### Configuration Files

**OAuth Services:**
- `/src/lib/services/oauth-profile-sync.service.ts` - Profile sync logic
- `/src/lib/api/routers/oauth.router.ts` - tRPC endpoints
- `/src/lib/errors/oauth.errors.ts` - Error handling

**Documentation:**
- `/docs/modules/authentication/oauth-setup.md` - Admin setup guide
- `/docs/user-guides/account-connections.md` - User guide

**Environment variables:**
```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

### Setup Requirements

**Before enabling OAuth:**
1. Create OAuth apps with each provider
2. Configure redirect URIs for all domains
3. Add credentials to environment variables
4. Test in development environment
5. Complete provider-specific reviews (LinkedIn)
6. Update privacy policy with OAuth data usage
7. Test account linking and unlinking flows

**Redirect URI pattern:**
```
{BASE_URL}/api/auth/callback/{provider}
```

Where `{provider}` is: `google`, `github`, or `linkedin`

---

## Security Checklist
