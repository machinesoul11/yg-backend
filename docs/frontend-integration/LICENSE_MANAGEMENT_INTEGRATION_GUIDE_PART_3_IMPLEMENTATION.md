# License Management - Frontend Integration Guide (Part 3: Implementation & Best Practices)

**Classification:** ⚡ HYBRID

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Frontend Implementation Patterns](#frontend-implementation-patterns)
3. [React Query Integration](#react-query-integration)
4. [Real-time Updates & Polling](#real-time-updates--polling)
5. [Rate Limiting & Quotas](#rate-limiting--quotas)
6. [UX Considerations](#ux-considerations)
7. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Business Logic & Validation Rules

### Field Validation Requirements

#### Date Validation

```typescript
// Client-side validation rules
const validateDates = (startDate: Date, endDate: Date): string[] => {
  const errors: string[] = [];
  const now = new Date();
  
  // Start date cannot be in the past
  if (startDate < now) {
    errors.push('Start date cannot be in the past');
  }
  
  // End date must be after start date
  if (endDate <= startDate) {
    errors.push('End date must be after start date');
  }
  
  // Minimum license duration: 30 days
  const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (durationDays < 30) {
    errors.push('License duration must be at least 30 days');
  }
  
  // Maximum license duration: 10 years
  if (durationDays > 3650) {
    errors.push('License duration cannot exceed 10 years');
  }
  
  return errors;
};
```

#### Financial Validation

```typescript
const validateFinancials = (feeCents: number, revShareBps: number): string[] => {
  const errors: string[] = [];
  
  // Fee validation
  if (feeCents < 0) {
    errors.push('License fee cannot be negative');
  }
  
  if (feeCents > 10000000000) { // $100M max
    errors.push('License fee exceeds maximum allowed');
  }
  
  // Revenue share validation
  if (revShareBps < 0 || revShareBps > 10000) {
    errors.push('Revenue share must be between 0% and 100%');
  }
  
  // At least one compensation method required
  if (feeCents === 0 && revShareBps === 0) {
    errors.push('License must have either an upfront fee or revenue share');
  }
  
  return errors;
};
```

#### Scope Validation

```typescript
const validateScope = (scope: LicenseScope): string[] => {
  const errors: string[] = [];
  
  // At least one media type required
  const hasMedia = Object.values(scope.media).some(v => v === true);
  if (!hasMedia) {
    errors.push('At least one media type must be selected');
  }
  
  // At least one placement type required
  const hasPlacement = Object.values(scope.placement).some(v => v === true);
  if (!hasPlacement) {
    errors.push('At least one placement type must be selected');
  }
  
  // If EXCLUSIVE_TERRITORY, territories must be specified
  if (scope.geographic && scope.geographic.territories.length === 0) {
    errors.push('At least one territory must be selected for exclusive territory license');
  }
  
  // If exclusivity specified, category or competitors required
  if (scope.exclusivity) {
    if (!scope.exclusivity.category && (!scope.exclusivity.competitors || scope.exclusivity.competitors.length === 0)) {
      errors.push('Exclusivity must specify either category or competitor restrictions');
    }
  }
  
  return errors;
};
```

### Business Rules Enforcement

#### License Creation Rules

1. **Asset Availability**
   - IP asset must exist and not be deleted
   - Asset must have completed metadata extraction
   - Asset must have verified ownership

2. **Brand Authorization**
   - Brand must be verified (`verificationStatus: 'VERIFIED'`)
   - Brand must not be suspended
   - Brand must match session user's brandId (unless admin)

3. **Conflict Prevention**
   - Always run conflict check before submission
   - Show warnings for date overlaps even if not blocking
   - Suggest alternative date ranges if conflicts found

4. **Pricing Requirements**
   - Either `feeCents > 0` OR `revShareBps > 0` must be true
   - `billingFrequency` required if `revShareBps > 0`
   - Payment terms recommended for fees > $50,000

#### License Approval Rules

1. **Creator Authorization**
   - Only creators who own the IP asset can approve
   - Cannot approve if asset is disputed
   - Cannot approve if creator is suspended

2. **Status Transitions**
   - Can only approve licenses in `PENDING_APPROVAL` status
   - Approval transitions status to `ACTIVE` (if signed) or `DRAFT` (if unsigned)

3. **Automatic Actions on Approval**
   - Email notification sent to brand
   - If both parties already signed, license becomes `ACTIVE`
   - Creator's `lastApprovalAt` timestamp updated

#### License Signing Rules

1. **Signature Requirements**
   - Both brand AND creator must sign
   - Order doesn't matter
   - Each party can only sign once
   - Signatures are immutable after both parties sign

2. **Execution Timing**
   - License status changes to `ACTIVE` when both parties sign
   - `signedAt` timestamp set when fully executed
   - Digital certificate generated upon full execution

3. **Signature Metadata**
   - IP address captured (for audit)
   - User agent captured (for audit)
   - Timestamp recorded
   - Cryptographic hash generated

### State Machine Transitions

```typescript
/**
 * License status state machine
 */
type StatusTransition = {
  from: LicenseStatus;
  to: LicenseStatus;
  trigger: string;
  conditions: string[];
};

const validTransitions: StatusTransition[] = [
  {
    from: 'DRAFT',
    to: 'PENDING_APPROVAL',
    trigger: 'Brand submits license',
    conditions: ['All required fields complete', 'No conflicts'],
  },
  {
    from: 'PENDING_APPROVAL',
    to: 'ACTIVE',
    trigger: 'Creator approves & both parties signed',
    conditions: ['Creator owns asset', 'Both signatures present'],
  },
  {
    from: 'PENDING_APPROVAL',
    to: 'DRAFT',
    trigger: 'Creator requests changes',
    conditions: ['Creator provides feedback'],
  },
  {
    from: 'ACTIVE',
    to: 'EXPIRED',
    trigger: 'End date passes (automated)',
    conditions: ['Current date > endDate'],
  },
  {
    from: 'ACTIVE',
    to: 'TERMINATED',
    trigger: 'Brand or admin terminates',
    conditions: ['Termination reason provided'],
  },
  {
    from: 'ACTIVE',
    to: 'SUSPENDED',
    trigger: 'Admin suspends',
    conditions: ['Valid suspension reason'],
  },
  {
    from: 'SUSPENDED',
    to: 'ACTIVE',
    trigger: 'Admin reactivates',
    conditions: ['Suspension issue resolved'],
  },
];
```

### Calculated Values & Derived Data

```typescript
/**
 * Compute license metrics on frontend
 */
interface LicenseMetrics {
  durationDays: number;
  daysRemaining: number;
  daysActive: number;
  utilizationPercent: number;
  isExpiringSoon: boolean;  // < 90 days
  isRenewable: boolean;
  costPerDay: number;
  displayStatus: string;
}

function calculateLicenseMetrics(license: LicenseResponse): LicenseMetrics {
  const startDate = new Date(license.startDate);
  const endDate = new Date(license.endDate);
  const now = new Date();
  
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  
  const remainingMs = endDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  
  const activeMs = Math.min(now.getTime(), endDate.getTime()) - startDate.getTime();
  const daysActive = Math.max(0, Math.ceil(activeMs / (1000 * 60 * 60 * 24)));
  
  const utilizationPercent = durationDays > 0 
    ? (daysActive / durationDays) * 100 
    : 0;
  
  const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 90 && license.status === 'ACTIVE';
  
  const isRenewable = license.status === 'ACTIVE' && daysRemaining <= 120;
  
  const costPerDay = license.feeCents > 0 && durationDays > 0
    ? license.feeCents / durationDays
    : 0;
  
  const displayStatus = getDisplayStatus(license, isExpiringSoon);
  
  return {
    durationDays,
    daysRemaining,
    daysActive,
    utilizationPercent: Math.round(utilizationPercent),
    isExpiringSoon,
    isRenewable,
    costPerDay,
    displayStatus,
  };
}

function getDisplayStatus(license: LicenseResponse, isExpiringSoon: boolean): string {
  if (license.status === 'ACTIVE' && isExpiringSoon) {
    return 'Expiring Soon';
  }
  
  const statusMap: Record<LicenseStatus, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Awaiting Approval',
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    TERMINATED: 'Terminated',
    SUSPENDED: 'Suspended',
  };
  
  return statusMap[license.status] || license.status;
}
```

---

## Frontend Implementation Patterns

### API Client Setup

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,  // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  }));
  
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          headers: async () => {
            // Session cookies automatically included
            return {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Component Patterns

#### License List Component

```typescript
// components/licenses/LicenseList.tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { LicenseCard } from './LicenseCard';
import { LicenseFilters as Filters } from '@/types/licenses';

export function LicenseList() {
  const [filters, setFilters] = useState<Filters>({
    status: 'ACTIVE',
    page: 1,
    pageSize: 20,
  });

  const { data, isLoading, error } = trpc.licenses.list.useQuery(filters);

  if (isLoading) {
    return <LoadingSkeleton count={5} />;
  }

  if (error) {
    return (
      <ErrorAlert 
        title="Failed to load licenses"
        message={error.message}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <EmptyState 
        icon={<DocumentIcon />}
        title="No licenses found"
        description="Create your first license to get started"
        action={<CreateLicenseButton />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <LicenseFilters filters={filters} onChange={setFilters} />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.data.map((license) => (
          <LicenseCard key={license.id} license={license} />
        ))}
      </div>

      <Pagination 
        currentPage={data.meta.pagination.page}
        totalPages={data.meta.pagination.totalPages}
        total={data.meta.pagination.total}
        pageSize={data.meta.pagination.pageSize}
        onPageChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

#### Create License Form

```typescript
// components/licenses/CreateLicenseForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trpc } from '@/lib/trpc';
import { CreateLicenseSchema } from '@/lib/schemas/license';
import type { CreateLicenseInput } from '@/types/licenses';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function CreateLicenseForm({ 
  ipAssetId, 
  brandId 
}: { 
  ipAssetId: string; 
  brandId: string; 
}) {
  const router = useRouter();
  const utils = trpc.useContext();
  
  const form = useForm<CreateLicenseInput>({
    resolver: zodResolver(CreateLicenseSchema),
    defaultValues: {
      ipAssetId,
      brandId,
      licenseType: 'NON_EXCLUSIVE',
      autoRenew: false,
      scope: {
        media: { digital: true, print: false, broadcast: false, ooh: false },
        placement: { social: true, website: true, email: false, paid_ads: false, packaging: false },
      },
    },
  });

  // Real-time conflict checking
  const { data: conflicts } = trpc.licenses.checkConflicts.useQuery(
    {
      ipAssetId: form.watch('ipAssetId'),
      startDate: form.watch('startDate'),
      endDate: form.watch('endDate'),
      licenseType: form.watch('licenseType'),
      scope: form.watch('scope'),
    },
    {
      enabled: Boolean(
        form.watch('ipAssetId') && 
        form.watch('startDate') && 
        form.watch('endDate')
      ),
      refetchOnWindowFocus: false,
    }
  );

  const createMutation = trpc.licenses.create.useMutation({
    onSuccess: (result) => {
      toast.success('License created successfully!');
      utils.licenses.list.invalidate();
      router.push(`/licenses/${result.data.id}`);
    },
    onError: (error) => {
      if (error.data?.code === 'CONFLICT') {
        toast.error('License conflicts with existing agreements');
      } else {
        toast.error(error.message || 'Failed to create license');
      }
    },
  });

  const onSubmit = (data: CreateLicenseInput) => {
    createMutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* License Type */}
      <LicenseTypeSelector 
        value={form.watch('licenseType')}
        onChange={(type) => form.setValue('licenseType', type)}
        error={form.formState.errors.licenseType?.message}
      />

      {/* Date Range */}
      <DateRangePicker
        startDate={form.watch('startDate')}
        endDate={form.watch('endDate')}
        onStartDateChange={(date) => form.setValue('startDate', date)}
        onEndDateChange={(date) => form.setValue('endDate', date)}
        errors={{
          startDate: form.formState.errors.startDate?.message,
          endDate: form.formState.errors.endDate?.message,
        }}
      />

      {/* Conflict Warning */}
      {conflicts?.hasConflicts && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conflicts Detected</AlertTitle>
          <AlertDescription>
            {conflicts.conflicts.map((conflict, i) => (
              <div key={i} className="mt-2">
                <strong>{conflict.reason}:</strong> {conflict.details}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Pricing */}
      <div className="grid grid-cols-2 gap-4">
        <CurrencyInput
          label="Upfront Fee"
          value={form.watch('feeCents')}
          onChange={(cents) => form.setValue('feeCents', cents)}
          error={form.formState.errors.feeCents?.message}
        />
        
        <PercentageInput
          label="Revenue Share"
          value={form.watch('revShareBps')}
          onChange={(bps) => form.setValue('revShareBps', bps)}
          error={form.formState.errors.revShareBps?.message}
        />
      </div>

      {/* Scope Builder */}
      <ScopeBuilder
        scope={form.watch('scope')}
        onChange={(scope) => form.setValue('scope', scope)}
        licenseType={form.watch('licenseType')}
      />

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button 
          type="button" 
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button 
          type="submit"
          disabled={createMutation.isLoading || conflicts?.hasConflicts}
          loading={createMutation.isLoading}
        >
          Create License
        </Button>
      </div>
    </form>
  );
}
```

#### License Details Page

```typescript
// app/licenses/[id]/page.tsx
'use client';

import { trpc } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import { LicenseHeader } from '@/components/licenses/LicenseHeader';
import { LicenseDetails } from '@/components/licenses/LicenseDetails';
import { LicenseActions } from '@/components/licenses/LicenseActions';
import { LicenseTimeline } from '@/components/licenses/LicenseTimeline';

export default function LicensePage() {
  const params = useParams();
  const licenseId = params.id as string;

  const { data, isLoading, error } = trpc.licenses.getById.useQuery(
    { id: licenseId },
    {
      refetchInterval: 30000,  // Refresh every 30s for status updates
    }
  );

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorPage error={error} />;
  if (!data) return <NotFoundPage />;

  const license = data.data;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <LicenseHeader license={license} />
      
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <LicenseDetails license={license} />
          <LicenseTimeline licenseId={license.id} />
        </div>
        
        <div className="lg:col-span-1">
          <LicenseActions license={license} />
        </div>
      </div>
    </div>
  );
}
```

---

## React Query Integration

### Query Configuration

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Licenses are relatively stable, cache for 1 minute
      staleTime: 60 * 1000,
      
      // Retry failed requests
      retry: 1,
      
      // Don't refetch on window focus (can be expensive)
      refetchOnWindowFocus: false,
      
      // Keep data in cache for 5 minutes after component unmount
      cacheTime: 5 * 60 * 1000,
    },
    mutations: {
      // Retry mutations once on network error
      retry: (failureCount, error: any) => {
        if (error.data?.code === 'CONFLICT') return false;
        if (error.data?.code === 'FORBIDDEN') return false;
        return failureCount < 1;
      },
    },
  },
});
```

### Optimistic Updates

```typescript
// hooks/useLicenseMutations.ts
import { trpc } from '@/lib/trpc';
import type { LicenseResponse } from '@/types/licenses';

export function useLicenseMutations() {
  const utils = trpc.useContext();

  const approveMutation = trpc.licenses.approve.useMutation({
    // Optimistic update
    onMutate: async ({ id }) => {
      // Cancel outgoing refetches
      await utils.licenses.getById.cancel({ id });

      // Snapshot current value
      const previousLicense = utils.licenses.getById.getData({ id });

      // Optimistically update
      utils.licenses.getById.setData({ id }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            status: 'ACTIVE' as const,
          },
        };
      });

      return { previousLicense };
    },
    
    // Rollback on error
    onError: (err, { id }, context) => {
      utils.licenses.getById.setData({ id }, context?.previousLicense);
      toast.error('Failed to approve license');
    },
    
    // Refetch on success
    onSuccess: (data, { id }) => {
      utils.licenses.getById.invalidate({ id });
      utils.licenses.list.invalidate();
      toast.success('License approved successfully!');
    },
  });

  return {
    approveMutation,
    // ... other mutations
  };
}
```

### Pagination State Management

```typescript
// hooks/useLicensePagination.ts
import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import type { LicenseFilters } from '@/types/licenses';

export function useLicensePagination(initialFilters: Partial<LicenseFilters> = {}) {
  const [filters, setFilters] = useState<LicenseFilters>({
    page: 1,
    pageSize: 20,
    ...initialFilters,
  });

  const { data, isLoading, error, isPreviousData } = trpc.licenses.list.useQuery(
    filters,
    {
      keepPreviousData: true,  // Keep old data while fetching new page
    }
  );

  const goToPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const updateFilters = useCallback((newFilters: Partial<LicenseFilters>) => {
    setFilters((prev) => ({ 
      ...prev, 
      ...newFilters, 
      page: 1,  // Reset to page 1 when filters change
    }));
  }, []);

  const hasNextPage = data 
    ? data.meta.pagination.page < data.meta.pagination.totalPages
    : false;

  const hasPreviousPage = data
    ? data.meta.pagination.page > 1
    : false;

  return {
    licenses: data?.data || [],
    pagination: data?.meta.pagination,
    filters,
    isLoading,
    error,
    isPreviousData,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    updateFilters,
  };
}
```

### Prefetching

```typescript
// Prefetch license details on hover
function LicenseCard({ license }: { license: LicenseResponse }) {
  const utils = trpc.useContext();

  const handleMouseEnter = () => {
    utils.licenses.getById.prefetch({ id: license.id });
  };

  return (
    <Link 
      href={`/licenses/${license.id}`}
      onMouseEnter={handleMouseEnter}
    >
      {/* Card content */}
    </Link>
  );
}
```

---

## Real-time Updates & Polling

### Polling Strategy

Since the backend doesn't currently support WebSockets/SSE, use polling for real-time updates:

```typescript
// hooks/useLicensePolling.ts
import { trpc } from '@/lib/trpc';
import { useEffect } from 'react';

export function useLicensePolling(licenseId: string) {
  const { data, refetch } = trpc.licenses.getById.useQuery(
    { id: licenseId },
    {
      // Poll every 30 seconds
      refetchInterval: 30000,
      
      // Only poll when window is focused
      refetchIntervalInBackground: false,
    }
  );

  // Custom polling for specific statuses
  useEffect(() => {
    if (data?.data.status === 'PENDING_APPROVAL') {
      // Poll more frequently for pending approvals (every 10s)
      const interval = setInterval(() => {
        refetch();
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [data?.data.status, refetch]);

  return data;
}
```

### Event-Based Refetching

```typescript
// hooks/useLicenseEvents.ts
import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';

export function useLicenseEvents() {
  const utils = trpc.useContext();

  useEffect(() => {
    // Listen for custom events from other components
    const handleLicenseUpdate = (event: CustomEvent) => {
      const { licenseId } = event.detail;
      
      // Invalidate specific license
      utils.licenses.getById.invalidate({ id: licenseId });
      
      // Invalidate list if needed
      utils.licenses.list.invalidate();
    };

    window.addEventListener('licenseUpdated', handleLicenseUpdate as EventListener);

    return () => {
      window.removeEventListener('licenseUpdated', handleLicenseUpdate as EventListener);
    };
  }, [utils]);
}

// Dispatch event after mutation
function SignLicenseButton({ licenseId }: { licenseId: string }) {
  const signMutation = trpc.licenses.sign.useMutation({
    onSuccess: () => {
      // Dispatch custom event
      window.dispatchEvent(
        new CustomEvent('licenseUpdated', { 
          detail: { licenseId } 
        })
      );
    },
  });

  // ...
}
```

### Notification-Based Updates

```typescript
// Listen for backend notifications (if notification system exists)
import { useNotifications } from '@/hooks/useNotifications';

function useLicenseNotifications() {
  const utils = trpc.useContext();
  
  useNotifications({
    onNotification: (notification) => {
      if (notification.type === 'LICENSE_APPROVED') {
        utils.licenses.getById.invalidate({ id: notification.resourceId });
        utils.licenses.list.invalidate();
      }
      
      if (notification.type === 'LICENSE_SIGNED') {
        utils.licenses.getById.invalidate({ id: notification.resourceId });
      }
    },
  });
}
```

---

## Rate Limiting & Quotas

### Current Implementation

Based on the codebase analysis, **licenses module does not have explicit rate limiting**. However, follow these best practices:

### Client-Side Rate Limiting

```typescript
// utils/rateLimiter.ts
import { throttle, debounce } from 'lodash';

/**
 * Throttle conflict checks to max 1 per second
 */
export const throttledConflictCheck = throttle(
  (checkFn: () => void) => checkFn(),
  1000,
  { leading: true, trailing: true }
);

/**
 * Debounce search/filter updates to reduce API calls
 */
export const debouncedFilterUpdate = debounce(
  (updateFn: (filters: any) => void, filters: any) => updateFn(filters),
  300
);
```

### Request Batching

```typescript
// tRPC automatically batches requests within 10ms window
// No additional configuration needed

// Example: These will be batched into a single HTTP request
const license1 = trpc.licenses.getById.useQuery({ id: 'license1' });
const license2 = trpc.licenses.getById.useQuery({ id: 'license2' });
const stats = trpc.licenses.stats.useQuery({});
```

### Recommended Limits (Self-Imposed)

| Action | Recommended Limit | Implementation |
|--------|-------------------|----------------|
| Conflict checks | 1 per second | Throttle on client |
| List queries | 5 per minute | Debounce filters |
| Create license | 10 per hour | Show warning after 5 |
| Sign license | Unlimited | No limit needed |
| Update license | 30 per hour | Track in state |

```typescript
// Example: Warn user after creating many licenses
function useCreateLicenseLimit() {
  const [recentCreations, setRecentCreations] = useState<Date[]>([]);

  const checkLimit = () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = recentCreations.filter(d => d > oneHourAgo).length;
    
    if (recentCount >= 10) {
      toast.warning('You\'ve created many licenses recently. Please verify details carefully.');
    }
    
    return recentCount < 15;  // Hard limit
  };

  const recordCreation = () => {
    setRecentCreations(prev => [...prev, new Date()]);
  };

  return { checkLimit, recordCreation };
}
```

---

## UX Considerations

### Loading States

```typescript
// Show skeleton while loading
function LicenseListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      ))}
    </div>
  );
}
```

### Error States

```typescript
// User-friendly error messages
function LicenseError({ error, onRetry }: { error: TRPCClientError, onRetry: () => void }) {
  const getErrorMessage = () => {
    switch (error.data?.code) {
      case 'FORBIDDEN':
        return {
          title: 'Access Denied',
          message: 'You don\'t have permission to view this license.',
          action: null,
        };
      case 'NOT_FOUND':
        return {
          title: 'License Not Found',
          message: 'This license may have been deleted or you may not have access.',
          action: 'Go Back',
        };
      case 'INTERNAL_SERVER_ERROR':
        return {
          title: 'Something Went Wrong',
          message: 'We\'re having trouble loading this license. Please try again.',
          action: 'Retry',
        };
      default:
        return {
          title: 'Error',
          message: error.message || 'An unexpected error occurred.',
          action: 'Retry',
        };
    }
  };

  const { title, message, action } = getErrorMessage();

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{message}</p>
      {action && (
        <Button onClick={onRetry}>
          {action}
        </Button>
      )}
    </div>
  );
}
```

### Empty States

```typescript
// Contextual empty states
function EmptyLicenseState({ context }: { context: 'brand' | 'creator' | 'admin' }) {
  const config = {
    brand: {
      title: 'No Licenses Yet',
      message: 'Start licensing creator IP to use in your campaigns',
      action: 'Browse IP Assets',
      icon: <Search className="h-12 w-12" />,
    },
    creator: {
      title: 'No License Requests',
      message: 'Brands will request licenses for your IP assets',
      action: 'Upload IP Assets',
      icon: <Upload className="h-12 w-12" />,
    },
    admin: {
      title: 'No Licenses in System',
      message: 'No licenses have been created yet',
      action: null,
      icon: <FileText className="h-12 w-12" />,
    },
  };

  const { title, message, action, icon } = config[context];

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      {icon}
      <h3 className="text-xl font-semibold mt-4 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-md">{message}</p>
      {action && (
        <Button>{action}</Button>
      )}
    </div>
  );
}
```

### Success Feedback

```typescript
// Toast notifications for mutations
import { toast } from 'sonner';

const createMutation = trpc.licenses.create.useMutation({
  onSuccess: () => {
    toast.success('License Created', {
      description: 'Creator has been notified for approval',
      action: {
        label: 'View',
        onClick: () => router.push(`/licenses/${result.data.id}`),
      },
    });
  },
});

const signMutation = trpc.licenses.sign.useMutation({
  onSuccess: (result) => {
    if (result.meta.allPartiesSigned) {
      toast.success('License Executed!', {
        description: 'All parties have signed. License is now active.',
        icon: '🎉',
      });
    } else {
      toast.success('Signature Recorded', {
        description: result.meta.message,
      });
    }
  },
});
```

### Progressive Disclosure

```typescript
// Show advanced options only when needed
function LicenseForm() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <form>
      {/* Basic fields always visible */}
      <BasicFields />

      {/* Advanced options collapsed by default */}
      {showAdvanced ? (
        <>
          <AdvancedScopeOptions />
          <ExclusivitySettings />
          <CustomMetadata />
        </>
      ) : (
        <Button 
          type="button" 
          variant="ghost"
          onClick={() => setShowAdvanced(true)}
        >
          Show Advanced Options
        </Button>
      )}
    </form>
  );
}
```

### Inline Validation

```typescript
// Real-time validation feedback
function DateRangeInput() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (end <= start) {
        setError('End date must be after start date');
      } else {
        setError('');
      }
    }
  }, [startDate, endDate]);

  return (
    <div>
      <input 
        type="date" 
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
      />
      <input 
        type="date" 
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Core Features (Week 1)

**API Client Setup**
- [ ] Install tRPC client dependencies
- [ ] Configure tRPC provider
- [ ] Set up QueryClient with appropriate defaults
- [ ] Test authentication flow with license endpoints

**Type Definitions**
- [ ] Copy TypeScript types from Part 2
- [ ] Create Zod schemas for form validation
- [ ] Set up type-safe tRPC hooks

**License List**
- [ ] Build license list component with pagination
- [ ] Implement filter UI (status, date range, etc.)
- [ ] Add loading skeletons
- [ ] Add empty states for no results
- [ ] Implement role-based filtering (auto-filter for brands/creators)

**License Details**
- [ ] Build license detail page
- [ ] Display all license information
- [ ] Show related IP asset, brand, project
- [ ] Display status badges and timeline
- [ ] Implement polling for status updates (30s interval)

---

### Phase 2: License Creation (Week 1-2)

**Create License Form**
- [ ] Build multi-step wizard or single form
- [ ] Implement license type selector
- [ ] Build date range picker with validation
- [ ] Create pricing inputs (fee + rev share)
- [ ] Build scope builder UI
  - [ ] Media type checkboxes
  - [ ] Placement type checkboxes
  - [ ] Territory selector (for EXCLUSIVE_TERRITORY)
  - [ ] Exclusivity settings
  - [ ] Attribution settings
- [ ] Implement real-time conflict checking
- [ ] Show conflict warnings with details
- [ ] Add form validation (client + server)
- [ ] Handle creation errors gracefully
- [ ] Redirect to license details on success

---

### Phase 3: Approval & Signing (Week 2)

**Creator Approval**
- [ ] Build approval interface for creators
- [ ] Show pending approvals dashboard
- [ ] Display license details for review
- [ ] Implement approve button with confirmation
- [ ] Add request changes workflow
- [ ] Show approval history/timeline

**Digital Signing**
- [ ] Build signing interface
- [ ] Show terms and conditions
- [ ] Capture user consent
- [ ] Display signature status (who signed, when)
- [ ] Show "awaiting signature" state
- [ ] Celebrate full execution (both parties signed)
- [ ] Generate/download digital certificate

---

### Phase 4: License Management (Week 2-3)

**Update License**
- [ ] Build edit form (limited fields)
- [ ] Validate permissions (brand owner only)
- [ ] Show field-level change tracking
- [ ] Implement optimistic updates

**Terminate License**
- [ ] Build termination modal
- [ ] Require termination reason (10-500 chars)
- [ ] Optional effective date picker
- [ ] Show confirmation warning
- [ ] Display termination notification

**License Statistics**
- [ ] Build stats dashboard
- [ ] Display KPI cards
  - [ ] Total active licenses
  - [ ] Total revenue
  - [ ] Expiring soon count
  - [ ] Renewal rate
- [ ] Add charts for visualizations
- [ ] Filter by brand (brands auto-filtered)

---

### Phase 5: Advanced Features (Week 3-4)

**Renewals**
- [ ] Build renewal eligibility checker
- [ ] Display suggested renewal terms
- [ ] Implement renewal offer generator
- [ ] Show pricing strategy options
- [ ] Build offer acceptance flow
- [ ] Display renewal pipeline (admin)
- [ ] Show renewal analytics (admin)

**Performance Metrics**
- [ ] Build license ROI calculator
- [ ] Display utilization metrics
- [ ] Show performance dashboard
- [ ] Create charts for trends

**Conflict Management**
- [ ] Build conflict preview interface
- [ ] Show suggested alternative dates
- [ ] Display blocking vs warning conflicts
- [ ] Implement conflict resolution suggestions

---

### Phase 6: Polish & UX (Week 4)

**Error Handling**
- [ ] Implement centralized error handler
- [ ] User-friendly error messages for all error codes
- [ ] Retry mechanisms for failed requests
- [ ] Log errors to monitoring service

**Loading States**
- [ ] Add skeleton loaders for all lists
- [ ] Spinner for button actions
- [ ] Progress indicators for multi-step forms
- [ ] Optimistic UI updates where appropriate

**Notifications**
- [ ] Toast notifications for all mutations
- [ ] Success/error/warning states
- [ ] Action buttons in toasts (e.g., "View License")
- [ ] Email notification preferences

**Accessibility**
- [ ] Keyboard navigation for all forms
- [ ] ARIA labels for screen readers
- [ ] Focus management in modals
- [ ] Color contrast compliance
- [ ] Mobile-responsive design

---

### Testing Checklist

**Unit Tests**
- [ ] Test form validation logic
- [ ] Test date calculations
- [ ] Test financial calculations
- [ ] Test permission checks

**Integration Tests**
- [ ] Test create license flow
- [ ] Test approval flow
- [ ] Test signing flow
- [ ] Test renewal flow
- [ ] Test termination flow

**E2E Tests**
- [ ] Brand creates license → Creator approves → Both sign
- [ ] Check for conflicts → Resolve → Create license
- [ ] License expires → Generate renewal → Accept
- [ ] Active license → Terminate with reason

---

### Documentation

- [ ] Component documentation (Storybook)
- [ ] API usage examples
- [ ] Common error scenarios and solutions
- [ ] Testing guide for QA
- [ ] Deployment checklist

---

## Summary

This comprehensive guide covered:

✅ **Part 1:** API endpoints, authentication, authorization  
✅ **Part 2:** Advanced features, TypeScript types, request/response examples  
✅ **Part 3:** Business logic, frontend patterns, React Query, UX, implementation checklist

### Key Takeaways

1. **Authentication:** JWT via NextAuth.js, automatic with tRPC
2. **Authorization:** Role-based + resource-level permissions
3. **Validation:** Client-side (Zod) + server-side enforcement
4. **Real-time:** Polling every 30s (no WebSockets yet)
5. **Rate Limiting:** Self-imposed client-side throttling
6. **Error Handling:** User-friendly messages with retry logic
7. **UX:** Loading skeletons, optimistic updates, inline validation

### Next Steps

1. Set up tRPC client and providers
2. Implement Phase 1 (core features)
3. Build license creation flow
4. Implement approval and signing
5. Add advanced features (renewals, analytics)
6. Polish UX and accessibility
7. Write tests
8. Deploy and monitor

---

**Questions or Issues?**  
Refer to existing integration guides in `/docs/frontend-integration/` for similar patterns used in IP Assets, Projects, and Messaging modules.
