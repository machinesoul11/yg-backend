# Project Validation - Frontend Integration Guide (Part 1: API Reference)

**Module:** Project Validation  
**Classification:** ⚡ HYBRID (Brands create projects, Admins manage/moderate)  
**Backend Deployment:** https://ops.yesgoddess.agency  
**Last Updated:** October 13, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Schemas](#requestresponse-schemas)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)

---

## Overview

The Project Validation module provides comprehensive validation for project creation, updates, and state transitions. It enforces business rules around budgets, dates, permissions, status transitions, and duplicate detection.

### Key Features

- **Budget Validation**: Range checks, type-based minimums, committed budget tracking
- **Date Validation**: Range validation, overlap detection, license conflict checking
- **Status Transitions**: State machine enforcement with precondition checks
- **Permission Checks**: Role-based access control with ownership validation
- **Duplicate Detection**: Exact and fuzzy matching to prevent duplicate projects

### Architecture

- **API Type**: tRPC (Type-safe RPC)
- **Authentication**: NextAuth.js with JWT sessions
- **Base URL**: `https://ops.yesgoddess.agency/api/trpc`

---

## API Endpoints

All endpoints are accessed via tRPC. The base pattern is:

```
POST /api/trpc/{procedure}
```

### Project CRUD Operations

| Endpoint | Type | Description | Auth Required |
|----------|------|-------------|---------------|
| `projects.create` | mutation | Create new project with validation | ✅ BRAND, ADMIN |
| `projects.getById` | query | Get project by ID | ✅ BRAND (own), ADMIN |
| `projects.list` | query | List projects with filters | ✅ BRAND (own), ADMIN (all) |
| `projects.update` | mutation | Update project with validation | ✅ BRAND (own), ADMIN |
| `projects.delete` | mutation | Soft delete project | ✅ BRAND (own), ADMIN |
| `projects.getMyProjects` | query | Get current user's brand projects | ✅ BRAND |
| `projects.getStatistics` | query | Get project statistics | ✅ BRAND, ADMIN |
| `projects.getTeam` | query | Get project team members | ✅ BRAND (own), ADMIN |
| `projects.getAssets` | query | Get project assets | ✅ BRAND (own), ADMIN |

### Validation Operations

Validation happens automatically within the CRUD operations. The validation service checks:

1. **On Create**: Permission → Budget → Dates → Duplicates
2. **On Update**: Permission → Budget adjustment → Date changes → Status transitions
3. **On Delete**: Permission → License check

---

## Request/Response Schemas

### Create Project

**Input Schema:**

```typescript
{
  name: string;                    // 3-200 chars, required
  description?: string;            // Max 5000 chars, optional
  budgetCents: number;            // 0 - 100,000,000 ($1M max), required
  startDate?: string;             // ISO 8601 datetime, optional
  endDate?: string;               // ISO 8601 datetime, optional (must be > startDate)
  objectives?: string[];          // Max 10 items, optional
  requirements?: {                // Optional JSONB
    assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
    deliverables?: number;        // 1-100
    exclusivity?: boolean;
    usage?: string[];
    territory?: string[];
    duration?: string;
    [key: string]: any;           // Flexible requirements
  };
  metadata?: {                    // Optional JSONB
    attachments?: Array<{
      key: string;
      url: string;
      name: string;
      size: number;
      type: string;
    }>;
    tags?: string[];
    categories?: string[];
    [key: string]: any;           // Flexible metadata
  };
  projectType: 'CAMPAIGN' | 'CONTENT' | 'LICENSING';  // Default: 'CAMPAIGN'
}
```

**Response Schema:**

```typescript
{
  data: {
    id: string;                   // CUID
    brandId: string;
    brandName?: string;
    name: string;
    description: string | null;
    status: ProjectStatus;        // 'DRAFT' by default
    budgetCents: number;
    startDate: string | null;     // ISO 8601
    endDate: string | null;       // ISO 8601
    objectives: string[] | null;
    requirements: ProjectRequirements | null;
    metadata: ProjectMetadata | null;
    projectType: ProjectType;
    createdBy: string;
    updatedBy: string | null;
    createdAt: string;            // ISO 8601
    updatedAt: string;            // ISO 8601
    deletedAt?: string | null;
  }
}
```

### Update Project

**Input Schema:**

```typescript
{
  id: string;                     // CUID, required
  name?: string;                  // 3-200 chars
  description?: string | null;    // Max 5000 chars
  budgetCents?: number;          // 0 - 100,000,000
  startDate?: string | null;     // ISO 8601
  endDate?: string | null;       // ISO 8601 (must be > startDate)
  objectives?: string[] | null;  // Max 10 items
  requirements?: ProjectRequirements | null;
  metadata?: ProjectMetadata | null;
  status?: 'DRAFT' | 'ACTIVE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
  projectType?: 'CAMPAIGN' | 'CONTENT' | 'LICENSING';
}
```

**Response Schema:** Same as Create Project response

### List Projects

**Input Schema:**

```typescript
{
  // Filters
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;                // Searches name and description
  budgetMin?: number;            // In cents
  budgetMax?: number;            // In cents (must be >= budgetMin)
  startDateFrom?: string;        // ISO 8601
  startDateTo?: string;          // ISO 8601
  
  // Pagination
  page?: number;                 // Default: 1, min: 1
  limit?: number;                // Default: 20, min: 1, max: 100
  
  // Sorting
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'budgetCents' | 'startDate';  // Default: 'createdAt'
  sortOrder?: 'asc' | 'desc';    // Default: 'desc'
}
```

**Response Schema:**

```typescript
{
  data: {
    projects: Project[];          // Array of projects
    pagination: {
      total: number;              // Total count
      page: number;               // Current page
      limit: number;              // Items per page
      pages: number;              // Total pages
    };
  }
}
```

### Get Project By ID

**Input Schema:**

```typescript
{
  id: string;  // CUID, required
}
```

**Response Schema:**

```typescript
{
  data: {
    // Same as Project interface plus:
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
}
```

### Delete Project

**Input Schema:**

```typescript
{
  id: string;  // CUID, required
}
```

**Response Schema:**

```typescript
{
  success: boolean;
  message: string;  // "Project deleted successfully"
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// Copy these types to your frontend codebase

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

export interface ProjectRequirements {
  assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
  deliverables?: number;
  exclusivity?: boolean;
  usage?: string[];
  territory?: string[];
  duration?: string;
  [key: string]: any;
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
  [key: string]: any;
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
```

### Input Types

```typescript
export interface CreateProjectInput {
  name: string;
  description?: string;
  budgetCents: number;
  startDate?: string;
  endDate?: string;
  objectives?: string[];
  requirements?: ProjectRequirements;
  metadata?: ProjectMetadata;
  projectType: ProjectType;
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
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDateFrom?: string;
  startDateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'budgetCents' | 'startDate';
  sortOrder?: 'asc' | 'desc';
}
```

### Validation Result Types

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface StatusTransitionResult {
  valid: boolean;
  errors: string[];
  requiredActions: string[];
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}
```

---

## Request/Response Examples

### Create Project - Happy Path

**cURL Example:**

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/projects.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Summer Campaign 2025",
    "description": "Social media campaign for summer product launch",
    "budgetCents": 5000000,
    "startDate": "2025-06-01T00:00:00Z",
    "endDate": "2025-08-31T23:59:59Z",
    "projectType": "CAMPAIGN",
    "objectives": [
      "Increase brand awareness by 30%",
      "Generate 10,000 new leads"
    ],
    "requirements": {
      "assetTypes": ["image", "video"],
      "deliverables": 20,
      "exclusivity": false,
      "usage": ["social_media", "website"],
      "territory": ["US", "CA"]
    }
  }'
```

**Response (200 OK):**

```json
{
  "result": {
    "data": {
      "data": {
        "id": "clx1a2b3c4d5e6f7g8h9i0j1",
        "brandId": "clw9z8y7x6w5v4u3t2s1r0q9",
        "name": "Summer Campaign 2025",
        "description": "Social media campaign for summer product launch",
        "status": "DRAFT",
        "budgetCents": 5000000,
        "startDate": "2025-06-01T00:00:00.000Z",
        "endDate": "2025-08-31T23:59:59.000Z",
        "objectives": [
          "Increase brand awareness by 30%",
          "Generate 10,000 new leads"
        ],
        "requirements": {
          "assetTypes": ["image", "video"],
          "deliverables": 20,
          "exclusivity": false,
          "usage": ["social_media", "website"],
          "territory": ["US", "CA"]
        },
        "metadata": null,
        "projectType": "CAMPAIGN",
        "createdBy": "user_123abc",
        "updatedBy": null,
        "createdAt": "2025-10-13T10:30:00.000Z",
        "updatedAt": "2025-10-13T10:30:00.000Z",
        "deletedAt": null
      }
    }
  }
}
```

### Create Project - Budget Too Low

**Request:**

```json
{
  "name": "Small Test Campaign",
  "budgetCents": 50000,
  "projectType": "CAMPAIGN"
}
```

**Response (400 BAD_REQUEST):**

```json
{
  "error": {
    "message": "Budget validation failed: Budget is below recommended minimum of $1,000 for CAMPAIGN projects",
    "code": "BAD_REQUEST",
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "projects.create"
    }
  }
}
```

### Update Project - Change Status

**Request:**

```json
{
  "id": "clx1a2b3c4d5e6f7g8h9i0j1",
  "status": "ACTIVE"
}
```

**Response (200 OK if preconditions met):**

```json
{
  "result": {
    "data": {
      "data": {
        "id": "clx1a2b3c4d5e6f7g8h9i0j1",
        "status": "ACTIVE",
        // ... other fields
      }
    }
  }
}
```

**Response (400 BAD_REQUEST if preconditions not met):**

```json
{
  "error": {
    "message": "Status validation failed: Project must have a budget before activation, Set project start and end dates",
    "code": "BAD_REQUEST"
  }
}
```

### List Projects with Filters

**Request:**

```json
{
  "status": "ACTIVE",
  "projectType": "CAMPAIGN",
  "budgetMin": 100000,
  "page": 1,
  "limit": 20,
  "sortBy": "createdAt",
  "sortOrder": "desc"
}
```

**Response:**

```json
{
  "result": {
    "data": {
      "data": {
        "projects": [
          {
            "id": "clx1...",
            "name": "Summer Campaign 2025",
            "status": "ACTIVE",
            // ... other fields
          }
        ],
        "pagination": {
          "total": 15,
          "page": 1,
          "limit": 20,
          "pages": 1
        }
      }
    }
  }
}
```

### Update Project - Reduce Budget Below Committed

**Request:**

```json
{
  "id": "clx1a2b3c4d5e6f7g8h9i0j1",
  "budgetCents": 200000
}
```

**Response (400 BAD_REQUEST):**

```json
{
  "error": {
    "message": "Budget adjustment validation failed: Cannot reduce budget below committed amount of $5,000.00. Current commitments: $5,000.00 in active licenses",
    "code": "BAD_REQUEST"
  }
}
```

### Delete Project with Active Licenses

**Request:**

```json
{
  "id": "clx1a2b3c4d5e6f7g8h9i0j1"
}
```

**Response (400 BAD_REQUEST):**

```json
{
  "error": {
    "message": "Cannot delete project with 3 active license(s)",
    "code": "BAD_REQUEST"
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Status Code | tRPC Code | Description |
|-------------|-----------|-------------|
| 200 | OK | Successful operation |
| 400 | BAD_REQUEST | Validation error, invalid input, business rule violation |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | User lacks permission for operation |
| 404 | NOT_FOUND | Project not found |
| 500 | INTERNAL_SERVER_ERROR | Server error |

### Error Response Format

All errors follow this structure:

```typescript
{
  error: {
    message: string;      // Human-readable error message
    code: string;         // tRPC error code
    data?: {
      code: string;       // Same as code
      httpStatus: number; // HTTP status code
      path: string;       // tRPC procedure path
      zodError?: any;     // Zod validation errors (if applicable)
    };
  }
}
```

### Error Codes

| Error Code | When It Occurs | User-Friendly Message |
|------------|----------------|----------------------|
| `BAD_REQUEST` | Validation failure | "Please check your input and try again" |
| `FORBIDDEN` | Permission denied | "You don't have permission to perform this action" |
| `NOT_FOUND` | Project doesn't exist | "Project not found" |
| `INTERNAL_SERVER_ERROR` | Server error | "Something went wrong. Please try again later" |

### Common Validation Errors

#### Budget Validation Errors

```typescript
// Budget cannot be negative
"Budget cannot be negative"

// Budget exceeds maximum
"Budget cannot exceed $10,000,000"

// Budget below type minimum (warning, not error)
"Budget is below recommended minimum of $1,000 for CAMPAIGN projects"

// Budget reduction below committed
"Cannot reduce budget below committed amount of $5,000.00. Current commitments: $5,000.00 in active licenses"

// Budget increase requiring approval
"Budget increase of 75% requires admin approval for non-admin users"
```

#### Date Validation Errors

```typescript
// End before start
"End date must be after start date"

// Start too far in past
"Start date cannot be more than 30 days in the past"

// Project too short
"Project must be at least 1 day long"

// Project too long
"Project duration of 400 days exceeds recommended maximum of 365 days"

// Date conflicts with licenses
"Cannot shorten end date: 2 license(s) extend beyond new end date (2025-12-31)"
```

#### Status Transition Errors

```typescript
// Invalid transition
"Invalid status transition from ARCHIVED to ACTIVE"

// Activation preconditions not met
"Project must have a budget before activation"
"Set project start and end dates"

// Completion preconditions not met
"Cannot complete project: 2 pending license(s) must be resolved"

// Archival preconditions not met
"Cannot archive project with 3 open license(s). All licenses must be expired or terminated"
```

#### Permission Errors

```typescript
// Only brands can create
"Only brand accounts can create projects"

// Brand not verified
"Brand must be verified before creating projects"

// Not project owner
"You can only update your own projects"

// Cannot update archived
"Archived projects cannot be updated"

// Cannot delete with licenses
"Cannot delete project with existing licenses"
```

#### Duplicate Detection Warnings

```typescript
// These are warnings, not blocking errors
"Similar project found: 'Summer Campaign 2024' (87% match)"
"Project name follows pattern used in previous years (2023, 2024)"
```

### Handling Errors in Frontend

```typescript
try {
  const result = await trpc.projects.create.mutate(input);
  // Success
} catch (error) {
  if (error.data?.code === 'BAD_REQUEST') {
    // Validation error - show to user
    toast.error(error.message);
  } else if (error.data?.code === 'FORBIDDEN') {
    // Permission error - redirect or show permission modal
    router.push('/unauthorized');
  } else if (error.data?.code === 'NOT_FOUND') {
    // Resource not found
    toast.error('Project not found');
  } else {
    // Generic error
    toast.error('Something went wrong. Please try again.');
  }
}
```

---

## Authorization & Permissions

### Role-Based Access Control

| Operation | BRAND (Own Projects) | BRAND (Other Projects) | ADMIN | CREATOR |
|-----------|---------------------|------------------------|-------|---------|
| Create | ✅ | ❌ | ✅ | ❌ |
| Read | ✅ | ❌ | ✅ | ✅ (ACTIVE only) |
| Update | ✅ | ❌ | ✅ | ❌ |
| Delete | ✅ | ❌ | ✅ | ❌ |
| Change Status | ✅ (some restrictions) | ❌ | ✅ | ❌ |

### Permission Rules

#### Create Projects

- **BRAND Role Required**: Only users with `role: 'BRAND'` can create projects
- **Brand Verification**: Brand `verificationStatus` must be `'approved'`
- **Active Account**: Brand must not be soft-deleted (`deletedAt: null`)
- **Admin Override**: Admins can create projects for any brand

#### Read Projects

- **Brands**: Can only read their own projects (`brand.userId === currentUser.id`)
- **Admins**: Can read all projects
- **Creators**: Can read ACTIVE projects only (for discovery)

#### Update Projects

- **Ownership**: Brands can only update projects where `brand.userId === currentUser.id`
- **Admin Override**: Admins can update any project
- **Status Restrictions**: Cannot update ARCHIVED projects
- **Status Transitions**: Follow state machine rules (see below)

#### Delete Projects

- **Ownership**: Brands can only delete their own projects
- **License Check**: Cannot delete projects with any licenses (active, pending, expired)
- **Soft Delete**: Projects are soft-deleted (`deletedAt` timestamp), not removed from database
- **Admin Override**: Admins can delete any project

### Status Transition State Machine

```
DRAFT
  ├─→ ACTIVE (requires: budget > 0, should have dates)
  └─→ CANCELLED

ACTIVE
  ├─→ IN_PROGRESS
  ├─→ CANCELLED
  └─→ ARCHIVED

IN_PROGRESS
  ├─→ COMPLETED (requires: no pending licenses)
  └─→ CANCELLED

COMPLETED
  └─→ ARCHIVED

CANCELLED
  └─→ ARCHIVED

ARCHIVED
  └─→ [terminal state - no transitions]
```

### Field-Level Permissions

All fields are editable by project owners and admins, except:

- `id`: Immutable
- `brandId`: Immutable
- `createdBy`: Immutable
- `createdAt`: Immutable
- `deletedAt`: Managed by system

### Resource Ownership Rules

1. **Brand Association**: Projects are always associated with a Brand via `brandId`
2. **User-Brand Mapping**: `Brand.userId` links project to the user who owns the brand
3. **Team Members**: Future feature - multiple users can collaborate on projects
4. **Admin Access**: Admins have full access regardless of ownership

### Authentication Requirements

All endpoints require:

1. **Valid Session**: Must be authenticated via NextAuth.js
2. **JWT Token**: Include in request headers
3. **Role Verification**: User role checked against required permissions
4. **Brand Context**: For BRAND users, brand account must exist and be active

### Session Token Structure

```typescript
{
  user: {
    id: string;
    email: string;
    role: 'ADMIN' | 'BRAND' | 'CREATOR';
    name?: string;
    // For BRAND users:
    brandId?: string;
    brandVerificationStatus?: string;
    // For CREATOR users:
    creatorId?: string;
  }
}
```

---

**Next:** See [Part 2: Implementation Guide](./PROJECT_VALIDATION_IMPLEMENTATION_GUIDE.md) for business logic, validation rules, frontend checklist, and implementation examples.
