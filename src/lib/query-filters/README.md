# Query Filtering System

Automatic role-based and ownership-based query filtering for the YES GODDESS platform.

## Features

- ✅ **Automatic Role-Based Filtering** - Admin, Creator, Brand, Viewer roles
- ✅ **Tenant-Scoped Queries** - Prevent cross-tenant data leakage
- ✅ **Ownership-Based Filtering** - Primary, Contributor, Derivative ownership types
- ✅ **Permission-Based Select** - Field-level access control
- ✅ **Secure Aggregations** - Prevent inference attacks on aggregate data
- ✅ **Type-Safe** - Full TypeScript support with Prisma integration
- ✅ **Performance Optimized** - Leverages database indexes

## Quick Start

```typescript
import { createTenantScopedQuery } from '@/lib/query-filters';

// In your tRPC router or service
const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext!);

// Queries are automatically filtered by role
const assets = await scopedQuery.findManyWithScope('ipAsset', {
  where: { status: 'PUBLISHED' },
});
```

## Modules

### `types.ts`
Core TypeScript interfaces and enums.

### `role-filters.ts`
Role-based filtering functions:
- `getRoleBasedFilter()` - Get filter for any entity type
- `composeFilters()` - Combine multiple filters with AND logic
- `isAdmin()`, `isCreator()`, `isBrand()` - Role checking utilities

### `tenant-scoped-queries.ts`
Tenant-aware query wrappers:
- `createTenantScopedQuery()` - Create scoped query builder
- `findManyWithScope()` - Find many with automatic filtering
- `findFirstWithScope()` - Find first with automatic filtering
- `findUniqueWithScope()` - Find unique with validation
- `countWithScope()` - Count with filtering
- `findManyPaginated()` - Paginated queries with filtering

### `ownership-filters.ts`
Ownership-based filtering:
- `getIpAssetOwnershipFilter()` - Filter by ownership type and share
- `getPrimaryOwnershipFilter()` - Filter by primary ownership
- `getContributorOwnershipFilter()` - Filter by contributor ownership
- `verifyOwnership()` - Verify ownership before mutations
- `userOwnsAsset()` - Check if user owns an asset
- `getAssetOwnership()` - Get ownership details

### `permission-select.ts`
Field-level access control:
- `getAllowedSelectFields()` - Get fields user can access
- `filterSelectFields()` - Filter select clause by permissions
- `redactSensitiveFields()` - Redact forbidden fields from results
- `validateSelectPermissions()` - Validate select clause

### `secure-aggregations.ts`
Secure aggregation queries:
- `createSecureAggregation()` - Create secure aggregator
- `secureCount()` - Count with filtering
- `secureSum()` - Sum with filtering and minimum dataset size
- `secureAverage()` - Average with protection against small datasets
- `calculateCreatorEarnings()` - Creator earnings aggregation
- `calculateBrandSpend()` - Brand spend aggregation
- `getPlatformStats()` - Platform-wide statistics (admin only)

### `examples.ts`
Integration examples and usage patterns.

## Usage Patterns

### Pattern 1: List Query with Filtering

```typescript
export async function listAssets(ctx: QueryContext, filters: any) {
  const scopedQuery = createTenantScopedQuery(prisma, ctx);
  
  return scopedQuery.findManyWithScope('ipAsset', {
    where: {
      ...filters,
      deletedAt: null,
    },
  });
}
```

### Pattern 2: Paginated List

```typescript
export async function listProjects(ctx: QueryContext, page: number, pageSize: number) {
  const scopedQuery = createTenantScopedQuery(prisma, ctx);
  
  return scopedQuery.findManyPaginated(
    'project',
    { page, pageSize, sortBy: 'createdAt', sortOrder: 'desc' }
  );
}
```

### Pattern 3: Get Single Resource

```typescript
export async function getAsset(ctx: QueryContext, assetId: string) {
  const scopedQuery = createTenantScopedQuery(prisma, ctx);
  
  return scopedQuery.findUniqueWithScope('ipAsset', {
    where: { id: assetId },
  });
}
```

### Pattern 4: Ownership Verification

```typescript
export async function updateAsset(ctx: QueryContext, assetId: string, data: any) {
  // Verify ownership first
  await verifyOwnership(prisma, ctx, assetId);
  
  // Then perform update
  return prisma.ipAsset.update({
    where: { id: assetId },
    data,
  });
}
```

### Pattern 5: Field-Level Filtering

```typescript
export async function getCreatorProfile(ctx: QueryContext, creatorId: string) {
  const allowedFields = getAllowedSelectFields(ctx, 'creator', creatorId);
  
  return prisma.creator.findUnique({
    where: { id: creatorId },
    select: allowedFields,
  });
}
```

### Pattern 6: Secure Aggregation

```typescript
export async function getEarningsSummary(ctx: QueryContext) {
  return calculateCreatorEarnings(prisma, ctx);
}
```

## Security Guarantees

### Data Isolation
- ✅ Creators can only see their own assets and financial data
- ✅ Brands can only see their own projects and licenses
- ✅ Complete isolation for royalty statements and payouts
- ✅ Admins can see everything (all access logged)

### Field Protection
- ✅ Email addresses protected (owner only)
- ✅ Payment info protected (owner/admin only)
- ✅ Internal notes protected (admin only)
- ✅ Performance metrics protected (owner/admin only)

### Aggregation Security
- ✅ Minimum dataset size enforcement (default: 5 records)
- ✅ Null returns for small datasets
- ✅ Filters applied before aggregation
- ✅ Prevents row counting attacks

## Performance

### Optimizations
- Uses existing database indexes
- Minimal query overhead
- Efficient filter composition
- Smart caching opportunities

### Database Indexes Used
```sql
CREATE INDEX idx_creators_user_id ON creators(user_id);
CREATE INDEX idx_brands_user_id ON brands(user_id);
CREATE INDEX idx_ip_ownerships_creator_id ON ip_ownerships(creator_id);
CREATE INDEX idx_ip_ownerships_end_date ON ip_ownerships(end_date);
CREATE INDEX idx_royalty_statements_creator_id ON royalty_statements(creator_id);
CREATE INDEX idx_payouts_creator_id ON payouts(creator_id);
```

## Migration Guide

### From Existing Code

1. **Update Service Methods**
   ```typescript
   // Before
   async listAssets(userId: string, userRole: string) {
     const filter = userRole === 'CREATOR' ? { createdBy: userId } : {};
     return prisma.ipAsset.findMany({ where: filter });
   }
   
   // After
   async listAssets(ctx: QueryContext) {
     const scopedQuery = createTenantScopedQuery(prisma, ctx);
     return scopedQuery.findManyWithScope('ipAsset');
   }
   ```

2. **Update tRPC Routers**
   ```typescript
   // Before
   const userId = ctx.session.user.id;
   const userRole = ctx.session.user.role;
   
   // After
   const context = ctx.securityContext!;
   const scopedQuery = createTenantScopedQuery(prisma, context);
   ```

3. **Add Ownership Checks**
   ```typescript
   // Add before mutations
   await verifyOwnership(prisma, ctx, assetId);
   ```

## Testing

### Unit Tests
- Role-based filter generation
- Filter composition
- Ownership verification
- Field permission calculation

### Integration Tests
- Data isolation between users
- Cross-tenant access prevention
- Collaborative access
- Financial data protection

### Manual Testing
See `examples.ts` for manual testing patterns.

## Documentation

- [Full Documentation](../../../docs/infrastructure/database/query-filtering.md)
- [RLS Documentation](../../../docs/middleware/ROW_LEVEL_SECURITY.md)
- [Integration Examples](./examples.ts)

## API Reference

### Types

```typescript
interface QueryContext {
  userId: string;
  role: UserRole;
  creatorId?: string;
  brandId?: string;
}

interface QueryFilterOptions {
  includeSoftDeleted?: boolean;
  customFilters?: Record<string, any>;
  bypassTenantScope?: boolean;
}

interface OwnershipFilterConfig {
  ownershipTypes?: OwnershipType[];
  includeExpired?: boolean;
  minShareBps?: number;
}

interface AggregationSecurityOptions {
  minDatasetSize?: number;
  nullOnSmallDataset?: boolean;
  additionalFilters?: Record<string, any>;
}
```

### Supported Entity Types

- `ipAsset` - IP Assets
- `project` - Projects
- `license` - Licenses
- `royaltyStatement` - Royalty Statements
- `payout` - Payouts
- `brand` - Brands
- `creator` - Creators

### Permission Levels

- `PUBLIC` - Visible to everyone
- `AUTHENTICATED` - Visible to logged-in users
- `OWNER` - Visible only to the owner
- `COLLABORATOR` - Visible to collaborators
- `ADMIN` - Visible only to admins

---

**Module**: Query Filtering System  
**Version**: 1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: October 11, 2025
