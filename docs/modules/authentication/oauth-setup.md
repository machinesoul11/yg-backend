# OAuth Integration - Setup Guide

## Overview

YES GODDESS platform supports three OAuth providers for seamless authentication:
- **Google OAuth** - For users with Google accounts
- **GitHub OAuth** - For developers and technical users
- **LinkedIn OAuth** - For professional networking integration

All OAuth providers support account linking, allowing users to connect multiple authentication methods to a single YES GODDESS account.

---

## Google OAuth Setup

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your project or create a new one
3. Click **"Create Credentials"** → **"OAuth client ID"**
4. Configure the OAuth consent screen if prompted:
   - Application type: **Web application**
   - Application name: **YES GODDESS**
   - User support email: Your support email
   - Developer contact: Your email
   - Scopes: `email`, `profile`, `openid` (default scopes are sufficient)
   - Test users: Add your email for testing

### 2. Configure OAuth Client

**Application type:** Web application

**Name:** YES GODDESS Platform

**Authorized JavaScript origins:**
```
http://localhost:3000
https://yesgoddess.com
https://admin.yesgoddess.com
```

**Authorized redirect URIs:**
```
http://localhost:3000/api/auth/callback/google
https://yesgoddess.com/api/auth/callback/google
https://admin.yesgoddess.com/api/auth/callback/google
```

### 3. Add Credentials to Environment

Copy the Client ID and Client Secret and add to `.env`:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 4. Verify Configuration

- Scopes requested: `openid profile email`
- Email verification: Automatic (Google verifies emails)
- Avatar sync: Enabled by default
- Account linking: Enabled

---

## GitHub OAuth Setup

### 1. Create OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the application details

### 2. Configure OAuth App

**Application name:** YES GODDESS Platform

**Homepage URL:**
```
https://yesgoddess.com
```

**Application description:**
```
YES GODDESS - Intellectual Property Licensing Marketplace
```

**Authorization callback URL:**
```
http://localhost:3000/api/auth/callback/github
https://yesgoddess.com/api/auth/callback/github
https://admin.yesgoddess.com/api/auth/callback/github
```

### 3. Add Credentials to Environment

Copy the Client ID and generate a Client Secret, then add to `.env`:

```env
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret
```

### 4. GitHub-Specific Considerations

- **Scopes requested:** `user:email` (to access verified email addresses)
- **Email handling:** GitHub users can have multiple emails; we use the primary verified email
- **No public email:** Some GitHub users hide their email; authentication still works
- **Profile data:** Username, avatar, bio are available
- **Account verification:** GitHub verifies emails, so `email_verified` is set to true

---

## LinkedIn OAuth Setup

### 1. Create LinkedIn App

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Click **"Create app"**
3. Fill in required information

### 2. Configure LinkedIn App

**App name:** YES GODDESS

**LinkedIn Page:** Your company LinkedIn page (required)

**Privacy policy URL:**
```
https://yesgoddess.com/legal/privacy
```

**App logo:** Upload YES GODDESS logo (400x400px minimum)

**Legal information:**
- Terms of service URL: `https://yesgoddess.com/legal/terms`
- Privacy policy URL: `https://yesgoddess.com/legal/privacy`

### 3. Configure OAuth Settings

1. Go to **"Auth"** tab in your LinkedIn app
2. Add **Authorized redirect URLs:**

```
http://localhost:3000/api/auth/callback/linkedin
https://yesgoddess.com/api/auth/callback/linkedin
https://admin.yesgoddess.com/api/auth/callback/linkedin
```

### 4. Request API Access

LinkedIn requires verification for production use:
1. Go to **"Products"** tab
2. Request access to **"Sign In with LinkedIn using OpenID Connect"**
3. Wait for LinkedIn approval (usually 1-2 business days)

### 5. Add Credentials to Environment

Copy the Client ID and Client Secret from the Auth tab:

```env
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```

### 6. LinkedIn-Specific Considerations

- **Scopes requested:** `openid profile email`
- **API restrictions:** LinkedIn has strict API access policies
- **Production approval:** Required before public use
- **Rate limits:** More restrictive than Google/GitHub
- **Professional data:** Access to job title, company, etc. (if additional scopes granted)
- **Data usage compliance:** Must comply with LinkedIn's data usage policies

---

## Account Linking Flow

### Automatic Account Linking

YES GODDESS automatically links OAuth accounts to existing users based on email address:

1. User signs in with OAuth provider (e.g., Google)
2. System checks if user with that email exists
3. If exists:
   - OAuth account is linked to existing user
   - User can now sign in with either method
   - Profile is synced from OAuth provider (for new accounts only)
4. If doesn't exist:
   - New user account is created
   - Email is automatically verified
   - Profile data is populated from OAuth provider

### Security Configuration

The platform uses `allowDangerousEmailAccountLinking: true` to enable seamless account linking. This is safe because:
- OAuth providers verify email ownership
- Only verified emails are linked
- Account status checks prevent linking to deleted/inactive accounts
- All linking events are logged in audit trail

### Manual Account Linking

Users can link/unlink OAuth accounts from their settings:

**Available via tRPC endpoints:**
- `oauth.getLinkedAccounts` - View connected accounts
- `oauth.disconnectProvider` - Unlink an OAuth provider
- `oauth.hasPassword` - Check if password is set

**Safety checks:**
- Cannot disconnect the only authentication method
- Must have password set before disconnecting all OAuth providers
- All actions are logged for security

---

## Profile Synchronization

### What Gets Synced

**From All Providers:**
- Name (if not manually set by user)
- Avatar/profile picture
- Email address
- Email verification status

**Provider-Specific Data:**
- **Google:** Locale preference
- **GitHub:** Username, bio, public repos
- **LinkedIn:** Professional headline, company

### Sync Rules

**New Users (first 5 minutes after signup):**
- All profile data is synced automatically
- Avatar is downloaded and stored in R2
- Name is populated from OAuth profile

**Existing Users:**
- Profile sync only if user hasn't made manual changes
- Avatar updated only if current avatar is from OAuth provider
- Name updated only if currently empty
- Manual changes are always preserved

**Manual Sync:**
- Users can trigger profile sync from settings
- Requires re-authentication with OAuth provider
- Respects user's manual changes unless explicitly overridden

### Avatar Handling

**Process:**
1. Avatar URL is retrieved from OAuth provider
2. Image is downloaded and validated:
   - Maximum size: 5MB
   - Allowed types: JPEG, PNG, WebP, GIF
   - Content type validation
3. Image is uploaded to R2 storage at `avatars/{userId}/{provider}-{hash}.{ext}`
4. User's avatar URL is updated to point to R2
5. Original OAuth avatar URL is not stored

**Benefits:**
- Avatars persist even if OAuth account is disconnected
- Images are optimized and served from R2 CDN
- No dependency on OAuth provider's CDN
- Consistent image delivery

---

## Error Handling

### OAuth Errors

The platform gracefully handles all OAuth errors:

**User denies permission:**
- Redirected to sign-in page
- Clear message: "Authentication cancelled"
- No error logged (user choice)

**Provider is unavailable:**
- Fallback to email/password authentication
- Error message: "OAuth provider temporarily unavailable"
- Technical error logged for monitoring

**Invalid credentials:**
- Clear message to administrators
- Error logged with provider details
- Does not expose credentials in logs

**Network timeout:**
- Retry logic for transient errors
- Clear timeout message to user
- Option to try different provider

### Account Status Errors

**Deleted account:**
- OAuth authentication denied
- Message: "This account has been deleted"
- Audit log entry created

**Inactive account:**
- OAuth authentication denied
- Message: "Account is inactive. Contact support."
- Admin notification sent

**No password set:**
- Warning when trying to disconnect OAuth
- Prevents user from being locked out
- Prompts to set password first

---

## Testing OAuth Integration

### Development Testing

**Local testing (http://localhost:3000):**
1. All three OAuth providers support localhost
2. Add `http://localhost:3000/api/auth/callback/{provider}` to redirect URIs
3. Test with personal accounts first
4. Verify account linking works correctly

**Test accounts:**
- Create test Google account
- Create test GitHub account
- Create test LinkedIn account (may require approval)

### Production Testing

**Before going live:**
1. ✅ Verify all redirect URIs are configured for production domain
2. ✅ Test account creation via each OAuth provider
3. ✅ Test account linking (existing email + OAuth)
4. ✅ Test disconnecting OAuth providers
5. ✅ Verify profile sync works correctly
6. ✅ Test error scenarios (deny permission, network error, etc.)
7. ✅ Confirm audit logging for all OAuth events
8. ✅ Verify avatar download and storage

**OAuth Provider Reviews:**
- **Google:** No review needed for basic scopes
- **GitHub:** No review needed
- **LinkedIn:** Requires app review for production use

---

## Monitoring and Analytics

### OAuth Metrics to Track

**Authentication metrics:**
- Sign-ins per provider (Google, GitHub, LinkedIn, Email)
- New user registrations per provider
- Account linking events
- OAuth error rates by provider

**Profile sync metrics:**
- Successful avatar downloads
- Failed avatar downloads (by provider)
- Profile sync events
- Manual vs automatic syncs

**User preferences:**
- % of users with password set
- % of users with 1+ OAuth provider
- % of users with multiple OAuth providers
- Most popular OAuth provider

### Audit Trail

All OAuth events are logged in the audit system:

**Logged events:**
- `LOGIN_SUCCESS` with OAuth provider
- `REGISTER_SUCCESS` via OAuth
- `PROFILE_UPDATED` from OAuth sync
- `PROFILE_UPDATED` for account linking/unlinking
- `LOGIN_FAILED` with OAuth error details

**Searchable fields:**
- Provider (google, github, linkedin)
- User ID and email
- IP address and user agent
- Success/failure status
- Error details

---

## Security Considerations

### OAuth Token Storage

**Access tokens:**
- Stored encrypted in `accounts` table
- Not exposed to frontend
- Automatically refreshed when expired

**Refresh tokens:**
- Stored encrypted in `accounts` table
- Used to obtain new access tokens
- Revoked when account is disconnected

**ID tokens:**
- Used for profile data extraction
- Not stored long-term
- Validated on each OAuth callback

### CSRF Protection

**Built-in Auth.js CSRF protection:**
- CSRF tokens on all OAuth requests
- State parameter validation
- Origin checking
- SameSite cookie attributes

**Additional security:**
- Session binding to IP and user agent
- Token expiration (30 days)
- Secure cookies in production
- HttpOnly cookies prevent XSS

### Data Privacy

**User data handling:**
- Only essential scopes requested
- Profile data stored in compliance with privacy policy
- Users can disconnect OAuth accounts anytime
- Avatar images stored in YES GODDESS R2, not linked to OAuth

**Compliance:**
- GDPR: Right to disconnect OAuth providers
- CCPA: Data deletion includes OAuth account data
- OAuth provider terms: All usage complies with Google, GitHub, LinkedIn policies

---

## Troubleshooting

### Common Issues

**"Redirect URI mismatch"**
- Verify exact URL in OAuth app settings
- Check protocol (http vs https)
- Ensure `/api/auth/callback/{provider}` path is correct
- Clear browser cache and try again

**"Invalid client"**
- Check GOOGLE_CLIENT_ID/GITHUB_ID/LINKEDIN_CLIENT_ID in .env
- Verify credentials are for correct OAuth app
- Ensure OAuth app is not suspended

**"Access denied"**
- User denied permission (expected)
- Check OAuth app is published (LinkedIn)
- Verify scopes requested are approved

**Profile sync not working**
- Check storage provider is configured
- Verify R2 credentials are correct
- Check avatar URL is accessible
- Review error logs for download failures

**Cannot disconnect OAuth provider**
- User must have password set first
- Cannot disconnect only auth method
- Check account status is active

---

## Administrator Checklist

Before enabling OAuth in production:

- [ ] **Google OAuth configured**
  - [ ] OAuth client created in Google Cloud Console
  - [ ] Redirect URIs added for all domains
  - [ ] Client ID and secret added to .env
  - [ ] Tested sign-in flow

- [ ] **GitHub OAuth configured**
  - [ ] OAuth app created in GitHub
  - [ ] Redirect URIs added for all domains
  - [ ] Client ID and secret added to .env
  - [ ] Tested sign-in flow

- [ ] **LinkedIn OAuth configured**
  - [ ] LinkedIn app created
  - [ ] App review approved by LinkedIn
  - [ ] Redirect URIs added for all domains
  - [ ] Client ID and secret added to .env
  - [ ] Tested sign-in flow

- [ ] **Account linking tested**
  - [ ] Existing user can link OAuth account
  - [ ] Multiple OAuth providers can be linked
  - [ ] Unlinking works correctly
  - [ ] Cannot remove only auth method

- [ ] **Profile sync tested**
  - [ ] Avatars download successfully
  - [ ] Avatars stored in R2
  - [ ] Names sync correctly
  - [ ] Manual changes preserved

- [ ] **Error handling verified**
  - [ ] OAuth errors show user-friendly messages
  - [ ] Provider outages handled gracefully
  - [ ] Audit logs capture all events

- [ ] **Security reviewed**
  - [ ] Tokens stored securely
  - [ ] CSRF protection enabled
  - [ ] Redirect URIs validated
  - [ ] Privacy policy updated

- [ ] **Documentation complete**
  - [ ] User help articles created
  - [ ] Admin setup guide complete
  - [ ] API documentation updated

---

## YES GODDESS Brand Compliance

### User Experience

OAuth buttons and flows maintain YES GODDESS aesthetic:

**Design principles:**
- Restraint and authority (not excitement)
- Ceremonial tone (not casual)
- Quiet confidence (not loud branding)
- Sovereignty (users are architects, not products)

**UI/UX requirements:**
- OAuth buttons use brand colors (VOID, BONE, ALTAR)
- "Continue with Google" (not "Sign in with Google")
- Clear, direct language without exclamation marks
- Seamless integration that feels natural, not like social media

**Brand voice in OAuth flows:**
- ✅ "Connect your Google account to continue"
- ❌ "Sign up with Google - It's fast and easy!"
- ✅ "Your professional profile, preserved"
- ❌ "Import your profile in seconds!"

---

## Support Resources

**OAuth Provider Documentation:**
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [LinkedIn OAuth 2.0](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)

**YES GODDESS Resources:**
- tRPC OAuth Router: `/src/lib/api/routers/oauth.router.ts`
- Auth.js Config: `/src/lib/auth.ts`
- Profile Sync Service: `/src/lib/services/oauth-profile-sync.service.ts`
- Environment Variables: `/.env`

**For Issues:**
- Check audit logs: `prisma studio` → `AuditEvent` table
- Review OAuth errors in application logs
- Test OAuth flow in development first
- Contact OAuth provider support if credentials issues

---

**Last Updated:** October 11, 2025  
**Status:** ✅ Production Ready  
**Maintainer:** YES GODDESS Platform Team
