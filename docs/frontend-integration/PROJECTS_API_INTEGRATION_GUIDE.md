# Projects API - Frontend Integration Guide

> **Classification:** ⚡ HYBRID  
> **Module:** Projects Management  
> **Target Audience:** Frontend developers building the YesGoddess web client

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
9. [Pagination & Filtering](#pagination--filtering)
10. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Projects module manages organizational containers for creative work within YesGoddess. Projects act as the bridge between **Brands** (who create campaigns) and **IP Assets** (creator content).

### System Position
- **Upstream:** Brands create briefs/campaigns
- **Downstream:** Contains IP Assets, generates Licenses
- **Integration:** Messaging (discussions), Notifications (updates)

### Key Features
- ✅ Full CRUD operations
- ✅ Role-based access control (Brands own their projects, Admins have full access)
- ✅ Status lifecycle management
- ✅ Team collaboration (add/remove members)
- ✅ Budget tracking with expenses
- ✅ Timeline management with milestones
- ✅ Asset association
- ✅ Advanced filtering & search

---

## API Endpoints

All endpoints use **tRPC** and are prefixed with `projects.*`. Base URL: `https://ops.yesgoddess.agency/api/trpc`

### Core Endpoints

| Endpoint | Method | Description | Auth Required | Roles |
|----------|--------|-------------|---------------|-------|
| `projects.create` | Mutation | Create a new project | ✅ | BRAND |
| `projects.getById` | Query | Get project by ID | ✅ | BRAND (own), ADMIN |
| `projects.list` | Query | List projects with filters | ✅ | BRAND (own), ADMIN (all) |
| `projects.getMyProjects` | Query | Get current brand's projects | ✅ | BRAND |
| `projects.update` | Mutation | Update project details | ✅ | BRAND (own), ADMIN |
| `projects.delete` | Mutation | Soft delete project | ✅ | BRAND (own), ADMIN |
| `projects.getTeam` | Query | Get project team members | ✅ | BRAND (own), ADMIN |
| `projects.getAssets` | Query | Get project assets (paginated) | ✅ | BRAND (own), ADMIN |
| `projects.getStatistics` | Query | Get project statistics | ✅ | BRAND (own brand), ADMIN (all) |

### Extended Features

| Endpoint | Method | Description | Auth Required | Roles |
|----------|--------|-------------|---------------|-------|
| `projects.addTeamMember` | Mutation | Add user to project team | ✅ | BRAND (own), ADMIN |
| `projects.removeTeamMember` | Mutation | Remove user from team | ✅ | BRAND (own), ADMIN |
| `projects.updateTeamMemberRole` | Mutation | Update team member role | ✅ | BRAND (own), ADMIN |
| `projects.getEnhancedTeam` | Query | Get team with metadata | ✅ | BRAND (own), ADMIN |
| `projects.createMilestone` | Mutation | Create timeline milestone | ✅ | BRAND (own), ADMIN |
| `projects.updateMilestone` | Mutation | Update milestone | ✅ | BRAND (own), ADMIN |
| `projects.deleteMilestone` | Mutation | Delete milestone | ✅ | BRAND (own), ADMIN |
| `projects.listMilestones` | Query | List project milestones | ✅ | BRAND (own), ADMIN |
| `projects.addExpense` | Mutation | Add expense to budget | ✅ | BRAND (own), ADMIN |
| `projects.updateExpense` | Mutation | Update expense details | ✅ | BRAND (own), ADMIN |
| `projects.deleteExpense` | Mutation | Delete expense | ✅ | BRAND (own), ADMIN |
| `projects.getBudgetSummary` | Query | Get budget utilization | ✅ | BRAND (own), ADMIN |

---

## Request/Response Examples

### 1. Create Project

**Endpoint:** `projects.create`  
**Method:** Mutation

**Request:**
```typescript
const project = await trpc.projects.create.mutate({
  name: "Summer Campaign 2025",
  description: "Looking for vibrant summer content featuring beach aesthetics",
  budgetCents: 500000, // $5,000
  projectType: "CAMPAIGN",
  objectives: [
    "Increase brand awareness",
    "Launch new product line",
    "Generate 1M impressions"
  ],
  requirements: {
    assetTypes: ["image", "video"],
    deliverables: 10,
    exclusivity: true,
    usage: ["social_media", "website", "email"],
    territory: ["United States", "Canada"],
    duration: "6 months"
  },
  startDate: "2025-06-01T00:00:00Z",
  endDate: "2025-08-31T23:59:59Z",
  metadata: {
    tags: ["summer", "beach", "lifestyle"],
    categories: ["fashion", "travel"]
  }
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "id": "clxxx123456789",
    "brandId": "brand_abc123",
    "brandName": "Acme Corp",
    "name": "Summer Campaign 2025",
    "description": "Looking for vibrant summer content featuring beach aesthetics",
    "status": "DRAFT",
    "budgetCents": 500000,
    "startDate": "2025-06-01T00:00:00.000Z",
    "endDate": "2025-08-31T23:59:59.000Z",
    "objectives": [
      "Increase brand awareness",
      "Launch new product line",
      "Generate 1M impressions"
    ],
    "requirements": {
      "assetTypes": ["image", "video"],
      "deliverables": 10,
      "exclusivity": true,
      "usage": ["social_media", "website", "email"],
      "territory": ["United States", "Canada"],
      "duration": "6 months"
    },
    "metadata": {
      "tags": ["summer", "beach", "lifestyle"],
      "categories": ["fashion", "travel"]
    },
    "projectType": "CAMPAIGN",
    "createdBy": "user_xyz789",
    "updatedBy": null,
    "createdAt": "2025-10-13T14:30:00.000Z",
    "updatedAt": "2025-10-13T14:30:00.000Z",
    "deletedAt": null,
    "assetCount": 0,
    "licenseCount": 0
  }
}
```

**cURL Example:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/projects.create' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
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

**Endpoint:** `projects.list`  
**Method:** Query

**Request:**
```typescript
const { data } = await trpc.projects.list.useQuery({
  page: 1,
  limit: 20,
  status: "ACTIVE",
  projectType: "CAMPAIGN",
  search: "summer",
  budgetMin: 100000,  // $1,000
  budgetMax: 1000000, // $10,000
  sortBy: "createdAt",
  sortOrder: "desc"
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "data": [
      {
        "id": "clxxx123456789",
        "brandId": "brand_abc123",
        "brandName": "Acme Corp",
        "name": "Summer Campaign 2025",
        "description": "Looking for vibrant summer content",
        "status": "ACTIVE",
        "budgetCents": 500000,
        "startDate": "2025-06-01T00:00:00.000Z",
        "endDate": "2025-08-31T23:59:59.000Z",
        "objectives": ["Increase brand awareness"],
        "requirements": null,
        "metadata": null,
        "projectType": "CAMPAIGN",
        "createdBy": "user_xyz789",
        "updatedBy": null,
        "createdAt": "2025-10-13T14:30:00.000Z",
        "updatedAt": "2025-10-13T14:30:00.000Z",
        "deletedAt": null,
        "assetCount": 5,
        "licenseCount": 2
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3
    }
  }
}
```

**cURL Example:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/projects.list?page=1&limit=20&status=ACTIVE' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

### 3. Get Project by ID

**Endpoint:** `projects.getById`  
**Method:** Query

**Request:**
```typescript
const { data: project } = await trpc.projects.getById.useQuery({
  id: "clxxx123456789"
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "id": "clxxx123456789",
    "brandId": "brand_abc123",
    "brandName": "Acme Corp",
    "name": "Summer Campaign 2025",
    "description": "Looking for vibrant summer content featuring beach aesthetics",
    "status": "ACTIVE",
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
      "exclusivity": true
    },
    "metadata": {
      "tags": ["summer", "beach"]
    },
    "projectType": "CAMPAIGN",
    "createdBy": "user_xyz789",
    "updatedBy": null,
    "createdAt": "2025-10-13T14:30:00.000Z",
    "updatedAt": "2025-10-13T14:30:00.000Z",
    "deletedAt": null,
    "assetCount": 5,
    "licenseCount": 2
  }
}
```

**Error Response (404 - Not Found):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project clxxx123456789 not found"
  }
}
```

---

### 4. Update Project

**Endpoint:** `projects.update`  
**Method:** Mutation

**Request:**
```typescript
const updated = await trpc.projects.update.mutate({
  id: "clxxx123456789",
  status: "ACTIVE",
  budgetCents: 750000, // Increase budget to $7,500
  description: "Updated project description"
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "id": "clxxx123456789",
    "brandId": "brand_abc123",
    "name": "Summer Campaign 2025",
    "status": "ACTIVE",
    "budgetCents": 750000,
    "description": "Updated project description",
    "updatedAt": "2025-10-13T15:45:00.000Z"
    // ... other fields
  }
}
```

---

### 5. Delete Project

**Endpoint:** `projects.delete`  
**Method:** Mutation

**Request:**
```typescript
await trpc.projects.delete.mutate({ 
  id: "clxxx123456789" 
});
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**Error Response (400 - Has Active Licenses):**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cannot delete project with 3 active license(s)"
  }
}
```

---

### 6. Get Project Team

**Endpoint:** `projects.getTeam`  
**Method:** Query

**Request:**
```typescript
const { data: team } = await trpc.projects.getTeam.useQuery({
  projectId: "clxxx123456789"
});
```

**Response (Success - 200):**
```json
{
  "data": [
    {
      "id": "user_xyz789",
      "name": "Jane Doe",
      "email": "jane@acmecorp.com",
      "role": "brand_admin",
      "avatarUrl": "https://cdn.yesgoddess.agency/avatars/user_xyz789.jpg",
      "addedAt": "2025-10-13T14:30:00.000Z",
      "addedBy": "user_xyz789"
    },
    {
      "id": "user_abc456",
      "name": "John Smith",
      "email": "john@acmecorp.com",
      "role": "collaborator",
      "avatarUrl": null,
      "addedAt": "2025-10-14T09:15:00.000Z",
      "addedBy": "user_xyz789"
    }
  ]
}
```

---

### 7. Get Project Statistics

**Endpoint:** `projects.getStatistics`  
**Method:** Query

**Request:**
```typescript
const { data: stats } = await trpc.projects.getStatistics.useQuery({
  brandId: "brand_abc123" // Optional - omit for all brands (admin only)
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "total": 42,
    "byStatus": {
      "DRAFT": 5,
      "ACTIVE": 10,
      "IN_PROGRESS": 8,
      "COMPLETED": 15,
      "CANCELLED": 2,
      "ARCHIVED": 2
    },
    "byType": {
      "CAMPAIGN": 30,
      "CONTENT": 8,
      "LICENSING": 4
    },
    "totalBudgetCents": 21000000,
    "avgBudgetCents": 500000
  }
}
```

---

### 8. Add Team Member

**Endpoint:** `projects.addTeamMember`  
**Method:** Mutation

**Request:**
```typescript
const member = await trpc.projects.addTeamMember.mutate({
  projectId: "clxxx123456789",
  userId: "user_abc456",
  role: "collaborator" // or "viewer"
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "id": "user_abc456",
    "name": "John Smith",
    "email": "john@acmecorp.com",
    "role": "collaborator",
    "avatarUrl": null,
    "addedAt": "2025-10-14T09:15:00.000Z",
    "addedBy": "user_xyz789"
  }
}
```

**Error Response (400 - Already Exists):**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "User user_abc456 is already a team member"
  }
}
```

---

### 9. Create Milestone

**Endpoint:** `projects.createMilestone`  
**Method:** Mutation

**Request:**
```typescript
const milestone = await trpc.projects.createMilestone.mutate({
  projectId: "clxxx123456789",
  name: "Content Review Phase",
  description: "Review all submitted content and provide feedback",
  dueDate: "2025-07-15T23:59:59Z"
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "id": "mil_123abc",
    "name": "Content Review Phase",
    "description": "Review all submitted content and provide feedback",
    "dueDate": "2025-07-15T23:59:59.000Z",
    "status": "pending",
    "completedAt": null,
    "completedBy": null,
    "createdAt": "2025-10-13T14:30:00.000Z",
    "createdBy": "user_xyz789"
  }
}
```

---

### 10. Add Expense

**Endpoint:** `projects.addExpense`  
**Method:** Mutation

**Request:**
```typescript
const expense = await trpc.projects.addExpense.mutate({
  projectId: "clxxx123456789",
  description: "Stock photography license",
  amountCents: 25000, // $250
  category: "assets",
  date: "2025-10-13T00:00:00Z",
  metadata: {
    vendor: "Shutterstock",
    invoiceNumber: "INV-12345"
  }
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "id": "exp_789xyz",
    "description": "Stock photography license",
    "amountCents": 25000,
    "category": "assets",
    "date": "2025-10-13T00:00:00.000Z",
    "createdBy": "user_xyz789",
    "createdAt": "2025-10-13T14:30:00.000Z",
    "metadata": {
      "vendor": "Shutterstock",
      "invoiceNumber": "INV-12345"
    }
  }
}
```

---

### 11. Get Budget Summary

**Endpoint:** `projects.getBudgetSummary`  
**Method:** Query

**Request:**
```typescript
const { data: budget } = await trpc.projects.getBudgetSummary.useQuery({
  projectId: "clxxx123456789"
});
```

**Response (Success - 200):**
```json
{
  "data": {
    "budgetCents": 500000,
    "spentCents": 125000,
    "remainingCents": 375000,
    "utilizationPercent": 25,
    "expenseCount": 5,
    "expenses": [
      {
        "id": "exp_789xyz",
        "description": "Stock photography license",
        "amountCents": 25000,
        "category": "assets",
        "date": "2025-10-13T00:00:00.000Z",
        "createdBy": "user_xyz789",
        "createdAt": "2025-10-13T14:30:00.000Z",
        "metadata": {
          "vendor": "Shutterstock"
        }
      }
      // ... more expenses
    ]
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
  | 'DRAFT'          // Initial state
  | 'ACTIVE'         // Project is live and accepting submissions
  | 'IN_PROGRESS'    // Work is ongoing
  | 'COMPLETED'      // Project finished successfully
  | 'CANCELLED'      // Project cancelled
  | 'ARCHIVED';      // Project archived (auto or manual)

/**
 * Project Type
 */
export type ProjectType = 
  | 'CAMPAIGN'       // Marketing campaign
  | 'CONTENT'        // Content creation
  | 'LICENSING';     // IP licensing opportunity

/**
 * Team Member Role
 */
export type TeamMemberRole = 
  | 'brand_admin'    // Brand owner (cannot be removed)
  | 'creator'        // Creator contributor
  | 'collaborator'   // Can edit project
  | 'viewer';        // Read-only access

/**
 * Milestone Status
 */
export type MilestoneStatus = 
  | 'pending'        // Not started
  | 'in_progress'    // Work in progress
  | 'completed'      // Finished
  | 'cancelled';     // Cancelled

/**
 * Sort Options
 */
export type ProjectSortBy = 
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'budgetCents'
  | 'startDate';

export type SortOrder = 'asc' | 'desc';
```

### Project Interfaces

```typescript
/**
 * Project Requirements (flexible JSONB)
 */
export interface ProjectRequirements {
  assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
  deliverables?: number;
  exclusivity?: boolean;
  usage?: string[];         // e.g., ["social_media", "website"]
  territory?: string[];     // e.g., ["United States", "Canada"]
  duration?: string;        // e.g., "6 months"
  [key: string]: any;       // Allow custom fields
}

/**
 * Project Metadata (flexible JSONB)
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
  teamMembers?: {          // Internal team tracking
    userId: string;
    role: TeamMemberRole;
    addedAt: string;
    addedBy: string;
  }[];
  milestones?: ProjectMilestone[];
  expenses?: BudgetExpense[];
  [key: string]: any;      // Allow custom fields
}

/**
 * Core Project Interface
 */
export interface Project {
  id: string;
  brandId: string;
  brandName?: string;       // Denormalized for display
  name: string;
  description: string | null;
  status: ProjectStatus;
  budgetCents: number;      // Budget in cents (avoid floating point)
  startDate: string | null; // ISO 8601 string
  endDate: string | null;   // ISO 8601 string
  objectives: string[] | null;
  requirements: ProjectRequirements | null;
  metadata: ProjectMetadata | null;
  projectType: ProjectType;
  createdBy: string;        // User ID
  updatedBy: string | null; // User ID
  createdAt: string;        // ISO 8601 string
  updatedAt: string;        // ISO 8601 string
  deletedAt?: string | null;// ISO 8601 string (soft delete)
  
  // Computed fields (optional)
  assetCount?: number;
  licenseCount?: number;
}

/**
 * Project with Relations (expanded response)
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

### Request/Response Types

```typescript
/**
 * List Projects Filters
 */
export interface ProjectSearchFilters {
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;           // Full-text search on name/description
  budgetMin?: number;        // Cents
  budgetMax?: number;        // Cents
  startDateFrom?: string;    // ISO 8601
  startDateTo?: string;      // ISO 8601
}

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

/**
 * Team Member
 */
export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: TeamMemberRole;
  avatarUrl: string | null;
  addedAt?: string;         // ISO 8601
  addedBy?: string;         // User ID
}

/**
 * Milestone
 */
export interface ProjectMilestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;          // ISO 8601
  status: MilestoneStatus;
  completedAt?: string;     // ISO 8601
  completedBy?: string;     // User ID
  createdAt: string;        // ISO 8601
  createdBy: string;        // User ID
}

/**
 * Budget Expense
 */
export interface BudgetExpense {
  id: string;
  description: string;
  amountCents: number;
  category: string;
  date: string;             // ISO 8601
  createdBy: string;        // User ID
  createdAt: string;        // ISO 8601
  metadata?: Record<string, any>;
}

/**
 * Budget Summary
 */
export interface BudgetSummary {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  utilizationPercent: number;
  expenseCount: number;
  expenses: BudgetExpense[];
}
```

### Zod Validation Schemas

Copy these schemas to your frontend for client-side validation:

```typescript
import { z } from 'zod';

/**
 * Project Requirements Schema
 */
export const projectRequirementsSchema = z.object({
  assetTypes: z.array(z.enum(['image', 'video', 'audio', 'document'])).optional(),
  deliverables: z.number().int().min(1).max(100).optional(),
  exclusivity: z.boolean().optional(),
  usage: z.array(z.string()).optional(),
  territory: z.array(z.string()).optional(),
  duration: z.string().optional(),
}).passthrough();

/**
 * Project Metadata Schema
 */
export const projectMetadataSchema = z.object({
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string().url(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
}).passthrough();

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
  requirements: projectRequirementsSchema.optional(),
  metadata: projectMetadataSchema.optional(),
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

/**
 * Update Project Schema
 */
export const updateProjectSchema = z.object({
  id: z.string().cuid('Invalid project ID'),
  name: z.string()
    .min(3).max(200).optional(),
  description: z.string()
    .max(5000).optional().nullable(),
  budgetCents: z.number()
    .int().min(0).max(100000000).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  objectives: z.array(z.string())
    .max(10).optional().nullable(),
  requirements: projectRequirementsSchema.optional().nullable(),
  metadata: projectMetadataSchema.optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).optional(),
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

/**
 * List Projects Schema
 */
export const listProjectsSchema = z.object({
  brandId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).optional(),
  search: z.string().optional(),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  startDateFrom: z.string().datetime().optional(),
  startDateTo: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'budgetCents', 'startDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine(
  (data) => {
    if (data.budgetMin !== undefined && data.budgetMax !== undefined) {
      return data.budgetMax >= data.budgetMin;
    }
    return true;
  },
  {
    message: 'Maximum budget must be greater than or equal to minimum budget',
    path: ['budgetMax'],
  }
);
```

---

## Business Logic & Validation Rules

### Field Validation

| Field | Required | Min | Max | Notes |
|-------|----------|-----|-----|-------|
| `name` | ✅ Yes | 3 chars | 200 chars | Unique per brand recommended |
| `description` | ❌ No | - | 5000 chars | Supports markdown |
| `budgetCents` | ✅ Yes | 0 | 100,000,000 | Max $1M per project |
| `startDate` | ❌ No | - | - | ISO 8601 format |
| `endDate` | ❌ No | - | - | Must be after startDate |
| `objectives` | ❌ No | - | 10 items | Array of strings |
| `projectType` | ✅ Yes | - | - | Enum: CAMPAIGN, CONTENT, LICENSING |

### Business Rules

#### 1. Project Creation
- ✅ **Only BRAND users can create projects**
- ✅ Budget validation: must be between $0 and $1M
- ✅ If dates provided, `endDate` must be after `startDate`
- ✅ Project starts in `DRAFT` status
- ⚠️ **Warning:** Duplicate project names are allowed but will trigger a warning
- ⚠️ **Warning:** Projects longer than 365 days will trigger a warning

#### 2. Status Transitions

**Valid Transitions:**
```
DRAFT → ACTIVE → IN_PROGRESS → COMPLETED
DRAFT → CANCELLED
ACTIVE → CANCELLED
IN_PROGRESS → CANCELLED
IN_PROGRESS → COMPLETED
Any Status → ARCHIVED
```

**Invalid Transitions:**
- ❌ COMPLETED → ACTIVE (can't reopen)
- ❌ CANCELLED → ACTIVE (can't reactivate)
- ❌ ARCHIVED → Any status (archived is final)

#### 3. Budget Management
- ✅ Budget can be increased at any time
- ⚠️ Budget can be decreased if not below committed amount (active licenses + expenses)
- ✅ Expenses tracked in cents (no floating point issues)
- ⚠️ Warning shown when budget utilization > 100%

#### 4. Project Deletion
- ❌ **Cannot delete if active licenses exist**
- ✅ Soft delete (sets `deletedAt` timestamp)
- ✅ Only brand owner or admin can delete
- ✅ Check `licenseCount` before attempting deletion

#### 5. Team Management
- ✅ Brand admin (project creator) is automatically on team
- ❌ Brand admin cannot be removed from team
- ✅ Maximum team size: unlimited
- ✅ Roles: `collaborator` (edit), `viewer` (read-only)

#### 6. Milestones
- ✅ Milestones optional (not required)
- ✅ Due date must be within project date range (if set)
- ✅ Status transitions: `pending` → `in_progress` → `completed` / `cancelled`

#### 7. Row-Level Security (RLS)
- ✅ Brands can only see/edit their own projects
- ✅ Admins have full access to all projects
- ✅ Creators cannot create projects
- ❌ Returns 404 (not 403) to prevent information disclosure

---

## Error Handling

### HTTP Status Codes

| Status | When Used |
|--------|-----------|
| 200 | Success |
| 400 | Bad Request (validation error, invalid transition) |
| 403 | Forbidden (not authorized) |
| 404 | Not Found (project doesn't exist or no access) |
| 500 | Internal Server Error |

### Error Code Reference

| Error Code | HTTP Status | Message | When It Occurs |
|------------|-------------|---------|----------------|
| `NOT_FOUND` | 404 | "Project {id} not found" | Project doesn't exist or user has no access |
| `FORBIDDEN` | 403 | "Unauthorized to access this project" | User doesn't own project (brands) |
| `FORBIDDEN` | 403 | "Only brand accounts can create projects" | Creator/admin tries to create project |
| `BAD_REQUEST` | 400 | "Invalid status transition from {from} to {to}" | Invalid status change |
| `BAD_REQUEST` | 400 | "Cannot delete project with {n} active license(s)" | Delete attempt with active licenses |
| `BAD_REQUEST` | 400 | "End date must be after start date" | Invalid date range |
| `BAD_REQUEST` | 400 | "Budget cannot exceed $1,000,000" | Budget too high |
| `BAD_REQUEST` | 400 | "User {id} is already a team member" | Duplicate team member |
| `BAD_REQUEST` | 400 | "Cannot remove brand admin from project team" | Attempt to remove owner |
| `NOT_FOUND` | 404 | "Team member {id} not found" | Team member doesn't exist |
| `NOT_FOUND` | 404 | "Milestone {id} not found" | Milestone doesn't exist |
| `NOT_FOUND` | 404 | "Expense {id} not found" | Expense doesn't exist |

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  }
}
```

### Error Handling Example

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const project = await trpc.projects.create.mutate({
    name: "My Campaign",
    budgetCents: 150000000, // Too high!
    projectType: "CAMPAIGN"
  });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'FORBIDDEN':
        // User not authorized (not a brand account)
        toast.error("You must be a brand to create projects");
        break;
      case 'BAD_REQUEST':
        // Validation error
        toast.error(error.message);
        break;
      case 'NOT_FOUND':
        // Project not found
        toast.error("Project not found");
        break;
      default:
        toast.error("An error occurred. Please try again.");
    }
  }
}
```

### User-Friendly Error Messages

Map backend errors to user-friendly messages:

```typescript
const errorMessages: Record<string, string> = {
  "Only brand accounts can create projects": 
    "Only brands can create projects. Switch to a brand account to continue.",
  
  "Cannot delete project with X active license(s)": 
    "This project has active licenses. Please terminate all licenses before deleting.",
  
  "Invalid status transition from X to Y": 
    "You cannot change the project to this status. Please check the project lifecycle.",
  
  "End date must be after start date": 
    "The end date must be later than the start date.",
  
  "Budget cannot exceed $1,000,000": 
    "Project budget cannot exceed $1,000,000. Please reduce the budget or split into multiple projects.",
  
  "User X is already a team member": 
    "This user is already on the project team.",
  
  "Cannot remove brand admin from project team": 
    "The project owner cannot be removed from the team."
};
```

---

## Authorization & Permissions

### Role-Based Access Control

| Action | BRAND (Owner) | BRAND (Non-Owner) | ADMIN | CREATOR |
|--------|---------------|-------------------|-------|---------|
| Create Project | ✅ | ❌ | ❌ | ❌ |
| View Own Projects | ✅ | ❌ | ✅ (all) | ❌ |
| View Other Projects | ❌ | ❌ | ✅ | ❌ |
| Update Own Project | ✅ | ❌ | ✅ | ❌ |
| Delete Own Project | ✅ | ❌ | ✅ | ❌ |
| Add Team Member | ✅ | ❌ | ✅ | ❌ |
| View Statistics (Own) | ✅ | ❌ | ✅ | ❌ |
| View Statistics (All) | ❌ | ❌ | ✅ | ❌ |

### Security Implementation

```typescript
// Example: Check user role before showing "Create Project" button
const { session } = useSession();

if (session?.user?.role === 'BRAND') {
  return <CreateProjectButton />;
}

// Example: Filter projects by ownership
const { data: projects } = trpc.projects.getMyProjects.useQuery({
  page: 1,
  limit: 20
});

// Example: Admin-only statistics
if (session?.user?.role === 'ADMIN') {
  const { data: stats } = trpc.projects.getStatistics.useQuery({
    // No brandId = all brands
  });
}
```

### Field-Level Permissions

All fields are readable by project owners and admins. No field-level restrictions.

### Resource Ownership Rules

- ✅ Projects are owned by the brand (via `brandId`)
- ✅ `createdBy` tracks the user who created the project
- ✅ Brand admin has implicit access to all their brand's projects
- ✅ Team members inherit read/write access based on role

---

## Rate Limiting & Quotas

### Rate Limits

| Endpoint | Limit | Window | Headers |
|----------|-------|--------|---------|
| `projects.create` | 10 requests | 1 minute | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| `projects.list` | 60 requests | 1 minute | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| `projects.update` | 30 requests | 1 minute | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| Other endpoints | 60 requests | 1 minute | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |

### Quota Limits

- **Maximum projects per brand:** Unlimited
- **Maximum team members per project:** Unlimited
- **Maximum milestones per project:** Unlimited
- **Maximum expenses per project:** Unlimited
- **Maximum budget per project:** $1,000,000 (100,000,000 cents)

### Handling Rate Limits

```typescript
// Check rate limit headers in response
const response = await fetch('/api/trpc/projects.create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(data)
});

const remaining = response.headers.get('X-RateLimit-Remaining');
const limit = response.headers.get('X-RateLimit-Limit');

if (remaining && parseInt(remaining) < 5) {
  console.warn(`Approaching rate limit: ${remaining}/${limit} remaining`);
}

// Handle 429 Too Many Requests
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  toast.error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
}
```

---

## Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination**:

```typescript
interface PaginationParams {
  page: number;    // 1-indexed (starts at 1)
  limit: number;   // Items per page (max 100)
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;      // Total items
  totalPages: number; // Total pages
}
```

### Filter Parameters

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `brandId` | string | Filter by brand | `"brand_abc123"` |
| `status` | ProjectStatus | Filter by status | `"ACTIVE"` |
| `projectType` | ProjectType | Filter by type | `"CAMPAIGN"` |
| `search` | string | Full-text search | `"summer"` |
| `budgetMin` | number | Minimum budget (cents) | `100000` ($1,000) |
| `budgetMax` | number | Maximum budget (cents) | `1000000` ($10,000) |
| `startDateFrom` | string (ISO 8601) | Projects starting after | `"2025-06-01T00:00:00Z"` |
| `startDateTo` | string (ISO 8601) | Projects starting before | `"2025-08-31T23:59:59Z"` |

### Sorting Options

| Sort By | Description |
|---------|-------------|
| `createdAt` | Creation date (default) |
| `updatedAt` | Last update date |
| `name` | Project name (alphabetical) |
| `budgetCents` | Budget amount |
| `startDate` | Project start date |

**Sort Order:** `asc` (ascending) or `desc` (descending, default)

### Filtering Examples

```typescript
// Example 1: Active campaigns only
const { data } = await trpc.projects.list.useQuery({
  status: "ACTIVE",
  projectType: "CAMPAIGN",
  page: 1,
  limit: 20
});

// Example 2: Budget range filter
const { data } = await trpc.projects.list.useQuery({
  budgetMin: 100000,  // $1,000
  budgetMax: 500000,  // $5,000
  sortBy: "budgetCents",
  sortOrder: "desc"
});

// Example 3: Date range filter
const { data } = await trpc.projects.list.useQuery({
  startDateFrom: "2025-06-01T00:00:00Z",
  startDateTo: "2025-08-31T23:59:59Z",
  sortBy: "startDate",
  sortOrder: "asc"
});

// Example 4: Full-text search
const { data } = await trpc.projects.list.useQuery({
  search: "summer beach campaign",
  page: 1,
  limit: 20
});

// Example 5: Combine multiple filters
const { data } = await trpc.projects.list.useQuery({
  status: "ACTIVE",
  projectType: "CAMPAIGN",
  budgetMin: 100000,
  search: "summer",
  sortBy: "createdAt",
  sortOrder: "desc",
  page: 1,
  limit: 20
});
```

### Pagination UI Example

```typescript
import { useState } from 'react';

function ProjectList() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = trpc.projects.list.useQuery({
    page,
    limit,
    status: "ACTIVE"
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {/* Project cards */}
      {data?.data.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}

      {/* Pagination controls */}
      <div className="pagination">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </button>

        <span>
          Page {data?.meta.page} of {data?.meta.totalPages}
        </span>

        <button 
          onClick={() => setPage(p => p + 1)}
          disabled={page === data?.meta.totalPages}
        >
          Next
        </button>

        <span className="text-sm text-gray-500">
          {data?.meta.total} total projects
        </span>
      </div>
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic CRUD

- [ ] **API Client Setup**
  - [ ] Install tRPC client
  - [ ] Configure API base URL
  - [ ] Set up authentication headers
  - [ ] Create typed client hooks

- [ ] **Create Project Flow**
  - [ ] Build project creation form
  - [ ] Implement client-side validation (Zod)
  - [ ] Handle budget input (convert dollars to cents)
  - [ ] Add date pickers (ISO 8601 format)
  - [ ] Show validation errors inline
  - [ ] Handle success/error states
  - [ ] Redirect to project detail page

- [ ] **Project List View**
  - [ ] Fetch and display projects
  - [ ] Implement pagination controls
  - [ ] Add status badges (color-coded)
  - [ ] Show budget (formatted as currency)
  - [ ] Display asset/license counts
  - [ ] Add loading skeletons
  - [ ] Handle empty state

- [ ] **Project Detail View**
  - [ ] Fetch single project
  - [ ] Display all project fields
  - [ ] Show team members
  - [ ] Display statistics
  - [ ] Add edit/delete buttons (conditional)

- [ ] **Update Project**
  - [ ] Build edit form (pre-filled)
  - [ ] Support partial updates
  - [ ] Validate status transitions
  - [ ] Show confirmation modal for status changes
  - [ ] Optimistic UI updates

- [ ] **Delete Project**
  - [ ] Show confirmation modal
  - [ ] Check for active licenses
  - [ ] Display warning if licenses exist
  - [ ] Handle success/error states
  - [ ] Redirect after deletion

### Phase 2: Filtering & Search

- [ ] **Filter UI**
  - [ ] Status dropdown
  - [ ] Project type dropdown
  - [ ] Budget range sliders
  - [ ] Date range pickers
  - [ ] Search input (debounced)
  - [ ] Clear filters button

- [ ] **Sorting**
  - [ ] Sort dropdown
  - [ ] Sort order toggle (asc/desc)
  - [ ] Update URL params (shareable links)

- [ ] **Pagination**
  - [ ] Previous/Next buttons
  - [ ] Page number display
  - [ ] Jump to page input
  - [ ] Items per page dropdown

### Phase 3: Team Management

- [ ] **Team Members View**
  - [ ] Display team list
  - [ ] Show member roles
  - [ ] Display avatars
  - [ ] Highlight brand admin

- [ ] **Add Team Member**
  - [ ] User search/autocomplete
  - [ ] Role selection
  - [ ] Validation (no duplicates)
  - [ ] Success notification

- [ ] **Remove Team Member**
  - [ ] Confirmation modal
  - [ ] Prevent removing brand admin
  - [ ] Update UI optimistically

- [ ] **Update Member Role**
  - [ ] Inline role dropdown
  - [ ] Validation
  - [ ] Success notification

### Phase 4: Budget & Expenses

- [ ] **Budget Display**
  - [ ] Show total budget (formatted)
  - [ ] Display spent amount
  - [ ] Show remaining budget
  - [ ] Utilization progress bar
  - [ ] Color-coded warnings (>100%)

- [ ] **Add Expense**
  - [ ] Expense form modal
  - [ ] Category dropdown
  - [ ] Amount input (convert to cents)
  - [ ] Date picker
  - [ ] Metadata fields (optional)

- [ ] **Expense List**
  - [ ] Display all expenses
  - [ ] Show by category
  - [ ] Sort by date/amount
  - [ ] Edit/delete actions

### Phase 5: Milestones

- [ ] **Milestone Timeline View**
  - [ ] Display milestones chronologically
  - [ ] Status indicators
  - [ ] Due date countdown
  - [ ] Overdue warnings

- [ ] **Create Milestone**
  - [ ] Milestone form
  - [ ] Validation (due date in range)
  - [ ] Success notification

- [ ] **Update Milestone**
  - [ ] Edit modal
  - [ ] Status dropdown
  - [ ] Mark as completed

- [ ] **Delete Milestone**
  - [ ] Confirmation modal
  - [ ] Update UI

### Phase 6: Edge Cases

- [ ] **Error Handling**
  - [ ] Network errors (retry logic)
  - [ ] Validation errors (inline display)
  - [ ] Permission errors (redirect to login)
  - [ ] Not found errors (404 page)
  - [ ] Rate limit errors (retry after)

- [ ] **Loading States**
  - [ ] Skeleton loaders
  - [ ] Spinner for mutations
  - [ ] Disable buttons during loading
  - [ ] Optimistic updates

- [ ] **Empty States**
  - [ ] No projects created
  - [ ] No search results
  - [ ] No team members
  - [ ] No milestones/expenses

- [ ] **Permission Checks**
  - [ ] Hide create button for non-brands
  - [ ] Hide edit button for non-owners
  - [ ] Hide admin features for brands
  - [ ] Show read-only view for viewers

### Phase 7: UX Enhancements

- [ ] **Form Validation**
  - [ ] Real-time validation
  - [ ] Error messages below fields
  - [ ] Success indicators
  - [ ] Character counters

- [ ] **Notifications**
  - [ ] Success toasts
  - [ ] Error toasts
  - [ ] Warning toasts (budget exceeded)
  - [ ] Auto-dismiss

- [ ] **Keyboard Shortcuts**
  - [ ] Cmd+K for search
  - [ ] Esc to close modals
  - [ ] Enter to submit forms

- [ ] **Responsive Design**
  - [ ] Mobile-friendly forms
  - [ ] Tablet layout
  - [ ] Desktop optimization

---

## Quick Reference

### Budget Conversion

```typescript
// Dollars to cents
const budgetCents = dollarAmount * 100;

// Cents to dollars (display)
const dollarAmount = budgetCents / 100;

// Format as currency
const formatted = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(dollarAmount);
```

### Date Handling

```typescript
// Convert Date to ISO 8601 string
const isoString = new Date().toISOString();

// Parse ISO string to Date
const date = new Date('2025-06-01T00:00:00Z');

// Format for display
const formatted = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(date);
```

### Status Badge Colors

```typescript
const statusColors: Record<ProjectStatus, string> = {
  DRAFT: 'gray',
  ACTIVE: 'green',
  IN_PROGRESS: 'blue',
  COMPLETED: 'purple',
  CANCELLED: 'red',
  ARCHIVED: 'gray',
};
```

---

## Related Documentation

- [Authentication Integration Guide](./FRONTEND_INTEGRATION_AUTHENTICATION.md)
- [Access Control Guide](./ACCESS_CONTROL_INTEGRATION_GUIDE.md)
- [IP Assets Integration Guide](./FILE_MANAGEMENT_INTEGRATION_GUIDE.md)
- [Licensing Integration Guide](./LICENSING_INTEGRATION_GUIDE.md)

---

## Support

**Questions?** Contact the backend team:
- Slack: #yesgoddess-backend
- Email: backend@yesgoddess.agency
- GitHub Issues: [yg-backend/issues](https://github.com/machinesoul11/yg-backend/issues)

**Last Updated:** October 13, 2025  
**API Version:** 1.0  
**Module Version:** Projects v1.0 (Extended Features Included)
