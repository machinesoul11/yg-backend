# Email Campaigns Module - Frontend Integration Guide

**Classification:** 🌐 SHARED
- Transactional emails sent to all users (creators, brands)
- Admin-triggered campaigns (approvals, notifications)
- Email preference center for all users
- GDPR compliance features for all users

**Version:** 1.0.0  
**Last Updated:** December 2024

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Request/Response Examples](#requestresponse-examples)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)
8. [Real-time Updates](#real-time-updates)
9. [Pagination & Filtering](#pagination--filtering)
10. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## API Endpoints

All endpoints use **tRPC** with the following base routers:
- `emailCampaigns` - Core campaign management and user preferences
- `emailCampaignsEnhanced` - Advanced segmentation, analytics, and GDPR features

### Admin-Only Campaign Management

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `emailCampaigns.create` | mutation | Create new campaign | Admin |
| `emailCampaigns.update` | mutation | Update campaign (DRAFT/SCHEDULED only) | Admin |
| `emailCampaigns.schedule` | mutation | Schedule campaign for sending | Admin |
| `emailCampaigns.cancel` | mutation | Cancel scheduled/sending campaign | Admin |
| `emailCampaigns.sendTest` | mutation | Send test emails to specific addresses | Admin |
| `emailCampaigns.get` | query | Get single campaign details | Admin |
| `emailCampaigns.list` | query | List campaigns with filters | Admin |
| `emailCampaigns.analytics` | query | Get campaign analytics | Admin |
| `emailCampaigns.recipients` | query | List campaign recipients | Admin |

### Admin-Only Segmentation

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `emailCampaignsEnhanced.previewSegment` | query | Preview segment size before creating campaign | Admin |
| `emailCampaignsEnhanced.createSavedSegment` | mutation | Create reusable segment | Admin |
| `emailCampaignsEnhanced.updateSavedSegment` | mutation | Update saved segment | Admin |
| `emailCampaignsEnhanced.deleteSavedSegment` | mutation | Delete saved segment | Admin |
| `emailCampaignsEnhanced.listSavedSegments` | query | List saved segments | Admin |
| `emailCampaignsEnhanced.analyzeAudienceOverlap` | query | Check audience overlap with recent campaigns | Admin |

### Admin-Only Analytics

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `emailCampaignsEnhanced.getCampaignPerformance` | query | Comprehensive campaign metrics | Admin |
| `emailCampaignsEnhanced.getLinkPerformance` | query | Link click performance | Admin |
| `emailCampaignsEnhanced.getDeviceBreakdown` | query | Device analytics (mobile/desktop/tablet) | Admin |
| `emailCampaignsEnhanced.getHourlyBreakdown` | query | Hourly send/open/click patterns | Admin |
| `emailCampaignsEnhanced.compareCampaigns` | query | Compare multiple campaigns | Admin |
| `emailCampaignsEnhanced.getCampaignTrends` | query | Campaign trends over time | Admin |
| `emailCampaignsEnhanced.generateCampaignReport` | query | Full campaign report with recommendations | Admin |

### User-Facing Preference Center

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `emailCampaigns.getMyPreferences` | query | Get current user's email preferences | User |
| `emailCampaigns.updateMyPreferences` | mutation | Update email preferences | User |
| `emailCampaigns.generateUnsubscribeToken` | mutation | Generate secure unsubscribe token | User |
| `emailCampaigns.verifyUnsubscribeToken` | query | Verify unsubscribe token validity | User |
| `emailCampaigns.unsubscribe` | mutation | Global or category-specific unsubscribe | User |
| `emailCampaigns.resubscribe` | mutation | Opt back into emails | User |

### GDPR Compliance

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `emailCampaigns.exportMyEmailData` | query | Export all user email data (JSON) | User |
| `emailCampaigns.deleteMyEmailData` | mutation | Delete/anonymize all email data | User |
| `emailCampaignsEnhanced.captureConsent` | mutation | Record user consent with audit trail | User |
| `emailCampaignsEnhanced.hasCurrentConsent` | query | Check if user has current consent version | User |
| `emailCampaignsEnhanced.exportMyEmailData` | query | Export user data (enhanced version) | User |
| `emailCampaignsEnhanced.deleteMyEmailData` | mutation | Delete user data (enhanced version) | User |
| `emailCampaignsEnhanced.generateDataPortabilityExport` | mutation | Generate data export file | User |
| `emailCampaignsEnhanced.validateGDPRCompliance` | query | Admin: Validate user GDPR compliance | Admin |

---

## Request/Response Examples

### 1. Create Campaign

**Endpoint:** `emailCampaigns.create`

**Request:**
```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: 'Monthly Creator Newsletter - December 2024',
  description: 'Holiday updates, new features, and creator spotlights',
  templateId: 'monthly-newsletter',
  subject: '🎄 December Updates from YES GODDESS',
  previewText: 'New features, creator spotlights, holiday schedule',
  
  // Audience targeting
  segmentCriteria: {
    role: ['CREATOR', 'BRAND'],
    verificationStatus: ['VERIFIED'],
    createdAfter: new Date('2024-01-01'),
    lastLoginAfter: new Date('2024-11-01'),
  },
  
  // Scheduling
  scheduledSendTime: new Date('2024-12-15T10:00:00Z'),
  timezone: 'America/Los_Angeles',
  
  // Rate limiting
  messagesPerHour: 1000,
  batchSize: 100,
  
  // Organization
  tags: ['newsletter', 'monthly', 'december-2024'],
  metadata: {
    campaign_category: 'engagement',
    owner: 'marketing_team'
  }
});
```

**Response:**
```typescript
{
  id: "cm3x8y9z0000008l5e1h9g2j3",
  name: "Monthly Creator Newsletter - December 2024",
  description: "Holiday updates, new features, and creator spotlights",
  status: "DRAFT",
  templateId: "monthly-newsletter",
  subject: "🎄 December Updates from YES GODDESS",
  previewText: "New features, creator spotlights, holiday schedule",
  segmentCriteria: {
    role: ["CREATOR", "BRAND"],
    verificationStatus: ["VERIFIED"],
    createdAfter: "2024-01-01T00:00:00.000Z",
    lastLoginAfter: "2024-11-01T00:00:00.000Z"
  },
  recipientCount: 1543,
  scheduledSendTime: "2024-12-15T10:00:00.000Z",
  timezone: "America/Los_Angeles",
  messagesPerHour: 1000,
  batchSize: 100,
  sentCount: 0,
  deliveredCount: 0,
  openedCount: 0,
  clickedCount: 0,
  bouncedCount: 0,
  unsubscribedCount: 0,
  complainedCount: 0,
  failedCount: 0,
  tags: ["newsletter", "monthly", "december-2024"],
  metadata: {
    campaign_category: "engagement",
    owner: "marketing_team"
  },
  createdBy: "cm3x8y9z0000008l5e1h9g2j4",
  createdAt: "2024-12-01T14:30:00.000Z",
  updatedAt: "2024-12-01T14:30:00.000Z"
}
```

**cURL Equivalent (tRPC HTTP):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/emailCampaigns.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Monthly Creator Newsletter - December 2024",
    "templateId": "monthly-newsletter",
    "subject": "🎄 December Updates from YES GODDESS",
    "previewText": "New features, creator spotlights, holiday schedule",
    "segmentCriteria": {
      "role": ["CREATOR", "BRAND"],
      "verificationStatus": ["VERIFIED"]
    },
    "scheduledSendTime": "2024-12-15T10:00:00.000Z",
    "timezone": "America/Los_Angeles",
    "messagesPerHour": 1000,
    "batchSize": 100,
    "tags": ["newsletter", "monthly", "december-2024"]
  }'
```

---

### 2. Preview Segment

**Endpoint:** `emailCampaignsEnhanced.previewSegment`

**Request:**
```typescript
const preview = await trpc.emailCampaignsEnhanced.previewSegment.query({
  role: ['CREATOR'],
  verificationStatus: ['VERIFIED'],
  createdAfter: new Date('2024-01-01'),
  engagementLevel: ['very_high', 'high']
});
```

**Response:**
```typescript
{
  totalRecipients: 847,
  breakdown: {
    byRole: {
      CREATOR: 847
    },
    byVerificationStatus: {
      VERIFIED: 847
    },
    byEngagementLevel: {
      very_high: 234,
      high: 613
    }
  },
  excluded: {
    globalUnsubscribes: 52,
    suppressed: 3,
    unverifiedEmails: 0
  },
  estimatedSendTime: 51, // minutes at default rate
  warnings: []
}
```

---

### 3. Send Test Email

**Endpoint:** `emailCampaigns.sendTest`

**Request:**
```typescript
await trpc.emailCampaigns.sendTest.mutate({
  id: 'cm3x8y9z0000008l5e1h9g2j3',
  testEmails: [
    'marketing@yesgoddess.agency',
    'designer@yesgoddess.agency'
  ]
});
```

**Response:**
```typescript
{
  success: true,
  sentTo: [
    'marketing@yesgoddess.agency',
    'designer@yesgoddess.agency'
  ],
  messageIds: [
    're_msg_01JABCDEFGHIJKLMNOP',
    're_msg_01JABCDEFGHIJKLMNOQ'
  ]
}
```

---

### 4. Schedule Campaign

**Endpoint:** `emailCampaigns.schedule`

**Request:**
```typescript
const scheduled = await trpc.emailCampaigns.schedule.mutate({
  id: 'cm3x8y9z0000008l5e1h9g2j3'
});
```

**Response:**
```typescript
{
  id: "cm3x8y9z0000008l5e1h9g2j3",
  status: "SCHEDULED",
  scheduledSendTime: "2024-12-15T10:00:00.000Z",
  recipientCount: 1543,
  estimatedCompletionTime: "2024-12-15T11:33:00.000Z",
  jobId: "repeat:campaign:cm3x8y9z0000008l5e1h9g2j3:::1702634400000"
}
```

---

### 5. Get Campaign Analytics

**Endpoint:** `emailCampaigns.analytics`

**Request:**
```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: 'cm3x8y9z0000008l5e1h9g2j3'
});
```

**Response:**
```typescript
{
  campaignId: "cm3x8y9z0000008l5e1h9g2j3",
  status: "COMPLETED",
  metrics: {
    sent: 1543,
    delivered: 1521,
    bounced: 22,
    opened: 678,
    uniqueOpens: 612,
    clicked: 234,
    uniqueClicks: 198,
    unsubscribed: 8,
    complained: 1,
    failed: 0
  },
  rates: {
    deliveryRate: 98.57, // %
    openRate: 40.24,     // % of delivered
    clickRate: 15.39,    // % of delivered
    clickToOpenRate: 38.24, // % of opens
    bounceRate: 1.43,
    unsubscribeRate: 0.53,
    complaintRate: 0.07
  },
  timing: {
    sendStartedAt: "2024-12-15T10:00:00.000Z",
    sendCompletedAt: "2024-12-15T11:33:00.000Z",
    avgTimeToOpen: 142, // minutes
    avgTimeToClick: 218, // minutes
    peakOpenHour: 14,   // 2 PM
    peakClickHour: 15   // 3 PM
  }
}
```

---

### 6. Get User Email Preferences

**Endpoint:** `emailCampaigns.getMyPreferences`

**Request:**
```typescript
const preferences = await trpc.emailCampaigns.getMyPreferences.query();
```

**Response:**
```typescript
{
  userId: "cm3x8y9z0000008l5e1h9g2j5",
  royaltyStatements: true,
  licenseExpiry: true,
  projectInvitations: true,
  messages: true,
  payouts: true,
  newsletters: true,
  announcements: true,
  digestFrequency: "WEEKLY",
  globalUnsubscribe: false,
  categoryPreferences: {
    productUpdates: true,
    promotions: false,
    partnerOffers: false,
    eventInvites: true
  },
  frequencyPreference: "weekly",
  unsubscribedAt: null,
  preferenceCenterLastVisited: "2024-11-20T09:15:00.000Z",
  createdAt: "2024-01-15T10:00:00.000Z",
  updatedAt: "2024-11-20T09:15:00.000Z"
}
```

---

### 7. Update Email Preferences

**Endpoint:** `emailCampaigns.updateMyPreferences`

**Request:**
```typescript
await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: false,
  announcements: true,
  digestFrequency: 'DAILY',
  categoryPreferences: {
    productUpdates: true,
    promotions: false,
    partnerOffers: false
  }
});
```

**Response:**
```typescript
{
  success: true,
  preferences: {
    userId: "cm3x8y9z0000008l5e1h9g2j5",
    newsletters: false,
    announcements: true,
    digestFrequency: "DAILY",
    categoryPreferences: {
      productUpdates: true,
      promotions: false,
      partnerOffers: false
    },
    updatedAt: "2024-12-01T15:30:00.000Z"
  }
}
```

---

### 8. Unsubscribe (Global)

**Endpoint:** `emailCampaigns.unsubscribe`

**Request:**
```typescript
await trpc.emailCampaigns.unsubscribe.mutate({
  email: 'user@example.com',
  reason: 'Too many emails',
  userAgent: navigator.userAgent,
  ipAddress: '192.168.1.1' // Capture from request
});
```

**Response:**
```typescript
{
  success: true,
  unsubscribedFrom: 'all',
  effectiveDate: "2024-12-01T15:45:00.000Z"
}
```

---

### 9. Export Email Data (GDPR)

**Endpoint:** `emailCampaigns.exportMyEmailData`

**Request:**
```typescript
const data = await trpc.emailCampaigns.exportMyEmailData.query();
```

**Response:**
```typescript
{
  personalInfo: {
    email: "creator@example.com",
    name: "Jane Creator"
  },
  preferences: {
    royaltyStatements: true,
    licenseExpiry: true,
    newsletters: false,
    globalUnsubscribe: false,
    // ... all preference fields
  },
  recentEvents: [
    {
      id: "evt_01JABCD",
      eventType: "email.delivered",
      emailType: "royalty_statement",
      createdAt: "2024-11-30T10:00:00.000Z"
    },
    // ... last 100 events
  ],
  unsubscribeHistory: [
    {
      unsubscribeAction: "category_unsubscribe",
      unsubscribeSource: "preference_center",
      categoriesAffected: ["newsletters"],
      createdAt: "2024-11-20T09:15:00.000Z"
    }
  ],
  scheduledEmails: [
    {
      emailType: "digest",
      scheduledSendTime: "2024-12-02T09:00:00.000Z",
      status: "PENDING"
    }
  ]
}
```

---

### 10. List Campaigns (with Pagination)

**Endpoint:** `emailCampaigns.list`

**Request:**
```typescript
const { campaigns, nextCursor } = await trpc.emailCampaigns.list.query({
  status: 'COMPLETED',
  limit: 20,
  cursor: undefined // or previous cursor for next page
});
```

**Response:**
```typescript
{
  campaigns: [
    {
      id: "cm3x8y9z0000008l5e1h9g2j3",
      name: "November Newsletter",
      status: "COMPLETED",
      recipientCount: 1543,
      sentCount: 1543,
      openedCount: 678,
      clickedCount: 234,
      createdAt: "2024-11-15T10:00:00.000Z",
      _count: {
        recipients: 1543
      }
    },
    // ... 19 more campaigns
  ],
  nextCursor: "2024-11-01T10:00:00.000Z" // Use for next page
}
```

---

## TypeScript Type Definitions

### Campaign Types

```typescript
/**
 * Email campaign status states
 */
export enum EmailCampaignStatus {
  DRAFT = 'DRAFT',           // Initial state, can be edited
  SCHEDULED = 'SCHEDULED',   // Queued for sending
  SENDING = 'SENDING',       // Currently dispatching
  COMPLETED = 'COMPLETED',   // Successfully sent
  CANCELLED = 'CANCELLED',   // Cancelled by admin
  FAILED = 'FAILED'          // Failed during send
}

/**
 * Campaign recipient status states
 */
export enum CampaignRecipientStatus {
  PENDING = 'PENDING',         // Not yet sent
  QUEUED = 'QUEUED',          // Queued for sending
  SENT = 'SENT',              // Sent to provider
  DELIVERED = 'DELIVERED',     // Delivered to inbox
  OPENED = 'OPENED',          // Email opened
  CLICKED = 'CLICKED',        // Link clicked
  BOUNCED = 'BOUNCED',        // Bounced
  FAILED = 'FAILED',          // Send failed
  UNSUBSCRIBED = 'UNSUBSCRIBED', // User unsubscribed
  COMPLAINED = 'COMPLAINED'    // Marked as spam
}

/**
 * User roles for segmentation
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER'
}

/**
 * Engagement levels for targeting
 */
export type EngagementLevel = 
  | 'very_high'  // > 75% open rate
  | 'high'       // 50-75% open rate
  | 'medium'     // 25-50% open rate
  | 'low'        // 10-25% open rate
  | 'inactive';  // < 10% open rate

/**
 * Segment criteria for audience targeting
 */
export interface SegmentCriteria {
  role?: UserRole[];
  verificationStatus?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  hasEmailPreference?: Record<string, boolean>;
  creatorSpecialties?: string[];
  brandIndustries?: string[];
  engagementLevel?: EngagementLevel[];
  excludeRecentlySent?: {
    days: number;
    campaignIds?: string[];
  };
}

/**
 * Create campaign input
 */
export interface CreateCampaignInput {
  name: string;                    // 1-255 characters
  description?: string;
  templateId: string;              // Must exist in system
  subject: string;                 // 1-500 characters
  previewText?: string;            // Max 200 characters
  segmentCriteria?: SegmentCriteria;
  scheduledSendTime?: Date;        // Future date, max 1 year
  timezone?: string;               // Default: 'UTC'
  messagesPerHour?: number;        // 1-10000, default: 1000
  batchSize?: number;              // 1-1000, default: 100
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Update campaign input (only DRAFT/SCHEDULED)
 */
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

/**
 * Email campaign entity
 */
export interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  status: EmailCampaignStatus;
  templateId: string;
  subject: string;
  previewText?: string;
  segmentCriteria?: SegmentCriteria;
  recipientCount: number;
  scheduledSendTime: Date;
  timezone: string;
  sendStartedAt?: Date;
  sendCompletedAt?: Date;
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
  metadata?: Record<string, any>;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Campaign recipient entity
 */
export interface CampaignRecipient {
  id: string;
  campaignId: string;
  userId?: string;
  email: string;
  status: CampaignRecipientStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  firstClickedAt?: Date;
  bouncedAt?: Date;
  unsubscribedAt?: Date;
  complainedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  personalizationData?: Record<string, any>;
  messageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Campaign analytics
 */
export interface CampaignAnalytics {
  campaignId: string;
  status: EmailCampaignStatus;
  metrics: {
    sent: number;
    delivered: number;
    bounced: number;
    opened: number;
    uniqueOpens: number;
    clicked: number;
    uniqueClicks: number;
    unsubscribed: number;
    complained: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;      // Percentage
    openRate: number;          // % of delivered
    clickRate: number;         // % of delivered
    clickToOpenRate: number;   // % of opens
    bounceRate: number;
    unsubscribeRate: number;
    complaintRate: number;
  };
  timing?: {
    sendStartedAt: Date;
    sendCompletedAt: Date;
    avgTimeToOpen: number;     // Minutes
    avgTimeToClick: number;    // Minutes
    peakOpenHour: number;      // 0-23
    peakClickHour: number;     // 0-23
  };
}
```

### Segmentation Types

```typescript
/**
 * Segment preview response
 */
export interface SegmentPreview {
  totalRecipients: number;
  breakdown: {
    byRole?: Record<string, number>;
    byVerificationStatus?: Record<string, number>;
    byEngagementLevel?: Record<string, number>;
  };
  excluded: {
    globalUnsubscribes: number;
    suppressed: number;
    unverifiedEmails: number;
  };
  estimatedSendTime: number; // Minutes
  warnings: string[];
}

/**
 * Saved segment
 */
export interface SavedEmailSegment {
  id: string;
  name: string;
  description?: string;
  criteria: SegmentCriteria;
  estimatedSize?: number;
  lastCalculatedAt?: Date;
  createdBy: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Audience overlap analysis
 */
export interface AudienceOverlapAnalysis {
  totalInSegment: number;
  recentlyContacted: number;
  overlapPercentage: number;
  recommendation: 'safe' | 'caution' | 'warning';
  details: {
    campaignId: string;
    campaignName: string;
    sentAt: Date;
    overlapCount: number;
  }[];
}
```

### Analytics Types

```typescript
/**
 * Campaign performance metrics
 */
export interface CampaignPerformanceMetrics {
  campaignId: string;
  campaignName: string;
  status: EmailCampaignStatus;
  recipients: {
    total: number;
    sent: number;
    delivered: number;
    bounced: number;
    failed: number;
  };
  engagement: {
    uniqueOpens: number;
    totalOpens: number;
    uniqueClicks: number;
    totalClicks: number;
    unsubscribes: number;
    complaints: number;
    avgOpensPerRecipient: number;
    avgClicksPerRecipient: number;
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
  timing: {
    avgTimeToOpen: number;      // Minutes
    avgTimeToClick: number;     // Minutes
    peakOpenHour: number | null;
    peakClickHour: number | null;
  };
}

/**
 * Link performance
 */
export interface LinkPerformance {
  url: string;
  clicks: number;
  uniqueClicks: number;
  clickRate: number; // % of delivered
}

/**
 * Device breakdown
 */
export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
  unknown: number;
}

/**
 * Campaign comparison
 */
export interface CampaignComparison {
  campaigns: {
    id: string;
    name: string;
    sentDate: Date;
    metrics: {
      sent: number;
      openRate: number;
      clickRate: number;
      bounceRate: number;
      unsubscribeRate: number;
    };
  }[];
}

/**
 * Campaign report
 */
export interface CampaignReport {
  summary: CampaignPerformanceMetrics;
  linkPerformance: LinkPerformance[];
  deviceBreakdown: DeviceBreakdown;
  hourlyPattern: {
    hour: number;
    sent: number;
    opened: number;
    clicked: number;
  }[];
  recommendations: string[];
}
```

### Preference Types

```typescript
/**
 * Email preferences
 */
export interface EmailPreferences {
  userId: string;
  royaltyStatements: boolean;
  licenseExpiry: boolean;
  projectInvitations: boolean;
  messages: boolean;
  payouts: boolean;
  newsletters: boolean;
  announcements: boolean;
  digestFrequency: DigestFrequency;
  globalUnsubscribe: boolean;
  categoryPreferences: Record<string, boolean>;
  frequencyPreference: FrequencyPreference;
  unsubscribedAt?: Date;
  preferenceCenterLastVisited?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Digest frequency options
 */
export enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  NEVER = 'NEVER'
}

/**
 * Frequency preference options
 */
export type FrequencyPreference = 'immediate' | 'daily' | 'weekly';

/**
 * Update preferences input
 */
export interface UpdatePreferencesInput {
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  newsletters?: boolean;
  announcements?: boolean;
  digestFrequency?: DigestFrequency;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: FrequencyPreference;
}

/**
 * Unsubscribe input
 */
export interface UnsubscribeInput {
  email: string;
  campaignId?: string;
  categories?: string[];
  reason?: string;
  userAgent?: string;
  ipAddress?: string;
}
```

### GDPR Types

```typescript
/**
 * GDPR export data
 */
export interface GDPRExportData {
  personalInfo: {
    email: string;
    name: string | null;
  };
  preferences: EmailPreferences;
  recentEvents: EmailEvent[];
  unsubscribeHistory: UnsubscribeLog[];
  scheduledEmails: ScheduledEmail[];
}

/**
 * Email event (for export)
 */
export interface EmailEvent {
  id: string;
  eventType: string;
  emailType: string;
  createdAt: Date;
}

/**
 * Unsubscribe log
 */
export interface UnsubscribeLog {
  unsubscribeAction: string;
  unsubscribeSource: string;
  categoriesAffected: string[];
  createdAt: Date;
}

/**
 * Scheduled email
 */
export interface ScheduledEmail {
  emailType: string;
  scheduledSendTime: Date;
  status: string;
}

/**
 * Consent capture input
 */
export interface CaptureConsentInput {
  categories: string[];
  metadata: {
    ipAddress: string;
    userAgent: string;
    source?: string;
  };
}

/**
 * GDPR compliance validation
 */
export interface GDPRComplianceValidation {
  compliant: boolean;
  issues: string[];
  recommendations: string[];
}
```

---

## Business Logic & Validation Rules

### Campaign Creation Rules

1. **Name Requirements:**
   - Minimum: 1 character
   - Maximum: 255 characters
   - Must be unique within account (recommended, not enforced)

2. **Subject Line:**
   - Minimum: 1 character
   - Maximum: 500 characters
   - Should include emoji or personalization for better open rates

3. **Preview Text:**
   - Maximum: 200 characters
   - First 100 characters visible in most email clients
   - Optional but recommended for engagement

4. **Template Validation:**
   - Must reference existing template ID
   - Backend validates template exists before creating campaign

5. **Scheduling:**
   - Must be future date/time if provided
   - Maximum: 1 year in advance
   - Timezone defaults to UTC if not provided

6. **Rate Limiting:**
   - `messagesPerHour`: 1-10,000 (default: 1,000)
   - `batchSize`: 1-1,000 (default: 100)
   - Higher rates require proven sender reputation

### Campaign Editing Rules

1. **Editable Statuses:**
   - Can only edit campaigns in `DRAFT` or `SCHEDULED` status
   - `SENDING`, `COMPLETED`, `CANCELLED`, `FAILED` are read-only

2. **Schedule Changes:**
   - Can reschedule only if status is `DRAFT` or `SCHEDULED`
   - New schedule must be in the future

3. **Recipient Count:**
   - Automatically recalculated when segment criteria changes
   - Cached for 5 minutes for performance

### Segmentation Rules

1. **Automatic Exclusions:**
   - Users with `globalUnsubscribe = true`
   - Emails in suppression list
   - Unverified email addresses
   - Deleted user accounts

2. **Engagement Levels:**
   - `very_high`: > 75% open rate
   - `high`: 50-75% open rate
   - `medium`: 25-50% open rate
   - `low`: 10-25% open rate
   - `inactive`: < 10% open rate or no opens in 90 days

3. **Overlap Protection:**
   - Recommend excluding users contacted in last 7-14 days
   - Warning if > 50% overlap with recent campaigns

### Email Preference Rules

1. **Global Unsubscribe:**
   - Overrides all other preferences
   - Users cannot receive ANY marketing emails
   - Transactional emails (receipts, password resets) still allowed

2. **Category Preferences:**
   - Granular control per email type
   - Categories: newsletters, announcements, productUpdates, promotions, partnerOffers, eventInvites
   - Default: all enabled for new users

3. **Digest Frequency:**
   - `IMMEDIATE`: Send as events occur
   - `DAILY`: Batch once per day (9 AM user timezone)
   - `WEEKLY`: Batch once per week (Monday 9 AM)
   - `NEVER`: No digest emails

4. **Re-subscription:**
   - Users can re-subscribe anytime
   - Clears `globalUnsubscribe` flag
   - Restores previous category preferences

### GDPR Compliance Rules

1. **Data Export:**
   - Must include all email-related data
   - Structured JSON format
   - Last 100 email events included
   - Complete unsubscribe history

2. **Data Deletion:**
   - Anonymizes email addresses in logs
   - Keeps compliance records (unsubscribe, complaints)
   - Cannot be reversed
   - Takes effect immediately

3. **Consent Tracking:**
   - Capture IP address and user agent
   - Version tracking for privacy policy changes
   - Audit trail for compliance

---

## Error Handling

### HTTP Status Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request (validation failed) |
| 401 | Unauthorized (not authenticated) |
| 403 | Forbidden (not admin) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

### tRPC Error Codes

```typescript
enum TRPCErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  CONFLICT = 'CONFLICT',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}
```

### Campaign-Specific Errors

| Error Code | Message | User-Friendly Message | When to Show |
|------------|---------|----------------------|--------------|
| `BAD_REQUEST` | "Campaign name is required" | "Please enter a campaign name" | Form validation |
| `BAD_REQUEST` | "Subject line exceeds 500 characters" | "Subject line is too long (max 500 characters)" | Form validation |
| `BAD_REQUEST` | "Template not found" | "The selected email template doesn't exist" | Template selection |
| `BAD_REQUEST` | "Scheduled time must be in the future" | "Please select a future date and time" | Scheduling |
| `BAD_REQUEST` | "Scheduled time cannot be more than 1 year in advance" | "Cannot schedule more than 1 year ahead" | Scheduling |
| `BAD_REQUEST` | "Messages per hour exceeds platform limits" | "Rate limit too high. Max: 10,000/hour" | Rate config |
| `FORBIDDEN` | "Only admins can create campaigns" | "You don't have permission to create campaigns" | Authorization |
| `NOT_FOUND` | "Campaign not found" | "Campaign doesn't exist or was deleted" | Campaign actions |
| `CONFLICT` | "Campaign is already scheduled" | "Campaign is already scheduled. Cancel first to reschedule." | Scheduling |
| `CONFLICT` | "Cannot edit campaign in SENDING status" | "Cannot edit campaign while sending" | Editing |
| `CONFLICT` | "Cannot cancel completed campaign" | "Campaign already completed" | Cancellation |
| `PRECONDITION_FAILED` | "Campaign has no recipients" | "No recipients match your criteria" | Scheduling |
| `INTERNAL_SERVER_ERROR` | "Failed to queue campaign" | "Something went wrong. Please try again." | Scheduling |

### Preference-Specific Errors

| Error Code | Message | User-Friendly Message |
|------------|---------|----------------------|
| `BAD_REQUEST` | "Invalid digest frequency" | "Please select a valid digest frequency" |
| `BAD_REQUEST` | "Invalid email address" | "Please enter a valid email address" |
| `NOT_FOUND` | "Email preferences not found" | "Couldn't find your email preferences" |
| `CONFLICT` | "User already globally unsubscribed" | "You're already unsubscribed from all emails" |

### Error Response Format

```typescript
interface TRPCError {
  code: TRPCErrorCode;
  message: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    stack?: string;
  };
}
```

### Error Handling Example

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const campaign = await trpc.emailCampaigns.create.mutate(input);
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'BAD_REQUEST':
        toast.error(error.message);
        break;
      case 'FORBIDDEN':
        toast.error('You don\'t have permission to create campaigns');
        router.push('/unauthorized');
        break;
      case 'NOT_FOUND':
        toast.error('Template not found');
        break;
      default:
        toast.error('Something went wrong. Please try again.');
    }
  }
}
```

---

## Authorization & Permissions

### Role-Based Access Control

| Role | Campaign Management | Segmentation | Analytics | Preferences | GDPR |
|------|---------------------|--------------|-----------|-------------|------|
| **ADMIN** | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Own only | ✅ Own only |
| **CREATOR** | ❌ | ❌ | ❌ | ✅ Own only | ✅ Own only |
| **BRAND** | ❌ | ❌ | ❌ | ✅ Own only | ✅ Own only |
| **VIEWER** | ❌ | ❌ | ❌ | ✅ Own only | ✅ Own only |

### Endpoint Authorization

#### Admin-Only Endpoints

All campaign management, segmentation, and analytics endpoints require:
- Valid JWT token
- User role = `ADMIN`
- Active session

**Protected by:** `adminProcedure`

**Endpoints:**
- `emailCampaigns.create`
- `emailCampaigns.update`
- `emailCampaigns.schedule`
- `emailCampaigns.cancel`
- `emailCampaigns.sendTest`
- `emailCampaigns.list`
- `emailCampaigns.get`
- `emailCampaigns.analytics`
- `emailCampaigns.recipients`
- All `emailCampaignsEnhanced` segmentation and analytics endpoints

#### User Endpoints (Own Data Only)

Preference and GDPR endpoints require:
- Valid JWT token
- Any authenticated user role
- Can only access own data

**Protected by:** `protectedProcedure`

**Endpoints:**
- `emailCampaigns.getMyPreferences`
- `emailCampaigns.updateMyPreferences`
- `emailCampaigns.generateUnsubscribeToken`
- `emailCampaigns.verifyUnsubscribeToken`
- `emailCampaigns.unsubscribe`
- `emailCampaigns.resubscribe`
- `emailCampaigns.exportMyEmailData`
- `emailCampaigns.deleteMyEmailData`
- `emailCampaignsEnhanced.captureConsent`
- `emailCampaignsEnhanced.hasCurrentConsent`
- `emailCampaignsEnhanced.exportMyEmailData`
- `emailCampaignsEnhanced.deleteMyEmailData`
- `emailCampaignsEnhanced.generateDataPortabilityExport`

### JWT Token Requirements

```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;  // Issued at
  exp: number;  // Expiration
}
```

**Token Lifespan:** 7 days (configurable)

**Header Format:**
```
Authorization: Bearer <JWT_TOKEN>
```

### Permission Checks in Frontend

```typescript
// Check if user can create campaigns
const canCreateCampaigns = session?.user?.role === 'ADMIN';

// Conditionally render admin UI
{canCreateCampaigns && (
  <Button onClick={handleCreateCampaign}>
    Create Campaign
  </Button>
)}

// Redirect unauthorized users
useEffect(() => {
  if (session && session.user.role !== 'ADMIN') {
    router.push('/unauthorized');
  }
}, [session, router]);
```

---

## Rate Limiting & Quotas

### Campaign Send Rate Limits

Configured per campaign:
- **Default:** 1,000 messages/hour
- **Minimum:** 1 message/hour
- **Maximum:** 10,000 messages/hour
- **Recommended:** 1,000-5,000/hour based on sender reputation

### Batch Processing

- **Default Batch Size:** 100 recipients
- **Range:** 1-1,000 recipients
- **Processing:** Batches processed concurrently within rate limit

### API Rate Limits

No explicit API rate limits currently enforced, but:
- Campaign creation: Practically unlimited
- Segment preview: Cached for 5 minutes
- Analytics: Cached for 5 minutes

### Rate Limit Headers

Currently not exposed, but consider implementing:

```typescript
X-RateLimit-Limit: 1000      // Requests per hour
X-RateLimit-Remaining: 847   // Remaining requests
X-RateLimit-Reset: 1702634400 // Unix timestamp
```

### Campaign Estimation

Use segment preview to estimate send time:

```typescript
const preview = await trpc.emailCampaignsEnhanced.previewSegment.query(criteria);

// Estimate send duration
const estimatedMinutes = preview.estimatedSendTime;
const estimatedCompletion = new Date(
  scheduledTime.getTime() + estimatedMinutes * 60 * 1000
);

console.log(`Campaign will complete around ${estimatedCompletion.toLocaleString()}`);
```

### Quota Management

No hard quotas enforced, but monitor:
- Daily send volume
- Monthly send volume
- Bounce rate (should be < 2%)
- Complaint rate (should be < 0.1%)

High bounce/complaint rates may trigger automatic rate reduction.

---

## Real-time Updates

### Webhook Events

Email events (opens, clicks, bounces) are processed via Resend webhooks:

**Webhook Endpoint:** `POST /api/webhooks/resend`

**Events Tracked:**
- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.opened`
- `email.clicked`
- `email.complained`
- `email.unsubscribed`

**Campaign Stats Update:**
Campaign analytics are updated in real-time as events are received.

### Polling Recommendations

Since webhooks update the database, poll for updates:

```typescript
// Poll campaign analytics every 30 seconds while sending
const { data: analytics } = useQuery({
  queryKey: ['campaign-analytics', campaignId],
  queryFn: () => trpc.emailCampaigns.analytics.query({ id: campaignId }),
  refetchInterval: 30000, // 30 seconds
  enabled: campaign.status === 'SENDING'
});

// Stop polling when completed
useEffect(() => {
  if (campaign.status === 'COMPLETED') {
    queryClient.invalidateQueries(['campaign-analytics', campaignId]);
  }
}, [campaign.status]);
```

### Server-Sent Events (SSE)

Not currently implemented, but consider for real-time progress:

```typescript
// Future implementation
const eventSource = new EventSource(
  `/api/campaigns/${campaignId}/progress`
);

eventSource.addEventListener('progress', (event) => {
  const { sent, total } = JSON.parse(event.data);
  setProgress((sent / total) * 100);
});
```

### WebSockets

Not currently implemented. Polling is sufficient for campaign use case.

---

## Pagination & Filtering

### Pagination Strategy

Uses **cursor-based pagination** for better performance and consistency:

```typescript
interface PaginationInput {
  limit: number;        // Items per page (1-100)
  cursor?: string;      // Cursor from previous page
}

interface PaginationOutput<T> {
  items: T[];
  nextCursor?: string;  // Cursor for next page
}
```

### Campaign List Pagination

```typescript
// First page
const { campaigns, nextCursor } = await trpc.emailCampaigns.list.query({
  status: 'COMPLETED',
  limit: 20
});

// Next page
const { campaigns: nextPage, nextCursor: newCursor } = 
  await trpc.emailCampaigns.list.query({
    status: 'COMPLETED',
    limit: 20,
    cursor: nextCursor
  });
```

### Recipient List Pagination

```typescript
const { recipients, nextCursor } = await trpc.emailCampaigns.recipients.query({
  id: campaignId,
  status: 'OPENED',
  limit: 50,
  cursor: undefined
});
```

### React Query Integration

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['campaigns', status],
  queryFn: ({ pageParam }) =>
    trpc.emailCampaigns.list.query({
      status,
      limit: 20,
      cursor: pageParam
    }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
});

// Render with infinite scroll
<InfiniteScroll
  loadMore={() => fetchNextPage()}
  hasMore={hasNextPage}
  loader={<Spinner />}
>
  {data?.pages.flatMap(page => page.campaigns).map(campaign => (
    <CampaignCard key={campaign.id} campaign={campaign} />
  ))}
</InfiniteScroll>
```

### Filtering

#### Campaign List Filters

```typescript
// Filter by status
const completed = await trpc.emailCampaigns.list.query({
  status: 'COMPLETED',
  limit: 20
});

// Filter by tags (client-side)
const newsletters = campaigns.filter(c => 
  c.tags.includes('newsletter')
);

// Filter by date range (client-side)
const thisMonth = campaigns.filter(c =>
  c.createdAt >= startOfMonth(new Date())
);
```

#### Segment Criteria Filters

```typescript
// Multiple filters combined
const criteria: SegmentCriteria = {
  role: ['CREATOR'],
  verificationStatus: ['VERIFIED'],
  createdAfter: new Date('2024-01-01'),
  lastLoginAfter: subDays(new Date(), 30),
  engagementLevel: ['very_high', 'high']
};
```

### Sorting

Campaigns are sorted by `createdAt DESC` by default. For custom sorting:

```typescript
// Client-side sorting
const sortedCampaigns = campaigns.sort((a, b) => {
  // Sort by open rate descending
  const aRate = a.openedCount / a.sentCount;
  const bRate = b.openedCount / b.sentCount;
  return bRate - aRate;
});
```

---

## Frontend Implementation Checklist

### 🎯 Campaign Management UI (Admin Only)

#### Campaign List Page
- [ ] Display campaigns table/grid with pagination
- [ ] Filter by status (DRAFT, SCHEDULED, SENDING, COMPLETED, CANCELLED, FAILED)
- [ ] Search by campaign name
- [ ] Filter by tags
- [ ] Sort by created date, scheduled date, open rate
- [ ] Show key metrics per campaign (sent, opens, clicks)
- [ ] "Create Campaign" button (admin only)
- [ ] Quick actions: Edit, Schedule, Cancel, View Analytics
- [ ] Status badges with appropriate colors
- [ ] Handle loading and error states

#### Campaign Creation Flow
- [ ] Multi-step wizard:
  1. Basic info (name, description, template)
  2. Subject & preview text
  3. Audience segmentation
  4. Schedule & rate limits
  5. Review & send test
- [ ] Template selection with preview
- [ ] Real-time subject line character count
- [ ] Preview text character count (200 max)
- [ ] Segment preview with recipient count
- [ ] Show excluded users (unsubscribed, suppressed)
- [ ] Test email form with validation
- [ ] Schedule picker with timezone selector
- [ ] Rate limit configuration with recommendations
- [ ] Tag input field
- [ ] Save as draft functionality
- [ ] Form validation with inline errors
- [ ] Confirmation dialog before scheduling

#### Campaign Edit Page
- [ ] Only allow editing DRAFT/SCHEDULED campaigns
- [ ] Show read-only view for other statuses
- [ ] Disable editing while campaign is SENDING
- [ ] Recalculate recipient count when criteria changes
- [ ] Warning if significant changes to scheduled campaign

#### Campaign Analytics Page
- [ ] Overview cards (sent, delivered, opened, clicked, bounced)
- [ ] Engagement rates (open rate, click rate, CTR)
- [ ] Visual charts:
  - Delivery funnel
  - Open/click timeline
  - Device breakdown
  - Hourly activity pattern
- [ ] Link performance table
- [ ] Recipient list with filters (opened, clicked, bounced)
- [ ] Export analytics to CSV
- [ ] Real-time updates while SENDING
- [ ] Stop polling when COMPLETED

#### Segmentation UI
- [ ] Segment builder with filter chips
- [ ] Role selector (multi-select)
- [ ] Verification status filter
- [ ] Date range pickers (created, last login)
- [ ] Engagement level selector
- [ ] Preview button showing recipient count
- [ ] Breakdown by role, verification, engagement
- [ ] Show excluded users count
- [ ] Save segment functionality
- [ ] Load saved segments dropdown
- [ ] Audience overlap warning
- [ ] Estimated send time display

### 🎨 User-Facing UI (All Users)

#### Email Preference Center
- [ ] Fetch and display current preferences
- [ ] Toggle switches for each category:
  - Royalty statements
  - License expiry
  - Project invitations
  - Messages
  - Payouts
  - Newsletters
  - Announcements
- [ ] Custom category preferences (dynamic)
- [ ] Digest frequency dropdown (IMMEDIATE, DAILY, WEEKLY, NEVER)
- [ ] Global unsubscribe toggle (prominent, red)
- [ ] Save preferences button
- [ ] Success/error toast notifications
- [ ] Confirmation dialog for global unsubscribe
- [ ] Re-subscribe button if globally unsubscribed
- [ ] Last visited timestamp
- [ ] Help text explaining each category

#### Unsubscribe Landing Page
- [ ] Accept token from URL parameter
- [ ] Verify token validity
- [ ] Show user email (from token)
- [ ] Unsubscribe reason dropdown (optional)
- [ ] Options:
  - Unsubscribe from this campaign type
  - Unsubscribe from all marketing emails
  - Manage preferences (link to preference center)
- [ ] Capture user agent and IP (for audit)
- [ ] Confirmation message after unsubscribe
- [ ] Error handling for invalid/expired tokens

#### GDPR Data Management
- [ ] "Export My Data" button
- [ ] Download JSON file with email data
- [ ] "Delete My Data" button (dangerous action)
- [ ] Confirmation dialog with consequences explained
- [ ] Show consent history
- [ ] Re-consent flow if policy updated
- [ ] Progress indicator during export/delete
- [ ] Success confirmation

### 🛠️ Developer Tasks

#### API Client Setup
- [ ] Initialize tRPC client with proper config
- [ ] Set up authentication headers (JWT)
- [ ] Configure base URL (`ops.yesgoddess.agency/api/trpc`)
- [ ] Add error handling interceptor
- [ ] Add loading state management
- [ ] Type-safe client with generated types

#### React Query Integration
- [ ] Set up React Query provider
- [ ] Configure default query options
- [ ] Create custom hooks:
  - `useCampaigns(filters)`
  - `useCampaign(id)`
  - `useCreateCampaign()`
  - `useUpdateCampaign()`
  - `useScheduleCampaign()`
  - `useCancelCampaign()`
  - `useCampaignAnalytics(id)`
  - `useSegmentPreview(criteria)`
  - `useEmailPreferences()`
  - `useUpdatePreferences()`
  - `useUnsubscribe()`
- [ ] Implement optimistic updates
- [ ] Cache invalidation strategies
- [ ] Infinite scroll for lists

#### Form Validation
- [ ] Use Zod schemas for validation
- [ ] Import schemas from backend or duplicate
- [ ] Validate on blur and submit
- [ ] Display inline error messages
- [ ] Disable submit while invalid
- [ ] Show character counts for text fields

#### State Management
- [ ] Campaign creation wizard state
- [ ] Form draft persistence (localStorage)
- [ ] Active filters state
- [ ] Pagination state
- [ ] Analytics polling state
- [ ] Preference center form state

#### Error Handling
- [ ] Global error boundary
- [ ] Toast notifications for errors
- [ ] Retry failed requests
- [ ] Show user-friendly messages
- [ ] Log errors to monitoring service
- [ ] Handle network errors gracefully

#### Testing
- [ ] Unit tests for utility functions
- [ ] Integration tests for API calls
- [ ] E2E tests for critical flows:
  - Create and schedule campaign
  - Update preferences
  - Unsubscribe
  - Export data
- [ ] Test error scenarios
- [ ] Test loading states
- [ ] Test permission-based rendering

### 🎨 UX Considerations

#### Loading States
- [ ] Skeleton loaders for lists
- [ ] Spinner for actions (schedule, cancel)
- [ ] Progress bar for campaign sending
- [ ] Disabled state for forms while submitting

#### Empty States
- [ ] "No campaigns yet" with CTA
- [ ] "No saved segments" with CTA
- [ ] "No recipients" when segment empty
- [ ] Helpful illustrations and copy

#### Confirmation Dialogs
- [ ] Schedule campaign confirmation
- [ ] Cancel campaign confirmation
- [ ] Global unsubscribe confirmation
- [ ] Delete data confirmation (GDPR)
- [ ] Destructive actions in red

#### Toast Notifications
- [ ] Success: "Campaign created successfully"
- [ ] Success: "Campaign scheduled"
- [ ] Success: "Preferences updated"
- [ ] Error: "Failed to create campaign"
- [ ] Warning: "High audience overlap detected"

#### Responsive Design
- [ ] Mobile-friendly campaign list
- [ ] Collapsible filters on mobile
- [ ] Touch-friendly toggles
- [ ] Readable analytics on small screens

#### Accessibility
- [ ] ARIA labels for all interactive elements
- [ ] Keyboard navigation support
- [ ] Screen reader announcements
- [ ] Focus management in dialogs
- [ ] Color contrast compliance (WCAG AA)
- [ ] Alt text for images/icons

#### Performance
- [ ] Virtualized lists for large datasets
- [ ] Lazy load analytics charts
- [ ] Debounce search inputs
- [ ] Memoize expensive computations
- [ ] Code splitting for admin routes
- [ ] Optimize bundle size

### 📊 Analytics & Monitoring

#### Frontend Tracking
- [ ] Track campaign creation events
- [ ] Track segmentation usage
- [ ] Track preference updates
- [ ] Track unsubscribe reasons
- [ ] Track errors and failures

#### User Feedback
- [ ] Feedback form for campaign UI
- [ ] Report a problem button
- [ ] Feature request submission

---

## Additional Resources

### Backend Documentation
- [Email Campaigns Complete Implementation](/docs/modules/email-campaigns/COMPLETE_IMPLEMENTATION.md)
- [API Reference](/docs/modules/email-campaigns/API_REFERENCE.md)
- [Quick Start Guide](/docs/modules/email-campaigns/QUICK_START.md)
- [Email Events Processing](/docs/modules/email-campaigns/EMAIL_EVENTS_PROCESSING.md)

### Related Integration Guides
- [Authentication Integration](/docs/frontend-integration/FRONTEND_INTEGRATION_AUTHENTICATION.md)
- [Notification System Integration](/docs/frontend-integration/NOTIFICATION_API_GUIDE.md)
- [Permission System Integration](/docs/frontend-integration/PERMISSION_SYSTEM_INTEGRATION_GUIDE.md)

### External Resources
- [Resend Documentation](https://resend.com/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [React Query Documentation](https://tanstack.com/query/latest)

---

## Support

For questions or issues with this integration:
1. Check the backend documentation linked above
2. Review the API examples in this guide
3. Test endpoints with the example cURL commands
4. Contact the backend team with specific questions

---

**End of Email Campaigns Integration Guide**
