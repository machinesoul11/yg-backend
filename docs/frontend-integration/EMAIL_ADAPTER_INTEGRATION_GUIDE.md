# Email Adapter Interface - Frontend Integration Guide

## 🌐 Classification: SHARED
> Used by both public-facing website (client portal) and admin backend

## Table of Contents
1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Email Templates](#email-templates)
10. [Email Events & Tracking](#email-events--tracking)
11. [Email Preferences & Unsubscribe](#email-preferences--unsubscribe)
12. [Webhook Integration](#webhook-integration)
13. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Email Adapter Interface provides a unified abstraction layer for email operations across the YES GODDESS platform. It supports:

- **Transactional Emails**: Individual emails (verification, password resets, notifications)
- **Bulk Campaigns**: Marketing and announcement emails with segmentation
- **Email Templates**: React Email components with type-safe variable injection
- **Delivery Tracking**: Open, click, bounce, complaint tracking via webhooks
- **Suppression Management**: Bounce and complaint-based email blocking
- **User Preferences**: Granular opt-in/opt-out controls per category
- **Email Provider Abstraction**: Currently uses Resend, switchable to other providers

> **Note**: The email service uses **tRPC** for campaign management endpoints and **REST API** for webhook callbacks. This guide covers both interfaces.

---

## API Endpoints

### Base URLs
- **Admin Backend (ops)**: `https://ops.yesgoddess.agency`
- **tRPC Endpoint**: `https://ops.yesgoddess.agency/api/trpc`
- **Webhook Endpoint**: `https://ops.yesgoddess.agency/api/webhooks/resend`

### tRPC Procedures (Email Campaigns)

All campaign-related operations use tRPC. The procedures are available under the `emailCampaigns` router.

#### Campaign Management

| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `emailCampaigns.create` | mutation | Admin Only | Create a new email campaign |
| `emailCampaigns.update` | mutation | Admin Only | Update campaign details |
| `emailCampaigns.schedule` | mutation | Admin Only | Schedule campaign for sending |
| `emailCampaigns.cancel` | mutation | Admin Only | Cancel a scheduled/running campaign |
| `emailCampaigns.sendTest` | mutation | Admin Only | Send test emails before launching |
| `emailCampaigns.get` | query | Admin Only | Get campaign details |
| `emailCampaigns.list` | query | Admin Only | List all campaigns with filters |
| `emailCampaigns.analytics` | query | Admin Only | Get campaign performance metrics |
| `emailCampaigns.recipients` | query | Admin Only | List campaign recipients with status |

#### User Preferences (Shared)

| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `emailCampaigns.getMyPreferences` | query | All Users | Get current user's email preferences |
| `emailCampaigns.updateMyPreferences` | mutation | All Users | Update email preferences |
| `emailCampaigns.generateUnsubscribeToken` | mutation | All Users | Generate one-time unsubscribe token |
| `emailCampaigns.verifyUnsubscribeToken` | query | All Users | Verify unsubscribe token validity |
| `emailCampaigns.unsubscribe` | mutation | All Users | Global or category unsubscribe |
| `emailCampaigns.resubscribe` | mutation | All Users | Resubscribe to emails |
| `emailCampaigns.exportMyEmailData` | query | All Users | Export email data (GDPR) |
| `emailCampaigns.deleteMyEmailData` | mutation | All Users | Delete email data (GDPR) |

### REST API Endpoints (Webhooks)

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/webhooks/resend` | POST | Public (Signed) | Resend webhook receiver for email events |

---

## TypeScript Type Definitions

### Core Email Types

```typescript
// Email Provider Interface (for reference)
export interface IEmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult>;
  sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus | null>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean>;
  parseWebhookEvent(rawPayload: any): WebhookEvent;
}

// Send Single Email
export interface SendEmailParams {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from?: string;
  replyTo?: string | string[];
  subject: string;
  react?: React.ReactElement;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  scheduledAt?: Date;
  priority?: 'high' | 'normal' | 'low';
}

export interface SendEmailResult {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  timestamp: Date;
  error?: string;
  errorCode?: string;
  providerMetadata?: Record<string, any>;
}

// Bulk Email Sending
export interface SendBulkEmailParams {
  recipients: Array<{
    email: string;
    name?: string;
    variables?: Record<string, any>;
    metadata?: Record<string, any>;
  }>;
  template: string;
  from?: string;
  subject: string;
  tags?: Record<string, string>;
  defaultVariables?: Record<string, any>;
  batchSize?: number;
  batchDelay?: number;
  onProgress?: (progress: BulkSendProgress) => void;
}

export interface BulkSendProgress {
  total: number;
  sent: number;
  failed: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
}

export interface SendBulkResult {
  total: number;
  queued: number;
  failed: number;
  durationMs: number;
  messageIds: string[];
  errors?: Array<{
    email: string;
    error: string;
    errorCode?: string;
    retryable: boolean;
  }>;
  rateLimitInfo?: {
    delaysEncountered: number;
    totalDelayMs: number;
  };
}

// Email Attachments
export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  cid?: string; // For inline images
}

// Delivery Status & Tracking
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

// Bounce Information
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

// Complaint Information
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

// Webhook Events
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
  | 'email.deferred'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'
  | 'email.unsubscribed'
  | 'email.failed';
```

### Campaign Types (tRPC)

```typescript
// Email Campaign Schema
export interface CreateCampaignInput {
  name: string;
  description?: string;
  templateId: string;
  subject: string;
  previewText?: string;
  segmentCriteria?: SegmentCriteria;
  scheduledSendTime?: Date;
  timezone?: string; // Default: 'UTC'
  messagesPerHour?: number; // Default: 1000, max: 10000
  batchSize?: number; // Default: 100, max: 1000
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface SegmentCriteria {
  role?: Array<'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER'>;
  verificationStatus?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  hasEmailPreference?: Record<string, boolean>;
  creatorSpecialties?: string[];
  brandIndustries?: string[];
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  subject?: string;
  previewText?: string;
  segmentCriteria?: SegmentCriteria;
  scheduledSendTime?: Date;
  timezone?: string;
  messagesPerHour?: number;
  batchSize?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  templateId: string;
  subject: string;
  previewText?: string;
  segmentCriteria?: SegmentCriteria;
  scheduledSendTime?: Date;
  actualSendTime?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  messagesPerHour: number;
  batchSize: number;
  tags?: string[];
  metadata?: Record<string, any>;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    recipients: number;
  };
}

export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  userId: string;
  email: string;
  status: RecipientStatus;
  messageId?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bouncedAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  variables?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type RecipientStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'FAILED'
  | 'UNSUBSCRIBED'
  | 'COMPLAINED';

export interface CampaignAnalytics {
  campaignId: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  unsubscribed: number;
  deliveryRate: number; // %
  openRate: number; // %
  clickRate: number; // %
  clickThroughRate: number; // %
  bounceRate: number; // %
  complaintRate: number; // %
}
```

### Email Preferences Types

```typescript
export interface EmailPreferences {
  id: string;
  userId: string;
  royaltyStatements: boolean;
  licenseExpiry: boolean;
  projectInvitations: boolean;
  messages: boolean;
  payouts: boolean;
  digestFrequency: DigestFrequency;
  newsletters: boolean;
  announcements: boolean;
  unsubscribedAt?: Date;
  globalUnsubscribe: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference: 'immediate' | 'daily' | 'weekly';
  unsubscribeToken?: string;
  preferenceCenterLastVisited?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DigestFrequency = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';

export interface UpdateEmailPreferencesInput {
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  digestFrequency?: DigestFrequency;
  newsletters?: boolean;
  announcements?: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: 'immediate' | 'daily' | 'weekly';
}

export interface UnsubscribeInput {
  email: string;
  campaignId?: string;
  categories?: string[];
  reason?: string;
  userAgent?: string;
  ipAddress?: string;
}
```

### Suppression List Types

```typescript
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

---

## Request/Response Examples

### 1. Create Email Campaign (Admin)

```typescript
// tRPC mutation
const result = await trpc.emailCampaigns.create.mutate({
  name: "Spring 2025 Creator Spotlight",
  description: "Monthly newsletter featuring top creators",
  templateId: "monthly-newsletter",
  subject: "This Month on YES GODDESS — Spring 2025",
  previewText: "Discover new opportunities and platform updates",
  segmentCriteria: {
    role: ['CREATOR'],
    verificationStatus: ['APPROVED'],
    lastLoginAfter: new Date('2025-01-01')
  },
  scheduledSendTime: new Date('2025-04-01T10:00:00Z'),
  timezone: 'America/New_York',
  messagesPerHour: 500,
  batchSize: 50,
  tags: ['newsletter', 'spring-2025']
});
```

**Response:**
```json
{
  "id": "cm3abc123xyz",
  "name": "Spring 2025 Creator Spotlight",
  "status": "DRAFT",
  "createdAt": "2025-03-15T14:23:45Z",
  "_count": {
    "recipients": 1247
  }
}
```

### 2. Send Test Email (Admin)

```typescript
const result = await trpc.emailCampaigns.sendTest.mutate({
  id: "cm3abc123xyz",
  testEmails: [
    "admin@yesgoddess.agency",
    "marketing@yesgoddess.agency"
  ]
});
```

**Response:**
```json
{
  "success": true,
  "sent": 2,
  "messageIds": ["re_abc123", "re_def456"]
}
```

### 3. Schedule Campaign (Admin)

```typescript
const result = await trpc.emailCampaigns.schedule.mutate({
  id: "cm3abc123xyz"
});
```

**Response:**
```json
{
  "id": "cm3abc123xyz",
  "status": "SCHEDULED",
  "scheduledSendTime": "2025-04-01T14:00:00Z",
  "estimatedCompletion": "2025-04-01T16:30:00Z"
}
```

### 4. Get Campaign Analytics (Admin)

```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: "cm3abc123xyz"
});
```

**Response:**
```json
{
  "campaignId": "cm3abc123xyz",
  "totalRecipients": 1247,
  "sent": 1247,
  "delivered": 1238,
  "opened": 847,
  "clicked": 312,
  "bounced": 9,
  "complained": 2,
  "failed": 0,
  "unsubscribed": 5,
  "deliveryRate": 99.28,
  "openRate": 68.42,
  "clickRate": 25.22,
  "clickThroughRate": 36.84,
  "bounceRate": 0.72,
  "complaintRate": 0.16
}
```

### 5. List Campaigns with Filters (Admin)

```typescript
const result = await trpc.emailCampaigns.list.query({
  status: 'COMPLETED',
  limit: 20,
  cursor: undefined
});
```

**Response:**
```json
{
  "campaigns": [
    {
      "id": "cm3abc123xyz",
      "name": "Spring 2025 Creator Spotlight",
      "status": "COMPLETED",
      "subject": "This Month on YES GODDESS — Spring 2025",
      "scheduledSendTime": "2025-04-01T14:00:00Z",
      "completedAt": "2025-04-01T16:28:33Z",
      "_count": {
        "recipients": 1247
      },
      "createdAt": "2025-03-15T14:23:45Z"
    }
  ],
  "nextCursor": "2025-03-14T10:15:22Z"
}
```

### 6. Get User Email Preferences (Shared)

```typescript
const preferences = await trpc.emailCampaigns.getMyPreferences.query();
```

**Response:**
```json
{
  "id": "cm3pref123",
  "userId": "cm3user456",
  "royaltyStatements": true,
  "licenseExpiry": true,
  "projectInvitations": true,
  "messages": true,
  "payouts": true,
  "digestFrequency": "DAILY",
  "newsletters": true,
  "announcements": false,
  "globalUnsubscribe": false,
  "categoryPreferences": {
    "marketing": true,
    "product_updates": true,
    "tips_and_tricks": false
  },
  "frequencyPreference": "daily",
  "preferenceCenterLastVisited": "2025-03-10T08:15:00Z",
  "createdAt": "2025-01-15T12:00:00Z",
  "updatedAt": "2025-03-10T08:15:22Z"
}
```

### 7. Update Email Preferences (Shared)

```typescript
const result = await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: false,
  digestFrequency: 'WEEKLY',
  categoryPreferences: {
    marketing: false
  }
});
```

**Response:**
```json
{
  "success": true,
  "preferences": {
    "newsletters": false,
    "digestFrequency": "WEEKLY",
    "categoryPreferences": {
      "marketing": false,
      "product_updates": true,
      "tips_and_tricks": false
    }
  }
}
```

### 8. Global Unsubscribe (Shared)

```typescript
const result = await trpc.emailCampaigns.unsubscribe.mutate({
  email: "user@example.com",
  reason: "Too many emails",
  userAgent: navigator.userAgent,
  ipAddress: "203.0.113.45"
});
```

**Response:**
```json
{
  "success": true,
  "message": "You have been unsubscribed from all emails",
  "unsubscribedAt": "2025-03-20T10:30:00Z"
}
```

### 9. Export Email Data (GDPR)

```typescript
const data = await trpc.emailCampaigns.exportMyEmailData.query();
```

**Response:**
```json
{
  "user": {
    "email": "user@example.com",
    "preferences": { /* preferences object */ }
  },
  "emailEvents": [
    {
      "messageId": "re_abc123",
      "eventType": "SENT",
      "subject": "Welcome to YES GODDESS",
      "sentAt": "2025-01-15T12:00:00Z"
    }
  ],
  "campaignRecipients": [
    {
      "campaignName": "Spring Newsletter",
      "status": "OPENED",
      "sentAt": "2025-03-01T10:00:00Z"
    }
  ],
  "suppressions": [],
  "exportedAt": "2025-03-20T14:30:00Z"
}
```

### 10. Webhook Event (Resend → Backend)

**Request:**
```http
POST /api/webhooks/resend
Content-Type: application/json
svix-signature: v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=

{
  "type": "email.delivered",
  "created_at": "2025-03-20T10:30:45.123Z",
  "data": {
    "email_id": "re_abc123",
    "message_id": "re_abc123",
    "to": "user@example.com",
    "subject": "Welcome to YES GODDESS",
    "created_at": "2025-03-20T10:30:45.123Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Event processed"
}
```

---

## Business Logic & Validation Rules

### 1. Email Address Validation

```typescript
// Zod schema used in backend
const emailAddressSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();
```

**Frontend validation:**
- Must be valid email format
- Automatically converted to lowercase
- Whitespace trimmed
- Max length: 255 characters

### 2. Campaign Creation Rules

**Validation:**
- `name`: Required, 1-255 characters
- `subject`: Required, 1-500 characters
- `previewText`: Optional, max 200 characters
- `templateId`: Must reference existing template (see [Email Templates](#email-templates))
- `messagesPerHour`: Min 1, max 10,000 (default: 1000)
- `batchSize`: Min 1, max 1,000 (default: 100)
- `scheduledSendTime`: Must be in the future (if provided)

**Business Rules:**
- Campaigns in `DRAFT` status can be edited
- Campaigns in `SCHEDULED` status can be cancelled
- Campaigns in `SENDING` status **cannot** be edited or cancelled
- Test emails can only be sent from `DRAFT` campaigns
- Maximum 10 test email addresses per test send

### 3. Email Suppression Rules

**Automatic Suppression:**
- **Hard Bounce**: Email added to suppression list immediately
- **Complaint/Spam Report**: Email added to suppression list immediately
- **Soft Bounce**: After 3 consecutive soft bounces, email suppressed

**Suppressed emails:**
- Cannot receive any emails (transactional or marketing)
- Must be manually removed by admin
- Suppression status cached for 24 hours in Redis

### 4. Email Preference Enforcement

**Category Mapping:**
| Template | Category | Respect Preferences |
|----------|----------|---------------------|
| `welcome-email` | `system` | ❌ No (always send) |
| `email-verification` | `system` | ❌ No (always send) |
| `password-reset` | `system` | ❌ No (always send) |
| `password-changed` | `system` | ❌ No (always send) |
| `royalty-statement` | `royaltyStatements` | ✅ Yes |
| `license-expiry` | `licenseExpiry` | ✅ Yes |
| `project-invitation` | `projectInvitations` | ✅ Yes |
| `new-message` | `messages` | ✅ Yes |
| `payout-confirmation` | `payouts` | ✅ Yes |
| `monthly-newsletter` | `newsletters` | ✅ Yes |
| `announcements` | `announcements` | ✅ Yes |

**Digest Mode:**
- If `digestFrequency` is `DAILY` or `WEEKLY`, message notifications are batched
- Digest sent at 8 AM user's local time
- If `digestFrequency` is `IMMEDIATE`, emails sent in real-time
- If `digestFrequency` is `NEVER`, no digest emails sent

**Global Unsubscribe:**
- If `globalUnsubscribe` is `true`, user receives **no marketing emails**
- System emails (verification, password reset) still sent
- User can re-subscribe via preference center

### 5. Rate Limiting

**Transactional Emails:**
- 50 emails per hour per user
- Rate limit enforced via Redis
- Resets every hour

**Campaigns:**
- 10 campaigns per day per admin user
- Limit prevents spam/abuse

**Campaign Sending:**
- Respects `messagesPerHour` setting per campaign
- Default: 1000 emails/hour
- Batched into groups of `batchSize` (default: 100)

---

## Error Handling

### Error Response Format

All tRPC errors follow this structure:

```typescript
{
  "error": {
    "code": "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
    "message": "Human-readable error message",
    "data": {
      "zodError": { /* Zod validation errors if applicable */ }
    }
  }
}
```

### Error Codes & Meanings

| Code | HTTP Status | When It Occurs | User-Facing Message |
|------|-------------|----------------|---------------------|
| `UNAUTHORIZED` | 401 | User not logged in | "Please log in to continue" |
| `FORBIDDEN` | 403 | User lacks permission | "You don't have permission to perform this action" |
| `NOT_FOUND` | 404 | Campaign/resource not found | "Campaign not found" |
| `BAD_REQUEST` | 400 | Validation failed | Show specific field errors from `zodError` |
| `PRECONDITION_FAILED` | 412 | Business rule violation | "Cannot edit campaign that is already sending" |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded | "Rate limit exceeded. Try again in {resetAt}" |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | "Something went wrong. Please try again" |

### Specific Error Scenarios

#### 1. Email Suppression Error

```typescript
{
  "success": false,
  "error": "Email address user@example.com is suppressed due to hard bounce"
}
```

**Frontend Handling:**
- Show inline error: "This email address cannot receive emails due to delivery issues"
- Suggest verifying email address

#### 2. Email Preference Error

```typescript
{
  "success": false,
  "error": "User opted out of this email category"
}
```

**Frontend Handling:**
- This is expected behavior
- Don't show error to user (silent failure)
- Log for analytics

#### 3. Rate Limit Error

```typescript
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded",
    "data": {
      "remaining": 0,
      "resetAt": "2025-03-20T11:00:00Z"
    }
  }
}
```

**Frontend Handling:**
- Show toast: "You've sent too many emails. Try again in {timeUntil}"
- Disable send button until `resetAt`

#### 4. Campaign Validation Error

```typescript
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "data": {
      "zodError": {
        "fieldErrors": {
          "subject": ["String must contain at least 1 character(s)"],
          "messagesPerHour": ["Number must be less than or equal to 10000"]
        }
      }
    }
  }
}
```

**Frontend Handling:**
- Show field-level validation errors
- Highlight invalid fields in form

#### 5. Webhook Signature Verification Failed

```json
{
  "error": "Invalid signature",
  "status": 401
}
```

**Frontend Handling:**
- N/A (webhook endpoint, not user-facing)
- Log error for admin investigation

---

## Authorization & Permissions

### Role-Based Access Control

| Role | Campaign Management | Send Test Emails | View Analytics | Manage Own Preferences |
|------|---------------------|------------------|----------------|------------------------|
| **ADMIN** | ✅ Full Access | ✅ Yes | ✅ Yes | ✅ Yes |
| **CREATOR** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **BRAND** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **VIEWER** | ❌ No | ❌ No | ❌ No | ✅ Yes |

### Endpoint Access Matrix

| Procedure | ADMIN | CREATOR | BRAND | VIEWER |
|-----------|-------|---------|-------|--------|
| `emailCampaigns.create` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.update` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.schedule` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.cancel` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.sendTest` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.get` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.list` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.analytics` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.recipients` | ✅ | ❌ | ❌ | ❌ |
| `emailCampaigns.getMyPreferences` | ✅ | ✅ | ✅ | ✅ |
| `emailCampaigns.updateMyPreferences` | ✅ | ✅ | ✅ | ✅ |
| `emailCampaigns.unsubscribe` | ✅ | ✅ | ✅ | ✅ |
| `emailCampaigns.resubscribe` | ✅ | ✅ | ✅ | ✅ |
| `emailCampaigns.exportMyEmailData` | ✅ | ✅ | ✅ | ✅ |
| `emailCampaigns.deleteMyEmailData` | ✅ | ✅ | ✅ | ✅ |

### Authentication Requirements

All tRPC procedures require JWT authentication via `Authorization: Bearer <token>` header.

**Example:**
```typescript
const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers() {
        return {
          authorization: `Bearer ${getAuthToken()}`,
        };
      },
    }),
  ],
});
```

---

## Rate Limiting & Quotas

### Per-User Rate Limits

| Operation | Limit | Window | Header |
|-----------|-------|--------|--------|
| Transactional Email Send | 50 | 1 hour | N/A (internal) |
| Campaign Creation | 10 | 24 hours | N/A (internal) |

### Campaign-Level Throttling

Each campaign has configurable throttling:

```typescript
{
  messagesPerHour: 1000,  // Max 10,000
  batchSize: 100          // Max 1,000
}
```

**Calculation:**
- If campaign has 10,000 recipients
- At 1,000 emails/hour, 100 per batch
- Campaign completes in ~10 hours

### Resend Provider Limits

- **API Rate Limit**: 10 requests/second
- **Daily Send Limit**: Varies by plan (check Resend dashboard)
- **Batch Size**: 100 emails per API call (automatically chunked)

### Handling Rate Limits in Frontend

```typescript
try {
  await trpc.emailCampaigns.sendTest.mutate({ id, testEmails });
} catch (error) {
  if (error.data?.code === 'TOO_MANY_REQUESTS') {
    const resetAt = new Date(error.data.resetAt);
    const minutesUntilReset = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
    
    toast.error(`Rate limit exceeded. Try again in ${minutesUntilReset} minutes.`);
  }
}
```

---

## Email Templates

### Available Templates

All templates use **React Email** components with brand-compliant styling.

| Template ID | Description | Required Variables | Category |
|-------------|-------------|-------------------|----------|
| `welcome-email` | New user welcome | `userName`, `loginUrl?` | System |
| `email-verification` | Email verification link | `userName`, `verificationUrl`, `expiresInHours?` | System |
| `password-reset` | Password reset request | `userName`, `resetUrl`, `expiresInHours?` | System |
| `password-changed` | Password change confirmation | `userName`, `changeTime?`, `ipAddress?` | System |
| `royalty-statement` | Monthly royalty statement | `creatorName`, `periodStart`, `periodEnd`, `totalRoyalties`, `currency`, `statementUrl`, `lineItems?` | Royalties |
| `license-expiry` | License expiring notice | `licenseName`, `assetName`, `expiryDate`, `daysUntilExpiry`, `renewalUrl?` | Licenses |
| `payout-confirmation` | Payout processed | `creatorName`, `amount`, `currency`, `payoutMethod`, `estimatedArrival`, `transactionId` | Payouts |
| `project-invitation` | Project collaboration invite | `inviterName`, `projectName`, `projectDescription`, `acceptUrl`, `declineUrl` | Projects |
| `new-message` | New direct message | `senderName`, `messagePreview`, `messageUrl` | Messages |
| `message-digest` | Daily/weekly message digest | `recipientName`, `messages[]`, `viewAllUrl` | Messages |
| `monthly-newsletter` | Platform newsletter | `userName`, `month`, `year`, `highlights[]` | Marketing |
| `brand-welcome` | Brand onboarding | `brandName`, `primaryContactName`, `dashboardUrl` | System |
| `brand-verification-request` | Brand verification submitted | `brandName`, `submittedBy`, `submittedAt`, `reviewUrl` | Admin |
| `brand-verification-complete` | Brand verified | `brandName`, `verifiedAt`, `dashboardUrl` | System |
| `brand-verification-rejected` | Brand verification declined | `brandName`, `rejectionReason`, `resubmitUrl?` | System |
| `creator-welcome` | Creator onboarding | `creatorName`, `dashboardUrl` | System |
| `creator-verification-approved` | Creator application approved | `creatorName`, `approvedAt`, `nextSteps` | System |
| `creator-verification-rejected` | Creator application declined | `creatorName`, `rejectionReason`, `resubmitUrl?` | System |

### Template Variable Types

Templates are strongly typed. See `src/lib/services/email/template-registry.ts` for full type definitions.

**Example:**
```typescript
export interface RoyaltyStatementProps {
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
```

### Template Preview

Templates can be previewed in development:

```bash
npm run email:dev
```

Opens `http://localhost:3000` with live template preview.

---

## Email Events & Tracking

### Event Types

The system tracks the following email events via webhooks:

| Event Type | Description | Database Field Updated |
|------------|-------------|------------------------|
| `SENT` | Email accepted by Resend | `sentAt` |
| `DELIVERED` | Email delivered to recipient inbox | `deliveredAt` |
| `OPENED` | Recipient opened email (tracking pixel) | `openedAt` |
| `CLICKED` | Recipient clicked link in email | `clickedAt` |
| `BOUNCED` | Email bounced (hard or soft) | `bouncedAt`, added to suppression list |
| `COMPLAINED` | Recipient marked as spam | Added to suppression list |

### Querying Email Events

Email events are stored in the `EmailEvent` table:

```prisma
model EmailEvent {
  id           String         @id @default(cuid())
  userId       String?
  email        String
  eventType    EmailEventType
  messageId    String
  subject      String?
  templateName String?
  metadata     Json?
  sentAt       DateTime?
  deliveredAt  DateTime?
  openedAt     DateTime?
  clickedAt    DateTime?
  bouncedAt    DateTime?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

enum EmailEventType {
  SENT
  DELIVERED
  OPENED
  CLICKED
  BOUNCED
  COMPLAINED
}
```

### Frontend Usage: Track Email Opens

For user dashboards showing "Email Status":

```typescript
// Query email events for a specific user
const emailEvents = await prisma.emailEvent.findMany({
  where: { userId },
  orderBy: { sentAt: 'desc' },
  take: 10
});

// Display status
emailEvents.map(event => ({
  subject: event.subject,
  status: event.openedAt ? 'Opened' : event.deliveredAt ? 'Delivered' : 'Sent',
  sentAt: event.sentAt
}));
```

---

## Email Preferences & Unsubscribe

### Preference Center UI

**Location:** User Settings → Email Preferences

**Required Fields:**
- Toggle switches for each category (royaltyStatements, licenseExpiry, etc.)
- Digest frequency dropdown (Immediate, Daily, Weekly, Never)
- Global unsubscribe checkbox (with confirmation modal)

**Example Component:**

```tsx
import { trpc } from '@/lib/trpc';

export function EmailPreferences() {
  const { data: preferences, isLoading } = trpc.emailCampaigns.getMyPreferences.useQuery();
  const updatePreferences = trpc.emailCampaigns.updateMyPreferences.useMutation();

  const handleToggle = async (key: string, value: boolean) => {
    await updatePreferences.mutateAsync({ [key]: value });
    toast.success('Preferences updated');
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <h2>Email Preferences</h2>
      
      <Toggle
        checked={preferences.royaltyStatements}
        onChange={(v) => handleToggle('royaltyStatements', v)}
        label="Royalty Statements"
      />
      
      <Toggle
        checked={preferences.licenseExpiry}
        onChange={(v) => handleToggle('licenseExpiry', v)}
        label="License Expiry Notices"
      />
      
      <Select
        value={preferences.digestFrequency}
        onChange={(v) => handleToggle('digestFrequency', v)}
        options={['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER']}
        label="Message Digest Frequency"
      />
      
      <Button variant="destructive" onClick={handleGlobalUnsubscribe}>
        Unsubscribe from All Emails
      </Button>
    </div>
  );
}
```

### Unsubscribe Links

All marketing emails include an unsubscribe link in the footer.

**Link Format:**
```
https://yesgoddess.agency/unsubscribe?token={unsubscribeToken}
```

**Implementation:**

1. Generate token:
```typescript
const { token } = await trpc.emailCampaigns.generateUnsubscribeToken.mutate();
```

2. Verify and display unsubscribe page:
```typescript
const { valid, email } = await trpc.emailCampaigns.verifyUnsubscribeToken.query({ token });

if (valid) {
  // Show unsubscribe form
}
```

3. Process unsubscribe:
```typescript
await trpc.emailCampaigns.unsubscribe.mutate({
  email,
  reason: 'Too many emails',
  categories: ['newsletters'] // or omit for global unsubscribe
});
```

---

## Webhook Integration

### Webhook Endpoint

**URL:** `https://ops.yesgoddess.agency/api/webhooks/resend`  
**Method:** POST  
**Authentication:** Signature-based (Resend HMAC)

### Setting Up Webhooks (Admin)

1. **In Resend Dashboard:**
   - Go to Settings → Webhooks
   - Add webhook URL: `https://ops.yesgoddess.agency/api/webhooks/resend`
   - Select events: Delivered, Opened, Clicked, Bounced, Complained
   - Copy webhook secret

2. **In Backend `.env`:**
   ```bash
   RESEND_WEBHOOK_SECRET=whsec_abc123...
   ```

### Webhook Event Processing

Webhooks are processed asynchronously:

1. Webhook received → signature verified
2. Event queued for processing (BullMQ job)
3. Database updated (`EmailEvent`, `CampaignRecipient`)
4. Suppression list updated (if bounce/complaint)
5. Response sent to Resend

**Frontend doesn't interact with webhooks directly**, but benefits from real-time event updates in the database.

---

## Frontend Implementation Checklist

### Admin Dashboard (Email Campaigns)

#### Campaign List View
- [ ] Fetch campaigns with `emailCampaigns.list` query
- [ ] Display campaign cards with status badges (DRAFT, SCHEDULED, SENDING, COMPLETED, etc.)
- [ ] Show recipient count, open rate, click rate
- [ ] Filter by status (dropdown)
- [ ] Implement cursor-based pagination
- [ ] Add "Create Campaign" button

#### Campaign Creation Flow
- [ ] Multi-step form:
  - [ ] Step 1: Basic Info (name, description, template selection)
  - [ ] Step 2: Audience Segmentation (role, verification status, etc.)
  - [ ] Step 3: Schedule (send time, timezone, throttling)
  - [ ] Step 4: Review & Send Test
- [ ] Template preview (show selected template with sample data)
- [ ] Form validation using Zod schemas
- [ ] Handle errors (display field-level errors from `zodError`)
- [ ] Save as draft functionality
- [ ] Send test emails (with confirmation)
- [ ] Schedule campaign (with confirmation modal)

#### Campaign Detail View
- [ ] Fetch campaign with `emailCampaigns.get` query
- [ ] Display campaign metadata (name, status, schedule, etc.)
- [ ] Show analytics (delivered, opened, clicked, bounced)
- [ ] Display recipient list with `emailCampaigns.recipients` query
- [ ] Filter recipients by status (SENT, DELIVERED, OPENED, etc.)
- [ ] Implement pagination for recipients
- [ ] Edit campaign button (disabled if not DRAFT)
- [ ] Cancel campaign button (disabled if SENDING/COMPLETED)

#### Campaign Analytics Dashboard
- [ ] Fetch analytics with `emailCampaigns.analytics` query
- [ ] Display metrics:
  - [ ] Total recipients
  - [ ] Delivery rate (gauge chart)
  - [ ] Open rate (gauge chart)
  - [ ] Click-through rate (gauge chart)
  - [ ] Bounce rate (warning if >5%)
  - [ ] Complaint rate (warning if >0.1%)
- [ ] Timeline chart (sent, delivered, opened over time)
- [ ] Export analytics (CSV download)

### User Settings (Email Preferences)

#### Preference Center
- [ ] Fetch preferences with `emailCampaigns.getMyPreferences` query
- [ ] Toggle switches for each email category
- [ ] Digest frequency selector (Immediate, Daily, Weekly, Never)
- [ ] Custom category preferences (if applicable)
- [ ] Save button with optimistic updates
- [ ] Success/error toast notifications
- [ ] Last updated timestamp

#### Unsubscribe Flow
- [ ] Unsubscribe page at `/unsubscribe?token={token}`
- [ ] Verify token with `emailCampaigns.verifyUnsubscribeToken` query
- [ ] Display user email (read-only)
- [ ] Unsubscribe form:
  - [ ] Category-specific unsubscribe (checkboxes)
  - [ ] Global unsubscribe (checkbox with warning)
  - [ ] Optional reason textarea
- [ ] Confirm and submit with `emailCampaigns.unsubscribe` mutation
- [ ] Success page: "You've been unsubscribed"
- [ ] Link to resubscribe

#### GDPR Data Export
- [ ] "Export My Email Data" button in settings
- [ ] Call `emailCampaigns.exportMyEmailData` query
- [ ] Download JSON file with all email data
- [ ] Show export timestamp

#### GDPR Data Deletion
- [ ] "Delete My Email Data" button (destructive)
- [ ] Confirmation modal with warning
- [ ] Call `emailCampaigns.deleteMyEmailData` mutation
- [ ] Redirect to confirmation page

### Shared Components

#### Email Status Badge
```tsx
<Badge status={status}>
  {status === 'OPENED' ? 'Opened' : status === 'DELIVERED' ? 'Delivered' : 'Sent'}
</Badge>
```

#### Campaign Status Badge
```tsx
<Badge status={campaignStatus}>
  {campaignStatus}
</Badge>
```

#### Rate Limit Error Handler
```tsx
const handleRateLimit = (error: TRPCClientError) => {
  if (error.data?.code === 'TOO_MANY_REQUESTS') {
    const resetAt = new Date(error.data.resetAt);
    const minutesUntilReset = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
    
    toast.error(`Rate limit exceeded. Try again in ${minutesUntilReset} minutes.`);
    return true;
  }
  return false;
};
```

### Edge Cases to Handle

- [ ] User has no email preferences (create defaults)
- [ ] Campaign with 0 recipients (show warning)
- [ ] Campaign scheduled in the past (validation error)
- [ ] Template not found (show error)
- [ ] Webhook signature verification failed (log and alert admin)
- [ ] Email suppressed (show inline warning)
- [ ] Rate limit exceeded (show countdown timer)
- [ ] Network timeout (retry with exponential backoff)
- [ ] User navigates away during campaign creation (save draft)

### UX Considerations

- [ ] Loading states for all async operations
- [ ] Optimistic updates for preference toggles
- [ ] Confirmation modals for destructive actions (cancel campaign, global unsubscribe)
- [ ] Success toast notifications
- [ ] Error toast notifications with retry button
- [ ] Empty states (no campaigns, no recipients, no email events)
- [ ] Skeleton loaders for lists
- [ ] Tooltips explaining email categories
- [ ] Help text for complex fields (segmentation, throttling)
- [ ] Responsive design (mobile-friendly)

---

## Additional Resources

- **Email Templates Documentation**: `/emails/README.md`
- **Brand Guidelines**: `/docs/brand/guidelines.md`
- **Resend API Docs**: https://resend.com/docs
- **React Email Docs**: https://react.email/docs

---

## Support & Questions

For backend questions or issues:
- Check `/docs/frontend-integration/` for other module guides
- Review `/emails/IMPLEMENTATION_CHECKLIST.md` for template setup
- Contact backend team for clarification

---

**Last Updated:** March 20, 2025  
**Backend Version:** 1.0.0  
**Frontend Compatibility:** Next.js 15 + App Router + tRPC
