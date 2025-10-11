# Query Filtering System - Documentation

## Overview

The Query Filtering System provides automatic role-based and ownership-based query filtering to ensure data isolation and security across all database queries in the YES GODDESS platform. It extends the existing Row-Level Security (RLS) implementation with additional layers of protection and convenience utilities.

## Architecture

```
src/lib/query-filters/
├── index.ts                    # Main exports
├── types.ts                    # TypeScript interfaces and enums
├── role-filters.ts             # Role-based filtering functions
├── tenant-scoped-queries.ts    # Tenant-aware query wrappers
├── ownership-filters.ts        # Ownership-based filtering
├── permission-select.ts        # Field-level permissions
├── secure-aggregations.ts      # Secure aggregation queries
└── examples.ts                 # Integration examples
```

## Core Concepts

### 1. Role-Based Filtering

Automatically filters queries based on user role:
- **Admin**: Full access to all data
- **Creator**: Access to their own assets, royalties, and payouts
- **Brand**: Access to their own projects and licenses
- **Viewer**: Limited public access only

### 2. Tenant Scoping

Ensures data isolation between users (tenants):
- Each query automatically includes the appropriate security filter
- Prevents accidental data leakage through misconfigured queries
- Maintains backward compatibility with existing code

### 3. Ownership-Based Filtering

Granular control based on ownership relationships:
- Primary ownership (100% or majority stake)
- Contributor ownership (collaborative works)
- Derivative ownership (derivative works)
- Share-based filtering (minimum ownership percentage)

### 4. Permission-Based Select Filtering

Field-level access control:
- **PUBLIC**: Visible to everyone
- **AUTHENTICATED**: Visible to logged-in users
- **OWNER**: Visible only to the owner
- **COLLABORATOR**: Visible to collaborators
- **ADMIN**: Visible only to admins

### 5. Secure Aggregations

Prevents information leakage through aggregate statistics:
- Minimum dataset size requirements
- Automatic filtering before aggregation
- Domain-specific aggregation helpers

## Installation

The query filtering system is already installed and integrated with your existing RLS implementation. No additional dependencies required.

## Usage

### Basic Role-Based Filtering

```typescript
import { getRoleBasedFilter } from '@/lib/query-filters';

const context: QueryContext = {
  userId: ctx.session.user.id,
  role: ctx.session.user.role,
  creatorId: ctx.securityContext?.creatorId,
  brandId: ctx.securityContext?.brandId,
};

const filter = getRoleBasedFilter(context, 'ipAsset');

const assets = await prisma.ipAsset.findMany({
  where: filter,
});
```

### Tenant-Scoped Queries

```typescript
import { createTenantScopedQuery } from '@/lib/query-filters';

const scopedQuery = createTenantScopedQuery(prisma, context);

// Automatic security filtering
const projects = await scopedQuery.findManyWithScope('project', {
  where: {
    status: 'ACTIVE',
  },
});

// Paginated queries with security
const result = await scopedQuery.findManyPaginated(
  'creator',
  { page: 1, pageSize: 20 },
  {
    where: { verificationStatus: 'approved' },
  }
);
```

### Ownership-Based Filtering

```typescript
import { 
  getIpAssetOwnershipFilter,
  getPrimaryOwnershipFilter,
  verifyOwnership 
} from '@/lib/query-filters';

// Filter by ownership type
const filter = getIpAssetOwnershipFilter(context, {
  ownershipTypes: ['PRIMARY'],
  minShareBps: 5000, // 50%
});

// Verify ownership before mutation
await verifyOwnership(prisma, context, assetId);
```

### Permission-Based Field Filtering

```typescript
import { getAllowedSelectFields, filterSelectFields } from '@/lib/query-filters';

// Get allowed fields for a model
const allowedFields = getAllowedSelectFields(context, 'creator');

// Filter requested select clause
const filteredSelect = filterSelectFields(
  context,
  'creator',
  requestedSelect,
  resourceOwnerId
);

const creator = await prisma.creator.findUnique({
  where: { id: creatorId },
  select: filteredSelect,
});
```

### Secure Aggregations

```typescript
import { 
  createSecureAggregation,
  calculateCreatorEarnings,
  calculateBrandSpend 
} from '@/lib/query-filters';

// Built-in domain aggregations
const earnings = await calculateCreatorEarnings(prisma, context);

// Custom aggregations
const aggregator = createSecureAggregation(prisma, context);

const totalAssets = await aggregator.secureCount('ipAsset', {
  status: 'PUBLISHED',
});

const avgFee = await aggregator.secureAverage(
  'license',
  'feeCents',
  {},
  { 
    nullOnSmallDataset: true,
    minDatasetSize: 5,
  }
);
```

## Integration with tRPC

### Basic Pattern

```typescript
import { createTenantScopedQuery } from '@/lib/query-filters';

export const myRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext!);
      
      return scopedQuery.findManyWithScope('ipAsset');
    }),
});
```

### With Pagination

```typescript
listProjects: protectedProcedure
  .input(z.object({
    page: z.number().min(1),
    pageSize: z.number().min(1).max(100),
  }))
  .query(async ({ ctx, input }) => {
    const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext!);
    
    return scopedQuery.findManyPaginated(
      'project',
      input,
      { where: { deletedAt: null } }
    );
  }),
```

### With Custom Filters

```typescript
searchAssets: protectedProcedure
  .input(z.object({
    search: z.string(),
    type: z.enum(['IMAGE', 'VIDEO', 'AUDIO']).optional(),
  }))
  .query(async ({ ctx, input }) => {
    const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext!);
    
    const where: any = { deletedAt: null };
    
    if (input.search) {
      where.OR = [
        { title: { contains: input.search, mode: 'insensitive' } },
        { description: { contains: input.search, mode: 'insensitive' } },
      ];
    }
    
    if (input.type) {
      where.type = input.type;
    }
    
    return scopedQuery.findManyWithScope('ipAsset', { where });
  }),
```

## Best Practices

### 1. Always Use Security Context

```typescript
// ✅ GOOD
const scopedQuery = createTenantScopedQuery(prisma, ctx.securityContext!);
const assets = await scopedQuery.findManyWithScope('ipAsset');

// ❌ BAD
const assets = await prisma.ipAsset.findMany(); // No security filtering!
```

### 2. Apply Field Filtering Early

```typescript
// ✅ GOOD - Filter in select clause
const allowedFields = getAllowedSelectFields(context, 'creator');
const creator = await prisma.creator.findUnique({
  where: { id },
  select: allowedFields,
});

// ❌ BAD - Fetch all then redact
const creator = await prisma.creator.findUnique({ where: { id } });
const redacted = redactSensitiveFields(context, 'creator', creator);
```

### 3. Use Domain-Specific Aggregations

```typescript
// ✅ GOOD - Use built-in helper
const earnings = await calculateCreatorEarnings(prisma, context);

// ❌ BAD - Manual aggregation
const statements = await prisma.royaltyStatement.findMany({
  where: { creatorId: context.creatorId },
});
const total = statements.reduce((sum, s) => sum + s.totalEarningsCents, 0);
```

### 4. Compose Filters Properly

```typescript
// ✅ GOOD - Compose filters
const securityFilter = getRoleBasedFilter(context, 'ipAsset');
const businessFilter = { status: 'PUBLISHED' };
const where = composeFilters(securityFilter, businessFilter);

// ❌ BAD - Merge manually
const where = { ...securityFilter, status: 'PUBLISHED' }; // May override security
```

### 5. Verify Ownership Before Mutations

```typescript
// ✅ GOOD
await verifyOwnership(prisma, context, assetId);
await prisma.ipAsset.update({
  where: { id: assetId },
  data: { title: newTitle },
});

// ❌ BAD
await prisma.ipAsset.update({
  where: { id: assetId },
  data: { title: newTitle },
}); // No ownership check!
```

## Security Considerations

### Data Isolation

- **Creators** can never see other creators' financial data
- **Brands** can never see other brands' projects or spending
- **Financial data** (royalties, payouts) is strictly creator-only
- **Admins** have full access but all actions are logged

### Inference Attacks

The secure aggregation system prevents inference attacks by:
- Requiring minimum dataset sizes (default: 5 records)
- Returning `null` for small datasets instead of actual values
- Filtering before aggregation to prevent row counting attacks

### Field-Level Protection

Sensitive fields are never exposed to unauthorized users:
- Email addresses (owner only)
- Payment information (owner/admin only)
- Internal notes (admin only)
- Performance metrics (owner/admin only)

## Testing

### Manual Testing

See `src/lib/query-filters/examples.ts` for integration examples.

### Unit Testing

Test coverage should include:
- Role-based filter generation
- Tenant scoping for each role
- Ownership verification
- Field permission checking
- Aggregation security

### Integration Testing

End-to-end tests should verify:
- Complete data isolation between tenants
- Cross-tenant access prevention
- Collaborative access (shared resources)
- Financial data isolation

## Performance

### Database Indexes

The query filtering system relies on existing indexes:
- `creators.userId`
- `brands.userId`
- `ip_ownerships.creatorId`
- `ip_ownerships.endDate`
- `royalty_statements.creatorId`
- `payouts.creatorId`

### Query Optimization

- Use `select` to minimize data transfer
- Apply filters in `where` clause, not in application code
- Use `include` judiciously with nested filters
- Leverage pagination for large datasets

## Troubleshooting

### "No access" Results

If queries return no results unexpectedly:
1. Verify `ctx.securityContext` is populated
2. Check that the user has the appropriate profile (creator/brand)
3. Confirm ownership relationships exist in the database

### Type Errors

If you encounter TypeScript errors:
1. Ensure you're importing types from '@/lib/query-filters'
2. Use `QueryContext` interface for security context
3. Check that entity types match the supported entities

### Performance Issues

If queries are slow:
1. Check that database indexes are in place
2. Use pagination for large datasets
3. Apply additional filters before security filters
4. Consider caching for frequently accessed data

## Migration from Existing Code

### Step 1: Identify Direct Queries

Find all direct Prisma queries:
```bash
grep -r "prisma\.[a-z]*.findMany" src/
```

### Step 2: Add Security Context

Update function signatures to accept security context:
```typescript
// Before
async function listAssets() {
  return prisma.ipAsset.findMany();
}

// After
async function listAssets(context: QueryContext) {
  const filter = getRoleBasedFilter(context, 'ipAsset');
  return prisma.ipAsset.findMany({ where: filter });
}
```

### Step 3: Update tRPC Routers

Replace temporary user IDs with real context:
```typescript
// Before
const userId = 'temp-user-id';
const userRole = 'ADMIN';

// After
const { userId, role, creatorId, brandId } = ctx.securityContext!;
```

### Step 4: Test Thoroughly

Run the full test suite to ensure:
- No breaking changes
- Data isolation maintained
- Performance acceptable

## Support

For questions or issues:
1. Review this documentation
2. Check the examples in `src/lib/query-filters/examples.ts`
3. Refer to the RLS documentation in `docs/middleware/ROW_LEVEL_SECURITY.md`
4. Consult the implementation files for detailed code comments

---

**Implementation Date**: October 11, 2025  
**Status**: ✅ Complete
**Module Version**: 1.0.0
