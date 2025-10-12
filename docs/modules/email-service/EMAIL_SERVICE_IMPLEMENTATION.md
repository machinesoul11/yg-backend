# Email Service Layer - Complete Implementation

## Overview

The YES GODDESS email service layer is a comprehensive, production-ready system for sending, tracking, and managing transactional emails. Built on Resend with React Email templates, it provides type-safe email sending with complete observability.

## ✅ Implemented Features

### 1. Email Sending Service ✅
**Files:**
- `src/lib/services/email/email.service.ts` - Main email service
- `src/lib/adapters/email/resend-adapter.ts` - Resend provider implementation
- `src/lib/adapters/email/types.ts` - Provider-agnostic interfaces

**Features:**
- Transactional email sending via Resend
- Campaign/bulk email support with batching
- Provider abstraction layer (easy to switch providers)
- Automatic suppression list checking
- User preference validation
- Comprehensive error handling and logging
- Retry queue integration for failures

**Usage:**
```typescript
import { emailService } from '@/lib/services/email';

await emailService.sendTransactional({
  userId: 'user_123',
  email: 'creator@example.com',
  subject: 'Welcome to YES GODDESS',
  template: 'welcome',
  variables: {
    userName: 'Creator Name',
    loginUrl: 'https://yesgoddess.com/login',
  },
});
```

### 2. Template Variable Injection ✅
**Files:**
- `src/lib/services/email/template-registry.ts` - Type-safe template registry
- `src/lib/services/email/templates.ts` - Legacy template exports
- `emails/templates/*` - React Email components

**Features:**
- Type-safe template variable injection with TypeScript
- Compile-time validation of required variables
- React Email component rendering
- Template category mapping for preferences
- Missing variable detection and validation
- Template existence checking

**Template Types:**
```typescript
// Each template has strongly-typed props
interface EmailVerificationProps {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number;
}

// Type-safe rendering
const element = renderTemplate('email-verification', {
  userName: 'John',
  verificationUrl: 'https://...',
});
```

### 3. Email Validation and Sanitization ✅
**Files:**
- `src/lib/services/email/sanitization.service.ts` - Core sanitization
- `src/lib/services/email/bulk-validation.service.ts` - Bulk validation
- `src/lib/validators/email.validators.ts` - Zod schemas

**Features:**
- Email format validation (RFC 5321 compliant)
- MX record checking for domain validation
- Disposable email detection
- Common typo detection and suggestions
- Bulk email validation (parallel processing)
- Subject line sanitization (header injection prevention)
- HTML content sanitization (XSS prevention)
- URL validation and protocol checking
- Email deduplication and normalization

**Usage:**
```typescript
import { validateEmailsBulk, sanitizeSubject } from '@/lib/services/email';

// Bulk validation with MX checks
const results = await validateEmailsBulk(emailList, {
  checkMx: true,
  checkDisposable: true,
  checkTypos: true,
});

// Sanitize subject line
const safe = sanitizeSubject(userInput);
```

### 4. Email Scheduling System ✅
**Files:**
- `src/lib/services/email/scheduling.service.ts` - Scheduling logic
- `src/jobs/scheduled-email-worker.job.ts` - Background worker
- `prisma/schema.prisma` - ScheduledEmail model

**Features:**
- Schedule emails for future delivery
- Recurring email patterns (cron-based)
- Send time optimization based on recipient engagement history
- Timezone-aware scheduling
- Frequency capping to prevent email fatigue
- Cancellation support
- BullMQ integration for reliable processing
- Automatic retry on temporary failures

**Database Schema:**
```prisma
model ScheduledEmail {
  id                  String               @id @default(cuid())
  emailType           String
  recipientUserId     String?
  recipientEmail      String
  templateId          String
  subject             String
  personalizationData Json?
  scheduledSendTime   DateTime
  timezone            String?
  optimizeSendTime    Boolean              @default(false)
  status              ScheduledEmailStatus @default(PENDING)
  sentAt              DateTime?
  recurrencePattern   String?
  // ... more fields
}
```

**Usage:**
```typescript
import { emailSchedulingService } from '@/lib/services/email';

const id = await emailSchedulingService.scheduleEmail({
  emailType: 'reminder',
  recipientEmail: 'creator@example.com',
  recipientUserId: 'user_123',
  templateId: 'license-expiry',
  subject: 'License Expiring Soon',
  personalizationData: { /* ... */ },
  scheduledSendTime: new Date('2025-11-01T10:00:00Z'),
  optimizeSendTime: true, // Adjust based on user's open history
});
```

### 5. Retry Queue for Failed Sends ✅
**Files:**
- `src/lib/services/email/retry.service.ts` - Retry logic
- `src/jobs/email-retry-worker.job.ts` - Background worker
- Database table: `email_retry_queue` (created via raw SQL)

**Features:**
- Intelligent retry logic with exponential backoff
- Configurable max attempts (default: 5)
- Error classification (retryable vs permanent)
- Delay progression: 1min → 15min → 1hr → 4hr → 24hr
- Dead letter queue for permanent failures
- Rate limiting awareness
- BullMQ integration
- Detailed failure tracking and logging

**Retry Strategy:**
```typescript
const config = {
  maxAttempts: 5,
  initialDelayMs: 60000,      // 1 minute
  maxDelayMs: 3600000,         // 1 hour
  backoffMultiplier: 2,
};

// Automatically determines if error is retryable
// Network errors, 5xx: retry
// Invalid email, 4xx: permanent failure, no retry
```

**Usage:**
```typescript
import { emailRetryService } from '@/lib/services/email';

// Automatically called by email service on failure
await emailRetryService.addToRetryQueue({
  recipientEmail: 'user@example.com',
  subject: 'Welcome',
  template: 'welcome',
  variables: { userName: 'John' },
  error: new Error('Network timeout'),
  attemptCount: 1,
});
```

### 6. Email Tracking Implementation ✅
**Files:**
- `src/lib/services/email/tracking.service.ts` - Event processing
- `src/app/api/webhooks/resend/route.ts` - Webhook handler
- `src/lib/utils/verify-resend-webhook.ts` - Signature verification
- `prisma/schema.prisma` - EmailEvent model

**Features:**
- Delivery status tracking (sent, delivered, bounced)
- Open tracking (unique and repeat opens)
- Click tracking with URL and position
- Device and email client detection
- Geographic data enrichment
- User agent parsing
- Webhook signature verification (HMAC-SHA256)
- Idempotent event processing
- Real-time analytics aggregation
- Campaign and A/B test integration

**Tracked Events:**
- `SENT` - Email sent to provider
- `DELIVERED` - Delivered to recipient's mail server
- `OPENED` - Email opened (pixel tracking)
- `CLICKED` - Link clicked in email
- `BOUNCED` - Delivery failed (hard or soft bounce)
- `COMPLAINED` - Marked as spam

**Webhook Setup:**
1. Configure webhook URL: `https://yourdomain.com/api/webhooks/resend`
2. Set `RESEND_WEBHOOK_SECRET` environment variable
3. Resend sends events, verified via HMAC signature
4. Events stored in database and cached in Redis

**Usage:**
```typescript
import { emailTrackingService } from '@/lib/services/email';

// Process webhook event (called automatically)
await emailTrackingService.processTrackingEvent({
  messageId: 'msg_123',
  eventType: 'OPENED',
  email: 'user@example.com',
  timestamp: new Date(),
  userAgent: 'Mozilla/5.0...',
  ipAddress: '192.168.1.1',
});
```

### 7. Suppression List Management ✅
**Files:**
- `src/lib/adapters/email/suppression-list.ts` - Core implementation
- `src/lib/services/email/unsubscribe.service.ts` - Unsubscribe handling
- `src/app/api/webhooks/resend/route.ts` - Auto-suppression on bounce/complaint
- `prisma/schema.prisma` - EmailSuppression model

**Features:**
- Automatic suppression on hard bounces
- Automatic suppression on spam complaints
- Manual unsubscribe handling
- Category-specific suppressions (marketing vs transactional)
- Global unsubscribe support
- Redis caching for fast lookups (24hr TTL)
- Bulk import/export capabilities
- Audit logging for compliance
- Soft bounce tracking (3 consecutive = suppression)
- Preference center integration

**Database Schema:**
```prisma
model EmailSuppression {
  id           String            @id @default(cuid())
  email        String            @unique
  reason       SuppressionReason // BOUNCE, COMPLAINT, UNSUBSCRIBE
  suppressedAt DateTime          @default(now())
  bounceType   String?           // 'hard' or 'soft'
  bounceReason String?
}
```

**Usage:**
```typescript
import { SuppressionListManager } from '@/lib/adapters/email';

const suppressionList = new SuppressionListManager();

// Add to suppression list
await suppressionList.add({
  email: 'bounced@example.com',
  reason: 'BOUNCE',
  bounceType: 'hard',
  bounceReason: 'Recipient address rejected',
});

// Check if suppressed (checks cache first)
const isSuppressed = await suppressionList.isSuppressed('user@example.com');

// Remove from suppression list
await suppressionList.remove('user@example.com');
```

**Automatic Suppression:**
- Hard bounces → immediate suppression
- Spam complaints → immediate suppression
- 3 consecutive soft bounces → suppression
- User unsubscribe → suppression (category-specific or global)

## Architecture

### Service Layer
```
┌─────────────────────────────────────────────────────┐
│              Email Service Layer                     │
├─────────────────────────────────────────────────────┤
│  EmailService (main facade)                         │
│  ├── ResendAdapter (provider implementation)        │
│  ├── TemplateRegistry (type-safe templates)         │
│  ├── SanitizationService (validation & cleaning)    │
│  ├── SuppressionListManager (bounce/unsubscribe)    │
│  └── BulkValidationService (batch validation)       │
└─────────────────────────────────────────────────────┘
```

### Background Workers
```
┌─────────────────────────────────────────────────────┐
│              BullMQ Workers                          │
├─────────────────────────────────────────────────────┤
│  ScheduledEmailWorker                               │
│  ├── Processes scheduled emails                     │
│  └── Handles recurring patterns                     │
│                                                      │
│  EmailRetryWorker                                   │
│  ├── Retries failed sends                           │
│  └── Exponential backoff                            │
│                                                      │
│  CampaignWorker                                     │
│  ├── Bulk campaign sends                            │
│  └── Rate limiting & batching                       │
│                                                      │
│  DeliverabilityMonitoringWorker                     │
│  ├── Tracks metrics                                 │
│  └── Sends alerts                                   │
└─────────────────────────────────────────────────────┘
```

### Data Flow
```
1. Application Code
   ↓
2. EmailService.sendTransactional()
   ├── Check suppression list (Redis cache)
   ├── Check user preferences
   ├── Render template (React Email)
   ├── Send via ResendAdapter
   └── Log to database
   ↓
3. Resend API
   ├── Sends email
   └── Sends webhook events
   ↓
4. Webhook Handler
   ├── Verify signature
   ├── Process event (tracking)
   ├── Update suppression list (if bounce/complaint)
   └── Update analytics
```

## Configuration

### Environment Variables
```bash
# Resend Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_SENDER_EMAIL=noreply@yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
EMAIL_FROM_NAME="YES GODDESS"

# Redis (for caching and queues)
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://...
```

### Queue Configuration
```typescript
// src/lib/services/email/scheduling.service.ts
export const scheduledEmailQueue = new Queue('scheduled-emails', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: 1000,
    removeOnFail: 2000,
  },
});
```

## Email Templates

All templates are in `emails/templates/` and follow YES GODDESS brand guidelines:

### Available Templates
1. `welcome` / `welcome-email` - Welcome new users
2. `email-verification` - Email address verification
3. `password-reset` - Password reset link
4. `password-changed` - Password change confirmation
5. `royalty-statement` - Royalty statement available
6. `license-expiry` - License expiring soon
7. `payout-confirmation` - Payout processed
8. `brand-verification-request` - Brand verification submitted
9. `brand-welcome` - Welcome new brand
10. `brand-verification-complete` - Brand verified
11. `brand-verification-rejected` - Brand rejected
12. `brand-team-invitation` - Invite to brand team
13. `role-changed` - User role updated
14. `monthly-newsletter` - Monthly newsletter
15. `transaction-receipt` - Transaction receipt
16. `project-invitation` - Project collaboration invite
17. `creator-welcome` - Welcome new creator
18. `creator-verification-approved` - Creator approved
19. `creator-verification-rejected` - Creator rejected

### Template Development
```bash
# Preview templates in browser
npm run email:dev

# Build static HTML
npm run email:build
```

## Monitoring & Observability

### Health Check Endpoint
```
GET /api/admin/email/workers/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T10:00:00Z",
  "workers": {
    "scheduled-emails": { "running": true, "isPaused": false },
    "email-retry": { "running": true, "isPaused": false },
    "email-campaigns": { "running": true, "isPaused": false }
  },
  "queues": {
    "scheduledEmails": {
      "waiting": 10,
      "active": 2,
      "completed": 1000,
      "failed": 5,
      "delayed": 20
    }
  }
}
```

### Deliverability Monitoring
```typescript
import { emailDeliverabilityService } from '@/lib/services/email';

// Calculate metrics
const metrics = await emailDeliverabilityService.calculateMetrics('hour');
console.log(metrics.deliveryRate); // 0.98 (98%)
console.log(metrics.bounceRate);   // 0.02 (2%)

// Monitor and send alerts
const alerts = await emailDeliverabilityService.monitorAndAlert();
```

### Logging
All email operations are logged with structured logging:
```typescript
console.log('[EmailService] Sending transactional email', {
  template: 'welcome',
  recipient: 'user@example.com',
  messageId: 'msg_123',
});
```

## Error Handling

### Custom Error Classes
```typescript
import {
  EmailSuppressionError,    // Email is suppressed
  EmailPreferenceError,     // User opted out
  EmailProviderError,       // Resend API failure
  EmailValidationError,     // Invalid email format
  EmailTemplateError,       // Template rendering failed
  EmailRateLimitError,      // Rate limit exceeded
} from '@/lib/services/email';
```

### Retry Logic
- Transient errors (network, 5xx) → Retry with backoff
- Permanent errors (4xx, invalid email) → No retry, log failure
- Rate limiting (429) → Retry with longer delay
- Authentication errors → Alert admins, no retry

## Testing

### Unit Tests
```typescript
import { emailService } from '@/lib/services/email';

// Mock Resend
jest.mock('@/lib/adapters/email/resend-adapter');

test('sends email successfully', async () => {
  const result = await emailService.sendTransactional({
    email: 'test@example.com',
    subject: 'Test',
    template: 'welcome',
    variables: { userName: 'Test' },
  });
  
  expect(result.success).toBe(true);
});
```

### Integration Tests
Located in `src/__tests__/email-events-processing.test.ts`

### Testing in Development
Use Resend's test mode:
```typescript
RESEND_API_KEY=re_test_xxxxx  // Test API key
```

## Best Practices

1. **Always check suppression list** - Done automatically by EmailService
2. **Respect user preferences** - Checked before sending
3. **Use type-safe templates** - Compile-time validation prevents errors
4. **Sanitize user input** - All user content is sanitized
5. **Handle failures gracefully** - Retry transient errors automatically
6. **Monitor deliverability** - Track bounce and complaint rates
7. **Follow brand guidelines** - Use provided templates and components
8. **Log everything** - Comprehensive logging for debugging
9. **Test webhooks locally** - Use ngrok or Resend's webhook testing
10. **Keep templates simple** - Avoid complex layouts that may not render

## Common Use Cases

### Send Welcome Email
```typescript
await emailService.sendTransactional({
  email: user.email,
  subject: 'Welcome to YES GODDESS',
  template: 'welcome',
  variables: {
    userName: user.name,
    loginUrl: 'https://yesgoddess.com/login',
  },
});
```

### Schedule License Expiry Reminder
```typescript
await emailSchedulingService.scheduleEmail({
  emailType: 'reminder',
  recipientEmail: license.creator.email,
  recipientUserId: license.creatorId,
  templateId: 'license-expiry',
  subject: 'Your License Expires Soon',
  personalizationData: {
    licenseName: license.name,
    assetName: license.asset.name,
    expiryDate: license.expiresAt,
    daysUntilExpiry: calculateDays(license.expiresAt),
  },
  scheduledSendTime: sevenDaysBeforeExpiry,
  optimizeSendTime: true,
});
```

### Send Bulk Campaign
```typescript
await emailService.sendCampaign({
  recipients: creators.map(c => ({
    userId: c.id,
    email: c.email,
    variables: { creatorName: c.name },
  })),
  subject: 'Monthly Creator Newsletter',
  template: 'monthly-newsletter',
  tags: { campaign: 'newsletter', month: 'october' },
});
```

### Handle Unsubscribe
```typescript
import { unsubscribeService } from '@/lib/services/email';

await unsubscribeService.processUnsubscribe({
  userId: user.id,
  email: user.email,
  global: false,
  categories: ['newsletters'], // Only unsubscribe from newsletters
  source: 'preference_center',
});
```

## Migration Notes

If migrating from another email provider:
1. Import suppression list using `SuppressionListManager.add()` in bulk
2. Update all email sending code to use `emailService.sendTransactional()`
3. Configure webhook endpoint at new provider
4. Test with small batch before full migration
5. Monitor deliverability closely during transition

## Support & Troubleshooting

### Common Issues

**Emails not sending:**
- Check `RESEND_API_KEY` is set correctly
- Verify sender email is verified in Resend
- Check suppression list for recipient
- Check user email preferences

**High bounce rate:**
- Review email list quality
- Check domain reputation
- Verify DNS records (SPF, DKIM, DMARC)

**Webhooks not working:**
- Verify `RESEND_WEBHOOK_SECRET` matches Resend dashboard
- Check webhook URL is publicly accessible
- Review webhook signature verification logs

**Workers not processing:**
- Check Redis connection
- Verify workers are started: `initializeEmailWorkers()`
- Check worker health: `GET /api/admin/email/workers/health`

## Future Enhancements

Potential improvements (not currently needed):
- [ ] Additional email providers (SendGrid, Postmark)
- [ ] Advanced A/B testing with statistical significance
- [ ] Email warmup automation for new domains
- [ ] AI-powered send time optimization
- [ ] Email content A/B testing
- [ ] Advanced segmentation for campaigns
- [ ] Email preview across clients
- [ ] Spam score checking before send

## Compliance

- **CAN-SPAM Act**: Unsubscribe links in all marketing emails
- **GDPR**: User consent tracking, data retention policies
- **Double Opt-in**: Optional for high-value lists
- **Suppression List**: Maintained automatically
- **Audit Trail**: All unsubscribe actions logged

---

**Implementation Status**: ✅ Complete  
**Last Updated**: October 11, 2025  
**Maintainer**: YES GODDESS Backend Team
