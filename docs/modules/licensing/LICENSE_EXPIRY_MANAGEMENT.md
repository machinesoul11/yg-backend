# License Expiry Management System

## Overview

The License Expiry Management System provides comprehensive automated monitoring, notification, and processing for license expiration lifecycles. This system ensures timely communication with all stakeholders and seamless handling of grace periods and post-expiry actions.

## Architecture

### Core Components

1. **License Expiry Monitor Service** (`license-expiry-monitor.service.ts`)
   - Central service for all expiry-related operations
   - Handles multi-stage notification workflow
   - Manages grace periods and final expiry processing
   - Integrates with email, notification, and audit systems

2. **Background Jobs**
   - `license-expiry-monitor.job.ts` - Daily comprehensive expiry monitoring (runs at 09:00 UTC)
   - `license-auto-expiry.job.ts` - Hourly grace period and final expiry processing

3. **Email Templates**
   - `LicenseExpiry90DayNotice.tsx` - Initial informational notice
   - `LicenseExpiry60DayNotice.tsx` - Mid-stage reminder
   - `LicenseExpiry30DayNotice.tsx` - Urgent final notice / expiry confirmation

## Database Schema

### New Fields on `licenses` Table

```prisma
ninety_day_notice_sent_at  DateTime?  // Timestamp when 90-day notice was sent
sixty_day_notice_sent_at   DateTime?  // Timestamp when 60-day notice was sent
thirty_day_notice_sent_at  DateTime?  // Timestamp when 30-day notice was sent
grace_period_end_date      DateTime?  // End date of grace period if applicable
expired_at                 DateTime?  // Actual timestamp when license was marked as expired
grace_period_days          Int        // Number of grace period days (default 0)
```

### Indexes

- `idx_licenses_end_date_status` - Efficient querying of licenses by end date and status
- `idx_licenses_grace_period` - Quick access to licenses in grace period

## Notification Workflow

### Stage 1: 90-Day Advance Notice
- **Timing**: 90 days before expiry (±1 day buffer window)
- **Recipients**: Brand primary contact + all IP asset creators
- **Tone**: Informational
- **Actions**:
  - Send branded email notification
  - Update `ninety_day_notice_sent_at` timestamp
  - Log event for analytics

### Stage 2: 60-Day Reminder
- **Timing**: 60 days before expiry (±1 day buffer window)
- **Recipients**: Brand primary contact + all IP asset creators
- **Tone**: Reminder
- **Actions**:
  - Send reminder email with increased urgency
  - Update `sixty_day_notice_sent_at` timestamp
  - Log event for analytics

### Stage 3: 30-Day Final Notice
- **Timing**: 30 days before expiry (±1 day buffer window)
- **Recipients**: Brand primary contact + all IP asset creators
- **Tone**: Urgent
- **Actions**:
  - Send urgent email notification
  - Create in-app HIGH priority notifications
  - Update `thirty_day_notice_sent_at` timestamp
  - Log event for analytics

### Stage 4: Expiry Processing
- **Timing**: When `end_date` is reached
- **Process**:
  1. Check for configured grace period
  2. If grace period > 0:
     - Set `grace_period_end_date`
     - Maintain license as functionally active
     - Send grace period notification
  3. If no grace period:
     - Update status to `EXPIRED`
     - Set `expired_at` timestamp
     - Send expiry confirmation
     - Execute post-expiry actions

### Stage 5: Grace Period Completion
- **Timing**: When `grace_period_end_date` is reached
- **Actions**:
  - Update status to `EXPIRED`
  - Set `expired_at` timestamp
  - Send final expiry confirmation
  - Execute post-expiry actions

## Grace Period Handling

### Configuration
- Default grace period: 7 days (configurable per license via `grace_period_days` field)
- Grace periods can be:
  - Disabled (set to 0)
  - Custom per license type or agreement
  - Applied automatically on expiry

### Grace Period Behavior
- License remains functionally active during grace period
- Royalty payments continue
- Brand can still use the asset
- Additional notifications sent about grace period status
- Auto-renewal can still be processed during grace period

## Post-Expiry Actions

When a license fully expires (after grace period if applicable):

1. **Status Update**
   - License status → `EXPIRED`
   - Record `expired_at` timestamp

2. **Stakeholder Notifications**
   - Send expiry confirmation emails to brand and creators
   - Create in-app notifications

3. **Project Status Update**
   - Check if all licenses in associated project are expired
   - If yes, mark project as `COMPLETED`

4. **Re-engagement Scheduling**
   - Schedule re-engagement email for 30 days post-expiry
   - Subtly invite brand to relicense without being pushy

5. **Audit Trail**
   - Log expiry event to `events` table
   - Create audit entry with full context

## Email Templates

All email templates follow YES GODDESS brand guidelines:

### Design Principles
- Monastic, minimalist aesthetic
- VOID (#0A0A0A), BONE (#F8F6F3), SANCTUM (#C4C0B8), ALTAR (#B8A888) color palette
- Extended letter tracking
- Authoritative yet invitational tone
- No urgency tactics or aggressive language

### Template Features
- Fully responsive
- Role-aware content (brand vs creator)
- Auto-renewal status display
- Clear CTAs to renewal workflows
- Grace period state handling
- Expired state handling

## Integration Points

### Email Service
- Uses transactional email infrastructure
- Respects user email preferences
- Handles delivery failures gracefully
- Logs all sending attempts

### Notification Service
- Creates in-app notifications for 30-day notices
- HIGH priority for urgent notices
- Includes deep links to license details

### Audit Service
- Comprehensive logging of all expiry events
- Tracks notification sends, state changes, and actions taken
- Maintains compliance trail

### Event System
- Records all expiry-related events for analytics
- Enables business intelligence reporting
- Supports dashboard visualization

## Job Scheduling

### Daily Expiry Monitor Job
- **Schedule**: Daily at 09:00 UTC
- **Duration**: ~2-5 minutes (depends on license count)
- **Stages**:
  1. 90-day notice scan and send
  2. 60-day notice scan and send
  3. 30-day notice scan and send
  4. Initial expiry processing (with grace period application)
  5. Grace period completion processing

### Hourly Auto-Expiry Job
- **Schedule**: Every hour
- **Duration**: ~30-60 seconds
- **Purpose**: Catch any licenses that need immediate expiry processing
- **Actions**:
  - Process grace period completions
  - Handle edge cases missed by daily job

## Error Handling

### Notification Failures
- Individual notification failures don't block batch processing
- Errors logged with license ID and details
- System continues processing remaining licenses
- Failed notifications can be retried manually

### Database Failures
- Critical operations wrapped in transactions
- Timestamp updates only occur after successful notification
- Prevents duplicate notifications on retry

### Monitoring
- Job completion events logged
- Error counts tracked
- Alerts triggered on excessive failures (>10% failure rate)

## Configuration

### Environment Variables
- `NEXT_PUBLIC_APP_URL` - Base URL for license deep links
- `DEFAULT_GRACE_PERIOD_DAYS` - System-wide default (currently 7)

### License-Specific Configuration
- `grace_period_days` field on license record
- Can be set during license creation or updated later
- Overrides system default when set

## Testing

### Manual Testing
To manually trigger expiry processing:
1. Use admin API endpoint (requires admin authentication)
2. POST to `/api/admin/licenses/trigger-expiry-check`
3. Review job output and logs

### Test Scenarios
- License expiring in 90 days (±1 day)
- License expiring in 60 days (±1 day)
- License expiring in 30 days (±1 day)
- License past end date with grace period
- License past end date without grace period
- License past grace period end date
- Multiple licenses expiring simultaneously
- Notification delivery failures
- Auto-renewal enabled licenses

## Analytics & Reporting

### Metrics Tracked
- Notification send rates by stage
- Grace period utilization
- Time from first notice to renewal/expiry
- Brand response patterns
- Creator engagement with expiry notices

### Events Logged
- `license.expiry_notification_sent` - Each notification sent
- `license.grace_period_started` - Grace period initiated
- `license.expired` - License fully expired
- `license.expiry_monitor_completed` - Daily job completion
- `license.auto_expiry_completed` - Hourly job completion

## Future Enhancements

### Planned Features
1. **Configurable Notification Schedules**
   - Allow brands to customize notification timing
   - Support for additional notification stages

2. **Smart Notification Optimization**
   - Machine learning-based send time optimization
   - Predictive renewal likelihood scoring

3. **Bulk Expiry Management**
   - Admin interface for bulk grace period adjustments
   - Batch expiry processing for emergency situations

4. **Enhanced Re-engagement**
   - Personalized relicensing offers
   - Dynamic pricing based on previous license performance

5. **Integration with CRM Systems**
   - Sync expiry data to external CRM
   - Support for custom notification channels (Slack, SMS, etc.)

## Troubleshooting

### Common Issues

**Issue**: Notifications not sent at expected time
- **Cause**: Job scheduling delay or time zone issues
- **Solution**: Check job execution logs, verify cron schedule

**Issue**: Duplicate notifications sent
- **Cause**: Timestamp not updated after send
- **Solution**: Check for database transaction failures, review error logs

**Issue**: License not expiring after end date
- **Cause**: Grace period applied or job not running
- **Solution**: Check `grace_period_end_date` field, verify hourly job execution

**Issue**: Wrong notification template used
- **Cause**: Template mapping error
- **Solution**: Verify template registry, check service template selection logic

### Support Contacts
- Technical Issues: engineering@yesgoddess.com
- License Operations: operations@yesgoddess.com
- Emergency Escalation: Use Slack #ops-alerts channel

## Compliance & Legal

### Data Retention
- Expiry notifications retained for 7 years
- Audit trail maintained indefinitely
- Event logs aggregated monthly

### Privacy Considerations
- Only necessary stakeholders notified
- Email preferences respected
- No external third-party notifications

### Terms of Service Alignment
- Expiry process follows license agreement terms
- Grace periods documented in agreement
- Post-expiry rights clearly communicated

## Changelog

### Version 1.0.0 (October 2025)
- Initial implementation
- Multi-stage notification workflow (90/60/30 days)
- Grace period handling
- Post-expiry actions
- Brand-aligned email templates
- Comprehensive audit logging
- Background job orchestration
