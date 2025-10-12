# Email Provider Base Class - Quick Reference

## TL;DR

Created an abstract `EmailProvider` base class that handles all common email operations:
- ✅ Email validation
- ✅ Rate limiting
- ✅ Retry logic  
- ✅ Email queueing
- ✅ Logging & metrics
- ✅ Test mode

Concrete providers only need to implement 6 methods for their specific API.

## Files Created

```
src/lib/adapters/email/
├── base-provider.ts                    # Abstract base class (1100+ lines)
├── BASE_PROVIDER_GUIDE.md              # Full implementation guide
├── IMPLEMENTATION_SUMMARY.md           # What was built
├── example-provider.ts                 # Reference implementation
└── base-provider.test.example.ts       # Test examples
```

## Quick Start

### 1. Create a New Provider

```typescript
import { EmailProvider } from '@/lib/adapters/email';

interface MyConfig {
  apiKey: string;
}

class MyProvider extends EmailProvider<MyConfig> {
  // Implement 6 abstract methods
  protected async sendEmailInternal(params) { /* API call */ }
  protected async sendBulkInternal(params) { /* Bulk API call */ }
  protected async sendTemplateInternal(params) { /* Template render */ }
  protected async getDeliveryStatusInternal(id) { /* Status query */ }
  protected async verifyWebhookSignatureInternal(p, s, k) { /* Verify */ }
  protected parseWebhookEventInternal(raw) { /* Parse */ }
}
```

### 2. Configure and Use

```typescript
import { redis } from '@/lib/redis';

const provider = new MyProvider({
  providerName: 'my-provider',
  providerConfig: { apiKey: 'xxx' },
  rateLimit: { maxEmailsPerWindow: 100, windowSeconds: 3600 },
  retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2 },
  logging: { level: 'info', logContent: false },
}, redis);

// Send email - validation, rate limiting, retry all automatic!
const result = await provider.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<p>Hello!</p>',
});
```

## What the Base Class Handles

| Feature | What It Does | Configuration |
|---------|--------------|---------------|
| **Validation** | Email format, required fields, attachment sizes | Automatic |
| **Rate Limiting** | Per-user limits, campaign limits, Redis-based | `rateLimit: { maxEmailsPerWindow, windowSeconds }` |
| **Retry** | Exponential backoff, error classification | `retry: { maxAttempts, initialDelayMs, maxDelayMs }` |
| **Queueing** | BullMQ integration, priority, delayed send | `queue: { name, defaultJobOptions }` |
| **Logging** | Structured logs, privacy-safe, metrics | `logging: { level, logContent, logMetadata }` |
| **Test Mode** | Capture emails, simulate delays/failures | `testMode: { enabled, captureEmails, failureRate }` |

## Key Methods

### Public API (you call these)

```typescript
// Send single email
await provider.sendEmail(params);

// Send bulk emails
await provider.sendBulk({ recipients, template, subject });

// Send template email
await provider.sendTemplate({ to, template, variables, subject });

// Get delivery status
await provider.getDeliveryStatus(messageId);

// Verify webhook
await provider.verifyWebhookSignature(payload, signature, secret);

// Parse webhook
const event = provider.parseWebhookEvent(rawPayload);
```

### Protected Helpers (you use in implementations)

```typescript
// Validation
this.validateEmailParams(params);
this.validateEmailAddress(email);

// Rate limiting
await this.checkRateLimit(params);

// Retry
await this.sendWithRetry(params);

// Queueing
await this.queueEmail(params, { priority: 1 });

// Logging
this.log('info', 'Message', { metadata });
this.logMetrics('email.sent', { count: 1 });
this.sanitizeEmail(email); // Privacy!

// Utilities
await this.sleep(1000);
```

## Error Classification

Override `classifyError()` for provider-specific errors:

```typescript
protected classifyError(error: any): ErrorRetryability {
  if (error.statusCode === 429) return ErrorRetryability.RATE_LIMITED;
  if (error.statusCode === 400) return ErrorRetryability.NON_RETRYABLE;
  if (error.statusCode >= 500) return ErrorRetryability.RETRYABLE;
  return super.classifyError(error); // Fallback
}
```

## Test Mode

```typescript
const provider = new MyProvider({
  providerName: 'test',
  providerConfig: {},
  testMode: {
    enabled: true,
    captureEmails: true,
  },
});

await provider.sendEmail(params);

const emails = provider.getTestEmails(); // Retrieve
provider.clearTestEmails(); // Clear
```

## Configuration Defaults

```typescript
{
  rateLimit: { maxEmailsPerWindow: 50, windowSeconds: 3600, maxCampaignsPerDay: 10 },
  retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 60000, backoffMultiplier: 2 },
  logging: { level: 'info', logContent: false, logMetadata: true },
  testMode: { enabled: false, captureEmails: false, simulateDelayMs: 0, failureRate: 0 },
}
```

## Best Practices

### ✅ DO
- Extend `EmailProvider` for new providers
- Set `logContent: false` in production
- Classify errors correctly
- Use test mode for testing
- Configure rate limits

### ❌ DON'T
- Implement `IEmailProvider` directly
- Log email content/personal info
- Retry non-retryable errors
- Hardcode configuration
- Skip error classification

## Examples

See these files for complete examples:
- `example-provider.ts` - Full reference implementation
- `base-provider.test.example.ts` - Test examples
- `BASE_PROVIDER_GUIDE.md` - Detailed guide

## Integration

### Existing Infrastructure Used
- ✅ Redis (`@/lib/redis`)
- ✅ BullMQ (existing job queues)
- ✅ Error classes (`@/lib/services/email/errors`)
- ✅ Type interfaces (`types.ts`)

### No Breaking Changes
- ✅ Existing `ResendAdapter` still works
- ✅ Backward compatible
- ✅ Optional migration
- ✅ Type safe

## Migration Path

**Current ResendAdapter** (implements IEmailProvider):
```typescript
export class ResendAdapter implements IEmailProvider {
  async sendEmail(params) {
    // Manual validation, no retry, no rate limiting
  }
}
```

**Updated ResendAdapter** (extends EmailProvider):
```typescript
export class ResendAdapter extends EmailProvider<ResendConfig> {
  protected async sendEmailInternal(params) {
    // Validation, rate limiting, retry automatic!
  }
}
```

## Support

- 📖 Full Guide: `BASE_PROVIDER_GUIDE.md`
- 📋 Summary: `IMPLEMENTATION_SUMMARY.md`
- 💡 Example: `example-provider.ts`
- 🧪 Tests: `base-provider.test.example.ts`

---

**Created**: October 2025  
**Status**: ✅ Complete & Ready  
**Compatibility**: No breaking changes
