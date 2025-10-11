# OAuth Configuration - Quick Reference

## Environment Variables

Add these to your `.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```

---

## Redirect URIs

Configure these callback URLs in each OAuth provider:

### Development
```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/github
http://localhost:3000/api/auth/callback/linkedin
```

### Production
```
https://yesgoddess.com/api/auth/callback/google
https://yesgoddess.com/api/auth/callback/github
https://yesgoddess.com/api/auth/callback/linkedin

https://admin.yesgoddess.com/api/auth/callback/google
https://admin.yesgoddess.com/api/auth/callback/github
https://admin.yesgoddess.com/api/auth/callback/linkedin
```

---

## Provider Setup Links

| Provider | Setup URL | Docs |
|----------|-----------|------|
| **Google** | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) | [OAuth 2.0](https://developers.google.com/identity/protocols/oauth2) |
| **GitHub** | [github.com/settings/developers](https://github.com/settings/developers) | [OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps) |
| **LinkedIn** | [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) | [OAuth 2.0](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication) |

---

## Testing OAuth Locally

### 1. Start Development Server
```bash
npm run dev
```

### 2. Test OAuth Flow
1. Navigate to `http://localhost:3000/auth/signin`
2. Click on OAuth provider button
3. Authorize YES GODDESS
4. Should redirect back and create session

### 3. Verify Account Created
```bash
# Open Prisma Studio
npm run db:studio

# Check tables:
# - User (new user created)
# - Account (OAuth account linked)
# - Session (active session)
```

---

## tRPC OAuth Endpoints

### Client Usage Example

```typescript
import { api } from '@/lib/api/client';

// Get linked accounts
const { data } = await api.oauth.getLinkedAccounts.useQuery();
// Returns: [{ provider: 'google', providerAccountId: '...', type: 'oauth' }]

// Check if password is set
const { data } = await api.oauth.hasPassword.useQuery();
// Returns: { hasPassword: true|false }

// Disconnect provider
const mutation = api.oauth.disconnectProvider.useMutation();
await mutation.mutateAsync({ provider: 'google' });

// Check if can sync profile
const { data } = await api.oauth.canSyncProfile.useQuery();
// Returns: { canSync: true|false }
```

### Server Usage Example

```typescript
import { appRouter } from '@/lib/api/root';
import { createCallerFactory } from '@/lib/trpc';

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({ session, req, resHeaders });

// Get linked accounts
const accounts = await caller.oauth.getLinkedAccounts();

// Disconnect provider
await caller.oauth.disconnectProvider({ provider: 'github' });
```

---

## Profile Sync Configuration

### Default Behavior

**New Users (< 5 minutes old):**
- ✅ Sync avatar from OAuth
- ✅ Sync name from OAuth
- ✅ Override any existing data

**Existing Users:**
- ✅ Sync avatar if empty or from OAuth provider
- ✅ Sync name if empty
- ❌ Don't override manual changes

### Custom Sync Options

```typescript
await oauthProfileSyncService.syncProfile(userId, profile, {
  syncAvatar: true,          // Download and store avatar
  syncName: true,            // Update name from OAuth
  overrideManualChanges: false  // Respect user's manual edits
});
```

---

## Error Codes

| Error | User Message | Action |
|-------|-------------|--------|
| `OAuthSignin` | Authentication could not be initiated | Retry |
| `OAuthCallback` | Authentication could not be completed | Retry or different method |
| `AccessDenied` | Access denied | Grant permissions |
| `OAuthAccountNotLinked` | Account already connected to another user | Sign in with original method |
| `OAuthProviderError` | Provider temporarily unavailable | Retry later |

---

## Security Checklist

### Before Production

- [ ] All OAuth apps created
- [ ] Production redirect URIs configured
- [ ] Environment variables set in production
- [ ] HTTPS enabled (required for secure cookies)
- [ ] NEXTAUTH_SECRET is strong and unique
- [ ] Privacy policy updated with OAuth data usage
- [ ] LinkedIn app review completed (if using LinkedIn)
- [ ] Test account linking flow
- [ ] Test account unlinking flow
- [ ] Verify profile sync works
- [ ] Test error scenarios
- [ ] Audit logs enabled and monitored

### OAuth Token Security

- ✅ Tokens stored encrypted in database
- ✅ Tokens not exposed to frontend
- ✅ Tokens auto-refresh when expired
- ✅ Tokens deleted when account unlinked
- ✅ CSRF protection enabled
- ✅ Secure cookies in production

---

## Common Tasks

### Add New OAuth Provider

1. Install provider package (if needed)
2. Add provider to `src/lib/auth.ts`:
   ```typescript
   import NewProvider from 'next-auth/providers/new-provider';
   
   // In providers array:
   ...(process.env.NEW_PROVIDER_ID && process.env.NEW_PROVIDER_SECRET
     ? [
         NewProvider({
           clientId: process.env.NEW_PROVIDER_ID,
           clientSecret: process.env.NEW_PROVIDER_SECRET,
           allowDangerousEmailAccountLinking: true,
         }),
       ]
     : []),
   ```
3. Add environment variables to `.env`
4. Update OAuth router types
5. Update documentation

### Debug OAuth Issues

```bash
# Enable Auth.js debug mode
export DEBUG=true

# Check Auth.js logs
npm run dev

# Check audit logs for OAuth events
npm run db:studio
# Navigate to AuditEvent table
# Filter by action: LOGIN_SUCCESS, REGISTER_SUCCESS, PROFILE_UPDATED
```

### Monitor OAuth Usage

```typescript
// Query audit events
const oauthLogins = await prisma.auditEvent.count({
  where: {
    action: 'LOGIN_SUCCESS',
    afterJson: {
      path: ['isOAuth'],
      equals: true
    }
  }
});

// Count users per provider
const accountsByProvider = await prisma.account.groupBy({
  by: ['provider'],
  _count: true
});
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Auth.js configuration with OAuth providers |
| `src/lib/services/oauth-profile-sync.service.ts` | Profile sync logic |
| `src/lib/api/routers/oauth.router.ts` | tRPC OAuth endpoints |
| `src/lib/errors/oauth.errors.ts` | OAuth error handling |
| `src/app/auth/error/page.tsx` | OAuth error display page |
| `docs/modules/authentication/oauth-setup.md` | Full setup guide |
| `docs/user-guides/account-connections.md` | User documentation |

---

**Quick Links:**
- [Full OAuth Setup Guide](./oauth-setup.md)
- [User Account Connection Guide](../../user-guides/account-connections.md)
- [Auth.js Documentation](https://authjs.dev)
- [YES GODDESS Brand Guidelines](../../brand/guidelines.md)

---

**Last Updated:** October 11, 2025  
**Status:** ✅ Production Ready
