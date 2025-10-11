# Users & Authentication Module

## Overview

The Users & Authentication module serves as the foundational security layer for the YES GODDESS platform. It manages user identity, access control, and session management across three distinct user types:

- **Creators** - Artists who own IP and earn royalties
- **Brands** - Companies licensing IP for campaigns
- **Admins** - Platform operators managing the ecosystem

## Architecture

### Database Schema

#### Core Tables

1. **users** - Primary identity table
   - `id` - Unique identifier (cuid)
   - `email` - Unique email address (normalized to lowercase)
   - `name` - User's display name (nullable)
   - `password_hash` - Bcrypt hashed password (nullable for OAuth-only accounts)
   - `email_verified` - Timestamp of email verification
   - `deleted_at` - Soft delete timestamp
   - `role` - User role (ADMIN, CREATOR, BRAND, VIEWER)
   - `isActive` - Account status flag
   - `lastLoginAt` - Last successful login timestamp

2. **accounts** - OAuth provider linking
   - Stores OAuth tokens and provider information
   - Supports multiple providers per user

3. **sessions** - Auth.js session management
   - `sessionToken` - Unique session identifier
   - `expires` - Session expiration timestamp

4. **verification_tokens** - Email verification
   - `token` - 64-character hex token
   - `expires` - 24-hour expiration

5. **password_reset_tokens** - Password recovery
   - `token` - 64-character hex token
   - `expires` - 1-hour expiration
   - `usedAt` - Timestamp of token usage (single-use)

6. **audit_events** - Comprehensive audit trail
   - Tracks all authentication events
   - Stores IP address, user agent, and event details

### Security Features

- **Password Requirements**:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
  - Bcrypt hashing with 12 rounds

- **Rate Limiting**:
  - Login: 5 attempts per 15 minutes per IP
  - Password Reset: 3 requests per hour per email
  - Account lockout after 10 failed attempts

- **Soft Deletes**:
  - 30-day grace period for account recovery
  - Permanent deletion checks for financial obligations

## API Endpoints (tRPC)

All endpoints are available via tRPC at `/api/trpc/auth.*`

### Public Endpoints

#### `auth.register`
Register a new user account.

**Input:**
```typescript
{
  email: string;
  password: string;
  name?: string;
  role: 'CREATOR' | 'BRAND';
}
```

**Output:**
```typescript
{
  success: true;
  data: {
    userId: string;
    email: string;
    emailVerified: false;
  };
  meta: {
    message: "Verification email sent to {email}";
  };
}
```

#### `auth.verifyEmail`
Verify email address with token from verification email.

**Input:**
```typescript
{
  token: string; // 64-character hex token
}
```

#### `auth.resendVerification`
Resend verification email.

**Input:**
```typescript
{
  email: string;
}
```

#### `auth.login`
Login with email and password.

**Input:**
```typescript
{
  email: string;
  password: string;
  rememberMe?: boolean;
}
```

**Output:**
```typescript
{
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      emailVerified: boolean;
    };
  };
}
```

#### `auth.requestPasswordReset`
Request password reset email.

**Input:**
```typescript
{
  email: string;
}
```

**Note:** Always returns success to prevent user enumeration.

#### `auth.resetPassword`
Reset password with token from reset email.

**Input:**
```typescript
{
  token: string;
  newPassword: string;
}
```

### Protected Endpoints

Require valid authentication session.

#### `auth.getSession`
Get current user session data.

**Output:**
```typescript
{
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      emailVerified: boolean;
      createdAt: string;
      updatedAt: string;
    };
  };
}
```

#### `auth.updateProfile`
Update user profile information.

**Input:**
```typescript
{
  name?: string;
  avatar?: string; // URL
}
```

#### `auth.changePassword`
Change password for authenticated user.

**Input:**
```typescript
{
  currentPassword: string;
  newPassword: string;
}
```

#### `auth.deleteAccount`
Soft delete user account (30-day grace period).

**Note:** Fails if user has pending financial obligations.

## Email Templates

All authentication emails follow YES GODDESS brand guidelines (VOID/BONE color scheme, ALTAR gold accents).

1. **Email Verification** - Sent on registration
2. **Welcome Email** - Sent after email verification
3. **Password Reset** - Contains secure reset link
4. **Password Changed** - Confirmation after password change

Email templates are located in `/emails/templates/`.

## Background Jobs

### Token Cleanup Job
**Schedule:** Every hour
**Purpose:** Remove expired verification and password reset tokens

### Session Cleanup Job
**Schedule:** Every 6 hours
**Purpose:** Remove expired sessions

### Account Deletion Job
**Schedule:** Daily at 2 AM
**Purpose:** Permanently delete soft-deleted accounts after 30-day grace period

### Failed Login Monitor Job
**Schedule:** Every 15 minutes
**Purpose:** Detect suspicious login patterns and lock accounts if needed

## Services

### AuthService
Core authentication business logic.

**Location:** `src/lib/services/auth.service.ts`

**Methods:**
- `registerUser()` - Create new user account
- `verifyEmail()` - Verify email with token
- `resendVerificationEmail()` - Resend verification email
- `loginUser()` - Authenticate user
- `requestPasswordReset()` - Send password reset email
- `resetPassword()` - Reset password with token
- `changePassword()` - Change password for authenticated user
- `updateProfile()` - Update user profile
- `deleteAccount()` - Soft delete account

### AuditService
Comprehensive audit logging.

**Location:** `src/lib/services/audit.service.ts`

**Events Tracked:**
- Registration (success/failure)
- Email verification
- Login (success/failure)
- Password reset requests
- Password changes
- Profile updates
- Account deletion

### EmailService
Email delivery and template rendering.

**Location:** `src/lib/services/email/email.service.ts`

**Authentication Methods:**
- `sendVerificationEmail()`
- `sendWelcomeEmail()`
- `sendPasswordResetEmail()`
- `sendPasswordChangedEmail()`

## Error Handling

All errors are structured using custom `AuthError` class.

**Location:** `src/lib/errors/auth.errors.ts`

**Error Codes:**
- `EMAIL_EXISTS` - Email already registered
- `INVALID_CREDENTIALS` - Invalid login
- `ACCOUNT_LOCKED` - Too many failed attempts
- `TOKEN_INVALID` - Invalid or expired token
- `TOKEN_EXPIRED` - Token past expiration
- `TOKEN_USED` - Token already consumed
- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Insufficient permissions
- `PENDING_OBLIGATIONS` - Cannot delete account with pending financials

## Testing

### Unit Tests
Located in `src/lib/services/__tests__/`

Test coverage includes:
- Password hashing and verification
- Token generation and validation
- Email sending
- Audit logging

### Integration Tests
Located in `src/lib/api/routers/__tests__/`

Test coverage includes:
- Registration flow
- Email verification
- Login flow
- Password reset flow
- Profile updates
- Account deletion

## Configuration

### Environment Variables

Required:
```bash
# Database
DATABASE_URL=postgresql://...
DATABASE_URL_POOLED=postgresql://...

# NextAuth
NEXTAUTH_SECRET=... # 256-bit secret
NEXTAUTH_URL=http://localhost:3000

# Email
RESEND_API_KEY=...
RESEND_SENDER_EMAIL=...
EMAIL_FROM_NAME="YES GODDESS"

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### OAuth Providers (Optional)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# GitHub OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

## Migration Guide

### Applying Schema Changes

1. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

2. Push schema to database:
   ```bash
   npm run db:push
   ```

   Or create a migration:
   ```bash
   npm run db:migrate
   ```

### Manual Migration Steps

If migrating from existing system:

1. Add authentication fields to existing `users` table
2. Create new tables: `verification_tokens`, `password_reset_tokens`, `audit_events`
3. Update `UserRole` enum if needed
4. Run Prisma generate

See `prisma/migrations/001_users_authentication.sql` for SQL migration.

## Usage Examples

### Frontend (React)

```typescript
import { trpc } from '@/lib/trpc';

// Registration
const registerMutation = trpc.auth.register.useMutation({
  onSuccess: () => {
    toast.success('Verification email sent!');
  },
  onError: (error) => {
    if (error.data?.code === 'EMAIL_EXISTS') {
      setError('email', { message: 'Email already registered' });
    }
  }
});

// Login
const loginMutation = trpc.auth.login.useMutation({
  onSuccess: (data) => {
    router.push('/dashboard');
  }
});

// Get session
const { data: session } = trpc.auth.getSession.useQuery();
```

### Backend (Server-side)

```typescript
import { authService } from '@/lib/services/auth.service';

// Register user
const result = await authService.registerUser({
  email: 'user@example.com',
  password: 'SecureP@ss123',
  role: 'CREATOR',
}, {
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
```

## Security Best Practices

1. **Never log passwords** - Always hash before storage
2. **Use timing-safe comparisons** - Prevent timing attacks
3. **Don't leak user existence** - Generic error messages
4. **Rate limit all endpoints** - Prevent brute-force
5. **Audit everything** - Comprehensive logging
6. **Validate all inputs** - Use Zod schemas
7. **Soft delete first** - Allow recovery period
8. **Check financial obligations** - Before permanent deletion

## Roadmap

### Phase 1: Core Authentication ✅
- [x] User registration
- [x] Email verification
- [x] Password authentication
- [x] Password reset
- [x] Profile management
- [x] Account deletion
- [x] Audit logging

### Phase 2: OAuth Integration (Planned)
- [ ] Google OAuth
- [ ] GitHub OAuth
- [ ] LinkedIn OAuth
- [ ] Account linking

### Phase 3: Advanced Security (Planned)
- [ ] Two-factor authentication (2FA)
- [ ] WebAuthn/Passkeys
- [ ] Session management UI
- [ ] Security notifications
- [ ] IP-based restrictions

### Phase 4: Compliance (Planned)
- [ ] GDPR data export
- [ ] CCPA compliance
- [ ] SOC 2 audit trail
- [ ] Privacy policy enforcement

## Support

For issues or questions:
- **Security Issues:** security@yesgoddess.com
- **General Support:** support@yesgoddess.com
- **Documentation:** https://docs.yesgoddess.com

## License

Copyright © 2025 YES GODDESS. All rights reserved.
