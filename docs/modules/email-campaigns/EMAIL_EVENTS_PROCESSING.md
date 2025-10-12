# Email Events Processing Implementation

## Overview

Complete implementation of email events processing for the YES GODDESS platform using Resend webhooks. This system provides comprehensive tracking, deliverability monitoring, and automated alerting to maintain sender reputation and ensure optimal email performance.

## Architecture

### Core Components

1. **Webhook Endpoint** (`/api/webhooks/resend`)
   - Receives events from Resend
   - Verifies webhook signatures using HMAC-SHA256
   - Processes events idempotently
   - Handles bounce and complaint suppression automatically

2. **Email Tracking Service** (`/lib/services/email/tracking.service.ts`)
   - Stores detailed event data with enrichment
   - Tracks opens (unique and repeat)
   - Records clicks with URL and position
   - Calculates engagement scores per recipient
   - Provides real-time metrics caching

3. **Email Deliverability Service** (`/lib/services/email/deliverability.service.ts`)
   - Monitors delivery, bounce, and complaint rates
   - Calculates metrics hourly and daily
   - Generates alerts when thresholds exceeded
   - Tracks domain-level performance
   - Provides trend analysis

4. **Suppression List Manager** (`/lib/adapters/email/suppression-list.ts`)
   - Automatically suppresses bounced emails
   - Immediately blocks spam complainers
   - Provides fast Redis-cached lookups
   - Supports bulk operations

5. **Reputation Service** (`/lib/services/email/reputation.service.ts`)
   - Calculates sender reputation score (0-100)
   - Monitors blacklist status
   - Validates SPF, DKIM, DMARC
   - Sends alerts to administrators

## Event Flow

```
Resend → Webhook Endpoint → Signature Verification → Event Processing
                                                            ↓
                    ┌───────────────────────────────────────┴──────────────────────────────────┐
                    ↓                                   ↓                                       ↓
            Bounce Handling                     Complaint Processing                  Event Storage
                    ↓                                   ↓                                       ↓
        Add to Suppression List            Add to Suppression List              EmailEvent Table
                                                                                                ↓
                                                                                    ┌───────────┴──────────┐
                                                                                    ↓                      ↓
                                                                          Campaign Analytics      Engagement Scoring
```

## Event Types Processed

### 1. SENT
- Recorded when email is accepted by Resend
- Used for calculating send volume

### 2. DELIVERED
- Email successfully delivered to recipient's server
- Used for delivery rate calculation

### 3. OPENED
- Email opened by recipient
- Tracks unique vs. repeat opens
- Enriched with device type, email client, geographic data
- Used for engagement scoring

### 4. CLICKED
- Link clicked within email
- Tracks URL and link position
- Used for engagement scoring and link performance

### 5. BOUNCED
- Email bounced (hard or soft)
- **Automatic Actions:**
  - Add to suppression list
  - Store bounce reason for analysis
  - Classify as hard/soft bounce
- Used for bounce rate monitoring

### 6. COMPLAINED
- Recipient marked email as spam
- **Automatic Actions:**
  - Immediately add to suppression list
  - Generate urgent alert if rate > 0.3%
  - Log for compliance
- Used for complaint rate monitoring

## Deliverability Monitoring

### Metrics Tracked

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|------------------|-------------------|---------|
| **Delivery Rate** | < 95% | < 90% | Investigate infrastructure |
| **Bounce Rate** | > 2% | > 5% | Pause sending, clean list |
| **Complaint Rate** | > 0.1% | > 0.3% | Review content & targeting |
| **Failure Spike** | - | > 100/hour | Check provider status |

### Monitoring Schedule

- **Hourly:** Real-time deliverability checks at :05 past each hour
- **Daily:** Full analysis at 3 AM with trend comparison
- **On-Demand:** Manual checks available via API

### Alert System

Alerts are sent to all active admin users via the notification system:

- **Info:** Metric approaching threshold
- **Warning:** Metric exceeded warning threshold
- **Critical:** Metric exceeded critical threshold, action required
- **Urgent:** Immediate action required (e.g., complaint rate > 0.3%)

Alert suppression prevents notification fatigue: same alert type won't re-trigger for 4 hours.

## Engagement Scoring

### Scoring Algorithm

Each recipient receives an engagement score based on their interaction history:

```typescript
Base Points:
- Open: 1 point
- Click: 3 points

Multipliers:
- Recent activity (last 30 days): 2x
- Old activity (> 90 days): 0.5x

Engagement Levels:
- Very High: Score ≥ 50
- High: Score ≥ 20
- Medium: Score ≥ 5
- Low: Score > 0
- Inactive: Score = 0
```

### Use Cases

1. **Targeted Campaigns:** Send to highly engaged users first
2. **Re-engagement:** Identify inactive users for win-back campaigns
3. **Frequency Optimization:** Reduce sends to low-engagement users
4. **Segmentation:** Create segments by engagement level

## Database Schema

### EmailEvent Table

Stores all email events with rich metadata:

```sql
- id: Unique event identifier
- userId: Associated user (if known)
- email: Recipient email address
- eventType: SENT | DELIVERED | OPENED | CLICKED | BOUNCED | COMPLAINED | FAILED
- messageId: Resend message ID (for idempotency)
- subject: Email subject line
- templateName: Template used
- metadata: JSON with campaign/test info
- sentAt, deliveredAt, openedAt, clickedAt, bouncedAt, complainedAt
- bounceReason: Detailed bounce information
- clickedUrl: URL clicked (for CLICKED events)
- userAgent: Browser/email client info
- ipAddress: For geographic enrichment
- uniqueOpen: First open for this message/email combo
- linkPosition: Position of clicked link in email
- geographicData: Country, region, city (if available)
- deviceType: desktop | mobile | tablet | unknown
- emailClient: Detected email client
```

Indexes optimized for:
- User-level queries
- Campaign analytics
- Deliverability calculations
- Engagement scoring

### EmailSuppression Table

Prevents sending to problematic addresses:

```sql
- id: Unique identifier
- email: Suppressed email address (unique)
- reason: BOUNCE | COMPLAINT | UNSUBSCRIBE | MANUAL
- suppressedAt: When suppression occurred
- bounceType: hard | soft (for bounces)
- bounceReason: Detailed reason
```

Redis cache for fast lookups (24-hour TTL).

### EmailReputationMetrics Table

Historical reputation tracking:

```sql
- timestamp: When metrics calculated
- senderDomain: Domain being monitored
- bounceRate, complaintRate, deliveryRate
- openRate, clickRate
- reputationScore: Overall score (0-100)
- blacklistStatus: JSON with blacklist check results
- warnings: JSON with any alerts generated
```

## API Integration

### Services Available

```typescript
import {
  emailDeliverabilityService,
  emailTrackingService,
  emailReputationService,
} from '@/lib/services/email';

// Get current deliverability metrics
const metrics = await emailDeliverabilityService.calculateMetrics('hour');

// Get engagement score for a user
const engagement = await emailTrackingService.getEngagementScore('user@example.com');

// Get current reputation
const score = await emailReputationService.getCurrentReputationScore('yesgoddess.com');
```

### Scheduled Jobs

```typescript
import {
  scheduleDeliverabilityMonitoring,
  checkDeliverabilityNow,
} from '@/jobs/deliverability-monitoring.job';

import {
  scheduleReputationMonitoring,
  checkReputationNow,
} from '@/jobs/reputation-monitoring.job';

// Initialize in your job scheduler
await scheduleDeliverabilityMonitoring();
await scheduleReputationMonitoring();
```

## Configuration

### Environment Variables

```bash
# Resend Configuration (already configured)
RESEND_API_KEY=your-api-key
RESEND_SENDER_EMAIL=noreply@updates.yesgoddess.agency
RESEND_WEBHOOK_SECRET=your-webhook-secret
EMAIL_FROM_NAME=YES GODDESS

# Optional: Custom thresholds
DELIVERABILITY_BOUNCE_RATE_WARNING=0.02
DELIVERABILITY_BOUNCE_RATE_CRITICAL=0.05
DELIVERABILITY_COMPLAINT_RATE_WARNING=0.001
DELIVERABILITY_COMPLAINT_RATE_CRITICAL=0.003
```

### Webhook Setup in Resend

1. Log into Resend dashboard
2. Navigate to Webhooks
3. Add webhook endpoint: `https://your-domain.com/api/webhooks/resend`
4. Select events:
   - `email.sent`
   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.bounced`
   - `email.complained`
5. Copy webhook secret to `RESEND_WEBHOOK_SECRET` env var

## Security

### Signature Verification

All webhook requests are verified using HMAC-SHA256:

```typescript
const signature = crypto
  .createHmac('sha256', RESEND_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');

// Timing-safe comparison
const isValid = crypto.timingSafeEqual(
  Buffer.from(receivedSignature),
  Buffer.from(expectedSignature)
);
```

Unauthorized requests (401) are logged for security monitoring.

### Rate Limiting

Webhook endpoint is protected by:
- Signature verification (prevents abuse)
- Idempotency checks (prevents duplicate processing)
- Error handling with circuit breaker pattern

## Performance Optimizations

### Redis Caching

- **Suppression List:** 24-hour cache, checked before every send
- **Real-Time Metrics:** Hourly and daily aggregates cached
- **Unique Opens:** 30-day cache to identify first opens
- **Engagement Scores:** Can be cached per user

### Database Optimizations

- Composite indexes on frequently queried fields
- Partial indexes for active records
- JSONB for flexible metadata storage
- Connection pooling via Prisma

### Async Processing

- Webhook processing is fast (< 100ms target)
- Heavy calculations done in background jobs
- Alert generation is non-blocking

## Monitoring & Observability

### Logs

All events logged with structured format:

```
[ResendWebhook] Processed email.bounced for user@example.com
[ResendWebhook] Added user@example.com to suppression list (bounce: hard)
[DeliverabilityMonitoring] Metrics for hour: deliveryRate=98.5%, bounceRate=1.2%
[DeliverabilityMonitoring] Generated 0 alert(s)
```

### Metrics to Monitor

- Webhook processing time
- Event processing rate
- Alert generation frequency
- Suppression list size
- Reputation score trends

## Troubleshooting

### Common Issues

**1. Webhook Not Receiving Events**
- Check Resend webhook configuration
- Verify endpoint is publicly accessible
- Check webhook secret matches
- Review logs for signature verification failures

**2. High Bounce Rate**
- Review suppression list additions
- Check email validation at signup
- Audit recent list imports
- Verify sender authentication (SPF, DKIM, DMARC)

**3. Low Engagement Scores**
- Review email content relevance
- Check send frequency
- Analyze send time optimization
- Segment by engagement level

**4. Alerts Not Triggering**
- Check alert suppression cache
- Verify admin users exist and are active
- Review notification preferences
- Check metric calculation queries

## Best Practices

### Email Sending

1. **Always check suppression list** before sending
2. **Respect user preferences** for email types
3. **Monitor reputation daily** for early warning signs
4. **Segment by engagement** for better targeting
5. **Test with small batches** before large campaigns

### Maintenance

1. **Review alerts weekly** and take corrective action
2. **Clean suppression list quarterly** (manual/unsubscribe only)
3. **Audit bounce reasons** to identify patterns
4. **Monitor domain reputation** across providers
5. **Update thresholds** based on historical performance

### Compliance

1. **Honor unsubscribes immediately** via suppression list
2. **Provide clear unsubscribe links** in all emails
3. **Log all complaint events** for audit trail
4. **Maintain suppression list** for legal compliance
5. **Respect engagement signals** to avoid spam classification

## Future Enhancements

Potential additions for future phases:

1. **Predictive Analytics:** ML model to predict bounce/complaint risk
2. **Send Time Optimization:** AI-powered best send time per user
3. **Content Analysis:** Spam score checking before send
4. **A/B Testing Integration:** Track variant performance
5. **External Reputation APIs:** Integrate Google Postmaster, Microsoft SNDS
6. **Geographic Optimization:** Send from closest Resend region
7. **Email Warmup:** Automated sender warmup for new domains

## Support

For issues or questions:
- Check logs: `[ResendWebhook]`, `[DeliverabilityMonitoring]`, `[ReputationMonitoring]`
- Review alerts in admin notification center
- Run manual checks: `checkDeliverabilityNow()`
- Contact: admin@yesgoddess.com
