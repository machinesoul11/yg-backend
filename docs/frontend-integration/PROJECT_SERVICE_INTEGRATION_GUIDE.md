# Project Service - Frontend Integration Guide

**Classification:** ⚡ HYBRID  
**Module:** Projects  
**Version:** 1.0.0  
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

The Project Service manages projects/campaigns created by brands to discover and license creator work. Projects act as organizational containers for IP assets, budgets, timelines, and team collaboration.

### Key Features

- ✅ **Complete CRUD operations** for projects
- ✅ **Team management** (add/remove members, role assignments)
- ✅ **Timeline & milestone tracking**
- ✅ **Budget tracking & expense management**
- ✅ **Status lifecycle management** with validation
- ✅ **Role-based access control**
- ✅ **Redis caching** for performance
- ✅ **Audit logging** for all mutations
- ✅ **Email notifications** for project events

### Architecture

- **Backend Deployment:** `ops.yesgoddess.agency`
- **Authentication:** JWT via NextAuth.js
- **API Format:** tRPC with TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Caching:** Redis

---

## API Endpoints

All endpoints are accessed via tRPC at `/api/trpc/projects.*`

### Core Project Operations

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.create` | Mutation | Create new project | Brand only |
| `projects.getById` | Query | Get project by ID | Yes |
| `projects.list` | Query | List projects with filters | Yes |
| `projects.update` | Mutation | Update project | Project owner |
| `projects.delete` | Mutation | Soft delete project | Project owner |
| `projects.getMyProjects` | Query | Get current brand's projects | Brand only |
| `projects.getStatistics` | Query | Get project statistics | Yes |
| `projects.getTeam` | Query | Get project team members | Yes |
| `projects.getAssets` | Query | Get project assets (paginated) | Yes |

### Team Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.addTeamMember` | Mutation | Add member to project | Project owner |
| `projects.removeTeamMember` | Mutation | Remove member from project | Project owner |
| `projects.updateTeamMemberRole` | Mutation | Update member role | Project owner |
| `projects.getEnhancedTeam` | Query | Get team with metadata | Yes |

### Timeline Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.createMilestone` | Mutation | Create project milestone | Project owner |
| `projects.updateMilestone` | Mutation | Update milestone | Project owner |
| `projects.deleteMilestone` | Mutation | Delete milestone | Project owner |
| `projects.listMilestones` | Query | List milestones | Yes |

### Budget Tracking

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `projects.addExpense` | Mutation | Add expense to project | Project owner |
| `projects.updateExpense` | Mutation | Update expense | Project owner |
| `projects.deleteExpense` | Mutation | Delete expense | Project owner |
| `projects.getBudgetSummary` | Query | Get budget summary | Yes |

---

## Request/Response Examples

### 1. Create Project

**tRPC Call:**
```typescript
const project = await trpc.projects.create.mutate({
  name: "Summer Campaign 2025",
  description: "Looking for vibrant summer content",
  budgetCents: 500000, // $5,000
  projectType: "CAMPAIGN",
  objectives: [
    "Increase brand awareness",
    "Launch new product line"
  ],
  requirements: {
    assetTypes: ["image", "video"],
    deliverables: 10,
    exclusivity: true,
    usage: ["social_media", "website"],
    territory: ["US", "CA"],
    duration: "12 months"
  },
  startDate: "2025-06-01T00:00:00Z",
  endDate: "2025-08-31T23:59:59Z",
  metadata: {
    tags: ["summer", "lifestyle"],
    categories: ["fashion", "outdoor"]
  }
});
```

**Response:**
```json
{
  "data": {
    "id": "clxxx123...",
    "brandId": "clxxx456...",
    "brandName": "Acme Corp",
    "name": "Summer Campaign 2025",
    "description": "Looking for vibrant summer content",
    "status": "DRAFT",
    "budgetCents": 500000,
    "startDate": "2025-06-01T00:00:00.000Z",
    "endDate": "2025-08-31T23:59:59.000Z",
    "objectives": [
      "Increase brand awareness",
      "Launch new product line"
    ],
    "requirements": {
      "assetTypes": ["image", "video"],
      "deliverables": 10,
      "exclusivity": true,
      "usage": ["social_media", "website"],
      "territory": ["US", "CA"],
      "duration": "12 months"
    },
    "metadata": {
      "tags": ["summer", "lifestyle"],
      "categories": ["fashion", "outdoor"]
    },
    "projectType": "CAMPAIGN",
    "createdBy": "user123",
    "updatedBy": null,
    "createdAt": "2025-10-13T10:30:00.000Z",
    "updatedAt": "2025-10-13T10:30:00.000Z",
    "deletedAt": null,
    "assetCount": 0,
    "licenseCount": 0
  }
}
```

**cURL Equivalent (for reference):**
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/projects.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Summer Campaign 2025",
    "description": "Looking for vibrant summer content",
    "budgetCents": 500000,
    "projectType": "CAMPAIGN",
    "objectives": ["Increase brand awareness"],
    "startDate": "2025-06-01T00:00:00Z",
    "endDate": "2025-08-31T23:59:59Z"
  }'
```

---

### 2. List Projects with Filters

**tRPC Call:**
```typescript
const { data } = await trpc.projects.list.useQuery({
  page: 1,
  limit: 20,
  status: "ACTIVE",
  projectType: "CAMPAIGN",
  budgetMin: 100000, // $1,000
  budgetMax: 1000000, // $10,000
  search: "summer",
  sortBy: "createdAt",
  sortOrder: "desc"
});
```

**Response:**
```json
{
  "data": {
    "data": [
      {
        "id": "clxxx123...",
        "brandId": "clxxx456...",
        "brandName": "Acme Corp",
        "name": "Summer Campaign 2025",
        "status": "ACTIVE",
        "budgetCents": 500000,
        "projectType": "CAMPAIGN",
        "createdAt": "2025-10-13T10:30:00.000Z",
        // ... other fields
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

---

### 3. Update Project Status

**tRPC Call:**
```typescript
const project = await trpc.projects.update.mutate({
  id: "clxxx123...",
  status: "ACTIVE",
  budgetCents: 750000 // Increase budget to $7,500
});
```

**Response:**
```json
{
  "data": {
    "id": "clxxx123...",
    "status": "ACTIVE",
    "budgetCents": 750000,
    "updatedAt": "2025-10-13T11:00:00.000Z",
    // ... other fields
  }
}
```

---

### 4. Add Team Member

**tRPC Call:**
```typescript
const member = await trpc.projects.addTeamMember.mutate({
  projectId: "clxxx123...",
  userId: "user789",
  role: "collaborator"
});
```

**Response:**
```json
{
  "data": {
    "id": "user789",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "collaborator",
    "avatarUrl": "https://...",
    "addedAt": "2025-10-13T11:30:00.000Z",
    "addedBy": "user123"
  }
}
```

---

### 5. Create Milestone

**tRPC Call:**
```typescript
const milestone = await trpc.projects.createMilestone.mutate({
  projectId: "clxxx123...",
  name: "Asset Review Complete",
  description: "All submitted assets reviewed and approved",
  dueDate: "2025-07-15T23:59:59Z"
});
```

**Response:**
```json
{
  "data": {
    "id": "ms_1728...",
    "name": "Asset Review Complete",
    "description": "All submitted assets reviewed and approved",
    "dueDate": "2025-07-15T23:59:59.000Z",
    "status": "pending",
    "completedAt": null,
    "completedBy": null,
    "createdAt": "2025-10-13T11:45:00.000Z",
    "createdBy": "user123"
  }
}
```

---

### 6. Add Expense

**tRPC Call:**
```typescript
const expense = await trpc.projects.addExpense.mutate({
  projectId: "clxxx123...",
  description: "Professional photographer for shoot",
  amountCents: 150000, // $1,500
  category: "photography",
  date: "2025-10-13T00:00:00Z",
  metadata: {
    vendor: "John's Photography",
    invoiceNumber: "INV-12345"
  }
});
```

**Response:**
```json
{
  "data": {
    "id": "exp_1728...",
    "description": "Professional photographer for shoot",
    "amountCents": 150000,
    "category": "photography",
    "date": "2025-10-13T00:00:00.000Z",
    "metadata": {
      "vendor": "John's Photography",
      "invoiceNumber": "INV-12345"
    },
    "createdBy": "user123",
    "createdAt": "2025-10-13T12:00:00.000Z"
  }
}
```

---

### 7. Get Budget Summary

**tRPC Call:**
```typescript
const summary = await trpc.projects.getBudgetSummary.useQuery({
  projectId: "clxxx123..."
});
```

**Response:**
```json
{
  "data": {
    "budgetCents": 500000,
    "spentCents": 150000,
    "remainingCents": 350000,
    "utilizationPercent": 30,
    "expenseCount": 1,
    "expenses": [
      {
        "id": "exp_1728...",
        "description": "Professional photographer for shoot",
        "amountCents": 150000,
        "category": "photography",
        "date": "2025-10-13T00:00:00.000Z",
        "createdBy": "user123",
        "createdAt": "2025-10-13T12:00:00.000Z"
      }
    ]
  }
}
```

---

### 8. Error Response Example

**Invalid Status Transition:**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cannot transition from COMPLETED to DRAFT"
  }
}
```

**Unauthorized Access:**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only brand users can create projects"
  }
}
```

**Project Not Found:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project with ID 'clxxx123' not found"
  }
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Project Status Lifecycle
 */
export type ProjectStatus = 
  | 'DRAFT'       // Initial state, not visible to creators
  | 'ACTIVE'      // Published and visible to creators
  | 'IN_PROGRESS' // Work has begun
  | 'COMPLETED'   // All work finished
  | 'CANCELLED'   // Project cancelled
  | 'ARCHIVED';   // Archived for historical purposes

/**
 * Project Types
 */
export type ProjectType = 
  | 'CAMPAIGN'   // Marketing campaign
  | 'CONTENT'    // Content creation project
  | 'LICENSING'; // Licensing opportunity

/**
 * Project Requirements (flexible structure)
 */
export interface ProjectRequirements {
  assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
  deliverables?: number;
  exclusivity?: boolean;
  usage?: string[];
  territory?: string[];
  duration?: string;
  [key: string]: any; // Extensible
}

/**
 * Project Metadata (flexible structure)
 */
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
  teamMembers?: TeamMemberMetadata[];
  milestones?: ProjectMilestone[];
  expenses?: BudgetExpense[];
  [key: string]: any; // Extensible
}

/**
 * Core Project Interface
 */
export interface Project {
  id: string;
  brandId: string;
  brandName?: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  budgetCents: number; // Always in cents to avoid floating-point issues
  startDate: string | null; // ISO 8601 datetime
  endDate: string | null;   // ISO 8601 datetime
  objectives: string[] | null;
  requirements: ProjectRequirements | null;
  metadata: ProjectMetadata | null;
  projectType: ProjectType;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  deletedAt?: string | null; // Soft delete timestamp
  
  // Computed fields (optional)
  assetCount?: number;
  licenseCount?: number;
}

/**
 * Project with Brand Relations
 */
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
```

### Team Management Types

```typescript
/**
 * Team Member Roles
 */
export type TeamMemberRole = 
  | 'brand_admin'  // Brand owner (cannot be removed)
  | 'creator'      // Creator with assets in project
  | 'collaborator' // Can view and comment
  | 'viewer';      // Read-only access

/**
 * Team Member Interface
 */
export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: TeamMemberRole;
  avatarUrl: string | null;
  addedAt?: string;
  addedBy?: string;
}
```

### Timeline & Milestone Types

```typescript
/**
 * Milestone Status
 */
export type MilestoneStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * Project Milestone Interface
 */
export interface ProjectMilestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string; // ISO 8601 datetime
  status: MilestoneStatus;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  createdBy: string;
}
```

### Budget Tracking Types

```typescript
/**
 * Budget Expense Interface
 */
export interface BudgetExpense {
  id: string;
  description: string;
  amountCents: number;
  category: string; // e.g., "photography", "licensing", "marketing"
  date: string; // ISO 8601 datetime
  createdBy: string;
  createdAt: string;
  metadata?: Record<string, any>; // Vendor info, invoice numbers, etc.
}

/**
 * Budget Summary with Analytics
 */
export interface BudgetSummary {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  utilizationPercent: number; // 0-100+
  expenseCount: number;
  expenses: BudgetExpense[]; // Sorted by date (newest first)
}
```

### List & Filtering Types

```typescript
/**
 * Project Search Filters
 */
export interface ProjectSearchFilters {
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string; // Searches name and description
  budgetMin?: number; // In cents
  budgetMax?: number; // In cents
  startDateFrom?: string; // ISO 8601 datetime
  startDateTo?: string;   // ISO 8601 datetime
}

/**
 * Sorting Options
 */
export type ProjectSortBy = 
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'budgetCents'
  | 'startDate';

export type SortOrder = 'asc' | 'desc';

/**
 * Paginated List Response
 */
export interface ProjectListResponse {
  data: Project[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Statistics Types

```typescript
/**
 * Project Statistics
 */
export interface ProjectStatistics {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  byType: Record<ProjectType, number>;
  totalBudgetCents: number;
  avgBudgetCents: number;
}
```

### Zod Validation Schemas

```typescript
import { z } from 'zod';

/**
 * Create Project Schema
 */
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
  requirements: z.object({
    assetTypes: z.array(z.enum(['image', 'video', 'audio', 'document'])).optional(),
    deliverables: z.number().int().min(1).max(100).optional(),
    exclusivity: z.boolean().optional(),
    usage: z.array(z.string()).optional(),
    territory: z.array(z.string()).optional(),
    duration: z.string().optional(),
  }).passthrough().optional(),
  metadata: z.object({
    attachments: z.array(z.object({
      key: z.string(),
      url: z.string().url(),
      name: z.string(),
      size: z.number(),
      type: z.string(),
    })).optional(),
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
  }).passthrough().optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).default('CAMPAIGN'),
}).refine(
  (data) => {
    // End date must be after start date
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

/**
 * Update Project Schema
 */
export const updateProjectSchema = z.object({
  id: z.string().cuid('Invalid project ID'),
  name: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  budgetCents: z.number().int().min(0).max(100000000).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  objectives: z.array(z.string()).max(10).optional().nullable(),
  requirements: z.object({/* same as create */}).passthrough().optional().nullable(),
  metadata: z.object({/* same as create */}).passthrough().optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).optional(),
}).refine(/* same date validation */);

/**
 * Add Team Member Schema
 */
export const addTeamMemberSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  userId: z.string().cuid('Invalid user ID'),
  role: z.enum(['collaborator', 'viewer']).default('collaborator'),
});

/**
 * Create Milestone Schema
 */
export const createMilestoneSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  name: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  dueDate: z.string().datetime(),
});

/**
 * Add Expense Schema
 */
export const addExpenseSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  description: z.string().min(3).max(500),
  amountCents: z.number().int().min(1, 'Amount must be positive'),
  category: z.string().min(1).max(100),
  date: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional(),
});
```

---

## Business Logic & Validation Rules

### Field Validation

| Field | Validation Rules |
|-------|-----------------|
| `name` | Required, 3-200 characters |
| `description` | Optional, max 5000 characters |
| `budgetCents` | Required, integer, 0 to 100,000,000 (max $1M) |
| `startDate` | Optional, ISO 8601 datetime, must be before `endDate` |
| `endDate` | Optional, ISO 8601 datetime, must be after `startDate` |
| `objectives` | Optional array, max 10 items |
| `projectType` | Required, one of: CAMPAIGN, CONTENT, LICENSING |

### Status Transition Rules

The project status follows a lifecycle with validation:

```
DRAFT → ACTIVE → IN_PROGRESS → COMPLETED
  ↓       ↓          ↓
CANCELLED ← ← ← ← ← ← ← ← ← → ARCHIVED
```

**Valid Transitions:**

| From | To | Conditions |
|------|-----|-----------|
| DRAFT | ACTIVE | Project has required fields |
| DRAFT | CANCELLED | Always allowed |
| ACTIVE | IN_PROGRESS | Assets can be attached |
| ACTIVE | CANCELLED | Always allowed |
| IN_PROGRESS | COMPLETED | All milestones complete (optional) |
| IN_PROGRESS | CANCELLED | Always allowed |
| COMPLETED | ARCHIVED | At least 30 days old |
| CANCELLED | ARCHIVED | At least 30 days old |

**Invalid Transitions:**
- Cannot go back from COMPLETED to any status except ARCHIVED
- Cannot go back from ARCHIVED to any status
- Cannot skip IN_PROGRESS when activating (must go ACTIVE → IN_PROGRESS)

### Budget Validation

1. **Budget Adjustments:**
   - Budget can be increased at any time
   - Budget can be decreased if no expenses exceed new budget
   - Admins can override budget constraints

2. **Expense Warnings:**
   - System warns (but allows) expenses that exceed budget
   - Warning logged in audit trail
   - Brand receives notification when budget utilization > 90%

3. **Budget Calculation:**
   ```typescript
   utilizationPercent = (spentCents / budgetCents) * 100
   remainingCents = budgetCents - spentCents
   ```

### Date Range Validation

1. **Project Date Rules:**
   - `endDate` must be after `startDate`
   - Dates are optional but recommended
   - Milestone due dates must fall within project date range

2. **Date Change Validation:**
   - Cannot shorten date range if active licenses exist
   - Milestone due dates automatically adjusted if needed
   - Admin override available

### Duplicate Detection

System checks for potential duplicates based on:
- Same brand
- Similar name (fuzzy match)
- Overlapping date range
- Same project type

**Response:** Warning only, does not block creation.

### Permission Checks

All operations check:
1. User is authenticated
2. User has required role
3. User owns the resource (brands can only access their projects)
4. Admin users have override access

---

## Error Handling

### Error Codes

| HTTP Code | tRPC Code | Error Class | Description |
|-----------|-----------|-------------|-------------|
| 404 | `NOT_FOUND` | `ProjectNotFoundError` | Project doesn't exist or user lacks access |
| 403 | `FORBIDDEN` | `ProjectUnauthorizedError` | User lacks permission |
| 403 | `FORBIDDEN` | `OnlyBrandsCanCreateProjectsError` | Only brand accounts can create projects |
| 400 | `BAD_REQUEST` | `InvalidStatusTransitionError` | Invalid status change |
| 400 | `BAD_REQUEST` | `ProjectHasActiveLicensesError` | Cannot delete project with active licenses |
| 400 | `BAD_REQUEST` | `TeamMemberAlreadyExistsError` | User is already a team member |
| 400 | `BAD_REQUEST` | `CannotRemoveBrandAdminError` | Brand admin cannot be removed |
| 400 | `BAD_REQUEST` | `BudgetExceededError` | Expense exceeds available budget (warning) |
| 404 | `NOT_FOUND` | `TeamMemberNotFoundError` | Team member doesn't exist |
| 404 | `NOT_FOUND` | `MilestoneNotFoundError` | Milestone doesn't exist |
| 404 | `NOT_FOUND` | `ExpenseNotFoundError` | Expense doesn't exist |
| 500 | `INTERNAL_SERVER_ERROR` | `ProjectCreationError` | Failed to create project |
| 500 | `INTERNAL_SERVER_ERROR` | `ProjectUpdateError` | Failed to update project |
| 500 | `INTERNAL_SERVER_ERROR` | `ProjectDeleteError` | Failed to delete project |

### Error Response Format

```typescript
interface TRPCError {
  error: {
    code: string; // tRPC error code
    message: string; // Human-readable message
    data?: {
      code: string; // Custom error code
      httpStatus: number;
      path: string;
      stack?: string; // Only in development
    };
  };
}
```

### Error Handling Examples

```typescript
try {
  const project = await trpc.projects.create.mutate({
    name: "Test",
    budgetCents: 10000,
    projectType: "CAMPAIGN"
  });
} catch (error) {
  if (error.data?.code === 'FORBIDDEN') {
    // User doesn't have permission
    toast.error('Only brand accounts can create projects');
  } else if (error.data?.code === 'BAD_REQUEST') {
    // Validation error
    toast.error(error.message);
  } else {
    // Unknown error
    toast.error('An unexpected error occurred');
  }
}
```

### User-Friendly Error Messages

| Error Code | User Message |
|------------|--------------|
| `ProjectNotFoundError` | "This project doesn't exist or you don't have access to it." |
| `ProjectUnauthorizedError` | "You don't have permission to perform this action." |
| `OnlyBrandsCanCreateProjectsError` | "Only brand accounts can create projects. Please create a brand profile first." |
| `InvalidStatusTransitionError` | "Cannot change project status from {from} to {to}." |
| `ProjectHasActiveLicensesError` | "Cannot delete project with active licenses. Please archive instead." |
| `TeamMemberAlreadyExistsError` | "This user is already a team member." |
| `CannotRemoveBrandAdminError` | "The brand admin cannot be removed from the project." |
| `BudgetExceededError` | "This expense exceeds your remaining budget. You can still add it, but you may want to increase the budget." |

### When to Show Errors

**Show Immediately:**
- Permission errors (403)
- Not found errors (404)
- Validation errors (400)

**Show as Warnings:**
- Budget exceeded (still allow action)
- Duplicate project detection

**Log Silently:**
- Internal server errors (500)
- Network errors (retry automatically)

---

## Authorization & Permissions

### User Roles

| Role | Description |
|------|-------------|
| `BRAND` | Brand account, can create/manage own projects |
| `CREATOR` | Creator account, can view projects |
| `ADMIN` | Platform admin, full access |
| `STAFF` | Staff member, read-only access |

### Endpoint Permissions

| Endpoint | Brand | Creator | Admin | Staff |
|----------|-------|---------|-------|-------|
| `projects.create` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.getById` | ✅ Own | ✅ | ✅ | ✅ |
| `projects.list` | ✅ Own | ✅ | ✅ | ✅ |
| `projects.update` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.delete` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.getMyProjects` | ✅ | ❌ | ✅ | ❌ |
| `projects.getStatistics` | ✅ Own | ❌ | ✅ | ✅ |
| `projects.addTeamMember` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.removeTeamMember` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.updateTeamMemberRole` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.createMilestone` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.updateMilestone` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.deleteMilestone` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.listMilestones` | ✅ Own | ✅ | ✅ | ✅ |
| `projects.addExpense` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.updateExpense` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.deleteExpense` | ✅ Own | ❌ | ✅ | ❌ |
| `projects.getBudgetSummary` | ✅ Own | ❌ | ✅ | ✅ |

### Field-Level Permissions

All fields are readable by authorized users. Field update permissions:

| Field | Brand (Own) | Admin | Notes |
|-------|-------------|-------|-------|
| `name` | ✅ | ✅ | |
| `description` | ✅ | ✅ | |
| `status` | ✅ | ✅ | With validation |
| `budgetCents` | ✅ | ✅ | Admin can override validation |
| `startDate` | ✅ | ✅ | With validation |
| `endDate` | ✅ | ✅ | With validation |
| `objectives` | ✅ | ✅ | |
| `requirements` | ✅ | ✅ | |
| `metadata` | ✅ | ✅ | |
| `projectType` | ✅ | ✅ | |
| `deletedAt` | ❌ | ✅ | Only via delete endpoint |

### Resource Ownership Rules

1. **Brands:**
   - Can only create projects for their own brand
   - Can only view/edit/delete their own projects
   - Cannot access other brands' projects

2. **Creators:**
   - Can view all ACTIVE, IN_PROGRESS, and COMPLETED projects
   - Cannot view DRAFT projects
   - Cannot create or modify projects

3. **Admins:**
   - Full access to all projects
   - Can override validation rules
   - Can modify any project field

4. **Row-Level Security:**
   - Enforced at database query level
   - Cannot be bypassed by API calls
   - Automatic filtering applied to all queries

---

## Rate Limiting & Quotas

### Rate Limits

> **Note:** The Projects module does not currently implement specific rate limiting. However, the system uses Redis caching to optimize performance.

**Recommended Client-Side Rate Limits:**
- **Mutations:** Max 10 per minute per user
- **Queries:** Max 60 per minute per user
- **List operations:** Max 30 per minute per user

### Caching Headers

The system uses Redis caching with the following TTLs:

| Operation | Cache Duration | Cache Key Pattern |
|-----------|---------------|-------------------|
| Project by ID | 5 minutes | `project:{projectId}` |
| Project list | 2 minutes | `projects:list:{brandId}:{filters}` |
| Budget summary | 1 minute | `project:budget:{projectId}` |
| Statistics | 5 minutes | `project:stats:{brandId}` |

**Cache Invalidation:**
- Automatic on mutations (create, update, delete)
- Immediate for affected project
- Cascades to related caches (list, stats)

### Frontend Recommendations

1. **Use React Query:**
   ```typescript
   const { data } = useQuery({
     queryKey: ['projects', projectId],
     queryFn: () => trpc.projects.getById.query({ id: projectId }),
     staleTime: 5 * 60 * 1000, // 5 minutes
     cacheTime: 10 * 60 * 1000, // 10 minutes
   });
   ```

2. **Implement Debouncing:**
   ```typescript
   const debouncedSearch = useMemo(
     () => debounce((value: string) => {
       setSearchTerm(value);
     }, 300),
     []
   );
   ```

3. **Use Optimistic Updates:**
   ```typescript
   const mutation = useMutation({
     mutationFn: trpc.projects.update.mutate,
     onMutate: async (newData) => {
       // Cancel outgoing refetches
       await queryClient.cancelQueries(['projects', projectId]);
       
       // Snapshot previous value
       const previousProject = queryClient.getQueryData(['projects', projectId]);
       
       // Optimistically update
       queryClient.setQueryData(['projects', projectId], newData);
       
       return { previousProject };
     },
     onError: (err, newData, context) => {
       // Rollback on error
       queryClient.setQueryData(['projects', projectId], context.previousProject);
     },
   });
   ```

---

## File Uploads

### Project Attachments

Projects support file attachments stored in the `metadata.attachments` field.

#### Upload Flow

1. **Request Signed Upload URL:**
   ```typescript
   const { signedUrl, key } = await trpc.storage.generateUploadUrl.mutate({
     filename: file.name,
     contentType: file.type,
     folder: 'projects',
   });
   ```

2. **Upload File Directly to R2:**
   ```typescript
   await fetch(signedUrl, {
     method: 'PUT',
     body: file,
     headers: {
       'Content-Type': file.type,
     },
   });
   ```

3. **Update Project Metadata:**
   ```typescript
   await trpc.projects.update.mutate({
     id: projectId,
     metadata: {
       ...existingMetadata,
       attachments: [
         ...existingAttachments,
         {
           key: key,
           url: `https://assets.yesgoddess.agency/${key}`,
           name: file.name,
           size: file.size,
           type: file.type,
         },
       ],
     },
   });
   ```

#### File Restrictions

| Type | Max Size | Allowed Extensions |
|------|----------|-------------------|
| Images | 10 MB | .jpg, .jpeg, .png, .gif, .webp |
| Documents | 25 MB | .pdf, .doc, .docx, .xls, .xlsx |
| Videos | 500 MB | .mp4, .mov, .avi (for brief references only) |

#### Security

- All uploads require authentication
- Signed URLs expire after 15 minutes
- Files are scanned for malware
- Public URLs have CDN caching

---

## Real-time Updates

### Event Tracking

The Projects module emits events for all significant actions:

```typescript
interface ProjectEvent {
  eventType: 'project.created' | 'project.updated' | 'project.status_changed' 
    | 'project.deleted' | 'project.team_member_added' 
    | 'project.milestone_created' | 'project.expense_added';
  actorType: 'brand' | 'creator' | 'admin' | 'system';
  actorId: string | null;
  projectId: string | null;
  brandId: string | null;
  propsJson: Record<string, any> | null;
  createdAt: string;
}
```

### Webhook Integration (Future)

> **Status:** Not yet implemented. Planned for Phase 8.

**Planned webhook events:**
- `project.status.changed` - Project status updated
- `project.budget.exceeded` - Budget threshold crossed
- `project.milestone.completed` - Milestone marked complete
- `project.timeline.approaching` - Project end date approaching

### Polling Recommendations

For real-time updates without webhooks, use polling with exponential backoff:

```typescript
const { data } = useQuery({
  queryKey: ['projects', projectId],
  queryFn: () => trpc.projects.getById.query({ id: projectId }),
  refetchInterval: (data) => {
    // Poll more frequently for active projects
    if (data?.status === 'ACTIVE' || data?.status === 'IN_PROGRESS') {
      return 30000; // 30 seconds
    }
    return 60000; // 1 minute
  },
});
```

### Email Notifications

Users receive email notifications for:
- Project status changes
- Team member added/removed
- Milestone approaching due date
- Budget threshold exceeded (90%, 100%)
- Project end date approaching

**Notification preferences:**
Managed via user settings (separate module).

---

## Pagination & Filtering

### Pagination Format

The Projects API uses **offset-based pagination**:

```typescript
interface PaginationParams {
  page: number;   // 1-indexed
  limit: number;  // Items per page (1-100)
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Available Filters

#### List Projects

```typescript
interface ProjectFilters {
  // Ownership filter
  brandId?: string; // Filter by specific brand
  
  // Status filter
  status?: ProjectStatus; // Single status
  
  // Type filter
  projectType?: ProjectType;
  
  // Search filter (name, description)
  search?: string; // Case-insensitive partial match
  
  // Budget range
  budgetMin?: number; // In cents
  budgetMax?: number; // In cents
  
  // Date range
  startDateFrom?: string; // ISO 8601
  startDateTo?: string;   // ISO 8601
}
```

#### Example: Complex Filter

```typescript
const { data } = await trpc.projects.list.useQuery({
  page: 1,
  limit: 20,
  status: 'ACTIVE',
  projectType: 'CAMPAIGN',
  budgetMin: 100000,  // $1,000+
  budgetMax: 1000000, // $10,000-
  search: 'summer',
  startDateFrom: '2025-06-01T00:00:00Z',
  startDateTo: '2025-08-31T23:59:59Z',
  sortBy: 'budgetCents',
  sortOrder: 'desc',
});
```

### Sorting Options

| Field | Description |
|-------|-------------|
| `createdAt` | Project creation date (default) |
| `updatedAt` | Last modified date |
| `name` | Alphabetical by name |
| `budgetCents` | Budget amount |
| `startDate` | Project start date |

**Sort Order:** `asc` (ascending) or `desc` (descending)

### Performance Tips

1. **Always use pagination:**
   - Never fetch all projects at once
   - Default limit: 20 items
   - Max limit: 100 items

2. **Use specific filters:**
   - Filtered queries are faster
   - Use `brandId` when possible (most efficient)
   - Combine filters to narrow results

3. **Cache list results:**
   - List queries are cached for 2 minutes
   - Use React Query to avoid duplicate requests

4. **Optimize search:**
   - Search is case-insensitive
   - Searches name and description fields
   - Use at least 3 characters for better results

---

## Frontend Implementation Checklist

### Phase 1: Setup & Core CRUD

- [ ] **1.1 Install Dependencies**
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  npm install zod
  npm install date-fns # For date formatting
  ```

- [ ] **1.2 Create tRPC Client**
  ```typescript
  // lib/trpc.ts
  import { createTRPCReact } from '@trpc/react-query';
  import type { AppRouter } from '@yg-backend/types';
  
  export const trpc = createTRPCReact<AppRouter>();
  ```

- [ ] **1.3 Copy Type Definitions**
  - Copy all interfaces from [TypeScript Types](#typescript-type-definitions)
  - Create `types/project.types.ts`
  - Export all types for use across frontend

- [ ] **1.4 Create API Client Layer**
  ```typescript
  // lib/api/projects.ts
  import { trpc } from '@/lib/trpc';
  
  export const projectsApi = {
    create: trpc.projects.create.useMutation,
    getById: trpc.projects.getById.useQuery,
    list: trpc.projects.list.useQuery,
    update: trpc.projects.update.useMutation,
    delete: trpc.projects.delete.useMutation,
    // ... other endpoints
  };
  ```

- [ ] **1.5 Implement Project List View**
  - Display paginated projects
  - Implement filters (status, type, budget, search)
  - Implement sorting
  - Add loading states
  - Handle empty states

- [ ] **1.6 Implement Project Detail View**
  - Display all project fields
  - Show brand information
  - Display computed fields (asset count, license count)
  - Add edit button (if owner)

- [ ] **1.7 Implement Project Create Form**
  - Form with all required fields
  - Client-side validation (Zod)
  - Date picker for start/end dates
  - Budget input with currency formatting
  - Handle success/error states

- [ ] **1.8 Implement Project Edit Form**
  - Pre-populate with existing data
  - Disable fields based on status
  - Validate status transitions
  - Implement optimistic updates

- [ ] **1.9 Implement Project Delete**
  - Confirmation modal
  - Check for active licenses warning
  - Handle success/error states

### Phase 2: Team Management

- [ ] **2.1 Team Members List Component**
  - Display all team members
  - Show roles with badges
  - Display avatars

- [ ] **2.2 Add Team Member Modal**
  - User search/autocomplete
  - Role selection
  - Validation (no duplicates)

- [ ] **2.3 Remove Team Member**
  - Confirmation modal
  - Prevent removing brand admin
  - Update UI optimistically

- [ ] **2.4 Update Member Role**
  - Role dropdown/select
  - Inline editing
  - Validation

### Phase 3: Timeline & Milestones

- [ ] **3.1 Milestones List Component**
  - Display all milestones
  - Group by status
  - Show due dates with visual indicators
  - Mark overdue milestones

- [ ] **3.2 Create Milestone Modal**
  - Form with name, description, due date
  - Validate due date within project range
  - Handle success/error

- [ ] **3.3 Edit Milestone**
  - Inline or modal editing
  - Status dropdown
  - Auto-set completed timestamp

- [ ] **3.4 Delete Milestone**
  - Confirmation modal
  - Update UI optimistically

- [ ] **3.5 Milestone Calendar View** (Optional)
  - Visual timeline
  - Drag-and-drop to reschedule
  - Color-code by status

### Phase 4: Budget Tracking

- [ ] **4.1 Budget Overview Component**
  - Display budget summary
  - Progress bar for utilization
  - Remaining budget display
  - Warning when > 90%

- [ ] **4.2 Expenses List**
  - Display all expenses
  - Group by category
  - Sort by date (newest first)

- [ ] **4.3 Add Expense Modal**
  - Form with all fields
  - Category dropdown/select
  - Amount input with currency
  - Date picker
  - Optional metadata fields

- [ ] **4.4 Edit Expense**
  - Inline or modal editing
  - Recalculate budget summary

- [ ] **4.5 Delete Expense**
  - Confirmation modal
  - Recalculate budget summary

- [ ] **4.6 Budget Chart** (Optional)
  - Pie chart by category
  - Line chart over time
  - Budget vs actual comparison

### Phase 5: Advanced Features

- [ ] **5.1 Project Statistics Dashboard**
  - Display aggregate statistics
  - Charts for status distribution
  - Budget analytics

- [ ] **5.2 Project Status Workflow**
  - Visual status indicator
  - Status change buttons
  - Validate transitions
  - Show required actions

- [ ] **5.3 File Attachments**
  - Implement upload flow
  - Display attachment list
  - Download/preview attachments
  - Delete attachments

- [ ] **5.4 Search & Filters**
  - Global project search
  - Advanced filter panel
  - Save filter presets

- [ ] **5.5 Export Functionality**
  - Export project data to CSV/Excel
  - Export budget summary
  - Export milestone timeline

### Phase 6: UX Enhancements

- [ ] **6.1 Loading States**
  - Skeleton screens
  - Spinners for mutations
  - Progress indicators

- [ ] **6.2 Error Handling**
  - Toast notifications for errors
  - Inline validation errors
  - Retry mechanisms
  - Fallback UI

- [ ] **6.3 Empty States**
  - No projects found
  - No team members
  - No milestones
  - No expenses

- [ ] **6.4 Confirmation Dialogs**
  - Delete confirmations
  - Unsaved changes warnings
  - Destructive action prompts

- [ ] **6.5 Responsive Design**
  - Mobile-optimized layouts
  - Touch-friendly controls
  - Adaptive navigation

- [ ] **6.6 Accessibility**
  - ARIA labels
  - Keyboard navigation
  - Screen reader support
  - Focus management

### Phase 7: Performance Optimization

- [ ] **7.1 Implement React Query**
  - Configure cache times
  - Implement prefetching
  - Optimistic updates

- [ ] **7.2 Code Splitting**
  - Lazy load components
  - Route-based splitting

- [ ] **7.3 Debouncing**
  - Search inputs
  - Filter changes
  - Auto-save

- [ ] **7.4 Virtualization** (if needed)
  - Virtual scrolling for large lists
  - Windowing for tables

### Phase 8: Testing

- [ ] **8.1 Unit Tests**
  - Test utility functions
  - Test form validation
  - Test data transformations

- [ ] **8.2 Component Tests**
  - Test rendering
  - Test user interactions
  - Test error states

- [ ] **8.3 Integration Tests**
  - Test API calls
  - Test mutation flows
  - Test optimistic updates

- [ ] **8.4 E2E Tests**
  - Test complete user flows
  - Test edge cases

---

## Edge Cases to Handle

### 1. Concurrent Edits
- Multiple users editing same project
- Use optimistic locking with `updatedAt` field
- Show conflict resolution UI

### 2. Budget Edge Cases
- Expenses exceeding budget (allow with warning)
- Budget reduced below current expenses (prevent)
- Zero or negative budgets (prevent)

### 3. Date Edge Cases
- Projects without dates (handle nullable dates)
- Date ranges in the past (allow but show warning)
- Milestone due dates outside project range (prevent)

### 4. Status Edge Cases
- Rapid status changes (debounce)
- Invalid transitions (prevent with validation)
- Status change with active licenses (prevent delete)

### 5. Team Management Edge Cases
- Adding user who doesn't exist (validate first)
- Removing brand admin (prevent)
- Removing last team member (prevent)

### 6. Pagination Edge Cases
- Last page with fewer items
- Total items changes during pagination
- Empty result sets

### 7. Search Edge Cases
- Special characters in search
- Empty search results
- Very long search terms

---

## UX Considerations

### 1. Project Creation Flow
- **Step 1:** Basic info (name, type, description)
- **Step 2:** Budget & dates (optional)
- **Step 3:** Requirements (optional)
- **Step 4:** Review & create

### 2. Status Change UX
- Use visual workflow (Kanban-style)
- Show allowed next states only
- Confirm destructive actions (cancel, archive)

### 3. Budget Visualization
- Color-code utilization:
  - Green: < 75%
  - Yellow: 75-90%
  - Orange: 90-100%
  - Red: > 100%

### 4. Milestone Due Dates
- Highlight overdue in red
- Show "due soon" (within 7 days) in yellow
- Gray out completed milestones

### 5. Team Member Roles
- Use consistent badge colors:
  - Brand Admin: Blue
  - Creator: Purple
  - Collaborator: Green
  - Viewer: Gray

### 6. Mobile Considerations
- Swipe actions for list items
- Bottom sheet modals
- Simplified forms
- Touch-friendly buttons (min 44x44px)

### 7. Accessibility
- Clear focus indicators
- High contrast mode support
- Screen reader announcements for state changes
- Keyboard shortcuts for common actions

---

## Example React Implementation

### Project List Component

```typescript
// components/projects/ProjectList.tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ProjectCard } from './ProjectCard';
import { ProjectFilters } from './ProjectFilters';
import type { ProjectSearchFilters, ProjectStatus } from '@/types/project.types';

export function ProjectList() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ProjectSearchFilters>({});
  
  const { data, isLoading, error } = trpc.projects.list.useQuery({
    page,
    limit: 20,
    ...filters,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  
  if (isLoading) return <ProjectListSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!data?.data.length) return <EmptyState />;
  
  return (
    <div className="space-y-6">
      <ProjectFilters filters={filters} onChange={setFilters} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.data.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
      
      <Pagination
        currentPage={page}
        totalPages={data.meta.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

### Create Project Form

```typescript
// components/projects/CreateProjectForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trpc } from '@/lib/trpc';
import { createProjectSchema } from '@/lib/schemas/project.schema';
import { toast } from 'sonner';

export function CreateProjectForm() {
  const utils = trpc.useContext();
  
  const form = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      description: '',
      budgetCents: 0,
      projectType: 'CAMPAIGN' as const,
    },
  });
  
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      toast.success('Project created successfully!');
      utils.projects.list.invalidate();
      // Navigate to project detail
      router.push(`/projects/${data.data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const onSubmit = form.handleSubmit((data) => {
    createMutation.mutate(data);
  });
  
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Input
        label="Project Name"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      
      <Textarea
        label="Description"
        {...form.register('description')}
        error={form.formState.errors.description?.message}
      />
      
      <CurrencyInput
        label="Budget"
        {...form.register('budgetCents', { valueAsNumber: true })}
        error={form.formState.errors.budgetCents?.message}
      />
      
      <Select
        label="Project Type"
        options={[
          { value: 'CAMPAIGN', label: 'Campaign' },
          { value: 'CONTENT', label: 'Content' },
          { value: 'LICENSING', label: 'Licensing' },
        ]}
        {...form.register('projectType')}
      />
      
      <Button
        type="submit"
        loading={createMutation.isLoading}
        disabled={!form.formState.isValid}
      >
        Create Project
      </Button>
    </form>
  );
}
```

### Budget Summary Widget

```typescript
// components/projects/BudgetSummary.tsx
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/utils';

interface BudgetSummaryProps {
  projectId: string;
}

export function BudgetSummary({ projectId }: BudgetSummaryProps) {
  const { data, isLoading } = trpc.projects.getBudgetSummary.useQuery({
    projectId,
  });
  
  if (isLoading) return <Skeleton />;
  if (!data) return null;
  
  const { budgetCents, spentCents, remainingCents, utilizationPercent } = data.data;
  
  const getUtilizationColor = (percent: number) => {
    if (percent < 75) return 'green';
    if (percent < 90) return 'yellow';
    if (percent < 100) return 'orange';
    return 'red';
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Budget Summary</h3>
      
      <div className="space-y-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Budget</span>
          <span className="font-semibold">{formatCurrency(budgetCents)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Spent</span>
          <span className="font-semibold">{formatCurrency(spentCents)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Remaining</span>
          <span className="font-semibold">{formatCurrency(remainingCents)}</span>
        </div>
        
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-600">Utilization</span>
            <span className="text-sm font-medium">{utilizationPercent}%</span>
          </div>
          <ProgressBar
            percent={utilizationPercent}
            color={getUtilizationColor(utilizationPercent)}
          />
        </div>
      </div>
      
      {utilizationPercent > 90 && (
        <Alert variant="warning" className="mt-4">
          Budget utilization is high. Consider increasing the budget.
        </Alert>
      )}
    </div>
  );
}
```

---

## Additional Resources

### Documentation
- [Project Module README](../modules/projects/README.md)
- [Project Validation Guide](../modules/projects/VALIDATION.md)
- [Extended Features Implementation](../modules/projects/EXTENDED_FEATURES_IMPLEMENTATION.md)
- [Quick Reference](../modules/projects/quick-reference.md)

### Related Modules
- **IP Assets Module** - Assets attached to projects
- **Licenses Module** - Licenses created from projects
- **Notifications Module** - Project event notifications
- **Messaging Module** - Project-related discussions

### Support
- **Backend Team:** backend@yesgoddess.agency
- **API Issues:** Open issue in `yg-backend` repository
- **Frontend Integration Help:** Contact frontend team lead

---

**Document Version:** 1.0.0  
**Last Updated:** October 13, 2025  
**Maintained By:** Backend Team  
**Review Status:** ✅ Complete and Ready for Frontend Integration
