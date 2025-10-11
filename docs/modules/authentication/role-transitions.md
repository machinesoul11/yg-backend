# Role Transitions - YES GODDESS Platform

## Overview

This document defines the valid and invalid transitions between user roles on the YES GODDESS platform, along with the business logic and automation rules for each transition.

---

## Role Transition Matrix

| From Role | To Role | Valid? | Trigger | Notes |
|-----------|---------|--------|---------|-------|
| VIEWER | CREATOR | ✅ Yes | Auto/Manual | Automatic on creator verification |
| VIEWER | BRAND | ✅ Yes | Auto/Manual | Automatic on brand verification |
| VIEWER | ADMIN | ✅ Yes | Manual Only | Requires existing admin approval |
| CREATOR | VIEWER | ✅ Yes | Manual Only | Account downgrade |
| CREATOR | BRAND | ❌ No | N/A | Conflicting business models |
| CREATOR | ADMIN | ✅ Yes | Manual Only | Elevation to admin |
| BRAND | VIEWER | ✅ Yes | Manual Only | Account downgrade |
| BRAND | CREATOR | ❌ No | N/A | Conflicting business models |
| BRAND | ADMIN | ✅ Yes | Manual Only | Elevation to admin |
| ADMIN | VIEWER | ✅ Yes | Manual Only | Must be done by another admin |
| ADMIN | CREATOR | ✅ Yes | Manual Only | Must be done by another admin |
| ADMIN | BRAND | ✅ Yes | Manual Only | Must be done by another admin |
| Any | Same Role | ❌ No | N/A | No-operation |

---

## Automatic Role Transitions

### VIEWER → CREATOR

**Trigger:** Creator profile verification approved by admin

**Process:**
1. User creates creator profile with portfolio samples
2. Admin reviews creator application
3. Admin approves creator verification
4. System automatically updates user role from VIEWER to CREATOR
5. User receives role change email notification
6. User's session updated with new role

**Implementation:**
```typescript
// In CreatorService.approveCreator()
await roleAssignmentService.assignCreatorRoleOnVerification(
  creator.userId,
  creatorId,
  adminUserId
);
```

**Business Logic:**
- Only happens if user's current role is VIEWER
- If user already has CREATOR role, skip role assignment
- Failure to assign role does not block verification
- Role assignment is logged separately from verification

---

### VIEWER → BRAND

**Trigger:** Brand profile verification approved by admin

**Process:**
1. User creates brand profile with company information
2. Admin reviews brand verification request
3. Admin verifies brand as legitimate
4. System automatically updates user role from VIEWER to BRAND
5. User receives role change email notification
6. User's session updated with new role

**Implementation:**
```typescript
// In BrandService.verifyBrand()
await roleAssignmentService.assignBrandRoleOnVerification(
  brand.userId,
  brandId,
  adminUserId
);
```

**Business Logic:**
- Only happens if user's current role is VIEWER
- If user already has BRAND role, skip role assignment
- Failure to assign role does not block verification
- Role assignment is logged separately from verification

---

## Manual Role Transitions

### Any Role → ADMIN

**Authorization:** Existing ADMIN only

**Use Cases:**
- Promoting trusted team members to admin
- Adding platform operators
- Granting system access to contractors

**Process:**
1. Existing admin accesses role management interface
2. Searches for target user
3. Assigns ADMIN role with documented reason
4. System validates transition
5. Role updated in database
6. Audit log created
7. Email sent to user
8. Notification sent to all admins about new admin addition

**Security Considerations:**
- Require strong reason documentation
- Log all admin assignments prominently
- Consider requiring MFA for admin role assignments
- Notify existing admins of new admin additions
- Review admin list quarterly

**Example:**
```typescript
await trpc.roles.assignRole.mutate({
  userId: 'clx123...',
  role: 'ADMIN',
  reason: 'Promoting senior team member to platform administrator for system management duties'
});
```

---

### CREATOR/BRAND → VIEWER

**Authorization:** ADMIN only

**Use Cases:**
- User wants to downgrade account
- Account suspension (use with caution)
- Role mismatch correction

**Process:**
1. Admin reviews downgrade request or determines need
2. Admin assigns VIEWER role with reason
3. User loses access to creator/brand features
4. Historical data retained but access restricted
5. User notified via email

**Considerations:**
- Check for active licenses before downgrading creators
- Check for active projects before downgrading brands
- Consider grace period for transition
- Retain historical data for compliance

**Example:**
```typescript
await trpc.roles.assignRole.mutate({
  userId: 'clx123...',
  role: 'VIEWER',
  reason: 'User requested account downgrade - all active licenses completed'
});
```

---

### ADMIN → Other Roles

**Authorization:** Different ADMIN only (cannot self-demote)

**Use Cases:**
- Admin leaving team
- Role correction
- Security incident response

**Process:**
1. Different admin initiates role change
2. Documents reason for change
3. System validates assigner is not target user
4. Role updated
5. Access immediately revoked
6. All admin team notified
7. Security review triggered

**Security:**
- Prevent self-demotion
- Require secondary admin approval for sensitive cases
- Immediate session termination
- Review all actions taken by demoted admin

---

## Invalid Transitions

### CREATOR ↔ BRAND

**Why Invalid:** 
These roles represent fundamentally different business models and data access patterns:
- Creators own IP and earn royalties
- Brands license IP and manage campaigns
- Permission structures are incompatible
- Financial flows are opposite (receive vs. pay)

**Workaround:**
If a user needs both capabilities:
1. Create separate accounts with different email addresses
2. Contact support for special enterprise arrangements
3. Use team member invitations for brand accounts

---

### Same Role → Same Role

**Why Invalid:**
No-operation that provides no value and could indicate:
- Logic error in calling code
- UI bug allowing duplicate submissions
- Misunderstanding of current state

**System Response:**
```typescript
throw new TRPCError({
  code: 'BAD_REQUEST',
  message: 'User already has Creator role'
});
```

---

## Transition Validation Logic

The role transition validator checks:

1. **Role Existence:** Both current and target roles are valid
2. **Same Role Check:** Current ≠ Target
3. **Transition Matrix:** Combination exists in VALID_ROLE_TRANSITIONS
4. **Authorization:** Assigner has permission to make change
5. **Business Rules:** No active blockers (e.g., pending payouts)

**Implementation:**
```typescript
// In role.constants.ts
export const VALID_ROLE_TRANSITIONS: Record<UserRole, UserRole[]> = {
  VIEWER: [ROLES.CREATOR, ROLES.BRAND, ROLES.ADMIN],
  CREATOR: [ROLES.VIEWER, ROLES.ADMIN],
  BRAND: [ROLES.VIEWER, ROLES.ADMIN],
  ADMIN: [], // Can be changed but validation requires special handling
};

// In role-assignment.service.ts
const isValid = isValidRoleTransition(currentRole, newRole);
if (!isValid) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Invalid transition from ${currentRole} to ${newRole}`
  });
}
```

---

## Post-Transition Actions

After any successful role transition:

1. **Database Update**
   - User.role field updated
   - Transaction committed

2. **Audit Logging**
   - Action: ROLE_CHANGED
   - Before: Previous role
   - After: New role + reason + assigner
   - Timestamp and IP captured

3. **Email Notification**
   - User receives role change email
   - Includes all details of change
   - Provides support contact

4. **Cache Invalidation**
   - User permissions cache cleared
   - Session cache updated
   - Related caches invalidated

5. **Session Handling**
   - JWT still contains old role until refresh
   - User may need to log out/in
   - Consider forcing session refresh

---

## Rollback Procedures

If a role change needs to be reversed:

1. **Immediate Rollback (within 5 minutes)**
   ```typescript
   await trpc.roles.assignRole.mutate({
     userId: 'clx123...',
     role: previousRole,
     reason: 'Rollback: Original change was made in error'
   });
   ```

2. **Document Rollback**
   - State clearly this is a rollback
   - Reference original change in audit log
   - Explain why rollback was necessary

3. **Notify User**
   - Apologize for confusion
   - Explain what happened
   - Confirm current correct role

4. **Review Process**
   - Determine why incorrect change was made
   - Update procedures to prevent recurrence
   - Additional training if needed

---

## Monitoring & Alerts

### Recommended Monitoring

1. **High-Frequency Changes**
   - Alert if same user's role changes > 3 times in 24 hours
   - May indicate system bug or malicious activity

2. **Bulk ADMIN Assignments**
   - Alert if > 5 users elevated to ADMIN in 1 hour
   - Potential security incident

3. **Invalid Transition Attempts**
   - Log all failed transition attempts
   - Review patterns monthly
   - May indicate UI bugs or user confusion

4. **Role Distribution Changes**
   - Track role counts over time
   - Alert on unexpected spikes
   - Dashboard for platform health

---

## Compliance & Auditing

### Retention

- All role changes retained indefinitely in audit log
- Cannot be deleted (compliance requirement)
- Available for export to external systems

### Reporting

Generate reports for:
- All admin role assignments in past year
- Role changes per user
- Automated vs. manual transitions
- Failed transition attempts

### Access

- Audit logs viewable by all admins
- Export capability for compliance reviews
- Integration with SIEM systems recommended

---

## Testing Checklist

When testing role transitions:

- [ ] VIEWER → CREATOR (automatic after verification)
- [ ] VIEWER → BRAND (automatic after verification)
- [ ] VIEWER → ADMIN (manual admin assignment)
- [ ] CREATOR → VIEWER (manual downgrade)
- [ ] CREATOR → ADMIN (manual elevation)
- [ ] BRAND → VIEWER (manual downgrade)
- [ ] BRAND → ADMIN (manual elevation)
- [ ] CREATOR → BRAND (should fail)
- [ ] BRAND → CREATOR (should fail)
- [ ] Same → Same (should fail)
- [ ] Email notifications sent correctly
- [ ] Audit logs created with full details
- [ ] Session updated with new role
- [ ] Permissions changed appropriately
- [ ] Rollback procedure works

---

## Related Documentation

- [User Roles Guide](./roles.md)
- [Role Management API](./role-management-api.md)
- [Permission System](./permissions.md)
- [Audit Logging](../../operations/audit-logging.md)

---

**Last Updated:** October 11, 2025  
**Version:** 1.0.0
