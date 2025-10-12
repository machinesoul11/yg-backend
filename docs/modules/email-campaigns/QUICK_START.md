# Email Campaigns Quick Start Guide

## Setup

### 1. Run Database Migration

```bash
npx prisma migrate dev --name add_email_campaigns
npx prisma generate
```

### 2. Start Campaign Worker

```bash
# Development
npm run dev

# Production (separate process)
node --require tsx/register src/jobs/email-campaign-worker.job.ts
```

### 3. Verify Configuration

Ensure these environment variables are set:

```env
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=re_xxxxx
DATABASE_URL_POOLED=postgresql://...
EMAIL_FROM_NAME="YES GODDESS"
RESEND_SENDER_EMAIL=hello@yesgoddess.com
```

## Creating a Campaign

### Step 1: Create Draft Campaign

```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: 'Monthly Creator Newsletter',
  description: 'November 2025 platform updates',
  templateId: 'monthly-newsletter',
  subject: 'November Updates from YES GODDESS',
  previewText: 'New features, creator spotlights, and more',
  
  // Target specific audience
  segmentCriteria: {
    role: ['CREATOR', 'BRAND'],
    createdAfter: new Date('2025-01-01'),
  },
  
  // Rate limiting
  messagesPerHour: 1000,
  batchSize: 100,
  
  // Schedule for later
  scheduledSendTime: new Date('2025-11-01T10:00:00Z'),
  timezone: 'America/Los_Angeles',
  
  tags: ['newsletter', 'monthly', '2025-11'],
});
```

### Step 2: Send Test Emails

```typescript
const result = await trpc.emailCampaigns.sendTest.mutate({
  id: campaign.id,
  testEmails: [
    'admin@yesgoddess.com',
    'test@example.com',
  ],
});

console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
```

### Step 3: Schedule Campaign

```typescript
await trpc.emailCampaigns.schedule.mutate({
  id: campaign.id,
});
```

Campaign will now send at the scheduled time!

## Audience Segmentation Examples

### All Verified Creators

```typescript
segmentCriteria: {
  role: ['CREATOR'],
  verificationStatus: ['approved'],
}
```

### Brands in Specific Industries

```typescript
segmentCriteria: {
  role: ['BRAND'],
  brandIndustries: ['fashion', 'beauty', 'lifestyle'],
}
```

### Active Users (logged in recently)

```typescript
segmentCriteria: {
  lastLoginAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
}
```

### Creators with Specific Specialties

```typescript
segmentCriteria: {
  role: ['CREATOR'],
  creatorSpecialties: ['photography', 'videography'],
}
```

### New Users

```typescript
segmentCriteria: {
  createdAfter: new Date('2025-10-01'),
  createdBefore: new Date('2025-11-01'),
}
```

## Managing Campaigns

### List All Campaigns

```typescript
const { campaigns, nextCursor } = await trpc.emailCampaigns.list.query({
  status: 'SCHEDULED', // or 'DRAFT', 'SENDING', 'COMPLETED', etc.
  limit: 20,
});
```

### Get Campaign Details

```typescript
const campaign = await trpc.emailCampaigns.get.query({
  id: 'campaign_id',
});

console.log(`Recipients: ${campaign._count.recipients}`);
console.log(`Status: ${campaign.status}`);
```

### View Campaign Analytics

```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: 'campaign_id',
});

console.log('Delivery Rate:', analytics.rates.deliveryRate + '%');
console.log('Open Rate:', analytics.rates.openRate + '%');
console.log('Click Rate:', analytics.rates.clickRate + '%');
console.log('Top Links:', analytics.topLinks);
```

### Cancel Campaign

```typescript
await trpc.emailCampaigns.cancel.mutate({
  id: 'campaign_id',
  reason: 'Found error in email content',
});
```

## Email Preferences

### Get User Preferences

```typescript
const prefs = await trpc.emailCampaigns.getMyPreferences.query();

console.log('Newsletter:', prefs.newsletters);
console.log('Digest:', prefs.digestFrequency);
```

### Update Preferences

```typescript
await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: false,
  announcements: true,
  digestFrequency: 'WEEKLY',
  categoryPreferences: {
    productUpdates: true,
    promotions: false,
  },
});
```

### Unsubscribe

```typescript
// Global unsubscribe
await trpc.emailCampaigns.unsubscribe.mutate({
  email: 'user@example.com',
  reason: 'Too many emails',
});

// Re-subscribe
await trpc.emailCampaigns.resubscribe.mutate();
```

## GDPR Compliance

### Export User Data

```typescript
const data = await trpc.emailCampaigns.exportMyEmailData.query();

console.log('Email:', data.personalInfo.email);
console.log('Preferences:', data.preferences);
console.log('Recent Events:', data.recentEvents.length);
```

### Delete User Data

```typescript
await trpc.emailCampaigns.deleteMyEmailData.mutate();
// All email data anonymized/deleted
```

## Advanced Features

### Save Reusable Segments

```typescript
// Create saved segment
await prisma.savedEmailSegment.create({
  data: {
    name: 'Active Fashion Brands',
    description: 'Brands in fashion industry with recent activity',
    criteria: {
      role: ['BRAND'],
      brandIndustries: ['fashion'],
      lastLoginAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    createdBy: userId,
    isPublic: false,
  },
});

// Use in campaign
const segment = await prisma.savedEmailSegment.findUnique({
  where: { id: 'segment_id' },
});

await trpc.emailCampaigns.create.mutate({
  // ...other params
  segmentCriteria: segment.criteria,
});
```

### Monitor Campaign Progress

```typescript
// Get recipient status breakdown
const { recipients } = await trpc.emailCampaigns.recipients.query({
  id: 'campaign_id',
  status: 'DELIVERED',
  limit: 50,
});

recipients.forEach(r => {
  console.log(`${r.email}: ${r.status}`);
  if (r.openedAt) {
    console.log(`  Opened: ${r.openedAt}`);
  }
  if (r.firstClickedAt) {
    console.log(`  Clicked: ${r.firstClickedAt}`);
  }
});
```

### Handle Unsubscribe Links

In email templates, include:

```tsx
// Generate token server-side
const token = await preferenceCenterService.generateUnsubscribeToken(userId);

// In email template
const unsubscribeUrl = `https://yesgoddess.com/unsubscribe?token=${token}`;

<Link href={unsubscribeUrl}>
  Unsubscribe
</Link>
```

Then on the unsubscribe page:

```typescript
// Verify token
const userId = await trpc.emailCampaigns.verifyUnsubscribeToken.query({
  token: params.token,
});

if (userId) {
  // Show preference options or confirm unsubscribe
  await trpc.emailCampaigns.unsubscribe.mutate({
    email: user.email,
  });
}
```

## Monitoring

### Check Queue Status

```bash
# Redis CLI
redis-cli LLEN bull:email-campaigns:waiting
redis-cli LLEN bull:email-campaigns:active
redis-cli LLEN bull:email-campaigns:failed
```

### View Campaign Stats

```sql
-- Overall campaign performance
SELECT 
  status,
  COUNT(*) as count,
  AVG(CASE WHEN sent_count > 0 
    THEN delivered_count::FLOAT / sent_count * 100 
    ELSE 0 END) as avg_delivery_rate,
  AVG(CASE WHEN delivered_count > 0 
    THEN opened_count::FLOAT / delivered_count * 100 
    ELSE 0 END) as avg_open_rate
FROM email_campaigns
GROUP BY status;

-- Recent campaigns
SELECT 
  name,
  status,
  sent_count,
  opened_count,
  clicked_count,
  created_at
FROM email_campaigns
ORDER BY created_at DESC
LIMIT 10;
```

### Recipient Status Distribution

```sql
SELECT 
  c.name,
  r.status,
  COUNT(*) as count
FROM campaign_recipients r
JOIN email_campaigns c ON c.id = r.campaign_id
WHERE c.id = 'campaign_id'
GROUP BY c.name, r.status;
```

## Troubleshooting

### Campaign Not Sending

1. Check worker is running: `pm2 list | grep campaign`
2. Check campaign status: Should be `SCHEDULED`
3. Check queue: `redis-cli LRANGE bull:email-campaigns:waiting 0 -1`
4. Check logs: `pm2 logs campaign-worker`

### Low Delivery Rates

1. Check suppression list size: `SELECT COUNT(*) FROM email_suppressions;`
2. Review bounce reasons: 
   ```sql
   SELECT bounce_reason, COUNT(*) 
   FROM email_events 
   WHERE event_type = 'BOUNCED' 
   GROUP BY bounce_reason;
   ```
3. Verify sender domain: Resend dashboard

### Analytics Not Updating

1. Check webhook configuration in Resend
2. Verify webhook endpoint is accessible
3. Check `email_events` table for recent events
4. Review campaign event tracker logs

## Best Practices

### Campaign Creation

- Always send test emails first
- Start with small segments for new campaigns
- Use clear, descriptive campaign names
- Tag campaigns for easy filtering
- Schedule during optimal send times

### Audience Targeting

- Respect user preferences
- Exclude unengaged users after 6 months
- Segment by engagement level
- Test different audiences with A/B tests
- Monitor unsubscribe rates by segment

### Content

- Follow YES GODDESS brand guidelines
- Keep subject lines under 50 characters
- Include preview text (first 100 chars visible)
- Always include unsubscribe link
- Personalize content when possible

### Performance

- Batch sizes: 100-500 emails
- Messages per hour: 1000-5000 (based on list quality)
- Schedule during business hours (recipient timezone)
- Allow 24-48 hours for full delivery
- Monitor first hour for issues

### Compliance

- Honor unsubscribe requests immediately
- Include physical mailing address
- Provide preference center link
- Keep audit logs for 7 years
- Respect GDPR/CAN-SPAM requirements

## Support

For issues or questions:
- Check logs: `pm2 logs campaign-worker`
- Review audit events: `SELECT * FROM audit_events WHERE entity_type = 'email_campaign';`
- Database queries: Use Prisma Studio (`npx prisma studio`)
- Redis monitoring: Use RedisInsight

## Next Steps

1. Create your first campaign
2. Test with small audience
3. Review analytics
4. Iterate and improve
5. Set up recurring campaigns
6. Implement A/B testing (future enhancement)
