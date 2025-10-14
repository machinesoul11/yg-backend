# IP Ownership Management - Frontend Integration Guide (Part 2)

**Classification:** 🌐 SHARED  
**Module:** IP Ownership Management  
**Last Updated:** January 13, 2025  
**API Version:** v1

---

## Table of Contents

- [Business Logic & Validation Rules](#business-logic--validation-rules)
- [Error Handling](#error-handling)
- [Rate Limiting & Quotas](#rate-limiting--quotas)
- [Pagination & Filtering](#pagination--filtering)
- [Real-time Updates](#real-time-updates)
- [Frontend Implementation Checklist](#frontend-implementation-checklist)
- [React Query Examples](#react-query-examples)
- [UI/UX Considerations](#uiux-considerations)

---

## Business Logic & Validation Rules

### Critical Business Rules

#### 1. **The 10,000 BPS Rule** ⚠️

**Rule**: All ownership splits MUST sum to exactly 10,000 basis points (100%).

```typescript
// ✅ Valid
const ownerships = [
  { creatorId: 'c1', shareBps: 6000 },  // 60%
  { creatorId: 'c2', shareBps: 4000 },  // 40%
];
// Total: 10,000 BPS ✓

// ❌ Invalid
const ownerships = [
  { creatorId: 'c1', shareBps: 6000 },  // 60%
  { creatorId: 'c2', shareBps: 3000 },  // 30%
];
// Total: 9,000 BPS ✗ (missing 1,000 BPS)
```

**Frontend Validation**:
```typescript
function validateOwnershipTotal(ownerships: OwnershipSplitInput[]): ValidationResult {
  const total = ownerships.reduce((sum, o) => sum + o.shareBps, 0);
  
  if (total !== 10000) {
    return {
      isValid: false,
      errors: [`Total must equal 10,000 BPS (100%). Current total: ${total} BPS (${total / 100}%)`],
      warnings: []
    };
  }
  
  return { isValid: true, errors: [], warnings: [] };
}
```

#### 2. **Minimum Share Size**

**Rule**: Each ownership share must be at least 1 BPS (0.01%).

```typescript
// ✅ Valid
const ownership = { shareBps: 1 };  // 0.01%

// ❌ Invalid
const ownership = { shareBps: 0 };  // Cannot be 0
```

#### 3. **Atomic Ownership Updates**

**Rule**: Use `setOwnership` for all ownership changes (not individual creates/updates).

This ensures:
- Previous ownerships are properly ended
- New ownerships start atomically
- Total always equals 10,000 BPS
- Database consistency

```typescript
// ✅ Correct approach
await trpc.ipOwnership.setOwnership.mutate({
  ipAssetId: 'asset_1',
  ownerships: [
    { creatorId: 'c1', shareBps: 5000, ownershipType: 'PRIMARY' },
    { creatorId: 'c2', shareBps: 5000, ownershipType: 'CONTRIBUTOR' },
  ],
});

// ❌ Wrong approach (don't do this)
// await trpc.ipOwnership.createOwnership.mutate(...);
// await trpc.ipOwnership.createOwnership.mutate(...);
// ⚠️ Risk of inconsistent state, no validation
```

#### 4. **Transfer Validation**

**Rule**: Creator can only transfer shares they actually own.

```typescript
// Current ownership: creator_1 owns 6000 BPS

// ✅ Valid transfer
await trpc.ipOwnership.transferOwnership.mutate({
  toCreatorId: 'creator_2',
  shareBps: 2000,  // Transferring 20% (have 60%)
});

// ❌ Invalid transfer
await trpc.ipOwnership.transferOwnership.mutate({
  toCreatorId: 'creator_2',
  shareBps: 7000,  // Trying to transfer 70% (only have 60%)
});
// Error: InsufficientOwnershipError
```

**Frontend Pre-validation**:
```typescript
function canTransfer(userOwnership: number, requestedTransfer: number): boolean {
  return requestedTransfer > 0 && requestedTransfer <= userOwnership;
}

// Before calling API
if (!canTransfer(userOwnershipBps, transferAmount)) {
  showError('You do not own enough shares for this transfer');
  return;
}
```

#### 5. **Temporal Ownership**

**Rule**: Ownership records have start/end dates for historical tracking.

- `startDate`: When ownership begins
- `endDate`: When ownership ends (null = perpetual)
- Queries can specify `atDate` to see ownership at a point in time

```typescript
// Get ownership as it was on a specific date
const historicalOwners = await trpc.ipOwnership.getOwners.query({
  ipAssetId: 'asset_1',
  atDate: new Date('2024-06-15'),
});
```

#### 6. **Dispute Workflow**

**Rule**: Disputes follow a specific state machine:

```
Active Ownership
    ↓ (flagDispute)
Disputed Ownership
    ↓ (resolveDispute)
Resolved Ownership
```

States:
- `disputed: false, resolvedAt: null` → Active
- `disputed: true, resolvedAt: null` → Under Dispute
- `disputed: true, resolvedAt: <date>` → Resolved

**Cannot**:
- Re-dispute a resolved dispute
- Resolve a non-disputed ownership

---

### Field Validation Requirements

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| `ipAssetId` | string | CUID format | Must exist in database |
| `creatorId` | string | CUID format | Must exist in database |
| `shareBps` | number | 1-10000, integer | Basis points |
| `ownershipType` | enum | PRIMARY, CONTRIBUTOR, DERIVATIVE, TRANSFERRED | Required |
| `contractReference` | string | Max 255 chars | Optional |
| `legalDocUrl` | string | Valid URL | Optional |
| `startDate` | Date | Must be before endDate | Optional, defaults to now |
| `endDate` | Date | Must be after startDate | Optional, null = perpetual |
| `reason` (dispute) | string | 10-1000 chars | Required for disputes |
| `resolutionNotes` | string | 10-2000 chars | Required for resolution |

---

### Derived Values & Calculations

```typescript
/**
 * Convert basis points to percentage
 */
function bpsToPercentage(bps: number): number {
  return bps / 100;
}

/**
 * Convert percentage to basis points
 */
function percentageToBps(percentage: number): number {
  return Math.round(percentage * 100);
}

/**
 * Check if ownership is currently active
 */
function isOwnershipActive(ownership: IpOwnershipResponse): boolean {
  const now = new Date();
  const start = new Date(ownership.startDate);
  const end = ownership.endDate ? new Date(ownership.endDate) : null;
  
  return start <= now && (!end || end > now);
}

/**
 * Calculate remaining shares available for transfer
 */
function calculateAvailableForTransfer(
  currentOwnership: IpOwnershipResponse[]
): number {
  const userShare = currentOwnership[0]?.shareBps || 0;
  return userShare; // All owned shares can be transferred
}
```

---

## Error Handling

### Error Types

The API returns specific error classes that map to HTTP status codes:

| Error Class | HTTP Status | tRPC Code | Description |
|-------------|-------------|-----------|-------------|
| `OwnershipValidationError` | 400 | BAD_REQUEST | Invalid ownership split (not 10,000 BPS) |
| `InsufficientOwnershipError` | 403 | FORBIDDEN | Not enough shares to transfer |
| `UnauthorizedOwnershipError` | 403 | FORBIDDEN | No permission to modify ownership |
| `OwnershipConflictError` | 409 | CONFLICT | Temporal overlap or conflict |
| `TRPCError (NOT_FOUND)` | 404 | NOT_FOUND | Ownership/asset not found |
| `TRPCError (INTERNAL_SERVER_ERROR)` | 500 | INTERNAL_SERVER_ERROR | Unexpected error |

### Error Response Format

```typescript
// Error response structure
{
  error: {
    message: string,
    code: 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR',
    data: {
      code: string,
      httpStatus: number,
      path: string,
      zodError?: ZodError,  // If validation error
      cause?: any           // Additional error details
    }
  }
}
```

### Common Error Scenarios

#### 1. Ownership Split Validation Error

```typescript
// Request
await trpc.ipOwnership.setOwnership.mutate({
  ipAssetId: 'asset_1',
  ownerships: [
    { creatorId: 'c1', shareBps: 6000, ownershipType: 'PRIMARY' },
    { creatorId: 'c2', shareBps: 3000, ownershipType: 'CONTRIBUTOR' },
  ],
});

// Error Response
{
  error: {
    message: 'Ownership split must sum to 10000 BPS (100%). Current sum: 9000',
    code: 'BAD_REQUEST',
    data: {
      cause: {
        requiredBps: 10000,
        providedBps: 9000,
        missingBps: 1000,
        excessBps: undefined
      }
    }
  }
}

// Frontend handling
try {
  await trpc.ipOwnership.setOwnership.mutate(input);
} catch (error) {
  if (error.data?.code === 'BAD_REQUEST') {
    const { requiredBps, providedBps, missingBps } = error.data.cause;
    
    if (missingBps) {
      showError(`Ownership split is ${missingBps} BPS short. Please add ${missingBps / 100}% more.`);
    } else {
      showError(`Ownership split exceeds 100%. Please reduce by ${error.data.cause.excessBps / 100}%.`);
    }
  }
}
```

#### 2. Insufficient Ownership Error

```typescript
// Request - trying to transfer more than owned
await trpc.ipOwnership.transferOwnership.mutate({
  ipAssetId: 'asset_1',
  toCreatorId: 'creator_2',
  shareBps: 7000,  // Trying to transfer 70%
});

// Error Response
{
  error: {
    message: 'Insufficient ownership to complete transfer',
    code: 'FORBIDDEN',
    data: {
      cause: {
        requiredBps: 7000,
        availableBps: 6000,
        creatorId: 'creator_1',
        ipAssetId: 'asset_1'
      }
    }
  }
}

// Frontend handling
try {
  await trpc.ipOwnership.transferOwnership.mutate(input);
} catch (error) {
  if (error.data?.code === 'FORBIDDEN' && error.data.cause?.requiredBps) {
    const { requiredBps, availableBps } = error.data.cause;
    showError(
      `You only own ${availableBps / 100}% but are trying to transfer ${requiredBps / 100}%. ` +
      `Maximum transfer: ${availableBps / 100}%`
    );
  }
}
```

#### 3. Permission Denied

```typescript
// Request - non-owner trying to transfer
await trpc.ipOwnership.transferOwnership.mutate({
  ipAssetId: 'asset_1',
  toCreatorId: 'creator_2',
  shareBps: 1000,
});

// Error Response
{
  error: {
    message: 'You do not have ownership of this asset',
    code: 'FORBIDDEN'
  }
}
```

#### 4. Not Found

```typescript
// Request - invalid ownership ID
await trpc.ipOwnership.flagDispute.mutate({
  ownershipId: 'invalid_id',
  reason: 'Dispute reason',
});

// Error Response
{
  error: {
    message: 'Ownership record not found',
    code: 'NOT_FOUND'
  }
}
```

### User-Friendly Error Messages

Map backend errors to friendly messages:

```typescript
const ERROR_MESSAGES = {
  OWNERSHIP_VALIDATION: {
    title: 'Invalid Ownership Split',
    getMessage: (cause: any) => {
      if (cause.missingBps) {
        return `The ownership adds up to only ${cause.providedBps / 100}%. You need to add ${cause.missingBps / 100}% more to reach 100%.`;
      }
      if (cause.excessBps) {
        return `The ownership adds up to ${cause.providedBps / 100}%, which exceeds 100%. Please reduce by ${cause.excessBps / 100}%.`;
      }
      return 'Ownership must total exactly 100%.';
    }
  },
  INSUFFICIENT_OWNERSHIP: {
    title: 'Insufficient Shares',
    getMessage: (cause: any) => 
      `You're trying to transfer ${cause.requiredBps / 100}%, but you only own ${cause.availableBps / 100}%.`
  },
  UNAUTHORIZED: {
    title: 'Permission Denied',
    message: 'You do not have permission to perform this action.'
  },
  NOT_FOUND: {
    title: 'Not Found',
    message: 'The ownership record could not be found. It may have been deleted.'
  },
  DISPUTE_ALREADY_RESOLVED: {
    title: 'Dispute Already Resolved',
    message: 'This ownership dispute has already been resolved and cannot be modified.'
  }
};

function getErrorMessage(error: TRPCError): { title: string; message: string } {
  // Check for specific error types
  if (error.message.includes('Ownership split must sum')) {
    return {
      ...ERROR_MESSAGES.OWNERSHIP_VALIDATION,
      message: ERROR_MESSAGES.OWNERSHIP_VALIDATION.getMessage(error.data?.cause)
    };
  }
  
  if (error.message.includes('Insufficient ownership')) {
    return {
      ...ERROR_MESSAGES.INSUFFICIENT_OWNERSHIP,
      message: ERROR_MESSAGES.INSUFFICIENT_OWNERSHIP.getMessage(error.data?.cause)
    };
  }
  
  // Default messages based on code
  switch (error.data?.code) {
    case 'FORBIDDEN':
      return ERROR_MESSAGES.UNAUTHORIZED;
    case 'NOT_FOUND':
      return ERROR_MESSAGES.NOT_FOUND;
    default:
      return {
        title: 'Error',
        message: error.message || 'An unexpected error occurred. Please try again.'
      };
  }
}
```

### When to Show Generic vs Specific Errors

**Show Specific Errors** (user can fix):
- Ownership split validation errors
- Insufficient shares for transfer
- Invalid date ranges
- Missing required fields

**Show Generic Errors** (system/network issues):
- Internal server errors (500)
- Network timeouts
- Database errors
- Unknown errors

```typescript
function shouldShowSpecificError(error: TRPCError): boolean {
  const specificCodes = ['BAD_REQUEST', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'];
  return specificCodes.includes(error.data?.code);
}
```

---

## Rate Limiting & Quotas

### Rate Limits

Currently, there are **no explicit rate limits** on ownership endpoints. However, consider implementing client-side throttling:

```typescript
import { useMutation } from '@tanstack/react-query';
import { debounce } from 'lodash';

// Debounce validation calls
const debouncedValidate = debounce(async (ownerships) => {
  return await trpc.ipOwnership.validateSplit.query({ ownerships });
}, 500); // Wait 500ms after user stops typing
```

### Best Practices

1. **Validate before submit**: Use `validateSplit` query before mutation
2. **Cache ownership data**: Ownership rarely changes, cache for 5-15 minutes
3. **Batch queries**: Fetch multiple assets' ownership in parallel
4. **Optimistic updates**: Show immediate feedback, roll back on error

---

## Pagination & Filtering

### Pagination

The ownership endpoints **do not use pagination** because:
- Assets typically have 1-5 owners (rarely more)
- Full ownership data is always needed for validation
- Historical queries return complete timeline

### Filtering

Available filters vary by endpoint:

#### `getCreatorAssets` Filters

```typescript
interface GetCreatorAssetsInput {
  creatorId: string;
  includeExpired?: boolean;       // Default: false
  ownershipType?: OwnershipType;  // Optional filter
}

// Example: Get only PRIMARY ownerships
const assets = await trpc.ipOwnership.getCreatorAssets.query({
  creatorId: 'creator_1',
  ownershipType: 'PRIMARY',
  includeExpired: false,
});
```

#### `getDisputedOwnerships` Filters

```typescript
interface GetDisputedOwnershipsInput {
  ipAssetId?: string;           // Filter by asset
  creatorId?: string;           // Filter by creator
  includeResolved?: boolean;    // Default: false
}

// Example: Get all unresolved disputes for an asset
const disputes = await trpc.ipOwnership.getDisputedOwnerships.query({
  ipAssetId: 'asset_1',
  includeResolved: false,
});
```

#### `getOwners` Filters

```typescript
interface GetOwnersInput {
  ipAssetId: string;
  atDate?: Date;                       // Query at specific date
  includeCreatorDetails?: boolean;     // Default: true
}

// Example: Historical ownership query
const owners = await trpc.ipOwnership.getOwners.query({
  ipAssetId: 'asset_1',
  atDate: new Date('2024-01-01'),  // Ownership as of Jan 1, 2024
});
```

### Sorting

Ownership results are sorted by:
- `getOwners`: By `shareBps` DESC (largest owners first)
- `getHistory`: By `changedAt` DESC (most recent first)
- `getCreatorAssets`: By `startDate` DESC (newest first)

No client-side sorting controls are provided.

---

## Real-time Updates

### Webhook Events

The ownership module triggers the following webhook events:

| Event | Trigger | Payload |
|-------|---------|---------|
| `IP_OWNERSHIP_SET` | `setOwnership` mutation | `{ ipAssetId, ownerships[] }` |
| `IP_OWNERSHIP_TRANSFERRED` | `transferOwnership` mutation | `{ fromOwnership, toOwnership, transferredBps }` |
| `IP_OWNERSHIP_ENDED` | `endOwnership` mutation | `{ ownershipId, endDate }` |
| `IP_OWNERSHIP_DISPUTED` | `flagDispute` mutation | `{ ownershipId, reason, disputedBy }` |
| `IP_OWNERSHIP_RESOLVED` | `resolveDispute` mutation | `{ ownershipId, action, resolvedBy }` |

### WebSocket/SSE

**Not currently implemented**. Ownership changes are infrequent, so polling is acceptable.

### Polling Recommendations

For real-time dashboards:

```typescript
import { useQuery } from '@tanstack/react-query';

function useOwnershipData(ipAssetId: string) {
  return useQuery({
    queryKey: ['ipOwnership', 'owners', ipAssetId],
    queryFn: () => trpc.ipOwnership.getOwners.query({ ipAssetId }),
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 10000,       // Consider stale after 10 seconds
  });
}
```

For admin dispute monitoring:

```typescript
function useDisputeMonitoring() {
  return useQuery({
    queryKey: ['ipOwnership', 'disputes'],
    queryFn: () => trpc.ipOwnership.getDisputedOwnerships.query({ includeResolved: false }),
    refetchInterval: 60000, // Poll every 1 minute
  });
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Integration

- [ ] Install tRPC client and configure with backend URL
- [ ] Set up authentication flow (NextAuth.js)
- [ ] Create TypeScript type definitions from Part 1
- [ ] Implement basic API client wrapper
- [ ] Test connection with `getOwners` query

### Phase 2: Core Features

#### Ownership Display
- [ ] Create `OwnershipSplitDisplay` component
  - [ ] Show owners with percentages
  - [ ] Display ownership type badges
  - [ ] Show active vs expired status
  - [ ] Add "Edit" button (if user has permission)

#### Set Ownership Form
- [ ] Create `OwnershipForm` component
  - [ ] Multi-owner input fields
  - [ ] Real-time BPS calculation
  - [ ] Live validation (sum to 10,000 BPS)
  - [ ] Visual progress bar showing total percentage
  - [ ] Creator search/autocomplete
  - [ ] Ownership type selector
  - [ ] Optional contract reference input
  - [ ] Optional legal document upload
- [ ] Client-side validation before API call
- [ ] Optimistic UI updates
- [ ] Error handling with user-friendly messages
- [ ] Success confirmation

#### Transfer Ownership
- [ ] Create `TransferOwnershipModal` component
  - [ ] Show current ownership amount
  - [ ] Transfer amount input with validation
  - [ ] Recipient creator selector
  - [ ] Calculate remaining ownership after transfer
  - [ ] Show visual representation (pie chart?)
  - [ ] Contract reference input
  - [ ] Confirmation step
- [ ] Validate sufficient shares before submit
- [ ] Show transfer history after successful transfer

#### Ownership History
- [ ] Create `OwnershipHistoryTimeline` component
  - [ ] Display chronological timeline
  - [ ] Show change type icons/badges
  - [ ] Expand/collapse details
  - [ ] Link to related documents
  - [ ] Filter by change type
  - [ ] Export to PDF option

### Phase 3: Advanced Features

#### Dispute Management (Creator View)
- [ ] Create `FlagDisputeModal` component
  - [ ] Reason textarea (10-1000 chars)
  - [ ] Supporting document upload
  - [ ] Preview dispute before submission
- [ ] Show dispute status badge on ownership records
- [ ] Display dispute details when clicked

#### Dispute Management (Admin View)
- [ ] Create admin dispute dashboard
- [ ] List all pending disputes
- [ ] Create `ResolveDisputeModal` component
  - [ ] Show original ownership data
  - [ ] Show dispute reason and documents
  - [ ] Action selector (CONFIRM, MODIFY, REMOVE)
  - [ ] Resolution notes textarea
  - [ ] Modified data form (if MODIFY action)
  - [ ] Confirmation step
- [ ] Real-time dispute count badge
- [ ] Filter disputes by asset/creator
- [ ] Export dispute report

#### Validation & UX
- [ ] Implement real-time validation as user types
- [ ] Show helpful error messages inline
- [ ] Add tooltips explaining BPS system
- [ ] Add percentage ↔ BPS converter toggle
- [ ] Show visual warnings when split doesn't equal 100%
- [ ] Implement "Auto-adjust" feature to balance splits
- [ ] Add "Save as draft" functionality
- [ ] Implement undo/redo for form edits

### Phase 4: Polish & Optimization

- [ ] Add loading skeletons for all components
- [ ] Implement error boundaries
- [ ] Add retry logic for failed requests
- [ ] Cache ownership data with React Query
- [ ] Implement optimistic updates
- [ ] Add analytics tracking
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Mobile responsive design
- [ ] Dark mode support
- [ ] Add keyboard shortcuts
- [ ] Performance testing
- [ ] E2E tests with Playwright/Cypress

---

## React Query Examples

### Basic Query Setup

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/api/root';

export const trpc = createTRPCReact<AppRouter>();

// pages/_app.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // 1 minute
      retry: 1,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers() {
        return {
          Authorization: `Bearer ${getAccessToken()}`,
        };
      },
    }),
  ],
});

function MyApp({ Component, pageProps }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Query Examples

```typescript
'use client';

import { trpc } from '@/lib/trpc';

// Get current owners
function OwnershipDisplay({ ipAssetId }: { ipAssetId: string }) {
  const { data, isLoading, error } = trpc.ipOwnership.getOwners.useQuery({
    ipAssetId,
  });

  if (isLoading) return <OwnershipSkeleton />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div>
      {data?.data.map((owner) => (
        <OwnerCard key={owner.id} owner={owner} />
      ))}
    </div>
  );
}

// Get ownership with refetch control
function OwnershipWithRefetch({ ipAssetId }: { ipAssetId: string }) {
  const { data, refetch } = trpc.ipOwnership.getOwners.useQuery(
    { ipAssetId },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  return (
    <>
      <OwnershipList owners={data?.data} />
      <button onClick={() => refetch()}>Refresh</button>
    </>
  );
}

// Historical ownership query
function HistoricalOwnership({ ipAssetId, date }: Props) {
  const { data } = trpc.ipOwnership.getOwners.useQuery({
    ipAssetId,
    atDate: date,
  });

  return <OwnershipTimeline owners={data?.data} date={date} />;
}
```

### Mutation Examples

```typescript
// Set ownership
function OwnershipForm({ ipAssetId }: { ipAssetId: string }) {
  const utils = trpc.useContext();
  
  const setOwnership = trpc.ipOwnership.setOwnership.useMutation({
    onSuccess: () => {
      // Invalidate related queries
      utils.ipOwnership.getOwners.invalidate({ ipAssetId });
      utils.ipOwnership.getSummary.invalidate({ ipAssetId });
      
      toast.success('Ownership updated successfully');
    },
    onError: (error) => {
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg.title, { description: errorMsg.message });
    },
  });

  const handleSubmit = (ownerships: OwnershipSplitInput[]) => {
    setOwnership.mutate({
      ipAssetId,
      ownerships,
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(formData); }}>
      {/* Form fields */}
      <button type="submit" disabled={setOwnership.isLoading}>
        {setOwnership.isLoading ? 'Saving...' : 'Save Ownership'}
      </button>
    </form>
  );
}

// Transfer ownership with optimistic update
function TransferButton({ ipAssetId, toCreatorId, shareBps }: Props) {
  const utils = trpc.useContext();
  
  const transfer = trpc.ipOwnership.transferOwnership.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await utils.ipOwnership.getOwners.cancel({ ipAssetId });
      
      // Snapshot previous value
      const previousOwners = utils.ipOwnership.getOwners.getData({ ipAssetId });
      
      // Optimistically update
      utils.ipOwnership.getOwners.setData(
        { ipAssetId },
        (old) => {
          if (!old) return old;
          // Update ownership data optimistically
          return {
            ...old,
            data: old.data.map((owner) => {
              if (owner.creatorId === variables.toCreatorId) {
                return {
                  ...owner,
                  shareBps: owner.shareBps + variables.shareBps,
                };
              }
              return owner;
            }),
          };
        }
      );
      
      return { previousOwners };
    },
    onError: (err, variables, context) => {
      // Roll back on error
      if (context?.previousOwners) {
        utils.ipOwnership.getOwners.setData(
          { ipAssetId },
          context.previousOwners
        );
      }
      toast.error('Transfer failed', { description: err.message });
    },
    onSettled: () => {
      // Refetch to ensure sync
      utils.ipOwnership.getOwners.invalidate({ ipAssetId });
    },
  });

  return (
    <button onClick={() => transfer.mutate({ ipAssetId, toCreatorId, shareBps })}>
      Transfer
    </button>
  );
}

// Validation during form editing
function OwnershipFormWithValidation() {
  const [ownerships, setOwnerships] = useState<OwnershipSplitInput[]>([]);
  
  const validation = trpc.ipOwnership.validateSplit.useQuery(
    { ownerships },
    {
      enabled: ownerships.length > 0,
      staleTime: 0, // Always validate
    }
  );

  return (
    <>
      <OwnershipInputs value={ownerships} onChange={setOwnerships} />
      
      {validation.data && !validation.data.data.isValid && (
        <Alert variant="error">
          {validation.data.data.errors.map((err) => (
            <div key={err}>{err}</div>
          ))}
        </Alert>
      )}
    </>
  );
}
```

### Parallel Queries

```typescript
function AssetDashboard({ assetIds }: { assetIds: string[] }) {
  // Fetch ownership for multiple assets in parallel
  const queries = trpc.useQueries((t) =>
    assetIds.map((id) =>
      t.ipOwnership.getOwners({ ipAssetId: id })
    )
  );

  const allLoaded = queries.every((q) => !q.isLoading);
  
  if (!allLoaded) return <LoadingSpinner />;

  return (
    <>
      {queries.map((query, index) => (
        <OwnershipCard
          key={assetIds[index]}
          assetId={assetIds[index]}
          owners={query.data?.data}
        />
      ))}
    </>
  );
}
```

---

## UI/UX Considerations

### Visual Design Patterns

#### 1. Ownership Split Visualization

Use **pie charts** or **stacked bars** to show ownership distribution:

```typescript
import { PieChart, Pie, Cell, Legend } from 'recharts';

function OwnershipPieChart({ owners }: { owners: IpOwnershipResponse[] }) {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  
  const data = owners.map((owner) => ({
    name: owner.creator?.stageName || owner.creatorId,
    value: owner.shareBps,
    percentage: owner.sharePercentage,
  }));

  return (
    <PieChart width={400} height={400}>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={120}
        label={(entry) => `${entry.percentage}%`}
      >
        {data.map((entry, index) => (
          <Cell key={index} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Legend />
    </PieChart>
  );
}
```

#### 2. Progress Bar for Total Ownership

Show real-time feedback as user adjusts splits:

```typescript
function OwnershipProgressBar({ ownerships }: Props) {
  const totalBps = ownerships.reduce((sum, o) => sum + o.shareBps, 0);
  const percentage = totalBps / 100;
  
  const getColor = () => {
    if (totalBps === 10000) return 'bg-green-500';
    if (totalBps > 10000) return 'bg-red-500';
    return 'bg-yellow-500';
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Total Ownership</span>
        <span className={totalBps === 10000 ? 'text-green-600' : 'text-red-600'}>
          {percentage}% {totalBps === 10000 ? '✓' : '✗'}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${getColor()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {totalBps !== 10000 && (
        <p className="text-xs text-gray-600">
          {totalBps < 10000 
            ? `Add ${(10000 - totalBps) / 100}% more`
            : `Reduce by ${(totalBps - 10000) / 100}%`
          }
        </p>
      )}
    </div>
  );
}
```

#### 3. Ownership Type Badges

```typescript
function OwnershipTypeBadge({ type }: { type: OwnershipType }) {
  const styles = {
    PRIMARY: 'bg-blue-100 text-blue-800',
    CONTRIBUTOR: 'bg-green-100 text-green-800',
    DERIVATIVE: 'bg-purple-100 text-purple-800',
    TRANSFERRED: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles[type]}`}>
      {type}
    </span>
  );
}
```

#### 4. Timeline Visualization for History

```typescript
function OwnershipTimeline({ history }: { history: OwnershipHistoryEntry[] }) {
  const icons = {
    CREATED: '🎉',
    UPDATED: '✏️',
    ENDED: '🔚',
    TRANSFERRED: '🔄',
    DISPUTED: '⚠️',
    RESOLVED: '✅',
  };

  return (
    <div className="space-y-4">
      {history.map((entry, index) => (
        <div key={entry.ownership.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="text-2xl">{icons[entry.changeType]}</div>
            {index < history.length - 1 && (
              <div className="w-0.5 h-full bg-gray-300 mt-2" />
            )}
          </div>
          <div className="flex-1 pb-8">
            <h4 className="font-medium">{entry.changeType}</h4>
            <p className="text-sm text-gray-600">
              {new Date(entry.changedAt).toLocaleString()}
            </p>
            <OwnershipCard ownership={entry.ownership} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Edge Cases to Handle

1. **Zero owners state**: Show empty state with "Add Owner" CTA
2. **Single owner at 100%**: Disable transfer until more owners added
3. **Expired ownership**: Show with grayed out styling
4. **Disputed ownership**: Show warning badge, disable editing
5. **Long creator names**: Truncate with tooltip
6. **Many owners (>10)**: Use scrollable list or pagination
7. **Loading states**: Show skeleton screens
8. **Network errors**: Show retry button
9. **Stale data**: Show "Last updated X minutes ago"
10. **Concurrent edits**: Show warning if data changed since load

### Accessibility

- Use semantic HTML (`<table>` for ownership lists)
- Add ARIA labels to form inputs
- Ensure keyboard navigation works
- Add screen reader announcements for validation errors
- Maintain 4.5:1 color contrast ratio
- Add focus indicators
- Support high contrast mode

### Mobile Responsiveness

- Stack ownership cards vertically on mobile
- Use bottom sheets for forms/modals
- Make touch targets at least 44x44px
- Reduce chart sizes for small screens
- Use horizontal scrolling for wide tables

---

## Summary

This integration guide provides everything needed to implement the IP Ownership Management module in the frontend:

✅ Complete API reference with examples  
✅ TypeScript types and Zod schemas  
✅ Business logic and validation rules  
✅ Comprehensive error handling  
✅ React Query implementation patterns  
✅ UI/UX best practices  
✅ Step-by-step implementation checklist  

The module is production-ready and fully tested on the backend. Frontend implementation can proceed without clarification questions.

---

**Questions or Issues?**  
Contact: Backend Team  
Documentation Version: 1.0.0  
Last Updated: January 13, 2025
