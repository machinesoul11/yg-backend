# Admin Role System - Implementation Complete

## Overview

The Admin Role system provides fine-grained access control for admin and internal staff users. It supplements the existing UserRole system (ADMIN, CREATOR, BRAND, VIEWER) with department-based roles and granular permissions.

## Database Schema

### AdminRole Model

```prisma
model AdminRole {
  id          String         @id @default(cuid())
  userId      String
  department  Department
  seniority   Seniority
  permissions Json           @default("[]")
  isActive    Boolean        @default(true)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  createdBy   String
  expiresAt   DateTime?
  
  user        User           @relation("AssignedRoles", fields: [userId], references: [id], onDelete: Cascade)
  creator     User           @relation("RoleAssignments", fields: [createdBy], references: [id], onDelete: Restrict)

  @@unique([userId, department])
  @@index([userId])
  @@index([department])
  @@index([isActive])
  @@index([expiresAt])
  @@map("admin_roles")
}
```

### Enums

**Department**
- `SUPER_ADMIN` - Full system access
- `CONTENT_MANAGER` - Content moderation and management
- `FINANCE_LICENSING` - Financial operations and licensing
- `CREATOR_APPLICATIONS` - Creator onboarding and management
- `BRAND_APPLICATIONS` - Brand onboarding and management
- `CUSTOMER_SERVICE` - Customer support operations
- `OPERATIONS` - Platform operations and maintenance
- `CONTRACTOR` - Temporary administrative access (requires expiration date)

**Seniority**
- `JUNIOR` - Junior-level responsibilities
- `SENIOR` - Senior-level responsibilities and authority

## Key Features

### 1. Multi-Department Support
- Users can hold multiple department roles simultaneously
- Each department role can have different permissions
- Unique constraint prevents duplicate department assignments per user

### 2. Permission Aggregation
- Permissions are aggregated across all active roles
- Super Admins implicitly have all permissions (`*:*` wildcard)
- Permission format: `namespace:action` (e.g., `users:manage`, `licenses:approve`)

### 3. Contractor Role Management
- Contractor roles require expiration dates
- Maximum 1-year duration enforced
- Automatic deactivation when expired
- Can be extended or converted to permanent roles

### 4. Audit Trail
- All role assignments tracked via `createdBy` field
- Comprehensive audit logging through AuditService
- Role history maintained for compliance

### 5. Caching
- Redis-based permission caching (5-minute TTL)
- Cache invalidation on role changes
- Request-level caching for performance

## API Usage

### Service Layer

```typescript
import { adminRoleService } from '@/lib/utils/admin-role.utils';

// Create an admin role
const role = await adminRoleService.createAdminRole(
  {
    userId: 'user_123',
    department: 'FINANCE_LICENSING',
    seniority: 'SENIOR',
    permissions: ['licenses:approve', 'licenses:view_all', 'finances:manage'],
    isActive: true,
  },
  'admin_456' // createdBy
);

// Get user's aggregated permissions
const permissions = await adminRoleService.getUserAggregatedPermissions('user_123');

// Check if user has a specific permission
const hasPermission = await adminRoleService.userHasPermission(
  'user_123',
  'licenses:approve'
);

// List all admin roles with filters
const { roles, pagination } = await adminRoleService.listAdminRoles({
  page: 1,
  limit: 20,
  department: 'FINANCE_LICENSING',
  isActive: true,
});

// Get expiring roles
const expiringRoles = await adminRoleService.getExpiringRoles({
  daysUntilExpiration: 30,
});
```

### Middleware

#### API Routes
```typescript
import { withAdminPermission, withDepartment, withSuperAdmin } from '@/lib/middleware';

// Require specific permission
export async function GET(req: NextRequest) {
  const { user } = await withAdminPermission(req, 'users:manage');
  // user has users:manage permission
}

// Require department access
export async function POST(req: NextRequest) {
  const { user } = await withDepartment(req, 'FINANCE_LICENSING');
  // user is in FINANCE_LICENSING department
}

// Require super admin
export async function DELETE(req: NextRequest) {
  const { user } = await withSuperAdmin(req);
  // user is a super admin
}
```

#### tRPC Procedures
```typescript
import { requireAdminPermissionTRPC, requireDepartmentTRPC } from '@/lib/middleware';

const adminProcedure = protectedProcedure.use(
  requireAdminPermissionTRPC('users:manage')
);

const financeProcedure = protectedProcedure.use(
  requireDepartmentTRPC('FINANCE_LICENSING')
);
```

### Utility Functions

```typescript
import {
  userHasAdminRoles,
  userIsSuperAdmin,
  userHasDepartment,
  getUserDepartments,
  checkExpiringRoles,
  deactivateExpiredRoles,
  getUserAdminSummary,
} from '@/lib/utils/admin-role.utils';

// Check if user has any admin roles
const hasRoles = await userHasAdminRoles('user_123');

// Check if user is super admin
const isSuperAdmin = await userIsSuperAdmin('user_123');

// Get all user's departments
const departments = await getUserDepartments('user_123');

// Check for expiring roles
const { hasExpiring, expiringRoles } = await checkExpiringRoles('user_123', 30);

// Get comprehensive admin summary
const summary = await getUserAdminSummary('user_123');
```

## Validation Schemas

All inputs are validated using Zod schemas defined in `/src/lib/schemas/admin-role.schema.ts`:

```typescript
import {
  createAdminRoleSchema,
  updateAdminRoleSchema,
  revokeAdminRoleSchema,
  extendContractorRoleSchema,
  convertContractorToPermanentSchema,
} from '@/lib/schemas/admin-role.schema';

// Validate create input
const validatedInput = createAdminRoleSchema.parse(input);

// Contractor roles automatically validated to require expiration
// Expiration date must be in future and within 1 year
```

## Permission Format

Permissions use a `namespace:action` format:

- `users:view` - View users
- `users:manage` - Full user management
- `licenses:approve` - Approve licenses
- `licenses:view_all` - View all licenses
- `finances:manage` - Manage financial operations
- `*:*` - Wildcard (super admin implicit permission)

### Permission Wildcards

- `users:*` - All user permissions
- `*:view` - View permission for all namespaces
- `*:*` - All permissions (super admin only)

## Contractor Role Lifecycle

1. **Creation**: Must include `expiresAt` date (max 1 year)
2. **Extension**: Use `extendContractorRole()` to extend expiration
3. **Conversion**: Use `convertContractorToPermanent()` to convert to permanent role
4. **Expiration**: Automatically deactivated by system job
5. **Alerts**: System generates alerts for expiring roles (30 days, 7 days)

## Integration with Existing Systems

### With PermissionService
The AdminRole system supplements the existing PermissionService. Checks should include both:

```typescript
import { permissionService } from '@/lib/permissions';
import { adminRoleService } from '@/lib/utils/admin-role.utils';

// Check both role-based and admin role permissions
const hasRolePermission = await permissionService.hasPermission(userId, permission);
const hasAdminPermission = await adminRoleService.userHasPermission(userId, permission);
const hasPermission = hasRolePermission || hasAdminPermission;
```

### With Authorization Middleware
AdminRole middleware integrates alongside existing authorization:

```typescript
// Existing: Role-based check
import { withRole } from '@/lib/middleware';
const { user } = await withRole(req, ['ADMIN']);

// New: Admin permission check
import { withAdminPermission } from '@/lib/middleware';
const { user } = await withAdminPermission(req, 'users:manage');

// Both can be used depending on requirements
```

## Scheduled Jobs

### Expire Contractor Roles
Run daily to deactivate expired roles:

```typescript
import { deactivateExpiredRoles } from '@/lib/utils/admin-role.utils';

// In daily cron job
const deactivatedCount = await deactivateExpiredRoles();
console.log(`Deactivated ${deactivatedCount} expired roles`);
```

### Expiration Alerts
Alert admins about roles expiring soon:

```typescript
import { adminRoleService } from '@/lib/utils/admin-role.utils';

// Get roles expiring in 30 days
const expiring30 = await adminRoleService.getExpiringRoles({ daysUntilExpiration: 30 });

// Get roles expiring in 7 days
const expiring7 = await adminRoleService.getExpiringRoles({ daysUntilExpiration: 7 });

// Send notifications
for (const role of expiring7) {
  await sendExpirationAlert(role);
}
```

## Statistics and Reporting

```typescript
import { adminRoleService } from '@/lib/utils/admin-role.utils';

const stats = await adminRoleService.getAdminRoleStats({
  department: 'FINANCE_LICENSING', // optional
  startDate: new Date('2024-01-01'), // optional
  endDate: new Date('2024-12-31'), // optional
});

// Returns:
// {
//   totalRoles: 45,
//   activeRoles: 42,
//   inactiveRoles: 3,
//   byDepartment: { SUPER_ADMIN: 5, FINANCE_LICENSING: 10, ... },
//   bySeniority: { JUNIOR: 20, SENIOR: 25 },
//   expiringIn30Days: 3,
//   expiringIn7Days: 1,
//   contractorRoles: 5
// }
```

## Security Considerations

1. **Cascade Deletion**: AdminRoles are deleted when users are deleted
2. **Restrict on Creator**: AdminRoles cannot be deleted if the creator user is deleted (maintains audit trail)
3. **Expiration Enforcement**: Contractor roles automatically deactivated
4. **Permission Validation**: All permissions validated against known formats
5. **Audit Logging**: All role changes logged for security analysis
6. **Cache Invalidation**: Permission cache cleared on role changes
7. **Unique Constraints**: Prevents duplicate department assignments

## Testing

```typescript
// Test admin role creation
const role = await adminRoleService.createAdminRole({
  userId: testUser.id,
  department: 'CONTENT_MANAGER',
  seniority: 'JUNIOR',
  permissions: ['content:moderate', 'content:view_all'],
  isActive: true,
}, adminUser.id);

expect(role.department).toBe('CONTENT_MANAGER');
expect(role.permissions).toContain('content:moderate');

// Test permission aggregation
const permissions = await adminRoleService.getUserAggregatedPermissions(testUser.id);
expect(permissions).toContain('content:moderate');

// Test contractor validation
await expect(
  adminRoleService.createAdminRole({
    userId: testUser.id,
    department: 'CONTRACTOR',
    seniority: 'JUNIOR',
    permissions: [],
    isActive: true,
    // Missing expiresAt - should fail
  }, adminUser.id)
).rejects.toThrow();
```

## Migration

The database migration is located at:
- `/prisma/migrations/20251025000000_add_admin_role_system/migration.sql`

To apply:
```bash
npx prisma migrate deploy
# or
npx prisma migrate dev
```

## Files Created

- `/prisma/migrations/20251025000000_add_admin_role_system/migration.sql`
- `/src/lib/schemas/admin-role.schema.ts`
- `/src/lib/services/admin-role.service.ts`
- `/src/lib/utils/admin-role.utils.ts`
- `/src/lib/middleware/admin-role.middleware.ts`
- `/docs/ADMIN_ROLE_SYSTEM_IMPLEMENTATION.md` (this file)

## Files Modified

- `/prisma/schema.prisma` - Added AdminRole model and enums
- `/src/lib/middleware/index.ts` - Exported new middleware functions

## Next Steps

1. Create tRPC router for admin role management endpoints
2. Build admin UI for role assignment
3. Set up cron jobs for expiration handling
4. Create role templates for common permission sets
5. Implement role inheritance/hierarchies if needed
6. Add role-based dashboard customization
7. Create reports for role usage and compliance
