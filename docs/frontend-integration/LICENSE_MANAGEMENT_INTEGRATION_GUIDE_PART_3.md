# License Management - Frontend Integration Guide (Part 3 of 3)
**Classification: ⚡ HYBRID**

---

## Table of Contents - Part 3
1. [Rate Limiting & Quotas](#rate-limiting--quotas)
2. [Real-time Updates & Notifications](#real-time-updates--notifications)
3. [Pagination & Filtering](#pagination--filtering)
4. [Frontend Implementation Checklist](#frontend-implementation-checklist)
5. [Testing & Edge Cases](#testing--edge-cases)
6. [Performance Optimization](#performance-optimization)

---

## Rate Limiting & Quotas

### Rate Limit Configuration

The backend implements rate limiting on mutation operations to prevent abuse:

| Operation Type | Limit | Window | Scope |
|---------------|-------|--------|-------|
| Create License | 10 requests | 1 minute | Per user |
| Update License | 20 requests | 1 minute | Per user |
| Approve/Reject Actions | 30 requests | 1 minute | Per user |
| List/Query Operations | 60 requests | 1 minute | Per user |
| Amendment Operations | 15 requests | 1 minute | Per user |
| Extension Operations | 15 requests | 1 minute | Per user |

### Rate Limit Headers

The API returns rate limit information in response headers:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Maximum requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining
  'X-RateLimit-Reset': string;      // Unix timestamp when limit resets
}
```

### Handling Rate Limits

**Detecting rate limits**:
```typescript
function isRateLimited(error: any): boolean {
  return error.statusCode === 429 || error.code === 'TOO_MANY_REQUESTS';
}

function getRetryAfter(error: any): number {
  // Returns seconds until rate limit resets
  const resetTime = error.headers?.['x-ratelimit-reset'];
  if (!resetTime) return 60; // Default 60 seconds
  
  const now = Math.floor(Date.now() / 1000);
  const secondsUntilReset = parseInt(resetTime) - now;
  return Math.max(secondsUntilReset, 0);
}
```

**Retry logic with exponential backoff**:
```typescript
import { useMutation } from '@tanstack/react-query';

function useCreateLicenseWithRetry() {
  return useMutation({
    mutationFn: createLicense,
    retry: (failureCount, error) => {
      if (isRateLimited(error)) {
        return failureCount < 3; // Retry up to 3 times
      }
      return false;
    },
    retryDelay: (attemptIndex, error) => {
      if (isRateLimited(error)) {
        const retryAfter = getRetryAfter(error);
        return retryAfter * 1000; // Convert to milliseconds
      }
      return Math.min(1000 * 2 ** attemptIndex, 30000); // Exponential backoff, max 30s
    }
  });
}
```

**User feedback for rate limits**:
```typescript
function RateLimitToast({ retryAfter }: { retryAfter: number }) {
  const [countdown, setCountdown] = React.useState(retryAfter);
  
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">Rate limit exceeded</p>
      <p className="text-sm text-muted-foreground">
        Please wait {countdown} seconds before trying again
      </p>
      <Progress value={((retryAfter - countdown) / retryAfter) * 100} />
    </div>
  );
}
```

---

## Real-time Updates & Notifications

### Notification Events

The backend sends real-time notifications for license-related events:

| Event | Trigger | Recipients | Notification Type |
|-------|---------|-----------|-------------------|
| `license.created` | New license created | Creator(s) | IN_APP + EMAIL |
| `license.approved` | Creator approves | Brand | IN_APP + EMAIL |
| `license.expiring_soon` | 30 days before expiry | Brand + Creator(s) | IN_APP + EMAIL |
| `license.expired` | End date passed | Brand + Creator(s) | IN_APP |
| `license.terminated` | Early termination | Brand + Creator(s) | IN_APP + EMAIL |
| `amendment.proposed` | Amendment proposed | Opposite party | IN_APP + EMAIL |
| `amendment.approved` | Amendment approved | All parties | IN_APP + EMAIL |
| `amendment.rejected` | Amendment rejected | Proposer | IN_APP + EMAIL |
| `extension.requested` | Extension requested | Creator(s) | IN_APP + EMAIL |
| `extension.approved` | Extension approved | Brand | IN_APP + EMAIL |
| `extension.rejected` | Extension rejected | Brand | IN_APP + EMAIL |
| `renewal.offer_generated` | Renewal offer created | Brand + Creator(s) | IN_APP + EMAIL |
| `renewal.accepted` | Renewal accepted | Creator(s) | IN_APP + EMAIL |

### Polling for Updates

**Recommended polling intervals**:
- **Active license list**: 30 seconds
- **License detail page**: 10 seconds (if PENDING status)
- **Pending approvals**: 20 seconds
- **Dashboard stats**: 60 seconds

**Efficient polling with React Query**:
```typescript
function useLicenseWithPolling(licenseId: string) {
  const { data: license } = useQuery({
    queryKey: ['licenses', licenseId],
    queryFn: () => trpc.licenses.getById.query({ licenseId }),
    refetchInterval: (data) => {
      // Poll more frequently for pending statuses
      if (data?.status === 'PENDING_APPROVAL') return 10000; // 10s
      if (data?.status === 'ACTIVE') return 30000; // 30s
      return false; // No polling for terminal states
    },
    refetchOnWindowFocus: true,
  });
  
  return license;
}
```

### In-App Notifications

**Subscribe to notification updates**:
```typescript
function useNotificationPolling() {
  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => trpc.notifications.getUnread.query(),
    refetchInterval: 15000, // Poll every 15 seconds
  });
  
  const unreadCount = notifications?.length || 0;
  
  return { notifications, unreadCount };
}
```

**Notification bell component**:
```typescript
function NotificationBell() {
  const { notifications, unreadCount } = useNotificationPolling();
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <NotificationList notifications={notifications} />
      </PopoverContent>
    </Popover>
  );
}
```

### Email Notifications

Users receive email notifications for critical events. Frontend should:

1. **Display email preferences UI**:
```typescript
function EmailPreferences() {
  const { data: prefs } = useQuery({
    queryKey: ['emailPreferences'],
    queryFn: () => trpc.emailPreferences.get.query()
  });
  
  const updatePref = useMutation({
    mutationFn: (updates: Partial<EmailPreferences>) =>
      trpc.emailPreferences.update.mutate(updates)
  });
  
  return (
    <div className="space-y-4">
      <Switch
        checked={prefs?.licenseExpiry}
        onCheckedChange={(checked) => 
          updatePref.mutate({ licenseExpiry: checked })
        }
      >
        License expiry notifications
      </Switch>
      <Switch
        checked={prefs?.projectInvitations}
        onCheckedChange={(checked) => 
          updatePref.mutate({ projectInvitations: checked })
        }
      >
        Project invitation emails
      </Switch>
    </div>
  );
}
```

---

## Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination** (page numbers):

```typescript
interface PaginationParams {
  page: number;       // 1-indexed (first page = 1)
  pageSize: number;   // Default: 20, Max: 100
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;        // Total items across all pages
      totalPages: number;   // Total number of pages
    }
  }
}
```

### Available Filters

```typescript
interface LicenseFilters {
  // Status filters
  status?: LicenseStatus | LicenseStatus[];
  
  // Entity filters
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  creatorId?: string;
  
  // Type filter
  licenseType?: LicenseType;
  
  // Date filters
  expiringBefore?: string;      // ISO date
  createdAfter?: string;        // ISO date
  createdBefore?: string;       // ISO date
  
  // Pagination
  page?: number;
  pageSize?: number;
  
  // Sorting
  sortBy?: 'createdAt' | 'endDate' | 'feeCents' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

### Frontend Pagination Component

**Using shadcn/ui pagination**:
```typescript
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';

function LicenseListPagination({ 
  page, 
  totalPages, 
  onPageChange 
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="outline"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
        </PaginationItem>
        
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <PaginationItem key={pageNum}>
            <Button
              variant={page === pageNum ? 'default' : 'outline'}
              onClick={() => onPageChange(pageNum)}
            >
              {pageNum}
            </Button>
          </PaginationItem>
        ))}
        
        <PaginationItem>
          <Button
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
```

### Filter Component

**Multi-filter interface**:
```typescript
function LicenseFilters({ 
  filters, 
  onFiltersChange 
}: {
  filters: LicenseFilters;
  onFiltersChange: (filters: LicenseFilters) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Status filter */}
      <Select
        value={filters.status || ''}
        onValueChange={(value) => 
          onFiltersChange({ ...filters, status: value as LicenseStatus })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Statuses</SelectItem>
          {Object.values(LicenseStatus).map((status) => (
            <SelectItem key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* License type filter */}
      <Select
        value={filters.licenseType || ''}
        onValueChange={(value) => 
          onFiltersChange({ ...filters, licenseType: value as LicenseType })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Types</SelectItem>
          <SelectItem value="EXCLUSIVE">Exclusive</SelectItem>
          <SelectItem value="NON_EXCLUSIVE">Non-Exclusive</SelectItem>
          <SelectItem value="EXCLUSIVE_TERRITORY">Exclusive Territory</SelectItem>
        </SelectContent>
      </Select>
      
      {/* Date range filter */}
      <DateRangePicker
        value={{
          from: filters.createdAfter ? new Date(filters.createdAfter) : undefined,
          to: filters.createdBefore ? new Date(filters.createdBefore) : undefined
        }}
        onChange={(range) => 
          onFiltersChange({
            ...filters,
            createdAfter: range?.from?.toISOString(),
            createdBefore: range?.to?.toISOString()
          })
        }
      />
      
      {/* Clear filters */}
      <Button
        variant="outline"
        onClick={() => onFiltersChange({})}
      >
        Clear Filters
      </Button>
    </div>
  );
}
```

### Complete List Component

```typescript
function LicenseList() {
  const [filters, setFilters] = React.useState<LicenseFilters>({
    page: 1,
    pageSize: 20
  });
  
  const { data, isLoading } = useQuery({
    queryKey: ['licenses', filters],
    queryFn: () => trpc.licenses.list.query(filters)
  });
  
  if (isLoading) return <LicenseListSkeleton />;
  
  return (
    <div className="space-y-6">
      <LicenseFilters 
        filters={filters} 
        onFiltersChange={setFilters} 
      />
      
      <div className="grid gap-4">
        {data?.data.map((license) => (
          <LicenseCard key={license.id} license={license} />
        ))}
      </div>
      
      {data && (
        <LicenseListPagination
          page={filters.page || 1}
          totalPages={data.meta.pagination.totalPages}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      )}
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic CRUD Operations ✅

- [ ] **Setup tRPC client** with authentication
- [ ] **Create License Form**
  - [ ] Form validation with Zod
  - [ ] Scope builder UI (media, placement, geographic)
  - [ ] Fee calculator (display cents as dollars)
  - [ ] Date range picker
  - [ ] Conflict check before submission
- [ ] **License List Page**
  - [ ] Filterable table/grid
  - [ ] Pagination
  - [ ] Status badges
  - [ ] Quick actions (approve, view, edit)
- [ ] **License Detail Page**
  - [ ] Full license information
  - [ ] Status timeline
  - [ ] Action buttons (context-aware)
  - [ ] Related renewals/amendments display
- [ ] **Approve License Flow**
  - [ ] Creator approval modal
  - [ ] Signature proof upload (future)
  - [ ] Confirmation screen

### Phase 2: Advanced Features ✅

- [ ] **Amendment System**
  - [ ] Propose amendment form
  - [ ] Amendment diff viewer (before/after values)
  - [ ] Approval interface for creators
  - [ ] Amendment history timeline
- [ ] **Extension System**
  - [ ] Request extension form
  - [ ] Fee calculation preview
  - [ ] Creator approval interface
  - [ ] Extension history display
- [ ] **Renewal System**
  - [ ] Eligibility checker
  - [ ] Renewal offer display
  - [ ] Offer acceptance flow
  - [ ] Renewal pricing breakdown
- [ ] **Conflict Detection UI**
  - [ ] Real-time conflict checking
  - [ ] Conflict details modal
  - [ ] Resolution suggestions

### Phase 3: UX Enhancements ✅

- [ ] **Dashboard Widgets**
  - [ ] Expiring licenses alert
  - [ ] Pending approvals counter
  - [ ] Revenue metrics
  - [ ] Renewal opportunities
- [ ] **Notifications**
  - [ ] In-app notification center
  - [ ] Email preference settings
  - [ ] Real-time polling
  - [ ] Push notifications (web push)
- [ ] **Search & Filters**
  - [ ] Full-text search
  - [ ] Advanced filter builder
  - [ ] Saved filter presets
  - [ ] Export to CSV
- [ ] **Analytics & Reporting**
  - [ ] License performance charts
  - [ ] Revenue over time
  - [ ] Renewal rate trends
  - [ ] Extension analytics

### Phase 4: Admin Tools 🔒

- [ ] **Admin Dashboard**
  - [ ] All licenses overview
  - [ ] Manual status transitions
  - [ ] Dispute resolution
  - [ ] Bulk operations
- [ ] **Audit Logs**
  - [ ] Complete change history
  - [ ] User action tracking
  - [ ] Export audit trail
- [ ] **System Health**
  - [ ] Background job monitoring
  - [ ] Rate limit dashboard
  - [ ] Error tracking

---

## Testing & Edge Cases

### Unit Tests

**Test license creation validation**:
```typescript
describe('License Creation', () => {
  it('should validate date range', () => {
    const invalidLicense = {
      ...validLicenseData,
      startDate: '2024-12-01',
      endDate: '2024-11-01' // Before start
    };
    
    expect(() => licenseFormSchema.parse(invalidLicense)).toThrow(
      'End date must be after start date'
    );
  });
  
  it('should validate revenue share bounds', () => {
    const invalidLicense = {
      ...validLicenseData,
      revShareBps: 15000 // Over 100%
    };
    
    expect(() => licenseFormSchema.parse(invalidLicense)).toThrow(
      'Revenue share must be between 0-100%'
    );
  });
  
  it('should require at least one media type', () => {
    const invalidLicense = {
      ...validLicenseData,
      scope: {
        ...validLicenseData.scope,
        media: {
          digital: false,
          print: false,
          broadcast: false,
          ooh: false
        }
      }
    };
    
    expect(() => licenseFormSchema.parse(invalidLicense)).toThrow(
      'At least one media type must be selected'
    );
  });
});
```

### Integration Tests

**Test complete license workflow**:
```typescript
describe('License Approval Workflow', () => {
  it('should complete full approval flow', async () => {
    // 1. Brand creates license
    const newLicense = await createLicense({
      ...licenseData,
      status: 'DRAFT'
    });
    expect(newLicense.status).toBe('PENDING_APPROVAL');
    
    // 2. Creator receives notification
    const notifications = await getNotifications(creatorId);
    expect(notifications).toContainEqual(
      expect.objectContaining({
        type: 'license.created',
        licenseId: newLicense.id
      })
    );
    
    // 3. Creator approves
    const approvedLicense = await approveLicense(newLicense.id, creatorId);
    expect(approvedLicense.status).toBe('ACTIVE');
    
    // 4. Brand receives approval notification
    const brandNotifications = await getNotifications(brandId);
    expect(brandNotifications).toContainEqual(
      expect.objectContaining({
        type: 'license.approved'
      })
    );
  });
});
```

### Edge Cases to Handle

#### 1. Concurrent Amendment Approvals
**Scenario**: Two creators approve an amendment simultaneously
```typescript
// Frontend should handle race conditions
async function handleAmendmentApproval(amendmentId: string) {
  try {
    await trpc.licenses.processAmendmentApproval.mutate({
      amendmentId,
      action: 'approve'
    });
  } catch (error) {
    if (error.code === 'AMENDMENT_ALREADY_PROCESSED') {
      // Refresh amendment data
      queryClient.invalidateQueries(['amendments', amendmentId]);
      toast.info('Amendment has already been processed');
    }
  }
}
```

#### 2. License Expired During Editing
**Scenario**: User opens edit form for ACTIVE license, but it expires before submission
```typescript
function LicenseEditForm({ licenseId }: { licenseId: string }) {
  const { data: license } = useLicenseWithPolling(licenseId);
  
  React.useEffect(() => {
    if (license?.status === 'EXPIRED') {
      toast.warning('License has expired', {
        description: 'Your changes cannot be saved. Consider creating a renewal.'
      });
      // Disable form
    }
  }, [license?.status]);
  
  // ... form implementation
}
```

#### 3. Extension Conflict After Request
**Scenario**: Extension requested, but another license created in the meantime causes conflict
```typescript
// Backend detects conflict during approval
// Frontend should display conflict details
function ExtensionConflictAlert({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Extension Conflict Detected</AlertTitle>
      <AlertDescription>
        The requested extension would conflict with:
        {conflicts.map((c) => (
          <div key={c.licenseId}>
            {c.details}
          </div>
        ))}
        <p className="mt-2">Please adjust the extension period or contact the brand.</p>
      </AlertDescription>
    </Alert>
  );
}
```

#### 4. Renewal Offer Expired
**Scenario**: User tries to accept a renewal offer that has expired
```typescript
function RenewalOfferCard({ license }: { license: License }) {
  const renewalOffer = license.metadata?.renewalOffer;
  const isExpired = new Date(renewalOffer?.expiresAt) < new Date();
  
  if (isExpired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Renewal Offer Expired</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This renewal offer expired on {format(new Date(renewalOffer.expiresAt), 'PPP')}.</p>
          <Button onClick={generateNewOffer} className="mt-4">
            Generate New Offer
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  // ... active offer UI
}
```

#### 5. Network Interruption During Creation
**Scenario**: User loses connection while creating license
```typescript
function useCreateLicenseWithPersistence() {
  const mutation = useMutation({
    mutationFn: createLicense,
    onMutate: (variables) => {
      // Save draft to localStorage
      localStorage.setItem('license_draft', JSON.stringify(variables));
    },
    onSuccess: () => {
      // Clear draft on success
      localStorage.removeItem('license_draft');
    }
  });
  
  // Restore draft on mount
  React.useEffect(() => {
    const draft = localStorage.getItem('license_draft');
    if (draft) {
      const shouldRestore = confirm('Restore unsaved license draft?');
      if (shouldRestore) {
        const parsed = JSON.parse(draft);
        // Populate form with draft data
      } else {
        localStorage.removeItem('license_draft');
      }
    }
  }, []);
  
  return mutation;
}
```

---

## Performance Optimization

### Query Optimization

**1. Selective field fetching**:
```typescript
// Don't always fetch all relations
const { data: licenseSummary } = useQuery({
  queryKey: ['licenses', licenseId, 'summary'],
  queryFn: () => trpc.licenses.getById.query({ 
    licenseId, 
    includeRelations: false // Faster for list views
  })
});

const { data: licenseDetail } = useQuery({
  queryKey: ['licenses', licenseId, 'detail'],
  queryFn: () => trpc.licenses.getById.query({ 
    licenseId, 
    includeRelations: true // Full data for detail page
  }),
  enabled: isDetailPage // Only fetch when needed
});
```

**2. Prefetch on hover**:
```typescript
function LicenseCard({ license }: { license: License }) {
  const queryClient = useQueryClient();
  
  const prefetchDetail = () => {
    queryClient.prefetchQuery({
      queryKey: ['licenses', license.id, 'detail'],
      queryFn: () => trpc.licenses.getById.query({ 
        licenseId: license.id, 
        includeRelations: true 
      })
    });
  };
  
  return (
    <Card 
      onMouseEnter={prefetchDetail}
      onClick={() => router.push(`/licenses/${license.id}`)}
    >
      {/* ... card content */}
    </Card>
  );
}
```

**3. Infinite scroll for large lists**:
```typescript
function useLicensesInfinite(filters: LicenseFilters) {
  return useInfiniteQuery({
    queryKey: ['licenses', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) =>
      trpc.licenses.list.query({ ...filters, page: pageParam }),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta.pagination;
      return page < totalPages ? page + 1 : undefined;
    }
  });
}

function InfiniteLicenseList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = 
    useLicensesInfinite({});
  
  const { ref } = useInView({
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  });
  
  return (
    <div>
      {data?.pages.map((page) =>
        page.data.map((license) => (
          <LicenseCard key={license.id} license={license} />
        ))
      )}
      <div ref={ref}>{isFetchingNextPage && <Spinner />}</div>
    </div>
  );
}
```

### Caching Strategy

**React Query cache configuration**:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,        // 5 minutes
      cacheTime: 1000 * 60 * 30,       // 30 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    }
  }
});

// Custom cache times for specific queries
const { data: license } = useQuery({
  queryKey: ['licenses', licenseId],
  queryFn: fetchLicense,
  staleTime: license?.status === 'PENDING_APPROVAL' 
    ? 1000 * 10  // 10 seconds for pending
    : 1000 * 60 * 5  // 5 minutes for stable statuses
});
```

### Bundle Optimization

**Code splitting**:
```typescript
// Lazy load heavy components
const LicenseDetailPage = lazy(() => import('@/pages/licenses/[id]'));
const AmendmentModal = lazy(() => import('@/components/licenses/AmendmentModal'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/licenses/:id" element={<LicenseDetailPage />} />
      </Routes>
    </Suspense>
  );
}
```

**Tree shaking**:
```typescript
// Import only what you need
import { format } from 'date-fns/format';
import { differenceInDays } from 'date-fns/differenceInDays';
// Instead of: import { format, differenceInDays } from 'date-fns';
```

---

## Sample Implementation: Complete License Creation Flow

```typescript
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { licenseFormSchema, type LicenseFormData } from '@/lib/validations/license';

export function CreateLicenseForm({ 
  ipAssetId, 
  brandId, 
  onSuccess 
}: {
  ipAssetId: string;
  brandId: string;
  onSuccess?: (license: License) => void;
}) {
  const queryClient = useQueryClient();
  const [conflictCheckTrigger, setConflictCheckTrigger] = React.useState(0);
  
  // Form setup
  const form = useForm<LicenseFormData>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: {
      ipAssetId,
      brandId,
      licenseType: 'NON_EXCLUSIVE',
      feeCents: 0,
      revShareBps: 0,
      scope: {
        media: { digital: true, print: false, broadcast: false, ooh: false },
        placement: { social: true, website: false, email: false, paid_ads: false, packaging: false }
      },
      autoRenew: false
    }
  });
  
  // Watch form values for conflict checking
  const formValues = form.watch();
  
  // Conflict check query
  const { data: conflicts, isLoading: checkingConflicts } = useQuery({
    queryKey: ['conflicts', formValues, conflictCheckTrigger],
    queryFn: () => {
      if (!formValues.startDate || !formValues.endDate) return null;
      return trpc.licenses.checkConflicts.query({
        ipAssetId: formValues.ipAssetId,
        startDate: formValues.startDate,
        endDate: formValues.endDate,
        licenseType: formValues.licenseType,
        scope: formValues.scope
      });
    },
    enabled: !!formValues.startDate && !!formValues.endDate
  });
  
  // Create license mutation
  const createLicense = useMutation({
    mutationFn: (data: LicenseFormData) => 
      trpc.licenses.create.mutate(data),
    onSuccess: (license) => {
      toast.success('License created successfully', {
        description: 'The license is now pending creator approval'
      });
      queryClient.invalidateQueries(['licenses']);
      onSuccess?.(license);
    },
    onError: (error: any) => {
      const errorCode = error.data?.code || error.code;
      if (errorCode === 'LICENSE_CONFLICT') {
        toast.error('License Conflict Detected', {
          description: 'Please review the conflicts and adjust your license terms'
        });
      } else {
        toast.error('Failed to create license', {
          description: error.message
        });
      }
    }
  });
  
  const onSubmit = (data: LicenseFormData) => {
    if (conflicts?.hasConflicts) {
      toast.error('Cannot create license with conflicts', {
        description: 'Please resolve all conflicts before proceeding'
      });
      return;
    }
    createLicense.mutate(data);
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* License Type */}
        <FormField
          control={form.control}
          name="licenseType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>License Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select license type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="EXCLUSIVE">Exclusive</SelectItem>
                  <SelectItem value="NON_EXCLUSIVE">Non-Exclusive</SelectItem>
                  <SelectItem value="EXCLUSIVE_TERRITORY">Exclusive Territory</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        {/* Financial Terms */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="feeCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>License Fee</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) * 100)}
                    value={field.value / 100}
                  />
                </FormControl>
                <FormDescription>
                  Enter amount in dollars (e.g., 5000 for $5,000)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="revShareBps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Revenue Share %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.1"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) * 100)}
                    value={field.value / 100}
                  />
                </FormControl>
                <FormDescription>
                  Enter percentage (e.g., 5 for 5%)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        {/* Scope: Media Types */}
        <FormField
          control={form.control}
          name="scope.media"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Media Types</FormLabel>
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(field.value).map((key) => (
                  <FormControl key={key}>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={field.value[key as keyof typeof field.value]}
                        onChange={(e) => 
                          field.onChange({
                            ...field.value,
                            [key]: e.target.checked
                          })
                        }
                      />
                      <span className="capitalize">{key.replace('_', ' ')}</span>
                    </label>
                  </FormControl>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Conflict Display */}
        {conflicts?.hasConflicts && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Conflicts Detected</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1">
                {conflicts.conflicts.map((conflict, idx) => (
                  <li key={idx}>{conflict.details}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createLicense.isLoading || conflicts?.hasConflicts}
          >
            {createLicense.isLoading ? 'Creating...' : 'Create License'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

---

## Conclusion

This integration guide provides everything needed to implement the License Management system in your frontend. Key takeaways:

1. **Use tRPC** for type-safe API communication
2. **Implement proper validation** with Zod schemas
3. **Handle errors gracefully** with user-friendly messages
4. **Check permissions** before rendering actions
5. **Poll for updates** on pending/active resources
6. **Cache strategically** to minimize API calls
7. **Test edge cases** thoroughly

For questions or clarifications, refer to:
- **Backend Implementation**: `/docs/modules/licensing/LICENSE_MANAGEMENT_IMPLEMENTATION.md`
- **Quick Reference**: `/docs/modules/licensing/LICENSE_MANAGEMENT_QUICK_REFERENCE.md`
- **API Endpoints**: `/docs/modules/licensing/API_ENDPOINTS_IMPLEMENTATION_STATUS.md`

---

**End of License Management Integration Guide**
