/**
 * Authentication Module Exports
 * Central export point for all authentication-related functionality
 */

// Core authentication service
export { AuthService } from '../services/auth.service';
export type { RegisterOutput, LoginOutput } from '../services/auth.service';

// Password security utilities
export {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
  generateSecureToken,
  hashToken,
} from './password';

// Password history management
export { PasswordHistoryService } from './password-history.service';

// Account lockout management
export { AccountLockoutService } from './account-lockout.service';
export type { LockoutStatus } from './account-lockout.service';

// Remember me functionality
export { RememberMeService } from './remember-me.service';
export type {
  CreateRememberMeTokenOptions,
  RememberMeTokenInfo,
} from './remember-me.service';

// Validators
export {
  passwordSchema,
  emailSchema,
  roleSchema,
  selfRegisterRoleSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  resendVerificationSchema,
} from '../validators/auth.validators';

export type {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
  ResendVerificationInput,
} from '../validators/auth.validators';

// Error classes
export { AuthError, AuthErrors, isAuthError } from '../errors/auth.errors';

// Audit service
export { AuditService, AUDIT_ACTIONS } from '../services/audit.service';
