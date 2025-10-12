# Resend Email Optimization Implementation

## Overview

This implementation provides a complete email optimization suite for the YesGoddess platform, built on top of Resend. It includes sender reputation monitoring, advanced tracking, A/B testing, email scheduling, granular unsubscribe handling, and personalization.

## Features Implemented

### ✅ 1. Sender Reputation Monitoring

**Location:** `src/lib/services/email/reputation.service.ts`

- **Real-time reputation scoring** (0-100) based on bounce rate, complaint rate, delivery rate, and engagement
- **Automated alerting** when metrics exceed thresholds:
  - Bounce rate: Warning at 2%, Critical at 5%
  - Complaint rate: Warning at 0.1%, Critical at 0.3%
  - Reputation score: Warning below 70, Critical below 50
- **Blacklist monitoring** for major spam blacklists (Spamhaus, SpamCop, SURBL, etc.)
- **DNS authentication validation** (SPF, DKIM, DMARC)
- **Historical trend analysis** to track reputation over time
- **Automatic sending pause** when reputation drops below critical threshold

**Database Tables:**
- `email_reputation_metrics` - Time-series reputation data
- `domain_reputation_log` - External reputation source data

**Job:** `src/jobs/reputation-monitoring.job.ts` - Runs daily at 2 AM

### ✅ 2. Email Tracking (Opens & Clicks)

**Location:** `src/lib/services/email/tracking.service.ts`

- **Open tracking** with unique/repeat detection
- **Click tracking** with URL and link position
- **Device detection** (desktop, mobile, tablet)
- **Email client detection** (Gmail, Outlook, Apple Mail, etc.)
- **Geographic data** (IP-based location - ready for geolocation API integration)
- **Real-time metrics** cached in Redis for dashboard
- **Campaign-level analytics** with automatic rate calculations
- **A/B test metric updates** integrated

**Enhanced Fields in `email_events` table:**
- `unique_open` - First open flag
- `link_position` - Which link in email was clicked
- `geographic_data` - Location info (JSON)
- `device_type` - Desktop/mobile/tablet
- `email_client` - Which email client opened

**Webhook Handler:** `src/app/api/webhooks/resend/route.ts` - Updated to use tracking service

### ✅ 3. Unsubscribe Handling

**Location:** `src/lib/services/email/unsubscribe.service.ts`

- **One-click unsubscribe** with secure token generation
- **Granular category preferences** (royalties, licenses, newsletters, etc.)
- **Frequency preferences** (immediate, daily, weekly, never)
- **Global unsubscribe** option
- **Re-subscription workflow** with audit trail
- **Preference center ready** for web UI integration
- **Compliance audit logging** (GDPR, CAN-SPAM)

**Database Tables:**
- `email_unsubscribe_log` - Complete audit trail
- Enhanced `email_preferences` with new fields:
  - `global_unsubscribe`
  - `category_preferences` (JSON)
  - `frequency_preference`
  - `unsubscribe_token`
  - `preference_center_last_visited`

### ✅ 4. Email Campaign Analytics Dashboard

**Location:** `src/lib/services/email/tracking.service.ts`

**Campaign Analytics Features:**
- Sent, delivered, bounced, opened, clicked counts
- Delivery rate, open rate, click rate, click-to-open rate
- Unsubscribe rate, complaint rate
- Link performance breakdown (per-URL analytics)
- Device breakdown (desktop vs mobile vs tablet)
- Geographic breakdown (country/region/city)
- Real-time metrics (last hour, last day)

**Database Table:**
- `email_campaign_analytics` - Aggregated campaign metrics

**API Methods:**
- `getRealTimeMetrics(timeframe)` - Get current hour/day metrics
- `getLinkPerformance(campaignId)` - Per-link click analytics
- Campaign rates auto-calculated on each event

### ✅ 5. A/B Testing Capability

**Location:** `src/lib/services/email/ab-testing.service.ts`

- **Test types supported:**
  - Subject line variations
  - Content/template variations
  - Send time optimization
  - From name testing
- **Deterministic variant assignment** using MD5 hashing (same user always gets same variant)
- **Statistical significance testing** using z-test for proportions
- **Automatic winner selection** at 95% confidence level
- **Configurable traffic allocation** per variant
- **Primary metric selection** (open rate, click rate, conversion rate)

**Database Tables:**
- `email_tests` - Test definitions and status
- `email_test_assignments` - User-to-variant mapping

**Workflow:**
1. Create test with variants
2. Start test (status: ACTIVE)
3. Assign recipients to variants deterministically
4. Track opens/clicks/conversions per variant
5. Calculate statistical significance
6. Automatically select winner when significant
7. Complete test and apply winning variant

### ✅ 6. Personalization Variables

**Location:** `src/lib/services/email/personalization.service.ts`

**Available Variables:**
- **User:** `firstName`, `lastName`, `fullName`, `email`
- **Account:** `memberSince`, `accountAge`, `lastLoginDate`
- **Creator:** `stageName`, `portfolioUrl`, `lastRoyaltyAmount`, `totalEarnings`, `activeProjects`
- **Brand:** `brandName`, `companyName`, `activeLicenses`
- **Dynamic:** `recentActivity`, `upcomingDeadlines`

**Features:**
- Variable catalog stored in database
- Type-safe variable resolution
- Fallback values for missing data
- Template string replacement with `{{variableName}}` syntax
- User type-specific variables (creator vs brand)

**Database Table:**
- `email_personalization_variables` - Variable catalog with metadata

### ✅ 7. Email Scheduling

**Location:** `src/lib/services/email/scheduling.service.ts`

- **One-time scheduled sends** with precise datetime
- **Recurring emails** (daily, weekly, monthly)
- **Send time optimization** based on recipient engagement history
- **Timezone-aware scheduling**
- **Frequency capping** (max 3 marketing emails/day per user)
- **Automatic retry** on failure (3 attempts with exponential backoff)
- **Recurring email chains** automatically scheduled

**Database Table:**
- `scheduled_emails` - Scheduled send queue

**BullMQ Integration:**
- Queue: `scheduled-emails`
- Worker: Processes scheduled sends at specified time
- Supports delayed jobs for future delivery

### ✅ 8. Domain Reputation Monitoring

Integrated into **Reputation Service** (see #1 above)

- Daily reputation checks via cron job
- Blacklist status monitoring
- SPF/DKIM/DMARC validation
- Historical reputation logging
- Multi-source reputation aggregation (ready for Google Postmaster, SNDS integration)

## Database Schema

All schema changes are in:
- `prisma/schema.prisma` - Prisma model definitions
- `prisma/migrations/20251011_resend_optimization/migration.sql` - SQL migration

### New Models

1. **EmailReputationMetrics** - Reputation scoring over time
2. **DomainReputationLog** - External reputation data
3. **EmailTest** - A/B test definitions
4. **EmailTestAssignment** - Variant assignments
5. **ScheduledEmail** - Email scheduling queue
6. **EmailPersonalizationVariable** - Variable catalog
7. **EmailCampaignAnalytics** - Aggregated campaign metrics
8. **EmailUnsubscribeLog** - Unsubscribe audit trail

### Enhanced Models

1. **EmailEvent** - Added tracking fields
2. **EmailPreferences** - Added granular unsubscribe controls
3. **User** - Added relations to new models

### New Enums

1. **EmailTestStatus** - DRAFT, ACTIVE, COMPLETED, ARCHIVED
2. **ScheduledEmailStatus** - PENDING, QUEUED, SENT, FAILED, CANCELLED

## Jobs & Cron Schedules

### Reputation Monitoring Job

**File:** `src/jobs/reputation-monitoring.job.ts`

**Schedule:** Daily at 2 AM

**Tasks:**
- Calculate reputation metrics from last 30 days of email events
- Check blacklist status
- Validate DNS authentication records
- Send alerts if thresholds exceeded

**Usage:**
```typescript
import { scheduleReputationMonitoring, checkReputationNow } from '@/jobs/reputation-monitoring.job';

// Schedule daily monitoring
await scheduleReputationMonitoring();

// Run on-demand check
await checkReputationNow('yesgoddess.com');
```

### Scheduled Email Worker

**File:** `src/lib/services/email/scheduling.service.ts`

**Queue:** `scheduled-emails`

**Processing:**
- Checks frequency caps before sending
- Sends email via EmailService
- Updates status to SENT or FAILED
- Handles retries (3 attempts)
- Schedules next recurrence if applicable

## API Usage Examples

### 1. Monitor Reputation

```typescript
import { emailReputationService } from '@/lib/services/email';

// Calculate current metrics
await emailReputationService.calculateReputationMetrics('yesgoddess.com');

// Get current score
const score = await emailReputationService.getCurrentReputationScore('yesgoddess.com');

// Check if sending should be paused
const shouldPause = await emailReputationService.shouldPauseSending('yesgoddess.com');

// Get 30-day trend
const trend = await emailReputationService.getReputationTrend('yesgoddess.com', 30);
```

### 2. Track Email Events

```typescript
import { emailTrackingService } from '@/lib/services/email';

// Get real-time metrics
const hourlyMetrics = await emailTrackingService.getRealTimeMetrics('hour');
const dailyMetrics = await emailTrackingService.getRealTimeMetrics('day');

// Get link performance
const links = await emailTrackingService.getLinkPerformance('campaign-123');
```

### 3. Manage Unsubscribes

```typescript
import { unsubscribeService } from '@/lib/services/email';

// Generate unsubscribe token
const token = await unsubscribeService.generateUnsubscribeToken(userId);

// Process one-click unsubscribe
await unsubscribeService.processUnsubscribe({
  userId,
  email: 'user@example.com',
  global: false,
  categories: ['newsletters'],
  source: 'one_click',
});

// Check if user should receive email
const { allowed, reason } = await unsubscribeService.shouldReceiveEmail(userId, 'newsletters');

// Get unsubscribe analytics
const analytics = await unsubscribeService.getUnsubscribeAnalytics(30);
```

### 4. Schedule Emails

```typescript
import { emailSchedulingService } from '@/lib/services/email';

// Schedule one-time email
const scheduleId = await emailSchedulingService.scheduleEmail({
  emailType: 'campaign',
  recipientUserId: userId,
  recipientEmail: 'user@example.com',
  templateId: 'monthly-newsletter',
  subject: 'Your Monthly Update',
  personalizationData: { name: 'John' },
  scheduledSendTime: new Date('2025-10-15T10:00:00Z'),
  optimizeSendTime: true, // Use recipient's optimal time
});

// Schedule recurring email
await emailSchedulingService.scheduleEmail({
  emailType: 'digest',
  recipientUserId: userId,
  recipientEmail: 'user@example.com',
  templateId: 'weekly-digest',
  subject: 'Your Weekly Digest',
  scheduledSendTime: new Date('2025-10-14T09:00:00Z'),
  recurrencePattern: 'weekly',
});

// Cancel scheduled email
await emailSchedulingService.cancelScheduledEmail(scheduleId);
```

### 5. Run A/B Tests

```typescript
import { abTestingService } from '@/lib/services/email';

// Create A/B test
const testId = await abTestingService.createTest({
  name: 'Subject Line Test - October Campaign',
  testType: 'subject_line',
  variants: [
    { id: 'a', name: 'Control', changes: { subject: 'Your October Update' } },
    { id: 'b', name: 'Variant B', changes: { subject: 'Don\'t Miss This!' } },
  ],
  allocationPercentage: { a: 50, b: 50 },
  primaryMetric: 'open_rate',
});

// Start test
await abTestingService.startTest(testId);

// Assign recipient to variant
const variantId = await abTestingService.assignVariant(testId, 'user@example.com', userId);

// Get variant config for email send
const config = await abTestingService.getVariantConfig(testId, 'user@example.com');

// Calculate results
const results = await abTestingService.calculateResults(testId);

// Complete test when done
await abTestingService.completeTest(testId);
```

### 6. Personalize Emails

```typescript
import { personalizationService } from '@/lib/services/email';

// Resolve all variables for user
const data = await personalizationService.resolveVariables(userId);

// Replace variables in template
const template = 'Hello {{firstName}}, your last royalty was {{lastRoyaltyAmount}}';
const personalized = personalizationService.replaceVariables(template, data);

// Catalog available variables (run once on deployment)
await personalizationService.catalogVariables();

// Get available variables for creator
const creatorVars = await personalizationService.getAvailableVariables('creator');
```

## Environment Variables

Add to `.env`:

```env
# Existing
RESEND_API_KEY=re_...
RESEND_SENDER_EMAIL=no-reply@yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_...

# New
RESEND_SENDER_DOMAIN=yesgoddess.com
```

## Deployment Checklist

### 1. Database Migration

```bash
npm run db:generate
npm run db:migrate
```

### 2. Seed Personalization Variables

```typescript
import { personalizationService } from '@/lib/services/email';
await personalizationService.catalogVariables();
```

### 3. Start Background Jobs

```typescript
import { scheduleReputationMonitoring } from '@/jobs/reputation-monitoring.job';
await scheduleReputationMonitoring();
```

### 4. Configure Resend Webhooks

In Resend dashboard, add webhook URL:
```
https://api.yesgoddess.com/api/webhooks/resend
```

Enable events:
- email.sent
- email.delivered
- email.opened
- email.clicked
- email.bounced
- email.complained

### 5. Enable Tracking in Resend

Ensure in Resend API calls:
```typescript
{
  trackOpens: true,
  trackClicks: true
}
```

## Testing

### Manual Testing

1. **Reputation Monitoring:**
   ```typescript
   import { checkReputationNow } from '@/jobs/reputation-monitoring.job';
   await checkReputationNow('yesgoddess.com');
   ```

2. **Email Tracking:**
   - Send test email
   - Open email in different clients
   - Click links
   - Check `email_events` table for tracking data

3. **Unsubscribe:**
   - Generate token for test user
   - Visit unsubscribe URL
   - Verify preferences updated
   - Check `email_unsubscribe_log`

4. **Scheduling:**
   - Schedule email 2 minutes in future
   - Wait for BullMQ worker to process
   - Verify email sent

5. **A/B Testing:**
   - Create test with 2 variants
   - Assign 10 test users
   - Send emails with variant configs
   - Track opens/clicks
   - Calculate results

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Reputation Score:** Should stay above 70
2. **Bounce Rate:** Should stay below 2%
3. **Complaint Rate:** Should stay below 0.1%
4. **Open Rate:** Benchmark is 15-25%
5. **Click Rate:** Benchmark is 2-5%
6. **Unsubscribe Rate:** Should stay below 0.5%

### Alert Channels

Reputation alerts are sent via:
- In-app notifications (to ADMIN users)
- Can extend to email/Slack in production

### Dashboard Queries

Real-time metrics available via:
```typescript
const metrics = await emailTrackingService.getRealTimeMetrics('hour');
```

Aggregated campaign analytics in `email_campaign_analytics` table.

## Performance Considerations

1. **Redis Caching:** Real-time metrics cached for 1 hour
2. **Database Indexes:** Added on all frequently queried fields
3. **Batch Processing:** Campaign analytics updated incrementally
4. **BullMQ Concurrency:** 
   - Scheduled emails: 10 concurrent
   - Reputation monitoring: 1 (sequential)

## Security & Compliance

1. **Unsubscribe Token:** SHA-256 hashed before storage
2. **Audit Trail:** All unsubscribe actions logged with IP/User Agent
3. **Data Retention:** Audit logs retained indefinitely for compliance
4. **Privacy:** Geographic data optional and anonymized
5. **Consent:** Unsubscribe honored immediately across all systems

## Future Enhancements

1. **Reputation Sources:** Integrate Google Postmaster Tools API, Microsoft SNDS
2. **Geolocation:** Integrate MaxMind or IPStack for geographic enrichment
3. **Predictive Sending:** ML model for optimal send time prediction
4. **Content Analysis:** Spam score checking before send
5. **Advanced Segmentation:** Dynamic recipient lists based on engagement
6. **Email Builder:** Visual template editor with A/B test support

## Support

For questions or issues, contact the development team or refer to:
- Resend Documentation: https://resend.com/docs
- BullMQ Documentation: https://docs.bullmq.io/
- Prisma Documentation: https://www.prisma.io/docs
