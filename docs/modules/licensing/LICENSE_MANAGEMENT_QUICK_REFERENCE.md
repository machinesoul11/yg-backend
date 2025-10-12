# License Management Quick Reference

## Overview
Complete guide to the enhanced license management system for YES GODDESS backend.

## Status Lifecycle

```
DRAFT → PENDING_APPROVAL → PENDING_SIGNATURE → ACTIVE → EXPIRING_SOON → EXPIRED
                                                   ↓
                                              RENEWED
                                                   ↓
                                             [New License]

Alternative paths:
- DRAFT → CANCELED (abandoned)
- Any active → TERMINATED (early termination)
- Any active → DISPUTED (conflict)
- Any active → SUSPENDED (payment/compliance issues)
```

## Common Workflows

### 1. License Update (Draft)
```typescript
await licenseService.updateLicenseEnhanced(
  licenseId,
  {
    feeCents: 500000,
    revShareBps: 1500,
    scope: updatedScope,
  },
  {
    userId: brandUserId,
    userRole: 'brand',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }
);
```

### 2. Propose Amendment (Active License)
```typescript
await licenseService.proposeAmendment(
  {
    licenseId,
    amendmentType: 'FINANCIAL',
    justification: 'Increase fee based on campaign performance',
    changes: [
      {
        field: 'feeCents',
        currentValue: 500000,
        proposedValue: 600000,
      },
    ],
    approvalDeadlineDays: 14,
  },
  {
    userId: brandUserId,
    userRole: 'brand',
  }
);
```

### 3. Approve Amendment (Creator)
```typescript
await licenseService.processAmendmentApproval(
  {
    amendmentId,
    action: 'approve',
    comments: 'Approved - increased value delivered',
  },
  {
    userId: creatorUserId,
    userRole: 'creator',
    ipAddress: req.ip,
  }
);
```

### 4. Request Extension
```typescript
await licenseService.requestExtension(
  {
    licenseId,
    extensionDays: 30,
    justification: 'Campaign extended due to success',
  },
  {
    userId: brandUserId,
    userRole: 'brand',
  }
);
```

### 5. Check Renewal Eligibility
```typescript
const eligibility = await licenseService.checkRenewalEligibility(licenseId);

if (eligibility.eligible) {
  // Generate and present offer
  const offerId = await licenseService.generateRenewalOffer(
    licenseId,
    brandUserId
  );
}
```

### 6. Accept Renewal
```typescript
await licenseService.acceptRenewalOffer(
  {
    licenseId,
    offerId,
  },
  brandUserId
);
```

### 7. Transition Status
```typescript
await licenseService.transitionStatus(
  {
    licenseId,
    toStatus: 'PENDING_APPROVAL',
    reason: 'Ready for creator review',
  },
  {
    userId: brandUserId,
    userRole: 'brand',
  }
);
```

### 8. Check Conflicts
```typescript
const conflicts = await licenseService.checkConflictsEnhanced({
  ipAssetId,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  licenseType: 'EXCLUSIVE',
  scope: {
    media: { digital: true, print: false, broadcast: false, ooh: false },
    placement: { social: true, website: true, email: false, paid_ads: true, packaging: false },
  },
});

if (conflicts.hasConflicts) {
  console.log('Conflicts detected:', conflicts.conflicts);
}
```

## Permission Matrix

| Action | DRAFT | PENDING_APPROVAL | ACTIVE | EXPIRED | TERMINATED |
|--------|-------|------------------|--------|---------|------------|
| Update fields | Brand | Brand (limited) | Amendment only | ❌ | ❌ |
| Propose amendment | ❌ | ❌ | Brand/Creator | ❌ | ❌ |
| Request extension | ❌ | ❌ | Brand | ❌ | ❌ |
| Generate renewal | ❌ | ❌ | Brand | Brand | ❌ |
| Terminate | Brand | Brand | Brand/Creator | ❌ | ❌ |
| Transition status | Brand | Creator/Admin | Auto | Auto | ❌ |

## Validation Rules

### Updates
- **DRAFT**: Any field can be updated by brand
- **PENDING_APPROVAL**: Only metadata, autoRenew (limited)
- **ACTIVE**: Must use amendment workflow for critical fields
- Fee changes >20% require amendment
- Rev share changes >20% require amendment
- Scope changes always require amendment

### Amendments
- Requires justification (min 10 chars)
- All affected parties must approve
- Default 14-day deadline
- Sequential numbering per license
- Cannot amend terminated licenses

### Extensions
- Max 365 days (use renewal for longer)
- Auto-approval for <30 days
- Pro-rated fee calculation
- Conflict checking required
- Only ACTIVE or EXPIRING_SOON licenses

### Renewals
- Eligibility window: 90 days before expiry
- Cannot renew already renewed licenses
- 30-day acceptance window
- Auto-renewal at 60 days (if enabled)
- Adjustments: loyalty, early renewal, performance

### Conflicts
- Exclusive blocks all same-timeframe
- Territory-exclusive blocks territories
- Revenue share warnings >80%
- Media exclusivity per type
- Placement exclusivity

## Background Jobs

### License Management Job (Daily 02:00 UTC)
```typescript
import { licenseManagementJob } from '@/jobs/license-management.job';

// Processes:
// 1. Automated status transitions
//    - ACTIVE → EXPIRING_SOON (30 days)
//    - EXPIRING_SOON → EXPIRED (past end date)
//    - DRAFT → CANCELED (>90 days old)
// 2. Auto-renewals (60 days before expiry)
```

## Analytics Queries

### Status Distribution
```typescript
const distribution = await licenseService.getStatusDistribution(brandId);
// Returns: [{ status: 'ACTIVE', count: 42 }, ...]
```

### Extension Metrics
```typescript
const metrics = await licenseService.getExtensionAnalytics(brandId);
// Returns: { total_extensions, approved, rejected, avg_extension_days, total_additional_fees_cents }
```

### Amendment History
```typescript
const history = await licenseService.getAmendmentHistory(licenseId);
// Returns timeline of all amendments
```

### Status History
```typescript
const history = await licenseService.getStatusHistory(licenseId);
// Returns all status transitions with timestamps
```

## Error Handling

### Common Errors
- `LicenseNotFoundError`: License doesn't exist
- `LicensePermissionError`: User lacks permission
- `LicenseValidationError`: Invalid input data
- `LicenseConflictError`: Conflicts detected

### Error Response Format
```typescript
{
  code: 'FORBIDDEN',
  message: 'Only the brand owner can update draft licenses',
  cause?: { /* additional context */ }
}
```

## Audit Logging

All operations are automatically logged:
- Entity: `license`
- Actions: `update`, `amendment_proposed`, `amendment_approved`, `extension_requested`, `status_transition`, etc.
- Includes: `before` and `after` states, user context, IP address

Query audit logs:
```typescript
const history = await auditService.getHistory('license', licenseId);
```

## Best Practices

1. **Always validate eligibility before operations**
   ```typescript
   const eligibility = await licenseService.checkRenewalEligibility(licenseId);
   if (!eligibility.eligible) {
     return { error: eligibility.reasons };
   }
   ```

2. **Use conflict preview before creation**
   ```typescript
   const preview = await licenseService.getConflictPreview(ipAssetId);
   // Show user what's available
   ```

3. **Provide context for audit trail**
   ```typescript
   const context = {
     userId: req.user.id,
     userRole: req.user.role,
     ipAddress: req.ip,
     userAgent: req.headers['user-agent'],
     reason: 'User-provided justification',
   };
   ```

4. **Handle conflicts gracefully**
   ```typescript
   try {
     await createLicense(data);
   } catch (error) {
     if (error.name === 'LicenseConflictError') {
       // Show conflicts to user with resolution options
       return { conflicts: error.conflicts };
     }
     throw error;
   }
   ```

5. **Monitor background jobs**
   - Check job logs daily
   - Alert on high failure rates
   - Track processing times

## Migration Checklist

- [ ] Run Prisma migration: `npm run prisma:migrate`
- [ ] Generate Prisma client: `npm run prisma:generate`
- [ ] Update router with new endpoints
- [ ] Register background jobs
- [ ] Update frontend to use new features
- [ ] Create email templates
- [ ] Write integration tests
- [ ] Update API documentation
- [ ] Train support staff
- [ ] Monitor initial rollout

## Support

For issues or questions:
1. Check audit logs for operation history
2. Review status history for lifecycle
3. Check conflict detection logs
4. Review background job outputs
5. Escalate to engineering if needed
