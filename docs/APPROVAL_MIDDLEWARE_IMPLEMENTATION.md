# Approval Workflow Middleware & Permission Utilities - Implementation Complete

## Overview

This implementation adds approval workflow middleware and permission utility functions to the backend authorization system. The system integrates seamlessly with the existing approval infrastructure in `@/permissions/approvalRules` and permission service.

## Implementation Files

### 1. Approval Middleware (`src/lib/middleware/approval.middleware.ts`)

**Purpose**: Provides tRPC middleware for conditional execution based on user seniority and approval requirements.

**Key Functions**:

#### `requireApprovalOrExecute(config)`
Main middleware that intercepts actions requiring approval and either:
- Executes immediately if user has senior-level authorization
- Creates an approval request if user requires authorization

**Configuration Options**:
```typescript
{
  actionType: Permission | string;      // Action that may require approval
  getDepartment: (ctx) => Department;   // Extract department for routing
  getDataPayload: (input) => object;    // Extract data for approval request
  getMetadata?: (input, ctx) => object; // Optional additional context
  approvalRequiredMessage?: string;     // Custom approval message
  skipApprovalCheck?: boolean;          // Emergency override
}
```

**Returns**:
- For senior users: Proceeds with normal execution
- For junior users requiring approval: `ApprovalRequiredResponse` object

#### `requireSenior(customMessage?)`
Simpler middleware that blocks non-senior users without creating approval requests.

**Integration with Existing Systems**:
- Uses `requiresApproval()` from `@/permissions/approvalRules`
- Uses `createApprovalRequest()` for creating approval records
- Uses `permissionService.isSenior()` for seniority checks
- Logs all actions via `auditService`

---

### 2. Permission Utilities (`src/lib/utils/permission-helpers.ts`)

**Purpose**: Provides utility functions for conditional and combined permission checking.

**Key Functions**:

#### `permitIf(condition, permission, user)`
Checks permission only if condition is met.

```typescript
// Only check edit permission if user owns resource
const canEdit = await permitIf(
  isOwner,
  PERMISSIONS.CONTENT_EDIT_OWN,
  userId
);
```

**Behavior**:
- Condition false → returns `false` immediately (short-circuit)
- Condition true → checks if user has permission
- Supports boolean values and async functions as conditions

#### `permitAny(permissions, user)`
Checks if user has ANY of the specified permissions (OR logic).

```typescript
// User can view if they have either permission
const canView = await permitAny(
  [PERMISSIONS.PROJECTS_VIEW_OWN, PERMISSIONS.PROJECTS_VIEW_ALL],
  userId
);
```

**Behavior**:
- Returns `true` as soon as any permission matches (short-circuit)
- Empty array → returns `false` (fail closed)
- Uses `permissionService.hasAnyPermission()`

#### `permitAll(permissions, user)`
Checks if user has ALL of the specified permissions (AND logic).

```typescript
// User must have both permissions
const canProcess = await permitAll(
  [PERMISSIONS.PAYOUTS_VIEW_ALL, PERMISSIONS.PAYOUTS_PROCESS],
  userId
);
```

**Behavior**:
- Returns `false` as soon as any permission check fails (short-circuit)
- Empty array → returns `true` (vacuous truth)
- Uses `permissionService.hasAllPermissions()`

#### Advanced Helpers

**`permitIfAny(condition, permissions, user)`**
Combines `permitIf` and `permitAny`: checks condition, then checks if user has any permission.

**`permitIfAll(condition, permissions, user)`**
Combines `permitIf` and `permitAll`: checks condition, then checks if user has all permissions.

**`permitSeniorIf(condition, user)`**
Checks if user has senior seniority, but only if condition is met.

**`permitSeniorOrPermission(permission, user)`**
Checks if user is either senior OR has the specified permission.

**`permitSeniorAndPermission(permission, user)`**
Checks if user is both senior AND has the specified permission.

---

## Usage Examples

### Example 1: Large Payout Approval

```typescript
import { requireApprovalOrExecute } from '@/lib/middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';

const initiatePayoutProcedure = protectedProcedure
  .input(z.object({
    amountCents: z.number(),
    payoutId: z.string(),
  }))
  .use(requireApprovalOrExecute({
    actionType: PERMISSIONS.FINANCE_INITIATE_PAYOUTS,
    getDepartment: () => Department.FINANCE_LICENSING,
    getDataPayload: (input) => ({
      amountCents: input.amountCents,
      payoutId: input.payoutId,
    }),
    approvalRequiredMessage: 'Large payout requires senior approval',
  }))
  .mutation(async ({ ctx, input }) => {
    // This only executes if:
    // 1. Amount < threshold, OR
    // 2. User is senior, OR
    // 3. Approval was granted
    return await processPayout(input.payoutId);
  });
```

**Workflow**:
1. Middleware checks if payout amount triggers approval requirement
2. If yes, checks if user has senior seniority
3. Senior users → execute immediately
4. Junior users → create approval request, return `ApprovalRequiredResponse`

### Example 2: User Deletion with Approval

```typescript
const deleteUserProcedure = protectedProcedure
  .input(z.object({ userId: z.string() }))
  .use(requireApprovalOrExecute({
    actionType: PERMISSIONS.USERS_DELETE_USER,
    getDepartment: (ctx) => ctx.session.user.department,
    getDataPayload: (input) => ({ userId: input.userId }),
  }))
  .mutation(async ({ ctx, input }) => {
    return await deleteUser(input.userId);
  });
```

### Example 3: Conditional Permissions

```typescript
import { permitIf, permitAny } from '@/lib/utils';

// Check edit permission only if user owns resource
const resource = await getResource(resourceId);
const isOwner = resource.ownerId === userId;

const canEdit = await permitIf(
  isOwner,
  PERMISSIONS.CONTENT_EDIT_OWN,
  userId
);

// Check if user can view (needs either permission)
const canView = await permitAny(
  [PERMISSIONS.CONTENT_VIEW_OWN, PERMISSIONS.CONTENT_VIEW_ALL],
  userId
);

// Check if user can publish (needs all permissions)
const canPublish = await permitAll(
  [PERMISSIONS.CONTENT_EDIT, PERMISSIONS.CONTENT_PUBLISH],
  userId
);
```

### Example 4: Senior-Only Operations

```typescript
import { requireSenior } from '@/lib/middleware';

const criticalOperationProcedure = protectedProcedure
  .use(requireSenior('This critical operation requires senior-level access'))
  .mutation(async ({ ctx, input }) => {
    // Only senior users reach this code
    return await performCriticalOperation();
  });
```

### Example 5: Response Handling

```typescript
import { isApprovalRequired } from '@/lib/middleware';

// Client-side usage
const result = await trpc.finance.initiatePayout.mutate({ 
  amountCents: 1500000 
});

if (isApprovalRequired(result)) {
  // Display approval pending message
  console.log(result.message);
  console.log('Approval Request ID:', result.approvalRequestId);
  
  // Navigate to approval tracking page
  router.push(`/approvals/${result.approvalRequestId}`);
} else {
  // Normal execution result
  console.log('Payout processed:', result);
}
```

---

## Integration Points

### Existing Systems Used

1. **ApprovalRequest Model** (Prisma schema)
   - Already exists with proper fields
   - Stores action type, requester, department, data payload, status

2. **Approval Rules** (`@/permissions/approvalRules`)
   - `requiresApproval()` - Checks if action needs approval
   - `createApprovalRequest()` - Creates approval record
   - `REQUIRES_SENIOR_APPROVAL` - Configuration map

3. **Permission Service** (`@/lib/services/permission.service`)
   - `isSenior()` - Checks user seniority level
   - `hasPermission()` - Checks single permission
   - `hasAnyPermission()` - Checks multiple permissions (OR)
   - `hasAllPermissions()` - Checks multiple permissions (AND)

4. **Audit Service** (`@/lib/services/audit.service`)
   - Logs all approval-related actions
   - Tracks senior access grants/denials

5. **AdminRole System** (Database)
   - Department enum
   - Seniority enum (JUNIOR, SENIOR)
   - Active status and expiration tracking

### Database Queries

All database operations use existing Prisma models:
- `user.findUnique()` - Fetch user with admin roles
- `approvalRequest.create()` - Create approval requests
- Uses existing indexes for performance

### Caching

Permission checks leverage existing caching infrastructure:
- Redis caching via `permissionService`
- Request-level caching for repeated checks
- 15-minute TTL on permission cache

---

## Security Considerations

### Fail-Safe Defaults

1. **Permission Helpers**: All errors → return `false` (fail closed)
2. **Empty Permission Arrays**:
   - `permitAny([])` → `false` (deny access)
   - `permitAll([])` → `true` (vacuous truth, no restrictions)

3. **Approval Bypass**: Only senior users with active, non-expired roles

### Audit Trail

All actions are logged:
- Approval request creation
- Senior direct execution
- Senior access grants/denials
- Actions executed without approval requirements

### Self-Approval Prevention

Users cannot approve their own requests:
- Enforced in existing `canApprove()` function
- Middleware uses existing validation

### Seniority Verification

Multi-layer checks:
1. AdminRole must exist
2. Must be active (`isActive: true`)
3. Must not be expired (`expiresAt > now` or `null`)
4. Must have `seniority: SENIOR`

---

## Error Handling

### TRPCError Codes

- `UNAUTHORIZED` - User not authenticated
- `FORBIDDEN` - User lacks required seniority/permissions
- `INTERNAL_SERVER_ERROR` - Unexpected errors

### Graceful Degradation

- Database errors → fail closed (deny access)
- Cache errors → fallback to database query
- Logging failures → don't block request

---

## Performance Characteristics

### Optimizations

1. **Short-Circuit Evaluation**:
   - `permitAny` returns on first match
   - `permitAll` returns on first failure
   - `permitIf` returns early if condition false

2. **Caching**:
   - Permission checks cached for 15 minutes
   - Seniority checks cached
   - Request-level cache for repeated checks

3. **Parallel Queries**:
   - `permitSeniorAndPermission` uses `Promise.all()`
   - User admin roles fetched once per request

### Database Impact

- Approval request creation: 1 INSERT query
- User role check: 1 SELECT (cached)
- Permission checks: cached or 1 SELECT

---

## Testing Recommendations

### Unit Tests

```typescript
describe('permitIf', () => {
  it('should return false if condition is false', async () => {
    const result = await permitIf(false, PERMISSIONS.CONTENT_EDIT, userId);
    expect(result).toBe(false);
  });

  it('should check permission if condition is true', async () => {
    const result = await permitIf(true, PERMISSIONS.CONTENT_EDIT, userId);
    // Result depends on user's actual permissions
  });
});

describe('requireApprovalOrExecute', () => {
  it('should create approval request for junior users', async () => {
    // Test with junior user
    // Verify approval request created
    // Verify procedure doesn't execute
  });

  it('should allow execution for senior users', async () => {
    // Test with senior user
    // Verify no approval request created
    // Verify procedure executes
  });
});
```

### Integration Tests

```typescript
describe('Approval Workflow', () => {
  it('should handle large payout approval workflow', async () => {
    // 1. Junior user initiates large payout
    // 2. Verify approval request created
    // 3. Senior user approves request
    // 4. Verify payout processed
  });
});
```

---

## Migration Notes

### No Database Changes Required

All necessary database models already exist:
- `ApprovalRequest` table
- `AdminRole` table
- `Seniority` enum
- `Department` enum
- `ApprovalStatus` enum

### No Breaking Changes

This is purely additive:
- New middleware functions
- New utility functions
- Existing code continues to work unchanged

### Backward Compatibility

All existing middleware and permission checks continue to function:
- `requirePermission()` unchanged
- `requireAnyPermission()` unchanged
- `requireAllPermissions()` unchanged
- Express middleware unchanged

---

## Exports

### From `@/lib/middleware`

```typescript
import {
  requireApprovalOrExecute,
  requireSenior,
  isApprovalRequired,
  type ApprovalOrExecuteConfig,
  type ApprovalRequiredResponse,
} from '@/lib/middleware';
```

### From `@/lib/utils`

```typescript
import {
  permitIf,
  permitAny,
  permitAll,
  permitIfAny,
  permitIfAll,
  permitSeniorIf,
  permitSeniorOrPermission,
  permitSeniorAndPermission,
} from '@/lib/utils';
```

---

## Next Steps for Developers

1. **Apply to Existing Routes**: Identify routes that need approval workflows
2. **Configure Approval Rules**: Add new action types to `REQUIRES_SENIOR_APPROVAL`
3. **Create Approval UI**: Build admin interface for viewing/approving requests
4. **Add Notifications**: Notify seniors when approval requests are created
5. **Implement Auto-Execution**: Optionally execute approved actions automatically

---

## Support

For questions or issues:
1. Review existing approval system in `@/permissions/approvalRules`
2. Check permission service implementation
3. Review audit logs for troubleshooting
4. Test with both senior and junior users

---

## Summary

✅ **requireApprovalOrExecute Middleware** - Complete
- Checks if action requires approval
- Allows senior users immediate execution
- Creates approval requests for junior users
- Returns appropriate responses

✅ **Middleware Utilities** - Complete
- `permitIf(condition, permission)` - Conditional permission check
- `permitAny(...permissions)` - OR logic permission check
- `permitAll(...permissions)` - AND logic permission check
- Additional advanced helpers for complex scenarios

All implementations follow existing architectural patterns, integrate with current systems, and maintain backward compatibility.
