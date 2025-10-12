# Email Campaigns System - Implementation Summary

## Overview

The email campaigns system has been fully implemented for the YES GODDESS platform, providing comprehensive campaign management, audience segmentation, preference center, and GDPR compliance features.

## Database Schema

### New Tables Added

1. **`email_campaigns`** - Stores campaign configuration and aggregate statistics
   - Campaign metadata (name, description, subject, template)
   - Segmentation criteria (JSONB)
   - Scheduling information (timezone-aware)
   - Rate limiting configuration
   - Real-time tracking stats (sent, delivered, opened, clicked, bounced, etc.)
   
2. **`campaign_recipients`** - Junction table for campaign sends
   - Individual recipient tracking
   - Send status lifecycle
   - Personalization data per recipient
   - Event timestamps (sent, delivered, opened, clicked, etc.)
   - Error tracking and retry counts

3. **`saved_email_segments`** - Reusable audience definitions
   - Named segment criteria
   - Estimated size caching
   - Access control (creator, public/private)

4. **`email_campaign_clicks`** - Detailed click tracking
   - URL-level click tracking
   - Device/browser information
   - Geographic data
   - User agent parsing

5. **`email_campaign_reports`** - Pre-computed analytics
   - Aggregated metrics
   - Device/geographic breakdowns
   - Hourly send patterns
   - Link performance stats

### Enhanced Existing Tables

- **`email_preferences`** - Added fields:
  - `unsubscribeToken` - Secure token for one-click unsubscribe
  - `preferenceCenterLastVisited` - Tracking
  - `categoryPreferences` - JSONB for extensible preferences
  - `globalUnsubscribe` - Master opt-out flag

- **`email_unsubscribe_log`** - Already exists, enhanced usage for:
  - Campaign-specific unsubscribes
  - Category-level opt-outs
  - GDPR audit trail

### New Enums

- `EmailCampaignStatus`: DRAFT, SCHEDULED, SENDING, COMPLETED, CANCELLED, FAILED
- `CampaignRecipientStatus`: PENDING, QUEUED, SENT, DELIVERED, OPENED, CLICKED, BOUNCED, FAILED, UNSUBSCRIBED, COMPLAINED

## Services Implemented

### 1. CampaignService (`src/lib/services/email/campaign.service.ts`)

**Campaign Management:**
- `createCampaign()` - Create draft campaigns with audience segmentation
- `updateCampaign()` - Edit campaigns (only in DRAFT/SCHEDULED status)
- `scheduleCampaign()` - Validate and queue for sending
- `cancelCampaign()` - Cancel scheduled/sending campaigns
- `sendTestEmail()` - Send test emails before scheduling
- `getCampaignAnalytics()` - Real-time campaign performance metrics

**Audience Segmentation:**
- Role-based filtering (CREATOR, BRAND, VIEWER, ADMIN)
- Verification status filtering
- Date range filtering (created, last login)
- Creator specialty matching
- Brand industry matching
- Custom JSONB criteria (extensible)
- Automatic email preference and suppression list filtering

**Validation:**
- Template existence checks
- Scheduled time validation (must be future, max 1 year out)
- Recipient count requirements
- Rate limit compliance
- Pre-send comprehensive validation

### 2. PreferenceCenterService (`src/lib/services/email/preference-center.service.ts`)

**Preference Management:**
- `getPreferences()` - Fetch user preferences with defaults
- `updatePreferences()` - Update individual or category preferences
- `generateUnsubscribeToken()` - Cryptographically secure tokens for email links
- `verifyUnsubscribeToken()` - Validate tokens from unsubscribe links

**Unsubscribe Handling:**
- `globalUnsubscribe()` - One-click unsubscribe from all emails
- `categoryUnsubscribe()` - Unsubscribe from specific categories
- `resubscribe()` - Opt back in

**GDPR Compliance:**
- `exportUserEmailData()` - Export all email-related user data (JSON + metadata)
- `deleteUserEmailData()` - Right to be forgotten (anonymize/delete)
- Audit logging for all preference changes
- Automatic suppression list management

### 3. CampaignEventTracker (`src/lib/services/email/campaign-tracker.service.ts`)

**Event Processing:**
- `trackEvent()` - Process webhooks from email provider (Resend)
- Handles: delivered, opened, clicked, bounced, complained, unsubscribed
- Updates recipient records in real-time
- Increments campaign aggregate counts
- Prevents duplicate open/click counting

**Analytics Generation:**
- `generateReport()` - Pre-compute campaign reports
- Hourly send breakdown
- Device/browser breakdown
- Link click-through rates
- Geographic data aggregation

## Background Jobs

### CampaignWorker (`src/jobs/email-campaign-worker.job.ts`)

**Sending Logic:**
- Fetches pending recipients for scheduled campaigns
- Processes in configurable batches
- Respects rate limits (messages per hour)
- Calculates optimal delay between batches
- Updates recipient status (PENDING → QUEUED → SENT/FAILED)
- Real-time progress tracking
- Error handling with retry counts
- Automatic campaign status management (SENDING → COMPLETED/FAILED)

**Rate Limiting:**
- Configurable messages per hour (default: 1000)
- Configurable batch size (default: 100)
- Automatic calculation of inter-batch delay
- Respects platform and provider limits

**Fault Tolerance:**
- Per-recipient error tracking
- Campaign-level failure handling
- Job retry with BullMQ
- Detailed logging for debugging

## API Endpoints (tRPC Router)

### Admin Endpoints (require ADMIN role)

**Campaign Management:**
- `emailCampaigns.create` - Create new campaign
- `emailCampaigns.update` - Update existing campaign
- `emailCampaigns.schedule` - Schedule for sending
- `emailCampaigns.cancel` - Cancel campaign
- `emailCampaigns.sendTest` - Send test emails

**Queries:**
- `emailCampaigns.get` - Get campaign details
- `emailCampaigns.list` - List campaigns with filters (status, pagination)
- `emailCampaigns.analytics` - Get campaign analytics
- `emailCampaigns.recipients` - List recipients with status

### User-Facing Endpoints (require authentication)

**Preference Center:**
- `emailCampaigns.getMyPreferences` - Get current preferences
- `emailCampaigns.updateMyPreferences` - Update preferences
- `emailCampaigns.generateUnsubscribeToken` - Generate token for URLs
- `emailCampaigns.verifyUnsubscribeToken` - Validate token
- `emailCampaigns.unsubscribe` - Global unsubscribe
- `emailCampaigns.resubscribe` - Opt back in

**GDPR Compliance:**
- `emailCampaigns.exportMyEmailData` - Export all email data
- `emailCampaigns.deleteMyEmailData` - Delete/anonymize data

## Validation Schemas

Located in `src/lib/validators/email.validators.ts`:

- `segmentCriteriaSchema` - Audience targeting criteria
- `createCampaignSchema` - Campaign creation validation
- `updateCampaignSchema` - Campaign update validation
- `sendTestEmailSchema` - Test email validation
- `cancelCampaignSchema` - Cancellation validation
- `updateEmailPreferencesSchema` - Preference updates
- `unsubscribeSchema` - Unsubscribe request validation

## Redis Infrastructure

New centralized Redis configuration at `src/lib/db/redis.ts`:

- **`redis`** - General purpose client for caching
- **`redisConnection`** - Dedicated BullMQ connection
- **`rateLimiter()`** - Sliding window rate limiting utility

Maintained backward compatibility via `src/lib/redis.ts` re-exports.

## Integration Points

### 1. Email Service Integration

Campaigns use existing `EmailService` for actual email sending:
- Automatic suppression list checking
- Email preference validation
- Template rendering with React Email
- Event tracking integration

### 2. Webhook Processing

Email provider webhooks (Resend) trigger:
- `CampaignEventTracker.trackEvent()` for campaign emails
- `EmailService.handleEmailEvent()` for transactional emails
- Real-time stat updates
- Recipient status transitions

### 3. Notification System

Campaign events can trigger platform notifications:
- Campaign completed notifications for admins
- Campaign performance alerts
- Integration with existing notification system (Phase 7.5)

### 4. Analytics System

Campaign data feeds into platform analytics:
- Email engagement metrics
- Campaign ROI tracking
- User behavior insights
- Segmentation effectiveness

## GDPR Compliance Features

### Consent Management

- Double opt-in support (existing verification system)
- Granular category preferences
- Audit trail of all consent changes
- Consent version tracking

### User Rights

1. **Right to Access** - Full data export in machine-readable format
2. **Right to Portability** - Structured JSON export
3. **Right to Erasure** - Anonymization while preserving analytics
4. **Right to Object** - Category-specific and global opt-out
5. **Right to Rectification** - Preference updates

### Audit Requirements

- All preference changes logged to `audit_events`
- Unsubscribe events logged to `email_unsubscribe_log`
- Immutable records with timestamps, IP, user agent
- Campaign send records preserved for compliance period

## Migration Guide

### Prerequisites

1. Ensure Prisma is at version 6.17.1+
2. Ensure PostgreSQL has JSONB support
3. Ensure Redis is running and accessible
4. Ensure BullMQ workers are configured

### Steps

1. **Apply Prisma migration:**
   ```bash
   npx prisma migrate dev --name add_email_campaigns
   ```

2. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

3. **Start campaign worker:**
   ```bash
   # In production, run as separate process
   node -r tsx/register src/jobs/email-campaign-worker.job.ts
   ```

4. **Update environment variables:**
   ```env
   # Existing
   REDIS_URL=redis://...
   RESEND_API_KEY=re_...
   
   # Optional overrides
   DEFAULT_MESSAGES_PER_HOUR=1000
   DEFAULT_BATCH_SIZE=100
   ```

5. **Verify integration:**
   - Create test campaign via admin panel
   - Send test emails
   - Check recipient records
   - Validate webhook processing

## Performance Considerations

### Caching Strategy

- Email preferences cached for 1 hour
- Suppression list cached for 24 hours
- Campaign stats updated in real-time
- Reports pre-computed and cached

### Database Optimization

- Indexed fields: campaignId, userId, email, status, timestamps
- JSONB indexes for segmentation criteria
- Composite indexes for common queries
- Recipient records batched for inserts

### Queue Management

- Single campaign concurrency (prevents resource contention)
- Configurable worker instances for horizontal scaling
- Job retention policies (24h complete, 7d failed)
- Priority queue support for urgent campaigns

## Security

### Authentication & Authorization

- All admin endpoints require ADMIN role
- User endpoints require authentication
- Unsubscribe tokens cryptographically signed (SHA-256)
- Token expiration not implemented (one-time use, no expiry needed)

### Data Protection

- Email addresses never exposed in URLs
- Personalization data stored encrypted (JSONB)
- Audit logs for compliance
- Rate limiting prevents abuse

### Email Security

- Suppression list checked before every send
- Bounce/complaint automatic suppression
- Sender domain verification required
- List-Unsubscribe headers (RFC 8058 compliance)

## Testing

### Unit Tests

Create tests for:
- `CampaignService` - Segmentation logic
- `PreferenceCenterService` - Token generation/validation
- `CampaignEventTracker` - Event processing
- Validators - Schema validation

### Integration Tests

- End-to-end campaign creation
- Email sending with test recipients
- Webhook event processing
- Preference center flows

### Load Testing

- Concurrent campaign sends
- Rate limiting under load
- Database performance with large recipient lists
- Redis cache performance

## Monitoring & Alerts

### Metrics to Track

- Campaign send rates
- Delivery rates (should be >95%)
- Bounce rates (should be <5%)
- Open rates (industry benchmarks)
- Click-through rates
- Unsubscribe rates

### Alerts to Configure

- Campaign failures
- Abnormal bounce rates
- High unsubscribe rates
- Email provider API errors
- Queue backlog growth
- Redis connection failures

## Future Enhancements

### Planned Features

1. **A/B Testing:**
   - Subject line testing
   - Content variation testing
   - Send time optimization
   - Statistical significance calculation

2. **Advanced Segmentation:**
   - Behavioral triggers
   - Purchase history
   - Engagement scoring
   - Predictive send time

3. **Template Management:**
   - Visual template builder
   - Template versioning
   - A/B test variants
   - Dynamic content blocks

4. **Automation:**
   - Drip campaigns
   - Welcome series
   - Re-engagement campaigns
   - Abandoned cart (if applicable)

5. **Enhanced Analytics:**
   - Cohort analysis
   - Revenue attribution
   - Geographic heat maps
   - Device-specific optimization

## Documentation References

- **Brand Guidelines:** `/docs/brand/guidelines.md`
- **Email Templates:** `/emails/README.md`
- **Email Service:** Existing implementation in Phase 5
- **Notification System:** Phase 7.5
- **Analytics System:** Phase 15.5
- **Development Roadmap:** Root level roadmap document

## Support & Troubleshooting

### Common Issues

1. **Campaign not sending:**
   - Check worker is running
   - Verify campaign status is SCHEDULED
   - Check Redis connection
   - Review job queue

2. **Low delivery rates:**
   - Verify sender domain authentication
   - Check suppression list size
   - Review bounce reasons
   - Validate email quality

3. **Missing analytics:**
   - Verify webhook configuration
   - Check event tracker processing
   - Review Redis cache status
   - Validate messageId mapping

### Debug Commands

```bash
# Check campaign queue
redis-cli LLEN bull:email-campaigns:waiting

# View campaign stats
psql -c "SELECT status, COUNT(*) FROM email_campaigns GROUP BY status;"

# Check recipient status
psql -c "SELECT status, COUNT(*) FROM campaign_recipients WHERE campaign_id='xxx' GROUP BY status;"

# Monitor worker
pm2 logs campaign-worker
```

## Completion Checklist

✅ Database schema design and migration
✅ Campaign creation interface (API)
✅ Recipient segmentation engine
✅ Send scheduling with rate limiting
✅ Campaign analytics service
✅ Unsubscribe management
✅ Email preference center (API)
✅ GDPR compliance features
✅ Background job worker
✅ Event tracking integration
✅ tRPC router implementation
✅ Validation schemas
✅ Error handling
✅ Audit logging
✅ Documentation

All features from the roadmap have been implemented and are ready for database migration and testing.
