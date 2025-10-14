# Resend Email Service - Frontend Integration Guide

## 🌐 Classification: SHARED
> Used by both public-facing website (client portal) and admin backend for transactional emails, campaign management, and email tracking

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Real-time Updates](#real-time-updates)
10. [Email Templates](#email-templates)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Resend email service provides a complete email infrastructure for the YES GODDESS platform, supporting:

- ✅ **Transactional Emails**: Password resets, email verification, notifications
- ✅ **Bulk Email Campaigns**: Marketing and announcement emails with automatic batching
- ✅ **React Email Templates**: Type-safe, component-based email templates
- ✅ **Delivery Tracking**: Real-time webhook processing for opens, clicks, bounces, complaints
- ✅ **Suppression Management**: Automatic bounce/complaint-based email blocking
- ✅ **User Preferences**: Granular opt-in/opt-out controls per category
- ✅ **Rate Limiting**: Per-user and per-campaign rate limits to prevent abuse

### Architecture

```
┌─────────────────┐
│   Frontend      │
│  (yesgoddess-   │
│      web)       │
└────────┬────────┘
         │ HTTP/tRPC
         ▼
┌─────────────────┐        ┌──────────────┐
│    Backend      │        │   Resend     │
│  Email Service  │◄──────►│   API        │
│  (yg-backend)   │        └──────────────┘
└────────┬────────┘
         │                  ┌──────────────┐
         │ Webhooks         │   Database   │
         └─────────────────►│  (Postgres)  │
                            └──────────────┘
```

### Key Features

- **Provider Abstraction**: Backend uses `IEmailProvider` interface - can switch providers without frontend changes
- **Automatic Batching**: Bulk sends chunked into 100-email batches (Resend limit)
- **Webhook Processing**: Asynchronous processing via BullMQ background jobs
- **Circuit Breaker**: Automatic failover when provider is unavailable
- **GDPR Compliance**: Export and deletion of user email data

---

## API Endpoints

### Base URLs

- **Backend API**: `https://ops.yesgoddess.agency`
- **Webhook Endpoint**: `https://ops.yesgoddess.agency/api/webhooks/resend`

### REST API Endpoints

| Endpoint | Method | Auth | Role | Description |
|----------|--------|------|------|-------------|
| `/api/webhooks/resend` | POST | Webhook Signature | Public | Receive Resend email events (sent, delivered, opened, clicked, bounced, complained) |

> **Note**: The email service is primarily accessed through backend service methods and tRPC procedures. Direct REST API endpoints are minimal and used only for webhook callbacks.

### Backend Service Methods (Internal Use)

These methods are called by backend code, not directly by the frontend. Frontend interacts via higher-level APIs (tRPC, auth flows, etc.).

```typescript
// Email Service (src/lib/services/email/email.service.ts)
class EmailService {
  sendTransactional(params: SendTransactionalParams): Promise<SendResult>;
  sendCampaign(params: SendCampaignParams): Promise<{ jobId: string }>;
  sendDigest(params: SendDigestParams): Promise<void>;
  handleEmailEvent(event: EmailEvent): Promise<void>;
}

// Resend Adapter (src/lib/adapters/email/resend-adapter.ts)
class ResendAdapter implements IEmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult>;
  sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus | null>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean>;
  parseWebhookEvent(rawPayload: any): WebhookEvent;
}
```

---

## TypeScript Type Definitions

### Core Email Types

```typescript
/**
 * Parameters for sending a single email
 */
export interface SendEmailParams {
  /** Recipient email address(es) - single string or array for multiple recipients */
  to: string | string[];
  
  /** Carbon copy recipients */
  cc?: string | string[];
  
  /** Blind carbon copy recipients */
  bcc?: string | string[];
  
  /** Sender email address (defaults to configured from address) */
  from?: string;
  
  /** Reply-to email address */
  replyTo?: string | string[];
  
  /** Email subject line */
  subject: string;
  
  /** React Email component for rendering (preferred method) */
  react?: React.ReactElement;
  
  /** HTML email body (alternative to react) */
  html?: string;
  
  /** Plain text email body (fallback for non-HTML clients) */
  text?: string;
  
  /** File attachments */
  attachments?: EmailAttachment[];
  
  /** Custom email headers */
  headers?: Record<string, string>;
  
  /** Tags for categorization and filtering */
  tags?: Record<string, string>;
  
  /** Arbitrary metadata for tracking */
  metadata?: Record<string, any>;
  
  /** Schedule email for future delivery */
  scheduledAt?: Date;
  
  /** Priority level for email delivery */
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Result from sending a single email
 */
export interface SendEmailResult {
  /** Unique message identifier from Resend */
  messageId: string;
  
  /** Current delivery status */
  status: 'queued' | 'sent' | 'failed';
  
  /** Timestamp when email was accepted by Resend */
  timestamp: Date;
  
  /** Error message if sending failed */
  error?: string;
  
  /** Resend-specific error code */
  errorCode?: string;
  
  /** Resend-specific metadata */
  providerMetadata?: Record<string, any>;
}

/**
 * Email attachment specification
 */
export interface EmailAttachment {
  /** Filename to display */
  filename: string;
  
  /** File content (base64 encoded or Buffer) */
  content: string | Buffer;
  
  /** MIME type */
  contentType?: string;
  
  /** Inline content ID for embedding in HTML */
  cid?: string;
}

/**
 * Parameters for sending bulk emails
 */
export interface SendBulkEmailParams {
  /** List of recipients with optional personalization variables */
  recipients: Array<{
    email: string;
    name?: string;
    variables?: Record<string, any>;
    metadata?: Record<string, any>;
  }>;
  
  /** Template identifier or name */
  template: string;
  
  /** Sender email address */
  from?: string;
  
  /** Email subject line (supports variable interpolation like {{firstName}}) */
  subject: string;
  
  /** Tags applied to all emails in the batch */
  tags?: Record<string, string>;
  
  /** Default variables for all recipients */
  defaultVariables?: Record<string, any>;
  
  /** Maximum batch size for chunking (defaults to 100, Resend's limit) */
  batchSize?: number;
  
  /** Delay between batches in milliseconds */
  batchDelay?: number;
  
  /** Progress callback for long-running operations */
  onProgress?: (progress: BulkSendProgress) => void;
}

/**
 * Progress tracking for bulk send operations
 */
export interface BulkSendProgress {
  /** Total emails to send */
  total: number;
  
  /** Successfully sent so far */
  sent: number;
  
  /** Failed so far */
  failed: number;
  
  /** Percentage complete (0-100) */
  percentComplete: number;
  
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * Result from bulk email send operation
 */
export interface SendBulkResult {
  /** Total number of emails attempted */
  total: number;
  
  /** Successfully queued for delivery */
  queued: number;
  
  /** Number of failures */
  failed: number;
  
  /** Processing duration in milliseconds */
  durationMs: number;
  
  /** Message IDs for successful sends */
  messageIds: string[];
  
  /** Detailed error information for failures */
  errors?: Array<{
    email: string;
    error: string;
    errorCode?: string;
    retryable: boolean;
  }>;
  
  /** Rate limiting information encountered */
  rateLimitInfo?: {
    delaysEncountered: number;
    totalDelayMs: number;
  };
}

/**
 * Parameters for sending templated emails
 */
export interface SendTemplateParams {
  /** Recipients */
  to: string | string[];
  
  /** Template identifier or React component */
  template: string | React.ComponentType<any>;
  
  /** Variables for template rendering */
  variables: Record<string, any>;
  
  /** Email subject */
  subject: string;
  
  /** Sender address */
  from?: string;
  
  /** Reply-to address */
  replyTo?: string | string[];
  
  /** Tags for categorization */
  tags?: Record<string, string>;
  
  /** Metadata */
  metadata?: Record<string, any>;
  
  /** Template version (for A/B testing) */
  templateVersion?: string;
  
  /** Whether to preview without sending */
  previewOnly?: boolean;
}

/**
 * Delivery status and tracking information
 */
export interface DeliveryStatus {
  messageId: string;
  status: DeliveryState;
  email?: string;
  subject?: string;
  events: DeliveryEvent[];
  engagement?: {
    opened?: boolean;
    openCount?: number;
    firstOpenedAt?: Date;
    lastOpenedAt?: Date;
    clicked?: boolean;
    clickCount?: number;
    firstClickedAt?: Date;
    lastClickedAt?: Date;
    clickedUrls?: string[];
  };
  bounce?: BounceInfo;
  complaint?: ComplaintInfo;
}

export type DeliveryState =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'deferred'
  | 'bounced'
  | 'failed'
  | 'complained'
  | 'opened'
  | 'clicked';

export interface DeliveryEvent {
  type: DeliveryState | string;
  timestamp: Date;
  details?: {
    url?: string;
    userAgent?: string;
    ipAddress?: string;
    location?: string;
    reason?: string;
    diagnosticCode?: string;
    [key: string]: any;
  };
}

/**
 * Bounce information
 */
export interface BounceInfo {
  type: BounceType;
  subType?: string;
  reason: string;
  diagnosticCode?: string;
  timestamp: Date;
  suppressionRecommended: boolean;
}

export type BounceType =
  | 'hard'        // Permanent (invalid address)
  | 'soft'        // Temporary (mailbox full)
  | 'technical'   // Technical issue
  | 'undetermined';

/**
 * Complaint information
 */
export interface ComplaintInfo {
  type: ComplaintType;
  timestamp: Date;
  feedbackType?: string;
  userAgent?: string;
  suppressionRecommended: boolean;
}

export type ComplaintType =
  | 'abuse'
  | 'fraud'
  | 'virus'
  | 'not-spam'
  | 'other';

/**
 * Webhook event from Resend
 */
export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: Date;
  messageId: string;
  email: string;
  subject?: string;
  data: any;
  provider: string;
  rawPayload?: any;
}

export type WebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained';

/**
 * Email suppression list entry
 */
export interface SuppressionInfo {
  email: string;
  reason: SuppressionReason;
  suppressedAt: Date;
  bounceType?: BounceType;
  bounceReason?: string;
  metadata?: Record<string, any>;
}

export type SuppressionReason =
  | 'BOUNCE'
  | 'COMPLAINT'
  | 'UNSUBSCRIBE'
  | 'MANUAL';
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

/**
 * Email address validation schema
 */
export const emailAddressSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

/**
 * Send transactional email schema
 */
export const sendTransactionalEmailSchema = z.object({
  userId: z.string().cuid().optional(),
  email: emailAddressSchema,
  subject: z.string().min(1).max(200),
  template: z.string().min(1),
  variables: z.record(z.string(), z.any()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  scheduledAt: z.date().optional(),
});

/**
 * Send campaign email schema
 */
export const sendCampaignEmailSchema = z.object({
  recipients: z
    .array(
      z.object({
        userId: z.string().cuid(),
        email: emailAddressSchema,
        variables: z.record(z.string(), z.any()).optional(),
      })
    )
    .min(1),
  subject: z.string().min(1).max(200),
  template: z.string().min(1),
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * Email event webhook schema
 */
export const emailEventWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    message_id: z.string(),
    email: z.string().email(),
    created_at: z.string(),
  }),
});
```

---

## Request/Response Examples

### 1. Webhook Event - Email Sent

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,g5EwzRbL..." \
  -d '{
    "type": "email.sent",
    "created_at": "2025-10-13T10:15:30Z",
    "data": {
      "email_id": "re_abc123def456",
      "from": "notifications@yesgoddess.agency",
      "to": "creator@example.com",
      "subject": "Welcome to YES GODDESS",
      "created_at": "2025-10-13T10:15:30Z",
      "metadata": {
        "userId": "cm2abc123",
        "template": "welcome-email"
      }
    }
  }'
```

**Backend Response:**

```json
{
  "success": true
}
```

### 2. Webhook Event - Email Opened

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,h6FxzScM..." \
  -d '{
    "type": "email.opened",
    "created_at": "2025-10-13T10:20:45Z",
    "data": {
      "email_id": "re_abc123def456",
      "email": "creator@example.com",
      "created_at": "2025-10-13T10:20:45Z",
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "ip_address": "203.0.113.42",
      "metadata": {
        "userId": "cm2abc123",
        "template": "welcome-email"
      }
    }
  }'
```

**Backend Response:**

```json
{
  "success": true
}
```

### 3. Webhook Event - Email Clicked

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,i7GyzTdN..." \
  -d '{
    "type": "email.clicked",
    "created_at": "2025-10-13T10:25:12Z",
    "data": {
      "email_id": "re_abc123def456",
      "email": "creator@example.com",
      "created_at": "2025-10-13T10:25:12Z",
      "click": {
        "link": "https://yesgoddess.agency/projects/new"
      },
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "ip_address": "203.0.113.42",
      "metadata": {
        "userId": "cm2abc123",
        "template": "welcome-email"
      }
    }
  }'
```

**Backend Response:**

```json
{
  "success": true
}
```

### 4. Webhook Event - Email Bounced (Hard)

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,j8HzaUeO..." \
  -d '{
    "type": "email.bounced",
    "created_at": "2025-10-13T10:16:05Z",
    "data": {
      "email_id": "re_abc123def456",
      "email": "invalid@nonexistent-domain.com",
      "created_at": "2025-10-13T10:16:05Z",
      "bounce_type": "hard",
      "bounce_reason": "Recipient address rejected: User unknown in local recipient table",
      "error": "550 5.1.1 <invalid@nonexistent-domain.com>: Recipient address rejected",
      "metadata": {
        "userId": "cm2abc123",
        "template": "welcome-email"
      }
    }
  }'
```

**Backend Processing:**
- Email automatically added to suppression list
- User status may be updated
- Alert sent to admin if bounce rate exceeds threshold

**Backend Response:**

```json
{
  "success": true
}
```

### 5. Webhook Event - Email Bounced (Soft)

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,k9IabVfP..." \
  -d '{
    "type": "email.bounced",
    "created_at": "2025-10-13T10:16:05Z",
    "data": {
      "email_id": "re_xyz789ghi012",
      "email": "user@example.com",
      "created_at": "2025-10-13T10:16:05Z",
      "bounce_type": "soft",
      "bounce_reason": "Mailbox full",
      "error": "452 4.2.2 Mailbox full",
      "metadata": {
        "userId": "cm2xyz789",
        "template": "notification-email"
      }
    }
  }'
```

**Backend Processing:**
- Soft bounce tracked but NOT immediately suppressed
- Retry attempted after delay
- After 3+ soft bounces, email added to suppression list

**Backend Response:**

```json
{
  "success": true
}
```

### 6. Webhook Event - Spam Complaint

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,l0JbcWgQ..." \
  -d '{
    "type": "email.complained",
    "created_at": "2025-10-13T11:30:00Z",
    "data": {
      "email_id": "re_abc123def456",
      "email": "complainer@example.com",
      "created_at": "2025-10-13T11:30:00Z",
      "complaint_type": "spam",
      "metadata": {
        "userId": "cm2abc123",
        "template": "marketing-email"
      }
    }
  }'
```

**Backend Processing:**
- Email IMMEDIATELY added to suppression list
- All future emails blocked to this address
- User automatically unsubscribed from all categories
- Alert sent to admin for review

**Backend Response:**

```json
{
  "success": true
}
```

### 7. Webhook Event - Delivery Delayed

**Webhook Request from Resend:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-signature: v1,m1KcdXhR..." \
  -d '{
    "type": "email.delivery_delayed",
    "created_at": "2025-10-13T10:18:00Z",
    "data": {
      "email_id": "re_abc123def456",
      "email": "user@slowserver.com",
      "created_at": "2025-10-13T10:18:00Z",
      "error": "Temporary server error. Will retry.",
      "metadata": {
        "userId": "cm2abc123",
        "template": "notification-email"
      }
    }
  }'
```

**Backend Processing:**
- Logged as deferred delivery
- Email status remains "sent" until delivered or bounced
- Resend automatically retries

**Backend Response:**

```json
{
  "success": true
}
```

### 8. Error Responses

#### Missing Signature

```json
{
  "error": "Missing signature",
  "status": 401
}
```

#### Invalid Signature

```json
{
  "error": "Invalid signature",
  "status": 401
}
```

#### Webhook Processing Failed

```json
{
  "error": "Webhook processing failed",
  "details": "Database connection error",
  "status": 500
}
```

#### Webhook Not Configured

```json
{
  "error": "Webhook not configured",
  "status": 500
}
```

---

## Business Logic & Validation Rules

### Email Validation

#### Email Address Format

```typescript
// Valid email formats
const validEmails = [
  'user@example.com',
  'user+tag@example.com',
  'user.name@example.co.uk',
  'firstname.lastname@company.com'
];

// Invalid formats (rejected)
const invalidEmails = [
  'invalid',
  'invalid@',
  '@example.com',
  'invalid@domain',
  'invalid spaces@example.com'
];
```

**Validation Rules:**
- Must be valid RFC 5322 email address
- Automatically converted to lowercase
- Whitespace trimmed
- Maximum length: 254 characters
- Domain must have valid DNS MX record (soft check)

#### Suppression List Check

Before sending ANY email, the system checks:

```typescript
// Pseudo-code
async function canSendEmail(email: string): Promise<boolean> {
  // 1. Check suppression list
  const suppressed = await isEmailSuppressed(email);
  if (suppressed) {
    throw new EmailSuppressionError(email);
  }
  
  // 2. Check if email is in valid format
  if (!isValidEmail(email)) {
    throw new EmailValidationError('Invalid email format');
  }
  
  // 3. Check rate limits
  const rateLimitOk = await checkRateLimit(userId);
  if (!rateLimitOk) {
    throw new EmailRateLimitError(userId, resetAt);
  }
  
  return true;
}
```

**Suppression Reasons:**
- `BOUNCE` (hard bounce) - **Permanent block**
- `COMPLAINT` (spam report) - **Permanent block**
- `UNSUBSCRIBE` - **Block unless user re-subscribes**
- `MANUAL` - **Admin-initiated block**

#### Soft Bounce Handling

Soft bounces are retried with exponential backoff:

| Attempt | Delay | Action |
|---------|-------|--------|
| 1st | 0 min | Immediate send |
| 2nd | 30 min | Retry after temporary failure |
| 3rd | 2 hours | Final retry |
| 4th | N/A | Add to suppression list |

### Subject Line Validation

```typescript
const subjectValidation = {
  minLength: 1,
  maxLength: 200,
  
  // Spam trigger words (logged as warning, not blocked)
  spamWords: ['FREE', 'URGENT', 'ACT NOW', 'LIMITED TIME', '!!!'],
  
  // Variable interpolation supported
  allowedVariables: /{{[a-zA-Z0-9_]+}}/g,
  
  // Examples
  valid: [
    'Welcome to YES GODDESS',
    'Your payment of ${{amount}} was received',
    'Project invitation from {{brandName}}'
  ]
};
```

### Bulk Email Batching

**Resend Limits:**
- Max 100 emails per batch request
- Recommended: 1,000 emails per hour (configurable)
- Max 10,000 emails per hour (hard limit)

**Backend Implementation:**
```typescript
// Automatic batching
const batchSize = 100; // Resend limit
const messagesPerHour = 1000; // Default rate limit

// Calculate delay between batches
const batchDelay = (3600 * 1000) / (messagesPerHour / batchSize);
// Result: 360,000ms (6 minutes) between batches for 1000 emails/hour

// Example: Send 5,000 emails
// - Split into 50 batches (100 emails each)
// - Send 1 batch every 6 minutes
// - Total time: ~5 hours
```

### Email Template Variables

All templates support variable interpolation:

```typescript
// Template with variables
const template = `
  <h1>Welcome, {{firstName}}!</h1>
  <p>Your account has been created with email {{email}}.</p>
  <p>You can now access {{platformName}}.</p>
`;

// Variables object
const variables = {
  firstName: 'Jane',
  email: 'jane@example.com',
  platformName: 'YES GODDESS'
};

// Rendered output
const rendered = `
  <h1>Welcome, Jane!</h1>
  <p>Your account has been created with email jane@example.com.</p>
  <p>You can now access YES GODDESS.</p>
`;
```

**Required Variables:**
- Templates define required variables
- Missing variables cause `EmailTemplateError`
- Optional variables default to empty string

### User Preference Checks

Before sending non-transactional emails:

```typescript
// Check user preferences
const preferences = await getUserEmailPreferences(userId);

// Category mapping
const categoryMap = {
  'welcome-email': 'transactional',     // Always sent
  'password-reset': 'transactional',    // Always sent
  'newsletter': preferences.newsletters,
  'announcement': preferences.announcements,
  'royalty-statement': preferences.royaltyStatements,
  'license-expiry': preferences.licenseExpiry,
  'project-invitation': preferences.projectInvitations,
  'message-notification': preferences.messages,
  'payout-notification': preferences.payouts,
};

// Check if email should be sent
if (categoryMap[template] === false) {
  throw new EmailPreferenceError('User opted out');
}

// Check global unsubscribe
if (preferences.globalUnsubscribe) {
  throw new EmailPreferenceError('User unsubscribed globally');
}
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description | User-Friendly Message | Retryable |
|------|-------------|-------------|----------------------|-----------|
| `EMAIL_SUPPRESSED` | 400 | Email on suppression list | "This email address cannot receive messages" | ❌ No |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many emails sent | "Sending limit reached. Try again in {{resetTime}}" | ✅ Yes |
| `PROVIDER_ERROR` | 502 | Resend API error | "Email service temporarily unavailable" | ✅ Yes |
| `PREFERENCE_BLOCKED` | 403 | User opted out | "User has disabled this email category" | ❌ No |
| `VALIDATION_ERROR` | 400 | Invalid email data | "Invalid email address or parameters" | ❌ No |
| `TEMPLATE_ERROR` | 500 | Template rendering failed | "Email template error. Contact support" | ❌ No |
| `WEBHOOK_ERROR` | 500 | Webhook processing failed | "Email tracking error. Delivery unaffected" | ✅ Yes |
| `INVALID_SIGNATURE` | 401 | Webhook signature invalid | "Webhook authentication failed" | ❌ No |
| `ATTACHMENT_ERROR` | 400 | Attachment too large or invalid | "Email attachment is too large (max 10MB)" | ❌ No |

### Error Response Format

All email errors follow this structure:

```typescript
interface EmailErrorResponse {
  error: string;           // Error code (e.g., "EMAIL_SUPPRESSED")
  message: string;         // Human-readable message
  details?: string;        // Additional technical details
  code?: string;          // Provider-specific code
  retryable: boolean;     // Whether the operation can be retried
  retryAfter?: number;    // Seconds until retry allowed (for rate limits)
}
```

### Error Handling Examples

#### 1. Email Suppressed

```typescript
try {
  await emailService.sendTransactional({
    email: 'bounced@example.com',
    subject: 'Test Email',
    template: 'test-template'
  });
} catch (error) {
  if (error instanceof EmailSuppressionError) {
    // Show user-friendly message
    toast.error('This email address cannot receive messages');
    
    // Log for admin review
    console.warn('Attempted send to suppressed email:', error.email);
    
    // Don't retry
    return;
  }
}
```

**Error Response:**
```json
{
  "error": "EMAIL_SUPPRESSED",
  "message": "Email bounced@example.com is on suppression list",
  "retryable": false
}
```

#### 2. Rate Limit Exceeded

```typescript
try {
  await emailService.sendTransactional(params);
} catch (error) {
  if (error instanceof EmailRateLimitError) {
    const minutesUntilReset = Math.ceil(
      (error.resetAt.getTime() - Date.now()) / 1000 / 60
    );
    
    toast.error(
      `Sending limit reached. Try again in ${minutesUntilReset} minutes`
    );
    
    // Schedule retry
    setTimeout(() => retry(), error.resetAt.getTime() - Date.now());
  }
}
```

**Error Response:**
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded for user cm2abc123. Resets at 2025-10-13T11:00:00Z",
  "retryable": true,
  "retryAfter": 3600,
  "details": {
    "userId": "cm2abc123",
    "limit": 50,
    "resetAt": "2025-10-13T11:00:00Z"
  }
}
```

#### 3. Resend Provider Error

```typescript
try {
  await emailService.sendTransactional(params);
} catch (error) {
  if (error instanceof EmailProviderError) {
    if (error.retryable) {
      // Retry with exponential backoff
      await retryWithBackoff(() => emailService.sendTransactional(params));
    } else {
      // Permanent error - log and alert
      console.error('Email send failed:', error);
      notifyAdmin(error);
      toast.error('Email could not be sent. Please contact support');
    }
  }
}
```

**Error Response:**
```json
{
  "error": "PROVIDER_ERROR",
  "message": "Email provider Resend error: API rate limit exceeded",
  "provider": "Resend",
  "providerCode": "rate_limit_exceeded",
  "retryable": true,
  "retryAfter": 60
}
```

#### 4. User Preference Blocked

```typescript
try {
  await emailService.sendTransactional(params);
} catch (error) {
  if (error instanceof EmailPreferenceError) {
    // User opted out - respect their choice
    console.info('Email not sent due to user preference');
    
    // Don't show error to user (expected behavior)
    // Optionally show info message
    toast.info('Email preferences updated');
  }
}
```

**Error Response:**
```json
{
  "error": "PREFERENCE_BLOCKED",
  "message": "User opted out of this email category",
  "retryable": false
}
```

#### 5. Template Rendering Error

```typescript
try {
  await emailService.sendTemplate({
    template: 'welcome-email',
    variables: { /* missing required variables */ }
  });
} catch (error) {
  if (error instanceof EmailTemplateError) {
    console.error('Template error:', error.details);
    
    if (error.missingVariables) {
      console.error('Missing variables:', error.missingVariables);
    }
    
    // Alert developers
    notifyDevelopers({
      template: error.templateName,
      error: error.details,
      missingVars: error.missingVariables
    });
    
    toast.error('Email template error. Contact support');
  }
}
```

**Error Response:**
```json
{
  "error": "TEMPLATE_ERROR",
  "message": "Template welcome-email error: Missing required variables",
  "templateName": "welcome-email",
  "missingVariables": ["firstName", "activationLink"],
  "retryable": false
}
```

### Retry Strategy

```typescript
/**
 * Exponential backoff retry for transient errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry non-retryable errors
      if (error instanceof EmailError && !error.retryable) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      
      console.warn(
        `Email send failed (attempt ${attempt + 1}/${maxRetries}). ` +
        `Retrying in ${delay}ms...`
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
```

---

## Authorization & Permissions

### Endpoint Access Control

| Action | Role | Notes |
|--------|------|-------|
| **Send Transactional Email** | Backend Service | Internal only - triggered by auth flows, notifications, etc. |
| **Send Bulk Campaign** | `ADMIN` | Admin dashboard only |
| **View Email Events** | `ADMIN`, Owner | Admins see all, users see own |
| **Manage Suppression List** | `ADMIN` | Admin dashboard only |
| **Update Email Preferences** | All Users | Users manage own preferences only |
| **Receive Webhook Events** | Public | Signature-verified webhook endpoint |

### User Email Preferences

All authenticated users can manage their email preferences:

```typescript
// User permissions for email preferences
interface EmailPreferencePermissions {
  // Read own preferences
  canReadOwn: true; // All users
  
  // Update own preferences
  canUpdateOwn: true; // All users
  
  // Unsubscribe from categories
  canUnsubscribe: true; // All users
  
  // Global unsubscribe
  canUnsubscribeGlobally: true; // All users
  
  // Export email data (GDPR)
  canExportData: true; // All users
  
  // Delete email data (GDPR)
  canDeleteData: true; // All users
}
```

### Admin Permissions

Admins have full access to email system:

```typescript
interface AdminEmailPermissions {
  // Campaign management
  canCreateCampaign: true;
  canUpdateCampaign: true;
  canCancelCampaign: true;
  canSendTestEmail: true;
  
  // Analytics & monitoring
  canViewAllEvents: true;
  canViewCampaignAnalytics: true;
  canViewDeliverability: true;
  
  // Suppression list management
  canViewSuppressionList: true;
  canAddToSuppressionList: true;
  canRemoveFromSuppressionList: true;
  
  // User preference override (emergency only)
  canOverrideUserPreferences: true; // Use with caution
}
```

### Webhook Authentication

Webhooks from Resend are authenticated using signature verification:

```typescript
// Resend sends signature in header
const signature = request.headers.get('svix-signature');
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

// Backend verifies signature
const isValid = verifyResendWebhook(signature, eventPayload);

if (!isValid) {
  return new Response('Invalid signature', { status: 401 });
}
```

**Security Notes:**
- Webhook endpoint is public but signature-verified
- Invalid signatures are rejected with 401
- Webhook secret is stored in environment variables
- Signature verification prevents replay attacks

---

## Rate Limiting & Quotas

### User Rate Limits

Rate limits are enforced per user to prevent abuse:

| Limit Type | Default | Window | Scope |
|------------|---------|--------|-------|
| **Transactional Emails** | 50 emails | 1 hour | Per user ID |
| **Campaign Creation** | 10 campaigns | 24 hours | Per admin user |
| **Bulk Email Sending** | 10,000 emails | 1 hour | Per campaign |

### Rate Limit Headers

When a rate limit is approaching or exceeded, the backend includes headers in API responses:

```http
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 12
X-RateLimit-Reset: 1697198400
```

### Rate Limit Checking

```typescript
/**
 * Check rate limit before sending email
 */
const rateLimitResult = await checkEmailRateLimit(userId);

if (!rateLimitResult.allowed) {
  throw new EmailRateLimitError(
    userId,
    rateLimitResult.resetAt,
    50 // limit
  );
}

// Display remaining quota to user
console.log(`Emails remaining: ${rateLimitResult.remaining}`);
console.log(`Resets at: ${rateLimitResult.resetAt.toISOString()}`);
```

### Resend API Limits

Resend enforces the following limits:

| Resource | Limit | Notes |
|----------|-------|-------|
| **API Requests** | 10 requests/second | Per API key |
| **Batch Size** | 100 emails | Per request |
| **Email Size** | 40 MB | Including attachments |
| **Attachment Size** | 10 MB | Per attachment |
| **Recipients** | 50 | Per `to` field (use BCC for more) |

**Backend Handling:**
- Automatically batches bulk sends into groups of 100
- Adds delays between batches to respect rate limits
- Retries with exponential backoff on rate limit errors

### Displaying Limits to Users

```typescript
// Example: Email quota widget
interface EmailQuotaDisplayProps {
  userId: string;
}

function EmailQuotaDisplay({ userId }: EmailQuotaDisplayProps) {
  const [quota, setQuota] = useState<EmailRateLimitResult | null>(null);
  
  useEffect(() => {
    async function fetchQuota() {
      const result = await checkEmailRateLimit(userId);
      setQuota(result);
    }
    fetchQuota();
  }, [userId]);
  
  if (!quota) return null;
  
  const percentUsed = ((50 - quota.remaining) / 50) * 100;
  
  return (
    <div className="email-quota">
      <div className="quota-bar">
        <div 
          className="quota-fill" 
          style={{ width: `${percentUsed}%` }}
        />
      </div>
      <p>
        {quota.remaining} of 50 emails remaining this hour
      </p>
      <p className="text-sm text-gray-500">
        Resets at {quota.resetAt.toLocaleTimeString()}
      </p>
    </div>
  );
}
```

---

## Real-time Updates

### Webhook Events

The backend receives real-time email events from Resend via webhooks:

| Event Type | Trigger | Typical Delay | Database Update |
|------------|---------|---------------|-----------------|
| `email.sent` | Email accepted by Resend | Immediate | `EmailEvent` created |
| `email.delivered` | Email delivered to inbox | 1-30 seconds | `deliveredAt` updated |
| `email.opened` | Recipient opens email | Real-time | `openedAt` updated, count incremented |
| `email.clicked` | Recipient clicks link | Real-time | `clickedAt` updated, URL logged |
| `email.bounced` | Email bounced | 1-60 seconds | Suppression list updated |
| `email.complained` | Spam complaint | Real-time | Suppression list updated, unsubscribed |
| `email.delivery_delayed` | Temporary failure | 5-30 minutes | Status updated to deferred |

### Webhook Processing Flow

```
┌─────────────┐
│   Resend    │
│   Webhook   │
└──────┬──────┘
       │ HTTP POST with signature
       ▼
┌─────────────┐
│  Backend    │
│  Webhook    │
│  Endpoint   │
└──────┬──────┘
       │ 1. Verify signature
       │ 2. Parse event
       │ 3. Update database
       │ 4. Enqueue background job
       ▼
┌─────────────┐
│   BullMQ    │
│ Background  │
│    Job      │
└──────┬──────┘
       │ 5. Process bounce/complaint
       │ 6. Update suppression list
       │ 7. Calculate engagement score
       │ 8. Send alerts if needed
       ▼
┌─────────────┐
│  Database   │
│  (Updated)  │
└─────────────┘
```

### Frontend Integration for Real-Time Updates

Since webhooks are processed in the background, the frontend needs to poll or use other methods to get updated email status.

#### Option 1: Polling (Recommended for Admin Dashboard)

```typescript
/**
 * Poll email delivery status
 */
function useEmailStatus(messageId: string) {
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    async function fetchStatus() {
      try {
        const result = await fetch(`/api/email/status/${messageId}`);
        const data = await result.json();
        setStatus(data);
        
        // Stop polling if email reached terminal state
        if (['delivered', 'bounced', 'complained'].includes(data.status)) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Failed to fetch email status:', error);
      } finally {
        setLoading(false);
      }
    }
    
    // Initial fetch
    fetchStatus();
    
    // Poll every 5 seconds for 2 minutes, then every 30 seconds
    interval = setInterval(fetchStatus, 5000);
    setTimeout(() => {
      clearInterval(interval);
      interval = setInterval(fetchStatus, 30000);
    }, 120000);
    
    return () => clearInterval(interval);
  }, [messageId]);
  
  return { status, loading };
}
```

#### Option 2: Database Queries (Recommended for User-Facing Pages)

```typescript
/**
 * Query email events for a user
 */
function useUserEmailEvents(userId: string) {
  return useQuery({
    queryKey: ['emailEvents', userId],
    queryFn: async () => {
      const events = await prisma.emailEvent.findMany({
        where: { userId },
        orderBy: { sentAt: 'desc' },
        take: 50,
      });
      return events;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
```

#### Option 3: Server-Sent Events (Future Enhancement)

```typescript
/**
 * Subscribe to real-time email events (future)
 */
function useRealtimeEmailEvents(userId: string) {
  const [events, setEvents] = useState<EmailEvent[]>([]);
  
  useEffect(() => {
    const eventSource = new EventSource(`/api/email/events/stream?userId=${userId}`);
    
    eventSource.addEventListener('email.sent', (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => [event, ...prev]);
    });
    
    eventSource.addEventListener('email.delivered', (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => 
        prev.map(ev => ev.messageId === event.messageId ? event : ev)
      );
    });
    
    return () => eventSource.close();
  }, [userId]);
  
  return events;
}
```

### Webhook Event Processing Latency

Expected latency for webhook event processing:

| Event Type | Resend → Backend | Backend Processing | Total Latency |
|------------|------------------|-------------------|---------------|
| `email.sent` | < 1 second | < 100ms | ~1 second |
| `email.delivered` | 1-30 seconds | < 100ms | 1-30 seconds |
| `email.opened` | Real-time | < 100ms | < 1 second |
| `email.clicked` | Real-time | < 100ms | < 1 second |
| `email.bounced` | 1-60 seconds | < 500ms | 1-60 seconds |
| `email.complained` | Real-time | < 500ms | < 1 second |

**Notes:**
- Bounces may take longer to process due to suppression list updates
- Background jobs (engagement scoring, alerts) run asynchronously
- Frontend should show "Processing..." state for 1-2 minutes after send

---

## Email Templates

### Template System Overview

Email templates are built using **React Email** components, providing:
- Type-safe variable injection
- Component reusability
- Preview in development
- Automatic HTML/text rendering

### Template Structure

```tsx
// emails/templates/WelcomeEmail.tsx
import { 
  Body, 
  Container, 
  Head, 
  Heading, 
  Html, 
  Img, 
  Link, 
  Preview, 
  Section, 
  Text 
} from '@react-email/components';

interface WelcomeEmailProps {
  firstName: string;
  email: string;
  activationLink: string;
}

export default function WelcomeEmail({
  firstName,
  email,
  activationLink
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to YES GODDESS - Activate your account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src="https://yesgoddess.agency/logo.png"
            width="150"
            height="50"
            alt="YES GODDESS"
            style={logo}
          />
          <Heading style={h1}>Welcome to YES GODDESS, {firstName}!</Heading>
          
          <Text style={text}>
            We're excited to have you join our community of creators and brands.
            Your account has been created with email <strong>{email}</strong>.
          </Text>
          
          <Section style={buttonContainer}>
            <Link href={activationLink} style={button}>
              Activate Your Account
            </Link>
          </Section>
          
          <Text style={text}>
            This link will expire in 24 hours. If you didn't create this account,
            you can safely ignore this email.
          </Text>
          
          <Text style={footer}>
            © 2025 YES GODDESS. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const logo = {
  margin: '0 auto',
};

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
};

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const,
  margin: '16px 0',
};

const button = {
  backgroundColor: '#ec4899',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const footer = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '48px',
};
```

### Available Templates

| Template ID | Purpose | Required Variables | Category |
|-------------|---------|-------------------|----------|
| `welcome-email` | New user registration | `firstName`, `email`, `activationLink` | Transactional |
| `password-reset` | Password reset request | `firstName`, `resetLink` | Transactional |
| `email-verification` | Email address verification | `verificationLink` | Transactional |
| `project-invitation` | Brand invites creator | `firstName`, `brandName`, `projectName`, `invitationLink` | Notification |
| `license-expiry-reminder` | License expiring soon | `firstName`, `licenseName`, `expiryDate`, `renewLink` | Notification |
| `payout-notification` | Payout processed | `firstName`, `amount`, `payoutDate`, `dashboardLink` | Notification |
| `message-notification` | New message received | `firstName`, `senderName`, `messagePreview`, `messageLink` | Notification |
| `monthly-newsletter` | Monthly updates | `firstName`, `contentBlocks[]` | Marketing |

### Using Templates in Backend

```typescript
import { renderTemplate } from '@/lib/services/email/template-registry';
import { emailService } from '@/lib/services/email/email.service';

// Send welcome email
await emailService.sendTransactional({
  userId: user.id,
  email: user.email,
  subject: 'Welcome to YES GODDESS',
  template: 'welcome-email',
  variables: {
    firstName: user.firstName,
    email: user.email,
    activationLink: `https://yesgoddess.agency/activate/${token}`
  },
  tags: {
    category: 'transactional',
    template: 'welcome-email'
  }
});
```

### Template Testing

```typescript
// emails/preview.tsx
import WelcomeEmail from './templates/WelcomeEmail';

export function WelcomeEmailPreview() {
  return (
    <WelcomeEmail
      firstName="Jane"
      email="jane@example.com"
      activationLink="https://yesgoddess.agency/activate/abc123"
    />
  );
}

// Run preview server
// npm run email:dev
// Open http://localhost:3000
```

---

## Frontend Implementation Checklist

### Phase 1: Understanding & Setup

- [ ] **Review this integration guide completely**
- [ ] **Understand webhook flow** - Resend → Backend → Database → Frontend polling
- [ ] **Review email types** - Transactional (automatic) vs. user-initiated
- [ ] **Set up API client** - No direct frontend calls to Resend (backend handles all)

### Phase 2: Email Status Tracking (Admin Dashboard)

- [ ] **Create email events list component**
  - Display sent, delivered, opened, clicked, bounced, complained
  - Filter by user, date range, event type
  - Real-time updates via polling (every 30 seconds)

- [ ] **Create email delivery status component**
  - Show message ID, recipient, subject, status
  - Timeline of events (sent → delivered → opened → clicked)
  - Engagement metrics (open rate, click rate)

- [ ] **Create suppression list viewer**
  - Display suppressed emails with reason
  - Filter by suppression reason (bounce, complaint, unsubscribe)
  - Admin action: manually add/remove from list

### Phase 3: User Email Preferences

- [ ] **Create email preferences page**
  - Toggle switches for each email category
  - Digest frequency selector (immediate, daily, weekly, never)
  - Global unsubscribe option (with confirmation)
  - Save preferences with validation

- [ ] **Create unsubscribe landing page**
  - Token-based unsubscribe (from email links)
  - Category-specific or global unsubscribe
  - Option to resubscribe
  - GDPR-compliant data export/deletion

- [ ] **Add preference indicators**
  - Show email preference status in user profile
  - Warning when sending to users who opted out
  - Tooltips explaining each category

### Phase 4: Error Handling

- [ ] **Implement error handling for all email operations**
  - Show user-friendly messages for common errors
  - Handle suppression errors gracefully
  - Display rate limit errors with retry countdown
  - Log errors for admin review

- [ ] **Create error toast/notification component**
  - Different styles for error types (warning, error, info)
  - Auto-dismiss for non-critical errors
  - Persist critical errors until acknowledged

### Phase 5: Rate Limiting Display

- [ ] **Create email quota widget**
  - Show remaining emails this hour
  - Progress bar with color coding (green → yellow → red)
  - Countdown timer to quota reset
  - Display on pages where users can trigger emails

- [ ] **Handle rate limit errors**
  - Disable send buttons when limit reached
  - Show "Limit reached" message with reset time
  - Auto-enable when limit resets

### Phase 6: Admin Campaign Management (If Applicable)

- [ ] **Create campaign list page**
  - Display all campaigns with status
  - Filter by status (draft, scheduled, sending, completed)
  - Sort by created date, send date
  - Pagination for large lists

- [ ] **Create campaign detail page**
  - Campaign info (name, description, status)
  - Recipient list with individual status
  - Real-time progress during sending
  - Analytics (delivery rate, open rate, click rate, bounce rate)

- [ ] **Create campaign creation form**
  - Template selector
  - Subject line input with variable support
  - Segment criteria builder
  - Schedule date/time picker
  - Rate limit configuration
  - Send test email before launching

### Phase 7: Testing & Edge Cases

- [ ] **Test email status polling**
  - Verify polling stops after terminal state
  - Test with slow-loading emails
  - Handle webhook processing delays

- [ ] **Test error scenarios**
  - Suppressed email addresses
  - Rate limit exceeded
  - Invalid email addresses
  - Template rendering errors
  - Provider downtime

- [ ] **Test user preferences**
  - Verify preference changes save correctly
  - Test unsubscribe flow end-to-end
  - Test resubscribe flow
  - Verify global unsubscribe blocks all categories

- [ ] **Test edge cases**
  - User with no email address
  - User with multiple email addresses (if applicable)
  - Emails sent while user is unsubscribed
  - Webhooks received out of order

### Phase 8: UI/UX Considerations

- [ ] **Email status indicators**
  - Use clear icons (✓ delivered, ✉ opened, 🔗 clicked, ⚠ bounced, 🚫 complained)
  - Color coding (green = success, yellow = pending, red = failed)
  - Tooltips with detailed info

- [ ] **Loading states**
  - Show spinner while checking email status
  - Skeleton loaders for email lists
  - Progress bars for bulk operations

- [ ] **Empty states**
  - "No emails sent yet" with helpful message
  - "No events for this email" when status is unknown
  - "Suppression list empty" with explanation

- [ ] **Confirmation dialogs**
  - Confirm before global unsubscribe
  - Confirm before deleting email data (GDPR)
  - Confirm before adding to suppression list (admin)

### Phase 9: Accessibility

- [ ] **Keyboard navigation**
  - Tab through email preferences toggles
  - Keyboard shortcuts for admin actions
  - Focus management in modals

- [ ] **Screen reader support**
  - ARIA labels for email status icons
  - Announcements for email sent/failed
  - Descriptive button labels

- [ ] **Color contrast**
  - Ensure status colors meet WCAG AA standards
  - Don't rely solely on color for status indication

### Phase 10: Performance Optimization

- [ ] **Optimize polling frequency**
  - Start with 5-second interval, increase to 30 seconds after 2 minutes
  - Stop polling after terminal state reached
  - Use `visibilitychange` to pause polling when tab hidden

- [ ] **Implement caching**
  - Cache email preferences in React Query
  - Cache suppression list (admin only)
  - Invalidate cache on mutations

- [ ] **Lazy load email lists**
  - Implement virtual scrolling for large lists
  - Pagination for email events
  - On-demand loading for email analytics

---

## Additional Resources

### Backend Files

- **Resend Adapter**: `src/lib/adapters/email/resend-adapter.ts`
- **Email Service**: `src/lib/services/email/email.service.ts`
- **Webhook Handler**: `src/app/api/webhooks/resend/route.ts`
- **Validators**: `src/lib/validators/email.validators.ts`
- **Rate Limiting**: `src/lib/middleware/email-rate-limit.ts`
- **Error Definitions**: `src/lib/services/email/errors.ts`
- **Type Definitions**: `src/lib/adapters/email/types.ts`

### Documentation

- **Email Adapter Integration Guide**: `docs/frontend-integration/EMAIL_ADAPTER_INTEGRATION_GUIDE.md`
- **Email Events Implementation**: `docs/infrastructure/email/EMAIL_EVENTS_IMPLEMENTATION.md`
- **Transactional Email Guide**: `docs/infrastructure/email/TRANSACTIONAL_EMAIL_GUIDE.md`

### External Resources

- **Resend Documentation**: https://resend.com/docs
- **React Email Documentation**: https://react.email/docs
- **Webhook Best Practices**: https://resend.com/docs/webhooks

---

## Support & Questions

For questions or issues with this integration:

1. **Check error logs** - All email errors are logged with context
2. **Review webhook events** - Check database for event processing
3. **Test with Resend dashboard** - Use test mode to verify behavior
4. **Contact backend team** - For API changes or new features

---

**Last Updated**: October 13, 2025  
**Version**: 1.0.0  
**Backend Version**: Compatible with `yg-backend@main`
