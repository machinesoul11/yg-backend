# License Renewal Automation System - Quick Reference

## Overview

The License Renewal Automation System provides comprehensive end-to-end automation for license renewals, from eligibility checking through offer generation, notifications, acceptance, and analytics.

## System Components

### 1. Renewal Eligibility Service
**Location**: `src/modules/licenses/services/renewal-eligibility.service.ts`

Evaluates licenses for renewal eligibility with comprehensive context including:
- Days until expiration (90-day window)
- License status validation
- IP asset and ownership checks
- Brand account standing
- Payment history verification
- Active dispute detection
- Future conflict analysis

**Key Methods**:
- `checkEligibility(licenseId)` - Single license eligibility check
- `checkBatchEligibility(licenseIds)` - Batch processing
- `findEligibleLicenses(daysUntilExpiration)` - Find all eligible licenses

### 2. Renewal Pricing Calculator
**Location**: `src/modules/licenses/services/renewal-pricing.service.ts`

Sophisticated pricing engine supporting multiple strategies:
- `FLAT_RENEWAL` - Same price as original
- `USAGE_BASED` - Adjust based on tracked usage
- `MARKET_RATE` - Align to current market rates
- `PERFORMANCE_BASED` - Adjust based on ROI
- `NEGOTIATED` - Custom negotiated pricing
- `AUTOMATIC` - System determines best strategy

**Adjustments Applied**:
- Base inflation rate (default 5%)
- Loyalty discounts (2+ renewals = 5-15% discount)
- Early renewal discount (60+ days early = 5% discount)
- Usage-based adjustments
- Caps (max ±20-25% change)

**Key Methods**:
- `calculateRenewalPricing(input)` - Calculate pricing with detailed breakdown
- `getConfiguration()` - Get current pricing rules
- `updateConfiguration(updates)` - Customize pricing rules

### 3. Renewal Notification Service
**Location**: `src/modules/licenses/services/renewal-notifications.service.ts`

Orchestrates email notifications at 4 lifecycle stages:
- **Initial Offer** (90 days): Detailed renewal offer with pricing breakdown
- **First Reminder** (60 days): Medium urgency reminder
- **Second Reminder** (30 days): High urgency reminder
- **Final Notice** (7 days): Final warning with consequences

**Key Methods**:
- `sendRenewalOffer(licenseId, renewalData)` - Send initial offer
- `sendRenewalReminder(licenseId)` - Send stage-appropriate reminder
- `sendRenewalComplete(originalId, newId)` - Confirmation to brand & creators
- `processPendingNotifications()` - Batch process all pending notifications

### 4. Renewal Analytics Service
**Location**: `src/modules/licenses/services/renewal-analytics.service.ts`

Tracks and reports renewal system performance:
- Renewal rate (% of expiring licenses that renew)
- Revenue retention rate
- Time-to-renewal metrics
- Top performing assets
- At-risk license identification
- Brand renewal performance analysis

**Key Methods**:
- `calculateRenewalMetrics(startDate, endDate)` - Comprehensive metrics
- `getRenewalPipelineSnapshot()` - Current pipeline state
- `analyzeBrandRenewalPerformance(brandId)` - Brand-specific analysis
- `storeMetrics(date, metrics)` - Save to database

### 5. Enhanced License Renewal Service
**Location**: `src/modules/licenses/services/enhancedLicenseRenewalService.ts`

Core renewal workflow coordination:
- Eligibility validation
- Renewal offer generation
- Offer acceptance and license creation
- Auto-renewal processing

**Key Methods**:
- `checkRenewalEligibility(licenseId)` - Full eligibility check
- `generateRenewalOffer(licenseId, userId)` - Create formal offer
- `acceptRenewalOffer(licenseId, offerId, userId)` - Accept and create renewal license
- `processAutoRenewals()` - Batch process auto-renew licenses

## Email Templates

Three new React Email templates following YES GODDESS brand guidelines:

### 1. LicenseRenewalOffer.tsx
Initial renewal offer with:
- Renewal terms comparison table
- Pricing adjustments breakdown
- Clear CTA to review offer
- 30-day acceptance window

### 2. LicenseRenewalReminder.tsx
Stage-appropriate reminders:
- Medium urgency (60 days)
- High urgency (30 days)
- Final notice (7 days) with consequences

### 3. LicenseRenewalComplete.tsx
Confirmation emails for:
- Brand: Renewal confirmed, creators notified
- Creators: Royalty arrangement continues

## Background Job

**Location**: `src/jobs/license-renewal-workflow.job.ts`

Automated daily workflow (runs at 02:00 UTC):

**Phase 1**: Eligibility Scan
- Find licenses within 90 days of expiration
- Mark EXPIRING_SOON (≤30 days)

**Phase 2**: Generate Offers
- Create renewal offers at 90-day mark
- Calculate pricing
- Send initial notification

**Phase 3**: Send Notifications
- Process pending reminders
- Check notification stages
- Track notification logs

**Phase 4**: Auto-Renewals
- Process licenses with `autoRenew=true`
- Validate eligibility
- Create renewal licenses
- Send confirmations

**Phase 5**: Update Analytics
- Calculate daily metrics
- Store to database
- Track pipeline health

## API Endpoints (tRPC)

### `licenses.checkRenewalEligibility`
**Input**: `{ licenseId }`
**Output**: Eligibility context with blocking issues, warnings, metadata
**Access**: Protected (brand, creators, admin)

### `licenses.generateRenewalOffer`
**Input**: `{ licenseId, pricingStrategy?, customAdjustmentPercent? }`
**Output**: `{ offerId, pricing }`
**Access**: Protected (brand, admin)

### `licenses.acceptRenewalOffer`
**Input**: `{ licenseId, offerId }`
**Output**: New renewal license
**Access**: Protected (brand owner only)

### `licenses.getRenewalAnalytics`
**Input**: `{ startDate?, endDate? }`
**Output**: Comprehensive renewal metrics
**Access**: Admin only

### `licenses.getRenewalPipeline`
**Input**: None
**Output**: Current pipeline snapshot
**Access**: Admin only

### `licenses.getBrandRenewalPerformance`
**Input**: `{ brandId }`
**Output**: Brand-specific renewal performance
**Access**: Protected (brand owner or admin)

## Database Schema

### License Table Fields Used
- `autoRenew` (Boolean) - Enable automatic renewal
- `renewalNotifiedAt` (DateTime) - When renewal offer was sent
- `parentLicenseId` (String) - Links renewal to original license
- `metadata` (Json) - Stores renewal offers and notification history

### Metadata Structure
```json
{
  "renewalOffer": {
    "id": "renewal-offer-xxx",
    "licenseId": "lic_xxx",
    "terms": {
      "durationDays": 365,
      "feeCents": 105000,
      "revShareBps": 2500,
      "startDate": "2025-01-15",
      "endDate": "2026-01-15",
      "adjustments": { ... }
    },
    "expiresAt": "2025-12-15",
    "status": "PENDING"
  },
  "renewalNotifications": {
    "initial_offer": {
      "sentAt": "2024-10-15T00:00:00Z",
      "offerId": "renewal-offer-xxx"
    },
    "first_reminder": {
      "sentAt": "2024-11-15T00:00:00Z",
      "daysBeforeExpiration": 60
    }
  }
}
```

## Configuration

### Pricing Configuration
Default settings in `RenewalPricingService`:
```typescript
{
  baseInflationRate: 0.05, // 5% annual
  loyaltyDiscountThresholds: [
    { renewalCount: 2, discountPercent: 5 },
    { renewalCount: 3, discountPercent: 10 },
    { renewalCount: 5, discountPercent: 15 }
  ],
  earlyRenewalDiscount: {
    daysThreshold: 60,
    discountPercent: 5
  },
  capRules: {
    maxIncreasePercent: 25,
    maxDecreasePercent: 20
  },
  minimumFeeCents: 10000 // $100
}
```

### Notification Stages
Default stages in `RenewalNotificationService`:
```typescript
[
  { name: 'initial_offer', daysBeforeExpiration: 90, urgencyLevel: 'medium' },
  { name: 'first_reminder', daysBeforeExpiration: 60, urgencyLevel: 'medium' },
  { name: 'second_reminder', daysBeforeExpiration: 30, urgencyLevel: 'high' },
  { name: 'final_notice', daysBeforeExpiration: 7, urgencyLevel: 'final' }
]
```

## Common Workflows

### Manual Renewal Flow (Brand-initiated)
1. Brand views license approaching expiration
2. System shows eligibility status
3. Brand requests renewal offer
4. System calculates pricing with breakdown
5. Brand reviews and accepts offer
6. New license created, all parties notified

### Automatic Renewal Flow
1. Daily job scans for licenses with `autoRenew=true`
2. At 60 days before expiration, system:
   - Checks eligibility
   - Generates offer automatically
   - Creates renewal license
   - Notifies brand and creators

### Reminder Flow
1. Daily job identifies licenses at notification milestones
2. Checks if notification already sent for this stage
3. Sends stage-appropriate email
4. Logs notification in metadata
5. Tracks opens/clicks via email service

## Monitoring & Alerts

### Key Metrics to Monitor
- **Renewal Rate**: Should be >70%
- **Revenue Retention**: Should be >85%
- **Notification Delivery Rate**: Should be >95%
- **Auto-Renewal Success Rate**: Should be >90%
- **At-Risk Licenses**: Should be <10% of pipeline

### Alert Conditions
- Renewal rate drops below 60%
- More than 10 licenses expiring within 7 days without offers
- Auto-renewal failure rate >10%
- Notification delivery failures >5%

## Troubleshooting

### License not generating renewal offer
1. Check eligibility: `renewalEligibilityService.checkEligibility(licenseId)`
2. Review blocking issues
3. Common causes:
   - Already has renewal in progress
   - Active disputes
   - Brand payment issues
   - IP ownership changes

### Notifications not being sent
1. Check license metadata for notification history
2. Verify email preferences not blocking
3. Check email service logs
4. Verify notification stage timing

### Auto-renewal failing
1. Check license has `autoRenew=true`
2. Verify eligibility passes
3. Check brand has valid payment method
4. Review job logs for specific error

## Security Considerations

- Brand can only accept renewals for their own licenses
- Creators notified of all renewals affecting their IP
- All pricing calculations logged for audit
- Renewal offers expire after 30 days
- IP address and context logged for acceptance

## Performance Considerations

- Eligibility checks cached for 1 hour
- Batch operations for notifications (max 100 per batch)
- Analytics calculated async in background job
- Database indexes on `endDate`, `status`, `renewalNotifiedAt`

## Future Enhancements

Potential additions (not yet implemented):
- A/B testing for notification timing
- Machine learning for pricing optimization
- Renewal incentive campaigns
- Multi-year renewal options
- Bulk renewal management UI
