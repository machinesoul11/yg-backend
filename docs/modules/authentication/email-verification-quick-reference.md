# Email Verification - Quick Reference Guide

## For Developers

### Quick Start

The email verification system is already fully integrated. Here's what you need to know:

---

## 🎯 Key Facts

- ✅ **Auto-sends** on user registration
- ✅ **24-hour** token expiration
- ✅ **Rate limited** resend (3 per 10 min)
- ✅ **Middleware protected** creator/brand routes
- ✅ **Verified badge** component ready to use

---

## 📋 Common Tasks

### Check if User is Verified

```typescript
// In server component
const session = await getServerSession(authOptions);
const isVerified = session?.user.emailVerified;

// In client component (with session)
const { data: session } = useSession();
const isVerified = session?.user.emailVerified;

// In database query
const user = await prisma.user.findUnique({
  where: { id: userId }
});
const isVerified = !!user.email_verified;
```

### Display Verified Badge

```tsx
import { ConditionalVerifiedBadge } from '@/components/ui';

<ConditionalVerifiedBadge 
  isVerified={!!user.emailVerified}
  size="md"
  showLabel={true}
/>
```

### Add Resend Button

```tsx
import { ResendVerification } from '@/components/auth/ResendVerification';

<ResendVerification 
  email={user.email}
  variant="button"
/>
```

### Manually Send Verification Email

```typescript
import { AuthService } from '@/lib/services/auth.service';
import { emailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';

const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

await authService.resendVerificationEmail(email, {
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Protect API Route with Verification Check

```typescript
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }
  
  if (!session.user.emailVerified) {
    return NextResponse.json(
      { error: 'Email verification required' }, 
      { status: 403 }
    );
  }
  
  // Process request...
}
```

---

## 🛣️ Routes

| Route | Purpose |
|-------|---------|
| `/auth/verify-email?token=...` | Verification link destination |
| `/auth/verification-required` | Shown to unverified users accessing protected routes |
| `/api/auth/verify-email` | POST endpoint for verification |
| `/api/auth/resend-verification` | POST endpoint for resending email |

---

## 🎨 UI Components

### VerifiedBadge

```tsx
import { VerifiedBadge } from '@/components/ui';

// Small, icon only
<VerifiedBadge size="sm" />

// Medium with label
<VerifiedBadge size="md" showLabel={true} />

// Custom tooltip
<VerifiedBadge tooltipText="Verified on Jan 1, 2024" />
```

### ConditionalVerifiedBadge

```tsx
import { ConditionalVerifiedBadge } from '@/components/ui';

// Only shows if isVerified is true
<ConditionalVerifiedBadge 
  isVerified={user.emailVerified}
  size="sm"
/>
```

### ResendVerification

```tsx
import { ResendVerification } from '@/components/auth/ResendVerification';

// Button variant (default)
<ResendVerification email={user.email} />

// Link variant
<ResendVerification 
  email={user.email}
  variant="link"
  onSuccess={() => console.log('Sent!')}
/>
```

---

## 🔐 Middleware Configuration

Protected routes automatically check verification:

```typescript
// src/middleware.ts
// Creator and Brand routes require verified email
// Admin routes do NOT require verified email
```

To change which routes require verification:

```typescript
const requiresVerification = path.startsWith('/creator') || path.startsWith('/brand');
```

---

## 🎭 Session Data Structure

```typescript
interface Session {
  user: {
    id: string;
    email: string;
    emailVerified: boolean; // ← Verification status
    role: string;
    // ... other fields
  }
}

interface JWT {
  userId: string;
  email: string;
  emailVerified: boolean; // ← Verification status
  role: string;
  // ... other fields
}
```

---

## 🗄️ Database Queries

### Get all unverified users

```typescript
const unverified = await prisma.user.findMany({
  where: {
    email_verified: null,
    deleted_at: null,
  },
  select: {
    id: true,
    email: true,
    createdAt: true,
  }
});
```

### Get verification token

```typescript
const token = await prisma.verificationToken.findUnique({
  where: { token: tokenString },
  include: { user: true }
});
```

### Clean up expired tokens

```typescript
await prisma.verificationToken.deleteMany({
  where: {
    expires: {
      lt: new Date()
    }
  }
});
```

---

## 📧 Email Template Variables

```typescript
{
  userName: string;      // User's name
  verificationUrl: string; // Full URL with token
}
```

Template location: `emails/templates/EmailVerification.tsx`

---

## 🚨 Error Handling

### Known Error Codes

| Code | Meaning | Response |
|------|---------|----------|
| `TOKEN_INVALID` | Token doesn't exist | Show error, offer resend |
| `TOKEN_EXPIRED` | Token > 24 hours old | Show expired message, offer resend |
| `ALREADY_VERIFIED` | Email already verified | Redirect to dashboard |

### Example Error Handling

```typescript
try {
  await authService.verifyEmail(token);
} catch (error) {
  if (error === AuthErrors.TOKEN_EXPIRED) {
    // Show expired message
  } else if (error === AuthErrors.TOKEN_INVALID) {
    // Show invalid message
  } else if (error === AuthErrors.ALREADY_VERIFIED) {
    // Redirect to dashboard
  } else {
    // Generic error
  }
}
```

---

## 📊 Audit Events

Verification events logged automatically:

- `EMAIL_VERIFICATION_SENT` - Verification email sent
- `EMAIL_VERIFIED` - Email successfully verified
- `REGISTER_SUCCESS` - User registered (includes verification email send)

Query audit logs:

```typescript
const events = await prisma.auditEvent.findMany({
  where: {
    action: { in: ['EMAIL_VERIFICATION_SENT', 'EMAIL_VERIFIED'] },
    userId: user.id
  },
  orderBy: { timestamp: 'desc' }
});
```

---

## ⚙️ Configuration Constants

```typescript
// Token expiration
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

// Rate limiting
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 3; // per window

// Locations to change:
// src/lib/services/auth.service.ts
// src/app/api/auth/resend-verification/route.ts
```

---

## 🧪 Testing Locally

1. Register a new user account
2. Check terminal for verification email log
3. Copy verification URL from logs
4. Open in browser
5. Should redirect to sign-in after 5 seconds

To test expired tokens:
```sql
-- Manually expire a token
UPDATE verification_tokens 
SET expires = NOW() - INTERVAL '1 day'
WHERE token = 'your-token-here';
```

---

## 🐛 Common Issues

### "Email already verified" when trying to verify

**Solution**: User's email is already verified. Check `user.email_verified` field.

### Verification email not received

**Checks**:
1. Check Resend dashboard
2. Check spam folder
3. Verify sender email in Resend is verified
4. Check audit logs for `EMAIL_VERIFICATION_SENT` event

### Rate limit error when testing

**Solution**: Wait 10 minutes or clear rate limit map:
```typescript
// In src/app/api/auth/resend-verification/route.ts
rateLimitMap.clear(); // Add temporarily for testing
```

### Middleware redirect loop

**Solution**: Ensure `/auth/verification-required` is not in middleware matcher.

---

## 📚 Full Documentation

See: `docs/modules/authentication/email-verification.md`

Examples: `src/examples/verified-badge-usage.tsx`

---

## 🎓 Best Practices

1. **Always use ConditionalVerifiedBadge** unless you're certain the user is verified
2. **Don't email enumerate** - return generic success for non-existent users
3. **Rate limit aggressively** - prevents abuse
4. **Log all verification events** - helps with debugging and security
5. **Show helpful error messages** - guide users to resolution
6. **Make resend easy** - don't frustrate users with expired tokens

---

## Quick Integration Checklist

When adding email verification to a new feature:

- [ ] Add `ConditionalVerifiedBadge` to user profiles
- [ ] Check `session.user.emailVerified` before sensitive actions
- [ ] Add verification check to API routes if needed
- [ ] Update middleware if new protected routes
- [ ] Show helpful messaging for unverified users
- [ ] Provide resend option if verification fails
- [ ] Log verification events in audit trail

---

**That's it!** The system is fully functional and ready to use. 🎉
