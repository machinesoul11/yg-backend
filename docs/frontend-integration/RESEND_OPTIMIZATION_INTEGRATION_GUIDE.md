# Resend Email Optimization - Frontend Integration Guide

**Classification: 🌐 SHARED**  
*Email optimization infrastructure is used by both public-facing website and admin backend*

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
9. [Real-time Updates](#real-time-updates)
10. [Pagination & Filtering](#pagination--filtering)
11. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Resend Email Optimization module provides comprehensive email management capabilities including:
- **Sender Reputation Monitoring** - Track and alert on email reputation metrics
- **Email Tracking** - Opens, clicks, bounces, complaints with full analytics
- **Unsubscribe Handling** - Granular category-based preferences and one-click unsubscribe
- **Email Scheduling** - Future-dated and recurring email sends with send-time optimization
- **A/B Testing** - Subject line, content, and send time testing with statistical analysis
- **Personalization** - Dynamic variable resolution and template personalization
- **Campaign Analytics** - Real-time metrics, link performance, device/geo breakdown

### Module Status
✅ **BACKEND COMPLETE** - All services implemented and tested  
⚠️ **FRONTEND PENDING** - Admin UI and user preference center needed

---

## API Endpoints

### Base URL
```
Production: https://ops.yesgoddess.agency
Development: http://localhost:3000
```

### Authentication
All endpoints require JWT authentication via session cookie or `Authorization: Bearer <token>` header.

### Endpoint Summary

| Endpoint | Method | Auth | Purpose | User Types |
|----------|--------|------|---------|------------|
| **Webhook (Internal)** |
| `/api/webhooks/resend` | POST | Webhook Secret | Resend event webhook | System |
| **User Preference Management (tRPC)** |
| `emailCampaigns.getMyPreferences` | Query | User | Get email preferences | All Users |
| `emailCampaigns.updateMyPreferences` | Mutation | User | Update preferences | All Users |
| `emailCampaigns.generateUnsubscribeToken` | Mutation | User | Generate unsubscribe token | All Users |
| `emailCampaigns.verifyUnsubscribeToken` | Query | User | Verify unsubscribe token | All Users |
| `emailCampaigns.unsubscribe` | Mutation | User | Global unsubscribe | All Users |
| `emailCampaigns.resubscribe` | Mutation | User | Opt back in | All Users |
| `emailCampaigns.exportMyEmailData` | Query | User | Export email data (GDPR) | All Users |
| `emailCampaigns.deleteMyEmailData` | Mutation | User | Delete email data (GDPR) | All Users |
| **Admin Analytics & Management (tRPC)** |
| `emailCampaigns.create` | Mutation | Admin | Create email campaign | Admin/Staff |
| `emailCampaigns.send` | Mutation | Admin | Send campaign | Admin/Staff |
| `emailCampaigns.getById` | Query | Admin | Get campaign details | Admin/Staff |
| `emailCampaigns.getAll` | Query | Admin | List all campaigns | Admin/Staff |
| `emailCampaigns.getRecipients` | Query | Admin | Get campaign recipients | Admin/Staff |

> **Note:** Most admin analytics endpoints are not yet exposed via tRPC. Admin features will use direct service calls for now. Future enhancement will add comprehensive admin tRPC routes.

---

## Request/Response Examples

### 1. Get User Email Preferences

**tRPC Query:**
```typescript
const preferences = await trpc.emailCampaigns.getMyPreferences.query();
```

**Response:**
```typescript
{
  id: "pref_abc123",
  userId: "user_xyz789",
  royaltyStatements: true,
  licenseExpiry: true,
  projectInvitations: true,
  messages: true,
  payouts: true,
  digestFrequency: "WEEKLY",
  newsletters: false,
  announcements: true,
  globalUnsubscribe: false,
  unsubscribedAt: null,
  categoryPreferences: {
    "productUpdates": true,
    "promotions": false
  },
  frequencyPreference: "daily",
  preferenceCenterLastVisited: "2025-10-12T14:30:00Z",
  createdAt: "2024-01-15T08:00:00Z",
  updatedAt: "2025-10-10T16:45:00Z"
}
```

**cURL Equivalent (tRPC HTTP):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/emailCampaigns.getMyPreferences \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<session>" \
  -d '{}'
```

---

### 2. Update Email Preferences

**tRPC Mutation:**
```typescript
const updated = await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: false,
  announcements: true,
  digestFrequency: "DAILY",
  categoryPreferences: {
    productUpdates: true,
    promotions: false
  }
});
```

**Request Schema:**
```typescript
{
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  digestFrequency?: "IMMEDIATE" | "DAILY" | "WEEKLY" | "NEVER";
  newsletters?: boolean;
  announcements?: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: "immediate" | "daily" | "weekly";
}
```

**Response:** Same as preferences object above

**Error Response (400):**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid digest frequency value"
  }
}
```

---

### 3. Generate Unsubscribe Token

**tRPC Mutation:**
```typescript
const token = await trpc.emailCampaigns.generateUnsubscribeToken.mutate();
```

**Response:**
```typescript
{
  token: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
}
```

**Usage in Email Template:**
```tsx
const unsubscribeUrl = `https://yesgoddess.com/unsubscribe?token=${token}`;
```

---

### 4. Unsubscribe (Global)

**tRPC Mutation:**
```typescript
await trpc.emailCampaigns.unsubscribe.mutate({
  email: "user@example.com",
  reason: "Too many emails",
  campaignId: "campaign_abc123", // Optional
  userAgent: navigator.userAgent,
  ipAddress: "192.168.1.1" // Optional, backend can capture
});
```

**Request Schema:**
```typescript
{
  email: string;
  campaignId?: string;
  categories?: string[]; // For category-specific unsubscribe
  reason?: string;
  userAgent?: string;
  ipAddress?: string;
}
```

**Response:**
```json
{
  "success": true
}
```

---

### 5. Resubscribe

**tRPC Mutation:**
```typescript
await trpc.emailCampaigns.resubscribe.mutate();
```

**Response:**
```json
{
  "success": true
}
```

> **Note:** Resubscribe removes global unsubscribe but does NOT automatically re-enable categories. User must update preferences separately.

---

### 6. Export Email Data (GDPR)

**tRPC Query:**
```typescript
const data = await trpc.emailCampaigns.exportMyEmailData.query();
```

**Response:**
```typescript
{
  personalInfo: {
    email: "user@example.com",
    name: "Jane Doe"
  },
  preferences: {
    // Full preferences object
  },
  recentEvents: [
    {
      id: "evt_123",
      eventType: "OPENED",
      email: "user@example.com",
      timestamp: "2025-10-13T10:30:00Z",
      messageId: "msg_456",
      userAgent: "Mozilla/5.0...",
      ipAddress: "192.168.1.1"
    }
    // Last 100 events
  ],
  unsubscribeHistory: [
    {
      id: "log_789",
      unsubscribeAction: "category",
      categoriesAffected: ["newsletters"],
      timestamp: "2025-09-15T14:20:00Z"
    }
  ],
  scheduledEmails: [
    {
      id: "sched_012",
      emailType: "reminder",
      subject: "License Expiring Soon",
      scheduledSendTime: "2025-11-01T10:00:00Z",
      status: "PENDING"
    }
  ]
}
```

---

### 7. Delete Email Data (GDPR - Right to be Forgotten)

**tRPC Mutation:**
```typescript
await trpc.emailCampaigns.deleteMyEmailData.mutate();
```

**Response:**
```json
{
  "success": true,
  "message": "Email data deleted successfully"
}
```

> **Warning:** This action is irreversible. All email events, preferences, and scheduled emails are permanently deleted.

---

### 8. Create Email Campaign (Admin)

**tRPC Mutation:**
```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: "October Newsletter",
  subject: "Your Monthly Update from YES GODDESS",
  templateId: "monthly-newsletter",
  recipientSegment: "active_creators",
  scheduledSendTime: "2025-10-15T10:00:00Z",
  personalizationData: {
    month: "October",
    year: "2025"
  }
});
```

**Request Schema:**
```typescript
{
  name: string; // Campaign name (internal)
  subject: string; // Email subject line
  templateId: string; // React Email template key
  recipientSegment: string; // "all" | "creators" | "brands" | "active_creators" etc.
  scheduledSendTime?: Date; // Optional, send immediately if not provided
  personalizationData?: Record<string, any>; // Template variables
  testId?: string; // Optional A/B test ID
}
```

**Response:**
```typescript
{
  id: "campaign_abc123",
  name: "October Newsletter",
  status: "DRAFT",
  createdAt: "2025-10-13T14:00:00Z"
}
```

---

### 9. Send Campaign (Admin)

**tRPC Mutation:**
```typescript
await trpc.emailCampaigns.send.mutate({
  id: "campaign_abc123"
});
```

**Response:**
```json
{
  "success": true,
  "recipientsQueued": 1523
}
```

---

### 10. Get Campaign Analytics (Admin - Direct Service Call)

> **Note:** Not yet exposed via tRPC. Admin frontend will import and use service directly.

**Service Import:**
```typescript
import { emailTrackingService } from '@/lib/services/email';
```

**Example:**
```typescript
const metrics = await emailTrackingService.getRealTimeMetrics('hour');

// Result:
{
  sent: 100,
  delivered: 98,
  opened: 45,
  clicked: 12,
  bounced: 2,
  complained: 0,
  deliveryRate: 0.98,
  openRate: 0.459,
  clickRate: 0.122,
  clickToOpenRate: 0.267
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// ============================================
// Email Preferences
// ============================================

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
  globalUnsubscribe: boolean;
  unsubscribedAt: Date | null;
  categoryPreferences: Record<string, boolean> | null;
  frequencyPreference: string;
  unsubscribeToken: string | null;
  preferenceCenterLastVisited: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DigestFrequency = "IMMEDIATE" | "DAILY" | "WEEKLY" | "NEVER";

export interface UpdatePreferencesInput {
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  digestFrequency?: DigestFrequency;
  newsletters?: boolean;
  announcements?: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: "immediate" | "daily" | "weekly";
}

// ============================================
// Unsubscribe
// ============================================

export interface UnsubscribeInput {
  email: string;
  campaignId?: string;
  categories?: string[];
  reason?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface UnsubscribeLog {
  id: string;
  userId: string;
  email: string;
  unsubscribeAction: "global" | "category" | "resubscribe";
  unsubscribeSource: "email_client" | "one_click" | "preference_center" | "campaign";
  campaignId: string | null;
  categoriesAffected: string[];
  previousPreferences: Record<string, any>;
  newPreferences: Record<string, any>;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

// ============================================
// Email Events
// ============================================

export type EmailEventType = 
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "BOUNCED"
  | "COMPLAINED"
  | "UNSUBSCRIBED";

export interface EmailEvent {
  id: string;
  messageId: string;
  eventType: EmailEventType;
  email: string;
  userId: string | null;
  timestamp: Date;
  userAgent: string | null;
  ipAddress: string | null;
  clickedUrl: string | null;
  uniqueOpen: boolean | null;
  deviceType: string | null;
  emailClient: string | null;
  operatingSystem: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  campaignId: string | null;
  testId: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

// ============================================
// Email Campaigns
// ============================================

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  templateId: string;
  recipientSegment: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  complainedCount: number;
  unsubscribedCount: number;
  scheduledSendTime: Date | null;
  sentAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignStatus = 
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "PAUSED"
  | "CANCELLED"
  | "FAILED";

export interface CreateCampaignInput {
  name: string;
  subject: string;
  templateId: string;
  recipientSegment: string;
  scheduledSendTime?: Date;
  personalizationData?: Record<string, any>;
  testId?: string;
}

// ============================================
// Reputation Metrics (Admin)
// ============================================

export interface ReputationMetrics {
  bounceRate: number;
  complaintRate: number;
  deliveryRate: number;
  openRate?: number;
  clickRate?: number;
  spamScore?: number;
  reputationScore: number;
}

export interface ReputationAlert {
  severity: "info" | "warning" | "critical";
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  recommendation: string;
}

// ============================================
// A/B Testing (Admin)
// ============================================

export interface EmailTest {
  id: string;
  name: string;
  description: string | null;
  testType: "subject_line" | "content" | "send_time" | "from_name";
  variants: EmailTestVariant[];
  allocationPercentage: Record<string, number>;
  primaryMetric: "open_rate" | "click_rate" | "conversion_rate";
  status: EmailTestStatus;
  startDate: Date | null;
  endDate: Date | null;
  winnerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EmailTestStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export interface EmailTestVariant {
  id: string;
  name: string;
  changes: Record<string, any>;
}

// ============================================
// Scheduled Emails
// ============================================

export interface ScheduledEmail {
  id: string;
  emailType: string;
  recipientUserId: string | null;
  recipientEmail: string;
  templateId: string;
  subject: string;
  personalizationData: Record<string, any>;
  scheduledSendTime: Date;
  timezone: string | null;
  optimizeSendTime: boolean;
  recurrencePattern: string | null;
  status: ScheduledEmailStatus;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ScheduledEmailStatus = 
  | "PENDING"
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

// ============================================
// Personalization
// ============================================

export interface PersonalizationData {
  // User variables
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  
  // Account variables
  accountAge?: string;
  lastLoginDate?: string;
  memberSince?: string;
  
  // Creator-specific
  stageName?: string;
  portfolioUrl?: string;
  lastRoyaltyAmount?: string;
  totalEarnings?: string;
  activeProjects?: number;
  
  // Brand-specific
  brandName?: string;
  companyName?: string;
  activeLicenses?: number;
  
  // Dynamic
  recentActivity?: string[];
  upcomingDeadlines?: Array<{ title: string; date: string }>;
}

// ============================================
// Analytics (Admin)
// ============================================

export interface CampaignAnalytics {
  campaignId: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  complained: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  unsubscribeRate: number;
  complaintRate: number;
  linkPerformance: LinkPerformance[];
  deviceBreakdown: DeviceBreakdown;
  geoBreakdown: GeoBreakdown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkPerformance {
  url: string;
  totalClicks: number;
  uniqueClicks: number;
  clickRate: number;
}

export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
  unknown: number;
}

export interface GeoBreakdown {
  country: string;
  region: string | null;
  clicks: number;
  opens: number;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

// Update Preferences Schema
export const updateEmailPreferencesSchema = z.object({
  royaltyStatements: z.boolean().optional(),
  licenseExpiry: z.boolean().optional(),
  projectInvitations: z.boolean().optional(),
  messages: z.boolean().optional(),
  payouts: z.boolean().optional(),
  digestFrequency: z.enum(['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER']).optional(),
  newsletters: z.boolean().optional(),
  announcements: z.boolean().optional(),
  categoryPreferences: z.record(z.string(), z.boolean()).optional(),
  frequencyPreference: z.enum(['immediate', 'daily', 'weekly']).optional(),
});

// Unsubscribe Schema
export const unsubscribeSchema = z.object({
  email: z.string().email(),
  campaignId: z.string().optional(),
  categories: z.array(z.string()).optional(),
  reason: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
});

// Create Campaign Schema (Admin)
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(255),
  templateId: z.string().min(1),
  recipientSegment: z.string().min(1),
  scheduledSendTime: z.date().optional(),
  personalizationData: z.record(z.string(), z.any()).optional(),
  testId: z.string().optional(),
});
```

---

## Business Logic & Validation Rules

### Email Preferences

#### Validation Rules
- **digestFrequency**: Must be one of `IMMEDIATE`, `DAILY`, `WEEKLY`, `NEVER`
- **categoryPreferences**: Keys are category strings, values are booleans
- **All preference fields**: Optional, only provided fields are updated
- **Global Unsubscribe**: When true, overrides all category preferences

#### Business Rules
1. **Global Unsubscribe Priority**
   - If `globalUnsubscribe = true`, all emails are blocked regardless of category preferences
   - User must call `resubscribe()` before updating individual categories

2. **Transactional Emails**
   - Critical transactional emails (password reset, email verification) ALWAYS sent
   - These bypass preference checks for security/functionality

3. **Frequency Preference**
   - `IMMEDIATE`: Emails sent as events occur
   - `DAILY`: Aggregated into daily digest (sent at 9 AM recipient timezone)
   - `WEEKLY`: Aggregated into weekly digest (sent Monday 9 AM)
   - `NEVER`: No digest emails, only individual opt-ins

4. **Preference Updates**
   - Changes take effect immediately
   - Cache invalidated on update
   - Audit log entry created

### Unsubscribe Handling

#### One-Click Unsubscribe
- Token-based, no login required
- Token valid indefinitely (hashed SHA-256 in database)
- URL format: `https://yesgoddess.com/unsubscribe?token={token}`

#### Compliance Requirements
1. **Audit Trail**: All unsubscribe actions logged with:
   - User ID
   - Email address
   - Source (email_client, one_click, preference_center, campaign)
   - Categories affected
   - Previous and new preferences
   - User agent and IP address
   - Timestamp

2. **Immediate Effect**: Unsubscribe processed instantly, no confirmation email sent

3. **Suppression List**: Email added to suppression list to prevent accidental sends

### Email Scheduling

#### Send Time Optimization
- If `optimizeSendTime = true`, backend analyzes user's past engagement
- Email sent at historically optimal time within ±2 hours of requested time
- Falls back to requested time if insufficient data

#### Recurrence Patterns
- Supports cron-like patterns: `"daily"`, `"weekly"`, `"monthly"`
- Custom patterns: `"0 9 * * 1"` (Every Monday at 9 AM)

#### Frequency Capping
- Maximum 10 emails per user per day (configurable)
- Checked before sending scheduled emails
- Exceeding cap results in email being skipped (status: CANCELLED)

### A/B Testing

#### Statistical Significance
- Minimum 100 recipients per variant before calculating results
- Confidence level: 95% required for winner declaration
- Tests run for minimum 24 hours before results are valid

#### Variant Assignment
- Deterministic based on email hash (same user always gets same variant)
- Allocation percentage must sum to 100%
- Variant ID sent in email metadata for tracking

---

## Error Handling

### HTTP Status Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid input, validation failed |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions (user trying to access admin endpoint) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate campaign name, already unsubscribed |
| 429 | Rate Limit | Too many requests in time window |
| 500 | Server Error | Unexpected backend error |

### Error Response Format

```typescript
{
  "error": {
    "code": string; // Machine-readable error code
    "message": string; // Human-readable message
    "details"?: any; // Optional additional context
  }
}
```

### Error Codes

#### User Preference Errors

| Code | HTTP | Message | User-Friendly Message |
|------|------|---------|----------------------|
| `PREFERENCES_NOT_FOUND` | 404 | User preferences not found | We couldn't find your email preferences. Please contact support. |
| `INVALID_DIGEST_FREQUENCY` | 400 | Invalid digest frequency value | Please select a valid digest frequency option. |
| `INVALID_CATEGORY` | 400 | Unknown preference category | The email category you selected is not recognized. |
| `GLOBAL_UNSUBSCRIBE_ACTIVE` | 400 | Cannot update preferences while globally unsubscribed | You're currently unsubscribed from all emails. Click "Resubscribe" to manage individual categories. |

#### Unsubscribe Errors

| Code | HTTP | Message | User-Friendly Message |
|------|------|---------|----------------------|
| `INVALID_UNSUBSCRIBE_TOKEN` | 400 | Invalid or expired unsubscribe token | This unsubscribe link is invalid or has expired. Please use the link from your most recent email. |
| `USER_NOT_FOUND` | 404 | User with email not found | We couldn't find an account with this email address. |
| `ALREADY_UNSUBSCRIBED` | 409 | User is already unsubscribed | You've already unsubscribed from these emails. |

#### Campaign Errors (Admin)

| Code | HTTP | Message | User-Friendly Message |
|------|------|---------|----------------------|
| `CAMPAIGN_NOT_FOUND` | 404 | Campaign not found | This campaign doesn't exist. |
| `INVALID_TEMPLATE` | 400 | Email template not found | The email template specified doesn't exist. |
| `CAMPAIGN_ALREADY_SENT` | 409 | Campaign already sent | This campaign has already been sent and cannot be modified. |
| `NO_RECIPIENTS` | 400 | No recipients match segment | No users match the recipient segment criteria. |
| `SEND_IN_PROGRESS` | 409 | Campaign is currently sending | This campaign is currently being sent. Please wait. |

### Error Handling Best Practices

#### 1. Display Appropriate Error Messages

```typescript
try {
  await trpc.emailCampaigns.updateMyPreferences.mutate(data);
  toast.success('Preferences updated successfully');
} catch (error) {
  if (error.data?.code === 'GLOBAL_UNSUBSCRIBE_ACTIVE') {
    toast.error("You're currently unsubscribed from all emails. Resubscribe first to manage categories.");
  } else {
    toast.error('Failed to update preferences. Please try again.');
  }
}
```

#### 2. Graceful Degradation

```typescript
// If preferences load fails, show defaults
const { data: preferences, error } = trpc.emailCampaigns.getMyPreferences.useQuery();

const prefs = preferences ?? {
  royaltyStatements: true,
  licenseExpiry: true,
  newsletters: false,
  // ... defaults
};
```

#### 3. Retry Logic for Transient Errors

```typescript
import { useQuery } from '@tanstack/react-query';

const { data } = useQuery({
  queryKey: ['emailPreferences'],
  queryFn: () => trpc.emailCampaigns.getMyPreferences.query(),
  retry: 3, // Retry up to 3 times
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
});
```

---

## Authorization & Permissions

### User Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| `USER` | Standard user (creator or brand) | Own preferences only |
| `ADMIN` | Platform administrator | All email management & analytics |
| `STAFF` | Customer support staff | Campaign analytics (read-only) |

### Endpoint Permissions

#### User Endpoints (All Authenticated Users)

```typescript
// ✅ Any authenticated user can:
emailCampaigns.getMyPreferences()      // Read own preferences
emailCampaigns.updateMyPreferences()   // Update own preferences
emailCampaigns.unsubscribe()           // Unsubscribe self
emailCampaigns.resubscribe()           // Resubscribe self
emailCampaigns.generateUnsubscribeToken() // Generate token for self
emailCampaigns.exportMyEmailData()     // Export own data
emailCampaigns.deleteMyEmailData()     // Delete own data
```

#### Admin Endpoints

```typescript
// ❌ Requires ADMIN role:
emailCampaigns.create()                // Create campaign
emailCampaigns.send()                  // Send campaign
emailCampaigns.getAll()                // List all campaigns
emailCampaigns.getById()               // View any campaign
emailCampaigns.getRecipients()         // View campaign recipients

// 🔧 Direct service imports (admin pages only):
import { emailReputationService } from '@/lib/services/email';
import { emailTrackingService } from '@/lib/services/email';
import { abTestingService } from '@/lib/services/email';
```

### Authorization Checks

#### Frontend (tRPC)
```typescript
// tRPC automatically handles auth via middleware
// No additional checks needed in frontend code

// Example: This will throw 401 if not authenticated
const preferences = await trpc.emailCampaigns.getMyPreferences.query();

// This will throw 403 if not admin
const campaign = await trpc.emailCampaigns.create.mutate(data);
```

#### Session Validation
```typescript
// Check user role before showing admin features
import { useSession } from 'next-auth/react';

function CampaignDashboard() {
  const { data: session } = useSession();
  
  if (session?.user.role !== 'ADMIN') {
    return <p>Access denied. Admin privileges required.</p>;
  }
  
  return <AdminCampaignUI />;
}
```

### Field-Level Permissions

All users have full access to their own preference fields. No field-level restrictions.

Admin users can read (but not modify) user preferences for support purposes.

---

## Rate Limiting & Quotas

### Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `getMyPreferences` | 100 requests | 1 minute | Per user |
| `updateMyPreferences` | 10 requests | 1 minute | Per user |
| `unsubscribe` | 5 requests | 1 hour | Per email |
| `generateUnsubscribeToken` | 5 requests | 1 hour | Per user |
| `exportMyEmailData` | 3 requests | 1 hour | Per user |
| Admin campaign endpoints | 50 requests | 1 minute | Per admin |

### Rate Limit Headers

The backend doesn't currently return rate limit headers, but may in the future:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697200000
```

### Quota Limits

| Resource | Limit | Scope |
|----------|-------|-------|
| Active campaigns | 10 | Per admin (simultaneous) |
| Scheduled emails per user | 50 | Per user (pending/queued) |
| Email events retention | 90 days | All users |
| A/B tests | 5 active | Platform-wide |

### Handling Rate Limits

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  await trpc.emailCampaigns.updateMyPreferences.mutate(data);
} catch (error) {
  if (error instanceof TRPCClientError && error.data?.httpStatus === 429) {
    toast.error('Too many requests. Please wait a moment and try again.');
    // Optional: Show countdown timer
  }
}
```

---

## Real-time Updates

### Webhook Events

The backend processes email events from Resend via webhook:

**Endpoint:** `POST /api/webhooks/resend`  
**Auth:** Webhook signature verification (HMAC-SHA256)

**Event Types:**
- `email.sent` → Stored as `SENT`
- `email.delivered` → Stored as `DELIVERED`
- `email.opened` → Stored as `OPENED`
- `email.clicked` → Stored as `CLICKED`
- `email.bounced` → Stored as `BOUNCED`
- `email.complained` → Stored as `COMPLAINED`

### Polling for Updates

For admin dashboards showing real-time campaign analytics:

```typescript
import { useQuery } from '@tanstack/react-query';
import { emailTrackingService } from '@/lib/services/email';

function CampaignAnalytics({ campaignId }: { campaignId: string }) {
  const { data: analytics } = useQuery({
    queryKey: ['campaignAnalytics', campaignId],
    queryFn: async () => {
      // Direct service call (admin only)
      return emailTrackingService.getRealTimeMetrics('hour');
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });
  
  return (
    <div>
      <p>Sent: {analytics?.sent}</p>
      <p>Delivered: {analytics?.delivered}</p>
      <p>Opened: {analytics?.opened} ({(analytics?.openRate * 100).toFixed(1)}%)</p>
      <p>Clicked: {analytics?.clicked} ({(analytics?.clickRate * 100).toFixed(1)}%)</p>
    </div>
  );
}
```

### WebSocket / SSE

**Not currently implemented.** Future enhancement may add WebSocket connections for:
- Live campaign send progress
- Real-time open/click notifications
- Reputation score alerts

For now, use polling with appropriate intervals:
- Campaign dashboard: 30-60 seconds
- Reputation monitoring: 5 minutes
- User preference changes: No polling needed (instant update)

---

## Pagination & Filtering

### Campaign List (Admin)

**tRPC Query:**
```typescript
const { data } = trpc.emailCampaigns.getAll.useQuery({
  limit: 50,
  cursor: lastCampaignCreatedAt,
  status: 'SENT', // Optional filter
});
```

**Response:**
```typescript
{
  campaigns: EmailCampaign[];
  nextCursor?: string; // ISO timestamp of last item
}
```

**Pagination Format:** Cursor-based (timestamp)

**Available Filters:**
- `status`: `DRAFT` | `SCHEDULED` | `SENDING` | `SENT` | `PAUSED` | `CANCELLED` | `FAILED`
- `createdAfter`: ISO timestamp
- `createdBefore`: ISO timestamp

**Sorting:** Always `createdAt DESC`

### Campaign Recipients (Admin)

**tRPC Query:**
```typescript
const { data } = trpc.emailCampaigns.getRecipients.useQuery({
  id: campaignId,
  status: 'OPENED', // Optional filter
  limit: 100,
  cursor: lastRecipientCreatedAt,
});
```

**Available Filters:**
- `status`: `SENT` | `DELIVERED` | `OPENED` | `CLICKED` | `BOUNCED` | `FAILED` | `UNSUBSCRIBED` | `COMPLAINED`

### Email Events (Admin - Direct Service)

```typescript
import { prisma } from '@/lib/db';

const events = await prisma.emailEvent.findMany({
  where: {
    campaignId: 'campaign_abc123',
    eventType: 'CLICKED',
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
  },
  orderBy: { createdAt: 'desc' },
  take: 100,
  skip: page * 100,
});
```

---

## Frontend Implementation Checklist

### Phase 1: User Preference Center (Public Website)

#### Setup
- [ ] Install dependencies: `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`
- [ ] Configure tRPC client with authentication
- [ ] Set up React Query provider in app layout

#### UI Components
- [ ] **Preference Center Page** (`/preferences` or `/settings/emails`)
  - [ ] Header with "Email Preferences" title
  - [ ] Loading skeleton while fetching preferences
  - [ ] Category toggles with descriptions:
    - [ ] Royalty Statements
    - [ ] License Expiry Reminders
    - [ ] Project Invitations
    - [ ] Direct Messages
    - [ ] Payout Notifications
    - [ ] Newsletter (optional marketing)
    - [ ] Platform Announcements
  - [ ] Digest frequency selector (IMMEDIATE, DAILY, WEEKLY, NEVER)
  - [ ] "Save Changes" button with loading state
  - [ ] Success/error toast notifications
  - [ ] "Unsubscribe from all" link (warning modal)

- [ ] **Unsubscribe Page** (`/unsubscribe?token=...`)
  - [ ] Token validation on load
  - [ ] One-click unsubscribe button (no login required)
  - [ ] "Manage preferences" link (redirects to login)
  - [ ] Confirmation message after unsubscribe
  - [ ] Option to resubscribe (if applicable)

- [ ] **Resubscribe Confirmation**
  - [ ] Success message
  - [ ] Link to preference center to re-enable categories

#### API Integration
- [ ] Query: `emailCampaigns.getMyPreferences`
- [ ] Mutation: `emailCampaigns.updateMyPreferences`
- [ ] Mutation: `emailCampaigns.generateUnsubscribeToken` (for account settings)
- [ ] Query: `emailCampaigns.verifyUnsubscribeToken` (unsubscribe page)
- [ ] Mutation: `emailCampaigns.unsubscribe` (unsubscribe page)
- [ ] Mutation: `emailCampaigns.resubscribe`

#### Edge Cases
- [ ] Handle missing preferences (create defaults)
- [ ] Show informational message if globally unsubscribed
- [ ] Disable category toggles if globally unsubscribed
- [ ] Validate at least one transactional category remains enabled
- [ ] Handle expired/invalid unsubscribe tokens gracefully

---

### Phase 2: Admin Campaign Management (Admin Backend)

#### UI Components
- [ ] **Campaign Dashboard** (`/admin/emails/campaigns`)
  - [ ] Campaign list with status badges
  - [ ] Filter by status (DRAFT, SENT, SCHEDULED, etc.)
  - [ ] Search by campaign name
  - [ ] "Create Campaign" button
  - [ ] Pagination controls

- [ ] **Create/Edit Campaign Form** (`/admin/emails/campaigns/new`)
  - [ ] Campaign name input
  - [ ] Subject line input (character counter)
  - [ ] Template selector dropdown
  - [ ] Recipient segment selector
  - [ ] Scheduled send time picker (optional)
  - [ ] Personalization data JSON editor
  - [ ] Preview button (open React Email preview)
  - [ ] "Save Draft" / "Schedule" / "Send Now" buttons

- [ ] **Campaign Analytics View** (`/admin/emails/campaigns/[id]`)
  - [ ] Header with campaign name and status
  - [ ] Key metrics cards:
    - [ ] Sent count
    - [ ] Delivery rate (with chart)
    - [ ] Open rate (with chart)
    - [ ] Click rate (with chart)
    - [ ] Bounce rate (with warning if > 2%)
    - [ ] Complaint rate (with warning if > 0.1%)
  - [ ] Link performance table (top clicked URLs)
  - [ ] Device breakdown chart (desktop/mobile/tablet)
  - [ ] Geographic breakdown map/table
  - [ ] Real-time updates (30s polling)
  - [ ] Export to CSV button

- [ ] **Recipient List** (`/admin/emails/campaigns/[id]/recipients`)
  - [ ] Table with columns:
    - [ ] Email
    - [ ] Status (badge)
    - [ ] Sent at
    - [ ] Opened at (if applicable)
    - [ ] Clicked at (if applicable)
  - [ ] Filter by status
  - [ ] Search by email
  - [ ] Pagination (100 per page)
  - [ ] Export to CSV

#### API Integration
- [ ] Mutation: `emailCampaigns.create`
- [ ] Mutation: `emailCampaigns.send`
- [ ] Query: `emailCampaigns.getAll` (with pagination)
- [ ] Query: `emailCampaigns.getById`
- [ ] Query: `emailCampaigns.getRecipients` (with pagination)
- [ ] Direct service: `emailTrackingService.getRealTimeMetrics()` (polling)

---

### Phase 3: Admin Reputation Monitoring (Admin Backend)

#### UI Components
- [ ] **Reputation Dashboard** (`/admin/emails/reputation`)
  - [ ] Current reputation score (large display)
  - [ ] Status indicator (good/warning/critical)
  - [ ] Key metrics cards:
    - [ ] Bounce rate (last 30 days)
    - [ ] Complaint rate (last 30 days)
    - [ ] Delivery rate (last 30 days)
  - [ ] Historical chart (reputation score over time)
  - [ ] Active alerts section (if any)
  - [ ] Blacklist status indicator
  - [ ] Domain authentication status (SPF, DKIM, DMARC)
  - [ ] Refresh button (manual reputation check)

- [ ] **Alert Details Modal**
  - [ ] Alert severity badge
  - [ ] Metric name and current value
  - [ ] Threshold exceeded
  - [ ] Recommendation text
  - [ ] "Mark as Resolved" button
  - [ ] View related campaigns link

#### API Integration (Direct Service Imports)
- [ ] `emailReputationService.getCurrentReputationScore(domain)`
- [ ] `emailReputationService.calculateReputationMetrics(domain)`
- [ ] `emailReputationService.checkBlacklists(domain)`
- [ ] `emailReputationService.shouldPauseSending(domain)`

---

### Phase 4: Admin A/B Testing (Admin Backend)

#### UI Components
- [ ] **A/B Test List** (`/admin/emails/tests`)
  - [ ] Test list with status
  - [ ] Filter by status (DRAFT, ACTIVE, COMPLETED)
  - [ ] "Create Test" button

- [ ] **Create A/B Test Form** (`/admin/emails/tests/new`)
  - [ ] Test name input
  - [ ] Test type selector (subject line, content, send time, from name)
  - [ ] Variants builder:
    - [ ] Variant name input
    - [ ] Changes JSON editor (per variant)
    - [ ] Allocation percentage slider
  - [ ] Primary metric selector (open rate, click rate, conversion rate)
  - [ ] Duration settings (start/end date)
  - [ ] "Save Draft" / "Start Test" buttons

- [ ] **A/B Test Results** (`/admin/emails/tests/[id]`)
  - [ ] Header with test name and status
  - [ ] Variants comparison table:
    - [ ] Variant name
    - [ ] Recipients
    - [ ] Primary metric value
    - [ ] Confidence level
    - [ ] Winner badge (if applicable)
  - [ ] Statistical significance indicator
  - [ ] "Declare Winner" button (if confident enough)
  - [ ] "Archive Test" button

#### API Integration (Direct Service Imports)
- [ ] `abTestingService.createTest(params)`
- [ ] `abTestingService.startTest(testId)`
- [ ] `abTestingService.getTestResults(testId)`
- [ ] `abTestingService.declareWinner(testId, variantId)`

---

### Phase 5: GDPR Compliance (Both Admin & User)

#### User Features
- [ ] **Export Data** (`/settings/data-export` or in preference center)
  - [ ] "Download My Email Data" button
  - [ ] Loading state during export generation
  - [ ] Download as JSON file
  - [ ] Explanation of what's included

- [ ] **Delete Data** (`/settings/data-deletion` or in preference center)
  - [ ] "Delete My Email Data" button
  - [ ] Warning modal explaining consequences
  - [ ] Confirmation checkbox "I understand this is permanent"
  - [ ] Final confirmation button
  - [ ] Success message

#### API Integration
- [ ] Query: `emailCampaigns.exportMyEmailData`
- [ ] Mutation: `emailCampaigns.deleteMyEmailData`

---

### Testing Checklist

#### Unit Tests
- [ ] Preference updates with various combinations
- [ ] Unsubscribe token generation and verification
- [ ] Global unsubscribe prevents category updates
- [ ] Resubscribe clears global unsubscribe

#### Integration Tests
- [ ] Full preference update flow (fetch → update → refetch)
- [ ] Unsubscribe from email link (token flow)
- [ ] Campaign creation and sending
- [ ] A/B test creation and result calculation

#### E2E Tests (Playwright/Cypress)
- [ ] User navigates to preference center, updates categories, sees success
- [ ] User clicks unsubscribe link in email, confirms, sees confirmation page
- [ ] Admin creates campaign, sends test email, views analytics
- [ ] Admin creates A/B test, views results after sends

---

### UX Considerations

#### 1. Clear Communication
- **Do:** Use plain language for preference descriptions
  - ✅ "Royalty Statements - Monthly earnings reports"
  - ❌ "ROY_STMT notifications"
  
- **Do:** Explain digest frequency options
  - ✅ "Daily - Receive one email per day summarizing activity"
  - ❌ "Daily digest"

#### 2. Visual Feedback
- **Loading States:** Show skeleton loaders while fetching preferences
- **Success Feedback:** Toast notification with checkmark icon
- **Error Feedback:** Toast with error icon and retry button
- **Optimistic Updates:** Update UI immediately, revert on error

#### 3. Progressive Disclosure
- **Default View:** Show common categories only
- **Advanced:** Collapsible section for custom categories
- **Admin:** Show advanced metrics in separate tabs

#### 4. Accessibility
- [ ] Keyboard navigation for all forms
- [ ] ARIA labels for screen readers
- [ ] Focus indicators on interactive elements
- [ ] Color contrast ratios meet WCAG AA standards
- [ ] Error messages announced to screen readers

#### 5. Mobile Responsiveness
- [ ] Preference toggles stack vertically on mobile
- [ ] Campaign dashboard shows simplified view on mobile
- [ ] Charts resize appropriately
- [ ] Touch targets are minimum 44x44px

---

### Performance Optimizations

#### 1. Data Fetching
```typescript
// Prefetch preferences on authenticated routes
import { trpc } from '@/lib/trpc';
import { useSession } from 'next-auth/react';

function App() {
  const { data: session } = useSession();
  const utils = trpc.useContext();
  
  // Prefetch preferences when authenticated
  useEffect(() => {
    if (session?.user) {
      utils.emailCampaigns.getMyPreferences.prefetch();
    }
  }, [session, utils]);
  
  return <AppContent />;
}
```

#### 2. Caching Strategy
```typescript
// Configure React Query cache times
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      cacheTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});
```

#### 3. Optimistic Updates
```typescript
const updatePreferences = trpc.emailCampaigns.updateMyPreferences.useMutation({
  onMutate: async (newPrefs) => {
    // Cancel outgoing refetches
    await utils.emailCampaigns.getMyPreferences.cancel();
    
    // Snapshot previous value
    const previous = utils.emailCampaigns.getMyPreferences.getData();
    
    // Optimistically update
    utils.emailCampaigns.getMyPreferences.setData(undefined, (old) => ({
      ...old!,
      ...newPrefs,
    }));
    
    return { previous };
  },
  onError: (err, newPrefs, context) => {
    // Rollback on error
    utils.emailCampaigns.getMyPreferences.setData(undefined, context?.previous);
  },
  onSettled: () => {
    // Refetch to sync with server
    utils.emailCampaigns.getMyPreferences.invalidate();
  },
});
```

---

### Security Considerations

#### 1. Token Handling
- **Never expose unsubscribe tokens in client-side logs**
- **Validate tokens on backend before processing**
- **Use HTTPS for all unsubscribe links**

#### 2. Input Sanitization
- **Frontend:** Validate all user inputs before sending to backend
- **Backend:** Always validates and sanitizes (don't rely on frontend)
- **Example:** Trim whitespace, check max lengths, validate email formats

#### 3. CSRF Protection
- **Session cookies:** `SameSite=Lax` attribute
- **tRPC:** Built-in CSRF protection via custom headers
- **Unsubscribe links:** Token-based, no session required (safe for GET)

#### 4. Data Privacy
- **Email addresses:** Never display full email in analytics (show partial: `u***@example.com`)
- **IP addresses:** Not shown to users, admin-only for debugging
- **User agents:** Not shown to users, admin-only for analytics

---

## Quick Reference

### Import Statements

```typescript
// tRPC Client
import { trpc } from '@/lib/trpc';

// Service Imports (Admin Only)
import { emailReputationService } from '@/lib/services/email';
import { emailTrackingService } from '@/lib/services/email';
import { abTestingService } from '@/lib/services/email';
import { personalizationService } from '@/lib/services/email';

// Types
import type { 
  EmailPreferences, 
  UpdatePreferencesInput,
  EmailCampaign,
  CampaignAnalytics 
} from '@/types/email';
```

### Common Queries

```typescript
// Get preferences
const { data } = trpc.emailCampaigns.getMyPreferences.useQuery();

// Update preferences
const mutation = trpc.emailCampaigns.updateMyPreferences.useMutation();
await mutation.mutateAsync({ newsletters: false });

// Unsubscribe
const unsubscribe = trpc.emailCampaigns.unsubscribe.useMutation();
await unsubscribe.mutateAsync({ email: 'user@example.com' });

// Export data
const { data } = trpc.emailCampaigns.exportMyEmailData.useQuery();
```

### Environment Variables

```env
# Required for backend (already set)
RESEND_API_KEY=re_...
RESEND_SENDER_EMAIL=no-reply@yesgoddess.com
RESEND_SENDER_DOMAIN=yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_...

# Frontend (Next.js public)
NEXT_PUBLIC_APP_URL=https://yesgoddess.com
```

---

## Support & Resources

### Backend Documentation
- [Resend Optimization Implementation](/docs/infrastructure/email/RESEND_OPTIMIZATION.md)
- [Email Service API Reference](/docs/modules/email-service/API_REFERENCE.md)
- [Email Campaigns Implementation](/docs/modules/email-campaigns/COMPLETE_IMPLEMENTATION.md)

### External Resources
- [Resend API Docs](https://resend.com/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [React Query Documentation](https://tanstack.com/query/latest)

### Contact
For questions or issues, contact the backend team or open an issue in the repository.

---

**Last Updated:** October 13, 2025  
**Backend Version:** 1.0.0  
**Status:** ✅ Backend Complete, ⚠️ Frontend Pending
