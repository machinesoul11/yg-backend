/**
 * Authentication Validation Schemas
 * Zod schemas for validating authentication-related inputs
 */

import { z } from 'zod';
import { validatePasswordStrength } from '@/lib/auth/password';

/**
 * Password validation schema
 * Requirements:
 * - Minimum 12 characters (enhanced from 8)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * - Not a common weak password
 * - No sequential or repeated characters
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(100, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character'
  )
  .refine((password) => {
    // Additional security validation
    const errors = validatePasswordStrength(password);
    return errors.length === 0;
  }, {
    message: 'Password does not meet security requirements'
  });

/**
 * Email validation schema
 * Normalizes email to lowercase and trims whitespace
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

/**
 * User role schema
 * Valid roles in the system
 */
export const roleSchema = z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER']);

/**
 * Self-registration role schema
 * Users cannot self-register as ADMIN
 */
export const selfRegisterRoleSchema = z.enum(['CREATOR', 'BRAND']);

/**
 * User registration schema
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(255).optional(),
  role: selfRegisterRoleSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Email verification schema
 */
export const verifyEmailSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Password reset request schema
 */
export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

/**
 * Password reset schema
 */
export const resetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Profile update schema
 */
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatar: z.string().url().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Resend verification email schema
 */
export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * TOTP code validation schema
 * 6-digit code with optional whitespace
 */
export const totpCodeSchema = z
  .string()
  .min(6, 'TOTP code must be 6 digits')
  .max(10, 'TOTP code is too long') // Allow for spaces
  .regex(/^[0-9\s]+$/, 'TOTP code must contain only digits')
  .transform((code) => code.replace(/\s/g, '')) // Remove whitespace
  .refine((code) => code.length === 6, {
    message: 'TOTP code must be exactly 6 digits',
  });

/**
 * TOTP verification schema
 */
export const verifyTotpSchema = z.object({
  code: totpCodeSchema,
});

export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;

/**
 * TOTP setup confirmation schema
 */
export const confirmTotpSetupSchema = z.object({
  code: totpCodeSchema,
});

export type ConfirmTotpSetupInput = z.infer<typeof confirmTotpSetupSchema>;

/**
 * TOTP disable schema
 */
export const disableTotpSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: totpCodeSchema.optional(),
});

export type DisableTotpInput = z.infer<typeof disableTotpSchema>;

/**
 * Backup code verification schema
 */
export const verifyBackupCodeSchema = z.object({
  code: z
    .string()
    .min(8, 'Backup code must be at least 8 characters')
    .max(20, 'Backup code is too long')
    .transform((code) => code.replace(/\s/g, '').toUpperCase()),
});

export type VerifyBackupCodeInput = z.infer<typeof verifyBackupCodeSchema>;

/**
 * TOTP login verification schema
 * Used during login flow when TOTP is enabled
 */
export const totpLoginVerificationSchema = z.object({
  code: totpCodeSchema,
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Multi-step login: Verify 2FA challenge with temporary token
 */
export const verify2FALoginSchema = z.object({
  temporaryToken: z.string().min(32, 'Invalid temporary token'),
  code: totpCodeSchema,
  trustDevice: z.boolean().optional().default(false),
});

export type Verify2FALoginInput = z.infer<typeof verify2FALoginSchema>;

/**
 * Verify backup code during multi-step login
 */
export const verifyBackupCodeLoginSchema = z.object({
  temporaryToken: z.string().min(32, 'Invalid temporary token'),
  code: z
    .string()
    .min(8, 'Backup code must be at least 8 characters')
    .max(20, 'Backup code is too long')
    .transform((code) => code.replace(/\s/g, '').toUpperCase()),
  trustDevice: z.boolean().optional().default(false),
});

export type VerifyBackupCodeLoginInput = z.infer<typeof verifyBackupCodeLoginSchema>;

/**
 * Revoke a specific trusted device
 */
export const revokeTrustedDeviceSchema = z.object({
  deviceId: z.string().cuid('Invalid device ID'),
});

export type RevokeTrustedDeviceInput = z.infer<typeof revokeTrustedDeviceSchema>;

/**
 * Login with trusted device token
 */
export const loginWithTrustedDeviceSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  trustedDeviceToken: z.string().min(32, 'Invalid device token'),
  rememberMe: z.boolean().optional().default(false),
});

/**
 * 2FA Method enum for validation
 */
export const twoFactorMethodEnum = z.enum(['SMS', 'AUTHENTICATOR']);

/**
 * Set preferred 2FA method schema
 * User must have both methods enabled before setting preference
 */
export const setPreferred2FAMethodSchema = z.object({
  method: twoFactorMethodEnum,
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
});

export type SetPreferred2FAMethodInput = z.infer<typeof setPreferred2FAMethodSchema>;

/**
 * Remove 2FA method schema
 * Requires verification code from the method that will remain active
 */
export const remove2FAMethodSchema = z.object({
  methodToRemove: twoFactorMethodEnum,
  verificationCode: z.string().length(6, 'Verification code must be 6 digits'),
});

export type Remove2FAMethodInput = z.infer<typeof remove2FAMethodSchema>;

/**
 * Switch 2FA method during login challenge
 */
export const switchChallengeMethodSchema = z.object({
  challengeToken: z.string().min(32, 'Invalid challenge token'),
  newMethod: twoFactorMethodEnum,
});

export type SwitchChallengeMethodInput = z.infer<typeof switchChallengeMethodSchema>;

export type LoginWithTrustedDeviceInput = z.infer<typeof loginWithTrustedDeviceSchema>;
