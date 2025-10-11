# Role Management API Documentation

## Overview

The Role Management API provides admin-only endpoints for managing user roles within the YES GODDESS platform. All endpoints require ADMIN role authentication.

**Base Path:** `/api/trpc/roles`

---

## Endpoints

### 1. List Users

**Path:** `roles.listUsers`  
**Type:** Query  
**Authorization:** ADMIN only

Lists all users with their current roles, supporting pagination, filtering, and search.

#### Input Parameters

```typescript
{
  page?: number;           // Page number (default: 1)
  limit?: number;          // Results per page (1-100, default: 20)
  roleFilter?: UserRole;   // Filter by role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER'
  searchQuery?: string;    // Search by email or name
  sortBy?: string;         // 'createdAt' | 'email' | 'name' | 'role' (default: 'createdAt')
  sortOrder?: string;      // 'asc' | 'desc' (default: 'desc')
}
```

#### Response

```typescript
{
  data: Array<{
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
    role: UserRole;
    roleDisplayName: string;
    email_verified: Date | null;
    createdAt: Date;
    lastLoginAt: Date | null;
    isActive: boolean;
  }>;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

#### Example Request

```typescript
const result = await trpc.roles.listUsers.query({
  page: 1,
  limit: 20,
  roleFilter: 'CREATOR',
  searchQuery: 'john',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});
```

---

### 2. Get User Role

**Path:** `roles.getUserRole`  
**Type:** Query  
**Authorization:** ADMIN only

Retrieves detailed role information for a specific user.

#### Input Parameters

```typescript
{
  userId: string;  // CUID of the user
}
```

#### Response

```typescript
{
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  roleDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
  creator?: {
    id: string;
    verificationStatus: string;
    verifiedAt: Date | null;
  };
  brand?: {
    id: string;
    verificationStatus: string;
    verifiedAt: Date | null;
  };
}
```

#### Example Request

```typescript
const user = await trpc.roles.getUserRole.query({
  userId: 'clx1234567890abcdef'
});
```

#### Error Responses

- **404 NOT_FOUND:** User not found
- **403 FORBIDDEN:** Not authorized (non-admin)
- **401 UNAUTHORIZED:** Not authenticated

---

### 3. Assign Role

**Path:** `roles.assignRole`  
**Type:** Mutation  
**Authorization:** ADMIN only

Assigns a new role to a user. Validates role transitions and logs the change to audit trail.

#### Input Parameters

```typescript
{
  userId: string;      // CUID of the user to update
  role: UserRole;      // New role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER'
  reason?: string;     // Optional reason for role change (10-500 characters)
}
```

#### Response

```typescript
{
  success: boolean;
  message: string;  // e.g., "Role changed from Viewer to Creator"
  data: {
    success: boolean;
    previousRole: UserRole;
    newRole: UserRole;
  };
}
```

#### Example Request

```typescript
const result = await trpc.roles.assignRole.mutate({
  userId: 'clx1234567890abcdef',
  role: 'CREATOR',
  reason: 'User completed creator profile verification'
});
```

#### Business Rules

1. User cannot already have the target role
2. Role transition must be valid (see Role Transitions below)
3. Only admins can assign roles
4. User receives email notification of role change
5. Change is logged to audit trail with before/after values

#### Valid Role Transitions

| From     | To                        | Notes                          |
|----------|---------------------------|--------------------------------|
| VIEWER   | CREATOR, BRAND, ADMIN     | Standard progression           |
| CREATOR  | VIEWER, ADMIN             | Downgrade or elevation         |
| BRAND    | VIEWER, ADMIN             | Downgrade or elevation         |
| ADMIN    | (None)                    | Must be changed by another admin |

#### Invalid Transitions

- ❌ CREATOR → BRAND (or vice versa) - Conflicting roles
- ❌ Same role → Same role - No-op
- ❌ VIEWER → ADMIN - Must be manual admin assignment
- ❌ Any → ADMIN (automatic) - Security restriction

#### Error Responses

- **400 BAD_REQUEST:** Invalid role, same role assignment, or invalid transition
- **404 NOT_FOUND:** User or assigner not found
- **403 FORBIDDEN:** Not authorized to assign role
- **500 INTERNAL_SERVER_ERROR:** Database or transaction error

---

### 4. Get Role History

**Path:** `roles.getRoleHistory`  
**Type:** Query  
**Authorization:** ADMIN only

Retrieves the complete history of role changes for a user from audit logs.

#### Input Parameters

```typescript
{
  userId: string;   // CUID of the user
  limit?: number;   // Max results (1-100, default: 50)
}
```

#### Response

```typescript
{
  data: Array<{
    id: string;
    timestamp: Date;
    previousRole: UserRole | null;
    newRole: UserRole | null;
    assignedBy: {
      id: string;
      email: string;
      name: string | null;
    } | null;
    reason: string | null;
    ipAddress: string | null;
  }>;
  total: number;
}
```

#### Example Request

```typescript
const history = await trpc.roles.getRoleHistory.query({
  userId: 'clx1234567890abcdef',
  limit: 50
});
```

---

### 5. Bulk Assign Role

**Path:** `roles.bulkAssignRole`  
**Type:** Mutation  
**Authorization:** ADMIN only

Assigns the same role to multiple users simultaneously. Useful for bulk operations.

#### Input Parameters

```typescript
{
  userIds: string[];   // Array of user CUIDs (1-100 users)
  role: UserRole;      // Role to assign to all users
  reason: string;      // Reason for bulk assignment (10-500 characters, required)
}
```

#### Response

```typescript
{
  success: boolean;
  message: string;  // e.g., "Successfully assigned Creator role to 15 user(s)"
  data: {
    successful: string[];  // User IDs that were successfully updated
    failed: Array<{
      userId: string;
      error: string;
    }>;
  };
}
```

#### Example Request

```typescript
const result = await trpc.roles.bulkAssignRole.mutate({
  userIds: ['clx111...', 'clx222...', 'clx333...'],
  role: 'CREATOR',
  reason: 'Batch approval of verified creator applications'
});
```

#### Business Rules

1. Maximum 100 users per bulk operation
2. Each assignment validated independently
3. Failures don't stop processing of other users
4. Each user receives individual email notification
5. Each change logged separately in audit trail

---

### 6. Get Role Statistics

**Path:** `roles.getRoleStatistics`  
**Type:** Query  
**Authorization:** ADMIN only

Returns aggregated statistics about role distribution across the platform.

#### Input Parameters

None

#### Response

```typescript
{
  byRole: Array<{
    role: UserRole;
    roleDisplayName: string;
    count: number;
  }>;
  total: number;
}
```

#### Example Request

```typescript
const stats = await trpc.roles.getRoleStatistics.query();

// Example response:
// {
//   byRole: [
//     { role: 'ADMIN', roleDisplayName: 'Administrator', count: 5 },
//     { role: 'CREATOR', roleDisplayName: 'Creator', count: 234 },
//     { role: 'BRAND', roleDisplayName: 'Brand', count: 87 },
//     { role: 'VIEWER', roleDisplayName: 'Viewer', count: 1023 }
//   ],
//   total: 1349
// }
```

---

## Role Definitions

### ADMIN
- **Description:** Platform administrator with full access
- **Capabilities:** Full platform access, user management, role assignment, system configuration
- **Typical Users:** Platform operators, system administrators

### CREATOR
- **Description:** Content creator who owns IP assets
- **Capabilities:** Upload assets, manage licenses, view royalties, receive payouts
- **Typical Users:** Photographers, videographers, designers, artists

### BRAND
- **Description:** Brand/company that licenses IP assets
- **Capabilities:** Create projects, propose licenses, manage team, view analytics
- **Typical Users:** Marketing managers, creative directors, brand managers

### VIEWER
- **Description:** Basic user with read-only access
- **Capabilities:** Browse public content, view marketplace
- **Typical Users:** New registrations, exploratory users

---

## Email Notifications

When a role is changed, the user receives an email notification containing:

- Previous role and new role
- Administrator who made the change
- Date and time of change
- Reason (if provided)
- Link to contact support if unexpected
- Security notice that changes are audited

**Template:** `role-changed`  
**Subject:** "Your YES GODDESS Role Has Been Updated"

---

## Audit Logging

All role changes are automatically logged to the audit trail with:

- **Action:** `ROLE_CHANGED`
- **Entity Type:** `user`
- **Entity ID:** User ID
- **User ID:** Admin who made the change
- **Before:** Previous role details
- **After:** New role details, reason, assigner info
- **Context:** IP address, user agent, request ID

Audit logs can be queried using the `roles.getRoleHistory` endpoint.

---

## Security Considerations

1. **Admin-Only Access:** All endpoints require ADMIN role
2. **Role Transition Validation:** Invalid transitions are blocked
3. **Audit Trail:** All changes are logged with full context
4. **Email Notifications:** Users are notified of role changes
5. **Session Refresh:** Users may need to log out/in for changes to take effect
6. **Transaction Safety:** Role updates use database transactions
7. **Failure Handling:** Email failures don't prevent role assignment

---

## Best Practices

1. **Always provide a reason** for role changes (helps with auditing)
2. **Review role history** before making changes
3. **Use bulk operations** for multiple users to save time
4. **Monitor role statistics** to understand platform composition
5. **Document manual ADMIN assignments** for compliance
6. **Notify users** before role changes when possible
7. **Test in development** before bulk operations

---

## Error Handling

Common error codes and their meanings:

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Invalid input or business rule violation | Check input parameters and role transitions |
| 401 | Not authenticated | User needs to log in |
| 403 | Not authorized | User lacks ADMIN role |
| 404 | User not found | Verify user ID is correct |
| 500 | Server error | Contact support or retry |

---

## Rate Limiting

While not currently implemented, consider:
- Max 100 role changes per minute per admin
- Max 1000 users in bulk operations per day
- Alert on suspicious patterns (e.g., rapid role escalations)

---

## Related Documentation

- [User Roles Guide](../../modules/authentication/roles.md)
- [Audit Logging](../../operations/audit-logging.md)
- [Email Templates](../../infrastructure/email/templates.md)
- [tRPC API Overview](../api-overview.md)

---

**Last Updated:** October 11, 2025  
**API Version:** 1.0.0
