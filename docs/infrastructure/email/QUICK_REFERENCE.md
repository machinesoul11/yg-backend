# Resend Optimization - Quick Reference

## Service Imports

```typescript
import {
  emailReputationService,
  emailTrackingService,
  unsubscribeService,
  emailSchedulingService,
  abTestingService,
  personalizationService,
} from '@/lib/services/email';
```

## Common Operations

### Check Reputation

```typescript
const score = await emailReputationService.getCurrentReputationScore('yesgoddess.com');
const shouldPause = await emailReputationService.shouldPauseSending('yesgoddess.com');
```

### Schedule Email

```typescript
await emailSchedulingService.scheduleEmail({
  emailType: 'campaign',
  recipientEmail: 'user@example.com',
  templateId: 'newsletter',
  subject: 'Monthly Update',
  scheduledSendTime: new Date('2025-10-15T10:00:00Z'),
  optimizeSendTime: true, // Use recipient's best time
  recurrencePattern: 'weekly', // Optional: for recurring
});
```

### Process Unsubscribe

```typescript
await unsubscribeService.processUnsubscribe({
  userId,
  email: 'user@example.com',
  global: false, // false = category-specific, true = all emails
  categories: ['newsletters', 'announcements'],
  source: 'one_click',
});
```

### Create A/B Test

```typescript
const testId = await abTestingService.createTest({
  name: 'Subject Line Test',
  testType: 'subject_line',
  variants: [
    { id: 'a', name: 'Control', changes: { subject: 'Hello!' } },
    { id: 'b', name: 'Variant', changes: { subject: 'Hi There!' } },
  ],
  allocationPercentage: { a: 50, b: 50 },
  primaryMetric: 'open_rate',
});

await abTestingService.startTest(testId);
const variant = await abTestingService.assignVariant(testId, email, userId);
```

### Personalize Content

```typescript
const data = await personalizationService.resolveVariables(userId);
const subject = personalizationService.replaceVariables(
  'Hello {{firstName}}, your balance is {{totalEarnings}}',
  data
);
```

### Real-Time Metrics

```typescript
const metrics = await emailTrackingService.getRealTimeMetrics('hour');
// Returns: { sent, delivered, opened, clicked, bounced, complained }

const links = await emailTrackingService.getLinkPerformance('campaign-id');
// Returns per-link click stats
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `email_reputation_metrics` | Reputation scores over time |
| `domain_reputation_log` | External reputation data |
| `email_tests` | A/B test definitions |
| `email_test_assignments` | Variant assignments |
| `scheduled_emails` | Scheduled send queue |
| `email_personalization_variables` | Variable catalog |
| `email_campaign_analytics` | Campaign metrics |
| `email_unsubscribe_log` | Audit trail |
| `email_events` (enhanced) | All email events with tracking |
| `email_preferences` (enhanced) | Granular preferences |

## Background Jobs

### Reputation Monitoring
- **Schedule:** Daily at 2 AM
- **File:** `src/jobs/reputation-monitoring.job.ts`
- **Tasks:** Calculate metrics, check blacklists, validate DNS

### Scheduled Email Worker
- **Queue:** `scheduled-emails`
- **File:** `src/lib/services/email/scheduling.service.ts`
- **Tasks:** Send scheduled emails, handle retries, recurring sends

## Key Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Bounce Rate | 2% | 5% |
| Complaint Rate | 0.1% | 0.3% |
| Reputation Score | < 70 | < 50 |
| Delivery Rate | < 95% | < 90% |

## Webhook Events

Processed by `src/app/api/webhooks/resend/route.ts`:

- `email.sent` → Track send time
- `email.delivered` → Update delivery status
- `email.opened` → Track opens (unique detection)
- `email.clicked` → Track clicks (with URL and position)
- `email.bounced` → Update bounce count
- `email.complained` → Update complaint count

## CLI Commands

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Run migration
npm run db:migrate

# Check database
npm run db:studio
```

## Personalization Variables

### User
- `{{firstName}}`, `{{lastName}}`, `{{fullName}}`, `{{email}}`
- `{{memberSince}}`, `{{accountAge}}`, `{{lastLoginDate}}`

### Creator
- `{{stageName}}`, `{{portfolioUrl}}`
- `{{lastRoyaltyAmount}}`, `{{totalEarnings}}`, `{{activeProjects}}`

### Brand
- `{{brandName}}`, `{{companyName}}`, `{{activeLicenses}}`

## A/B Test Types

- `subject_line` - Test subject variations
- `content` - Test template/content variations
- `send_time` - Test optimal send times
- `from_name` - Test sender name variations

## Email Scheduling Patterns

- `'daily'` - Repeat every day
- `'weekly'` - Repeat every 7 days
- `'monthly'` - Repeat every month
- Custom cron patterns (future enhancement)

## Unsubscribe Sources

- `email_client` - Native email client unsubscribe
- `one_click` - List-Unsubscribe header
- `preference_center` - User preference page
- `webhook` - Resend webhook notification

## API Endpoints

### Webhooks
- `POST /api/webhooks/resend` - Resend event webhook

### Future (To Implement)
- `GET /api/email/preferences/:token` - Preference center
- `POST /api/email/unsubscribe/:token` - One-click unsubscribe
- `GET /api/email/analytics/:campaignId` - Campaign analytics
- `GET /api/email/tests/:testId/results` - A/B test results

## Environment Variables

```env
RESEND_API_KEY=re_...
RESEND_SENDER_EMAIL=no-reply@yesgoddess.com
RESEND_SENDER_DOMAIN=yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_...
```

## Troubleshooting

### Reputation score dropping?
1. Check bounce rate in `email_reputation_metrics`
2. Review bounced emails in `email_events`
3. Clean suppression list
4. Validate email addresses before sending

### Emails not being tracked?
1. Verify webhook is configured in Resend
2. Check `RESEND_WEBHOOK_SECRET` is set
3. Test webhook endpoint manually
4. Review webhook handler logs

### A/B test not assigning variants?
1. Ensure test status is 'ACTIVE'
2. Check allocation percentages sum to 100
3. Verify `assignVariant()` is called before sending

### Scheduled emails not sending?
1. Check `scheduled_emails` table for status
2. Verify BullMQ worker is running
3. Check job queue in Redis
4. Review worker logs for errors

## Performance Tips

1. **Redis caching:** Real-time metrics cached for 1 hour
2. **Batch operations:** Use campaign-level analytics for bulk data
3. **Indexes:** All foreign keys and frequently queried fields indexed
4. **Concurrent jobs:** Scheduled email worker runs 10 concurrent
5. **Cleanup:** Old jobs auto-removed (1000 completed, 2000 failed)

## Compliance Notes

- **GDPR:** Unsubscribe honored immediately, audit trail maintained
- **CAN-SPAM:** One-click unsubscribe, physical address in templates
- **CASL:** Consent tracking, easy opt-out
- **Data Retention:** Audit logs kept indefinitely, event data 90 days

## Next Steps

1. Deploy database migration
2. Configure Resend webhook
3. Schedule reputation monitoring job
4. Build preference center UI
5. Create analytics dashboard
6. Set up monitoring alerts
