# Permission System - Quick Reference

## Common Permission Checks

### In tRPC Procedures

```typescript
import { requirePermission, requireResourceAccess } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/lib/constants/permissions';

// Simple permission check
const myProcedure = protectedProcedure
  .use(requirePermission(PERMISSIONS.USERS_VIEW_ALL))
  .query(async ({ ctx }) => { /* ... */ });

// Resource-level check
const deleteProcedure = protectedProcedure
  .input(z.object({ id: z.string() }))
  .use(requireResourceAccess('project', 'delete', (input) => input.id))
  .mutation(async ({ input }) => { /* ... */ });
```

### In Service Layer

```typescript
import { permissionService } from '@/lib/services/permission.service';
import { PERMISSIONS } from '@/lib/constants/permissions';

// Check permission
const canView = await permissionService.hasPermission(
  userId,
  PERMISSIONS.USERS_VIEW_ALL
);

// Throw if denied
await permissionService.checkPermission(
  userId,
  PERMISSIONS.USERS_DELETE
);

// Resource check
const canEdit = await permissionService.hasResourceAccess(
  userId,
  'ip_asset',
  assetId,
  'edit'
);
```

### Field Filtering

```typescript
import { filterFieldsByPermissions } from '@/lib/utils/field-permissions';

// Get user permissions
const permissions = await permissionService.getUserPermissions(userId);

// Filter object
const filtered = filterFieldsByPermissions(
  sensitiveObject,
  'license',
  permissions
);

// Or use service method
const filtered = await permissionService.filterObjectFields(
  sensitiveObject,
  'license',
  userId
);
```

### Field Validation

```typescript
// Validate before update
await permissionService.validateFieldUpdates(
  'brand',
  { companyName: 'New Name', billingInfo: {...} },
  userId
);
// Throws if user lacks permission for any field
```

## Permission Patterns by Resource

### Users
- `USERS_VIEW_ALL` - Admin only
- `USERS_VIEW_OWN` - Everyone for their own profile
- `USERS_EDIT_OWN` - Update own profile
- `USERS_EDIT` - Admin to edit any user
- `USERS_VIEW_SENSITIVE` - Admin to see emails, etc.

### Creators
- `CREATORS_VIEW_OWN` - Creators view their own profile
- `CREATORS_VIEW_PUBLIC` - Everyone can see public profiles
- `CREATORS_EDIT_OWN` - Update own profile
- `CREATORS_APPROVE` - Admin only
- `CREATORS_VIEW_FINANCIAL` - Admin and creator (own)

### IP Assets
- `IP_ASSETS_CREATE` - Creators can create
- `IP_ASSETS_VIEW_OWN` - Creators see own assets
- `IP_ASSETS_EDIT_OWN` - Edit own assets
- `IP_ASSETS_DELETE_OWN` - Delete own assets
- `IP_ASSETS_VIEW_ALL` - Admin sees all
- `IP_ASSETS_APPROVE` - Admin approves for publication

### Licenses
- `LICENSES_CREATE` - Brands create proposals
- `LICENSES_VIEW_OWN` - View own licenses
- `LICENSES_APPROVE` - Creators approve licenses
- `LICENSES_VIEW_FINANCIAL` - See fee/revenue share

### Projects
- `PROJECTS_CREATE` - Brands create projects
- `PROJECTS_VIEW_OWN` - Brand sees own projects
- `PROJECTS_EDIT_OWN` - Edit own projects
- `PROJECTS_VIEW_PUBLIC` - Everyone sees public projects

## Role Capabilities Matrix

| Permission | ADMIN | CREATOR | BRAND | VIEWER |
|-----------|-------|---------|-------|--------|
| View all users | ✅ | ❌ | ❌ | ❌ |
| View own profile | ✅ | ✅ | ✅ | ✅ |
| Create IP assets | ✅ | ✅ | ❌ | ❌ |
| View own assets | ✅ | ✅ | ❌ | ❌ |
| View public assets | ✅ | ✅ | ✅ | ✅ |
| Create projects | ✅ | ❌ | ✅ | ❌ |
| Create licenses | ✅ | ❌ | ✅ | ❌ |
| Approve licenses | ✅ | ✅* | ❌ | ❌ |
| View royalties | ✅ | ✅* | ❌ | ❌ |
| Process payouts | ✅ | ❌ | ❌ | ❌ |

*Only for own assets

## Cache Management

```typescript
// Invalidate user permissions (e.g., after role change)
await permissionService.invalidateUserPermissions(userId);

// Invalidate resource access (e.g., after ownership transfer)
await permissionService.invalidateResourcePermissions('project', projectId);

// Request-level cache (in middleware)
permissionService.initRequestCache();
// ... handle request ...
permissionService.clearRequestCache();
```

## Common Patterns

### Owner or Admin Pattern
```typescript
const canAccess = await permissionService.hasResourceAccess(
  userId,
  'ip_asset',
  assetId,
  'edit'
);
// Returns true if: user owns asset OR user is admin
```

### Multiple Permission Check (OR)
```typescript
const canView = await permissionService.hasAnyPermission(userId, [
  PERMISSIONS.PROJECTS_VIEW_ALL,
  PERMISSIONS.PROJECTS_VIEW_OWN
]);
```

### Multiple Permission Check (AND)
```typescript
const canManage = await permissionService.hasAllPermissions(userId, [
  PERMISSIONS.PAYOUTS_VIEW_ALL,
  PERMISSIONS.PAYOUTS_PROCESS
]);
```

### Field Masking
```typescript
// Sensitive fields are masked (not removed)
const filtered = filterFieldsByPermissions(user, 'creator', permissions);
// Result: { stripeAccountId: '***', totalEarnings: null, ... }
```

## Error Messages

### Permission Denied
```
code: 'FORBIDDEN'
message: 'You do not have permission to perform this action'
```

### Resource Access Denied
```
code: 'FORBIDDEN'
message: 'You do not have permission to edit this project'
```

### Field Permission Denied
```
code: 'FORBIDDEN'
message: 'You do not have permission to modify the following fields: billingInfo, teamMembers'
```

## Audit Logging

All permission denials are automatically logged:

```typescript
{
  action: 'PERMISSION_DENIED',
  entityType: 'user',
  entityId: userId,
  userId: userId,
  after: {
    permission: 'users.delete',
    customMessage: '...'
  }
}
```

## Performance Tips

1. **Use Request Cache** - Initialize at request start
2. **Batch Checks** - Use `hasAnyPermission` instead of multiple `hasPermission` calls
3. **Filter at Service Layer** - Filter fields once, not per response
4. **Invalidate Sparingly** - Only when actual changes occur
5. **Monitor Cache Hit Rate** - Ensure Redis caching is effective

## Migration Checklist

When adding permissions to existing endpoint:

- [ ] Import permission constants
- [ ] Add middleware to procedure
- [ ] Update tests
- [ ] Verify error handling
- [ ] Test with different roles
- [ ] Update API documentation
- [ ] Check audit logs
- [ ] Verify cache invalidation

## Testing Examples

```typescript
describe('Permissions', () => {
  it('creator can view own assets', async () => {
    const result = await permissionService.hasResourceAccess(
      creatorId, 'ip_asset', ownAssetId, 'view'
    );
    expect(result).toBe(true);
  });

  it('creator cannot view other assets', async () => {
    const result = await permissionService.hasResourceAccess(
      creatorId, 'ip_asset', otherAssetId, 'view'
    );
    expect(result).toBe(false);
  });

  it('admin can view all assets', async () => {
    const result = await permissionService.hasResourceAccess(
      adminId, 'ip_asset', anyAssetId, 'view'
    );
    expect(result).toBe(true);
  });

  it('filters sensitive fields for non-owner', async () => {
    const brand = await getBrand(brandId);
    const filtered = await permissionService.filterObjectFields(
      brand, 'brand', viewerId
    );
    expect(filtered.billingInfo).toBeNull();
  });
});
```
