# Authentication Module - Quick Reference

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install bcryptjs @types/bcryptjs
```

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Apply Database Migration
```bash
# Development
npx prisma db push

# Production
npx prisma migrate deploy
```

### 4. Set Environment Variables
```bash
NEXTAUTH_SECRET=your-256-bit-secret
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=your-resend-api-key
RESEND_SENDER_EMAIL=noreply@yesgoddess.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 📡 API Endpoints

### Registration Flow
```typescript
// 1. Register user
const result = await trpc.auth.register.mutate({
  email: 'creator@example.com',
  password: 'SecureP@ss123',
  name: 'Creative Artist',
  role: 'CREATOR'
});

// 2. Verify email
await trpc.auth.verifyEmail.mutate({
  token: '64-char-hex-token-from-email'
});

// 3. Resend verification (if needed)
await trpc.auth.resendVerification.mutate({
  email: 'creator@example.com'
});
```

### Login Flow
```typescript
// Login
const session = await trpc.auth.login.mutate({
  email: 'creator@example.com',
  password: 'SecureP@ss123',
  rememberMe: true
});

// Get current session
const { data } = await trpc.auth.getSession.query();
```

### Password Reset Flow
```typescript
// 1. Request reset
await trpc.auth.requestPasswordReset.mutate({
  email: 'creator@example.com'
});

// 2. Reset password
await trpc.auth.resetPassword.mutate({
  token: '64-char-hex-token-from-email',
  newPassword: 'NewSecureP@ss456'
});
```

### Account Management
```typescript
// Update profile
await trpc.auth.updateProfile.mutate({
  name: 'New Name',
  avatar: 'https://example.com/avatar.jpg'
});

// Change password
await trpc.auth.changePassword.mutate({
  currentPassword: 'CurrentP@ss123',
  newPassword: 'NewP@ss456'
});

// Delete account
await trpc.auth.deleteAccount.mutate();
```

## 🔒 Security Rules

### Password Requirements
- ✅ Minimum 8 characters
- ✅ At least 1 uppercase letter
- ✅ At least 1 lowercase letter
- ✅ At least 1 number
- ✅ At least 1 special character
- ✅ Maximum 100 characters

### Rate Limits (When Configured)
- Login: 5 attempts per 15 minutes per IP
- Password Reset: 3 requests per hour per email
- Account Lockout: After 10 failed login attempts

### Token Expiration
- Email Verification: 24 hours
- Password Reset: 1 hour
- Password Reset (used): Deleted after 7 days
- Sessions: Configurable via NextAuth

## 🎯 Common Use Cases

### Server-Side (Backend)
```typescript
import { authService } from '@/lib/services/auth.service';

// Register user
const result = await authService.registerUser({
  email: 'user@example.com',
  password: 'SecureP@ss123',
  role: 'CREATOR'
}, {
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

// Login user
const session = await authService.loginUser({
  email: 'user@example.com',
  password: 'SecureP@ss123'
}, {
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Client-Side (Frontend)
```typescript
import { trpc } from '@/lib/trpc';

// Registration form
const registerMutation = trpc.auth.register.useMutation({
  onSuccess: () => {
    toast.success('Verification email sent!');
    router.push('/verify-email');
  },
  onError: (error) => {
    if (error.data?.code === 'EMAIL_EXISTS') {
      setError('email', { message: 'Email already registered' });
    }
  }
});

// Login form
const loginMutation = trpc.auth.login.useMutation({
  onSuccess: () => {
    router.push('/dashboard');
  }
});

// Get session hook
const { data: session, isLoading } = trpc.auth.getSession.useQuery();

if (isLoading) return <Spinner />;
if (!session) return <Navigate to="/login" />;

return <Dashboard user={session.data.user} />;
```

## 📧 Email Templates

All templates support these variables:

**Email Verification:**
```typescript
{
  userName: string;
  verificationUrl: string;
}
```

**Welcome Email:**
```typescript
{
  userName: string;
}
```

**Password Reset:**
```typescript
{
  userName: string;
  resetUrl: string;
}
```

**Password Changed:**
```typescript
{
  userName: string;
}
```

## 🔍 Audit Events

All authentication events are logged:
```typescript
// Actions tracked
REGISTER_SUCCESS
REGISTER_FAILED
EMAIL_VERIFICATION_SENT
EMAIL_VERIFIED
LOGIN_SUCCESS
LOGIN_FAILED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_SUCCESS
PASSWORD_CHANGED
PROFILE_UPDATED
ACCOUNT_LOCKED
ACCOUNT_DELETED
ACCOUNT_PERMANENTLY_DELETED
```

Query audit events:
```typescript
import { auditService } from '@/lib/services/audit.service';

// Get user's audit trail
const events = await auditService.getUserAuditEvents(userId, 50);

// Check failed login attempts
const failedAttempts = await auditService.getFailedLoginAttempts(
  email,
  new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
);

// Search events
const results = await auditService.searchEvents({
  action: 'LOGIN_FAILED',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  limit: 100
});
```

## 🛠️ Troubleshooting

### "Property 'verificationToken' does not exist on type 'PrismaClient'"
**Solution:** Run `npx prisma generate` to regenerate Prisma client

### Email not sending
**Check:**
1. RESEND_API_KEY is set correctly
2. RESEND_SENDER_EMAIL is verified in Resend dashboard
3. Email not in suppression list
4. Check email service logs

### Account locked
**Solution:**
```typescript
// Admin manually unlock
await prisma.user.update({
  where: { email: 'user@example.com' },
  data: { isActive: true }
});
```

### Token expired
**Solution:** Request new token via `resendVerification` or `requestPasswordReset`

## 🧪 Testing

### Test User Creation (Development)
```typescript
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

const passwordHash = await bcrypt.hash('TestP@ss123', 12);

await prisma.user.create({
  data: {
    email: 'test@example.com',
    name: 'Test User',
    role: 'CREATOR',
    password_hash: passwordHash,
    email_verified: new Date(),
    isActive: true
  }
});
```

### Test Email Verification Token
```typescript
const token = crypto.randomBytes(32).toString('hex');

await prisma.verificationToken.create({
  data: {
    userId: user.id,
    token,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
});

console.log(`Verification URL: http://localhost:3000/auth/verify-email?token=${token}`);
```

## 📚 Further Reading

- [Full Documentation](./AUTHENTICATION_MODULE.md)
- [Implementation Checklist](./AUTHENTICATION_CHECKLIST.md)
- [Implementation Summary](./AUTHENTICATION_IMPLEMENTATION_SUMMARY.md)
- [Prisma Schema](../prisma/schema.prisma)
- [Migration SQL](../prisma/migrations/001_users_authentication.sql)

## 🆘 Support

- Security Issues: security@yesgoddess.com
- General Support: support@yesgoddess.com
- Documentation: https://docs.yesgoddess.com
