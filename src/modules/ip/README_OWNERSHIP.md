# IP Ownership Module

**The cornerstone of YES GODDESS's creator sovereignty** - precise ownership tracking for intellectual property assets.

---

## Overview

This module manages IP ownership splits, enabling:
- Multiple creators to co-own assets with exact percentage splits
- Time-bound ownership changes (derivatives, transfers)
- Immutable audit trails for legal defensibility
- Atomic ownership operations (all-or-nothing)
- Direct integration with royalty calculation engine

**Core Principle:** Every asset must have ownership totaling exactly 100% (10,000 basis points).

---

## Quick Start

### Setting Asset Ownership

```typescript
import { IpOwnershipService } from '@/modules/ip/services/ip-ownership.service';

const ownershipService = new IpOwnershipService(prisma);

// Set 60/40 split between two creators
await ownershipService.setAssetOwnership(
  'asset_123',
  [
    {
      creatorId: 'creator_1',
      shareBps: 6000, // 60%
      ownershipType: 'CONTRIBUTOR',
    },
    {
      creatorId: 'creator_2',
      shareBps: 4000, // 40%
      ownershipType: 'CONTRIBUTOR',
    },
  ],
  'user_id'
);
```

### Querying Ownership

```typescript
// Get current owners
const owners = await ownershipService.getAssetOwners({
  ipAssetId: 'asset_123',
});

// Get ownership at specific date (historical)
const pastOwners = await ownershipService.getAssetOwners({
  ipAssetId: 'asset_123',
  atDate: new Date('2025-01-01'),
});

// Get ownership summary
const summary = await ownershipService.getAssetOwnershipSummary('asset_123');
console.log(summary.totalBps); // 10000
console.log(summary.hasMultipleOwners); // true
```

### Transferring Ownership

```typescript
await ownershipService.transferOwnership(
  'from_creator_id',
  'to_creator_id',
  'asset_123',
  2000, // Transfer 20% (2000 BPS)
  'user_id',
  {
    contractReference: 'AGREEMENT-2025-001',
    legalDocUrl: 'https://storage.yesgoddess.com/contracts/001.pdf',
  }
);
```

---

## API Endpoints (tRPC)

### Mutations

#### `ipOwnership.setOwnership`
Set complete ownership split for an asset (atomic).

```typescript
const result = await trpc.ipOwnership.setOwnership.mutate({
  ipAssetId: 'asset_123',
  ownerships: [
    { creatorId: 'creator_1', shareBps: 5000, ownershipType: 'PRIMARY' },
    { creatorId: 'creator_2', shareBps: 5000, ownershipType: 'CONTRIBUTOR' },
  ],
  effectiveDate: new Date(), // Optional
});
```

#### `ipOwnership.transferOwnership`
Transfer ownership shares between creators.

```typescript
const result = await trpc.ipOwnership.transferOwnership.mutate({
  ipAssetId: 'asset_123',
  toCreatorId: 'creator_2',
  shareBps: 1000, // Transfer 10%
  contractReference: 'TRANSFER-001',
});
```

#### `ipOwnership.endOwnership`
End an ownership record (sets endDate).

```typescript
await trpc.ipOwnership.endOwnership.mutate({
  id: 'ownership_id',
});
```

### Queries

#### `ipOwnership.getOwners`
Get current owners of an asset.

```typescript
const { data, meta } = await trpc.ipOwnership.getOwners.query({
  ipAssetId: 'asset_123',
  atDate: new Date('2025-01-01'), // Optional: historical query
});

console.log(meta.totalBps); // 10000
console.log(meta.ownerCount); // 2
```

#### `ipOwnership.getSummary`
Get ownership summary with percentages.

```typescript
const { data } = await trpc.ipOwnership.getSummary.query({
  ipAssetId: 'asset_123',
});
```

#### `ipOwnership.getHistory`
Get complete ownership history for an asset.

```typescript
const { data } = await trpc.ipOwnership.getHistory.query({
  ipAssetId: 'asset_123',
});
```

#### `ipOwnership.validateSplit`
Validate an ownership split without saving.

```typescript
const { data } = await trpc.ipOwnership.validateSplit.query({
  ownerships: [
    { creatorId: 'creator_1', shareBps: 6000, ownershipType: 'PRIMARY' },
    { creatorId: 'creator_2', shareBps: 4000, ownershipType: 'CONTRIBUTOR' },
  ],
});

if (!data.isValid) {
  console.error(data.errors);
}
```

#### `ipOwnership.getCreatorAssets`
Get all assets owned by a creator.

```typescript
const { data } = await trpc.ipOwnership.getCreatorAssets.query({
  creatorId: 'creator_123',
  includeExpired: false,
  ownershipType: 'PRIMARY', // Optional filter
});
```

---

## Ownership Dispute Handling

### Flagging Disputes

When ownership percentages or terms are contested:

```typescript
// Creator or admin flags a dispute
await trpc.ipOwnership.flagDispute.mutate({
  ownershipId: 'ownership_123',
  reason: 'Ownership percentage does not match the signed contract',
  supportingDocuments: ['https://storage.yesgoddess.com/contracts/agreement.pdf'],
});
```

**Who can flag disputes:**
- The creator whose ownership is in question
- Platform administrators

**What happens:**
- Ownership record is marked as `disputed: true`
- Notifications sent to:
  - Creator whose ownership is disputed (HIGH priority)
  - All co-owners of the asset (MEDIUM priority)
  - All administrators (HIGH priority)
- Full audit trail created
- Dispute remains active until admin resolves

### Resolving Disputes (Admin Only)

Administrators can resolve disputes in three ways:

#### 1. CONFIRM - Ownership is correct as-is
```typescript
await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'ownership_123',
  action: 'CONFIRM',
  resolutionNotes: 'Verified against signed contract dated 2025-01-15. Ownership split is correct.',
});
```

#### 2. MODIFY - Update ownership details
```typescript
await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'ownership_123',
  action: 'MODIFY',
  resolutionNotes: 'Updated share percentage based on contract amendment',
  modifiedData: {
    shareBps: 4000, // Changed from 5000
    contractReference: 'AMENDMENT-2025-002',
  },
});
```

**Note:** Modified shares are validated to ensure total still equals 10,000 BPS.

#### 3. REMOVE - End the ownership
```typescript
await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'ownership_123',
  action: 'REMOVE',
  resolutionNotes: 'Ownership found to be fraudulent. Removed from system per legal review.',
});
```

**Note:** This sets `endDate` to now, preserving the record for audit purposes.

### Viewing Disputed Ownerships (Admin Dashboard)

```typescript
// Get all active disputes
const { data } = await trpc.ipOwnership.getDisputedOwnerships.query({
  includeResolved: false,
});

// Get disputes for specific asset
const assetDisputes = await trpc.ipOwnership.getDisputedOwnerships.query({
  ipAssetId: 'asset_123',
  includeResolved: true, // Include history
});
```

### Dispute Workflow

```
Creator/Admin flags dispute
         ↓
Notifications sent to stakeholders
         ↓
Admin reviews supporting documents
         ↓
Admin takes action (CONFIRM/MODIFY/REMOVE)
         ↓
Resolution notifications sent
         ↓
Audit trail updated
```

### Dispute Business Rules

1. **Cannot dispute resolved disputes** - Once resolved, dispute is final
2. **Admin-only resolution** - Only platform admins can resolve
3. **Validation on MODIFY** - Modified shares must still total 10,000 BPS
4. **Immutable history** - Disputed records are never deleted, only marked resolved
5. **Notification cascade** - All stakeholders notified at each step

### Dispute Data Structure

```typescript
interface IpOwnershipResponse {
  // ...existing fields...
  
  // Dispute fields
  disputed: boolean;
  disputedAt: string | null;
  disputeReason: string | null;
  disputedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}
```

---

## Database Schema

```prisma
model IpOwnership {
  id                String        @id @default(cuid())
  ipAssetId         String
  creatorId         String
  shareBps          Int           // 1-10000 (0.01%-100%)
  ownershipType     OwnershipType @default(PRIMARY)
  startDate         DateTime      @default(now())
  endDate           DateTime?     // null = perpetual
  contractReference String?
  legalDocUrl       String?
  notes             Json?         @db.JsonB
  
  // Dispute tracking
  disputed          Boolean       @default(false)
  disputedAt        DateTime?
  disputeReason     String?
  disputedBy        String?
  resolvedAt        DateTime?
  resolvedBy        String?
  resolutionNotes   String?
  
  createdBy         String
  updatedBy         String
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  
  @@index([disputed])
  @@map("ip_ownerships")
}
```

---

## Ownership Types

### PRIMARY
Original creator of the work.
- Default type for sole creator
- Typically starts at 10,000 BPS (100%)

### CONTRIBUTOR
Collaborator on original work.
- Used when multiple creators co-create
- Example: Photographer (6000 BPS) + Stylist (4000 BPS)

### DERIVATIVE
Creator of derivative work.
- Original creator retains rights
- Derivative creator owns the derivative
- Example: Original art + Remix

### TRANSFERRED
Ownership transferred from another creator.
- Created when shares are sold/gifted
- Maintains audit trail of transfers

---

## Basis Points (BPS) System

- **1 BPS** = 0.01%
- **100 BPS** = 1%
- **10,000 BPS** = 100%

### Why Basis Points?
1. **Precision:** Avoids floating-point errors
2. **Integer Math:** Fast calculations
3. **Industry Standard:** Financial industry standard

### Common Splits

| Split | BPS Values |
|-------|------------|
| 100% sole owner | 10000 |
| 50/50 split | 5000, 5000 |
| 60/40 split | 6000, 4000 |
| 33.33% each (3 creators) | 3333, 3333, 3334 |
| 25% each (4 creators) | 2500, 2500, 2500, 2500 |

---

## Best Practices

### ✅ DO

```typescript
// Use setAssetOwnership for atomic updates
await ownershipService.setAssetOwnership(ipAssetId, ownerships, userId);

// Always validate before UI submission
const validation = ownershipService.validateOwnershipSplit(ownerships);

// Query at specific dates for historical data
const owners = await ownershipService.getAssetOwners({ 
  ipAssetId, 
  atDate: periodStart 
});

// Link to legal documents
await ownershipService.setAssetOwnership(ipAssetId, ownerships, userId, {
  contractReference: 'AGREEMENT-2025-001',
  legalDocUrl: 'https://storage.../contract.pdf',
});
```

### ❌ DON'T

```typescript
// Don't create ownerships separately (use setAssetOwnership)
await ownershipService.createOwnership(ownership1, userId);
await ownershipService.createOwnership(ownership2, userId); // ❌

// Don't delete records (use deleteOwnership which sets endDate)
await prisma.ipOwnership.delete({ where: { id } }); // ❌

// Don't allow splits that don't sum to 10,000
const invalid = [
  { creatorId: 'c1', shareBps: 6000 },
  { creatorId: 'c2', shareBps: 3000 }, // ❌ Only 9000 total
];
```

---

## Integration with Royalties

```typescript
// In royalty calculation service
async function calculateCreatorRoyalties(
  licenseRevenue: number,
  ipAssetId: string,
  periodStart: Date
) {
  // Get ownership at START of period (prevents gaming)
  const ownerships = await ownershipService.getAssetOwners({
    ipAssetId,
    atDate: periodStart,
  });
  
  // Calculate each owner's share
  return ownerships.map(ownership => ({
    creatorId: ownership.creatorId,
    revenueCents: licenseRevenue,
    shareBps: ownership.shareBps,
    calculatedRoyaltyCents: Math.floor(
      (licenseRevenue * ownership.shareBps) / 10000
    ),
  }));
}
```

---

## Error Handling

### OwnershipValidationError
Thrown when ownership split doesn't sum to 10,000 BPS.

```typescript
try {
  await ownershipService.setAssetOwnership(...);
} catch (error) {
  if (error instanceof OwnershipValidationError) {
    console.error(error.details.providedBps); // Actual sum
    console.error(error.details.missingBps);  // How much missing
  }
}
```

### InsufficientOwnershipError
Thrown when creator doesn't have enough shares for transfer.

```typescript
try {
  await ownershipService.transferOwnership(...);
} catch (error) {
  if (error instanceof InsufficientOwnershipError) {
    console.error(error.details.requiredBps);   // What was requested
    console.error(error.details.availableBps);  // What they have
  }
}
```

### UnauthorizedOwnershipError
Thrown when user doesn't have permission.

```typescript
try {
  await ownershipService.setAssetOwnership(...);
} catch (error) {
  if (error instanceof UnauthorizedOwnershipError) {
    // User doesn't own this asset
  }
}
```

---

## Caching

The service uses Redis caching for performance:

```typescript
// Cache keys
OWNERSHIP_CACHE_KEYS = {
  activeByAsset: (ipAssetId) => `ownership:asset:${ipAssetId}:active`,
  byCreator: (creatorId) => `ownership:creator:${creatorId}:assets`,
  history: (ipAssetId) => `ownership:asset:${ipAssetId}:history`,
};

// TTLs
CACHE_TTL_ACTIVE = 900; // 15 minutes
CACHE_TTL_HISTORY = 300; // 5 minutes
```

Cache is automatically invalidated on ownership changes.

---

## Testing

### Unit Tests
```bash
# Run ownership service tests
npm test -- ip-ownership.service.test.ts
```

### Integration Tests
```bash
# Run API tests
npm test -- ip-ownership.api.test.ts
```

---

## Files

```
src/modules/ip/
  schemas/
    ownership.schema.ts          # Zod validation schemas
  types/
    ownership.types.ts           # TypeScript types
  errors/
    ownership.errors.ts          # Custom error classes
  services/
    ip-ownership.service.ts      # Business logic
  routers/
    ip-ownership.router.ts       # tRPC API endpoints

prisma/
  migrations/
    add_ownership_constraint.sql # Database constraint

scripts/
  apply-ownership-constraint.sh  # Apply constraint script
```

---

## Security

### Row-Level Access Control
- **ADMIN:** Can view/modify all ownerships
- **CREATOR:** Can only view/modify assets they own
- **BRAND:** No direct ownership access

### Audit Trail
All ownership changes are logged to `audit_events`:
```typescript
{
  action: 'IP_OWNERSHIP_SET',
  userId: 'user_123',
  beforeJson: [...previousOwnerships],
  afterJson: [...newOwnerships],
}
```

---

## Legal Compliance

### Immutable Records
- Never delete ownership records
- Always create new records with `endDate` on previous
- Maintains complete audit trail for disputes

### Contract Linking
```typescript
{
  contractReference: 'AGREEMENT-2025-001-JD-YG',
  legalDocUrl: 'https://storage.../signed.pdf',
  notes: {
    signedDate: '2025-01-15T10:30:00Z',
    signatories: ['creator@example.com', 'admin@yesgoddess.com'],
    terms: '50/50 split on all derivative works',
  }
}
```

---

##Support

For issues or questions:
- Technical: See [IP_OWNERSHIP_MODULE_COMPLETE.md](../docs/IP_OWNERSHIP_MODULE_COMPLETE.md)
- Business Logic: Contact platform admin
- Legal: Consult with legal team before modifying ownership

---

**Module Status:** ✅ Complete  
**Production Ready:** ⚠️ Pending tests & auth integration  
**Last Updated:** October 10, 2025
