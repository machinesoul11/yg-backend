# Twilio SMS 2FA Implementation - Quick Reference

## Overview

This document provides a quick reference for the Twilio SMS-based Two-Factor Authentication (2FA) implementation for the YesGoddess backend platform.

## Environment Variables

Add the following to your `.env` or `.env.local` file:

```bash
# Twilio SMS
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number
TWILIO_WEBHOOK_SECRET=your-twilio-webhook-secret
```

## Database Schema

### SmsVerificationCode Model

```prisma
model SmsVerificationCode {
  id              String    @id @default(cuid())
  userId          String
  codeHash        String    @map("code_hash")
  phoneNumber     String    @map("phone_number")
  attempts        Int       @default(0)
  verified        Boolean   @default(false)
  verifiedAt      DateTime? @map("verified_at")
  expires         DateTime
  twilioMessageId String?   @map("twilio_message_id")
  deliveryStatus  String?   @map("delivery_status")
  deliveryError   String?   @map("delivery_error")
  cost            Float?
  createdAt       DateTime  @default(now())
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([userId, verified])
  @@index([expires])
  @@index([twilioMessageId])
  @@map("sms_verification_codes")
}
```

### User Model Extensions

The following fields were already present in the User model:
- `phone_number`: String (nullable, E.164 format)
- `phone_verified`: Boolean (default: false)
- `preferred_2fa_method`: TwoFactorMethod enum (SMS, AUTHENTICATOR, BOTH)

## Rate Limiting

### SMS Rate Limits

- **Maximum**: 3 SMS per 15 minutes per user
- **Progressive backoff**:
  - First resend: 30 seconds wait
  - Second resend: 60 seconds wait
  - Third+ resend: 120 seconds wait

### Verification Attempts

- **Maximum**: 3 attempts per code
- **Code expiry**: 5 minutes
- **Code length**: 6 digits

## Cost Thresholds

### Alert Thresholds

```typescript
Daily:
  - Warning: $50/day
  - Critical: $100/day

Weekly:
  - Warning: $300/week
  - Critical: $500/week

Monthly:
  - Warning: $1000/month
  - Critical: $2000/month

Per User:
  - Daily: $5/user/day
  - Monthly: $20/user/month
```

## API Endpoints (tRPC)

### User Endpoints

#### Enable SMS 2FA
```typescript
trpc.sms2FA.enable.mutate({
  phoneNumber: '+12345678901' // E.164 format
})
```

#### Verify SMS Code
```typescript
trpc.sms2FA.verify.mutate({
  code: '123456'
})
```

#### Request Login Code
```typescript
trpc.sms2FA.requestLoginCode.mutate({
  phoneNumber: '+12345678901' // Optional, uses user's stored number if omitted
})
```

#### Disable SMS 2FA
```typescript
trpc.sms2FA.disable.mutate()
```

#### Update Phone Number
```typescript
trpc.sms2FA.updatePhoneNumber.mutate({
  phoneNumber: '+12345678901'
})
```

#### Update Preferred 2FA Method
```typescript
trpc.sms2FA.updatePreferredMethod.mutate({
  method: 'SMS' | 'AUTHENTICATOR' | 'BOTH'
})
```

#### Get SMS 2FA Status
```typescript
trpc.sms2FA.getStatus.query()
```

#### Get My SMS Costs
```typescript
trpc.sms2FA.getMyCosts.query({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
})
```

### Admin Endpoints

#### Get Aggregate Costs
```typescript
trpc.sms2FA.getAggregateCosts.query({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
})
```

#### Generate Cost Report
```typescript
trpc.sms2FA.generateCostReport.query({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
})
```

#### Check Cost Alerts
```typescript
trpc.sms2FA.checkCostAlerts.query()
```

#### Detect Anomalies
```typescript
trpc.sms2FA.detectAnomalies.query()
```

#### Send Cost Alerts
```typescript
trpc.sms2FA.sendCostAlerts.mutate()
```

## Webhook Endpoint

### Twilio Status Callback

**Endpoint**: `POST /api/webhooks/twilio/status`

This endpoint receives delivery status updates from Twilio. Configure it in your Twilio console:

1. Go to Twilio Console → Phone Numbers → Select your number
2. Set "Status Callback URL" to: `https://your-domain.com/api/webhooks/twilio/status`
3. Enable all status callbacks (queued, sent, delivered, failed, etc.)

## SMS Templates

Three templates are available:

1. **twoFactorAuth**: General 2FA verification
2. **phoneVerification**: Phone number verification during setup
3. **loginVerification**: Login verification code

All templates include:
- Platform identification (YesGoddess)
- 6-digit code
- Expiration time (5 minutes)
- Security notice

## Services

### TwilioSmsService

Located at: `src/lib/services/sms/twilio.service.ts`

**Key Methods**:
- `sendVerificationCode(userId, phoneNumber, template)`: Send SMS code
- `verifyCode(userId, code)`: Verify a code
- `checkRateLimit(userId)`: Check rate limit status
- `getUserSmsCosts(userId, startDate?, endDate?)`: Get user's SMS costs
- `getAggregateCosts(startDate?, endDate?)`: Get aggregate costs
- `updateDeliveryStatus(messageId, status, errorCode?, errorMessage?)`: Update delivery status
- `cleanupExpiredCodes()`: Remove expired codes from database

### SmsCostMonitorService

Located at: `src/lib/services/sms/cost-monitor.service.ts`

**Key Methods**:
- `checkDailyCosts()`: Check daily cost thresholds
- `checkWeeklyCosts()`: Check weekly cost thresholds
- `checkMonthlyCosts()`: Check monthly cost thresholds
- `checkAllCosts()`: Check all thresholds
- `sendCostAlerts(alerts)`: Send email alerts to admins
- `generateCostReport(startDate, endDate)`: Generate comprehensive report
- `detectAnomalies()`: Detect unusual usage patterns

## Background Jobs

### SMS Maintenance Jobs

Located at: `src/jobs/sms-maintenance.job.ts`

**Scheduled Tasks**:
1. **Cost Alerts**: Every hour - Check and send cost alerts
2. **Cleanup**: Every 6 hours - Remove expired verification codes
3. **Anomaly Detection**: Every 30 minutes - Detect unusual patterns
4. **Daily Report**: Daily at 1 AM - Generate cost report

**Initialize Jobs**:
```typescript
import { scheduleSmsMaintenanceJobs } from '@/jobs/sms-maintenance.job';

await scheduleSmsMaintenanceJobs();
```

## Security Features

### Code Security
- 6-digit codes generated using `crypto.randomBytes()`
- Codes are hashed with bcrypt before storage (never stored in plaintext)
- Codes expire after 5 minutes
- Maximum 3 verification attempts per code

### Phone Number Security
- Phone numbers stored in E.164 international format
- Validation using regex: `/^\+[1-9]\d{1,14}$/`
- Duplicate phone numbers prevented across accounts
- Phone verification required before enabling SMS 2FA

### Webhook Security
- Twilio webhook signature verification using HMAC SHA1
- Signature validation prevents unauthorized requests
- Falls back to allowing requests in development if secret not configured

### Rate Limiting
- Redis-based rate limiting
- Sliding window approach
- Per-user limits to prevent abuse
- Progressive backoff between resend attempts

## Error Handling

### Common Error Codes

- `21211`: Invalid phone number
- `21408`: Permission denied for phone number
- `21610`: Phone number not reachable
- `21614`: Invalid phone number format
- `30007`: Message filtered as spam
- `30008`: Unknown destination error

All errors are parsed into user-friendly messages.

## Cost Tracking

### Per-Message Tracking
- Cost stored with each SMS record
- Retrieved from Twilio API response
- Aggregated for reporting

### Cost Attribution
- By user
- By day/week/month
- By delivery status
- Top spenders identification

### Monitoring Dashboard Data

Cost reports include:
- Total cost and count
- Unique users
- Average cost per SMS
- Top 10 users by cost
- Delivery statistics
- Cost by day breakdown

## Integration with Authentication Flow

### Setup Flow
1. User initiates SMS 2FA setup
2. Phone number provided and validated
3. SMS verification code sent
4. User enters code
5. Code verified
6. SMS 2FA enabled, phone marked as verified

### Login Flow (when SMS 2FA enabled)
1. User provides username/password
2. Credentials validated
3. SMS code sent to verified phone
4. User enters code
5. Code verified
6. Full session granted

## Testing

### Development Mode
- Set up a Twilio trial account
- Use verified phone numbers during trial
- Monitor costs in Twilio console
- Test webhook locally with ngrok or similar

### Testing Checklist
- [ ] Send verification code
- [ ] Verify correct code
- [ ] Verify incorrect code (max attempts)
- [ ] Code expiration
- [ ] Rate limiting
- [ ] Progressive backoff
- [ ] Webhook delivery status updates
- [ ] Cost tracking
- [ ] Alert thresholds
- [ ] Anomaly detection

## Monitoring

### Key Metrics
- SMS sent per hour/day
- Delivery success rate
- Average cost per SMS
- Failed deliveries
- Rate limit hits
- User adoption rate

### Alerts
- Cost threshold alerts (email to admin)
- High failure rate alerts
- Anomaly detection alerts
- Unusual usage pattern alerts

## Troubleshooting

### SMS Not Received
1. Check Twilio delivery status in database
2. Verify phone number format (E.164)
3. Check carrier restrictions
4. Review Twilio console for errors
5. Verify webhook is receiving status updates

### Rate Limit Issues
1. Check Redis connection
2. Verify rate limit keys are being set
3. Check user's recent SMS count
4. Review backoff periods

### Cost Alerts Not Sending
1. Verify email service is configured
2. Check admin email address in env vars
3. Review cost monitoring job logs
4. Ensure scheduled jobs are running

## Production Deployment Checklist

- [ ] Add Twilio credentials to production environment
- [ ] Configure webhook URL in Twilio console
- [ ] Set up Twilio phone number for production
- [ ] Enable webhook signature verification
- [ ] Configure cost alert email recipients
- [ ] Schedule maintenance jobs
- [ ] Set up monitoring and alerting
- [ ] Test SMS delivery in production
- [ ] Monitor costs during first week
- [ ] Review and adjust rate limits if needed

## Support

For issues related to:
- **Twilio API**: Check Twilio documentation and console
- **Rate limiting**: Review Redis keys and TTLs
- **Cost alerts**: Check email service and admin configuration
- **Database**: Verify Prisma schema and migrations
- **Jobs**: Check BullMQ queue status

## References

- Twilio Node.js SDK: https://www.twilio.com/docs/libraries/node
- E.164 Format: https://en.wikipedia.org/wiki/E.164
- Twilio Pricing: https://www.twilio.com/pricing
- Webhook Security: https://www.twilio.com/docs/usage/webhooks/webhooks-security
