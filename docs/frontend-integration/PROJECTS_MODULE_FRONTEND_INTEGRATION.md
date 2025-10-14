# Projects Module - Frontend Integration Guide

**Classification:** ⚡ HYBRID  
**Module:** Projects  
**Purpose:** Brands create projects on website, Admins manage/moderate projects  
**Last Updated:** October 13, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [File Uploads](#file-uploads)
10. [Real-time Updates](#real-time-updates)
11. [Pagination & Filtering](#pagination--filtering)
12. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Projects module enables brands to create campaigns, content initiatives, and licensing opportunities. Projects serve as containers for IP assets and generate licenses. The module supports comprehensive project lifecycle management including team collaboration, milestone tracking, and budget management.

### Key Features
- ✅ Full CRUD operations for projects
- ✅ Status lifecycle management (DRAFT → ACTIVE → IN_PROGRESS → COMPLETED)
- ✅ Team member management (add/remove/update roles)
- ✅ Timeline & milestone tracking
- ✅ Budget tracking with expense management
- ✅ Role-based access control
- ✅ Search, filter, and sort capabilities
- ✅ Audit logging for all operations

### System Position
- **Used by:** Brands (create projects), Admins (moderate/manage)
- **Integrates with:** IP Assets, Licenses, Messaging, Notifications
- **Backend URL:** `ops.yesgoddess.agency/api/trpc`
- **Protocol:** tRPC (type-safe RPC)

---

## API Endpoints

All endpoints use tRPC protocol. Base path: `/api/trpc/projects`

### Core Project Operations

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.create` | Mutation | Create new project | ✅ Brand only |
| `projects.getById` | Query | Get single project | ✅ Owner/Admin |
| `projects.list` | Query | List projects with filters | ✅ All users |
| `projects.getMyProjects` | Query | Get current user's projects | ✅ Brand only |
| `projects.update` | Mutation | Update project | ✅ Owner/Admin |
| `projects.delete` | Mutation | Soft delete project | ✅ Owner/Admin |
| `projects.getStatistics` | Query | Get project statistics | ✅ Owner/Admin |
| `projects.getTeam` | Query | Get project team members | ✅ Team members |
| `projects.getAssets` | Query | Get project assets (paginated) | ✅ Team members |

### Team Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.addTeamMember` | Mutation | Add team member | ✅ Brand admin |
| `projects.removeTeamMember` | Mutation | Remove team member | ✅ Brand admin |
| `projects.updateTeamMemberRole` | Mutation | Update member role | ✅ Brand admin |
| `projects.getEnhancedTeam` | Query | Get team with metadata | ✅ Team members |

### Timeline Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.createMilestone` | Mutation | Create milestone | ✅ Brand admin |
| `projects.updateMilestone` | Mutation | Update milestone | ✅ Brand admin |
| `projects.deleteMilestone` | Mutation | Delete milestone | ✅ Brand admin |
| `projects.listMilestones` | Query | List milestones | ✅ Team members |

### Budget Tracking

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.addExpense` | Mutation | Add expense | ✅ Brand admin |
| `projects.updateExpense` | Mutation | Update expense | ✅ Brand admin |
| `projects.deleteExpense` | Mutation | Delete expense | ✅ Brand admin |
| `projects.getBudgetSummary` | Query | Get budget summary | ✅ Team members |

---

## Request/Response Examples

### 1. Create Project

**Request:**
```typescript
const project = await trpc.projects.create.mutate({
  name: "Summer Campaign 2025",
  description: "Looking for vibrant summer content featuring our new product line",
  budgetCents: 500000, // $5,000
  projectType: "CAMPAIGN",
  startDate: "2025-06-01T00:00:00Z",
  endDate: "2025-08-31T23:59:59Z",
  objectives: [
    "Increase brand awareness",
    "Launch new product line",
    "Generate 100k social impressions"
  ],
  requirements: {
    assetTypes: ["image", "video"],
    deliverables: 10,
    exclusivity: true,
    usage: ["social_media", "website"],
    territory: ["US", "CA"],
    duration: "1 year"
  },
  metadata: {
    tags: ["summer", "lifestyle", "fashion"],
    categories: ["Fashion", "Lifestyle"]
  }
});
```

**Response:**
```typescript
{
  data: {
    id: "clxxx1234567890",
    brandId: "clyyy1234567890",
    brandName: "YES GODDESS",
    name: "Summer Campaign 2025",
    description: "Looking for vibrant summer content...",
    status: "DRAFT",
    budgetCents: 500000,
    startDate: "2025-06-01T00:00:00.000Z",
    endDate: "2025-08-31T23:59:59.000Z",
    objectives: ["Increase brand awareness", "Launch new product line", ...],
    requirements: {
      assetTypes: ["image", "video"],
      deliverables: 10,
      exclusivity: true,
      usage: ["social_media", "website"],
      territory: ["US", "CA"],
      duration: "1 year"
    },
    metadata: {
      tags: ["summer", "lifestyle", "fashion"],
      categories: ["Fashion", "Lifestyle"]
    },
    projectType: "CAMPAIGN",
    createdBy: "user-id",
    updatedBy: null,
    createdAt: "2025-10-13T12:00:00.000Z",
    updatedAt: "2025-10-13T12:00:00.000Z",
    deletedAt: null,
    assetCount: 0,
    licenseCount: 0
  }
}
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/projects.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Summer Campaign 2025",
    "budgetCents": 500000,
    "projectType": "CAMPAIGN"
  }'
```

---

### 2. List Projects with Filters

**Request:**
```typescript
const result = await trpc.projects.list.useQuery({
  // Filters
  status: "ACTIVE",
  projectType: "CAMPAIGN",
  search: "summer",
  budgetMin: 100000,
  budgetMax: 1000000,
  
  // Pagination
  page: 1,
  limit: 20,
  
  // Sorting
  sortBy: "createdAt",
  sortOrder: "desc"
});
```

**Response:**
```typescript
{
  data: {
    data: [
      {
        id: "clxxx1234567890",
        brandId: "clyyy1234567890",
        brandName: "YES GODDESS",
        name: "Summer Campaign 2025",
        status: "ACTIVE",
        budgetCents: 500000,
        // ... full project object
      },
      // ... more projects
    ],
    meta: {
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3
    }
  }
}
```

**cURL Example:**
```bash
curl "https://ops.yesgoddess.agency/api/trpc/projects.list?input=%7B%22page%22%3A1%2C%22limit%22%3A20%2C%22status%22%3A%22ACTIVE%22%7D" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 3. Update Project Status

**Request:**
```typescript
const project = await trpc.projects.update.mutate({
  id: "clxxx1234567890",
  status: "ACTIVE"
});
```

**Response:**
```typescript
{
  data: {
    id: "clxxx1234567890",
    status: "ACTIVE",
    // ... full updated project object
  }
}
```

---

### 4. Add Team Member

**Request:**
```typescript
const member = await trpc.projects.addTeamMember.mutate({
  projectId: "clxxx1234567890",
  userId: "user-id-to-add",
  role: "collaborator" // or "viewer"
});
```

**Response:**
```typescript
{
  data: {
    id: "user-id-to-add",
    name: "Jane Doe",
    email: "jane@example.com",
    role: "collaborator",
    avatarUrl: "https://...",
    addedAt: "2025-10-13T12:00:00.000Z",
    addedBy: "current-user-id"
  }
}
```

---

### 5. Create Milestone

**Request:**
```typescript
const milestone = await trpc.projects.createMilestone.mutate({
  projectId: "clxxx1234567890",
  name: "Complete Asset Review",
  description: "Review all submitted assets for quality and brand alignment",
  dueDate: "2025-07-15T23:59:59Z"
});
```

**Response:**
```typescript
{
  data: {
    id: "ms_1728567890123_abc123",
    name: "Complete Asset Review",
    description: "Review all submitted assets for quality and brand alignment",
    dueDate: "2025-07-15T23:59:59.000Z",
    status: "pending",
    completedAt: undefined,
    completedBy: undefined,
    createdAt: "2025-10-13T12:00:00.000Z",
    createdBy: "user-id"
  }
}
```

---

### 6. Add Expense

**Request:**
```typescript
const expense = await trpc.projects.addExpense.mutate({
  projectId: "clxxx1234567890",
  description: "Professional photography session",
  amountCents: 150000, // $1,500
  category: "Photography",
  date: "2025-06-15T10:00:00Z",
  metadata: {
    vendor: "Studio A Photography",
    invoiceNumber: "INV-2025-001"
  }
});
```

**Response:**
```typescript
{
  data: {
    id: "exp_1728567890123_xyz789",
    description: "Professional photography session",
    amountCents: 150000,
    category: "Photography",
    date: "2025-06-15T10:00:00.000Z",
    createdBy: "user-id",
    createdAt: "2025-10-13T12:00:00.000Z",
    metadata: {
      vendor: "Studio A Photography",
      invoiceNumber: "INV-2025-001"
    }
  }
}
```

---

### 7. Get Budget Summary

**Request:**
```typescript
const summary = await trpc.projects.getBudgetSummary.useQuery({
  projectId: "clxxx1234567890"
});
```

**Response:**
```typescript
{
  data: {
    budgetCents: 500000,
    spentCents: 150000,
    remainingCents: 350000,
    utilizationPercent: 30,
    expenseCount: 1,
    expenses: [
      {
        id: "exp_1728567890123_xyz789",
        description: "Professional photography session",
        amountCents: 150000,
        category: "Photography",
        date: "2025-06-15T10:00:00.000Z",
        createdBy: "user-id",
        createdAt: "2025-10-13T12:00:00.000Z",
        metadata: { ... }
      }
      // Sorted by date (newest first)
    ]
  }
}
```

---

### 8. Error Response Example

**Invalid Status Transition:**
```typescript
{
  error: {
    code: "BAD_REQUEST",
    message: "Invalid status transition from COMPLETED to ACTIVE"
  }
}
```

**Unauthorized Access:**
```typescript
{
  error: {
    code: "FORBIDDEN",
    message: "You do not have permission to access this project"
  }
}
```

**Validation Error:**
```typescript
{
  error: {
    code: "BAD_REQUEST",
    message: "Validation failed",
    data: {
      zodError: {
        fieldErrors: {
          budgetCents: ["Budget cannot be negative"],
          endDate: ["End date must be after start date"]
        }
      }
    }
  }
}
```

---

## TypeScript Type Definitions

Copy these type definitions to your frontend codebase:

```typescript
// ============================================================================
// ENUMS
// ============================================================================

export type ProjectStatus = 
  | 'DRAFT'
  | 'ACTIVE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ProjectType = 
  | 'CAMPAIGN'
  | 'CONTENT'
  | 'LICENSING';

export type ProjectSortBy = 
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'budgetCents'
  | 'startDate';

export type SortOrder = 'asc' | 'desc';

export type TeamMemberRole = 
  | 'brand_admin'
  | 'creator'
  | 'collaborator'
  | 'viewer';

export type MilestoneStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ProjectRequirements {
  assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
  deliverables?: number;
  exclusivity?: boolean;
  usage?: string[];
  territory?: string[];
  duration?: string;
  [key: string]: any; // Allow flexible requirements
}

export interface ProjectMetadata {
  attachments?: {
    key: string;
    url: string;
    name: string;
    size: number;
    type: string;
  }[];
  tags?: string[];
  categories?: string[];
  teamMembers?: {
    userId: string;
    role: TeamMemberRole;
    addedAt: string;
    addedBy: string;
  }[];
  milestones?: ProjectMilestone[];
  expenses?: BudgetExpense[];
  [key: string]: any; // Allow flexible metadata
}

export interface Project {
  id: string;
  brandId: string;
  brandName?: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  budgetCents: number;
  startDate: string | null;
  endDate: string | null;
  objectives: string[] | null;
  requirements: ProjectRequirements | null;
  metadata: ProjectMetadata | null;
  projectType: ProjectType;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  assetCount?: number;
  licenseCount?: number;
}

export interface ProjectWithRelations extends Project {
  brand: {
    id: string;
    companyName: string;
    logo: string | null;
  };
  _count?: {
    assets?: number;
    licenses?: number;
    events?: number;
  };
}

// ============================================================================
// TEAM TYPES
// ============================================================================

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: TeamMemberRole;
  avatarUrl: string | null;
  addedAt?: string;
  addedBy?: string;
}

// ============================================================================
// TIMELINE TYPES
// ============================================================================

export interface ProjectMilestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  status: MilestoneStatus;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  createdBy: string;
}

// ============================================================================
// BUDGET TYPES
// ============================================================================

export interface BudgetExpense {
  id: string;
  description: string;
  amountCents: number;
  category: string;
  date: string;
  createdBy: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface BudgetSummary {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  utilizationPercent: number;
  expenseCount: number;
  expenses: BudgetExpense[];
}

// ============================================================================
// PAGINATION & FILTERING
// ============================================================================

export interface ProjectSearchFilters {
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDateFrom?: string;
  startDateTo?: string;
}

export interface ProjectListResponse {
  data: Project[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface ProjectStatistics {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  byType: Record<ProjectType, number>;
  totalBudgetCents: number;
  avgBudgetCents: number;
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  budgetCents: number;
  startDate?: string;
  endDate?: string;
  objectives?: string[];
  requirements?: ProjectRequirements;
  metadata?: ProjectMetadata;
  projectType?: ProjectType;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  description?: string | null;
  budgetCents?: number;
  startDate?: string | null;
  endDate?: string | null;
  objectives?: string[] | null;
  requirements?: ProjectRequirements | null;
  metadata?: ProjectMetadata | null;
  status?: ProjectStatus;
  projectType?: ProjectType;
}

export interface ListProjectsInput {
  // Filters
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDateFrom?: string;
  startDateTo?: string;
  
  // Pagination
  page?: number;
  limit?: number;
  
  // Sorting
  sortBy?: ProjectSortBy;
  sortOrder?: SortOrder;
}

export interface AddTeamMemberInput {
  projectId: string;
  userId: string;
  role?: 'collaborator' | 'viewer';
}

export interface UpdateTeamMemberRoleInput {
  projectId: string;
  userId: string;
  role: 'collaborator' | 'viewer';
}

export interface CreateMilestoneInput {
  projectId: string;
  name: string;
  description?: string;
  dueDate: string;
}

export interface UpdateMilestoneInput {
  projectId: string;
  milestoneId: string;
  name?: string;
  description?: string | null;
  dueDate?: string;
  status?: MilestoneStatus;
}

export interface AddExpenseInput {
  projectId: string;
  description: string;
  amountCents: number;
  category: string;
  date: string;
  metadata?: Record<string, any>;
}

export interface UpdateExpenseInput {
  projectId: string;
  expenseId: string;
  description?: string;
  amountCents?: number;
  category?: string;
  date?: string;
  metadata?: Record<string, any> | null;
}
```

### Zod Schemas (for form validation)

```typescript
import { z } from 'zod';

export const createProjectSchema = z.object({
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
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).default('CAMPAIGN'),
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

export const addExpenseSchema = z.object({
  description: z.string().min(3).max(500),
  amountCents: z.number().int().min(1, 'Amount must be positive'),
  category: z.string().min(1).max(100),
  date: z.string().datetime(),
});
```

---

## Business Logic & Validation Rules

### Project Creation

**Required Fields:**
- `name` (3-200 characters)
- `budgetCents` (0 - 100,000,000 = $0 - $1M)
- `projectType` (defaults to 'CAMPAIGN')

**Optional Fields:**
- `description` (max 5000 characters)
- `startDate`, `endDate` (ISO 8601 datetime)
- `objectives` (max 10 items)
- `requirements` (flexible JSONB structure)
- `metadata` (flexible JSONB structure)

**Validation Rules:**
1. Only **Brand** users can create projects
2. Brand must be verified and active
3. If dates provided: `endDate` must be after `startDate`
4. Budget must be in cents (whole numbers only)
5. Duplicate project names are warned but allowed
6. Initial status is always `DRAFT`

**Business Logic:**
- Projects start in `DRAFT` status
- Brand admin is automatically added to team
- Audit log entry created
- Analytics event tracked
- Email notification sent to brand

---

### Status Transitions

Valid status transitions follow this state machine:

```
DRAFT → ACTIVE → IN_PROGRESS → COMPLETED
  ↓       ↓           ↓
CANCELLED ← ← ← ← ← ← ←
  ↓
ARCHIVED

Notes:
- ARCHIVED is terminal (no transitions out)
- CANCELLED can be set from any status except ARCHIVED
- Cannot transition backward (e.g., COMPLETED → ACTIVE)
```

**Status Definitions:**
- **DRAFT**: Initial state, project being prepared
- **ACTIVE**: Project published, accepting applications
- **IN_PROGRESS**: Work has started
- **COMPLETED**: All work delivered and accepted
- **CANCELLED**: Project terminated early
- **ARCHIVED**: Historical record, no modifications allowed

**Restrictions:**
- Cannot delete project with active licenses
- Cannot change status to ARCHIVED if project is DRAFT (must progress first)
- Admins can force any transition, brands follow normal flow

---

### Budget Management

**Budget Rules:**
1. Budget stored in **cents** (avoid floating-point issues)
2. Minimum budget: $0 (0 cents)
3. Maximum budget: $1,000,000 (100,000,000 cents)
4. Cannot reduce budget below committed amount (licenses + expenses)
5. Budget exceeded warning (non-blocking)

**Expense Tracking:**
- Expenses stored in `project.metadata.expenses` (JSONB)
- Each expense has unique ID: `exp_{timestamp}_{random}`
- Expenses sorted by date (newest first)
- Categories are free-form text
- Optional metadata for vendor info, invoice numbers, etc.

**Budget Calculation:**
```typescript
// Utilization percent
utilizationPercent = (spentCents / budgetCents) * 100

// Remaining budget
remainingCents = budgetCents - spentCents

// Spent includes:
// - All expenses
// - Active license commitments (future: currently 0)
```

---

### Team Management

**Roles:**
- `brand_admin`: Project owner, full permissions (cannot be removed)
- `creator`: Asset contributor (auto-added when assets submitted)
- `collaborator`: Can edit project, add expenses, manage team
- `viewer`: Read-only access

**Rules:**
1. Brand admin automatically added on project creation
2. Brand admin cannot be removed from team
3. Only brand admin can add/remove team members
4. Only brand admin and collaborators can modify project
5. Team members stored in `project.metadata.teamMembers`

---

### Timeline & Milestones

**Rules:**
1. Milestone `dueDate` must be within project date range
2. Status transitions: `pending` → `in_progress` → `completed`/`cancelled`
3. Auto-track completion: `completedAt` and `completedBy` set when status = `completed`
4. Milestones stored in `project.metadata.milestones` (JSONB)
5. Each milestone has unique ID: `ms_{timestamp}_{random}`

---

### Search & Filtering

**Search Fields:**
- Project name (case-insensitive, partial match)
- Description (case-insensitive, partial match)

**Filterable Fields:**
- `status` (exact match)
- `projectType` (exact match)
- `brandId` (exact match)
- `budgetCents` (range: min/max)
- `startDate` (range: from/to)

**Sortable Fields:**
- `createdAt`, `updatedAt` (default: `createdAt desc`)
- `name` (alphabetical)
- `budgetCents` (numeric)
- `startDate` (chronological)

---

## Error Handling

### HTTP Status Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success (queries) |
| 201 | Created (mutations) |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found (project/resource doesn't exist) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

### Error Codes

| Error Code | HTTP Status | Description | User Message |
|------------|-------------|-------------|--------------|
| `INVALID_INPUT` | 400 | Validation error | "Please check your input and try again" |
| `PROJECT_NOT_FOUND` | 404 | Project doesn't exist | "Project not found" |
| `UNAUTHORIZED` | 403 | Missing permissions | "You don't have permission to access this project" |
| `ONLY_BRANDS_CAN_CREATE` | 403 | Creator trying to create | "Only brand accounts can create projects" |
| `INVALID_STATUS_TRANSITION` | 400 | Invalid status change | "Cannot change status from {from} to {to}" |
| `PROJECT_HAS_ACTIVE_LICENSES` | 400 | Cannot delete | "Cannot delete project with active licenses" |
| `TEAM_MEMBER_NOT_FOUND` | 404 | User not in team | "Team member not found" |
| `TEAM_MEMBER_ALREADY_EXISTS` | 400 | Duplicate add | "User is already a team member" |
| `CANNOT_REMOVE_BRAND_ADMIN` | 400 | Trying to remove owner | "Cannot remove brand admin from project" |
| `MILESTONE_NOT_FOUND` | 404 | Milestone doesn't exist | "Milestone not found" |
| `EXPENSE_NOT_FOUND` | 404 | Expense doesn't exist | "Expense not found" |
| `BUDGET_EXCEEDED` | 400 | Over budget (warning) | "Warning: This expense exceeds your budget" |

### Error Response Format

```typescript
interface TRPCError {
  error: {
    code: string; // tRPC error code
    message: string; // Human-readable message
    data?: {
      zodError?: {
        fieldErrors: Record<string, string[]>;
      };
      // Additional context
    };
  };
}
```

### Error Handling Examples

**React Query with tRPC:**

```typescript
import { toast } from 'sonner';

const createProjectMutation = trpc.projects.create.useMutation({
  onError: (error) => {
    // Specific error handling
    switch (error.data?.code) {
      case 'ONLY_BRANDS_CAN_CREATE':
        toast.error('Only brand accounts can create projects');
        break;
      case 'INVALID_INPUT':
        // Show field-level errors
        const fieldErrors = error.data?.zodError?.fieldErrors;
        if (fieldErrors) {
          Object.entries(fieldErrors).forEach(([field, errors]) => {
            toast.error(`${field}: ${errors.join(', ')}`);
          });
        }
        break;
      default:
        toast.error(error.message || 'Failed to create project');
    }
  },
  onSuccess: (data) => {
    toast.success('Project created successfully');
    router.push(`/projects/${data.data.id}`);
  },
});
```

**Form Validation Errors:**

```typescript
const form = useForm<CreateProjectInput>({
  resolver: zodResolver(createProjectSchema),
});

// Display errors in form
<Input
  {...form.register('name')}
  error={form.formState.errors.name?.message}
/>
```

**Global Error Boundary:**

```typescript
function ProjectErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error) => {
        if (error.data?.code === 'PROJECT_NOT_FOUND') {
          return <NotFoundPage />;
        }
        if (error.data?.code === 'UNAUTHORIZED') {
          return <UnauthorizedPage />;
        }
        return <GenericErrorPage />;
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

---

## Authorization & Permissions

### User Roles

| Role | Description |
|------|-------------|
| `ADMIN` | Platform administrator, full access |
| `BRAND` | Brand account, can create/manage own projects |
| `CREATOR` | Content creator, view access to projects |
| `VIEWER` | Limited read-only access |

### Endpoint Permissions Matrix

| Endpoint | ADMIN | BRAND (Owner) | BRAND (Other) | CREATOR | VIEWER |
|----------|-------|---------------|---------------|---------|--------|
| `create` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `getById` | ✅ | ✅ | ❌ | ✅* | ❌ |
| `list` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `update` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `delete` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `addTeamMember` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `removeTeamMember` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `updateTeamMemberRole` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `createMilestone` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `addExpense` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `getBudgetSummary` | ✅ | ✅ | ❌ | ✅* | ❌ |

\* Only if part of project team

### Permission Check Flow

```typescript
// Frontend permission check helper
function canUserEditProject(project: Project, userId: string, userRole: string): boolean {
  // Admin can edit any project
  if (userRole === 'ADMIN') return true;
  
  // Brand can edit their own project
  if (userRole === 'BRAND' && project.brandId === user.brandId) return true;
  
  // Collaborators can edit if they're on the team
  if (project.metadata?.teamMembers) {
    const member = project.metadata.teamMembers.find(m => m.userId === userId);
    if (member && member.role === 'collaborator') return true;
  }
  
  return false;
}
```

### Row-Level Security

Projects implement row-level security in the database:

```sql
-- Brands can only see their own projects
-- Admins can see all projects
-- Team members can see projects they're assigned to
```

### Field-Level Permissions

No field-level restrictions currently. All fields visible to users with read access.

---

## Rate Limiting & Quotas

### Current Rate Limits

⚠️ **Note:** Rate limiting is not currently implemented for the Projects module. However, global API rate limits may apply.

### Recommended Client-Side Throttling

Implement client-side throttling to prevent excessive requests:

```typescript
import { useMutation } from '@tanstack/react-query';
import { debounce } from 'lodash';

// Debounce search input
const debouncedSearch = debounce((value: string) => {
  refetch({ search: value });
}, 500);

// Throttle expensive operations
const throttledUpdate = throttle(
  (data: UpdateProjectInput) => updateMutation.mutate(data),
  1000
);
```

### Best Practices

1. **Use pagination** for list endpoints (max 100 items per page)
2. **Implement debouncing** for search/filter inputs (500ms recommended)
3. **Cache aggressively** with React Query (5-minute stale time)
4. **Batch updates** when possible (combine multiple field updates)

---

## File Uploads

### Project Attachments

Attachments are handled through the File Management module (separate integration guide).

**Flow:**
1. Request signed upload URL from File Management API
2. Upload file directly to R2 storage
3. Store attachment metadata in `project.metadata.attachments`

**Example:**

```typescript
// Step 1: Get signed URL
const { signedUrl, key } = await trpc.files.getSignedUploadUrl.mutate({
  fileName: 'campaign-brief.pdf',
  fileType: 'application/pdf',
  folder: 'project-attachments',
});

// Step 2: Upload file
await fetch(signedUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
  },
});

// Step 3: Update project with attachment metadata
await trpc.projects.update.mutate({
  id: projectId,
  metadata: {
    ...project.metadata,
    attachments: [
      ...(project.metadata?.attachments || []),
      {
        key,
        url: `https://cdn.yesgoddess.agency/${key}`,
        name: file.name,
        size: file.size,
        type: file.type,
      },
    ],
  },
});
```

**Restrictions:**
- Max file size: 50MB
- Allowed types: PDF, Word, Images, Videos
- Attachments stored in `project.metadata.attachments` array

---

## Real-time Updates

### Webhook Events

The Projects module emits webhook events for real-time updates:

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `project.created` | New project created | Full project object |
| `project.updated` | Project modified | Updated project object |
| `project.deleted` | Project soft deleted | Project ID |
| `project.status_changed` | Status transition | Project ID, old status, new status |
| `project.team_member_added` | Team member added | Project ID, user ID, role |
| `project.team_member_removed` | Team member removed | Project ID, user ID |
| `project.milestone_created` | Milestone created | Project ID, milestone object |
| `project.milestone_completed` | Milestone marked complete | Project ID, milestone ID |
| `project.expense_added` | Expense added | Project ID, expense object |

### Polling Recommendations

If webhooks are not available, implement polling for real-time updates:

```typescript
// Poll project details every 30 seconds
const { data: project } = trpc.projects.getById.useQuery(
  { id: projectId },
  {
    refetchInterval: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  }
);

// Poll milestones on project detail page
const { data: milestones } = trpc.projects.listMilestones.useQuery(
  { projectId },
  {
    refetchInterval: 60000, // 1 minute
  }
);
```

### WebSocket/SSE

Not currently implemented. Use polling or webhooks.

---

## Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination** (page/limit):

```typescript
interface PaginationParams {
  page: number;      // Current page (1-indexed)
  limit: number;     // Items per page (1-100)
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;        // Total items
    totalPages: number;   // Total pages
  };
}
```

**Example:**
```typescript
// Page 2, 20 items per page
const result = await trpc.projects.list.useQuery({
  page: 2,
  limit: 20,
});

// Calculate total pages
const totalPages = Math.ceil(result.data.meta.total / result.data.meta.limit);
```

### Filtering

**Available Filters:**

```typescript
interface ProjectFilters {
  brandId?: string;        // Filter by brand
  status?: ProjectStatus;  // Filter by status
  projectType?: ProjectType; // Filter by type
  search?: string;         // Search name/description
  budgetMin?: number;      // Minimum budget (cents)
  budgetMax?: number;      // Maximum budget (cents)
  startDateFrom?: string;  // Start date range (ISO 8601)
  startDateTo?: string;    // Start date range (ISO 8601)
}
```

**Filter Combinations:**
- All filters can be combined (AND logic)
- Search is case-insensitive and partial match
- Date ranges are inclusive

**Example:**
```typescript
// Active campaigns with budget $1k-$10k starting in June 2025
const result = await trpc.projects.list.useQuery({
  status: 'ACTIVE',
  projectType: 'CAMPAIGN',
  budgetMin: 100000,    // $1,000
  budgetMax: 1000000,   // $10,000
  startDateFrom: '2025-06-01T00:00:00Z',
  startDateTo: '2025-06-30T23:59:59Z',
  page: 1,
  limit: 20,
});
```

### Sorting

**Available Sort Fields:**

```typescript
type ProjectSortBy = 
  | 'createdAt'   // Creation date
  | 'updatedAt'   // Last update
  | 'name'        // Alphabetical
  | 'budgetCents' // Numeric
  | 'startDate';  // Chronological

type SortOrder = 'asc' | 'desc';
```

**Default Sort:** `createdAt desc` (newest first)

**Example:**
```typescript
// Sort by budget (highest first)
const result = await trpc.projects.list.useQuery({
  sortBy: 'budgetCents',
  sortOrder: 'desc',
  page: 1,
  limit: 20,
});
```

### Frontend Pagination Component

```typescript
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </button>
      
      <span>Page {currentPage} of {totalPages}</span>
      
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic CRUD (Week 1)

#### Setup
- [ ] Install tRPC client and dependencies
- [ ] Configure tRPC client with authentication
- [ ] Copy TypeScript type definitions to frontend
- [ ] Set up React Query for data fetching
- [ ] Create API client abstraction layer

#### Project List Page
- [ ] Create project list component with pagination
- [ ] Implement search/filter UI (status, type, budget, dates)
- [ ] Add sorting controls (created date, budget, name)
- [ ] Display project cards with key info (name, status, budget, dates)
- [ ] Implement "Create Project" button (brand users only)
- [ ] Add loading states and skeleton loaders
- [ ] Handle empty states ("No projects found")

#### Project Creation Form
- [ ] Create multi-step form (basic info → details → review)
- [ ] Implement field validation with Zod
- [ ] Add budget input with cents conversion ($5.00 → 500 cents)
- [ ] Date range picker for start/end dates
- [ ] Objectives list builder (add/remove)
- [ ] Requirements builder (asset types, deliverables, etc.)
- [ ] Show validation errors inline
- [ ] Success toast + redirect to project detail

#### Project Detail Page
- [ ] Fetch and display full project details
- [ ] Show brand info and team members
- [ ] Display status badge with color coding
- [ ] Show budget and utilization (if expenses exist)
- [ ] List milestones (if any)
- [ ] List expenses (if any)
- [ ] Asset gallery placeholder (link to IP Assets module)
- [ ] "Edit Project" button (owner/admin only)
- [ ] "Delete Project" button with confirmation modal

#### Project Edit Page
- [ ] Pre-populate form with existing data
- [ ] Allow status change (show valid transitions)
- [ ] Prevent invalid status transitions
- [ ] Handle date validation (end after start)
- [ ] Show "unsaved changes" warning
- [ ] Optimistic updates with React Query

#### Error Handling
- [ ] Global error boundary for projects
- [ ] Handle 404 (project not found)
- [ ] Handle 403 (unauthorized access)
- [ ] Show user-friendly error messages
- [ ] Retry failed requests with exponential backoff

---

### Phase 2: Team Management (Week 2)

#### Team Members Tab
- [ ] Create team members list component
- [ ] Display member info (name, email, avatar, role)
- [ ] "Add Team Member" button (owner only)
- [ ] Role badges (brand_admin, collaborator, viewer)
- [ ] "Remove" button per member (except brand admin)
- [ ] "Change Role" dropdown per member

#### Add Team Member Modal
- [ ] User search/autocomplete input
- [ ] Role selector (collaborator/viewer)
- [ ] Validation (prevent duplicate adds)
- [ ] Success toast on add
- [ ] Auto-refresh team list

#### Remove Team Member
- [ ] Confirmation modal ("Are you sure?")
- [ ] Prevent removing brand admin (UI + backend)
- [ ] Success toast on remove
- [ ] Auto-refresh team list

#### Change Member Role
- [ ] Inline role dropdown
- [ ] Prevent changing brand admin role
- [ ] Optimistic update
- [ ] Revert on error

---

### Phase 3: Timeline & Milestones (Week 2-3)

#### Milestones Tab
- [ ] Create milestones list component
- [ ] Display milestones in timeline view
- [ ] Show milestone status with color coding
- [ ] Filter by status (pending/in progress/completed/cancelled)
- [ ] "Create Milestone" button
- [ ] Edit/delete actions per milestone

#### Create Milestone Modal
- [ ] Name input (3-200 chars)
- [ ] Description textarea (optional)
- [ ] Due date picker
- [ ] Validate date within project range
- [ ] Success toast on create

#### Edit Milestone
- [ ] Pre-populate form
- [ ] Status dropdown (pending/in progress/completed/cancelled)
- [ ] Track completion date when marked complete
- [ ] Prevent editing completed milestones (optional UX choice)

#### Timeline Visualization
- [ ] Visual timeline component (optional enhancement)
- [ ] Show milestones on timeline
- [ ] Indicate overdue milestones in red
- [ ] Progress bar (% milestones completed)

---

### Phase 4: Budget Tracking (Week 3)

#### Budget Tab
- [ ] Create budget summary component
- [ ] Display budget, spent, remaining
- [ ] Utilization progress bar with percentage
- [ ] Show "over budget" warning if exceeded
- [ ] Expense list table (date, description, amount, category)
- [ ] "Add Expense" button
- [ ] Edit/delete actions per expense

#### Add Expense Modal
- [ ] Description input
- [ ] Amount input (convert $ to cents)
- [ ] Category input or selector
- [ ] Date picker
- [ ] Optional metadata (vendor, invoice #)
- [ ] Show "over budget" warning before submit
- [ ] Success toast on add

#### Edit Expense
- [ ] Pre-populate form
- [ ] Same validation as create
- [ ] Optimistic update

#### Budget Analytics (Optional)
- [ ] Expense breakdown by category (pie chart)
- [ ] Spending over time (line chart)
- [ ] Export expenses to CSV

---

### Phase 5: Advanced Features (Week 4)

#### Statistics Dashboard
- [ ] Fetch project statistics
- [ ] Display total projects
- [ ] Breakdown by status (chart)
- [ ] Breakdown by type (chart)
- [ ] Average budget metric
- [ ] Filter by date range

#### Search & Filters
- [ ] Advanced filter panel
- [ ] Budget range slider
- [ ] Date range picker
- [ ] Multiple status selection
- [ ] Save filter presets (optional)

#### Bulk Actions
- [ ] Multi-select projects
- [ ] Bulk status change
- [ ] Bulk delete (with confirmation)
- [ ] Export selected to CSV

#### Activity Feed
- [ ] Show recent project events
- [ ] Filter by event type
- [ ] Link to relevant resources

---

### Phase 6: Polish & Optimization (Week 5)

#### Performance
- [ ] Implement React Query caching (5-minute stale time)
- [ ] Prefetch project details on list hover
- [ ] Lazy load expense list
- [ ] Optimize images (brand logos, avatars)
- [ ] Implement virtual scrolling for long lists

#### UX Enhancements
- [ ] Add keyboard shortcuts (e.g., `N` for new project)
- [ ] Implement optimistic updates for all mutations
- [ ] Add loading indicators for all actions
- [ ] Smooth transitions and animations
- [ ] Mobile-responsive layouts

#### Accessibility
- [ ] ARIA labels for all interactive elements
- [ ] Keyboard navigation support
- [ ] Focus management in modals
- [ ] Screen reader announcements
- [ ] Color contrast compliance (WCAG AA)

#### Testing
- [ ] Unit tests for form validation
- [ ] Integration tests for CRUD operations
- [ ] E2E tests for critical user journeys
- [ ] Test error scenarios
- [ ] Test permission boundaries

---

### Edge Cases to Handle

#### Project Edge Cases
- [ ] Project with no start/end dates
- [ ] Project with 0 budget
- [ ] Project with 100+ objectives
- [ ] Project with very long name/description
- [ ] Deleted project (soft delete) - hide from UI

#### Team Edge Cases
- [ ] Project with 0 team members (impossible, but check)
- [ ] Project with 50+ team members
- [ ] User who no longer exists (deleted account)
- [ ] User invited but not yet accepted

#### Milestone Edge Cases
- [ ] Milestone due date in the past
- [ ] 50+ milestones on one project
- [ ] Milestone due date outside project range (catch on backend)
- [ ] Completed milestone edited

#### Budget Edge Cases
- [ ] Budget exceeded (warn but allow)
- [ ] Negative expense amount (prevent on frontend)
- [ ] Expense date before project start
- [ ] 100+ expenses (paginate or virtual scroll)

#### Permission Edge Cases
- [ ] User loses access mid-session (refresh on 403)
- [ ] Brand user trying to access another brand's project
- [ ] Creator trying to create project
- [ ] Deleted brand/user

---

### UX Considerations

#### Status Indicators
Use consistent color coding across the app:
- `DRAFT`: Gray (#6B7280)
- `ACTIVE`: Green (#10B981)
- `IN_PROGRESS`: Blue (#3B82F6)
- `COMPLETED`: Purple (#8B5CF6)
- `CANCELLED`: Red (#EF4444)
- `ARCHIVED`: Black (#1F2937)

#### Budget Display
Always show budget in dollars with cents:
```typescript
function formatBudget(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Example: 500000 cents → "$5,000.00"
```

#### Date Display
Use relative dates for recent items:
```typescript
import { formatDistanceToNow } from 'date-fns';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.abs(date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  
  if (diffInDays < 7) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return date.toLocaleDateString();
}

// Example: "2 days ago" or "Jun 1, 2025"
```

#### Loading States
- Skeleton loaders for list items
- Inline spinners for actions
- Disabled buttons during mutations
- Optimistic updates for instant feedback

#### Empty States
Provide actionable empty states:
- "No projects yet. Create your first project to get started."
- "No team members. Add collaborators to work together."
- "No milestones. Add milestones to track your progress."

#### Confirmation Modals
Use confirmation modals for destructive actions:
- Delete project: "Are you sure? This cannot be undone."
- Remove team member: "Remove [name] from this project?"
- Delete expense: "Delete this expense?"

---

## Summary

This guide provides everything needed to integrate the Projects module into the YES GODDESS frontend:

✅ **25 API endpoints** with full request/response examples  
✅ **Complete TypeScript types** ready to copy  
✅ **Validation schemas** for form handling  
✅ **Permission matrix** for role-based UI  
✅ **Error codes** with user-friendly messages  
✅ **Implementation checklist** with phased approach  
✅ **Edge cases** and UX considerations  

### Next Steps

1. Copy type definitions to frontend codebase
2. Set up tRPC client with authentication
3. Build project list page (Phase 1)
4. Implement CRUD operations
5. Add team management features
6. Integrate milestone tracking
7. Build budget management UI
8. Polish and optimize

### Support & Questions

- **Backend API:** `ops.yesgoddess.agency`
- **API Documentation:** `/api/trpc-panel` (tRPC Panel)
- **Issues:** Create GitHub issue in `machinesoul11/yg-backend`

---

**Document Version:** 1.0  
**Generated:** October 13, 2025  
**Backend Version:** Projects Module v1.0 (Complete)
