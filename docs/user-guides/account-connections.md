# Account Connection Guide

## Connecting Your Accounts

YES GODDESS allows you to connect multiple authentication methods to your account for convenient and secure access.

### Available Connection Methods

**Email & Password**
Your primary authentication method. We recommend setting a password even if you prefer using OAuth providers.

**Google Account**
Sign in with your Google account for quick, secure access.

**GitHub Account**
Connect your GitHub account for developer-friendly authentication.

**LinkedIn Account**
Use your professional LinkedIn profile to access YES GODDESS.

---

## How Account Linking Works

### Automatic Linking

When you sign in with an OAuth provider (Google, GitHub, or LinkedIn) using an email address that's already registered with YES GODDESS:

1. We automatically link the OAuth account to your existing account
2. You'll be signed in to your existing account
3. You can now use either method to sign in
4. Your profile information stays the same

**Example:**
- You register with email `creator@example.com` and password
- Later, you sign in with Google using the same email
- Google account is automatically linked
- You can now sign in with either email/password OR Google

### Security

- Only verified email addresses are linked
- All account linking events are logged
- You'll receive a notification when a new account is linked
- You can review and disconnect accounts anytime from your settings

---

## Managing Connected Accounts

### View Connected Accounts

From your account settings, you can see all authentication methods connected to your account:
- Which OAuth providers are linked
- When each was connected
- Whether you have a password set

### Disconnect an OAuth Account

You can disconnect any OAuth provider from your settings. However:

**Requirements:**
- You must have at least one other authentication method
- You cannot disconnect your only way to sign in
- You'll need to set a password first if you only have OAuth accounts

**To disconnect:**
1. Go to Settings → Account Security
2. Find the connected account
3. Click "Disconnect"
4. Confirm your decision

**What happens:**
- OAuth connection is removed
- Your YES GODDESS account remains active
- Your data and settings are preserved
- You can reconnect the same provider later

---

## Profile Synchronization

### What Gets Synced

When you first connect an OAuth account, we automatically sync:

**Profile Picture**
- Downloaded from your OAuth provider
- Stored securely in YES GODDESS storage
- Remains even if you disconnect the OAuth account
- You can change it manually anytime

**Display Name**
- Taken from your OAuth profile
- Only synced if you don't have a name set
- Manual changes are always preserved

**Email Verification**
- OAuth providers verify email addresses
- Your email is automatically verified when using OAuth
- Saves time in the verification process

### What Doesn't Get Synced

We respect your privacy and only sync essential information:
- ❌ Your OAuth provider's contacts or connections
- ❌ Private messages or communications
- ❌ Activity history from other platforms
- ❌ Any data beyond basic profile information

### Updating Your Profile

**Manual changes take priority:**
- If you manually update your profile picture, we won't overwrite it
- If you change your name, it stays as you set it
- Your preferences and settings are never synced from OAuth

**Re-syncing:**
- Profile sync happens automatically when you sign in with OAuth
- New users get full profile sync
- Existing users only get updates to empty fields
- Manual changes are always preserved

---

## First-Time Setup

### New to YES GODDESS?

**Sign up with OAuth (Recommended):**
1. Click "Continue with Google/GitHub/LinkedIn"
2. Authorize YES GODDESS to access basic profile info
3. Your account is created automatically
4. Email is verified instantly
5. Profile picture and name are populated

**Sign up with Email:**
1. Enter your email and create a password
2. Verify your email address via link
3. Set up your profile manually
4. Optionally connect OAuth accounts later

### Already Have an Account?

**Add OAuth to existing account:**
1. Sign in with your current method
2. Go to Settings → Account Security
3. Click "Connect [Provider]"
4. Authorize YES GODDESS
5. Account is linked automatically

**No duplicate accounts:**
- We prevent creating duplicate accounts
- OAuth with existing email links to original account
- Your data and settings are preserved

---

## Troubleshooting

### "This account is already connected to another user"

**Cause:** The email from your OAuth provider is registered to a different YES GODDESS account.

**Solution:**
1. Sign in with your original YES GODDESS account
2. Connect the OAuth provider from settings
3. Or use a different OAuth account

### "Cannot disconnect the only authentication method"

**Cause:** You're trying to disconnect your only way to sign in.

**Solution:**
1. Set a password first (Settings → Account Security → Set Password)
2. Or connect another OAuth provider
3. Then you can disconnect the current one

### "Authentication failed"

**Possible causes:**
- OAuth provider is temporarily unavailable
- You denied permission when prompted
- Network connection issue

**Solutions:**
- Try again in a few moments
- Use an alternative sign-in method
- Check your internet connection
- Contact support if issue persists

### Profile picture not syncing

**Possible causes:**
- Image from OAuth provider is too large (max 5MB)
- Image format not supported
- Network issue during download

**Solutions:**
- Try disconnecting and reconnecting the OAuth account
- Sign in again with the OAuth provider
- Upload a profile picture manually
- Contact support if issue continues

---

## Privacy & Security

### What We Access

**Google:**
- Email address
- Public profile (name, picture)
- Email verification status

**GitHub:**
- Email address (primary verified email)
- Public profile (username, avatar, bio)

**LinkedIn:**
- Email address
- Professional profile (name, headline, picture)

### What We Don't Access

- Your private messages or emails
- Your contacts or connections
- Your posts, comments, or activity
- Any data beyond basic profile information
- Access to post on your behalf

### Data Storage

**OAuth tokens:**
- Stored encrypted in our database
- Never exposed to other users
- Used only to verify your identity
- Can be revoked by disconnecting the account

**Profile data:**
- Your profile picture is stored in our secure storage
- Name and email are in your YES GODDESS account
- Not shared with other OAuth providers
- Deleted when you delete your account

### Revoking Access

You can revoke YES GODDESS access from each provider:

**Google:**
[Google Account Permissions](https://myaccount.google.com/permissions)

**GitHub:**
[GitHub Authorized Applications](https://github.com/settings/applications)

**LinkedIn:**
LinkedIn Settings → Account → Permitted Services

**Note:** Revoking access disconnects the OAuth account but doesn't delete your YES GODDESS account.

---

## Best Practices

### For Creators

**Recommended setup:**
1. ✅ Set a strong password (for backup access)
2. ✅ Connect at least one OAuth provider (convenience)
3. ✅ Verify your email address
4. ✅ Enable two-factor authentication (coming soon)

**Why multiple methods:**
- Access your account even if OAuth provider has issues
- Flexibility to use whichever is most convenient
- Extra security layer

### For Brands

**Recommended setup:**
1. ✅ Use company email with password
2. ✅ Connect Google or LinkedIn (team access)
3. ✅ Document which team members have access
4. ✅ Review connected accounts regularly

**Team access:**
- Different team members can use different OAuth providers
- All connect to the same brand account
- Maintain control via primary email/password

---

## Support

**Need help with account connections?**

**Email:** support@yesgoddess.agency  
**Response time:** Within 24 hours

**Before contacting support:**
- ✓ Check which accounts are currently connected (Settings)
- ✓ Verify you have at least one working authentication method
- ✓ Try signing in with alternative method
- ✓ Review error message carefully

**When contacting support, include:**
- Which OAuth provider you're having trouble with
- What you were trying to do
- Any error messages you saw
- Your account email address

---

**Last Updated:** October 11, 2025  
**Platform:** YES GODDESS  
**Version:** 1.0
