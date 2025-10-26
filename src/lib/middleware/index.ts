/**
 * Access Control Middleware Module
 * Central export point for all authentication and authorization middleware
 * 
 * This module provides a comprehensive access control system including:
 * - Authentication (session, JWT, API keys, service tokens)
 * - Authorization (role-based, permission-based)
 * - Resource ownership verification
 * - Webhook signature verification
 * - Service-to-service authentication
 */

// ============================================================================
// Authentication Middleware
// ============================================================================

export {
  authenticateRequest,
  requireAuth,
  type AuthUser,
  type AuthResult,
} from './auth.middleware';

// ============================================================================
// Authorization Middleware
// ============================================================================

export {
  checkRole,
  checkPermission,
  requireRole,
  requirePermission,
  withRole,
  withPermission,
  requireAdmin,
  requireCreator,
  requireBrand,
  createAuthorizationError,
  type AuthorizationResult,
  type RoleAuthOptions,
  type PermissionAuthOptions,
} from './authorization.middleware';

// ============================================================================
// Admin Role Authorization Middleware
// ============================================================================

export {
  checkAdminRolePermission,
  checkAnyAdminRolePermission,
  checkAdminDepartment,
  checkSuperAdmin,
  requireAdminPermission,
  requireDepartment,
  requireSuperAdmin,
  withAdminPermission,
  withDepartment,
  withSuperAdmin,
  createAdminRoleError,
  requireAdminPermissionTRPC,
  requireDepartmentTRPC,
  requireSuperAdminTRPC,
  type AdminRoleAuthResult,
} from './admin-role.middleware';

// ============================================================================
// Resource Ownership Middleware
// ============================================================================

export {
  verifyOwnership,
  requireOwnership,
  invalidateOwnershipCache,
  type ResourceType,
  type OwnershipResult,
  type OwnershipOptions,
} from './resource-ownership.middleware';

// ============================================================================
// API Key Authentication
// ============================================================================

export {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  validateApiKey,
  createApiKey,
  hasScope,
  revokeApiKey,
  listApiKeys,
  rotateApiKey,
  invalidateApiKeyCache,
  type ApiKeyScope,
  type ApiKeyStatus,
  type ApiKeyInfo,
  type ApiKeyValidationResult,
} from './api-key.middleware';

// ============================================================================
// Service Authentication
// ============================================================================

export {
  generateServiceToken,
  validateServiceToken,
  generateRequestSignature,
  verifyRequestSignature,
  authenticateServiceRequest,
  requireServiceAuth,
  initializeServiceToken,
  rotateServiceToken,
  type ServiceIdentity,
  type ServiceAuthResult,
} from './service-auth.middleware';

// ============================================================================
// Webhook Verification
// ============================================================================

export {
  verifyStripeWebhook,
  verifyResendWebhook,
  verifyGenericWebhook,
  verifyWebhook,
  markWebhookProcessed,
  requireWebhookVerification,
  type WebhookProvider,
  type WebhookVerificationResult,
  type WebhookVerificationOptions,
} from './webhook-verification.middleware';

// ============================================================================
// Email Rate Limiting (existing)
// ============================================================================

export {
  checkEmailRateLimit,
  checkCampaignRateLimit,
  type EmailRateLimitResult,
} from './email-rate-limit';

// ============================================================================
// Permission Middleware for tRPC (existing)
// ============================================================================

export {
  requirePermission as requirePermissionTRPC,
  requireAnyPermission,
  requireAllPermissions,
} from './permissions';

// ============================================================================
// Approval Workflow Middleware for tRPC
// ============================================================================

export {
  requireApprovalOrExecute,
  requireSenior,
  isApprovalRequired,
  permissionService as approvalPermissionService,
  type ApprovalOrExecuteConfig,
  type ApprovalRequiredResponse,
} from './approval.middleware';

// ============================================================================
// Admin Rate Limiting
// ============================================================================

export {
  withAdminRateLimit,
  withRoleManagementRateLimit,
  withApprovalActionRateLimit,
  withReadOperationRateLimit,
} from './admin-rate-limit.middleware';

// ============================================================================
// Admin Session Security
// ============================================================================

export {
  checkAdminSessionTimeout,
  requireRecent2FA,
} from './admin-session-timeout.middleware';

// ============================================================================
// Security Monitoring
// ============================================================================

export {
  withSecurityMonitoring,
  logApprovalAction,
  logPermissionEscalation,
  securityMonitoringService,
} from './security-monitoring.middleware';
