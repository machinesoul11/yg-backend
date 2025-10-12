# Permission System - Frontend Integration Guide

> **Last Updated:** October 12, 2025  
> **Backend Version:** v1.0  
> **API Base URL:** `https://ops.yesgoddess.agency/api`

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Caching Strategy](#caching-strategy)
10. [Frontend Implementation Checklist](#frontend-implementation-checklist)
11. [Testing Scenarios](#testing-scenarios)

---

## Overview

The Permission System provides a comprehensive, multi-layered authorization framework with:

- **Role-Based Access Control (RBAC)** - 4 user roles (ADMIN, CREATOR, BRAND, VIEWER)
- **Resource-Level Permissions** - Ownership and relationship-based access
- **Field-Level Permissions** - Fine-grained control over which fields users can view/edit
- **Permission Inheritance** - Higher permissions automatically grant lower-level ones
- **Multi-Tier Caching** - Request-level and Redis caching for performance

### Key Concepts

```typescript
// Permission Layers (from top to bottom)
1. Request Cache → In-memory cache for single request
2. Role Permissions → Based on user's role
3. Resource Ownership → User owns the resource
4. Relationships → Team members, collaborators, co-owners
5. Field Permissions → Which fields are visible/editable
```

---

## API Endpoints

> ⚠️ **Important:** The permission system is **not exposed as direct REST endpoints**. Instead, permissions are **enforced on all existing API endpoints** as middleware. The frontend needs to understand permission logic to:
> - Show/hide UI elements
> - Enable/disable actions
> - Display appropriate error messages

### Pseudo-Endpoints (Permission Checks)

While not actual HTTP endpoints, your frontend will need to implement these permission checks:

| Check Type | Description | Used For |
|------------|-------------|----------|
| `hasPermission(permission)` | Does user have this permission? | Button visibility, menu items |
| `hasAnyPermission(permissions[])` | Does user have ANY of these? | OR logic (view own OR view all) |
| `hasAllPermissions(permissions[])` | Does user have ALL of these? | AND logic (view + edit) |
| `hasResourceAccess(type, id, action)` | Can user perform action on resource? | Edit/delete buttons |
| `canReadField(resource, field)` | Can user see this field? | Form field visibility |
| `canWriteField(resource, field)` | Can user edit this field? | Input disabled state |

### User Permissions Endpoint

**GET** `/api/v1/users/me/permissions`

Get current user's permissions (derived from role + ownership).

**Headers:**
```http
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "userId": "usr_abc123",
  "role": "CREATOR",
  "permissions": [
    "creators.view_own",
    "creators.edit_own",
    "ip_assets.view_own",
    "ip_assets.create",
    "ip_assets.edit_own",
    "licenses.view_own",
    "licenses.approve"
  ]
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * User roles in the platform
 */
export type UserRole = 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';

/**
 * Permission string format: RESOURCE_ACTION_SCOPE
 * Examples: "users.view_all", "ip_assets.edit_own"
 */
export type Permission = 
  // User Management
  | 'users.view_all'
  | 'users.view_own'
  | 'users.create'
  | 'users.edit'
  | 'users.edit_own'
  | 'users.delete'
  | 'users.change_role'
  | 'users.view_sensitive'
  | 'users.manage_permissions'
  
  // Creator Management
  | 'creators.view_all'
  | 'creators.view_own'
  | 'creators.view_public'
  | 'creators.approve'
  | 'creators.reject'
  | 'creators.view_sensitive'
  | 'creators.edit_own'
  | 'creators.edit_all'
  | 'creators.view_financial'
  
  // Brand Management
  | 'brands.view_all'
  | 'brands.view_own'
  | 'brands.view_public'
  | 'brands.verify'
  | 'brands.reject'
  | 'brands.view_sensitive'
  | 'brands.edit_own'
  | 'brands.edit_all'
  | 'brands.view_financial'
  
  // IP Assets
  | 'ip_assets.view_all'
  | 'ip_assets.view_own'
  | 'ip_assets.view_public'
  | 'ip_assets.create'
  | 'ip_assets.edit_own'
  | 'ip_assets.edit_all'
  | 'ip_assets.delete_own'
  | 'ip_assets.delete_all'
  | 'ip_assets.transfer_ownership'
  | 'ip_assets.approve'
  | 'ip_assets.publish'
  | 'ip_assets.view_metadata'
  
  // Licenses
  | 'licenses.view_all'
  | 'licenses.view_own'
  | 'licenses.create'
  | 'licenses.edit_own'
  | 'licenses.edit_all'
  | 'licenses.approve'
  | 'licenses.terminate_own'
  | 'licenses.terminate_all'
  | 'licenses.view_terms'
  | 'licenses.view_financial'
  
  // Royalties
  | 'royalties.view_all'
  | 'royalties.view_own'
  | 'royalties.run'
  | 'royalties.edit'
  | 'royalties.view_statements'
  | 'royalties.dispute'
  | 'royalties.approve_dispute'
  
  // Payouts
  | 'payouts.view_all'
  | 'payouts.view_own'
  | 'payouts.process'
  | 'payouts.approve'
  | 'payouts.retry'
  
  // Projects
  | 'projects.view_all'
  | 'projects.view_own'
  | 'projects.view_public'
  | 'projects.create'
  | 'projects.edit_own'
  | 'projects.edit_all'
  | 'projects.delete_own'
  | 'projects.delete_all'
  | 'projects.archive'
  
  // Analytics
  | 'analytics.view_platform'
  | 'analytics.view_own'
  | 'analytics.view_financial'
  | 'analytics.export'
  
  // Audit Logs
  | 'audit.view_all'
  | 'audit.view_own'
  | 'audit.export'
  
  // System
  | 'system.settings'
  | 'system.feature_flags'
  | 'system.maintenance';

/**
 * Resource action types
 */
export type ResourceAction = 
  | 'view'
  | 'edit'
  | 'delete'
  | 'create'
  | 'approve'
  | 'publish';

/**
 * Resource types that support resource-level permissions
 */
export type ResourceType = 
  | 'ip_asset'
  | 'project'
  | 'creator'
  | 'brand'
  | 'license'
  | 'user';

/**
 * Permission level for field-level access
 */
export type PermissionLevel = 
  | 'PUBLIC'        // Anyone can see
  | 'AUTHENTICATED' // Logged-in users can see
  | 'OWNER'         // Only resource owner can see
  | 'COLLABORATOR'  // Owner + team members/co-owners
  | 'ADMIN';        // Admin only

/**
 * Field permission configuration
 */
export interface FieldPermissionConfig {
  read?: Permission[];   // Permissions required to read
  write?: Permission[];  // Permissions required to write
  mask?: boolean;        // Whether to mask if denied (show "***")
  maskValue?: any;       // Value to show when masked (default: null)
}

/**
 * User permission context
 */
export interface UserPermissionContext {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  creatorId?: string;  // If user has a creator profile
  brandId?: string;    // If user has a brand profile
}

/**
 * Resource access check result
 */
export interface ResourceAccessResult {
  allowed: boolean;
  reason?: 'permission' | 'ownership' | 'relationship' | 'admin';
}

/**
 * Field metadata for UI rendering
 */
export interface FieldMetadata {
  readable: boolean;  // Can user see this field?
  writable: boolean;  // Can user edit this field?
  masked: boolean;    // Is value masked (shows "***")?
}
```

### Permission Hierarchy Map

```typescript
/**
 * Permission hierarchy - higher permissions grant lower ones
 * Frontend can use this to infer permissions
 */
export const PERMISSION_HIERARCHY: Record<Permission, Permission[]> = {
  // Users
  'users.edit': ['users.view_all', 'users.view_own'],
  'users.edit_own': ['users.view_own'],
  'users.delete': ['users.view_all', 'users.edit'],
  
  // Creators
  'creators.edit_all': ['creators.view_all', 'creators.view_own'],
  'creators.edit_own': ['creators.view_own'],
  'creators.view_sensitive': ['creators.view_own'],
  
  // Brands
  'brands.edit_all': ['brands.view_all', 'brands.view_own'],
  'brands.edit_own': ['brands.view_own'],
  'brands.view_sensitive': ['brands.view_own'],
  
  // IP Assets
  'ip_assets.edit_all': ['ip_assets.view_all'],
  'ip_assets.edit_own': ['ip_assets.view_own'],
  'ip_assets.delete_all': ['ip_assets.view_all', 'ip_assets.edit_all'],
  'ip_assets.delete_own': ['ip_assets.view_own', 'ip_assets.edit_own'],
  
  // Licenses
  'licenses.edit_all': ['licenses.view_all'],
  'licenses.edit_own': ['licenses.view_own'],
  'licenses.terminate_all': ['licenses.view_all'],
  'licenses.terminate_own': ['licenses.view_own'],
  
  // Projects
  'projects.edit_all': ['projects.view_all'],
  'projects.edit_own': ['projects.view_own'],
  'projects.delete_all': ['projects.view_all', 'projects.edit_all'],
  'projects.delete_own': ['projects.view_own', 'projects.edit_own'],
  
  // Royalties
  'royalties.edit': ['royalties.view_all'],
  'royalties.run': ['royalties.view_all'],
};

/**
 * Role to permission mapping
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    // Admins have ALL permissions
    // (Include all permission strings from the Permission type)
  ],
  
  CREATOR: [
    'creators.view_own',
    'creators.view_public',
    'creators.edit_own',
    'ip_assets.view_own',
    'ip_assets.view_public',
    'ip_assets.create',
    'ip_assets.edit_own',
    'ip_assets.delete_own',
    'ip_assets.transfer_ownership',
    'licenses.view_own',
    'licenses.approve',
    'licenses.view_terms',
    'licenses.view_financial',
    'royalties.view_own',
    'royalties.view_statements',
    'royalties.dispute',
    'payouts.view_own',
    'analytics.view_own',
    'audit.view_own',
    'brands.view_own',
    'brands.view_public',
    'projects.view_public',
    'users.view_own',
    'users.edit_own',
  ],
  
  BRAND: [
    'brands.view_own',
    'brands.view_public',
    'brands.edit_own',
    'projects.view_own',
    'projects.create',
    'projects.edit_own',
    'projects.delete_own',
    'licenses.view_own',
    'licenses.create',
    'licenses.edit_own',
    'licenses.terminate_own',
    'licenses.view_terms',
    'analytics.view_own',
    'audit.view_own',
    'ip_assets.view_public',
    'creators.view_own',
    'creators.view_public',
    'projects.view_public',
    'users.view_own',
    'users.edit_own',
  ],
  
  VIEWER: [
    'ip_assets.view_public',
    'projects.view_public',
    'creators.view_own',
    'creators.view_public',
    'brands.view_own',
    'brands.view_public',
    'users.view_own',
  ],
};
```

### Field Permission Definitions

```typescript
/**
 * Field-level permissions for each resource type
 * Use this to determine which fields to show/hide in forms
 */
export const FIELD_PERMISSIONS: Record<string, Record<string, FieldPermissionConfig>> = {
  creator: {
    // Public fields
    id: { read: [] }, // No restrictions
    stageName: { read: [] },
    bio: { read: [] },
    portfolioUrl: { read: [] },
    avatarUrl: { read: [] },
    
    // Owner-only fields
    email: {
      read: ['creators.view_own', 'creators.view_all', 'creators.view_sensitive'],
      write: ['creators.edit_own', 'creators.edit_all'],
    },
    stripeAccountId: {
      read: ['creators.view_sensitive', 'creators.view_own'],
      write: ['creators.edit_own', 'creators.edit_all'],
      mask: true,
      maskValue: '***',
    },
    totalEarnings: {
      read: ['creators.view_financial', 'creators.view_own'],
      write: [],
      mask: true,
      maskValue: null,
    },
  },
  
  brand: {
    // Public fields
    id: { read: [] },
    companyName: { read: [] },
    logo: { read: [] },
    website: { read: [] },
    
    // Owner-only fields
    billingInfo: {
      read: ['brands.view_sensitive', 'brands.view_own'],
      write: ['brands.edit_own', 'brands.edit_all'],
      mask: true,
      maskValue: null,
    },
    teamMembers: {
      read: ['brands.view_sensitive', 'brands.view_own'],
      write: ['brands.edit_own', 'brands.edit_all'],
      mask: true,
      maskValue: [],
    },
  },
  
  ipAsset: {
    // Public fields
    id: { read: [] },
    title: { read: [] },
    description: { read: [] },
    thumbnailUrl: { read: [] },
    
    // Owner fields
    fileUrl: {
      read: ['ip_assets.view_own', 'ip_assets.view_all'],
      write: ['ip_assets.edit_own', 'ip_assets.edit_all'],
    },
    baseFeeCents: {
      read: ['ip_assets.view_own', 'ip_assets.view_all'],
      write: ['ip_assets.edit_own', 'ip_assets.edit_all'],
    },
  },
  
  license: {
    feeCents: {
      read: ['licenses.view_financial', 'licenses.view_own'],
      write: ['licenses.edit_own', 'licenses.edit_all'],
      mask: true,
      maskValue: null,
    },
    revShareBps: {
      read: ['licenses.view_financial', 'licenses.view_own'],
      write: ['licenses.edit_own', 'licenses.edit_all'],
      mask: true,
      maskValue: null,
    },
  },
};
```

---

## Request/Response Examples

### Example 1: Check User Permissions

**Scenario:** Frontend loads and needs to know what user can do.

```bash
# Request
curl -X GET https://ops.yesgoddess.agency/api/v1/users/me \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json"
```

```json
// Response (200 OK)
{
  "id": "usr_abc123",
  "email": "creator@example.com",
  "role": "CREATOR",
  "creator": {
    "id": "crt_xyz789",
    "stageName": "ArtistName"
  },
  "permissions": [
    "creators.view_own",
    "creators.edit_own",
    "ip_assets.view_own",
    "ip_assets.create",
    "ip_assets.edit_own",
    "licenses.view_own",
    "licenses.approve"
  ]
}
```

### Example 2: Get IP Asset (Permission-Filtered)

**Scenario:** Creator views their own asset vs another user viewing it.

```bash
# Creator viewing own asset
curl -X GET https://ops.yesgoddess.agency/api/v1/ip-assets/ast_123 \
  -H "Authorization: Bearer {creator_token}"
```

```json
// Response - Creator sees ALL fields including sensitive data
{
  "id": "ast_123",
  "title": "Cool Character Design",
  "description": "A unique character...",
  "thumbnailUrl": "https://cdn.yesgoddess.agency/...",
  "fileUrl": "https://cdn.yesgoddess.agency/full/...",  // ✅ Visible
  "baseFeeCents": 50000,  // ✅ Visible
  "metadata": { /* ... */ },  // ✅ Visible
  "creatorId": "crt_xyz789",
  "status": "PUBLISHED"
}
```

```bash
# Public user viewing same asset
curl -X GET https://ops.yesgoddess.agency/api/v1/ip-assets/ast_123 \
  -H "Authorization: Bearer {viewer_token}"
```

```json
// Response - Viewer only sees public fields
{
  "id": "ast_123",
  "title": "Cool Character Design",
  "description": "A unique character...",
  "thumbnailUrl": "https://cdn.yesgoddess.agency/...",
  // fileUrl: HIDDEN
  // baseFeeCents: HIDDEN
  // metadata: HIDDEN
  "creatorId": "crt_xyz789",
  "status": "PUBLISHED"
}
```

### Example 3: Update Brand (Field Permission Validation)

**Scenario:** Brand user tries to update their profile.

```bash
# Request - trying to update multiple fields
curl -X PATCH https://ops.yesgoddess.agency/api/v1/brands/brd_456 \
  -H "Authorization: Bearer {brand_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "New Name",
    "billingInfo": { "cardLast4": "1234" }
  }'
```

```json
// Success Response (200 OK) - User owns brand
{
  "id": "brd_456",
  "companyName": "New Name",
  "billingInfo": { "cardLast4": "1234" },
  "updatedAt": "2025-10-12T10:30:00Z"
}
```

```bash
# Request - non-owner trying to update
curl -X PATCH https://ops.yesgoddess.agency/api/v1/brands/brd_456 \
  -H "Authorization: Bearer {different_user_token}" \
  -H "Content-Type: application/json" \
  -d '{ "companyName": "Hacked" }'
```

```json
// Error Response (403 Forbidden)
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to edit this brand",
    "details": {
      "resourceType": "brand",
      "resourceId": "brd_456",
      "action": "edit",
      "reason": "ownership_required"
    }
  }
}
```

### Example 4: Delete IP Asset (Resource Permission)

```bash
# Creator deleting own asset - SUCCESS
curl -X DELETE https://ops.yesgoddess.agency/api/v1/ip-assets/ast_123 \
  -H "Authorization: Bearer {creator_token}"
```

```json
// Response (200 OK)
{
  "success": true,
  "message": "IP Asset deleted successfully",
  "id": "ast_123"
}
```

```bash
# Different creator trying to delete - FAIL
curl -X DELETE https://ops.yesgoddess.agency/api/v1/ip-assets/ast_123 \
  -H "Authorization: Bearer {other_creator_token}"
```

```json
// Response (403 Forbidden)
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to delete this ip_asset",
    "details": {
      "resourceType": "ip_asset",
      "resourceId": "ast_123",
      "action": "delete",
      "required_permission": "ip_assets.delete_own",
      "user_permissions": ["ip_assets.view_public", "ip_assets.create"]
    }
  }
}
```

### Example 5: Admin Override

```bash
# Admin deleting ANY asset - SUCCESS
curl -X DELETE https://ops.yesgoddess.agency/api/v1/ip-assets/ast_123 \
  -H "Authorization: Bearer {admin_token}"
```

```json
// Response (200 OK)
{
  "success": true,
  "message": "IP Asset deleted successfully",
  "id": "ast_123",
  "deletedBy": "ADMIN"
}
```

---

## Business Logic & Validation Rules

### Permission Hierarchy

Higher-level permissions automatically grant lower-level ones:

```typescript
// If user has 'ip_assets.edit_own', they also get:
// - 'ip_assets.view_own'

// If user has 'ip_assets.delete_own', they also get:
// - 'ip_assets.view_own'
// - 'ip_assets.edit_own'
```

**Frontend Implementation:**
```typescript
function hasPermission(
  userPermissions: Permission[],
  required: Permission
): boolean {
  // Direct permission check
  if (userPermissions.includes(required)) return true;
  
  // Check if user has a higher permission that grants this one
  for (const userPerm of userPermissions) {
    const inherited = PERMISSION_HIERARCHY[userPerm] || [];
    if (inherited.includes(required)) return true;
  }
  
  return false;
}
```

### Resource Ownership Rules

```typescript
/**
 * Resource ownership determination:
 * 
 * IP Asset: Owned by creator (via user.creator.id)
 * Project: Owned by brand (via project.brandId)
 * Brand: Owned by user (via brand.userId)
 * Creator: Owned by user (via creator.userId)
 * License: Owned by BOTH brand AND creator (co-ownership)
 */
```

### Relationship-Based Access

Users can access resources through relationships:

1. **Team Members:** Brand team members can view/edit brand projects
2. **Co-Owners:** Co-creators of an IP asset can view it
3. **Collaborators:** Brands with licenses can view asset previews

### Field-Level Rules

```typescript
/**
 * Field visibility follows this priority:
 * 1. PUBLIC → Everyone sees it
 * 2. AUTHENTICATED → Logged-in users see it
 * 3. OWNER → Only resource owner sees it
 * 4. COLLABORATOR → Owner + related users see it
 * 5. ADMIN → Only admins see it
 * 
 * If user lacks permission:
 * - mask: true → Field shows "***" or maskValue
 * - mask: false → Field is removed from response
 */
```

### Validation Rules for Frontend

#### 1. **Button Visibility**
```typescript
// Show "Delete" button only if user can delete
const canDelete = 
  user.role === 'ADMIN' || 
  (isOwner && hasPermission(userPermissions, 'ip_assets.delete_own'));

<Button 
  disabled={!canDelete}
  onClick={handleDelete}
>
  Delete
</Button>
```

#### 2. **Form Field Disabling**
```typescript
// Disable fields user can't edit
const canEditBilling = canWriteField('brand', 'billingInfo', userPermissions);

<Input
  name="billingInfo"
  disabled={!canEditBilling}
  value={formData.billingInfo}
/>
```

#### 3. **Navigation/Menu Items**
```typescript
// Show menu items based on permissions
{hasPermission(userPermissions, 'analytics.view_platform') && (
  <NavItem href="/admin/analytics">Platform Analytics</NavItem>
)}
```

#### 4. **Batch Operations**
```typescript
// Prevent bulk actions user can't perform
const canDeleteAll = hasPermission(userPermissions, 'ip_assets.delete_all');

<Button
  disabled={!canDeleteAll || selectedItems.length === 0}
  onClick={handleBulkDelete}
>
  Delete Selected ({selectedItems.length})
</Button>
```

---

## Error Handling

### Error Codes

| HTTP Status | Error Code | Description | User Message |
|-------------|------------|-------------|--------------|
| 401 | `UNAUTHORIZED` | Not authenticated | "Please log in to continue" |
| 403 | `FORBIDDEN` | Lacks permission | "You don't have permission to perform this action" |
| 403 | `RESOURCE_ACCESS_DENIED` | Can't access specific resource | "You don't have access to this resource" |
| 403 | `FIELD_PERMISSION_DENIED` | Can't modify specific fields | "You can't edit these fields: {fields}" |
| 404 | `NOT_FOUND` | Resource doesn't exist (or hidden) | "Resource not found" |

### Error Response Schema

```typescript
interface PermissionError {
  error: {
    code: 'FORBIDDEN' | 'UNAUTHORIZED';
    message: string;
    details?: {
      resourceType?: string;
      resourceId?: string;
      action?: ResourceAction;
      reason?: 'permission' | 'ownership' | 'relationship';
      required_permission?: Permission;
      user_permissions?: Permission[];
      deniedFields?: string[];
    };
  };
}
```

### Error Examples

#### 1. **Permission Denied (Generic)**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have the required permission",
    "details": {
      "required_permission": "users.view_all"
    }
  }
}
```

**Frontend Handling:**
```typescript
if (error.code === 'FORBIDDEN') {
  toast.error('You don\'t have permission to view all users');
  router.push('/dashboard');
}
```

#### 2. **Resource Access Denied**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to edit this ip_asset",
    "details": {
      "resourceType": "ip_asset",
      "resourceId": "ast_123",
      "action": "edit",
      "reason": "ownership"
    }
  }
}
```

**Frontend Handling:**
```typescript
if (error.code === 'FORBIDDEN' && error.details?.resourceType) {
  const resourceName = error.details.resourceType.replace('_', ' ');
  toast.error(`You can only ${error.details.action} your own ${resourceName}s`);
}
```

#### 3. **Field Permission Denied**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to modify the following fields: billingInfo, teamMembers",
    "details": {
      "deniedFields": ["billingInfo", "teamMembers"]
    }
  }
}
```

**Frontend Handling:**
```typescript
if (error.details?.deniedFields) {
  const fields = error.details.deniedFields.join(', ');
  toast.error(`You cannot edit: ${fields}`);
  
  // Remove denied fields from form
  setFormErrors(prev => ({
    ...prev,
    ...Object.fromEntries(
      error.details.deniedFields.map(f => [f, 'No permission to edit'])
    )
  }));
}
```

#### 4. **Not Authenticated**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**Frontend Handling:**
```typescript
if (error.code === 'UNAUTHORIZED') {
  // Redirect to login
  router.push('/login?redirect=' + encodeURIComponent(router.asPath));
}
```

### Error Handling Best Practices

```typescript
// Create a centralized error handler
export function handlePermissionError(
  error: PermissionError,
  context: { resourceType?: string; action?: string }
) {
  const { code, message, details } = error.error;
  
  switch (code) {
    case 'UNAUTHORIZED':
      toast.error('Please log in to continue');
      router.push('/login');
      break;
      
    case 'FORBIDDEN':
      if (details?.deniedFields) {
        toast.error(`Cannot edit: ${details.deniedFields.join(', ')}`);
      } else if (details?.resourceType) {
        toast.error(
          `You don't have permission to ${details.action} this ${details.resourceType}`
        );
      } else {
        toast.error('You don\'t have permission to perform this action');
      }
      break;
      
    default:
      toast.error(message || 'An error occurred');
  }
}

// Usage in API calls
try {
  await api.ipAssets.delete(assetId);
} catch (error) {
  handlePermissionError(error, {
    resourceType: 'IP Asset',
    action: 'delete'
  });
}
```

---

## Authorization & Permissions

### Role Capabilities Matrix

| Feature | ADMIN | CREATOR | BRAND | VIEWER |
|---------|-------|---------|-------|--------|
| **IP Assets** |
| View public assets | ✅ | ✅ | ✅ | ✅ |
| View all assets | ✅ | ❌ | ❌ | ❌ |
| Create assets | ✅ | ✅ | ❌ | ❌ |
| Edit own assets | ✅ | ✅ | ❌ | ❌ |
| Edit any assets | ✅ | ❌ | ❌ | ❌ |
| Delete own assets | ✅ | ✅ | ❌ | ❌ |
| Delete any assets | ✅ | ❌ | ❌ | ❌ |
| **Licenses** |
| View own licenses | ✅ | ✅ | ✅ | ❌ |
| Create licenses | ✅ | ❌ | ✅ | ❌ |
| Approve licenses | ✅ | ✅ | ❌ | ❌ |
| View financial terms | ✅ | ✅ | ✅ | ❌ |
| **Projects** |
| View public projects | ✅ | ✅ | ✅ | ✅ |
| Create projects | ✅ | ❌ | ✅ | ❌ |
| Edit own projects | ✅ | ❌ | ✅ | ❌ |
| Delete own projects | ✅ | ❌ | ✅ | ❌ |
| **Royalties** |
| View own royalties | ✅ | ✅ | ❌ | ❌ |
| View all royalties | ✅ | ❌ | ❌ | ❌ |
| Run calculations | ✅ | ❌ | ❌ | ❌ |
| Dispute royalties | ✅ | ✅ | ❌ | ❌ |
| **Admin** |
| View audit logs | ✅ | ❌ | ❌ | ❌ |
| System settings | ✅ | ❌ | ❌ | ❌ |
| Change user roles | ✅ | ❌ | ❌ | ❌ |

### Resource-Level Permission Matrix

| Resource Type | View Own | View All | Edit Own | Edit All | Delete Own | Delete All |
|---------------|----------|----------|----------|----------|------------|------------|
| IP Assets | Creator | Admin | Creator | Admin | Creator | Admin |
| Projects | Brand | Admin | Brand | Admin | Brand | Admin |
| Licenses | Both* | Admin | Both* | Admin | Both* | Admin |
| Royalties | Creator | Admin | - | Admin | - | - |
| Payouts | Creator | Admin | - | Admin | - | - |

_* "Both" means both Brand (licensee) and Creator (asset owner) can access_

### Field-Level Permissions by Resource

#### Creator Profile
| Field | Public | Authenticated | Owner | Admin |
|-------|--------|---------------|-------|-------|
| stageName | ✅ | ✅ | ✅ | ✅ |
| bio | ✅ | ✅ | ✅ | ✅ |
| email | ❌ | ❌ | ✅ | ✅ |
| stripeAccountId | ❌ | ❌ | ✅ (masked) | ✅ |
| totalEarnings | ❌ | ❌ | ✅ | ✅ |
| verificationStatus | ❌ | ✅ | ✅ | ✅ |

#### Brand Profile
| Field | Public | Authenticated | Owner | Admin |
|-------|--------|---------------|-------|-------|
| companyName | ✅ | ✅ | ✅ | ✅ |
| website | ✅ | ✅ | ✅ | ✅ |
| billingInfo | ❌ | ❌ | ✅ | ✅ |
| teamMembers | ❌ | ❌ | ✅ | ✅ |
| totalSpent | ❌ | ❌ | ✅ | ✅ |

#### IP Asset
| Field | Public | Owner | Collaborator* | Admin |
|-------|--------|-------|---------------|-------|
| title | ✅ | ✅ | ✅ | ✅ |
| thumbnailUrl | ✅ | ✅ | ✅ | ✅ |
| fileUrl | ❌ | ✅ | ❌ | ✅ |
| baseFeeCents | ❌ | ✅ | ❌ | ✅ |
| metadata | ❌ | ✅ | ❌ | ✅ |

_* Collaborator = Brands with active licenses_

---

## Rate Limiting & Quotas

### Rate Limits

The Permission System itself does **not have separate rate limits**. Rate limits are applied at the **API endpoint level**:

| Endpoint Type | Rate Limit | Window | Scope |
|---------------|------------|--------|-------|
| All API endpoints | 1000 requests | 15 minutes | Per user |
| Permission-heavy (list all) | 100 requests | 15 minutes | Per user |

### Rate Limit Headers

All API responses include these headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1697123456
```

### Rate Limit Exceeded Response

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 120,  // seconds
      "limit": 1000,
      "window": "15 minutes"
    }
  }
}
```

### Frontend Handling

```typescript
// Check rate limit headers before making next request
const handleRateLimitHeaders = (response: Response) => {
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
  const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '1000');
  
  if (remaining < limit * 0.1) {
    toast.warning('You\'re approaching the rate limit. Slow down!');
  }
};

// Handle rate limit errors
if (error.code === 'RATE_LIMIT_EXCEEDED') {
  const retryAfter = error.details.retryAfter;
  toast.error(`Too many requests. Try again in ${retryAfter} seconds`);
  
  // Disable actions temporarily
  setTimeout(() => {
    window.location.reload();
  }, retryAfter * 1000);
}
```

---

## Caching Strategy

The backend uses **multi-tier caching** for permissions. Frontend should implement **local caching** to minimize API calls.

### Backend Caching (FYI)

1. **Request-Level Cache:** In-memory for single request (automatic)
2. **Redis Cache:** 5-minute TTL for user permissions
3. **Resource Cache:** 5-minute TTL for resource ownership checks

### Frontend Caching Recommendations

#### 1. **User Permissions (Session Storage)**

```typescript
// Cache user permissions for the session
const useUserPermissions = () => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  
  useEffect(() => {
    const cached = sessionStorage.getItem('user_permissions');
    if (cached) {
      setPermissions(JSON.parse(cached));
    } else {
      fetchUserPermissions().then(perms => {
        setPermissions(perms);
        sessionStorage.setItem('user_permissions', JSON.stringify(perms));
      });
    }
  }, []);
  
  return permissions;
};
```

#### 2. **Resource Access (React Query)**

```typescript
// Cache resource access checks with React Query
const useResourceAccess = (
  resourceType: string,
  resourceId: string,
  action: ResourceAction
) => {
  return useQuery({
    queryKey: ['resource_access', resourceType, resourceId, action],
    queryFn: () => checkResourceAccess(resourceType, resourceId, action),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};
```

#### 3. **Field Permissions (Computed)**

```typescript
// Compute field permissions client-side (no API call needed)
const useFieldPermissions = (
  resourceType: string,
  userPermissions: Permission[]
) => {
  return useMemo(() => {
    const fields = FIELD_PERMISSIONS[resourceType] || {};
    const metadata: Record<string, FieldMetadata> = {};
    
    for (const [field, config] of Object.entries(fields)) {
      metadata[field] = {
        readable: canReadField(resourceType, field, userPermissions),
        writable: canWriteField(resourceType, field, userPermissions),
        masked: config.mask && !canReadField(resourceType, field, userPermissions),
      };
    }
    
    return metadata;
  }, [resourceType, userPermissions]);
};
```

#### 4. **Cache Invalidation**

```typescript
// Invalidate permission cache when:
// 1. User role changes
// 2. User logs out
// 3. Resource ownership changes

const invalidatePermissionCache = () => {
  sessionStorage.removeItem('user_permissions');
  queryClient.invalidateQueries({ queryKey: ['resource_access'] });
};

// Call on logout
const handleLogout = () => {
  invalidatePermissionCache();
  // ... rest of logout logic
};
```

---

## Frontend Implementation Checklist

### Phase 1: Setup & Infrastructure

- [ ] **Install Dependencies**
  ```bash
  npm install @tanstack/react-query zustand
  ```

- [ ] **Create Type Definitions**
  - [ ] Copy all TypeScript types from this guide
  - [ ] Create `types/permissions.ts`
  - [ ] Create `constants/permissions.ts` with ROLE_PERMISSIONS, FIELD_PERMISSIONS

- [ ] **Create Permission Context**
  ```typescript
  // contexts/PermissionContext.tsx
  const PermissionContext = createContext<UserPermissionContext | null>(null);
  ```

- [ ] **Create Permission Hooks**
  - [ ] `usePermissions()` - Get current user's permissions
  - [ ] `useHasPermission(permission)` - Check single permission
  - [ ] `useHasAnyPermission(permissions[])` - Check multiple (OR)
  - [ ] `useHasAllPermissions(permissions[])` - Check multiple (AND)
  - [ ] `useResourceAccess(type, id, action)` - Check resource access
  - [ ] `useFieldPermissions(resourceType)` - Get field metadata

### Phase 2: Core Components

- [ ] **Create Permission-Aware Components**
  - [ ] `<PermissionGate required={permission}>` - Conditional rendering
  - [ ] `<ResourceGate resource={...}>` - Resource-level gate
  - [ ] `<FieldGate field={...}>` - Field-level gate

  ```typescript
  // Example usage
  <PermissionGate required="ip_assets.create">
    <Button>Create Asset</Button>
  </PermissionGate>
  ```

- [ ] **Create Permission Utilities**
  - [ ] `hasPermission(userPerms, required)` - With hierarchy support
  - [ ] `expandPermission(permission)` - Get implied permissions
  - [ ] `canReadField(resource, field, perms)` - Field read check
  - [ ] `canWriteField(resource, field, perms)` - Field write check

### Phase 3: API Integration

- [ ] **Create API Client Layer**
  - [ ] Add permission headers to all requests
  - [ ] Handle 401/403 errors globally
  - [ ] Parse permission error responses

- [ ] **Create Permission API Endpoints**
  - [ ] `GET /users/me` - Fetch current user with permissions
  - [ ] Integrate permissions into existing endpoints

- [ ] **Create Error Handlers**
  - [ ] `handlePermissionError(error)` - Centralized error handling
  - [ ] Show user-friendly error messages
  - [ ] Redirect on auth errors

### Phase 4: UI Implementation

- [ ] **Implement Navigation Guards**
  - [ ] Hide menu items user can't access
  - [ ] Disable links based on permissions
  - [ ] Redirect if accessing unauthorized page

- [ ] **Implement Button/Action Guards**
  - [ ] Show/hide action buttons
  - [ ] Disable buttons (don't hide if user should know it exists)
  - [ ] Show tooltips explaining why disabled

- [ ] **Implement Form Field Guards**
  - [ ] Disable fields user can't edit
  - [ ] Hide sensitive fields user can't see
  - [ ] Mask fields with `***` when appropriate

- [ ] **Implement List/Table Guards**
  - [ ] Filter items user can't see
  - [ ] Disable bulk actions
  - [ ] Show/hide action columns

### Phase 5: Advanced Features

- [ ] **Implement Optimistic UI Updates**
  ```typescript
  // Before API call, check if user likely has permission
  if (!hasPermission(userPermissions, 'ip_assets.delete_own')) {
    toast.error('You cannot delete this asset');
    return;
  }
  
  // Then make API call
  await api.ipAssets.delete(id);
  ```

- [ ] **Implement Field Masking**
  ```typescript
  // Show masked values for sensitive fields
  const displayValue = fieldMetadata.masked ? '***' : actualValue;
  ```

- [ ] **Add Permission Debugging**
  ```typescript
  // Dev-only permission debugging panel
  if (process.env.NODE_ENV === 'development') {
    console.log('User Permissions:', userPermissions);
    console.log('Required:', requiredPermission);
    console.log('Has Access:', hasAccess);
  }
  ```

### Phase 6: Testing

- [ ] **Write Unit Tests**
  - [ ] Test `hasPermission()` with hierarchy
  - [ ] Test `canReadField()` and `canWriteField()`
  - [ ] Test permission context

- [ ] **Write Integration Tests**
  - [ ] Test permission gates with different roles
  - [ ] Test error handling for 403 responses
  - [ ] Test field visibility logic

- [ ] **Manual Testing**
  - [ ] Test as each role (ADMIN, CREATOR, BRAND, VIEWER)
  - [ ] Verify field masking works
  - [ ] Verify ownership checks work
  - [ ] Verify error messages are user-friendly

---

## Testing Scenarios

### Scenario 1: Creator Uploads IP Asset

**Setup:**
- User role: CREATOR
- User has creator profile

**Test Steps:**
1. Navigate to "Upload Asset" page
2. Verify upload form is visible (permission: `ip_assets.create`)
3. Fill out form with title, description, file
4. Submit form
5. Verify asset created successfully
6. Navigate to asset detail page
7. Verify user can see ALL fields (owner)
8. Verify "Edit" and "Delete" buttons are visible

**Expected Results:**
- ✅ Upload form visible
- ✅ Asset created with creator as owner
- ✅ User can see sensitive fields (fileUrl, baseFeeCents)
- ✅ Edit/Delete buttons enabled

### Scenario 2: Viewer Tries to Delete Asset

**Setup:**
- User role: VIEWER
- Asset owned by different creator

**Test Steps:**
1. Navigate to public asset page
2. Verify "Delete" button is hidden/disabled
3. Try to call DELETE endpoint directly via API
4. Verify 403 error returned

**Expected Results:**
- ✅ Delete button not visible to viewer
- ✅ API returns 403 FORBIDDEN
- ✅ Error message: "You don't have permission to delete this ip_asset"

### Scenario 3: Brand Views License Financial Terms

**Setup:**
- User role: BRAND
- Brand has active license with creator

**Test Steps:**
1. Navigate to "My Licenses" page
2. Verify license list is visible (permission: `licenses.view_own`)
3. Click on a license
4. Verify financial fields are visible:
   - `feeCents`
   - `revShareBps`
5. Verify user is owner of the license brand

**Expected Results:**
- ✅ License list shows user's brand licenses
- ✅ Financial terms visible (feeCents, revShareBps)
- ✅ User cannot edit terms (no `licenses.edit_own` on financial fields)

### Scenario 4: Creator Approves License

**Setup:**
- User role: CREATOR
- Brand has proposed license for creator's asset

**Test Steps:**
1. Navigate to "Pending Approvals" page
2. Verify license request is visible
3. Click "Approve" button
4. Verify button is enabled (permission: `licenses.approve`)
5. Approve the license
6. Verify license status changes to ACTIVE

**Expected Results:**
- ✅ Pending license visible
- ✅ Approve button enabled for creator
- ✅ License approved successfully
- ✅ Status updated to ACTIVE

### Scenario 5: Admin Edits Any User

**Setup:**
- User role: ADMIN

**Test Steps:**
1. Navigate to "Users" admin page
2. Verify all users are visible (permission: `users.view_all`)
3. Select any user
4. Click "Edit"
5. Verify all fields are editable
6. Change user's role
7. Save changes

**Expected Results:**
- ✅ Admin can see all users
- ✅ Admin can edit any user
- ✅ Admin can change roles (permission: `users.change_role`)
- ✅ Changes saved successfully

### Scenario 6: Field Masking for Sensitive Data

**Setup:**
- User A (CREATOR) viewing User B's creator profile
- User A does NOT have `creators.view_sensitive`

**Test Steps:**
1. Navigate to User B's public profile
2. Verify public fields are visible:
   - stageName
   - bio
   - portfolioUrl
3. Verify sensitive fields are masked:
   - email → Hidden
   - stripeAccountId → "***"
   - totalEarnings → null or not shown

**Expected Results:**
- ✅ Public fields visible
- ✅ Email field not in response
- ✅ stripeAccountId shows "***"
- ✅ totalEarnings is null or hidden

### Scenario 7: Team Member Access to Brand Projects

**Setup:**
- User role: BRAND
- User is team member of Brand A (not owner)
- Brand A has Project X

**Test Steps:**
1. Navigate to Brand A's projects
2. Verify team member can see Project X
3. Try to edit Project X
4. Verify edit succeeds (team member relationship grants access)

**Expected Results:**
- ✅ Team member can view brand's projects
- ✅ Team member can edit projects (via relationship)
- ✅ Non-team-members cannot access

### Scenario 8: Permission Hierarchy - Delete Implies View

**Setup:**
- User has `ip_assets.delete_own` permission

**Test Steps:**
1. Check if user has `ip_assets.view_own` permission
2. Verify hierarchy grants view permission

**Expected Results:**
- ✅ User with delete_own also gets view_own
- ✅ User with delete_own also gets edit_own
- ✅ Hierarchy correctly expanded

### Scenario 9: Rate Limit Handling

**Setup:**
- Make 1000+ requests in 15 minutes

**Test Steps:**
1. Make 1000 API requests
2. Check rate limit headers
3. Make 1001st request
4. Verify 429 error returned
5. Verify retry-after header present

**Expected Results:**
- ✅ First 1000 requests succeed
- ✅ Rate limit headers show remaining = 0
- ✅ 1001st request returns 429
- ✅ Error message shows retry time

### Scenario 10: Cache Invalidation on Role Change

**Setup:**
- User role: CREATOR
- Admin changes user role to ADMIN

**Test Steps:**
1. User navigates to admin panel (should be forbidden)
2. Admin changes user's role to ADMIN
3. User refreshes page
4. Verify user now sees admin panel

**Expected Results:**
- ✅ Initially no access to admin features
- ✅ After role change, cache invalidated
- ✅ New permissions loaded
- ✅ Admin features now visible

---

## Additional Resources

### Backend Documentation
- [Permission System README](/docs/infrastructure/permissions/README.md)
- [Permission Quick Reference](/docs/infrastructure/permissions/QUICK_REFERENCE.md)
- [Row-Level Security](/docs/middleware/ROW_LEVEL_SECURITY.md)

### Code Examples
- See `/src/lib/constants/permissions.ts` for all permission definitions
- See `/src/lib/services/permission.service.ts` for permission logic
- See `/src/lib/middleware/permissions.ts` for tRPC middleware examples

### Support
- Backend Developer: [Your Contact]
- Documentation Issues: [GitHub Issues]
- Slack Channel: #yesgoddess-dev

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-12 | Initial version - Complete permission system integration guide |

---

**End of Document**
