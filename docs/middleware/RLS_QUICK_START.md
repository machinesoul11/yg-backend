# Row-Level Security - Quick Start Migration Guide

## Prerequisites

✅ All RLS infrastructure is implemented and ready to use
✅ All routers have been updated to use session context
✅ Zero temp user IDs remaining in codebase
✅ Database indexes prepared for performance optimization

## Step 1: Apply Database Indexes (Recommended)

Run the performance indexes migration:

```bash
# Connect to your database
psql $DATABASE_URL -f prisma/migrations/010_rls_performance_indexes.sql
```

This will create optimized indexes for all RLS queries, ensuring fast performance even with large datasets.

## Step 2: Using RLS Filters in Your Code

### In tRPC Routers

RLS filters are automatically available via `ctx.securityFilters`:

```typescript
// ✅ Apply security filter to a query
const projects = await prisma.project.findMany({
  where: ctx.securityFilters.apply('project', {
    status: 'ACTIVE',
    // ... your business logic filters
  })
});

// ✅ Or use individual filter methods
const projectFilter = ctx.securityFilters.project();
const projects = await prisma.project.findMany({
  where: {
    ...projectFilter,
    status: 'ACTIVE',
  }
});
```

### Available Filter Methods

All available via `ctx.securityFilters`:

- `ipAsset()` - IP asset access control
- `project()` - Project access control
- `license()` - License access control
- `royaltyStatement()` - Royalty statement access (Creator-only)
- `payout()` - Payout access (Creator-only)
- `brand()` - Brand profile access
- `creator()` - Creator profile access
- `apply(type, where)` - Compose security filter with business logic

### In Service Layer (Optional)

If you want to use RLS filters in service methods:

```typescript
import { applySecurityFilter, type SecurityContext } from '@/lib/security/row-level-security';

class MyService {
  async listProjects(securityContext: SecurityContext, filters: any) {
    const where = applySecurityFilter(securityContext, 'project', filters);
    return await prisma.project.findMany({ where });
  }
}
```

## Step 3: Understanding Security Context

The security context is automatically populated for all authenticated users:

```typescript
interface SecurityContext {
  userId: string;          // Always present for authenticated users
  role: UserRole;          // ADMIN | CREATOR | BRAND | VIEWER
  creatorId?: string;      // Present if user has a creator profile
  brandId?: string;        // Present if user has a brand profile
}
```

Access it via `ctx.securityContext` in any tRPC procedure.

## Step 4: Testing Your Implementation

Run the example tests to verify RLS is working:

```bash
# Option 1: Execute the example test file
ts-node src/__tests__/security/row-level-security.example.ts

# Option 2: Set up Jest and run proper tests (requires Jest configuration)
npm install --save-dev @jest/globals @types/jest
npm test -- row-level-security
```

## Security Guarantees

### ✅ What RLS Prevents

- Creators seeing other creators' royalty statements
- Creators seeing other creators' payout information
- Brands seeing other brands' projects
- Brands seeing other brands' licenses
- Unauthorized access to IP assets
- Data leakage between tenants

### ✅ What RLS Allows

- Admins full access to all data
- Creators viewing their own assets and co-owned assets
- Brands viewing assets they have licensed
- Creators viewing licenses for their assets
- Proper shared resource access via license relationships

## Common Patterns

### Pattern 1: List Resources with Filters

```typescript
listProjects: protectedProcedure
  .input(listProjectsSchema)
  .query(async ({ ctx, input }) => {
    const projects = await prisma.project.findMany({
      where: ctx.securityFilters.apply('project', {
        status: input.status,
        // ... other filters
      }),
      take: input.limit,
      skip: (input.page - 1) * input.limit,
    });
    
    return { data: projects };
  });
```

### Pattern 2: Get Single Resource

```typescript
getProject: protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const project = await prisma.project.findFirst({
      where: ctx.securityFilters.apply('project', {
        id: input.id,
      }),
    });
    
    if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    
    return { data: project };
  });
```

### Pattern 3: Check Resource Access

```typescript
import { canAccessResource } from '@/lib/security/row-level-security';

updateProject: protectedProcedure
  .input(updateProjectSchema)
  .mutation(async ({ ctx, input }) => {
    if (!canAccessResource(ctx.securityContext, 'project', input.id)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    
    // ... proceed with update
  });
```

## Performance Tips

1. **Use Indexes**: Apply the database indexes migration for optimal performance
2. **Limit Queries**: Always use pagination (take/skip) with RLS filters
3. **Select Fields**: Only select needed fields to reduce query overhead
4. **Cache Results**: Use Redis for frequently accessed, tenant-scoped data

## Troubleshooting

### Issue: Query returns empty results for authenticated user

**Solution**: Check that `ctx.securityContext` is properly populated:
```typescript
console.log('Security Context:', ctx.securityContext);
```

Verify the user has the appropriate profile (creator/brand) if the filter requires it.

### Issue: Admin sees no results

**Solution**: Verify the user's role is correctly set to 'ADMIN' in the database:
```sql
SELECT id, email, role FROM users WHERE email = 'admin@example.com';
```

### Issue: Performance is slow

**Solution**: 
1. Apply the database indexes migration
2. Check query execution plan: `EXPLAIN ANALYZE SELECT ...`
3. Ensure you're using pagination
4. Consider adding additional indexes for your specific use case

## What's Next?

The RLS implementation is complete and production-ready. Optional enhancements:

1. **Gradual Service Migration**: Update service methods to accept `SecurityContext` instead of `userId` + `userRole`
2. **Automated Testing**: Set up Jest properly and convert example tests to full test suite
3. **Monitoring**: Add query performance monitoring for RLS-filtered queries
4. **Auditing**: Track unauthorized access attempts in audit logs

## Support Files

- Core Implementation: `/src/lib/security/row-level-security.ts`
- tRPC Context: `/src/lib/trpc.ts`
- Documentation: `/docs/middleware/ROW_LEVEL_SECURITY.md`
- Completion Report: `/docs/middleware/RLS_COMPLETION_REPORT.md`
- Test Examples: `/src/__tests__/security/row-level-security.example.ts`
- Database Indexes: `/prisma/migrations/010_rls_performance_indexes.sql`

---

**Status**: ✅ Production-Ready
**Zero Breaking Changes**: All updates maintain backward compatibility
