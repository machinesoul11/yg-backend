# Transactional Email System - Deployment Checklist

## Pre-Deployment Verification

### Environment Variables ✅
- [ ] `RESEND_API_KEY` - Resend API key configured
- [ ] `RESEND_SENDER_EMAIL` - Verified sender email address
- [ ] `RESEND_WEBHOOK_SECRET` - Webhook signing secret
- [ ] `EMAIL_FROM_NAME` - Sender name (default: "YES GODDESS")
- [ ] `DATABASE_URL` - Database connection string
- [ ] `DATABASE_URL_POOLED` - Pooled database connection
- [ ] `REDIS_URL` - Redis connection string

### Database Migrations ✅
- [ ] Run `npm run db:migrate:deploy` to apply new tables:
  - `email_retry_queue`
  - `email_dead_letter_queue`
  - `email_retry_metrics`
- [ ] Verify all email-related tables exist:
  ```bash
  npm run db:studio
  # Check for: email_events, email_preferences, email_suppressions, 
  # scheduled_emails, email_retry_queue, email_dead_letter_queue
  ```

### Resend Configuration ✅
- [ ] Verify sender domain in Resend dashboard
- [ ] Configure DNS records (SPF, DKIM, DMARC)
- [ ] Test domain verification status
- [ ] Create webhook endpoint in Resend:
  - URL: `https://yourdomain.com/api/webhooks/resend`
  - Events: All email events
  - Copy webhook secret to environment
- [ ] Verify webhook is active and configured

### Code Verification ✅
- [ ] All new files compile without errors:
  ```bash
  npm run type-check
  ```
- [ ] Run linter:
  ```bash
  npm run lint
  ```
- [ ] Build succeeds:
  ```bash
  npm run build
  ```

### Worker Services ✅
- [ ] Verify BullMQ workers are registered:
  - `scheduledEmailWorker` (scheduling.service.ts)
  - `emailRetryWorker` (retry.service.ts)
- [ ] Ensure Redis connection is stable
- [ ] Test worker health endpoints

## Post-Deployment Testing

### Send Test Email ✅
```typescript
import { emailService } from '@/lib/services/email';

// Test basic send
const result = await emailService.sendTransactional({
  email: 'test@yourdomain.com',
  subject: 'Test Email - Production Deploy',
  template: 'welcome-email',
  variables: {
    userName: 'Test User',
  },
  tags: {
    environment: 'production',
    test: 'deployment',
  },
});

console.log('Result:', result);
```

### Verify Webhook Processing ✅
1. Send test email
2. Check Resend dashboard for webhook delivery
3. Verify event stored in `email_events` table
4. Check logs for webhook processing
5. Confirm no signature verification errors

### Test Scheduling ✅
```typescript
import { emailSchedulingService } from '@/lib/services/email';

const scheduleId = await emailSchedulingService.scheduleEmail({
  emailType: 'test',
  recipientEmail: 'test@yourdomain.com',
  templateId: 'welcome-email',
  subject: 'Scheduled Test',
  personalizationData: { userName: 'Test' },
  scheduledSendTime: new Date(Date.now() + 60000), // 1 minute from now
});

// Wait 2 minutes, then check if email was sent
```

### Test Retry Mechanism ✅
1. Simulate a failure (disconnect network briefly)
2. Attempt to send email
3. Verify email added to retry queue
4. Check retry queue stats:
   ```typescript
   import { emailRetryService } from '@/lib/services/email';
   const stats = await emailRetryService.getRetryStats();
   console.log('Retry queue:', stats);
   ```
5. Verify automatic retry occurs

### Test Sanitization ✅
```typescript
import { sanitizeEmailAddress, sanitizeSubject } from '@/lib/services/email';

// Should normalize
console.assert(sanitizeEmailAddress('  USER@EXAMPLE.COM  ') === 'user@example.com');

// Should sanitize subject
console.assert(!sanitizeSubject('Test\r\nBcc: evil@example.com').includes('\n'));
```

## Monitoring Setup

### Email Metrics ✅
- [ ] Set up monitoring dashboard for:
  - Daily send volume
  - Bounce rate (alert if > 5%)
  - Complaint rate (alert if > 0.1%)
  - Delivery rate (alert if < 95%)
  - Retry queue depth
  - Dead letter queue size

### Alerts Configuration ✅
- [ ] High bounce rate (> 5%)
- [ ] High complaint rate (> 0.1%)
- [ ] Large retry queue (> 100 items)
- [ ] Dead letter queue items
- [ ] Webhook failures
- [ ] Worker failures

### Log Monitoring ✅
- [ ] Configure log aggregation for:
  - `[EmailService]` logs
  - `[EmailRetry]` logs
  - `[EmailScheduling]` logs
  - `[ResendWebhook]` logs
- [ ] Set up error alerting
- [ ] Configure log retention

## Security Verification

### Webhook Security ✅
- [ ] Verify signature verification is enabled
- [ ] Test with invalid signature (should reject)
- [ ] Confirm webhook secret is not logged
- [ ] Verify HTTPS only

### Input Sanitization ✅
- [ ] Test XSS prevention in templates
- [ ] Verify URL protocol whitelisting
- [ ] Test header injection prevention
- [ ] Confirm attachment size limits

### Data Privacy ✅
- [ ] Verify email content is encrypted at rest
- [ ] Confirm PII handling complies with policy
- [ ] Check suppression list privacy
- [ ] Verify unsubscribe links work

## Performance Testing

### Load Testing ✅
- [ ] Test bulk email sending (100+ emails)
- [ ] Verify queue processing performance
- [ ] Check database query performance
- [ ] Monitor Redis cache hit rate
- [ ] Test concurrent webhook processing

### Cache Performance ✅
- [ ] Verify suppression list caching
- [ ] Check preference caching
- [ ] Test bounce stats caching
- [ ] Monitor cache hit rates

## Documentation Verification

### Internal Docs ✅
- [ ] `TRANSACTIONAL_EMAIL_GUIDE.md` - Complete guide
- [ ] `IMPLEMENTATION_COMPLETE.md` - Implementation summary
- [ ] `QUICK_REFERENCE.md` - Developer reference
- [ ] API documentation up to date

### Team Training ✅
- [ ] Share documentation with team
- [ ] Conduct walkthrough of email system
- [ ] Review error handling procedures
- [ ] Explain monitoring dashboards

## Rollback Plan

### If Issues Occur ✅
1. **Email Service Failure:**
   - Check Resend dashboard for API status
   - Verify environment variables
   - Review recent error logs
   - Check Redis connectivity

2. **High Bounce/Complaint Rate:**
   - Pause email sending: Set rate limit to 0
   - Review recent email content
   - Check suppression list
   - Investigate recipient list quality

3. **Retry Queue Backup:**
   - Check worker health
   - Increase worker concurrency
   - Review error patterns
   - Clear non-retryable errors from queue

4. **Webhook Failures:**
   - Verify webhook secret
   - Check endpoint accessibility
   - Review signature verification
   - Test with Resend webhook tester

### Emergency Contacts ✅
- [ ] Resend support contact info
- [ ] Database admin contact
- [ ] DevOps team contact
- [ ] On-call rotation schedule

## Production Optimization

### Week 1 Review ✅
- [ ] Review send volume and patterns
- [ ] Check bounce/complaint rates
- [ ] Analyze retry queue metrics
- [ ] Review dead letter queue
- [ ] Optimize worker concurrency if needed

### Month 1 Review ✅
- [ ] Analyze email engagement metrics
- [ ] Review template performance
- [ ] Check reputation score trends
- [ ] Optimize send-time scheduling
- [ ] Review and clean suppression list

## Compliance Checklist

### CAN-SPAM Compliance ✅
- [ ] All emails have valid unsubscribe link
- [ ] Physical mailing address in footer
- [ ] Clear sender identification
- [ ] Subject lines not misleading
- [ ] Unsubscribe requests honored within 10 days

### GDPR Compliance ✅
- [ ] Consent tracking for marketing emails
- [ ] Easy opt-out mechanism
- [ ] Data retention policies
- [ ] Right to be forgotten support
- [ ] Privacy policy linked in emails

## Sign-Off

- [ ] **Development Team:** Code reviewed and tested
- [ ] **QA Team:** All tests passed
- [ ] **DevOps Team:** Infrastructure ready
- [ ] **Product Owner:** Features approved
- [ ] **Security Team:** Security review complete
- [ ] **Compliance:** Legal requirements met

## Deployment Steps

1. **Pre-deployment:**
   ```bash
   # Run all checks
   npm run type-check
   npm run lint
   npm run build
   ```

2. **Deploy code:**
   ```bash
   git push origin main
   # CI/CD will handle deployment
   ```

3. **Apply migrations:**
   ```bash
   npm run db:migrate:deploy
   ```

4. **Verify services:**
   ```bash
   # Check workers are running
   # Verify Redis connectivity
   # Test database connection
   ```

5. **Configure webhook:**
   - Add webhook endpoint in Resend dashboard
   - Test webhook delivery

6. **Send test email:**
   - Use production test account
   - Verify delivery
   - Check webhook events

7. **Monitor for 1 hour:**
   - Watch logs
   - Check metrics
   - Verify no errors

8. **Enable for production:**
   - Remove test restrictions
   - Enable all email types
   - Monitor performance

## Success Criteria

- ✅ Test email sent and delivered
- ✅ Webhook events processed correctly
- ✅ Scheduled emails working
- ✅ Retry mechanism functional
- ✅ No errors in logs
- ✅ All workers running
- ✅ Metrics collecting properly
- ✅ Documentation complete

---

**Deployment Date:** _________________

**Deployed By:** _________________

**Verified By:** _________________

**Notes:**
_________________________________________
_________________________________________
_________________________________________
