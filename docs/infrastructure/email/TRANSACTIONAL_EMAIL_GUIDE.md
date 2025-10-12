# Transactional Email System - Complete Implementation Guide

## Overview

The YES GODDESS platform features a comprehensive transactional email system built on React Email and Resend, with enterprise-grade features for reliability, tracking, and deliverability.

## Architecture

### Core Components

```
Email System Architecture
├── Email Service (email.service.ts) - Main transactional email API
├── Resend Adapter (resend-adapter.ts) - Provider integration
├── Email Templates (emails/templates/) - React Email components
├── Scheduling Service (scheduling.service.ts) - Future sends & recurring
├── Retry Service (retry.service.ts) - Failed send retry queue
├── Tracking Service (tracking.service.ts) - Opens, clicks, engagement
├── Suppression List (suppression-list.ts) - Bounce & complaint management
├── Sanitization Service (sanitization.service.ts) - Input validation & XSS prevention
└── Webhook Handler (api/webhooks/resend/) - Event processing
```

## Quick Start

### 1. Environment Configuration

Required environment variables in `.env.local`:

```bash
# Resend API Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_SENDER_EMAIL=notifications@yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
EMAIL_FROM_NAME=YES GODDESS

# Database (already configured)
DATABASE_URL=postgresql://...
DATABASE_URL_POOLED=postgresql://...

# Redis (already configured)
REDIS_URL=redis://...
```

### 2. Sending a Transactional Email

```typescript
import { emailService } from '@/lib/services/email';

// Simple transactional email
const result = await emailService.sendTransactional({
  email: 'user@example.com',
  subject: 'Welcome to YES GODDESS',
  template: 'welcome-email',
  variables: {
    userName: 'Alice',
  },
  tags: {
    type: 'onboarding',
    category: 'system',
  },
});

if (result.success) {
  console.log('Email sent:', result.messageId);
} else {
  console.error('Email failed:', result.error);
}
```

### 3. Using Specific Email Methods

```typescript
// Email verification
await emailService.sendVerificationEmail({
  email: 'user@example.com',
  name: 'Alice',
  verificationUrl: 'https://yesgoddess.com/verify?token=...',
});

// Password reset
await emailService.sendPasswordResetEmail({
  email: 'user@example.com',
  name: 'Alice',
  resetUrl: 'https://yesgoddess.com/reset?token=...',
});

// Welcome email
await emailService.sendWelcomeEmail({
  email: 'user@example.com',
  name: 'Alice',
});
```

## Features

### ✅ Email Template Compilation

All templates use React Email components and are automatically compiled to production-ready HTML with inline CSS for maximum email client compatibility.

**Available Templates:**
- `welcome-email` - User welcome
- `email-verification` - Email verification
- `password-reset` - Password reset request
- `password-changed` - Password change confirmation
- `royalty-statement` - Monthly royalty statements
- `license-expiry` - License expiration reminders
- `payout-confirmation` - Payout processed
- `brand-verification-request` - Brand verification request
- `brand-welcome` - Brand account welcome
- `brand-team-invitation` - Team member invitation
- `monthly-newsletter` - Monthly updates
- `transaction-receipt` - Purchase receipts
- `project-invitation` - Project collaboration invites

### ✅ Email Validation and Sanitization

All email inputs are automatically validated and sanitized to prevent XSS attacks and ensure data integrity.

```typescript
import { 
  sanitizeEmailAddress,
  sanitizeSubject,
  sanitizeHtmlContent,
  validateAndSanitizeEmailParams 
} from '@/lib/services/email/sanitization.service';

// Sanitize individual fields
const cleanEmail = sanitizeEmailAddress('  USER@EXAMPLE.COM  '); // 'user@example.com'
const cleanSubject = sanitizeSubject('Hello\r\nWorld'); // 'Hello World'
const cleanHtml = sanitizeHtmlContent('<script>alert("xss")</script><p>Safe</p>'); // '<p>Safe</p>'

// Sanitize entire email params
const sanitized = validateAndSanitizeEmailParams({
  to: 'user@example.com',
  subject: 'Test Subject',
  html: '<p>User content: {{userInput}}</p>',
  variables: {
    userInput: '<script>bad</script>Good text',
  },
});
```

**Sanitization Features:**
- Email address validation and normalization
- Subject line sanitization (removes control characters, prevents header injection)
- HTML content sanitization (removes scripts, dangerous tags, event handlers)
- URL validation (only allows http/https, prevents javascript: protocol)
- Filename sanitization (prevents path traversal)
- Template variable escaping (prevents XSS in user-generated content)
- Attachment size validation
- Metadata size limits

### ✅ Email Scheduling System

Schedule emails for future delivery with timezone support and send-time optimization.

```typescript
import { emailSchedulingService } from '@/lib/services/email';

// Schedule one-time email
const scheduleId = await emailSchedulingService.scheduleEmail({
  emailType: 'reminder',
  recipientEmail: 'user@example.com',
  recipientUserId: 'user_123',
  templateId: 'license-expiry',
  subject: 'Your license expires in 30 days',
  personalizationData: {
    userName: 'Alice',
    expiryDate: '2025-02-10',
  },
  scheduledSendTime: new Date('2025-01-10T09:00:00Z'),
  timezone: 'America/New_York',
  optimizeSendTime: true, // Uses recipient's past engagement patterns
});

// Schedule recurring email
await emailSchedulingService.scheduleEmail({
  emailType: 'digest',
  recipientEmail: 'user@example.com',
  templateId: 'weekly-digest',
  subject: 'Your Weekly Digest',
  scheduledSendTime: new Date('2025-01-13T10:00:00Z'),
  recurrencePattern: 'weekly', // 'daily', 'weekly', 'monthly'
});

// Cancel scheduled email
await emailSchedulingService.cancelScheduledEmail(scheduleId);
```

**Scheduling Features:**
- Future-dated sends
- Recurring emails (daily, weekly, monthly)
- Send-time optimization based on recipient engagement
- Timezone-aware scheduling
- Frequency capping (prevents spam)
- BullMQ-powered reliable queue
- Automatic retry on transient failures (3 attempts)

### ✅ Retry Queue for Failed Sends

Automatically retries failed email sends with exponential backoff.

```typescript
import { emailRetryService } from '@/lib/services/email';

// Retry mechanism is automatic - emails that fail transiently are automatically queued

// Get retry statistics
const stats = await emailRetryService.getRetryStats();
console.log('Emails in retry queue:', stats.totalInQueue);
console.log('Retry attempts:', stats.byAttemptCount);
console.log('Retry success rate:', stats.retryRate);

// View dead letter queue (permanently failed)
const dlq = await emailRetryService.getDeadLetterQueue(50);
console.log('Permanently failed emails:', dlq.length);

// Manually retry dead letter queue items
await emailRetryService.retryDeadLetterQueue(['dlq_id_1', 'dlq_id_2']);
```

**Retry Logic:**
- Automatic retry for transient errors (network, timeout, rate limits)
- Exponential backoff: 1min → 2min → 4min → 8min → 16min (max)
- Maximum 5 retry attempts
- Jitter added to prevent thundering herd
- Non-retryable errors skip to dead letter queue
- Dead letter queue for manual intervention
- Comprehensive retry metrics and monitoring

**Error Classification:**
- **Retryable**: Network errors, timeouts, rate limits, 5xx responses
- **Non-retryable**: Invalid email, authentication errors, suppression list, bounced

### ✅ Email Tracking

Comprehensive tracking of email lifecycle events via Resend webhooks.

```typescript
import { emailTrackingService } from '@/lib/services/email';

// Tracking is automatic via webhook events
// Query tracking data:

const deliveryStatus = await emailService.getDeliveryStatus('msg_12345');
console.log('Status:', deliveryStatus?.status);
console.log('Events:', deliveryStatus?.events);
```

**Tracked Events:**
- **Sent** - Email accepted by provider
- **Delivered** - Email delivered to inbox
- **Opened** - Email opened (with unique detection)
- **Clicked** - Link clicked (with URL and position tracking)
- **Bounced** - Email bounced (with bounce type and reason)
- **Complained** - Spam complaint filed

**Enriched Data:**
- Device type (desktop, mobile, tablet)
- Email client (Gmail, Outlook, Apple Mail, etc.)
- Browser (for webmail)
- Geographic location (country, region, city)
- User agent and IP address
- Timestamp for each event

### ✅ Suppression List Management

Automatically manages suppression list based on bounces and complaints to protect sender reputation.

```typescript
// Suppression checking is automatic in emailService.sendTransactional()

// Check if email is suppressed
const isSuppressed = await emailService.isEmailSuppressed('user@example.com');

// Emails are automatically added to suppression list on:
// - Hard bounces (immediate)
// - Soft bounces (after 5 attempts)
// - Spam complaints (immediate)
// - Manual unsubscribe

// View suppression reasons
const suppression = await prisma.emailSuppression.findUnique({
  where: { email: 'user@example.com' }
});
console.log('Suppressed:', suppression?.reason); // 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' | 'MANUAL'
```

**Suppression Features:**
- Automatic suppression on hard bounces and complaints
- Soft bounce threshold (5 bounces before suppression)
- Redis caching for fast lookups (24 hour TTL)
- Audit logging for compliance
- Manual suppression/unsuppression support

## Webhook Configuration

### Setup Resend Webhook

1. Go to Resend Dashboard → Webhooks
2. Create new webhook endpoint: `https://yourdomain.com/api/webhooks/resend`
3. Select events: All email events
4. Copy webhook secret to `RESEND_WEBHOOK_SECRET` environment variable

### Webhook Security

The webhook handler automatically verifies signatures:

```typescript
// Signature verification is built-in
// Uses HMAC-SHA256 with RESEND_WEBHOOK_SECRET
// Rejects requests with invalid/missing signatures
```

### Processed Events

- `email.sent` → Creates SENT event
- `email.delivered` → Creates DELIVERED event
- `email.opened` → Creates OPENED event (tracks unique opens)
- `email.clicked` → Creates CLICKED event (tracks URL and position)
- `email.bounced` → Creates BOUNCED event + adds to suppression list
- `email.complained` → Creates COMPLAINED event + adds to suppression list

## Email Preferences

Users can manage their email preferences to control what emails they receive.

```typescript
// Get user's email preferences
const prefs = await prisma.emailPreferences.findUnique({
  where: { userId: 'user_123' }
});

// Update preferences
await prisma.emailPreferences.update({
  where: { userId: 'user_123' },
  data: {
    royaltyStatements: true,
    licenseExpiry: true,
    newsletters: false, // Opted out of newsletters
    digestFrequency: 'WEEKLY',
  },
});

// Global unsubscribe
await prisma.emailPreferences.update({
  where: { userId: 'user_123' },
  data: {
    globalUnsubscribe: true,
    unsubscribedAt: new Date(),
  },
});
```

**Preference Categories:**
- `royaltyStatements` - Monthly royalty statements
- `licenseExpiry` - License expiration notices
- `projectInvitations` - Project collaboration invites
- `messages` - Direct messages
- `payouts` - Payout confirmations
- `newsletters` - Monthly newsletters
- `announcements` - Platform announcements
- `digestFrequency` - IMMEDIATE | DAILY | WEEKLY | NEVER

**System Emails Always Sent:**
- Email verification
- Password reset
- Password changed confirmation
- Critical security alerts

## Error Handling

All email operations include comprehensive error handling:

```typescript
try {
  await emailService.sendTransactional({ ... });
} catch (error) {
  if (error instanceof EmailSuppressionError) {
    // Email is on suppression list
  } else if (error instanceof EmailPreferenceError) {
    // User opted out of this email type
  } else if (error instanceof EmailProviderError) {
    // Provider API error (may be retryable)
  } else if (error instanceof EmailValidationError) {
    // Invalid email parameters
  } else if (error instanceof EmailTemplateError) {
    // Template rendering failed
  }
}
```

## Monitoring & Analytics

### Email Reputation Monitoring

```typescript
import { emailReputationService } from '@/lib/services/email';

// Get current reputation metrics
const metrics = await emailReputationService.getReputationMetrics();
console.log('Bounce rate:', metrics.bounceRate);
console.log('Complaint rate:', metrics.complaintRate);
console.log('Delivery rate:', metrics.deliveryRate);
console.log('Reputation score:', metrics.reputationScore);

// Get alerts
const alerts = await emailReputationService.getActiveAlerts();
```

### Campaign Analytics

```typescript
// View campaign performance
const campaign = await prisma.emailCampaignAnalytics.findUnique({
  where: { campaignId: 'campaign_123' }
});

console.log('Sent:', campaign?.emailsSent);
console.log('Delivered:', campaign?.emailsDelivered);
console.log('Opens:', campaign?.uniqueOpens);
console.log('Clicks:', campaign?.uniqueClicks);
console.log('Bounces:', campaign?.bounces);
```

## Best Practices

### 1. Always Use Templates

Templates ensure brand consistency and are optimized for deliverability.

```typescript
// ✅ Good - Use template
await emailService.sendTransactional({
  template: 'welcome-email',
  variables: { userName: 'Alice' }
});

// ❌ Bad - Custom HTML
await emailService.sendTransactional({
  html: '<div>Welcome!</div>'
});
```

### 2. Sanitize User Input

Always sanitize user-generated content:

```typescript
import { sanitizeTemplateVariables } from '@/lib/services/email';

const variables = sanitizeTemplateVariables({
  userName: userInput.name, // Will be HTML-escaped
  userBio: userInput.bio,   // Will be HTML-escaped
});
```

### 3. Use Tags for Organization

Tag emails for analytics and filtering:

```typescript
await emailService.sendTransactional({
  template: 'welcome-email',
  tags: {
    category: 'onboarding',
    flow: 'signup',
    experiment: 'variant_a',
  },
});
```

### 4. Handle Errors Gracefully

Don't fail critical operations due to email failures:

```typescript
try {
  await emailService.sendWelcomeEmail({ ... });
} catch (error) {
  // Log error but don't block user registration
  console.error('Welcome email failed:', error);
  // Email will be automatically retried
}
```

### 5. Respect User Preferences

The email service automatically checks preferences, but you can also check manually:

```typescript
const prefs = await prisma.emailPreferences.findUnique({
  where: { userId }
});

if (prefs.newsletters) {
  await emailService.sendTransactional({
    template: 'monthly-newsletter',
    // ...
  });
}
```

## Testing

### Preview Emails Locally

```bash
npm run email:dev
```

Opens React Email dev server at `http://localhost:3000` with live preview of all templates.

### Send Test Email

```typescript
await emailService.sendTransactional({
  email: 'test@yourdomain.com',
  subject: 'Test Email',
  template: 'welcome-email',
  variables: {
    userName: 'Test User',
  },
  tags: {
    environment: 'test',
  },
});
```

## Troubleshooting

### Email Not Sending

1. Check environment variables are set
2. Verify Resend API key is valid
3. Check if email is on suppression list
4. Review email preferences
5. Check retry queue for failed attempts

### Webhook Not Working

1. Verify `RESEND_WEBHOOK_SECRET` is correct
2. Check webhook endpoint is publicly accessible
3. Review webhook logs in Resend dashboard
4. Test signature verification

### High Bounce Rate

1. Review email list quality
2. Check for typos in email addresses
3. Remove old/inactive emails
4. Verify DNS records (SPF, DKIM, DMARC)

### Emails Going to Spam

1. Review email content (avoid spam trigger words)
2. Ensure proper authentication (SPF, DKIM)
3. Monitor reputation score
4. Check complaint rate
5. Maintain engagement (remove unengaged subscribers)

## Production Checklist

- [ ] All environment variables configured
- [ ] Resend webhook endpoint configured and verified
- [ ] DNS records configured (SPF, DKIM, DMARC)
- [ ] Sender domain verified in Resend
- [ ] Email templates tested in multiple clients
- [ ] Suppression list seeded with known bounces
- [ ] Monitoring alerts configured
- [ ] Retry queue worker running
- [ ] Scheduled email worker running
- [ ] Dead letter queue monitoring active

## API Reference

See individual service files for complete API documentation:
- `src/lib/services/email/email.service.ts` - Main email service
- `src/lib/services/email/scheduling.service.ts` - Scheduling
- `src/lib/services/email/retry.service.ts` - Retry queue
- `src/lib/services/email/tracking.service.ts` - Tracking
- `src/lib/services/email/sanitization.service.ts` - Validation
- `src/lib/adapters/email/README.md` - Adapter layer

## Support

For issues or questions:
1. Check this documentation
2. Review service logs
3. Check Resend dashboard for provider issues
4. Review retry and dead letter queues
