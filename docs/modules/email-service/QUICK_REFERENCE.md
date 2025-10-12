# Email Service Layer - Quick Reference

## Quick Start

### Send a Transactional Email
```typescript
import { emailService } from '@/lib/services/email';

await emailService.sendTransactional({
  userId: 'user_123',
  email: 'user@example.com',
  subject: 'Welcome to YES GODDESS',
  template: 'welcome',
  variables: {
    userName: 'Creator Name',
  },
});
```

### Schedule an Email
```typescript
import { emailSchedulingService } from '@/lib/services/email';

await emailSchedulingService.scheduleEmail({
  emailType: 'reminder',
  recipientEmail: 'user@example.com',
  recipientUserId: 'user_123',
  templateId: 'license-expiry',
  subject: 'License Expiring Soon',
  personalizationData: {
    licenseName: 'Premium License',
    assetName: 'Beat Track 001',
    expiryDate: new Date('2025-11-01'),
    daysUntilExpiry: 7,
  },
  scheduledSendTime: new Date('2025-10-25T10:00:00Z'),
  optimizeSendTime: true,
});
```

### Validate Emails
```typescript
import { validateEmailsBulk } from '@/lib/services/email';

const result = await validateEmailsBulk(emailList, {
  checkMx: true,
  checkDisposable: true,
  checkTypos: true,
});

console.log(result.validEmailList);
console.log(result.invalidEmailList);
```

### Check if Email is Suppressed
```typescript
import { SuppressionListManager } from '@/lib/adapters/email';

const suppressionList = new SuppressionListManager();
const isSuppressed = await suppressionList.isSuppressed('user@example.com');
```

## Available Templates

| Template Key | Required Variables | Category |
|-------------|-------------------|----------|
| `welcome` | `userName` | system |
| `email-verification` | `userName`, `verificationUrl` | system |
| `password-reset` | `userName`, `resetUrl` | system |
| `password-changed` | `userName` | system |
| `royalty-statement` | `creatorName`, `periodStart`, `periodEnd`, `totalRoyalties`, `currency`, `statementUrl` | royaltyStatements |
| `license-expiry` | `licenseName`, `assetName`, `expiryDate`, `daysUntilExpiry` | licenseExpiry |
| `payout-confirmation` | `creatorName`, `amount`, `currency`, `payoutMethod`, `estimatedArrival`, `transactionId` | payouts |
| `project-invitation` | `inviterName`, `projectName`, `role`, `acceptUrl` | projectInvitations |
| `monthly-newsletter` | `userName`, `month`, `year`, `highlights` | newsletters |

## Common Patterns

### Send Welcome Email After Signup
```typescript
await emailService.sendTransactional({
  email: user.email,
  subject: 'Welcome to YES GODDESS',
  template: 'welcome',
  variables: { userName: user.name },
  tags: { type: 'welcome', category: 'system' },
});
```

### Send Email Verification
```typescript
const verificationToken = await generateVerificationToken(user.id);
const verificationUrl = `https://yesgoddess.com/verify?token=${verificationToken}`;

await emailService.sendTransactional({
  email: user.email,
  subject: 'Verify your YES GODDESS account',
  template: 'email-verification',
  variables: {
    userName: user.name,
    verificationUrl,
    expiresInHours: 24,
  },
});
```

### Send Password Reset
```typescript
const resetToken = await generatePasswordResetToken(user.id);
const resetUrl = `https://yesgoddess.com/reset-password?token=${resetToken}`;

await emailService.sendTransactional({
  email: user.email,
  subject: 'Reset your YES GODDESS password',
  template: 'password-reset',
  variables: {
    userName: user.name,
    resetUrl,
    expiresInHours: 1,
  },
});
```

### Send Royalty Statement
```typescript
await emailService.sendTransactional({
  userId: creator.id,
  email: creator.email,
  subject: 'Your Royalty Statement is Ready',
  template: 'royalty-statement',
  variables: {
    creatorName: creator.name,
    periodStart: new Date('2025-09-01'),
    periodEnd: new Date('2025-09-30'),
    totalRoyalties: 1250.50,
    currency: 'USD',
    statementUrl: `https://yesgoddess.com/royalties/${statementId}`,
    lineItems: [
      { assetName: 'Beat Track 001', amount: 500, units: 100 },
      { assetName: 'Vocal Sample Pack', amount: 750.50, units: 50 },
    ],
  },
});
```

### Process Unsubscribe
```typescript
import { unsubscribeService } from '@/lib/services/email';

await unsubscribeService.processUnsubscribe({
  userId: user.id,
  email: user.email,
  global: false,
  categories: ['newsletters', 'announcements'],
  source: 'preference_center',
});
```

## Error Handling

```typescript
import {
  EmailSuppressionError,
  EmailPreferenceError,
  EmailProviderError,
  EmailValidationError,
} from '@/lib/services/email';

try {
  await emailService.sendTransactional({ /* ... */ });
} catch (error) {
  if (error instanceof EmailSuppressionError) {
    // Email is on suppression list
    console.log('User has unsubscribed or bounced');
  } else if (error instanceof EmailPreferenceError) {
    // User opted out of this email type
    console.log('User preferences prevent sending');
  } else if (error instanceof EmailProviderError) {
    // Resend API error - will be retried automatically
    console.error('Provider error:', error.message);
  } else if (error instanceof EmailValidationError) {
    // Invalid email format
    console.error('Invalid email:', error.message);
  }
}
```

## Environment Variables

```bash
# Required
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_SENDER_EMAIL=noreply@yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Optional
EMAIL_FROM_NAME="YES GODDESS"
```

## Worker Initialization

In your application startup file:

```typescript
import { initializeEmailWorkers } from '@/jobs/email-workers';

// Start all email workers
initializeEmailWorkers();
```

## Monitoring

### Check Worker Health
```bash
curl https://yourdomain.com/api/admin/email/workers/health
```

### Calculate Deliverability Metrics
```typescript
import { emailDeliverabilityService } from '@/lib/services/email';

const hourlyMetrics = await emailDeliverabilityService.calculateMetrics('hour');
console.log('Delivery Rate:', (hourlyMetrics.deliveryRate * 100).toFixed(2) + '%');
console.log('Bounce Rate:', (hourlyMetrics.bounceRate * 100).toFixed(2) + '%');
```

### Monitor and Alert
```typescript
import { emailDeliverabilityService } from '@/lib/services/email';

// Run this on a schedule (e.g., every hour)
const alerts = await emailDeliverabilityService.monitorAndAlert();
```

## Type Safety

The email service provides full TypeScript type safety:

```typescript
import { renderTemplate, type TemplateVariables } from '@/lib/services/email';

// Type error - missing required field 'userName'
renderTemplate('welcome', {}); // ❌ TypeScript error

// Type safe - all required fields present
renderTemplate('welcome', { userName: 'John' }); // ✅

// Type error - invalid template key
renderTemplate('invalid-template', {}); // ❌ TypeScript error
```

## Webhook Setup

1. **Configure Resend Webhook:**
   - Go to Resend Dashboard → Webhooks
   - Add webhook URL: `https://yourdomain.com/api/webhooks/resend`
   - Copy webhook secret

2. **Set Environment Variable:**
   ```bash
   RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

3. **Test Webhook:**
   - Send test email
   - Check webhook endpoint logs
   - Verify events are stored in database

## CLI Commands

```bash
# Preview email templates
npm run email:dev

# Build email templates
npm run email:build

# Run database migrations
npm run db:migrate

# Check worker health
curl http://localhost:3000/api/admin/email/workers/health
```

## Common Gotchas

1. **Always check suppression list** - EmailService does this automatically
2. **Templates are case-sensitive** - Use exact template keys
3. **Date variables** - Pass as JavaScript Date objects
4. **Webhook secret** - Must match Resend dashboard
5. **Rate limits** - Resend has limits, use scheduling for large batches
6. **Template variables** - Missing required variables throws error at runtime

## Testing

### Development Mode
```typescript
// Use Resend test API key
RESEND_API_KEY=re_test_xxxxxxxxxxxxx

// Emails won't actually be sent
```

### Preview Templates
```bash
npm run email:dev
# Open http://localhost:3000
```

### Test Email Sending
```typescript
import { emailService } from '@/lib/services/email';

// Send test email
await emailService.sendTransactional({
  email: 'test@example.com',
  subject: 'Test Email',
  template: 'welcome',
  variables: { userName: 'Test User' },
});
```

## Files & Directories

```
src/
├── lib/
│   ├── services/
│   │   └── email/
│   │       ├── email.service.ts           # Main service
│   │       ├── template-registry.ts       # Type-safe templates
│   │       ├── scheduling.service.ts      # Email scheduling
│   │       ├── retry.service.ts           # Retry logic
│   │       ├── tracking.service.ts        # Event tracking
│   │       ├── sanitization.service.ts    # Validation
│   │       ├── bulk-validation.service.ts # Bulk validation
│   │       └── unsubscribe.service.ts     # Unsubscribe handling
│   └── adapters/
│       └── email/
│           ├── resend-adapter.ts          # Resend implementation
│           ├── suppression-list.ts        # Suppression list
│           └── types.ts                   # Interfaces
├── jobs/
│   ├── scheduled-email-worker.job.ts      # Scheduled emails
│   ├── email-retry-worker.job.ts          # Retry worker
│   └── email-workers.ts                   # Worker initialization
├── app/
│   └── api/
│       ├── webhooks/
│       │   └── resend/route.ts            # Webhook handler
│       └── admin/
│           └── email/
│               └── workers/
│                   └── health/route.ts    # Health check
└── emails/
    ├── templates/                          # React Email templates
    ├── components/                         # Reusable components
    └── styles/                             # Brand styles
```

## Support

For issues or questions:
1. Check logs for error messages
2. Verify environment variables
3. Test webhook signature verification
4. Check suppression list
5. Review Resend dashboard for API errors

---

**Quick Reference Version**: 1.0  
**Last Updated**: October 11, 2025
