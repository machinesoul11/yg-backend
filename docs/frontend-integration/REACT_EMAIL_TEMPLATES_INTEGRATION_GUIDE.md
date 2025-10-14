# React Email Templates - Frontend Integration Guide

## 🌐 Classification: SHARED
> Used by both public-facing website (yesgoddess-web) and admin backend (yg-backend)
> 
> - **Transactional emails**: Sent to all users (creators, brands)
> - **Admin-triggered emails**: Approvals, notifications, system events
> - **Email infrastructure**: Shared backend service, templates, and tracking

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
9. [Email Template Catalog](#email-template-catalog)
10. [Email Events & Tracking](#email-events--tracking)
11. [User Preferences](#user-preferences)
12. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The React Email Templates module provides a production-ready email system built with:

- **React Email Components**: 20+ branded templates following YES GODDESS design guidelines
- **Type-Safe Template Variables**: TypeScript interfaces for all template props
- **Automatic HTML Compilation**: React components → production-ready HTML with inline CSS
- **Email Service Layer**: Unified API for sending transactional and campaign emails
- **Delivery Tracking**: Webhook-based tracking for opens, clicks, bounces, complaints
- **User Preferences**: Granular opt-in/opt-out controls per email category
- **Email Provider**: Uses Resend API with abstraction layer for future provider switching

### Key Features

✅ **20+ Production Templates**
- Authentication (welcome, verification, password reset)
- Notifications (royalties, license expiry, payouts)
- Project collaboration (invitations, updates)
- Brand & creator onboarding
- Marketing (monthly newsletter)
- Transactional (receipts)

✅ **Brand Compliance**
- YES GODDESS color palette (VOID, BONE, ALTAR, SANCTUM)
- Montserrat typography with extended letter-spacing
- Authoritative, ceremonial tone
- Consistent header/footer components

✅ **Developer Experience**
- Live preview server (`npm run email:dev`)
- TypeScript type safety
- Test fixtures for all templates
- Automatic suppression list checking
- Preference-based filtering

---

## API Endpoints

The email system does **NOT expose direct HTTP endpoints** to the frontend. Instead, emails are triggered internally by backend services or tRPC procedures.

### For Frontend Developers

**You do NOT call email endpoints directly.** Emails are sent automatically when:

1. **User actions trigger backend events**:
   - Sign up → Welcome email
   - Request password reset → Password reset email
   - Verify email → Verification email
   
2. **Background jobs execute**:
   - Royalty statement generated → Statement ready email
   - License expiring soon → Expiry reminder email
   - Payout processed → Payout confirmation email

3. **Admin actions in ops.yesgoddess.agency**:
   - Brand verification approved → Verification complete email
   - Project invitation sent → Invitation email

### Internal Service Usage (Backend Reference Only)

Backend services use the `EmailService` class:

```typescript
// Backend code - for reference only
import { emailService } from '@/lib/services/email/email.service';

await emailService.sendTransactional({
  email: 'user@example.com',
  subject: 'Welcome to YES GODDESS',
  template: 'welcome-email',
  variables: {
    userName: 'Jane Creator',
    verificationUrl: 'https://...',
    role: 'creator',
  },
  userId: 'user_123', // Optional - for preference checking
  tags: { category: 'auth' }, // Optional - for analytics
});
```

### Email Preferences Endpoint (tRPC)

**Frontend DOES interact with email preferences:**

```typescript
// Frontend code - tRPC client
import { trpc } from '@/lib/trpc';

// Get user's email preferences
const preferences = trpc.emailCampaigns.getMyPreferences.useQuery();

// Update preferences
const updatePreferences = trpc.emailCampaigns.updateMyPreferences.useMutation();

await updatePreferences.mutateAsync({
  emailEnabled: true,
  categories: {
    royaltyStatements: true,
    licenseExpiry: true,
    payouts: true,
    projectInvitations: true,
    newsletters: false, // Opt out of newsletters
    marketing: false,
  },
});
```

---

## Request/Response Examples

### User Email Preferences (Frontend Interaction)

#### Get Current User Preferences

**tRPC Call**:
```typescript
const { data: preferences } = trpc.emailCampaigns.getMyPreferences.useQuery();
```

**Response**:
```json
{
  "userId": "cm5abc123xyz",
  "emailEnabled": true,
  "categories": {
    "royaltyStatements": true,
    "licenseExpiry": true,
    "payouts": true,
    "projectInvitations": true,
    "newsletters": true,
    "marketing": false,
    "system": true
  },
  "frequency": {
    "digest": "weekly",
    "immediate": true
  },
  "updatedAt": "2025-10-13T12:00:00Z"
}
```

#### Update Email Preferences

**tRPC Call**:
```typescript
const updateMutation = trpc.emailCampaigns.updateMyPreferences.useMutation();

await updateMutation.mutateAsync({
  emailEnabled: true,
  categories: {
    newsletters: false, // Unsubscribe from newsletters
    marketing: false,
  },
});
```

**Response**:
```json
{
  "success": true,
  "preferences": {
    "userId": "cm5abc123xyz",
    "emailEnabled": true,
    "categories": {
      "royaltyStatements": true,
      "licenseExpiry": true,
      "payouts": true,
      "projectInvitations": true,
      "newsletters": false,
      "marketing": false,
      "system": true
    },
    "updatedAt": "2025-10-13T12:05:00Z"
  }
}
```

#### Unsubscribe from All Emails

**tRPC Call**:
```typescript
const unsubscribeMutation = trpc.emailCampaigns.unsubscribe.useMutation();

await unsubscribeMutation.mutateAsync({
  scope: 'all', // or 'category'
  category: undefined, // only if scope === 'category'
});
```

**Response**:
```json
{
  "success": true,
  "message": "You have been unsubscribed from all emails",
  "preferences": {
    "emailEnabled": false,
    "categories": {
      // All set to false
    }
  }
}
```

### Email Event Tracking (Read-Only)

Email events (sent, delivered, opened, clicked, bounced) are tracked automatically via webhooks. Frontend can query these via tRPC:

**Example: Get Email History**
```typescript
const { data: emailHistory } = trpc.user.getEmailHistory.useQuery({
  limit: 10,
  offset: 0,
});
```

**Response**:
```json
{
  "emails": [
    {
      "id": "evt_abc123",
      "subject": "Your Royalty Statement is Ready",
      "templateName": "royalty-statement",
      "sentAt": "2025-10-01T09:00:00Z",
      "deliveredAt": "2025-10-01T09:00:15Z",
      "openedAt": "2025-10-01T10:30:00Z",
      "clickedAt": "2025-10-01T10:31:00Z",
      "status": "delivered"
    }
  ],
  "total": 42
}
```

---

## TypeScript Type Definitions

### Email Template Props

Each template has a TypeScript interface defining required and optional props.

#### Core Template Interfaces

```typescript
// 1. Welcome Email
export interface WelcomeEmailProps {
  userName: string;
  verificationUrl: string;
  role: 'creator' | 'brand';
}

// 2. Email Verification
export interface EmailVerificationProps {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number; // Default: 24
}

// 3. Password Reset
export interface PasswordResetProps {
  userName: string;
  resetUrl: string;
  expiresInHours?: number; // Default: 1
}

// 4. Password Changed
export interface PasswordChangedProps {
  userName: string;
  changeTime?: Date;
  ipAddress?: string;
  deviceInfo?: string;
}

// 5. Royalty Statement
export interface RoyaltyStatementProps {
  creatorName: string;
  periodStart: Date;
  periodEnd: Date;
  totalRoyalties: number; // In cents
  currency: string; // 'USD', 'EUR', etc.
  statementUrl: string;
  lineItems?: Array<{
    assetName: string;
    amount: number; // In cents
    units: number;
  }>;
}

// 6. Royalty Statement Ready (Enhanced)
export interface RoyaltyStatementReadyProps {
  creatorName: string;
  periodStart: string; // e.g., "January 1, 2025"
  periodEnd: string; // e.g., "January 31, 2025"
  totalEarnings: string; // Formatted currency, e.g., "1,234.56"
  dashboardUrl: string;
}

// 7. License Expiry (Generic)
export interface LicenseExpiryProps {
  licenseName: string;
  assetName: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  renewalUrl?: string;
}

// 8. License Expiry 90-Day Notice
export interface LicenseExpiry90DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string; // Formatted date
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
}

// 9. License Expiry 60-Day Notice
export interface LicenseExpiry60DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
}

// 10. License Expiry 30-Day Notice (Urgent)
export interface LicenseExpiry30DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
  gracePeriodActive?: boolean;
  expired?: boolean;
}

// 11. License Renewal Offer
export interface LicenseRenewalOfferProps {
  brandName: string;
  contactName: string;
  licenseName: string;
  ipAssetTitle: string;
  currentEndDate: string;
  proposedStartDate: string;
  proposedEndDate: string;
  originalFeeDollars: string;
  renewalFeeDollars: string;
  feeChange: string; // e.g., "+10%" or "-5%"
  revSharePercent: string;
  daysUntilExpiration: number;
  renewalUrl: string;
  adjustmentsSummary?: string[];
}

// 12. License Renewal Reminder
export interface LicenseRenewalReminderProps {
  brandName: string;
  contactName: string;
  licenseName: string;
  ipAssetTitle: string;
  expirationDate: string;
  daysRemaining: number;
  renewalFeeDollars: string;
  renewalUrl: string;
  urgencyLevel: 'final' | 'high' | 'medium';
}

// 13. License Renewal Complete
export interface LicenseRenewalCompleteProps {
  recipientName: string;
  recipientType: 'brand' | 'creator';
  licenseName: string;
  ipAssetTitle: string;
  newStartDate: string;
  newEndDate: string;
  renewalFeeDollars: string;
  revSharePercent: string;
  confirmationNumber: string;
  licenseUrl: string;
  brandName?: string; // For creator emails
  creatorNames?: string[]; // For brand emails
}

// 14. Payout Confirmation
export interface PayoutConfirmationProps {
  creatorName: string;
  amount: number; // In cents
  currency: string;
  payoutMethod: string; // 'Bank Transfer', 'PayPal', etc.
  estimatedArrival: Date;
  transactionId: string;
}

// 15. Transaction Receipt
export interface TransactionReceiptProps {
  recipientName: string;
  transactionId: string;
  transactionDate: Date;
  amount: number; // In cents
  currency: string;
  description: string;
  receiptUrl?: string;
}

// 16. Project Invitation
export interface ProjectInvitationProps {
  inviterName: string;
  projectName: string;
  projectDescription?: string;
  role: string; // 'Photographer', 'Designer', etc.
  acceptUrl: string;
  declineUrl?: string;
}

// 17. Monthly Newsletter
export interface MonthlyNewsletterProps {
  userName: string;
  month: string; // 'October'
  year: number; // 2025
  highlights: Array<{
    title: string;
    description: string;
    url?: string;
  }>;
}

// 18. Brand Welcome
export interface BrandWelcomeProps {
  brandName: string;
  primaryContactName: string;
  dashboardUrl: string;
}

// 19. Brand Verification Request
export interface BrandVerificationRequestProps {
  brandName: string;
  submittedBy: string;
  submittedAt: Date;
  reviewUrl: string; // Admin-only URL
}

// 20. Brand Verification Complete
export interface BrandVerificationCompleteProps {
  brandName: string;
  contactName: string;
  dashboardUrl: string;
}

// 21. Brand Verification Rejected
export interface BrandVerificationRejectedProps {
  brandName: string;
  rejectionReason: string;
  resubmitUrl?: string;
}

// 22. Brand Team Invitation
export interface BrandTeamInvitationProps {
  inviterName: string;
  brandName: string;
  role: string;
  acceptUrl: string;
  expiresInDays?: number; // Default: 7
}

// 23. Creator Welcome
export interface CreatorWelcomeProps {
  creatorName: string;
  dashboardUrl: string;
}

// 24. Creator Verification Approved
export interface CreatorVerificationApprovedProps {
  creatorName: string;
  approvedAt: Date;
  dashboardUrl: string;
}

// 25. Creator Verification Rejected
export interface CreatorVerificationRejectedProps {
  creatorName: string;
  rejectionReason: string;
  resubmitUrl?: string;
}

// 26. Role Changed
export interface RoleChangedProps {
  userName: string;
  oldRole: string;
  newRole: string;
  changedBy: string;
  effectiveDate?: Date;
}

// 27. New Message Notification
export interface NewMessageProps {
  recipientName?: string;
  senderName: string;
  senderAvatar?: string;
  threadSubject?: string;
  messagePreview: string;
  threadUrl: string;
}

// 28. Message Digest (Daily/Weekly)
export interface MessageDigestProps {
  recipientName?: string;
  frequency: 'daily' | 'weekly';
  threads: Array<{
    threadId: string;
    threadSubject: string | null;
    messageCount: number;
    senders: string[];
    latestMessage: {
      senderName: string;
      body: string;
      createdAt: Date;
    };
  }>;
  totalUnreadCount: number;
  inboxUrl: string;
}
```

### Email Preferences Types

```typescript
export interface EmailPreferences {
  userId: string;
  emailEnabled: boolean;
  categories: {
    royaltyStatements: boolean;
    licenseExpiry: boolean;
    payouts: boolean;
    projectInvitations: boolean;
    newsletters: boolean;
    marketing: boolean;
    system: boolean; // Cannot be disabled
    messages: boolean;
  };
  frequency?: {
    digest: 'daily' | 'weekly' | 'off';
    immediate: boolean;
  };
  updatedAt: string;
}

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  categories?: Partial<EmailPreferences['categories']>;
  frequency?: EmailPreferences['frequency'];
}

export interface UnsubscribeInput {
  scope: 'all' | 'category';
  category?: keyof EmailPreferences['categories'];
}
```

### Email Event Types

```typescript
export interface EmailEvent {
  id: string;
  userId?: string;
  email: string;
  eventType: 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED';
  messageId: string;
  subject: string;
  templateName: string;
  metadata?: Record<string, any>;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  createdAt: Date;
}

export interface EmailHistoryQuery {
  limit?: number; // Default: 10
  offset?: number; // Default: 0
  templateName?: string; // Filter by template
  eventType?: EmailEvent['eventType']; // Filter by event type
}
```

---

## Business Logic & Validation Rules

### Sending Rules

1. **Suppression List Check**
   - Email addresses that have hard-bounced or complained are automatically suppressed
   - Suppressed emails will NOT receive any emails
   - Suppression status is checked before every send

2. **User Preference Check**
   - If `userId` is provided, user preferences are checked
   - If user has opted out of the email category, send is blocked
   - **System emails** (verification, password reset) always bypass preference checks

3. **Email Verification Requirement**
   - Some features require verified email address
   - User cannot enable email notifications without verified email

4. **Template Variable Validation**
   - All required props must be provided (enforced by TypeScript)
   - Optional props have sensible defaults
   - Invalid/missing variables throw `EmailTemplateError`

### Email Categories

Emails are grouped into categories for preference management:

| Category | Description | Can Opt Out? |
|----------|-------------|--------------|
| `system` | Auth, verification, security alerts | ❌ No |
| `royaltyStatements` | Monthly royalty notifications | ✅ Yes |
| `licenseExpiry` | License expiration reminders | ✅ Yes |
| `payouts` | Payout confirmations | ✅ Yes |
| `projectInvitations` | Collaboration invites | ✅ Yes |
| `newsletters` | Monthly newsletter | ✅ Yes |
| `marketing` | Promotional emails | ✅ Yes |
| `messages` | Message notifications | ✅ Yes |

### Template Variable Formatting

Follow these conventions when preparing template variables:

1. **Currency Amounts**
   - Backend stores in cents (integer): `350000`
   - Templates display formatted: `"3,500.00"`
   - Always include currency code: `"USD"`

2. **Dates**
   - Backend sends as ISO string or Date object
   - Templates format for display: `"October 13, 2025"`
   - Use date-fns for formatting consistency

3. **URLs**
   - Always absolute URLs with protocol: `https://...`
   - Include UTM parameters for tracking (backend handles this)
   - Use signed tokens for sensitive actions (reset, verification)

4. **User Names**
   - First name only for casual context: `"Jane"`
   - Full name for formal context: `"Jane Creator"`
   - Never use email as fallback display name

---

## Error Handling

### Common Error Codes

| Error Code | HTTP Status | Description | User-Friendly Message |
|------------|-------------|-------------|----------------------|
| `EMAIL_SUPPRESSED` | 400 | Email is on suppression list | "This email address cannot receive emails. Please contact support." |
| `PREFERENCE_OPTED_OUT` | 400 | User opted out of this category | "You have unsubscribed from this type of email. Update your preferences to receive emails." |
| `TEMPLATE_NOT_FOUND` | 500 | Invalid template key | "Email template not found. Please contact support." |
| `TEMPLATE_RENDER_ERROR` | 500 | Failed to compile React component | "Failed to generate email. Please try again." |
| `PROVIDER_ERROR` | 500 | Resend API failure | "Failed to send email. Please try again later." |
| `INVALID_EMAIL` | 400 | Malformed email address | "Invalid email address format." |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | "Too many email requests. Please wait before trying again." |
| `EMAIL_NOT_VERIFIED` | 403 | Action requires verified email | "Please verify your email address first." |

### Error Response Format

```typescript
// tRPC Error Response
{
  "error": {
    "code": "PREFERENCE_OPTED_OUT",
    "message": "User opted out of this email category",
    "data": {
      "category": "newsletters",
      "userId": "cm5abc123xyz"
    }
  }
}
```

### Error Handling in Frontend

```typescript
const updateMutation = trpc.emailCampaigns.updateMyPreferences.useMutation({
  onError: (error) => {
    if (error.data?.code === 'EMAIL_NOT_VERIFIED') {
      toast.error('Please verify your email address first');
      router.push('/verify-email');
    } else if (error.data?.code === 'RATE_LIMIT_EXCEEDED') {
      toast.error('Too many requests. Please wait a moment.');
    } else {
      toast.error('Failed to update preferences. Please try again.');
    }
  },
  onSuccess: () => {
    toast.success('Email preferences updated');
  },
});
```

---

## Authorization & Permissions

### Email Preferences Management

| Action | Required Role | Notes |
|--------|---------------|-------|
| View own preferences | Authenticated | Any logged-in user |
| Update own preferences | Authenticated | Any logged-in user |
| Unsubscribe (via email link) | Public | Token-based, no auth required |
| Resubscribe | Authenticated | Must be logged in |
| View email history | Authenticated | Own emails only |
| Export email data (GDPR) | Authenticated | Own data only |
| Delete email data (GDPR) | Authenticated | Own data only |

### Admin Actions (Backend Only)

| Action | Required Role | Notes |
|--------|---------------|-------|
| Send campaign emails | `ADMIN` | Admin dashboard only |
| View all email events | `ADMIN` | Admin dashboard only |
| Manage suppression list | `ADMIN` | Admin dashboard only |
| Preview templates | `ADMIN` | Admin dashboard only |
| View email analytics | `ADMIN` | Admin dashboard only |

### Field-Level Permissions

All authenticated users can:
- ✅ View their own email events
- ✅ Update email preferences
- ✅ Unsubscribe from categories
- ✅ Export their email data (GDPR)

Users **CANNOT**:
- ❌ View other users' email events
- ❌ Send emails directly (emails are triggered by backend)
- ❌ Remove themselves from suppression list (contact support)
- ❌ Override system emails (always sent)

---

## Rate Limiting & Quotas

### Resend API Limits

| Limit Type | Value | Notes |
|------------|-------|-------|
| Emails per month | 100,000 | Production plan |
| Emails per hour | 10,000 | Rolling window |
| Bulk send rate | 100 emails/sec | With batching |
| Attachment size | 40 MB | Per email |

### Application Rate Limits

| Action | Limit | Window | Notes |
|--------|-------|--------|-------|
| Update preferences | 5 requests | 5 minutes | Per user |
| Resend verification | 3 requests | 1 hour | Per email address |
| Generate unsubscribe token | 10 requests | 1 hour | Per user |
| Export email data | 1 request | 24 hours | Per user |

### Rate Limit Headers

Rate limit information is returned in response headers:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1697203200
```

### Handling Rate Limits

```typescript
const updateMutation = trpc.emailCampaigns.updateMyPreferences.useMutation({
  retry: (failureCount, error) => {
    if (error.data?.code === 'RATE_LIMIT_EXCEEDED') {
      return failureCount < 2; // Retry up to 2 times
    }
    return false;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

---

## Email Template Catalog

### Complete Template List

| Template Key | Category | Subject Line Pattern | Trigger |
|--------------|----------|---------------------|---------|
| `welcome-email` | system | Welcome to YES GODDESS | User signs up |
| `email-verification` | system | Verify your email address | User signs up or changes email |
| `password-reset` | system | Reset your YES GODDESS password | User requests password reset |
| `password-changed` | system | Password changed successfully | User changes password |
| `royalty-statement` | royaltyStatements | Your royalty statement for [Period] | Monthly statement generated |
| `royalty-statement-ready` | royaltyStatements | Your royalty statement is ready | Enhanced statement notification |
| `license-expiry` | licenseExpiry | License expiring: [Asset] | Generic expiry reminder |
| `license-expiry-90-day` | licenseExpiry | License expires in 90 days: [Asset] | 90 days before expiry |
| `license-expiry-60-day` | licenseExpiry | License expires in 60 days: [Asset] | 60 days before expiry |
| `license-expiry-30-day` | licenseExpiry | Urgent: License expires in 30 days | 30 days before expiry |
| `license-renewal-offer` | licenseExpiry | Renewal offer for [License] | Renewal period begins |
| `license-renewal-reminder` | licenseExpiry | Reminder: Renew [License] | Follow-up reminders |
| `license-renewal-complete` | licenseExpiry | License renewed: [License] | Renewal processed |
| `payout-confirmation` | payouts | Payment confirmed: [Amount] | Payout processed |
| `transaction-receipt` | system | Receipt: [Transaction] | Purchase completed |
| `project-invitation` | projectInvitations | Project invitation: [Project] | Creator invited to project |
| `monthly-newsletter` | newsletters | YES GODDESS: [Month] Update | Monthly newsletter send |
| `brand-welcome` | system | Welcome to YES GODDESS | Brand account created |
| `brand-verification-request` | system | Brand verification submitted | Brand submits verification |
| `brand-verification-complete` | system | Brand verified | Admin approves brand |
| `brand-verification-rejected` | system | Brand verification declined | Admin rejects brand |
| `brand-team-invitation` | system | Team invitation: [Brand] | Brand invites team member |
| `creator-welcome` | system | Welcome to YES GODDESS | Creator account created |
| `creator-verification-approved` | system | Creator verified | Admin approves creator |
| `creator-verification-rejected` | system | Creator verification declined | Admin rejects creator |
| `role-changed` | system | Your role has been updated | Admin changes user role |
| `new-message` | messages | New message from [Sender] | User receives message |
| `message-digest` | messages | Your message digest | Daily/weekly message summary |

### Template Preview

Preview templates locally during development:

```bash
npm run email:dev
```

Opens `http://localhost:3000` with React Email preview server showing all templates with live reload.

---

## Email Events & Tracking

### Event Types

| Event Type | Description | Trigger |
|------------|-------------|---------|
| `SENT` | Email queued for delivery | Email sent to Resend API |
| `DELIVERED` | Email delivered to recipient | Resend confirms delivery |
| `OPENED` | Recipient opened email | Tracking pixel loaded |
| `CLICKED` | Recipient clicked link | Link click tracked |
| `BOUNCED` | Email bounced (hard/soft) | Delivery failed |
| `COMPLAINED` | Recipient marked as spam | User reports spam |

### Event Flow

```
User Action → Backend Trigger → EmailService.sendTransactional()
                                        ↓
                        Check Suppression List
                                        ↓
                        Check User Preferences
                                        ↓
                        Render React Template → HTML
                                        ↓
                        Send via Resend API
                                        ↓
                        Save Event (SENT) to Database
                                        ↓
                        Return { success: true, messageId }

Resend Webhook → /api/webhooks/resend
                        ↓
                Update Event (DELIVERED, OPENED, CLICKED, etc.)
                        ↓
                Update User's Email History
```

### Tracking Implementation

**Frontend displays email activity:**

```typescript
// Get user's recent email activity
const { data: emailActivity } = trpc.user.getEmailActivity.useQuery({
  limit: 5,
});

// Display in UI
<div>
  <h3>Recent Emails</h3>
  {emailActivity?.map((event) => (
    <div key={event.id}>
      <p>{event.subject}</p>
      <p>Sent: {formatDate(event.sentAt)}</p>
      {event.openedAt && <Badge>Opened</Badge>}
      {event.clickedAt && <Badge>Clicked</Badge>}
    </div>
  ))}
</div>
```

---

## User Preferences

### Preference UI Components

#### Email Settings Page

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export default function EmailPreferencesPage() {
  const { data: preferences, refetch } = trpc.emailCampaigns.getMyPreferences.useQuery();
  const updateMutation = trpc.emailCampaigns.updateMyPreferences.useMutation();

  const handleToggleCategory = async (category: string, enabled: boolean) => {
    await updateMutation.mutateAsync({
      categories: {
        [category]: enabled,
      },
    });
    refetch();
  };

  return (
    <div>
      <h1>Email Preferences</h1>
      
      <label>
        <input
          type="checkbox"
          checked={preferences?.emailEnabled}
          onChange={(e) =>
            updateMutation.mutate({ emailEnabled: e.target.checked })
          }
        />
        Enable email notifications
      </label>

      {preferences?.emailEnabled && (
        <div>
          <h2>Email Categories</h2>
          
          <label>
            <input
              type="checkbox"
              checked={preferences.categories.royaltyStatements}
              onChange={(e) =>
                handleToggleCategory('royaltyStatements', e.target.checked)
              }
            />
            Royalty Statements
          </label>

          <label>
            <input
              type="checkbox"
              checked={preferences.categories.licenseExpiry}
              onChange={(e) =>
                handleToggleCategory('licenseExpiry', e.target.checked)
              }
            />
            License Expiry Reminders
          </label>

          <label>
            <input
              type="checkbox"
              checked={preferences.categories.payouts}
              onChange={(e) =>
                handleToggleCategory('payouts', e.target.checked)
              }
            />
            Payout Notifications
          </label>

          <label>
            <input
              type="checkbox"
              checked={preferences.categories.projectInvitations}
              onChange={(e) =>
                handleToggleCategory('projectInvitations', e.target.checked)
              }
            />
            Project Invitations
          </label>

          <label>
            <input
              type="checkbox"
              checked={preferences.categories.newsletters}
              onChange={(e) =>
                handleToggleCategory('newsletters', e.target.checked)
              }
            />
            Monthly Newsletter
          </label>

          <label>
            <input
              type="checkbox"
              checked={preferences.categories.marketing}
              onChange={(e) =>
                handleToggleCategory('marketing', e.target.checked)
              }
            />
            Marketing Emails
          </label>
        </div>
      )}
    </div>
  );
}
```

### Unsubscribe Flow

**One-click unsubscribe from email:**

1. User clicks "Unsubscribe" link in email footer
2. Link contains signed token: `https://yesgoddess.com/unsubscribe?token=abc123`
3. Frontend verifies token and shows confirmation page
4. User confirms → tRPC mutation updates preferences

```typescript
// app/unsubscribe/page.tsx
'use client';

import { trpc } from '@/lib/trpc';
import { useSearchParams } from 'next/navigation';

export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { data: tokenData } = trpc.emailCampaigns.verifyUnsubscribeToken.useQuery(
    { token: token! },
    { enabled: !!token }
  );

  const unsubscribeMutation = trpc.emailCampaigns.unsubscribe.useMutation();

  const handleUnsubscribe = async () => {
    await unsubscribeMutation.mutateAsync({
      scope: 'all', // or 'category' if tokenData specifies
      token: token!,
    });
  };

  if (!tokenData) {
    return <div>Invalid or expired unsubscribe link</div>;
  }

  return (
    <div>
      <h1>Unsubscribe from YES GODDESS Emails</h1>
      <p>Are you sure you want to unsubscribe from all emails?</p>
      <button onClick={handleUnsubscribe}>Confirm Unsubscribe</button>
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Email Preferences UI

- [ ] **Create email preferences page** (`/settings/email`)
  - [ ] Fetch current preferences via `getMyPreferences`
  - [ ] Display toggle for `emailEnabled`
  - [ ] Display category toggles (8 categories)
  - [ ] Save changes via `updateMyPreferences`
  - [ ] Show success/error toast notifications
  - [ ] Handle loading and error states

- [ ] **Add unsubscribe page** (`/unsubscribe`)
  - [ ] Read `token` from query params
  - [ ] Verify token via `verifyUnsubscribeToken`
  - [ ] Show confirmation UI
  - [ ] Call `unsubscribe` mutation on confirm
  - [ ] Show success message with resubscribe link

- [ ] **Add resubscribe page** (`/resubscribe`)
  - [ ] Similar to unsubscribe flow
  - [ ] Call `resubscribe` mutation

### Phase 2: Email Activity Dashboard

- [ ] **Create email history section** (optional)
  - [ ] Fetch recent emails via tRPC query
  - [ ] Display list with subject, sent date, status
  - [ ] Show badges for opened/clicked
  - [ ] Filter by template type
  - [ ] Pagination support

### Phase 3: Email Verification Flow

- [ ] **Verify email page** (`/verify-email`)
  - [ ] Read verification token from query params
  - [ ] Call backend verification endpoint
  - [ ] Show success/error message
  - [ ] Redirect to dashboard on success

- [ ] **Resend verification button**
  - [ ] Add to settings page if email not verified
  - [ ] Call `resendVerification` endpoint
  - [ ] Rate limit handling (3 per hour)
  - [ ] Show countdown timer after send

### Phase 4: Error Handling

- [ ] **Handle email preference errors**
  - [ ] `EMAIL_NOT_VERIFIED` → redirect to verify page
  - [ ] `RATE_LIMIT_EXCEEDED` → show retry countdown
  - [ ] Generic errors → show support contact

- [ ] **Add user-friendly error messages**
  - [ ] Map backend error codes to UI messages
  - [ ] Use toast/alert components
  - [ ] Provide actionable next steps

### Phase 5: TypeScript Types

- [ ] **Copy types from backend** (or auto-generate)
  - [ ] Email preferences types
  - [ ] Email event types
  - [ ] Template prop types (if needed for previews)

- [ ] **Define tRPC client types**
  - [ ] Import from `@/lib/trpc`
  - [ ] Ensure type safety for queries/mutations

### Phase 6: UX Enhancements

- [ ] **Add tooltips** explaining each email category
- [ ] **Add preview** of each email type (optional)
- [ ] **Show last updated timestamp** for preferences
- [ ] **Add "Manage Preferences" link** to footer
- [ ] **GDPR compliance**
  - [ ] Export email data button
  - [ ] Delete email data button
  - [ ] Clear consent messaging

### Phase 7: Testing

- [ ] **Test email preference updates**
  - [ ] Toggle categories on/off
  - [ ] Disable all emails
  - [ ] Re-enable emails

- [ ] **Test unsubscribe flow**
  - [ ] Click unsubscribe link from test email
  - [ ] Verify token validation
  - [ ] Confirm unsubscribe works
  - [ ] Test resubscribe

- [ ] **Test error states**
  - [ ] Expired tokens
  - [ ] Rate limiting
  - [ ] Network errors

- [ ] **Cross-browser testing**
  - [ ] Chrome, Firefox, Safari, Edge
  - [ ] Mobile responsive

### Phase 8: Documentation

- [ ] **Add JSDoc comments** to components
- [ ] **Create Storybook stories** (optional)
- [ ] **Update README** with email preference setup
- [ ] **Document tRPC procedures** used

---

## Quick Reference

### tRPC Procedures

```typescript
// Get preferences
trpc.emailCampaigns.getMyPreferences.useQuery()

// Update preferences
trpc.emailCampaigns.updateMyPreferences.useMutation()

// Unsubscribe
trpc.emailCampaigns.unsubscribe.useMutation()

// Resubscribe
trpc.emailCampaigns.resubscribe.useMutation()

// Verify unsubscribe token
trpc.emailCampaigns.verifyUnsubscribeToken.useQuery({ token })

// Generate unsubscribe token (for manual links)
trpc.emailCampaigns.generateUnsubscribeToken.useMutation()

// Export email data (GDPR)
trpc.emailCampaigns.exportMyEmailData.useQuery()

// Delete email data (GDPR)
trpc.emailCampaigns.deleteMyEmailData.useMutation()
```

### Email Categories

```typescript
const categories = [
  'system',              // Cannot opt out
  'royaltyStatements',
  'licenseExpiry',
  'payouts',
  'projectInvitations',
  'newsletters',
  'marketing',
  'messages',
];
```

### Template Keys

```typescript
const templates = [
  'welcome-email',
  'email-verification',
  'password-reset',
  'password-changed',
  'royalty-statement',
  'royalty-statement-ready',
  'license-expiry',
  'license-expiry-90-day',
  'license-expiry-60-day',
  'license-expiry-30-day',
  'license-renewal-offer',
  'license-renewal-reminder',
  'license-renewal-complete',
  'payout-confirmation',
  'transaction-receipt',
  'project-invitation',
  'monthly-newsletter',
  'brand-welcome',
  'brand-verification-request',
  'brand-verification-complete',
  'brand-verification-rejected',
  'brand-team-invitation',
  'creator-welcome',
  'creator-verification-approved',
  'creator-verification-rejected',
  'role-changed',
  'new-message',
  'message-digest',
];
```

---

## Support & Resources

### Backend Team Contact
- **Email**: dev@yesgoddess.agency
- **Slack**: #backend-support

### Useful Links
- **Backend Repo**: https://github.com/machinesoul11/yg-backend
- **React Email Docs**: https://react.email
- **Resend Docs**: https://resend.com/docs
- **Brand Guidelines**: `/docs/brand/guidelines.md`

### Additional Documentation
- **Email Service Implementation**: `/docs/modules/email-service/EMAIL_SERVICE_IMPLEMENTATION.md`
- **Email Adapter Guide**: `/docs/frontend-integration/EMAIL_ADAPTER_INTEGRATION_GUIDE.md`
- **Email Template Quick Reference**: `/emails/QUICK_REFERENCE.md`

---

**Last Updated**: October 13, 2025  
**Version**: 1.0.0  
**Maintained By**: Backend Team @ YES GODDESS
