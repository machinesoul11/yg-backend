# IP Ownership Dispute Handling Implementation

## Overview

This document describes the implementation of ownership dispute handling for the IP Ownership Management system, completing the roadmap requirements.

## Database Schema Changes

### Added Fields to `ip_ownerships` Table

```sql
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS disputed BOOLEAN DEFAULT FALSE;
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS dispute_reason TEXT;
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS disputed_by TEXT;
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE ip_ownerships ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_ip_ownerships_disputed ON ip_ownerships(disputed);
```

### Prisma Schema Changes

```prisma
model IpOwnership {
  // ...existing fields...
  disputed          Boolean       @default(false)
  disputedAt        DateTime?     @map("disputed_at")
  disputeReason     String?       @map("dispute_reason")
  disputedBy        String?       @map("disputed_by")
  resolvedAt        DateTime?     @map("resolved_at")
  resolvedBy        String?       @map("resolved_by")
  resolutionNotes   String?       @map("resolution_notes")
  // ...rest of fields...

  @@index([disputed])
}
```

## Features Implemented

### 1. Ownership Assignment Logic ✅
**Status: Already Implemented**
- `IpOwnershipService.createOwnership()` - Create single ownership records
- `IpOwnershipService.setAssetOwnership()` - Atomic multi-owner operations
- Validates creator and asset existence
- Tracks created_by and updated_by

### 2. Ownership Split Validation ✅
**Status: Already Implemented**
- `IpOwnershipService.validateOwnershipSplit()` - Validates splits sum to 10,000 BPS
- `IpOwnershipService.checkOwnershipConflicts()` - Checks for conflicts
- `IpOwnershipService.validateTemporalOwnership()` - **NEW** Enhanced temporal validation for overlapping periods
- Enforced in all create/update operations
- Atomic transactions prevent race conditions

### 3. Ownership Update Service ✅
**Status: Already Implemented**
- `IpOwnershipService.updateOwnership()` - Update existing ownership records
- Re-validates split when shareBps changes
- Handles temporal changes (startDate/endDate)
- Audit logging for all changes

### 4. Ownership History Tracking ✅
**Status: Already Implemented**
- `IpOwnershipService.getOwnershipHistory()` - Complete ownership timeline
- `IpOwnershipService.getAssetOwners()` - Query ownership at specific date
- `IpOwnershipService.getAssetOwnershipSummary()` - Current ownership snapshot
- Full audit trail via `audit_events` table

### 5. Ownership Dispute Handling ✅
**Status: NEWLY IMPLEMENTED**

#### Flag Dispute
- `IpOwnershipService.flagDispute()` - Mark ownership as disputed
- Permissions: Admin or the creator themselves
- Creates audit log entry
- Sends notifications to:
  - Creator whose ownership is disputed
  - Co-owners of the asset
  - All administrators
- Prevents disputing already-resolved disputes

#### Resolve Dispute
- `IpOwnershipService.resolveDispute()` - Resolve disputes (admin only)
- Three resolution actions:
  - **CONFIRM**: Clear dispute flags, ownership remains unchanged
  - **MODIFY**: Update ownership details (with validation)
  - **REMOVE**: End the ownership (set endDate)
- Full audit trail of resolution
- Notifications sent to all stakeholders

#### Query Disputes
- `IpOwnershipService.getDisputedOwnerships()` - List all disputed ownerships
- Filters: ipAssetId, creatorId, includeResolved
- Admin-only access

### 6. Ownership Transfer Logic ✅
**Status: Already Implemented**
- `IpOwnershipService.transferOwnership()` - Transfer shares between creators
- Supports full and partial transfers
- Validates sufficient ownership before transfer
- Creates new records, ends old ones
- Comprehensive audit logging
- Permission checks

## API Endpoints (tRPC)

### New Dispute Endpoints

#### `ipOwnership.flagDispute`
```typescript
await trpc.ipOwnership.flagDispute.mutate({
  ownershipId: 'ownership_123',
  reason: 'Ownership percentage does not match contract agreement',
  supportingDocuments: ['https://storage.example.com/contract.pdf'],
});
```

#### `ipOwnership.resolveDispute`
```typescript
// CONFIRM - ownership is correct as-is
await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'ownership_123',
  action: 'CONFIRM',
  resolutionNotes: 'Verified against signed contract, ownership is correct',
});

// MODIFY - update ownership details
await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'ownership_123',
  action: 'MODIFY',
  resolutionNotes: 'Updated share based on amendment',
  modifiedData: {
    shareBps: 4000, // Change from previous value
  },
});

// REMOVE - end the ownership
await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'ownership_123',
  action: 'REMOVE',
  resolutionNotes: 'Ownership found to be invalid, removing from system',
});
```

#### `ipOwnership.getDisputedOwnerships`
```typescript
const { data } = await trpc.ipOwnership.getDisputedOwnerships.query({
  includeResolved: false, // Only active disputes
});
```

## Notification System Integration

### Dispute Flagged Notifications
- **Creator** (disputed ownership): High priority, direct action link
- **Co-owners**: Medium priority, informational
- **Admins**: High priority, requires resolution action

### Dispute Resolved Notifications
- **Creator** (disputed ownership): High priority with resolution details
- **Co-owners**: Medium priority, informational

## Enhanced Validation

### Temporal Ownership Validation
**NEW Feature**: `validateTemporalOwnership()`

Ensures no overlapping ownership periods exceed 100% of shares:
- Extracts all time boundaries from ownership records
- Creates time segments between boundaries
- Validates each segment independently
- Catches edge cases like:
  - Overlapping ownership periods
  - Gaps in ownership coverage
  - Future-dated ownership conflicts

## Authorization

### Permission Model
- **Flag Dispute**: Admin OR the creator themselves
- **Resolve Dispute**: Admin only
- **View Disputes**: Admin only (for security and privacy)

## Audit Trail

All dispute operations create detailed audit events:
- **IP_OWNERSHIP_DISPUTED** - When flagged
- **IP_OWNERSHIP_DISPUTE_RESOLVED** - When resolved

Audit events include:
- `beforeJson`: State before change
- `afterJson`: State after change
- User ID, timestamp, action type

## Error Handling

Custom error classes for dispute operations:
- `OwnershipValidationError` - Validation failures
- Already defined in existing error classes

## Migration Guide

### To Apply Database Changes

```bash
# Option 1: Use Prisma migrate (recommended)
npx prisma migrate dev --name add_ownership_dispute_fields

# Option 2: Apply SQL directly to existing database
psql $DATABASE_URL < migrations/add_ownership_dispute_fields.sql
```

### Generate Updated Types
```bash
npx prisma generate
```

## Testing Recommendations

### Unit Tests
- Dispute flagging with various permissions
- Dispute resolution with all three actions (CONFIRM, MODIFY, REMOVE)
- Temporal validation with overlapping periods
- Notification delivery

### Integration Tests
- Full dispute lifecycle (flag → resolve)
- Multiple concurrent disputes on same asset
- Modified share validation during resolution
- Audit log completeness

### Edge Cases
- Disputing already-disputed ownership
- Resolving non-disputed ownership
- Invalid modified data during MODIFY resolution
- Permission checks for non-admin users

## Compliance Considerations

### Legal Defensibility
- Complete audit trail of all disputes and resolutions
- Immutable history (disputes are marked resolved, not deleted)
- Supporting documents can be attached to disputes
- Resolution notes provide legal justification

### GDPR/Privacy
- Dispute reasons and notes may contain personal data
- Consider retention policies for resolved disputes
- Admin-only access protects sensitive information

## Performance Considerations

### Database Indexes
- `disputed` field indexed for fast dispute queries
- Existing indexes on `ipAssetId`, `creatorId` support notifications
- Temporal queries use composite index on (ipAssetId, startDate, endDate)

### Caching
- Dispute queries NOT cached (need real-time data)
- Ownership queries cache invalidated when disputes flagged/resolved

## Future Enhancements

### Potential Additions
1. **Dispute Comments**: Thread-based discussion on disputes
2. **Escalation**: Auto-escalate unresolved disputes after X days
3. **Mediation**: Third-party mediator role for disputes
4. **Templates**: Common dispute reasons and resolutions
5. **Analytics**: Dispute metrics dashboard for admins

## Completion Status

| Requirement | Status | Implementation |
|------------|--------|----------------|
| Create ownership assignment logic | ✅ Complete | `createOwnership()`, `setAssetOwnership()` |
| Implement ownership split validation | ✅ Complete | `validateOwnershipSplit()`, enforced in all operations |
| Build ownership update service | ✅ Complete | `updateOwnership()` with validation |
| Add ownership history tracking | ✅ Complete | `getOwnershipHistory()`, audit logging |
| Create ownership dispute handling | ✅ Complete | `flagDispute()`, `resolveDispute()`, `getDisputedOwnerships()` |
| Implement ownership transfer logic | ✅ Complete | `transferOwnership()` with full/partial support |

All roadmap requirements for IP Ownership Management have been implemented.
