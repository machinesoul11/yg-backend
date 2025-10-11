# User Roles - YES GODDESS Platform

## Overview

The YES GODDESS platform uses a role-based access control (RBAC) system with four primary user roles. Each role has specific permissions and capabilities within the platform.

## Role Definitions

### ADMIN
**Description:** Platform administrator with full access to all features and data.

**Capabilities:**
- Full access to all platform data and operations
- User management (view, create, edit, delete users)
- Role assignment and management
- Creator verification and approval
- Brand verification and approval
- IP asset oversight (view all, transfer ownership)
- License management (view all, approve, terminate)
- Royalty run execution and management
- Payout processing and approval
- System configuration and feature flags
- Audit log access and export
- Platform analytics and reporting

**Typical Users:** Platform operators, system administrators, compliance officers

---

### CREATOR
**Description:** Content creator who owns IP assets and earns royalties from licensing.

**Capabilities:**
- Create and manage own creator profile
- Upload and manage own IP assets (images, videos, audio, etc.)
- View and respond to license proposals for their assets
- Approve or reject license agreements
- View own royalty statements and earnings
- Manage payout preferences (Stripe Connect)
- View own analytics and performance metrics
- Transfer or co-own IP assets
- Set pricing and licensing terms for assets

**Access Restrictions:**
- Cannot view other creators' private data
- Cannot access brand-specific operations
- Cannot view platform-wide analytics
- Cannot perform admin functions

**Typical Users:** Photographers, videographers, illustrators, designers, musicians, content creators

---

### BRAND
**Description:** Brand/company that licenses IP assets for campaigns and projects.

**Capabilities:**
- Create and manage own brand profile
- Create and manage projects
- Browse and search creator portfolios (public profiles only)
- Propose license agreements for IP assets
- Manage active licenses and campaigns
- Invite and manage brand team members
- Upload brand guidelines
- View own project analytics
- Process payments for licenses
- View own licensing history

**Access Restrictions:**
- Cannot view other brands' private data
- Cannot access creator payout information
- Cannot view royalty calculations
- Cannot perform admin functions
- Cannot create or own IP assets (must license from creators)

**Typical Users:** Marketing managers, brand managers, creative directors, agency leads

---

### VIEWER
**Description:** Basic user with limited read-only access to public content.

**Capabilities:**
- Browse public creator portfolios
- View public project showcases
- Search available IP assets (public marketplace)
- Register and create account
- Update own profile information
- View platform information and guidelines

**Access Restrictions:**
- Cannot create projects or licenses
- Cannot upload IP assets
- Cannot propose licensing deals
- Cannot view private data or analytics
- Cannot access admin functions
- Intended as starting point before upgrading to CREATOR or BRAND

**Typical Users:** New registrations, guests exploring the platform, users evaluating whether to become creators or brands

---

## Role Hierarchy

The platform uses a hierarchical role system for privilege comparisons:

```
ADMIN (Level 0) - Highest privilege
├── CREATOR (Level 1) - Mid-level privilege
├── BRAND (Level 1) - Mid-level privilege
└── VIEWER (Level 2) - Lowest privilege
```

**Note:** CREATOR and BRAND are on the same hierarchy level but have different permissions. They are not interchangeable.

---

## Role Transitions

### Default Assignment
- New user registrations default to **VIEWER** role
- Users remain VIEWER until they complete profile setup and verification

### Automatic Role Transitions

#### VIEWER → CREATOR
**Trigger:** Creator profile created and verified by admin
**Process:**
1. User creates creator profile with portfolio samples
2. Admin reviews and approves creator verification
3. System automatically assigns CREATOR role
4. User receives email notification of role change

#### VIEWER → BRAND
**Trigger:** Brand profile created and verified by admin
**Process:**
1. User creates brand profile with company information
2. Admin reviews and verifies brand legitimacy
3. System automatically assigns BRAND role
4. User receives email notification of role change

### Manual Role Transitions

#### Any Role → ADMIN
**Authorization:** Requires existing ADMIN
**Process:**
1. Admin manually assigns ADMIN role through admin dashboard
2. Reason for assignment must be documented
3. Change is logged in audit trail
4. Target user receives email notification

#### CREATOR/BRAND → VIEWER
**Trigger:** Account downgrade or deactivation
**Authorization:** ADMIN or self-initiated
**Process:**
1. Profile deactivation or voluntary downgrade
2. Role changed to VIEWER
3. Access to creator/brand features revoked
4. Historical data retained but access restricted

---

## Invalid Role Transitions

The following transitions are **NOT** allowed:

- ❌ **CREATOR → BRAND** (or vice versa)
  - Reason: Conflicting business models and data access requirements
  - Solution: Create separate account or contact support for special cases

- ❌ **VIEWER → ADMIN** (direct)
  - Reason: Security - admins must be manually vetted
  - Solution: Must go through manual admin assignment by existing admin

- ❌ **ADMIN → Any other role** (automatic)
  - Reason: Prevents accidental privilege loss
  - Solution: Must be manually changed by another admin

- ❌ **Same role → Same role**
  - Reason: No-op, already has that role
  - Solution: System will reject redundant assignment

---

## Role Assignment Rules

### Who Can Assign Roles?

- **ADMIN** - Can assign any role to any user
- **SYSTEM** - Can auto-assign CREATOR/BRAND roles upon verification
- **All other roles** - Cannot assign roles

### Assignment Auditing

All role changes are logged in the audit trail with:
- Previous role value
- New role value
- User who made the change (or "SYSTEM" for automatic)
- Timestamp
- Reason (for manual changes)
- IP address and user agent (if available)

### Role Change Notifications

When a user's role changes:
1. Email notification sent to user's registered email
2. Notification includes old role, new role, who made the change, and when
3. User may need to log out and back in for new permissions to take effect

---

## Technical Implementation

### Database Schema
```prisma
enum UserRole {
  ADMIN
  CREATOR
  BRAND
  VIEWER
}

model User {
  role UserRole @default(VIEWER)
  // ... other fields
}
```

### Session/JWT
User role is embedded in JWT token and available in session:
```typescript
session.user.role // 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER'
```

### Middleware Protection
Routes are protected based on role in Next.js middleware:
- `/admin/*` - ADMIN only
- `/creator/*` - CREATOR only
- `/brand/*` - BRAND only
- `/api/trpc/*` - Various role requirements per endpoint

---

## Best Practices

1. **Never trust client-side role information** - Always verify on server
2. **Check role on every protected operation** - Don't cache role checks
3. **Use typed constants** - Import from `@/lib/constants/roles`
4. **Log all role changes** - Use audit service
5. **Notify users** - Send email on role changes
6. **Document reasons** - Require reason for manual admin assignments
7. **Test thoroughly** - Verify role checks on all protected endpoints

---

## Related Documentation

- [Authentication Implementation](../AUTH_IMPLEMENTATION.md)
- [Role Transitions](./role-transitions.md)
- [Permission System](./permissions.md)
- [Audit Logging](../../operations/audit-logging.md)

---

**Last Updated:** October 11, 2025
