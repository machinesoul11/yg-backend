# Permission System Implementation

## Overview

The YES GODDESS platform implements a comprehensive, multi-layered permission system that provides:

1. **Role-Based Access Control (RBAC)** - Broad permissions based on user roles
2. **Resource-Level Permissions** - Fine-grained access control based on resource ownership
3. **Field-Level Permissions** - Control over which fields users can view or modify
4. **Permission Inheritance** - Hierarchical permissions that automatically grant related permissions
5. **Performance Caching** - Multi-tier caching for optimal performance

## Architecture

### Permission Layers

```
┌─────────────────────────────────────────────────────┐
│                  Request Layer                       │
│  (Request-level caching for same permission checks)  │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                Role-Based Permissions                │
│     (ADMIN, CREATOR, BRAND, VIEWER roles)           │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│              Resource-Level Permissions              │
│  (Ownership & relationship-based access control)    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│               Field-Level Permissions                │
│    (Control read/write access to specific fields)   │
└─────────────────────────────────────────────────────┘
```

## Components

### 1. Permission Constants (`src/lib/constants/permissions.ts`)

Defines all platform permissions organized by resource type:

```typescript
import { PERMISSIONS } from '@/lib/constants/permissions';

// User management permissions
PERMISSIONS.USERS_VIEW_ALL      // View all user accounts
PERMISSIONS.USERS_VIEW_OWN      // View own account
PERMISSIONS.USERS_EDIT_OWN      // Edit own account
PERMISSIONS.USERS_EDIT          // Edit any account
PERMISSIONS.USERS_VIEW_SENSITIVE // View sensitive data

// IP Assets permissions
PERMISSIONS.IP_ASSETS_VIEW_ALL  // View all assets
PERMISSIONS.IP_ASSETS_VIEW_OWN  // View own assets
PERMISSIONS.IP_ASSETS_CREATE    // Create new assets
PERMISSIONS.IP_ASSETS_EDIT_OWN  // Edit own assets
PERMISSIONS.IP_ASSETS_EDIT_ALL  // Edit any asset
// ... and more
```

#### Permission Hierarchy

Higher-level permissions automatically grant lower-level ones:

```typescript
// If user has USERS_EDIT, they automatically get:
// - USERS_VIEW_ALL
// - USERS_VIEW_OWN

// If user has IP_ASSETS_DELETE_OWN, they automatically get:
// - IP_ASSETS_VIEW_OWN
// - IP_ASSETS_EDIT_OWN
```

### 2. Permission Service (`src/lib/services/permission.service.ts`)

Core service for permission checking with caching:

```typescript
import { permissionService } from '@/lib/services/permission.service';

// Check single permission
const canView = await permissionService.hasPermission(
  userId,
  PERMISSIONS.USERS_VIEW_ALL
);

// Check multiple permissions (ANY)
const canAccess = await permissionService.hasAnyPermission(
  userId,
  [PERMISSIONS.USERS_VIEW_ALL, PERMISSIONS.USERS_VIEW_OWN]
);

// Check multiple permissions (ALL)
const canManage = await permissionService.hasAllPermissions(
  userId,
  [PERMISSIONS.USERS_VIEW_ALL, PERMISSIONS.USERS_EDIT]
);

// Throw if permission denied
await permissionService.checkPermission(
  userId,
  PERMISSIONS.USERS_DELETE
);
```

### 3. Resource-Level Permissions

Check access based on ownership and relationships:

```typescript
// Check if user can edit a specific project
const canEdit = await permissionService.hasResourceAccess(
  userId,
  'project',
  projectId,
  'edit'
);

// Throw if access denied
await permissionService.checkResourceAccess(
  userId,
  'ip_asset',
  assetId,
  'delete'
);
```

**How it works:**
1. Checks if user is ADMIN (automatic access)
2. Checks if user owns the resource
3. Checks if user has relationship to resource (e.g., team member, co-owner)
4. Maps ownership + action to required permission
5. Verifies user's role has that permission

### 4. Field-Level Permissions (`src/lib/utils/field-permissions.ts`)

Control which fields users can view or modify:

```typescript
import { 
  filterFieldsByPermissions,
  canReadField,
  canWriteField,
  validateFieldWrites
} from '@/lib/utils/field-permissions';

// Filter object to only include fields user can see
const filtered = filterFieldsByPermissions(
  user,
  'user',
  userPermissions
);
// If user doesn't have USERS_VIEW_SENSITIVE:
// - email might be masked as "***"
// - password_hash is removed entirely

// Check specific field access
if (canReadField('license', 'feeCents', permissions)) {
  // Show financial data
}

// Validate bulk updates
const invalidFields = validateFieldWrites(
  'brand',
  { companyName: 'New Name', billingInfo: {...} },
  permissions
);
// Returns ['billingInfo'] if user lacks permission
```

### 5. tRPC Middleware (`src/lib/middleware/permissions.ts`)

Reusable middleware for tRPC procedures:

```typescript
import { 
  requirePermission,
  requireAnyPermission,
  requireResourceAccess 
} from '@/lib/middleware/permissions';

// Require single permission
export const usersRouter = createTRPCRouter({
  listAll: protectedProcedure
    .use(requirePermission(PERMISSIONS.USERS_VIEW_ALL))
    .query(async ({ ctx }) => {
      // Only executes if user has permission
      return await prisma.user.findMany();
    }),

  // Require any of multiple permissions
  listProjects: protectedProcedure
    .use(requireAnyPermission([
      PERMISSIONS.PROJECTS_VIEW_ALL,
      PERMISSIONS.PROJECTS_VIEW_OWN
    ]))
    .query(async ({ ctx }) => {
      // User needs at least one of these permissions
    }),

  // Resource-level permission
  deleteProject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .use(requireResourceAccess('project', 'delete', (input) => input.id))
    .mutation(async ({ input }) => {
      // Only executes if user owns project or is admin
      await prisma.project.delete({ where: { id: input.id } });
    }),
});
```

## Performance Optimization

### Multi-Tier Caching

1. **Request-Level Cache** - Memoizes permission checks within a single request
2. **Redis Cache** - Stores user permissions for 5 minutes
3. **Resource Permission Cache** - Caches resource-level access checks

```typescript
// Initialize at request start
permissionService.initRequestCache();

// First check - queries database & caches
await permissionService.hasPermission(userId, PERMISSIONS.USERS_VIEW_ALL);

// Second check in same request - uses request cache (instant)
await permissionService.hasPermission(userId, PERMISSIONS.USERS_VIEW_ALL);

// Clean up at request end
permissionService.clearRequestCache();
```

### Cache Invalidation

```typescript
// When user role changes
await permissionService.invalidateUserPermissions(userId);

// When resource ownership changes
await permissionService.invalidateResourcePermissions('project', projectId);
```

## Usage Examples

### Example 1: Role-Based API Endpoint

```typescript
export const brandRouter = createTRPCRouter({
  verify: protectedProcedure
    .use(requirePermission(PERMISSIONS.BRANDS_VERIFY))
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ input }) => {
      // Only ADMIN users have BRANDS_VERIFY permission
      return await brandService.verify(input.brandId);
    }),
});
```

### Example 2: Resource-Level Protection

```typescript
export const ipAssetsRouter = createTRPCRouter({
  update: protectedProcedure
    .input(updateAssetSchema)
    .use(requireResourceAccess('ip_asset', 'edit', (input) => input.id))
    .mutation(async ({ ctx, input }) => {
      // User must either:
      // - Own the asset (creator who uploaded it)
      // - Be a co-owner (via ip_ownerships table)
      // - Be an ADMIN
      return await ipAssetService.update(input.id, input.data);
    }),
});
```

### Example 3: Field-Level Filtering

```typescript
export const licenseRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const license = await prisma.license.findUnique({
        where: { id: input.id },
      });

      // Filter fields based on user permissions
      const filtered = await permissionService.filterObjectFields(
        license,
        'license',
        ctx.session.user.id
      );

      // If user doesn't have LICENSES_VIEW_FINANCIAL:
      // - feeCents will be null
      // - revShareBps will be null
      return filtered;
    }),
});
```

### Example 4: Field Validation on Updates

```typescript
export const brandRouter = createTRPCRouter({
  update: protectedProcedure
    .input(updateBrandSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate user can modify the fields they're trying to update
      await permissionService.validateFieldUpdates(
        'brand',
        input.data,
        ctx.session.user.id
      );

      // If user tries to update billingInfo without permission, throws:
      // "You do not have permission to modify the following fields: billingInfo"

      return await brandService.update(input.id, input.data);
    }),
});
```

## Permission Definitions

### Admin Role
- Has ALL permissions
- Unrestricted access to all resources and fields

### Creator Role
Can:
- Manage own IP assets (create, edit, delete)
- View and approve licenses for own assets
- View own royalty statements
- Dispute royalty calculations
- Transfer asset ownership
- View public brand and project information

Cannot:
- View other creators' assets
- Edit platform settings
- Access admin analytics
- Process payouts

### Brand Role
Can:
- Create and manage own projects
- Create license proposals
- View and manage own licenses
- View own analytics
- Manage brand team members
- View public creator profiles

Cannot:
- View other brands' projects
- Access creator financial data
- Approve licenses (only creators can)
- Access admin features

### Viewer Role
Can:
- View public IP assets
- View public projects
- View public creator profiles
- View own profile

Cannot:
- Create any content
- Access financial data
- Modify any resources

## Best Practices

### 1. Use the Most Specific Permission

```typescript
// ❌ Too broad
await permissionService.checkPermission(userId, PERMISSIONS.USERS_VIEW_ALL);

// ✅ More specific
await permissionService.checkPermission(userId, PERMISSIONS.USERS_VIEW_SENSITIVE);
```

### 2. Combine Permission Layers

```typescript
// Check both role permission AND resource ownership
export const deleteAssetProcedure = protectedProcedure
  .use(requireResourceAccess('ip_asset', 'delete', (input) => input.id))
  .mutation(async ({ input }) => {
    // Already verified user can delete this specific asset
    await ipAssetService.delete(input.id);
  });
```

### 3. Filter Sensitive Data

```typescript
// Always filter output based on permissions
const user = await prisma.user.findUnique({ where: { id } });
return await permissionService.filterObjectFields(user, 'user', requesterId);
```

### 4. Validate Field Updates

```typescript
// Before updating, validate field permissions
await permissionService.validateFieldUpdates('license', input, userId);
await prisma.license.update({ where: { id }, data: input });
```

### 5. Invalidate Caches Appropriately

```typescript
// After changing user role
await permissionService.invalidateUserPermissions(userId);

// After transferring resource ownership
await permissionService.invalidateResourcePermissions('ip_asset', assetId);
```

## Testing Permission System

```typescript
import { permissionService } from '@/lib/services/permission.service';
import { PERMISSIONS } from '@/lib/constants/permissions';

describe('Permission System', () => {
  it('should allow creator to view own assets', async () => {
    const canView = await permissionService.hasResourceAccess(
      creatorUserId,
      'ip_asset',
      creatorAssetId,
      'view'
    );
    expect(canView).toBe(true);
  });

  it('should deny creator from viewing other assets', async () => {
    const canView = await permissionService.hasResourceAccess(
      creatorUserId,
      'ip_asset',
      otherCreatorAssetId,
      'view'
    );
    expect(canView).toBe(false);
  });

  it('should filter sensitive fields', async () => {
    const brand = { companyName: 'ACME', billingInfo: {...} };
    const filtered = await permissionService.filterObjectFields(
      brand,
      'brand',
      viewerUserId
    );
    expect(filtered.billingInfo).toBeNull(); // Masked for viewer
  });
});
```

## Migration Guide

For existing endpoints, gradually add permission checks:

```typescript
// Before
export const updateProject = protectedProcedure
  .mutation(async ({ ctx, input }) => {
    // Anyone authenticated can update any project ❌
    return await projectService.update(input.id, input.data);
  });

// After
export const updateProject = protectedProcedure
  .use(requireResourceAccess('project', 'edit', (input) => input.id))
  .mutation(async ({ ctx, input }) => {
    // Only project owner or admin can update ✅
    return await projectService.update(input.id, input.data);
  });
```

## Security Considerations

1. **Default Deny** - If no permission is defined, access is denied
2. **Audit Logging** - All permission denials are logged for security monitoring
3. **No Client-Side Trust** - All permission checks happen server-side
4. **Cache Safety** - Caches are invalidated on permission changes
5. **Field Masking** - Sensitive data is masked, not removed, to prevent information leakage

## Troubleshooting

### Permission Denied Errors

Check:
1. User's role has the required permission
2. Permission hierarchy is correctly configured
3. Resource ownership is correctly determined
4. Cache is not stale (try invalidating)

### Performance Issues

Solutions:
1. Ensure request-level caching is initialized
2. Check Redis cache hit rate
3. Review database indexes for ownership queries
4. Consider preloading permissions for batch operations

### Field Not Filtering

Verify:
1. Field is defined in FIELD_PERMISSIONS
2. Permission requirements are correct
3. User's permissions are being passed correctly
4. filterFieldsByPermissions is being called
