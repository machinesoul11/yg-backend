# Email Campaigns Module

Complete email campaign management system for the YES GODDESS platform.

## Features

✅ **Campaign Management**
- Create and schedule email campaigns
- Flexible audience segmentation
- Rate limiting and batch sending
- Real-time analytics and reporting
- Test email sending

✅ **Audience Segmentation**
- Role-based filtering (Creator, Brand, Admin, Viewer)
- Verification status filtering
- Date range filtering (signup, last login)
- Creator specialty matching
- Brand industry targeting
- Custom criteria with JSONB support
- Automatic preference and suppression list filtering

✅ **Email Preference Center**
- Granular category preferences
- Global and category-specific unsubscribe
- Digest frequency management
- Secure one-click unsubscribe links
- Re-subscription support

✅ **GDPR Compliance**
- Right to access (data export)
- Right to erasure (data deletion)
- Right to object (unsubscribe)
- Right to portability (structured export)
- Comprehensive audit trails
- Consent tracking

✅ **Analytics & Reporting**
- Real-time campaign statistics
- Delivery, open, and click rates
- Bounce and unsubscribe tracking
- Link performance analysis
- Device and geographic breakdowns
- Hourly send pattern analysis

## Architecture

```
src/modules/email-campaigns/
├── router.ts                          # tRPC API endpoints
├── index.ts                           # Module exports

src/lib/services/email/
├── campaign.service.ts                # Campaign CRUD and scheduling
├── preference-center.service.ts       # User preferences and GDPR
├── campaign-tracker.service.ts        # Event tracking and analytics

src/jobs/
├── email-campaign-worker.job.ts       # Background campaign sender

src/lib/validators/
└── email.validators.ts                # Zod schemas (enhanced)

docs/modules/email-campaigns/
├── IMPLEMENTATION_SUMMARY.md          # Complete implementation details
├── QUICK_START.md                     # Getting started guide
├── migration.sql                      # Database migration SQL
└── README.md                          # This file
```

## Database Schema

**New Tables:**
- `email_campaigns` - Campaign configuration and statistics
- `campaign_recipients` - Individual recipient tracking
- `saved_email_segments` - Reusable audience definitions
- `email_campaign_clicks` - Detailed click tracking
- `email_campaign_reports` - Pre-computed analytics

**Enhanced Tables:**
- `email_preferences` - Added `global_unsubscribe`, `unsubscribe_token`, `preference_center_last_visited`

**New Enums:**
- `EmailCampaignStatus`
- `CampaignRecipientStatus`

## API Reference

### Admin Endpoints

```typescript
// Campaign Management
emailCampaigns.create(params)           // Create draft campaign
emailCampaigns.update({ id, data })     // Update campaign
emailCampaigns.schedule({ id })         // Schedule for sending
emailCampaigns.cancel({ id, reason })   // Cancel campaign
emailCampaigns.sendTest({ id, emails }) // Send test emails

// Queries
emailCampaigns.get({ id })              // Get campaign details
emailCampaigns.list({ status, limit })  // List campaigns
emailCampaigns.analytics({ id })        // Get analytics
emailCampaigns.recipients({ id })       // List recipients
```

### User Endpoints

```typescript
// Preference Management
emailCampaigns.getMyPreferences()       // Get preferences
emailCampaigns.updateMyPreferences(...)  // Update preferences
emailCampaigns.unsubscribe({ email })   // Global unsubscribe
emailCampaigns.resubscribe()            // Opt back in

// GDPR
emailCampaigns.exportMyEmailData()      // Export all data
emailCampaigns.deleteMyEmailData()      // Delete all data
```

## Quick Start

### 1. Install and Migrate

```bash
# Apply database migration
npx prisma migrate dev --name add_email_campaigns
npx prisma generate

# Start campaign worker
npm run dev
```

### 2. Create Your First Campaign

```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: 'Welcome Campaign',
  templateId: 'welcome-email',
  subject: 'Welcome to YES GODDESS',
  segmentCriteria: {
    role: ['CREATOR'],
    createdAfter: new Date('2025-11-01'),
  },
  scheduledSendTime: new Date('2025-11-10T10:00:00Z'),
});

// Send test
await trpc.emailCampaigns.sendTest.mutate({
  id: campaign.id,
  testEmails: ['test@example.com'],
});

// Schedule
await trpc.emailCampaigns.schedule.mutate({
  id: campaign.id,
});
```

### 3. Monitor Performance

```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: campaign.id,
});

console.log('Delivery:', analytics.rates.deliveryRate + '%');
console.log('Opens:', analytics.rates.openRate + '%');
console.log('Clicks:', analytics.rates.clickRate + '%');
```

## Segmentation Examples

```typescript
// Active creators
{ role: ['CREATOR'], lastLoginAfter: new Date('2025-10-01') }

// New brands
{ role: ['BRAND'], createdAfter: new Date('2025-11-01') }

// Fashion industry brands
{ brandIndustries: ['fashion', 'beauty'] }

// Photographers
{ creatorSpecialties: ['photography'] }

// Verified users only
{ verificationStatus: ['approved'] }
```

## Configuration

### Environment Variables

```env
# Required
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=re_xxxxx
DATABASE_URL_POOLED=postgresql://...

# Optional
DEFAULT_MESSAGES_PER_HOUR=1000
DEFAULT_BATCH_SIZE=100
```

### Rate Limiting Defaults

- **Messages per hour:** 1000
- **Batch size:** 100
- **Worker concurrency:** 1 campaign at a time

## Best Practices

### Campaign Creation
- ✅ Always send test emails first
- ✅ Start with small segments for new campaigns
- ✅ Use descriptive names and tags
- ✅ Schedule during optimal times

### Audience Targeting
- ✅ Respect user preferences
- ✅ Exclude unengaged users
- ✅ Monitor unsubscribe rates
- ✅ Test different segments

### Performance
- ✅ Batch size: 100-500 emails
- ✅ Rate limit: Based on list quality
- ✅ Allow 24-48 hours for delivery
- ✅ Monitor first hour for issues

### Compliance
- ✅ Honor unsubscribes immediately
- ✅ Include physical address
- ✅ Provide preference center
- ✅ Keep audit logs for 7 years

## Monitoring

### Key Metrics

```sql
-- Campaign performance
SELECT status, COUNT(*), AVG(opened_count::FLOAT / NULLIF(delivered_count, 0) * 100) as avg_open_rate
FROM email_campaigns
GROUP BY status;

-- Recipient status
SELECT status, COUNT(*)
FROM campaign_recipients
WHERE campaign_id = 'xxx'
GROUP BY status;
```

### Alerts

- Campaign failures
- High bounce rates (>5%)
- High unsubscribe rates (>0.5%)
- Queue backlog
- Email provider errors

## Testing

```typescript
// Unit tests
import { campaignService } from '@/lib/services/email/campaign.service';

test('creates campaign with segmentation', async () => {
  const campaign = await campaignService.createCampaign(userId, {
    name: 'Test',
    templateId: 'welcome-email',
    subject: 'Hello',
    segmentCriteria: { role: ['CREATOR'] },
  });
  
  expect(campaign.status).toBe('DRAFT');
  expect(campaign.recipientCount).toBeGreaterThan(0);
});
```

## Troubleshooting

**Campaign not sending:**
1. Check worker status
2. Verify campaign status is SCHEDULED
3. Check Redis queue
4. Review logs

**Low delivery rates:**
1. Check suppression list
2. Verify sender domain
3. Review bounce reasons
4. Validate email quality

**Missing analytics:**
1. Verify webhooks configured
2. Check event processing
3. Review messageId mapping

## Documentation

- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Complete technical details
- [Quick Start Guide](./QUICK_START.md) - Step-by-step usage guide
- [Migration SQL](./migration.sql) - Database migration script

## Support

For issues:
- Check logs: `pm2 logs campaign-worker`
- Inspect queue: `redis-cli LLEN bull:email-campaigns:waiting`
- Review database: `npx prisma studio`

## License

Internal use only - YES GODDESS Platform
