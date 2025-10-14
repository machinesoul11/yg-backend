# 🌐 Transactional Emails - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Module:** Transactional Email System  
**For:** yesgoddess-web (Next.js 15 Frontend)  
**Backend:** ops.yesgoddess.agency (yg-backend)

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Email Templates](#email-templates)
10. [Email Preferences](#email-preferences)
11. [Webhook Integration](#webhook-integration)
12. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The transactional email system handles all email communications for YES GODDESS, including:

- **System Emails**: Verification, password reset, welcome emails
- **Transactional Notifications**: Royalty statements, license expiry, payout confirmations
- **Campaign Emails**: Bulk marketing emails to segmented audiences (admin only)
- **Email Preferences**: User-controlled email category preferences
- **Suppression List**: Automatic bounce/complaint handling

**Key Features:**
- ✅ React Email templates with type-safe variables
- ✅ Automatic suppression list checking
- ✅ User preference enforcement
- ✅ Rate limiting protection
- ✅ Delivery tracking via webhooks
- ✅ GDPR compliance (export, delete, unsubscribe)

---

## API Endpoints

### 1. Email Preferences Management

All preference endpoints use **tRPC** under the `emailCampaigns` router.

#### Get User Preferences

**Endpoint:** `emailCampaigns.getMyPreferences`  
**Type:** Query  
**Auth:** Protected (authenticated users)  
**HTTP Method:** N/A (tRPC query)

**Input:** None

**Output:**
```typescript
{
  id: string;
  userId: string;
  royaltyStatements: boolean;
  licenseExpiry: boolean;
  projectInvitations: boolean;
  messages: boolean;
  payouts: boolean;
  digestFrequency: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';
  newsletters: boolean;
  announcements: boolean;
  unsubscribedAt: Date | null;
  globalUnsubscribe: boolean;
  categoryPreferences: Record<string, boolean> | null;
  frequencyPreference: string;
  preferenceCenterLastVisited: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

#### Update User Preferences

**Endpoint:** `emailCampaigns.updateMyPreferences`  
**Type:** Mutation  
**Auth:** Protected (authenticated users)

**Input:**
```typescript
{
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  digestFrequency?: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';
  newsletters?: boolean;
  announcements?: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: 'immediate' | 'daily' | 'weekly';
}
```

**Output:** Updated preferences object (same as getMyPreferences)

---

#### Unsubscribe (Global)

**Endpoint:** `emailCampaigns.unsubscribe`  
**Type:** Mutation  
**Auth:** Protected

**Input:**
```typescript
{
  email: string;
  campaignId?: string;
  categories?: string[];
  reason?: string;
  userAgent?: string;
  ipAddress?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

---

#### Resubscribe

**Endpoint:** `emailCampaigns.resubscribe`  
**Type:** Mutation  
**Auth:** Protected

**Input:** None

**Output:**
```typescript
{
  success: boolean;
}
```

---

### 2. GDPR Compliance

#### Export Email Data

**Endpoint:** `emailCampaigns.exportMyEmailData`  
**Type:** Query  
**Auth:** Protected

**Input:** None

**Output:**
```typescript
{
  personalInfo: {
    email: string;
    name: string | null;
  };
  preferences: EmailPreferences;
  recentEvents: Array<{
    id: string;
    eventType: EmailEventType;
    email: string;
    subject?: string;
    templateName?: string;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    bouncedAt?: Date;
  }>;
  unsubscribeHistory: Array<{
    unsubscribedAt: Date;
    action: string;
    source: string;
    categoriesAffected: string[];
  }>;
  scheduledEmails: Array<{
    emailType: string;
    scheduledSendTime: Date;
    status: string;
  }>;
}
```

---

#### Delete Email Data

**Endpoint:** `emailCampaigns.deleteMyEmailData`  
**Type:** Mutation  
**Auth:** Protected

**Input:** None

**Output:**
```typescript
{
  success: boolean;
}
```

**⚠️ Warning:** This action is irreversible. It anonymizes all email events and deletes preferences.

---

### 3. Email Campaign Management (Admin Only)

#### Create Campaign

**Endpoint:** `emailCampaigns.create`  
**Type:** Mutation  
**Auth:** Admin only

**Input:**
```typescript
{
  name: string;                    // 1-255 chars
  description?: string;
  templateId: string;              // Must be valid template key
  subject: string;                 // 1-500 chars
  previewText?: string;            // Max 200 chars
  segmentCriteria?: {
    role?: ('ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER')[];
    verificationStatus?: string[];
    createdAfter?: Date;
    createdBefore?: Date;
    lastLoginAfter?: Date;
    hasEmailPreference?: Record<string, boolean>;
    creatorSpecialties?: string[];
    brandIndustries?: string[];
  };
  scheduledSendTime?: Date;        // UTC
  timezone?: string;               // Default: 'UTC'
  messagesPerHour?: number;        // Default: 1000
  batchSize?: number;              // Default: 100
  tags?: string[];
  metadata?: Record<string, any>;
}
```

**Output:**
```typescript
{
  id: string;
  name: string;
  status: 'DRAFT';
  recipientCount: number;
  // ... full campaign object
}
```

---

#### List Campaigns

**Endpoint:** `emailCampaigns.list`  
**Type:** Query  
**Auth:** Admin only

**Input:**
```typescript
{
  status?: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  limit?: number;      // 1-100, default: 20
  cursor?: string;     // ISO date string for pagination
}
```

**Output:**
```typescript
{
  campaigns: Array<Campaign>;
  nextCursor?: string;
}
```

---

#### Get Campaign Details

**Endpoint:** `emailCampaigns.get`  
**Type:** Query  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
{
  id: string;
  name: string;
  description: string | null;
  status: EmailCampaignStatus;
  templateId: string;
  subject: string;
  previewText: string | null;
  segmentCriteria: any;
  recipientCount: number;
  scheduledSendTime: Date;
  timezone: string;
  sendStartedAt: Date | null;
  sendCompletedAt: Date | null;
  messagesPerHour: number;
  batchSize: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  complainedCount: number;
  failedCount: number;
  tags: string[];
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}
```

---

#### Schedule Campaign

**Endpoint:** `emailCampaigns.schedule`  
**Type:** Mutation  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
{
  id: string;
  status: 'SCHEDULED';
  recipientCount: number;
}
```

---

#### Cancel Campaign

**Endpoint:** `emailCampaigns.cancel`  
**Type:** Mutation  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
  reason?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

---

#### Send Test Emails

**Endpoint:** `emailCampaigns.sendTest`  
**Type:** Mutation  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
  testEmails: string[];  // 1-10 email addresses
}
```

**Output:**
```typescript
{
  success: boolean;
  sent: number;
  failed: number;
}
```

---

#### Get Campaign Analytics

**Endpoint:** `emailCampaigns.analytics`  
**Type:** Query  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
{
  counts: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    complained: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;   // percentage
    openRate: number;
    clickRate: number;
    clickToOpenRate: number;
    bounceRate: number;
    unsubscribeRate: number;
    complaintRate: number;
  };
  topLinks: Array<{
    url: string;
    clicks: number;
    uniqueClicks: number;
  }>;
  timeline: Array<{
    hour: string;
    sent: number;
    opened: number;
    clicked: number;
  }>;
}
```

---

#### Get Campaign Recipients

**Endpoint:** `emailCampaigns.recipients`  
**Type:** Query  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
  status?: CampaignRecipientStatus;  // Optional filter
  limit?: number;                    // 1-100, default: 50
  cursor?: string;                   // Pagination
}
```

**Output:**
```typescript
{
  recipients: Array<{
    id: string;
    campaignId: string;
    userId: string | null;
    email: string;
    status: CampaignRecipientStatus;
    sentAt: Date | null;
    deliveredAt: Date | null;
    openedAt: Date | null;
    firstClickedAt: Date | null;
    bouncedAt: Date | null;
    unsubscribedAt: Date | null;
    complainedAt: Date | null;
    errorMessage: string | null;
    retryCount: number;
    messageId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  nextCursor?: string;
}
```

---

### 4. Webhook Endpoint

**URL:** `POST /api/webhooks/resend`  
**Auth:** Webhook signature verification (Resend/Svix)  
**Public:** Yes (but signature-protected)

**Purpose:** Receives email events from Resend (delivery, opens, clicks, bounces, complaints)

**Headers Required:**
- `svix-signature` or `resend-signature`

**Payload:** Resend webhook event format

**Response:**
```typescript
{
  success: boolean;
  message?: string;
}
```

**Note:** This is handled automatically by the backend. Frontend does not interact with this endpoint.

---

## Request/Response Examples

### Example 1: Get User Email Preferences

```typescript
// Using tRPC client
const preferences = await trpc.emailCampaigns.getMyPreferences.query();

console.log(preferences);
// Output:
// {
//   id: 'clx123abc...',
//   userId: 'clxuser123...',
//   royaltyStatements: true,
//   licenseExpiry: true,
//   projectInvitations: true,
//   messages: true,
//   payouts: true,
//   digestFrequency: 'IMMEDIATE',
//   newsletters: true,
//   announcements: true,
//   unsubscribedAt: null,
//   globalUnsubscribe: false,
//   categoryPreferences: null,
//   frequencyPreference: 'immediate',
//   preferenceCenterLastVisited: '2025-10-13T10:30:00Z',
//   createdAt: '2025-01-01T00:00:00Z',
//   updatedAt: '2025-10-13T10:30:00Z'
// }
```

---

### Example 2: Update Email Preferences

```typescript
// Disable newsletters, set digest to weekly
const updated = await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: false,
  announcements: true,
  digestFrequency: 'WEEKLY',
  categoryPreferences: {
    productUpdates: true,
    promotions: false,
  },
});

console.log('Preferences updated:', updated);
```

---

### Example 3: Global Unsubscribe

```typescript
// Unsubscribe from all emails
await trpc.emailCampaigns.unsubscribe.mutate({
  email: 'user@example.com',
  reason: 'Too many emails',
  userAgent: navigator.userAgent,
  ipAddress: await getUserIpAddress(), // Fetch from API
});

// Show confirmation to user
alert('You have been unsubscribed from all emails.');
```

---

### Example 4: Create Email Campaign (Admin)

```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: 'Monthly Newsletter - October 2025',
  description: 'Platform updates and creator spotlights',
  templateId: 'monthly-newsletter',
  subject: 'October Updates from YES GODDESS',
  previewText: 'New features, creator spotlights, and more',
  segmentCriteria: {
    role: ['CREATOR', 'BRAND'],
    verificationStatus: ['VERIFIED'],
  },
  scheduledSendTime: new Date('2025-10-15T14:00:00Z'),
  timezone: 'America/New_York',
  messagesPerHour: 500,
  batchSize: 50,
  tags: ['newsletter', 'monthly', 'october'],
});

console.log('Campaign created:', campaign.id);
```

---

### Example 5: Send Test Emails (Admin)

```typescript
const result = await trpc.emailCampaigns.sendTest.mutate({
  id: 'campaign_clx123...',
  testEmails: [
    'admin@yesgoddess.com',
    'test@example.com',
  ],
});

console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
```

---

### Example 6: Get Campaign Analytics (Admin)

```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: 'campaign_clx123...',
});

console.log('Delivery Rate:', analytics.rates.deliveryRate + '%');
console.log('Open Rate:', analytics.rates.openRate + '%');
console.log('Click Rate:', analytics.rates.clickRate + '%');
console.log('\nTop Links:');
analytics.topLinks.forEach(link => {
  console.log(`  ${link.url}: ${link.clicks} clicks`);
});
```

---

### Example 7: Export Email Data (GDPR)

```typescript
const data = await trpc.emailCampaigns.exportMyEmailData.query();

console.log('Email:', data.personalInfo.email);
console.log('Total events:', data.recentEvents.length);
console.log('Preferences:', JSON.stringify(data.preferences, null, 2));

// Download as JSON file
const blob = new Blob([JSON.stringify(data, null, 2)], {
  type: 'application/json',
});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `email-data-${Date.now()}.json`;
a.click();
```

---

### Example 8: Handle Rate Limit Error

```typescript
try {
  await trpc.emailCampaigns.create.mutate({ /* ... */ });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    const resetAt = new Date(error.data.resetAt);
    alert(`Rate limit exceeded. Try again at ${resetAt.toLocaleTimeString()}`);
  }
}
```

---

## TypeScript Type Definitions

Copy these types into your frontend codebase:

```typescript
// ===========================
// Email Preferences
// ===========================

export type DigestFrequency = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';

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
  unsubscribedAt: Date | null;
  globalUnsubscribe: boolean;
  categoryPreferences: Record<string, boolean> | null;
  frequencyPreference: string;
  preferenceCenterLastVisited: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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

// ===========================
// Email Events
// ===========================

export type EmailEventType =
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED';

export interface EmailEvent {
  id: string;
  userId?: string;
  email: string;
  eventType: EmailEventType;
  messageId: string;
  subject?: string;
  templateName?: string;
  metadata?: any;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  bounceReason?: string;
  clickedUrl?: string;
  createdAt: Date;
}

// ===========================
// Email Campaigns
// ===========================

export type EmailCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type CampaignRecipientStatus =
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

export interface SegmentCriteria {
  role?: ('ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER')[];
  verificationStatus?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  hasEmailPreference?: Record<string, boolean>;
  creatorSpecialties?: string[];
  brandIndustries?: string[];
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  templateId: string;
  subject: string;
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
  description: string | null;
  status: EmailCampaignStatus;
  templateId: string;
  subject: string;
  previewText: string | null;
  segmentCriteria: any;
  recipientCount: number;
  scheduledSendTime: Date;
  timezone: string;
  sendStartedAt: Date | null;
  sendCompletedAt: Date | null;
  messagesPerHour: number;
  batchSize: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  complainedCount: number;
  failedCount: number;
  tags: string[];
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  userId: string | null;
  email: string;
  status: CampaignRecipientStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  firstClickedAt: Date | null;
  bouncedAt: Date | null;
  unsubscribedAt: Date | null;
  complainedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  messageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignAnalytics {
  counts: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    complained: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    clickToOpenRate: number;
    bounceRate: number;
    unsubscribeRate: number;
    complaintRate: number;
  };
  topLinks: Array<{
    url: string;
    clicks: number;
    uniqueClicks: number;
  }>;
  timeline: Array<{
    hour: string;
    sent: number;
    opened: number;
    clicked: number;
  }>;
}

// ===========================
// Suppression
// ===========================

export type SuppressionReason = 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' | 'MANUAL';

export interface EmailSuppression {
  id: string;
  email: string;
  reason: SuppressionReason;
  suppressedAt: Date;
  bounceType?: string;
  bounceReason?: string;
}

// ===========================
// GDPR Export
// ===========================

export interface EmailDataExport {
  personalInfo: {
    email: string;
    name: string | null;
  };
  preferences: EmailPreferences;
  recentEvents: EmailEvent[];
  unsubscribeHistory: Array<{
    unsubscribedAt: Date;
    action: string;
    source: string;
    categoriesAffected: string[];
  }>;
  scheduledEmails: Array<{
    emailType: string;
    scheduledSendTime: Date;
    status: string;
  }>;
}

// ===========================
// API Error Types
// ===========================

export interface EmailError {
  code: string;
  message: string;
  data?: any;
}

export type EmailErrorCode =
  | 'EMAIL_SUPPRESSED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'PREFERENCE_BLOCKED'
  | 'VALIDATION_ERROR'
  | 'TEMPLATE_ERROR'
  | 'WEBHOOK_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
```

---

## Business Logic & Validation Rules

### Email Address Validation

- Must be valid email format (RFC 5322)
- Automatically converted to lowercase
- Trimmed of whitespace
- Max length: 255 characters

### Campaign Creation Rules

1. **Name:** 1-255 characters, required
2. **Subject:** 1-500 characters, required
3. **Preview Text:** Max 200 characters, optional
4. **Template ID:** Must exist in template registry
5. **Scheduled Send Time:** Must be in the future (UTC)
6. **Messages Per Hour:** 1-10,000, default: 1,000
7. **Batch Size:** 1-1,000, default: 100

### Suppression List Logic

- **Hard Bounces:** Automatically added to suppression list
- **Spam Complaints:** Automatically added to suppression list
- **Global Unsubscribe:** Added to suppression list with reason 'UNSUBSCRIBE'
- **Removal:** Admin manual override required

### Preference Enforcement

The backend automatically checks:
1. Suppression list (blocks all emails)
2. Global unsubscribe flag
3. Category-specific preferences
4. Digest frequency settings

**System Emails:** Always sent regardless of preferences (verification, password reset)

### Template Variables

Each template has required variables. Missing variables will cause a 400 error.

Example for `email-verification`:
```typescript
{
  userName: string;        // Required
  verificationUrl: string; // Required
  expiresInHours?: number; // Optional, default: 24
}
```

---

## Error Handling

### Error Response Format

All tRPC errors follow this structure:

```typescript
{
  code: EmailErrorCode;
  message: string;
  data?: {
    resetAt?: Date;        // For rate limits
    remaining?: number;    // Requests remaining
    field?: string;        // Validation field
    value?: any;          // Invalid value
  };
}
```

---

### Error Codes Reference

| Code | HTTP Status | Description | User-Facing Message | Retry? |
|------|-------------|-------------|---------------------|--------|
| `EMAIL_SUPPRESSED` | 400 | Email on suppression list | "This email address cannot receive emails. Please contact support." | ❌ No |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | "You're sending too many emails. Please wait {resetAt} before trying again." | ✅ Yes, after reset time |
| `PROVIDER_ERROR` | 500 | Email service provider failed | "Email service temporarily unavailable. Try again later." | ✅ Yes, with exponential backoff |
| `PREFERENCE_BLOCKED` | 400 | User opted out of category | "User has opted out of this email category." | ❌ No |
| `VALIDATION_ERROR` | 400 | Invalid input data | Show specific field error | ✅ Yes, after fixing input |
| `TEMPLATE_ERROR` | 500 | Template rendering failed | "Email template error. Contact support." | ❌ No |
| `NOT_FOUND` | 404 | Campaign/resource not found | "Campaign not found." | ❌ No |
| `UNAUTHORIZED` | 401 | Not authenticated | "Please log in to continue." | ✅ Yes, after login |
| `FORBIDDEN` | 403 | Insufficient permissions | "You don't have permission to perform this action." | ❌ No |

---

### Error Handling Examples

#### 1. Rate Limit Error

```typescript
try {
  await trpc.emailCampaigns.create.mutate({ /* ... */ });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    const resetAt = new Date(error.data.resetAt);
    const resetIn = Math.ceil((resetAt - Date.now()) / 1000 / 60); // minutes
    
    toast.error(
      `Rate limit exceeded. Please wait ${resetIn} minutes before trying again.`,
      { duration: 10000 }
    );
  }
}
```

#### 2. Validation Error

```typescript
try {
  await trpc.emailCampaigns.updateMyPreferences.mutate({
    digestFrequency: 'INVALID', // Invalid value
  });
} catch (error) {
  if (error.code === 'VALIDATION_ERROR') {
    const field = error.data.field; // 'digestFrequency'
    const value = error.data.value; // 'INVALID'
    
    setFieldError(field, `Invalid value: ${value}. Must be one of: IMMEDIATE, DAILY, WEEKLY, NEVER`);
  }
}
```

#### 3. Generic Error Handler

```typescript
async function handleEmailOperation<T>(
  operation: () => Promise<T>
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    switch (error.code) {
      case 'RATE_LIMIT_EXCEEDED':
        toast.error('Too many requests. Please wait a moment.');
        break;
      case 'UNAUTHORIZED':
        router.push('/login');
        break;
      case 'FORBIDDEN':
        toast.error('You do not have permission to perform this action.');
        break;
      case 'NOT_FOUND':
        toast.error('Resource not found.');
        break;
      case 'VALIDATION_ERROR':
        toast.error(error.message);
        break;
      default:
        toast.error('An unexpected error occurred. Please try again.');
        Sentry.captureException(error);
    }
    return null;
  }
}

// Usage
const campaign = await handleEmailOperation(() =>
  trpc.emailCampaigns.get.query({ id: campaignId })
);
```

---

## Authorization & Permissions

### Permission Levels

| Endpoint | Creator | Brand | Admin | Public |
|----------|---------|-------|-------|--------|
| `getMyPreferences` | ✅ | ✅ | ✅ | ❌ |
| `updateMyPreferences` | ✅ | ✅ | ✅ | ❌ |
| `unsubscribe` | ✅ | ✅ | ✅ | ❌ |
| `resubscribe` | ✅ | ✅ | ✅ | ❌ |
| `exportMyEmailData` | ✅ | ✅ | ✅ | ❌ |
| `deleteMyEmailData` | ✅ | ✅ | ✅ | ❌ |
| `emailCampaigns.create` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.list` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.get` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.schedule` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.cancel` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.sendTest` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.analytics` | ❌ | ❌ | ✅ | ❌ |
| `emailCampaigns.recipients` | ❌ | ❌ | ✅ | ❌ |

### Role-Based UI Rendering

```typescript
import { useSession } from 'next-auth/react';

function EmailSettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <div>
      {/* All authenticated users can see preferences */}
      <EmailPreferencesSection />

      {/* Only admins see campaign management */}
      {isAdmin && <EmailCampaignManagement />}
    </div>
  );
}
```

---

## Rate Limiting & Quotas

### User Rate Limits

**Transactional Emails:**
- **Limit:** 50 emails per hour per user
- **Window:** 1 hour rolling
- **Scope:** Per user ID
- **Headers:** None (enforced server-side)

**Campaign Creation (Admin):**
- **Limit:** 10 campaigns per day
- **Window:** 24 hours rolling
- **Scope:** Per admin user
- **Headers:** None

### Rate Limit Headers

tRPC does not expose rate limit headers directly, but you can check for `RATE_LIMIT_EXCEEDED` errors:

```typescript
try {
  await trpc.emailCampaigns.create.mutate({ /* ... */ });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    console.log('Remaining:', error.data.remaining);
    console.log('Reset at:', new Date(error.data.resetAt));
  }
}
```

### Best Practices

1. **Debounce User Actions:** Prevent rapid-fire preference updates
2. **Show Rate Limit Warning:** Display remaining quota to users
3. **Implement Retry Logic:** Retry with exponential backoff for rate limits
4. **Cache Preferences:** Avoid unnecessary API calls

---

## Email Templates

### Available Templates

The backend supports the following React Email templates:

| Template Key | Category | Description | Required Variables |
|--------------|----------|-------------|-------------------|
| `email-verification` | system | Email verification for new accounts | `userName`, `verificationUrl` |
| `password-reset` | system | Password reset link | `userName`, `resetUrl` |
| `password-changed` | system | Password change confirmation | `userName` |
| `welcome-email` | system | Welcome email after verification | `userName` |
| `royalty-statement` | royaltyStatements | Monthly royalty statement | `creatorName`, `periodStart`, `periodEnd`, `totalRoyalties`, `statementUrl` |
| `license-expiry` | licenseExpiry | License expiration notice | `licenseName`, `assetName`, `expiryDate`, `daysUntilExpiry` |
| `license-expiry-90-day` | licenseExpiry | 90-day expiry notice | `userName`, `licenseName`, `brandName`, `expiryDate` |
| `license-expiry-60-day` | licenseExpiry | 60-day expiry notice | `userName`, `licenseName`, `brandName`, `expiryDate` |
| `license-expiry-30-day` | licenseExpiry | 30-day expiry notice | `userName`, `licenseName`, `brandName`, `expiryDate` |
| `payout-confirmation` | payouts | Payout confirmation | `creatorName`, `amount`, `currency`, `payoutMethod` |
| `project-invitation` | projectInvitations | Project invitation | `inviterName`, `projectName`, `role`, `acceptUrl` |
| `new-message` | messages | New direct message notification | `senderName`, `messagePreview`, `threadUrl` |
| `message-digest` | messages | Daily/weekly message digest | `recipientName`, `frequency`, `threads`, `totalUnreadCount`, `inboxUrl` |
| `monthly-newsletter` | newsletters | Monthly platform newsletter | `userName`, `month`, `year`, `highlights` |
| `brand-welcome` | system | Brand onboarding welcome | `brandName`, `primaryContactName`, `dashboardUrl` |
| `creator-welcome` | system | Creator onboarding welcome | `creatorName`, `dashboardUrl` |

### Template Variable Types

Each template has strict type requirements. See the full type definitions in the [template-registry.ts](../../src/lib/services/email/template-registry.ts) file.

### Template Usage Example

```typescript
// Backend automatically renders templates
// Frontend only needs to specify template key and variables

await emailService.sendTransactional({
  email: 'user@example.com',
  subject: 'Verify your email',
  template: 'email-verification',
  variables: {
    userName: 'John Doe',
    verificationUrl: 'https://yesgoddess.com/verify?token=abc123',
    expiresInHours: 24, // Optional
  },
});
```

---

## Email Preferences

### Preference Categories

Users can control emails in these categories:

| Category | Description | Default | Overridable by System? |
|----------|-------------|---------|------------------------|
| `royaltyStatements` | Monthly royalty statements | ✅ Enabled | ❌ |
| `licenseExpiry` | License expiration notices | ✅ Enabled | ❌ |
| `projectInvitations` | Project collaboration invites | ✅ Enabled | ❌ |
| `messages` | Direct message notifications | ✅ Enabled | ❌ |
| `payouts` | Payout confirmations | ✅ Enabled | ❌ |
| `newsletters` | Marketing newsletters | ✅ Enabled | ✅ |
| `announcements` | Platform announcements | ✅ Enabled | ✅ |

**System Emails** (verification, password reset) always send regardless of preferences.

---

### Digest Frequency

Users can choose how often to receive digest emails:

- `IMMEDIATE`: Real-time notifications (default)
- `DAILY`: Once per day at 9 AM user timezone
- `WEEKLY`: Once per week on Monday at 9 AM
- `NEVER`: No digest emails

---

### Preference Center UI Example

```tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export function EmailPreferencesForm() {
  const { data: preferences, isLoading } = trpc.emailCampaigns.getMyPreferences.useQuery();
  const updateMutation = trpc.emailCampaigns.updateMyPreferences.useMutation();

  const [formData, setFormData] = useState(preferences);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await updateMutation.mutateAsync(formData);
      toast.success('Preferences updated successfully');
    } catch (error) {
      toast.error('Failed to update preferences');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Email Preferences</h3>
        <p className="text-sm text-gray-600">Control which emails you receive</p>
      </div>

      {/* Category toggles */}
      <div className="space-y-4">
        <label className="flex items-center justify-between">
          <span>Royalty Statements</span>
          <input
            type="checkbox"
            checked={formData?.royaltyStatements ?? true}
            onChange={(e) =>
              setFormData({ ...formData, royaltyStatements: e.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between">
          <span>License Expiry Notices</span>
          <input
            type="checkbox"
            checked={formData?.licenseExpiry ?? true}
            onChange={(e) =>
              setFormData({ ...formData, licenseExpiry: e.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between">
          <span>Project Invitations</span>
          <input
            type="checkbox"
            checked={formData?.projectInvitations ?? true}
            onChange={(e) =>
              setFormData({ ...formData, projectInvitations: e.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between">
          <span>Direct Messages</span>
          <input
            type="checkbox"
            checked={formData?.messages ?? true}
            onChange={(e) =>
              setFormData({ ...formData, messages: e.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between">
          <span>Newsletters</span>
          <input
            type="checkbox"
            checked={formData?.newsletters ?? true}
            onChange={(e) =>
              setFormData({ ...formData, newsletters: e.target.checked })
            }
          />
        </label>
      </div>

      {/* Digest frequency */}
      <div>
        <label className="block text-sm font-medium">Digest Frequency</label>
        <select
          value={formData?.digestFrequency ?? 'IMMEDIATE'}
          onChange={(e) =>
            setFormData({
              ...formData,
              digestFrequency: e.target.value as any,
            })
          }
          className="mt-1 block w-full rounded-md border-gray-300"
        >
          <option value="IMMEDIATE">Immediate</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="NEVER">Never</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={updateMutation.isLoading}
        className="w-full bg-black text-white py-2 rounded-md"
      >
        {updateMutation.isLoading ? 'Saving...' : 'Save Preferences'}
      </button>

      {/* Unsubscribe link */}
      <div className="text-center">
        <button
          type="button"
          onClick={async () => {
            if (confirm('Are you sure you want to unsubscribe from all emails?')) {
              await trpc.emailCampaigns.unsubscribe.mutate({
                email: preferences?.userId, // Use actual email
                reason: 'User request',
              });
              toast.success('Unsubscribed from all emails');
            }
          }}
          className="text-sm text-red-600 hover:underline"
        >
          Unsubscribe from all emails
        </button>
      </div>
    </form>
  );
}
```

---

## Webhook Integration

### Overview

The backend receives webhook events from Resend for:
- Email delivery status
- Email opens
- Email clicks
- Bounces
- Spam complaints

**Frontend does not interact with webhooks directly.** The backend automatically processes events and updates the database.

---

### Tracking Email Delivery (Optional)

If you want to show email delivery status in the UI:

```typescript
// Backend stores events in EmailEvent table
// You can query this via a custom endpoint if needed

const events = await prisma.emailEvent.findMany({
  where: {
    userId: session.user.id,
    eventType: 'DELIVERED',
  },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
```

---

## Frontend Implementation Checklist

### Phase 1: Email Preferences (User-Facing)

- [ ] Create `/settings/email-preferences` page
- [ ] Fetch preferences with `trpc.emailCampaigns.getMyPreferences.useQuery()`
- [ ] Implement toggle switches for each category
- [ ] Add digest frequency dropdown
- [ ] Handle form submission with `trpc.emailCampaigns.updateMyPreferences.useMutation()`
- [ ] Show success/error toast notifications
- [ ] Add "Unsubscribe from all" button with confirmation modal
- [ ] Add "Resubscribe" button if user is globally unsubscribed

### Phase 2: GDPR Compliance

- [ ] Add "Export my email data" button in settings
- [ ] Implement data export download (JSON file)
- [ ] Add "Delete my email data" button
- [ ] Show scary confirmation modal with warnings
- [ ] Handle deletion with `trpc.emailCampaigns.deleteMyEmailData.mutate()`

### Phase 3: Email Campaign Management (Admin Only)

- [ ] Create `/admin/email-campaigns` dashboard
- [ ] Implement campaign list view with filters (status, pagination)
- [ ] Add "Create Campaign" button → form modal
- [ ] Campaign creation form:
  - [ ] Name, description, subject, preview text
  - [ ] Template selector dropdown
  - [ ] Audience segmentation filters
  - [ ] Schedule date/time picker
  - [ ] Rate limit settings (messages per hour, batch size)
  - [ ] Tags input
- [ ] Campaign detail page:
  - [ ] Display campaign stats (sent, delivered, opened, clicked, bounced)
  - [ ] Show analytics (delivery rate, open rate, click rate)
  - [ ] List recipients with status
  - [ ] "Send Test" button
  - [ ] "Schedule" button (if DRAFT)
  - [ ] "Cancel" button (if SCHEDULED or SENDING)
- [ ] Campaign analytics dashboard:
  - [ ] Delivery rate chart
  - [ ] Open rate chart
  - [ ] Click rate chart
  - [ ] Top clicked links table
  - [ ] Timeline graph (hourly breakdown)

### Phase 4: Error Handling & UX

- [ ] Implement global error handler for tRPC errors
- [ ] Show user-friendly error messages
- [ ] Add retry logic for rate limits
- [ ] Display rate limit warnings
- [ ] Add loading states for all mutations
- [ ] Add optimistic updates for preference toggles
- [ ] Add confirmation modals for destructive actions

### Phase 5: Testing

- [ ] Test preference updates
- [ ] Test global unsubscribe/resubscribe flow
- [ ] Test GDPR export
- [ ] Test GDPR deletion
- [ ] Test campaign creation (admin)
- [ ] Test campaign scheduling
- [ ] Test campaign cancellation
- [ ] Test sending test emails
- [ ] Test rate limit errors
- [ ] Test permission-based UI rendering

---

## Edge Cases to Handle

### 1. User with No Preferences

If a user has never set preferences, the backend creates default preferences on first access. Frontend should handle loading state.

```typescript
const { data: preferences, isLoading } = trpc.emailCampaigns.getMyPreferences.useQuery();

if (isLoading) {
  return <div>Loading preferences...</div>;
}

// preferences will always be defined after loading
```

---

### 2. User is Globally Unsubscribed

Show a prominent message and "Resubscribe" button:

```tsx
if (preferences?.globalUnsubscribe) {
  return (
    <div className="bg-yellow-50 p-4 rounded-md">
      <p>You are currently unsubscribed from all emails.</p>
      <button
        onClick={async () => {
          await trpc.emailCampaigns.resubscribe.mutate();
          toast.success('Resubscribed successfully');
        }}
      >
        Resubscribe
      </button>
    </div>
  );
}
```

---

### 3. Campaign with No Recipients

If a campaign's segment criteria matches no users, show a warning:

```tsx
if (campaign.recipientCount === 0) {
  return (
    <div className="bg-red-50 p-4 rounded-md">
      <p>⚠️ This campaign has no recipients. Check your segment criteria.</p>
    </div>
  );
}
```

---

### 4. Rate Limit Exceeded

Show time remaining until reset:

```tsx
catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    const resetAt = new Date(error.data.resetAt);
    const now = new Date();
    const minutesRemaining = Math.ceil((resetAt - now) / 1000 / 60);
    
    toast.error(`Rate limit exceeded. Try again in ${minutesRemaining} minutes.`);
  }
}
```

---

### 5. Deleted User

If a user is deleted, their email preferences and events are anonymized. The frontend should not show any email-related data for deleted users.

---

## Additional Resources

- **Backend Repo:** [yg-backend](https://github.com/machinesoul11/yg-backend)
- **Email Templates Source:** `/emails/templates/`
- **Email Service Documentation:** `/docs/modules/email-service/`
- **Email Campaigns Documentation:** `/docs/modules/email-campaigns/`
- **React Email Docs:** [https://react.email](https://react.email)
- **Resend Docs:** [https://resend.com/docs](https://resend.com/docs)

---

## Questions & Support

For questions or issues:
1. Check the backend documentation in `/docs/`
2. Review error logs in the backend console
3. Contact the backend team for API changes or new features

---

**Last Updated:** October 13, 2025  
**Backend Version:** v1.0.0  
**Frontend Compatibility:** Next.js 15 + App Router + TypeScript
