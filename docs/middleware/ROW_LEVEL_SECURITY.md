# Row-Level Security Implementation

## Overview

Row-Level Security (RLS) ensures data isolation and proper access control in the YesGoddess platform. This implementation provides centralized security filtering that automatically restricts data access based on user roles and ownership.

## Security Rules

### Creators
- ✅ Can view **only their own** IP assets (via creation or ownership)
- ✅ Can view **only their own** royalty statements
- ✅ Can view **only their own** payouts
- ✅ Can view projects containing assets they own (through licenses)
- ✅ Can view licenses for their assets
- ✅ Can browse verified brands (for discovery)
- ✅ Can browse approved creators (public profiles)

### Brands
- ✅ Can view **only their own** projects
- ✅ Can view **only their own** licenses
- ✅ Can view assets in their projects
- ✅ Can view licensed assets
- ✅ Cannot view royalty statements or payouts
- ✅ Can browse approved creators (for discovery)

### Admins
- ✅ Have **full unrestricted access** to all data
- ✅ Can view all assets, projects, licenses, royalty statements, and payouts
- ✅ Can view all brands and creators regardless of verification status

### Shared Resources
- ✅ **IP Assets**: Accessible by creator (owner), brand (if licensed or in project), admin
- ✅ **Projects**: Accessible by owning brand, creators with licensed assets in project, admin
- ✅ **Licenses**: Accessible by brand (licensee), creator (asset owner), admin
- ✅ **Royalty Statements**: Only accessible by owning creator and admin
- ✅ **Payouts**: Only accessible by receiving creator and admin

## Architecture

### Core Components

```
src/lib/security/
└── row-level-security.ts  # Security filter functions

src/lib/trpc.ts  # Enhanced with security context
```

### Security Filter Functions

#### `getIpAssetSecurityFilter(context: SecurityContext)`
Returns a Prisma where clause that filters IP assets based on user role and ownership.

**Logic:**
- **Admin**: No filter (full access)
- **Creator**: Assets they created OR assets they own (via IpOwnership)
- **Brand**: Assets in their projects OR assets they've licensed
- **Others**: No access

#### `getProjectSecurityFilter(context: SecurityContext)`
Returns a Prisma where clause that filters projects based on user role.

**Logic:**
- **Admin**: No filter (full access)
- **Brand**: Only their own projects (via brandId)
- **Creator**: Projects with assets they own
- **Others**: No access

#### `getLicenseSecurityFilter(context: SecurityContext)`
Returns a Prisma where clause that filters licenses based on user role.

**Logic:**
- **Admin**: No filter (full access)
- **Brand**: Only their own licenses (via brandId)
- **Creator**: Licenses for assets they own
- **Others**: No access

#### `getRoyaltyStatementSecurityFilter(context: SecurityContext)`
Returns a Prisma where clause that filters royalty statements based on user role.

**Logic:**
- **Admin**: No filter (full access)
- **Creator**: Only their own statements (via creatorId)
- **Others**: No access (brands cannot see statements)

#### `getPayoutSecurityFilter(context: SecurityContext)`
Returns a Prisma where clause that filters payouts based on user role.

**Logic:**
- **Admin**: No filter (full access)
- **Creator**: Only their own payouts (via creatorId)
- **Others**: No access

## Usage in tRPC Procedures

### Automatic Security Filtering

The tRPC context now includes `securityFilters` helpers that automatically apply appropriate filters:

```typescript
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';

export const myRouter = createTRPCRouter({
  listAssets: protectedProcedure
    .query(async ({ ctx }) => {
      // Security filter is automatically applied
      const assets = await ctx.db.ipAsset.findMany({
        where: ctx.securityFilters.ipAsset(),
      });
      
      return assets;
    }),
});
```

### Combining with Additional Filters

You can combine security filters with your own query filters:

```typescript
listActiveAssets: protectedProcedure
  .input(z.object({ 
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) 
  }))
  .query(async ({ ctx, input }) => {
    const assets = await ctx.db.ipAsset.findMany({
      where: ctx.securityFilters.apply('ipAsset', {
        status: input.status,
        deletedAt: null,
      }),
    });
    
    return assets;
  }),
```

### Manual Filter Application

For more complex queries, use the filter functions directly:

```typescript
import { getIpAssetSecurityFilter } from '@/lib/security/row-level-security';

listAssets: protectedProcedure
  .query(async ({ ctx }) => {
    if (!ctx.securityContext) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const securityFilter = getIpAssetSecurityFilter(ctx.securityContext);
    
    const assets = await ctx.db.ipAsset.findMany({
      where: {
        AND: [
          securityFilter,
          { status: 'PUBLISHED' },
          { deletedAt: null },
        ],
      },
    });
    
    return assets;
  }),
```

## Examples

### Example 1: Creator Viewing Their Assets

```typescript
// Creator with ID "creator_123" requests their assets
// Security context:
{
  userId: "user_123",
  role: "CREATOR",
  creatorId: "creator_123"
}

// Generated filter:
{
  OR: [
    { createdBy: "user_123" },
    {
      ownerships: {
        some: {
          creatorId: "creator_123",
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } }
          ]
        }
      }
    }
  ]
}
```

### Example 2: Brand Viewing Their Projects

```typescript
// Brand with ID "brand_456" requests their projects
// Security context:
{
  userId: "user_456",
  role: "BRAND",
  brandId: "brand_456"
}

// Generated filter:
{
  brandId: "brand_456"
}
```

### Example 3: Admin Viewing All Data

```typescript
// Admin user requests all assets
// Security context:
{
  userId: "user_admin",
  role: "ADMIN"
}

// Generated filter:
{} // Empty filter = full access
```

### Example 4: Creator Viewing Royalty Statements

```typescript
// Creator requests their royalty statements
getMyRoyaltyStatements: protectedProcedure
  .query(async ({ ctx }) => {
    const statements = await ctx.db.royaltyStatement.findMany({
      where: ctx.securityFilters.royaltyStatement(),
      include: {
        royaltyRun: true,
        lines: {
          include: {
            ipAsset: true,
            license: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return statements;
  }),

// For creator_123, this generates:
{
  creatorId: "creator_123"
}

// For brand user, this generates:
{
  id: "impossible-id-no-access" // No access
}
```

## Migration Guide

### Updating Existing Routers

#### Before (No Security Filtering)

```typescript
export const projectsRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // No security filtering - returns ALL projects
      const projects = await prisma.project.findMany();
      return projects;
    }),
});
```

#### After (With Security Filtering)

```typescript
export const projectsRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // Automatically filtered by user role
      const projects = await ctx.db.project.findMany({
        where: ctx.securityFilters.project(),
      });
      return projects;
    }),
});
```

### Updating Service Layer

If your service layer needs security filtering:

```typescript
import type { SecurityContext } from '@/lib/security/row-level-security';
import { getIpAssetSecurityFilter } from '@/lib/security/row-level-security';

export class IpAssetService {
  async listAssets(securityContext: SecurityContext, filters: any) {
    const securityFilter = getIpAssetSecurityFilter(securityContext);
    
    return await this.prisma.ipAsset.findMany({
      where: {
        AND: [securityFilter, filters],
      },
    });
  }
}
```

## Testing

### Test Cases

#### 1. Creator Asset Isolation
```typescript
test('creator can only see their own assets', async () => {
  const creator1Assets = await getAssetsForCreator('creator_1');
  const creator2Assets = await getAssetsForCreator('creator_2');
  
  // creator_1 should not see creator_2's assets
  expect(creator1Assets).not.toContain(creator2Assets[0]);
});
```

#### 2. Brand Project Isolation
```typescript
test('brand can only see their own projects', async () => {
  const brand1Projects = await getProjectsForBrand('brand_1');
  const brand2Projects = await getProjectsForBrand('brand_2');
  
  // brand_1 should not see brand_2's projects
  expect(brand1Projects).not.toContain(brand2Projects[0]);
});
```

#### 3. Admin Full Access
```typescript
test('admin can see all data', async () => {
  const adminAssets = await getAssetsForAdmin();
  const allAssets = await getAllAssets();
  
  // Admin should see everything
  expect(adminAssets.length).toBe(allAssets.length);
});
```

#### 4. Shared Resource Access
```typescript
test('brand can view licensed assets', async () => {
  // Create license: brand_1 licenses asset owned by creator_1
  const license = await createLicense({
    brandId: 'brand_1',
    ipAssetId: 'asset_creator_1',
  });
  
  // Brand should be able to view this asset
  const brandAssets = await getAssetsForBrand('brand_1');
  expect(brandAssets).toContainEqual(
    expect.objectContaining({ id: 'asset_creator_1' })
  );
});
```

## Performance Considerations

### Indexes

Ensure appropriate database indexes exist for security filters:

```sql
-- IP Assets
CREATE INDEX idx_ip_assets_created_by ON ip_assets(created_by);
CREATE INDEX idx_ip_ownerships_creator_dates ON ip_ownerships(creator_id, end_date);

-- Projects
CREATE INDEX idx_projects_brand_id ON projects(brand_id);

-- Licenses
CREATE INDEX idx_licenses_brand_id ON licenses(brand_id);

-- Royalty Statements
CREATE INDEX idx_royalty_statements_creator ON royalty_statements(creator_id);

-- Payouts
CREATE INDEX idx_payouts_creator ON payouts(creator_id);
```

### Query Optimization

The security filters use efficient patterns:
- **Direct ID matching** for simple ownership (projects, statements, payouts)
- **OR conditions** for multi-path access (assets, licenses)
- **Subqueries with `some`** for relationship-based access

### Caching Considerations

Security contexts are built per-request and include:
- User ID
- Role
- Creator ID (if applicable)
- Brand ID (if applicable)

This data is fetched once per request in `createTRPCContext` and reused for all security filters.

## Troubleshooting

### Issue: User cannot see expected data

**Check:**
1. Verify user role is correct
2. Confirm creator/brand ID is properly set
3. Check ownership records (IpOwnership for assets)
4. Verify license relationships

### Issue: Performance degradation

**Check:**
1. Database indexes are present
2. Query plans with `EXPLAIN ANALYZE`
3. Consider denormalization for frequently accessed data
4. Review relationship cardinality

### Issue: Security filter not applied

**Check:**
1. Using `ctx.securityFilters` or manual filter functions
2. Security context is available (`ctx.securityContext`)
3. User is authenticated (protectedProcedure)

## Audit Logging

All security filter applications should be logged for compliance:

```typescript
import { AuditService } from '@/lib/services/audit.service';

listAssets: protectedProcedure
  .query(async ({ ctx }) => {
    const assets = await ctx.db.ipAsset.findMany({
      where: ctx.securityFilters.ipAsset(),
    });
    
    // Log access
    await auditService.log({
      userId: ctx.session.user.id,
      action: 'assets.list',
      entityType: 'ip_asset',
      entityId: null,
      afterJson: { count: assets.length },
    });
    
    return assets;
  }),
```

## Best Practices

1. **Always use security filters** for queries that return user data
2. **Combine filters properly** using `ctx.securityFilters.apply()`
3. **Test with different roles** to ensure proper isolation
4. **Document exceptions** where admin-only access is required
5. **Audit access patterns** for compliance and security monitoring
6. **Keep filters simple** to maintain query performance
7. **Use TypeScript** to ensure type safety with filters

## Related Documentation

- [Access Control Middleware](./ACCESS_CONTROL.md)
- [Authorization Middleware](./authorization.middleware.ts)
- [Resource Ownership Middleware](./resource-ownership.middleware.ts)
- [tRPC Context](../lib/trpc.ts)
