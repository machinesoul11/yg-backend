/**
 * Permission System Exports
 * 
 * Central export point for all permission-related utilities
 */

// Permission constants and utilities
export {
  PERMISSIONS,
  PERMISSION_HIERARCHY,
  ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  getRolePermissions,
  roleHasPermission,
  roleHasAnyPermission,
  roleHasAllPermissions,
  getPermissionsByCategory,
  expandPermission,
  type Permission,
} from './constants/permissions';

// Role Templates
export {
  ROLE_TEMPLATES,
  getRoleTemplate,
  applyRoleTemplate,
  getRestrictedPermissions,
  isPermissionAllowed,
  isPermissionRestricted,
  getRoleDescription,
  listAllRoleTemplates,
  compareRoleTemplates,
  type RoleTemplate,
  type RoleTemplateDepartment,
  type RoleTemplateSeniority,
} from '../permissions/roleTemplates';

// Approval Rules and Requirements
export {
  REQUIRES_SENIOR_APPROVAL,
  PAYOUT_APPROVAL_THRESHOLD,
  ROYALTY_RETROACTIVE_THRESHOLD_DAYS,
  requiresApproval,
  canApprove,
  createApprovalRequest,
  getPendingApprovalsForUser,
  approveRequest,
  rejectRequest,
  getApprovalRequest,
  getApprovalStatistics,
  type ApprovalRequirement,
  type ApprovalRequest,
} from '../permissions/approvalRules';

// Permission service
export {
  PermissionService,
  type ResourceAction,
  type FieldPermissionResult,
} from './services/permission.service';

// Field-level permissions
export {
  filterFieldsByPermissions,
  canReadField,
  canWriteField,
  validateFieldWrites,
  getFieldMetadata,
  FIELD_PERMISSIONS,
  type FieldPermissionConfig,
  type ResourceFieldPermissions,
} from './utils/field-permissions';

// tRPC middleware
export {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireResourceAccess,
  initPermissionCache,
} from './middleware/permissions';

// Create singleton permission service instance for convenience
import { PermissionService } from './services/permission.service';
import { AuditService } from './services/audit.service';
import { prisma } from './db';

const auditService = new AuditService(prisma);
export const permissionService = new PermissionService(prisma, auditService);
