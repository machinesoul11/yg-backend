# Email Service - Resend Configuration Guide

## Overview

This document provides the complete setup instructions for configuring Resend as the email service provider for the YES GODDESS platform.

## Prerequisites

- [ ] Resend account created at https://resend.com
- [ ] Domain ownership verified
- [ ] DNS access for domain authentication
- [ ] Database migrations run to create email tables

## Step 1: Create Resend Account

1. Visit https://resend.com and sign up
2. Verify your email address
3. Complete account setup

## Step 2: Domain Authentication

### Add Your Domain

1. Navigate to **Domains** in Resend dashboard
2. Click **Add Domain**
3. Enter your sending domain (e.g., `yesgoddess.com` or `mail.yesgoddess.com`)

### Configure DNS Records

Add the following DNS records provided by Resend:

#### DKIM Record (Domain Keys)
```
Type: TXT
Name: resend._domainkey.yesgoddess.com
Value: [Provided by Resend dashboard]
TTL: 3600
```

#### SPF Record
```
Type: TXT
Name: yesgoddess.com
Value: v=spf1 include:spf.resend.com ~all
TTL: 3600
```

#### DMARC Record
```
Type: TXT
Name: _dmarc.yesgoddess.com
Value: v=DMARC1; p=none; rua=mailto:dmarc@yesgoddess.com
TTL: 3600
```

### Verify Domain

1. Wait 5-10 minutes for DNS propagation
2. Click **Verify** in Resend dashboard
3. Confirm all records show as verified

## Step 3: Generate API Key

1. Navigate to **API Keys** in Resend dashboard
2. Click **Create API Key**
3. Name: `YES GODDESS Production`
4. Permissions: 
   - ✅ Full sending access
   - ✅ Read domains
   - ✅ Webhook management
5. Copy the generated API key

## Step 4: Configure Environment Variables

Add to your `.env` file:

```bash
# Email (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
RESEND_SENDER_EMAIL=noreply@updates.yesgoddess.agency
EMAIL_FROM_NAME=YES GODDESS
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

## Step 5: Set Up Webhooks

### Create Webhook Endpoint

1. Navigate to **Webhooks** in Resend dashboard
2. Click **Add Endpoint**
3. URL: `https://api.yesgoddess.com/api/webhooks/resend`
4. Description: `YES GODDESS Production Webhook`

### Subscribe to Events

Select the following events:

- [x] `email.sent` - Email was accepted by Resend
- [x] `email.delivered` - Email was successfully delivered
- [x] `email.opened` - Recipient opened the email
- [x] `email.clicked` - Recipient clicked a link
- [x] `email.bounced` - Email bounced (hard or soft)
- [x] `email.complained` - Recipient marked as spam

### Get Webhook Secret

1. After creating the webhook, click on it
2. Copy the **Signing Secret** (starts with `whsec_`)
3. Add to environment variables as `RESEND_WEBHOOK_SECRET`

## Step 6: Run Database Migration

```bash
# Generate Prisma client with new email models
npm run db:generate

# Run migration
npm run db:migrate
```

This creates the following tables:
- `email_events` - Track email delivery events
- `email_preferences` - User email preferences
- `email_suppressions` - Bounce/complaint suppression list

## Step 7: Test Email Sending

### Send Test Email

```typescript
import { emailService } from '@/lib/services/email/email.service';

// Test transactional email
await emailService.sendTransactional({
  email: 'your-test-email@example.com',
  subject: 'Test Email from YES GODDESS',
  template: 'welcome',
  variables: {
    userName: 'Test User',
    verificationUrl: 'https://app.yesgoddess.com/verify',
    role: 'creator',
  },
});
```

### Verify in Resend Dashboard

1. Navigate to **Emails** in Resend dashboard
2. You should see the test email
3. Check delivery status

## Step 8: Configure Suppression List Handling

### Automatic Suppression

The system automatically adds emails to the suppression list for:
- **Hard bounces** - Permanently suppress
- **Spam complaints** - Permanently suppress
- **Soft bounces** - Retry 3 times, then suppress for 7 days

### Manual Suppression Management

```typescript
// Add email to suppression list
await prisma.emailSuppression.create({
  data: {
    email: 'user@example.com',
    reason: 'MANUAL',
  },
});

// Remove from suppression list
await prisma.emailSuppression.delete({
  where: { email: 'user@example.com' },
});
```

## Step 9: Email Templates

### Available Templates

All templates are located in `/emails/templates/`:

1. **WelcomeEmail** - New user registration
2. **EmailVerification** - Email verification link
3. **PasswordReset** - Password reset link
4. **RoyaltyStatement** - Monthly royalty notification
5. **LicenseExpiry** - License expiry warnings
6. **PayoutConfirmation** - Payout completed

### Preview Templates

```bash
# Start React Email development server
npm run email:dev

# Access at http://localhost:3000
```

### Create New Template

```typescript
// /emails/templates/YourNewTemplate.tsx
import { Html, Body, Container, Text } from '@react-email/components';

interface YourNewTemplateProps {
  name: string;
}

export const YourNewTemplate = ({ name }: YourNewTemplateProps) => {
  return (
    <Html>
      <Body>
        <Container>
          <Text>Hello {name}!</Text>
        </Container>
      </Body>
    </Html>
  );
};

export default YourNewTemplate;
```

Then register in `/src/lib/services/email/templates.ts`:

```typescript
import YourNewTemplate from '../../../../emails/templates/YourNewTemplate';

export const EMAIL_TEMPLATES = {
  // ...existing templates
  'your-new-template': YourNewTemplate,
};
```

## Step 10: Monitoring & Alerts

### Key Metrics to Monitor

1. **Delivery Rate** - Should be >95%
2. **Bounce Rate** - Should be <5%
3. **Complaint Rate** - Should be <0.1%
4. **Open Rate** - Industry average 20-30%
5. **Click Rate** - Industry average 2-5%

### Set Up Alerts

Configure alerts in your monitoring system for:

- Bounce rate > 5% (indicates sender reputation issues)
- Complaint rate > 0.1% (spam threshold)
- API error rate > 1%
- Delivery rate dropping below 95%

### View Email Analytics

```typescript
// Get delivery status for a specific email
const status = await emailService.getDeliveryStatus('msg_xxxxxxxxx');

// Get user's email history
const events = await prisma.emailEvent.findMany({
  where: { userId: 'user123' },
  orderBy: { sentAt: 'desc' },
  take: 50,
});
```

## Troubleshooting

### Emails Not Sending

1. Check API key is valid: `RESEND_API_KEY` in `.env`
2. Verify domain is authenticated in Resend dashboard
3. Check sender email matches verified domain
4. Review error logs in application

### Emails Going to Spam

1. Ensure SPF, DKIM, and DMARC records are properly configured
2. Check domain reputation at https://mxtoolbox.com/
3. Verify content doesn't trigger spam filters
4. Ensure "From" address is properly authenticated

### Webhooks Not Working

1. Verify webhook URL is accessible: `https://api.yesgoddess.com/api/webhooks/resend`
2. Check webhook secret matches: `RESEND_WEBHOOK_SECRET`
3. Test webhook endpoint with Resend dashboard test feature
4. Review webhook logs in Resend dashboard

### High Bounce Rate

1. Review bounced emails in database: `SELECT * FROM email_suppressions WHERE reason = 'BOUNCE'`
2. Clean email list - remove invalid emails
3. Implement double opt-in for new signups
4. Use email verification service for new addresses

## Security Best Practices

1. **API Key Security**
   - Never commit API keys to version control
   - Use environment variables for all credentials
   - Rotate API keys quarterly

2. **Webhook Verification**
   - Always verify webhook signatures
   - Use timing-safe comparison for signatures
   - Log failed verification attempts

3. **Rate Limiting**
   - Enforce per-user rate limits (50 emails/hour)
   - Implement campaign rate limits (10 campaigns/day)
   - Monitor for abuse patterns

4. **Data Privacy**
   - Respect user email preferences
   - Honor unsubscribe requests immediately
   - Provide easy opt-out mechanisms
   - Comply with GDPR, CAN-SPAM, CASL

## Production Checklist

- [ ] Domain fully authenticated (DKIM, SPF, DMARC verified)
- [ ] API key generated with appropriate permissions
- [ ] Webhook endpoint configured and tested
- [ ] Environment variables set in production
- [ ] Database migrations run successfully
- [ ] All email templates tested
- [ ] Suppression list handling verified
- [ ] Rate limiting configured
- [ ] Monitoring and alerts set up
- [ ] Error handling tested
- [ ] Email preferences UI deployed
- [ ] Documentation reviewed by team

## Additional Resources

- [Resend Documentation](https://resend.com/docs)
- [React Email Documentation](https://react.email/docs)
- [Email Deliverability Best Practices](https://resend.com/docs/knowledge-base/deliverability-guide)
- [SPF/DKIM/DMARC Configuration](https://resend.com/docs/send-with-resend/configure-spf-dkim-dmarc)

## Support

- **Resend Support**: support@resend.com
- **Platform Issues**: Check application logs
- **Questions**: Refer to internal documentation
