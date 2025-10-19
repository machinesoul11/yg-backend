# 2FA Compliance & Reporting - Quick Reference

## API Endpoints Summary

### Dashboard & Metrics
```
GET  /api/admin/2fa/dashboard
GET  /api/admin/2fa/compliance/metrics?days=30
```

### Security Alerts
```
GET   /api/admin/2fa/security/alerts?status=active&severity=critical
PATCH /api/admin/2fa/security/alerts/[alertId]
POST  /api/admin/2fa/security/check
```

### Security Events
```
GET /api/admin/2fa/security/events?anomalousOnly=true&limit=100
```

### Reports
```
GET  /api/admin/2fa/reports?reportType=monthly_security
POST /api/admin/2fa/reports
GET  /api/admin/2fa/reports/[reportId]?format=csv
```

---

## Key Services

### TwoFactorComplianceService
```typescript
import { TwoFactorComplianceService } from '@/lib/services/2fa-compliance.service';

const service = new TwoFactorComplianceService(prisma);

// Get current adoption
const adoption = await service.getCurrentAdoptionMetrics();

// Get trends
const trend = await service.getAdoptionTrend(30);

// Aggregate metrics
await service.aggregateComplianceMetrics(start, end, 'daily');
```

### TwoFactorSecurityAlertsService
```typescript
import { TwoFactorSecurityAlertsService } from '@/lib/services/2fa-security-alerts.service';

const alertsService = new TwoFactorSecurityAlertsService(prisma);

// Run all checks
await alertsService.runAllChecks();

// Get active alerts
const alerts = await alertsService.getActiveAlerts();

// Acknowledge alert
await alertsService.acknowledgeAlert(alertId, adminId);
```

### TwoFactorReportingService
```typescript
import { TwoFactorReportingService } from '@/lib/services/2fa-reporting.service';

const reportingService = new TwoFactorReportingService(prisma);

// Generate monthly report
const reportId = await reportingService.generateMonthlySecurityReport(2025, 10, adminId);

// Schedule recurring report
await reportingService.scheduleRecurringReport({
  reportType: 'monthly_security',
  frequency: 'monthly',
  emailTo: ['admin@example.com'],
  generatedBy: adminId,
});
```

### Event Logging Helpers
```typescript
import {
  log2FASuccess,
  log2FAFailure,
  log2FASetup,
  log2FABackupCodeUsage,
} from '@/lib/services/2fa-event-logger';

// Log successful auth
await log2FASuccess({
  userId,
  method: 'totp',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

// Log failed auth
await log2FAFailure({
  userId,
  method: 'totp',
  reason: 'Invalid code',
  ipAddress: req.ip,
});
```

---

## Background Jobs Schedule

```
Daily Metrics:        2 AM daily
Weekly Metrics:       3 AM Monday
Monthly Metrics:      4 AM 1st of month
Security Checks:      Every 15 minutes
Monthly Report:       5 AM 1st of month
```

### Initialize Jobs
```typescript
import { initializeComplianceJobs } from '@/lib/jobs/2fa-compliance-metrics.job';

await initializeComplianceJobs();
```

---

## Alert Severity Levels

- **info** - Informational, no action required
- **warning** - Review within 24 hours
- **critical** - Review within 1 hour
- **urgent** - Immediate action required

---

## Alert Types

- **spike_failures** - Sudden increase in failure rate
- **velocity_attack** - Rapid automated attempts
- **geographic_anomaly** - Unusual geographic patterns
- **sustained_attack** - Prolonged elevated activity

---

## Event Types

### Authentication
- `successful_auth` - Successful 2FA verification
- `failed_attempt` - Failed 2FA verification

### Configuration
- `setup` - 2FA enabled
- `disable` - 2FA disabled
- `backup_code_regeneration` - Backup codes regenerated

### Security
- `lockout` - Account locked due to failures
- `admin_reset` - Admin reset 2FA
- `emergency_code_generated` - Emergency code generated
- `suspicious_activity` - Anomalous activity detected

---

## Common Queries

### Get Users Needing Backup Codes
```typescript
const users = await prisma.user.findMany({
  where: {
    deleted_at: null,
    two_factor_enabled: true,
  },
  include: {
    twoFactorBackupCodes: {
      where: { used: false },
    },
  },
});

const usersWithLowCodes = users.filter(
  u => u.twoFactorBackupCodes.length < 3
);
```

### Get Recent Anomalous Events
```typescript
const events = await eventsService.getAnomalousEvents({
  limit: 50,
  minScore: 50,
});
```

### Get Failed Attempts Summary
```typescript
const summary = await eventsService.getFailedAttemptsSummary(
  startDate,
  endDate
);
```

---

## Database Tables

- `two_factor_compliance_metrics` - Aggregated metrics
- `two_factor_security_events` - Detailed event log
- `two_factor_security_alerts` - Active and historical alerts
- `two_factor_compliance_reports` - Generated reports

---

## Environment Variables

No additional environment variables required. Uses existing:
- `DATABASE_URL` - Database connection
- `REDIS_URL` - Redis for job queue

---

## Monitoring Health

### Check Job Status
```typescript
import { queueMonitor } from '@/lib/queue';

const health = await queueMonitor.getDashboardSummary();
```

### Check Recent Metrics
```sql
SELECT * FROM two_factor_compliance_metrics
WHERE period_type = 'daily'
ORDER BY period_start DESC
LIMIT 7;
```

### Check Active Alerts
```sql
SELECT alert_type, severity, COUNT(*) 
FROM two_factor_security_alerts
WHERE status = 'active'
GROUP BY alert_type, severity;
```

---

## Quick Troubleshooting

**No metrics showing?**
- Check if background jobs are running
- Run manual aggregation for recent dates
- Verify migration applied

**Alerts not triggering?**
- Check security check job is scheduled
- Verify events are being logged
- Check alert suppression (1 hour window)

**High false positive rate?**
- Adjust anomaly thresholds in service
- Review baseline calculation period
- Check geographic data quality

---

## Integration Checklist

- [ ] Apply database migration
- [ ] Generate Prisma client
- [ ] Initialize background jobs
- [ ] Add event logging to auth endpoints
- [ ] Test dashboard endpoints
- [ ] Configure alert notifications
- [ ] Run initial metrics aggregation
- [ ] Schedule first report
- [ ] Train admins on alert response
- [ ] Document custom thresholds

---

## Performance Tips

1. **Index Usage** - All queries use proper indexes
2. **Event Archival** - Archive events > 90 days
3. **Report Caching** - Cache dashboard queries (5 min)
4. **Batch Operations** - Use transactions for bulk updates
5. **Async Logging** - Event logging never blocks auth

---

## Security Best Practices

1. All endpoints require ADMIN role
2. Event logging is fail-safe (never throws)
3. Reports contain PII - secure storage required
4. Alert notifications should be encrypted
5. Audit all admin actions on alerts

---

For detailed documentation, see:
**docs/2FA_COMPLIANCE_REPORTING_IMPLEMENTATION.md**
