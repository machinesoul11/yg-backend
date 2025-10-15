# License Queries API - Frontend Integration Guide (Part 2: Implementation)

**Classification:** ⚡ HYBRID  
*License queries are used by both public-facing website (brand ↔ creator) and admin backend (operations management)*

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Error Handling](#error-handling)
3. [React Query Integration](#react-query-integration)
4. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## 1. Business Logic & Validation Rules

### 1.1 Query Filter Validation

**Status Filter:**
- Must be one of: `DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `EXPIRED`, `TERMINATED`, `SUSPENDED`
- Case-sensitive
- Optional (omit for all statuses)

**Date Filters (expiringBefore):**
- Must be valid ISO 8601 datetime string
- Examples: `2025-12-31T23:59:59Z`, `2025-03-31T00:00:00-05:00`
- Automatically filters to `ACTIVE` licenses only
- Used for renewal planning and expiry notifications

**Pagination:**
- `page`: Minimum 1, defaults to 1
- `pageSize`: Minimum 1, Maximum 100, defaults to 20
- Invalid values will be coerced to valid range

**ID Filters (ipAssetId, brandId, projectId, creatorId):**
- Must be valid CUIDs (format: `clx[a-z0-9]{21}`)
- Invalid CUIDs will return validation error
- Non-existent IDs return empty results (not errors)

---

### 1.2 Conflict Detection Business Rules

**Exclusivity Rules:**

1. **EXCLUSIVE license:**
   - Blocks ALL other licenses on same asset during overlapping dates
   - Includes DRAFT and PENDING_APPROVAL licenses in conflict check
   - Even NON_EXCLUSIVE licenses are blocked

2. **EXCLUSIVE_TERRITORY license:**
   - Blocks only licenses in same geographic territories
   - Allows NON_EXCLUSIVE licenses in different territories
   - `GLOBAL` territory conflicts with any other territory

3. **NON_EXCLUSIVE license:**
   - Cannot be created if EXCLUSIVE license exists
   - Can coexist with other NON_EXCLUSIVE licenses
   - May still conflict on scope (media, placement)

**Scope Conflict Detection:**

```typescript
// Media conflicts (any overlap blocks if exclusive)
if (licenseType === 'EXCLUSIVE' || existingType === 'EXCLUSIVE') {
  if (newScope.media.digital && existingScope.media.digital) {
    // CONFLICT: Both claim digital rights
  }
}

// Territory conflicts
if (newScope.geographic?.territories.includes('GLOBAL')) {
  // CONFLICT: Cannot grant global rights if any territory license exists
}

// Competitor blocking
if (existingScope.exclusivity?.competitors.includes(newBrandId)) {
  // CONFLICT: Brand is blocked competitor
}
```

**Temporal Overlap:**
- Licenses conflict if `[startDate, endDate]` ranges overlap
- Overlap formula: `startDate1 <= endDate2 && endDate1 >= startDate2`

---

### 1.3 Revenue Calculation Logic

**Initial Fee:**
- One-time fee paid at license creation: `license.feeCents`
- Included in `totalRevenueCents`

**Revenue Share:**
- Calculated from royalty statements linked to license
- Sum of all `royaltyLines.calculatedRoyaltyCents`
- Revenue share percentage: `license.revShareBps / 100` (e.g., 1000 bps = 10%)

**Projected Revenue:**
- Uses linear extrapolation if license is still active
- Formula: `currentRevenue + (dailyRate * remainingDays)`
- `dailyRate = totalRevenueShareCents / elapsedDays`
- Only projected if `elapsedDays > 0` and `totalRevenueShareCents > 0`

**Revenue by Creator:**
- Split based on `ipOwnership.shareBps`
- Formula: `totalRevenue * (creatorShareBps / 10000)`
- Paid vs Pending: Calculated from royalty statement statuses

**Payment Status:**
- `totalPaid`: Sum of royalty statements with `status = 'PAID'`
- `totalPending`: Sum of royalty statements with `status = 'PENDING'`
- `nextPaymentDate`: Calculated from `billingFrequency` and last payment

---

### 1.4 Statistics Calculations

**Expiring Licenses:**
- `expiringIn30Days`: Active licenses with `endDate` between now and 30 days from now
- `expiringIn60Days`: Between now and 60 days from now
- `expiringIn90Days`: Between now and 90 days from now

**Renewal Rate:**
- Formula: `(renewedLicenses / expiredLicenses) * 100`
- Only counts licenses where parent license exists (indicating renewal)
- Excludes currently ACTIVE licenses

**Average Duration:**
- Formula: `sum(endDate - startDate) / totalLicenses`
- Measured in days
- Excludes perpetual licenses (null endDate)

---

## 2. Error Handling

### 2.1 HTTP Status Codes

| Status | Code | Meaning | User Action |
|--------|------|---------|-------------|
| 200 | `OK` | Success | Display results |
| 400 | `BAD_REQUEST` | Invalid input | Show validation errors |
| 401 | `UNAUTHORIZED` | Missing/invalid token | Redirect to login |
| 403 | `FORBIDDEN` | Insufficient permissions | Show access denied message |
| 404 | `NOT_FOUND` | License not found | Show "not found" message |
| 409 | `CONFLICT` | License conflicts exist | Show conflict details |
| 500 | `INTERNAL_SERVER_ERROR` | Server error | Show generic error, retry |

---

### 2.2 Error Response Format

**tRPC Error Format:**
```typescript
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to view this license",
    "data": {
      "code": "FORBIDDEN",
      "httpStatus": 403,
      "path": "licenses.getById",
      "stack": "..."  // Only in development
    }
  }
}
```

**Validation Error Example:**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "zodError": {
        "fieldErrors": {
          "ipAssetId": ["Invalid cuid"],
          "pageSize": ["Number must be less than or equal to 100"]
        }
      }
    }
  }
}
```

---

### 2.3 Error Messages by Endpoint

**licenses.list:**
- `400 BAD_REQUEST`: Invalid filter parameters
- `401 UNAUTHORIZED`: Missing authentication token
- `500 INTERNAL_SERVER_ERROR`: Database connection error

**licenses.getById:**
- `400 BAD_REQUEST`: Invalid license ID format
- `401 UNAUTHORIZED`: Missing authentication token
- `403 FORBIDDEN`: User doesn't have access to this license
- `404 NOT_FOUND`: License doesn't exist
- `500 INTERNAL_SERVER_ERROR`: Database error

**licenses.checkConflicts:**
- `400 BAD_REQUEST`: Invalid date range or scope
- `401 UNAUTHORIZED`: Missing authentication token
- `409 CONFLICT`: Conflicts detected (check `conflicts` array)
- `500 INTERNAL_SERVER_ERROR`: Conflict detection failed

**licenses.getRevenue:**
- `400 BAD_REQUEST`: Invalid license ID
- `401 UNAUTHORIZED`: Missing authentication token
- `403 FORBIDDEN`: User doesn't have access to revenue data
- `404 NOT_FOUND`: License doesn't exist
- `500 INTERNAL_SERVER_ERROR`: Revenue calculation failed

**licenses.stats:**
- `400 BAD_REQUEST`: Invalid brand ID format
- `401 UNAUTHORIZED`: Missing authentication token
- `403 FORBIDDEN`: Non-admin trying to access other brand's stats
- `500 INTERNAL_SERVER_ERROR`: Statistics calculation failed

---

### 2.4 User-Friendly Error Messages

**Map backend errors to user messages:**

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication
  UNAUTHORIZED: 'Please log in to view licenses.',
  
  // Permissions
  FORBIDDEN: 'You don\'t have permission to view this license.',
  
  // Not Found
  NOT_FOUND: 'License not found. It may have been deleted.',
  
  // Validation
  'Invalid cuid': 'Invalid license ID format.',
  'Number must be less than or equal to 100': 'Page size cannot exceed 100.',
  
  // Conflicts
  CONFLICT: 'This license conflicts with existing agreements. See details below.',
  
  // Server Errors
  INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again later.',
};

function getUserFriendlyError(error: TRPCError): string {
  return ERROR_MESSAGES[error.code] || ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
}
```

---

### 2.5 When to Show Specific vs Generic Errors

**Show specific errors for:**
- Validation failures (field-level errors)
- Permission denials (explain what's missing)
- Conflicts (show conflicting licenses)
- Not found (confirm deletion/non-existence)

**Show generic errors for:**
- Server errors (don't expose internals)
- Database connection issues
- Unexpected exceptions

**Example:**
```typescript
if (error.code === 'CONFLICT') {
  // Show detailed conflict information
  return <ConflictDialog conflicts={error.data.conflicts} />;
}

if (error.code === 'FORBIDDEN') {
  // Show specific permission message
  return <Alert severity="error">You don't have access to this license.</Alert>;
}

if (error.code === 'INTERNAL_SERVER_ERROR') {
  // Show generic retry message
  return <Alert severity="error">Something went wrong. Please try again.</Alert>;
}
```

---

## 3. React Query Integration

### 3.1 Query Hooks

**List Licenses:**
```typescript
import { trpc } from '@/lib/trpc';

export function useLicenses(filters?: LicenseFilters) {
  return trpc.licenses.list.useQuery(
    {
      status: filters?.status,
      ipAssetId: filters?.ipAssetId,
      brandId: filters?.brandId,
      projectId: filters?.projectId,
      licenseType: filters?.licenseType,
      expiringBefore: filters?.expiringBefore,
      creatorId: filters?.creatorId,
      page: filters?.page ?? 1,
      pageSize: filters?.pageSize ?? 20,
    },
    {
      // Keep data fresh
      staleTime: 30 * 1000, // 30 seconds
      
      // Enable if filters are dynamic
      enabled: true,
      
      // Refetch on window focus for dashboards
      refetchOnWindowFocus: true,
      
      // Retry failed requests
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );
}
```

**Get License by ID:**
```typescript
export function useLicense(licenseId?: string) {
  return trpc.licenses.getById.useQuery(
    { id: licenseId! },
    {
      enabled: !!licenseId, // Only fetch if ID exists
      staleTime: 60 * 1000, // 1 minute
      retry: 2,
    }
  );
}
```

**Check Conflicts:**
```typescript
export function useConflictCheck(input?: ConflictCheckInput) {
  return trpc.licenses.checkConflicts.useQuery(
    input!,
    {
      enabled: !!input && !!input.ipAssetId, // Only check if complete input
      staleTime: 0, // Always fresh
      retry: 1, // Don't retry much, conflicts change quickly
    }
  );
}
```

**Get Revenue:**
```typescript
export function useLicenseRevenue(licenseId?: string) {
  return trpc.licenses.getRevenue.useQuery(
    { id: licenseId! },
    {
      enabled: !!licenseId,
      staleTime: 5 * 60 * 1000, // 5 minutes (revenue updates slowly)
      retry: 3,
    }
  );
}
```

**Get Statistics:**
```typescript
export function useLicenseStats(brandId?: string) {
  return trpc.licenses.stats.useQuery(
    { brandId },
    {
      staleTime: 2 * 60 * 1000, // 2 minutes
      refetchOnWindowFocus: true, // Refresh dashboard on focus
      retry: 2,
    }
  );
}
```

---

### 3.2 Pagination Hook

```typescript
export function useLicensesPaginated(baseFilters?: Omit<LicenseFilters, 'page' | 'pageSize'>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const query = useLicenses({
    ...baseFilters,
    page,
    pageSize,
  });

  const goToPage = (newPage: number) => {
    setPage(newPage);
  };

  const changePageSize = (newSize: number) => {
    setPageSize(newSize);
    setPage(1); // Reset to first page
  };

  return {
    ...query,
    page,
    pageSize,
    totalPages: query.data?.meta.pagination.totalPages ?? 0,
    total: query.data?.meta.pagination.total ?? 0,
    goToPage,
    changePageSize,
    hasNextPage: page < (query.data?.meta.pagination.totalPages ?? 0),
    hasPrevPage: page > 1,
  };
}
```

**Usage:**
```typescript
function LicenseTable() {
  const {
    data,
    isLoading,
    error,
    page,
    totalPages,
    goToPage,
    hasNextPage,
    hasPrevPage,
  } = useLicensesPaginated({ status: 'ACTIVE' });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorAlert error={error} />;

  return (
    <>
      <Table data={data?.data} />
      <Pagination
        page={page}
        totalPages={totalPages}
        onNext={() => goToPage(page + 1)}
        onPrev={() => goToPage(page - 1)}
        hasNext={hasNextPage}
        hasPrev={hasPrevPage}
      />
    </>
  );
}
```

---

### 3.3 Infinite Scroll (Alternative to Pagination)

```typescript
export function useLicensesInfinite(filters?: Omit<LicenseFilters, 'page'>) {
  return trpc.licenses.list.useInfiniteQuery(
    {
      ...filters,
      pageSize: filters?.pageSize ?? 20,
    },
    {
      getNextPageParam: (lastPage) => {
        const { page, totalPages } = lastPage.meta.pagination;
        return page < totalPages ? page + 1 : undefined;
      },
      staleTime: 30 * 1000,
    }
  );
}
```

**Usage:**
```typescript
function InfiniteLicenseList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useLicensesInfinite({ status: 'ACTIVE' });

  const allLicenses = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <>
      {allLicenses.map((license) => (
        <LicenseCard key={license.id} license={license} />
      ))}
      
      {hasNextPage && (
        <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </Button>
      )}
    </>
  );
}
```

---

### 3.4 Prefetching for Performance

```typescript
import { useQueryClient } from '@tanstack/react-query';

function LicenseListItem({ license }: { license: License }) {
  const queryClient = useQueryClient();

  // Prefetch license details on hover
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: ['licenses', 'getById', { id: license.id }],
      queryFn: () => trpc.licenses.getById.query({ id: license.id }),
    });
  };

  return (
    <div onMouseEnter={handleMouseEnter}>
      <Link to={`/licenses/${license.id}`}>
        {license.id}
      </Link>
    </div>
  );
}
```

---

### 3.5 Optimistic Updates (When Mutating)

```typescript
// Example: After renewing a license, optimistically update the list
const renewMutation = trpc.licenses.generateRenewal.useMutation({
  onMutate: async (newLicense) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['licenses', 'list']);

    // Snapshot previous value
    const previousLicenses = queryClient.getQueryData(['licenses', 'list']);

    // Optimistically update
    queryClient.setQueryData(['licenses', 'list'], (old: any) => {
      return {
        ...old,
        data: [...old.data, newLicense],
      };
    });

    return { previousLicenses };
  },
  
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['licenses', 'list'], context?.previousLicenses);
  },
  
  onSettled: () => {
    // Refetch to sync with server
    queryClient.invalidateQueries(['licenses', 'list']);
  },
});
```

---

## 4. Frontend Implementation Checklist

### 4.1 Core Features

- [ ] **License List Page**
  - [ ] Table/grid view with pagination
  - [ ] Filter by status dropdown
  - [ ] Filter by IP asset (autocomplete)
  - [ ] Filter by brand (autocomplete, admin only)
  - [ ] Date range filter for expiring licenses
  - [ ] Sort by creation date, end date, status
  - [ ] Export to CSV functionality
  - [ ] Responsive design (mobile table)

- [ ] **License Detail Page**
  - [ ] Display all license fields
  - [ ] Show IP asset preview
  - [ ] Show brand information
  - [ ] Display license scope visually (badges, icons)
  - [ ] Show signature status
  - [ ] Link to revenue page
  - [ ] Link to parent/child licenses
  - [ ] Action buttons (renew, terminate, edit - based on permissions)

- [ ] **Conflict Checker**
  - [ ] Form for conflict check inputs
  - [ ] Visual scope builder (checkboxes for media/placement)
  - [ ] Territory selector (multi-select dropdown)
  - [ ] Date range picker
  - [ ] Real-time conflict detection
  - [ ] Conflict visualization (timeline, overlaps)
  - [ ] Resolution suggestions

- [ ] **Revenue Dashboard**
  - [ ] Total revenue card
  - [ ] Revenue by period chart (line/bar chart)
  - [ ] Revenue by creator breakdown (pie chart)
  - [ ] Payment status indicators
  - [ ] Usage metrics (impressions, clicks)
  - [ ] Projected revenue forecast
  - [ ] Download revenue report (PDF/CSV)

- [ ] **License Statistics Widget**
  - [ ] Total active licenses
  - [ ] Expiring licenses countdown
  - [ ] Revenue KPIs
  - [ ] Renewal rate chart
  - [ ] Exclusive vs non-exclusive ratio

---

### 4.2 Edge Cases to Handle

**Empty States:**
- [ ] No licenses found for filters
- [ ] Brand has no licenses yet (onboarding prompt)
- [ ] Creator has no active licenses
- [ ] No revenue data yet for new license

**Loading States:**
- [ ] Skeleton loaders for lists
- [ ] Shimmer effect for revenue charts
- [ ] Progress indicators for conflict checks
- [ ] Lazy loading for large datasets

**Error States:**
- [ ] Network error retry button
- [ ] Permission denied message with contact support link
- [ ] Invalid license ID redirect to list
- [ ] Conflict detection failure fallback

**Boundary Cases:**
- [ ] Licenses with null end dates (perpetual)
- [ ] Licenses created but never signed
- [ ] Expired licenses still showing revenue
- [ ] Conflicting licenses with same brand (amendments)

---

### 4.3 UX Considerations

**Performance:**
- [ ] Debounce filter inputs (300ms)
- [ ] Virtualize long license lists (react-window)
- [ ] Lazy load revenue charts
- [ ] Cache conflict checks for 30 seconds
- [ ] Prefetch next page on pagination

**Accessibility:**
- [ ] Keyboard navigation for tables
- [ ] Screen reader labels for status badges
- [ ] ARIA labels for charts
- [ ] Focus management in modals
- [ ] High contrast mode support

**Mobile Responsiveness:**
- [ ] Horizontal scroll for tables on mobile
- [ ] Stack cards instead of table rows
- [ ] Bottom sheet filters
- [ ] Touch-friendly date pickers
- [ ] Collapsible filter sections

**Feedback:**
- [ ] Toast notifications for actions
- [ ] Loading spinners for async operations
- [ ] Success confirmations for renewals
- [ ] Warning dialogs before termination
- [ ] Inline validation errors

---

### 4.4 Component Structure

```
src/
├── features/
│   └── licenses/
│       ├── components/
│       │   ├── LicenseList.tsx
│       │   ├── LicenseListItem.tsx
│       │   ├── LicenseFilters.tsx
│       │   ├── LicenseDetail.tsx
│       │   ├── LicenseStatusBadge.tsx
│       │   ├── LicenseScopeDisplay.tsx
│       │   ├── ConflictChecker.tsx
│       │   ├── ConflictList.tsx
│       │   ├── RevenueDashboard.tsx
│       │   ├── RevenueChart.tsx
│       │   ├── RevenueBreakdown.tsx
│       │   └── LicenseStatsWidget.tsx
│       ├── hooks/
│       │   ├── useLicenses.ts
│       │   ├── useLicense.ts
│       │   ├── useConflictCheck.ts
│       │   ├── useLicenseRevenue.ts
│       │   ├── useLicenseStats.ts
│       │   └── useLicensesPaginated.ts
│       ├── types/
│       │   └── license.types.ts
│       └── utils/
│           ├── formatLicenseStatus.ts
│           ├── calculateRevenue.ts
│           └── checkConflictSeverity.ts
└── pages/
    └── licenses/
        ├── index.tsx           # List page
        ├── [id].tsx            # Detail page
        └── conflicts.tsx       # Conflict checker page
```

---

### 4.5 Testing Checklist

**Unit Tests:**
- [ ] License list filtering logic
- [ ] Revenue calculation utilities
- [ ] Conflict severity classification
- [ ] Date range validation
- [ ] Scope parsing/formatting

**Integration Tests:**
- [ ] License list with filters
- [ ] Pagination navigation
- [ ] Conflict checker flow
- [ ] Revenue dashboard rendering
- [ ] Error handling

**E2E Tests:**
- [ ] Brand views own licenses
- [ ] Creator views asset licenses
- [ ] Admin views all licenses
- [ ] Filter and sort licenses
- [ ] Check conflicts before creation
- [ ] View revenue breakdown

---

**Continue to [Part 3: Advanced Features & Best Practices](./LICENSE_QUERIES_INTEGRATION_GUIDE_PART_3_ADVANCED.md)**
