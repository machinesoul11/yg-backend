# Access Control Middleware Documentation

## Overview

The Access Control Middleware provides a comprehensive authentication and authorization system for the YesGoddess platform. It includes multiple layers of security controls to protect API endpoints and resources.

## Architecture

### Middleware Layers

1. **Authentication Middleware** (`auth.middleware.ts`)
   - Verifies user identity
   - Supports multiple authentication methods (session, JWT, API keys)
   - Integrates with Auth.js (NextAuth)
   - Rate limiting integration
   - Audit logging

2. **Authorization Middleware** (`authorization.middleware.ts`)
   - Role-based access control (RBAC)
   - Permission-based access control
   - Composable with authentication middleware
   - Helper functions for common scenarios

3. **Resource Ownership Middleware** (`resource-ownership.middleware.ts`)
   - Verifies user ownership of resources
   - Multi-tenant data isolation
   - Caching for performance
   - Supports multiple resource types

4. **API Key Middleware** (`api-key.middleware.ts`)
   - API key generation and management
   - Scope-based permissions
   - Key rotation support
   - Usage tracking

5. **Service Authentication Middleware** (`service-auth.middleware.ts`)
   - Service-to-service authentication
   - Request signature verification
   - Service identity propagation
   - Token rotation

6. **Webhook Verification Middleware** (`webhook-verification.middleware.ts`)
   - Webhook signature verification
   - Idempotency checking
   - Replay attack prevention
   - Multi-provider support (Stripe, Resend, generic)

## Usage Examples

### Basic Authentication

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    
    return NextResponse.json({
      message: 'Authenticated',
      userId: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
```

### Role-Based Authorization

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware';

export async function DELETE(req: NextRequest) {
  try {
    // Only admins can access this endpoint
    const { user } = await requireAdmin(req);
    
    // Perform admin operation
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'ROLE_REQUIRED') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
```

### Permission-Based Authorization

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';

export async function GET(req: NextRequest) {
  try {
    // Require specific permission
    const { user } = await withPermission(req, [
      PERMISSIONS.PROJECTS_VIEW_ALL,
    ]);
    
    // User has required permission
    return NextResponse.json({ projects: [] });
  } catch (error) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }
}
```

### Resource Ownership Verification

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireOwnership } from '@/lib/middleware';

export async function PUT(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { user } = await requireAuth(req);
    
    // Verify user owns the project
    await requireOwnership(user, 'project', params.projectId);
    
    // User has access, proceed with update
    const body = await req.json();
    // Update project...
    
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'Access denied to this project' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
```

### Service-to-Service Authentication

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireServiceAuth } from '@/lib/middleware';

export async function POST(req: NextRequest) {
  try {
    // Only allow specific internal services
    const { serviceId } = await requireServiceAuth(req, [
      'analytics-processor',
      'background-job',
    ]);
    
    const body = await req.json();
    
    // Process service request
    return NextResponse.json({
      processed: true,
      serviceId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Service authentication required' },
      { status: 401 }
    );
  }
}
```

### Webhook Verification

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireWebhookVerification, markWebhookProcessed } from '@/lib/middleware';

export async function POST(req: NextRequest) {
  let eventId: string | undefined;
  
  try {
    const rawBody = await req.text();
    
    // Verify Stripe webhook signature
    const verification = await requireWebhookVerification(req, rawBody, {
      provider: 'stripe',
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
      maxAgeSeconds: 300,
      checkIdempotency: true,
    });
    
    eventId = verification.eventId;
    
    // Parse and process event
    const event = JSON.parse(rawBody);
    // Handle event...
    
    // Mark as processed to prevent duplicates
    await markWebhookProcessed('stripe', eventId!, 200);
    
    return NextResponse.json({ received: true });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'INVALID_SIGNATURE') {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    if (err.code === 'DUPLICATE_EVENT') {
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}
```

## Authentication Methods

### Session-Based (Default)

Uses Auth.js (NextAuth) session cookies. Automatically applied when user is logged in through the web interface.

### JWT Bearer Token

For API clients that can't use cookies:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key

For third-party integrations:

```bash
Authorization: ApiKey yg_live_abc123...
# or
X-API-Key: yg_live_abc123...
```

### Service Token

For internal services:

```bash
Authorization: Service svc_analytics-processor_xyz789...
```

## Error Codes

### Authentication Errors (401)

- `NO_CREDENTIALS` - No authentication credentials provided
- `INVALID_TOKEN` - Token is malformed or invalid
- `EXPIRED_TOKEN` - Token has expired
- `USER_NOT_FOUND` - User associated with credentials not found
- `ACCOUNT_INACTIVE` - User account is inactive or deleted

### Authorization Errors (403)

- `FORBIDDEN` - Generic authorization failure
- `ROLE_REQUIRED` - User doesn't have required role
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions

### Rate Limiting (429)

- `RATE_LIMITED` - Too many requests from this user/IP

### Webhook Errors

- `INVALID_SIGNATURE` - Webhook signature verification failed
- `MISSING_SIGNATURE` - Required signature header missing
- `REPLAY_ATTACK` - Webhook timestamp too old
- `DUPLICATE_EVENT` - Event already processed

## Best Practices

### 1. Always Use HTTPS in Production

All authentication mechanisms rely on secure transport. Never use these middlewares over HTTP in production.

### 2. Combine Multiple Checks When Needed

```typescript
const { user } = await requireAuth(req);
await requireRole(user, ['ADMIN']);
await requireOwnership(user, 'project', projectId);
```

### 3. Use Specific Error Messages

Provide clear error messages to help developers debug authentication issues, but avoid exposing sensitive information.

### 4. Log All Authorization Failures

The middleware automatically logs authentication and authorization failures for security monitoring.

### 5. Cache Ownership Checks

The ownership middleware automatically caches results. Invalidate cache when ownership changes:

```typescript
import { invalidateOwnershipCache } from '@/lib/middleware';

await invalidateOwnershipCache('project', projectId);
```

### 6. Rotate API Keys and Service Tokens Regularly

Set up automated rotation for long-lived credentials:

```typescript
import { rotateApiKey, rotateServiceToken } from '@/lib/middleware';

// Rotate API key with 7-day grace period
await rotateApiKey(keyId, userId, 7);

// Rotate service token with 24-hour grace period
await rotateServiceToken('analytics-processor', 24);
```

## Performance Considerations

### Caching

- Permission checks are cached per request
- Ownership checks are cached in Redis (5-minute TTL)
- API key validations are cached

### Rate Limiting

Enable rate limiting for public endpoints:

```typescript
await requireAuth(req, {
  enableRateLimiting: true,
  rateLimitAction: 'api',
});
```

### Database Queries

- Ownership checks use efficient joins
- User data is loaded once per request
- Consider adding database indexes on frequently queried fields

## Security Features

### Constant-Time Comparisons

All signature verifications use constant-time comparison to prevent timing attacks.

### Replay Attack Prevention

Webhook and service requests include timestamp validation (default: 5 minutes).

### Idempotency

Webhook processing uses idempotency keys to prevent duplicate processing.

### Audit Logging

All authentication and authorization events are logged for security monitoring.

## Integration with Existing Code

The middleware integrates seamlessly with existing authentication infrastructure:

- Works with Auth.js (NextAuth) configuration in `src/lib/auth.ts`
- Uses existing permission service in `src/lib/services/permission.service.ts`
- Leverages existing audit service in `src/lib/services/audit.service.ts`
- Integrates with Redis rate limiter in `src/lib/redis/rate-limiter.ts`
- Uses idempotency service in `src/modules/system/services/idempotency.service.ts`

## Testing

See example implementations in:
- `/api/examples/admin/route.ts` - Admin-only endpoint
- `/api/examples/projects/[projectId]/route.ts` - Resource ownership
- `/api/examples/permissions/route.ts` - Permission-based access
- `/api/examples/service/route.ts` - Service authentication
- `/api/webhooks/stripe/route.ts` - Stripe webhook handling
- `/api/webhooks/resend/route.ts` - Resend webhook handling

## Future Enhancements

### API Key Database Table

Currently, API keys are stored in Redis cache. A dedicated database table will be added for persistent storage:

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  scopes JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0
);
```

### mTLS Support

Mutual TLS authentication for the highest security service-to-service communication.

### OAuth2 Scope Support

Enhanced OAuth2 integration with granular scopes for third-party applications.

### Multi-Factor Authentication

Integration with MFA providers for enhanced security.
