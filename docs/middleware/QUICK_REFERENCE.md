# Access Control & Security - Quick Reference

## Import

```typescript
import {
  // Authentication
  requireAuth,
  authenticateRequest,
  
  // Authorization - Roles
  requireAdmin,
  requireCreator,
  requireBrand,
  requireRole,
  withRole,
  
  // Authorization - Permissions
  requirePermission,
  withPermission,
  
  // Resource Ownership
  requireOwnership,
  verifyOwnership,
  
  // API Keys
  validateApiKey,
  createApiKey,
  
  // Service Auth
  requireServiceAuth,
  
  // Webhooks
  requireWebhookVerification,
  markWebhookProcessed,
} from '@/lib/middleware';

// Row-Level Security
import type { SecurityContext } from '@/lib/security/row-level-security';
import {
  getIpAssetSecurityFilter,
  getProjectSecurityFilter,
  getLicenseSecurityFilter,
  getRoyaltyStatementSecurityFilter,
  getPayoutSecurityFilter,
  applySecurityFilter,
} from '@/lib/security/row-level-security';
```

## 🔐 Row-Level Security (RLS)

### Quick Start in tRPC Procedures

```typescript
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';

export const myRouter = createTRPCRouter({
  // Automatic security filtering
  listAssets: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.ipAsset.findMany({
      where: ctx.securityFilters.ipAsset(),
    });
  }),

  // Combine with additional filters
  listActiveAssets: protectedProcedure
    .input(z.object({ status: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.ipAsset.findMany({
        where: ctx.securityFilters.apply('ipAsset', {
          status: input.status,
        }),
      });
    }),
});
```

### Available Security Filters

| Filter | Creator | Brand | Admin |
|--------|---------|-------|-------|
| `ipAsset()` | Own assets only | Licensed/project assets | All |
| `project()` | Licensed assets | Own projects | All |
| `license()` | Own asset licenses | Own licenses | All |
| `royaltyStatement()` | Own statements | ❌ No access | All |
| `payout()` | Own payouts | ❌ No access | All |
| `creator()` | Own profile | Approved creators | All |
| `brand()` | Verified brands | Own profile | All |

### Context Helpers

```typescript
// In tRPC procedures, use ctx.securityFilters
ctx.securityFilters.ipAsset()           // Get IP asset filter
ctx.securityFilters.project()           // Get project filter
ctx.securityFilters.license()           // Get license filter
ctx.securityFilters.royaltyStatement()  // Get royalty statement filter
ctx.securityFilters.payout()            // Get payout filter
ctx.securityFilters.creator()           // Get creator filter
ctx.securityFilters.brand()             // Get brand filter

// Combine filters
ctx.securityFilters.apply('ipAsset', { status: 'ACTIVE' })
```

## Common Patterns

### 1. Simple Authentication

```typescript
export async function GET(req: NextRequest) {
  const { user } = await requireAuth(req);
  // user is authenticated
}
```

### 2. Role-Based Access

```typescript
// Admin only
export async function DELETE(req: NextRequest) {
  const { user } = await requireAdmin(req);
}

// Creator only
export async function POST(req: NextRequest) {
  const { user } = await requireCreator(req);
}

// Multiple roles
export async function PUT(req: NextRequest) {
  const { user } = await requireAuth(req);
  requireRole(user, ['ADMIN', 'CREATOR']);
}
```

### 3. Permission-Based Access

```typescript
import { PERMISSIONS } from '@/lib/constants/permissions';

export async function GET(req: NextRequest) {
  const { user } = await withPermission(req, [
    PERMISSIONS.PROJECTS_VIEW_ALL
  ]);
}
```

### 4. Resource Ownership

```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { user } = await requireAuth(req);
  await requireOwnership(user, 'project', params.projectId);
}
```

### 5. Combined Checks

```typescript
export async function DELETE(
  req: NextRequest,
  { params }: { params: { assetId: string } }
) {
  // Authenticate
  const { user } = await requireAuth(req);
  
  // Check ownership OR admin role
  const ownership = await verifyOwnership(
    user,
    'ip_asset',
    params.assetId,
    { allowAdmin: true }
  );
  
  if (!ownership.hasAccess) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }
}
```

### 6. Service Authentication

```typescript
export async function POST(req: NextRequest) {
  const { serviceId } = await requireServiceAuth(req, [
    'analytics-processor'
  ]);
}
```

### 7. Webhook Handling

```typescript
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  
  const verification = await requireWebhookVerification(req, rawBody, {
    provider: 'stripe',
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  
  // Process webhook
  const event = JSON.parse(rawBody);
  
  await markWebhookProcessed('stripe', verification.eventId!);
  
  return NextResponse.json({ received: true });
}
```

## Error Handling

```typescript
try {
  const { user } = await requireAuth(req);
  await requireOwnership(user, 'project', projectId);
  
} catch (error) {
  const err = error as any;
  
  // Authentication errors (401)
  if (err.code === 'UNAUTHORIZED' || err.code === 'NO_CREDENTIALS') {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  
  // Authorization errors (403)
  if (err.code === 'FORBIDDEN' || err.code === 'ROLE_REQUIRED') {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }
  
  // Rate limiting (429)
  if (err.code === 'RATE_LIMITED') {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }
  
  // Generic error (500)
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
```

## Resource Types

Supported resource types for ownership checks:

- `'ip_asset'` - IP Assets
- `'project'` - Projects
- `'license'` - Licenses
- `'royalty_statement'` - Royalty Statements
- `'payout'` - Payouts
- `'brand'` - Brand Profiles
- `'creator'` - Creator Profiles

## Webhook Providers

- `'stripe'` - Stripe webhooks
- `'resend'` - Resend email webhooks
- `'generic'` - Generic HMAC-SHA256 webhooks

## Environment Variables

Required environment variables:

```bash
# Auth.js
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend
RESEND_WEBHOOK_SECRET=your-webhook-secret

# Service Secrets (for service-to-service auth)
SERVICE_SECRET_ANALYTICS=secret-here
SERVICE_SECRET_ROYALTY=secret-here
SERVICE_SECRET_PAYOUT=secret-here
SERVICE_SECRET_EMAIL=secret-here
SERVICE_SECRET_STORAGE=secret-here
SERVICE_SECRET_NOTIFICATION=secret-here
SERVICE_SECRET_JOBS=secret-here

# Redis
REDIS_URL=redis://localhost:6379
```

## Performance Tips

1. **Enable caching for ownership checks** (enabled by default)
2. **Use request-level permission caching** (enabled by default)
3. **Enable rate limiting for public endpoints**
4. **Invalidate caches when ownership changes**

```typescript
import { invalidateOwnershipCache } from '@/lib/middleware';

// After transferring ownership
await invalidateOwnershipCache('project', projectId);
```

## See Also

- [Full Documentation](./ACCESS_CONTROL.md)
- [Example Implementations](/src/app/api/examples/)
- [Permission Constants](/src/lib/constants/permissions.ts)
- [Auth Configuration](/src/lib/auth.ts)
