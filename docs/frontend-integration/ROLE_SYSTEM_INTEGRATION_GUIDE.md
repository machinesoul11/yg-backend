# Role System - Frontend Integration Guide

**Module:** Role System  
**Backend Deployment:** ops.yesgoddess.agency  
**API Architecture:** REST API + tRPC, JWT Authentication  
**Version:** 1.0  
**Last Updated:** October 12, 2025

---

## Table of Contents

1. [API Endpoints](#1-api-endpoints)
2. [Request/Response Examples](#2-requestresponse-examples)
3. [TypeScript Type Definitions](#3-typescript-type-definitions)
4. [Business Logic & Validation Rules](#4-business-logic--validation-rules)
5. [Error Handling](#5-error-handling)
6. [Authorization & Permissions](#6-authorization--permissions)
7. [Rate Limiting & Quotas](#7-rate-limiting--quotas)
8. [Real-time Updates](#8-real-time-updates)
9. [Pagination & Filtering](#9-pagination--filtering)
10. [Frontend Implementation Checklist](#10-frontend-implementation-checklist)
11. [Testing Scenarios](#11-testing-scenarios)

---

## 1. API Endpoints

### Base Configuration

```typescript
const API_BASE_URL = 'https://ops.yesgoddess.agency';
const TRPC_ENDPOINT = `${API_BASE_URL}/api/trpc`;
```

### Available Endpoints

| Endpoint | Method | Description | Auth Required | Role Required |
|----------|--------|-------------|---------------|---------------|
| `/api/trpc/roles.listUsers` | GET | List users with roles (paginated) | ✅ Yes | ADMIN |
| `/api/trpc/roles.getUserRole` | GET | Get detailed role info for user | ✅ Yes | ADMIN |
| `/api/trpc/roles.assignRole` | POST | Assign role to user | ✅ Yes | ADMIN |
| `/api/trpc/roles.getRoleHistory` | GET | Get role change history | ✅ Yes | ADMIN |
| `/api/trpc/roles.bulkAssignRole` | POST | Bulk assign role to multiple users | ✅ Yes | ADMIN |
| `/api/trpc/roles.getRoleStatistics` | GET | Get role distribution statistics | ✅ Yes | ADMIN |

> **⚠️ Important:** All role management endpoints are **ADMIN-only**. Attempting to access these endpoints without admin privileges will result in a `403 FORBIDDEN` error.

---

## 2. Request/Response Examples

### 2.1 List Users with Roles

**Endpoint:** `roles.listUsers`  
**Method:** tRPC Query  
**Description:** Retrieve paginated list of users with their roles

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/roles.listUsers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "page": 1,
    "limit": 20,
    "roleFilter": "CREATOR",
    "searchQuery": "john",
    "sortBy": "createdAt",
    "sortOrder": "desc"
  }'
```

#### Response (Success - 200)

```json
{
  "data": [
    {
      "id": "clx1234567890abcdef",
      "email": "john.creator@example.com",
      "name": "John Creator",
      "avatar": "https://storage.yesgoddess.agency/avatars/john.jpg",
      "role": "CREATOR",
      "roleDisplayName": "Creator",
      "email_verified": "2025-09-15T10:30:00Z",
      "createdAt": "2025-09-01T08:00:00Z",
      "lastLoginAt": "2025-10-11T14:22:00Z",
      "isActive": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

---

### 2.2 Get User Role Details

**Endpoint:** `roles.getUserRole`  
**Method:** tRPC Query

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/roles.getUserRole \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "userId": "clx1234567890abcdef"
  }'
```

#### Response (Success - 200)

```json
{
  "id": "clx1234567890abcdef",
  "email": "john.creator@example.com",
  "name": "John Creator",
  "role": "CREATOR",
  "roleDisplayName": "Creator",
  "createdAt": "2025-09-01T08:00:00Z",
  "updatedAt": "2025-09-15T10:30:00Z",
  "creator": {
    "id": "creator_abc123",
    "verificationStatus": "approved",
    "verifiedAt": "2025-09-15T10:30:00Z"
  },
  "brand": null
}
```

---

### 2.3 Assign Role to User

**Endpoint:** `roles.assignRole`  
**Method:** tRPC Mutation

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/roles.assignRole \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "userId": "clx1234567890abcdef",
    "role": "CREATOR",
    "reason": "User completed creator profile verification and submitted portfolio samples"
  }'
```

#### Response (Success - 200)

```json
{
  "success": true,
  "message": "Role changed from Viewer to Creator",
  "data": {
    "success": true,
    "previousRole": "VIEWER",
    "newRole": "CREATOR"
  }
}
```

---

### 2.4 Get Role Change History

**Endpoint:** `roles.getRoleHistory`  
**Method:** tRPC Query

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/roles.getRoleHistory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "userId": "clx1234567890abcdef",
    "limit": 50
  }'
```

#### Response (Success - 200)

```json
{
  "data": [
    {
      "id": "audit_xyz789",
      "timestamp": "2025-09-15T10:30:00Z",
      "previousRole": "VIEWER",
      "newRole": "CREATOR",
      "assignedBy": {
        "id": "admin_456",
        "email": "admin@yesgoddess.agency",
        "name": "Admin User"
      },
      "reason": "User completed creator profile verification and submitted portfolio samples",
      "ipAddress": "192.168.1.100"
    }
  ],
  "total": 1
}
```

---

### 2.5 Bulk Assign Role

**Endpoint:** `roles.bulkAssignRole`  
**Method:** tRPC Mutation

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/roles.bulkAssignRole \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "userIds": [
      "clx1234567890abcdef",
      "clx0987654321fedcba"
    ],
    "role": "CREATOR",
    "reason": "Bulk approval of verified creator applications"
  }'
```

#### Response (Success - 200)

```json
{
  "success": true,
  "message": "Successfully assigned Creator role to 2 user(s)",
  "data": {
    "successful": [
      "clx1234567890abcdef",
      "clx0987654321fedcba"
    ],
    "failed": []
  }
}
```

#### Response (Partial Success - 200)

```json
{
  "success": true,
  "message": "Successfully assigned Creator role to 1 user(s)",
  "data": {
    "successful": [
      "clx1234567890abcdef"
    ],
    "failed": [
      {
        "userId": "clx0987654321fedcba",
        "error": "Invalid role transition from BRAND to CREATOR"
      }
    ]
  }
}
```

---

### 2.6 Get Role Statistics

**Endpoint:** `roles.getRoleStatistics`  
**Method:** tRPC Query

#### Request

```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/roles.getRoleStatistics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Response (Success - 200)

```json
{
  "byRole": [
    {
      "role": "ADMIN",
      "roleDisplayName": "Administrator",
      "count": 5
    },
    {
      "role": "CREATOR",
      "roleDisplayName": "Creator",
      "count": 342
    },
    {
      "role": "BRAND",
      "roleDisplayName": "Brand",
      "count": 128
    },
    {
      "role": "VIEWER",
      "roleDisplayName": "Viewer",
      "count": 1567
    }
  ],
  "total": 2042
}
```

---

## 3. TypeScript Type Definitions

### 3.1 Core Types

```typescript
/**
 * User Role Enum
 * Defines all available roles in the platform
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}

/**
 * User with Role Information
 */
export interface UserWithRole {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: UserRole;
  roleDisplayName: string;
  email_verified: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  isActive: boolean;
}

/**
 * Detailed User Role Information
 */
export interface UserRoleDetails {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  roleDisplayName: string;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    verificationStatus: 'pending' | 'approved' | 'rejected';
    verifiedAt: string | null;
  } | null;
  brand: {
    id: string;
    verificationStatus: 'pending' | 'verified' | 'rejected';
    verifiedAt: string | null;
  } | null;
}

/**
 * Role Change History Entry
 */
export interface RoleHistoryEntry {
  id: string;
  timestamp: string;
  previousRole: UserRole | null;
  newRole: UserRole | null;
  assignedBy: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  reason: string | null;
  ipAddress: string | null;
}

/**
 * Role Statistics
 */
export interface RoleStatistics {
  byRole: Array<{
    role: UserRole;
    roleDisplayName: string;
    count: number;
  }>;
  total: number;
}
```

---

### 3.2 Request Schemas

```typescript
/**
 * List Users Input
 */
export interface ListUsersInput {
  page?: number; // Default: 1
  limit?: number; // Default: 20, Max: 100
  roleFilter?: UserRole;
  searchQuery?: string;
  sortBy?: 'createdAt' | 'email' | 'name' | 'role'; // Default: 'createdAt'
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
}

/**
 * Assign Role Input
 */
export interface AssignRoleInput {
  userId: string; // CUID format
  role: UserRole;
  reason?: string; // Min: 10 chars, Max: 500 chars
}

/**
 * Bulk Assign Role Input
 */
export interface BulkAssignRoleInput {
  userIds: string[]; // Min: 1, Max: 100
  role: UserRole;
  reason: string; // Required, Min: 10 chars, Max: 500 chars
}

/**
 * Get Role History Input
 */
export interface GetRoleHistoryInput {
  userId: string; // CUID format
  limit?: number; // Default: 50, Max: 100
}

/**
 * Get User Role Input
 */
export interface GetUserRoleInput {
  userId: string; // CUID format
}
```

---

### 3.3 Response Schemas

```typescript
/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Assign Role Response
 */
export interface AssignRoleResponse {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    previousRole: UserRole;
    newRole: UserRole;
  };
}

/**
 * Bulk Assign Role Response
 */
export interface BulkAssignRoleResponse {
  success: boolean;
  message: string;
  data: {
    successful: string[];
    failed: Array<{
      userId: string;
      error: string;
    }>;
  };
}

/**
 * Role History Response
 */
export interface RoleHistoryResponse {
  data: RoleHistoryEntry[];
  total: number;
}
```

---

### 3.4 Zod Validation Schemas

```typescript
import { z } from 'zod';

/**
 * User Role Enum Schema
 */
export const UserRoleEnum = z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER']);

/**
 * Assign Role Schema
 */
export const assignRoleSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  role: UserRoleEnum,
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason too long')
    .optional(),
});

/**
 * Bulk Assign Role Schema
 */
export const bulkAssignRoleSchema = z.object({
  userIds: z
    .array(z.string().cuid('Invalid user ID'))
    .min(1, 'At least one user ID required')
    .max(100, 'Maximum 100 users at once'),
  role: UserRoleEnum,
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason too long'),
});

/**
 * List Users Schema
 */
export const listUsersSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  roleFilter: UserRoleEnum.optional(),
  searchQuery: z.string().optional(),
  sortBy: z.enum(['createdAt', 'email', 'name', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Get Role History Schema
 */
export const getRoleHistorySchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  limit: z.number().int().min(1).max(100).default(50),
});

/**
 * Get User Role Schema
 */
export const getUserRoleSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
});
```

---

## 4. Business Logic & Validation Rules

### 4.1 Role Definitions

| Role | Description | Typical Users |
|------|-------------|---------------|
| **ADMIN** | Platform administrator with full access to all features and data | Platform operators, system administrators |
| **CREATOR** | Content creator who owns IP assets and earns royalties from licensing | Photographers, videographers, designers, artists |
| **BRAND** | Brand/company that licenses IP assets for campaigns and projects | Marketing managers, creative directors, brand managers |
| **VIEWER** | Basic user with limited read-only access to public content | New registrations, exploratory users |

---

### 4.2 Role Hierarchy

The platform uses a hierarchical role system for privilege comparisons:

```
ADMIN (Level 0) - Highest privilege
├── CREATOR (Level 1) - Mid-level privilege
├── BRAND (Level 1) - Mid-level privilege
└── VIEWER (Level 2) - Lowest privilege
```

> **⚠️ Important:** CREATOR and BRAND are on the same hierarchy level but have different permissions. They are **not interchangeable**.

---

### 4.3 Valid Role Transitions

The system enforces strict role transition rules:

| From Role | To Role | Valid? | Trigger | Notes |
|-----------|---------|--------|---------|-------|
| VIEWER | CREATOR | ✅ Yes | Auto/Manual | Automatic on creator verification |
| VIEWER | BRAND | ✅ Yes | Auto/Manual | Automatic on brand verification |
| VIEWER | ADMIN | ✅ Yes | Manual Only | Requires existing admin approval |
| CREATOR | VIEWER | ✅ Yes | Manual Only | Account downgrade |
| CREATOR | BRAND | ❌ **No** | N/A | **Conflicting business models** |
| CREATOR | ADMIN | ✅ Yes | Manual Only | Elevation to admin |
| BRAND | VIEWER | ✅ Yes | Manual Only | Account downgrade |
| BRAND | CREATOR | ❌ **No** | N/A | **Conflicting business models** |
| BRAND | ADMIN | ✅ Yes | Manual Only | Elevation to admin |
| ADMIN | VIEWER | ✅ Yes | Manual Only | Must be done by another admin |
| ADMIN | CREATOR | ✅ Yes | Manual Only | Must be done by another admin |
| ADMIN | BRAND | ✅ Yes | Manual Only | Must be done by another admin |
| Any | Same Role | ❌ **No** | N/A | **No-operation** |

---

### 4.4 Validation Rules

#### User ID Validation
- **Format:** CUID (e.g., `clx1234567890abcdef`)
- **Validation:** Must match CUID format
- **Error:** `Invalid user ID` if format is incorrect

#### Role Value Validation
- **Allowed Values:** `ADMIN`, `CREATOR`, `BRAND`, `VIEWER`
- **Case Sensitive:** Must be uppercase
- **Error:** `Invalid role: {role}` if not in enum

#### Reason Field (Optional for Single Assignment, Required for Bulk)
- **Min Length:** 10 characters
- **Max Length:** 500 characters
- **Error Messages:**
  - `Reason must be at least 10 characters`
  - `Reason too long` (if > 500 chars)

#### Pagination Limits
- **Page:** Min 1, no maximum
- **Limit:** Min 1, Max 100
- **Default Limit:** 20

#### Bulk Operations
- **Min Users:** 1
- **Max Users:** 100 per request
- **Error:** `Maximum 100 users at once`

---

### 4.5 Business Rules

#### 1. Same Role Assignment
- **Rule:** Cannot assign a role that the user already has
- **Error:** `User already has {role} role`
- **Frontend:** Disable "Assign" button if current role === selected role

#### 2. Invalid Transitions
- **Rule:** CREATOR ↔️ BRAND transitions are forbidden
- **Error:** `Invalid role transition from {currentRole} to {newRole}`
- **Frontend:** Hide or disable BRAND option for CREATOR users and vice versa

#### 3. Admin-Only Access
- **Rule:** Only ADMIN users can assign roles
- **Error:** `403 FORBIDDEN` with message: `This action requires Admin role`
- **Frontend:** Hide role management UI entirely for non-admin users

#### 4. Deleted Users
- **Rule:** Cannot assign role to deleted users
- **Error:** `Cannot assign role to deleted user`
- **Frontend:** Filter out deleted users from list

#### 5. Email Notification
- **Rule:** User receives email notification after successful role change
- **Behavior:** Email sent asynchronously (does not block response)
- **Frontend:** Display success message immediately, mention email will arrive

#### 6. Audit Logging
- **Rule:** All role changes are logged to audit trail
- **Data Captured:**
  - Previous role
  - New role
  - Assigned by (admin user)
  - Reason
  - Timestamp
  - IP address
  - User agent
  - Request ID

---

### 4.6 Automatic Role Assignment

When creator/brand profiles are verified, roles are automatically assigned:

#### Creator Verification Flow
```
User creates creator profile (Role: VIEWER)
    ↓
Admin approves creator profile
    ↓
System automatically assigns CREATOR role
    ↓
Email notification sent
```

#### Brand Verification Flow
```
User creates brand profile (Role: VIEWER)
    ↓
Admin verifies brand profile
    ↓
System automatically assigns BRAND role
    ↓
Email notification sent
```

> **Frontend Note:** These automatic assignments happen in the backend. Frontend should refresh user data after verification actions.

---

## 5. Error Handling

### 5.1 HTTP Status Codes

| Status Code | Meaning | When It Occurs |
|-------------|---------|----------------|
| `200` | Success | Request completed successfully |
| `400` | Bad Request | Invalid input, validation error, business rule violation |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | User does not have required role (not an admin) |
| `404` | Not Found | User with specified ID does not exist |
| `500` | Internal Server Error | Unexpected server error |

---

### 5.2 Error Response Format

```typescript
interface ErrorResponse {
  error: string; // Human-readable error message
  code: string; // Machine-readable error code
}
```

---

### 5.3 All Possible Error Codes

| Error Code | HTTP Status | Message | Trigger | User-Friendly Message |
|------------|-------------|---------|---------|----------------------|
| `UNAUTHORIZED` | 401 | `Unauthorized` | No auth token or invalid token | "You must be logged in to perform this action" |
| `FORBIDDEN` | 403 | `This action requires Admin role` | Non-admin trying to access endpoint | "You don't have permission to manage user roles. Admin access required." |
| `BAD_REQUEST` | 400 | `Invalid role: {role}` | Invalid role value | "The selected role is not valid. Please choose a valid role." |
| `BAD_REQUEST` | 400 | `Invalid user ID` | User ID not in CUID format | "Invalid user ID format" |
| `BAD_REQUEST` | 400 | `User already has {role} role` | Assigning same role | "This user already has the {role} role" |
| `BAD_REQUEST` | 400 | `Invalid role transition from {A} to {B}` | Invalid transition (e.g., CREATOR → BRAND) | "Cannot change from {A} to {B}. Please contact support if you need help." |
| `BAD_REQUEST` | 400 | `Cannot assign role to deleted user` | Target user is soft-deleted | "This user account has been deleted and cannot be modified" |
| `BAD_REQUEST` | 400 | `Reason must be at least 10 characters` | Reason too short | "Please provide a reason with at least 10 characters" |
| `BAD_REQUEST` | 400 | `Reason too long` | Reason > 500 chars | "Reason must be less than 500 characters" |
| `BAD_REQUEST` | 400 | `At least one user ID required` | Empty userIds array | "Please select at least one user" |
| `BAD_REQUEST` | 400 | `Maximum 100 users at once` | Too many users in bulk operation | "You can only assign roles to 100 users at a time" |
| `NOT_FOUND` | 404 | `User with ID {id} not found` | User doesn't exist | "User not found" |
| `NOT_FOUND` | 404 | `Assigner user not found` | Admin user ID invalid (shouldn't happen) | "An error occurred. Please try again." |
| `INTERNAL_SERVER_ERROR` | 500 | `Failed to assign role. Please try again.` | Database error, transaction failure | "Something went wrong. Please try again later." |

---

### 5.4 Frontend Error Handling Strategy

#### Display Specific Errors
Show the exact error message for these codes:
- `BAD_REQUEST` with validation errors
- `NOT_FOUND`
- `FORBIDDEN`

```typescript
if (error.code === 'BAD_REQUEST' || error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') {
  toast.error(error.message);
}
```

#### Display Generic Errors
Show a generic message for:
- `INTERNAL_SERVER_ERROR`
- `UNAUTHORIZED` (redirect to login instead)

```typescript
if (error.code === 'INTERNAL_SERVER_ERROR') {
  toast.error('Something went wrong. Please try again later.');
}

if (error.code === 'UNAUTHORIZED') {
  router.push('/auth/signin');
}
```

---

### 5.5 Error Handling Example with React Query

```typescript
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

const assignRoleMutation = useMutation({
  mutationFn: (input: AssignRoleInput) => 
    trpc.roles.assignRole.mutate(input),
  
  onSuccess: (data) => {
    toast.success(data.message);
    // Refetch user list or update cache
  },
  
  onError: (error) => {
    if (error.code === 'FORBIDDEN') {
      toast.error('You don\'t have permission to manage user roles.');
    } else if (error.code === 'BAD_REQUEST') {
      toast.error(error.message);
    } else if (error.code === 'NOT_FOUND') {
      toast.error('User not found');
    } else {
      toast.error('Failed to assign role. Please try again.');
    }
  },
});
```

---

## 6. Authorization & Permissions

### 6.1 Role-Based Access Control (RBAC)

All role management endpoints require **ADMIN** role:

```typescript
// Backend middleware check
if (session.user.role !== 'ADMIN') {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'This action requires Admin role',
  });
}
```

---

### 6.2 Endpoint Access Matrix

| Endpoint | ADMIN | CREATOR | BRAND | VIEWER |
|----------|-------|---------|-------|--------|
| `listUsers` | ✅ | ❌ | ❌ | ❌ |
| `getUserRole` | ✅ | ❌ | ❌ | ❌ |
| `assignRole` | ✅ | ❌ | ❌ | ❌ |
| `getRoleHistory` | ✅ | ❌ | ❌ | ❌ |
| `bulkAssignRole` | ✅ | ❌ | ❌ | ❌ |
| `getRoleStatistics` | ✅ | ❌ | ❌ | ❌ |

---

### 6.3 Permission Definitions

The platform uses a granular permission system mapped to roles:

#### Admin Permissions (All Permissions)
- Full unrestricted access to all features
- Can view, create, edit, delete any resource
- Can assign roles and manage permissions

#### Creator Permissions
- `creators.view_own` - View own creator profile
- `creators.edit_own` - Edit own creator profile
- `users.view_own` - View own user profile
- `users.edit_own` - Edit own user profile
- Cannot view or modify other users' roles

#### Brand Permissions
- `brands.view_own` - View own brand profile
- `brands.edit_own` - Edit own brand profile
- `users.view_own` - View own user profile
- `users.edit_own` - Edit own user profile
- Cannot view or modify other users' roles

#### Viewer Permissions
- `users.view_own` - View own user profile
- Cannot modify anything
- Cannot view other users

---

### 6.4 Frontend Authorization Guards

#### Route Protection

```typescript
// app/admin/roles/page.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function RoleManagementPage() {
  const session = await getSession();
  
  if (!session || session.user.role !== 'ADMIN') {
    redirect('/auth/signin');
  }
  
  return <RoleManagementUI />;
}
```

#### Component-Level Guards

```typescript
// components/RoleManagementButton.tsx
import { useSession } from 'next-auth/react';

export function RoleManagementButton() {
  const { data: session } = useSession();
  
  // Don't render for non-admins
  if (session?.user?.role !== 'ADMIN') {
    return null;
  }
  
  return (
    <Button onClick={() => router.push('/admin/roles')}>
      Manage Roles
    </Button>
  );
}
```

---

### 6.5 Session Data Structure

The user's current role is available in the session/JWT:

```typescript
interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole; // ← Current role
    emailVerified: boolean;
    avatar: string | null;
    creatorId?: string; // If CREATOR
    brandId?: string; // If BRAND
  };
}
```

---

## 7. Rate Limiting & Quotas

### 7.1 Rate Limits

> **⚠️ Note:** The Role System does not currently implement specific rate limiting. However, general API rate limits may apply at the infrastructure level.

**Recommended Frontend Behavior:**
- Debounce search inputs (300-500ms)
- Use optimistic updates for better UX
- Implement request deduplication

---

### 7.2 Bulk Operation Limits

| Operation | Limit | Error Message |
|-----------|-------|---------------|
| Bulk Assign Role | 100 users per request | `Maximum 100 users at once` |
| List Users | 100 records per page | Enforced by pagination |
| Role History | 100 entries max | Enforced by `limit` parameter |

---

### 7.3 Best Practices

```typescript
// Debounce search input
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const [searchQuery, setSearchQuery] = useState('');
const debouncedSearch = useDebouncedValue(searchQuery, 300);

// Use debounced value in query
const { data } = trpc.roles.listUsers.useQuery({
  searchQuery: debouncedSearch,
  page: currentPage,
  limit: 20,
});
```

---

## 8. Real-time Updates

### 8.1 Email Notifications

When a user's role is changed, they receive an automated email:

**Email Template: `role-changed`**

```
Subject: Your YES GODDESS Role Has Been Updated

Hello {userName},

Your role on YES GODDESS has been changed:
- Previous Role: {oldRole}
- New Role: {newRole}

Changed by: {changedBy} ({changedByEmail})
Reason: {reason}
Timestamp: {timestamp}

If you have questions, contact us at {supportEmail}.

Best regards,
YES GODDESS Team
```

---

### 8.2 WebSocket/SSE Events

> **⚠️ Note:** The Role System does not currently emit real-time events via WebSocket or Server-Sent Events.

**Frontend Strategy:**
- Poll for updates after role assignment
- Use React Query's `refetchInterval` for auto-refresh
- Invalidate queries on successful mutation

```typescript
const assignRoleMutation = useMutation({
  mutationFn: trpc.roles.assignRole.mutate,
  onSuccess: () => {
    // Invalidate and refetch queries
    queryClient.invalidateQueries(['roles', 'listUsers']);
    queryClient.invalidateQueries(['roles', 'getRoleStatistics']);
  },
});
```

---

### 8.3 Polling Recommendations

For admin dashboards that need near-real-time data:

```typescript
// Poll every 30 seconds for updated user list
const { data } = trpc.roles.listUsers.useQuery(
  { page: 1, limit: 20 },
  {
    refetchInterval: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  }
);
```

---

## 9. Pagination & Filtering

### 9.1 Pagination Format

The API uses **offset-based pagination**:

```typescript
{
  page: 1,        // Current page (1-indexed)
  limit: 20,      // Results per page
  total: 156,     // Total number of records
  totalPages: 8   // Total number of pages
}
```

---

### 9.2 Available Filters

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `roleFilter` | `UserRole?` | Filter by specific role | `CREATOR` |
| `searchQuery` | `string?` | Search in email and name | `john` |
| `sortBy` | `string` | Sort field | `createdAt`, `email`, `name`, `role` |
| `sortOrder` | `string` | Sort direction | `asc`, `desc` |

---

### 9.3 Sorting Options

| Sort By | Description |
|---------|-------------|
| `createdAt` | User registration date (default) |
| `email` | Email address (alphabetical) |
| `name` | User name (alphabetical) |
| `role` | Role name (alphabetical) |

---

### 9.4 Frontend Implementation Example

```typescript
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function UserListTable() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'email' | 'name' | 'role'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = trpc.roles.listUsers.useQuery({
    page,
    limit,
    roleFilter,
    searchQuery,
    sortBy,
    sortOrder,
  });

  return (
    <div>
      {/* Search Input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search by email or name..."
      />

      {/* Role Filter Dropdown */}
      <select
        value={roleFilter || ''}
        onChange={(e) => setRoleFilter(e.target.value as UserRole || undefined)}
      >
        <option value="">All Roles</option>
        <option value="ADMIN">Administrator</option>
        <option value="CREATOR">Creator</option>
        <option value="BRAND">Brand</option>
        <option value="VIEWER">Viewer</option>
      </select>

      {/* User Table */}
      <table>
        <thead>
          <tr>
            <th onClick={() => handleSort('email')}>Email</th>
            <th onClick={() => handleSort('name')}>Name</th>
            <th onClick={() => handleSort('role')}>Role</th>
            <th onClick={() => handleSort('createdAt')}>Joined</th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((user) => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.name}</td>
              <td>{user.roleDisplayName}</td>
              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={data?.meta.totalPages || 1}
        onPageChange={setPage}
      />
    </div>
  );
}
```

---

## 10. Frontend Implementation Checklist

### Phase 1: Setup & Authentication
- [ ] Install and configure tRPC client
- [ ] Set up JWT authentication with Next-Auth/Auth.js
- [ ] Create API client with authorization headers
- [ ] Implement session management
- [ ] Add route guards for admin-only pages

### Phase 2: User List UI
- [ ] Create user list table component
- [ ] Implement pagination controls
- [ ] Add role filter dropdown
- [ ] Add search input with debouncing
- [ ] Implement column sorting
- [ ] Display role badges with colors
- [ ] Show user verification status
- [ ] Add loading states
- [ ] Add empty state ("No users found")

### Phase 3: Role Assignment UI
- [ ] Create role assignment modal/dialog
- [ ] Add role selection dropdown
- [ ] Implement role transition validation (disable invalid options)
- [ ] Add reason textarea (with character count)
- [ ] Show current role vs. new role
- [ ] Add confirmation step for sensitive changes
- [ ] Implement optimistic updates
- [ ] Add success toast notification
- [ ] Add error toast notification

### Phase 4: Bulk Operations
- [ ] Add checkbox selection to user list
- [ ] Implement "Select All" functionality
- [ ] Create bulk action toolbar
- [ ] Add bulk role assignment dialog
- [ ] Enforce 100-user limit
- [ ] Show progress indicator
- [ ] Display partial success results
- [ ] Allow retry for failed users

### Phase 5: Role History
- [ ] Create role history modal/drawer
- [ ] Implement timeline UI
- [ ] Display before/after role comparison
- [ ] Show admin who made the change
- [ ] Display reason for change
- [ ] Show timestamp
- [ ] Add filtering by date range
- [ ] Add export to CSV functionality

### Phase 6: Dashboard & Analytics
- [ ] Create role statistics dashboard
- [ ] Add role distribution chart (pie/donut)
- [ ] Show total user count by role
- [ ] Add trend indicators
- [ ] Display recent role changes
- [ ] Add quick action buttons

### Phase 7: Edge Cases & UX
- [ ] Handle deleted users gracefully
- [ ] Show loading skeletons
- [ ] Implement error boundaries
- [ ] Add retry mechanisms
- [ ] Show network status indicator
- [ ] Add keyboard shortcuts
- [ ] Implement responsive design
- [ ] Add accessibility (ARIA labels, keyboard navigation)
- [ ] Test with slow network (loading states)
- [ ] Test with failed requests (error states)

### Phase 8: Testing
- [ ] Write unit tests for API client
- [ ] Write integration tests for forms
- [ ] Write E2E tests for role assignment flow
- [ ] Test all error scenarios
- [ ] Test pagination edge cases
- [ ] Test bulk operations
- [ ] Test with different user roles
- [ ] Test on mobile devices

---

## 11. Testing Scenarios

### 11.1 Happy Path Tests

#### Test Case 1: List Users
```typescript
describe('List Users', () => {
  it('should fetch paginated user list', async () => {
    const result = await trpc.roles.listUsers.query({
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(20);
    expect(result.meta.page).toBe(1);
    expect(result.meta.total).toBeGreaterThan(0);
  });
});
```

#### Test Case 2: Assign Role (VIEWER → CREATOR)
```typescript
it('should assign CREATOR role to VIEWER user', async () => {
  const result = await trpc.roles.assignRole.mutate({
    userId: 'clx_viewer_123',
    role: 'CREATOR',
    reason: 'User completed creator profile verification',
  });

  expect(result.success).toBe(true);
  expect(result.data.previousRole).toBe('VIEWER');
  expect(result.data.newRole).toBe('CREATOR');
});
```

#### Test Case 3: Get Role History
```typescript
it('should retrieve role change history', async () => {
  const result = await trpc.roles.getRoleHistory.query({
    userId: 'clx_user_123',
    limit: 50,
  });

  expect(result.data).toBeInstanceOf(Array);
  expect(result.data[0]).toHaveProperty('previousRole');
  expect(result.data[0]).toHaveProperty('newRole');
  expect(result.data[0]).toHaveProperty('timestamp');
});
```

---

### 11.2 Error Scenario Tests

#### Test Case 4: Unauthorized Access
```typescript
it('should return 403 for non-admin users', async () => {
  // Set session to CREATOR role
  mockSession({ role: 'CREATOR' });

  await expect(
    trpc.roles.listUsers.query({ page: 1, limit: 20 })
  ).rejects.toThrow('This action requires Admin role');
});
```

#### Test Case 5: Invalid Role Transition
```typescript
it('should reject CREATOR → BRAND transition', async () => {
  await expect(
    trpc.roles.assignRole.mutate({
      userId: 'clx_creator_123',
      role: 'BRAND',
      reason: 'Switching to brand account',
    })
  ).rejects.toThrow('Invalid role transition');
});
```

#### Test Case 6: Same Role Assignment
```typescript
it('should reject assigning same role', async () => {
  await expect(
    trpc.roles.assignRole.mutate({
      userId: 'clx_creator_123',
      role: 'CREATOR', // Already CREATOR
      reason: 'Reassigning same role',
    })
  ).rejects.toThrow('User already has Creator role');
});
```

---

### 11.3 Edge Case Tests

#### Test Case 7: Bulk Assign with Some Failures
```typescript
it('should handle partial success in bulk assign', async () => {
  const result = await trpc.roles.bulkAssignRole.mutate({
    userIds: [
      'clx_viewer_123', // Valid
      'clx_creator_456', // Will fail (CREATOR → BRAND)
    ],
    role: 'BRAND',
    reason: 'Bulk brand assignment',
  });

  expect(result.data.successful).toHaveLength(1);
  expect(result.data.failed).toHaveLength(1);
  expect(result.data.failed[0].error).toContain('Invalid role transition');
});
```

#### Test Case 8: Search with Special Characters
```typescript
it('should handle special characters in search', async () => {
  const result = await trpc.roles.listUsers.query({
    searchQuery: "O'Reilly",
    page: 1,
    limit: 20,
  });

  expect(result.data).toBeInstanceOf(Array);
  // Should not throw SQL injection error
});
```

#### Test Case 9: Pagination Beyond Last Page
```typescript
it('should return empty array for page beyond last', async () => {
  const result = await trpc.roles.listUsers.query({
    page: 9999,
    limit: 20,
  });

  expect(result.data).toHaveLength(0);
  expect(result.meta.page).toBe(9999);
});
```

---

### 11.4 Integration Test Example

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoleAssignmentModal } from '@/components/RoleAssignmentModal';
import { trpc } from '@/lib/trpc';

jest.mock('@/lib/trpc');

describe('RoleAssignmentModal', () => {
  it('should complete full role assignment flow', async () => {
    const mockUser = {
      id: 'clx_viewer_123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'VIEWER',
    };

    render(
      <RoleAssignmentModal
        user={mockUser}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    // Select new role
    const roleSelect = screen.getByLabelText('New Role');
    fireEvent.change(roleSelect, { target: { value: 'CREATOR' } });

    // Enter reason
    const reasonInput = screen.getByLabelText('Reason');
    fireEvent.change(reasonInput, {
      target: { value: 'User completed creator verification' },
    });

    // Submit form
    const submitButton = screen.getByText('Assign Role');
    fireEvent.click(submitButton);

    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText('Role changed from Viewer to Creator')).toBeInTheDocument();
    });
  });
});
```

---

## 12. Additional Resources

### Documentation Links
- [Role Definitions](/docs/modules/authentication/roles.md)
- [Role Transitions](/docs/modules/authentication/role-transitions.md)
- [Permission System](/docs/infrastructure/permissions/README.md)
- [Authorization Middleware](/docs/middleware/ACCESS_CONTROL.md)

### Backend Files
- **Router:** `src/lib/api/routers/roles.router.ts`
- **Service:** `src/lib/services/role-assignment.service.ts`
- **Schemas:** `src/lib/schemas/role.schema.ts`
- **Constants:** `src/lib/constants/roles.ts`
- **Middleware:** `src/lib/middleware/authorization.middleware.ts`

### Support
- **Backend Developer:** Available via internal Slack
- **API Issues:** Create ticket in JIRA with label `api-integration`
- **Slack Channel:** `#yesgoddess-backend`

---

## Appendix A: Role Transition Decision Tree

```
User wants to change role from X to Y
    ↓
Is X === Y?
    YES → ❌ Reject: "User already has this role"
    NO → Continue
    ↓
Is transition in VALID_ROLE_TRANSITIONS[X]?
    NO → ❌ Reject: "Invalid role transition"
    YES → Continue
    ↓
Is requester an ADMIN?
    NO → ❌ Reject: "Forbidden"
    YES → Continue
    ↓
Is user deleted?
    YES → ❌ Reject: "Cannot assign role to deleted user"
    NO → Continue
    ↓
✅ Proceed with role assignment
```

---

## Appendix B: React Query Setup Example

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

// app/providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: 'https://ops.yesgoddess.agency/api/trpc',
          headers() {
            return {
              authorization: `Bearer ${getToken()}`,
            };
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

---

## Appendix C: Role Badge Component Example

```typescript
// components/RoleBadge.tsx
import { UserRole } from '@prisma/client';

const ROLE_COLORS = {
  ADMIN: 'bg-red-100 text-red-800 border-red-200',
  CREATOR: 'bg-purple-100 text-purple-800 border-purple-200',
  BRAND: 'bg-blue-100 text-blue-800 border-blue-200',
  VIEWER: 'bg-gray-100 text-gray-800 border-gray-200',
};

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  CREATOR: 'Creator',
  BRAND: 'Brand',
  VIEWER: 'Viewer',
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full 
        text-xs font-medium border
        ${ROLE_COLORS[role]}
      `}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
```

---

**End of Frontend Integration Guide**

For questions or clarifications, contact the backend team via Slack (#yesgoddess-backend) or create a ticket in JIRA.
