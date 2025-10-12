# Email Events Processing - Quick Reference

## Quick Start

### 1. Setup Webhook in Resend

```bash
# Webhook URL
https://your-domain.com/api/webhooks/resend

# Events to enable
✓ email.sent
✓ email.delivered  
✓ email.opened
✓ email.clicked
✓ email.bounced
✓ email.complained
```

### 2. Configure Environment

```bash
# Already configured in .env
RESEND_WEBHOOK_SECRET=whsec_gcxmtNXBY1DteDmehlsF9wpUNepJyj15
```

### 3. Initialize Jobs

```typescript
// In your job scheduler initialization
import { scheduleDeliverabilityMonitoring } from '@/jobs/deliverability-monitoring.job';
import { scheduleReputationMonitoring } from '@/jobs/reputation-monitoring.job';

await scheduleDeliverabilityMonitoring();
await scheduleReputationMonitoring();
```

## Common Operations

### Check Current Deliverability

```typescript
import { emailDeliverabilityService } from '@/lib/services/email';

// Get hourly metrics
const metrics = await emailDeliverabilityService.calculateMetrics('hour');
console.log(`Delivery Rate: ${(metrics.deliveryRate * 100).toFixed(2)}%`);
console.log(`Bounce Rate: ${(metrics.bounceRate * 100).toFixed(2)}%`);
console.log(`Complaint Rate: ${(metrics.complaintRate * 100).toFixed(4)}%`);
```

### Check Engagement Score

```typescript
import { emailTrackingService } from '@/lib/services/email';

const engagement = await emailTrackingService.getEngagementScore('user@example.com');
console.log(`Score: ${engagement.score} (${engagement.level})`);
console.log(`Recent Opens: ${engagement.recentOpens}`);
console.log(`Recent Clicks: ${engagement.recentClicks}`);
```

### Check Reputation

```typescript
import { emailReputationService } from '@/lib/services/email';

const score = await emailReputationService.getCurrentReputationScore('yesgoddess.com');
console.log(`Reputation Score: ${score}/100`);

const shouldPause = await emailReputationService.shouldPauseSending('yesgoddess.com');
if (shouldPause) {
  console.warn('⚠️ Sending paused due to low reputation!');
}
```

### Check If Email Suppressed

```typescript
import { SuppressionListManager } from '@/lib/adapters/email/suppression-list';

const suppressionList = new SuppressionListManager();
const isSuppressed = await suppressionList.isSuppressed('user@example.com');

if (isSuppressed) {
  const info = await suppressionList.getSuppressionInfo('user@example.com');
  console.log(`Suppressed: ${info?.reason} at ${info?.suppressedAt}`);
}
```

## Alerting Thresholds

| Metric | Warning | Critical | Urgent |
|--------|---------|----------|--------|
| Delivery Rate | < 95% | < 90% | - |
| Bounce Rate | > 2% | > 5% | - |
| Complaint Rate | > 0.1% | > 0.3% | > 0.5% |
| Reputation Score | < 70 | < 50 | - |
| Failure Spike | - | > 100/hour | > 500/hour |

## Engagement Levels

| Level | Score | Description |
|-------|-------|-------------|
| Very High | ≥ 50 | Highly engaged, send frequently |
| High | 20-49 | Engaged, normal frequency |
| Medium | 5-19 | Moderately engaged, reduce frequency |
| Low | 1-4 | Rarely engaged, minimal sends |
| Inactive | 0 | No engagement, re-engagement needed |

## Event Processing Times

- **Webhook Receipt:** < 50ms
- **Signature Verification:** < 10ms  
- **Event Storage:** < 100ms
- **Bounce Suppression:** < 50ms
- **Total Processing:** < 200ms target

## Monitoring Commands

```typescript
// Run immediate deliverability check
import { checkDeliverabilityNow } from '@/jobs/deliverability-monitoring.job';
await checkDeliverabilityNow('hour');

// Run immediate reputation check
import { checkReputationNow } from '@/jobs/reputation-monitoring.job';
await checkReputationNow('yesgoddess.com');

// Get domain-level metrics
const domainMetrics = await emailDeliverabilityService.getMetricsByDomain('day');
domainMetrics.forEach(d => {
  console.log(`${d.domain}: ${d.issues.join(', ') || 'No issues'}`);
});

// Get deliverability trend
const trend = await emailDeliverabilityService.getDeliverabilityTrend(7);
trend.forEach(day => {
  console.log(`${day.date}: Delivery ${(day.deliveryRate * 100).toFixed(1)}%`);
});
```

## Troubleshooting

### Webhook Not Working

```bash
# 1. Check webhook is configured in Resend
# 2. Verify endpoint is accessible
curl -X POST https://your-domain.com/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -d '{"type":"email.sent","data":{"email":"test@example.com"}}'

# 3. Check logs
grep "ResendWebhook" logs/application.log

# 4. Verify signature
# Logs will show "Invalid signature" if secret mismatch
```

### High Bounce Rate

```typescript
// 1. Check recent bounces
const events = await prisma.emailEvent.findMany({
  where: {
    eventType: 'BOUNCED',
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  },
  include: { bounceReason: true }
});

// 2. Review suppression list
const stats = await suppressionList.getStatistics();
console.log(`Total Suppressed: ${stats.total}`);
console.log(`Bounces: ${stats.byReason.BOUNCE}`);

// 3. Export suppression list for review
const suppressions = await suppressionList.export({ reason: 'BOUNCE' });
```

### No Alerts Being Sent

```typescript
// 1. Check if admins exist
const admins = await prisma.user.count({
  where: { role: 'ADMIN', isActive: true }
});
console.log(`Active admins: ${admins}`);

// 2. Check alert suppression cache
const suppressionKey = 'alert:suppressed:bounce_rate:hour';
const suppressed = await redis.get(suppressionKey);
console.log(`Alert suppressed: ${suppressed ? 'Yes' : 'No'}`);

// 3. Manually trigger monitoring
await checkDeliverabilityNow('hour');
```

## Common Queries

### Get Today's Stats

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

const stats = await prisma.emailEvent.groupBy({
  by: ['eventType'],
  where: { createdAt: { gte: today } },
  _count: { id: true }
});

stats.forEach(s => {
  console.log(`${s.eventType}: ${s._count.id}`);
});
```

### Get Top Performers (Links)

```typescript
const campaignId = 'your-campaign-id';
const linkPerf = await emailTrackingService.getLinkPerformance(campaignId);

linkPerf.forEach(link => {
  console.log(`${link.url}: ${link.clicks} clicks (${(link.clickRate * 100).toFixed(2)}%)`);
});
```

### Get Inactive Users

```typescript
const inactive = await emailTrackingService.getInactiveUsers(90); // 90 days
console.log(`Inactive users: ${inactive.length}`);

// Re-engagement campaign
const reengageEmails = inactive.slice(0, 100).map(u => u.email);
```

### Get Highly Engaged Users

```typescript
const topUsers = await emailTrackingService.getTopEngagedUsers(50);
topUsers.forEach(u => {
  console.log(`${u.email}: Score ${u.score} (${u.recentOpens} opens, ${u.recentClicks} clicks)`);
});
```

## Job Schedules

| Job | Schedule | Purpose |
|-----|----------|---------|
| Hourly Deliverability | Every hour at :05 | Monitor recent sending |
| Daily Deliverability | 3:00 AM daily | Daily trends and alerts |
| Reputation Monitoring | 2:00 AM daily | Check reputation, blacklists, auth |

## File Locations

```
src/
├── app/api/webhooks/resend/
│   └── route.ts                          # Webhook endpoint
├── lib/
│   ├── services/email/
│   │   ├── deliverability.service.ts     # Deliverability monitoring
│   │   ├── tracking.service.ts           # Event tracking & engagement
│   │   └── reputation.service.ts         # Reputation monitoring
│   ├── adapters/email/
│   │   └── suppression-list.ts           # Suppression management
│   └── utils/
│       └── verify-resend-webhook.ts      # Signature verification
└── jobs/
    ├── deliverability-monitoring.job.ts  # Scheduled monitoring
    └── reputation-monitoring.job.ts      # Reputation checks

docs/modules/email-campaigns/
└── EMAIL_EVENTS_PROCESSING.md            # Full documentation
```

## Integration Checklist

- [x] Webhook endpoint created
- [x] Signature verification implemented
- [x] Event storage in database
- [x] Bounce handling with suppression
- [x] Complaint processing with suppression
- [x] Engagement scoring system
- [x] Deliverability monitoring service
- [x] Alert system for administrators
- [x] Scheduled monitoring jobs
- [x] Documentation complete

## Next Steps

1. **Configure Resend webhook** with your domain URL
2. **Start monitoring jobs** in your application initialization
3. **Review first alerts** to tune thresholds if needed
4. **Monitor logs** for webhook processing
5. **Check suppression list growth** weekly
6. **Review engagement scores** for segmentation opportunities

## Support

For questions or issues:
- Review logs with `[ResendWebhook]`, `[DeliverabilityMonitoring]` prefixes
- Check admin notifications for alerts
- Run manual checks using commands above
- See full documentation: `docs/modules/email-campaigns/EMAIL_EVENTS_PROCESSING.md`
