# Email Campaigns - Quick Reference

## Service Layer

### Campaign Management
```typescript
import { campaignService } from '@/lib/services/email/campaign.service';

// Create campaign
const campaign = await campaignService.createCampaign(userId, {
  name: 'Campaign Name',
  templateId: 'monthly-newsletter',
  subject: 'Subject Line',
  segmentCriteria: { role: ['CREATOR'] },
  scheduledSendTime: new Date('2025-11-15T10:00:00Z'),
});

// Schedule sending
await campaignService.scheduleCampaign(campaignId, userId);

// Get analytics
const analytics = await campaignService.getCampaignAnalytics(campaignId);
```

### Segmentation
```typescript
import { segmentationService } from '@/lib/services/email/segmentation.service';

// Preview segment
const preview = await segmentationService.previewSegment({
  role: ['CREATOR'],
  verificationStatus: ['verified'],
  createdAfter: new Date('2025-10-01'),
});

// Create saved segment
const segment = await segmentationService.createSavedSegment(userId, {
  name: 'Verified Creators',
  criteria: { role: ['CREATOR'], verificationStatus: ['verified'] },
  isPublic: true,
});

// Check audience overlap
const overlap = await segmentationService.analyzeAudienceOverlap(criteria, 7);
```

### Analytics
```typescript
import { campaignAnalyticsService } from '@/lib/services/email/campaign-analytics.service';

// Get comprehensive performance
const perf = await campaignAnalyticsService.getCampaignPerformance(campaignId);

// Get link performance
const links = await campaignAnalyticsService.getLinkPerformance(campaignId);

// Compare campaigns
const comparison = await campaignAnalyticsService.compareCampaigns([id1, id2, id3]);

// Get trends
const trends = await campaignAnalyticsService.getCampaignTrends(30);

// Generate report
const report = await campaignAnalyticsService.generateCampaignReport(campaignId);
```

### GDPR Compliance
```typescript
import { gdprComplianceService } from '@/lib/services/email/gdpr-compliance.service';

// Capture consent
await gdprComplianceService.captureConsent(userId, ['marketing', 'newsletters'], {
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
});

// Export user data
const data = await gdprComplianceService.exportUserData(userId);

// Delete user data
await gdprComplianceService.deleteUserEmailData(userId);

// Validate compliance
const validation = await gdprComplianceService.validateGDPRCompliance(userId);
```

## tRPC API Endpoints

### Basic Campaign Operations
```typescript
// Create campaign
const campaign = await trpc.emailCampaigns.create.mutate({
  name: string,
  description?: string,
  templateId: string,
  subject: string,
  previewText?: string,
  segmentCriteria?: SegmentCriteria,
  scheduledSendTime?: Date,
  timezone?: string,
  messagesPerHour?: number,
  batchSize?: number,
  tags?: string[],
});

// Update campaign
await trpc.emailCampaigns.update.mutate({ id, data });

// Schedule campaign
await trpc.emailCampaigns.schedule.mutate({ id });

// Cancel campaign
await trpc.emailCampaigns.cancel.mutate({ id, reason });

// Send test emails
await trpc.emailCampaigns.sendTest.mutate({ id, testEmails: ['test@example.com'] });

// Get campaign
const campaign = await trpc.emailCampaigns.get.query({ id });

// List campaigns
const { campaigns, nextCursor } = await trpc.emailCampaigns.list.query({
  status: 'COMPLETED',
  limit: 20,
  cursor: undefined,
});

// Get recipients
const { recipients, nextCursor } = await trpc.emailCampaigns.recipients.query({
  id,
  status: 'DELIVERED',
  limit: 50,
});
```

### Enhanced Segmentation
```typescript
// Preview segment
const preview = await trpc.emailCampaignsEnhanced.previewSegment.query({
  role: ['CREATOR'],
  verificationStatus: ['verified'],
  createdAfter: new Date('2025-10-01'),
});

// Create saved segment
const segment = await trpc.emailCampaignsEnhanced.createSavedSegment.mutate({
  name: 'Verified Creators',
  description: 'All verified creator accounts',
  criteria: { role: ['CREATOR'], verificationStatus: ['verified'] },
  isPublic: true,
});

// Update saved segment
await trpc.emailCampaignsEnhanced.updateSavedSegment.mutate({
  id,
  name: 'New Name',
  criteria: newCriteria,
});

// Delete saved segment
await trpc.emailCampaignsEnhanced.deleteSavedSegment.mutate({ id });

// List saved segments
const segments = await trpc.emailCampaignsEnhanced.listSavedSegments.query({
  includePublic: true,
});

// Analyze audience overlap
const overlap = await trpc.emailCampaignsEnhanced.analyzeAudienceOverlap.query({
  criteria,
  daysSinceLastSent: 7,
});
```

### Advanced Analytics
```typescript
// Get campaign performance
const perf = await trpc.emailCampaignsEnhanced.getCampaignPerformance.query({ id });

// Get link performance
const links = await trpc.emailCampaignsEnhanced.getLinkPerformance.query({ id });

// Get device breakdown
const devices = await trpc.emailCampaignsEnhanced.getDeviceBreakdown.query({ id });

// Get hourly breakdown
const hourly = await trpc.emailCampaignsEnhanced.getHourlyBreakdown.query({ id });

// Compare campaigns
const comparison = await trpc.emailCampaignsEnhanced.compareCampaigns.query({
  campaignIds: [id1, id2, id3],
});

// Get campaign trends
const trends = await trpc.emailCampaignsEnhanced.getCampaignTrends.query({ days: 30 });

// Generate report
const report = await trpc.emailCampaignsEnhanced.generateCampaignReport.query({ id });
```

### Preference Management
```typescript
// Get user preferences
const prefs = await trpc.emailCampaigns.getMyPreferences.query();

// Update preferences
await trpc.emailCampaigns.updateMyPreferences.mutate({
  royaltyStatements: true,
  licenseExpiry: true,
  newsletters: false,
  digestFrequency: 'WEEKLY',
});

// Generate unsubscribe token
const token = await trpc.emailCampaigns.generateUnsubscribeToken.mutation();

// Unsubscribe
await trpc.emailCampaigns.unsubscribe.mutate({
  email: 'user@example.com',
  campaignId: 'campaign_id',
  categories: ['newsletters'],
  reason: 'too_frequent',
});

// Resubscribe
await trpc.emailCampaigns.resubscribe.mutate();
```

### GDPR Compliance
```typescript
// Capture consent
await trpc.emailCampaignsEnhanced.captureConsent.mutate({
  categories: ['marketing', 'newsletters'],
  metadata: {
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0...',
    source: 'signup_form',
  },
});

// Check current consent
const hasConsent = await trpc.emailCampaignsEnhanced.hasCurrentConsent.query();

// Export email data
const data = await trpc.emailCampaignsEnhanced.exportMyEmailData.query();

// Delete email data
await trpc.emailCampaignsEnhanced.deleteMyEmailData.mutate();

// Generate data export file
const exportFile = await trpc.emailCampaignsEnhanced.generateDataPortabilityExport.mutate();

// Get consent history
const history = await trpc.emailCampaignsEnhanced.getConsentHistory.query();

// Admin: Validate compliance
const validation = await trpc.emailCampaignsEnhanced.validateGDPRCompliance.query({
  userId,
});

// Admin: Request consent renewal
await trpc.emailCampaignsEnhanced.requestConsentRenewal.mutate({ userId });
```

## Segment Criteria

```typescript
interface SegmentCriteria {
  // User role
  role?: ('ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER')[];
  
  // Verification status
  verificationStatus?: string[]; // e.g., ['verified', 'pending']
  
  // Date ranges
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  
  // Email preferences
  hasEmailPreference?: {
    [key: string]: boolean;
  };
  
  // Role-specific
  creatorSpecialties?: string[];
  brandIndustries?: string[];
  
  // Engagement
  engagementLevel?: ('very_high' | 'high' | 'medium' | 'low' | 'inactive')[];
  
  // Exclusions
  excludeRecentlySent?: {
    days: number;
    campaignIds?: string[];
  };
}
```

## Campaign Status Flow

```
DRAFT → SCHEDULED → SENDING → COMPLETED
  ↓         ↓          ↓
CANCELLED CANCELLED  FAILED
```

## Recipient Status Flow

```
PENDING → QUEUED → SENT → DELIVERED → OPENED → CLICKED
                      ↓         ↓
                  BOUNCED   FAILED
                      ↓         ↓
               UNSUBSCRIBED  COMPLAINED
```

## Performance Metrics

### Campaign-Level
- `sentCount` - Total emails sent
- `deliveredCount` - Successfully delivered
- `openedCount` - Total opens
- `clickedCount` - Total clicks
- `bouncedCount` - Hard + soft bounces
- `unsubscribedCount` - Unsubscribes from this campaign
- `complainedCount` - Spam complaints
- `failedCount` - Send failures

### Calculated Rates
- `deliveryRate = (delivered / sent) * 100`
- `openRate = (opened / delivered) * 100`
- `clickRate = (clicked / delivered) * 100`
- `clickToOpenRate = (clicked / opened) * 100`
- `bounceRate = (bounced / sent) * 100`
- `unsubscribeRate = (unsubscribed / delivered) * 100`
- `complaintRate = (complained / delivered) * 100`

## Background Jobs

### Campaign Worker
```typescript
// Processes campaign sends
Queue: 'email-campaigns'
Concurrency: 1 (one campaign at a time)
Rate Limit: Based on campaign.messagesPerHour
Batch Size: campaign.batchSize (default 100)
```

### Scheduled Email Worker
```typescript
// Processes scheduled emails
Queue: 'scheduled-emails'
Concurrency: 10
Rate Limit: 100 per minute
```

## Database Queries

### Get campaign stats
```sql
SELECT 
  c.id,
  c.name,
  c.status,
  COUNT(r.id) as total_recipients,
  COUNT(CASE WHEN r.status = 'SENT' THEN 1 END) as sent,
  COUNT(CASE WHEN r.status = 'DELIVERED' THEN 1 END) as delivered,
  COUNT(CASE WHEN r.status = 'OPENED' THEN 1 END) as opened,
  COUNT(CASE WHEN r.status = 'CLICKED' THEN 1 END) as clicked,
  COUNT(CASE WHEN r.status = 'BOUNCED' THEN 1 END) as bounced
FROM email_campaigns c
LEFT JOIN campaign_recipients r ON r.campaign_id = c.id
WHERE c.id = ?
GROUP BY c.id;
```

### Find recently contacted users
```sql
SELECT DISTINCT r.user_id
FROM campaign_recipients r
WHERE r.sent_at >= NOW() - INTERVAL '7 days'
  AND r.status IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED');
```

### Get top performing links
```sql
SELECT 
  clicked_url,
  COUNT(*) as total_clicks,
  COUNT(DISTINCT email) as unique_clicks
FROM email_campaign_clicks
WHERE campaign_id = ?
GROUP BY clicked_url
ORDER BY total_clicks DESC
LIMIT 10;
```

## Best Practices

### Campaign Creation
1. Always preview segment before creating campaign
2. Send test emails to verify rendering
3. Check audience overlap to avoid over-mailing
4. Use descriptive campaign names with dates
5. Set appropriate rate limits for audience size

### Segmentation
1. Save frequently used segments
2. Exclude recently contacted users (7-14 days)
3. Always filter out unsubscribed and suppressed users
4. Monitor segment size before sending
5. Use engagement levels to target active users

### Analytics
1. Wait 24-48 hours for initial metrics to stabilize
2. Monitor deliverability (delivery rate > 95%)
3. Benchmark against account averages
4. Act on bounce rates > 2%
5. Investigate complaint rates > 0.1%

### GDPR Compliance
1. Capture consent at signup with audit trail
2. Provide easy unsubscribe in all emails
3. Honor deletion requests within 30 days
4. Maintain consent version tracking
5. Regularly audit compliance status

## Troubleshooting

### Low Delivery Rate
- Check for invalid email addresses
- Verify sender domain authentication
- Review bounce reasons
- Clean suppression list

### Low Open Rate
- Test different subject lines
- Check send time optimization
- Verify sender name is recognizable
- Review email client breakdown

### Low Click Rate
- Improve call-to-action clarity
- Simplify email design
- Test link placement
- Review mobile rendering

### High Unsubscribe Rate
- Reduce email frequency
- Improve content relevance
- Check segmentation accuracy
- Review user feedback

---

**Last Updated:** November 2025
**Module Status:** Production Ready
