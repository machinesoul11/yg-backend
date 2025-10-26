# Application Permissions Implementation

## Overview

Implemented granular permission system for creator and brand application workflows. This allows for fine-grained access control over who can review, approve, reject, verify credentials, and request additional information from applicants.

## Implemented Permissions

### Creator Application Permissions

| Permission | Constant | Description |
|-----------|----------|-------------|
| `creator:review` | `PERMISSIONS.CREATOR_APPLICATION_REVIEW` | Review creator applications and view application details |
| `creator:approve` | `PERMISSIONS.CREATOR_APPLICATION_APPROVE` | Approve creator applications and activate creator accounts |
| `creator:reject` | `PERMISSIONS.CREATOR_APPLICATION_REJECT` | Reject creator applications with reason codes and feedback |
| `creator:verify` | `PERMISSIONS.CREATOR_APPLICATION_VERIFY` | Verify creator credentials, identity, and portfolio |
| `creator:request_info` | `PERMISSIONS.CREATOR_APPLICATION_REQUEST_INFO` | Request additional information from creator applicants |

### Brand Application Permissions

| Permission | Constant | Description |
|-----------|----------|-------------|
| `brand:review` | `PERMISSIONS.BRAND_APPLICATION_REVIEW` | Review brand applications and view application details |
| `brand:approve` | `PERMISSIONS.BRAND_APPLICATION_APPROVE` | Approve brand applications and activate brand accounts |
| `brand:reject` | `PERMISSIONS.BRAND_APPLICATION_REJECT` | Reject brand applications with reason codes and feedback |
| `brand:verify` | `PERMISSIONS.BRAND_APPLICATION_VERIFY` | Verify brand credentials, financial capacity, and values alignment |
| `brand:request_info` | `PERMISSIONS.BRAND_APPLICATION_REQUEST_INFO` | Request additional information from brand applicants |

## Permission Hierarchy

All application-specific permissions follow a hierarchical structure where higher-level actions implicitly include lower-level permissions:

- `creator:approve`, `creator:reject`, `creator:verify`, and `creator:request_info` all require `creator:review`
- `brand:approve`, `brand:reject`, `brand:verify`, and `brand:request_info` all require `brand:review`

## Department Role Mappings

### CREATOR_APPLICATIONS Department

Staff assigned to the `CREATOR_APPLICATIONS` department automatically receive:

- All creator-specific application permissions
- General application permissions
- Creator management permissions (view, approve, reject)
- Limited user management permissions (view/edit own profile)
- Audit log access (own actions)

### BRAND_APPLICATIONS Department

Staff assigned to the `BRAND_APPLICATIONS` department automatically receive:

- All brand-specific application permissions
- General application permissions
- Brand management permissions (view, verify, reject)
- Limited user management permissions (view/edit own profile)
- Audit log access (own actions)

## API Endpoints

### Creator Application Endpoints

#### List Creators (Admin Review)
- **Endpoint**: `creatorsRouter.listCreators`
- **Permission**: `CREATOR_APPLICATION_REVIEW`
- **Method**: Query
- **Purpose**: List all creator applications for review

#### Get Creator Details (Admin)
- **Endpoint**: `creatorsRouter.getCreatorByIdAdmin`
- **Permission**: `CREATOR_APPLICATION_REVIEW`
- **Method**: Query
- **Purpose**: View full creator application details

#### Approve Creator
- **Endpoint**: `creatorsRouter.approveCreator`
- **Permission**: `CREATOR_APPLICATION_APPROVE`
- **Method**: Mutation
- **Purpose**: Approve creator application and activate account
- **Triggers**: 
  - Creator role assignment
  - Approval email notification
  - Audit log entry

#### Reject Creator
- **Endpoint**: `creatorsRouter.rejectCreator`
- **Permission**: `CREATOR_APPLICATION_REJECT`
- **Method**: Mutation
- **Purpose**: Reject creator application with reason
- **Input**: Creator ID, rejection reason (10-500 chars)
- **Triggers**:
  - Status update to 'rejected'
  - Rejection email with reason
  - Audit log entry

#### Verify Creator Credentials
- **Endpoint**: `creatorsRouter.verifyCreator`
- **Permission**: `CREATOR_APPLICATION_VERIFY`
- **Method**: Mutation
- **Purpose**: Verify creator credentials without changing approval status
- **Input**: Creator ID, optional notes
- **Triggers**:
  - Verification metadata stored in preferences
  - Audit log entry with verification notes

#### Request Additional Info (Creator)
- **Endpoint**: `creatorsRouter.requestCreatorInfo`
- **Permission**: `CREATOR_APPLICATION_REQUEST_INFO`
- **Method**: Mutation
- **Purpose**: Request additional information from creator
- **Input**: 
  - Creator ID
  - Array of requested information items (minimum 1)
  - Message to creator (20-1000 chars)
  - Optional deadline (ISO datetime)
- **Triggers**:
  - Status update to 'pending'
  - Info request stored in creator preferences
  - Email notification to creator
  - Audit log entry

### Brand Application Endpoints

#### List Brands for Review
- **Endpoint**: `brandsRouter.listForReview`
- **Permission**: `BRAND_APPLICATION_REVIEW`
- **Method**: Query
- **Purpose**: List all brand applications for review with full admin access

#### Verify Brand
- **Endpoint**: `brandsRouter.verify`
- **Permission**: `BRAND_APPLICATION_VERIFY`
- **Method**: Mutation
- **Purpose**: Verify brand application and activate account
- **Triggers**:
  - Brand role assignment
  - Verification status update
  - Verification email notification
  - Audit log entry

#### Reject Brand
- **Endpoint**: `brandsRouter.reject`
- **Permission**: `BRAND_APPLICATION_REJECT`
- **Method**: Mutation
- **Purpose**: Reject brand application with reason
- **Input**: Brand ID, rejection reason (minimum 10 chars), optional notes
- **Triggers**:
  - Status update to 'rejected'
  - Rejection email with reason
  - Audit log entry

#### Request Additional Info (Brand)
- **Endpoint**: `brandsRouter.requestInfo`
- **Permission**: `BRAND_APPLICATION_REQUEST_INFO`
- **Method**: Mutation
- **Purpose**: Request additional information from brand
- **Input**:
  - Brand ID
  - Array of requested information items (minimum 1)
  - Message to brand (20-1000 chars)
  - Optional deadline (ISO datetime)
- **Triggers**:
  - Status update to 'pending'
  - Verification notes updated with request details
  - Email notification to brand
  - Audit log entry

## Service Layer Methods

### CreatorService

```typescript
// Existing methods enhanced with permission checks at router level
async approveCreator(creatorId: string, adminUserId: string, context?: Context): Promise<void>
async rejectCreator(creatorId: string, reason: string, adminUserId: string, context?: Context): Promise<void>

// New methods
async verifyCreator(creatorId: string, adminUserId: string, notes?: string, context?: Context): Promise<void>
async requestCreatorInfo(creatorId: string, requestedInfo: string[], message: string, adminUserId: string, deadline?: string, context?: Context): Promise<void>
```

### BrandService

```typescript
// Existing methods enhanced with permission checks at router level
async verifyBrand(brandId: string, adminId: string, notes?: string): Promise<Brand>
async rejectBrand(brandId: string, adminId: string, reason: string, notes?: string): Promise<Brand>

// New methods
async requestBrandInfo(brandId: string, requestedInfo: string[], message: string, adminId: string, deadline?: string): Promise<void>
```

## Validation Schemas

### Creator Schemas

```typescript
// Existing
approveCreatorSchema: { id: string }
rejectCreatorSchema: { id: string, reason: string(10-500 chars) }

// New
verifyCreatorSchema: { id: string, notes?: string(max 1000 chars) }
requestCreatorInfoSchema: {
  id: string,
  requestedInfo: string[](min 1),
  message: string(20-1000 chars),
  deadline?: string(datetime)
}
```

### Brand Schemas

```typescript
// Existing
verifyBrandSchema: { id: string, notes?: string }
rejectBrandSchema: { id: string, reason: string(min 10 chars), notes?: string }

// New
requestBrandInfoSchema: {
  id: string,
  requestedInfo: string[](min 1),
  message: string(20-1000 chars),
  deadline?: string(datetime)
}
```

## Audit Logging

All permission-controlled actions are logged to the audit system with the following information:

- User ID of the admin performing the action
- Action type (e.g., `creator.approved`, `brand.info_requested`)
- Entity type and ID (creator or brand)
- Metadata (reason for rejection, requested info, verification notes)
- IP address and user agent (when available)
- Timestamp

### Audit Event Types

**Creator Events:**
- `creator.approved` - Creator application approved
- `creator.rejected` - Creator application rejected
- `creator.credentials_verified` - Creator credentials verified
- `creator.info_requested` - Additional information requested from creator

**Brand Events:**
- `brand.verified` - Brand application verified
- `brand.rejected` - Brand application rejected
- `brand.info_requested` - Additional information requested from brand

## Integration with Existing Systems

### Permission Service

All permission checks utilize the existing `PermissionService` with request-level caching for optimal performance. The service:

- Checks user's role and department assignments
- Validates permission against role-based permissions
- Supports hierarchical permission inheritance
- Caches permission results in Redis (5-minute TTL)
- Logs permission denials for security monitoring

### tRPC Middleware

Permission enforcement is implemented using the `requirePermission` middleware:

```typescript
import { requirePermission } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/lib/constants/permissions';

const endpoint = adminProcedure
  .use(requirePermission(PERMISSIONS.CREATOR_APPLICATION_APPROVE))
  .mutation(async ({ input, ctx }) => {
    // Handler logic
  });
```

This middleware:
- Validates user authentication
- Checks for specific permission
- Throws `FORBIDDEN` error if permission denied
- Logs permission denial with audit service
- Provides custom error messages when specified

### Role Assignment Integration

When applications are approved, the system automatically assigns the appropriate role:

**Creator Approval:**
- Updates `verificationStatus` to 'approved'
- Sets `verifiedAt` timestamp
- Assigns `CREATOR` role to user via `RoleAssignmentService`
- Triggers onboarding workflows

**Brand Approval:**
- Updates `verificationStatus` to 'verified'
- Sets `verifiedAt` timestamp and `isVerified` flag
- Assigns `BRAND` role to user via `RoleAssignmentService`
- Triggers onboarding workflows

## Email Notifications

### Creator Notifications

- **Approval**: Welcome email with platform access details
- **Rejection**: Rejection notification with reason and support contact
- **Info Request**: Request for additional information with deadline (if specified)

### Brand Notifications

- **Verification**: Verification complete email with dashboard access
- **Rejection**: Rejection notification with reason and support contact
- **Info Request**: Request for additional information with deadline (if specified)

## Security Considerations

1. **Permission Isolation**: Creator and brand application permissions are separate, preventing cross-contamination of access rights

2. **Audit Trail**: All administrative actions are logged with full context for compliance and accountability

3. **Role-Based Access**: Permissions are granted through department roles, not directly to users, simplifying permission management

4. **Hierarchical Enforcement**: Higher-level permissions automatically include lower-level permissions, preventing permission gaps

5. **Request Context**: All service methods accept context parameters for IP address and user agent tracking

## Usage Examples

### Assigning Application Review Permissions

```typescript
import { adminRoleService } from '@/lib/utils/admin-role.utils';

// Create a creator application reviewer
await adminRoleService.createAdminRole({
  userId: 'user_123',
  department: 'CREATOR_APPLICATIONS',
  seniority: 'SENIOR',
  permissions: [
    'creator:review',
    'creator:approve',
    'creator:reject',
    'creator:verify',
    'creator:request_info',
  ],
  isActive: true,
}, 'admin_456');

// Create a brand application reviewer
await adminRoleService.createAdminRole({
  userId: 'user_789',
  department: 'BRAND_APPLICATIONS',
  seniority: 'JUNIOR',
  permissions: [
    'brand:review',
    'brand:request_info', // Junior can only review and request info
  ],
  isActive: true,
}, 'admin_456');
```

### Checking Permissions

```typescript
import { permissionService } from '@/lib/permissions';

// Check if user can approve creators
const canApprove = await permissionService.hasPermission(
  userId,
  PERMISSIONS.CREATOR_APPLICATION_APPROVE
);

// Check if user has any approval permission
const canApproveAny = await permissionService.hasAnyPermission(
  userId,
  [
    PERMISSIONS.CREATOR_APPLICATION_APPROVE,
    PERMISSIONS.BRAND_APPLICATION_APPROVE,
  ]
);
```

## Migration Notes

No database migrations were required for this implementation as:

1. Permissions are stored in JSON fields in existing `AdminRole` model
2. New permissions follow existing naming conventions
3. Audit logging uses existing `AuditEvent` model
4. Creator and Brand models already support verification workflows

## Testing Recommendations

1. **Permission Checks**: Verify each endpoint properly enforces its required permission
2. **Hierarchy**: Confirm higher-level permissions grant lower-level access
3. **Department Roles**: Test that department assignments include all expected permissions
4. **Audit Logs**: Validate all actions create appropriate audit entries
5. **Email Notifications**: Confirm emails are sent for all relevant actions
6. **Error Handling**: Test permission denial error messages and codes
7. **Role Assignment**: Verify automatic role assignment on approval

## Files Modified

### Core Permission System
- `/src/lib/constants/permissions.ts` - Added 10 new permission constants and descriptions
- Updated permission hierarchy
- Updated department role mappings

### Creator Module
- `/src/modules/creators/schemas/creator.schema.ts` - Added `verifyCreatorSchema` and `requestCreatorInfoSchema`
- `/src/modules/creators/services/creator.service.ts` - Added `verifyCreator()` and `requestCreatorInfo()` methods
- `/src/modules/creators/routers/creators.router.ts` - Added permission middleware to all admin endpoints
- `/src/modules/creators/index.ts` - Exported new schemas and types

### Brand Module
- `/src/modules/brands/schemas/brand.schema.ts` - Added `requestBrandInfoSchema`
- `/src/modules/brands/services/brand.service.ts` - Added `requestBrandInfo()` method
- `/src/modules/brands/routers/brands.router.ts` - Added permission middleware and `requestInfo` endpoint
- Brand module already uses wildcard exports, so new schema is automatically exported

## Future Enhancements

1. **Workflow States**: Implement formal state machine for application workflows
2. **Bulk Operations**: Add endpoints for bulk approve/reject with permission checks
3. **Delegation**: Allow senior reviewers to delegate review tasks to junior staff
4. **SLA Tracking**: Monitor time-to-review metrics per reviewer
5. **Notification Templates**: Create dedicated email templates for info requests
6. **Frontend Integration**: Build admin UI components that respect permission visibility
7. **Analytics**: Track approval rates and reviewer performance by department

## Conclusion

The application permissions system is now fully implemented and integrated with the existing admin role and permission infrastructure. All creator and brand application workflows now have granular permission controls that support the platform's gatekeeping requirements while maintaining security and audit compliance.
