# Email Service API Reference

## Core Services

### EmailService

Main service for sending transactional emails.

```typescript
import { emailService } from '@/lib/services/email';
```

#### Methods

##### `sendTransactional(params)`
Send a single transactional email.

**Parameters:**
```typescript
{
  userId?: string;              // Optional user ID for preferences
  email: string;                // Recipient email
  subject: string;              // Email subject
  template: TemplateKey;        // Template key (type-safe)
  variables?: TemplateVariables; // Template variables
  tags?: Record<string, string>; // Custom tags for tracking
}
```

**Returns:** `Promise<{ success: boolean; messageId?: string; error?: string }>`

**Example:**
```typescript
const result = await emailService.sendTransactional({
  userId: 'user_123',
  email: 'user@example.com',
  subject: 'Welcome!',
  template: 'welcome',
  variables: { userName: 'John' },
});
```

---

### EmailSchedulingService

Service for scheduling emails for future delivery.

```typescript
import { emailSchedulingService } from '@/lib/services/email';
```

#### Methods

##### `scheduleEmail(params)`
Schedule an email for future delivery.

**Parameters:**
```typescript
{
  emailType: string;                      // Email type identifier
  recipientEmail: string;                 // Recipient email
  recipientUserId?: string;               // Optional user ID
  templateId: string;                     // Template name
  subject: string;                        // Email subject
  personalizationData?: Record<string, any>; // Template variables
  scheduledSendTime: Date;                // When to send
  timezone?: string;                      // Recipient timezone
  optimizeSendTime?: boolean;             // Auto-optimize send time
  recurrencePattern?: string;             // Cron pattern for recurring
}
```

**Returns:** `Promise<string>` (scheduled email ID)

**Example:**
```typescript
const id = await emailSchedulingService.scheduleEmail({
  emailType: 'reminder',
  recipientEmail: 'user@example.com',
  recipientUserId: 'user_123',
  templateId: 'license-expiry',
  subject: 'License Expiring Soon',
  personalizationData: {
    licenseName: 'Premium',
    expiryDate: new Date('2025-11-01'),
    daysUntilExpiry: 7,
  },
  scheduledSendTime: new Date('2025-10-25T10:00:00Z'),
  optimizeSendTime: true,
});
```

##### `cancelScheduledEmail(scheduledEmailId)`
Cancel a scheduled email.

**Parameters:**
- `scheduledEmailId: string` - ID of scheduled email

**Returns:** `Promise<void>`

---

### EmailRetryService

Service for managing failed email retries.

```typescript
import { emailRetryService } from '@/lib/services/email';
```

#### Methods

##### `addToRetryQueue(params)`
Add a failed email to the retry queue.

**Parameters:**
```typescript
{
  recipientEmail: string;
  recipientUserId?: string;
  subject: string;
  template: TemplateKey;
  variables?: Record<string, any>;
  tags?: Record<string, string>;
  error: Error;
  attemptCount?: number;
}
```

**Returns:** `Promise<string | null>` (retry job ID or null if max retries exceeded)

**Note:** This is typically called automatically by the email service on failures.

---

### EmailTrackingService

Service for processing email tracking events.

```typescript
import { emailTrackingService } from '@/lib/services/email';
```

#### Methods

##### `processTrackingEvent(event)`
Process a tracking event from Resend webhook.

**Parameters:**
```typescript
{
  messageId: string;
  eventType: EmailEventType;
  email: string;
  userId?: string;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
  clickedUrl?: string;
  metadata?: Record<string, any>;
}
```

**Returns:** `Promise<void>`

**Note:** This is called automatically by the webhook handler.

---

### SuppressionListManager

Manager for email suppression list.

```typescript
import { SuppressionListManager } from '@/lib/adapters/email';

const suppressionList = new SuppressionListManager();
```

#### Methods

##### `isSuppressed(email)`
Check if an email is on the suppression list.

**Parameters:**
- `email: string` - Email to check

**Returns:** `Promise<boolean>`

**Example:**
```typescript
const suppressed = await suppressionList.isSuppressed('user@example.com');
if (suppressed) {
  console.log('Email is suppressed, will not send');
}
```

##### `add(params)`
Add an email to the suppression list.

**Parameters:**
```typescript
{
  email: string;
  reason: 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE';
  bounceType?: 'hard' | 'soft';
  bounceReason?: string;
  metadata?: Record<string, any>;
}
```

**Returns:** `Promise<void>`

**Example:**
```typescript
await suppressionList.add({
  email: 'bounced@example.com',
  reason: 'BOUNCE',
  bounceType: 'hard',
  bounceReason: 'Address does not exist',
});
```

##### `remove(email)`
Remove an email from the suppression list.

**Parameters:**
- `email: string` - Email to remove

**Returns:** `Promise<void>`

---

### UnsubscribeService

Service for handling unsubscribe requests.

```typescript
import { unsubscribeService } from '@/lib/services/email';
```

#### Methods

##### `processUnsubscribe(options)`
Process an unsubscribe request.

**Parameters:**
```typescript
{
  userId?: string;
  email: string;
  global?: boolean;
  categories?: string[];
  source: 'email_client' | 'one_click' | 'preference_center' | 'webhook';
  campaignId?: string;
  userAgent?: string;
  ipAddress?: string;
}
```

**Returns:** `Promise<void>`

**Example:**
```typescript
await unsubscribeService.processUnsubscribe({
  userId: 'user_123',
  email: 'user@example.com',
  global: false,
  categories: ['newsletters'],
  source: 'preference_center',
});
```

---

### EmailDeliverabilityService

Service for monitoring email deliverability.

```typescript
import { emailDeliverabilityService } from '@/lib/services/email';
```

#### Methods

##### `calculateMetrics(period)`
Calculate deliverability metrics for a time period.

**Parameters:**
- `period: 'hour' | 'day' | 'week'` - Time period

**Returns:** `Promise<DeliverabilityMetrics>`
```typescript
{
  period: string;
  startTime: Date;
  endTime: Date;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalFailed: number;
  totalComplained: number;
  deliveryRate: number;    // 0-1 (e.g., 0.98 = 98%)
  bounceRate: number;      // 0-1
  complaintRate: number;   // 0-1
  failureRate: number;     // 0-1
  bouncesByType?: {
    hard: number;
    soft: number;
    unknown: number;
  };
}
```

**Example:**
```typescript
const metrics = await emailDeliverabilityService.calculateMetrics('day');
console.log(`Delivery Rate: ${(metrics.deliveryRate * 100).toFixed(2)}%`);
```

##### `monitorAndAlert()`
Monitor deliverability and generate alerts if thresholds exceeded.

**Returns:** `Promise<DeliverabilityAlert[]>`

---

## Validation & Sanitization

### Email Validation

```typescript
import { validateEmail, validateEmailsBulk } from '@/lib/services/email';
```

#### `validateEmail(email, options?)`
Validate a single email with detailed checks.

**Parameters:**
```typescript
email: string
options?: {
  checkMx?: boolean;         // Check MX records (default: true)
  checkDisposable?: boolean; // Check disposable domains (default: true)
  checkTypos?: boolean;      // Check for typos (default: true)
}
```

**Returns:** `Promise<EmailValidationResult>`
```typescript
{
  email: string;
  isValid: boolean;
  normalizedEmail?: string;
  error?: string;
  warnings?: string[];
  suggestions?: string[];
}
```

**Example:**
```typescript
const result = await validateEmail('user@gmial.com', {
  checkMx: true,
  checkTypos: true,
});
// result.warnings: ["Possible typo in domain: gmial.com"]
// result.suggestions: ["user@gmail.com"]
```

#### `validateEmailsBulk(emails, options?)`
Validate multiple emails in bulk.

**Parameters:**
```typescript
emails: string[]
options?: {
  checkMx?: boolean;
  checkDisposable?: boolean;
  checkTypos?: boolean;
  parallel?: boolean;  // Process in parallel (default: true)
  batchSize?: number;  // Batch size for parallel (default: 50)
}
```

**Returns:** `Promise<BulkValidationResult>`
```typescript
{
  totalEmails: number;
  validEmails: number;
  invalidEmails: number;
  results: EmailValidationResult[];
  validEmailList: string[];
  invalidEmailList: string[];
}
```

**Example:**
```typescript
const result = await validateEmailsBulk(emailList, {
  checkMx: true,
  parallel: true,
});
console.log(`Valid: ${result.validEmails}/${result.totalEmails}`);
```

### Email Sanitization

```typescript
import {
  sanitizeEmailAddress,
  sanitizeSubject,
  sanitizeHtmlContent,
} from '@/lib/services/email';
```

#### `sanitizeEmailAddress(email)`
Sanitize and validate email address.

**Returns:** `string` (normalized email)

**Throws:** `EmailValidationError` if invalid

**Example:**
```typescript
const clean = sanitizeEmailAddress('  USER@EXAMPLE.COM  ');
// Returns: "user@example.com"
```

#### `sanitizeSubject(subject)`
Sanitize email subject line (prevents header injection).

**Returns:** `string` (sanitized subject)

**Example:**
```typescript
const clean = sanitizeSubject('Test\r\nBcc: hacker@evil.com');
// Returns: "Test Bcc: hacker@evil.com" (newlines removed)
```

#### `sanitizeHtmlContent(html)`
Sanitize HTML content (prevents XSS).

**Returns:** `string` (sanitized HTML)

---

## Template Registry

### Type-Safe Template Rendering

```typescript
import { renderTemplate, type TemplateVariables } from '@/lib/services/email';
```

#### `renderTemplate(templateKey, variables)`
Render a template with type-safe variables.

**Parameters:**
```typescript
templateKey: TemplateKey;
variables: TemplateVariables<templateKey>;
```

**Returns:** `React.ReactElement`

**Example:**
```typescript
// TypeScript ensures correct variables for template
const element = renderTemplate('email-verification', {
  userName: 'John',
  verificationUrl: 'https://...',
  expiresInHours: 24,
});
```

#### Template Keys

All available templates:

```typescript
type TemplateKey =
  | 'welcome'
  | 'email-verification'
  | 'password-reset'
  | 'password-changed'
  | 'royalty-statement'
  | 'license-expiry'
  | 'payout-confirmation'
  | 'brand-verification-request'
  | 'brand-welcome'
  | 'brand-verification-complete'
  | 'brand-verification-rejected'
  | 'brand-team-invitation'
  | 'role-changed'
  | 'monthly-newsletter'
  | 'transaction-receipt'
  | 'project-invitation'
  | 'creator-welcome'
  | 'creator-verification-approved'
  | 'creator-verification-rejected';
```

---

## Error Classes

All email errors extend `EmailError` base class.

```typescript
import {
  EmailError,
  EmailSuppressionError,
  EmailPreferenceError,
  EmailProviderError,
  EmailValidationError,
  EmailTemplateError,
  EmailRateLimitError,
  EmailWebhookError,
} from '@/lib/services/email';
```

### `EmailSuppressionError`
Thrown when email is on suppression list.

```typescript
try {
  await emailService.sendTransactional({ /* ... */ });
} catch (error) {
  if (error instanceof EmailSuppressionError) {
    // Email is suppressed (bounced/unsubscribed)
  }
}
```

### `EmailPreferenceError`
Thrown when user preferences prevent sending.

### `EmailProviderError`
Thrown when Resend API fails.

**Properties:**
- `provider: string` - Provider name (e.g., "Resend")
- `details: string` - Error details
- `providerCode?: string` - Provider error code
- `retryable: boolean` - Whether error is retryable

### `EmailValidationError`
Thrown when email validation fails.

**Properties:**
- `field?: string` - Field that failed validation
- `value?: any` - Invalid value

### `EmailTemplateError`
Thrown when template rendering fails.

**Properties:**
- `templateName: string` - Template that failed
- `details: string` - Error details
- `missingVariables?: string[]` - Missing required variables

---

## Worker Management

### Initialize Workers

```typescript
import { initializeEmailWorkers } from '@/jobs/email-workers';

// Start all email workers
initializeEmailWorkers();
```

### Check Worker Health

```typescript
import { getEmailWorkersHealth } from '@/jobs/email-workers';

const health = await getEmailWorkersHealth();
console.log(health);
// {
//   healthy: true,
//   workers: {
//     'scheduled-emails': { running: true, isPaused: false },
//     'email-retry': { running: true, isPaused: false },
//     ...
//   }
// }
```

### Health Check Endpoint

```
GET /api/admin/email/workers/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T10:00:00Z",
  "workers": {
    "scheduled-emails": { "running": true, "isPaused": false },
    "email-retry": { "running": true, "isPaused": false },
    "email-campaigns": { "running": true, "isPaused": false },
    "deliverability-monitoring": { "running": true, "isPaused": false }
  },
  "queues": {
    "scheduledEmails": {
      "waiting": 10,
      "active": 2,
      "completed": 1000,
      "failed": 5,
      "delayed": 20
    },
    "emailRetry": {
      "waiting": 3,
      "active": 1,
      "completed": 50,
      "failed": 2,
      "delayed": 5
    }
  }
}
```

---

## Constants & Configuration

### Email Categories

Used for preference checking:

```typescript
const categories = {
  'system',              // System emails (always sent)
  'royaltyStatements',   // Royalty statements
  'licenseExpiry',       // License expiry warnings
  'payouts',             // Payout notifications
  'projectInvitations',  // Project invitations
  'newsletters',         // Marketing newsletters
};
```

### Retry Configuration

Default retry strategy:

```typescript
const retryConfig = {
  maxAttempts: 5,
  initialDelayMs: 60000,      // 1 minute
  maxDelayMs: 3600000,         // 1 hour
  backoffMultiplier: 2,
};
```

Retry delays:
1. 1 minute
2. 15 minutes
3. 1 hour
4. 4 hours
5. 24 hours

### Deliverability Thresholds

```typescript
const thresholds = {
  DELIVERY_RATE_WARNING: 0.95,    // 95%
  DELIVERY_RATE_CRITICAL: 0.90,   // 90%
  BOUNCE_RATE_WARNING: 0.02,      // 2%
  BOUNCE_RATE_CRITICAL: 0.05,     // 5%
  COMPLAINT_RATE_WARNING: 0.001,  // 0.1%
  COMPLAINT_RATE_CRITICAL: 0.003, // 0.3%
};
```

---

## Type Definitions

### Template Variable Types

Each template has its own variable type:

```typescript
interface WelcomeEmailProps {
  userName: string;
  loginUrl?: string;
}

interface EmailVerificationProps {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number;
}

interface RoyaltyStatementProps {
  creatorName: string;
  periodStart: Date;
  periodEnd: Date;
  totalRoyalties: number;
  currency: string;
  statementUrl: string;
  lineItems?: Array<{
    assetName: string;
    amount: number;
    units: number;
  }>;
}

// ... see template-registry.ts for all types
```

### Event Types

```typescript
type EmailEventType =
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED';
```

### Suppression Reasons

```typescript
type SuppressionReason =
  | 'BOUNCE'
  | 'COMPLAINT'
  | 'UNSUBSCRIBE';
```

---

**API Reference Version**: 1.0  
**Last Updated**: October 11, 2025
