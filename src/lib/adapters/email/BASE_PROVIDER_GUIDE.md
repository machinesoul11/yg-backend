# Email Provider Base Class - Implementation Guide

## Overview

The `EmailProvider` abstract base class provides common functionality for all email provider implementations. It handles validation, rate limiting, retry logic, queueing, logging, and test mode, allowing concrete providers to focus on provider-specific API integration.

## Architecture

```
EmailProvider (Abstract Base Class)
├── Common Functionality
│   ├── Email validation
│   ├── Rate limiting (Redis-based)
│   ├── Retry logic with exponential backoff
│   ├── Email queueing (BullMQ)
│   ├── Structured logging and metrics
│   └── Test mode utilities
│
└── Abstract Methods (Provider-Specific)
    ├── sendEmailInternal()
    ├── sendBulkInternal()
    ├── sendTemplateInternal()
    ├── getDeliveryStatusInternal()
    ├── verifyWebhookSignatureInternal()
    └── parseWebhookEventInternal()
```

## Creating a New Email Provider

### Step 1: Define Provider Configuration

```typescript
// Provider-specific configuration interface
interface AzureEmailConfig {
  connectionString: string;
  senderAddress: string;
  senderName?: string;
}
```

### Step 2: Extend EmailProvider Base Class

```typescript
import { EmailProvider, EmailProviderConfig, ErrorRetryability } from './base-provider';
import type { SendEmailParams, SendEmailResult } from './types';

export class AzureEmailAdapter extends EmailProvider<AzureEmailConfig> {
  private client: EmailClient;

  constructor(
    config: EmailProviderConfig<AzureEmailConfig>,
    redis?: Redis,
    queue?: Queue
  ) {
    // Call base class constructor
    super(config, redis, queue);
    
    // Initialize Azure Email Client
    this.client = new EmailClient(config.providerConfig.connectionString);
  }

  // Implement abstract methods...
}
```

### Step 3: Implement Abstract Methods

```typescript
protected async sendEmailInternal(params: SendEmailParams): Promise<SendEmailResult> {
  // Convert params to provider-specific format
  const message = {
    senderAddress: this.config.providerConfig.senderAddress,
    recipients: {
      to: Array.isArray(params.to) ? params.to.map(e => ({ address: e })) : [{ address: params.to }],
    },
    content: {
      subject: params.subject,
      html: params.html,
      plainText: params.text,
    },
  };

  // Call provider API
  const response = await this.client.beginSend(message);
  
  // Return standardized result
  return {
    messageId: response.id,
    status: 'sent',
    timestamp: new Date(),
    providerMetadata: {
      operationId: response.operationId,
    },
  };
}

protected async sendBulkInternal(params: SendBulkEmailParams): Promise<SendBulkResult> {
  // Implement bulk sending logic
  // Base class handles batching and rate limiting
  const startTime = Date.now();
  const messageIds: string[] = [];
  const errors: any[] = [];

  for (const recipient of params.recipients) {
    try {
      const result = await this.sendEmailInternal({
        to: recipient.email,
        subject: params.subject,
        html: renderTemplate(params.template, {
          ...params.defaultVariables,
          ...recipient.variables,
        }),
      });
      
      messageIds.push(result.messageId);
    } catch (error) {
      errors.push({
        email: recipient.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryable: this.classifyError(error) === ErrorRetryability.RETRYABLE,
      });
    }
  }

  return {
    total: params.recipients.length,
    queued: messageIds.length,
    failed: errors.length,
    durationMs: Date.now() - startTime,
    messageIds,
    errors: errors.length > 0 ? errors : undefined,
  };
}
```

### Step 4: Implement Error Classification

```typescript
protected classifyError(error: any): ErrorRetryability {
  // Azure-specific error classification
  if (error.code === 'ThrottlingError' || error.statusCode === 429) {
    return ErrorRetryability.RATE_LIMITED;
  }
  
  if (error.code === 'InvalidRecipient' || error.statusCode === 400) {
    return ErrorRetryability.NON_RETRYABLE;
  }
  
  if (error.code === 'ServiceUnavailable' || error.statusCode === 503) {
    return ErrorRetryability.RETRYABLE;
  }
  
  // Fall back to base class classification
  return super.classifyError(error);
}
```

## Base Class Features

### 1. Email Validation

The base class automatically validates:
- Email address format (RFC 5322 compliant)
- Required fields (to, subject, content)
- Attachment sizes and total size
- Content length limits

```typescript
// Validation happens automatically before sending
await provider.sendEmail({
  to: 'invalid-email',  // ❌ Throws EmailValidationError
  subject: '',          // ❌ Throws EmailValidationError
  // No content        // ❌ Throws EmailValidationError
});

// Valid email
await provider.sendEmail({
  to: 'user@example.com',  // ✅
  subject: 'Hello',        // ✅
  text: 'World',           // ✅
});
```

### 2. Rate Limiting

Configure rate limits to prevent abuse:

```typescript
const provider = new MyEmailProvider({
  providerName: 'my-provider',
  providerConfig: { /* ... */ },
  rateLimit: {
    maxEmailsPerWindow: 100,   // Max 100 emails
    windowSeconds: 3600,       // Per hour
    maxCampaignsPerDay: 5,     // Max 5 bulk campaigns per day
  },
}, redis);

// Rate limiting is automatically enforced
try {
  await provider.sendEmail(params);
} catch (error) {
  if (error instanceof EmailRateLimitError) {
    console.log(`Rate limited until: ${error.resetAt}`);
  }
}
```

### 3. Automatic Retry

Failed sends are retried automatically:

```typescript
const provider = new MyEmailProvider({
  providerName: 'my-provider',
  providerConfig: { /* ... */ },
  retry: {
    maxAttempts: 3,           // Try up to 3 times
    initialDelayMs: 1000,     // Start with 1 second delay
    maxDelayMs: 30000,        // Max 30 second delay
    backoffMultiplier: 2,     // Double delay each retry
  },
});

// If first attempt fails with retryable error:
// - Retry after 1 second (1000ms)
// - Retry after 2 seconds (2000ms)
// - Retry after 4 seconds (4000ms)
// - If still failing, throw error
```

### 4. Email Queueing

Queue emails for background processing:

```typescript
const provider = new MyEmailProvider(
  {
    providerName: 'my-provider',
    providerConfig: { /* ... */ },
    queue: {
      name: 'email-queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000,
        },
      },
    },
  },
  redis,
  queue  // BullMQ queue instance
);

// Queue an email
const jobId = await provider.queueEmail(emailParams, {
  priority: 1,      // Higher priority emails processed first
  delay: 60000,     // Delay 1 minute before sending
});
```

### 5. Logging and Metrics

Structured logging with privacy controls:

```typescript
const provider = new MyEmailProvider({
  providerName: 'my-provider',
  providerConfig: { /* ... */ },
  logging: {
    level: 'info',          // Minimum log level
    logContent: false,      // Don't log email bodies (privacy)
    logMetadata: true,      // Log tags and metadata
  },
});

// Logs are automatically created:
// - Email send attempts
// - Validation errors
// - Rate limit hits
// - Retry attempts
// - Success/failure metrics
```

Metrics are stored in Redis for aggregation:
```typescript
// Daily metrics automatically tracked:
email:metrics:{provider}:email.sent:{date}
email:metrics:{provider}:email.failed:{date}
email:metrics:{provider}:email.bulk_sent:{date}
```

### 6. Test Mode

Test without sending real emails:

```typescript
const provider = new MyEmailProvider({
  providerName: 'my-provider',
  providerConfig: { /* ... */ },
  testMode: {
    enabled: true,           // Enable test mode
    captureEmails: true,     // Capture emails in memory
    simulateDelayMs: 100,    // Simulate 100ms send delay
    failureRate: 0.1,        // Simulate 10% failure rate
  },
});

// Send email in test mode
await provider.sendEmail(params);

// Retrieve captured emails
const testEmails = provider.getTestEmails();
console.log(testEmails); // Array of { params, result }

// Clear captured emails
provider.clearTestEmails();
```

## Configuration Reference

### EmailProviderConfig

```typescript
interface EmailProviderConfig<TProviderConfig> {
  // Required: Provider-specific configuration
  providerConfig: TProviderConfig;
  
  // Required: Provider name for logging
  providerName: string;
  
  // Optional: Rate limiting
  rateLimit?: {
    maxEmailsPerWindow: number;    // Default: 50
    windowSeconds: number;          // Default: 3600 (1 hour)
    maxCampaignsPerDay?: number;   // Default: 10
  };
  
  // Optional: Retry configuration
  retry?: {
    maxAttempts: number;           // Default: 3
    initialDelayMs: number;        // Default: 1000
    maxDelayMs: number;            // Default: 60000
    backoffMultiplier: number;     // Default: 2
  };
  
  // Optional: Queue configuration
  queue?: {
    name: string;
    defaultJobOptions?: {
      attempts?: number;
      backoff?: {
        type: 'exponential' | 'fixed';
        delay: number;
      };
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    };
  };
  
  // Optional: Logging configuration
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';  // Default: 'info'
    logContent?: boolean;                         // Default: false
    logMetadata?: boolean;                        // Default: true
  };
  
  // Optional: Test mode configuration
  testMode?: {
    enabled: boolean;              // Default: false
    captureEmails?: boolean;       // Default: false
    simulateDelayMs?: number;      // Default: 0
    failureRate?: number;          // Default: 0 (0-1 probability)
  };
}
```

## Error Handling

### Error Classification

Implement `classifyError()` to handle provider-specific errors:

```typescript
protected classifyError(error: any): ErrorRetryability {
  // Provider-specific classification
  if (error.statusCode === 429 || error.code === 'RATE_LIMITED') {
    return ErrorRetryability.RATE_LIMITED;
  }
  
  if (error.statusCode === 400 || error.code === 'INVALID_INPUT') {
    return ErrorRetryability.NON_RETRYABLE;
  }
  
  if (error.statusCode >= 500 || error.code === 'SERVICE_UNAVAILABLE') {
    return ErrorRetryability.RETRYABLE;
  }
  
  // Fall back to base class
  return super.classifyError(error);
}
```

### Error Types

The base class uses these error types:

```typescript
// Validation errors (non-retryable)
throw new EmailValidationError('Invalid email format', 'email', email);

// Rate limit errors (retryable after delay)
throw new EmailRateLimitError(userId, resetAt, limit);

// Provider errors (classified by classifyError)
throw new EmailProviderError(providerName, details, code, retryable);

// Configuration errors (non-retryable)
throw new EmailConfigurationError('apiKey', 'API key is required');
```

## Protected Helper Methods

The base class provides protected methods for use in implementations:

### Validation

```typescript
// Validate email address
protected validateEmailAddress(email: string): void;

// Validate email parameters
protected validateEmailParams(params: SendEmailParams): void;

// Validate bulk parameters
protected validateBulkParams(params: SendBulkEmailParams): void;

// Validate template parameters
protected validateTemplateParams(params: SendTemplateParams): void;

// Validate attachments
protected validateAttachments(attachments: EmailAttachment[]): void;
```

### Rate Limiting

```typescript
// Check rate limit for user
protected async checkRateLimit(params: SendEmailParams): Promise<void>;

// Check campaign rate limit
protected async checkCampaignRateLimit(): Promise<void>;
```

### Retry and Queueing

```typescript
// Send with retry logic
protected async sendWithRetry(params: SendEmailParams): Promise<SendEmailResult>;

// Queue an email
protected async queueEmail(params: SendEmailParams, options?): Promise<string>;

// Sleep utility
protected sleep(ms: number): Promise<void>;
```

### Logging

```typescript
// Log a message
protected log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, any>
): void;

// Log metrics
protected logMetrics(event: string, data: Record<string, any>): void;

// Sanitize email for logging (privacy)
protected sanitizeEmail(email: string | string[]): string | string[];
```

## Testing

### Unit Testing

```typescript
import { EmailProvider } from './base-provider';
import type { SendEmailParams, SendEmailResult } from './types';

class TestEmailProvider extends EmailProvider {
  protected async sendEmailInternal(params: SendEmailParams): Promise<SendEmailResult> {
    return {
      messageId: `test-${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }
  
  // Implement other abstract methods...
}

describe('EmailProvider', () => {
  it('validates email addresses', async () => {
    const provider = new TestEmailProvider({
      providerName: 'test',
      providerConfig: {},
    });
    
    await expect(
      provider.sendEmail({
        to: 'invalid-email',
        subject: 'Test',
        text: 'Test',
      })
    ).rejects.toThrow(EmailValidationError);
  });
  
  it('enforces rate limits', async () => {
    const provider = new TestEmailProvider({
      providerName: 'test',
      providerConfig: {},
      rateLimit: {
        maxEmailsPerWindow: 1,
        windowSeconds: 60,
      },
    }, redis);
    
    // First email succeeds
    await provider.sendEmail({ to: 'user@example.com', subject: 'Test', text: 'Test' });
    
    // Second email is rate limited
    await expect(
      provider.sendEmail({ to: 'user@example.com', subject: 'Test', text: 'Test' })
    ).rejects.toThrow(EmailRateLimitError);
  });
});
```

### Test Mode

```typescript
const provider = new MyEmailProvider({
  providerName: 'test',
  providerConfig: {},
  testMode: {
    enabled: true,
    captureEmails: true,
  },
});

// Send test email
await provider.sendEmail({
  to: 'test@example.com',
  subject: 'Test',
  text: 'Test',
});

// Verify
const emails = provider.getTestEmails();
expect(emails).toHaveLength(1);
expect(emails[0].params.to).toBe('test@example.com');
```

## Best Practices

### 1. Don't Log Sensitive Content

```typescript
// ❌ Bad
this.log('info', 'Sending email', {
  to: params.to,
  html: params.html,  // Contains personal information
});

// ✅ Good
this.log('info', 'Sending email', {
  to: this.sanitizeEmail(params.to),  // Sanitized
  subject: params.subject,
  tags: params.tags,
});
```

### 2. Classify Errors Correctly

```typescript
// ❌ Bad - All errors are retryable
protected classifyError(error: any): ErrorRetryability {
  return ErrorRetryability.RETRYABLE;
}

// ✅ Good - Classify based on error type
protected classifyError(error: any): ErrorRetryability {
  if (error.statusCode === 400) return ErrorRetryability.NON_RETRYABLE;
  if (error.statusCode === 429) return ErrorRetryability.RATE_LIMITED;
  if (error.statusCode >= 500) return ErrorRetryability.RETRYABLE;
  return super.classifyError(error);
}
```

### 3. Use Type-Safe Configuration

```typescript
// ❌ Bad - Weak typing
interface MyConfig {
  apiKey: string;
  settings: any;
}

// ✅ Good - Strong typing
interface MyConfig {
  apiKey: string;
  senderAddress: string;
  senderName?: string;
  webhookSecret?: string;
}
```

### 4. Handle Idempotency

```typescript
// Generate idempotency key from email params
const idempotencyKey = crypto
  .createHash('sha256')
  .update(JSON.stringify({ to: params.to, subject: params.subject, timestamp }))
  .digest('hex');

// Check if already sent
const existing = await redis.get(`email:idempotency:${idempotencyKey}`);
if (existing) {
  return JSON.parse(existing);
}

// Send and cache result
const result = await this.sendEmailInternal(params);
await redis.setex(`email:idempotency:${idempotencyKey}`, 86400, JSON.stringify(result));
```

## Migration Guide

### Updating ResendAdapter to Extend Base Class

```typescript
// Before
export class ResendAdapter implements IEmailProvider {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    // Manual validation
    this.validateSendParams(params);
    
    // Send
    const result = await this.client.emails.send(payload);
    
    return result;
  }
}

// After
export class ResendAdapter extends EmailProvider<ResendConfig> {
  protected async sendEmailInternal(params: SendEmailParams): Promise<SendEmailResult> {
    // Validation, rate limiting, retry handled by base class
    
    // Just implement provider-specific logic
    const result = await this.client.emails.send(payload);
    
    return result;
  }
}
```

---

**Last Updated**: October 2025  
**Version**: 1.0.0  
**Maintainer**: YES GODDESS Engineering Team
