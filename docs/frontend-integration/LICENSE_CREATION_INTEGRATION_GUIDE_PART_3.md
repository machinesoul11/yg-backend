# License Creation Module - Frontend Integration Guide (Part 3)

**Classification:** ⚡ HYBRID  
**Module:** License Creation & Management  
**Last Updated:** October 14, 2025  
**Version:** 1.0.0

---

## Rate Limiting & Quotas

### Rate Limits per Endpoint

The backend uses Redis-based rate limiting. Default limits:

| Endpoint Category | Limit | Window | Notes |
|------------------|-------|--------|-------|
| Standard API Calls | 100 requests | 1 hour | All tRPC endpoints |
| License Creation | 20 licenses | 1 hour | Prevents spam |
| License Updates | 50 updates | 1 hour | Per user |
| File Uploads (if applicable) | 20 uploads | 1 hour | Asset attachments |
| Signature Actions | 30 signatures | 1 hour | Signing licenses |

### Rate Limit Headers

When rate limited, responses include headers:

```typescript
// Rate limit headers (via tRPC error data)
{
  'X-RateLimit-Limit': '100',
  'X-RateLimit-Remaining': '0',
  'X-RateLimit-Reset': '1729000000'  // Unix timestamp
}
```

### Frontend Rate Limit Handling

```typescript
interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

// Check rate limit from error
function handleRateLimitError(error: TRPCError): RateLimitInfo | null {
  if (error.code === 'TOO_MANY_REQUESTS') {
    const resetAt = error.data?.resetAt 
      ? new Date(error.data.resetAt * 1000) 
      : new Date(Date.now() + 3600000); // Default to 1 hour
    
    return {
      limit: error.data?.limit || 100,
      remaining: 0,
      resetAt
    };
  }
  return null;
}

// Display rate limit message to user
function showRateLimitMessage(info: RateLimitInfo) {
  const minutesUntilReset = Math.ceil(
    (info.resetAt.getTime() - Date.now()) / 60000
  );
  
  showError(
    `You've reached the limit of ${info.limit} requests. ` +
    `Please try again in ${minutesUntilReset} minutes.`
  );
}

// Example usage
try {
  await trpc.licenses.create.mutate(data);
} catch (error) {
  const rateLimitInfo = handleRateLimitError(error);
  if (rateLimitInfo) {
    showRateLimitMessage(rateLimitInfo);
    // Optionally, disable the form until reset
    setFormDisabled(true);
    setTimeout(() => setFormDisabled(false), 
      rateLimitInfo.resetAt.getTime() - Date.now()
    );
  }
}
```

### Quota Management

**User Quotas (not currently implemented, but planned):**
- Free tier: 5 active licenses
- Pro tier: 50 active licenses
- Enterprise: Unlimited

```typescript
// Check quota before creating (client-side)
async function checkLicenseQuota() {
  const stats = await trpc.licenses.stats.query({ brandId: currentUser.brandId });
  
  const quota = {
    free: 5,
    pro: 50,
    enterprise: Infinity
  }[currentUser.tier];
  
  if (stats.totalActive >= quota) {
    throw new Error(`You've reached your license limit (${quota}). Upgrade to create more.`);
  }
}
```

---

## File Uploads (License Attachments)

While the license creation module doesn't directly handle file uploads, licenses can reference attached documents (e.g., signed PDFs, supplementary agreements).

### File Upload Flow

1. **Generate Signed Upload URL**
   - Call asset upload endpoint to get presigned URL
   - Upload directly to Cloudflare R2 (or configured storage)
   - Confirm upload to backend

2. **Attach to License**
   - Store file URL in `metadata.attachments`
   - Track file type, size, uploaded by

```typescript
interface LicenseAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

// Add to license metadata
const metadata = {
  ...existingMetadata,
  attachments: [
    {
      id: 'att_123',
      fileName: 'signed_agreement.pdf',
      fileType: 'application/pdf',
      fileSize: 524288, // bytes
      url: 'https://assets.yesgoddess.agency/licenses/clx.../signed_agreement.pdf',
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser.id
    }
  ]
};
```

### File Type Restrictions

```typescript
// Allowed file types for license attachments
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Validation
function validateFile(file: File): string | null {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return 'Invalid file type. Please upload PDF, JPEG, PNG, or Word documents.';
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return 'File size exceeds 10MB limit.';
  }
  
  return null; // Valid
}
```

---

## Real-time Updates

### Webhook Events

The backend triggers webhook events for license state changes. Frontend can subscribe to receive real-time updates.

**Available Events:**

```typescript
enum LicenseWebhookEvent {
  CREATED = 'license.created',
  UPDATED = 'license.updated',
  APPROVED = 'license.approved',
  SIGNED = 'license.signed',
  EXECUTED = 'license.executed',
  TERMINATED = 'license.terminated',
  EXPIRED = 'license.expired',
  RENEWED = 'license.renewed'
}

// Webhook payload structure
interface LicenseWebhookPayload {
  event: LicenseWebhookEvent;
  timestamp: string;
  data: {
    licenseId: string;
    status: LicenseStatus;
    previousStatus?: LicenseStatus;
    actor: {
      userId: string;
      role: string;
    };
    changes?: Record<string, any>;
  };
}
```

### Polling Recommendations

For clients that can't use webhooks:

```typescript
// Poll for license updates (when viewing a single license)
function useLicensePolling(licenseId: string, intervalMs: number = 30000) {
  const [license, setLicense] = useState<License | null>(null);
  
  useEffect(() => {
    // Initial fetch
    fetchLicense();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchLicense, intervalMs);
    
    return () => clearInterval(interval);
  }, [licenseId]);
  
  async function fetchLicense() {
    try {
      const result = await trpc.licenses.getById.query({ id: licenseId });
      setLicense(result.data);
    } catch (error) {
      console.error('Failed to fetch license:', error);
    }
  }
  
  return license;
}

// Usage
const license = useLicensePolling(licenseId);
```

**Polling Guidelines:**
- **Active license page:** Poll every 30 seconds
- **License list page:** Poll every 60 seconds (or use pagination refresh)
- **Dashboard/stats:** Poll every 5 minutes
- **Inactive tabs:** Stop polling (use Page Visibility API)

```typescript
// Stop polling when tab is not visible
useEffect(() => {
  function handleVisibilityChange() {
    if (document.hidden) {
      clearInterval(pollingInterval);
    } else {
      pollingInterval = setInterval(fetchLicense, 30000);
    }
  }
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

---

## Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination**:

```typescript
interface PaginationParams {
  page: number;      // 1-indexed
  pageSize: number;  // Default: 20, max: 100
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Request
const result = await trpc.licenses.list.query({
  page: 2,
  pageSize: 20
});

// Response
{
  data: License[],
  meta: {
    pagination: {
      page: 2,
      pageSize: 20,
      total: 156,
      totalPages: 8
    }
  }
}
```

### Available Filters

```typescript
interface LicenseFilters {
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: string;  // ISO 8601 datetime
  creatorId?: string;
  page?: number;
  pageSize?: number;
}

// Example: Get expiring licenses
const expiringLicenses = await trpc.licenses.list.query({
  status: 'ACTIVE',
  expiringBefore: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  page: 1,
  pageSize: 50
});

// Example: Get all licenses for an IP asset
const assetLicenses = await trpc.licenses.list.query({
  ipAssetId: 'clx1a2b3c4d5e6f7g8h9i0j1',
  page: 1,
  pageSize: 100
});
```

### Sorting Options

Currently, licenses are sorted by `createdAt DESC` (newest first). 

**Planned sorting options** (to be implemented):
- `startDate` (ascending/descending)
- `endDate` (ascending/descending)
- `feeCents` (ascending/descending)
- `status` (by priority)

```typescript
// Future API
interface LicenseFilters {
  // ... existing filters
  sortBy?: 'createdAt' | 'startDate' | 'endDate' | 'feeCents' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

### Frontend Pagination Component Example

```typescript
function LicensePagination({ meta, onPageChange }: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  const { page, totalPages, total, pageSize } = meta;
  
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  
  return (
    <div className="pagination">
      <div className="pagination-info">
        Showing {startItem}-{endItem} of {total}
      </div>
      
      <div className="pagination-controls">
        <button 
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        
        <span>Page {page} of {totalPages}</span>
        
        <button 
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Step 1: Setup API Client

- [ ] Install tRPC client
- [ ] Configure base URL and authentication
- [ ] Set up React Query (or preferred data fetching library)
- [ ] Create type-safe tRPC hooks

```typescript
// trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@yg-backend/api';

export const trpc = createTRPCReact<AppRouter>();
```

### Step 2: Create Type Definitions

- [ ] Copy TypeScript types from backend
- [ ] Create local interfaces for form data
- [ ] Set up Zod schemas for client-side validation
- [ ] Export all types from central location

```typescript
// types/license.ts
export type {
  LicenseResponse,
  LicenseScope,
  LicenseStats,
  ConflictResult,
  // ... all license types
} from './generated'; // Generated from backend

// Local form types
export interface LicenseFormData {
  ipAssetId: string;
  brandId: string;
  // ... form-specific fields
}
```

### Step 3: Implement Core License Features

#### 3.1 License Creation Form

- [ ] Multi-step form wizard (Asset → Terms → Scope → Review)
- [ ] Real-time fee calculation preview
- [ ] Conflict checking before submission
- [ ] Validation with field-level error display
- [ ] Auto-save draft functionality

```typescript
// components/LicenseCreateForm.tsx
function LicenseCreateForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<LicenseFormData>({});
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  
  const createMutation = trpc.licenses.create.useMutation();
  const checkConflictsMutation = trpc.licenses.checkConflicts.useMutation();
  
  // Step 1: Select asset
  // Step 2: Set terms (dates, type, fee)
  // Step 3: Define scope
  // Step 4: Review and submit
  
  async function handleSubmit() {
    // Check conflicts first
    const conflictCheck = await checkConflictsMutation.mutateAsync(formData);
    
    if (conflictCheck.data.hasConflicts) {
      setConflicts(conflictCheck.data.conflicts);
      // Show conflict resolution UI
      return;
    }
    
    // No conflicts, create license
    await createMutation.mutateAsync(formData);
  }
}
```

#### 3.2 License List/Table

- [ ] Paginated table with filters
- [ ] Status badges (color-coded)
- [ ] Quick actions (approve, sign, view)
- [ ] Bulk operations (future)
- [ ] Export to CSV (future)

```typescript
// components/LicenseList.tsx
function LicenseList() {
  const [filters, setFilters] = useState<LicenseFilters>({ page: 1 });
  
  const { data, isLoading } = trpc.licenses.list.useQuery(filters);
  
  return (
    <div>
      <LicenseFilters onChange={setFilters} />
      
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>IP Asset</th>
            <th>Brand</th>
            <th>Type</th>
            <th>Status</th>
            <th>Dates</th>
            <th>Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map(license => (
            <LicenseRow key={license.id} license={license} />
          ))}
        </tbody>
      </table>
      
      <LicensePagination 
        meta={data?.meta.pagination}
        onPageChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

#### 3.3 License Detail View

- [ ] Full license information display
- [ ] Status timeline/history
- [ ] Revenue tracking charts
- [ ] Approval workflow progress
- [ ] Signature status
- [ ] Action buttons (approve, sign, terminate, etc.)

```typescript
// components/LicenseDetail.tsx
function LicenseDetail({ licenseId }: { licenseId: string }) {
  const { data: license } = trpc.licenses.getById.useQuery({ id: licenseId });
  const { data: revenue } = trpc.licenses.getRevenue.useQuery({ id: licenseId });
  
  const approveMutation = trpc.licenses.approve.useMutation();
  const signMutation = trpc.licenses.sign.useMutation();
  
  if (!license) return <Loading />;
  
  return (
    <div>
      <LicenseHeader license={license.data} />
      <LicenseTerms license={license.data} />
      <LicenseScope scope={license.data.scope} />
      <LicenseRevenue data={revenue?.data} />
      <LicenseActions 
        license={license.data}
        onApprove={() => approveMutation.mutate({ id: licenseId })}
        onSign={() => signMutation.mutate({ id: licenseId })}
      />
    </div>
  );
}
```

### Step 4: Implement Business Logic

- [ ] Fee calculation preview (client-side estimation)
- [ ] Revenue share calculator
- [ ] Conflict detection UI
- [ ] Status badge rendering
- [ ] Date formatting and validation
- [ ] Permission checks

```typescript
// utils/licenseHelpers.ts

export function calculateFeeEstimate(formData: Partial<LicenseFormData>): number {
  // Client-side fee estimation (matches backend logic)
  // Use for real-time preview
}

export function getLicenseStatusBadge(status: LicenseStatus): BadgeProps {
  const badgeConfig = {
    DRAFT: { color: 'gray', label: 'Draft' },
    PENDING_APPROVAL: { color: 'yellow', label: 'Pending Approval' },
    ACTIVE: { color: 'green', label: 'Active' },
    EXPIRED: { color: 'red', label: 'Expired' },
    TERMINATED: { color: 'red', label: 'Terminated' },
    // ... other statuses
  };
  return badgeConfig[status];
}

export function canUserApproveLicense(user: User, license: License): boolean {
  // Permission check logic
}
```

### Step 5: Error Handling & UX

- [ ] Global error boundary
- [ ] Toast notifications for success/error
- [ ] Form validation with inline errors
- [ ] Conflict resolution UI
- [ ] Loading states
- [ ] Empty states

```typescript
// components/ErrorBoundary.tsx
function LicenseErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      fallback={(error) => <LicenseErrorFallback error={error} />}
    >
      {children}
    </ErrorBoundary>
  );
}

// hooks/useLicenseErrorHandler.ts
function useLicenseErrorHandler() {
  return {
    handleError: (error: TRPCError) => {
      if (error.code === 'CONFLICT') {
        // Show conflict dialog
        showConflictDialog(error.data.conflicts);
      } else if (error.code === 'FORBIDDEN') {
        showError('You don\'t have permission to perform this action');
      } else {
        showError('Something went wrong. Please try again.');
      }
    }
  };
}
```

### Step 6: Testing

- [ ] Unit tests for utility functions
- [ ] Integration tests for API calls
- [ ] Component tests for forms
- [ ] E2E tests for critical flows
- [ ] Error scenario tests

```typescript
// __tests__/LicenseCreateForm.test.tsx
describe('LicenseCreateForm', () => {
  it('should validate required fields', () => {
    // Test validation
  });
  
  it('should check for conflicts before submission', async () => {
    // Test conflict checking
  });
  
  it('should display fee calculation preview', () => {
    // Test fee preview
  });
  
  it('should handle permission errors', async () => {
    // Test error handling
  });
});
```

---

## Edge Cases to Handle

### 1. Co-Owned IP Assets

- Display all co-owners
- Show revenue share distribution
- Require all owners to sign
- Handle partial signatures

```typescript
// Show co-owner signing status
function CoOwnerSignatures({ license }: { license: License }) {
  const signatures = license.metadata?.signatures || [];
  const owners = license.ipAsset?.ownerships || [];
  
  return (
    <div>
      <h3>Required Signatures</h3>
      {owners.map(owner => {
        const signed = signatures.some(s => s.userId === owner.creator.userId);
        return (
          <div key={owner.id}>
            {owner.creator.name} ({owner.shareBps / 100}%)
            {signed ? '✅ Signed' : '⏳ Pending'}
          </div>
        );
      })}
    </div>
  );
}
```

### 2. First-Time Brands

- Show admin approval requirement
- Explain the review process
- Provide estimated review time
- Allow draft saving while under review

### 3. High-Value Licenses (≥$10,000)

- Show admin approval badge
- Explain additional scrutiny
- Provide justification field
- Display approval timeline

### 4. Global Territory Licenses

- Confirm user intent ("Are you sure you want global rights?")
- Show pricing impact
- Explain exclusivity implications
- Suggest territory-specific alternatives

### 5. Overlapping Date Ranges

- Show visual timeline of conflicts
- Suggest alternative dates
- Allow override with justification (non-exclusive only)

```typescript
// Visual conflict timeline
function ConflictTimeline({ conflicts, newLicense }: {
  conflicts: Conflict[];
  newLicense: LicenseFormData;
}) {
  return (
    <div className="timeline">
      {conflicts.map(conflict => (
        <div key={conflict.licenseId} className="conflict-bar">
          {/* Visual representation of date overlap */}
        </div>
      ))}
      <div className="new-license-bar">
        {/* Proposed license dates */}
      </div>
    </div>
  );
}
```

---

## UX Considerations

### 1. Progressive Disclosure

- Start with simple fields, reveal advanced options
- Collapsible sections for scope configuration
- Tooltips for complex terms (basis points, exclusivity, etc.)

### 2. Smart Defaults

- Default to NON_EXCLUSIVE license type
- Pre-fill brand ID for brand users
- Suggest common scope configurations
- Default duration: 1 year

### 3. Inline Help

- Tooltips on all fields
- "Learn more" links to documentation
- Contextual examples ("e.g., Fashion, Beauty, Lifestyle")
- Fee calculation explainer

```typescript
// Example tooltip component
function FieldTooltip({ label, helpText, example }: {
  label: string;
  helpText: string;
  example?: string;
}) {
  return (
    <div className="field-label">
      {label}
      <Tooltip content={
        <div>
          <p>{helpText}</p>
          {example && <p className="example">Example: {example}</p>}
        </div>
      }>
        <InfoIcon />
      </Tooltip>
    </div>
  );
}
```

### 4. Visual Feedback

- Loading states for async operations
- Success animations for completions
- Progress indicators for multi-step forms
- Real-time validation feedback

### 5. Confirmation Dialogs

- Confirm before terminating active license
- Confirm before deleting (admin only)
- Confirm high-value fee amounts
- Confirm global territory selection

```typescript
function useConfirmAction() {
  return async function confirm(
    message: string,
    action: () => Promise<void>
  ) {
    const result = await showConfirmDialog({
      title: 'Confirm Action',
      message,
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel'
    });
    
    if (result) {
      await action();
    }
  };
}
```

---

## Support & Resources

### Internal Documentation

- **Implementation Guide:** `docs/modules/licensing/LICENSE_CREATION_COMPLETE.md`
- **Quick Reference:** `docs/modules/licensing/LICENSE_CREATION_QUICK_REFERENCE.md`
- **Validation Details:** `docs/modules/licensing/LICENSE_VALIDATION_IMPLEMENTATION.md`

### Backend Source Code

- **Router:** `src/modules/licenses/router.ts`
- **Service:** `src/modules/licenses/service.ts`
- **Types:** `src/modules/licenses/types.ts`
- **Validators:** `src/modules/licenses/validators/`
- **Services:** `src/modules/licenses/services/`

### Contact

For questions or issues:
- **Backend Team:** Review source code in `yg-backend` repository
- **API Issues:** Check audit logs in `audit_events` table
- **Bug Reports:** Create issue in repository

---

## Appendix: Complete Request/Response Schemas

### Create License Request
```json
{
  "ipAssetId": "string (cuid)",
  "brandId": "string (cuid)",
  "projectId": "string (cuid, optional)",
  "licenseType": "EXCLUSIVE | NON_EXCLUSIVE | EXCLUSIVE_TERRITORY",
  "startDate": "string (ISO 8601)",
  "endDate": "string (ISO 8601)",
  "feeCents": "number (int, >= 0)",
  "revShareBps": "number (int, 0-10000)",
  "paymentTerms": "string (optional)",
  "billingFrequency": "ONE_TIME | MONTHLY | QUARTERLY | ANNUALLY (optional)",
  "scope": {
    "media": {
      "digital": "boolean",
      "print": "boolean",
      "broadcast": "boolean",
      "ooh": "boolean"
    },
    "placement": {
      "social": "boolean",
      "website": "boolean",
      "email": "boolean",
      "paid_ads": "boolean",
      "packaging": "boolean"
    },
    "geographic": {
      "territories": ["string (ISO code or 'GLOBAL')"]
    },
    "exclusivity": {
      "category": "string (optional)",
      "competitors": ["string (brand IDs, optional)"]
    },
    "cutdowns": {
      "allowEdits": "boolean",
      "maxDuration": "number (optional)",
      "aspectRatios": ["string (optional)"]
    },
    "attribution": {
      "required": "boolean",
      "format": "string (optional)"
    }
  },
  "autoRenew": "boolean (default: false)",
  "metadata": "object (optional)"
}
```

### License Response
```json
{
  "id": "string (cuid)",
  "ipAssetId": "string (cuid)",
  "brandId": "string (cuid)",
  "projectId": "string | null",
  "licenseType": "EXCLUSIVE | NON_EXCLUSIVE | EXCLUSIVE_TERRITORY",
  "status": "DRAFT | PENDING_APPROVAL | ACTIVE | etc.",
  "startDate": "string (ISO 8601)",
  "endDate": "string (ISO 8601)",
  "signedAt": "string (ISO 8601) | null",
  "feeCents": "number",
  "feeDollars": "number",
  "revShareBps": "number",
  "revSharePercent": "number",
  "paymentTerms": "string | null",
  "billingFrequency": "string | null",
  "scope": "LicenseScope object",
  "autoRenew": "boolean",
  "renewalNotifiedAt": "string | null",
  "parentLicenseId": "string | null",
  "signatureProof": "string | null",
  "metadata": "object | null",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

---

**End of Documentation**

**Last Updated:** October 14, 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
