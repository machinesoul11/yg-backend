# Email Adapter Layer Documentation

## Overview

The Email Adapter Layer provides a provider-agnostic interface for all email operations in the YES GODDESS platform. This architecture allows the application to switch between email service providers (Resend, Postmark, Azure Communication Services) without modifying dependent code.

## Architecture

### Core Components

```
src/lib/adapters/email/
├── types.ts                  # Interface definitions and type contracts
├── resend-adapter.ts         # Resend provider implementation
├── bounce-handler.ts         # Bounce management and suppression
├── complaint-handler.ts      # Spam complaint handling
├── suppression-list.ts       # Centralized suppression list management
└── index.ts                  # Public API and singleton instances
```

### Design Principles

1. **Provider Agnostic**: All email operations use the `IEmailProvider` interface
2. **Type Safety**: Comprehensive TypeScript interfaces with full type coverage
3. **Error Handling**: Custom error classes for different failure scenarios
4. **Webhook Support**: Signature verification and event normalization
5. **Performance**: Redis caching for suppression checks and delivery status
6. **Reliability**: Automatic retry logic with exponential backoff
7. **Monitoring**: Comprehensive logging and metrics tracking

## Core Interfaces

### IEmailProvider

The main interface that all email provider adapters must implement.

```typescript
interface IEmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult>;
  sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus | null>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean>;
  parseWebhookEvent(rawPayload: any): WebhookEvent;
}
```

### SendEmailParams

Parameters for sending a single email:

```typescript
interface SendEmailParams {
  to: string | string[];        // Recipients
  cc?: string | string[];       // Carbon copy
  bcc?: string | string[];      // Blind carbon copy
  from?: string;                // Sender (defaults to configured address)
  replyTo?: string | string[];  // Reply-to address
  subject: string;              // Email subject
  react?: React.ReactElement;   // React Email component (preferred)
  html?: string;                // HTML content (alternative)
  text?: string;                // Plain text fallback
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  scheduledAt?: Date;           // Schedule for future delivery
  priority?: 'high' | 'normal' | 'low';
}
```

### SendBulkEmailParams

Parameters for bulk email campaigns:

```typescript
interface SendBulkEmailParams {
  recipients: Array<{
    email: string;
    name?: string;
    variables?: Record<string, any>;  // Personalization variables
    metadata?: Record<string, any>;
  }>;
  template: string;               // Template identifier
  subject: string;                // Subject line (supports {{variable}} interpolation)
  from?: string;
  tags?: Record<string, string>;
  defaultVariables?: Record<string, any>;
  batchSize?: number;             // Max emails per batch (default: 100)
  batchDelay?: number;            // Delay between batches in ms
  onProgress?: (progress: BulkSendProgress) => void;  // Progress callback
}
```

## Implementation Guide

### Sending a Single Email

```typescript
import { emailAdapter } from '@/lib/adapters/email';
import WelcomeEmail from '@/emails/templates/WelcomeEmail';

const result = await emailAdapter.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome to YES GODDESS',
  react: <WelcomeEmail userName="Alice" />,
  tags: {
    category: 'onboarding',
    type: 'welcome',
  },
});

console.log(`Email sent with ID: ${result.messageId}`);
```

### Sending Bulk Emails

```typescript
import { emailAdapter } from '@/lib/adapters/email';

const result = await emailAdapter.sendBulk({
  recipients: [
    { email: 'user1@example.com', variables: { name: 'Alice' } },
    { email: 'user2@example.com', variables: { name: 'Bob' } },
    // ... up to thousands of recipients
  ],
  template: 'monthly-newsletter',
  subject: 'Your Monthly Update - {{month}}',
  defaultVariables: { month: 'January' },
  batchSize: 100,
  onProgress: (progress) => {
    console.log(`Sent ${progress.sent}/${progress.total} (${progress.percentComplete}%)`);
  },
});

console.log(`Bulk send complete: ${result.queued} sent, ${result.failed} failed`);
```

### Using Template Method

```typescript
import { emailAdapter } from '@/lib/adapters/email';

const result = await emailAdapter.sendTemplate({
  to: 'creator@example.com',
  template: 'royalty-statement',
  variables: {
    creatorName: 'Artist Name',
    period: 'January 2025',
    totalEarnings: 1234.56,
    breakdown: [...],
  },
  subject: 'Your Royalty Statement for January 2025',
  tags: { type: 'financial', category: 'royalties' },
});
```

## Bounce and Complaint Handling

### Bounce Handler

Manages email bounces and automatic suppression list updates:

```typescript
import { bounceHandler } from '@/lib/adapters/email';

// Handle a bounce event (typically called from webhook)
await bounceHandler.handleBounce({
  email: 'invalid@example.com',
  type: 'hard',
  reason: 'Mailbox does not exist',
  diagnosticCode: '550 5.1.1',
  timestamp: new Date(),
  suppressionRecommended: true,
});

// Check bounce statistics
const stats = await bounceHandler.getBounceStats('user@example.com');
console.log(`Total bounces: ${stats?.totalBounces}, Hard: ${stats?.hardBounces}`);

// Check if email should be suppressed
const shouldSuppress = await bounceHandler.shouldSuppress('user@example.com');
```

**Bounce Types:**
- **Hard Bounce**: Permanent failure (invalid address, domain doesn't exist) → immediate suppression
- **Soft Bounce**: Temporary failure (mailbox full, server down) → suppress after 5 bounces
- **Technical Bounce**: Content/size issues → log for monitoring, don't suppress

### Complaint Handler

Manages spam complaints and sender reputation:

```typescript
import { complaintHandler } from '@/lib/adapters/email';

// Handle a complaint event (typically called from webhook)
await complaintHandler.handleComplaint({
  email: 'complainer@example.com',
  type: 'abuse',
  timestamp: new Date(),
  suppressionRecommended: true,
});

// Get complaint rate
const rate = await complaintHandler.getComplaintRate({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
});

console.log(`Complaint rate: ${rate.toFixed(4)}%`);
// Industry standard: Keep below 0.1%
// Alert threshold: 0.05%
```

### Suppression List Manager

Centralized management of email suppression:

```typescript
import { suppressionList } from '@/lib/adapters/email';

// Add to suppression list
await suppressionList.add({
  email: 'suppress@example.com',
  reason: 'MANUAL',
});

// Check if suppressed
const isSuppressed = await suppressionList.isSuppressed('user@example.com');

// Get suppression info
const info = await suppressionList.getSuppressionInfo('user@example.com');

// Bulk check
const emails = ['user1@example.com', 'user2@example.com'];
const results = await suppressionList.checkBulk(emails);

// List all suppressions
const list = await suppressionList.list({
  reason: 'BOUNCE',
  limit: 100,
});

// Export for backup
const exportedList = await suppressionList.export({ reason: 'COMPLAINT' });
```

**Suppression Reasons:**
- `BOUNCE`: Hard bounce
- `COMPLAINT`: Spam complaint
- `UNSUBSCRIBE`: User unsubscribed
- `MANUAL`: Manually blocked by admin

## Webhook Integration

### Webhook Signature Verification

```typescript
import { emailAdapter } from '@/lib/adapters/email';

const isValid = await emailAdapter.verifyWebhookSignature(
  rawPayload,
  signatureHeader,
  process.env.RESEND_WEBHOOK_SECRET!
);

if (!isValid) {
  throw new Error('Invalid webhook signature');
}
```

### Webhook Event Processing

```typescript
import { emailAdapter, bounceHandler, complaintHandler } from '@/lib/adapters/email';

// Parse webhook event
const event = emailAdapter.parseWebhookEvent(rawPayload);

// Handle based on event type
switch (event.type) {
  case 'email.bounced':
    await bounceHandler.handleBounce({
      email: event.email,
      ...(event.data as BounceInfo),
    });
    break;

  case 'email.complained':
    await complaintHandler.handleComplaint({
      email: event.email,
      ...(event.data as ComplaintInfo),
    });
    break;

  case 'email.delivered':
  case 'email.opened':
  case 'email.clicked':
    // Update delivery status in database
    break;
}
```

## Error Handling

### Custom Error Classes

All email operations use typed error classes for consistent error handling:

```typescript
import {
  EmailProviderError,
  EmailValidationError,
  EmailTemplateError,
  EmailWebhookError,
  EmailSuppressionError,
  EmailRateLimitError,
} from '@/lib/services/email/errors';

try {
  await emailAdapter.sendEmail(params);
} catch (error) {
  if (error instanceof EmailProviderError) {
    // Provider API failed
    console.error('Provider error:', error.provider, error.code);
    
    if (error.retryable) {
      // Retry the operation
    }
  } else if (error instanceof EmailValidationError) {
    // Invalid parameters
    console.error('Validation error:', error.field, error.value);
  } else if (error instanceof EmailTemplateError) {
    // Template rendering failed
    console.error('Template error:', error.templateName, error.missingVariables);
  }
}
```

### Error Codes

- `EMAIL_SUPPRESSED`: Email is on suppression list
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
- `PROVIDER_ERROR`: Email provider API error
- `PREFERENCE_BLOCKED`: User preferences prevent sending
- `VALIDATION_ERROR`: Invalid parameters
- `TEMPLATE_ERROR`: Template rendering failed
- `WEBHOOK_ERROR`: Webhook processing failed
- `INVALID_SIGNATURE`: Invalid webhook signature
- `DUPLICATE_EVENT`: Duplicate webhook event

## Retry Logic

The adapter implements intelligent retry logic for transient failures:

```typescript
// Retryable errors
- Rate limiting (RATE_LIMIT)
- Timeouts (TIMEOUT)
- Network errors (NETWORK_ERROR)
- Service unavailable (SERVICE_UNAVAILABLE)

// Non-retryable errors
- Invalid credentials
- Validation errors
- Suppression list blocks
```

## Performance Optimization

### Caching Strategy

1. **Suppression List**: 24-hour Redis cache
2. **Email Preferences**: 1-hour Redis cache
3. **Bounce Stats**: 30-day Redis cache
4. **Delivery Status**: Database-backed with selective refresh

### Batch Processing

- Bulk emails automatically chunked into batches (default: 100 per batch)
- Configurable delay between batches to respect rate limits
- Progress callbacks for long-running operations

## Monitoring and Metrics

### Key Metrics to Track

1. **Delivery Rate**: % of emails successfully delivered
2. **Bounce Rate**: % of emails that bounced (keep < 5%)
3. **Complaint Rate**: % marked as spam (keep < 0.1%)
4. **Open Rate**: % of emails opened
5. **Click Rate**: % of emails clicked

### Health Checks

```typescript
import { complaintHandler, bounceHandler } from '@/lib/adapters/email';

// Check complaint rate health
const complaintHealth = await complaintHandler.isComplaintRateHealthy();
if (!complaintHealth.healthy) {
  console.error('High complaint rate:', complaintHealth.currentRate);
}

// Get bounce rate
const bounceRate = await bounceHandler.getBounceRate({
  startDate: new Date(Date.now() - 86400000 * 7),
  endDate: new Date(),
});
```

## Adding a New Provider

To add support for a new email provider (e.g., Postmark, Azure):

1. **Create Adapter Class**:
   ```typescript
   // src/lib/adapters/email/postmark-adapter.ts
   export class PostmarkAdapter implements IEmailProvider {
     // Implement all interface methods
   }
   ```

2. **Implement Required Methods**:
   - `sendEmail()`
   - `sendBulk()`
   - `sendTemplate()`
   - `getDeliveryStatus()`
   - `verifyWebhookSignature()`
   - `parseWebhookEvent()`

3. **Export from Index**:
   ```typescript
   export { PostmarkAdapter } from './postmark-adapter';
   ```

4. **Update Configuration**:
   ```typescript
   // Allow provider selection via environment variable
   const provider = process.env.EMAIL_PROVIDER || 'resend';
   ```

## Testing

### Unit Tests

```typescript
import { ResendAdapter } from '@/lib/adapters/email';

describe('ResendAdapter', () => {
  it('should send email successfully', async () => {
    const adapter = new ResendAdapter({ /* config */ });
    const result = await adapter.sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    
    expect(result.status).toBe('sent');
    expect(result.messageId).toBeDefined();
  });
});
```

### Integration Tests

Test webhook handling, suppression list integration, and end-to-end flows.

## Security Considerations

1. **Webhook Signature Verification**: Always verify webhook signatures
2. **Rate Limiting**: Implement rate limits to prevent abuse
3. **Suppression List**: Always check before sending
4. **Email Validation**: Validate email addresses before sending
5. **Sensitive Data**: Never log email content or recipient addresses
6. **API Keys**: Store securely in environment variables

## Best Practices

1. **Always use React Email components** for type-safe, testable templates
2. **Check suppression list** before every send operation
3. **Tag all emails** for categorization and analytics
4. **Monitor complaint rates** and alert when thresholds exceeded
5. **Implement retry logic** for transient failures
6. **Use bulk send** for campaigns to respect rate limits
7. **Cache aggressively** to minimize database queries
8. **Handle bounces immediately** to maintain sender reputation
9. **Test in preview mode** before sending to production
10. **Log all email events** for debugging and compliance

## Troubleshooting

### Common Issues

**Problem**: Emails going to spam
- Check complaint rate
- Verify DKIM/SPF/DMARC records
- Review email content for spam triggers
- Check sender reputation

**Problem**: High bounce rate
- Clean suppression list regularly
- Verify email addresses before sending
- Check bounce reasons for patterns

**Problem**: Webhook not working
- Verify webhook secret configuration
- Check signature verification logic
- Ensure endpoint is publicly accessible
- Review webhook logs for errors

## References

- [Resend Documentation](https://resend.com/docs)
- [React Email Documentation](https://react.email)
- [Email Best Practices](https://www.emailbestpractices.com)
- [CAN-SPAM Compliance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
