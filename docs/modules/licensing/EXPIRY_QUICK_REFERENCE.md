# License Expiry Management - Quick Reference

## For Developers

### Import the Service
```typescript
import { licenseExpiryMonitorService } from '@/modules/licenses';
```

### Find Licenses Needing Notifications
```typescript
// 90-day notices
const licenses90 = await licenseExpiryMonitorService.findLicensesNeedingNinetyDayNotice();

// 60-day notices
const licenses60 = await licenseExpiryMonitorService.findLicensesNeedingSixtyDayNotice();

// 30-day notices
const licenses30 = await licenseExpiryMonitorService.findLicensesNeedingThirtyDayNotice();
```

### Send Notifications
```typescript
// Send 90-day notice
await licenseExpiryMonitorService.sendNinetyDayNotice(license);

// Send 60-day notice
await licenseExpiryMonitorService.sendSixtyDayNotice(license);

// Send 30-day notice (includes in-app notification)
await licenseExpiryMonitorService.sendThirtyDayNotice(license);
```

### Process Expiries
```typescript
// Find licenses needing expiry processing
const expiredLicenses = await licenseExpiryMonitorService.findLicensesNeedingExpiry();

// Process with grace period handling
for (const license of expiredLicenses) {
  await licenseExpiryMonitorService.processExpiredLicense(license);
}

// Find licenses with expired grace periods
const gracePeriodExpired = await licenseExpiryMonitorService.findLicensesWithExpiredGracePeriod();

// Finalize expiry
for (const license of gracePeriodExpired) {
  await licenseExpiryMonitorService.expireLicense(license);
}
```

### Set Grace Period for License
```typescript
await prisma.license.update({
  where: { id: licenseId },
  data: {
    gracePeriodDays: 14, // 14-day grace period
  },
});
```

### Check Notification Status
```typescript
const license = await prisma.license.findUnique({
  where: { id: licenseId },
  select: {
    ninetyDayNoticeSentAt: true,
    sixtyDayNoticeSentAt: true,
    thirtyDayNoticeSentAt: true,
    gracePeriodEndDate: true,
    expiredAt: true,
  },
});

if (license.ninetyDayNoticeSentAt) {
  console.log('90-day notice sent:', license.ninetyDayNoticeSentAt);
}
```

## For Operations Team

### Manual Expiry Check Trigger
```bash
# Use admin API (requires authentication)
POST /api/admin/licenses/trigger-expiry-check
```

### View Upcoming Expiries
```sql
-- Licenses expiring in next 90 days
SELECT id, end_date, brand_id, status
FROM licenses
WHERE status IN ('ACTIVE', 'EXPIRING_SOON')
  AND end_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
  AND deleted_at IS NULL
ORDER BY end_date ASC;
```

### Check Grace Period Status
```sql
-- Licenses currently in grace period
SELECT id, end_date, grace_period_end_date, grace_period_days
FROM licenses
WHERE grace_period_end_date IS NOT NULL
  AND grace_period_end_date > NOW()
  AND status = 'EXPIRING_SOON';
```

### View Notification History
```sql
-- Check which notices have been sent
SELECT 
  id,
  end_date,
  ninety_day_notice_sent_at,
  sixty_day_notice_sent_at,
  thirty_day_notice_sent_at
FROM licenses
WHERE end_date > NOW()
ORDER BY end_date ASC;
```

## Email Template Names

For use with email service:
- `license-expiry-90-day` - Initial 90-day notice
- `license-expiry-60-day` - 60-day reminder  
- `license-expiry-30-day` - 30-day urgent notice / expiry confirmation

## Database Fields Reference

| Field | Type | Purpose |
|-------|------|---------|
| `ninety_day_notice_sent_at` | DateTime? | When 90-day notice was sent |
| `sixty_day_notice_sent_at` | DateTime? | When 60-day notice was sent |
| `thirty_day_notice_sent_at` | DateTime? | When 30-day notice was sent |
| `grace_period_end_date` | DateTime? | When grace period ends |
| `grace_period_days` | Int | Grace period length (0 = none) |
| `expired_at` | DateTime? | When license was marked expired |

## Event Types

- `license.expiry_notification_sent` - Notification sent at any stage
- `license.grace_period_started` - Grace period initiated
- `license.expired` - License fully expired
- `license.expiry_monitor_completed` - Daily monitoring job completed
- `license.auto_expiry_completed` - Hourly auto-expiry job completed

## Common Tasks

### Extend Grace Period for Single License
```typescript
await prisma.license.update({
  where: { id: licenseId },
  data: {
    gracePeriodEndDate: addDays(new Date(), 14),
  },
});
```

### Manually Expire License (Emergency)
```typescript
await licenseExpiryMonitorService.expireLicense(license);
```

### Reset Notification Status (Testing)
```typescript
await prisma.license.update({
  where: { id: licenseId },
  data: {
    ninetyDayNoticeSentAt: null,
    sixtyDayNoticeSentAt: null,
    thirtyDayNoticeSentAt: null,
  },
});
```

### Check Job Execution Status
```sql
-- Recent expiry monitor job runs
SELECT *
FROM events
WHERE event_type = 'license.expiry_monitor_completed'
ORDER BY occurred_at DESC
LIMIT 10;
```

## Monitoring Queries

### Licenses Expiring This Month
```sql
SELECT COUNT(*) as expiring_count
FROM licenses
WHERE status IN ('ACTIVE', 'EXPIRING_SOON')
  AND end_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
  AND deleted_at IS NULL;
```

### Notification Success Rate
```sql
SELECT 
  DATE(occurred_at) as date,
  COUNT(*) as notifications_sent,
  SUM(CASE WHEN (props_json->>'success')::boolean THEN 1 ELSE 0 END) as successful
FROM events
WHERE event_type = 'license.expiry_notification_sent'
  AND occurred_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(occurred_at)
ORDER BY date DESC;
```

### Grace Period Utilization
```sql
SELECT 
  grace_period_days,
  COUNT(*) as license_count
FROM licenses
WHERE grace_period_end_date IS NOT NULL
GROUP BY grace_period_days
ORDER BY grace_period_days;
```

## Testing Checklist

- [ ] Create test license expiring in 90 days
- [ ] Verify 90-day notice sent
- [ ] Verify `ninety_day_notice_sent_at` updated
- [ ] Move date forward 30 days
- [ ] Verify 60-day notice sent
- [ ] Move date forward 30 days
- [ ] Verify 30-day notice sent
- [ ] Verify in-app notification created
- [ ] Move date past end date
- [ ] Verify grace period applied (if configured)
- [ ] Move date past grace period
- [ ] Verify license marked as EXPIRED
- [ ] Verify `expired_at` timestamp set
- [ ] Verify expiry confirmation emails sent
- [ ] Verify re-engagement email scheduled

## Troubleshooting Commands

### Force regenerate Prisma client
```bash
npx prisma generate
```

### Run migration manually
```bash
npx prisma migrate dev
```

### Check job logs
```bash
# View recent job execution in application logs
grep "license.*expiry" logs/app.log | tail -50
```

### Test email template rendering
```bash
npm run email:preview license-expiry-90-day
```
