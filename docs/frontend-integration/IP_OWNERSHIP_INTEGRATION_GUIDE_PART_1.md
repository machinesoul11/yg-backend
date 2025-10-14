# IP Ownership Management - Frontend Integration Guide (Part 1)

**Classification:** 🌐 SHARED  
**Module:** IP Ownership Management  
**Last Updated:** January 13, 2025  
**API Version:** v1

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [API Endpoints Reference](#api-endpoints-reference)
- [TypeScript Type Definitions](#typescript-type-definitions)
- [Request/Response Examples](#requestresponse-examples)
- [Authentication & Authorization](#authentication--authorization)

---

## Overview

The IP Ownership Management module is the cornerstone of the YesGoddess platform's royalty calculation system. It manages creator ownership shares in IP assets, ensuring:

- **100% Ownership Accountability**: All ownership splits must sum to exactly 10,000 basis points (100%)
- **Temporal Tracking**: Complete history of ownership changes over time
- **Dispute Resolution**: Built-in mechanisms for handling ownership disputes
- **Transfer Logic**: Support for full and partial ownership transfers between creators
- **Legal Documentation**: Links to contracts and legal documents

### Key Concepts

- **Basis Points (BPS)**: Ownership is measured in basis points where 10,000 BPS = 100%
- **Atomic Operations**: Ownership changes happen in transactions to maintain consistency
- **Temporal Ownership**: Ownership records have start/end dates for historical tracking
- **Ownership Types**: PRIMARY, CONTRIBUTOR, DERIVATIVE, TRANSFERRED

---

## Architecture

### Tech Stack
- **Backend**: Next.js 14 + tRPC + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **API Pattern**: tRPC (type-safe RPC)
- **Authentication**: NextAuth.js with JWT sessions
- **Base URL**: `https://ops.yesgoddess.agency/api/trpc`

### Data Flow
```
Frontend (yesgoddess-web)
    ↓ tRPC Client
Backend API (yg-backend)
    ↓ IpOwnershipService
Database (PostgreSQL)
```

---

## API Endpoints Reference

All endpoints are accessed through the tRPC router at namespace `ipOwnership.*`

### Base URL Structure
```
POST https://ops.yesgoddess.agency/api/trpc/ipOwnership.<procedureName>
```

### Available Procedures

| Procedure | Type | Description | Auth Required |
|-----------|------|-------------|---------------|
| `setOwnership` | Mutation | Set complete ownership split (atomic) | ✅ Yes |
| `getOwners` | Query | Get current owners of an asset | ✅ Yes |
| `getSummary` | Query | Get ownership summary | ✅ Yes |
| `getHistory` | Query | Get ownership change history | ✅ Yes (Owner or Admin) |
| `transferOwnership` | Mutation | Transfer shares between creators | ✅ Yes (Owner) |
| `validateSplit` | Query | Validate split without saving | ✅ Yes |
| `endOwnership` | Mutation | End an ownership record | ✅ Yes (Admin) |
| `getCreatorAssets` | Query | Get assets owned by creator | ✅ Yes |
| `flagDispute` | Mutation | Flag ownership as disputed | ✅ Yes (Owner or Admin) |
| `resolveDispute` | Mutation | Resolve an ownership dispute | ✅ Yes (Admin Only) |
| `getDisputedOwnerships` | Query | Get all disputed ownerships | ✅ Yes (Admin Only) |

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Ownership Type Enum
 */
enum OwnershipType {
  PRIMARY = 'PRIMARY',           // Original creator
  CONTRIBUTOR = 'CONTRIBUTOR',   // Contributing creator
  DERIVATIVE = 'DERIVATIVE',     // Derivative work creator
  TRANSFERRED = 'TRANSFERRED'    // Received via transfer
}

/**
 * Main ownership response type
 */
interface IpOwnershipResponse {
  id: string;
  ipAssetId: string;
  creatorId: string;
  shareBps: number;                    // Basis points (1-10000)
  sharePercentage: number;             // Computed: shareBps / 100
  ownershipType: OwnershipType;
  startDate: string;                   // ISO 8601
  endDate: string | null;              // ISO 8601 or null for perpetual
  contractReference: string | null;
  legalDocUrl: string | null;
  notes: Record<string, any> | null;
  
  // Dispute fields
  disputed: boolean;
  disputedAt: string | null;
  disputeReason: string | null;
  disputedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  
  // Relations (optional)
  creator?: CreatorSummary;
  
  // Computed
  isActive: boolean;                   // Whether currently active
  isPerpetual: boolean;                // Whether endDate is null
}

/**
 * Creator summary
 */
interface CreatorSummary {
  id: string;
  userId: string;
  stageName: string;
  verificationStatus: string;
}

/**
 * Ownership summary for an asset
 */
interface AssetOwnershipSummary {
  ipAssetId: string;
  owners: OwnershipSummary[];
  totalBps: number;                    // Should always be 10000
  ownerCount: number;
  hasMultipleOwners: boolean;
}

interface OwnershipSummary {
  creatorId: string;
  creatorName: string;
  shareBps: number;
  sharePercentage: number;
  ownershipType: OwnershipType;
}

/**
 * Ownership history entry
 */
interface OwnershipHistoryEntry {
  ownership: IpOwnershipResponse;
  changeType: 'CREATED' | 'UPDATED' | 'ENDED' | 'TRANSFERRED' | 'DISPUTED' | 'RESOLVED';
  changedAt: string;
  changedBy: string;
}

/**
 * Transfer result
 */
interface OwnershipTransferResult {
  fromOwnership: IpOwnershipResponse;
  toOwnership: IpOwnershipResponse;
  transferredBps: number;
}

/**
 * Validation result
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Dispute resolution result
 */
interface DisputeResolutionResult {
  ownershipId: string;
  action: 'CONFIRM' | 'MODIFY' | 'REMOVE';
  resolvedAt: string;
  resolvedBy: string;
  updatedOwnership?: IpOwnershipResponse;
}
```

### Input Types

```typescript
/**
 * Ownership split input (single creator)
 */
interface OwnershipSplitInput {
  creatorId: string;
  shareBps: number;                    // 1-10000
  ownershipType: OwnershipType;
  contractReference?: string;
  legalDocUrl?: string;
  notes?: Record<string, any>;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Set ownership input
 */
interface SetAssetOwnershipInput {
  ipAssetId: string;
  ownerships: OwnershipSplitInput[];   // Must sum to 10000 BPS
  effectiveDate?: Date;
}

/**
 * Transfer ownership input
 */
interface TransferOwnershipInput {
  ipAssetId: string;
  toCreatorId: string;
  shareBps: number;                    // Amount to transfer
  contractReference?: string;
  legalDocUrl?: string;
  notes?: Record<string, any>;
}

/**
 * Get owners filters
 */
interface GetOwnersInput {
  ipAssetId: string;
  atDate?: Date;                       // Query ownership at specific date
  includeCreatorDetails?: boolean;     // Default: true
}

/**
 * Get creator assets filters
 */
interface GetCreatorAssetsInput {
  creatorId: string;
  includeExpired?: boolean;            // Default: false
  ownershipType?: OwnershipType;
}

/**
 * Flag dispute input
 */
interface FlagDisputeInput {
  ownershipId: string;
  reason: string;                      // 10-1000 characters
  supportingDocuments?: string[];      // URLs to supporting docs
}

/**
 * Resolve dispute input
 */
interface ResolveDisputeInput {
  ownershipId: string;
  action: 'CONFIRM' | 'MODIFY' | 'REMOVE';
  resolutionNotes: string;             // 10-2000 characters
  modifiedData?: {
    shareBps?: number;
    ownershipType?: OwnershipType;
    startDate?: Date;
    endDate?: Date;
  };
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

/**
 * Single ownership split schema
 */
export const ownershipSplitSchema = z.object({
  creatorId: z.string().cuid('Invalid creator ID format'),
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point (0.01%)')
    .max(10000, 'Share cannot exceed 10,000 basis points (100%)'),
  ownershipType: z.enum(['PRIMARY', 'CONTRIBUTOR', 'DERIVATIVE', 'TRANSFERRED']),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url('Legal document must be a valid URL').optional(),
  notes: z.record(z.any()).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || data.startDate < data.endDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

/**
 * Array of ownership splits - must sum to 10,000 BPS
 */
export const ownershipSplitArraySchema = z.array(ownershipSplitSchema)
  .min(1, 'At least one owner is required')
  .refine(
    (ownerships) => {
      const totalBps = ownerships.reduce((sum, o) => sum + o.shareBps, 0);
      return totalBps === 10000;
    },
    { 
      message: 'Total ownership must equal 100% (10,000 basis points)',
      path: ['root']
    }
  );

/**
 * Set asset ownership schema
 */
export const setAssetOwnershipSchema = z.object({
  ipAssetId: z.string().cuid('Invalid IP asset ID format'),
  ownerships: ownershipSplitArraySchema,
  effectiveDate: z.date().optional(),
});

/**
 * Transfer ownership schema
 */
export const transferOwnershipSchema = z.object({
  ipAssetId: z.string().cuid('Invalid IP asset ID format'),
  toCreatorId: z.string().cuid('Invalid creator ID format'),
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point (0.01%)')
    .max(10000, 'Share cannot exceed 10,000 basis points (100%)'),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url().optional(),
  notes: z.record(z.any()).optional(),
});
```

---

## Request/Response Examples

### 1. Set Ownership (Create/Update Complete Split)

**Use Case**: Setting initial ownership or completely replacing ownership split

```typescript
// Request
const result = await trpc.ipOwnership.setOwnership.mutate({
  ipAssetId: 'clx123abc456',
  ownerships: [
    {
      creatorId: 'creator_1',
      shareBps: 6000,  // 60%
      ownershipType: 'PRIMARY',
    },
    {
      creatorId: 'creator_2',
      shareBps: 4000,  // 40%
      ownershipType: 'CONTRIBUTOR',
    },
  ],
  effectiveDate: new Date('2025-01-01'),
});

// Response
{
  success: true,
  data: [
    {
      id: 'own_abc123',
      ipAssetId: 'clx123abc456',
      creatorId: 'creator_1',
      shareBps: 6000,
      sharePercentage: 60,
      ownershipType: 'PRIMARY',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: null,
      contractReference: null,
      legalDocUrl: null,
      notes: null,
      disputed: false,
      disputedAt: null,
      disputeReason: null,
      disputedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNotes: null,
      createdAt: '2025-01-13T10:30:00.000Z',
      updatedAt: '2025-01-13T10:30:00.000Z',
      isActive: true,
      isPerpetual: true
    },
    {
      id: 'own_def456',
      ipAssetId: 'clx123abc456',
      creatorId: 'creator_2',
      shareBps: 4000,
      sharePercentage: 40,
      ownershipType: 'CONTRIBUTOR',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: null,
      // ... other fields
      isActive: true,
      isPerpetual: true
    }
  ],
  meta: {
    totalBps: 10000,
    ownerCount: 2
  }
}
```

**cURL Example**:
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/ipOwnership.setOwnership' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "ipAssetId": "clx123abc456",
    "ownerships": [
      {
        "creatorId": "creator_1",
        "shareBps": 6000,
        "ownershipType": "PRIMARY"
      },
      {
        "creatorId": "creator_2",
        "shareBps": 4000,
        "ownershipType": "CONTRIBUTOR"
      }
    ]
  }'
```

---

### 2. Get Current Owners

**Use Case**: Display current ownership split for an asset

```typescript
// Request
const result = await trpc.ipOwnership.getOwners.query({
  ipAssetId: 'clx123abc456',
  includeCreatorDetails: true,
});

// Response
{
  data: [
    {
      id: 'own_abc123',
      ipAssetId: 'clx123abc456',
      creatorId: 'creator_1',
      shareBps: 6000,
      sharePercentage: 60,
      ownershipType: 'PRIMARY',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: null,
      creator: {
        id: 'creator_1',
        userId: 'user_abc',
        stageName: 'Taylor Swift',
        verificationStatus: 'VERIFIED'
      },
      isActive: true,
      isPerpetual: true
    },
    {
      id: 'own_def456',
      creatorId: 'creator_2',
      shareBps: 4000,
      sharePercentage: 40,
      creator: {
        id: 'creator_2',
        userId: 'user_def',
        stageName: 'Jack Antonoff',
        verificationStatus: 'VERIFIED'
      }
    }
  ],
  meta: {
    totalBps: 10000,
    ownerCount: 2,
    queryDate: '2025-01-13T10:35:00.000Z'
  }
}
```

**cURL Example**:
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/ipOwnership.getOwners?input={"ipAssetId":"clx123abc456"}' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

### 3. Get Ownership History

**Use Case**: Display audit trail of ownership changes

```typescript
// Request
const result = await trpc.ipOwnership.getHistory.query({
  ipAssetId: 'clx123abc456',
});

// Response
{
  data: [
    {
      ownership: {
        id: 'own_abc123',
        shareBps: 6000,
        // ... full ownership details
      },
      changeType: 'CREATED',
      changedAt: '2025-01-01T00:00:00.000Z',
      changedBy: 'user_abc'
    },
    {
      ownership: {
        id: 'own_abc123',
        shareBps: 5500,
        // ... updated details
      },
      changeType: 'UPDATED',
      changedAt: '2025-01-05T14:20:00.000Z',
      changedBy: 'admin_user'
    },
    {
      ownership: {
        id: 'own_def456',
        shareBps: 500,
      },
      changeType: 'TRANSFERRED',
      changedAt: '2025-01-05T14:20:00.000Z',
      changedBy: 'user_abc'
    }
  ]
}
```

---

### 4. Transfer Ownership

**Use Case**: Creator transfers portion of their ownership to another creator

```typescript
// Request
const result = await trpc.ipOwnership.transferOwnership.mutate({
  ipAssetId: 'clx123abc456',
  toCreatorId: 'creator_3',
  shareBps: 1000,  // Transfer 10%
  contractReference: 'TRANSFER-2025-001',
  legalDocUrl: 'https://storage.yesgoddess.agency/contracts/transfer-001.pdf',
});

// Response
{
  success: true,
  data: {
    fromOwnership: {
      id: 'own_new1',
      creatorId: 'creator_1',
      shareBps: 5000,  // Reduced from 6000
      sharePercentage: 50,
      ownershipType: 'PRIMARY',
      startDate: '2025-01-13T10:40:00.000Z',
      // ... other fields
    },
    toOwnership: {
      id: 'own_new2',
      creatorId: 'creator_3',
      shareBps: 1000,  // New ownership
      sharePercentage: 10,
      ownershipType: 'TRANSFERRED',
      startDate: '2025-01-13T10:40:00.000Z',
      // ... other fields
    },
    transferredBps: 1000
  }
}
```

---

### 5. Validate Split (Before Saving)

**Use Case**: Validate user input before submitting

```typescript
// Request
const result = await trpc.ipOwnership.validateSplit.query({
  ownerships: [
    { creatorId: 'creator_1', shareBps: 6000, ownershipType: 'PRIMARY' },
    { creatorId: 'creator_2', shareBps: 3000, ownershipType: 'CONTRIBUTOR' },
  ],
});

// Response (Invalid - doesn't sum to 10000)
{
  data: {
    isValid: false,
    errors: [
      'Total must equal 10000 BPS. Current: 9000'
    ],
    warnings: []
  }
}

// Response (Valid)
{
  data: {
    isValid: true,
    errors: [],
    warnings: []
  }
}
```

---

### 6. Get Ownership Summary

**Use Case**: Display high-level ownership overview

```typescript
// Request
const result = await trpc.ipOwnership.getSummary.query({
  ipAssetId: 'clx123abc456',
});

// Response
{
  data: {
    ipAssetId: 'clx123abc456',
    owners: [
      {
        creatorId: 'creator_1',
        creatorName: 'Taylor Swift',
        shareBps: 6000,
        sharePercentage: 60,
        ownershipType: 'PRIMARY'
      },
      {
        creatorId: 'creator_2',
        creatorName: 'Jack Antonoff',
        shareBps: 4000,
        sharePercentage: 40,
        ownershipType: 'CONTRIBUTOR'
      }
    ],
    totalBps: 10000,
    ownerCount: 2,
    hasMultipleOwners: true
  }
}
```

---

### 7. Get Creator's Assets

**Use Case**: Show all assets owned by a creator

```typescript
// Request
const result = await trpc.ipOwnership.getCreatorAssets.query({
  creatorId: 'creator_1',
  includeExpired: false,
  ownershipType: 'PRIMARY', // Optional filter
});

// Response
{
  data: [
    {
      id: 'own_123',
      ipAssetId: 'asset_1',
      creatorId: 'creator_1',
      shareBps: 10000,
      sharePercentage: 100,
      ownershipType: 'PRIMARY',
      // ... other fields
    },
    {
      id: 'own_456',
      ipAssetId: 'asset_2',
      shareBps: 6000,
      sharePercentage: 60,
      ownershipType: 'PRIMARY',
      // ... other fields
    }
  ]
}
```

---

### 8. Flag Ownership Dispute

**Use Case**: Creator or admin flags ownership record as disputed

```typescript
// Request
const result = await trpc.ipOwnership.flagDispute.mutate({
  ownershipId: 'own_abc123',
  reason: 'Creator disputes the ownership percentage allocation. Claims agreement was for 70/30 split, not 60/40.',
  supportingDocuments: [
    'https://storage.yesgoddess.agency/disputes/contract-original.pdf',
    'https://storage.yesgoddess.agency/disputes/email-thread.pdf'
  ],
});

// Response
{
  success: true,
  data: {
    id: 'own_abc123',
    disputed: true,
    disputedAt: '2025-01-13T11:00:00.000Z',
    disputeReason: 'Creator disputes the ownership percentage allocation...',
    disputedBy: 'user_abc',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    // ... other ownership fields
  }
}
```

---

### 9. Resolve Dispute (Admin Only)

**Use Case**: Admin resolves an ownership dispute

```typescript
// Request - Confirm ownership as correct
const result = await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'own_abc123',
  action: 'CONFIRM',
  resolutionNotes: 'Reviewed original contract. Current split is correct as per signed agreement dated 2024-12-01.',
});

// Response
{
  success: true,
  data: {
    ownershipId: 'own_abc123',
    action: 'CONFIRM',
    resolvedAt: '2025-01-13T11:15:00.000Z',
    resolvedBy: 'admin_user',
    updatedOwnership: {
      id: 'own_abc123',
      disputed: true,
      resolvedAt: '2025-01-13T11:15:00.000Z',
      resolvedBy: 'admin_user',
      resolutionNotes: 'Reviewed original contract...',
      // ... other fields unchanged
    }
  }
}

// Request - Modify ownership
const result = await trpc.ipOwnership.resolveDispute.mutate({
  ownershipId: 'own_abc123',
  action: 'MODIFY',
  resolutionNotes: 'After review, ownership split should be adjusted to reflect correct agreement.',
  modifiedData: {
    shareBps: 7000,  // Adjust to 70%
  },
});

// Response
{
  success: true,
  data: {
    ownershipId: 'own_abc123',
    action: 'MODIFY',
    resolvedAt: '2025-01-13T11:20:00.000Z',
    resolvedBy: 'admin_user',
    updatedOwnership: {
      id: 'own_abc123',
      shareBps: 7000,
      sharePercentage: 70,
      disputed: true,
      resolvedAt: '2025-01-13T11:20:00.000Z',
      resolutionNotes: 'After review, ownership split...',
      // ... other fields
    }
  }
}
```

---

### 10. Get Disputed Ownerships (Admin Only)

**Use Case**: Admin dashboard showing all disputes

```typescript
// Request
const result = await trpc.ipOwnership.getDisputedOwnerships.query({
  includeResolved: false,  // Only show unresolved
});

// Response
{
  data: [
    {
      id: 'own_abc123',
      ipAssetId: 'asset_1',
      disputed: true,
      disputedAt: '2025-01-13T11:00:00.000Z',
      disputeReason: 'Creator disputes the ownership percentage...',
      disputedBy: 'user_abc',
      resolvedAt: null,
      // ... other fields
    },
    {
      id: 'own_def456',
      ipAssetId: 'asset_2',
      disputed: true,
      disputedAt: '2025-01-12T09:30:00.000Z',
      disputeReason: 'Missing contributor credit...',
      disputedBy: 'user_def',
      resolvedAt: null,
      // ... other fields
    }
  ],
  meta: {
    count: 2,
    hasUnresolved: true
  }
}
```

---

## Authentication & Authorization

### Authentication

All endpoints require JWT authentication via NextAuth.js.

**Headers Required**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Obtaining JWT Token**:
```typescript
// Using next-auth in frontend
import { useSession } from 'next-auth/react';

const { data: session } = useSession();
// session.user contains authenticated user info
// JWT automatically included in tRPC requests
```

### Authorization Matrix

| Endpoint | CREATOR | BRAND | ADMIN | Notes |
|----------|---------|-------|-------|-------|
| `setOwnership` | ✅ (own assets) | ❌ | ✅ | Creator must own the asset |
| `getOwners` | ✅ | ✅ | ✅ | Anyone can view ownership |
| `getSummary` | ✅ | ✅ | ✅ | Anyone can view summary |
| `getHistory` | ✅ (own assets) | ❌ | ✅ | Must be owner or admin |
| `transferOwnership` | ✅ (own shares) | ❌ | ✅ | Must own sufficient shares |
| `validateSplit` | ✅ | ✅ | ✅ | No restrictions |
| `endOwnership` | ❌ | ❌ | ✅ | Admin only |
| `getCreatorAssets` | ✅ | ✅ | ✅ | Anyone can query |
| `flagDispute` | ✅ (own records) | ❌ | ✅ | Owner or admin |
| `resolveDispute` | ❌ | ❌ | ✅ | Admin only |
| `getDisputedOwnerships` | ❌ | ❌ | ✅ | Admin only |

### Permission Checking

The backend automatically enforces permissions:

```typescript
// Example: transferOwnership checks
// 1. User must be authenticated
// 2. User must have creator profile
// 3. User must own sufficient shares in the asset
// 4. All validated before transfer executes
```

### Field-Level Permissions

No field-level restrictions. All ownership data is visible to authenticated users who can access the record.

### Resource Ownership Rules

1. **Creators can:**
   - Set ownership on assets they created
   - Transfer their own ownership shares
   - Flag disputes on their ownership records
   - View history of assets they own

2. **Admins can:**
   - Perform all operations
   - Resolve disputes
   - End ownership records
   - View all ownership data

3. **Brands cannot:**
   - Directly modify IP ownership
   - Transfer ownership (creators only)
   - Resolve disputes

---

**Continue to [Part 2](./IP_OWNERSHIP_INTEGRATION_GUIDE_PART_2.md)** for Business Logic, Error Handling, and Frontend Implementation details.
