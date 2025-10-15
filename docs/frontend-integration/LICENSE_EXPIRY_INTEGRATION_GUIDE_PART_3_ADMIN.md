# License Expiry Management System - Frontend Integration Guide (Part 3: Admin Operations & Advanced Features)

**Classification:** 🔒 ADMIN ONLY  
*This document covers admin-only features, manual controls, testing procedures, and troubleshooting for the license expiry management system.*

---

## Table of Contents

1. [Admin Monitoring Dashboard](#admin-monitoring-dashboard)
2. [Manual Expiry Controls](#manual-expiry-controls)
3. [Testing & QA Procedures](#testing--qa-procedures)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Analytics & Reporting](#analytics--reporting)
6. [Rate Limiting & Quotas](#rate-limiting--quotas)
7. [Operational Procedures](#operational-procedures)

---

## Admin Monitoring Dashboard

### Dashboard Metrics

**Recommended Admin Dashboard Widgets:**

#### Widget 1: Expiry Pipeline Overview

```tsx
function ExpiryPipelineWidget() {
  const { data: stats } = trpc.licenses.stats.useQuery();

  return (
    <Card>
      <CardHeader title="Expiry Pipeline" />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={4}>
            <Stat
              label="Expiring in 30 Days"
              value={stats?.expiringIn30Days || 0}
              color="error"
              icon={<WarningIcon />}
            />
          </Grid>
          <Grid item xs={4}>
            <Stat
              label="Expiring in 60 Days"
              value={stats?.expiringIn60Days || 0}
              color="warning"
            />
          </Grid>
          <Grid item xs={4}>
            <Stat
              label="Expiring in 90 Days"
              value={stats?.expiringIn90Days || 0}
              color="info"
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
```

---

#### Widget 2: Recent Expiry Job Runs

```tsx
function ExpiryJobStatusWidget() {
  const { data: recentEvents } = trpc.events.list.useQuery({
    eventType: 'license.expiry_monitor_completed',
    limit: 10
  });

  const lastRun = recentEvents?.[0];
  const lastRunStatus = lastRun?.propsJson?.errorCount === 0 ? 'success' : 'warning';

  return (
    <Card>
      <CardHeader title="Expiry Monitor Job Status" />
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="body2" color="text.secondary">
            Last Run
          </Typography>
          <Chip
            label={lastRunStatus === 'success' ? 'Successful' : 'Errors'}
            color={lastRunStatus}
            size="small"
          />
        </Box>
        
        {lastRun && (
          <Box>
            <Typography variant="caption" display="block">
              {formatDistanceToNow(new Date(lastRun.occurredAt))} ago
            </Typography>
            <Typography variant="body2" mt={1}>
              Notifications Sent: {lastRun.propsJson.notificationsSent}
            </Typography>
            <Typography variant="body2">
              Expiries Processed: {lastRun.propsJson.expiriesProcessed}
            </Typography>
            <Typography variant="body2">
              Duration: {lastRun.propsJson.duration}ms
            </Typography>
            {lastRun.propsJson.errorCount > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {lastRun.propsJson.errorCount} error(s) encountered
              </Alert>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
```

---

#### Widget 3: Grace Period Licenses

```tsx
function GracePeriodWidget() {
  const { data: gracePeriodLicenses } = trpc.licenses.list.useQuery({
    status: 'EXPIRING_SOON',
    page: 1,
    pageSize: 50
  });

  const inGracePeriod = gracePeriodLicenses?.data.filter(license => 
    license.gracePeriodEndDate && new Date(license.gracePeriodEndDate) > new Date()
  );

  return (
    <Card>
      <CardHeader 
        title="Licenses in Grace Period" 
        subheader={`${inGracePeriod?.length || 0} active`}
      />
      <CardContent>
        <List>
          {inGracePeriod?.map(license => (
            <ListItem key={license.id}>
              <ListItemText
                primary={license.ipAsset?.title || 'License ' + license.id}
                secondary={`Grace period ends: ${formatDate(license.gracePeriodEndDate)}`}
              />
              <ListItemSecondaryAction>
                <Button size="small" href={`/admin/licenses/${license.id}`}>
                  View
                </Button>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
```

---

### Admin License List Filters

**Endpoint:** `licenses.adminList`  
**Access:** Admin only

**Enhanced Filters for Expiry Management:**

```typescript
const { data: licenses } = trpc.licenses.adminList.useQuery({
  // Standard filters
  status: 'EXPIRING_SOON',
  
  // Expiry-specific filters (add these to the API)
  gracePeriodActive: true,           // Only licenses in grace period
  notificationStage: '30_day',       // Only licenses at specific notification stage
  expiringBefore: futureDate,
  
  // Sorting
  sortBy: 'endDate',
  sortOrder: 'asc'
});
```

**Recommended Table Columns:**

| Column | Description | Sort |
|--------|-------------|------|
| License ID | Truncated CUID | - |
| IP Asset | Asset title | ✓ |
| Brand | Company name | ✓ |
| End Date | Original expiry date | ✓ |
| Days Until Expiry | Calculated | ✓ |
| Notification Stage | Last notice sent | - |
| Grace Period Status | Active/None/Ended | - |
| Auto-Renew | Yes/No badge | - |
| Actions | View / Extend / Expire | - |

---

## Manual Expiry Controls

### 1. Manual Grace Period Extension

**Use Case:** Brand requests additional time to complete renewal

**Backend Service Method:**
```typescript
// Not yet exposed via API - requires direct database update
await prisma.license.update({
  where: { id: licenseId },
  data: {
    gracePeriodEndDate: addDays(new Date(), additionalDays)
  }
});
```

**Recommended Admin UI:**

```tsx
function ExtendGracePeriodDialog({ license }: { license: License }) {
  const [additionalDays, setAdditionalDays] = useState(7);
  const extendGracePeriod = trpc.licenses.extendGracePeriod.useMutation();

  const handleExtend = async () => {
    await extendGracePeriod.mutateAsync({
      licenseId: license.id,
      additionalDays
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Extend Grace Period</DialogTitle>
      <DialogContent>
        <Typography variant="body2" gutterBottom>
          Current grace period ends: {formatDate(license.gracePeriodEndDate)}
        </Typography>
        <TextField
          label="Additional Days"
          type="number"
          value={additionalDays}
          onChange={(e) => setAdditionalDays(parseInt(e.target.value))}
          inputProps={{ min: 1, max: 30 }}
          fullWidth
          sx={{ mt: 2 }}
        />
        <Typography variant="caption" color="text.secondary">
          New end date: {formatDate(addDays(new Date(license.gracePeriodEndDate), additionalDays))}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleExtend} variant="contained">
          Extend Grace Period
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

### 2. Manual License Expiry (Emergency)

**Use Case:** Immediate license termination required

**Backend Service Method:**
```typescript
await licenseExpiryMonitorService.expireLicense(license);
```

**Recommended Admin UI:**

```tsx
function ManualExpiryDialog({ license }: { license: License }) {
  const [reason, setReason] = useState('');
  const expireLicense = trpc.licenses.manualExpiry.useMutation();

  const handleExpire = async () => {
    await expireLicense.mutateAsync({
      licenseId: license.id,
      reason,
      immediate: true
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Manually Expire License</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This will immediately expire the license and send notifications to all parties.
        </Alert>
        <TextField
          label="Reason for Manual Expiry"
          multiline
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleExpire} 
          variant="contained" 
          color="error"
          disabled={reason.length < 10}
        >
          Expire License Now
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

### 3. Reset Notification Status (Testing Only)

**Use Case:** Reset notification timestamps for testing

**⚠️ WARNING:** Only use in non-production environments

**Backend Operation:**
```typescript
await prisma.license.update({
  where: { id: licenseId },
  data: {
    ninetyDayNoticeSentAt: null,
    sixtyDayNoticeSentAt: null,
    thirtyDayNoticeSentAt: null
  }
});
```

**Admin UI:**

```tsx
function ResetNotificationsButton({ licenseId }: { licenseId: string }) {
  const resetNotifications = trpc.licenses.resetNotificationStatus.useMutation();

  const handleReset = async () => {
    if (!confirm('This will reset all notification timestamps. Continue?')) return;
    
    await resetNotifications.mutateAsync({ licenseId });
  };

  return (
    <Button 
      onClick={handleReset} 
      variant="outlined" 
      color="warning"
      startIcon={<RefreshIcon />}
    >
      Reset Notification Status
    </Button>
  );
}
```

---

### 4. Trigger Manual Expiry Check

**Use Case:** Force immediate expiry monitoring run (outside scheduled job)

**Endpoint:** `POST /api/admin/licenses/trigger-expiry-check`  
**Access:** Admin only  
**Rate Limit:** 1 request per 5 minutes

**Request:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/admin/licenses/trigger-expiry-check \
  -H "Authorization: Bearer {ADMIN_JWT}" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "jobId": "cuid_abc123",
  "notificationsSent": 12,
  "expiriesProcessed": 3,
  "duration": 4523,
  "errors": []
}
```

**Admin UI:**

```tsx
function TriggerExpiryCheckButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/licenses/trigger-expiry-check', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error('Failed to trigger expiry check:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Button
        onClick={handleTrigger}
        variant="contained"
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
      >
        Trigger Expiry Check
      </Button>
      
      {result && (
        <Alert severity={result.success ? 'success' : 'error'} sx={{ mt: 2 }}>
          <AlertTitle>Job Completed</AlertTitle>
          Notifications Sent: {result.notificationsSent}<br />
          Expiries Processed: {result.expiriesProcessed}<br />
          Duration: {result.duration}ms
          {result.errors.length > 0 && (
            <Typography variant="body2" color="error" mt={1}>
              Errors: {result.errors.join(', ')}
            </Typography>
          )}
        </Alert>
      )}
    </Box>
  );
}
```

---

## Testing & QA Procedures

### Test Scenarios

#### Scenario 1: 90-Day Notice

**Setup:**
1. Create test license with `endDate` = today + 90 days
2. Ensure `ninetyDayNoticeSentAt` is null
3. Run expiry monitor job (or trigger manually)

**Expected Results:**
- ✓ Email sent to brand user
- ✓ Email sent to all creators
- ✓ `ninetyDayNoticeSentAt` timestamp updated
- ✓ Event logged: `license.expiry_notification_sent`
- ✓ License status remains `ACTIVE`

**Verification Queries:**

```sql
-- Check notification timestamp
SELECT id, ninety_day_notice_sent_at 
FROM licenses 
WHERE id = '{testLicenseId}';

-- Check event log
SELECT * FROM events 
WHERE event_type = 'license.expiry_notification_sent'
  AND (props_json->>'licenseId')::text = '{testLicenseId}'
ORDER BY occurred_at DESC 
LIMIT 1;
```

---

#### Scenario 2: 60-Day Reminder

**Setup:**
1. Use license from Scenario 1
2. Update `endDate` to today + 60 days
3. Run expiry monitor job

**Expected Results:**
- ✓ Email sent to brand and creators
- ✓ `sixtyDayNoticeSentAt` timestamp updated
- ✓ Event logged
- ✓ Previous `ninetyDayNoticeSentAt` still exists

---

#### Scenario 3: 30-Day Final Notice

**Setup:**
1. Use license from previous scenarios
2. Update `endDate` to today + 30 days
3. Run expiry monitor job

**Expected Results:**
- ✓ Email sent to brand and creators
- ✓ **In-app notification created** for brand
- ✓ **In-app notification created** for each creator
- ✓ `thirtyDayNoticeSentAt` timestamp updated
- ✓ License status changed to `EXPIRING_SOON`
- ✓ Event logged

**Verification:**

```sql
-- Check in-app notifications
SELECT * FROM notifications 
WHERE (metadata->>'licenseId')::text = '{testLicenseId}'
  AND type = 'LICENSE'
  AND (metadata->>'notificationType')::text = 'expiry';
```

---

#### Scenario 4: Grace Period Application

**Setup:**
1. Use license from previous scenarios
2. Set `gracePeriodDays` to 7
3. Update `endDate` to today - 1 day (past expiry)
4. Run expiry monitor job

**Expected Results:**
- ✓ `gracePeriodEndDate` set to today + 7 days
- ✓ Status remains `EXPIRING_SOON`
- ✓ Grace period notification email sent
- ✓ Event logged: `license.grace_period_started`
- ✓ License still functionally active

---

#### Scenario 5: Grace Period Completion

**Setup:**
1. Use license from Scenario 4
2. Update `gracePeriodEndDate` to today - 1 day (past grace period)
3. Run auto-expiry job (hourly)

**Expected Results:**
- ✓ License status changed to `EXPIRED`
- ✓ `expiredAt` timestamp set
- ✓ Expiry confirmation emails sent
- ✓ In-app notifications created
- ✓ Event logged: `license.expired`
- ✓ If last license in project, project status → `COMPLETED`

---

#### Scenario 6: No Grace Period (Immediate Expiry)

**Setup:**
1. Create new license with `gracePeriodDays` = 0
2. Set `endDate` to today - 1 day
3. Run expiry monitor job

**Expected Results:**
- ✓ License status immediately → `EXPIRED`
- ✓ `expiredAt` timestamp set
- ✓ No `gracePeriodEndDate` set
- ✓ Expiry confirmation emails sent
- ✓ Post-expiry actions executed

---

#### Scenario 7: Auto-Renewal Enabled

**Setup:**
1. Create license with `autoRenew` = true
2. Trigger all notification stages

**Expected Results:**
- ✓ All emails include "Auto-Renewal Enabled" notice
- ✓ Emails inform user no action required
- ✓ Renewal workflow may still be initiated manually

---

### Test Data Setup

**SQL to Create Test License:**

```sql
INSERT INTO licenses (
  id, brand_id, ip_asset_id, status, start_date, end_date,
  fee_cents, rev_share_bps, scope_json, license_type,
  grace_period_days, auto_renew, created_at, updated_at
) VALUES (
  'test_license_expiry_001',
  '{brandId}',
  '{ipAssetId}',
  'ACTIVE',
  NOW(),
  NOW() + INTERVAL '90 days',
  1000000,  -- $10,000
  500,      -- 5%
  '{"media": {"digital": true}, "placement": {"social": true}}',
  'NON_EXCLUSIVE',
  7,        -- 7-day grace period
  false,
  NOW(),
  NOW()
);
```

---

### Testing Checklist

- [ ] Create test license expiring in 90 days
- [ ] Verify 90-day notice sent
- [ ] Verify `ninetyDayNoticeSentAt` updated
- [ ] Move date forward 30 days (or update endDate)
- [ ] Verify 60-day notice sent
- [ ] Verify `sixtyDayNoticeSentAt` updated
- [ ] Move date forward 30 days
- [ ] Verify 30-day notice sent
- [ ] Verify in-app notification created
- [ ] Verify status → `EXPIRING_SOON`
- [ ] Move date past end date
- [ ] Verify grace period applied (if configured)
- [ ] Verify `gracePeriodEndDate` set
- [ ] Move date past grace period
- [ ] Verify license → `EXPIRED`
- [ ] Verify `expiredAt` timestamp set
- [ ] Verify expiry confirmation emails sent
- [ ] Verify post-expiry actions (project status, etc.)

---

## Troubleshooting Guide

### Issue 1: Notifications Not Sent at Expected Time

**Symptoms:**
- License is within notification window (90/60/30 days)
- No notification timestamp set
- No email received

**Possible Causes:**
1. Job not running (check job logs)
2. Time zone issues
3. Notification already sent (check timestamps)
4. License status not `ACTIVE`

**Diagnostic Queries:**

```sql
-- Check license eligibility for 90-day notice
SELECT 
  id, 
  end_date,
  status,
  ninety_day_notice_sent_at,
  DATE_PART('day', end_date - NOW()) as days_until_expiry
FROM licenses
WHERE status IN ('ACTIVE', 'EXPIRING_SOON')
  AND ninety_day_notice_sent_at IS NULL
  AND end_date BETWEEN NOW() + INTERVAL '89 days' AND NOW() + INTERVAL '91 days'
  AND deleted_at IS NULL;
```

**Resolution:**
1. Check job execution logs in events table
2. Verify job is scheduled correctly
3. Manually trigger expiry check if urgent
4. Check email service logs for delivery failures

---

### Issue 2: Duplicate Notifications Sent

**Symptoms:**
- Multiple emails sent for same license/stage
- Multiple in-app notifications created

**Possible Causes:**
1. Timestamp not updated after send
2. Database transaction failure
3. Job ran multiple times concurrently

**Diagnostic Queries:**

```sql
-- Check for duplicate notification events
SELECT 
  (props_json->>'licenseId')::text as license_id,
  (props_json->>'daysUntilExpiry')::int as days,
  COUNT(*) as notification_count,
  MIN(occurred_at) as first_sent,
  MAX(occurred_at) as last_sent
FROM events
WHERE event_type = 'license.expiry_notification_sent'
  AND occurred_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
HAVING COUNT(*) > 1;
```

**Resolution:**
1. Check for database transaction failures in logs
2. Verify timestamp update logic
3. Ensure job locking mechanism working
4. Manually update timestamp if needed

---

### Issue 3: License Not Expiring After End Date

**Symptoms:**
- License past `endDate`
- Status still `ACTIVE`
- No grace period should apply

**Possible Causes:**
1. Grace period incorrectly applied
2. Hourly auto-expiry job not running
3. License filtered out (status check)

**Diagnostic Queries:**

```sql
-- Find licenses past end date still active
SELECT 
  id,
  end_date,
  status,
  grace_period_days,
  grace_period_end_date,
  expired_at
FROM licenses
WHERE status IN ('ACTIVE', 'EXPIRING_SOON')
  AND end_date < NOW()
  AND deleted_at IS NULL
ORDER BY end_date ASC;
```

**Resolution:**
1. Check hourly auto-expiry job execution
2. Verify grace period configuration
3. Check `gracePeriodEndDate` vs current date
4. Manually expire if urgent (see Manual Controls)

---

### Issue 4: Wrong Notification Template Used

**Symptoms:**
- Email content doesn't match notification stage
- Variables not populated correctly

**Possible Causes:**
1. Template mapping error in service
2. Wrong template key passed
3. Template variables missing

**Diagnostic:**

Check template selection logic:

```typescript
// src/modules/licenses/services/license-expiry-monitor.service.ts
private getTemplateForStage(daysUntilExpiry: number) {
  if (daysUntilExpiry === 90) return 'license-expiry-90-day';
  if (daysUntilExpiry === 60) return 'license-expiry-60-day';
  if (daysUntilExpiry === 30) return 'license-expiry-30-day';
  return 'license-expiry-30-day'; // Default fallback
}
```

**Resolution:**
1. Verify template registry in email service
2. Check template variables match schema
3. Review email service logs for template errors
4. Test template rendering in isolation

---

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `"Failed to notify brand: {error}"` | Email delivery failed | Check email service logs, verify brand user email |
| `"Timestamp not updated after send"` | Database transaction failed | Check database connection, retry notification |
| `"License not found for notification"` | License deleted/archived | Verify license still exists, check soft delete status |
| `"Grace period end date calculation error"` | Invalid `gracePeriodDays` value | Verify `gracePeriodDays` is >= 0 |

---

## Analytics & Reporting

### Metrics Tracked

The expiry system logs comprehensive metrics for business intelligence:

**Event Types:**

| Event Type | When Logged | Key Metrics |
|-----------|-------------|-------------|
| `license.expiry_notification_sent` | Each notification sent | `daysUntilExpiry`, `urgencyLevel`, `recipientCount` |
| `license.grace_period_started` | Grace period applied | `gracePeriodDays`, `gracePeriodEndDate` |
| `license.expired` | License marked expired | `hadGracePeriod`, `autoRenewEnabled` |
| `license.expiry_monitor_completed` | Daily job completes | `notificationsSent`, `expiriesProcessed`, `duration`, `errorCount` |
| `license.auto_expiry_completed` | Hourly job completes | `expiredCount`, `gracePeriodCount`, `errorCount` |

---

### Analytics Queries

#### Notification Send Rate by Stage

```sql
SELECT 
  (props_json->>'daysUntilExpiry')::int as notification_stage,
  COUNT(*) as notifications_sent,
  COUNT(DISTINCT (props_json->>'licenseId')::text) as unique_licenses,
  AVG((props_json->>'recipientCount')::int) as avg_recipients
FROM events
WHERE event_type = 'license.expiry_notification_sent'
  AND occurred_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;
```

---

#### Grace Period Utilization

```sql
SELECT 
  grace_period_days,
  COUNT(*) as license_count,
  AVG(DATE_PART('day', grace_period_end_date - end_date)) as avg_grace_period_days
FROM licenses
WHERE grace_period_end_date IS NOT NULL
  AND created_at > NOW() - INTERVAL '90 days'
GROUP BY grace_period_days
ORDER BY grace_period_days;
```

---

#### Time from First Notice to Renewal/Expiry

```sql
SELECT 
  AVG(DATE_PART('day', expired_at - ninety_day_notice_sent_at)) as avg_days_to_expiry,
  COUNT(CASE WHEN renewed = true THEN 1 END) as renewed_count,
  COUNT(CASE WHEN expired_at IS NOT NULL THEN 1 END) as expired_count
FROM licenses
WHERE ninety_day_notice_sent_at IS NOT NULL
  AND ninety_day_notice_sent_at > NOW() - INTERVAL '180 days';
```

---

#### Brand Response Patterns

```sql
-- Brands that consistently renew vs. let expire
SELECT 
  b.id,
  b.company_name,
  COUNT(DISTINCT l.id) FILTER (WHERE l.expired_at IS NOT NULL) as expired_licenses,
  COUNT(DISTINCT r.id) as renewed_licenses,
  ROUND(
    COUNT(DISTINCT r.id)::decimal / 
    NULLIF(COUNT(DISTINCT l.id) FILTER (WHERE l.expired_at IS NOT NULL), 0) * 100, 
    2
  ) as renewal_rate_percent
FROM brands b
LEFT JOIN licenses l ON l.brand_id = b.id
LEFT JOIN licenses r ON r.parent_license_id = l.id
WHERE l.ninety_day_notice_sent_at > NOW() - INTERVAL '365 days'
GROUP BY b.id, b.company_name
HAVING COUNT(DISTINCT l.id) FILTER (WHERE l.expired_at IS NOT NULL) >= 3
ORDER BY renewal_rate_percent DESC;
```

---

### Admin Analytics Dashboard

**Recommended Charts:**

1. **Expiry Funnel Chart**
   - 90-day notices sent → 60-day → 30-day → Grace period → Expired
   - Shows drop-off at each stage

2. **Renewal Rate Trend**
   - Line chart: % of licenses renewed vs. expired over time
   - Segmented by license type (exclusive vs. non-exclusive)

3. **Grace Period Effectiveness**
   - Bar chart: % of licenses renewed during grace period
   - Compare brands that utilize vs. skip grace period

4. **Notification Delivery Performance**
   - Success rate of email notifications
   - Average delivery time
   - Bounce/failure rate

---

## Rate Limiting & Quotas

### API Rate Limits

| Endpoint | Limit | Window | Applies To |
|----------|-------|--------|------------|
| `notifications.poll` | 120 requests | 1 minute | Per user |
| `licenses.list` (expiry filters) | 100 requests | 1 minute | Per user |
| Manual expiry trigger | 1 request | 5 minutes | Admin only |
| Grace period extension | 10 requests | 1 hour | Admin only |

### Job Execution Limits

| Job | Max Duration | Timeout | Retry Policy |
|-----|--------------|---------|--------------|
| Daily expiry monitor | 10 minutes | 15 minutes | Retry once after 1 hour |
| Hourly auto-expiry | 5 minutes | 10 minutes | Retry once after 10 minutes |

### Email Sending Quotas

- **Transactional emails:** No hard limit (uses Resend/SendGrid quota)
- **Rate limiting:** Handled by email service provider
- **Bounce handling:** Automatic (email service responsibility)

**Frontend should not:**
- Implement custom rate limiting for expiry notifications
- Retry failed email sends
- Handle email bounce processing

---

## Operational Procedures

### Daily Operations Checklist

**For Operations Team:**

- [ ] Review daily expiry monitor job logs (09:00 UTC run)
- [ ] Check for error alerts in #ops-alerts Slack channel
- [ ] Verify notification send counts match expected
- [ ] Monitor grace period license count
- [ ] Review any manual expiry requests from support

---

### Weekly Review Checklist

- [ ] Analyze renewal rates from past week
- [ ] Identify brands with multiple expiring licenses
- [ ] Check for licenses stuck in grace period
- [ ] Review email delivery failure reports
- [ ] Verify job execution metrics (duration, success rate)

---

### Incident Response Procedures

#### Incident: Bulk Notification Failure

**Severity:** High  
**Response Time:** < 1 hour

**Steps:**
1. Check email service status (Resend/SendGrid dashboard)
2. Review expiry monitor job logs for errors
3. Identify failed licenses from event log
4. Manually trigger retry for failed notifications
5. Update affected brands via support ticket
6. Document incident in operations log

---

#### Incident: Grace Period Not Applied

**Severity:** Medium  
**Response Time:** < 4 hours

**Steps:**
1. Identify affected licenses
2. Verify `gracePeriodDays` configuration
3. Manually apply grace period if needed
4. Check hourly auto-expiry job logs
5. Send grace period notification emails manually if missed
6. Update job monitoring alerts

---

#### Incident: License Expired Prematurely

**Severity:** Critical  
**Response Time:** Immediate

**Steps:**
1. Confirm license details and expiry date
2. Check for manual expiry actions in audit log
3. Restore license to previous status if error
4. Extend grace period if applicable
5. Notify brand immediately
6. Document error and prevention measures

---

### Support Escalation

**For License Expiry Issues:**

| Issue Type | L1 Support | L2 Support | L3 Engineering |
|------------|------------|------------|----------------|
| "I didn't receive expiry email" | Check spam folder, verify preferences | Check email service logs | Investigate email service integration |
| "License expired too early" | Verify dates, check grace period | Review job logs, check for manual actions | Database investigation, restore if bug |
| "Notification sent multiple times" | Acknowledge, create ticket | Check for duplicate events | Fix timestamp update logic |
| "Grace period didn't apply" | Check `gracePeriodDays` setting | Verify job execution | Debug grace period logic |

---

### Monitoring & Alerts

**Recommended Alerts:**

1. **Job Failure Alert**
   - Trigger: Expiry monitor job fails 2 consecutive runs
   - Channel: #ops-alerts Slack
   - Severity: High

2. **High Error Rate Alert**
   - Trigger: >10% notification failures in single job run
   - Channel: #ops-alerts Slack
   - Severity: Medium

3. **Stuck Grace Period Alert**
   - Trigger: License in grace period > 14 days
   - Channel: #ops-alerts Slack
   - Severity: Low

4. **Job Duration Alert**
   - Trigger: Job duration > 10 minutes
   - Channel: #ops-alerts Slack
   - Severity: Low

---

## Advanced Features

### Future Enhancements

**Planned Features:**

1. **Custom Notification Schedules**
   - Allow brands to configure custom notification timing (e.g., 45/15/7 days)
   - Support for multiple reminder emails

2. **Predictive Renewal Likelihood**
   - ML model to predict renewal probability
   - Proactive outreach for at-risk licenses

3. **Bulk Grace Period Management**
   - Admin UI to extend grace periods for multiple licenses
   - Bulk notification resend

4. **White-Label Email Templates**
   - Brand-specific email templates
   - Custom branding for large enterprise clients

5. **WebSocket Real-Time Notifications**
   - Push expiry alerts to connected clients
   - Reduce polling overhead

---

### Custom Extensions

**For Developers:**

The expiry system is designed to be extensible. Custom business logic can be added by:

1. **Extending the service:**
   ```typescript
   // src/modules/licenses/services/license-expiry-monitor.service.ts
   private async executePostExpiryActions(license: LicenseWithDetails) {
     // Your custom post-expiry logic here
   }
   ```

2. **Adding custom notification stages:**
   ```typescript
   private readonly notificationStages = [
     { daysBeforeExpiry: 90, ... },
     { daysBeforeExpiry: 60, ... },
     { daysBeforeExpiry: 45, ... }, // New custom stage
     { daysBeforeExpiry: 30, ... },
   ];
   ```

3. **Creating custom email templates:**
   - Add new template to `emails/templates/`
   - Register in email service
   - Update template selection logic

---

## Frontend Implementation Checklist

### Admin Dashboard
- [ ] Build expiry pipeline overview widget
- [ ] Display recent job run status
- [ ] Show licenses in grace period list
- [ ] Create admin license list with expiry filters
- [ ] Add sortable columns (end date, days until expiry, etc.)

### Manual Controls
- [ ] Build grace period extension dialog
- [ ] Implement manual license expiry dialog
- [ ] Add reset notification status button (dev only)
- [ ] Create "Trigger Expiry Check" button with job result display

### Testing Tools
- [ ] Build test data generation UI
- [ ] Create notification status reset tool
- [ ] Add date manipulation controls for testing
- [ ] Implement test scenario runner

### Analytics
- [ ] Display notification send rate charts
- [ ] Show grace period utilization metrics
- [ ] Build renewal rate trend graph
- [ ] Create brand response pattern analysis

### Monitoring
- [ ] Integrate job execution alerts
- [ ] Display error rate warnings
- [ ] Show stuck grace period alerts
- [ ] Monitor job duration metrics

---

## Support & Escalation

**Technical Issues:**
- Email: engineering@yesgoddess.com
- Slack: #engineering

**License Operations:**
- Email: operations@yesgoddess.com
- Slack: #ops-team

**Emergency Escalation:**
- Slack: #ops-alerts
- On-call rotation: See PagerDuty

---

## Conclusion

This concludes the comprehensive License Expiry Management System integration documentation.

**Document Series:**
1. **[Part 1: Overview & Monitoring](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_1_OVERVIEW.md)** - System architecture, monitoring APIs, business logic
2. **[Part 2: Notifications & Communications](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_2_NOTIFICATIONS.md)** - Email templates, in-app notifications, user preferences
3. **[Part 3: Admin Operations](./LICENSE_EXPIRY_INTEGRATION_GUIDE_PART_3_ADMIN.md)** *(this document)* - Admin controls, testing, troubleshooting

**Related Documentation:**
- License Module Overview: `docs/modules/licensing/LICENSE_EXPIRY_MANAGEMENT.md`
- Quick Reference: `docs/modules/licensing/EXPIRY_QUICK_REFERENCE.md`
- Email System: `emails/README.md`
- Notification System: `docs/NOTIFICATION_SYSTEM_IMPLEMENTATION.md`

For questions or clarifications, contact the engineering team.
