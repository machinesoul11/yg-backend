# Email Campaigns API Documentation

## Overview

The Email Campaigns API provides comprehensive email campaign management, audience segmentation, analytics, preference management, and GDPR compliance features.

## Base Endpoints

- `emailCampaigns.*` - Core campaign operations
- `emailCampaignsEnhanced.*` - Advanced features (segmentation, analytics, GDPR)

## Authentication

All endpoints require authentication:
- **Admin endpoints:** Require `ADMIN` role
- **Protected endpoints:** Require valid user session

## Campaign Management

### Create Campaign

**Endpoint:** `emailCampaigns.create`  
**Method:** `mutation`  
**Auth:** Admin only

**Input:**
```typescript
{
  name: string;                    // Campaign name (required)
  description?: string;            // Optional description
  templateId: string;              // Email template ID (required)
  subject: string;                 // Email subject line (required, max 500 chars)
  previewText?: string;            // Preview/preheader text (max 200 chars)
  segmentCriteria?: SegmentCriteria; // Audience targeting
  scheduledSendTime?: Date;        // When to send (must be future)
  timezone?: string;               // Timezone for scheduling (default: UTC)
  messagesPerHour?: number;        // Rate limit (default: 1000, max: 10000)
  batchSize?: number;              // Recipients per batch (default: 100)
  tags?: string[];                 // Campaign tags for organization
  metadata?: any;                  // Additional metadata
}
```

**Output:**
```typescript
{
  id: string;
  name: string;
  status: 'DRAFT';
  templateId: string;
  subject: string;
  recipientCount: number;
  createdAt: Date;
  // ... all campaign fields
}
```

**Example:**
```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: 'October Newsletter',
  templateId: 'monthly-newsletter',
  subject: 'Your October Update from YES GODDESS',
  previewText: 'New features, creator spotlights, and more!',
  segmentCriteria: {
    role: ['CREATOR'],
    verificationStatus: ['verified'],
  },
  scheduledSendTime: new Date('2025-10-15T10:00:00Z'),
  tags: ['newsletter', 'monthly'],
});
```

### Update Campaign

**Endpoint:** `emailCampaigns.update`  
**Method:** `mutation`  
**Auth:** Admin only

**Rules:**
- Can only update campaigns in `DRAFT` or `SCHEDULED` status
- Must be campaign creator
- Changing segmentation regenerates recipient list

**Input:**
```typescript
{
  id: string;
  data: {
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
    metadata?: any;
  }
}
```

### Schedule Campaign

**Endpoint:** `emailCampaigns.schedule`  
**Method:** `mutation`  
**Auth:** Admin only

Transitions campaign from `DRAFT` to `SCHEDULED` or `SENDING`.

**Input:**
```typescript
{
  id: string;
}
```

**Validation:**
- Must have recipients
- Template must exist
- Scheduled time must be valid (if set)
- Rate limit must be reasonable

### Send Test Emails

**Endpoint:** `emailCampaigns.sendTest`  
**Method:** `mutation`  
**Auth:** Admin only

Send test emails to verify campaign before launch.

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
  sent: number;
  failed: number;
  results: Array<{
    email: string;
    success: boolean;
    error?: string;
  }>;
}
```

### Cancel Campaign

**Endpoint:** `emailCampaigns.cancel`  
**Method:** `mutation`  
**Auth:** Admin only

Cancel scheduled or in-progress campaign.

**Input:**
```typescript
{
  id: string;
  reason?: string;
}
```

**Behavior:**
- `SCHEDULED` → `CANCELLED` (removes from queue)
- `SENDING` → `CANCELLED` (stops processing new batches)
- Updates `cancelledAt`, `cancelledBy`, `cancellationReason`

### List Campaigns

**Endpoint:** `emailCampaigns.list`  
**Method:** `query`  
**Auth:** Admin only

**Input:**
```typescript
{
  status?: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  limit?: number;      // 1-100, default 20
  cursor?: string;     // For pagination
}
```

**Output:**
```typescript
{
  campaigns: Campaign[];
  nextCursor?: string;
}
```

### Get Campaign

**Endpoint:** `emailCampaigns.get`  
**Method:** `query`  
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
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  // ... all campaign fields
  _count: {
    recipients: number;
  }
}
```

## Segmentation

### Preview Segment

**Endpoint:** `emailCampaignsEnhanced.previewSegment`  
**Method:** `query`  
**Auth:** Admin only

Preview how many users match criteria before creating campaign.

**Input:**
```typescript
{
  role?: ('ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER')[];
  verificationStatus?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  hasEmailPreference?: Record<string, boolean>;
  creatorSpecialties?: string[];
  brandIndustries?: string[];
  engagementLevel?: ('very_high' | 'high' | 'medium' | 'low' | 'inactive')[];
  excludeRecentlySent?: {
    days: number;
    campaignIds?: string[];
  };
}
```

**Output:**
```typescript
{
  count: number;
  breakdown: {
    byRole?: Record<string, number>;
    byVerification?: Record<string, number>;
  }
}
```

**Caching:** Results cached for 5 minutes

### Create Saved Segment

**Endpoint:** `emailCampaignsEnhanced.createSavedSegment`  
**Method:** `mutation`  
**Auth:** Admin only

Save segment for reuse across campaigns.

**Input:**
```typescript
{
  name: string;            // Max 255 chars
  description?: string;
  criteria: SegmentCriteria;
  isPublic?: boolean;      // Share with other admins
}
```

**Output:**
```typescript
{
  id: string;
  name: string;
  estimatedSize: number;
  lastCalculatedAt: Date;
  createdBy: string;
  isPublic: boolean;
}
```

### Analyze Audience Overlap

**Endpoint:** `emailCampaignsEnhanced.analyzeAudienceOverlap`  
**Method:** `query`  
**Auth:** Admin only

Check how many users in segment were recently contacted.

**Input:**
```typescript
{
  criteria: SegmentCriteria;
  daysSinceLastSent?: number;  // Default 7, range 1-365
}
```

**Output:**
```typescript
{
  totalUsers: number;
  recentlyContacted: number;
  overlapPercentage: number;
  recentCampaigns: Array<{
    campaignId: string;
    campaignName: string;
    sentCount: number;
  }>;
}
```

**Use Case:** Prevent email fatigue by excluding users contacted in last N days

## Analytics

### Get Campaign Performance

**Endpoint:** `emailCampaignsEnhanced.getCampaignPerformance`  
**Method:** `query`  
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
  campaign: {
    id: string;
    name: string;
    status: string;
    sentAt: Date | null;
    completedAt: Date | null;
  };
  totals: {
    recipients: number;
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
    deliveryRate: number;      // %
    openRate: number;           // %
    clickRate: number;          // %
    clickToOpenRate: number;    // %
    bounceRate: number;         // %
    unsubscribeRate: number;    // %
    complaintRate: number;      // %
  };
  engagement: {
    uniqueOpens: number;
    uniqueClicks: number;
    totalOpens: number;
    totalClicks: number;
    avgOpensPerRecipient: number;
    avgClicksPerRecipient: number;
  };
  timing: {
    avgTimeToOpen: number | null;      // seconds
    avgTimeToClick: number | null;     // seconds
    peakOpenHour: number | null;       // 0-23
    peakClickHour: number | null;      // 0-23
  };
}
```

**Caching:** Results cached for 5 minutes

### Get Link Performance

**Endpoint:** `emailCampaignsEnhanced.getLinkPerformance`  
**Method:** `query`  
**Auth:** Admin only

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
Array<{
  url: string;
  clicks: number;
  uniqueClicks: number;
  clickRate: number;     // % of delivered
  position?: number;     // Link position in email
}>
```

Sorted by total clicks descending.

### Compare Campaigns

**Endpoint:** `emailCampaignsEnhanced.compareCampaigns`  
**Method:** `query`  
**Auth:** Admin only

Compare up to 10 campaigns side-by-side.

**Input:**
```typescript
{
  campaignIds: string[];  // 2-10 campaign IDs
}
```

**Output:**
```typescript
{
  campaigns: CampaignPerformanceMetrics[];
  averages: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  bestPerforming: {
    byOpenRate: string;      // Campaign ID
    byClickRate: string;     // Campaign ID
    byEngagement: string;    // Campaign ID
  };
}
```

### Get Campaign Trends

**Endpoint:** `emailCampaignsEnhanced.getCampaignTrends`  
**Method:** `query`  
**Auth:** Admin only

**Input:**
```typescript
{
  days?: number;  // 7-365, default 30
}
```

**Output:**
```typescript
Array<{
  date: Date;
  campaignsSent: number;
  totalRecipients: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
}>
```

### Generate Campaign Report

**Endpoint:** `emailCampaignsEnhanced.generateCampaignReport`  
**Method:** `query`  
**Auth:** Admin only

Comprehensive report with actionable recommendations.

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
{
  summary: CampaignPerformanceMetrics;
  linkPerformance: LinkPerformance[];
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
  hourlyPattern: Array<{
    hour: number;
    sent: number;
    opened: number;
    clicked: number;
  }>;
  recommendations: string[];
}
```

**Example Recommendations:**
- "Low open rate detected. Consider testing different subject lines."
- "Peak open time is 10:00. Consider scheduling future campaigns around this time."
- "High bounce rate detected. Clean email list and verify addresses."

## Preference Management

### Get My Preferences

**Endpoint:** `emailCampaigns.getMyPreferences`  
**Method:** `query`  
**Auth:** Protected (user)

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
  categoryPreferences: Record<string, boolean> | null;
  frequencyPreference: string;
  preferenceCenterLastVisited: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### Update My Preferences

**Endpoint:** `emailCampaigns.updateMyPreferences`  
**Method:** `mutation`  
**Auth:** Protected (user)

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

**Side Effects:**
- Invalidates cache
- Logs preference change
- Updates `preferenceCenterLastVisited`

### Unsubscribe

**Endpoint:** `emailCampaigns.unsubscribe`  
**Method:** `mutation`  
**Auth:** Protected (user)

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

**Behavior:**
- Sets preferences to false for affected categories
- OR sets `globalUnsubscribe` to true
- Adds to suppression list
- Logs unsubscribe event
- Invalidates cache

### Resubscribe

**Endpoint:** `emailCampaigns.resubscribe`  
**Method:** `mutation`  
**Auth:** Protected (user)

Re-enables emails after global unsubscribe.

**Output:**
```typescript
{
  success: boolean;
}
```

## GDPR Compliance

### Export My Email Data

**Endpoint:** `emailCampaignsEnhanced.exportMyEmailData`  
**Method:** `query`  
**Auth:** Protected (user)

**Output:**
```typescript
{
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  };
  emailPreferences: EmailPreferences;
  consentHistory: Array<{
    consentVersion: string;
    consentText: string;
    consentedAt: Date;
    ipAddress: string;
    userAgent: string;
  }>;
  campaignActivity: {
    campaignsReceived: number;
    totalOpens: number;
    totalClicks: number;
    campaigns: Array<{
      campaignId: string;
      campaignName: string;
      sentAt: Date;
      deliveredAt: Date | null;
      openedAt: Date | null;
      clickedAt: Date | null;
    }>;
  };
  unsubscribeHistory: Array<{
    unsubscribedAt: Date;
    action: string;
    source: string;
    categoriesAffected: string[];
  }>;
  suppressions: Array<{
    email: string;
    reason: string;
    suppressedAt: Date;
  }>;
}
```

### Delete My Email Data

**Endpoint:** `emailCampaignsEnhanced.deleteMyEmailData`  
**Method:** `mutation`  
**Auth:** Protected (user)

Implements GDPR Right to Erasure.

**What Gets Deleted:**
- Email preferences
- Scheduled emails
- Test assignment data

**What Gets Anonymized:**
- Campaign recipient records (preserves analytics)
- Unsubscribe logs (preserves compliance)
- Email events (preserves metrics)

**What Gets Kept:**
- Aggregated statistics (non-identifiable)
- Required compliance records

**Output:**
```typescript
{
  success: boolean;
}
```

### Capture Consent

**Endpoint:** `emailCampaignsEnhanced.captureConsent`  
**Method:** `mutation`  
**Auth:** Protected (user)

**Input:**
```typescript
{
  categories: string[];  // e.g., ['marketing', 'newsletters']
  metadata: {
    ipAddress: string;
    userAgent: string;
    source?: string;     // e.g., 'signup_form', 'preference_center'
  }
}
```

**Behavior:**
- Updates email preferences
- Logs consent event with audit trail
- Records IP, user agent, timestamp

### Validate GDPR Compliance

**Endpoint:** `emailCampaignsEnhanced.validateGDPRCompliance`  
**Method:** `query`  
**Auth:** Admin only

**Input:**
```typescript
{
  userId: string;
}
```

**Output:**
```typescript
{
  compliant: boolean;
  issues: string[];
  recommendations: string[];
}
```

**Checks:**
- Current consent status
- Global unsubscribe status
- Suppression list status
- Policy version compliance

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `NOT_FOUND` | Campaign/segment not found | Verify ID exists |
| `FORBIDDEN` | Insufficient permissions | Must be campaign creator/admin |
| `BAD_REQUEST` | Invalid input | Check validation messages |
| `UNAUTHORIZED` | Not authenticated | Login required |

## Rate Limits

- Test emails: Max 10 recipients per request
- Saved segments: Max 100 per user
- Campaign comparison: Max 10 campaigns
- Segment preview: 5 min cache TTL

## Best Practices

### Campaign Creation
1. Always preview segment before creating
2. Send test emails to multiple devices
3. Use descriptive names with dates
4. Set appropriate rate limits

### Segmentation
1. Save frequently used segments
2. Exclude recently contacted (7-14 days)
3. Monitor segment size trends
4. Use engagement levels for targeting

### Analytics
1. Wait 24-48h for metrics to stabilize
2. Compare against account benchmarks
3. Act on bounce rate > 2%
4. Investigate complaint rate > 0.1%

### GDPR
1. Capture consent at signup
2. Provide easy unsubscribe
3. Honor deletion within 30 days
4. Maintain audit trails

## Webhooks

Email events are processed automatically via Resend webhooks:
- `POST /api/webhooks/resend` - Receives all email events

Events update campaign analytics in real-time.

---

**Version:** 1.0.0  
**Last Updated:** November 2025
