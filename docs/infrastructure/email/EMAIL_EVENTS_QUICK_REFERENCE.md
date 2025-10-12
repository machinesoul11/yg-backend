# Email Events Processing - Quick Reference

## Quick Start

### 1. Environment Setup

Ensure these environment variables are configured:
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_SENDER_EMAIL=noreply@updates.yesgoddess.agency
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxx
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://...
```

### 2. Start Workers

Workers auto-start on application boot when importing:
```typescript
import { initializeEmailWorkers } from '@/jobs/email-workers';
initializeEmailWorkers();
```

### 3. Configure Resend Webhook

In Resend Dashboard:
1. Go to **Webhooks** → **Add Endpoint**
2. URL: `https://api.yesgoddess.com/api/webhooks/resend`
3. Events: Select all email events
4. Copy webhook secret to `RESEND_WEBHOOK_SECRET`

---

## Common Operations

### Check Queue Status

```typescript
import { emailEventsQueue } from '@/jobs/email-events-processor.job';

const waiting = await emailEventsQueue.getWaitingCount();
const active = await emailEventsQueue.getActiveCount();
const failed = await emailEventsQueue.getFailedCount();

console.log(`Queue: ${waiting} waiting, ${active} active, ${failed} failed`);
```

### Get Engagement Score

```typescript
import { emailEngagementScoringService } from '@/lib/services/email';

const score = await emailEngagementScoringService.getScore('user@example.com');
console.log(`Engagement: ${score.score}/100 (${score.segment})`);
```

### Check Active Alerts

```typescript
import { emailAlertsService } from '@/lib/services/email';

const alerts = await emailAlertsService.getActiveAlerts();
console.log(`Active alerts: ${alerts.length}`);

alerts.forEach(alert => {
  console.log(`- [${alert.severity}] ${alert.message}`);
});
```

### Acknowledge Alert

```typescript
import { emailAlertsService } from '@/lib/services/email';

await emailAlertsService.acknowledgeAlert(alertId, userId);
```

### Check Deliverability Metrics

```typescript
import { emailDeliverabilityService } from '@/lib/services/email';

const metrics = await emailDeliverabilityService.calculateMetrics('hour');
console.log(`
Delivery Rate: ${(metrics.deliveryRate * 100).toFixed(2)}%
Bounce Rate: ${(metrics.bounceRate * 100).toFixed(2)}%
Complaint Rate: ${(metrics.complaintRate * 100).toFixed(4)}%
`);
```

### Get Segment Statistics

```typescript
import { emailEngagementScoringService } from '@/lib/services/email';

const stats = await emailEngagementScoringService.getSegmentStatistics();
stats.forEach(segment => {
  console.log(`${segment.segment}: ${segment.count} (${segment.percentage.toFixed(1)}%)`);
});
```

### Find Re-engagement Candidates

```typescript
import { emailEngagementScoringService } from '@/lib/services/email';

const candidates = await emailEngagementScoringService.getReEngagementCandidates(90);
console.log(`Found ${candidates.length} recipients inactive for 90+ days`);
```

---

## Monitoring Dashboard Queries

### Daily Email Health Summary

```typescript
const hourly = await emailDeliverabilityService.calculateMetrics('hour');
const daily = await emailDeliverabilityService.calculateMetrics('day');
const alerts = await emailAlertsService.getActiveAlerts();
const segments = await emailEngagementScoringService.getSegmentStatistics();

const dashboard = {
  deliverability: {
    hourly: {
      sent: hourly.totalSent,
      deliveryRate: `${(hourly.deliveryRate * 100).toFixed(2)}%`,
      bounceRate: `${(hourly.bounceRate * 100).toFixed(2)}%`,
      complaintRate: `${(hourly.complaintRate * 100).toFixed(4)}%`,
    },
    daily: {
      sent: daily.totalSent,
      deliveryRate: `${(daily.deliveryRate * 100).toFixed(2)}%`,
      bounceRate: `${(daily.bounceRate * 100).toFixed(2)}%`,
      complaintRate: `${(daily.complaintRate * 100).toFixed(4)}%`,
    },
  },
  alerts: {
    active: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical' || a.severity === 'urgent').length,
  },
  engagement: {
    highly: segments.find(s => s.segment === 'highly-engaged')?.count || 0,
    moderate: segments.find(s => s.segment === 'moderately-engaged')?.count || 0,
    low: segments.find(s => s.segment === 'low-engagement')?.count || 0,
    disengaged: segments.find(s => s.segment === 'disengaged')?.count || 0,
  },
};
```

---

## Alert Thresholds

### Warning Levels
- Delivery Rate < 95%
- Bounce Rate > 2%
- Complaint Rate > 0.1%

### Critical Levels
- Delivery Rate < 90%
- Bounce Rate > 5%
- Complaint Rate > 0.3%
- Failures > 100/hour

### Alert Actions

**Warning:** Monitor closely, review metrics  
**Critical:** Investigate immediately, may need to pause campaigns  
**Urgent:** Immediate action required, risk of provider suspension  

---

## Engagement Score Calculation

### Formula
```
Base Score: 50
+ (Unique Opens × 5)
+ (Clicks × 15)
× Recency Factor (decays over 180 days)
= Final Score (capped at 100)
```

### Segments
- **Highly Engaged (80-100):** Best targets for all campaigns
- **Moderately Engaged (40-79):** Standard audience
- **Low Engagement (10-39):** Reduce send frequency
- **Disengaged (0-9):** Re-engagement campaign or suppress

### Usage
```typescript
// Check if should receive promotional email
const shouldSend = await emailEngagementScoringService.shouldReceivePromotional(
  'user@example.com',
  30 // minimum score
);
```

---

## Bounce Management

### Hard Bounces
- Permanent delivery failure
- Immediate suppression
- Examples: Invalid address, domain doesn't exist, mailbox disabled

### Soft Bounces
- Temporary delivery failure
- Suppress after 3 in 30 days
- Examples: Mailbox full, server timeout, greylisting

### Checking Suppression
```typescript
import { SuppressionListManager } from '@/lib/adapters/email/suppression-list';

const suppression = new SuppressionListManager();
const isSuppressed = await suppression.isEmailSuppressed('user@example.com');
```

---

## Troubleshooting

### Events Not Processing

1. Check worker status:
```typescript
import { getEmailWorkersHealth } from '@/jobs/email-workers';
const health = await getEmailWorkersHealth();
```

2. Check Redis connection:
```bash
redis-cli ping
```

3. Review worker logs for errors

### Missing Engagement Scores

- Requires email events (opens/clicks) to calculate
- New recipients start with base score of 50
- Scores cached for 24 hours

### Alerts Not Triggering

1. Verify admin users exist with `role: ADMIN` and `isActive: true`
2. Check alert suppression (4-hour default):
```typescript
const suppressed = await emailAlertsService.isAlertSuppressed('bounce_rate', 'hour');
```
3. Review threshold configuration in `EmailDeliverabilityService`

### High Bounce Rates

1. Implement email validation on signup
2. Regularly clean suppression list
3. Use double opt-in for email lists
4. Verify sender authentication (DKIM/SPF/DMARC)
5. Check email list quality and sources

---

## Maintenance Scripts

### Clear Old Alerts
```typescript
import { emailAlertsService } from '@/lib/services/email';
const removed = await emailAlertsService.clearOldAlerts(30); // Keep 30 days
```

### Recalculate All Scores
```typescript
import { emailEngagementScoringService } from '@/lib/services/email';
const result = await emailEngagementScoringService.recalculateAllScores();
console.log(`Processed ${result.processed} recipients in ${result.duration}ms`);
```

### Export Suppression List
```typescript
import { SuppressionListManager } from '@/lib/adapters/email/suppression-list';

const suppression = new SuppressionListManager();
const list = await prisma.emailSuppression.findMany({
  select: { email: true, reason: true, bounceType: true },
});
```

---

## Performance Optimization

### Caching Strategy

- **Engagement Scores:** 24-hour TTL
- **Deliverability Metrics:** 1-hour (hourly) / 24-hour (daily)
- **Alert Suppression:** 4-hour TTL

### Queue Configuration

- **Concurrency:** 10 events simultaneously
- **Retry:** 3 attempts with exponential backoff
- **Retention:** 24 hours (completed), 7 days (failed)

### Database Indexes

Ensure these indexes exist for optimal performance:
- `email_events(email, eventType)`
- `email_events(messageId)`
- `email_events(createdAt)`
- `email_suppressions(email)`

---

## Testing

### Manual Event Test
```typescript
import { enqueueEmailEvent } from '@/jobs/email-events-processor.job';

await enqueueEmailEvent({
  eventId: `test-${Date.now()}`,
  eventType: 'OPENED',
  email: 'test@example.com',
  messageId: 'msg_test_123',
  timestamp: new Date(),
  metadata: { test: true },
});
```

### Webhook Test

Use Resend dashboard → Webhooks → Send Test Event

---

## Best Practices

1. **Monitor daily:** Check deliverability metrics and active alerts
2. **Acknowledge alerts:** Prevents re-triggering of suppressed alerts
3. **Regular cleanup:** Run maintenance scripts monthly
4. **Validate emails:** Implement validation before adding to lists
5. **Respect suppression:** Never manually override bounce/complaint suppression
6. **Review trends:** Weekly analysis of engagement and deliverability trends
7. **Update thresholds:** Adjust based on your typical metrics after baseline established

---

## Support

For issues or questions:
1. Check worker logs: `console.log` statements throughout
2. Review BullMQ dashboard (if installed)
3. Check Resend dashboard for webhook delivery status
4. Examine database records in `email_events` and `email_suppressions`
5. Review comprehensive documentation: `docs/infrastructure/email/EMAIL_EVENTS_IMPLEMENTATION.md`
