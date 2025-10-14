# Project Validation - Frontend Integration Guide (Part 2: Implementation)

**Module:** Project Validation  
**Classification:** ⚡ HYBRID (Brands create projects, Admins manage/moderate)  
**Last Updated:** October 13, 2025

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Validation Constants](#validation-constants)
3. [Client-Side Validation](#client-side-validation)
4. [Rate Limiting & Quotas](#rate-limiting--quotas)
5. [Pagination & Filtering](#pagination--filtering)
6. [Real-time Updates](#real-time-updates)
7. [Frontend Implementation Checklist](#frontend-implementation-checklist)
8. [React Query Examples](#react-query-examples)
9. [Form Implementation Examples](#form-implementation-examples)
10. [UX Considerations](#ux-considerations)

---

## Business Logic & Validation Rules

### Budget Validation Rules

#### Range Limits

```typescript
const BUDGET_LIMITS = {
  MIN: 0,                    // $0.00
  MAX: 1000000000,          // $10,000,000.00 (stored in cents)
};
```

#### Type-Based Minimums (Recommendations, not hard limits)

```typescript
const MIN_BUDGET_BY_TYPE = {
  CAMPAIGN: 100000,    // $1,000 minimum recommended
  CONTENT: 50000,      // $500 minimum recommended
  LICENSING: 25000,    // $250 minimum recommended
};
```

**Frontend Logic:**
- Show warning if budget is below type minimum
- Don't block submission (backend will warn but allow)
- Display warning message: "Budget is below recommended minimum for this project type"

#### Budget Adjustments

**When updating an existing project:**

1. **Cannot reduce below committed amount**
   - Committed = sum of all active license budgets
   - Backend calculates this automatically
   - Frontend should fetch current committed budget before allowing changes

2. **Large increases trigger warnings**
   - >50% increase: Warning for non-admin users
   - >$100k increase: Requires admin approval
   - Show modal: "This budget increase requires admin approval"

3. **Brand budget availability**
   - Total allocated across all projects should not exceed brand's credit limit
   - Future feature - will add to API when implemented

#### Budget Display Formatting

```typescript
// Helper function for displaying budget
export function formatBudget(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// Example: 5000000 cents → "$50,000.00"
```

### Date Validation Rules

#### Basic Date Rules

```typescript
const DATE_RULES = {
  GRACE_PERIOD_DAYS: 7,           // Start date can be up to 7 days in past
  MAX_PAST_DAYS: 30,              // Hard limit: 30 days in past
  MAX_DURATION_DAYS: 365,         // Projects longer than this trigger warnings
  LONG_PROJECT_WARNING_DAYS: 180, // Warn if project > 180 days
  SHORT_CAMPAIGN_DAYS: 7,         // Warn if campaign < 7 days
};
```

**Frontend Validation:**

```typescript
export function validateDateRange(
  startDate: Date | null,
  endDate: Date | null,
  projectType: ProjectType
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. End must be after start
  if (startDate && endDate && endDate <= startDate) {
    errors.push('End date must be after start date');
  }

  // 2. Start date not too far in past
  if (startDate) {
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 30) {
      errors.push('Start date cannot be more than 30 days in the past');
    } else if (daysDiff > 7) {
      warnings.push('Start date is in the past - confirm this is correct');
    }
  }

  // 3. Project duration
  if (startDate && endDate) {
    const durationDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (durationDays < 1) {
      errors.push('Project must be at least 1 day long');
    }

    if (durationDays > 365) {
      warnings.push(`Project duration of ${durationDays} days exceeds recommended maximum`);
    }

    if (durationDays > 180) {
      warnings.push('Long-term project - consider breaking into phases');
    }

    if (projectType === 'CAMPAIGN' && durationDays < 7) {
      warnings.push('Campaign projects typically run longer than 7 days');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

#### Date Change Restrictions

**When updating dates on existing projects:**

1. **License Conflict Check**
   - Cannot shorten end date if licenses extend beyond new date
   - Backend will return error: "Cannot shorten end date: X license(s) extend beyond new end date"
   - Frontend should fetch license data before allowing date changes

2. **Fiscal Year Boundary**
   - Projects spanning fiscal year boundary get a warning
   - Warning: "Project spans fiscal year boundary - ensure budget allocation is correct"

3. **Overlapping Projects**
   - Brands with >5 overlapping active projects get a warning
   - Warning: "Brand has X overlapping active projects - consider staggering timelines"

### Status Transition Rules

#### State Machine

```typescript
const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['IN_PROGRESS', 'CANCELLED', 'ARCHIVED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [], // Terminal state
};

// Helper function
export function canTransitionTo(
  currentStatus: ProjectStatus,
  newStatus: ProjectStatus
): boolean {
  return STATUS_TRANSITIONS[currentStatus].includes(newStatus);
}
```

#### Preconditions by Status

**DRAFT → ACTIVE:**
- ✅ **Required**: Budget > 0
- ⚠️ **Recommended**: Start and end dates
- ⚠️ **Recommended**: Description (20+ characters)
- ⚠️ **Recommended**: Requirements defined

**Frontend Implementation:**
```typescript
function validateActivation(project: Project): {
  canActivate: boolean;
  blockers: string[];
  recommendations: string[];
} {
  const blockers: string[] = [];
  const recommendations: string[] = [];

  if (!project.budgetCents || project.budgetCents <= 0) {
    blockers.push('Project must have a budget before activation');
  }

  if (!project.startDate || !project.endDate) {
    recommendations.push('Set project start and end dates');
  }

  if (!project.description || project.description.length < 20) {
    recommendations.push('Add a detailed project description');
  }

  if (!project.requirements) {
    recommendations.push('Define project requirements');
  }

  return {
    canActivate: blockers.length === 0,
    blockers,
    recommendations,
  };
}
```

**IN_PROGRESS → COMPLETED:**
- ✅ **Required**: No pending licenses (status: DRAFT, PENDING_APPROVAL)
- Backend will check and return error if violations exist

**ANY → CANCELLED:**
- ⚠️ Non-admins blocked if active licenses exist
- ✅ Admins can cancel with active licenses (must handle license cleanup)

**ANY → ARCHIVED:**
- ✅ **Required**: No open licenses (only EXPIRED or TERMINATED allowed)
- Soft requirement - all financial obligations closed

#### Status Display & UI

```typescript
// Status badge colors and labels
export const STATUS_CONFIG: Record<ProjectStatus, {
  label: string;
  color: string;
  icon: string;
}> = {
  DRAFT: {
    label: 'Draft',
    color: 'gray',
    icon: 'DocumentIcon',
  },
  ACTIVE: {
    label: 'Active',
    color: 'green',
    icon: 'CheckCircleIcon',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'blue',
    icon: 'ClockIcon',
  },
  COMPLETED: {
    label: 'Completed',
    color: 'purple',
    icon: 'CheckBadgeIcon',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'red',
    icon: 'XCircleIcon',
  },
  ARCHIVED: {
    label: 'Archived',
    color: 'gray',
    icon: 'ArchiveBoxIcon',
  },
};
```

### Permission Validation

#### Client-Side Permission Checks

```typescript
export function canUserCreateProject(user: {
  role: string;
  brandVerificationStatus?: string;
}): { allowed: boolean; reason?: string } {
  if (user.role === 'ADMIN') {
    return { allowed: true };
  }

  if (user.role === 'BRAND') {
    if (user.brandVerificationStatus !== 'approved') {
      return {
        allowed: false,
        reason: 'Your brand must be verified before creating projects',
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Only brand accounts can create projects',
  };
}

export function canUserUpdateProject(
  user: { role: string; id: string },
  project: { brand: { userId: string }; status: ProjectStatus }
): { allowed: boolean; reason?: string } {
  if (user.role === 'ADMIN') {
    return { allowed: true };
  }

  if (user.role === 'BRAND') {
    if (project.brand.userId !== user.id) {
      return {
        allowed: false,
        reason: 'You can only update your own projects',
      };
    }

    if (project.status === 'ARCHIVED') {
      return {
        allowed: false,
        reason: 'Archived projects cannot be updated',
      };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: 'Insufficient permissions' };
}
```

### Duplicate Detection

#### How It Works

Backend performs:
1. **Exact match**: Case-insensitive name comparison
2. **Fuzzy match**: String similarity scoring (>85% threshold)
3. **Year pattern**: Detects "Campaign 2024", "Campaign 2025" patterns

**Frontend Handling:**

```typescript
interface DuplicateWarning {
  isDuplicate: boolean;
  duplicates: Array<{
    id: string;
    name: string;
    similarity: number;
    status: ProjectStatus;
  }>;
}

// Show warning modal if duplicates found
function handleDuplicateWarning(warning: DuplicateWarning) {
  if (warning.isDuplicate) {
    // Show modal:
    // "A similar project already exists:"
    // - "Summer Campaign 2024" (87% match) [View Project]
    // "Are you sure you want to create this project?"
    // [Cancel] [Create Anyway]
  }
}
```

**UX Best Practice:**
- Show warning, but don't block creation
- Allow user to view similar projects
- Provide "Create Anyway" option
- Consider adding a "Link to existing project" option

---

## Validation Constants

```typescript
// Copy these constants to your frontend

export const VALIDATION_CONSTANTS = {
  // Budget
  BUDGET_MIN: 0,
  BUDGET_MAX: 1000000000, // $10M in cents
  BUDGET_MIN_CAMPAIGN: 100000, // $1,000
  BUDGET_MIN_CONTENT: 50000, // $500
  BUDGET_MIN_LICENSING: 25000, // $250
  BUDGET_LARGE_THRESHOLD: 50000000, // $500k
  BUDGET_INCREASE_WARNING_PERCENT: 50,
  BUDGET_INCREASE_APPROVAL_AMOUNT: 10000000, // $100k

  // Dates
  START_DATE_GRACE_PERIOD_DAYS: 7,
  START_DATE_MAX_PAST_DAYS: 30,
  MAX_PROJECT_DURATION_DAYS: 365,
  LONG_PROJECT_WARNING_DAYS: 180,
  SHORT_CAMPAIGN_DAYS: 7,

  // Text Fields
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 5000,
  DESCRIPTION_RECOMMENDED_MIN: 20,
  MAX_OBJECTIVES: 10,

  // Duplicate Detection
  DUPLICATE_SIMILARITY_THRESHOLD: 0.85, // 85%

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};
```

---

## Client-Side Validation

### Form Validation with React Hook Form + Zod

```typescript
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Define schema matching backend
const createProjectSchema = z.object({
  name: z.string()
    .min(3, 'Project name must be at least 3 characters')
    .max(200, 'Project name must not exceed 200 characters'),
  description: z.string()
    .max(5000, 'Description must not exceed 5000 characters')
    .optional(),
  budgetCents: z.number()
    .int('Budget must be a whole number')
    .min(0, 'Budget cannot be negative')
    .max(100000000, 'Budget cannot exceed $1,000,000'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  objectives: z.array(z.string())
    .max(10, 'Maximum 10 objectives allowed')
    .optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

type CreateProjectForm = z.infer<typeof createProjectSchema>;

// Use in component
function CreateProjectForm() {
  const form = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      projectType: 'CAMPAIGN',
    },
  });

  // ... form implementation
}
```

### Budget Input Component

```typescript
import { useState } from 'react';

interface BudgetInputProps {
  value: number; // in cents
  onChange: (cents: number) => void;
  projectType: ProjectType;
  error?: string;
}

export function BudgetInput({ value, onChange, projectType, error }: BudgetInputProps) {
  const [displayValue, setDisplayValue] = useState(
    value ? (value / 100).toFixed(2) : ''
  );

  const minRecommended = VALIDATION_CONSTANTS[`BUDGET_MIN_${projectType}`] / 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const str = e.target.value.replace(/[^0-9.]/g, '');
    setDisplayValue(str);
    
    const dollars = parseFloat(str);
    if (!isNaN(dollars)) {
      onChange(Math.round(dollars * 100));
    }
  };

  const showWarning = value < VALIDATION_CONSTANTS[`BUDGET_MIN_${projectType}`];

  return (
    <div>
      <label className="block text-sm font-medium">
        Budget
      </label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-gray-500">$</span>
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          className="pl-7 pr-3 py-2 border rounded-md w-full"
          placeholder="0.00"
        />
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {showWarning && !error && (
        <p className="mt-1 text-sm text-yellow-600">
          Recommended minimum for {projectType} projects: ${minRecommended.toLocaleString()}
        </p>
      )}
    </div>
  );
}
```

### Date Range Picker with Validation

```typescript
import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
  projectType: ProjectType;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  projectType,
}: DateRangePickerProps) {
  const [validation, setValidation] = useState<{
    errors: string[];
    warnings: string[];
  }>({ errors: [], warnings: [] });

  useEffect(() => {
    const result = validateDateRange(startDate, endDate, projectType);
    setValidation({ errors: result.errors, warnings: result.warnings });
  }, [startDate, endDate, projectType]);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - 30); // 30 days in past

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Start Date</label>
        <DatePicker
          selected={startDate}
          onChange={onStartDateChange}
          minDate={minDate}
          maxDate={endDate || undefined}
          dateFormat="MMM d, yyyy"
          className="w-full px-3 py-2 border rounded-md"
          placeholderText="Select start date"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">End Date</label>
        <DatePicker
          selected={endDate}
          onChange={onEndDateChange}
          minDate={startDate || minDate}
          dateFormat="MMM d, yyyy"
          className="w-full px-3 py-2 border rounded-md"
          placeholderText="Select end date"
        />
      </div>

      {validation.errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          {validation.errors.map((error, i) => (
            <p key={i} className="text-sm text-red-700">{error}</p>
          ))}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          {validation.warnings.map((warning, i) => (
            <p key={i} className="text-sm text-yellow-700">{warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Rate Limiting & Quotas

### Current Implementation

**No rate limiting is currently implemented on the Project Validation endpoints.**

Projects module does not have rate limiting applied. The message module has rate limiting (50 messages per hour).

### Future Considerations

If rate limiting is added in the future, expect:

```typescript
// Rate limit headers (standard pattern)
'X-RateLimit-Limit': '100'      // Requests per window
'X-RateLimit-Remaining': '95'   // Remaining requests
'X-RateLimit-Reset': '1697234400' // Unix timestamp

// Rate limit error response
{
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Rate limit exceeded. Try again in 15 minutes.',
    data: {
      resetAt: '2025-10-13T11:00:00Z'
    }
  }
}
```

### Recommended Frontend Handling

```typescript
// Even without server-side rate limiting, implement client-side throttling

import { useMutation } from '@tanstack/react-query';
import { useThrottle } from '@/hooks/useThrottle';

function useCreateProject() {
  const throttledMutate = useThrottle(1000); // 1 second between requests

  return useMutation({
    mutationFn: (data: CreateProjectInput) => {
      return throttledMutate(() => trpc.projects.create.mutate(data));
    },
  });
}
```

---

## Pagination & Filtering

### Pagination Format

**Type:** Offset-based pagination

```typescript
interface PaginationParams {
  page: number;      // 1-indexed, default: 1
  limit: number;     // Default: 20, max: 100
}

interface PaginationResponse {
  total: number;     // Total count of items
  page: number;      // Current page
  limit: number;     // Items per page
  pages: number;     // Total pages
}
```

### Filter Parameters

```typescript
interface ProjectFilters {
  // Exact match filters
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  
  // Search (fuzzy match on name and description)
  search?: string;
  
  // Range filters
  budgetMin?: number;
  budgetMax?: number;
  startDateFrom?: string; // ISO 8601
  startDateTo?: string;   // ISO 8601
}
```

### Sorting Options

```typescript
interface SortParams {
  sortBy: 'createdAt' | 'updatedAt' | 'name' | 'budgetCents' | 'startDate';
  sortOrder: 'asc' | 'desc';
}

// Default: sortBy = 'createdAt', sortOrder = 'desc' (newest first)
```

### Filter Examples

```typescript
// Get all active campaigns with budget > $10k
const filters = {
  status: 'ACTIVE',
  projectType: 'CAMPAIGN',
  budgetMin: 1000000, // $10k in cents
  sortBy: 'budgetCents',
  sortOrder: 'desc',
};

// Search projects by keyword
const searchFilters = {
  search: 'summer',  // Searches in name and description
  page: 1,
  limit: 20,
};

// Get projects starting in Q4 2025
const dateFilters = {
  startDateFrom: '2025-10-01T00:00:00Z',
  startDateTo: '2025-12-31T23:59:59Z',
};
```

### Pagination Component Example

```typescript
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 border rounded disabled:opacity-50"
      >
        Previous
      </button>

      <span className="text-sm text-gray-700">
        Page {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 border rounded disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}
```

---

## Real-time Updates

### Current Implementation

**No WebSocket/SSE currently implemented for projects module.**

### Polling Recommendations

For near-real-time updates, implement polling:

```typescript
import { useQuery } from '@tanstack/react-query';

function useProjectWithPolling(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => trpc.projects.getById.query({ id: projectId }),
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false, // Stop polling when tab inactive
  });
}
```

### Optimistic Updates

Implement optimistic updates for better UX:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProjectInput) => {
      return trpc.projects.update.mutate(data);
    },
    onMutate: async (updatedProject) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['project', updatedProject.id] });

      // Snapshot previous value
      const previousProject = queryClient.getQueryData(['project', updatedProject.id]);

      // Optimistically update
      queryClient.setQueryData(['project', updatedProject.id], (old: any) => ({
        ...old,
        ...updatedProject,
      }));

      return { previousProject };
    },
    onError: (err, updatedProject, context) => {
      // Rollback on error
      queryClient.setQueryData(
        ['project', updatedProject.id],
        context?.previousProject
      );
    },
    onSettled: (data, error, updatedProject) => {
      // Refetch to ensure sync
      queryClient.invalidateQueries({ queryKey: ['project', updatedProject.id] });
    },
  });
}
```

### Future: Webhook Events

If webhooks are added, expect events like:

```typescript
type ProjectWebhookEvent = 
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'project.status_changed';

interface WebhookPayload {
  event: ProjectWebhookEvent;
  timestamp: string;
  data: {
    projectId: string;
    brandId: string;
    changes?: Record<string, any>;
  };
}
```

---

## Frontend Implementation Checklist

### Setup Tasks

- [ ] Install tRPC client and configure for backend URL
- [ ] Set up NextAuth.js session provider
- [ ] Configure React Query with proper defaults
- [ ] Create TypeScript type definitions (copy from Part 1)
- [ ] Set up error handling utilities
- [ ] Create validation constant file
- [ ] Set up toast/notification system

### Create Project Flow

- [ ] Create project form component
  - [ ] Name input with character counter
  - [ ] Description textarea with character counter
  - [ ] Budget input with currency formatting
  - [ ] Project type selector
  - [ ] Date range picker
  - [ ] Objectives list (add/remove, max 10)
  - [ ] Requirements form (optional)
- [ ] Implement client-side validation (Zod + React Hook Form)
- [ ] Add duplicate detection warning modal
- [ ] Show validation errors inline
- [ ] Display warnings without blocking submission
- [ ] Add loading state during submission
- [ ] Handle success with redirect to project detail
- [ ] Handle errors with user-friendly messages
- [ ] Add confirmation modal for large budgets

### List/Browse Projects

- [ ] Create project list page
- [ ] Implement filter UI
  - [ ] Status filter (multi-select or tabs)
  - [ ] Project type filter
  - [ ] Budget range slider
  - [ ] Date range picker
  - [ ] Search input
- [ ] Add sorting dropdown
- [ ] Implement pagination controls
- [ ] Create project card/row component
- [ ] Add empty state for no results
- [ ] Add loading skeleton
- [ ] Implement infinite scroll or "Load More" (optional)

### Project Detail Page

- [ ] Fetch and display project details
- [ ] Show formatted budget
- [ ] Display status badge with appropriate color
- [ ] Show project timeline (start/end dates)
- [ ] List objectives
- [ ] Display requirements
- [ ] Show metadata (tags, attachments)
- [ ] Add "Edit" button (check permissions)
- [ ] Add "Delete" button (check permissions)
- [ ] Show related assets count
- [ ] Show related licenses count

### Update Project Flow

- [ ] Pre-fill form with existing data
- [ ] Detect which fields changed
- [ ] Validate budget adjustments
  - [ ] Fetch committed budget
  - [ ] Show warning for reductions
  - [ ] Show warning for large increases
- [ ] Validate date changes
  - [ ] Check license conflicts
  - [ ] Show fiscal year warnings
- [ ] Validate status transitions
  - [ ] Check preconditions
  - [ ] Show required actions
  - [ ] Display modal with checklist before activation
- [ ] Implement optimistic updates
- [ ] Handle validation errors
- [ ] Show success toast

### Status Change Workflow

- [ ] Create status change modal/dropdown
- [ ] Show only allowed transitions
- [ ] Display preconditions for selected status
- [ ] Show blocking issues (red, must fix)
- [ ] Show recommendations (yellow, optional)
- [ ] Add confirmation step
- [ ] Handle activation checklist
  - [ ] Verify budget set
  - [ ] Suggest dates if missing
  - [ ] Suggest description if short
- [ ] Handle completion requirements
  - [ ] Check for pending licenses
  - [ ] Show list of blocking licenses
  - [ ] Provide links to resolve

### Delete Project Flow

- [ ] Add delete button with permission check
- [ ] Show confirmation modal
  - [ ] Display project name
  - [ ] Warn about permanent action
  - [ ] Check for active licenses
  - [ ] Block if licenses exist
  - [ ] Show license count and links
- [ ] Implement delete mutation
- [ ] Redirect after successful deletion
- [ ] Show toast notification
- [ ] Invalidate relevant queries

### Permission & Access Control

- [ ] Create `useProjectPermissions` hook
- [ ] Check permissions before showing action buttons
- [ ] Disable actions for unauthorized users
- [ ] Show helpful messages for blocked actions
  - [ ] "Your brand must be verified to create projects"
  - [ ] "You can only edit your own projects"
  - [ ] "Archived projects cannot be edited"
- [ ] Implement role-based UI differences
  - [ ] Admin sees all projects
  - [ ] Brand sees only their projects
  - [ ] Creator sees only active projects

### Error Handling

- [ ] Create error boundary for project pages
- [ ] Map tRPC error codes to user messages
- [ ] Show inline field errors for validation
- [ ] Show toast for operation errors
- [ ] Show modal for critical errors
- [ ] Provide retry mechanism for network errors
- [ ] Log errors to monitoring service (Sentry, etc.)

### UX Enhancements

- [ ] Add loading skeletons for all async operations
- [ ] Implement debounced search
- [ ] Add keyboard shortcuts (Cmd+S to save, etc.)
- [ ] Show unsaved changes warning
- [ ] Add autosave for drafts
- [ ] Implement form field tooltips
- [ ] Add budget calculator helper
- [ ] Show project timeline visualization
- [ ] Add project templates (optional)
- [ ] Implement bulk actions (optional)

---

## React Query Examples

### Setup tRPC Client

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app'; // Backend type

export const trpc = createTRPCReact<AppRouter>();

// App wrapper
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
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
          // Add auth token from session
        };
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Fetch Project List

```typescript
import { trpc } from '@/lib/trpc';

function ProjectList() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ProjectFilters>({
    status: 'ACTIVE',
  });

  const { data, isLoading, error } = trpc.projects.list.useQuery({
    ...filters,
    page,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <FilterBar filters={filters} onChange={setFilters} />
      
      {data.data.projects.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}

      <Pagination
        currentPage={data.data.pagination.page}
        totalPages={data.data.pagination.pages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

### Create Project

```typescript
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

function CreateProjectForm() {
  const router = useRouter();
  const utils = trpc.useContext();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      // Invalidate project list
      utils.projects.list.invalidate();
      
      // Show success message
      toast.success('Project created successfully!');
      
      // Redirect to project detail
      router.push(`/projects/${data.data.id}`);
    },
    onError: (error) => {
      // Handle specific errors
      if (error.data?.code === 'FORBIDDEN') {
        toast.error('You need to verify your brand before creating projects');
      } else {
        toast.error(error.message);
      }
    },
  });

  const onSubmit = (data: CreateProjectInput) => {
    createProject.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Form fields */}
      <button
        type="submit"
        disabled={createProject.isLoading}
      >
        {createProject.isLoading ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
```

### Update Project with Optimistic UI

```typescript
function useUpdateProject(projectId: string) {
  const utils = trpc.useContext();

  return trpc.projects.update.useMutation({
    onMutate: async (updatedData) => {
      await utils.projects.getById.cancel({ id: projectId });

      const previousProject = utils.projects.getById.getData({ id: projectId });

      utils.projects.getById.setData({ id: projectId }, (old) => ({
        ...old!,
        data: {
          ...old!.data,
          ...updatedData,
        },
      }));

      return { previousProject };
    },
    onError: (err, updatedData, context) => {
      utils.projects.getById.setData(
        { id: projectId },
        context?.previousProject
      );
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success('Project updated successfully');
    },
    onSettled: () => {
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
    },
  });
}
```

### Prefetch for Better UX

```typescript
function ProjectCard({ project }: { project: Project }) {
  const utils = trpc.useContext();

  // Prefetch project details on hover
  const handleMouseEnter = () => {
    utils.projects.getById.prefetch({ id: project.id });
  };

  return (
    <Link
      href={`/projects/${project.id}`}
      onMouseEnter={handleMouseEnter}
      className="block p-4 border rounded hover:shadow-lg transition"
    >
      <h3>{project.name}</h3>
      <StatusBadge status={project.status} />
      <p className="text-sm text-gray-600">
        {formatBudget(project.budgetCents)}
      </p>
    </Link>
  );
}
```

---

## Form Implementation Examples

### Complete Create Project Form

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  budgetCents: z.number().int().min(0).max(100000000),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  objectives: z.array(z.string()).max(10).optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  { message: 'End date must be after start date', path: ['endDate'] }
);

type FormData = z.infer<typeof schema>;

export function CreateProjectForm() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectType: 'CAMPAIGN',
      objectives: [],
    },
  });

  const [objectives, setObjectives] = useState<string[]>([]);
  const projectType = watch('projectType');
  const budgetCents = watch('budgetCents');

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      toast.success('Project created!');
      router.push(`/projects/${data.data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: FormData) => {
    createProject.mutate(data);
  };

  const addObjective = () => {
    if (objectives.length < 10) {
      const newObjectives = [...objectives, ''];
      setObjectives(newObjectives);
      setValue('objectives', newObjectives);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Project Name *
        </label>
        <input
          {...register('name')}
          type="text"
          className="w-full px-3 py-2 border rounded-md"
          placeholder="e.g., Summer Campaign 2025"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Description
        </label>
        <textarea
          {...register('description')}
          rows={4}
          className="w-full px-3 py-2 border rounded-md"
          placeholder="Describe your project goals and requirements..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      {/* Project Type */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Project Type *
        </label>
        <select
          {...register('projectType')}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="CAMPAIGN">Campaign</option>
          <option value="CONTENT">Content</option>
          <option value="LICENSING">Licensing</option>
        </select>
      </div>

      {/* Budget */}
      <BudgetInput
        value={budgetCents}
        onChange={(cents) => setValue('budgetCents', cents)}
        projectType={projectType}
        error={errors.budgetCents?.message}
      />

      {/* Date Range */}
      <DateRangePicker
        startDate={watch('startDate') ? new Date(watch('startDate')!) : null}
        endDate={watch('endDate') ? new Date(watch('endDate')!) : null}
        onStartDateChange={(date) => setValue('startDate', date?.toISOString())}
        onEndDateChange={(date) => setValue('endDate', date?.toISOString())}
        projectType={projectType}
      />

      {/* Objectives */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Objectives (Optional)
        </label>
        {objectives.map((obj, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              value={obj}
              onChange={(e) => {
                const newObjectives = [...objectives];
                newObjectives[index] = e.target.value;
                setObjectives(newObjectives);
                setValue('objectives', newObjectives);
              }}
              className="flex-1 px-3 py-2 border rounded-md"
              placeholder={`Objective ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => {
                const newObjectives = objectives.filter((_, i) => i !== index);
                setObjectives(newObjectives);
                setValue('objectives', newObjectives);
              }}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
            >
              Remove
            </button>
          </div>
        ))}
        {objectives.length < 10 && (
          <button
            type="button"
            onClick={addObjective}
            className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
          >
            + Add Objective
          </button>
        )}
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={createProject.isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {createProject.isLoading ? 'Creating...' : 'Create Project'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 border rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

### Status Change Modal

```typescript
interface StatusChangeModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export function StatusChangeModal({ project, isOpen, onClose }: StatusChangeModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ProjectStatus | null>(null);
  const [validation, setValidation] = useState<StatusTransitionResult | null>(null);

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success('Status updated successfully');
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const allowedTransitions = STATUS_TRANSITIONS[project.status];

  useEffect(() => {
    if (selectedStatus === 'ACTIVE') {
      const result = validateActivation(project);
      setValidation({
        valid: result.canActivate,
        errors: result.blockers,
        requiredActions: result.recommendations,
      });
    }
  }, [selectedStatus, project]);

  const handleSubmit = () => {
    if (selectedStatus) {
      updateProject.mutate({
        id: project.id,
        status: selectedStatus,
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Change Project Status</h2>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Current status: <StatusBadge status={project.status} />
          </p>

          <label className="block text-sm font-medium mb-1">
            New Status
          </label>
          <select
            value={selectedStatus || ''}
            onChange={(e) => setSelectedStatus(e.target.value as ProjectStatus)}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="">Select new status...</option>
            {allowedTransitions.map(status => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status].label}
              </option>
            ))}
          </select>
        </div>

        {validation && (
          <div className="mb-4">
            {validation.errors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-2">
                <p className="font-medium text-sm text-red-800 mb-1">
                  Cannot activate:
                </p>
                {validation.errors.map((error, i) => (
                  <p key={i} className="text-sm text-red-700">• {error}</p>
                ))}
              </div>
            )}

            {validation.requiredActions.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="font-medium text-sm text-yellow-800 mb-1">
                  Recommended actions:
                </p>
                {validation.requiredActions.map((action, i) => (
                  <p key={i} className="text-sm text-yellow-700">• {action}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!selectedStatus || (validation && !validation.valid) || updateProject.isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {updateProject.isLoading ? 'Updating...' : 'Update Status'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

---

## UX Considerations

### Progressive Disclosure

Don't overwhelm users with all options at once:

1. **Create Flow**: Start with minimal fields (name, type, budget), expand to optional fields
2. **Filters**: Show common filters first, hide advanced behind "More Filters"
3. **Validation**: Show errors inline, warnings in expandable sections

### Helpful Defaults

```typescript
// Smart defaults based on project type
const SMART_DEFAULTS = {
  CAMPAIGN: {
    budgetCents: 500000, // $5,000
    duration: 90, // 90 days
  },
  CONTENT: {
    budgetCents: 200000, // $2,000
    duration: 30, // 30 days
  },
  LICENSING: {
    budgetCents: 100000, // $1,000
    duration: 365, // 1 year
  },
};
```

### Loading States

```typescript
// Skeleton for project card
function ProjectCardSkeleton() {
  return (
    <div className="p-4 border rounded animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/4"></div>
    </div>
  );
}
```

### Empty States

```typescript
function EmptyProjectsState() {
  return (
    <div className="text-center py-12">
      <DocumentPlusIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">
        No projects yet
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Get started by creating your first project.
      </p>
      <div className="mt-6">
        <Link
          href="/projects/new"
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
          New Project
        </Link>
      </div>
    </div>
  );
}
```

### Confirmation Dialogs

Always confirm destructive actions:

```typescript
function DeleteConfirmationModal({ project, isOpen, onClose, onConfirm }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
          <h3 className="text-lg font-medium">Delete Project?</h3>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{project.name}</strong>?
          This action cannot be undone.
        </p>

        {project.licenseCount > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
            <p className="text-sm text-red-700">
              This project has {project.licenseCount} active license(s) and cannot be deleted.
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={project.licenseCount > 0}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            Delete Project
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

### Keyboard Shortcuts

```typescript
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Cmd+S or Ctrl+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSubmit(onSubmit)();
    }
    
    // Escape to cancel
    if (e.key === 'Escape') {
      router.back();
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

### Accessibility

- Use semantic HTML (`<button>`, `<form>`, etc.)
- Add ARIA labels for screen readers
- Ensure keyboard navigation works
- Use proper color contrast
- Provide focus indicators
- Add loading announcements for screen readers

---

## Summary

This implementation guide provides everything needed to integrate the Project Validation module into your frontend:

✅ **Complete business rules** for validation logic  
✅ **Client-side validation** examples with Zod  
✅ **React Query patterns** for data fetching  
✅ **Form implementations** with React Hook Form  
✅ **UX best practices** for a polished interface  

### Quick Start Steps

1. Copy TypeScript types from Part 1
2. Set up tRPC client with authentication
3. Implement validation constants
4. Create form components with client-side validation
5. Add permission checks throughout UI
6. Implement status change workflows
7. Handle errors gracefully with user-friendly messages

### Support Resources

- **Backend Documentation**: `/docs/modules/projects/VALIDATION.md`
- **API Examples**: `/docs/modules/projects/VALIDATION_QUICK_REFERENCE.md`
- **Implementation Summary**: `/docs/modules/projects/VALIDATION_IMPLEMENTATION.md`
- **Service Examples**: `/src/modules/projects/services/validation.examples.ts`

---

**Questions or Issues?** Contact the backend team or open an issue in the backend repository with the `frontend-integration` label.
